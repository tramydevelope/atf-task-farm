<?php
/**
 * ATF Task Farm - MySQL/MariaDB API for shared hosting
 * - Real users/license data from SQL
 * - New accounts require admin approval
 * - Expired/missing license is access-gated
 * - HMAC signed bearer token, no hard-coded DB/admin password
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '') {
    $host = $_SERVER['HTTP_HOST'] ?? '';
    $originHost = parse_url($origin, PHP_URL_HOST) ?: '';
    if ($host !== '' && strcasecmp(preg_replace('/:\d+$/', '', $host), $originHost) === 0) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Vary: Origin');
    }
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

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
    if ($env !== false && $env !== '') {
        return $env;
    }
    if (array_key_exists($key, $localConfig) && $localConfig[$key] !== '') {
        return $localConfig[$key];
    }
    return $default;
}

function jsonResp($data, $code = 200) {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function getClientIp() {
    $candidates = [];
    if (!empty($_SERVER['HTTP_CF_CONNECTING_IP'])) {
        $candidates[] = trim($_SERVER['HTTP_CF_CONNECTING_IP']);
    }
    if (!empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
        foreach (explode(',', $_SERVER['HTTP_X_FORWARDED_FOR']) as $item) {
            $candidates[] = trim($item);
        }
    }
    if (!empty($_SERVER['HTTP_X_REAL_IP'])) {
        $candidates[] = trim($_SERVER['HTTP_X_REAL_IP']);
    }
    if (!empty($_SERVER['REMOTE_ADDR'])) {
        $candidates[] = trim($_SERVER['REMOTE_ADDR']);
    }

    foreach ($candidates as $ip) {
        if (filter_var($ip, FILTER_VALIDATE_IP)) {
            return $ip;
        }
    }
    return null;
}

function base64UrlEncode($raw) {
    return rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');
}

function base64UrlDecode($raw) {
    $pad = strlen($raw) % 4;
    if ($pad) {
        $raw .= str_repeat('=', 4 - $pad);
    }
    return base64_decode(strtr($raw, '-_', '+/'), true);
}

function appKey() {
    $key = (string)cfg('ATF_APP_KEY', '');
    if (strlen($key) < 32 || strpos($key, 'CHANGE_ME') !== false) {
        jsonResp([
            'success' => false,
            'errorCode' => 'APP_KEY_NOT_CONFIGURED',
            'message' => 'Server chưa cấu hình ATF_APP_KEY an toàn. Hãy cấu hình config.php trước.'
        ], 500);
    }
    return $key;
}

function issueToken($user) {
    $payload = [
        'sub' => $user['id'],
        'usr' => $user['username'],
        'role' => $user['role'],
        'iat' => time(),
        'exp' => time() + 7 * 86400,
        'nonce' => bin2hex(random_bytes(6))
    ];
    $body = base64UrlEncode(json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    $sig = base64UrlEncode(hash_hmac('sha256', $body, appKey(), true));
    return $body . '.' . $sig;
}

function authorizationHeader() {
    if (!empty($_SERVER['HTTP_AUTHORIZATION'])) {
        return trim($_SERVER['HTTP_AUTHORIZATION']);
    }
    if (!empty($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
        return trim($_SERVER['REDIRECT_HTTP_AUTHORIZATION']);
    }
    if (function_exists('getallheaders')) {
        $headers = getallheaders();
        foreach ($headers as $name => $value) {
            if (strcasecmp($name, 'Authorization') === 0) {
                return trim($value);
            }
        }
    }
    return '';
}

function readTokenPayload() {
    $header = authorizationHeader();
    if (!preg_match('/^Bearer\s+(.+)$/i', $header, $m)) {
        return null;
    }
    $token = trim($m[1]);
    $parts = explode('.', $token);
    if (count($parts) !== 2) {
        return null;
    }
    list($body, $sig) = $parts;
    $expected = base64UrlEncode(hash_hmac('sha256', $body, appKey(), true));
    if (!hash_equals($expected, $sig)) {
        return null;
    }
    $decoded = base64UrlDecode($body);
    if ($decoded === false) {
        return null;
    }
    $payload = json_decode($decoded, true);
    if (!is_array($payload) || empty($payload['sub']) || empty($payload['exp']) || (int)$payload['exp'] < time()) {
        return null;
    }
    return $payload;
}

function userGateState($user) {
    if (($user['role'] ?? 'user') === 'admin') {
        return 'active';
    }
    if (!empty($user['is_banned']) || ($user['status'] ?? '') === 'banned') {
        return 'banned';
    }
    if (empty($user['is_approved']) || ($user['status'] ?? '') === 'pending') {
        return 'pending';
    }
    if (empty($user['expires_at']) || strtotime($user['expires_at']) <= time()) {
        return 'license_required';
    }
    return 'active';
}

function remainingLicense($user) {
    if (($user['role'] ?? 'user') === 'admin') {
        return [9999, 0, false];
    }
    if (empty($user['expires_at'])) {
        return [0, 0, true];
    }
    $seconds = strtotime($user['expires_at']) - time();
    if ($seconds <= 0) {
        return [0, 0, true];
    }
    return [(int)floor($seconds / 86400), (int)floor(($seconds % 86400) / 3600), false];
}

function userPayload($user, $currentIp = null) {
    list($days, $hours, $expired) = remainingLicense($user);
    return [
        'id' => $user['id'],
        'username' => $user['username'],
        'role' => $user['role'],
        'status' => $user['status'] ?? null,
        'isApproved' => (bool)($user['is_approved'] ?? false),
        'isBanned' => (bool)($user['is_banned'] ?? false),
        'activeKey' => $user['active_key'] ?? null,
        'expiresAt' => $user['expires_at'] ?? null,
        'isExpired' => $expired,
        'remainingDays' => $days,
        'remainingHours' => $hours,
        'maxThreads' => (int)($user['max_threads'] ?? 0),
        'boundHwid' => $user['bound_hwid'] ?? null,
        'boundIp' => $user['bound_ip'] ?? null,
        'currentIp' => $currentIp,
        'deviceType' => $user['device_type'] ?? null,
        'lastLoginAt' => $user['last_login_at'] ?? null,
        'lastActiveAt' => $user['last_active_at'] ?? null,
        'createdAt' => $user['created_at'] ?? null
    ];
}

function findUserById(PDO $pdo, $id) {
    $stmt = $pdo->prepare('SELECT * FROM users WHERE id = ? LIMIT 1');
    $stmt->execute([$id]);
    return $stmt->fetch();
}

/**
 * Verify password hashes from current PHP installs and older ATF builds.
 * Any legacy/plain/SHA-256 value that matches is immediately upgraded to PASSWORD_DEFAULT.
 */
function verifyAndUpgradePassword(PDO $pdo, $user, $password) {
    if (!$user || !array_key_exists('password', $user)) {
        return false;
    }

    $stored = (string)$user['password'];
    if ($stored === '') {
        return false;
    }

    $verified = false;
    $legacy = false;
    $verifiedHash = $stored;

    // Modern PHP password_hash() and compatible bcrypt hashes.
    if (password_verify($password, $stored)) {
        $verified = true;
    } elseif (preg_match('/^\$2b\$/', $stored)) {
        // Some Node bcrypt exports use $2b$; normalize for older PHP runtimes.
        $normalized = '$2y$' . substr($stored, 4);
        if (password_verify($password, $normalized)) {
            $verified = true;
            $legacy = true;
            $verifiedHash = $normalized;
        }
    } elseif (preg_match('/^[a-f0-9]{64}$/i', $stored)) {
        // Legacy SHA-256 records from early ATF builds.
        $verified = hash_equals(strtolower($stored), hash('sha256', $password));
        $legacy = $verified;
    } elseif (!preg_match('/^\$[A-Za-z0-9]/', $stored)) {
        // One-time migration path for old plaintext imports. Never store plaintext again.
        $verified = hash_equals($stored, $password);
        $legacy = $verified;
    }

    if (!$verified) {
        return false;
    }

    $needsRehash = $legacy;
    if (!$legacy) {
        $info = password_get_info($verifiedHash);
        if (!empty($info['algo'])) {
            $needsRehash = password_needs_rehash($verifiedHash, PASSWORD_DEFAULT);
        }
    }

    if ($needsRehash && !empty($user['id'])) {
        $stmt = $pdo->prepare('UPDATE users SET password = ? WHERE id = ?');
        $stmt->execute([password_hash($password, PASSWORD_DEFAULT), $user['id']]);
    }

    return true;
}

