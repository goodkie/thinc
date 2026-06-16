const { ipcRenderer } = require('electron');

console.log('[Th!nc-Background-Preload] Injected into watch page:', location.href);

// 유튜브 페이지 내 ytInitialPlayerResponse 객체 추출 및 자막 다운로드 함수
async function extractCaptionsAndReturn() {
  try {
    let ytData = null;
    
    // 1. window context에서 ytInitialPlayerResponse 추출을 위해 DOM 및 window 분석
    // Electron preload는 격리된 컨텍스트(Isolated World)에서 동작하므로, 페이지 메인 컨텍스트(Main World)에 접근하기 위해 스크립트를 인젝션하여 데이터를 꺼내옵니다.
    const scriptContent = `
      (function() {
        try {
          if (window.ytInitialPlayerResponse) {
            document.body.setAttribute('data-thinc-yt-player', JSON.stringify(window.ytInitialPlayerResponse));
          }
        } catch (e) {}
      })();
    `;
    
    const scriptEl = document.createElement('script');
    scriptEl.textContent = scriptContent;
    document.documentElement.appendChild(scriptEl);
    scriptEl.remove();

    const dataAttr = document.body.getAttribute('data-thinc-yt-player');
    if (dataAttr) {
      ytData = JSON.parse(dataAttr);
      document.body.removeAttribute('data-thinc-yt-player');
    }

    if (!ytData || !ytData.captions || !ytData.captions.playerCaptionsTracklistRenderer) {
      throw new Error('No playerCaptionsTracklistRenderer found in player response');
    }

    const tracklist = ytData.captions.playerCaptionsTracklistRenderer;
    const tracks = tracklist.captionTracks || [];

    if (tracks.length === 0) {
      throw new Error('No caption tracks available');
    }

    console.log(`[Th!nc-Background-Preload] Found ${tracks.length} caption tracks.`);

    // 한국어 자막 우선 검색, 없으면 영어 검색, 그 외에는 첫 번째 트랙 선택
    let targetTrack = tracks.find(t => t.languageCode === 'ko');
    if (!targetTrack) targetTrack = tracks.find(t => t.languageCode === 'en');
    if (!targetTrack) targetTrack = tracks[0];

    const targetUrl = targetTrack.baseUrl;
    const lang = targetTrack.languageCode;
    console.log(`[Th!nc-Background-Preload] Selected track: lang=${lang}, url=${targetUrl}`);

    // 유튜브 내부 컨텍스트에서 자막 데이터 fetch (CORS 우회)
    const resp = await fetch(targetUrl + '&fmt=json');
    if (!resp.ok) throw new Error(`Fetch failed with status ${resp.status}`);
    const json = await resp.json();

    // 포맷 변환 (timedtext json -> app standard segments)
    // 유튜브 json 포맷: events -> sevs -> utf8
    const segments = [];
    if (json && Array.isArray(json.events)) {
      json.events.forEach(event => {
        if (!event.segs) return;
        const text = event.segs.map(s => s.utf8).join('').trim();
        if (!text) return;
        
        // 시간 단위: ms -> s
        const offset = event.tStartMs ? Math.round(event.tStartMs) : 0;
        const duration = event.dDurationMs ? Math.round(event.dDurationMs) : 1000;
        segments.push({
          offset, // ms 단위 보존 (desktop.js의 시간 감지 로직에 따름)
          duration,
          text
        });
      });
    }

    console.log(`[Th!nc-Background-Preload] Parsed ${segments.length} segments.`);
    ipcRenderer.send('background-captions-result', { ok: true, videoId: getQueryParam('v'), lang, captions: segments });
  } catch (e) {
    console.warn('[Th!nc-Background-Preload] Caption extraction error:', e.message);
    ipcRenderer.send('background-captions-result', { ok: false, error: e.message, videoId: getQueryParam('v') });
  }
}

function getQueryParam(name) {
  const match = location.search.match(new RegExp('[?&]' + name + '=([^&]+)'));
  return match ? match[1] : null;
}

// 유튜브 watch 페이지가 완전히 로딩되거나 DOMContentLoaded가 완료되었을 때 실행
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  setTimeout(extractCaptionsAndReturn, 1200);
} else {
  window.addEventListener('DOMContentLoaded', () => {
    setTimeout(extractCaptionsAndReturn, 1200);
  });
}
