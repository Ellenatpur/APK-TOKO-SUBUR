// Master Produk & Stok Management
const ProductsManager = {
  products: [],
  categories: [],
  editingProduct: null,
  activeQuickProduct: null,

  init() {
    this.setupEventListeners();
  },

  setupEventListeners() {
    const searchInput = document.getElementById('prod-search');
    if (searchInput) {
      searchInput.addEventListener('input', () => this.filterProducts());
    }

    const categorySelect = document.getElementById('prod-category-filter');
    if (categorySelect) {
      categorySelect.addEventListener('change', () => this.filterProducts());
    }

    const unitSelect = document.getElementById('prod-unit-filter');
    if (unitSelect) {
      unitSelect.addEventListener('change', () => this.filterProducts());
    }

    const lowStockCheck = document.getElementById('prod-low-stock-check');
    if (lowStockCheck) {
      lowStockCheck.addEventListener('change', () => this.filterProducts());
    }

    // Add product form submit
    const productForm = document.getElementById('product-form');
    if (productForm) {
      productForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveProduct();
      });
    }

    // Modal sync in product form
    const costLargeInput = document.getElementById('prod-cost-price-large');
    const costSmallInput = document.getElementById('prod-cost-price');
    const convInput = document.getElementById('prod-conversion-qty');

    if (costLargeInput && costSmallInput && convInput) {
      costLargeInput.addEventListener('input', () => {
        const conv = Math.max(1, Number(convInput.value) || 1);
        const largeVal = Number(costLargeInput.value) || 0;
        costSmallInput.value = Math.round(largeVal / conv);
      });

      costSmallInput.addEventListener('input', () => {
        const conv = Math.max(1, Number(convInput.value) || 1);
        const smallVal = Number(costSmallInput.value) || 0;
        costLargeInput.value = Math.round(smallVal * conv);
      });

      convInput.addEventListener('input', () => {
        const conv = Math.max(1, Number(convInput.value) || 1);
        const largeVal = Number(costLargeInput.value) || 0;
        if (largeVal > 0) {
          costSmallInput.value = Math.round(largeVal / conv);
        }
      });
    }

    // Quick cost sync inputs
    const qCostLarge = document.getElementById('quick-cost-large-input');
    const qCostSmall = document.getElementById('quick-cost-small-input');
    if (qCostLarge && qCostSmall) {
      qCostLarge.addEventListener('input', () => {
        if (!this.activeQuickProduct) return;
        const conv = Math.max(1, Number(this.activeQuickProduct.conversion_qty) || 1);
        const val = Number(qCostLarge.value) || 0;
        qCostSmall.value = Math.round(val / conv);
      });

      qCostSmall.addEventListener('input', () => {
        if (!this.activeQuickProduct) return;
        const conv = Math.max(1, Number(this.activeQuickProduct.conversion_qty) || 1);
        const val = Number(qCostSmall.value) || 0;
        qCostLarge.value = Math.round(val * conv);
      });
    }

    // Quick stock inputs live preview
    const qStockLarge = document.getElementById('quick-stock-large-input');
    const qStockSmall = document.getElementById('quick-stock-small-input');
    if (qStockLarge && qStockSmall) {
      const updatePreview = () => {
        if (!this.activeQuickProduct) return;
        const p = this.activeQuickProduct;
        const conv = Math.max(1, Number(p.conversion_qty) || 1);
        const l = Number(qStockLarge.value) || 0;
        const s = Number(qStockSmall.value) || 0;
        const total = (l * conv) + s;
        const previewElem = document.getElementById('quick-stock-calc-preview');
        if (previewElem) {
          if (conv > 1) {
            previewElem.textContent = `${l} ${p.unit_large} + ${s} ${p.unit_small} = Total ${total} ${p.unit_small}`;
          } else {
            previewElem.textContent = `${total} ${p.unit_small}`;
          }
        }
      };

      qStockLarge.addEventListener('input', updatePreview);
      qStockSmall.addEventListener('input', updatePreview);
    }

    // Quick cost edit form submit
    const quickCostForm = document.getElementById('quick-cost-form');
    if (quickCostForm) {
      quickCostForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveQuickCost();
      });
    }

    // Quick stock edit form submit
    const quickStockForm = document.getElementById('quick-stock-form');
    if (quickStockForm) {
      quickStockForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveQuickStock();
      });
    }
  },

  async loadProducts() {
    try {
      const res = await fetch('/api/products');
      const data = await res.json();
      if (data.success) {
        this.products = data.data;
        this.categories = data.categories || [];
        this.populateCategoryFilter();
        this.updateSummaryMetrics();
        this.renderProducts(this.products);
      }
    } catch (err) {
      console.error('Error loading products:', err);
      App.toast('Gagal memuat data produk.', 'error');
    }
  },

  populateCategoryFilter() {
    const select = document.getElementById('prod-category-filter');
    if (!select) return;

    const currentVal = select.value;
    select.innerHTML = '<option value="Semua">Semua Kategori</option>' +
      this.categories.map(cat => `<option value="${cat}">${cat}</option>`).join('');

    if (currentVal) select.value = currentVal;
  },

  updateSummaryMetrics() {
    const totalProdElem = document.getElementById('metric-total-products');
    const totalStockElem = document.getElementById('metric-total-stock');
    const totalAssetElem = document.getElementById('metric-total-assets');
    const lowStockCountElem = document.getElementById('metric-low-stock');

    let totalStock = 0;
    let totalAsset = 0;
    let lowStockCount = 0;

    this.products.forEach(p => {
      totalStock += p.stock;
      totalAsset += (p.cost_price * p.stock);
      if (p.stock <= p.min_stock) lowStockCount++;
    });

    if (totalProdElem) totalProdElem.textContent = this.products.length;
    if (totalStockElem) totalStockElem.textContent = Math.round(totalStock).toLocaleString('id-ID');
    if (totalAssetElem) totalAssetElem.textContent = App.formatRupiah(totalAsset);
    if (lowStockCountElem) lowStockCountElem.textContent = lowStockCount;
  },

  getUnitBadge(unit) {
    const u = (unit || '').toLowerCase();
    if (u === 'pres') {
      return '<span class="px-2.5 py-1 text-xs font-bold rounded-lg bg-amber-100 text-amber-900 border border-amber-300">🚬 Pres (Rokok)</span>';
    } else if (u === 'box') {
      return '<span class="px-2.5 py-1 text-xs font-bold rounded-lg bg-purple-100 text-purple-900 border border-purple-300">💊 Box (Obat/Jajan)</span>';
    } else if (u === 'dus') {
      return '<span class="px-2.5 py-1 text-xs font-bold rounded-lg bg-orange-100 text-orange-900 border border-orange-300">📦 Dus (Aqua/Mie)</span>';
    } else if (u === 'biji') {
      return '<span class="px-2.5 py-1 text-xs font-bold rounded-lg bg-blue-100 text-blue-900 border border-blue-300">🔵 Biji (Eceran)</span>';
    } else {
      return `<span class="px-2.5 py-1 text-xs font-semibold rounded-lg bg-gray-100 text-gray-800 border border-gray-300">${unit || 'Biji'}</span>`;
    }
  },

  selectUnit(unit) {
    const unitInput = document.getElementById('prod-unit-large');
    const convInput = document.getElementById('prod-conversion-qty');
    const costLargeLabel = document.getElementById('prod-cost-large-label');
    const wholesaleLabel = document.getElementById('prod-wholesale-label');
    const stockLargeInput = document.getElementById('prod-stock-large');

    if (unitInput) unitInput.value = unit;

    if (unit === 'Pres') {
      if (convInput) convInput.value = 10;
      if (costLargeLabel) costLargeLabel.textContent = 'Modal per Pres (Rp):';
      if (wholesaleLabel) wholesaleLabel.textContent = 'Harga Grosir (per Pres):';
      if (stockLargeInput) stockLargeInput.placeholder = 'Jml Pres';
    } else if (unit === 'Box') {
      if (convInput) convInput.value = 10;
      if (costLargeLabel) costLargeLabel.textContent = 'Modal per Box (Rp):';
      if (wholesaleLabel) wholesaleLabel.textContent = 'Harga Grosir (per Box):';
      if (stockLargeInput) stockLargeInput.placeholder = 'Jml Box';
    } else if (unit === 'Dus') {
      if (convInput) convInput.value = 24;
      if (costLargeLabel) costLargeLabel.textContent = 'Modal per Dus (Rp):';
      if (wholesaleLabel) wholesaleLabel.textContent = 'Harga Grosir (per Dus):';
      if (stockLargeInput) stockLargeInput.placeholder = 'Jml Dus';
    } else {
      if (convInput) convInput.value = 1;
      if (costLargeLabel) costLargeLabel.textContent = 'Modal Satuan (Rp):';
      if (wholesaleLabel) wholesaleLabel.textContent = 'Harga Grosir (Opsional):';
      if (stockLargeInput) stockLargeInput.placeholder = 'Jml Biji';
    }

    // Highlight active unit button
    document.querySelectorAll('.unit-picker-btn').forEach(btn => {
      if (btn.getAttribute('data-unit') === unit) {
        btn.classList.add('ring-2', 'ring-blue-600', 'font-bold');
      } else {
        btn.classList.remove('ring-2', 'ring-blue-600', 'font-bold');
      }
    });
  },

  filterProducts() {
    const q = document.getElementById('prod-search')?.value.trim().toLowerCase() || '';
    const cat = document.getElementById('prod-category-filter')?.value || 'Semua';
    const unitFilter = document.getElementById('prod-unit-filter')?.value || 'Semua';
    const lowOnly = document.getElementById('prod-low-stock-check')?.checked || false;

    const filtered = this.products.filter(p => {
      const matchesQuery = !q || p.name.toLowerCase().includes(q) || (p.barcode && p.barcode.toLowerCase().includes(q));
      const matchesCat = cat === 'Semua' || p.category === cat;
      const matchesUnit = unitFilter === 'Semua' || (p.unit_large && p.unit_large.toLowerCase() === unitFilter.toLowerCase());
      const matchesLow = !lowOnly || p.stock <= p.min_stock;
      return matchesQuery && matchesCat && matchesUnit && matchesLow;
    });

    this.renderProducts(filtered);
  },

  renderProducts(list) {
    const tbody = document.getElementById('products-tbody');
    const emptyState = document.getElementById('products-empty');
    if (!tbody) return;

    if (list.length === 0) {
      tbody.innerHTML = '';
      if (emptyState) emptyState.classList.remove('hidden');
      return;
    }

    if (emptyState) emptyState.classList.add('hidden');

    tbody.innerHTML = list.map((p, idx) => {
      const isLowStock = p.stock <= p.min_stock;
      const stockBadge = isLowStock
        ? `<span class="px-2.5 py-1 text-xs font-bold rounded-full bg-red-100 text-red-700 animate-pulse">Menipis: ${p.stock_display}</span>`
        : `<span class="px-2.5 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-700">${p.stock_display}</span>`;

      // Untung Eceran & Grosir
      const untungEcer = p.retail_price - p.cost_price;
      const marginEcer = p.retail_price > 0 ? ((untungEcer / p.retail_price) * 100).toFixed(0) : 0;

      const hasConversion = p.conversion_qty > 1;
      const untungGrosir = hasConversion ? (p.wholesale_price - p.cost_price_large) : (p.wholesale_price - p.cost_price);
      const marginGrosir = p.wholesale_price > 0 ? ((untungGrosir / p.wholesale_price) * 100).toFixed(0) : 0;

      return `
        <tr class="border-b border-gray-200 hover:bg-gray-50 text-xs">
          <!-- SATUAN (Biji, Pres, Box, Dus) -->
          <td class="py-3 px-3">
            ${this.getUnitBadge(p.unit_large)}
          </td>
          
          <td class="py-3 px-3">
            <div class="font-bold text-gray-900 text-sm">${p.name}</div>
            <div class="text-xs text-gray-500 mt-0.5">
              ${p.category} &bull; ${hasConversion ? `1 ${p.unit_large} = ${p.conversion_qty} ${p.unit_small} &bull; ` : ''}Min. Stok: ${p.min_stock} ${p.unit_small}
            </div>
          </td>

          <!-- MODAL / HPP (Bisa Diedit Langsung) -->
          <td class="py-3 px-3">
            <div class="flex items-center gap-1.5 group cursor-pointer" onclick="ProductsManager.openQuickCostModal(${p.id})">
              <div>
                <span class="font-bold text-gray-900 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 text-xs inline-block">
                  ${App.formatRupiah(p.cost_price_large)} / ${p.unit_large}
                </span>
                ${hasConversion ? `<div class="text-[10px] text-gray-500 mt-0.5">(${App.formatRupiah(p.cost_price)} / ${p.unit_small})</div>` : ''}
              </div>
              <span class="text-amber-600 text-xs group-hover:scale-125 transition-transform" title="Ubah Modal Langsung">✏️</span>
            </div>
          </td>

          <!-- HARGA ECERAN -->
          <td class="py-3 px-3">
            <div class="font-bold text-blue-700">${App.formatRupiah(p.retail_price)} / ${p.unit_small}</div>
            <div class="text-[10px] text-green-600 font-medium">Laba: +${App.formatRupiah(untungEcer)} (${marginEcer}%)</div>
          </td>

          <!-- HARGA GROSIR -->
          <td class="py-3 px-3">
            <div class="font-bold text-purple-700">${App.formatRupiah(p.wholesale_price)} / ${p.unit_large}</div>
            <div class="text-[10px] text-green-600 font-medium">Laba: +${App.formatRupiah(untungGrosir)} (${marginGrosir}%)</div>
          </td>

          <!-- STOK SAAT INI (Bisa Diedit Langsung / Opname) -->
          <td class="py-3 px-3">
            <div class="flex items-center gap-1.5 group cursor-pointer" onclick="ProductsManager.openQuickStockModal(${p.id})">
              ${stockBadge}
              <span class="text-blue-600 text-xs group-hover:scale-125 transition-transform" title="Koreksi / Sesuaikan Stok">✏️</span>
            </div>
          </td>

          <!-- AKSI -->
          <td class="py-3 px-3 text-right">
            <div class="flex items-center justify-end gap-1">
              <button onclick="ProductsManager.openEditModal(${p.id})" class="px-2.5 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50 rounded border border-blue-200" title="Edit Lengkap">
                Edit
              </button>
              <button onclick="ProductsManager.deleteProduct(${p.id})" class="px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 rounded border border-red-200" title="Hapus Produk">
                Hapus
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  },

  // Open Full Add / Edit Modal
  openAddModal() {
    this.editingProduct = null;
    const form = document.getElementById('product-form');
    if (form) form.reset();

    this.selectUnit('Dus');
    document.getElementById('modal-product-title').textContent = 'Tambah Produk Baru';
    document.getElementById('prod-stock-container').classList.remove('hidden');
    App.openModal('product-modal');
  },

  openEditModal(productId) {
    const product = this.products.find(p => p.id === productId);
    if (!product) return;

    this.editingProduct = product;
    document.getElementById('modal-product-title').textContent = `Edit Produk: ${product.name}`;
    document.getElementById('prod-id').value = product.id;
    document.getElementById('prod-barcode').value = product.barcode || '';
    document.getElementById('prod-name').value = product.name;
    document.getElementById('prod-category').value = product.category;
    
    this.selectUnit(product.unit_large || 'Dus');
    document.getElementById('prod-conversion-qty').value = product.conversion_qty || 1;
    document.getElementById('prod-cost-price-large').value = product.cost_price_large || 0;
    document.getElementById('prod-cost-price').value = product.cost_price || 0;
    document.getElementById('prod-retail-price').value = product.retail_price || 0;
    document.getElementById('prod-wholesale-price').value = product.wholesale_price || 0;
    document.getElementById('prod-min-wholesale').value = product.min_wholesale_qty || 1;
    document.getElementById('prod-min-stock').value = product.min_stock || 10;

    // In edit mode, hide initial stock input to prevent accidents (use quick stock opname instead)
    document.getElementById('prod-stock-container').classList.add('hidden');

    App.openModal('product-modal');
  },

  async saveProduct() {
    const id = document.getElementById('prod-id')?.value;
    const barcode = document.getElementById('prod-barcode')?.value.trim();
    const name = document.getElementById('prod-name')?.value.trim();
    const category = document.getElementById('prod-category')?.value.trim() || 'Umum';
    const unit_large = document.getElementById('prod-unit-large')?.value.trim() || 'Dus';
    const unit_small = 'Biji';
    const conversion_qty = Number(document.getElementById('prod-conversion-qty')?.value) || 1;
    const cost_price_large = Number(document.getElementById('prod-cost-price-large')?.value) || 0;
    const cost_price = Number(document.getElementById('prod-cost-price')?.value) || 0;
    const retail_price = Number(document.getElementById('prod-retail-price')?.value) || 0;
    const wholesale_price = Number(document.getElementById('prod-wholesale-price')?.value) || 0;
    const min_wholesale_qty = Number(document.getElementById('prod-min-wholesale')?.value) || 1;
    const min_stock = Number(document.getElementById('prod-min-stock')?.value) || 10;

    if (!name) {
      App.toast('Nama produk wajib diisi!', 'warning');
      return;
    }

    const payload = {
      barcode,
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
    };

    try {
      let res;
      if (this.editingProduct) {
        res = await fetch(`/api/products/${this.editingProduct.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        payload.stock_large = Number(document.getElementById('prod-stock-large')?.value) || 0;
        payload.stock_small = Number(document.getElementById('prod-stock-small')?.value) || 0;
        res = await fetch('/api/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }

      const result = await res.json();
      if (!result.success) {
        App.toast(result.message || 'Gagal menyimpan produk.', 'error');
        return;
      }

      App.toast(result.message, 'success');
      App.closeModal('product-modal');
      this.loadProducts();
      if (window.POS && typeof POS.loadProducts === 'function') {
        POS.loadProducts();
      }
      if (window.PurchasesManager && typeof PurchasesManager.loadPurchases === 'function') {
        PurchasesManager.loadPurchases();
      }
    } catch (err) {
      console.error('Error saving product:', err);
      App.toast('Terjadi kesalahan pada server.', 'error');
    }
  },

  // QUICK MODAL (COST PRICE) EDIT
  openQuickCostModal(productId) {
    const product = this.products.find(p => p.id === productId);
    if (!product) return;

    this.activeQuickProduct = product;
    document.getElementById('quick-cost-id').value = product.id;
    document.getElementById('quick-cost-name').textContent = product.name;

    const unitInfoElem = document.getElementById('quick-cost-unit-info');
    const largeWrap = document.getElementById('quick-cost-large-wrap');
    const largeLabel = document.getElementById('quick-cost-large-label');
    const largeInput = document.getElementById('quick-cost-large-input');
    const smallInput = document.getElementById('quick-cost-small-input');

    const hasConversion = product.conversion_qty > 1;

    if (unitInfoElem) {
      unitInfoElem.textContent = hasConversion
        ? `Satuan: 1 ${product.unit_large} = ${product.conversion_qty} ${product.unit_small}`
        : `Satuan: ${product.unit_small}`;
    }

    if (largeWrap && largeLabel) {
      if (hasConversion) {
        largeWrap.classList.remove('hidden');
        largeLabel.textContent = `Modal per ${product.unit_large} (Rp):`;
      } else {
        largeWrap.classList.add('hidden');
      }
    }

    if (largeInput) largeInput.value = product.cost_price_large || (product.cost_price * product.conversion_qty);
    if (smallInput) smallInput.value = product.cost_price || 0;

    App.openModal('quick-cost-modal');
  },

  async saveQuickCost() {
    const id = document.getElementById('quick-cost-id').value;
    const costLarge = Number(document.getElementById('quick-cost-large-input').value) || 0;
    const costSmall = Number(document.getElementById('quick-cost-small-input').value) || 0;

    try {
      const res = await fetch(`/api/products/${id}/cost`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cost_price_large: costLarge, cost_price: costSmall })
      });
      const result = await res.json();
      if (result.success) {
        App.toast(result.message, 'success');
        App.closeModal('quick-cost-modal');
        this.loadProducts();
        if (window.POS && typeof POS.loadProducts === 'function') {
          POS.loadProducts();
        }
      } else {
        App.toast(result.message, 'error');
      }
    } catch (err) {
      App.toast('Gagal mengubah modal produk.', 'error');
    }
  },

  // QUICK STOCK (PENYESUAIAN STOK) EDIT
  openQuickStockModal(productId) {
    const product = this.products.find(p => p.id === productId);
    if (!product) return;

    this.activeQuickProduct = product;
    document.getElementById('quick-stock-id').value = product.id;
    document.getElementById('quick-stock-name').textContent = product.name;
    document.getElementById('quick-stock-current').textContent = product.stock_display;

    const largeWrap = document.getElementById('quick-stock-large-wrap');
    const largeLabel = document.getElementById('quick-stock-large-label');
    const largeInput = document.getElementById('quick-stock-large-input');
    const smallLabel = document.getElementById('quick-stock-small-label');
    const smallInput = document.getElementById('quick-stock-small-input');
    const previewElem = document.getElementById('quick-stock-calc-preview');

    const conv = Math.max(1, Number(product.conversion_qty) || 1);

    if (conv > 1) {
      if (largeWrap) largeWrap.classList.remove('hidden');
      if (largeLabel) largeLabel.textContent = `${product.unit_large}:`;
      if (smallLabel) smallLabel.textContent = `${product.unit_small} (Eceran):`;

      const currentLarge = Math.floor(product.stock / conv);
      const currentSmall = Math.round(product.stock % conv);

      if (largeInput) largeInput.value = currentLarge;
      if (smallInput) smallInput.value = currentSmall;
      if (previewElem) previewElem.textContent = `${currentLarge} ${product.unit_large} + ${currentSmall} ${product.unit_small} = Total ${product.stock} ${product.unit_small}`;
    } else {
      if (largeWrap) largeWrap.classList.add('hidden');
      if (smallLabel) smallLabel.textContent = `Jumlah Fisik (${product.unit_small}):`;
      if (largeInput) largeInput.value = 0;
      if (smallInput) smallInput.value = product.stock;
      if (previewElem) previewElem.textContent = `${product.stock} ${product.unit_small}`;
    }

    document.getElementById('quick-stock-notes').value = 'Penyesuaian stok manual / Stock Opname';
    App.openModal('quick-stock-modal');
  },

  async saveQuickStock() {
    const id = document.getElementById('quick-stock-id').value;
    const stockLarge = Number(document.getElementById('quick-stock-large-input').value) || 0;
    const stockSmall = Number(document.getElementById('quick-stock-small-input').value) || 0;
    const reason = document.getElementById('quick-stock-reason')?.value || 'PENYESUAIAN';
    const notes = document.getElementById('quick-stock-notes')?.value || '';

    try {
      const res = await fetch(`/api/products/${id}/stock`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stock_large: stockLarge, stock_small: stockSmall, reason, notes })
      });
      const result = await res.json();
      if (result.success) {
        App.toast(result.message, 'success');
        App.closeModal('quick-stock-modal');
        this.loadProducts();
        if (window.POS && typeof POS.loadProducts === 'function') {
          POS.loadProducts();
        }
        if (window.MutationsManager && typeof MutationsManager.loadMutations === 'function') {
          MutationsManager.loadMutations();
        }
      } else {
        App.toast(result.message, 'error');
      }
    } catch (err) {
      App.toast('Gagal menyesuaikan stok produk.', 'error');
    }
  },

  async deleteProduct(productId) {
    const product = this.products.find(p => p.id === productId);
    if (!product) return;

    if (!confirm(`Yakin ingin menghapus produk "${product.name}"?`)) return;

    try {
      const res = await fetch(`/api/products/${productId}`, { method: 'DELETE' });
      const result = await res.json();
      if (result.success) {
        App.toast(result.message, 'success');
        this.loadProducts();
      } else {
        App.toast(result.message, 'error');
      }
    } catch (err) {
      App.toast('Gagal menghapus produk.', 'error');
    }
  }
};

window.ProductsManager = ProductsManager;
