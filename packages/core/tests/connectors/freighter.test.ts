import { test, expect, describe, mock, beforeEach } from 'bun:test';
import { createFreighterConnector } from '../../src/connectors/freighter.js';

/**
 * Freighter is a SEP-43-style direct signer: it signs the raw UTF-8 bytes
 * of the message string passed in. The connector must surface those bytes
 * as `signedData = base64(utf8(message))` so the verifier uses the same
 * code path as every other direct signer (Ledger, future SEP-43 wallets).
 *
 * These tests mock `@stellar/freighter-api` so we can assert exactly what
 * the connector does with the SDK's response.
 */

// Type describing the subset of the freighter-api we exercise.
type FreighterApi = {
  isConnected: () => Promise<{ error?: string }>;
  setAllowed: () => Promise<unknown>;
  getAddress: () => Promise<{ address: string; error?: string }>;
  getNetworkDetails: () => Promise<{ network: string; networkPassphrase: string; error?: string }>;
  signTransaction: (xdr: string, opts?: unknown) => Promise<{ signedTxXdr: string; signerAddress: string; error?: string }>;
  signAuthEntry: (entry: string, opts?: unknown) => Promise<{ signedAuthEntry: Buffer | string; signerAddress: string; error?: string }>;
  signMessage: (message: string, opts?: unknown) => Promise<{ signedMessage: Buffer | string; signerAddress: string; error?: string }>;
};

// Per-test override — each test sets this to whatever fake response it wants.
let fakeApi: Partial<FreighterApi> = {};

// Default implementations used when a test doesn't override a method.
const defaults: FreighterApi = {
  isConnected: async () => ({ error: undefined }),
  setAllowed: async () => ({}),
  getAddress: async () => ({ address: 'GA2C5RFPE6GCKMY3US5PAB6UZLKIGSPIUKSLRB6Q3IY7ZP4PAOMM43YA' }),
  getNetworkDetails: async () => ({
    network: 'TESTNET',
    networkPassphrase: 'Test SDF Network ; September 2015',
  }),
  signTransaction: async () => ({ signedTxXdr: 'xdr', signerAddress: 'GA2C5RFPE6GCKMY3US5PAB6UZLKIGSPIUKSLRB6Q3IY7ZP4PAOMM43YA' }),
  signAuthEntry: async () => ({ signedAuthEntry: Buffer.alloc(64), signerAddress: 'GA2C5RFPE6GCKMY3US5PAB6UZLKIGSPIUKSLRB6Q3IY7ZP4PAOMM43YA' }),
  signMessage: async () => ({ signedMessage: Buffer.alloc(64), signerAddress: 'GA2C5RFPE6GCKMY3US5PAB6UZLKIGSPIUKSLRB6Q3IY7ZP4PAOMM43YA' }),
};

// Mock the dynamic `import('@stellar/freighter-api')` used inside the connector.
// We return stable function references that delegate to `fakeApi.<method>`
// at CALL time — this way each test can mutate `fakeApi` in setup and the
// connector sees the new value when it calls the method.
mock.module('@stellar/freighter-api', () => ({
  isConnected: (...args: unknown[]) => (fakeApi.isConnected ?? defaults.isConnected)(...args),
  setAllowed: (...args: unknown[]) => (fakeApi.setAllowed ?? defaults.setAllowed)(...args),
  getAddress: (...args: unknown[]) => (fakeApi.getAddress ?? defaults.getAddress)(...args),
  getNetworkDetails: (...args: unknown[]) => (fakeApi.getNetworkDetails ?? defaults.getNetworkDetails)(...args),
  signTransaction: (...args: unknown[]) => (fakeApi.signTransaction ?? defaults.signTransaction)(...args[0] === undefined ? [] : [args[0] as string, args[1]]),
  signAuthEntry: (...args: unknown[]) => (fakeApi.signAuthEntry ?? defaults.signAuthEntry)(args[0] as string, args[1]),
  signMessage: (...args: unknown[]) => (fakeApi.signMessage ?? defaults.signMessage)(args[0] as string, args[1]),
}));

beforeEach(() => {
  fakeApi = {};
});

