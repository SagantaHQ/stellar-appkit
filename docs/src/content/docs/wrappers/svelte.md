---
title: Svelte
description: Svelte stores for Stellar AppKit — works in Svelte 4 and 5.
---

## Installation

```bash
npm install svelte @saganta/stellar-appkit
```

## Setup + stores

```svelte
<script lang="ts">
  import { setStellarAppKitContext, useConnect, useSession } from '@saganta/stellar-appkit/svelte';
  import { createFreighterConnector } from '@saganta/stellar-appkit';

  setStellarAppKitContext({
    network: 'TESTNET',
    connectors: [createFreighterConnector()],
    appMetadata: { name: 'My App', domain: 'app.example.com', uri: 'https://app.example.com' },
  });

  const { connect, isConnected, isConnecting } = useConnect();
  const session = useSession();
</script>

<button disabled={$isConnecting} onClick={() => connect('freighter')}>
  {$isConnecting ? 'Connecting...' : 'Connect Freighter'}
</button>
{#if $isConnected}
  <p>Connected as {$session?.address}</p>
{/if}
```

Uses Svelte's writable stores (compatible with both Svelte 4 and 5). Short aliases (`useSession`) and Store-suffixed names (`useSessionStore`) are both exported.
