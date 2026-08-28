/**
 * @saganta/stellar-appkit-react-native/ui — the React Native modal.
 *
 * ```tsx
 * import { AppKitModal } from '@saganta/stellar-appkit-react-native/ui';
 *
 * export function App() {
 *   const [open, setOpen] = useState(false);
 *   return (
 *     <>
 *       <Button title="Connect" onPress={() => setOpen(true)} />
 *       {open && (
 *         <AppKitModal client={appkit} open={open} onClose={() => setOpen(false)} />
 *       )}
 *     </>
 *   );
 * }
 * ```
 *
 * Requires peer deps: react-native, react, @gorhom/bottom-sheet,
 * react-native-svg + react-native-qrcode-svg.
 */

export { AppKitModal, type AppKitModalProps } from './AppKitModal.js';
export { useAppKit, type AppKitState } from './useAppKit.js';
export {
  minimalDark, minimalLight, stellarDark, stellarLight,
  skyDark, skyLight, oceanDark, oceanLight,
  sunsetDark, sunsetLight, defaultTheme,
  type ConnectThemeRN, type ThemeName,
} from './theme.js';
export { useBreathe, useSpinner, useReducedMotion } from './animations.js';
