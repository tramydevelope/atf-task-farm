/**
 * ATF Task Farm - Instant Hardware & Real IP Fingerprint Engine v5.3.0
 * Zero-Delay UI Population across all element IDs
 */

(function(global) {
  'use strict';

  function fnv1a(str) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).toUpperCase().padStart(8, '0');
  }

  function getRealCpuCores() {
    return navigator.hardwareConcurrency || (navigator.userAgent.includes('Mobile') ? 8 : 4);
  }

  function getRealRamGb() {
    return navigator.deviceMemory ? navigator.deviceMemory + ' GB' : (navigator.userAgent.includes('Mobile') ? '6 GB' : '8 GB');
  }

  function getRealGpuRenderer() {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (gl) {
        const dbg = gl.getExtension('WEBGL_debug_renderer_info');
        if (dbg) {
          const renderer = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL);
          if (renderer) return renderer;
        }
      }
    } catch(e) {}
    return navigator.userAgent.includes('Mobile') ? 'Apple GPU / Adreno Vulkan' : 'Direct3D11 (NVIDIA / Intel / AMD)';
  }

  function getRealDeviceType() {
    const ua = navigator.userAgent || '';
    if (/iPhone/i.test(ua)) return 'iPhone (iOS)';
    if (/iPad/i.test(ua)) return 'iPad (iPadOS)';
    if (/Android/i.test(ua)) return 'Android Smartphone';
    if (/Macintosh|Mac OS X/i.test(ua)) return 'Apple macOS (MacBook / iMac)';
    if (/Windows/i.test(ua)) return 'Máy Tính Windows PC';
    if (/Linux/i.test(ua)) return 'Linux Workstation';
    return 'Thiết Bị Khách';
  }

  function generateCanvasFingerprint() {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 240;
      canvas.height = 60;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.fillStyle = '#f60';
        ctx.fillRect(125, 1, 62, 20);
        ctx.fillStyle = '#069';
        ctx.fillText('ATF_VIP_FARM_2026', 2, 15);
        ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
        ctx.fillText('ISOLATED_CLIENT_HARDWARE', 4, 17);
        return canvas.toDataURL();
      }
    } catch(e) {}
    return 'CANVAS_FALLBACK_' + (navigator.userAgent || '');
  }

  function generateInstantHwid() {
    let localStored = localStorage.getItem('atf_client_unique_hwid');
    if (localStored && localStored.startsWith('HWID-')) {
      return localStored;
    }

    const devType = getRealDeviceType();
    const gpu = getRealGpuRenderer();
    const cores = getRealCpuCores();
    const ram = getRealRamGb();
    const screenRes = (window.screen ? window.screen.width : 1920) + 'x' + (window.screen ? window.screen.height : 1080);
    const canvasHash = fnv1a(generateCanvasFingerprint());
    const uaHash = fnv1a(navigator.userAgent || 'CLIENT');

    const prefix = devType.includes('iPhone') ? 'HWID-IPHONE' : (devType.includes('Android') ? 'HWID-ANDROID' : 'HWID-PC');
    const p1 = fnv1a(gpu + cores + screenRes).substring(0, 4);
    const p2 = fnv1a(ram + canvasHash).substring(0, 4);
    const p3 = fnv1a(uaHash).substring(0, 4);
    const p4 = fnv1a(Date.now() + Math.random().toString()).substring(0, 4);

    const generated = prefix + '-' + p1 + '-' + p2 + '-' + p3 + '-' + p4;
    localStorage.setItem('atf_client_unique_hwid', generated);
    return generated;
  }

  let cachedIp = localStorage.getItem('atf_cached_ip') || '116.98.234.129';

  async function fetchRealPublicIp() {
    const basePath = window.location.pathname.includes('/atf') ? '/atf' : '';
    const gateways = [
      basePath + '/api/system/client-info',
      'https://api.ipify.org?format=json',
      'https://api64.ipify.org?format=json'
    ];

    for (const url of gateways) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);
        const data = await res.json();
        if (data && data.ip && !data.ip.includes('127.0.0.1')) {
          cachedIp = data.ip.trim();
          localStorage.setItem('atf_cached_ip', cachedIp);
          return cachedIp;
        }
      } catch(e) {}
    }
    return cachedIp;
  }

  function setElementValues(ids, value) {
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.innerText = value;
      }
    });
  }

  const FingerprintEngine = {
    async scanAll() {
      const hwid = generateInstantHwid();
      const deviceType = getRealDeviceType();
      const gpu = getRealGpuRenderer();
      const cores = getRealCpuCores();
      const ram = getRealRamGb();
      const realIp = await fetchRealPublicIp();

      return {
        ip: realIp,
        hwid: hwid,
        deviceType: deviceType,
        gpu: gpu,
        cores: cores,
        ram: ram
      };
    },

    autoScanAndPopulateUI() {
      const hwid = generateInstantHwid();
      const deviceType = getRealDeviceType();
      const gpu = getRealGpuRenderer();
      const cores = getRealCpuCores();
      const ram = getRealRamGb();

      // Instant Synchronous UI Population
      setElementValues([
        'auth-scan-hwid', 'auth-hwid-display', 'gate-scan-hwid', 'gate-hwid-display',
        'hud-admin-hwid', 'pending-hwid', 'env-hwid'
      ], hwid);

      setElementValues([
        'auth-scan-device', 'auth-device-display', 'gate-scan-device', 'gate-device-display',
        'hud-device-name', 'pending-device', 'env-device'
      ], deviceType);

      setElementValues([
        'auth-scan-ip', 'auth-ip-display', 'gate-scan-ip', 'gate-ip-display',
        'hud-admin-ip', 'hud-user-ip', 'pending-ip', 'env-ip'
      ], cachedIp);

      setElementValues([
        'gate-specs-display', 'hud-admin-specs'
      ], cores + ' CPU Cores • ' + ram + ' RAM • ' + gpu);

      // Background Real IP Resolution
      fetchRealPublicIp().then(resolvedIp => {
        setElementValues([
          'auth-scan-ip', 'auth-ip-display', 'gate-scan-ip', 'gate-ip-display',
          'hud-admin-ip', 'hud-user-ip', 'pending-ip', 'env-ip'
        ], resolvedIp);
      });

      return {
        ip: cachedIp,
        hwid: hwid,
        deviceType: deviceType,
        gpu: gpu,
        cores: cores,
        ram: ram
      };
    }
  };

  global.FingerprintEngine = FingerprintEngine;

  // Execute synchronously immediately
  FingerprintEngine.autoScanAndPopulateUI();

  // Execute on DOM events
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => FingerprintEngine.autoScanAndPopulateUI());
  }
  window.addEventListener('load', () => FingerprintEngine.autoScanAndPopulateUI());

  // Fast interval to catch any delayed element rendering
  let count = 0;
  const timer = setInterval(() => {
    count++;
    FingerprintEngine.autoScanAndPopulateUI();
    if (count > 10) clearInterval(timer);
  }, 200);

})(typeof window !== 'undefined' ? window : global);
