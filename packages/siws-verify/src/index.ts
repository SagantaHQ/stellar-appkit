import { parseSiwsMessage } from '@saganta/stellar-appkit';

/**
 * Server-side counterpart to `client.signIn()` in @saganta/stellar-appkit.
 * Checks the SIWS envelope (domain binding, nonce, expiry) and the ed25519
 * signature, and returns a plain claims object so it can sit in front of
 * any session/JWT layer without dictating one.
 *
 * IMPORTANT — this covers the common case only: wallets that sign the SIWS
 * message directly (this is what Freighter and most SEP-43-compliant
 * wallets do). Some wallets transform the message before signing — Albedo,
 * for example, signs a value derived from the pubkey and an internal
 * token rather than the raw message bytes, per its `signMessage` intent.
 * A wallet that does this needs its own `verifySignatureFn` passed in
 * rather than relying on the default verifier below; shipping this as a
 * silent "works for every wallet" black box would be worse than being
 * explicit about the gap.
 */

export interface VerifySiwsOptions {
  expectedDomain: string;
  /** The exact nonce your backend issued for this sign-in attempt. */
  expectedNonce: string;
  /** Defaults to verifying a direct ed25519 signature over the raw message bytes (see caveat above). */
  verifySignatureFn?: (opts: { message: string; signature: string; address: string }) => Promise<boolean> | boolean;
}

export interface SiwsVerificationResult {
  ok: boolean;
  reason?: string;
  claims?: {
    address: string;
    domain: string;
    chainId: string;
    issuedAt: string;
    expirationTime: string;
  };
}

export interface SiwsPayload {
  message: string;
  signedMessage: string;
  signerAddress: string;
}

export async function verifySiws(payload: SiwsPayload, opts: VerifySiwsOptions): Promise<SiwsVerificationResult> {
  const parsed = parseSiwsMessage(payload.message);
  if (!parsed) {
    return { ok: false, reason: 'Message is not a valid SIWS message.' };
  }

  if (parsed.address !== payload.signerAddress) {
    return { ok: false, reason: 'Signer address does not match the address embedded in the message.' };
  }

  if (parsed.domain !== opts.expectedDomain) {
    return { ok: false, reason: `Domain mismatch: message was issued for "${parsed.domain}", expected "${opts.expectedDomain}".` };
  }

  if (parsed.nonce !== opts.expectedNonce) {
    return { ok: false, reason: 'Nonce does not match — possible replay attempt.' };
  }

  const expiresAt = new Date(parsed.expirationTime).getTime();
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) {
    return { ok: false, reason: 'Sign-in message has expired.' };
  }

  const verify = opts.verifySignatureFn ?? defaultVerifySignature;
  const signatureValid = await verify({
    message: payload.message,
    signature: payload.signedMessage,
    address: payload.signerAddress,
  });

  if (!signatureValid) {
    return { ok: false, reason: 'Signature verification failed.' };
  }

  return {
    ok: true,
    claims: {
      address: parsed.address,
      domain: parsed.domain,
      chainId: parsed.chainId,
      issuedAt: parsed.issuedAt,
      expirationTime: parsed.expirationTime,
    },
  };
}

/**
 * Default verifier: ed25519 signature over the raw UTF-8 message bytes,
 * using the account's public key. Covers direct-signing wallets (see the
 * module-level caveat for wallets that transform the message first).
 */
async function defaultVerifySignature(opts: { message: string; signature: string; address: string }): Promise<boolean> {
  const { Keypair } = await import('@stellar/stellar-sdk');
  try {
    const keypair = Keypair.fromPublicKey(opts.address);
    const messageBuffer = Buffer.from(opts.message, 'utf-8');
    const signatureBuffer = decodeSignature(opts.signature);
    return keypair.verify(messageBuffer, signatureBuffer);
  } catch {
    return false;
  }
}

/** Accepts base64 or hex-encoded signatures — different wallets encode `signedMessage` differently. */
function decodeSignature(signature: string): Buffer {
  const isHex = /^[0-9a-fA-F]+$/.test(signature) && signature.length % 2 === 0;
  return Buffer.from(signature, isHex ? 'hex' : 'base64');
}

export { parseSiwsMessage } from '@saganta/stellar-appkit';
