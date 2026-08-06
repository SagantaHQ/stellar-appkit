import { test, expect, describe, mock, beforeEach } from 'bun:test';

/**
 * Framework modal component tests.
 *
 * These tests verify the contract of the `<StellarAppKitModal>` wrapper
 * components shipped from each framework subpath (`/react`, `/vue`,
 * `/solid`, `/svelte`). We can't run a real DOM in bun:test, so we test:
 *
 * - The component is exported from the framework subpath.
 * - The shared prop types (`StellarAppKitModalProps`, `StellarAppKitModalHandle`)
 *   are exported as types.
 * - The `propsToAttributes` helper translates camelCase props to the
 *   kebab-case attributes the underlying Web Component expects.
 * - The wrapper does NOT import `connect-modal.ts` (so it stays SSR-safe —
 *   that module's `class extends HTMLElement` would crash in pure-Node).
 * - The Svelte action `stellarmodal` is a function that takes a node and
 *   returns `{ destroy() }`.
 *
 * Full render-cycle tests (mount the component in a real DOM, verify the
 * client gets assigned, verify events fire) live in the example apps.
 */

// Mock freighter-api so importing the core client doesn't blow up.
type FreighterApi = {
  isConnected: () => Promise<{ error?: string }>;
  setAllowed: () => Promise<unknown>;
  getAddress: () => Promise<{ address: string; error?: string }>;
  getNetworkDetails: () => Promise<{ network: string; networkPassphrase: string; error?: string }>;
  signMessage: (m: string, o?: unknown) => Promise<{ signedMessage: Buffer | string; signerAddress: string; error?: string }>;
  signTransaction: (x: string, o?: unknown) => Promise<{ signedTxXdr: string; signerAddress: string; error?: string }>;
};
const defaults: FreighterApi = {
  isConnected: async () => ({ error: undefined }),
  setAllowed: async () => ({}),
  getAddress: async () => ({ address: 'GA2C5RFPE6GCKMY3US5PAB6UZLKIGSPIUKSLRB6Q3IY7ZP4PAOMM43YA' }),
  getNetworkDetails: async () => ({ network: 'TESTNET', networkPassphrase: 'Test SDF Network ; September 2015' }),
  signTransaction: async () => ({ signedTxXdr: 'xdr', signerAddress: 'GA2C5RFPE6GCKMY3US5PAB6UZLKIGSPIUKSLRB6Q3IY7ZP4PAOMM43YA' }),
  signMessage: async () => ({ signedMessage: Buffer.alloc(64), signerAddress: 'GA2C5RFPE6GCKMY3US5PAB6UZLKIGSPIUKSLRB6Q3IY7ZP4PAOMM43YA' }),
};
mock.module('@stellar/freighter-api', () => ({
  isConnected: () => defaults.isConnected(),
  setAllowed: () => defaults.setAllowed(),
  getAddress: () => defaults.getAddress(),
  getNetworkDetails: () => defaults.getNetworkDetails(),
  signTransaction: (x: string, o?: unknown) => defaults.signTransaction(x, o),
  signMessage: (m: string, o?: unknown) => defaults.signMessage(m, o),
}));

beforeEach(() => {});

// ---------------------------------------------------------------------------
// Shared prop + attribute helper
// ---------------------------------------------------------------------------

