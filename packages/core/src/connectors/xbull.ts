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
} from '../types.js';
import { ConnectError } from '../types.js';
import { withNormalizedError } from './error-utils.js';

/**
 * Adapter for xBull, via the official `@creit.tech/xbull-wallet-connect`
 * package — confirmed against the package's own shipped `.d.ts` at v0.4.0,
 * which is more precise than (and in one place corrects) its README:
 * `signMessage()` genuinely exists and is implemented below, despite the
 * README not documenting it.
 *
 * ## Extension detection (the "opens web wallet instead of extension" bug)
 *
 * The xBull SDK's `xBullWalletConnect` bridge checks `window.xBullSDK`
 * synchronously inside `connect()` / `sign()` / `signMessage()`. If
 * `window.xBullSDK` is truthy AND `preferredTarget === 'extension'` (the
 * default), the bridge uses the extension directly — no popup. If
 * `window.xBullSDK` is undefined at call time, the bridge silently falls
 * back to opening the xBull web wallet popup at https://wallet.xbull.app.
 *
 * The extension injects `window.xBullSDK` asynchronously via a content
 * script — content scripts run after the page's main JS begins executing.
 * On a fast page-load → user-click-connect flow, our code can race ahead
 * of the injection, causing the bridge to open the web wallet even though
 * the extension IS installed. This is the exact bug users report.
 *
 * The fix: poll for `window.xBullSDK` injection before calling `connect()`
 * (and before `signTransaction` / `signMessage`). We wait up to 2 seconds
 * (configurable); if the extension doesn't appear, we fall through to the
 * bridge's default behavior (web wallet popup) — which is still functional,
 * just not what the user wanted.
 *
 * `getReachability()` now returns `'not-installed'` when the extension
 * isn't detected after the timeout, so the connect-modal can prompt the
 * user to install the extension (or explicitly accept the web-wallet flow)
 * rather than silently opening a popup.
 *
 * Soroban auth-entry signing is still not supported here: the shipped
 * types show the underlying message protocol *does* have an internal
 * `xdrType: 'Transaction' | 'AuthEntry'` concept (`ISignXDRRequestPayload`),
 * but the public `sign()` method's parameters (`ISignParams`) don't expose
 * a way to select it.
 */

/**
 * How long to wait for the xBull extension to inject `window.xBullSDK`
 * before giving up and letting the bridge fall back to the web wallet
 * popup. 2 seconds is enough for content-script injection on a normal
 * page load; if it doesn't appear in that window, the extension is
 * almost certainly not installed.
 */
const XBULL_EXTENSION_INJECTION_TIMEOUT_MS = 5000;

/**
 * Polls for the xBull extension to inject its SDK global. Returns true if
 * the extension is detected within the timeout, false otherwise.
 *
 * The xBull extension injects `window.xBullSDK` asynchronously via a content
 * script — content scripts run after the page's main JS begins executing.
 * On a fast page-load → user-click-connect flow, our code can race ahead
 * of the injection, causing the SDK's bridge to silently fall back to
 * opening the xBull web wallet popup even though the extension IS installed.
 *
 * We check multiple possible injection points because xBull has changed
 * the property name across versions:
 *   - `window.xBullSDK` (the documented one, v0.4.0+)
 *   - `window.xBull` (older versions)
 *   - Any property on window starting with "xBull" (defensive)
 */
async function waitForXBullExtension(timeoutMs = XBULL_EXTENSION_INJECTION_TIMEOUT_MS): Promise<boolean> {
  if (typeof window === 'undefined' && typeof (globalThis as { xBullSDK?: unknown }).xBullSDK === 'undefined') return false;

  // Check multiple possible injection points
  const checkExtension = (): boolean => {
    const w = (typeof window !== 'undefined' ? window : globalThis) as Record<string, unknown>;
    // Primary: the documented injection point
    if (w.xBullSDK) return true;
    // Fallback: older xBull versions may use a shorter name
    if (w.xBull) return true;
    // Defensive: scan for any xBull-prefixed property (future-proofing)
    for (const key of Object.keys(w)) {
      if (key.toLowerCase().startsWith('xbull') && w[key] != null) return true;
    }
    return false;
  };

  if (checkExtension()) return true;

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 100));
    if (checkExtension()) return true;
  }

  // Log a diagnostic warning so the user knows WHY the web wallet popup
  // is opening instead of the extension. This is the #1 support question
  // for xBull — without this log, the popup just appears with no context.
  console.warn(
    '[saganta-appkit] xBull extension not detected after ' + (timeoutMs / 1000) + 's. ' +
    'Falling back to the xBull web wallet popup. If you have the xBull extension ' +
    'installed, make sure it is enabled and up to date. Checked: window.xBullSDK, ' +
    'window.xBull, and all xBull-prefixed properties.'
  );

  return false;
}

