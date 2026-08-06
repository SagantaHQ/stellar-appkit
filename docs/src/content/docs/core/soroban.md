---
title: Soroban Integration
description: Build, simulate, prepare, sign, submit, and poll a contract invocation with a single call.
---

## SorobanConnection

```ts
import { SorobanConnection } from '@saganta/stellar-appkit';

const soroban = new SorobanConnection({
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: Networks.TESTNET,
  wallet: appkit,
});

// One call covers the full pipeline:
const result = await soroban.invoke({ contractId, method: 'transfer', args });
```

## RPC failover

Pass `rpcUrls` instead of `rpcUrl` for multi-provider failover:

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

soroban.getFailoverStatus();
// [{ url: 'https://soroban-testnet.stellar.org', healthy: true, failureCount: 0 }, ...]
```

## Typed contract client

```ts
import { defineContractSpec } from '@saganta/stellar-appkit';

interface TokenContract extends defineContractSpec<{
  transfer: (args: { from: string; to: string; amount: bigint }) => Promise<boolean>;
  balanceOf: (args: { id: string }) => Promise<bigint>;
}> {}

const token = soroban.contract<TokenContract>('CBETT2CX...', {
  specEntries: ['AAA==', 'BBB==', ...],
});

await token.transfer({ from, to, amount: 100n });  // typed
const balance = await token.simulate('balanceOf', { id });  // read-only
```

## Fee estimation

```ts
const fee = await soroban.estimateFee(unsignedXdr);
console.log(fee.totalFeeXlm); // "0.00501 XLM"
```

## Auth-entry signing

Soroban auth entries (delegated/multi-party auth) are signed automatically inside `invoke()`:

```ts
// The invoke pipeline detects auth entries that need signing,
// calls wallet.signAuthEntry() for each, then signs the outer
// transaction. All handled automatically.
const result = await soroban.invoke({ contractId, method: 'transfer', args });
```

Uses `@stellar/stellar-base`'s `authorizeEntry()` helper for correct `HashIdPreimage` construction, SHA-256 hashing, local signature verification, and `ScVal` wrapping.
