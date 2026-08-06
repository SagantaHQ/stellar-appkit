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
export function gradientFromAddress(address) {
    // Strip the 'G' prefix and take bytes from the middle of the address
    // for better visual variety. Stellar addresses are base-32 encoded,
    // so each character represents 5 bits.
    const chars = address.replace(/^G/, '').slice(2, 14);
    // Simple hash: sum char codes, mod 360 for hue
    let h1 = 0;
    for (let i = 0; i < Math.min(chars.length, 6); i++) {
        h1 = (h1 + chars.charCodeAt(i) * 37) % 360;
    }
    let h2 = 0;
    for (let i = 6; i < chars.length; i++) {
        h2 = (h2 + chars.charCodeAt(i) * 37) % 360;
    }
    // If the address is too short, derive h2 from h1
    if (h2 === 0)
        h2 = (h1 + 60) % 360;
    const sat = 65;
    const light1 = 55;
    const light2 = 45;
    return `linear-gradient(135deg, hsl(${h1}, ${sat}%, ${light1}%), hsl(${h2}, ${sat}%, ${light2}%))`;
}
/**
 * The Stellar Expert public avatar API URL for a given address.
 * Returns a generated PNG avatar for any Stellar account — no
 * authentication required. The image is 128x128.
 *
 * This is a third-party service — if it's down or slow, the UI's `<img>`
 * `onerror` handler falls back to the generated gradient. Enable this
 * path by setting `enableStellarExpertAvatars: true` on the modal config.
 */
export function stellarExpertAvatarUrl(address) {
    return `https://api.stellar.expert/explorer/public/account/${address}/avatar`;
}
/**
 * Fetches the wallet-provided avatar URL for a connector, if supported.
 * Returns null if the connector doesn't implement `getAvatar()` or if
 * it returns null/undefined.
 */
export async function fetchWalletAvatar(connector) {
    if (!connector.getAvatar)
        return null;
    try {
        const result = await connector.getAvatar();
        return result?.url ?? null;
    }
    catch {
        // If the wallet's getAvatar() throws (e.g. not supported, network error),
        // fall back to the generated gradient.
        return null;
    }
}
//# sourceMappingURL=avatar.js.map