import { state } from './app.js';
import { saveDB, saveCampusNotes, loadCampusNotes, saveCampusCategories, loadCampusCategories, saveCampusSubtitle, loadCampusSubtitle, normalizeCampusNote } from './storage.js';

// Top-level global assignments for inline HTML onclick handlers
window.__campus_move = (idx, dir) => campusManager.moveCategory(idx, dir);
window.__campus_del = (idx) => campusManager.deleteCategoryModal(idx);
window.__campus_update_chart = (idx, val) => campusManager.updateChartUrl(idx, val);
window.__campus_remove_chart = (idx) => campusManager.removeChart(idx);

export const campusManager = {
  activeCategory: 'All',
  searchQuery: '',
  editingId: null,
  currentCharts: [],

  /**
   * Step 4 Fix: init() now reads DIRECTLY from dedicated storage.
   * It does NOT rely on state.db being fully hydrated yet.
   */
  init() {
    console.log('[Campus] Initializing with dedicated storage...');

    // ── LOAD from dedicated storage (synchronous, always latest) ──
    const savedNotes = loadCampusNotes();
    const savedCategories = loadCampusCategories();
    const savedSubtitle = loadCampusSubtitle();

    // Populate state.db from dedicated storage (source of truth)
    if (savedNotes !== null) {
      state.db.campusNotes = savedNotes;
    } else if (!Array.isArray(state.db.campusNotes)) {
      state.db.campusNotes = [];
    }

    if (savedCategories !== null) {
      state.db.campusCategories = savedCategories;
    } else if (!Array.isArray(state.db.campusCategories) || state.db.campusCategories.length === 0) {
      state.db.campusCategories = ['General', 'Strategy', 'Psychology', 'Market', 'Knowledge'];
    }

    if (savedSubtitle !== null) {
      state.db.campusSubtitle = savedSubtitle;
    }

    this.bindEvents();
    this.render();
    console.log(`[Campus] Ready. ${state.db.campusNotes.length} notes loaded.`);
  },

  getEl(id) {
    return document.getElementById(id);
  },

  bindEvents() {
    const header = this.getEl('campus-composer-header');
    if (header) header.onclick = (e) => { e.stopPropagation(); this.expandComposer(); };

    const btnSave = this.getEl('btn-save-note');
    if (btnSave) btnSave.onclick = (e) => { e.preventDefault(); this.saveNote(); };

    const btnCancel = this.getEl('btn-cancel-note');
    if (btnCancel) btnCancel.onclick = (e) => { e.preventDefault(); this.resetComposer(); };

    const btnAddChart = this.getEl('btn-add-campus-chart');
    if (btnAddChart) btnAddChart.onclick = () => this.addChart();

    // NOTE: btn-open-campus-cat-modal uses inline onclick="window.campusManager.manageCategories()"
    // No need to bind here - avoids timing issues.

    const searchInput = this.getEl('campus-search');
    if (searchInput) {
      searchInput.oninput = (e) => {
        this.searchQuery = e.target.value.toLowerCase();
        this.renderFeed();
      };
    }

    const btnEditSubtitle = this.getEl('btn-edit-campus-subtitle');
    if (btnEditSubtitle) {
      btnEditSubtitle.onclick = () => {
        const textEl = this.getEl('campus-subtitle-text');
        const current = textEl ? textEl.innerText : '';
        const newVal = prompt('부제목 수정:', current);
        if (newVal !== null) {
          const trimmed = newVal.trim();
          state.db.campusSubtitle = trimmed;
          saveCampusSubtitle(trimmed); // dedicated save
          saveDB(state.db);            // main DB backup
          this.render();
        }
      };
    }

    // Rich Text Toolbar — custom handler for font size (px-precise)
    const toolbar = this.getEl('campus-editor-toolbar');
    const editor = this.getEl('campus-note-content');

    if (toolbar) {
      // Bold / Italic / Underline (standard execCommand)
      toolbar.querySelectorAll('button[data-command]').forEach(btn => {
        btn.onclick = (e) => {
          e.preventDefault();
          document.execCommand(btn.dataset.command, false, btn.dataset.value || null);
          if (editor) editor.focus();
        };
      });

      // Font Size buttons — use precise px via inline <span> (NOT execCommand fontSize)
      toolbar.querySelectorAll('button.font-size-btn').forEach(btn => {
        btn.onclick = (e) => {
          e.preventDefault();
          this.applyFontSize(parseInt(btn.dataset.px, 10));
          if (editor) editor.focus();
        };
      });
    }

    // Initialize editor: set default 16px on focus if empty
    if (editor) {
      editor.addEventListener('focus', () => {
        // If completely empty, ensure default font size
        if (!editor.textContent.trim() && !editor.querySelector('*')) {
          editor.style.fontSize = '16px';
        }
      });

      // Prevent font size inheritance on Enter — reset new line to default 16px
      editor.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          // Let browser insert the line break first, then normalize
          setTimeout(() => this._normalizeNewLine(editor), 0);
        }
      });
    }
  },

  /**
   * Apply exact pixel font size ONLY to selected text (or set pending size for next typed chars).
   * NEVER modifies the editor's overall font size.
   */
  applyFontSize(px) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);

    if (range.collapsed) {
      // ── No selection: insert a sized span at cursor so next typed chars use this size ──
      const span = document.createElement('span');
      span.style.fontSize = px + 'px';
      span.style.lineHeight = '1.8';
      // Use a zero-width non-joiner as placeholder so span is valid
      span.appendChild(document.createTextNode('\u200B'));

      range.insertNode(span);

      // Move cursor INSIDE the span (after the zero-width char)
      const newRange = document.createRange();
      newRange.setStartAfter(span.firstChild);
      newRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(newRange);
      return;
    }

    // ── Text is selected: wrap ONLY the selection in a sized span ──
    try {
      // Use execCommand fontSize=7 as a marker, then replace with proper span
      document.execCommand('fontSize', false, '7');

      const editor = this.getEl('campus-note-content');
      if (!editor) return;

      // Replace every <font size="7"> marker with <span style="font-size:Xpx">
      editor.querySelectorAll('font[size="7"]').forEach(font => {
        const span = document.createElement('span');
        span.style.fontSize = px + 'px';
        span.style.lineHeight = '1.8';
        while (font.firstChild) span.appendChild(font.firstChild);
        font.parentNode.replaceChild(span, font);
      });

      // Collapse selection to end to deselect
      sel.collapseToEnd();
    } catch (e) {
      console.warn('[Campus] applyFontSize fallback:', e);
    }
  },

  /**
   * Normalize newly created lines after Enter press.
   * Removes inherited large font sizes from block wrappers.
   */
  _normalizeNewLine(editor) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const node = sel.anchorNode;
    let block = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    while (block && block !== editor && !['DIV', 'P'].includes(block.tagName)) {
      block = block.parentElement;
    }
    // Only reset if the block itself (not a child span) has a font-size
    if (block && block !== editor && block.style && block.style.fontSize) {
      block.style.fontSize = '';
    }
  },


  expandComposer() {
    const expanded = this.getEl('composer-expanded');
    const header = this.getEl('campus-composer-header');
    if (expanded && header) {
      expanded.classList.remove('hidden');
      header.classList.add('hidden');
      const content = this.getEl('campus-note-content');
      if (content) content.focus();
    }
  },

  resetComposer() {
    this.editingId = null;
    this.currentCharts = [];
    const content = this.getEl('campus-note-content');
    const tags = this.getEl('campus-note-tags');
    if (content) content.innerHTML = '';
    if (tags) tags.value = '';
    this.renderCharts();
    const expanded = this.getEl('composer-expanded');
    const header = this.getEl('campus-composer-header');
    if (expanded) expanded.classList.add('hidden');
    if (header) header.classList.remove('hidden');
    const btnSave = this.getEl('btn-save-note');
    if (btnSave) btnSave.innerText = 'Post';
  },

  addChart() {
    this.currentCharts.push('');
    this.renderCharts();
  },

  updateChartUrl(idx, val) {
    this.currentCharts[idx] = val.trim();
  },

  removeChart(idx) {
    this.currentCharts.splice(idx, 1);
    this.renderCharts();
  },

  renderCharts() {
    const container = this.getEl('campus-chart-list');
    if (!container) return;
    container.innerHTML = this.currentCharts.map((url, idx) => `
      <div class="campus-chart-item">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
        <input type="text" placeholder="https://www.tradingview.com/x/..." value="${url}" oninput="window.__campus_update_chart(${idx}, this.value)" />
        <span class="btn-remove-chart" onclick="window.__campus_remove_chart(${idx})">✕</span>
      </div>
    `).join('');
  },

  saveNote() {
    const contentEl = this.getEl('campus-note-content');
    const categoryEl = this.getEl('campus-note-category');
    const tagsEl = this.getEl('campus-note-tags');

    const content = contentEl ? contentEl.innerHTML.trim() : '';
    const category = categoryEl ? categoryEl.value : 'General';
    const tags = (tagsEl ? tagsEl.value : '').split(',').map(t => t.trim()).filter(t => t);
    const charts = this.currentCharts.filter(c => c.trim());

    const hasContent = content && content !== '<br>';
    const hasCharts = charts.length > 0;

    if (!hasContent && !hasCharts) {
      alert('내용 또는 차트 링크를 입력해주세요.');
      return;
    }

    const noteData = {
      content: hasContent ? content : '',
      category,
      tags,
      charts,
      updatedAt: new Date().toISOString()
    };

    if (this.editingId) {
      const idx = state.db.campusNotes.findIndex(n => n.id === this.editingId);
      if (idx !== -1) {
        state.db.campusNotes[idx] = { ...state.db.campusNotes[idx], ...noteData };
      }
    } else {
      state.db.campusNotes.unshift({
        id: 'cn-' + Date.now(),
        date: new Date().toISOString(),
        ...noteData
      });
    }

    // ── DUAL SAVE: dedicated storage (primary) + main DB (backup) ──
    saveCampusNotes(state.db.campusNotes);   // synchronous, immediate
    saveDB(state.db);                         // async backup to IDB

    this.resetComposer();
    this.render();
    if (window.showToast) window.showToast('성공적으로 기록되었습니다.');
  },

  render() {
    this.renderCategories();
    this.renderFeed();
    this.updateComposerCategories();
    const textEl = this.getEl('campus-subtitle-text');
    if (textEl && state.db.campusSubtitle) textEl.innerText = state.db.campusSubtitle;
  },

  renderCategories() {
    const container = this.getEl('campus-categories');
    if (!container) return;
    const cats = ['All', ...(state.db.campusCategories || [])];
    const notes = state.db.campusNotes || [];
    container.innerHTML = cats.map(cat => {
      if (cat === '{divider}') return `<div class="sidebar-divider"></div>`;
      const count = cat === 'All' ? notes.length : notes.filter(n => n.category === cat).length;
      return `<div class="category-item ${this.activeCategory === cat ? 'active' : ''}" data-category="${cat}">
        <span>${cat}</span>
        <span class="category-count">${count}</span>
      </div>`;
    }).join('');
    container.querySelectorAll('.category-item').forEach(item => {
      item.onclick = () => { this.activeCategory = item.dataset.category; this.renderCategories(); this.renderFeed(); };
    });
  },

  updateComposerCategories() {
    const select = this.getEl('campus-note-category');
    if (!select) return;
    const cats = (state.db.campusCategories || []).filter(c => c !== '{divider}');
    if (cats.length === 0) cats.push('General');
    select.innerHTML = cats.map(cat => `<option value="${cat}">${cat}</option>`).join('');
  },

  renderFeed() {
    const container = this.getEl('campus-feed-container');
    if (!container) return;
    let notes = state.db.campusNotes || [];
    if (this.activeCategory !== 'All') notes = notes.filter(n => n.category === this.activeCategory);
    if (this.searchQuery) {
      notes = notes.filter(n =>
        (n.content && n.content.toLowerCase().includes(this.searchQuery)) ||
        (n.tags && n.tags.some(t => t.toLowerCase().includes(this.searchQuery)))
      );
    }

    if (notes.length === 0) {
      container.innerHTML = '<div class="empty-placeholder">기록이 없습니다.</div>';
      return;
    }

    container.innerHTML = notes.map(note => `
      <article class="campus-note-card" data-id="${note.id}">
        <div class="campus-note-header">
          <span class="campus-note-category">${note.category}</span>
          <span class="campus-note-date">${new Date(note.date).toLocaleDateString()}</span>
        </div>
        <div class="campus-note-content">${note.content}</div>
        ${(note.charts && note.charts.length > 0) ? `
          <div class="campus-note-charts">
            ${note.charts.map(url => `
              <div class="campus-chart-preview">
                <a href="${url}" target="_blank" title="Click to view full image">
                  <img src="${url}" alt="Chart" onerror="this.parentElement.innerHTML='<span class=\'chart-link-fallback\'>🔗 View Chart</span>'" />
                </a>
              </div>
            `).join('')}
          </div>
        ` : ''}
        <div class="campus-note-footer">
          <div class="campus-note-tags">${(note.tags || []).map(tag => `<span class="campus-tag">#${tag}</span>`).join('')}</div>
          <div class="campus-note-actions">
            <button class="btn-note-action btn-edit-note" title="수정">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </button>
            <button class="btn-note-action danger btn-delete-note" title="삭제">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
        </div>
      </article>
    `).join('');

    container.querySelectorAll('.campus-note-card').forEach(card => {
      const id = card.dataset.id;
      card.querySelector('.btn-edit-note').onclick = (e) => { e.stopPropagation(); this.editNote(id); };
      card.querySelector('.btn-delete-note').onclick = (e) => { e.stopPropagation(); this.deleteNote(id); };
      
      card.onclick = (e) => {
        // [IMPORTANT] If user is selecting/dragging text, don't toggle expansion
        const selection = window.getSelection().toString();
        if (selection) return;

        const c = card.querySelector('.campus-note-content');
        if (c) c.classList.toggle('expanded');
      };
    });
  },

  editNote(id) {
    const note = state.db.campusNotes.find(n => n.id === id);
    if (!note) return;
    this.editingId = id;
    this.currentCharts = [...(note.charts || [])];
    const content = this.getEl('campus-note-content');
    if (content) content.innerHTML = note.content || '';
    const catSelect = this.getEl('campus-note-category');
    if (catSelect) catSelect.value = note.category;
    const tags = this.getEl('campus-note-tags');
    if (tags) tags.value = (note.tags || []).join(', ');
    this.renderCharts();
    this.expandComposer();
    const btnSave = this.getEl('btn-save-note');
    if (btnSave) btnSave.innerText = 'Update';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  deleteNote(id) {
    if (!confirm('삭제하시겠습니까?')) return;
    state.db.campusNotes = state.db.campusNotes.filter(n => n.id !== id);
    saveCampusNotes(state.db.campusNotes); // dedicated save
    saveDB(state.db);                       // main DB backup
    this.render();
  },

  // ── Category Management Modal (dedicated campus modal) ──

  manageCategories() {
    const modal = this.getEl('campus-category-modal');
    if (!modal) {
      console.warn('[Campus] campus-category-modal not found in DOM');
      return;
    }

    // Bind Add button
    const addBtn = this.getEl('campus-cat-add-btn');
    const input = this.getEl('campus-cat-input');
    if (addBtn) {
      addBtn.onclick = () => {
        const v = input ? input.value.trim() : '';
        if (!v) return;
        if (!state.db.campusCategories) state.db.campusCategories = [];
        state.db.campusCategories.push(v);
        this._saveCategories();
        if (input) input.value = '';
        this.renderCategoryModalList();
        this.renderCategories();
        this.updateComposerCategories();
      };
    }

    // Enter key on input
    if (input) {
      input.onkeydown = (e) => {
        if (e.key === 'Enter') { e.preventDefault(); addBtn && addBtn.click(); }
      };
    }

    // Bind Divider button
    const divBtn = this.getEl('campus-cat-divider-btn');
    if (divBtn) {
      divBtn.onclick = () => {
        if (!state.db.campusCategories) state.db.campusCategories = [];
        state.db.campusCategories.push('{divider}');
        this._saveCategories();
        this.renderCategoryModalList();
        this.renderCategories();
      };
    }

    // Bind Close button
    const closeBtn = this.getEl('campus-cat-close-btn');
    if (closeBtn) {
      closeBtn.onclick = () => modal.classList.remove('show');
    }

    // Close on overlay click
    modal.onclick = (e) => {
      if (e.target === modal) modal.classList.remove('show');
    };

    this.renderCategoryModalList();
    modal.classList.add('show');   // ← .show (not .active!)
  },

  _saveCategories() {
    saveCampusCategories(state.db.campusCategories); // dedicated save
    saveDB(state.db);                                 // main DB backup
  },

  renderCategoryModalList() {
    const list = this.getEl('campus-cat-list');
    if (!list) return;
    const cats = state.db.campusCategories || [];

    if (cats.length === 0) {
      list.innerHTML = '<div style="text-align:center; color:var(--muted); padding:24px; font-size:13px;">카테고리가 없습니다.</div>';
      return;
    }

    list.innerHTML = cats.map((c, i) => {
      const isDivider = c === '{divider}';
      if (isDivider) {
        return `
          <div class="category-manage-item divider-item" style="display:flex; align-items:center; gap:8px; padding:8px 12px; border-radius:8px; background:var(--bg-secondary); border:1px dashed var(--border-main);">
            <span style="flex:1; color:var(--muted); font-size:12px; letter-spacing:2px;">─── 구분선 ───</span>
            <div style="display:flex; gap:4px;">
              <button onclick="window.__campus_move(${i}, -1)" class="btn-cat-action" title="위로">▲</button>
              <button onclick="window.__campus_move(${i}, 1)"  class="btn-cat-action" title="아래로">▼</button>
              <button onclick="window.__campus_del(${i})"      class="btn-cat-action danger" title="삭제">✕</button>
            </div>
          </div>`;
      }
      return `
        <div class="category-manage-item" style="display:flex; align-items:center; gap:8px; padding:10px 12px; border-radius:8px; background:var(--bg-panel); border:1px solid var(--border-main);">
          <span style="flex:1; font-size:13px; font-weight:600; color:var(--text-main);">${c}</span>
          <div style="display:flex; gap:4px;">
            <button onclick="window.__campus_move(${i}, -1)" class="btn-cat-action" title="위로">▲</button>
            <button onclick="window.__campus_move(${i}, 1)"  class="btn-cat-action" title="아래로">▼</button>
            <button onclick="window.__campus_del(${i})"      class="btn-cat-action danger" title="삭제">✕</button>
          </div>
        </div>`;
    }).join('');
  },

  moveCategory(idx, dir) {
    const cats = state.db.campusCategories;
    const n = idx + dir;
    if (n >= 0 && n < cats.length) {
      [cats[idx], cats[n]] = [cats[n], cats[idx]];
      this._saveCategories();
      this.renderCategoryModalList();
      this.renderCategories();
    }
  },

  deleteCategoryModal(idx) {
    state.db.campusCategories.splice(idx, 1);
    this._saveCategories();
    this.renderCategoryModalList();
    this.render();
  }
};

// CRITICAL: Expose to window so HTML inline onclick="window.campusManager.manageCategories()" works
window.campusManager = campusManager;
