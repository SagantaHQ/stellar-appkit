/**
 * Tests for the built-in ICU-subset fallback formatter (i18n/index.ts →
 * formatIcuFallback / selectPluralCategory / cldrPluralCategory).
 *
 * Why it exists: Hermes — the React Native JS engine — ships
 * Intl.NumberFormat and Intl.DateTimeFormat but NOT Intl.PluralRules, so
 * `intl-messageformat` throws
 * "Intl.PluralRules is not available in this environment" while *formatting*
 * any plural message (construction succeeds). Without the fallback, `t()`
 * returned the raw pattern and RN users saw
 *   {count, plural, one {# pending signature} other {# pending signatures}}
 * rendered as literal text.
 *
 * These suites pin:
 * - formatIcuFallback: {var}, plural (+ `#`, `=N` exact, offset:), select,
 *   nested placeholders, unknown variables, malformed patterns
 * - cldrPluralCategory: the compact CLDR table for every language we ship
 * - The t()-level integration: with globalThis.Intl.PluralRules deleted —
 *   a faithful in-process simulation of Hermes — t() must produce exactly
 *   the same strings as the real intl-messageformat path
 */

import { test, expect, describe, beforeEach } from 'bun:test';
import {
  t,
  setLocale,
  formatIcuFallback,
  selectPluralCategory,
  cldrPluralCategory,
} from '../src/i18n/index.js';

// Reset to English before each test so tests don't pollute each other.
beforeEach(async () => {
  await setLocale('en');
});

describe('formatIcuFallback — simple interpolation', () => {
  test('substitutes {var}', () => {
    expect(formatIcuFallback('Continue in {walletName}', { walletName: 'Freighter' }, 'en')).toBe(
      'Continue in Freighter'
    );
  });

  test('substitutes multiple variables', () => {
    expect(
      formatIcuFallback('This wallet is on {actualNetwork}, this app needs {expectedNetwork}.', {
        actualNetwork: 'PUBLIC',
        expectedNetwork: 'TESTNET',
      }, 'en')
    ).toBe('This wallet is on PUBLIC, this app needs TESTNET.');
  });

  test('unknown variables stay as {name} literals (debugging parity with t())', () => {
    expect(formatIcuFallback('Hello {who}', { other: 'x' }, 'en')).toBe('Hello {who}');
  });

  test('plain text without placeholders passes through', () => {
    expect(formatIcuFallback('No placeholders here', { count: 1 }, 'en')).toBe('No placeholders here');
  });
});

describe('formatIcuFallback — plural', () => {
  const en = '{count, plural, one {# pending signature} other {# pending signatures}}';

  test('one → singular branch with # substitution', () => {
    expect(formatIcuFallback(en, { count: 1 }, 'en')).toBe('1 pending signature');
  });

  test('other → plural branch with # substitution', () => {
    expect(formatIcuFallback(en, { count: 3 }, 'en')).toBe('3 pending signatures');
  });

  test('zero goes to other in English (CLDR en has no zero category)', () => {
    expect(formatIcuFallback(en, { count: 0 }, 'en')).toBe('0 pending signatures');
  });

  test('exact =N branch wins over category rules', () => {
    const msg = '{count, plural, =1 {exactly one} one {one} other {other}}';
    expect(formatIcuFallback(msg, { count: 1 }, 'en')).toBe('exactly one');
    expect(formatIcuFallback(msg, { count: 2 }, 'en')).toBe('other');
  });

  test('offset:N shifts both the category and the # value', () => {
    const msg = '{count, plural, offset:1 one {# winner} other {# winners}}';
    // 3 - offset 1 = 2 → other, # renders 2
    expect(formatIcuFallback(msg, { count: 3 }, 'en')).toBe('2 winners');
    // 2 - offset 1 = 1 → one, # renders 1
    expect(formatIcuFallback(msg, { count: 2 }, 'en')).toBe('1 winner');
  });

  test('nested placeholders inside a plural branch are interpolated', () => {
    const msg = '{count, plural, one {# item for {user}} other {# items for {user}}}';
    expect(formatIcuFallback(msg, { count: 2, user: 'Ada' }, 'en')).toBe('2 items for Ada');
  });

  test('missing plural variable keeps the raw pattern', () => {
    expect(formatIcuFallback(en, { other: 1 }, 'en')).toBe(en);
  });

  test('missing "other" branch and no matching category keeps the raw pattern', () => {
    const msg = '{count, plural, one {uno}}';
    expect(formatIcuFallback(msg, { count: 5 }, 'en')).toBe(msg);
  });

  test('Russian one/few/many via the CLDR table', () => {
    const ru = '{count, plural, one {# ожидающая подпись} few {# ожидающие подписи} other {# ожидающих подписей}}';
    expect(formatIcuFallback(ru, { count: 1 }, 'ru')).toBe('1 ожидающая подпись');
    expect(formatIcuFallback(ru, { count: 21 }, 'ru')).toBe('21 ожидающая подпись');
    expect(formatIcuFallback(ru, { count: 3 }, 'ru')).toBe('3 ожидающие подписи');
    expect(formatIcuFallback(ru, { count: 11 }, 'ru')).toBe('11 ожидающих подписей');
    expect(formatIcuFallback(ru, { count: 25 }, 'ru')).toBe('25 ожидающих подписей');
  });

  test('Arabic zero/two/few/many categories', () => {
    const ar = '{count, plural, zero {none} one {one} two {two} few {few} many {many} other {other}}';
    expect(formatIcuFallback(ar, { count: 0 }, 'ar')).toBe('none');
    expect(formatIcuFallback(ar, { count: 2 }, 'ar')).toBe('two');
    expect(formatIcuFallback(ar, { count: 5 }, 'ar')).toBe('few');
    expect(formatIcuFallback(ar, { count: 15 }, 'ar')).toBe('many');
    expect(formatIcuFallback(ar, { count: 100 }, 'ar')).toBe('other');
  });

  test('numeric strings coerce (wallets sometimes send counts as strings)', () => {
    expect(formatIcuFallback(en, { count: '2' }, 'en')).toBe('2 pending signatures');
  });
});

