// Pembelian & Restok (Kulakan) Management
const PurchasesManager = {
  purchasesList: [],
  newPurchaseItems: [],
  productsList: [],

  init() {
    this.setupEventListeners();
  },

  setupEventListeners() {
    // Add item to purchase cart search
    const searchInput = document.getElementById('purchase-prod-search');
    const searchResults = document.getElementById('purchase-search-results');

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const query = e.target.value.trim().toLowerCase();
        if (!query) {
          searchResults.classList.add('hidden');
          return;
        }

        const matches = this.productsList.filter(p =>
          p.name.toLowerCase().includes(query) ||
          (p.barcode && p.barcode.toLowerCase().includes(query))
        ).slice(0, 8);

        this.renderSearchResults(matches);
      });
    }

    // Set today as default date
    const dateInput = document.getElementById('purchase-date');
    if (dateInput) {
      dateInput.value = new Date().toISOString().split('T')[0];
    }

    // Submit purchase button
    const submitBtn = document.getElementById('btn-save-purchase');
    if (submitBtn) {
      submitBtn.addEventListener('click', () => this.savePurchase());
    }
  },

  async loadPurchases() {
    try {
      // 1. Load products for autocomplete
      const pRes = await fetch('/api/products');
      const pData = await pRes.json();
      if (pData.success) {
        this.productsList = pData.data;
      }

      // 2. Load purchase history
      const res = await fetch('/api/purchases');
      const data = await res.json();
      if (data.success) {
        this.purchasesList = data.data;
        this.renderPurchaseHistory();
      }
    } catch (err) {
      console.error('Error loading purchases:', err);
    }
  },

  getUnitBadge(unit) {
    const u = (unit || '').toLowerCase();
    if (u === 'pres') return 'bg-amber-100 text-amber-900 border border-amber-300';
    if (u === 'box') return 'bg-purple-100 text-purple-900 border border-purple-300';
    if (u === 'dus') return 'bg-orange-100 text-orange-900 border border-orange-300';
    return 'bg-blue-100 text-blue-900 border border-blue-300';
  },

  renderSearchResults(items) {
    const container = document.getElementById('purchase-search-results');
    if (!container) return;

    if (items.length === 0) {
      container.innerHTML = '<div class="p-3 text-xs text-gray-500 text-center">Produk tidak ditemukan.</div>';
      container.classList.remove('hidden');
      return;
    }

    container.innerHTML = items.map(p => {
      const hasConversion = p.conversion_qty > 1;
      return `
        <div class="p-2.5 hover:bg-green-50 cursor-pointer border-b border-gray-100 flex items-center justify-between text-xs search-purchase-item" data-id="${p.id}">
          <div>
            <div class="font-bold text-gray-800 flex items-center gap-1.5">
              <span>${p.name}</span>
              <span class="px-1.5 py-0.5 text-[10px] font-bold rounded ${this.getUnitBadge(p.unit_large)}">${p.unit_large}</span>
            </div>
            <div class="text-gray-500 mt-0.5">
              Stok: <span class="font-semibold text-gray-700">${p.stock_display}</span> | 
              Modal: <span class="text-gray-700 font-semibold">${App.formatRupiah(p.cost_price_large)} / ${p.unit_large}</span>
              ${hasConversion ? `(${App.formatRupiah(p.cost_price)} / ${p.unit_small})` : ''}
            </div>
          </div>
          <button class="px-2.5 py-1 bg-green-600 hover:bg-green-700 text-white rounded font-medium shadow-sm">
            ➕ Tambah
          </button>
        </div>
      `;
    }).join('');

    container.classList.remove('hidden');

    container.querySelectorAll('.search-purchase-item').forEach(el => {
      el.addEventListener('click', () => {
        const id = Number(el.getAttribute('data-id'));
        const product = this.productsList.find(p => p.id === id);
        if (product) {
          this.addItemToPurchase(product);
          document.getElementById('purchase-prod-search').value = '';
          container.classList.add('hidden');
        }
      });
    });
  },

  addItemToPurchase(product) {
    const existing = this.newPurchaseItems.find(i => i.product_id === product.id);
    if (existing) {
      existing.qty += 1;
    } else {
      const isMultiUnit = product.conversion_qty > 1;
      const defaultUnit = isMultiUnit ? product.unit_large : product.unit_small;
      const defaultCost = isMultiUnit ? product.cost_price_large : product.cost_price;

      this.newPurchaseItems.push({
        product_id: product.id,
        product_name: product.name,
        unit_large: product.unit_large,
        unit_small: product.unit_small,
        conversion_qty: product.conversion_qty,
        stock_display: product.stock_display,
        purchased_unit: defaultUnit,
        current_cost_large: product.cost_price_large,
        current_cost_small: product.cost_price,
        qty: 1,
        cost_price: defaultCost,
        update_product_cost: true
      });
    }

    this.renderPurchaseItemsTable();
  },

  switchItemUnit(index, unit) {
    const item = this.newPurchaseItems[index];
    if (!item) return;

    item.purchased_unit = unit;
    if (unit === item.unit_large) {
      item.cost_price = item.current_cost_large;
    } else {
      item.cost_price = item.current_cost_small;
    }
    this.renderPurchaseItemsTable();
  },

  updatePurchaseItemQty(index, qty) {
    if (this.newPurchaseItems[index]) {
      this.newPurchaseItems[index].qty = Math.max(1, Number(qty) || 1);
      this.renderPurchaseItemsTable();
    }
  },

  updatePurchaseItemCost(index, cost) {
    if (this.newPurchaseItems[index]) {
      this.newPurchaseItems[index].cost_price = Math.max(0, Number(cost) || 0);
      this.renderPurchaseItemsTable();
    }
  },

  toggleUpdateProductCost(index) {
    if (this.newPurchaseItems[index]) {
      this.newPurchaseItems[index].update_product_cost = !this.newPurchaseItems[index].update_product_cost;
    }
  },

  removePurchaseItem(index) {
    if (this.newPurchaseItems[index]) {
      this.newPurchaseItems.splice(index, 1);
      this.renderPurchaseItemsTable();
    }
  },

  renderPurchaseItemsTable() {
    const tbody = document.getElementById('purchase-items-tbody');
    const emptyMsg = document.getElementById('purchase-items-empty');
    const totalElem = document.getElementById('purchase-grand-total');
    if (!tbody) return;

    if (this.newPurchaseItems.length === 0) {
      tbody.innerHTML = '';
      if (emptyMsg) emptyMsg.classList.remove('hidden');
      if (totalElem) totalElem.textContent = 'Rp 0';
      return;
    }

    if (emptyMsg) emptyMsg.classList.add('hidden');

    let totalAmount = 0;

    tbody.innerHTML = this.newPurchaseItems.map((item, idx) => {
      const subtotal = item.qty * item.cost_price;
      totalAmount += subtotal;

      const baseCost = item.purchased_unit === item.unit_large ? item.current_cost_large : item.current_cost_small;
      const costChange = item.cost_price - baseCost;

      let changeIndicator = '<span class="text-gray-400 text-[10px]">(Tetap)</span>';
      if (costChange > 0) {
        changeIndicator = `<span class="text-red-500 font-bold text-[10px]">(Naik +${App.formatRupiah(costChange)})</span>`;
      } else if (costChange < 0) {
        changeIndicator = `<span class="text-green-600 font-bold text-[10px]">(Turun ${App.formatRupiah(costChange)})</span>`;
      }

      const hasConversion = item.conversion_qty > 1;

      // Unit switch buttons
      const unitSelector = hasConversion ? `
        <div class="inline-flex rounded-lg border border-gray-300 p-0.5 bg-gray-100 text-[11px] mt-1">
          <button type="button" onclick="PurchasesManager.switchItemUnit(${idx}, '${item.unit_large}')"
                  class="px-2 py-0.5 rounded font-bold transition ${item.purchased_unit === item.unit_large ? 'bg-orange-600 text-white shadow-sm' : 'text-gray-700 hover:text-black'}">
            ${item.unit_large}
          </button>
          <button type="button" onclick="PurchasesManager.switchItemUnit(${idx}, '${item.unit_small}')"
                  class="px-2 py-0.5 rounded font-bold transition ${item.purchased_unit === item.unit_small ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-700 hover:text-black'}">
            ${item.unit_small} (Ecer)
          </button>
        </div>
      ` : `<span class="px-2 py-0.5 text-xs font-bold rounded bg-blue-100 text-blue-800">${item.unit_small}</span>`;

      return `
        <tr class="border-b border-gray-100 text-xs hover:bg-gray-50">
          <td class="py-2.5 px-3">
            <div class="font-bold text-gray-900 text-sm">${item.product_name}</div>
            <div class="text-gray-500 mt-0.5">Stok Saat Ini: <span class="font-semibold text-gray-700">${item.stock_display}</span></div>
            <div class="mt-1">${unitSelector}</div>
          </td>

          <!-- QTY INPUT -->
          <td class="py-2.5 px-2 text-center">
            <div class="flex items-center justify-center gap-1">
              <input type="number" min="1" value="${item.qty}" onchange="PurchasesManager.updatePurchaseItemQty(${idx}, this.value)"
                     class="w-16 px-2 py-1 text-center border border-gray-300 rounded font-bold text-sm">
              <span class="text-gray-600 font-semibold text-[11px]">${item.purchased_unit}</span>
            </div>
            ${hasConversion && item.purchased_unit === item.unit_large ? `<div class="text-[10px] text-gray-400 mt-0.5">= ${item.qty * item.conversion_qty} ${item.unit_small}</div>` : ''}
          </td>

          <!-- MODAL BARU PER BARANG -->
          <td class="py-2.5 px-3">
            <div class="flex items-center gap-2">
              <input type="number" min="0" value="${item.cost_price}" onchange="PurchasesManager.updatePurchaseItemCost(${idx}, this.value)"
                     class="w-28 px-2 py-1 text-right border border-gray-300 rounded text-sm font-semibold text-blue-800 focus:ring-1 focus:ring-blue-500">
              <span class="text-[11px] text-gray-500">/${item.purchased_unit}</span>
            </div>
            <div class="mt-0.5 flex items-center gap-1.5">
              ${changeIndicator}
              <span class="text-[10px] text-gray-400">Modal lama: ${App.formatRupiah(baseCost)}</span>
            </div>
          </td>

          <!-- UPDATE MODAL MASTER CHECKBOX -->
          <td class="py-2.5 px-3 text-center">
            <label class="inline-flex items-center cursor-pointer">
              <input type="checkbox" ${item.update_product_cost ? 'checked' : ''} onchange="PurchasesManager.toggleUpdateProductCost(${idx})"
                     class="rounded text-green-600 focus:ring-green-500 w-4 h-4">
              <span class="ml-1 text-xs text-gray-700 font-medium">Update</span>
            </label>
          </td>

          <!-- SUBTOTAL -->
          <td class="py-2.5 px-3 text-right font-bold text-gray-900 text-sm">
            ${App.formatRupiah(subtotal)}
          </td>

          <!-- DELETE -->
          <td class="py-2.5 px-2 text-center">
            <button onclick="PurchasesManager.removePurchaseItem(${idx})" class="text-red-500 hover:text-red-700 font-bold text-base p-1" title="Hapus Item">
              &times;
            </button>
          </td>
        </tr>
      `;
    }).join('');

    if (totalElem) totalElem.textContent = App.formatRupiah(totalAmount);
  },

  async savePurchase() {
    if (this.newPurchaseItems.length === 0) {
      App.toast('Belum ada barang yang ditambahkan ke daftar pembelian!', 'warning');
      return;
    }

    const supplierInput = document.getElementById('purchase-supplier');
    const supplier = supplierInput ? supplierInput.value.trim() : 'Supplier Umum';

    const invoiceInput = document.getElementById('purchase-invoice-no');
    const invoice_no = invoiceInput ? invoiceInput.value.trim() : '';

    const dateInput = document.getElementById('purchase-date');
    const date = dateInput ? dateInput.value : new Date().toISOString().split('T')[0];

    const notesInput = document.getElementById('purchase-notes');
    const notes = notesInput ? notesInput.value.trim() : '';

    const payload = {
      invoice_no,
      supplier,
      date,
      notes,
      items: this.newPurchaseItems.map(i => ({
        product_id: i.product_id,
        product_name: i.product_name,
        qty: i.qty,
        purchased_unit: i.purchased_unit,
        cost_price: i.cost_price,
        update_product_cost: i.update_product_cost
      }))
    };

    try {
      const res = await fetch('/api/purchases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await res.json();
      if (!result.success) {
        App.toast(result.message || 'Gagal menyimpan pembelian.', 'error');
        return;
      }

      App.toast(result.message, 'success');

      // Reset form
      this.newPurchaseItems = [];
      this.renderPurchaseItemsTable();
      if (invoiceInput) invoiceInput.value = '';
      if (supplierInput) supplierInput.value = '';
      if (notesInput) notesInput.value = '';

      // Reload purchases history and reload products to reflect new stock & cost
      this.loadPurchases();
      if (window.ProductsManager && typeof ProductsManager.loadProducts === 'function') {
        ProductsManager.loadProducts();
      }
      if (window.POS && typeof POS.loadProducts === 'function') {
        POS.loadProducts();
      }
    } catch (err) {
      console.error('Error saving purchase:', err);
      App.toast('Terjadi kesalahan saat menyimpan pembelian.', 'error');
    }
  },

  renderPurchaseHistory() {
    const tbody = document.getElementById('purchase-history-tbody');
    const emptyMsg = document.getElementById('purchase-history-empty');
    if (!tbody) return;

    if (this.purchasesList.length === 0) {
      tbody.innerHTML = '';
      if (emptyMsg) emptyMsg.classList.remove('hidden');
      return;
    }

    if (emptyMsg) emptyMsg.classList.add('hidden');

    tbody.innerHTML = this.purchasesList.map(p => `
      <tr class="border-b border-gray-100 text-xs hover:bg-gray-50">
        <td class="py-2.5 px-3 font-mono text-xs font-semibold text-gray-700">${p.invoice_no}</td>
        <td class="py-2.5 px-3">${App.formatDate(p.date)}</td>
        <td class="py-2.5 px-3 font-semibold text-gray-800">${p.supplier}</td>
        <td class="py-2.5 px-3 text-right font-bold text-gray-900">${App.formatRupiah(p.total_amount)}</td>
        <td class="py-2.5 px-3 text-xs text-gray-500">${p.notes || '-'}</td>
        <td class="py-2.5 px-3 text-right">
          <button onclick="PurchasesManager.viewPurchaseDetail(${p.id})" class="px-2.5 py-1 text-xs font-semibold bg-gray-100 hover:bg-gray-200 text-gray-700 rounded border border-gray-300">
            Rincian
          </button>
        </td>
      </tr>
    `).join('');
  },

  async viewPurchaseDetail(purchaseId) {
    try {
      const res = await fetch(`/api/purchases/${purchaseId}`);
      const data = await res.json();
      if (!data.success) {
        App.toast('Gagal memuat rincian pembelian.', 'error');
        return;
      }

      const p = data.data;
      const content = document.getElementById('purchase-detail-content');
      if (!content) return;

      const itemsHtml = p.items.map(item => `
        <tr class="border-b border-gray-100 text-xs">
          <td class="py-2 px-2 font-medium text-gray-800">${item.product_name}</td>
          <td class="py-2 px-2 text-center font-bold text-blue-800">${item.qty} ${item.unit_purchased || item.unit_large || 'Biji'}</td>
          <td class="py-2 px-2 text-right">${App.formatRupiah(item.cost_price)}</td>
          <td class="py-2 px-2 text-right font-bold text-gray-900">${App.formatRupiah(item.subtotal)}</td>
        </tr>
      `).join('');

      content.innerHTML = `
        <div class="space-y-3">
          <div class="grid grid-cols-2 gap-2 text-xs bg-gray-50 p-2.5 rounded border border-gray-200">
            <div><span class="text-gray-500">No. Faktur:</span> <span class="font-bold font-mono">${p.invoice_no}</span></div>
            <div><span class="text-gray-500">Tanggal:</span> <span class="font-bold">${App.formatDate(p.date)}</span></div>
            <div><span class="text-gray-500">Supplier:</span> <span class="font-bold">${p.supplier}</span></div>
            <div><span class="text-gray-500">Catatan:</span> <span>${p.notes || '-'}</span></div>
          </div>

          <table class="w-full text-xs">
            <thead>
              <tr class="bg-gray-100 text-gray-700 font-bold border-b">
                <th class="py-2 px-2 text-left">Nama Barang</th>
                <th class="py-2 px-2 text-center">Qty Beli</th>
                <th class="py-2 px-2 text-right">Modal/Item</th>
                <th class="py-2 px-2 text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
            <tfoot>
              <tr class="border-t font-bold text-sm bg-gray-50">
                <td colspan="3" class="py-2 px-2 text-right">Total Pembelian:</td>
                <td class="py-2 px-2 text-right text-blue-700">${App.formatRupiah(p.total_amount)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      `;

      App.openModal('purchase-detail-modal');
    } catch (err) {
      console.error(err);
      App.toast('Gagal memuat rincian pembelian.', 'error');
    }
  }
};

window.PurchasesManager = PurchasesManager;
