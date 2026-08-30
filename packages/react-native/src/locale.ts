/**
 * Device-locale detection for the i18n module — the RN analog of the web
 * app calling `setLocale(navigator.language)`.
 *
 * The core i18n module (`@saganta/stellar-appkit`) never auto-detects the
 * locale on any platform — the app decides (the web demos ship a locale
 * switcher page). On React Native the natural default IS the device
 * language, so this helper reads it from the RN native modules (zero extra
 * dependencies — no expo-localization, no react-native-localize) and maps
 * it onto the supported `LocaleCode` set:
 *
 *   detectDeviceLocale()              → 'fr' | 'zh-CN' | … | null
 *   await applyDeviceLocale()         → setLocale(detect) + return the code
 *
 * Both are safe to call anywhere — unknown/unsupported locales return null
 * (and `applyDeviceLocale()` then leaves the active locale untouched, i.e.
 * English), never throwing.
 */

import { NativeModules, Platform } from 'react-native';
import { setLocale, type LocaleCode } from '@saganta/stellar-appkit';

/** Locale codes supported by the core i18n module (mirror of i18n/index.ts). */
const SUPPORTED_LOCALES: readonly LocaleCode[] = [
  'en', 'zh-CN', 'zh-TW', 'es', 'pt-BR', 'ja', 'ko', 'de', 'fr', 'ru',
  'ar', 'hi', 'it', 'tr', 'pl', 'vi', 'id', 'uk', 'nl', 'th', 'he',
  'cs', 'sv', 'ro', 'fa',
];

/**
 * Reads the raw device locale string from the RN native modules.
 *
 * iOS exposes `SettingsManager.settings.AppleLocale` (e.g. "fr_FR") — or
 * `AppleLanguages[0]` on some iOS versions; Android exposes
 * `I18nManager.localeIdentifier` (e.g. "zh_CN"). Both are public, stable
 * surfaces used by react-native-localize itself, so we read them directly
 * instead of taking a dependency.
 */
function rawDeviceLocale(): string | null {
  try {
    if (Platform.OS === 'ios') {
      const settings = (NativeModules.SettingsManager as { settings?: Record<string, unknown> } | undefined)?.settings;
      const appleLocale = settings?.AppleLocale;
      if (typeof appleLocale === 'string' && appleLocale) return appleLocale;
      const appleLanguages = settings?.AppleLanguages;
      if (Array.isArray(appleLanguages) && typeof appleLanguages[0] === 'string' && appleLanguages[0]) {
        return appleLanguages[0] as string;
      }
      return null;
    }
    if (Platform.OS === 'android') {
      const localeIdentifier = (NativeModules.I18nManager as { localeIdentifier?: string } | undefined)?.localeIdentifier;
      if (typeof localeIdentifier === 'string' && localeIdentifier) return localeIdentifier;
      return null;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Normalizes a raw device locale onto the supported `LocaleCode` set.
 *
 *   "fr_FR"          → "fr"        (region stripped when the bare language matches)
 *   "zh_CN"          → "zh-CN"     (underscore + case normalized)
 *   "pt-BR"          → "pt-BR"     (already canonical)
 *   "en_US"          → "en"
 *   "gsw_LI"         → null        (unsupported — caller keeps the current locale)
 */
export function normalizeToDeviceLocale(raw: string | null | undefined): LocaleCode | null {
  if (!raw) return null;
  // BCP-47 tags may carry a private-use suffix ("zh-Hans-CN-x-hk") — drop it.
  const tag = raw.trim().split('-x-')[0]!;
  // Android reports underscores ("zh_CN"); iOS may too on some versions.
  const canonical = tag.replace(/_/g, '-');
  const lower = canonical.toLowerCase();

  // Exact canonical match first ("pt-br" → "pt-BR").
  const exact = SUPPORTED_LOCALES.find((code) => code.toLowerCase() === lower);
  if (exact) return exact;

  // Language-only fallback ("fr_FR" → "fr", "zh_Hans" → "zh-CN") — keeps the
  // widest translation when the device's exact region variant isn't shipped.
  // Region-qualified codes match on their primary subtag (zh-CN and zh-TW
  // both carry language "zh"; the first listed wins for a bare "zh" device).
  const language = lower.split('-')[0]!;
  if (!language) return null;
  const languageOnly = SUPPORTED_LOCALES.find((code) => code.toLowerCase().split('-')[0] === language);
  return languageOnly ?? null;
}

/**
 * The device's locale mapped onto the supported `LocaleCode` set, or null
 * when the device language isn't translated (the app then keeps whatever
 * locale is active — English by default).
 */
export function detectDeviceLocale(): LocaleCode | null {
  return normalizeToDeviceLocale(rawDeviceLocale());
}

/**
 * Applies the device locale to the core i18n module (one-shot convenience
 * for app init). Returns the applied locale, or null when the device
 * language isn't supported and the active locale was left untouched.
 *
 * ```ts
 * // App entry — before the first render, so the modal never flashes English
 * await applyDeviceLocale();
 * ```
 */
export async function applyDeviceLocale(): Promise<LocaleCode | null> {
  const code = detectDeviceLocale();
  if (!code || code === 'en') return code;
  await setLocale(code);
  return code;
}
