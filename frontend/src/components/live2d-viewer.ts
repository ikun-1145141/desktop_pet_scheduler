/* =============================================
   Live2D Viewer - pixi.js + pixi-live2d-display
   ============================================= */

import { LitElement, html, css } from 'lit';
import { customElement, property, state, query } from 'lit/decorators.js';
import { m3Shared } from '../styles/shared';

import type { Live2DModelInfo } from '../types';

// Dynamic imports for pixi - these are heavy and may fail in some Electron envs
let PIXI: typeof import('pixi.js') | null = null;
let Live2DModelClass: any = null;

async function loadPixi() {
  if (!PIXI) {
    PIXI = await import('pixi.js');
    // Use cubism4 build for .moc3 models
    const l2d = await import('pixi-live2d-display/cubism4');
    Live2DModelClass = l2d.Live2DModel;
    // Register pixi Ticker so Live2D model auto-updates
    Live2DModelClass.registerTicker(PIXI.Ticker);
  }
  return { PIXI: PIXI!, Live2DModel: Live2DModelClass };
}

@customElement('live2d-viewer')
export class Live2DViewer extends LitElement {
  static override styles = [
    m3Shared,
    css`
      :host {
        display: block;
        width: 100%;
        height: 100%;
        position: relative;
        overflow: hidden;
      }
      canvas {
        display: block;
        width: 100%;
        height: 100%;
      }
      .placeholder {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 100%;
        color: var(--md-sys-color-on-surface);
        flex-direction: column;
        gap: 12px;
      }
      .placeholder .pet-fallback {
        width: 180px;
        height: 180px;
        border-radius: 50%;
        background: var(--md-sys-color-primary-container, #cbefbd);
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: var(--md-sys-elevation-2);
        position: relative;
        animation: petBounce 2s ease-in-out infinite;
      }
      .placeholder .pet-fallback .material-symbols-outlined {
        font-size: 80px;
        color: var(--md-sys-color-on-primary-container, #072104);
        font-variation-settings: 'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 48;
      }
      @keyframes petBounce {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-8px); }
      }
      .placeholder .hint {
        background: var(--md-sys-color-surface-container, rgba(236,239,228,0.92));
        padding: 8px 16px;
        border-radius: var(--md-sys-shape-corner-medium, 12px);
        box-shadow: var(--md-sys-elevation-1);
        text-align: center;
      }
      .loading-overlay {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: transparent;
        z-index: 10;
      }
      .spinner {
        width: 40px;
        height: 40px;
        border: 3px solid var(--md-sys-color-outline-variant);
        border-top-color: var(--md-sys-color-primary);
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
    `,
  ];

  /** Model JSON URL to load (from backend or local) */
  @property({ type: String }) modelUrl = '';

  @state() private _loading = false;
  @state() private _error = '';
  @state() private _hasModel = false;

  @query('canvas') private _canvas!: HTMLCanvasElement;

  private _app: any = null;
  private _model: any = null;
  private _modelInfo: Live2DModelInfo | null = null;
  private _initInProgress = false;
  /** Cached expression definitions from model3.json (fallback for when expressionManager is null) */
  private _expressionDefs: Array<{ Name: string; File: string }> = [];
  /** Base URL for resolving relative expression file paths */
  private _modelBaseUrl = '';
  /** Watermark expression params — always applied as base layer every frame */
  private _watermarkParams: any[] | null = null;
  /** User-selected expression params — applied on top of watermark every frame */
  private _overlayExpressionParams: any[] | null = null;
  /** Cached layout values for vertical repositioning */
  private _layoutCanvasW = 400;
  private _layoutCanvasH = 400;
  /** Original model width at scale=1 (captured before any scale change) */
  private _modelRawW = 1;
  /** Scale multiplier: model.scale = (viewerWidth / _modelRawW) * SCALE_K */
  private static readonly SCALE_K = 0.85;
  /** Persistent observer — scales model when window resizes (zoom) */
  private _zoomObserver: ResizeObserver | null = null;
  /** Mouse-follow interval ID */
  private _followMouseTimer: ReturnType<typeof setInterval> | null = null;

