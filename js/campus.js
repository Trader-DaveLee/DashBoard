import { state } from './app.js';
import { saveDB } from './storage.js';

export const campusManager = {
  activeCategory: 'All',
  searchQuery: '',
  editingId: null,
  currentCharts: [],

  init() {
    console.log('[Campus] Initializing Manager...');
    
    // One-time emergency cleanup if data is corrupted
    if (!Array.isArray(state.db.campusNotes)) {
      console.warn('[Campus] campusNotes was not an array. Resetting.');
      state.db.campusNotes = [];
    }
    if (!Array.isArray(state.db.campusCategories)) {
      console.warn('[Campus] campusCategories was not an array. Resetting.');
      state.db.campusCategories = ['General', 'Strategy', 'Psychology', 'Market', 'Knowledge'];
    }

    this.bindEvents();
    this.render();
  },

  getEl(id) {
    return document.getElementById(id);
  },

  bindEvents() {
    console.log('[Campus] Binding events...');
    
    // Use event delegation for buttons that might be dynamic or to ensure reliability
    const header = this.getEl('campus-composer-header');
    if (header) {
      header.onclick = (e) => {
        e.stopPropagation();
        this.expandComposer();
      };
    }

    const btnSave = this.getEl('btn-save-note');
    if (btnSave) btnSave.onclick = (e) => { e.preventDefault(); this.saveNote(); };

    const btnCancel = this.getEl('btn-cancel-note');
    if (btnCancel) btnCancel.onclick = (e) => { e.preventDefault(); this.resetComposer(); };

    const btnAddChart = this.getEl('btn-add-campus-chart');
    if (btnAddChart) btnAddChart.onclick = () => this.addChart();

    const btnManage = this.getEl('btn-manage-campus-categories');
    if (btnManage) btnManage.onclick = () => this.manageCategories();

    const searchInput = this.getEl('campus-search');
    if (searchInput) {
      searchInput.oninput = (e) => {
        this.searchQuery = e.target.value.toLowerCase();
        this.render();
      };
    }

    const btnEditSubtitle = this.getEl('btn-edit-campus-subtitle');
    if (btnEditSubtitle) {
      btnEditSubtitle.onclick = () => {
        const textEl = this.getEl('campus-subtitle-text');
        const current = textEl ? textEl.innerText : '';
        const newVal = prompt('Campus 부제목을 수정하세요:', current);
        if (newVal !== null) {
          state.db.campusSubtitle = newVal.trim();
          saveDB(state.db);
          this.render();
        }
      };
    }

    // Rich Text Toolbar
    const toolbar = this.getEl('campus-editor-toolbar');
    if (toolbar) {
      toolbar.querySelectorAll('button[data-command]').forEach(btn => {
        btn.onclick = (e) => {
          e.preventDefault();
          const cmd = btn.dataset.command;
          const val = btn.dataset.value || null;
          document.execCommand(cmd, false, val);
          const editor = this.getEl('campus-note-content');
          if (editor) editor.focus();
        };
      });
    }
  },

  expandComposer() {
    const expanded = this.getEl('composer-expanded');
    const header = this.getEl('campus-composer-header');
    const content = this.getEl('campus-note-content');
    
    if (expanded && header) {
      expanded.classList.remove('hidden');
      header.classList.add('hidden');
      if (content) content.focus();
    }
  },

  resetComposer() {
    this.editingId = null;
    this.currentCharts = [];
    
    const content = this.getEl('campus-note-content');
    const tags = this.getEl('campus-note-tags');
    const expanded = this.getEl('composer-expanded');
    const header = this.getEl('campus-composer-header');
    const btnSave = this.getEl('btn-save-note');

    if (content) content.innerHTML = '';
    if (tags) tags.value = '';
    this.renderCharts();
    
    if (expanded) expanded.classList.add('hidden');
    if (header) header.classList.remove('hidden');
    if (btnSave) btnSave.innerText = 'Post';
  },

  addChart() {
    this.currentCharts.push('');
    this.renderCharts();
  },

  renderCharts() {
    const container = this.getEl('campus-chart-list');
    if (!container) return;

    container.innerHTML = this.currentCharts.map((url, idx) => `
      <div class="campus-chart-item">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
        <input type="text" placeholder="TradingView Image URL" value="${url}" oninput="window.__campus_update_chart(${idx}, this.value)" />
        <span class="btn-remove-chart" onclick="window.__campus_remove_chart(${idx})">✕</span>
      </div>
    `).join('');

    window.__campus_update_chart = (idx, val) => {
      this.currentCharts[idx] = val.trim();
    };
    window.__campus_remove_chart = (idx) => {
      this.currentCharts.splice(idx, 1);
      this.renderCharts();
    };
  },

  saveNote() {
    console.log('[Campus] Attempting to save note...');
    const contentEl = this.getEl('campus-note-content');
    const categoryEl = this.getEl('campus-note-category');
    const tagsEl = this.getEl('campus-note-tags');

    if (!contentEl) return;

    const content = contentEl.innerHTML.trim();
    const category = categoryEl ? categoryEl.value : 'General';
    const tags = (tagsEl ? tagsEl.value : '').split(',').map(t => t.trim()).filter(t => t);
    const charts = this.currentCharts.filter(c => c);

    if (!content || content === '<br>') {
      alert('내용을 입력해주세요.');
      return;
    }

    const noteData = {
      content,
      category,
      tags,
      charts,
      updatedAt: new Date().toISOString()
    };

    try {
      if (this.editingId) {
        const idx = state.db.campusNotes.findIndex(n => n.id === this.editingId);
        if (idx !== -1) {
          state.db.campusNotes[idx] = { ...state.db.campusNotes[idx], ...noteData };
        }
      } else {
        state.db.campusNotes.push({
          id: 'cn-' + Date.now(),
          date: new Date().toISOString(),
          ...noteData
        });
      }

      saveDB(state.db);
      console.log('[Campus] Save successful');
      
      this.resetComposer();
      this.render();
      if (window.showToast) window.showToast('기록이 저장되었습니다.');
    } catch (e) {
      console.error('[Campus] Save failed:', e);
      alert('저장 중 오류가 발생했습니다.');
    }
  },

  render() {
    this.renderCategories();
    this.renderFeed();
    this.updateComposerCategories();
    
    const textEl = this.getEl('campus-subtitle-text');
    if (textEl && state.db.campusSubtitle) {
      textEl.innerText = state.db.campusSubtitle;
    }
  },

  renderCategories() {
    const container = this.getEl('campus-categories');
    if (!container) return;

    const categories = ['All', ...(state.db.campusCategories || [])];
    const notes = state.db.campusNotes || [];

    container.innerHTML = categories.map(cat => {
      if (cat === '{divider}') return `<div class="sidebar-divider"></div>`;

      const count = cat === 'All' 
        ? notes.length 
        : notes.filter(n => n.category === cat).length;

      return `
        <div class="category-item ${this.activeCategory === cat ? 'active' : ''}" data-category="${cat}">
          <span>${cat}</span>
          <span class="category-count">${count}</span>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.category-item').forEach(item => {
      item.onclick = () => {
        this.activeCategory = item.dataset.category;
        this.render();
      };
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
    if (this.activeCategory !== 'All') {
      notes = notes.filter(n => n.category === this.activeCategory);
    }

    if (this.searchQuery) {
      notes = notes.filter(n => 
        (n.content && n.content.toLowerCase().includes(this.searchQuery)) ||
        (n.tags && n.tags.some(t => t.toLowerCase().includes(this.searchQuery)))
      );
    }

    notes.sort((a, b) => new Date(b.date) - new Date(a.date));

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
                <img src="${url}" alt="Chart" onerror="this.parentElement.innerHTML='<a href=\'${url}\' target=\'_blank\' class=\'chart-link-fallback\'>🔗 View Chart</a>'" />
              </div>
            `).join('')}
          </div>
        ` : ''}

        <div class="campus-note-footer">
          <div class="campus-note-tags">
            ${(note.tags || []).map(tag => `<span class="campus-tag">#${tag}</span>`).join('')}
          </div>
          <div class="campus-note-actions">
            <button class="btn-note-action btn-edit-note">수정</button>
            <button class="btn-note-action danger btn-delete-note">삭제</button>
          </div>
        </div>
      </article>
    `).join('');

    container.querySelectorAll('.campus-note-card').forEach(card => {
      const id = card.dataset.id;
      card.querySelector('.btn-edit-note').onclick = (e) => { e.stopPropagation(); this.editNote(id); };
      card.querySelector('.btn-delete-note').onclick = (e) => { e.stopPropagation(); this.deleteNote(id); };
      card.onclick = () => card.querySelector('.campus-note-content').classList.toggle('expanded');
    });
  },

  editNote(id) {
    const note = state.db.campusNotes.find(n => n.id === id);
    if (!note) return;
    this.editingId = id;
    this.currentCharts = [...(note.charts || [])];
    
    const content = this.getEl('campus-note-content');
    if (content) content.innerHTML = note.content || '';
    const cat = this.getEl('campus-note-category');
    if (cat) cat.value = note.category;
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
    saveDB(state.db);
    this.render();
  },

  manageCategories() {
    const modal = this.getEl('list-manage-modal');
    const input = this.getEl('list-manage-input');
    const addBtn = this.getEl('list-manage-add');
    const list = this.getEl('list-manage-items');
    const closeBtn = this.getEl('list-manage-close');

    if (!modal || !addBtn) return;

    this.getEl('list-manage-title').innerText = 'Manage Categories';
    
    let divBtn = document.getElementById('btn-add-divider');
    if (!divBtn) {
      divBtn = document.createElement('button');
      divBtn.id = 'btn-add-divider';
      divBtn.className = 'tool-btn btn-sm secondary-btn';
      divBtn.innerText = '+ Add Divider';
      divBtn.style.marginTop = '10px';
      addBtn.parentElement.appendChild(divBtn);
    }

    const render = () => {
      const cats = state.db.campusCategories || [];
      list.innerHTML = `<div class="category-manage-list">${cats.map((c, i) => `
        <div class="category-manage-item ${c === '{divider}' ? 'divider-item' : ''}">
          <span class="item-label">${c === '{divider}' ? '─── Divider ───' : c}</span>
          <div class="item-actions">
            <span onclick="window.__campus_move(${i}, -1)">▲</span>
            <span onclick="window.__campus_move(${i}, 1)">▼</span>
            <span class="danger-text" onclick="window.__campus_del(${i})">✕</span>
          </div>
        </div>
      `).join('')}</div>`;
    };

    window.__campus_move = (idx, dir) => {
      const cats = state.db.campusCategories;
      const n = idx + dir;
      if (n >= 0 && n < cats.length) {
        [cats[idx], cats[n]] = [cats[n], cats[idx]];
        saveDB(state.db); render(); this.render();
      }
    };

    window.__campus_del = (idx) => {
      state.db.campusCategories.splice(idx, 1);
      saveDB(state.db); render(); this.render();
    };

    addBtn.onclick = () => {
      const v = input.value.trim();
      if (v) {
        state.db.campusCategories.push(v);
        saveDB(state.db); input.value = ''; render(); this.render();
      }
    };

    divBtn.onclick = () => {
      state.db.campusCategories.push('{divider}');
      saveDB(state.db); render(); this.render();
    };

    closeBtn.onclick = () => modal.classList.remove('active');
    render();
    modal.classList.add('active');
  }
};
