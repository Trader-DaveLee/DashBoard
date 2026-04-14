const MarketService = {
  // Config
  proxyPrimary: 'https://api.allorigins.win/raw?url=',
  proxySecondary: 'https://corsproxy.io/?',
  proxyAlternative: 'https://api.codetabs.com/v1/proxy?quest=',
  
  CACHE_KEYS: {
    ECO: 'mkt_cache_eco',
    STOCK: 'mkt_cache_stock'
  },

  /**
   * Helper for caching
   */
  saveCache(key, data, expiryMinutes = 60) {
    const cache = {
      timestamp: Date.now(),
      expiry: expiryMinutes * 60 * 1000,
      data: data
    };
    localStorage.setItem(key, JSON.stringify(cache));
  },

  loadCache(key) {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    try {
      const cache = JSON.parse(raw);
      const isExpired = (Date.now() - cache.timestamp) > cache.expiry;
      if (isExpired) return null;
      return cache.data;
    } catch (e) { return null; }
  },

  /**
   * Helper for timeout fetch
   */
  async fetchWithTimeout(url, options = {}, timeout = 6000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(id);
      return response;
    } catch (e) {
      clearTimeout(id);
      throw e;
    }
  },
  
  /**
   * Fetch US Stock Quotes via Yahoo Finance (V6 Engine)
   */
  async fetchStockQuotes(symbols) {
    if (!symbols || symbols.length === 0) return [];
    const stocks = symbols.filter(s => !s.endsWith('USDT'));
    if (stocks.length === 0) return [];

    // V2.1.5: Optimized Multi-Endpoint approach
    // V2.1.6: Dual Engine - V6 Quote + V8 Chart (Individual)
    const symbolsJoined = stocks.join(',');
    const v6Url = `https://query1.finance.yahoo.com/v6/finance/quote?symbols=${symbolsJoined}`;
    
    const proxies = [this.proxyAlternative, this.proxySecondary, this.proxyPrimary];

    for (const proxy of proxies) {
      try {
        const fullUrl = proxy.includes('?') ? (proxy + encodeURIComponent(v6Url)) : (proxy + v6Url);
        const resp = await this.fetchWithTimeout(fullUrl, {}, 5000);
        if (resp && resp.ok) {
           const text = await resp.text();
           if (text.trim().startsWith('{')) {
             const json = JSON.parse(text);
             const results = json.quoteResponse ? json.quoteResponse.result : (json.contents ? JSON.parse(json.contents).quoteResponse.result : null);
             
             if (results && results.length > 0) {
               return results.map(q => ({
                 symbol: q.symbol,
                 price: q.regularMarketPrice,
                 pct: q.regularMarketChangePercent,
                 type: 'stock',
                 name: q.shortName || q.longName
               }));
             }
           }
        }
      } catch (e) { continue; }
    }
    
    // V2.1.6 Fallback: Individual V8 Chart calls if Batch V6 fails
    console.log('[MarketService] Batch V6 failed, trying Individual V8 Chart fallback...');
    try {
      const fallbackResults = await Promise.all(stocks.map(async (s) => {
        const v8Url = `https://query1.finance.yahoo.com/v8/finance/chart/${s}?interval=1m&range=1d`;
        for (const proxy of proxies) {
          try {
            const fullUrl = proxy.includes('?') ? (proxy + encodeURIComponent(v8Url)) : (proxy + v8Url);
            const resp = await this.fetchWithTimeout(fullUrl, {}, 3000);
            if (resp && resp.ok) {
              const json = await resp.json();
              const chartData = json.contents ? JSON.parse(json.contents).chart.result[0] : json.chart.result[0];
              const meta = chartData.meta;
              return {
                symbol: s,
                price: meta.regularMarketPrice,
                pct: ((meta.regularMarketPrice - meta.previousClose) / meta.previousClose) * 100,
                type: 'stock',
                name: s
              };
            }
          } catch (e) { continue; }
        }
        return null;
      }));
      return fallbackResults.filter(Boolean);
    } catch (e) {
      console.warn('[Stock Service Failure] All stock engines failed.');
      return [];
    }
  },

  /**
   * Fetch Crypto Quotes via Bybit V5
   */
  async fetchCryptoQuotes(symbols) {
    if (!symbols || symbols.length === 0) return [];
    const cryptos = symbols.filter(s => s.endsWith('USDT'));
    if (cryptos.length === 0) return [];

    try {
      const results = await Promise.all(cryptos.map(async (sym) => {
        const targetUrl = `https://api.bybit.com/v5/market/tickers?category=linear&symbol=${sym}`;
        
        // V2.1.4: Use Proxy for Crypto to avoid CORS/IP blocks
        const proxies = [this.proxyAlternative, this.proxySecondary, this.proxyPrimary];
        let resp = null;

        for (const proxy of proxies) {
          try {
            const fullUrl = proxy.includes('?') ? (proxy + encodeURIComponent(targetUrl)) : (proxy + targetUrl);
            resp = await this.fetchWithTimeout(fullUrl, {}, 4000);
            if (resp && resp.ok) break;
          } catch (e) { continue; }
        }

        if (resp && resp.ok) {
          const json = await resp.json();
          // Bybit JSON might be wrapped depending on proxy
          const data = json.contents ? JSON.parse(json.contents) : json;
          if (data.retCode === 0 && data.result.list.length > 0) {
            const d = data.result.list[0];
            return {
              symbol: d.symbol,
              price: d.lastPrice,
              pct: parseFloat(d.price24hPcnt || 0) * 100,
              type: 'crypto'
            };
          }
        }
        return null;
      }));
      return results.filter(Boolean);
    } catch (err) {
      console.warn('[Crypto Service Error]', err);
      return [];
    }
  },

  /**
   * V3.0.0: Fetch Manual Economic Calendar from LocalStorage
   */
  async fetchEconomicCalendar(forceRefresh = false) {
    try {
      // V3.1.0: Priorities global state.db for synchronization
      if (window.state && window.state.db && window.state.db.meta && window.state.db.meta.ecoEvents) {
        return { success: true, data: window.state.db.meta.ecoEvents };
      }
      const stored = localStorage.getItem('DASHBOARD_MANUAL_ECO_V3');
      const data = stored ? JSON.parse(stored) : [];
      return { success: true, data: data };
    } catch (e) {
      console.error('[MarketService] Failed to load manual eco items', e);
      return { success: false, data: [] };
    }
  },

  /**
   * Parallel update for everything
   */
  async updateAll(symbols) {
    const [stocks, cryptos, eco] = await Promise.all([
      this.fetchStockQuotes(symbols),
      this.fetchCryptoQuotes(symbols),
      this.fetchEconomicCalendar()
    ]);
    return { 
      prices: [...stocks, ...cryptos], 
      eco: eco.data,
      ecoSuccess: eco.success
    };
  }
};

// V2.1.2: Ensure global binding immediately
window.MarketService = MarketService;
console.log('[MarketService] Engine v2.1.4 (Intelli-Cache) Initialized');
