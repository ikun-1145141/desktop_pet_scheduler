/* =============================================
   Pet Overlay - 桌宠桌面悬浮窗口
   透明背景 + Live2D + 气泡对话 + 右键菜单
   ============================================= */

import { LitElement, html, css, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { m3Shared } from '../styles/shared';
import { getTodos, getSchedules } from '../api/client';
import type { TodoItem, ScheduleEvent } from '../types';

// Lazy-load live2d-viewer to avoid pixi.js blocking the main component
import('./live2d-viewer').catch(() => {
  console.warn('Live2D viewer failed to load - running without it');
});

@customElement('pet-overlay')
export class PetOverlay extends LitElement {
  static override styles = [
    m3Shared,
    css`
      :host {
        display: block;
        width: 100vw;
        height: 100vh;
        background: transparent !important;
        user-select: none;
        cursor: default;
      }

      .container {
        width: 100%;
        height: 100%;
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
      }

      /* Chat bubble floating above the pet */
      .bubble-area {
        position: absolute;
        top: 8px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 10;
        max-width: 90%;
        pointer-events: none;
      }
      .bubble {
        background: var(--md-sys-color-surface-container-high, #e6e9df);
        color: var(--md-sys-color-on-surface, #191d17);
        padding: 10px 16px;
        border-radius: 16px 16px 16px 4px;
        font-size: 13px;
        line-height: 18px;
        font-family: 'Noto Sans SC', system-ui, sans-serif;
        box-shadow: 0 1px 2px 0 rgba(0,0,0,0.3), 0 2px 6px 2px rgba(0,0,0,0.15);
        max-width: 280px;
        word-break: break-word;
        white-space: pre-wrap;
        animation: bubbleIn 300ms ease-out;
        pointer-events: auto;
      }
      @keyframes bubbleIn {
        from { opacity: 0; transform: translateY(8px) scale(0.95); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      .bubble-fade {
        animation: bubbleOut 300ms var(--md-sys-motion-easing-emphasized-accelerate) forwards;
      }
      @keyframes bubbleOut {
        to { opacity: 0; transform: translateY(-4px) scale(0.97); }
      }

      /* Live2D area - takes most of the window */
      .live2d-area {
        flex: 1;
        width: 100%;
      }

      /* Drag handle - invisible, covers the model area */
      .drag-handle {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        -webkit-app-region: no-drag;
        cursor: grab;
        z-index: 5;
      }
      .drag-handle:active {
        cursor: grabbing;
      }
    `,
  ];

  @state() private _bubbleText = '';
  @state() private _bubbleFading = false;

  private _bubbleTimer: ReturnType<typeof setTimeout> | null = null;
  private _dragging = false;
  /** Queued bubble messages waiting to display */
  private _bubbleQueue: Array<{ text: string; duration: number }> = [];
  private _hourlyTimer: ReturnType<typeof setTimeout> | null = null;
  private _reminderTimer: ReturnType<typeof setInterval> | null = null;
  /** Set of already-reminded item IDs to avoid duplicate alerts */
  private _remindedIds = new Set<string>();

  override connectedCallback() {
    super.connectedCallback();
    // Show a greeting bubble briefly on start (auto-hide after 5s)
    this._showBubble('Hi~ 我是你的桌宠！右键点我打开菜单~', 5000);

    // Start hourly chime
    this._scheduleHourlyChime();

    // Start todo/schedule reminder polling (every 30s)
    this._reminderTimer = setInterval(() => this._checkReminders(), 30_000);
    // Initial check after 6s (let greeting bubble finish first)
    setTimeout(() => this._checkReminders(), 6000);

    // Listen for native menu actions from Electron
    window.electronAPI?.onMenuAction((action, data) => {
      if (action === 'expression' && data) {
        this._setExpression(data);
      } else if (action === 'clear-expression') {
        this._clearExpression();
      } else if (action === 'schedule' || action === 'todo' || action === 'chat' || action === 'settings') {
        window.electronAPI?.openPanel(action);
      }
    });
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    if (this._bubbleTimer) clearTimeout(this._bubbleTimer);
    if (this._hourlyTimer) clearTimeout(this._hourlyTimer);
    if (this._reminderTimer) clearInterval(this._reminderTimer);
  }

  /** Show a temporary chat bubble above the pet. durationMs=0 means persistent. */
  private _showBubble(text: string, durationMs = 5000) {
    // If a bubble is currently showing, queue the new one
    if (this._bubbleText && text !== this._bubbleText) {
      this._bubbleQueue.push({ text, duration: durationMs });
      return;
    }
    this._bubbleFading = false;
    this._bubbleText = text;
    if (this._bubbleTimer) clearTimeout(this._bubbleTimer);
    if (durationMs <= 0) return; // persistent bubble
    this._bubbleTimer = setTimeout(() => {
      this._bubbleFading = true;
      setTimeout(() => {
        this._bubbleText = '';
        this._bubbleFading = false;
        // Show next queued bubble
        this._processQueue();
      }, 300);
    }, durationMs);
  }

  private _processQueue() {
    if (this._bubbleQueue.length === 0) return;
    const next = this._bubbleQueue.shift()!;
    // Small delay so the fade-out finishes visually
    setTimeout(() => this._showBubble(next.text, next.duration), 200);
  }

  /* ---- Hourly chime (整点报时) ---- */

  private _scheduleHourlyChime() {
    const now = new Date();
    // Milliseconds until the next full hour
    const msToNext = (60 - now.getMinutes()) * 60_000
                   - now.getSeconds() * 1000
                   - now.getMilliseconds();
    this._hourlyTimer = setTimeout(() => {
      this._onHourlyChime();
      // Then repeat every hour
      this._hourlyTimer = setInterval(() => this._onHourlyChime(), 3_600_000) as any;
    }, msToNext);
  }

  private _onHourlyChime() {
    const h = new Date().getHours();
    const period = h < 6 ? '深夜' : h < 9 ? '早上' : h < 12 ? '上午'
                 : h === 12 ? '中午' : h < 14 ? '下午' : h < 18 ? '下午' : h < 22 ? '晚上' : '深夜';
    const greetings: Record<string, string> = {
      '深夜': '夜深了，注意休息哦~',
      '早上': '早安！新的一天开始啦~',
      '上午': '上午好，加油工作！',
      '中午': '中午啦，记得吃饭哦~',
      '下午': '下午好，继续加油！',
      '晚上': '晚上好，辛苦啦~',
    };
    const greeting = greetings[period] || '';
    this._showBubble(`🕐 ${period}${h}点了！${greeting}`, 6000);
  }

  /* ---- Todo & Schedule reminders (待办/日程提醒) ---- */

  private async _checkReminders() {
    const now = Date.now();
    try {
      await Promise.all([
        this._checkTodoReminders(now),
        this._checkScheduleReminders(now),
      ]);
    } catch {
      // Silently ignore network errors — will retry next cycle
    }
  }

  private async _checkTodoReminders(now: number) {
    const todos: TodoItem[] = await getTodos();
    for (const t of todos) {
      if (t.is_deleted || t.status === 'done' || t.status === 'cancelled') continue;
      if (!t.due_date) continue;
      const due = new Date(t.due_date).getTime();
      if (isNaN(due)) continue;
      const diff = due - now;
      const key = `todo-${t.id}`;
      // Already reminded
      if (this._remindedIds.has(key)) continue;
      // Remind if overdue or within 15 minutes
      if (diff <= 15 * 60_000) {
        this._remindedIds.add(key);
        if (diff <= 0) {
          this._showBubble(`⚠️ 待办已过期：${t.title}`, 8000);
        } else {
          const mins = Math.ceil(diff / 60_000);
          this._showBubble(`📋 待办提醒：「${t.title}」将在${mins}分钟后到期`, 8000);
        }
      }
    }
  }

  private async _checkScheduleReminders(now: number) {
    const today = new Date().toISOString().slice(0, 10);
    const events: ScheduleEvent[] = await getSchedules(today);
    for (const ev of events) {
      if (ev.is_deleted) continue;
      const start = new Date(ev.start_time).getTime();
      if (isNaN(start)) continue;
      const remindMs = (ev.remind_before_minutes ?? 15) * 60_000;
      const diff = start - now;
      const key = `sched-${ev.id}`;
      if (this._remindedIds.has(key)) continue;
      // Remind when within remind_before_minutes window
      if (diff <= remindMs && diff > -5 * 60_000) {
        this._remindedIds.add(key);
        if (diff <= 0) {
          this._showBubble(`📅 日程开始了：${ev.title}`, 8000);
        } else {
          const mins = Math.ceil(diff / 60_000);
          this._showBubble(`📅 日程提醒：「${ev.title}」将在${mins}分钟后开始`, 8000);
        }
      }
    }
  }

  /* ---- Window dragging via IPC ---- */

  private _onDragStart = (e: PointerEvent) => {
    // Only left button
    if (e.button !== 0) return;
    this._dragging = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    window.electronAPI?.petDragStart();
  };

  private _onDragEnd = (e: PointerEvent) => {
    if (!this._dragging) return;
    this._dragging = false;
    window.electronAPI?.petDragEnd();
  };

  /* ---- Scroll to zoom (left button + wheel) ---- */

  private _onWheel = (e: WheelEvent) => {
    // Only zoom when left mouse button is held down
    if (!(e.buttons & 1)) return;
    e.preventDefault();
    // deltaY < 0 = scroll up = zoom in
    const delta = e.deltaY < 0 ? 0.05 : -0.05;
    window.electronAPI?.zoomPetWindow(delta);
  };

  /* ---- Context menu (native via Electron IPC) ---- */

  private _onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    // Get expression names from viewer, then show native menu
    const viewer = this.shadowRoot?.querySelector('live2d-viewer') as any;
    const expressions: string[] = viewer?.getExpressionNames?.() || [];
    window.electronAPI?.showPetContextMenu(expressions);
  };

  private async _setExpression(name: string) {
    const viewer = this.shadowRoot?.querySelector('live2d-viewer') as any;
    if (viewer) {
      const ok = await viewer.setExpressionByName?.(name);
      if (ok) {
        this._showBubble(`表情: ${name}`, 2000);
      }
    }
  }

  private _clearExpression() {
    const viewer = this.shadowRoot?.querySelector('live2d-viewer') as any;
    if (viewer) {
      viewer.clearOverlayExpression?.();
      this._showBubble('已恢复默认', 2000);
    }
  }

  override render() {
    return html`
      <div class="container" @contextmenu=${this._onContextMenu}>

        <!-- Chat bubble -->
        ${this._bubbleText
          ? html`
            <div class="bubble-area">
              <div class="bubble ${this._bubbleFading ? 'bubble-fade' : ''}">
                ${this._bubbleText}
              </div>
            </div>`
          : nothing}

        <!-- Drag handle (transparent, sits on top of Live2D) -->
        <div class="drag-handle"
          @pointerdown=${this._onDragStart}
          @pointerup=${this._onDragEnd}
          @pointercancel=${this._onDragEnd}
          @wheel=${this._onWheel}>
        </div>

        <!-- Live2D model -->
        <div class="live2d-area">
          <live2d-viewer></live2d-viewer>
        </div>

      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pet-overlay': PetOverlay;
  }
}
