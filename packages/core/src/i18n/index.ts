/**
 * Internationalization (i18n) module for Stellar AppKit.
 *
 * Architecture:
 *
 * 1. **English is bundled** — `./locales/en.ts` is statically imported so the
 *    modal renders immediately on first load without a flash of untranslated
 *    text. No dynamic import, no network request.
 *
 * 2. **All other locales are lazy-loaded** — when `setLocale('zh-CN')` is
 *    called, we `await import('./locales/zh-CN.js')` which the bundler
 *    code-splits into a separate chunk. Only the locale the user actually
 *    needs is downloaded. This keeps the initial bundle small.
 *
 * 3. **ICU MessageFormat via `intl-messageformat`** — every message string
 *    is parsed into an `IntlMessageFormat` instance (cached per key+locale)
 *    and formatted with the provided interpolation values. This gives us
 *    `{variable}` interpolation, `{count, plural, ...}`, `{gender, select,
 *    ...}`, and proper number/date formatting for free.
 *
 *    **Engine fallback** — `intl-messageformat` needs `Intl.PluralRules`
 *    (among others) at *format* time. Hermes — the React Native JS engine —
 *    ships `Intl.NumberFormat`/`Intl.DateTimeFormat` but NOT
 *    `Intl.PluralRules`, so every plural message would throw and, without
 *    this fallback, render as the raw `{count, plural, …}` pattern. When
 *    construction OR formatting throws, `t()` re-formats the message with a
 *    built-in zero-dependency ICU-subset formatter (`formatIcuFallback`)
 *    that covers `{var}`, `{var, plural, …}` (with `#`, exact `=N` matches
 *    and `offset:`), and `{var, select, …}`, using `Intl.PluralRules` when
 *    available and a compact CLDR cardinal-rules table otherwise. On a
 *    capable engine the fallback never runs — the output is identical.
 *
 * 4. **Fallback chain** — if a key is missing from the active locale, we
 *    fall back to English. If it's missing from English too, we return the
 *    key itself (useful for debugging — you immediately see which key is
 *    unhandled).
 *
 * 5. **Reactive** — `setLocale()` emits a `localechange` event that the
 *    React hook (`useLocale`) and the modal subscribe to, so the UI
 *    re-renders in the new language immediately.
 *
 * Usage:
 * ```ts
 * import { setLocale, getLocale, t, onLocaleChange, type LocaleCode } from '@saganta/stellar-appkit';
 *
 * // Set at app init
 * await setLocale('zh-CN');
 *
 * // Or pass via config
 * new StellarAppKit({ locale: 'zh-CN', ... });
 *
 * // Translate
 * t('wallet_list.loading');                              // "正在加载钱包…"
 * t('connecting.continue_in_wallet', { walletName: 'Freighter' });  // "在 Freighter 中继续"
 *
 * // React hooks (from ui-web)
 * import { useLocale, useSetLocale } from '@saganta/stellar-appkit-ui-web/react';
 * const locale = useLocale();
 * const setLocale = useSetLocale();
 * ```
 */

import IntlMessageFormat from 'intl-messageformat';
import { en, type LocaleMessages } from './locales/en.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * All supported locale codes. Each has a corresponding lazy-loaded file in
 * `./locales/`. English ('en') is the default and is bundled.
 *
 * To add a new locale:
 * 1. Create `./locales/<code>.ts` with the translated messages
 * 2. Add the code to this union type
 * 3. Add an entry to `LOADER_REGISTRY` in `loader.ts`
 */
export type LocaleCode =
  | 'en'    // English (default, bundled)
  | 'zh-CN' // Simplified Chinese
  | 'zh-TW' // Traditional Chinese
  | 'es'    // Spanish
  | 'pt-BR' // Brazilian Portuguese
  | 'ja'    // Japanese
  | 'ko'    // Korean
  | 'de'    // German
  | 'fr'    // French
  | 'ru'    // Russian
  | 'ar'    // Arabic (RTL)
  | 'hi'    // Hindi
  | 'it'    // Italian
  | 'tr'    // Turkish
  | 'pl'    // Polish
  | 'vi'    // Vietnamese
  | 'id'    // Indonesian
  | 'uk'    // Ukrainian
  | 'nl'    // Dutch
  | 'th'    // Thai
  | 'he'    // Hebrew (RTL)
  | 'cs'    // Czech
  | 'sv'    // Swedish
  | 'ro'    // Romanian
  | 'fa';   // Persian (RTL)

/** A locale message bundle — must match the shape of the English locale. */
export type Locale = LocaleMessages;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** The active locale code. Defaults to 'en'. */
let currentLocale: LocaleCode = 'en';

