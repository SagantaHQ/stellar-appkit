import { test, expect, describe } from 'bun:test';
import {
  classifyIconSource,
  fallbackBackgroundColor,
  resolveWalletIcon,
} from '../src/ui/icon-utils.js';
import {
  WALLET_PNG_ICONS,
  normalizeWalletName,
  resolveWalletIconByKey,
  resolveWalletIconByName,
} from '../src/ui/wallet-icons.js';

const SVG_DATA_URI = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=';

describe('classifyIconSource — every icon format the SDK ships', () => {
  test('PNG/JPEG/GIF/WebP data URIs render through RN Image', () => {
    expect(classifyIconSource('data:image/png;base64,iVBORw0KGgo=')).toBe('raster-data');
    expect(classifyIconSource('data:image/jpeg;base64,/9j/4AAQ=')).toBe('raster-data');
    expect(classifyIconSource('data:image/gif;base64,R0lGODlh=')).toBe('raster-data');
    expect(classifyIconSource('data:image/webp;base64,UklGR=')).toBe('raster-data');
  });

  test('SVG sources (data URIs and URLs) classify as svg — resolved via the PNG registry instead', () => {
    expect(classifyIconSource(SVG_DATA_URI)).toBe('svg');
    expect(classifyIconSource('data:image/svg+xml;utf8,<svg></svg>')).toBe('svg');
    expect(classifyIconSource('https://example.com/icon.svg')).toBe('svg');
    expect(classifyIconSource('https://example.com/icon.svg?v=2')).toBe('svg');
    expect(classifyIconSource('http://example.com/icon.svg#x')).toBe('svg');
  });

  test('non-SVG remote URLs are raster (RN Image loads them)', () => {
    expect(classifyIconSource('https://imagedelivery.net/w/64')).toBe('raster-url');
    expect(classifyIconSource('https://example.com/icon.png')).toBe('raster-url');
  });

  test('garbage and empty sources fall through to the letter avatar', () => {
    expect(classifyIconSource('')).toBe('none');
    expect(classifyIconSource('javascript:alert(1)')).toBe('none');
    expect(classifyIconSource('data:text/plain;base64,aGk=')).toBe('none');
  });
});

describe('WALLET_PNG_ICONS — bundled compressed PNG registry', () => {
  test('covers every core connector whose icon is an SVG', () => {
    for (const key of ['albedo', 'hot-wallet', 'klever', 'ledger', 'rabet', 'trezor', 'walletconnect']) {
      expect(WALLET_PNG_ICONS[key]).toBeTruthy();
    }
  });

  test('every entry is a valid PNG data URI (small enough for bundling)', () => {
    for (const [key, uri] of Object.entries(WALLET_PNG_ICONS)) {
      expect(uri.startsWith(`data:image/png;base64,`)).toBe(true);
      // ~7 KB total budget; a single icon must never balloon past 4 KB.
      expect(uri.length).toBeLessThan(4 * 1024 + 64);
    }
  });
});

describe('resolveWalletIconByKey', () => {
  test('core connector ids resolve to bundled PNGs', () => {
    expect(resolveWalletIconByKey('albedo')).toBe(WALLET_PNG_ICONS['albedo']);
    expect(resolveWalletIconByKey('walletconnect')).toBe(WALLET_PNG_ICONS['walletconnect']);
  });

  test('mobile wallet ids resolve to the registry icons', () => {
    expect(resolveWalletIconByKey('freighter-mobile')?.startsWith('data:image/png;base64,')).toBe(true);
    expect(resolveWalletIconByKey('lobstr-mobile')?.startsWith('data:image/png;base64,')).toBe(true);
  });

  test('unknown / null keys return null', () => {
    expect(resolveWalletIconByKey('does-not-exist')).toBeNull();
    expect(resolveWalletIconByKey(null)).toBeNull();
    expect(resolveWalletIconByKey(undefined)).toBeNull();
    expect(resolveWalletIconByKey('')).toBeNull();
  });
});

