# 🏪 Panduan Lengkap Aplikasi Operasi Toko & Kasir

Aplikasi ini dibuat khusus untuk operasional toko Anda dengan fokus utama pada **pencatatan modal, pengelolaan stok keluar-masuk, penetapan harga eceran & grosir, pencetakan struk belanja, dan rekap keuntungan bersih (laba)** secara otomatis.

---

## 🚀 Cara Menjalankan Aplikasi

Ada dua cara mudah untuk membuka aplikasi:
1. **Cara Paling Mudah (Sekali Klik):**
   - Buka folder `E:\operasi toko`
   - Klik ganda (double-click) pada file **`Jalankan_Aplikasi_Toko.bat`**
   - Aplikasi akan otomatis berjalan dan membuka browser di `http://localhost:3000`
2. **Melalui Terminal / CMD:**
   ```bash
   npm start
   ```

> **Catatan:** Aplikasi ini berjalan **100% secara offline** di komputer lokal Anda, tidak memerlukan koneksi internet, dan seluruh data tersimpan dengan aman di database lokal (`toko_data.db`).

---

## 📋 Fitur-Fitur Utama & Cara Penggunaannya

### 1. 🛒 Kasir (Point of Sale) & Penjualan Grosir/Eceran
- **Pencarian Cepat & Scan Barcode:**
  - Ketik nama barang atau scan barcode produk langsung di kotak pencarian. Tekan `Enter` untuk langsung menambahkan ke keranjang belanja.
- **Pembedaan Harga Eceran & Grosir:**
  - Anda dapat menentukan mode harga transaksi secara keseluruhan (klik tombol **`🏷️ Mode Eceran / Grosir`**).
  - Anda juga bisa mengubah jenis harga per barang di dalam keranjang hanya dengan mengklik tombol badge `[ECERAN]` atau `[GROSIR]` pada item tersebut.
- **Transparansi Modal & Estimasi Laba Langsung:**
  - Setiap barang di keranjang belanja menampilkan modal asli barang tersebut.
  - Sistem secara langsung menghitung:
    $$\text{Laba Bersih Transaksi} = \text{Total Penjualan} - \text{Diskon} - \text{Total Modal (HPP)}$$
  - Kasir dan pemilik toko dapat langsung melihat berapa keuntungan bersih dari transaksi tersebut sebelum menekan tombol bayar!
- **Hitung Kembalian & Tombol Cepat:**
  - Tersedia tombol pecahan uang cepat: `Uang Pas`, `20.000`, `50.000`, `100.000`, `200.000`, `500.000`.
- **Cetak Struk atau Simpan Transaksi:**
  - Tombol **`🧾 Bayar & Cetak Struk`**: Menyimpan transaksi dan langsung memunculkan pratinjau struk thermal untuk dicetak.
  - Tombol **`💾 Simpan Saja (Tanpa Struk)`**: Jika pelanggan tidak membutuhkan struk belanja.

---

### 2. 🧾 Cetak Struk Belanja
- Mendukung printer thermal kasir ukuran standar **58mm** dan **80mm**, serta kertas ukuran normal / cetak PDF.
- Format struk rapi mencantumkan:
  - Nama toko, alamat, dan nomor WhatsApp / telepon.
  - Nomor nota/faktur transaksi (contoh: `TR-20261118-0001`).
  - Tanggal dan nama pelanggan.
  - Rincian barang, jumlah (qty), harga jual per item, keterangan tipe harga (Eceran/Grosir), dan subtotal.
  - Total belanja, diskon (jika ada), uang diterima, dan kembalian.
  - Pesan penutup struk (catatan kaki toko).

---

### 3. 📦 Kelola Produk, Modal & Stok
- **Bisa Edit Modal Kapan Saja:**
  - Karena harga modal barang sering berubah-ubah saat kulakan, Anda cukup mengklik ikon pensil **`✏️`** pada kolom **Modal (HPP)** di tabel produk untuk langsung mengubah harga modal.
- **Bisa Edit Stok Kapan Saja (Stock Opname):**
  - Klik ikon pensil **`✏️`** pada kolom **Stok** untuk langsung mengoreksi jumlah stok riil toko Anda (misalnya jika ada selisih stok saat opname). Sistem akan otomatis mencatat penyesuaian tersebut ke dalam riwayat mutasi stok.
- **Tambah / Edit Produk Mudah (Tanpa Perlu Barcode):**
  - Anda tidak perlu pusing memikirkan barcode. Cukup ketik nama barang dan pilih satuan stoknya:
    - 🚬 **Pres** *(Khusus Rokok)*
    - 💊 **Box** *(Khusus Obat & Jajan/Snack)*
    - 📦 **Dus** *(Khusus Aqua, Minuman Manis, Mie Instan)*
    - 🔵 **Biji** *(Eceran Umum)*
  - Modal kulakan, Harga Eceran, dan Harga Grosir.
  - Batas stok minimal (notifikasi stok menipis otomatis).
- **Filter Satuan Cepat:** Anda dapat menyortir daftar produk berdasarkan satuan (misal: hanya tampilkan barang *Dus*, atau hanya barang *Pres*).
- **Ekspor Excel:** Tombol untuk mengunduh seluruh daftar produk, modal, harga jual, dan total aset ke file Excel (`.xlsx`).

---

