export { SagantaAppKitModal } from './connect-modal.js';
export type { PresentationMode } from './connect-modal.js';

// Theme exports — 5 named themes (minimal, stellar, sky, ocean, sunset),
// each with dark + light variants. `minimalDark` is the default.
export {
  // Named themes (dark + light variants)
  minimalDark, minimalLight,
  stellarDark, stellarLight,
  skyDark, skyLight,
  oceanDark, oceanLight,
  sunsetDark, sunsetLight,
  // Registry + helpers
  THEME_REGISTRY, THEME_NAMES,
  // Backwards compat (map to minimal)
  darkTheme, lightTheme,
  themeToCssDeclarations,
} from './tokens.js';
export type { ConnectTheme, ThemeName } from './tokens.js';
