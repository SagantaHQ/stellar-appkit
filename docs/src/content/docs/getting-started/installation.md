---
title: Installation
description: Install Stellar AppKit and the wallet SDKs you need.
---

## Install the core package

```bash
npm install @saganta/stellar-appkit
```

## Install wallet SDKs (peer dependencies)

Wallet SDKs are peer dependencies — install the ones for the connectors you actually use:

```bash
npm install @stellar/stellar-sdk              # always — the base Stellar/Soroban SDK
npm install @stellar/freighter-api            # if using createFreighterConnector
npm install @albedo-link/intent               # if using createAlbedoConnector
npm install @creit.tech/xbull-wallet-connect  # if using createXBullConnector
npm install @ledgerhq/hw-app-str \
            @ledgerhq/hw-transport-webhid \
            @ledgerhq/hw-transport-webusb     # if using createLedgerConnector
npm install @walletconnect/sign-client        # if using createWalletConnectConnector
```

## Install the UI Web Component

The `<saganta-appkit-modal>` Web Component is included in the core package at the `/ui-web` subpath:

```ts
import '@saganta/stellar-appkit/ui-web'; // registers the custom element
```

## Install framework wrappers (optional)

If you prefer hooks over the Web Component, install the wrapper for your framework:

```bash
npm install react react-dom          # React wrapper
npm install vue                      # Vue wrapper
npm install solid-js                 # Solid wrapper
npm install svelte                   # Svelte wrapper
```

Each wrapper is a separate subpath export — bundlers only ship the framework code you actually import.

## Install gesture libraries (optional, for draggable bottom-sheet)

```bash
npm install @use-gesture/vanilla motion
```

These enable drag-to-dismiss physics on the mobile bottom-sheet. Without them, the bottom-sheet still works via the close button and backdrop tap.

## Installing the dev version from git

For testing an in-development version before it's published to npm, see the [Git install guide](https://github.com/SagantaHQ/stellar-appkit#installing-the-dev-version-directly-from-git) in the README.
