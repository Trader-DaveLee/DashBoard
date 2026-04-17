import { saveDB } from './storage.js';

/**
 * Stocks View Manager (Redesigned Grid & Detail View)
 * V0.2.1: Fix Circular Dependency (removed app.js import)
 */
class StocksManager {
  constructor() {
    this.currentPage = 1;
    this.pageSize = 10;
    this.saveTimeout = null;
    this.activeWidgets = [];
    this.editingId = null;
    this.activeDetailId = null;
  }

  /**
   * Initialize Stocks View
   */
  init() {
    const state = window.state;
    if (!state) return;

    // Ensure data structure exists
    if (!state.db.meta.stocks) {
      state.db.meta.stocks = [
        { id: crypto.randomUUID(), symbol: 'NASDAQ:AAPL', memo: '기본 샘플 종목입니다.', updatedAt: new Date().toISOString() }
      ];
      saveDB(state.db);
    }

    this.bindEvents();
    this.render();
  }

  /**
   * Event Bindings
   */
  bindEvents() {
    // Add Stock Button
    const addBtn = document.getElementById('add-stock-btn');
    if (addBtn) addBtn.onclick = () => this.showEditModal();

    // Pagination Buttons
    const prevBtn = document.getElementById('stocks-prev-btn');
    if (prevBtn) prevBtn.onclick = () => this.changePage(-1);
    const nextBtn = document.getElementById('stocks-next-btn');
    if (nextBtn) nextBtn.onclick = () => this.changePage(1);

    // Edit Modal Buttons
    const cancelEdit = document.getElementById('stocks-edit-cancel');
    if (cancelEdit) cancelEdit.onclick = () => this.hideModal('stocks-edit-modal');
    const confirmEdit = document.getElementById('stocks-edit-confirm');
    if (confirmEdit) confirmEdit.onclick = () => this.handleSaveStock();

    // Detail Modal Buttons
    const closeDetail = document.getElementById('stocks-detail-close');
    if (closeDetail) closeDetail.onclick = () => this.hideModal('stocks-detail-modal');

    // Memo Auto-Save
    const memoArea = document.getElementById('stocks-detail-memo');
    if (memoArea) {
      memoArea.oninput = () => {
        this.autoSaveMemo(memoArea.value);
      };
    }
    
    // Handle Enter key on symbol input
    const symbolInput = document.getElementById('stocks-symbol-input');
    if (symbolInput) {
      symbolInput.onkeydown = (e) => {
        if (e.key === 'Enter') this.handleSaveStock();
      };
    }
  }

  getStocks() {
    return window.state.db.meta.stocks || [];
  }

  /**
   * Main Grid Rendering
   */
  render() {
    const grid = document.getElementById('stocks-grid');
    if (!grid) return;

    const stocks = this.getStocks();
    const totalPages = Math.ceil(stocks.length / this.pageSize) || 1;
    if (this.currentPage > totalPages) this.currentPage = totalPages;

    // Update Page UI
    const pageDisplay = document.getElementById('stocks-page-display');
    if (pageDisplay) pageDisplay.innerText = this.currentPage;
    const pageInfo = document.getElementById('stocks-page-info');
    if (pageInfo) pageInfo.innerText = `Total ${stocks.length} | Page ${this.currentPage}/${totalPages}`;

    const start = (this.currentPage - 1) * this.pageSize;
    const end = start + this.pageSize;
    const pageItems = stocks.slice(start, end);

    this.cleanupWidgets();
    
    if (pageItems.length === 0) {
      grid.innerHTML = '<div class="empty-state" style="grid-column: span 2;">등록된 종목이 없습니다. 우측 상단 버튼을 눌러 추가하세요.</div>';
      return;
    }

    grid.innerHTML = pageItems.map((s, idx) => this.createCardHTML(s, start + idx)).join('');
    
    // Initialize Widgets for each card
    setTimeout(() => {
      pageItems.forEach(s => this.embedSymbolWidget(s.symbol, `tv-card-${s.id}`));
    }, 100);
  }

