/**
 * ru locale for Stellar AppKit.
 *
 * Auto-generated from the English locale (./en.ts). All keys match the
 * English locale exactly — only values are translated.
 *
 * This file is lazy-loaded via dynamic import() when setLocale('ru')
 * is called. It is NOT bundled into the main entry — the bundler code-splits
 * it into a separate chunk.
 *
 * ICU MessageFormat syntax is used for interpolation: {variableName}
 * ICU plural syntax: {count, plural, one {...} other {...}}
 */

import type { LocaleMessages } from './en.js';

const ru: LocaleMessages = {
  "footer": {
    "powered_by": "Работает на {brand}",
    "brand_name": "Stellar AppKit"
  },
  "aria": {
    "close_dialog": "Закрыть",
    "back": "Назад",
    "copy_address": "Копировать адрес",
    "click_to_copy": "Нажмите, чтобы скопировать адрес",
    "more_options": "Дополнительные параметры",
    "view_on_explorer": "Посмотреть в обозревателе"
  },
  "title": {
    "account": "Аккаунт",
    "choose_account": "Выберите аккаунт",
    "wrong_network": "Неверная сеть",
    "review_transaction": "Проверка транзакции",
    "signing": "Подпись",
    "connect_wallet": "Подключить кошелёк"
  },
  "wallet_list": {
    "loading": "Загрузка кошельков…",
    "empty": "Нет зарегистрированных кошельков. Передайте connectors в конфигурацию StellarAppKit.",
    "not_installed": "Не установлен",
    "install": "Установить",
    "section_stellar": "Кошельки Stellar",
    "more_wallets": "Больше кошельков ({count})",
    "status": {
      "checking": "Проверка…",
      "connecting": "Подключение…",
      "locked": "Заблокирован",
      "unavailable": "Недоступен",
      "installed": "Установлен",
      "scan_qr": "Сканировать QR-код"
    }
  },
  "connecting": {
    "continue_in_wallet": "Продолжить в {walletName}",
    "accept_request": "Примите запрос на подключение в кошельке",
    "error_subtitle": "Подключение отклонено или не удалось. Попробуйте снова или выберите другой кошелёк."
  },
  "wc": {
    "scan_with": "Сканировать с {walletName}",
    "scan_instructions": "Откройте Hana, Lobstr или Hot Wallet и отсканируйте этот QR-код для подключения.",
    "open_in_wallet": "Открыть в приложении кошелька",
    open_failed: "Не удалось открыть {walletName}. Если приложение не установлено, скачайте его ниже.",
    "copy_uri": "Копировать URI",
    "copied": "Скопировано!",
    "generating_code": "Генерация кода связывания…",
    "qr_failed": "Ошибка генерации QR. Используйте кнопку копирования ниже.",
    "copy_pairing_code": "Копировать код сопряжения"
  },
  "action": {
    "try_again": "Повторить",
    "cancel": "Отмена",
    "sign": "Подписать",
    "approve": "Подтвердить",
    "switch_wallet": "Сменить кошелёк",
    "disconnect": "Отключить",
    "connect_wallet": "Подключить кошелёк"
  },
  "browser": {
    "reload": "Обновить",
    "open_in_browser": "Открыть в браузере",
    "copy_link": "Копировать ссылку"
  },
  "wallet": {
    "fallback_name": "Кошелёк",
    "fallback_your_wallet": "вашем кошельке"
  },
  "account": {
    "default_label": "Аккаунт"
  },
  "connected": {
    "pending_signatures": "{count, plural, one {# ожидающая подпись} few {# ожидающие подписи} other {# ожидающих подписей}}",
    "balance_label": "Баланс XLM",
    "balance_unit": "XLM",
    "recent_activity": "Недавняя активность",
    "no_transactions": "Нет недавних транзакций",
    "get_testnet_funds": "Получить Testnet-средства",
    "funds_requested": "Запрос отправлен — баланс скоро обновится"
  },
  "tx": {
    "default_type": "Транзакция",
    "default_asset": "XLM",
    "unknown_asset": "НЕИЗВЕСТНО",
    "no_amount": "—"
  },
  "preview": {
    "title": {
      "sign_message": "Подписать сообщение",
      "review_transaction": "Проверка транзакции"
    },
    "subtitle": {
      "sign_message": "Подпишите это сообщение, чтобы подтвердить владение {walletName}. Отмена отклонит запрос.",
      "review_transaction": "Проверьте детали транзакции ниже. Подтвердите, чтобы продолжить подпись в {walletName}."
    },
    "from_account": "От {address}",
    "default_app_name": "Приложение"
  },
  "signing": {
    "continue_in_wallet": "Продолжить в {walletName}",
    "subtitle": "Подтвердите запрос в кошельке, чтобы продолжить",
    "error_title": "Подпись отклонена"
  },
  "siws": {
    "title": "Войти через Stellar",
    "phase": {
      "checking_session": "Проверка сессии…",
      "fetching_nonce": "Получение безопасного nonce…",
      "approve_in_wallet": "Подтвердите запрос на вход в {walletName}",
      "verifying": "Проверка вашей подписи…"
    },
    "error_title": "Ошибка входа",
    "error_default": "Ошибка входа.",
    "connect_wallet": "Подключить кошелёк",
    "error_generic": "Ошибка входа. Попробуйте снова.",
    "error_too_many_attempts": "Слишком много неудачных попыток ({maxRetries}). Попробуйте позже.",
    "error_verification_failed": "Проверка входа не удалась.",
    "error_address_mismatch": "Адрес сессии не совпадает с подключённым кошельком",
    "error_network_mismatch": "Сеть сессии не совпадает с подключённым кошельком",
    "error_session_expired": "Сессия истекла"
  },
  "network_mismatch": {
    "title": "Неверная сеть",
    "detail": "Этот кошелёк в сети {actualNetwork}, этому приложению нужна {expectedNetwork}.",
    "detail_fallback": "Этот кошелёк в неправильной сети.",
    "action_hint": "Переключите сеть в кошельке и попробуйте снова."
  },
  "error": {
    "title": "Что-то пошло не так",
    "default_message": "Неизвестная ошибка.",
    "request_timed_out": "Время запроса истекло. Попробуйте снова."
  }
};

export default ru;
