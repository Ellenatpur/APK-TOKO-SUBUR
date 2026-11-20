// Global Application State & Helpers
const App = {
  activeTab: 'pos',
  storeSettings: {},

  init() {
    this.setupNavigation();
    this.loadStoreSettings();
    
    // Initialize components
    if (window.POS) POS.init();
    if (window.ProductsManager) ProductsManager.init();
    if (window.PurchasesManager) PurchasesManager.init();
    if (window.MutationsManager) MutationsManager.init();
    if (window.SalesHistoryManager) SalesHistoryManager.init();
    if (window.ReportsManager) ReportsManager.init();
    if (window.SettingsManager) SettingsManager.init();
  },

  // Setup main navigation tabs
  setupNavigation() {
    const tabs = document.querySelectorAll('.nav-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        e.preventDefault();
        const targetTab = tab.getAttribute('data-tab');
        this.switchTab(targetTab);
      });
    });
  },

  switchTab(tabId) {
    this.activeTab = tabId;

    // Update active tab buttons
    document.querySelectorAll('.nav-tab').forEach(tab => {
      if (tab.getAttribute('data-tab') === tabId) {
        tab.classList.add('active', 'bg-blue-600', 'text-white');
        tab.classList.remove('text-gray-700', 'hover:bg-gray-100');
      } else {
        tab.classList.remove('active', 'bg-blue-600', 'text-white');
        tab.classList.add('text-gray-700', 'hover:bg-gray-100');
      }
    });

    // Show selected panel, hide others
    document.querySelectorAll('.tab-panel').forEach(panel => {
      panel.classList.add('hidden');
    });

    const targetPanel = document.getElementById(`panel-${tabId}`);
    if (targetPanel) {
      targetPanel.classList.remove('hidden');
    }

    // Refresh view data when switching
    if (tabId === 'pos' && window.POS) POS.onShow();
    if (tabId === 'products' && window.ProductsManager) ProductsManager.loadProducts();
    if (tabId === 'purchases' && window.PurchasesManager) PurchasesManager.loadPurchases();
    if (tabId === 'mutations' && window.MutationsManager) MutationsManager.loadMutations();
    if (tabId === 'sales-history' && window.SalesHistoryManager) SalesHistoryManager.loadSales();
    if (tabId === 'reports' && window.ReportsManager) ReportsManager.loadRecap();
    if (tabId === 'settings' && window.SettingsManager) SettingsManager.loadSettings();
  },

  // Load store settings
  async loadStoreSettings() {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      if (data.success) {
        this.storeSettings = data.data;
        const brandElem = document.getElementById('store-brand-name');
        if (brandElem && this.storeSettings.store_name) {
          brandElem.textContent = this.storeSettings.store_name;
        }
      }
    } catch (err) {
      console.error('Failed to load store settings:', err);
    }
  },

  // Format currency: 25000 -> "Rp 25.000"
  formatRupiah(number) {
    const val = Number(number) || 0;
    return 'Rp ' + Math.round(val).toLocaleString('id-ID');
  },

  // Parse formatted currency string back to number
  parseRupiah(str) {
    if (typeof str === 'number') return str;
    if (!str) return 0;
    const clean = str.replace(/[^0-9-]/g, '');
    return Number(clean) || 0;
  },

  // Format date: "2026-11-18" -> "18 Nov 2026"
  formatDate(dateStr) {
    if (!dateStr) return '-';
    try {
      const parts = dateStr.split('T')[0].split('-');
      if (parts.length === 3) {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
        return `${parseInt(parts[2], 10)} ${months[parseInt(parts[1], 10) - 1]} ${parts[0]}`;
      }
      return dateStr;
    } catch {
      return dateStr;
    }
  },

  // Toast notifications
  toast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '❌';
    if (type === 'warning') icon = '⚠️';

    toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.transition = 'opacity 0.3s, transform 0.3s';
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  },

  // Quick Modal opener / closer
  openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('hidden');
      modal.classList.add('flex');
    }
  },

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  }
};

window.App = App;
