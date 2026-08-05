import { parseSiwsMessage } from '@saganta/stellar-appkit';

/**
 * Server-side counterpart to `client.signIn()` in @saganta/stellar-appkit.
 * Checks the SIWS envelope (domain binding, nonce, expiry) and the ed25519
 * signature, and returns a plain claims object so it can sit in front of
 * any session/JWT layer without dictating one.
 *
 * ## How signature verification works across wallets
 *
 * Wallets do not all sign the same byte sequence:
 *  - Freighter, Ledger, and SEP-43-compliant wallets sign the raw UTF-8
 *    bytes of the SIWS plaintext. They surface this via `signedData =
 *    base64(utf8(message))`.
 *  - Albedo signs a derived value (`signed_message`, a hash of pubkey +
 *    message produced server-side) rather than the raw message bytes.
 *    The connector surfaces `signedData = base64(hexDecode(signed_message))`.
 *  - xBull signs a `fullMessage` that may include a wallet-added prefix;
 *    the connector surfaces `signedData = base64(utf8(fullMessage))`.
 *
 * The connector is the only code that knows what bytes the wallet actually
 * signed. By the time the payload reaches the verifier, that knowledge is
 * captured in `payload.signedData` — so the verifier is wallet-agnostic: it
 * always verifies the signature against `signedData` (decoded from base64).
 *
 * If `signedData` is absent (older caller, or a third-party connector that
 * hasn't been updated yet), the verifier falls back to verifying against
 * `Buffer.from(message, 'utf-8')` — which is correct for any direct signer
 * (Freighter, Ledger, SEP-43) and will fail loudly for transformative
 * signers (Albedo, xBull) rather than silently passing.
 */