describe('Modal props — shared helper', () => {
  test('propsToAttributes translates camelCase to kebab-case', async () => {
    const { propsToAttributes } = await import('../../src/ui-web/modal-props.js');
    const attrs = propsToAttributes({
      mode: 'auto',
      theme: 'dark',
      branding: 'minimal',
      logoSrc: '/logo.png',
      title: 'Connect a wallet',
      autoRetryNetwork: true,
      stellarExpertAvatars: false,
    });
    expect(attrs['mode']).toBe('auto');
    expect(attrs['theme']).toBe('dark');
    expect(attrs['branding']).toBe('minimal');
    expect(attrs['logo-src']).toBe('/logo.png');
    expect(attrs['title']).toBe('Connect a wallet');
    expect(attrs['auto-retry-network']).toBe('true');
    expect(attrs['stellar-expert-avatars']).toBe('false');
  });

  test('propsToAttributes omits undefined props', async () => {
    const { propsToAttributes } = await import('../../src/ui-web/modal-props.js');
    const attrs = propsToAttributes({
      mode: 'modal',
      // theme, branding, etc. all undefined
    });
    expect(Object.keys(attrs)).toEqual(['mode']);
  });

  test('StellarAppKitModalProps and StellarAppKitModalHandle are exported as types', async () => {
    // Type-only re-export — verify the module loads without throwing.
    const mod = await import('../../src/ui-web/modal-props.js');
    expect(mod.propsToAttributes).toBeDefined();
    expect(typeof mod.propsToAttributes).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// React
// ---------------------------------------------------------------------------

describe('React wrapper — <StellarAppKitModal>', () => {
  test('exports StellarAppKitModal as a forwardRef component', async () => {
    const w = await import('../../src/react/index.js');
    expect(w.StellarAppKitModal).toBeDefined();
    // forwardRef components are objects with $$typeof = Symbol(react.forward_ref)
    expect(typeof w.StellarAppKitModal).toBe('object');
    expect((w.StellarAppKitModal as { $$typeof?: symbol }).$$typeof).toBeDefined();
  });

  test('the wrapper does NOT import connect-modal.ts (SSR safety)', async () => {
    // If it imported connect-modal.ts, importing the wrapper in a Node-only
    // environment (no HTMLElement) would throw. We're running in bun:test
    // without DOM, so a successful import here is the test.
    const w = await import('../../src/react/index.js');
    expect(w.StellarAppKitModal).toBeDefined();
  });

  test('default export is the same component', async () => {
    const modalMod = await import('../../src/react/modal.js');
    expect(modalMod.default).toBe(modalMod.StellarAppKitModal);
  });
});

// ---------------------------------------------------------------------------
// Vue
// ---------------------------------------------------------------------------

describe('Vue wrapper — <StellarAppKitModal>', () => {
  test('exports StellarAppKitModal as a defineComponent result', async () => {
    const w = await import('../../src/vue/index.js');
    expect(w.StellarAppKitModal).toBeDefined();
    // defineComponent returns an object with a setup function and props.
    const comp = w.StellarAppKitModal as unknown as {
      setup?: Function;
      props?: unknown;
      name?: string;
    };
    expect(typeof comp.setup).toBe('function');
    expect(comp.name).toBe('StellarAppKitModal');
  });

  test('the wrapper does NOT import connect-modal.ts (SSR safety)', async () => {
    const w = await import('../../src/vue/index.js');
    expect(w.StellarAppKitModal).toBeDefined();
  });

  test('default export is the same component', async () => {
    const modalMod = await import('../../src/vue/modal.js');
    expect(modalMod.default).toBe(modalMod.StellarAppKitModal);
  });
});

// ---------------------------------------------------------------------------
// Solid
// ---------------------------------------------------------------------------

describe('Solid wrapper — <StellarAppKitModal>', () => {
  test('exports StellarAppKitModal as a Component function', async () => {
    const w = await import('../../src/solid/index.js');
    expect(w.StellarAppKitModal).toBeDefined();
    expect(typeof w.StellarAppKitModal).toBe('function');
  });

  test('the wrapper does NOT import connect-modal.ts (SSR safety)', async () => {
    const w = await import('../../src/solid/index.js');
    expect(w.StellarAppKitModal).toBeDefined();
  });

  test('default export is the same component', async () => {
    const modalMod = await import('../../src/solid/modal.js');
    expect(modalMod.default).toBe(modalMod.StellarAppKitModal);
  });
});

// ---------------------------------------------------------------------------
// Svelte
// ---------------------------------------------------------------------------

describe('Svelte wrapper — use:stellarmodal action', () => {
  test('exports the stellarmodal action as a function', async () => {
    const w = await import('../../src/svelte/index.js');
    expect(w.stellarmodal).toBeDefined();
    expect(typeof w.stellarmodal).toBe('function');
  });

  test('exports openModal and closeModal imperative helpers', async () => {
    const w = await import('../../src/svelte/index.js');
    expect(typeof w.openModal).toBe('function');
    expect(typeof w.closeModal).toBe('function');
  });

  test('exports isStellarAppKitModal type guard', async () => {
    const w = await import('../../src/svelte/index.js');
    expect(typeof w.isStellarAppKitModal).toBe('function');
  });

  test('the wrapper does NOT import connect-modal.ts (SSR safety)', async () => {
    const w = await import('../../src/svelte/index.js');
    expect(w.stellarmodal).toBeDefined();
  });

  test('stellarmodal returns an object with a destroy function when given a fake node', async () => {
    const { setStellarAppKitContext, stellarmodal } = await import('../../src/svelte/index.js');
    const { createFreighterConnector } = await import('../../src/index.js');

    setStellarAppKitContext({
      network: 'TESTNET',
      connectors: [createFreighterConnector()],
      appMetadata: { name: 'Test', domain: 'test', uri: 'http://test' },
      restoreOnMount: false,
    });

    const fakeNode = {
      client: null,
    } as unknown as HTMLElement;
    const action = stellarmodal(fakeNode);
    expect(action).toBeDefined();
    expect(typeof action.destroy).toBe('function');
    action.destroy();
  });

  test('isStellarAppKitModal returns true for a saganta-appkit-modal tag', async () => {
    const { isStellarAppKitModal } = await import('../../src/svelte/index.js');
    const fakeModal = {
      tagName: 'SAGANTA-APPKIT-MODAL',
    } as unknown as HTMLElement;
    expect(isStellarAppKitModal(fakeModal)).toBe(true);
    const fakeOther = {
      tagName: 'DIV',
    } as unknown as HTMLElement;
    expect(isStellarAppKitModal(fakeOther)).toBe(false);
  });
});
