/**
 * SIWS flow helper tests — the pure pieces of useSiws.ts (the React hook
 * itself needs a React Native renderer; these helpers are the logic that
 * matters): error-message extraction (web extractErrorMessage parity) and
 * the existing-session validity check (address + network + expiry).
 *
 * react-native is mocked away (Vibration is not logic); the real client
 * comes from the workspace's @saganta/stellar-appkit.
 */

import { describe, expect, mock, test } from 'bun:test';

// Must stay surface-compatible with ui-styles.test.ts's mock — bun runs all
// test files in one process and the last mock.module() wins for later
// imports, so every react-native mock in this package provides the union.
mock.module('react-native', () => ({
  Vibration: { vibrate: () => {} },
  NativeModules: {
    SettingsManager: { settings: { AppleLocale: 'fr_FR' } },
    I18nManager: { localeIdentifier: 'zh_CN' },
  },
  StyleSheet: {
    create: (sheets: Record<string, unknown>) => sheets,
    hairlineWidth: 0.5,
  },
  Platform: {
    OS: 'ios',
    select: (opts: Record<string, unknown>) => opts.ios ?? opts.default ?? opts.android,
  },
  Animated: {
    Value: class {},
    loop: () => ({ start: () => {}, stop: () => {} }),
    timing: () => ({}),
    parallel: () => ({ start: () => {}, stop: () => {} }),
    sequence: () => ({}),
  },
  AccessibilityInfo: {
    isReduceMotionEnabled: async () => false,
    addEventListener: () => ({ remove: () => {} }),
  },
  Easing: {
    linear: (x: number) => x,
    inOut: (x: number) => x,
    quad: (x: number) => x,
    bezier: () => (x: number) => x,
  },
}));

const { extractSiwsErrorMessage, siwsSessionIsValid } = await import('../src/ui/useSiws.js');

describe('extractSiwsErrorMessage — web extractErrorMessage parity', () => {
  test('plain strings pass through', () => {
    expect(extractSiwsErrorMessage('Nonce fetch failed')).toBe('Nonce fetch failed');
  });

  test('Error objects use their message', () => {
    expect(extractSiwsErrorMessage(new Error('wallet declined'))).toBe('wallet declined');
  });

  test('wallet-style objects with reason surface it', () => {
    expect(extractSiwsErrorMessage({ reason: 'User rejected' })).toBe('User rejected');
    expect(extractSiwsErrorMessage({ message: 'm wins over reason', reason: 'r' })).toBe('m wins over reason');
  });

  test('anything else falls back to the generic SIWS error', () => {
    expect(extractSiwsErrorMessage(42)).toMatch(/sign-in failed/i);
    expect(extractSiwsErrorMessage(null)).toMatch(/sign-in failed/i);
  });
});

describe('siwsSessionIsValid — address + network + expiry', () => {
  const now = Date.now();
  const base = { address: 'GABC', network: 'TESTNET', expiry: now + 60_000 };

  test('matching address + network + future expiry is valid', () => {
    expect(siwsSessionIsValid(base, 'GABC', 'TESTNET')).toBe(true);
  });

  test('address mismatch invalidates', () => {
    expect(siwsSessionIsValid(base, 'GXYZ', 'TESTNET')).toBe(false);
  });

  test('network mismatch invalidates', () => {
    expect(siwsSessionIsValid(base, 'GABC', 'PUBLIC')).toBe(false);
  });

  test('expired sessions invalidate', () => {
    expect(siwsSessionIsValid({ ...base, expiry: now - 1 }, 'GABC', 'TESTNET')).toBe(false);
  });

  test('no expiry means never-expiring (web parity: !expiry || expiry > now)', () => {
    expect(siwsSessionIsValid({ address: 'GABC', network: 'TESTNET', expiry: 0 }, 'GABC', 'TESTNET')).toBe(true);
  });
});
