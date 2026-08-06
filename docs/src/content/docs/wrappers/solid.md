---
title: Solid
description: SolidJS hooks for Stellar AppKit — fine-grained reactivity with createSignal.
---

## Installation

```bash
npm install solid-js @saganta/stellar-appkit
```

## Provider + hooks

```tsx
import { StellarAppKitProvider, useConnect, useSession } from '@saganta/stellar-appkit/solid';
import type { JSX } from 'solid-js';

export function App(): JSX.Element {
  return (
    <StellarAppKitProvider config={{
      network: 'TESTNET',
      connectors: [createFreighterConnector()],
    }}>
      <WalletPanel />
    </StellarAppKitProvider>
  );
}

function WalletPanel(): JSX.Element {
  const { connect, isConnected, isConnecting } = useConnect();
  return (
    <button disabled={isConnecting()} onClick={() => connect('freighter')}>
      {isConnecting() ? 'Connecting...' : 'Connect Freighter'}
    </button>
  );
}
```

Same hook surface as React. Uses `createSignal` / `createMemo` / `onCleanup` for fine-grained reactivity. SSR-safe with `useAppKitOptional()`.
