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

    // ---- Sheet header (title centered — the bottom-sheet idiom) -----------
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
    headerButtonPressed: { opacity: 0.6 },
    headerButtonSpacer: { width: 36 },
    headerButtonGlyph: { color: theme.colorText, fontSize: 22, fontWeight: '600', lineHeight: 24, marginTop: -2 },

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

    // ---- Connecting / signing view ----------------------------------------
    animWrap: { width: 104, height: 104, alignItems: 'center', justifyContent: 'center', marginVertical: 8 },
    animLogoWrap: { borderRadius: 22, overflow: 'hidden' },
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

    // ---- Error view ---------------------------------------------------------
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

export type AppKitStyles = ReturnType<typeof buildStyles>;
