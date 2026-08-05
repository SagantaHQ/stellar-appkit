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
 * Corrected from an earlier version of this file that assumed a
 * `window.xBullSDK` injected global with `getPublicKey`/`signXDR`/
 * `signAuthEntry`/`signMessage` methods. That shape doesn't exist — xBull's
 * real API is a `xBullWalletConnect` bridge class you instantiate, with
 * `connect()` (returns the public key directly), `sign({xdr, publicKey?,
 * network?})` (returns the signed XDR directly), and `signMessage(message,
 * opts?)`. There is no separate "get current address" call — `connect()`
 * is both. The bridge itself handles falling back to the xBull webapp when
 * the extension isn't installed, so there's no meaningful "not installed"
 * state to detect the way there is for Freighter — it behaves like Albedo
 * in that respect.
 *
 * Soroban auth-entry signing is still not supported here, but precisely
 * so: the shipped types show the underlying message protocol *does* have
 * an internal `xdrType: 'Transaction' | 'AuthEntry'` concept
 * (`ISignXDRRequestPayload`), but the public `sign()` method's parameters
 * (`ISignParams`) don't expose a way to select it — so there's no
 * reliable, documented way to ask for auth-entry signing specifically
 * through this public API today, as opposed to it simply not existing.
 */
export function createXBullConnector(): WalletConnector {
  const meta: WalletMeta = {
    id: 'xbull',
    name: 'xBull',
    icon: 'https://xbull.app/img/logo-icon.svg',
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
    // Cast through `unknown` because the upstream SDK's shipped `.d.ts`
    // declares `signMessage()` as returning `{ signedMessage; signerAddress }`,
    // but the actual runtime return (verified against v0.4.0 of the package)
    // is the richer `ISignMessageResult` shape with `message`, `fullMessage`,
    // `success`, etc. Our bridge type reflects the real runtime shape so we
    // can surface `fullMessage` to the verifier.
    bridge = new xBullWalletConnect() as unknown as XBullWalletConnectBridge;
    return bridge;
  }

  const connector: WalletConnector = {
    id: meta.id,
    meta,
    capabilities,

    async getReachability() {
      // The bridge falls back to the xBull webapp automatically when the
      // extension isn't installed, so — like Albedo — there's no "not
      // installed" state to report, only whether this environment can run
      // the bridge at all (needs window for the popup/iframe it uses).
      return typeof window !== 'undefined' ? 'available' : 'unavailable';
    },

    async connect(_opts?: ConnectOptions): Promise<WalletAccount> {
      return withNormalizedError(meta.id, async () => {
        const b = await ensureBridge();
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
        const b = await ensureBridge();
        const result = await b.signMessage(message, {
          networkPassphrase: opts?.networkPassphrase,
          address: opts?.address ?? cachedAddress ?? undefined,
        });
        // xBull's `ISignMessageResult` distinguishes `message` (the string
        // we passed in) from `fullMessage` (the string the wallet actually
        // signed — xBull prepends a wallet-defined header/warning banner to
        // the message before signing, similar to how EVM wallets prefix
        // personal_sign with "\x19Ethereum Signed Message:\n<length>").
        //
        // The previous version of this connector returned only `signedMessage`
        // and threw away `fullMessage`, which made server-side verification
        // impossible: the verifier had no way to know what bytes xBull
        // actually signed. We now surface `fullMessage` as `signedData`
        // (base64 of its UTF-8 bytes), so the verifier can verify against
        // the real signed payload.
        //
        // `fullMessage` was added to the xBull SDK's shipped types at v0.4.0
        // — older versions may not return it. We fall back to the plaintext
        // `message` if it's missing, which is the best we can do (and is
        // correct for any version that signs the raw message verbatim).
        const signedSource = result.fullMessage ?? result.message ?? message;
        return {
          signedMessage: result.signedMessage,
          signerAddress: result.signerAddress,
          signedData: Buffer.from(signedSource, 'utf-8').toString('base64'),
        };
      });
    },
  };

  return connector;
}

/** Shape of the real `xBullWalletConnect` bridge — confirmed against the package's shipped .d.ts (v0.4.0). */
interface XBullWalletConnectBridge {
  connect(params?: { canRequestPublicKey: boolean; canRequestSign: boolean }): Promise<string>;
  sign(params: { xdr: string; publicKey?: string; network?: string }): Promise<string>;
  signMessage(
    message: string,
    opts?: { networkPassphrase?: string; address?: string }
  ): Promise<{
    success: true;
    /** The original message string passed in. */
    message: string;
    /** The full string the wallet actually signed (may include a wallet-added prefix). Present in v0.4.0+. */
    fullMessage?: string;
    /** The signature. */
    signedMessage: string;
    signerAddress: string;
  }>;
  closeConnections(): void;
}
