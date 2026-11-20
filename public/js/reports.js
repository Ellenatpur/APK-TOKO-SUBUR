// Rekap Laba Rugi & Laporan Penjualan (Harian, Mingguan, Bulanan, Tahunan)
const ReportsManager = {
  currentPeriod: 'monthly',
  chartInstance: null,
  currentReportData: null,

  init() {
    this.setupEventListeners();
    this.initDefaultDates();
  },

  initDefaultDates() {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');

    // Default inputs
    const dailyInput = document.getElementById('report-daily-date');
    if (dailyInput) dailyInput.value = `${yyyy}-${mm}-${dd}`;

    const weeklyInput = document.getElementById('report-weekly-date');
    if (weeklyInput) weeklyInput.value = `${yyyy}-${mm}-${dd}`;

    const monthlyInput = document.getElementById('report-monthly-month');
    if (monthlyInput) monthlyInput.value = `${yyyy}-${mm}`;

    const yearlyInput = document.getElementById('report-yearly-year');
    if (yearlyInput) yearlyInput.value = `${yyyy}`;

    const customStart = document.getElementById('report-custom-start');
    if (customStart) customStart.value = `${yyyy}-${mm}-01`;

    const customEnd = document.getElementById('report-custom-end');
    if (customEnd) customEnd.value = `${yyyy}-${mm}-${dd}`;
  },

  setupEventListeners() {
    // Period tab buttons
    const periodButtons = document.querySelectorAll('.report-period-btn');
    periodButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const period = btn.getAttribute('data-period');
        this.selectPeriod(period);
      });
    });

    // Inputs change listener to reload report automatically
    ['report-daily-date', 'report-weekly-date', 'report-monthly-month', 'report-yearly-year', 'report-custom-start', 'report-custom-end'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', () => this.loadRecap());
    });

    // Export Excel button
    const exportBtn = document.getElementById('btn-export-excel-report');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => this.exportExcel());
    }

    // Print report button
    const printBtn = document.getElementById('btn-print-report');
    if (printBtn) {
      printBtn.addEventListener('click', () => window.print());
    }
  },

  selectPeriod(period) {
    this.currentPeriod = period;

    // Update button styles
    document.querySelectorAll('.report-period-btn').forEach(btn => {
      if (btn.getAttribute('data-period') === period) {
        btn.classList.add('bg-blue-600', 'text-white');
        btn.classList.remove('bg-gray-100', 'text-gray-700');
      } else {
        btn.classList.remove('bg-blue-600', 'text-white');
        btn.classList.add('bg-gray-100', 'text-gray-700');
      }
    });

    // Show relevant date picker input container
    ['daily', 'weekly', 'monthly', 'yearly', 'custom'].forEach(p => {
      const container = document.getElementById(`picker-${p}`);
      if (container) {
        if (p === period) container.classList.remove('hidden');
        else container.classList.add('hidden');
      }
    });

    this.loadRecap();
  },

  async loadRecap() {
    let url = `/api/reports/recap?type=${this.currentPeriod}`;

    if (this.currentPeriod === 'daily') {
      const date = document.getElementById('report-daily-date')?.value;
      if (date) url += `&date=${encodeURIComponent(date)}`;
    } else if (this.currentPeriod === 'weekly') {
      const date = document.getElementById('report-weekly-date')?.value;
      if (date) url += `&date=${encodeURIComponent(date)}`;
    } else if (this.currentPeriod === 'monthly') {
      const month = document.getElementById('report-monthly-month')?.value;
      if (month) url += `&month=${encodeURIComponent(month)}`;
    } else if (this.currentPeriod === 'yearly') {
      const year = document.getElementById('report-yearly-year')?.value;
      if (year) url += `&year=${encodeURIComponent(year)}`;
    } else if (this.currentPeriod === 'custom') {
      const s = document.getElementById('report-custom-start')?.value;
      const e = document.getElementById('report-custom-end')?.value;
      if (s) url += `&start_date=${encodeURIComponent(s)}`;
      if (e) url += `&end_date=${encodeURIComponent(e)}`;
    }

    try {
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        this.currentReportData = data;
        this.renderRecap(data);
      }
    } catch (err) {
      console.error('Error loading recap report:', err);
    }
  },

  renderRecap(data) {
    const { title, summary, tier_breakdown, timeline, top_products } = data;

    // 1. Title badge
    const titleElem = document.getElementById('report-display-title');
    if (titleElem) titleElem.textContent = title;

    // 2. Summary KPI cards
    const revenueElem = document.getElementById('rep-revenue');
    if (revenueElem) revenueElem.textContent = App.formatRupiah(summary.net_revenue);

    const costElem = document.getElementById('rep-cost');
    if (costElem) costElem.textContent = App.formatRupiah(summary.total_cost);

    const profitElem = document.getElementById('rep-profit');
    if (profitElem) {
      profitElem.textContent = (summary.total_profit >= 0 ? '+' : '') + App.formatRupiah(summary.total_profit);
      profitElem.className = summary.total_profit >= 0 ? 'text-2xl font-black text-green-600' : 'text-2xl font-black text-red-600';
    }

    const marginElem = document.getElementById('rep-margin');
    if (marginElem) marginElem.textContent = `${summary.profit_margin}% Margin Laba`;

    const transCountElem = document.getElementById('rep-transactions');
    if (transCountElem) transCountElem.textContent = `${summary.total_sales} Transaksi (${summary.total_items_sold} barang)`;

    const purchaseElem = document.getElementById('rep-purchases');
    if (purchaseElem) purchaseElem.textContent = App.formatRupiah(summary.purchases_amount);

    // 3. Price Tier Breakdown (Eceran vs Grosir)
    this.renderTierBreakdown(tier_breakdown);

    // 4. Chart Visualization
    this.renderChart(timeline);

    // 5. Timeline Breakdown Table
    this.renderTimelineTable(timeline);

    // 6. Top Selling Products
    this.renderTopProducts(top_products);
  },

  renderTierBreakdown(tiers) {
    const container = document.getElementById('rep-tier-container');
    if (!container) return;

    if (!tiers || tiers.length === 0) {
      container.innerHTML = '<div class="p-3 text-xs text-gray-500 text-center">Belum ada penjualan pada periode ini.</div>';
      return;
    }

    container.innerHTML = tiers.map(t => {
      const isGrosir = t.price_type === 'GROSIR';
      const badgeBg = isGrosir ? 'bg-purple-100 text-purple-800 border-purple-200' : 'bg-blue-100 text-blue-800 border-blue-200';
      const margin = t.revenue > 0 ? ((t.profit / t.revenue) * 100).toFixed(1) : 0;

      return `
        <div class="p-3 bg-gray-50 rounded-lg border border-gray-200">
          <div class="flex items-center justify-between mb-2">
            <span class="px-2.5 py-0.5 text-xs font-bold rounded border ${badgeBg}">
              PENJUALAN ${t.price_type}
            </span>
            <span class="text-xs text-gray-500 font-medium">${t.total_qty} Barang Terjual</span>
          </div>
          <div class="grid grid-cols-3 gap-2 text-xs">
            <div>
              <div class="text-gray-500">Omset:</div>
              <div class="font-bold text-gray-800">${App.formatRupiah(t.revenue)}</div>
            </div>
            <div>
              <div class="text-gray-500">Modal:</div>
              <div class="font-bold text-gray-600">${App.formatRupiah(t.cost)}</div>
            </div>
            <div>
              <div class="text-gray-500">Laba Bersih:</div>
              <div class="font-bold text-green-600">+${App.formatRupiah(t.profit)} (${margin}%)</div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  },

  renderChart(timeline) {
    const canvas = document.getElementById('report-chart');
    if (!canvas) return;

    if (this.chartInstance) {
      this.chartInstance.destroy();
      this.chartInstance = null;
    }

    if (!timeline || timeline.length === 0) {
      return;
    }

    const labels = timeline.map(t => t.period);
    const revenues = timeline.map(t => t.revenue);
    const costs = timeline.map(t => t.cost);
    const profits = timeline.map(t => t.profit);

    const ctx = canvas.getContext('2d');
    this.chartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Penjualan (Omset)',
            data: revenues,
            backgroundColor: 'rgba(59, 130, 246, 0.7)',
            borderColor: '#3b82f6',
            borderWidth: 1
          },
          {
            label: 'Modal (HPP)',
            data: costs,
            backgroundColor: 'rgba(156, 163, 175, 0.7)',
            borderColor: '#9ca3af',
            borderWidth: 1
          },
          {
            label: 'Keuntungan Bersih (Laba)',
            data: profits,
            backgroundColor: 'rgba(16, 185, 129, 0.85)',
            borderColor: '#10b981',
            borderWidth: 1
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top' },
          tooltip: {
            callbacks: {
              label: (context) => `${context.dataset.label}: ${App.formatRupiah(context.raw)}`
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: (val) => App.formatRupiah(val)
            }
          }
        }
      }
    });
  },

  renderTimelineTable(timeline) {
    const tbody = document.getElementById('rep-timeline-tbody');
    if (!tbody) return;

    if (!timeline || timeline.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="py-4 text-center text-xs text-gray-500">Tidak ada data untuk ditampilkan.</td></tr>';
      return;
    }

    tbody.innerHTML = timeline.map(row => {
      const margin = row.revenue > 0 ? ((row.profit / row.revenue) * 100).toFixed(1) : 0;
      return `
        <tr class="border-b border-gray-100 text-xs hover:bg-gray-50">
          <td class="py-2 px-3 font-semibold text-gray-800">${row.period}</td>
          <td class="py-2 px-3 text-center">${row.sales_count}</td>
          <td class="py-2 px-3 text-right font-medium text-gray-800">${App.formatRupiah(row.revenue)}</td>
          <td class="py-2 px-3 text-right text-gray-600">${App.formatRupiah(row.cost)}</td>
          <td class="py-2 px-3 text-right font-bold text-green-600">
            +${App.formatRupiah(row.profit)} <span class="text-[10px] text-gray-500">(${margin}%)</span>
          </td>
        </tr>
      `;
    }).join('');
  },

  renderTopProducts(topList) {
    const tbody = document.getElementById('rep-top-products-tbody');
    if (!tbody) return;

    if (!topList || topList.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="py-4 text-center text-xs text-gray-500">Belum ada penjualan.</td></tr>';
      return;
    }

    tbody.innerHTML = topList.map((item, idx) => {
      const margin = item.total_revenue > 0 ? ((item.total_profit / item.total_revenue) * 100).toFixed(1) : 0;
      return `
        <tr class="border-b border-gray-100 text-xs hover:bg-gray-50">
          <td class="py-2 px-2 text-center font-bold text-gray-500">${idx + 1}</td>
          <td class="py-2 px-3">
            <div class="font-bold text-gray-800">${item.product_name}</div>
            <div class="text-[10px] text-gray-500">${item.category || ''}</div>
          </td>
          <td class="py-2 px-3 text-center font-semibold text-gray-700">${item.total_qty} ${item.unit || ''}</td>
          <td class="py-2 px-3 text-right font-medium">${App.formatRupiah(item.total_revenue)}</td>
          <td class="py-2 px-3 text-right font-bold text-green-600">
            +${App.formatRupiah(item.total_profit)} <span class="text-[10px] text-gray-500">(${margin}%)</span>
          </td>
        </tr>
      `;
    }).join('');
  },

  exportExcel() {
    let url = `/api/reports/export-excel?type=${this.currentPeriod}`;
    if (this.currentPeriod === 'daily') {
      const d = document.getElementById('report-daily-date')?.value;
      if (d) url += `&date=${encodeURIComponent(d)}`;
    } else if (this.currentPeriod === 'weekly') {
      const d = document.getElementById('report-weekly-date')?.value;
      if (d) url += `&date=${encodeURIComponent(d)}`;
    } else if (this.currentPeriod === 'monthly') {
      const m = document.getElementById('report-monthly-month')?.value;
      if (m) url += `&month=${encodeURIComponent(m)}`;
    } else if (this.currentPeriod === 'yearly') {
      const y = document.getElementById('report-yearly-year')?.value;
      if (y) url += `&year=${encodeURIComponent(y)}`;
    } else if (this.currentPeriod === 'custom') {
      const s = document.getElementById('report-custom-start')?.value;
      const e = document.getElementById('report-custom-end')?.value;
      if (s) url += `&start_date=${encodeURIComponent(s)}`;
      if (e) url += `&end_date=${encodeURIComponent(e)}`;
    }

    window.open(url, '_blank');
  }
};

window.ReportsManager = ReportsManager;
