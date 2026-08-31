import { test, expect, describe, mock, beforeEach } from 'bun:test';
import { StellarAppKit } from '../src/client.js';
import { createFreighterConnector } from '../src/connectors/freighter.js';

/**
 * Tests for the wallet-sign retry — the machinery behind the modals'
 * signing-error "Try again" button:
 *
 * - runRetryableSign arms retryLastSign() ONLY when the wallet call itself
 *   fails (never for a preview rejection — the user said no, the request
 *   must stay dead).
 * - retryLastSign() re-drives the wallet-side half through the normal sign
 *   queue: the pendingSignCount events fire again, a failure re-fires the
 *   error event, and a successful retry emits 'signRetried' with the result
 *   and its kind (the original promise already rejected and cannot be
 *   resurrected — the event is the only channel carrying the result).
 * - A new sign supersedes a pending retry; disconnect tears it down.
 *
 * The wallet connector is the real Freighter adapter over a mocked
 * freighter-api, so these tests cover the full client wiring. The
 * connection-recovery behavior inside the Freighter adapter is covered in
 * freighter.test.ts.
 */

type FreighterApi = {
  isConnected: () => Promise<{ isConnected: boolean; error?: string }>;
  setAllowed: () => Promise<unknown>;
  getAddress: () => Promise<{ address: string; error?: string }>;
  getNetworkDetails: () => Promise<{ network: string; networkPassphrase: string; error?: string }>;
  signMessage: (m: string, o?: unknown) => Promise<{ signedMessage: Buffer | string; signerAddress: string; error?: string }>;
  signTransaction: (x: string, o?: unknown) => Promise<{ signedTxXdr: string; signerAddress: string; error?: string }>;
  signAuthEntry: (e: string, o?: unknown) => Promise<{ signedAuthEntry: Buffer | string; signerAddress: string; error?: string }>;
};

const ADDRESS = 'GA2C5RFPE6GCKMY3US5PAB6UZLKIGSPIUKSLRB6Q3IY7ZP4PAOMM43YA';

const defaults: FreighterApi = {
  isConnected: async () => ({ isConnected: true, error: undefined }),
  setAllowed: async () => ({}),
  getAddress: async () => ({ address: ADDRESS }),
  getNetworkDetails: async () => ({ network: 'TESTNET', networkPassphrase: 'Test SDF Network ; September 2015' }),
  signTransaction: async () => ({ signedTxXdr: 'signed-xdr', signerAddress: ADDRESS }),
  signMessage: async () => ({ signedMessage: Buffer.alloc(64), signerAddress: ADDRESS }),
  // Never driven by these tests — but the mock MUST register the full API
  // surface: bun merges mock.module registrations process-wide and a key
  // missing from the first materialized namespace can't be re-added by a
  // later file (freighter.test.ts's own signAuthEntry tests would see
  // `undefined`). House rule: every freighter-api mock carries all 7 keys.
  signAuthEntry: async () => ({ signedAuthEntry: Buffer.alloc(64), signerAddress: ADDRESS }),
};

let signCalls: { fn: 'tx' | 'msg'; arg: string }[] = [];
let txResults: Array<{ signedTxXdr: string; signerAddress: string; error?: string }> = [];
let msgResults: Array<{ signedMessage: Buffer | string; signerAddress: string; error?: string }> = [];
let setAllowedCalls = 0;

mock.module('@stellar/freighter-api', () => ({
  isConnected: () => defaults.isConnected(),
  setAllowed: () => {
    setAllowedCalls++;
    return defaults.setAllowed();
  },
  getAddress: () => defaults.getAddress(),
  getNetworkDetails: () => defaults.getNetworkDetails(),
  signTransaction: (x: string) => {
    signCalls.push({ fn: 'tx', arg: x });
    const r = txResults.shift() ?? { signedTxXdr: 'signed-xdr', signerAddress: ADDRESS };
    if (r.error) return Promise.resolve({ signedTxXdr: '', signerAddress: '', error: r.error });
    return Promise.resolve(r);
  },
  signMessage: (m: string) => {
    signCalls.push({ fn: 'msg', arg: m });
    const r = msgResults.shift() ?? { signedMessage: Buffer.alloc(64), signerAddress: ADDRESS };
    if (r.error) return Promise.resolve({ signedMessage: '', signerAddress: '', error: r.error });
    return Promise.resolve(r);
  },
  // Full-surface registration (see the comment on defaults.signAuthEntry) —
  // these tests never drive it, so it just resolves the default.
  signAuthEntry: (e: string) => {
    signCalls.push({ fn: 'auth', arg: e });
    return defaults.signAuthEntry(e);
  },
}));;

