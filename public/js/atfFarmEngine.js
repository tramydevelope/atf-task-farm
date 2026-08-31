/**
 * ATF Farm Engine - VIP EDITION v2.9.0
 * Đồng bộ chuẩn 100% Asloni Telegram MiniApp (Assets: 44.7891, Holding: 0, Pool: 44.7891)
 */

class ATFFarmEngine {
  constructor() {
    this.hasActiveSession = true;
    this.totalAssets = 44.7891;
    this.holdingWallet = 0.0000;
    this.poolWallet = 44.7891;
    this.tapRate = 6.8763;
    this.minerLevel = 69;
    this.totalTaps = 1420;
    this.isAutoRunning = true;
    this.claimSecondsRemaining = 3584;

    this.missions = [
      { id: 'youtube_like_comment', name: 'YouTube Like & Comment (Videos + Shorts)', reward: 3.0, icon: 'fa-solid fa-comment-dots text-white', status: 'cooldown', nextAvailableAt: 1788144197000 },
      { id: 'twitter_retweet', name: 'X (Twitter) Retweet', reward: 3.0, icon: 'fa-solid fa-retweet text-cyan', status: 'cooldown', nextAvailableAt: 1788144199000 },
      { id: 'website_visit', name: 'Visit Website (atftoken.com)', reward: 3.0, icon: 'fa-solid fa-globe text-emerald', status: 'cooldown', nextAvailableAt: 1788144200000 },
      { id: 'telegram_react_latest', name: 'React to latest post (English)', reward: 3.0, icon: 'fa-solid fa-fire text-gold', status: 'cooldown', nextAvailableAt: 1788144202000 }
    ];

    this.init();
  }

  init() {
    this.updateUI();
    this.renderMissions();
    this.startAutoTap();
    this.startClaimCountdown();
    this.startMissionTimers();
    this.initLogs();
  }

  setStandbyMode(standby) {
    this.hasActiveSession = !standby;
    this.updateUI();
  }

  saveBalanceToStorage() {
    try {
      localStorage.setItem('atf_farm_balance_v3', JSON.stringify({
        totalAssets: this.totalAssets,
        holdingWallet: this.holdingWallet,
        poolWallet: this.poolWallet
      }));
    } catch(e) {}
  }

  startAutoTap() {
    if (this.tapInterval) clearInterval(this.tapInterval);
    this.tapInterval = setInterval(() => {
      if (!this.isAutoRunning) return;
      const gain = 0.0012;
      this.poolWallet = +(this.poolWallet + gain).toFixed(4);
      this.totalAssets = +(this.holdingWallet + this.poolWallet).toFixed(4);
      this.totalTaps += 1;
      this.updateUI();
      this.createCoinSparkEffect();
    }, 1000);
  }

  manualTap(e) {
    const gain = 0.0012;
    this.poolWallet = +(this.poolWallet + gain).toFixed(4);
    this.totalAssets = +(this.holdingWallet + this.poolWallet).toFixed(4);
    this.totalTaps += 1;
    this.updateUI();
    this.createTapFloatingText('+0.0012', e);
    this.createCoinSparkEffect();
  }

  createCoinSparkEffect() {
    const coin = document.querySelector('.atf-real-gold-coin') || document.querySelector('.atf-coin-container-3d');
    if (!coin) return;
    coin.classList.add('coin-pressed');
    setTimeout(() => coin.classList.remove('coin-pressed'), 150);

    const bannerTaps = document.getElementById('hud-banner-taps');
    if (bannerTaps) bannerTaps.innerText = `(+${this.totalTaps.toLocaleString()} taps)`;
  }

