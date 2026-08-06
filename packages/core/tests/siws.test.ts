import { test, expect, describe } from 'bun:test';
import { parseSiwsMessage, signInWithStellar } from '../src/index.js';
import type { WalletConnector, SignMessageResult } from '../src/index.js';
import { buildSiwsMessage, makeSiwsFixture } from './helpers.js';

describe('buildSiwsMessage format', () => {
  // This is the test that catches drift between the test-helper's
  // buildSiwsMessage copy and the library's internal one. If a developer
  // changes the format in src/siws.ts but not the helper, parsing fails
  // here. (The helper is duplicated because the library doesn't export
  // buildSiwsMessage — it's an internal detail.)
  test('produces a message that parseSiwsMessage can round-trip', () => {
    const f = makeSiwsFixture();
    const message = buildSiwsMessage(f);
    const parsed = parseSiwsMessage(message);

    expect(parsed).not.toBeNull();
    expect(parsed!.domain).toBe(f.domain);
    expect(parsed!.address).toBe(f.address);
    expect(parsed!.statement).toBe(f.statement);
    expect(parsed!.uri).toBe(f.uri);
    expect(parsed!.version).toBe('1');
    expect(parsed!.chainId).toBe('testnet');
    expect(parsed!.nonce).toBe(f.nonce);
    expect(parsed!.issuedAt).toBe(f.issuedAt.toISOString());
    expect(parsed!.expirationTime).toBe(f.expirationTime.toISOString());
  });

  test('uses "pubnet" as the chain ID for PUBLIC network', () => {
    const message = buildSiwsMessage({ ...makeSiwsFixture(), network: 'PUBLIC' });
    const parsed = parseSiwsMessage(message);
    expect(parsed!.chainId).toBe('pubnet');
  });

  test('lowercases the chain ID for non-PUBLIC networks', () => {
    const message = buildSiwsMessage({ ...makeSiwsFixture(), network: 'TESTNET' });
    const parsed = parseSiwsMessage(message);
    expect(parsed!.chainId).toBe('testnet');
  });
});

describe('parseSiwsMessage — rejection cases', () => {
  test('returns null for an empty string', () => {
    expect(parseSiwsMessage('')).toBeNull();
  });

  test('returns null when the domain header line is missing', () => {
    const bad = ['GA...', '', 'Statement: x'].join('\n');
    expect(parseSiwsMessage(bad)).toBeNull();
  });

  test('returns null when the address line is missing', () => {
    const bad = ['localhost wants you to sign in with your Stellar account:'].join('\n');
    expect(parseSiwsMessage(bad)).toBeNull();
  });

  test('still parses when optional fields like Statement are absent', () => {
    // The parser uses `?? ''` for missing labeled fields rather than
    // failing — that's the documented behavior.
    const minimal = [
      'localhost wants you to sign in with your Stellar account:',
      'GA2C5RFPE6GCKMY3US5PAB6UZLKIGSPIUKSLRB6Q3IY7ZP4PAOMM43YA',
      '',
      'URI: http://localhost:3000',
      'Version: 1',
      'Chain ID: testnet',
      'Nonce: abc',
      'Issued At: 2025-01-01T00:00:00.000Z',
      'Expiration Time: 2025-01-01T00:10:00.000Z',
    ].join('\n');
    const parsed = parseSiwsMessage(minimal);
    expect(parsed).not.toBeNull();
    expect(parsed!.statement).toBe('');
  });
});

