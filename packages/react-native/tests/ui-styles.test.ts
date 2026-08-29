/**
 * Web-parity regression guard for the RN modal's wallet-list design.
 *
 * The wallet listing is a deliberate port of the web modal's CSS
 * (packages/ui-web/src/ui-web/styles.ts). This suite pins the ported values
 * so a future edit can't silently drift from the web design:
 *
 *   .wallet-row                 → styles.walletRow
 *   .wallet-tile                → styles.walletTile
 *   .wallet-name                → styles.walletName
 *   .wallet-sub--installed      → styles.statusBadge / statusDot / statusBadgeText
 *   .wallet-install-btn         → styles.installButton / installText
 *   .wallet-row[data-unavailable] → styles.walletRowDimmed
 *   .body padding               → styles.content
 *
 * react-native can't be imported under bun (Flow syntax in its index), so the
 * suite installs a minimal mock first — styles.ts only uses StyleSheet.create,
 * StyleSheet.hairlineWidth and Platform.select, which makes it mockable.
 */

import { describe, expect, mock, test } from 'bun:test';

mock.module('react-native', () => ({
  StyleSheet: {
    create: (sheets: Record<string, unknown>) => sheets,
    hairlineWidth: 0.5,
  },
  Platform: {
    OS: 'ios',
    select: (opts: Record<string, unknown>) => opts.ios ?? opts.default ?? opts.android,
  },
}));

const { buildStyles } = await import('../src/ui/styles.js');
const { minimalDark, minimalLight, stellarDark } = await import('../src/ui/theme.js');

describe('wallet-list web parity — .wallet-row', () => {
  test('row geometry matches the web row (padding 10/8, gap 12, radius radiusMd)', () => {
    const s = buildStyles(minimalDark);
    expect(s.walletRow.paddingVertical).toBe(10); // web: padding: 10px 8px
    expect(s.walletRow.paddingHorizontal).toBe(8);
    expect(s.walletRow.gap).toBe(12); // web: gap: 12px
    expect(s.walletRow.borderRadius).toBe(minimalDark.radiusMd); // web: radiusMd
  });

  test('rows are flat — no card container styles left in the sheet', () => {
    const s = buildStyles(minimalDark);
    expect((s.walletRow as Record<string, unknown>).borderBottomWidth).toBeUndefined();
    expect((s.walletRow as Record<string, unknown>).borderTopWidth).toBeUndefined();
    // The old sectionCard container is gone entirely.
    expect((s as Record<string, unknown>).sectionCard).toBeUndefined();
    expect((s as Record<string, unknown>).walletRowBorder).toBeUndefined();
  });

  test('unavailable rows dim to 0.55 (web [data-unavailable])', () => {
    const s = buildStyles(minimalDark);
    expect(s.walletRowDimmed.opacity).toBe(0.55);
  });

  test('content padding matches the web .body (4px 10px)', () => {
    const s = buildStyles(minimalDark);
    expect(s.content.paddingHorizontal).toBe(10);
    expect(s.content.paddingTop).toBe(4);
  });
});

describe('wallet-list web parity — .wallet-tile', () => {
  test('40dp squircle (radius 16), no border, colorBg backdrop', () => {
    const s = buildStyles(minimalDark);
    expect(s.walletTile.width).toBe(40);
    expect(s.walletTile.height).toBe(40);
    expect(s.walletTile.borderRadius).toBe(16); // web: 16px on 40px ≈ squircle
    expect(s.walletTile.backgroundColor).toBe(minimalDark.colorBg);
    expect((s.walletTile as Record<string, unknown>).borderWidth).toBeUndefined(); // shadow, not border
  });

  test('carries the soft drop shadow (iOS shadow + Android elevation)', () => {
    const s = buildStyles(minimalDark);
    expect(s.walletTile.shadowColor).toBe('#000000');
    expect(s.walletTile.shadowOffset).toEqual({ width: 0, height: 2 });
    expect(s.walletTile.shadowOpacity).toBeLessThanOrEqual(0.12); // subtle, web 0.12
    expect(s.walletTile.shadowRadius).toBe(8);
    expect(s.walletTile.elevation).toBeGreaterThan(0); // Android legibility
  });
});

describe('wallet-list web parity — statuses', () => {
  test('wallet name is 14/500 flex-1 like .wallet-name', () => {
    const s = buildStyles(minimalDark);
    expect(s.walletName.fontSize).toBe(14);
    expect(s.walletName.fontWeight).toBe('500');
    expect(s.walletName.flex).toBe(1);
  });

  test('installed badge is an outline pill with a 6dp accent dot', () => {
    const s = buildStyles(stellarDark);
    expect(s.statusBadge.borderRadius).toBe(stellarDark.radiusSm); // web: radiusSm
    expect(s.statusBadge.borderWidth).toBe(1);
    expect(s.statusBadge.borderColor).toBe(stellarDark.colorBorder); // outline variant
    expect(s.statusBadge.backgroundColor).toBeUndefined(); // transparent
    expect(s.statusDot.width).toBe(6);
    expect(s.statusDot.height).toBe(6);
    expect(s.statusDot.borderRadius).toBe(3);
    expect(s.statusDot.backgroundColor).toBe(stellarDark.colorAccent);
    // Text: mono 10.5/600 uppercase like the web badge.
    expect(s.statusBadgeText.fontSize).toBe(10.5);
    expect(s.statusBadgeText.fontWeight).toBe('600');
    expect(s.statusBadgeText.textTransform).toBe('uppercase');
    expect(s.statusBadgeText.color).toBe(stellarDark.colorTextMuted);
  });

  test('muted status text is 12px like .wallet-sub', () => {
    const s = buildStyles(minimalDark);
    expect(s.statusMuted.fontSize).toBe(12);
    expect(s.statusMuted.color).toBe(minimalDark.colorTextMuted);
  });

  test('install pill matches .wallet-install-btn (accent bg, 12/600, radiusSm)', () => {
    const s = buildStyles(minimalLight);
    expect(s.installButton.backgroundColor).toBe(minimalLight.colorAccent);
    expect(s.installButton.borderRadius).toBe(minimalLight.radiusSm);
    expect(s.installButton.paddingHorizontal).toBe(12); // web: 5px 12px
    expect(s.installButton.paddingVertical).toBe(5);
    expect(s.installText.fontSize).toBe(12);
    expect(s.installText.fontWeight).toBe('600');
    // Web colors the label with colorBg against the accent background.
    expect(s.installText.color).toBe(minimalLight.colorBg);
  });
});

describe('modal split structure — shared styles keep serving every view', () => {
  test('connecting/account/error styles survive the file split', () => {
    const s = buildStyles(minimalDark);
    for (const key of [
      'animWrap',
      'animLogoWrap',
      'animArc',
      'openFailedCard',
      'primaryButton',
      'secondaryButton',
      'dangerButton',
      'accountCard',
      'errorBadge',
      'header',
    ]) {
      expect(s[key as keyof typeof s]).toBeDefined();
    }
  });

  test('every style set follows its theme', () => {
    const dark = buildStyles(minimalDark);
    const light = buildStyles(minimalLight);
    expect(dark.walletTile.backgroundColor).toBe(minimalDark.colorBg);
    expect(light.walletTile.backgroundColor).toBe(minimalLight.colorBg);
    expect(dark.statusDot.backgroundColor).toBe(minimalDark.colorAccent);
    expect(light.statusDot.backgroundColor).toBe(minimalLight.colorAccent);
  });
});
