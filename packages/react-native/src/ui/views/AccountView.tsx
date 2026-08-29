/**
 * AccountView — the connected state. Port of the web modal's connected view
 * (avatar + address + disconnect), plus the native share affordance for the
 * address (RN has no clipboard-guaranteed navigator.clipboard, so Share is
 * the idiomatic surface).
 *
 * Branding comes from the client's session peer — a WalletConnect pair shows
 * the actual wallet's name/icon (Freighter, LOBSTR, …), never the generic
 * "WalletConnect" label.
 */

import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { t } from '@saganta/stellar-appkit';
import { WalletIcon } from '../WalletIcon.js';
import type { AppKitStyles } from '../styles.js';
import type { ConnectThemeRN } from '../theme.js';

export interface AccountViewProps {
  styles: AppKitStyles;
  theme: ConnectThemeRN;
  address: string;
  walletName: string;
  walletIcon: string | null;
  pendingSigns: number;
  onShare: () => void;
  onDisconnect: () => void;
}

export function AccountView(props: AccountViewProps) {
  const { styles, theme, address, walletName, walletIcon, pendingSigns, onShare, onDisconnect } = props;
  const shortened = `${address.slice(0, 8)}…${address.slice(-8)}`;
  return (
    <View>
      <View style={styles.accountCard}>
        <WalletIcon source={walletIcon} fallbackLabel={walletName} size={48} radius={theme.radiusMd} />
        <View style={styles.walletMeta}>
          <Text style={styles.walletName}>{walletName}</Text>
          <Text style={styles.addressText}>{shortened}</Text>
          {pendingSigns > 0 && <Text style={styles.danger}>{t('connected.pending_signatures', { count: pendingSigns })}</Text>}
        </View>
      </View>
      <Pressable
        style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}
        onPress={onShare}
        accessibilityRole="button"
      >
        <Text style={styles.secondaryButtonText}>{t('aria.click_to_copy')}</Text>
      </Pressable>
      <Pressable
        style={({ pressed }) => [styles.dangerButton, pressed && styles.dangerButtonPressed]}
        onPress={onDisconnect}
        accessibilityRole="button"
      >
        <Text style={styles.dangerButtonText}>{t('action.disconnect')}</Text>
      </Pressable>
    </View>
  );
}
