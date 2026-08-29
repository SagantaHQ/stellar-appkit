/**
 * uk locale for Stellar AppKit.
 *
 * Auto-generated from the English locale (./en.ts). All keys match the
 * English locale exactly — only values are translated.
 *
 * This file is lazy-loaded via dynamic import() when setLocale('uk')
 * is called. It is NOT bundled into the main entry — the bundler code-splits
 * it into a separate chunk.
 *
 * ICU MessageFormat syntax is used for interpolation: {variableName}
 * ICU plural syntax: {count, plural, one {...} other {...}}
 */

import type { LocaleMessages } from './en.js';

const uk: LocaleMessages = {
  "footer": {
    "powered_by": "Працює на {brand}",
    "brand_name": "Stellar AppKit"
  },
  "aria": {
    "close_dialog": "Закрити",
    "back": "Назад",
    "copy_address": "Копіювати адресу",
    "click_to_copy": "Натисніть, щоб скопіювати адресу",
    "more_options": "Більше опцій",
    "view_on_explorer": "Переглянути в оглядачі"
  },
  "title": {
    "account": "Обліковий запис",
    "choose_account": "Оберіть обліковий запис",
    "wrong_network": "Неправильна мережа",
    "review_transaction": "Перегляд транзакції",
    "signing": "Підпис",
    "connect_wallet": "Підключити гаманець"
  },
  "wallet_list": {
    "loading": "Завантаження гаманців…",
    "empty": "Немає зареєстрованих гаманців. Передайте connectors у конфігурацію StellarAppKit.",
    "not_installed": "Не встановлено",
    "install": "Встановити",
    "section_stellar": "Гаманці Stellar",
    "more_wallets": "Більше гаманців ({count})",
    "status": {
      "connecting": "Підключення…",
      "locked": "Заблоковано",
      "unavailable": "Недоступний",
      "installed": "Встановлено",
      "scan_qr": "Сканувати QR-код"
    }
  },
  "connecting": {
    "continue_in_wallet": "Продовжити в {walletName}",
    "accept_request": "Прийміть запит на підключення в гаманці",
    "error_subtitle": "Підключення відхилено або не вдалося. Спробуйте знову або оберіть інший гаманець."
  },
  "wc": {
    "scan_with": "Сканувати з {walletName}",
    "scan_instructions": "Відкрийте Hana, Lobstr або Hot Wallet і відскануйте цей QR-код для підключення.",
    "open_in_wallet": "Відкрити в додатку гаманця",
    open_failed: "Не вдалося відкрити {walletName}. Якщо застосунок не встановлено, завантажте його нижче.",
    "copy_uri": "Копіювати URI",
    "copied": "Скопійовано!",
    "generating_code": "Генерування коду зв'язку…",
    "qr_failed": "Не вдалося згенерувати QR. Використовуйте кнопку копіювання нижче.",
    "copy_pairing_code": "Копіювати код зв’язування"
  },
  "action": {
    "try_again": "Спробувати знову",
    "cancel": "Скасувати",
    "sign": "Підписати",
    "approve": "Підтвердити",
    "switch_wallet": "Змінити гаманець",
    "disconnect": "Відключити",
    "connect_wallet": "Підключити гаманець"
  },
  "wallet": {
    "fallback_name": "Гаманець",
    "fallback_your_wallet": "вашому гаманці"
  },
  "account": {
    "default_label": "Обліковий запис"
  },
  "connected": {
    "pending_signatures": "{count, plural, one {# очікуваний підпис} few {# очікуваних підписи} many {# очікуваних підписів} other {# очікуваних підписів}}",
    "balance_label": "Баланс XLM",
    "balance_unit": "XLM",
    "recent_activity": "Остання активність",
    "no_transactions": "Немає останніх транзакцій",
    "get_testnet_funds": "Отримати Testnet-кошти",
    "funds_requested": "Запит надіслано — баланс незабаром оновиться"
  },
  "tx": {
    "default_type": "Транзакція",
    "default_asset": "XLM",
    "unknown_asset": "Невідомо",
    "no_amount": "—"
  },
  "preview": {
    "title": {
      "sign_message": "Підписати повідомлення",
      "review_transaction": "Перегляд транзакції"
    },
    "subtitle": {
      "sign_message": "Підпишіть це повідомлення, щоб довести, що ви володієте {walletName}. Скасування відхилить запит.",
      "review_transaction": "Перегляньте деталі транзакції нижче. Підтвердьте, щоб продовжити підпис у {walletName}."
    },
    "from_account": "Від {address}",
    "default_app_name": "Додаток"
  },
  "signing": {
    "continue_in_wallet": "Продовжити в {walletName}",
    "subtitle": "Підтвердьте запит у гаманці, щоб продовжити",
    "error_title": "Підпис відхилено"
  },
  "siws": {
    "title": "Увійти через Stellar",
    "phase": {
      "checking_session": "Перевірка сесії…",
      "fetching_nonce": "Отримання безпечного nonce…",
      "approve_in_wallet": "Підтвердьте запит на вхід у {walletName}",
      "verifying": "Перевірка вашого підпису…"
    },
    "error_title": "Помилка входу",
    "error_default": "Помилка входу.",
    "connect_wallet": "Підключити гаманець",
    "error_generic": "Помилка входу. Спробуйте знову.",
    "error_too_many_attempts": "Занадто багато невдалих спроб ({maxRetries}). Спробуйте пізніше.",
    "error_verification_failed": "Перевірка входу не вдалася.",
    "error_address_mismatch": "Адреса сесії не збігається з підключеним гаманцем",
    "error_network_mismatch": "Мережа сесії не збігається з підключеним гаманцем",
    "error_session_expired": "Сесія закінчилася"
  },
  "network_mismatch": {
    "title": "Неправильна мережа",
    "detail": "Цей гаманець у мережі {actualNetwork}, цій програмі потрібна {expectedNetwork}.",
    "detail_fallback": "Цей гаманець у неправильній мережі.",
    "action_hint": "Перемкніть мережу у гаманці та спробуйте знову."
  },
  "error": {
    "title": "Щось пішло не так",
    "default_message": "Невідома помилка.",
    "request_timed_out": "Час запиту вичерпано. Спробуйте знову."
  }
};

export default uk;
