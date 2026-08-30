/**
 * xBull connector for React Native — same web-wallet flow as the web
 * connector's popup fallback, with the popup replaced by an in-app WebView.
 *
 * Why a WebView bridge? xBull has no native mobile app (its old Play Store
 * app was removed and it is not registered in the WalletConnect Explorer's
 * Stellar namespace), so there is no deep link to hand off to. What xBull
 * DOES have is its web wallet at `https://wallet.xbull.app/connect`, which
 * speaks a nacl-box encrypted postMessage protocol with a popup opener —
 * verified byte-for-byte against the live wallet bundle (ConnectModule,
 * chunk 267 at the time of writing):
 *
 *   1. The opener opens
 *      `https://wallet.xbull.app/connect?public=<b64>&session=<b64>` —
 *      its own nacl box public key and a 24-byte session nonce.
 *   2. Once loaded, the wallet replies via `opener.postMessage({ type:
 *      'XBULL_INITIAL_RESPONSE', message, oneTimeCode, publicKey }, '*')`
 *      where `message` is the box-encrypted `{ providedSession,
 *      walletSession }` — the session echo proves the wallet saw OUR key.
 *   3. The app sends requests as message events on the wallet's window:
 *      `{ type: 'XBULL_CONNECT' | 'XBULL_SIGN' | 'XBULL_SIGN_MESSAGE',
 *      message, oneTimeCode }` (encrypted for the wallet's public key).
 *      The wallet reads `event.origin` and displays it as the requesting
 *      app — we forge it from the configured app origin, exactly what
 *      `popup.postMessage(...)` would have carried.
 *   4. The wallet replies `{ type: <REQUEST>_RESPONSE, message,
 *      oneTimeCode, publicKey, success }` via `opener.postMessage`.
 *      `success: false` is a user rejection.
 *
 * This connector is deliberately **headless** — it accepts an
 * `XBullWebViewBridge` implementation, so apps with their own UI can pass
 * any `openWallet(url, handlers) → handle` object, while apps using our
 * modal pass `@saganta/stellar-appkit-react-native/xbull`'s
 * `createXBullWebViewBridge()`, which renders the WebView screen.
 *
 * The protocol mirrors `@creit.tech/xbull-wallet-connect` v0.4.0 (the same
 * package the core web connector uses), so both platforms talk to the exact
 * same web wallet — but implemented directly against `tweetnacl` instead of
 * shimming `window.open` for the RN runtime.
 */

import type {
  WalletConnector,
  WalletMeta,
  WalletCapabilities,
  ConnectOptions,
  WalletAccount,
  GetAddressResult,
  GetNetworkResult,
  SignTxOptions,
  SignTransactionResult,
  SignOptions,
  SignAuthEntryResult,
  SignMessageResult,
} from '@saganta/stellar-appkit';
import { ConnectError } from '@saganta/stellar-appkit';
import { box, randomBytes } from 'tweetnacl';
import { decodeBase64, decodeUTF8, encodeBase64, encodeUTF8 } from 'tweetnacl-util';

/** The xBull web wallet's connect page — the only origin the WebView loads. */
export const XBULL_WALLET_URL = 'https://wallet.xbull.app/connect';

/** Protocol event names — identical to @creit.tech/xbull-wallet-connect's EventType. */
const EV = {
  INITIAL_RESPONSE: 'XBULL_INITIAL_RESPONSE',
  CONNECT: 'XBULL_CONNECT',
  CONNECT_RESPONSE: 'XBULL_CONNECT_RESPONSE',
  SIGN: 'XBULL_SIGN',
  SIGN_RESPONSE: 'XBULL_SIGN_RESPONSE',
  SIGN_MESSAGE: 'XBULL_SIGN_MESSAGE',
  SIGN_MESSAGE_RESPONSE: 'XBULL_SIGN_MESSAGE_RESPONSE',
} as const;

/**
 * One message from the wallet WebView — the object the wallet passes to
 * `opener.postMessage(...)` (JSON-stringified by the injected shim).
 */
