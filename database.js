const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = process.env.DB_PATH || path.join(__dirname, 'toko_data.db');
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}
const db = new Database(dbPath);

// Enable WAL mode for high performance and reliability
db.pragma('journal_mode = WAL');

// Helper to format stock into human-readable Dus/Pres/Box + Biji
function formatProductStock(stock, unitLarge, unitSmall, conversionQty) {
  const s = Number(stock) || 0;
  const conv = Number(conversionQty) || 1;
  const uLarge = unitLarge || 'Dus';
  const uSmall = unitSmall || 'Biji';

  if (conv > 1) {
    const large = Math.floor(s / conv);
    const small = Math.round(s % conv);
    if (large > 0 && small > 0) {
      return `${large} ${uLarge} + ${small} ${uSmall}`;
    } else if (large > 0 && small === 0) {
      return `${large} ${uLarge}`;
    } else {
      return `${small} ${uSmall}`;
    }
  }
  return `${s} ${uSmall}`;
}

// Initialize database schema
function initDatabase() {
  db.exec(`
    -- Tabel Pengaturan Toko
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    -- Tabel Produk (Mendukung Satuan Dus/Pres/Box & Biji Eceran)
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      barcode TEXT UNIQUE,
      name TEXT NOT NULL,
      category TEXT DEFAULT 'Umum',
      unit_large TEXT DEFAULT 'Dus',            -- Kemasan Besar: 'Dus', 'Pres', 'Box', 'Biji'
      unit_small TEXT DEFAULT 'Biji',           -- Kemasan Kecil / Ecer: 'Biji', 'Bungkus', 'Strip', 'Botol'
      conversion_qty REAL DEFAULT 1,            -- Jumlah isi satuan kecil dalam 1 satuan besar (contoh 24 botol/dus)
      cost_price_large REAL NOT NULL DEFAULT 0, -- Modal per satuan besar (per Dus / Pres / Box)
      cost_price REAL NOT NULL DEFAULT 0,       -- Modal per satuan kecil / Biji (cost_price_large / conversion_qty)
      retail_price REAL NOT NULL DEFAULT 0,     -- Harga Jual Eceran (per Biji / satuan kecil)
      wholesale_price REAL NOT NULL DEFAULT 0,  -- Harga Jual Grosir (per Dus / Pres / Box)
      min_wholesale_qty REAL DEFAULT 1,         -- Minimal Qty untuk Grosir
      stock REAL NOT NULL DEFAULT 0,            -- Total stok tersimpan dalam satuan terkecil (Biji)
      min_stock REAL NOT NULL DEFAULT 10,       -- Alert batas stok minim dalam Biji
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Tabel Riwayat Mutasi Stok (Keluar Masuk)
    CREATE TABLE IF NOT EXISTS stock_mutations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      type TEXT NOT NULL,                        -- 'MASUK' atau 'KELUAR'
      reason TEXT NOT NULL,                      -- 'PEMBELIAN', 'PENJUALAN', 'PENYESUAIAN', 'RUSAK', 'HILANG', 'LAINNYA'
      qty REAL NOT NULL,                         -- Jumlah dalam Biji
      qty_display TEXT,                          -- Tampilan terbaca (contoh: '2 Dus' atau '3 Biji')
      stock_before REAL NOT NULL,
      stock_after REAL NOT NULL,
      cost_price REAL DEFAULT 0,                 -- Modal saat mutasi
      reference_no TEXT,                         -- No faktur/nota terkait
      notes TEXT,
      date TEXT NOT NULL,                        -- YYYY-MM-DD
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    -- Tabel Pembelian / Restok (Kulakan)
    CREATE TABLE IF NOT EXISTS purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_no TEXT UNIQUE NOT NULL,
      supplier TEXT,
      total_amount REAL NOT NULL DEFAULT 0,
      notes TEXT,
      date TEXT NOT NULL,                        -- YYYY-MM-DD
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Tabel Item Pembelian
    CREATE TABLE IF NOT EXISTS purchase_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      product_name TEXT NOT NULL,
      qty REAL NOT NULL,                         -- Jumlah yang dibeli (misal 5 Dus)
      unit_purchased TEXT NOT NULL,              -- 'Dus', 'Pres', 'Box', 'Biji'
      qty_small REAL NOT NULL,                   -- Total Biji (qty * conversion_qty)
      cost_price REAL NOT NULL,                  -- Modal beli per unit beli
      subtotal REAL NOT NULL,
      FOREIGN KEY(purchase_id) REFERENCES purchases(id) ON DELETE CASCADE,
      FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    -- Tabel Penjualan (Transaksi Kasir)
    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_no TEXT UNIQUE NOT NULL,
      customer_name TEXT DEFAULT 'Pelanggan Umum',
      price_tier TEXT DEFAULT 'CAMPUR',          -- 'ECERAN', 'GROSIR', 'CAMPUR'
      total_cost REAL NOT NULL DEFAULT 0,        -- Total Modal barang terjual
      total_selling REAL NOT NULL DEFAULT 0,     -- Total Nilai Jual
      discount REAL DEFAULT 0,                   -- Potongan harga jika ada
      grand_total REAL NOT NULL DEFAULT 0,       -- total_selling - discount
      profit REAL NOT NULL DEFAULT 0,            -- grand_total - total_cost (Keuntungan Bersih)
      payment_method TEXT DEFAULT 'TUNAI',       -- 'TUNAI', 'TRANSFER', 'QRIS'
      cash_paid REAL DEFAULT 0,                  -- Uang diterima
      change_returned REAL DEFAULT 0,            -- Kembalian
      notes TEXT,
      date TEXT NOT NULL,                        -- YYYY-MM-DD
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Tabel Item Penjualan
    CREATE TABLE IF NOT EXISTS sale_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      product_name TEXT NOT NULL,
      qty REAL NOT NULL,                         -- Qty yang dibeli pelanggan (misal 2 Dus atau 3 Biji)
      sold_unit TEXT NOT NULL,                   -- Satuan yang dibeli: 'Biji' / 'Dus' / 'Pres' / 'Box'
      qty_small REAL NOT NULL,                   -- Pengurangan stok dalam Biji (misal 2 Dus isi 24 = 48 Biji)
      cost_price REAL NOT NULL,                  -- Modal per barang sesuai satuan yang dijual
      selling_price REAL NOT NULL,               -- Harga jual per barang sesuai satuan yang dijual
      price_type TEXT NOT NULL,                  -- 'ECERAN' atau 'GROSIR'
      subtotal_cost REAL NOT NULL,               -- qty * cost_price
      subtotal_selling REAL NOT NULL,            -- qty * selling_price
      profit REAL NOT NULL,                      -- subtotal_selling - subtotal_cost
      FOREIGN KEY(sale_id) REFERENCES sales(id) ON DELETE CASCADE,
      FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    -- Indeks untuk pencarian cepat
    CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
    CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(date);
    CREATE INDEX IF NOT EXISTS idx_sales_invoice ON sales(invoice_no);
    CREATE INDEX IF NOT EXISTS idx_stock_mutations_product ON stock_mutations(product_id);
    CREATE INDEX IF NOT EXISTS idx_stock_mutations_date ON stock_mutations(date);
  `);

  // Safe schema migrations for existing databases
  const checkColumn = (table, col) => {
    try {
      const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
      return cols.includes(col);
    } catch (e) {
      return false;
    }
  };

  const addColumn = (table, colDef) => {
    try {
      db.prepare(`ALTER TABLE ${table} ADD COLUMN ${colDef}`).run();
    } catch (e) {
      // Column may already exist
    }
  };

  // 1. products table columns
  if (!checkColumn('products', 'unit_large')) addColumn('products', "unit_large TEXT DEFAULT 'Dus'");
  if (!checkColumn('products', 'unit_small')) addColumn('products', "unit_small TEXT DEFAULT 'Biji'");
  if (!checkColumn('products', 'conversion_qty')) addColumn('products', "conversion_qty REAL DEFAULT 1");
  if (!checkColumn('products', 'cost_price_large')) addColumn('products', "cost_price_large REAL DEFAULT 0");

  // Migrate existing product rows to have proper unit_large and conversion_qty
  try {
    db.exec(`
      UPDATE products SET
        unit_large = CASE
          WHEN LOWER(category) LIKE '%rokok%' THEN 'Pres'
          WHEN LOWER(category) LIKE '%obat%' OR LOWER(category) LIKE '%jajan%' OR LOWER(category) LIKE '%snack%' THEN 'Box'
          WHEN LOWER(category) LIKE '%air%' OR LOWER(category) LIKE '%minum%' OR LOWER(category) LIKE '%mie%' THEN 'Dus'
          ELSE coalesce(unit_large, 'Biji')
        END,
        unit_small = 'Biji',
        conversion_qty = CASE
          WHEN LOWER(category) LIKE '%rokok%' AND (conversion_qty IS NULL OR conversion_qty = 1) THEN 10
          WHEN LOWER(category) LIKE '%obat%' AND (conversion_qty IS NULL OR conversion_qty = 1) THEN 10
          WHEN (LOWER(category) LIKE '%jajan%' OR LOWER(category) LIKE '%snack%') AND (conversion_qty IS NULL OR conversion_qty = 1) THEN 20
          WHEN LOWER(category) LIKE '%mie%' AND (conversion_qty IS NULL OR conversion_qty = 1) THEN 40
          WHEN (LOWER(category) LIKE '%air%' OR LOWER(category) LIKE '%minum%') AND (conversion_qty IS NULL OR conversion_qty = 1) THEN 24
          ELSE coalesce(conversion_qty, 1)
        END
      WHERE unit_large IS NULL OR unit_large = 'Dus' OR unit_large = 'Pcs';

      UPDATE products SET
        cost_price_large = CASE
          WHEN (cost_price_large IS NULL OR cost_price_large = 0) AND cost_price > 0 THEN cost_price * conversion_qty
          ELSE cost_price_large
        END,
        wholesale_price = CASE
          WHEN (wholesale_price IS NULL OR wholesale_price = 0 OR wholesale_price < retail_price) AND conversion_qty > 1 THEN wholesale_price * conversion_qty
          ELSE wholesale_price
        END;
    `);
  } catch (e) {
    console.error('Migration warning (products):', e.message);
  }

  // 2. stock_mutations
  if (!checkColumn('stock_mutations', 'qty_display')) addColumn('stock_mutations', "qty_display TEXT");

  // 3. purchase_items
  if (!checkColumn('purchase_items', 'unit_purchased')) addColumn('purchase_items', "unit_purchased TEXT DEFAULT 'Biji'");
  if (!checkColumn('purchase_items', 'qty_small')) addColumn('purchase_items', "qty_small REAL DEFAULT 1");

  // 4. sale_items
  if (!checkColumn('sale_items', 'sold_unit')) addColumn('sale_items', "sold_unit TEXT DEFAULT 'Biji'");
  if (!checkColumn('sale_items', 'qty_small')) addColumn('sale_items', "qty_small REAL DEFAULT 1");

  // Default Store Settings
  const defaultSettings = [
    ['store_name', 'TOKO SAYA'],
    ['store_address', 'Jl. Raya Perdagangan No. 123'],
    ['store_phone', '0812-3456-7890'],
    ['receipt_footer', 'Terima kasih atas kunjungan Anda!\nBarang yang sudah dibeli tidak dapat ditukar/dikembalikan.']
  ];

  const checkSetting = db.prepare('SELECT value FROM settings WHERE key = ?');
  const insertSetting = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');

  for (const [key, value] of defaultSettings) {
    if (!checkSetting.get(key)) {
      insertSetting.run(key, value);
    }
  }

  // Sample initial products (inserts only if not already present)
  const insertProduct = db.prepare(`
    INSERT INTO products (
      barcode, name, category, unit_large, unit_small, conversion_qty,
      cost_price_large, cost_price, retail_price, wholesale_price,
      min_wholesale_qty, stock, min_stock
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Master produk awal dengan konversi satuan Dus/Pres/Box -> Biji:
  // Format: [barcode, name, category, unit_large, unit_small, conversion_qty, cost_large, cost_small, retail_price (ecer/biji), wholesale_price (grosir/dus), min_wholesale, stock_in_biji, min_stock_biji]
  const sampleProducts = [
    // 1. ROKOK -> Satuan Besar PRES, Satuan Ecer BIJI (1 Pres = 10 Biji/Bungkus)
    [null, 'Rokok Surya 16', 'Rokok', 'Pres', 'Biji', 10, 315000, 31500, 34000, 325000, 1, 150, 20],
    [null, 'Rokok Sampoerna Mild 16', 'Rokok', 'Pres', 'Biji', 10, 320000, 32000, 34500, 330000, 1, 120, 20],
    
    // 2. OBAT & JAJAN -> Satuan Besar BOX, Satuan Ecer BIJI/STRIP (1 Box = 10 atau 20 Biji)
    [null, 'Paracetamol 500mg Strip', 'Obat', 'Box', 'Biji', 10, 45000, 4500, 6000, 52000, 1, 200, 30],
    [null, 'Obat Promag Tablet Kunyah', 'Obat', 'Box', 'Biji', 10, 75000, 7500, 9500, 85000, 1, 150, 30],
    [null, 'Wafer Nabati Keju 50g', 'Jajan & Snack', 'Box', 'Biji', 20, 36000, 1800, 2500, 42000, 1, 300, 40],
    [null, 'Cokelat Choki-Choki', 'Jajan & Snack', 'Box', 'Biji', 20, 22000, 1100, 1500, 26000, 1, 400, 40],

    // 3. AQUA, MINUMAN MANIS, MIE INSTAN -> Satuan Besar DUS, Satuan Ecer BIJI (1 Dus = 24 atau 40 Biji)
    [null, 'Aqua Botol 600ml', 'Air Mineral', 'Dus', 'Biji', 24, 48000, 2000, 3000, 53000, 1, 480, 48],
    [null, 'Teh Pucuk Harum 350ml', 'Minuman Manis', 'Dus', 'Biji', 24, 54000, 2250, 3500, 60000, 1, 360, 48],
    [null, 'Indomie Goreng Original', 'Mie Instan', 'Dus', 'Biji', 40, 112000, 2800, 3500, 120000, 1, 800, 80],
    [null, 'Indomie Ayam Bawang', 'Mie Instan', 'Dus', 'Biji', 40, 110000, 2750, 3500, 118000, 1, 600, 80],

    // 4. ECERAN UMUM -> Satuan BIJI (Kemasan Besar = Kemasan Kecil, Isi = 1)
    [null, 'Sabun Mandi Lifebuoy', 'Kebutuhan Rumah', 'Biji', 'Biji', 1, 3500, 3500, 5000, 4500, 6, 60, 10],
    [null, 'Minyak Goreng Botol 1L', 'Sembako', 'Biji', 'Biji', 1, 16000, 16000, 18500, 17500, 6, 30, 6]
  ];

  const today = new Date().toISOString().split('T')[0];
  const insertMutation = db.prepare(`
    INSERT INTO stock_mutations (product_id, type, reason, qty, qty_display, stock_before, stock_after, cost_price, reference_no, notes, date)
    VALUES (?, 'MASUK', 'PENYESUAIAN', ?, ?, 0, ?, ?, 'STOK-AWAL', 'Stok awal sistem', ?)
  `);

  const checkProductByName = db.prepare('SELECT id FROM products WHERE name = ?');

  const insertInitial = db.transaction(() => {
    for (const p of sampleProducts) {
      const existing = checkProductByName.get(p[1]);
      if (!existing) {
        const info = insertProduct.run(...p);
        const productId = info.lastInsertRowid;
        const stockBiji = p[11];
        const costPrice = p[7];
        const formatted = formatProductStock(stockBiji, p[3], p[4], p[5]);
        insertMutation.run(productId, stockBiji, formatted, stockBiji, costPrice, today);
      }
    }
  });

  insertInitial();
}

initDatabase();

module.exports = db;
module.exports.formatProductStock = formatProductStock;