  createCardHTML(stock, globalIdx) {
    return `
      <div class="stock-card" onclick="stocksManager.showDetail('${stock.id}')">
        <div class="stock-card-header">
          <button type="button" class="btn-icon-sm" onclick="event.stopPropagation(); stocksManager.moveStock('${stock.id}', -1)">↑</button>
          <button type="button" class="btn-icon-sm" onclick="event.stopPropagation(); stocksManager.moveStock('${stock.id}', 1)">↓</button>
          <button type="button" class="btn-icon-sm" onclick="event.stopPropagation(); stocksManager.showEditModal('${stock.id}')">✎</button>
          <button type="button" class="btn-icon-sm danger-text" onclick="event.stopPropagation(); stocksManager.deleteStock('${stock.id}')">✕</button>
        </div>
        <div id="tv-card-${stock.id}" class="tv-widget-wrapper">
          <div style="padding: 24px; color: var(--text-muted); font-size: 11px; font-weight: 700;">Loading ${stock.symbol}...</div>
        </div>
      </div>
    `;
  }

  /**
   * Inject Symbol Info Widget
   */
  embedSymbolWidget(symbol, containerId) {
    const theme = document.documentElement.getAttribute('data-theme') || 'light';
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = ''; // Clear loading text
    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-symbol-info.js';
    script.async = true;
    script.innerHTML = JSON.stringify({
      "symbol": symbol,
      "width": "100%",
      "locale": "ko",
      "colorTheme": theme,
      "isTransparent": false
    });
    container.appendChild(script);
    this.activeWidgets.push(containerId);
  }

  cleanupWidgets() {
    this.activeWidgets = [];
  }

  changePage(dir) {
    const stocks = this.getStocks();
    const totalPages = Math.ceil(stocks.length / this.pageSize) || 1;
    const next = this.currentPage + dir;
    if (next < 1 || next > totalPages) return;
    this.currentPage = next;
    this.render();
  }

  // --- Modal Management ---
  showEditModal(id = null) {
    this.editingId = id;
    const modal = document.getElementById('stocks-edit-modal');
    const title = document.getElementById('stocks-modal-title');
    const input = document.getElementById('stocks-symbol-input');
    
    if (id) {
      const stock = this.getStocks().find(s => s.id === id);
      input.value = stock ? stock.symbol : '';
      title.innerText = '종목 수정';
    } else {
      input.value = '';
      title.innerText = '종목 추가';
    }
    
    modal.classList.add('show');
    setTimeout(() => input.focus(), 100);
  }

  handleSaveStock() {
    const input = document.getElementById('stocks-symbol-input');
    let symbol = input.value.trim().toUpperCase();
    if (!symbol) return;
    
    // Auto format: If no market specified, default to NASDAQ or similar (optional)
    // Here we just use what user typed.

    const stocks = this.getStocks();
    if (this.editingId) {
      const stock = stocks.find(s => s.id === this.editingId);
      if (stock) {
        stock.symbol = symbol;
        stock.updatedAt = new Date().toISOString();
      }
    } else {
      stocks.unshift({
        id: crypto.randomUUID(),
        symbol: symbol,
        memo: '',
        updatedAt: new Date().toISOString()
      });
    }

    saveDB(window.state.db);
    this.hideModal('stocks-edit-modal');
    this.render();
  }

  deleteStock(id) {
    if (!confirm('이 종목을 삭제하시겠습니까?')) return;
    window.state.db.meta.stocks = this.getStocks().filter(s => s.id !== id);
    saveDB(window.state.db);
    this.render();
  }

  moveStock(id, dir) {
    const stocks = this.getStocks();
    const idx = stocks.findIndex(s => s.id === id);
    if (idx === -1) return;

    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= stocks.length) return;

    // Swap positions
    const temp = stocks[idx];
    stocks[idx] = stocks[targetIdx];
    stocks[targetIdx] = temp;
    
