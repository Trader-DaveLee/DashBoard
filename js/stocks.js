/**
 * Stocks View Manager (TradingView Integration)
 * V0.1.0: First Implementation with AAPL default
 */
export class StocksManager {
  constructor() {
    this.widget = null;
    this.initialized = false;
    this.containerId = 'tradingview-widget-container';
  }

  /**
   * Initialize or Refresh the Stocks View
   */
  init() {
    const container = document.getElementById(this.containerId);
    if (!container) return;

    // If already initialized, we might not need to re-init unless theme changed
    if (this.initialized) return;

    this.renderWidget();
    this.initialized = true;
  }

  /**
   * Render TradingView Advanced Chart Widget
   */
  renderWidget() {
    const theme = document.documentElement.getAttribute('data-theme') || 'light';
    
    // Check if TradingView library is loaded
    if (typeof TradingView === 'undefined') {
      console.warn('[Stocks] TradingView library not loaded yet. Retrying...');
      setTimeout(() => this.renderWidget(), 500);
      return;
    }

    try {
      this.widget = new TradingView.widget({
        "autosize": true,
        "symbol": "NASDAQ:AAPL",
        "interval": "D",
        "timezone": "Asia/Seoul",
        "theme": theme === 'dark' ? 'dark' : 'light',
        "style": "1",
        "locale": "ko",
        "toolbar_bg": theme === 'dark' ? '#161c2d' : '#f1f5f9',
        "enable_publishing": false,
        "hide_side_toolbar": false,
        "allow_symbol_change": true,
        "details": true,
        "hotlist": true,
        "calendar": true,
        "container_id": this.containerId
      });
    } catch (err) {
      console.error('[Stocks] Failed to render TradingView widget:', err);
    }
  }

  /**
   * Update theme and re-render if necessary
   */
  updateTheme() {
    if (!this.initialized) return;
    // TradingView widget needs a full re-render for theme change
    this.renderWidget();
  }
}

export const stocksManager = new StocksManager();
window.stocksManager = stocksManager; // For global access if needed
