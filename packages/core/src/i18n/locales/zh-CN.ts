/**
 * zh-CN locale for Stellar AppKit.
 *
 * Auto-generated from the English locale (./en.ts). All keys match the
 * English locale exactly — only values are translated.
 *
 * This file is lazy-loaded via dynamic import() when setLocale('zh-CN')
 * is called. It is NOT bundled into the main entry — the bundler code-splits
 * it into a separate chunk.
 *
 * ICU MessageFormat syntax is used for interpolation: {variableName}
 * ICU plural syntax: {count, plural, one {...} other {...}}
 */

import type { LocaleMessages } from './en.js';

const zh_CN: LocaleMessages = {
  "footer": {
    "powered_by": "由 {brand} 提供支持",
    "brand_name": "Stellar AppKit"
  },
  "aria": {
    "close_dialog": "关闭",
    "back": "返回",
    "copy_address": "复制地址",
    "click_to_copy": "点击复制地址",
    "more_options": "更多选项",
    "view_on_explorer": "在浏览器中查看"
  },
  "title": {
    "account": "账户",
    "choose_account": "选择账户",
    "wrong_network": "网络错误",
    "review_transaction": "查看交易",
    "signing": "签名中",
    "connect_wallet": "连接钱包"
  },
  "wallet_list": {
    "loading": "正在加载钱包…",
    "empty": "未找到已注册的钱包。请在 StellarAppKit 配置中传入 connectors。",
    "not_installed": "未安装",
    "install": "安装",
    "section_stellar": "Stellar 钱包",
    "more_wallets": "更多钱包（{count}）",
    "status": {
      "checking": "检查中…",
      "connecting": "连接中…",
      "locked": "已锁定",
      "unavailable": "不可用",
      "installed": "已安装",
      "scan_qr": "扫描二维码"
    }
  },
  "connecting": {
    "continue_in_wallet": "在 {walletName} 中继续",
    "accept_request": "在钱包中接受连接请求",
    "error_subtitle": "连接被拒绝或失败。请重试或选择其他钱包。"
  },
  "wc": {
    "scan_with": "使用 {walletName} 扫描",
    "scan_instructions": "打开 Hana、Lobstr 或 Hot Wallet 并扫描此二维码以连接。",
    "open_in_wallet": "在钱包应用中打开",
    open_failed: "无法打开 {walletName}。如果尚未安装，请在下方获取。",
    "copy_uri": "复制 URI",
    "copied": "已复制！",
    "generating_code": "正在生成配对码…",
    "qr_failed": "二维码生成失败。请使用下方的复制按钮。",
    "copy_pairing_code": "复制配对码"
  },
  "action": {
    "try_again": "重试",
    "cancel": "取消",
    "sign": "签名",
    "approve": "批准",
    "switch_wallet": "切换钱包",
    "disconnect": "断开连接",
    "connect_wallet": "连接钱包"
  },
  "browser": {
    "reload": "刷新",
    "open_in_browser": "在浏览器中打开",
    "copy_link": "复制链接"
  },
  "wallet": {
    "fallback_name": "钱包",
    "fallback_your_wallet": "您的钱包"
  },
  "account": {
    "default_label": "账户"
  },
  "connected": {
    "pending_signatures": "{count, plural, other {# 个待签名请求}}",
    "balance_label": "XLM 余额",
    "balance_unit": "XLM",
    "recent_activity": "最近活动",
    "no_transactions": "暂无最近交易",
    "get_testnet_funds": "获取 Testnet 资金",
    "funds_requested": "已请求注资 — 余额即将更新"
  },
  "tx": {
    "default_type": "交易",
    "default_asset": "XLM",
    "unknown_asset": "未知",
    "no_amount": "—"
  },
  "preview": {
    "title": {
      "sign_message": "签名消息",
      "review_transaction": "查看交易"
    },
    "subtitle": {
      "sign_message": "签名此消息以证明您拥有 {walletName}。取消将关闭此请求。",
      "review_transaction": "请查看以下交易详情。批准后在 {walletName} 中继续签名。"
    },
    "from_account": "来自 {address}",
    "default_app_name": "应用"
  },
  "signing": {
    "continue_in_wallet": "在 {walletName} 中继续",
    "subtitle": "请在钱包中批准请求以继续",
    "error_title": "签名被拒绝"
  },
  "siws": {
    "title": "使用 Stellar 登录",
    "phase": {
      "checking_session": "正在检查会话…",
      "fetching_nonce": "正在获取安全随机数…",
      "approve_in_wallet": "请在 {walletName} 中批准登录请求",
      "verifying": "正在验证您的签名…"
    },
    "error_title": "登录失败",
    "error_default": "登录失败。",
    "connect_wallet": "连接钱包",
    "error_generic": "登录失败。请重试。",
    "error_too_many_attempts": "失败次数过多（{maxRetries} 次）。请稍后再试。",
    "error_verification_failed": "登录验证失败。",
    "error_address_mismatch": "会话地址与已连接钱包不匹配",
    "error_network_mismatch": "会话网络与已连接钱包不匹配",
    "error_session_expired": "会话已过期"
  },
  "network_mismatch": {
    "title": "网络错误",
    "detail": "此钱包在 {actualNetwork}，此应用需要 {expectedNetwork}。",
    "detail_fallback": "此钱包在错误的网络上。",
    "action_hint": "请在钱包中切换网络，然后重试。"
  },
  "error": {
    "title": "出错了",
    "default_message": "未知错误。",
    "request_timed_out": "请求超时。请重试。"
  }
};

export default zh_CN;
