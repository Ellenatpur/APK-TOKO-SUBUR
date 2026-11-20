// Riwayat Mutasi Stok (Keluar - Masuk) Management
const MutationsManager = {
  mutationsList: [],
  productsList: [],

  init() {
    this.setupEventListeners();
  },

  setupEventListeners() {
    const searchInput = document.getElementById('mutation-search');
    if (searchInput) {
      searchInput.addEventListener('input', () => this.loadMutations());
    }

    const typeFilter = document.getElementById('mutation-type-filter');
    if (typeFilter) {
      typeFilter.addEventListener('change', () => this.loadMutations());
    }

    const reasonFilter = document.getElementById('mutation-reason-filter');
    if (reasonFilter) {
      reasonFilter.addEventListener('change', () => this.loadMutations());
    }

    const dateFilter = document.getElementById('mutation-date-filter');
    if (dateFilter) {
      dateFilter.addEventListener('change', () => this.loadMutations());
    }

    // Manual mutation form submit
    const manualForm = document.getElementById('manual-mutation-form');
    if (manualForm) {
      manualForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveManualMutation();
      });
    }
  },

  async loadMutations() {
    try {
      const q = document.getElementById('mutation-search')?.value.trim() || '';
      const type = document.getElementById('mutation-type-filter')?.value || 'Semua';
      const reason = document.getElementById('mutation-reason-filter')?.value || 'Semua';
      const date = document.getElementById('mutation-date-filter')?.value || '';

      let url = `/api/mutations?limit=250`;
      if (q) url += `&q=${encodeURIComponent(q)}`;
      if (type !== 'Semua') url += `&type=${encodeURIComponent(type)}`;
      if (reason !== 'Semua') url += `&reason=${encodeURIComponent(reason)}`;
      if (date) url += `&start_date=${encodeURIComponent(date)}`;

      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        this.mutationsList = data.data;
        this.renderMutationsTable();
      }

      // Also ensure products are loaded for manual mutation select dropdown
      if (this.productsList.length === 0) {
        const pRes = await fetch('/api/products');
        const pData = await pRes.json();
        if (pData.success) {
          this.productsList = pData.data;
          this.populateProductSelect();
        }
      }
    } catch (err) {
      console.error('Error loading mutations:', err);
    }
  },

  populateProductSelect() {
    const select = document.getElementById('manual-mut-product');
    if (!select) return;

    select.innerHTML = '<option value="">-- Pilih Barang --</option>' +
      this.productsList.map(p => `
        <option value="${p.id}">${p.name} (Stok: ${p.stock} ${p.unit})</option>
      `).join('');
  },

  renderMutationsTable() {
    const tbody = document.getElementById('mutations-tbody');
    const emptyMsg = document.getElementById('mutations-empty');
    if (!tbody) return;

    if (this.mutationsList.length === 0) {
      tbody.innerHTML = '';
      if (emptyMsg) emptyMsg.classList.remove('hidden');
      return;
    }

    if (emptyMsg) emptyMsg.classList.add('hidden');

    tbody.innerHTML = this.mutationsList.map(m => {
      const isMasuk = m.type === 'MASUK';
      const typeBadge = isMasuk
        ? `<span class="px-2 py-0.5 text-xs font-bold rounded bg-green-100 text-green-700">MASUK (+)</span>`
        : `<span class="px-2 py-0.5 text-xs font-bold rounded bg-red-100 text-red-700">KELUAR (-)</span>`;

      const qtyDisplay = isMasuk
        ? `<span class="text-green-600 font-bold">+${m.qty}</span>`
        : `<span class="text-red-600 font-bold">-${m.qty}</span>`;

      return `
        <tr class="border-b border-gray-100 text-sm hover:bg-gray-50">
          <td class="py-2.5 px-3 text-xs text-gray-600">${App.formatDate(m.date)}</td>
          
          <td class="py-2.5 px-3">
            <div class="font-bold text-gray-800">${m.product_name}</div>
            <div class="text-[11px] text-gray-500 font-mono">${m.barcode || '-'}</div>
          </td>

          <td class="py-2.5 px-3">${typeBadge}</td>

          <td class="py-2.5 px-3 text-xs font-semibold text-gray-700">
            ${m.reason}
          </td>

          <td class="py-2.5 px-3 text-center text-sm font-medium">
            ${qtyDisplay} <span class="text-xs text-gray-500">${m.unit || ''}</span>
          </td>

          <td class="py-2.5 px-3 text-center text-xs text-gray-600">
            ${m.stock_before} &rarr; <span class="font-bold text-gray-800">${m.stock_after}</span>
          </td>

          <td class="py-2.5 px-3 font-mono text-xs text-gray-600">
            ${m.reference_no || '-'}
          </td>

          <td class="py-2.5 px-3 text-xs text-gray-500">
            ${m.notes || '-'}
          </td>

          <td class="py-2.5 px-3 text-right">
            <button onclick="MutationsManager.openEditMutationModal(${m.id})" class="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded border border-blue-200" title="Edit Catatan">
              Edit
            </button>
          </td>
        </tr>
      `;
    }).join('');
  },

  openManualMutationModal() {
    this.populateProductSelect();
    const form = document.getElementById('manual-mutation-form');
    if (form) form.reset();

    const dateInput = document.getElementById('manual-mut-date');
    if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];

    App.openModal('manual-mutation-modal');
  },

  async saveManualMutation() {
    const product_id = Number(document.getElementById('manual-mut-product')?.value);
    const type = document.getElementById('manual-mut-type')?.value;
    const reason = document.getElementById('manual-mut-reason')?.value;
    const qty = Number(document.getElementById('manual-mut-qty')?.value);
    const date = document.getElementById('manual-mut-date')?.value;
    const notes = document.getElementById('manual-mut-notes')?.value.trim();

    if (!product_id) {
      App.toast('Pilih barang terlebih dahulu!', 'warning');
      return;
    }
    if (!qty || qty <= 0) {
      App.toast('Jumlah barang harus lebih dari 0!', 'warning');
      return;
    }

    try {
      const res = await fetch('/api/mutations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id, type, reason, qty, date, notes })
      });

      const result = await res.json();
      if (!result.success) {
        App.toast(result.message || 'Gagal menyimpan mutasi.', 'error');
        return;
      }

      App.toast(result.message, 'success');
      App.closeModal('manual-mutation-modal');
      this.loadMutations();
    } catch (err) {
      console.error(err);
      App.toast('Terjadi kesalahan pada server.', 'error');
    }
  },

  openEditMutationModal(id) {
    const m = this.mutationsList.find(x => x.id === id);
    if (!m) return;

    document.getElementById('edit-mut-id').value = m.id;
    document.getElementById('edit-mut-title').textContent = `Edit Catatan Mutasi: ${m.product_name}`;
    document.getElementById('edit-mut-reason').value = m.reason;
    document.getElementById('edit-mut-notes').value = m.notes || '';
    document.getElementById('edit-mut-date').value = m.date;

    App.openModal('edit-mutation-modal');
  },

  async saveEditMutation() {
    const id = document.getElementById('edit-mut-id').value;
    const reason = document.getElementById('edit-mut-reason').value;
    const notes = document.getElementById('edit-mut-notes').value.trim();
    const date = document.getElementById('edit-mut-date').value;

    try {
      const res = await fetch(`/api/mutations/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, notes, date })
      });
      const result = await res.json();
      if (result.success) {
        App.toast(result.message, 'success');
        App.closeModal('edit-mutation-modal');
        this.loadMutations();
      } else {
        App.toast(result.message, 'error');
      }
    } catch (err) {
      App.toast('Gagal memperbarui mutasi.', 'error');
    }
  }
};

window.MutationsManager = MutationsManager;
