/**
 * it locale for Stellar AppKit.
 *
 * Auto-generated from the English locale (./en.ts). All keys match the
 * English locale exactly — only values are translated.
 *
 * This file is lazy-loaded via dynamic import() when setLocale('it')
 * is called. It is NOT bundled into the main entry — the bundler code-splits
 * it into a separate chunk.
 *
 * ICU MessageFormat syntax is used for interpolation: {variableName}
 * ICU plural syntax: {count, plural, one {...} other {...}}
 */

import type { LocaleMessages } from './en.js';

const it: LocaleMessages = {
  "footer": {
    "powered_by": "Offerto da {brand}",
    "brand_name": "Stellar AppKit"
  },
  "aria": {
    "close_dialog": "Chiudi",
    "back": "Indietro",
    "copy_address": "Copia indirizzo",
    "click_to_copy": "Clicca per copiare l'indirizzo",
    "more_options": "Altre opzioni",
    "view_on_explorer": "Visualizza nell'explorer"
  },
  "title": {
    "account": "Account",
    "choose_account": "Scegli un account",
    "wrong_network": "Rete errata",
    "review_transaction": "Revisiona transazione",
    "signing": "Firma in corso",
    "connect_wallet": "Connetti un wallet"
  },
  "wallet_list": {
    "loading": "Caricamento wallet…",
    "empty": "Nessun wallet registrato. Passa connectors nella configurazione StellarAppKit.",
    "not_installed": "Non installato",
    "install": "Installa",
    "status": {
      "connecting": "Connessione…",
      "locked": "Bloccato",
      "unavailable": "Non disponibile",
      "installed": "Installato",
      "scan_qr": "Scansiona codice QR"
    }
  },
  "connecting": {
    "continue_in_wallet": "Continua in {walletName}",
    "accept_request": "Accetta la richiesta di connessione nel wallet",
    "error_subtitle": "Connessione rifiutata o fallita. Riprova o scegli un altro wallet."
  },
  "wc": {
    "scan_with": "Scansiona con {walletName}",
    "scan_instructions": "Apri Hana, Lobstr o Hot Wallet e scansiona questo codice QR per connetterti.",
    "open_in_wallet": "Apri nell'app del wallet",
    "copy_uri": "Copia URI",
    "copied": "Copiato!",
    "generating_code": "Generazione del codice di accoppiamento…",
    "qr_failed": "Generazione QR fallita. Usa il pulsante copia qui sotto."
  },
  "action": {
    "try_again": "Riprova",
    "cancel": "Annulla",
    "sign": "Firma",
    "approve": "Approva",
    "switch_wallet": "Cambia wallet",
    "disconnect": "Disconnetti",
    "connect_wallet": "Connetti wallet"
  },
  "wallet": {
    "fallback_name": "Wallet",
    "fallback_your_wallet": "il tuo wallet"
  },
  "account": {
    "default_label": "Account"
  },
  "connected": {
    "pending_signatures": "{count, plural, one {# firma in sospeso} other {# firme in sospeso}}",
    "balance_label": "Saldo XLM",
    "balance_unit": "XLM",
    "recent_activity": "Attività recente",
    "no_transactions": "Nessuna transazione recente",
    "get_testnet_funds": "Ottieni fondi Testnet",
    "funds_requested": "Finanziamento richiesto — il saldo verrà aggiornato a breve"
  },
  "tx": {
    "default_type": "Transazione",
    "default_asset": "XLM",
    "unknown_asset": "SCONOSCIUTO",
    "no_amount": "—"
  },
  "preview": {
    "title": {
      "sign_message": "Firma messaggio",
      "review_transaction": "Revisiona transazione"
    },
    "subtitle": {
      "sign_message": "Firma questo messaggio per dimostrare che possiedi {walletName}. Annulla scarterà la richiesta.",
      "review_transaction": "Revisiona i dettagli della transazione qui sotto. Approva per continuare a firmare in {walletName}."
    },
    "from_account": "Da {address}",
    "default_app_name": "App"
  },
  "signing": {
    "continue_in_wallet": "Continua in {walletName}",
    "subtitle": "Approva la richiesta nel tuo wallet per continuare",
    "error_title": "Firma rifiutata"
  },
  "siws": {
    "title": "Accedi con Stellar",
    "phase": {
      "checking_session": "Verifica sessione…",
      "fetching_nonce": "Recupero nonce sicuro…",
      "approve_in_wallet": "Approva la richiesta di accesso in {walletName}",
      "verifying": "Verifica della tua firma…"
    },
    "error_title": "Accesso fallito",
    "error_default": "Accesso fallito.",
    "connect_wallet": "Connetti wallet",
    "error_generic": "Accesso fallito. Riprova.",
    "error_too_many_attempts": "Troppi tentativi falliti ({maxRetries}). Riprova più tardi.",
    "error_verification_failed": "Verifica dell'accesso fallita.",
    "error_address_mismatch": "L'indirizzo della sessione non corrisponde al wallet connesso",
    "error_network_mismatch": "La rete della sessione non corrisponde al wallet connesso",
    "error_session_expired": "La sessione è scaduta"
  },
  "network_mismatch": {
    "title": "Rete errata",
    "detail": "Questo wallet è su {actualNetwork}, questa app necessita di {expectedNetwork}.",
    "detail_fallback": "Questo wallet è sulla rete sbagliata.",
    "action_hint": "Cambia rete nel tuo wallet, poi riprova."
  },
  "error": {
    "title": "Qualcosa è andato storto",
    "default_message": "Errore sconosciuto.",
    "request_timed_out": "Richiesta scaduta. Riprova."
  }
};

export default it;
