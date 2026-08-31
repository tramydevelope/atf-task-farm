<?php
/**
 * ATF Task Farm - Production Hosting Database & Security Config
 * Host: cPanel ns22.dailysieure.com | Database: ttfquanlisite_atf
 */
return [
    'ATF_DB_HOST' => 'localhost',
    'ATF_DB_PORT' => '3306',
    'ATF_DB_NAME' => 'ttfquanlisite_atf',
    'ATF_DB_USER' => 'ttfquanlisite_admin',
    'ATF_DB_PASS' => 'Phamlinh@12',

    // Secure HMAC-SHA256 Token Secret
    'ATF_APP_KEY' => '489f4b6284df9fd2c041c38c924718274a5e6f7b8c9d0e1f2a3b4c5d6e7f8a9b2341906719',

    // Super Admin Credentials
    'ATF_ADMIN_USER' => 'admin',
    'ATF_ADMIN_PASSWORD' => 'Phamlinh@12',
];