    saveDB(window.state.db);
    this.render();
  }

  // --- Detail View (Analysis) ---
  showDetail(id) {
    const stock = this.getStocks().find(s => s.id === id);
    if (!stock) return;

    this.activeDetailId = id;
    const modal = document.getElementById('stocks-detail-modal');
    const title = document.getElementById('stocks-detail-title');
    const memo = document.getElementById('stocks-detail-memo');
    
    title.innerText = stock.symbol;
    memo.value = stock.memo || '';
    
    modal.classList.add('show');
    
    // Use setTimeout to ensure DOM is ready for TradingView injection
    setTimeout(() => {
      this.embedDetailWidgets(stock.symbol);
      if (typeof window.autoResize === 'function') {
        window.autoResize(memo);
      }
    }, 50);
  }

  embedDetailWidgets(symbol) {
    const theme = document.documentElement.getAttribute('data-theme') || 'light';
    const chartContainer = document.getElementById('detail-chart-container');
    const financialsContainer = document.getElementById('detail-financials-container');
    
    chartContainer.innerHTML = '<div style="padding: 24px; color: var(--text-muted);">Loading Chart...</div>';
    financialsContainer.innerHTML = '<div style="padding: 24px; color: var(--text-muted);">Loading Financials...</div>';

    // 1. Mini Chart Widget
    const scriptChart = document.createElement('script');
    scriptChart.type = 'text/javascript';
    scriptChart.src = 'https://s3.tradingview.com/external-embedding/embed-widget-mini-symbol-overview.js';
    scriptChart.async = true;
    scriptChart.innerHTML = JSON.stringify({
      "symbol": symbol,
      "width": "100%",
      "height": "100%",
      "locale": "ko",
      "dateRange": "12M",
      "colorTheme": theme,
      "trendLineColor": "rgba(41, 98, 255, 1)",
      "underLineColor": "rgba(41, 98, 255, 0.3)",
      "underLineBottomColor": "rgba(41, 98, 255, 0)",
      "isTransparent": false,
      "autosize": true,
      "largeChartUrl": ""
    });
    chartContainer.innerHTML = '';
    chartContainer.appendChild(scriptChart);

    // 2. Financials Widget
    const scriptFin = document.createElement('script');
    scriptFin.type = 'text/javascript';
    scriptFin.src = 'https://s3.tradingview.com/external-embedding/embed-widget-financials.js';
    scriptFin.async = true;
    scriptFin.innerHTML = JSON.stringify({
      "colorTheme": theme,
      "isTransparent": false,
      "largeChartUrl": "",
      "displayMode": "regular",
      "width": "100%",
      "height": "100%",
      "symbol": symbol,
      "locale": "ko"
    });
    financialsContainer.innerHTML = '';
    financialsContainer.appendChild(scriptFin);
  }

  autoSaveMemo(value) {
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    const statusLabel = document.getElementById('stocks-save-status');
    if (statusLabel) statusLabel.innerText = '저장 중...';

    this.saveTimeout = setTimeout(() => {
      const stock = this.getStocks().find(s => s.id === this.activeDetailId);
      if (stock) {
        stock.memo = value;
        stock.updatedAt = new Date().toISOString();
        saveDB(window.state.db);
        if (statusLabel) statusLabel.innerText = '자동 저장됨';
      }
    }, 800);
  }

  hideModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('show');
    if (id === 'stocks-detail-modal') {
      this.activeDetailId = null;
    }
  }

  /**
   * Update theme and re-render
   */
  updateTheme() {
    // If detail modal is open, re-render its widgets
    const detailModal = document.getElementById('stocks-detail-modal');
    if (detailModal && detailModal.classList.contains('show') && this.activeDetailId) {
      const stock = this.getStocks().find(s => s.id === this.activeDetailId);
      if (stock) this.embedDetailWidgets(stock.symbol);
    }
    // Re-render main grid
    this.render();
  }
}

export const stocksManager = new StocksManager();
window.stocksManager = stocksManager;
