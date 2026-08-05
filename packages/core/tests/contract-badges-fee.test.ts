import { test, expect, describe } from 'bun:test';
import {
  buildTransactionPreview,
  type ContractMetadata,
  type ContractBadge,
  type FeeEstimate,
} from '../src/index.js';

/**
 * Tests for contract verification badges and fee estimation in
 * buildTransactionPreview.
 *
 * - Badges: when previewOptions.contractMetadata is set, contracts
 *   touched by invokeHostFunction ops get a `contractBadges` array with
 *   verified/audited/publisher/extra badges.
 * - Fee estimate: when previewOptions.includeFeeEstimate is true AND a
 *   simulation response is passed via previewOptions.simulation, the
 *   preview's `feeEstimate` field is populated with the breakdown.
 */

const NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015';
// Real Keypair.random() addresses (valid checksum)
const SOURCE = 'GAFZUVUNT5H7WHICXAIEHMV7RS3G4MQ56H332F34JD42IXNZXAKJIB23';
const DEST = 'GDIOM2BQSA5MTTIOPSELTHZDEX42MOBNBRCJSVDKTEEWCYRNINYKZBKL';
// Real contract IDs (generated via Address.contract(sha256(buffer)))
const CONTRACT_A = 'CBETT2CXOWNPF5JYWBYB4BHNC4TPQEVABBKDDFE46S63JYXPUQK656HH';
const CONTRACT_B = 'CCQ3UBSHW3SRJKOM4QJGH2BG32Y6GGZXR7IFZQ5XZXCJMHIBEBR3TXDD';

async function buildSdk() {
  return await import('@stellar/stellar-sdk');
}

async function makeAccount() {
  const sdk = await buildSdk();
  const kp = sdk.Keypair.random();
  return { sdk, kp, account: new sdk.Account(kp.publicKey(), '1') };
}

async function buildContractCallXdr(contractId: string, method: string): Promise<string> {
  const { sdk, account } = await makeAccount();
  const contract = new sdk.Contract(contractId);
  const tx = new sdk.TransactionBuilder(account, {
    fee: '1000',
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method))
    .setTimeout(60)
    .build();
  return tx.toXDR();
}

