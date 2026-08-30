/**
 * PreviewView — the pre-signing confirmation panel, a 1:1 port of the web
 * modal's `renderTransactionPreview()` (ui-web connect-modal.ts):
 *
 *   [app thumb]──[wallet thumb]     (Reown-style two-thumbnail row)
 *   Sign message / Review transaction          (17/600)
 *   Sign this message to prove you own {wallet}… (13.5/1.5 muted)
 *   ┌ op summary ────────────────┐  (one card per operation, 13/1.5)
 *   │ ⚠ risk flags (info/warn/danger)
 *   └─────────────────────────────┘
 *   From GABC…XYZW ⧉     0.00001 stroops   (mono 11.5 meta row)
 *   [      Cancel      ] [      Sign      ]  (flex:1 pair, web .preview-btn)
 *
 * Same flow on web and RN: `client.signTransaction()/signMessage()` build a
 * decoded `TransactionPreview` and await the modal's `onPreviewTransaction`
 * handler BEFORE the wallet ever sees the request — this view IS that
 * handler's UI. Approve resolves(true) → the signing view takes over;
 * Cancel resolves(false) → back to the account / wallet list.
 *
 * Entrance: web staggers every direct child (0.4s fade + 6px slide, 60ms
 * apart, disabled under reduced motion) — reproduced with useEntranceStagger.
 */

import React from 'react';
import { Animated, Image, Pressable, Text, View, type ImageSourcePropType } from 'react-native';
import { t, type TransactionPreview, type RiskFlag } from '@saganta/stellar-appkit';
import { useEntranceStagger } from '../animations.js';
import { CopyIcon, CheckIcon } from '../icons.js';
import { WalletIcon } from '../WalletIcon.js';
import type { AppKitStyles } from '../styles.js';
import type { ConnectThemeRN } from '../theme.js';
import { truncateAddress } from '../accountData.js';

export interface PreviewViewProps {
  styles: AppKitStyles;
  theme: ConnectThemeRN;
  reducedMotion: boolean;
  preview: TransactionPreview;
  /** Wallet display name + icon (active connector / WC peer). */
  walletName: string;
  walletIcon: string | null;
  walletKey: string | null;
  /** App name — drives the app-thumbnail letter fallback. */
  appName: string;
  /** App logo (modal `logo` prop). Falls back to the app-name letter. */
  appLogo?: ImageSourcePropType | null;
  /** Approve → resolve(true): the wallet is asked to sign. */
  onApprove: () => void;
  /** Cancel → resolve(false): the sign request is rejected (user-cancelled). */
  onReject: () => void;
  /** Copy/share the source account address (meta row copy button). */
  onCopyAddress: () => void;
  /** True for ~1.5s after the address copy tap (check glyph swap, web parity). */
  copied: boolean;
}

/** Web riskFlagHtml: one bordered flag per risk, tinted by severity. */
function RiskFlagView({ styles, flag }: { styles: AppKitStyles; flag: RiskFlag }) {
  const variant =
    flag.severity === 'danger' ? styles.riskDanger : flag.severity === 'warning' ? styles.riskWarning : styles.riskInfo;
  return (
    <View style={[styles.riskFlag, variant]}>
      <Text style={styles.riskFlagText}>{flag.message}</Text>
    </View>
  );
}

