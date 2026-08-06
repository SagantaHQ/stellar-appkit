import type { StellarAppKit } from './client.js';
import { ConnectError } from './types.js';
import {
  buildTransactionPreview,
  decodeSimulationDeltas,
  type TransactionPreview,
  type BalanceDelta,
  type FeeEstimate,
} from './decode.js';
import { ContractClient, type ContractSpec } from './contract.js';
import { FailoverRpcServer } from './rpc-failover.js';

// Peer dependency — imported lazily (see `sdk()` below) so `core` doesn't
// force a specific @stellar/stellar-sdk version on apps that only need the
// wallet layer.
type StellarSdkModule = typeof import('@stellar/stellar-sdk');
type RpcModule = typeof import('@stellar/stellar-sdk/rpc');

export interface SorobanConnectionConfig {
  /**
   * Primary RPC URL. If `rpcUrls` is also provided, this is ignored —
   * use one or the other.
   */
  rpcUrl?: string;
  /**
   * Multiple RPC URLs for failover. The first healthy one is preferred;
   * on a network/5xx error, the next is tried, and so on. Failed
   * servers are marked unhealthy for 30s before being retried.
   *
   * Mutually exclusive with `rpcUrl` and `rpc` — if both are set,
   * `rpcUrls` takes precedence.
   */
  rpcUrls?: string[];
  /**
   * Pre-constructed RPC server (or failover wrapper) to use directly.
   * Mutually exclusive with `rpcUrl` and `rpcUrls` — if set, takes
   * precedence over both. Useful for tests where you want to inject a
   * mock server.
   */
  rpc?: InstanceType<RpcModule['Server']>;
  /**
   * Optional failover configuration — only used when `rpcUrls` is set.
   * Pass `unhealthyCooldownMs` and `onFailover` here.
   */
  failoverOptions?: Omit<ConstructorParameters<typeof FailoverRpcServer>[0], 'servers'>;
  networkPassphrase: string;
  wallet: StellarAppKit;
}

export interface InvokeOptions {
  contractId: string;
  method: string;
  /** Pass pre-built xdr.ScVal args, or use a TypedContractClient (see `contract()`) to avoid building these by hand. */
  args?: unknown[];
  /** Skip signing/submission entirely for read-only calls — just simulate and return the decoded result. */
  simulateOnly?: boolean;
  /** Base fee in stroops for the outer transaction, before Soroban resource fees are added. Defaults to 100. */
  baseFee?: string;
}

export interface InvokeResult {
  status: 'SIMULATED' | 'SUCCESS' | 'FAILED';
  hash?: string;
  returnValue?: unknown;
  raw: unknown;
}

/**
 * Owns everything RPC/contract-shaped so app code never touches
 * `rpc.Server` directly. `invoke()` is the 90% case: build → simulate →
 * prepare (resource footprint + fees) → sign via the connected wallet →
 * submit → poll to completion, surfacing one typed result or one
 * normalized error.
 *
 * This is also the intended seam for Saganta's gas-sponsorship and
 * smart-account signer: both can be injected as an alternate `AuthProvider`
 * here later without changing any call site that uses `invoke()`.
 */
export class SorobanConnection {
  private rpcUrl?: string;
  private rpcUrls?: string[];
  private injectedRpc?: InstanceType<RpcModule['Server']>;
  private failoverOptions?: SorobanConnectionConfig['failoverOptions'];
  private networkPassphrase: string;
  private wallet: StellarAppKit;
  private _sdk: StellarSdkModule | null = null;
  private _rpc: RpcModule | null = null;
  private _server: InstanceType<RpcModule['Server']> | null = null;
  private _failover: FailoverRpcServer | null = null;

  constructor(config: SorobanConnectionConfig) {
    this.rpcUrl = config.rpcUrl;
    this.rpcUrls = config.rpcUrls;
    this.injectedRpc = config.rpc;
    this.failoverOptions = config.failoverOptions;
    this.networkPassphrase = config.networkPassphrase;
    this.wallet = config.wallet;

    // Validate config — exactly one of rpcUrl / rpcUrls / rpc must be set.
    const sources = [config.rpcUrl, config.rpcUrls, config.rpc].filter((s) => s !== undefined);
    if (sources.length === 0) {
      throw new Error('SorobanConnectionConfig requires one of: rpcUrl, rpcUrls, or rpc');
    }
  }

  private async sdk(): Promise<StellarSdkModule> {
    return (this._sdk ??= await import('@stellar/stellar-sdk'));
  }

