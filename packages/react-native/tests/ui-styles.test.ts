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
 * suite installs the shared mock registry (tests/helpers/rn-mock.ts), which
 * carries the union of every react-native export any module under test
 * links against.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { installReactNativeMock, resetRnState } from './helpers/rn-mock.js';

installReactNativeMock();

// iOS defaults (this suite's platform); resetRnState also clears whatever
// an earlier test file left in the shared registry.
beforeEach(() => resetRnState());

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
      'connectingView',
      'logoWrap',
      'connectingLogo',
      'connectingTitle',
      'connectingSubtitle',
      'retryPill',
      'ghostPill',
      'openFailedCard',
      'primaryButton',
      'secondaryButton',
      'dangerButton',
      'errorState',
      'btn',
      'header',
      'headerConnecting',
      'footer',
      'inlinePanel',
    ]) {
      expect(s[key as keyof typeof s]).toBeDefined();
    }
  });

  test('connected view carries the full web renderConnected style set', () => {
    const s = buildStyles(minimalDark);
    // Web .account-header/.network-pill/.balance-section/.tx-history ports.
    for (const key of [
      'accountHeader',
      'accountAvatar',
      'accountAddress',
      'networkPill',
      'networkDot',
      'overflowMenu',
      'overflowItem',
      'pendingBanner',
      'balanceSection',
      'balanceLabel',
      'balanceValue',
      'balanceUnit',
      'balanceSkeleton',
      'friendbotButton',
      'fundsBanner',
      'txHistory',
      'txHeader',
      'txRow',
      'txIcon',
      'txAmount',
      'txEmpty',
    ]) {
      expect(s[key as keyof typeof s]).toBeDefined();
    }
    // Web metrics: 42×42 avatar, 32/700 mono balance, 999-radius pill.
    expect(s.accountAvatar.width).toBe(42);
    expect(s.accountAvatar.height).toBe(42);
    expect(s.balanceValue.fontSize).toBe(32);
    expect(s.balanceValue.fontWeight).toBe('700');
    expect(s.networkPill.borderRadius).toBe(999);
  });

  test('transaction preview carries the web renderTransactionPreview style set', () => {
    const s = buildStyles(minimalDark);
    // Web .preview-thumbs/.preview-op/.risk-flag/.preview-actions ports.
    for (const key of [
      'preview',
      'previewThumbs',
      'previewThumb',
      'previewThumbConnector',
      'previewTitle',
      'previewSubtitle',
      'previewOps',
      'previewOp',
      'previewOpSummary',
      'riskFlag',
      'riskInfo',
      'riskWarning',
      'riskDanger',
      'previewMeta',
      'previewFee',
      'previewActions',
      'previewBtnCancel',
      'previewBtnApprove',
    ]) {
      expect(s[key as keyof typeof s]).toBeDefined();
    }
    // Web metrics: 56×56 thumbs radius 14, 24×2 connector, 17/600 title.
    expect(s.previewThumb.width).toBe(56);
    expect(s.previewThumb.height).toBe(56);
    expect(s.previewThumb.borderRadius).toBe(14);
    expect(s.previewThumbConnector.width).toBe(24);
    expect(s.previewThumbConnector.height).toBe(2);
    expect(s.previewTitle.fontSize).toBe(17);
    expect(s.previewTitle.fontWeight).toBe('600');
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

describe('web parity — .header (renderPanelHeader)', () => {
  test('header padding 16/18/8, title 15/600, 28×28 icon buttons', () => {
    const s = buildStyles(minimalDark);
    expect(s.header.paddingTop).toBe(16); // web: padding: 16px 18px 8px
    expect(s.header.paddingHorizontal).toBe(18);
    expect(s.header.paddingBottom).toBe(8);
    expect(s.header.gap).toBe(10); // web: gap: 10px
    expect(s.headerTitle.fontSize).toBe(15); // web: font-size: 15px
    expect(s.headerTitle.fontWeight).toBe('600'); // web: font-weight: 600
    expect(s.headerButton.width).toBe(28); // web .icon-btn: 28×28
    expect(s.headerButton.height).toBe(28);
    expect(s.headerButton.borderRadius).toBe(minimalDark.radiusSm); // web: radiusSm
    // No border under the header — the web header has none.
    expect((s.header as Record<string, unknown>).borderBottomWidth).toBeUndefined();
  });

  test('connected header brand: 22×22 logo, radius 6 (web .brand img)', () => {
    const s = buildStyles(minimalDark);
    expect(s.headerLogo.width).toBe(22);
    expect(s.headerLogo.height).toBe(22);
    expect(s.headerLogo.borderRadius).toBe(6);
    expect(s.headerBrand.gap).toBe(8); // web: gap: 8px
  });
});

describe('web parity — .connecting-view (connecting / signing / SIWS)', () => {
  test('view padding 32/24/28 like the web', () => {
    const s = buildStyles(minimalDark);
    expect(s.connectingView.paddingTop).toBe(32); // web: 32px 24px 28px
    expect(s.connectingView.paddingHorizontal).toBe(24);
    expect(s.connectingView.paddingBottom).toBe(28);
  });

  test('logo wrap 88×88 with 28 bottom margin; logo 56×56 radius 22', () => {
    const s = buildStyles(minimalDark);
    expect(s.logoWrap.width).toBe(88); // web .connecting-view__logo-wrap
    expect(s.logoWrap.height).toBe(88);
    expect(s.logoWrap.marginBottom).toBe(28);
    expect(s.connectingLogo.width).toBe(56); // web .connecting-view__logo
    expect(s.connectingLogo.height).toBe(56);
    expect(s.connectingLogo.borderRadius).toBe(22); // web: 22px squircle
    expect(s.logoWrapError.marginBottom).toBe(24); // web --error: 24px
  });

  test('title 17/600, subtitle 14 muted capped at 280 (web metrics)', () => {
    const s = buildStyles(minimalDark);
    expect(s.connectingTitle.fontSize).toBe(17); // web: 17px / 600 / -0.015em
    expect(s.connectingTitle.fontWeight).toBe('600');
    expect(s.connectingTitle.letterSpacing).toBeCloseTo(-0.26, 5); // -0.015em at 17px
    expect(s.connectingSubtitle.fontSize).toBe(14); // web: 14px / 1.5
    expect(s.connectingSubtitle.lineHeight).toBe(21);
    expect(s.connectingSubtitle.maxWidth).toBe(280); // web: max-width: 280px
    expect(s.connectingSubtitle.marginBottom).toBe(32); // web: margin 0 0 32px
    expect(s.connectingSubtitleError.color).toBe(minimalDark.colorDanger); // --error: colorDanger
    expect(s.connectingSubtitleError.marginBottom).toBe(24); // --error: 24px
  });

  test('retry pill: 999 radius, 8/18 padding, 14/500 text (web __retry)', () => {
    const s = buildStyles(minimalDark);
    expect(s.retryPill.borderRadius).toBe(999); // web: 999px pill
    expect(s.retryPill.paddingHorizontal).toBe(18); // web: 8px 18px
    expect(s.retryPill.paddingVertical).toBe(8);
    expect(s.retryPill.gap).toBe(6); // web: gap: 6px
    expect(s.retryPill.borderWidth).toBe(1); // web: 1px colorBorder
    expect(s.retryPill.borderColor).toBe(minimalDark.colorBorder);
    expect(s.retryPillText.fontSize).toBe(14); // web: 14px / 500
    expect(s.retryPillText.fontWeight).toBe('500');
    expect(s.retryPillPressed.transform).toEqual([{ scale: 0.97 }]); // web :active
  });

  test('SIWS cancel ghost pill: 13/500 muted (web __cancel)', () => {
    const s = buildStyles(minimalDark);
    expect(s.ghostPillText.fontSize).toBe(13);
    expect(s.ghostPillText.fontWeight).toBe('500');
    expect(s.ghostPillText.color).toBe(minimalDark.colorTextMuted);
    expect(s.signingActions.gap).toBe(8); // web .signing-view__actions
    expect(s.signingActions.flexDirection).toBe('row');
  });
});

describe('web parity — .error-state / .btn / .footer / inline', () => {
  test('error state: 28×28 danger glyph, 14/600 title, 13/1.5 message', () => {
    const s = buildStyles(minimalDark);
    expect(s.errorState.gap).toBe(10); // web: gap: 10px
    expect(s.errorState.paddingVertical).toBe(28); // web: 28px 20px
    expect(s.errorState.paddingHorizontal).toBe(20);
    expect(s.errorStateTitle.fontSize).toBe(14); // web: 14px / 600
    expect(s.errorStateTitle.fontWeight).toBe('600');
    expect(s.errorStateMessage.fontSize).toBe(13); // web: 13px / 1.5
    expect(s.errorStateMessage.lineHeight).toBeCloseTo(19.5, 5);
  });

  test('.btn: 9/14 padding, radiusSm, 13/500 text (web .btn)', () => {
    const s = buildStyles(minimalDark);
    expect(s.btn.paddingVertical).toBe(9); // web: padding: 9px 14px
    expect(s.btn.paddingHorizontal).toBe(14);
    expect(s.btn.borderRadius).toBe(minimalDark.radiusSm);
    expect(s.btn.borderWidth).toBe(1);
    expect(s.btnText.fontSize).toBe(13); // web: 13px / 500
    expect(s.btnText.fontWeight).toBe('500');
  });

  test('footer: 10/16 padding, hairline top border, 11px muted (web .footer)', () => {
    const s = buildStyles(minimalDark);
    expect(s.footer.paddingVertical).toBe(10);
    expect(s.footer.paddingHorizontal).toBe(16);
    expect(s.footer.borderTopWidth).toBe(0.5); // hairline ≈ 1px
    expect(s.footer.borderTopColor).toBe(minimalDark.colorBorder);
    expect(s.footerText.fontSize).toBe(11);
    expect(s.footerText.color).toBe(minimalDark.colorTextMuted);
    expect(s.footerLink.color).toBe(minimalDark.colorAccent);
  });

  test('inline panel: radiusLg + 1px colorBorder outline (web .inline-root .panel)', () => {
    const s = buildStyles(minimalDark);
    expect(s.inlinePanel.borderRadius).toBe(minimalDark.radiusLg);
    expect(s.inlinePanel.borderWidth).toBe(1);
    expect(s.inlinePanel.borderColor).toBe(minimalDark.colorBorder);
    expect(s.inlinePanel.backgroundColor).toBe(minimalDark.colorSurface);
  });
});
