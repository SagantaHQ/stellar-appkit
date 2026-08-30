import { test, expect, describe, mock, beforeEach } from 'bun:test';
import { createWalletConnectConnector } from '../../src/connectors/walletconnect.js';

/**
 * Regression tests for the WalletConnect session-proposal / request flow.
 *
 * Background: @walletconnect/sign-client >= 2.17 validates every request()
 * method against the settled session's namespaces and logs ERROR-level
 * output before throwing:
 *
 *   ERROR request() -> isValidRequest() failed
 *   ERROR Missing or invalid. request() method: stellar_getNetwork
 *
 * The Stellar WalletConnect method set (per Freighter Mobile's docs —
 * docs.freighter.app/mobile-walletconnect — and freighter-mobile#815) is
 * exactly four signing methods; stellar_getNetwork is NOT among them, so
 * requesting it unconditionally produced the errors above on every connect.
 * The connector now (a) proposes optionalNamespaces only (requiredNamespaces
 * is deprecated and triggers a console WARN), and (b) pre-checks each
 * request() call against the methods the wallet actually approved.
 *
 * These tests mock @walletconnect/sign-client so we can assert exactly
 * which proposal shape we send and which requests we do/don't issue.
 */

const ADDRESS = 'GA2C5RFPE6GCKMY3US5PAB6UZLKIGSPIUKSLRB6Q3IY7ZP4PAOMM43YA';
const TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015';
const PUBNET_PASSPHRASE = 'Public Global Stellar Network ; September 2015';

type WCRequestCall = {
  topic: string;
  chainId: string;
  request: { method: string; params: unknown };
};

type WCConnectCall = {
  requiredNamespaces?: Record<string, unknown>;
  optionalNamespaces?: Record<string, { chains?: string[]; methods?: string[]; events?: string[] }>;
};

/** Methods the fake wallet approves in the settled session. */
let sessionMethods: string[] = [];
/** Accounts the fake wallet approves, as CAIP-10 strings. */
let sessionAccounts: string[] = [];
/** Captured wc.connect() arguments. */
let connectCalls: WCConnectCall[] = [];
/** Captured wc.request() arguments. */
let requestCalls: WCRequestCall[] = [];
/** How many times SignClient.init ran — the warm-up tests assert on it. */
let initCount = 0;
/** When set, SignClient.init rejects — warm-up failure simulation. */
let initError: Error | null = null;
/** When set, SignClient.init blocks on this promise — concurrency tests release it. */
let initBlocker: Promise<void> | null = null;
/** Per-method canned responses for wc.request(). */
let requestResponses: Record<string, unknown> = {};
/** When set, every wc.request() rejects with this error. */
let requestError: Error | null = null;

const fakeClient = {
  connect: async (opts: WCConnectCall) => {
    connectCalls.push(opts);
    return {
      uri: 'wc:9c4b0d13a1f97a15a7c43f6d1b0e2f8c7d5a4b3e2f1d0c9b8a7f6e5d4c3b2a1@2?relay=%7B%22protocol%22%3A%22irn%22%7D',
      approval: async () => ({
        topic: 'test-topic',
        namespaces: {
          stellar: {
            accounts: sessionAccounts,
            methods: sessionMethods,
          },
        },
        peer: { metadata: { name: 'Freighter', url: 'https://freighter.app', icons: [] } },
      }),
    };
  },
  request: async (opts: WCRequestCall) => {
    requestCalls.push(opts);
    if (requestError) throw requestError;
    return requestResponses[opts.request.method] ?? null;
  },
  disconnect: async () => {},
  on: () => {},
  removeListener: () => {},
  session: {
    get: () => undefined,
    keys: () => [] as string[],
    delete: async () => {},
  },
};

mock.module('@walletconnect/sign-client', () => ({
  SignClient: {
    init: async () => {
      initCount++;
      if (initBlocker) await initBlocker;
      if (initError) throw initError;
      return fakeClient;
    },
  },
}));

