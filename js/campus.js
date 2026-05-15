import { state, els } from './app.js';
import { saveDB } from './storage.js';

export const campusManager = {
  activeCategory: 'All',
  searchQuery: '',

  init() {
    if (els['btn-add-campus-note']) {
      els['btn-add-campus-note'].onclick = () => this.openNoteModal();
    }

    if (els['campus-search']) {
      els['campus-search'].oninput = (e) => {
        this.searchQuery = e.target.value.toLowerCase();
        this.render();
      };
    }

    if (els['btn-manage-campus-categories']) {
      els['btn-manage-campus-categories'].onclick = () => this.manageCategories();
    }
  },

  render() {
    this.renderCategories();
    this.renderFeed();
  },

  renderCategories() {
    const container = document.getElementById('campus-categories');
    if (!container) return;

    const categories = ['All', ...(state.db.campusCategories || [])];
    const notes = state.db.campusNotes || [];

    container.innerHTML = categories.map(cat => {
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

    // Filter by category
    if (this.activeCategory !== 'All') {
      notes = notes.filter(n => n.category === this.activeCategory);
    }

    // Search query
    if (this.searchQuery) {
      notes = notes.filter(n => 
        n.title.toLowerCase().includes(this.searchQuery) || 
        n.content.toLowerCase().includes(this.searchQuery) ||
        n.tags.some(t => t.toLowerCase().includes(this.searchQuery))
      );
    }

    // Sort by newest
    notes.sort((a, b) => new Date(b.date) - new Date(a.date));

    if (notes.length === 0) {
      container.innerHTML = '<div class="empty-placeholder">조건에 맞는 생각이 없습니다.</div>';
      return;
    }

    container.innerHTML = notes.map(note => `
      <article class="campus-note-card" data-id="${note.id}">
        <div class="campus-note-header">
          <span class="campus-note-category">${note.category}</span>
          <span class="campus-note-date">${new Date(note.date).toLocaleDateString()}</span>
        </div>
        <h3 class="campus-note-title">${this.escapeHtml(note.title)}</h3>
        <div class="campus-note-content">${this.escapeHtml(note.content)}</div>
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

    // Bind actions
    container.querySelectorAll('.campus-note-card').forEach(card => {
      const id = card.dataset.id;
      card.querySelector('.btn-edit-note').onclick = (e) => {
        e.stopPropagation();
        this.openNoteModal(id);
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

  openNoteModal(noteId = null) {
    const note = noteId 
      ? state.db.campusNotes.find(n => n.id === noteId) 
      : { title: '', content: '', category: 'General', tags: [] };

    const modal = document.getElementById('app-modal');
    const titleEl = document.getElementById('modal-title');
    const descEl = document.getElementById('modal-desc');
    const confirmBtn = document.getElementById('modal-btn-confirm');
    const cancelBtn = document.getElementById('modal-btn-cancel');
    const inputEl = document.getElementById('modal-input');

    titleEl.innerText = noteId ? 'Edit Thought' : 'New Thought';
    inputEl.style.display = 'none'; // Hide default input

    descEl.innerHTML = `
      <div class="campus-modal-body">
        <input type="text" id="note-title" class="campus-input-title" placeholder="Title..." value="${this.escapeHtml(note.title)}" />
        <select id="note-category" style="width: 100%; padding: 10px; border-radius: 8px;">
          ${(state.db.campusCategories || []).map(cat => `
            <option value="${cat}" ${note.category === cat ? 'selected' : ''}>${cat}</option>
          `).join('')}
        </select>
        <textarea id="note-content" class="campus-input-content" placeholder="What's on your mind?">${this.escapeHtml(note.content)}</textarea>
        <input type="text" id="note-tags" placeholder="Tags (comma separated)..." value="${(note.tags || []).join(', ')}" />
      </div>
    `;

    modal.classList.add('active');

    confirmBtn.onclick = () => {
      const newTitle = document.getElementById('note-title').value.trim();
      const newContent = document.getElementById('note-content').value.trim();
      const newCategory = document.getElementById('note-category').value;
      const newTags = document.getElementById('note-tags').value.split(',').map(t => t.trim()).filter(t => t);

      if (!newTitle || !newContent) {
        alert('Please enter both title and content.');
        return;
      }

      if (noteId) {
        const idx = state.db.campusNotes.findIndex(n => n.id === noteId);
        state.db.campusNotes[idx] = { ...state.db.campusNotes[idx], title: newTitle, content: newContent, category: newCategory, tags: newTags };
      } else {
        state.db.campusNotes.push({
          id: 'cn-' + Date.now(),
          date: new Date().toISOString(),
          title: newTitle,
          content: newContent,
          category: newCategory,
          tags: newTags
        });
      }

      saveDB(state.db);
      this.render();
      modal.classList.remove('active');
    };

    cancelBtn.onclick = () => modal.classList.remove('active');
  },

  deleteNote(id) {
    if (!confirm('정말로 이 기록을 삭제하시겠습니까?')) return;
    state.db.campusNotes = state.db.campusNotes.filter(n => n.id !== id);
    saveDB(state.db);
    this.render();
  },

  manageCategories() {
    const listModal = document.getElementById('list-manage-modal');
    const titleEl = document.getElementById('list-manage-title');
    const inputEl = document.getElementById('list-manage-input');
    const addBtn = document.getElementById('list-manage-add');
    const itemsEl = document.getElementById('list-manage-items');
    const closeBtn = document.getElementById('list-manage-close');

    titleEl.innerText = 'Campus Categories';
    
    const renderList = () => {
      itemsEl.innerHTML = (state.db.campusCategories || []).map((cat, idx) => `
        <div class="list-manage-row" style="background:var(--bg-panel); border:1px solid var(--border-main); padding:10px 12px; border-radius:12px; margin-bottom:8px; display:flex; align-items:center;">
          <span style="font-size:12px; font-weight:800; flex:1; color:var(--text-main);">${cat}</span>
          <div class="row-actions">
            <button type="button" class="btn-icon-sm danger-text" onclick="window.__campus_del_cat(${idx})">✕</button>
          </div>
        </div>
      `).join('');
    };

    window.__campus_del_cat = (idx) => {
      state.db.campusCategories.splice(idx, 1);
      saveDB(state.db);
      renderList();
      this.render();
    };

    addBtn.onclick = () => {
      const val = inputEl.value.trim();
      if (!val) return;
      if (!state.db.campusCategories.includes(val)) {
        state.db.campusCategories.push(val);
        saveDB(state.db);
        inputEl.value = '';
        renderList();
        this.render();
      }
    };

    closeBtn.onclick = () => listModal.classList.remove('active');
    
    renderList();
    listModal.classList.add('active');
  },

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
};
