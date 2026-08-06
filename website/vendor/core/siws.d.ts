import { type StellarNetwork, type WalletConnector } from './types.js';
/**
 * Sign-In With Stellar (SIWS).
 *
 * There's no ratified SEP for this yet — SEP-10 exists but is anchor-server
 * oriented (per-anchor challenge endpoints). This defines a minimal,
 * self-issued message format analogous to Sign-In With Ethereum (EIP-4361),
 * built on SEP-43's `signMessage`, so any app can add "sign in with wallet"
 * without standing up a SEP-10 auth server. Apps that already run one can
 * use `strategy: 'sep10'` instead — see ARCHITECTURE.md §6.
 */
export interface SignInOptions {
    connector: WalletConnector;
    network: StellarNetwork;
    appMetadata: {
        name: string;
        domain: string;
        uri: string;
    };
    /** Human-readable statement shown to the user, e.g. "Sign in to Saganta". */
    statement: string;
    /** Server-issued random value — required to prevent replay. Fetch this from your backend. */
    nonce: string;
    /** Defaults to 10 minutes from now. */
    expirationTime?: Date;
}
export interface SignInResult {
    message: string;
    signedMessage: string;
    signerAddress: string;
    /**
     * Base64 of the exact byte sequence the wallet signed — see
     * `SignMessageResult.signedData`. Forward this to the server alongside
     * `message`/`signedMessage`/`signerAddress` so `verifySiws` can verify
     * against the bytes the wallet actually signed, regardless of which
     * wallet the user picked.
     *
     * Optional: omitted when the connector is a legacy/third-party one that
     * doesn't populate it. The verifier falls back to verifying against
     * `Buffer.from(message, 'utf-8')` in that case (correct for any
     * SEP-43-style direct signer like Freighter or Ledger).
     */
    signedData?: string;
    issuedAt: string;
    expirationTime: string;
}
export declare function signInWithStellar(opts: SignInOptions): Promise<SignInResult>;
/**
 * Re-parses a SIWS message back into structured fields — used by
 * `@saganta/stellar-appkit-siws-verify` on the server side, and exported here so
 * client and server share one parser instead of two regex implementations
 * drifting apart.
 */
export declare function parseSiwsMessage(message: string): {
    domain: string;
    address: string;
    statement: string;
    uri: string;
    version: string;
    chainId: string;
    nonce: string;
    issuedAt: string;
    expirationTime: string;
} | null;
//# sourceMappingURL=siws.d.ts.map