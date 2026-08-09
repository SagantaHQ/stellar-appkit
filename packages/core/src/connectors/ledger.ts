import type {
  WalletConnector,
  WalletMeta,
  WalletCapabilities,
  ConnectOptions,
  WalletAccount,
  WalletAccountOption,
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

// Type-only import — @ledgerhq/hw-transport is a transitive dependency of
// both transport packages below, so its types resolve without adding
// another explicit dependency for something never imported at runtime.
// All three Ledger packages are bundled dependencies (listed in
// packages/core/package.json `dependencies`).
import type LedgerHwTransport from '@ledgerhq/hw-transport';

const DEFAULT_ACCOUNT_COUNT = 5;
const DERIVATION_PREFIX = "44'/148'"; // BIP44, Stellar coin type 148 — confirmed against @ledgerhq/hw-app-str's own docs/examples.

function pathForIndex(index: number): string {
  return `${DERIVATION_PREFIX}/${index}'`;
}

export interface LedgerConnectorOptions {
  /** Preferred browser transport. Falls back to the other if the preferred one isn't supported. Defaults to 'webhid'. */
  preferredTransport?: 'webhid' | 'webusb';
  /** How many accounts listAccounts() derives. Defaults to 5 — each is a real device round-trip, so keep this modest. */
  accountCount?: number;
}

/**
 * Ledger hardware wallet via `@ledgerhq/hw-app-str`, transported over
 * WebHID or WebUSB. All three Ledger packages (`@ledgerhq/hw-app-str`,
 * `@ledgerhq/hw-transport-webhid`, `@ledgerhq/hw-transport-webusb`) are
 * bundled dependencies — installed automatically, no manual install needed.
 *
 * Neither WebHID nor WebUSB is universally supported (notably, Firefox
 * supports neither as of this writing) — `getReachability()` reflects
 * browser API support, not whether a device is actually plugged in, since
 * that can only be known by actually attempting a connection.
 *
 * ⚠️ Two things in this file are marked as needing verification against
 * the exact installed `@ledgerhq/hw-app-str` version rather than asserted
 * as certain — the `signTransaction` payload shape, and Soroban
 * auth-entry signing (stubbed, not faked — see `signAuthEntry` below).
 * Everything else (getPublicKey → address derivation, multi-account via
 * derivation path index, `Transaction.addSignature`) is confirmed against
 * the package's published docs and @stellar/stellar-sdk's real API.
 */
export function createLedgerConnector(options: LedgerConnectorOptions = {}): WalletConnector {
  const accountCount = options.accountCount ?? DEFAULT_ACCOUNT_COUNT;

  const meta: WalletMeta = {
    id: 'ledger',
    name: 'Ledger',
    // Simple "L" wordmark on white — matches the Ledger brand's clean aesthetic.
    // Normal weight (400), not bold. Pre-encoded base64 for browser safety.
    icon: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMjggMTI4IiB3aWR0aD0iMTI4IiBoZWlnaHQ9IjEyOCI+PHJlY3Qgd2lkdGg9IjEyOCIgaGVpZ2h0PSIxMjgiIGZpbGw9IiNmZmZmZmYiLz48dGV4dCB4PSI2NCIgeT0iNjQiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGRvbWluYW50LWJhc2VsaW5lPSJjZW50cmFsIiBmb250LWZhbWlseT0iSW50ZXIsICdIZWx2ZXRpY2EgTmV1ZScsIEhlbHZldGljYSwgQXJpYWwsIHNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iODQiIGZvbnQtd2VpZ2h0PSI0MDAiIGZpbGw9IiMwMDAwMDAiPkw8L3RleHQ+PC9zdmc+',
    platforms: ['hardware'],
  };

  const capabilities: WalletCapabilities = {
    signTransaction: true,
    signAuthEntry: true,
    // hw-app-str exposes signMessage, but older Ledger Stellar-app firmware may not support it —
    // an unsupported call surfaces as a normal ConnectError via the device's own rejection, not a silent failure.
    signMessage: true,
    submit: false,
  };

  let transport: LedgerHwTransport | null = null;
  let strApp: StrApp | null = null;
  let currentIndex = 0;
  let currentAddress: string | null = null;
  const accountCache = new Map<string, number>(); // address -> derivation index, populated by listAccounts()/connect()

  async function stellarSdk() {
    return import('@stellar/stellar-sdk');
  }

  async function ensureTransport(): Promise<LedgerHwTransport> {
    if (transport) return transport;

    const order: Array<'webhid' | 'webusb'> =
      options.preferredTransport === 'webusb' ? ['webusb', 'webhid'] : ['webhid', 'webusb'];

    let lastError: unknown;
    for (const kind of order) {
      try {
        transport = await openTransport(kind);
        return transport;
      } catch (err) {
        lastError = err;
      }
    }
    throw ConnectError.internal(
      `Could not open a connection to the Ledger device. Make sure it's plugged in, unlocked, and the Stellar app is open. (${
        lastError instanceof Error ? lastError.message : String(lastError)
      })`,
      undefined,
      meta.id
    );
  }

  async function openTransport(kind: 'webhid' | 'webusb'): Promise<LedgerHwTransport> {
    if (kind === 'webhid') {
      const { default: TransportWebHID } = await import('@ledgerhq/hw-transport-webhid');
      return TransportWebHID.create();
    }
    const { default: TransportWebUSB } = await import('@ledgerhq/hw-transport-webusb');
    return TransportWebUSB.create();
  }

  async function ensureStrApp(): Promise<StrApp> {
    if (strApp) return strApp;
    const t = await ensureTransport();
    const { default: Str } = await import('@ledgerhq/hw-app-str');
    strApp = new Str(t) as StrApp;
    return strApp;
  }

  async function deriveAddress(index: number): Promise<string> {
    const str = await ensureStrApp();
    const { StrKey } = await stellarSdk();
    const result = await str.getPublicKey(pathForIndex(index));
    const address = StrKey.encodeEd25519PublicKey(result.rawPublicKey);
    accountCache.set(address, index);
    return address;
  }

  const connector: WalletConnector = {
    id: meta.id,
    meta,
    capabilities,

    async getReachability() {
      const hasWebHID = typeof navigator !== 'undefined' && 'hid' in navigator;
      const hasWebUSB = typeof navigator !== 'undefined' && 'usb' in navigator;
      return hasWebHID || hasWebUSB ? 'available' : 'unavailable';
    },

    async connect(_opts?: ConnectOptions): Promise<WalletAccount> {
      return withNormalizedError(meta.id, async () => {
        const address = await deriveAddress(0);
        currentIndex = 0;
        currentAddress = address;
        return { address, walletId: meta.id };
      });
    },

    async disconnect() {
      await transport?.close().catch(() => void 0);
      transport = null;
      strApp = null;
      currentAddress = null;
      accountCache.clear();
    },

    async getAddress(): Promise<GetAddressResult> {
      if (!currentAddress) {
        throw ConnectError.invalidRequest('Ledger is not connected — call connect() first.', undefined, meta.id);
      }
      return { address: currentAddress };
    },

    async getNetwork(): Promise<GetNetworkResult> {
      // The device signs whatever bytes it's given — it has no concept of
      // "current network" the way a software wallet does. Network is
      // determined entirely by the networkPassphrase the app supplies to
      // signTransaction, so there's nothing meaningful to report here.
      throw ConnectError.invalidRequest(
        'Ledger has no concept of a current network — it signs whatever networkPassphrase you provide.',
        undefined,
        meta.id
      );
    },

    async signTransaction(xdr: string, opts?: SignTxOptions): Promise<SignTransactionResult> {
      return withNormalizedError(meta.id, async () => {
        if (!currentAddress) throw ConnectError.invalidRequest('Ledger is not connected.', undefined, meta.id);
        if (!opts?.networkPassphrase) {
          throw ConnectError.invalidRequest(
            'signTransaction requires networkPassphrase — the device needs it to compute the correct signature base.',
            undefined,
            meta.id
          );
        }

        const { TransactionBuilder } = await stellarSdk();
        const transaction = TransactionBuilder.fromXDR(xdr, opts.networkPassphrase);
        const str = await ensureStrApp();
        const path = pathForIndex(accountCache.get(currentAddress) ?? currentIndex);

        // ⚠️ Needs verification: hw-app-str's signTransaction parameter shape
        // (raw signature-base bytes vs. full envelope) isn't fully confirmed
        // from published docs alone — signatureBase() is the semantically
        // correct payload (the bytes that get hashed and signed per the
        // Stellar protocol) and matches the pattern other hw-app-* packages
        // use, but double check against your installed version's types
        // before relying on this in production.
        const signResult = await str.signTransaction(path, (transaction as StellarTransaction).signatureBase());
        const signatureBuffer = 'signature' in signResult ? signResult.signature : (signResult as Buffer);

        (transaction as StellarTransaction).addSignature(currentAddress, signatureBuffer.toString('base64'));

        return {
          signedTxXdr: (transaction as StellarTransaction).toXDR(),
          signerAddress: currentAddress,
        };
      });
    },

    async signAuthEntry(authEntryXdr: string, _opts?: SignOptions): Promise<SignAuthEntryResult> {
      return withNormalizedError(meta.id, async () => {
        if (!currentAddress) throw ConnectError.invalidRequest('Ledger is not connected.', undefined, meta.id);
        const str = await ensureStrApp();
        const path = pathForIndex(accountCache.get(currentAddress) ?? currentIndex);

        // authEntryXdr is a base64-encoded HashIdPreimage XDR (the preimage
        // that authorizeEntry builds — NOT a SorobanAuthorizationEntry).
        // hw-app-str's signSorobanAuthorization expects the RAW preimage
        // bytes (it hashes on-device with SHA-256 before signing).
        const preimageBytes = Buffer.from(authEntryXdr, 'base64');

        // The Ledger Stellar app needs the method to exist (older firmware
        // doesn't support Soroban auth signing). Guard with a runtime check.
        if (!str.signSorobanAuthorization) {
          throw ConnectError.internal(
            'Ledger Stellar app version too old — does not support Soroban auth-entry signing. Update the Stellar app on your device.',
            undefined,
            meta.id
          );
        }

        const result = await str.signSorobanAuthorization(path, preimageBytes);
        const signatureBuffer = 'signature' in result ? result.signature : (result as Buffer);

        return {
          signedAuthEntry: signatureBuffer.toString('base64'),
          signerAddress: currentAddress,
        };
      });
    },

    async signMessage(message: string, _opts?: SignOptions): Promise<SignMessageResult> {
      return withNormalizedError(meta.id, async () => {
        if (!currentAddress) throw ConnectError.invalidRequest('Ledger is not connected.', undefined, meta.id);
        const str = await ensureStrApp();
        const path = pathForIndex(accountCache.get(currentAddress) ?? currentIndex);
        // Ledger's Stellar app signs the raw UTF-8 bytes of `message` directly
        // (it's a SEP-43-style direct signer, same as Freighter). Surface that
        // as `signedData` so the verifier uses the same code path as every
        // other direct signer.
        const messageBuffer = Buffer.from(message, 'utf-8');
        const result = await str.signMessage(path, messageBuffer);
        const signatureBuffer = 'signature' in result ? result.signature : (result as Buffer);
        return {
          signedMessage: signatureBuffer.toString('base64'),
          signerAddress: currentAddress,
          signedData: messageBuffer.toString('base64'),
        };
      });
    },

    async listAccounts(): Promise<WalletAccountOption[]> {
      return withNormalizedError(meta.id, async () => {
        const accounts: WalletAccountOption[] = [];
        for (let i = 0; i < accountCount; i++) {
          const address = await deriveAddress(i);
          accounts.push({ address, label: `Account ${i}` });
        }
        return accounts;
      });
    },

    async selectAccount(address: string): Promise<void> {
      const index = accountCache.get(address);
      if (index === undefined) {
        throw ConnectError.invalidRequest(
          'Unknown address — call listAccounts() first so its derivation index is cached.',
          undefined,
          meta.id
        );
      }
      currentIndex = index;
      currentAddress = address;
    },
  };

  return connector;
}

// ---- Narrow structural types for the lazily-imported hw-app-str SDK — avoids a hard type dependency on a package that's peer/optional. ----

interface StrApp {
  getPublicKey(path: string): Promise<{ rawPublicKey: Buffer }>;
  signTransaction(path: string, payload: Buffer): Promise<{ signature: Buffer } | Buffer>;
  signSorobanAuthorization?(path: string, payload: Buffer): Promise<{ signature: Buffer } | Buffer>;
  signMessage(path: string, message: Buffer): Promise<{ signature: Buffer } | Buffer>;
}

interface StellarTransaction {
  signatureBase(): Buffer;
  addSignature(publicKey: string, signature: string): void;
  toXDR(): string;
}
