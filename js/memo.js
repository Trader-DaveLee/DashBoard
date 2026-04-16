import { state, escapeHtml } from './app.js';
import { saveDB, saveMemoToFirebase, deleteMemoFromFirebase, saveMetaToFirebase, compressImage } from './storage.js';

/**
 * Memo Assistant Widget Module v2.5
 * Features: Rich-Text, Mac Shortcuts, Lavender Theme, Date Grouping (Folders), Threaded Search Fix, Monthly Navigator
 */

let currentEditId = null;
let currentReplyId = null;
let newlyAddedId = null;
let searchQuery = '';
let collapsedFolders = new Set(); 
const initNow = new Date();
let currentViewMonth = `${initNow.getFullYear()}-${String(initNow.getMonth() + 1).padStart(2, '0')}`;
let isPinCollapsed = false;
let isHistoryView = false;

function initMemoWidget() {
  const fab = document.getElementById('memo-fab');
  const panel = document.getElementById('memo-panel');
  const closeBtn = document.getElementById('memo-close');
  const sendBtn = document.getElementById('memo-send');
  const input = document.getElementById('memo-input');
  const searchInput = document.getElementById('memo-search');
  const statusCancel = document.getElementById('memo-status-cancel');
  const fontToggle = document.getElementById('memo-font-toggle');
  
  // Font Size Toggle
  let fontSizes = ['10px', '12px', '14px', '16px', '18px'];
  let currentFontIdx = 2; // Default is 14px
  if (fontToggle) {
    fontToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      currentFontIdx = (currentFontIdx + 1) % fontSizes.length;
      document.documentElement.style.setProperty('--memo-font-size', fontSizes[currentFontIdx]);
    });
  }

  // Month Nav
  const prevMonthBtn = document.getElementById('memo-prev-month');
  const nextMonthBtn = document.getElementById('memo-next-month');
  const historyToggle = document.getElementById('memo-history-toggle');
  const pinRestoreBtn = document.getElementById('memo-pin-restore');

  if (!fab || !panel) return;

  // 1. Data Integrity Patch
  if (!state.db) state.db = { memos: [] };
  if (!state.db.meta) state.db.meta = {};

  // 2. CRITICAL: Toggle Panel Listener (Priority 1)
  fab.addEventListener('click', (e) => {
    e.stopPropagation();
    panel.classList.toggle('memo-hide');
    if (!panel.classList.contains('memo-hide')) {
      if (input) input.focus();
      renderMemos();
      // Ensure scroll to bottom on open (v2.1.8)
      setTimeout(() => {
        const container = document.getElementById('memo-messages');
        if (container) container.scrollTop = container.scrollHeight;
      }, 50);
    }
  });

  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      panel.classList.add('memo-hide');
    });
  }

  document.addEventListener('click', (e) => {
    if (!panel.classList.contains('memo-hide') && !panel.contains(e.target) && !fab.contains(e.target)) {
      panel.classList.add('memo-hide');
    }
  });

  // 3. Search Action
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.toLowerCase().trim();
      renderMemos(false);
    });
  }
  
  // Pin Area Listener
  const pinArea = document.getElementById('memo-pin-area');
  if (pinArea) {
    pinArea.addEventListener('click', (e) => {
      const hideBtn = e.target.closest('.pin-hide');
      const unpinBtn = e.target.closest('.pin-unpin');
      
      if (hideBtn) {
        e.stopPropagation();
        isPinCollapsed = true;
        renderMemos(false);
      } else if (unpinBtn) {
        e.stopPropagation();
        unpinMemo();
      } else {
        // Clicked on text - go to original message
        const id = (state.db.meta || {}).pinnedMemoId;
        const targetMemo = (state.db.memos || []).find(m => m.id === id);
        if (!targetMemo) return;

        const targetMonth = targetMemo.date.substring(0, 7);
        if (currentViewMonth !== targetMonth) {
          currentViewMonth = targetMonth;
          renderMemos(false);
        }

        setTimeout(() => {
          const bubble = document.querySelector(`.memo-bubble[data-id="${id}"]`);
          if (bubble) {
            bubble.scrollIntoView({ behavior: 'smooth', block: 'center' });
            bubble.classList.add('is-new');
            setTimeout(() => bubble.classList.remove('is-new'), 2000);
          }
        }, 100);
      }
    });
  }
  
  // Month Nav Actions
  if (prevMonthBtn) prevMonthBtn.addEventListener('click', () => { moveMonth(-1); });
  if (nextMonthBtn) nextMonthBtn.addEventListener('click', () => { moveMonth(1); });

  // History Toggle
  if (historyToggle) {
    historyToggle.addEventListener('click', () => {
      isHistoryView = !isHistoryView;
      renderMemos(false);
    });
  }

  // Pin Restore Action
  if (pinRestoreBtn) {
    pinRestoreBtn.addEventListener('click', () => {
      isPinCollapsed = false;
      renderMemos(false);
    });
  }

  // Status Bar Cancel
  if (statusCancel) {
    statusCancel.addEventListener('click', () => resetInputState());
  }

  // Send Actions
  if (sendBtn) {
    sendBtn.addEventListener('pointerdown', (e) => {
      if (window.innerWidth <= 768) {
        e.preventDefault(); // 다중 이벤트 충돌 방지 및 포커스 유지
        setTimeout(() => sendMemo(), 10);
      }
    });
    
    sendBtn.addEventListener('click', (e) => {
      if (window.innerWidth > 768) {
        sendMemo();
      }
    });
  }

  // Export Actions
  const exportToggle = document.getElementById('memo-export-toggle');
  const exportUI = document.getElementById('memo-export-ui');
  const exportDownload = document.getElementById('memo-export-download');
  const exportStart = document.getElementById('memo-export-start');
  const exportEnd = document.getElementById('memo-export-end');

  if (exportToggle && exportUI) {
    exportToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      exportUI.classList.toggle('memo-hide');
      if (!exportUI.classList.contains('memo-hide')) {
        // Set default dates to current month if empty
        const now = new Date();
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        if (exportStart && !exportStart.value) exportStart.value = firstDay.toISOString().split('T')[0];
        if (exportEnd && !exportEnd.value) exportEnd.value = lastDay.toISOString().split('T')[0];
      }
    });
  }

  if (exportDownload) {
    exportDownload.addEventListener('click', () => {
      const start = exportStart ? exportStart.value : '';
      const end = exportEnd ? exportEnd.value : '';
      if (!start || !end) {
        alert('시작일과 종료일을 모두 선택해주세요.');
        return;
      }
      exportMemos(start, end);
      exportUI.classList.add('memo-hide');
    });
  }

  if (input) {
    // 키보드 활성화 시 하단 탭바 숨기기를 위한 클래스 토글
    input.addEventListener('focus', () => document.body.classList.add('keyboard-active'));
    input.addEventListener('blur', () => document.body.classList.remove('keyboard-active'));

    input.addEventListener('keydown', (e) => {
      if (e.isComposing || e.keyCode === 229) return;
      if ((e.metaKey || e.ctrlKey)) {
        if (e.key === 'b') { e.preventDefault(); document.execCommand('bold'); }
        else if (e.key === 'u') { e.preventDefault(); document.execCommand('underline'); }
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        if (window.innerWidth <= 768) {
          // 모바일에서는 엔터 치면 전송 대신 줄 바꿈 동작 수행
          return;
        }
        e.preventDefault();
        sendMemo();
      }
    });

    input.addEventListener('paste', async (e) => {
      const items = (e.clipboardData || e.originalEvent.clipboardData).items;
      for (const item of items) {
        if (item.type.indexOf('image') !== -1) {
          e.preventDefault();
          const file = item.getAsFile();
          const reader = new FileReader();
          reader.onload = async (event) => {
            const compressed = await compressImage(event.target.result);
            document.execCommand('insertImage', false, compressed);
            const imgs = input.querySelectorAll('img');
            imgs.forEach(img => {
              img.style.maxWidth = '100%';
              img.style.borderRadius = '8px';
              img.style.marginTop = '8px';
            });
          };
          reader.readAsDataURL(file);
        }
      }
    });
  }



  // Delegated Actions
  const messagesContainer = document.getElementById('memo-messages');
  if (messagesContainer) {
    let tStartX = 0, tStartY = 0, tElem = null;
    messagesContainer.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        tStartX = e.touches[0].clientX;
        tStartY = e.touches[0].clientY;
        // Only target the bubble itself, not the whole container
        tElem = e.target.closest('.memo-bubble'); 
        if (tElem) tElem.style.transition = 'none';
      }
    }, { passive: true });

    messagesContainer.addEventListener('touchmove', (e) => {
      if (!tElem || !tStartX) return;
      const dX = e.touches[0].clientX - tStartX;
      const dY = e.touches[0].clientY - tStartY;
      if (Math.abs(dX) > Math.abs(dY) && Math.abs(dX) > 10) {
        // Prevent scroll when wiping horizontally
        if (e.cancelable) e.preventDefault();
        tElem.style.transform = `translateX(${dX}px)`;
        if (dX < -30) tElem.classList.add('swipe-reply-active');
        else if (dX > 30) tElem.classList.add('swipe-delete-active');
        else tElem.classList.remove('swipe-reply-active', 'swipe-delete-active');
      }
    }, { passive: false });

    messagesContainer.addEventListener('touchend', (e) => {
      if (!tElem || !tStartX) return;
      const dX = e.changedTouches[0].clientX - tStartX;
      const dY = e.changedTouches[0].clientY - tStartY;
      if (Math.abs(dX) > Math.abs(dY) && Math.abs(dX) > 30) {
        const id = tElem.dataset.id;
        if (id) {
          if (dX < -30) handleAction(id, 'reply');
          else if (dX > 30) handleAction(id, 'delete');
        }
      }
      tElem.style.transition = 'transform 0.3s ease';
      tElem.style.transform = 'none';
      tElem.classList.remove('swipe-reply-active', 'swipe-delete-active');
      tElem = null;
      tStartX = 0; tStartY = 0;
    });

    messagesContainer.addEventListener('click', (e) => {
      e.stopPropagation(); 
      const header = e.target.closest('.memo-date-header');
      if (header) {
        const date = header.dataset.date;
        if (collapsedFolders.has(date)) collapsedFolders.delete(date);
        else collapsedFolders.add(date);
        renderMemos();
        return;
      }
      // 2. Handle Action Buttons
      const btn = e.target.closest('.memo-action-btn');
      const backBtn = e.target.closest('.history-back-btn');

      if (backBtn) {
        isHistoryView = false;
        renderMemos(false);
        return;
      }

      if (!btn) {
        // Handle HashTag Clicks (Search)
        const tag = e.target.closest('.hashtag');
        if (tag) {
          const searchInput = document.getElementById('memo-search');
          if (searchInput) {
            searchInput.value = tag.innerText.trim();
            searchQuery = searchInput.value.toLowerCase().trim();
            renderMemos(false);
          }
          return;
        }
        return;
      }
      
      const id = btn.dataset.id;
      const action = btn.dataset.action;
      if (action === 'delete') deleteMemo(id);
      if (action === 'edit') startEdit(id);
      if (action === 'reply') setReplyMode(id);
      if (action === 'pin') pinMemo(id);
      if (action === 'unhistory') unhistoryMemo(id);
    });
  }

  renderMemos(true);
}

