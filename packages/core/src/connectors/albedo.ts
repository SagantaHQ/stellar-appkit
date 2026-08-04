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
 * Adapter for Albedo (`@albedo-link/intent`) — a popup/redirect-based
 * signer with no extension to install, so it's always "available" and is a
 * good default first option in the wallet list for users without a wallet
 * yet.
 *
 * Albedo does not expose a Soroban auth-entry intent as of this writing —
 * `signAuthEntry` is reported as unsupported via capabilities rather than
 * silently failing, so the Soroban layer can route auth-entry signing to a
 * different connector when Albedo is the active wallet.
 */
export function createAlbedoConnector(): WalletConnector {
  const meta: WalletMeta = {
    id: 'albedo',
    name: 'Albedo',
    icon: 'https://albedo.link/img/logo-icon.svg',
    platforms: ['web'],
  };

  const capabilities: WalletCapabilities = {
    signTransaction: true,
    signAuthEntry: false,
    signMessage: true,
    submit: true, // albedo.tx() accepts a `submit` flag and can submit directly
  };

  let lastKnownAddress: string | null = null;

  async function sdk() {
    return (await import('@albedo-link/intent')).default;
  }

  const connector: WalletConnector = {
    id: meta.id,
    meta,
    capabilities,

    async getReachability() {
      // No install required — Albedo runs as a popup. Only unavailable in
      // environments that can't open popups (e.g. some RN webviews), which
      // is reflected by excluding 'react-native' from `platforms` above.
      return typeof window !== 'undefined' ? 'available' : 'unavailable';
    },

    async connect(_opts?: ConnectOptions): Promise<WalletAccount> {
      return withNormalizedError(meta.id, async () => {
        const albedo = await sdk();
        const res = await albedo.publicKey({});
        lastKnownAddress = res.pubkey;
        return { address: res.pubkey, walletId: meta.id };
      });
    },

    async disconnect() {
      lastKnownAddress = null;
    },

    async getAddress(): Promise<GetAddressResult> {
      return withNormalizedError(meta.id, async () => {
        if (lastKnownAddress) return { address: lastKnownAddress };
        const albedo = await sdk();
        const res = await albedo.publicKey({});
        lastKnownAddress = res.pubkey;
        return { address: res.pubkey };
      });
    },

    async getNetwork(): Promise<GetNetworkResult> {
      // Albedo is network-agnostic per call (network is passed per intent),
      // so there's no persistent "current network" to query — the app's
      // configured network is treated as the source of truth instead.
      throw ConnectError.invalidRequest(
        'Albedo does not expose a persistent network — pass networkPassphrase explicitly on each call.',
        undefined,
        meta.id
      );
    },

    async signTransaction(xdr: string, opts?: SignTxOptions): Promise<SignTransactionResult> {
      return withNormalizedError(meta.id, async () => {
        const albedo = await sdk();
        const signerAddress = opts?.address ?? lastKnownAddress ?? undefined;
        const res = await albedo.tx({
          xdr,
          network: passphraseToAlbedoNetwork(opts?.networkPassphrase),
          pubkey: signerAddress,
          submit: opts?.submit ?? false,
        });
        // The tx intent doesn't echo the signer's pubkey back — it's implied
        // by whichever account the user picked when the popup was open, so
        // we surface the address we asked for (or the last known one) as the signer.
        if (!signerAddress) {
          throw ConnectError.internal(
            'Could not determine the signer address for this Albedo transaction — call connect() first.',
            undefined,
            meta.id
          );
        }
        return { signedTxXdr: res.signed_envelope_xdr, signerAddress };
      });
    },

    async signAuthEntry(): Promise<SignAuthEntryResult> {
      throw ConnectError.invalidRequest(
        'Albedo does not support signing Soroban auth entries. Prompt the user to choose a different wallet for this action.',
        undefined,
        meta.id
      );
    },

    async signMessage(message: string, opts?: SignOptions): Promise<SignMessageResult> {
      return withNormalizedError(meta.id, async () => {
        const albedo = await sdk();
        const res = await albedo.signMessage({
          message,
          pubkey: opts?.address ?? lastKnownAddress ?? undefined,
        });
        return { signedMessage: res.message_signature, signerAddress: res.pubkey };
      });
    },
  };

  return connector;
}

function passphraseToAlbedoNetwork(networkPassphrase?: string): 'public' | 'testnet' | undefined {
  if (!networkPassphrase) return undefined;
  return networkPassphrase.toLowerCase().includes('test') ? 'testnet' : 'public';
}
