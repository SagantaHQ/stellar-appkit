/**
 * AppKitModal — the React Native modal UI for Stellar AppKit.
 *
 * This file is the orchestrator only: it owns the view state machine
 * (list → connecting → account / error), the connect actions and the
 * deep-link handoff, and the @gorhom/bottom-sheet shell. Every screen is
 * its own file under ./views/ for easy management:
 *
 *   views/WalletListView.tsx   — wallet picker (web-parity flat rows)
 *   views/WalletRowView.tsx    — one wallet row (.wallet-row port)
 *   views/ConnectingView.tsx   — connecting / signing (+ animations)
 *   views/AccountView.tsx      — connected account
 *   views/ErrorView.tsx        — failure + retry
 *
 * Shared types live in ./types.ts, the design system in ./styles.ts.
 *
 * Feature parity with the web `<stellar-appkit-modal>` adapted to native
 * idioms (per ARCHITECTURE.md's RN plan):
 *
 * - **Deep-link-only pairing**: on a phone the same device would have to
 *   scan a QR code, so the RN modal never renders one. Every wallet row
 *   embeds the WalletConnect pairing URI into the wallet's own deep link
 *   (`freighterwallet://wc?uri=...`) and hands off to the OS,
 *   Solana-Mobile-Adapter style.
 * - **Sectioned wallet list**: the featured Stellar-first wallets (Freighter,
 *   LOBSTR, HOT Wallet, Scopuly) plus the registered connectors (Albedo
 *   WebView, …) come first; every other WalletConnect-registered mobile
 *   wallet (SafePal, Blockchain.com, Arculus, Atomic Wallet, …) collapses
 *   under a "More wallets" expander so the sheet stays scannable.
 * - **True wallet names** — the connecting view, account view and
 *   sign-request prompts carry the wallet's own name and icon, never a
 *   generic "WalletConnect" label.
 * - **Copy pairing code** — when a deep link can't open the wallet, the
 *   pairing URI can still be shared/copied so wallets with manual pairing
 *   fields can complete the handshake.
 * - Connecting / signing views with the same animation timings as web
 *   v1.9.50 (2.5s breathe, 2s spinner, reduced-motion aware).
 * - Account view with share/disconnect. Error view with retry.
 *
 * Icons render through `<WalletIcon>` — zero native image dependencies:
 * wallet logos are pre-rasterized as compressed palette PNGs (with alpha)
 * in deep-links.ts and wallet-icons.ts, raster sources render natively, WC
 * peers match by name, and everything else gets a branded letter avatar.
 *
 * Presentation: @gorhom/bottom-sheet with a backdrop, swipe-to-dismiss.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Platform, Pressable, Share, Text, View } from 'react-native';
import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import type { StellarAppKit, WalletConnector } from '@saganta/stellar-appkit';
import { t } from '@saganta/stellar-appkit';
import {
  buildWalletConnectDeepLink,
  buildWalletConnectUniversalLink,
  buildOpenWalletAppLink,
  getMobileWallet,
  type MobileWalletDeepLink,
} from '../deep-links.js';
import { useAppKit } from './useAppKit.js';
import { useReducedMotion } from './animations.js';
import { buildStyles } from './styles.js';
import { VIEW_TITLES, type WalletBranding, type WalletRow, type ViewId } from './types.js';
import { defaultTheme, type ConnectThemeRN } from './theme.js';
import { WalletListView } from './views/WalletListView.js';
import { ConnectingView } from './views/ConnectingView.js';
import { AccountView } from './views/AccountView.js';
import { ErrorView } from './views/ErrorView.js';

export interface AppKitModalProps {
  client: StellarAppKit;
  open: boolean;
  onClose: () => void;
  theme?: ConnectThemeRN;
}

export function AppKitModal({ client, open, onClose, theme = defaultTheme }: AppKitModalProps) {
  const state = useAppKit(client);
  const reducedMotion = useReducedMotion();

  const [view, setView] = useState<ViewId>('list');
  const [walletRows, setWalletRows] = useState<WalletRow[]>([]);
  const [loadingWallets, setLoadingWallets] = useState(false);
  const [wcUri, setWcUri] = useState<string | null>(null);
  const [showMoreWallets, setShowMoreWallets] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [connectingWallet, setConnectingWallet] = useState<WalletBranding | null>(null);
  /**
   * When the user picked a named mobile wallet (Freighter, LOBSTR, HOT,
   * Scopuly, SafePal, …) — its registry id. Drives the deep-link handoff,
   * the "open the wallet again" affordance for sign requests, and the
   * account view's fallback branding when the wallet doesn't send peer
   * metadata.
   */
  const pairedMobileWalletId = useRef<string | null>(null);
  /** Set when neither the wallet's scheme nor universal link could open. */
  const [openFailed, setOpenFailed] = useState(false);
  const sheetRef = useRef<BottomSheet>(null);
  const styles = useMemo(() => buildStyles(theme), [theme]);

  // The WalletConnect connector — present whenever the app configured a
  // projectId. Named mobile wallets pair through it, so they're hidden
  // when it isn't registered.
  const wcConnector = useMemo(() => client.registry.get('walletconnect'), [client]);

  // --- wallet list loading ---------------------------------------------------
  const refreshWallets = useCallback(async () => {
    setLoadingWallets(true);
    try {
      setWalletRows(await client.registry.listReachability());
    } finally {
      setLoadingWallets(false);
    }
  }, [client]);

  useEffect(() => {
    if (open) {
      setView(client.session ? 'account' : 'list');
      setWcUri(null);
      setShowMoreWallets(false);
      setErrorText(null);
      setOpenFailed(false);
      setConnectingWallet(null);
      void refreshWallets();
    }
  }, [open, client, client.session, refreshWallets]);

  // --- client event → view wiring ---------------------------------------------
  useEffect(() => {
    const offs = [
      client.on('statusChange', (status) => {
        if (status === 'connected') {
          setView('account');
        } else if (status === 'error') {
          setErrorText(null); // the error event carries the message
          setView('error');
        }
      }),
      client.on('error', (err) => {
        setErrorText(err.message);
        setView('error');
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [client]);

  // Signing view while sign requests are queued and not yet connected-only.
  useEffect(() => {
    if (state.pendingSignCount > 0 && state.status !== 'connected') return;
    if (state.pendingSignCount > 0 && view !== 'error') {
      setView('signing');
    } else if (state.pendingSignCount === 0 && view === 'signing') {
      setView(client.session ? 'account' : 'list');
    }
  }, [state.pendingSignCount, state.status, client.session, view]);

  // --- deep-link handoff -------------------------------------------------------
  /**
   * Opens the wallet with the WC pairing URI embedded. Fallback chain:
   * native scheme link → registered universal link → give up (the caller
   * shows the "not installed" hint with a store button).
   */
  const openWalletDeepLink = useCallback(async (walletId: string, uri: string): Promise<boolean> => {
    try {
      await Linking.openURL(buildWalletConnectDeepLink(walletId, uri));
      return true;
    } catch {
      // Native scheme didn't resolve — the wallet may not be installed, or
      // the device may prefer universal links. Try the registered
      // https universal link (works even when the scheme isn't allowed).
      const universal = buildWalletConnectUniversalLink(walletId, uri);
      if (universal) {
        try {
          await Linking.openURL(universal);
          return true;
        } catch {
          // fall through
        }
      }
      return false;
    }
  }, []);

  // --- connect actions ---------------------------------------------------------

  /**
   * Connects a named mobile wallet (featured or under "More wallets"):
   * start the WalletConnect pairing, and the moment the relay hands us the
   * URI, deep-link straight into the wallet app. The whole flow is branded
   * with the wallet's own name and icon.
   */
  const connectMobileWallet = useCallback(
    async (wallet: MobileWalletDeepLink) => {
      if (!wcConnector) return;
      pairedMobileWalletId.current = wallet.id;
      setConnectingWallet({ name: wallet.name, icon: wallet.icon, key: wallet.id });
      setOpenFailed(false);
      setView('connecting');

      const wc = wcConnector as WalletConnector & { setOnUri?: (fn: (uri: string) => void) => void };
      if (typeof wc.setOnUri === 'function') {
        wc.setOnUri((uri) => {
          setWcUri(uri);
          void openWalletDeepLink(wallet.id, uri).then((ok) => setOpenFailed(!ok));
        });
      }
      try {
        await client.connect('walletconnect');
      } catch {
        /* surfaced via the error event */
      }
    },
    [client, wcConnector, openWalletDeepLink]
  );

  /** Connects a registered connector directly (Albedo WebView, …). */
  const connectConnector = useCallback(
    async (walletId: string) => {
      const connector = client.registry.get(walletId);
      if (!connector) return;
      setConnectingWallet({ name: connector.meta.name, icon: connector.meta.icon ?? null, key: walletId });
      setOpenFailed(false);
      setView('connecting');
      try {
        await client.connect(walletId);
      } catch {
        /* error event switches to the error view */
      }
    },
    [client]
  );

  /** Re-opens the paired wallet app (sign-request handoff). */
  const reopenPairedWallet = useCallback(async () => {
    const id = pairedMobileWalletId.current;
    if (!id) return;
    try {
      await Linking.openURL(buildOpenWalletAppLink(id));
    } catch {
      /* the wallet prompts manually */
    }
  }, []);

  /** Re-fires the deep link on the connecting view ("open again"). */
  const retryOpenWallet = useCallback(async () => {
    const id = pairedMobileWalletId.current;
    if (!id || !wcUri) return;
    const ok = await openWalletDeepLink(id, wcUri);
    setOpenFailed(!ok);
  }, [wcUri, openWalletDeepLink]);

  /** Shares the raw pairing URI — for wallets with a manual "paste code" field. */
  const sharePairingUri = useCallback(async () => {
    if (wcUri) await Share.share({ message: wcUri });
  }, [wcUri]);

  const disconnect = useCallback(async () => {
    await client.disconnect();
    pairedMobileWalletId.current = null;
    setView('list');
    void refreshWallets();
  }, [client, refreshWallets]);

  if (!open) return null;

  const titleKey = VIEW_TITLES[view];

  return (
    <BottomSheet
      ref={sheetRef}
      index={0}
      snapPoints={['82%']}
      enablePanDownToClose
      onClose={onClose}
      backdropComponent={(props) => (
        <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} pressBehavior="close" opacity={0.6} />
      )}
      backgroundStyle={{ backgroundColor: theme.colorSurface, borderTopLeftRadius: theme.radiusLg, borderTopRightRadius: theme.radiusLg }}
      handleIndicatorStyle={{ backgroundColor: theme.colorTextMuted }}
    >
      {/* Sheet header — title + close */}
      <View style={styles.header}>
        <View style={styles.headerButtonSpacer} />
        {titleKey ? <Text style={styles.headerTitle}>{t(titleKey)}</Text> : <View />}
        <Pressable
          style={({ pressed }) => [styles.headerButton, pressed && styles.headerButtonPressed]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('aria.close_dialog')}
          hitSlop={8}
        >
          <Text style={styles.headerButtonGlyph}>×</Text>
        </Pressable>
      </View>

      <BottomSheetScrollView contentContainerStyle={styles.content}>
        {view === 'list' && (
          <WalletListView
            styles={styles}
            theme={theme}
            loading={loadingWallets}
            rows={walletRows}
            showMobileWallets={Boolean(wcConnector)}
            showMore={showMoreWallets}
            onToggleMore={() => setShowMoreWallets((v) => !v)}
            onConnectMobile={connectMobileWallet}
            onConnectConnector={connectConnector}
            onInstall={(row) => {
              const url = Platform.select({
                ios: row.connector.meta.installUrl?.ios,
                android: row.connector.meta.installUrl?.android,
              });
              if (url) void Linking.openURL(url);
            }}
          />
        )}

        {(view === 'connecting' || view === 'signing') && (
          <ConnectingView
            styles={styles}
            theme={theme}
            reducedMotion={reducedMotion}
            walletName={connectingWallet?.name ?? state.walletName ?? t('wallet.fallback_your_wallet')}
            walletIcon={connectingWallet?.icon ?? state.walletIcon}
            walletKey={connectingWallet?.key ?? null}
            subtitle={
              view === 'signing'
                ? t('signing.subtitle')
                : t('connecting.accept_request')
            }
            openFailed={openFailed}
            failedWalletName={pairedMobileWalletId.current ? getMobileWallet(pairedMobileWalletId.current)?.name : undefined}
            onInstallFailedWallet={() => {
              const wallet = pairedMobileWalletId.current ? getMobileWallet(pairedMobileWalletId.current) : undefined;
              const url = wallet && Platform.select({ ios: wallet.installUrl.ios, android: wallet.installUrl.android });
              if (url) void Linking.openURL(url);
            }}
            onRetryOpen={retryOpenWallet}
            onShareUri={wcUri && pairedMobileWalletId.current ? sharePairingUri : undefined}
            reopenWallet={
              view === 'signing' && pairedMobileWalletId.current
                ? reopenPairedWallet
                : pairedMobileWalletId.current && view === 'connecting'
                  ? retryOpenWallet
                  : undefined
            }
          />
        )}

        {view === 'account' && state.session && (
          <AccountView
            styles={styles}
            theme={theme}
            address={state.session.address}
            walletName={state.walletName ?? t('wallet.fallback_name')}
            walletIcon={state.walletIcon}
            pendingSigns={state.pendingSignCount}
            onShare={async () => {
              if (state.session) await Share.share({ message: state.session.address });
            }}
            onDisconnect={disconnect}
          />
        )}

        {view === 'error' && (
          <ErrorView
            styles={styles}
            theme={theme}
            message={errorText ?? t('error.default_message')}
            onRetry={() => {
              setErrorText(null);
              setView('list');
              void refreshWallets();
            }}
          />
        )}
      </BottomSheetScrollView>
    </BottomSheet>
  );
}