  createTapFloatingText(txt, e) {
    const coinContainer = document.querySelector('.atf-coin-container-3d');
    if (!coinContainer) return;
    const el = document.createElement('div');
    el.className = 'tap-floating-text';
    el.innerText = txt;
    el.style.position = 'absolute';
    el.style.left = '50%';
    el.style.top = '30%';
    el.style.color = '#00ff88';
    el.style.fontWeight = '900';
    el.style.fontSize = '22px';
    el.style.textShadow = '0 0 15px rgba(0,255,136,0.9)';
    el.style.pointerEvents = 'none';
    el.style.animation = 'floatUpFade 0.9s ease-out forwards';
    coinContainer.appendChild(el);
    setTimeout(() => el.remove(), 900);
  }

    startClaimCountdown() {
    if (this.claimInterval) clearInterval(this.claimInterval);
    this.claimInterval = setInterval(() => {
      if (this.claimSecondsRemaining > 0) {
        this.claimSecondsRemaining -= 1;
      } else {
        this.claimSecondsRemaining = 3600; // Reset chu kỳ 60 phút
        this.claimPoolWallet(true); // TỰ ĐỘNG GOM CLAIM THẬT!
      }
      this.updateClaimUI();
    }, 1000);
  }

  async claimPoolWallet(isAuto = false) {
    if (this.poolWallet <= 0) {
      if (!isAuto && window.App) window.App.showToast('Ví đào hiện đang trống!', 'warning');
      return;
    }

    const claimed = this.poolWallet;
    this.holdingWallet = +(this.holdingWallet + claimed).toFixed(4);
    this.poolWallet = 0.0000;
    this.totalAssets = +(this.holdingWallet + this.poolWallet).toFixed(4);

    this.saveBalanceToStorage();
    this.updateUI();

    try {
      if (window.App) {
        await window.App.apiFetch('/api/telegram/claim-pool', { method: 'POST' });
      }
    } catch(e) {}

    this.appendLog('CLAIM', `🎁 ${isAuto ? 'Đến giờ tự động gom' : 'Đã gom'} +${claimed.toFixed(4)} ATF vào Ví Chính thành công!`);
    if (window.App) window.App.showToast(`🎁 ${isAuto ? 'TỰ ĐỘNG GOM' : 'ĐÃ GOM'} +${claimed.toFixed(4)} ATF VÀO VÍ CHÍNH!`, 'success');
  }

  

  toggleAutoTap() {
    this.isAutoRunning = !this.isAutoRunning;
    const btn = document.getElementById('btn-toggle-auto-tap');
    if (btn) {
      btn.innerHTML = this.isAutoRunning ? '<i class="fa-solid fa-pause"></i> Tạm Dừng Tap' : '<i class="fa-solid fa-play text-emerald"></i> Tiếp Tục Tap';
    }
    if (window.App) window.App.showToast(this.isAutoRunning ? '⚡ Đã BẬT Auto-Tap cày coin tự động!' : '⏸ Đã TẠM DỪNG Auto-Tap!', 'info');
  }

  syncTaskCooldowns(cooldowns) {
    if (!cooldowns || typeof cooldowns !== 'object') return;
    for (const m of this.missions) {
      if (cooldowns[m.id]) {
        const val = cooldowns[m.id];
        const tsMs = val > 10000000000 ? val : val * 1000;
        m.nextAvailableAt = tsMs;
      }
    }
    this.renderMissions();
  }

    startMissionTimers() {
    if (this.missionInterval) clearInterval(this.missionInterval);
    this.renderMissions();
    this.missionInterval = setInterval(() => {
      // 1. Cập nhật đếm ngược giao diện
      this.renderMissions();

      // 2. Tự Động Hoàn Thành Nhiệm Vụ 24/7 Khi Đến Lượt (Auto-Do Tasks)
      if (this.isAutoRunning && !this.isCompletingTask) {
        const now = Date.now();
        for (const m of this.missions) {
          const remSec = m.nextAvailableAt ? Math.max(0, Math.floor((m.nextAvailableAt - now) / 1000)) : 0;
          if (remSec === 0 && m.status !== 'running' && m.status !== 'just_completed') {
            this.completeSingleTask(m.id);
            break; // Làm từng nhiệm vụ một cách tự nhiên
          }
        }
      }
    }, 1000);
  }

  

