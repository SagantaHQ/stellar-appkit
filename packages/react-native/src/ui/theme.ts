/**
 * Design tokens for the React Native modal — a port of ui-web's tokens.ts.
 *
 * Same token names and the same 5 themes × 2 variants as the web SDK, but
 * with RN-native values: radii are numbers (dp) instead of 'px' strings, and
 * there are no CSS custom properties — RN styles are plain objects. A host
 * app can override any token by spreading a theme and replacing fields.
 */

export interface ConnectThemeRN {
  colorBg: string;
  colorSurface: string;
  colorSurfaceHover: string;
  colorBorder: string;
  colorText: string;
  colorTextMuted: string;
  colorAccent: string;
  colorAccentText: string;
  colorDanger: string;
  /** dp — RN has no 'px' strings. */
  radiusSm: number;
  radiusMd: number;
  radiusLg: number;
  overlayColor: string;
}

const BASE = {
  radiusSm: 10,
  radiusMd: 14,
  radiusLg: 20,
} as const;

const DARK_BASE = {
  ...BASE,
  colorBg: '#09090B',
  colorSurface: '#18181B',
  colorSurfaceHover: '#27272A',
  colorBorder: '#27272A',
  colorText: '#FAFAFA',
  colorTextMuted: '#A1A1AA',
  colorDanger: '#DC2626',
  overlayColor: 'rgba(0, 0, 0, 0.65)',
} as const;

const LIGHT_BASE = {
  ...BASE,
  colorBg: '#FFFFFF',
  colorSurface: '#F8F8F8',
  colorSurfaceHover: '#F1F1F1',
  colorBorder: '#E4E4E7',
  colorText: '#18181B',
  colorTextMuted: '#71717A',
  colorDanger: '#DC2626',
  overlayColor: 'rgba(0, 0, 0, 0.45)',
} as const;

const ACCENTS = {
  minimal: { dark: '#FAFAFA', light: '#18181B' },
  stellar: { dark: '#6EE7B7', light: '#0E9A6E' },
  sky: { dark: '#38BDF8', light: '#0EA5E9' },
  ocean: { dark: '#60A5FA', light: '#1D4ED8' },
  sunset: { dark: '#FB7185', light: '#E11D48' },
} as const;

export type ThemeName = keyof typeof ACCENTS;

function darkVariant(name: ThemeName): ConnectThemeRN {
  return { ...DARK_BASE, colorAccent: ACCENTS[name].dark, colorAccentText: '#09090B' };
}

function lightVariant(name: ThemeName): ConnectThemeRN {
  return { ...LIGHT_BASE, colorAccent: ACCENTS[name].light, colorAccentText: '#FFFFFF' };
}

export const minimalDark: ConnectThemeRN = darkVariant('minimal');
export const minimalLight: ConnectThemeRN = lightVariant('minimal');
export const stellarDark: ConnectThemeRN = darkVariant('stellar');
export const stellarLight: ConnectThemeRN = lightVariant('stellar');
export const skyDark: ConnectThemeRN = darkVariant('sky');
export const skyLight: ConnectThemeRN = lightVariant('sky');
export const oceanDark: ConnectThemeRN = darkVariant('ocean');
export const oceanLight: ConnectThemeRN = lightVariant('ocean');
export const sunsetDark: ConnectThemeRN = darkVariant('sunset');
export const sunsetLight: ConnectThemeRN = lightVariant('sunset');

/** Default theme — matches the web modal's default (minimal dark). */
export const defaultTheme: ConnectThemeRN = minimalDark;