beforeEach(() => {
  // Default: the documented four-method Stellar WC wallet (Freighter Mobile).
  sessionMethods = [
    'stellar_signXDR',
    'stellar_signAndSubmitXDR',
    'stellar_signMessage',
    'stellar_signAuthEntry',
  ];
  sessionAccounts = [`stellar:testnet:${ADDRESS}`];
  connectCalls = [];
  requestCalls = [];
  requestResponses = {};
  requestError = null;
  initCount = 0;
  initError = null;
  initBlocker = null;
});

describe('createWalletConnectConnector — session proposal', () => {
  test('proposes optionalNamespaces only, with the full Stellar method set', async () => {
    const connector = createWalletConnectConnector({ projectId: 'test-project' });
    const account = await connector.connect();

    expect(account.address).toBe(ADDRESS);
    expect(connectCalls).toHaveLength(1);

    // requiredNamespaces is deprecated in sign-client >= 2.17 — sending it
    // triggers the console WARN "requiredNamespaces are deprecated and are
    // automatically assigned to optionalNamespaces". It must be absent.
    expect(connectCalls[0]?.requiredNamespaces).toBeUndefined();

    const stellar = connectCalls[0]?.optionalNamespaces?.stellar;
    expect(stellar?.chains).toEqual(['stellar:testnet']);
    expect(stellar?.events).toEqual(['accountsChanged']);
    // The documented Stellar WC methods (Freighter Mobile et al.) plus
    // stellar_getNetwork for wallets that implement network introspection.
    expect(stellar?.methods).toEqual([
      'stellar_signXDR',
      'stellar_signAndSubmitXDR',
      'stellar_signMessage',
      'stellar_signAuthEntry',
      'stellar_getNetwork',
    ]);
  });

  test('proposes the configured network chain (PUBLIC -> stellar:pubnet)', async () => {
    const connector = createWalletConnectConnector({ projectId: 'test-project' });
    (connector as unknown as { _setNetwork?: (n: string) => void })._setNetwork?.('PUBLIC');
    await connector.connect();
    expect(connectCalls[0]?.optionalNamespaces?.stellar?.chains).toEqual(['stellar:pubnet']);
  });
});

describe('createWalletConnectConnector — stellar_getNetwork negotiation', () => {
  test('skips the stellar_getNetwork request when the wallet did not approve it (Freighter-style session)', async () => {
    const connector = createWalletConnectConnector({ projectId: 'test-project' });
    const account = await connector.connect();

    expect(account.address).toBe(ADDRESS);
    // THE regression: no request may be issued for an unapproved method —
    // sign-client >= 2.17 logs ERROR + throws
    // "Missing or invalid. request() method: stellar_getNetwork" before the
    // request ever reaches the wallet.
    expect(requestCalls).toHaveLength(0);

    // Falls back to the app's configured network.
    const network = await connector.getNetwork();
    expect(network.network).toBe('TESTNET');
    expect(network.networkPassphrase).toBe(TESTNET_PASSPHRASE);
  });

  test('calls stellar_getNetwork when the session approved it and adopts the wallet-reported network', async () => {
    sessionMethods = ['stellar_signXDR', 'stellar_getNetwork'];
    requestResponses['stellar_getNetwork'] = { network: 'PUBLIC', networkPassphrase: PUBNET_PASSPHRASE };

    const connector = createWalletConnectConnector({ projectId: 'test-project' });
    await connector.connect();

    expect(requestCalls.map((c) => c.request.method)).toEqual(['stellar_getNetwork']);
    const network = await connector.getNetwork();
    expect(network.network).toBe('PUBLIC');
    expect(network.networkPassphrase).toBe(PUBNET_PASSPHRASE);
  });

  test('falls back to the configured network when the approved stellar_getNetwork round-trip fails', async () => {
    sessionMethods = ['stellar_signXDR', 'stellar_getNetwork'];
    requestError = new Error('wallet timed out');

    const connector = createWalletConnectConnector({ projectId: 'test-project' });
    await connector.connect();

    expect(requestCalls.map((c) => c.request.method)).toEqual(['stellar_getNetwork']);
    const network = await connector.getNetwork();
    expect(network.network).toBe('TESTNET');
    expect(network.networkPassphrase).toBe(TESTNET_PASSPHRASE);
  });
});

