/**
 * @saganta/stellar-appkit-react-native/albedo — the Albedo WebView bridge.
 *
 * Requires `react-native-webview` as a peer dependency. Render the bridge's
 * screen at your app root and pass the bridge to the connector set:
 *
 * ```tsx
 * import { createAlbedoWebViewBridge } from '@saganta/stellar-appkit-react-native/albedo';
 * import { defaultReactNativeConnectors } from '@saganta/stellar-appkit-react-native';
 *
 * const [albedoView, setAlbedoView] = useState<React.ReactElement | null>(null);
 * const albedoBridge = useMemo(() => createAlbedoWebViewBridge(setAlbedoView), []);
 *
 * const appkit = useMemo(() => new StellarAppKit({
 *   network: 'TESTNET',
 *   appMetadata: { name: 'My App', url: 'https://myapp.example' },
 *   storage: createAsyncStorage(AsyncStorage),
 *   connectors: defaultReactNativeConnectors({
 *     projectId: WC_PROJECT_ID,
 *     albedoBridge,
 *     albedoOrigin: 'https://myapp.example',
 *   }),
 * }), []);
 *
 * // render {albedoView} at the app root — the Albedo screen appears on demand.
 * ```
 */

export { createAlbedoWebViewBridge, AlbedoWebViewScreen, type AlbedoWebViewScreenProps } from './AlbedoWebViewScreen.js';
