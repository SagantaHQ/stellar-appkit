import type { ConnectStorage } from './types.js';
/** localStorage-backed storage — the default on web. Falls back silently if unavailable (SSR, privacy mode). */
export declare function createWebStorage(): ConnectStorage;
/**
 * In-memory storage — used as a fallback and in tests. React Native apps
 * should pass a real `ConnectStorage` backed by `@react-native-async-storage/async-storage`
 * (or `expo-secure-store` if session data should be encrypted at rest).
 */
export declare function createMemoryStorage(): ConnectStorage;
export declare const SESSION_STORAGE_KEY = "saganta-connect:session";
//# sourceMappingURL=storage.d.ts.map