describe('formatIcuFallback — select + degradation', () => {
  test('select picks the matching keyword branch', () => {
    const msg = '{gender, select, male {he} female {she} other {they}}';
    expect(formatIcuFallback(msg, { gender: 'female' }, 'en')).toBe('she');
    expect(formatIcuFallback(msg, { gender: 'unknown' }, 'en')).toBe('they');
  });

  test('number/date argument types degrade to String(value)', () => {
    expect(formatIcuFallback('{n, number}', { n: 5 }, 'en')).toBe('5');
    expect(formatIcuFallback('{d, date, short}', { d: '2026-01-01' }, 'en')).toBe('2026-01-01');
  });

  test('unbalanced braces degrade to raw output, never throw', () => {
    expect(formatIcuFallback('broken {count, plural, one {x', { count: 1 }, 'en')).toBe(
      'broken {count, plural, one {x'
    );
  });
});

describe('cldrPluralCategory — compact CLDR cardinal table', () => {
  test('en/de/es/it/nl/sv/tr/el: one only for 1', () => {
    for (const lang of ['en', 'de', 'es', 'it', 'nl', 'sv', 'tr', 'el']) {
      expect(cldrPluralCategory(lang, 1)).toBe('one');
      expect(cldrPluralCategory(lang, 0)).toBe('other');
      expect(cldrPluralCategory(lang, 2)).toBe('other');
    }
  });

  test('fr/pt/hi/fa: one for 0 and 1', () => {
    for (const lang of ['fr', 'pt', 'hi', 'fa']) {
      expect(cldrPluralCategory(lang, 0)).toBe('one');
      expect(cldrPluralCategory(lang, 1)).toBe('one');
      expect(cldrPluralCategory(lang, 2)).toBe('other');
    }
  });

  test('ja/ko/th/vi/id/zh: always other', () => {
    for (const lang of ['ja', 'ko', 'th', 'vi', 'id', 'zh']) {
      expect(cldrPluralCategory(lang, 0)).toBe('other');
      expect(cldrPluralCategory(lang, 1)).toBe('other');
      expect(cldrPluralCategory(lang, 100)).toBe('other');
    }
  });

  test('ru/uk: one/few/many boundaries', () => {
    for (const lang of ['ru', 'uk']) {
      expect(cldrPluralCategory(lang, 1)).toBe('one');
      expect(cldrPluralCategory(lang, 21)).toBe('one');
      expect(cldrPluralCategory(lang, 2)).toBe('few');
      expect(cldrPluralCategory(lang, 4)).toBe('few');
      expect(cldrPluralCategory(lang, 12)).toBe('many');
      expect(cldrPluralCategory(lang, 11)).toBe('many');
      expect(cldrPluralCategory(lang, 5)).toBe('many');
    }
  });

  test('pl: one/few/many', () => {
    expect(cldrPluralCategory('pl', 1)).toBe('one');
    expect(cldrPluralCategory('pl', 2)).toBe('few');
    expect(cldrPluralCategory('pl', 22)).toBe('few');
    expect(cldrPluralCategory('pl', 5)).toBe('many');
    expect(cldrPluralCategory('pl', 12)).toBe('many');
  });

  test('cs: one/few/many', () => {
    expect(cldrPluralCategory('cs', 1)).toBe('one');
    expect(cldrPluralCategory('cs', 2)).toBe('few');
    expect(cldrPluralCategory('cs', 4)).toBe('few');
    expect(cldrPluralCategory('cs', 5)).toBe('many');
  });

  test('ro: one/few/other', () => {
    expect(cldrPluralCategory('ro', 1)).toBe('one');
    expect(cldrPluralCategory('ro', 2)).toBe('few');
    expect(cldrPluralCategory('ro', 19)).toBe('few');
    expect(cldrPluralCategory('ro', 20)).toBe('other');
    expect(cldrPluralCategory('ro', 102)).toBe('few');
  });

  test('he: one/two/other (integer simplification)', () => {
    expect(cldrPluralCategory('he', 1)).toBe('one');
    expect(cldrPluralCategory('he', 2)).toBe('two');
    expect(cldrPluralCategory('he', 3)).toBe('other');
  });

  test('ar: all six categories', () => {
    expect(cldrPluralCategory('ar', 0)).toBe('zero');
    expect(cldrPluralCategory('ar', 1)).toBe('one');
    expect(cldrPluralCategory('ar', 2)).toBe('two');
    expect(cldrPluralCategory('ar', 3)).toBe('few');
    expect(cldrPluralCategory('ar', 10)).toBe('few');
    expect(cldrPluralCategory('ar', 11)).toBe('many');
    expect(cldrPluralCategory('ar', 99)).toBe('many');
    expect(cldrPluralCategory('ar', 100)).toBe('other');
  });

  test('non-integers fall to other (counts are integers in our messages)', () => {
    expect(cldrPluralCategory('en', 1.5)).toBe('other');
    expect(cldrPluralCategory('ru', 1.5)).toBe('other');
  });

  test('unknown languages default to the one/other rule', () => {
    expect(cldrPluralCategory('xx', 1)).toBe('one');
    expect(cldrPluralCategory('xx', 2)).toBe('other');
  });
});

