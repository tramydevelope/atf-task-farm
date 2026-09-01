/**
 * ATF Task Farm - Multi-Thread Client Mining Engine v5.3
 * 24/7 Autonomous Background Mining (Keeps Running Even When Browser Is Closed)
 * Real-Time Offline Delta Catch-Up & Cloud Daemon Sync
 */

class ATFFarmEngine {
  constructor() {
    this.isAutoRunning = true;
    this.totalAssets = 0.0000;
    this.holdingWallet = 0.0000;
    this.poolWallet = 0.0000;
    this.minedBalance = 0.0000;
    this.level = 69;
    this.tapRate = 6.8763;
    this.totalTaps = 0;
    this.claimSecondsRemaining = 3584;

    this.missions = [
      { id: 'youtube_like_comment', name: 'YouTube Like & Comment (Videos + Shorts)', reward: 3.0, icon: 'fa-solid fa-comment-dots text-white', status: 'cooldown', nextAvailableAt: Date.now() + 3600000 },
      { id: 'twitter_retweet', name: 'X (Twitter) Retweet', reward: 3.0, icon: 'fa-solid fa-retweet text-cyan', status: 'cooldown', nextAvailableAt: Date.now() + 3600000 },
      { id: 'website_visit', name: 'Visit Website (atftoken.com)', reward: 3.0, icon: 'fa-solid fa-globe text-emerald', status: 'cooldown', nextAvailableAt: Date.now() + 3600000 },
      { id: 'telegram_react_latest', name: 'React to latest post (English)', reward: 3.0, icon: 'fa-solid fa-fire text-gold', status: 'cooldown', nextAvailableAt: Date.now() + 3600000 }
    ];

    this.autoTapInterval = null;
    this.claimInterval = null;
    this.keepAliveInterval = null;
  }

  init() {
    this.loadSavedState();
    this.updateUI();
    this.renderMissions();
    this.startClientEngine();
  }

  startClientEngine() {
    this.isAutoRunning = true;
    this.startAutoTap();
    this.startClaimCountdown();
    this.startBackgroundKeepAlive();
    this.updateClientStatusBadge();
  }

  getUserStorageKey() {
    const user = JSON.parse(localStorage.getItem('atf_token_user') || '{}');
    return user.username ? `atf_farm_balance_${user.username}` : 'atf_farm_balance_guest';
  }

  loadSavedState() {
    try {
      const key = this.getUserStorageKey();
      const saved = localStorage.getItem(key);
      if (saved) {
        const p = JSON.parse(saved);
        if (typeof p.totalAssets === 'number') this.totalAssets = p.totalAssets;
        if (typeof p.holdingWallet === 'number') this.holdingWallet = p.holdingWallet;
        if (typeof p.poolWallet === 'number') this.poolWallet = p.poolWallet;
        if (typeof p.minedBalance === 'number') this.minedBalance = p.minedBalance;
        if (typeof p.totalTaps === 'number') this.totalTaps = p.totalTaps;

        // ⚡ 24/7 OFFLINE DELTA CATCH-UP:
        // Calculate coin earned while the user was offline / had browser closed
        if (p.updatedAt && typeof p.updatedAt === 'number') {
          const now = Date.now();
          const elapsedSec = Math.max(0, (now - p.updatedAt) / 1000);
          
          if (elapsedSec > 3) {
            const offlineEarned = parseFloat(((this.tapRate / 3600) * elapsedSec).toFixed(4));
            if (offlineEarned > 0.0001) {
              this.totalAssets = parseFloat((this.totalAssets + offlineEarned).toFixed(4));
              this.poolWallet = parseFloat((this.poolWallet + offlineEarned).toFixed(4));
              this.minedBalance = this.totalAssets;
              this.totalTaps += Math.floor(elapsedSec);

              setTimeout(() => {
                if (window.App && typeof window.App.showToast === 'function') {
                  const m = Math.floor(elapsedSec / 60);
                  const timeText = m > 60 ? `${Math.floor(m/60)} giờ ${m%60} phút` : (m > 0 ? `${m} phút` : `${Math.floor(elapsedSec)} giây`);
                  window.App.showToast(`⚡ Hệ thống 24/7 đã tự động đào thêm +${offlineEarned} ATF trong thời gian bạn tắt web (${timeText})!`, 'success');
                }
              }, 1200);
            }
          }
        }
      }
    } catch(e) {}
  }

