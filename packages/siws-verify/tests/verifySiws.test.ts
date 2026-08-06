import { test, expect, describe } from 'bun:test';
import { Keypair } from '@stellar/stellar-sdk';
import {
  verifySiws,
  type SiwsPayload,
  type VerifySiwsOptions,
} from '../src/index.js';
import { buildSiwsMessage, makeSiwsFixture } from './helpers';

/**
 * End-to-end tests for `verifySiws` — the server-side function that
 * validates a SIWS payload signed by the client.
 *
 * Strategy: for each wallet profile, we simulate the wallet's signing
 * behavior by generating a real ed25519 keypair, computing the bytes
 * the wallet would sign, and signing those bytes with the secret key.
 * Then we build a `SiwsPayload` exactly as the client would send it
 * (message + signedMessage + signerAddress + signedData) and call
 * `verifySiws`. This exercises the full verifier path: SIWS parsing,
 * domain/nonce/expiry checks, signedData decoding, signature decoding,
 * and Keypair.verify.
 */

/** Each wallet profile simulates a different "what bytes did the wallet sign" behavior. */
type WalletProfile = {
  name: string;
  /** Compute the bytes this wallet would sign, given the SIWS plaintext and signer address. */
  bytesSignedByWallet: (siwsMessage: string, signerAddress: string) => Buffer;
  /** How the wallet encodes the signature. */
  signatureEncoding: 'hex' | 'base64';
};

const FREIGHTER: WalletProfile = {
  name: 'Freighter (direct signer — signs raw UTF-8 of message)',
  bytesSignedByWallet: (msg) => Buffer.from(msg, 'utf-8'),
  signatureEncoding: 'base64',
};

/**
 * Simulates Freighter with hash-signing ENABLED (an experimental feature
 * in Freighter v5+). When hash-signing is on, Freighter signs
 * SHA-256(utf8(message)) rather than the raw UTF-8 bytes. The
 * freighter-api types declare `isHashSigningEnabled`, and verification
 * failures against raw UTF-8 are consistent with this being on by default
 * in current builds.
 *
 * The connector still surfaces `signedData = base64(utf8(message))`
 * (the "intended" bytes), so the verifier must try BOTH the raw UTF-8
 * AND the SHA-256 hash as candidates. This profile tests that the
 * SHA-256 candidate path works.
 */
const FREIGHTER_HASH_SIGNING: WalletProfile = {
  name: 'Freighter (hash-signing ON — signs SHA-256 of message)',
  bytesSignedByWallet: (msg) => {
    const { createHash } = require('crypto') as typeof import('crypto');
    return createHash('sha256').update(Buffer.from(msg, 'utf-8')).digest();
  },
  signatureEncoding: 'base64',
};

const ALBEDO: WalletProfile = {
  name: 'Albedo (transformative signer — signs a server-derived hash)',
  // Albedo's exact derivation is opaque/server-side; we approximate with
  // SHA-256(pubkey + message). What matters for the verifier is that the
  // connector surfaces those bytes as signedData, which is what we test.
  bytesSignedByWallet: (msg, addr) => {
    const { createHash } = require('crypto') as typeof import('crypto');
    return createHash('sha256')
      .update(Buffer.concat([Buffer.from(addr, 'utf-8'), Buffer.from(msg, 'utf-8')]))
      .digest();
  },
  signatureEncoding: 'hex',
};

const XBULL: WalletProfile = {
  name: 'xBull (prefixed signer — signs fullMessage with wallet-added header)',
  bytesSignedByWallet: (msg) =>
    Buffer.concat([Buffer.from('Stellar Wallet Sign Message:\n', 'utf-8'), Buffer.from(msg, 'utf-8')]),
  signatureEncoding: 'base64',
};

const PROFILES = [FREIGHTER, FREIGHTER_HASH_SIGNING, ALBEDO, XBULL];

