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
      // Malformed ICU pattern — fall back to raw message with manual replacement
      return message;
    }
    formatCache.set(cacheKey, imf);
  }

  try {
    const result = imf.format(values);
    // IntlMessageFormat.format() can return string | (string | T)[] depending
    // on the pattern. For our use case (always string output), we coerce.
    return Array.isArray(result) ? result.join('') : String(result);
  } catch {
    // Format failed (e.g., a required variable was missing) — return raw message
    return message;
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
