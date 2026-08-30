/**
 * @saganta/stellar-appkit-react-native/xbull — the xBull WebView bridge.
 *
 * Requires `react-native-webview` as a peer dependency. Render the bridge's
 * screen at your app root and pass the bridge to the connector set:
 *
 * ```tsx
 * import { createXBullWebViewBridge } from '@saganta/stellar-appkit-react-native/xbull';
 * import { defaultReactNativeConnectors } from '@saganta/stellar-appkit-react-native';
 *
 * const [xbullView, setXBullView] = useState<React.ReactElement | null>(null);
 * const xbullBridge = useMemo(() => createXBullWebViewBridge(setXBullView), []);
 *
 * const appkit = useMemo(() => new StellarAppKit({
 *   network: 'TESTNET',
 *   appMetadata: { name: 'My App', url: 'https://myapp.example' },
 *   storage: createAsyncStorage(AsyncStorage),
 *   connectors: defaultReactNativeConnectors({
 *     projectId: WC_PROJECT_ID,
 *     xbullBridge,
 *     xbullOrigin: 'https://myapp.example',
 *   }),
 * }), []);
 *
 * // render {xbullView} at the app root — the xBull wallet screen appears on demand.
 * ```
 */

export {
  createXBullWebViewBridge,
  XBullWebViewScreen,
  type XBullWebViewScreenProps,
} from './XBullWebViewScreen.js';
