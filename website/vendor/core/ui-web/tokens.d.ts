/**
 * Design tokens for Stellar AppKit's default theme — see ARCHITECTURE.md §5.
 * Direction: a quiet, editorial dark-mode with a single considered accent,
 * deliberately not one of the generic "AI-default" crypto-modal looks.
 * Every value here is exposed as a CSS custom property so a host app can
 * override any of it without forking the component.
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
export declare const darkTheme: ConnectTheme;
export declare const lightTheme: ConnectTheme;
/** Renders a theme object as `--sak-*: value;` declarations for a `:host { ... }` block. */
export declare function themeToCssDeclarations(theme: Partial<ConnectTheme>): string;
export declare const CSS_VAR_NAMES: Record<keyof ConnectTheme, string>;
//# sourceMappingURL=tokens.d.ts.map