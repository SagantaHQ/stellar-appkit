import { test, expect, describe, mock, beforeEach } from 'bun:test';
import { createWalletConnectConnector, classifyWalletConnectError, walletConnectErrorMessage } from '../../src/connectors/walletconnect.js';
import { ConnectError } from '../../src/types.js';
import { StellarAppKit } from '../../src/client.js';

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
/** Pairing topic embedded in the fake wc.connect() URI below. */
const PAIRING_TOPIC = '9c4b0d13a1f97a15a7c43f6d1b0e2f8c7d5a4b3e2f1d0c9b8a7f6e5d4c3b2a1';

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
/** When set, the fake approval() rejects with this value (wallet-side reject / SDK expiry). */
let approvalError: unknown = null;
/** Captured fake-client event handlers — initClient subscribes session_delete. */
let eventHandlers: Record<string, Array<(...args: unknown[]) => void>> = {};
/** disconnect() calls recorded on the fake client (pairing/session cleanup assertions). */
let disconnectCalls: Array<{ topic?: string; reason?: { code?: number; message?: string } }> = [];

// --- relayer mock (refreshTransport tests) ---------------------------------

/** When set, the fake approval() promise blocks on this — in-flight connect tests release it. */
let approvalBlocker: Promise<void> | null = null;
/** When set, relayer.restartTransport() rejects with this error. */
let restartError: Error | null = null;
/** When false, the fake relayer hides restartTransport() (fallback-path tests). */
let relayerHasRestart = true;
let restartCount = 0;
let transportDisconnectCount = 0;
let transportOpenCount = 0;

const fakeRelayer = {
  restartTransport: async () => {
    restartCount++;
    if (restartError) throw restartError;
  },
  transportDisconnect: async () => {
    transportDisconnectCount++;
  },
  transportOpen: async () => {
    transportOpenCount++;
  },
};

