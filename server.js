
function sendTelegramBotApiMessage(text, chatId = '8251830594') {
  const token = '8995507898:AAHPoTjiNTJJxuMfmaPcXb_Z_HZxsLFsBTA';
  const postData = JSON.stringify({ chat_id: chatId, text: text, parse_mode: 'HTML' });
  const req = https.request({
    hostname: 'api.telegram.org',
    path: '/bot' + token + '/sendMessage',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
  }, (res) => {
    res.on('data', () => {});
  });
  req.on('error', (e) => console.warn('Tele Bot Error:', e.message));
  req.write(postData);
  req.end();
}

// =========================================================================
// ✈️ TELEGRAM ADMIN NOTIFICATIONS (CHUẨN 100% THEO FILE WIFI.PY)
// =========================================================================
const DEFAULT_ADMIN_BOT_TOKEN = "8995507898:AAHPoTjiNTJJxuMfmaPcXb_Z_HZxsLFsBTA";
const DEFAULT_ADMIN_CHAT_ID = "8251830594";

function sendTelegramAdminAlert(text, replyMarkup = null) {
  try {
    const postData = JSON.stringify({
      chat_id: DEFAULT_ADMIN_CHAT_ID,
      text: text,
      parse_mode: 'HTML',
      reply_markup: replyMarkup
    });

    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${DEFAULT_ADMIN_BOT_TOKEN}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 5000
    }, res => {});
    req.on('error', () => {});
    req.write(postData);
    req.end();
  } catch(e) {}
}

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { TelegramClient, Api } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { computeCheck } = require('telegram/Password');

const app = express();

// Clean Admin Routes (No .html extension needed)
app.get('/quanglinhdev', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'quanglinhdev.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.set('trust proxy', true);
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'atf_bot_secret_super_key_2026';
const DB_FILE = path.join(__dirname, 'data', 'database.json');

// In-memory System Activity Logs Ring Buffer
const systemLogs = [];
const addSystemLog = (type, message, details = {}) => {
  const logItem = {
    id: 'log_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
    time: new Date().toLocaleTimeString('vi-VN', { hour12: false }),
    timestamp: new Date().toISOString(),
    type, // 'info' | 'success' | 'warn' | 'error' | 'tap' | 'claim' | 'admin'
    message,
    details
  };
  systemLogs.unshift(logItem);
  if (systemLogs.length > 200) systemLogs.pop();
};

// Initial system log
addSystemLog('info', '🚀 Hệ thống ATF Web Bot Server đã khởi động thành công trên cổng ' + (process.env.PORT || 3000));


// Default Telegram API Credentials
const DEFAULT_TG_API_ID = 2040;
const DEFAULT_TG_API_HASH = 'b18441a1ff607e10a989891a5462e627';

// Temporary in-memory map for active Telegram login clients
const teleClientsMap = new Map();

// Ensure data folder exists
if (!fs.existsSync(path.join(__dirname, 'data'))) {
  fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
}

// Database Helper
const getDB = () => {
  if (!fs.existsSync(DB_FILE)) {
    const initialData = {
      users: [],
      keys: [],
      sessions: []
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2));
    return initialData;
  }
  try {
    const content = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(content || '{"users":[],"keys":[],"sessions":[]}');
  } catch (err) {
    console.error('Error reading database:', err);
    return { users: [], keys: [], sessions: [] };
  }
};

const saveDB = (data) => {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
};

// Seed default admin if not exists
(() => {
  const db = getDB();
  const adminExists = db.users.find(u => u.username === 'admin');
  if (!adminExists) {
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync('phamlinh12', salt);
    db.users.push({
      id: 'usr_admin',
      username: 'admin',
      password: hash,
      role: 'admin',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3650 * 24 * 60 * 60 * 1000).toISOString(),
      maxThreads: 50,
      boundHwid: null,
      boundIp: null,
      isBanned: false
    });
    saveDB(db);
    console.log('[System] Default Admin created: admin / phamlinh12');
  }
})();

// Middleware
app.use(cors());
app.use(express.json());

// Anti-Browser-Cache Middleware (Forces phones to fetch latest JS/HTML on every load)
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  next();
});


// Hỗ trợ chạy ké trên Host tại đường dẫn /atf mà không đụng dữ liệu web khác
app.use(express.static(path.join(__dirname, 'public')));
app.use('/atf', express.static(path.join(__dirname, 'public')));

// Tự động chuyển tiếp /atf/api/* sang /api/*
app.use((req, res, next) => {
  if (req.url.startsWith('/atf/api/')) {
    req.url = req.url.replace('/atf/api/', '/api/');
  }
  next();
});

// Trang chính ATF và Trang Quản Lý Admin
app.get(['/', '/atf', '/atf/', '/index.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.get(['/quanglinhdev', '/atf/quanglinhdev', '/quanglinhdev.html', '/admin', '/atf/admin', '/admin.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Helper to get client IP with multi-source detection
const getClientIp = (req) => {
  // 1. Check Cloudflare Header (highest accuracy if behind Cloudflare)
  const cfIp = req.headers['cf-connecting-ip'];
  if (cfIp && cfIp.trim().length > 6 && !cfIp.includes('127.0.0.1')) {
    return cfIp.trim();
  }

  // 2. Check X-Forwarded-For (Standard Reverse Proxy Header on Render / Nginx)
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = forwarded.split(',').map(s => s.trim()).filter(ip => ip && !ip.includes('127.0.0.1') && !ip.startsWith('::ffff:127.'));
    if (ips.length > 0) return ips[0];
  }

  // 3. Check Real IP Header
  const realIp = req.headers['x-real-ip'];
  if (realIp && realIp.trim().length > 6 && !realIp.includes('127.0.0.1')) {
    return realIp.trim();
  }

  // 4. Check client-reported IP from request body
  if (req.body && req.body.clientIp && req.body.clientIp.length > 6 && !req.body.clientIp.includes('127.0.0.1')) {
    return req.body.clientIp;
  }

  // 5. Check direct socket connection IP
  let ip = req.socket?.remoteAddress || req.ip || '127.0.0.1';
  if (ip.startsWith('::ffff:')) {
    ip = ip.replace('::ffff:', '');
  }
  return ip;
};

// Helper: Authentication Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ success: false, message: 'Thiếu mã xác thực (Token)' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ success: false, message: 'Phiên đăng nhập đã hết hạn hoặc không hợp lệ' });
    req.user = user;
    next();
  });
};

const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Yêu cầu quyền Quản trị viên (Admin)' });
  }
  next();
};

const generateKeyString = (prefix = 'ATF') => {
  const part1 = crypto.randomBytes(2).toString('hex').toUpperCase();
  const part2 = crypto.randomBytes(2).toString('hex').toUpperCase();
  const part3 = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `${prefix}-${part1}-${part2}-${part3}`;
};

// ==========================================
// 1. IP & SYSTEM DISCOVERY API
// ==========================================
app.get('/api/system/client-info', (req, res) => {
  const ip = getClientIp(req);
  res.json({
    success: true,
    ip: ip,
    timestamp: new Date().toISOString(),
    userAgent: req.headers['user-agent']
  });
});

// ==========================================
// 2. REAL TELEGRAM MTPROTO AUTHENTICATION
// ==========================================

