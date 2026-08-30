/**
 * Foreground relay refresh — the React Native antidote to WalletConnect's
 * zombie socket.
 *
 * THE BUG THIS KILLS: on RN, tapping a wallet deep-links into the wallet
 * app, which backgrounds THIS app; the OS then kills or zombifies the
 * WalletConnect relay WebSocket. The WC SDK's self-healing never fires on
 * RN (its ping watchdog only runs under Node, its online/offline listener
 * needs navigator.onLine or global.NetInfo — neither exists on a bare RN
 * runtime), so when the user approves in the wallet, the `session_settled`
 * message sits queued on the relay forever. `approval()` never resolves,
 * `connect()` never settles, and the modal stays on "Continue in {wallet}"
 * with a spinner — even though the wallet itself shows connected. The exact
 * same zombie hits sign requests: approve in the wallet, come back, and the
 * sign promise never settles.
 *
 * THE FIX: subscribe to AppState and, every time the app returns to
 * 'active', call the WalletConnect connector's `refreshTransport()` — a
 * forced relay disconnect → reconnect → resubscribe. The relay re-delivers
 * everything that queued while the socket was dead, the in-flight
 * approval()/request() resolves, and the modal advances on its own. The
 * connector no-ops when nothing relay-related is live, so an idle app
 * doesn't churn its socket.
 *
 * TWO SURFACES:
 * - `useWalletConnectForegroundRefresh(client)` — the React hook the
 *   `<AppKitModal>` installs for you while it is mounted.
 * - `attachWalletConnectForegroundRefresh(client)` — the standalone
 *   subscription for headless apps (no modal). Returns a detach function;
 *   one per client, please — it is not internal state the modal shares.
 */

import { useEffect } from 'react';
import { AppState } from 'react-native';
import type { StellarAppKit } from '@saganta/stellar-appkit';

/** Fires the refresh on one client — shared by the hook and the standalone attach. */
function refreshWalletConnect(client: StellarAppKit): void {
  try {
    client.registry.get('walletconnect')?.refreshTransport?.();
  } catch {
    // Registry access can throw for exotic client setups — a liveness nudge
    // must never crash the app.
  }
}

/**
 * Subscribes the AppKitModal's client to AppState foreground transitions
 * (installed by `<AppKitModal>`; no need to call this when rendering it).
 */
export function useWalletConnectForegroundRefresh(client: StellarAppKit): void {
  useEffect(() => attachWalletConnectForegroundRefresh(client), [client]);
}

/**
 * Headless subscription: on every AppState 'active' transition, restart the
 * WalletConnect relay so messages that queued while the app was backgrounded
 * (behind the wallet app) get delivered.
 *
 * ```ts
 * const detach = attachWalletConnectForegroundRefresh(client);
 * // ...on teardown / logout:
 * detach();
 * ```
 *
 * Fires only on 'active' — a 'background' transition can't have queued
 * relay traffic yet, and refreshing into a backgrounded app would just burn
 * the (suspended) JS loop on a socket the OS will kill anyway.
 *
 * @returns a detach function removing the listener.
 */
export function attachWalletConnectForegroundRefresh(client: StellarAppKit): () => void {
  const subscription = AppState.addEventListener('change', (state: string) => {
    if (state === 'active') refreshWalletConnect(client);
  });
  // RN's NativeEventSubscription shape across versions: remove() since
  // 0.65; the legacy .removeEventListener pair before that.
  if (typeof subscription?.remove === 'function') {
    return () => subscription.remove();
  }
  const legacy = subscription as unknown as { removeEventListener?: () => void };
  if (typeof legacy?.removeEventListener === 'function') {
    return () => legacy.removeEventListener!();
  }
  // No removal API at all — nothing was subscribed on this runtime.
  return () => undefined;
}