describe('resolveWalletIconByName — WC peer metadata matching', () => {
  test('normalization: case, whitespace, and multi-space insensitive', () => {
    expect(normalizeWalletName('  HOT   Wallet ')).toBe('hot wallet');
    expect(normalizeWalletName('Freighter')).toBe('freighter');
  });

  test('peer names resolve to the right logo', () => {
    expect(resolveWalletIconByName('Freighter')).toBe(resolveWalletIconByKey('freighter-mobile'));
    expect(resolveWalletIconByName('freighter wallet')).toBe(resolveWalletIconByKey('freighter-mobile'));
    expect(resolveWalletIconByName('LOBSTR')).toBe(resolveWalletIconByKey('lobstr-mobile'));
    expect(resolveWalletIconByName('HOT Wallet')).toBe(resolveWalletIconByKey('hot-wallet-mobile'));
    expect(resolveWalletIconByName('Scopuly')).toBe(resolveWalletIconByKey('scopuly-mobile'));
    expect(resolveWalletIconByName('WalletConnect')).toBe(WALLET_PNG_ICONS['walletconnect']);
    expect(resolveWalletIconByName('Albedo')).toBe(WALLET_PNG_ICONS['albedo']);
    expect(resolveWalletIconByName('Ledger')).toBe(WALLET_PNG_ICONS['ledger']);
  });

  test('unknown wallets (Hana, unregistered names, …) return null → letter avatar', () => {
    expect(resolveWalletIconByName('Hana')).toBeNull();
    expect(resolveWalletIconByName('Some Unregistered Wallet')).toBeNull();
    expect(resolveWalletIconByName(null)).toBeNull();
  });

  test('additional registry wallets resolve by peer name and variant aliases', () => {
    expect(resolveWalletIconByName('SafePal')).toBe(resolveWalletIconByKey('safepal-mobile'));
    expect(resolveWalletIconByName('SafePal Wallet')).toBe(resolveWalletIconByKey('safepal-mobile'));
    expect(resolveWalletIconByName('Blockchain.com')).toBe(resolveWalletIconByKey('blockchain-mobile'));
    expect(resolveWalletIconByName('Arculus Wallet')).toBe(resolveWalletIconByKey('arculus-mobile'));
    expect(resolveWalletIconByName('Atomic Wallet')).toBe(resolveWalletIconByKey('atomic-mobile'));
    expect(resolveWalletIconByName('COCA Wallet')).toBe(resolveWalletIconByKey('coca-mobile'));
    expect(resolveWalletIconByName('Trustee Wallet')).toBe(resolveWalletIconByKey('trustee-mobile'));
    expect(resolveWalletIconByName('Hero Wallet')).toBe(resolveWalletIconByKey('hero-mobile'));
    expect(resolveWalletIconByName('UKey Wallet')).toBe(resolveWalletIconByKey('ukey-mobile'));
    expect(resolveWalletIconByName('SwiftEx Wallet')).toBe(resolveWalletIconByKey('swiftex-mobile'));
    expect(resolveWalletIconByName('Kotai Wallet')).toBe(resolveWalletIconByKey('kotai-mobile'));
    expect(resolveWalletIconByName('UKISS Hub')).toBe(resolveWalletIconByKey('ukiss-mobile'));
    expect(resolveWalletIconByName('SOC Wallet')).toBe(resolveWalletIconByKey('soc-mobile'));
  });
});

describe('resolveWalletIcon — resolution order', () => {
  test('walletKey wins even when the source is an unrenderable SVG', () => {
    expect(resolveWalletIcon({ source: SVG_DATA_URI, walletKey: 'rabet', name: 'Rabet' }))
      .toBe(WALLET_PNG_ICONS['rabet']);
  });

  test('raster sources render as-is when no key is given', () => {
    const png = 'data:image/png;base64,iVBORw0KGgo=';
    expect(resolveWalletIcon({ source: png })).toBe(png);
    const url = 'https://example.com/logo.png';
    expect(resolveWalletIcon({ source: url, name: 'SafePal' })).toBe(url);
  });

  test('SVG sources with no key fall back to name matching', () => {
    expect(resolveWalletIcon({ source: 'https://relay.walletconnect.org/x.svg', name: 'Freighter' }))
      .toBe(resolveWalletIconByKey('freighter-mobile'));
  });

  test('SVG sources with no key and unknown name → null (letter avatar)', () => {
    expect(resolveWalletIcon({ source: SVG_DATA_URI, name: 'Some Unregistered Wallet' })).toBeNull();
    expect(resolveWalletIcon({})).toBeNull();
  });

  test('mobile wallet keys resolve even over an SVG source (list rows)', () => {
    expect(resolveWalletIcon({ source: SVG_DATA_URI, walletKey: 'freighter-mobile', name: 'Freighter' }))
      .toBe(resolveWalletIconByKey('freighter-mobile'));
  });
});

describe('fallbackBackgroundColor — stable per wallet name', () => {
  test('same name → same color', () => {
    expect(fallbackBackgroundColor('Freighter')).toBe(fallbackBackgroundColor('Freighter'));
  });

  test('produces an hsl() color string', () => {
    expect(fallbackBackgroundColor('LOBSTR')).toMatch(/^hsl\(\d+, 45%, 38%\)$/);
  });
});
