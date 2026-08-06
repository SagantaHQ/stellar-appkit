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
async function waitForXBullExtension(timeoutMs = XBULL_EXTENSION_INJECTION_TIMEOUT_MS) {
    if (typeof window === 'undefined' && typeof globalThis.xBullSDK === 'undefined')
        return false;
    // Check multiple possible injection points
    const checkExtension = () => {
        const w = (typeof window !== 'undefined' ? window : globalThis);
        // Primary: the documented injection point
        if (w.xBullSDK)
            return true;
        // Fallback: older xBull versions may use a shorter name
        if (w.xBull)
            return true;
        // Defensive: scan for any xBull-prefixed property (future-proofing)
        for (const key of Object.keys(w)) {
            if (key.toLowerCase().startsWith('xbull') && w[key] != null)
                return true;
        }
        return false;
    };
    if (checkExtension())
        return true;
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        await new Promise((r) => setTimeout(r, 100));
        if (checkExtension())
            return true;
    }
    // Log a diagnostic warning so the user knows WHY the web wallet popup
    // is opening instead of the extension. This is the #1 support question
    // for xBull — without this log, the popup just appears with no context.
    console.warn('[saganta-appkit] xBull extension not detected after ' + (timeoutMs / 1000) + 's. ' +
        'Falling back to the xBull web wallet popup. If you have the xBull extension ' +
        'installed, make sure it is enabled and up to date. Checked: window.xBullSDK, ' +
        'window.xBull, and all xBull-prefixed properties.');
    return false;
}
export function createXBullConnector() {
    const meta = {
        id: 'xbull',
        name: 'xBull',
        icon: 'https://xbull.app/img/logo-icon.svg',
        installUrl: {
            chrome: 'https://chromewebstore.google.com/detail/xbull-wallet/omajpeaffjkigglnbfmhopaigbgihgeb',
        },
        platforms: ['browser-extension', 'web'],
    };
    const capabilities = {
        signTransaction: true,
        signAuthEntry: false, // not exposed by the public sign() API — see file header comment
        signMessage: true, // confirmed in the shipped .d.ts, despite the README omitting it
        submit: false,
    };
    let bridge = null;
    let cachedAddress = null;
    async function ensureBridge() {
        if (bridge)
            return bridge;
        const { xBullWalletConnect } = await import('@creit.tech/xbull-wallet-connect');
        // Pass `preferredTarget: 'extension'` explicitly — it's the SDK's
        // default, but making it explicit protects against a future SDK version
        // that changes the default, and documents our intent: we always prefer
        // the installed extension over the web wallet popup. The bridge still
        // falls back to the web wallet if `window.xBullSDK` is absent at call
        // time — `waitForXBullExtension()` (called before each bridge method)
        // gives the injection time to complete so that fallback rarely fires.
        bridge = new xBullWalletConnect({ preferredTarget: 'extension' });
        return bridge;
    }
    const connector = {
        id: meta.id,
        meta,
        capabilities,
        async getReachability() {
            // The xBull extension injects `window.xBullSDK` (aka `globalThis.xBullSDK`
            // — same object in a browser) asynchronously via a content script. The
            // SDK's bridge checks this global synchronously inside connect()/sign()/
            // signMessage() — if it's undefined at call time, the bridge silently
            // falls back to opening the web wallet popup. We poll briefly for
            // injection; if it doesn't appear within the timeout, we report
            // 'not-installed' so the connect-modal can prompt the user to install
            // the extension (or explicitly accept the web-wallet flow) rather than
            // silently opening a popup.
            //
            // Previous versions of this connector always returned 'available' on
            // the grounds that the web wallet fallback meant xBull was always
            // usable. That's technically true but leads to a poor UX: the user
            // has the extension installed, clicks connect, and gets a web wallet
            // popup instead of the extension UI they expected. Reporting
            // 'not-installed' when the extension isn't detected lets the modal
            // surface the install link instead.
            //
            // In a non-browser environment (Node, bun, SSR), the extension can
            // never be installed — return 'unavailable' immediately so the modal
            // doesn't show xBull as an option.
            if (typeof window === 'undefined' && typeof globalThis.xBullSDK === 'undefined')
                return 'unavailable';
            const installed = await waitForXBullExtension();
            return installed ? 'available' : 'not-installed';
        },
        async connect(_opts) {
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
                const sdk = (typeof window !== 'undefined' ? window : globalThis);
                if (sdk.xBullSDK && sdk.xBullSDK.isConnected === false) {
                    throw ConnectError.internal('xBull extension is installed but no wallet has been set up. Open the xBull extension in your browser toolbar and create or import a wallet, then try connecting again.', undefined, meta.id);
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
        async getAddress() {
            if (!cachedAddress) {
                throw ConnectError.invalidRequest('xBull is not connected — call connect() first.', undefined, meta.id);
            }
            return { address: cachedAddress };
        },
        async getNetwork() {
            // Not exposed by this library — the network is passed explicitly to
            // sign() instead of being something the bridge reports back.
            throw ConnectError.invalidRequest('xBull Wallet Connect does not expose a persistent network — pass networkPassphrase explicitly on each call.', undefined, meta.id);
        },
        async signTransaction(xdr, opts) {
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
                    throw ConnectError.internal('Could not determine the signer address for this xBull transaction — call connect() first.', undefined, meta.id);
                }
                return { signedTxXdr, signerAddress };
            });
        },
        async signAuthEntry() {
            throw ConnectError.invalidRequest('xBull Wallet Connect does not support signing Soroban auth entries. Prompt the user to choose a different wallet for this action.', undefined, meta.id);
        },
        async signMessage(message, opts) {
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
//# sourceMappingURL=xbull.js.map