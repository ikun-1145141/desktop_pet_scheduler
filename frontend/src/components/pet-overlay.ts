/* =============================================
   Pet Overlay - 桌宠桌面悬浮窗口
   透明背景 + Live2D + 气泡对话 + 右键菜单
   ============================================= */

import { LitElement, html, css, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { m3Shared } from '../styles/shared';

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

  override connectedCallback() {
    super.connectedCallback();
    // Show a greeting bubble briefly on start (auto-hide after 5s)
    this._showBubble('Hi~ 我是你的桌宠！右键点我打开菜单~', 5000);

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
  }

  /** Show a temporary chat bubble above the pet. durationMs=0 means persistent. */
  private _showBubble(text: string, durationMs = 5000) {
    this._bubbleFading = false;
    this._bubbleText = text;
    if (this._bubbleTimer) clearTimeout(this._bubbleTimer);
    if (durationMs <= 0) return; // persistent bubble
    this._bubbleTimer = setTimeout(() => {
      this._bubbleFading = true;
      setTimeout(() => {
        this._bubbleText = '';
        this._bubbleFading = false;
      }, 300);
    }, durationMs);
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
