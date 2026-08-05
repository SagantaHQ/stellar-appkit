import { test, expect, describe } from 'bun:test';
import { FailoverRpcServer } from '../src/rpc-failover.js';

/**
 * Tests for the RPC failover wrapper.
 *
 * We mock the underlying rpc.Server instances with plain objects that
 * record calls and can be made to throw on demand. This lets us verify
 * the failover logic without needing a live RPC endpoint.
 */

interface MockServer {
  serverURL: URL;
  getAccount: (address: string) => Promise<{ address: string }>;
  simulateTransaction: (tx: unknown) => Promise<unknown>;
  sendTransaction: (tx: unknown) => Promise<{ status: string; hash: string }>;
}

function makeMockServer(url: string, opts: { fail?: boolean; failNth?: number } = {}): MockServer {
  let callCount = 0;
  return {
    serverURL: new URL(url),
    getAccount: async (address: string) => {
      callCount++;
      if (opts.failNth && callCount === opts.failNth) {
        throw new Error('Network error: fetch failed');
      }
      if (opts.fail) throw new Error('Network error: fetch failed');
      return { address };
    },
    simulateTransaction: async (tx: unknown) => {
      callCount++;
      if (opts.failNth && callCount === opts.failNth) {
        throw new Error('HTTP 503: Service Unavailable');
      }
      if (opts.fail) throw new Error('HTTP 503: Service Unavailable');
      return { tx, cost: { cpuInstructions: 1000, resourceFeeCharged: 100 } };
    },
    sendTransaction: async (tx: unknown) => {
      callCount++;
      if (opts.failNth && callCount === opts.failNth) {
        throw new Error('ECONNRESET');
      }
      if (opts.fail) throw new Error('ECONNRESET');
      return { status: 'PENDING', hash: 'abc123' };
    },
  };
}

