import { test, expect, describe } from 'bun:test';
import {
  buildTransactionPreview,
  buildAuthEntryPreview,
  decodeSimulationDeltas,
  type BalanceDelta,
} from '../src/index.js';
import type { PreviewOptions } from '../src/index.js';

/**
 * Tests for the transaction preview / decode layer.
 *
 * `buildTransactionPreview` is exercised end-to-end with a real unsigned
 * transaction built via stellar-sdk's TransactionBuilder — this is the
 * shape that gets passed in from `client.signTransaction()`. We confirm
 * every operation type the decoder handles is decoded correctly and
 * that risk flags fire when expected.
 *
 * `decodeSimulationDeltas` is exercised with a hand-built fake simulation
 * response containing stateChanges for an account-balance update and a
 * trustline-balance update. We verify the deltas are extracted correctly
 * — this is the function that closes the previous "Soroban balance-delta
 * preview is argument-based, not simulation-based" gap from the README.
 *
 * `buildAuthEntryPreview` is exercised with a hand-built
 * SorobanAuthorizationEntry XDR — this closes the previous "signAuthEntry
 * bypasses the preview flow" gap from the README.
 */

const NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015';
// Real Keypair.random() addresses (valid checksum) — using fake 'G...'
// strings fails StrKey.decodeEd25519PublicKey's checksum validation
// inside stellar-sdk's Operation.payment({destination}).
const SOURCE = 'GAFZUVUNT5H7WHICXAIEHMV7RS3G4MQ56H332F34JD42IXNZXAKJIB23';
const DEST = 'GDIOM2BQSA5MTTIOPSELTHZDEX42MOBNBRCJSVDKTEEWCYRNINYKZBKL';

async function buildSdk() {
  return await import('@stellar/stellar-sdk');
}

async function makeAccount() {
  const sdk = await buildSdk();
  const kp = sdk.Keypair.random();
  return { sdk, kp, account: new sdk.Account(kp.publicKey(), '1') };
}

