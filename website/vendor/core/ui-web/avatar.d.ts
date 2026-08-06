/**
 * Avatar utilities for the UI layer.
 *
 * Two paths:
 *
 * 1. Wallet-provided avatar — if the connector implements the optional
 *    `getAvatar()` method and returns a URL, the UI renders it as an `<img>`.
 *
 * 2. Generated gradient fallback — if no avatar is available (or the
 *    wallet doesn't support `getAvatar()`), the UI generates a deterministic
 *    gradient from the account address. Same address → same gradient, so
 *    users see a consistent visual identity across sessions without needing
 *    a profile picture. The gradient is two hues derived from the address's
 *    first and last bytes, ensuring visually distinct gradients for different
 *    accounts.
 *
 * 3. Stellar Expert fallback — as a last resort, the UI can query
 *    Stellar Expert's public avatar API
 *    (https://api.stellar.expert/explorer/public/account/{address}/avatar)
 *    which returns a generated PNG for any Stellar account. This is
 *    optional and off by default (it's a third-party request); enable
 *    via `enableStellarExpertAvatars: true` on the modal config.
 */
/**
 * Generates a deterministic CSS gradient string from a Stellar address.
 * Same address always produces the same gradient — useful as a fallback
 * when no wallet-provided avatar is available.
 *
 * The gradient uses two hues derived from the address's bytes:
 *   - Hue 1: derived from bytes 3-5 of the address (after the 'G' prefix)
 *   - Hue 2: derived from bytes 10-12
 *
 * This avoids the first few bytes (which are often similar across
 * accounts on the same network due to the version byte) and uses bytes
 * from the middle of the address for more visual variety.
 */
export declare function gradientFromAddress(address: string): string;
/**
 * The Stellar Expert public avatar API URL for a given address.
 * Returns a generated PNG avatar for any Stellar account — no
 * authentication required. The image is 128x128.
 *
 * This is a third-party service — if it's down or slow, the UI's `<img>`
 * `onerror` handler falls back to the generated gradient. Enable this
 * path by setting `enableStellarExpertAvatars: true` on the modal config.
 */
export declare function stellarExpertAvatarUrl(address: string): string;
/**
 * Fetches the wallet-provided avatar URL for a connector, if supported.
 * Returns null if the connector doesn't implement `getAvatar()` or if
 * it returns null/undefined.
 */
export declare function fetchWalletAvatar(connector: {
    getAvatar?: () => Promise<{
        url: string;
    } | null>;
}): Promise<string | null>;
//# sourceMappingURL=avatar.d.ts.map