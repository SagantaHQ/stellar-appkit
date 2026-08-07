import { test, expect, describe, mock, beforeEach } from 'bun:test';

/**
 * Vue wrapper smoke tests.
 *
 * Same strategy as the React tests — verify the module structure,
 * the plugin/composable surface, and the tree-shakability contract.
 * Full render-cycle tests live in the example apps.
 */

type FreighterApi = {
  isConnected: () => Promise<{ error?: string }>;
  setAllowed: () => Promise<unknown>;
  getAddress: () => Promise<{ address: string; error?: string }>;
  getNetworkDetails: () => Promise<{ network: string; networkPassphrase: string; error?: string }>;
  signMessage: (m: string, o?: unknown) => Promise<{ signedMessage: Buffer | string; signerAddress: string; error?: string }>;
  signTransaction: (x: string, o?: unknown) => Promise<{ signedTxXdr: string; signerAddress: string; error?: string }>;
};
let fakeApi: Partial<FreighterApi> = {};
const defaults: FreighterApi = {
  isConnected: async () => ({ error: undefined }),
  setAllowed: async () => ({}),
  getAddress: async () => ({ address: 'GA2C5RFPE6GCKMY3US5PAB6UZLKIGSPIUKSLRB6Q3IY7ZP4PAOMM43YA' }),
  getNetworkDetails: async () => ({ network: 'TESTNET', networkPassphrase: 'Test SDF Network ; September 2015' }),
  signTransaction: async () => ({ signedTxXdr: 'xdr', signerAddress: 'GA2C5RFPE6GCKMY3US5PAB6UZLKIGSPIUKSLRB6Q3IY7ZP4PAOMM43YA' }),
  signMessage: async () => ({ signedMessage: Buffer.alloc(64), signerAddress: 'GA2C5RFPE6GCKMY3US5PAB6UZLKIGSPIUKSLRB6Q3IY7ZP4PAOMM43YA' }),
};
mock.module('@stellar/freighter-api', () => ({
  isConnected: (...a: unknown[]) => (fakeApi.isConnected ?? defaults.isConnected)(...a),
  setAllowed: (...a: unknown[]) => (fakeApi.setAllowed ?? defaults.setAllowed)(...a),
  getAddress: (...a: unknown[]) => (fakeApi.getAddress ?? defaults.getAddress)(...a),
  getNetworkDetails: (...a: unknown[]) => (fakeApi.getNetworkDetails ?? defaults.getNetworkDetails)(...a),
  signTransaction: (x: string, o?: unknown) => (fakeApi.signTransaction ?? defaults.signTransaction)(x, o),
  signMessage: (m: string, o?: unknown) => (fakeApi.signMessage ?? defaults.signMessage)(m, o),
}));

beforeEach(() => { fakeApi = {}; });

async function importWrapper() {
  return await import('../src/vue/index.js');
}

describe('Vue wrapper — module structure', () => {
  test('exports the plugin, provide function, and all composables', async () => {
    const w = await importWrapper();
    expect(typeof w.provideStellarAppKit).toBe('function');
    expect(w.StellarAppKitPlugin).toBeDefined();
    expect(w.StellarAppKitPlugin.install).toBeDefined();
    expect(typeof w.StellarAppKitPlugin.install).toBe('function');
    expect(typeof w.useAppKit).toBe('function');
    expect(typeof w.useStatus).toBe('function');
    expect(typeof w.useSession).toBe('function');
    expect(typeof w.useSessions).toBe('function');
    expect(typeof w.useAddress).toBe('function');
    expect(typeof w.usePendingSignCount).toBe('function');
    expect(typeof w.useConnect).toBe('function');
    expect(typeof w.useSignTransaction).toBe('function');
    expect(typeof w.useSignMessage).toBe('function');
    expect(typeof w.useSignIn).toBe('function');
    expect(typeof w.useSoroban).toBe('function');
    expect(typeof w.usePreviewTransaction).toBe('function');
    expect(typeof w.usePreviewAuthEntry).toBe('function');
  });

  test('exports the injection key as a Symbol', async () => {
    const { APPKIT_INJECTION_KEY } = await importWrapper();
    expect(typeof APPKIT_INJECTION_KEY).toBe('symbol');
  });
});

describe('Vue wrapper — StellarAppKitPlugin.install', () => {
  test('constructs a client and provides it via app.provide()', async () => {
    const { StellarAppKitPlugin } = await importWrapper();
    const { createFreighterConnector } = await import('@saganta/stellar-appkit');

    let providedKey: unknown = null;
    let providedValue: unknown = null;
    const fakeApp = {
      provide(key: unknown, value: unknown) {
        providedKey = key;
        providedValue = value;
      },
    };

    StellarAppKitPlugin.install(fakeApp, {
      network: 'TESTNET',
      connectors: [createFreighterConnector()],
    });

    expect(providedKey).toBeDefined();
    expect(providedValue).toBeDefined();
    expect((providedValue as { network: string }).network).toBe('TESTNET');
  });
});

describe('Vue wrapper — tree-shakability contract', () => {
  test('the vue subpath is a separate module (not bundled into the main entry)', async () => {
    const mainEntry = await import('@saganta/stellar-appkit');
    expect(mainEntry.StellarAppKit).toBeDefined();
    expect((mainEntry as unknown as { vue?: unknown }).vue).toBeUndefined();

    const vueEntry = await importWrapper();
    expect(vueEntry.StellarAppKitPlugin).toBeDefined();
    expect((vueEntry as unknown as { StellarAppKit?: unknown }).StellarAppKit).toBeUndefined();
  });
});