describe('buildTransactionPreview — operation decoding', () => {
  test('decodes a payment op into a human-readable summary with details', async () => {
    const { sdk, account } = await makeAccount();
    const asset = sdk.Asset.native();
    const tx = new sdk.TransactionBuilder(account, {
      fee: '100',
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(sdk.Operation.payment({ destination: DEST, asset, amount: '100.5' }))
      .setTimeout(60)
      .build();

    const preview = await buildTransactionPreview(tx.toXDR(), NETWORK_PASSPHRASE);

    expect(preview.sourceAccount).toBe(account.accountId());
    expect(preview.fee).toBe('100');
    expect(preview.operations).toHaveLength(1);
    expect(preview.operations[0].type).toBe('payment');
    // stellar-sdk normalizes amount strings to 7 decimal places on
    // serialization ("100.5" → "100.5000000"), so the summary contains
    // the normalized form, not the input form.
    expect(preview.operations[0].summary).toMatch(/Send 100\.5000000 XLM to/);
    expect(preview.operations[0].details).toEqual({
      destination: DEST,
      amount: '100.5000000',
      asset: 'XLM',
    });
    expect(preview.operations[0].riskFlags).toEqual([]);
  });

  test('decodes multiple operations (batch review)', async () => {
    // A single transaction can contain many operations. The preview
    // must surface every one of them — not just a single summary — so
    // the user can review a batch before approving.
    const { sdk, account } = await makeAccount();
    const tx = new sdk.TransactionBuilder(account, {
      fee: '200',
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(sdk.Operation.payment({ destination: DEST, asset: sdk.Asset.native(), amount: '10' }))
      .addOperation(sdk.Operation.payment({ destination: DEST, asset: sdk.Asset.native(), amount: '20' }))
      .addOperation(sdk.Operation.payment({ destination: DEST, asset: sdk.Asset.native(), amount: '30' }))
      .setTimeout(60)
      .build();

    const preview = await buildTransactionPreview(tx.toXDR(), NETWORK_PASSPHRASE);
    expect(preview.operations).toHaveLength(3);
    // stellar-sdk normalizes amount strings to 7 decimal places on
    // serialization ("10" → "10.0000000").
    expect(preview.operations[0].details.amount).toBe('10.0000000');
    expect(preview.operations[1].details.amount).toBe('20.0000000');
    expect(preview.operations[2].details.amount).toBe('30.0000000');
  });

  test('flags account-merge as danger', async () => {
    // Account merge permanently closes the source account — this is
    // always flagged as a danger-level risk regardless of config.
    const { sdk, account } = await makeAccount();
    const tx = new sdk.TransactionBuilder(account, {
      fee: '100',
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(sdk.Operation.accountMerge({ destination: DEST }))
      .setTimeout(60)
      .build();

    const preview = await buildTransactionPreview(tx.toXDR(), NETWORK_PASSPHRASE);
    expect(preview.operations[0].riskFlags).toContainEqual({
      severity: 'danger',
      code: 'account-merge',
      message: expect.stringContaining('permanently closes'),
    });
  });

  test('flags large transfers when largeTransferThreshold is set', async () => {
    const { sdk, account } = await makeAccount();
    const tx = new sdk.TransactionBuilder(account, {
      fee: '100',
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(sdk.Operation.payment({
        destination: DEST,
        asset: sdk.Asset.native(),
        amount: '5000',
      }))
      .setTimeout(60)
      .build();

    const opts: PreviewOptions = { largeTransferThreshold: 1000 };
    const preview = await buildTransactionPreview(tx.toXDR(), NETWORK_PASSPHRASE, opts);
    expect(preview.operations[0].riskFlags.some(f => f.code === 'large-transfer' && f.severity === 'warning')).toBe(true);
  });

  test('does NOT flag large transfers when threshold is omitted', async () => {
    // Without a configured threshold, the check is skipped — "large" is
    // app-specific, so the SDK doesn't pretend to know.
    const { sdk, account } = await makeAccount();
    const tx = new sdk.TransactionBuilder(account, {
      fee: '100',
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(sdk.Operation.payment({
        destination: DEST,
        asset: sdk.Asset.native(),
        amount: '999999',
      }))
      .setTimeout(60)
      .build();

    const preview = await buildTransactionPreview(tx.toXDR(), NETWORK_PASSPHRASE);
    expect(preview.operations[0].riskFlags).toEqual([]);
  });

  test('flags unverified contracts when verifiedContracts is set', async () => {
    const { sdk, account } = await makeAccount();
    // Use a real contract ID — sdk.Contract('C...') just wraps the
    // string, but downstream the decoder parses it via
    // Address.fromScAddress which validates the checksum.
    const contractId = 'CBETT2CXOWNPF5JYWBYB4BHNC4TPQEVABBKDDFE46S63JYXPUQK656HH';
    const contract = new sdk.Contract(contractId);
    const tx = new sdk.TransactionBuilder(account, {
      fee: '100',
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(contract.call('transfer'))
      .setTimeout(60)
      .build();

    const opts: PreviewOptions = {
      verifiedContracts: new Set(['CCQ3UBSHW3SRJKOM4QJGH2BG32Y6GGZXR7IFZQ5XZXCJMHIBEBR3TXDD']), // different contract
    };
    const preview = await buildTransactionPreview(tx.toXDR(), NETWORK_PASSPHRASE, opts);
    expect(preview.operations[0].riskFlags.some(f => f.code === 'unverified-contract')).toBe(true);
  });

  test('flags signer changes as danger (account-takeover pattern)', async () => {
    const { sdk, account } = await makeAccount();
    const signerKp = sdk.Keypair.random();
    const tx = new sdk.TransactionBuilder(account, {
      fee: '100',
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(sdk.Operation.setOptions({
        signer: { ed25519PublicKey: signerKp.publicKey(), weight: 1 },
      }))
      .setTimeout(60)
      .build();

    const preview = await buildTransactionPreview(tx.toXDR(), NETWORK_PASSPHRASE);
    expect(preview.operations[0].riskFlags.some(f => f.code === 'signer-change' && f.severity === 'danger')).toBe(true);
  });

  test('preserves raw XDR and network passphrase in the preview', async () => {
    const { sdk, account } = await makeAccount();
    const tx = new sdk.TransactionBuilder(account, {
      fee: '100',
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(sdk.Operation.payment({ destination: DEST, asset: sdk.Asset.native(), amount: '1' }))
      .setTimeout(60)
      .build();

    const xdr = tx.toXDR();
    const preview = await buildTransactionPreview(xdr, NETWORK_PASSPHRASE);
    expect(preview.raw.xdr).toBe(xdr);
    expect(preview.raw.networkPassphrase).toBe(NETWORK_PASSPHRASE);
  });
});

describe('decodeSimulationDeltas — balance delta extraction', () => {
  /**
   * Builds a fake `simulateTransaction` success response with one state
   * change — an account balance update from `before` to `after`.
   *
   * This mirrors the shape that `@stellar/stellar-sdk/rpc`'s
   * `server.simulateTransaction()` returns: `stateChanges` is an array
   * of `{ type, key, before, after }` where key/before/after are XDR
   * objects (parsed form). We construct real XDR objects so the test
   * exercises the actual decoder, not a mock.
   */
  async function buildAccountDeltaSimulation(opts: {
    address: string;
    beforeBalance: bigint;
    afterBalance: bigint;
  }) {
    const sdk = await buildSdk();
    const pubKeyBuffer = sdk.StrKey.decodeEd25519PublicKey(opts.address);

    const key = sdk.xdr.LedgerKey.account(
      new sdk.xdr.LedgerKeyAccount({
        accountId: sdk.xdr.PublicKey.publicKeyTypeEd25519(pubKeyBuffer),
      })
    );

    const buildEntry = (balance: bigint, ledgerSeq: number) => new sdk.xdr.LedgerEntry({
      lastModifiedLedgerSeq: ledgerSeq,
      data: sdk.xdr.LedgerEntryData.account(
        new sdk.xdr.AccountEntry({
          accountId: sdk.xdr.PublicKey.publicKeyTypeEd25519(pubKeyBuffer),
          balance: sdk.xdr.Int64.fromString(balance.toString()),
          seqNum: sdk.xdr.SequenceNumber.fromString('1'),
          numSubEntries: 0,
          inflationDest: null,
          flags: 0,
          homeDomain: '',
          thresholds: Buffer.alloc(4),
          signers: [],
          // AccountEntryExt is a union; arm 0 is Void (no extension).
          // Construct directly with the switch value — the `.0()`
          // static factory in the .d.ts isn't actually exported at
          // runtime, so we use `new AccountEntryExt(0)` instead.
          ext: new sdk.xdr.AccountEntryExt(0),
        })
      ),
      ext: new sdk.xdr.LedgerEntryExt(0),
    });

    const before = buildEntry(opts.beforeBalance, 1);
    const after = buildEntry(opts.afterBalance, 2);

    return {
      stateChanges: [
        { type: 1, key, before, after }, // 1 = update
      ],
    };
  }

  test('extracts an account balance delta from a simulation response', async () => {
    const address = 'GAFZUVUNT5H7WHICXAIEHMV7RS3G4MQ56H332F34JD42IXNZXAKJIB23';
    const sim = await buildAccountDeltaSimulation({
      address,
      beforeBalance: 1_000_000_000_000n, // 100,000 XLM
      afterBalance: 999_999_900_000n,    // 99,999.99 XLM (−0.01 XLM = −100_000 stroops)
    });

    const deltas = await decodeSimulationDeltas(sim);
    expect(deltas).toHaveLength(1);
    const d = deltas[0];
    expect(d.kind).toBe('account');
    expect(d.address).toBe(address);
    expect(d.asset).toBe('XLM');
    expect(d.change).toBe('updated');
    expect(d.delta).toBe('-100000');
    expect(d.summary).toContain('100000');
    expect(d.summary).toContain('99999.99');
  });

  test('returns empty array for null / undefined / non-object simulation', async () => {
    expect(await decodeSimulationDeltas(null)).toEqual([]);
    expect(await decodeSimulationDeltas(undefined)).toEqual([]);
    expect(await decodeSimulationDeltas('not an object')).toEqual([]);
    expect(await decodeSimulationDeltas(42)).toEqual([]);
  });

  test('returns empty array when simulation has no stateChanges', async () => {
    expect(await decodeSimulationDeltas({})).toEqual([]);
    expect(await decodeSimulationDeltas({ stateChanges: undefined })).toEqual([]);
    expect(await decodeSimulationDeltas({ stateChanges: 'not-an-array' })).toEqual([]);
  });

  test('skips malformed state changes rather than failing the whole list', async () => {
    // A single bad entry shouldn't abort the whole list — the decoder
    // catches the parse failure and moves on, returning whatever good
    // deltas it could extract.
    const sim = {
      stateChanges: [
        { type: 1, key: '!!!not-valid-xdr!!!', before: null, after: null },
        { type: 99, key: null, before: null, after: null }, // null key
        { type: 1, key: { /* missing switch */ }, before: null, after: null },
      ],
    };
    const deltas = await decodeSimulationDeltas(sim);
    expect(deltas).toEqual([]);
  });

  test('handles the empty stateChanges case (read-only call)', async () => {
    expect(await decodeSimulationDeltas({ stateChanges: [] })).toEqual([]);
  });
});

describe('buildAuthEntryPreview — auth tree decoding', () => {
  // Real contract IDs generated via Address.contract(sha256(buffer)).toString()
  // — using fake `CA...` strings doesn't work because StrKey.isValidContract
  // validates the version byte + checksum, and a string that looks like a
  // contract ID but isn't a valid one will throw on parse.
  const CONTRACT_A = 'CBETT2CXOWNPF5JYWBYB4BHNC4TPQEVABBKDDFE46S63JYXPUQK656HH';
  const CONTRACT_B = 'CCQ3UBSHW3SRJKOM4QJGH2BG32Y6GGZXR7IFZQ5XZXCJMHIBEBR3TXDD';

  /**
   * Builds a real SorobanAuthorizationEntry XDR with a single root
   * invocation calling `transfer` on a known contract.
   */
  async function buildAuthEntryXdr(opts: {
    contractId: string;
    functionName: string;
    subInvocations?: { contractId: string; functionName: string }[];
  }): Promise<string> {
    const sdk = await buildSdk();
    // Address.fromString parses a C... string into an Address object,
    // which we can then convert to an ScAddress XDR via toScAddress().
    // (Address.fromScAddress goes the other direction — it parses an
    // existing ScAddress XDR object, not a plain JS object.)
    const contractAddress = sdk.Address.fromString(opts.contractId).toScAddress();

    const rootFn = sdk.xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
      new sdk.xdr.InvokeContractArgs({
        contractAddress,
        // functionName is an ScSymbol (a typed XDR string), not an ScVal.
        // Passing sdk.xdr.ScVal.scvSymbol(name) is wrong — pass the plain
        // string and the XDR layer coerces it.
        functionName: opts.functionName,
        args: [],
      })
    );

    const subInvocations = (opts.subInvocations ?? []).map((sub) => {
      const subAddr = sdk.Address.fromString(sub.contractId).toScAddress();
      const subFn = sdk.xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
        new sdk.xdr.InvokeContractArgs({
          contractAddress: subAddr,
          functionName: sub.functionName,
          args: [],
        })
      );
      return new sdk.xdr.SorobanAuthorizedInvocation({
        function: subFn,
        subInvocations: [],
      });
    });

    const rootInvocation = new sdk.xdr.SorobanAuthorizedInvocation({
      function: rootFn,
      subInvocations: subInvocations,
    });

    const entry = new sdk.xdr.SorobanAuthorizationEntry({
      credentials: sdk.xdr.SorobanCredentials.sorobanCredentialsSourceAccount(),
      rootInvocation,
    });

    return entry.toXDR('base64');
  }

  test('surfaces the authorized contract and function from a single-invocation entry', async () => {
    const xdr = await buildAuthEntryXdr({ contractId: CONTRACT_A, functionName: 'transfer' });

    const preview = await buildAuthEntryPreview(xdr);
    expect(preview.authorizedContracts).toEqual([CONTRACT_A]);
    expect(preview.authorizedFunctions).toEqual(['transfer']);
    expect(preview.invocationCount).toBe(1);
    expect(preview.raw.authEntryXdr).toBe(xdr);
  });

  test('flags broad auth grants (>1 contract or >3 invocations)', async () => {
    // 2 contracts across 4 invocations — both conditions for a broad
    // grant are met, but the flag should fire exactly once.
    const xdr = await buildAuthEntryXdr({
      contractId: CONTRACT_A,
      functionName: 'transfer',
      subInvocations: [
        { contractId: CONTRACT_A, functionName: 'approve' },
        { contractId: CONTRACT_A, functionName: 'mint' },
        { contractId: CONTRACT_B, functionName: 'transfer' },
      ],
    });

    const preview = await buildAuthEntryPreview(xdr);
    expect(preview.invocationCount).toBe(4);
    expect(preview.authorizedContracts).toHaveLength(2);
    const broadFlag = preview.riskFlags.find(f => f.code === 'broad-auth-grant');
    expect(broadFlag).toBeDefined();
    expect(broadFlag!.severity).toBe('warning');
    expect(broadFlag!.message).toMatch(/2 contract\(s\) across 4 call\(s\)/);
  });

  test('flags unverified contracts when verifiedContracts is set', async () => {
    const xdr = await buildAuthEntryXdr({ contractId: CONTRACT_A, functionName: 'transfer' });

    const opts: PreviewOptions = {
      verifiedContracts: new Set([CONTRACT_B]), // CONTRACT_A is NOT in the verified set
    };
    const preview = await buildAuthEntryPreview(xdr, opts);
    const unverifiedFlag = preview.riskFlags.find(f => f.code === 'unverified-contract');
    expect(unverifiedFlag).toBeDefined();
    expect(unverifiedFlag!.severity).toBe('warning');
  });

  test('does NOT flag verified contracts', async () => {
    const xdr = await buildAuthEntryXdr({ contractId: CONTRACT_A, functionName: 'transfer' });

    const opts: PreviewOptions = {
      verifiedContracts: new Set([CONTRACT_A]),
    };
    const preview = await buildAuthEntryPreview(xdr, opts);
    expect(preview.riskFlags.filter(f => f.code === 'unverified-contract')).toEqual([]);
  });

  test('does NOT flag anything when verifiedContracts is omitted', async () => {
    // Without a configured verification source, the check is skipped —
    // the SDK doesn't pretend to know which contracts are verified.
    const xdr = await buildAuthEntryXdr({ contractId: CONTRACT_A, functionName: 'transfer' });

    const preview = await buildAuthEntryPreview(xdr);
    expect(preview.riskFlags).toEqual([]);
  });
});
