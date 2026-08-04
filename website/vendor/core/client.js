import { ConnectorRegistry } from './connectors/registry.js';
import { TypedEmitter } from './events.js';
import { createWebStorage, SESSION_STORAGE_KEY } from './storage.js';
import { TabSync } from './tab-sync.js';
import { ConnectError, NetworkMismatchError, } from './types.js';
import { signInWithStellar } from './siws.js';
import { buildTransactionPreview } from './decode.js';
const DEFAULT_RETRY_INTERVAL_MS = 1500;
const DEFAULT_RETRY_TIMEOUT_MS = 30_000;
/**
 * The single object app code talks to. Wraps the connector registry, owns
 * connection state + persistence, and re-exports signIn() (SIWS) so a whole
 * app only ever needs one import.
 *
 * Supports connecting more than one wallet at once (e.g. Freighter *and*
 * Ledger simultaneously) — `session`/`activeConnector` always refer to
 * whichever one is currently active; `sessions` lists everything connected.
 */
export class StellarAppKit {
    constructor(config) {
        /** Called before every signTransaction() — set by ui-web automatically, or assign your own for a non-UI preview flow (e.g. logging, a CLI confirmation prompt). */
        this.onPreviewTransaction = null;
        this.emitter = new TypedEmitter();
        this._status = 'idle';
        this._sessions = new Map(); // keyed by walletId
        this._activeWalletId = null;
        this.tabSync = null;
        this.signChain = Promise.resolve();
        this._pendingSignCount = 0;
        this.registry = new ConnectorRegistry();
        this.registry.registerMany(config.connectors);
        this.network = config.network;
        this.appMetadata = config.appMetadata;
        this.storage = config.storage ?? createWebStorage();
        this.customNetworkPassphrase = config.networkPassphrase;
        this.onPreviewTransaction = config.onPreviewTransaction ?? null;
        this.previewOptions = config.previewOptions ?? {};
        if (config.syncAcrossTabs !== false) {
            this.tabSync = new TabSync(SESSION_STORAGE_KEY, () => {
                void this.resyncFromStorage();
            });
        }
    }
    /** Number of sign requests currently queued, including the one in flight — see the signing queue notes on signTransaction(). */
    get pendingSignCount() {
        return this._pendingSignCount;
    }
    get status() {
        return this._status;
    }
    /** The active session, or null if nothing's connected. */
    get session() {
        return this._activeWalletId ? this._sessions.get(this._activeWalletId) ?? null : null;
    }
    /** Every currently connected session, active or not. */
    get sessions() {
        return Array.from(this._sessions.values());
    }
    get activeConnector() {
        return this._activeWalletId ? this.registry.get(this._activeWalletId) ?? null : null;
    }
    on(event, handler) {
        return this.emitter.on(event, handler);
    }
    async getWalletReachability(walletId) {
        return this.registry.getOrThrow(walletId).getReachability();
    }
    /**
     * Attempts to restore persisted session(s) on app start. Silently drops
     * (rather than throwing) any session whose wallet is no longer available
     * or whose address no longer matches — this is meant to be called once,
     * e.g. inside a provider's mount effect, without needing its own error
     * handling.
     */
    async restore() {
        const stored = await this.readStorage();
        if (!stored)
            return [];
        const restored = [];
        for (const saved of stored.sessions) {
            const connector = this.registry.get(saved.walletId);
            if (!connector)
                continue;
            try {
                if ((await connector.getReachability()) === 'not-installed')
                    continue;
                const { address } = await connector.getAddress();
                if (address !== saved.address)
                    continue;
                this._sessions.set(saved.walletId, saved);
                restored.push(saved);
            }
            catch {
                // Wallet not actually reachable right now (locked, extension context not ready yet, etc.) — skip it silently.
            }
        }
        this._activeWalletId =
            stored.activeWalletId && this._sessions.has(stored.activeWalletId)
                ? stored.activeWalletId
                : (restored[restored.length - 1]?.walletId ?? null);
        if (restored.length > 0) {
            this.setStatus('connected');
            restored.forEach((session) => this.emitter.emit('connect', session));
            this.emitter.emit('sessionsChanged', this.sessions);
        }
        await this.persist();
        return restored;
    }
    /**
     * Connects a wallet. Adding a second (third, ...) wallet while one is
     * already connected doesn't replace it — both stay connected, and the
     * newly connected one becomes active. Use switchAccount() to change
     * which one is active without disconnecting anything.
     */
    async connect(walletId, opts = {}) {
        const connector = this.registry.getOrThrow(walletId);
        this.setStatus('connecting');
        try {
            const reachability = await connector.getReachability();
            if (reachability === 'not-installed') {
                throw ConnectError.internal(`${connector.meta.name} isn't installed.`, undefined, walletId);
            }
            if (reachability === 'unavailable') {
                throw ConnectError.internal(`${connector.meta.name} isn't available right now.`, undefined, walletId);
            }
            const account = await connector.connect({ network: this.network });
            await this.ensureNetworkMatch(connector, walletId, opts);
            const session = {
                walletId,
                address: account.address,
                network: this.network,
                connectedAt: Date.now(),
            };
            this._sessions.set(walletId, session);
            this._activeWalletId = walletId;
            await this.persist();
            this.setStatus('connected');
            this.emitter.emit('connect', session);
            this.emitter.emit('sessionsChanged', this.sessions);
            return session;
        }
        catch (err) {
            this.setStatus('error');
            const connectError = err instanceof ConnectError ? err : ConnectError.internal(String(err), undefined, walletId);
            this.emitter.emit('error', connectError);
            throw connectError;
        }
    }
    async ensureNetworkMatch(connector, walletId, opts) {
        if (this.network === 'STANDALONE')
            return; // nothing meaningful to compare against
        const check = async () => {
            const { network } = await connector.getNetwork().catch(() => ({ network: this.network }));
            return !network || network.toUpperCase() === this.network;
        };
        if (await check())
            return;
        if (!opts.autoRetryNetworkMismatch) {
            const { network } = await connector.getNetwork().catch(() => ({ network: 'unknown' }));
            throw new NetworkMismatchError({ expectedNetwork: this.network, actualNetwork: network, walletId });
        }
        const interval = opts.retryIntervalMs ?? DEFAULT_RETRY_INTERVAL_MS;
        const timeout = opts.retryTimeoutMs ?? DEFAULT_RETRY_TIMEOUT_MS;
        const deadline = Date.now() + timeout;
        while (Date.now() < deadline) {
            await sleep(interval);
            if (await check())
                return;
        }
        const { network } = await connector.getNetwork().catch(() => ({ network: 'unknown' }));
        throw new NetworkMismatchError({ expectedNetwork: this.network, actualNetwork: network, walletId });
    }
    /**
     * Switches which connected wallet is active. If `address` is given and
     * differs from that wallet's current session address, the connector must
     * support listAccounts()/selectAccount() (hardware wallets, mainly) — for
     * everything else, omit `address` to just switch between already-connected
     * *wallets*.
     */
    async switchAccount(walletId, address) {
        const existing = this._sessions.get(walletId);
        if (!existing) {
            throw ConnectError.invalidRequest(`${walletId} isn't connected — call connect() first.`);
        }
        let session = existing;
        if (address && address !== existing.address) {
            const connector = this.registry.getOrThrow(walletId);
            if (!connector.selectAccount) {
                throw ConnectError.invalidRequest(`${connector.meta.name} doesn't support switching accounts within one session.`);
            }
            await connector.selectAccount(address);
            const { address: confirmed } = await connector.getAddress();
            session = { ...existing, address: confirmed };
            this._sessions.set(walletId, session);
        }
        this._activeWalletId = walletId;
        await this.persist();
        this.emitter.emit('accountSwitch', { walletId, address: session.address });
        this.emitter.emit('sessionsChanged', this.sessions);
        return session;
    }
    /** Disconnects one wallet (defaults to the active one). Other connected wallets, if any, are untouched — the most recently connected one becomes active. */
    async disconnect(walletId) {
        const targetId = walletId ?? this._activeWalletId;
        if (!targetId)
            return;
        const connector = this.registry.get(targetId);
        await connector?.disconnect().catch(() => void 0);
        this._sessions.delete(targetId);
        if (this._activeWalletId === targetId) {
            const remaining = Array.from(this._sessions.values());
            this._activeWalletId = remaining[remaining.length - 1]?.walletId ?? null;
        }
        await this.persist();
        this.setStatus(this._sessions.size > 0 ? 'connected' : 'idle');
        this.emitter.emit('disconnect', { walletId: targetId });
        this.emitter.emit('sessionsChanged', this.sessions);
    }
    /** Disconnects every connected wallet. */
    async disconnectAll() {
        const walletIds = Array.from(this._sessions.keys());
        for (const id of walletIds) {
            await this.registry.get(id)?.disconnect().catch(() => void 0);
        }
        this._sessions.clear();
        this._activeWalletId = null;
        await this.persist();
        this.setStatus('idle');
        walletIds.forEach((walletId) => this.emitter.emit('disconnect', { walletId }));
        this.emitter.emit('sessionsChanged', this.sessions);
    }
    /** Releases resources held by the client (currently just the cross-tab sync channel) — call on unmount in long-lived SPAs if you're creating fresh clients repeatedly. */
    dispose() {
        this.tabSync?.close();
    }
    /** Re-reads storage after another tab reported a change, and reconciles in-memory state against it. Never writes back to storage itself, to avoid a notify loop between tabs. */
    async resyncFromStorage() {
        const stored = await this.readStorage();
        const storedIds = new Set((stored?.sessions ?? []).map((s) => s.walletId));
        const currentIds = new Set(this._sessions.keys());
        // Sessions that appeared in another tab.
        for (const saved of stored?.sessions ?? []) {
            if (currentIds.has(saved.walletId))
                continue;
            const connector = this.registry.get(saved.walletId);
            if (!connector)
                continue;
            try {
                const { address } = await connector.getAddress();
                if (address !== saved.address)
                    continue;
                this._sessions.set(saved.walletId, saved);
                this.emitter.emit('connect', saved);
            }
            catch {
                /* not actually reachable from this tab right now — skip */
            }
        }
        // Sessions that disappeared in another tab.
        for (const walletId of currentIds) {
            if (storedIds.has(walletId))
                continue;
            this._sessions.delete(walletId);
            this.emitter.emit('disconnect', { walletId });
        }
        if (stored?.activeWalletId !== this._activeWalletId && stored?.activeWalletId && this._sessions.has(stored.activeWalletId)) {
            this._activeWalletId = stored.activeWalletId;
            const session = this._sessions.get(stored.activeWalletId);
            if (session)
                this.emitter.emit('accountSwitch', { walletId: session.walletId, address: session.address });
        }
        else if (this._activeWalletId && !this._sessions.has(this._activeWalletId)) {
            const remaining = Array.from(this._sessions.values());
            this._activeWalletId = remaining[remaining.length - 1]?.walletId ?? null;
        }
        this.setStatus(this._sessions.size > 0 ? 'connected' : 'idle');
        this.emitter.emit('sessionsChanged', this.sessions);
    }
    async readStorage() {
        const raw = await this.storage.getItem(SESSION_STORAGE_KEY);
        if (!raw)
            return null;
        try {
            const parsed = JSON.parse(raw);
            if (parsed.v !== 1 || !Array.isArray(parsed.sessions))
                return null;
            return parsed;
        }
        catch {
            return null;
        }
    }
    async persist() {
        const payload = {
            v: 1,
            activeWalletId: this._activeWalletId,
            sessions: this.sessions,
        };
        await this.storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(payload));
        this.tabSync?.notify();
    }
    setStatus(status) {
        this._status = status;
        this.emitter.emit('statusChange', status);
    }
    requireActiveConnector() {
        const connector = this.activeConnector;
        if (!connector) {
            throw ConnectError.invalidRequest('No wallet is connected. Call connect(walletId) first.');
        }
        return connector;
    }
    /**
     * Maps the StellarNetwork enum to its passphrase, needed to decode a
     * preview and to validate signing options. Requires an explicit
     * `networkPassphrase` in the config for STANDALONE networks, which have
     * no fixed passphrase to fall back on.
     */
    resolveNetworkPassphrase() {
        if (this.customNetworkPassphrase)
            return this.customNetworkPassphrase;
        switch (this.network) {
            case 'PUBLIC':
                return WELL_KNOWN_PASSPHRASES.PUBLIC;
            case 'TESTNET':
                return WELL_KNOWN_PASSPHRASES.TESTNET;
            case 'FUTURENET':
                return WELL_KNOWN_PASSPHRASES.FUTURENET;
            default:
                throw ConnectError.invalidRequest('STANDALONE networks need an explicit `networkPassphrase` in the StellarAppKit config to build transaction previews.');
        }
    }
    /**
     * Serializes sign requests so concurrent calls don't race the same
     * wallet extension — most can only handle one prompt at a time, and
     * racing them tends to fail the second (or both) rather than queue
     * sanely on its own. A burst of signTransaction() calls resolves one at
     * a time, in call order, instead of unpredictably.
     */
    enqueueSign(fn) {
        this._pendingSignCount++;
        this.emitter.emit('signQueueChange', this._pendingSignCount);
        const result = this.signChain.then(fn, fn);
        this.signChain = result.then(() => undefined, () => undefined);
        return result.finally(() => {
            this._pendingSignCount--;
            this.emitter.emit('signQueueChange', this._pendingSignCount);
        });
    }
    // ---- Unified signing API — proxies to whichever wallet is active, so app code never branches on wallet identity ----
    /**
     * Signs a transaction. Queued alongside every other sign* call (see
     * enqueueSign) so concurrent requests resolve in order instead of
     * racing. If `onPreviewTransaction` is set (ui-web does this
     * automatically once attached), the transaction is decoded and the
     * handler is awaited *before* the wallet ever sees the request —
     * rejecting there throws the same way a wallet-side rejection would,
     * so callers don't need to special-case it. Pass `skipPreview: true` to
     * bypass this for a specific call (e.g. a flow you've already confirmed
     * through some other UI).
     */
    signTransaction(xdr, opts) {
        return this.enqueueSign(async () => {
            const connector = this.requireActiveConnector();
            if (this.onPreviewTransaction && !opts?.skipPreview) {
                const networkPassphrase = opts?.networkPassphrase ?? this.resolveNetworkPassphrase();
                const preview = await buildTransactionPreview(xdr, networkPassphrase, this.previewOptions);
                const approved = await this.onPreviewTransaction(preview);
                if (!approved)
                    throw ConnectError.rejected(connector.id);
            }
            return connector.signTransaction(xdr, opts);
        });
    }
    /** Queued alongside signTransaction()/signMessage() — see enqueueSign. Doesn't currently go through the preview flow (see README's "known gaps"). */
    signAuthEntry(authEntryXdr, opts) {
        return this.enqueueSign(() => this.requireActiveConnector().signAuthEntry(authEntryXdr, opts));
    }
    /** Queued alongside signTransaction()/signAuthEntry() — see enqueueSign. */
    signMessage(message, opts) {
        return this.enqueueSign(() => this.requireActiveConnector().signMessage(message, opts));
    }
    /** Sign-In With Stellar — see siws.ts for the message format. Also queued, since it's a signMessage() call under the hood. */
    signIn(opts) {
        const connector = this.requireActiveConnector();
        if (!this.appMetadata) {
            throw ConnectError.invalidRequest('signIn() requires appMetadata (name, domain, uri) to be set in the StellarAppKit config.');
        }
        return this.enqueueSign(() => signInWithStellar({ ...opts, connector, network: this.network, appMetadata: this.appMetadata }));
    }
}
// Verified byte-for-byte against @stellar/stellar-sdk's own Networks export
// (network passphrase correctness is signature-critical, not just cosmetic —
// worth keeping this comment as a reminder to re-verify if this ever drifts
// from a hardcoded copy to something else).
const WELL_KNOWN_PASSPHRASES = {
    PUBLIC: 'Public Global Stellar Network ; September 2015',
    TESTNET: 'Test SDF Network ; September 2015',
    FUTURENET: 'Test SDF Future Network ; October 2022',
};
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
//# sourceMappingURL=client.js.map