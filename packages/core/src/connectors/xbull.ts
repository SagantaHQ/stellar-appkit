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
 * Adapter for xBull (extension + PWA), which injects a provider on
 * `window.xBullSDK`.
 *
 * ⚠️ Verify against xBull's current published SDK before shipping: their
 * injected API has changed shape across major versions, and this file
 * targets the connect/getPublicKey/signXDR/network() surface documented at
 * the time this was written. Everything else in this adapter (error
 * normalization, capability flags, the WalletConnector contract) is stable
 * regardless of that surface — only the body of the six methods below
 * should need to change if xBull's SDK has moved on.
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
    signAuthEntry: true,
    signMessage: true,
    submit: false,
  };

  function provider(): XBullProvider {
    const p = (globalThis as { xBullSDK?: XBullProvider }).xBullSDK;
    if (!p) {
      throw ConnectError.internal(
        'xBull provider not found on window. Is the extension installed and unlocked?',
        undefined,
        meta.id
      );
    }
    return p;
  }

  const connector: WalletConnector = {
    id: meta.id,
    meta,
    capabilities,

    async getReachability() {
      const installed = typeof (globalThis as { xBullSDK?: unknown }).xBullSDK !== 'undefined';
      // Same limitation as Freighter — no distinct unlock-state check exposed, so 'locked' isn't reported here.
      return installed ? 'available' : 'not-installed';
    },

    async connect(_opts?: ConnectOptions): Promise<WalletAccount> {
      return withNormalizedError(meta.id, async () => {
        const p = provider();
        await p.connect();
        const address = await p.getPublicKey();
        return { address, walletId: meta.id };
      });
    },

    async disconnect() {
      const p = provider();
      await p.disconnect?.();
    },

    async getAddress(): Promise<GetAddressResult> {
      return withNormalizedError(meta.id, async () => {
        const address = await provider().getPublicKey();
        return { address };
      });
    },

    async getNetwork(): Promise<GetNetworkResult> {
      return withNormalizedError(meta.id, async () => {
        const net = await provider().getNetwork();
        return { network: net.network, networkPassphrase: net.networkPassphrase };
      });
    },

    async signTransaction(xdr: string, opts?: SignTxOptions): Promise<SignTransactionResult> {
      return withNormalizedError(meta.id, async () => {
        const p = provider();
        const signedTxXdr = await p.signXDR(xdr, {
          publicKey: opts?.address,
          network: opts?.networkPassphrase,
        });
        const signerAddress = opts?.address ?? (await p.getPublicKey());
        return { signedTxXdr, signerAddress };
      });
    },

    async signAuthEntry(authEntryXdr: string, opts?: SignOptions): Promise<SignAuthEntryResult> {
      return withNormalizedError(meta.id, async () => {
        const p = provider();
        if (!p.signAuthEntry) {
          throw ConnectError.invalidRequest(
            'This version of the xBull extension does not support signing auth entries.',
            undefined,
            meta.id
          );
        }
        const signedAuthEntry = await p.signAuthEntry(authEntryXdr, {
          publicKey: opts?.address,
          network: opts?.networkPassphrase,
        });
        const signerAddress = opts?.address ?? (await p.getPublicKey());
        return { signedAuthEntry, signerAddress };
      });
    },

    async signMessage(message: string, opts?: SignOptions): Promise<SignMessageResult> {
      return withNormalizedError(meta.id, async () => {
        const p = provider();
        if (!p.signMessage) {
          throw ConnectError.invalidRequest(
            'This version of the xBull extension does not support message signing.',
            undefined,
            meta.id
          );
        }
        const signedMessage = await p.signMessage(message, { publicKey: opts?.address });
        const signerAddress = opts?.address ?? (await p.getPublicKey());
        return { signedMessage, signerAddress };
      });
    },
  };

  return connector;
}

/** Shape of the injected xBull provider. Narrow, and marked optional where a method's presence is version-dependent. */
interface XBullProvider {
  connect(): Promise<void>;
  disconnect?(): Promise<void>;
  getPublicKey(): Promise<string>;
  getNetwork(): Promise<{ network: string; networkPassphrase: string }>;
  signXDR(xdr: string, opts: { publicKey?: string; network?: string }): Promise<string>;
  signAuthEntry?(xdr: string, opts: { publicKey?: string; network?: string }): Promise<string>;
  signMessage?(message: string, opts: { publicKey?: string }): Promise<string>;
}
