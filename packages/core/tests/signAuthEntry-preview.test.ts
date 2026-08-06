import { test, expect, describe, mock, beforeEach } from 'bun:test';
import { StellarAppKit } from '../src/client.js';
import { createFreighterConnector } from '../src/connectors/freighter.js';
import type { AuthEntryPreview } from '../src/index.js';

/**
 * Tests that `signAuthEntry()` actually invokes the
 * `onPreviewAuthEntry` hook before reaching the wallet, that
 * rejecting the preview cancels the request, and that `skipPreview:
 * true` bypasses the hook.
 *
 * The wallet connector itself is mocked via the freighter-api mock —
 * what we're testing here is the wiring inside StellarAppKit, not the
 * connector's behavior (that's covered in freighter.test.ts).
 */

type FreighterApi = {
  isConnected: () => Promise<{ error?: string }>;
  setAllowed: () => Promise<unknown>;
  getAddress: () => Promise<{ address: string; error?: string }>;
  getNetworkDetails: () => Promise<{ network: string; networkPassphrase: string; error?: string }>;
  signMessage: (m: string, o?: unknown) => Promise<{ signedMessage: Buffer | string; signerAddress: string; error?: string }>;
  signAuthEntry: (e: string, o?: unknown) => Promise<{ signedAuthEntry: Buffer | string; signerAddress: string; error?: string }>;
  signTransaction: (x: string, o?: unknown) => Promise<{ signedTxXdr: string; signerAddress: string; error?: string }>;
};

let fakeApi: Partial<FreighterApi> = {};

const defaults: FreighterApi = {
  isConnected: async () => ({ error: undefined }),
  setAllowed: async () => ({}),
  getAddress: async () => ({ address: 'GA2C5RFPE6GCKMY3US5PAB6UZLKIGSPIUKSLRB6Q3IY7ZP4PAOMM43YA' }),
  getNetworkDetails: async () => ({ network: 'TESTNET', networkPassphrase: 'Test SDF Network ; September 2015' }),
  signTransaction: async () => ({ signedTxXdr: 'xdr', signerAddress: 'GA2C5RFPE6GCKMY3US5PAB6UZLKIGSPIUKSLRB6Q3IY7ZP4PAOMM43YA' }),
  signAuthEntry: async () => ({ signedAuthEntry: Buffer.alloc(64), signerAddress: 'GA2C5RFPE6GCKMY3US5PAB6UZLKIGSPIUKSLRB6Q3IY7ZP4PAOMM43YA' }),
  signMessage: async () => ({ signedMessage: Buffer.alloc(64), signerAddress: 'GA2C5RFPE6GCKMY3US5PAB6UZLKIGSPIUKSLRB6Q3IY7ZP4PAOMM43YA' }),
};

mock.module('@stellar/freighter-api', () => ({
  isConnected: (...a: unknown[]) => (fakeApi.isConnected ?? defaults.isConnected)(...a),
  setAllowed: (...a: unknown[]) => (fakeApi.setAllowed ?? defaults.setAllowed)(...a),
  getAddress: (...a: unknown[]) => (fakeApi.getAddress ?? defaults.getAddress)(...a),
  getNetworkDetails: (...a: unknown[]) => (fakeApi.getNetworkDetails ?? defaults.getNetworkDetails)(...a),
  signTransaction: (x: string, o?: unknown) => (fakeApi.signTransaction ?? defaults.signTransaction)(x, o),
  signAuthEntry: (e: string, o?: unknown) => (fakeApi.signAuthEntry ?? defaults.signAuthEntry)(e, o),
  signMessage: (m: string, o?: unknown) => (fakeApi.signMessage ?? defaults.signMessage)(m, o),
}));

beforeEach(() => {
  fakeApi = {};
});

/** Builds a real SorobanAuthorizationEntry XDR for testing. */
async function buildAuthEntryXdr(): Promise<string> {
  const sdk = await import('@stellar/stellar-sdk');
  // Real contract ID generated via Address.contract(sha256('contract-a'))
  // — using a fake 'CA...' string fails StrKey.isValidContract's checksum
  // validation, so Address.fromString throws.
  const contractId = 'CBETT2CXOWNPF5JYWBYB4BHNC4TPQEVABBKDDFE46S63JYXPUQK656HH';
  const contractAddress = sdk.Address.fromString(contractId).toScAddress();

  const rootFn = sdk.xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
    new sdk.xdr.InvokeContractArgs({
      contractAddress,
      // functionName is an ScSymbol (typed XDR string), not an ScVal —
      // pass the plain string and the XDR layer coerces it.
      functionName: 'transfer',
      // args is a plain ScVal[] (not an ScVec instance — that's a type alias)
      args: [],
    })
  );

  const rootInvocation = new sdk.xdr.SorobanAuthorizedInvocation({
    function: rootFn,
    subInvocations: [],
  });

  const entry = new sdk.xdr.SorobanAuthorizationEntry({
    credentials: sdk.xdr.SorobanCredentials.sorobanCredentialsSourceAccount(),
    rootInvocation,
  });

  return entry.toXDR('base64');
}

