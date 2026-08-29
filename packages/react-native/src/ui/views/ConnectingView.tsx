/**
 * ConnectingView — shown while a wallet's connect() promise (or a sign
 * request) is in flight. Port of the web modal's `.connecting-view`:
 *
 *   [breathing wallet logo behind a spinning arc]
 *   Continue in {Wallet}
 *   Accept connection request in the wallet
 *
 * Deep-link extras (mobile-only):
 * - "Open in wallet app" re-fires the deep link while pairing waits
 * - when neither the wallet's scheme nor universal link could open, the
 *   card swaps in an "isn't installed" hint with a store Install button
 *   plus a "Copy pairing code" fallback for wallets with manual pairing
 *
 * Animation timings match web v1.9.50: 2.5s logo breathe, 2s spinner arc,
 * both reduced-motion aware (breathe off, spinner slowed to 2.5s).
 */

import React from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import { t } from '@saganta/stellar-appkit';
import { useBreathe, useSpinner } from '../animations.js';
import { WalletIcon } from '../WalletIcon.js';
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
  subtitle: string;
  openFailed: boolean;
  failedWalletName?: string;
  onInstallFailedWallet: () => void;
  onRetryOpen: () => void;
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
    openFailed,
    failedWalletName,
    onInstallFailedWallet,
    onShareUri,
    reopenWallet,
  } = props;
  const breathe = useBreathe(reducedMotion);
  const spinner = useSpinner(reducedMotion);
  const spin = spinner.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={styles.centered}>
      <View style={styles.animWrap}>
        <AnimatedBox scale={breathe}>
          <View style={styles.animLogoWrap}>
            <WalletIcon source={walletIcon} walletKey={walletKey} fallbackLabel={walletName} size={64} radius={22} />
          </View>
        </AnimatedBox>
        <AnimatedSpinner style={styles.animArc} rotate={spin} color={theme.colorAccent} />
      </View>
      <Text style={styles.title}>{t('connecting.continue_in_wallet', { walletName })}</Text>
      <Text style={styles.muted}>{subtitle}</Text>

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

/** Small helpers so the Animated primitives live in one place. */
function AnimatedBox({ scale, children }: { scale: Animated.Value; children: React.ReactNode }) {
  return <Animated.View style={{ transform: [{ scale }] }}>{children}</Animated.View>;
}

function AnimatedSpinner({ style, rotate, color }: { style: any; rotate: Animated.AnimatedInterpolation<string | number>; color: string }) {
  // A simple arc spinner: a bordered circle with one transparent quarter.
  return (
    <Animated.View
      style={[
        style,
        {
          transform: [{ rotate }],
          borderRadius: 999,
          borderWidth: 3,
          borderTopColor: 'transparent',
          borderLeftColor: 'transparent',
          borderRightColor: color,
          borderBottomColor: color,
        },
      ]}
    />
  );
}
