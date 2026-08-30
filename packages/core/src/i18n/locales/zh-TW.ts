/**
 * zh-TW locale for Stellar AppKit.
 *
 * Auto-generated from the English locale (./en.ts). All keys match the
 * English locale exactly — only values are translated.
 *
 * This file is lazy-loaded via dynamic import() when setLocale('zh-TW')
 * is called. It is NOT bundled into the main entry — the bundler code-splits
 * it into a separate chunk.
 *
 * ICU MessageFormat syntax is used for interpolation: {variableName}
 * ICU plural syntax: {count, plural, one {...} other {...}}
 */

import type { LocaleMessages } from './en.js';

const zh_TW: LocaleMessages = {
  "footer": {
    "powered_by": "由 {brand} 提供支援",
    "brand_name": "Stellar AppKit"
  },
  "aria": {
    "close_dialog": "關閉",
    "back": "返回",
    "copy_address": "複製地址",
    "click_to_copy": "點擊複製地址",
    "more_options": "更多選項",
    "view_on_explorer": "在瀏覽器中查看"
  },
  "title": {
    "account": "帳戶",
    "choose_account": "選擇帳戶",
    "wrong_network": "網路錯誤",
    "review_transaction": "檢視交易",
    "signing": "簽名中",
    "connect_wallet": "連接錢包"
  },
  "wallet_list": {
    "loading": "正在載入錢包…",
    "empty": "未找到已註冊的錢包。請在 StellarAppKit 設定中傳入 connectors。",
    "not_installed": "未安裝",
    "install": "安裝",
    "section_stellar": "Stellar 錢包",
    "more_wallets": "更多錢包（{count}）",
    "status": {
      "connecting": "連接中…",
      "locked": "已鎖定",
      "unavailable": "不可用",
      "installed": "已安裝",
      "scan_qr": "掃描 QR Code"
    }
  },
  "connecting": {
    "continue_in_wallet": "在 {walletName} 中繼續",
    "accept_request": "在錢包中接受連接請求",
    "error_subtitle": "連接被拒絕或失敗。請重試或選擇其他錢包。"
  },
  "wc": {
    "scan_with": "使用 {walletName} 掃描",
    "scan_instructions": "打開 Hana、Lobstr 或 Hot Wallet 並掃描此 QR 碼以連接。",
    "open_in_wallet": "在錢包應用中打開",
    open_failed: "無法開啟 {walletName}。如果尚未安裝，請在下方取得。",
    "copy_uri": "複製 URI",
    "copied": "已複製！",
    "generating_code": "正在產生配對碼…",
    "qr_failed": "QR 碼產生失敗。請使用下方的複製按鈕。",
    "copy_pairing_code": "複製配對碼"
  },
  "action": {
    "try_again": "重試",
    "cancel": "取消",
    "sign": "簽名",
    "approve": "批准",
    "switch_wallet": "切換錢包",
    "disconnect": "斷開連接",
    "connect_wallet": "連接錢包"
  },
  "browser": {
    "reload": "重新整理",
    "open_in_browser": "在瀏覽器中開啟",
    "copy_link": "複製連結"
  },
  "wallet": {
    "fallback_name": "錢包",
    "fallback_your_wallet": "您的錢包"
  },
  "account": {
    "default_label": "帳戶"
  },
  "connected": {
    "pending_signatures": "{count, plural, other {# 個待簽名請求}}",
    "balance_label": "XLM 餘額",
    "balance_unit": "XLM",
    "recent_activity": "最近活動",
    "no_transactions": "暫無最近交易",
    "get_testnet_funds": "取得 Testnet 資金",
    "funds_requested": "已請求注資 — 餘額即將更新"
  },
  "tx": {
    "default_type": "交易",
    "default_asset": "XLM",
    "unknown_asset": "未知",
    "no_amount": "—"
  },
  "preview": {
    "title": {
      "sign_message": "簽名訊息",
      "review_transaction": "檢視交易"
    },
    "subtitle": {
      "sign_message": "簽名此訊息以證明您擁有 {walletName}。取消將關閉此請求。",
      "review_transaction": "請檢視以下交易詳情。批准後在 {walletName} 中繼續簽名。"
    },
    "from_account": "來自 {address}",
    "default_app_name": "應用"
  },
  "signing": {
    "continue_in_wallet": "在 {walletName} 中繼續",
    "subtitle": "請在錢包中批准請求以繼續",
    "error_title": "簽名被拒絕"
  },
  "siws": {
    "title": "使用 Stellar 登入",
    "phase": {
      "checking_session": "正在檢查工作階段…",
      "fetching_nonce": "正在取得安全隨機數…",
      "approve_in_wallet": "請在 {walletName} 中批准登入請求",
      "verifying": "正在驗證您的簽名…"
    },
    "error_title": "登入失敗",
    "error_default": "登入失敗。",
    "connect_wallet": "連接錢包",
    "error_generic": "登入失敗。請重試。",
    "error_too_many_attempts": "失敗次數過多（{maxRetries} 次）。請稍後再試。",
    "error_verification_failed": "登入驗證失敗。",
    "error_address_mismatch": "工作階段地址與已連接錢包不匹配",
    "error_network_mismatch": "工作階段網路與已連接錢包不匹配",
    "error_session_expired": "工作階段已過期"
  },
  "network_mismatch": {
    "title": "網路錯誤",
    "detail": "此錢包在 {actualNetwork}，此應用需要 {expectedNetwork}。",
    "detail_fallback": "此錢包在錯誤的網路上。",
    "action_hint": "請在錢包中切換網路，然後重試。"
  },
  "error": {
    "title": "發生錯誤",
    "default_message": "未知錯誤。",
    "request_timed_out": "請求逾時。請重試。"
  }
};

export default zh_TW;
