/**
 * ko locale for Stellar AppKit.
 *
 * Auto-generated from the English locale (./en.ts). All keys match the
 * English locale exactly — only values are translated.
 *
 * This file is lazy-loaded via dynamic import() when setLocale('ko')
 * is called. It is NOT bundled into the main entry — the bundler code-splits
 * it into a separate chunk.
 *
 * ICU MessageFormat syntax is used for interpolation: {variableName}
 * ICU plural syntax: {count, plural, one {...} other {...}}
 */

import type { LocaleMessages } from './en.js';

const ko: LocaleMessages = {
  "footer": {
    "powered_by": "Powered by {brand}",
    "brand_name": "Stellar AppKit"
  },
  "aria": {
    "close_dialog": "닫기",
    "back": "뒤로",
    "copy_address": "주소 복사",
    "click_to_copy": "클릭하여 주소 복사",
    "more_options": "더 보기",
    "view_on_explorer": "익스플로러에서 보기"
  },
  "title": {
    "account": "계정",
    "choose_account": "계정 선택",
    "wrong_network": "잘못된 네트워크",
    "review_transaction": "트랜잭션 검토",
    "signing": "서명 중",
    "connect_wallet": "지갑 연결"
  },
  "wallet_list": {
    "loading": "지갑을 불러오는 중…",
    "empty": "등록된 지갑이 없습니다. StellarAppKit 설정에 connectors를 전달하세요.",
    "not_installed": "설치되지 않음",
    "install": "설치",
    "section_stellar": "Stellar 지갑",
    "more_wallets": "더 많은 지갑 ({count})",
    "status": {
      "checking": "확인 중…",
      "connecting": "연결 중…",
      "locked": "잠김",
      "unavailable": "사용 불가",
      "installed": "설치됨",
      "scan_qr": "QR 코드 스캔"
    }
  },
  "connecting": {
    "continue_in_wallet": "{walletName}에서 계속",
    "accept_request": "지갑에서 연결 요청을 수락하세요",
    "error_subtitle": "연결이 거부되거나 실패했습니다. 다시 시도하거나 다른 지갑을 선택하세요."
  },
  "wc": {
    "scan_with": "{walletName}으로 스캔",
    "scan_instructions": "Hana, Lobstr 또는 Hot Wallet을 열고 이 QR 코드를 스캔하여 연결하세요.",
    "open_in_wallet": "지갑 앱에서 열기",
    open_failed: "{walletName}을(를) 열 수 없습니다. 설치되어 있지 않다면 아래에서 설치하세요.",
    "copy_uri": "URI 복사",
    "copied": "복사됨!",
    "generating_code": "페어링 코드 생성 중…",
    "qr_failed": "QR 생성에 실패했습니다. 아래 복사 버튼을 사용하세요.",
    "copy_pairing_code": "페어링 코드 복사"
  },
  "action": {
    "try_again": "다시 시도",
    "cancel": "취소",
    "sign": "서명",
    "approve": "승인",
    "switch_wallet": "지갑 전환",
    "disconnect": "연결 해제",
    "connect_wallet": "지갑 연결"
  },
  "browser": {
    "reload": "새로 고침",
    "open_in_browser": "브라우저에서 열기",
    "copy_link": "링크 복사"
  },
  "wallet": {
    "fallback_name": "지갑",
    "fallback_your_wallet": "내 지갑"
  },
  "account": {
    "default_label": "계정"
  },
  "connected": {
    "pending_signatures": "{count, plural, other {#개 대기 중인 서명}}",
    "balance_label": "XLM 잔액",
    "balance_unit": "XLM",
    "recent_activity": "최근 활동",
    "no_transactions": "최근 트랜잭션 없음",
    "get_testnet_funds": "Testnet 자금 받기",
    "funds_requested": "자금 요청됨 — 잔액이 곧 업데이트됩니다"
  },
  "tx": {
    "default_type": "트랜잭션",
    "default_asset": "XLM",
    "unknown_asset": "알 수 없음",
    "no_amount": "—"
  },
  "preview": {
    "title": {
      "sign_message": "메시지 서명",
      "review_transaction": "트랜잭션 검토"
    },
    "subtitle": {
      "sign_message": "{walletName}의 소유권을 증명하기 위해 이 메시지에 서명하세요. 취소하면 요청이 취소됩니다.",
      "review_transaction": "아래 트랜잭션 세부정보를 검토하세요. 승인하면 {walletName}에서 서명을 계속합니다."
    },
    "from_account": "보낸 사람 {address}",
    "default_app_name": "앱"
  },
  "signing": {
    "continue_in_wallet": "{walletName}에서 계속",
    "subtitle": "계속하려면 지갑에서 요청을 승인하세요",
    "error_title": "서명 거부됨"
  },
  "siws": {
    "title": "Stellar로 로그인",
    "phase": {
      "checking_session": "세션 확인 중…",
      "fetching_nonce": "보안 논스 가져오는 중…",
      "approve_in_wallet": "{walletName}에서 로그인 요청을 승인하세요",
      "verifying": "서명 확인 중…"
    },
    "error_title": "로그인 실패",
    "error_default": "로그인에 실패했습니다.",
    "connect_wallet": "지갑 연결",
    "error_generic": "로그인에 실패했습니다. 다시 시도해주세요.",
    "error_too_many_attempts": "실패 횟수가 너무 많습니다({maxRetries}회). 나중에 다시 시도해주세요.",
    "error_verification_failed": "로그인 확인에 실패했습니다.",
    "error_address_mismatch": "세션 주소가 연결된 지갑과 일치하지 않습니다",
    "error_network_mismatch": "세션 네트워크가 연결된 지갑과 일치하지 않습니다",
    "error_session_expired": "세션이 만료되었습니다"
  },
  "network_mismatch": {
    "title": "잘못된 네트워크",
    "detail": "이 지갑은 {actualNetwork}에 있습니다. 이 앱에는 {expectedNetwork}가 필요합니다.",
    "detail_fallback": "이 지갑이 잘못된 네트워크에 있습니다.",
    "action_hint": "지갑에서 네트워크를 전환한 후 다시 시도하세요."
  },
  "error": {
    "title": "문제가 발생했습니다",
    "default_message": "알 수 없는 오류입니다.",
    "request_timed_out": "요청 시간이 초과되었습니다. 다시 시도해주세요."
  }
};

export default ko;