/** The active message bundle. For 'en', this is the statically-imported `en` object. */
let currentMessages: LocaleMessages = en;

/** The fallback message bundle — always English. */
const fallbackMessages: LocaleMessages = en;

/**
 * Cache of already-loaded locale bundles, keyed by locale code.
 * English is pre-populated since it's bundled.
 */
const loadedLocales = new Map<LocaleCode, LocaleMessages>([['en', en]]);

/**
 * Cache of `IntlMessageFormat` instances, keyed by `${locale}:${key}`.
 * `IntlMessageFormat` parsing is relatively expensive (it builds an AST),
 * so we cache the parsed form. The cache is invalidated when the locale
 * changes (we just create new entries with the new locale prefix — old
 * entries are harmless and eventually GC'd if memory pressure warrants).
 */
const formatCache = new Map<string, IntlMessageFormat>();

/**
 * Set of listeners that fire when the locale changes. The modal and the
 * React `useLocale()` hook subscribe to this so they can re-render.
 */
type LocaleChangeHandler = (locale: LocaleCode) => void;
const localeChangeListeners = new Set<LocaleChangeHandler>();

// ---------------------------------------------------------------------------
// Locale loading
// ---------------------------------------------------------------------------

/**
 * Registry of lazy-loaders for non-English locales. Each entry is a function
 * that dynamically imports the locale file. The bundler (esbuild, webpack,
 * vite, etc.) sees these `import()` calls and code-splits each locale into
 * a separate chunk.
 *
 * English is NOT here — it's statically imported above.
 */
const LOADER_REGISTRY: Partial<Record<LocaleCode, () => Promise<{ default: LocaleMessages }>>> = {
  'zh-CN': () => import('./locales/zh-CN.js'),
  'zh-TW': () => import('./locales/zh-TW.js'),
  'es':    () => import('./locales/es.js'),
  'pt-BR': () => import('./locales/pt-BR.js'),
  'ja':    () => import('./locales/ja.js'),
  'ko':    () => import('./locales/ko.js'),
  'de':    () => import('./locales/de.js'),
  'fr':    () => import('./locales/fr.js'),
  'ru':    () => import('./locales/ru.js'),
  'ar':    () => import('./locales/ar.js'),
  'hi':    () => import('./locales/hi.js'),
  'it':    () => import('./locales/it.js'),
  'tr':    () => import('./locales/tr.js'),
  'pl':    () => import('./locales/pl.js'),
  'vi':    () => import('./locales/vi.js'),
  'id':    () => import('./locales/id.js'),
  'uk':    () => import('./locales/uk.js'),
  'nl':    () => import('./locales/nl.js'),
  'th':    () => import('./locales/th.js'),
  'he':    () => import('./locales/he.js'),
  'cs':    () => import('./locales/cs.js'),
  'sv':    () => import('./locales/sv.js'),
  'ro':    () => import('./locales/ro.js'),
  'fa':    () => import('./locales/fa.js'),
};

/**
 * Loads a locale bundle, caching the result. English is returned synchronously
 * from the cache. All other locales are loaded via dynamic import().
 *
 * If the locale code is unknown (not in LOADER_REGISTRY), we return English
 * as a fallback rather than throwing — a wrong locale code should never
 * break the app.
 */
