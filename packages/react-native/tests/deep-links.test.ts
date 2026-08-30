import { test, expect, describe, beforeEach } from 'bun:test';
import {
  listMobileWallets,
  listFeaturedMobileWallets,
  listAdditionalMobileWallets,
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
    // Freighter's WC-Explorer-registered native link — NOT the bare scheme.
    // freighter-mobile's deep-link handler drops any URL that doesn't
    // contain its Reown-registered redirect (freighterwallet://wc-redirect),
    // so a `freighterwallet://wc?uri=` link opens the app and then does
    // NOTHING (no pairing prompt — the exact bug this pins against).
    expect(freighter!.link).toBe('freighterwallet://wc-redirect');
    expect(freighter!.installUrl.ios).toContain('apps.apple.com');
    expect(freighter!.installUrl.android).toContain('play.google.com');
  });

  test('builds the freighterwallet://wc-redirect/wc?uri= deep link — passes freighter-mobile\'s redirect gate', () => {
    const link = buildWalletConnectDeepLink('freighter-mobile', WC_URI);
    // Byte-identical to what WalletConnect's own modal builds from Freighter's
    // Explorer registration (CoreUtil.formatNativeUrl appends /wc?uri=):
    //   freighterwallet://wc-redirect/wc?uri=${encodeURIComponent(uri)}
    // freighter-mobile's useWalletKitEventsManager.onDeepLink only processes
    // URLs containing WALLET_KIT_MT_REDIRECT_NATIVE (= the registered
    // `freighterwallet://wc-redirect`) and then reads the `uri` query param.
    expect(link).toBe(`freighterwallet://wc-redirect/wc?uri=${ENC}`);
    // The registered redirect prefix MUST be embedded — regression guard for
    // the "wallet opens but never prompts" silent drop.
    expect(link.includes('freighterwallet://wc-redirect')).toBe(true);
    expect(link.startsWith('freighterwallet://wc-redirect/wc?uri=wc%3A')).toBe(true);
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
    expect(formatWalletConnectLink('freighterwallet://wc-redirect', WC_URI)).toBe(`freighterwallet://wc-redirect/wc?uri=${ENC}`);
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
    // an SVG data URI, which RN's Image cannot rasterize. Covers the full
    // built-in registry (featured + additional), not just the original four.
    for (const wallet of listMobileWallets()) {
      if (wallet.id === 'test-mobile' || wallet.id === 'test-custom') continue;
      expect(wallet.icon.startsWith('data:image/')).toBe(true);
      expect(wallet.icon.startsWith('data:image/svg')).toBe(false);
    }
  });

  test('every built-in icon base64 actually decodes to a PNG/JPEG payload', () => {
    // Regression guard for the corrupt-Freighter-icon bug: a base64 literal
    // whose length isn't a multiple of 4 (or whose bytes aren't a real image)
    // silently renders NOTHING in RN <Image> — the "icons are not showing"
    // failure mode. Every built-in icon must decode to a valid raster header.
    for (const wallet of listMobileWallets()) {
      if (wallet.id === 'test-mobile' || wallet.id === 'test-custom') continue;
      const comma = wallet.icon.indexOf(',');
      const meta = wallet.icon.slice(0, comma);
      const b64 = wallet.icon.slice(comma + 1);
      expect(b64.length % 4).toBe(0);
      const bytes = Buffer.from(b64, 'base64');
      expect(bytes.length).toBeGreaterThan(100);
      const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
      const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
      expect(isPng || isJpeg).toBe(true);
      if (isPng) {
        // the IEND chunk must be present — truncated PNGs also render nothing
        expect(bytes.includes(Buffer.from('IEND'))).toBe(true);
      }
      // meta must agree with the payload
      expect(meta).toMatch(/^data:image\/(png|jpe?g);base64$/);
    }
  });

  test('ships the full WalletConnect-registered Stellar mobile wallet set', () => {
    // Verified against the WalletConnect Explorer registry
    // (explorer-api.walletconnect.com, chains=stellar:pubnet): every
    // consumer wallet with a registered native mobile link ships built-in.
    const byId = new Map(listMobileWallets().map((w) => [w.id, w]));
    const expected = [
      'freighter-mobile', 'lobstr-mobile', 'hot-wallet-mobile', 'scopuly-mobile',
      'safepal-mobile', 'blockchain-mobile', 'arculus-mobile', 'atomic-mobile',
      'coca-mobile', 'trustee-mobile', 'maxwallet-mobile', 'zypto-mobile',
      'hero-mobile', 'ukey-mobile', 'ecoin-mobile', 'swiftex-mobile',
      'panaroma-mobile', 'kotai-mobile', 'cryptokara-mobile', 'ukiss-mobile',
      'soc-mobile',
    ];
    for (const id of expected) {
      expect(byId.has(id), `missing wallet ${id}`).toBe(true);
    }
    // plus any wallets the tests themselves registered
    expect(listMobileWallets().length).toBeGreaterThanOrEqual(expected.length);
  });

  test('splits the registry into featured and additional sections', () => {
    const featured = listFeaturedMobileWallets();
    const additional = listAdditionalMobileWallets();
    // Featured: exactly the four Stellar-first wallets.
    expect(featured.map((w) => w.id)).toEqual([
      'freighter-mobile', 'lobstr-mobile', 'hot-wallet-mobile', 'scopuly-mobile',
    ]);
    // Additional: everything else (multichain wallets registered for Stellar).
    expect(additional.length).toBeGreaterThanOrEqual(17);
    expect(additional.every((w) => !w.featured)).toBe(true);
    // The two sections partition the full registry.
    expect(featured.length + additional.length).toBe(listMobileWallets().length);
  });

  test('builds scheme://wc?uri= deep links for the additional wallets', () => {
    expect(buildWalletConnectDeepLink('safepal-mobile', WC_URI)).toBe(`safepalwallet://wc?uri=${ENC}`);
    expect(buildWalletConnectDeepLink('blockchain-mobile', WC_URI)).toBe(`blockchain-wallet://wc?uri=${ENC}`);
    // Hero registers its native link WITH the /wc path (like Scopuly).
    expect(buildWalletConnectDeepLink('hero-mobile', WC_URI)).toBe(`herowallet://wc/wc?uri=${ENC}`);
  });

  test('every wallet has a store link for at least one platform', () => {
    // The "not installed" card needs somewhere to send the user — every
    // built-in wallet must have an iOS or Android store URL.
    for (const wallet of listMobileWallets()) {
      if (wallet.id === 'test-mobile' || wallet.id === 'test-custom') continue;
      expect(
        wallet.installUrl.ios.length > 0 || wallet.installUrl.android.length > 0,
        `${wallet.id} has no store link`
      ).toBe(true);
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
    expect(findWalletByDeepLink('freighterwallet://wc-redirect/wc?uri=abc')?.id).toBe('freighter-mobile');
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
