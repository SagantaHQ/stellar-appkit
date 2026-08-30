/**
 * AppKitModal — the React Native modal UI for Stellar AppKit.
 *
 * This file is the orchestrator only: it owns the view state machine
 * (list → connecting → account / error / signing / SIWS phases), the
 * connect actions and the deep-link handoff. Every screen is its own
 * file under ./views/:
 *
 *   views/HeaderView.tsx       — web .header (brand / connecting-back /
 *                                connected-wallet variants)
 *   views/WalletListView.tsx   — wallet picker (web-parity flat rows)
 *   views/WalletRowView.tsx    — one wallet row (.wallet-row port)
 *   views/ConnectingView.tsx   — connecting (+ error variant + animations)
 *   views/SigningView.tsx      — signing (+ error variant)
 *   views/SiwsView.tsx         — Sign-In With Stellar phases + error
 *   views/AccountView.tsx      — connected account
 *   views/ErrorView.tsx        — generic error + network mismatch
 *
 * UX parity with the web `<stellar-appkit-modal>` (ui-web connect-modal.ts):
 *
 * - **Transaction preview** — the modal installs itself as the client's
 *   `onPreviewTransaction` handler (same as the web modal), so every
 *   signTransaction()/signMessage() first shows the decoded preview
 *   (operations, risk flags, fee, source account) with Cancel + Sign /
 *   Approve. Approve → signing view; Cancel → back to the account view;
 *   "Try again" after a wallet rejection re-shows the approved preview.
 * - **Error routing** matches the web exactly: a failed connect stays on
 *   the connecting view (its error variant: wallet logo, danger subtitle,
 *   "Try again" pill); a rejected sign stays on the signing view (Cancel +
 *   Try again); NetworkMismatchError opens the wrong-network view;
 *   everything else opens the generic error state.
 * - **Connected view** — the full web account panel: deterministic avatar,
 *   tap-to-copy address, network pill, explorer link, overflow menu
 *   (Switch Wallet / Disconnect), pending-signature banner, XLM balance
 *   with skeleton + 10s silent polling, "Get Testnet funds" (friendbot)
 *   with the 3s funding banner, and the Recent Activity list.
 * - **i18n** — every string is `t()`-resolved and the sheet re-renders on
 *   `setLocale()` (all 25 core locales). `detectDeviceLocale()` /
 *   `applyDeviceLocale()` wire the device language at app init.
 * - **Back arrow** — while connecting (error or not), on SIWS errors and
 *   on signing errors the header shows the `.header--connecting` variant:
 *   back chevron + centered wallet name + close. Back cancels the state
 *   and returns to the wallet list.
 * - **SIWS** — when `client.siwsConfig` is set, the automatic sign-in
 *   flow runs right after a successful connect (checking → nonce →
 *   signing → verifying → account), with retry caps, per-step timeouts
 *   and disconnect-on-fail exactly like the web modal (useSiws.ts).
 * - **Inline mode** — `mode="inline"` renders the panel in place (web
 *   `mode="inline"`): bordered card, no overlay, no close button, always
 *   visible; `open`/`onClose` only apply to the bottom-sheet mode.
 * - **Footer** — "Powered by Stellar AppKit", pinned at the panel bottom
 *   like the web `.footer`.
 *
 * Mobile-native deviations (deliberate, documented in ARCHITECTURE.md):
 * - **Deep-link-only pairing**: on a phone the same device would have to
 *   scan a QR code, so the RN modal never renders one. Every wallet row
 *   embeds the WalletConnect pairing URI into the wallet's own deep link
 *   (`freighterwallet://wc-redirect/wc?uri=...`) and hands off to the OS,
 *   Solana-Mobile-Adapter style. "Copy pairing code" covers wallets with
 *   manual pairing fields.
 * - **True wallet names** — connecting/signing/SIWS views carry the
 *   wallet's own name and icon, never a generic "WalletConnect" label.
 *
 * Presentation: @gorhom/bottom-sheet with a backdrop + swipe-to-dismiss
 * (default), or the inline panel. Icons render through `<WalletIcon>` —
 * zero native image dependencies; the spinner is the pure-View squircle
 * arc port (SquircleArc), no react-native-svg anywhere.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, Share, Text, Vibration, View } from 'react-native';
import BottomSheet, { BottomSheetBackdrop, BottomSheetFooter, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import type { ImageSourcePropType } from 'react-native';
import { ConnectError, NetworkMismatchError, onLocaleChange, t } from '@saganta/stellar-appkit';
import type { StellarAppKit, TransactionPreview, WalletConnector } from '@saganta/stellar-appkit';
import {
  buildWalletConnectDeepLink,
  buildWalletConnectUniversalLink,
  buildOpenWalletAppLink,
  getMobileWallet,
  type MobileWalletDeepLink,
} from '../deep-links.js';
import { useAppKit } from './useAppKit.js';
import { useReducedMotion } from './animations.js';
import { useSiwsFlow } from './useSiws.js';
import { buildStyles } from './styles.js';
import { explorerUrl, fundViaFriendbot, useAccountData, type TxHistoryItem } from './accountData.js';
import { VIEW_TITLES, type WalletBranding, type WalletRow, type ViewId } from './types.js';
import { defaultTheme, type ConnectThemeRN } from './theme.js';
import { HeaderView } from './views/HeaderView.js';
import { WalletListView } from './views/WalletListView.js';
import { ConnectingView } from './views/ConnectingView.js';
import { PreviewView } from './views/PreviewView.js';
import { SigningView } from './views/SigningView.js';
import { SiwsView } from './views/SiwsView.js';
import { AccountView } from './views/AccountView.js';
import { ErrorView, NetworkMismatchView } from './views/ErrorView.js';

export interface AppKitModalProps {
  client: StellarAppKit;
  /**
   * Bottom-sheet mode only: whether the sheet is presented. Ignored in
   * inline mode (the panel is always rendered, like the web's
   * `mode="inline"` whose open() is a no-op).
   */
  open: boolean;
  onClose: () => void;
  theme?: ConnectThemeRN;
  /**
   * Presentation mode — web parity:
   * - 'bottomsheet' (default): the @gorhom/bottom-sheet overlay
   * - 'inline': the panel renders in place, bordered, always visible
   */
  mode?: 'bottomsheet' | 'inline';
  /** Header title override (web `title` attribute). Defaults to the localized view title. */
  title?: string;
  /** Header logo (web `logo-src` attribute). 22×22, radius 6. */
  logo?: ImageSourcePropType;
}

