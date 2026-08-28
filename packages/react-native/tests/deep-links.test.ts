import { test, expect, describe, beforeEach } from 'bun:test';
import {
  listMobileWallets,
  getMobileWallet,
  registerMobileWallet,
  buildWalletConnectDeepLink,
  buildOpenWalletAppLink,
  findWalletByDeepLink,
  type MobileWalletDeepLink,
} from '../src/deep-links.js';

const WC_URI = 'wc:abc123@2?relay-protocol=irn&symKey=0xdeadbeef';

describe('mobile wallet deep-link registry', () => {
  beforeEach(() => {
    // Tests add wallets — start each case from a known state by re-registering
    // the test wallet (registry replacement is idempotent).
    registerMobileWallet(TEST_WALLET);
  });

  test('ships Freighter Mobile with the documented scheme', () => {
    const freighter = getMobileWallet('freighter-mobile');
    expect(freighter).toBeDefined();
    expect(freighter!.name).toBe('Freighter');
    expect(freighter!.scheme).toBe('freighterwallet');
    expect(freighter!.installUrl.ios).toContain('apps.apple.com');
    expect(freighter!.installUrl.android).toContain('play.google.com');
  });

  test('builds the freighterwallet://wc?uri= deep link — the format stellar/freighter-mobile uses', () => {
    const link = buildWalletConnectDeepLink('freighter-mobile', WC_URI);
    // Format confirmed in freighter-mobile's mock-dapp:
    //   freighterdev://wc?uri=${encodeURIComponent(uri)}
    expect(link).toBe(`freighterwallet://wc?uri=${encodeURIComponent(WC_URI)}`);
    expect(link.startsWith('freighterwallet://wc?uri=wc%3A')).toBe(true);
  });

  test('buildWalletConnectDeepLink throws for unknown wallets with a helpful message', () => {
    expect(() => buildWalletConnectDeepLink('nope', WC_URI)).toThrow(/Unknown mobile wallet "nope"/);
  });

  test('registerMobileWallet adds wallets with the default scheme://wc?uri= builder', () => {
    registerMobileWallet(TEST_WALLET);
    expect(buildWalletConnectDeepLink('test-mobile', WC_URI)).toBe(
      `testwallet://wc?uri=${encodeURIComponent(WC_URI)}`
    );
    expect(listMobileWallets().some((w) => w.id === 'test-mobile')).toBe(true);
  });

  test('custom buildWalletConnectUri overrides take effect', () => {
    registerMobileWallet({
      ...TEST_WALLET,
      id: 'test-custom',
      buildWalletConnectUri: (uri) => `https://link.test/wc?uri=${encodeURIComponent(uri)}`,
    });
    expect(buildWalletConnectDeepLink('test-custom', WC_URI)).toContain('https://link.test/wc?uri=wc%3A');
  });

  test('buildOpenWalletAppLink returns the bare scheme for sign-request handoff', () => {
    expect(buildOpenWalletAppLink('freighter-mobile')).toBe('freighterwallet://');
  });

  test('findWalletByDeepLink reverse-resolves a scheme to its wallet', () => {
    expect(findWalletByDeepLink('freighterwallet://wc?uri=abc')?.id).toBe('freighter-mobile');
    expect(findWalletByDeepLink('unknown-scheme://x')).toBeUndefined();
  });
});

const TEST_WALLET: MobileWalletDeepLink = {
  id: 'test-mobile',
  name: 'Test Wallet',
  icon: 'data:image/svg+xml;base64,xyz',
  scheme: 'testwallet',
  installUrl: { ios: 'https://apps.apple.com/test', android: 'https://play.google.com/test' },
};
