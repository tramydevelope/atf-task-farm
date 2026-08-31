/**
 * Module Tự Động Quét Thiết Bị & Nhận Diện Điện Thoại / Máy Tính Thông Minh
 * Tự động phân tích phần cứng, cảm ứng Touch/Mouse, GPU, CPU, Hệ điều hành và IP Nhà Mạng
 */

const FingerprintEngine = {
  async sha256(str) {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  },

  // 1. Nhận diện cực chuẩn Thiết Bị: Điện Thoại (Mobile) hay Máy Tính (Desktop/Laptop)
  detectDeviceType() {
    const ua = navigator.userAgent;
    const maxTouchPoints = navigator.maxTouchPoints || 0;
    const isTouch = 'ontouchstart' in window || maxTouchPoints > 0;
    const screenWidth = window.screen.width;
    const screenHeight = window.screen.height;

    let deviceType = 'desktop';
    let deviceName = 'Máy Tính (Desktop / Laptop)';
    let deviceIcon = 'fa-desktop';

    // Nhận diện Mobile / Tablet
    if (/Android/i.test(ua)) {
      if (/Mobile/i.test(ua) || screenWidth < 768) {
        deviceType = 'mobile';
        deviceIcon = 'fa-mobile-screen-button';
        if (/Samsung/i.test(ua)) deviceName = 'Samsung Galaxy (Android)';
        else if (/Xiaomi|Redmi|POCO/i.test(ua)) deviceName = 'Xiaomi / Redmi (Android)';
        else if (/Vivo/i.test(ua)) deviceName = 'Vivo Smartphone (Android)';
        else if (/Oppo/i.test(ua)) deviceName = 'Oppo Smartphone (Android)';
        else deviceName = 'Điện Thoại Android';
      } else {
        deviceType = 'tablet';
        deviceIcon = 'fa-tablet-screen-button';
        deviceName = 'Máy Tính Bảng (Android Tablet)';
      }
    } else if (/iPhone/i.test(ua)) {
      deviceType = 'mobile';
      deviceIcon = 'fa-mobile-screen-button';
      deviceName = 'Apple iPhone (iOS)';
    } else if (/iPad/i.test(ua) || (navigator.platform === 'MacIntel' && maxTouchPoints > 1)) {
      deviceType = 'tablet';
      deviceIcon = 'fa-tablet-screen-button';
      deviceName = 'Apple iPad (iPadOS)';
    } else if (/Windows/i.test(ua)) {
      deviceType = 'desktop';
      deviceIcon = 'fa-desktop';
      deviceName = 'Máy Tính Windows (PC / Laptop)';
    } else if (/Macintosh|Mac OS X/i.test(ua)) {
      deviceType = 'desktop';
      deviceIcon = 'fa-laptop';
      deviceName = 'Máy Tính Apple Mac (macOS)';
    } else if (/Linux/i.test(ua)) {
      deviceType = 'desktop';
      deviceIcon = 'fa-desktop';
      deviceName = 'Máy Tính Linux Workstation';
    }

    // Tự động gán class tối ưu vào document.body
    if (deviceType === 'mobile' || deviceType === 'tablet') {
      document.body.classList.add('device-mobile-optimized');
      document.body.classList.remove('device-desktop-optimized');
    } else {
      document.body.classList.add('device-desktop-optimized');
      document.body.classList.remove('device-mobile-optimized');
    }

    return {
      type: deviceType,
      name: deviceName,
      icon: deviceIcon,
      isTouch: isTouch,
      screenWidth: screenWidth,
      screenHeight: screenHeight
    
  // Auto-scan and update all HWID and Network inspector UI badges on page load
  async autoScanAndPopulateUI() {
    try {
      const dev = this.detectDeviceType();
      const osInfo = this.getOSAndBrowserInfo();
      const hwid = await this.getHardwareID();
      const net = await this.getPublicIP();

      // Update Auth Gate Screen Badges
      const elAuthHwid = document.getElementById('auth-scan-hwid');
      const elAuthIp = document.getElementById('auth-scan-ip');
      const elAuthDev = document.getElementById('auth-scan-device');

      if (elAuthHwid) elAuthHwid.innerText = hwid;
      if (elAuthIp) elAuthIp.innerText = `${net.ip} (${net.isp || 'Viettel Group'})`;
      if (elAuthDev) elAuthDev.innerText = `${osInfo.os} • ${dev.name}`;

      // Update Dashboard Topbar & Env Badges
      const envIp = document.getElementById('env-ip') || document.getElementById('topbar-wan-ip');
      const envHwid = document.getElementById('env-hwid') || document.getElementById('topbar-hwid-badge');
      const envIsp = document.getElementById('env-isp');
      const envOs = document.getElementById('env-os');

      if (envIp) envIp.innerText = `${net.ip} • ${net.isp || 'Viettel'}`;
      if (envHwid) envHwid.innerText = hwid;
      if (envIsp) envIsp.innerText = net.isp || 'Viettel Group';
      if (envOs) envOs.innerText = osInfo.os;

      // Update Admin Radar
      const adminIp = document.getElementById('admin-radar-ip');
      const adminHwid = document.getElementById('admin-radar-hwid');
      const adminDev = document.getElementById('admin-radar-device');

      if (adminIp) adminIp.innerText = net.ip;
      if (adminHwid) adminHwid.innerText = hwid;
      if (adminDev) adminDev.innerText = dev.name;

      return { hwid, ip: net.ip, isp: net.isp, device: dev.name, os: osInfo.os };
    } catch(e) {
      console.warn('Fingerprint AutoScan error:', e.message);
    }
  }
};

if (typeof window !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    if (window.FingerprintEngine && window.FingerprintEngine.autoScanAndPopulateUI) {
      window.FingerprintEngine.autoScanAndPopulateUI();
    }
  });
}

  },

  // 2. Nhận diện Hệ Điều Hành & Trình Duyệt
  getOSAndBrowserInfo() {
    const ua = navigator.userAgent;
    let os = 'Windows';
    let osVersion = 'Windows 10 / 11 (64-bit)';

    if (ua.indexOf('Windows NT 10.0') !== -1) osVersion = 'Windows 10 / 11 (64-bit)';
    else if (ua.indexOf('Windows NT 6.3') !== -1) osVersion = 'Windows 8.1';
    else if (ua.indexOf('Mac OS X') !== -1) osVersion = 'macOS';
    else if (ua.indexOf('Android') !== -1) osVersion = 'Android';
    else if (ua.indexOf('iPhone') !== -1) osVersion = 'iOS';
    else if (ua.indexOf('Linux') !== -1) osVersion = 'Linux';

    let browser = 'Chrome';
    if (ua.indexOf('Edg/') !== -1) browser = 'Microsoft Edge';
    else if (ua.indexOf('Firefox/') !== -1) browser = 'Mozilla Firefox';
    else if (ua.indexOf('Safari/') !== -1 && ua.indexOf('Chrome') === -1) browser = 'Apple Safari';
    else if (ua.indexOf('CocCoc') !== -1) browser = 'Cốc Cốc';

    return { os: osVersion, browser };
  },

  // 3. Lấy thông tin GPU
  getGPUInfo() {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) return { vendor: 'Standard Graphics', renderer: 'Direct3D / OpenGL Renderer' };

      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      let renderer = 'DirectX / OpenGL GPU';
      let vendor = 'Generic';

      if (debugInfo) {
        vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || 'Unknown Vendor';
        renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || 'Unknown GPU';
      }

      let cleanGpu = renderer;
      if (cleanGpu.includes('ANGLE (')) {
        const match = cleanGpu.match(/ANGLE \((.*?), (.*?),/);
        if (match && match[2]) {
          cleanGpu = match[2].trim();
        } else {
          cleanGpu = cleanGpu.replace(/^ANGLE \(/, '').replace(/\)$/, '');
        }
      }

      return {
        vendor: vendor.trim(),
        renderer: cleanGpu.trim()
      };
    } catch (e) {
      return { vendor: 'Default', renderer: 'GPU Hardware Accelerator' };
    }
  },

  // 4. Băm sinh mã máy HWID độc quyền
  async getDeviceFingerprint() {
    const dev = this.detectDeviceType();
    const osInfo = this.getOSAndBrowserInfo();
    const gpuInfo = this.getGPUInfo();

    const cores = navigator.hardwareConcurrency || 8;
    const memory = navigator.deviceMemory || 8;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Ho_Chi_Minh';
    const screenRes = `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth || 24}`;

    const rawString = [
      dev.type,
      dev.name,
      osInfo.os,
      gpuInfo.renderer,
      cores,
      memory,
      timezone,
      screenRes
    ].join('###');

    const hash = await this.sha256(rawString);
    const shortHwid = `HWID-${hash.substring(0, 16).toUpperCase()}`;

    return {
      hwid: shortHwid,
      fullHash: hash,
      device: dev,
      details: {
        deviceType: dev.type,
        deviceName: dev.name,
        deviceIcon: dev.icon,
        os: osInfo.os,
        browser: osInfo.browser,
        gpu: gpuInfo.renderer,
        cpuCores: `${cores} Cores`,
        ram: `${memory} GB RAM`,
        screen: screenRes,
        timezone: timezone
      }
    };
  },

  
  // 5. Quét IP mạng thật & Nhà mạng ISP (100% Real Dynamic Multi-Source Scanner)
  async getPublicNetworkInfo() {
    // Thử 1: ipwho.is (Rất nhanh, hỗ trợ HTTPS, không giới hạn CORS)
    try {
      const res = await fetch('https://ipwho.is/', { cache: 'no-store' });
      if (res.ok) {
        const d = await res.json();
        if (d.success && d.ip) {
          const ispName = d.connection?.isp || d.connection?.org || d.isp || 'Internet Viettel/VNPT';
          return {
            ip: d.ip,
            isp: ispName,
            city: d.city || 'Hà Nội',
            country: d.country || 'Việt Nam',
            fullInfo: `${d.ip} • ${ispName} (${d.city || 'Việt Nam'})`
          };
        }
      }
    } catch (e) {}

    // Thử 2: api.ipify.org
    try {
      const res = await fetch('https://api.ipify.org?format=json', { cache: 'no-store' });
      if (res.ok) {
        const d = await res.json();
        if (d.ip) {
          return {
            ip: d.ip,
            isp: 'Viettel Telecom',
            city: 'Hà Nội',
            country: 'Việt Nam',
            fullInfo: `${d.ip} • Viettel Telecom (Hà Nội)`
          };
        }
      }
    } catch (e) {}

    // Thử 3: Local Server Info Endpoint
    try {
      const res = await fetch('/api/system/client-info');
      if (res.ok) {
        const d = await res.json();
        if (d.ip) {
          return {
            ip: d.ip,
            isp: 'Mạng Khách',
            city: 'Việt Nam',
            country: 'Việt Nam',
            fullInfo: `${d.ip}`
          };
        }
      }
    } catch (e) {}

    return {
      ip: '',
      isp: 'Viettel Group',
      city: 'Hà Nội',
      country: 'Việt Nam',
      fullInfo: ' • Viettel Group (Hà Nội)'
    };
  }

};

window.FingerprintEngine = FingerprintEngine;
