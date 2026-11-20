const express = require('express');
const router = express.Router();
const db = require('../database');
const XLSX = require('xlsx');

// GET all stock mutations
router.get('/', (req, res) => {
  try {
    const { product_id, type, reason, start_date, end_date, q, limit = 200 } = req.query;
    let query = `
      SELECT sm.*, p.name as product_name, p.barcode, p.unit, p.stock as current_stock
      FROM stock_mutations sm
      JOIN products p ON sm.product_id = p.id
      WHERE 1=1
    `;
    const params = [];

    if (product_id) {
      query += ' AND sm.product_id = ?';
      params.push(product_id);
    }

    if (type && type !== 'Semua') {
      query += ' AND sm.type = ?';
      params.push(type);
    }

    if (reason && reason !== 'Semua') {
      query += ' AND sm.reason = ?';
      params.push(reason);
    }

    if (start_date && end_date) {
      query += ' AND sm.date BETWEEN ? AND ?';
      params.push(start_date, end_date);
    } else if (start_date) {
      query += ' AND sm.date = ?';
      params.push(start_date);
    }

    if (q) {
      query += ' AND (p.name LIKE ? OR sm.reference_no LIKE ? OR sm.notes LIKE ?)';
      const term = `%${q.trim()}%`;
      params.push(term, term, term);
    }

    query += ' ORDER BY sm.id DESC LIMIT ?';
    params.push(Number(limit) || 200);

    const mutations = db.prepare(query).all(...params);
    res.json({ success: true, data: mutations });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// CREATE manual stock mutation (Barang Masuk / Keluar Manual / Stock Opname)
router.post('/', (req, res) => {
  try {
    const {
      product_id,
      type, // 'MASUK' atau 'KELUAR'
      reason = 'PENYESUAIAN', // 'RUSAK', 'HILANG', 'BONUS', 'KADALUARSA', 'PENYESUAIAN', 'LAINNYA'
      qty,
      notes = '',
      date
    } = req.body;

    if (!product_id) {
      return res.status(400).json({ success: false, message: 'Produk harus dipilih.' });
    }

    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(product_id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Produk tidak ditemukan.' });
    }

    const amount = Number(qty);
    if (isNaN(amount) || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Jumlah barang harus lebih dari 0.' });
    }

    const mutationType = (type === 'MASUK') ? 'MASUK' : 'KELUAR';
    const effectiveDate = date || new Date().toISOString().split('T')[0];

    const stockBefore = product.stock;
    const stockAfter = mutationType === 'MASUK' ? stockBefore + amount : stockBefore - amount;

    const mutateTx = db.transaction(() => {
      // 1. Update product stock
      db.prepare('UPDATE products SET stock = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(stockAfter, product.id);

      // 2. Insert mutation record
      const info = db.prepare(`
        INSERT INTO stock_mutations (
          product_id, type, reason, qty, stock_before, stock_after,
          cost_price, reference_no, notes, date
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'MANUAL', ?, ?)
      `).run(
        product.id,
        mutationType,
        reason,
        amount,
        stockBefore,
        stockAfter,
        product.cost_price,
        notes || `Penyesuaian manual (${mutationType} - ${reason})`,
        effectiveDate
      );

      return info.lastInsertRowid;
    });

    const mutationId = mutateTx();

    res.status(201).json({
      success: true,
      message: `Berhasil mencatat mutasi ${mutationType} sebesar ${amount} ${product.unit} untuk ${product.name}.`,
      data: {
        id: mutationId,
        product_id: product.id,
        stock_before: stockBefore,
        stock_after: stockAfter
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// UPDATE mutation notes / reason / date
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { reason, notes, date } = req.body;

    const mutation = db.prepare('SELECT * FROM stock_mutations WHERE id = ?').get(id);
    if (!mutation) {
      return res.status(404).json({ success: false, message: 'Data mutasi tidak ditemukan.' });
    }

    db.prepare(`
      UPDATE stock_mutations SET
        reason = COALESCE(?, reason),
        notes = COALESCE(?, notes),
        date = COALESCE(?, date)
      WHERE id = ?
    `).run(reason, notes, date, id);

    const updated = db.prepare('SELECT * FROM stock_mutations WHERE id = ?').get(id);
    res.json({ success: true, message: 'Data mutasi berhasil diperbarui.', data: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// EXPORT mutations to Excel
router.get('/export/excel', (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    let query = `
      SELECT sm.*, p.name as product_name, p.barcode, p.unit
      FROM stock_mutations sm
      JOIN products p ON sm.product_id = p.id
      WHERE 1=1
    `;
    const params = [];
    if (start_date && end_date) {
      query += ' AND sm.date BETWEEN ? AND ?';
      params.push(start_date, end_date);
    }
    query += ' ORDER BY sm.id DESC';

    const list = db.prepare(query).all(...params);

    const rows = list.map(m => ({
      'Tanggal': m.date,
      'Kode/Barcode': m.barcode || '',
      'Nama Barang': m.product_name,
      'Tipe Mutasi': m.type,
      'Kategori/Alasan': m.reason,
      'Jumlah (Qty)': m.qty,
      'Satuan': m.unit,
      'Stok Sebelum': m.stock_before,
      'Stok Sesudah': m.stock_after,
      'Modal saat Mutasi': m.cost_price,
      'No Referensi': m.reference_no || '',
      'Keterangan / Catatan': m.notes || ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Mutasi Stok');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', 'attachment; filename="Riwayat_Mutasi_Stok.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
