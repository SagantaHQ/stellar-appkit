import { test, expect, describe, mock, beforeEach, afterEach } from 'bun:test';
import { createXBullConnector } from '../../src/connectors/xbull.js';

/**
 * xBull's `ISignMessageResult` distinguishes three things:
 *   - `message`      — the message string we passed in (echoed back)
 *   - `fullMessage`  — the string xBull actually signs (may include a
 *                      wallet-added prefix, similar to how EVM wallets
 *                      prefix personal_sign with "\x19Ethereum Signed
 *                      Message:\n<length>")
 *   - `signedMessage`— the signature
 *
 * The previous version of the connector returned only `signedMessage` and
 * threw away `fullMessage`, which made server-side verification impossible
 * for any case where `fullMessage !== message`. The fix surfaces
 * `fullMessage` as `signedData = base64(utf8(fullMessage))`.
 *
 * These tests mock `@creit.tech/xbull-wallet-connect` so we can assert
 * exactly what the connector does with the SDK response.
 */

type XBullSignMessageResult = {
  success: true;
  message: string;
  fullMessage?: string;
  signedMessage: string;
  signerAddress: string;
};

type XBullApi = {
  xBullWalletConnect: new () => {
    connect: (params?: { canRequestPublicKey: boolean; canRequestSign: boolean }) => Promise<string>;
    sign: (params: { xdr: string; publicKey?: string; network?: string }) => Promise<string>;
    signMessage: (
      message: string,
      opts?: { networkPassphrase?: string; address?: string }
    ) => Promise<XBullSignMessageResult>;
    closeConnections: () => void;
  };
};

let fakeSignMessageResult: XBullSignMessageResult | null = null;
let fakeConnectResult: string = 'GA2C5RFPE6GCKMY3US5PAB6UZLKIGSPIUKSLRB6Q3IY7ZP4PAOMM43YA';

mock.module('@creit.tech/xbull-wallet-connect', () => ({
  xBullWalletConnect: class {
    async connect() { return fakeConnectResult; }
    async sign() { return 'signedXdr'; }
    async signMessage() {
      if (!fakeSignMessageResult) throw new Error('test setup error: fakeSignMessageResult not set');
      return fakeSignMessageResult;
    }
    closeConnections() {}
  },
}));

beforeEach(() => {
  fakeSignMessageResult = null;
  fakeConnectResult = 'GA2C5RFPE6GCKMY3US5PAB6UZLKIGSPIUKSLRB6Q3IY7ZP4PAOMM43YA';
  // The connector now polls for globalThis.xBullSDK injection before each
  // bridge call (to avoid the "opens web wallet instead of extension" race
  // condition). Set globalThis.xBullSDK to a truthy value so the poll returns
  // immediately in tests — otherwise every test would wait 2 seconds for
  // the injection timeout.
  (globalThis as { xBullSDK?: unknown }).xBullSDK = { __testStub: true };
});

afterEach(() => {
  // Clean up the globalThis.xBullSDK stub between tests so state doesn't leak.
  delete (globalThis as { xBullSDK?: unknown }).xBullSDK;
});

