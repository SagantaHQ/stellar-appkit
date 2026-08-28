/**
 * Albedo connector for React Native — same intents as the web connector,
 * but the popup window is replaced by an in-app WebView.
 *
 * Why a WebView bridge? Albedo has no native app and no deep link. Its web
 * flow is a popup at `https://albedo.link/confirm` that talks to the opener
 * via `window.postMessage`. On React Native we reproduce exactly that
 * protocol inside a `react-native-webview`:
 *
 *   1. Load `https://albedo.link/confirm`.
 *   2. Before content: shim `window.opener` so the page's
 *      `(window.opener || window.parent).postMessage(...)` replies are routed
 *      to `window.ReactNativeWebView.postMessage` → RN `onMessage`.
 *   3. After load: dispatch the intent params as a synthetic `message` event
 *      (what `window.opener.postMessage(params, '*')` would have delivered).
 *   4. The user confirms in Albedo's own UI; the response arrives at our shim.
 *
 * This connector is deliberately **headless** — it accepts an
 * `AlbedoWebViewBridge` implementation, so:
 *   - Apps with their own UI pass any `open(url, params) → Promise<result>`.
 *   - Apps using our modal pass `@saganta/stellar-appkit-react-native/albedo`'s
 *     `createReactNativeWebViewBridge()`, which renders the WebView screen.
 *
 * Result parsing mirrors core's web albedo connector 1:1 (same intents:
 * `public_key`, `tx`, `sign_message`), so server-side verification via
 * `@saganta/stellar-appkit-siws-verify` works identically on both platforms.
 */

import type {
  WalletConnector,
  WalletMeta,
  WalletCapabilities,
  ConnectOptions,
  WalletAccount,
  GetAddressResult,
  GetNetworkResult,
  SignTxOptions,
  SignTransactionResult,
  SignOptions,
  SignAuthEntryResult,
  SignMessageResult,
} from '@saganta/stellar-appkit';
import { ConnectError } from '@saganta/stellar-appkit';

/** The Albedo intent protocol version this bridge speaks. */
const ALBEDO_PROTOCOL_VERSION = 2;

/** Albedo's frontend origin — the only origin the WebView should load. */
export const ALBEDO_FRONTEND_URL = 'https://albedo.link/confirm';

/**
 * Headless bridge contract: open the Albedo confirm page, deliver the intent
 * params, resolve with Albedo's raw response object (or reject on close/
 * navigation failure). Implemented by the WebView screen in `./albedo`, or
 * by the app's own UI.
 */
