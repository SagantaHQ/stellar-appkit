/**
 * Test helpers shared across the SIWS test suite.
 *
 * NOTE: This file is a duplicate of packages/core/tests/helpers.ts. We
 * duplicate it here (rather than importing across package boundaries)
 * so each package's tests are self-contained — siws-verify tests can
 * run without core's source being resolvable from this package's test
 * runner. If you change the SIWS message format in core/src/siws.ts,
 * update BOTH copies and the round-trip test in core/tests/siws.test.ts
 * will catch any drift.
 *
 * `buildSiwsMessage` is duplicated from packages/core/src/siws.ts because the
 * library doesn't export it (and we don't want to change the public API just
 * for tests). If the two ever drift, the round-trip test in siws.test.ts
 * will catch it — it parses the message built here with the library's own
 * `parseSiwsMessage` and asserts every field round-trips.
 */

export function buildSiwsMessage(opts: {
  domain: string;
  address: string;
  statement: string;
  uri: string;
  network: string;
  nonce: string;
  issuedAt: Date;
  expirationTime: Date;
}): string {
  const chainId = opts.network === 'PUBLIC' ? 'pubnet' : opts.network.toLowerCase();
  return [
    `${opts.domain} wants you to sign in with your Stellar account:`,
    opts.address,
    '',
    `Statement: ${opts.statement}`,
    `URI: ${opts.uri}`,
    'Version: 1',
    `Chain ID: ${chainId}`,
    `Nonce: ${opts.nonce}`,
    `Issued At: ${opts.issuedAt.toISOString()}`,
    `Expiration Time: ${opts.expirationTime.toISOString()}`,
  ].join('\n');
}

/** Standard SIWS fixture used by most tests — overrides only what each test needs. */
export function makeSiwsFixture(overrides: Partial<{
  domain: string;
  address: string;
  statement: string;
  uri: string;
  network: string;
  nonce: string;
  issuedAt: Date;
  expirationTime: Date;
}> = {}) {
  // Use "now" by default so the fixture is always in the future and
  // expiration checks pass. Tests that need a specific historical or
  // expired timestamp override issuedAt/expirationTime explicitly.
  const issuedAt = overrides.issuedAt ?? new Date(Date.now() - 60_000); // 1 min ago
  const expirationTime = overrides.expirationTime ?? new Date(Date.now() + 9 * 60_000); // 9 min from now
  return {
    domain: overrides.domain ?? 'localhost',
    address: overrides.address ?? 'GA2C5RFPE6GCKMY3US5PAB6UZLKIGSPIUKSLRB6Q3IY7ZP4PAOMM43YA',
    statement: overrides.statement ?? 'Sign in to test app',
    uri: overrides.uri ?? 'http://localhost:3000',
    network: overrides.network ?? 'TESTNET',
    nonce: overrides.nonce ?? 'test-nonce-12345',
    issuedAt,
    expirationTime,
  };
}
