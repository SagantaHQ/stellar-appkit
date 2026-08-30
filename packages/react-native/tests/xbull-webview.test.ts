import { test, expect, describe } from 'bun:test';
import { box, randomBytes } from 'tweetnacl';
import { decodeBase64, decodeUTF8, encodeBase64, encodeUTF8 } from 'tweetnacl-util';
import { createXBullWebViewConnector, XBULL_WALLET_URL, type XBullWebViewBridge, type XBullWalletHandle, type XBullWalletMessage } from '../src/connectors/xbull-webview.js';
import { ConnectError } from '@saganta/stellar-appkit';

/**
 * A fake xBull web wallet implementing the real popup protocol from the
 * wallet's side: handshake (XBULL_INITIAL_RESPONSE with a session echo),
 * request decryption, encrypted replies. The crypto is the same tweetnacl
 * box the live wallet bundle uses, so the connector under test has to get
 * the protocol byte-for-byte right.
 */
function fakeWallet(opts?: {
  reject?: boolean;
  badSessionEcho?: boolean;
  neverHandshake?: boolean;
}) {
  const walletKp = box.keyPair();
  const calls: {
    urls: string[];
    appPublicKey: Uint8Array;
    session: string;
    requests: { type: string; payload: unknown; origin: string }[];
    closed: number;
  } = { urls: [], appPublicKey: new Uint8Array(), session: '', requests: [], closed: 0 };

  const bridge: XBullWebViewBridge & { calls: typeof calls } = {
    calls,
    async openWallet(url, handlers) {
      calls.urls.push(url);
      const u = new URL(url);
      calls.appPublicKey = decodeBase64(u.searchParams.get('public') ?? '');
      calls.session = u.searchParams.get('session') ?? '';

      if (!opts?.neverHandshake) {
        // 1. Handshake — echo the app's session, encrypted for its key.
        const nonce = randomBytes(24);
        const echo = opts?.badSessionEcho ? 'someone-elses-session' : calls.session;
        const payload = box(
          decodeUTF8(JSON.stringify({ providedSession: echo, walletSession: 'wallet-session' })),
          nonce,
          calls.appPublicKey,
          walletKp.secretKey
        );
        setTimeout(() => {
          handlers.onMessage({
            type: 'XBULL_INITIAL_RESPONSE',
            message: encodeBase64(payload),
            oneTimeCode: encodeBase64(nonce),
            publicKey: encodeBase64(walletKp.publicKey),
          });
        }, 0);
      }

      const handle: XBullWalletHandle = {
        postMessageToWallet(msg, origin) {
          const type = msg.type as string;
          // Decrypt the app's request (the wallet knows the app key from the URL).
          const opened = box.open(
            decodeBase64(msg.message as string),
            decodeBase64(msg.oneTimeCode as string),
            calls.appPublicKey,
            walletKp.secretKey
          );
          if (!opened) throw new Error('wallet could not decrypt request');
          const payload = JSON.parse(encodeUTF8(opened));
          calls.requests.push({ type, payload, origin });

          if (opts?.reject) {
            setTimeout(() => handlers.onMessage({ type: type + '_RESPONSE', success: false }), 0);
            return;
          }

          const replyFor: Record<string, Record<string, unknown>> = {
            XBULL_CONNECT: { publicKey: 'GA2C5RFPE6GCKMY3US5PAB6UZLKIGSPIUKSLRB6Q3IY7ZP4PAOMM43YA' },
            XBULL_SIGN: { xdr: 'AAAAAG9uZXRlc3Qtc2lnbmVkLWVudmVsb3Bl' },
            XBULL_SIGN_MESSAGE: { signedMessage: 'c2lnbmF0dXJl', signerAddress: 'GA2C5RFPE6GCKMY3US5PAB6UZLKIGSPIUKSLRB6Q3IY7ZP4PAOMM43YA' },
          };
          const reply = replyFor[type];
          if (!reply) throw new Error('unexpected request type ' + type);
          const n2 = randomBytes(24);
          const boxed = box(decodeUTF8(JSON.stringify(reply)), n2, calls.appPublicKey, walletKp.secretKey);
          setTimeout(() => {
            handlers.onMessage({
              type: type + '_RESPONSE',
              message: encodeBase64(boxed),
              oneTimeCode: encodeBase64(n2),
              publicKey: encodeBase64(walletKp.publicKey),
              success: true,
            });
          }, 0);
        },
        close() {
          calls.closed++;
          closedHandlers.forEach((off) => off());
        },
      };

      const closedHandlers: (() => void)[] = [];
      (handle as XBullWalletHandle & { __closedHandlers?: () => void[] }).__closedHandlers = () => closedHandlers;
      // expose onClosed notification for the "user dismisses" test
      (handle as unknown as { notifyClosed: () => void }).notifyClosed = () => handlers.onClosed();

      return handle;
    },
  };
  return { bridge, calls };
}

const TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015';

describe('createXBullWebViewConnector', () => {
  test('getReachability() is available — the web wallet is a WebView away', async () => {
    const { bridge } = fakeWallet();
    const connector = createXBullWebViewConnector({ bridge, origin: 'https://myapp.example' });
    expect(await connector.getReachability()).toBe('available');
  });

  test('connect() runs the full handshake → request → reply cycle', async () => {
    const { bridge, calls } = fakeWallet();
    const connector = createXBullWebViewConnector({ bridge, origin: 'https://myapp.example' });

    const account = await connector.connect();
    expect(account.address).toBe('GA2C5RFPE6GCKMY3US5PAB6UZLKIGSPIUKSLRB6Q3IY7ZP4PAOMM43YA');
    expect(account.walletId).toBe('xbull');

    // The wallet URL carries the app's box public key + session (base64).
    expect(calls.urls[0]!.startsWith(XBULL_WALLET_URL + '?public=')).toBe(true);
    expect(calls.urls[0]!.includes('&session=')).toBe(true);
    expect(calls.session.length).toBe(32); // base64 of 24 random bytes

    // The request payload matches the xBull SDK's IConnectParams.
    const req = calls.requests[0]!;
    expect(req.type).toBe('XBULL_CONNECT');
    expect(req.origin).toBe('https://myapp.example');
    expect(req.payload).toEqual({ canRequestPublicKey: true, canRequestSign: true });

    // The WebView was closed after the cycle (web SDK closes the popup too).
    expect(calls.closed).toBe(1);
  });

  test('connect() closes the WebView even when the wallet never handshakes', async () => {
    const { bridge, calls } = fakeWallet({ neverHandshake: true });
    const connector = createXBullWebViewConnector({ bridge, origin: 'https://myapp.example' });

    // Dismiss the wallet on the user's behalf after openWallet resolves —
    // the pending handshake must reject, not hang.
    const originalOpen = bridge.openWallet.bind(bridge);
    (bridge as { openWallet: typeof originalOpen }).openWallet = async (url, handlers) => {
      const handle = await originalOpen(url, handlers);
      setTimeout(() => (handle as unknown as { notifyClosed: () => void }).notifyClosed(), 0);
      return handle;
    };

    await expect(connector.connect()).rejects.toThrow();
    expect(calls.closed).toBeGreaterThanOrEqual(1);
  });

  test('a rejected approval surfaces as ConnectError.rejected', async () => {
    const { bridge } = fakeWallet({ reject: true });
    const connector = createXBullWebViewConnector({ bridge, origin: 'https://myapp.example' });
    const err = await connector.connect().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConnectError);
  });

  test('a wrong session echo aborts the pairing', async () => {
    const { bridge } = fakeWallet({ badSessionEcho: true });
    const connector = createXBullWebViewConnector({ bridge, origin: 'https://myapp.example' });
    await expect(connector.connect()).rejects.toThrow(/session/i);
  });

  test('signTransaction() sends xdr + publicKey + network and returns the envelope', async () => {
    const { bridge, calls } = fakeWallet();
    const connector = createXBullWebViewConnector({ bridge, origin: 'https://myapp.example' });
    await connector.connect();

    const res = await connector.signTransaction('AAAAAGR1bW15LXhkcg==', {
      networkPassphrase: TESTNET_PASSPHRASE,
    });
    expect(res.signedTxXdr).toBe('AAAAAG9uZXRlc3Qtc2lnbmVkLWVudmVsb3Bl');
    expect(res.signerAddress).toBe('GA2C5RFPE6GCKMY3US5PAB6UZLKIGSPIUKSLRB6Q3IY7ZP4PAOMM43YA');

    const req = calls.requests[1]!;
    expect(req.type).toBe('XBULL_SIGN');
    expect(req.payload).toEqual({
      xdr: 'AAAAAGR1bW15LXhkcg==',
      publicKey: 'GA2C5RFPE6GCKMY3US5PAB6UZLKIGSPIUKSLRB6Q3IY7ZP4PAOMM43YA',
      network: TESTNET_PASSPHRASE,
    });
  });

  test('signMessage() sends message + opts and maps the reply', async () => {
    const { bridge, calls } = fakeWallet();
    const connector = createXBullWebViewConnector({ bridge, origin: 'https://myapp.example' });
    await connector.connect();

    const res = await connector.signMessage('Hello xBull', {
      networkPassphrase: TESTNET_PASSPHRASE,
    });
    expect(res.signedMessage).toBe('c2lnbmF0dXJl');
    expect(res.signerAddress).toBe('GA2C5RFPE6GCKMY3US5PAB6UZLKIGSPIUKSLRB6Q3IY7ZP4PAOMM43YA');
    // best-effort signedData = base64(utf8(message))
    expect(res.signedData).toBe(btoa('Hello xBull'));

    const req = calls.requests[1]!;
    expect(req.type).toBe('XBULL_SIGN_MESSAGE');
    expect(req.payload).toEqual({
      message: 'Hello xBull',
      opts: {
        address: 'GA2C5RFPE6GCKMY3US5PAB6UZLKIGSPIUKSLRB6Q3IY7ZP4PAOMM43YA',
        networkPassphrase: TESTNET_PASSPHRASE,
      },
    });
  });

  test('getAddress() works after connect; getNetwork()/signAuthEntry() reject cleanly', async () => {
    const { bridge } = fakeWallet();
    const connector = createXBullWebViewConnector({ bridge, origin: 'https://myapp.example' });
    await connector.connect();

    const addr = await connector.getAddress();
    expect(addr.address).toBe('GA2C5RFPE6GCKMY3US5PAB6UZLKIGSPIUKSLRB6Q3IY7ZP4PAOMM43YA');

    await expect(connector.getNetwork()).rejects.toBeInstanceOf(ConnectError);
    await expect(connector.signAuthEntry('AAAAAGR1bW15')).rejects.toBeInstanceOf(ConnectError);
  });

  test('the connector keeps ONE keypair + session across operations (web SDK parity)', async () => {
    const { bridge, calls } = fakeWallet();
    const connector = createXBullWebViewConnector({ bridge, origin: 'https://myapp.example' });
    await connector.connect();
    await connector.signTransaction('AAAAAGR1bW15LXhkcg==', { networkPassphrase: TESTNET_PASSPHRASE });

    const pubA = new URL(calls.urls[0]!).searchParams.get('public');
    const pubB = new URL(calls.urls[1]!).searchParams.get('public');
    const sesA = new URL(calls.urls[0]!).searchParams.get('session');
    const sesB = new URL(calls.urls[1]!).searchParams.get('session');
    expect(pubA).toBe(pubB);
    expect(sesA).toBe(sesB);
  });

  test('decrypting a corrupted reply fails with a clear ConnectError', async () => {
    // Corrupt wallet: handshake fine, but garbage payloads afterwards.
    const walletKp = box.keyPair();
    const calls: string[] = [];
    const bridge: XBullWebViewBridge = {
      async openWallet(url, handlers) {
        calls.push(url);
        const u = new URL(url);
        const appPub = decodeBase64(u.searchParams.get('public') ?? '');
        const session = u.searchParams.get('session') ?? '';
        const nonce = randomBytes(24);
        const payload = box(decodeUTF8(JSON.stringify({ providedSession: session, walletSession: 's' })), nonce, appPub, walletKp.secretKey);
        setTimeout(() => handlers.onMessage({
          type: 'XBULL_INITIAL_RESPONSE',
          message: encodeBase64(payload),
          oneTimeCode: encodeBase64(nonce),
          publicKey: encodeBase64(walletKp.publicKey),
        }), 0);
        return {
          postMessageToWallet(msg) {
            const n2 = randomBytes(24);
            const garbage = box(decodeUTF8(JSON.stringify({ publicKey: 'GABC' })), n2, appPub, walletKp.secretKey);
            // Tamper with the ciphertext — decryption must fail.
            const bytes = decodeBase64(encodeBase64(garbage));
            bytes[0] = bytes[0]! ^ 0xff;
            setTimeout(() => handlers.onMessage({
              type: 'XBULL_CONNECT_RESPONSE',
              message: encodeBase64(bytes),
              oneTimeCode: encodeBase64(n2),
              publicKey: encodeBase64(walletKp.publicKey),
              success: true,
            }), 0);
          },
          close() {},
        };
      },
    };
    const connector = createXBullWebViewConnector({ bridge, origin: 'https://myapp.example' });
    await expect(connector.connect()).rejects.toThrow(/decrypt/i);
  });
});
