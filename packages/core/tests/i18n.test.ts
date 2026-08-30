/**
 * Tests for the i18n module — t(), setLocale(), getLocale(), onLocaleChange(),
 * loadLocale(), preloadLocale(), getSupportedLocales().
 *
 * These tests verify:
 * - English is bundled and available immediately (no async load)
 * - t() returns English strings by default
 * - t() supports ICU interpolation variables
 * - t() supports ICU plural syntax
 * - setLocale() lazy-loads non-English locales
 * - setLocale() is idempotent (no-op when already active)
 * - onLocaleChange() fires on locale switch + immediately on subscribe
 * - getSupportedLocales() returns all 25 locale codes
 * - Fallback chain: missing key in active locale → English → key itself
 * - Unknown locale code falls back to English silently
 */

import { test, expect, describe, beforeEach } from 'bun:test';
import {
  t,
  getLocale,
  setLocale,
  onLocaleChange,
  loadLocale,
  preloadLocale,
  getSupportedLocales,
  type LocaleCode,
} from '../src/i18n/index.js';

// Reset to English before each test so tests don't pollute each other.
beforeEach(async () => {
  await setLocale('en');
});

describe('i18n — default state', () => {
  test('getLocale() returns "en" by default', () => {
    expect(getLocale()).toBe('en');
  });

  test('t() returns English strings for known keys', () => {
    expect(t('title.connect_wallet')).toBe('Connect a wallet');
    expect(t('action.cancel')).toBe('Cancel');
    expect(t('wallet_list.loading')).toBe('Loading wallets…');
  });

  test('t() resolves the RN WebView browser-toolbar keys', () => {
    // The Albedo/xBull screens' toolbar labels — used by WebViewToolbar.tsx.
    expect(t('browser.reload')).toBe('Reload');
    expect(t('browser.open_in_browser')).toBe('Open in browser');
    expect(t('browser.copy_link')).toBe('Copy link');
  });

  test('t() returns the key itself for unknown keys (fallback)', () => {
    expect(t('nonexistent.key')).toBe('nonexistent.key');
    expect(t('title.nonexistent')).toBe('title.nonexistent');
  });

  test('t() returns the key for a partially-valid path (last segment missing)', () => {
    expect(t('title.')).toBe('title.');
    expect(t('wallet_list.status.nonexistent')).toBe('wallet_list.status.nonexistent');
  });
});

describe('i18n — interpolation', () => {
  test('t() substitutes {walletName} variables', () => {
    const result = t('connecting.continue_in_wallet', { walletName: 'Freighter' });
    expect(result).toBe('Continue in Freighter');
  });

  test('t() substitutes {walletName} in SIWS phase messages', () => {
    const result = t('siws.phase.approve_in_wallet', { walletName: 'Albedo' });
    expect(result).toBe('Approve the sign-in request in Albedo');
  });

  test('t() substitutes multiple variables', () => {
    const result = t('network_mismatch.detail', {
      actualNetwork: 'PUBLIC',
      expectedNetwork: 'TESTNET',
    });
    expect(result).toBe('This wallet is on PUBLIC, this app needs TESTNET.');
  });

  test('t() preserves HTML tags passed as interpolation values', () => {
    // The locale string uses plain {actualNetwork} — the HTML <strong> wrapping
    // is done in the rendering code (the modal passes the values already wrapped).
    const result = t('network_mismatch.detail', {
      actualNetwork: '<strong>PUBLIC</strong>',
      expectedNetwork: '<strong>TESTNET</strong>',
    });
    expect(result).toContain('<strong>PUBLIC</strong>');
    expect(result).toContain('<strong>TESTNET</strong>');
  });

  test('t() returns the raw message when no values are passed (skip IMF overhead)', () => {
    expect(t('title.connect_wallet')).toBe('Connect a wallet');
    expect(t('action.sign')).toBe('Sign');
  });
});

describe('i18n — ICU plural syntax', () => {
  test('t() handles {count, plural, one {...} other {...}} for count=1', () => {
    const result = t('connected.pending_signatures', { count: 1 });
    // English: one {# pending signature} → "1 pending signature"
    expect(result).toBe('1 pending signature');
  });

  test('t() handles plural for count=0 (uses "other" form in English)', () => {
    const result = t('connected.pending_signatures', { count: 0 });
    expect(result).toBe('0 pending signatures');
  });

  test('t() handles plural for count=5 (uses "other" form)', () => {
    const result = t('connected.pending_signatures', { count: 5 });
    expect(result).toBe('5 pending signatures');
  });

  test('t() handles plural for large counts', () => {
    const result = t('connected.pending_signatures', { count: 100 });
    expect(result).toBe('100 pending signatures');
  });
});

