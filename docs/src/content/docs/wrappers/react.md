---
title: React
description: React hooks for Stellar AppKit — useSyncExternalStore-based, tearing-safe under concurrent rendering.
---

## Installation

```bash
npm install react react-dom @saganta/stellar-appkit
```

## Provider + hooks

```tsx
import { StellarAppKitProvider, useConnect, useSession, useSignTransaction } from '@saganta/stellar-appkit/react';
import { createFreighterConnector } from '@saganta/stellar-appkit';

export function App() {
  return (
    <StellarAppKitProvider config={{
      network: 'TESTNET',
      connectors: [createFreighterConnector()],
      appMetadata: { name: 'My App', domain: 'app.example.com', uri: 'https://app.example.com' },
    }}>
      <WalletPanel />
    </StellarAppKitProvider>
  );
}

function WalletPanel() {
  const { connect, isConnected, isConnecting } = useConnect();
  const session = useSession();
  const { sign, isSigning } = useSignTransaction();

  if (!isConnected) {
    return <button disabled={isConnecting} onClick={() => connect('freighter')}>
      {isConnecting ? 'Connecting...' : 'Connect Freighter'}
    </button>;
  }
  return <p>Connected as {session?.address}</p>;
}
```

## Available hooks

| Hook | Returns |
|---|---|
| `useAppKit()` | The `StellarAppKit` client instance |
| `useStatus()` | `'idle' \| 'selecting' \| 'connecting' \| 'connected' \| 'error'` |
| `useSession()` | Active `ConnectSession \| null` |
| `useSessions()` | All connected sessions |
| `useAddress()` | Active session's address |
| `usePendingSignCount()` | Number of queued sign requests |
| `useConnect()` | `{ connect, disconnect, switchAccount, isConnected, isConnecting, error }` |
| `useSignTransaction()` | `{ sign, isSigning, data, error }` |
| `useSignMessage()` | `{ sign, isSigning, data, error }` |
| `useSignIn()` | `{ sign, isSigning, data, error }` |
| `useSoroban({ rpcUrl, networkPassphrase })` | `{ soroban, invoke, previewInvoke, estimateFee, contract, status, ... }` |
| `usePreviewTransaction()` | `{ preview, respond, isPending }` |
| `usePreviewAuthEntry()` | `{ preview, respond, isPending }` |
