/**
 * Module Quản Trị Viên (Admin Panel Controller)
 * Quản lý sinh Key, danh sách Key, thành viên, và mở khóa thiết bị (HWID/IP).
 */

const AdminController = {
  // 1. Tải thống kê Admin Dashboard
  async loadStats() {
    try {
      const res = await App.apiFetch('/api/admin/stats');
      if (res && res.success) {
        document.getElementById('admin-stat-users').innerText = res.stats.totalUsers || 0;
        document.getElementById('admin-stat-active-license').innerText = res.stats.activeLicenses || 0;
        document.getElementById('admin-stat-total-keys').innerText = res.stats.totalKeys || 0;
        document.getElementById('admin-stat-unused-keys').innerText = res.stats.unusedKeys || 0;
      }
    } catch (e) {
      console.error('Lỗi tải thống kê Admin:', e);
    }
  },

  // 2. Tạo Key Bản Quyền
  async createKeys() {
    const durationDays = parseInt(document.getElementById('key-duration').value) || 30;
    const maxThreads = parseInt(document.getElementById('key-threads').value) || 10;
    const count = parseInt(document.getElementById('key-count').value) || 1;
    const prefix = document.getElementById('key-prefix').value || 'ATF';
    const note = document.getElementById('key-note').value || '';

    const btn = document.getElementById('btn-generate-keys');
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Đang tạo...`;

    try {
      const res = await App.apiFetch('/api/admin/keys/create', {
        method: 'POST',
        body: JSON.stringify({ durationDays, maxThreads, count, prefix, note })
      });

      if (res && res.success) {
        App.showToast(res.message, 'success');
        this.loadKeys();
        this.loadStats();

        // Hiển thị modal danh sách key vừa tạo để copy nhanh
        const keyCodes = res.keys.map(k => k.code).join('\n');
        document.getElementById('created-keys-output').value = keyCodes;
        document.getElementById('modal-created-keys').classList.remove('hidden');
      } else {
        App.showToast(res.message || 'Lỗi khi tạo key', 'error');
      }
    } catch (e) {
      App.showToast('Lỗi kết nối máy chủ', 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles"></i> Tạo Key Mới`;
    }
  },

  // 3. Tải danh sách Key
  async loadKeys() {
    const tbody = document.getElementById('admin-keys-tbody');
    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải danh sách Key...</td></tr>`;

    try {
      const res = await App.apiFetch('/api/admin/keys');
      if (!res || !res.success || !res.keys) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-danger">Không thể tải dữ liệu</td></tr>`;
        return;
      }

      const keys = res.keys;
      if (keys.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted">Chưa có Key nào được tạo</td></tr>`;
        return;
      }

      tbody.innerHTML = keys.map((k, index) => {
        let statusBadge = `<span class="badge badge-success">Chưa dùng</span>`;
        if (k.status === 'used') {
          statusBadge = `<span class="badge badge-primary">Đã nạp</span>`;
        } else if (k.status === 'revoked') {
          statusBadge = `<span class="badge badge-danger">Đã thu hồi</span>`;
        }

        return `
          <tr>
            <td>${index + 1}</td>
            <td>
              <div class="d-flex align-items-center gap-2">
                <strong class="font-mono text-neon">${k.code}</strong>
                <button class="btn-icon" title="Sao chép Key" onclick="AdminController.copyToClipboard('${k.code}')">
                  <i class="fa-regular fa-copy"></i>
                </button>
              </div>
            </td>
            <td><strong>${k.durationDays}</strong> ngày / <strong>${k.maxThreads}</strong> luồng</td>
            <td>${statusBadge}</td>
            <td>
              ${k.usedByUsername ? `<span class="text-info"><i class="fa-solid fa-user"></i> ${k.usedByUsername}</span><br><small class="text-muted">${k.boundIp || 'Chưa có IP'}</small>` : '<span class="text-muted">---</span>'}
            </td>
            <td><small class="text-muted">${new Date(k.createdAt).toLocaleDateString('vi-VN')}</small><br><small class="text-secondary">${k.note || ''}</small></td>
            <td>
              <div class="action-buttons">
                ${k.status === 'unused' ? `
                  <button class="btn btn-sm btn-outline-danger" onclick="AdminController.revokeKey('${k.id}')" title="Thu hồi key">
                    <i class="fa-solid fa-ban"></i>
                  </button>
                ` : ''}
                <button class="btn btn-sm btn-outline-danger" onclick="AdminController.deleteKey('${k.id}')" title="Xóa vĩnh viễn">
                  <i class="fa-solid fa-trash"></i>
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    } catch (e) {
      console.error('Lỗi load keys:', e);
      tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-danger">Lỗi kết nối máy chủ</td></tr>`;
    }
  },

  // 4. Thu hồi / Vô hiệu hóa Key
  async revokeKey(keyId) {
    if (!confirm('Bạn có chắc chắn muốn thu hồi Key này?')) return;
    try {
      const res = await App.apiFetch('/api/admin/keys/revoke', {
        method: 'POST',
        body: JSON.stringify({ keyId })
      });
      if (res && res.success) {
        App.showToast(res.message, 'success');
        this.loadKeys();
        this.loadStats();
      } else {
        App.showToast(res.message || 'Lỗi khi thu hồi', 'error');
      }
    } catch (e) {
      App.showToast('Lỗi kết nối', 'error');
    }
  },

  // 5. Xóa Key
  async deleteKey(keyId) {
    if (!confirm('Xóa vĩnh viễn Key này khỏi hệ thống?')) return;
    try {
      const res = await App.apiFetch(`/api/admin/keys/${keyId}`, { method: 'DELETE' });
      if (res && res.success) {
        App.showToast(res.message, 'success');
        this.loadKeys();
        this.loadStats();
      } else {
        App.showToast(res.message || 'Lỗi khi xóa', 'error');
      }
    } catch (e) {
      App.showToast('Lỗi kết nối', 'error');
    }
  },

  // 6. Tải danh sách Người Dùng
  async loadUsers() {
    const tbody = document.getElementById('admin-users-tbody');
    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải danh sách thành viên...</td></tr>`;

    try {
      const res = await App.apiFetch('/api/admin/users');
      if (!res || !res.success || !res.users) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-danger">Không thể tải dữ liệu</td></tr>`;
        return;
      }

      const users = res.users;
      tbody.innerHTML = users.map((u, index) => {
        let statusText = '';
        if (u.role === 'admin') {
          statusText = `<span class="badge badge-warning">Admin</span>`;
        } else if (u.isBanned) {
          statusText = `<span class="badge badge-danger">Đang bị khóa</span>`;
        } else if (!u.expiresAt || u.isExpired) {
          statusText = `<span class="badge badge-secondary">Hết hạn / Chưa nạp</span>`;
        } else {
          statusText = `<span class="badge badge-success">Còn ${u.remainingDays} ngày (${u.maxThreads} luồng)</span>`;
        }

        return `
          <tr>
            <td>${index + 1}</td>
            <td><strong>${u.username}</strong></td>
            <td>${statusText}</td>
            <td>
              <div class="font-mono text-xs">
                ${u.boundHwid ? `<span class="text-info" title="${u.boundHwid}">${u.boundHwid.slice(0, 14)}...</span>` : '<span class="text-muted">Chưa khóa máy</span>'}
              </div>
            </td>
            <td><small class="font-mono">${u.boundIp || '---'}</small></td>
            <td><small class="text-muted">${u.lastActiveAt ? new Date(u.lastActiveAt).toLocaleString('vi-VN') : (u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('vi-VN') : '---')}</small></td>
            <td>
              <div class="action-buttons">
                ${u.role !== 'admin' ? `
                  <button class="btn btn-sm btn-outline-info" onclick="AdminController.resetHwid('${u.id}')" title="Mở khóa thiết bị HWID cho khách đổi máy">
                    <i class="fa-solid fa-arrows-rotate"></i> Reset Máy
                  </button>
                  <button class="btn btn-sm ${u.isBanned ? 'btn-outline-success' : 'btn-outline-warning'}" onclick="AdminController.toggleBanUser('${u.id}')" title="${u.isBanned ? 'Mở khóa nick' : 'Khóa nick'}">
                    <i class="fa-solid ${u.isBanned ? 'fa-lock-open' : 'fa-lock'}"></i>
                  </button>
                ` : '<span class="text-muted">Quản trị</span>'}
              </div>
            </td>
          </tr>
        `;
      }).join('');
    } catch (e) {
      console.error('Lỗi load users:', e);
      tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-danger">Lỗi kết nối máy chủ</td></tr>`;
    }
  },

  // 7. Reset HWID cho khách
  async resetHwid(userId) {
    if (!confirm('Bạn có muốn mở khóa thiết bị cho thành viên này để họ đăng nhập máy mới?')) return;
    try {
      const res = await App.apiFetch('/api/admin/users/reset-hwid', {
        method: 'POST',
        body: JSON.stringify({ userId })
      });
      if (res && res.success) {
        App.showToast(res.message, 'success');
        this.loadUsers();
      } else {
        App.showToast(res.message || 'Lỗi reset HWID', 'error');
      }
    } catch (e) {
      App.showToast('Lỗi kết nối', 'error');
    }
  },

  // 8. Khóa / Mở khóa tài khoản
  async toggleBanUser(userId) {
    try {
      const res = await App.apiFetch('/api/admin/users/toggle-ban', {
        method: 'POST',
        body: JSON.stringify({ userId })
      });
      if (res && res.success) {
        App.showToast(res.message, 'success');
        this.loadUsers();
      } else {
        App.showToast(res.message || 'Lỗi thao tác', 'error');
      }
    } catch (e) {
      App.showToast('Lỗi kết nối', 'error');
    }
  },

  // Sao chép clipboard
  copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
      App.showToast('Đã sao chép vào bộ nhớ tạm!', 'info');
    });
  }
};

window.AdminController = AdminController;