function moveMonth(delta) {
  const [year, month] = currentViewMonth.split('-').map(Number);
  const d = new Date(year, month - 1 + delta, 1);
  const nextYear = d.getFullYear();
  const nextMonth = String(d.getMonth() + 1).padStart(2, '0');
  currentViewMonth = `${nextYear}-${nextMonth}`;
  renderMemos(true);
}

function resetInputState() {
  currentEditId = null;
  currentReplyId = null;
  const statusBar = document.getElementById('memo-status-bar');
  const input = document.getElementById('memo-input');
  if (statusBar) statusBar.style.display = 'none';
  if (input) {
    input.innerHTML = '';
    // 모바일(<=768)에서는 키보드가 내려가고 창 크기가 변하는 출렁임 버그를 막기 위해 포커스 재할당 로직 생략
    if (window.innerWidth > 768) {
      setTimeout(() => input.focus(), 10);
    }
  }
}

function getPlainText(html) {
  const temp = document.createElement('div');
  temp.innerHTML = html;
  return (temp.textContent || temp.innerText || '').replace(/\s+/g, ' ').trim();
}

function startEdit(id) {
  const memo = (state.db.memos || []).find(m => m.id === id);
  if (!memo) return;
  currentEditId = id;
  currentReplyId = null;
  const statusBar = document.getElementById('memo-status-bar');
  const statusText = document.getElementById('memo-status-text');
  const input = document.getElementById('memo-input');
  if (statusBar && statusText) {
    statusBar.style.display = 'flex';
    statusText.innerHTML = `<span><svg style="width:12px; height:12px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg> 수정 중...</span>`;
  }
  if (input) {
    input.innerHTML = memo.content;
    input.focus();
  }
}

