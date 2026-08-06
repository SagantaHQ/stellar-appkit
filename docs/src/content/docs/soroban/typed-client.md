---
title: Typed Contract Client
description: Type-safe contract calls derived from your TS interface — no manual ScVal construction.
---

## Overview

The typed contract client wraps `@stellar/stellar-sdk`'s `Spec` class and binds it to a `SorobanConnection`, so every call goes through the simulate → prepare → sign → submit pipeline with the transaction preview flow intact.

## Usage

```ts
import { defineContractSpec } from '@saganta/stellar-appkit';

interface TokenContract extends defineContractSpec<{
  transfer: (args: { from: string; to: string; amount: bigint }) => Promise<boolean>;
  balanceOf: (args: { id: string }) => Promise<bigint>;
  symbol: () => Promise<string>;
}> {}

// specEntries comes from `stellar contract bindings typescript --contract-id C... --output-dir ...`
const token = soroban.contract<TokenContract>('CBETT2CX...', {
  specEntries: ['AAA==', 'BBB==', ...],
});

// Fully typed — wrong arg names or types are caught at compile time:
await token.transfer({ from: 'G...', to: 'G...', amount: 100n });  // ✓
// await token.transfer({ from: 'G...', to: 'G...', amount: '100' });
//   ^^^ TS error: 'string' is not assignable to 'bigint'

// Read-only calls skip signing entirely:
const balance = await token.simulate('balanceOf', { id: 'G...' });  // bigint
```

## How it works

- `Spec.funcArgsToScVals(method, args)` converts native JS args to `ScVal[]` based on the function's declared parameter types
- `Spec.funcResToNative(method, returnValue)` converts the result `ScVal` back to a native JS value
- The spec entries come from `stellar contract bindings typescript` — the consumer's contract bindings package exports them as base64 strings
