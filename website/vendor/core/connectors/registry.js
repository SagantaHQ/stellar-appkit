/**
 * Holds all registered connectors. Kept separate from `StellarAppKit` so
 * that UI packages can render "available wallets" before a client instance
 * exists (e.g. server-rendered wallet lists).
 */
export class ConnectorRegistry {
    constructor() {
        this.connectors = new Map();
    }
    register(connector) {
        if (this.connectors.has(connector.id)) {
            throw new Error(`[saganta-connect] A connector with id "${connector.id}" is already registered.`);
        }
        this.connectors.set(connector.id, connector);
    }
    registerMany(connectors) {
        connectors.forEach((c) => this.register(c));
    }
    get(id) {
        return this.connectors.get(id);
    }
    getOrThrow(id) {
        const connector = this.get(id);
        if (!connector) {
            throw new Error(`[saganta-connect] No connector registered with id "${id}".`);
        }
        return connector;
    }
    list() {
        return Array.from(this.connectors.values());
    }
    /** Resolves reachability for every registered connector in parallel — drives the wallet list UI. */
    async listReachability() {
        const entries = this.list();
        const reachability = await Promise.all(entries.map(async (connector) => {
            try {
                return await connector.getReachability();
            }
            catch {
                return 'unavailable';
            }
        }));
        return entries.map((connector, i) => ({
            connector,
            reachability: reachability[i] ?? 'unavailable',
            available: reachability[i] === 'available',
        }));
    }
}
//# sourceMappingURL=registry.js.map