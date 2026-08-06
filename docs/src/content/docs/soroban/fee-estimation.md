---
title: Fee Estimation
description: Show the full fee breakdown — base fee, Soroban resource fee, total in XLM — before the user signs.
---

## Overview

`previewInvoke()` and `estimateFee()` return a `FeeEstimate` with the full fee breakdown, computed from the simulation's `cost` field.

## Usage

```ts
// Via previewInvoke (automatic — includeFeeEstimate defaults to true):
const preview = await soroban.previewInvoke({ contractId, method: 'transfer', args });
console.log(preview.feeEstimate);
// { baseFee: '100', totalBaseFee: '100', sorobanResourceFee: '50000',
//   sorobanInstructions: '12345', totalFee: '50100', totalFeeXlm: '0.00501 XLM' }

// Via estimateFee (standalone — for when you already have a built transaction):
const fee = await soroban.estimateFee(unsignedXdr);
console.log(fee.totalFeeXlm); // "0.00501 XLM"
```

## FeeEstimate fields

| Field | Description |
|---|---|
| `baseFee` | Per-operation fee in stroops |
| `operationCount` | Number of operations |
| `totalBaseFee` | `baseFee × operationCount` |
| `sorobanResourceFee` | CPU + memory + storage (from simulation) |
| `sorobanInstructions` | Instruction count (for gas-optimization display) |
| `totalFee` | Total in stroops |
| `totalFeeXlm` | Human-readable (e.g. "0.00501 XLM") |

For classic (non-Soroban) transactions, `sorobanResourceFee` and `sorobanInstructions` are undefined.
