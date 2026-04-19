import { saveDB, saveMetaToFirebase } from './storage.js';

export const macroManager = {
  initialized: false,
  charts: {},

  init() {
    const state = window.state;
    const els = window.els;
    if (this.initialized) return;
    this.bindEvents();
    this.loadBriefings();
    this.initialized = true;
    console.log('[MacroManager] Initialized');
  },

  bindEvents() {
    const els = window.els;
    if (els['btn-refresh-sector']) {
      els['btn-refresh-sector'].onclick = () => this.refreshSectorMatrix();
    }
    if (els['macro-briefing-save']) {
      els['macro-briefing-save'].onclick = () => this.saveBriefing();
    }
  },

  async render() {
    this.initTradingView();
    this.renderBriefings();
    
    // Auto-refresh sector matrix if it's the first time in this session
    if (!this.sectorDataFetched) {
      this.refreshSectorMatrix();
      this.sectorDataFetched = true;
    }
  },

  initTradingView() {
    if (this.tvWidget) return;
    
    const container = document.getElementById('macro-chart-container');
    if (!container) return;

    this.tvWidget = new window.TradingView.widget({
      "autosize": true,
      "symbol": "AMEX:SPY",
      "interval": "D",
      "timezone": "Etc/UTC",
      "theme": document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light',
      "style": "1",
      "locale": "ko",
      "toolbar_bg": "#f1f3f6",
      "enable_publishing": false,
      "allow_symbol_change": true,
      "container_id": "macro-chart-container"
    });
  },

  async refreshSectorMatrix() {
    const tbody = document.getElementById('macro-sector-body');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 40px; opacity:0.5;">데이터 분석 중... (Yahoo Finance)</td></tr>';

    try {
      const sectors = [
        { sym: "XLK", name: "XLK (기술)" },
        { sym: "XLF", name: "XLF (금융)" },
        { sym: "XLV", name: "XLV (헬스케어)" },
        { sym: "XLY", name: "XLY (임의소비)" },
        { sym: "XLC", name: "XLC (통신)" },
        { sym: "XLI", name: "XLI (산업재)" },
        { sym: "XLE", name: "XLE (에너지)" },
        { sym: "XLP", name: "XLP (필수소비)" },
        { sym: "XLB", name: "XLB (소재)" },
        { sym: "XLU", name: "XLU (유틸리티)" },
        { sym: "XLRE", name: "XLRE (부동산)" }
      ];

      const allSymbols = ["SPY", ...sectors.map(s => s.sym)];
      const data = await this.fetchHistoricalData(allSymbols);
      
      if (!data || !data.SPY) {
        throw new Error('시장 데이터를 가져오는데 실패했습니다.');
      }

      const spy = data.SPY;
      const spyRet5 = (spy.close - spy.close5) / spy.close5 * 100;
      const spyRet20 = (spy.close - spy.close20) / spy.close20 * 100;

      const rowsHtml = sectors.map(s => {
        const d = data[s.sym];
        if (!d) return `<tr><td style="padding:12px;">${s.name}</td><td colspan="3" style="text-align:center;">N/A</td></tr>`;

        const ret5 = (d.close - d.close5) / d.close5 * 100;
        const ret20 = (d.close - d.close20) / d.close20 * 100;
        
        const rs5 = (ret5 - spyRet5).toFixed(2);
        const rs20 = (ret20 - spyRet20).toFixed(2);
        const isUp = d.close > d.sma50;

        return `
          <tr style="background: var(--bg-panel); border-radius: 8px;">
            <td style="padding: 12px; font-weight: 700;">${s.name}</td>
            <td style="padding: 12px; text-align: center; font-weight: 800; color: white; background: ${rs5 > 0 ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 44, 44, 0.4)'}">${rs5}%</td>
            <td style="padding: 12px; text-align: center; font-weight: 800; color: white; background: ${rs20 > 0 ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 44, 44, 0.4)'}">${rs20}%</td>
            <td style="padding: 12px; text-align: center; font-weight: 800; color: white; background: ${isUp ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 44, 44, 0.4)'}">${isUp ? 'UP' : 'DWN'}</td>
          </tr>
        `;
      }).join('');

      tbody.innerHTML = rowsHtml;
    } catch (err) {
      console.error('[MacroManager] Sector Refresh Error:', err);
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding: 40px; color: var(--red);">데이터를 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.</td></tr>`;
    }
  },

  async fetchHistoricalData(symbols) {
    const results = {};
    const proxies = [
      'https://api.allorigins.win/raw?url=',
      'https://corsproxy.io/?',
      'https://api.codetabs.com/v1/proxy?quest='
    ];

    await Promise.all(symbols.map(async (sym) => {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=3mo`;
      let data = null;

      for (const proxy of proxies) {
        try {
          const fullUrl = proxy.includes('?') ? (proxy + encodeURIComponent(url)) : (proxy + url);
          const resp = await fetch(fullUrl);
          if (resp.ok) {
            const json = await resp.json();
            const chart = json.chart?.result?.[0];
            if (chart) {
              const quotes = chart.indicators.quote[0];
              const closes = quotes.close.filter(c => c !== null);
              if (closes.length >= 50) {
                const current = closes[closes.length - 1];
                const c5 = closes[closes.length - 6]; // ~5 trading days ago
                const c20 = closes[closes.length - 21]; // ~20 trading days ago
                
                // Simple SMA50
                const last50 = closes.slice(-50);
                const sma50 = last50.reduce((a, b) => a + b, 0) / 50;

                results[sym] = { close: current, close5: c5, close20: c20, sma50: sma50 };
                break;
              }
            }
          }
        } catch (e) { continue; }
      }
    }));

    return results;
  },

  saveBriefing() {
    const els = window.els;
    const state = window.state;
    const input = els['macro-briefing-input'];
    if (!input || !input.value.trim()) return;

    const content = input.value.trim();
    const briefing = {
      id: crypto.randomUUID(),
      date: new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }),
      timestamp: Date.now(),
      content: content
    };

    if (!state.db.meta.macroBriefings) state.db.meta.macroBriefings = [];
    state.db.meta.macroBriefings.unshift(briefing); // Newest first

    saveDB(state.db);
    if (state.user) saveMetaToFirebase(state.user, state.db.meta).catch(console.error);

    input.value = '';
    this.renderBriefings();
    alert('브리핑이 저장되었습니다.');
  },

  renderBriefings() {
    const els = window.els;
    const state = window.state;
    const list = els['macro-briefing-list'];
    if (!list) return;

    const briefings = state.db.meta.macroBriefings || [];
    if (briefings.length === 0) {
      list.innerHTML = '<div style="text-align:center; padding: 40px; opacity:0.3; font-weight:700;">아직 작성된 브리핑이 없습니다.</div>';
      return;
    }

    list.innerHTML = briefings.map(b => `
      <div class="briefing-card card" style="padding: 20px; border-left: 4px solid var(--accent); background: var(--bg-panel); margin-bottom: 16px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 12px; align-items: center;">
          <strong style="font-size: 15px; color: var(--accent);">${b.date}</strong>
          <button type="button" class="tool-btn btn-sm danger-btn" onclick="macroManager.deleteBriefing('${b.id}')">삭제</button>
        </div>
        <div class="briefing-content" style="white-space: pre-wrap; font-size: 14px; line-height: 1.6; color: var(--text-main); font-weight: 500;">${this.escapeHtml(b.content)}</div>
      </div>
    `).join('');
  },

  deleteBriefing(id) {
    const state = window.state;
    if (!confirm('이 브리핑을 삭제하시겠습니까?')) return;
    
    state.db.meta.macroBriefings = (state.db.meta.macroBriefings || []).filter(b => b.id !== id);
    saveDB(state.db);
    if (state.user) saveMetaToFirebase(state.user, state.db.meta).catch(console.error);
    
    this.renderBriefings();
  },

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  loadBriefings() {
    this.renderBriefings();
  }
};

window.macroManager = macroManager;
