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
import { withNormalizedError, unwrapResult } from './error-utils.js';

/**
 * Adapter for the Freighter browser extension via the official
 * `@stellar/freighter-api` package. That package's shape is already close
 * to SEP-43 (getAddress/signTransaction/signMessage/getNetworkDetails), so
 * this adapter is mostly a thin re-mapping rather than a shim.
 *
 * `@stellar/freighter-api` is a peer dependency — install it in the host
 * app, this file imports it lazily so `core` has no hard dependency on it.
 */
export function createFreighterConnector(): WalletConnector {
  const meta: WalletMeta = {
    id: 'freighter',
    name: 'Freighter',
    icon: 'https://raw.githubusercontent.com/stellar/freighter/master/extension/src/popup/assets/images/logo.svg',
    installUrl: {
      chrome: 'https://chromewebstore.google.com/detail/freighter/bcacfldlkkdogcmkkibnjlakofdplcbk',
      firefox: 'https://addons.mozilla.org/en-US/firefox/addon/freighter/',
      ios: 'https://apps.apple.com/app/freighter-wallet/id6449227687',
      android: 'https://play.google.com/store/apps/details?id=org.stellar.freighter',
    },
    platforms: ['browser-extension', 'web'],
  };

  const capabilities: WalletCapabilities = {
    signTransaction: true,
    signAuthEntry: true,
    signMessage: true,
    submit: false,
  };

  async function sdk() {
    // Lazily imported so bundlers don't pull this into apps that don't use Freighter.
    return import('@stellar/freighter-api');
  }

  const connector: WalletConnector = {
    id: meta.id,
    meta,
    capabilities,

    async getReachability() {
      try {
        const { isConnected } = await sdk();
        const res = await isConnected();
        const installed = !('error' in res) || !res.error;
        // freighter-api's isConnected() reflects "extension installed", not
        // "unlocked" — it doesn't expose a distinct lock-state check, so we
        // can't honestly report 'locked' here without a real signal for it.
        return installed ? 'available' : 'not-installed';
      } catch {
        return 'not-installed';
      }
    },

    async connect(_opts?: ConnectOptions): Promise<WalletAccount> {
      return withNormalizedError(meta.id, async () => {
        const { setAllowed, getAddress } = await sdk();
        await setAllowed();
        const res = unwrapResult(meta.id, await getAddress());
        if (!res.address) throw ConnectError.internal('Freighter returned no address.', undefined, meta.id);
        return { address: res.address, walletId: meta.id };
      });
    },

    async disconnect() {
      // Freighter has no programmatic "revoke" call — disconnect is app-side session clearing.
      return;
    },

    async getAddress(): Promise<GetAddressResult> {
      return withNormalizedError(meta.id, async () => {
        const { getAddress } = await sdk();
        return unwrapResult(meta.id, await getAddress());
      });
    },

    async getNetwork(): Promise<GetNetworkResult> {
      return withNormalizedError(meta.id, async () => {
        const { getNetworkDetails } = await sdk();
        const res = unwrapResult(meta.id, await getNetworkDetails());
        return { network: res.network, networkPassphrase: res.networkPassphrase };
      });
    },

    async signTransaction(xdr: string, opts?: SignTxOptions): Promise<SignTransactionResult> {
      return withNormalizedError(meta.id, async () => {
        const { signTransaction } = await sdk();
        const res = unwrapResult(
          meta.id,
          await signTransaction(xdr, {
            networkPassphrase: opts?.networkPassphrase,
            address: opts?.address,
          })
        );
        return { signedTxXdr: res.signedTxXdr, signerAddress: res.signerAddress };
      });
    },

    async signAuthEntry(authEntryXdr: string, opts?: SignOptions): Promise<SignAuthEntryResult> {
      return withNormalizedError(meta.id, async () => {
        const { signAuthEntry } = await sdk();
        const res = unwrapResult(
          meta.id,
          await signAuthEntry(authEntryXdr, {
            networkPassphrase: opts?.networkPassphrase,
            address: opts?.address,
          })
        );
        // freighter-api returns the signed entry as a raw Buffer (or null on
        // some versions/error paths) rather than a pre-encoded string.
        if (!res.signedAuthEntry) {
          throw ConnectError.internal('Freighter returned an empty signed auth entry.', undefined, meta.id);
        }
        return {
          signedAuthEntry: bufferLikeToBase64(res.signedAuthEntry),
          signerAddress: res.signerAddress,
        };
      });
    },

    async signMessage(message: string, opts?: SignOptions): Promise<SignMessageResult> {
      return withNormalizedError(meta.id, async () => {
        const { signMessage } = await sdk();
        const res = unwrapResult(
          meta.id,
          await signMessage(message, {
            networkPassphrase: opts?.networkPassphrase,
            address: opts?.address,
          })
        );
        // Freighter has shipped two response shapes across versions: an
        // older one returning a raw Buffer (nullable), and a newer one
        // returning an already-encoded string. Normalize both to a string.
        if (!res.signedMessage) {
          throw ConnectError.internal('Freighter returned an empty signed message.', undefined, meta.id);
        }
        return {
          signedMessage: bufferLikeToBase64(res.signedMessage),
          signerAddress: res.signerAddress,
        };
      });
    },
  };

  return connector;
}

/** Freighter's signAuthEntry/signMessage have returned either a raw Buffer or an already-encoded string across versions — normalize both to base64. */
function bufferLikeToBase64(value: string | { toString(encoding: 'base64'): string }): string {
  return typeof value === 'string' ? value : value.toString('base64');
}