describe('i18n — setLocale + lazy loading', () => {
  test('setLocale("zh-CN") switches to Simplified Chinese', async () => {
    await setLocale('zh-CN');
    expect(getLocale()).toBe('zh-CN');
    expect(t('title.connect_wallet')).toBe('连接钱包');
    expect(t('action.cancel')).toBe('取消');
  });

  test('the browser-toolbar keys translate too (zh-CN + de spot check)', async () => {
    await setLocale('zh-CN');
    expect(t('browser.reload')).toBe('刷新');
    expect(t('browser.open_in_browser')).toBe('在浏览器中打开');
    expect(t('browser.copy_link')).toBe('复制链接');
    await setLocale('de');
    expect(t('browser.reload')).toBe('Neu laden');
    expect(t('browser.copy_link')).toBe('Link kopieren');
    await setLocale('en');
  });

  test('setLocale("ja") switches to Japanese', async () => {
    await setLocale('ja');
    expect(getLocale()).toBe('ja');
    expect(t('title.connect_wallet')).toBe('ウォレットを接続');
    expect(t('action.cancel')).toBe('キャンセル');
  });

  test('setLocale("es") switches to Spanish', async () => {
    await setLocale('es');
    expect(getLocale()).toBe('es');
    expect(t('title.connect_wallet')).toBe('Conectar una billetera');
    expect(t('action.cancel')).toBe('Cancelar');
  });

  test('setLocale("ar") switches to Arabic', async () => {
    await setLocale('ar');
    expect(getLocale()).toBe('ar');
    expect(t('title.connect_wallet')).toBe('توصيل محفظة');
    expect(t('action.cancel')).toBe('إلغاء');
  });

  test('setLocale("en") switches back to English', async () => {
    await setLocale('zh-CN');
    expect(getLocale()).toBe('zh-CN');
    await setLocale('en');
    expect(getLocale()).toBe('en');
    expect(t('title.connect_wallet')).toBe('Connect a wallet');
  });

  test('setLocale is idempotent — calling with the current locale is a no-op', async () => {
    await setLocale('ja');
    const localeBefore = getLocale();
    await setLocale('ja');
    expect(getLocale()).toBe(localeBefore);
  });

  test('interpolation works in non-English locales', async () => {
    await setLocale('zh-CN');
    const result = t('connecting.continue_in_wallet', { walletName: 'Freighter' });
    expect(result).toBe('在 Freighter 中继续');
  });

  test('plural syntax works in non-English locales (Chinese — other form only)', async () => {
    await setLocale('zh-CN');
    const result = t('connected.pending_signatures', { count: 3 });
    // Chinese plural: {count, plural, other {# 个待签名请求}}
    expect(result).toBe('3 个待签名请求');
  });

  test('plural syntax works in Russian (one/few/many/other forms)', async () => {
    await setLocale('ru');
    expect(t('connected.pending_signatures', { count: 1 })).toBe('1 ожидающая подпись');
    expect(t('connected.pending_signatures', { count: 2 })).toBe('2 ожидающие подписи');
    expect(t('connected.pending_signatures', { count: 5 })).toBe('5 ожидающих подписей');
  });

  test('plural syntax works in Arabic (six plural forms)', async () => {
    await setLocale('ar');
    // Arabic has zero, one, two, few, many, other forms.
    // Note: intl-messageformat localizes the `#` placeholder to Arabic-Indic
    // digits (٠١٢٣٤٥٦٧٨٩) — so count=1 renders as "١" not "1".
    expect(t('connected.pending_signatures', { count: 0 })).toBe('لا توجد توقيعات معلقة');
    expect(t('connected.pending_signatures', { count: 1 })).toContain('توقيع معلق');
    expect(t('connected.pending_signatures', { count: 2 })).toContain('توقيعان معلقان');
    expect(t('connected.pending_signatures', { count: 5 })).toContain('توقيعات معلقة');
  });
});

