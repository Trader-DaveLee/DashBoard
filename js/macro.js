import { saveDB, saveMetaToFirebase } from './storage.js';

/**
 * Macro Analysis Manager (v2.0)
 * Features: TV Heatmap, Strategic Calendar, Date-based Briefing
 */
export const macroManager = {
  initialized: false,
  currentMonth: new Date(),
  selectedDate: new Date().toISOString().split('T')[0], // YYYY-MM-DD
  briefings: {}, // Loaded from state.db.meta.macroBriefings

  init() {
    if (this.initialized) return;
    
    // Sync state data
    const state = window.state;
    if (state && state.db.meta.macroBriefings) {
      // Convert legacy array to object if necessary, but user said start fresh
      if (Array.isArray(state.db.meta.macroBriefings)) {
        state.db.meta.macroBriefings = {};
      }
      this.briefings = state.db.meta.macroBriefings;
    }

    this.bindEvents();
    this.renderCalendar();
    this.renderBriefing();
    this.initialized = true;
    console.log('[MacroManager] v2.0 Initialized');
  },

  bindEvents() {
    const saveBtn = document.getElementById('macro-briefing-save');
    if (saveBtn) {
      saveBtn.onclick = () => this.saveBriefing();
    }

    // Rich Text Toolbar Commands
    const toolbar = document.getElementById('macro-editor-toolbar');
    const editor = document.getElementById('macro-briefing-input');

    if (toolbar && editor) {
      toolbar.querySelectorAll('.tool-btn').forEach(btn => {
        btn.onclick = (e) => {
          e.preventDefault();
          const cmd = btn.dataset.command;
          const val = btn.dataset.value || null;
          if (cmd) {
            document.execCommand(cmd, false, val);
            editor.focus();
            this.updateCharCount();
          }
        };
      });

      // Character Count update
      editor.oninput = () => {
        this.updateCharCount();
      };

      // Clean Paste logic
      editor.onpaste = (e) => {
        e.preventDefault();
        const text = e.clipboardData.getData('text/plain');
        document.execCommand('insertText', false, text);
        this.updateCharCount();
      };
    }
  },

  updateCharCount() {
    const editor = document.getElementById('macro-briefing-input');
    const countEl = document.getElementById('macro-char-count');
    if (editor && countEl) {
      const text = editor.innerText || '';
      countEl.innerText = `${text.trim().length} characters`;
    }
  },

  async render() {
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
      this.initMobileTradingView();
    } else {
      this.initTradingView();
    }
    this.initHeatmap();
    this.renderCalendar();
    this.renderBriefing();
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

  initMobileTradingView() {
    const container = document.getElementById('macro-chart-container');
    if (!container || container.querySelector('iframe')) return;

    const theme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    container.innerHTML = '';
    
    // Using Symbol Overview (Medium Widget) for Lite Mobile View
    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-symbol-overview.js';
    script.async = true;
    script.innerHTML = JSON.stringify({
      "symbols": [
        ["S&P 500", "AMEX:SPY|1D"],
        ["NASDAQ 100", "NASDAQ:QQQ|1D"]
      ],
      "chartOnly": false,
      "width": "100%",
      "height": "100%",
      "locale": "ko",
      "colorTheme": theme,
      "autosize": true,
      "showVolume": false,
      "showMA": false,
      "hideDateRanges": false,
      "hideMarketStatus": false,
      "hideSymbolLogo": false,
      "scalePosition": "right",
      "scaleMode": "Normal",
      "fontFamily": "-apple-system, BlinkMacSystemFont, Trebuchet MS, Roboto, Ubuntu, sans-serif",
      "fontSize": "10",
      "noTimeScale": false,
      "valuesTracking": "1",
      "changeMode": "price-and-percent",
      "chartType": "area",
      "maLineColor": "#2962FF",
      "maLineWidth": 1,
      "maLength": 9,
      "headerFontSize": "medium",
      "lineWidth": 2,
      "lineColor": "#2962FF",
      "topColor": "rgba(41, 98, 255, 0.3)",
      "bottomColor": "rgba(41, 98, 255, 0)",
      "pointDotFillColor": "#2962FF",
      "pointDotStrokeColor": "rgba(255, 255, 255, 1)",
      "pointDotRadius": 4,
      "gridLineColor": "rgba(42, 46, 57, 0.06)",
      "container_id": "macro-chart-container"
    });
    container.appendChild(script);
  },

  initHeatmap() {
    const container = document.getElementById('macro-heatmap-container');
    if (!container || container.querySelector('iframe')) return;

    const theme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    
    container.innerHTML = '';
    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-stock-heatmap.js';
    script.async = true;
    script.innerHTML = JSON.stringify({
      "exchanges": [],
      "dataSource": "S&P500",
      "grouping": "sector",
      "blockSize": "market_cap_basic",
      "blockColor": "change",
      "locale": "ko",
      "symbolUrl": "",
      "colorTheme": theme,
      "hasTopBar": true,
      "isDataSetEnabled": false,
      "isZoomEnabled": true,
      "hasSymbolTooltip": true,
      "width": "100%",
      "height": "100%"
    });
    container.appendChild(script);
  },

  renderCalendar() {
    const container = document.getElementById('macro-calendar-container');
    if (!container) return;

    const isMobile = window.innerWidth <= 768;
    const year = this.currentMonth.getFullYear();
    const month = this.currentMonth.getMonth();
    const today = new Date().toISOString().split('T')[0];

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startOffset = firstDay.getDay(); 
    const daysInMonth = lastDay.getDate();

    const monthNames = ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"];
    
    // Layout Branching
    let html = `
      <div class="calendar-nav" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; width: 100%;">
        <button type="button" class="btn-icon-sm" id="macro-prev-month"> &lt; </button>
        <strong style="font-size: 18px; color: var(--text-main); font-weight: 800;">${year}년 ${monthNames[month]}</strong>
        <button type="button" class="btn-icon-sm" id="macro-next-month"> &gt; </button>
      </div>
      <div class="${isMobile ? 'mobile-calendar-grid' : 'calendar-grid-mini'}" style="display: grid; grid-template-columns: repeat(7, 1fr); gap: ${isMobile ? '12px 0' : '4px'}; text-align: center; width: 100%;">
        <div class="day-head">일</div><div class="day-head">월</div><div class="day-head">화</div>
        <div class="day-head">수</div><div class="day-head">목</div><div class="day-head">금</div><div class="day-head">토</div>
    `;

    // Empty spaces
    for (let i = 0; i < startOffset; i++) {
      html += `<div class="day-cell muted"></div>`;
    }

    // Days
    for (let d = 1; d <= daysInMonth; d++) {
      const pad = n => String(n).padStart(2, '0');
      const dateKey = `${year}-${pad(month + 1)}-${pad(d)}`;
      const isSelected = dateKey === this.selectedDate;
      const isToday = dateKey === today;
      const hasBriefing = !!this.briefings[dateKey];

      if (isMobile) {
        // Mobile Day UI: Circular highlight, Dots below
        html += `
          <div class="mobile-day-cell ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''}" 
               onclick="macroManager.selectDate('${dateKey}')">
            <div class="day-number">${d}</div>
            ${hasBriefing ? '<div class="briefing-dot"></div>' : '<div class="briefing-dot hidden"></div>'}
          </div>
        `;
      } else {
        html += `
          <div class="day-cell ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''} ${hasBriefing ? 'has-data' : ''}" 
               onclick="macroManager.selectDate('${dateKey}')">
            ${d}
            ${hasBriefing ? '<span class="dot"></span>' : ''}
          </div>
        `;
      }
    }

    html += `</div>`;
    container.innerHTML = html;

    // Re-bind month nav
    document.getElementById('macro-prev-month').onclick = () => {
      this.currentMonth.setMonth(this.currentMonth.getMonth() - 1);
      this.renderCalendar();
    };
    document.getElementById('macro-next-month').onclick = () => {
      this.currentMonth.setMonth(this.currentMonth.getMonth() + 1);
      this.renderCalendar();
    };
  },

  selectDate(dateKey) {
    this.selectedDate = dateKey;
    this.renderCalendar();
    this.renderBriefing();
  },

  renderBriefing() {
    const display = document.getElementById('selected-date-display');
    const editor = document.getElementById('macro-briefing-input');
    if (!display || !editor) return;

    const date = new Date(this.selectedDate);
    const options = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' };
    display.innerText = date.toLocaleDateString('ko-KR', options);

    const content = this.briefings[this.selectedDate] || '';
    editor.innerHTML = content;
    this.updateCharCount();
  },

  saveBriefing() {
    const editor = document.getElementById('macro-briefing-input');
    if (!editor) return;

    const content = editor.innerHTML.trim();
    // Check if it's practically empty (could have <br> etc)
    const plainText = editor.innerText.trim();

    if (plainText || content !== '') {
      this.briefings[this.selectedDate] = content;
    } else {
      delete this.briefings[this.selectedDate];
    }

    // Persist
    const state = window.state;
    state.db.meta.macroBriefings = this.briefings;
    saveDB(state.db);
    if (state.user) saveMetaToFirebase(state.user, state.db.meta).catch(console.error);

    this.renderCalendar();
    alert(`${this.selectedDate} 전략이 저장되었습니다.`);
  }
};

window.macroManager = macroManager;
