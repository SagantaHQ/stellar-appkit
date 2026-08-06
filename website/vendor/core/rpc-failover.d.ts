/**
 * RPC failover wrapper for Soroban.
 *
 * Wraps multiple `rpc.Server` instances and proxies every method call,
 * transparently failing over to the next server when the current one
 * errors. Designed to be a drop-in replacement for `rpc.Server` —
 * `SorobanConnection` accepts a `FailoverRpcServer` anywhere it accepts
 * a regular server.
 *
 * ## Why this exists
 *
 * Soroban RPC is operated by multiple providers (Stellar,宋江, Frank
 * Coin, etc.) and reliability varies. A single-provider setup means
 * every RPC outage takes your dapp down. Failover across 2-3 providers
 * gives you resilience without code changes — if the primary is down,
 * calls automatically retry on the secondary, then the tertiary.
 *
 * ## Failover policy
 *
 * We fail over on:
 *   - Network errors (fetch rejects — DNS failure, connection refused, timeout)
 *   - HTTP 5xx responses (server-side failure)
 *   - JSON-RPC internal errors (-32603)
 *
 * We do NOT fail over on:
 *   - HTTP 4xx responses (client error — the request is bad, retrying won't help)
 *   - Simulation errors (the transaction itself is invalid — that's a legit
 *     response, not an RPC failure)
 *   - `sendTransaction` returning non-PENDING (same — that's the network
 *     rejecting the tx, not an RPC outage)
 *
 * ## Health tracking
 *
 * Each server has a `healthy: boolean` flag. On a failover-able error,
 * the failing server is marked unhealthy for `unhealthyCooldownMs` (default
 * 30s) — subsequent calls skip it entirely and go straight to the next
 * provider. This avoids waiting for a timeout on every call when a
 * server is down. After the cooldown, the server is retried (it might
 * have recovered).
 *
 * The first healthy server in the list is always preferred — so if
 * your primary recovers, traffic automatically shifts back to it.
 */
type RpcModule = typeof import('@stellar/stellar-sdk/rpc');
type RpcServer = InstanceType<RpcModule['Server']>;
export interface FailoverRpcServerOptions {
    /** Servers to try, in priority order. The first healthy one is preferred. */
    servers: RpcServer[];
    /** How long to skip a server after it fails, in ms. Default: 30_000. */
    unhealthyCooldownMs?: number;
    /** Optional callback fired when a failover happens — useful for logging/metrics. */
    onFailover?: (info: {
        from: RpcServer;
        to: RpcServer;
        method: string;
        error: unknown;
    }) => void;
}
/**
 * A Proxy wrapping multiple `rpc.Server` instances. Every method call
 * goes through the proxy, which picks the first healthy server, tries
 * the call, and fails over if it errors.
 *
 * The proxy approach means we automatically support any new method
 * stellar-sdk adds to `rpc.Server` — we don't have to maintain a list
 * of methods to delegate.
 */
export declare class FailoverRpcServer {
    private health;
    private cooldownMs;
    private onFailover?;
    constructor(opts: FailoverRpcServerOptions);
    /** Returns the list of servers, with their current health status. */
    getStatus(): Array<{
        url: string;
        healthy: boolean;
        failureCount: number;
    }>;
    private isHealthy;
    private markUnhealthy;
    /**
     * Picks the first healthy server, or throws if none are healthy.
     * We don't bother with weighted round-robin or latency-based
     * selection — the priority order in the `servers` array is the
     * policy, and that's enough for the common case (one primary + one
     * backup + one tertiary).
     */
    private pickServer;
    /**
     * Runs a method on a server, failing over to the next healthy one
     * if it errors. We try every healthy server in order before giving up.
     */
    private runWithFailover;
    /**
     * Determines whether an error should trigger failover. We fail over
     * on network errors and 5xx responses, but NOT on 4xx or on legit
     * RPC error responses (e.g. simulation errors, which are valid
     * responses indicating the transaction would fail).
     *
     * The check is heuristic — stellar-sdk's error shapes vary across
     * versions, so we check several common patterns.
     */
    private static isFailoverableError;
    /**
     * The Proxy trap. Every property access on the FailoverRpcServer
     * returns a function that delegates to runWithFailover — so
     * `failoverServer.getAccount(address)` works exactly like
     * `rpcServer.getAccount(address)`, just with failover.
     *
     * Methods that return Promises get the failover treatment; non-Promise
     * properties (rare — `serverURL`, etc.) are returned as-is from the
     * first server.
     */
    private get handler();
    /**
     * Returns a Proxy that transparently delegates every method call to
     * the underlying servers with failover. Use this anywhere a regular
     * `rpc.Server` is expected.
     */
    asServer(): RpcServer;
}
/**
 * Helper: constructs a FailoverRpcServer from a list of RPC URLs.
 * Useful when you don't want to construct each `rpc.Server` yourself.
 *
 *   const failover = createFailoverRpcServer([
 *     'https://soroban-testnet.stellar.org',
 *     'https://rpc-failover.example.com',
 *   ]);
 *   const connection = new SorobanConnection({ rpc: failover.asServer(), ... });
 */
export declare function createFailoverRpcServer(urls: string[], opts?: Omit<FailoverRpcServerOptions, 'servers'>): Promise<FailoverRpcServer>;
export {};
//# sourceMappingURL=rpc-failover.d.ts.map