/**
 * he locale for Stellar AppKit.
 *
 * Auto-generated from the English locale (./en.ts). All keys match the
 * English locale exactly — only values are translated.
 *
 * This file is lazy-loaded via dynamic import() when setLocale('he')
 * is called. It is NOT bundled into the main entry — the bundler code-splits
 * it into a separate chunk.
 *
 * ICU MessageFormat syntax is used for interpolation: {variableName}
 * ICU plural syntax: {count, plural, one {...} other {...}}
 */

import type { LocaleMessages } from './en.js';

const he: LocaleMessages = {
  "footer": {
    "powered_by": "מופעל על ידי {brand}",
    "brand_name": "Stellar AppKit"
  },
  "aria": {
    "close_dialog": "סגור",
    "back": "חזור",
    "copy_address": "העתק כתובת",
    "click_to_copy": "לחץ להעתקת הכתובת",
    "more_options": "אפשרויות נוספות",
    "view_on_explorer": "צפה בסייר"
  },
  "title": {
    "account": "חשבון",
    "choose_account": "בחר חשבון",
    "wrong_network": "רשת שגויה",
    "review_transaction": "סקור עסקה",
    "signing": "חותם",
    "connect_wallet": "חבר ארנק"
  },
  "wallet_list": {
    "loading": "טוען ארנקים…",
    "empty": "אין ארנקים רשומים. העבר connectors בהגדרות StellarAppKit.",
    "not_installed": "לא מותקן",
    "install": "התקן",
    "section_stellar": "ארנקי Stellar",
    "more_wallets": "ארנקים נוספים ({count})",
    "status": {
      "checking": "בודק…",
      "connecting": "מתחבר…",
      "locked": "נעול",
      "unavailable": "לא זמין",
      "installed": "מותקן",
      "scan_qr": "סרוק קוד QR"
    }
  },
  "connecting": {
    "continue_in_wallet": "המשך ב-{walletName}",
    "accept_request": "אשר את בקשת החיבור בארנק",
    "error_subtitle": "החיבור נדחה או נכשל. נסה שוב או בחר ארנק אחר."
  },
  "wc": {
    "scan_with": "סרוק עם {walletName}",
    "scan_instructions": "פתח את Hana, Lobstr או Hot Wallet וסרוק קוד QR זה כדי להתחבר.",
    "open_in_wallet": "פתח באפליקציית ארנק",
    open_failed: "לא ניתן לפתוח את {walletName}. אם האפליקציה לא מותקנת, אפשר להוריד אותה למטה.",
    "copy_uri": "העתק URI",
    "copied": "הועתק!",
    "generating_code": "מייצר קוד ציוות…",
    "qr_failed": "יצירת QR נכשלה. השתמש בכפתור ההעתקה למטה.",
    "copy_pairing_code": "העתקת קוד הצמדה"
  },
  "action": {
    "try_again": "נסה שוב",
    "cancel": "ביטול",
    "sign": "חתום",
    "approve": "אשר",
    "switch_wallet": "החלף ארנק",
    "disconnect": "נתק",
    "connect_wallet": "חבר ארנק"
  },
  "browser": {
    "reload": "רענן",
    "open_in_browser": "פתח בדפדפן",
    "copy_link": "העתק קישור"
  },
  "wallet": {
    "fallback_name": "ארנק",
    "fallback_your_wallet": "הארנק שלך"
  },
  "account": {
    "default_label": "חשבון"
  },
  "connected": {
    "pending_signatures": "{count, plural, one {# חתימה ממתינה} two {# חתימות ממתינות} many {# חתימות ממתינות} other {# חתימות ממתינות}}",
    "balance_label": "יתרת XLM",
    "balance_unit": "XLM",
    "recent_activity": "פעילות אחרונה",
    "no_transactions": "אין עסקאות אחרונות",
    "get_testnet_funds": "קבל כספי Testnet",
    "funds_requested": "המימון התבקש — היתרה תתעדכן בקרוב"
  },
  "tx": {
    "default_type": "עסקה",
    "default_asset": "XLM",
    "unknown_asset": "לא ידוע",
    "no_amount": "—"
  },
  "preview": {
    "title": {
      "sign_message": "חתום על הודעה",
      "review_transaction": "סקור עסקה"
    },
    "subtitle": {
      "sign_message": "חתום על הודעה זו כדי להוכיח שהינך הבעלים של {walletName}. ביטול ידחה את הבקשה.",
      "review_transaction": "סקור את פרטי העסקה למטה. אשר כדי להמשיך לחתום ב-{walletName}."
    },
    "from_account": "מ-{address}",
    "default_app_name": "אפליקציה"
  },
  "signing": {
    "continue_in_wallet": "המשך ב-{walletName}",
    "subtitle": "אשר את הבקשה בארנק שלך כדי להמשיך",
    "error_title": "החתימה נדחתה"
  },
  "siws": {
    "title": "התחבר עם Stellar",
    "phase": {
      "checking_session": "בודק סשן…",
      "fetching_nonce": "מקבל nonce מאובטח…",
      "approve_in_wallet": "אשר את בקשת ההתחברות ב-{walletName}",
      "verifying": "מאמת את החתימה שלך…"
    },
    "error_title": "ההתחברות נכשלה",
    "error_default": "ההתחברות נכשלה.",
    "connect_wallet": "חבר ארנק",
    "error_generic": "ההתחברות נכשלה. נסה שוב.",
    "error_too_many_attempts": "יותר מדי ניסיונות כושלים ({maxRetries}). נסה מאוחר יותר.",
    "error_verification_failed": "אימות ההתחברות נכשל.",
    "error_address_mismatch": "כתובת הסשן אינה תואמת לארנק המחובר",
    "error_network_mismatch": "רשת הסשן אינה תואמת לארנק המחובר",
    "error_session_expired": "הסשן פג תוקף"
  },
  "network_mismatch": {
    "title": "רשת שגויה",
    "detail": "ארנק זה ב-{actualNetwork}, אפליקציה זו דורשת {expectedNetwork}.",
    "detail_fallback": "ארנק זה ברשת השגויה.",
    "action_hint": "החלף רשת בארנק שלך ונסה שוב."
  },
  "error": {
    "title": "משהו השתבש",
    "default_message": "שגיאה לא ידועה.",
    "request_timed_out": "זמן הבקשה פג. נסה שוב."
  }
};

export default he;
