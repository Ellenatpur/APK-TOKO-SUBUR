// Store Settings & Google Drive / Cloud Backup Management
const SettingsManager = {
  init() {
    this.setupEventListeners();
  },

  setupEventListeners() {
    const form = document.getElementById('settings-form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveSettings();
      });
    }

    // Google Drive backup button
    const btnGDrive = document.getElementById('btn-backup-gdrive');
    if (btnGDrive) {
      btnGDrive.addEventListener('click', () => this.backupToGDrive());
    }

    // Direct download backup button
    const btnDownload = document.getElementById('btn-backup-download');
    if (btnDownload) {
      btnDownload.addEventListener('click', () => this.downloadBackup());
    }

    // Send to email button
    const btnEmail = document.getElementById('btn-backup-email');
    if (btnEmail) {
      btnEmail.addEventListener('click', () => this.sendBackupEmail());
    }

    // Restore database form
    const restoreForm = document.getElementById('restore-db-form');
    if (restoreForm) {
      restoreForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.restoreDatabase();
      });
    }
  },

  async loadSettings() {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      if (data.success) {
        const s = data.data;
        document.getElementById('setting-store-name').value = s.store_name || '';
        document.getElementById('setting-store-address').value = s.store_address || '';
        document.getElementById('setting-store-phone').value = s.store_phone || '';
        document.getElementById('setting-receipt-footer').value = s.receipt_footer || '';

        // Google Drive & Email settings
        const gdriveInput = document.getElementById('setting-gdrive-folder');
        if (gdriveInput) gdriveInput.value = s.gdrive_folder || 'G:\\My Drive\\Backup Toko';

        const smtpUserInput = document.getElementById('setting-smtp-user');
        if (smtpUserInput) smtpUserInput.value = s.smtp_user || '';

        const smtpPassInput = document.getElementById('setting-smtp-pass');
        if (smtpPassInput) smtpPassInput.value = s.smtp_pass || '';

        const targetEmailInput = document.getElementById('setting-target-email');
        if (targetEmailInput) targetEmailInput.value = s.target_email || '';

        const lastBackupText = document.getElementById('last-backup-info');
        if (lastBackupText && s.last_backup_time) {
          lastBackupText.textContent = `Cadangan terakhir: ${s.last_backup_time}`;
        }
      }
    } catch (err) {
      console.error('Error loading settings:', err);
    }
  },

  async saveSettings() {
    const store_name = document.getElementById('setting-store-name')?.value.trim();
    const store_address = document.getElementById('setting-store-address')?.value.trim();
    const store_phone = document.getElementById('setting-store-phone')?.value.trim();
    const receipt_footer = document.getElementById('setting-receipt-footer')?.value.trim();
    const gdrive_folder = document.getElementById('setting-gdrive-folder')?.value.trim();
    const smtp_user = document.getElementById('setting-smtp-user')?.value.trim();
    const smtp_pass = document.getElementById('setting-smtp-pass')?.value.trim();
    const target_email = document.getElementById('setting-target-email')?.value.trim();

    if (!store_name) {
      App.toast('Nama toko tidak boleh kosong!', 'warning');
      return;
    }

    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_name,
          store_address,
          store_phone,
          receipt_footer,
          gdrive_folder,
          smtp_user,
          smtp_pass,
          target_email
        })
      });

      const data = await res.json();
      if (data.success) {
        App.toast('Pengaturan toko berhasil disimpan!', 'success');
        App.loadStoreSettings();
      } else {
        App.toast(data.message || 'Gagal menyimpan pengaturan.', 'error');
      }
    } catch (err) {
      App.toast('Terjadi kesalahan pada server.', 'error');
    }
  },

  // 1. BACKUP TO GOOGLE DRIVE FOLDER
  async backupToGDrive() {
    const folder = document.getElementById('setting-gdrive-folder')?.value.trim();
    if (!folder) {
      App.toast('Masukkan path folder Google Drive terlebih dahulu!', 'warning');
      return;
    }

    const btn = document.getElementById('btn-backup-gdrive');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span>⏳</span> Sedang Mencadangkan...';
    btn.disabled = true;

    try {
      const res = await fetch('/api/backup/gdrive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder_path: folder })
      });

      const data = await res.json();
      if (data.success) {
        App.toast('Berhasil dicadangkan ke Google Drive!', 'success');
        const nowStr = new Date().toLocaleString('id-ID');
        const info = document.getElementById('last-backup-info');
        if (info) info.textContent = `Cadangan terakhir: ${nowStr} (${data.file_name})`;

        // Save last backup timestamp
        fetch('/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ last_backup_time: `${nowStr} (Google Drive)` })
        });
      } else {
        App.toast(data.message || 'Gagal mencadangkan ke Google Drive.', 'error');
      }
    } catch (err) {
      App.toast('Gagal menghubungi server.', 'error');
    } finally {
      btn.innerHTML = originalText;
      btn.disabled = false;
    }
  },

  // 2. DIRECT DOWNLOAD BACKUP FILE
  downloadBackup() {
    App.toast('Membuat file cadangan database...', 'info');
    window.location.href = '/api/backup/download';
  },

  // 3. SEND BACKUP TO EMAIL (GMAIL)
  async sendBackupEmail() {
    const smtp_user = document.getElementById('setting-smtp-user')?.value.trim();
    const smtp_pass = document.getElementById('setting-smtp-pass')?.value.trim();
    const target_email = document.getElementById('setting-target-email')?.value.trim();

    if (!smtp_user || !smtp_pass || !target_email) {
      App.toast('Harap lengkapi email pengirim, sandi aplikasi, dan email penerima!', 'warning');
      return;
    }

    const btn = document.getElementById('btn-backup-email');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span>⏳</span> Mengirim ke Email...';
    btn.disabled = true;

    try {
      const res = await fetch('/api/backup/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ smtp_user, smtp_pass, target_email })
      });

      const data = await res.json();
      if (data.success) {
        App.toast(data.message, 'success');
        const nowStr = new Date().toLocaleString('id-ID');
        const info = document.getElementById('last-backup-info');
        if (info) info.textContent = `Cadangan terakhir: ${nowStr} (Terkirim ke Email)`;

        // Save last backup timestamp
        fetch('/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ last_backup_time: `${nowStr} (Email)` })
        });
      } else {
        App.toast(data.message || 'Gagal mengirim email.', 'error');
      }
    } catch (err) {
      App.toast('Gagal menghubungi server email.', 'error');
    } finally {
      btn.innerHTML = originalText;
      btn.disabled = false;
    }
  },

  // 4. RESTORE DATABASE FROM A BACKUP FILE (.db)
  async restoreDatabase() {
    const fileInput = document.getElementById('restore-db-file');
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
      App.toast('Pilih file cadangan (.db) terlebih dahulu!', 'warning');
      return;
    }

    const file = fileInput.files[0];
    if (!file.name.endsWith('.db')) {
      App.toast('File harus berformat SQLite database (.db)!', 'warning');
      return;
    }

    const confirmMsg = `PERINGATAN SANGAT PENTING:\n\nAnda akan memulihkan data dari file "${file.name}".\n\nSeluruh data toko saat ini akan digantikan dengan data dari file cadangan ini.\n\nApakah Anda benar-benar yakin ingin melanjutkan?`;
    if (!confirm(confirmMsg)) return;

    const formData = new FormData();
    formData.append('backup_file', file);

    const btn = document.getElementById('btn-restore-db');
    btn.innerHTML = '<span>⏳</span> Sedang Memulihkan Database...';
    btn.disabled = true;

    try {
      const res = await fetch('/api/backup/restore', {
        method: 'POST',
        body: formData
      });

      const data = await res.json();
      if (data.success) {
        alert(data.message);
        window.location.reload();
      } else {
        alert('Gagal memulihkan database: ' + data.message);
        btn.innerHTML = '<span>⚠️</span> Mulai Pulihkan Database';
        btn.disabled = false;
      }
    } catch (err) {
      alert('Terjadi kesalahan saat memulihkan database.');
      btn.innerHTML = '<span>⚠️</span> Mulai Pulihkan Database';
      btn.disabled = false;
    }
  }
};

window.SettingsManager = SettingsManager;