  override async connectedCallback() {
    super.connectedCallback();
    // Auto-load the active model from backend
    this._loadActiveModel();

    // Listen for expression changes from settings page (in other window)
    window.addEventListener('storage', this._onStorageChange);

    // Start mouse tracking if enabled
    this._syncFollowMouse();
  }

  private _onStorageChange = (e: StorageEvent) => {
    if (e.key === 'live2d-watermark-expression') {
      console.log('[live2d-viewer] Watermark expression changed from settings:', e.newValue);
      if (this._expressionDefs.length === 0) {
        console.log('[live2d-viewer] Expressions not yet loaded, will apply on load');
        return;
      }
      this._loadWatermarkExpression(e.newValue || '');
    } else if (e.key === 'live2d-model-offset-y') {
      this._applyVerticalOffset();
    } else if (e.key === 'live2d-follow-mouse') {
      this._syncFollowMouse();
    }
  };

  /** Re-position model vertically when user drags the offset slider */
  private _applyVerticalOffset() {
    if (!this._model) return;
    const userOffset = parseInt(localStorage.getItem('live2d-model-offset-y') || '0', 10);
    this._model.y = this._layoutCanvasH / 2 + userOffset;
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('storage', this._onStorageChange);
    this._stopFollowMouse();
    this._destroyApp(true);
  }

  private async _loadActiveModel() {
    try {
      const { getActiveLive2DModel } = await import('../api/client');
      this._modelInfo = await getActiveLive2DModel();
      if (this._modelInfo?.model_file) {
        this.modelUrl = this._modelInfo.model_file;
        // Set _hasModel so canvas element is rendered
        this._hasModel = true;
        // Wait for Lit to render the canvas element
        await this.updateComplete;
        // Need a second update cycle to ensure canvas is in DOM
        await new Promise(r => requestAnimationFrame(r));
        await this.updateComplete;
        await this._initLive2D();
      }
    } catch (e) {
      console.warn('Failed to load active model info:', e);
    }
  }

  // Removed: updated() no longer triggers _initLive2D to avoid double-init race condition