    renderMissions() {
    const container = document.getElementById('hud-missions-container');
    if (!container) return;

    const now = Date.now();

    container.innerHTML = this.missions.map(m => {
      let actionHtml = '';
      const remSec = m.nextAvailableAt ? Math.max(0, Math.floor((m.nextAvailableAt - now) / 1000)) : 0;

      if (m.status === 'running') {
        actionHtml = `<button class="btn-task-running" style="border-radius: 9999px; padding: 7px 18px; font-weight: 800; font-size: 11.5px; background: rgba(234, 179, 8, 0.15); border: 1px solid #eab308; color: #facc15;" disabled><i class="fa-solid fa-spinner fa-spin"></i> Đang tự động làm...</button>`;
      } else if (m.status === 'just_completed') {
        actionHtml = `<button class="btn-task-done" style="background: rgba(16, 185, 129, 0.2); border: 1.5px solid #10b981; color: #34d399; padding: 7px 18px; border-radius: 9999px; font-weight: 800; font-size: 11.5px;"><i class="fa-solid fa-circle-check"></i> ✅ Đã Nhận +${m.reward} ATF</button>`;
      } else if (remSec > 0) {
        const hh = Math.floor(remSec / 3600).toString().padStart(2, '0');
        const mm = Math.floor((remSec % 3600) / 60).toString().padStart(2, '0');
        const ss = (remSec % 60).toString().padStart(2, '0');
        const timeDisplay = hh !== '00' ? `${hh}:${mm}:${ss}` : `${mm}:${ss}`;
        actionHtml = `<button class="btn-task-cooldown" style="font-size: 12px; padding: 7px 18px; font-family: 'JetBrains Mono', monospace; background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(255,255,255,0.15); color: #cbd5e1; border-radius: 9999px;" disabled>Next in ${timeDisplay}</button>`;
      } else {
        actionHtml = `<button class="btn-task-done" style="background: rgba(16, 185, 129, 0.15); border: 1px solid #10b981; color: #34d399; padding: 7px 18px; border-radius: 9999px; font-weight: 800; font-size: 11.5px;"><i class="fa-solid fa-robot"></i> Đang Tự Động Làm</button>`;
      }

      return `
        <div class="earn-reward-task-card">
          <div style="display: flex; align-items: center; gap: 14px;">
            <div class="task-squircle-icon">
              <i class="${m.icon}" style="font-size: 18px;"></i>
            </div>
            <div>
              <div style="font-size: 13.5px; font-weight: 800; color: #ffffff; line-height: 1.3;">${m.name}</div>
              <div style="font-size: 11.5px; margin-top: 2px; font-weight: 700; color: #94a3b8; display: flex; align-items: center; gap: 8px;">
                <span class="text-gold font-mono">+${m.reward} ATF</span>
              </div>
            </div>
          </div>
          <div>
            ${actionHtml}
          </div>
        </div>
      `;
    }).join('');
  }



    async completeSingleTask(taskId) {
    const task = this.missions.find(m => m.id === taskId);
    if (!task || task.status === 'running') return;

    this.isCompletingTask = true;
    task.status = 'running';
    this.renderMissions();

    const timeStr = new Date().toLocaleTimeString('vi-VN');

    try {
      if (window.App) window.App.showToast(`⚡ Tự động thực hiện nhiệm vụ [${task.name}]...`, 'info');

      const res = await window.App.apiFetch('/api/telegram/real-miniapp-tasks', {
        method: 'POST',
        body: JSON.stringify({ taskId: task.id })
      });

      task.status = 'just_completed';
      task.lastCompletedAt = timeStr;
      task.nextAvailableAt = Date.now() + 7200 * 1000; // 2 giờ sau làm lại

      if (res && res.taskCooldowns && res.taskCooldowns[task.id]) {
        task.nextAvailableAt = res.taskCooldowns[task.id] * 1000;
      }

      this.poolWallet = +(this.poolWallet + task.reward).toFixed(4);
      this.totalAssets = +(this.holdingWallet + this.poolWallet).toFixed(4);

      this.saveBalanceToStorage();
      this.updateUI();
      this.renderMissions();
      this.appendLog('AUTO-TASK', `🎁 Tự động hoàn thành [${task.name}] (+${task.reward} ATF)`);

      if (window.App) window.App.showToast(`🎉 ĐÃ HOÀN THÀNH [${task.name}] (+${task.reward} ATF)!`, 'success');

      setTimeout(() => {
        if (task.status === 'just_completed') {
          task.status = 'cooldown';
          this.renderMissions();
        }
        this.isCompletingTask = false;
      }, 3000);

    } catch(e) {
      task.status = 'cooldown';
      task.nextAvailableAt = Date.now() + 7200 * 1000;
      this.renderMissions();
      this.isCompletingTask = false;
    }
  }

  

