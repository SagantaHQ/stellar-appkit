---
title: Wallet Connection
description: Connect wallets, manage sessions, switch accounts, and handle network mismatches.
---

## Connecting a wallet

```ts
await appkit.connect('freighter');
```

The `connect()` method:
1. Checks the wallet's reachability (`available`, `locked`, `not-installed`, `unavailable`)
2. Calls the wallet's `connect()` method (which may open a popup or extension prompt)
3. Validates the wallet's network matches the app's configured network
4. Stores the session and emits a `connect` event

## Multiple wallets, one session

Connecting a second wallet doesn't replace the first — both stay connected:

```ts
await appkit.connect('freighter');
await appkit.connect('ledger'); // both connected now; Ledger is active

appkit.sessions;                       // every connected session
appkit.session;                        // the active one
await appkit.switchAccount('freighter'); // back to Freighter, Ledger stays connected
```

## Account picker (hardware wallets)

Ledger exposes multiple accounts via derivation paths. When connecting, the modal automatically shows an account picker:

```ts
const accounts = await appkit.registry.getOrThrow('ledger').listAccounts();
await appkit.switchAccount('ledger', accounts[2].address);
```

## Network mismatch recovery

```ts
import { NetworkMismatchError } from '@saganta/stellar-appkit';

try {
  await appkit.connect('freighter');
} catch (err) {
  if (err instanceof NetworkMismatchError) {
    console.log(`Wallet is on ${err.actualNetwork}, app needs ${err.expectedNetwork}`);
  }
}

// Or resolve it automatically — polls until the user switches:
await appkit.connect('freighter', { autoRetryNetworkMismatch: true });
```

## Cross-tab session sync

Sessions persist across browser tabs automatically via `BroadcastChannel`. Connecting or disconnecting in one tab reflects in every other open tab of the same origin.

Disable with `syncAcrossTabs: false` in the config.

## Reachability

```ts
await appkit.getWalletReachability('freighter');
// 'available' | 'locked' | 'not-installed' | 'unavailable'
```

## Events

```ts
appkit.on('connect', (session) => { /* ... */ });
appkit.on('disconnect', ({ walletId }) => { /* ... */ });
appkit.on('sessionsChanged', (sessions) => { /* ... */ });
appkit.on('accountSwitch', ({ walletId, address }) => { /* ... */ });
appkit.on('networkChange', (network) => { /* ... */ });
appkit.on('signQueueChange', (count) => { /* ... */ });
appkit.on('error', (err) => { /* ... */ });
```

## Signature request queueing

Concurrent `signTransaction` / `signAuthEntry` / `signMessage` / `signIn` calls are queued and resolved in order rather than racing the wallet extension:

```ts
appkit.pendingSignCount; // number of sign requests currently queued
```
