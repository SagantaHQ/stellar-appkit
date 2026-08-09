/**
 * Design tokens for Stellar AppKit — see ARCHITECTURE.md §5.
 *
 * Theme architecture:
 * - 5 named themes: minimal (default), sky, ocean, forest, sunset
 * - Each theme has a dark + light variant
 * - Themes are built by overriding variables on top of a base palette —
 *   no duplicated CSS, no file size increase
 * - The default theme (minimal) uses a neutral blue accent that fits any
 *   project, inspired by Reown's and WalletConnect's modal UIs
 *
 * Every token is exposed as a CSS custom property so a host app can override
 * any of it without forking the component.
 */

export interface ConnectTheme {
  colorBg: string;
  colorSurface: string;
  colorSurfaceHover: string;
  colorBorder: string;
  colorText: string;
  colorTextMuted: string;
  colorAccent: string;
  /** Text color used when placed on a solid `colorAccent` fill (e.g. the primary CTA). */
  colorAccentText: string;
  colorDanger: string;
  radiusSm: string;
  radiusMd: string;
  radiusLg: string;
  fontDisplay: string;
  fontMono: string;
  shadowElevated: string;
  overlayColor: string;
}

/**
 * Base tokens shared by ALL themes — fonts, radii, danger color.
 * Individual themes override only the colors they need.
 * This keeps each theme definition to ~10 lines instead of ~20.
 */
const BASE_TOKENS = {
  radiusSm: '10px',
  radiusMd: '14px',
  radiusLg: '20px',
  fontDisplay: "'Geist Sans', ui-sans-serif, -apple-system, system-ui, sans-serif",
  fontMono: "'Geist Mono', ui-monospace, 'SF Mono', monospace",
} as const;

/**
 * Base palette for DARK variants — shared surface/bg/border/text colors.
 * Each dark theme only overrides the accent.
 */
const DARK_BASE = {
  ...BASE_TOKENS,
  colorBg: '#0B0D0E',
  colorSurface: '#14171A',
  colorSurfaceHover: '#1B1F23',
  colorBorder: 'rgba(255, 255, 255, 0.08)',
  colorText: '#F5F6F7',
  colorTextMuted: '#9AA0A6',
  colorDanger: '#F0997B',
  shadowElevated: '0 20px 60px rgba(0, 0, 0, 0.45)',
  overlayColor: 'rgba(6, 7, 8, 0.6)',
} as const;

/**
 * Base palette for LIGHT variants — shared surface/bg/border/text colors.
 * Each light theme only overrides the accent.
 */
const LIGHT_BASE = {
  ...BASE_TOKENS,
  colorBg: '#FFFFFF',
  colorSurface: '#F6F6F4',
  colorSurfaceHover: '#EEEEEB',
  colorBorder: 'rgba(11, 13, 14, 0.09)',
  colorText: '#14171A',
  colorTextMuted: '#6B7075',
  colorDanger: '#B23A1B',
  shadowElevated: '0 20px 60px rgba(11, 13, 14, 0.14)',
  overlayColor: 'rgba(20, 23, 26, 0.35)',
} as const;

// ---------------------------------------------------------------------------
// Theme definitions — each theme is just an accent color override.
// The accent is the ONLY thing that changes between themes; everything else
// is inherited from DARK_BASE / LIGHT_BASE.
//
// Theme names are simple and evocative:
//   minimal  — neutral blue (default, fits all projects)
//   sky      — light sky blue
//   ocean    — deep ocean blue
//   forest   — earthy green
//   sunset   — warm orange/pink
// ---------------------------------------------------------------------------

/** The accent for each named theme. */
const ACCENTS = {
  // minimal — default. Neutral blue that fits any project (Reown/WalletConnect style).
  // Works on both dark + light, high contrast, not brand-specific.
  minimal:  { dark: '#3B82F6', light: '#2563EB' },

  // sky — lighter, airy blue. Feels open and friendly.
  sky:      { dark: '#38BDF8', light: '#0EA5E9' },

  // ocean — deep navy blue. Serious, financial, trustworthy.
  ocean:    { dark: '#60A5FA', light: '#1D4ED8' },

  // forest — earthy green. Eco, sustainability, growth.
  forest:   { dark: '#6EE7B7', light: '#0E9A6E' },

  // sunset — warm coral/pink. Energetic, creative, social.
  sunset:   { dark: '#FB7185', light: '#E11D48' },
} as const;

export type ThemeName = keyof typeof ACCENTS;

