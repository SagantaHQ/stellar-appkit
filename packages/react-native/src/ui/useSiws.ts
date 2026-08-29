/**
 * useSiwsFlow — the React Native port of the web modal's SIWS
 * (Sign-In With Stellar) automatic authentication flow
 * (ui-web connect-modal.ts → triggerSiwsFlow()).
 *
 * Triggered after wallet connect succeeds when `client.siwsConfig` is
 * set. The flow, phase for phase with the web modal:
 *
 * 0. `siws-checking` — `siwsConfig.session()`; an existing valid session
 *    (address + network match, not expired) skips sign-in entirely
 * 1. `siws-nonce` — `siwsConfig.nonce()`
 * 2. `siws-signing` — `client.signIn({ statement, nonce })` (wallet prompt)
 * 3. `siws-verifying` — `siwsConfig.verify(result, nonce, ctx)`
 * 4. Validate the returned session (address / network / expiry)
 * 5. `client.setSiwsSession(session)` → success
 * 6. Any failure → `siws-error` with the extracted message + "Try again";
 *    the wallet is NOT disconnected on failure — only when the user
 *    dismisses the modal while `pending` (disconnectOnFail, default true)
 *    or explicitly cancels.
 *
 * Every step is wrapped in a `withTimeout` (siwsConfig.timeoutMs,
 * default 15s) and retries are capped (siwsConfig.maxRetries, default 3)
 * — after the cap the error becomes `siws.error_too_many_attempts`.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Vibration } from 'react-native';
import { t, type StellarAppKit, type SiwsSession } from '@saganta/stellar-appkit';

/** The SIWS phases — also the modal ViewIds (see types.ts). */
export type SiwsPhase = 'siws-checking' | 'siws-nonce' | 'siws-signing' | 'siws-verifying' | 'siws-error';

/** Mirrors the web modal's private fields (siwsPending / siwsRetryCount / …). */
export interface SiwsFlowState {
  /** Current phase, or null when the flow isn't running. */
  phase: SiwsPhase | null;
  /** Error message shown on the siws-error phase. */
  error: string | null;
  /** True from the first start() until success or explicit cancel/close. */
  pending: boolean;
}

/** Web: `withTimeout` helper — Promise.race against a rejection timer. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(t('error.request_timed_out'))), ms)
    ),
  ]);
}

/** Web: extractErrorMessage — pull a human-readable message from anything. */
export function extractSiwsErrorMessage(err: unknown): string {
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message || String(err);
  if (err && typeof err === 'object') {
    const e = err as { message?: string; reason?: string };
    if (e.message) return e.message;
    if (e.reason) return e.reason;
  }
  return t('siws.error_generic');
}

/** Web: session validity check (address + network + expiry). */
export function siwsSessionIsValid(
  session: SiwsSession,
  address: string,
  network: string
): boolean {
  return (
    session.address === address &&
    session.network === network &&
    (!session.expiry || session.expiry > Date.now())
  );
}

export interface UseSiwsFlow {
  state: SiwsFlowState;
  /** Kicks off the flow (no-op when siwsConfig is absent). */
  start: () => Promise<void>;
  /** User pressed Cancel — stop, optionally disconnect (disconnectOnFail). */
  cancel: () => void;
  /** User pressed "Try again" — resets the retry counter and re-runs. */
  retry: () => void;
}

/**
 * @param client   the StellarAppKit instance
 * @param onDone   called when sign-in succeeds (the modal switches to the
 *                 account view)
 * @param onWalletList called when a retry is impossible because the wallet
 *                 got disconnected — the modal returns to the wallet list
 */
