# @saganta/stellar-appkit

Unified Stellar wallet connections, Soroban, and transaction preview — the core SDK. Includes the themeable `<saganta-appkit-modal>` Web Component at the `/ui-web` subpath (a separate entry point, so importing only the core client never pulls in UI code).

```bash
npm install @saganta/stellar-appkit
```

```ts
import { StellarAppKit, createFreighterConnector } from '@saganta/stellar-appkit';
import '@saganta/stellar-appkit/ui-web'; // registers <saganta-appkit-modal>

const appkit = new StellarAppKit({
  network: 'PUBLIC',
  connectors: [createFreighterConnector()],
  appMetadata: { name: 'My App', domain: 'app.example.com', uri: 'https://app.example.com' },
});

const modal = document.querySelector('saganta-appkit-modal');
modal.client = appkit;
```

Full documentation, the complete API reference, and the live demo: **[stellar-appkit.saganta.com](https://stellar-appkit.saganta.com)**, or the [repo README](https://github.com/SagantaHQ/stellar-appkit#readme).

License: see the [repo](https://github.com/SagantaHQ/stellar-appkit).
