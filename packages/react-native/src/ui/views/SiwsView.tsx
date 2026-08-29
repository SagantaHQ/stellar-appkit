/**
 * SiwsView — the Sign-In With Stellar flow UI. Port of the web modal's
 * renderSiwsLoading() + renderSiwsError(), metrics 1:1:
 *
 * Loading (checking / nonce / signing / verifying):
 *   [breathing wallet logo + the 2s squircle dash-arc]
 *   Sign-In With Stellar                     (17/600)
 *   Checking session… / Fetching secure nonce… /
 *   Approve the sign-in request in {Wallet} / Verifying your signature…
 *   Cancel                                   (ghost pill, 13/500 muted)
 *
 * Error:
 *   [wallet logo — no arc]
 *   Sign-in failed                           (17/600)
 *   {message}                                (danger)
 *   ↻ Try again  /  Connect wallet           (retry pill)
 *
 * Cancel stops the flow (and disconnects when disconnectOnFail — the
 * default — is set). "Try again" re-runs it; when the wallet got
 * disconnected meanwhile, the pill becomes "Connect wallet" and returns
 * to the wallet list.
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

export interface SiwsViewProps {
  styles: AppKitStyles;
  theme: ConnectThemeRN;
  reducedMotion: boolean;
  walletName: string;
  walletIcon: string | null;
  walletKey: string | null;
  /** 'siws-checking' | 'siws-nonce' | 'siws-signing' | 'siws-verifying' | 'siws-error'. */
  phase: 'siws-checking' | 'siws-nonce' | 'siws-signing' | 'siws-verifying' | 'siws-error';
  /** Error message for the siws-error phase. */
  error: string | null;
  /** Web renders "Connect wallet" instead of "Try again" when disconnected. */
  walletConnected: boolean;
  onCancel: () => void;
  onRetry: () => void;
}

export function SiwsView(props: SiwsViewProps) {
  const { styles, theme, reducedMotion, walletName, walletIcon, walletKey, phase, error, walletConnected, onCancel, onRetry } = props;
  const isError = phase === 'siws-error';
  const breathe = useBreathe(reducedMotion);
  const entrance = useEntranceStagger(4, reducedMotion);

  const subtitle =
    phase === 'siws-checking'
      ? t('siws.phase.checking_session')
      : phase === 'siws-nonce'
        ? t('siws.phase.fetching_nonce')
        : phase === 'siws-signing'
          ? t('siws.phase.approve_in_wallet', { walletName })
          : phase === 'siws-verifying'
            ? t('siws.phase.verifying')
            : (error ?? t('siws.error_default'));

  return (
    <View style={styles.connectingView}>
      <Animated.View
        style={[
          styles.logoWrap,
          isError && styles.logoWrapError,
          { opacity: entrance[0]!.opacity, transform: [{ translateY: entrance[0]!.translateY }, { scale: isError ? 1 : breathe }] },
        ]}
      >
        {!isError && (
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
        <Text style={styles.connectingTitle}>{isError ? t('siws.error_title') : t('siws.title')}</Text>
      </Animated.View>

      <Animated.View style={{ opacity: entrance[2]!.opacity, transform: [{ translateY: entrance[2]!.translateY }] }}>
        <Text style={[styles.connectingSubtitle, isError && styles.connectingSubtitleError]}>{subtitle}</Text>
      </Animated.View>

      <Animated.View style={{ opacity: entrance[3]!.opacity, transform: [{ translateY: entrance[3]!.translateY }] }}>
        {isError ? (
          <Pressable
            style={({ pressed }) => [styles.retryPill, pressed && styles.retryPillPressed]}
            onPress={onRetry}
            accessibilityRole="button"
            accessibilityLabel={walletConnected ? t('action.try_again') : t('siws.connect_wallet')}
          >
            <RetryIcon color={theme.colorText} size={14} />
            <Text style={styles.retryPillText}>{walletConnected ? t('action.try_again') : t('siws.connect_wallet')}</Text>
          </Pressable>
        ) : (
          <Pressable
            style={({ pressed }) => [styles.ghostPill, pressed && styles.ghostPillPressed]}
            onPress={onCancel}
            accessibilityRole="button"
          >
            <Text style={styles.ghostPillText}>{t('action.cancel')}</Text>
          </Pressable>
        )}
      </Animated.View>
    </View>
  );
}
