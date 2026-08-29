/**
 * pl locale for Stellar AppKit.
 *
 * Auto-generated from the English locale (./en.ts). All keys match the
 * English locale exactly — only values are translated.
 *
 * This file is lazy-loaded via dynamic import() when setLocale('pl')
 * is called. It is NOT bundled into the main entry — the bundler code-splits
 * it into a separate chunk.
 *
 * ICU MessageFormat syntax is used for interpolation: {variableName}
 * ICU plural syntax: {count, plural, one {...} other {...}}
 */

import type { LocaleMessages } from './en.js';

const pl: LocaleMessages = {
  "footer": {
    "powered_by": "Obsługiwane przez {brand}",
    "brand_name": "Stellar AppKit"
  },
  "aria": {
    "close_dialog": "Zamknij",
    "back": "Wstecz",
    "copy_address": "Kopiuj adres",
    "click_to_copy": "Kliknij, aby skopiować adres",
    "more_options": "Więcej opcji",
    "view_on_explorer": "Zobacz w eksploratorze"
  },
  "title": {
    "account": "Konto",
    "choose_account": "Wybierz konto",
    "wrong_network": "Błędna sieć",
    "review_transaction": "Przejrzyj transakcję",
    "signing": "Podpisywanie",
    "connect_wallet": "Połącz portfel"
  },
  "wallet_list": {
    "loading": "Ładowanie portfeli…",
    "empty": "Brak zarejestrowanych portfeli. Przekaż connectors w konfiguracji StellarAppKit.",
    "not_installed": "Nie zainstalowano",
    "install": "Zainstaluj",
    "status": {
      "connecting": "Łączenie…",
      "locked": "Zablokowany",
      "unavailable": "Niedostępny",
      "installed": "Zainstalowany",
      "scan_qr": "Skanuj kod QR"
    }
  },
  "connecting": {
    "continue_in_wallet": "Kontynuuj w {walletName}",
    "accept_request": "Zaakceptuj żądanie połączenia w portfelu",
    "error_subtitle": "Połączenie odrzucone lub nieudane. Spróbuj ponownie lub wybierz inny portfel."
  },
  "wc": {
    "scan_with": "Skanuj za pomocą {walletName}",
    "scan_instructions": "Otwórz Hana, Lobstr lub Hot Wallet i zeskanuj ten kod QR, aby się połączyć.",
    "open_in_wallet": "Otwórz w aplikacji portfela",
    open_failed: "Nie udało się otworzyć {walletName}. Jeśli nie jest zainstalowany, pobierz go poniżej.",
    "copy_uri": "Kopiuj URI",
    "copied": "Skopiowano!",
    "generating_code": "Generowanie kodu parowania…",
    "qr_failed": "Generowanie QR nie powiodło się. Użyj przycisku kopiowania poniżej."
  },
  "action": {
    "try_again": "Spróbuj ponownie",
    "cancel": "Anuluj",
    "sign": "Podpisz",
    "approve": "Zatwierdź",
    "switch_wallet": "Zmień portfel",
    "disconnect": "Rozłącz",
    "connect_wallet": "Połącz portfel"
  },
  "wallet": {
    "fallback_name": "Portfel",
    "fallback_your_wallet": "twoim portfelu"
  },
  "account": {
    "default_label": "Konto"
  },
  "connected": {
    "pending_signatures": "{count, plural, one {# oczekujący podpis} few {# oczekujące podpisy} many {# oczekujących podpisów} other {# oczekujących podpisów}}",
    "balance_label": "Saldo XLM",
    "balance_unit": "XLM",
    "recent_activity": "Ostatnia aktywność",
    "no_transactions": "Brak ostatnich transakcji",
    "get_testnet_funds": "Pobierz środki Testnet",
    "funds_requested": "Zażądano finansowania — saldo zostanie wkrótce zaktualizowane"
  },
  "tx": {
    "default_type": "Transakcja",
    "default_asset": "XLM",
    "unknown_asset": "NIEZNANY",
    "no_amount": "—"
  },
  "preview": {
    "title": {
      "sign_message": "Podpisz wiadomość",
      "review_transaction": "Przejrzyj transakcję"
    },
    "subtitle": {
      "sign_message": "Podpisz tę wiadomość, aby udowodnić, że jesteś właścicielem {walletName}. Anulowanie odrzuci żądanie.",
      "review_transaction": "Przejrzyj poniżej szczegóły transakcji. Zatwierdź, aby kontynuować podpisywanie w {walletName}."
    },
    "from_account": "Od {address}",
    "default_app_name": "Aplikacja"
  },
  "signing": {
    "continue_in_wallet": "Kontynuuj w {walletName}",
    "subtitle": "Zatwierdź żądanie w portfelu, aby kontynuować",
    "error_title": "Podpis odrzucony"
  },
  "siws": {
    "title": "Zaloguj się przez Stellar",
    "phase": {
      "checking_session": "Sprawdzanie sesji…",
      "fetching_nonce": "Pobieranie bezpiecznego nonce…",
      "approve_in_wallet": "Zatwierdź żądanie logowania w {walletName}",
      "verifying": "Weryfikacja Twojego podpisu…"
    },
    "error_title": "Logowanie nie powiodło się",
    "error_default": "Logowanie nie powiodło się.",
    "connect_wallet": "Połącz portfel",
    "error_generic": "Logowanie nie powiodło się. Spróbuj ponownie.",
    "error_too_many_attempts": "Zbyt wiele nieudanych prób ({maxRetries}). Spróbuj później.",
    "error_verification_failed": "Weryfikacja logowania nie powiodła się.",
    "error_address_mismatch": "Adres sesji nie jest zgodny z połączonym portfelem",
    "error_network_mismatch": "Sieć sesji nie jest zgodna z połączonym portfelem",
    "error_session_expired": "Sesja wygasła"
  },
  "network_mismatch": {
    "title": "Błędna sieć",
    "detail": "Ten portfel jest w sieci {actualNetwork}, ta aplikacja wymaga {expectedNetwork}.",
    "detail_fallback": "Ten portfel jest w złej sieci.",
    "action_hint": "Zmień sieć w portfelu i spróbuj ponownie."
  },
  "error": {
    "title": "Coś poszło nie tak",
    "default_message": "Nieznany błąd.",
    "request_timed_out": "Upłynął limit czasu żądania. Spróbuj ponownie."
  }
};

export default pl;