function setReplyMode(id) {
  const memo = (state.db.memos || []).find(m => m.id === id);
  if (!memo) return;
  currentReplyId = id;
  currentEditId = null;
  const statusBar = document.getElementById('memo-status-bar');
  const statusText = document.getElementById('memo-status-text');
  const input = document.getElementById('memo-input');
  if (statusBar && statusText) {
    statusBar.style.display = 'flex';
    const plainPreview = memo.content.replace(/<[^>]*>/g, '').substring(0, 15);
    statusText.innerHTML = `<span><svg style="width:12px; height:12px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="15 10 20 15 15 20"></polyline><path d="M4 4v7a4 4 0 0 0 4 4h12"></path></svg> <b>${escapeHtml(plainPreview)}...</b> 에 답글 중</span>`;
  }
  if (input) {
    input.innerHTML = '';
    input.focus();
  }
}

function deleteMemo(id) {
  if (!confirm('이 메모를 삭제하시겠습니까?')) return;
  if ((state.db.meta || {}).pinnedMemoId === id) {
    if (state.db.meta) state.db.meta.pinnedMemoId = null;
  }
  state.db.memos = (state.db.memos || []).filter(m => m.id !== id && m.parentId !== id);
  saveDB(state.db);
  if (state.user) deleteMemoFromFirebase(state.user, id).catch(console.error);
  renderMemos(false);
}
function pinMemo(id) {
  const memo = (state.db.memos || []).find(m => m.id === id);
  if (!memo) return;
  if (state.db.meta) state.db.meta.pinnedMemoId = id;
  memo.isPinnedHistory = true;
  saveDB(state.db);
  if (state.user) {
    saveMetaToFirebase(state.user, state.db.meta).catch(console.error);
    saveMemoToFirebase(state.user, memo).catch(console.error);
  }
  renderMemos(false);
}