export interface AlbedoWebViewBridge {
  openIntent(url: string, params: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export interface AlbedoWebViewConnectorOptions {
  /** Bridge that renders the Albedo confirm page (e.g. the WebView screen from `./albedo`). */
  bridge: AlbedoWebViewBridge;
  /**
   * The app's origin, sent with the intent (Albedo shows it to the user as
   * the requesting app and uses it for stoplist checks). Derive it from your
   * `appMetadata.url` — must be an absolute URL.
   */
  origin: string;
}

/** Raw Albedo response fields the connector consumes. */
interface AlbedoIntentResult {
  result?: 'success' | 'error' | string;
  code?: number;
  message?: string;
  pubkey?: string;
  signed_envelope_xdr?: string;
  message_signature?: string;
  signed_message?: string;
}

export function createAlbedoWebViewConnector(opts: AlbedoWebViewConnectorOptions): WalletConnector {
  const meta: WalletMeta = {
    id: 'albedo',
    name: 'Albedo',
    icon: 'data:image/svg+xml;base64,PHN2ZyB2aWV3Qm94PSIwIDAgMTI4IDEyOCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTI4IiBoZWlnaHQ9IjEyOCIgcng9IjI4IiBmaWxsPSIjMDA2NkIyIi8+PHBhdGggZD0iTTY0IDI2TDk2IDk4SDgyTDc1IDgwSDUzTDQ2IDk4SDMyTDY0IDI2Wk01OCA2OEg3MEw2NCA1Mkw1OCA2OFoiIGZpbGw9IiNmZmYiLz48L3N2Zz4=',
    platforms: ['web', 'react-native'],
  };

  const capabilities: WalletCapabilities = {
    signTransaction: true,
    signAuthEntry: false,
    signMessage: true,
    submit: false, // the RN bridge always returns the signed envelope; submission stays app-side
  };

  let lastKnownAddress: string | null = null;

  /** Sends one intent through the bridge and asserts a successful response. */
  async function confirmIntent(params: Record<string, unknown>): Promise<AlbedoIntentResult> {
    const requestId = `sak-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const fullParams: Record<string, unknown> = {
      ...params,
      __reqid: requestId,
      __albedo_intent_version: ALBEDO_PROTOCOL_VERSION,
    };
    const raw = await opts.bridge.openIntent(ALBEDO_FRONTEND_URL, fullParams);
    const res = raw as AlbedoIntentResult;
    if (res.result === 'error') {
      // Rejected-by-user arrives as an error response — normalize to the same
      // ConnectError the web popup flow produces so error handling matches.
      if (typeof res.message === 'string' && /reject|denied|cancel/i.test(res.message)) {
        throw ConnectError.rejected(meta.id);
      }
      throw ConnectError.externalService(
        res.message || 'Albedo returned an error response.',
        undefined,
        meta.id
      );
    }
    return res;
  }

  const connector: WalletConnector = {
    id: meta.id,
    meta,
    capabilities,

    async getReachability() {
      // The bridge is injected at construction — when it's there, we can
      // always show Albedo's confirm page in the WebView.
      return 'available';
    },

    async connect(_opts?: ConnectOptions): Promise<WalletAccount> {
      const res = await confirmIntent({ intent: 'public_key' });
      if (!res.pubkey) {
        throw ConnectError.internal('Albedo did not return a public key.', undefined, meta.id);
      }
      lastKnownAddress = res.pubkey;
      return { address: res.pubkey, walletId: meta.id };
    },

    async disconnect() {
      lastKnownAddress = null;
    },

    async getAddress(): Promise<GetAddressResult> {
      if (lastKnownAddress) return { address: lastKnownAddress };
      const res = await confirmIntent({ intent: 'public_key' });
      if (!res.pubkey) {
        throw ConnectError.internal('Albedo did not return a public key.', undefined, meta.id);
      }
      lastKnownAddress = res.pubkey;
      return { address: res.pubkey };
    },

    async getNetwork(): Promise<GetNetworkResult> {
      // Same as web: Albedo is network-agnostic per intent.
      throw ConnectError.invalidRequest(
        'Albedo does not expose a persistent network — pass networkPassphrase explicitly on each call.',
        undefined,
        meta.id
      );
    },

    async signTransaction(xdr: string, signOpts?: SignTxOptions): Promise<SignTransactionResult> {
      const signerAddress = signOpts?.address ?? lastKnownAddress;
      if (!signerAddress) {
        throw ConnectError.internal(
          'Could not determine the signer address — call connect() first.',
          undefined,
          meta.id
        );
      }
      const res = await confirmIntent({
        intent: 'tx',
        xdr,
        network: passphraseToAlbedoNetwork(signOpts?.networkPassphrase),
        pubkey: signerAddress,
        submit: false,
      });
      if (!res.signed_envelope_xdr) {
        throw ConnectError.internal(
          'Albedo did not return a signed transaction envelope.',
          undefined,
          meta.id
        );
      }
      return { signedTxXdr: res.signed_envelope_xdr, signerAddress };
    },

    async signAuthEntry(): Promise<SignAuthEntryResult> {
      throw ConnectError.invalidRequest(
        'Albedo does not support signing Soroban auth entries. Prompt the user to choose a different wallet for this action.',
        undefined,
        meta.id
      );
    },

    async signMessage(message: string, signOpts?: SignOptions): Promise<SignMessageResult> {
      const res = await confirmIntent({
        intent: 'sign_message',
        message,
        pubkey: signOpts?.address ?? lastKnownAddress ?? undefined,
      });
      if (!res.signed_message || !res.message_signature || !res.pubkey) {
        throw ConnectError.internal(
          'Albedo did not return a complete signed message response.',
          undefined,
          meta.id
        );
      }
      return {
        signedMessage: res.message_signature,
        signerAddress: res.pubkey,
        // hex → base64 without Buffer, so the bridge stays polyfill-free
        signedData: hexToBase64(res.signed_message),
      };
    },
  };

  return connector;
}

function passphraseToAlbedoNetwork(networkPassphrase?: string): 'public' | 'testnet' | undefined {
  if (!networkPassphrase) return undefined;
  return networkPassphrase.toLowerCase().includes('test') ? 'testnet' : 'public';
}

/** Pure hex → base64 (no Buffer dependency — polyfill-free on Hermes). */
function hexToBase64(hex: string): string {
  let binary = '';
  for (let i = 0; i < hex.length; i += 2) {
    const byte = parseInt(hex.slice(i, i + 2), 16);
    if (Number.isNaN(byte)) {
      throw ConnectError.internal('Albedo returned a malformed signed_message hex value.', undefined, 'albedo');
    }
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}
