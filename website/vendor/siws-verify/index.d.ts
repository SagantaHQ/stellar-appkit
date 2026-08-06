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
        candidatesTried: Array<{
            label: string;
            hashSha256: string;
            byteLength: number;
        }>;
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
export declare function verifySiws(payload: SiwsPayload, opts: VerifySiwsOptions): Promise<SiwsVerificationResult>;
export { parseSiwsMessage } from '@saganta/stellar-appkit';
//# sourceMappingURL=index.d.ts.map