/** Build a fully-signed SiwsPayload for a given wallet profile, with overridable fixture. */
function buildSignedPayload(
  profile: WalletProfile,
  overrides: Partial<{
    domain: string;
    nonce: string;
    address: string;
    issuedAt: Date;
    expirationTime: Date;
    omitSignedData: boolean;
    tamperSignature: boolean;
  }> = {}
): { payload: SiwsPayload; expectedDomain: string; expectedNonce: string } {
  const kp = Keypair.random();
  const address = overrides.address ?? kp.publicKey();

  const f = makeSiwsFixture({
    domain: overrides.domain,
    address,
    issuedAt: overrides.issuedAt,
    expirationTime: overrides.expirationTime,
    nonce: overrides.nonce,
  });

  const message = buildSiwsMessage(f);
  const bytesSigned = profile.bytesSignedByWallet(message, address);
  const signature: Buffer = (kp as unknown as { sign: (d: Buffer) => Buffer }).sign(bytesSigned);

  if (overrides.tamperSignature) {
    signature[0] ^= 0x01;
  }

  const payload: SiwsPayload = {
    message,
    signedMessage: signature.toString(profile.signatureEncoding),
    signerAddress: address,
  };
  if (!overrides.omitSignedData) {
    payload.signedData = bytesSigned.toString('base64');
  }

  return {
    payload,
    expectedDomain: f.domain,
    expectedNonce: f.nonce,
  };
}

describe('verifySiws — positive cases (signedData populated)', () => {
  for (const profile of PROFILES) {
    test(`accepts a valid payload signed by ${profile.name}`, async () => {
      const { payload, expectedDomain, expectedNonce } = buildSignedPayload(profile);
      const result = await verifySiws(payload, { expectedDomain, expectedNonce });
      expect(result.ok).toBe(true);
      expect(result.reason).toBeUndefined();
      expect(result.claims).toBeDefined();
      expect(result.claims!.address).toBe(payload.signerAddress);
      expect(result.claims!.domain).toBe(expectedDomain);
      expect(result.claims!.nonce).toBeUndefined(); // nonce isn't in claims, just used for validation
      expect(result.claims!.chainId).toBe('testnet');
    });
  }

  test('accepts a payload when signedData equals utf8(message) — direct signer with explicit signedData', async () => {
    // Even though signedData is redundant with the message for direct
    // signers, the verifier should still use signedData (not the message)
    // when present. This test confirms the verifier prefers signedData.
    const kp = Keypair.random();
    const f = makeSiwsFixture({ address: kp.publicKey() });
    const message = buildSiwsMessage(f);
    const bytes = Buffer.from(message, 'utf-8');
    const sig: Buffer = (kp as unknown as { sign: (d: Buffer) => Buffer }).sign(bytes);

    const payload: SiwsPayload = {
      message,
      signedMessage: sig.toString('base64'),
      signerAddress: kp.publicKey(),
      signedData: bytes.toString('base64'),
    };

    const result = await verifySiws(payload, {
      expectedDomain: f.domain,
      expectedNonce: f.nonce,
    });
    expect(result.ok).toBe(true);
  });
});

