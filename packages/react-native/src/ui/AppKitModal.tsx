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
 * - **Auto-close on success** — when the operation the app requested
 *   completes successfully (a connect settles — including the return from
 *   the wallet app's approval screen — or the sign queue drains cleanly),
 *   the sheet dismisses itself after a short confirmation flash. The
 *   mobile deep-link pattern: the user just confirmed in the wallet, the
 *   round trip is done. The web modal instead stays open on the account
 *   view; RN deviates on purpose (documented in ARCHITECTURE.md). Success
 *   is the ONLY trigger — never fires on errors/rejections (web parity:
 *   the user reads the result and acts on it); opt out with
 *   `autoCloseOnComplete={false}`. See ui/auto-close.ts.
 * - **Deferred WC warm-up** — the WalletConnect SignClient is pre-warmed
 *   at modal mount (app start for always-mounted modals) AND on every
 *   open, both deferred ~150ms: the SDK's module-tree evaluation blocks
 *   the JS thread for seconds on debug builds, and firing it in the open
 *   tick would freeze the sheet's layout/entrance animation — the tap
 *   would look dead for 5-10 seconds. See ui/warm-up.ts.
 * - **Auto-open the wallet on sign** (`autoOpenWalletOnSign`, default on)
 *   — the moment a WalletConnect request is queued from this side (sign,
 *   auth entry, SIWS prompt, retry), the paired wallet app opens by
 *   itself, MWA-style: the user lands straight in the wallet's pending
 *   prompt instead of tapping "Open in wallet app". Fires only on NEW
 *   requests (count increases), only while the app is foregrounded, and
 *   only when a target is derivable — the connect-time pick, or the
 *   wallet the restored session's peer metadata points back to after a
 *   cold restart. Failures are silent; the manual button remains.
 * - **Wallet-side disconnects propagate** — when the user disconnects
 *   INSIDE the wallet, session_delete arrives over the relay (typically
 *   on the next foregrounding, when the transport restart re-delivers
 *   queued messages), core reconciles its session map, and the modal
 *   flips off the account view exactly as if the app had disconnected.
 *   No zombie "connected" UI for a session the wallet already killed.
 *
 * Presentation: @gorhom/bottom-sheet with a backdrop + swipe-to-dismiss
 * (default), or the inline panel. Icons render through `<WalletIcon>` —
 * zero native image dependencies; the spinner is the pure-View squircle
 * arc port (SquircleArc), no react-native-svg anywhere.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Linking, Platform, Pressable, ScrollView, Text, Vibration, View } from 'react-native';
