/**
 * th locale for Stellar AppKit.
 *
 * Auto-generated from the English locale (./en.ts). All keys match the
 * English locale exactly — only values are translated.
 *
 * This file is lazy-loaded via dynamic import() when setLocale('th')
 * is called. It is NOT bundled into the main entry — the bundler code-splits
 * it into a separate chunk.
 *
 * ICU MessageFormat syntax is used for interpolation: {variableName}
 * ICU plural syntax: {count, plural, one {...} other {...}}
 */

import type { LocaleMessages } from './en.js';

const th: LocaleMessages = {
  "footer": {
    "powered_by": "ขับเคลื่อนโดย {brand}",
    "brand_name": "Stellar AppKit"
  },
  "aria": {
    "close_dialog": "ปิด",
    "back": "ย้อนกลับ",
    "copy_address": "คัดลอกที่อยู่",
    "click_to_copy": "คลิกเพื่อคัดลอกที่อยู่",
    "more_options": "ตัวเลือกเพิ่มเติม",
    "view_on_explorer": "ดูในตัวสำรวจ"
  },
  "title": {
    "account": "บัญชี",
    "choose_account": "เลือกบัญชี",
    "wrong_network": "เครือข่ายผิด",
    "review_transaction": "ตรวจสอบธุรกรรม",
    "signing": "กำลังลงนาม",
    "connect_wallet": "เชื่อมต่อกระเป๋า"
  },
  "wallet_list": {
    "loading": "กำลังโหลดกระเป๋า…",
    "empty": "ไม่มีกระเป๋าที่ลงทะเบียน ส่ง connectors ในการตั้งค่า StellarAppKit",
    "not_installed": "ยังไม่ได้ติดตั้ง",
    "install": "ติดตั้ง",
    "section_stellar": "วอลเล็ต Stellar",
    "more_wallets": "วอลเล็ตเพิ่มเติม ({count})",
    "status": {
      "checking": "กำลังตรวจสอบ…",
      "connecting": "กำลังเชื่อมต่อ…",
      "locked": "ล็อค",
      "unavailable": "ไม่พร้อมใช้งาน",
      "installed": "ติดตั้งแล้ว",
      "scan_qr": "สแกน QR Code"
    }
  },
  "connecting": {
    "continue_in_wallet": "ดำเนินการต่อใน {walletName}",
    "accept_request": "ยอมรับคำขอเชื่อมต่อในกระเป๋า",
    "error_subtitle": "การเชื่อมต่อถูกปฏิเสธหรือล้มเหลว ลองอีกครั้งหรือเลือกกระเป๋าอื่น"
  },
  "wc": {
    "scan_with": "สแกนด้วย {walletName}",
    "scan_instructions": "เปิด Hana, Lobstr หรือ Hot Wallet และสแกนคิวอาร์โค้ดนี้เพื่อเชื่อมต่อ",
    "open_in_wallet": "เปิดในแอปกระเป๋า",
    open_failed: "ไม่สามารถเปิด {walletName} ได้ หากยังไม่ได้ติดตั้ง ให้ติดตั้งจากด้านล่าง",
    "copy_uri": "คัดลอก URI",
    "copied": "คัดลอกแล้ว!",
    "generating_code": "กำลังสร้างรหัสจับคู่…",
    "qr_failed": "การสร้าง QR ล้มเหลว ใช้ปุ่มคัดลอกด้านล่าง",
    "copy_pairing_code": "คัดลอกรหัสการจับคู่"
  },
  "action": {
    "try_again": "ลองอีกครั้ง",
    "cancel": "ยกเลิก",
    "sign": "ลงนาม",
    "approve": "อนุมัติ",
    "switch_wallet": "เปลี่ยนกระเป๋า",
    "disconnect": "ยกเลิกการเชื่อมต่อ",
    "connect_wallet": "เชื่อมต่อกระเป๋า"
  },
  "browser": {
    "reload": "โหลดใหม่",
    "open_in_browser": "เปิดในเบราว์เซอร์",
    "copy_link": "คัดลอกลิงก์"
  },
  "wallet": {
    "fallback_name": "กระเป๋า",
    "fallback_your_wallet": "กระเป๋าของคุณ"
  },
  "account": {
    "default_label": "บัญชี"
  },
  "connected": {
    "pending_signatures": "{count, plural, other {# ลายเซ็นที่รอดำเนินการ}}",
    "balance_label": "ยอด XLM",
    "balance_unit": "XLM",
    "recent_activity": "กิจกรรมล่าสุด",
    "no_transactions": "ไม่มีธุรกรรมล่าสุด",
    "get_testnet_funds": "รับเงิน Testnet",
    "funds_requested": "ส่งคำขอเติมเงินแล้ว — ยอดคงเหลือจะอัปเดตในไม่ช้า"
  },
  "tx": {
    "default_type": "ธุรกรรม",
    "default_asset": "XLM",
    "unknown_asset": "ไม่ทราบ",
    "no_amount": "—"
  },
  "preview": {
    "title": {
      "sign_message": "ลงนามข้อความ",
      "review_transaction": "ตรวจสอบธุรกรรม"
    },
    "subtitle": {
      "sign_message": "ลงนามข้อความนี้เพื่อพิสูจน์ว่าคุณเป็นเจ้าของ {walletName} การยกเลิกจะปฏิเสธคำขอ",
      "review_transaction": "ตรวจสอบรายละเอียดธุรกรรมด้านล่าง อนุมัติเพื่อดำเนินการลงนามต่อใน {walletName}"
    },
    "from_account": "จาก {address}",
    "default_app_name": "แอป"
  },
  "signing": {
    "continue_in_wallet": "ดำเนินการต่อใน {walletName}",
    "subtitle": "อนุมัติคำขอในกระเป๋าของคุณเพื่อดำเนินการต่อ",
    "error_title": "ปฏิเสธการลงนาม"
  },
  "siws": {
    "title": "เข้าสู่ระบบด้วย Stellar",
    "phase": {
      "checking_session": "กำลังตรวจสอบเซสชัน…",
      "fetching_nonce": "กำลังรับ nonce ที่ปลอดภัย…",
      "approve_in_wallet": "อนุมัติคำขอเข้าสู่ระบบใน {walletName}",
      "verifying": "กำลังตรวจสอบลายเซ็นของคุณ…"
    },
    "error_title": "เข้าสู่ระบบล้มเหลว",
    "error_default": "เข้าสู่ระบบล้มเหลว.",
    "connect_wallet": "เชื่อมต่อกระเป๋า",
    "error_generic": "เข้าสู่ระบบล้มเหลว โปรดลองอีกครั้ง",
    "error_too_many_attempts": "ความพยายามล้มเหลวมากเกินไป ({maxRetries}) โปรดลองอีกครั้งในภายหลัง",
    "error_verification_failed": "การยืนยันการเข้าสู่ระบบล้มเหลว",
    "error_address_mismatch": "ที่อยู่เซสชันไม่ตรงกับกระเป๋าที่เชื่อมต่อ",
    "error_network_mismatch": "เครือข่ายเซสชันไม่ตรงกับกระเป๋าที่เชื่อมต่อ",
    "error_session_expired": "เซสชันหมดอายุแล้ว"
  },
  "network_mismatch": {
    "title": "เครือข่ายผิด",
    "detail": "กระเป๋านี้อยู่บน {actualNetwork} แอปนี้ต้องการ {expectedNetwork}",
    "detail_fallback": "กระเป๋านี้อยู่บนเครือข่ายที่ผิด",
    "action_hint": "สลับเครือข่ายในกระเป๋าของคุณแล้วลองอีกครั้ง"
  },
  "error": {
    "title": "เกิดข้อผิดพลาด",
    "default_message": "ข้อผิดพลาดที่ไม่รู้จัก",
    "request_timed_out": "คำขอหมดเวลา โปรดลองอีกครั้ง"
  }
};

export default th;