function unpinMemo() {
  if (state.db.meta) state.db.meta.pinnedMemoId = null;
  saveDB(state.db);
  if (state.user) saveMetaToFirebase(state.user, state.db.meta).catch(console.error);
  renderMemos(false);
}

function unhistoryMemo(id) {
  if (!confirm('이 항목을 공지 히스토리에서 제거하시겠습니까? (원본 메시지는 유지됩니다)')) return;
  const memo = (state.db.memos || []).find(m => m.id === id);
  if (memo) memo.isPinnedHistory = false;
  saveDB(state.db);
  if (state.user && memo) saveMemoToFirebase(state.user, memo).catch(console.error);
  renderMemos(false);
}

function sendMemo() {
  const input = document.getElementById('memo-input');
  if (!input) return;
  const content = input.innerHTML.trim();
  if (!content || content === '<br>') return;

  if (currentEditId) {
    const memo = (state.db.memos || []).find(m => m.id === currentEditId);
    if (memo) memo.content = content;
    newlyAddedId = currentEditId; 
    resetInputState();
  } else {
    const newMemo = {
      id: crypto.randomUUID(),
      content,
      date: new Date().toISOString(), // Keeping ISO for DB standard, but logic will use local
      parentId: currentReplyId || null
    };
    if (!state.db.memos) state.db.memos = [];
    state.db.memos.push(newMemo);
    newlyAddedId = newMemo.id;
    const dateStr = new Date(newMemo.date).toISOString().split('T')[0];
    collapsedFolders.delete(dateStr);
    
    // Auto switch to memo's month if it's not the current view
    const d = new Date(newMemo.date);
    const newMemoMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (currentViewMonth !== newMemoMonth) {
      currentViewMonth = newMemoMonth;
    }
    resetInputState();
  }
  saveDB(state.db);
  if (state.user) {
    if (currentEditId) {
      const memo = (state.db.memos || []).find(m => m.id === currentEditId);
      if (memo) saveMemoToFirebase(state.user, memo).catch(console.error);
    } else {
      const newMemo = state.db.memos[state.db.memos.length - 1];
      saveMemoToFirebase(state.user, newMemo).catch(console.error);
    }
  }
  renderMemos(true);
  // Auto scroll to bottom after sending (v2.1.8)
  setTimeout(() => {
    const container = document.getElementById('memo-messages');
    if (container) container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
  }, 100);
}

