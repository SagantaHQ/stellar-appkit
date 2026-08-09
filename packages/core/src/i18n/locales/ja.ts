/**
 * ja locale for Stellar AppKit.
 *
 * Auto-generated from the English locale (./en.ts). All keys match the
 * English locale exactly — only values are translated.
 *
 * This file is lazy-loaded via dynamic import() when setLocale('ja')
 * is called. It is NOT bundled into the main entry — the bundler code-splits
 * it into a separate chunk.
 *
 * ICU MessageFormat syntax is used for interpolation: {variableName}
 * ICU plural syntax: {count, plural, one {...} other {...}}
 */

import type { LocaleMessages } from './en.js';

const ja: LocaleMessages = {
  "footer": {
    "powered_by": "Powered by {brand}",
    "brand_name": "Stellar AppKit"
  },
  "aria": {
    "close_dialog": "閉じる",
    "back": "戻る",
    "copy_address": "アドレスをコピー",
    "click_to_copy": "クリックしてアドレスをコピー",
    "more_options": "その他のオプション",
    "view_on_explorer": "エクスプローラーで表示"
  },
  "title": {
    "account": "アカウント",
    "choose_account": "アカウントを選択",
    "wrong_network": "ネットワークが正しくありません",
    "review_transaction": "取引を確認",
    "signing": "署名中",
    "connect_wallet": "ウォレットを接続"
  },
  "wallet_list": {
    "loading": "ウォレットを読み込み中…",
    "empty": "登録されたウォレットがありません。StellarAppKit の設定に connectors を渡してください。",
    "not_installed": "未インストール",
    "install": "インストール",
    "status": {
      "connecting": "接続中…",
      "locked": "ロック中",
      "unavailable": "利用不可",
      "installed": "インストール済み",
      "scan_qr": "QRコードをスキャン"
    }
  },
  "connecting": {
    "continue_in_wallet": "{walletName} で続行",
    "accept_request": "ウォレットで接続リクエストを承認してください",
    "error_subtitle": "接続が拒否されるか失敗しました。再試行するか、別のウォレットを選択してください。"
  },
  "wc": {
    "scan_with": "{walletName} でスキャン",
    "scan_instructions": "Hana、Lobstr、または Hot Wallet を開き、この QR コードをスキャンして接続してください。",
    "open_in_wallet": "ウォレットアプリで開く",
    "copy_uri": "URI をコピー",
    "copied": "コピーしました！",
    "generating_code": "ペアリングコードを生成中…",
    "qr_failed": "QR コードの生成に失敗しました。下のコピーボタンを使用してください。"
  },
  "action": {
    "try_again": "再試行",
    "cancel": "キャンセル",
    "sign": "署名",
    "approve": "承認",
    "switch_wallet": "ウォレットを切り替え",
    "disconnect": "切断",
    "connect_wallet": "ウォレットを接続"
  },
  "wallet": {
    "fallback_name": "ウォレット",
    "fallback_your_wallet": "お使いのウォレット"
  },
  "account": {
    "default_label": "アカウント"
  },
  "connected": {
    "pending_signatures": "{count, plural, other {# 件の保留中の署名}}",
    "balance_label": "XLM 残高",
    "balance_unit": "XLM",
    "recent_activity": "最近のアクティビティ",
    "no_transactions": "最近の取引はありません",
    "get_testnet_funds": "Testnetファンドを取得",
    "funds_requested": "資金要求を送信しました — 残高はまもなく更新されます"
  },
  "tx": {
    "default_type": "取引",
    "default_asset": "XLM",
    "unknown_asset": "不明",
    "no_amount": "—"
  },
  "preview": {
    "title": {
      "sign_message": "メッセージに署名",
      "review_transaction": "取引を確認"
    },
    "subtitle": {
      "sign_message": "{walletName} の所有権を証明するためにこのメッセージに署名してください。キャンセルするとリクエストが破棄されます。",
      "review_transaction": "以下の取引詳細を確認してください。承認すると {walletName} で署名を続行します。"
    },
    "from_account": "差出人 {address}",
    "default_app_name": "アプリ"
  },
  "signing": {
    "continue_in_wallet": "{walletName} で続行",
    "subtitle": "続行するにはウォレットでリクエストを承認してください",
    "error_title": "署名が拒否されました"
  },
  "siws": {
    "title": "Stellar でログイン",
    "phase": {
      "checking_session": "セッションを確認中…",
      "fetching_nonce": "セキュアノンスを取得中…",
      "approve_in_wallet": "{walletName} でログインリクエストを承認してください",
      "verifying": "署名を検証中…"
    },
    "error_title": "ログインに失敗しました",
    "error_default": "ログインに失敗しました。",
    "connect_wallet": "ウォレットを接続",
    "error_generic": "ログインに失敗しました。再試行してください。",
    "error_too_many_attempts": "失敗回数が多すぎます（{maxRetries} 回）。後でもう一度お試しください。",
    "error_verification_failed": "ログインの検証に失敗しました。",
    "error_address_mismatch": "セッションのアドレスが接続されたウォレットと一致しません",
    "error_network_mismatch": "セッションのネットワークが接続されたウォレットと一致しません",
    "error_session_expired": "セッションの有効期限が切れています"
  },
  "network_mismatch": {
    "title": "ネットワークが正しくありません",
    "detail": "このウォレットは {actualNetwork} にあります。このアプリには {expectedNetwork} が必要です。",
    "detail_fallback": "このウォレットは間違ったネットワークにあります。",
    "action_hint": "ウォレットでネットワークを切り替えてから、もう一度お試しください。"
  },
  "error": {
    "title": "エラーが発生しました",
    "default_message": "不明なエラーです。",
    "request_timed_out": "リクエストがタイムアウトしました。再試行してください。"
  }
};

export default ja;