### 4. 📥 Pembelian & Restok Barang Masuk (Kulakan)
- Setiap kali Anda kulakan atau membeli barang dari supplier:
  1. Masukkan nama supplier dan tanggal pembelian.
  2. Cari barang yang dibeli dan masukkan jumlah (qty) pembelian.
  3. Masukkan **Modal Beli Baru** per barang.
  4. Centang opsi **Update**: Jika dicentang, harga modal barang di master produk akan otomatis diperbarui ke harga beli terbaru tersebut, dan stok barang otomatis bertambah!
- Semua riwayat pembelian sebelumnya tersimpan rapi dan dapat dicek rinciannya kapan saja.

---

### 5. 🔄 Keluar Masuk Barang (Mutasi Stok)
- Mencatat seluruh riwayat pergerakan barang:
  - **Barang Masuk (+):** Pembelian kulakan, retur, bonus supplier, atau penyesuaian stok positif.
  - **Barang Keluar (-):** Penjualan kasir, barang rusak, barang pecah/bocor, barang hilang, barang expired/kadaluarsa.
- **Catat Mutasi Manual:**
  - Jika ada barang rusak atau dipakai sendiri, klik tombol **`➕ Catat Mutasi Manual`**, pilih barang, jenis (Keluar), alasan (Rusak/Hilang/Kadaluarsa), dan masukkan jumlahnya. Stok akan langsung terpotong secara rapi.
- Catatan mutasi dapat diedit jika ada salah input keterangan.
- Dapat diekspor ke Excel (`.xlsx`).

---

### 6. 📊 Rekap & Laporan Keuntungan (Laba Bersih)
Fitur terpenting toko Anda untuk mengevaluasi kinerja keuangan:
- **Pilihan Periode Rekap Lengkap:**
  - 📅 **Harian:** Rekap omset, modal, dan laba hari ini atau tanggal tertentu.
  - 📆 **Mingguan:** Rekap keuntungan mingguan.
  - 🗓️ **Bulanan:** Rekap keuntungan bulanan (contoh: November 2026) dengan rincian per hari.
  - 📊 **Tahunan:** Rekap performa tahunan dengan rincian per bulan (Januari - Desember).
  - 🔍 **Rentang Kustom:** Bebas memilih tanggal mulai s/d tanggal selesai.
- **Kartu Ringkasan Indikator Keuangan (KPI):**
  - **Total Omset Penjualan** (Pendapatan Kotor)
  - **Total Modal (HPP)** (Biaya modal atas barang-barang yang laku terjual)
  - **Total Keuntungan Bersih (Laba Bersih)** (Omset - Diskon - Modal)
  - **Margin Keuntungan (%)**
  - **Jumlah Transaksi & Jumlah Barang Terjual**
  - **Total Biaya Pembelian (Kulakan)** pada periode tersebut
- **Perbandingan Laba Eceran vs Grosir:**
  - Menampilkan seberapa banyak kontribusi laba dari penjualan eceran dibanding penjualan grosir.
- **Grafik Tren Visual:**
  - Grafik batang perbandingan: Omset vs Modal vs Laba Bersih dari waktu ke waktu.
- **Top 10 Produk Penyumbang Laba Terbesar:**
  - Mengetahui barang apa saja yang paling menghasilkan uang untuk toko Anda.
- **Ekspor & Cetak:**
  - Tombol **`📥 Ekspor Excel (.xlsx)`**: Mengunduh laporan keuangan lengkap dengan multi-sheet (Ringkasan Laba, Daftar Penjualan, Rincian Item Terjual & Laba).
  - Tombol **`🖨️ Cetak Laporan`**: Mencetak laporan resmi untuk arsip fisik atau disimpan sebagai PDF.

---

### 7. ⚙️ Pengaturan Toko
- Ubah Nama Toko Anda (contoh: *Toko Berkah Mandiri*).
- Masukkan Alamat Toko dan Nomor Telepon/WhatsApp.
- Sesuaikan Catatan Kaki Struk (contoh: *Terima kasih telah berbelanja!*).

---

### 8. ☁️ Cadangan Google Drive & Cloud (Backup & Restore)
Fitur ini menjamin data toko Anda aman selamanya dan tidak akan pernah hilang meskipun komputer rusak atau di-install ulang:

1. **Opsi 1: Cadangkan Otomatis ke Google Drive Komputer (Paling Praktis):**
   - Jika Anda memasang aplikasi *Google Drive for Desktop* di komputer, cukup masukkan lokasi foldernya (contoh: `G:\My Drive\Backup Toko`).
   - Klik tombol **`☁️ Cadangkan ke Drive`**. File database akan disimpan ke folder tersebut dan otomatis terunggah ke akun Google Drive Anda di awan.
2. **Opsi 2: Unduh File Cadangan (.db) Sekali Klik:**
   - Klik tombol **`⬇️ Unduh File Cadangan Database (.db)`** untuk menyimpan file `.db` langsung ke folder Downloads komputer Anda. File ini bisa langsung Anda seret (drag-and-drop) ke [drive.google.com](https://drive.google.com) melalui browser.
3. **Opsi 3: Kirim Cadangan ke Email (Gmail):**
   - Masukkan alamat Gmail pengirim, sandi aplikasi 16 digit, dan email penerima.
   - Klik **`🚀 Kirim Cadangan ke Email Sekarang`**. File database dan ringkasan keuntungan harian akan dikirim langsung ke email Anda, dan Anda dapat menekan tombol *Simpan ke Drive* di Gmail.
4. **Pulihkan Data (Restore):**
   - Jika berpindah komputer atau ingin mengembalikan data lama, cukup pilih file `.db` hasil cadangan di formulir **Pulihkan Data Database**, lalu klik **`⚠️ Mulai Pulihkan Database`**. Seluruh data toko akan kembali seperti sedia kala!

