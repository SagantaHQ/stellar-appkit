/**
 * vi locale for Stellar AppKit.
 *
 * Auto-generated from the English locale (./en.ts). All keys match the
 * English locale exactly — only values are translated.
 *
 * This file is lazy-loaded via dynamic import() when setLocale('vi')
 * is called. It is NOT bundled into the main entry — the bundler code-splits
 * it into a separate chunk.
 *
 * ICU MessageFormat syntax is used for interpolation: {variableName}
 * ICU plural syntax: {count, plural, one {...} other {...}}
 */

import type { LocaleMessages } from './en.js';

const vi: LocaleMessages = {
  "footer": {
    "powered_by": "Cung cấp bởi {brand}",
    "brand_name": "Stellar AppKit"
  },
  "aria": {
    "close_dialog": "Đóng",
    "back": "Quay lại",
    "copy_address": "Sao chép địa chỉ",
    "click_to_copy": "Nhấp để sao chép địa chỉ",
    "more_options": "Tùy chọn khác",
    "view_on_explorer": "Xem trên trình khám phá"
  },
  "title": {
    "account": "Tài khoản",
    "choose_account": "Chọn tài khoản",
    "wrong_network": "Sai mạng",
    "review_transaction": "Xem lại giao dịch",
    "signing": "Đang ký",
    "connect_wallet": "Kết nối ví"
  },
  "wallet_list": {
    "loading": "Đang tải ví…",
    "empty": "Không có ví nào được đăng ký. Truyền connectors vào cấu hình StellarAppKit.",
    "not_installed": "Chưa cài đặt",
    "install": "Cài đặt",
    "section_stellar": "Ví Stellar",
    "more_wallets": "Thêm ví ({count})",
    "status": {
      "connecting": "Đang kết nối…",
      "locked": "Đã khóa",
      "unavailable": "Không khả dụng",
      "installed": "Đã cài đặt",
      "scan_qr": "Quét mã QR"
    }
  },
  "connecting": {
    "continue_in_wallet": "Tiếp tục trong {walletName}",
    "accept_request": "Chấp nhận yêu cầu kết nối trong ví",
    "error_subtitle": "Kết nối bị từ chối hoặc thất bại. Thử lại hoặc chọn ví khác."
  },
  "wc": {
    "scan_with": "Quét bằng {walletName}",
    "scan_instructions": "Mở Hana, Lobstr hoặc Hot Wallet và quét mã QR này để kết nối.",
    "open_in_wallet": "Mở trong ứng dụng ví",
    open_failed: "Không thể mở {walletName}. Nếu chưa cài đặt, hãy tải ứng dụng bên dưới.",
    "copy_uri": "Sao chép URI",
    "copied": "Đã sao chép!",
    "generating_code": "Đang tạo mã ghép nối…",
    "qr_failed": "Tạo QR thất bại. Sử dụng nút sao chép bên dưới.",
    "copy_pairing_code": "Sao chép mã ghép nối"
  },
  "action": {
    "try_again": "Thử lại",
    "cancel": "Hủy",
    "sign": "Ký",
    "approve": "Phê duyệt",
    "switch_wallet": "Đổi ví",
    "disconnect": "Ngắt kết nối",
    "connect_wallet": "Kết nối ví"
  },
  "wallet": {
    "fallback_name": "Ví",
    "fallback_your_wallet": "ví của bạn"
  },
  "account": {
    "default_label": "Tài khoản"
  },
  "connected": {
    "pending_signatures": "{count, plural, other {# chữ ký đang chờ}}",
    "balance_label": "Số dư XLM",
    "balance_unit": "XLM",
    "recent_activity": "Hoạt động gần đây",
    "no_transactions": "Không có giao dịch gần đây",
    "get_testnet_funds": "Nhận tiền Testnet",
    "funds_requested": "Đã yêu cầu cấp vốn — số dư sẽ cập nhật ngay"
  },
  "tx": {
    "default_type": "Giao dịch",
    "default_asset": "XLM",
    "unknown_asset": "KHÔNG XÁC ĐỊNH",
    "no_amount": "—"
  },
  "preview": {
    "title": {
      "sign_message": "Ký thông điệp",
      "review_transaction": "Xem lại giao dịch"
    },
    "subtitle": {
      "sign_message": "Ký thông điệp này để chứng minh bạn sở hữu {walletName}. Hủy sẽ loại bỏ yêu cầu.",
      "review_transaction": "Xem lại chi tiết giao dịch bên dưới. Phê duyệt để tiếp tục ký trong {walletName}."
    },
    "from_account": "Từ {address}",
    "default_app_name": "Ứng dụng"
  },
  "signing": {
    "continue_in_wallet": "Tiếp tục trong {walletName}",
    "subtitle": "Phê duyệt yêu cầu trong ví của bạn để tiếp tục",
    "error_title": "Ký bị từ chối"
  },
  "siws": {
    "title": "Đăng nhập bằng Stellar",
    "phase": {
      "checking_session": "Đang kiểm tra phiên…",
      "fetching_nonce": "Đang lấy nonce bảo mật…",
      "approve_in_wallet": "Phê duyệt yêu cầu đăng nhập trong {walletName}",
      "verifying": "Đang xác minh chữ ký của bạn…"
    },
    "error_title": "Đăng nhập thất bại",
    "error_default": "Đăng nhập thất bại.",
    "connect_wallet": "Kết nối ví",
    "error_generic": "Đăng nhập thất bại. Vui lòng thử lại.",
    "error_too_many_attempts": "Quá nhiều lần thử thất bại ({maxRetries}). Vui lòng thử lại sau.",
    "error_verification_failed": "Xác minh đăng nhập thất bại.",
    "error_address_mismatch": "Địa chỉ phiên không khớp với ví đã kết nối",
    "error_network_mismatch": "Mạng phiên không khớp với ví đã kết nối",
    "error_session_expired": "Phiên đã hết hạn"
  },
  "network_mismatch": {
    "title": "Sai mạng",
    "detail": "Ví này đang ở {actualNetwork}, ứng dụng này cần {expectedNetwork}.",
    "detail_fallback": "Ví này đang ở sai mạng.",
    "action_hint": "Chuyển mạng trong ví của bạn, sau đó thử lại."
  },
  "error": {
    "title": "Đã xảy ra lỗi",
    "default_message": "Lỗi không xác định.",
    "request_timed_out": "Yêu cầu hết thời gian. Vui lòng thử lại."
  }
};

export default vi;