export async function loadLocale(code: LocaleCode): Promise<LocaleMessages> {
  // Fast path: already loaded
  const cached = loadedLocales.get(code);
  if (cached) return cached;

  // English is always available (bundled)
  if (code === 'en') {
    loadedLocales.set('en', en);
    return en;
  }

  // Lazy-load
  const loader = LOADER_REGISTRY[code];
  if (!loader) {
    // Unknown locale — fall back to English silently
    return en;
  }

  try {
    const mod = await loader();
    loadedLocales.set(code, mod.default);
    return mod.default;
  } catch {
    // Load failed (network error, chunk missing, etc.) — fall back to English
    return en;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Changes the active locale. Lazy-loads the locale file if it hasn't been
 * loaded yet. Returns a Promise that resolves when the locale is active.
 *
 * After the locale is loaded, all subsequent `t()` calls use the new locale,
 * and a `localechange` event is emitted so subscribers (modal, React hooks)
 * can re-render.
 *
 * ```ts
 * await setLocale('zh-CN');
 * t('wallet_list.loading'); // "正在加载钱包…"
 * ```
 */
export async function setLocale(code: LocaleCode): Promise<void> {
  if (code === currentLocale && loadedLocales.has(code)) return;

  const messages = await loadLocale(code);
  currentLocale = code;
  currentMessages = messages;

  // Clear the format cache — the cached IntlMessageFormat instances were
  // created for the old locale and would produce wrong output.
  formatCache.clear();

  // Notify subscribers
  for (const handler of localeChangeListeners) {
    try {
      handler(code);
    } catch {
      // A listener error shouldn't block other listeners or the locale change
    }
  }
}

/**
 * Returns the currently active locale code.
 */
export function getLocale(): LocaleCode {
  return currentLocale;
}

/**
 * Translates a key to the current locale, with optional interpolation values.
 *
 * The key is a dot-notation path into the locale object, e.g.:
 *   `t('wallet_list.loading')`
 *   `t('connecting.continue_in_wallet', { walletName: 'Freighter' })`
 *
 * If the key is missing from the current locale, falls back to English.
 * If it's missing from English too, returns the key itself (for debugging).
 *
 * Uses `intl-messageformat` under the hood, so ICU MessageFormat syntax is
 * supported:
 *   - `{variable}` — simple interpolation
 *   - `{count, plural, one {item} other {items}}` — pluralization
 *   - `{gender, select, male {he} female {she} other {they}}` — selection
 *
 * On engines where `intl-messageformat` cannot run (most notably Hermes,
 * which lacks `Intl.PluralRules`), formatting falls back to the built-in
 * `formatIcuFallback()` — see its docblock. The user never sees a raw ICU
 * pattern like `{count, plural, …}`.
 */
export function t(key: string, values?: Record<string, unknown>): string {
  // Resolve the message string from the current locale, falling back to English
  const message = resolveMessage(currentMessages, key)
    ?? resolveMessage(fallbackMessages, key)
    ?? key;

  // No interpolation values — return the raw message (skip IntlMessageFormat
  // overhead for the common case of a static string)
  if (!values || Object.keys(values).length === 0) {
    return message;
  }

  // With interpolation — use IntlMessageFormat
  const cacheKey = `${currentLocale}:${key}`;
  let imf = formatCache.get(cacheKey);
  if (!imf) {
    try {
      imf = new IntlMessageFormat(message, currentLocale);
    } catch {
      // Malformed for intl-messageformat, or the engine is missing an Intl
      // API the library requires at construction — format with the built-in
      // ICU-subset formatter instead of leaking the raw pattern.
      return formatIcuFallback(message, values, currentLocale);
    }
    formatCache.set(cacheKey, imf);
  }

  try {
    const result = imf.format(values);
    // IntlMessageFormat.format() can return string | (string | T)[] depending
    // on the pattern. For our use case (always string output), we coerce.
    return Array.isArray(result) ? result.join('') : String(result);
  } catch {
    // Format failed — most commonly on Hermes, whose missing
    // Intl.PluralRules makes every plural message throw
    // "Intl.PluralRules is not available in this environment". Format with
    // the built-in fallback (never return the raw ICU pattern to the user).
    return formatIcuFallback(message, values, currentLocale);
  }
}

/**
 * Subscribes to locale changes. Returns an unsubscribe function.
 *
 * The handler is called immediately with the current locale code on
 * subscription (so the subscriber can initialize its state without an
 * extra call to getLocale()).
 */
export function onLocaleChange(handler: LocaleChangeHandler): () => void {
  localeChangeListeners.add(handler);
  // Fire immediately so the subscriber has the current value
  handler(currentLocale);
  return () => {
    localeChangeListeners.delete(handler);
  };
}

/**
 * Preloads a locale without switching to it. Useful for prefetching the
 * user's likely-next locale (e.g., based on browser language) so the
 * switch is instant when they click.
 *
 * ```ts
 * // Prefetch the user's browser language
 * preloadLocale(navigator.language as LocaleCode);
 * ```
 */
export async function preloadLocale(code: LocaleCode): Promise<void> {
  await loadLocale(code);
}

/**
 * Returns the list of all supported locale codes. Useful for rendering a
 * language picker in your app's settings.
 */
export function getSupportedLocales(): LocaleCode[] {
  return Object.keys(LOADER_REGISTRY) as LocaleCode[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Resolves a dot-notation key (e.g. 'wallet_list.status.connecting') to a
 * string value in the locale object. Returns null if any segment is missing.
 */
function resolveMessage(locale: LocaleMessages, key: string): string | null {
  const parts = key.split('.');
  let current: unknown = locale;
  for (const part of parts) {
    if (current === null || typeof current !== 'object') return null;
    current = (current as Record<string, unknown>)[part] ?? null;
  }
  return typeof current === 'string' ? current : null;
}

// ---------------------------------------------------------------------------
// Built-in ICU-subset fallback formatter
// ---------------------------------------------------------------------------

/**
 * Zero-dependency ICU MessageFormat subset used when `intl-messageformat`
 * cannot run — most importantly on Hermes (React Native), which ships
 * `Intl.NumberFormat`/`Intl.DateTimeFormat` but NOT `Intl.PluralRules`, so
 * `IntlMessageFormat#format()` throws
 * "Intl.PluralRules is not available in this environment" for every plural
 * message and the user would otherwise see the raw pattern
 * (`{count, plural, one {…} other {…}}`).
 *
 * Supported syntax (everything our locale files use):
 *   - `{name}`                       — simple interpolation
 *   - `{name, plural, cat {…} …}`    — with `#` substitution, exact `=N`
 *                                      branches and `offset: N`
 *   - `{name, select, key {…} …}`    — keyword selection
 *   - any other argument type        — plain `String(value)` degradation
 *
 * Plural categories come from `Intl.PluralRules` when the engine has it,
 * otherwise from a compact CLDR cardinal-rules table covering every locale
 * this package ships (see `cldrPluralCategory`). Malformed patterns degrade
 * to emitting the raw segment — never a throw.
 *
 * Exported for tests (not part of the package's public index).
 */
export function formatIcuFallback(
  message: string,
  values: Record<string, unknown>,
  locale: string = 'en'
): string {
  return formatIcuNodes(message, values, locale);
}

/** Formats a message body, recursing into placeholders. */
function formatIcuNodes(msg: string, values: Record<string, unknown>, locale: string): string {
  let out = '';
  let i = 0;
  while (i < msg.length) {
    const open = msg.indexOf('{', i);
    if (open === -1) {
      out += msg.slice(i);
      break;
    }
    out += msg.slice(i, open);
    const close = matchIcuBrace(msg, open);
    if (close === -1) {
      // Unbalanced brace — emit the rest raw rather than throwing.
      out += msg.slice(open);
      break;
    }
    out += formatIcuPlaceholder(msg.slice(open + 1, close), values, locale);
    i = close + 1;
  }
  return out;
}

/** Index of the `}` matching the `{` at `open`, or -1. */
function matchIcuBrace(s: string, open: number): number {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === '{') depth++;
    else if (s[i] === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Formats one placeholder's inner content (`name`, `name, plural, …`). */
function formatIcuPlaceholder(inner: string, values: Record<string, unknown>, locale: string): string {
  const comma = inner.indexOf(',');
  if (comma === -1) {
    const name = inner.trim();
    return name in values ? stringifyIcuValue(values[name]) : `{${name}}`;
  }
  const name = inner.slice(0, comma).trim();
  const rest = inner.slice(comma + 1).trim();
  const typeMatch = /^[a-zA-Z]+/.exec(rest);
  const type = typeMatch ? typeMatch[0] : '';
  // Strip the type keyword plus the comma that follows it
  // (`{n, plural, one {…}}` → branches start at `one {…}`).
  let body = type ? rest.slice(type.length).replace(/^[,\s]+/, '') : rest;

  // `=N` exact matches are looked up before category rules, mirroring ICU.
  if (type === 'plural' || type === 'selectordinal') {
    const offsetMatch = /^offset\s*:\s*(-?\d+(?:\.\d+)?)/.exec(body);
    const offset = offsetMatch ? Number(offsetMatch[1]) : 0;
    if (offsetMatch) body = body.slice(offsetMatch[0].length).trim();
    if (!(name in values)) return `{${inner}}`;
    const raw = values[name];
    const n = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(n)) return stringifyIcuValue(raw);
    const branches = parseIcuBranches(body);
    const numeric = n - offset;
    const exact = `=${numeric}`;
    const key = branches.has(exact)
      ? exact
      : selectPluralCategory(locale, numeric);
    const branch = branches.get(key) ?? branches.get('other');
    if (branch === undefined) return `{${inner}}`;
    return formatIcuNodes(substituteIcuHash(branch, numeric, locale), values, locale);
  }
  if (type === 'select') {
    if (!(name in values)) return `{${inner}}`;
    const branches = parseIcuBranches(body);
    const branch = branches.get(String(values[name])) ?? branches.get('other');
    if (branch === undefined) return `{${inner}}`;
    return formatIcuNodes(branch, values, locale);
  }
  // number / date / time / duration / spellout / … — degrade to String(value).
  if (name in values) return stringifyIcuValue(values[name]);
  return `{${inner}}`;
}

/** Parses `key {text} key {text} …` branch lists into a Map. */
function parseIcuBranches(body: string): Map<string, string> {
  const map = new Map<string, string>();
  let i = 0;
  while (i < body.length) {
    while (i < body.length && /\s/.test(body[i]!)) i++;
    if (i >= body.length) break;
    let j = i;
    while (j < body.length && !/\s/.test(body[j]!)) j++;
    const key = body.slice(i, j);
    while (j < body.length && /\s/.test(body[j]!)) j++;
    if (body[j] !== '{') break; // malformed — keep what we parsed so far
    const close = matchIcuBrace(body, j);
    if (close === -1) break;
    map.set(key, body.slice(j + 1, close));
    i = close + 1;
  }
  return map;
}

/** Replaces `#` with the (locale-formatted) plural number. */
function substituteIcuHash(branch: string, n: number, locale: string): string {
  let formatted: string;
  try {
    formatted =
      typeof Intl !== 'undefined' && typeof Intl.NumberFormat === 'function'
        ? new Intl.NumberFormat(locale).format(n)
        : String(n);
  } catch {
    formatted = String(n);
  }
  return branch.replace(/#/g, formatted);
}

/** Values are coerced the way IntlMessageFormat would (undefined → '…'). */
function stringifyIcuValue(value: unknown): string {
  return value === undefined || value === null ? '' : String(value);
}

/**
 * Picks a plural category: `Intl.PluralRules` when the engine provides it,
 * otherwise the compact CLDR cardinal table below.
 */
export function selectPluralCategory(locale: string, n: number): string {
  if (typeof Intl !== 'undefined' && typeof (Intl as { PluralRules?: unknown }).PluralRules === 'function') {
    try {
      return new (Intl as { PluralRules: new (l?: string) => { select(v: number): string } }).PluralRules(locale).select(n);
    } catch {
      /* fall through to the table */
    }
  }
  return cldrPluralCategory(locale.split('-')[0]!.toLowerCase(), n);
}

/**
 * Compact CLDR cardinal plural rules for every language this package ships
 * a locale for (integers only — our plural values are counts). Used when
 * `Intl.PluralRules` is unavailable (Hermes). Reference:
 * cldr.unicode.org plural rules chart.
 */
export function cldrPluralCategory(lang: string, n: number): string {
  if (!Number.isInteger(n)) return 'other';
  const i = Math.abs(n);
  const n10 = i % 10;
  const n100 = i % 100;
  switch (lang) {
    // n === 1 → one: en, de, es, it, nl, sv, tr, el (+ common defaults)
    case 'en':
    case 'de':
    case 'es':
    case 'it':
    case 'nl':
    case 'sv':
    case 'tr':
    case 'el':
      return i === 1 ? 'one' : 'other';
    // 0 and 1 → one: fr, pt, hi, fa
    case 'fr':
    case 'pt':
    case 'hi':
    case 'fa':
      return i === 0 || i === 1 ? 'one' : 'other';
    // No plural distinction: ja, ko, th, vi, id, zh
    case 'ja':
    case 'ko':
    case 'th':
    case 'vi':
    case 'id':
    case 'zh':
      return 'other';
    // one / few / many: ru, uk (cardinal)
    case 'ru':
    case 'uk':
      if (n10 === 1 && n100 !== 11) return 'one';
      if (n10 >= 2 && n10 <= 4 && !(n100 >= 12 && n100 <= 14)) return 'few';
      return 'many';
    // one / few / many: pl
    case 'pl':
      if (i === 1) return 'one';
      if (n10 >= 2 && n10 <= 4 && !(n100 >= 12 && n100 <= 14)) return 'few';
      return 'many';
    // one / few / many: cs
    case 'cs':
      if (i === 1) return 'one';
      if (i >= 2 && i <= 4) return 'few';
      return 'many';
    // one / few / other: ro
    case 'ro':
      if (i === 1) return 'one';
      if (n100 >= 1 && n100 <= 19) return 'few';
      return 'other';
    // one / two / many / other: he (integer simplification)
    case 'he':
      if (i === 1) return 'one';
      if (i === 2) return 'two';
      return 'other';
    // zero / one / two / few / many / other: ar
    case 'ar':
      if (i === 0) return 'zero';
      if (i === 1) return 'one';
      if (i === 2) return 'two';
      if (n100 >= 3 && n100 <= 10) return 'few';
      if (n100 >= 11 && n100 <= 99) return 'many';
      return 'other';
    default:
      return i === 1 ? 'one' : 'other';
  }
}