describe('selectPluralCategory', () => {
  test('uses Intl.PluralRules when available (this test runner has it)', () => {
    // Bun/Node ship Intl.PluralRules — the first branch of the helper runs.
    expect(selectPluralCategory('en', 1)).toBe('one');
    expect(selectPluralCategory('en', 2)).toBe('other');
    expect(selectPluralCategory('ru', 3)).toBe('few');
  });
});

describe('t() on an engine without Intl.PluralRules (Hermes simulation)', () => {
  // Delete globalThis.Intl.PluralRules for the duration of a test — this is
  // exactly the API surface Hermes lacks, so intl-messageformat#format()
  // throws and t() must fall back to formatIcuFallback. Restored in finally.
  const intlRef = globalThis.Intl as { PluralRules?: unknown };
  const originalPluralRules = intlRef.PluralRules;

  function withoutPluralRules<T>(fn: () => T): T {
    intlRef.PluralRules = undefined;
    try {
      return fn();
    } finally {
      intlRef.PluralRules = originalPluralRules;
    }
  }

  test('plural messages format instead of leaking the raw ICU pattern', () => {
    const result = withoutPluralRules(() => t('connected.pending_signatures', { count: 1 }));
    expect(result).toBe('1 pending signature');
    expect(withoutPluralRules(() => t('connected.pending_signatures', { count: 2 }))).toBe(
      '2 pending signatures'
    );
  });

  test('the fallback output matches the real intl-messageformat output byte-for-byte', () => {
    const real = t('connected.pending_signatures', { count: 1 });
    const hermes = withoutPluralRules(() => t('connected.pending_signatures', { count: 1 }));
    expect(hermes).toBe(real);

    const realMany = t('connected.pending_signatures', { count: 5 });
    const hermesMany = withoutPluralRules(() => t('connected.pending_signatures', { count: 5 }));
    expect(hermesMany).toBe(realMany);
  });

  test('simple interpolation still works (never needed PluralRules anyway)', () => {
    const result = withoutPluralRules(() => t('connecting.continue_in_wallet', { walletName: 'Freighter' }));
    expect(result).toBe('Continue in Freighter');
  });

  test('plural messages in non-English locales format through the CLDR table', async () => {
    await setLocale('ru');
    const one = withoutPluralRules(() => t('connected.pending_signatures', { count: 1 }));
    expect(one).toBe('1 ожидающая подпись');
    const few = withoutPluralRules(() => t('connected.pending_signatures', { count: 3 }));
    expect(few).toBe('3 ожидающие подписи');
    const many = withoutPluralRules(() => t('connected.pending_signatures', { count: 11 }));
    expect(many).toBe('11 ожидающих подписей');
    await setLocale('en');
  });

  test('no-values plural messages (static text) are unaffected', () => {
    // t() without values returns the raw message by design — documented
    // behavior; every call site that shows plural messages passes values.
    expect(withoutPluralRules(() => t('connected.pending_signatures'))).toContain('plural');
  });
});
