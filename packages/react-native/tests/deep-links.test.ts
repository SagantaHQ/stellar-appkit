import { test, expect, describe, beforeEach } from 'bun:test';
import {
  listMobileWallets,
  getMobileWallet,
  registerMobileWallet,
  buildWalletConnectDeepLink,
  buildWalletConnectUniversalLink,
  buildOpenWalletAppLink,
  findWalletByDeepLink,
  formatWalletConnectLink,
  formatWalletConnectUniversalLink,
  type MobileWalletDeepLink,
} from '../src/deep-links.js';

const WC_URI = 'wc:abc123@2?relay-protocol=irn&symKey=0xdeadbeef';
const ENC = encodeURIComponent(WC_URI);

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
    expect(link).toBe(`freighterwallet://wc?uri=${ENC}`);
    expect(link.startsWith('freighterwallet://wc?uri=wc%3A')).toBe(true);
  });

  test('ships LOBSTR, HOT Wallet and Scopuly — the Stellar wallets with WC-registered mobile apps', () => {
    // Wallet set verified against the WalletConnect Explorer registry
    // (explorer-api.walletconnect.com, chains=stellar:pubnet).
    const lobstr = getMobileWallet('lobstr-mobile');
    expect(lobstr).toBeDefined();
    expect(lobstr!.name).toBe('LOBSTR');
    expect(lobstr!.scheme).toBe('lobstr');
    expect(lobstr!.link).toBe('lobstr://');
    expect(lobstr!.universal).toBe('https://lobstr.co/uni/wc');
    expect(lobstr!.installUrl.ios).toContain('apps.apple.com');
    expect(lobstr!.installUrl.android).toContain('com.lobstr.client');

    const hot = getMobileWallet('hot-wallet-mobile');
    expect(hot).toBeDefined();
    expect(hot!.name).toBe('HOT Wallet');
    expect(hot!.scheme).toBe('hotwallet');
    expect(hot!.link).toBe('hotwallet://');
    expect(hot!.universal).toBe('https://app.hot-labs.org');

    const scopuly = getMobileWallet('scopuly-mobile');
    expect(scopuly).toBeDefined();
    expect(scopuly!.name).toBe('Scopuly');
    expect(scopuly!.scheme).toBe('scopuly');
    // Scopuly registers its native entry WITH the /wc path.
    expect(scopuly!.link).toBe('scopuly://wc');
    expect(scopuly!.universal).toBe('https://app.scopuly.com/wc');
  });

  test('builds scheme://wc?uri= links for LOBSTR and HOT Wallet', () => {
    expect(buildWalletConnectDeepLink('lobstr-mobile', WC_URI)).toBe(`lobstr://wc?uri=${ENC}`);
    expect(buildWalletConnectDeepLink('hot-wallet-mobile', WC_URI)).toBe(`hotwallet://wc?uri=${ENC}`);
  });

  test('builds the WC-modal-compatible link for path-bearing entries (Scopuly)', () => {
    // @walletconnect/modal-core's CoreUtil.formatNativeUrl appends `/wc?uri=`
    // after ensuring a trailing slash — `scopuly://wc` becomes
    // `scopuly://wc/wc?uri=`. Wallets read the `uri` query param, so the
    // path is theirs to ignore; matching the official modal's output is
    // the format Scopuly was tested against.
    expect(buildWalletConnectDeepLink('scopuly-mobile', WC_URI)).toBe(`scopuly://wc/wc?uri=${ENC}`);
  });

  test('formatWalletConnectLink mirrors CoreUtil.formatNativeUrl', () => {
    expect(formatWalletConnectLink('freighterwallet://', WC_URI)).toBe(`freighterwallet://wc?uri=${ENC}`);
    expect(formatWalletConnectLink('scopuly://wc', WC_URI)).toBe(`scopuly://wc/wc?uri=${ENC}`);
    // Bare scheme strings are normalized to scheme:// first.
    expect(formatWalletConnectLink('testwallet', WC_URI)).toBe(`testwallet://wc?uri=${ENC}`);
  });

  test('builds universal links for wallets that registered one, null otherwise', () => {
    expect(buildWalletConnectUniversalLink('lobstr-mobile', WC_URI)).toBe(`https://lobstr.co/uni/wc/wc?uri=${ENC}`);
    expect(buildWalletConnectUniversalLink('scopuly-mobile', WC_URI)).toBe(`https://app.scopuly.com/wc/wc?uri=${ENC}`);
    expect(buildWalletConnectUniversalLink('hot-wallet-mobile', WC_URI)).toBe(`https://app.hot-labs.org/wc?uri=${ENC}`);
    // Freighter registered no universal link.
    expect(buildWalletConnectUniversalLink('freighter-mobile', WC_URI)).toBeNull();
    expect(() => buildWalletConnectUniversalLink('nope', WC_URI)).toThrow(/Unknown mobile wallet/);
  });

  test('formatWalletConnectUniversalLink delegates non-http inputs to the native formatter', () => {
    expect(formatWalletConnectUniversalLink('lobstr://', WC_URI)).toBe(`lobstr://wc?uri=${ENC}`);
  });

  test('every built-in icon is a raster data URI — renders natively in RN <Image>', () => {
    // Regression guard for "icons not showing": every BUILT-IN wallet icon
    // must be a png/jpeg data URI (RN Image handles those natively) — never
    // an SVG data URI, which requires the WalletIcon SvgXml path. (Test-added
    // wallets like TEST_WALLET are deliberately skipped.)
    const builtinIds = ['freighter-mobile', 'lobstr-mobile', 'hot-wallet-mobile', 'scopuly-mobile'];
    for (const id of builtinIds) {
      const wallet = getMobileWallet(id);
      expect(wallet).toBeDefined();
      expect(wallet!.icon.startsWith('data:image/')).toBe(true);
      expect(wallet!.icon.startsWith('data:image/svg')).toBe(false);
    }
  });

  test('buildWalletConnectDeepLink throws for unknown wallets with a helpful message', () => {
    expect(() => buildWalletConnectDeepLink('nope', WC_URI)).toThrow(/Unknown mobile wallet "nope"/);
  });

  test('registerMobileWallet adds wallets with the default scheme://wc?uri= builder', () => {
    registerMobileWallet(TEST_WALLET);
    expect(buildWalletConnectDeepLink('test-mobile', WC_URI)).toBe(
      `testwallet://wc?uri=${ENC}`
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
    expect(buildOpenWalletAppLink('lobstr-mobile')).toBe('lobstr://');
    expect(buildOpenWalletAppLink('hot-wallet-mobile')).toBe('hotwallet://');
  });

  test('findWalletByDeepLink reverse-resolves every registered scheme', () => {
    expect(findWalletByDeepLink('freighterwallet://wc?uri=abc')?.id).toBe('freighter-mobile');
    expect(findWalletByDeepLink('lobstr://wc?uri=abc')?.id).toBe('lobstr-mobile');
    expect(findWalletByDeepLink('hotwallet://wc?uri=abc')?.id).toBe('hot-wallet-mobile');
    expect(findWalletByDeepLink('scopuly://wc?uri=abc')?.id).toBe('scopuly-mobile');
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
