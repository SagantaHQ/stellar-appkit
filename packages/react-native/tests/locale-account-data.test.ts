/**
 * Tests for the RN package's i18n device-locale bridge and the account-view
 * data layer (the fetch-based Horizon port of the web modal's
 * refreshAccountData).
 *
 * react-native can't run under bun (Flow syntax), so the suite installs the
 * shared mock registry (tests/helpers/rn-mock.ts) — its NativeModules carry
 * the AppleLocale/I18nManager values locale.ts reads for the raw device
 * locale.
 */

import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { installReactNativeMock, resetRnState } from './helpers/rn-mock.js';

installReactNativeMock();

// iOS defaults (this suite's platform — detectDeviceLocale reads the iOS
// AppleLocale path); resetRnState also clears whatever an earlier test
// file left in the shared registry.
beforeEach(() => resetRnState());

const { normalizeToDeviceLocale, detectDeviceLocale } = await import('../src/locale.js');
const {
  avatarColorsFromAddress,
  explorerUrl,
  horizonUrl,
  truncateAddress,
  fetchAccountData,
  fundViaFriendbot,
} = await import('../src/ui/accountData.js');

// ---------------------------------------------------------------------------
// Device locale → supported LocaleCode
// ---------------------------------------------------------------------------

describe('normalizeToDeviceLocale', () => {
  test('maps raw device locales onto the supported set', () => {
    expect(normalizeToDeviceLocale('fr_FR')).toBe('fr');
    expect(normalizeToDeviceLocale('zh_CN')).toBe('zh-CN');
    expect(normalizeToDeviceLocale('zh-TW')).toBe('zh-TW');
    expect(normalizeToDeviceLocale('pt-BR')).toBe('pt-BR');
    expect(normalizeToDeviceLocale('en_US')).toBe('en');
    expect(normalizeToDeviceLocale('de-DE')).toBe('de');
    expect(normalizeToDeviceLocale('ja_JP')).toBe('ja');
  });

  test('region variants fold onto the bare language translation', () => {
    // The device says fr_CA — the shipped translation is plain 'fr.
    expect(normalizeToDeviceLocale('fr_CA')).toBe('fr');
    expect(normalizeToDeviceLocale('es-MX')).toBe('es');
  });

  test('unsupported and malformed locales return null (keep current)', () => {
    expect(normalizeToDeviceLocale('gsw_LI')).toBeNull();
    expect(normalizeToDeviceLocale('')).toBeNull();
    expect(normalizeToDeviceLocale(null)).toBeNull();
    expect(normalizeToDeviceLocale(undefined)).toBeNull();
  });

  test('private-use suffixes are stripped before matching', () => {
    expect(normalizeToDeviceLocale('zh-Hans-CN-x-hk')).toBe('zh-CN');
  });
});

describe('detectDeviceLocale', () => {
  test('reads the platform native module (iOS AppleLocale in this mock)', () => {
    // The mock exposes AppleLocale 'fr_FR' for ios.
    expect(detectDeviceLocale()).toBe('fr');
  });
});

// ---------------------------------------------------------------------------
// Account view data — the fetch-based Horizon port
// ---------------------------------------------------------------------------

describe('horizonUrl / explorerUrl / truncateAddress', () => {
  test('PUBLIC hits mainnet, everything else testnet (web parity)', () => {
    expect(horizonUrl('PUBLIC')).toBe('https://horizon.stellar.org');
    expect(horizonUrl('TESTNET')).toBe('https://horizon-testnet.stellar.org');
    expect(explorerUrl('tx/ABC', 'TESTNET')).toBe('https://testnet.stellarchain.io/tx/ABC');
    expect(explorerUrl('account/GX', 'PUBLIC')).toBe('https://stellarchain.io/account/GX');
  });

  test('truncateAddress matches the web 5+ellipsis+5 shape', () => {
    expect(truncateAddress('GABCDEF1234GHIJK')).toBe('GABCD…GHIJK');
    expect(truncateAddress('SHORT')).toBe('SHORT');
  });
});

describe('avatarColorsFromAddress', () => {
  test('same address → same color (the identity property of the web gradient)', () => {
    const a = avatarColorsFromAddress('GA5XIGA5C7ZNTQB3LZBMGC5GJXUZLYLHW6QAIX2HWQRKFL5OD2V2Q');
    const b = avatarColorsFromAddress('GA5XIGA5C7ZNTQB3LZBMGC5GJXUZLYLHW6QAIX2HWQRKFL5OD2V2Q');
    expect(a.backgroundColor).toBe(b.backgroundColor);
    expect(a.backgroundColor).toMatch(/^hsl\(\d+, 65%, 50%\)$/);
  });

  test('different addresses usually produce different colors', () => {
    const a = avatarColorsFromAddress('GA5XIGA5C7ZNTQB3LZBMGC5GJXUZLYLHW6QAIX2HWQRKFL5OD2V2Q');
    const b = avatarColorsFromAddress('GCXIZ6YP271YYAV5ALP6RQ2ZJNXQPI6TTXYJSACXYJJGBYCUQB6SZQ');
    expect(a.backgroundColor).not.toBe(b.backgroundColor);
  });
});

