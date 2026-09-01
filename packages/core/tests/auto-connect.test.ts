/**
 * Tests for `StellarAppKitConfig.autoConnect` — the constructor-scheduled
 * restore() that gives apps "auto connect and login" without wiring their
 * own mount effect. On React Native this is the pair-once / resume-every-
 * start switch (wallet session +, when configured, a still-valid SIWS
 * session) — with the restore deferred past the startup window there,
 * because its WalletConnect rehydrate path evaluates the whole WC SDK
 * synchronously and must never race the app's first paint.
 *
 * Freightere API is mocked like siws-session.test.ts so a real StellarAppKit
 * (with a real freighter connector) can be constructed against
 * createMemoryStorage() and exercised end to end.
 */

import { test, expect, describe, mock, beforeEach } from 'bun:test';
import { StellarAppKit } from '../src/client.js';
import { createFreighterConnector } from '../src/connectors/freighter.js';
import { createMemoryStorage } from '../src/storage.js';

type FreighterApi = {
  isConnected: () => Promise<{ isConnected: boolean; error?: string }>;
  setAllowed: () => Promise<unknown>;
  getAddress: () => Promise<{ address: string; error?: string }>;
  getNetworkDetails: () => Promise<{ network: string; networkPassphrase: string; error?: string }>;
  signMessage: (m: string, o?: unknown) => Promise<{ signedMessage: Buffer | string; signerAddress: string; error?: string }>;
  signTransaction: (x: string, o?: unknown) => Promise<{ signedTxXdr: string; signerAddress: string; error?: string }>;
  signAuthEntry: (e: string, o?: unknown) => Promise<{ signedAuthEntry: Buffer | string; signerAddress: string; error?: string }>;
};

const TEST_ADDRESS = 'GA2C5RFPE6GCKMY3US5PAB6UZLKIGSPIUKSLRB6Q3IY7ZP4PAOMM43YA';

const defaults: FreighterApi = {
  isConnected: async () => ({ isConnected: true, error: undefined }),
  setAllowed: async () => ({}),
  getAddress: async () => ({ address: TEST_ADDRESS, error: undefined }),
  getNetworkDetails: async () => ({
    network: 'TESTNET',
    networkPassphrase: 'Test SDF Network ; September 2015',
    error: undefined,
  }),
  signMessage: async () => ({ signedMessage: Buffer.alloc(64), signerAddress: TEST_ADDRESS, error: undefined }),
  signTransaction: async () => ({ signedTxXdr: 'xdr', signerAddress: TEST_ADDRESS }),
  signAuthEntry: async () => ({ signedAuthEntry: Buffer.alloc(64), signerAddress: TEST_ADDRESS }),
};

mock.module('@stellar/freighter-api', () => ({
  isConnected: (...a: unknown[]) => defaults.isConnected(...(a as [])),
  setAllowed: (...a: unknown[]) => defaults.setAllowed(...(a as [])),
  getAddress: (...a: unknown[]) => defaults.getAddress(...(a as [])),
  getNetworkDetails: (...a: unknown[]) => defaults.getNetworkDetails(...(a as [])),
  signTransaction: (x: string, o?: unknown) => defaults.signTransaction(x, o),
  signMessage: (m: string, o?: unknown) => defaults.signMessage(m, o),
  signAuthEntry: (e: string, o?: unknown) => defaults.signAuthEntry(e, o),
}));

beforeEach(() => {
  (globalThis as unknown as { freighter?: boolean }).freighter = true;
});

function makeAppkit(opts: { storage?: ReturnType<typeof createMemoryStorage>; autoConnect?: boolean } = {}) {
  return new StellarAppKit({
    connectors: [createFreighterConnector()],
    network: 'TESTNET',
    appMetadata: { name: 'Test', domain: 'localhost', uri: 'http://localhost:3000' },
    storage: opts.storage ?? createMemoryStorage(),
    ...(opts.autoConnect ? { autoConnect: true } : {}),
  });
}