describe('createFreighterConnector — signMessage', () => {
  const message = 'localhost wants you to sign in with your Stellar account:\nG...\n\nStatement: x';
  const address = 'GA2C5RFPE6GCKMY3US5PAB6UZLKIGSPIUKSLRB6Q3IY7ZP4PAOMM43YA';

  test('returns signedData = base64(sha256("Stellar Signed Message:\\n" + message)) — SEP-0053', async () => {
    // Freighter uses SEP-0053 message encoding (confirmed by reading the
    // extension source at extension/src/helpers/stellar.ts):
    //   SIGN_MESSAGE_PREFIX = "Stellar Signed Message:\n"
    //   encodeSep53Message = (message) => sha256(prefix + utf8(message))
    // The connector must surface the SHA-256 hash of the prefixed message
    // as `signedData`, so the verifier can verify against it directly.
    const fakeSig = Buffer.from('a'.repeat(64), 'ascii');
    fakeApi.signMessage = async () => ({
      signedMessage: fakeSig,
      signerAddress: address,
    });

    const connector = createFreighterConnector();
    const result = await connector.signMessage(message);

    expect(result.signedMessage).toBe(fakeSig.toString('base64'));
    expect(result.signerAddress).toBe(address);

    // signedData = base64(sha256("Stellar Signed Message:\n" + utf8(message)))
    const { createHash } = await import('crypto');
    const prefix = Buffer.from('Stellar Signed Message:\n', 'utf-8');
    const msgBytes = Buffer.from(message, 'utf-8');
    const expectedHash = createHash('sha256').update(Buffer.concat([prefix, msgBytes])).digest();
    expect(result.signedData).toBe(expectedHash.toString('base64'));
  });

  test('passes the message and opts through to freighter-api', async () => {
    let capturedMessage: string | undefined;
    let capturedOpts: unknown;
    fakeApi.signMessage = async (msg: string, opts?: unknown) => {
      capturedMessage = msg;
      capturedOpts = opts;
      return { signedMessage: Buffer.alloc(64), signerAddress: address };
    };

    const connector = createFreighterConnector();
    await connector.signMessage(message, {
      networkPassphrase: 'Test SDF Network ; September 2015',
      address,
    });

    expect(capturedMessage).toBe(message);
    expect(capturedOpts).toEqual({
      networkPassphrase: 'Test SDF Network ; September 2015',
      address,
    });
  });

  test('accepts a string signedMessage (newer freighter-api shape) and passes it through', async () => {
    // Freighter shipped two response shapes: a raw Buffer (older) and an
    // already-encoded base64 string (newer). The connector must normalize
    // both to a string — strings pass through unchanged.
    const sigB64 = Buffer.alloc(64).fill(0x42).toString('base64');
    fakeApi.signMessage = async () => ({
      signedMessage: sigB64,
      signerAddress: address,
    });

    const connector = createFreighterConnector();
    const result = await connector.signMessage(message);

    expect(result.signedMessage).toBe(sigB64);
    // signedData is the SEP-0053 hash, not raw utf8(message)
    const { createHash } = await import('crypto');
    const prefix = Buffer.from('Stellar Signed Message:\n', 'utf-8');
    const msgBytes = Buffer.from(message, 'utf-8');
    const expectedHash = createHash('sha256').update(Buffer.concat([prefix, msgBytes])).digest();
    expect(result.signedData).toBe(expectedHash.toString('base64'));
  });

  test('throws ConnectError when freighter returns an empty signedMessage', async () => {
    // Some error paths in older freighter versions return signedMessage as
    // null/empty. The connector must surface this as a ConnectError rather
    // than silently returning garbage.
    fakeApi.signMessage = async () => ({
      signedMessage: '' as unknown as Buffer,
      signerAddress: address,
    });

    const connector = createFreighterConnector();
    expect(connector.signMessage(message)).rejects.toThrow(/empty signed message/);
  });

  test('normalizes freighter-api errors into ConnectError', async () => {
    // When the user rejects the sign prompt, freighter returns an error
    // field rather than throwing. The connector must translate that into
    // a ConnectError so app code never has to special-case freighter's
    // return shape.
    fakeApi.signMessage = async () => ({
      signedMessage: '',
      signerAddress: '',
      error: 'User rejected the request',
    });

    const connector = createFreighterConnector();
    expect(connector.signMessage(message)).rejects.toThrow(/rejected/i);
  });
});