export function AppKitModal({
  client,
  open,
  onClose,
  theme = defaultTheme,
  mode = 'bottomsheet',
  title,
  logo,
}: AppKitModalProps) {
  const state = useAppKit(client);
  const reducedMotion = useReducedMotion();
  const styles = useMemo(() => buildStyles(theme), [theme]);

  // All copy is `t()`-resolved at render time — re-render when the app
  // switches the locale so the sheet translates instantly (web parity:
  // the web modal subscribes to onLocaleChange the same way).
  const [, setLocaleTick] = useState(0);
  useEffect(() => onLocaleChange(() => setLocaleTick((v) => v + 1)), []);

  const [view, setView] = useState<ViewId>('list');
  const [walletRows, setWalletRows] = useState<WalletRow[]>([]);
  const [loadingWallets, setLoadingWallets] = useState(false);
  const [wcUri, setWcUri] = useState<string | null>(null);
  const [showMoreWallets, setShowMoreWallets] = useState(false);
  /** Error message for the connecting / signing error variants (web connectingError). */
  const [connectingError, setConnectingError] = useState<string | null>(null);
  /** Last raw error — feeds the generic error + network-mismatch views. */
  const [lastError, setLastError] = useState<{ message: string; actualNetwork?: string; expectedNetwork?: string } | null>(null);
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
  /** Re-runs the last connect (web retry-connecting re-selects the same wallet). */
  const lastConnectAction = useRef<(() => Promise<void>) | null>(null);
  const sheetRef = useRef<BottomSheet>(null);

  // ---- Transaction preview (web showTransactionPreview / resolvePreview) --
  /** The sign request awaiting user approval — resolves the client's
   * onPreviewTransaction promise. The sign queue guarantees one at a time. */
  const [pendingPreview, setPendingPreview] = useState<{
    preview: TransactionPreview;
    resolve: (approved: boolean) => void;
  } | null>(null);
  /** The preview the user approved — re-shown by "Try again" after a wallet
   * rejection (web lastApprovedPreview). */
  const lastApprovedPreview = useRef<TransactionPreview | null>(null);
  /** Suppresses the error event that follows a preview rejection (the sign
   * promise rejects with "user rejected" — the user already declined on
   * purpose, so the generic error view would be noise, not information). */
  const previewJustRejected = useRef(false);

  // ---- Account view data (web refreshAccountData + balance polling) ------
  const accountData = useAccountData(client, view === 'account' && state.session !== null);
  /** ~1.5s check-glyph feedback after tapping the address (web copyState). */
  const [copiedAddress, setCopiedAddress] = useState(false);
  /** ~3s "Funding requested" banner after the friendbot tap (web parity). */
  const [fundsRequested, setFundsRequested] = useState(false);

  // Latest-value refs for the client event subscriptions (which are wired
  // once) — the same pattern the web modal gets for free from `this.view`.
  const viewRef = useRef(view);
  viewRef.current = view;
  const connectingWalletRef = useRef(connectingWallet);
  connectingWalletRef.current = connectingWallet;
  const connectingErrorRef = useRef(connectingError);
  connectingErrorRef.current = connectingError;
  const pendingPreviewRef = useRef(pendingPreview);
  pendingPreviewRef.current = pendingPreview;

  // The WalletConnect connector — present whenever the app configured a
  // projectId. Named mobile wallets pair through it, so they're hidden
  // when it isn't registered.
  const wcConnector = useMemo(() => client.registry.get('walletconnect'), [client]);

  // ---- onPreviewTransaction installation (web modal client setter) --------
  // The web modal assigns client.onPreviewTransaction when it attaches and
  // warns if an app already installed its own handler. RN mirrors that: the
  // modal becomes the preview UI unless the app brought its own, and the
  // handler detaches again on unmount (only if it's still ours).
  useEffect(() => {
    if (client.onPreviewTransaction) {
      console.warn(
        '[stellar-appkit-react-native] Overwriting an existing onPreviewTransaction handler with the modal\u2019s own preview UI.'
      );
    }
    const ours = (preview: TransactionPreview): Promise<boolean> =>
      new Promise<boolean>((resolve) => {
        setPendingPreview({ preview, resolve });
        setView('preview');
      });
    client.onPreviewTransaction = ours;
    return () => {
      if (client.onPreviewTransaction === ours) client.onPreviewTransaction = null;
    };
  }, [client]);

  /** Web resolvePreview(true): keep the sheet open, hand off to the wallet. */
  const approvePreview = useCallback(() => {
    const pending = pendingPreviewRef.current;
    if (!pending) return;
    setPendingPreview(null);
    lastApprovedPreview.current = pending.preview;
    pending.resolve(true);
    setView('signing');
  }, []);

  /** Web resolvePreview(false): back to the account / wallet list. */
  const rejectPreview = useCallback(() => {
    const pending = pendingPreviewRef.current;
    if (!pending) return;
    setPendingPreview(null);
    previewJustRejected.current = true;
    pending.resolve(false);
    setView(client.session ? 'account' : 'list');
  }, [client]);

  // --- SIWS flow (web triggerSiwsFlow) ---------------------------------------
  const siwsDone = useCallback(() => setView('account'), []);
  const siwsWalletList = useCallback(() => setView('list'), []);
  const siws = useSiwsFlow(client, siwsDone, siwsWalletList);
  const siwsBusyRef = useRef(false);
  siwsBusyRef.current = siws.state.phase !== null && siws.state.phase !== 'siws-error';

  // Follow the flow's phases with the modal's view state.
  useEffect(() => {
    if (siws.state.phase) setView(siws.state.phase);
  }, [siws.state.phase]);

  // --- wallet list loading ---------------------------------------------------
  const refreshWallets = useCallback(async () => {
    setLoadingWallets(true);
    try {
      setWalletRows(await client.registry.listReachability());
    } finally {
      setLoadingWallets(false);
    }
  }, [client]);

  const effectiveOpen = mode === 'inline' ? true : open;
  useEffect(() => {
    if (effectiveOpen) {
      setView(client.session ? 'account' : 'list');
      setWcUri(null);
      setShowMoreWallets(false);
      setConnectingError(null);
      setLastError(null);
      setOpenFailed(false);
      setConnectingWallet(null);
      void refreshWallets();
      // Pre-warm the WalletConnect SignClient while the user is still
      // scanning the wallet list — the SDK module evaluation + relay
      // WebSocket handshake then never land on the tap. (Warm-up is
      // idempotent; apps that already warmed at app start no-op here.)
      void wcConnector?.warmUp?.();
    }
  }, [effectiveOpen, client, client.session, refreshWallets, wcConnector]);

  // --- client event → view wiring (mirrors the web modal's client setter) ----
  useEffect(() => {
    const offs = [
      client.on('statusChange', (status) => {
        if (status === 'connected') {
          setView('account');
          // SIWS after a RESTORED session: a wallet that came back from
          // storage still needs sign-in when SIWS is configured and no valid
          // session exists (the fresh-connect path triggers it via
          // finishConnect; useSiwsFlow's in-flight guard makes this a no-op
          // when both fire).
          if (client.siwsConfig && !client.siwsSession) void siws.start();
        } else if (status === 'idle' && client.sessions.length === 0) {
          // Disconnected back to idle — mirror the web 'disconnect' handler.
          setView('list');
        }
      }),
      client.on('error', (err) => {
        // The "user rejected" error that follows a preview Cancel is the
        // outcome the user chose — settle on the account/list view instead
        // of routing to the generic error screen (see rejectPreview).
        if (previewJustRejected.current && err instanceof ConnectError && err.code === -4) {
          previewJustRejected.current = false;
          return;
        }
        previewJustRejected.current = false;
        Vibration.vibrate([30, 50, 30]);
        const isMismatch = err instanceof NetworkMismatchError;
        // Web parity: a failed connect stays on the connecting view (error
        // variant); a failed sign stays on the signing view; a network
        // mismatch opens the wrong-network view; anything else the generic
        // error state.
        if (viewRef.current === 'connecting' && connectingWalletRef.current && !isMismatch) {
          setConnectingError(err.message || String(err));
        } else if (viewRef.current === 'signing') {
          setConnectingError(err.message || String(err));
        } else {
          setLastError({
            message: err.message || String(err),
            actualNetwork: isMismatch && err instanceof NetworkMismatchError ? err.actualNetwork : undefined,
            expectedNetwork: isMismatch && err instanceof NetworkMismatchError ? err.expectedNetwork : undefined,
          });
          setView(isMismatch ? 'network-mismatch' : 'error');
        }
      }),
      client.on('disconnect', () => {
        setView(client.sessions.length > 0 ? 'account' : 'list');
      }),
      client.on('accountSwitch', () => setView('account')),
    ];
    return () => offs.forEach((off) => off());
  }, [client, siws.start]);

  // Signing view while sign requests are queued — web enters it only via
  // the preview approval; on RN the modal surfaces incoming sign requests
  // itself. Never hijacks the connecting flow, the preview awaiting the
  // user's decision, the SIWS phases, or an error the user is still reading.
  useEffect(() => {
    if (state.pendingSignCount > 0) {
      const v = viewRef.current;
      const siwsBusy = siwsBusyRef.current;
      if (
        !siwsBusy &&
        v !== 'signing' &&
        v !== 'preview' &&
        v !== 'connecting' &&
        v !== 'error' &&
        v !== 'network-mismatch' &&
        !v.startsWith('siws-')
      ) {
        setConnectingError(null);
        setView('signing');
      }
    } else if (viewRef.current === 'signing' && !connectingErrorRef.current) {
      // Queue drained with no error — back to the account (web parity).
      setView(client.session ? 'account' : 'list');
    }
  }, [state.pendingSignCount, client.session]);

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

  /** Web selectWallet() tail: connected view + SIWS trigger when configured. */
  const finishConnect = useCallback(async () => {
    setView('account');
    if (client.siwsConfig) void siws.start();
  }, [client, siws]);

  /**
   * Connects a named mobile wallet (featured or under "More wallets"):
   * start the WalletConnect pairing, and the moment the relay hands us the
   * URI, deep-link straight into the wallet app. The whole flow is branded
   * with the wallet's own name and icon.
   */
  const connectMobileWallet = useCallback(
    async (wallet: MobileWalletDeepLink) => {
      if (!wcConnector) return;
      const action = async () => {
        pairedMobileWalletId.current = wallet.id;
        setConnectingWallet({ name: wallet.name, icon: wallet.icon, key: wallet.id });
        setConnectingError(null);
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
          await finishConnect();
        } catch {
          /* surfaced via the error event */
        }
      };
      lastConnectAction.current = action;
      await action();
    },
    [client, wcConnector, openWalletDeepLink, finishConnect]
  );

  /** Connects a registered connector directly (Albedo WebView, …). */
  const connectConnector = useCallback(
    async (walletId: string) => {
      const connector = client.registry.get(walletId);
      if (!connector) return;
      const action = async () => {
        setConnectingWallet({ name: connector.meta.name, icon: connector.meta.icon ?? null, key: walletId });
        setConnectingError(null);
        setOpenFailed(false);
        setView('connecting');
        try {
          await client.connect(walletId);
          await finishConnect();
        } catch {
          /* error event switches to the error view */
        }
      };
      lastConnectAction.current = action;
      await action();
    },
    [client, finishConnect]
  );

  /** Web cancel-connecting: back arrow — abandon the state, keep the promise running. */
  const cancelConnecting = useCallback(() => {
    setConnectingWallet(null);
    setWcUri(null);
    setConnectingError(null);
    setOpenFailed(false);
    setView('list');
  }, []);

  /** Web retry-connecting: re-run the exact same connect action. */
  const retryConnect = useCallback(() => {
    setConnectingError(null);
    setOpenFailed(false);
    const action = lastConnectAction.current;
    if (action) void action();
  }, []);

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
    setFundsRequested(false);
    setView('list');
    void refreshWallets();
  }, [client, refreshWallets]);

  // --- account view actions (web connected-view handlers) ---------------------

  /** Address tap → share sheet (the RN copy surface) + check feedback. */
  const copyAddress = useCallback(
    async (address: string) => {
      setCopiedAddress(true);
      setTimeout(() => setCopiedAddress(false), 1500);
      try {
        await Share.share({ message: address });
      } catch {
        /* the user dismissed the sheet — the address is still shown */
      }
    },
    []
  );

  /** "Get Testnet funds" → friendbot, 3s banner, delayed balance refresh. */
  const getTestnetFunds = useCallback(async () => {
    const address = client.session?.address;
    if (!address) return;
    setFundsRequested(true);
    await fundViaFriendbot(address);
    // friendbot typically credits within a few seconds — refresh at 2s and
    // 5s like the web modal's delayed polls, then drop the banner at 3s.
    setTimeout(() => accountData.refresh(), 2000);
    setTimeout(() => accountData.refresh(), 5000);
    setTimeout(() => setFundsRequested(false), 3000);
  }, [client, accountData]);

  /** Overflow → Switch Wallet: back to the picker (web data-action). */
  const switchWallet = useCallback(() => {
    setView('list');
  }, []);

  /** Tx row / explorer link — opens the external explorer. */
  const openExplorer = useCallback(
    (path: string) => {
      const network = client.session?.network ?? 'TESTNET';
      void Linking.openURL(explorerUrl(path, network));
    },
    [client]
  );
  const openTxExplorer = useCallback((tx: TxHistoryItem) => openExplorer(`tx/${tx.hash}`), [openExplorer]);

  /** Sheet dismissal — web close(): SIWS that never succeeded disconnects (disconnectOnFail). */
  const handleClose = useCallback(() => {
    if (
      siws.state.pending &&
      client.siwsConfig &&
      client.siwsConfig.disconnectOnFail !== false &&
      client.session
    ) {
      void client.disconnect();
    }
    onClose();
  }, [siws.state.pending, client, onClose]);

  if (!effectiveOpen) return null;

  // --- header variant resolution (web renderPanelHeader) ----------------------
  const siwsErrorActive = view === 'siws-error';
  const isBackHeaderView =
    view === 'connecting' ||
    siwsErrorActive ||
    (view === 'signing' && connectingError !== null);
  const backWalletName = isBackHeaderView
    ? connectingWallet?.name ?? state.walletName ?? t('wallet.fallback_name')
    : null;
  const headerTitle = title ?? (VIEW_TITLES[view] ? t(VIEW_TITLES[view]!) : t('title.connect_wallet'));
  const isConnectedHeader = view === 'account' && state.session !== null;

  const header = (
    <HeaderView
      styles={styles}
      theme={theme}
      showClose={mode !== 'inline'}
      onClose={handleClose}
      onBack={cancelConnecting}
      backWalletName={backWalletName}
      connectedWalletName={isConnectedHeader ? state.walletName ?? t('wallet.fallback_name') : null}
      connectedWalletIcon={state.walletIcon}
      connectedWalletKey={connectingWallet?.key ?? null}
      title={headerTitle}
      logo={logo}
    />
  );

  const footer = (
    <Pressable
      style={styles.footer}
      onPress={() => void Linking.openURL('https://github.com/sagantaHQ/stellar-appkit')}
      accessibilityRole="link"
    >
      <Text style={styles.footerText}>
        {t('footer.powered_by', { brand: '' })}
        <Text style={styles.footerLink}>{t('footer.brand_name')}</Text>
      </Text>
    </Pressable>
  );

  const body = (
    <>
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

      {view === 'connecting' && (
        <ConnectingView
          styles={styles}
          theme={theme}
          reducedMotion={reducedMotion}
          walletName={connectingWallet?.name ?? state.walletName ?? t('wallet.fallback_your_wallet')}
          walletIcon={connectingWallet?.icon ?? state.walletIcon}
          walletKey={connectingWallet?.key ?? null}
          subtitle={connectingError ?? t('connecting.accept_request')}
          error={connectingError !== null}
          openFailed={openFailed}
          failedWalletName={pairedMobileWalletId.current ? getMobileWallet(pairedMobileWalletId.current)?.name : undefined}
          onInstallFailedWallet={() => {
            const wallet = pairedMobileWalletId.current ? getMobileWallet(pairedMobileWalletId.current) : undefined;
            const url = wallet && Platform.select({ ios: wallet.installUrl.ios, android: wallet.installUrl.android });
            if (url) void Linking.openURL(url);
          }}
          onRetryConnect={retryConnect}
          onRetryOpen={retryOpenWallet}
          onShareUri={wcUri && pairedMobileWalletId.current ? sharePairingUri : undefined}
          reopenWallet={
            pairedMobileWalletId.current && view === 'connecting' ? retryOpenWallet : undefined
          }
        />
      )}

      {view === 'preview' && pendingPreview && (
        <PreviewView
          styles={styles}
          theme={theme}
          reducedMotion={reducedMotion}
          preview={pendingPreview.preview}
          walletName={state.walletName ?? t('wallet.fallback_name')}
          walletIcon={state.walletIcon}
          walletKey={connectingWallet?.key ?? pairedMobileWalletId.current}
          appName={client.appMetadata?.name ?? t('preview.default_app_name')}
          appLogo={logo ?? null}
          onApprove={approvePreview}
          onReject={rejectPreview}
          onCopyAddress={() => void copyAddress(pendingPreview.preview.sourceAccount)}
          copied={copiedAddress}
        />
      )}

      {view === 'signing' && (
        <SigningView
          styles={styles}
          theme={theme}
          reducedMotion={reducedMotion}
          walletName={state.walletName ?? t('wallet.fallback_your_wallet')}
          walletIcon={state.walletIcon}
          walletKey={connectingWallet?.key ?? pairedMobileWalletId.current}
          error={connectingError}
          onRetry={() => {
            // Web retry-signing: re-show the approved preview so the user
            // can approve again; without one, fall back to the account view.
            setConnectingError(null);
            const last = lastApprovedPreview.current;
            if (last) {
              setPendingPreview({ preview: last, resolve: () => undefined });
              setView('preview');
            } else {
              setView(client.session ? 'account' : 'list');
            }
          }}
          onCancel={() => {
            setConnectingError(null);
            setView(client.session ? 'account' : 'list');
          }}
        />
      )}

      {siws.state.phase && view.startsWith('siws-') && (
        <SiwsView
          styles={styles}
          theme={theme}
          reducedMotion={reducedMotion}
          walletName={state.walletName ?? t('wallet.fallback_your_wallet')}
          walletIcon={state.walletIcon}
          walletKey={connectingWallet?.key ?? pairedMobileWalletId.current}
          phase={siws.state.phase}
          error={siws.state.error}
          walletConnected={state.session !== null}
          onCancel={() => {
            siws.cancel();
            setView('list');
          }}
          onRetry={siws.retry}
        />
      )}

      {view === 'account' && state.session && (
        <AccountView
          styles={styles}
          theme={theme}
          address={state.session.address}
          network={state.session.network}
          pendingSigns={state.pendingSignCount}
          balance={accountData.balance}
          history={accountData.history}
          balanceLoading={accountData.loading}
          fundsRequested={fundsRequested}
          copied={copiedAddress}
          onCopyAddress={() => void copyAddress(state.session!.address)}
          onOpenExplorer={() => openExplorer(`account/${state.session!.address}`)}
          onGetFunds={() => void getTestnetFunds()}
          onSwitchWallet={switchWallet}
          onDisconnect={disconnect}
          onTxPress={openTxExplorer}
        />
      )}

      {view === 'error' && (
        <ErrorView
          styles={styles}
          theme={theme}
          message={lastError?.message ?? t('error.default_message')}
          onRetry={() => {
            setLastError(null);
            setView('list');
            void refreshWallets();
          }}
        />
      )}

      {view === 'network-mismatch' && (
        <NetworkMismatchView
          styles={styles}
          theme={theme}
          actualNetwork={lastError?.actualNetwork}
          expectedNetwork={lastError?.expectedNetwork}
          onRetry={() => {
            setLastError(null);
            setView('list');
            void refreshWallets();
          }}
        />
      )}
    </>
  );

  // --- inline mode: the panel renders in place (web .inline-root) --------------
  if (mode === 'inline') {
    return (
      <View style={styles.inlinePanel}>
        {header}
        <ScrollView style={styles.inlineBody} contentContainerStyle={styles.content}>
          {body}
        </ScrollView>
        {footer}
      </View>
    );
  }

  // --- bottom-sheet mode (default) ---------------------------------------------
  return (
    <BottomSheet
      ref={sheetRef}
      index={0}
      snapPoints={['82%']}
      enablePanDownToClose
      onClose={handleClose}
      backdropComponent={(props) => (
        <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} pressBehavior="close" opacity={0.6} />
      )}
      backgroundStyle={{ backgroundColor: theme.colorSurface, borderTopLeftRadius: theme.radiusLg, borderTopRightRadius: theme.radiusLg }}
      handleIndicatorStyle={{ backgroundColor: theme.colorTextMuted }}
      footerComponent={(props) => <BottomSheetFooter {...props}>{footer}</BottomSheetFooter>}
    >
      {header}
      <BottomSheetScrollView contentContainerStyle={[styles.content, { paddingBottom: 68 }]}>
        {body}
      </BottomSheetScrollView>
    </BottomSheet>
  );
}
