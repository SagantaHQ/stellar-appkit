import { ConnectError, type StellarNetwork, type WalletConnector } from './types.js';

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
  appMetadata: { name: string; domain: string; uri: string };
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

export async function signInWithStellar(opts: SignInOptions): Promise<SignInResult> {
  const { connector } = opts;

  if (!connector.capabilities.signMessage) {
    throw ConnectError.invalidRequest(
      `${connector.meta.name} does not support message signing, which Sign-In With Stellar requires.`,
      undefined,
      connector.id
    );
  }

  const { address } = await connector.getAddress();
  const issuedAt = new Date();
  const expirationTime = opts.expirationTime ?? new Date(issuedAt.getTime() + 10 * 60 * 1000);

  const message = buildSiwsMessage({ ...opts, address, issuedAt, expirationTime });

  const { signedMessage, signerAddress, signedData } = await connector.signMessage(message);

  if (signerAddress !== address) {
    // Defends against a wallet returning a different signer than the one
    // we asked to sign — should never happen, but a session bug here is
    // an auth bug, so it's worth failing loudly.
    throw ConnectError.internal(
      'Signature was returned for a different address than expected.',
      undefined,
      connector.id
    );
  }

  return {
    message,
    signedMessage,
    signerAddress,
    signedData,
    issuedAt: issuedAt.toISOString(),
    expirationTime: expirationTime.toISOString(),
  };
}

function buildSiwsMessage(opts: {
  appMetadata: { name: string; domain: string; uri: string };
  network: StellarNetwork;
  statement: string;
  nonce: string;
  address: string;
  issuedAt: Date;
  expirationTime: Date;
}): string {
  const chainId = opts.network === 'PUBLIC' ? 'pubnet' : opts.network.toLowerCase();

  return [
    `${opts.appMetadata.domain} wants you to sign in with your Stellar account:`,
    opts.address,
    '',
    `Statement: ${opts.statement}`,
    `URI: ${opts.appMetadata.uri}`,
    'Version: 1',
    `Chain ID: ${chainId}`,
    `Nonce: ${opts.nonce}`,
    `Issued At: ${opts.issuedAt.toISOString()}`,
    `Expiration Time: ${opts.expirationTime.toISOString()}`,
  ].join('\n');
}

/**
 * Re-parses a SIWS message back into structured fields — used by
 * `@saganta/stellar-appkit-siws-verify` on the server side, and exported here so
 * client and server share one parser instead of two regex implementations
 * drifting apart.
 */
export function parseSiwsMessage(message: string): {
  domain: string;
  address: string;
  statement: string;
  uri: string;
  version: string;
  chainId: string;
  nonce: string;
  issuedAt: string;
  expirationTime: string;
} | null {
  const lines = message.split('\n');
  const domainLine = lines[0];
  const address = lines[1];
  if (!domainLine || !address) return null;

  const domainMatch = /^(.*) wants you to sign in with your Stellar account:$/.exec(domainLine);
  if (!domainMatch) return null;

  const field = (label: string) => lines.find((l) => l.startsWith(`${label}: `))?.slice(label.length + 2) ?? '';

  return {
    domain: domainMatch[1] ?? '',
    address,
    statement: field('Statement'),
    uri: field('URI'),
    version: field('Version'),
    chainId: field('Chain ID'),
    nonce: field('Nonce'),
    issuedAt: field('Issued At'),
    expirationTime: field('Expiration Time'),
  };
}
