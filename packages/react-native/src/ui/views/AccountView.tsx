/**
 * AccountView — the connected state, a 1:1 port of the web modal's
 * `renderConnected()` (ui-web connect-modal.ts):
 *
 *   [gradient avatar] GABC…XYZW ⧉        ⋯     ← header row (tap = copy)
 *                     ● testnet  ↗              ← network pill + explorer
 *   ┌ overflow menu: Switch Wallet / Disconnect ┐ (under ⋯)
 *   [◌ pending signatures banner — only while signing]
 *   XLM BALANCE
 *   123.45 XLM                ← 32/700 mono, skeleton while loading
 *   [Get Testnet funds]       ← TESTNET only (friendbot)
 *   Funding requested — …     ← 3s banner after the tap
 *   RECENT ACTIVITY
 *   ✓ payment    Aug 30    -1.00 XLM ↗
 *   ✗ …
 *
 * Deviations (mobile-native, documented in ARCHITECTURE.md):
 * - The avatar is a solid deterministic color instead of a CSS linear
 *   gradient (RN has no zero-dep gradient) — same address-hash hue logic.
 * - Copy uses the OS share sheet (RN has no universal clipboard API in core)
 *   with the same check-glyph feedback; explorer links open via Linking.
 * - The overflow menu is a modal-safe inline card (no absolute positioning
 *   inside the scrollable sheet).
 */

import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, Text, View } from 'react-native';
import { t } from '@saganta/stellar-appkit';
import { CopyIcon, CheckIcon, ExternalLinkIcon, MoreDotsIcon, WalletGlyphIcon, LogOutIcon } from '../icons.js';
import { avatarColorsFromAddress, truncateAddress, type TxHistoryItem } from '../accountData.js';
import type { AppKitStyles } from '../styles.js';
import type { ConnectThemeRN } from '../theme.js';

export interface AccountViewProps {
  styles: AppKitStyles;
  theme: ConnectThemeRN;
  address: string;
  /** Session network — 'TESTNET' shows the friendbot button (web parity). */
  network: string;
  pendingSigns: number;
  /** Balance + history from useAccountData. */
  balance: string | null;
  history: TxHistoryItem[];
  /** True while the initial balance fetch runs (skeleton state). */
  balanceLoading: boolean;
  /** True for ~3s after the friendbot tap (funds-requested banner). */
  fundsRequested: boolean;
  /** True for ~1.5s after the address copy tap (check glyph, web parity). */
  copied: boolean;
  onCopyAddress: () => void;
  onOpenExplorer: () => void;
  onGetFunds: () => void;
  onSwitchWallet: () => void;
  onDisconnect: () => void;
  onTxPress: (tx: TxHistoryItem) => void;
}

/** Web `.balance-skeleton` shimmer — RN pulses the placeholder's opacity. */
function SkeletonBar({ styles }: { styles: AppKitStyles }) {
  const opacity = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 750, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 750, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return <Animated.View style={[styles.balanceSkeleton, { opacity }]} />;
}

