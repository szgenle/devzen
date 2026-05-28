import { app, BrowserWindow, Menu, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerIpcHandlers } from './ipc/index.js';
import { loadWindowState, saveWindowState } from './core/window-state.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;

async function createWindow(): Promise<void> {
  const windowState = await loadWindowState();

  mainWindow = new BrowserWindow({
    ...(windowState.x !== undefined && windowState.y !== undefined
      ? { x: windowState.x, y: windowState.y }
      : {}),
    width: windowState.width,
    height: windowState.height,
    minWidth: 960,
    minHeight: 600,
    title: 'DevZen',
    backgroundColor: '#0d1117',
    titleBarStyle: 'hiddenInset',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // 如果之前是最大化状态，恢复最大化
  if (windowState.isMaximized) {
    mainWindow.maximize();
  }

  // Windows/Linux 下移除顶部菜单栏
  if (process.platform !== 'darwin') {
    mainWindow.setMenu(null);
  }

  mainWindow.on('ready-to-show', () => mainWindow?.show());

  // 窗口关闭前保存位置和大小
  mainWindow.on('close', () => {
    if (!mainWindow) return;
    const isMaximized = mainWindow.isMaximized();
    const bounds = mainWindow.getNormalBounds();
    saveWindowState({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      isMaximized
    });
    // 强制把 renderer 在内存中的 localStorage / IndexedDB 等 storage 数据刷盘，
    // 避免 Chromium 延迟刷盘遇上 Ctrl+C/SIGINT 强杀导致刚 setItem 的内容丢。
    try {
      mainWindow.webContents.session.flushStorageData();
    } catch {
      // session 已释放时忽略
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // electron-vite 在开发环境下会注入 ELECTRON_RENDERER_URL；生产环境加载本地文件
  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  // 原本依照 macOS 惯例关窗不退 app，但这让 dev 体验很坑：
  //   - 点窗口关闭后终端里 electron 进程还在跑，只能 Ctrl+C 强杀；
  //   - SIGINT 强杀会导致 Chromium 未 flush localStorage，扫描历史丢失。
  // 索性统一变为“关窗不 quit” → “关窗即 quit”，让 dev 进程随窗口干净退出。
  app.quit();
});