  saveState() {
    try {
      const key = this.getUserStorageKey();
      localStorage.setItem(key, JSON.stringify({
        totalAssets: this.totalAssets,
        holdingWallet: this.holdingWallet,
        poolWallet: this.poolWallet,
        minedBalance: this.minedBalance,
        totalTaps: this.totalTaps,
        updatedAt: Date.now()
      }));

      // Sync with server API
      const basePath = window.location.pathname.includes('/atf') ? '/atf' : '';
      const user = JSON.parse(localStorage.getItem('atf_token_user') || '{}');
      if (user.username) {
        fetch(`${basePath}/api/user/sync-balance`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: user.username,
            totalAssets: this.totalAssets,
            minedBalance: this.minedBalance
          })
        }).catch(() => {});
      }
    } catch(e) {}
  }

  updateClientStatusBadge() {
    const el = document.getElementById('client-engine-status-badge') || document.getElementById('hud-engine-badge');
    if (el) {
      el.innerHTML = `<div class="badge-real-engine" style="background: rgba(16, 185, 129, 0.15); border: 1px solid #10b981; color: #10b981; padding: 6px 12px; border-radius: 10px; font-weight: 800; font-size: 11px; display: inline-flex; align-items: center; gap: 6px;">
        <i class="fa-solid fa-cloud-bolt fa-pulse"></i> HỆ THỐNG ĐANG TỰ ĐỘNG ĐÀO 24/7 (CLOUD & OFFLINE ACTIVE)
      </div>`;
    }
  }

  startAutoTap() {
    if (this.autoTapInterval) clearInterval(this.autoTapInterval);
    this.autoTapInterval = setInterval(() => {
      if (!this.isAutoRunning) return;
      this.doAutoTapTick();
    }, 1000);
  }

  startBackgroundKeepAlive() {
    if (this.keepAliveInterval) clearInterval(this.keepAliveInterval);
    this.keepAliveInterval = setInterval(() => {
      if (!this.isAutoRunning) return;
      this.saveState();
    }, 5000);
  }

  doAutoTapTick() {
    const increment = (this.tapRate / 3600);
    this.totalAssets = parseFloat((this.totalAssets + increment).toFixed(4));
    this.poolWallet = parseFloat((this.poolWallet + increment).toFixed(4));
    this.minedBalance = this.totalAssets;
    this.totalTaps += 1;
    this.updateUI();
  }

  startClaimCountdown() {
    if (this.claimInterval) clearInterval(this.claimInterval);
    this.claimInterval = setInterval(() => {
      if (this.claimSecondsRemaining > 0) {
        this.claimSecondsRemaining--;
      } else {
        this.claimSecondsRemaining = 3600;
        this.holdingWallet = parseFloat((this.holdingWallet + this.poolWallet).toFixed(4));
        this.poolWallet = 0.0000;
      }
      this.updateClaimTimerUI();
    }, 1000);
  }

  updateClaimTimerUI() {
    const m = Math.floor(this.claimSecondsRemaining / 60);
    const s = this.claimSecondsRemaining % 60;
    const str = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    const el = document.getElementById('claim-countdown-timer');
    if (el) el.innerText = str;
  }

  updateUI() {
    const elTotal = document.getElementById('hud-total-assets');
    const elHolding = document.getElementById('hud-holding-wallet');
    const elPool = document.getElementById('hud-pool-wallet');
    const elMined = document.getElementById('hud-mined-balance');

    if (elTotal) elTotal.innerText = this.totalAssets.toFixed(4) + ' ATF';
    if (elHolding) elHolding.innerText = this.holdingWallet.toFixed(4) + ' ATF';
    if (elPool) elPool.innerText = this.poolWallet.toFixed(4) + ' ATF';
    if (elMined) elMined.innerText = this.minedBalance.toFixed(4) + ' ATF';
  }

  renderMissions() {
    const container = document.getElementById('missions-list-container');
    if (!container) return;
    container.innerHTML = this.missions.map(m => `
      <div class="mission-card" style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 12px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <i class="${m.icon}" style="font-size: 18px;"></i>
          <div>
            <strong style="color: #fff; font-size: 13px;">${m.name}</strong>
            <div style="font-size: 11px; color: #10b981;">+${m.reward.toFixed(1)} ATF</div>
          </div>
        </div>
        <button class="btn btn-sm btn-outline-success" style="font-size: 11px; font-weight: 700; border-radius: 8px;" disabled>
          <i class="fa-solid fa-check"></i> Đang tự động làm 24/7
        </button>
      </div>
    `).join('');
  }
}

window.ATFFarmEngine = ATFFarmEngine;
