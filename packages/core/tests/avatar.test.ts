import { test, expect, describe } from 'bun:test';
import { gradientFromAddress, stellarExpertAvatarUrl, fetchWalletAvatar } from '../src/ui-web/avatar.js';

/**
 * Tests for the avatar utilities.
 *
 * - gradientFromAddress: deterministic gradient from an address — same
 *   address always produces the same gradient, different addresses
 *   produce different gradients.
 * - stellarExpertAvatarUrl: builds the correct API URL for an address.
 * - fetchWalletAvatar: returns null when getAvatar is not implemented,
 *   returns the URL when it is, returns null on error.
 */

const ADDRESS_A = 'GA2C5RFPE6GCKMY3US5PAB6UZLKIGSPIUKSLRB6Q3IY7ZP4PAOMM43YA';
const ADDRESS_B = 'GBWMCCC3BAXPRF7Y6YX3YZ3F7XK6Y5R2ZJ5HJZ7X3HJZT4PQYH4Q5R2';

describe('gradientFromAddress', () => {
  test('returns a CSS linear-gradient string', () => {
    const gradient = gradientFromAddress(ADDRESS_A);
    expect(gradient).toMatch(/^linear-gradient\(135deg,/);
    expect(gradient).toMatch(/hsl\(/);
  });

  test('is deterministic — same address produces the same gradient', () => {
    const g1 = gradientFromAddress(ADDRESS_A);
    const g2 = gradientFromAddress(ADDRESS_A);
    expect(g1).toBe(g2);
  });

  test('different addresses produce different gradients', () => {
    const g1 = gradientFromAddress(ADDRESS_A);
    const g2 = gradientFromAddress(ADDRESS_B);
    expect(g1).not.toBe(g2);
  });
});

describe('stellarExpertAvatarUrl', () => {
  test('builds the correct API URL for an address', () => {
    const url = stellarExpertAvatarUrl(ADDRESS_A);
    expect(url).toBe(`https://api.stellar.expert/explorer/public/account/${ADDRESS_A}/avatar`);
  });
});

describe('fetchWalletAvatar', () => {
  test('returns null when getAvatar is not implemented', async () => {
    const connector = {}; // no getAvatar method
    const result = await fetchWalletAvatar(connector);
    expect(result).toBeNull();
  });

  test('returns the URL when getAvatar returns one', async () => {
    const connector = {
      getAvatar: async () => ({ url: 'https://example.com/avatar.png' }),
    };
    const result = await fetchWalletAvatar(connector);
    expect(result).toBe('https://example.com/avatar.png');
  });

  test('returns null when getAvatar returns null', async () => {
    const connector = {
      getAvatar: async () => null,
    };
    const result = await fetchWalletAvatar(connector);
    expect(result).toBeNull();
  });

  test('returns null when getAvatar throws', async () => {
    const connector = {
      getAvatar: async () => { throw new Error('Network error'); },
    };
    const result = await fetchWalletAvatar(connector);
    expect(result).toBeNull();
  });
});