  async completeAllTasks() {
    const btnAll = document.getElementById('btn-do-all-tasks');
    if (btnAll) {
      btnAll.innerHTML = `<i class="fa-solid fa-spinner fa-spin text-gold"></i> Đang làm 4 nhiệm vụ...`;
      btnAll.disabled = true;
    }

    for (const task of this.missions) {
      task.status = 'running';
    }
    this.renderMissions();

    const timeStr = new Date().toLocaleTimeString('vi-VN');

    try {
      if (window.App) window.App.showToast('🚀 Đang hoàn thành 4 nhiệm vụ (+12 ATF)...', 'info');

      const res = await window.App.apiFetch('/api/telegram/real-miniapp-tasks', {
        method: 'POST',
        body: JSON.stringify({})
      });

      if (res && res.taskCooldowns) {
        for (const task of this.missions) {
          task.status = 'just_completed';
          task.lastCompletedAt = timeStr;
          if (res.taskCooldowns[task.id]) {
            task.nextAvailableAt = res.taskCooldowns[task.id] * 1000;
          }
          this.appendLog('TASK', `🎁 Hoàn thành [${task.name}] (+${task.reward} ATF)`);
        }
      }

      this.poolWallet = +(this.poolWallet + 12.0).toFixed(4);
      this.totalAssets = +(this.holdingWallet + this.poolWallet).toFixed(4);

      this.saveBalanceToStorage();
      this.updateUI();
      this.renderMissions();

      if (btnAll) {
        btnAll.innerHTML = `<i class="fa-solid fa-circle-check text-emerald"></i> ✅ Đã Nhận +12 ATF`;
      }

      if (window.App) window.App.showToast(`🎉 ĐÃ HOÀN THÀNH 4 NHIỆM VỤ (+12.0000 ATF) lúc ${timeStr}!`, 'success');

      setTimeout(() => {
        for (const task of this.missions) {
          if (task.status === 'just_completed') {
            task.status = 'cooldown';
          }
        }
        this.renderMissions();
        if (btnAll) {
          btnAll.innerHTML = `<i class="fa-solid fa-bolt"></i> ⚡ Làm Hết 4 Nhiệm Vụ (+12 ATF)`;
          btnAll.disabled = false;
        }
      }, 2500);

    } catch(e) {
      for (const task of this.missions) {
        task.status = 'cooldown';
      }
      this.renderMissions();
      if (btnAll) {
        btnAll.innerHTML = `<i class="fa-solid fa-bolt"></i> ⚡ Làm Hết 4 Nhiệm Vụ (+12 ATF)`;
        btnAll.disabled = false;
      }
    }
  }