function groupMemosByDate(memos) {
  const groups = {};
  memos.forEach(m => {
    const d = new Date(m.date);
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (!groups[date]) groups[date] = [];
    groups[date].push(m);
  });
  return groups;
}

export function renderMemos(forceScrollToBottom = false) {
  window.renderMemos = renderMemos; // Expose for app.js sync
  const container = document.getElementById('memo-messages');
  const monthTitle = document.getElementById('memo-month-title');
  const pinArea = document.getElementById('memo-pin-area');
  const restoreBtn = document.getElementById('memo-pin-restore');
  const historyToggle = document.getElementById('memo-history-toggle');
  
  if (!container) return;
  if (monthTitle) monthTitle.innerText = isHistoryView ? 'Pin History' : currentViewMonth;
  if (historyToggle) {
    if (isHistoryView) historyToggle.classList.add('active');
    else historyToggle.classList.remove('active');
  }

  // History View Mode
  if (isHistoryView) {
    renderHistoryView(container, pinArea, restoreBtn);
    return;
  }

  // Standard Mode
  renderStandardView(container, pinArea, restoreBtn, forceScrollToBottom);
}

function renderHistoryView(container, pinArea, restoreBtn) {
  if (pinArea) pinArea.classList.add('memo-hide');
  if (restoreBtn) restoreBtn.classList.add('memo-hide');

  const historyMemos = (state.db.memos || [])
    .filter(m => m.isPinnedHistory && m.date.startsWith(currentViewMonth))
    .sort((a,b) => new Date(b.date) - new Date(a.date));

  let html = `
    <div class="history-header">
      <h5>📜 ${currentViewMonth} 공지 내역</h5>
      <button class="history-back-btn" data-action="history-back">채팅으로 돌아가기 ↩</button>
    </div>
    <div style="padding: 16px 0;">
  `;

  if (historyMemos.length === 0) {
    html += `<div style="text-align:center; padding: 40px; color:#94a3b8; font-size:13px;">${currentViewMonth}에 기록된 공지 내역이 없습니다.</div>`;
  } else {
    historyMemos.forEach(m => {
      const dateLabel = new Date(m.date).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      html += `
        <div class="history-item">
          <div class="history-item-header">
            <span>Pinned on ${dateLabel}</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="width:12px; height:12px"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
          </div>
          <div class="history-item-content">${processMemoMarkdown(m.content)}</div>
          <div class="history-item-footer">
            <button class="memo-action-btn" data-id="${m.id}" data-action="unhistory" title="히스토리에서 삭제" style="color:var(--red);">🗑️</button>
            <button class="memo-action-btn" data-id="${m.id}" data-action="pin" title="현재 공지로 지정">📍</button>
          </div>
        </div>
      `;
    });
  }

  html += `</div>`;
  container.innerHTML = html;
  container.scrollTop = 0;
}

