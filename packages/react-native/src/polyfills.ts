/**
 * One-call polyfill setup for Stellar AppKit on React Native.
 *
 * React Native (Hermes/JSC) is missing two globals the Stellar + WalletConnect
 * JS stacks assume:
 *
 * - `Buffer` — used by `@stellar/stellar-sdk` (XDR encode/decode) and by
 *   several sign paths in AppKit core. Provided by the `buffer` npm package.
 * - `crypto.getRandomValues` — required by ed25519 (tweetnacl) key handling
 *   and the WalletConnect SDK. Provided by `react-native-get-random-values`.
 *
 * Install both packages, then call this once — at the very top of your
 * entry file, BEFORE any `@saganta/*` or `@stellar/*` import:
 *
 * ```ts
 * // index.js — first line
 * import { installPolyfills } from '@saganta/stellar-appkit-react-native/polyfills';
 * installPolyfills();
 *
 * import { AppRegistry } from 'react-native';
 * import App from './App';
 * // ... imports that need Buffer / crypto are now safe
 * ```
 *
 * (ES module imports hoist, but polyfills only need to be *installed before
 * the missing globals are used at runtime* — and every Buffer/crypto use in
 * this stack happens inside functions, never at module top level. AppKit
 * core guarantees that since v1.9.51.)
 */

export interface PolyfillResult {
  /** True when `global.Buffer` was installed (was missing before). */
  installedBuffer: boolean;
  /** True when `crypto.getRandomValues` was installed (was missing before). */
  installedGetRandomValues: boolean;
  /** True when @walletconnect/react-native-compat was imported successfully. */
  installedWalletConnectCompat: boolean;
  /** Non-fatal notes — e.g. a package isn't installed but its global already exists. */
  notes: string[];
}

export function installPolyfills(): PolyfillResult {
  const notes: string[] = [];
  const g = globalThis as Record<string, unknown>;

  // --- Buffer ---------------------------------------------------------------
  let installedBuffer = false;
  if (typeof g.Buffer === 'undefined') {
    try {
      // Static require so Metro resolves it at bundle time — it's a required
      // peer dependency, a missing install should fail loudly at build.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Buffer } = require('buffer') as { Buffer: unknown };
      g.Buffer = Buffer;
      installedBuffer = true;
    } catch (err) {
      notes.push(
        `Buffer is missing and the "buffer" package could not be loaded (${String(err)}). ` +
          'Run: npm install buffer'
      );
    }
  }

  // --- crypto.getRandomValues ------------------------------------------------
  let installedGetRandomValues = false;
  const cryptoObj = (g.crypto ?? {}) as { getRandomValues?: unknown };
  if (typeof cryptoObj.getRandomValues !== 'function') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('react-native-get-random-values');
      installedGetRandomValues = true;
    } catch (err) {
      notes.push(
        `crypto.getRandomValues is missing and "react-native-get-random-values" could not be loaded (${String(err)}). ` +
          'Run: npm install react-native-get-random-values'
      );
    }
  }

  // --- WalletConnect RN compat shims ----------------------------------------
  // @walletconnect/react-native-compat patches the WC SDK's internal storage
  // (localStorage → AsyncStorage) and event shims. Importing it is enough —
  // but only when the app actually uses the WalletConnect connector.
  let installedWalletConnectCompat = false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('@walletconnect/react-native-compat');
    installedWalletConnectCompat = true;
  } catch {
    notes.push(
      '@walletconnect/react-native-compat is not installed — required for the ' +
        'WalletConnect connector on React Native. Run: npm install @walletconnect/react-native-compat'
    );
  }

  return { installedBuffer, installedGetRandomValues, installedWalletConnectCompat, notes };
}
