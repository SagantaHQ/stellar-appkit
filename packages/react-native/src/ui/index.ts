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
 * Or embed it inline (web `mode="inline"` parity — no bottom sheet):
 *
 * ```tsx
 * <AppKitModal client={appkit} mode="inline" open onClose={() => {}} />
 * ```
 *
 * Requires peer deps: react-native, react, @gorhom/bottom-sheet.
 *
 * No SVG library needed — wallet icons are pre-rasterized compressed PNGs
 * and the spinner is a pure-View squircle dash-arc (SquircleArc). Pairing
 * is deep-link only (the same phone would have to scan a QR code, so the
 * modal never shows one); `<QrCodeView>` remains exported for apps that
 * build their own tablet/desktop-style pairing screens.
 */

export { AppKitModal, type AppKitModalProps } from './AppKitModal.js';
export { useAppKit, type AppKitState } from './useAppKit.js';
export { useSiwsFlow, extractSiwsErrorMessage, siwsSessionIsValid, type SiwsPhase, type SiwsFlowState, type UseSiwsFlow } from './useSiws.js';
export { WalletIcon, type WalletIconProps } from './WalletIcon.js';
export { SquircleArc, useLoopProgress, type SquircleArcProps } from './SquircleArc.js';
export {
  buildSquircleTrack,
  cometKeyframes,
  paintedLength,
  pointOnSquirclePath,
  squirclePerimeter,
  SQUIRCLE_COMET,
  SQUIRCLE_SPEC,
  type PathPoint,
  type TrackSegment,
  type CometKeyframes,
  type CometSegment,
} from './squircle-track.js';
export {
  ChevronLeftIcon,
  CloseIcon,
  CheckIcon,
  ExternalLinkIcon,
  AlertCircleIcon,
  CircleXIcon,
  RetryIcon,
  WalletGlyphIcon,
  type IconProps,
} from './icons.js';
export { QrCodeView, type QrCodeViewProps } from './qr/QrCodeView.js';
export { generateQrMatrix, qrMatrixToRects, type QrMatrix, type QrRect, type QrEcLevel } from './qr/qr-matrix.js';
export {
  minimalDark, minimalLight, stellarDark, stellarLight,
  skyDark, skyLight, oceanDark, oceanLight,
  sunsetDark, sunsetLight, defaultTheme,
  type ConnectThemeRN, type ThemeName,
} from './theme.js';
export { useBreathe, useSpinner, useEntranceStagger, useReducedMotion } from './animations.js';
