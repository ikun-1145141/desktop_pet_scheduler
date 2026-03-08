/* =============================================
   Electron Preload Script
   Exposes safe IPC bridge to renderer
   ============================================= */

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  /** Get whether this is the 'pet' or 'panel' window */
  getWindowType: (): Promise<'pet' | 'panel' | 'unknown'> =>
    ipcRenderer.invoke('get-window-type'),

  /** Open the management panel window */
  openPanel: (page?: string): void =>
    ipcRenderer.send('open-panel', page),

  /** Close the panel window */
  closePanel: (): void =>
    ipcRenderer.send('close-panel'),

  /** Minimize the panel window */
  minimizePanel: (): void =>
    ipcRenderer.send('minimize-panel'),

  /** Start dragging the pet window */
  petDragStart: (): void =>
    ipcRenderer.send('pet-drag-start'),

  /** Stop dragging the pet window */
  petDragEnd: (): void =>
    ipcRenderer.send('pet-drag-end'),

  /** Set whether mouse events pass through pet window */
  setIgnoreMouse: (ignore: boolean): void =>
    ipcRenderer.send('set-ignore-mouse', ignore),

  /** Show native context menu on pet window */
  showPetContextMenu: (expressions: string[]): void =>
    ipcRenderer.send('pet-context-menu', expressions),

  /** Listen for menu action events from native context menu */
  onMenuAction: (callback: (action: string, data?: string) => void): void => {
    ipcRenderer.on('menu-action', (_event, action: string, data?: string) => callback(action, data));
  },

  /** Send menu action (from menu popup window) */
  menuAction: (action: string, data?: string): void =>
    ipcRenderer.send('menu-action', action, data),

  /** Close the menu popup window */
  closeMenuWindow: (): void =>
    ipcRenderer.send('close-menu-window'),

  /** Resize the menu popup window */
  resizeMenuWindow: (width: number, height: number): void =>
    ipcRenderer.send('resize-menu-window', width, height),

  /** Resize the pet window to fit the model */
  resizePetWindow: (width: number, height: number): void =>
    ipcRenderer.send('resize-pet-window', width, height),

  /** Zoom pet window by delta (left-click + scroll wheel) */
  zoomPetWindow: (delta: number): void =>
    ipcRenderer.send('zoom-pet-window', delta),

  /** Set pet zoom to absolute value (from settings slider) */
  setPetZoom: (zoom: number): void =>
    ipcRenderer.send('set-pet-zoom', zoom),

  /** Get current pet zoom factor */
  getPetZoom: (): Promise<number> =>
    ipcRenderer.invoke('get-pet-zoom'),

  /** Get cursor position relative to pet window center */
  getCursorRelative: (): Promise<{x: number; y: number; hw: number; hh: number} | null> =>
    ipcRenderer.invoke('get-cursor-relative'),

  /** Set pet window always-on-top */
  setAlwaysOnTop: (on: boolean): void =>
    ipcRenderer.send('set-always-on-top', on),

  /** Get pet window always-on-top state */
  getAlwaysOnTop: (): Promise<boolean> =>
    ipcRenderer.invoke('get-always-on-top'),

  /** Listen for zoom changes from main process */
  onZoomChanged: (callback: (zoom: number) => void): void => {
    ipcRenderer.on('zoom-changed', (_event, zoom: number) => callback(zoom));
  },

  /** Get menu data (expression list) from main process - pull-based */
  getMenuData: (): Promise<string[]> =>
    ipcRenderer.invoke('get-menu-data'),

  /** Listen for navigation events from main process */
  onNavigate: (callback: (page: string) => void): void => {
    ipcRenderer.on('navigate', (_event, page: string) => callback(page));
  },
});