function renderStandardView(container, pinArea, restoreBtn, forceScrollToBottom) {
  // Render Pin Bar
  const pinnedId = (state.db.meta || {}).pinnedMemoId;
  const pinnedMemo = pinnedId ? (state.db.memos || []).find(m => m.id === pinnedId) : null;
  
  if (pinArea) {
    if (pinnedMemo && !isPinCollapsed) {
      const cleanText = getPlainText(pinnedMemo.content);
      pinArea.innerHTML = `
        <div class="pin-text">${escapeHtml(cleanText)}</div>
        <div class="pin-actions">
          <button class="pin-action-btn pin-hide" title="숨기기">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="width:14px; height:14px"><path d="m18 15-6-6-6 6"/></svg>
          </button>
          <button class="pin-action-btn pin-unpin" title="닫기">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="width:14px; height:14px"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>
      `;
      pinArea.classList.remove('memo-hide');
      if (restoreBtn) restoreBtn.classList.add('memo-hide');
    } else {
      pinArea.classList.add('memo-hide');
      if (pinnedMemo && isPinCollapsed && restoreBtn) {
        restoreBtn.classList.remove('memo-hide');
      } else if (restoreBtn) {
        restoreBtn.classList.add('memo-hide');
      }
    }
  }

  let allMemos = state.db.memos || [];
  
  // 1. Month Filter
  let filteredByMonth = allMemos.filter(m => m.date.startsWith(currentViewMonth));
  
  // 2. Search Filter (Threaded logic)
  let finalMemos = filteredByMonth;
  if (searchQuery) {
    // We need to keep root if root matches OR any of its replies matches
    const roots = filteredByMonth.filter(m => !m.parentId);
    const replies = filteredByMonth.filter(m => m.parentId);
    
    const matchingRoots = roots.filter(root => {
      // Check root itself
      const rootText = root.content.replace(/<[^>]*>/g, '').toLowerCase();
      if (rootText.includes(searchQuery)) return true;
      
      // Check its replies
      const itsReplies = replies.filter(r => r.parentId === root.id);
      return itsReplies.some(reply => {
        const replyText = reply.content.replace(/<[^>]*>/g, '').toLowerCase();
        return replyText.includes(searchQuery);
      });
    });
    
    // Build the final list: matching roots + ALL their replies (or just matching replies? 
    // User wants to go to 'the location', so let's show matching roots and all their replies for context)
    const finalSet = new Set();
    matchingRoots.forEach(root => {
      finalSet.add(root);
      const itsReplies = replies.filter(r => r.parentId === root.id);
      itsReplies.forEach(reply => finalSet.add(reply));
    });
    
    finalMemos = Array.from(finalSet);
  }

  if (finalMemos.length === 0) {
    container.innerHTML = `<div class="empty-state" style="text-align:center; padding: 60px 40px; color:#94a3b8; font-size:13px;">
      <p>${searchQuery ? '검색 결과가 없습니다.' : currentViewMonth + '에 기록된 메모가 없습니다.'}</p>
    </div>`;
    return;
  }

  const groups = groupMemosByDate(finalMemos);
  const sortedDates = Object.keys(groups).sort((a, b) => new Date(a) - new Date(b));

  let html = '';
  sortedDates.forEach(date => {
    const dateMemos = groups[date];
    const isCollapsed = collapsedFolders.has(date) && !searchQuery;
    const dateLabel = formatDateLabel(date);
    
    html += `
      <div class="memo-date-folder ${isCollapsed ? 'collapsed' : ''}">
        <div class="memo-date-header" data-date="${date}">
          <span>
            <svg class="toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="6 9 12 15 18 9"></polyline></svg>
            ${dateLabel}
          </span>
          <span style="opacity:0.6; font-size:10px;">${dateMemos.length}</span>
        </div>
        <div class="memo-folder-content">
    `;

    const roots = dateMemos.filter(m => !m.parentId).sort((a,b) => new Date(a.date) - new Date(b.date));
    const replies = dateMemos.filter(m => m.parentId);

    roots.forEach(root => {
      html += `<div class="memo-thread">`;
      html += renderBubble(root, false);
      const itsReplies = replies.filter(r => r.parentId === root.id).sort((a,b) => new Date(a.date) - new Date(b.date));
      itsReplies.forEach(reply => html += renderBubble(reply, true));
      html += `</div>`;
    });

    html += `</div></div>`;
  });

  container.innerHTML = html;
  
  // Robust animated scroll-to-bottom only when forced
  if (forceScrollToBottom && !searchQuery) {
    setTimeout(() => {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: 'smooth'
      });
    }, 50);
  }
  
  setTimeout(() => { newlyAddedId = null; }, 1000);
}

