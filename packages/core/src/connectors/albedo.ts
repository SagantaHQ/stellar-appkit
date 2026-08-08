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
    icon: 'data:image/svg+xml;base64,PHN2ZyB2aWV3Qm94PSIwIDAgMTI4IDEyOCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTI4IiBoZWlnaHQ9IjEyOCIgcng9IjI4IiBmaWxsPSIjMDA2NkIyIi8+PHBhdGggZD0iTTY0IDI2TDk2IDk4SDgyTDc1IDgwSDUzTDQ2IDk4SDMyTDY0IDI2Wk01OCA2OEg3MEw2NCA1Mkw1OCA2OFoiIGZpbGw9IiNmZmYiLz48L3N2Zz4=',
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
        // Albedo's popup can be closed by the user without resolving or
        // rejecting the promise — it just hangs forever. Add a timeout
        // so the modal doesn't stay in "connecting" state indefinitely.
        // 60 seconds is generous enough for a user to read and approve,
        // but short enough to recover from a forgotten popup.
        const timeoutMs = 60_000;
        const result = await Promise.race([
          albedo.publicKey({}),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Albedo connection timed out — the popup may have been closed.')), timeoutMs)
          ),
        ]);
        lastKnownAddress = result.pubkey;
        return { address: result.pubkey, walletId: meta.id };
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
        // Albedo does NOT sign the raw message bytes. Per its `signMessage`
        // intent, it returns:
        //   - `signed_message`: a HEX-encoded value derived from the pubkey
        //     and the original message (the bytes the wallet actually signed)
        //   - `message_signature`: a HEX-encoded ed25519 signature over
        //     `signed_message`'s bytes.
        //
        // The previous version of this connector returned only
        // `message_signature` and threw away `signed_message`, which made
        // server-side signature verification impossible without calling
        // Albedo's intent again on the server (you can't recompute
        // `signed_message` — its derivation is opaque / server-side).
        //
        // We now surface `signed_message` as `signedData` (base64 of the
        // hex-decoded bytes), so `verifySiws` can verify the signature
        // against the bytes Albedo actually signed — the same code path
        // that handles Freighter/xBull/Ledger.
        if (!res.signed_message) {
          throw ConnectError.internal(
            'Albedo did not return a signed_message. The wallet may be on an older version — update Albedo and try again.',
            undefined,
            meta.id
          );
        }
        return {
          signedMessage: res.message_signature,
          signerAddress: res.pubkey,
          signedData: Buffer.from(res.signed_message, 'hex').toString('base64'),
        };
      });
    },
  };

  return connector;
}

function passphraseToAlbedoNetwork(networkPassphrase?: string): 'public' | 'testnet' | undefined {
  if (!networkPassphrase) return undefined;
  return networkPassphrase.toLowerCase().includes('test') ? 'testnet' : 'public';
}