export function useSiwsFlow(
  client: StellarAppKit,
  onDone: () => void,
  onWalletList: () => void
): UseSiwsFlow {
  const [state, setState] = useState<SiwsFlowState>({
    phase: null,
    error: null,
    pending: false,
  });
  const retryCount = useRef(0);
  const cancelled = useRef(false);
  const inFlight = useRef(false);

  // Stable callbacks across re-renders (the modal recreates on every state
  // change; the flow itself must not restart).
  const doneRef = useRef(onDone);
  const listRef = useRef(onWalletList);
  useEffect(() => {
    doneRef.current = onDone;
    listRef.current = onWalletList;
  });

  const siws = client.siwsConfig;

  const run = useCallback(async () => {
    if (!client.siwsConfig) return;
    if (inFlight.current) return;
    inFlight.current = true;
    const cfg = client.siwsConfig;
    const maxRetries = cfg.maxRetries ?? 3;
    const timeoutMs = cfg.timeoutMs ?? 15000;
    cancelled.current = false;
    setState((s) => ({ ...s, pending: true }));

    const fail = async (err: unknown) => {
      if (cancelled.current) return;
      const msg = extractSiwsErrorMessage(err);
      retryCount.current += 1;
      const error =
        retryCount.current >= maxRetries
          ? t('siws.error_too_many_attempts', { maxRetries })
          : msg;
      setState({ phase: 'siws-error', error, pending: true });
      Vibration.vibrate([30, 50, 30]);
    };

    try {
      // Step 0 — existing session?
      setState((s) => ({ ...s, phase: 'siws-checking', error: null }));
      const existing = await withTimeout(cfg.session(), timeoutMs);
      const session = client.session;
      if (existing && session && siwsSessionIsValid(existing, session.address, session.network)) {
        client.setSiwsSession(existing);
        retryCount.current = 0;
        setState({ phase: null, error: null, pending: false });
        Vibration.vibrate(15);
        doneRef.current();
        return;
      }

      // Step 1 — nonce
      setState((s) => ({ ...s, phase: 'siws-nonce' }));
      const nonce = await withTimeout(cfg.nonce(), timeoutMs);

      // Step 2 — wallet sign-in
      setState((s) => ({ ...s, phase: 'siws-signing' }));
      const result = await client.signIn({ statement: cfg.statement, nonce });

      // Step 3 — server verification
      setState((s) => ({ ...s, phase: 'siws-verifying' }));
      const siwsSession = await withTimeout(
        cfg.verify(result, nonce, {
          address: client.session?.address ?? result.signerAddress,
          network: client.session?.network ?? 'UNKNOWN',
        }),
        timeoutMs
      );

      if (!siwsSession) {
        await fail(t('siws.error_verification_failed'));
        return;
      }

      // Step 4 — validate the returned session
      const session2 = client.session;
      if (session2) {
        const addressMatches = siwsSession.address === session2.address;
        const networkMatches = siwsSession.network === session2.network;
        const notExpired = !siwsSession.expiry || siwsSession.expiry > Date.now();
        if (!addressMatches || !networkMatches || !notExpired) {
          const reason = !addressMatches
            ? t('siws.error_address_mismatch')
            : !networkMatches
              ? t('siws.error_network_mismatch')
              : t('siws.error_session_expired');
          await fail(reason);
          return;
        }
      }

      // Step 5 — store + success
      client.setSiwsSession(siwsSession);
      retryCount.current = 0;
      setState({ phase: null, error: null, pending: false });
      Vibration.vibrate(15);
      doneRef.current();
    } catch (err) {
      await fail(err);
    } finally {
      inFlight.current = false;
    }
  }, [client]);

  const start = useCallback(() => {
    if (!siws) return Promise.resolve();
    return run();
  }, [siws, run]);

  const cancel = useCallback(() => {
    cancelled.current = true;
    retryCount.current = 0;
    setState({ phase: null, error: null, pending: false });
    if (siws) {
      const disconnectOnFail = siws.disconnectOnFail !== false;
      if (disconnectOnFail && client.session) {
        void client.disconnect();
      }
    }
  }, [client, siws]);

  const retry = useCallback(() => {
    retryCount.current = 0; // manual retry resets the cap (web parity)
    if (client.session) {
      void run();
    } else {
      setState({ phase: null, error: null, pending: false });
      listRef.current();
    }
  }, [client, run]);

  return { state, start, cancel, retry };
}