  private async rpc(): Promise<RpcModule> {
    return (this._rpc ??= await import('@stellar/stellar-sdk/rpc'));
  }

  private async server() {
    if (this._server) return this._server;

    // Pre-injected server (for tests or advanced setups) — use as-is.
    if (this.injectedRpc) {
      this._server = this.injectedRpc;
      return this._server;
    }

    const { Server } = await this.rpc();

    // Multiple URLs → wrap in a FailoverRpcServer.
    if (this.rpcUrls && this.rpcUrls.length > 0) {
      const servers = this.rpcUrls.map((url) => new Server(url));
      this._failover = new FailoverRpcServer({
        servers,
        ...this.failoverOptions,
      });
      this._server = this._failover.asServer();
      return this._server;
    }

    // Single URL — plain Server.
    if (!this.rpcUrl) {
      throw new Error('SorobanConnectionConfig: rpcUrl is required when rpcUrls and rpc are not set.');
    }
    this._server = new Server(this.rpcUrl);
    return this._server;
  }

  /**
   * Returns the current failover status, if the connection was configured
   * with `rpcUrls`. Returns null for single-server configs. Useful for
   * dashboards / monitoring UIs that want to show which RPC provider is
   * currently being used.
   */
  getFailoverStatus(): Array<{ url: string; healthy: boolean; failureCount: number }> | null {
    return this._failover?.getStatus() ?? null;
  }

  /** High-level: the 90% case. Builds, simulates, prepares, signs, submits, and polls a single contract call. */
  async invoke(opts: InvokeOptions): Promise<InvokeResult> {
    const sdk = await this.sdk();
    const rpc = await this.rpc();
    const server = await this.server();

    const session = this.wallet.session;
    if (!session) {
      throw ConnectError.invalidRequest('Connect a wallet before invoking a contract.');
    }

    const sourceAccount = await server.getAccount(session.address);
    const contract = new sdk.Contract(opts.contractId);

    let builder = new sdk.TransactionBuilder(sourceAccount, {
      fee: opts.baseFee ?? sdk.BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    }).addOperation(contract.call(opts.method, ...((opts.args ?? []) as never[])));

    const tx = builder.setTimeout(60).build();

    const simulation = await server.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(simulation)) {
      throw ConnectError.externalService(`Simulation failed: ${simulation.error}`, undefined, this.wallet.activeConnector?.id);
    }

    if (opts.simulateOnly) {
      return { status: 'SIMULATED', returnValue: decodeSimResult(simulation), raw: simulation };
    }

    const prepared = await server.prepareTransaction(tx);

    // Soroban auth entries (if this call needs delegated auth) are signed
    // separately from the outer transaction envelope — the wallet layer
    // exposes both via one interface, so this branches on capability, not
    // wallet identity.
    const needsAuthEntrySigning = transactionNeedsAuthEntrySigning(prepared, session.address, sdk);
    let readyTx = prepared;
    if (needsAuthEntrySigning) {
      readyTx = await this.signAuthEntries(prepared, session.address);
    }

    const { signedTxXdr } = await this.wallet.signTransaction(readyTx.toXDR(), {
      networkPassphrase: this.networkPassphrase,
    });

    const signedTx = sdk.TransactionBuilder.fromXDR(signedTxXdr, this.networkPassphrase);
    const sendResponse = await server.sendTransaction(signedTx as never);

    if (sendResponse.status !== 'PENDING') {
      throw ConnectError.externalService(
        `Transaction submission failed with status ${sendResponse.status}.`,
        sendResponse.errorResult ? [String(sendResponse.errorResult)] : undefined,
        this.wallet.activeConnector?.id
      );
    }

    const final = await server.pollTransaction(sendResponse.hash, { attempts: 15, sleepStrategy: () => 1000 });

    if (final.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
      throw ConnectError.externalService(`Transaction failed with status ${final.status}.`, undefined, this.wallet.activeConnector?.id);
    }

