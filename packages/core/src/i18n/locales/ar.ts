/**
 * ar locale for Stellar AppKit.
 *
 * Auto-generated from the English locale (./en.ts). All keys match the
 * English locale exactly — only values are translated.
 *
 * This file is lazy-loaded via dynamic import() when setLocale('ar')
 * is called. It is NOT bundled into the main entry — the bundler code-splits
 * it into a separate chunk.
 *
 * ICU MessageFormat syntax is used for interpolation: {variableName}
 * ICU plural syntax: {count, plural, one {...} other {...}}
 */

import type { LocaleMessages } from './en.js';

const ar: LocaleMessages = {
  "footer": {
    "powered_by": "مدعوم من {brand}",
    "brand_name": "Stellar AppKit"
  },
  "aria": {
    "close_dialog": "إغلاق",
    "back": "رجوع",
    "copy_address": "نسخ العنوان",
    "click_to_copy": "انقر لنسخ العنوان",
    "more_options": "المزيد من الخيارات",
    "view_on_explorer": "عرض في المستكشف"
  },
  "title": {
    "account": "الحساب",
    "choose_account": "اختر حسابًا",
    "wrong_network": "شبكة خاطئة",
    "review_transaction": "مراجعة المعاملة",
    "signing": "التوقيع",
    "connect_wallet": "توصيل محفظة"
  },
  "wallet_list": {
    "loading": "جارٍ تحميل المحافظ…",
    "empty": "لا توجد محافظ مسجلة. مرر connectors في تكوين StellarAppKit.",
    "not_installed": "غير مثبت",
    "install": "تثبيت",
    "status": {
      "connecting": "جارٍ التوصيل…",
      "locked": "مقفل",
      "unavailable": "غير متاح",
      "installed": "مثبت",
      "scan_qr": "امسح رمز QR"
    }
  },
  "connecting": {
    "continue_in_wallet": "المتابعة في {walletName}",
    "accept_request": "اقبل طلب التوصيل في المحفظة",
    "error_subtitle": "تم رفض التوصيل أو فشل. أعد المحاولة أو اختر محفظة أخرى."
  },
  "wc": {
    "scan_with": "امسح باستخدام {walletName}",
    "scan_instructions": "افتح Hana أو Lobstr أو Hot Wallet وامسح رمز QR هذا للتوصيل.",
    "open_in_wallet": "فتح في تطبيق المحفظة",
    "copy_uri": "نسخ URI",
    "copied": "تم النسخ!",
    "generating_code": "جارٍ إنشاء رمز الاقتران…",
    "qr_failed": "فشل إنشاء رمز QR. استخدم زر النسخ أدناه."
  },
  "action": {
    "try_again": "إعادة المحاولة",
    "cancel": "إلغاء",
    "sign": "توقيع",
    "approve": "موافقة",
    "switch_wallet": "تبديل المحفظة",
    "disconnect": "قطع الاتصال",
    "connect_wallet": "توصيل المحفظة"
  },
  "wallet": {
    "fallback_name": "المحفظة",
    "fallback_your_wallet": "محفظتك"
  },
  "account": {
    "default_label": "الحساب"
  },
  "connected": {
    "pending_signatures": "{count, plural, zero {لا توجد توقيعات معلقة} one {# توقيع معلق} two {# توقيعان معلقان} few {# توقيعات معلقة} many {# توقيعًا معلقًا} other {# توقيع معلق}}",
    "balance_label": "رصيد XLM",
    "balance_unit": "XLM",
    "recent_activity": "النشاط الأخير",
    "no_transactions": "لا توجد معاملات حديثة",
    "get_testnet_funds": "احصل على أموال Testnet",
    "funds_requested": "تم طلب التمويل — سيتم تحديث الرصيد قريبًا"
  },
  "tx": {
    "default_type": "معاملة",
    "default_asset": "XLM",
    "unknown_asset": "غير معروف",
    "no_amount": "—"
  },
  "preview": {
    "title": {
      "sign_message": "توقيع الرسالة",
      "review_transaction": "مراجعة المعاملة"
    },
    "subtitle": {
      "sign_message": "وقّع هذه الرسالة لإثبات ملكيتك لـ {walletName}. الإلغاء سيرفض الطلب.",
      "review_transaction": "راجع تفاصيل المعاملة أدناه. وافق للمتابعة التوقيع في {walletName}."
    },
    "from_account": "من {address}",
    "default_app_name": "تطبيق"
  },
  "signing": {
    "continue_in_wallet": "المتابعة في {walletName}",
    "subtitle": "وافق على الطلب في محفظتك للمتابعة",
    "error_title": "تم رفض التوقيع"
  },
  "siws": {
    "title": "تسجيل الدخول باستخدام Stellar",
    "phase": {
      "checking_session": "جارٍ التحقق من الجلسة…",
      "fetching_nonce": "جارٍ الحصول على nonce الآمن…",
      "approve_in_wallet": "وافق على طلب تسجيل الدخول في {walletName}",
      "verifying": "جارٍ التحقق من توقيعك…"
    },
    "error_title": "فشل تسجيل الدخول",
    "error_default": "فشل تسجيل الدخول.",
    "connect_wallet": "توصيل المحفظة",
    "error_generic": "فشل تسجيل الدخول. حاول مرة أخرى.",
    "error_too_many_attempts": "محاولات فاشلة كثيرة جدًا ({maxRetries}). حاول لاحقًا.",
    "error_verification_failed": "فشل التحقق من تسجيل الدخول.",
    "error_address_mismatch": "عنوان الجلسة لا يتطابق مع المحفظة المتصلة",
    "error_network_mismatch": "شبكة الجلسة لا تتطابق مع المحفظة المتصلة",
    "error_session_expired": "انتهت صلاحية الجلسة"
  },
  "network_mismatch": {
    "title": "شبكة خاطئة",
    "detail": "هذه المحفظة على شبكة {actualNetwork}، هذا التطبيق يحتاج {expectedNetwork}.",
    "detail_fallback": "هذه المحفظة على شبكة خاطئة.",
    "action_hint": "بدّل الشبكة في محفظتك ثم حاول مرة أخرى."
  },
  "error": {
    "title": "حدث خطأ ما",
    "default_message": "خطأ غير معروف.",
    "request_timed_out": "انتهت مهلة الطلب. حاول مرة أخرى."
  }
};

export default ar;