describe('StellarAppKit.signAuthEntry — preview wiring', () => {
  async function makeConnectedAppkit(opts: {
    onPreviewAuthEntry?: (p: AuthEntryPreview) => Promise<boolean>;
  } = {}): Promise<StellarAppKit> {
    const appkit = new StellarAppKit({
      connectors: [createFreighterConnector()],
      network: 'TESTNET',
      appMetadata: { name: 'Test', domain: 'localhost', uri: 'http://localhost:3000' },
      onPreviewAuthEntry: opts.onPreviewAuthEntry,
    });
    await appkit.connect('freighter');
    return appkit;
  }

  test('invokes onPreviewAuthEntry before reaching the wallet', async () => {
    const authXdr = await buildAuthEntryXdr();
    let captured: AuthEntryPreview | null = null;

    const appkit = await makeConnectedAppkit({
      onPreviewAuthEntry: async (p) => {
        captured = p;
        return true; // approve
      },
    });

    await appkit.signAuthEntry(authXdr);

    expect(captured).not.toBeNull();
    expect(captured!.authorizedFunctions).toEqual(['transfer']);
    expect(captured!.raw.authEntryXdr).toBe(authXdr);
  });

  test('cancels the wallet request when the preview handler returns false', async () => {
    const authXdr = await buildAuthEntryXdr();

    let walletCalled = false;
    fakeApi.signAuthEntry = async () => {
      walletCalled = true;
      return { signedAuthEntry: Buffer.alloc(64), signerAddress: 'GA2C5RFPE6GCKMY3US5PAB6UZLKIGSPIUKSLRB6Q3IY7ZP4PAOMM43YA' };
    };

    const appkit = await makeConnectedAppkit({
      onPreviewAuthEntry: async () => false, // reject
    });

    await expect(appkit.signAuthEntry(authXdr)).rejects.toThrow(/rejected/i);
    expect(walletCalled).toBe(false);
  });

  test('bypasses the preview when skipPreview: true', async () => {
    const authXdr = await buildAuthEntryXdr();

    let handlerCalled = false;
    const appkit = await makeConnectedAppkit({
      onPreviewAuthEntry: async () => {
        handlerCalled = true;
        return true;
      },
    });

    await appkit.signAuthEntry(authXdr, { skipPreview: true });
    expect(handlerCalled).toBe(false);
  });

  test('does NOT invoke onPreviewAuthEntry when no handler is set', async () => {
    // No handler configured — the request goes straight to the wallet
    // without any preview. This is the legacy behavior, preserved for
    // callers that haven't opted into the preview flow.
    const authXdr = await buildAuthEntryXdr();
    const appkit = await makeConnectedAppkit(); // no onPreviewAuthEntry

    // Should not throw — the wallet mock returns a valid signature.
    const result = await appkit.signAuthEntry(authXdr);
    expect(result.signerAddress).toBe('GA2C5RFPE6GCKMY3US5PAB6UZLKIGSPIUKSLRB6Q3IY7ZP4PAOMM43YA');
  });

  test('passes previewOptions through to buildAuthEntryPreview', async () => {
    // The verifier contracts option should reach the preview builder
    // so the unverified-contract flag fires correctly.
    const authXdr = await buildAuthEntryXdr();
    let captured: AuthEntryPreview | null = null;

    const appkit = new StellarAppKit({
      connectors: [createFreighterConnector()],
      network: 'TESTNET',
      appMetadata: { name: 'Test', domain: 'localhost', uri: 'http://localhost:3000' },
      previewOptions: {
        // A different contract ID than the one in the auth entry —
        // so the entry's contract is unverified.
        verifiedContracts: new Set(['CCQ3UBSHW3SRJKOM4QJGH2BG32Y6GGZXR7IFZQ5XZXCJMHIBEBR3TXDD']),
      },
      onPreviewAuthEntry: async (p) => {
        captured = p;
        return true;
    },
    });
    await appkit.connect('freighter');

    await appkit.signAuthEntry(authXdr);
    expect(captured).not.toBeNull();
    expect(captured!.riskFlags.some(f => f.code === 'unverified-contract')).toBe(true);
  });
});
