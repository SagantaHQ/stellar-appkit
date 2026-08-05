/**
 * Design tokens for Stellar AppKit's default theme — see ARCHITECTURE.md §5.
 * Direction: a quiet, editorial dark-mode with a single considered accent,
 * deliberately not one of the generic "AI-default" crypto-modal looks.
 * Every value here is exposed as a CSS custom property so a host app can
 * override any of it without forking the component.
 */
export const darkTheme = {
    colorBg: '#0B0D0E',
    colorSurface: '#14171A',
    colorSurfaceHover: '#1B1F23',
    colorBorder: 'rgba(255, 255, 255, 0.08)',
    colorText: '#F5F6F7',
    colorTextMuted: '#9AA0A6',
    colorAccent: '#6EE7B7',
    colorAccentText: '#062E22',
    colorDanger: '#F0997B',
    radiusSm: '10px',
    radiusMd: '14px',
    radiusLg: '20px',
    fontDisplay: "'Geist Sans', ui-sans-serif, -apple-system, system-ui, sans-serif",
    fontMono: "'Geist Mono', ui-monospace, 'SF Mono', monospace",
    shadowElevated: '0 20px 60px rgba(0, 0, 0, 0.45)',
    overlayColor: 'rgba(6, 7, 8, 0.6)',
};
export const lightTheme = {
    colorBg: '#FFFFFF',
    colorSurface: '#F6F6F4',
    colorSurfaceHover: '#EEEEEB',
    colorBorder: 'rgba(11, 13, 14, 0.09)',
    colorText: '#14171A',
    colorTextMuted: '#6B7075',
    colorAccent: '#0E9A6E',
    colorAccentText: '#FFFFFF',
    colorDanger: '#B23A1B',
    radiusSm: '10px',
    radiusMd: '14px',
    radiusLg: '20px',
    fontDisplay: "'Geist Sans', ui-sans-serif, -apple-system, system-ui, sans-serif",
    fontMono: "'Geist Mono', ui-monospace, 'SF Mono', monospace",
    shadowElevated: '0 20px 60px rgba(11, 13, 14, 0.14)',
    overlayColor: 'rgba(20, 23, 26, 0.35)',
};
const TOKEN_TO_VAR = {
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
export function themeToCssDeclarations(theme) {
    return Object.keys(theme)
        .map((key) => `${TOKEN_TO_VAR[key]}: ${theme[key]};`)
        .join('\n      ');
}
export const CSS_VAR_NAMES = TOKEN_TO_VAR;
//# sourceMappingURL=tokens.js.map