  private async _initLive2D() {
    // Guard against double-init
    if (this._initInProgress) {
      console.log('[live2d-viewer] Init already in progress, skipping');
      return;
    }
    this._initInProgress = true;
    this._destroyApp();

    if (!this.modelUrl) {
      this._initInProgress = false;
      return;
    }

    this._loading = true;
    this._error = '';

    try {
      const { PIXI, Live2DModel } = await loadPixi();

      await this.updateComplete;

      const canvas = this.shadowRoot?.querySelector('canvas') as HTMLCanvasElement | null;
      if (!canvas) {
        console.error('[live2d-viewer] Canvas element not found in shadow DOM');
        this._error = 'Canvas 未找到';
        this._loading = false;
        return;
      }

      const rect = this.getBoundingClientRect();
      const width = rect.width || 400;
      const height = rect.height || 600;

      console.log(`[live2d-viewer] Initializing pixi app ${width}x${height}, modelUrl=${this.modelUrl}`);

      this._app = new PIXI.Application({
        view: canvas,
        width,
        height,
        backgroundAlpha: 0,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      });

      console.log('[live2d-viewer] Loading Live2D model from:', this.modelUrl);
      this._model = await Live2DModel.from(this.modelUrl, {
        autoInteract: false,
        autoUpdate: true,
      });
      console.log('[live2d-viewer] Model loaded successfully:', this._model.width, this._model.height);

      // Disable pixi event system on model tree to avoid pixi v7 compat errors
      // (pixi-live2d-display v0.4 doesn't support pixi v7 EventBoundary)
      this._model.eventMode = 'none';
      this._model.interactiveChildren = false;

      // ── Auto-size window to fit model ──────────────────────────
      // Capture raw model dimensions BEFORE any scale change.
      // scale = (viewerWidth / rawW) * SCALE_K  —  purely from current size,
      // no accumulated state, no ratio inference.  Recalculated on every
      // ResizeObserver tick so zoom just works.
      const modelRawW = this._model.width;   // scale is (1,1) here
      const modelRawH = this._model.height;
      this._modelRawW = modelRawW;

      const SCALE_K = Live2DViewer.SCALE_K;
      const MIN_W = 280;
      const MAX_W = 480;
      const MAX_H = Math.min(800, Math.round(window.screen.availHeight * 0.8));

      // Base window width
      const targetW = Math.max(MIN_W, Math.min(MAX_W, Math.round(modelRawW * 0.45)));
      // Base scale at that width
      const baseScale = (targetW / modelRawW) * SCALE_K;
      const scaledH = modelRawH * baseScale;
      // Window height = enough for model
      const targetH = Math.min(Math.max(200, Math.round(scaledH * 1.15)), MAX_H);

      this._model.scale.set(baseScale);
      this._model.anchor.set(0.5, 0.5);

      console.log(`[live2d-viewer] Auto-size: rawModel ${modelRawW}x${modelRawH}, ` +
        `baseScale=${baseScale.toFixed(3)}, window ${targetW}x${targetH}`);

      // ── Layout helper: absolute scale from current width, no state ──
      const layoutModel = (cw: number, ch: number) => {
        if (!this._model) return;
        const s = (cw / this._modelRawW) * SCALE_K;
        this._model.scale.set(s);
        this._model.x = cw / 2;
        const off = parseInt(localStorage.getItem('live2d-model-offset-y') || '0', 10);
        this._model.y = ch / 2 + off;
        this._layoutCanvasW = cw;
        this._layoutCanvasH = ch;
      };

      layoutModel(width, height);

      this._app.stage.addChild(this._model as any);
      this._hasModel = true;

      // Request window resize to base dimensions
      window.electronAPI?.resizePetWindow?.(targetW, targetH);

      // Persistent ResizeObserver — fires on initial resize AND on every
      // zoom-driven window resize.  Resizes pixi renderer, then recomputes
      // model scale + position from scratch (no accumulated state).
      this._zoomObserver?.disconnect();
      this._zoomObserver = new ResizeObserver((entries) => {
        const { width: nw, height: nh } = entries[0].contentRect;
        if (nw < 1 || nh < 1) return;
        if (!this._app || !this._model) return;
        this._app.renderer.resize(nw, nh);
        layoutModel(nw, nh);
      });
      this._zoomObserver.observe(this);

      // Compute base URL for relative file resolution
      const lastSlash = this.modelUrl.lastIndexOf('/');
      this._modelBaseUrl = lastSlash >= 0 ? this.modelUrl.substring(0, lastSlash + 1) : '';

      // Get expression definitions from API response (most reliable source)
      if (this._modelInfo?.expression_defs?.length) {
        this._expressionDefs = this._modelInfo.expression_defs;
        console.log('[live2d-viewer] Got', this._expressionDefs.length, 'expressions from API:', this._expressionDefs.map(d => d.Name));
      } else if (this._modelInfo?.expressions?.length) {
        // Fallback: names only from API, no File paths — won't be able to load exp3.json
        console.warn('[live2d-viewer] API returned expression names but no defs');
      }

      // Install per-frame expression hook via beforeModelUpdate event
      // This fires right before model.update() in Cubism4InternalModel.update(),
      // AFTER saveParameters/expressionManager/eyeBlink/physics/pose
      // Layered design: watermark (base) is ALWAYS applied, then overlay expression on top
      if (this._expressionDefs.length > 0) {
        const im = this._model.internalModel;
        im?.on('beforeModelUpdate', () => {
          const cm = im.coreModel;
          // Layer 1: Always apply watermark params (hide watermark)
          if (this._watermarkParams) {
            for (const p of this._watermarkParams) {
              const val = p.Value ?? 0;
              const blend = p.Blend || 'Add';
              if (blend === 'Add') {
                cm.addParameterValueById(p.Id, val, 1.0);
              } else if (blend === 'Multiply') {
                cm.multiplyParameterValueById(p.Id, val, 1.0);
              } else {
                cm.setParameterValueById(p.Id, val, 1.0);
              }
            }
          }
          // Layer 2: Apply user-selected expression on top
          if (this._overlayExpressionParams) {
            for (const p of this._overlayExpressionParams) {
              const val = p.Value ?? 0;
              const blend = p.Blend || 'Add';
              if (blend === 'Add') {
                cm.addParameterValueById(p.Id, val, 1.0);
              } else if (blend === 'Multiply') {
                cm.multiplyParameterValueById(p.Id, val, 1.0);
              } else {
                cm.setParameterValueById(p.Id, val, 1.0);
              }
            }
          }
        });
        console.log('[live2d-viewer] Installed beforeModelUpdate expression hook (layered)');

      }

      // Log available expressions
      if (this._expressionDefs.length > 0) {
        console.log('[live2d-viewer] Expressions:', this._expressionDefs.map(d => d.Name));
      }

      // Load user-configured watermark expression as persistent base layer
      try {
        const savedWatermark = localStorage.getItem('live2d-watermark-expression');
        if (savedWatermark && this._expressionDefs.length > 0) {
          await this._loadWatermarkExpression(savedWatermark);
        }
      } catch (exprErr) {
        console.warn('[live2d-viewer] Failed to load watermark expression:', exprErr);
      }

      // Drag support via canvas DOM events (bypass pixi event system)
      this._setupDrag(canvas);
    } catch (e) {
      this._error = `Live2D model load error: ${e}`;
      console.error(this._error);
      this._destroyApp(true);
    } finally {
      this._loading = false;
      this._initInProgress = false;
    }
  }

