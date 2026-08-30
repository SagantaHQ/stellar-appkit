/**
 * ro locale for Stellar AppKit.
 *
 * Auto-generated from the English locale (./en.ts). All keys match the
 * English locale exactly — only values are translated.
 *
 * This file is lazy-loaded via dynamic import() when setLocale('ro')
 * is called. It is NOT bundled into the main entry — the bundler code-splits
 * it into a separate chunk.
 *
 * ICU MessageFormat syntax is used for interpolation: {variableName}
 * ICU plural syntax: {count, plural, one {...} other {...}}
 */

import type { LocaleMessages } from './en.js';

const ro: LocaleMessages = {
  "footer": {
    "powered_by": "Susținut de {brand}",
    "brand_name": "Stellar AppKit"
  },
  "aria": {
    "close_dialog": "Închide",
    "back": "Înapoi",
    "copy_address": "Copiază adresa",
    "click_to_copy": "Click pentru a copia adresa",
    "more_options": "Mai multe opțiuni",
    "view_on_explorer": "Vezi în explorer"
  },
  "title": {
    "account": "Cont",
    "choose_account": "Alege un cont",
    "wrong_network": "Rețea greșită",
    "review_transaction": "Revizuiește tranzacția",
    "signing": "Semnare",
    "connect_wallet": "Conectează un portofel"
  },
  "wallet_list": {
    "loading": "Se încarcă portofelele…",
    "empty": "Nu sunt portofele înregistrate. Trimite connectors în configurația StellarAppKit.",
    "not_installed": "Neinstalat",
    "install": "Instalează",
    "section_stellar": "Portofele Stellar",
    "more_wallets": "Mai multe portofele ({count})",
    "status": {
      "connecting": "Se conectează…",
      "locked": "Blocat",
      "unavailable": "Indisponibil",
      "installed": "Instalat",
      "scan_qr": "Scanează codul QR"
    }
  },
  "connecting": {
    "continue_in_wallet": "Continuă în {walletName}",
    "accept_request": "Acceptă cererea de conectare în portofel",
    "error_subtitle": "Conexiune respinsă sau eșuată. Încearcă din nou sau alege alt portofel."
  },
  "wc": {
    "scan_with": "Scanează cu {walletName}",
    "scan_instructions": "Deschide Hana, Lobstr sau Hot Wallet și scanează acest cod QR pentru a te conecta.",
    "open_in_wallet": "Deschide în aplicația portofelului",
    open_failed: "Nu s-a putut deschide {walletName}. Dacă nu este instalat, descarcă-l mai jos.",
    "copy_uri": "Copiază URI",
    "copied": "Copiat!",
    "generating_code": "Se generează codul de asociere…",
    "qr_failed": "Generarea QR a eșuat. Folosește butonul de copiere de mai jos.",
    "copy_pairing_code": "Copiază codul de asociere"
  },
  "action": {
    "try_again": "Încearcă din nou",
    "cancel": "Anulează",
    "sign": "Semnează",
    "approve": "Aprobă",
    "switch_wallet": "Schimbă portofelul",
    "disconnect": "Deconectează",
    "connect_wallet": "Conectează portofel"
  },
  "browser": {
    "reload": "Reîncarcă",
    "open_in_browser": "Deschide în browser",
    "copy_link": "Copiază linkul"
  },
  "wallet": {
    "fallback_name": "Portofel",
    "fallback_your_wallet": "portofelul tău"
  },
  "account": {
    "default_label": "Cont"
  },
  "connected": {
    "pending_signatures": "{count, plural, one {# semnătură în așteptare} few {# semnături în așteptare} other {# semnături în așteptare}}",
    "balance_label": "Sold XLM",
    "balance_unit": "XLM",
    "recent_activity": "Activitate recentă",
    "no_transactions": "Nicio tranzacție recentă",
    "get_testnet_funds": "Obține fonduri Testnet",
    "funds_requested": "Finanțare solicitată — soldul va fi actualizat în scurt timp"
  },
  "tx": {
    "default_type": "Tranzacție",
    "default_asset": "XLM",
    "unknown_asset": "NECUNOSCUT",
    "no_amount": "—"
  },
  "preview": {
    "title": {
      "sign_message": "Semnează mesajul",
      "review_transaction": "Revizuiește tranzacția"
    },
    "subtitle": {
      "sign_message": "Semnează acest mesaj pentru a demonstra că deții {walletName}. Anularea va respinge cererea.",
      "review_transaction": "Revizuiește detaliile tranzacției de mai jos. Aprobă pentru a continua semnarea în {walletName}."
    },
    "from_account": "De la {address}",
    "default_app_name": "Aplicație"
  },
  "signing": {
    "continue_in_wallet": "Continuă în {walletName}",
    "subtitle": "Aprobă cererea în portofelul tău pentru a continua",
    "error_title": "Semnătură respinsă"
  },
  "siws": {
    "title": "Conectează-te cu Stellar",
    "phase": {
      "checking_session": "Se verifică sesiunea…",
      "fetching_nonce": "Se obține nonce securizat…",
      "approve_in_wallet": "Aprobă cererea de autentificare în {walletName}",
      "verifying": "Se verifică semnătura ta…"
    },
    "error_title": "Autentificare eșuată",
    "error_default": "Autentificare eșuată.",
    "connect_wallet": "Conectează portofel",
    "error_generic": "Autentificare eșuată. Încearcă din nou.",
    "error_too_many_attempts": "Prea multe încercări eșuate ({maxRetries}). Încearcă mai târziu.",
    "error_verification_failed": "Verificarea autentificării a eșuat.",
    "error_address_mismatch": "Adresa sesiunii nu corespunde cu portofelul conectat",
    "error_network_mismatch": "Rețeaua sesiunii nu corespunde cu portofelul conectat",
    "error_session_expired": "Sesiunea a expirat"
  },
  "network_mismatch": {
    "title": "Rețea greșită",
    "detail": "Acest portofel este pe {actualNetwork}, această aplicație are nevoie de {expectedNetwork}.",
    "detail_fallback": "Acest portofel este pe rețeaua greșită.",
    "action_hint": "Schimbă rețeaua în portofelul tău, apoi încearcă din nou."
  },
  "error": {
    "title": "Ceva a mers greșit",
    "default_message": "Eroare necunoscută.",
    "request_timed_out": "Timpul cererii a expirat. Încearcă din nou."
  }
};

export default ro;
