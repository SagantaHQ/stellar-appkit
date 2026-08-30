/**
 * Shared stylesheet for the React Native modal — a port of ui-web's modal CSS
 * (styles.ts in packages/ui-web), view for view:
 *
 * - wallet rows are flat, individually rounded rectangles (`.wallet-row`),
 *   NOT cards with hairline separators — press highlights the row itself
 * - the 40dp wallet tile is a border-less squircle with a soft drop shadow
 *   (`.wallet-tile`) — the logo fills it edge-to-edge
 * - "Installed" is an outline badge with a 6dp accent dot (`.wallet-sub--installed`)
 * - not-installed wallets keep full opacity and carry an accent "Install"
 *   button on the right (`.wallet-install-btn`)
 * - unavailable wallets dim to 0.55 (`.wallet-row[data-unavailable]`)
 * - the header is the web `.header` (16/18/8 padding, 15/600 title, 28×28
 *   icon buttons) with the `.header--connecting` back-arrow variant
 * - connecting/signing/SIWS views use the web `.connecting-view` metrics
 *   (88×88 logo wrap, 56×56 squircle logo, 17/600 title, 14/1.5 muted
 *   subtitle capped at 280 wide, 999-radius retry pill)
 * - the panel footer is the web `.footer` ("Powered by Stellar AppKit")
 * - inline mode renders the web `.inline-root .panel`: radiusLg corners,
 *   1px colorBorder outline, no overlay/handle/close button
 *
 * Every view imports `buildStyles(theme)` output through the orchestrator's
 * `useMemo`, so a custom theme restyles the whole sheet consistently.
 *
 * This module intentionally imports ONLY `Platform`/`StyleSheet` from
 * react-native — it stays importable in bun tests via a light react-native
 * mock (see tests/ui-styles.test.ts), which pins the web-parity values.
 */

import { Platform, StyleSheet } from 'react-native';
import type { ConnectThemeRN } from './theme.js';