    return { status: 'SUCCESS', hash: sendResponse.hash, returnValue: decodeTxResult(final), raw: final };
  }

  /**
   * Builds and simulates like invoke() does, but stops there — returns a
   * decoded preview (see decode.ts) with a simulation status, balance
   * deltas, AND a fee estimate attached, instead of executing the full
   * sign/submit pipeline. Useful for showing "here's what this call will
   * do, whether it would even succeed, how balances will change, and what
   * it will cost" before the user commits to it.
   *
   * Balance deltas are extracted from the simulation's `stateChanges`
   * array — the network's own authoritative statement of what would
   * change. For account/trustline entries this surfaces "XLM balance:
   * 1000 → 900 (−100)" rather than just "you're calling transfer". For
   * contract storage changes (including SEP-41 token balances), it
   * surfaces "Contract C...: storage entry updated" — the previous
   * version only decoded the *intended* amount from call args, not the
   * actual deltas.
   *
   * The fee estimate is extracted from the simulation's `cost` field —
   * the network's own statement of what the call will cost, including
   * Soroban resource fees (CPU + memory + storage). Shown as
   * `feeEstimate.totalFeeXlm` (e.g. "0.00001 XLM") for headline display.
   *
   * Note invoke() itself already runs every signature through the preview
   * flow automatically (it calls wallet.signTransaction() under the hood,
   * which is where StellarAppKit's onPreviewTransaction hook lives) — this
   * method is for showing a preview earlier, e.g. inline in a confirm
   * button, without needing to actually call invoke() first. The balance
   * deltas and fee estimate here are NOT included in the
   * onPreviewTransaction hook (which fires at sign time, after the
   * simulation has gone stale) — call this method explicitly if you want
   * them.
   */
  async previewInvoke(opts: InvokeOptions): Promise<TransactionPreview & {
    simulationStatus: 'success' | 'failed';
    simulationError?: string;
    /** Balance deltas extracted from the simulation's stateChanges — empty for failed simulations or read-only calls. */
    balanceDeltas: BalanceDelta[];
  }> {
    const sdk = await this.sdk();
    const rpc = await this.rpc();
    const server = await this.server();

    const session = this.wallet.session;
    if (!session) {
      throw ConnectError.invalidRequest('Connect a wallet before previewing a contract call.');
    }

    const sourceAccount = await server.getAccount(session.address);
    const contract = new sdk.Contract(opts.contractId);

    const tx = new sdk.TransactionBuilder(sourceAccount, {
      fee: opts.baseFee ?? sdk.BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(contract.call(opts.method, ...((opts.args ?? []) as never[])))
      .setTimeout(60)
      .build();

    const simulation = await server.simulateTransaction(tx);
    const isFailure = rpc.Api.isSimulationError(simulation);

    // Pass the simulation into buildTransactionPreview so it can compute
    // the fee estimate (when includeFeeEstimate is set on previewOptions).
    // We merge the consumer's previewOptions with the simulation here
    // rather than mutating the original.
    const previewOpts = {
      ...this.wallet.previewOptions,
      simulation: isFailure ? undefined : simulation,
      includeFeeEstimate: this.wallet.previewOptions?.includeFeeEstimate ?? true,
    };

    const preview = await buildTransactionPreview(tx.toXDR(), this.networkPassphrase, previewOpts);

    // Only decode deltas from successful simulations — failed ones don't
    // have a stateChanges array, and decoding would just return [].
    const balanceDeltas = isFailure ? [] : await decodeSimulationDeltas(simulation);

    return {
      ...preview,
      simulationStatus: isFailure ? 'failed' : 'success',
      simulationError: isFailure ? simulation.error : undefined,
      balanceDeltas,
    };
  }

  /**
   * Estimates the fee for a given transaction XDR by simulating it.
   * Returns the full FeeEstimate breakdown — base fee, Soroban resource
   * fee, instruction count, total in stroops and XLM.
   *
   * This is a lower-level escape hatch than previewInvoke() — use it when
   * you already have a built transaction (e.g. from a contract.Client
   * call) and just want the fee number, without the full preview.
   *
   * For Soroban transactions, the simulation is required to compute the
   * resource fee — without it, we can only return the declared base fee.
   * For classic (non-Soroban) transactions, the simulation is optional
   * (there's no resource fee), but passing one doesn't hurt.
   */
  async estimateFee(xdr: string): Promise<FeeEstimate | null> {
    const sdk = await this.sdk();
    const server = await this.server();

    const tx = sdk.TransactionBuilder.fromXDR(xdr, this.networkPassphrase);
    const isFeeBump = 'innerTransaction' in tx;
    const innerTx = isFeeBump ? (tx as { innerTransaction: { fee: string; operations: unknown[] } }).innerTransaction : tx as { fee: string; operations: unknown[] };

    // Simulate to get the cost. For classic transactions this will
    // succeed but won't have a `cost` field — we still return the base
    // fee breakdown.
    const simulation = await server.simulateTransaction(tx as never).catch(() => null);

    // Use the same computeFeeEstimate logic as buildTransactionPreview
    // by calling buildTransactionPreview with includeFeeEstimate + simulation.
    const preview = await buildTransactionPreview(xdr, this.networkPassphrase, {
      includeFeeEstimate: true,
      simulation,
    });
    return preview.feeEstimate ?? null;
  }

  /**
   * Returns a typed client for a Soroban contract, bound to this
   * connection. Methods on the client are typed from the consumer's
   * TS interface (`T`), so `client.transfer({ from, to, amount })` is
   * fully typed — wrong arg names, missing fields, or wrong types are
   * caught at compile time.
   *
   * Each method delegates to `invoke()`, so it goes through the same
   * simulate → prepare → sign → submit → poll pipeline, with the
   * transaction preview flow and signature-request queueing intact.
   *
   * @param contractId The contract's address (C... form)
   * @param spec The contract's spec — either a parsed Spec object, or
   *             an array of base64 spec entry strings (from `stellar
   *             contract bindings typescript`)
   *
   * @example
   *   interface TokenContract extends defineContractSpec<{
   *     transfer: (args: { from: string; to: string; amount: bigint }) => Promise<boolean>;
   *     balanceOf: (args: { id: string }) => Promise<bigint>;
   *   }> {}
   *
   *   const token = soroban.contract<TokenContract>('C...', {
   *     specEntries: ['AAA==', 'BBB==', ...],
   *   });
   *   await token.transfer({ from, to, amount });  // typed
   */
  contract<T extends ContractSpec = ContractSpec>(
    contractId: string,
    opts: { specEntries: string[] | import('@stellar/stellar-sdk').xdr.ScSpecEntry[] }
  ): ContractClient<T> {
    return new ContractClient<T>({
      connection: this,
      contractId,
      specEntries: opts.specEntries,
    });
  }

  /** Low-level escape hatches for callers that need more control than `invoke()` gives. */
  async simulate(tx: unknown) {
    const server = await this.server();
    return server.simulateTransaction(tx as never);
  }

  async prepare(tx: unknown) {
    const server = await this.server();
    return server.prepareTransaction(tx as never);
  }

  async submit(signedXdr: string) {
    const sdk = await this.sdk();
    const server = await this.server();
    const tx = sdk.TransactionBuilder.fromXDR(signedXdr, this.networkPassphrase);
    return server.sendTransaction(tx as never);
  }

  async pollStatus(hash: string, opts?: { attempts?: number }) {
    const server = await this.server();
    return server.pollTransaction(hash, { attempts: opts?.attempts ?? 15, sleepStrategy: () => 1000 });
  }

  /**
   * Signs each Soroban auth entry that requires the connected wallet's
   * signature, via `wallet.signAuthEntry()` rather than a second
   * `signTransaction` call.
   *
   * Uses `@stellar/stellar-base`'s `authorizeEntry()` helper, which handles:
   *   - Cloning the entry (so the caller's object isn't mutated)
   *   - Setting `signatureExpirationLedger` (to latestLedger + 100)
   *   - Building the `HashIdPreimage` (networkId + nonce + invocation + expiration)
   *   - Hashing it with SHA-256
   *   - Calling our signer callback with the preimage
   *   - Verifying the returned signature locally (guards against buggy/malicious wallets)
   *   - Wrapping the signature into the correct `ScVal` structure
   *     (`scvVec([scvMap({public_key, signature})])`)
   *   - Reinserting it into `credentials().address().signature()`
   *
   * The wallet-facing contract: `signAuthEntry(preimageBase64, opts)` →
   * `{signedAuthEntry: signatureBase64, signerAddress}`. The wallet signs
   * `SHA256(preimageBytes)` and returns the raw 64-byte Ed25519 signature.
   * The wallet does NOT need to know about ScVal wrapping — `authorizeEntry`
   * handles that.
   *
   * Only entries with `SOROBAN_CREDENTIALS_ADDRESS` credentials bound to
   * the connected wallet's address AND with `signature() === scvVoid`
   * (not already signed) are signed. Source-account credentials and
   * entries bound to other addresses are left untouched.
   */
  private async signAuthEntries(
    tx: InstanceType<StellarSdkModule['Transaction']>,
    walletAddress: string
  ): Promise<InstanceType<StellarSdkModule['Transaction']>> {
    const sdk = await this.sdk();
    const server = await this.server();

    // 1. Find invokeHostFunction operations with auth entries.
    // Only invokeHostFunction ops have auth — other op types don't.
    const invokeOp = tx.operations.find(
      (op) => op.type === 'invokeHostFunction' && Array.isArray((op as { auth?: unknown[] }).auth) && ((op as { auth?: unknown[] }).auth?.length ?? 0) > 0
    ) as { type: 'invokeHostFunction'; auth: import('@stellar/stellar-sdk').xdr.SorobanAuthorizationEntry[]; func: unknown; source?: string } | undefined;

    if (!invokeOp || !invokeOp.auth?.length) return tx;

    // 2. Compute the signature expiration ledger.
    // The auth entry is valid until this ledger number. Using latestLedger + 100
    // gives ~8 minutes of validity (at ~5s per ledger) — enough for the
    // transaction to be submitted and included.
    const latestLedger = await server.getLatestLedger();
    const validUntil = latestLedger.sequence + 100;

    // 3. Walk auth entries, sign the ones bound to our address that are unsigned.
    for (let i = 0; i < invokeOp.auth.length; i++) {
      const entry = invokeOp.auth[i];
      if (!entry) continue;

      // 3a. Skip source-account credentials (no signing needed — the outer
      //     transaction's signature covers these implicitly).
      const credSwitch = entry.credentials().switch();
      if (credSwitch.value !== sdk.xdr.SorobanCredentialsType.sorobanCredentialsAddress().value) {
        continue;
      }

      // 3b. Skip entries bound to a different address (multi-party auth:
      //     not ours to sign).
      const addrCreds = entry.credentials().address();
      const boundAddress = sdk.Address.fromScAddress(addrCreds.address()).toString();
      if (boundAddress !== walletAddress) continue;

      // 3c. Skip entries that are already signed.
      if (addrCreds.signature().switch().name !== 'scvVoid') continue;

      // 3d. Sign via authorizeEntry, wrapping wallet.signAuthEntry into
      //     the SigningCallback shape authorizeEntry expects.
      // authorizeEntry's callback receives the HashIdPreimage XDR object
      // and expects a Buffer back (the raw signature). We adapt our
      // wallet's signAuthEntry (which takes/returns base64 strings) into
      // that contract.
      invokeOp.auth[i] = await sdk.authorizeEntry(
        entry,
        async (preimage: import('@stellar/stellar-sdk').xdr.HashIdPreimage) => {
          const preimageBase64 = preimage.toXDR('base64');
          const result = await this.wallet.signAuthEntry(preimageBase64, {
            networkPassphrase: this.networkPassphrase,
            address: walletAddress,
          });
          // Return the raw signature as a Buffer — authorizeEntry will
          // verify it locally (Keypair.verify(payload, signature)) and
          // wrap it into the ScVal structure.
          return Buffer.from(result.signedAuthEntry, 'base64');
        },
        validUntil,
        this.networkPassphrase
      );
    }

    return tx;
  }
}

/**
 * Checks whether a prepared transaction has any unsigned Soroban auth
 * entries that require the connected wallet's signature.
 *
 * Returns true if ANY invokeHostFunction operation has an auth entry with:
 *   - SOROBAN_CREDENTIALS_ADDRESS credentials (needs separate signing)
 *   - The bound address matches walletAddress (our wallet's to sign)
 *   - signature() is scvVoid (not already signed)
 *
 * Source-account credentials (SOROBAN_CREDENTIALS_SOURCE_ACCOUNT) don't
 * need separate signing — the outer transaction's signature covers them.
 */
function transactionNeedsAuthEntrySigning(
  tx: unknown,
  walletAddress: string,
  sdk: StellarSdkModule
): boolean {
  const ops = (tx as { operations: unknown[] }).operations;
  for (const op of ops) {
    const typedOp = op as { type: string; auth?: unknown[] };
    if (typedOp.type !== 'invokeHostFunction' || !typedOp.auth) continue;
    for (const entry of typedOp.auth as import('@stellar/stellar-sdk').xdr.SorobanAuthorizationEntry[]) {
      const credSwitch = entry.credentials().switch();
      if (credSwitch.value !== sdk.xdr.SorobanCredentialsType.sorobanCredentialsAddress().value) {
        continue;
      }
      const addrCreds = entry.credentials().address();
      const boundAddress = sdk.Address.fromScAddress(addrCreds.address()).toString();
      if (boundAddress !== walletAddress) continue;
      if (addrCreds.signature().switch().name === 'scvVoid') return true;
    }
  }
  return false;
}

function decodeSimResult(simulation: unknown): unknown {
  // Real implementation uses scValToNative() on simulation.result.retval.
  return simulation;
}

function decodeTxResult(final: unknown): unknown {
  // Real implementation uses scValToNative() on the return value in final.resultMetaXdr.
  return final;
}
