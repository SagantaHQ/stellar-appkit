---
title: Vue
description: Vue 3 Composition API composables for Stellar AppKit.
---

## Installation

```bash
npm install vue @saganta/stellar-appkit
```

## Plugin or provide

```ts
// Plugin form (app.use):
import { StellarAppKitPlugin } from '@saganta/stellar-appkit/vue';
app.use(StellarAppKitPlugin, {
  network: 'TESTNET',
  connectors: [createFreighterConnector()],
});

// Or provide form (inside setup()):
import { provideStellarAppKit } from '@saganta/stellar-appkit/vue';
provideStellarAppKit({ network: 'TESTNET', connectors: [createFreighterConnector()] });
```

## Composables

```vue
<script setup lang="ts">
import { useConnect, useSession } from '@saganta/stellar-appkit/vue';

const { connect, isConnected, isConnecting } = useConnect();
const session = useSession();
</script>

<template>
  <button v-if="!isConnected" :disabled="isConnecting" @click="connect('freighter')">
    {{ isConnecting ? 'Connecting...' : 'Connect Freighter' }}
  </button>
  <p v-else>Connected as {{ session?.address }}</p>
</template>
```

Same hook surface as React — `useAppKit`, `useConnect`, `useSession`, `useSignTransaction`, `useSignMessage`, `useSignIn`, `useSoroban`, `usePreviewTransaction`, `usePreviewAuthEntry`. Uses `shallowRef` + `shallowReadonly` for performance.