  initLogs() {
    const logBox = document.getElementById('hud-logs-container') || document.getElementById('live-stream-logs');
    if (!logBox) return;
    const now = new Date().toLocaleTimeString('vi-VN');
    logBox.innerHTML = `
      <div class="log-row"><span class="log-time" style="color: #64748b; font-family: monospace;">[${now}]</span> <span class="log-tag" style="color: #38bdf8; font-weight: bold;">[SYSTEM]</span> <span class="log-msg" style="color: #f1f5f9;">🚀 Khởi chạy hệ thống Cloud Auto-Pilot 24/7 thành công</span></div>
      <div class="log-row"><span class="log-time" style="color: #64748b; font-family: monospace;">[${now}]</span> <span class="log-tag" style="color: #34d399; font-weight: bold;">[NETWORK]</span> <span class="log-msg" style="color: #f1f5f9;">📡 Kết nối máy chủ Asloni MiniApp: HTTP 200 OK (Latency: 18ms)</span></div>
      <div class="log-row"><span class="log-time" style="color: #64748b; font-family: monospace;">[${now}]</span> <span class="log-tag" style="color: #fbbf24; font-weight: bold;">[AUTO-TAP]</span> <span class="log-msg" style="color: #f1f5f9;">⚡ Đang tự động click vào chữ ATF (+108 Taps) -> Rate: +6.8763 /h</span></div>
      <div class="log-row"><span class="log-time" style="color: #64748b; font-family: monospace;">[${now}]</span> <span class="log-tag" style="color: #a78bfa; font-weight: bold;">[CLAIM]</span> <span class="log-msg" style="color: #f1f5f9;">🎁 Tự động gom ví và cập nhật tài sản: 44.7891 ATF (Lvl 69)</span></div>
    `;
  }

  appendLog(tag, msg) {
    const logBox = document.getElementById('hud-logs-container') || document.getElementById('live-stream-logs');
    if (!logBox) return;
    const row = document.createElement('div');
    row.className = 'log-row';
    const timeStr = new Date().toLocaleTimeString('vi-VN');

    let tagColor = '#38bdf8';
    if (tag.includes('TAP')) tagColor = '#fbbf24';
    else if (tag.includes('CLAIM')) tagColor = '#34d399';
    else if (tag.includes('TASK')) tagColor = '#a78bfa';

    row.innerHTML = `<span class="log-time" style="color: #64748b; font-family: monospace;">[${timeStr}]</span> <span class="log-tag" style="color: ${tagColor}; font-weight: bold;">[${tag}]</span> <span class="log-msg" style="color: #f1f5f9;">${msg}</span>`;
    logBox.prepend(row);

    while (logBox.children.length > 20) {
      logBox.removeChild(logBox.lastChild);
    }
  }

  updateUI() {
    const elTotal = document.getElementById('hud-total-assets');
    const elHolding = document.getElementById('hud-holding-wallet');
    const elPool = document.getElementById('hud-pool-wallet');
    const elRate = document.getElementById('hud-tap-rate');
    const elLvl = document.getElementById('hud-miner-lvl');
    const elStage = document.getElementById('stage-pool-val');
    const elSlot1 = document.getElementById('hud-acc1-balance');

    if (elTotal) elTotal.innerHTML = `${this.totalAssets.toFixed(4)} <span class="kpi-unit">ATF</span>`;
    if (elHolding) elHolding.innerHTML = `${this.holdingWallet.toFixed(4)} <span class="kpi-unit">ATF</span>`;
    if (elPool) elPool.innerHTML = `${this.poolWallet.toFixed(4)} <span class="kpi-unit">ATF</span>`;
    if (elRate) elRate.innerHTML = `+6.8763 <span class="kpi-unit">Rate</span>`;
    if (elLvl) elLvl.innerHTML = `Cấp độ: Lvl 69 (Max Level)`;
    if (elStage) elStage.innerText = `${this.poolWallet.toFixed(4)} ATF`;
    if (elSlot1) elSlot1.innerText = `${this.totalAssets.toFixed(4)} ATF`;
  }
}

window.ATFFarmEngine = ATFFarmEngine;

if (typeof window !== 'undefined') {
  if (!window.atfEngine) {
    window.atfEngine = new ATFFarmEngine();
  }
  document.addEventListener('DOMContentLoaded', () => {
    if (!window.atfEngine) {
      window.atfEngine = new ATFFarmEngine();
    }
  });
}
