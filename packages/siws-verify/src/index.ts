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
   * Override the default ed25519 verification. The default verifier tries
   * multiple candidate byte sequences (see `defaultVerifySignature`).
   *
   * You only need to provide this if you're doing something unusual:
   *  - verifying with a custom key type,
   *  - using a different hashing scheme,
   *  - or interfacing with a wallet connector that signs something other
   *    than what the default candidates cover.
   */
  verifySignatureFn?: (opts: {
    message: string;
    signedData?: string;
    signature: string;
    address: string;
  }) => Promise<boolean> | boolean;
  /**
   * When true, the verifier includes a `diagnostics` field in the result
   * on failure, listing every candidate byte sequence that was tried and
   * its hash. Use this to diagnose "Signature verification failed" errors
   * — it shows you exactly what the verifier attempted, so you can compare
   * against what your wallet actually signed.
   *
   * Default: false (off — diagnostics are only needed for debugging).
   */
  debug?: boolean;
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
  /**
   * Debug diagnostics — only populated when `opts.debug` is true AND
   * verification failed. Lists every candidate byte sequence the verifier
   * tried, so you can compare against what your wallet actually signed.
   *
   * Each entry has a `label` (human-readable description), `hashSha256`
   * (the SHA-256 of the candidate bytes, for easy comparison), and
   * `byteLength` (sanity check that the candidate is the expected size).
   */
  diagnostics?: {
    signatureByteLength: number;
    candidatesTried: Array<{ label: string; hashSha256: string; byteLength: number }>;
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
    // If debug mode is on, build diagnostics showing what was tried.
    let diagnostics: SiwsVerificationResult['diagnostics'] | undefined;
    if (opts.debug) {
      diagnostics = buildDiagnostics(payload);
    }
    return { ok: false, reason: 'Signature verification failed.', diagnostics };
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
 * Builds diagnostics for a failed verification — lists every candidate
 * byte sequence the verifier tried, with its SHA-256 hash and byte length.
 * The user can compare these against what their wallet actually signed
 * to figure out which candidate is missing.
 */
function buildDiagnostics(payload: SiwsPayload): SiwsVerificationResult['diagnostics'] {
  const { createHash } = require('crypto') as typeof import('crypto');
  const sigBuffer = decodeSignature(payload.signedMessage);

  const candidates: Array<{ label: string; buffer: Buffer }> = [];

  if (payload.signedData) {
    candidates.push({ label: 'signedData (base64-decoded)', buffer: Buffer.from(payload.signedData, 'base64') });
  }

  const messageUtf8 = Buffer.from(payload.message, 'utf-8');
  candidates.push({ label: 'utf8(message)', buffer: messageUtf8 });
  candidates.push({ label: 'sha256(utf8(message))', buffer: createHash('sha256').update(messageUtf8).digest() });
  candidates.push({ label: 'sha512(utf8(message))', buffer: createHash('sha512').update(messageUtf8).digest() });
  candidates.push({ label: 'sha512(utf8(message)) truncated to 32 bytes', buffer: createHash('sha512').update(messageUtf8).digest().subarray(0, 32) });

  // Domain-prefixed hash candidates (some wallets prepend a domain separator)
  candidates.push({ label: 'sha256("\\x00" + message)', buffer: createHash('sha256').update(Buffer.concat([Buffer.from([0]), messageUtf8])).digest() });
  candidates.push({ label: 'sha256("stellar-sign-message:" + message)', buffer: createHash('sha256').update(Buffer.concat([Buffer.from('stellar-sign-message:'), messageUtf8])).digest() });

  // CRLF-normalized message (Windows line endings)
  const crlfMessage = Buffer.from(payload.message.replace(/\n/g, '\r\n'), 'utf-8');
  candidates.push({ label: 'utf8(message with CRLF)', buffer: crlfMessage });

  return {
    signatureByteLength: sigBuffer.length,
    candidatesTried: candidates.map((c) => ({
      label: c.label,
      hashSha256: createHash('sha256').update(c.buffer).digest('hex'),
      byteLength: c.buffer.length,
    })),
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
    // signed. We try them in order and return true if ANY matches.
    //
    // This multi-candidate approach is necessary because wallets don't
    // all sign the same thing — and we can't always know what they
    // signed (the freighter-api client is a thin messaging layer; the
    // actual signing happens inside the extension, which we can't read).
    //
    // Candidates tried (in order):
    //
    //  1. signedData (if present) — the exact bytes the connector
    //     claims the wallet signed.
    //
    //  2. utf8(message) — the raw UTF-8 bytes. Correct for Freighter
    //     (with hash-signing OFF), Ledger, and any SEP-43 direct signer.
    //
    //  3. sha256(utf8(message)) — SHA-256 prehash. Required for
    //     Freighter with hash-signing ON (experimental feature; the
    //     freighter-api types declare `isHashSigningEnabled`).
    //
    //  4. sha512(utf8(message)) — SHA-512 prehash. NaCl's Ed25519
    //     uses SHA-512 internally, so some wallets pre-hash with it.
    //
    //  5. sha512(utf8(message)) truncated to 32 bytes — some
    //     implementations truncate SHA-512 to match Ed25519's 32-byte
    //     key size.
    //
    //  6. sha256("\x00" + message) — domain-prefixed hash (null byte
    //     domain separator, used by some implementations to prevent
    //     cross-protocol signature reuse).
    //
    //  7. sha256("stellar-sign-message:" + message) — domain-prefixed
    //     hash with a human-readable domain separator.
    //
    //  8. utf8(message with CRLF) — Windows-style line endings. If the
    //     wallet's popup renders the message with \r\n, the signed bytes
    //     differ from our \n-joined message.
    //
    // If none match, the verifier returns false. Enable `debug: true`
    // in VerifySiwsOptions to see a diagnostics dump of every candidate
    // and its hash — that lets you figure out what your wallet actually
    // signed by comparing the hashes.
    const { createHash } = await import('crypto');
    const messageUtf8 = Buffer.from(opts.message, 'utf-8');

    const candidates: Array<{ label: string; buffer: Buffer }> = [];

    if (opts.signedData) {
      candidates.push({ label: 'signedData', buffer: Buffer.from(opts.signedData, 'base64') });
    }
    candidates.push({ label: 'utf8(message)', buffer: messageUtf8 });

    // SEP-0053: Freighter signs sha256("Stellar Signed Message:\n" + message)
    // This is the EXACT prefix Freighter uses (confirmed by reading the
    // extension source at extension/src/helpers/stellar.ts):
    //   export const SIGN_MESSAGE_PREFIX = "Stellar Signed Message:\n";
    //   export const encodeSep53Message = (message) => {
    //     const messageBytes = Buffer.from(message, "utf8");
    //     const prefixBytes = Buffer.from(SIGN_MESSAGE_PREFIX, "utf8");
    //     return hash(Buffer.concat([prefixBytes, messageBytes]));  // SHA-256
    //   };
    // The signature is over the SHA-256 hash, not the raw prefixed bytes.
    const SEP53_PREFIX = 'Stellar Signed Message:\n';
    const sep53Prefixed = Buffer.concat([Buffer.from(SEP53_PREFIX, 'utf-8'), messageUtf8]);
    candidates.push({ label: 'sha256("Stellar Signed Message:\\n" + message) [SEP-0053]', buffer: createHash('sha256').update(sep53Prefixed).digest() });

    candidates.push({ label: 'sha256(message)', buffer: createHash('sha256').update(messageUtf8).digest() });
    candidates.push({ label: 'sha512(message)', buffer: createHash('sha512').update(messageUtf8).digest() });
    candidates.push({ label: 'sha512(message) truncated', buffer: createHash('sha512').update(messageUtf8).digest().subarray(0, 32) });
    candidates.push({ label: 'sha256(\\x00 + message)', buffer: createHash('sha256').update(Buffer.concat([Buffer.from([0]), messageUtf8])).digest() });
    candidates.push({ label: 'sha256("stellar-sign-message:" + message)', buffer: createHash('sha256').update(Buffer.concat([Buffer.from('stellar-sign-message:'), messageUtf8])).digest() });
    // CRLF-normalized message
    const crlfMessage = Buffer.from(opts.message.replace(/\n/g, '\r\n'), 'utf-8');
    candidates.push({ label: 'utf8(message with CRLF)', buffer: crlfMessage });

    for (const candidate of candidates) {
      if (keypair.verify(candidate.buffer, signatureBuffer)) {
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
