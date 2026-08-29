/**
 * ErrorView — the generic failure state (web renderError): a 28×28 danger
 * alert-circle glyph, "Something went wrong", the error message, and a
 * `.btn`-style Try again that returns to the wallet list.
 *
 * Connection failures during a wallet connect do NOT land here — the web
 * modal keeps the connecting view and swaps in its error variant (see
 * ConnectingView). This view is for errors without a wallet context.
 *
 * NetworkMismatchView shares the exact layout with different copy.
 */

import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { t } from '@saganta/stellar-appkit';
import { AlertCircleIcon } from '../icons.js';
import type { AppKitStyles } from '../styles.js';
import type { ConnectThemeRN } from '../theme.js';

export interface ErrorViewProps {
  styles: AppKitStyles;
  theme: ConnectThemeRN;
  message: string;
  onRetry: () => void;
}

export function ErrorView(props: ErrorViewProps) {
  const { styles, theme, message, onRetry } = props;
  return (
    <View style={styles.errorState}>
      <AlertCircleIcon color={theme.colorDanger} size={28} />
      <Text style={styles.errorStateTitle}>{t('error.title')}</Text>
      <Text style={styles.errorStateMessage}>{message}</Text>
      <Pressable
        style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel={t('action.try_again')}
      >
        <Text style={styles.btnText}>{t('action.try_again')}</Text>
      </Pressable>
    </View>
  );
}

export interface NetworkMismatchViewProps {
  styles: AppKitStyles;
  theme: ConnectThemeRN;
  /** "Your wallet is on X" — from the NetworkMismatchError. */
  actualNetwork?: string;
  expectedNetwork?: string;
  onRetry: () => void;
}

/**
 * NetworkMismatchView — web renderNetworkMismatch(): same .error-state
 * layout with the wrong-network copy and a bold actual/expected pair.
 */
export function NetworkMismatchView(props: NetworkMismatchViewProps) {
  const { styles, theme, actualNetwork, expectedNetwork, onRetry } = props;
  const hasDetail = Boolean(actualNetwork && expectedNetwork);
  return (
    <View style={styles.errorState}>
      <AlertCircleIcon color={theme.colorDanger} size={28} />
      <Text style={styles.errorStateTitle}>{t('network_mismatch.title')}</Text>
      {hasDetail ? (
        <Text style={styles.errorStateMessage}>
          {t('network_mismatch.detail', { actualNetwork, expectedNetwork: expectedNetwork ?? '' })}
        </Text>
      ) : (
        <Text style={styles.errorStateMessage}>{t('network_mismatch.detail_fallback')}</Text>
      )}
      <Text style={styles.errorStateMessage}>{t('network_mismatch.action_hint')}</Text>
      <Pressable
        style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel={t('action.try_again')}
      >
        <Text style={styles.btnText}>{t('action.try_again')}</Text>
      </Pressable>
    </View>
  );
}