function formatDateLabel(dateStr) {
  const d = new Date(dateStr);
  const options = { month: 'long', day: 'numeric', weekday: 'short' };
  return d.toLocaleDateString('ko-KR', options);
}

function processMemoMarkdown(content) {
  let text = content;
  
  // 1. Search Highlight
  if (searchQuery) {
    const regex = new RegExp(`(${searchQuery})`, 'gi');
    text = text.replace(regex, '<span class="search-highlight">$1</span>');
  }

  // 2. HashTags (#tags)
  text = text.replace(/(#[A-Za-z0-9ㄱ-ㅎㅏ-ㅣ가-힣_]+)/g, '<span class="hashtag">$1</span>');

  // 3. Tickers ($TICKER)
  text = text.replace(/(\$[A-Z0-9]+)/g, '<span class="ticker-ref">$1</span>');

  // 4. Linkification
  return text.replace(/(https?:\/\/[^\s<]+)/g, url => `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`);
}

function renderBubble(m, isReply) {
  const isNew = m.id === newlyAddedId;
  return `
    <div class="memo-bubble-container ${isReply ? 'reply-container' : 'root-container'}">
      <div class="memo-bubble ${isReply ? 'reply' : ''} ${isNew ? 'is-new' : ''}" data-id="${m.id}">
        <div class="content">${processMemoMarkdown(m.content)}</div>
      </div>
      <div class="memo-meta">
        <div class="date">${formatMemoTime(m.date)}</div>
        <div class="memo-actions">
          ${!isReply ? `
            <button class="memo-action-btn" data-id="${m.id}" data-action="reply" title="답글">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 10 20 15 15 20"></polyline><path d="M4 4v7a4 4 0 0 0 4 4h12"></path></svg>
            </button>
            <button class="memo-action-btn" data-id="${m.id}" data-action="pin" title="공지 등록">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
            </button>
          ` : ''}
          <button class="memo-action-btn" data-id="${m.id}" data-action="edit" title="수정">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
          </button>
          <button class="memo-action-btn" data-id="${m.id}" data-action="delete" title="삭제">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
          </button>
        </div>
      </div>
    </div>
  `;
}

function formatMemoTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function exportMemos(startDate, endDate) {
  const allMemos = state.db.memos || [];
  // Filter by date (ensure local date comparison)
  const filtered = allMemos.filter(m => {
    const d = new Date(m.date).toISOString().split('T')[0];
    return d >= startDate && d <= endDate;
  }).sort((a,b) => new Date(a.date) - new Date(b.date));

  if (filtered.length === 0) {
    alert('해당 기간에 기록된 메모가 없습니다.');
    return;
  }

  let markdown = `# Trading Memos (${startDate} ~ ${endDate})\n\n`;
  markdown += `> Generated on ${new Date().toLocaleString('ko-KR')}\n\n---\n\n`;

  filtered.forEach((m, idx) => {
    const d = new Date(m.date);
    const dateStr = d.toLocaleString('ko-KR', { 
      year: 'numeric', month: 'long', day: 'numeric', 
      weekday: 'short', hour: '2-digit', minute: '2-digit' 
    });
    
    // Clean content (Remove HTML tags, handle line breaks)
    let cleanContent = m.content
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<p>/gi, '')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .trim();

    markdown += `### [${idx + 1}] ${dateStr}\n\n`;
    markdown += `${cleanContent}\n\n`;
    markdown += `---\n\n`;
  });

  // Download logic
  const blob = new Blob([markdown], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `trading_memos_${startDate.replace(/-/g,'')}_${endDate.replace(/-/g,'')}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initMemoWidget);
} else {
  initMemoWidget();
}
