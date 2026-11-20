const express = require('express');
const router = express.Router();
const db = require('../database');
const { formatProductStock } = require('../database');

// Helper to generate Purchase Invoice No: PB-YYYYMMDD-0001
function generatePurchaseNo() {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const datePrefix = `PB-${yyyy}${mm}${dd}`;

  const lastPurchase = db.prepare('SELECT invoice_no FROM purchases WHERE invoice_no LIKE ? ORDER BY id DESC LIMIT 1')
    .get(`${datePrefix}-%`);

  let nextSeq = 1;
  if (lastPurchase && lastPurchase.invoice_no) {
    const parts = lastPurchase.invoice_no.split('-');
    if (parts.length === 3) {
      const seq = parseInt(parts[2], 10);
      if (!isNaN(seq)) nextSeq = seq + 1;
    }
  }

  return `${datePrefix}-${String(nextSeq).padStart(4, '0')}`;
}

// GET all purchases
router.get('/', (req, res) => {
  try {
    const { start_date, end_date, supplier } = req.query;
    let query = 'SELECT * FROM purchases WHERE 1=1';
    const params = [];

    if (start_date && end_date) {
      query += ' AND date BETWEEN ? AND ?';
      params.push(start_date, end_date);
    } else if (start_date) {
      query += ' AND date = ?';
      params.push(start_date);
    }

    if (supplier) {
      query += ' AND supplier LIKE ?';
      params.push(`%${supplier.trim()}%`);
    }

    query += ' ORDER BY id DESC LIMIT 100';
    const purchases = db.prepare(query).all(...params);

    res.json({ success: true, data: purchases });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET single purchase with items
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const purchase = db.prepare('SELECT * FROM purchases WHERE id = ?').get(id);
    if (!purchase) {
      return res.status(404).json({ success: false, message: 'Data pembelian tidak ditemukan.' });
    }

    const items = db.prepare(`
      SELECT pi.*, p.unit_large, p.unit_small, p.conversion_qty
      FROM purchase_items pi
      LEFT JOIN products p ON pi.product_id = p.id
      WHERE pi.purchase_id = ?
    `).all(id);

    res.json({ success: true, data: { ...purchase, items } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// CREATE purchase (Catat Pembelian / Restok / Kulakan Baru)
router.post('/', (req, res) => {
  try {
    const {
      invoice_no,
      supplier = 'Supplier Umum',
      date,
      notes = '',
      items // [{ product_id, qty, purchased_unit: 'Dus' | 'Biji', cost_price, update_product_cost }]
    } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Daftar barang pembelian tidak boleh kosong.' });
    }

    const effectiveInvoiceNo = (invoice_no && invoice_no.trim() !== '') ? invoice_no.trim() : generatePurchaseNo();
    const effectiveDate = date || new Date().toISOString().split('T')[0];

    const purchaseTx = db.transaction(() => {
      let totalAmount = 0;
      const processedItems = [];

      for (const item of items) {
        const product = db.prepare('SELECT * FROM products WHERE id = ?').get(item.product_id);
        if (!product) {
          throw new Error(`Produk dengan ID ${item.product_id} tidak ditemukan.`);
        }

        const qty = Number(item.qty) || 1;
        const conv = Math.max(1, Number(product.conversion_qty) || 1);
        const unitPurchased = (item.purchased_unit && item.purchased_unit.toLowerCase() === (product.unit_large || '').toLowerCase())
          ? product.unit_large
          : product.unit_small;

        const isLargeUnit = unitPurchased === product.unit_large && conv > 1;
        const qtySmall = isLargeUnit ? qty * conv : qty;

        const newCostPrice = Number(item.cost_price);
        if (isNaN(newCostPrice) || newCostPrice < 0) {
          throw new Error(`Modal / harga beli untuk ${product.name} tidak valid.`);
        }

        const subtotal = qty * newCostPrice;
        totalAmount += subtotal;

        let newCostLarge = product.cost_price_large;
        let newCostSmall = product.cost_price;

        if (isLargeUnit) {
          newCostLarge = newCostPrice;
          newCostSmall = Math.round(newCostPrice / conv);
        } else {
          newCostSmall = newCostPrice;
          newCostLarge = Math.round(newCostPrice * conv);
        }

        processedItems.push({
          product_id: product.id,
          product_name: product.name,
          qty,
          unit_purchased: unitPurchased,
          qty_small: qtySmall,
          cost_price: newCostPrice,
          new_cost_large: newCostLarge,
          new_cost_small: newCostSmall,
          subtotal,
          update_product_cost: item.update_product_cost !== false,
          previous_stock: product.stock,
          new_stock: product.stock + qtySmall
        });
      }

      // 1. Insert into purchases
      const info = db.prepare(`
        INSERT INTO purchases (invoice_no, supplier, total_amount, notes, date)
        VALUES (?, ?, ?, ?, ?)
      `).run(effectiveInvoiceNo, supplier.trim() || 'Supplier Umum', totalAmount, notes, effectiveDate);

      const purchaseId = info.lastInsertRowid;

      // 2. Insert items & update product stock & costs
      const insertItem = db.prepare(`
        INSERT INTO purchase_items (purchase_id, product_id, product_name, qty, unit_purchased, qty_small, cost_price, subtotal)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const updateStockAndCost = db.prepare(`
        UPDATE products SET stock = stock + ?, cost_price_large = ?, cost_price = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `);

      const updateStockOnly = db.prepare(`
        UPDATE products SET stock = stock + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `);

      const insertMutation = db.prepare(`
        INSERT INTO stock_mutations (
          product_id, type, reason, qty, qty_display, stock_before, stock_after,
          cost_price, reference_no, notes, date
        ) VALUES (?, 'MASUK', 'PEMBELIAN', ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const pItem of processedItems) {
        insertItem.run(
          purchaseId,
          pItem.product_id,
          pItem.product_name,
          pItem.qty,
          pItem.unit_purchased,
          pItem.qty_small,
          pItem.cost_price,
          pItem.subtotal
        );

        if (pItem.update_product_cost) {
          updateStockAndCost.run(pItem.qty_small, pItem.new_cost_large, pItem.new_cost_small, pItem.product_id);
        } else {
          updateStockOnly.run(pItem.qty_small, pItem.product_id);
        }

        const qtyDisplay = `+${pItem.qty} ${pItem.unit_purchased}`;
        insertMutation.run(
          pItem.product_id,
          pItem.qty_small,
          qtyDisplay,
          pItem.previous_stock,
          pItem.new_stock,
          pItem.cost_price,
          effectiveInvoiceNo,
          `Pembelian dari ${supplier}`,
          effectiveDate
        );
      }

      return {
        id: purchaseId,
        invoice_no: effectiveInvoiceNo,
        supplier,
        total_amount: totalAmount,
        notes,
        date: effectiveDate,
        items: processedItems
      };
    });

    const result = purchaseTx();
    res.status(201).json({
      success: true,
      message: `Pembelian ${result.invoice_no} berhasil dicatat. Stok dan modal barang telah diperbarui.`,
      data: result
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// DELETE purchase
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const purchase = db.prepare('SELECT * FROM purchases WHERE id = ?').get(id);
    if (!purchase) {
      return res.status(404).json({ success: false, message: 'Data pembelian tidak ditemukan.' });
    }

    const items = db.prepare('SELECT * FROM purchase_items WHERE purchase_id = ?').all(id);
    const today = new Date().toISOString().split('T')[0];

    const deleteTx = db.transaction(() => {
      for (const item of items) {
        const product = db.prepare('SELECT * FROM products WHERE id = ?').get(item.product_id);
        if (product) {
          const qtyToDeduct = Number(item.qty_small) || Number(item.qty);
          const newStock = Math.max(0, product.stock - qtyToDeduct);
          db.prepare('UPDATE products SET stock = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run(newStock, item.product_id);

          db.prepare(`
            INSERT INTO stock_mutations (product_id, type, reason, qty, qty_display, stock_before, stock_after, cost_price, reference_no, notes, date)
            VALUES (?, 'KELUAR', 'PENYESUAIAN', ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            item.product_id,
            qtyToDeduct,
            `-${item.qty} ${item.unit_purchased}`,
            product.stock,
            newStock,
            product.cost_price,
            `BATAL-${purchase.invoice_no}`,
            `Pembatalan pembelian ${purchase.invoice_no}`,
            today
          );
        }
      }

      db.prepare('DELETE FROM purchase_items WHERE purchase_id = ?').run(id);
      db.prepare('DELETE FROM purchases WHERE id = ?').run(id);
    });

    deleteTx();

    res.json({ success: true, message: `Data pembelian ${purchase.invoice_no} berhasil dibatalkan.` });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
