import { ConnectError } from '../types.js';

/**
 * Wraps a call into a specific wallet SDK and normalizes whatever it throws
 * (or returns as an `{ error }` field, which several wallet SDKs do instead
 * of throwing) into a ConnectError. Every adapter method should go through
 * this so app/UI code never has to special-case a wallet's error shape.
 */
export async function withNormalizedError<T>(
  walletId: string,
  fn: () => Promise<T>,
  opts?: { rejectionHints?: RegExp[] }
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw normalizeThrown(walletId, err, opts?.rejectionHints);
  }
}

function normalizeThrown(walletId: string, err: unknown, rejectionHints?: RegExp[]): ConnectError {
  if (err instanceof ConnectError) return err;

  // Wallet SDKs throw different shapes:
  //   - Error instances → err.message
  //   - Plain objects (xBull, some WC wallets) → err.message, err.error,
  //     err.toString(), or JSON.stringify
  //   - Strings → use directly
  // String(err) on a plain object produces "[object Object]" which is
  // useless. Extract the message from common shapes instead.
  let message: string;
  if (err instanceof Error) {
    message = err.message;
  } else if (typeof err === 'string') {
    message = err;
  } else if (typeof err === 'object' && err !== null) {
    const obj = err as {
      message?: string;
      error?: string | { message?: string };
      toString?: () => string;
    };
    message =
      obj.message ??
      (typeof obj.error === 'string' ? obj.error : obj.error?.message) ??
      (typeof obj.toString === 'function' && obj.toString() !== '[object Object]'
        ? obj.toString()
        : JSON.stringify(err)) ??
      'Unknown wallet error';
  } else {
    message = String(err);
  }

  const hints = rejectionHints ?? [/reject/i, /denied/i, /cancel/i, /declined/i];

  if (hints.some((re) => re.test(message))) {
    return ConnectError.rejected(walletId);
  }

  return ConnectError.internal(message, undefined, walletId);
}

/** Normalizes the `{ result, error }` return shape used by several wallet SDKs (e.g. Freighter). */
export function unwrapResult<T extends { error?: unknown }>(
  walletId: string,
  result: T
): Omit<T, 'error'> {
  if (result.error) {
    const message =
      typeof result.error === 'string'
        ? result.error
        : (result.error as { message?: string })?.message ?? 'Unknown wallet error';
    throw ConnectError.externalService(message, undefined, walletId);
  }
  return result;
}
