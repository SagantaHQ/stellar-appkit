/**
 * hi locale for Stellar AppKit.
 *
 * Auto-generated from the English locale (./en.ts). All keys match the
 * English locale exactly — only values are translated.
 *
 * This file is lazy-loaded via dynamic import() when setLocale('hi')
 * is called. It is NOT bundled into the main entry — the bundler code-splits
 * it into a separate chunk.
 *
 * ICU MessageFormat syntax is used for interpolation: {variableName}
 * ICU plural syntax: {count, plural, one {...} other {...}}
 */

import type { LocaleMessages } from './en.js';

const hi: LocaleMessages = {
  "footer": {
    "powered_by": "{brand} द्वारा संचालित",
    "brand_name": "Stellar AppKit"
  },
  "aria": {
    "close_dialog": "बंद करें",
    "back": "वापस",
    "copy_address": "पता कॉपी करें",
    "click_to_copy": "पता कॉपी करने के लिए क्लिक करें",
    "more_options": "अधिक विकल्प",
    "view_on_explorer": "एक्सप्लोरर में देखें"
  },
  "title": {
    "account": "खाता",
    "choose_account": "एक खाता चुनें",
    "wrong_network": "गलत नेटवर्क",
    "review_transaction": "लेन-देन की समीक्षा करें",
    "signing": "हस्ताक्षर कर रहे हैं",
    "connect_wallet": "वॉलेट कनेक्ट करें"
  },
  "wallet_list": {
    "loading": "वॉलेट लोड हो रहे हैं…",
    "empty": "कोई पंजीकृत वॉलेट नहीं। StellarAppKit कॉन्फ़िग में connectors पास करें।",
    "not_installed": "स्थापित नहीं है",
    "install": "स्थापित करें",
    "status": {
      "connecting": "कनेक्ट हो रहा है…",
      "locked": "लॉक्ड",
      "unavailable": "अनुपलब्ध",
      "installed": "स्थापित",
      "scan_qr": "QR कोड स्कैन करें"
    }
  },
  "connecting": {
    "continue_in_wallet": "{walletName} में जारी रखें",
    "accept_request": "वॉलेट में कनेक्शन अनुरोध स्वीकार करें",
    "error_subtitle": "कनेक्शन अस्वीकृत या विफल। पुनः प्रयास करें या अन्य वॉलेट चुनें।"
  },
  "wc": {
    "scan_with": "{walletName} से स्कैन करें",
    "scan_instructions": "कनेक्ट करने के लिए Hana, Lobstr, या Hot Wallet खोलें और इस QR कोड को स्कैन करें।",
    "open_in_wallet": "वॉलेट ऐप में खोलें",
    "copy_uri": "URI कॉपी करें",
    "copied": "कॉपी हो गया!",
    "generating_code": "पेयरिंग कोड जेनरेट हो रहा है…",
    "qr_failed": "QR जेनरेशन विफल। नीचे दिए गए कॉपी बटन का उपयोग करें।"
  },
  "action": {
    "try_again": "पुनः प्रयास करें",
    "cancel": "रद्द करें",
    "sign": "हस्ताक्षर करें",
    "approve": "स्वीकृत करें",
    "switch_wallet": "वॉलेट बदलें",
    "disconnect": "डिस्कनेक्ट करें",
    "connect_wallet": "वॉलेट कनेक्ट करें"
  },
  "wallet": {
    "fallback_name": "वॉलेट",
    "fallback_your_wallet": "आपका वॉलेट"
  },
  "account": {
    "default_label": "खाता"
  },
  "connected": {
    "pending_signatures": "{count, plural, one {# लंबित हस्ताक्षर} other {# लंबित हस्ताक्षर}}",
    "balance_label": "XLM शेष",
    "balance_unit": "XLM",
    "recent_activity": "हाल की गतिविधि",
    "no_transactions": "कोई हाल का लेन-देन नहीं",
    "get_testnet_funds": "Testnet फंड प्राप्त करें",
    "funds_requested": "फंडिंग का अनुरोध किया गया — बैलेंस जल्द ही अपडेट होगा"
  },
  "tx": {
    "default_type": "लेन-देन",
    "default_asset": "XLM",
    "unknown_asset": "अज्ञात",
    "no_amount": "—"
  },
  "preview": {
    "title": {
      "sign_message": "संदेश पर हस्ताक्षर करें",
      "review_transaction": "लेन-देन की समीक्षा करें"
    },
    "subtitle": {
      "sign_message": "{walletName} के स्वामित्व को साबित करने के लिए इस संदेश पर हस्ताक्षर करें। रद्द करने से अनुरोध खारिज हो जाएगा।",
      "review_transaction": "नीचे दिए गए लेन-देन विवरण की समीक्षा करें। {walletName} में हस्ताक्षर जारी रखने के लिए स्वीकृत करें।"
    },
    "from_account": "से {address}",
    "default_app_name": "ऐप"
  },
  "signing": {
    "continue_in_wallet": "{walletName} में जारी रखें",
    "subtitle": "जारी रखने के लिए अपने वॉलेट में अनुरोध स्वीकृत करें",
    "error_title": "हस्ताक्षर अस्वीकृत"
  },
  "siws": {
    "title": "Stellar के साथ लॉग इन करें",
    "phase": {
      "checking_session": "सत्र की जाँच हो रही है…",
      "fetching_nonce": "सुरक्षित nonce प्राप्त हो रहा है…",
      "approve_in_wallet": "{walletName} में लॉगिन अनुरोध स्वीकृत करें",
      "verifying": "आपके हस्ताक्षर की पुष्टि हो रही है…"
    },
    "error_title": "लॉगिन विफल",
    "error_default": "लॉगिन विफल।",
    "connect_wallet": "वॉलेट कनेक्ट करें",
    "error_generic": "लॉगिन विफल। पुनः प्रयास करें।",
    "error_too_many_attempts": "बहुत अधिक विफल प्रयास ({maxRetries})। बाद में पुनः प्रयास करें।",
    "error_verification_failed": "लॉगिन सत्यापन विफल।",
    "error_address_mismatch": "सत्र पता कनेक्टेड वॉलेट से मेल नहीं खाता",
    "error_network_mismatch": "सत्र नेटवर्क कनेक्टेड वॉलेट से मेल नहीं खाता",
    "error_session_expired": "सत्र समाप्त हो गया है"
  },
  "network_mismatch": {
    "title": "गलत नेटवर्क",
    "detail": "यह वॉलेट {actualNetwork} पर है, इस ऐप को {expectedNetwork} चाहिए।",
    "detail_fallback": "यह वॉलेट गलत नेटवर्क पर है।",
    "action_hint": "अपने वॉलेट में नेटवर्क बदलें, फिर पुनः प्रयास करें।"
  },
  "error": {
    "title": "कुछ गलत हो गया",
    "default_message": "अज्ञात त्रुटि।",
    "request_timed_out": "अनुरोध समय समाप्त। पुनः प्रयास करें।"
  }
};

export default hi;
