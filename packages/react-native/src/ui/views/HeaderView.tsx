/**
 * HeaderView — the panel header, a 1:1 port of the web modal's
 * `renderPanelHeader()`. Three variants:
 *
 * 1. **Back variant** (`.header--connecting`) — back chevron + the wallet
 *    name centered + close. Shown while connecting (error or not), on
 *    SIWS errors, and on signing errors: back cancels the in-flight
 *    state and returns to the wallet list.
 * 2. **Connected variant** — the active wallet's icon (22×22, radius 6)
 *    + its name (the wallet brand replaces the app title, like web).
 * 3. **Default variant** (`.header`) — optional app logo + title, both
 *    left-aligned like the web brand row.
 *
 * Inline mode hides the close button (web: `showClose = effectiveMode !== 'inline'`).
 */

import React from 'react';
import { Image, Pressable, Text, View, type ImageSourcePropType } from 'react-native';
import { t } from '@saganta/stellar-appkit';
import { ChevronLeftIcon, CloseIcon } from '../icons.js';
import { WalletIcon } from '../WalletIcon.js';
import type { AppKitStyles } from '../styles.js';
import type { ConnectThemeRN } from '../theme.js';

export interface HeaderViewProps {
  styles: AppKitStyles;
  theme: ConnectThemeRN;
  /** Inline mode never shows the close button (web parity). */
  showClose: boolean;
  onClose: () => void;
  /** When set, renders the back variant: back cancels and returns to the list. */
  onBack?: () => void;
  backWalletName?: string | null;
  /** Connected variant: wallet brand replaces the app title. */
  connectedWalletName?: string | null;
  connectedWalletIcon?: string | null;
  connectedWalletKey?: string | null;
  /** Default variant: title + optional logo. */
  title: string;
  logo?: ImageSourcePropType;
}

export function HeaderView(props: HeaderViewProps) {
  const {
    styles,
    theme,
    showClose,
    onClose,
    onBack,
    backWalletName,
    connectedWalletName,
    connectedWalletIcon,
    connectedWalletKey,
    title,
    logo,
  } = props;

  const closeButton = showClose ? (
    <Pressable
      style={({ pressed }) => [styles.headerButton, pressed && styles.headerButtonPressed]}
      onPress={onClose}
      accessibilityRole="button"
      accessibilityLabel={t('aria.close_dialog')}
      hitSlop={8}
    >
      <CloseIcon color={theme.colorTextMuted} size={16} />
    </Pressable>
  ) : null;

  // Variant 1 — back arrow + centered wallet name + close
  // (web .header--connecting).
  if (backWalletName) {
    return (
      <View style={[styles.header, styles.headerConnecting]}>
        <Pressable
          style={({ pressed }) => [styles.headerButton, pressed && styles.headerButtonPressed]}
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel={t('aria.back')}
          hitSlop={8}
        >
          <ChevronLeftIcon color={theme.colorTextMuted} size={16} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {backWalletName}
        </Text>
        {closeButton ?? <View style={{ width: 28 }} />}
      </View>
    );
  }

  // Variant 2 — connected: wallet icon + wallet name (web swaps the app
  // brand for the wallet brand once a session exists).
  if (connectedWalletName) {
    return (
      <View style={styles.header}>
        <View style={styles.headerBrand}>
          <View style={styles.headerLogo}>
            <WalletIcon
              source={connectedWalletIcon ?? null}
              walletKey={connectedWalletKey ?? null}
              fallbackLabel={connectedWalletName}
              size={22}
              radius={6}
            />
          </View>
          <Text style={[styles.headerTitle, styles.headerTitleLeft]} numberOfLines={1}>
            {connectedWalletName}
          </Text>
        </View>
        {closeButton ?? <View style={{ width: 28 }} />}
      </View>
    );
  }

  // Variant 3 — default: optional app logo + title (left-aligned brand).
  return (
    <View style={styles.header}>
      <View style={styles.headerBrand}>
        {logo ? <Image source={logo} style={styles.headerLogo} /> : null}
        <Text style={[styles.headerTitle, styles.headerTitleLeft]} numberOfLines={1}>
          {title}
        </Text>
      </View>
      {closeButton ?? <View style={{ width: 28 }} />}
    </View>
  );
}
