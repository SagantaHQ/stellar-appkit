---
title: RPC Failover
description: Automatic failover across multiple RPC providers for production resilience.
---

## Overview

`FailoverRpcServer` wraps multiple `rpc.Server` instances and proxies every method call, transparently failing over on network errors and HTTP 5xx responses.

## Configuration

```ts
const soroban = new SorobanConnection({
  rpcUrls: [
    'https://soroban-testnet.stellar.org',
    'https://rpc-failover.example.com',
    'https://rpc-backup.example.com',
  ],
  failoverOptions: {
    unhealthyCooldownMs: 30_000,
    onFailover: ({ from, to, method, error }) => {
      console.warn(`RPC failover for ${method}():`, error);
    },
  },
  networkPassphrase: Networks.TESTNET,
  wallet: appkit,
});
```

## Failover policy

**Fails over on:**
- Network errors (DNS failure, connection refused, timeout, ECONNRESET)
- HTTP 5xx responses
- JSON-RPC internal errors (-32603)

**Does NOT fail over on:**
- HTTP 4xx (client error)
- Simulation errors (the transaction itself is invalid)
- `sendTransaction` returning non-PENDING

## Health tracking

Failed servers are marked unhealthy for 30s (configurable). The first healthy server is always preferred — traffic shifts back to the primary when it recovers.

```ts
soroban.getFailoverStatus();
// [{ url: 'https://soroban-testnet.stellar.org', healthy: true, failureCount: 0 }, ...]
```
