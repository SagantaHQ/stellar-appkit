/**
 * Tests for the v1.7.x SIWS session lifecycle on StellarAppKit:
 *   - siwsSession getter (null when unset, auto-clears expired)
 *   - setSiwsSession(session | null)  — persists + emits siwsSessionChange
 *   - clearSiwsSession()              — clears, emits, calls signout() per config
 *   - signOut()                       — clears session + disconnects wallet
 *   - requireAuth()                   — throws ConnectError when not auth'd
 *   - validateSession()               — refresh() vs session() fallback,
 *                                        address/network/expiry mismatch,
 *                                        server-returned session acceptance
 *   - reauthenticate()                — clears + emits null
 *   - restoreSiwsSession() (via restore())  — restores valid session,
 *                                        clears expired/corrupted storage
 *
 * Storage is mocked with createMemoryStorage() so tests don't touch the real
 * localStorage. The wallet connector is mocked via the freighter-api mock so
 * we can construct a real StellarAppKit instance and exercise the full
 * session lifecycle end-to-end.
 */

import { test, expect, describe, mock, beforeEach } from 'bun:test';
import { StellarAppKit } from '../src/client.js';
import { createFreighterConnector } from '../src/connectors/freighter.js';
import { createMemoryStorage } from '../src/storage.js';
import {
  ConnectError,
  type SiwsConfig,
  type SiwsSession,
  type StellarAppKitEvents,
} from '../src/index.js';

// ---------------------------------------------------------------------------
// Mock @stellar/freighter-api so createFreighterConnector() works without
// the extension. We only need the connect + getAddress + getNetwork paths
// for these tests — signMessage/signTransaction aren't exercised here.
// ---------------------------------------------------------------------------

type FreighterApi = {
  isConnected: () => Promise<{ error?: string }>;
  setAllowed: () => Promise<unknown>;
  getAddress: () => Promise<{ address: string; error?: string }>;
  getNetworkDetails: () => Promise<{ network: string; networkPassphrase: string; error?: string }>;
  signMessage: (m: string, o?: unknown) => Promise<{ signedMessage: Buffer | string; signerAddress: string; error?: string }>;
  signTransaction: (x: string, o?: unknown) => Promise<{ signedTxXdr: string; signerAddress: string; error?: string }>;
  signAuthEntry: (e: string, o?: unknown) => Promise<{ signedAuthEntry: Buffer | string; signerAddress: string; error?: string }>;
};

const TEST_ADDRESS = 'GA2C5RFPE6GCKMY3US5PAB6UZLKIGSPIUKSLRB6Q3IY7ZP4PAOMM43YA';
const OTHER_ADDRESS = 'GBWMCCC3BAXPRF7Y6YX3YZ3F7XK6Y5R2ZJ5HJZ7X3HJZT4PQYH4Q5R2';

let fakeApi: Partial<FreighterApi> = {};

const defaults: FreighterApi = {
  isConnected: async () => ({ error: undefined }),
  setAllowed: async () => ({}),
  getAddress: async () => ({ address: TEST_ADDRESS, error: undefined }),
  getNetworkDetails: async () => ({
    network: 'TESTNET',
    networkPassphrase: 'Test SDF Network ; September 2015',
    error: undefined,
  }),
  signTransaction: async () => ({ signedTxXdr: 'xdr', signerAddress: TEST_ADDRESS }),
  signMessage: async () => ({ signedMessage: Buffer.alloc(64), signerAddress: TEST_ADDRESS }),
  signAuthEntry: async () => ({ signedAuthEntry: Buffer.alloc(64), signerAddress: TEST_ADDRESS }),
};

mock.module('@stellar/freighter-api', () => ({
  isConnected: (...a: unknown[]) => (fakeApi.isConnected ?? defaults.isConnected)(...a),
  setAllowed: (...a: unknown[]) => (fakeApi.setAllowed ?? defaults.setAllowed)(...a),
  getAddress: (...a: unknown[]) => (fakeApi.getAddress ?? defaults.getAddress)(...a),
  getNetworkDetails: (...a: unknown[]) => (fakeApi.getNetworkDetails ?? defaults.getNetworkDetails)(...a),
  signTransaction: (x: string, o?: unknown) => (fakeApi.signTransaction ?? defaults.signTransaction)(x, o),
  signMessage: (m: string, o?: unknown) => (fakeApi.signMessage ?? defaults.signMessage)(m, o),
  signAuthEntry: (e: string, o?: unknown) => (fakeApi.signAuthEntry ?? defaults.signAuthEntry)(e, o),
}));

