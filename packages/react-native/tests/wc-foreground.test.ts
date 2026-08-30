/**
 * Tests for the foreground relay refresh — the React Native zombie-socket
 * fix wired into <AppKitModal> (useWalletConnectForegroundRefresh) and
 * exported for headless apps (attachWalletConnectForegroundRefresh).
 *
 * react-native can't run under bun (Flow syntax), so this suite installs
 * the shared react-native mock registry first (tests/helpers/rn-mock.ts).
 */

import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { emitAppState, installReactNativeMock, resetRnState } from './helpers/rn-mock.js';

installReactNativeMock();

const { attachWalletConnectForegroundRefresh } = await import('../src/wc-foreground.js');

import type { StellarAppKit } from '@saganta/stellar-appkit';

/** Registry mock with a refreshTransport spy on the walletconnect connector. */
function makeClient(opts: { refresh?: () => void; hasWalletConnect?: boolean } = {}) {
  const refresh = mock(opts.refresh ?? (() => {}));
  const connectors: Record<string, { refreshTransport?: () => void }> = {};
  if (opts.hasWalletConnect !== false) {
    connectors.walletconnect = { refreshTransport: refresh };
  }
  return {
    client: { registry: { get: (id: string) => connectors[id] } } as unknown as StellarAppKit,
    refresh,
  };
}

beforeEach(() => {
  resetRnState();
});

describe('attachWalletConnectForegroundRefresh — the zombie-socket fix', () => {
  test("fires refreshTransport() on every 'active' transition (back from the wallet app)", () => {
    const { client, refresh } = makeClient();
    attachWalletConnectForegroundRefresh(client);

    emitAppState('active');
    expect(refresh).toHaveBeenCalledTimes(1);
    emitAppState('active');
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  test("ignores 'background' and other transitions — nothing queued to deliver yet", () => {
    const { client, refresh } = makeClient();
    attachWalletConnectForegroundRefresh(client);

    emitAppState('background');
    emitAppState('inactive');
    expect(refresh).not.toHaveBeenCalled();
  });

  test('detaches cleanly — no refreshes after the returned function runs', () => {
    const { client, refresh } = makeClient();
    const detach = attachWalletConnectForegroundRefresh(client);

    emitAppState('active');
    detach();
    emitAppState('active');

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  test('never throws when the client registry explodes', () => {
    const broken = {
      registry: { get: () => { throw new Error('registry closed'); } },
    } as unknown as StellarAppKit;

    const detach = attachWalletConnectForegroundRefresh(broken);
    expect(() => emitAppState('active')).not.toThrow();
    detach();
  });

  test('tolerates a client with no walletconnect connector (headless registry)', () => {
    const { client, refresh } = makeClient({ hasWalletConnect: false });
    const detach = attachWalletConnectForegroundRefresh(client);

    expect(() => emitAppState('active')).not.toThrow();
    expect(refresh).not.toHaveBeenCalled();
    detach();
  });
});
