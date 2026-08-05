import { test, expect, describe, mock, beforeEach } from 'bun:test';
import { createAlbedoConnector } from '../../src/connectors/albedo.js';

/**
 * Albedo is the wallet that motivated the `signedData` fix.
 *
 * Per Albedo's `signMessage` intent, it returns THREE things:
 *   - `original_message` — the message we passed in (echoed back)
 *   - `signed_message`   — a HEX-encoded value DERIVED from the pubkey and
 *                          the message. THIS is what Albedo actually signs;
 *                          the derivation is opaque / server-side.
 *   - `message_signature`— a HEX-encoded ed25519 signature over
 *                          `signed_message`'s bytes.
 *
 * The previous version of the connector returned only `message_signature`
 * and threw away `signed_message`, which made server-side verification
 * impossible: the verifier had no way to know what bytes Albedo actually
 * signed. The fix surfaces `signed_message` as `signedData` (base64 of the
 * hex-decoded bytes), so the verifier can verify against them.
 *
 * These tests mock `@albedo-link/intent` so we can assert exactly what the
 * connector does with the SDK response — including the case where Albedo
 * doesn't return `signed_message` (very old version).
 */

type AlbedoSignMessageResponse = {
  pubkey: string;
  original_message?: string;
  signed_message?: string;
  message_signature: string;
};

type AlbedoApi = {
  publicKey: (opts?: unknown) => Promise<{ pubkey: string }>;
  tx: (opts: unknown) => Promise<{ signed_envelope_xdr: string }>;
  signMessage: (opts: { message: string; pubkey?: string }) => Promise<AlbedoSignMessageResponse>;
};

let fakeApi: Partial<AlbedoApi> = {};

mock.module('@albedo-link/intent', () => ({
  default: {
    publicKey: (opts?: unknown) =>
      (fakeApi.publicKey ?? (async () => ({ pubkey: 'GA2C5RFPE6GCKMY3US5PAB6UZLKIGSPIUKSLRB6Q3IY7ZP4PAOMM43YA' })))(opts),
    tx: (opts: unknown) =>
      (fakeApi.tx ?? (async () => ({ signed_envelope_xdr: 'xdr' })))(opts),
    signMessage: (opts: { message: string; pubkey?: string }) =>
      (fakeApi.signMessage ?? (async () => ({
        pubkey: 'GA2C5RFPE6GCKMY3US5PAB6UZLKIGSPIUKSLRB6Q3IY7ZP4PAOMM43YA',
        signed_message: '00'.repeat(32),
        message_signature: '00'.repeat(64),
      })))(opts),
  },
}));

beforeEach(() => {
  fakeApi = {};
});

describe('createAlbedoConnector — signMessage', () => {
  const message = 'localhost wants you to sign in with your Stellar account:\nG...\n\nStatement: x';
  const address = 'GA2C5RFPE6GCKMY3US5PAB6UZLKIGSPIUKSLRB6Q3IY7ZP4PAOMM43YA';

  test('surfaces signed_message as signedData (base64 of hex-decoded bytes)', async () => {
    // The smoking-gun test: when Albedo returns signed_message = hex(X),
    // the connector must return signedData = base64(X). This is the bytes
    // the verifier must feed to Keypair.verify.
    const derivedBytesHex = 'deadbeefcafebabe'.repeat(8); // 64 hex chars = 32 bytes
    const sigHex = '00'.repeat(64); // 128 hex chars = 64-byte signature

    fakeApi.signMessage = async () => ({
      pubkey: address,
      signed_message: derivedBytesHex,
      message_signature: sigHex,
    });

    const connector = createAlbedoConnector();
    const result = await connector.signMessage(message);

    expect(result.signedMessage).toBe(sigHex);
    expect(result.signerAddress).toBe(address);
    expect(result.signedData).toBe(
      Buffer.from(derivedBytesHex, 'hex').toString('base64')
    );
  });

  test('does NOT use the plaintext message as signedData', async () => {
    // This is the regression guard: if a future refactor accidentally
    // makes the connector fall back to utf8(message) for signedData,
    // verification will silently break for Albedo. Catch it here.
    const derivedBytesHex = 'abcd'.repeat(16); // 64 hex chars
    fakeApi.signMessage = async () => ({
      pubkey: address,
      signed_message: derivedBytesHex,
      message_signature: '00'.repeat(64),
    });

    const connector = createAlbedoConnector();
    const result = await connector.signMessage(message);

    const plaintextBase64 = Buffer.from(message, 'utf-8').toString('base64');
    expect(result.signedData).not.toBe(plaintextBase64);
    expect(result.signedData).toBe(
      Buffer.from(derivedBytesHex, 'hex').toString('base64')
    );
  });

  test('passes pubkey from opts or lastKnownAddress into the intent', async () => {
    let capturedPubkey: unknown;
    fakeApi.signMessage = async (opts) => {
      capturedPubkey = opts.pubkey;
      return {
        pubkey: address,
        signed_message: '00'.repeat(32),
        message_signature: '00'.repeat(64),
      };
    };

    const connector = createAlbedoConnector();
    await connector.signMessage(message, { address });

    expect(capturedPubkey).toBe(address);
  });

  test('throws ConnectError when Albedo does not return signed_message', async () => {
    // Very old Albedo versions may not return signed_message. The connector
    // must fail loudly rather than silently producing a payload the server
    // can't verify.
    fakeApi.signMessage = async () => ({
      pubkey: address,
      message_signature: '00'.repeat(64),
      // signed_message intentionally omitted
    });

    const connector = createAlbedoConnector();
    expect(connector.signMessage(message)).rejects.toThrow(/signed_message/);
  });

  test('normalizes thrown errors into ConnectError', async () => {
    fakeApi.signMessage = async () => {
      throw new Error('User rejected the request');
    };

    const connector = createAlbedoConnector();
    expect(connector.signMessage(message)).rejects.toThrow(/rejected/i);
  });
});
