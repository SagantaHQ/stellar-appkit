/**
 * de locale for Stellar AppKit.
 *
 * Auto-generated from the English locale (./en.ts). All keys match the
 * English locale exactly — only values are translated.
 *
 * This file is lazy-loaded via dynamic import() when setLocale('de')
 * is called. It is NOT bundled into the main entry — the bundler code-splits
 * it into a separate chunk.
 *
 * ICU MessageFormat syntax is used for interpolation: {variableName}
 * ICU plural syntax: {count, plural, one {...} other {...}}
 */

import type { LocaleMessages } from './en.js';

const de: LocaleMessages = {
  "footer": {
    "powered_by": "Betrieben von {brand}",
    "brand_name": "Stellar AppKit"
  },
  "aria": {
    "close_dialog": "Schließen",
    "back": "Zurück",
    "copy_address": "Adresse kopieren",
    "click_to_copy": "Klicken, um die Adresse zu kopieren",
    "more_options": "Weitere Optionen",
    "view_on_explorer": "Im Explorer anzeigen"
  },
  "title": {
    "account": "Konto",
    "choose_account": "Konto wählen",
    "wrong_network": "Falsches Netzwerk",
    "review_transaction": "Transaktion prüfen",
    "signing": "Signieren",
    "connect_wallet": "Wallet verbinden"
  },
  "wallet_list": {
    "loading": "Wallets werden geladen…",
    "empty": "Keine Wallets registriert. Überge connectors in der StellarAppKit-Konfiguration.",
    "not_installed": "Nicht installiert",
    "install": "Installieren",
    "section_stellar": "Stellar-Wallets",
    "more_wallets": "Weitere Wallets ({count})",
    "status": {
      "checking": "Prüfe…",
      "connecting": "Verbinde…",
      "locked": "Gesperrt",
      "unavailable": "Nicht verfügbar",
      "installed": "Installiert",
      "scan_qr": "QR Code scannen"
    }
  },
  "connecting": {
    "continue_in_wallet": "In {walletName} fortfahren",
    "accept_request": "Verbindungsanfrage in der Wallet bestätigen",
    "error_subtitle": "Verbindung abgelehnt oder fehlgeschlagen. Versuche es erneut oder wähle eine andere Wallet."
  },
  "wc": {
    "scan_with": "Mit {walletName} scannen",
    "scan_instructions": "Öffne Hana, Lobstr oder Hot Wallet und scanne diesen QR-Code zum Verbinden.",
    "open_in_wallet": "In Wallet-App öffnen",
    open_failed: "{walletName} konnte nicht geöffnet werden. Falls nicht installiert, hol die App unten.",
    "copy_uri": "URI kopieren",
    "copied": "Kopiert!",
    "generating_code": "Pairing-Code wird generiert…",
    "qr_failed": "QR-Generierung fehlgeschlagen. Verwende die Schaltfläche unten zum Kopieren.",
    "copy_pairing_code": "Kopplungscode kopieren"
  },
  "action": {
    "try_again": "Erneut versuchen",
    "cancel": "Abbrechen",
    "sign": "Signieren",
    "approve": "Genehmigen",
    "switch_wallet": "Wallet wechseln",
    "disconnect": "Trennen",
    "connect_wallet": "Wallet verbinden"
  },
  "browser": {
    "reload": "Neu laden",
    "open_in_browser": "Im Browser öffnen",
    "copy_link": "Link kopieren"
  },
  "wallet": {
    "fallback_name": "Wallet",
    "fallback_your_wallet": "deiner Wallet"
  },
  "account": {
    "default_label": "Konto"
  },
  "connected": {
    "pending_signatures": "{count, plural, one {# ausstehende Signatur} other {# ausstehende Signaturen}}",
    "balance_label": "XLM-Guthaben",
    "balance_unit": "XLM",
    "recent_activity": "Letzte Aktivität",
    "no_transactions": "Keine letzten Transaktionen",
    "get_testnet_funds": "Testnet-Guthaben abrufen",
    "funds_requested": "Finanzierung angefordert — Guthaben wird in Kürze aktualisiert"
  },
  "tx": {
    "default_type": "Transaktion",
    "default_asset": "XLM",
    "unknown_asset": "UNBEKANNT",
    "no_amount": "—"
  },
  "preview": {
    "title": {
      "sign_message": "Nachricht signieren",
      "review_transaction": "Transaktion prüfen"
    },
    "subtitle": {
      "sign_message": "Signiere diese Nachricht, um zu beweisen, dass dir {walletName} gehört. Abbrechen verwirft die Anfrage.",
      "review_transaction": "Überprüfe die Transaktionsdetails unten. Genehmigen, um das Signieren in {walletName} fortzusetzen."
    },
    "from_account": "Von {address}",
    "default_app_name": "App"
  },
  "signing": {
    "continue_in_wallet": "In {walletName} fortfahren",
    "subtitle": "Genehmige die Anfrage in deiner Wallet, um fortzufahren",
    "error_title": "Signierung abgelehnt"
  },
  "siws": {
    "title": "Mit Stellar anmelden",
    "phase": {
      "checking_session": "Sitzung wird geprüft…",
      "fetching_nonce": "Sichere Nonce wird abgerufen…",
      "approve_in_wallet": "Genehmige die Anmeldeanfrage in {walletName}",
      "verifying": "Deine Signatur wird verifiziert…"
    },
    "error_title": "Anmeldung fehlgeschlagen",
    "error_default": "Anmeldung fehlgeschlagen.",
    "connect_wallet": "Wallet verbinden",
    "error_generic": "Anmeldung fehlgeschlagen. Bitte erneut versuchen.",
    "error_too_many_attempts": "Zu viele fehlgeschlagene Versuche ({maxRetries}). Bitte später erneut versuchen.",
    "error_verification_failed": "Anmeldungsverifizierung fehlgeschlagen.",
    "error_address_mismatch": "Sitzungsadresse stimmt nicht mit der verbundenen Wallet überein",
    "error_network_mismatch": "Sitzungsnetzwerk stimmt nicht mit der verbundenen Wallet überein",
    "error_session_expired": "Sitzung ist abgelaufen"
  },
  "network_mismatch": {
    "title": "Falsches Netzwerk",
    "detail": "Diese Wallet ist auf {actualNetwork}, diese App benötigt {expectedNetwork}.",
    "detail_fallback": "Diese Wallet ist im falschen Netzwerk.",
    "action_hint": "Wechsle das Netzwerk in deiner Wallet und versuche es erneut."
  },
  "error": {
    "title": "Etwas ist schiefgelaufen",
    "default_message": "Unbekannter Fehler.",
    "request_timed_out": "Zeitüberschreitung der Anfrage. Bitte erneut versuchen."
  }
};

export default de;
