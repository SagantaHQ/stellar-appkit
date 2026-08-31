/**
 * tr locale for Stellar AppKit.
 *
 * Auto-generated from the English locale (./en.ts). All keys match the
 * English locale exactly — only values are translated.
 *
 * This file is lazy-loaded via dynamic import() when setLocale('tr')
 * is called. It is NOT bundled into the main entry — the bundler code-splits
 * it into a separate chunk.
 *
 * ICU MessageFormat syntax is used for interpolation: {variableName}
 * ICU plural syntax: {count, plural, one {...} other {...}}
 */

import type { LocaleMessages } from './en.js';

const tr: LocaleMessages = {
  "footer": {
    "powered_by": "{brand} tarafından desteklenmektedir",
    "brand_name": "Stellar AppKit"
  },
  "aria": {
    "close_dialog": "Kapat",
    "back": "Geri",
    "copy_address": "Adresi kopyala",
    "click_to_copy": "Adresi kopyalamak için tıklayın",
    "more_options": "Daha fazla seçenek",
    "view_on_explorer": "Gezginde görüntüle"
  },
  "title": {
    "account": "Hesap",
    "choose_account": "Hesap seç",
    "wrong_network": "Yanlış ağ",
    "review_transaction": "İşlemi incele",
    "signing": "İmzalanıyor",
    "connect_wallet": "Cüzdan bağla"
  },
  "wallet_list": {
    "loading": "Cüzdanlar yükleniyor…",
    "empty": "Kayıtlı cüzdan yok. StellarAppKit yapılandırmasına connectors geçirin.",
    "not_installed": "Yüklü değil",
    "install": "Yükle",
    "section_stellar": "Stellar cüzdanları",
    "more_wallets": "Daha fazla cüzdan ({count})",
    "status": {
      "checking": "Kontrol ediliyor…",
      "connecting": "Bağlanıyor…",
      "locked": "Kilitli",
      "unavailable": "Kullanılamaz",
      "installed": "Yüklü",
      "scan_qr": "QR kod tara"
    }
  },
  "connecting": {
    "continue_in_wallet": "{walletName} içinde devam et",
    "accept_request": "Cüzdanında bağlantı isteğini kabul et",
    "error_subtitle": "Bağlantı reddedildi veya başarısız oldu. Tekrar deneyin veya başka bir cüzdan seçin."
  },
  "wc": {
    "scan_with": "{walletName} ile tara",
    "scan_instructions": "Bağlanmak için Hana, Lobstr veya Hot Wallet'ı açın ve bu QR kodunu tarayın.",
    "open_in_wallet": "Cüzdan uygulamasında aç",
    open_failed: "{walletName} açılamadı. Yüklü değilse aşağıdan edinebilirsiniz.",
    "copy_uri": "URI'yi kopyala",
    "copied": "Kopyalandı!",
    "generating_code": "Eşleştirme kodu oluşturuluyor…",
    "qr_failed": "QR oluşturma başarısız. Aşağıdaki kopyala düğmesini kullanın.",
    "copy_pairing_code": "Eşleştirme kodunu kopyala"
  },
  "action": {
    "try_again": "Tekrar dene",
    "cancel": "İptal",
    "sign": "İmzala",
    "approve": "Onayla",
    "switch_wallet": "Cüzdan değiştir",
    "disconnect": "Bağlantıyı kes",
    "connect_wallet": "Cüzdan bağla"
  },
  "browser": {
    "reload": "Yeniden yükle",
    "open_in_browser": "Tarayıcıda aç",
    "copy_link": "Bağlantıyı kopyala"
  },
  "wallet": {
    "fallback_name": "Cüzdan",
    "fallback_your_wallet": "cüzdanınız"
  },
  "account": {
    "default_label": "Hesap"
  },
  "connected": {
    "pending_signatures": "{count, plural, one {# bekleyen imza} other {# bekleyen imza}}",
    "balance_label": "XLM Bakiyesi",
    "balance_unit": "XLM",
    "recent_activity": "Son etkinlik",
    "no_transactions": "Son işlem yok",
    "get_testnet_funds": "Testnet fonları al",
    "funds_requested": "Finansman istendi — bakiye kısa süre içinde güncellenecek"
  },
  "tx": {
    "default_type": "İşlem",
    "default_asset": "XLM",
    "unknown_asset": "BİLİNMEYEN",
    "no_amount": "—"
  },
  "preview": {
    "title": {
      "sign_message": "Mesajı imzala",
      "review_transaction": "İşlemi incele"
    },
    "subtitle": {
      "sign_message": "{walletName} sahibi olduğunuzu kanıtlamak için bu mesajı imzalayın. İptal isteği reddedecektir.",
      "review_transaction": "Aşağıdaki işlem detaylarını inceleyin. {walletName} içinde imzalamaya devam etmek için onaylayın."
    },
    "from_account": "Gönderen {address}",
    "default_app_name": "Uygulama"
  },
  "signing": {
    "continue_in_wallet": "{walletName} içinde devam et",
    "subtitle": "Devam etmek için cüzdanınızda isteği onaylayın",
    "error_title": "İmza reddedildi"
  },
  "siws": {
    "title": "Stellar ile giriş yap",
    "phase": {
      "checking_session": "Oturum kontrol ediliyor…",
      "fetching_nonce": "Güvenli nonce alınıyor…",
      "approve_in_wallet": "{walletName} içinde giriş isteğini onaylayın",
      "verifying": "İmzanız doğrulanıyor…"
    },
    "error_title": "Giriş başarısız",
    "error_default": "Giriş başarısız.",
    "connect_wallet": "Cüzdan bağla",
    "error_generic": "Giriş başarısız. Tekrar deneyin.",
    "error_too_many_attempts": "Çok fazla başarısız deneme ({maxRetries}). Daha sonra tekrar deneyin.",
    "error_verification_failed": "Giriş doğrulaması başarısız.",
    "error_address_mismatch": "Oturum adresi bağlı cüzdanla eşleşmiyor",
    "error_network_mismatch": "Oturum ağı bağlı cüzdanla eşleşmiyor",
    "error_session_expired": "Oturum süresi doldu"
  },
  "network_mismatch": {
    "title": "Yanlış ağ",
    "detail": "Bu cüzdan {actualNetwork} ağında, bu uygulama {expectedNetwork} gerektirir.",
    "detail_fallback": "Bu cüzdan yanlış ağda.",
    "action_hint": "Cüzdanınızda ağı değiştirin, sonra tekrar deneyin."
  },
  "error": {
    "title": "Bir şeyler ters gitti",
    "default_message": "Bilinmeyen hata.",
    "request_timed_out": "İstek zaman aşımına uğradı. Tekrar deneyin."
  }
};

export default tr;