describe('StellarAppKitConfig.autoConnect', () => {
  test('off by default: construction does NOT read persisted sessions', async () => {
    const storage = createMemoryStorage();
    const appkit = makeAppkit({ storage });
    // Give any (wrongly) scheduled restore ample time to land.
    await new Promise((r) => setTimeout(r, 25));
    expect(storage.getItem('saganta-connect:session')).toBeNull();
    expect(appkit.status).toBe('idle');
    expect(appkit.session).toBeNull();
  });

  test('on: restores a persisted wallet session from storage on construction', async () => {
    const storage = createMemoryStorage();
    // Seed a session by connecting once with a plain (non-auto) client.
    const seeder = makeAppkit({ storage });
    await seeder.connect('freighter');
    expect(storage.getItem('saganta-connect:session')).not.toBeNull();

    // Fresh client on the same storage with autoConnect — no manual restore().
    const appkit = makeAppkit({ storage, autoConnect: true });
    // restore() is async (storage read + reachability + getAddress); poll
    // until it settles instead of guessing a single sleep duration.
    const deadline = Date.now() + 2000;
    while (appkit.status !== 'connected' && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(appkit.status).toBe('connected');
    expect(appkit.session?.address).toBe(TEST_ADDRESS);
    expect(appkit.session?.walletId).toBe('freighter');
  });

  test('on with empty storage: settles back to idle without side effects', async () => {
    const storage = createMemoryStorage();
    const appkit = makeAppkit({ storage, autoConnect: true });
    const deadline = Date.now() + 1000;
    while (appkit.status === 'connecting' && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(appkit.status).toBe('idle');
    expect(appkit.session).toBeNull();
    expect(appkit.restore).toBeDefined(); // public restore still available for explicit control
  });

  test('on + manual restore() on the same client: the second call is a harmless no-op repeat', async () => {
    const storage = createMemoryStorage();
    const seeder = makeAppkit({ storage });
    await seeder.connect('freighter');

    const appkit = makeAppkit({ storage, autoConnect: true });
    const deadline = Date.now() + 2000;
    while (appkit.status !== 'connected' && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 10));
    }
    // The app's own mount-effect restore (still common in existing code)
    // re-runs on the same storage — must not throw or duplicate sessions.
    const restored = await appkit.restore();
    expect(restored.length).toBe(1);
    expect(appkit.sessions.length).toBe(1);
    expect(appkit.session?.address).toBe(TEST_ADDRESS);
  });

  test('on with siws config: auto-restored connect carries the SIWS session back (auto login)', async () => {
    const storage = createMemoryStorage();
    // Seed wallet + SIWS session storage the way the app would leave it.
    const siwsSession = {
      network: 'TESTNET',
      address: TEST_ADDRESS,
      expiry: Date.now() + 60 * 60 * 1000,
      metadata: { statement: 'Sign in to test app' },
    };
    const seeder = makeAppkit({ storage });
    await seeder.connect('freighter');
    storage.setItem('saganta-appkit:siws-session', JSON.stringify(siwsSession));

    const siwsConfig = {
      statement: 'Sign in to test app',
      nonce: async () => 'nonce',
      session: async () => null,
      verify: async () => null,
      signout: async () => true,
    };
    const appkit = new StellarAppKit({
      connectors: [createFreighterConnector()],
      network: 'TESTNET',
      appMetadata: { name: 'Test', domain: 'localhost', uri: 'http://localhost:3000' },
      storage,
      siws: siwsConfig,
      autoConnect: true,
    });
    const deadline = Date.now() + 2000;
    while ((appkit.status !== 'connected' || !appkit.siwsSession) && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(appkit.status).toBe('connected');
    expect(appkit.siwsSession?.address).toBe(TEST_ADDRESS); // logged back in, no prompts
  });

  test('on a React Native-like runtime: the auto restore is deferred past the startup window', async () => {
    const storage = createMemoryStorage();
    const seeder = makeAppkit({ storage });
    await seeder.connect('freighter');
    expect(storage.getItem('saganta-connect:session')).not.toBeNull();

    // Mark the runtime as Hermes — the same signal isReactNativeLikeRuntime()
    // checks in client.ts (core cannot import the RN package, so it reads
    // the global directly; 'HermesInternal' is the Expo Go-proof branch).
    const g = globalThis as { HermesInternal?: unknown };
    g.HermesInternal = {};
    try {
      const appkit = makeAppkit({ storage, autoConnect: true });
      // THE regression this pins: on RN the constructor-scheduled restore
      // used to start immediately, and its WalletConnect rehydrate path
      // evaluates the whole WC SDK synchronously — freezing the app's JS
      // thread right as the first screen painted (all buttons dead for
      // ~10s). The restore must NOT have run in the startup window.
      await new Promise((r) => setTimeout(r, 60));
      expect(appkit.status).not.toBe('connected');
      expect(appkit.session).toBeNull();

      // After the deferral window the session is back — auto connect still
      // works, it just doesn't race the app's startup.
      const deadline = Date.now() + 3000;
      while (appkit.status !== 'connected' && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 20));
      }
      expect(appkit.status).toBe('connected');
      expect(appkit.session?.address).toBe(TEST_ADDRESS);
    } finally {
      delete g.HermesInternal;
    }
  });
});
