const { app, BrowserWindow, shell, Menu, Tray, nativeImage, ipcMain } = require('electron');
const path = require('path');
const http = require('http');
const fs   = require('fs');

let splashWindow = null;
let mainWindow   = null;
let tray         = null;
let mainShown    = false;
let localServer  = null;
const LOCAL_PORT = 3939; // 내장 로컬 서버 포트

// ── 내장 HTTP 서버 ────────────────────────────────────────────────────────────
// file:// 대신 http://localhost 로 앱을 서빙 → YouTube 플레이어 오류 153 해결
function startLocalServer(dir, port) {
  const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js':   'application/javascript; charset=utf-8',
    '.css':  'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg':  'image/svg+xml',
    '.ico':  'image/x-icon',
    '.woff2':'font/woff2',
    '.csv':  'text/csv; charset=utf-8',
    '.txt':  'text/plain; charset=utf-8',
  };

  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let urlPath = req.url.split('?')[0];
      if (urlPath === '/' || urlPath === '') urlPath = '/index.html';

      const filePath = path.join(dir, urlPath);

      // server.js 노출 방지
      if (filePath.endsWith('server.js') || filePath.endsWith('main.js') || filePath.endsWith('preload.js')) {
        res.writeHead(403); res.end('Forbidden'); return;
      }

      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not found: ' + urlPath);
          return;
        }
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, {
          'Content-Type': MIME[ext] || 'application/octet-stream',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-store'
        });
        res.end(data);
      });
    });

    server.listen(port, '127.0.0.1', () => {
      console.log(`[LocalServer] Serving on http://127.0.0.1:${port}`);
      resolve(server);
    });

    server.on('error', (e) => {
      console.warn(`[LocalServer] Port ${port} in use, trying ${port + 1}`);
      resolve(startLocalServer(dir, port + 1));
    });
  });
}

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
function createMain(serverPort) {
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
    if (url.startsWith('http') && !url.startsWith(`http://127.0.0.1:${serverPort}`)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // ✅ http://localhost 로 로드 → YouTube 플레이어 오류 153 해결
  mainWindow.loadURL(`http://127.0.0.1:${serverPort}/index.html`);

  // ready-to-show 이벤트: 스플래시 후 1.8초 대기 후 표시
  mainWindow.once('ready-to-show', () => {
    const delay = (splashWindow && !splashWindow.isDestroyed()) ? 1800 : 0;
    setTimeout(showMain, delay);
  });

  // 안전망 타임아웃: 10초 후 무조건 표시
  setTimeout(showMain, 10000);

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
    if (icon.isEmpty()) { console.warn('[Tray] Icon empty, skipping'); return; }
    tray = new Tray(icon);
    tray.setToolTip('The Truth Untold — Th!nc');
    const menu = Menu.buildFromTemplate([
      { label: '열기 / Open', click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } } },
      { type: 'separator' },
      { label: '종료 / Quit', click: () => app.quit() }
    ]);
    tray.setContextMenu(menu);
    tray.on('double-click', () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } });
    console.log('[Tray] Created successfully');
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
app.whenReady().then(async () => {
  // 1. 내장 로컬 서버 먼저 시작
  localServer = await startLocalServer(__dirname, LOCAL_PORT);
  const serverPort = localServer.address().port;
  console.log(`[App] Local server running on port ${serverPort}`);

  // 2. UI 생성
  createSplash();
  buildMenu();
  createTray();
  setTimeout(() => createMain(serverPort), 500);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainShown = false;
      createMain(serverPort);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (localServer) localServer.close();
    app.quit();
  }
});

ipcMain.handle('get-app-info', () => ({
  version: app.getVersion(),
  platform: process.platform,
  isElectron: true
}));