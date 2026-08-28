/**
 * Runtime platform detection for Stellar AppKit on React Native.
 *
 * Why not `typeof window`? React Native *defines* `window` — guards written
 * for SSR/Node (`typeof window === 'undefined'`) do NOT gate React Native.
 * The reliable signal on Hermes/JSC is `navigator.product === 'ReactNative'`,
 * which React Native has set since forever and which no browser sets.
 */

/** True when running inside a React Native (or Expo) runtime. */
export function isReactNativeRuntime(): boolean {
  if (typeof navigator !== 'undefined' && navigator.product === 'ReactNative') {
    return true;
  }
  // Expo Go and some embedded runtimes also expose this global.
  return typeof globalThis !== 'undefined' && 'HermesInternal' in globalThis;
}
