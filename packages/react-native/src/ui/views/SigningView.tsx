/**
 * SigningView — shown while the wallet processes a sign request.
 * Port of the web modal's `.signing-view`, metrics 1:1:
 *
 *   [breathing 56×56 logo + squircle dash-arc at 0.8s — faster than
 *    connecting's 2s, signaling "work in progress"]
 *   Continue in {Wallet}                     (17/600)
 *   Approve the request in your wallet to continue (14/1.5 muted)
 *   [Open in wallet app]                      ← mobile-only affordance
 *
 * Error variant (`signing-view--error`): the logo disappears, a 40px
 * danger circle-X glyph takes over, the title becomes "Signing rejected",
 * the subtitle carries the error, and a Cancel + Try again action row
 * appears (web `.signing-view__actions`).
 *
 * The "Open in wallet app" button is an RN-specific affordance (documented
 * deviation): browser wallets pop up over the page automatically, but a
 * WalletConnect mobile wallet sits in the background until the user
 * switches apps — the button fires the same deep link the connect flow
 * uses so the user lands directly in the wallet's sign prompt.
 */

import React from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import { t } from '@saganta/stellar-appkit';
import { useBreathe, useEntranceStagger } from '../animations.js';
import { SquircleArc } from '../SquircleArc.js';
import { CircleXIcon, RetryIcon } from '../icons.js';
import { WalletIcon } from '../WalletIcon.js';
import { SQUIRCLE_SPEC } from '../squircle-track.js';
import type { AppKitStyles } from '../styles.js';
import type { ConnectThemeRN } from '../theme.js';

export interface SigningViewProps {
  styles: AppKitStyles;
  theme: ConnectThemeRN;
  reducedMotion: boolean;
  walletName: string;
  walletIcon: string | null;
  walletKey: string | null;
  /** Error message — switches to the error variant. */
  error: string | null;
  onRetry: () => void;
  onCancel: () => void;
  /**
   * Set when a paired mobile wallet is waiting in the background — renders
   * the "Open in wallet app" deep-link handoff (browser-extension wallets
   * don't need it: their prompt pops up on its own).
   */
  onOpenWallet?: () => void;
}

export function SigningView(props: SigningViewProps) {
  const { styles, theme, reducedMotion, walletName, walletIcon, walletKey, error, onRetry, onCancel, onOpenWallet } = props;
  const hasError = error !== null;
  const breathe = useBreathe(reducedMotion);
  const entrance = useEntranceStagger(hasError || !onOpenWallet ? 3 : 4, reducedMotion);

  if (hasError) {
    return (
      <View style={styles.connectingView}>
        <Animated.View style={[styles.signingErrorIcon, { opacity: entrance[0]!.opacity }]}>
          <CircleXIcon color={theme.colorDanger} size={40} />
        </Animated.View>
        <Animated.View style={{ opacity: entrance[1]!.opacity, transform: [{ translateY: entrance[1]!.translateY }] }}>
          <Text style={styles.connectingTitle}>{t('signing.error_title')}</Text>
        </Animated.View>
        <Animated.View style={{ opacity: entrance[2]!.opacity, transform: [{ translateY: entrance[2]!.translateY }] }}>
          <Text style={[styles.connectingSubtitle, styles.connectingSubtitleError]}>{error}</Text>
          <View style={styles.signingActions}>
            <Pressable
              style={({ pressed }) => [styles.ghostPill, pressed && styles.ghostPillPressed]}
              onPress={onCancel}
              accessibilityRole="button"
            >
              <Text style={styles.ghostPillText}>{t('action.cancel')}</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.retryPill, pressed && styles.retryPillPressed]}
              onPress={onRetry}
              accessibilityRole="button"
              accessibilityLabel={t('action.try_again')}
            >
              <RetryIcon color={theme.colorText} size={14} />
              <Text style={styles.retryPillText}>{t('action.try_again')}</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    );
  }

  return (
    <View style={styles.connectingView}>
      <Animated.View
        style={[
          styles.logoWrap,
          { opacity: entrance[0]!.opacity, transform: [{ translateY: entrance[0]!.translateY }, { scale: breathe }] },
        ]}
      >
        <View style={{ position: 'absolute' }}>
          {/* Web .signing-view__arc: the same squircle dash at 0.8s linear
              (no reduced-motion override on web). */}
          <SquircleArc
            color={theme.colorAccent}
            size={SQUIRCLE_SPEC.box}
            strokeWidth={SQUIRCLE_SPEC.strokeWidth}
            durationMs={SQUIRCLE_SPEC.signingDurationMs}
          />
        </View>
        <View style={styles.connectingLogo}>
          <WalletIcon source={walletIcon} walletKey={walletKey} fallbackLabel={walletName} size={56} radius={22} />
        </View>
      </Animated.View>
      <Animated.View style={{ opacity: entrance[1]!.opacity, transform: [{ translateY: entrance[1]!.translateY }] }}>
        <Text style={styles.connectingTitle}>{t('signing.continue_in_wallet', { walletName })}</Text>
      </Animated.View>
      <Animated.View style={{ opacity: entrance[2]!.opacity, transform: [{ translateY: entrance[2]!.translateY }] }}>
        <Text style={styles.connectingSubtitle}>{t('signing.subtitle')}</Text>
      </Animated.View>
      {onOpenWallet && (
        <Animated.View
          style={{ opacity: entrance[3]!.opacity, transform: [{ translateY: entrance[3]!.translateY }] }}
        >
          <Pressable
            style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}
            onPress={onOpenWallet}
            accessibilityRole="button"
          >
            <Text style={styles.primaryButtonText}>{t('wc.open_in_wallet')}</Text>
          </Pressable>
        </Animated.View>
      )}
    </View>
  );
}
