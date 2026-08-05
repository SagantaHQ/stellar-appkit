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
  onFailover?: (info: { from: RpcServer; to: RpcServer; method: string; error: unknown }) => void;
}

interface ServerHealth {
  server: RpcServer;
  healthy: boolean;
  unhealthyUntil: number; // epoch ms; 0 if healthy
  failureCount: number;
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
export class FailoverRpcServer {
  private health: ServerHealth[];
  private cooldownMs: number;
  private onFailover?: FailoverRpcServerOptions['onFailover'];

  constructor(opts: FailoverRpcServerOptions) {
    if (!opts.servers || opts.servers.length === 0) {
      throw new Error('FailoverRpcServer requires at least one server.');
    }
    this.health = opts.servers.map((server) => ({
      server,
      healthy: true,
      unhealthyUntil: 0,
      failureCount: 0,
    }));
    this.cooldownMs = opts.unhealthyCooldownMs ?? 30_000;
    this.onFailover = opts.onFailover;
  }

  /** Returns the list of servers, with their current health status. */
  getStatus(): Array<{ url: string; healthy: boolean; failureCount: number }> {
    return this.health.map((h) => ({
      url: (h.server as unknown as { serverURL: URL }).serverURL?.toString() ?? 'unknown',
      healthy: this.isHealthy(h),
      failureCount: h.failureCount,
    }));
  }

  private isHealthy(h: ServerHealth): boolean {
    if (h.healthy) return true;
    // Check if the cooldown has expired — if so, mark healthy again
    // (we'll retry on the next call).
    if (Date.now() >= h.unhealthyUntil) {
      h.healthy = true;
      return true;
    }
    return false;
  }

  private markUnhealthy(h: ServerHealth): void {
    h.healthy = false;
    h.unhealthyUntil = Date.now() + this.cooldownMs;
    h.failureCount++;
  }

  /**
   * Picks the first healthy server, or throws if none are healthy.
   * We don't bother with weighted round-robin or latency-based
   * selection — the priority order in the `servers` array is the
   * policy, and that's enough for the common case (one primary + one
   * backup + one tertiary).
   */
  private pickServer(): ServerHealth {
    for (const h of this.health) {
      if (this.isHealthy(h)) return h;
    }
    throw new Error('All RPC servers are unhealthy. Last failure counts: ' +
      this.health.map((h) => `${(h.server as unknown as { serverURL: URL }).serverURL?.toString() ?? '?'}=${h.failureCount}`).join(', '));
  }

  /**
   * Runs a method on a server, failing over to the next healthy one
   * if it errors. We try every healthy server in order before giving up.
   */
  private async runWithFailover<T>(method: string, args: unknown[], isFailoverable: (err: unknown) => boolean): Promise<T> {
    // Snapshot the healthy servers at call time — if a failover marks
    // one unhealthy mid-call, we don't want to retry it.
    const tried = new Set<ServerHealth>();
    let lastError: unknown;

    while (true) {
      // Find the next healthy server we haven't tried yet.
      const next = this.health.find((h) => !tried.has(h) && this.isHealthy(h));
      if (!next) {
        // All servers exhausted — throw the last error.
        throw lastError instanceof Error
          ? lastError
          : new Error(`All RPC servers failed for ${method}(). Last error: ${String(lastError)}`);
      }

      tried.add(next);
      try {
        const fn = (next.server as unknown as Record<string, (...a: unknown[]) => Promise<T>>)[method];
        if (typeof fn !== 'function') {
          // The method doesn't exist on the server — this is a programming
          // error, not a failover-able condition. Throw immediately.
          throw new Error(`Method ${method} does not exist on rpc.Server`);
        }
        const result = await fn(...args);
        return result;
      } catch (err) {
        lastError = err;
        if (!isFailoverable(err)) {
          // Non-failoverable error (4xx, simulation error, etc.) —
          // throw immediately, don't try the next server.
          throw err;
        }
        // Failoverable error — mark this server unhealthy and try the next.
        this.markUnhealthy(next);
        // Find the next server we'll try, for the onFailover callback.
        const nextNext = this.health.find((h) => !tried.has(h) && this.isHealthy(h));
        if (nextNext && this.onFailover) {
          this.onFailover({ from: next.server, to: nextNext.server, method, error: err });
        }
        // Loop and try the next server.
      }
    }
  }

  /**
   * Determines whether an error should trigger failover. We fail over
   * on network errors and 5xx responses, but NOT on 4xx or on legit
   * RPC error responses (e.g. simulation errors, which are valid
   * responses indicating the transaction would fail).
   *
   * The check is heuristic — stellar-sdk's error shapes vary across
   * versions, so we check several common patterns.
   */
  private static isFailoverableError(err: unknown): boolean {
    if (err instanceof Error) {
      const msg = err.message.toLowerCase();
      // Network-level errors
      if (msg.includes('fetch') || msg.includes('network') || msg.includes('timeout') ||
          msg.includes('econnreset') || msg.includes('econnrefused') || msg.includes('enotfound') ||
          msg.includes('dns')) {
        return true;
      }
      // HTTP 5xx
      if (msg.includes('500') || msg.includes('502') || msg.includes('503') || msg.includes('504') ||
          msg.includes('internal server error') || msg.includes('bad gateway') ||
          msg.includes('service unavailable') || msg.includes('gateway timeout')) {
        return true;
      }
    }
    // stellar-sdk sometimes throws a plain object with .status or .code
    if (err && typeof err === 'object') {
      const e = err as { status?: number; code?: number };
      if (typeof e.status === 'number' && e.status >= 500 && e.status < 600) return true;
      if (typeof e.code === 'number' && e.code === -32603) return true; // JSON-RPC internal error
    }
    return false;
  }

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
  private get handler(): ProxyHandler<this> {
    return {
      get: (target, prop, receiver) => {
        // First, check if the prop exists on the FailoverRpcServer itself
        // (getStatus, etc.) — if so, return it directly.
        if (prop in target) {
          return Reflect.get(target, prop, receiver);
        }
        // Otherwise, delegate to the underlying servers.
        const firstHealth = target.health[0];
        if (!firstHealth) {
          // Shouldn't happen — constructor validates non-empty — but TS
          // doesn't know that.
          return undefined;
        }
        const firstServer = firstHealth.server;
        const value = Reflect.get(firstServer as object, prop);
        if (typeof value !== 'function') {
          // Non-function property (e.g. serverURL) — return from the first server.
          return value;
        }
        // Return a function that runs with failover.
        return (...args: unknown[]) => {
          return target.runWithFailover(
            String(prop),
            args,
            FailoverRpcServer.isFailoverableError
          );
        };
      },
    };
  }

  /**
   * Returns a Proxy that transparently delegates every method call to
   * the underlying servers with failover. Use this anywhere a regular
   * `rpc.Server` is expected.
   */
  asServer(): RpcServer {
    return new Proxy(this, this.handler) as unknown as RpcServer;
  }
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
export async function createFailoverRpcServer(urls: string[], opts?: Omit<FailoverRpcServerOptions, 'servers'>): Promise<FailoverRpcServer> {
  const { Server } = await import('@stellar/stellar-sdk/rpc');
  const servers = urls.map((url) => new Server(url));
  return new FailoverRpcServer({ servers, ...opts });
}