/** Helper: build a dark variant for a theme by overriding only the accent. */
function darkVariant(name: ThemeName): ConnectTheme {
  const accent = ACCENTS[name].dark;
  return {
    ...DARK_BASE,
    colorAccent: accent,
    // Darker shade of the accent for readable text on accent fills.
    // Using a very dark version of the accent ensures white text is legible.
    colorAccentText: '#FFFFFF',
  };
}

/** Helper: build a light variant for a theme by overriding only the accent. */
function lightVariant(name: ThemeName): ConnectTheme {
  const accent = ACCENTS[name].light;
  return {
    ...LIGHT_BASE,
    colorAccent: accent,
    colorAccentText: '#FFFFFF',
  };
}

// ---------------------------------------------------------------------------
// Exported themes — 5 themes × 2 variants = 10 theme objects.
// Named exports so consumers can import exactly what they need:
//   import { minimalDark, skyLight } from '@saganta/stellar-appkit-ui-web';
// ---------------------------------------------------------------------------

// minimal (default) — neutral blue
export const minimalDark: ConnectTheme = darkVariant('minimal');
export const minimalLight: ConnectTheme = lightVariant('minimal');

// sky — light sky blue
export const skyDark: ConnectTheme = darkVariant('sky');
export const skyLight: ConnectTheme = lightVariant('sky');

// ocean — deep ocean blue
export const oceanDark: ConnectTheme = darkVariant('ocean');
export const oceanLight: ConnectTheme = lightVariant('ocean');

// forest — earthy green
export const forestDark: ConnectTheme = darkVariant('forest');
export const forestLight: ConnectTheme = lightVariant('forest');

// sunset — warm coral/pink
export const sunsetDark: ConnectTheme = darkVariant('sunset');
export const sunsetLight: ConnectTheme = lightVariant('sunset');

// ---------------------------------------------------------------------------
// Backwards compatibility — map old names to the new minimal theme.
// `darkTheme` and `lightTheme` are kept so existing consumers don't break.
// The old darkTheme used a green accent (#6EE7B7) — we now map it to
// `minimalDark` (blue accent) since minimal is the new default. Consumers
// who want the old green can use `forestDark`.
// ---------------------------------------------------------------------------

/** @deprecated Use `minimalDark` instead. Kept for backwards compatibility. */
export const darkTheme: ConnectTheme = minimalDark;

/** @deprecated Use `minimalLight` instead. Kept for backwards compatibility. */
export const lightTheme: ConnectTheme = minimalLight;

// ---------------------------------------------------------------------------
// Theme registry — maps a theme name + mode to a resolved ConnectTheme.
// Used by the modal's resolveTheme() method.
// ---------------------------------------------------------------------------

export const THEME_REGISTRY: Record<ThemeName, { dark: ConnectTheme; light: ConnectTheme }> = {
  minimal: { dark: minimalDark, light: minimalLight },
  sky:     { dark: skyDark, light: skyLight },
  ocean:   { dark: oceanDark, light: oceanLight },
  forest:  { dark: forestDark, light: forestLight },
  sunset:  { dark: sunsetDark, light: sunsetLight },
};

/** All available theme names. */
export const THEME_NAMES = Object.keys(THEME_REGISTRY) as ThemeName[];

const TOKEN_TO_VAR: Record<keyof ConnectTheme, string> = {
  colorBg: '--sak-color-bg',
  colorSurface: '--sak-color-surface',
  colorSurfaceHover: '--sak-color-surface-hover',
  colorBorder: '--sak-color-border',
  colorText: '--sak-color-text',
  colorTextMuted: '--sak-color-text-muted',
  colorAccent: '--sak-color-accent',
  colorAccentText: '--sak-color-accent-text',
  colorDanger: '--sak-color-danger',
  radiusSm: '--sak-radius-sm',
  radiusMd: '--sak-radius-md',
  radiusLg: '--sak-radius-lg',
  fontDisplay: '--sak-font-display',
  fontMono: '--sak-font-mono',
  shadowElevated: '--sak-shadow-elevated',
  overlayColor: '--sak-overlay-color',
};

/** Renders a theme object as `--sak-*: value;` declarations for a `:host { ... }` block. */
export function themeToCssDeclarations(theme: Partial<ConnectTheme>): string {
  return (Object.keys(theme) as (keyof ConnectTheme)[])
    .map((key) => `${TOKEN_TO_VAR[key]}: ${theme[key]};`)
    .join('\n      ');
}

export const CSS_VAR_NAMES = TOKEN_TO_VAR;
