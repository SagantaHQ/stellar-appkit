/**
 * sv locale for Stellar AppKit.
 *
 * Auto-generated from the English locale (./en.ts). All keys match the
 * English locale exactly — only values are translated.
 *
 * This file is lazy-loaded via dynamic import() when setLocale('sv')
 * is called. It is NOT bundled into the main entry — the bundler code-splits
 * it into a separate chunk.
 *
 * ICU MessageFormat syntax is used for interpolation: {variableName}
 * ICU plural syntax: {count, plural, one {...} other {...}}
 */

import type { LocaleMessages } from './en.js';

const sv: LocaleMessages = {
  "footer": {
    "powered_by": "Drivs av {brand}",
    "brand_name": "Stellar AppKit"
  },
  "aria": {
    "close_dialog": "Stäng",
    "back": "Tillbaka",
    "copy_address": "Kopiera adress",
    "click_to_copy": "Klicka för att kopiera adressen",
    "more_options": "Fler alternativ",
    "view_on_explorer": "Visa i utforskaren"
  },
  "title": {
    "account": "Konto",
    "choose_account": "Välj ett konto",
    "wrong_network": "Fel nätverk",
    "review_transaction": "Granska transaktion",
    "signing": "Signerar",
    "connect_wallet": "Anslut plånbok"
  },
  "wallet_list": {
    "loading": "Laddar plånböcker…",
    "empty": "Inga plånböcker registrerade. Skicka connectors i StellarAppKit-konfigurationen.",
    "not_installed": "Inte installerad",
    "install": "Installera",
    "status": {
      "connecting": "Ansluter…",
      "locked": "Låst",
      "unavailable": "Otillgänglig",
      "installed": "Installerad",
      "scan_qr": "Skanna QR-kod"
    }
  },
  "connecting": {
    "continue_in_wallet": "Fortsätt i {walletName}",
    "accept_request": "Acceptera anslutningsbegäran i plånboken",
    "error_subtitle": "Anslutning nekad eller misslyckad. Försök igen eller välj en annan plånbok."
  },
  "wc": {
    "scan_with": "Skanna med {walletName}",
    "scan_instructions": "Öppna Hana, Lobstr eller Hot Wallet och skanna denna QR-kod för att ansluta.",
    "open_in_wallet": "Öppna i plånboksapp",
    open_failed: "Kunde inte öppna {walletName}. Om den inte är installerad, hämta appen nedan.",
    "copy_uri": "Kopiera URI",
    "copied": "Kopierad!",
    "generating_code": "Genererar parningskod…",
    "qr_failed": "QR-generering misslyckades. Använd kopieringsknappen nedan."
  },
  "action": {
    "try_again": "Försök igen",
    "cancel": "Avbryt",
    "sign": "Signera",
    "approve": "Godkänn",
    "switch_wallet": "Byt plånbok",
    "disconnect": "Koppla från",
    "connect_wallet": "Anslut plånbok"
  },
  "wallet": {
    "fallback_name": "Plånbok",
    "fallback_your_wallet": "din plånbok"
  },
  "account": {
    "default_label": "Konto"
  },
  "connected": {
    "pending_signatures": "{count, plural, one {# väntande signatur} other {# väntande signaturer}}",
    "balance_label": "XLM-saldo",
    "balance_unit": "XLM",
    "recent_activity": "Senaste aktivitet",
    "no_transactions": "Inga senaste transaktioner",
    "get_testnet_funds": "Hämta Testnet-medel",
    "funds_requested": "Finansiering begärd — saldot uppdateras strax"
  },
  "tx": {
    "default_type": "Transaktion",
    "default_asset": "XLM",
    "unknown_asset": "OKÄND",
    "no_amount": "—"
  },
  "preview": {
    "title": {
      "sign_message": "Signera meddelande",
      "review_transaction": "Granska transaktion"
    },
    "subtitle": {
      "sign_message": "Signera detta meddelande för att bevisa att du äger {walletName}. Avbryt avvisar begäran.",
      "review_transaction": "Granska transaktionsdetaljerna nedan. Godkänn för att fortsätta signera i {walletName}."
    },
    "from_account": "Från {address}",
    "default_app_name": "App"
  },
  "signing": {
    "continue_in_wallet": "Fortsätt i {walletName}",
    "subtitle": "Godkänn begäran i din plånbok för att fortsätta",
    "error_title": "Signering avvisad"
  },
  "siws": {
    "title": "Logga in med Stellar",
    "phase": {
      "checking_session": "Kontrollerar session…",
      "fetching_nonce": "Hämtar säker nonce…",
      "approve_in_wallet": "Godkänn inloggningsbegäran i {walletName}",
      "verifying": "Verifierar din signatur…"
    },
    "error_title": "Inloggning misslyckades",
    "error_default": "Inloggning misslyckades.",
    "connect_wallet": "Anslut plånbok",
    "error_generic": "Inloggning misslyckades. Försök igen.",
    "error_too_many_attempts": "För många misslyckade försök ({maxRetries}). Försök igen senare.",
    "error_verification_failed": "Verifiering av inloggning misslyckades.",
    "error_address_mismatch": "Sessionens adress matchar inte den anslutna plånboken",
    "error_network_mismatch": "Sessionens nätverk matchar inte den anslutna plånboken",
    "error_session_expired": "Sessionen har löpt ut"
  },
  "network_mismatch": {
    "title": "Fel nätverk",
    "detail": "Denna plånbok är på {actualNetwork}, denna app behöver {expectedNetwork}.",
    "detail_fallback": "Denna plånbok är på fel nätverk.",
    "action_hint": "Byt nätverk i din plånbok och försök igen."
  },
  "error": {
    "title": "Något gick fel",
    "default_message": "Okänt fel.",
    "request_timed_out": "Begäran tog för lång tid. Försök igen."
  }
};

export default sv;
