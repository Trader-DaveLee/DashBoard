import { recalcTrade } from './calc.js';
import { idbGet, idbSet, idbDelete } from './idb.js';

export const STORAGE_KEY = 'trading_desk_dashboard_v3';
export const LEGACY_STORAGE_KEYS = [
  'trading_desk_dashboard_v3',
  'btc_trading_research_dashboard_v2'
];
export const DRAFT_KEY = 'trading_desk_dashboard_v3_draft';
const IDB_DB_KEY = 'main-db';
const IDB_DRAFT_KEY = 'draft';

// ─── Campus 전용 독립 저장소 (메인 DB 파이프라인과 완전히 분리) ───
const CAMPUS_NOTES_KEY = 'campus_notes_v1';
const CAMPUS_CATEGORIES_KEY = 'campus_categories_v1';
const CAMPUS_SUBTITLE_KEY = 'campus_subtitle_v1';

/**
 * Campus 노트 저장 (동기적, 즉각 반영)
 */
export function saveCampusNotes(notes) {
  if (!Array.isArray(notes)) return;
  try {
    localStorage.setItem(CAMPUS_NOTES_KEY, JSON.stringify(notes));
    console.log(`[Campus Storage] Saved ${notes.length} notes`);
  } catch (e) {
    console.error('[Campus Storage] Failed to save notes:', e);
  }
}

/**
 * Campus 노트 로드 (동기적, 항상 최신 반환)
 */
export function loadCampusNotes() {
  try {
    const json = localStorage.getItem(CAMPUS_NOTES_KEY);
    if (!json) return null; // null = 데이터 없음 (메인 DB 폴백 필요)
    const notes = JSON.parse(json);
    console.log(`[Campus Storage] Loaded ${notes.length} notes`);
    return Array.isArray(notes) ? notes : null;
  } catch (e) {
    console.error('[Campus Storage] Failed to load notes:', e);
    return null;
  }
}

/**
 * Campus 카테고리 저장
 */
export function saveCampusCategories(categories) {
  if (!Array.isArray(categories)) return;
  localStorage.setItem(CAMPUS_CATEGORIES_KEY, JSON.stringify(categories));
}

/**
 * Campus 카테고리 로드
 */
export function loadCampusCategories() {
  try {
    const json = localStorage.getItem(CAMPUS_CATEGORIES_KEY);
    return json ? JSON.parse(json) : null;
  } catch (e) {
    return null;
  }
}

/**
 * Campus 부제목 저장/로드
 */
export function saveCampusSubtitle(text) {
  localStorage.setItem(CAMPUS_SUBTITLE_KEY, text || '');
}

export function loadCampusSubtitle() {
  return localStorage.getItem(CAMPUS_SUBTITLE_KEY) || null;
}

const DEFAULT_CONTEXT_PROMPTS = {
  structure: '시장 구조: \n유동성 위치: \n상위 타임프레임 방향: \n세션 성격: ',
  catalyst: '촉매 / 뉴스: \n시장 테마: \n주의해야 할 이벤트: '
};

const DEFAULT_LOGIC_PROMPTS = {
  trigger: '엔트리 트리거: \n추가 진입 조건: \n확인해야 할 가격 행동: ',
  invalidation: '무효화 기준: \n청산 계획: \n계획이 틀렸다고 인정할 조건: '
};

const DEFAULT_SETUP_TEMPLATES = {
  'BREAKOUT': {
    riskPct: 0.75,
    plannerMode: 'BALANCED',
    plannerLegs: 3,
    plannerWeightMode: 'BACKLOADED',
    stopType: 'T',
    tags: ['trend', 'breakout'],
    checklistHints: ['손절 설정 확인', '상위 구조와 방향 일치', '유동성/거래량 확인'],
    contextPrompt: '시장 구조: 박스 상단 돌파 또는 고점 갱신 구조 확인\n유동성 위치: 돌파 직전/직후 스탑 유동성 집중 구간\n상위 타임프레임 방향: 상방 모멘텀 유지 여부 확인',
    thesisPrompt: '엔트리 트리거: 돌파 후 지지 전환 또는 재확인\n추가 진입 조건: 돌파 후 눌림이 얕고 거래량 유지\n무효화 기준: 돌파 실패 후 박스 안 재진입'
  },
  'BREAKOUT RETEST': {
    riskPct: 0.8,
    plannerMode: 'AVERAGING',
    plannerLegs: 2,
    plannerWeightMode: 'BACKLOADED',
    stopType: 'T',
    tags: ['breakout', 'retest'],
    checklistHints: ['손절 설정 확인', '돌파 레벨 재확인', '재테스트 거래량 확인'],
    contextPrompt: '시장 구조: 돌파 후 되돌림 재테스트 구조\n유동성 위치: 돌파 레벨 바로 아래 유동성 확인\n세션 성격: 모멘텀 유지 여부 체크',
    thesisPrompt: '엔트리 트리거: 돌파 레벨 재지지 확인\n추가 진입 조건: 되돌림 저점 유지 + 거래량 재확인\n무효화 기준: 재테스트 실패 후 돌파 레벨 하향 이탈'
  }
};