export function AccountView(props: AccountViewProps) {
  const {
    styles,
    theme,
    address,
    network,
    pendingSigns,
    balance,
    history,
    balanceLoading,
    fundsRequested,
    copied,
    onCopyAddress,
    onOpenExplorer,
    onGetFunds,
    onSwitchWallet,
    onDisconnect,
    onTxPress,
  } = props;

  const [overflowOpen, setOverflowOpen] = useState(false);

  // Web network pill: amber on every non-PUBLIC network, green on PUBLIC.
  const isTestnet = network !== 'PUBLIC';
  const networkColor = isTestnet ? '#f59e0b' : '#6EE7B7';
  const avatar = avatarColorsFromAddress(address);

  // Root = web .account (gap 20, padding-top 6): the vertical rhythm that
  // keeps header / pending banner / balance / history evenly 20px apart —
  // previously missing, which crushed the blocks together (the header sat
  // ~2px above the balance label). See styles.ts `account`.
  return (
    <View style={styles.account}>
      {/* Account header: avatar + address (tap to copy) + network pill + overflow */}
      <View style={styles.accountHeader}>
        <View style={[styles.accountAvatar, { backgroundColor: avatar.backgroundColor }]} />
        <View style={styles.accountInfo}>
          <Pressable
            style={({ pressed }) => [styles.accountAddressRow, pressed && { opacity: 0.7 }]}
            onPress={onCopyAddress}
            accessibilityRole="button"
            accessibilityLabel={t('aria.click_to_copy')}
          >
            <Text style={styles.accountAddress}>{truncateAddress(address)}</Text>
            <View style={styles.accountCopyIcon}>
              {copied ? <CheckIcon color={theme.colorAccent} size={14} /> : <CopyIcon color={theme.colorTextMuted} size={14} />}
            </View>
          </Pressable>
          <View style={styles.accountMeta}>
            <View style={styles.networkPill}>
              <View style={[styles.networkDot, { backgroundColor: networkColor }]} />
              <Text style={styles.networkPillText}>{network.toLowerCase()}</Text>
            </View>
            <Pressable
              style={({ pressed }) => [styles.explorerButton, pressed && { opacity: 1 }]}
              onPress={onOpenExplorer}
              accessibilityRole="link"
              accessibilityLabel={t('aria.view_on_explorer')}
              hitSlop={6}
            >
              <ExternalLinkIcon color={theme.colorTextMuted} size={14} />
            </Pressable>
          </View>
        </View>
        <Pressable
          style={({ pressed }) => [
            { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
            pressed && { opacity: 0.6 },
          ]}
          onPress={() => setOverflowOpen((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={t('aria.more_options')}
          accessibilityState={{ expanded: overflowOpen }}
          hitSlop={6}
        >
          <MoreDotsIcon color={theme.colorTextMuted} size={16} />
        </Pressable>
      </View>

      {/* Overflow menu (web data-overflow): Switch Wallet + Disconnect */}
      {overflowOpen && (
        <View style={styles.overflowMenu}>
          <Pressable
            style={({ pressed }) => [styles.overflowItem, pressed && styles.overflowItemPressed]}
            onPress={() => {
              setOverflowOpen(false);
              onSwitchWallet();
            }}
            accessibilityRole="button"
          >
            <WalletGlyphIcon color={theme.colorTextMuted} size={18} />
            <Text style={styles.overflowItemText}>{t('action.switch_wallet')}</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.overflowItem, pressed && styles.overflowItemPressed]}
            onPress={() => {
              setOverflowOpen(false);
              onDisconnect();
            }}
            accessibilityRole="button"
          >
            <LogOutIcon color="#ef4444" size={18} />
            <Text style={[styles.overflowItemText, styles.overflowDangerText]}>{t('action.disconnect')}</Text>
          </Pressable>
        </View>
      )}

      {/* Pending signature banner */}
      {pendingSigns > 0 && (
        <View style={styles.pendingBanner}>
          <ActivityIndicator color={theme.colorAccent} size="small" />
          <Text style={styles.pendingBannerText}>
            {t('connected.pending_signatures', { count: pendingSigns })}
          </Text>
        </View>
      )}

      {/* Balance — large typography, no card border */}
      <View style={styles.balanceSection}>
        <Text style={styles.balanceLabel}>{t('connected.balance_label')}</Text>
        <View style={styles.balanceAmount}>
          {balance ? (
            <>
              <Text style={styles.balanceValue}>{balance}</Text>
              <Text style={styles.balanceUnit}>{t('connected.balance_unit')}</Text>
            </>
          ) : balanceLoading ? (
            <SkeletonBar styles={styles} />
          ) : (
            <Text style={styles.balanceValue}>0.00</Text>
          )}
        </View>
        {/* Friendbot — TESTNET only (web gates on the exact network: Futurenet
            has a separate faucet, Standalone none). */}
        {network === 'TESTNET' &&
          (fundsRequested ? (
            <View style={styles.fundsBanner}>
              <Text style={styles.fundsBannerText}>{t('connected.funds_requested')}</Text>
            </View>
          ) : (
            <Pressable
              style={({ pressed }) => [styles.friendbotButton, pressed && styles.friendbotButtonPressed]}
              onPress={onGetFunds}
              accessibilityRole="button"
            >
              <Text style={styles.friendbotButtonText}>{t('connected.get_testnet_funds')}</Text>
            </Pressable>
          ))}
      </View>

      {/* Transaction history */}
      <View style={styles.txHistory}>
        <Text style={styles.txHeader}>{t('connected.recent_activity')}</Text>
        {history.length > 0 ? (
          history.map((tx) => (
            <Pressable
              key={tx.hash}
              style={({ pressed }) => [styles.txRow, pressed && { backgroundColor: theme.colorSurfaceHover }]}
              onPress={() => onTxPress(tx)}
              accessibilityRole="button"
            >
              <View style={[styles.txIcon, tx.success ? styles.txIconSuccess : styles.txIconFailed]}>
                <Text style={tx.success ? styles.txIconTextSuccess : styles.txIconTextFailed}>
                  {tx.success ? '✓' : '✗'}
                </Text>
              </View>
              <View style={styles.txInfo}>
                <Text style={styles.txType} numberOfLines={1}>
                  {tx.type}
                </Text>
                {tx.date ? <Text style={styles.txDate}>{tx.date}</Text> : null}
              </View>
              <Text style={[styles.txAmount, tx.amount.startsWith('-') ? styles.txAmountOut : styles.txAmountIn]}>
                {tx.amount} {tx.asset}
              </Text>
              <ExternalLinkIcon color={theme.colorTextMuted} size={14} />
            </Pressable>
          ))
        ) : (
          <Text style={styles.txEmpty}>{t('connected.no_transactions')}</Text>
        )}
      </View>
    </View>
  );
}
