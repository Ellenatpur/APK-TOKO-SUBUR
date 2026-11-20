const express = require('express');
const router = express.Router();
const db = require('../database');
const XLSX = require('xlsx');

// Helper to get start and end dates based on recap type
function getDateRange(type, params) {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const todayStr = `${yyyy}-${mm}-${dd}`;

  let startDate = todayStr;
  let endDate = todayStr;
  let title = 'Hari Ini';

  if (type === 'today') {
    startDate = todayStr;
    endDate = todayStr;
    title = `Harian (${todayStr})`;
  } else if (type === 'daily') {
    startDate = params.date || todayStr;
    endDate = params.date || todayStr;
    title = `Harian (${startDate})`;
  } else if (type === 'weekly') {
    // Current week (Monday to Sunday) or selected week
    const targetDate = params.date ? new Date(params.date) : new Date();
    const day = targetDate.getDay();
    const diffToMonday = targetDate.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(targetDate.setDate(diffToMonday));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const formatYMD = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    startDate = formatYMD(monday);
    endDate = formatYMD(sunday);
    title = `Mingguan (${startDate} s/d ${endDate})`;
  } else if (type === 'monthly') {
    const selectedMonth = params.month || `${yyyy}-${mm}`;
    const [y, m] = selectedMonth.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    startDate = `${selectedMonth}-01`;
    endDate = `${selectedMonth}-${String(lastDay).padStart(2, '0')}`;
    const monthNames = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    title = `Bulanan (${monthNames[m]} ${y})`;
  } else if (type === 'yearly') {
    const selectedYear = params.year || String(yyyy);
    startDate = `${selectedYear}-01-01`;
    endDate = `${selectedYear}-12-31`;
    title = `Tahunan (${selectedYear})`;
  } else if (type === 'custom') {
    startDate = params.start_date || todayStr;
    endDate = params.end_date || todayStr;
    title = `Periode (${startDate} s/d ${endDate})`;
  }

  return { startDate, endDate, title };
}

