import { ConnectError } from './types.js';
export async function signInWithStellar(opts) {
    const { connector } = opts;
    if (!connector.capabilities.signMessage) {
        throw ConnectError.invalidRequest(`${connector.meta.name} does not support message signing, which Sign-In With Stellar requires.`, undefined, connector.id);
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
        throw ConnectError.internal('Signature was returned for a different address than expected.', undefined, connector.id);
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
function buildSiwsMessage(opts) {
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
export function parseSiwsMessage(message) {
    const lines = message.split('\n');
    const domainLine = lines[0];
    const address = lines[1];
    if (!domainLine || !address)
        return null;
    const domainMatch = /^(.*) wants you to sign in with your Stellar account:$/.exec(domainLine);
    if (!domainMatch)
        return null;
    const field = (label) => lines.find((l) => l.startsWith(`${label}: `))?.slice(label.length + 2) ?? '';
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
//# sourceMappingURL=siws.js.map