/**
 * ErrorView — connection failure / sign failure state. Port of the web
 * modal's error view: danger ring glyph, title, message, Try again.
 */

import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { t } from '@saganta/stellar-appkit';
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
    <View style={styles.centered}>
      <View style={[styles.errorBadge, { borderColor: theme.colorDanger }]}>
        <Text style={[styles.errorBadgeText, { color: theme.colorDanger }]}>!</Text>
      </View>
      <Text style={styles.title}>{t('error.title')}</Text>
      <Text style={styles.muted}>{message}</Text>
      <Pressable
        style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}
        onPress={onRetry}
        accessibilityRole="button"
      >
        <Text style={styles.primaryButtonText}>{t('action.try_again')}</Text>
      </Pressable>
    </View>
  );
}