// GET Financial & Profit Recap Summary
router.get('/recap', (req, res) => {
  try {
    const { type = 'today' } = req.query;
    const { startDate, endDate, title } = getDateRange(type, req.query);

    // 1. Overall Sales Metrics
    const salesSummary = db.prepare(`
      SELECT 
        COUNT(*) as total_sales,
        COALESCE(SUM(total_selling), 0) as gross_revenue,
        COALESCE(SUM(discount), 0) as total_discount,
        COALESCE(SUM(grand_total), 0) as net_revenue,
        COALESCE(SUM(total_cost), 0) as total_cost,
        COALESCE(SUM(profit), 0) as total_profit
      FROM sales
      WHERE date BETWEEN ? AND ?
    `).get(startDate, endDate);

    // 2. Total items sold count
    const itemsCountRow = db.prepare(`
      SELECT COALESCE(SUM(si.qty), 0) as total_items_sold
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      WHERE s.date BETWEEN ? AND ?
    `).get(startDate, endDate);

    const totalItemsSold = itemsCountRow.total_items_sold;
    const netRevenue = salesSummary.net_revenue;
    const totalCost = salesSummary.total_cost;
    const totalProfit = salesSummary.total_profit;
    const profitMargin = netRevenue > 0 ? (totalProfit / netRevenue) * 100 : 0;

    // 3. Breakdown by Price Tier (Eceran vs Grosir)
    const tierBreakdown = db.prepare(`
      SELECT 
        si.price_type,
        COUNT(DISTINCT si.sale_id) as transaction_count,
        COALESCE(SUM(si.qty), 0) as total_qty,
        COALESCE(SUM(si.subtotal_selling), 0) as revenue,
        COALESCE(SUM(si.subtotal_cost), 0) as cost,
        COALESCE(SUM(si.profit), 0) as profit
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      WHERE s.date BETWEEN ? AND ?
      GROUP BY si.price_type
    `).all(startDate, endDate);

    // 4. Breakdown by Timeline (for Charts & Tables)
    let timelineBreakdown = [];
    if (type === 'yearly') {
      // Group by month
      timelineBreakdown = db.prepare(`
        SELECT 
          strftime('%Y-%m', date) as period,
          COUNT(*) as sales_count,
          COALESCE(SUM(grand_total), 0) as revenue,
          COALESCE(SUM(total_cost), 0) as cost,
          COALESCE(SUM(profit), 0) as profit
        FROM sales
        WHERE date BETWEEN ? AND ?
        GROUP BY period
        ORDER BY period ASC
      `).all(startDate, endDate);
    } else {
      // Group by date
      timelineBreakdown = db.prepare(`
        SELECT 
          date as period,
          COUNT(*) as sales_count,
          COALESCE(SUM(grand_total), 0) as revenue,
          COALESCE(SUM(total_cost), 0) as cost,
          COALESCE(SUM(profit), 0) as profit
        FROM sales
        WHERE date BETWEEN ? AND ?
        GROUP BY date
        ORDER BY date ASC
      `).all(startDate, endDate);
    }

    // 5. Top 10 Best Selling Products with Profits
    const topProducts = db.prepare(`
      SELECT 
        si.product_id,
        si.product_name,
        p.unit,
        p.category,
        COALESCE(SUM(si.qty), 0) as total_qty,
        COALESCE(SUM(si.subtotal_selling), 0) as total_revenue,
        COALESCE(SUM(si.subtotal_cost), 0) as total_cost,
        COALESCE(SUM(si.profit), 0) as total_profit
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      LEFT JOIN products p ON si.product_id = p.id
      WHERE s.date BETWEEN ? AND ?
      GROUP BY si.product_id, si.product_name
      ORDER BY total_profit DESC
      LIMIT 10
    `).all(startDate, endDate);

    // 6. Purchases / Restock in the same period
    const purchaseSummary = db.prepare(`
      SELECT 
        COUNT(*) as total_purchases,
        COALESCE(SUM(total_amount), 0) as total_purchase_amount
      FROM purchases
      WHERE date BETWEEN ? AND ?
    `).get(startDate, endDate);

    res.json({
      success: true,
      title,
      period_type: type,
      start_date: startDate,
      end_date: endDate,
      summary: {
        total_sales: salesSummary.total_sales,
        total_items_sold: totalItemsSold,
        gross_revenue: salesSummary.gross_revenue,
        total_discount: salesSummary.total_discount,
        net_revenue: netRevenue,
        total_cost: totalCost,
        total_profit: totalProfit,
        profit_margin: profitMargin.toFixed(1),
        purchases_count: purchaseSummary.total_purchases,
        purchases_amount: purchaseSummary.total_purchase_amount
      },
      tier_breakdown: tierBreakdown,
      timeline: timelineBreakdown,
      top_products: topProducts
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// EXPORT Comprehensive Report to Excel
router.get('/export-excel', (req, res) => {
  try {
    const { type = 'monthly' } = req.query;
    const { startDate, endDate, title } = getDateRange(type, req.query);

    // 1. Sheet Ringkasan KPI
    const salesSummary = db.prepare(`
      SELECT 
        COUNT(*) as total_sales,
        COALESCE(SUM(grand_total), 0) as net_revenue,
        COALESCE(SUM(total_cost), 0) as total_cost,
        COALESCE(SUM(profit), 0) as total_profit
      FROM sales
      WHERE date BETWEEN ? AND ?
    `).get(startDate, endDate);

    const summaryRows = [
      { 'Indikator Laporan': 'Judul Laporan', 'Nilai': title },
      { 'Indikator Laporan': 'Rentang Tanggal', 'Nilai': `${startDate} s/d ${endDate}` },
      { 'Indikator Laporan': 'Total Transaksi', 'Nilai': salesSummary.total_sales },
      { 'Indikator Laporan': 'Total Omset (Penjualan)', 'Nilai': salesSummary.net_revenue },
      { 'Indikator Laporan': 'Total Modal (HPP)', 'Nilai': salesSummary.total_cost },
      { 'Indikator Laporan': 'Total Keuntungan Bersih (Laba)', 'Nilai': salesSummary.total_profit },
      { 'Indikator Laporan': 'Margin Keuntungan', 'Nilai': salesSummary.net_revenue > 0 ? `${((salesSummary.total_profit / salesSummary.net_revenue) * 100).toFixed(2)}%` : '0%' }
    ];

    // 2. Sheet Rincian Transaksi
    const transactions = db.prepare(`
      SELECT invoice_no, date, customer_name, payment_method, total_selling, discount, grand_total, total_cost, profit
      FROM sales
      WHERE date BETWEEN ? AND ?
      ORDER BY date ASC, id ASC
    `).all(startDate, endDate);

    const transactionRows = transactions.map(t => ({
      'No. Nota': t.invoice_no,
      'Tanggal': t.date,
      'Pelanggan': t.customer_name,
      'Metode Bayar': t.payment_method,
      'Subtotal Jual': t.total_selling,
      'Diskon': t.discount,
      'Total Penjualan (Omset)': t.grand_total,
      'Total Modal (HPP)': t.total_cost,
      'Keuntungan (Laba Bersih)': t.profit
    }));

    // 3. Sheet Rincian Item Terjual & Laba per Item
    const items = db.prepare(`
      SELECT 
        s.date,
        s.invoice_no,
        si.product_name,
        si.price_type,
        si.qty,
        si.cost_price,
        si.selling_price,
        si.subtotal_cost,
        si.subtotal_selling,
        si.profit
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      WHERE s.date BETWEEN ? AND ?
      ORDER BY s.date ASC, s.id ASC
    `).all(startDate, endDate);

    const itemRows = items.map(i => ({
      'Tanggal': i.date,
      'No. Faktur': i.invoice_no,
      'Nama Produk': i.product_name,
      'Tipe Harga': i.price_type,
      'Jumlah (Qty)': i.qty,
      'Modal / Item': i.cost_price,
      'Harga Jual / Item': i.selling_price,
      'Total Modal': i.subtotal_cost,
      'Total Penjualan': i.subtotal_selling,
      'Keuntungan / Laba': i.profit
    }));

    const workbook = XLSX.utils.book_new();

    const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
    XLSX.utils.book_append_sheet(workbook, wsSummary, 'Ringkasan Laba');

    const wsTransactions = XLSX.utils.json_to_sheet(transactionRows);
    XLSX.utils.book_append_sheet(workbook, wsTransactions, 'Daftar Penjualan');

    const wsItems = XLSX.utils.json_to_sheet(itemRows);
    XLSX.utils.book_append_sheet(workbook, wsItems, 'Detail Item & Laba');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', `attachment; filename="Laporan_Laba_Rugi_${startDate}_${endDate}.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