/**
 * 💾 Core Data Handling (100% Local Mode)
 */

export function loadDB() {
  const json = localStorage.getItem(STORAGE_KEY);
  if (!json) return createEmptyDB();
  try {
    const raw = JSON.parse(json);
    return migrateDB(raw);
  } catch (e) {
    console.error('Failed to parse DB from localStorage:', e);
    return createEmptyDB();
  }
}

export async function hydrateDBFromIndexedDB() {
  const [idbData, localData] = await Promise.all([
    idbGet(IDB_DB_KEY),
    Promise.resolve(loadDB())
  ]);

  const idbTime = idbData?.lastModified || 0;
  const localTime = localData?.lastModified || 0;

  console.log(`[Storage] Hydrating: IDB(${idbTime}) vs Local(${localTime})`);

  // Pick the one with the later timestamp
  const winner = (idbTime >= localTime) ? idbData : localData;
  return migrateDB(winner || createEmptyDB());
}

export async function saveDB(dbData) {
  if (!dbData) return;
  
  // Add timestamp for strong versioning
  dbData.lastModified = Date.now();
  
  const json = JSON.stringify(dbData);
  localStorage.setItem(STORAGE_KEY, json);
  
  try {
    await idbSet(IDB_DB_KEY, dbData);
    console.log('[Storage] Strong save completed at', dbData.lastModified);
  } catch (e) {
    console.error('IndexedDB save error:', e);
  }
}