export function createXBullConnector(): WalletConnector {
  const meta: WalletMeta = {
    id: 'xbull',
    name: 'xBull',
    icon: 'data:image/png;base64,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',
    installUrl: {
      chrome: 'https://chromewebstore.google.com/detail/xbull-wallet/omajpeaffjkigglnbfmhopaigbgihgeb',
    },
    platforms: ['browser-extension', 'web'],
  };

  const capabilities: WalletCapabilities = {
    signTransaction: true,
    signAuthEntry: false, // not exposed by the public sign() API — see file header comment
    signMessage: true, // confirmed in the shipped .d.ts, despite the README omitting it
    submit: false,
  };

  let bridge: XBullWalletConnectBridge | null = null;
  let cachedAddress: string | null = null;

  async function ensureBridge(): Promise<XBullWalletConnectBridge> {
    if (bridge) return bridge;
    const { xBullWalletConnect } = await import('@creit.tech/xbull-wallet-connect');
    // Pass `preferredTarget: 'extension'` explicitly — it's the SDK's
    // default, but making it explicit protects against a future SDK version
    // that changes the default, and documents our intent: we always prefer
    // the installed extension over the web wallet popup. The bridge still
    // falls back to the web wallet if `window.xBullSDK` is absent at call
    // time — `waitForXBullExtension()` (called before each bridge method)
    // gives the injection time to complete so that fallback rarely fires.
    bridge = new xBullWalletConnect({ preferredTarget: 'extension' }) as unknown as XBullWalletConnectBridge;
    return bridge;
  }

  const connector: WalletConnector = {
    id: meta.id,
    meta,
    capabilities,

    async getReachability() {
      // xBull is ALWAYS available — even without the extension installed.
      // The xBull SDK bridge (`@creit.tech/xbull-wallet-connect`) falls back
      // to the xBull web wallet (https://wallet.xbull.app) when the extension
      // isn't detected. So we always return 'available'.
      //
      // We still call waitForXBullExtension() before connect()/sign() to give
      // the extension time to inject its SDK — but if it doesn't appear,
      // the bridge's web wallet fallback kicks in automatically.
      //
      // In a non-browser environment (Node, bun, SSR), return 'unavailable'.
      if (typeof window === 'undefined' && typeof (globalThis as { xBullSDK?: unknown }).xBullSDK === 'undefined') return 'unavailable';
      return 'available';
    },

    async connect(_opts?: ConnectOptions): Promise<WalletAccount> {
      return withNormalizedError(meta.id, async () => {
        // Wait for the extension to inject window.xBullSDK before
        // instantiating the bridge — otherwise the bridge's synchronous
        // `window.xBullSDK` lookup fails and it silently opens the web
        // wallet popup, which is the exact bug users report ("opens the
        // web wallet version instead of using the extension").
        await waitForXBullExtension();
        const b = await ensureBridge();

        // Pre-flight check: if the xBull extension is injected but no
        // wallet has been set up inside it yet, the extension throws an
        // unhelpful "Wallet hasn't been set upp" (their typo) error.
        // Catch it and surface a friendly message that tells the user
        // exactly what to do: open the xBull extension and create/import
        // a wallet.
        const sdk = (typeof window !== 'undefined' ? window : globalThis) as { xBullSDK?: { isConnected?: boolean } };
        if (sdk.xBullSDK && sdk.xBullSDK.isConnected === false) {
          throw ConnectError.internal(
            'xBull extension is installed but no wallet has been set up. Open the xBull extension in your browser toolbar and create or import a wallet, then try connecting again.',
            undefined,
            meta.id
          );
        }

        // Both flags are required together per the real IConnectParams shape —
        // we need both capabilities, so this is explicit rather than relying
        // on whatever the library defaults to when the params object is omitted.
        const publicKey = await b.connect({ canRequestPublicKey: true, canRequestSign: true });
        cachedAddress = publicKey;
        return { address: publicKey, walletId: meta.id };
      });
    },

    async disconnect() {
      bridge?.closeConnections?.();
      bridge = null;
      cachedAddress = null;
    },

    async getAddress(): Promise<GetAddressResult> {
      if (!cachedAddress) {
        throw ConnectError.invalidRequest('xBull is not connected — call connect() first.', undefined, meta.id);
      }
      return { address: cachedAddress };
    },

    async getNetwork(): Promise<GetNetworkResult> {
      // Not exposed by this library — the network is passed explicitly to
      // sign() instead of being something the bridge reports back.
      throw ConnectError.invalidRequest(
        'xBull Wallet Connect does not expose a persistent network — pass networkPassphrase explicitly on each call.',
        undefined,
        meta.id
      );
    },

    async signTransaction(xdr: string, opts?: SignTxOptions): Promise<SignTransactionResult> {
      return withNormalizedError(meta.id, async () => {
        // Wait for the extension before signing too — same race-condition
        // fix as connect(). Without this, a sign call immediately after
        // page load could open the web wallet popup instead of using the
        // extension, even if connect() succeeded via the extension.
        await waitForXBullExtension();
        const b = await ensureBridge();
        const signerAddress = opts?.address ?? cachedAddress ?? undefined;
        const signedTxXdr = await b.sign({
          xdr,
          publicKey: signerAddress,
          network: opts?.networkPassphrase,
        });
        if (!signerAddress) {
          throw ConnectError.internal(
            'Could not determine the signer address for this xBull transaction — call connect() first.',
            undefined,
            meta.id
          );
        }
        return { signedTxXdr, signerAddress };
      });
    },

    async signAuthEntry(): Promise<SignAuthEntryResult> {
      throw ConnectError.invalidRequest(
        'xBull Wallet Connect does not support signing Soroban auth entries. Prompt the user to choose a different wallet for this action.',
        undefined,
        meta.id
      );
    },

    async signMessage(message: string, opts?: SignOptions): Promise<SignMessageResult> {
      return withNormalizedError(meta.id, async () => {
        await waitForXBullExtension();
        const b = await ensureBridge();
        const result = await b.signMessage(message, {
          networkPassphrase: opts?.networkPassphrase,
          address: opts?.address ?? cachedAddress ?? undefined,
        });

        // The xBull SDK's TypeScript interface (ISignMessageResult in
        // interfaces.d.ts) declares `message` and `fullMessage` fields,
        // but the ACTUAL RUNTIME (verified against v0.4.0 of the package)
        // only returns `{ signedMessage, signerAddress }` in both the
        // extension and web-wallet code paths. The `fullMessage` field
        // is aspirational in the types — it's never populated.
        //
        // This means we CANNOT know what bytes xBull actually signed.
        // The SDK doesn't surface them. If xBull prepends a header or
        // transforms the message before signing (the existence of a
        // `fullMessage` field in the types suggests it might), server-side
        // verification will fail because the verifier can't reconstruct
        // the signed bytes.
        //
        // We surface `signedData = base64(utf8(message))` as a best-effort
        // hypothesis — correct ONLY if xBull signs the raw message verbatim.
        // The verifier's multi-candidate fallback also tries SHA-256 and
        // SHA-512 of the message, which may help if xBull pre-hashes.
        //
        // If xBull verification still fails, the consumer must either:
        //   1. Use a custom `verifySignatureFn` in `verifySiws()` that
        //      knows how to recover the signed bytes, OR
        //   2. Contact xBull to expose `fullMessage` in the runtime
        //      response (not just the types), OR
        //   3. Use a different wallet for SIWS.
        return {
          signedMessage: result.signedMessage,
          signerAddress: result.signerAddress,
          signedData: Buffer.from(message, 'utf-8').toString('base64'),
        };
      });
    },
  };

  return connector;
}

/** Shape of the real `xBullWalletConnect` bridge — confirmed against the package's actual runtime (v0.4.0).
 *
 * NOTE: The SDK's TypeScript interface (ISignMessageResult in interfaces.d.ts)
 * declares `message` and `fullMessage` fields, but the ACTUAL RUNTIME only
 * returns `{ signedMessage, signerAddress }` in both the extension and
 * web-wallet code paths. The `fullMessage` field is aspirational in the
 * types — it's never populated. Our connector therefore does NOT read
 * `fullMessage` and surfaces `signedData = base64(utf8(message))` as a
 * best-effort hypothesis.
 */
interface XBullWalletConnectBridge {
  connect(params?: { canRequestPublicKey: boolean; canRequestSign: boolean }): Promise<string>;
  sign(params: { xdr: string; publicKey?: string; network?: string }): Promise<string>;
  signMessage(
    message: string,
    opts?: { networkPassphrase?: string; address?: string }
  ): Promise<{
    success: true;
    /** The signature (base64). */
    signedMessage: string;
    signerAddress: string;
    // NOTE: `message` and `fullMessage` are declared in ISignMessageResult
    // but are NOT populated in the actual runtime response. Do not rely on them.
  }>;
  closeConnections(): void;
}
