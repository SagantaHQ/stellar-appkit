/**
 * AsyncStorage-backed `ConnectStorage` for Stellar AppKit on React Native.
 *
 * Core's default storage is `localStorage` — which doesn't exist on React
 * Native, silently turning every write into a no-op (sessions never persist).
 * Pass this adapter instead:
 *
 * ```ts
 * import AsyncStorage from '@react-native-async-storage/async-storage';
 * import { createAsyncStorage } from '@saganta/stellar-appkit-react-native';
 *
 * const appkit = new StellarAppKit({
 *   network: 'TESTNET',
 *   storage: createAsyncStorage(AsyncStorage),
 *   ...
 * });
 * ```
 *
 * `ConnectStorage`'s three methods may return Promises by design, so an
 * async adapter is a first-class citizen — no polling, no shimming
 * `global.localStorage`.
 */

import type { ConnectStorage } from '@saganta/stellar-appkit';

/** Minimal storage interface AsyncStorage satisfies (also fits expo-secure-store wrappers). */
export interface KeyValueLikeStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/**
 * Wraps any AsyncStorage-shaped key/value store as a core `ConnectStorage`.
 * JSON values are stored as-is — core already serializes everything it
 * persists, so no extra encoding happens here.
 */
export function createAsyncStorage(storage: KeyValueLikeStorage): ConnectStorage {
  return {
    async getItem(key: string) {
      return storage.getItem(key);
    },
    async setItem(key: string, value: string) {
      await storage.setItem(key, value);
    },
    async removeItem(key: string) {
      await storage.removeItem(key);
    },
  };
}

/**
 * In-memory storage — sessions live exactly as long as the app process.
 * Useful for tests, for demos, or as an explicit "don't persist anything"
 * choice on RN.
 */
export function createMemoryStorage(): ConnectStorage {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => Promise.resolve(map.get(key) ?? null),
    setItem: (key: string, value: string) => {
      map.set(key, value);
      return Promise.resolve();
    },
    removeItem: (key: string) => {
      map.delete(key);
      return Promise.resolve();
    },
  };
}
