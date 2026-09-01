/**
 * Tests for the in-app web browser session — the WebView surface for plain
 * http(s) handoffs (the Chrome-Custom-Tab surface was removed: no message
 * channel back for wallet protocols, and its native module doesn't exist
 * in Expo Go).
 *
 * react-native can't run under bun (Flow syntax), so this suite installs
 * the shared react-native mock registry (tests/helpers/rn-mock.ts) and
 * stubs 'react-native-webview' the same way — the screen's component tree
 * is never rendered; the session's element-injection contract is driven
 * through the React element's props (a React element is a plain descriptor:
 * `element.props.onClose()` is exactly what a mounted screen would fire).
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { installReactNativeMock, resetRnState } from './helpers/rn-mock.js';
import { mock } from 'bun:test';

installReactNativeMock();

// The screen statically imports react-native-webview (apps must have it
// installed — it's a peer dep); under bun we stub it with the minimal
// surface the module's module-scope evaluation touches (the class is only
// referenced inside the component body).
mock.module('react-native-webview', () => ({
  WebView: class WebView {},
  default: class WebView {},
}));

const { createWebBrowser, isHttpUrl, WebBrowserScreen } = await import(
  '../src/browser/web-view-browser.js'
);
import type { WebBrowserDismiss } from '../src/browser/web-view-browser.js';

beforeEach(() => {
  resetRnState();
});

type Rendered = { element: React.ReactElement | null };

/** An element sink the way the demo uses setBrowserView. */
function makeRender(): Rendered & { render: (el: React.ReactElement | null) => void } {
  const state: Rendered = { element: null };
  return {
    get element() {
      return state.element;
    },
    render: (el: React.ReactElement | null) => {
      state.element = el;
    },
  };
}

// --- element accessors -------------------------------------------------------

function propsOf(el: React.ReactElement | null): Record<string, unknown> {
  expect(el).not.toBeNull();
  return (el as unknown as { props: Record<string, unknown> }).props;
}

// ---------------------------------------------------------------------------
// isHttpUrl — the navigation + session guard
// ---------------------------------------------------------------------------

describe('isHttpUrl', () => {
  test('admits http and https URLs', () => {
    expect(isHttpUrl('https://albedo.link/confirm')).toBe(true);
    expect(isHttpUrl('http://localhost:3000/')).toBe(true);
    expect(isHttpUrl('HTTPS://EXAMPLE.COM')).toBe(true); // case-insensitive scheme
  });

  test('refuses custom schemes, wc:, mailto:, and junk', () => {
    expect(isHttpUrl('freighterwallet://wc?uri=abc')).toBe(false);
    expect(isHttpUrl('wc:8a5e5b04-a29c-...')).toBe(false);
    expect(isHttpUrl('mailto:hi@example.com')).toBe(false);
    expect(isHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isHttpUrl('')).toBe(false);
    expect(isHttpUrl('not a url')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createWebBrowser — the element-injection session
// ---------------------------------------------------------------------------

describe('createWebBrowser', () => {
  test('open() renders a WebBrowserScreen element with the URL; onClose resolves "closed" and unmounts', async () => {
    const r = makeRender();
    const browser = createWebBrowser(r.render);

    const pending = browser.open('https://testnet.stellarchain.io/account/GABC');
    expect(r.element).not.toBeNull();
    expect(r.element?.type).toBe(WebBrowserScreen);
    expect(propsOf(r.element).url).toBe('https://testnet.stellarchain.io/account/GABC');

    // The user taps Close in the toolbar.
    (propsOf(r.element).onClose as () => void)();
    await expect(pending).resolves.toBe('closed');
    expect(r.element).toBeNull(); // unmounted
  });

  test('open() of a non-http(s) URL rejects instead of rendering a dead screen', async () => {
    const r = makeRender();
    const browser = createWebBrowser(r.render);

    await expect(browser.open('freighterwallet://wc?uri=abc')).rejects.toThrow(/http\(s\)/);
    expect(r.element).toBeNull(); // nothing was ever rendered
  });

  test('close() force-dismisses: unmounts + resolves the pending open', async () => {
    const r = makeRender();
    const browser = createWebBrowser(r.render);

    const pending = browser.open('https://stellar.expert');
    expect(r.element).not.toBeNull();

    browser.close();
    await expect(pending).resolves.toBe('closed');
    expect(r.element).toBeNull();
  });

  test('close() with nothing open is a silent no-op', () => {
    const r = makeRender();
    const browser = createWebBrowser(r.render);
    expect(() => browser.close()).not.toThrow();
    expect(r.element).toBeNull();
  });

  test('a second open() replaces the page — the first promise settles "closed"', async () => {
    const r = makeRender();
    const browser = createWebBrowser(r.render);

    const first = browser.open('https://a.example.com/1');
    const second = browser.open('https://b.example.com/2');

    await expect(first).resolves.toBe('closed');
    expect(propsOf(r.element).url).toBe('https://b.example.com/2');

    (propsOf(r.element).onClose as () => void)();
    await expect(second).resolves.toBe('closed');
  });

  test('after dismissal a fresh open() works again (session is reusable)', async () => {
    const r = makeRender();
    const browser = createWebBrowser(r.render);

    const first = browser.open('https://a.example.com');
    (propsOf(r.element).onClose as () => void)();
    await expect(first).resolves.toBe('closed');

    const second = browser.open('https://b.example.com');
    expect(propsOf(r.element).url).toBe('https://b.example.com');
    (propsOf(r.element).onClose as () => void)();
    await expect(second).resolves.toBe('closed');
  });

  test('dark option flows to the screen element (default true)', () => {
    const r = makeRender();
    const darkBrowser = createWebBrowser(r.render, { dark: false });
    darkBrowser.open('https://a.example.com');
    expect(propsOf(r.element).dark).toBe(false);
    (propsOf(r.element).onClose as () => void)();

    const defaultBrowser = createWebBrowser(r.render);
    defaultBrowser.open('https://a.example.com');
    expect(propsOf(r.element).dark).toBe(true);
    (propsOf(r.element).onClose as () => void)();
  });

  test('double onClose (toolbar + Modal back-handler race) settles exactly once', async () => {
    const r = makeRender();
    const browser = createWebBrowser(r.render);

    const pending: Promise<WebBrowserDismiss> = browser.open('https://a.example.com');
    const props = propsOf(r.element); // captured before the first close unmounts
    (props.onClose as () => void)();
    (props.onClose as () => void)(); // duplicate — must not double-settle

    await expect(pending).resolves.toBe('closed');
  });
});

// ---------------------------------------------------------------------------
// The promise result type is a closed union — no surface leaks from the
// removed Custom-Tab session (openAuth/isChromeTabsAvailable are gone).
// ---------------------------------------------------------------------------

describe('WebBrowserSession surface', () => {
  test('session exposes exactly open + close', () => {
    const r = makeRender();
    const browser = createWebBrowser(r.render);
    expect(Object.keys(browser).sort()).toEqual(['close', 'open']);
    expect(typeof browser.open).toBe('function');
    expect(typeof browser.close).toBe('function');
  });
});