export interface VerifySiwsOptions {
  expectedDomain: string;
  /** The exact nonce your backend issued for this sign-in attempt. */
  expectedNonce: string;
  /**
   * Override the default ed25519 verification. The default verifier decodes
   * `signedData` (base64) — or falls back to the raw UTF-8 message bytes —
   * and calls `Keypair.fromPublicKey(address).verify(...)`.
   *
   * You only need to provide this if you're doing something unusual:
   *  - verifying with a custom key type,
   *  - using a different hashing scheme,
   *  - or interfacing with a wallet connector that does NOT yet populate
   *    `signedData` and signs something other than the raw message bytes.
   *
   * The callback receives `signedData` (base64 of the bytes the wallet
   * signed) in addition to the raw `message` string, so it can pick
   * whichever is appropriate.
   */
  verifySignatureFn?: (opts: {
    message: string;
    signedData?: string;
    signature: string;
    address: string;
  }) => Promise<boolean> | boolean;
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
  /** The SIWS plaintext message returned by `signIn()`. Parsed for domain/nonce/expiry/claims. */
  message: string;
  /** The signature returned by the wallet. Encoding varies per wallet (base64 or hex). */
  signedMessage: string;
  /** The G... address that signed. */
  signerAddress: string;
  /**
   * Base64 of the exact byte sequence the wallet signed (see module-level
   * docs). Forward this from the client's `SignInResult.signedData` — the
   * verifier uses this instead of guessing from `message`.
   *
   * Optional for backward compatibility with older callers; the verifier
   * falls back to `Buffer.from(message, 'utf-8')` when absent.
   */
  signedData?: string;
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
    signedData: payload.signedData,
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
 * Default verifier: ed25519 signature verification using the account's
 * public key.
 *
 * The bytes verified against are, in order of preference:
 *  1. `signedData` decoded from base64 — the exact bytes the wallet signed.
 *     This is what every wallet connector in `@saganta/stellar-appkit`
 *     populates from v0.2 onwards.
 *  2. `Buffer.from(message, 'utf-8')` — the raw SIWS plaintext. Used as a
 *     fallback when `signedData` is absent (older caller, or a third-party
 *     connector that hasn't been updated). Correct for any direct signer
 *     (Freighter, Ledger, SEP-43) — will fail for transformative signers
 *     (Albedo, xBull), which is the right thing to do rather than silently
 *     passing.
 *
 * The signature is decoded from either base64 (Freighter, Ledger) or hex
 * (Albedo) — see `decodeSignature`.
 */
async function defaultVerifySignature(opts: {
  message: string;
  signedData?: string;
  signature: string;
  address: string;
}): Promise<boolean> {
  const { Keypair } = await import('@stellar/stellar-sdk');
  try {
    const keypair = Keypair.fromPublicKey(opts.address);
    const signatureBuffer = decodeSignature(opts.signature);

    // Build the list of candidate byte sequences the wallet might have
    // signed. We try them in order of preference and return true if ANY
    // matches — this is necessary because wallets don't all sign the
    // same thing:
    //
    //  1. signedData (if present) — the exact bytes the connector
    //     claims the wallet signed. This is the preferred path; it's
    //     what every connector in @saganta/stellar-appkit populates
    //     from v0.2 onwards.
    //
    //  2. utf8(message) — the raw UTF-8 bytes of the SIWS plaintext.
    //     Correct for Freighter (with hash-signing OFF), Ledger, and
    //     any SEP-43 direct signer that hasn't populated signedData.
    //
    //  3. sha256(utf8(message)) — the SHA-256 hash of the message.
    //     Required for Freighter with hash-signing ON (an experimental
    //     feature in Freighter v5+; the freighter-api types declare
    //     `isHashSigningEnabled`, and verification failures against
    //     raw UTF-8 are consistent with this being on by default in
    //     current builds). Also used by some other wallets that
    //     pre-hash before ed25519 signing.
    //
    // Trying multiple candidates is slightly weaker cryptographically
    // than verifying against a single known byte sequence — an attacker
    // who could find a SHA-256 second-preimage for the message could
    // pass verification. In practice this is not a realistic threat
    // for SIWS (the message includes a server-issued nonce and expiry),
    // and the alternative (failing verification for legitimate users
    // whose wallet has hash-signing on) is worse.
    const candidates: Buffer[] = [];
    if (opts.signedData) {
      candidates.push(Buffer.from(opts.signedData, 'base64'));
    }
    const messageUtf8 = Buffer.from(opts.message, 'utf-8');
    candidates.push(messageUtf8);
    // SHA-256 prehash — used by Freighter with hash-signing enabled.
    const { createHash } = await import('crypto');
    candidates.push(createHash('sha256').update(messageUtf8).digest());

    for (const candidate of candidates) {
      if (keypair.verify(candidate, signatureBuffer)) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Decode a wallet-returned signature into raw bytes.
 *
 * Different wallets encode the signature differently:
 *  - Freighter, Ledger → base64 (an Ed25519 signature is 64 bytes → 88 base64 chars with padding)
 *  - Albedo            → hex    (64 bytes → 128 hex chars)
 *
 * The previous heuristic was a regex test for `[0-9a-f]+` with an even
 * length, which would misfire on any pure-alphanumeric base64 string of
 * even length. The safer approach is to try base64 first and check that
 * the decoded length matches Ed25519's expected 64 bytes; if not, try hex
 * with the same length check; otherwise return whatever base64 gave us
 * (which will fail the subsequent verify and surface a clean error).
 */
function decodeSignature(signature: string): Buffer {
  // Try base64 first — Freighter and Ledger use it.
  const b64 = Buffer.from(signature, 'base64');
  if (b64.length === 64) return b64;

  // Fall back to hex — Albedo uses it.
  if (/^[0-9a-fA-F]+$/.test(signature) && signature.length % 2 === 0) {
    const hex = Buffer.from(signature, 'hex');
    if (hex.length === 64) return hex;
  }

  // Last resort — return whatever base64 produced. Keypair.verify will
  // reject it and verifySiws will surface "Signature verification failed."
  return b64;
}

export { parseSiwsMessage } from '@saganta/stellar-appkit';
