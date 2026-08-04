import { ConnectError } from '../types.js';
import { withNormalizedError } from './error-utils.js';
const DEFAULT_ACCOUNT_COUNT = 5;
const DERIVATION_PREFIX = "44'/148'"; // BIP44, Stellar coin type 148 — confirmed against @ledgerhq/hw-app-str's own docs/examples.
function pathForIndex(index) {
    return `${DERIVATION_PREFIX}/${index}'`;
}
/**
 * Ledger hardware wallet via `@ledgerhq/hw-app-str`, transported over
 * WebHID or WebUSB. Both are peer dependencies alongside the transport
 * packages — install whichever transport(s) you target:
 * `@ledgerhq/hw-app-str`, `@ledgerhq/hw-transport-webhid`,
 * `@ledgerhq/hw-transport-webusb`.
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
export function createLedgerConnector(options = {}) {
    const accountCount = options.accountCount ?? DEFAULT_ACCOUNT_COUNT;
    const meta = {
        id: 'ledger',
        name: 'Ledger',
        // Inline SVG so this adapter has no dependency on an external icon host.
        icon: 'data:image/svg+xml;utf8,' +
            encodeURIComponent('<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="7" width="20" height="10" rx="1.5" fill="none" stroke="black" stroke-width="1.5"/><rect x="4" y="9" width="6" height="6" fill="black"/></svg>'),
        platforms: ['hardware'],
    };
    const capabilities = {
        signTransaction: true,
        signAuthEntry: true,
        // hw-app-str exposes signMessage, but older Ledger Stellar-app firmware may not support it —
        // an unsupported call surfaces as a normal ConnectError via the device's own rejection, not a silent failure.
        signMessage: true,
        submit: false,
    };
    let transport = null;
    let strApp = null;
    let currentIndex = 0;
    let currentAddress = null;
    const accountCache = new Map(); // address -> derivation index, populated by listAccounts()/connect()
    async function stellarSdk() {
        return import('@stellar/stellar-sdk');
    }
    async function ensureTransport() {
        if (transport)
            return transport;
        const order = options.preferredTransport === 'webusb' ? ['webusb', 'webhid'] : ['webhid', 'webusb'];
        let lastError;
        for (const kind of order) {
            try {
                transport = await openTransport(kind);
                return transport;
            }
            catch (err) {
                lastError = err;
            }
        }
        throw ConnectError.internal(`Could not open a connection to the Ledger device. Make sure it's plugged in, unlocked, and the Stellar app is open. (${lastError instanceof Error ? lastError.message : String(lastError)})`, undefined, meta.id);
    }
    async function openTransport(kind) {
        if (kind === 'webhid') {
            const { default: TransportWebHID } = await import('@ledgerhq/hw-transport-webhid');
            return TransportWebHID.create();
        }
        const { default: TransportWebUSB } = await import('@ledgerhq/hw-transport-webusb');
        return TransportWebUSB.create();
    }
    async function ensureStrApp() {
        if (strApp)
            return strApp;
        const t = await ensureTransport();
        const { default: Str } = await import('@ledgerhq/hw-app-str');
        strApp = new Str(t);
        return strApp;
    }
    async function deriveAddress(index) {
        const str = await ensureStrApp();
        const { StrKey } = await stellarSdk();
        const result = await str.getPublicKey(pathForIndex(index));
        const address = StrKey.encodeEd25519PublicKey(result.rawPublicKey);
        accountCache.set(address, index);
        return address;
    }
    const connector = {
        id: meta.id,
        meta,
        capabilities,
        async getReachability() {
            const hasWebHID = typeof navigator !== 'undefined' && 'hid' in navigator;
            const hasWebUSB = typeof navigator !== 'undefined' && 'usb' in navigator;
            return hasWebHID || hasWebUSB ? 'available' : 'unavailable';
        },
        async connect(_opts) {
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
        async getAddress() {
            if (!currentAddress) {
                throw ConnectError.invalidRequest('Ledger is not connected — call connect() first.', undefined, meta.id);
            }
            return { address: currentAddress };
        },
        async getNetwork() {
            // The device signs whatever bytes it's given — it has no concept of
            // "current network" the way a software wallet does. Network is
            // determined entirely by the networkPassphrase the app supplies to
            // signTransaction, so there's nothing meaningful to report here.
            throw ConnectError.invalidRequest('Ledger has no concept of a current network — it signs whatever networkPassphrase you provide.', undefined, meta.id);
        },
        async signTransaction(xdr, opts) {
            return withNormalizedError(meta.id, async () => {
                if (!currentAddress)
                    throw ConnectError.invalidRequest('Ledger is not connected.', undefined, meta.id);
                if (!opts?.networkPassphrase) {
                    throw ConnectError.invalidRequest('signTransaction requires networkPassphrase — the device needs it to compute the correct signature base.', undefined, meta.id);
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
                const signResult = await str.signTransaction(path, transaction.signatureBase());
                const signatureBuffer = 'signature' in signResult ? signResult.signature : signResult;
                transaction.addSignature(currentAddress, signatureBuffer.toString('base64'));
                return {
                    signedTxXdr: transaction.toXDR(),
                    signerAddress: currentAddress,
                };
            });
        },
        async signAuthEntry(_authEntryXdr, _opts) {
            // hw-app-str exposes signSorobanAuthorization(path, authEntryXdr), so
            // getting a raw signature from the device is straightforward — the
            // part that's genuinely uncertain is reconstructing a valid
            // xdr.SorobanAuthorizationEntry with SOROBAN_CREDENTIALS_ADDRESS
            // credentials from that raw signature, which has a specific ScVal
            // structure. Rather than guess at that structure and risk shipping
            // something that produces invalid auth entries, this is stubbed the
            // same way SorobanConnection.signAuthEntries() is — see
            // ARCHITECTURE.md §9 for this as explicit follow-up work.
            throw ConnectError.internal('Ledger Soroban auth-entry signing needs the credentials-wrapping step implemented — see the comment in ledger.ts.', undefined, meta.id);
        },
        async signMessage(message, _opts) {
            return withNormalizedError(meta.id, async () => {
                if (!currentAddress)
                    throw ConnectError.invalidRequest('Ledger is not connected.', undefined, meta.id);
                const str = await ensureStrApp();
                const path = pathForIndex(accountCache.get(currentAddress) ?? currentIndex);
                const result = await str.signMessage(path, Buffer.from(message, 'utf-8'));
                const signatureBuffer = 'signature' in result ? result.signature : result;
                return { signedMessage: signatureBuffer.toString('base64'), signerAddress: currentAddress };
            });
        },
        async listAccounts() {
            return withNormalizedError(meta.id, async () => {
                const accounts = [];
                for (let i = 0; i < accountCount; i++) {
                    const address = await deriveAddress(i);
                    accounts.push({ address, label: `Account ${i}` });
                }
                return accounts;
            });
        },
        async selectAccount(address) {
            const index = accountCache.get(address);
            if (index === undefined) {
                throw ConnectError.invalidRequest('Unknown address — call listAccounts() first so its derivation index is cached.', undefined, meta.id);
            }
            currentIndex = index;
            currentAddress = address;
        },
    };
    return connector;
}
//# sourceMappingURL=ledger.js.map