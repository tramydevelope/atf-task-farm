-- ATF Task Farm - MySQL Database Schema & Initial Data
-- Database Name: ttfquanlisite_atf
-- User: ttfquanlisite_admin / Pass: Phamlinh@12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+07:00";

-- Table: users
CREATE TABLE IF NOT EXISTS `users` (
  `id` varchar(64) NOT NULL,
  `username` varchar(100) NOT NULL,
  `password` varchar(255) NOT NULL,
  `role` enum('admin','user') DEFAULT 'user',
  `bound_hwid` varchar(100) DEFAULT NULL,
  `bound_ip` varchar(100) DEFAULT NULL,
  `device_type` varchar(100) DEFAULT NULL,
  `max_threads` int(11) DEFAULT 20,
  `expires_at` datetime DEFAULT NULL,
  `is_banned` tinyint(1) DEFAULT 0,
  `created_at` datetime DEFAULT current_timestamp(),
  `last_active_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Table: license_keys
CREATE TABLE IF NOT EXISTS `license_keys` (
  `id` varchar(64) NOT NULL,
  `code` varchar(64) NOT NULL,
  `duration_days` int(11) DEFAULT 30,
  `max_threads` int(11) DEFAULT 20,
  `note` varchar(255) DEFAULT NULL,
  `status` enum('unused','used') DEFAULT 'unused',
  `created_at` datetime DEFAULT current_timestamp(),
  `used_by` varchar(100) DEFAULT NULL,
  `used_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Table: telegram_sessions
CREATE TABLE IF NOT EXISTS `telegram_sessions` (
  `tg_user_id` varchar(64) NOT NULL,
  `phone` varchar(30) NOT NULL,
  `owner_username` varchar(100) NOT NULL,
  `total_assets` decimal(14,4) DEFAULT 47.7963,
  `holding_wallet` decimal(14,4) DEFAULT 0.0000,
  `pool_wallet` decimal(14,4) DEFAULT 47.7963,
  `mined_balance` decimal(14,4) DEFAULT 47.7963,
  `level` int(11) DEFAULT 69,
  `tap_rate` decimal(10,4) DEFAULT 6.8763,
  `status` varchar(50) DEFAULT 'running_247',
  `last_sync` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`tg_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed Admin & Test User
INSERT INTO `users` (`id`, `username`, `password`, `role`, `max_threads`, `expires_at`)
VALUES
('usr_admin', 'admin', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin', 50, DATE_ADD(NOW(), INTERVAL 3650 DAY)),
('usr_linh9988', 'linh9988', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'user', 20, DATE_ADD(NOW(), INTERVAL 30 DAY))
ON DUPLICATE KEY UPDATE `username` = VALUES(`username`);

COMMIT;