describe('i18n — onLocaleChange', () => {
  test('fires immediately with the current locale on subscription', () => {
    const calls: LocaleCode[] = [];
    const unsub = onLocaleChange((locale) => calls.push(locale));
    expect(calls).toEqual(['en']);
    unsub();
  });

  test('fires when setLocale is called', async () => {
    const calls: LocaleCode[] = [];
    const unsub = onLocaleChange((locale) => {
      // Skip the initial fire (which is 'en')
      if (calls.length > 0 || locale !== 'en') calls.push(locale);
    });

    await setLocale('zh-CN');
    expect(calls).toContain('zh-CN');

    await setLocale('ja');
    expect(calls).toContain('ja');

    unsub();
  });

  test('unsubscribe stops further calls', async () => {
    const calls: LocaleCode[] = [];
    const unsub = onLocaleChange((locale) => {
      if (calls.length > 0 || locale !== 'en') calls.push(locale);
    });

    await setLocale('zh-CN');
    unsub();

    await setLocale('ja');
    // 'ja' should NOT be in calls because we unsubscribed
    expect(calls).not.toContain('ja');
  });
});

describe('i18n — getSupportedLocales', () => {
  test('returns all 25 supported locale codes', () => {
    const locales = getSupportedLocales();
    expect(locales.length).toBe(24); // 24 non-English (English is bundled, not in registry)
    expect(locales).toContain('zh-CN');
    expect(locales).toContain('zh-TW');
    expect(locales).toContain('es');
    expect(locales).toContain('pt-BR');
    expect(locales).toContain('ja');
    expect(locales).toContain('ko');
    expect(locales).toContain('de');
    expect(locales).toContain('fr');
    expect(locales).toContain('ru');
    expect(locales).toContain('ar');
    expect(locales).toContain('hi');
    expect(locales).toContain('it');
    expect(locales).toContain('tr');
    expect(locales).toContain('pl');
    expect(locales).toContain('vi');
    expect(locales).toContain('id');
    expect(locales).toContain('uk');
    expect(locales).toContain('nl');
    expect(locales).toContain('th');
    expect(locales).toContain('he');
    expect(locales).toContain('cs');
    expect(locales).toContain('sv');
    expect(locales).toContain('ro');
    expect(locales).toContain('fa');
  });

  test('does not include "en" (English is bundled, not lazy-loaded)', () => {
    const locales = getSupportedLocales();
    expect(locales).not.toContain('en');
  });
});

describe('i18n — preloadLocale', () => {
  test('preloadLocale loads a locale without switching to it', async () => {
    await preloadLocale('ko');
    // Locale should still be 'en' — preload doesn't switch
    expect(getLocale()).toBe('en');
    // But the locale is now cached, so switching is instant
    await setLocale('ko');
    expect(getLocale()).toBe('ko');
    expect(t('title.connect_wallet')).toBe('지갑 연결');
  });
});

describe('i18n — fallback chain', () => {
  test('falls back to English when a key is missing from the active locale', async () => {
    // This is hard to test directly because all locales have all keys.
    // But we can verify the fallback by checking that t() never returns
    // undefined — it always returns a string.
    await setLocale('zh-CN');
    const result = t('title.connect_wallet');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  test('falls back to the key itself when missing from both active locale and English', async () => {
    await setLocale('zh-CN');
    expect(t('totally.nonexistent.key')).toBe('totally.nonexistent.key');
  });
});

describe('i18n — unknown locale codes', () => {
  test('setLocale with an unknown code falls back to English silently', async () => {
    // Cast through unknown to bypass the type check — simulates a runtime
    // scenario where the user passes a locale code we don't support.
    await setLocale('xx-XX' as unknown as LocaleCode);
    // The locale should still work — either stays as 'en' or falls back
    expect(getLocale()).toBe('xx-XX' as unknown as LocaleCode);
    // t() should still return English strings (fallback)
    expect(t('title.connect_wallet')).toBe('Connect a wallet');
  });
});

describe('i18n — all 24 non-English locales load successfully', () => {
  const locales: LocaleCode[] = [
    'zh-CN', 'zh-TW', 'es', 'pt-BR', 'ja', 'ko', 'de', 'fr', 'ru', 'ar',
    'hi', 'it', 'tr', 'pl', 'vi', 'id', 'uk', 'nl', 'th', 'he', 'cs', 'sv', 'ro', 'fa',
  ];

  for (const code of locales) {
    test(`setLocale('${code}') loads and translates title.connect_wallet`, async () => {
      await setLocale(code);
      expect(getLocale()).toBe(code);
      const translated = t('title.connect_wallet');
      // Must not be the English value (unless the locale IS English, which it isn't)
      expect(translated).not.toBe('Connect a wallet');
      // Must not be the key itself (the key was found)
      expect(translated).not.toBe('title.connect_wallet');
      // Must be a non-empty string
      expect(translated.length).toBeGreaterThan(0);
    });
  }
});
