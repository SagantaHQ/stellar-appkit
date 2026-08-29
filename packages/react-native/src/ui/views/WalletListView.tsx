/**
 * WalletListView — the wallet picker, mirroring the web modal's flat
 * `.wallet-row` list (packages/ui-web connect-modal.ts renderWalletList):
 *
 * - registered connectors with reachability → "Installed" outline badge /
 *   muted Locked / Install pill — exactly the web status matrix
 * - named mobile wallets (Freighter, LOBSTR, HOT, Scopuly, …) pair via deep
 *   link, so they carry the muted "Open in wallet app" hint — the native
 *   analog of the web WalletConnect row's "Scan QR Code"
 * - the 17 additional WalletConnect-registered wallets collapse under a
 *   "More wallets (N)" expander so the sheet stays scannable (RN-only
 *   necessity — the web list is flat because it only has ~7 connectors)
 *
 * Rows are flat and individually rounded — no cards, no separators.
 */

import React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { t } from '@saganta/stellar-appkit';
import {
  listAdditionalMobileWallets,
  listFeaturedMobileWallets,
  type MobileWalletDeepLink,
} from '../../deep-links.js';
import { WalletRowView, type WalletRowStatus } from './WalletRowView.js';
import type { AppKitStyles } from '../styles.js';
import type { ConnectThemeRN } from '../theme.js';
import type { WalletRow } from '../types.js';

export interface WalletListViewProps {
  styles: AppKitStyles;
  theme: ConnectThemeRN;
  loading: boolean;
  rows: WalletRow[];
  /** Whether the WalletConnect connector is registered (mobile wallets need it). */
  showMobileWallets: boolean;
  showMore: boolean;
  onToggleMore: () => void;
  onConnectMobile: (wallet: MobileWalletDeepLink) => void;
  onConnectConnector: (walletId: string) => void;
  onInstall: (row: WalletRow) => void;
}

export function WalletListView(props: WalletListViewProps) {
  const { styles, theme, loading, rows, showMobileWallets, showMore, onToggleMore, onConnectMobile, onConnectConnector, onInstall } = props;

  const featured = showMobileWallets ? listFeaturedMobileWallets() : [];
  const additional = showMobileWallets ? listAdditionalMobileWallets() : [];
  // The WalletConnect connector has no row of its own — the named mobile
  // wallets above ARE its pairing surface (deep link only, no QR).
  const directRows = rows.filter((row) => row.connector.id !== 'walletconnect');

  if (loading && rows.length === 0) {
    return (
      <View style={styles.listLoading}>
        <ActivityIndicator color={theme.colorAccent} />
        <Text style={styles.listLoadingText}>{t('wallet_list.loading')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.sections}>
      {/* Featured Stellar wallets + registered connectors, one flat list.
          The section title only appears when featured mobile wallets exist —
          with connectors alone the list is headerless, like the web modal. */}
      {featured.length > 0 && (
        <Text style={styles.sectionTitle} accessibilityRole="header">
          {t('wallet_list.section_stellar')}
        </Text>
      )}

      {featured.map((wallet) => (
        <WalletRowView
          key={wallet.id}
          styles={styles}
          theme={theme}
          icon={wallet.icon}
          walletKey={wallet.id}
          name={wallet.name}
          status={{ kind: 'muted', text: t('wc.open_in_wallet') }}
          onPress={() => onConnectMobile(wallet)}
        />
      ))}

      {directRows.map((row) => {
        const { connector, reachability } = row;
        // The web status matrix: not-installed → Install pill (row still
        // full-opacity), locked/unavailable → muted text, else → Installed badge.
        const status: WalletRowStatus =
          reachability === 'not-installed'
            ? { kind: 'install' }
            : reachability === 'locked'
              ? { kind: 'muted', text: t('wallet_list.status.locked') }
              : reachability === 'unavailable'
                ? { kind: 'muted', text: t('wallet_list.status.unavailable') }
                : { kind: 'installed' };
        return (
          <WalletRowView
            key={connector.id}
            styles={styles}
            theme={theme}
            icon={connector.meta.icon ?? null}
            walletKey={connector.id}
            name={connector.meta.name}
            status={status}
            dimmed={reachability === 'unavailable'}
            disabled={reachability === 'not-installed' || reachability === 'unavailable'}
            onPress={() => onConnectConnector(connector.id)}
            onInstall={() => onInstall(row)}
          />
        );
      })}

      {/* Every other WalletConnect-registered mobile wallet, collapsed */}
      {additional.length > 0 && (
        <View>
          <Pressable
            style={({ pressed }) => [styles.moreHeader, pressed && { opacity: 0.6 }]}
            onPress={onToggleMore}
            accessibilityRole="button"
            accessibilityLabel={t('wallet_list.more_wallets', { count: additional.length })}
            accessibilityState={{ expanded: showMore }}
          >
            <Text style={styles.sectionTitle}>{t('wallet_list.more_wallets', { count: additional.length })}</Text>
            <Text style={[styles.moreChevron, showMore && styles.moreChevronOpen]}>›</Text>
          </Pressable>
          {showMore &&
            additional.map((wallet) => (
              <WalletRowView
                key={wallet.id}
                styles={styles}
                theme={theme}
                icon={wallet.icon}
                walletKey={wallet.id}
                name={wallet.name}
                status={{ kind: 'muted', text: t('wc.open_in_wallet') }}
                onPress={() => onConnectMobile(wallet)}
              />
            ))}
        </View>
      )}
    </View>
  );
}