export function exportDB(dbData) {
  const blob = new Blob([JSON.stringify(dbData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `trading_dashboard_backup_${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function parseImport(jsonStr) {
  try {
    const raw = JSON.parse(jsonStr);
    return migrateDB(raw);
  } catch (e) {
    throw new Error('Invalid JSON format');
  }
}

function createEmptyDB() {
  return {
    schemaVersion: 5,
    meta: normalizeMeta({}),
    trades: [],
    memos: [],
    campusNotes: [],
    campusCategories: ['General', 'Strategy', 'Psychology', 'Market', 'Knowledge']
  };
}

function migrateDB(db) {
  if (!db) return createEmptyDB();
  db.meta = normalizeMeta(db.meta || {});
  db.trades = (db.trades || []).map(normalizeTrade).filter(t => t !== null);
  db.memos = (db.memos || []).map(normalizeMemo).filter(m => m !== null);
  db.campusNotes = (db.campusNotes || []).map(normalizeCampusNote).filter(n => n !== null);
  
  // Ensure campusCategories exists and has a default if empty
  if (!db.campusCategories || db.campusCategories.length === 0) {
    db.campusCategories = ['General', 'Strategy', 'Psychology', 'Market', 'Knowledge'];
  }
  
  if (!db.campusSubtitle) {
    db.campusSubtitle = '당신의 트레이딩 지식과 생각을 기록하세요.';
  }

  db.schemaVersion = 5;
  return db;
}

/**
 * 🛡️ Data Normalizers
 */

export function normalizeTrade(t) {
  if (!t || typeof t !== 'object') return null;
  const trade = { ...t };
  if (!trade.id) trade.id = 't-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);
  if (!trade.date) trade.date = new Date().toISOString();
  if (!trade.ticker) trade.ticker = '—';
  if (!trade.status) trade.status = 'OPEN';
  if (!trade.side) trade.side = 'LONG';
  if (!trade.setupEntry) trade.setupEntry = '—';
  if (!trade.tags) trade.tags = [];
  if (!trade.mistakes) trade.mistakes = [];
  
  if (!trade.metrics) trade.metrics = { pnl: 0, r: 0 };
  if (typeof trade.metrics.pnl !== 'number') trade.metrics.pnl = 0;
  if (typeof trade.metrics.r !== 'number') trade.metrics.r = 0;
  
  trade.metrics = recalcTrade(trade);
  return trade;
}

export async function hardReset() {
  if (!confirm('정말로 모든 데이터를 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.')) return;
  
  // 1. Clear LocalStorage
  localStorage.clear();
  
  // 2. Clear IndexedDB
  await idbDelete('main-db');
  await idbDelete('draft');
  
  // 3. Reload
  window.location.reload();
}

export function normalizeMeta(m) {
  const meta = { ...m };
  if (!meta.balance) meta.balance = { cash: 0, crypto: 0, usdt: 0, stock: 0, total: 0 };
  if (!meta.balanceHistory) meta.balanceHistory = [];
  if (!meta.setups) meta.setups = DEFAULT_SETUP_TEMPLATES;
  if (!meta.contextPrompts) meta.contextPrompts = DEFAULT_CONTEXT_PROMPTS;
  if (!meta.logicPrompts) meta.logicPrompts = DEFAULT_LOGIC_PROMPTS;
  if (!meta.deskRules) meta.deskRules = '';
  if (!meta.masterChecklist) meta.masterChecklist = [];
  if (!meta.checklists) meta.checklists = []; // v3 checklist field
  if (!meta.quickLinks) meta.quickLinks = [];
  
  // UI Dropdown & Tag Lists
  if (!meta.tickers) meta.tickers = [];
  if (!meta.entrySetups) meta.entrySetups = [];
  if (!meta.exitSetups) meta.exitSetups = [];
  if (!meta.tagPresets) meta.tagPresets = [];
  if (!meta.mistakePresets) meta.mistakePresets = [];
  if (!meta.macroBriefings) meta.macroBriefings = {};
  
  return meta;
}

export function normalizeMemo(m) {
  if (!m) return null;
  return {
    id: m.id || 'm-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
    date: m.date || new Date().toISOString(),
    content: m.content || '',
    author: m.author || 'Local User',
    authorPhoto: m.authorPhoto || ''
  };
}

export function normalizeCampusNote(n) {
  if (!n || typeof n !== 'object') return null;
  const content = n.content || '';
  const charts = Array.isArray(n.charts) ? n.charts : (Array.isArray(n.attachments) ? n.attachments : []);
  
  // Allow note if it has either content OR charts
  if ((!content || content === '<br>') && charts.length === 0) return null;

  return {
    id: n.id || 'cn-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
    date: n.date || new Date().toISOString(),
    updatedAt: n.updatedAt || n.date || new Date().toISOString(),
    content: content,
    category: n.category || 'General',
    tags: Array.isArray(n.tags) ? n.tags : [],
    charts: charts
  };
}

/**
 * 📝 Draft Handling
 */

export function loadDraft() {
  const json = localStorage.getItem(DRAFT_KEY);
  return json ? JSON.parse(json) : null;
}

export async function hydrateDraftFromIndexedDB() {
  return await idbGet(IDB_DRAFT_KEY);
}

export function saveDraft(draft) {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  idbSet(IDB_DRAFT_KEY, draft).catch(console.error);
}

export function clearDraft() {
  localStorage.removeItem(DRAFT_KEY);
  idbDelete(IDB_DRAFT_KEY).catch(console.error);
}

/**
 * 🛠️ Helpers
 */

export function sanitizeUrl(url) {
  if (!url) return '';
  if (url.startsWith('data:image')) return url;
  try {
    const parsed = new URL(url);
    return parsed.href;
  } catch (e) {
    return '';
  }
}

export function compressImage(base64Str, maxWidth = 1200, quality = 0.7) {
  return new Promise((resolve) => {
    if (!base64Str || !base64Str.startsWith('data:image')) {
      return resolve(base64Str);
    }
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
      } else {
        if (height > maxWidth) {
          width = Math.round((width * maxWidth) / height);
          height = maxWidth;
        }
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.src = base64Str;
  });
}
