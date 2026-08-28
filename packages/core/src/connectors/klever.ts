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
 * Klever Wallet connector — browser extension adapter.
 *
 * Klever injects `window.kleverWallet.stellar` with a SEP-43-shaped API.
 * No npm SDK dependency — the connector talks directly to the injected
 * object. This matches the Stellar Wallets Kit approach:
 * https://github.com/Creit-Tech/Stellar-Wallets-Kit
 *
 * Supported methods (all SEP-43):
 * - getAddress() → { address }
 * - signTransaction(xdr, opts) → { signedTxXdr, signerAddress? }
 * - signAuthEntry(authEntry, opts) → { signedAuthEntry, signerAddress? }
 * - signMessage(message, opts) → { signedMessage, signerAddress? }
 * - getNetwork() → { network, networkPassphrase }
 *
 * @see https://klever.io/
 */

/** The shape of `window.kleverWallet.stellar` injected by the Klever extension. */
interface KleverStellarApi {
  getAddress(): Promise<{ address: string }>;
  signTransaction(
    xdr: string,
    opts?: { networkPassphrase?: string; address?: string; path?: string },
  ): Promise<{ signedTxXdr: string; signerAddress?: string }>;
  signAuthEntry(
    authEntry: string,
    opts?: { networkPassphrase?: string; address?: string; path?: string },
  ): Promise<{ signedAuthEntry: string; signerAddress?: string }>;
  signMessage(
    message: string,
    opts?: { address?: string },
  ): Promise<{ signedMessage: string; signerAddress?: string }>;
  getNetwork(): Promise<{ network: string; networkPassphrase: string }>;
}

/** Klever's brand color — blue gradient.
 *  Pre-encoded base64 literal — see the note on RABET_ICON for why the SVG
 *  bytes are inlined rather than computed with `Buffer.from` at import time. */
const KLEVER_ICON = `data:image/svg+xml;base64,PHN2ZyB2aWV3Qm94PSIwIDAgMTI4IDEyOCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KICAgIDxkZWZzPgogICAgICA8bGluZWFyR3JhZGllbnQgaWQ9ImtsZXZlci1ncmFkIiB4MT0iMCIgeTE9IjAiIHgyPSIxIiB5Mj0iMSI+CiAgICAgICAgPHN0b3Agb2Zmc2V0PSIwJSIgc3RvcC1jb2xvcj0iIzAwNjZGRiIvPgogICAgICAgIDxzdG9wIG9mZnNldD0iMTAwJSIgc3RvcC1jb2xvcj0iIzAwNDRDQyIvPgogICAgICA8L2xpbmVhckdyYWRpZW50PgogICAgPC9kZWZzPgogICAgPHJlY3Qgd2lkdGg9IjEyOCIgaGVpZ2h0PSIxMjgiIHJ4PSIyOCIgZmlsbD0idXJsKCNrbGV2ZXItZ3JhZCkiLz4KICAgIDx0ZXh0IHg9IjY0IiB5PSI4OCIgZm9udC1mYW1pbHk9IkFyaWFsLCBzYW5zLXNlcmlmIiBmb250LXNpemU9IjU2IiBmb250LXdlaWdodD0iYm9sZCIgZmlsbD0iI2ZmZiIgdGV4dC1hbmNob3I9Im1pZGRsZSI+SzwvdGV4dD4KICA8L3N2Zz4=`;

