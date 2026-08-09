/**
 * id locale for Stellar AppKit.
 *
 * Auto-generated from the English locale (./en.ts). All keys match the
 * English locale exactly — only values are translated.
 *
 * This file is lazy-loaded via dynamic import() when setLocale('id')
 * is called. It is NOT bundled into the main entry — the bundler code-splits
 * it into a separate chunk.
 *
 * ICU MessageFormat syntax is used for interpolation: {variableName}
 * ICU plural syntax: {count, plural, one {...} other {...}}
 */

import type { LocaleMessages } from './en.js';

const id: LocaleMessages = {
  "footer": {
    "powered_by": "Didukung oleh {brand}",
    "brand_name": "Stellar AppKit"
  },
  "aria": {
    "close_dialog": "Tutup",
    "back": "Kembali",
    "copy_address": "Salin alamat",
    "click_to_copy": "Klik untuk menyalin alamat",
    "more_options": "Opsi lainnya",
    "view_on_explorer": "Lihat di penjelajah"
  },
  "title": {
    "account": "Akun",
    "choose_account": "Pilih akun",
    "wrong_network": "Jaringan salah",
    "review_transaction": "Tinjau transaksi",
    "signing": "Menandatangani",
    "connect_wallet": "Hubungkan dompet"
  },
  "wallet_list": {
    "loading": "Memuat dompet…",
    "empty": "Tidak ada dompet terdaftar. Lewatkan connectors ke konfigurasi StellarAppKit.",
    "not_installed": "Tidak terpasang",
    "install": "Pasang",
    "status": {
      "connecting": "Menghubungkan…",
      "locked": "Terkunci",
      "unavailable": "Tidak tersedia",
      "installed": "Terpasang",
      "scan_qr": "Pindai kode QR"
    }
  },
  "connecting": {
    "continue_in_wallet": "Lanjut di {walletName}",
    "accept_request": "Terima permintaan koneksi di dompet",
    "error_subtitle": "Koneksi ditolak atau gagal. Coba lagi atau pilih dompet lain."
  },
  "wc": {
    "scan_with": "Pindai dengan {walletName}",
    "scan_instructions": "Buka Hana, Lobstr, atau Hot Wallet dan pindai kode QR ini untuk terhubung.",
    "open_in_wallet": "Buka di aplikasi dompet",
    "copy_uri": "Salin URI",
    "copied": "Tersalin!",
    "generating_code": "Membuat kode pairing…",
    "qr_failed": "Pembuatan QR gagal. Gunakan tombol salin di bawah."
  },
  "action": {
    "try_again": "Coba lagi",
    "cancel": "Batal",
    "sign": "Tandatangani",
    "approve": "Setujui",
    "switch_wallet": "Ganti dompet",
    "disconnect": "Putuskan",
    "connect_wallet": "Hubungkan dompet"
  },
  "wallet": {
    "fallback_name": "Dompet",
    "fallback_your_wallet": "dompet Anda"
  },
  "account": {
    "default_label": "Akun"
  },
  "connected": {
    "pending_signatures": "{count, plural, other {# tanda tangan tertunda}}",
    "balance_label": "Saldo XLM",
    "balance_unit": "XLM",
    "recent_activity": "Aktivitas terbaru",
    "no_transactions": "Tidak ada transaksi terbaru",
    "get_testnet_funds": "Dapatkan dana Testnet",
    "funds_requested": "Pendanaan diminta — saldo akan diperbarui segera"
  },
  "tx": {
    "default_type": "Transaksi",
    "default_asset": "XLM",
    "unknown_asset": "TIDAK DIKETAHUI",
    "no_amount": "—"
  },
  "preview": {
    "title": {
      "sign_message": "Tandatangani pesan",
      "review_transaction": "Tinjau transaksi"
    },
    "subtitle": {
      "sign_message": "Tandatangani pesan ini untuk membuktikan Anda memiliki {walletName}. Membatalkan akan mengabaikan permintaan.",
      "review_transaction": "Tinjau detail transaksi di bawah. Setujui untuk lanjut menandatangani di {walletName}."
    },
    "from_account": "Dari {address}",
    "default_app_name": "Aplikasi"
  },
  "signing": {
    "continue_in_wallet": "Lanjut di {walletName}",
    "subtitle": "Setujui permintaan di dompet Anda untuk melanjutkan",
    "error_title": "Tanda tangan ditolak"
  },
  "siws": {
    "title": "Masuk dengan Stellar",
    "phase": {
      "checking_session": "Memeriksa sesi…",
      "fetching_nonce": "Mengambil nonce aman…",
      "approve_in_wallet": "Setujui permintaan masuk di {walletName}",
      "verifying": "Memverifikasi tanda tangan Anda…"
    },
    "error_title": "Gagal masuk",
    "error_default": "Gagal masuk.",
    "connect_wallet": "Hubungkan dompet",
    "error_generic": "Gagal masuk. Silakan coba lagi.",
    "error_too_many_attempts": "Terlalu banyak percobaan gagal ({maxRetries}). Coba lagi nanti.",
    "error_verification_failed": "Verifikasi masuk gagal.",
    "error_address_mismatch": "Alamat sesi tidak cocok dengan dompet yang terhubung",
    "error_network_mismatch": "Jaringan sesi tidak cocok dengan dompet yang terhubung",
    "error_session_expired": "Sesi telah berakhir"
  },
  "network_mismatch": {
    "title": "Jaringan salah",
    "detail": "Dompet ini di {actualNetwork}, aplikasi ini butuh {expectedNetwork}.",
    "detail_fallback": "Dompet ini di jaringan yang salah.",
    "action_hint": "Ganti jaringan di dompet Anda, lalu coba lagi."
  },
  "error": {
    "title": "Terjadi kesalahan",
    "default_message": "Kesalahan tidak diketahui.",
    "request_timed_out": "Permintaan waktu habis. Silakan coba lagi."
  }
};

export default id;