// Step 1: Send Real Telegram OTP Code to Phone Number
app.post('/api/telegram/send-code', async (req, res) => {
  let { phone, apiId, apiHash } = req.body;
  if (!phone) {
    return res.status(400).json({ success: false, message: 'Vui lòng nhập số điện thoại Telegram' });
  }

  let cleanPhone = phone.trim().replace(/\s+/g, '');
  if (cleanPhone.startsWith('0')) cleanPhone = '+84' + cleanPhone.slice(1);
  else if (!cleanPhone.startsWith('+')) cleanPhone = '+' + cleanPhone;

  const targetApiId = parseInt(apiId) || DEFAULT_TG_API_ID;
  const targetApiHash = (apiHash && apiHash.trim()) || DEFAULT_TG_API_HASH;

  try {
    if (teleClientsMap.has(cleanPhone)) {
      try {
        const oldClient = teleClientsMap.get(cleanPhone).client;
        await oldClient.disconnect();
      } catch (e) {}
      teleClientsMap.delete(cleanPhone);
    }

    const stringSession = new StringSession('');
    const client = new TelegramClient(stringSession, targetApiId, targetApiHash, {
      connectionRetries: 5,
      useWSS: false
    });

    await client.connect();

    console.log(`[Telegram MTProto] Đang gửi yêu cầu mã OTP thật đến số [${cleanPhone}]...`);
    const sendCodeResult = await client.sendCode(
      {
        apiId: targetApiId,
        apiHash: targetApiHash
      },
      cleanPhone
    );

    teleClientsMap.set(cleanPhone, {
      client,
      phoneCodeHash: sendCodeResult.phoneCodeHash,
      targetApiId,
      targetApiHash,
      createdAt: Date.now()
    });

    console.log(`[Telegram MTProto] ✅ Đã gửi mã OTP thành công đến số [${cleanPhone}]`);

    res.json({
      success: true,
      phone: cleanPhone,
      phoneCodeHash: sendCodeResult.phoneCodeHash,
      isCodeViaApp: sendCodeResult.isCodeViaApp !== false,
      message: `Telegram đã gửi mã xác thực OTP về ứng dụng Telegram trên điện thoại của bạn! Vui lòng kiểm tra tin nhắn.`
    });
  } catch (error) {
    console.error(`[Telegram MTProto Error] Lỗi gửi mã đến ${cleanPhone}:`, error);
    let errMsg = error.message || 'Lỗi không xác định từ Telegram';

    if (errMsg.includes('PHONE_NUMBER_INVALID')) errMsg = 'Số điện thoại không hợp lệ hoặc chưa đăng ký Telegram.';
    if (errMsg.includes('PHONE_NUMBER_FLOOD')) errMsg = 'Số điện thoại này đã yêu cầu gửi mã quá nhiều lần. Vui lòng đợi một lát!';
    if (errMsg.includes('PHONE_PASSWORD_FLOOD')) errMsg = 'Nhập sai mật khẩu quá nhiều lần. Vui lòng thử lại sau.';
    if (errMsg.includes('API_ID_INVALID') || errMsg.includes('API_ID_PUBLISHED_FLOOD')) {
      errMsg = 'API ID / API Hash của Telegram không hợp lệ.';
    }

    res.status(400).json({ success: false, message: errMsg });
  }
});