export function PreviewView(props: PreviewViewProps) {
  const { styles, theme, reducedMotion, preview, walletName, walletIcon, walletKey, appName, appLogo, onApprove, onReject, onCopyAddress, copied } = props;

  // Web: `preview.operations.length === 1 && operations[0]?.type === 'signMessage'`
  // decides the copy set — "Sign" for messages/SIWS, "Approve" for transactions.
  const isMessageSign = preview.operations.length === 1 && preview.operations[0]?.type === 'signMessage';
  const actionLabel = isMessageSign ? t('action.sign') : t('action.approve');
  const titleText = isMessageSign ? t('preview.title.sign_message') : t('preview.title.review_transaction');
  const subtitleText = isMessageSign
    ? t('preview.subtitle.sign_message', { walletName })
    : t('preview.subtitle.review_transaction', { walletName });

  // Web fee display: prefer the detailed XLM estimate, else stroops.
  const feeText = preview.feeEstimate
    ? `${preview.feeEstimate.totalFeeXlm} XLM`
    : `${preview.fee} stroops`;

  // Stagger: thumbs, title, subtitle, ops, meta, actions — web `.preview > *`
  // staggers every direct child 60ms apart (nth-child 1..7 delays).
  const entrance = useEntranceStagger(6, reducedMotion, { stepMs: 60, maxDelaySteps: 6 });

  const appThumb = appLogo ? (
    <Image source={appLogo} style={styles.previewThumbImg} resizeMode="contain" />
  ) : (
    <Text style={styles.previewThumbLetter}>{appName.charAt(0).toUpperCase()}</Text>
  );
  const walletThumb = walletIcon || walletKey ? (
    <WalletIcon source={walletIcon} walletKey={walletKey} fallbackLabel={walletName} size={36} radius={8} />
  ) : (
    <Text style={styles.previewThumbLetter}>{walletName.charAt(0).toUpperCase()}</Text>
  );

  return (
    <View style={styles.preview}>
      {/* Thumbnails: app logo + wallet logo with the connector line */}
      <AnimatedBlock entrance={entrance[0]!}>
        <View style={styles.previewThumbs}>
          <View style={styles.previewThumb}>{appThumb}</View>
          <View style={styles.previewThumbConnector} />
          <View style={styles.previewThumb}>{walletThumb}</View>
        </View>
      </AnimatedBlock>

      {/* Title + subtitle */}
      <AnimatedBlock entrance={entrance[1]!}>
        <Text style={styles.previewTitle}>{titleText}</Text>
      </AnimatedBlock>
      <AnimatedBlock entrance={entrance[2]!}>
        <Text style={styles.previewSubtitle}>{subtitleText}</Text>
      </AnimatedBlock>

      {/* Operations + risk flags */}
      {preview.operations.length > 0 && (
        <AnimatedBlock entrance={entrance[3]!} stretch>
          <View style={styles.previewOps}>
            {preview.operations.map((op, i) => (
              <View key={i} style={styles.previewOp}>
                <Text style={styles.previewOpSummary}>{op.summary}</Text>
                {op.riskFlags.map((flag, j) => (
                  <RiskFlagView key={j} styles={styles} flag={flag} />
                ))}
              </View>
            ))}
          </View>
        </AnimatedBlock>
      )}

      {/* Transaction-wide risk flags (e.g. fee-bump) */}
      {preview.riskFlags.length > 0 && (
        <AnimatedBlock entrance={entrance[3]!} stretch>
          <View style={styles.previewOps}>
            <View style={styles.previewOp}>
              {preview.riskFlags.map((flag, j) => (
                <RiskFlagView key={j} styles={styles} flag={flag} />
              ))}
            </View>
          </View>
        </AnimatedBlock>
      )}

      {/* Meta: source account + fee */}
      <AnimatedBlock entrance={entrance[4]!} stretch>
        <View style={styles.previewMeta}>
          <Pressable
            style={({ pressed }) => [styles.previewMetaItem, pressed && { opacity: 0.6 }]}
            onPress={onCopyAddress}
            accessibilityRole="button"
            accessibilityLabel={t('aria.copy_address')}
            hitSlop={6}
          >
            <Text style={styles.previewMetaText}>
              {t('preview.from_account', { address: truncateAddress(preview.sourceAccount) })}
            </Text>
            {copied ? (
              <CheckIcon color={theme.colorAccent} size={14} />
            ) : (
              <CopyIcon color={theme.colorTextMuted} size={14} />
            )}
          </Pressable>
          <Text style={[styles.previewMetaText, styles.previewFee]}>{feeText}</Text>
        </View>
      </AnimatedBlock>

      {/* Actions: Cancel + Sign/Approve */}
      <AnimatedBlock entrance={entrance[5]!} stretch>
        <View style={styles.previewActions}>
          <Pressable
            style={({ pressed }) => [styles.previewBtnCancel, pressed && styles.previewBtnCancelPressed]}
            onPress={onReject}
            accessibilityRole="button"
          >
            <Text style={styles.previewBtnCancelText}>{t('action.cancel')}</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.previewBtnApprove, pressed && styles.previewBtnApprovePressed]}
            onPress={onApprove}
            accessibilityRole="button"
          >
            <Text style={styles.previewBtnApproveText}>{actionLabel}</Text>
          </Pressable>
        </View>
      </AnimatedBlock>
    </View>
  );
}

/** One staggered child — web `.preview > *` fade + slide; `stretch` opts the
 * block into `alignSelf: 'stretch'` (ops/meta/actions span the panel). */
function AnimatedBlock({
  entrance,
  children,
  stretch,
}: {
  entrance: { opacity: Animated.Value; translateY: Animated.Value };
  children: React.ReactNode;
  stretch?: boolean;
}) {
  return (
    <Animated.View
      style={[stretch && { alignSelf: 'stretch' }, { opacity: entrance.opacity, transform: [{ translateY: entrance.translateY }] }]}
    >
      {children}
    </Animated.View>
  );
}
