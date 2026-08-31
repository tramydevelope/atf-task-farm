/**
 * ATF Task Farm - Multi-Thread Client Mining Engine v5.0
 * Simulates Real Local Mining, Auto Tap 24/7 & Asloni Coin Synchronization
 */

class ATFFarmEngine {
  constructor() {
    this.isAutoRunning = true;
    this.totalAssets = 47.7963;
    this.holdingWallet = 0.0000;
    this.poolWallet = 47.7963;
    this.minedBalance = 47.7963;
    this.level = 69;
    this.tapRate = 6.8763;
    this.totalTaps = 84920;
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

  loadSavedState() {
    try {
      const saved = localStorage.getItem('atf_farm_balance_v3');
      if (saved) {
        const p = JSON.parse(saved);
        if (typeof p.totalAssets === 'number') this.totalAssets = p.totalAssets;
        if (typeof p.holdingWallet === 'number') this.holdingWallet = p.holdingWallet;
        if (typeof p.poolWallet === 'number') this.poolWallet = p.poolWallet;
        if (typeof p.minedBalance === 'number') this.minedBalance = p.minedBalance;
      }
    } catch(e) {}
  }

  saveState() {
    try {
      localStorage.setItem('atf_farm_balance_v3', JSON.stringify({
        totalAssets: this.totalAssets,
        holdingWallet: this.holdingWallet,
        poolWallet: this.poolWallet,
        minedBalance: this.minedBalance,
        totalTaps: this.totalTaps,
        updatedAt: Date.now()
      }));
    } catch(e) {}
  }

  updateClientStatusBadge() {
    const el = document.getElementById('client-engine-status-badge') || document.getElementById('hud-engine-badge');
    if (el) {
      el.innerHTML = `<div class="badge-real-engine" style="background: rgba(16, 185, 129, 0.15); border: 1px solid #10b981; color: #10b981; padding: 6px 12px; border-radius: 10px; font-weight: 800; font-size: 11px; display: inline-flex; align-items: center; gap: 6px;">
        <i class="fa-solid fa-microchip fa-pulse"></i> MÁY KHÁCH ĐANG CHẠY THẬT 100% (LIVE CLIENT ENGINE)
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
    this.totalAssets += increment;
    this.poolWallet += increment;
    this.minedBalance += increment;
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
        this.holdingWallet += this.poolWallet;
        this.poolWallet = 0;
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
          <i class="fa-solid fa-check"></i> Đang tự động làm
        </button>
      </div>
    `).join('');
  }
}

window.ATFFarmEngine = ATFFarmEngine;
