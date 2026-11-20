const express = require('express');
const router = express.Router();
const db = require('../database');
const { formatProductStock } = require('../database');

// Helper to generate Invoice Number: TR-YYYYMMDD-0001
function generateInvoiceNo() {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const datePrefix = `TR-${yyyy}${mm}${dd}`;

  const lastSale = db.prepare('SELECT invoice_no FROM sales WHERE invoice_no LIKE ? ORDER BY id DESC LIMIT 1')
    .get(`${datePrefix}-%`);

  let nextSeq = 1;
  if (lastSale && lastSale.invoice_no) {
    const parts = lastSale.invoice_no.split('-');
    if (parts.length === 3) {
      const seq = parseInt(parts[2], 10);
      if (!isNaN(seq)) nextSeq = seq + 1;
    }
  }

  return `${datePrefix}-${String(nextSeq).padStart(4, '0')}`;
}

// GET all sales with filters
router.get('/', (req, res) => {
  try {
    const { start_date, end_date, q, limit = 100 } = req.query;
    let query = 'SELECT * FROM sales WHERE 1=1';
    const params = [];

    if (start_date && end_date) {
      query += ' AND date BETWEEN ? AND ?';
      params.push(start_date, end_date);
    } else if (start_date) {
      query += ' AND date = ?';
      params.push(start_date);
    }

    if (q) {
      query += ' AND (invoice_no LIKE ? OR customer_name LIKE ?)';
      const term = `%${q.trim()}%`;
      params.push(term, term);
    }

    query += ' ORDER BY id DESC LIMIT ?';
    params.push(Number(limit) || 100);

    const sales = db.prepare(query).all(...params);
    res.json({ success: true, data: sales });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET sale details by ID or Invoice No
router.get('/:idOrInvoice', (req, res) => {
  try {
    const { idOrInvoice } = req.params;
    let sale;
    if (!isNaN(idOrInvoice)) {
      sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(idOrInvoice);
    }
    if (!sale) {
      sale = db.prepare('SELECT * FROM sales WHERE invoice_no = ?').get(idOrInvoice);
    }

    if (!sale) {
      return res.status(404).json({ success: false, message: 'Transaksi tidak ditemukan.' });
    }

    const items = db.prepare(`
      SELECT si.*, p.unit_large, p.unit_small, p.conversion_qty
      FROM sale_items si
      LEFT JOIN products p ON si.product_id = p.id
      WHERE si.sale_id = ?
    `).all(sale.id);

    // Get store settings for receipt printing
    const settingsRows = db.prepare('SELECT key, value FROM settings').all();
    const settings = {};
    for (const r of settingsRows) settings[r.key] = r.value;

    res.json({
      success: true,
      data: {
        ...sale,
        items,
        store: settings
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// CREATE sale (Transaksi Penjualan Kasir dengan Satuan Dus/Pres/Box atau Biji)
router.post('/', (req, res) => {
  try {
    const {
      customer_name = 'Pelanggan Umum',
      items, // [{ product_id, qty, sold_unit: 'Dus' | 'Biji', selling_price }]
      discount = 0,
      payment_method = 'TUNAI',
      cash_paid = 0,
      notes = ''
    } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Keranjang belanja tidak boleh kosong.' });
    }

    const invoiceNo = generateInvoiceNo();
    const today = new Date().toISOString().split('T')[0];

    const createSaleTx = db.transaction(() => {
      let totalCost = 0;
      let totalSelling = 0;
      const processedItems = [];
      let hasEceran = false;
      let hasGrosir = false;

      for (const item of items) {
        const product = db.prepare('SELECT * FROM products WHERE id = ?').get(item.product_id);
        if (!product) {
          throw new Error(`Produk dengan ID ${item.product_id} tidak ditemukan.`);
        }

        const qty = Number(item.qty) || 1;
        const conv = Math.max(1, Number(product.conversion_qty) || 1);
        
        // Cek apakah menjual dalam kemasan besar (Dus/Pres/Box) atau Biji
        const isLargeUnit = (item.sold_unit && item.sold_unit.toLowerCase() === (product.unit_large || '').toLowerCase()) && conv > 1;
        const effectiveSoldUnit = isLargeUnit ? product.unit_large : product.unit_small;
        const priceType = isLargeUnit ? 'GROSIR' : 'ECERAN';

        if (priceType === 'ECERAN') hasEceran = true;
        if (priceType === 'GROSIR') hasGrosir = true;

        // Qty dalam satuan terkecil yang dipotong dari stok
        const qtySmall = isLargeUnit ? qty * conv : qty;

        // Modal per barang sesuai satuan yang dijual
        const costPrice = isLargeUnit ? product.cost_price_large : product.cost_price;

        // Harga jual
        let sellingPrice = Number(item.selling_price);
        if (isNaN(sellingPrice) || sellingPrice <= 0) {
          sellingPrice = isLargeUnit ? product.wholesale_price : product.retail_price;
        }

        const subtotalCost = costPrice * qty;
        const subtotalSelling = sellingPrice * qty;
        const itemProfit = subtotalSelling - subtotalCost;

        totalCost += subtotalCost;
        totalSelling += subtotalSelling;

        const previousStock = product.stock;
        const newStock = previousStock - qtySmall;

        processedItems.push({
          product_id: product.id,
          product_name: product.name,
          qty,
          sold_unit: effectiveSoldUnit,
          qty_small: qtySmall,
          cost_price: costPrice,
          selling_price: sellingPrice,
          price_type: priceType,
          subtotal_cost: subtotalCost,
          subtotal_selling: subtotalSelling,
          profit: itemProfit,
          previous_stock: previousStock,
          new_stock: newStock,
          unit_large: product.unit_large,
          unit_small: product.unit_small,
          conversion_qty: conv
        });
      }

      const disc = Math.max(0, Number(discount) || 0);
      const grandTotal = Math.max(0, totalSelling - disc);
      const netProfit = grandTotal - totalCost;
      const paid = Number(cash_paid) > 0 ? Number(cash_paid) : grandTotal;
      const change = Math.max(0, paid - grandTotal);

      let priceTier = 'CAMPUR';
      if (hasEceran && !hasGrosir) priceTier = 'ECERAN';
      if (!hasEceran && hasGrosir) priceTier = 'GROSIR';

      // 1. Insert into sales
      const saleInfo = db.prepare(`
        INSERT INTO sales (
          invoice_no, customer_name, price_tier, total_cost, total_selling,
          discount, grand_total, profit, payment_method, cash_paid,
          change_returned, notes, date
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        invoiceNo,
        customer_name.trim() || 'Pelanggan Umum',
        priceTier,
        totalCost,
        totalSelling,
        disc,
        grandTotal,
        netProfit,
        payment_method,
        paid,
        change,
        notes || '',
        today
      );

      const saleId = saleInfo.lastInsertRowid;

      // 2. Insert items & deduct stock
      const insertItem = db.prepare(`
        INSERT INTO sale_items (
          sale_id, product_id, product_name, qty, sold_unit, qty_small,
          cost_price, selling_price, price_type, subtotal_cost, subtotal_selling, profit
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const updateStock = db.prepare(`
        UPDATE products SET stock = stock - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `);

      const insertMutation = db.prepare(`
        INSERT INTO stock_mutations (
          product_id, type, reason, qty, qty_display, stock_before, stock_after,
          cost_price, reference_no, notes, date
        ) VALUES (?, 'KELUAR', 'PENJUALAN', ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const pItem of processedItems) {
        insertItem.run(
          saleId,
          pItem.product_id,
          pItem.product_name,
          pItem.qty,
          pItem.sold_unit,
          pItem.qty_small,
          pItem.cost_price,
          pItem.selling_price,
          pItem.price_type,
          pItem.subtotal_cost,
          pItem.subtotal_selling,
          pItem.profit
        );

        updateStock.run(pItem.qty_small, pItem.product_id);

        const qtyDisplay = `${pItem.qty} ${pItem.sold_unit}`;
        insertMutation.run(
          pItem.product_id,
          pItem.qty_small,
          qtyDisplay,
          pItem.previous_stock,
          pItem.new_stock,
          pItem.cost_price,
          invoiceNo,
          `Penjualan [${pItem.sold_unit}] ke ${customer_name}`,
          today
        );
      }

      return {
        id: saleId,
        invoice_no: invoiceNo,
        customer_name: customer_name.trim() || 'Pelanggan Umum',
        price_tier: priceTier,
        total_cost: totalCost,
        total_selling: totalSelling,
        discount: disc,
        grand_total: grandTotal,
        profit: netProfit,
        payment_method,
        cash_paid: paid,
        change_returned: change,
        notes,
        date: today,
        items: processedItems
      };
    });

    const result = createSaleTx();

    const settingsRows = db.prepare('SELECT key, value FROM settings').all();
    const settings = {};
    for (const r of settingsRows) settings[r.key] = r.value;

    res.status(201).json({
      success: true,
      message: 'Transaksi berhasil disimpan.',
      data: {
        ...result,
        store: settings
      }
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// VOID TRANSAKSI
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(id);
    if (!sale) {
      return res.status(404).json({ success: false, message: 'Transaksi tidak ditemukan.' });
    }

    const items = db.prepare('SELECT * FROM sale_items WHERE sale_id = ?').all(id);
    const today = new Date().toISOString().split('T')[0];

    const voidTx = db.transaction(() => {
      for (const item of items) {
        const product = db.prepare('SELECT * FROM products WHERE id = ?').get(item.product_id);
        if (product) {
          const qtyToRestore = Number(item.qty_small) || Number(item.qty);
          const newStock = product.stock + qtyToRestore;
          db.prepare('UPDATE products SET stock = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run(newStock, item.product_id);

          db.prepare(`
            INSERT INTO stock_mutations (
              product_id, type, reason, qty, qty_display, stock_before, stock_after,
              cost_price, reference_no, notes, date
            ) VALUES (?, 'MASUK', 'PENYESUAIAN', ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            item.product_id,
            qtyToRestore,
            `+${item.qty} ${item.sold_unit}`,
            product.stock,
            newStock,
            item.cost_price,
            `BATAL-${sale.invoice_no}`,
            `Pembatalan transaksi ${sale.invoice_no}`,
            today
          );
        }
      }

      db.prepare('DELETE FROM sale_items WHERE sale_id = ?').run(id);
      db.prepare('DELETE FROM sales WHERE id = ?').run(id);
    });

    voidTx();

    res.json({ success: true, message: `Transaksi ${sale.invoice_no} berhasil dibatalkan dan stok dikembalikan.` });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
