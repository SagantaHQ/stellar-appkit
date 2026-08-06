---
title: Bundle Size
description: Tree-shaking guarantees — only ship what you import.
---

## Tree-shaking

Every connector is independently tree-shakeable. Framework wrappers are separate subpath exports — a React app never ships Vue or Svelte code.

| Import | What ships |
|---|---|
| `@saganta/stellar-appkit` | Core client + types (~40kb initial) |
| `@saganta/stellar-appkit/ui-web` | Modal Web Component (separate chunk) |
| `@saganta/stellar-appkit/react` | React hooks (only if imported) |
| `@saganta/stellar-appkit/vue` | Vue composables (only if imported) |
| `@saganta/stellar-appkit/solid` | Solid hooks (only if imported) |
| `@saganta/stellar-appkit/svelte` | Svelte stores (only if imported) |

## What you don't import = 0kb

- Wallet SDKs you don't use (Freighter, Albedo, xBull, Ledger, WalletConnect)
- Framework wrappers you don't use
- Gesture libraries (if you don't install them)

## Lazy-loaded

`@stellar/stellar-sdk` (~1.4MB) is a separate chunk that only loads on the first actual sign or Soroban call — not part of the initial bundle.

## Verifying

Use your bundler's analyzer to verify:

```bash
# Vite
npx vite-bundle-visualizer

# webpack
npx webpack-bundle-analyzer
```