import BottomSheet, { BottomSheetBackdrop, BottomSheetFooter, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import type { ImageSourcePropType } from 'react-native';
import { ConnectError, NetworkMismatchError, onLocaleChange, t } from '@saganta/stellar-appkit';
import type { StellarAppKit, TransactionPreview, WalletConnector } from '@saganta/stellar-appkit';
import {
  buildWalletConnectDeepLink,
  buildWalletConnectUniversalLink,
  buildOpenWalletAppLink,
  buildSignHandoffLink,
  getMobileWallet,
  resolveSignHandoffWalletId,
  type MobileWalletDeepLink,
  type WalletPeerRedirect,
} from '../deep-links.js';
import { useAppKit } from './useAppKit.js';
import { useReducedMotion } from './animations.js';
import { scheduleWalletConnectWarmUp } from './warm-up.js';
import { useWalletConnectForegroundRefresh } from '../wc-foreground.js';
import { useAppFocusReturn } from '../focus-return.js';
import { copyText } from '../clipboard.js';
import { useSiwsFlow } from './useSiws.js';
import { buildStyles } from './styles.js';
import { explorerUrl, fundViaFriendbot, useAccountData, type TxHistoryItem } from './accountData.js';
import type { ThemedBrowserSession } from '../browser/inapp-browser.js';
import { VIEW_TITLES, resolveViewOnOpen, type WalletBranding, type WalletRow, type ViewId } from './types.js';
import { AUTO_CLOSE_DELAY_MS, shouldAutoClose } from './auto-close.js';
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
  /**
   * Themed in-app browser for plain http(s) handoffs — explorer links,
   * wallet install pages and the footer link open in a themed Chrome
   * Custom Tab / SFSafariViewController (modal pageSheet on iOS) instead
   * of bouncing the user out to the external browser. Wallet deep links
   * (custom schemes) always go through `Linking` — Custom Tabs only
   * handle web URLs. Optional: without it every URL opens via `Linking`
   * exactly as before.
   *
   * Build one with `createThemedBrowserSession({ reborn, expo }, { theme })`
   * — see browser/inapp-browser.ts for the preference chain and why
   * passkey-needing web wallets must use this surface instead of a WebView.
   */
  browser?: ThemedBrowserSession;
  /**
   * Bottom-sheet mode only (default true): when an operation the app
   * requested completes SUCCESSFULLY — a connect settles (deep-link
   * handoff included, SIWS run to its end) or the sign queue drains
   * cleanly — the sheet closes itself after a short confirmation flash
   * instead of parking on the account view until the user dismisses it.
   * Success is the only trigger: failures and rejections never auto-close
   * (web parity: the user reads the result and acts on it), inline panels
   * are exempt (no sheet to close), and reopening the modal for account
   * management never self-closes. See ui/auto-close.ts.
   */
  autoCloseOnComplete?: boolean;
  /**
   * Default true: the moment a WalletConnect request is triggered from
   * this side — a sign, an auth entry, a SIWS prompt — the paired wallet
   * app is opened automatically (MWA-style: the user lands straight in the
   * wallet's pending prompt instead of tapping "Open in wallet app" by
   * hand). Only fires while the app is foregrounded and only when a target
   * is derivable: the wallet the user picked during connect, or the wallet
   * the restored session's peer metadata points back to after a cold
   * restart. The short dispatch delay lets the request reach the relay
   * before the app backgrounds; failures are silent (the manual button on
   * the signing view remains as the fallback). Set false to keep the
   * fully-manual handoff (the button only).
   */
  autoOpenWalletOnSign?: boolean;
}

