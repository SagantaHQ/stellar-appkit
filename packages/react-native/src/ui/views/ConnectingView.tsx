/**
 * ConnectingView — shown while a wallet's connect() promise is in flight.
 * Port of the web modal's `.connecting-view`, metrics 1:1:
 *
 *   [breathing 56×56 squircle logo inside an 88×88 wrap]
 *   [the squircle dash-arc spinner — NOT a circle, like the web]
 *   Continue in {Wallet}                     (17/600, -0.015em)
 *   Accept connection request in the wallet  (14/1.5 muted, ≤280 wide)
 *   ↻ Try again                              (999-radius pill — error only)
 *
 * Error variant (`connecting-view--error`): the spinner arc disappears,
 * the logo stops breathing, the subtitle turns danger-colored with the
 * failure message, and a "Try again" pill re-fires the same wallet. The
 * header (rendered by AppKitModal) shows the back arrow + wallet name,
 * exactly like the web's `.header--connecting`.
 *
 * Deep-link extras (mobile-only, stacked under the web-parity core):
 * - "Open in wallet app" re-fires the deep link while pairing waits
 * - when neither the wallet's scheme nor universal link could open, the
 *   card swaps in an "isn't installed" hint with a store Install button
 *   plus a "Copy pairing code" fallback for wallets with manual pairing
 *
 * Animation timings match web v1.9.50: 2.5s logo breathe, 2s spinner arc
 * (2.5s under reduced motion; breathe and the staggered entrance are
 * disabled there, web: `animation: none`).
 */

import React from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import { t } from '@saganta/stellar-appkit';
import { useBreathe, useEntranceStagger } from '../animations.js';
import { SquircleArc } from '../SquircleArc.js';
import { RetryIcon } from '../icons.js';
import { WalletIcon } from '../WalletIcon.js';
import { SQUIRCLE_SPEC } from '../squircle-track.js';
import type { AppKitStyles } from '../styles.js';
import type { ConnectThemeRN } from '../theme.js';

export interface ConnectingViewProps {
  styles: AppKitStyles;
  theme: ConnectThemeRN;
  reducedMotion: boolean;
  walletName: string;
  walletIcon: string | null;
  /** Registry/connector key for PNG icon resolution. */
  walletKey: string | null;
  /** Web: connecting.accept_request, or the error subtitle on failure. */
  subtitle: string;
  /** True once connect() rejected — switches to the error variant. */
  error: boolean;
  openFailed: boolean;
  failedWalletName?: string;
  onInstallFailedWallet: () => void;
  onRetryOpen: () => void;
  /** Re-runs connect() for the same wallet (web: retry-connecting). */
  onRetryConnect: () => void;
  /** Shares the pairing URI — set when a mobile wallet was picked and the URI is ready. */
  onShareUri?: () => void;
  reopenWallet?: () => void;
}

export function ConnectingView(props: ConnectingViewProps) {
  const {
    styles,
    theme,
    reducedMotion,
    walletName,
    walletIcon,
    walletKey,
    subtitle,
    error,
    openFailed,
    failedWalletName,
    onInstallFailedWallet,
    onRetryConnect,
    onShareUri,
    reopenWallet,
  } = props;
  const breathe = useBreathe(reducedMotion);
  // The stagger covers the web children: logo-wrap, title, subtitle, retry.
  // The deep-link extras ride the last slot like web's nth-child(n+5).
  const entrance = useEntranceStagger(4, reducedMotion);

  return (
    <View style={styles.connectingView}>
      <Animated.View
        style={[
          styles.logoWrap,
          error && styles.logoWrapError,
          {
            opacity: entrance[0]!.opacity,
            transform: [{ translateY: entrance[0]!.translateY }, { scale: error ? 1 : breathe }],
          },
        ]}
      >
        {!error && (
          <View style={{ position: 'absolute' }}>
            <SquircleArc
              color={theme.colorAccent}
              size={SQUIRCLE_SPEC.box}
              strokeWidth={SQUIRCLE_SPEC.strokeWidth}
              durationMs={reducedMotion ? SQUIRCLE_SPEC.connectingReducedMotionDurationMs : SQUIRCLE_SPEC.connectingDurationMs}
            />
          </View>
        )}
        <View style={styles.connectingLogo}>
          <WalletIcon source={walletIcon} walletKey={walletKey} fallbackLabel={walletName} size={56} radius={22} />
        </View>
      </Animated.View>

      <Animated.View style={{ opacity: entrance[1]!.opacity, transform: [{ translateY: entrance[1]!.translateY }] }}>
        <Text style={styles.connectingTitle}>{t('connecting.continue_in_wallet', { walletName })}</Text>
      </Animated.View>

      <Animated.View style={{ opacity: entrance[2]!.opacity, transform: [{ translateY: entrance[2]!.translateY }] }}>
        <Text style={[styles.connectingSubtitle, error && styles.connectingSubtitleError]}>{subtitle}</Text>
      </Animated.View>

      {error && (
        <Animated.View style={{ opacity: entrance[3]!.opacity, transform: [{ translateY: entrance[3]!.translateY }] }}>
          <Pressable
            style={({ pressed }) => [styles.retryPill, pressed && styles.retryPillPressed]}
            onPress={onRetryConnect}
            accessibilityRole="button"
            accessibilityLabel={t('action.try_again')}
          >
            <RetryIcon color={theme.colorText} size={14} />
            <Text style={styles.retryPillText}>{t('action.try_again')}</Text>
          </Pressable>
        </Animated.View>
      )}

      {/* ---- Deep-link extras (RN-only affordances, web has no QR here) ---- */}
      {openFailed && (
        <View style={styles.openFailedCard}>
          <Text style={styles.openFailedText}>
            {t('wc.open_failed', { walletName: failedWalletName ?? walletName })}
          </Text>
          <Pressable
            style={({ pressed }) => [styles.installButton, pressed && styles.installButtonPressed]}
            onPress={onInstallFailedWallet}
            accessibilityRole="button"
          >
            <Text style={styles.installText}>{t('wallet_list.install')}</Text>
          </Pressable>
          {onShareUri && (
            <Pressable style={styles.textButton} onPress={onShareUri} accessibilityRole="button">
              <Text style={styles.textButtonText}>{t('wc.copy_pairing_code')}</Text>
            </Pressable>
          )}
        </View>
      )}

      {!openFailed && reopenWallet && (
        <Pressable
          style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}
          onPress={reopenWallet}
          accessibilityRole="button"
        >
          <Text style={styles.primaryButtonText}>{t('wc.open_in_wallet')}</Text>
        </Pressable>
      )}
      {!openFailed && onShareUri && (
        <Pressable style={styles.textButton} onPress={onShareUri} accessibilityRole="button">
          <Text style={styles.textButtonText}>{t('wc.copy_pairing_code')}</Text>
        </Pressable>
      )}
    </View>
  );
}