  private _setupDrag(canvas: HTMLCanvasElement) {
    if (!this._model) return;
    const model = this._model;
    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;

    canvas.style.cursor = 'grab';

    canvas.addEventListener('pointerdown', (e: PointerEvent) => {
      dragging = true;
      // Convert DOM coords to pixi coords (account for resolution)
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width / (window.devicePixelRatio || 1);
      const scaleY = canvas.height / rect.height / (window.devicePixelRatio || 1);
      const px = (e.clientX - rect.left) * scaleX;
      const py = (e.clientY - rect.top) * scaleY;
      offsetX = px - model.x;
      offsetY = py - model.y;
      canvas.style.cursor = 'grabbing';
      canvas.setPointerCapture(e.pointerId);
    });

    canvas.addEventListener('pointermove', (e: PointerEvent) => {
      if (!dragging) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width / (window.devicePixelRatio || 1);
      const scaleY = canvas.height / rect.height / (window.devicePixelRatio || 1);
      const px = (e.clientX - rect.left) * scaleX;
      const py = (e.clientY - rect.top) * scaleY;
      model.x = px - offsetX;
      model.y = py - offsetY;
    });

    canvas.addEventListener('pointerup', () => {
      dragging = false;
      canvas.style.cursor = 'grab';
    });

    canvas.addEventListener('pointerleave', () => {
      dragging = false;
      canvas.style.cursor = 'grab';
    });
  }

  private _destroyApp(resetView = false) {
    this._watermarkParams = null;
    this._overlayExpressionParams = null;
    this._zoomObserver?.disconnect();
    this._zoomObserver = null;
    this._stopFollowMouse();
    if (this._model) {
      this._model.destroy();
      this._model = null;
    }
    if (this._app) {
      this._app.destroy(false, { children: true });
      this._app = null;
    }
    if (resetView) {
      this._hasModel = false;
    }
  }

  /** Trigger a motion on the current model */
  async triggerMotion(group: string, index = 0): Promise<void> {
    if (this._model) {
      await this._model.motion(group, index);
    }
  }

  /** Trigger an expression by index as overlay */
  async triggerExpression(index = 0): Promise<void> {
    if (!this._model || index < 0 || index >= this._expressionDefs.length) return;
    const def = this._expressionDefs[index];
    const params = await this._loadExpressionParams(def.File);
    if (params) this._overlayExpressionParams = params;
  }

  /** Load watermark expression by name as persistent base layer */
  private async _loadWatermarkExpression(name: string): Promise<void> {
    if (!name) {
      this._watermarkParams = null;
      console.log('[live2d-viewer] Watermark expression cleared');
      return;
    }
    const def = this._expressionDefs.find(d => d.Name === name);
    if (!def) {
      console.warn(`[live2d-viewer] Watermark expression "${name}" not found`);
      return;
    }
    const params = await this._loadExpressionParams(def.File);
    if (params) {
      this._watermarkParams = params;
      console.log(`[live2d-viewer] Watermark base layer loaded: ${name} (${params.map(p => p.Id)})`);
    }
  }

