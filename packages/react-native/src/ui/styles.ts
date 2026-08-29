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

    // ---- Account view -------------------------------------------------------
    accountCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      backgroundColor: theme.colorSurface,
      borderRadius: theme.radiusMd,
      padding: 16,
    },
    walletMeta: { flex: 1, gap: 2 },
    addressText: { color: theme.colorTextMuted, fontSize: 13, letterSpacing: 0.3 },
    danger: { color: theme.colorDanger, fontSize: 12, marginTop: 2 },

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
