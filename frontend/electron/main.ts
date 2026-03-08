/* =============================================
   Electron Main Process
   - Pet window: transparent, frameless, always-on-top
   - Panel window: schedule/todo/settings management
   - System tray
   ============================================= */

import { app, BrowserWindow, Tray, Menu, screen, ipcMain, nativeImage } from 'electron';
import * as path from 'path';
import { join } from 'node:path';

const isDev = !app.isPackaged;

let petWindow: BrowserWindow | null = null;
let panelWindow: BrowserWindow | null = null;
let menuWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

// Store menu expressions for pull-based IPC (avoids timing race)
let pendingMenuExpressions: string[] = [];

// Pet window zoom state
let petBaseW = 400;
let petBaseH = 500;
let petZoom = 1.0;

/* ---- Pet Window (Desktop Overlay) ---- */

function createPetWindow() {
  const display = screen.getPrimaryDisplay();
  const { width: screenW, height: screenH } = display.workAreaSize;

  // Pet window size - starts with a default, will be resized after model loads
  const petW = 400;
  const petH = 500;

  petWindow = new BrowserWindow({
    width: petW,
    height: petH,
    x: screenW - petW - 40,
    y: screenH - petH - 20,
    transparent: true,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    focusable: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Show window once content is ready
  petWindow.once('ready-to-show', () => {
    petWindow?.show();
  });

  // Make click-through on transparent areas
  petWindow.setIgnoreMouseEvents(false);

  if (isDev) {
    petWindow.loadURL('http://localhost:5173/#/pet');
    petWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    petWindow.loadFile(join(__dirname, '../dist/index.html'), { hash: '/pet' });
  }

  petWindow.on('closed', () => {
    petWindow = null;
  });

  return petWindow;
}

/* ---- Panel Window (Management UI) ---- */

function createPanelWindow() {
  if (panelWindow) {
    panelWindow.focus();
    return panelWindow;
  }

  panelWindow = new BrowserWindow({
    width: 900,
    height: 680,
    minWidth: 640,
    minHeight: 480,
    frame: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: 'rgba(0,0,0,0)',
      symbolColor: '#73796d',
      height: 40,
    },
    backgroundColor: '#f8faf0',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    panelWindow.loadURL('http://localhost:5173/#/panel');
  } else {
    panelWindow.loadFile(join(__dirname, '../dist/index.html'), { hash: '/panel' });
  }

  panelWindow.on('closed', () => {
    panelWindow = null;
  });

  return panelWindow;
}

/* ---- System Tray ---- */

function createTray() {
  // Load tray icon from file (32x32 green bunny)
  const iconPath = path.join(__dirname, 'tray-icon.png');
  const icon = nativeImage.createFromPath(iconPath);

  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示桌宠',
      click: () => {
        if (petWindow) {
          petWindow.show();
        } else {
          createPetWindow();
        }
      },
    },
    {
      label: '打开面板',
      click: () => createPanelWindow(),
    },
    { type: 'separator' },
    {
      label: '隐藏桌宠',
      click: () => petWindow?.hide(),
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        app.quit();
      },
    },
  ]);

  tray.setToolTip('桌宠日程表');
  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    createPanelWindow();
  });
}

/* ---- IPC Handlers ---- */