export interface XBullWalletMessage {
  type?: string;
  /** Box-encrypted payload (base64). Absent on rejection replies. */
  message?: string;
  /** Box nonce (base64). */
  oneTimeCode?: string;
  /** The wallet's nacl box public key (base64) — sent on every reply. */
  publicKey?: string;
  /** `false` = the user rejected the request in the wallet UI. */
  success?: boolean;
}

/** Handle to an open wallet WebView — owned by the bridge implementation. */
export interface XBullWalletHandle {
  /** Delivers an encrypted request into the wallet page as a message event. */
  postMessageToWallet(msg: Record<string, unknown>, origin: string): void;
  /** Dismisses the WebView. Safe to call more than once. */
  close(): void;
}

/**
 * Headless bridge contract: present the xBull web wallet (WebView, custom
 * browser view, …), forward its messages, and report user dismissal.
 * Implemented by the WebView screen in `../xbull`, or by the app's own UI.
 */
export interface XBullWebViewBridge {
  openWallet(
    url: string,
    handlers: {
      /** Every message the wallet posts back (already JSON-parsed). */
      onMessage: (msg: XBullWalletMessage) => void;
      /** The user dismissed the WebView before completing the flow. */
      onClosed: () => void;
    }
  ): Promise<XBullWalletHandle>;
}

export interface XBullWebViewConnectorOptions {
  /** Bridge that presents the xBull web wallet (e.g. the WebView screen from `../xbull`). */
  bridge: XBullWebViewBridge;
  /**
   * The app's origin, carried on every request as `event.origin` — the
   * wallet displays it to the user as the requesting app. Derive it from
   * your `appMetadata.url`; must be an absolute URL.
   */
  origin: string;
  /** Override the wallet URL (tests / self-hosted wallets). Defaults to XBULL_WALLET_URL. */
  walletUrl?: string;
}

/**
 * Waits for a single message of the given type. `onClosed` rejects every
 * pending waiter — the wallet UI is gone, nothing else can arrive.
 */
class MessageWaiter {
  private waiters = new Map<string, (msg: XBullWalletMessage) => void>();
  private closedWaiters: (() => void)[] = [];
  private closed = false;

  onMessage(msg: XBullWalletMessage): void {
    const waiter = msg.type ? this.waiters.get(msg.type) : undefined;
    if (waiter) {
      this.waiters.delete(msg.type!);
      waiter(msg);
    }
  }

  onClosed(): void {
    if (this.closed) return;
    this.closed = true;
    // Resolve waiters with a synthetic rejection reply so callers see a
    // uniform "rejected" outcome instead of hanging forever.
    for (const [type, waiter] of this.waiters) {
      this.waiters.delete(type);
      waiter({ type, success: false });
    }
    for (const off of this.closedWaiters) off();
    this.closedWaiters = [];
  }

  waitFor(type: string): Promise<XBullWalletMessage> {
    if (this.closed) return Promise.resolve({ type, success: false });
    return new Promise((resolve) => {
      this.waiters.set(type, resolve);
    });
  }
}

