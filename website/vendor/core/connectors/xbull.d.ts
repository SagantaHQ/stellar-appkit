import type { WalletConnector } from '../types.js';
/**
 * Adapter for xBull, via the official `@creit.tech/xbull-wallet-connect`
 * package — confirmed against the package's own shipped `.d.ts` at v0.4.0,
 * which is more precise than (and in one place corrects) its README:
 * `signMessage()` genuinely exists and is implemented below, despite the
 * README not documenting it.
 *
 * Corrected from an earlier version of this file that assumed a
 * `window.xBullSDK` injected global with `getPublicKey`/`signXDR`/
 * `signAuthEntry`/`signMessage` methods. That shape doesn't exist — xBull's
 * real API is a `xBullWalletConnect` bridge class you instantiate, with
 * `connect()` (returns the public key directly), `sign({xdr, publicKey?,
 * network?})` (returns the signed XDR directly), and `signMessage(message,
 * opts?)`. There is no separate "get current address" call — `connect()`
 * is both. The bridge itself handles falling back to the xBull webapp when
 * the extension isn't installed, so there's no meaningful "not installed"
 * state to detect the way there is for Freighter — it behaves like Albedo
 * in that respect.
 *
 * Soroban auth-entry signing is still not supported here, but precisely
 * so: the shipped types show the underlying message protocol *does* have
 * an internal `xdrType: 'Transaction' | 'AuthEntry'` concept
 * (`ISignXDRRequestPayload`), but the public `sign()` method's parameters
 * (`ISignParams`) don't expose a way to select it — so there's no
 * reliable, documented way to ask for auth-entry signing specifically
 * through this public API today, as opposed to it simply not existing.
 */
export declare function createXBullConnector(): WalletConnector;
//# sourceMappingURL=xbull.d.ts.map