const { contextBridge, ipcRenderer } = require('electron');
const fs   = require('fs');
const path = require('path');

// ── inject-social.js 내용을 preload 최상위 레벨에서 미리 읽어 캐시 ──
// contextBridge 콜백 내부에서 require/fs는 사용 불가 → 여기서 미리 읽어야 함
let _injectSocialScript = '';
try {
  _injectSocialScript = fs.readFileSync(path.join(__dirname, 'inject-social.js'), 'utf8');
} catch (e) {
  console.error('[Preload] inject-social.js 읽기 실패:', e.message);
}

contextBridge.exposeInMainWorld('electronAPI', {
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  isElectron: true,
  platform: process.platform,
  
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),
  
  // 백그라운드 자막 획득 IPC
  fetchBackgroundCaptions: (videoId) => ipcRenderer.invoke('fetch-background-captions', videoId),
  // 유튜브 로그인 팝업 모달 요청 IPC
  openYoutubeLogin: () => ipcRenderer.send('open-youtube-login'),
  
  // 백그라운드 웹뷰로부터 온 이벤트를 렌더러에서 수신
  onVideoPlaybackStarted: (callback) => {
    ipcRenderer.removeAllListeners('video-playback-started');
    ipcRenderer.on('video-playback-started', (event, data) => callback(data));
  },
  
  // inject-social.js 내용 반환 (preload 최상위에서 미리 읽은 값을 동기 반환)
  readSocialInjectScript: () => _injectSocialScript,
});