describe('FailoverRpcServer', () => {
  test('constructs with at least one server', () => {
    const server = makeMockServer('https://rpc1.example.com');
    const failover = new FailoverRpcServer({ servers: [server as never] });
    expect(failover).toBeDefined();
    expect(failover.getStatus()).toHaveLength(1);
    expect(failover.getStatus()[0].url).toBe('https://rpc1.example.com/');
    expect(failover.getStatus()[0].healthy).toBe(true);
  });

  test('throws if no servers are provided', () => {
    expect(() => new FailoverRpcServer({ servers: [] })).toThrow(/at least one server/);
  });

  test('delegates to the first server when it succeeds', async () => {
    const primary = makeMockServer('https://rpc1.example.com');
    const secondary = makeMockServer('https://rpc2.example.com');
    const failover = new FailoverRpcServer({
      servers: [primary as never, secondary as never],
    });

    const proxy = failover.asServer() as unknown as MockServer;
    const result = await proxy.getAccount('GA...');

    expect(result).toEqual({ address: 'GA...' });
    expect(failover.getStatus()[0].healthy).toBe(true);
    expect(failover.getStatus()[1].healthy).toBe(true);
  });

  test('fails over to the second server when the first throws a network error', async () => {
    const primary = makeMockServer('https://rpc1.example.com', { fail: true });
    const secondary = makeMockServer('https://rpc2.example.com');
    let failoverCallback: { from: unknown; to: unknown; method: string } | null = null;

    const failover = new FailoverRpcServer({
      servers: [primary as never, secondary as never],
      onFailover: (info) => { failoverCallback = info; },
    });

    const proxy = failover.asServer() as unknown as MockServer;
    const result = await proxy.getAccount('GA...');

    expect(result).toEqual({ address: 'GA...' });
    expect(failover.getStatus()[0].healthy).toBe(false);  // primary marked unhealthy
    expect(failover.getStatus()[1].healthy).toBe(true);   // secondary still healthy
    expect(failoverCallback).not.toBeNull();
    expect(failoverCallback!.method).toBe('getAccount');
  });

  test('fails over on HTTP 5xx errors', async () => {
    const primary = makeMockServer('https://rpc1.example.com', { fail: true });
    const secondary = makeMockServer('https://rpc2.example.com');

    const failover = new FailoverRpcServer({
      servers: [primary as never, secondary as never],
    });

    // Override the primary's error to be a 5xx-style message
    (primary as MockServer & { getAccount: () => Promise<never> }).getAccount = async () => {
      throw new Error('HTTP 503: Service Unavailable');
    };

    const proxy = failover.asServer() as unknown as MockServer;
    const result = await proxy.getAccount('GA...');
    expect(result).toEqual({ address: 'GA...' });
    expect(failover.getStatus()[0].healthy).toBe(false);
  });

  test('does NOT fail over on 4xx errors', async () => {
    const primary = makeMockServer('https://rpc1.example.com');
    const secondary = makeMockServer('https://rpc2.example.com');

    (primary as MockServer & { getAccount: () => Promise<never> }).getAccount = async () => {
      throw new Error('HTTP 400: Bad Request');
    };

    const failover = new FailoverRpcServer({
      servers: [primary as never, secondary as never],
    });

    const proxy = failover.asServer() as unknown as MockServer;
    // 4xx should throw immediately, NOT fail over to the secondary.
    await expect(proxy.getAccount('GA...')).rejects.toThrow(/400/);
    // Primary is NOT marked unhealthy (the error is a client error, not a server error)
    expect(failover.getStatus()[0].healthy).toBe(true);
    expect(failover.getStatus()[1].healthy).toBe(true);
  });

  test('throws when all servers fail', async () => {
    const primary = makeMockServer('https://rpc1.example.com', { fail: true });
    const secondary = makeMockServer('https://rpc2.example.com', { fail: true });

    const failover = new FailoverRpcServer({
      servers: [primary as never, secondary as never],
    });

    const proxy = failover.asServer() as unknown as MockServer;
    // When all servers fail, we throw the last error directly (not a
    // wrapped "all servers failed" message) — the consumer sees the
    // actual underlying error, which is more useful for debugging.
    await expect(proxy.getAccount('GA...')).rejects.toThrow(/Network error|All RPC servers failed/);
    expect(failover.getStatus()[0].healthy).toBe(false);
    expect(failover.getStatus()[1].healthy).toBe(false);
  });

  test('marks server healthy again after cooldown expires', async () => {
    const primary = makeMockServer('https://rpc1.example.com', { failNth: 1 });
    const secondary = makeMockServer('https://rpc2.example.com');

    const failover = new FailoverRpcServer({
      servers: [primary as never, secondary as never],
      unhealthyCooldownMs: 10, // very short for testing
    });

    const proxy = failover.asServer() as unknown as MockServer;

    // First call: primary fails (failNth=1), failover to secondary
    await proxy.getAccount('GA...');
    expect(failover.getStatus()[0].healthy).toBe(false);

    // Wait for cooldown to expire
    await new Promise((r) => setTimeout(r, 15));

    // Primary should be healthy again (cooldown expired)
    expect(failover.getStatus()[0].healthy).toBe(true);
  });

  test('getStatus returns URL, health, and failure count for each server', async () => {
    const primary = makeMockServer('https://rpc1.example.com', { fail: true });
    const secondary = makeMockServer('https://rpc2.example.com');

    const failover = new FailoverRpcServer({
      servers: [primary as never, secondary as never],
    });

    const proxy = failover.asServer() as unknown as MockServer;
    await proxy.getAccount('GA...');

    const status = failover.getStatus();
    expect(status).toHaveLength(2);
    expect(status[0].url).toBe('https://rpc1.example.com/');
    expect(status[0].healthy).toBe(false);
    expect(status[0].failureCount).toBe(1);
    expect(status[1].url).toBe('https://rpc2.example.com/');
    expect(status[1].healthy).toBe(true);
    expect(status[1].failureCount).toBe(0);
  });
});
