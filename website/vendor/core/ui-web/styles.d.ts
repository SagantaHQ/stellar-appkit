import type { ConnectTheme } from './tokens.js';
/**
 * Builds the full stylesheet for the shadow root. Every value routes
 * through `var(--sak-*, <theme-default>)` rather than setting the vars on
 * `:host` — that's what lets a host page override any token with a plain
 * `saganta-appkit-modal { --sak-color-accent: ...; }` rule without fighting
 * shadow-boundary cascade specificity.
 */
export declare function buildStyles(theme: ConnectTheme): string;
//# sourceMappingURL=styles.d.ts.map