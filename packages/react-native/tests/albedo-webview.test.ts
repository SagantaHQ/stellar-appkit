import { test, expect, describe } from 'bun:test';
import { createAlbedoWebViewConnector, ALBEDO_FRONTEND_URL, type AlbedoWebViewBridge } from '../src/connectors/albedo-webview.js';
import { ConnectError } from '@saganta/stellar-appkit';

/**
 * A fake bridge that records the (url, params) it was asked to open and
 * replies with a canned Albedo response — enough to drive the connector's
 * full request/response normalization without a WebView.
 */
function fakeBridge(reply: (params: Record<string, unknown>) => Record<string, unknown>): AlbedoWebViewBridge & { calls: { url: string; params: Record<string, unknown> }[] } {
  const calls: { url: string; params: Record<string, unknown> }[] = [];
  return {
    calls,
    async openIntent(url, params) {
      calls.push({ url, params: { ...params } });
      return reply(params);
    },
  };
}

const TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015';
const PUBNET_PASSPHRASE = 'Public Global Stellar Network ; September 2015';

describe('createAlbedoWebViewConnector', () => {
  test('connect() sends the public_key intent with protocol fields to the confirm URL', async () => {
    const bridge = fakeBridge(() => ({ result: 'success', pubkey: 'GA2C5RFPE6GCKMY3US5PAB6UZLKIGSPIUKSLRB6Q3IY7ZP4PAOMM43YA' }));
    const connector = createAlbedoWebViewConnector({ bridge, origin: 'https://myapp.example' });

    expect(await connector.getReachability()).toBe('available');
    const account = await connector.connect();
    expect(account.address).toBe('GA2C5RFPE6GCKMY3US5PAB6UZLKIGSPIUKSLRB6Q3IY7ZP4PAOMM43YA');

    const call = bridge.calls[0]!;
    expect(call.url).toBe(ALBEDO_FRONTEND_URL);
    expect(call.url).toBe('https://albedo.link/confirm');
    expect(call.params.intent).toBe('public_key');
    expect(call.params.__albedo_intent_version).toBe(2);
    expect(typeof call.params.__reqid).toBe('string');
  });

  test('getAddress() reuses the last known address without a second intent', async () => {
    const bridge = fakeBridge(() => ({ result: 'success', pubkey: 'GA2C5RFPE6GCKMY3US5PAB6UZLKIGSPIUKSLRB6Q3IY7ZP4PAOMM43YA' }));
    const connector = createAlbedoWebViewConnector({ bridge, origin: 'https://myapp.example' });
    await connector.connect();
    const res = await connector.getAddress();
    expect(res.address).toBe('GA2C5RFPE6GCKMY3US5PAB6UZLKIGSPIUKSLRB6Q3IY7ZP4PAOMM43YA');
    expect(bridge.calls.length).toBe(1); // no extra intent
  });

  test('signTransaction() maps the passphrase to Albedo network and returns the envelope', async () => {
    const bridge = fakeBridge((params) =>
      params.intent === 'public_key'
        ? { result: 'success', pubkey: 'GA2C5RFPE6GCKMY3US5PAB6UZLKIGSPIUKSLRB6Q3IY7ZP4PAOMM43YA' }
        : { result: 'success', signed_envelope_xdr: 'AAAAAgAAAABB' }
    );
    const connector = createAlbedoWebViewConnector({ bridge, origin: 'https://myapp.example' });
    await connector.connect();

    const res = await connector.signTransaction('AAAAAA', { networkPassphrase: TESTNET_PASSPHRASE });
    expect(res.signedTxXdr).toBe('AAAAAgAAAABB');
    expect(res.signerAddress).toBe('GA2C5RFPE6GCKMY3US5PAB6UZLKIGSPIUKSLRB6Q3IY7ZP4PAOMM43YA');

    const call = bridge.calls.at(-1)!;
    expect(call.params.intent).toBe('tx');
    expect(call.params.network).toBe('testnet');
    expect(call.params.submit).toBe(false);
  });

  test('public passphrase maps to the public network', async () => {
    const bridge = fakeBridge((params) =>
      params.intent === 'public_key'
        ? { result: 'success', pubkey: 'GA2C5RFPE6GCKMY3US5PAB6UZLKIGSPIUKSLRB6Q3IY7ZP4PAOMM43YA' }
        : { result: 'success', signed_envelope_xdr: 'X' }
    );
    const connector = createAlbedoWebViewConnector({ bridge, origin: 'https://myapp.example' });
    await connector.connect();
    await connector.signTransaction('AAAAAA', { networkPassphrase: PUBNET_PASSPHRASE });
    expect(bridge.calls.at(-1)!.params.network).toBe('public');
  });

  test('signMessage() converts the hex signed_message to base64 signedData', async () => {
    // 'deadbeef' hex → base64 '3q2+7w=='
    const bridge = fakeBridge(() => ({
      result: 'success',
      pubkey: 'GA2C5RFPE6GCKMY3US5PAB6UZLKIGSPIUKSLRB6Q3IY7ZP4PAOMM43YA',
      message_signature: 'aabbcc',
      signed_message: 'deadbeef',
    }));
    const connector = createAlbedoWebViewConnector({ bridge, origin: 'https://myapp.example' });

    const res = await connector.signMessage('hello world');
    expect(res.signedMessage).toBe('aabbcc');
    expect(res.signerAddress).toBe('GA2C5RFPE6GCKMY3US5PAB6UZLKIGSPIUKSLRB6Q3IY7ZP4PAOMM43YA');
    expect(res.signedData).toBe('3q2+7w==');
  });

  test('rejection responses normalize to the same ConnectError as the web popup flow', async () => {
    const bridge = fakeBridge(() => ({ result: 'error', code: -1, message: 'Action rejected by user' }));
    const connector = createAlbedoWebViewConnector({ bridge, origin: 'https://myapp.example' });

    const err = await connector.connect().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConnectError);
    expect((err as ConnectError).code).toBe(-4); // rejected — same as the web popup flow
    expect((err as ConnectError).walletId).toBe('albedo');
  });

  test('other errors surface as externalService ConnectErrors', async () => {
    const bridge = fakeBridge(() => ({ result: 'error', message: 'Exploded' }));
    const connector = createAlbedoWebViewConnector({ bridge, origin: 'https://myapp.example' });

    const err = await connector.connect().catch((e: unknown) => e);
    expect((err as ConnectError).code).toBe(-2); // externalService
    expect((err as ConnectError).message).toContain('Exploded');
  });

  test('signAuthEntry is reported unsupported via capabilities and throws invalidRequest', async () => {
    const bridge = fakeBridge(() => ({ result: 'success' }));
    const connector = createAlbedoWebViewConnector({ bridge, origin: 'https://myapp.example' });
    expect(connector.capabilities.signAuthEntry).toBe(false);
    expect(connector.capabilities.signMessage).toBe(true);
    expect(connector.capabilities.signTransaction).toBe(true);
    const err = await connector.signAuthEntry('x').catch((e: unknown) => e);
    expect((err as ConnectError).code).toBe(-3);
  });
});
