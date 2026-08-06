---
title: Changelog
description: Release history for Stellar AppKit.
---

## Latest

### Framework wrappers (React, Vue, Solid, Svelte)
- Subpath exports: `/react`, `/vue`, `/solid`, `/svelte`
- Shared hook surface: `useAppKit`, `useConnect`, `useSession`, `useSignTransaction`, `useSignMessage`, `useSignIn`, `useSoroban`, `usePreviewTransaction`, `usePreviewAuthEntry`
- Tree-shakable — each wrapper is a separate entry point

### Soroban contract layer
- Typed contract client (`ContractClient<T>` from `stellar contract bindings`)
- RPC failover (`FailoverRpcServer` with health tracking + cooldown)
- Contract verification badges (`PreviewOptions.contractMetadata` → `ContractBadge[]`)
- Pre-simulate fee estimation (`FeeEstimate` on `previewInvoke()` + `estimateFee()`)
- Auth-entry signing (via `authorizeEntry()` — closes the last stub)

### SIWS
- SEP-0053 message encoding for Freighter (`sha256("Stellar Signed Message:\n" + message)`)
- Multi-candidate verification (8 candidates: utf8, sha256, sha512, domain-prefixed, CRLF)
- Debug mode with diagnostics dump
- `signedData` field on `SignMessageResult` / `SignInResult` / `SiwsPayload`

### UI
- Wallet-provided avatars (`getAvatar()`) + deterministic gradient fallback + Stellar Expert avatars
- Copy-to-clipboard on all address displays
- Contract verification badges + fee estimate in transaction preview
- Conic-gradient spinner (no wobble)
- Draggable bottom-sheet with spring physics (`@use-gesture/vanilla` + `motion`)
- Bundled wallet brand icons (base64 data URIs)

### Wallets
- WalletConnect v2 relay adapter (QR pairing, `stellar_signXDR`, `stellar_signMessage`)
- xBull extension detection polling (5s timeout, multiple injection points)
- xBull "wallet not set up" friendly error
- Albedo connection timeout (60s — popup can be closed)
- Error normalization for plain-object errors (xBull)

### Other
- MIT license (changed from GPLv3)
- 137 tests, CI on Linux + macOS
- Astro Starlight documentation site
