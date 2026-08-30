/**
 * WebViewToolbar — the browser-chrome row for the in-app WebView screens
 * (Albedo confirm, xBull wallet).
 *
 * WHY: a bare `react-native-webview` is a page, not a browser. Out of the
 * box the screens had a single "Cancel" button — no way to see WHICH origin
 * is asking for your keys, copy the page URL, recover a half-loaded page, or
 * bail out to the real browser with its full feature set (find-in-page,
 * reader, password managers, …). This row adds the four affordances every
 * browser tab has, in the package's zero-native-dependency style:
 *
 *   [Cancel]  [ albedo.link/confirm  ⧉ ]   [↻] [↗]
 *
 * - **URL chip** — host + path of the current page (query and fragment are
 *   deliberately NOT shown: pairing URIs and session tokens ride in them,
 *   and the security-relevant part is the origin). Tap = copy the full URL
 *   (see ./clipboard.ts), with a 1.5s check-glyph confirmation like the
 *   account view's address copy.
 * - **Reload** — `webviewRef.reload()`; the screens reset their handshake
 *   state on the fresh load so the flow restarts cleanly.
 * - **Open in browser** — hands the URL to the OS browser via `Linking`
 *   (full browser features on demand). The WebView stays mounted underneath
 *   — the protocol flow continues in-app; this is an inspection/ease escape
 *   hatch, not a handoff.
 */

import React, { useCallback, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { t } from '@saganta/stellar-appkit';
import { CheckIcon, CopyIcon, ExternalLinkIcon, RetryIcon } from '../ui/icons.js';
import { copyText } from '../clipboard.js';

/**
 * Formats a URL for the toolbar chip: `host + path`, no query, no fragment,
 * truncated with a trailing ellipsis at `max` characters. The host leads so
 * the security-relevant part always stays visible. Non-URL inputs pass
 * through (truncated) — the chip never crashes on an odd `nav.url`.
 */
export function formatUrlChip(url: string, max = 26): string {
  const match = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]+)([^?#]*)/i.exec(url);
  const chip = match ? match[1] + (match[2] && match[2] !== '/' ? match[2] : '') : url;
  if (chip.length <= max) return chip;
  return `${chip.slice(0, Math.max(1, max - 1))}…`;
}

export interface WebViewToolbarProps {
  /** The current page URL — displayed, copied, and opened externally. */
  url: string;
  /** Left action — cancel/close the whole flow (screens map this to their fail path). */
  onCancel: () => void;
  /** Reload the WebView (screens also reset their handshake state on the fresh load). */
  onReload: () => void;
  /** Light/dark chrome; defaults to dark like the web modal. */
  dark?: boolean;
  /** Cancel label override — defaults to the localized `action.cancel`. */
  cancelLabel?: string;
}

export function WebViewToolbar({ url, onCancel, onReload, dark = true, cancelLabel }: WebViewToolbarProps) {
  const [copied, setCopied] = useState(false);

  const bg = dark ? '#09090B' : '#FFFFFF';
  const fg = dark ? '#FAFAFA' : '#18181B';
  const muted = dark ? '#A1A1AA' : '#71717A';
  const chipBg = dark ? '#18181B' : '#F4F4F5';

  const copyUrl = useCallback(async () => {
    // Optimistic check-glyph like the account view's address copy — the
    // share-sheet path takes seconds; the feedback shouldn't wait for it.
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    await copyText(url);
  }, [url]);

  const openExternally = useCallback(() => {
    Linking.openURL(url).catch(() => {
      // Scheme handlers can refuse (rare on http(s)); nothing to recover.
    });
  }, [url]);

  return (
    <View style={[styles.row, { backgroundColor: bg }]}>
      <Pressable onPress={onCancel} hitSlop={12} accessibilityRole="button" accessibilityLabel={cancelLabel ?? t('action.cancel')}>
        <Text style={{ color: fg, fontSize: 15, fontWeight: '600' }}>{cancelLabel ?? t('action.cancel')}</Text>
      </Pressable>

      <Pressable
        style={[styles.chip, { backgroundColor: chipBg }]}
        onPress={copyUrl}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={t('browser.copy_link')}
      >
        <Text style={[styles.chipText, { color: copied ? muted : fg }]} numberOfLines={1} ellipsizeMode="middle">
          {copied ? t('wc.copied') : formatUrlChip(url)}
        </Text>
        {copied ? (
          <CheckIcon color={muted} size={12} />
        ) : (
          <CopyIcon color={muted} size={12} />
        )}
      </Pressable>

      <Pressable
        onPress={onReload}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={t('browser.reload')}
        style={styles.iconButton}
      >
        <RetryIcon color={fg} size={16} />
      </Pressable>

      <Pressable
        onPress={openExternally}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={t('browser.open_in_browser')}
        style={styles.iconButton}
      >
        <ExternalLinkIcon color={fg} size={16} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  chip: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    minWidth: 0,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500',
    flexShrink: 1,
  },
  iconButton: {
    paddingVertical: 6,
    paddingHorizontal: 2,
  },
});