export function createXBullWebViewConnector(opts: XBullWebViewConnectorOptions): WalletConnector {
  const walletUrl = opts.walletUrl ?? XBULL_WALLET_URL;

  const meta: WalletMeta = {
    id: 'xbull',
    name: 'xBull',
    icon: 'data:image/png;base64,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',
    platforms: ['web', 'react-native'],
  };

  const capabilities: WalletCapabilities = {
    signTransaction: true,
    signAuthEntry: false, // the xBull protocol has no auth-entry request type
    signMessage: true,
    submit: false,
  };

  // Long-lived protocol state — created once, exactly like the web SDK's
  // constructor (one nacl box keypair + one 24-byte session per connector).
  const keyPair = box.keyPair();
  const session = encodeBase64(randomBytes(24));
  let cachedAddress: string | null = null;

  /** Decrypts a wallet reply with the wallet key captured at handshake. */
  function decryptFromWallet(msg: XBullWalletMessage, walletPublicKey: Uint8Array): string {
    if (!msg.message || !msg.oneTimeCode) {
      throw ConnectError.internal('xBull wallet reply was missing its encrypted payload.', undefined, meta.id);
    }
    const opened = box.open(
      decodeBase64(msg.message),
      decodeBase64(msg.oneTimeCode),
      walletPublicKey,
      keyPair.secretKey
    );
    if (!opened) {
      throw ConnectError.internal(
        'Could not decrypt the xBull wallet reply — the session may be corrupted. Try connecting again.',
        undefined,
        meta.id
      );
    }
    return encodeUTF8(opened);
  }

  /** Encrypts a request payload for the wallet's public key. */
  function encryptForWallet(payload: unknown, walletPublicKey: Uint8Array): { message: string; oneTimeCode: string } {
    const nonce = randomBytes(24);
    const boxed = box(decodeUTF8(JSON.stringify(payload)), nonce, walletPublicKey, keyPair.secretKey);
    return { message: encodeBase64(boxed), oneTimeCode: encodeBase64(nonce) };
  }

  /**
   * One complete request cycle: open the wallet, handshake, send, await the
   * reply, close. Mirrors the SDK's per-operation popup lifecycle (it opens
   * the wallet for every connect/sign/signMessage call and closes it after).
   */
  async function request<T>(
    eventType: 'XBULL_CONNECT' | 'XBULL_SIGN' | 'XBULL_SIGN_MESSAGE',
    expectResponse: string,
    payload: unknown,
    parseReply: (decrypted: string) => T
  ): Promise<T> {
    const waiter = new MessageWaiter();
    let handle: XBullWalletHandle | null = null;
    let settled = false;
    try {
      const url =
        `${walletUrl}?public=${encodeURIComponent(encodeBase64(keyPair.publicKey))}` +
        `&session=${encodeURIComponent(session)}`;
      handle = await opts.bridge.openWallet(url, {
        onMessage: (msg) => waiter.onMessage(msg),
        onClosed: () => waiter.onClosed(),
      });

      // 1. Handshake — the wallet announces its key and echoes our session.
      const initial = await waiter.waitFor(EV.INITIAL_RESPONSE);
      if (!initial.publicKey || !initial.message || !initial.oneTimeCode) {
        throw ConnectError.internal(
          'xBull wallet did not complete the pairing handshake. Make sure you have a wallet set up at wallet.xbull.app.',
          undefined,
          meta.id
        );
      }
      const walletPublicKey = decodeBase64(initial.publicKey);
      const handshake = JSON.parse(decryptFromWallet(initial, walletPublicKey)) as { providedSession?: string };
      if (handshake.providedSession !== session) {
        throw ConnectError.internal(
          'xBull wallet echoed a different session — the pairing is stale. Try connecting again.',
          undefined,
          meta.id
        );
      }

      // 2. Send the encrypted request.
      const enc = encryptForWallet(payload, walletPublicKey);
      handle.postMessageToWallet({ type: eventType, message: enc.message, oneTimeCode: enc.oneTimeCode }, opts.origin);

      // 3. Await the reply — no timeout: the user takes as long as they need
      //    inside the wallet UI. Dismissing the WebView rejects instead.
      const reply = await waiter.waitFor(expectResponse);
      if (reply.success === false) {
        throw ConnectError.rejected(meta.id);
      }
      const decrypted = decryptFromWallet(reply, walletPublicKey);
      settled = true;
      return parseReply(decrypted);
    } finally {
      // Dismiss the WebView unless the bridge already tore it down. Also
      // flush any waiter that never fired (e.g. handshake failure) so no
      // promise dangles past the close.
      if (!settled) waiter.onClosed();
      try {
        handle?.close();
      } catch {
        /* best-effort */
      }
    }
  }

  const connector: WalletConnector = {
    id: meta.id,
    meta,
    capabilities,

    async getReachability() {
      // The bridge is injected at construction — the web wallet is always a
      // WebView away (it runs in the app, nothing to install).
      return 'available';
    },

    async connect(_opts?: ConnectOptions): Promise<WalletAccount> {
      return withXbullError(async () => {
        const result = await request(
          EV.CONNECT,
          EV.CONNECT_RESPONSE,
          { canRequestPublicKey: true, canRequestSign: true },
          (decrypted) => {
            const parsed = JSON.parse(decrypted) as { publicKey?: string };
            if (!parsed.publicKey) {
              throw ConnectError.internal('xBull wallet did not return a public key.', undefined, meta.id);
            }
            return parsed.publicKey;
          }
        );
        cachedAddress = result;
        return { address: result, walletId: meta.id };
      });
    },

    async disconnect() {
      cachedAddress = null;
    },

    async getAddress(): Promise<GetAddressResult> {
      if (!cachedAddress) {
        throw ConnectError.invalidRequest('xBull is not connected — call connect() first.', undefined, meta.id);
      }
      return { address: cachedAddress };
    },

    async getNetwork(): Promise<GetNetworkResult> {
      // Same as web: the network is passed explicitly with each sign request.
      throw ConnectError.invalidRequest(
        'xBull does not expose a persistent network — pass networkPassphrase explicitly on each call.',
        undefined,
        meta.id
      );
    },

    async signTransaction(xdr: string, signOpts?: SignTxOptions): Promise<SignTransactionResult> {
      return withXbullError(async () => {
        const signerAddress = signOpts?.address ?? cachedAddress;
        if (!signerAddress) {
          throw ConnectError.internal(
            'Could not determine the signer address — call connect() first.',
            undefined,
            meta.id
          );
        }
        const signedTxXdr = await request(
          EV.SIGN,
          EV.SIGN_RESPONSE,
          { xdr, publicKey: signerAddress, network: signOpts?.networkPassphrase },
          (decrypted) => {
            const parsed = JSON.parse(decrypted) as { xdr?: string };
            if (!parsed.xdr) {
              throw ConnectError.internal('xBull wallet did not return a signed transaction.', undefined, meta.id);
            }
            return parsed.xdr;
          }
        );
        return { signedTxXdr, signerAddress };
      });
    },

    async signAuthEntry(): Promise<SignAuthEntryResult> {
      throw ConnectError.invalidRequest(
        'xBull does not support signing Soroban auth entries. Prompt the user to choose a different wallet for this action.',
        undefined,
        meta.id
      );
    },

    async signMessage(message: string, signOpts?: SignOptions): Promise<SignMessageResult> {
      return withXbullError(async () => {
        const result = await request(
          EV.SIGN_MESSAGE,
          EV.SIGN_MESSAGE_RESPONSE,
          {
            message,
            opts: {
              address: signOpts?.address ?? cachedAddress ?? undefined,
              networkPassphrase: signOpts?.networkPassphrase,
            },
          },
          (decrypted) => {
            const parsed = JSON.parse(decrypted) as { signedMessage?: string; signerAddress?: string };
            if (!parsed.signedMessage || !parsed.signerAddress) {
              throw ConnectError.internal('xBull wallet did not return a complete signed message.', undefined, meta.id);
            }
            return parsed;
          }
        );
        return {
          signedMessage: result.signedMessage!,
          signerAddress: result.signerAddress!,
          // Same best-effort hypothesis as the web connector: xBull does not
          // surface the exact bytes it signed. base64(utf8(message)) is the
          // most likely candidate; the verifier's multi-candidate fallback
          // covers pre-hashed variants.
          signedData: utf8ToBase64(message),
        };
      });
    },
  };

  return connector;
}

/** Normalizes thrown errors to ConnectError (mirrors core's withNormalizedError). */
async function withXbullError<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ConnectError) throw err;
    throw ConnectError.internal(
      `xBull request failed: ${err instanceof Error ? err.message : String(err)}`,
      undefined,
      'xbull'
    );
  }
}

/** Pure UTF-8 → base64 (no Buffer — polyfill-free on Hermes). */
function utf8ToBase64(text: string): string {
  const bytes = decodeUTF8(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  // btoa exists on Hermes (RN's base64 builtin); fall back to a manual
  // encoder for runtimes without it.
  if (typeof btoa === 'function') return btoa(binary);
  return manualBase64(bytes);
}

function manualBase64(bytes: Uint8Array): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const at = (i: number): string => chars.charAt(i);
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]!;
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += at(b0 >> 2);
    out += at(((b0 & 3) << 4) | ((b1 ?? 0) >> 4));
    out += b1 === undefined ? '=' : at(((b1 & 15) << 2) | ((b2 ?? 0) >> 6));
    out += b2 === undefined ? '=' : at(b2 & 63);
  }
  return out;
}
