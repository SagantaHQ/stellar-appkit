/**
 * Wraps a call into a specific wallet SDK and normalizes whatever it throws
 * (or returns as an `{ error }` field, which several wallet SDKs do instead
 * of throwing) into a ConnectError. Every adapter method should go through
 * this so app/UI code never has to special-case a wallet's error shape.
 */
export declare function withNormalizedError<T>(walletId: string, fn: () => Promise<T>, opts?: {
    rejectionHints?: RegExp[];
}): Promise<T>;
/** Normalizes the `{ result, error }` return shape used by several wallet SDKs (e.g. Freighter). */
export declare function unwrapResult<T extends {
    error?: unknown;
}>(walletId: string, result: T): Omit<T, 'error'>;
//# sourceMappingURL=error-utils.d.ts.map