export function buildStyles(theme: ConnectThemeRN) {
  return StyleSheet.create({
    content: { paddingHorizontal: 10, paddingTop: 4, paddingBottom: 24, gap: 14 },
    sections: { gap: 6 },

    // ---- Panel header (web .header) -----------------------------------------
    // Web: display:flex; align-items:center; gap:10px; padding:16px 18px 8px.
    // No border-bottom — the sheet handle + spacing separate it from the body.
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 18,
      paddingTop: 16,
      paddingBottom: 8,
      minHeight: 44,
    },
    // Web .header .brand: logo 22×22 radius 6 + title, flex 1, gap 8.
    headerBrand: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
    headerLogo: { width: 22, height: 22, borderRadius: 6 },
    // Web .header .title: 15px / 600 / -0.01em, ellipsized.
    headerTitle: {
      color: theme.colorText,
      fontSize: 15,
      fontWeight: '600',
      letterSpacing: -0.15,
      flex: 1,
      textAlign: 'center',
    },
    headerTitleLeft: { textAlign: 'left', flex: 1 },
    // Web .icon-btn: 28×28, radius radiusSm, muted glyph, hover surfaceHover.
    headerButton: {
      width: 28,
      height: 28,
      borderRadius: theme.radiusSm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerButtonPressed: { backgroundColor: theme.colorSurfaceHover, opacity: 0.9 },

    // Web .header--connecting: back arrow + centered wallet name + close.
    headerConnecting: { justifyContent: 'space-between' },

    centered: { alignItems: 'center', gap: 10, paddingVertical: 28 },
    title: { color: theme.colorText, fontSize: 18, fontWeight: '700', textAlign: 'center' },
    muted: { color: theme.colorTextMuted, fontSize: 13 },

    // ---- Wallet list — flat rows like the web modal ------------------------
    // Web: .wallet-list-loading + centered muted text. RN uses the native
    // ActivityIndicator (same ring-spinner language) with the same copy.
    listLoading: { alignItems: 'center', gap: 12, paddingVertical: 32 },
    listLoadingText: { color: theme.colorTextMuted, fontSize: 13 },

    // Web .wallet-row: padding 10px 8px, border-radius radiusMd, gap 12px,
    // hover/press → colorSurfaceHover. Each row is its own rounded surface —
    // no card container, no separators between rows.
    walletRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 10,
      paddingHorizontal: 8,
      borderRadius: theme.radiusMd,
    },
    // Web .wallet-row[data-unavailable="true"] { opacity: 0.55 }
    walletRowDimmed: { opacity: 0.55 },

    // Web .wallet-tile: 40×40 squircle (radius 16 ≈ 40%), background colorBg,
    // NO border — the soft drop shadow provides the edge definition
    // (0 2px 8px rgba(0,0,0,.12), 0 1px 3px rgba(0,0,0,.08)). The two CSS
    // shadows collapse into one RN shadow; elevation covers Android.
    walletTile: {
      width: 40,
      height: 40,
      borderRadius: 16,
      backgroundColor: theme.colorBg,
      overflow: 'hidden',
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.12,
      shadowRadius: 8,
      elevation: 2,
    },

    // Web .wallet-name: 14px / 500 / flex 1 / left-aligned.
    walletName: { color: theme.colorText, fontSize: 14, fontWeight: '500', flex: 1 },

    // Web .wallet-sub--installed: outline pill, mono 10.5px / 600, uppercase,
    // 1px border, accent dot on the left, transparent background.
    statusBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 3,
      borderRadius: theme.radiusSm,
      borderWidth: 1,
      borderColor: theme.colorBorder,
    },
    statusBadgeText: {
      color: theme.colorTextMuted,
      fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: undefined }),
      fontSize: 10.5,
      fontWeight: '600',
      letterSpacing: 0.3,
      textTransform: 'uppercase',
    },
    // Web ::before — 6px accent dot.
    statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.colorAccent },

    // Web .wallet-sub: plain muted 12px status on the right.
    statusMuted: { color: theme.colorTextMuted, fontSize: 12 },

    // Web .wallet-install-btn: accent pill, 12px / 600, radius radiusSm.
    installButton: {
      backgroundColor: theme.colorAccent,
      borderRadius: theme.radiusSm,
      paddingHorizontal: 12,
      paddingVertical: 5,
    },
    installButtonPressed: { opacity: 0.9 },
    installText: { color: theme.colorBg, fontSize: 12, fontWeight: '600' },

    // RN-only: the 21-wallet registry needs sections; the web modal's flat
    // list would be unscannable on a phone. Titles are quiet — uppercase,
    // muted, aligned with the row content (8px inset like the rows).
    sectionTitle: {
      color: theme.colorTextMuted,
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      paddingTop: 8,
      paddingHorizontal: 8,
    },
    moreHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 10,
      paddingHorizontal: 8,
      borderRadius: theme.radiusMd,
    },
    moreChevron: { color: theme.colorTextMuted, fontSize: 20, fontWeight: '600', transform: [{ rotate: '90deg' }] },
    moreChevronOpen: { transform: [{ rotate: '-90deg' }] },

    // ---- Connecting / signing / SIWS views (web .connecting-view) ----------
    // Web: flex column, center, padding 32px 24px 28px. Children stagger in
    // via useEntranceStagger (0.5s fade + 8px slide, 80ms apart).
    connectingView: { alignItems: 'center', paddingHorizontal: 24, paddingTop: 32, paddingBottom: 28 },
    // Web .connecting-view__logo-wrap: 88×88, margin-bottom 28.
    logoWrap: { width: 88, height: 88, marginBottom: 28, alignItems: 'center', justifyContent: 'center' },
    // Web .connecting-view__logo: 56×56 squircle (radius 22), soft drop shadow
    // (same as wallet-tile), breathing scale loop.
    connectingLogo: {
      width: 56,
      height: 56,
      borderRadius: 22,
      backgroundColor: theme.colorBg,
      overflow: 'hidden',
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.12,
      shadowRadius: 8,
      elevation: 2,
    },
    // Web .connecting-view--error .connecting-view__logo-wrap { margin-bottom: 24 }
    logoWrapError: { marginBottom: 24 },
    // Web .connecting-view__title: 17px / 600 / -0.015em / line-height 1.3.
    connectingTitle: {
      color: theme.colorText,
      fontSize: 17,
      fontWeight: '600',
      letterSpacing: -0.26,
      lineHeight: 22,
      textAlign: 'center',
      marginBottom: 8,
    },
    // Web .connecting-view__subtitle: 14px / 1.5, muted, max-width 280,
    // margin-bottom 32. Error variant: colorDanger, margin-bottom 24.
    connectingSubtitle: {
      color: theme.colorTextMuted,
      fontSize: 14,
      lineHeight: 21,
      textAlign: 'center',
      maxWidth: 280,
      marginBottom: 32,
    },
    connectingSubtitleError: { color: theme.colorDanger, marginBottom: 24 },

    // Web .connecting-view__retry: pill with 1px border, radius 999, padding
    // 8px 18px, 14px / 500 text, 6px gap, retry glyph at 14px. Press →
    // scale(0.97) + surfaceHover.
    retryPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 18,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.colorBorder,
    },
    retryPillPressed: { backgroundColor: theme.colorSurfaceHover, transform: [{ scale: 0.97 }] },
    retryPillText: { color: theme.colorText, fontSize: 14, fontWeight: '500' },

    // Web .connecting-view__cancel (SIWS cancel): same pill, 13px muted text.
    ghostPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 18,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.colorBorder,
    },
    ghostPillPressed: { backgroundColor: theme.colorSurfaceHover, transform: [{ scale: 0.97 }] },
    ghostPillText: { color: theme.colorTextMuted, fontSize: 13, fontWeight: '500' },

    // Web .signing-view--error: circle-X glyph 40px danger, margin-bottom 16.
    signingErrorIcon: { marginBottom: 16 },
    // Web .signing-view__actions: row, gap 8, centered.
    signingActions: { flexDirection: 'row', gap: 8, justifyContent: 'center' },

    // ---- Deep-link extras (RN-only affordances) ----------------------------
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
    primaryButtonPressed: { opacity: 0.8 },
    primaryButtonText: { color: theme.colorAccentText, fontSize: 15, fontWeight: '700' },
    secondaryButton: {
      borderColor: theme.colorBorder,
      borderWidth: 1,
      borderRadius: theme.radiusMd,
      paddingVertical: 13,
      alignItems: 'center',
      marginTop: 4,
    },
    secondaryButtonPressed: { opacity: 0.6 },
    secondaryButtonText: { color: theme.colorText, fontSize: 14, fontWeight: '600' },
    dangerButton: {
      borderColor: theme.colorDanger,
      borderWidth: 1,
      borderRadius: theme.radiusMd,
      paddingVertical: 13,
      alignItems: 'center',
      marginTop: 4,
    },
    dangerButtonPressed: { opacity: 0.6 },
    dangerButtonText: { color: theme.colorDanger, fontSize: 14, fontWeight: '600' },
    textButton: { paddingVertical: 8, marginTop: 2 },
    textButtonText: { color: theme.colorAccent, fontSize: 14, fontWeight: '600' },

    // ---- Account view (web .account — 1:1 port of renderConnected) --------
    // Web .account-header: flex row, gap 12, padding 2px 0.
    accountHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 2 },
    // Web .account-avatar: 42×42, radius 12. RN has no zero-dep linear
    // gradient, so the deterministic two-hue CSS gradient is rendered as a
    // solid hsl built from the same address hash (see accountData.ts) —
    // same address → same color, the identity property users rely on.
    accountAvatar: {
      width: 42,
      height: 42,
      borderRadius: 12,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    accountInfo: { flex: 1, minWidth: 0 },
    // Web .account-address-row: flex row, gap 6, cursor pointer.
    accountAddressRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    // Web .account-address: mono 14px / 500.
    accountAddress: {
      color: theme.colorText,
      fontSize: 14,
      fontWeight: '500',
      letterSpacing: 0.2,
      fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: undefined }),
    },
    accountCopyIcon: { opacity: 0.7 },
    // Web .account-meta: flex row, gap 8, margin-top 4.
    accountMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
    // Web .network-pill: inline-flex, gap 5, 11px, capitalize, 2px 8px padding,
    // radius 9999, surfaceHover background.
    networkPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 999,
      backgroundColor: theme.colorSurfaceHover,
    },
    networkPillText: { color: theme.colorTextMuted, fontSize: 11, textTransform: 'capitalize' },
    networkDot: { width: 6, height: 6, borderRadius: 3 },
    // Web .explorer-link: opacity 0.5, 14×14 glyph.
    explorerButton: { padding: 2, opacity: 0.7 },
    // Web .overflow-menu: column, gap 2, padding 6, radius radiusMd,
    // surfaceHover background, 1px border. Hidden until toggled (RN: rendered
    // conditionally).
    overflowMenu: {
      gap: 2,
      padding: 6,
      borderRadius: theme.radiusMd,
      backgroundColor: theme.colorSurfaceHover,
      borderWidth: 1,
      borderColor: theme.colorBorder,
      marginBottom: 12,
    },
    overflowItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: theme.radiusSm,
    },
    overflowItemPressed: { backgroundColor: theme.colorBg, opacity: 0.9 },
    overflowItemText: { color: theme.colorText, fontSize: 13, fontWeight: '500' },
    overflowDangerText: { color: '#ef4444' },

    // Web .pending-banner: row, gap 10, padding 10px 14px, radius radiusMd,
    // rgba(110,231,183,.08) bg + .2 border, 13px accent text.
    pendingBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: theme.radiusMd,
      backgroundColor: 'rgba(110, 231, 183, 0.08)',
      borderWidth: 1,
      borderColor: 'rgba(110, 231, 183, 0.2)',
      marginBottom: 4,
    },
    pendingBannerText: { color: theme.colorAccent, fontSize: 13, flex: 1 },

    // Web .balance-section: padding 0 2px. Label: 11px uppercase +0.08em.
    balanceSection: { paddingHorizontal: 2 },
    balanceLabel: {
      color: theme.colorTextMuted,
      fontSize: 11,
      fontWeight: '600',
      letterSpacing: 0.9,
      textTransform: 'uppercase',
      marginBottom: 6,
    },
    // Web .balance-amount: flex baseline row, gap 6.
    balanceAmount: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
    // Web .balance-value: 32px / 700 / mono / -0.02em.
    balanceValue: {
      color: theme.colorText,
      fontSize: 32,
      fontWeight: '700',
      letterSpacing: -0.64,
      fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: undefined }),
    },
    balanceUnit: { color: theme.colorTextMuted, fontSize: 15, fontWeight: '500' },
    // Web .balance-skeleton: 140×32 radius 6 shimmer — RN pulses opacity.
    balanceSkeleton: {
      width: 140,
      height: 32,
      borderRadius: 6,
      backgroundColor: theme.colorSurfaceHover,
    },
    // Web .friendbot-btn: 12px / 500 accent text, 5px 10px padding, radius
    // radiusSm, 10% accent bg + 25% accent border.
    friendbotButton: {
      alignSelf: 'flex-start',
      paddingHorizontal: 10,
      paddingVertical: 5,
      marginTop: 8,
      borderRadius: theme.radiusSm,
      borderWidth: 1,
      borderColor: theme.colorAccent,
      backgroundColor: 'rgba(110, 231, 183, 0.1)',
    },
    friendbotButtonPressed: { opacity: 0.8 },
    friendbotButtonText: { color: theme.colorAccent, fontSize: 12, fontWeight: '500' },
    // Web .funds-banner: margin-top 8, padding 6px 10px, 12px accent text,
    // 8% accent bg, radius radiusSm, 2px accent left border.
    fundsBanner: {
      marginTop: 8,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: theme.radiusSm,
      borderLeftWidth: 2,
      borderLeftColor: theme.colorAccent,
      backgroundColor: 'rgba(110, 231, 183, 0.08)',
    },
    fundsBannerText: { color: theme.colorAccent, fontSize: 12, lineHeight: 16.8 },

    // Web .tx-history: column. Header: 11px uppercase muted, 4px 0 8px padding.
    txHistory: { gap: 0 },
    txHeader: {
      color: theme.colorTextMuted,
      fontSize: 11,
      fontWeight: '600',
      letterSpacing: 0.9,
      textTransform: 'uppercase',
      paddingTop: 4,
      paddingBottom: 8,
    },
    // Web .tx-row: flex row, gap 10, padding 10px 8px, bottom hairline border.
    txRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 10,
      paddingHorizontal: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colorBorder,
    },
    // Web .tx-icon: 24×24 circle, 11px / 700 glyph.
    txIcon: {
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    txIconSuccess: { backgroundColor: 'rgba(110, 231, 183, 0.15)' },
    txIconFailed: { backgroundColor: 'rgba(239, 68, 68, 0.15)' },
    txIconTextSuccess: { color: theme.colorAccent, fontSize: 11, fontWeight: '700' },
    txIconTextFailed: { color: '#ef4444', fontSize: 11, fontWeight: '700' },
    txInfo: { flex: 1, minWidth: 0 },
    txType: { color: theme.colorText, fontSize: 13, fontWeight: '500', textTransform: 'capitalize' },
    txDate: { color: theme.colorTextMuted, fontSize: 11, marginTop: 2 },
    txAmount: {
      fontSize: 13,
      fontWeight: '500',
      fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: undefined }),
    },
    txAmountIn: { color: theme.colorAccent },
    txAmountOut: { color: theme.colorText },
    txEmpty: { color: theme.colorTextMuted, fontSize: 13, textAlign: 'center', paddingVertical: 24 },

    // ---- Transaction preview (web .preview — renderTransactionPreview) ----
    preview: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 20, alignItems: 'center' },
    // Web .preview-thumbs: row centered, padding 20px 0 16px.
    previewThumbs: { flexDirection: 'row', alignItems: 'center', paddingTop: 20, paddingBottom: 16 },
    // Web .preview-thumb: 56×56 radius 14, surface bg, 1px border.
    previewThumb: {
      width: 56,
      height: 56,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      flexShrink: 0,
      backgroundColor: theme.colorSurface,
      borderWidth: 1,
      borderColor: theme.colorBorder,
    },
    previewThumbImg: { width: 36, height: 36, borderRadius: 8, overflow: 'hidden' },
    previewThumbLetter: { color: theme.colorAccent, fontSize: 20, fontWeight: '700' },
    // Web .preview-thumb__connector: 24×2 border-colored line between thumbs.
    previewThumbConnector: { width: 24, height: 2, backgroundColor: theme.colorBorder, flexShrink: 0 },
    // Web .preview-title: 17px / 600 / -0.015em / lh 1.3.
    previewTitle: {
      color: theme.colorText,
      fontSize: 17,
      fontWeight: '600',
      letterSpacing: -0.26,
      lineHeight: 22,
      textAlign: 'center',
      marginBottom: 6,
    },
    // Web .preview-subtitle: 13.5px / 1.5 muted, max-width 300, mb 16.
    previewSubtitle: {
      color: theme.colorTextMuted,
      fontSize: 13.5,
      lineHeight: 20.3,
      textAlign: 'center',
      maxWidth: 300,
      marginBottom: 16,
    },
    // Web .preview-ops: column, gap 6, left-aligned, mb 8.
    previewOps: { gap: 6, alignSelf: 'stretch', marginBottom: 8 },
    // Web .preview-op: 10px 12px padding, radius radiusMd, colorBg bg + border.
    previewOp: {
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: theme.radiusMd,
      backgroundColor: theme.colorBg,
      borderWidth: 1,
      borderColor: theme.colorBorder,
    },
    previewOpSummary: { color: theme.colorText, fontSize: 13, lineHeight: 19.5 },
    // Web .risk-flag: margin-top 8, padding 8px 10px, radius radiusSm,
    // 12px / 1.5, 1px border — info/warning/danger variants.
    riskFlag: {
      marginTop: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: theme.radiusSm,
      borderWidth: 1,
    },
    riskInfo: {
      color: theme.colorTextMuted,
      backgroundColor: theme.colorSurfaceHover,
      borderColor: theme.colorBorder,
    },
    riskWarning: {
      color: '#B8860B',
      backgroundColor: 'rgba(184, 134, 11, 0.1)',
      borderColor: 'rgba(184, 134, 11, 0.3)',
    },
    riskDanger: {
      color: theme.colorDanger,
      backgroundColor: 'rgba(240, 153, 123, 0.12)',
      borderColor: 'rgba(240, 153, 123, 0.35)',
    },
    riskFlagText: { fontSize: 12, lineHeight: 18 },
    // Web .preview-meta: row space-between, mono 11.5px muted, padding
    // 8px 2px 0, top hairline border, margin-top 8, gap 8.
    previewMeta: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 2,
      paddingTop: 8,
      marginTop: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colorBorder,
      alignSelf: 'stretch',
    },
    previewMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    previewMetaText: {
      color: theme.colorTextMuted,
      fontSize: 11.5,
      fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: undefined }),
    },
    previewFee: { color: theme.colorText, fontWeight: '500' },
    // Web .preview-actions: row, gap 8, margin-top 16 — Cancel + Sign/Approve
    // both flex:1.
    previewActions: { flexDirection: 'row', gap: 8, marginTop: 16, alignSelf: 'stretch' },
    previewBtnCancel: {
      flex: 1,
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: theme.radiusSm,
      borderWidth: 1,
      borderColor: theme.colorBorder,
      alignItems: 'center',
    },
    previewBtnCancelPressed: { backgroundColor: theme.colorSurfaceHover, transform: [{ scale: 0.97 }] },
    previewBtnCancelText: { color: theme.colorText, fontSize: 14, fontWeight: '600' },
    previewBtnApprove: {
      flex: 1,
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: theme.radiusSm,
      backgroundColor: theme.colorAccent,
      alignItems: 'center',
    },
    previewBtnApprovePressed: { opacity: 0.9, transform: [{ scale: 0.97 }] },
    previewBtnApproveText: { color: theme.colorAccentText, fontSize: 14, fontWeight: '600' },

    // ---- Error / network-mismatch states (web .error-state) ----------------
    // Web: flex column, center, gap 10, padding 28px 20px; svg 28×28 danger;
    // title 14/600; message 13/1.5 muted.
    errorState: { alignItems: 'center', gap: 10, paddingVertical: 28, paddingHorizontal: 20 },
    errorStateIcon: { marginBottom: 0 },
    errorStateTitle: { color: theme.colorText, fontSize: 14, fontWeight: '600', textAlign: 'center' },
    errorStateMessage: {
      color: theme.colorTextMuted,
      fontSize: 13,
      lineHeight: 19.5,
      textAlign: 'center',
    },
    errorStateStrong: { color: theme.colorText, fontWeight: '700' },
    // Web .btn: 13px / 500, padding 9px 14px, radius radiusSm, 1px border.
    btn: {
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: theme.radiusSm,
      borderWidth: 1,
      borderColor: theme.colorBorder,
      marginTop: 6,
    },
    btnPressed: { backgroundColor: theme.colorSurfaceHover, opacity: 0.9 },
    btnText: { color: theme.colorText, fontSize: 13, fontWeight: '500', textAlign: 'center' },

    // ---- Panel footer (web .footer) -----------------------------------------
    // Web: padding 10px 16px, 1px top border, 11px muted, centered.
    footer: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colorBorder,
    },
    footerText: { color: theme.colorTextMuted, fontSize: 11 },
    footerLink: { color: theme.colorAccent, fontSize: 11, fontWeight: '500' },

    // ---- Inline mode (web .inline-root .panel) ------------------------------
    // radiusLg corners + 1px colorBorder outline, no overlay/handle/close.
    inlinePanel: {
      borderRadius: theme.radiusLg,
      borderWidth: 1,
      borderColor: theme.colorBorder,
      backgroundColor: theme.colorSurface,
      overflow: 'hidden',
      alignSelf: 'stretch',
    },
    inlineBody: { maxHeight: 480 },
  });
}

export type AppKitStyles = ReturnType<typeof buildStyles>;
