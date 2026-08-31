/**
 * pt-BR locale for Stellar AppKit.
 *
 * Auto-generated from the English locale (./en.ts). All keys match the
 * English locale exactly — only values are translated.
 *
 * This file is lazy-loaded via dynamic import() when setLocale('pt-BR')
 * is called. It is NOT bundled into the main entry — the bundler code-splits
 * it into a separate chunk.
 *
 * ICU MessageFormat syntax is used for interpolation: {variableName}
 * ICU plural syntax: {count, plural, one {...} other {...}}
 */

import type { LocaleMessages } from './en.js';

const pt_BR: LocaleMessages = {
  "footer": {
    "powered_by": "Desenvolvido por {brand}",
    "brand_name": "Stellar AppKit"
  },
  "aria": {
    "close_dialog": "Fechar",
    "back": "Voltar",
    "copy_address": "Copiar endereço",
    "click_to_copy": "Clique para copiar o endereço",
    "more_options": "Mais opções",
    "view_on_explorer": "Ver no explorador"
  },
  "title": {
    "account": "Conta",
    "choose_account": "Escolha uma conta",
    "wrong_network": "Rede incorreta",
    "review_transaction": "Revisar transação",
    "signing": "Assinando",
    "connect_wallet": "Conectar uma carteira"
  },
  "wallet_list": {
    "loading": "Carregando carteiras…",
    "empty": "Nenhuma carteira registrada. Passe connectors na configuração do StellarAppKit.",
    "not_installed": "Não instalado",
    "install": "Instalar",
    "section_stellar": "Carteiras Stellar",
    "more_wallets": "Mais carteiras ({count})",
    "status": {
      "checking": "Verificando…",
      "connecting": "Conectando…",
      "locked": "Bloqueada",
      "unavailable": "Indisponível",
      "installed": "Instalada",
      "scan_qr": "Escanear QR Code"
    }
  },
  "connecting": {
    "continue_in_wallet": "Continuar em {walletName}",
    "accept_request": "Aceite a solicitação de conexão na carteira",
    "error_subtitle": "Conexão recusada ou falhou. Tente novamente ou escolha outra carteira."
  },
  "wc": {
    "scan_with": "Escaneie com {walletName}",
    "scan_instructions": "Abra Hana, Lobstr ou Hot Wallet e escaneie este QR code para conectar.",
    "open_in_wallet": "Abrir no app da carteira",
    open_failed: "Não foi possível abrir o {walletName}. Se não estiver instalado, obtenha-o abaixo.",
    "copy_uri": "Copiar URI",
    "copied": "Copiado!",
    "generating_code": "Gerando código de pareamento…",
    "qr_failed": "Falha ao gerar QR. Use o botão de copiar abaixo.",
    "copy_pairing_code": "Copiar código de pareamento"
  },
  "action": {
    "try_again": "Tentar novamente",
    "cancel": "Cancelar",
    "sign": "Assinar",
    "approve": "Aprovar",
    "switch_wallet": "Trocar carteira",
    "disconnect": "Desconectar",
    "connect_wallet": "Conectar carteira"
  },
  "browser": {
    "reload": "Recarregar",
    "open_in_browser": "Abrir no navegador",
    "copy_link": "Copiar link"
  },
  "wallet": {
    "fallback_name": "Carteira",
    "fallback_your_wallet": "sua carteira"
  },
  "account": {
    "default_label": "Conta"
  },
  "connected": {
    "pending_signatures": "{count, plural, one {# assinatura pendente} other {# assinaturas pendentes}}",
    "balance_label": "Saldo XLM",
    "balance_unit": "XLM",
    "recent_activity": "Atividade recente",
    "no_transactions": "Sem transações recentes",
    "get_testnet_funds": "Obter fundos de Testnet",
    "funds_requested": "Financiamento solicitado — o saldo será atualizado em breve"
  },
  "tx": {
    "default_type": "Transação",
    "default_asset": "XLM",
    "unknown_asset": "DESCONHECIDO",
    "no_amount": "—"
  },
  "preview": {
    "title": {
      "sign_message": "Assinar mensagem",
      "review_transaction": "Revisar transação"
    },
    "subtitle": {
      "sign_message": "Assine esta mensagem para provar que você é dono de {walletName}. Cancelar descartará a solicitação.",
      "review_transaction": "Revise os detalhes da transação abaixo. Aprove para continuar assinando em {walletName}."
    },
    "from_account": "De {address}",
    "default_app_name": "App"
  },
  "signing": {
    "continue_in_wallet": "Continuar em {walletName}",
    "subtitle": "Aprove a solicitação na sua carteira para continuar",
    "error_title": "Assinatura rejeitada"
  },
  "siws": {
    "title": "Entrar com Stellar",
    "phase": {
      "checking_session": "Verificando sessão…",
      "fetching_nonce": "Obtendo nonce seguro…",
      "approve_in_wallet": "Aprove a solicitação de entrada em {walletName}",
      "verifying": "Verificando sua assinatura…"
    },
    "error_title": "Falha no login",
    "error_default": "Falha no login.",
    "connect_wallet": "Conectar carteira",
    "error_generic": "Falha no login. Tente novamente.",
    "error_too_many_attempts": "Muitas tentativas falhadas ({maxRetries}). Tente novamente mais tarde.",
    "error_verification_failed": "Verificação de login falhou.",
    "error_address_mismatch": "Endereço da sessão não corresponde à carteira conectada",
    "error_network_mismatch": "Rede da sessão não corresponde à carteira conectada",
    "error_session_expired": "A sessão expirou"
  },
  "network_mismatch": {
    "title": "Rede incorreta",
    "detail": "Esta carteira está na {actualNetwork}, este app precisa da {expectedNetwork}.",
    "detail_fallback": "Esta carteira está na rede incorreta.",
    "action_hint": "Troque de rede na sua carteira e tente novamente."
  },
  "error": {
    "title": "Algo deu errado",
    "default_message": "Erro desconhecido.",
    "request_timed_out": "A solicitação expirou. Tente novamente."
  }
};

export default pt_BR;
