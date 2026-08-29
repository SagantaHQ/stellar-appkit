/**
 * nl locale for Stellar AppKit.
 *
 * Auto-generated from the English locale (./en.ts). All keys match the
 * English locale exactly — only values are translated.
 *
 * This file is lazy-loaded via dynamic import() when setLocale('nl')
 * is called. It is NOT bundled into the main entry — the bundler code-splits
 * it into a separate chunk.
 *
 * ICU MessageFormat syntax is used for interpolation: {variableName}
 * ICU plural syntax: {count, plural, one {...} other {...}}
 */

import type { LocaleMessages } from './en.js';

const nl: LocaleMessages = {
  "footer": {
    "powered_by": "Aangedreven door {brand}",
    "brand_name": "Stellar AppKit"
  },
  "aria": {
    "close_dialog": "Sluiten",
    "back": "Terug",
    "copy_address": "Adres kopiëren",
    "click_to_copy": "Klik om het adres te kopiëren",
    "more_options": "Meer opties",
    "view_on_explorer": "Bekijk in verkenner"
  },
  "title": {
    "account": "Account",
    "choose_account": "Kies een account",
    "wrong_network": "Verkeerd netwerk",
    "review_transaction": "Transactie controleren",
    "signing": "Ondertekenen",
    "connect_wallet": "Portemonnee verbinden"
  },
  "wallet_list": {
    "loading": "Portemonnees laden…",
    "empty": "Geen portemonnees geregistreerd. Geef connectors door in de StellarAppKit-configuratie.",
    "not_installed": "Niet geïnstalleerd",
    "install": "Installeren",
    "section_stellar": "Stellar-wallets",
    "more_wallets": "Meer wallets ({count})",
    "status": {
      "connecting": "Verbinden…",
      "locked": "Vergrendeld",
      "unavailable": "Niet beschikbaar",
      "installed": "Geïnstalleerd",
      "scan_qr": "QR Code scannen"
    }
  },
  "connecting": {
    "continue_in_wallet": "Doorgaan in {walletName}",
    "accept_request": "Accepteer de verbindingsaanvraag in de portemonnee",
    "error_subtitle": "Verbinding geweigerd of mislukt. Probeer opnieuw of kies een andere portemonnee."
  },
  "wc": {
    "scan_with": "Scannen met {walletName}",
    "scan_instructions": "Open Hana, Lobstr of Hot Wallet en scan deze QR-code om te verbinden.",
    "open_in_wallet": "Openen in portemonnee-app",
    open_failed: "Kon {walletName} niet openen. Niet geïnstalleerd? Haal de app hieronder.",
    "copy_uri": "URI kopiëren",
    "copied": "Gekopieerd!",
    "generating_code": "Koppelingscode genereren…",
    "qr_failed": "QR-generatie mislukt. Gebruik de kopieerknop hieronder.",
    "copy_pairing_code": "Koppelcode kopiëren"
  },
  "action": {
    "try_again": "Opnieuw proberen",
    "cancel": "Annuleren",
    "sign": "Ondertekenen",
    "approve": "Goedkeuren",
    "switch_wallet": "Portemonnee wisselen",
    "disconnect": "Verbreken",
    "connect_wallet": "Portemonnee verbinden"
  },
  "wallet": {
    "fallback_name": "Portemonnee",
    "fallback_your_wallet": "je portemonnee"
  },
  "account": {
    "default_label": "Account"
  },
  "connected": {
    "pending_signatures": "{count, plural, one {# handtekening in behandeling} other {# handtekeningen in behandeling}}",
    "balance_label": "XLM-saldo",
    "balance_unit": "XLM",
    "recent_activity": "Recente activiteit",
    "no_transactions": "Geen recente transacties",
    "get_testnet_funds": "Testnet-tegoed ophalen",
    "funds_requested": "Financiering aangevraagd — saldo wordt zo bijgewerkt"
  },
  "tx": {
    "default_type": "Transactie",
    "default_asset": "XLM",
    "unknown_asset": "ONBEKEND",
    "no_amount": "—"
  },
  "preview": {
    "title": {
      "sign_message": "Bericht ondertekenen",
      "review_transaction": "Transactie controleren"
    },
    "subtitle": {
      "sign_message": "Onderteken dit bericht om te bewijzen dat je {walletName} bezit. Annuleren wijst de aanvraag af.",
      "review_transaction": "Controleer de transactiedetails hieronder. Keur goed om door te gaan met ondertekenen in {walletName}."
    },
    "from_account": "Van {address}",
    "default_app_name": "App"
  },
  "signing": {
    "continue_in_wallet": "Doorgaan in {walletName}",
    "subtitle": "Keur de aanvraag goed in je portemonnee om door te gaan",
    "error_title": "Ondertekening geweigerd"
  },
  "siws": {
    "title": "Inloggen met Stellar",
    "phase": {
      "checking_session": "Sessie controleren…",
      "fetching_nonce": "Beveiligde nonce ophalen…",
      "approve_in_wallet": "Keur de inlogaanvraag goed in {walletName}",
      "verifying": "Je handtekening verifiëren…"
    },
    "error_title": "Inloggen mislukt",
    "error_default": "Inloggen mislukt.",
    "connect_wallet": "Portemonnee verbinden",
    "error_generic": "Inloggen mislukt. Probeer opnieuw.",
    "error_too_many_attempts": "Te veel mislukte pogingen ({maxRetries}). Probeer later opnieuw.",
    "error_verification_failed": "Inlogverificatie mislukt.",
    "error_address_mismatch": "Sessieadres komt niet overeen met verbonden portemonnee",
    "error_network_mismatch": "Sessienetwerk komt niet overeen met verbonden portemonnee",
    "error_session_expired": "Sessie is verlopen"
  },
  "network_mismatch": {
    "title": "Verkeerd netwerk",
    "detail": "Deze portemonnee staat op {actualNetwork}, deze app heeft {expectedNetwork} nodig.",
    "detail_fallback": "Deze portemonnee staat op het verkeerde netwerk.",
    "action_hint": "Wissel van netwerk in je portemonnee en probeer opnieuw."
  },
  "error": {
    "title": "Er ging iets mis",
    "default_message": "Onbekende fout.",
    "request_timed_out": "Time-out voor aanvraag. Probeer opnieuw."
  }
};

export default nl;
