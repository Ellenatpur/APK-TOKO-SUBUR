// Riwayat Transaksi Penjualan & Cetak Ulang Struk
const SalesHistoryManager = {
  salesList: [],

  init() {
    this.setupEventListeners();
  },

  setupEventListeners() {
    const searchInput = document.getElementById('sales-hist-search');
    if (searchInput) {
      searchInput.addEventListener('input', () => this.loadSales());
    }

    const dateFilter = document.getElementById('sales-hist-date');
    if (dateFilter) {
      dateFilter.addEventListener('change', () => this.loadSales());
    }
  },

  async loadSales() {
    try {
      const q = document.getElementById('sales-hist-search')?.value.trim() || '';
      const date = document.getElementById('sales-hist-date')?.value || '';

      let url = `/api/sales?limit=200`;
      if (q) url += `&q=${encodeURIComponent(q)}`;
      if (date) url += `&start_date=${encodeURIComponent(date)}`;

      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        this.salesList = data.data;
        this.renderSalesTable();
      }
    } catch (err) {
      console.error('Error loading sales history:', err);
    }
  },

  renderSalesTable() {
    const tbody = document.getElementById('sales-hist-tbody');
    const emptyMsg = document.getElementById('sales-hist-empty');
    if (!tbody) return;

    if (this.salesList.length === 0) {
      tbody.innerHTML = '';
      if (emptyMsg) emptyMsg.classList.remove('hidden');
      return;
    }

    if (emptyMsg) emptyMsg.classList.add('hidden');

    tbody.innerHTML = this.salesList.map(s => {
      const profitClass = s.profit >= 0 ? 'text-green-600 font-bold' : 'text-red-600 font-bold';
      const margin = s.grand_total > 0 ? ((s.profit / s.grand_total) * 100).toFixed(1) : 0;

      return `
        <tr class="border-b border-gray-100 text-sm hover:bg-gray-50">
          <td class="py-2.5 px-3 font-mono font-bold text-xs text-blue-700">${s.invoice_no}</td>
          <td class="py-2.5 px-3 text-xs text-gray-600">${App.formatDate(s.date)}</td>
          <td class="py-2.5 px-3 font-medium text-gray-800">${s.customer_name}</td>
          
          <td class="py-2.5 px-3 text-center">
            <span class="px-2 py-0.5 text-[11px] font-semibold rounded ${s.price_tier === 'GROSIR' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}">
              ${s.price_tier}
            </span>
          </td>

          <!-- TOTAL OMSET -->
          <td class="py-2.5 px-3 text-right font-bold text-gray-900">${App.formatRupiah(s.grand_total)}</td>

          <!-- TOTAL MODAL -->
          <td class="py-2.5 px-3 text-right text-xs text-gray-600">${App.formatRupiah(s.total_cost)}</td>

          <!-- KEUNTUNGAN BERSIH -->
          <td class="py-2.5 px-3 text-right">
            <div class="${profitClass}">${s.profit >= 0 ? '+' : ''}${App.formatRupiah(s.profit)}</div>
            <div class="text-[10px] text-gray-500">${margin}%</div>
          </td>

          <td class="py-2.5 px-3 text-center text-xs font-semibold text-gray-600">${s.payment_method}</td>

          <!-- ACTIONS -->
          <td class="py-2.5 px-3 text-right">
            <div class="flex items-center justify-end gap-1.5">
              <button onclick="SalesHistoryManager.viewAndPrintReceipt(${s.id})" class="px-2.5 py-1 text-xs font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 rounded border border-blue-200" title="Cetak Struk">
                🧾 Struk
              </button>
              <button onclick="SalesHistoryManager.voidSale(${s.id}, '${s.invoice_no}')" class="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded border border-red-200" title="Batalkan Transaksi">
                Batal
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  },

  async viewAndPrintReceipt(saleId) {
    try {
      const res = await fetch(`/api/sales/${saleId}`);
      const data = await res.json();
      if (!data.success) {
        App.toast('Gagal memuat data struk.', 'error');
        return;
      }

      POS.openReceiptModal(data.data);
    } catch (err) {
      App.toast('Gagal memuat struk.', 'error');
    }
  },

  async voidSale(saleId, invoiceNo) {
    if (!confirm(`PERINGATAN: Apakah Anda yakin ingin membatalkan transaksi "${invoiceNo}"?\n\nStok produk yang sudah terjual akan otomatis dikembalikan ke etalase toko.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/sales/${saleId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        App.toast(data.message, 'success');
        this.loadSales();
        // Also refresh products in POS
        if (window.POS) POS.loadProductsForSearch();
      } else {
        App.toast(data.message, 'error');
      }
    } catch (err) {
      App.toast('Gagal membatalkan transaksi.', 'error');
    }
  }
};

window.SalesHistoryManager = SalesHistoryManager;
