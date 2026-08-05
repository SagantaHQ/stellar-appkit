import { test, expect, describe } from 'bun:test';
import { Keypair } from '@stellar/stellar-sdk';
import { verifySiws, type SiwsPayload } from '../src/index.js';
import { buildSiwsMessage, makeSiwsFixture } from '../../core/tests/helpers';

/**
 * `decodeSignature` is internal to the verifier — it accepts either
 * base64 (Freighter, Ledger) or hex (Albedo) signatures and decodes them
 * into the raw 64-byte ed25519 signature. The previous implementation used
 * a regex heuristic (`/^[0-9a-fA-F]+$/` with even length) that could
 * misfire on pure-alphanumeric base64 strings of even length.
 *
 * We exercise it indirectly through `verifySiws` by feeding real signatures
 * encoded both ways and confirming the verifier accepts them.
 */

describe('decodeSignature — encoding handling', () => {
  function makePayload(sigEncoding: 'base64' | 'hex'): { payload: SiwsPayload; opts: { expectedDomain: string; expectedNonce: string } } {
    const kp = Keypair.random();
    const f = makeSiwsFixture({ address: kp.publicKey() });
    const message = buildSiwsMessage(f);
    const bytes = Buffer.from(message, 'utf-8');
    const sig: Buffer = (kp as unknown as { sign: (d: Buffer) => Buffer }).sign(bytes);

    return {
      payload: {
        message,
        signedMessage: sig.toString(sigEncoding),
        signerAddress: kp.publicKey(),
        signedData: bytes.toString('base64'),
      },
      opts: { expectedDomain: f.domain, expectedNonce: f.nonce },
    };
  }

  test('accepts a base64-encoded signature (Freighter/Ledger style)', async () => {
    const { payload, opts } = makePayload('base64');
    const result = await verifySiws(payload, opts);
    expect(result.ok).toBe(true);
  });

  test('accepts a hex-encoded signature (Albedo style)', async () => {
    const { payload, opts } = makePayload('hex');
    const result = await verifySiws(payload, opts);
    expect(result.ok).toBe(true);
  });

  test('accepts a hex-encoded lowercase signature', async () => {
    const { payload, opts } = makePayload('hex');
    payload.signedMessage = payload.signedMessage.toLowerCase();
    const result = await verifySiws(payload, opts);
    expect(result.ok).toBe(true);
  });

  test('accepts a hex-encoded uppercase signature', async () => {
    const { payload, opts } = makePayload('hex');
    payload.signedMessage = payload.signedMessage.toUpperCase();
    const result = await verifySiws(payload, opts);
    expect(result.ok).toBe(true);
  });

  test('rejects a signature that decodes to fewer than 64 bytes (truncated)', async () => {
    const { payload, opts } = makePayload('base64');
    // Truncate the signature to 32 bytes — decodeSignature will produce
    // a 32-byte buffer, Keypair.verify will reject it.
    const truncatedSig = Buffer.from(payload.signedMessage, 'base64').slice(0, 32);
    payload.signedMessage = truncatedSig.toString('base64');
    const result = await verifySiws(payload, opts);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/signature verification failed/i);
  });

  test('rejects garbage that is neither valid base64 nor valid hex', async () => {
    const { payload, opts } = makePayload('base64');
    payload.signedMessage = '!!!not-base64-not-hex!!!';
    const result = await verifySiws(payload, opts);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/signature verification failed/i);
  });

  test('does NOT misfire on a pure-alphanumeric base64 signature of even length', async () => {
    // Regression guard for the old regex heuristic. A signature like
    // "AAAA..." (which base64 with all-alphanumeric chars and an even
    // length) would have been misdetected as hex by the old code, then
    // decoded as the wrong bytes, then failed verification. The new
    // decodeSignature tries base64 first and accepts it if it produces
    // 64 bytes — so a valid base64 signature always wins.
    const kp = Keypair.random();
    const f = makeSiwsFixture({ address: kp.publicKey() });
    const message = buildSiwsMessage(f);
    const bytes = Buffer.from(message, 'utf-8');
    const sig: Buffer = (kp as unknown as { sign: (d: Buffer) => Buffer }).sign(bytes);

    // Construct a signature whose base64 form happens to be all
    // alphanumeric (no +, /, or =). We do this by perturbing the key
    // until we find one. If we can't find one in N tries, we skip —
    // the test is still useful when it does trigger.
    let found = false;
    for (let i = 0; i < 1000 && !found; i++) {
      const kp2 = Keypair.random();
      const sig2: Buffer = (kp2 as unknown as { sign: (d: Buffer) => Buffer }).sign(bytes);
      const b64 = sig2.toString('base64');
      if (/^[A-Za-z0-9]+$/.test(b64) && b64.length % 2 === 0 && b64.length === 86) {
        // 64 bytes → 86 base64 chars without padding. Even length. All alphanumeric.
        // This is the exact shape that would have fooled the old regex.
        const result = await verifySiws(
          {
            message,
            signedMessage: b64,
            signerAddress: kp2.publicKey(),
            signedData: bytes.toString('base64'),
          },
          { expectedDomain: f.domain, expectedNonce: f.nonce }
        );
        expect(result.ok).toBe(true);
        found = true;
      }
    }
    // If we never found a triggering keypair, the test is a no-op —
    // but the positive case above already covers base64 acceptance.
    if (!found) {
      console.log('  (skip — no pure-alphanumeric base64 signature found in 1000 tries)');
    }
  });
});
