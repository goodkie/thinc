const { ipcRenderer } = require('electron');

console.log('[Th!nc-Background-Preload] Injected into watch page:', location.href);

// 유튜브 페이지 내 ytInitialPlayerResponse 객체 추출 및 자막 다운로드 함수
async function extractCaptionsAndReturn() {
  const videoId = getQueryParam('v');
  console.log(`[Th!nc-Background-Preload] Caption extraction started for video: ${videoId}`);

  let attempts = 0;
  const maxAttempts = 15; // 15 * 300ms = 4.5s
  
  const pollForCaptions = async () => {
    try {
      let ytData = null;

      // 1. DOM attribute extraction from Main World
      const scriptContent = `
        (function() {
          try {
            let resp = window.ytInitialPlayerResponse;
            if (!resp && window.ytplayer && window.ytplayer.config && window.ytplayer.config.args) {
              resp = window.ytplayer.config.args.raw_player_response;
            }
            if (!resp && window.ytplayer) {
              resp = window.ytplayer.bootstrapPlayerResponse;
            }
            if (resp) {
              document.body.setAttribute('data-thinc-yt-player', JSON.stringify(resp));
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

      // 2. Regex backup extraction from raw HTML
      if (!ytData || !ytData.captions) {
        const html = document.documentElement.innerHTML;
        const matches = html.match(/ytInitialPlayerResponse\s*=\s*({.+?});/);
        if (matches) {
          try { ytData = JSON.parse(matches[1]); } catch(e) {}
        }
        if (!ytData || !ytData.captions) {
          const matches2 = html.match(/ytInitialPlayerResponse\s*=\s*({.+?})\s*</);
          if (matches2) {
            try { ytData = JSON.parse(matches2[1]); } catch(e) {}
          }
        }
      }

      // If captions found, extract it!
      if (ytData && ytData.captions && ytData.captions.playerCaptionsTracklistRenderer) {
        const tracklist = ytData.captions.playerCaptionsTracklistRenderer;
        const tracks = tracklist.captionTracks || [];
        if (tracks.length > 0) {
          let targetTrack = tracks.find(t => t.languageCode === 'ko');
          if (!targetTrack) targetTrack = tracks.find(t => t.languageCode === 'en');
          if (!targetTrack) targetTrack = tracks[0];

          const targetUrl = targetTrack.baseUrl;
          const lang = targetTrack.languageCode;
          console.log(`[Th!nc-Background-Preload] Selected local track: lang=${lang}, url=${targetUrl}`);

          const resp = await fetch(targetUrl + '&fmt=json');
          if (resp.ok) {
            const json = await resp.json();
            const segments = parseCaptionsJson(json);
            if (segments.length > 0) {
              console.log(`[Th!nc-Background-Preload] Local scrape success. Parsed ${segments.length} segments.`);
              ipcRenderer.send('background-captions-result', { ok: true, videoId, lang, captions: segments });
              return true;
            }
          }
        }
      }
    } catch (e) {
      console.warn('[Th!nc-Background-Preload] Local poll attempt fail:', e.message);
    }
    return false;
  };

  const parseCaptionsJson = (json) => {
    const segments = [];
    if (json && Array.isArray(json.events)) {
      json.events.forEach(event => {
        if (!event.segs) return;
        const text = event.segs.map(s => s.utf8).join('').trim();
        if (!text) return;
        const offset = event.tStartMs ? Math.round(event.tStartMs) : 0;
        const duration = event.dDurationMs ? Math.round(event.dDurationMs) : 1000;
        segments.push({ offset, duration, text });
      });
    }
    return segments;
  };

  // Start polling
  for (attempts = 0; attempts < maxAttempts; attempts++) {
    const success = await pollForCaptions();
    if (success) return;
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  // === 3. Fallback: Request captions from official backend server ===
  console.log(`[Th!nc-Background-Preload] Local scraper failed for ${videoId}. Initiating official backend fallback...`);
  try {
    const backendUrl = `https://thinc-lie-detector-production.up.railway.app/api/captions?id=${videoId}`;
    const resp = await fetch(backendUrl);
    if (resp.ok) {
      const data = await resp.json();
      // 백엔드는 { captions: [...] } 객체를 반환하므로 배열 혹은 객체 내부의 captions 배열을 추출하도록 대응
      const rawCaptions = Array.isArray(data) ? data : (data?.captions || []);
      if (rawCaptions && rawCaptions.length > 0) {
        const segments = rawCaptions.map(item => ({
          offset: Math.round((item.start || 0) * 1000),
          duration: Math.round((item.duration || 1) * 1000),
          text: item.text || ''
        }));
        console.log(`[Th!nc-Background-Preload] Backend fallback success. Loaded ${segments.length} segments.`);
        ipcRenderer.send('background-captions-result', { ok: true, videoId, lang: data.lang || 'ko', captions: segments });
        return;
      }
    }
  } catch (backendErr) {
    console.warn('[Th!nc-Background-Preload] Backend fallback also failed:', backendErr.message);
  }

  // If all failed
  ipcRenderer.send('background-captions-result', { ok: false, error: 'All scraping methods failed', videoId });
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
