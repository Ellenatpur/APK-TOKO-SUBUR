// Kasir (Point of Sale) Management with Multi-Unit (Dus/Pres/Box & Biji)
const POS = {
  cart: [],
  globalTier: 'ECERAN', // 'ECERAN' or 'GROSIR'
  productsList: [],
  selectedProductIndex: -1,
  lastTransaction: null,

  init() {
    this.setupEventListeners();
    this.loadProductsForSearch();
  },

  onShow() {
    this.loadProductsForSearch();
    const searchInput = document.getElementById('pos-search-input');
    if (searchInput) searchInput.focus();
  },

  async loadProductsForSearch() {
    try {
      const res = await fetch('/api/products');
      const data = await res.json();
      if (data.success) {
        this.productsList = data.data;
      }
    } catch (err) {
      console.error('Error loading products for POS:', err);
    }
  },

  setupEventListeners() {
    const searchInput = document.getElementById('pos-search-input');
    const searchResults = document.getElementById('pos-search-results');

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const query = e.target.value.trim().toLowerCase();
        if (!query) {
          searchResults.classList.add('hidden');
          return;
        }

        const matches = this.productsList.filter(p =>
          p.name.toLowerCase().includes(query) ||
          p.category.toLowerCase().includes(query)
        ).slice(0, 8);

        this.renderSearchResults(matches);
      });

      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const query = searchInput.value.trim();
          if (!query) return;

          const matches = this.productsList.filter(p =>
            p.name.toLowerCase().includes(query.toLowerCase())
          );

          if (matches.length > 0) {
            this.addToCart(matches[0]);
            searchInput.value = '';
            searchResults.classList.add('hidden');
          }
        }
      });
    }

    // Close search dropdown on click outside
    document.addEventListener('click', (e) => {
      if (searchInput && searchResults && !searchInput.contains(e.target) && !searchResults.contains(e.target)) {
        searchResults.classList.add('hidden');
      }
    });

    // Discount & Cash inputs live update
    const discountInput = document.getElementById('pos-discount');
    if (discountInput) {
      discountInput.addEventListener('input', () => this.updateTotals());
    }

    const cashInput = document.getElementById('pos-cash-paid');
    if (cashInput) {
      cashInput.addEventListener('input', () => this.updateChange());
    }

    // Global price tier switch button
    const tierToggleBtn = document.getElementById('pos-global-tier-btn');
    if (tierToggleBtn) {
      tierToggleBtn.addEventListener('click', () => {
        this.globalTier = this.globalTier === 'ECERAN' ? 'GROSIR' : 'ECERAN';
        this.updateGlobalTierUI();
      });
    }

    // Apply global tier to all existing cart items
    const applyAllTierBtn = document.getElementById('pos-apply-all-tier-btn');
    if (applyAllTierBtn) {
      applyAllTierBtn.addEventListener('click', () => {
        this.cart.forEach(item => {
          const isLarge = this.globalTier === 'GROSIR' && item.product.conversion_qty > 1;
          item.sold_unit = isLarge ? item.product.unit_large : item.product.unit_small;
          item.price_type = this.globalTier;
          item.selling_price = isLarge ? item.product.wholesale_price : item.product.retail_price;
        });
        this.renderCart();
        App.toast(`Semua barang disetel ke mode ${this.globalTier}`, 'info');
      });
    }

    // Clear cart button
    const clearBtn = document.getElementById('pos-clear-cart-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (this.cart.length > 0 && confirm('Kosongkan keranjang belanja?')) {
          this.cart = [];
          this.renderCart();
        }
      });
    }

    // Checkout buttons
    const payPrintBtn = document.getElementById('pos-btn-pay-print');
    if (payPrintBtn) {
      payPrintBtn.addEventListener('click', () => this.checkout(true));
    }

    const payOnlyBtn = document.getElementById('pos-btn-pay-only');
    if (payOnlyBtn) {
      payOnlyBtn.addEventListener('click', () => this.checkout(false));
    }
  },

  updateGlobalTierUI() {
    const badge = document.getElementById('pos-global-tier-badge');
    if (badge) {
      if (this.globalTier === 'GROSIR') {
        badge.textContent = 'MODE GROSIR (DUS/PRES)';
        badge.className = 'px-3 py-1 text-xs font-bold rounded-full bg-purple-600 text-white';
      } else {
        badge.textContent = 'MODE ECERAN (BIJI)';
        badge.className = 'px-3 py-1 text-xs font-bold rounded-full bg-blue-600 text-white';
      }
    }
  },

  getUnitClass(unit) {
    const u = (unit || '').toLowerCase();
    if (u === 'pres') return 'bg-amber-100 text-amber-900 border border-amber-300';
    if (u === 'box') return 'bg-purple-100 text-purple-900 border border-purple-300';
    if (u === 'dus') return 'bg-orange-100 text-orange-900 border border-orange-300';
    if (u === 'biji') return 'bg-blue-100 text-blue-900 border border-blue-300';
    return 'bg-gray-100 text-gray-800 border border-gray-300';
  },

  renderSearchResults(items) {
    const container = document.getElementById('pos-search-results');
    if (!container) return;

    if (items.length === 0) {
      container.innerHTML = '<div class="p-3 text-sm text-gray-500 text-center">Produk tidak ditemukan.</div>';
      container.classList.remove('hidden');
      return;
    }

    container.innerHTML = items.map((p) => {
      const stockColor = p.stock <= p.min_stock ? 'text-red-600 font-bold' : 'text-gray-700 font-bold';
      const hasConversion = p.conversion_qty > 1;

      return `
        <div class="p-3 hover:bg-blue-50 cursor-pointer border-b border-gray-100 flex items-center justify-between text-sm search-item" data-id="${p.id}">
          <div>
            <div class="font-bold text-gray-900 flex items-center gap-1.5">
              <span>${p.name}</span>
              <span class="px-2 py-0.5 text-[11px] font-bold rounded ${this.getUnitClass(p.unit_large)}">${p.unit_large}</span>
              ${hasConversion ? `<span class="text-xs text-gray-500 font-normal">(Isi ${p.conversion_qty} ${p.unit_small})</span>` : ''}
            </div>
            <div class="text-xs text-gray-500 mt-1">
              Stok Toko: <span class="${stockColor}">${p.stock_display}</span>
            </div>
          </div>
          <div class="text-right flex items-center gap-2">
            <div>
              <div class="text-xs font-bold text-blue-700">Ecer: ${App.formatRupiah(p.retail_price)} / ${p.unit_small}</div>
              ${hasConversion ? `<div class="text-xs font-bold text-purple-700">Grosir: ${App.formatRupiah(p.wholesale_price)} / ${p.unit_large}</div>` : ''}
            </div>
            <button class="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded shadow">
              Pilih
            </button>
          </div>
        </div>
      `;
    }).join('');

    container.classList.remove('hidden');

    container.querySelectorAll('.search-item').forEach(el => {
      el.addEventListener('click', () => {
        const id = Number(el.getAttribute('data-id'));
        const product = this.productsList.find(p => p.id === id);
        if (product) {
          this.addToCart(product);
          document.getElementById('pos-search-input').value = '';
          container.classList.add('hidden');
        }
      });
    });
  },

  addToCart(product, forcedUnit = null) {
    let soldUnit = forcedUnit;
    if (!soldUnit) {
      if (this.globalTier === 'GROSIR' && product.conversion_qty > 1) {
        soldUnit = product.unit_large;
      } else {
        soldUnit = product.unit_small;
      }
    }

    const isLarge = soldUnit === product.unit_large && product.conversion_qty > 1;

    // Check if already in cart with same unit
    const existingIndex = this.cart.findIndex(i => i.product.id === product.id && i.sold_unit === soldUnit);
    if (existingIndex > -1) {
      this.cart[existingIndex].qty += 1;
    } else {
      const initialPrice = isLarge ? product.wholesale_price : product.retail_price;
      this.cart.push({
        product,
        qty: 1,
        sold_unit: soldUnit,
        price_type: isLarge ? 'GROSIR' : 'ECERAN',
        selling_price: initialPrice
      });
    }

    this.renderCart();
  },

  updateItemQty(index, delta) {
    if (this.cart[index]) {
      this.cart[index].qty += delta;
      if (this.cart[index].qty <= 0) {
        this.cart.splice(index, 1);
      }
      this.renderCart();
    }
  },

  setItemQty(index, qty) {
    if (this.cart[index]) {
      const val = Number(qty);
      if (val > 0) {
        this.cart[index].qty = val;
      } else {
        this.cart.splice(index, 1);
      }
      this.renderCart();
    }
  },

  // Toggle antara Biji dan Dus/Pres/Box
  toggleItemUnit(index) {
    if (this.cart[index]) {
      const item = this.cart[index];
      const p = item.product;

      if (p.conversion_qty <= 1) return; // Barang eceran murni, tidak ada konversi

      if (item.sold_unit === p.unit_small) {
        // Switch to Dus/Pres/Box
        item.sold_unit = p.unit_large;
        item.price_type = 'GROSIR';
        item.selling_price = p.wholesale_price;
      } else {
        // Switch to Biji
        item.sold_unit = p.unit_small;
        item.price_type = 'ECERAN';
        item.selling_price = p.retail_price;
      }

      this.renderCart();
    }
  },

  setItemPrice(index, price) {
    if (this.cart[index]) {
      const val = Number(price);
      if (!isNaN(val) && val >= 0) {
        this.cart[index].selling_price = val;
      }
      this.renderCart();
    }
  },

  removeItem(index) {
    if (this.cart[index]) {
      this.cart.splice(index, 1);
      this.renderCart();
    }
  },

  renderCart() {
    const tableBody = document.getElementById('pos-cart-tbody');
    const emptyMsg = document.getElementById('pos-cart-empty');
    if (!tableBody) return;

    if (this.cart.length === 0) {
      tableBody.innerHTML = '';
      if (emptyMsg) emptyMsg.classList.remove('hidden');
      this.updateTotals();
      return;
    }

    if (emptyMsg) emptyMsg.classList.add('hidden');

    tableBody.innerHTML = this.cart.map((item, idx) => {
      const p = item.product;
      const isLarge = item.sold_unit === p.unit_large && p.conversion_qty > 1;
      const modal = isLarge ? p.cost_price_large : p.cost_price;
      const subtotalJual = item.qty * item.selling_price;
      const subtotalModal = item.qty * modal;
      const laba = subtotalJual - subtotalModal;
      const marginPct = subtotalJual > 0 ? ((laba / subtotalJual) * 100).toFixed(1) : 0;

      const unitBtnColor = isLarge
        ? 'bg-purple-100 text-purple-800 border-purple-300 hover:bg-purple-200'
        : 'bg-blue-100 text-blue-800 border-blue-300 hover:bg-blue-200';

      const profitColorClass = laba >= 0 ? 'text-green-700 font-bold' : 'text-red-600 font-bold';

      return `
        <tr class="border-b border-gray-100 hover:bg-gray-50 text-sm">
          <td class="py-2.5 px-3">
            <div class="font-bold text-gray-900">${p.name}</div>
            <div class="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
              <span class="bg-gray-100 px-1.5 py-0.5 rounded text-gray-700 font-medium">Modal: ${App.formatRupiah(modal)}/${item.sold_unit}</span>
              <span>Sisa: ${p.stock_display || p.stock}</span>
            </div>
          </td>
          
          <!-- QTY CONTROLS -->
          <td class="py-2.5 px-2 text-center">
            <div class="inline-flex items-center border border-gray-300 rounded overflow-hidden">
              <button onclick="POS.updateItemQty(${idx}, -1)" class="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold">-</button>
              <input type="number" min="1" value="${item.qty}" onchange="POS.setItemQty(${idx}, this.value)" 
                     class="w-12 text-center text-sm py-1 border-0 focus:ring-0 font-medium">
              <button onclick="POS.updateItemQty(${idx}, 1)" class="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold">+</button>
            </div>
          </td>

          <!-- PILIH SATUAN (Dus / Biji) & HARGA JUAL -->
          <td class="py-2.5 px-3">
            <div class="flex items-center gap-1.5">
              ${p.conversion_qty > 1 ? `
                <button onclick="POS.toggleItemUnit(${idx})" 
                        title="Klik untuk ganti satuan jual (${p.unit_large} atau ${p.unit_small})"
                        class="px-2.5 py-1 text-xs font-bold rounded border cursor-pointer ${unitBtnColor} transition">
                  ${item.sold_unit} ⇄
                </button>
              ` : `
                <span class="px-2 py-1 text-xs font-bold rounded border bg-gray-100 text-gray-700">${item.sold_unit}</span>
              `}
              <input type="number" value="${item.selling_price}" onchange="POS.setItemPrice(${idx}, this.value)"
                     class="w-24 px-1.5 py-1 text-right border border-gray-300 rounded text-sm font-semibold text-gray-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500">
            </div>
          </td>

          <!-- SUBTOTAL JUAL -->
          <td class="py-2.5 px-3 text-right font-bold text-gray-900">
            ${App.formatRupiah(subtotalJual)}
          </td>

          <!-- LABA / UNTUNG BERSIH PER ITEM -->
          <td class="py-2.5 px-3 text-right">
            <div class="${profitColorClass}">${laba >= 0 ? '+' : ''}${App.formatRupiah(laba)}</div>
            <div class="text-xs text-gray-500">${marginPct}%</div>
          </td>

          <!-- ACTION (DELETE) -->
          <td class="py-2.5 px-2 text-center">
            <button onclick="POS.removeItem(${idx})" class="text-red-500 hover:text-red-700 p-1 font-bold" title="Hapus">
              &times;
            </button>
          </td>
        </tr>
      `;
    }).join('');

    this.updateTotals();
  },

  updateTotals() {
    let totalSelling = 0;
    let totalCost = 0;

    this.cart.forEach(item => {
      const isLarge = item.sold_unit === item.product.unit_large && item.product.conversion_qty > 1;
      const modal = isLarge ? item.product.cost_price_large : item.product.cost_price;
      totalSelling += item.qty * item.selling_price;
      totalCost += item.qty * modal;
    });

    const discountElem = document.getElementById('pos-discount');
    const discount = discountElem ? Math.max(0, Number(discountElem.value) || 0) : 0;

    const grandTotal = Math.max(0, totalSelling - discount);
    const netProfit = grandTotal - totalCost;

    const omsetElem = document.getElementById('pos-total-omset');
    if (omsetElem) omsetElem.textContent = App.formatRupiah(totalSelling);

    const costElem = document.getElementById('pos-total-cost');
    if (costElem) costElem.textContent = App.formatRupiah(totalCost);

    const profitElem = document.getElementById('pos-net-profit');
    if (profitElem) {
      profitElem.textContent = (netProfit >= 0 ? '+' : '') + App.formatRupiah(netProfit);
      profitElem.className = netProfit >= 0 ? 'text-xl font-bold text-green-600' : 'text-xl font-bold text-red-600';
    }

    const grandElem = document.getElementById('pos-grand-total');
    if (grandElem) grandElem.textContent = App.formatRupiah(grandTotal);

    this.updateChange();
  },

  setQuickCash(amount) {
    const cashInput = document.getElementById('pos-cash-paid');
    if (!cashInput) return;

    if (amount === 'pas') {
      const grandText = document.getElementById('pos-grand-total').textContent;
      cashInput.value = App.parseRupiah(grandText);
    } else {
      cashInput.value = Number(amount);
    }

    this.updateChange();
  },

  updateChange() {
    const grandText = document.getElementById('pos-grand-total')?.textContent || '0';
    const grandTotal = App.parseRupiah(grandText);

    const cashInput = document.getElementById('pos-cash-paid');
    const cashPaid = cashInput ? Number(cashInput.value) || 0 : 0;

    const change = Math.max(0, cashPaid - grandTotal);
    const changeElem = document.getElementById('pos-change-returned');
    if (changeElem) {
      changeElem.textContent = App.formatRupiah(change);
    }
  },

  async checkout(shouldPrintReceipt = false) {
    if (this.cart.length === 0) {
      App.toast('Keranjang belanja masih kosong!', 'warning');
      return;
    }

    const customerInput = document.getElementById('pos-customer-name');
    const customerName = customerInput ? customerInput.value.trim() : 'Pelanggan Umum';

    const discountInput = document.getElementById('pos-discount');
    const discount = discountInput ? Number(discountInput.value) || 0 : 0;

    const grandText = document.getElementById('pos-grand-total')?.textContent || '0';
    const grandTotal = App.parseRupiah(grandText);

    const paymentMethodElem = document.getElementById('pos-payment-method');
    const paymentMethod = paymentMethodElem ? paymentMethodElem.value : 'TUNAI';

    const cashInput = document.getElementById('pos-cash-paid');
    let cashPaid = cashInput ? Number(cashInput.value) || 0 : 0;

    if (paymentMethod === 'TUNAI' && cashPaid < grandTotal) {
      cashPaid = grandTotal;
      if (cashInput) cashInput.value = grandTotal;
    }

    const payload = {
      customer_name: customerName,
      discount: discount,
      payment_method: paymentMethod,
      cash_paid: cashPaid,
      items: this.cart.map(i => ({
        product_id: i.product.id,
        qty: i.qty,
        sold_unit: i.sold_unit,
        selling_price: i.selling_price
      }))
    };

    try {
      const res = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await res.json();
      if (!result.success) {
        App.toast(result.message || 'Gagal menyimpan transaksi', 'error');
        return;
      }

      this.lastTransaction = result.data;
      App.toast(`Transaksi ${result.data.invoice_no} Berhasil! Untung: ${App.formatRupiah(result.data.profit)}`, 'success');

      this.cart = [];
      this.renderCart();
      if (customerInput) customerInput.value = 'Pelanggan Umum';
      if (discountInput) discountInput.value = 0;
      if (cashInput) cashInput.value = '';
      this.updateChange();

      this.loadProductsForSearch();

      if (shouldPrintReceipt) {
        this.openReceiptModal(result.data);
      }
    } catch (err) {
      console.error('Checkout error:', err);
      App.toast('Terjadi kesalahan saat checkout.', 'error');
    }
  },

  openReceiptModal(saleData) {
    this.lastTransaction = saleData;
    const modal = document.getElementById('receipt-modal');
    if (!modal) return;

    this.renderReceiptPreview(saleData, '58mm');
    App.openModal('receipt-modal');
  },

  renderReceiptPreview(sale, size = '58mm') {
    const container = document.getElementById('receipt-preview-content');
    const printArea = document.getElementById('receipt-print-area');
    if (!container || !sale) return;

    const store = sale.store || App.storeSettings;
    const storeName = store.store_name || 'TOKO SAYA';
    const storeAddress = store.store_address || '';
    const storePhone = store.store_phone || '';
    const receiptFooter = (store.receipt_footer || 'Terima kasih atas kunjungan Anda!').replace(/\n/g, '<br>');

    const itemsHtml = sale.items.map(item => `
      <tr>
        <td colspan="2" class="font-bold text-gray-800">${item.product_name}</td>
      </tr>
      <tr class="text-xs text-gray-600 border-b border-dashed border-gray-300 pb-1">
        <td>${item.qty} ${item.sold_unit} x ${App.formatRupiah(item.selling_price)}</td>
        <td class="text-right font-medium">${App.formatRupiah(item.subtotal_selling)}</td>
      </tr>
    `).join('');

    const receiptHtml = `
      <div class="thermal-receipt ${size === '80mm' ? 'size-80mm' : ''} text-gray-900 mono-font">
        <div class="text-center mb-2">
          <div class="font-bold text-base tracking-wide">${storeName}</div>
          ${storeAddress ? `<div class="text-xs text-gray-600">${storeAddress}</div>` : ''}
          ${storePhone ? `<div class="text-xs text-gray-600">Telp: ${storePhone}</div>` : ''}
        </div>
        
        <hr class="border-t border-dashed border-gray-400 my-2">

        <div class="text-xs flex justify-between text-gray-600">
          <span>No: ${sale.invoice_no}</span>
          <span>${sale.date}</span>
        </div>
        <div class="text-xs text-gray-600 mb-1">
          Pelanggan: ${sale.customer_name}
        </div>

        <hr class="border-t border-dashed border-gray-400 my-2">

        <table class="receipt-table w-full text-xs">
          ${itemsHtml}
        </table>

        <hr class="border-t border-dashed border-gray-400 my-2">

        <div class="text-xs space-y-1">
          <div class="flex justify-between">
            <span>Subtotal:</span>
            <span>${App.formatRupiah(sale.total_selling)}</span>
          </div>
          ${sale.discount > 0 ? `
          <div class="flex justify-between text-red-600">
            <span>Diskon:</span>
            <span>-${App.formatRupiah(sale.discount)}</span>
          </div>` : ''}
          <div class="flex justify-between font-bold text-sm pt-1 border-t border-gray-300">
            <span>TOTAL:</span>
            <span>${App.formatRupiah(sale.grand_total)}</span>
          </div>
          <div class="flex justify-between pt-1">
            <span>Metode:</span>
            <span>${sale.payment_method}</span>
          </div>
          <div class="flex justify-between">
            <span>Bayar:</span>
            <span>${App.formatRupiah(sale.cash_paid)}</span>
          </div>
          <div class="flex justify-between">
            <span>Kembali:</span>
            <span>${App.formatRupiah(sale.change_returned)}</span>
          </div>
        </div>

        <hr class="border-t border-dashed border-gray-400 my-2">

        <div class="text-center text-xs text-gray-500 mt-2">
          ${receiptFooter}
        </div>
      </div>
    `;

    container.innerHTML = receiptHtml;
    if (printArea) {
      printArea.innerHTML = receiptHtml;
    }
  },

  printReceipt() {
    window.print();
  }
};

window.POS = POS;