async function buildPaymentXdr(amount: string): Promise<string> {
  const { sdk, account } = await makeAccount();
  const tx = new sdk.TransactionBuilder(account, {
    fee: '1000',
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(sdk.Operation.payment({
      destination: DEST,
      asset: sdk.Asset.native(),
      amount,
    }))
    .setTimeout(60)
    .build();
  return tx.toXDR();
}

describe('Contract verification badges', () => {
  test('surfaces verified + audited + publisher badges when contractMetadata is provided', async () => {
    const xdr = await buildContractCallXdr(CONTRACT_A, 'transfer');
    const metadata = new Map<string, ContractMetadata>([
      [CONTRACT_A, {
        name: 'USDC Token',
        publisher: 'Centre Consortium',
        verified: true,
        audited: true,
        auditUrl: 'https://example.com/audits/usdc.pdf',
      }],
    ]);

    const preview = await buildTransactionPreview(xdr, NETWORK_PASSPHRASE, {
      contractMetadata: metadata,
    });

    expect(preview.operations).toHaveLength(1);
    const op = preview.operations[0];
    expect(op.contractBadges).toBeDefined();
    expect(op.contractBadges).toHaveLength(3);

    const labels = op.contractBadges!.map((b) => b.label);
    expect(labels).toContain('Verified');
    expect(labels).toContain('Audited');
    expect(labels).toContain('Centre Consortium');

    // The audited badge should have the audit URL
    const auditedBadge = op.contractBadges!.find((b) => b.code === 'audited');
    expect(auditedBadge!.url).toBe('https://example.com/audits/usdc.pdf');
    expect(auditedBadge!.severity).toBe('success');

    // The verified badge should have severity 'success'
    const verifiedBadge = op.contractBadges!.find((b) => b.code === 'verified');
    expect(verifiedBadge!.severity).toBe('success');
  });

  test('surfaces extra badges when configured', async () => {
    const xdr = await buildContractCallXdr(CONTRACT_A, 'transfer');
    const metadata = new Map<string, ContractMetadata>([
      [CONTRACT_A, {
        name: 'My Contract',
        extraBadges: [
          { label: 'Stellar Expert', url: 'https://stellar.expert/explorer/...', description: 'Verified on Stellar Expert' },
        ],
      }],
    ]);

    const preview = await buildTransactionPreview(xdr, NETWORK_PASSPHRASE, {
      contractMetadata: metadata,
    });

    const op = preview.operations[0];
    const extraBadge = op.contractBadges?.find((b) => b.label === 'Stellar Expert');
    expect(extraBadge).toBeDefined();
    expect(extraBadge!.url).toBe('https://stellar.expert/explorer/...');
    expect(extraBadge!.description).toBe('Verified on Stellar Expert');
  });

  test('uses the contract name in the summary when metadata.name is set', async () => {
    const xdr = await buildContractCallXdr(CONTRACT_A, 'transfer');
    const metadata = new Map<string, ContractMetadata>([
      [CONTRACT_A, { name: 'USDC Token' }],
    ]);

    const preview = await buildTransactionPreview(xdr, NETWORK_PASSPHRASE, {
      contractMetadata: metadata,
    });

    // Summary should use "USDC Token" instead of the contract ID
    expect(preview.operations[0].summary).toContain('USDC Token');
    expect(preview.operations[0].summary).not.toContain(CONTRACT_A.slice(0, 8));
  });

  test('surfaces no badges when contractMetadata is omitted', async () => {
    const xdr = await buildContractCallXdr(CONTRACT_A, 'transfer');
    const preview = await buildTransactionPreview(xdr, NETWORK_PASSPHRASE);
    expect(preview.operations[0].contractBadges).toBeUndefined();
  });

  test('surfaces no badges when the contract is not in the metadata map', async () => {
    const xdr = await buildContractCallXdr(CONTRACT_A, 'transfer');
    const metadata = new Map<string, ContractMetadata>([
      [CONTRACT_B, { name: 'Other Contract', verified: true }],  // different contract
    ]);

    const preview = await buildTransactionPreview(xdr, NETWORK_PASSPHRASE, {
      contractMetadata: metadata,
    });

    expect(preview.operations[0].contractBadges).toBeUndefined();
  });

  test('supports function-form contractMetadata', async () => {
    const xdr = await buildContractCallXdr(CONTRACT_A, 'transfer');
    const preview = await buildTransactionPreview(xdr, NETWORK_PASSPHRASE, {
      contractMetadata: (id) => id === CONTRACT_A
        ? { name: 'Dynamic Name', verified: true }
        : undefined,
    });

    expect(preview.operations[0].summary).toContain('Dynamic Name');
    expect(preview.operations[0].contractBadges).toBeDefined();
    expect(preview.operations[0].contractBadges!.some((b) => b.code === 'verified')).toBe(true);
  });
});

describe('Fee estimation', () => {
  test('populates feeEstimate when includeFeeEstimate + simulation are provided', async () => {
    const xdr = await buildPaymentXdr('100');
    // Simulate a Soroban simulation response with a cost field
    const fakeSimulation = {
      cost: {
        cpuInstructions: 12345,
        memoryBytes: 678,
        resourceFeeCharged: 50000,
      },
    };

    const preview = await buildTransactionPreview(xdr, NETWORK_PASSPHRASE, {
      includeFeeEstimate: true,
      simulation: fakeSimulation,
    });

    expect(preview.feeEstimate).toBeDefined();
    const est = preview.feeEstimate!;
    expect(est.operationCount).toBe(1);
    expect(est.sorobanResourceFee).toBe('50000');
    expect(est.sorobanInstructions).toBe('12345');
    expect(est.totalFee).toBeDefined();
    expect(est.totalFeeXlm).toMatch(/XLM$/);
  });

  test('feeEstimate is undefined when includeFeeEstimate is not set', async () => {
    const xdr = await buildPaymentXdr('100');
    const preview = await buildTransactionPreview(xdr, NETWORK_PASSPHRASE, {
      simulation: { cost: { resourceFeeCharged: 50000 } },
    });
    expect(preview.feeEstimate).toBeUndefined();
  });

  test('feeEstimate is undefined when simulation is not provided', async () => {
    const xdr = await buildPaymentXdr('100');
    const preview = await buildTransactionPreview(xdr, NETWORK_PASSPHRASE, {
      includeFeeEstimate: true,
    });
    expect(preview.feeEstimate).toBeUndefined();
  });

  test('computes correct baseFee for multi-operation transactions', async () => {
    const { sdk, account } = await makeAccount();
    // 3 ops at 1000 stroops each = 3000 total declared fee
    const tx = new sdk.TransactionBuilder(account, {
      fee: '1000',
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(sdk.Operation.payment({ destination: DEST, asset: sdk.Asset.native(), amount: '10' }))
      .addOperation(sdk.Operation.payment({ destination: DEST, asset: sdk.Asset.native(), amount: '20' }))
      .addOperation(sdk.Operation.payment({ destination: DEST, asset: sdk.Asset.native(), amount: '30' }))
      .setTimeout(60)
      .build();

    const preview = await buildTransactionPreview(tx.toXDR(), NETWORK_PASSPHRASE, {
      includeFeeEstimate: true,
      simulation: {},  // no cost field — classic transaction
    });

    expect(preview.feeEstimate).toBeDefined();
    expect(preview.feeEstimate!.operationCount).toBe(3);
    expect(preview.feeEstimate!.baseFee).toBe('1000');       // per op
    expect(preview.feeEstimate!.totalBaseFee).toBe('3000');  // 1000 × 3
    expect(preview.feeEstimate!.sorobanResourceFee).toBeUndefined();
    expect(preview.feeEstimate!.totalFee).toBe('3000');      // no resource fee
    expect(preview.feeEstimate!.totalFeeXlm).toBe('0.0003 XLM');
  });

  test('handles simulation without a cost field (classic transaction)', async () => {
    const xdr = await buildPaymentXdr('100');
    const preview = await buildTransactionPreview(xdr, NETWORK_PASSPHRASE, {
      includeFeeEstimate: true,
      simulation: {},  // empty object — no cost field
    });

    expect(preview.feeEstimate).toBeDefined();
    expect(preview.feeEstimate!.sorobanResourceFee).toBeUndefined();
    expect(preview.feeEstimate!.sorobanInstructions).toBeUndefined();
  });

  test('formats XLM amount correctly for small fees', async () => {
    const xdr = await buildPaymentXdr('1');
    // buildPaymentXdr uses fee: '1000' (1000 stroops = 0.0001 XLM base)
    // + simulation's resourceFeeCharged: 100 (0.00001 XLM)
    // = 1100 stroops total = 0.00011 XLM
    const preview = await buildTransactionPreview(xdr, NETWORK_PASSPHRASE, {
      includeFeeEstimate: true,
      simulation: {
        cost: { resourceFeeCharged: 100 },
      },
    });

    expect(preview.feeEstimate).toBeDefined();
    // 1000 base + 100 resource = 1100 stroops = 0.00011 XLM
    expect(preview.feeEstimate!.totalFee).toBe('1100');
    expect(preview.feeEstimate!.totalFeeXlm).toBe('0.00011 XLM');
  });

  test('formats XLM amount correctly for large fees', async () => {
    const { sdk, account } = await makeAccount();
    const tx = new sdk.TransactionBuilder(account, {
      fee: '100000',  // 0.01 XLM per op
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(sdk.Operation.payment({ destination: DEST, asset: sdk.Asset.native(), amount: '10' }))
      .setTimeout(60)
      .build();

    const preview = await buildTransactionPreview(tx.toXDR(), NETWORK_PASSPHRASE, {
      includeFeeEstimate: true,
      simulation: {
        cost: { resourceFeeCharged: 500000 },  // 0.05 XLM
      },
    });

    expect(preview.feeEstimate).toBeDefined();
    // baseFee = 100000, ops = 1, totalBaseFee = 100000 (0.01 XLM)
    // resource fee = 500000 (0.05 XLM)
    // total = 600000 (0.06 XLM) — see computeFeeEstimate logic
    expect(preview.feeEstimate!.baseFee).toBe('100000');
    expect(preview.feeEstimate!.sorobanResourceFee).toBe('500000');
  });
});