function setupIPC() {
  // Open panel from pet window
  ipcMain.on('open-panel', (_event, page?: string) => {
    const win = createPanelWindow();
    if (page) {
      win.webContents.send('navigate', page);
    }
  });

  // Close panel
  ipcMain.on('close-panel', () => {
    panelWindow?.close();
  });

  // Minimize panel
  ipcMain.on('minimize-panel', () => {
    panelWindow?.minimize();
  });

  // Drag pet window - main process polls cursor for DPI-correct coords
  let dragOffset: { x: number; y: number } | null = null;
  let dragSize: { w: number; h: number } | null = null;
  let lastCursor: { x: number; y: number } | null = null;
  let dragInterval: ReturnType<typeof setInterval> | null = null;

  ipcMain.on('pet-drag-start', () => {
    if (!petWindow) return;
    const cursor = screen.getCursorScreenPoint();
    const [wx, wy] = petWindow.getPosition();
    const [ww, wh] = petWindow.getSize();
    dragOffset = { x: cursor.x - wx, y: cursor.y - wy };
    dragSize = { w: ww, h: wh };
    lastCursor = { x: cursor.x, y: cursor.y };

    if (dragInterval) clearInterval(dragInterval);
    dragInterval = setInterval(() => {
      if (!petWindow || !dragOffset || !dragSize || !lastCursor) return;
      const pos = screen.getCursorScreenPoint();
      // Skip if cursor hasn't moved
      if (pos.x === lastCursor.x && pos.y === lastCursor.y) return;
      lastCursor = { x: pos.x, y: pos.y };
      // Use setBounds to lock size and prevent DPI-triggered resizing
      petWindow.setBounds({
        x: pos.x - dragOffset.x,
        y: pos.y - dragOffset.y,
        width: dragSize.w,
        height: dragSize.h,
      });
    }, 16); // ~60fps
  });

  ipcMain.on('pet-drag-end', () => {
    dragOffset = null;
    if (dragInterval) {
      clearInterval(dragInterval);
      dragInterval = null;
    }
  });

  // Set pet window mouse passthrough for transparent areas
  ipcMain.on('set-ignore-mouse', (_event, ignore: boolean) => {
    petWindow?.setIgnoreMouseEvents(ignore, { forward: true });
  });

  // Resize pet window to fit model — stores as base size for zoom
  ipcMain.on('resize-pet-window', (_event, width: number, height: number) => {
    if (!petWindow) return;
    // Store as base dimensions (zoom=1.0)
    petBaseW = width;
    petBaseH = height;
    // Apply with current zoom
    applyPetZoom();
  });

  // Zoom pet window: delta-based (from wheel)
  ipcMain.on('zoom-pet-window', (_event, delta: number) => {
    petZoom = Math.max(0.3, Math.min(2.5, Math.round((petZoom + delta) * 100) / 100));
    applyPetZoom();
    // Notify all windows of new zoom value
    petWindow?.webContents.send('zoom-changed', petZoom);
    panelWindow?.webContents.send('zoom-changed', petZoom);
  });

  // Set pet zoom: absolute value (from settings slider)
  ipcMain.on('set-pet-zoom', (_event, zoom: number) => {
    petZoom = Math.max(0.3, Math.min(2.5, zoom));
    applyPetZoom();
    petWindow?.webContents.send('zoom-changed', petZoom);
    panelWindow?.webContents.send('zoom-changed', petZoom);
  });

  // Get current pet zoom
  ipcMain.handle('get-pet-zoom', () => petZoom);

  // Get global cursor position relative to pet window center (for mouse tracking)
  ipcMain.handle('get-cursor-relative', () => {
    if (!petWindow) return null;
    const cursor = screen.getCursorScreenPoint();
    const bounds = petWindow.getBounds();
    const cx = bounds.x + bounds.width / 2;
    const cy = bounds.y + bounds.height / 2;
    return { x: cursor.x - cx, y: cursor.y - cy, hw: bounds.width / 2, hh: bounds.height / 2 };
  });

  // Toggle always-on-top for pet window
  ipcMain.on('set-always-on-top', (_event, on: boolean) => {
    petWindow?.setAlwaysOnTop(on);
  });

  ipcMain.handle('get-always-on-top', () => {
    return petWindow?.isAlwaysOnTop() ?? true;
  });

  // Custom styled context menu popup window
  ipcMain.on('pet-context-menu', (_event, expressions: string[]) => {
    if (!petWindow) return;

    // Close existing menu window
    if (menuWindow && !menuWindow.isDestroyed()) {
      menuWindow.close();
      menuWindow = null;
    }

    const cursor = screen.getCursorScreenPoint();
    const menuW = 210;
    // Use collapsed menu height for initial positioning (4 items + dividers ≈ 230px)
    // The window itself is taller (transparent), and dynamic resize will adjust later
    const posH = 240;
    const winH = 500; // generous transparent window height for expanded content

    // Clamp to screen bounds using the visible menu height
    const display = screen.getDisplayNearestPoint(cursor);
    const { x: sx, y: sy, width: sw, height: sh } = display.workArea;
    let mx = cursor.x;
    let my = cursor.y;
    if (mx + menuW > sx + sw) mx = sx + sw - menuW;
    if (my + posH > sy + sh) my = Math.max(sy, sy + sh - posH);

    menuWindow = new BrowserWindow({
      width: menuW,
      height: winH,
      x: mx,
      y: my,
      transparent: true,
      frame: false,
      resizable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      hasShadow: false,
      focusable: true,
      show: false,
      webPreferences: {
        preload: join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    // Store expressions so menu popup can pull them via invoke
    pendingMenuExpressions = expressions;

    menuWindow.once('ready-to-show', () => {
      menuWindow?.show();
    });

    menuWindow.on('blur', () => {
      if (menuWindow && !menuWindow.isDestroyed()) {
        menuWindow.close();
      }
    });

    menuWindow.on('closed', () => {
      menuWindow = null;
    });

    if (isDev) {
      menuWindow.loadURL('http://localhost:5173/#/menu');
    } else {
      menuWindow.loadFile(join(__dirname, '../dist/index.html'), { hash: '/menu' });
    }
  });

  // Menu popup actions → forward to pet window or open panel
  ipcMain.on('menu-action', (_event, action: string, data?: string) => {
    if (action === 'schedule' || action === 'todo' || action === 'chat' || action === 'settings') {
      const win = createPanelWindow();
      win.webContents.send('navigate', action);
    } else if (action === 'expression' && data) {
      petWindow?.webContents.send('menu-action', 'expression', data);
    } else if (action === 'clear-expression') {
      petWindow?.webContents.send('menu-action', 'clear-expression');
    }
    if (menuWindow && !menuWindow.isDestroyed()) {
      menuWindow.close();
    }
  });

  // Close menu window
  ipcMain.on('close-menu-window', () => {
    if (menuWindow && !menuWindow.isDestroyed()) {
      menuWindow.close();
    }
  });

  // Resize menu popup window dynamically (e.g. when submenu opens/closes)
  ipcMain.on('resize-menu-window', (_event, width: number, height: number) => {
    if (!menuWindow || menuWindow.isDestroyed()) return;
    const [mx, my] = menuWindow.getPosition();
    const display = screen.getDisplayNearestPoint({ x: mx, y: my });
    const { y: sy, height: sh } = display.workArea;
    // If new height would push below screen, shift window up
    let newY = my;
    if (my + height > sy + sh) {
      newY = Math.max(sy, sy + sh - height);
    }
    menuWindow.setBounds({ x: mx, y: newY, width, height });
  });

  // Get menu data (expressions) - pull-based to avoid race condition
  ipcMain.handle('get-menu-data', () => {
    return pendingMenuExpressions;
  });

  // Get window type
  ipcMain.handle('get-window-type', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win === petWindow) return 'pet';
    if (win === panelWindow) return 'panel';
    if (win === menuWindow) return 'menu';
    return 'unknown';
  });
}

/* ---- Pet Zoom Helper ---- */

function applyPetZoom() {
  if (!petWindow) return;
  const w = Math.round(petBaseW * petZoom);
  const h = Math.round(petBaseH * petZoom);
  const [ox, oy] = petWindow.getPosition();
  const [ow, oh] = petWindow.getSize();
  // Keep center stable during resize
  const nx = Math.round(ox + (ow - w) / 2);
  const ny = Math.round(oy + (oh - h) / 2);
  petWindow.setBounds({ x: nx, y: ny, width: w, height: h });
  // Note: setZoomFactor does NOT affect WebGL canvas; pixi renderer
  // and model scale are handled by live2d-viewer's ResizeObserver.
}

/* ---- App Lifecycle ---- */

app.whenReady().then(() => {
  setupIPC();
  createTray();
  createPetWindow();
});

app.on('window-all-closed', () => {
  // Don't quit on all windows closed - keep tray alive
});

app.on('activate', () => {
  if (!petWindow) {
    createPetWindow();
  }
});

app.on('before-quit', () => {
  tray?.destroy();
});
