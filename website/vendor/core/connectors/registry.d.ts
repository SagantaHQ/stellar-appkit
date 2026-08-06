import type { WalletConnector, WalletReachability } from '../types.js';
/**
 * Holds all registered connectors. Kept separate from `StellarAppKit` so
 * that UI packages can render "available wallets" before a client instance
 * exists (e.g. server-rendered wallet lists).
 */
export declare class ConnectorRegistry {
    private connectors;
    register(connector: WalletConnector): void;
    registerMany(connectors: WalletConnector[]): void;
    get(id: string): WalletConnector | undefined;
    getOrThrow(id: string): WalletConnector;
    list(): WalletConnector[];
    /** Resolves reachability for every registered connector in parallel — drives the wallet list UI. */
    listReachability(): Promise<{
        connector: WalletConnector;
        reachability: WalletReachability;
        available: boolean;
    }[]>;
}
//# sourceMappingURL=registry.d.ts.map