beforeEach(() => {
  signCalls = [];
  txResults = [];
  msgResults = [];
  setAllowedCalls = 0;
  (globalThis as unknown as { freighter?: boolean }).freighter = true;
});

const CONNECTION_LOST = 'Connection not found. Please try creating a new connection or switch to another account which has the connection in your Freighter wallet.';

async function makeConnectedAppkit(): Promise<StellarAppKit> {
  const appkit = new StellarAppKit({
    connectors: [createFreighterConnector()],
    network: 'TESTNET',
    appMetadata: { name: 'Test', domain: 'localhost', uri: 'http://localhost:3000' },
  });
  await appkit.connect('freighter');
  // connect() itself runs the setAllowed handshake — reset the counter so
  // tests count only the sign-recovery handshakes.
  setAllowedCalls = 0;
  return appkit;
}

/** A real (unsigned) testnet payment XDR — valid enough for the preview decoder. */
async function buildTxXdr(): Promise<string> {
  const sdk = await import('@stellar/stellar-sdk');
  // Random (valid checksum) source account — it only needs to decode, and
  // it must NOT be the mocked wallet address (that fixture isn't a valid
  // ed25519 key and Account validates the checksum).
  const account = new sdk.Account(sdk.Keypair.random().publicKey(), '8589934592');
  return new sdk.TransactionBuilder(account, {
    fee: '100',
    networkPassphrase: sdk.Networks.TESTNET,
  })
    .addOperation(sdk.Operation.payment({ destination: sdk.Keypair.random().publicKey(), asset: sdk.Asset.native(), amount: '5' }))
    .setTimeout(30)
    .build()
    .toXDR();
}

