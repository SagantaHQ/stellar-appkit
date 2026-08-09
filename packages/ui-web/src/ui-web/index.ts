export { SagantaAppKitModal } from './connect-modal.js';
export type { PresentationMode } from './connect-modal.js';

// Theme exports — 5 named themes (minimal, sky, ocean, forest, sunset),
// each with dark + light variants. `minimalDark` is the default.
export {
  // Named themes (dark + light variants)
  minimalDark, minimalLight,
  skyDark, skyLight,
  oceanDark, oceanLight,
  forestDark, forestLight,
  sunsetDark, sunsetLight,
  // Registry + helpers
  THEME_REGISTRY, THEME_NAMES,
  // Backwards compat (map to minimal)
  darkTheme, lightTheme,
  themeToCssDeclarations,
} from './tokens.js';
export type { ConnectTheme, ThemeName } from './tokens.js';