describe('signInWithStellar — signedData threading', () => {
  // A fake connector that lets each test control exactly what signMessage
  // returns. This is the boundary the unified-signing fix lives at: the
  // connector is responsible for surfacing `signedData`, and signInWithStellar
  // is responsible for threading it into the SignInResult unchanged.
  function makeFakeConnector(opts: {
    address: string;
    signMessageResult: SignMessageResult;
    supportsSignMessage?: boolean;
  }): WalletConnector {
    return {
      id: 'fake',
      meta: {
        id: 'fake',
        name: 'Fake',
        icon: '',
        platforms: ['web'],
      },
      capabilities: {
        signTransaction: false,
        signAuthEntry: false,
        signMessage: opts.supportsSignMessage ?? true,
        submit: false,
      },
      getReachability: async () => 'available',
      connect: async () => ({ address: opts.address, walletId: 'fake' }),
      disconnect: async () => {},
      getAddress: async () => ({ address: opts.address }),
      getNetwork: async () => ({ network: 'TESTNET', networkPassphrase: 'Test SDF Network ; September 2015' }),
      signTransaction: async () => ({ signedTxXdr: '', signerAddress: opts.address }),
      signAuthEntry: async () => ({ signedAuthEntry: '', signerAddress: opts.address }),
      signMessage: async () => opts.signMessageResult,
    };
  }

  test('threads signedData from the connector into SignInResult', async () => {
    const address = 'GA2C5RFPE6GCKMY3US5PAB6UZLKIGSPIUKSLRB6Q3IY7ZP4PAOMM43YA';
    const connector = makeFakeConnector({
      address,
      signMessageResult: {
        signedMessage: 'base64sig',
        signerAddress: address,
        signedData: Buffer.from('the-bytes-the-wallet-signed', 'utf-8').toString('base64'),
      },
    });

    const result = await signInWithStellar({
      connector,
      network: 'TESTNET',
      appMetadata: { name: 'Test', domain: 'localhost', uri: 'http://localhost:3000' },
      statement: 'Sign in',
      nonce: 'abc123',
    });

    expect(result.signedData).toBe(
      Buffer.from('the-bytes-the-wallet-signed', 'utf-8').toString('base64')
    );
    expect(result.signedMessage).toBe('base64sig');
    expect(result.signerAddress).toBe(address);
    // The message must be parseable so the server can extract claims.
    expect(parseSiwsMessage(result.message)).not.toBeNull();
  });

  test('preserves undefined signedData when the connector omits it (backward compat)', async () => {
    // A third-party connector that hasn't been updated to populate signedData
    // should still work — signInWithStellar must not require it.
    const address = 'GA2C5RFPE6GCKMY3US5PAB6UZLKIGSPIUKSLRB6Q3IY7ZP4PAOMM43YA';
    const connector = makeFakeConnector({
      address,
      signMessageResult: {
        signedMessage: 'base64sig',
        signerAddress: address,
        // signedData intentionally omitted
      },
    });

    const result = await signInWithStellar({
      connector,
      network: 'TESTNET',
      appMetadata: { name: 'Test', domain: 'localhost', uri: 'http://localhost:3000' },
      statement: 'Sign in',
      nonce: 'abc123',
    });

    expect(result.signedData).toBeUndefined();
    expect(result.signedMessage).toBe('base64sig');
  });

  test('throws ConnectError when the connector does not support signMessage', async () => {
    const address = 'GA2C5RFPE6GCKMY3US5PAB6UZLKIGSPIUKSLRB6Q3IY7ZP4PAOMM43YA';
    const connector = makeFakeConnector({
      address,
      supportsSignMessage: false,
      signMessageResult: { signedMessage: '', signerAddress: address },
    });

    expect(
      signInWithStellar({
        connector,
        network: 'TESTNET',
        appMetadata: { name: 'Test', domain: 'localhost', uri: 'http://localhost:3000' },
        statement: 'Sign in',
        nonce: 'abc123',
      })
    ).rejects.toThrow(/does not support message signing/);
  });

  test('throws ConnectError when the wallet returns a different signer address', async () => {
    // This is a session-hijack defense: if the wallet signs with a different
    // key than the one we asked for, the sign-in must fail loudly rather
    // than silently authenticating the wrong account.
    const expectedAddress = 'GA2C5RFPE6GCKMY3US5PAB6UZLKIGSPIUKSLRB6Q3IY7ZP4PAOMM43YA';
    const wrongAddress = 'GBWMCCC3BAXPRF7Y6YX3YZ3F7XK6Y5R2ZJ5HJZ7X3HJZT4PQYH4Q5R2';
    const connector = makeFakeConnector({
      address: expectedAddress,
      signMessageResult: {
        signedMessage: 'base64sig',
        signerAddress: wrongAddress, // ← wallet lied
        signedData: 'base64data',
      },
    });

    expect(
      signInWithStellar({
        connector,
        network: 'TESTNET',
        appMetadata: { name: 'Test', domain: 'localhost', uri: 'http://localhost:3000' },
        statement: 'Sign in',
        nonce: 'abc123',
      })
    ).rejects.toThrow(/different address than expected/);
  });

  test('uses the default 10-minute expiration when expirationTime is omitted', async () => {
    const address = 'GA2C5RFPE6GCKMY3US5PAB6UZLKIGSPIUKSLRB6Q3IY7ZP4PAOMM43YA';
    const connector = makeFakeConnector({
      address,
      signMessageResult: { signedMessage: 'sig', signerAddress: address },
    });

    const before = Date.now();
    const result = await signInWithStellar({
      connector,
      network: 'TESTNET',
      appMetadata: { name: 'Test', domain: 'localhost', uri: 'http://localhost:3000' },
      statement: 'Sign in',
      nonce: 'abc123',
    });
    const after = Date.now();

    const issuedAtMs = new Date(result.issuedAt).getTime();
    const expirationMs = new Date(result.expirationTime).getTime();

    // issuedAt is "now" (within test jitter)
    expect(issuedAtMs).toBeGreaterThanOrEqual(before - 1000);
    expect(issuedAtMs).toBeLessThanOrEqual(after + 1000);
    // expiration is 10 minutes after issuedAt
    expect(expirationMs - issuedAtMs).toBe(10 * 60 * 1000);
  });

  test('respects a custom expirationTime', async () => {
    const address = 'GA2C5RFPE6GCKMY3US5PAB6UZLKIGSPIUKSLRB6Q3IY7ZP4PAOMM43YA';
    const connector = makeFakeConnector({
      address,
      signMessageResult: { signedMessage: 'sig', signerAddress: address },
    });

    const customExpiry = new Date('2030-01-01T00:00:00.000Z');
    const result = await signInWithStellar({
      connector,
      network: 'TESTNET',
      appMetadata: { name: 'Test', domain: 'localhost', uri: 'http://localhost:3000' },
      statement: 'Sign in',
      nonce: 'abc123',
      expirationTime: customExpiry,
    });

    expect(result.expirationTime).toBe(customExpiry.toISOString());
  });
});
