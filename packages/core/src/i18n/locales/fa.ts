/**
 * fa locale for Stellar AppKit.
 *
 * Auto-generated from the English locale (./en.ts). All keys match the
 * English locale exactly — only values are translated.
 *
 * This file is lazy-loaded via dynamic import() when setLocale('fa')
 * is called. It is NOT bundled into the main entry — the bundler code-splits
 * it into a separate chunk.
 *
 * ICU MessageFormat syntax is used for interpolation: {variableName}
 * ICU plural syntax: {count, plural, one {...} other {...}}
 */

import type { LocaleMessages } from './en.js';

const fa: LocaleMessages = {
  "footer": {
    "powered_by": "نیرو گرفته از {brand}",
    "brand_name": "Stellar AppKit"
  },
  "aria": {
    "close_dialog": "بستن",
    "back": "بازگشت",
    "copy_address": "کپی آدرس",
    "click_to_copy": "برای کپی آدرس کلیک کنید",
    "more_options": "گزینه‌های بیشتر",
    "view_on_explorer": "مشاهده در اکسپلورر"
  },
  "title": {
    "account": "حساب",
    "choose_account": "یک حساب انتخاب کنید",
    "wrong_network": "شبکه اشتباه",
    "review_transaction": "بررسی تراکنش",
    "signing": "در حال امضا",
    "connect_wallet": "اتصال کیف پول"
  },
  "wallet_list": {
    "loading": "در حال بارگذاری کیف پول‌ها…",
    "empty": "هیچ کیف پولی ثبت نشده. connectors را در پیکربندی StellarAppKit ارسال کنید.",
    "not_installed": "نصب نشده",
    "install": "نصب",
    "section_stellar": "کیف‌پول‌های استلار",
    "more_wallets": "کیف‌پول‌های بیشتر ({count})",
    "status": {
      "connecting": "در حال اتصال…",
      "locked": "قفل شده",
      "unavailable": "غیرفعال",
      "installed": "نصب شده",
      "scan_qr": "اسکن کد QR"
    }
  },
  "connecting": {
    "continue_in_wallet": "در {walletName} ادامه دهید",
    "accept_request": "درخواست اتصال را در کیف پول بپذیرید",
    "error_subtitle": "اتصال رد شد یا ناموفق بود. دوباره تلاش کنید یا کیف پول دیگری انتخاب کنید."
  },
  "wc": {
    "scan_with": "با {walletName} اسکن کنید",
    "scan_instructions": "Hana، Lobstr یا Hot Wallet را باز کنید و این کد QR را برای اتصال اسکن کنید.",
    "open_in_wallet": "باز کردن در برنامه کیف پول",
    open_failed: "باز کردن {walletName} ممکن نبود. اگر نصب نیست، آن را از پایین نصب کنید.",
    "copy_uri": "کپی URI",
    "copied": "کپی شد!",
    "generating_code": "در حال تولید کد جفت…",
    "qr_failed": "تولید QR ناموفق بود. از دکمه کپی زیر استفاده کنید.",
    "copy_pairing_code": "کپی کد اتصال"
  },
  "action": {
    "try_again": "تلاش مجدد",
    "cancel": "لغو",
    "sign": "امضا",
    "approve": "تأیید",
    "switch_wallet": "تغییر کیف پول",
    "disconnect": "قطع اتصال",
    "connect_wallet": "اتصال کیف پول"
  },
  "wallet": {
    "fallback_name": "کیف پول",
    "fallback_your_wallet": "کیف پول شما"
  },
  "account": {
    "default_label": "حساب"
  },
  "connected": {
    "pending_signatures": "{count, plural, other {# امضای در انتظار}}",
    "balance_label": "موجودی XLM",
    "balance_unit": "XLM",
    "recent_activity": "فعالیت اخیر",
    "no_transactions": "تراکنش اخیری وجود ندارد",
    "get_testnet_funds": "دریافت وجوه تستنت",
    "funds_requested": "درخواست تأمین مالی ارسال شد — موجودی به‌زودی به‌روزرسانی می‌شود"
  },
  "tx": {
    "default_type": "تراکنش",
    "default_asset": "XLM",
    "unknown_asset": "نامشخص",
    "no_amount": "—"
  },
  "preview": {
    "title": {
      "sign_message": "امضا پیام",
      "review_transaction": "بررسی تراکنش"
    },
    "subtitle": {
      "sign_message": "این پیام را امضا کنید تا ثابت کنید صاحب {walletName} هستید. لغو باعث رد درخواست می‌شود.",
      "review_transaction": "جزئیات تراکنش را در زیر بررسی کنید. برای ادامه امضا در {walletName} تأیید کنید."
    },
    "from_account": "از {address}",
    "default_app_name": "برنامه"
  },
  "signing": {
    "continue_in_wallet": "در {walletName} ادامه دهید",
    "subtitle": "برای ادامه، درخواست را در کیف پول خود تأیید کنید",
    "error_title": "امضا رد شد"
  },
  "siws": {
    "title": "ورود با Stellar",
    "phase": {
      "checking_session": "در حال بررسی نشست…",
      "fetching_nonce": "در حال دریافت nonce امن…",
      "approve_in_wallet": "درخواست ورود را در {walletName} تأیید کنید",
      "verifying": "در حال تأیید امضای شما…"
    },
    "error_title": "ورود ناموفق بود",
    "error_default": "ورود ناموفق بود.",
    "connect_wallet": "اتصال کیف پول",
    "error_generic": "ورود ناموفق بود. دوباره تلاش کنید.",
    "error_too_many_attempts": "تلاش‌های ناموفق بیش از حد ({maxRetries}). بعداً دوباره تلاش کنید.",
    "error_verification_failed": "تأیید ورود ناموفق بود.",
    "error_address_mismatch": "آدرس نشست با کیف پول متصل مطابقت ندارد",
    "error_network_mismatch": "شبکه نشست با کیف پول متصل مطابقت ندارد",
    "error_session_expired": "نشست منقضی شده است"
  },
  "network_mismatch": {
    "title": "شبکه اشتباه",
    "detail": "این کیف پول در {actualNetwork} است، این برنامه به {expectedNetwork} نیاز دارد.",
    "detail_fallback": "این کیف پول در شبکه اشتباهی است.",
    "action_hint": "شبکه را در کیف پول خود تغییر دهید، سپس دوباره تلاش کنید."
  },
  "error": {
    "title": "مشکلی پیش آمد",
    "default_message": "خطای ناشناخته.",
    "request_timed_out": "زمان درخواست به پایان رسید. دوباره تلاش کنید."
  }
};

export default fa;
