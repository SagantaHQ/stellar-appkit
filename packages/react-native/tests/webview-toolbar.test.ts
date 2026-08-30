/**
 * Tests for the WebView browser toolbar helpers — the copy/paste and
 * browser affordances added to the Albedo/xBull WebView screens.
 *
 * react-native can't run under bun (Flow syntax), so this suite installs
 * the shared react-native mock registry (tests/helpers/rn-mock.ts); the
 * Clipboard/Share spies are configured through `rnState`.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { installReactNativeMock, resetRnState, rnState } from './helpers/rn-mock.js';

installReactNativeMock();

const { copyText } = await import('../src/clipboard.js');
const { formatUrlChip } = await import('../src/browser/WebViewToolbar.js');

beforeEach(() => {
  resetRnState();
});

// ---------------------------------------------------------------------------
// formatUrlChip — what the toolbar's URL chip shows
// ---------------------------------------------------------------------------

describe('formatUrlChip — the toolbar URL chip', () => {
  test('shows host + path, dropping query and fragment', () => {
    // The WC pairing symKey rides in the query — it must never hit the chip.
    expect(formatUrlChip('https://albedo.link/confirm?intent=x&sig=secret')).toBe('albedo.link/confirm');
    expect(formatUrlChip('https://wallet.xbull.app/connect?public=abc&session=xyz#frag')).toBe('wallet.xbull.app/connect');
  });

  test('bare origin collapses to the host alone', () => {
    expect(formatUrlChip('https://albedo.link/')).toBe('albedo.link');
    expect(formatUrlChip('https://albedo.link')).toBe('albedo.link');
  });

  test('keeps nested paths verbatim (and truncates only past the cap)', () => {
    expect(formatUrlChip('https://albedo.link/x/y')).toBe('albedo.link/x/y');
    expect(formatUrlChip('https://wallet.xbull.app/connect/no-wallet')).toBe('wallet.xbull.app/connect/…');
  });

  test('truncates long chips with a trailing ellipsis, host first', () => {
    const chip = formatUrlChip('https://wallet.xbull.app/connect/some/very/long/path', 26);
    expect(chip.length).toBe(26);
    expect(chip.endsWith('…')).toBe(true);
    expect(chip.startsWith('wallet.xbull.app')).toBe(true);
  });

  test('passes non-URL input through (truncated) instead of crashing', () => {
    expect(formatUrlChip('about:blank')).toBe('about:blank');
    expect(formatUrlChip('not a url at all')).toBe('not a url at all');
    expect(formatUrlChip('x'.repeat(40))).toBe(`${'x'.repeat(25)}…`);
  });
});

// ---------------------------------------------------------------------------
// copyText — the RN copy surface
// ---------------------------------------------------------------------------

describe('copyText — core Clipboard first, share sheet fallback', () => {
  test('uses the core clipboard when present (one tap, no share sheet)', async () => {
    const outcome = await copyText('https://albedo.link/confirm');
    expect(outcome).toBe('clipboard');
    expect(rnState.clipboardText).toBe('https://albedo.link/confirm');
    expect(rnState.shareText).toBeNull();
  });

  test('falls back to the share sheet when the core clipboard is gone (future RN)', async () => {
    rnState.hasClipboard = false;
    const outcome = await copyText('GA2C5RFPE6GCKMY3US5PAB6UZLKIGSPIUKSLRB6Q3IY7ZP4PAOMM43YA');
    expect(outcome).toBe('share');
    expect(rnState.clipboardText).toBeNull();
    expect(rnState.shareText).toBe('GA2C5RFPE6GCKMY3US5PAB6UZLKIGSPIUKSLRB6Q3IY7ZP4PAOMM43YA');
  });

  test('falls back to the share sheet when the core clipboard throws', async () => {
    rnState.clipboardThrows = true;
    const outcome = await copyText('wc:9c4b0d13@2?relay-protocol=irn');
    expect(outcome).toBe('share');
    expect(rnState.shareText).toBe('wc:9c4b0d13@2?relay-protocol=irn');
  });

  test('never rejects — a dismissed share sheet resolves as "failed"', async () => {
    rnState.hasClipboard = false;
    rnState.shareThrows = true;
    await expect(copyText('anything')).resolves.toBe('failed');
  });
});