beforeEach(() => {
  fakeApi = {};
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSiwsSession(overrides: Partial<SiwsSession> = {}): SiwsSession {
  return {
    network: 'TESTNET',
    address: TEST_ADDRESS,
    expiry: Date.now() + 60 * 60 * 1000, // 1 hour from now
    metadata: { statement: 'Sign in to test app' },
    ...overrides,
  };
}

/** Builds a StellarAppKit with a memory storage + optional SiwsConfig. */
function makeAppkit(opts: {
  siwsConfig?: SiwsConfig;
  storage?: ReturnType<typeof createMemoryStorage>;
} = {}): StellarAppKit {
  const storage = opts.storage ?? createMemoryStorage();
  return new StellarAppKit({
    connectors: [createFreighterConnector()],
    network: 'TESTNET',
    appMetadata: { name: 'Test', domain: 'localhost', uri: 'http://localhost:3000' },
    storage,
    siws: opts.siwsConfig,
  });
}

/**
 * Builds a SiwsConfig with stubbed callbacks we can spy on. Returns the
 * config together with mutable counters so tests can assert on call counts.
 */
function makeSpySiwsConfig(overrides: Partial<{
  sessionReturn: SiwsSession | null;
  refreshReturn: SiwsSession | null;
  signoutReturn: boolean;
}> = {}): {
  config: SiwsConfig;
  counts: { session: number; nonce: number; verify: number; signout: number; refresh: number };
} {
  const counts = { session: 0, nonce: 0, verify: 0, signout: 0, refresh: 0 };
  return {
    config: {
      statement: 'Sign in to test app',
      session: async () => { counts.session++; return overrides.sessionReturn ?? null; },
      nonce: async () => { counts.nonce++; return 'test-nonce'; },
      verify: async () => { counts.verify++; return null; },
      signout: async () => { counts.signout++; return overrides.signoutReturn ?? true; },
      refresh: async () => { counts.refresh++; return overrides.refreshReturn ?? null; },
      signoutOnDisconnect: true,
      disconnectOnFail: true,
      maxRetries: 3,
      timeoutMs: 15_000,
    },
    counts,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('StellarAppKit SIWS — siwsSession getter', () => {
  test('returns null when no session has been set', () => {
    const appkit = makeAppkit();
    expect(appkit.siwsSession).toBeNull();
  });

  test('returns the session after setSiwsSession(session)', () => {
    const appkit = makeAppkit();
    const session = makeSiwsSession();
    appkit.setSiwsSession(session);
    expect(appkit.siwsSession).toEqual(session);
  });

  test('returns null after setSiwsSession(null)', () => {
    const appkit = makeAppkit();
    appkit.setSiwsSession(makeSiwsSession());
    expect(appkit.siwsSession).not.toBeNull();
    appkit.setSiwsSession(null);
    expect(appkit.siwsSession).toBeNull();
  });

  test('auto-clears expired sessions (expiry in the past)', () => {
    const appkit = makeAppkit();
    const expired = makeSiwsSession({ expiry: Date.now() - 1000 });
    appkit.setSiwsSession(expired);

    // The getter detects expiry and returns null. It also clears the
    // internal _siwsSession so subsequent reads don't re-check.
    expect(appkit.siwsSession).toBeNull();
    // A second read also returns null (no resurrection).
    expect(appkit.siwsSession).toBeNull();
  });

  test('treats expiry = 0 / undefined as "no expiry" (never auto-clears)', () => {
    const appkit = makeAppkit();
    const noExpiry: SiwsSession = {
      network: 'TESTNET',
      address: TEST_ADDRESS,
      expiry: 0,
    };
    appkit.setSiwsSession(noExpiry);
    // The getter checks `if (session.expiry && Date.now() > session.expiry)`
    // — expiry of 0 is falsy, so the check is skipped and the session is returned.
    expect(appkit.siwsSession).toEqual(noExpiry);
  });
});

describe('StellarAppKit SIWS — setSiwsSession persistence + events', () => {
  test('persists the session to storage on set', async () => {
    const storage = createMemoryStorage();
    const appkit = makeAppkit({ storage });
    const session = makeSiwsSession();

    appkit.setSiwsSession(session);

    // Storage key is 'saganta-appkit:siws-session' (SIWS_SESSION_STORAGE_KEY).
    const stored = storage.getItem('saganta-appkit:siws-session');
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored!)).toEqual(session);
  });

  test('removes the session from storage on setSiwsSession(null)', () => {
    const storage = createMemoryStorage();
    const appkit = makeAppkit({ storage });
    appkit.setSiwsSession(makeSiwsSession());
    expect(storage.getItem('saganta-appkit:siws-session')).not.toBeNull();

    appkit.setSiwsSession(null);
    expect(storage.getItem('saganta-appkit:siws-session')).toBeNull();
  });

  test('emits siwsSessionChange with the new session on set', () => {
    const appkit = makeAppkit();
    const calls: (SiwsSession | null)[] = [];
    appkit.on('siwsSessionChange', (s) => calls.push(s));

    const session = makeSiwsSession();
    appkit.setSiwsSession(session);

    expect(calls).toEqual([session]);
  });

  test('emits siwsSessionChange with null on clear', () => {
    const appkit = makeAppkit();
    appkit.setSiwsSession(makeSiwsSession());
    const calls: (SiwsSession | null)[] = [];
    appkit.on('siwsSessionChange', (s) => calls.push(s));

    appkit.setSiwsSession(null);

    expect(calls).toEqual([null]);
  });

  test('also emits sessionsChanged (for symmetry with the connect session list)', () => {
    const appkit = makeAppkit();
    const calls: unknown[] = [];
    appkit.on('sessionsChanged', (s) => calls.push(s));

    appkit.setSiwsSession(makeSiwsSession());

    expect(calls.length).toBe(1);
  });
});

describe('StellarAppKit SIWS — clearSiwsSession', () => {
  test('clears the in-memory session', async () => {
    const appkit = makeAppkit();
    appkit.setSiwsSession(makeSiwsSession());
    expect(appkit.siwsSession).not.toBeNull();

    await appkit.clearSiwsSession();

    expect(appkit.siwsSession).toBeNull();
  });

  test('removes the session from storage', async () => {
    const storage = createMemoryStorage();
    const appkit = makeAppkit({ storage });
    appkit.setSiwsSession(makeSiwsSession());
    expect(storage.getItem('saganta-appkit:siws-session')).not.toBeNull();

    await appkit.clearSiwsSession();

    expect(storage.getItem('saganta-appkit:siws-session')).toBeNull();
  });

  test('emits siwsSessionChange with null when a session was previously set', async () => {
    const appkit = makeAppkit();
    appkit.setSiwsSession(makeSiwsSession());
    const calls: (SiwsSession | null)[] = [];
    appkit.on('siwsSessionChange', (s) => calls.push(s));

    await appkit.clearSiwsSession();

    expect(calls).toEqual([null]);
  });

  test('does NOT emit siwsSessionChange when no session was set (no-op)', async () => {
    const appkit = makeAppkit();
    const calls: (SiwsSession | null)[] = [];
    appkit.on('siwsSessionChange', (s) => calls.push(s));

    await appkit.clearSiwsSession();

    expect(calls).toEqual([]);
  });

  test('calls signout() when a session was set and signoutOnDisconnect is true (default)', async () => {
    const { config, counts } = makeSpySiwsConfig();
    const appkit = makeAppkit({ siwsConfig: config });
    appkit.setSiwsSession(makeSiwsSession());

    await appkit.clearSiwsSession();

    expect(counts.signout).toBe(1);
  });

  test('does NOT call signout() when signoutOnDisconnect is false', async () => {
    const { config, counts } = makeSpySiwsConfig();
    config.signoutOnDisconnect = false;
    const appkit = makeAppkit({ siwsConfig: config });
    appkit.setSiwsSession(makeSiwsSession());

    await appkit.clearSiwsSession();

    expect(counts.signout).toBe(0);
  });

  test('does NOT call signout() when no session was set (wasAuthenticated is false)', async () => {
    const { config, counts } = makeSpySiwsConfig();
    const appkit = makeAppkit({ siwsConfig: config });

    await appkit.clearSiwsSession();

    expect(counts.signout).toBe(0);
  });

  test('swallows signout() errors silently (does not throw)', async () => {
    const config: SiwsConfig = {
      statement: 'x',
      session: async () => null,
      nonce: async () => 'n',
      verify: async () => null,
      signout: async () => { throw new Error('network down'); },
    };
    const appkit = makeAppkit({ siwsConfig: config });
    appkit.setSiwsSession(makeSiwsSession());

    // Should not throw — signout failure must not block the clear.
    await expect(appkit.clearSiwsSession()).resolves.toBeUndefined();
    expect(appkit.siwsSession).toBeNull();
  });

  test('does not call signout() when no siwsConfig is set', async () => {
    // No siwsConfig — clearSiwsSession just clears the local session.
    const appkit = makeAppkit();
    appkit.setSiwsSession(makeSiwsSession());

    await expect(appkit.clearSiwsSession()).resolves.toBeUndefined();
    expect(appkit.siwsSession).toBeNull();
  });
});

describe('StellarAppKit SIWS — signOut', () => {
  test('clears the SIWS session', async () => {
    const appkit = makeAppkit();
    appkit.setSiwsSession(makeSiwsSession());

    await appkit.signOut();

    expect(appkit.siwsSession).toBeNull();
  });

  test('disconnects the active wallet', async () => {
    const appkit = makeAppkit();
    await appkit.connect('freighter');
    expect(appkit.session).not.toBeNull();

    await appkit.signOut();

    expect(appkit.session).toBeNull();
  });

  test('calls signout() via clearSiwsSession when siwsConfig is set', async () => {
    const { config, counts } = makeSpySiwsConfig();
    const appkit = makeAppkit({ siwsConfig: config });
    await appkit.connect('freighter');
    appkit.setSiwsSession(makeSiwsSession());

    await appkit.signOut();

    expect(counts.signout).toBe(1);
  });

  test('does not throw when no wallet is connected (signOut with no active session)', async () => {
    const appkit = makeAppkit();
    // No connect(), no setSiwsSession — signOut should be a safe no-op.
    await expect(appkit.signOut()).resolves.toBeUndefined();
  });
});

describe('StellarAppKit SIWS — requireAuth', () => {
  test('throws ConnectError when not authenticated', () => {
    const appkit = makeAppkit();
    expect(() => appkit.requireAuth()).toThrow(ConnectError);
    expect(() => appkit.requireAuth()).toThrow(/Authentication required/);
  });

  test('returns void (does not throw) when authenticated', () => {
    const appkit = makeAppkit();
    appkit.setSiwsSession(makeSiwsSession());
    expect(() => appkit.requireAuth()).not.toThrow();
    expect(appkit.requireAuth()).toBeUndefined();
  });

  test('throws when the session has expired (getter auto-clears first)', () => {
    const appkit = makeAppkit();
    appkit.setSiwsSession(makeSiwsSession({ expiry: Date.now() - 1000 }));
    // siwsSession getter auto-clears, so requireAuth sees null and throws.
    expect(() => appkit.requireAuth()).toThrow(ConnectError);
  });
});

describe('StellarAppKit SIWS — validateSession', () => {
  test('returns null when no siwsConfig is set', async () => {
    const appkit = makeAppkit();
    await appkit.connect('freighter');
    appkit.setSiwsSession(makeSiwsSession());

    const result = await appkit.validateSession();

    expect(result).toBeNull();
  });

  test('returns null when no wallet session is active', async () => {
    const { config } = makeSpySiwsConfig();
    const appkit = makeAppkit({ siwsConfig: config });
    // No connect() — no active session.
    appkit.setSiwsSession(makeSiwsSession());

    const result = await appkit.validateSession();

    expect(result).toBeNull();
  });

  test('uses refresh() when configured (preferred over session())', async () => {
    const freshSession = makeSiwsSession({ expiry: Date.now() + 2 * 60 * 60 * 1000 });
    const { config, counts } = makeSpySiwsConfig({
      refreshReturn: freshSession,
    });
    const appkit = makeAppkit({ siwsConfig: config });
    await appkit.connect('freighter');
    appkit.setSiwsSession(makeSiwsSession());

    await appkit.validateSession();

    expect(counts.refresh).toBe(1);
    expect(counts.session).toBe(0); // session() NOT called when refresh is configured
  });

  test('falls back to session() when refresh is not configured', async () => {
    const freshSession = makeSiwsSession({ expiry: Date.now() + 2 * 60 * 60 * 1000 });
    const { config, counts } = makeSpySiwsConfig({
      sessionReturn: freshSession,
    });
    // Remove refresh so the fallback path is exercised.
    delete (config as Partial<SiwsConfig>).refresh;
    const appkit = makeAppkit({ siwsConfig: config });
    await appkit.connect('freighter');
    appkit.setSiwsSession(makeSiwsSession());

    await appkit.validateSession();

    expect(counts.session).toBe(1);
  });

  test('clears the session when the server returns null', async () => {
    const { config } = makeSpySiwsConfig({ refreshReturn: null });
    const appkit = makeAppkit({ siwsConfig: config });
    await appkit.connect('freighter');
    appkit.setSiwsSession(makeSiwsSession());

    const result = await appkit.validateSession();

    expect(result).toBeNull();
    expect(appkit.siwsSession).toBeNull();
  });

  test('clears the session when refresh() throws (treats exception as invalid)', async () => {
    const config: SiwsConfig = {
      statement: 'x',
      session: async () => null,
      nonce: async () => 'n',
      verify: async () => null,
      signout: async () => true,
      refresh: async () => { throw new Error('server down'); },
    };
    const appkit = makeAppkit({ siwsConfig: config });
    await appkit.connect('freighter');
    appkit.setSiwsSession(makeSiwsSession());

    const result = await appkit.validateSession();

    expect(result).toBeNull();
    expect(appkit.siwsSession).toBeNull();
  });

  test('clears the session when the server-returned address does not match the connected wallet', async () => {
    const mismatched = makeSiwsSession({ address: OTHER_ADDRESS });
    const { config } = makeSpySiwsConfig({ refreshReturn: mismatched });
    const appkit = makeAppkit({ siwsConfig: config });
    await appkit.connect('freighter'); // connects with TEST_ADDRESS
    appkit.setSiwsSession(makeSiwsSession()); // local session has TEST_ADDRESS

    const result = await appkit.validateSession();

    expect(result).toBeNull();
    expect(appkit.siwsSession).toBeNull();
  });

  test('clears the session when the server-returned network does not match', async () => {
    const mismatched = makeSiwsSession({ network: 'PUBLIC' });
    const { config } = makeSpySiwsConfig({ refreshReturn: mismatched });
    const appkit = makeAppkit({ siwsConfig: config });
    await appkit.connect('freighter'); // TESTNET
    appkit.setSiwsSession(makeSiwsSession()); // TESTNET

    const result = await appkit.validateSession();

    expect(result).toBeNull();
    expect(appkit.siwsSession).toBeNull();
  });

  test('clears the session when the server-returned session is expired', async () => {
    const expired = makeSiwsSession({ expiry: Date.now() - 1000 });
    const { config } = makeSpySiwsConfig({ refreshReturn: expired });
    const appkit = makeAppkit({ siwsConfig: config });
    await appkit.connect('freighter');
    appkit.setSiwsSession(makeSiwsSession());

    const result = await appkit.validateSession();

    expect(result).toBeNull();
    expect(appkit.siwsSession).toBeNull();
  });

  test('accepts and stores the fresh session when all checks pass', async () => {
    const fresh = makeSiwsSession({
      expiry: Date.now() + 2 * 60 * 60 * 1000, // extended expiry
      metadata: { statement: 'refreshed' },
    });
    const { config } = makeSpySiwsConfig({ refreshReturn: fresh });
    const appkit = makeAppkit({ siwsConfig: config });
    await appkit.connect('freighter');
    appkit.setSiwsSession(makeSiwsSession());

    const result = await appkit.validateSession();

    expect(result).toEqual(fresh);
    expect(appkit.siwsSession).toEqual(fresh);
  });

  test('accepts a server-returned session with no expiry field (treated as non-expiring)', async () => {
    const noExpiry: SiwsSession = {
      network: 'TESTNET',
      address: TEST_ADDRESS,
      expiry: 0,
    };
    const { config } = makeSpySiwsConfig({ refreshReturn: noExpiry });
    const appkit = makeAppkit({ siwsConfig: config });
    await appkit.connect('freighter');
    appkit.setSiwsSession(makeSiwsSession());

    const result = await appkit.validateSession();

    expect(result).toEqual(noExpiry);
    expect(appkit.siwsSession).toEqual(noExpiry);
  });
});

describe('StellarAppKit SIWS — reauthenticate', () => {
  test('clears the current session', async () => {
    const appkit = makeAppkit();
    appkit.setSiwsSession(makeSiwsSession());

    await appkit.reauthenticate();

    expect(appkit.siwsSession).toBeNull();
  });

  test('emits siwsSessionChange with null', async () => {
    const appkit = makeAppkit();
    appkit.setSiwsSession(makeSiwsSession());
    const calls: (SiwsSession | null)[] = [];
    appkit.on('siwsSessionChange', (s) => calls.push(s));

    await appkit.reauthenticate();

    expect(calls).toContain(null);
  });

  test('is safe to call when no session is set', async () => {
    const appkit = makeAppkit();
    await expect(appkit.reauthenticate()).resolves.toBeUndefined();
    expect(appkit.siwsSession).toBeNull();
  });
});

describe('StellarAppKit SIWS — restoreSiwsSession (via restore)', () => {
  // restoreSiwsSession is private, but it's called by restore() when
  // siwsConfig is set + at least one wallet session was restored.
  // We exercise it by populating storage with a wallet session + a SIWS
  // session, then calling restore().

  test('restores a valid (non-expired) SIWS session from storage', async () => {
    const storage = createMemoryStorage();
    // Manually write a SIWS session into storage the same way setSiwsSession does.
    const session = makeSiwsSession({ expiry: Date.now() + 60 * 60 * 1000 });
    storage.setItem('saganta-appkit:siws-session', JSON.stringify(session));

    // Also need a wallet session for restore() to succeed — otherwise it
    // short-circuits and never calls restoreSiwsSession(). We seed storage
    // with a freighter session by connecting once, then construct a fresh
    // appkit pointing at the same storage.
    const seeder = makeAppkit({ storage });
    await seeder.connect('freighter');
    // Re-write the SIWS session because connect() may have triggered a persist.
    storage.setItem('saganta-appkit:siws-session', JSON.stringify(session));

    // Now construct a fresh appkit on the same storage and call restore().
    const { config } = makeSpySiwsConfig();
    const appkit = makeAppkit({ storage, siwsConfig: config });
    expect(appkit.siwsSession).toBeNull(); // before restore

    await appkit.restore();

    expect(appkit.siwsSession).toEqual(session);
  });

  test('clears an expired SIWS session from storage (does not restore it)', async () => {
    const storage = createMemoryStorage();
    const expired = makeSiwsSession({ expiry: Date.now() - 1000 });
    storage.setItem('saganta-appkit:siws-session', JSON.stringify(expired));

    const seeder = makeAppkit({ storage });
    await seeder.connect('freighter');
    storage.setItem('saganta-appkit:siws-session', JSON.stringify(expired));

    const { config } = makeSpySiwsConfig();
    const appkit = makeAppkit({ storage, siwsConfig: config });

    await appkit.restore();

    expect(appkit.siwsSession).toBeNull();
    // The expired entry should have been removed from storage.
    expect(storage.getItem('saganta-appkit:siws-session')).toBeNull();
  });

  test('ignores corrupted storage (invalid JSON) without throwing', async () => {
    const storage = createMemoryStorage();
    storage.setItem('saganta-appkit:siws-session', '{not valid json');

    const seeder = makeAppkit({ storage });
    await seeder.connect('freighter');
    storage.setItem('saganta-appkit:siws-session', '{not valid json');

    const { config } = makeSpySiwsConfig();
    const appkit = makeAppkit({ storage, siwsConfig: config });

    // restore() should not throw on corrupted storage.
    await expect(appkit.restore()).resolves.toBeDefined();
    expect(appkit.siwsSession).toBeNull();
  });

  test('does NOT call restoreSiwsSession when siwsConfig is not set', async () => {
    // Even if a SIWS session is in storage, restore() only calls
    // restoreSiwsSession when siwsConfig is set. This is by design —
    // without a siwsConfig, there's no way to validate or refresh the
    // restored session, so it's safer to leave it alone.
    const storage = createMemoryStorage();
    const session = makeSiwsSession();
    storage.setItem('saganta-appkit:siws-session', JSON.stringify(session));

    const seeder = makeAppkit({ storage });
    await seeder.connect('freighter');
    storage.setItem('saganta-appkit:siws-session', JSON.stringify(session));

    const appkit = makeAppkit({ storage }); // no siwsConfig

    await appkit.restore();

    expect(appkit.siwsSession).toBeNull();
  });

  test('does NOT call restoreSiwsSession when no wallet session was restored', async () => {
    // restoreSiwsSession is only called inside the `if (restored.length > 0)`
    // block in restore(). If no wallet session was restored, the SIWS session
    // is not restored either — even if siwsConfig is set.
    const storage = createMemoryStorage();
    const session = makeSiwsSession();
    storage.setItem('saganta-appkit:siws-session', JSON.stringify(session));

    const { config } = makeSpySiwsConfig();
    const appkit = makeAppkit({ storage, siwsConfig: config });
    // No wallet session in storage — restore() returns [] and skips SIWS restore.

    await appkit.restore();

    expect(appkit.siwsSession).toBeNull();
  });
});

describe('StellarAppKit SIWS — event type contract', () => {
  // Compile-time check: siwsSessionChange is part of StellarAppKitEvents.
  // If a developer removes it, this test fails to compile.
  test('siwsSessionChange is a declared event on the emitter', () => {
    const appkit = makeAppkit();
    // The `on` overload for 'siwsSessionChange' accepts (session: SiwsSession | null) => void.
    // TypeScript would fail to compile this if the event weren't declared.
    const off = appkit.on('siwsSessionChange', (_s: SiwsSession | null) => { /* noop */ });
    expect(typeof off).toBe('function');
    off();
  });

  test('StellarAppKitEvents includes siwsSessionChange: SiwsSession | null', () => {
    // Type-level test — asserts the event payload type at compile time.
    type Events = StellarAppKitEvents;
    type Payload = Events['siwsSessionChange'];
    // SiwsSession | null is assignable to Payload, and Payload is assignable
    // to SiwsSession | null — bidirectional assignability means they're equal.
    const _check1: Payload = null;
    const _check2: Payload = makeSiwsSession();
    void _check1;
    void _check2;
    expect(true).toBe(true);
  });
});

describe('StellarAppKit SIWS — SiwsError class', () => {
  // The SiwsError class is exported but never constructed by the SDK in
  // these unit tests (it's raised by the modal's SIWS flow). We just
  // verify the shape + discriminated type field.

  test('SiwsError is constructible with a type + message', async () => {
    const { SiwsError } = await import('../src/index.js');
    const err = new SiwsError('timeout', 'nonce fetch timed out');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('SiwsError');
    expect(err.type).toBe('timeout');
    expect(err.message).toBe('nonce fetch timed out');
  });

  test('SiwsError.type covers all documented discriminated values', async () => {
    const { SiwsError } = await import('../src/index.js');
    const cases = [
      'session-check-failed',
      'nonce-fetch-failed',
      'sign-rejected',
      'verify-failed',
      'session-mismatch',
      'session-expired',
      'timeout',
      'max-retries-exceeded',
      'cancelled',
    ] as const;
    for (const type of cases) {
      const err = new SiwsError(type, `test: ${type}`);
      expect(err.type).toBe(type);
    }
  });
});
