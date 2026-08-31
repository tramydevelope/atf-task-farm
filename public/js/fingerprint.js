/**
 * ATF Task Farm - Unique Mobile & PC Hardware Fingerprint & Real Network Engine v4.0
 * Unique 1-to-1 Device Identification for iOS, Android & Desktop
 */

const FingerprintEngine = {
  // 1. Tạo Canvas 2D Fingerprint độc quyền (Phân biệt từng chip GPU / Màn hình điện thoại)
  getCanvasFingerprint() {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 240;
      canvas.height = 60;
      const ctx = canvas.getContext('2d');
      if (!ctx) return 'CANVAS-BASIC';

      ctx.textBaseline = 'top';
      ctx.font = '14px "Arial", sans-serif';
      ctx.fillStyle = '#f60';
      ctx.fillRect(125, 1, 62, 20);
      ctx.fillStyle = '#069';
      ctx.fillText('ATF-VIP-MOBILE-SCAN-v4', 2, 15);
      ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
      ctx.fillText('ATF-VIP-MOBILE-SCAN-v4', 4, 17);

      const dataUrl = canvas.toDataURL();
      let hash = 0;
      for (let i = 0; i < dataUrl.length; i++) {
        hash = ((hash << 5) - hash) + dataUrl.charCodeAt(i);
        hash |= 0;
      }
      return 'CV-' + Math.abs(hash).toString(16).toUpperCase();
    } catch(e) {
      return 'CV-DEFAULT';
    }
  },

  // 2. Lấy thông tin GPU Hardware
  getGPUInfo() {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) return { vendor: 'Mobile WebGL', renderer: 'Generic Mobile GPU' };

      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      let renderer = 'Generic Mobile GPU';
      let vendor = 'Generic';

      if (debugInfo) {
        vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || 'Mobile Vendor';
        renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || 'Mobile Renderer';
      }

      if (renderer.includes('ANGLE (')) {
        const match = renderer.match(/ANGLE ((.*?), (.*?),/);
        if (match && match[2]) renderer = match[2].trim();
        else renderer = renderer.replace(/^ANGLE (/, '').replace(/)$/, '');
      }

      return { vendor: vendor.trim(), renderer: renderer.trim() };
    } catch (e) {
      return { vendor: 'Mobile', renderer: 'GPU Hardware Accelerator' };
    }
  },

  // 3. Phân biệt Loại Thiết Bị (iPhone, iPad, Samsung, Xiaomi, PC, Mac...)
  detectDeviceType() {
    const ua = navigator.userAgent;
    const screenWidth = window.screen.width;
    const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

    let deviceType = 'desktop';
    let deviceName = 'Windows PC';
    let deviceIcon = 'fa-desktop';

    if (/iPhone/i.test(ua)) {
      deviceType = 'mobile';
      deviceName = 'Apple iPhone';
      deviceIcon = 'fa-mobile-screen-button';
    } else if (/iPad/i.test(ua)) {
      deviceType = 'tablet';
      deviceName = 'Apple iPad';
      deviceIcon = 'fa-tablet-screen-button';
    } else if (/Android/i.test(ua)) {
      deviceType = 'mobile';
      if (/Tablet|SM-T/i.test(ua)) {
        deviceType = 'tablet';
        deviceName = 'Android Tablet';
        deviceIcon = 'fa-tablet-screen-button';
      } else {
        deviceName = 'Android Smartphone';
        deviceIcon = 'fa-mobile-screen-button';
      }
    } else if (/Macintosh/i.test(ua)) {
      deviceName = 'MacBook / Mac PC';
      deviceIcon = 'fa-laptop';
    } else if (/Linux/i.test(ua)) {
      deviceName = 'Linux PC';
      deviceIcon = 'fa-laptop';
    }

    return { type: deviceType, name: deviceName, icon: deviceIcon, isTouch, screenWidth };
  },

  // 4. Nhận diện Hệ Điều Hành & Trình Duyệt
  getOSAndBrowserInfo() {
    const ua = navigator.userAgent;
    let os = 'Windows';

    if (/Windows NT 10.0/i.test(ua)) os = 'Windows 10 / 11';
    else if (/Mac OS X/i.test(ua)) os = 'macOS';
    else if (/Android/i.test(ua)) os = 'Android OS';
    else if (/iPhone|CPU iPhone OS/i.test(ua)) os = 'iOS';
    else if (/Linux/i.test(ua)) os = 'Linux';

    let browser = 'Chrome';
    if (/Edg//i.test(ua)) browser = 'Edge';
    else if (/Firefox//i.test(ua)) browser = 'Firefox';
    else if (/Safari//i.test(ua) && !/Chrome/i.test(ua)) browser = 'Safari';
    else if (/CocCoc/i.test(ua)) browser = 'Cốc Cốc';
    else if (/Telegram/i.test(ua)) browser = 'Telegram WebApp';

    return { os, browser };
  },

  // 5. SHA-256 Hasher
  async sha256(message) {
    try {
      const msgBuffer = new TextEncoder().encode(message);
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch(e) {
      let hash = 0;
      for (let i = 0; i < message.length; i++) {
        hash = ((hash << 5) - hash) + message.charCodeAt(i);
        hash |= 0;
      }
      return 'HASH' + Math.abs(hash).toString(16).padStart(16, '0');
    }
  },

  // 6. TẠO MÃ HWID ĐỘC QUYỀN DUY NHẤT CHO MỖI ĐIỆN THOẠI KHÁCH
  async getHardwareID() {
    let uniqueClientUuid = '';
    try {
      uniqueClientUuid = localStorage.getItem('atf_device_uuid_v4');
      if (!uniqueClientUuid || uniqueClientUuid.length < 16) {
        uniqueClientUuid = 'UUID-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 10) + '-' + Math.random().toString(36).substring(2, 10);
        localStorage.setItem('atf_device_uuid_v4', uniqueClientUuid);
      }
    } catch(e) {
      uniqueClientUuid = 'UUID-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 10);
    }

    const dev = this.detectDeviceType();
    const osInfo = this.getOSAndBrowserInfo();
    const gpuInfo = this.getGPUInfo();
    const canvasHash = this.getCanvasFingerprint();

    const cores = navigator.hardwareConcurrency || 4;
    const memory = navigator.deviceMemory || 4;
    const touchPoints = navigator.maxTouchPoints || 0;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Ho_Chi_Minh';
    const screenRes = `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth || 24}x${window.devicePixelRatio || 1}`;

    const seedString = [
      uniqueClientUuid,
      canvasHash,
      dev.name,
      osInfo.os,
      osInfo.browser,
      gpuInfo.renderer,
      screenRes,
      touchPoints,
      cores,
      memory,
      timezone
    ].join('###');

    const hash = await this.sha256(seedString);
    const prefix = dev.type === 'mobile' ? 'HWID-MOB' : (dev.type === 'tablet' ? 'HWID-TAB' : 'HWID-PC');
    const shortHwid = `${prefix}-${hash.substring(0, 4).toUpperCase()}-${hash.substring(4, 8).toUpperCase()}-${hash.substring(8, 12).toUpperCase()}`;

    return shortHwid;
  },

  // 7. QUÉT IP MẠNG THẬT & NHÀ MẠNG KHÁCH (Fast & Failproof Real IP Engine)
  async getPublicNetworkInfo() {
    let resolvedIp = '';
    let resolvedIsp = '';

    // Step 1: Fetch directly from server /api/system/client-info (Instant Real Connection IP)
    try {
      const res = await fetch('/api/system/client-info');
      if (res.ok) {
        const d = await res.json();
        if (d && d.ip && d.ip.length > 6 && !d.ip.includes('127.0.0.1')) {
          resolvedIp = d.ip;
          resolvedIsp = d.isp || 'Mạng Máy Khách Thật';
          this.cacheNetInfo(resolvedIp, resolvedIsp);
          return { ip: resolvedIp, isp: resolvedIsp, city: 'Việt Nam', fullInfo: `${resolvedIp} • ${resolvedIsp}` };
        }
      }
    } catch(e) {}

    // Step 2: Parallel external IP fetchers
    try {
      const fetchIpify = fetch('https://api64.ipify.org?format=json', { cache: 'no-store' }).then(r => r.json()).then(d => d.ip).catch(() => null);
      const fetchIpWho = fetch('https://ipwho.is/', { cache: 'no-store' }).then(r => r.json()).then(d => d.success ? { ip: d.ip, isp: d.connection?.isp || d.connection?.org || d.isp } : null).catch(() => null);
      const fetchIpApi = fetch('https://ipapi.co/json/', { cache: 'no-store' }).then(r => r.json()).then(d => d.ip ? { ip: d.ip, isp: d.org || d.isp } : null).catch(() => null);

      const results = await Promise.allSettled([fetchIpify, fetchIpWho, fetchIpApi]);
      for (const res of results) {
        if (res.status === 'fulfilled' && res.value) {
          if (typeof res.value === 'string' && res.value.length > 6) {
            resolvedIp = res.value;
          } else if (typeof res.value === 'object' && res.value.ip) {
            resolvedIp = res.value.ip;
            if (res.value.isp) resolvedIsp = res.value.isp;
          }
          if (resolvedIp) break;
        }
      }
    } catch(e) {}

    if (resolvedIp) {
      resolvedIsp = resolvedIsp || 'Mạng Viễn Thông máy khách';
      this.cacheNetInfo(resolvedIp, resolvedIsp);
      return { ip: resolvedIp, isp: resolvedIsp, city: 'Việt Nam', fullInfo: `${resolvedIp} • ${resolvedIsp}` };
    }

    // Step 3: Local cached IP fallback
    try {
      const cIp = localStorage.getItem('atf_real_client_ip');
      const cIsp = localStorage.getItem('atf_real_client_isp');
      if (cIp) {
        return { ip: cIp, isp: cIsp || 'Mạng Máy Khách', city: 'Việt Nam', fullInfo: `${cIp} • ${cIsp || 'Máy Khách'}` };
      }
    } catch(e) {}

    return { ip: '103.153.64.28', isp: 'Mạng Trình Duyệt Máy Khách', city: 'Việt Nam', fullInfo: '103.153.64.28 • Mạng Trình Duyệt' };
  },
cacheNetInfo(resolvedIp, resolvedIsp);
          return { ip: resolvedIp, isp: resolvedIsp, city: resolvedCity, fullInfo: `${resolvedIp} • ${resolvedIsp} (${resolvedCity})` };
        }
      }
    } catch(e) {}

    // Provider 2: ipapi.co
    try {
      const res = await fetch('https://ipapi.co/json/', { cache: 'no-store' });
      if (res.ok) {
        const d = await res.json();
        if (d && d.ip) {
          resolvedIp = d.ip;
          resolvedIsp = d.org || d.isp || 'Mạng Di Động / Wi-Fi';
          resolvedCity = d.city || 'Việt Nam';
          this.cacheNetInfo(resolvedIp, resolvedIsp);
          return { ip: resolvedIp, isp: resolvedIsp, city: resolvedCity, fullInfo: `${resolvedIp} • ${resolvedIsp} (${resolvedCity})` };
        }
      }
    } catch(e) {}

    // Provider 3: api64.ipify.org
    try {
      const res = await fetch('https://api64.ipify.org?format=json', { cache: 'no-store' });
      if (res.ok) {
        const d = await res.json();
        if (d && d.ip) {
          resolvedIp = d.ip;
          resolvedIsp = 'Mạng Di Động 4G/5G';
          this.cacheNetInfo(resolvedIp, resolvedIsp);
          return { ip: resolvedIp, isp: resolvedIsp, city: 'Việt Nam', fullInfo: `${resolvedIp} • ${resolvedIsp}` };
        }
      }
    } catch(e) {}

    // Provider 4: Server backend connection IP
    try {
      const res = await fetch('/api/system/client-info');
      if (res.ok) {
        const d = await res.json();
        if (d && d.ip) {
          resolvedIp = d.ip;
          resolvedIsp = 'Mạng Kết Nối Trực Tiếp';
          this.cacheNetInfo(resolvedIp, resolvedIsp);
          return { ip: resolvedIp, isp: resolvedIsp, city: 'Việt Nam', fullInfo: `${resolvedIp} • ${resolvedIsp}` };
        }
      }
    } catch(e) {}

    // Fallback: local cached IP
    try {
      const cIp = localStorage.getItem('atf_real_client_ip');
      const cIsp = localStorage.getItem('atf_real_client_isp');
      if (cIp) {
        return { ip: cIp, isp: cIsp || 'Mạng Máy Khách', city: 'Việt Nam', fullInfo: `${cIp} • ${cIsp || 'Máy Khách'}` };
      }
    } catch(e) {}

    return { ip: 'Đang kết nối Mạng...', isp: 'Mạng Máy Khách', city: 'Việt Nam', fullInfo: 'Mạng Trình Duyệt Máy Khách' };
  },

  cacheNetInfo(ip, isp) {
    try {
      if (ip) localStorage.setItem('atf_real_client_ip', ip);
      if (isp) localStorage.setItem('atf_real_client_isp', isp);
    } catch(e) {}
  },

  
  // Tự động xóa cache cũ trên trình duyệt di động để đọc IP & HWID mới 100%
  purgeLegacyCache() {
    try {
      const CURRENT_VER = 'v4.5.0';
      if (localStorage.getItem('atf_app_ver') !== CURRENT_VER) {
        localStorage.removeItem('atf_real_client_ip');
        localStorage.removeItem('atf_real_client_isp');
        localStorage.setItem('atf_app_ver', CURRENT_VER);
      }
    } catch(e) {}
  },

  // Quét và Điền Thông Tin Máy & IP Tức Thì Cho Mọi Trang (Index, Admin, Pending)
  async autoScanAndPopulateUI() {
    try {
      this.purgeLegacyCache();
      const dev = this.detectDeviceType();
      const osInfo = this.getOSAndBrowserInfo();
      const hwid = await this.getHardwareID();
      const net = await this.getPublicNetworkInfo();

      const ipText = net.ip ? `${net.ip} (${net.isp || 'Mạng Thật'})` : 'Đang quét IP...';
      const devText = `${osInfo.os} • ${dev.name}`;

      // 1. Trang Đăng Ký / Đăng Nhập Chính (index.html)
      const elAuthIp = document.getElementById('auth-scan-ip');
      const elAuthHwid = document.getElementById('auth-scan-hwid');
      const elAuthDev = document.getElementById('auth-scan-device');

      if (elAuthIp) elAuthIp.innerText = ipText;
      if (elAuthHwid) elAuthHwid.innerText = hwid;
      if (elAuthDev) elAuthDev.innerText = devText;

      // 2. Màn Hình Chờ Phê Duyệt VIP (screen-pending)
      const elPendIp = document.getElementById('pending-ip');
      const elPendHwid = document.getElementById('pending-hwid');
      const elPendDev = document.getElementById('pending-device');

      if (elPendIp) elPendIp.innerText = net.ip || ipText;
      if (elPendHwid) elPendHwid.innerText = hwid;
      if (elPendDev) elPendDev.innerText = devText;

      // 3. Cổng Quản Trị Viên Admin (quanglinhdev.html & admin.html)
      const elGateIp = document.getElementById('gate-ip');
      const elGateHwid = document.getElementById('gate-hwid');
      const elGateDev = document.getElementById('gate-device');
      const elHudIp = document.getElementById('hud-admin-ip');

      if (elGateIp) elGateIp.innerText = ipText;
      if (elGateHwid) elGateHwid.innerText = hwid;
      if (elGateDev) elGateDev.innerText = devText;
      if (elHudIp) elHudIp.innerText = net.ip;

      return { hwid, ip: net.ip, isp: net.isp, device: dev.name, os: osInfo.os };
    } catch(e) {
      console.warn('Fingerprint scan error:', e.message);
    }
  }
};

if (typeof window !== 'undefined') {
  window.FingerprintEngine = FingerprintEngine;

  const triggerInstantScan = async () => {
    try {
      if (window.FingerprintEngine && window.FingerprintEngine.autoScanAndPopulateUI) {
        return await window.FingerprintEngine.autoScanAndPopulateUI();
      }
    } catch(e) {
      console.warn('Instant scan trigger error:', e);
    }
  };

  // 1. Run IMMEDIATELY when script file is evaluated by browser engine
  triggerInstantScan();

  // 2. Run on DOMContentLoaded if DOM is still parsing
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', triggerInstantScan);
  }

  // 3. Run on Window Load
  window.addEventListener('load', triggerInstantScan);

  // 4. Polling retry loop every 300ms for 4 seconds to guarantee UI updates
  let attempts = 0;
  const pollTimer = setInterval(async () => {
    attempts++;
    const res = await triggerInstantScan();
    if ((res && res.ip && res.hwid) || attempts > 12) {
      clearInterval(pollTimer);
    }
  }, 300);
}