  /** Fetch expression params from exp3.json file (does NOT apply them) */
  private async _loadExpressionParams(file: string): Promise<any[] | null> {
    try {
      const url = this._modelBaseUrl + encodeURIComponent(file);
      console.log(`[live2d-viewer] Fetching expression: ${url}`);
      const resp = await fetch(url);
      if (!resp.ok) {
        console.warn(`[live2d-viewer] Failed to fetch expression file: ${file} (${resp.status})`);
        return null;
      }
      const expJson = await resp.json();
      const params = expJson?.Parameters;
      if (!Array.isArray(params) || params.length === 0) {
        console.warn(`[live2d-viewer] Expression file has no parameters: ${file}`);
        return null;
      }
      console.log(`[live2d-viewer] Expression loaded: ${file} (${params.length} params: ${params.map((p: any) => p.Id).join(', ')})`);
      return params;
    } catch (e) {
      console.warn(`[live2d-viewer] Error loading expression ${file}:`, e);
      return null;
    }
  }

  /** Apply expression by name as overlay (watermark base layer remains active) */
  private async _applyExpressionByName(name: string): Promise<boolean> {
    if (!this._model) return false;

    // Find in our cached definitions
    const idx = this._expressionDefs.findIndex(d => d.Name === name);
    if (idx < 0) {
      console.warn(`[live2d-viewer] Expression "${name}" not found in`, this._expressionDefs.map(d => d.Name));
      return false;
    }

    const def = this._expressionDefs[idx];

    // Load as overlay expression (on top of watermark base)
    const params = await this._loadExpressionParams(def.File);
    if (params) {
      this._overlayExpressionParams = params;
      console.log(`[live2d-viewer] Overlay expression applied: ${name} (index ${idx})`);
      return true;
    }
    return false;
  }

  /** Clear overlay expression (only watermark base remains) */
  clearOverlayExpression(): void {
    this._overlayExpressionParams = null;
    console.log('[live2d-viewer] Overlay expression cleared');
  }

  /** Set expression by name (public API for pet-overlay and menu) */
  async setExpressionByName(name: string): Promise<boolean> {
    return this._applyExpressionByName(name);
  }

  /** Get list of available expression names (excludes the watermark expression) */
  getExpressionNames(): string[] {
    const watermarkName = localStorage.getItem('live2d-watermark-expression') || '';
    return this._expressionDefs
      .map(d => d.Name)
      .filter(name => name !== watermarkName);
  }

  /** Get model info */
  get modelInfo(): Live2DModelInfo | null {
    return this._modelInfo;
  }

  /* ---- Mouse follow (eye tracking) ---- */

  /** Start or stop the follow-mouse polling based on localStorage */
  private _syncFollowMouse() {
    const enabled = localStorage.getItem('live2d-follow-mouse') !== 'false';
    if (enabled && !this._followMouseTimer) {
      this._startFollowMouse();
    } else if (!enabled && this._followMouseTimer) {
      this._stopFollowMouse();
    }
  }

  private _startFollowMouse() {
    if (this._followMouseTimer) return;
    // Poll cursor position every 50ms for smooth tracking
    this._followMouseTimer = setInterval(async () => {
      if (!this._model) return;
      const pos = await window.electronAPI?.getCursorRelative?.();
      if (!pos) return;
      // Normalize to roughly [-1, 1] using half-window as reference range
      const nx = Math.max(-1, Math.min(1, pos.x / Math.max(pos.hw, 100)));
      const ny = Math.max(-1, Math.min(1, pos.y / Math.max(pos.hh, 100)));
      this._model.focus(nx, ny);
    }, 50);
  }

  private _stopFollowMouse() {
    if (this._followMouseTimer) {
      clearInterval(this._followMouseTimer);
      this._followMouseTimer = null;
    }
  }

  override render() {
    return html`
      ${this._loading
        ? html`<div class="loading-overlay"><div class="spinner"></div></div>`
        : null}
      ${!this._hasModel && !this._loading
        ? html`
          <div class="placeholder">
            <div class="pet-fallback">
              <span class="material-symbols-outlined">pets</span>
            </div>
            <div class="hint">
              <span class="body-large">${this._error || 'Live2D 模型未加载'}</span><br/>
              <span class="body-small" style="color:var(--md-sys-color-outline)">
                右键 -> 设置 进行配置
              </span>
            </div>
          </div>`
        : null}
      ${this._hasModel ? html`<canvas></canvas>` : null}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'live2d-viewer': Live2DViewer;
  }
}
