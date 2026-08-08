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
import { withNormalizedError, unwrapResult } from './error-utils.js';

/**
 * Rabet wallet connector — browser extension adapter.
 *
 * Rabet injects `window.rabet` with a simple API:
 * - `rabet.connect()` → `{ publicKey, error? }`
 * - `rabet.sign(xdr, network)` → `{ xdr, error? }` (transaction signing only)
 * - `rabet.disconnect()` → disconnect
 * - `rabet.isUnlocked()` → `Promise<boolean>`
 * - `rabet.on('accountChanged', handler)` — event
 * - `rabet.on('networkChanged', handler)` — event
 *
 * Limitations:
 * - No `signMessage` — Rabet only supports transaction signing
 * - No `signAuthEntry` — Rabet doesn't support Soroban auth entry signing
 * - No `getNetwork` — network is passed to `sign()` as a parameter
 *
 * @see https://docs.rabet.io/
 */

/** The shape of the `window.rabet` object injected by the Rabet extension. */
interface RabetApi {
  connect(): Promise<{ publicKey: string; error?: string }>;
  sign(xdr: string, network: string): Promise<{ xdr: string; error?: string }>;
  disconnect(): Promise<void>;
  isUnlocked(): Promise<boolean>;
  close(): Promise<void>;
  on(event: 'accountChanged', handler: () => void): void;
  on(event: 'networkChanged', handler: (networkId: string) => void): void;
}

/** Rabet's official brand color — purple/violet gradient. */
const RABET_ICON = `data:image/svg+xml;base64,${Buffer.from(
  `<svg viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="rabet-grad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#7B2FBE"/>
        <stop offset="100%" stop-color="#4A1E73"/>
      </linearGradient>
    </defs>
    <rect width="128" height="128" rx="28" fill="url(#rabet-grad)"/>
    <path d="M64 28C50 28 38 38 38 52c0 8 4 14 10 18-8 4-14 12-14 22 0 2 2 4 4 4h52c2 0 4-2 4-4 0-10-6-18-14-22 6-4 10-10 10-18 0-14-12-24-26-24zm0 12c8 0 14 6 14 14 0 6-4 10-8 12-2 1-2 3 0 4 6 3 10 9 12 16H46c2-7 6-13 12-16 2-1 2-3 0-4-4-2-8-6-8-12 0-8 6-14 14-14z" fill="#fff"/>
  </svg>`
).toString('base64')}`;

export function createRabetConnector(): WalletConnector {
  const meta: WalletMeta = {
    id: 'rabet',
    name: 'Rabet',
    icon: RABET_ICON,
    installUrl: {
      chrome: 'https://chromewebstore.google.com/detail/rabet/rabaialbjkhegpmjljegngfdgfjgbgpb',
      firefox: 'https://addons.mozilla.org/en-US/firefox/addon/rabet/',
    },
    platforms: ['browser-extension'],
  };

  const capabilities: WalletCapabilities = {
    signTransaction: true,
    signAuthEntry: false, // Rabet does not support Soroban auth entry signing
    signMessage: false,   // Rabet does not support message signing
    submit: false,
  };

  /** Gets the Rabet API from window, or null if not installed. */
  function getRabet(): RabetApi | null {
    if (typeof window === 'undefined') return null;
    return (window as unknown as { rabet?: RabetApi }).rabet ?? null;
  }

  const connector: WalletConnector = {
    id: meta.id,
    meta,
    capabilities,

    async getReachability() {
      const rabet = getRabet();
      if (!rabet) return 'not-installed';
      try {
        const unlocked = await rabet.isUnlocked();
        return unlocked ? 'available' : 'locked';
      } catch {
        // isUnlocked may not be available in older versions — assume available
        // if the rabet object is present.
        return 'available';
      }
    },

    async connect(_opts?: ConnectOptions): Promise<WalletAccount> {
      return withNormalizedError(meta.id, async () => {
        const rabet = getRabet();
        if (!rabet) {
          throw ConnectError.invalidRequest('Rabet extension is not installed.', undefined, meta.id);
        }
        const result = await rabet.connect();
        if (result.error) {
          throw ConnectError.rejected(meta.id);
        }
        if (!result.publicKey) {
          throw ConnectError.internal('Rabet returned no public key.', undefined, meta.id);
        }
        return { address: result.publicKey, walletId: meta.id };
      });
    },

    async disconnect(): Promise<void> {
      const rabet = getRabet();
      if (rabet) {
        try { await rabet.disconnect(); } catch { /* ignore */ }
      }
    },

    async getAddress(): Promise<GetAddressResult> {
      const rabet = getRabet();
      if (!rabet) return { address: '' };
      try {
        const result = await rabet.connect();
        return { address: result.publicKey };
      } catch {
        return { address: '' };
      }
    },

    async getNetwork(): Promise<GetNetworkResult> {
      // Rabet doesn't expose a getNetwork method — return the app's configured
      // network. The actual network is passed to sign() as a parameter.
      return { network: 'PUBLIC', networkPassphrase: resolveNetworkPassphrase('PUBLIC') ?? '' };
    },

    async signTransaction(xdr: string, signOpts?: SignTxOptions): Promise<SignTransactionResult> {
      return withNormalizedError(meta.id, async () => {
        const rabet = getRabet();
        if (!rabet) {
          throw ConnectError.invalidRequest('Rabet extension is not installed.', undefined, meta.id);
        }
        // Rabet's sign() takes the network passphrase as the second argument
        const networkPassphrase = signOpts?.networkPassphrase ?? resolveNetworkPassphrase('PUBLIC') ?? '';
        const result = await rabet.sign(xdr, networkPassphrase);
        if (result.error) {
          throw ConnectError.internal(`Rabet sign error: ${result.error}`, undefined, meta.id);
        }
        if (!result.xdr) {
          throw ConnectError.internal('Rabet returned no signed XDR.', undefined, meta.id);
        }
        return {
          signedTxXdr: result.xdr,
          signerAddress: signOpts?.address ?? '',
        };
      });
    },

    async signAuthEntry(): Promise<SignAuthEntryResult> {
      throw ConnectError.invalidRequest(
        'Rabet does not support signing Soroban auth entries.',
        undefined,
        meta.id
      );
    },

    async signMessage(): Promise<SignMessageResult> {
      throw ConnectError.invalidRequest(
        'Rabet does not support message signing.',
        undefined,
        meta.id
      );
    },
  };

  return connector;
}
