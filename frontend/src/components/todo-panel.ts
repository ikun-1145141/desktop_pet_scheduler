/* =============================================
   Todo Panel - 待办面板
   ============================================= */

import { LitElement, html, css, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { m3Shared, cardStyles, m3Scrollbar } from '../styles/shared';
import { getTodos, createTodo, toggleTodo, deleteTodo, getTodoStats } from '../api/client';
import type { TodoItem, TodoStats, CreateTodoParams, EventPriority } from '../types';

@customElement('todo-panel')
export class TodoPanel extends LitElement {
  static override styles = [
    m3Shared,
    cardStyles,
    m3Scrollbar,
    css`
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        padding: 16px;
        gap: 16px;
        overflow-y: auto;
      }

      /* Header */
      .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-shrink: 0;
      }
      .header h2 {
        font-size: 22px;
        line-height: 28px;
        font-weight: 500;
      }

      /* Stats bar */
      .stats-bar {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        flex-shrink: 0;
      }
      .stat-chip {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 4px 12px;
        border-radius: var(--md-sys-shape-corner-full);
        font-size: 12px;
        font-weight: 500;
      }
      .stat-chip.pending {
        background: var(--md-sys-color-primary-container);
        color: var(--md-sys-color-on-primary-container);
      }
      .stat-chip.done {
        background: var(--md-sys-color-secondary-container);
        color: var(--md-sys-color-on-secondary-container);
      }
      .stat-chip.overdue {
        background: var(--md-sys-color-error-container);
        color: var(--md-sys-color-on-error-container);
      }

      /* Filter tabs */
      .filter-tabs {
        display: flex;
        gap: 4px;
        flex-shrink: 0;
      }
      .filter-tab {
        padding: 6px 16px;
        border: none;
        border-radius: var(--md-sys-shape-corner-full);
        background: transparent;
        color: var(--md-sys-color-on-surface-variant);
        font-family: var(--md-sys-typescale-label-font);
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: all var(--md-sys-motion-duration-short) var(--md-sys-motion-easing-standard);
      }
      .filter-tab:hover {
        background: var(--md-sys-color-surface-container-highest);
      }
      .filter-tab.active {
        background: var(--md-sys-color-secondary-container);
        color: var(--md-sys-color-on-secondary-container);
      }

      /* FAB */
      .fab {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 12px 20px;
        border: none;
        border-radius: var(--md-sys-shape-corner-large);
        background: var(--md-sys-color-primary-container);
        color: var(--md-sys-color-on-primary-container);
        font-family: var(--md-sys-typescale-label-font);
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        box-shadow: var(--md-sys-elevation-2);
        transition: box-shadow var(--md-sys-motion-duration-medium) var(--md-sys-motion-easing-standard),
                    transform 200ms var(--md-sys-motion-easing-standard);
      }
      .fab:hover {
        box-shadow: var(--md-sys-elevation-3);
        transform: translateY(-1px);
      }
      .fab:active { transform: scale(0.97); }

      /* Todo list */
      .todo-list {
        display: flex;
        flex-direction: column;
        gap: 6px;
        flex: 1;
        min-height: 0;
      }

      .todo-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 16px;
        border-radius: var(--md-sys-shape-corner-medium);
        background: var(--md-sys-color-surface-container-low);
        transition: box-shadow var(--md-sys-motion-duration-medium) var(--md-sys-motion-easing-standard);
      }
      .todo-item:hover {
        box-shadow: var(--md-sys-elevation-1);
      }
      .todo-item.done {
        opacity: 0.6;
      }

      /* Checkbox */
      .checkbox {
        width: 22px;
        height: 22px;
        border: 2px solid var(--md-sys-color-on-surface-variant);
        border-radius: var(--md-sys-shape-corner-extra-small);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        flex-shrink: 0;
        transition: all var(--md-sys-motion-duration-short) var(--md-sys-motion-easing-standard);
      }
      .checkbox:hover {
        border-color: var(--md-sys-color-primary);
      }
      .checkbox.checked {
        background: var(--md-sys-color-primary);
        border-color: var(--md-sys-color-primary);
      }
      .checkbox.checked .material-symbols-outlined {
        color: var(--md-sys-color-on-primary);
        font-size: 16px;
      }

      .todo-content {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
      }
      .todo-title {
        font-size: 14px;
        font-weight: 500;
        color: var(--md-sys-color-on-surface);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .todo-item.done .todo-title {
        text-decoration: line-through;
        color: var(--md-sys-color-on-surface-variant);
      }
      .todo-meta {
        font-size: 11px;
        color: var(--md-sys-color-on-surface-variant);
        display: flex;
        gap: 8px;
        align-items: center;
      }
      .todo-meta .overdue {
        color: var(--md-sys-color-error);
        font-weight: 500;
      }

      .priority-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        flex-shrink: 0;
      }
      .priority-dot.low { background: var(--md-sys-color-outline); }
      .priority-dot.normal { background: var(--md-sys-color-primary); }
      .priority-dot.high { background: var(--md-sys-color-tertiary); }
      .priority-dot.urgent { background: var(--md-sys-color-error); }

      .todo-actions {
        display: flex;
        opacity: 0;
        transition: opacity var(--md-sys-motion-duration-short) var(--md-sys-motion-easing-standard);
      }
      .todo-item:hover .todo-actions {
        opacity: 1;
      }
      .delete-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border: none;
        border-radius: var(--md-sys-shape-corner-full);
        background: transparent;
        color: var(--md-sys-color-error);
        cursor: pointer;
      }
      .delete-btn:hover {
        background: var(--md-sys-color-error-container);
      }

      /* Empty */
      .empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        flex: 1;
        gap: 12px;
        color: var(--md-sys-color-on-surface-variant);
      }
      .empty .material-symbols-outlined {
        font-size: 48px;
        color: var(--md-sys-color-outline);
      }

      /* Quick add bar */
      .quick-add {
        display: flex;
        gap: 8px;
        align-items: center;
        flex-shrink: 0;
      }
      .quick-add input[type="text"] {
        flex: 1;
        font-family: var(--md-sys-typescale-body-font);
        font-size: 14px;
        padding: 10px 14px;
        border: 1px solid var(--md-sys-color-outline-variant);
        border-radius: var(--md-sys-shape-corner-full);
        background: var(--md-sys-color-surface-container-low);
        color: var(--md-sys-color-on-surface);
        outline: none;
        transition: border-color var(--md-sys-motion-duration-short) var(--md-sys-motion-easing-standard);
      }
      .quick-add input[type="text"]:focus {
        border-color: var(--md-sys-color-primary);
      }
      .quick-add input[type="datetime-local"] {
        font-family: var(--md-sys-typescale-body-font);
        font-size: 12px;
        padding: 6px 8px;
        border: 1px solid var(--md-sys-color-outline-variant);
        border-radius: var(--md-sys-shape-corner-small);
        background: var(--md-sys-color-surface-container-low);
        color: var(--md-sys-color-on-surface);
        outline: none;
        max-width: 180px;
      }
      .quick-add input[type="datetime-local"]:focus {
        border-color: var(--md-sys-color-primary);
      }
      .quick-add select {
        font-family: var(--md-sys-typescale-body-font);
        font-size: 13px;
        padding: 8px 10px;
        border: 1px solid var(--md-sys-color-outline-variant);
        border-radius: var(--md-sys-shape-corner-small);
        background: var(--md-sys-color-surface-container-low);
        color: var(--md-sys-color-on-surface);
        outline: none;
      }
      .add-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        border: none;
        border-radius: var(--md-sys-shape-corner-full);
        background: var(--md-sys-color-primary);
        color: var(--md-sys-color-on-primary);
        cursor: pointer;
        flex-shrink: 0;
        transition: box-shadow var(--md-sys-motion-duration-short) var(--md-sys-motion-easing-standard);
      }
      .add-btn:hover {
        box-shadow: var(--md-sys-elevation-1);
      }
    `,
  ];

  @state() private _todos: TodoItem[] = [];
  @state() private _stats: TodoStats | null = null;
  @state() private _filter: string = 'pending';
  @state() private _loading = false;
  @state() private _newTitle = '';
  @state() private _newPriority: EventPriority = 'normal';
  @state() private _newDueDate = '';

  override connectedCallback() {
    super.connectedCallback();
    this._fetchAll();
  }

  private async _fetchAll() {
    this._loading = true;
    try {
      const [todos, stats] = await Promise.all([
        getTodos(this._filter === 'all' ? undefined : this._filter),
        getTodoStats(),
      ]);
      this._todos = todos;
      this._stats = stats;
    } catch (e) {
      console.error('Failed to fetch todos:', e);
    } finally {
      this._loading = false;
    }
  }

  private _setFilter(f: string) {
    this._filter = f;
    this._fetchAll();
  }

  private async _handleToggle(id: string) {
    try {
      const updated = await toggleTodo(id);
      this._todos = this._todos.map(t => (t.id === id ? updated : t));
      this._stats = await getTodoStats();
    } catch (e) {
      console.error('Failed to toggle todo:', e);
    }
  }

  private async _handleDelete(id: string) {
    try {
      await deleteTodo(id);
      this._todos = this._todos.filter(t => t.id !== id);
      this._stats = await getTodoStats();
    } catch (e) {
      console.error('Failed to delete todo:', e);
    }
  }

  private async _handleQuickAdd() {
    if (!this._newTitle.trim()) return;
    const params: CreateTodoParams = {
      title: this._newTitle.trim(),
      priority: this._newPriority,
    };
    if (this._newDueDate) {
      params.due_date = new Date(this._newDueDate).toISOString();
    }
    try {
      const created = await createTodo(params);
      this._todos = [created, ...this._todos];
      this._newTitle = '';
      this._newDueDate = '';
      this._stats = await getTodoStats();
    } catch (e) {
      console.error('Failed to create todo:', e);
    }
  }

  private _handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      this._handleQuickAdd();
    }
  }

  private _isOverdue(todo: TodoItem): boolean {
    if (!todo.due_date || todo.status === 'done' || todo.status === 'cancelled') return false;
    return new Date(todo.due_date) < new Date();
  }

  private _formatDueDate(dateStr: string): string {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr.slice(0, 10);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    // If time is 00:00, show date only
    if (hh === '00' && mi === '00') return `${mm}-${dd}`;
    return `${mm}-${dd} ${hh}:${mi}`;
  }

  override render() {
    const s = this._stats;
    return html`
      <div class="header">
        <h2>待办事项</h2>
      </div>

      ${s ? html`
        <div class="stats-bar">
          <span class="stat-chip pending">待处理: ${s.pending + s.in_progress}</span>
          <span class="stat-chip done">已完成: ${s.done}</span>
          ${s.overdue > 0 ? html`<span class="stat-chip overdue">已逾期: ${s.overdue}</span>` : nothing}
        </div>
      ` : nothing}

      <div class="filter-tabs">
        ${(['pending', 'all', 'done', 'cancelled'] as const).map(f => {
          const labels: Record<string, string> = { pending: '待处理', all: '全部', done: '已完成', cancelled: '已取消' };
          return html`
          <button class="filter-tab ${this._filter === f ? 'active' : ''}"
            @click=${() => this._setFilter(f)}>${labels[f]}</button>
        `; })}
      </div>

      <div class="quick-add">
        <input type="text" placeholder="添加新待办..."
          .value=${this._newTitle}
          @input=${(e: Event) => (this._newTitle = (e.target as HTMLInputElement).value)}
          @keydown=${this._handleKeydown} />
        <input type="datetime-local"
          .value=${this._newDueDate}
          @input=${(e: Event) => (this._newDueDate = (e.target as HTMLInputElement).value)}
          title="截止时间" />
        <select .value=${this._newPriority}
          @change=${(e: Event) => (this._newPriority = (e.target as HTMLSelectElement).value as EventPriority)}>
          <option value="low">低</option>
          <option value="normal">普通</option>
          <option value="high">高</option>
          <option value="urgent">紧急</option>
        </select>
        <button class="add-btn" @click=${this._handleQuickAdd}>
          <span class="material-symbols-outlined" style="font-size:20px">add</span>
        </button>
      </div>

      <div class="todo-list">
        ${this._todos.length === 0 && !this._loading
          ? html`
            <div class="empty">
              <span class="material-symbols-outlined">checklist</span>
              <span class="body-medium">暂无待办事项</span>
            </div>`
          : this._todos.map(todo => html`
            <div class="todo-item ${todo.status === 'done' ? 'done' : ''}">
              <div class="checkbox ${todo.status === 'done' ? 'checked' : ''}"
                @click=${() => this._handleToggle(todo.id)}>
                ${todo.status === 'done'
                  ? html`<span class="material-symbols-outlined">check</span>`
                  : nothing}
              </div>
              <span class="priority-dot ${todo.priority}"></span>
              <div class="todo-content">
                <div class="todo-title">${todo.title}</div>
                <div class="todo-meta">
                  ${todo.due_date
                    ? html`<span class="${this._isOverdue(todo) ? 'overdue' : ''}">${this._formatDueDate(todo.due_date)}</span>`
                    : nothing}
                  ${todo.tags?.length
                    ? html`<span>${todo.tags.join(', ')}</span>`
                    : nothing}
                </div>
              </div>
              <div class="todo-actions">
                <button class="delete-btn" @click=${() => this._handleDelete(todo.id)}>
                  <span class="material-symbols-outlined" style="font-size:16px">close</span>
                </button>
              </div>
            </div>
          `)
        }
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'todo-panel': TodoPanel;
  }
}
