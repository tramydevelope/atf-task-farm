# ATF Web Bot Platform - Hệ Thống Bot Đa Tài Khoản

Hệ thống quản lý và vận hành Bot đa tài khoản trên giao diện Web với cơ chế **Client-Side Execution (Thực thi bằng chính IP và tài nguyên máy của khách)** cùng hệ thống **Quản lý Bản quyền bằng Key (License Key System)** cho Quản trị viên.

---

## 🌟 Tính Năng Nổi Bật

1. **Khách Hàng Tự Động Nhận Diện IP & Mã Máy (HWID):**
   - Không cần cài đặt phần mềm bên ngoài.
   - Trình duyệt tự động trích xuất thông số phần cứng (CPU cores, RAM, GPU WebGL, Canvas, AudioContext) và băm thành mã định danh `HWID-XXXX-XXXX-XXXX`.
   - Backend tự động nhận diện Public IP mạng của khách hàng.

2. **Động Cơ Bot Đa Luồng Chạy Bằng IP Khách (Client-Side Runner):**
   - Động cơ Javascript Web Worker / Promise Pool thực thi trực tiếp trên tab trình duyệt của khách hàng.
   - Mọi request gửi đi mang **100% IP mạng gia đình/máy thật của khách**, không tốn tài nguyên máy chủ Server của bạn.
   - Giám sát tiến độ realtime: Live (Thành công), Die (Thất bại), Bảng trạng thái từng nick, và Màn hình Terminal Log có màu sắc chuyên nghiệp.
   - Hỗ trợ xuất file tài khoản Live / Die về máy tính.

3. **Hệ Thống Quản Lý Bản Quyền Key Toàn Diện (Dành Cho Admin):**
   - Sinh Key đơn lẻ hoặc sinh hàng loạt (1 ngày, 7 ngày, 30 ngày, 365 ngày, Vĩnh viễn).
   - Thiết lập số luồng (threads) tối đa cho từng Key.
   - Quản lý danh sách Key: Xem ai đã nạp, IP nào đã nạp, thu hồi key, xóa key.
   - Quản lý thành viên & **Chức năng Mở khóa thiết bị (Reset HWID)** khi khách đổi máy mới.
   - Cơ chế Heartbeat Ping kiểm tra mỗi 30s để chống việc 1 tài khoản đăng nhập và chạy trên 2 máy cùng lúc.

---

## 🚀 Hướng Dẫn Cài Đặt & Chạy

### 1. Cài đặt thư viện:
Mở Terminal tại thư mục dự án và chạy:
```bash
npm install
```

### 2. Khởi động Server:
```bash
npm start
```
Server sẽ chạy tại: **`http://localhost:3000`**

---

## 🔑 Tài Khoản Mặc Định

| Loại tài khoản | Tên đăng nhập | Mật khẩu | Quyền hạn |
| :--- | :--- | :--- | :--- |
| **Quản Trị Viên (Admin)** | `admin` | `admin123` | Toàn quyền tạo Key, quản lý thành viên, không giới hạn luồng bot |
| **Khách Hàng (User)** | Tự đăng ký trên web | Tự đặt | Cần nạp Key từ Admin để kích hoạt chạy bot |

---

## 📁 Cấu Trúc Dự Án

```
atf-bot-system/
├── package.json              # Khai báo cấu hình và thư viện
├── server.js                 # Backend API (Auth, License, HWID Lock, Admin API)
├── data/
│   └── database.json         # Cơ sở dữ liệu tự động lưu Users, Keys, HWID
├── public/
│   ├── index.html            # Giao diện Web App (Dashboard, Bot Runner, License, Admin)
│   ├── css/
│   │   └── style.css         # Bộ giao diện Dark Cyberpunk / Glassmorphism
│   └── js/
│       ├── fingerprint.js    # Module tự động lấy IP & tạo Mã Máy (HWID)
│       ├── botEngine.js      # Động cơ Bot đa luồng chạy bằng IP & máy khách
│       ├── admin.js          # Controller xử lý nghiệp vụ Quản trị viên
│       └── app.js            # Controller quản lý State và tương tác người dùng
└── README.md                 # Tài liệu hướng dẫn
```
