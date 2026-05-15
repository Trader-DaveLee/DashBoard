import { state } from './app.js';
import { saveDB } from './storage.js';

export const campusManager = {
  activeCategory: 'All',
  searchQuery: '',
  editingId: null,
  currentCharts: [],

  init() {
    console.log('[Campus] Initializing...');

    const getEl = (id) => document.getElementById(id);

    // Composer Toggle
    const header = getEl('campus-composer-header');
    const expanded = getEl('composer-expanded');
    const content = getEl('campus-note-content');
    
    if (header && expanded && content) {
      header.onclick = () => {
        expanded.classList.remove('hidden');
        header.classList.add('hidden');
        content.focus();
      };
    }

    const btnCancel = getEl('btn-cancel-note');
    if (btnCancel) btnCancel.onclick = () => this.resetComposer();

    const btnSave = getEl('btn-save-note');
    if (btnSave) btnSave.onclick = () => this.saveNote();

    const btnAddChart = getEl('btn-add-campus-chart');
    if (btnAddChart) btnAddChart.onclick = () => this.addChart();

    // Rich Text Toolbar
    const toolbar = getEl('campus-editor-toolbar');
    if (toolbar) {
      toolbar.querySelectorAll('button[data-command]').forEach(btn => {
        btn.onclick = (e) => {
          e.preventDefault();
          const cmd = btn.dataset.command;
          const val = btn.dataset.value || null;
          document.execCommand(cmd, false, val);
          const editor = getEl('campus-note-content');
          if (editor) editor.focus();
        };
      });
    }

    // Search
    const search = getEl('campus-search');
    if (search) {
      search.oninput = (e) => {
        this.searchQuery = e.target.value.toLowerCase();
        this.render();
      };
    }

    // Manage Categories (Modal)
    const btnManage = getEl('btn-manage-campus-categories');
    if (btnManage) {
      btnManage.onclick = () => this.manageCategories();
    }

    // Subtitle Edit (Moving logic here to ensure it works)
    const btnEditSubtitle = getEl('btn-edit-campus-subtitle');
    if (btnEditSubtitle) {
      btnEditSubtitle.onclick = () => {
        const textEl = getEl('campus-subtitle-text');
        const current = textEl ? textEl.innerText : '';
        const newVal = prompt('Campus 부제목을 수정하세요:', current);
        if (newVal !== null) {
          state.db.campusSubtitle = newVal.trim();
          if (textEl) textEl.innerText = state.db.campusSubtitle;
          saveDB(state.db);
        }
      };
    }

    this.updateComposerCategories();
    this.render();
  },

  resetComposer() {
    const getEl = (id) => document.getElementById(id);
    this.editingId = null;
    this.currentCharts = [];
    
    const content = getEl('campus-note-content');
    const tags = getEl('campus-note-tags');
    const expanded = getEl('composer-expanded');
    const header = getEl('campus-composer-header');
    const btnSave = getEl('btn-save-note');

    if (content) content.innerHTML = '';
    if (tags) tags.value = '';
    this.renderCharts();
    
    if (expanded) expanded.classList.add('hidden');
    if (header) header.classList.remove('hidden');
    if (btnSave) btnSave.innerText = 'Post';
  },

  updateComposerCategories() {
    const select = document.getElementById('campus-note-category');
    if (!select) return;
    
    const categories = (state.db.campusCategories || ['General']).filter(c => c !== '{divider}');
    select.innerHTML = categories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
  },

  addChart() {
    this.currentCharts.push('');
    this.renderCharts();
  },

  removeChart(index) {
    this.currentCharts.splice(index, 1);
    this.renderCharts();
  },

  renderCharts() {
    const container = document.getElementById('campus-chart-list');
    if (!container) return;

    container.innerHTML = this.currentCharts.map((url, idx) => `
      <div class="campus-chart-item">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
        <input type="text" placeholder="TradingView Image URL (https://...)" value="${url}" oninput="window.__campus_update_chart(${idx}, this.value)" />
        <span class="btn-remove-chart" onclick="window.__campus_remove_chart(${idx})">✕</span>
      </div>
    `).join('');

    window.__campus_update_chart = (idx, val) => {
      this.currentCharts[idx] = val.trim();
    };
    window.__campus_remove_chart = (idx) => {
      this.removeChart(idx);
    };
  },

  saveNote() {
    const getEl = (id) => document.getElementById(id);
    const content = getEl('campus-note-content').innerHTML.trim();
    const category = getEl('campus-note-category').value;
    const tags = getEl('campus-note-tags').value.split(',').map(t => t.trim()).filter(t => t);
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
    this.resetComposer();
    this.render();
    if (window.showToast) window.showToast('기록되었습니다.');
  },

  render() {
    this.renderCategories();
    this.renderFeed();
    this.updateComposerCategories();
    
    // Update Subtitle Display
    const textEl = document.getElementById('campus-subtitle-text');
    if (textEl && state.db.campusSubtitle) {
      textEl.innerText = state.db.campusSubtitle;
    }
  },

  renderCategories() {
    const container = document.getElementById('campus-categories');
    if (!container) return;

    const categories = ['All', ...(state.db.campusCategories || [])];
    const notes = state.db.campusNotes || [];

    container.innerHTML = categories.map(cat => {
      if (cat === '{divider}') {
        return `<div class="sidebar-divider"></div>`;
      }

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

  renderFeed() {
    const container = document.getElementById('campus-feed-container');
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
      card.querySelector('.btn-edit-note').onclick = (e) => {
        e.stopPropagation();
        this.editNote(id);
      };
      card.querySelector('.btn-delete-note').onclick = (e) => {
        e.stopPropagation();
        this.deleteNote(id);
      };
      card.onclick = () => {
        card.querySelector('.campus-note-content').classList.toggle('expanded');
      };
    });
  },

  editNote(id) {
    const getEl = (id) => document.getElementById(id);
    const note = state.db.campusNotes.find(n => n.id === id);
    if (!note) return;

    this.editingId = id;
    this.currentCharts = [...(note.charts || [])];
    
    const content = getEl('campus-note-content');
    const category = getEl('campus-note-category');
    const tags = getEl('campus-note-tags');
    const expanded = getEl('composer-expanded');
    const header = getEl('campus-composer-header');
    const btnSave = getEl('btn-save-note');

    if (content) content.innerHTML = note.content || '';
    if (category) category.value = note.category;
    if (tags) tags.value = (note.tags || []).join(', ');

    this.renderCharts();
    if (expanded) expanded.classList.remove('hidden');
    if (header) header.classList.add('hidden');
    if (btnSave) btnSave.innerText = 'Update';
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (content) content.focus();
  },

  manageCategories() {
    const listModal = document.getElementById('list-manage-modal');
    const titleEl = document.getElementById('list-manage-title');
    const inputEl = document.getElementById('list-manage-input');
    const addBtn = document.getElementById('list-manage-add');
    const itemsEl = document.getElementById('list-manage-items');
    const closeBtn = document.getElementById('list-manage-close');

    if (!listModal || !addBtn) return;

    titleEl.innerText = 'Manage Categories';
    inputEl.placeholder = 'Category name...';
    
    // Add Divider button inside the modal control area
    let dividerBtn = document.getElementById('btn-add-divider');
    if (!dividerBtn) {
      dividerBtn = document.createElement('button');
      dividerBtn.id = 'btn-add-divider';
      dividerBtn.type = 'button';
      dividerBtn.className = 'tool-btn btn-sm secondary-btn';
      dividerBtn.innerText = '+ Add Divider';
      dividerBtn.style.marginTop = '10px';
      addBtn.parentElement.appendChild(dividerBtn);
    }

    const renderList = () => {
      const cats = state.db.campusCategories || [];
      itemsEl.innerHTML = `
        <div class="category-manage-list">
          ${cats.map((cat, idx) => {
            const isDivider = cat === '{divider}';
            return `
              <div class="category-manage-item ${isDivider ? 'divider-item' : ''}">
                <span class="item-label">${isDivider ? '─── Divider ───' : cat}</span>
                <div class="item-actions">
                  <span class="btn-move-up" onclick="window.__campus_move_cat(${idx}, -1)">▲</span>
                  <span class="btn-move-down" onclick="window.__campus_move_cat(${idx}, 1)">▼</span>
                  <button type="button" class="btn-icon-sm danger-text" onclick="window.__campus_del_cat_modal(${idx})">✕</button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    };

    window.__campus_move_cat = (idx, dir) => {
      const cats = state.db.campusCategories;
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= cats.length) return;
      const temp = cats[idx];
      cats[idx] = cats[newIdx];
      cats[newIdx] = temp;
      saveDB(state.db);
      renderList();
      this.render();
    };

    window.__campus_del_cat_modal = (idx) => {
      state.db.campusCategories.splice(idx, 1);
      saveDB(state.db);
      renderList();
      this.render();
    };

    addBtn.onclick = () => {
      const val = inputEl.value.trim();
      if (!val) return;
      if (!state.db.campusCategories) state.db.campusCategories = [];
      state.db.campusCategories.push(val);
      saveDB(state.db);
      inputEl.value = '';
      renderList();
      this.render();
    };

    dividerBtn.onclick = () => {
      if (!state.db.campusCategories) state.db.campusCategories = [];
      state.db.campusCategories.push('{divider}');
      saveDB(state.db);
      renderList();
      this.render();
    };

    closeBtn.onclick = () => listModal.classList.remove('active');
    
    renderList();
    listModal.classList.add('active');
  }
};
