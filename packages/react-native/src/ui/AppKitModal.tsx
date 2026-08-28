/**
 * AppKitModal — the React Native modal UI for Stellar AppKit.
 *
 * Feature parity with the web `<stellar-appkit-modal>` adapted to native
 * idioms (per ARCHITECTURE.md's RN plan):
 *
 * - Wallet list with live reachability states (WalletConnect pinned first)
 * - WalletConnect pairing view with the **mobile-first flow**: instead of
 *   leading with a QR code, registered deep-link wallets (Freighter) are
 *   offered first — tap one and we hand off to the wallet with the pairing
 *   URI embedded (`freighterwallet://wc?uri=...`), Solana-Mobile-Adapter
 *   style. QR remains the fallback for every other wallet.
 * - Connecting / signing views with the same animation timings as web
 *   v1.9.50 (2.5s breathe, 2s spinner, reduced-motion aware)
 * - Account view with share/disconnect
 * - Error view with retry
 *
 * Presentation: @gorhom/bottom-sheet with a backdrop, swipe-to-dismiss.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  Linking,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import QRCode from 'react-native-qrcode-svg';
import type { StellarAppKit, WalletConnector, WalletReachability } from '@saganta/stellar-appkit';
import { t } from '@saganta/stellar-appkit';
import { listMobileWallets, buildWalletConnectDeepLink, buildOpenWalletAppLink } from '../deep-links.js';
import { useAppKit } from './useAppKit.js';
import { useBreathe, useReducedMotion, useSpinner } from './animations.js';
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

type ViewId = 'list' | 'pairing' | 'connecting' | 'signing' | 'account' | 'error';

export function AppKitModal({ client, open, onClose, theme = defaultTheme }: AppKitModalProps) {
  const state = useAppKit(client);
  const reducedMotion = useReducedMotion();

  const [view, setView] = useState<ViewId>('list');
  const [walletRows, setWalletRows] = useState<WalletRow[]>([]);
  const [loadingWallets, setLoadingWallets] = useState(false);
  const [wcUri, setWcUri] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [connectingWallet, setConnectingWallet] = useState<{ name: string; icon: string | null } | null>(null);
  /** The mobile wallet the user paired with via deep link — re-openable for sign requests. */
  const pairedMobileWalletId = useRef<string | null>(null);
  const sheetRef = useRef<BottomSheet>(null);
  const styles = useMemo(() => buildStyles(theme), [theme]);

  // --- wallet list loading ---------------------------------------------------
  const refreshWallets = useCallback(async () => {
    setLoadingWallets(true);
    try {
      // listReachability() resolves every connector's status in parallel and
      // pins WalletConnect to the top — exactly the ordering the web modal shows.
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

  // --- connect actions ---------------------------------------------------------
  const connectWallet = useCallback(
    async (walletId: string) => {
      const connector = client.registry.get(walletId);
      if (!connector) return;
      setConnectingWallet({ name: connector.meta.name, icon: connector.meta.icon ?? null });

      if (walletId === 'walletconnect') {
        // Mobile-first pairing: capture the URI, then let the user pick a
        // deep-link wallet or scan the QR. connect() resolves once the wallet
        // approves over the relay.
        const wc = client.registry.get('walletconnect') as (WalletConnector & { setOnUri?: (fn: (uri: string) => void) => void }) | undefined;
        if (wc && typeof wc.setOnUri === 'function') {
          wc.setOnUri((uri) => setWcUri(uri));
        }
        setView('pairing');
        try {
          await client.connect('walletconnect');
        } catch {
          /* surfaced via the error event */
        }
        return;
      }

      setView('connecting');
      try {
        await client.connect(walletId);
      } catch {
        /* error event switches to the error view */
      }
    },
    [client]
  );

  const openMobileWallet = useCallback(
    async (mobileWalletId: string) => {
      if (!wcUri) return;
      pairedMobileWalletId.current = mobileWalletId;
      try {
        await Linking.openURL(buildWalletConnectDeepLink(mobileWalletId, wcUri));
      } catch {
        setErrorText(`Could not open the wallet app. Is it installed?`);
        setView('error');
      }
    },
    [wcUri]
  );

  const reopenPairedWallet = useCallback(async () => {
    const id = pairedMobileWalletId.current;
    if (!id) return;
    try {
      await Linking.openURL(buildOpenWalletAppLink(id));
    } catch {
      /* the wallet prompts manually */
    }
  }, []);

  const disconnect = useCallback(async () => {
    await client.disconnect();
    setView('list');
    void refreshWallets();
  }, [client, refreshWallets]);

  if (!open) return null;

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
      <BottomSheetScrollView contentContainerStyle={styles.content}>
        {view === 'list' && (
          <WalletListView
            styles={styles}
            theme={theme}
            loading={loadingWallets}
            rows={walletRows}
            onConnect={connectWallet}
            onInstall={(row) => {
              const url = Platform.select({ ios: row.connector.meta.installUrl?.ios, android: row.connector.meta.installUrl?.android });
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
            subtitle={
              view === 'signing'
                ? t('signing.subtitle')
                : t('connecting.accept_request')
            }
            reopenWallet={view === 'signing' && pairedMobileWalletId.current ? reopenPairedWallet : undefined}
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
// Wallet list
// ---------------------------------------------------------------------------

function WalletListView(props: {
  styles: ReturnType<typeof buildStyles>;
  theme: ConnectThemeRN;
  loading: boolean;
  rows: WalletRow[];
  onConnect: (walletId: string) => void;
  onInstall: (row: WalletRow) => void;
}) {
  const { styles, theme, loading, rows, onConnect, onInstall } = props;
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
      <Text style={styles.title}>{t('title.connect_wallet')}</Text>
      {rows.map((row) => {
        const { connector, reachability } = row;
        const disabled = reachability === 'not-installed' || reachability === 'unavailable';
        return (
          <Pressable
            key={connector.id}
            style={({ pressed }) => [styles.walletRow, pressed && { backgroundColor: theme.colorSurfaceHover }]}
            disabled={disabled}
            onPress={() => onConnect(connector.id)}
          >
            {connector.meta.icon ? <Image source={{ uri: connector.meta.icon }} style={styles.walletIcon} /> : <View style={styles.walletIcon} />}
            <View style={styles.walletMeta}>
              <Text style={styles.walletName}>{connector.meta.name}</Text>
              <Text style={styles.muted}>
                {connector.id === 'walletconnect'
                  ? t('wallet_list.status.scan_qr')
                  : reachability === 'locked'
                    ? t('wallet_list.status.locked')
                    : reachability === 'unavailable'
                      ? t('wallet_list.status.unavailable')
                      : t('wallet_list.status.installed')}
              </Text>
            </View>
            {reachability === 'not-installed' && (
              <Pressable style={styles.installButton} onPress={() => onInstall(row)}>
                <Text style={styles.installText}>{t('wallet_list.install')}</Text>
              </Pressable>
            )}
          </Pressable>
        );
      })}
    </View>
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
      <Text style={styles.title}>{t('title.connect_wallet')}</Text>
      {!uri && (
        <View style={styles.centered}>
          <ActivityIndicator color={theme.colorAccent} />
          <Text style={styles.muted}>{t('wc.generating_code')}</Text>
        </View>
      )}
      {uri && (
        <View>
          {mobileWallets.map((wallet) => (
            <Pressable
              key={wallet.id}
              style={({ pressed }) => [styles.walletRow, pressed && { backgroundColor: theme.colorSurfaceHover }]}
              onPress={() => onOpenWallet(wallet.id)}
            >
              <Image source={{ uri: wallet.icon }} style={styles.walletIcon} />
              <View style={styles.walletMeta}>
                <Text style={styles.walletName}>{wallet.name}</Text>
                <Text style={styles.muted}>{t('wc.open_in_wallet')}</Text>
              </View>
            </Pressable>
          ))}

          <Pressable style={({ pressed }) => [styles.walletRow, pressed && { backgroundColor: theme.colorSurfaceHover }]} onPress={onToggleQr}>
            <View style={[styles.walletIcon, styles.qrPlaceholder]}>
              <Text style={styles.qrPlaceholderText}>QR</Text>
            </View>
            <View style={styles.walletMeta}>
              <Text style={styles.walletName}>{t('wallet_list.status.scan_qr')}</Text>
              <Text style={styles.muted}>{t('wc.scan_instructions')}</Text>
            </View>
          </Pressable>

          {showQr && (
            <View style={styles.qrWrap}>
              <QRCode value={uri} size={200} backgroundColor={theme.colorBg} color={theme.colorText} />
            </View>
          )}

          <Pressable style={styles.secondaryButton} onPress={onShare}>
            <Text style={styles.secondaryButtonText}>{t('wc.copy_uri')}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Connecting / signing — breathe + spinner, v1.9.50 timings
// ---------------------------------------------------------------------------

function ConnectingView(props: {
  styles: ReturnType<typeof buildStyles>;
  theme: ConnectThemeRN;
  reducedMotion: boolean;
  walletName: string;
  walletIcon: string | null;
  subtitle: string;
  reopenWallet?: () => void;
}) {
  const { styles, theme, reducedMotion, walletName, walletIcon, subtitle, reopenWallet } = props;
  const breathe = useBreathe(reducedMotion);
  const spinner = useSpinner(reducedMotion);
  const spin = spinner.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={styles.centered}>
      <View style={styles.animWrap}>
        <AnimatedBox scale={breathe}>
          {walletIcon ? (
            <Image source={{ uri: walletIcon }} style={styles.animLogo} />
          ) : (
            <View style={[styles.animLogo, { backgroundColor: theme.colorSurface }]} />
          )}
        </AnimatedBox>
        <AnimatedSpinner style={styles.animArc} rotate={spin} color={theme.colorAccent} />
      </View>
      <Text style={styles.title}>{t('connecting.continue_in_wallet', { walletName })}</Text>
      <Text style={styles.muted}>{subtitle}</Text>
      {reopenWallet && (
        <Pressable style={styles.primaryButton} onPress={reopenWallet}>
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
      <Text style={styles.title}>{t('title.account')}</Text>
      <View style={styles.accountCard}>
        {walletIcon ? <Image source={{ uri: walletIcon }} style={styles.walletIcon} /> : <View style={[styles.walletIcon, { backgroundColor: theme.colorAccent }]} />}
        <View style={styles.walletMeta}>
          <Text style={styles.walletName}>{walletName}</Text>
          <Text style={[styles.muted, { fontFamily: undefined }]}>{shortened}</Text>
          {pendingSigns > 0 && <Text style={styles.danger}>{t('connected.pending_signatures', { count: pendingSigns })}</Text>}
        </View>
      </View>
      <Pressable style={styles.secondaryButton} onPress={onShare}>
        <Text style={styles.secondaryButtonText}>{t('aria.click_to_copy')}</Text>
      </Pressable>
      <Pressable style={styles.dangerButton} onPress={onDisconnect}>
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
      <Text style={[styles.title, { color: theme.colorDanger }]}>{t('error.title')}</Text>
      <Text style={styles.muted}>{message}</Text>
      <Pressable style={styles.primaryButton} onPress={onRetry}>
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
    content: { padding: 20, paddingBottom: 40, gap: 14 },
    centered: { alignItems: 'center', gap: 10, paddingVertical: 32 },
    title: { color: theme.colorText, fontSize: 18, fontWeight: '700' },
    muted: { color: theme.colorTextMuted, fontSize: 13 },
    walletRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: theme.colorSurface,
      borderRadius: theme.radiusMd,
      padding: 14,
      opacity: 1,
    },
    walletIcon: { width: 40, height: 40, borderRadius: theme.radiusSm },
    walletMeta: { flex: 1, gap: 2 },
    walletName: { color: theme.colorText, fontSize: 15, fontWeight: '600' },
    installButton: {
      backgroundColor: theme.colorAccent,
      borderRadius: theme.radiusSm,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    installText: { color: theme.colorAccentText, fontSize: 13, fontWeight: '600' },
    qrPlaceholder: {
      backgroundColor: theme.colorSurface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    qrPlaceholderText: { color: theme.colorTextMuted, fontSize: 12, fontWeight: '700' },
    qrWrap: {
      alignItems: 'center',
      padding: 16,
      backgroundColor: theme.colorSurface,
      borderRadius: theme.radiusMd,
    },
    animWrap: { width: 96, height: 96, alignItems: 'center', justifyContent: 'center' },
    animLogo: { width: 56, height: 56, borderRadius: theme.radiusSm },
    animArc: { position: 'absolute', width: 88, height: 88 },
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
      paddingVertical: 12,
      alignItems: 'center',
    },
    secondaryButtonText: { color: theme.colorText, fontSize: 14, fontWeight: '600' },
    dangerButton: {
      borderColor: theme.colorDanger,
      borderWidth: 1,
      borderRadius: theme.radiusMd,
      paddingVertical: 12,
      alignItems: 'center',
      marginTop: 4,
    },
    dangerButtonText: { color: theme.colorDanger, fontSize: 14, fontWeight: '600' },
    accountCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: theme.colorSurface,
      borderRadius: theme.radiusMd,
      padding: 16,
    },
    danger: { color: theme.colorDanger, fontSize: 12, marginTop: 2 },
  });
}