const fakeClient = {
  connect: async (opts: WCConnectCall) => {
    connectCalls.push(opts);
    return {
      uri: 'wc:9c4b0d13a1f97a15a7c43f6d1b0e2f8c7d5a4b3e2f1d0c9b8a7f6e5d4c3b2a1@2?relay=%7B%22protocol%22%3A%22irn%22%7D',
      approval: async () => {
        if (approvalBlocker) await approvalBlocker;
        if (approvalError !== null) throw approvalError;
        return {
          topic: 'test-topic',
          namespaces: {
            stellar: {
              accounts: sessionAccounts,
              methods: sessionMethods,
            },
          },
          peer: { metadata: { name: 'Freighter', url: 'https://freighter.app', icons: [] } },
        };
      },
    };
  },
  request: async (opts: WCRequestCall) => {
    requestCalls.push(opts);
    if (requestError) throw requestError;
    return requestResponses[opts.request.method] ?? null;
  },
  disconnect: async (opts: { topic?: string; reason?: { code?: number; message?: string } } = {}) => {
    disconnectCalls.push(opts);
  },
  on: (event: string, handler: (...args: unknown[]) => void) => {
    (eventHandlers[event] ??= []).push(handler);
  },
  removeListener: () => {},
  session: {
    get: () => undefined,
    keys: () => [] as string[],
    delete: async () => {},
  },
  // The relayer surface refreshTransport() drives — exposed under
  // core.relayer exactly like the real SignClient.
  get core() {
    return {
      relayer: relayerHasRestart
        ? fakeRelayer
        : { transportDisconnect: fakeRelayer.transportDisconnect, transportOpen: fakeRelayer.transportOpen },
    };
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
  approvalBlocker = null;
  approvalError = null;
  eventHandlers = {};
  disconnectCalls = [];
  restartError = null;
  relayerHasRestart = true;
  restartCount = 0;
  transportDisconnectCount = 0;
  transportOpenCount = 0;
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

// ---------------------------------------------------------------------------
// refreshTransport() — the React Native zombie-socket fix
//
// On RN the app is backgrounded the instant a wallet deep link fires; the OS
// kills the relay WebSocket and the WC SDK's own recovery paths never fire
// (Node-only ping watchdog, browser-only online listeners). The wallet
// approves, `session_settled` queues on the relay, approval() hangs forever,
// and the modal stays on "Continue in {wallet}" — the user-reported HOT
// Wallet stuck-loading bug. refreshTransport() is what the RN modal calls on
// every AppState 'active': a forced relay restart + resubscribe, which makes
// the relay re-deliver the queued message and settles the connect.
// ---------------------------------------------------------------------------

describe('createWalletConnectConnector — refreshTransport() (RN zombie-socket fix)', () => {
  test('THE HOT WALLET REGRESSION: restarts the relay while a pairing approval wait is in flight', async () => {
    // Block the wallet approval — the app is "in the wallet" backgrounded.
    let unblock!: () => void;
    approvalBlocker = new Promise<void>((resolve) => {
      unblock = resolve;
    });

    const connector = createWalletConnectConnector({ projectId: 'test-project' });
    const pending = connector.connect();

    // Let the proposal + deep link handoff complete (microtasks + a poll tick).
    await new Promise((resolve) => setTimeout(resolve, 260));

    // Foreground transition: refreshTransport() must fire while the
    // approval wait is live — connectInFlight is the gate.
    connector.refreshTransport!();
    expect(restartCount).toBe(1);
    expect(transportDisconnectCount).toBe(0); // restartTransport path, not the fallback

    unblock();
    const account = await pending;
    expect(account.address).toBe(ADDRESS);
  });

  test('restarts the relay when a session is settled (sign-request zombie)', async () => {
    const connector = createWalletConnectConnector({ projectId: 'test-project' });
    await connector.connect();

    connector.refreshTransport!();
    expect(restartCount).toBe(1);
  });

  test('no-ops on a cold connector (never initializes the SignClient)', () => {
    const connector = createWalletConnectConnector({ projectId: 'test-project' });

    // Must not throw and must not pay an init just to "refresh".
    connector.refreshTransport!();
    expect(initCount).toBe(0);
    expect(restartCount).toBe(0);
  });

  test('no-ops after warmUp() with nothing in flight — an idle app does not churn its socket', async () => {
    const connector = createWalletConnectConnector({ projectId: 'test-project' });
    await connector.warmUp!();

    connector.refreshTransport!();
    expect(restartCount).toBe(0);
  });

  test('no-ops again after disconnect() tears the client down', async () => {
    const connector = createWalletConnectConnector({ projectId: 'test-project' });
    await connector.connect();
    await connector.disconnect();

    connector.refreshTransport!();
    expect(restartCount).toBe(0);
  });

  test('falls back to transportDisconnect() + transportOpen() when the SDK has no restartTransport()', async () => {
    relayerHasRestart = false;
    const connector = createWalletConnectConnector({ projectId: 'test-project' });
    await connector.connect();

    connector.refreshTransport!();
    // Sequenced fallback — both hops, no restartTransport call counted.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(transportDisconnectCount).toBe(1);
    expect(transportOpenCount).toBe(1);
  });

  test('never throws when the relayer restart rejects (offline foreground)', async () => {
    restartError = new Error('No internet connection detected');
    const connector = createWalletConnectConnector({ projectId: 'test-project' });
    await connector.connect();

    expect(() => connector.refreshTransport!()).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 10));
  });

  test('repeated foreground transitions restart repeatedly (idempotent, never crashes)', async () => {
    const connector = createWalletConnectConnector({ projectId: 'test-project' });
    await connector.connect();

    connector.refreshTransport!();
    connector.refreshTransport!();
    connector.refreshTransport!();
    expect(restartCount).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Session persistence — cold-start rehydration (getAddress() reads back
// what connect() wrote to WC_STORAGE_KEY)
//
// Without this, a persisted WalletConnect session was silently dropped on
// every app restart: StellarAppKit.restore() validates sessions through
// connector.getAddress(), which threw while the connector was cold — so
// users re-paired their HOT Wallet / Freighter on every cold start even
// though connect() had dutifully persisted the session topic.
// ---------------------------------------------------------------------------

/** In-memory ConnectStorage for the restore round-trip tests. */
function makeStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  const removed: string[] = [];
  return {
    storage: {
      getItem: async (key: string) => store.get(key) ?? null,
      setItem: async (key: string, value: string) => void store.set(key, value),
      removeItem: async (key: string) => {
        store.delete(key);
        removed.push(key);
      },
    },
    removed,
  };
}

function persistedRecord(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    topic: 'test-topic',
    address: ADDRESS,
    peerMetadata: { name: 'HOT Wallet', url: 'https://hot-labs.org', icon: null },
    ...overrides,
  });
}

describe('createWalletConnectConnector — session restore (cold-start rehydration)', () => {

  test('getAddress() rehydrates a persisted session through the SDK session store', async () => {
    const { storage } = makeStorage({ 'saganta-appkit:walletconnect-session': persistedRecord() });
    // The SDK still knows the session (persisted in its own store).
    const storedSessions: Record<string, unknown> = {
      'test-topic': {
        topic: 'test-topic',
        namespaces: {
          stellar: {
            accounts: [`stellar:testnet:${ADDRESS}`],
            methods: ['stellar_signXDR', 'stellar_signMessage'],
          },
        },
        peer: { metadata: { name: 'HOT Wallet', url: 'https://hot-labs.org', icons: [] } },
      },
    };
    (fakeClient.session as { get: (t: string) => unknown }).get = (t: string) => storedSessions[t];

    const connector = createWalletConnectConnector({ projectId: 'test-project', storage });

    // Cold connector — must rehydrate instead of throwing.
    const { address } = await connector.getAddress();
    expect(address).toBe(ADDRESS);

    // The connector is fully re-armed: network fallback, peer branding,
    // approved methods (signMessage guarded below by an unapproved one).
    const network = await connector.getNetwork();
    expect(network.network).toBe('TESTNET');
    expect(connector.getSessionPeer?.()).toEqual({
      name: 'HOT Wallet',
      url: 'https://hot-labs.org',
      icon: null,
    });
    // stellar_signXDR was approved → signTransaction passes the guard.
    requestResponses['stellar_signXDR'] = { signedXDR: 'AAAA-signed' };
    const signed = await connector.signTransaction('AAAA-tx');
    expect(signed.signedTxXdr).toBe('AAAA-signed');
    // stellar_signAuthEntry was NOT approved → clean guard error, no request.
    await expect(connector.signAuthEntry('AAAA-entry')).rejects.toThrow(/stellar_signAuthEntry/);
    expect(requestCalls.filter((c) => c.request.method === 'stellar_signAuthEntry')).toHaveLength(0);

    // A restored session re-arms the refreshTransport gate too — a
    // foregrounding app must restart the relay for sign requests.
    connector.refreshTransport!();
    expect(restartCount).toBe(1);

    (fakeClient.session as { get: (t: string) => unknown }).get = () => undefined;
  });

  test('a session the SDK no longer knows is dropped AND the persisted record cleared', async () => {
    const { storage, removed } = makeStorage({ 'saganta-appkit:walletconnect-session': persistedRecord() });
    // session.get returns undefined (wallet deleted / expired).
    const connector = createWalletConnectConnector({ projectId: 'test-project', storage });

    await expect(connector.getAddress()).rejects.toThrow(/not connected/i);
    expect(removed).toContain('saganta-appkit:walletconnect-session');
  });

  test('a corrupt persisted record is cleared and treated as no session', async () => {
    const { storage, removed } = makeStorage({ 'saganta-appkit:walletconnect-session': '{not-json' });
    const connector = createWalletConnectConnector({ projectId: 'test-project', storage });

    await expect(connector.getAddress()).rejects.toThrow(/not connected/i);
    expect(removed).toContain('saganta-appkit:walletconnect-session');
  });

  test('no storage configured → getAddress() stays the plain cold error (no init paid)', async () => {
    const connector = createWalletConnectConnector({ projectId: 'test-project' });
    await expect(connector.getAddress()).rejects.toThrow(/not connected/i);
    expect(initCount).toBe(0); // never initialized the SDK just to answer
  });

  test('a missing persisted record pays no SDK init either (fast cold path)', async () => {
    const { storage } = makeStorage(); // empty
    const connector = createWalletConnectConnector({ projectId: 'test-project', storage });

    await expect(connector.getAddress()).rejects.toThrow(/not connected/i);
    expect(initCount).toBe(0);
  });

  test('connect() → cold restart round trip: the record connect() writes rehydrates a fresh connector', async () => {
    const { storage } = makeStorage();
    // First connector: connect() and persist the session.
    const first = createWalletConnectConnector({ projectId: 'test-project', storage });
    await first.connect();
    const record = await storage.getItem('saganta-appkit:walletconnect-session');
    expect(record).toBeTruthy();

    // The SDK still holds the settled session (same relay client session
    // store, as it would after an app restart with persisted SDK storage).
    const settled: Record<string, unknown> = {
      'test-topic': {
        topic: 'test-topic',
        namespaces: { stellar: { accounts: sessionAccounts, methods: sessionMethods } },
        peer: { metadata: { name: 'Freighter', url: 'https://freighter.app', icons: [] } },
      },
    };
    (fakeClient.session as { get: (t: string) => unknown }).get = (t: string) => settled[t];

    // Second connector, sharing the storage: cold start, no connect() call.
    const second = createWalletConnectConnector({ projectId: 'test-project', storage });
    const { address } = await second.getAddress();
    expect(address).toBe(ADDRESS);
    expect(second.getSessionPeer?.()?.name).toBe('Freighter');

    (fakeClient.session as { get: (t: string) => unknown }).get = () => undefined;
  });
});

describe('StellarAppKit.restore() — WC sessions survive a cold restart end to end', () => {
  test('a second client sharing the storage restores the WC session without reconnecting', async () => {
    const { storage } = makeStorage();

    // App run #1: connect, persisting BOTH the client-level session and the
    // connector-level WC record.
    const app1 = new StellarAppKit({
      connectors: [createWalletConnectConnector({ projectId: 'test-project', storage })],
      network: 'TESTNET',
      storage,
    });
    const session = await app1.connect('walletconnect');
    expect(session.address).toBe(ADDRESS);

    // The relay's session store outlives the app process (the SDK persists
    // it — localStorage on web, AsyncStorage on RN).
    const settled: Record<string, unknown> = {
      'test-topic': {
        topic: 'test-topic',
        namespaces: { stellar: { accounts: sessionAccounts, methods: sessionMethods } },
        peer: { metadata: { name: 'HOT Wallet', url: 'https://app.hot-labs.org', icons: [] } },
      },
    };
    (fakeClient.session as { get: (t: string) => unknown }).get = (t: string) => settled[t];

    // App run #2: a brand-new client + connector sharing the storage.
    const app2 = new StellarAppKit({
      connectors: [createWalletConnectConnector({ projectId: 'test-project', storage })],
      network: 'TESTNET',
      storage,
    });
    const restored = await app2.restore();

    // THE regression: the WC session is kept, not silently dropped — the
    // user doesn't re-pair their HOT Wallet on every app restart.
    expect(restored.map((s) => s.walletId)).toEqual(['walletconnect']);
    expect(app2.session?.address).toBe(ADDRESS);
    expect(app2.status).toBe('connected');
    // Peer branding survived the restart (account view shows the wallet's
    // own name, not the generic "WalletConnect"). The fake wallet settles
    // with peer name "Freighter" — that's what connect() persisted.
    expect(app2.activeConnector?.getSessionPeer?.()?.name).toBe('Freighter');

    (fakeClient.session as { get: (t: string) => unknown }).get = () => undefined;
  });
});

// ---------------------------------------------------------------------------
// WalletConnect error classification + ghost-pairing cleanup.
//
// The regression these pin: every WalletConnect failure used to surface as
// either a generic "The user rejected this request." (discarding the
// wallet's own words — Lobstr's "Transaction cancelled by the user" only
// ever appeared as a level-50 SDK console log) or an opaque internal error,
// while an abandoned connect() left its pairing alive so the wallet's late
// approval crashed against a discarded record — the SDK's
//   "No matching key. proposal: …" / "Pending session not found" cascade —
// and the retried attempt died with "Request expired. Please try again."
// ---------------------------------------------------------------------------
const tick = () => new Promise((r) => setTimeout(r, 10));

async function connectErrorOf(p: Promise<unknown>): Promise<ConnectError> {
  try {
    await p;
    throw new Error('expected the call to reject');
  } catch (err) {
    if (!(err instanceof ConnectError)) throw err;
    return err;
  }
}

describe('classifyWalletConnectError — the WC error taxonomy', () => {
  test('wallet-speak for "the user said no" classifies as user-rejected', () => {
    expect(classifyWalletConnectError({ code: 4900, message: 'Transaction cancelled by the user' }).kind).toBe('user-rejected');
    expect(classifyWalletConnectError({ message: 'User rejected the request.' }).kind).toBe('user-rejected');
    expect(classifyWalletConnectError(new Error('Request denied')).kind).toBe('user-rejected');
    expect(classifyWalletConnectError('Declined by user').kind).toBe('user-rejected');
  });

  test('the SDK delayed-promise timeout classifies as request-expired', () => {
    expect(classifyWalletConnectError(new Error('Request expired. Please try again.')).kind).toBe('request-expired');
    expect(classifyWalletConnectError('Request expired').kind).toBe('request-expired');
    expect(classifyWalletConnectError({ message: 'Expired. Try again.' }).kind).toBe('request-expired');
  });

  test('namespace validation / relay errors stay "other"', () => {
    expect(classifyWalletConnectError(new Error('Missing or invalid. request() method: stellar_getNetwork')).kind).toBe('other');
    expect(classifyWalletConnectError({ code: 3000, message: 'Project not found' }).kind).toBe('other');
  });

  test('walletConnectErrorMessage extracts from every thrown shape', () => {
    expect(walletConnectErrorMessage(new Error('boom'))).toBe('boom');
    expect(walletConnectErrorMessage('plain')).toBe('plain');
    expect(walletConnectErrorMessage({ message: 'obj-msg' })).toBe('obj-msg');
    expect(walletConnectErrorMessage({ reason: 'obj-reason' })).toBe('obj-reason');
    expect(walletConnectErrorMessage({ error: { message: 'nested' } })).toBe('nested');
    expect(walletConnectErrorMessage(42)).toBe('42');
  });
});

describe('createWalletConnectConnector — sign failures are classified, not swallowed', () => {
  test('wallet rejection ("Transaction cancelled by the user") → code -4 with the wallet\u2019s own message', async () => {
    requestError = { code: 4900, message: 'Transaction cancelled by the user' } as unknown as Error;
    const connector = createWalletConnectConnector({ projectId: 'test-project' });
    await connector.connect();

    const err = await connectErrorOf(connector.signTransaction('AAAA-tx'));
    expect(err.code).toBe(-4);
    expect(err.message).toBe('Transaction cancelled by the user');
  });

  test('SDK request expiry → code -1 with a plain-language explanation (NOT a rejection)', async () => {
    requestError = new Error('Request expired. Please try again.');
    const connector = createWalletConnectConnector({ projectId: 'test-project' });
    await connector.connect();

    const err = await connectErrorOf(connector.signTransaction('AAAA-tx'));
    expect(err.code).toBe(-1);
    expect(err.message).toMatch(/expired/i);
    expect(err.message).toMatch(/try again/i);
  });

  test('in-band { error } results classify the same as thrown rejections', async () => {
    requestResponses['stellar_signXDR'] = { error: { code: 4900, message: 'Transaction cancelled by the user' } };
    const connector = createWalletConnectConnector({ projectId: 'test-project' });
    await connector.connect();

    const err = await connectErrorOf(connector.signTransaction('AAAA-tx'));
    expect(err.code).toBe(-4);
    expect(err.message).toBe('Transaction cancelled by the user');
  });

  test('signMessage rejections classify too (wallet cancel → -4, expiry → -1)', async () => {
    const connector = createWalletConnectConnector({ projectId: 'test-project' });
    await connector.connect();

    requestError = { message: 'Transaction cancelled by the user' } as unknown as Error;
    const cancelled = await connectErrorOf(connector.signMessage('hello'));
    expect(cancelled.code).toBe(-4);
    expect(cancelled.message).toBe('Transaction cancelled by the user');

    requestError = new Error('Request expired. Please try again.');
    const expired = await connectErrorOf(connector.signMessage('hello'));
    expect(expired.code).toBe(-1);
    expect(expired.message).toMatch(/expired/i);
  });

  test('signAuthEntry rejections classify too', async () => {
    requestError = { message: 'User declined the request' } as unknown as Error;
    const connector = createWalletConnectConnector({ projectId: 'test-project' });
    await connector.connect();

    const err = await connectErrorOf(connector.signAuthEntry('AAAA-entry'));
    expect(err.code).toBe(-4);
  });
});

describe('createWalletConnectConnector — ghost-pairing cleanup (the "No matching key" cascade)', () => {
  test('a successful connect NEVER disconnects its pairing', async () => {
    const connector = createWalletConnectConnector({ projectId: 'test-project' });
    await connector.connect();

    expect(disconnectCalls.map((c) => c.topic)).not.toContain(PAIRING_TOPIC);
  });

  test('an expired approval rejects with a clear error AND disconnects the abandoned pairing', async () => {
    approvalError = new Error('Request expired. Please try again.');
    const connector = createWalletConnectConnector({ projectId: 'test-project' });

    const err = await connectErrorOf(connector.connect());
    expect(err.code).toBe(-1);
    expect(err.message).toMatch(/expired/i);

    await tick(); // cleanup is fire-and-forget
    expect(disconnectCalls.map((c) => c.topic)).toContain(PAIRING_TOPIC);
  });

  test('a wallet-side proposal rejection → code -4 with the wallet\u2019s message AND pairing cleanup', async () => {
    approvalError = { message: 'User rejected the pairing' };
    const connector = createWalletConnectConnector({ projectId: 'test-project' });

    const err = await connectErrorOf(connector.connect());
    expect(err.code).toBe(-4);
    expect(err.message).toBe('User rejected the pairing');

    await tick();
    expect(disconnectCalls.map((c) => c.topic)).toContain(PAIRING_TOPIC);
  });

  test('a session that settles without a Stellar account also abandons the pairing', async () => {
    sessionAccounts = []; // wallet approved but sent no accounts
    const connector = createWalletConnectConnector({ projectId: 'test-project' });

    await connectErrorOf(connector.connect());
    await tick();
    expect(disconnectCalls.map((c) => c.topic)).toContain(PAIRING_TOPIC);
  });
});

describe('createWalletConnectConnector — abort() (user cancels the connect)', () => {
  test('abort() rejects the in-flight connect() as a -4 cancellation AND disconnects the pairing', async () => {
    approvalBlocker = new Promise(() => undefined); // wallet never answers
    const connector = createWalletConnectConnector({ projectId: 'test-project' });

    const pending = connector.connect();
    await new Promise((r) => setTimeout(r, 30)); // let wc.connect() settle + pairing topic latch

    connector.abort?.();
    // The pairing disconnect is immediate (abort() calls it synchronously).
    expect(disconnectCalls.map((c) => c.topic)).toContain(PAIRING_TOPIC);

    const err = await connectErrorOf(pending);
    expect(err.code).toBe(-4);
    expect(err.message).toMatch(/cancelled/i);
  });

  test('abort() with nothing in flight is a no-op', () => {
    const connector = createWalletConnectConnector({ projectId: 'test-project' });
    expect(() => connector.abort?.()).not.toThrow();
    expect(disconnectCalls).toHaveLength(0);
  });

  test('after an abort, a fresh connect() still works (flags reset, no stale rejection)', async () => {
    const connector = createWalletConnectConnector({ projectId: 'test-project' });

    // First attempt: user cancels while the wallet is silent.
    approvalBlocker = new Promise(() => undefined);
    const first = connector.connect();
    await new Promise((r) => setTimeout(r, 30));
    connector.abort?.();
    const firstErr = await connectErrorOf(first);
    expect(firstErr.code).toBe(-4);

    // Second attempt: wallet approves normally.
    approvalBlocker = null;
    const account = await connector.connect();
    expect(account.address).toBe(ADDRESS);
    expect(account.walletId).toBe('walletconnect');
  });
});

describe('createWalletConnectConnector — wallet-initiated session_delete', () => {
  test('session_delete clears ALL connector state including the persisted record', async () => {
    const { storage, removed } = makeStorage();
    const connector = createWalletConnectConnector({ projectId: 'test-project', storage });
    await connector.connect();
    expect(await storage.getItem('saganta-appkit:walletconnect-session')).toBeTruthy();

    // The wallet removed the session on its side → the SDK fires session_delete.
    const handlers = eventHandlers['session_delete'] ?? [];
    expect(handlers.length).toBeGreaterThan(0);
    handlers[0]!({ topic: 'test-topic' });

    await tick(); // storage removal is fire-and-forget
    expect(removed).toContain('saganta-appkit:walletconnect-session');
    // The connector no longer claims to be connected.
    await expect(connector.getAddress()).rejects.toThrow(/not connected/i);
  });
});

// ---------------------------------------------------------------------------
// Wallet-initiated disconnect propagation — the user taps Disconnect INSIDE
// the wallet and the library must disconnect too.
//
// The regression these pin: the connector's session_delete handler used to
// clear only its OWN private state (topic, cached address, persisted record).
// StellarAppKit kept serving the dead session — status 'connected', account
// view up, hooks reporting a wallet — until the next sign request blew up
// with "WalletConnect is not connected — call connect() first". Now the
// connector notifies the client through setOnSessionInvalidated (wired by
// the StellarAppKit constructor), and the client reconciles exactly like an
// app-initiated disconnect: session dropped (memory + storage), status
// flipped, `disconnect` + `sessionsChanged` emitted.
// ---------------------------------------------------------------------------

describe('wallet-initiated disconnect — connector → client propagation', () => {
  test('setOnSessionInvalidated fires when the wallet deletes the session', async () => {
    const connector = createWalletConnectConnector({ projectId: 'test-project' });
    await connector.connect();

    let invalidated = 0;
    (connector as { setOnSessionInvalidated?: (fn: (() => void) | null) => void }).setOnSessionInvalidated?.(() => invalidated++);

    const handlers = eventHandlers['session_delete'] ?? [];
    handlers[0]!({ topic: 'test-topic' });
    expect(invalidated).toBe(1);
    // A second delivery for the same (now-dead) topic doesn't re-fire —
    // the relay can echo session_delete + session_expire back to back.
    handlers[0]!({ topic: 'test-topic' });
    expect(invalidated).toBe(1);
  });

  test('session_expire (the ~7-day TTL lapse) fires the same callback', async () => {
    const connector = createWalletConnectConnector({ projectId: 'test-project' });
    await connector.connect();

    let invalidated = 0;
    (connector as { setOnSessionInvalidated?: (fn: (() => void) | null) => void }).setOnSessionInvalidated?.(() => invalidated++);

    const handlers = eventHandlers['session_expire'] ?? [];
    expect(handlers.length).toBeGreaterThan(0);
    handlers[0]!({ topic: 'test-topic' });
    expect(invalidated).toBe(1);
  });

  test('the callback is NOT fired for our own disconnect() (no event double-fire)', async () => {
    const connector = createWalletConnectConnector({ projectId: 'test-project' });
    await connector.connect();

    let invalidated = 0;
    (connector as { setOnSessionInvalidated?: (fn: (() => void) | null) => void }).setOnSessionInvalidated?.(() => invalidated++);

    await connector.disconnect();
    expect(invalidated).toBe(0);

    // The SDK's late local echo of our own deletion (if any arrives) is
    // also suppressed — the topic no longer matches our session.
    const handlers = eventHandlers['session_delete'] ?? [];
    if (handlers.length > 0) handlers[0]!({ topic: 'test-topic' });
    expect(invalidated).toBe(0);
  });

  test('StellarAppKit: a wallet-side delete drops the session, flips the status, and emits disconnect — exactly like an app-side disconnect', async () => {
    const { storage } = makeStorage();
    const appkit = new StellarAppKit({
      connectors: [createWalletConnectConnector({ projectId: 'test-project', storage })],
      network: 'TESTNET',
      storage,
    });
    await appkit.connect('walletconnect');
    expect(appkit.status).toBe('connected');
    expect(appkit.sessions.map((s) => s.walletId)).toEqual(['walletconnect']);

    const disconnects: string[] = [];
    const sessionChanges: number[] = [];
    const statuses: string[] = [];
    appkit.on('disconnect', (e) => disconnects.push(e.walletId));
    appkit.on('sessionsChanged', () => sessionChanges.push(appkit.sessions.length));
    appkit.on('statusChange', (s) => statuses.push(s));

    // The wallet kills the session from its side.
    (eventHandlers['session_delete'] ?? [])[0]!({ topic: 'test-topic' });
    await new Promise((r) => setTimeout(r, 30)); // reconciliation is fire-and-forget async

    expect(disconnects).toEqual(['walletconnect']);
    expect(appkit.session).toBeNull();
    expect(appkit.sessions).toHaveLength(0);
    expect(appkit.status).toBe('idle');
    expect(statuses).toContain('idle');
    // The client-level persisted session went with it — a cold restart
    // must NOT resurrect a session the wallet already killed (persist()
    // writes the emptied record, same as an app-initiated disconnect).
    const stored = JSON.parse((await storage.getItem('saganta-connect:session'))!) as { sessions?: unknown[] };
    expect(stored.sessions).toHaveLength(0);
    expect(await storage.getItem('saganta-appkit:walletconnect-session')).toBeNull();
    // The connector is cold: further signs fail with the "not connected"
    // guard instead of hanging a dead session topic.
    await expect(appkit.signTransaction('AAAA-tx')).rejects.toThrow();
  });

  test('StellarAppKit: the app-initiated disconnect() path still emits exactly ONE disconnect event', async () => {
    const { storage } = makeStorage();
    const appkit = new StellarAppKit({
      connectors: [createWalletConnectConnector({ projectId: 'test-project', storage })],
      network: 'TESTNET',
      storage,
    });
    await appkit.connect('walletconnect');

    const disconnects: string[] = [];
    appkit.on('disconnect', (e) => disconnects.push(e.walletId));

    await appkit.disconnect();
    expect(disconnects).toEqual(['walletconnect']);
  });

  test('peer metadata carries the wallet redirect deep links (sign handoff survives restarts)', async () => {
    // The fake wallet settles with peer name "Freighter"; give it a native
    // redirect so the capture path has something to record.
    const { storage } = makeStorage();
    const originalConnect = fakeClient.connect.bind(fakeClient);
    (fakeClient as { connect: unknown }).connect = async (opts: WCConnectCall) => {
      const result = await originalConnect(opts);
      return {
        ...result,
        approval: async () => {
          if (approvalBlocker) await approvalBlocker;
          if (approvalError !== null) throw approvalError;
          return {
            topic: 'test-topic',
            namespaces: { stellar: { accounts: sessionAccounts, methods: sessionMethods } },
            peer: {
              metadata: {
                name: 'Freighter',
                url: 'https://freighter.app',
                icons: [],
                redirect: { native: 'freighterwallet://wc-redirect', universal: 'https://freighter.app/uni' },
              },
            },
          };
        },
      };
    };
    try {
      const connector = createWalletConnectConnector({ projectId: 'test-project', storage });
      await connector.connect();
      expect(connector.getSessionPeer?.()).toEqual({
        name: 'Freighter',
        url: 'https://freighter.app',
        icon: null,
        redirect: { native: 'freighterwallet://wc-redirect', universal: 'https://freighter.app/uni' },
      });

      // The redirect is persisted with the record — a cold-restarted
      // connector rehydrates it instead of losing the handoff target.
      const record = JSON.parse((await storage.getItem('saganta-appkit:walletconnect-session'))!) as {
        peerMetadata?: { redirect?: { native?: string } };
      };
      expect(record.peerMetadata?.redirect?.native).toBe('freighterwallet://wc-redirect');
    } finally {
      (fakeClient as { connect: unknown }).connect = originalConnect;
    }
  });
});
