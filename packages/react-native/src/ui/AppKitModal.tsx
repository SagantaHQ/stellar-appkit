/**
 * AppKitModal — the React Native modal UI for Stellar AppKit.
 *
 * Feature parity with the web `<stellar-appkit-modal>` adapted to native
 * idioms (per ARCHITECTURE.md's RN plan):
 *
 * - **Named mobile wallet list**: every Stellar wallet with a mobile app and
 *   a WalletConnect registration (Freighter, LOBSTR, HOT Wallet, Scopuly)
 *   gets its own row — tap it and we deep-link straight into that wallet
 *   with the pairing URI embedded (`freighterwallet://wc?uri=...`),
 *   Solana-Mobile-Adapter style. The connecting view, account view and
 *   sign-request prompts all carry the wallet's own name and icon — never
 *   a generic "WalletConnect" label.
 * - **WalletConnect (QR)** row for every other WC wallet (SafePal, Hana,
 *   and anything else with the Stellar namespace) — pairing view with the
 *   mobile wallets listed first, QR fallback, copy/share URI.
 * - **Albedo (WebView)** row when its connector is registered.
 * - Connecting / signing views with the same animation timings as web
 *   v1.9.50 (2.5s breathe, 2s spinner, reduced-motion aware).
 * - Account view with share/disconnect.
 * - Error view with retry.
 *
 * Icons render through `<WalletIcon>` — zero native image dependencies:
 * the core SVG logos are pre-rasterized as compressed PNGs (wallet-icons.ts),
 * raster sources render natively, WC peers match by name, and everything
 * else gets a branded letter avatar. The pairing QR is `<QrCodeView>` —
 * pure-JS encoder + plain Views (no react-native-qrcode-svg either).
 *
 * Presentation: @gorhom/bottom-sheet with a backdrop, swipe-to-dismiss.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Linking,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { QrCodeView } from './qr/QrCodeView.js';
import type { StellarAppKit, WalletConnector, WalletReachability } from '@saganta/stellar-appkit';
import { t } from '@saganta/stellar-appkit';
import {
  listMobileWallets,
  buildWalletConnectDeepLink,
  buildWalletConnectUniversalLink,
  buildOpenWalletAppLink,
  getMobileWallet,
  type MobileWalletDeepLink,
} from '../deep-links.js';
import { useAppKit } from './useAppKit.js';
import { useBreathe, useReducedMotion, useSpinner } from './animations.js';
import { WalletIcon } from './WalletIcon.js';
import { defaultTheme, type ConnectThemeRN } from './theme.js';

export interface AppKitModalProps {
  client: StellarAppKit;
  open: boolean;
  onClose: () => void;
  theme?: ConnectThemeRN;
}

interface WalletRow {
  connector: WalletConnector;
  reachability: WalletReachability;
  available?: boolean;
}

/** Which wallet the connecting/account views should be branded with. */
interface WalletBranding {
  name: string;
  icon: string | null;
  /** Registry/connector key for icon resolution (mobile wallet id or connector id). */
  key: string | null;
}

type ViewId = 'list' | 'pairing' | 'connecting' | 'signing' | 'account' | 'error';

const VIEW_TITLES: Partial<Record<ViewId, string>> = {
  list: 'title.connect_wallet',
  pairing: 'title.connect_wallet',
  account: 'title.account',
  error: 'error.title',
};

