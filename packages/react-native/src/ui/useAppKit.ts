/**
 * React hook binding for Stellar AppKit on React Native — mirrors ui-web's
 * React bindings: subscribe to the client's typed events once, expose a
 * snapshot that re-renders on change.
 */

import { useEffect, useState } from 'react';
import type { StellarAppKit, ConnectStatus, ConnectSession } from '@saganta/stellar-appkit';

export interface AppKitState {
  status: ConnectStatus;
  /** The active session, if any. */
  session: ConnectSession | null;
  /** All connected sessions (multi-wallet). */
  sessions: ConnectSession[];
  /** Number of sign requests queued (including in-flight). */
  pendingSignCount: number;
  /** Wallet display name for the active session, when connected. */
  walletName: string | null;
  /** Wallet icon for the active session, when connected. */
  walletIcon: string | null;
}

/** Subscribes to a StellarAppKit client and returns a re-rendering state snapshot. */
export function useAppKit(client: StellarAppKit): AppKitState {
  const [state, setState] = useState<AppKitState>(() => snapshot(client));

  useEffect(() => {
    const update = () => setState(snapshot(client));
    const offs = [
      client.on('statusChange', update),
      client.on('connect', update),
      client.on('disconnect', update),
      client.on('accountSwitch', update),
      client.on('sessionsChanged', update),
      client.on('signQueueChange', update),
    ];
    // Catch up with anything that happened before mount.
    update();
    return () => offs.forEach((off) => off());
  }, [client]);

  return state;
}

function snapshot(client: StellarAppKit): AppKitState {
  const session = client.session;
  const connector = client.activeConnector;
  return {
    status: client.status,
    session,
    sessions: client.sessions,
    pendingSignCount: client.pendingSignCount,
    walletName: connector?.meta.name ?? null,
    walletIcon: connector?.meta.icon ?? null,
  };
}
