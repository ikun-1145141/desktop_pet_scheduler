/* =============================================
   Settings Page - 设置页
   ============================================= */

import { LitElement, html, css, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { m3Shared, cardStyles, m3Scrollbar } from '../styles/shared';
import { getLive2DModels, switchLive2DModel, scanLive2DModels, getActiveLive2DModel } from '../api/client';
import type { Live2DModelInfo } from '../types';

@customElement('settings-page')
export class SettingsPage extends LitElement {
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
        gap: 20px;
        overflow-y: auto;
        user-select: none;
      }
      .header h2 {
        font-size: 22px;
        line-height: 28px;
        font-weight: 500;
      }

      /* Section */
      .section {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .section-title {
        font-size: 14px;
        font-weight: 500;
        color: var(--md-sys-color-primary);
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      /* Model grid */
      .model-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
        gap: 12px;
      }
      .model-card {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        padding: 16px 12px;
        border-radius: var(--md-sys-shape-corner-medium);
        background: var(--md-sys-color-surface-container-low);
        cursor: pointer;
        border: 2px solid transparent;
        transition: all var(--md-sys-motion-duration-medium) var(--md-sys-motion-easing-standard);
      }
      .model-card:hover {
        box-shadow: var(--md-sys-elevation-1);
        border-color: var(--md-sys-color-outline-variant);
      }
      .model-card.active {
        border-color: var(--md-sys-color-primary);
        background: var(--md-sys-color-primary-container);
      }
      .model-preview {
        width: 80px;
        height: 80px;
        border-radius: var(--md-sys-shape-corner-small);
        background: var(--md-sys-color-surface-container-highest);
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
      }
      .model-preview img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .model-preview .material-symbols-outlined {
        font-size: 36px;
        color: var(--md-sys-color-outline);
      }
      .model-name {
        font-size: 13px;
        font-weight: 500;
        color: var(--md-sys-color-on-surface);
        text-align: center;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        max-width: 100%;
      }
      .model-card.active .model-name {
        color: var(--md-sys-color-on-primary-container);
      }

      /* Action bar */
      .action-bar {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }
      .btn-outlined {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 16px;
        border: 1px solid var(--md-sys-color-outline);
        border-radius: var(--md-sys-shape-corner-full);
        background: transparent;
        color: var(--md-sys-color-primary);
        font-family: var(--md-sys-typescale-label-font);
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: background var(--md-sys-motion-duration-short) var(--md-sys-motion-easing-standard);
      }
      .btn-outlined:hover {
        background: var(--md-sys-color-primary-container);
      }

      /* Toggle row */
      .toggle-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        border-radius: var(--md-sys-shape-corner-medium);
        background: var(--md-sys-color-surface-container-low);
      }
      .toggle-label {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .toggle-label .primary {
        font-size: 14px;
        font-weight: 500;
        color: var(--md-sys-color-on-surface);
      }
      .toggle-label .secondary {
        font-size: 12px;
        color: var(--md-sys-color-on-surface-variant);
      }

      /* Switch */
      .switch {
        position: relative;
        width: 52px;
        height: 32px;
        flex-shrink: 0;
      }
      .switch input {
        opacity: 0;
        width: 0;
        height: 0;
      }
      .switch-track {
        position: absolute;
        inset: 0;
        border-radius: 16px;
        background: var(--md-sys-color-surface-container-highest);
        border: 2px solid var(--md-sys-color-outline);
        transition: all var(--md-sys-motion-duration-short) var(--md-sys-motion-easing-standard);
        cursor: pointer;
      }
      .switch-track::after {
        content: '';
        position: absolute;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: var(--md-sys-color-outline);
        top: 50%;
        left: 6px;
        transform: translateY(-50%);
        transition: all var(--md-sys-motion-duration-short) var(--md-sys-motion-easing-standard);
      }
      .switch input:checked + .switch-track {
        background: var(--md-sys-color-primary);
        border-color: var(--md-sys-color-primary);
      }
      .switch input:checked + .switch-track::after {
        background: var(--md-sys-color-on-primary);
        left: 26px;
        width: 20px;
        height: 20px;
      }

      /* About */
      .about {
        padding: 16px;
        border-radius: var(--md-sys-shape-corner-medium);
        background: var(--md-sys-color-surface-container-low);
        font-size: 13px;
        color: var(--md-sys-color-on-surface-variant);
        line-height: 20px;
      }
      .about strong {
        color: var(--md-sys-color-on-surface);
      }

      /* Empty */
      .empty-models {
        padding: 24px;
        text-align: center;
        color: var(--md-sys-color-on-surface-variant);
        font-size: 13px;
      }

      /* Expression select */
      .expression-select {
        padding: 8px 12px;
        border-radius: var(--md-sys-shape-corner-small, 8px);
        border: 1px solid var(--md-sys-color-outline);
        background: var(--md-sys-color-surface-container);
        color: var(--md-sys-color-on-surface);
        font-size: 13px;
        font-family: var(--md-sys-typescale-body-font);
        cursor: pointer;
        min-width: 120px;
      }
      .expression-select:focus {
        outline: 2px solid var(--md-sys-color-primary);
        outline-offset: -1px;
      }

      /* Slider row */
      .slider-row {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 12px 16px;
        border-radius: var(--md-sys-shape-corner-medium);
        background: var(--md-sys-color-surface-container-low);
      }
      .slider-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .slider-value {
        font-size: 12px;
        font-weight: 500;
        color: var(--md-sys-color-primary);
        min-width: 40px;
        text-align: right;
      }
      input[type="range"] {
        -webkit-appearance: none;
        appearance: none;
        width: 100%;
        height: 6px;
        border-radius: 3px;
        background: var(--md-sys-color-surface-container-highest);
        outline: none;
      }
      input[type="range"]::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: var(--md-sys-color-primary);
        cursor: pointer;
        box-shadow: var(--md-sys-elevation-1);
        transition: box-shadow var(--md-sys-motion-duration-short) var(--md-sys-motion-easing-standard);
      }
      input[type="range"]::-webkit-slider-thumb:hover {
        box-shadow: var(--md-sys-elevation-2);
      }
      .btn-text-small {
        display: inline-flex;
        align-items: center;
        padding: 4px 8px;
        border: none;
        border-radius: var(--md-sys-shape-corner-small);
        background: transparent;
        color: var(--md-sys-color-primary);
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        font-family: var(--md-sys-typescale-label-font);
      }
      .btn-text-small:hover {
        background: var(--md-sys-color-primary-container);
      }
    `,
  ];

  @state() private _models: Live2DModelInfo[] = [];
  @state() private _activeModelId = '';
  @state() private _scanning = false;
  @state() private _expressions: string[] = [];
  @state() private _watermarkExpression = '';
  @state() private _modelOffsetY = 0;
  @state() private _modelZoom = 1.0;

  // Local settings stored in-memory; in a real app these would persist
  @state() private _reminderEnabled = true;
  @state() private _darkMode = false;
  @state() private _alwaysOnTop = true;
  @state() private _followMouse = true;

  override connectedCallback() {
    super.connectedCallback();
    this._loadModels();
    this._darkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
    this._watermarkExpression = localStorage.getItem('live2d-watermark-expression') || '';
    this._modelOffsetY = parseInt(localStorage.getItem('live2d-model-offset-y') || '0', 10);
    this._followMouse = localStorage.getItem('live2d-follow-mouse') !== 'false';
    // Load zoom from main process
    window.electronAPI?.getPetZoom?.().then(z => { this._modelZoom = z ?? 1.0; });
    // Listen for zoom changes (from pet window wheel)
    window.electronAPI?.onZoomChanged?.((z) => { this._modelZoom = z; });
    // Load always-on-top state
    window.electronAPI?.getAlwaysOnTop?.().then(v => { this._alwaysOnTop = v ?? true; });
  }

  private async _loadModels() {
    try {
      const [models, active] = await Promise.all([getLive2DModels(), getActiveLive2DModel()]);
      this._models = models;
      this._activeModelId = active?.id ?? '';
      // Use expressions directly from API response (no need to fetch model3.json)
      this._expressions = active?.expressions ?? [];
    } catch (e) {
      console.error('Failed to load models:', e);
    }
  }

  private async _handleSwitch(modelId: string) {
    if (modelId === this._activeModelId) return;
    try {
      await switchLive2DModel(modelId);
      this._activeModelId = modelId;
      // Get expressions for new model from models list
      const model = this._models.find(m => m.id === modelId);
      this._expressions = model?.expressions ?? [];
      // Clear saved watermark when switching model
      this._watermarkExpression = '';
      localStorage.removeItem('live2d-watermark-expression');
      this.dispatchEvent(new CustomEvent('model-changed', { detail: { modelId }, bubbles: true, composed: true }));
    } catch (e) {
      console.error('Failed to switch model:', e);
    }
  }

  private async _handleScan() {
    this._scanning = true;
    try {
      this._models = await scanLive2DModels();
    } catch (e) {
      console.error('Failed to scan models:', e);
    } finally {
      this._scanning = false;
    }
  }

  private _handleWatermarkChange(e: Event) {
    const val = (e.target as HTMLSelectElement).value;
    this._watermarkExpression = val;
    if (val) {
      localStorage.setItem('live2d-watermark-expression', val);
    } else {
      localStorage.removeItem('live2d-watermark-expression');
    }
  }

  private _handleModelOffsetChange(e: Event) {
    const val = parseInt((e.target as HTMLInputElement).value, 10);
    this._modelOffsetY = val;
    localStorage.setItem('live2d-model-offset-y', String(val));
  }

  private _resetModelOffset() {
    this._modelOffsetY = 0;
    localStorage.setItem('live2d-model-offset-y', '0');
  }

  private _handleZoomChange(e: Event) {
    const val = parseFloat((e.target as HTMLInputElement).value);
    this._modelZoom = Math.round(val * 100) / 100;
    window.electronAPI?.setPetZoom?.(this._modelZoom);
  }

  private _resetZoom() {
    this._modelZoom = 1.0;
    window.electronAPI?.setPetZoom?.(1.0);
  }

  override render() {
    return html`
      <div class="header">
        <h2>设置</h2>
      </div>

      <!-- Live2D Models -->
      <div class="section">
        <span class="section-title">Live2D 模型</span>
        <div class="action-bar">
          <button class="btn-outlined" @click=${this._handleScan} ?disabled=${this._scanning}>
            <span class="material-symbols-outlined" style="font-size:18px">refresh</span>
            ${this._scanning ? '扫描中...' : '扫描模型'}
          </button>
        </div>
        ${this._models.length > 0
          ? html`
            <div class="model-grid">
              ${this._models.map(m => html`
                <div class="model-card ${m.id === this._activeModelId ? 'active' : ''}"
                  @click=${() => this._handleSwitch(m.id)}>
                  <div class="model-preview">
                    ${m.preview_image
                      ? html`<img src="${m.preview_image}" alt="${m.name}" />`
                      : html`<span class="material-symbols-outlined">face</span>`}
                  </div>
                  <span class="model-name">${m.name || m.id}</span>
                </div>
              `)}
            </div>`
          : html`<div class="empty-models">未找到模型。请将 .moc3 模型放入 assets/live2d/ 目录后点击扫描。</div>`}
      </div>

      <!-- Watermark Expression -->
      ${this._expressions.length > 0
        ? html`
          <div class="section">
            <span class="section-title">水印设置</span>
            <div class="toggle-row">
              <div class="toggle-label">
                <span class="primary">水印遮盖表情</span>
                <span class="secondary">选择后将持续显示此表情以遮盖水印，右键菜单可叠加其他表情</span>
              </div>
              <select class="expression-select" .value=${this._watermarkExpression}
                @change=${(e: Event) => this._handleWatermarkChange(e)}>
                <option value="">不使用</option>
                ${this._expressions.map(name => html`
                  <option value="${name}" ?selected=${name === this._watermarkExpression}>${name}</option>
                `)}
              </select>
            </div>
          </div>`
        : nothing}

      <!-- Model Position Adjustment -->
      <div class="section">
        <span class="section-title">模型位置</span>
        <div class="slider-row">
          <div class="slider-header">
            <div class="toggle-label">
              <span class="primary">模型垂直偏移</span>
              <span class="secondary">向上拖动可露出被遮挡的鞋子，向下可隐藏底部</span>
            </div>
            <div style="display:flex;align-items:center;gap:4px">
              <span class="slider-value">${this._modelOffsetY}px</span>
              ${this._modelOffsetY !== 0
                ? html`<button class="btn-text-small" @click=${this._resetModelOffset}>重置</button>`
                : nothing}
            </div>
          </div>
          <input type="range" min="-300" max="300" step="5"
            .value=${String(this._modelOffsetY)}
            @input=${this._handleModelOffsetChange} />
        </div>
        <div class="slider-row">
          <div class="slider-header">
            <div class="toggle-label">
              <span class=\"primary\">桌宠大小</span>
              <span class=\"secondary\">滚轮也可以在桌宠窗口直接缩放，整体等比放大缩小</span>
            </div>
            <div style="display:flex;align-items:center;gap:4px">
              <span class="slider-value">${Math.round(this._modelZoom * 100)}%</span>
              ${this._modelZoom !== 1.0
                ? html`<button class="btn-text-small" @click=${this._resetZoom}>重置</button>`
                : nothing}
            </div>
          </div>
          <input type="range" min="0.3" max="2.0" step="0.05"
            .value=${String(this._modelZoom)}
            @input=${this._handleZoomChange} />
        </div>
      </div>

      <!-- Preferences -->
      <div class="section">
        <span class="section-title">偏好设置</span>
        <div class="toggle-row">
          <div class="toggle-label">
            <span class="primary">窗口置顶</span>
            <span class="secondary">桌宠始终显示在其他窗口之上</span>
          </div>
          <label class="switch">
            <input type="checkbox" .checked=${this._alwaysOnTop}
              @change=${(e: Event) => {
                this._alwaysOnTop = (e.target as HTMLInputElement).checked;
                window.electronAPI?.setAlwaysOnTop?.(this._alwaysOnTop);
              }} />
            <div class="switch-track"></div>
          </label>
        </div>
        <div class="toggle-row">
          <div class="toggle-label">
            <span class="primary">眼神追踪</span>
            <span class="secondary">桌宠的视线始终跟随鼠标方向</span>
          </div>
          <label class="switch">
            <input type="checkbox" .checked=${this._followMouse}
              @change=${(e: Event) => {
                this._followMouse = (e.target as HTMLInputElement).checked;
                localStorage.setItem('live2d-follow-mouse', String(this._followMouse));
              }} />
            <div class="switch-track"></div>
          </label>
        </div>
        <div class="toggle-row">
          <div class="toggle-label">
            <span class="primary">日程提醒</span>
            <span class="secondary">在日程开始前收到通知</span>
          </div>
          <label class="switch">
            <input type="checkbox" .checked=${this._reminderEnabled}
              @change=${(e: Event) => (this._reminderEnabled = (e.target as HTMLInputElement).checked)} />
            <div class="switch-track"></div>
          </label>
        </div>
        <div class="toggle-row">
          <div class="toggle-label">
            <span class="primary">深色模式</span>
            <span class="secondary">跟随系统或手动切换</span>
          </div>
          <label class="switch">
            <input type="checkbox" .checked=${this._darkMode}
              @change=${(e: Event) => (this._darkMode = (e.target as HTMLInputElement).checked)} />
            <div class="switch-track"></div>
          </label>
        </div>
      </div>

      <!-- About -->
      <div class="section">
        <span class="section-title">关于</span>
        <div class="about">
          <strong>桌宠日程表</strong> v1.0.0<br/>
          Neo-MoFox 插件<br/>
          开源协议: AGPL-3.0
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'settings-page': SettingsPage;
  }
}
