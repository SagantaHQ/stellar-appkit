/** localStorage-backed storage — the default on web. Falls back silently if unavailable (SSR, privacy mode). */
export function createWebStorage() {
    return {
        getItem(key) {
            try {
                return globalThis.localStorage?.getItem(key) ?? null;
            }
            catch {
                return null;
            }
        },
        setItem(key, value) {
            try {
                globalThis.localStorage?.setItem(key, value);
            }
            catch {
                /* ignore — e.g. private browsing quota */
            }
        },
        removeItem(key) {
            try {
                globalThis.localStorage?.removeItem(key);
            }
            catch {
                /* ignore */
            }
        },
    };
}
/**
 * In-memory storage — used as a fallback and in tests. React Native apps
 * should pass a real `ConnectStorage` backed by `@react-native-async-storage/async-storage`
 * (or `expo-secure-store` if session data should be encrypted at rest).
 */
export function createMemoryStorage() {
    const store = new Map();
    return {
        getItem: (key) => store.get(key) ?? null,
        setItem: (key, value) => void store.set(key, value),
        removeItem: (key) => void store.delete(key),
    };
}
export const SESSION_STORAGE_KEY = 'saganta-connect:session';
//# sourceMappingURL=storage.js.map