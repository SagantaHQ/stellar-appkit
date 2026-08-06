/**
 * Unified wallet types for Stellar AppKit.
 *
 * The shape here deliberately mirrors SEP-43 (Standard Web Wallet API
 * Interface) rather than inventing a competing contract — SEP-43 is the
 * direction the ecosystem is converging on, so adapters that shim a
 * non-compliant wallet just need to map *into* this shape once.
 *
 * Spec reference: https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0043.md
 */
export class ConnectError extends Error {
    constructor(shape) {
        super(shape.message);
        this.name = 'ConnectError';
        this.code = shape.code;
        this.ext = shape.ext;
        this.walletId = shape.walletId;
    }
    static internal(message, ext, walletId) {
        return new ConnectError({ message, code: -1, ext, walletId });
    }
    static externalService(message, ext, walletId) {
        return new ConnectError({ message, code: -2, ext, walletId });
    }
    static invalidRequest(message, ext, walletId) {
        return new ConnectError({ message, code: -3, ext, walletId });
    }
    static rejected(walletId) {
        return new ConnectError({
            message: 'The user rejected this request.',
            code: -4,
            walletId,
        });
    }
}
/**
 * Thrown by connect() when the wallet's live network doesn't match the
 * network the app is configured for. Kept as a distinct subclass (not just
 * a generic ConnectError with a network-shaped message) so UI code can
 * `instanceof` it and render "switch to Testnet in Freighter" with a retry
 * affordance instead of generic error copy.
 */
export class NetworkMismatchError extends ConnectError {
    constructor(opts) {
        super({
            message: `This wallet is set to ${opts.actualNetwork}, but this app expects ${opts.expectedNetwork}. Switch networks in your wallet and try again.`,
            code: -3,
            walletId: opts.walletId,
        });
        this.name = 'NetworkMismatchError';
        this.expectedNetwork = opts.expectedNetwork;
        this.actualNetwork = opts.actualNetwork;
    }
}
//# sourceMappingURL=types.js.map