export function AppKitModal({ client, open, onClose, theme = defaultTheme }: AppKitModalProps) {
  const state = useAppKit(client);
  const reducedMotion = useReducedMotion();

  const [view, setView] = useState<ViewId>('list');
  const [walletRows, setWalletRows] = useState<WalletRow[]>([]);
  const [loadingWallets, setLoadingWallets] = useState(false);
  const [wcUri, setWcUri] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [connectingWallet, setConnectingWallet] = useState<WalletBranding | null>(null);
  /**
   * When the user picked a named mobile wallet (Freighter, LOBSTR, HOT,
   * Scopuly) — its registry id. Drives the deep-link handoff, the
   * "open the wallet again" affordance for sign requests, and the account
   * view's fallback branding when the wallet doesn't send peer metadata.
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
      setShowQr(false);
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
   * Connects a named mobile wallet (Freighter, LOBSTR, HOT Wallet, Scopuly):
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

  /**
   * Generic WalletConnect pairing — QR for every wallet that isn't in the
   * named list (SafePal, Hana, …), with the deep-link wallets offered first.
   */
  const connectWalletConnect = useCallback(async () => {
    if (!wcConnector) return;
    setConnectingWallet({ name: wcConnector.meta.name, icon: wcConnector.meta.icon ?? null, key: 'walletconnect' });
    setOpenFailed(false);
    setView('pairing');

    const wc = wcConnector as WalletConnector & { setOnUri?: (fn: (uri: string) => void) => void };
    if (typeof wc.setOnUri === 'function') {
      wc.setOnUri((uri) => setWcUri(uri));
    }
    try {
      await client.connect('walletconnect');
    } catch {
      /* surfaced via the error event */
    }
  }, [client, wcConnector]);

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

  /** A deep-link wallet tapped from the QR pairing view. */
  const openMobileWallet = useCallback(
    async (mobileWalletId: string) => {
      if (!wcUri) return;
      const wallet = getMobileWallet(mobileWalletId);
      if (wallet) {
        pairedMobileWalletId.current = mobileWalletId;
        setConnectingWallet({ name: wallet.name, icon: wallet.icon, key: wallet.id });
        setView('connecting');
      }
      const ok = await openWalletDeepLink(mobileWalletId, wcUri);
      setOpenFailed(!ok);
    },
    [wcUri, openWalletDeepLink]
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

  const disconnect = useCallback(async () => {
    await client.disconnect();
    pairedMobileWalletId.current = null;
    setView('list');
    void refreshWallets();
  }, [client, refreshWallets]);

  const goBack = useCallback(() => {
    setErrorText(null);
    setOpenFailed(false);
    setView('list');
  }, []);

  if (!open) return null;

  const showBack = view === 'pairing';
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
      backgroundStyle={{ backgroundColor: theme.colorBg, borderTopLeftRadius: theme.radiusLg, borderTopRightRadius: theme.radiusLg }}
      handleIndicatorStyle={{ backgroundColor: theme.colorTextMuted }}
    >
      {/* Sheet header — title, back (pairing), close */}
      <View style={styles.header}>
        {showBack ? (
          <Pressable
            style={styles.headerButton}
            onPress={goBack}
            accessibilityRole="button"
            accessibilityLabel={t('aria.back')}
            hitSlop={8}
          >
            <Text style={styles.headerButtonGlyph}>‹</Text>
          </Pressable>
        ) : (
          <View style={styles.headerButtonSpacer} />
        )}
        {titleKey ? <Text style={styles.headerTitle}>{t(titleKey)}</Text> : <View />}
        <Pressable
          style={styles.headerButton}
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
            onConnectMobile={connectMobileWallet}
            onConnectConnector={connectConnector}
            onConnectWalletConnect={connectWalletConnect}
            onInstall={(row) => {
              const url = Platform.select({
                ios: row.connector.meta.installUrl?.ios,
                android: row.connector.meta.installUrl?.android,
              });
              if (url) void Linking.openURL(url);
            }}
          />
        )}

        {view === 'pairing' && (
          <PairingView
            styles={styles}
            theme={theme}
            uri={wcUri}
            showQr={showQr}
            onToggleQr={() => setShowQr((v) => !v)}
            onOpenWallet={openMobileWallet}
            onShare={async () => {
              if (wcUri) await Share.share({ message: wcUri });
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

// ---------------------------------------------------------------------------
// Wallet list — named mobile wallets first, then the registered connectors,
// generic WalletConnect (QR) last
// ---------------------------------------------------------------------------

function WalletListView(props: {
  styles: ReturnType<typeof buildStyles>;
  theme: ConnectThemeRN;
  loading: boolean;
  rows: WalletRow[];
  showMobileWallets: boolean;
  onConnectMobile: (wallet: MobileWalletDeepLink) => void;
  onConnectConnector: (walletId: string) => void;
  onConnectWalletConnect: () => void;
  onInstall: (row: WalletRow) => void;
}) {
  const { styles, theme, loading, rows, showMobileWallets, onConnectMobile, onConnectConnector, onConnectWalletConnect, onInstall } = props;

  const mobileWallets = showMobileWallets ? listMobileWallets() : [];
  // The generic WalletConnect row replaces the raw connector row — it pairs
  // via QR with ANY WalletConnect wallet (SafePal, Hana, …).
  const directRows = rows.filter((row) => row.connector.id !== 'walletconnect');
  const wcRow = rows.find((row) => row.connector.id === 'walletconnect');

  if (loading && rows.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={theme.colorAccent} />
        <Text style={styles.muted}>{t('wallet_list.loading')}</Text>
      </View>
    );
  }

  return (
    <View>
      {/* Named mobile wallets — deep-link straight into the app */}
      {mobileWallets.map((wallet) => (
        <WalletRowView
          key={wallet.id}
          styles={styles}
          theme={theme}
          icon={wallet.icon}
          walletKey={wallet.id}
          name={wallet.name}
          subtitle={t('wc.open_in_wallet')}
          onPress={() => onConnectMobile(wallet)}
          last={directRows.length === 0 && !wcRow}
        />
      ))}

      {/* Registered connectors (Albedo WebView, …) */}
      {directRows.map((row, i) => {
        const { connector, reachability } = row;
        const disabled = reachability === 'not-installed' || reachability === 'unavailable';
        return (
          <WalletRowView
            key={connector.id}
            styles={styles}
            theme={theme}
            icon={connector.meta.icon ?? null}
            walletKey={connector.id}
            name={connector.meta.name}
            subtitle={
              reachability === 'locked'
                ? t('wallet_list.status.locked')
                : reachability === 'unavailable'
                  ? t('wallet_list.status.unavailable')
                  : t('wallet_list.status.installed')
            }
            disabled={disabled}
            onPress={() => onConnectConnector(connector.id)}
            badge={
              reachability === 'not-installed' ? (
                <Pressable
                  style={styles.installButton}
                  onPress={() => onInstall(row)}
                  accessibilityRole="button"
                >
                  <Text style={styles.installText}>{t('wallet_list.install')}</Text>
                </Pressable>
              ) : undefined
            }
            last={i === directRows.length - 1 && !wcRow}
          />
        );
      })}

      {/* Generic WalletConnect — QR for every other wallet */}
      {wcRow && (
        <WalletRowView
          styles={styles}
          theme={theme}
          icon={wcRow.connector.meta.icon ?? null}
          walletKey="walletconnect"
          name={wcRow.connector.meta.name}
          subtitle={t('wallet_list.status.scan_qr')}
          onPress={onConnectWalletConnect}
          last
        />
      )}
    </View>
  );
}

function WalletRowView(props: {
  styles: ReturnType<typeof buildStyles>;
  theme: ConnectThemeRN;
  icon: string | null;
  /** Registry/connector key for icon resolution (PNG registry lookup). */
  walletKey?: string | null;
  name: string;
  subtitle: string;
  onPress: () => void;
  disabled?: boolean;
  badge?: React.ReactNode;
  last?: boolean;
}) {
  const { styles, theme, icon, walletKey, name, subtitle, onPress, disabled, badge, last } = props;
  return (
    <Pressable
      style={({ pressed }) => [styles.walletRow, !last && styles.walletRowBorder, pressed && { backgroundColor: theme.colorSurfaceHover }]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={name}
    >
      <WalletIcon source={icon} walletKey={walletKey} fallbackLabel={name} size={44} radius={theme.radiusSm} />
      <View style={styles.walletMeta}>
        <Text style={styles.walletName}>{name}</Text>
        <Text style={styles.muted}>{subtitle}</Text>
      </View>
      {badge ?? (
        <Text style={styles.chevron}>›</Text>
      )}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// WalletConnect pairing — deep-link wallets first, QR fallback
// ---------------------------------------------------------------------------

function PairingView(props: {
  styles: ReturnType<typeof buildStyles>;
  theme: ConnectThemeRN;
  uri: string | null;
  showQr: boolean;
  onToggleQr: () => void;
  onOpenWallet: (mobileWalletId: string) => void;
  onShare: () => void;
}) {
  const { styles, theme, uri, showQr, onToggleQr, onOpenWallet, onShare } = props;
  const mobileWallets = listMobileWallets();
  return (
    <View>
      {!uri && (
        <View style={styles.centered}>
          <ActivityIndicator color={theme.colorAccent} />
          <Text style={styles.muted}>{t('wc.generating_code')}</Text>
        </View>
      )}
      {uri && (
        <View>
          {mobileWallets.map((wallet) => (
            <WalletRowView
              key={wallet.id}
              styles={styles}
              theme={theme}
              icon={wallet.icon}
              walletKey={wallet.id}
              name={wallet.name}
              subtitle={t('wc.open_in_wallet')}
              onPress={() => onOpenWallet(wallet.id)}
            />
          ))}

          <WalletRowView
            styles={styles}
            theme={theme}
            icon={null}
            name={t('wallet_list.status.scan_qr')}
            subtitle={t('wc.scan_instructions')}
            onPress={onToggleQr}
          />

          {showQr && (
            <View style={styles.qrWrap}>
              <QrCodeView value={uri} size={200} backgroundColor={theme.colorBg} color={theme.colorText} accessibilityLabel={t('wallet_list.status.scan_qr')} />
              <Text style={[styles.muted, styles.qrHint]}>{t('wc.scan_instructions')}</Text>
            </View>
          )}

          <Pressable style={styles.secondaryButton} onPress={onShare} accessibilityRole="button">
            <Text style={styles.secondaryButtonText}>{t('wc.copy_uri')}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Connecting / signing — breathe + spinner, v1.9.50 timings, wallet-branded
// ---------------------------------------------------------------------------

function ConnectingView(props: {
  styles: ReturnType<typeof buildStyles>;
  theme: ConnectThemeRN;
  reducedMotion: boolean;
  walletName: string;
  walletIcon: string | null;
  /** Registry/connector key for PNG icon resolution. */
  walletKey: string | null;
  subtitle: string;
  openFailed: boolean;
  failedWalletName?: string;
  onInstallFailedWallet: () => void;
  onRetryOpen: () => void;
  reopenWallet?: () => void;
}) {
  const { styles, theme, reducedMotion, walletName, walletIcon, walletKey, subtitle, openFailed, failedWalletName, onInstallFailedWallet, onRetryOpen, reopenWallet } = props;
  const breathe = useBreathe(reducedMotion);
  const spinner = useSpinner(reducedMotion);
  const spin = spinner.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={styles.centered}>
      <View style={styles.animWrap}>
        <AnimatedBox scale={breathe}>
          <View style={styles.animLogoWrap}>
            <WalletIcon source={walletIcon} walletKey={walletKey} fallbackLabel={walletName} size={64} radius={theme.radiusLg} />
          </View>
        </AnimatedBox>
        <AnimatedSpinner style={styles.animArc} rotate={spin} color={theme.colorAccent} />
      </View>
      <Text style={styles.title}>{t('connecting.continue_in_wallet', { walletName })}</Text>
      <Text style={styles.muted}>{subtitle}</Text>

      {openFailed && (
        <View style={styles.openFailedCard}>
          <Text style={styles.openFailedText}>
            {t('wc.open_failed', { walletName: failedWalletName ?? walletName })}
          </Text>
          <Pressable style={styles.installButton} onPress={onInstallFailedWallet} accessibilityRole="button">
            <Text style={styles.installText}>{t('wallet_list.install')}</Text>
          </Pressable>
        </View>
      )}

      {!openFailed && reopenWallet && (
        <Pressable style={styles.primaryButton} onPress={onRetryOpen} accessibilityRole="button">
          <Text style={styles.primaryButtonText}>{t('wc.open_in_wallet')}</Text>
        </Pressable>
      )}
    </View>
  );
}

/** Small helpers so the Animated primitives live in one place. */
function AnimatedBox({ scale, children }: { scale: Animated.Value; children: React.ReactNode }) {
  return <Animated.View style={{ transform: [{ scale }] }}>{children}</Animated.View>;
}

function AnimatedSpinner({ style, rotate, color }: { style: any; rotate: Animated.AnimatedInterpolation<string | number>; color: string }) {
  // A simple arc spinner: a bordered circle with one transparent quarter.
  return (
    <Animated.View
      style={[
        style,
        {
          transform: [{ rotate }],
          borderRadius: 999,
          borderWidth: 3,
          borderTopColor: 'transparent',
          borderLeftColor: 'transparent',
          borderRightColor: color,
          borderBottomColor: color,
        },
      ]}
    />
  );
}

// ---------------------------------------------------------------------------
// Account view
// ---------------------------------------------------------------------------

function AccountView(props: {
  styles: ReturnType<typeof buildStyles>;
  theme: ConnectThemeRN;
  address: string;
  walletName: string;
  walletIcon: string | null;
  pendingSigns: number;
  onShare: () => void;
  onDisconnect: () => void;
}) {
  const { styles, theme, address, walletName, walletIcon, pendingSigns, onShare, onDisconnect } = props;
  const shortened = `${address.slice(0, 8)}…${address.slice(-8)}`;
  return (
    <View>
      <View style={styles.accountCard}>
        <WalletIcon source={walletIcon} fallbackLabel={walletName} size={48} radius={theme.radiusMd} />
        <View style={styles.walletMeta}>
          <Text style={styles.walletName}>{walletName}</Text>
          <Text style={styles.addressText}>{shortened}</Text>
          {pendingSigns > 0 && <Text style={styles.danger}>{t('connected.pending_signatures', { count: pendingSigns })}</Text>}
        </View>
      </View>
      <Pressable style={styles.secondaryButton} onPress={onShare} accessibilityRole="button">
        <Text style={styles.secondaryButtonText}>{t('aria.click_to_copy')}</Text>
      </Pressable>
      <Pressable style={styles.dangerButton} onPress={onDisconnect} accessibilityRole="button">
        <Text style={styles.dangerButtonText}>{t('action.disconnect')}</Text>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Error view
// ---------------------------------------------------------------------------

function ErrorView(props: {
  styles: ReturnType<typeof buildStyles>;
  theme: ConnectThemeRN;
  message: string;
  onRetry: () => void;
}) {
  const { styles, theme, message, onRetry } = props;
  return (
    <View style={styles.centered}>
      <View style={[styles.errorBadge, { borderColor: theme.colorDanger }]}>
        <Text style={[styles.errorBadgeText, { color: theme.colorDanger }]}>!</Text>
      </View>
      <Text style={styles.title}>{t('error.title')}</Text>
      <Text style={styles.muted}>{message}</Text>
      <Pressable style={styles.primaryButton} onPress={onRetry} accessibilityRole="button">
        <Text style={styles.primaryButtonText}>{t('action.try_again')}</Text>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function buildStyles(theme: ConnectThemeRN) {
  return StyleSheet.create({
    content: { paddingHorizontal: 20, paddingBottom: 40, gap: 14 },

    // Header
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colorBorder,
      minHeight: 48,
    },
    headerTitle: { color: theme.colorText, fontSize: 17, fontWeight: '700', flex: 1, textAlign: 'center' },
    headerButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colorSurface,
    },
    headerButtonSpacer: { width: 36 },
    headerButtonGlyph: { color: theme.colorText, fontSize: 22, fontWeight: '600', lineHeight: 24, marginTop: -2 },

    centered: { alignItems: 'center', gap: 10, paddingVertical: 28 },
    title: { color: theme.colorText, fontSize: 18, fontWeight: '700', textAlign: 'center' },
    muted: { color: theme.colorTextMuted, fontSize: 13 },

    // Wallet rows — flat list with hairline separators (matches the web modal)
    walletRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingVertical: 12,
      paddingHorizontal: 4,
      borderRadius: theme.radiusSm,
    },
    walletRowBorder: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colorBorder,
    },
    walletMeta: { flex: 1, gap: 2 },
    walletName: { color: theme.colorText, fontSize: 15, fontWeight: '600' },
    addressText: { color: theme.colorTextMuted, fontSize: 13, letterSpacing: 0.3 },
    chevron: { color: theme.colorTextMuted, fontSize: 22, fontWeight: '500' },

    installButton: {
      backgroundColor: theme.colorAccent,
      borderRadius: theme.radiusSm,
      paddingHorizontal: 14,
      paddingVertical: 7,
    },
    installText: { color: theme.colorAccentText, fontSize: 13, fontWeight: '700' },

    qrWrap: {
      alignItems: 'center',
      padding: 20,
      backgroundColor: theme.colorSurface,
      borderRadius: theme.radiusMd,
      marginTop: 8,
      gap: 10,
    },
    qrHint: { textAlign: 'center' },

    animWrap: { width: 104, height: 104, alignItems: 'center', justifyContent: 'center', marginVertical: 8 },
    animLogoWrap: { borderRadius: theme.radiusLg, overflow: 'hidden' },
    animArc: { position: 'absolute', width: 96, height: 96 },

    openFailedCard: {
      alignItems: 'center',
      gap: 10,
      backgroundColor: theme.colorSurface,
      borderRadius: theme.radiusMd,
      padding: 16,
      marginTop: 8,
      alignSelf: 'stretch',
    },
    openFailedText: { color: theme.colorText, fontSize: 14, textAlign: 'center' },

    primaryButton: {
      backgroundColor: theme.colorAccent,
      borderRadius: theme.radiusMd,
      paddingVertical: 14,
      paddingHorizontal: 20,
      alignItems: 'center',
      marginTop: 8,
      alignSelf: 'stretch',
    },
    primaryButtonText: { color: theme.colorAccentText, fontSize: 15, fontWeight: '700' },
    secondaryButton: {
      borderColor: theme.colorBorder,
      borderWidth: 1,
      borderRadius: theme.radiusMd,
      paddingVertical: 13,
      alignItems: 'center',
      marginTop: 4,
    },
    secondaryButtonText: { color: theme.colorText, fontSize: 14, fontWeight: '600' },
    dangerButton: {
      borderColor: theme.colorDanger,
      borderWidth: 1,
      borderRadius: theme.radiusMd,
      paddingVertical: 13,
      alignItems: 'center',
      marginTop: 4,
    },
    dangerButtonText: { color: theme.colorDanger, fontSize: 14, fontWeight: '600' },
    accountCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      backgroundColor: theme.colorSurface,
      borderRadius: theme.radiusMd,
      padding: 16,
    },
    danger: { color: theme.colorDanger, fontSize: 12, marginTop: 2 },

    errorBadge: {
      width: 56,
      height: 56,
      borderRadius: 28,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 4,
    },
    errorBadgeText: { fontSize: 28, fontWeight: '800' },
  });
}
