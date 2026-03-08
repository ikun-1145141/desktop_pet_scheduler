/* =============================================
   Electron API type declarations
   ============================================= */

export interface ElectronAPI {
  getWindowType(): Promise<'pet' | 'panel' | 'unknown'>;
  openPanel(page?: string): void;
  closePanel(): void;
  minimizePanel(): void;
  petDragStart(): void;
  petDragEnd(): void;
  setIgnoreMouse(ignore: boolean): void;
  showPetContextMenu(expressions: string[]): void;
  onMenuAction(callback: (action: string, data?: string) => void): void;
  menuAction(action: string, data?: string): void;
  closeMenuWindow(): void;
  resizeMenuWindow(width: number, height: number): void;
  resizePetWindow(width: number, height: number): void;
  zoomPetWindow(delta: number): void;
  setPetZoom(zoom: number): void;
  getPetZoom(): Promise<number>;
  getCursorRelative(): Promise<{x: number; y: number; hw: number; hh: number} | null>;
  setAlwaysOnTop(on: boolean): void;
  getAlwaysOnTop(): Promise<boolean>;
  onZoomChanged(callback: (zoom: number) => void): void;
  getMenuData(): Promise<string[]>;
  onNavigate(callback: (page: string) => void): void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
