# ATF TASK FARM AUTO-BOT PLATFORM - FULL SOURCE CODE v5.0

Hệ thống Nền Tảng Tự Động Hóa Cày Coin Telegram Mini-App Độc Quyền (VIP EDITION 2026).

---

## 📁 CẤU TRÚC THƯ MỤC NGUỒN:
- **public/**: Chứa toàn bộ giao diện HTML, CSS, JavaScript của Web App.
  - index.html: Trang Chủ Đăng Ký / Đăng Nhập & Bảng Điều Khiển Cày Coin VIP.
  - quanglinhdev.html: Cổng Quản Trị Viên Super Admin (/quanglinhdev) - Khóa Mật Khẩu, Quét Phần Cứng Thật & Bảng Điều Khiển phpMyAdmin.
  - admin.html: Trang Quản Trị Dự Phòng (/admin).
  - css/style.css: Hệ thống giao diện Dark Modern Glassmorphism VIP.
  - js/fingerprint.js: Bộ Nhận Diện Phần Cứng Thật (Canvas 2D + GPU WebGL + IP Thật + HWID Độc Bản).
  - js/app.js: Core Controller Frontend.
  - js/telegramBotEngine.js: Xử lý mã OTP Telegram và phiên đào Asloni VIP 24/7.
  - js/atfFarmEngine.js: Bộ mô phỏng đào đa luồng Real-Time.
- **api/**: Chứa cổng API Backend PHP kết nối MySQL (api/index.php).
- **data/**: Cơ sở dữ liệu JSON dự phòng (data/database.json).
- **database.sql**: Tệp cấu trúc bảng MySQL dùng để nhập (Import) vào phpMyAdmin.
- **server.js**: Máy chủ Node.js Express Backend hỗ trợ triển khai trên Render / VPS / Localhost.
- **.htaccess**: Cấu hình Apache cho Hosting cPanel (Hỗ trợ URL sạch không cần đuôi .html và chống cache).

---

## 🚀 CÁCH SỬ DỤNG:

### 1. Triển khai trên Hosting cPanel (PHP + MySQL):
- Nén toàn bộ nội dung trong thư mục này thành file .zip.
- Upload vào thư mục public_html trên cPanel.
- Giải nén ra public_html.
- Tạo database MySQL ttfquanlisite_atf và import tệp database.sql qua phpMyAdmin.
- Truy cập tên miền: http://atfquanli.site và http://atfquanli.site/quanglinhdev.

### 2. Chạy trên Máy Tính (Localhost / Node.js):
```bash
npm install
node server.js
```
Mở trình duyệt truy cập: http://localhost:3000.

---

## 🔐 THÔNG TIN ĐĂNG NHẬP MẶC ĐỊNH:
- **Tài khoản Admin Web**: admin
- **Mật khẩu Quản trị**: Phamlinh@12 (hoặc phamlinh12)
- **Tài khoản Thành viên Test**: linh9988 (Mật khẩu: phamlinh12)
