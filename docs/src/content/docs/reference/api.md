---
title: API Reference
description: Complete API reference for Stellar AppKit.
---

## StellarAppKit

```ts
class StellarAppKit {
  constructor(config: StellarAppKitConfig)
  
  // Properties
  readonly registry: ConnectorRegistry
  readonly network: StellarNetwork
  readonly appMetadata?: { name: string; domain: string; uri: string }
  onPreviewTransaction: PreviewHandler | null
  onPreviewAuthEntry: AuthEntryPreviewHandler | null
  previewOptions: PreviewOptions
  
  // Session
  get session(): ConnectSession | null
  get sessions(): ConnectSession[]
  get activeConnector(): WalletConnector | null
  get status(): ConnectStatus
  get pendingSignCount(): number
  
  // Methods
  connect(walletId: string, opts?): Promise<ConnectSession>
  disconnect(walletId?: string): Promise<void>
  disconnectAll(): Promise<void>
  switchAccount(walletId: string, address?: string): Promise<ConnectSession>
  restore(): Promise<ConnectSession[]>
  dispose(): void
  
  // Signing (queued)
  signTransaction(xdr: string, opts?): Promise<SignTransactionResult>
  signAuthEntry(authEntryXdr: string, opts?): Promise<SignAuthEntryResult>
  signMessage(message: string, opts?): Promise<SignMessageResult>
  signIn(opts): Promise<SignInResult>
  
  // Events
  on<K>(event: K, handler): () => void
}
```

## SorobanConnection

```ts
class SorobanConnection {
  constructor(config: SorobanConnectionConfig)
  
  invoke(opts: InvokeOptions): Promise<InvokeResult>
  previewInvoke(opts: InvokeOptions): Promise<TransactionPreview & {...}>
  estimateFee(xdr: string): Promise<FeeEstimate | null>
  contract<T>(contractId: string, opts): ContractClient<T>
  getFailoverStatus(): Array<{url, healthy, failureCount}> | null
  
  // Low-level
  simulate(tx): Promise<SimulateResult>
  prepare(tx): Promise<Transaction>
  submit(signedXdr: string): Promise<SendTransactionResponse>
  pollStatus(hash: string, opts?): Promise<GetTransactionResponse>
}
```

## verifySiws

```ts
function verifySiws(
  payload: SiwsPayload,
  opts: VerifySiwsOptions
): Promise<SiwsVerificationResult>
```
