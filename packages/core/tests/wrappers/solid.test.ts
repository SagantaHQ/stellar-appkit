import { test, expect, describe, mock, beforeEach } from 'bun:test';

/**
 * Solid wrapper smoke tests.
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
  return await import('../../src/solid/index.js');
}

describe('Solid wrapper — module structure', () => {
  test('exports the provider and all hooks', async () => {
    const w = await importWrapper();
    expect(typeof w.StellarAppKitProvider).toBe('function');
    expect(typeof w.useAppKit).toBe('function');
    expect(typeof w.useAppKitOptional).toBe('function');
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
});

describe('Solid wrapper — tree-shakability contract', () => {
  test('the solid subpath is a separate module (not bundled into the main entry)', async () => {
    const mainEntry = await import('../../src/index.js');
    expect(mainEntry.StellarAppKit).toBeDefined();
    expect((mainEntry as unknown as { solid?: unknown }).solid).toBeUndefined();

    const solidEntry = await importWrapper();
    expect(solidEntry.StellarAppKitProvider).toBeDefined();
    expect((solidEntry as unknown as { StellarAppKit?: unknown }).StellarAppKit).toBeUndefined();
  });
});