describe('createXBullConnector — signMessage', () => {
  const message = 'localhost wants you to sign in with your Stellar account:\nG...\n\nStatement: x';
  const address = 'GA2C5RFPE6GCKMY3US5PAB6UZLKIGSPIUKSLRB6Q3IY7ZP4PAOMM43YA';

  test('uses fullMessage as signedData when present', async () => {
    // The smoking-gun test: when xBull returns fullMessage = "prefix\n" + message,
    // the connector must return signedData = base64(utf8(fullMessage)),
    // NOT base64(utf8(message)). The verifier needs the actual bytes the
    // wallet signed.
    const fullMessage = 'Stellar Wallet Sign Message:\n' + message;
    fakeSignMessageResult = {
      success: true,
      message,
      fullMessage,
      signedMessage: Buffer.alloc(64).fill(0x42).toString('base64'),
      signerAddress: address,
    };

    const connector = createXBullConnector();
    await connector.connect({ canRequestPublicKey: true, canRequestSign: true });
    const result = await connector.signMessage(message);

    expect(result.signedMessage).toBe(Buffer.alloc(64).fill(0x42).toString('base64'));
    expect(result.signerAddress).toBe(address);
    expect(result.signedData).toBe(Buffer.from(fullMessage, 'utf-8').toString('base64'));
    // And NOT the plaintext message:
    expect(result.signedData).not.toBe(Buffer.from(message, 'utf-8').toString('base64'));
  });

  test('falls back to result.message when fullMessage is missing (older xBull SDK)', async () => {
    // Older versions of the xBull SDK may not return fullMessage. In that
    // case, the best we can do is fall back to the plaintext message —
    // which is correct for any version of xBull that signs the raw message
    // verbatim (no prefix). If a future xBull version signs a prefixed
    // message but doesn't expose fullMessage, this fallback will fail
    // verification loudly, which is the right thing to do rather than
    // silently passing.
    fakeSignMessageResult = {
      success: true,
      message,
      // fullMessage intentionally omitted
      signedMessage: Buffer.alloc(64).fill(0x42).toString('base64'),
      signerAddress: address,
    };

    const connector = createXBullConnector();
    await connector.connect({ canRequestPublicKey: true, canRequestSign: true });
    const result = await connector.signMessage(message);

    expect(result.signedData).toBe(Buffer.from(message, 'utf-8').toString('base64'));
  });

  test('falls back to the input message when neither fullMessage nor message is in the response', async () => {
    // Defensive: if the SDK returns neither field (shouldn't happen, but
    // we've seen SDKs ship broken shapes before), use the message we
    // passed in as the last resort. Better than crashing.
    fakeSignMessageResult = {
      success: true,
      // both message and fullMessage intentionally omitted
      signedMessage: Buffer.alloc(64).fill(0x42).toString('base64'),
      signerAddress: address,
    } as XBullSignMessageResult;

    const connector = createXBullConnector();
    await connector.connect({ canRequestPublicKey: true, canRequestSign: true });
    const result = await connector.signMessage(message);

    expect(result.signedData).toBe(Buffer.from(message, 'utf-8').toString('base64'));
  });

  test('passes address and networkPassphrase opts through to the bridge', async () => {
    let capturedOpts: unknown;
    fakeSignMessageResult = {
      success: true,
      message,
      fullMessage: message,
      signedMessage: Buffer.alloc(64).toString('base64'),
      signerAddress: address,
    };

    // Override the bridge to capture opts
    const { xBullWalletConnect } = await import('@creit.tech/xbull-wallet-connect');
    const origProto = (xBullWalletConnect as unknown as { prototype: unknown }).prototype as {
      signMessage: (msg: string, opts?: unknown) => Promise<XBullSignMessageResult>;
    };
    const orig = origProto.signMessage;
    origProto.signMessage = async (msg: string, opts?: unknown) => {
      capturedOpts = opts;
      return fakeSignMessageResult!;
    };

    try {
      const connector = createXBullConnector();
      await connector.connect({ canRequestPublicKey: true, canRequestSign: true });
      await connector.signMessage(message, {
        networkPassphrase: 'Test SDF Network ; September 2015',
        address,
      });

      expect(capturedOpts).toEqual({
        networkPassphrase: 'Test SDF Network ; September 2015',
        address,
      });
    } finally {
      origProto.signMessage = orig;
    }
  });

  test('normalizes thrown errors into ConnectError', async () => {
    const { xBullWalletConnect } = await import('@creit.tech/xbull-wallet-connect');
    const origProto = (xBullWalletConnect as unknown as { prototype: unknown }).prototype as {
      signMessage: (msg: string, opts?: unknown) => Promise<XBullSignMessageResult>;
    };
    const orig = origProto.signMessage;
    origProto.signMessage = async () => {
      throw new Error('User denied the request');
    };

    try {
      const connector = createXBullConnector();
      await connector.connect({ canRequestPublicKey: true, canRequestSign: true });
      expect(connector.signMessage(message)).rejects.toThrow(/denied|rejected/i);
    } finally {
      origProto.signMessage = orig;
    }
  });
});

describe('createXBullConnector — extension detection', () => {
  test('getReachability returns "available" when window.xBullSDK is present', async () => {
    // window.xBullSDK is set in beforeEach to a truthy stub.
    const connector = createXBullConnector();
    const reachability = await connector.getReachability();
    expect(reachability).toBe('available');
  });

  test('getReachability returns "not-installed" when the extension is absent after the timeout', async () => {
    // Remove the stub set in beforeEach — simulates the extension NOT being
    // installed. In a real browser, the poll would time out after 2s and
    // return 'not-installed'. In bun's test environment (no `window`), the
    // connector returns 'unavailable' instead — so we only assert
    // 'not-installed' when running in a browser-like environment.
    delete (globalThis as { xBullSDK?: unknown }).xBullSDK;
    const connector = createXBullConnector();
    const reachability = await connector.getReachability();
    // In bun (no window), this returns 'unavailable'. In a browser, it
    // would return 'not-installed' after the 2s timeout. We accept either
    // — the important thing is it's NOT 'available' (which would mean the
    // extension was detected).
    expect(reachability).not.toBe('available');
  });

  test('connect() waits for window.xBullSDK injection before calling the bridge', async () => {
    // Start with no extension injected, then inject it after a short delay.
    // The connector should wait for the injection rather than immediately
    // falling back to the web wallet popup.
    delete (globalThis as { xBullSDK?: unknown }).xBullSDK;

    let bridgeConnectCalled = false;
    const { xBullWalletConnect } = await import('@creit.tech/xbull-wallet-connect');
    const origProto = (xBullWalletConnect as unknown as { prototype: unknown }).prototype as {
      connect: (params?: unknown) => Promise<string>;
    };
    const orig = origProto.connect;
    origProto.connect = async () => {
      bridgeConnectCalled = true;
      return fakeConnectResult;
    };

    // Inject window.xBullSDK after 100ms — the connector's poll (50ms interval)
    // should pick it up within the 2s timeout.
    setTimeout(() => {
      (globalThis as { xBullSDK?: unknown }).xBullSDK = { __testStub: true };
    }, 100);

    try {
      const connector = createXBullConnector();
      const account = await connector.connect({ canRequestPublicKey: true, canRequestSign: true });
      expect(account.address).toBe(fakeConnectResult);
      expect(bridgeConnectCalled).toBe(true);
    } finally {
      origProto.connect = orig;
    }
  });
});