describe('retryLastSign — the signing-error "Try again" machinery', () => {
  test('returns false when nothing failed yet', async () => {
    const appkit = await makeConnectedAppkit();
    expect(appkit.retryLastSign()).toBe(false);
  });

  test('a wallet failure arms the retry; retryLastSign re-drives the wallet and emits signRetried', async () => {
    const appkit = await makeConnectedAppkit();
    const xdr = await buildTxXdr();

    const queueCounts: number[] = [];
    appkit.on('signQueueChange', (n) => queueCounts.push(n));
    const errors: string[] = [];
    appkit.on('error', (e) => errors.push(e.message));
    const retried: Array<{ kind: string; result: unknown }> = [];
    appkit.on('signRetried', (e) => retried.push({ kind: e.kind, result: e.result }));

    // First attempt: the wallet reports a lost connection. The adapter's
    // connection recovery (setAllowed + one re-ask) also fails — both wallet
    // calls reject with the same error, which is the shape a genuinely
    // revoked connection produces.
    txResults.push({ signedTxXdr: '', signerAddress: '', error: CONNECTION_LOST });
    txResults.push({ signedTxXdr: '', signerAddress: '', error: CONNECTION_LOST });

    await expect(appkit.signTransaction(xdr)).rejects.toThrow(/Connection not found/);

    // The wallet was asked, the adapter re-established access once, and the
    // second ask failed too — the app promise rejected, one error event fired.
    expect(signCalls.filter((c) => c.fn === 'tx')).toHaveLength(2);
    expect(setAllowedCalls).toBe(1);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/Connection not found/);

    // "Try again": the wallet succeeds this time.
    txResults.push({ signedTxXdr: 'signed-on-retry', signerAddress: ADDRESS });
    expect(appkit.retryLastSign()).toBe(true);

    // The re-drive runs on the sign chain — give it a tick to land before
    // asserting on wallet calls / events.
    await new Promise((r) => setTimeout(r, 10));

    // The retry re-drove the wallet call through the queue (queue counts
    // 0→1→0 for the first attempt, then 0→1→0 again for the retry).
    expect(signCalls.filter((c) => c.fn === 'tx')).toHaveLength(3);
    expect(appkit.pendingSignCount).toBe(0);

    // The retry result arrived via the event (the original promise cannot
    // be resurrected).
    expect(retried).toHaveLength(1);
    expect(retried[0]!.kind).toBe('transaction');
    expect((retried[0]!.result as { signedTxXdr: string }).signedTxXdr).toBe('signed-on-retry');

    // Queue churn: two full request cycles.
    expect(queueCounts).toEqual([1, 0, 1, 0]);
  });

  test('the retried sign skipped the preview — the user re-approved it in the modal', async () => {
    const appkit = await makeConnectedAppkit();
    const xdr = await buildTxXdr();

    let previewCalls = 0;
    appkit.onPreviewTransaction = async () => {
      previewCalls++;
      return true;
    };

    txResults.push({ signedTxXdr: '', signerAddress: '', error: 'Wallet blew up' });
    txResults.push({ signedTxXdr: '', signerAddress: '', error: 'Wallet blew up' });
    await expect(appkit.signTransaction(xdr)).rejects.toThrow();

    // The modal re-shows the preview itself; the core's retry must NOT
    // trigger onPreviewTransaction again (double-preview bug).
    txResults.push({ signedTxXdr: 'signed-on-retry', signerAddress: ADDRESS });
    appkit.retryLastSign();
    await new Promise((r) => setTimeout(r, 10));

    expect(previewCalls).toBe(1);
  });

  test('a preview rejection never arms the retry', async () => {
    const appkit = await makeConnectedAppkit();
    const xdr = await buildTxXdr();
    appkit.onPreviewTransaction = async () => false; // user declines in the modal

    await expect(appkit.signTransaction(xdr)).rejects.toThrow();

    // The wallet never saw the request, and there is nothing to retry —
    // retrying must NOT bypass the user's decision.
    expect(signCalls.filter((c) => c.fn === 'tx')).toHaveLength(0);
    expect(appkit.retryLastSign()).toBe(false);
  });

  test('a failed retry re-arms for another "Try again"', async () => {
    const appkit = await makeConnectedAppkit();

    // signMessage path — synthetic preview, wallet fails.
    msgResults.push({ signedMessage: '', signerAddress: '', error: 'Wallet blew up' });
    await expect(appkit.signMessage('hello')).rejects.toThrow();

    // First retry: fails again.
    msgResults.push({ signedMessage: '', signerAddress: '', error: 'Still failing' });
    expect(appkit.retryLastSign()).toBe(true);
    const errors: string[] = [];
    appkit.on('error', (e) => errors.push(e.message));
    await new Promise((r) => setTimeout(r, 10));
    expect(appkit.retryLastSign()).toBe(true); // re-armed

    // Second retry: succeeds — the signRetried event fires with kind 'message'.
    msgResults.push({ signedMessage: Buffer.alloc(64), signerAddress: ADDRESS });
    const retried: Array<{ kind: string }> = [];
    appkit.on('signRetried', (e) => retried.push({ kind: e.kind }));
    await new Promise((r) => setTimeout(r, 10));

    expect(retried).toEqual([{ kind: 'message' }]);
    expect(signCalls.filter((c) => c.fn === 'msg')).toHaveLength(3);
    expect(errors).toHaveLength(1); // the first retry's failure
  });

  test('a newer successful sign supersedes a pending retry', async () => {
    const appkit = await makeConnectedAppkit();
    const xdr = await buildTxXdr();

    txResults.push({ signedTxXdr: '', signerAddress: '', error: 'Wallet blew up' });
    await expect(appkit.signTransaction(xdr)).rejects.toThrow();

    // A NEW sign comes in before the user retries — it succeeds.
    txResults.push({ signedTxXdr: 'newer-sign', signerAddress: ADDRESS });
    await appkit.signTransaction(xdr, { skipPreview: true });

    // The old failure is superseded — nothing to retry.
    expect(appkit.retryLastSign()).toBe(false);
  });

  test('disconnect tears down a pending retry', async () => {
    const appkit = await makeConnectedAppkit();
    const xdr = await buildTxXdr();

    txResults.push({ signedTxXdr: '', signerAddress: '', error: 'Wallet blew up' });
    await expect(appkit.signTransaction(xdr)).rejects.toThrow();

    await appkit.disconnect();
    expect(appkit.retryLastSign()).toBe(false);
  });

  test('retryLastSign is idempotent — one click, one rerun', async () => {
    const appkit = await makeConnectedAppkit();

    msgResults.push({ signedMessage: '', signerAddress: '', error: 'Wallet blew up' });
    await expect(appkit.signMessage('hello')).rejects.toThrow();

    expect(appkit.retryLastSign()).toBe(true);
    // Second click without a failure in between: nothing left to drive.
    expect(appkit.retryLastSign()).toBe(false);
    expect(signCalls.filter((c) => c.fn === 'msg')).toHaveLength(1);
  });
});