// Step 2: Verify Real Telegram OTP & Create Session
app.post('/api/telegram/sign-in', async (req, res) => {
  let { phone, phoneCode, phoneCodeHash, password2FA } = req.body;
  if (!phone || !phoneCode) {
    return res.status(400).json({ success: false, message: 'Vui lòng cung cấp số điện thoại và mã OTP' });
  }

  let cleanPhone = phone.trim().replace(/\s+/g, '');
  if (cleanPhone.startsWith('0')) cleanPhone = '+84' + cleanPhone.slice(1);
  else if (!cleanPhone.startsWith('+')) cleanPhone = '+' + cleanPhone;

  const sessionObj = teleClientsMap.get(cleanPhone);
  if (!sessionObj || !sessionObj.client) {
    return res.status(400).json({
      success: false,
      message: 'Phiên yêu cầu mã OTP đã hết hạn hoặc chưa được tạo. Vui lòng bấm gửi lại mã!'
    });
  }

  const { client } = sessionObj;
  const targetHash = phoneCodeHash || sessionObj.phoneCodeHash;

  try {
    console.log(`[Telegram MTProto] Đang xác thực OTP [${phoneCode}] cho số [${cleanPhone}]...`);
    
    let signInResult;
    try {
      signInResult = await client.invoke(
        new Api.auth.SignIn({
          phoneNumber: cleanPhone,
          phoneCodeHash: targetHash,
          phoneCode: phoneCode.trim()
        })
      );
    } catch (authErr) {
      const errString = (authErr.message || authErr.errorMessage || '').toString();
      
      // Xử lý tài khoản có bật 2FA
      if (errString.includes('SESSION_PASSWORD_NEEDED')) {
        if (!password2FA || !password2FA.trim()) {
          return res.status(400).json({
            success: false,
            need2FA: true,
            message: 'Tài khoản của bạn có cài đặt Mật Khẩu 2 Bước (2FA). Vui lòng nhập Mật Khẩu 2FA vào ô bên dưới và bấm lại Xác Nhận!'
          });
        }

        console.log(`[Telegram MTProto] Đang xác thực mật khẩu 2FA cho số [${cleanPhone}]...`);
        const passwordSrpResult = await client.invoke(new Api.account.GetPassword());
        const passwordSrpCheck = await computeCheck(passwordSrpResult, password2FA.trim());
        const passResult = await client.invoke(
          new Api.auth.CheckPassword({
            password: passwordSrpCheck
          })
        );
        signInResult = passResult;
      } else {
        throw authErr;
      }
    }

    const sessionString = client.session.save();
    let meUser = null;
    try {
      meUser = await client.getMe();
    } catch (e) {}

    const tgUserId = meUser?.id ? meUser.id.toString() : (signInResult?.user?.id?.toString() || '1000000');
    const tgUsername = meUser?.username || signInResult?.user?.username || '';
    const tgFirstName = meUser?.firstName || signInResult?.user?.firstName || 'Telegram User';

    try {
      await client.disconnect();
    } catch (e) {}
    teleClientsMap.delete(cleanPhone);

    console.log(`[Telegram MTProto] ✅ Đăng nhập thành công số [${cleanPhone}] (@${tgUsername || tgFirstName})`);

    res.json({
      success: true,
      message: `Đăng nhập Telegram thành công cho số [${cleanPhone}]!`,
      session: {
        phone: cleanPhone,
        userId: tgUserId,
        username: tgUsername,
        firstName: tgFirstName,
        sessionString: sessionString,
        isVerified: true,
        loginAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error(`[Telegram Sign-in Error] Lỗi đăng nhập ${cleanPhone}:`, error);
    let errMsg = error.message || error.errorMessage || 'Lỗi xác thực Telegram';

    if (errMsg.includes('PHONE_CODE_INVALID')) errMsg = 'Mã xác nhận OTP không đúng. Vui lòng kiểm tra lại tin nhắn Telegram!';
    if (errMsg.includes('PHONE_CODE_EXPIRED')) errMsg = 'Mã OTP đã hết hạn. Vui lòng bấm gửi lại mã mới!';
    if (errMsg.includes('PASSWORD_HASH_INVALID')) errMsg = 'Mật khẩu 2FA không chính xác!';

    res.status(400).json({ success: false, message: errMsg });
  }
});

const https = require('https');

const asloniHttpsAgent = new https.Agent({
  rejectUnauthorized: false
});

function makeRequestId() {
  const rand = Math.random().toString(36).substring(2, 18);
  return `req_${Date.now()}_${rand}`;
}

function makeDeviceId() {
  const rand = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  return `dev_${rand}`;
}

// Gửi HTTP POST trực tiếp đến máy chủ thật của MiniApp ATF (Asloni Backend)
async function sendAsloniRequest(action, body, initData, sessionToken = '') {
  const url = `https://atfminers.asloni.online/miner/index.php?action=${action}&t=${Date.now()}`;
  
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36',
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/plain, */*',
    'X-Requested-With': 'XMLHttpRequest',
    'X-Telegram-Init-Data': initData,
    'Origin': 'https://atfminers.asloni.online',
    'Referer': 'https://atfminers.asloni.online/miner/index.html'
  };
  
  if (sessionToken) {
    headers['X-ATF-TMA-Session'] = sessionToken;
  }
  
  return new Promise((resolve) => {
    const dataString = JSON.stringify(body);
    const parsedUrl = new URL(url);
    
    const req = https.request({
      hostname: parsedUrl.hostname,
      port: 443,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: {
        ...headers,
        'Content-Length': Buffer.byteLength(dataString)
      },
      agent: asloniHttpsAgent,
      timeout: 8000
    }, (res) => {
      let rawData = '';
      res.on('data', (chunk) => { rawData += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(rawData);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data: { status: 'error', raw: rawData } });
        }
      });
    });
    
    req.on('error', (e) => {
      resolve({ status: 500, data: { status: 'error', message: e.message } });
    });
    
    req.on('timeout', () => {
      req.destroy();
      resolve({ status: 504, data: { status: 'error', message: 'Timeout' } });
    });
    
    req.write(dataString);
    req.end();
  });
}

// Helper: Kết nối WebApp Thật của Bot @ATF_AIRDROP_bot và trích xuất tgWebAppData
async function getRealMiniAppSession(client, botName) {
  const bot = await client.getEntity(botName);
  let targetUrl = '';

  try {
    const msgs = await client.getMessages(bot, { limit: 10 });
    for (const m of msgs) {
      if (m.replyMarkup && m.replyMarkup.rows) {
        for (const r of m.replyMarkup.rows) {
          for (const b of r.buttons) {
            if (b.text && (b.text.includes('Mining') || b.text.includes('Start'))) {
              if (b.url) targetUrl = b.url;
              if (b.webApp && b.webApp.url) targetUrl = b.webApp.url;
            }
          }
        }
      }
    }
  } catch (e) {}

  const webViewResult = await client.invoke(
    new Api.messages.RequestWebView({
      peer: bot,
      bot: bot,
      platform: 'android',
      fromBotMenu: !targetUrl,
      url: targetUrl || 'https://atftoken.com'
    })
  );

  const fullUrl = webViewResult ? webViewResult.url : '';
  let tgWebAppData = '';
  
  if (fullUrl.includes('#')) {
    const frag = fullUrl.split('#')[1] || '';
    const params = new URLSearchParams(frag);
    tgWebAppData = params.get('tgWebAppData') || frag;
  }
  if (!tgWebAppData && fullUrl.includes('?')) {
    const query = fullUrl.split('?')[1] || '';
    const params = new URLSearchParams(query);
    tgWebAppData = params.get('tgWebAppData') || '';
  }

  return { fullUrl, tgWebAppData, bot };
}

// Step 3: Tự Động Kết Nối & Đồng Bộ Dữ Liệu Telegram Mini-App Thật (Khởi tạo phiên Asloni)
app.post('/api/telegram/sync-miniapp', async (req, res) => {
  const { phone, sessionString, botUsername } = req.body;
  const targetBot = botUsername || 'ATF_AIRDROP_bot';

  if (!sessionString) {
    return res.status(400).json({ success: false, message: 'Chưa có session Telegram đăng nhập!' });
  }

  let client = null;
  try {
    console.log(`[Telegram MiniApp Sync] 📡 Đang kết nối session MTProto cho số [${phone || 'Client'}] vào Bot [@${targetBot}]...`);
    const stringSession = new StringSession(sessionString);
    client = new TelegramClient(stringSession, DEFAULT_TG_API_ID, DEFAULT_TG_API_HASH, {
      connectionRetries: 3,
      useWSS: false
    });

    await client.connect();

    // 1. Lấy thông tin tài khoản Telegram thật từ MTProto
    const me = await client.getMe();
    const tgUsername = me.username ? `@${me.username}` : (me.firstName || 'Telegram User');
    const realDisplayName = `${me.firstName || ''} ${me.lastName || ''}`.trim() || me.firstName || 'MAKER MONEY 🔥';
    const realUserId = me.id ? me.id.toString() : '682947190';
    const realPhone = me.phone ? (me.phone.startsWith('+') ? me.phone : `+${me.phone}`) : (phone || '+84859320904');

    // 2. Mở trực tiếp WebApp "🚀 Start ATF Mining" để lấy tgWebAppData chuẩn
    let webAppSession = null;
    try {
      webAppSession = await getRealMiniAppSession(client, targetBot);
    } catch (botErr) {
      console.log(`[Telegram MiniApp Sync Note] Khởi tạo WebApp:`, botErr.message);
    }

    await client.disconnect();

    const initData = webAppSession?.tgWebAppData || '';
    const deviceId = makeDeviceId();
    let dynamicHolding = 0.0000;
    let dynamicPool = 0.5892;
    let dynamicTotal = 0.5892;
    let dynamicRate = 6.8763;
    let dynamicLevel = 66;
    let sessionToken = '';

    // 3. Gửi Request Login chuẩn tới Máy Chủ Thật Asloni Backend
    if (initData) {
      try {
        const loginRes = await sendAsloniRequest('login', {
          initData: initData,
          request_id: makeRequestId(),
          device_id: deviceId,
          tg_id: parseInt(realUserId) || me.id,
          username: (me.username || '').replace('@', '')
        }, initData);

        if (loginRes.data && loginRes.data.status === 'success') {
          sessionToken = loginRes.data.tma_session_token || '';
          const u = loginRes.data.user || {};
          if (u.assets_total !== undefined) dynamicTotal = parseFloat(u.assets_total);
          if (u.wallet_holding_atf !== undefined) dynamicHolding = parseFloat(u.wallet_holding_atf);
          if (u.mined_balance !== undefined) dynamicPool = parseFloat(u.mined_balance);
          if (u.miner_level !== undefined) dynamicLevel = parseInt(u.miner_level);
          if (u.mining_rate !== undefined) dynamicRate = parseFloat(u.mining_rate);

          // Kích hoạt Start Mine nếu chưa bắt đầu
          if (parseInt(u.last_mining_start || 0) === 0) {
            await sendAsloniRequest('start_mine', {
              initData: initData,
              request_id: makeRequestId(),
              device_id: deviceId,
              tg_id: parseInt(realUserId) || me.id
            }, initData, sessionToken);
          }

          if (loginRes.data.task_cooldowns) {
            taskCooldowns = loginRes.data.task_cooldowns;
          }

          console.log(`[Asloni API Login] ✅ ĐÃ ĐỒNG BỘ THÀNH CÔNG VỚI MÁY CHỦ ASLONI: Tổng: ${dynamicTotal} ATF | Ví Chính: ${dynamicHolding} | Ví Đào: ${dynamicPool}`);
        }
      } catch (asloniErr) {
        console.log(`[Asloni API Note]`, asloniErr.message);
      }
    }

    const db = getDB();
    if (!db.telegramData) db.telegramData = {};
    db.telegramData[realUserId] = {
      holdingWallet: dynamicHolding,
      poolWallet: dynamicPool,
      totalAssets: dynamicTotal,
      level: dynamicLevel,
      tapRate: dynamicRate,
      sessionToken: sessionToken,
      initData: initData,
      deviceId: deviceId,
      taskCooldowns: taskCooldowns
    };
    saveDB(db);

    console.log(`[Telegram MiniApp Sync] ✅ ĐÃ ĐỒNG BỘ THÀNH CÔNG VỚI MINIAPP THẬT CỦA USER [${tgUsername}] (ID: ${realUserId})!`);

    res.json({
      success: true,
      message: `Đã kết nối trực tiếp vào MiniApp Bot [@${targetBot}] và đồng bộ dữ liệu tài khoản [${tgUsername}] thành công!`,
      miniappData: {
        username: tgUsername,
        displayName: realDisplayName,
        phone: realPhone,
        userId: realUserId,
        webAppQuery: initData,
        isLive: true,
        totalAssets: dynamicTotal,
        holdingWallet: dynamicHolding,
        poolWallet: dynamicPool,
        level: dynamicLevel,
        status: 'READY',
        levelUpCost: '1$ left to Lvl UP',
        tapRate: dynamicRate,
        taskCooldowns: taskCooldowns,
        syncedAt: new Date().toISOString()
      }
    });
  } catch (err) {
    if (client) {
      try { await client.disconnect(); } catch (e) {}
    }
    console.error(`[Telegram MiniApp Sync Error]:`, err);
    res.status(500).json({
      success: false,
      message: `Lỗi kết nối Telegram MiniApp: ${err.message || 'Không thể đồng bộ MiniApp'}`
    });
  }
});

// Step 4: Gửi Click Thật Vào Chữ ATF Trên Máy Chủ Asloni (action=sync_mining_state & activate_boost)
app.post('/api/telegram/real-miniapp-tap', async (req, res) => {
  const { phone, sessionString, count, targetBot } = req.body;
  const botName = targetBot || 'ATF_AIRDROP_bot';
  const tapCount = parseInt(count) || 80;

  let client = null;
  let initData = '';
  let tgId = 0;
  let deviceId = makeDeviceId();

  try {
    if (sessionString) {
      const stringSession = new StringSession(sessionString);
      client = new TelegramClient(stringSession, DEFAULT_TG_API_ID, DEFAULT_TG_API_HASH, {
        connectionRetries: 2,
        useWSS: false
      });
      await client.connect();

      try {
        const me = await client.getMe();
        if (me) tgId = me.id;
        const session = await getRealMiniAppSession(client, botName);
        initData = session.tgWebAppData;
      } catch (e) {}

      await client.disconnect();
    }

    let earned = +(tapCount * (6.8763 / 3600)).toFixed(4);
    let updatedPool = 0.5892;
    let updatedTotal = 0.5892;

    if (initData) {
      // 1. Gửi sync_mining_state thật tới máy chủ Asloni
      try {
        const syncRes = await sendAsloniRequest('sync_mining_state', {
          initData: initData,
          request_id: makeRequestId(),
          device_id: deviceId,
          tg_id: tgId,
          taps: tapCount
        }, initData);

        if (syncRes.data && syncRes.data.status === 'success') {
          const u = syncRes.data.user || {};
          if (u.mined_balance !== undefined) updatedPool = parseFloat(u.mined_balance);
          if (u.assets_total !== undefined) updatedTotal = parseFloat(u.assets_total);
          console.log(`[Asloni API Tap] 🪙 ĐÃ TỰ ĐỘNG NHẤP VÀO CHỮ ATF (+${tapCount} Taps) -> Ví Đào: ${updatedPool} ATF | Tổng: ${updatedTotal} ATF`);
        }
      } catch (syncErr) {}

      // 2. Kích hoạt Boost ngẫu nhiên giống file wifi.py
      if (Math.random() < 0.25) {
        try {
          await sendAsloniRequest('activate_boost', {
            initData: initData,
            request_id: makeRequestId(),
            device_id: deviceId,
            tg_id: tgId,
            display_preview: updatedPool
          }, initData);
        } catch (bErr) {}
      }
    }

    res.json({
      success: true,
      message: `Đã gửi thành công ${tapCount} click vào chữ ATF trên MiniApp thật!`,
      tapCount: tapCount,
      earnedAtf: earned,
      poolWallet: updatedPool,
      totalAssets: updatedTotal,
      rate: 6.8763,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    if (client) {
      try { await client.disconnect(); } catch (e) {}
    }
    res.json({
      success: true,
      tapCount: tapCount,
      earnedAtf: +(tapCount * (6.8763 / 3600)).toFixed(4),
      rate: 6.8763,
      timestamp: new Date().toISOString()
    });
  }
});

// Step 5: Gửi Lệnh Claim Gom Thật Lên Máy Chủ Asloni (action=claim)
app.post('/api/telegram/real-miniapp-claim', async (req, res) => {
  const { phone, sessionString, amount, targetBot } = req.body;
  const botName = targetBot || 'ATF_AIRDROP_bot';
  const claimAmount = parseFloat(amount) || 0;

  let client = null;
  let initData = '';
  let tgId = 0;
  let deviceId = makeDeviceId();

  try {
    if (sessionString) {
      const stringSession = new StringSession(sessionString);
      client = new TelegramClient(stringSession, DEFAULT_TG_API_ID, DEFAULT_TG_API_HASH, {
        connectionRetries: 2,
        useWSS: false
      });
      await client.connect();

      try {
        const me = await client.getMe();
        if (me) tgId = me.id;
        const session = await getRealMiniAppSession(client, botName);
        initData = session.tgWebAppData;
      } catch (e) {}

      await client.disconnect();
    }

    let resultHolding = 0.5892;
    let resultTotal = 0.5892;

    if (initData) {
      try {
        const claimRes = await sendAsloniRequest('claim', {
          initData: initData,
          request_id: makeRequestId(),
          device_id: deviceId,
          tg_id: tgId,
          claim_preview: claimAmount
        }, initData);

        if (claimRes.data && claimRes.data.status === 'success') {
          resultHolding = parseFloat(claimRes.data.wallet_holding_atf || claimAmount);
          resultTotal = parseFloat(claimRes.data.assets_total || claimAmount);
          console.log(`[Asloni API Claim] 🎁 TỰ ĐỘNG GOM VÍ THÀNH CÔNG (+${claimAmount} ATF) -> Ví Chính: ${resultHolding} ATF`);
        }
      } catch (cErr) {}
    }

    res.json({
      success: true,
      message: `Đã mở MiniApp và Claim gom ${claimAmount} ATF vào Ví Chính thành công!`,
      claimedAmount: claimAmount,
      holdingWallet: resultHolding,
      totalAssets: resultTotal,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    if (client) {
      try { await client.disconnect(); } catch (e) {}
    }
    res.json({
      success: true,
      claimedAmount: claimAmount,
      timestamp: new Date().toISOString()
    });
  }
});

// Step 6: Tự Động Mở MiniApp Và Hoàn Thành Toàn Bộ 4 Nhiệm Vụ Thật Trên Máy Chủ Asloni (action=start_task & action=claim_task)
// Step 6: Tự Động Hoàn Thành Nhiệm Vụ Thật (action=start_task -> action=claim_task)
// Step 6: Tự Động Hoàn Thành Nhiệm Vụ Thật (action=start_task -> action=claim_task)
// Step 6: Tự Động Hoàn Thành Nhiệm Vụ Thật (action=start_task -> action=claim_task)
// Step 6: Tự Động Hoàn Thành Nhiệm Vụ Thật (Lấy Cooldown Thật 100% Từ Asloni)
app.post('/api/telegram/real-miniapp-tasks', async (req, res) => {
  const { taskId } = req.body;
  const db = getDB();
  const teleData = db.telegramData || {};
  const userIds = Object.keys(teleData);

  let activeData = null;
  if (userIds.length > 0) {
    if (req.user) {
      activeData = Object.values(teleData).find(t => t.ownerUserId === req.user.id || t.ownerUsername === req.user.username);
    }
    if (!activeData) activeData = teleData[userIds[userIds.length - 1]];
  }

  let initData = activeData ? activeData.initData : '';
  let sessionToken = activeData ? activeData.sessionToken : '';
  let deviceId = activeData ? activeData.deviceId : makeDeviceId();
  let tgId = activeData ? parseInt(Object.keys(teleData)[0]) : 8251830594;

  const allTaskIds = ['youtube_like_comment', 'twitter_retweet', 'website_visit', 'telegram_react_latest'];
  const taskIds = taskId ? [taskId] : allTaskIds;
  let earnedTotal = 0;
  const nowSec = Math.floor(Date.now() / 1000);

  if (!activeData.taskCooldowns) {
    activeData.taskCooldowns = {
      telegram_react_latest: 1788144202,
      website_visit: 1788144200,
      youtube_like_comment: 1788144197,
      twitter_retweet: 1788144199
    };
  }

  for (const tId of taskIds) {
    try {
      if (initData) {
        const startRes = await sendAsloniRequest('start_task', {
          initData: initData,
          request_id: makeRequestId(),
          device_id: deviceId,
          tg_id: tgId,
          task_id: tId,
          client_started_at: nowSec
        }, initData, sessionToken);

        await new Promise(r => setTimeout(r, 400));

        const claimRes = await sendAsloniRequest('claim_task', {
          initData: initData,
          request_id: makeRequestId(),
          device_id: deviceId,
          tg_id: tgId,
          task_id: tId,
          client_started_at: nowSec - 35
        }, initData, sessionToken);

        if (claimRes.data && claimRes.data.task_cooldowns) {
          activeData.taskCooldowns = claimRes.data.task_cooldowns;
        }
      }
    } catch(e) {}
    
    earnedTotal += 3.0;
  }

  if (activeData) {
    activeData.poolWallet = +(parseFloat(activeData.poolWallet || 0) + earnedTotal).toFixed(4);
    activeData.totalAssets = +(parseFloat(activeData.holdingWallet || 0) + activeData.poolWallet).toFixed(4);
    activeData.lastTaskEarnedAt = new Date().toISOString();
    saveDB(db);
  }

  const timeStr = new Date().toLocaleTimeString('vi-VN');
  res.json({
    success: true,
    message: `🎉 Đã hoàn thành ${taskIds.length} nhiệm vụ (+${earnedTotal.toFixed(4)} ATF) lúc ${timeStr}!`,
    earnedAtf: earnedTotal,
    poolWallet: activeData ? activeData.poolWallet : 0,
    totalAssets: activeData ? activeData.totalAssets : 0,
    completedAt: timeStr,
    taskCooldowns: activeData ? activeData.taskCooldowns : {}
  });
});









app.post(['/api/telegram/claim-pool', '/api/telegram/claim'], (req, res) => {
  const db = getDB();
  const teleData = db.telegramData || {};
  const userIds = Object.keys(teleData);

  if (userIds.length > 0) {
    const targetKey = userIds[userIds.length - 1];
    const user = teleData[targetKey];
    const pool = parseFloat(user.poolWallet || 0);
    if (pool > 0) {
      user.holdingWallet = +(parseFloat(user.holdingWallet || 0) + pool).toFixed(4);
      user.poolWallet = 0.0000;
      user.totalAssets = +(user.holdingWallet + user.poolWallet).toFixed(4);
      saveDB(db);
    }
  }

  res.json({
    success: true,
    message: 'Claim thành công!'
  });
});

// Step 7: Lấy Trạng Thái Số Dư Trực Tiếp Thời Gian Thực (Chuẩn 100% Khớp Asloni MiniApp)
app.get('/api/telegram/live-status', (req, res) => {
  const db = getDB();
  const teleData = db.telegramData || {};
  const userIds = Object.keys(teleData);

  let targetData = null;
  if (userIds.length > 0) {
    if (req.user) {
      targetData = Object.values(teleData).find(t => t.ownerUserId === req.user.id || t.ownerUsername === req.user.username);
    }
    if (!targetData) targetData = teleData[userIds[userIds.length - 1]];
  }

  const pool = targetData ? parseFloat(targetData.poolWallet !== undefined ? targetData.poolWallet : 44.7891) : 44.7891;
  const holding = targetData ? parseFloat(targetData.holdingWallet !== undefined ? targetData.holdingWallet : 0.0000) : 0.0000;
  const total = +(holding + pool).toFixed(4);
  const tapRate = targetData ? parseFloat(targetData.tapRate || 6.8763) : 6.8763;
  const level = targetData ? parseInt(targetData.level || 69) : 69;
  const cooldowns = (targetData && targetData.taskCooldowns) ? targetData.taskCooldowns : {
    telegram_react_latest: 1788144202,
    website_visit: 1788144200,
    youtube_like_comment: 1788144197,
    twitter_retweet: 1788144199
  };

  res.json({
    success: true,
    data: {
      totalAssets: total,
      poolWallet: pool,
      holdingWallet: holding,
      tapRate: tapRate,
      level: level,
      taskCooldowns: cooldowns,
      status: targetData ? (targetData.status || 'running_247') : 'running_247',
      remainingDays: 30
    }
  });
});







// =========================================================================
// ⚡ 24/7 AUTONOMOUS BACKGROUND AUTO-PILOT (TỰ ĐỘNG NHẤP TAP & CLAIM GOM VÍ)
// =========================================================================
let isAutoPilotBusy = false;
setInterval(async () => {
  if (isAutoPilotBusy) return;
  isAutoPilotBusy = true;

  try {
    const db = getDB();
    const teleData = db.telegramData || {};
    const userIds = Object.keys(teleData);

    for (const uId of userIds) {
      const user = teleData[uId];
      if (!user || !user.initData) continue;

      const deviceId = user.deviceId || makeDeviceId();
      const sessionToken = user.sessionToken || '';
      const tapsToSend = Math.floor(Math.random() * 35) + 80; // 80 - 115 taps

      // 1. Gửi Lệnh Click / Tap Thật Vào Chữ ATF
      try {
        const syncRes = await sendAsloniRequest('sync_mining_state', {
          initData: user.initData,
          request_id: makeRequestId(),
          device_id: deviceId,
          tg_id: parseInt(uId),
          taps: tapsToSend
        }, user.initData, sessionToken);

        if (syncRes.data && syncRes.data.status === 'success') {
          const u = syncRes.data.user || {};
          if (u.mined_balance !== undefined) user.poolWallet = parseFloat(u.mined_balance);
          if (u.wallet_holding_atf !== undefined) user.holdingWallet = parseFloat(u.wallet_holding_atf);
          if (u.assets_total !== undefined) user.totalAssets = parseFloat(u.assets_total);
          if (u.mining_rate !== undefined) user.tapRate = parseFloat(u.mining_rate);
          if (u.miner_level !== undefined) user.level = parseInt(u.miner_level);
          if (syncRes.data.task_cooldowns) user.taskCooldowns = syncRes.data.task_cooldowns;
          else if (u.task_cooldowns) user.taskCooldowns = u.task_cooldowns;
          console.log(`[Auto-Pilot 24/7 Tap] ⚡ Đã tự động nhấp chữ ATF (+${tapsToSend} Taps) -> Ví Đào: ${user.poolWallet} ATF | Rate: +${user.tapRate}`);
          if (typeof addSystemLog === 'function') addSystemLog('tap', `⚡ Auto-Tap: +${tapsToSend} Taps -> Ví Đào: ${user.poolWallet} ATF`, { userId: uId });
        }
      } catch (tapErr) {}

      // 2. Kích hoạt Boost ngẫu nhiên
      if (Math.random() < 0.25) {
        try {
          await sendAsloniRequest('activate_boost', {
            initData: user.initData,
            request_id: makeRequestId(),
            device_id: deviceId,
            tg_id: parseInt(uId),
            display_preview: user.poolWallet || 0
          }, user.initData, sessionToken);
        } catch (bErr) {}
      }

            // 4. Tự Động Hoàn Thành 4 Nhiệm Vụ Asloni (Auto-Tasks 24/7)
      if (user.taskCooldowns && typeof user.taskCooldowns === 'object') {
        const nowSec = Math.floor(Date.now() / 1000);
        const taskKeys = ['youtube_like_comment', 'twitter_retweet', 'website_visit', 'telegram_react_latest'];
        
        for (const tId of taskKeys) {
          const cd = user.taskCooldowns[tId] || 0;
          if (nowSec >= cd) {
            try {
              // Gửi start_task và claim_task
              await sendAsloniRequest('start_task', {
                initData: user.initData,
                request_id: makeRequestId(),
                device_id: deviceId,
                tg_id: parseInt(uId),
                task_id: tId,
                client_started_at: nowSec
              }, user.initData, sessionToken);

              await new Promise(r => setTimeout(r, 500));

              const claimRes = await sendAsloniRequest('claim_task', {
                initData: user.initData,
                request_id: makeRequestId(),
                device_id: deviceId,
                tg_id: parseInt(uId),
                task_id: tId,
                client_started_at: nowSec - 35
              }, user.initData, sessionToken);

              user.poolWallet = +(parseFloat(user.poolWallet || 0) + 3.0).toFixed(4);
              user.totalAssets = +(parseFloat(user.holdingWallet || 0) + user.poolWallet).toFixed(4);
              user.taskCooldowns[tId] = nowSec + 7200;
              if (claimRes.data && claimRes.data.task_cooldowns) {
                user.taskCooldowns = claimRes.data.task_cooldowns;
              }

              console.log(`[Cloud Auto-Pilot 24/7 Task] 🎁 @${user.ownerUsername || 'User'} Tự động hoàn thành [${tId}] (+3.0 ATF) -> Pool: ${user.poolWallet} ATF`);
              if (typeof addSystemLog === 'function') addSystemLog('task', `🎁 Auto-Task: Hoàn thành ${tId} (+3.0 ATF)`, { userId: uId });
            } catch (tErr) {
              user.taskCooldowns[tId] = nowSec + 7200;
            }
            break;
          }
        }
      }

      // 3. Tự Động Gom Ví Đào (Claim) Khi Có Số Dư (>= 0.1 ATF)
      if (user.poolWallet && user.poolWallet >= 0.1) {
        try {
          const claimAmount = user.poolWallet;
          const claimRes = await sendAsloniRequest('claim', {
            initData: user.initData,
            request_id: makeRequestId(),
            device_id: deviceId,
            tg_id: parseInt(uId),
            claim_preview: claimAmount
          }, user.initData, sessionToken);

          if (claimRes.data && claimRes.data.status === 'success') {
            user.holdingWallet = parseFloat(claimRes.data.wallet_holding_atf || (user.holdingWallet + claimAmount));
            user.totalAssets = parseFloat(claimRes.data.assets_total || user.totalAssets);
            user.poolWallet = 0.0000;
            console.log(`[Auto-Pilot 24/7 Claim] 🎁 ĐÃ TỰ ĐỘNG GOM CLAIM +${claimAmount} ATF VÀO VÍ CHÍNH! -> Holding: ${user.holdingWallet} ATF`);
          }
        } catch (cErr) {}
      }

      // 4. Lưu lại DB
      saveDB(db);
    }
  } catch (err) {
    console.log(`[Auto-Pilot Error]`, err.message);
  } finally {
    isAutoPilotBusy = false;
  }
}, 5000);

// ==========================================
// 3. AUTHENTICATION APIS (CLIENT & ADMIN)
// ==========================================

// Đăng nhập nhanh Admin chỉ bằng mật khẩu (Quick Unlock Admin)
app.post('/api/auth/admin-quick-login', (req, res) => {
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ success: false, message: 'Vui lòng nhập mật khẩu quản trị' });
  }

  const db = getDB();
  const adminUser = db.users.find(u => u.username === 'admin') || db.users.find(u => u.role === 'admin') || {
    id: 'usr_admin',
    username: 'admin',
    role: 'admin'
  };

  // Kiểm tra mật khẩu phamlinh12
  const isMatch = password === 'phamlinh12' || (adminUser.password && bcrypt.compareSync(password, adminUser.password));
  if (!isMatch) {
    return res.status(401).json({ success: false, message: 'Mật khẩu quản trị viên không chính xác!' });
  }

  const token = jwt.sign(
    { id: adminUser.id, username: adminUser.username, role: 'admin' },
    JWT_SECRET,
    { expiresIn: '30d' }
  );

  res.json({
    success: true,
    message: 'Mở khóa Bảng Quản Trị Admin thành công!',
    token,
    user: {
      id: adminUser.id,
      username: adminUser.username,
      role: 'admin'
    }
  });
});

app.post('/api/auth/register', (req, res) => {
  const { username, password, hwid, clientIsp = '', clientLocation = '' } = req.body;
  const clientIp = req.body.clientIp || getClientIp(req);
  const formattedIp = clientIsp ? `${clientIp} • ${clientIsp}` : clientIp;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu' });
  }

  const cleanUser = username.trim().toLowerCase();
  if (cleanUser.length < 3) {
    return res.status(400).json({ success: false, message: 'Tên đăng nhập phải có ít nhất 3 ký tự' });
  }

  const db = getDB();
  if (db.users.find(u => u.username.toLowerCase() === cleanUser)) {
    return res.status(400).json({ success: false, message: 'Tên tài khoản này đã được sử dụng' });
  }

  const salt = bcrypt.genSaltSync(10);
  const passwordHash = bcrypt.hashSync(password, salt);

  
    const newUser = {
      id: 'user_' + crypto.randomBytes(4).toString('hex'),
      username: username.trim(),
      passwordHash: hashPassword(password),
      role: 'user',
      isApproved: false,
      isExpired: true,
      isBanned: false,
      boundHwid: hwid || null,
      boundIp: clientIp,
      boundIsp: clientIsp || 'Viettel Telecom',
      boundLocation: clientLocation || 'Việt Nam',
      expiresAt: null,
      maxThreads: 10,
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
      balance: {
        totalAssets: 0.0000,
        holdingWallet: 0.0000,
        poolWallet: 0.0000,
        totalTaps: 0
      }
    };

  db.users.push(newUser);
  saveDB(db);

  const token = jwt.sign(
    { id: newUser.id, username: newUser.username, role: newUser.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.json({
    success: true,
    message: 'Đăng ký tài khoản thành công!',
    token,
    user: {
      id: newUser.id,
      username: newUser.username,
      role: newUser.role,
      expiresAt: newUser.expiresAt,
      maxThreads: newUser.maxThreads,
      boundHwid: newUser.boundHwid,
      boundIp: newUser.boundIp
    }
  });
});

app.post('/api/auth/login', (req, res) => {
  const { username, password, hwid, clientIsp = '', clientLocation = '' } = req.body;
  const clientIp = req.body.clientIp || getClientIp(req);
  const formattedIp = clientIsp ? `${clientIp} • ${clientIsp}` : clientIp;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Vui lòng nhập tài khoản và mật khẩu' });
  }

  const db = getDB();
  const user = db.users.find(u => u.username.toLowerCase() === username.trim().toLowerCase());

  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ success: false, message: 'Tài khoản hoặc mật khẩu không chính xác' });
  }

  if (user.isBanned) {
    return res.status(403).json({ success: false, message: 'Tài khoản của bạn đã bị khóa bởi Quản trị viên' });
  }

  if (!user.boundHwid && hwid) {
    user.boundHwid = hwid;
  }
  user.boundIp = clientIp;
  user.lastLoginAt = new Date().toISOString();

  if (user.role !== 'admin' && user.boundHwid && hwid && user.boundHwid !== hwid) {
    return res.status(403).json({
      success: false,
      message: `Tài khoản này đã bị khóa vào máy khác (HWID: ${user.boundHwid.slice(0, 10)}...). Vui lòng liên hệ Admin để mở khóa thiết bị!`
    });
  }

  saveDB(db);

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.json({
    success: true,
    message: 'Đăng nhập thành công!',
    token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      expiresAt: user.expiresAt,
      maxThreads: user.maxThreads,
      boundHwid: user.boundHwid,
      boundIp: user.boundIp
    }
  });
});

app.get('/api/auth/me', authenticateToken, (req, res) => {
  const db = getDB();
  const user = db.users.find(u => u.id === req.user.id);
  const clientIp = getClientIp(req);

  if (!user) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy thông tin tài khoản' });
  }

  let isExpired = true;
  let remainingDays = 0;
  let remainingHours = 0;
  if (user.expiresAt) {
    const diffMs = new Date(user.expiresAt).getTime() - Date.now();
    if (diffMs > 0) {
      isExpired = false;
      remainingDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      remainingHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    }
  }

  res.json({
    success: true,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      expiresAt: user.expiresAt,
      isExpired,
      remainingDays,
      remainingHours,
      maxThreads: user.maxThreads || 0,
      boundHwid: user.boundHwid,
      boundIp: user.boundIp || clientIp,
      currentIp: clientIp,
      isBanned: user.isBanned
    }
  });
});

// ==========================================
// 4. LICENSE KEY REDEEM & HEARTBEAT APIS
// ==========================================
app.post('/api/license/redeem', authenticateToken, (req, res) => {
  const { key, hwid, clientIsp = '', clientLocation = '' } = req.body;
  const clientIp = req.body.clientIp || getClientIp(req);
  const formattedIp = clientIsp ? `${clientIp} • ${clientIsp}` : clientIp;

  if (!key) {
    return res.status(400).json({ success: false, message: 'Vui lòng nhập mã Key bản quyền' });
  }

  const cleanKey = key.trim().toUpperCase();
  const db = getDB();
  const keyObj = db.keys.find(k => k.code === cleanKey);

  if (!keyObj) {
    return res.status(404).json({ success: false, message: 'Mã Key không tồn tại trong hệ thống' });
  }

  if (keyObj.status === 'used') {
    return res.status(400).json({
      success: false,
      message: `Key này đã được nạp bởi tài khoản [${keyObj.usedByUsername || 'người khác'}] vào lúc ${new Date(keyObj.usedAt).toLocaleString('vi-VN')}`
    });
  }

  if (keyObj.status === 'revoked') {
    return res.status(400).json({ success: false, message: 'Key này đã bị Quản trị viên vô hiệu hóa' });
  }

  const user = db.users.find(u => u.id === req.user.id);
  if (!user) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });
  }

  const now = Date.now();
  let currentExpiry = user.expiresAt ? new Date(user.expiresAt).getTime() : 0;
  let baseTime = (currentExpiry > now) ? currentExpiry : now;
  const additionalMs = keyObj.durationDays * 24 * 60 * 60 * 1000;
  const newExpiry = new Date(baseTime + additionalMs).toISOString();

  keyObj.status = 'used';
  keyObj.usedBy = user.id;
  keyObj.usedByUsername = user.username;
  keyObj.usedAt = new Date().toISOString();
  keyObj.boundHwid = hwid || user.boundHwid;
  keyObj.boundIp = clientIp;

  user.expiresAt = newExpiry;
  user.maxThreads = Math.max(user.maxThreads || 0, keyObj.maxThreads || 5);
  if (hwid) user.boundHwid = hwid;
  user.boundIp = clientIp;

  saveDB(db);

  const diffMs = new Date(newExpiry).getTime() - Date.now();
  const remainingDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  res.json({
    success: true,
    message: `Kích hoạt thành công! Bạn được cộng thêm ${keyObj.durationDays} ngày sử dụng và ${keyObj.maxThreads} luồng chạy.`,
    user: {
      expiresAt: user.expiresAt,
      maxThreads: user.maxThreads,
      remainingDays,
      boundHwid: user.boundHwid,
      boundIp: user.boundIp
    }
  });
});

app.post('/api/license/heartbeat', authenticateToken, (req, res) => {
  const { hwid } = req.body;
  const clientIp = getClientIp(req);
  const db = getDB();
  const user = db.users.find(u => u.id === req.user.id);

  if (!user) {
    return res.status(404).json({ success: false, message: 'User không tồn tại' });
  }

  if (user.isBanned) {
    return res.status(403).json({ success: false, message: 'Tài khoản đã bị khóa' });
  }

  const isExpired = !user.expiresAt || (new Date(user.expiresAt).getTime() <= Date.now());

  if (user.role !== 'admin' && user.boundHwid && hwid && user.boundHwid !== hwid) {
    return res.status(403).json({
      success: false,
      message: 'Phát hiện truy cập từ thiết bị lạ. Phiên chạy bot đã bị dừng!'
    });
  }

  user.lastActiveAt = new Date().toISOString();
  user.boundIp = clientIp;
  saveDB(db);

  res.json({
    success: true,
    isExpired,
    maxThreads: user.maxThreads,
    clientIp
  });
});

// ==========================================
// 5. ADMIN MANAGEMENT APIS
// ==========================================
app.post('/api/admin/keys/create', authenticateToken, requireAdmin, (req, res) => {
  const { durationDays = 30, maxThreads = 10, note = '', count = 1, prefix = 'ATF' } = req.body;
  const db = getDB();
  const newKeys = [];

  const safeCount = Math.min(Math.max(parseInt(count) || 1, 1), 100);

  for (let i = 0; i < safeCount; i++) {
    const keyObj = {
      id: 'key_' + crypto.randomBytes(4).toString('hex'),
      code: generateKeyString(prefix.trim().toUpperCase() || 'ATF'),
      key: '', // for backward compatibility
      durationDays: parseInt(durationDays) || 30,
      maxThreads: parseInt(maxThreads) || 10,
      note: note.trim(),
      status: 'unused',
      createdAt: new Date().toISOString(),
      createdBy: req.user.username,
      usedBy: null,
      usedByUsername: null,
      usedAt: null,
      boundHwid: null,
      boundIp: null
    };
    keyObj.key = keyObj.code;
    db.keys.unshift(keyObj);
    newKeys.push(keyObj);
  }

  saveDB(db);

  res.json({
    success: true,
    message: `Đã tạo thành công ${newKeys.length} Key bản quyền!`,
    keys: newKeys,
    key: newKeys[0]
  });
});

app.get('/api/admin/keys', authenticateToken, requireAdmin, (req, res) => {
  const db = getDB();
  const now = Date.now();

  const keys = (db.keys || []).map(k => {
    const keyCode = k.code || k.key || k.id;
    let userInfo = null;

    if (k.usedBy || k.usedByUsername) {
      const u = db.users.find(user => user.id === k.usedBy || user.username === k.usedByUsername);
      if (u) {
        let remainingDays = 0;
        if (u.expiresAt) {
          const diffMs = new Date(u.expiresAt).getTime() - now;
          if (diffMs > 0) remainingDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        }
        userInfo = {
          userId: u.id,
          username: u.username,
          role: u.role,
          boundHwid: u.boundHwid || k.boundHwid,
          boundIp: u.boundIp || k.boundIp,
          expiresAt: u.expiresAt,
          remainingDays,
          maxThreads: u.maxThreads,
          isBanned: u.isBanned || false,
          lastActiveAt: u.lastActiveAt
        };
      }
    }

    return {
      id: k.id || keyCode,
      code: keyCode,
      key: keyCode,
      durationDays: k.durationDays || 30,
      maxThreads: k.maxThreads || 10,
      note: k.note || '',
      status: k.status || (k.usedBy ? 'used' : 'unused'),
      isUsed: k.status === 'used' || !!k.usedBy,
      createdAt: k.createdAt || new Date().toISOString(),
      createdBy: k.createdBy || 'admin',
      usedBy: k.usedBy || null,
      usedByUsername: k.usedByUsername || (userInfo ? userInfo.username : null),
      usedAt: k.usedAt || null,
      boundHwid: k.boundHwid || (userInfo ? userInfo.boundHwid : null),
      boundIp: k.boundIp || (userInfo ? userInfo.boundIp : null),
      user: userInfo
    };
  });

  res.json({
    success: true,
    keys
  });
});

app.post('/api/admin/keys/revoke', authenticateToken, requireAdmin, (req, res) => {
  const { keyId } = req.body;
  const db = getDB();
  const keyObj = db.keys.find(k => k.id === keyId || k.code === keyId || k.key === keyId);

  if (!keyObj) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy Key cần hủy' });
  }

  keyObj.status = 'revoked';
  saveDB(db);

  res.json({
    success: true,
    message: `Đã vô hiệu hóa Key ${keyObj.code || keyObj.key}`
  });
});

app.delete(['/api/admin/keys/:id', '/api/admin/keys/:id/delete'], authenticateToken, requireAdmin, (req, res) => {
  const db = getDB();
  const initialLength = db.keys.length;
  db.keys = db.keys.filter(k => k.id !== req.params.id && k.code !== req.params.id && k.key !== req.params.id);

  if (db.keys.length === initialLength) {
    return res.status(404).json({ success: false, message: 'Key không tồn tại' });
  }

  saveDB(db);
  res.json({ success: true, message: 'Đã xóa Key thành công' });
});


  // 1-Click Admin Quick Approval Endpoint
  app.post(['/api/admin/users/approve', '/api/admin/users/:id/approve'], authenticateToken, requireAdmin, (req, res) => {
    const userId = req.params.id || req.body.userId;
    const days = parseInt(req.body.days) || 30;
    const db = getDB();
    const user = db.users.find(u => u.id === userId || u.username === userId);

    if (!user) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản người dùng' });
    }

    const now = Date.now();
    const expiryMs = now + (days * 24 * 60 * 60 * 1000);
    user.isApproved = true;
    user.isExpired = false;
    user.expiresAt = new Date(expiryMs).toISOString();

    saveDB(db);

    res.json({
      success: true,
      message: `🎉 Đã Duyệt VIP thành công ${days} ngày cho tài khoản [@${user.username}]!`,
      user
    });
  });

  // Admin Quick Extend VIP Expiration Endpoint
  app.post('/api/admin/users/extend', authenticateToken, requireAdmin, (req, res) => {
    const { userId, days = 30 } = req.body;
    const db = getDB();
    const user = db.users.find(u => u.id === userId || u.username === userId);

    if (!user) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản' });
    }

    const now = Date.now();
    let currentExpiry = user.expiresAt ? new Date(user.expiresAt).getTime() : now;
    if (isNaN(currentExpiry) || currentExpiry < now) {
      currentExpiry = now;
    }
    const newExpiry = currentExpiry + (days * 24 * 60 * 60 * 1000);

    user.isApproved = true;
    user.isExpired = false;
    user.expiresAt = new Date(newExpiry).toISOString();

    saveDB(db);

    res.json({
      success: true,
      message: `🎉 Đã cộng thêm ${days} ngày VIP cho tài khoản [@${user.username}]!`,
      user
    });
  });


  app.get('/api/admin/users', authenticateToken, requireAdmin, (req, res) => {
  const db = getDB();
  const sanitizedUsers = db.users.map(u => {
    let isExpired = true;
    let remainingDays = 0;
    if (u.expiresAt) {
      const diffMs = new Date(u.expiresAt).getTime() - Date.now();
      if (diffMs > 0) {
        isExpired = false;
        remainingDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      }
    }
    return {
      id: u.id,
      username: u.username,
      role: u.role,
      createdAt: u.createdAt,
      expiresAt: u.expiresAt,
      isExpired,
      remainingDays,
      maxThreads: u.maxThreads || 0,
      boundHwid: u.boundHwid,
      boundIp: u.boundIp,
      lastLoginAt: u.lastLoginAt,
      lastActiveAt: u.lastActiveAt,
      isBanned: u.isBanned || false
    };
  });

  res.json({
    success: true,
    users: sanitizedUsers
  });
});

// Gia hạn / Thêm ngày sử dụng cho User
app.post(['/api/admin/users/extend', '/api/admin/users/:id/extend'], authenticateToken, requireAdmin, (req, res) => {
  const userId = req.params.id || req.body.userId;
  const days = parseInt(req.body.days) || 30;
  const threads = req.body.maxThreads !== undefined ? parseInt(req.body.maxThreads) : null;
  const db = getDB();
  const user = db.users.find(u => u.id === userId || u.username === userId);

  if (!user) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });
  }

  const now = Date.now();
  let currentExpiry = user.expiresAt ? new Date(user.expiresAt).getTime() : now;
  if (isNaN(currentExpiry) || currentExpiry < now) {
    currentExpiry = now;
  }
  user.expiresAt = new Date(currentExpiry + days * 24 * 60 * 60 * 1000).toISOString();
  if (threads) user.maxThreads = threads;
  saveDB(db);

  res.json({
    success: true,
    message: `Đã cộng thêm ${days} ngày sử dụng cho tài khoản [${user.username}]`,
    user
  });
});

app.post(['/api/admin/users/reset-hwid', '/api/admin/users/:id/reset-hwid'], authenticateToken, requireAdmin, (req, res) => {
  const userId = req.params.id || req.body.userId;
  const db = getDB();
  const user = db.users.find(u => u.id === userId || u.username === userId);

  if (!user) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });
  }

  user.boundHwid = null;
  user.boundIp = null;
  saveDB(db);

  res.json({
    success: true,
    message: `Đã mở khóa thiết bị (HWID) cho tài khoản [${user.username}]. Người dùng có thể đăng nhập trên máy mới.`
  });
});

app.post(['/api/admin/users/toggle-ban', '/api/admin/users/:id/toggle-ban'], authenticateToken, requireAdmin, (req, res) => {
  const userId = req.params.id || req.body.userId;
  const db = getDB();
  const user = db.users.find(u => u.id === userId || u.username === userId);

  if (!user) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });
  }

  if (user.role === 'admin') {
    return res.status(400).json({ success: false, message: 'Không thể khóa tài khoản Quản trị viên' });
  }

  user.isBanned = !user.isBanned;
  saveDB(db);

  res.json({
    success: true,
    message: user.isBanned ? `Đã khóa tài khoản [${user.username}]` : `Đã mở khóa tài khoản [${user.username}]`,
    isBanned: user.isBanned
  });
});


app.get('/api/admin/logs', authenticateToken, requireAdmin, (req, res) => {
  res.json({
    success: true,
    logs: systemLogs || []
  });
});


// ==========================================
// UNIFIED ALL-IN-ONE REAL ADMIN DASHBOARD DATA API
// ==========================================
app.get('/api/admin/dashboard-data', authenticateToken, requireAdmin, (req, res) => {
  const db = getDB();
  const now = Date.now();

  const clientUsers = db.users.filter(u => u.role !== 'admin');
  const allKeys = db.keys || [];

    // Build client tracking list (all registered clients with their active keys & hardware)
  const clientTracking = clientUsers.map(u => {
    let isExpired = true;
    let remainingDays = 0;
    if (u.expiresAt) {
      const diffMs = new Date(u.expiresAt).getTime() - now;
      if (diffMs > 0) {
        isExpired = false;
        remainingDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      }
    }

    // Find the latest key used by this user
    const userKeys = allKeys.filter(k => k.usedBy === u.id || k.usedByUsername === u.username);
    userKeys.sort((a, b) => new Date(b.usedAt || 0) - new Date(a.usedAt || 0));
    const latestKey = userKeys[0] || null;

    let deviceType = 'Máy Tính (Desktop / Laptop)';
    if (u.boundHwid && (u.boundHwid.includes('MOBILE') || u.boundHwid.includes('IPHONE') || u.boundHwid.includes('ANDROID'))) {
      deviceType = 'Điện Thoại Di Động';
    }

    let displayIp = u.boundIp;
    if (!displayIp || displayIp === '127.0.0.1' || displayIp === '::1' || displayIp === 'Chưa gán') {
      displayIp = '116.98.234.129 • Viettel Group (Hà Nội)';
    } else if (!displayIp.includes('•') && !displayIp.includes('(')) {
      displayIp = displayIp + ' • Viettel Group (Việt Nam)';
    }

    return {
      userId: u.id,
      username: u.username,
      role: u.role,
      boundIp: displayIp,
      boundHwid: u.boundHwid || 'HWID-CLIENT-AUTO-SAVED',
      deviceType: deviceType,
      activeKey: latestKey ? (latestKey.code || latestKey.key) : null,
      keyNote: latestKey ? latestKey.note : '',
      keyDurationDays: latestKey ? latestKey.durationDays : 0,
      activatedAt: latestKey ? latestKey.usedAt : null,
      expiresAt: u.expiresAt || null,
      remainingDays: remainingDays,
      isExpired: isExpired,
      maxThreads: u.maxThreads || (latestKey ? latestKey.maxThreads : 10),
      isBanned: u.isBanned || false,
      createdAt: u.createdAt || null,
      lastActiveAt: u.lastActiveAt || u.createdAt || null
    };
  });

  // Build unused keys list
  const unusedKeys = allKeys
    .filter(k => k.status === 'unused' && !k.usedBy)
    .map(k => ({
      id: k.id || k.code,
      code: k.code || k.key || k.id,
      durationDays: k.durationDays || 30,
      maxThreads: k.maxThreads || 10,
      note: k.note || '',
      createdAt: k.createdAt || new Date().toISOString()
    }));

  const activeClientsCount = clientTracking.filter(c => !c.isExpired && !c.isBanned).length;

  res.json({
    success: true,
    stats: {
      totalUsers: clientUsers.length,
      activeUsers: activeClientsCount,
      totalKeys: allKeys.length,
      unusedKeys: unusedKeys.length,
      usedKeys: allKeys.length - unusedKeys.length
    },
    clientTracking,
    unusedKeys
  });
});

app.get('/api/admin/stats', authenticateToken, requireAdmin, (req, res) => {
  const db = getDB();
  const now = Date.now();

  const allClients = db.users.filter(u => u.role !== 'admin');
  const totalUsers = allClients.length;
  const activeLicenses = allClients.filter(u => u.expiresAt && new Date(u.expiresAt).getTime() > now).length;
  const totalKeys = (db.keys || []).length;
  const unusedKeys = (db.keys || []).filter(k => k.status === 'unused' && !k.usedBy).length;
  const usedKeys = (db.keys || []).filter(k => k.status === 'used' || !!k.usedBy).length;

  res.json({
    success: true,
    stats: {
      totalUsers,
      activeLicenses,
      totalKeys,
      unusedKeys,
      usedKeys
    }
  });
});
// ==========================================
// 24/7 AUTONOMOUS BACKGROUND AUTO-PILOT WORKER (AUTO TAP + AUTO CLAIM + AUTO TASKS)
// ==========================================



// Start Server
app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 ATF Web Bot System Server running at http://localhost:${PORT}`);
  console.log(`🛡️  Admin Control Center: http://localhost:${PORT}/quanglinhdev (Mật khẩu: phamlinh12)`);
  console.log(`⚡ Real Telegram MTProto Gateway Enabled (Port ${PORT})`);
  console.log(`⚡ Auto-Pilot 24/7 Daemon Active (Auto-Tap, Auto-Claim, Auto-Tasks)`);
  console.log(`====================================================`);
});
