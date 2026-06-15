const { app, BrowserWindow, shell, Menu, Tray, nativeImage, ipcMain } = require('electron');
const path = require('path');

let splashWindow = null;
let mainWindow   = null;
let tray         = null;
let mainShown    = false; // 중복 표시 방지 플래그

// ── 메인 창 표시 (한 번만 실행) ──────────────────────────────────────────────
function showMain() {
  if (mainShown || !mainWindow || mainWindow.isDestroyed()) return;
  mainShown = true;
  if (splashWindow && !splashWindow.isDestroyed()) {
    try { splashWindow.close(); } catch(e) {}
    splashWindow = null;
  }
  mainWindow.show();
  mainWindow.focus();
}

// ── 스플래시 창 ──────────────────────────────────────────────────────────────
function createSplash() {
  try {
    splashWindow = new BrowserWindow({
      width: 500, height: 340,
      transparent: false,
      backgroundColor: '#0a0a1a',
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      webPreferences: { nodeIntegration: false }
    });
    splashWindow.loadFile(path.join(__dirname, 'splash.html'));
    splashWindow.center();
  } catch(e) {
    console.warn('Splash failed:', e.message);
    splashWindow = null;
  }
}

// ── 메인 앱 창 ───────────────────────────────────────────────────────────────
function createMain() {
  const iconPath = path.join(__dirname, 'icon.ico');

  mainWindow = new BrowserWindow({
    width: 1440, height: 900,
    minWidth: 1100, minHeight: 700,
    show: false,
    title: 'The Truth Untold — Th!nc Biometric Analyzer',
    icon: iconPath,
    backgroundColor: '#0a0a1a',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,              // CORS 완전 우회 — YouTube 자막 직접 접근
      allowRunningInsecureContent: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // 외부 링크는 기본 브라우저로 열기
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // ready-to-show 이벤트: 스플래시 후 1.8초 대기 후 표시
  mainWindow.once('ready-to-show', () => {
    const delay = (splashWindow && !splashWindow.isDestroyed()) ? 1800 : 0;
    setTimeout(showMain, delay);
  });

  // 안전망 타임아웃: 8초 후 무조건 표시 (ready-to-show 미발화 대비)
  setTimeout(showMain, 8000);

  mainWindow.on('closed', () => {
    mainWindow = null;
    mainShown = false;
  });
}

// ── 시스템 트레이 ────────────────────────────────────────────────────────────
function createTray() {
  try {
    const icoPath = path.join(__dirname, 'icon.ico');
    const icon = nativeImage.createFromPath(icoPath).resize({ width: 16, height: 16 });
    if (icon.isEmpty()) {
      console.warn('[Tray] Icon is empty, skipping tray creation');
      return;
    }
    tray = new Tray(icon);
    tray.setToolTip('The Truth Untold — Th!nc');
    const menu = Menu.buildFromTemplate([
      { label: '열기 / Open', click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } } },
      { type: 'separator' },
      { label: '종료 / Quit', click: () => app.quit() }
    ]);
    tray.setContextMenu(menu);
    tray.on('double-click', () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } });
    console.log('[Tray] System tray icon created');
  } catch (e) {
    console.warn('[Tray] Skipped:', e.message);
  }
}

// ── 메뉴바 ───────────────────────────────────────────────────────────────────
function buildMenu() {
  const template = [
    {
      label: '앱 / App',
      submenu: [
        { label: '새로고침', accelerator: 'CmdOrCtrl+R', click: () => mainWindow && mainWindow.reload() },
        { label: '개발자 도구', accelerator: 'F12', click: () => mainWindow && mainWindow.webContents.openDevTools() },
        { type: 'separator' },
        { label: '종료', accelerator: 'CmdOrCtrl+Q', role: 'quit' }
      ]
    },
    {
      label: '창 / Window',
      submenu: [
        { label: '최소화', accelerator: 'CmdOrCtrl+M', role: 'minimize' },
        { label: '최대화 전환', click: () => { if (mainWindow) mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize(); } },
        { type: 'separator' },
        { label: '전체화면', accelerator: 'F11', click: () => { if (mainWindow) mainWindow.setFullScreen(!mainWindow.isFullScreen()); } }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── 앱 초기화 ────────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  createSplash();
  buildMenu();
  createTray();
  setTimeout(() => createMain(), 500);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainShown = false;
      createMain();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('get-app-info', () => ({
  version: app.getVersion(),
  platform: process.platform,
  isElectron: true
}));