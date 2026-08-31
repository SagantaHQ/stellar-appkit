/**
 * cs locale for Stellar AppKit.
 *
 * Auto-generated from the English locale (./en.ts). All keys match the
 * English locale exactly — only values are translated.
 *
 * This file is lazy-loaded via dynamic import() when setLocale('cs')
 * is called. It is NOT bundled into the main entry — the bundler code-splits
 * it into a separate chunk.
 *
 * ICU MessageFormat syntax is used for interpolation: {variableName}
 * ICU plural syntax: {count, plural, one {...} other {...}}
 */

import type { LocaleMessages } from './en.js';

const cs: LocaleMessages = {
  "footer": {
    "powered_by": "Běží na {brand}",
    "brand_name": "Stellar AppKit"
  },
  "aria": {
    "close_dialog": "Zavřít",
    "back": "Zpět",
    "copy_address": "Kopírovat adresu",
    "click_to_copy": "Klikněte pro kopírování adresy",
    "more_options": "Více možností",
    "view_on_explorer": "Zobrazit v průzkumníku"
  },
  "title": {
    "account": "Účet",
    "choose_account": "Vyberte účet",
    "wrong_network": "Špatná síť",
    "review_transaction": "Zkontrolovat transakci",
    "signing": "Podepisování",
    "connect_wallet": "Připojit peněženku"
  },
  "wallet_list": {
    "loading": "Načítání peněženek…",
    "empty": "Nejsou registrovány žádné peněženky. Předejte connectors v konfiguraci StellarAppKit.",
    "not_installed": "Nenainstalováno",
    "install": "Nainstalovat",
    "section_stellar": "Peněženky Stellar",
    "more_wallets": "Více peněženek ({count})",
    "status": {
      "checking": "Kontroluji…",
      "connecting": "Připojování…",
      "locked": "Uzamčeno",
      "unavailable": "Nedostupné",
      "installed": "Nainstalováno",
      "scan_qr": "Naskenovat QR kód"
    }
  },
  "connecting": {
    "continue_in_wallet": "Pokračovat v {walletName}",
    "accept_request": "Přijměte žádost o připojení v peněžence",
    "error_subtitle": "Připojení bylo odmítnuto nebo selhalo. Zkuste to znovu nebo vyberte jinou peněženku."
  },
  "wc": {
    "scan_with": "Naskenujte pomocí {walletName}",
    "scan_instructions": "Otevřete Hana, Lobstr nebo Hot Wallet a naskenujte tento QR kód pro připojení.",
    "open_in_wallet": "Otevřít v aplikaci peněženky",
    open_failed: "Nelze otevřít {walletName}. Pokud není nainstalovaná, nainstalujte si ji níže.",
    "copy_uri": "Kopírovat URI",
    "copied": "Zkopírováno!",
    "generating_code": "Generování párovacího kódu…",
    "qr_failed": "Generování QR selhalo. Použijte tlačítko kopírovat níže.",
    "copy_pairing_code": "Zkopírovat párovací kód"
  },
  "action": {
    "try_again": "Zkusit znovu",
    "cancel": "Zrušit",
    "sign": "Podepsat",
    "approve": "Schválit",
    "switch_wallet": "Změnit peněženku",
    "disconnect": "Odpojit",
    "connect_wallet": "Připojit peněženku"
  },
  "browser": {
    "reload": "Znovu načíst",
    "open_in_browser": "Otevřít v prohlížeči",
    "copy_link": "Kopírovat odkaz"
  },
  "wallet": {
    "fallback_name": "Peněženka",
    "fallback_your_wallet": "vaší peněžence"
  },
  "account": {
    "default_label": "Účet"
  },
  "connected": {
    "pending_signatures": "{count, plural, one {# čekající podpis} few {# čekající podpisy} many {# čekajících podpisů} other {# čekajících podpisů}}",
    "balance_label": "Zůstatek XLM",
    "balance_unit": "XLM",
    "recent_activity": "Nedávná aktivita",
    "no_transactions": "Žádné nedávné transakce",
    "get_testnet_funds": "Získat Testnet prostředky",
    "funds_requested": "Financování vyžádáno — zůstatek se brzy aktualizuje"
  },
  "tx": {
    "default_type": "Transakce",
    "default_asset": "XLM",
    "unknown_asset": "NEZNÁMÝ",
    "no_amount": "—"
  },
  "preview": {
    "title": {
      "sign_message": "Podepsat zprávu",
      "review_transaction": "Zkontrolovat transakci"
    },
    "subtitle": {
      "sign_message": "Podepište tuto zprávu, abyste prokázali, že vlastníte {walletName}. Zrušení žádost odmítne.",
      "review_transaction": "Zkontrolujte detaily transakce níže. Schvalte pro pokračování podepisování v {walletName}."
    },
    "from_account": "Od {address}",
    "default_app_name": "Aplikace"
  },
  "signing": {
    "continue_in_wallet": "Pokračovat v {walletName}",
    "subtitle": "Schvalte žádost ve vaší peněžence pro pokračování",
    "error_title": "Podpis odmítnut"
  },
  "siws": {
    "title": "Přihlásit se pomocí Stellar",
    "phase": {
      "checking_session": "Kontrola relace…",
      "fetching_nonce": "Získávání bezpečného nonce…",
      "approve_in_wallet": "Schvalte žádost o přihlášení v {walletName}",
      "verifying": "Ověřování vašeho podpisu…"
    },
    "error_title": "Přihlášení selhalo",
    "error_default": "Přihlášení selhalo.",
    "connect_wallet": "Připojit peněženku",
    "error_generic": "Přihlášení selhalo. Zkuste to znovu.",
    "error_too_many_attempts": "Příliš mnoho neúspěšných pokusů ({maxRetries}). Zkuste to později.",
    "error_verification_failed": "Ověření přihlášení selhalo.",
    "error_address_mismatch": "Adresa relace neodpovídá připojené peněžence",
    "error_network_mismatch": "Síť relace neodpovídá připojené peněžence",
    "error_session_expired": "Relace vypršela"
  },
  "network_mismatch": {
    "title": "Špatná síť",
    "detail": "Tato peněženka je na {actualNetwork}, tato aplikace potřebuje {expectedNetwork}.",
    "detail_fallback": "Tato peněženka je na špatné síti.",
    "action_hint": "Přepněte síť ve vaší peněžence a zkuste to znovu."
  },
  "error": {
    "title": "Něco se pokazilo",
    "default_message": "Neznámá chyba.",
    "request_timed_out": "Vypršel čas žádosti. Zkuste to znovu."
  }
};

export default cs;
