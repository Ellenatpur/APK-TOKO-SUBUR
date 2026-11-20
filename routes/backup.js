const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const multer = require('multer');
const db = require('../database');

const upload = multer({ dest: path.join(__dirname, '../temp_uploads/') });

// Ensure temp_uploads directory exists
const tempUploadsDir = path.join(__dirname, '../temp_uploads');
if (!fs.existsSync(tempUploadsDir)) {
  fs.mkdirSync(tempUploadsDir, { recursive: true });
}

// Helper to generate backup filename with timestamp
function getBackupFileName() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `toko_data_backup_${yyyy}${mm}${dd}_${hh}${min}${ss}.db`;
}

// 1. DOWNLOAD BACKUP DATABASE FILE DIRECTLY
router.get('/download', async (req, res) => {
  try {
    const filename = getBackupFileName();
    const tempPath = path.join(tempUploadsDir, filename);

    // Use SQLite native backup for 100% integrity
    await db.backup(tempPath);

    res.download(tempPath, filename, (err) => {
      if (fs.existsSync(tempPath)) {
        try { fs.unlinkSync(tempPath); } catch {}
      }
      if (err && !res.headersSent) {
        res.status(500).json({ success: false, message: 'Gagal mengunduh file cadangan.' });
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 2. BACKUP DIRECTLY TO GOOGLE DRIVE FOLDER (Google Drive for Desktop / Sync)
router.post('/gdrive', async (req, res) => {
  try {
    let { folder_path } = req.body;

    // If not provided in body, get from settings
    if (!folder_path || folder_path.trim() === '') {
      const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('gdrive_folder');
      if (row && row.value) {
        folder_path = row.value.trim();
      }
    }

    if (!folder_path || folder_path.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Lokasi folder Google Drive belum ditentukan. Silakan masukkan lokasi folder Google Drive Anda terlebih dahulu (contoh: G:\\My Drive\\Backup Toko).'
      });
    }

    // Create target folder if it doesn't exist
    if (!fs.existsSync(folder_path)) {
      try {
        fs.mkdirSync(folder_path, { recursive: true });
      } catch (err) {
        return res.status(400).json({
          success: false,
          message: `Folder "${folder_path}" tidak dapat diakses atau dibuat. Pastikan path benar dan izin akses tersedia.`
        });
      }
    }

    const filename = getBackupFileName();
    const destinationPath = path.join(folder_path, filename);

    // Save backup directly into Google Drive folder
    await db.backup(destinationPath);

    const stats = fs.statSync(destinationPath);
    const sizeKB = (stats.size / 1024).toFixed(1);

    // Save folder setting for future auto-use
    db.prepare(`
      INSERT INTO settings (key, value) VALUES ('gdrive_folder', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(folder_path);

    res.json({
      success: true,
      message: `Cadangan database berhasil disimpan ke Google Drive! File: ${filename} (${sizeKB} KB)`,
      file_path: destinationPath,
      file_name: filename
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 3. SEND BACKUP TO EMAIL (GMAIL)
router.post('/email', async (req, res) => {
  try {
    let { smtp_user, smtp_pass, target_email } = req.body;

    // Load from settings if not passed
    const getSetting = (k) => {
      const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(k);
      return r ? r.value : '';
    };

    if (!smtp_user) smtp_user = getSetting('smtp_user');
    if (!smtp_pass) smtp_pass = getSetting('smtp_pass');
    if (!target_email) target_email = getSetting('target_email') || smtp_user;

    if (!smtp_user || !smtp_pass || !target_email) {
      return res.status(400).json({
        success: false,
        message: 'Informasi email belum lengkap. Harap isi Email Pengirim (Gmail), Sandi Aplikasi (App Password), dan Email Penerima.'
      });
    }

    const filename = getBackupFileName();
    const tempPath = path.join(tempUploadsDir, filename);

    // Safely snapshot database
    await db.backup(tempPath);

    // Fetch store name and today's summary for email content
    const storeName = getSetting('store_name') || 'Toko Saya';
    const today = new Date().toISOString().split('T')[0];

    const todaySales = db.prepare(`
      SELECT 
        COUNT(*) as total_sales,
        COALESCE(SUM(grand_total), 0) as net_revenue,
        COALESCE(SUM(total_cost), 0) as total_cost,
        COALESCE(SUM(profit), 0) as total_profit
      FROM sales WHERE date = ?
    `).get(today);

    // Create transporter
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: smtp_user.trim(),
        pass: smtp_pass.trim().replace(/\s+/g, '') // remove spaces from Gmail app password
      }
    });

    const formatRp = (num) => 'Rp ' + Math.round(Number(num) || 0).toLocaleString('id-ID');

    const mailOptions = {
      from: `"${storeName} Backup" <${smtp_user}>`,
      to: target_email.trim(),
      subject: `📦 Cadangan Database & Rekap Toko - ${storeName} (${today})`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #2563eb; margin-bottom: 5px;">📦 Cadangan Database Toko Berhasil Dibuat</h2>
          <p style="color: #64748b; font-size: 14px; margin-top: 0;">Toko: <strong>${storeName}</strong> | Tanggal: <strong>${today}</strong></p>
          
          <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; margin: 20px 0; border: 1px solid #e2e8f0;">
            <h4 style="margin: 0 0 10px 0; color: #1e293b;">Ringkasan Penjualan Hari Ini:</h4>
            <table style="width: 100%; font-size: 13px; color: #334155;">
              <tr>
                <td style="padding: 4px 0;">Jumlah Transaksi:</td>
                <td style="text-align: right; font-weight: bold;">${todaySales.total_sales} Transaksi</td>
              </tr>
              <tr>
                <td style="padding: 4px 0;">Total Omset:</td>
                <td style="text-align: right; font-weight: bold;">${formatRp(todaySales.net_revenue)}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0;">Total Modal (HPP):</td>
                <td style="text-align: right; font-weight: bold;">${formatRp(todaySales.total_cost)}</td>
              </tr>
              <tr style="border-top: 1px dashed #cbd5e1;">
                <td style="padding: 6px 0; font-weight: bold; color: #15803d;">Laba Bersih Hari Ini:</td>
                <td style="text-align: right; font-weight: bold; color: #15803d; font-size: 15px;">+${formatRp(todaySales.total_profit)}</td>
              </tr>
            </table>
          </div>

          <p style="font-size: 13px; color: #475569; line-height: 1.5;">
            File cadangan database terlampir pada email ini (<strong>${filename}</strong>).<br>
            💡 <em>Tips: Anda dapat langsung mengklik ikon <strong>"Simpan ke Drive"</strong> pada file lampiran ini untuk menyimpannya ke Google Drive Anda.</em>
          </p>

          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">
          <p style="font-size: 11px; color: #94a3b8; text-align: center;">Dikirim otomatis oleh Sistem Operasi Toko & Kasir.</p>
        </div>
      `,
      attachments: [
        {
          filename: filename,
          path: tempPath
        }
      ]
    };

    await transporter.sendMail(mailOptions);

    // Clean up temporary file
    if (fs.existsSync(tempPath)) {
      try { fs.unlinkSync(tempPath); } catch {}
    }

    // Save email settings
    const saveSetting = db.prepare(`
      INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
    saveSetting.run('smtp_user', smtp_user.trim());
    saveSetting.run('smtp_pass', smtp_pass.trim());
    saveSetting.run('target_email', target_email.trim());

    res.json({
      success: true,
      message: `Cadangan database berhasil dikirim ke email "${target_email}"!`
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Gagal mengirim email: ' + error.message });
  }
});

// 4. RESTORE DATABASE FROM A BACKUP FILE (.db)
router.post('/restore', upload.single('backup_file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Tidak ada file cadangan (.db) yang dipilih.' });
    }

    const uploadedPath = req.file.path;

    // Validate SQLite Header ("SQLite format 3")
    const buffer = Buffer.alloc(16);
    const fd = fs.openSync(uploadedPath, 'r');
    fs.readSync(fd, buffer, 0, 16, 0);
    fs.closeSync(fd);

    const header = buffer.toString('utf-8');
    if (!header.startsWith('SQLite format 3')) {
      fs.unlinkSync(uploadedPath);
      return res.status(400).json({
        success: false,
        message: 'File yang diunggah bukan file database SQLite (.db) yang valid.'
      });
    }

    const dbPath = process.env.DB_PATH || path.join(__dirname, '../toko_data.db');
    const autoBakPath = `${dbPath}_sebelum_restore_${Date.now()}.bak`;

    // 1. Backup current database before replacing
    try {
      await db.backup(autoBakPath);
    } catch (e) {
      console.warn('Could not create pre-restore backup:', e.message);
    }

    // 2. Checkpoint WAL and replace database
    db.pragma('wal_checkpoint(TRUNCATE)');
    
    // Close existing connection temporarily to replace the file safely
    db.close();

    // Replace the database file with the uploaded one
    fs.copyFileSync(uploadedPath, dbPath);
    fs.unlinkSync(uploadedPath);

    // Remove old wal/shm if present
    try { fs.unlinkSync(dbPath + '-wal'); } catch {}
    try { fs.unlinkSync(dbPath + '-shm'); } catch {}

    res.json({
      success: true,
      message: 'Database berhasil dipulihkan dari cadangan! Sistem akan memuat ulang halaman sekarang.'
    });

    // Exit process after response so Windows service/launcher restarts cleanly or reopens connection
    setTimeout(() => {
      process.exit(0);
    }, 1500);

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