describe('fetchAccountData', () => {
  const originalFetch = globalThis.fetch;

  function mockFetch(routes: Record<string, unknown>) {
    // Longest prefix first — 'accounts/GADDR' must not shadow the longer
    // 'accounts/GADDR/transactions' route.
    const ordered = Object.entries(routes).sort((a, b) => b[0].length - a[0].length);
    globalThis.fetch = (async (url: string) => {
      for (const [prefix, body] of ordered) {
        if (url.startsWith(prefix)) {
          return { ok: true, status: 200, json: async () => body } as Response;
        }
      }
      return { ok: false, status: 404, statusText: 'Not Found' } as Response;
    }) as typeof fetch;
  }

  test('parses native balance + tx history with per-tx operation lookups', async () => {
    mockFetch({
      'https://horizon-testnet.stellar.org/accounts/GADDR': {
        sequence: '123',
        balances: [
          { asset_type: 'native', balance: '9876.5432100' },
          { asset_type: 'credit_alphanum4', balance: '1.0000000' },
        ],
      },
      'https://horizon-testnet.stellar.org/accounts/GADDR/transactions': {
        records: [
          { id: '1', hash: 'TX1', created_at: '2025-08-30T12:00:00Z', successful: true },
          { id: '2', hash: 'TX2', created_at: '2025-08-29T12:00:00Z', successful: false },
        ],
      },
      'https://horizon-testnet.stellar.org/transactions/TX1/operations': {
        records: [{ type: 'payment', amount: '1.5', asset_type: 'native' }],
      },
      'https://horizon-testnet.stellar.org/transactions/TX2/operations': {
        records: [{ type: 'account_merge' }],
      },
    });

    const data = await fetchAccountData('GADDR', 'TESTNET');
    expect(data.balance).toBe('9876.54');
    expect(data.history).toHaveLength(2);
    expect(data.history[0]).toMatchObject({ hash: 'TX1', type: 'payment', amount: '1.50', success: true });
    expect(data.history[0]!.asset).toBe('XLM'); // t('tx.default_asset') under 'en'
    expect(data.history[0]!.date).toBe('Aug 30');
    expect(data.history[1]).toMatchObject({ hash: 'TX2', type: 'account_merge', success: false });
  });

  test('non-native payment assets surface the asset code (web parity)', async () => {
    mockFetch({
      'https://horizon-testnet.stellar.org/accounts/GADDR': {
        balances: [{ asset_type: 'native', balance: '10' }],
      },
      'https://horizon-testnet.stellar.org/accounts/GADDR/transactions': {
        records: [{ id: '1', hash: 'TXA', created_at: '2025-01-05T00:00:00Z', successful: true }],
      },
      'https://horizon-testnet.stellar.org/transactions/TXA/operations': {
        records: [{ type: 'payment', amount: '2', asset_type: 'credit_alphanum4', asset_code: 'USDC' }],
      },
    });
    const data = await fetchAccountData('GADDR', 'TESTNET');
    expect(data.history[0]!.asset).toBe('USDC');
    expect(data.history[0]!.amount).toBe('2.00');
  });

  test('degrades to skeleton/empty on Horizon failures (web parity)', async () => {
    globalThis.fetch = (async () => ({ ok: false, status: 500, statusText: 'err' })) as typeof fetch;
    const data = await fetchAccountData('GADDR', 'TESTNET');
    expect(data.balance).toBeNull();
    expect(data.history).toEqual([]);
  });

  test('a fresh account (404 balance) still loads with null balance, not an error', async () => {
    mockFetch({
      'https://horizon-testnet.stellar.org/accounts/GADDR/transactions': { records: [] },
    });
    const data = await fetchAccountData('GADDR', 'TESTNET');
    expect(data.balance).toBeNull();
    expect(data.history).toEqual([]);
  });

  test('fundViaFriendbot reports success/failure without throwing', async () => {
    globalThis.fetch = (async () => ({ ok: true })) as typeof fetch;
    expect(await fundViaFriendbot('GADDR')).toBe(true);
    globalThis.fetch = (async () => ({ ok: false })) as typeof fetch;
    expect(await fundViaFriendbot('GADDR')).toBe(false);
    globalThis.fetch = (async () => {
      throw new Error('network down');
    }) as typeof fetch;
    expect(await fundViaFriendbot('GADDR')).toBe(false);
  });

  test('restores the real fetch', () => {
    globalThis.fetch = originalFetch;
  });
});
