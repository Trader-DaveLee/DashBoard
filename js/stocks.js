import { saveDB, saveMetaToFirebase } from './storage.js';

/**
 * Stocks View Manager (Redesigned Grid & Detail View)
 * V0.3.0: Dynamic Sorting, Advanced TV Widget, Datalist Suggestions
 */
class StocksManager {
  constructor() {
    this.currentPage = 1;
    this.pageSize = 10;
    this.saveTimeout = null;
    this.activeWidgets = [];
    this.editingId = null;
    this.activeDetailId = null;
    this.sortMode = 'newest'; // Default: Newest first
    this.initialized = false;
  }

  /**
   * Sync with Local and Firebase
   */
  syncData() {
    const state = window.state;
    if (!state) return;
    
    saveDB(state.db);
    if (state.user) {
      saveMetaToFirebase(state.user, state.db.meta).catch(err => {
        console.error('[StocksManager Sync Error]', err);
      });
    }
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
      this.syncData();
    }

    if (this.initialized) return;
    this.bindEvents();
    this.initialized = true;
    this.render();
  }

  /**
   * Event Bindings
   */
  bindEvents() {
    // Add Stock Button
    const addBtn = document.getElementById('add-stock-btn');
    if (addBtn) addBtn.onclick = () => this.showEditModal();

    // Sort Select
    const sortSelect = document.getElementById('stocks-sort-select');
    if (sortSelect) {
      sortSelect.onchange = (e) => {
        this.sortMode = e.target.value;
        this.render();
      };
    }

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

    // Memo Auto-Save & Rich Formatting
    const memoArea = document.getElementById('stocks-detail-memo');
    if (memoArea) {
      memoArea.oninput = () => {
        this.autoSaveMemo(memoArea.innerHTML);
      };
      // Prevent HTML formatting on paste
      memoArea.onpaste = (e) => {
        e.preventDefault();
        const text = e.clipboardData.getData('text/plain');
        document.execCommand('insertText', false, text);
      };
    }

    // Toolbar Commands
    document.querySelectorAll('.memo-toolbar .tool-btn').forEach(btn => {
      btn.onclick = (e) => {
        e.preventDefault();
        const cmd = btn.dataset.command;
        if (cmd) {
          document.execCommand(cmd, false, null);
          memoArea.focus();
          this.autoSaveMemo(memoArea.innerHTML);
        }
      };
    });
    
    // Handle Enter key on symbol input
    const symbolInput = document.getElementById('stocks-symbol-input');
    if (symbolInput) {
      symbolInput.onkeydown = (e) => {
        if (e.key === 'Enter') this.handleSaveStock();
      };
    }
  }

  getSortedStocks() {
    const stocks = [...(window.state.db.meta.stocks || [])];
    
    switch (this.sortMode) {
      case 'newest':
        return stocks.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
      case 'oldest':
        return stocks.sort((a, b) => new Date(a.updatedAt) - new Date(b.updatedAt));
      case 'abc':
        return stocks.sort((a, b) => a.symbol.localeCompare(b.symbol));
      case 'manual':
      default:
        // Assume the array order itself is the manual order
        return stocks;
    }
  }

  /**
   * Main Grid Rendering
   */
  render() {
    const grid = document.getElementById('stocks-grid');
    if (!grid) return;

    const stocks = this.getSortedStocks();
    const totalPages = Math.ceil(stocks.length / this.pageSize) || 1;
    if (this.currentPage > totalPages) this.currentPage = totalPages;

    // Update Page UI
    const pageDisplay = document.getElementById('stocks-page-display');
    if (pageDisplay) pageDisplay.innerText = this.currentPage;
    const pageInfo = document.getElementById('stocks-page-info');
    if (pageInfo) pageInfo.innerText = `Total ${stocks.length} stocks | Page ${this.currentPage}/${totalPages}`;

    const start = (this.currentPage - 1) * this.pageSize;
    const end = start + this.pageSize;
    const pageItems = stocks.slice(start, end);

    this.cleanupWidgets();
    
    if (pageItems.length === 0) {
      grid.innerHTML = '<div class="empty-state" style="grid-column: span 2;">등록된 종목이 없습니다. 우측 상단 버튼을 눌러 추가하세요.</div>';
      return;
    }

    grid.innerHTML = pageItems.map((s, idx) => this.createCardHTML(s, start + idx)).join('');
    
    // Initialize Widgets for each card (Desktop only for performance)
    const isMobile = window.innerWidth <= 768;
    if (!isMobile) {
      setTimeout(() => {
        pageItems.forEach(s => this.embedSymbolWidget(s.symbol, `tv-card-${s.id}`));
      }, 100);
    }
  }

  createCardHTML(stock, globalIdx) {
    const isMobile = window.innerWidth <= 768;
    
    if (isMobile) {
      return `
        <div class="stock-card" onclick="stocksManager.showDetail('${stock.id}')">
          <div class="stock-card-header">
            <button type="button" class="btn-icon-sm danger-text" onclick="event.stopPropagation(); stocksManager.deleteStock('${stock.id}')">✕</button>
          </div>
          <div style="padding: 0 4px 8px;">
            <div style="font-size: 18px; font-weight: 900; color: var(--text-main);">${stock.symbol}</div>
            <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">클릭하여 상세 분석/메모 확인</div>
          </div>
        </div>
      `;
    }

    return `
      <div class="stock-card" onclick="stocksManager.showDetail('${stock.id}')">
        <div class="stock-card-header">
          <button type="button" class="btn-icon-sm" onclick="event.stopPropagation(); stocksManager.moveStock('${stock.id}', -1)">↑</button>
          <button type="button" class="btn-icon-sm" onclick="event.stopPropagation(); stocksManager.moveStock('${stock.id}', 1)">↓</button>
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

    container.innerHTML = '';
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
    const stocks = window.state.db.meta.stocks || [];
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
      const stock = (window.state.db.meta.stocks || []).find(s => s.id === id);
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
    
    const stocks = window.state.db.meta.stocks || [];
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

    this.syncData();
    this.hideModal('stocks-edit-modal');
    this.render();
  }

  deleteStock(id) {
    if (!confirm('이 종목을 삭제하시겠습니까?')) return;
    window.state.db.meta.stocks = (window.state.db.meta.stocks || []).filter(s => s.id !== id);
    this.syncData();
    this.render();
  }

  moveStock(id, dir) {
    // Automatically switch to manual mode if not already
    if (this.sortMode !== 'manual') {
      this.sortMode = 'manual';
      const sortSelect = document.getElementById('stocks-sort-select');
      if (sortSelect) sortSelect.value = 'manual';
    }

    const stocks = window.state.db.meta.stocks || [];
    const idx = stocks.findIndex(s => s.id === id);
    if (idx === -1) return;

    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= stocks.length) return;

    // Swap positions
    const temp = stocks[idx];
    stocks[idx] = stocks[targetIdx];
    stocks[targetIdx] = temp;
    
    this.syncData();
    this.render();
  }

  // --- Detail View (Analysis) ---
  showDetail(id) {
    const stock = (window.state.db.meta.stocks || []).find(s => s.id === id);
    if (!stock) return;

    this.activeDetailId = id;
    const modal = document.getElementById('stocks-detail-modal');
    const title = document.getElementById('stocks-detail-title');
    const memo = document.getElementById('stocks-detail-memo');
    
    title.innerText = stock.symbol;
    memo.innerHTML = stock.memo || '';
    
    modal.classList.add('show');
    
    setTimeout(() => {
      const scrollArea = modal.querySelector('.stocks-detail-scroll-area');
      if (scrollArea) scrollArea.scrollTop = 0;
      
      this.embedDetailWidgets(stock.symbol);
      // Contenteditable doesn't need autoResize, but we keep the logic consistent if needed
    }, 50);
  }

  embedDetailWidgets(symbol) {
    const theme = document.documentElement.getAttribute('data-theme') || 'light';
    const chartContainerId = 'detail-chart-container';
    const financialsContainer = document.getElementById('detail-financials-container');
    const isMobile = window.innerWidth <= 768;
    
    // 1. Advanced Real-Time Chart Widget
    if (window.TradingView) {
      new window.TradingView.widget({
        "width": "100%",
        "height": isMobile ? "100%" : "100%", // Controlled by CSS on mobile
        "symbol": symbol,
        "interval": "D", // Daily timeframe
        "timezone": "Etc/UTC",
        "theme": theme,
        "style": "1",
        "locale": "ko",
        "toolbar_bg": "#f1f3f6",
        "enable_publishing": false,
        "allow_symbol_change": true,
        "container_id": chartContainerId
      });
    }

    // 2. Financials Widget
    financialsContainer.innerHTML = '<div style="padding: 24px; color: var(--text-muted);">Loading Financials...</div>';
    
    // Force height via JS to overcome CSS specificity/caching issues
    if (isMobile) {
      financialsContainer.style.setProperty('height', '650px', 'important');
      financialsContainer.style.setProperty('min-height', '650px', 'important');
    } else {
      financialsContainer.style.setProperty('height', 'auto', 'important');
      financialsContainer.style.setProperty('min-height', '800px', 'important');
    }

    const scriptFin = document.createElement('script');
    scriptFin.type = 'text/javascript';
    scriptFin.src = 'https://s3.tradingview.com/external-embedding/embed-widget-financials.js';
    scriptFin.async = true;
    scriptFin.innerHTML = JSON.stringify({
      "colorTheme": theme,
      "isTransparent": false,
      "largeChartUrl": "",
      "displayMode": isMobile ? "compact" : "regular",
      "width": "100%",
      "height": "100%", // Responsive to container
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
      const stock = (window.state.db.meta.stocks || []).find(s => s.id === this.activeDetailId);
      if (stock) {
        stock.memo = value;
        stock.updatedAt = new Date().toISOString();
        this.syncData();
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
    const detailModal = document.getElementById('stocks-detail-modal');
    if (detailModal && detailModal.classList.contains('show') && this.activeDetailId) {
      const stock = (window.state.db.meta.stocks || []).find(s => s.id === this.activeDetailId);
      if (stock) this.embedDetailWidgets(stock.symbol);
    }
    this.render();
  }
}

export const stocksManager = new StocksManager();
window.stocksManager = stocksManager;