export function createKleverConnector(): WalletConnector {
  const meta: WalletMeta = {
    id: 'klever',
    name: 'Klever Wallet',
    icon: KLEVER_ICON,
    installUrl: {
      chrome: 'https://chromewebstore.google.com/detail/klever-wallet/dmbhmpbmpcijplojmbcnmkfgejocaoap',
    },
    platforms: ['browser-extension'],
  };

  const capabilities: WalletCapabilities = {
    signTransaction: true,
    signAuthEntry: true,
    signMessage: true,
    submit: false,
  };

  /** Gets the Klever Stellar API from window, or null if not installed. */
  function getKlever(): KleverStellarApi | null {
    if (typeof window === 'undefined') return null;
    const kw = (window as unknown as { kleverWallet?: { stellar?: KleverStellarApi } }).kleverWallet;
    return kw?.stellar ?? null;
  }

  const connector: WalletConnector = {
    id: meta.id,
    meta,
    capabilities,

    async getReachability() {
      const klever = getKlever();
      if (!klever) return 'not-installed';
      return 'available';
    },

    async connect(_opts?: ConnectOptions): Promise<WalletAccount> {
      return withNormalizedError(meta.id, async () => {
        const klever = getKlever();
        if (!klever) {
          throw ConnectError.invalidRequest('Klever Wallet is not installed.', undefined, meta.id);
        }
        const result = await klever.getAddress();
        if (!result.address) {
          throw ConnectError.internal('Klever returned no address.', undefined, meta.id);
        }
        return { address: result.address, walletId: meta.id };
      });
    },

    async disconnect(): Promise<void> {
      // Klever has no disconnect method — no persistent connection to clean up.
    },

    async getAddress(): Promise<GetAddressResult> {
      const klever = getKlever();
      if (!klever) return { address: '' };
      try {
        const result = await klever.getAddress();
        return { address: result.address };
      } catch {
        return { address: '' };
      }
    },

    async getNetwork(): Promise<GetNetworkResult> {
      const klever = getKlever();
      if (!klever) return { network: '', networkPassphrase: '' };
      try {
        return await klever.getNetwork();
      } catch {
        return { network: '', networkPassphrase: '' };
      }
    },

    async signTransaction(xdr: string, signOpts?: SignTxOptions): Promise<SignTransactionResult> {
      return withNormalizedError(meta.id, async () => {
        const klever = getKlever();
        if (!klever) {
          throw ConnectError.invalidRequest('Klever Wallet is not installed.', undefined, meta.id);
        }
        const result = await klever.signTransaction(xdr, {
          networkPassphrase: signOpts?.networkPassphrase,
          address: signOpts?.address,
        });
        if (!result.signedTxXdr) {
          throw ConnectError.internal('Klever returned no signed XDR.', undefined, meta.id);
        }
        return {
          signedTxXdr: result.signedTxXdr,
          signerAddress: result.signerAddress ?? signOpts?.address ?? '',
        };
      });
    },

    async signAuthEntry(authEntryXdr: string, signOpts?: SignOptions): Promise<SignAuthEntryResult> {
      return withNormalizedError(meta.id, async () => {
        const klever = getKlever();
        if (!klever) {
          throw ConnectError.invalidRequest('Klever Wallet is not installed.', undefined, meta.id);
        }
        const result = await klever.signAuthEntry(authEntryXdr, {
          networkPassphrase: signOpts?.networkPassphrase,
          address: signOpts?.address,
        });
        if (!result.signedAuthEntry) {
          throw ConnectError.internal('Klever returned no signed auth entry.', undefined, meta.id);
        }
        return {
          signedAuthEntry: result.signedAuthEntry,
          signerAddress: result.signerAddress ?? signOpts?.address ?? '',
        };
      });
    },

    async signMessage(message: string, signOpts?: SignOptions): Promise<SignMessageResult> {
      return withNormalizedError(meta.id, async () => {
        const klever = getKlever();
        if (!klever) {
          throw ConnectError.invalidRequest('Klever Wallet is not installed.', undefined, meta.id);
        }
        const result = await klever.signMessage(message, {
          address: signOpts?.address,
        });
        if (!result.signedMessage) {
          throw ConnectError.internal('Klever returned no signed message.', undefined, meta.id);
        }
        return {
          signedMessage: result.signedMessage,
          signerAddress: result.signerAddress ?? signOpts?.address ?? '',
          // Klever's signMessage returns the signature as a string.
          // We surface signedData as base64 of the raw message bytes for
          // the multi-candidate SIWS verifier (same as xBull's approach).
          signedData: Buffer.from(message, 'utf-8').toString('base64'),
        };
      });
    },
  };

  return connector;
}
