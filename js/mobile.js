import { state, views, renderViews } from './app.js';

/**
 * Mobile Lite Bridge (v1.3)
 * Optimized for synchronization with app.js view engine.
 * Features: Real-time sync support, Trade Detail Modal, Home FAB Refresh.
 */

const MOBILE_BREAKPOINT = 768; // 기존 스마트폰 기준
const TABLET_BREAKPOINT = 1200; // iPad Pro 11인치 가로 모드까지 커버
let isMobileMode = false;
let lastWidth = window.innerWidth;

function initMobile() {
  checkMobileMode();
  setupBottomNav();
  setupHardRefresh();
  setupMobileHistoryInterception();
  
  window.addEventListener('resize', () => {
    const currentWidth = window.innerWidth;
    if (Math.abs(currentWidth - lastWidth) > 50) { 
       const wasMobile = isMobileMode;
       checkMobileMode();
       if (wasMobile !== isMobileMode) {
         lastWidth = currentWidth;
         location.reload(); 
       }
    }
  });

  setTimeout(reparentMemoPanel, 500);
  setTimeout(reparentMemoPanel, 2000);
}

function checkMobileMode() {
  const isTouch = (navigator.maxTouchPoints > 0) || ('ontouchstart' in window);
  const width = window.innerWidth;
  
  // 1. 768px 이하는 무조건 모바일 모드
  // 2. 1200px 이하이면서 터치 기기인 경우(iPad 등) 모바일 모드 유지
  isMobileMode = width <= MOBILE_BREAKPOINT || (isTouch && width <= TABLET_BREAKPOINT);

  if (isMobileMode) {
    document.body.classList.add('is-mobile');
    reparentMemoPanel();
  } else {
    document.body.classList.remove('is-mobile');
  }
}

function reparentMemoPanel() {
  const memoPanel = document.getElementById('memo-panel');
  const mobileMemoView = document.getElementById('view-memo');
  
  if (memoPanel && mobileMemoView && isMobileMode) {
    if (memoPanel.parentElement !== mobileMemoView) {
      memoPanel.classList.remove('memo-hide');
      mobileMemoView.appendChild(memoPanel);
      
      memoPanel.style.display = 'flex';
      memoPanel.style.visibility = 'visible';
      memoPanel.style.opacity = '1';
    }
  }
}

function setupBottomNav() {
  const tabs = document.querySelectorAll('.tab-item');
  if (tabs.length === 0) return;

  tabs.forEach(tab => {
    tab.onclick = () => {
      const targetView = tab.dataset.tab;
      state.view = targetView;
      if (typeof renderViews === 'function') renderViews();
      
      if (targetView === 'memo') {
        const memoInput = document.getElementById('memo-input');
        if (memoInput) setTimeout(() => memoInput.focus(), 200);
      }
      tabs.forEach(t => t.classList.toggle('active', t === tab));
    };
  });
}


function setupMobileHistoryInterception() {
  const historyList = document.getElementById('overview-history-list');
  if (!historyList) return;

  historyList.addEventListener('click', (e) => {
    if (!isMobileMode) return;
    const card = e.target.closest('[data-trade-id]');
    if (!card) return;
    if (e.target.closest('button')) return;
    e.preventDefault();
    e.stopPropagation();
    openMobileTradeDetail(card.getAttribute('data-trade-id'));
  });

  const closeBtn = document.getElementById('mobile-trade-detail-close');
  const overlay = document.getElementById('mobile-trade-detail-overlay');
  if (closeBtn && overlay) {
    closeBtn.onclick = () => overlay.classList.remove('active');
    overlay.onclick = (e) => { if(e.target === overlay) overlay.classList.remove('active'); };
  }
}

async function openMobileTradeDetail(id) {
  const trades = state.db.trades || [];
  const trade = trades.find(t => String(t.id) === String(id));
  if (!trade) return;

  const overlay = document.getElementById('mobile-trade-detail-overlay');
  const body = document.getElementById('mobile-trade-detail-body');
  if (!overlay || !body) return;

  const pnl = trade.metrics?.pnl || 0;
  const r = trade.metrics?.r || 0;
  
  const renderCharts = (charts) => {
    if (!charts || charts.length === 0) return '<p class="muted-caption" style="text-align:center; padding:20px;">이미지 없음</p>';
    return charts.map(c => `<img src="${c.url || c}" class="mobile-detail-chart" loading="lazy">`).join('');
  };

  body.innerHTML = `
    <div class="mobile-detail-kv">
      <div class="kv-row"><span>티커</span><strong>${trade.ticker}</strong></div>
      <div class="kv-row"><span>방향</span><span class="badge ${trade.side === 'LONG' ? 'badge-good' : 'badge-danger'}">${trade.side}</span></div>
      <div class="kv-row"><span>손익</span><strong class="${pnl >= 0 ? 'positive' : 'negative'}">${pnl.toLocaleString()} (${r.toFixed(2)}R)</strong></div>
      <div class="kv-row"><span>셋업</span><span>${trade.setupEntry || '—'}</span></div>
      <div class="kv-row"><span>상태</span><span>${trade.status}</span></div>
    </div>
    <div class="mobile-detail-section">
      <h4>진입 논리 (Thesis)</h4>
      <p>${trade.thesis || '작성내용 없음'}</p>
    </div>
    <div class="mobile-detail-section">
      <h4>차트 증거</h4>
      <div class="mobile-detail-charts">
        ${renderCharts([...(trade.evidence?.entryCharts || []), ...(trade.evidence?.exitCharts || [])])}
      </div>
    </div>
  `;
  overlay.classList.add('active');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initMobile);
} else {
  initMobile();
}
