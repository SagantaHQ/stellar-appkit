import type { WalletConnector, WalletReachability } from '../types.js';

/**
 * Holds all registered connectors. Kept separate from `StellarAppKit` so
 * that UI packages can render "available wallets" before a client instance
 * exists (e.g. server-rendered wallet lists).
 */
export class ConnectorRegistry {
  private connectors = new Map<string, WalletConnector>();

  register(connector: WalletConnector): void {
    if (this.connectors.has(connector.id)) {
      throw new Error(`[saganta-connect] A connector with id "${connector.id}" is already registered.`);
    }
    this.connectors.set(connector.id, connector);
  }

  registerMany(connectors: WalletConnector[]): void {
    connectors.forEach((c) => this.register(c));
  }

  get(id: string): WalletConnector | undefined {
    return this.connectors.get(id);
  }

  getOrThrow(id: string): WalletConnector {
    const connector = this.get(id);
    if (!connector) {
      throw new Error(`[saganta-connect] No connector registered with id "${id}".`);
    }
    return connector;
  }

  list(): WalletConnector[] {
    return Array.from(this.connectors.values());
  }

  /** Resolves reachability for every registered connector in parallel — drives the wallet list UI. */
  async listReachability(): Promise<{ connector: WalletConnector; reachability: WalletReachability; available: boolean }[]> {
    const entries = this.list();
    const reachability = await Promise.all(
      entries.map(async (connector) => {
        try {
          return await connector.getReachability();
        } catch {
          return 'unavailable' as const;
        }
      })
    );
    const result = entries.map((connector, i) => ({
      connector,
      reachability: reachability[i] ?? 'unavailable',
      available: reachability[i] === 'available',
    }));
    // Pin WalletConnect to the top of the list when present. It's the only
    // "always-available" connector (it's a relay, not a browser extension),
    // and surfacing it first tells users they can pair a mobile wallet even
    // if no extension is installed. Other connectors keep their registration
    // order.
    return result.sort((a, b) => {
      if (a.connector.id === 'walletconnect' && b.connector.id !== 'walletconnect') return -1;
      if (b.connector.id === 'walletconnect' && a.connector.id !== 'walletconnect') return 1;
      return 0;
    });
  }
}