export function AppKitModal({
  client,
  open,
  onClose,
  theme = defaultTheme,
  mode = 'bottomsheet',
  title,
  logo,
  browser,
  autoCloseOnComplete = true,
  autoOpenWalletOnSign = true,
}: AppKitModalProps) {
  const state = useAppKit(client);
  const reducedMotion = useReducedMotion();
  const styles = useMemo(() => buildStyles(theme), [theme]);

  // Zombie-socket antidote: every return to 'active' (i.e. back from the
  // wallet app after approving a pairing or a sign request) restarts the
  // WalletConnect relay so queued relay messages get delivered — without
  // this the approval never lands and the flow below stays stuck on the
  // connecting view. See wc-foreground.ts.
  useWalletConnectForegroundRefresh(client);

  // Focus return: when the operation the app requested settles while the
  // app sits backgrounded behind the wallet app, re-focus it (self-open
  // of appMetadata.redirect's deep link, best effort — cooperating wallets
  // bounce back on their own via the session proposal's redirect). Skipped
  // automatically while the app is foregrounded. See focus-return.ts.
  useAppFocusReturn(client);

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
  /**
   * A modal-driven operation completed successfully (connect settled /
   * sign queue drained clean) — the armed half of the auto-close behavior
   * (ui/auto-close.ts). State, not a ref: a completion can land while the
   * view is already 'account' (the statusChange handler set it first, so
   * finishConnect's setView is a React bailout), and the auto-close effect
   * below must re-evaluate for the flag alone.
   */
  const [completionArmed, setCompletionArmed] = useState(false);
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
  /** Suppresses the code -4 error event that follows a USER-initiated connect
   * cancel (back arrow / sheet close on the connecting view). The connector
   * abort() makes connect() reject promptly — without this latch that
   * rejection would route to the generic error view right after the user
   * deliberately walked away, which reads as the library "yelling" at them.
   * Same shape as previewJustRejected. */
  const connectJustCancelled = useRef(false);

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

  // Warm the WalletConnect SignClient at MOUNT, deferred (ui/warm-up.ts).
  // <AppKitModal> is typically mounted for the whole app lifetime (rendering
  // null while closed), so this fires at app start: the SDK's module-tree
  // evaluation and the relay WebSocket handshake complete while the user is
  // still on the first screen — not on their first "Connect" tap. The settle
  // window keeps the app's own first paint/animations ahead of the
  // evaluation's JS-thread blockage; apps that warm the connector themselves
  // (the RN demo does) just see the idempotent no-op.
  useEffect(() => scheduleWalletConnectWarmUp(wcConnector), [wcConnector]);

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
    setCompletionArmed(false); // declined — the user stays in the driver's seat
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
      // Web open() parity: in-flight flows own the view — see
      // resolveViewOnOpen. A sign request can arrive from anywhere in the
      // app (the modal is often opening BECAUSE of it via the app's
      // auto-open on pendingSignCount), so the default account/list reset
      // must never clobber a preview awaiting the user's decision, a sign
      // the wallet is processing, or a running SIWS phase — resetting would
      // orphan the flow and hang the sign queue forever.
      setView(
        resolveViewOnOpen({
          pendingPreview: pendingPreviewRef.current !== null,
          pendingSignCount: state.pendingSignCount,
          siwsPhase: siws.state.phase,
          siwsBusy: siwsBusyRef.current,
          hasSession: client.session !== null,
        })
      );
      setWcUri(null);
      setShowMoreWallets(false);
      setConnectingError(null);
      setLastError(null);
      setOpenFailed(false);
      setConnectingWallet(null);
      void refreshWallets();
      // Re-arm the WalletConnect warm-up on open — DEFERRED (ui/warm-up.ts):
      // the SDK's module-tree evaluation blocks the JS thread for seconds
      // on debug builds, so firing it in the open tick would freeze the
      // sheet's layout/entrance animation and the tap would look dead for
      // 5-10s. The short settle window lets the sheet paint first; the
      // warm-up is idempotent, so apps that warmed at app start no-op here.
      scheduleWalletConnectWarmUp(wcConnector);
    } else if (pendingPreviewRef.current) {
      // Web close() parity: a preview still awaiting the user's decision
      // resolves as REJECTED when the modal goes away (the app set
      // open={false}) — otherwise its promise never settles and the sign
      // queue stays stuck at 1 forever. The follow-up "user rejected"
      // error is suppressed exactly like a manual preview Cancel.
      const pending = pendingPreviewRef.current;
      setPendingPreview(null);
      previewJustRejected.current = true;
      pending.resolve(false);
    }
  // Deps note: state.pendingSignCount / siws.state.phase are read from the
  // closure without being deps ON PURPOSE — this effect must only fire on
  // open transitions. Re-running it when the sign queue drains would wipe
  // the signing-view error the user is still reading; the closure values are
  // already current whenever the effect fires (React runs it after the render
  // in which effectiveOpen flipped).
  }, [effectiveOpen, client, client.session, refreshWallets, wcConnector]);

  // --- client event → view wiring (mirrors the web modal's client setter) ----
  useEffect(() => {
    const offs = [
      client.on('statusChange', (status) => {
        if (status === 'connected') {
          // A connect settling successfully retires any stale cancel latch
          // (see connectJustCancelled) — nothing is in flight anymore.
          connectJustCancelled.current = false;
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
        // Same for a user-initiated connect cancel — the connector's
        // abort() rejects the in-flight connect() with a code -4 "cancelled"
        // within one poll tick; that's the chosen outcome, not an error.
        if (connectJustCancelled.current && err instanceof ConnectError && err.code === -4) {
          connectJustCancelled.current = false;
          return;
        }
        previewJustRejected.current = false;
        connectJustCancelled.current = false;
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
      client.on('disconnect', ({ walletId }) => {
        // A wallet-side disconnect (the user tapped Disconnect INSIDE the
        // wallet — session_delete arrives over the relay, delivered on the
        // next foregrounding) lands here exactly like an app-initiated one,
        // now that core propagates it. Either way: the mobile pairing hint
        // for that wallet is dead — drop it so the sign handoff and the
        // connecting branding don't point at a wallet that already left.
        if (walletId === 'walletconnect' && !client.sessions.some((s) => s.walletId === 'walletconnect')) {
          pairedMobileWalletId.current = null;
        }
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
  // `view` is a dependency so the entry is self-healing: if any other code
  // path moves the view while a sign is queued (e.g. the open-reset above
  // landing between queue-change and preview render), this re-enters the
  // signing view instead of leaving the user on a view that can't resolve
  // the request.
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
      // The requested sign also SUCCEEDED → arm the auto-close
      // (ui/auto-close.ts).
      setCompletionArmed(true);
      setView(client.session ? 'account' : 'list');
    }
  }, [state.pendingSignCount, client.session, view]);

  // --- auto-open the wallet app when a WalletConnect request is fired -------
  // (MWA-style sign handoff — autoOpenWalletOnSign, default on)
  //
  // The moment the client queues a NEW wallet-side request (pendingSignCount
  // increases: a sign, an auth entry, a SIWS prompt, a retry), the paired
  // wallet app is opened automatically so the user lands straight in its
  // pending prompt — mirroring mobile wallet adapters, where "Continue in
  // wallet" is a tap the OS makes for you. The connect flow already does
  // this via setOnUri (deep link the instant the pairing URI exists); this
  // is the same handoff for everything that comes AFTER connecting.
  //
  // Guards, all load-bearing:
  // - INCREASES only: a drain (count falling) or an unrelated re-render
  //   (the snapshot re-fires on every client event) never re-opens the
  //   wallet — only a genuinely new request does, including a "Try again"
  //   after a failure (the queue went back down before it went up).
  // - AppState 'active': never yank the user out of another app — iOS
  //   refuses background openURL anyway; Android would rudely foreground
  //   the wallet over whatever the user switched to.
  // - Dispatch delay (350ms): the signQueueChange event fires BEFORE the
  //   request reaches the relay (enqueueSign emits, then the connector
  //   call runs). Backgrounding the app a beat later lets the WebSocket
  //   publish land first — otherwise the request can be lost to the
  //   zombified socket and the wallet opens with nothing to approve.
  // - Silent failure: Linking errors are swallowed — the manual "Open in
  //   wallet app" button on the signing view stays as the fallback.
  const SIGN_HANDOFF_DELAY_MS = 350;
  const autoOpenRef = useRef(autoOpenWalletOnSign);
  autoOpenRef.current = autoOpenWalletOnSign;
  const lastSignCountRef = useRef(0);
  const handoffTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const count = state.pendingSignCount;
    const prev = lastSignCountRef.current;
    lastSignCountRef.current = count;
    if (!autoOpenRef.current || count <= prev) return; // disabled, drain, or echo
    // A connect pairing is already driving its own deep link (setOnUri);
    // a sign can't be in flight before a session exists, but a stray
    // handoff during the connecting view would fight that flow.
    if (viewRef.current === 'connecting') return;
    // Resolve the target: the wallet the user picked, else the wallet the
    // restored session's peer metadata points back to.
    const peer = (wcConnector?.getSessionPeer?.() as { redirect?: WalletPeerRedirect | null } | null)?.redirect ?? null;
    const walletId = resolveSignHandoffWalletId(peer, pairedMobileWalletId.current);
    const link = buildSignHandoffLink(walletId, peer);
    if (!link) return; // no derivable wallet (desktop/unregistered) — manual only
    if (handoffTimerRef.current) clearTimeout(handoffTimerRef.current);
    handoffTimerRef.current = setTimeout(() => {
      handoffTimerRef.current = null;
      if (AppState.currentState !== 'active') return;
      Linking.openURL(link).catch(() => undefined);
    }, SIGN_HANDOFF_DELAY_MS);
  }, [state.pendingSignCount, wcConnector]);
  // Never leave a pending handoff timer armed past unmount.
  useEffect(
    () => () => {
      if (handoffTimerRef.current) clearTimeout(handoffTimerRef.current);
    },
    []
  );

  // The sign-handoff target as a render value (not just the ref): after a
  // cold restart the user never picked a wallet in this process, but the
  // restored session's peer metadata still names it — this is what puts the
  // "Open in wallet app" button on the signing view for restored sessions.
  const signHandoffWalletId = useMemo(
    () =>
      resolveSignHandoffWalletId(
        (wcConnector?.getSessionPeer?.() as { redirect?: WalletPeerRedirect | null } | null)?.redirect ?? null,
        pairedMobileWalletId.current,
      ),
    // Re-resolved on every session/snapshot change — the peer metadata is
    // captured lazily (restore() rehydrates it), so the first resolve after
    // a cold start can be null until the connector warms up.
    [state.session, state.walletName, wcConnector, view, open]
  );
  const signHandoffLink = useMemo(() => {
    const peer = (wcConnector?.getSessionPeer?.() as { redirect?: WalletPeerRedirect | null } | null)?.redirect ?? null;
    return buildSignHandoffLink(signHandoffWalletId, peer);
  }, [signHandoffWalletId, wcConnector, state.session]);

  // --- auto-close on successful operation completion (ui/auto-close.ts) ---
  // Mobile deep-link UX: when the operation the app requested completes
  // SUCCESSFULLY (a connect settles — including the return from the wallet
  // app's approval screen — or the sign queue drains cleanly), the sheet
  // closes itself after a short confirmation flash. Failures, rejections
  // and every view the user must act on never auto-close; the web modal's
  // stay-on-account behavior is an explicit `autoCloseOnComplete={false}`
  // away.

  // Armed resets on every sheet open/close transition: a modal reopened
  // for account management must never self-close off a stale completion,
  // and a sheet the app force-closed mid-flow leaves nothing armed behind.
  // Deliberately NOT hooked into the open-transition effect above — that
  // one also re-runs on `client.session` changes mid-flow, which would
  // disarm the flag right after the connect completion set it.
  const prevSheetOpenRef = useRef(false);
  useEffect(() => {
    const wasOpen = prevSheetOpenRef.current;
    prevSheetOpenRef.current = effectiveOpen;
    if (wasOpen !== effectiveOpen) setCompletionArmed(false);
  }, [effectiveOpen]);

  // The timer runs only while every shouldAutoClose() condition holds; any
  // dep change (a SIWS phase or a new sign request moving the view off
  // 'account', an error, the sheet closing, a disarm) runs the cleanup below
  // and cancels it. The armed flag itself survives those cancellations, so
  // a completion interrupted by SIWS phases still auto-closes once the
  // whole connect+sign-in flow settles on the account view.
  useEffect(() => {
    if (
      !shouldAutoClose({
        enabled: autoCloseOnComplete,
        mode,
        armed: completionArmed,
        view,
        hasSession: state.session !== null,
        sheetOpen: effectiveOpen,
      })
    ) {
      return;
    }
    const timer = setTimeout(() => {
      // Animate the sheet down through its own onClose → handleClose → the
      // app's onClose — the same path a swipe-dismiss takes, so the parent
      // lands in exactly the state it expects. Whatever the app shows
      // behind the sheet becomes visible again. (If the app is still
      // backgrounded — the user hasn't left the wallet app yet — the
      // dismissal runs as soon as JS can; either way, when they switch
      // back, the sheet is gone and the app UI is what's waiting.
      // Foregrounding the app itself is focus-return.ts's job.)
      setCompletionArmed(false);
      sheetRef.current?.close();
    }, AUTO_CLOSE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [autoCloseOnComplete, mode, effectiveOpen, view, state.session, completionArmed]);

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
    // The connect the modal drove SUCCEEDED → arm the auto-close
    // (ui/auto-close.ts). SIWS phases pause the timer; when configured, the
    // close lands only after the whole connect+sign-in flow finishes.
    setCompletionArmed(true);
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
        // A fresh attempt opens a fresh cancel window — a stale latch from
        // a previous cancel must never swallow a genuine error later.
        connectJustCancelled.current = false;
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

  /**
   * Web cancel-connecting: back arrow — abandon the state AND cancel the
   * underlying attempt.
   *
   * RN goes one step further than web's "keep the promise running": the
   * WalletConnect connector's abort() (a) rejects the in-flight connect()
   * within one 200ms poll tick — so no surprise "Request expired" error
   * view pops up minutes later on an unrelated screen — and (b)
   * disconnects the attempt's pairing, which dismisses the wallet's
   * still-pending approval prompt and prevents the SDK's
   * "No matching key. proposal: …" ERROR-log cascade when the wallet
   * answers a pairing this side already abandoned. The follow-up code -4
   * rejection is suppressed via connectJustCancelled.
   */
  const cancelConnecting = useCallback(() => {
    const walletId = connectingWalletRef.current?.key;
    try {
      if (walletId) client.registry.get(walletId)?.abort?.();
    } catch {
      // Abort is best-effort — the UI reset below is the real contract.
    }
    connectJustCancelled.current = true;
    setCompletionArmed(false); // the user took the back arrow — they keep control
    setConnectingWallet(null);
    setWcUri(null);
    setConnectingError(null);
    setOpenFailed(false);
    setView('list');
  }, [client]);

  /** Web retry-connecting: re-run the exact same connect action. */
  const retryConnect = useCallback(() => {
    setConnectingError(null);
    setOpenFailed(false);
    const action = lastConnectAction.current;
    if (action) void action();
  }, []);

  /**
   * Re-opens the paired wallet app (sign-request handoff). Works for BOTH
   * the wallet the user picked during connect (ref) and — after a cold
   * restart — the wallet the restored session's peer metadata names
   * (signHandoffWalletId), so the affordance survives an app restart.
   */
  const reopenPairedWallet = useCallback(async (targetId?: string) => {
    const id = targetId ?? pairedMobileWalletId.current;
    if (!id) return;
    try {
      await Linking.openURL(buildOpenWalletAppLink(id));
    } catch {
      /* the wallet prompts manually */
    }
  }, []);

  /**
   * Opens whatever deep link the sign handoff resolved to — a registered
   * wallet's bare scheme, or the peer's own native redirect for wallets
   * outside the registry. Used by the signing view's manual button when no
   * registry id applies (restored, unregistered wallet).
   */
  const reopenSignHandoffWallet = useCallback(async () => {
    if (!signHandoffLink) return;
    try {
      await Linking.openURL(signHandoffLink);
    } catch {
      /* the wallet prompts manually */
    }
  }, [signHandoffLink]);

  /** Re-fires the deep link on the connecting view ("open again"). */
  const retryOpenWallet = useCallback(async () => {
    const id = pairedMobileWalletId.current;
    if (!id || !wcUri) return;
    const ok = await openWalletDeepLink(id, wcUri);
    setOpenFailed(!ok);
  }, [wcUri, openWalletDeepLink]);

  /** Copies the raw pairing URI — for wallets with a manual "paste code" field. */
  const sharePairingUri = useCallback(async () => {
    if (wcUri) await copyText(wcUri);
  }, [wcUri]);

  const disconnect = useCallback(async () => {
    setCompletionArmed(false); // user-initiated — no auto-close afterwards
    await client.disconnect();
    pairedMobileWalletId.current = null;
    setFundsRequested(false);
    setView('list');
    void refreshWallets();
  }, [client, refreshWallets]);

  // --- themed browser handoffs (http(s) only) --------------------------------
  /**
   * Opens a web URL in the themed in-app browser when the modal was given
   * one (Chrome Custom Tab / SFSafariViewController, themed from the active
   * theme, modal pageSheet on iOS) — otherwise the external browser via
   * `Linking`, exactly like before. Custom-scheme wallet deep links never
   * route through here: Custom Tabs only handle web URLs.
   */
  const openHttpUrl = useCallback(
    (url: string) => {
      if (browser) {
        void browser.open(url).catch(() => undefined);
        return;
      }
      void Linking.openURL(url).catch(() => undefined);
    },
    [browser]
  );

  // --- account view actions (web connected-view handlers) ---------------------

  /** Address tap → one-tap clipboard copy (share-sheet fallback) + check feedback. */
  const copyAddress = useCallback(
    async (address: string) => {
      setCompletionArmed(false); // the user is working the panel — don't close under them
      setCopiedAddress(true);
      setTimeout(() => setCopiedAddress(false), 1500);
      await copyText(address);
    },
    []
  );

  /** "Get Testnet funds" → friendbot, 3s banner, delayed balance refresh. */
  const getTestnetFunds = useCallback(async () => {
    const address = client.session?.address;
    if (!address) return;
    setCompletionArmed(false); // the user is working the panel (the banner lives here)
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
    setCompletionArmed(false); // user navigation — they keep the sheet
    setView('list');
  }, []);

  /** Tx row / explorer link — opens the external explorer (themed tab when available). */
  const openExplorer = useCallback(
    (path: string) => {
      setCompletionArmed(false); // the user is working the panel
      const network = client.session?.network ?? 'TESTNET';
      openHttpUrl(explorerUrl(path, network));
    },
    [client, openHttpUrl]
  );
  const openTxExplorer = useCallback((tx: TxHistoryItem) => openExplorer(`tx/${tx.hash}`), [openExplorer]);

  /** Sheet dismissal — web close() parity (veto during signing; a pending
   * preview resolves as rejected; SIWS that never succeeded disconnects;
   * an in-flight connect is aborted so no ghost pairing outlives the sheet). */
  const handleClose = useCallback(() => {
    // Web close(): "Don't close during signing — the user should see the
    // result (success or error) before the modal closes. If they want to
    // cancel, they can click Cancel on the preview or reject in their
    // wallet." An error variant is exempt — the user is reading it and has
    // Cancel/Try-again actions right there.
    if (viewRef.current === 'signing' && !connectingErrorRef.current) return;
    // Closing the sheet while a connect is still in flight = cancelling it
    // — same treatment as the connecting view's back arrow (see
    // cancelConnecting): abort the connector attempt, disconnect the
    // pairing, suppress the follow-up code -4 rejection.
    if (viewRef.current === 'connecting') {
      const walletId = connectingWalletRef.current?.key;
      try {
        if (walletId) client.registry.get(walletId)?.abort?.();
      } catch {
        // Best-effort — see cancelConnecting.
      }
      connectJustCancelled.current = true;
    }
    // A user-initiated dismissal cancels any pending auto-close; the
    // sheet-transition reset above is the backstop for programmatic closes.
    setCompletionArmed(false);
    // Web close(): a preview still awaiting the decision resolves as
    // rejected, so the sign queue never hangs on a settled promise. The
    // follow-up "user rejected" error is suppressed via the same ref a
    // manual preview Cancel uses.
    const pending = pendingPreviewRef.current;
    if (pending) {
      setPendingPreview(null);
      previewJustRejected.current = true;
      pending.resolve(false);
    }
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
      onPress={() => openHttpUrl('https://github.com/sagantaHQ/stellar-appkit')}
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
            if (url) openHttpUrl(url);
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
            if (url) openHttpUrl(url);
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
          // Mobile handoff: the paired wallet waits in the background while
          // the WC sign request is in flight — one tap re-opens it right at
          // the pending prompt (browser-extension wallets don't need this;
          // their prompt pops up over the page by itself). Resolved for
          // BOTH the connect-time pick and the restored session's peer
          // wallet, and the auto-open (autoOpenWalletOnSign) usually beats
          // the user to it — the button is the fallback.
          onOpenWallet={signHandoffWalletId ? () => void reopenPairedWallet(signHandoffWalletId) : signHandoffLink ? reopenSignHandoffWallet : undefined}
          onRetry={() => {
            // Web retry-signing: re-show the approved preview so the user
            // can approve again; without one, fall back to the account view.
            setCompletionArmed(false); // the user is working the error — no auto-close
            setConnectingError(null);
            const last = lastApprovedPreview.current;
            if (last) {
              // Approving the re-shown preview re-drives the WALLET-SIDE
              // half of the failed request via client.retryLastSign() — the
              // sign queue re-runs and every queue/error event fires again,
              // so this component flows back through the signing view
              // exactly as it did the first time. (The previous no-op
              // resolve left the sheet on a dead spinner — the wallet was
              // never actually re-asked.)
              setPendingPreview({
                preview: last,
                resolve: (approved) => {
                  if (approved && !client.retryLastSign()) {
                    // Nothing left to retry (superseded/torn down) — land on
                    // the account view instead of a dead signing spinner.
                    setView(client.session ? 'account' : 'list');
                  }
                },
              });
              setView('preview');
            } else {
              setView(client.session ? 'account' : 'list');
            }
          }}
          onCancel={() => {
            setCompletionArmed(false); // ditto — landing on 'account' after a
            // failed sign must not kick the user off the sheet
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
            setCompletionArmed(false); // explicit SIWS cancel — user keeps the sheet
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
  // Web close() parity: while a sign request is in flight the sheet can't
  // be swiped or backdrop-dismissed — the user should see the result before
  // the modal closes (the signing view's error variant re-enables dismissal
  // with its own Cancel / Try-again actions). The header close button is
  // vetoed in handleClose the same way.
  const lockSheetWhileSigning = view === 'signing' && connectingError === null;
  return (
    <BottomSheet
      ref={sheetRef}
      index={0}
      snapPoints={['82%']}
      enablePanDownToClose={!lockSheetWhileSigning}
      onClose={handleClose}
      backdropComponent={(props) => (
        <BottomSheetBackdrop
          {...props}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
          pressBehavior={lockSheetWhileSigning ? 'none' : 'close'}
          opacity={0.6}
        />
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
