const express = require('express');
const router = express.Router();
const db = require('../database');
const { formatProductStock } = require('../database');
const XLSX = require('xlsx');

// GET all products with filtering & search
router.get('/', (req, res) => {
  try {
    const { q, category, unit, low_stock } = req.query;
    let query = 'SELECT * FROM products WHERE 1=1';
    const params = [];

    if (q) {
      query += ' AND (name LIKE ? OR category LIKE ?)';
      const term = `%${q.trim()}%`;
      params.push(term, term);
    }

    if (category && category !== 'Semua') {
      query += ' AND category = ?';
      params.push(category);
    }

    if (unit && unit !== 'Semua') {
      query += ' AND unit_large = ?';
      params.push(unit);
    }

    if (low_stock === 'true') {
      query += ' AND stock <= min_stock';
    }

    query += ' ORDER BY name ASC';
    const products = db.prepare(query).all(...params);

    // Attach human-readable stock display (e.g. "9 Dus + 21 Biji")
    const formattedProducts = products.map(p => ({
      ...p,
      unit: p.unit_large, // backwards compatible alias
      stock_display: formatProductStock(p.stock, p.unit_large, p.unit_small, p.conversion_qty)
    }));

    // Categories list
    const categories = db.prepare("SELECT DISTINCT category FROM products WHERE category IS NOT NULL AND category != '' ORDER BY category ASC").all().map(r => r.category);

    res.json({ success: true, data: formattedProducts, categories });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET single product by ID
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(id);

    if (!product) {
      return res.status(404).json({ success: false, message: 'Produk tidak ditemukan.' });
    }

    product.unit = product.unit_large;
    product.stock_display = formatProductStock(product.stock, product.unit_large, product.unit_small, product.conversion_qty);

    res.json({ success: true, data: product });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// CREATE new product
router.post('/', (req, res) => {
  try {
    const {
      name,
      category = 'Umum',
      unit_large = 'Dus',
      unit_small = 'Biji',
      conversion_qty = 1,
      cost_price_large = 0,
      cost_price = 0,
      retail_price = 0,
      wholesale_price = 0,
      min_wholesale_qty = 1,
      stock_large = 0,
      stock_small = 0,
      min_stock = 10
    } = req.body;

    if (!name || name.trim() === '') {
      return res.status(400).json({ success: false, message: 'Nama produk wajib diisi.' });
    }

    const conv = Math.max(1, Number(conversion_qty) || 1);
    let costLarge = Number(cost_price_large) || 0;
    let costSmall = Number(cost_price) || 0;

    if (costLarge > 0 && costSmall === 0) {
      costSmall = Math.round(costLarge / conv);
    } else if (costSmall > 0 && costLarge === 0) {
      costLarge = Math.round(costSmall * conv);
    }

    // Hitung total stok awal dalam satuan kecil (Biji)
    const initialStockSmall = (Number(stock_large) || 0) * conv + (Number(stock_small) || 0);

    const insertProduct = db.prepare(`
      INSERT INTO products (
        barcode, name, category, unit_large, unit_small, conversion_qty,
        cost_price_large, cost_price, retail_price, wholesale_price,
        min_wholesale_qty, stock, min_stock
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMutation = db.prepare(`
      INSERT INTO stock_mutations (product_id, type, reason, qty, qty_display, stock_before, stock_after, cost_price, reference_no, notes, date)
      VALUES (?, 'MASUK', 'PENYESUAIAN', ?, ?, 0, ?, ?, 'STOK-AWAL', 'Stok awal produk baru', ?)
    `);

    const today = new Date().toISOString().split('T')[0];

    const createTx = db.transaction(() => {
      const info = insertProduct.run(
        null, // barcode null
        name.trim(),
        category.trim() || 'Umum',
        unit_large.trim() || 'Dus',
        unit_small.trim() || 'Biji',
        conv,
        costLarge,
        costSmall,
        Number(retail_price) || 0,
        Number(wholesale_price) || 0,
        Number(min_wholesale_qty) || 1,
        initialStockSmall,
        Number(min_stock) || 10
      );

      const newId = info.lastInsertRowid;

      if (initialStockSmall > 0) {
        const display = formatProductStock(initialStockSmall, unit_large, unit_small, conv);
        insertMutation.run(newId, initialStockSmall, display, initialStockSmall, costSmall, today);
      }

      return newId;
    });

    const newProductId = createTx();
    const createdProduct = db.prepare('SELECT * FROM products WHERE id = ?').get(newProductId);
    createdProduct.stock_display = formatProductStock(createdProduct.stock, createdProduct.unit_large, createdProduct.unit_small, createdProduct.conversion_qty);

    res.status(201).json({ success: true, message: 'Produk berhasil ditambahkan.', data: createdProduct });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// UPDATE product
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      category,
      unit_large,
      unit_small,
      conversion_qty,
      cost_price_large,
      cost_price,
      retail_price,
      wholesale_price,
      min_wholesale_qty,
      min_stock
    } = req.body;

    const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Produk tidak ditemukan.' });
    }

    const conv = conversion_qty !== undefined ? Math.max(1, Number(conversion_qty) || 1) : existing.conversion_qty;
    let costLarge = cost_price_large !== undefined ? Number(cost_price_large) : existing.cost_price_large;
    let costSmall = cost_price !== undefined ? Number(cost_price) : existing.cost_price;

    if (cost_price_large !== undefined && cost_price === undefined) {
      costSmall = Math.round(costLarge / conv);
    } else if (cost_price !== undefined && cost_price_large === undefined) {
      costLarge = Math.round(costSmall * conv);
    }

    db.prepare(`
      UPDATE products SET
        name = ?,
        category = ?,
        unit_large = ?,
        unit_small = ?,
        conversion_qty = ?,
        cost_price_large = ?,
        cost_price = ?,
        retail_price = ?,
        wholesale_price = ?,
        min_wholesale_qty = ?,
        min_stock = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      name !== undefined ? name.trim() : existing.name,
      category !== undefined ? category.trim() : existing.category,
      unit_large !== undefined ? unit_large.trim() : existing.unit_large,
      unit_small !== undefined ? unit_small.trim() : existing.unit_small,
      conv,
      costLarge,
      costSmall,
      retail_price !== undefined ? Number(retail_price) : existing.retail_price,
      wholesale_price !== undefined ? Number(wholesale_price) : existing.wholesale_price,
      min_wholesale_qty !== undefined ? Number(min_wholesale_qty) : existing.min_wholesale_qty,
      min_stock !== undefined ? Number(min_stock) : existing.min_stock,
      id
    );

    const updated = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
    updated.stock_display = formatProductStock(updated.stock, updated.unit_large, updated.unit_small, updated.conversion_qty);
    res.json({ success: true, message: 'Data produk berhasil diperbarui.', data: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// QUICK EDIT MODAL (HPP)
router.put('/:id/cost', (req, res) => {
  try {
    const { id } = req.params;
    const { cost_price_large, cost_price } = req.body;

    const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Produk tidak ditemukan.' });
    }

    let costLarge = Number(cost_price_large);
    let costSmall = Number(cost_price);

    if (!isNaN(costLarge) && costLarge >= 0) {
      costSmall = Math.round(costLarge / existing.conversion_qty);
    } else if (!isNaN(costSmall) && costSmall >= 0) {
      costLarge = Math.round(costSmall * existing.conversion_qty);
    } else {
      return res.status(400).json({ success: false, message: 'Nominal harga modal tidak valid.' });
    }

    db.prepare(`
      UPDATE products SET cost_price_large = ?, cost_price = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(costLarge, costSmall, id);

    res.json({
      success: true,
      message: `Modal "${existing.name}" berhasil diubah menjadi Rp ${costLarge.toLocaleString('id-ID')} / ${existing.unit_large} (Rp ${costSmall.toLocaleString('id-ID')} / ${existing.unit_small}).`,
      data: { id, cost_price_large: costLarge, cost_price: costSmall }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// QUICK EDIT STOK (Stock Opname)
router.put('/:id/stock', (req, res) => {
  try {
    const { id } = req.params;
    const { stock_large, stock_small, new_stock, reason = 'PENYESUAIAN', notes = 'Koreksi stok manual' } = req.body;

    const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Produk tidak ditemukan.' });
    }

    let targetStockSmall;
    if (new_stock !== undefined && !isNaN(new_stock)) {
      targetStockSmall = Number(new_stock);
    } else {
      const sLarge = Number(stock_large) || 0;
      const sSmall = Number(stock_small) || 0;
      targetStockSmall = (sLarge * existing.conversion_qty) + sSmall;
    }

    const diff = targetStockSmall - existing.stock;
    if (diff === 0) {
      return res.json({ success: true, message: 'Stok sama dengan saat ini (tidak ada perubahan).', data: existing });
    }

    const type = diff > 0 ? 'MASUK' : 'KELUAR';
    const qtyDiff = Math.abs(diff);
    const today = new Date().toISOString().split('T')[0];
    const displayDiff = formatProductStock(qtyDiff, existing.unit_large, existing.unit_small, existing.conversion_qty);

    const adjustTx = db.transaction(() => {
      db.prepare('UPDATE products SET stock = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(targetStockSmall, id);

      db.prepare(`
        INSERT INTO stock_mutations (product_id, type, reason, qty, qty_display, stock_before, stock_after, cost_price, reference_no, notes, date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'MANUAL-OPNAME', ?, ?)
      `).run(id, type, reason, qtyDiff, displayDiff, existing.stock, targetStockSmall, existing.cost_price, notes, today);
    });

    adjustTx();

    const updated = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
    const updatedDisplay = formatProductStock(updated.stock, updated.unit_large, updated.unit_small, updated.conversion_qty);

    res.json({
      success: true,
      message: `Stok "${existing.name}" berhasil disesuaikan menjadi ${updatedDisplay}.`,
      data: { ...updated, stock_display: updatedDisplay }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE product
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Produk tidak ditemukan.' });
    }

    const inSales = db.prepare('SELECT COUNT(*) as count FROM sale_items WHERE product_id = ?').get(id).count;
    const inPurchases = db.prepare('SELECT COUNT(*) as count FROM purchase_items WHERE product_id = ?').get(id).count;

    if (inSales > 0 || inPurchases > 0) {
      return res.status(400).json({
        success: false,
        message: `Produk "${existing.name}" tidak dapat dihapus karena sudah memiliki riwayat transaksi (${inSales} penjualan, ${inPurchases} pembelian). Anda dapat mengubah stoknya menjadi 0.`
      });
    }

    db.prepare('DELETE FROM products WHERE id = ?').run(id);
    res.json({ success: true, message: `Produk "${existing.name}" berhasil dihapus.` });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// EXPORT products to Excel
router.get('/export/excel', (req, res) => {
  try {
    const products = db.prepare('SELECT * FROM products ORDER BY name ASC').all();

    const rows = products.map(p => {
      const stockDisplay = formatProductStock(p.stock, p.unit_large, p.unit_small, p.conversion_qty);
      return {
        'Nama Produk': p.name,
        'Kategori': p.category,
        'Satuan Kemasan (Besar)': p.unit_large,
        'Satuan Eceran (Kecil)': p.unit_small,
        'Isi per Kemasan Besar': p.conversion_qty,
        'Modal per Kemasan Besar': p.cost_price_large,
        'Modal per Biji (Ecer)': p.cost_price,
        'Harga Jual Eceran (per Biji)': p.retail_price,
        'Harga Jual Grosir (per Kemasan Besar)': p.wholesale_price,
        'Stok Riil Toko': stockDisplay,
        'Total Stok (Biji)': p.stock,
        'Total Nilai Modal Aset': p.cost_price * p.stock
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Daftar Produk');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', 'attachment; filename="Daftar_Produk_Stok_Modal.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