describe('verifySiws — negative cases (envelope checks)', () => {
  test('rejects when message is not a valid SIWS message', async () => {
    const result = await verifySiws(
      { message: 'not a siws message', signedMessage: 'x', signerAddress: 'G...' },
      { expectedDomain: 'localhost', expectedNonce: 'n' }
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/not a valid SIWS message/i);
  });

  test('rejects when signerAddress does not match the address in the message', async () => {
    const kp = Keypair.random();
    const wrongAddress = 'GBWMCCC3BAXPRF7Y6YX3YZ3F7XK6Y5R2ZJ5HJZ7X3HJZT4PQYH4Q5R2';
    const f = makeSiwsFixture({ address: kp.publicKey() }); // message says kp.publicKey()
    const message = buildSiwsMessage(f);
    const bytes = Buffer.from(message, 'utf-8');
    const sig: Buffer = (kp as unknown as { sign: (d: Buffer) => Buffer }).sign(bytes);

    const payload: SiwsPayload = {
      message,
      signedMessage: sig.toString('base64'),
      signerAddress: wrongAddress, // ← mismatch
      signedData: bytes.toString('base64'),
    };

    const result = await verifySiws(payload, {
      expectedDomain: f.domain,
      expectedNonce: f.nonce,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/address does not match/i);
  });

  test('rejects when the domain does not match expectedDomain', async () => {
    const { payload, expectedNonce } = buildSignedPayload(FREIGHTER, { domain: 'localhost' });
    const result = await verifySiws(payload, {
      expectedDomain: 'evil.com', // ← wrong
      expectedNonce,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/domain mismatch/i);
  });

  test('rejects when the nonce does not match expectedNonce (replay defense)', async () => {
    const { payload, expectedDomain } = buildSignedPayload(FREIGHTER, { nonce: 'client-nonce' });
    const result = await verifySiws(payload, {
      expectedDomain,
      expectedNonce: 'server-nonce', // ← mismatch
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/nonce does not match/i);
  });

  test('rejects when the message has expired', async () => {
    const { payload, expectedDomain, expectedNonce } = buildSignedPayload(FREIGHTER, {
      issuedAt: new Date('2020-01-01T00:00:00.000Z'),
      expirationTime: new Date('2020-01-01T00:01:00.000Z'), // expired years ago
    });
    const result = await verifySiws(payload, { expectedDomain, expectedNonce });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/expired/i);
  });

  test('rejects when expirationTime is not a valid date', async () => {
    const kp = Keypair.random();
    const f = makeSiwsFixture({ address: kp.publicKey() });
    const message = buildSiwsMessage(f);
    // Corrupt the Expiration Time line in the built message so the
    // verifier's `new Date(parsed.expirationTime)` produces an Invalid
    // Date. (We can't pass an invalid Date to buildSiwsMessage because
    // toISOString() throws on invalid dates — the corruption has to
    // happen at the string level, post-build.)
    const corruptedMessage = message.replace(
      /Expiration Time: .*/,
      'Expiration Time: not-a-valid-date'
    );
    const bytes = Buffer.from(corruptedMessage, 'utf-8');
    const sig: Buffer = (kp as unknown as { sign: (d: Buffer) => Buffer }).sign(bytes);

    const payload: SiwsPayload = {
      message: corruptedMessage,
      signedMessage: sig.toString('base64'),
      signerAddress: kp.publicKey(),
      signedData: bytes.toString('base64'),
    };

    const result = await verifySiws(payload, {
      expectedDomain: f.domain,
      expectedNonce: f.nonce,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/expired/i);
  });
});

describe('verifySiws — signature verification failures', () => {
  for (const profile of PROFILES) {
    test(`rejects a tampered signature from ${profile.name}`, async () => {
      const { payload, expectedDomain, expectedNonce } = buildSignedPayload(profile, {
        tamperSignature: true,
      });
      const result = await verifySiws(payload, { expectedDomain, expectedNonce });
      expect(result.ok).toBe(false);
      expect(result.reason).toMatch(/signature verification failed/i);
    });
  }

  test('rejects when signedData does not match the bytes that were actually signed', async () => {
    // Simulate a buggy connector that surfaces the wrong signedData —
    // e.g., surfaces utf8(message) when the wallet actually signed a hash.
    // The verifier must catch this, not silently pass.
    const kp = Keypair.random();
    const f = makeSiwsFixture({ address: kp.publicKey() });
    const message = buildSiwsMessage(f);

    // Wallet actually signs a hash, but the connector surfaces utf8(message):
    const actualBytesSigned = ALBEDO.bytesSignedByWallet(message, kp.publicKey());
    const sig: Buffer = (kp as unknown as { sign: (d: Buffer) => Buffer }).sign(actualBytesSigned);

    const payload: SiwsPayload = {
      message,
      signedMessage: sig.toString('hex'),
      signerAddress: kp.publicKey(),
      signedData: Buffer.from(message, 'utf-8').toString('base64'), // ← wrong
    };

    const result = await verifySiws(payload, {
      expectedDomain: f.domain,
      expectedNonce: f.nonce,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/signature verification failed/i);
  });
});

describe('verifySiws — backward compatibility (signedData omitted)', () => {
  test('falls back to utf8(message) for direct signers (Freighter) — passes', async () => {
    // Legacy callers that don't forward signedData should keep working
    // for direct signers like Freighter. The verifier falls back to
    // Buffer.from(message, 'utf-8') which is exactly what Freighter signed.
    const { payload, expectedDomain, expectedNonce } = buildSignedPayload(FREIGHTER, {
      omitSignedData: true,
    });
    const result = await verifySiws(payload, { expectedDomain, expectedNonce });
    expect(result.ok).toBe(true);
  });

  test('falls back to utf8(message) for transformative signers (Albedo) — fails loudly', async () => {
    // For Albedo, the fallback is WRONG: Albedo didn't sign utf8(message),
    // it signed a derived hash. The verifier must fail loudly rather than
    // silently authenticating an unverifiable payload. This is the
    // documented behavior in the verifier's module-level comment.
    const { payload, expectedDomain, expectedNonce } = buildSignedPayload(ALBEDO, {
      omitSignedData: true,
    });
    const result = await verifySiws(payload, { expectedDomain, expectedNonce });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/signature verification failed/i);
  });

  test('falls back to utf8(message) for prefixed signers (xBull) — fails loudly', async () => {
    // Same as Albedo: xBull signed fullMessage (with prefix), not message.
    const { payload, expectedDomain, expectedNonce } = buildSignedPayload(XBULL, {
      omitSignedData: true,
    });
    const result = await verifySiws(payload, { expectedDomain, expectedNonce });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/signature verification failed/i);
  });
});

describe('verifySiws — custom verifySignatureFn', () => {
  test('invokes the custom verifier with message, signedData, signature, and address', async () => {
    const { payload, expectedDomain, expectedNonce } = buildSignedPayload(FREIGHTER);

    let captured: { message: string; signedData?: string; signature: string; address: string } | null = null;
    const opts: VerifySiwsOptions = {
      expectedDomain,
      expectedNonce,
      verifySignatureFn: (args) => {
        captured = args;
        return true;
      },
    };

    await verifySiws(payload, opts);

    expect(captured).not.toBeNull();
    expect(captured!.message).toBe(payload.message);
    expect(captured!.signedData).toBe(payload.signedData);
    expect(captured!.signature).toBe(payload.signedMessage);
    expect(captured!.address).toBe(payload.signerAddress);
  });

  test('returns the custom verifier result as ok=true', async () => {
    const { payload, expectedDomain, expectedNonce } = buildSignedPayload(FREIGHTER);
    const result = await verifySiws(payload, {
      expectedDomain,
      expectedNonce,
      verifySignatureFn: () => true,
    });
    expect(result.ok).toBe(true);
  });

  test('returns the custom verifier result as ok=false with default reason', async () => {
    const { payload, expectedDomain, expectedNonce } = buildSignedPayload(FREIGHTER);
    const result = await verifySiws(payload, {
      expectedDomain,
      expectedNonce,
      verifySignatureFn: () => false,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/signature verification failed/i);
  });

  test('awaits an async custom verifier', async () => {
    const { payload, expectedDomain, expectedNonce } = buildSignedPayload(FREIGHTER);
    const result = await verifySiws(payload, {
      expectedDomain,
      expectedNonce,
      verifySignatureFn: async () => {
        await new Promise((r) => setTimeout(r, 10));
        return true;
      },
    });
    expect(result.ok).toBe(true);
  });
});

describe('verifySiws — claims shape', () => {
  test('returns all expected claims on success', async () => {
    const kp = Keypair.random();
    const f = makeSiwsFixture({
      address: kp.publicKey(),
      network: 'PUBLIC',
    });
    const message = buildSiwsMessage(f);
    const bytes = Buffer.from(message, 'utf-8');
    const sig: Buffer = (kp as unknown as { sign: (d: Buffer) => Buffer }).sign(bytes);

    const payload: SiwsPayload = {
      message,
      signedMessage: sig.toString('base64'),
      signerAddress: kp.publicKey(),
      signedData: bytes.toString('base64'),
    };

    const result = await verifySiws(payload, {
      expectedDomain: f.domain,
      expectedNonce: f.nonce,
    });

    expect(result.ok).toBe(true);
    expect(result.claims).toEqual({
      address: kp.publicKey(),
      domain: f.domain,
      chainId: 'pubnet',
      issuedAt: f.issuedAt.toISOString(),
      expirationTime: f.expirationTime.toISOString(),
    });
  });
});