function requireUser(PDO $pdo) {
    $payload = readTokenPayload();
    if (!$payload) {
        jsonResp(['success' => false, 'message' => 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn'], 401);
    }
    $user = findUserById($pdo, $payload['sub']);
    if (!$user) {
        jsonResp(['success' => false, 'message' => 'Tài khoản không còn tồn tại'], 401);
    }
    return $user;
}

function requireAdmin(PDO $pdo) {
    $user = requireUser($pdo);
    if (($user['role'] ?? '') !== 'admin' || !empty($user['is_banned'])) {
        jsonResp(['success' => false, 'message' => 'Bạn không có quyền quản trị'], 403);
    }
    return $user;
}

function requireActiveUser(PDO $pdo) {
    $user = requireUser($pdo);
    $gate = userGateState($user);
    if ($gate !== 'active') {
        $messages = [
            'pending' => 'Tài khoản đang chờ Admin duyệt.',
            'license_required' => 'Key đã hết hạn hoặc chưa được kích hoạt. Quyền sử dụng đã bị khóa.',
            'banned' => 'Tài khoản đã bị Admin khóa.'
        ];
        jsonResp([
            'success' => false,
            'gateState' => $gate,
            'message' => $messages[$gate] ?? 'Tài khoản chưa đủ quyền sử dụng web.'
        ], 403);
    }
    return $user;
}

function randomId($prefix) {
    return $prefix . '_' . bin2hex(random_bytes(8));
}

function generateLicenseCode($prefix = 'ATF') {
    $prefix = preg_replace('/[^A-Z0-9]/', '', strtoupper($prefix));
    if ($prefix === '') {
        $prefix = 'ATF';
    }
    return $prefix . '-' . strtoupper(bin2hex(random_bytes(2))) . '-' . strtoupper(bin2hex(random_bytes(2))) . '-' . strtoupper(bin2hex(random_bytes(2)));
}

function columnExists(PDO $pdo, $table, $column) {
    $stmt = $pdo->prepare('SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?');
    $stmt->execute([$table, $column]);
    return (int)$stmt->fetchColumn() > 0;
}

function ensureColumn(PDO $pdo, $table, $column, $definition) {
    if (!columnExists($pdo, $table, $column)) {
        $pdo->exec("ALTER TABLE `$table` ADD COLUMN `$column` $definition");
    }
}

function setupConfigured($configFile) {
    if (!is_file($configFile)) {
        return false;
    }
    $dbName = (string)cfg('ATF_DB_NAME', '');
    $dbUser = (string)cfg('ATF_DB_USER', '');
    $appKey = (string)cfg('ATF_APP_KEY', '');
    if ($dbName === '' || $dbUser === '' || strlen($appKey) < 32) {
        return false;
    }
    foreach ([$dbName, $dbUser, $appKey] as $value) {
        if (stripos($value, 'CHANGE_ME') !== false || stripos($value, 'your_database') !== false) {
            return false;
        }
    }
    return true;
}

function setupRequirements($configFile) {
    $parent = dirname($configFile);
    return [
        'phpVersion' => PHP_VERSION,
        'phpOk' => version_compare(PHP_VERSION, '7.4.0', '>='),
        'pdoMysql' => extension_loaded('pdo_mysql'),
        'configExists' => is_file($configFile),
        'configUsable' => setupConfigured($configFile),
        'configWritable' => is_file($configFile) ? is_writable($configFile) : is_writable($parent),
        'configPath' => basename($configFile)
    ];
}

function setupPdo($host, $port, $dbName, $dbUser, $dbPass) {
    if (!extension_loaded('pdo_mysql')) {
        throw new RuntimeException('PHP trên host chưa bật extension pdo_mysql.');
    }
    $host = trim((string)$host);
    $port = trim((string)$port) ?: '3306';
    $dbName = trim((string)$dbName);
    $dbUser = trim((string)$dbUser);
    if ($host === '' || $dbName === '' || $dbUser === '') {
        throw new InvalidArgumentException('Vui lòng nhập đủ DB Host, Database và DB User.');
    }
    // Web installer is intentionally limited to local MySQL for shared-host safety.
    $allowedHosts = ['localhost', '127.0.0.1', '::1'];
    if (!in_array(strtolower($host), $allowedHosts, true)) {
        throw new InvalidArgumentException('Trình cài đặt web chỉ cho phép MySQL local (localhost/127.0.0.1). DB từ xa hãy cấu hình thủ công trong config.php.');
    }
    if (!preg_match('/^\d{1,5}$/', $port) || (int)$port < 1 || (int)$port > 65535) {
        throw new InvalidArgumentException('DB Port không hợp lệ.');
    }
    return new PDO(
        "mysql:host={$host};port={$port};dbname={$dbName};charset=utf8mb4",
        $dbUser,
        (string)$dbPass,
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false
        ]
    );
}

function setupSchema(PDO $pdo) {
    $pdo->exec("CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(64) PRIMARY KEY,
        username VARCHAR(100) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        role ENUM('admin','user') NOT NULL DEFAULT 'user',
        status ENUM('pending','approved','active','banned') NOT NULL DEFAULT 'pending',
        is_approved TINYINT(1) NOT NULL DEFAULT 0,
        active_key VARCHAR(64) NULL,
        bound_hwid VARCHAR(100) NULL,
        bound_ip VARCHAR(100) NULL,
        bound_isp VARCHAR(150) NULL,
        bound_location VARCHAR(180) NULL,
        device_type VARCHAR(150) NULL,
        max_threads INT NOT NULL DEFAULT 0,
        expires_at DATETIME NULL,
        is_banned TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_login_at DATETIME NULL,
        last_active_at DATETIME NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    ensureColumn($pdo, 'users', 'status', "ENUM('pending','approved','active','banned') NOT NULL DEFAULT 'pending' AFTER role");
    ensureColumn($pdo, 'users', 'is_approved', 'TINYINT(1) NOT NULL DEFAULT 0 AFTER status');
    ensureColumn($pdo, 'users', 'active_key', 'VARCHAR(64) NULL AFTER is_approved');
    ensureColumn($pdo, 'users', 'bound_isp', 'VARCHAR(150) NULL AFTER bound_ip');
    ensureColumn($pdo, 'users', 'bound_location', 'VARCHAR(180) NULL AFTER bound_isp');
    ensureColumn($pdo, 'users', 'device_type', 'VARCHAR(150) NULL AFTER bound_location');
    ensureColumn($pdo, 'users', 'last_login_at', 'DATETIME NULL AFTER created_at');
    ensureColumn($pdo, 'users', 'last_active_at', 'DATETIME NULL AFTER last_login_at');
    $pdo->exec("ALTER TABLE users MODIFY status ENUM('pending','approved','active','banned') NOT NULL DEFAULT 'pending'");

    $pdo->exec("CREATE TABLE IF NOT EXISTS license_keys (
        id VARCHAR(64) PRIMARY KEY,
        code VARCHAR(64) NOT NULL UNIQUE,
        duration_days INT NOT NULL DEFAULT 30,
        max_threads INT NOT NULL DEFAULT 20,
        note VARCHAR(255) NULL,
        status ENUM('unused','used','revoked') NOT NULL DEFAULT 'unused',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        used_by VARCHAR(100) NULL,
        used_at DATETIME NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $pdo->exec("ALTER TABLE license_keys MODIFY status ENUM('unused','used','revoked') NOT NULL DEFAULT 'unused'");

    $pdo->exec("CREATE TABLE IF NOT EXISTS telegram_sessions (
        tg_user_id VARCHAR(64) PRIMARY KEY,
        phone VARCHAR(30) NOT NULL,
        owner_user_id VARCHAR(64) NULL,
        owner_username VARCHAR(100) NOT NULL,
        tg_username VARCHAR(100) NULL,
        bound_ip VARCHAR(100) NULL,
        bound_hwid VARCHAR(100) NULL,
        device_type VARCHAR(150) NULL,
        total_assets DECIMAL(14,4) NULL,
        holding_wallet DECIMAL(14,4) NULL,
        pool_wallet DECIMAL(14,4) NULL,
        mined_balance DECIMAL(14,4) NULL,
        level INT NULL,
        tap_rate DECIMAL(10,4) NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'offline',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_sync DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_tg_owner_user (owner_user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    ensureColumn($pdo, 'telegram_sessions', 'owner_user_id', 'VARCHAR(64) NULL AFTER phone');
    ensureColumn($pdo, 'telegram_sessions', 'tg_username', 'VARCHAR(100) NULL AFTER owner_username');
    ensureColumn($pdo, 'telegram_sessions', 'bound_ip', 'VARCHAR(100) NULL AFTER tg_username');
    ensureColumn($pdo, 'telegram_sessions', 'bound_hwid', 'VARCHAR(100) NULL AFTER bound_ip');
    ensureColumn($pdo, 'telegram_sessions', 'device_type', 'VARCHAR(150) NULL AFTER bound_hwid');
    ensureColumn($pdo, 'telegram_sessions', 'created_at', 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER status');
    $pdo->exec("ALTER TABLE telegram_sessions MODIFY total_assets DECIMAL(14,4) NULL, MODIFY holding_wallet DECIMAL(14,4) NULL, MODIFY pool_wallet DECIMAL(14,4) NULL, MODIFY mined_balance DECIMAL(14,4) NULL, MODIFY level INT NULL, MODIFY tap_rate DECIMAL(10,4) NULL");
}

function writePrivateConfig($configFile, array $values) {
    $content = "<?php\n/** Generated by ATF secure installer. Keep this file private. */\nreturn "
        . var_export($values, true)
        . ";\n";
    $tmp = $configFile . '.tmp.' . bin2hex(random_bytes(4));
    if (@file_put_contents($tmp, $content, LOCK_EX) === false) {
        throw new RuntimeException('Không ghi được config.php. Kiểm tra quyền ghi thư mục project.');
    }
    @chmod($tmp, 0600);
    if (!@rename($tmp, $configFile)) {
        @unlink($tmp);
        throw new RuntimeException('Không thể hoàn tất config.php. Kiểm tra quyền ghi/rename trên hosting.');
    }
    @chmod($configFile, 0600);
}

$uri = $_SERVER['REQUEST_URI'] ?? '/';
$path = parse_url($uri, PHP_URL_PATH) ?: '/';
if (preg_match('#/api/(.*)$#', $path, $m)) {
    $route = '/' . ltrim($m[1], '/');
} else {
    $route = '/' . ltrim($path, '/');
}
$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
$rawInput = file_get_contents('php://input');
$input = json_decode($rawInput, true);
if (!is_array($input)) {
    $input = $_POST ?: [];
}

if ($route === '/system/client-info') {
    jsonResp([
        'success' => true,
        'ip' => getClientIp(),
        'timestamp' => date('c'),
        'userAgent' => $_SERVER['HTTP_USER_AGENT'] ?? ''
    ]);
}

// ---------------- FIRST-RUN SETUP ----------------
// Available only while config.php does not exist. Once installed, write routes are permanently disabled.
if ($route === '/setup/status' && $method === 'GET') {
    $requirements = setupRequirements($configFile);
    jsonResp([
        'success' => true,
        'configured' => setupConfigured($configFile),
        'requirements' => $requirements,
        'message' => setupConfigured($configFile)
            ? 'Server đã có config.php hợp lệ. Trình cài đặt đã khóa.'
            : 'Server chưa cấu hình. Có thể cài Database tại trang /setup.'
    ]);
}

if (($route === '/setup/test-db' || $route === '/setup/install') && $method === 'POST') {
    if (setupConfigured($configFile)) {
        jsonResp([
            'success' => false,
            'errorCode' => 'SETUP_LOCKED',
            'message' => 'Server đã có config.php. Trình cài đặt đã khóa để bảo vệ hệ thống.'
        ], 423);
    }

    $dbHostInput = trim((string)($input['dbHost'] ?? 'localhost')) ?: 'localhost';
    $dbPortInput = trim((string)($input['dbPort'] ?? '3306')) ?: '3306';
    $dbNameInput = trim((string)($input['dbName'] ?? ''));
    $dbUserInput = trim((string)($input['dbUser'] ?? ''));
    $dbPassInput = (string)($input['dbPass'] ?? '');
    $telegramServiceBaseInput = rtrim(trim((string)($input['telegramServiceBase'] ?? '')), '/');
    if ($telegramServiceBaseInput !== '' && !filter_var($telegramServiceBaseInput, FILTER_VALIDATE_URL)) {
        jsonResp(['success' => false, 'errorCode' => 'TELEGRAM_SERVICE_URL_INVALID', 'message' => 'Telegram Service URL không hợp lệ. Ví dụ: https://atf-telegram.onrender.com'], 400);
    }

    try {
        $setupDb = setupPdo($dbHostInput, $dbPortInput, $dbNameInput, $dbUserInput, $dbPassInput);
        $setupDb->query('SELECT 1')->fetchColumn();
    } catch (InvalidArgumentException $e) {
        jsonResp(['success' => false, 'errorCode' => 'SETUP_INPUT_INVALID', 'message' => $e->getMessage()], 400);
    } catch (RuntimeException $e) {
        jsonResp(['success' => false, 'errorCode' => 'SETUP_REQUIREMENT_FAILED', 'message' => $e->getMessage()], 503);
    } catch (PDOException $e) {
        error_log('[ATF SETUP DB] ' . $e->getMessage());
        jsonResp([
            'success' => false,
            'errorCode' => 'SETUP_DB_CONNECTION_FAILED',
            'message' => 'Không kết nối được MySQL. Kiểm tra tên Database, DB User, mật khẩu và quyền user trên hosting.'
        ], 400);
    }

    if ($route === '/setup/test-db') {
        jsonResp(['success' => true, 'message' => 'Kết nối MySQL thành công.']);
    }

    $adminUserInput = trim((string)($input['adminUser'] ?? 'admin')) ?: 'admin';
    $adminPassInput = (string)($input['adminPassword'] ?? '');
    if (!preg_match('/^[A-Za-z0-9_.-]{3,50}$/', $adminUserInput)) {
        jsonResp(['success' => false, 'errorCode' => 'ADMIN_USER_INVALID', 'message' => 'Admin username phải dài 3-50 ký tự và chỉ gồm chữ, số, _, -, .'], 400);
    }
    if (strlen($adminPassInput) < 8) {
        jsonResp(['success' => false, 'errorCode' => 'ADMIN_PASSWORD_WEAK', 'message' => 'Mật khẩu Admin phải có ít nhất 8 ký tự.'], 400);
    }

    try {
        setupSchema($setupDb);

        $stmt = $setupDb->prepare('SELECT * FROM users WHERE username = ? LIMIT 1');
        $stmt->execute([$adminUserInput]);
        $existingAdmin = $stmt->fetch();
        $adminHash = password_hash($adminPassInput, PASSWORD_DEFAULT);
        if (!$existingAdmin) {
            $stmt = $setupDb->prepare("INSERT INTO users (id, username, password, role, status, is_approved, max_threads, expires_at, is_banned) VALUES (?, ?, ?, 'admin', 'active', 1, 999, NULL, 0)");
            $stmt->execute([randomId('usr'), $adminUserInput, $adminHash]);
        } elseif (($existingAdmin['role'] ?? '') !== 'admin') {
            jsonResp([
                'success' => false,
                'errorCode' => 'ADMIN_USER_CONFLICT',
                'message' => 'Username Admin này đã tồn tại dưới dạng thành viên thường. Hãy chọn username Admin khác.'
            ], 409);
        } else {
            $stmt = $setupDb->prepare("UPDATE users SET password = ?, status = 'active', is_approved = 1, is_banned = 0 WHERE id = ?");
            $stmt->execute([$adminHash, $existingAdmin['id']]);
        }

        $appKey = bin2hex(random_bytes(32));
        writePrivateConfig($configFile, [
            'ATF_DB_HOST' => $dbHostInput,
            'ATF_DB_PORT' => $dbPortInput,
            'ATF_DB_NAME' => $dbNameInput,
            'ATF_DB_USER' => $dbUserInput,
            'ATF_DB_PASS' => $dbPassInput,
            'ATF_APP_KEY' => $appKey,
            'ATF_TELEGRAM_SERVICE_BASE' => $telegramServiceBaseInput,
            'ATF_ADMIN_USER' => $adminUserInput,
            'ATF_ADMIN_PASSWORD' => '', // Password is stored only as a hash in SQL after web setup.
        ]);
    } catch (Throwable $e) {
        error_log('[ATF SETUP INSTALL] ' . $e->getMessage());
        jsonResp([
            'success' => false,
            'errorCode' => 'SETUP_INSTALL_FAILED',
            'message' => 'Không thể hoàn tất cài đặt: ' . $e->getMessage()
        ], 500);
    }

    jsonResp([
        'success' => true,
        'configured' => true,
        'message' => 'Cài đặt thành công. Database, Admin và khóa ứng dụng đã sẵn sàng.'
    ], 201);
}

$dbHost = (string)cfg('ATF_DB_HOST', 'localhost');
$dbPort = (string)cfg('ATF_DB_PORT', '3306');
$dbName = (string)cfg('ATF_DB_NAME', '');
$dbUser = (string)cfg('ATF_DB_USER', '');
$dbPass = (string)cfg('ATF_DB_PASS', '');

if ($dbName === '' || $dbUser === '') {
    jsonResp([
        'success' => false,
        'errorCode' => 'DB_NOT_CONFIGURED',
        'message' => 'Server chưa cấu hình Database. Mở /setup để cài tự động hoặc tạo config.php từ config.example.php.'
    ], 503);
}

try {
    $pdo = new PDO(
        "mysql:host={$dbHost};port={$dbPort};dbname={$dbName};charset=utf8mb4",
        $dbUser,
        $dbPass,
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false
        ]
    );
} catch (PDOException $e) {
    error_log('[ATF DB] ' . $e->getMessage());
    jsonResp(['success' => false, 'errorCode' => 'DB_CONNECTION_FAILED', 'message' => 'Không kết nối được Database SQL trên host. Kiểm tra config.php và quyền DB user.'], 503);
}

// Schema bootstrap/migration for old v5 installations.
try {
    $pdo->exec("CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(64) PRIMARY KEY,
        username VARCHAR(100) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        role ENUM('admin','user') NOT NULL DEFAULT 'user',
        status ENUM('pending','approved','active','banned') NOT NULL DEFAULT 'pending',
        is_approved TINYINT(1) NOT NULL DEFAULT 0,
        active_key VARCHAR(64) NULL,
        bound_hwid VARCHAR(100) NULL,
        bound_ip VARCHAR(100) NULL,
        bound_isp VARCHAR(150) NULL,
        bound_location VARCHAR(180) NULL,
        device_type VARCHAR(150) NULL,
        max_threads INT NOT NULL DEFAULT 0,
        expires_at DATETIME NULL,
        is_banned TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_login_at DATETIME NULL,
        last_active_at DATETIME NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    ensureColumn($pdo, 'users', 'status', "ENUM('pending','approved','active','banned') NOT NULL DEFAULT 'pending' AFTER role");
    ensureColumn($pdo, 'users', 'is_approved', 'TINYINT(1) NOT NULL DEFAULT 0 AFTER status');
    ensureColumn($pdo, 'users', 'active_key', 'VARCHAR(64) NULL AFTER is_approved');
    ensureColumn($pdo, 'users', 'bound_isp', 'VARCHAR(150) NULL AFTER bound_ip');
    ensureColumn($pdo, 'users', 'bound_location', 'VARCHAR(180) NULL AFTER bound_isp');
    ensureColumn($pdo, 'users', 'device_type', 'VARCHAR(150) NULL AFTER bound_location');
    ensureColumn($pdo, 'users', 'last_login_at', 'DATETIME NULL AFTER created_at');
    ensureColumn($pdo, 'users', 'last_active_at', 'DATETIME NULL AFTER last_login_at');
    $pdo->exec("ALTER TABLE users MODIFY status ENUM('pending','approved','active','banned') NOT NULL DEFAULT 'pending'");

    $pdo->exec("CREATE TABLE IF NOT EXISTS license_keys (
        id VARCHAR(64) PRIMARY KEY,
        code VARCHAR(64) NOT NULL UNIQUE,
        duration_days INT NOT NULL DEFAULT 30,
        max_threads INT NOT NULL DEFAULT 20,
        note VARCHAR(255) NULL,
        status ENUM('unused','used','revoked') NOT NULL DEFAULT 'unused',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        used_by VARCHAR(100) NULL,
        used_at DATETIME NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $pdo->exec("ALTER TABLE license_keys MODIFY status ENUM('unused','used','revoked') NOT NULL DEFAULT 'unused'");

    $pdo->exec("CREATE TABLE IF NOT EXISTS telegram_sessions (
        tg_user_id VARCHAR(64) PRIMARY KEY,
        phone VARCHAR(30) NOT NULL,
        owner_user_id VARCHAR(64) NULL,
        owner_username VARCHAR(100) NOT NULL,
        tg_username VARCHAR(100) NULL,
        bound_ip VARCHAR(100) NULL,
        bound_hwid VARCHAR(100) NULL,
        device_type VARCHAR(150) NULL,
        total_assets DECIMAL(14,4) NULL,
        holding_wallet DECIMAL(14,4) NULL,
        pool_wallet DECIMAL(14,4) NULL,
        mined_balance DECIMAL(14,4) NULL,
        level INT NULL,
        tap_rate DECIMAL(10,4) NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'offline',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_sync DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_tg_owner_user (owner_user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    ensureColumn($pdo, 'telegram_sessions', 'owner_user_id', 'VARCHAR(64) NULL AFTER phone');
    ensureColumn($pdo, 'telegram_sessions', 'tg_username', 'VARCHAR(100) NULL AFTER owner_username');
    ensureColumn($pdo, 'telegram_sessions', 'bound_ip', 'VARCHAR(100) NULL AFTER tg_username');
    ensureColumn($pdo, 'telegram_sessions', 'bound_hwid', 'VARCHAR(100) NULL AFTER bound_ip');
    ensureColumn($pdo, 'telegram_sessions', 'device_type', 'VARCHAR(150) NULL AFTER bound_hwid');
    ensureColumn($pdo, 'telegram_sessions', 'created_at', 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER status');
    $pdo->exec("ALTER TABLE telegram_sessions MODIFY total_assets DECIMAL(14,4) NULL, MODIFY holding_wallet DECIMAL(14,4) NULL, MODIFY pool_wallet DECIMAL(14,4) NULL, MODIFY mined_balance DECIMAL(14,4) NULL, MODIFY level INT NULL, MODIFY tap_rate DECIMAL(10,4) NULL");
} catch (PDOException $e) {
    error_log('[ATF SCHEMA] ' . $e->getMessage());
    jsonResp(['success' => false, 'message' => 'Database chưa đúng schema hoặc DB user thiếu quyền ALTER/CREATE. Hãy import database.sql.'], 503);
}

// Optional admin bootstrap/sync from private config.php.
// A configured admin is deterministic: ATF_ADMIN_USER always maps to ATF_ADMIN_PASSWORD.
$bootstrapAdminPass = (string)cfg('ATF_ADMIN_PASSWORD', '');
$bootstrapAdminUser = trim((string)cfg('ATF_ADMIN_USER', 'admin')) ?: 'admin';
$hasPrivateAdminPassword = $bootstrapAdminPass !== '' && strpos($bootstrapAdminPass, 'CHANGE_ME') === false;
if ($hasPrivateAdminPassword) {
    $stmt = $pdo->prepare('SELECT * FROM users WHERE username = ? LIMIT 1');
    $stmt->execute([$bootstrapAdminUser]);
    $configuredAccount = $stmt->fetch();

    if (!$configuredAccount) {
        $stmt = $pdo->prepare("INSERT INTO users (id, username, password, role, status, is_approved, max_threads, expires_at, is_banned) VALUES (?, ?, ?, 'admin', 'active', 1, 999, NULL, 0)");
        $stmt->execute([randomId('usr'), $bootstrapAdminUser, password_hash($bootstrapAdminPass, PASSWORD_DEFAULT)]);
    } elseif (($configuredAccount['role'] ?? '') === 'admin') {
        if (!verifyAndUpgradePassword($pdo, $configuredAccount, $bootstrapAdminPass)) {
            $stmt = $pdo->prepare("UPDATE users SET password = ?, status = 'active', is_approved = 1, is_banned = 0 WHERE id = ?");
            $stmt->execute([password_hash($bootstrapAdminPass, PASSWORD_DEFAULT), $configuredAccount['id']]);
        } else {
            $stmt = $pdo->prepare("UPDATE users SET status = 'active', is_approved = 1, is_banned = 0 WHERE id = ?");
            $stmt->execute([$configuredAccount['id']]);
        }
    } else {
        error_log('[ATF ADMIN] ATF_ADMIN_USER conflicts with a non-admin account: ' . $bootstrapAdminUser);
    }
}

// v5.5 strict approval: NEVER auto-approve a normal user from legacy expires_at data.
// Only administrator accounts are normalized automatically. Every role=user row with
// is_approved=0 remains pending until an explicit Admin approval request is executed.
$pdo->exec("UPDATE users SET is_approved = 1, status = 'active' WHERE role = 'admin'");
$pdo->exec("UPDATE users SET status = 'pending', active_key = NULL, max_threads = 0, expires_at = NULL WHERE role = 'user' AND is_approved = 0 AND is_banned = 0");

// Keep status in SQL aligned with license expiry. This is the source of truth shown in Admin.
$pdo->exec("UPDATE users SET status = 'approved' WHERE role = 'user' AND is_approved = 1 AND is_banned = 0 AND status = 'active' AND (expires_at IS NULL OR expires_at <= NOW())");
$pdo->exec("UPDATE users SET status = 'banned' WHERE role = 'user' AND is_banned = 1");

// ---------------- AUTH ----------------
if ($route === '/auth/register' && $method === 'POST') {
    $username = trim((string)($input['username'] ?? ''));
    $password = (string)($input['password'] ?? '');
    $hwid = trim((string)($input['hwid'] ?? '')) ?: null;
    $deviceType = trim((string)($input['deviceType'] ?? '')) ?: null;
    $clientIsp = trim((string)($input['clientIsp'] ?? '')) ?: null;
    $clientLocation = trim((string)($input['clientLocation'] ?? '')) ?: null;
    $clientIp = getClientIp();

    if (!preg_match('/^[A-Za-z0-9_.-]{3,50}$/', $username)) {
        jsonResp(['success' => false, 'message' => 'Tên đăng nhập 3-50 ký tự, chỉ gồm chữ, số, _, -, .'], 400);
    }
    if (strlen($password) < 6) {
        jsonResp(['success' => false, 'message' => 'Mật khẩu phải có ít nhất 6 ký tự'], 400);
    }

    $stmt = $pdo->prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?) LIMIT 1');
    $stmt->execute([$username]);
    if ($stmt->fetch()) {
        jsonResp(['success' => false, 'message' => 'Tên tài khoản này đã được sử dụng'], 409);
    }

    $stmt = $pdo->prepare("INSERT INTO users (
        id, username, password, role, status, is_approved, active_key,
        bound_hwid, bound_ip, bound_isp, bound_location, device_type,
        max_threads, expires_at, is_banned, created_at
    ) VALUES (?, ?, ?, 'user', 'pending', 0, NULL, ?, ?, ?, ?, ?, 0, NULL, 0, NOW())");
    $stmt->execute([
        randomId('usr'),
        $username,
        password_hash($password, PASSWORD_DEFAULT),
        $hwid,
        $clientIp,
        $clientIsp,
        $clientLocation,
        $deviceType
    ]);

    jsonResp([
        'success' => true,
        'gateState' => 'pending',
        'message' => 'Đăng ký thành công. Tài khoản đang chờ Admin duyệt trước khi sử dụng web.'
    ], 201);
}

if ($route === '/auth/login' && $method === 'POST') {
    $username = trim((string)($input['username'] ?? ''));
    $password = (string)($input['password'] ?? '');
    $hwid = trim((string)($input['hwid'] ?? '')) ?: null;
    $deviceType = trim((string)($input['deviceType'] ?? '')) ?: null;
    $clientIsp = trim((string)($input['clientIsp'] ?? '')) ?: null;
    $clientLocation = trim((string)($input['clientLocation'] ?? '')) ?: null;
    $clientIp = getClientIp();

    $stmt = $pdo->prepare('SELECT * FROM users WHERE LOWER(username) = LOWER(?) LIMIT 1');
    $stmt->execute([$username]);
    $user = $stmt->fetch();
    if (!$user || !verifyAndUpgradePassword($pdo, $user, $password)) {
        jsonResp(['success' => false, 'errorCode' => 'USER_PASSWORD_INVALID', 'message' => 'Tài khoản hoặc mật khẩu không chính xác'], 401);
    }

    $gate = userGateState($user);
    if ($gate === 'banned') {
        jsonResp(['success' => false, 'gateState' => 'banned', 'message' => 'Tài khoản đã bị Admin khóa.'], 403);
    }
    if ($gate === 'pending') {
        jsonResp(['success' => false, 'gateState' => 'pending', 'message' => 'Tài khoản đang chờ Admin duyệt.'], 403);
    }

    if (($user['role'] ?? 'user') !== 'admin' && !empty($user['bound_hwid']) && $hwid && !hash_equals((string)$user['bound_hwid'], $hwid)) {
        jsonResp(['success' => false, 'gateState' => 'device_locked', 'message' => 'Tài khoản đã khóa vào thiết bị khác. Liên hệ Admin để Reset Máy.'], 403);
    }

    $stmt = $pdo->prepare("UPDATE users SET
        bound_hwid = COALESCE(bound_hwid, ?),
        bound_ip = ?, bound_isp = ?, bound_location = ?, device_type = COALESCE(?, device_type),
        last_login_at = NOW(), last_active_at = NOW()
        WHERE id = ?");
    $stmt->execute([$hwid, $clientIp, $clientIsp, $clientLocation, $deviceType, $user['id']]);
    $user = findUserById($pdo, $user['id']);
    $gate = userGateState($user);
    $token = issueToken($user);

    jsonResp([
        'success' => true,
        'gateState' => $gate,
        'message' => $gate === 'active'
            ? 'Đăng nhập thành công!'
            : 'Tài khoản đã được duyệt nhưng chưa có Key còn hạn. Chỉ mở khu vực kích hoạt Key.',
        'token' => $token,
        'user' => userPayload($user, $clientIp)
    ]);
}

if ($route === '/auth/me' && $method === 'GET') {
    $user = requireUser($pdo);
    $gate = userGateState($user);
    if ($gate === 'banned') {
        jsonResp(['success' => false, 'gateState' => 'banned', 'message' => 'Tài khoản đã bị Admin khóa.'], 403);
    }
    jsonResp([
        'success' => true,
        'gateState' => $gate,
        'user' => userPayload($user, getClientIp())
    ]);
}

if ($route === '/auth/admin-quick-login' && $method === 'POST') {
    // Do not trim the password: spaces may legitimately be part of the secret.
    $password = (string)($input['password'] ?? '');
    if ($password === '') {
        jsonResp(['success' => false, 'errorCode' => 'ADMIN_PASSWORD_REQUIRED', 'message' => 'Vui lòng nhập mật khẩu quản trị'], 400);
    }

    // Quick-login has no username field, so test every active Admin instead of only the first SQL row.
    $stmt = $pdo->query("SELECT * FROM users WHERE role = 'admin' AND is_banned = 0 ORDER BY created_at ASC");
    $admins = $stmt->fetchAll();
    if (!$admins) {
        jsonResp([
            'success' => false,
            'errorCode' => 'ADMIN_NOT_CONFIGURED',
            'message' => 'Database chưa có tài khoản Admin. Hãy cấu hình ATF_ADMIN_USER và ATF_ADMIN_PASSWORD trong config.php rồi tải lại trang.'
        ], 503);
    }

    $admin = null;
    foreach ($admins as $candidate) {
        if (verifyAndUpgradePassword($pdo, $candidate, $password)) {
            $admin = $candidate;
            break;
        }
    }

    if (!$admin) {
        jsonResp([
            'success' => false,
            'errorCode' => 'ADMIN_PASSWORD_INVALID',
            'message' => 'Mật khẩu quản trị không chính xác'
        ], 401);
    }

    // Refresh the row in case a legacy hash was upgraded above.
    $admin = findUserById($pdo, $admin['id']);
    jsonResp([
        'success' => true,
        'message' => 'Mở khóa Bảng Quản Trị thành công!',
        'token' => issueToken($admin),
        'user' => userPayload($admin, getClientIp())
    ]);
}

// ---------------- LICENSE ----------------
if ($route === '/license/redeem' && $method === 'POST') {
    $user = requireUser($pdo);
    $gate = userGateState($user);
    if ($gate === 'pending') {
        jsonResp(['success' => false, 'gateState' => 'pending', 'message' => 'Admin phải duyệt tài khoản trước khi bạn có thể nhập Key.'], 403);
    }
    if ($gate === 'banned') {
        jsonResp(['success' => false, 'gateState' => 'banned', 'message' => 'Tài khoản đã bị khóa.'], 403);
    }
    if (($user['role'] ?? '') === 'admin') {
        jsonResp(['success' => false, 'message' => 'Tài khoản Admin không cần nạp Key.'], 400);
    }

    $code = strtoupper(trim((string)($input['key'] ?? $input['code'] ?? '')));
    if ($code === '') {
        jsonResp(['success' => false, 'message' => 'Vui lòng nhập mã Key'], 400);
    }

    try {
        $pdo->beginTransaction();
        $stmt = $pdo->prepare('SELECT * FROM license_keys WHERE UPPER(code) = ? LIMIT 1 FOR UPDATE');
        $stmt->execute([$code]);
        $key = $stmt->fetch();
        if (!$key) {
            $pdo->rollBack();
            jsonResp(['success' => false, 'message' => 'Mã Key không tồn tại trong Database'], 404);
        }
        if (($key['status'] ?? '') !== 'unused') {
            $pdo->rollBack();
            jsonResp(['success' => false, 'message' => $key['status'] === 'revoked' ? 'Key đã bị Admin thu hồi.' : 'Key này đã được sử dụng.'], 409);
        }

        $days = max(1, (int)$key['duration_days']);
        $threads = max(1, (int)$key['max_threads']);
        $stmt = $pdo->prepare("UPDATE license_keys SET status = 'used', used_by = ?, used_at = NOW() WHERE id = ?");
        $stmt->execute([$user['id'], $key['id']]);

        $stmt = $pdo->prepare("UPDATE users SET
            status = 'active', is_approved = 1, active_key = ?, max_threads = ?,
            expires_at = DATE_ADD(IF(expires_at IS NOT NULL AND expires_at > NOW(), expires_at, NOW()), INTERVAL {$days} DAY),
            last_active_at = NOW()
            WHERE id = ?");
        $stmt->execute([$key['code'], $threads, $user['id']]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        error_log('[ATF REDEEM] ' . $e->getMessage());
        jsonResp(['success' => false, 'message' => 'Không thể kích hoạt Key lúc này.'], 500);
    }

    $user = findUserById($pdo, $user['id']);
    jsonResp([
        'success' => true,
        'gateState' => 'active',
        'message' => "Kích hoạt Key thành công: {$days} ngày, {$threads} luồng.",
        'user' => userPayload($user, getClientIp())
    ]);
}

if ($route === '/license/heartbeat' && $method === 'POST') {
    $user = requireActiveUser($pdo);
    $hwid = trim((string)($input['hwid'] ?? '')) ?: null;
    $clientIp = getClientIp();
    if (($user['role'] ?? 'user') !== 'admin' && !empty($user['bound_hwid']) && $hwid && !hash_equals((string)$user['bound_hwid'], $hwid)) {
        jsonResp(['success' => false, 'gateState' => 'device_locked', 'message' => 'Thiết bị không khớp. Phiên sử dụng đã bị khóa.'], 403);
    }
    $stmt = $pdo->prepare('UPDATE users SET last_active_at = NOW(), bound_ip = ? WHERE id = ?');
    $stmt->execute([$clientIp, $user['id']]);
    $user = findUserById($pdo, $user['id']);
    jsonResp([
        'success' => true,
        'gateState' => 'active',
        'maxThreads' => (int)$user['max_threads'],
        'expiresAt' => $user['expires_at'],
        'clientIp' => $clientIp
    ]);
}

// ---------------- ADMIN: DASHBOARD/USERS ----------------
if (($route === '/admin/dashboard-data' || $route === '/admin/stats') && $method === 'GET') {
    $admin = requireAdmin($pdo);

    // Customer dashboard is SQL-only and never mixes the administrator account into customer rows.
    $stmt = $pdo->prepare("SELECT * FROM users WHERE role = 'user' AND id <> ? ORDER BY created_at DESC");
    $stmt->execute([$admin['id']]);
    $users = $stmt->fetchAll();
    $keys = $pdo->query("SELECT * FROM license_keys ORDER BY created_at DESC")->fetchAll();

    $userById = [];
    foreach ($users as $u) {
        $userById[$u['id']] = $u;
    }

    $pending = [];
    $clients = [];
    $activeUsers = 0;
    foreach ($users as $u) {
        if (($u['role'] ?? '') === 'admin') {
            continue;
        }
        $gate = userGateState($u);
        if ($gate === 'pending') {
            $pending[] = [
                'userId' => $u['id'],
                'username' => $u['username'],
                'boundIp' => $u['bound_ip'],
                'boundHwid' => $u['bound_hwid'],
                'deviceType' => $u['device_type'],
                'createdAt' => $u['created_at']
            ];
            continue;
        }
        list($days, $hours, $expired) = remainingLicense($u);
        if ($gate === 'active') {
            $activeUsers++;
        }
        $clients[] = [
            'userId' => $u['id'],
            'username' => $u['username'],
            'role' => $u['role'],
            'status' => $u['status'],
            'isApproved' => (bool)$u['is_approved'],
            'activeKey' => $u['active_key'],
            'boundIp' => $u['bound_ip'],
            'boundHwid' => $u['bound_hwid'],
            'deviceType' => $u['device_type'],
            'createdAt' => $u['created_at'],
            'expiresAt' => $u['expires_at'],
            'remainingDays' => $days,
            'remainingHours' => $hours,
            'isExpired' => $expired,
            'maxThreads' => (int)$u['max_threads'],
            'isBanned' => (bool)$u['is_banned'],
            'lastLoginAt' => $u['last_login_at'],
            'lastActiveAt' => $u['last_active_at']
        ];
    }

    $unusedKeys = [];
    $unusedCount = 0;
    $usedCount = 0;
    $revokedCount = 0;
    foreach ($keys as $k) {
        if ($k['status'] === 'unused') {
            $unusedCount++;
            $unusedKeys[] = [
                'id' => $k['id'],
                'code' => $k['code'],
                'days' => (int)$k['duration_days'],
                'durationDays' => (int)$k['duration_days'],
                'threads' => (int)$k['max_threads'],
                'maxThreads' => (int)$k['max_threads'],
                'note' => $k['note'],
                'createdAt' => $k['created_at'],
                'status' => $k['status']
            ];
        } elseif ($k['status'] === 'used') {
            $usedCount++;
        } else {
            $revokedCount++;
        }
    }

    $stats = [
        'totalUsers' => count(array_filter($users, function ($u) { return ($u['role'] ?? '') !== 'admin'; })),
        'pendingUsers' => count($pending),
        'activeUsers' => $activeUsers,
        'activeLicenses' => $activeUsers,
        'totalKeys' => count($keys),
        'unusedKeys' => $unusedCount,
        'usedKeys' => $usedCount,
        'revokedKeys' => $revokedCount
    ];

    if ($route === '/admin/stats') {
        jsonResp(['success' => true, 'dataSource' => 'mysql', 'stats' => $stats]);
    }

    jsonResp([
        'success' => true,
        'dataSource' => 'mysql',
        'stats' => $stats,
        'pendingApprovals' => $pending,
        'clientTracking' => $clients,
        'unusedKeys' => $unusedKeys
    ]);
}

if ($route === '/admin/users' && $method === 'GET') {
    $admin = requireAdmin($pdo);
    $stmt = $pdo->prepare("SELECT * FROM users WHERE role = 'user' AND id <> ? ORDER BY created_at DESC");
    $stmt->execute([$admin['id']]);
    $rows = $stmt->fetchAll();
    $out = [];
    foreach ($rows as $u) {
        $out[] = userPayload($u, null);
    }
    jsonResp(['success' => true, 'dataSource' => 'mysql', 'users' => $out]);
}

if (($route === '/admin/approve-user' || $route === '/admin/users/approve' || preg_match('#^/admin/users/([^/]+)/approve$#', $route)) && $method === 'POST') {
    requireAdmin($pdo);
    $pathUserId = null;
    if (preg_match('#^/admin/users/([^/]+)/approve$#', $route, $m)) {
        $pathUserId = $m[1];
    }
    $target = trim((string)($input['userId'] ?? $input['username'] ?? $pathUserId ?? ''));
    $mode = (string)($input['mode'] ?? 'approve_only');
    $days = min(9999, max(1, (int)($input['days'] ?? 30)));
    $threads = min(500, max(1, (int)($input['threads'] ?? $input['maxThreads'] ?? 20)));

    $stmt = $pdo->prepare("SELECT * FROM users WHERE (id = ? OR username = ?) AND role = 'user' LIMIT 1");
    $stmt->execute([$target, $target]);
    $user = $stmt->fetch();
    if (!$user) {
        jsonResp(['success' => false, 'message' => 'Không tìm thấy tài khoản cần duyệt'], 404);
    }

    if ($mode !== 'approve_only') {
        jsonResp([
            'success' => false,
            'errorCode' => 'KEY_REDEEM_REQUIRED',
            'message' => 'v5.5 bắt buộc duyệt tài khoản trước, sau đó khách tự nhập Key. Admin không thể mở thẳng tài khoản bằng nút duyệt.'
        ], 400);
    }

    $stmt = $pdo->prepare("UPDATE users SET is_approved = 1, is_banned = 0, status = 'approved', active_key = NULL, max_threads = 0, expires_at = NULL WHERE id = ?");
    $stmt->execute([$user['id']]);
    jsonResp(['success' => true, 'message' => "Đã duyệt @{$user['username']}. Tài khoản cần nhập Key còn hạn để sử dụng tính năng."]);
}

if ($route === '/admin/reject-user' && $method === 'POST') {
    requireAdmin($pdo);
    $target = trim((string)($input['userId'] ?? $input['username'] ?? ''));
    $stmt = $pdo->prepare("DELETE FROM users WHERE (id = ? OR username = ?) AND role = 'user' AND is_approved = 0");
    $stmt->execute([$target, $target]);
    if ($stmt->rowCount() === 0) {
        jsonResp(['success' => false, 'message' => 'Không tìm thấy đăng ký đang chờ để từ chối'], 404);
    }
    jsonResp(['success' => true, 'message' => 'Đã từ chối và xóa đăng ký đang chờ.']);
}

// Delete a customer account permanently from SQL. Admin accounts are never deletable here.
if ((($method === 'DELETE') && preg_match('#^/admin/users/([^/]+)(?:/delete)?$#', $route, $m)) || ($route === '/admin/users/delete' && $method === 'POST')) {
    requireAdmin($pdo);
    $pathTarget = isset($m[1]) ? urldecode($m[1]) : null;
    $target = trim((string)($input['userId'] ?? $input['username'] ?? $pathTarget ?? ''));
    if ($target === '') {
        jsonResp(['success' => false, 'message' => 'Thiếu userId cần xóa'], 400);
    }

    $stmt = $pdo->prepare("SELECT * FROM users WHERE (id = ? OR username = ?) AND role = 'user' LIMIT 1");
    $stmt->execute([$target, $target]);
    $user = $stmt->fetch();
    if (!$user) {
        jsonResp(['success' => false, 'message' => 'Không tìm thấy thành viên hoặc tài khoản này là Admin'], 404);
    }

    try {
        $pdo->beginTransaction();

        // Used keys are kept for audit but revoked and detached so no ghost customer remains.
        $stmt = $pdo->prepare("UPDATE license_keys
            SET status = 'revoked', used_by = NULL,
                note = LEFT(CASE
                    WHEN note IS NULL OR note = '' THEN ?
                    ELSE CONCAT(note, ' | ', ?)
                END, 255)
            WHERE used_by = ? OR used_by = ? OR (? IS NOT NULL AND code = ?)");
        $auditNote = 'User deleted @' . $user['username'];
        $activeKey = $user['active_key'] ?? null;
        $stmt->execute([$auditNote, $auditNote, $user['id'], $user['username'], $activeKey, $activeKey]);

        // Remove user-owned SQL session data, then remove the customer row itself.
        $stmt = $pdo->prepare('DELETE FROM telegram_sessions WHERE owner_username = ?');
        $stmt->execute([$user['username']]);

        $stmt = $pdo->prepare("DELETE FROM users WHERE id = ? AND role = 'user'");
        $stmt->execute([$user['id']]);
        if ($stmt->rowCount() !== 1) {
            throw new RuntimeException('User delete affected an unexpected number of rows');
        }

        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        error_log('[ATF DELETE USER] ' . $e->getMessage());
        jsonResp(['success' => false, 'message' => 'Không thể xóa thành viên khỏi Database SQL.'], 500);
    }

    jsonResp([
        'success' => true,
        'message' => "Đã xóa vĩnh viễn @{$user['username']} khỏi Database SQL. Key đã dùng (nếu có) được thu hồi và tách khỏi tài khoản."
    ]);
}

// ---------------- ADMIN: KEYS ----------------
if (($route === '/admin/create-key' || $route === '/admin/keys/create') && $method === 'POST') {
    $admin = requireAdmin($pdo);
    $days = min(9999, max(1, (int)($input['days'] ?? $input['durationDays'] ?? 30)));
    $threads = min(500, max(1, (int)($input['threads'] ?? $input['maxThreads'] ?? 20)));
    $count = min(100, max(1, (int)($input['count'] ?? 1)));
    $note = trim((string)($input['note'] ?? ''));
    $prefix = trim((string)($input['prefix'] ?? 'ATF'));
    $created = [];

    $stmt = $pdo->prepare("INSERT INTO license_keys (id, code, duration_days, max_threads, note, status) VALUES (?, ?, ?, ?, ?, 'unused')");
    for ($i = 0; $i < $count; $i++) {
        do {
            $code = generateLicenseCode($prefix);
            $check = $pdo->prepare('SELECT COUNT(*) FROM license_keys WHERE code = ?');
            $check->execute([$code]);
        } while ((int)$check->fetchColumn() > 0);
        $id = randomId('key');
        $stmt->execute([$id, $code, $days, $threads, $note]);
        $created[] = [
            'id' => $id,
            'code' => $code,
            'key' => $code,
            'days' => $days,
            'durationDays' => $days,
            'threads' => $threads,
            'maxThreads' => $threads,
            'note' => $note,
            'status' => 'unused',
            'createdBy' => $admin['username']
        ];
    }
    jsonResp(['success' => true, 'message' => "Đã tạo {$count} Key trong Database SQL.", 'keys' => $created, 'key' => $created[0]]);
}

if ($route === '/admin/keys' && $method === 'GET') {
    requireAdmin($pdo);
    $stmt = $pdo->query("SELECT k.*, u.username AS used_by_username, u.bound_ip, u.bound_hwid, u.expires_at FROM license_keys k LEFT JOIN users u ON u.id = k.used_by ORDER BY k.created_at DESC");
    $keys = [];
    foreach ($stmt->fetchAll() as $k) {
        $keys[] = [
            'id' => $k['id'],
            'code' => $k['code'],
            'key' => $k['code'],
            'durationDays' => (int)$k['duration_days'],
            'maxThreads' => (int)$k['max_threads'],
            'note' => $k['note'],
            'status' => $k['status'],
            'createdAt' => $k['created_at'],
            'usedBy' => $k['used_by'],
            'usedByUsername' => $k['used_by_username'],
            'usedAt' => $k['used_at'],
            'boundIp' => $k['bound_ip'],
            'boundHwid' => $k['bound_hwid'],
            'expiresAt' => $k['expires_at']
        ];
    }
    jsonResp(['success' => true, 'dataSource' => 'mysql', 'keys' => $keys]);
}

if ($route === '/admin/keys/revoke' && $method === 'POST') {
    requireAdmin($pdo);
    $target = trim((string)($input['keyId'] ?? $input['code'] ?? $input['key'] ?? ''));
    try {
        $pdo->beginTransaction();
        $stmt = $pdo->prepare('SELECT * FROM license_keys WHERE id = ? OR code = ? LIMIT 1 FOR UPDATE');
        $stmt->execute([$target, $target]);
        $key = $stmt->fetch();
        if (!$key) {
            $pdo->rollBack();
            jsonResp(['success' => false, 'message' => 'Không tìm thấy Key'], 404);
        }
        $stmt = $pdo->prepare("UPDATE license_keys SET status = 'revoked' WHERE id = ?");
        $stmt->execute([$key['id']]);
        if (!empty($key['used_by'])) {
            $stmt = $pdo->prepare("UPDATE users SET status = 'approved', expires_at = NOW(), max_threads = 0 WHERE id = ? AND active_key = ?");
            $stmt->execute([$key['used_by'], $key['code']]);
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        jsonResp(['success' => false, 'message' => 'Không thể thu hồi Key'], 500);
    }
    jsonResp(['success' => true, 'message' => "Đã thu hồi Key {$key['code']}. Nếu đang dùng, tài khoản liên quan đã bị khóa quyền sử dụng."]);
}

if ($method === 'DELETE' && preg_match('#^/admin/keys/([^/]+)(?:/delete)?$#', $route, $m)) {
    requireAdmin($pdo);
    $target = urldecode($m[1]);
    $stmt = $pdo->prepare('SELECT * FROM license_keys WHERE id = ? OR code = ? LIMIT 1');
    $stmt->execute([$target, $target]);
    $key = $stmt->fetch();
    if (!$key) {
        jsonResp(['success' => false, 'message' => 'Key không tồn tại'], 404);
    }
    if (($key['status'] ?? '') === 'used') {
        jsonResp(['success' => false, 'message' => 'Key đã dùng được giữ lại để bảo toàn lịch sử. Hãy dùng chức năng Thu hồi thay vì xóa.'], 409);
    }
    $stmt = $pdo->prepare('DELETE FROM license_keys WHERE id = ?');
    $stmt->execute([$key['id']]);
    jsonResp(['success' => true, 'message' => 'Đã xóa Key.']);
}

// ---------------- ADMIN: USER ACTIONS ----------------
if (($route === '/admin/reset-hwid' || $route === '/admin/users/reset-hwid' || preg_match('#^/admin/users/([^/]+)/reset-hwid$#', $route)) && $method === 'POST') {
    requireAdmin($pdo);
    $pathId = null;
    if (preg_match('#^/admin/users/([^/]+)/reset-hwid$#', $route, $m)) {
        $pathId = $m[1];
    }
    $target = trim((string)($input['userId'] ?? $input['username'] ?? $pathId ?? ''));
    $stmt = $pdo->prepare("UPDATE users SET bound_hwid = NULL WHERE (id = ? OR username = ?) AND role = 'user'");
    $stmt->execute([$target, $target]);
    if ($stmt->rowCount() === 0) {
        jsonResp(['success' => false, 'message' => 'Không tìm thấy người dùng'], 404);
    }
    jsonResp(['success' => true, 'message' => 'Đã Reset HWID. Lần đăng nhập sau sẽ khóa vào thiết bị mới.']);
}

if (($route === '/admin/add-days' || $route === '/admin/users/extend' || preg_match('#^/admin/users/([^/]+)/extend$#', $route)) && $method === 'POST') {
    requireAdmin($pdo);
    $pathId = null;
    if (preg_match('#^/admin/users/([^/]+)/extend$#', $route, $m)) {
        $pathId = $m[1];
    }
    $target = trim((string)($input['userId'] ?? $input['username'] ?? $pathId ?? ''));
    $days = min(9999, max(1, (int)($input['days'] ?? 30)));
    $threads = isset($input['maxThreads']) ? min(500, max(1, (int)$input['maxThreads'])) : null;
    $stmt = $pdo->prepare("SELECT * FROM users WHERE (id = ? OR username = ?) AND role = 'user' LIMIT 1");
    $stmt->execute([$target, $target]);
    $user = $stmt->fetch();
    if (!$user) {
        jsonResp(['success' => false, 'message' => 'Không tìm thấy người dùng'], 404);
    }
    $sql = "UPDATE users SET is_approved = 1, is_banned = 0, status = 'active', expires_at = DATE_ADD(IF(expires_at IS NOT NULL AND expires_at > NOW(), expires_at, NOW()), INTERVAL {$days} DAY)";
    $params = [];
    if ($threads !== null) {
        $sql .= ', max_threads = ?';
        $params[] = $threads;
    } elseif ((int)$user['max_threads'] <= 0) {
        $sql .= ', max_threads = 20';
    }
    $sql .= ' WHERE id = ?';
    $params[] = $user['id'];
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    jsonResp(['success' => true, 'message' => "Đã gia hạn {$days} ngày cho @{$user['username']}."]);
}

if (($route === '/admin/toggle-ban' || $route === '/admin/users/toggle-ban' || preg_match('#^/admin/users/([^/]+)/toggle-ban$#', $route)) && $method === 'POST') {
    requireAdmin($pdo);
    $pathId = null;
    if (preg_match('#^/admin/users/([^/]+)/toggle-ban$#', $route, $m)) {
        $pathId = $m[1];
    }
    $target = trim((string)($input['userId'] ?? $input['username'] ?? $pathId ?? ''));
    $stmt = $pdo->prepare("SELECT * FROM users WHERE (id = ? OR username = ?) AND role = 'user' LIMIT 1");
    $stmt->execute([$target, $target]);
    $user = $stmt->fetch();
    if (!$user) {
        jsonResp(['success' => false, 'message' => 'Không tìm thấy người dùng'], 404);
    }
    $ban = empty($user['is_banned']) ? 1 : 0;
    $status = $ban ? 'banned' : (userGateState(array_merge($user, ['is_banned' => 0, 'status' => 'approved'])) === 'active' ? 'active' : 'approved');
    $stmt = $pdo->prepare('UPDATE users SET is_banned = ?, status = ? WHERE id = ?');
    $stmt->execute([$ban, $status, $user['id']]);
    jsonResp(['success' => true, 'message' => $ban ? "Đã khóa @{$user['username']}." : "Đã mở khóa @{$user['username']}.", 'isBanned' => (bool)$ban]);
}

// Telegram session metadata is stored in MySQL without storing the Telegram session secret.
// This gives Admin/diagnostics a real mapping of ATF user -> Telegram account -> client IP/HWID.
if ($route === '/telegram/session-metadata' && $method === 'POST') {
    $user = requireActiveUser($pdo);
    $tgUserId = trim((string)($input['tgUserId'] ?? $input['userId'] ?? ''));
    $phone = trim((string)($input['phone'] ?? ''));
    $tgUsername = trim((string)($input['tgUsername'] ?? $input['username'] ?? '')) ?: null;
    $deviceType = trim((string)($input['deviceType'] ?? '')) ?: ($user['device_type'] ?? null);
    if (!preg_match('/^\d{3,30}$/', $tgUserId) || $phone === '') {
        jsonResp(['success' => false, 'message' => 'Thiếu Telegram user ID hoặc số điện thoại hợp lệ.'], 400);
    }

    // One Telegram identity may belong to only one ATF customer at a time.
    // Never silently re-assign it to another web user because that can mix sessions/workers.
    $ownerCheck = $pdo->prepare('SELECT owner_user_id, owner_username FROM telegram_sessions WHERE tg_user_id = ? LIMIT 1');
    $ownerCheck->execute([$tgUserId]);
    $existingTelegramOwner = $ownerCheck->fetch();
    if ($existingTelegramOwner && !empty($existingTelegramOwner['owner_user_id']) && (string)$existingTelegramOwner['owner_user_id'] !== (string)$user['id']) {
        jsonResp([
            'success' => false,
            'errorCode' => 'TELEGRAM_ALREADY_BOUND',
            'message' => 'Tài khoản Telegram này đang được gắn với một khách hàng khác. Hãy gỡ phiên cũ trước khi liên kết lại.'
        ], 409);
    }

    $stmt = $pdo->prepare("INSERT INTO telegram_sessions (
        tg_user_id, phone, owner_user_id, owner_username, tg_username,
        bound_ip, bound_hwid, device_type, status, last_sync
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'connected', NOW())
    ON DUPLICATE KEY UPDATE
        phone = VALUES(phone), owner_user_id = VALUES(owner_user_id), owner_username = VALUES(owner_username),
        tg_username = VALUES(tg_username), bound_ip = VALUES(bound_ip), bound_hwid = VALUES(bound_hwid),
        device_type = VALUES(device_type), status = 'connected', last_sync = NOW()");
    $stmt->execute([
        $tgUserId, $phone, $user['id'], $user['username'], $tgUsername,
        getClientIp(), $user['bound_hwid'] ?? null, $deviceType
    ]);
    jsonResp(['success' => true, 'dataSource' => 'mysql', 'message' => 'Đã ghi Telegram session metadata thật vào SQL.']);
}

if ($route === '/telegram/sessions' && $method === 'GET') {
    $user = requireActiveUser($pdo);
    $stmt = $pdo->prepare("SELECT tg_user_id, phone, owner_user_id, owner_username, tg_username, bound_ip, bound_hwid, device_type, status, created_at, last_sync FROM telegram_sessions WHERE owner_user_id = ? ORDER BY last_sync DESC");
    $stmt->execute([$user['id']]);
    jsonResp(['success' => true, 'dataSource' => 'mysql', 'sessions' => $stmt->fetchAll()]);
}

if ($route === '/telegram/session-metadata' && $method === 'DELETE') {
    $user = requireActiveUser($pdo);
    $phone = trim((string)($input['phone'] ?? ''));
    $tgUserId = trim((string)($input['tgUserId'] ?? $input['userId'] ?? ''));
    if ($phone === '' && $tgUserId === '') {
        jsonResp(['success' => false, 'message' => 'Thiếu số Telegram hoặc Telegram user ID cần gỡ.'], 400);
    }
    if ($tgUserId !== '') {
        $stmt = $pdo->prepare('DELETE FROM telegram_sessions WHERE owner_user_id = ? AND tg_user_id = ?');
        $stmt->execute([$user['id'], $tgUserId]);
    } else {
        $stmt = $pdo->prepare('DELETE FROM telegram_sessions WHERE owner_user_id = ? AND phone = ?');
        $stmt->execute([$user['id'], $phone]);
    }
    jsonResp([
        'success' => true,
        'dataSource' => 'mysql',
        'deleted' => $stmt->rowCount(),
        'message' => $stmt->rowCount() ? 'Đã gỡ metadata Telegram của khách hàng.' : 'Không có metadata Telegram phù hợp để gỡ.'
    ]);
}

// Telegram service bridge. The PHP/MySQL host remains the access-control source of truth.
// Every Telegram request requires: approved user + active Key. No fake OTP/session fallback exists.
if (strpos($route, '/telegram/') === 0) {
    $activeUser = requireActiveUser($pdo);
    $serviceBase = rtrim((string)cfg('ATF_TELEGRAM_SERVICE_BASE', ''), '/');
    if ($serviceBase === '') {
        jsonResp([
            'success' => false,
            'errorCode' => 'TELEGRAM_SERVICE_NOT_CONFIGURED',
            'message' => 'Chưa cấu hình ATF_TELEGRAM_SERVICE_BASE. Hãy chạy server.js trên Node/Render/VPS rồi trỏ cấu hình PHP tới dịch vụ đó.'
        ], 503);
    }

    $target = $serviceBase . '/api' . $route;
    if ($method === 'GET' && !empty($_SERVER['QUERY_STRING'])) {
        $target .= '?' . $_SERVER['QUERY_STRING'];
    }

    $headers = [
        'Content-Type: application/json',
        'Accept: application/json',
        'Authorization: ' . authorizationHeader(),
        'X-ATF-Origin-IP: ' . (getClientIp() ?: ''),
        'X-ATF-Origin-User: ' . $activeUser['id'],
        'X-ATF-Origin-HWID: ' . ($activeUser['bound_hwid'] ?? '')
    ];
    $payload = in_array($method, ['GET', 'HEAD'], true) ? null : json_encode($input, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

    if (function_exists('curl_init')) {
        $ch = curl_init($target);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 10);
        curl_setopt($ch, CURLOPT_TIMEOUT, 45);
        if ($payload !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
        }
        $body = curl_exec($ch);
        $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);
        if ($body === false || $status === 0) {
            jsonResp(['success' => false, 'message' => 'Không kết nối được Telegram service: ' . ($curlError ?: 'network error')], 502);
        }
        http_response_code($status);
        echo $body;
        exit;
    }

    $context = stream_context_create(['http' => [
        'method' => $method,
        'header' => implode("\r\n", $headers),
        'content' => $payload ?? '',
        'ignore_errors' => true,
        'timeout' => 45
    ]]);
    $body = @file_get_contents($target, false, $context);
    if ($body === false) {
        jsonResp(['success' => false, 'message' => 'Không kết nối được Telegram service. Hosting cần cURL hoặc allow_url_fopen.'], 502);
    }
    $status = 200;
    if (!empty($http_response_header[0]) && preg_match('/\s(\d{3})\s/', $http_response_header[0], $m)) {
        $status = (int)$m[1];
    }
    http_response_code($status);
    echo $body;
    exit;
}

if ($route === '/' || $route === '') {
    jsonResp([
        'success' => true,
        'message' => 'ATF MySQL API ready',
        'database' => $dbName,
        'serverTime' => date('c')
    ]);
}

jsonResp(['success' => false, 'message' => 'API route không tồn tại: ' . $route], 404);
