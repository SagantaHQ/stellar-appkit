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
import { ConnectError, resolveNetworkPassphrase } from '../types.js';
import { withNormalizedError } from './error-utils.js';

/**
 * HOT Wallet connector — adapter for the HOT wallet browser extension.
 *
 * Uses the `@hot-wallet/sdk` npm package (v1.0.11), which provides a single
 * `HOT.request(method, params)` RPC bridge to the HOT wallet extension.
 *
 * HOT supports the full SEP-43 method set:
 * - stellar:getAddress
 * - stellar:signTransaction
 * - stellar:signAuthEntry
 * - stellar:signMessage
 *
 * @see https://hot-labs.org/wallet
 * @see https://github.com/Creit-Tech/Stellar-Wallets-Kit (hotwallet.module.ts)
 */

/** The HOT SDK's RPC bridge interface. */
interface HotSdk {
  request<T = unknown>(method: string, params: Record<string, unknown>): Promise<T>;
}

/** HOT Wallet's brand color — orange/red gradient.
 *  Pre-encoded base64 literal — see the note on RABET_ICON for why the SVG
 *  bytes are inlined rather than computed with `Buffer.from` at import time. */
const HOT_WALLET_ICON = `data:image/svg+xml;base64,PHN2ZyB2aWV3Qm94PSIwIDAgMTI4IDEyOCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KICAgIDxkZWZzPgogICAgICA8bGluZWFyR3JhZGllbnQgaWQ9ImhvdC1ncmFkIiB4MT0iMCIgeTE9IjAiIHgyPSIxIiB5Mj0iMSI+CiAgICAgICAgPHN0b3Agb2Zmc2V0PSIwJSIgc3RvcC1jb2xvcj0iI0ZGNkIzNSIvPgogICAgICAgIDxzdG9wIG9mZnNldD0iMTAwJSIgc3RvcC1jb2xvcj0iI0U4NDExOCIvPgogICAgICA8L2xpbmVhckdyYWRpZW50PgogICAgPC9kZWZzPgogICAgPHJlY3Qgd2lkdGg9IjEyOCIgaGVpZ2h0PSIxMjgiIHJ4PSIyOCIgZmlsbD0idXJsKCNob3QtZ3JhZCkiLz4KICAgIDx0ZXh0IHg9IjY0IiB5PSI5MCIgZm9udC1mYW1pbHk9IkFyaWFsLCBzYW5zLXNlcmlmIiBmb250LXNpemU9IjQ4IiBmb250LXdlaWdodD0iYm9sZCIgZmlsbD0iI2ZmZiIgdGV4dC1hbmNob3I9Im1pZGRsZSI+SE9UPC90ZXh0PgogIDwvc3ZnPg==`;

export function createHotWalletConnector(): WalletConnector {
  const meta: WalletMeta = {
    id: 'hot-wallet',
    name: 'HOT Wallet',
    icon: HOT_WALLET_ICON,
    installUrl: {
      chrome: 'https://chromewebstore.google.com/detail/hot-wallet/hgpfgebangngpcmkpjnnfcomcigjglen',
    },
    platforms: ['browser-extension'],
  };

  const capabilities: WalletCapabilities = {
    signTransaction: true,
    signAuthEntry: true,
    signMessage: true,
    submit: false,
  };

  /** Lazily imports the HOT SDK. */
  async function getHot(): Promise<HotSdk | null> {
    try {
      const mod = await import('@hot-wallet/sdk');
      return (mod as unknown as { HOT?: HotSdk }).HOT ?? null;
    } catch {
      return null;
    }
  }

  const connector: WalletConnector = {
    id: meta.id,
    meta,
    capabilities,

    async getReachability() {
      // HOT SDK is always importable — the bridge communicates with the
      // extension via postMessage. If the extension isn't installed, the
      // first request will fail. We report 'available' so the wallet appears
      // in the picker (same as SWK's approach).
      return 'available';
    },

    async connect(_opts?: ConnectOptions): Promise<WalletAccount> {
      return withNormalizedError(meta.id, async () => {
        const hot = await getHot();
        if (!hot) {
          throw ConnectError.invalidRequest('HOT Wallet SDK is not available.', undefined, meta.id);
        }
        const result = await hot.request<{ address: string }>('stellar:getAddress', {});
        if (!result.address) {
          throw ConnectError.internal('HOT Wallet returned no address.', undefined, meta.id);
        }
        return { address: result.address, walletId: meta.id };
      });
    },

    async disconnect(): Promise<void> {
      // HOT has no disconnect method — no persistent connection.
    },

    async getAddress(): Promise<GetAddressResult> {
      try {
        const hot = await getHot();
        if (!hot) return { address: '' };
        const result = await hot.request<{ address: string }>('stellar:getAddress', {});
        return { address: result.address };
      } catch {
        return { address: '' };
      }
    },

    async getNetwork(): Promise<GetNetworkResult> {
      // HOT is mainnet-only in this integration (matches SWK)
      return {
        network: 'mainnet',
        networkPassphrase: resolveNetworkPassphrase('PUBLIC') ?? '',
      };
    },

    async signTransaction(xdr: string, signOpts?: SignTxOptions): Promise<SignTransactionResult> {
      return withNormalizedError(meta.id, async () => {
        const hot = await getHot();
        if (!hot) {
          throw ConnectError.invalidRequest('HOT Wallet SDK is not available.', undefined, meta.id);
        }
        const result = await hot.request<{ signedTxXdr: string; signerAddress?: string }>(
          'stellar:signTransaction',
          { xdr, accountToSign: signOpts?.address },
        );
        if (!result.signedTxXdr) {
          throw ConnectError.internal('HOT Wallet returned no signed XDR.', undefined, meta.id);
        }
        return {
          signedTxXdr: result.signedTxXdr,
          signerAddress: result.signerAddress ?? signOpts?.address ?? '',
        };
      });
    },

    async signAuthEntry(authEntryXdr: string, signOpts?: SignOptions): Promise<SignAuthEntryResult> {
      return withNormalizedError(meta.id, async () => {
        const hot = await getHot();
        if (!hot) {
          throw ConnectError.invalidRequest('HOT Wallet SDK is not available.', undefined, meta.id);
        }
        const result = await hot.request<{ signedAuthEntry: string; signerAddress?: string }>(
          'stellar:signAuthEntry',
          { authEntry: authEntryXdr, accountToSign: signOpts?.address },
        );
        if (!result.signedAuthEntry) {
          throw ConnectError.internal('HOT Wallet returned no signed auth entry.', undefined, meta.id);
        }
        return {
          signedAuthEntry: result.signedAuthEntry,
          signerAddress: result.signerAddress ?? signOpts?.address ?? '',
        };
      });
    },

    async signMessage(message: string, signOpts?: SignOptions): Promise<SignMessageResult> {
      return withNormalizedError(meta.id, async () => {
        const hot = await getHot();
        if (!hot) {
          throw ConnectError.invalidRequest('HOT Wallet SDK is not available.', undefined, meta.id);
        }
        const result = await hot.request<{ signedMessage: string; signerAddress?: string }>(
          'stellar:signMessage',
          { message, accountToSign: signOpts?.address },
        );
        if (!result.signedMessage) {
          throw ConnectError.internal('HOT Wallet returned no signed message.', undefined, meta.id);
        }
        return {
          signedMessage: result.signedMessage,
          signerAddress: result.signerAddress ?? signOpts?.address ?? '',
          signedData: Buffer.from(message, 'utf-8').toString('base64'),
        };
      });
    },
  };

  return connector;
}