describe('createWalletConnectConnector — approved-methods verification', () => {
  test('rejects the session when the wallet approved no signing method', async () => {
    sessionMethods = ['stellar_getNetwork'];

    const connector = createWalletConnectConnector({ projectId: 'test-project' });
    await expect(connector.connect()).rejects.toThrow(/stellar_signXDR/);
  });

  test('signTransaction sends stellar_signXDR and returns the signed XDR', async () => {
    requestResponses['stellar_signXDR'] = { signedXDR: 'AAAA-signed' };

    const connector = createWalletConnectConnector({ projectId: 'test-project' });
    await connector.connect();
    const result = await connector.signTransaction('AAAA-tx');

    expect(result.signedTxXdr).toBe('AAAA-signed');
    expect(result.signerAddress).toBe(ADDRESS);
    expect(requestCalls.at(-1)?.request.method).toBe('stellar_signXDR');
  });

  test('signMessage and signAuthEntry throw clean errors when the optional methods were not approved', async () => {
    sessionMethods = ['stellar_signXDR'];

    const connector = createWalletConnectConnector({ projectId: 'test-project' });
    await connector.connect();

    await expect(connector.signMessage('hello')).rejects.toThrow(/stellar_signMessage/);
    await expect(connector.signAuthEntry('AAAA-entry')).rejects.toThrow(/stellar_signAuthEntry/);
    // The guards fire BEFORE any WC request is issued — an unapproved method
    // would never reach the wallet (and would trigger sign-client's
    // ERROR-level namespace validation logs on newer releases).
    expect(requestCalls).toHaveLength(0);
  });

  test('signMessage succeeds when approved', async () => {
    sessionMethods = ['stellar_signXDR', 'stellar_signMessage'];
    requestResponses['stellar_signMessage'] = { signature: 'sig-123' };

    const connector = createWalletConnectConnector({ projectId: 'test-project' });
    await connector.connect();
    const result = await connector.signMessage('hello');

    expect(result.signedMessage).toBe('sig-123');
    expect(requestCalls.at(-1)?.request.method).toBe('stellar_signMessage');
  });

  test('disconnect clears the connection state', async () => {
    const connector = createWalletConnectConnector({ projectId: 'test-project' });
    await connector.connect();
    await connector.disconnect();

    await expect(connector.getAddress()).rejects.toThrow();
    await expect(connector.getNetwork()).rejects.toThrow();
  });
});

describe('createWalletConnectConnector — warmUp() (cold-start off the tap)', () => {
  test('warmUp() initializes the SignClient exactly once and resolves', async () => {
    const connector = createWalletConnectConnector({ projectId: 'test-project' });

    await connector.warmUp!();
    await connector.warmUp!(); // idempotent

    expect(initCount).toBe(1);

    // A subsequent connect() reuses the warm client — no second init.
    const account = await connector.connect();
    expect(account.address).toBe(ADDRESS);
    expect(initCount).toBe(1);
  });

  test('warmUp() swallows init failures and a later connect() retries', async () => {
    initError = new Error('relay unreachable');
    const connector = createWalletConnectConnector({ projectId: 'test-project' });

    // Must NOT throw — a failed warm-up leaves the connector cold.
    await connector.warmUp!();
    expect(initCount).toBe(1);

    // The next call retries initialization instead of caching the rejection.
    initError = null;
    const account = await connector.connect();
    expect(account.address).toBe(ADDRESS);
    expect(initCount).toBe(2);
  });

  test('a concurrent warmUp() and connect() share ONE init (no double init race)', async () => {
    // Block the first init so both callers are provably in flight together.
    let unblock!: () => void;
    initBlocker = new Promise<void>((resolve) => {
      unblock = resolve;
    });

    const connector = createWalletConnectConnector({ projectId: 'test-project' });
    const warm = connector.warmUp!();
    const connect = connector.connect();

    // Let both callers reach ensureClient() while init is still pending.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(initCount).toBe(1); // exactly one init in flight

    unblock();
    await Promise.all([warm, connect]);

    expect(initCount).toBe(1);
    expect(connectCalls).toHaveLength(1);
  });
});
