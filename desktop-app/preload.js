const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  isElectron: true,
  platform: process.platform,
  
  // 백그라운드 자막 획득 IPC
  fetchBackgroundCaptions: (videoId) => ipcRenderer.invoke('fetch-background-captions', videoId),
  // 유튜브 로그인 팝업 모달 요청 IPC
  openYoutubeLogin: () => ipcRenderer.send('open-youtube-login'),
  
  // 백그라운드 웹뷰로부터 온 이벤트를 렌더러에서 수신
  onVideoPlaybackStarted: (callback) => {
    ipcRenderer.removeAllListeners('video-playback-started');
    ipcRenderer.on('video-playback-started', (event, data) => callback(data));
  },
  
  // 신규: inject-social.js 파일 내용을 읽어서 반환하는 API
  readSocialInjectScript: () => {
    const fs = require('fs');
    const path = require('path');
    try {
      return fs.readFileSync(path.join(__dirname, 'inject-social.js'), 'utf8');
    } catch (e) {
      console.error('Failed to read inject-social.js:', e.message);
      return '';
    }
  }
});