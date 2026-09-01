/**
 * ATF Task Farm - Official Telegram MTProto Engine
 * Authenticates client's real Telegram account via official Telegram login OTP
 */

class TelegramBotEngine {
  constructor() {
    this.session = null;
    this.currentPhone = '';
    this.phoneCodeHash = '';
  }

  async sendTelegramOtp(phone) {
    let cleanPhone = phone.trim().replace(/\s+/g, '');
    if (cleanPhone.startsWith('0')) {
      cleanPhone = '+84' + cleanPhone.slice(1);
    } else if (!cleanPhone.startsWith('+')) {
      cleanPhone = '+' + cleanPhone;
    }

    this.currentPhone = cleanPhone;
    const basePath = window.location.pathname.includes('/atf') ? '/atf' : '';

    try {
      const res = await fetch(`${basePath}/api/telegram/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: cleanPhone })
      });
      const data = await res.json();

      if (data && data.success) {
        this.phoneCodeHash = data.phoneCodeHash;
        return {
          success: true,
          phone: cleanPhone,
          phoneCodeHash: this.phoneCodeHash,
          message: data.message || `Mã xác thực đăng nhập đã được Telegram gửi đến ứng dụng Telegram số ${cleanPhone}. Vui lòng kiểm tra tin nhắn Telegram chính thức!`
        };
      } else {
        return {
          success: false,
          message: data ? data.message : 'Không thể gửi mã OTP Telegram'
        };
      }
    } catch(e) {
      return { success: false, message: 'Lỗi kết nối máy chủ Telegram: ' + e.message };
    }
  }

  async verifyTelegramOtp(code, password2FA = '') {
    const basePath = window.location.pathname.includes('/atf') ? '/atf' : '';
    const user = JSON.parse(localStorage.getItem('atf_token_user') || '{}');

    try {
      const res = await fetch(`${basePath}/api/telegram/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: this.currentPhone,
          phoneCode: code.trim(),
          phoneCodeHash: this.phoneCodeHash,
          password2FA: password2FA,
          username: user.username || 'client'
        })
      });
      const data = await res.json();

      if (data && data.success) {
        this.session = data.session || {
          phone: this.currentPhone,
          totalAssets: 0.0000,
          status: 'running_247'
        };
        localStorage.setItem('atf_telegram_session', JSON.stringify(this.session));
        return { success: true, message: data.message || '🎉 Đăng nhập Telegram thành công!', session: this.session };
      } else {
        return { success: false, message: data ? data.message : 'Mã OTP Telegram không hợp lệ' };
      }
    } catch(e) {
      return { success: false, message: 'Lỗi kết nối máy chủ Telegram: ' + e.message };
    }
  }
}

window.TelegramBotEngine = TelegramBotEngine;
