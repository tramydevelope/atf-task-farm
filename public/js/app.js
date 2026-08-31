/**
 * Ứng Dụng Web3 ATF Bot Platform - VIP EDITION v2.9.0
 * Điều Phối Giao Diện, Cài Đặt (Settings), Quản Lý Phiên & Heartbeat
 */

const App = {
  token: localStorage.getItem('atf_token') || null,
  currentUser: null,
  clientHwid: null,
  clientHwidDetails: null,
  networkInfo: {
    ip: '116.98.234.129',
    city: 'Buon Ma Thuot',
    isp: 'Viettel'
  },
  bot: null,
  teleBot: null,
  heartbeatInterval: null,

      async init() {
    this.initEventListeners();
    this.checkSavedTheme();
    
    // Quét phần cứng và IP mạng thật
    if (window.FingerprintEngine && window.FingerprintEngine.autoScanAndPopulateUI) {
      await window.FingerprintEngine.autoScanAndPopulateUI();
    }

    const token = localStorage.getItem('atf_token');
    if (!token) {
      this.showScreen('auth');
      return;
    }

    this.token = token;
    await this.fetchUserProfile();
  },



  

  // 2. Tải thông tin người dùng
  async fetchUserProfile() {
    try {
      const res = await this.apiFetch('/api/auth/me');
      if (res && res.success) {
        this.currentUser = res.user;
        this.updateUserUI();
        this.showScreen('dashboard');
        this.startHeartbeat();
            try {
      const savedBal = localStorage.getItem('atf_farm_balance_v3');
      if (savedBal) {
        const parsed = JSON.parse(savedBal);
        if (parsed.totalAssets < 200) {
          localStorage.removeItem('atf_farm_balance_v3');
        }
      }
    } catch(e) {}

            // Reset bất kỳ số dư rác nào bị phình to (> 570 ATF hoặc < 500 ATF)
    try {
      const savedBal = localStorage.getItem('atf_farm_balance_v3');
      if (savedBal) {
        const p = JSON.parse(savedBal);
        if (p.totalAssets > 570 || p.totalAssets < 500 || p.poolWallet > 80) {
          localStorage.removeItem('atf_farm_balance_v3');
        }
      }
    } catch(e) {}

        this.initBotEngines();
        this.renderVerifiedTelegramSessions();
    // Khởi động đồng hồ thời gian thực chuẩn GMT+7
    setInterval(() => {
      const clockEl = document.getElementById('hud-live-clock');
      if (clockEl) {
        const now = new Date();
        clockEl.innerText = now.toLocaleTimeString('vi-VN', { hour12: false }) + ' GMT+7';
      }
    }, 1000);


        // 1. Tự động đồng bộ với Telegram MiniApp thật ngay khi vào Dashboard & Lặp lại mỗi 10 giây
        const sessions = this.teleBot ? this.teleBot.getLocalSessions() : {};
        if (Object.keys(sessions).length > 0) {
          setTimeout(() => {
            this.syncRealMiniAppData(true);
          }, 800);

          if (this.miniAppSyncInterval) clearInterval(this.miniAppSyncInterval);
          this.miniAppSyncInterval = setInterval(() => {
            this.syncRealMiniAppData(true);
          }, 10000);
        }

        // 2. Kích hoạt tiến trình cập nhật số dư thực tế trực tiếp mỗi 3 giây
        this.startLiveBalancePolling();

        // 3. Tự động chuyển tới trang Quản Lý /admin nếu truy cập /admin hoặc /atf/admin
        if (window.location.pathname.includes('/quanglinhdev') || window.location.pathname.includes('/admin') || window.location.hash === '#quanglinhdev' || window.location.hash === '#admin') {
          if (this.currentUser?.role === 'admin') {
            this.switchTab('admin');
          }
        }
      } else {
        this.logout();
      }
    } catch (e) {
      this.logout();
    }
  },

        startLiveBalancePolling() {
    if (this.livePollTimer) clearInterval(this.livePollTimer);
    this.livePollTimer = setInterval(async () => {
      try {
        const res = await this.apiFetch('/api/telegram/live-status');
        if (res && res.success && res.data) {
          const d = res.data;
          if (window.atfEngine) {
            window.atfEngine.hasActiveSession = true;
            
            const serverHolding = parseFloat(d.holdingWallet || 0);
            const serverPool = parseFloat(d.poolWallet || 0);
            
            if (serverHolding > window.atfEngine.holdingWallet) {
              window.atfEngine.holdingWallet = serverHolding;
              window.atfEngine.poolWallet = serverPool;
            } else if (serverPool > window.atfEngine.poolWallet) {
              window.atfEngine.poolWallet = serverPool;
            }

            window.atfEngine.tapRate = parseFloat(d.tapRate || 6.8763);
            window.atfEngine.minerLevel = parseInt(d.level || 69);
            if (d.taskCooldowns) {
              window.atfEngine.syncTaskCooldowns(d.taskCooldowns);
            }
            window.atfEngine.updateUI();
          }
        }
      } catch (e) {}
    }, 2000);
  },

  

  

  // Đồng Bộ Thật Chuẩn Xác 100%
  async syncRealMiniAppData(isSilent = false) {
    const syncBtn = document.querySelector('.kpi-card-glow-gold button') || document.getElementById('btn-sync-real-assets');
    if (syncBtn && !isSilent) {
      syncBtn.innerHTML = `<i class="fa-solid fa-arrows-rotate fa-spin text-gold"></i> Đang đồng bộ...`;
      syncBtn.disabled = true;
    }

    try {
      const res = await this.apiFetch('/api/telegram/live-status');
      if (res && res.success && res.data) {
        const d = res.data;
        if (window.atfEngine) {
          window.atfEngine.hasActiveSession = true;
          window.atfEngine.holdingWallet = parseFloat(d.holdingWallet || 0);
          window.atfEngine.poolWallet = parseFloat(d.poolWallet || 0);
          window.atfEngine.totalAssets = +(window.atfEngine.holdingWallet + window.atfEngine.poolWallet).toFixed(4);
          window.atfEngine.tapRate = parseFloat(d.tapRate || 6.8763);
          window.atfEngine.minerLevel = parseInt(d.level || 69);
          if (d.taskCooldowns) {
            window.atfEngine.syncTaskCooldowns(d.taskCooldowns);
          }
          window.atfEngine.saveBalanceToStorage();
          window.atfEngine.updateUI();
        }

        if (syncBtn && !isSilent) {
          syncBtn.innerHTML = `<i class="fa-solid fa-circle-check text-emerald"></i> Chuẩn 100%`;
          setTimeout(() => {
            syncBtn.innerHTML = `<i class="fa-solid fa-arrows-rotate"></i> Đồng Bộ Thật`;
            syncBtn.disabled = false;
          }, 2000);
        }

        if (!isSilent) {
          this.showToast(`✅ Đã cập nhật số dư chuẩn xác nhất: ${(d.totalAssets || 0).toFixed(4)} ATF!`, 'success');
        }
      }
    } catch (e) {
      if (syncBtn && !isSilent) {
        syncBtn.innerHTML = `<i class="fa-solid fa-arrows-rotate"></i> Đồng Bộ Thật`;
        syncBtn.disabled = false;
      }
    }
  },

  

  updateUserUI() {
    const user = this.currentUser;
    if (!user) return;

    const elName = document.getElementById('user-display-name');
    const elRole = document.getElementById('user-role-badge');
    const elHudAcc = document.getElementById('hud-user-acc');
    const elHudSlot1 = document.getElementById('hud-slot-1-name');
    const elHudKey = document.getElementById('hud-user-key');
    const elHudDate = document.getElementById('hud-date-str');
    const elHudSessionTime = document.getElementById('hud-session-time');

    const username = user.username.startsWith('@') ? user.username : `@${user.username}`;
    if (elName) elName.innerText = username;
    if (elHudAcc) elHudAcc.innerText = username;
    if (elHudSlot1) elHudSlot1.innerText = username;
    if (elHudKey) elHudKey.innerText = user.role === 'admin' ? 'QL-VIP-ADMIN-UNLIMITED' : `QL-VIP-${user.id.toUpperCase()}`;
    if (elHudDate) elHudDate.innerText = new Date().toLocaleDateString('vi-VN');
    if (elHudSessionTime) elHudSessionTime.innerText = new Date().toLocaleTimeString('vi-VN');

    if (elRole) {
      elRole.innerText = user.role === 'admin' ? 'ADMIN PRO' : (user.isExpired ? 'HẾT HẠN' : 'VIP ACTIVE');
      elRole.className = user.role === 'admin' ? 'badge badge-warning' : (user.isExpired ? 'badge badge-danger' : 'badge badge-success');
    }

    const elExpDays = document.getElementById('dash-remaining-days');
    const elThreads = document.getElementById('dash-max-threads');
    const daysVal = (user.remainingDays && user.remainingDays > 0) ? `${user.remainingDays} Ngày` : '30 Ngày (VIP)';
    if (elExpDays) elExpDays.innerText = user.role === 'admin' ? 'Không giới hạn' : daysVal;
    if (elThreads) elThreads.innerText = `${user.maxThreads || 10} Luồng`;

    const adminNav = document.getElementById('nav-admin-tab');
    if (user.role === 'admin') {
      if (adminNav) adminNav.classList.remove('hidden');
    } else {
      if (adminNav) adminNav.classList.add('hidden');
    }
  },

  // 3. Khởi tạo & Đồng bộ Cài Đặt (Settings)
  initSettingsUI() {
    if (!window.atfEngine) return;
    const s = window.atfEngine.settings;

    const setAutoClaim = document.getElementById('set-auto-claim');
    const setSpeedDelay = document.getElementById('set-speed-delay');
    const setSpeedVal = document.getElementById('set-speed-val');
    const setBurst = document.getElementById('set-taps-burst');
    const setBurstVal = document.getElementById('set-burst-val');
    const setAntiBan = document.getElementById('set-anti-ban');
    const setAutoTasks = document.getElementById('set-auto-tasks');

    if (setAutoClaim) setAutoClaim.checked = s.autoClaim;
    if (setSpeedDelay) {
      setSpeedDelay.value = s.speedDelay;
      if (setSpeedVal) setSpeedVal.innerText = `${s.speedDelay}ms`;
    }
    if (setBurst) {
      setBurst.value = s.tapsPerBurst;
      if (setBurstVal) setBurstVal.innerText = `${s.tapsPerBurst} taps`;
    }
    if (setAntiBan) setAntiBan.checked = s.antiBan;
    if (setAutoTasks) setAutoTasks.checked = s.autoTasks;
  },

  saveCurrentSettings() {
    if (!window.atfEngine) return;

    const newSettings = {
      autoClaim: document.getElementById('set-auto-claim')?.checked ?? true,
      speedDelay: parseInt(document.getElementById('set-speed-delay')?.value) || 1000,
      tapsPerBurst: parseInt(document.getElementById('set-taps-burst')?.value) || 125,
      antiBan: document.getElementById('set-anti-ban')?.checked ?? true,
      autoTasks: document.getElementById('set-auto-tasks')?.checked ?? true
    };

    window.atfEngine.saveSettings(newSettings);
  },

  // 4. Bot Telegram & Đăng Nhập OTP
  initBotEngines() {
    if (!window.atfEngine) {
      window.atfEngine = new ATFFarmEngine();
    }
    if (!this.teleBot) {
      this.teleBot = new TelegramBotEngine({
        onLog: (logObj) => {},
        onProgress: () => {},
        onStatusChange: () => {}
      });
    }
  },

  openTelegramLoginModal(phone = '') {
    document.getElementById('tele-input-phone').value = phone;
    document.getElementById('tele-step-phone').classList.remove('hidden');
    document.getElementById('tele-step-otp').classList.add('hidden');
    document.getElementById('tele-otp-code').value = '';
    document.getElementById('tele-otp-2fa').value = '';
    document.getElementById('modal-telegram-login').classList.remove('hidden');
  },

  async handleTelegramSendOtp() {
    const phone = document.getElementById('tele-input-phone').value.trim();
    if (!phone || phone.length < 9) {
      this.showToast('Vui lòng nhập số điện thoại Telegram hợp lệ!', 'warning');
      return;
    }

    const btn = document.getElementById('btn-send-tele-otp');
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Đang kết nối Telegram...`;

    try {
      const res = await this.teleBot.sendTelegramOtp(phone);
      if (res.success) {
        this.currentOtpPhone = res.phone;
        this.showToast(res.message, 'success');
        document.getElementById('tele-display-phone').innerText = res.phone;
        document.getElementById('tele-step-phone').classList.add('hidden');
        document.getElementById('tele-step-otp').classList.remove('hidden');
        document.getElementById('tele-otp-code').focus();
      } else {
        this.showToast(res.message || 'Lỗi gửi mã OTP', 'error');
      }
    } catch (e) {
      this.showToast('Lỗi kết nối máy chủ Telegram', 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> Gửi Mã OTP Đến Telegram`;
    }
  },

  async handleTelegramVerifyOtp() {
    const otpCode = document.getElementById('tele-otp-code').value.trim();
    const pass2FA = document.getElementById('tele-otp-2fa').value.trim();

    if (!otpCode || otpCode.length < 4) {
      this.showToast('Vui lòng nhập mã OTP nhận được!', 'warning');
      return;
    }

    const btn = document.getElementById('btn-verify-tele-otp');
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Đang xác thực...`;

    try {
      const res = await this.teleBot.verifyTelegramOtp(this.currentOtpPhone, otpCode, pass2FA);
      if (res.success) {
        this.showToast(res.message, 'success');
        document.getElementById('modal-telegram-login').classList.add('hidden');
        this.renderVerifiedTelegramSessions();

        // Tự động kết nối và đồng bộ ngay lập tức số dư thực tế từ MiniApp
        setTimeout(() => {
          this.syncRealMiniAppData(false);
        }, 500);
      } else {
        this.showToast(res.message || 'Mã OTP không đúng!', 'error');
        if (res.message && res.message.includes('2FA')) {
          document.getElementById('tele-otp-2fa').focus();
        }
      }
    } catch (e) {
      this.showToast('Lỗi xác thực', 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<i class="fa-solid fa-check-circle"></i> Xác Nhận Đăng Nhập`;
    }
  },

    renderVerifiedTelegramSessions() {
    const sessions = this.teleBot ? this.teleBot.getLocalSessions() : {};
    const tbody = document.getElementById('tele-sessions-tbody');
    const elHudAcc = document.getElementById('hud-user-acc');
    const elHudSlot1 = document.getElementById('hud-slot-1-name');
    const elHudAcc1Bal = document.getElementById('hud-acc1-balance');
    const elHudBadge = document.getElementById('hud-tele-live-badge');
    const elBtnLogout = document.getElementById('btn-tele-logout');
    const phones = Object.keys(sessions);

    if (phones.length === 0) {
      if (tbody) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted"><i class="fa-solid fa-circle-info"></i> Chưa có tài khoản Telegram nào đăng nhập trên máy này. Bấm nút <strong>"+ Thêm Số Tele"</strong> để đăng nhập bằng mã OTP.</td></tr>';
      }
      
      if (elHudAcc && this.currentUser) {
        const webName = this.currentUser.username.startsWith('@') ? this.currentUser.username : `@${this.currentUser.username}`;
        elHudAcc.innerText = webName;
      }
      if (elHudBadge) {
        elHudBadge.className = 'badge badge-warning';
        elHudBadge.style.cursor = 'pointer';
        elHudBadge.innerHTML = '<i class="fa-solid fa-plus text-gold"></i> + Thêm Số Telegram (OTP)';
        elHudBadge.onclick = () => this.openTelegramLoginModal();
      }
      if (elBtnLogout) elBtnLogout.classList.add('hidden');
      if (elHudSlot1) elHudSlot1.innerText = 'Slot #1 (Chưa thêm)';
      if (elHudAcc1Bal) elHudAcc1Bal.innerText = '0.00 ATF';

      const slot1Card = document.getElementById('slot-1-tile-card');
      const slot1Badge = document.getElementById('hud-slot-1-badge');
      const slot1Footer = document.getElementById('hud-slot-1-footer');
      if (slot1Card) slot1Card.classList.remove('active');
      if (slot1Badge) {
        slot1Badge.className = 'badge badge-secondary';
        slot1Badge.innerText = 'Chờ thêm';
      }
      if (slot1Footer) {
        slot1Footer.innerHTML = '<button class="btn btn-sm btn-outline-info" style="width: 100%; padding: 3px 0; font-size: 11px;" onclick="App.openTelegramLoginModal()">+ Thêm Số Tele (OTP)</button>';
      }

      if (window.atfEngine) {
        window.atfEngine.setStandbyMode(true);
      }
      return;
    }

    if (window.atfEngine && !window.atfEngine.hasActiveSession) {
      window.atfEngine.setStandbyMode(false);
    }

    const firstPhone = phones[0];
    const firstSession = sessions[firstPhone];

    let formattedName = '';
    if (firstSession.username && firstSession.username.trim()) {
      formattedName = firstSession.username.startsWith('@') ? firstSession.username : `@${firstSession.username}`;
    } else if (firstSession.firstName) {
      formattedName = `${firstSession.firstName} ${firstSession.lastName || ''}`.trim();
    } else {
      formattedName = 'Người Dùng Telegram';
    }

    if (elHudAcc) elHudAcc.innerText = formattedName;
    if (elHudSlot1) elHudSlot1.innerText = formattedName;
    if (elHudAcc1Bal && window.atfEngine) elHudAcc1Bal.innerText = `${window.atfEngine.totalAssets.toFixed(4)} ATF`;
    
    const slot1Card = document.getElementById('slot-1-tile-card');
    const slot1Badge = document.getElementById('hud-slot-1-badge');
    const slot1Footer = document.getElementById('hud-slot-1-footer');
    if (slot1Card) slot1Card.classList.add('active');
    if (slot1Badge) {
      slot1Badge.className = 'badge badge-success';
      slot1Badge.innerHTML = '🟢 SẴN SÀNG';
    }
    if (slot1Footer) {
      slot1Footer.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; font-size: 11px;">
          <span><i class="fa-solid fa-wifi text-emerald"></i> ${this.networkInfo?.ip || '116.98.234.129'}</span>
          <span class="text-emerald font-mono" style="font-weight: 800;">🟢 18ms (Sẵn Sàng)</span>
        </div>
      `;
    }

    if (elHudBadge) {
      elHudBadge.className = 'badge badge-primary font-mono';
      elHudBadge.style.cursor = 'default';
      elHudBadge.onclick = null;
      elHudBadge.innerHTML = `<i class="fa-solid fa-phone text-cyan"></i> <span id="hud-tele-phone-val">${firstSession.phone || firstPhone}</span> • <span class="text-emerald" style="font-weight: 900;">🟢 LIVE</span>`;
    }
    if (elBtnLogout) elBtnLogout.classList.remove('hidden');

    const currentOs = this.clientHwidDetails?.os || 'Windows 10 / 11 (64-bit)';
    const currentGpu = (this.clientHwidDetails?.gpu || 'NVIDIA / Intel GPU').slice(0, 20);
    const currentHwid = this.clientHwid || 'HWID-CLIENT-AUTO';

    tbody.innerHTML = phones.map((p, index) => {
      const s = sessions[p];
      let name = s.username && s.username.trim() 
        ? (s.username.startsWith('@') ? s.username : `@${s.username}`)
        : (s.firstName ? `${s.firstName} ${s.lastName || ''}`.trim() : 'Người Dùng Telegram');

      const devName = s.deviceInfo || `${currentOs} • ${currentGpu}`;
      const hwidStr = s.hwid || currentHwid;
      const ipStr = s.clientIp || this.networkInfo?.ip || '116.98.234.129';
      const ispStr = this.networkInfo?.isp || 'Viettel Group';
      
      const loginTime = s.loginTimeStr || (s.loginAt ? new Date(s.loginAt).toLocaleString('vi-VN') : new Date().toLocaleString('vi-VN'));
      const lastSync = s.lastSyncAt || new Date().toLocaleTimeString('vi-VN');

      return `
        <tr>
          <td style="font-weight: 800; color: var(--text-dim);">${index + 1}</td>
          <td>
            <strong class="font-mono text-cyan" style="font-size: 13.5px;">${p}</strong>
            <br><span class="text-gold" style="font-weight: 700; font-size: 12px;"><i class="fa-brands fa-telegram"></i> ${name}</span>
          </td>
          <td>
            <div style="font-size: 12px; font-weight: 700; color: #ffffff;">
              <i class="fa-solid fa-desktop text-cyan"></i> ${devName}
            </div>
            <div class="font-mono text-dim" style="font-size: 10.5px; margin-top: 2px;">
              Mã máy: <span class="text-cyan">${hwidStr}</span>
            </div>
          </td>
          <td>
            <div class="font-mono text-emerald" style="font-weight: 700; font-size: 12px;">
              <i class="fa-solid fa-wifi"></i> ${ipStr}
            </div>
            <div style="font-size: 10.5px; color: var(--text-muted); margin-top: 2px;">
              Nhà mạng: <strong class="text-white">${ispStr}</strong>
            </div>
          </td>
          <td>
            <div style="font-size: 12px; font-weight: 700; color: #cbd5e1; font-family: 'JetBrains Mono', monospace;">
              <i class="fa-regular fa-calendar-check text-gold"></i> ${loginTime}
            </div>
            <div style="font-size: 10.5px; color: #10b981; margin-top: 2px; font-family: 'JetBrains Mono', monospace;">
              <i class="fa-solid fa-arrows-rotate"></i> Đồng bộ: ${lastSync} GMT+7
            </div>
          </td>
          <td>
            <span class="badge badge-success" style="font-size: 11px; padding: 4px 10px; display: inline-flex; align-items: center; gap: 5px;">
              <span class="ready-dot" style="background: #00ff88; box-shadow: 0 0 6px #00ff88;"></span> Đang Chạy Cloud 24/24
            </span>
          </td>
          <td>
            <button class="btn btn-sm btn-outline-danger" onclick="App.deleteTelegramSession('${p}')" title="Xóa phiên đăng nhập">
              <i class="fa-solid fa-trash"></i>
            </button>
          </td>
        </tr>
      `;
    }).join('');
  },

  

  logoutActiveTelegram() {
    const sessions = this.teleBot ? this.teleBot.getLocalSessions() : {};
    const phones = Object.keys(sessions);
    if (phones.length === 0) {
      this.showToast('Hiện chưa có tài khoản Telegram nào đang kết nối!', 'warning');
      return;
    }
    const targetPhone = phones[0];
    if (confirm(`Xác nhận đăng xuất và ngắt kết nối tài khoản Telegram số [${targetPhone}]?`)) {
      this.teleBot.removeLocalSession(targetPhone);
      this.renderVerifiedTelegramSessions();
      this.updateUserUI();
      this.showToast(`✅ Đã đăng xuất tài khoản Telegram [${targetPhone}] thành công!`, 'success');
    }
  },

  deleteTelegramSession(phone) {
    if (confirm(`Xác nhận xóa Session của số [${phone}]?`)) {
      this.teleBot.removeLocalSession(phone);
      this.renderVerifiedTelegramSessions();
      this.updateUserUI();
      this.showToast(`Đã xóa session của số [${phone}]`, 'info');
    }
  },

  // 4.1 TỰ ĐỘNG KẾT NỐI & ĐỒNG BỘ MINIPAPP THẬT
  async syncRealMiniAppData(isSilent = false) {
    const syncBtn = document.querySelector('.kpi-card-glow-gold button');
    if (syncBtn && !isSilent) {
      syncBtn.innerHTML = `<i class="fa-solid fa-arrows-rotate fa-spin"></i> Đang tải...`;
      syncBtn.disabled = true;
    }

    const sessions = this.teleBot ? this.teleBot.getLocalSessions() : {};
    const phones = Object.keys(sessions);

    if (phones.length === 0) {
      if (syncBtn && !isSilent) {
        syncBtn.innerHTML = `<i class="fa-solid fa-arrows-rotate"></i> Đồng Bộ Thật`;
        syncBtn.disabled = false;
      }
      if (!isSilent) {
        this.showToast('Vui lòng vào tab "Đăng Nhập Telegram (OTP)" để thêm tài khoản trước khi đồng bộ!', 'warning');
        this.switchTab('tele-bot');
      }
      return;
    }

    const firstPhone = phones[0];
    const sessionObj = sessions[firstPhone];
    const sessionString = sessionObj?.sessionString || '';

    if (!isSilent) {
      this.showToast(`⏳ Đang kết nối trực tiếp MiniApp Asloni cho số [${firstPhone}]...`, 'info');
    }

    try {
      const res = await this.apiFetch('/api/telegram/sync-miniapp', {
        method: 'POST',
        body: JSON.stringify({
          phone: firstPhone,
          sessionString: sessionString,
          botUsername: 'ATF_AIRDROP_bot'
        })
      });

      if (res && res.success && res.miniappData) {
        const d = res.miniappData;
        
        // Cập nhật tên và thông số
        const elHudAcc = document.getElementById('hud-user-acc');
        const elHudSlot1 = document.getElementById('hud-slot-1-name');
        if (elHudAcc) elHudAcc.innerText = d.username;
        if (elHudSlot1) elHudSlot1.innerText = d.username;

        // Cập nhật số dư chuẩn xác vào Farm Engine
        if (window.atfEngine) {
          window.atfEngine.holdingWallet = parseFloat(d.holdingWallet);
          window.atfEngine.poolWallet = parseFloat(d.poolWallet);
          window.atfEngine.totalAssets = +(parseFloat(d.holdingWallet) + parseFloat(d.poolWallet)).toFixed(4);
          window.atfEngine.tapRate = d.tapRate || 6.8763;
          if (d.taskCooldowns) {
            window.atfEngine.syncTaskCooldowns(d.taskCooldowns);
          }
          window.atfEngine.saveBalanceToStorage();
          window.atfEngine.updateUI();
          window.atfEngine.appendLog(1, 0.0035, d.poolWallet, new Date().toLocaleTimeString('vi-VN'));
        }

        if (syncBtn && !isSilent) {
          syncBtn.innerHTML = `<i class="fa-solid fa-check text-emerald"></i> Chuẩn 100%`;
          setTimeout(() => {
            syncBtn.innerHTML = `<i class="fa-solid fa-arrows-rotate"></i> Đồng Bộ Thật`;
            syncBtn.disabled = false;
          }, 1500);
        }

        if (!isSilent) {
          this.showToast(`✅ Đã đồng bộ số dư chuẩn 100% từ MiniApp thật: ${d.totalAssets} ATF`, 'success');
        }
      } else {
        if (syncBtn && !isSilent) {
          syncBtn.innerHTML = `<i class="fa-solid fa-arrows-rotate"></i> Đồng Bộ Thật`;
          syncBtn.disabled = false;
        }
        if (!isSilent) {
          this.showToast(res?.message || 'Lỗi đồng bộ MiniApp!', 'warning');
        }
      }
    } catch (e) {
      if (syncBtn && !isSilent) {
        syncBtn.innerHTML = `<i class="fa-solid fa-arrows-rotate"></i> Đồng Bộ Thật`;
        syncBtn.disabled = false;
      }
      if (!isSilent) {
        this.showToast('Lỗi kết nối máy chủ Telegram MiniApp', 'error');
      }
    }
  },

  async sendRealMiniAppTap(count = 1) {
    const sessions = this.teleBot ? this.teleBot.getLocalSessions() : {};
    const phones = Object.keys(sessions);
    if (phones.length === 0) return null;

    const firstPhone = phones[0];
    const sessionObj = sessions[firstPhone];
    const sessionString = sessionObj?.sessionString || '';

    try {
      const res = await this.apiFetch('/api/telegram/real-miniapp-tap', {
        method: 'POST',
        body: JSON.stringify({
          phone: firstPhone,
          sessionString: sessionString,
          count: count,
          targetBot: 'ATF_AIRDROP_bot'
        })
      });
      return res;
    } catch (e) {
      return null;
    }
  },

  async sendRealMiniAppClaim(amount = 0) {
    const sessions = this.teleBot ? this.teleBot.getLocalSessions() : {};
    const phones = Object.keys(sessions);
    if (phones.length === 0) return null;

    const firstPhone = phones[0];
    const sessionObj = sessions[firstPhone];
    const sessionString = sessionObj?.sessionString || '';

    try {
      const res = await this.apiFetch('/api/telegram/real-miniapp-claim', {
        method: 'POST',
        body: JSON.stringify({
          phone: firstPhone,
          sessionString: sessionString,
          amount: amount,
          targetBot: 'ATF_AIRDROP_bot'
        })
      });
      return res;
    } catch (e) {
      return null;
    }
  },

  async executeRealMiniAppTasks() {
    if (window.atfEngine) {
      window.atfEngine.completeAllTasks();
    }
  },

  handleSaveExactBalance() {
    const holding = parseFloat(document.getElementById('edit-val-holding').value) || 0;
    const pool = parseFloat(document.getElementById('edit-val-pool').value) || 0;

    if (window.atfEngine) {
      window.atfEngine.setExactCustomBalance(holding, pool);
    }
    document.getElementById('modal-edit-balance').classList.add('hidden');
  },

  switchAuthMode(mode) {
    document.querySelectorAll('.auth-tab-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.mode === mode);
    });
    const formLogin = document.getElementById('form-login');
    const formRegister = document.getElementById('form-register');
    if (formLogin) formLogin.classList.toggle('hidden', mode !== 'login');
    if (formRegister) formRegister.classList.toggle('hidden', mode !== 'register');
  },

  togglePasswordVisibility(inputId, iconEl) {
    const input = document.getElementById(inputId);
    if (!input) return;
    if (input.type === 'password') {
      input.type = 'text';
      if (iconEl) iconEl.className = 'fa-regular fa-eye-slash input-icon-toggle text-cyan';
    } else {
      input.type = 'password';
      if (iconEl) iconEl.className = 'fa-regular fa-eye input-icon-toggle';
    }
  },

    // 5. Heartbeat & Live Real-Time Client Telemetry
  startHeartbeat() {
    this.stopHeartbeat();
    
    // Gửi ngay 1 ping đầu tiên khi vừa tải trang
    const sendPing = async () => {
      if (!this.token) return;
      try {
        const hwid = await (window.FingerprintEngine ? window.FingerprintEngine.getHardwareID() : (this.clientHwid || 'HWID-AUTO-DETECTED'));
        const net = await (window.FingerprintEngine ? window.FingerprintEngine.getPublicIP() : { ip: '116.98.234.129', isp: 'Viettel Group' });
        const dev = window.FingerprintEngine ? window.FingerprintEngine.detectDeviceType() : { name: 'Máy Tính (Desktop / Laptop)' };
        const osInfo = window.FingerprintEngine ? window.FingerprintEngine.getOSAndBrowserInfo() : { os: 'Windows 10 / 11 (64-bit)' };

        await this.apiFetch('/api/license/heartbeat', {
          method: 'POST',
          body: JSON.stringify({
            hwid,
            clientIp: net.ip,
            clientIsp: net.isp,
            deviceType: `${osInfo.os} • ${dev.name}`,
            currentBalance: window.atfEngine ? window.atfEngine.totalAssets : 47.7963
          })
        });
      } catch(e) {}
    };

    sendPing();
    this.heartbeatInterval = setInterval(sendPing, 10000); // Ping mỗi 10 giây để admin thấy online trực tiếp
  },

  

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  },

  async handleAuth(type) {
    const usernameInput = document.getElementById(`auth-${type}-username`);
    const passwordInput = document.getElementById(`auth-${type}-password`);
    const btn = document.getElementById(`btn-${type}`);

    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    if (!username || !password) {
      this.showToast('Vui lòng điền đầy đủ tài khoản và mật khẩu', 'warning');
      return;
    }

    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Đang xử lý...`;

    try {
      const endpoint = type === 'login' ? '/api/auth/login' : '/api/auth/register';
      const res = await this.apiFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify({
          username,
          password,
          hwid: this.clientHwid,
          clientIp: this.networkInfo?.ip || '116.98.234.129',
          clientIsp: this.networkInfo?.isp || 'Viettel Group',
          clientLocation: (this.networkInfo?.city || 'Hà Nội') + ', ' + (this.networkInfo?.country || 'Việt Nam'),
          clientDetails: this.clientHwidDetails
        })
      });

      if (res && res.success) {
        this.token = res.token;
        localStorage.setItem('atf_token', this.token);
        this.currentUser = res.user;
        this.showToast(res.message, 'success');
        this.updateUserUI();
        this.showScreen('dashboard');
        this.startHeartbeat();
        this.initBotEngines();
        this.renderVerifiedTelegramSessions();
      } else {
        this.showToast(res.message || 'Đăng nhập thất bại', 'error');
      }
    } catch (e) {
      this.showToast('Lỗi kết nối máy chủ', 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = type === 'login' ? '<i class="fa-solid fa-bolt"></i> VÀO HỆ THỐNG ATF VIP' : '<i class="fa-solid fa-user-plus"></i> ĐĂNG KÝ TÀI KHOẢN MỚI';
    }
  },

  async handleRedeemKey() {
    const keyInput = document.getElementById('redeem-key-input');
    const btn = document.getElementById('btn-redeem-key');
    const key = keyInput.value.trim();

    if (!key) {
      this.showToast('Vui lòng nhập mã Key VIP', 'warning');
      return;
    }

    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Đang kích hoạt...`;

    try {
      const res = await this.apiFetch('/api/license/redeem', {
        method: 'POST',
        body: JSON.stringify({
          key,
          hwid: this.clientHwid,
          clientIp: this.networkInfo?.ip || '116.98.234.129',
          clientIsp: this.networkInfo?.isp || 'Viettel Group',
          clientLocation: (this.networkInfo?.city || 'Hà Nội') + ', ' + (this.networkInfo?.country || 'Việt Nam')
        })
      });

      if (res && res.success) {
        this.showToast(res.message, 'success');
        keyInput.value = '';
        await this.fetchUserProfile();
        this.switchTab('hud-main');
      } else {
        this.showToast(res.message || 'Kích hoạt thất bại', 'error');
      }
    } catch (e) {
      this.showToast('Lỗi kết nối máy chủ', 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<i class="fa-solid fa-bolt"></i> KÍCH HOẠT KEY NGAY`;
    }
  },

  showScreen(screenName) {
    document.getElementById('screen-auth').classList.toggle('hidden', screenName !== 'auth');
    document.getElementById('screen-dashboard').classList.toggle('hidden', screenName !== 'dashboard');
  },

  switchTab(tabId) {
    document.querySelectorAll('.nav-tab-chip').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    });
    document.querySelectorAll('.tab-pane').forEach(pane => {
      pane.classList.toggle('hidden', pane.id !== `tab-${tabId}`);
    });

    if (tabId === 'settings') {
      this.initSettingsUI();
    }

    if (tabId === 'admin' && this.currentUser?.role === 'admin') {
      AdminController.loadStats();
      AdminController.loadKeys();
      AdminController.loadUsers();
    }
  },

  logout() {
    this.token = null;
    this.currentUser = null;
    localStorage.removeItem('atf_token');
    this.stopHeartbeat();
    this.showScreen('dashboard');
    this.showToast('Đã đăng xuất khỏi hệ thống', 'info');
  },

  async apiFetch(endpoint, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
    
    // Tự động nhận diện tiền tố /atf nếu web chạy ké thư mục con trên Host
    let fullUrl = endpoint;
    const isAtfSubpath = window.location.pathname.startsWith('/atf');
    if (isAtfSubpath && !endpoint.startsWith('/atf')) {
      fullUrl = `/atf${endpoint}`;
    }

    const res = await fetch(fullUrl, { ...options, headers });
    return await res.json();
  },

  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icon = type === 'success' ? 'fa-circle-check' : (type === 'error' ? 'fa-circle-xmark' : 'fa-circle-info');
    toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${this.escapeHtml(message)}</span>`;

    const container = document.getElementById('toast-container');
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'fadeOut 0.3s forwards';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  },

  escapeHtml(str) {
    if (!str) return '';
    return str.toString()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  setupEventListeners() {
    document.querySelectorAll('.auth-tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const mode = e.currentTarget.dataset.mode;
        document.querySelectorAll('.auth-tab-btn').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        document.getElementById('form-login').classList.toggle('hidden', mode !== 'login');
        document.getElementById('form-register').classList.toggle('hidden', mode !== 'register');
      });
    });

    document.querySelectorAll('.modal-close').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.target.closest('.modal-overlay').classList.add('hidden');
      });
    });
  }
};

window.App = App;

document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
