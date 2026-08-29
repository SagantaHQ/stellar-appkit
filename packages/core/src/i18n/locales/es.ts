/**
 * es locale for Stellar AppKit.
 *
 * Auto-generated from the English locale (./en.ts). All keys match the
 * English locale exactly — only values are translated.
 *
 * This file is lazy-loaded via dynamic import() when setLocale('es')
 * is called. It is NOT bundled into the main entry — the bundler code-splits
 * it into a separate chunk.
 *
 * ICU MessageFormat syntax is used for interpolation: {variableName}
 * ICU plural syntax: {count, plural, one {...} other {...}}
 */

import type { LocaleMessages } from './en.js';

const es: LocaleMessages = {
  "footer": {
    "powered_by": "Desarrollado por {brand}",
    "brand_name": "Stellar AppKit"
  },
  "aria": {
    "close_dialog": "Cerrar",
    "back": "Atrás",
    "copy_address": "Copiar dirección",
    "click_to_copy": "Haz clic para copiar la dirección",
    "more_options": "Más opciones",
    "view_on_explorer": "Ver en el explorador"
  },
  "title": {
    "account": "Cuenta",
    "choose_account": "Elige una cuenta",
    "wrong_network": "Red incorrecta",
    "review_transaction": "Revisar transacción",
    "signing": "Firmando",
    "connect_wallet": "Conectar una billetera"
  },
  "wallet_list": {
    "loading": "Cargando billeteras…",
    "empty": "No hay billeteras registradas. Pasa connectors en la configuración de StellarAppKit.",
    "not_installed": "No instalado",
    "install": "Instalar",
    "section_stellar": "Billeteras de Stellar",
    "more_wallets": "Más billeteras ({count})",
    "status": {
      "connecting": "Conectando…",
      "locked": "Bloqueada",
      "unavailable": "No disponible",
      "installed": "Instalada",
      "scan_qr": "Escanear código QR"
    }
  },
  "connecting": {
    "continue_in_wallet": "Continuar en {walletName}",
    "accept_request": "Acepta la solicitud de conexión en la billetera",
    "error_subtitle": "Conexión rechazada o fallida. Inténtalo de nuevo o elige otra billetera."
  },
  "wc": {
    "scan_with": "Escanea con {walletName}",
    "scan_instructions": "Abre Hana, Lobstr o Hot Wallet y escanea este código QR para conectar.",
    "open_in_wallet": "Abrir en la app de billetera",
    open_failed: "No se pudo abrir {walletName}. Si no está instalada, consíguela abajo.",
    "copy_uri": "Copiar URI",
    "copied": "¡Copiado!",
    "generating_code": "Generando código de emparejamiento…",
    "qr_failed": "Error al generar el QR. Usa el botón de copiar de abajo.",
    "copy_pairing_code": "Copiar código de emparejamiento"
  },
  "action": {
    "try_again": "Reintentar",
    "cancel": "Cancelar",
    "sign": "Firmar",
    "approve": "Aprobar",
    "switch_wallet": "Cambiar billetera",
    "disconnect": "Desconectar",
    "connect_wallet": "Conectar billetera"
  },
  "wallet": {
    "fallback_name": "Billetera",
    "fallback_your_wallet": "tu billetera"
  },
  "account": {
    "default_label": "Cuenta"
  },
  "connected": {
    "pending_signatures": "{count, plural, one {# firma pendiente} other {# firmas pendientes}}",
    "balance_label": "Saldo XLM",
    "balance_unit": "XLM",
    "recent_activity": "Actividad reciente",
    "no_transactions": "Sin transacciones recientes",
    "get_testnet_funds": "Obtener fondos de Testnet",
    "funds_requested": "Financiación solicitada — el saldo se actualizará en breve"
  },
  "tx": {
    "default_type": "Transacción",
    "default_asset": "XLM",
    "unknown_asset": "DESCONOCIDO",
    "no_amount": "—"
  },
  "preview": {
    "title": {
      "sign_message": "Firmar mensaje",
      "review_transaction": "Revisar transacción"
    },
    "subtitle": {
      "sign_message": "Firma este mensaje para demostrar que eres el propietario de {walletName}. Cancelar descartará la solicitud.",
      "review_transaction": "Revisa los detalles de la transacción a continuación. Aprueba para continuar firmando en {walletName}."
    },
    "from_account": "Desde {address}",
    "default_app_name": "App"
  },
  "signing": {
    "continue_in_wallet": "Continuar en {walletName}",
    "subtitle": "Aprueba la solicitud en tu billetera para continuar",
    "error_title": "Firma rechazada"
  },
  "siws": {
    "title": "Iniciar sesión con Stellar",
    "phase": {
      "checking_session": "Verificando sesión…",
      "fetching_nonce": "Obteniendo nonce seguro…",
      "approve_in_wallet": "Aprueba la solicitud de inicio de sesión en {walletName}",
      "verifying": "Verificando tu firma…"
    },
    "error_title": "Error de inicio de sesión",
    "error_default": "Error de inicio de sesión.",
    "connect_wallet": "Conectar billetera",
    "error_generic": "Error de inicio de sesión. Inténtalo de nuevo.",
    "error_too_many_attempts": "Demasiados intentos fallidos ({maxRetries}). Inténtalo más tarde.",
    "error_verification_failed": "Verificación de inicio de sesión fallida.",
    "error_address_mismatch": "La dirección de la sesión no coincide con la billetera conectada",
    "error_network_mismatch": "La red de la sesión no coincide con la billetera conectada",
    "error_session_expired": "La sesión ha expirado"
  },
  "network_mismatch": {
    "title": "Red incorrecta",
    "detail": "Esta billetera está en {actualNetwork}, esta app necesita {expectedNetwork}.",
    "detail_fallback": "Esta billetera está en la red incorrecta.",
    "action_hint": "Cambia de red en tu billetera e inténtalo de nuevo."
  },
  "error": {
    "title": "Algo salió mal",
    "default_message": "Error desconocido.",
    "request_timed_out": "La solicitud tardó demasiado. Inténtalo de nuevo."
  }
};

export default es;
