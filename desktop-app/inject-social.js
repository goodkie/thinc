/**
 * Th!nc Social Extension Injection Script (inject-social.js) v2.1
 * 자동 거짓 레이팅 배지 — YouTube(모바일/데스크톱), Facebook, Instagram, TikTok
 * Electron webview.executeJavaScript() 또는 webview preload로 주입됩니다.
 */
(function () {
  // 중복 인젝션 방지
  if (window.__THINC_INJECTED__) return;
  window.__THINC_INJECTED__ = true;

  console.log('[Th!nc-Extension] v2.1 — Script injected on:', location.hostname);

  // ── 백엔드 API 주소 ──────────────────────────────────────────────────────────
  const BACKEND_URL = 'https://thinc-lie-detector-production.up.railway.app';

  // ── 캐시 & 스캔 상태 ─────────────────────────────────────────────────────────
  const ratingCache = new Map();   // videoId → ratingData
  const scanPending = new Set();   // 스캔 중인 videoId

  // ── 배지 스타일 주입 ─────────────────────────────────────────────────────────
  const STYLE_ID = '__thinc_badge_style__';
  if (!document.getElementById(STYLE_ID)) {
    const styleEl = document.createElement('style');
    styleEl.id = STYLE_ID;
    styleEl.textContent = `
      .thinc-badge {
        position: absolute !important;
        top: 6px !important;
        left: 6px !important;
        z-index: 99999 !important;
        padding: 3px 7px !important;
        border-radius: 4px !important;
        font-size: 11px !important;
        font-weight: 700 !important;
        font-family: -apple-system, 'Segoe UI', sans-serif !important;
        text-transform: uppercase !important;
        letter-spacing: 0.4px !important;
        color: #fff !important;
        pointer-events: none !important;
        display: inline-flex !important;
        align-items: center !important;
        gap: 3px !important;
        white-space: nowrap !important;
        line-height: 1.4 !important;
        backdrop-filter: blur(4px) !important;
        -webkit-backdrop-filter: blur(4px) !important;
        animation: thinc-fadein 0.4s ease !important;
      }
      @keyframes thinc-fadein {
        from { opacity: 0; transform: scale(0.85); }
        to   { opacity: 1; transform: scale(1); }
      }
      .thinc-badge.safe   { background: rgba(0,200,83,0.90) !important; border: 1px solid #00e676 !important; box-shadow: 0 0 8px rgba(0,200,83,0.5) !important; }
      .thinc-badge.caution{ background: rgba(255,145,0,0.90) !important; border: 1px solid #ffab40 !important; box-shadow: 0 0 8px rgba(255,145,0,0.5) !important; }
      .thinc-badge.danger { background: rgba(229,28,35,0.92) !important; border: 1px solid #ff5252 !important; box-shadow: 0 0 8px rgba(229,28,35,0.5) !important; }
      .thinc-badge.scanning {
        background: rgba(241, 196, 15, 0.9) !important;
        border: 1px solid #f1c40f !important;
        box-shadow: 0 0 8px rgba(241, 196, 15, 0.5) !important;
        animation: thinc-pulse 1.2s infinite alternate !important;
      }
      @keyframes thinc-pulse {
        0% { opacity: 0.6; }
        100% { opacity: 1.0; }
      }
      /* 컨테이너 relative 보장 */
      ytm-compact-video-renderer, ytm-video-with-context-renderer,
      ytm-media-item, ytm-rich-item-renderer, ytd-rich-grid-media,
      ytd-video-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer {
        position: relative !important;
      }
    `;
    (document.head || document.documentElement).appendChild(styleEl);
  }

  // ── 비디오 ID 추출 ───────────────────────────────────────────────────────────
  function parseVideoId(href) {
    if (!href) return null;
    try {
      const u = new URL(href, location.href);
      // YouTube: /watch?v=, /shorts/ID, youtu.be/ID
      if (u.hostname.includes('youtube.com') || u.hostname.includes('youtu.be')) {
        if (u.searchParams.get('v')) return u.searchParams.get('v');
        const shortsMatch = u.pathname.match(/\/shorts\/([A-Za-z0-9_-]{6,15})/);
        if (shortsMatch) return shortsMatch[1];
        if (u.hostname.includes('youtu.be')) return u.pathname.slice(1).split('/')[0] || null;
      }
      // TikTok
      if (u.hostname.includes('tiktok.com')) {
        const m = u.pathname.match(/\/video\/(\d+)/);
        return m ? m[1] : null;
      }
      // Instagram
      if (u.hostname.includes('instagram.com')) {
        const m = u.pathname.match(/\/reel\/([A-Za-z0-9_-]+)/);
        return m ? m[1] : null;
      }
      // Facebook
      if (u.hostname.includes('facebook.com') || u.hostname.includes('fb.com')) {
        const m = u.pathname.match(/\/(?:videos|watch|video)\/(\d+)/);
        if (m) return m[1];
        if (u.searchParams.get('v')) return u.searchParams.get('v');
      }
    } catch (e) { /* 무시 */ }
    return null;
  }

  // ── 백엔드 API 호출 ──────────────────────────────────────────────────────────
  async function fetchRating(videoId) {
    if (ratingCache.has(videoId)) return ratingCache.get(videoId);
    if (scanPending.has(videoId)) return null;
    scanPending.add(videoId);
    try {
      // no-cors 방지: CORS 활성화된 Railway 백엔드로 요청
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000); // 8초 타임아웃
      const res = await fetch(`${BACKEND_URL}/api/analyze-video-fast?id=${encodeURIComponent(videoId)}`, {
        method: 'GET',
        signal: ctrl.signal,
        cache: 'no-store'
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data && data.ok) {
        ratingCache.set(videoId, data);
        return data;
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        console.warn(`[Th!nc-Extension] Fetch failed for ${videoId}:`, e.message);
      }
    } finally {
      scanPending.delete(videoId);
    }
    return null;
  }

  // ── 스캔 중 배지 주입 ──────────────────────────────────────────────────────────
  function injectScanningBadge(container, videoId) {
    if (!container) return;
    // 이미 일반 배지나 스캔 배지가 붙어 있으면 생략
    if (container.querySelector(`.thinc-badge[data-vid="${videoId}"]`)) return;

    const badge = document.createElement('span');
    badge.className = 'thinc-badge scanning';
    badge.setAttribute('data-vid', videoId);
    badge.textContent = '⏳ 스캔 중';

    const pos = window.getComputedStyle(container).position;
    if (pos === 'static' || pos === '') {
      container.style.position = 'relative';
    }
    container.appendChild(badge);
  }

  // ── 배지 DOM 주입 ────────────────────────────────────────────────────────────
  function injectBadge(container, videoId, data) {
    if (!container) return;
    
    // 기존 스캔 중 배지 삭제
    const scanningBadge = container.querySelector(`.thinc-badge.scanning[data-vid="${videoId}"]`);
    if (scanningBadge) scanningBadge.remove();

    // 이미 다른 배지가 주입되어 있으면 중복 주입하지 않음
    if (container.querySelector(`.thinc-badge[data-vid="${videoId}"]:not(.scanning)`)) return;

    const badge = document.createElement('span');
    badge.className = `thinc-badge ${data.rating}`;
    badge.setAttribute('data-vid', videoId);

    const emoji = data.rating === 'safe' ? '🟢' : data.rating === 'caution' ? '🟡' : '🔴';
    badge.textContent = `${emoji} ${data.badgeText}`;

    // 컨테이너가 static이면 relative로 전환
    const pos = window.getComputedStyle(container).position;
    if (pos === 'static' || pos === '') {
      container.style.position = 'relative';
    }

    container.appendChild(badge);
    console.log(`[Th!nc-Extension] Badge injected: ${data.rating} (${data.badgeText}) for ${videoId}`);
  }

  // ── 썸네일 컨테이너 탐색 헬퍼 ───────────────────────────────────────────────
  function findThumbContainer(linkEl) {
    // 썸네일 이미지나 img 부모를 찾아 올라간다
    const img = linkEl.querySelector('img, ytm-thumbnail-overlay, .ytm-thumbnail, .image-container');
    if (img) return img.closest('a') || img.parentElement || linkEl;
    return linkEl;
  }

  // ── 페이지별 스캐너 ──────────────────────────────────────────────────────────
  function scanYouTube() {
    const hostname = location.hostname; // m.youtube.com or www.youtube.com

    // ─ 모바일 YouTube (m.youtube.com) 카드 선택자 ─
    const mobileSelectors = [
      'ytm-compact-video-renderer',
      'ytm-video-with-context-renderer',
      'ytm-rich-item-renderer',
      'ytm-media-item',
    ];
    // ─ 데스크톱 YouTube 카드 선택자 ─
    const desktopSelectors = [
      'ytd-rich-grid-media',
      'ytd-video-renderer',
      'ytd-compact-video-renderer',
      'ytd-grid-video-renderer',
    ];

    const allSelectors = [...mobileSelectors, ...desktopSelectors].join(', ');
    const cards = document.querySelectorAll(allSelectors);

    cards.forEach(card => {
      // 링크 탐색 우선순위
      const linkEl =
        card.querySelector('a[href*="/watch?v="]') ||
        card.querySelector('a[href*="/shorts/"]') ||
        card.querySelector('a.yt-simple-endpoint') ||
        card.querySelector('a[href]');

      if (!linkEl) return;

      const videoId = parseVideoId(linkEl.getAttribute('href'));
      if (!videoId) return;

      const container = findThumbContainer(linkEl);
      
      // 이미 배지가 있으면 무시
      if (container.querySelector(`.thinc-badge[data-vid="${videoId}"]`)) return;

      injectScanningBadge(container, videoId);
      fetchRating(videoId).then(data => {
        if (data) {
          injectBadge(container, videoId, data);
        } else {
          const sc = container.querySelector(`.thinc-badge.scanning[data-vid="${videoId}"]`);
          if (sc) sc.remove();
        }
      });
    });

    // 폴백: /watch?v= 링크를 직접 스캔 (SPA 라우팅 대응)
    if (cards.length === 0) {
      document.querySelectorAll('a[href*="/watch?v="], a[href*="/shorts/"]').forEach(a => {
        const videoId = parseVideoId(a.getAttribute('href'));
        if (!videoId) return;
        const container = a.closest('figure, li, div[class*="item"], div[class*="card"]') || a;
        if (container.querySelector(`.thinc-badge[data-vid="${videoId}"]`)) return;

        injectScanningBadge(container, videoId);
        fetchRating(videoId).then(data => {
          if (data) {
            injectBadge(container, videoId, data);
          } else {
            const sc = container.querySelector(`.thinc-badge.scanning[data-vid="${videoId}"]`);
            if (sc) sc.remove();
          }
        });
      });
    }
  }

  function scanInstagram() {
    document.querySelectorAll('a[href*="/reel/"]').forEach(a => {
      const videoId = parseVideoId(a.getAttribute('href'));
      if (!videoId) return;
      const container = a.closest('article, div[role="button"]') || a;
      if (container.querySelector(`.thinc-badge[data-vid="${videoId}"]`)) return;

      injectScanningBadge(container, videoId);
      fetchRating(videoId).then(data => {
        if (data) {
          injectBadge(container, videoId, data);
        } else {
          const sc = container.querySelector(`.thinc-badge.scanning[data-vid="${videoId}"]`);
          if (sc) sc.remove();
        }
      });
    });
  }

  function scanTikTok() {
    document.querySelectorAll('a[href*="/video/"]').forEach(a => {
      const videoId = parseVideoId(a.getAttribute('href'));
      if (!videoId) return;
      const container = a.closest('div[class*="item"], li, article') || a;
      if (container.querySelector(`.thinc-badge[data-vid="${videoId}"]`)) return;

      injectScanningBadge(container, videoId);
      fetchRating(videoId).then(data => {
        if (data) {
          injectBadge(container, videoId, data);
        } else {
          const sc = container.querySelector(`.thinc-badge.scanning[data-vid="${videoId}"]`);
          if (sc) sc.remove();
        }
      });
    });
  }

  function scanFacebook() {
    document.querySelectorAll(
      'a[href*="/videos/"], a[href*="/watch/"], a[href*="/video/"], a[href*="?v="]'
    ).forEach(a => {
      const videoId = parseVideoId(a.getAttribute('href'));
      if (!videoId) return;
      const container = a.closest('div[role="article"], div[class*="story"]') || a;
      if (container.querySelector(`.thinc-badge[data-vid="${videoId}"]`)) return;

      injectScanningBadge(container, videoId);
      fetchRating(videoId).then(data => {
        if (data) {
          injectBadge(container, videoId, data);
        } else {
          const sc = container.querySelector(`.thinc-badge.scanning[data-vid="${videoId}"]`);
          if (sc) sc.remove();
        }
      });
    });
  }

  // ── 통합 스캔 디스패처 ───────────────────────────────────────────────────────
  function scanPage() {
    const h = location.hostname;
    try {
      if (h.includes('youtube.com'))   scanYouTube();
      else if (h.includes('instagram.com')) scanInstagram();
      else if (h.includes('tiktok.com'))    scanTikTok();
      else if (h.includes('facebook.com') || h.includes('fb.com')) scanFacebook();
    } catch (e) {
      console.warn('[Th!nc-Extension] scanPage error:', e.message);
    }
  }

  // ── DOM 변화 감시 (디바운스 600ms) ───────────────────────────────────────────
  let debounceTimer = null;
  const observer = new MutationObserver(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(scanPage, 600);
  });

  // body가 준비될 때까지 대기
  function startObserver() {
    const target = document.body || document.documentElement;
    if (!target) { setTimeout(startObserver, 200); return; }
    observer.observe(target, { childList: true, subtree: true });
    // 최초 1.5초 후 스캔 (SPA 초기 렌더 완료 대기)
    setTimeout(scanPage, 1500);
    // 5초 후 한 번 더 (늦게 렌더링되는 카드 대응)
    setTimeout(scanPage, 5000);
    console.log('[Th!nc-Extension] Observer started on', location.hostname);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startObserver);
  } else {
    startObserver();
  }

  // ── 현재 재생 중인 비디오 감지 및 재생 시간 정보 중계 ───────────────────────
  setInterval(() => {
    const vid = document.querySelector('video');
    if (vid) {
      if (!vid.__thincTracked) {
        vid.__thincTracked = true;
        vid.addEventListener('play', () => {
          const videoId = parseVideoId(location.href);
          if (videoId) {
            // console.log으로 부모 렌더러에게 중계
            console.log('[THINC-PLAYBACK]' + JSON.stringify({
              videoId,
              platform: location.hostname
            }));
          }
        });
      }

      // 비디오가 재생 중이면 현재 재생 시간(currentTime)을 주기적으로 부모 렌더러에 중계
      if (!vid.paused && !vid.ended) {
        const videoId = parseVideoId(location.href);
        if (videoId) {
          console.log('[THINC-TIMEUPDATE]' + JSON.stringify({
            videoId,
            currentTime: vid.currentTime,
            platform: location.hostname
          }));
        }
      }

      // 비디오 엘리먼트 대신 부모 플레이어의 스크린 좌표 중계
      const player = vid.closest('.html5-video-player, #movie_player') || vid;
      const rect = player.getBoundingClientRect();
      const isVisible = rect.width > 0 && rect.height > 0 && window.getComputedStyle(vid).display !== 'none';
      if (isVisible) {
        console.log('[THINC-VIDEO-RECT]' + JSON.stringify({
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          windowWidth: window.innerWidth,
          windowHeight: window.innerHeight,
          isVisible: true
        }));
      } else {
        console.log('[THINC-VIDEO-RECT]' + JSON.stringify({ isVisible: false }));
      }
    } else {
      console.log('[THINC-VIDEO-RECT]' + JSON.stringify({ isVisible: false }));
    }
  }, 200);

  // 외부 강제 호출용 바인딩
  window.forceScanPage = function() {
    console.log('[Th!nc-Extension] Force scanning page (clearing cache)...');
    ratingCache.clear();
    
    // 이미 썸네일 컨테이너에 달려 있는 모든 뱃지 DOM 삭제하여 강제 재스캔 유도
    document.querySelectorAll('.thinc-badge').forEach(b => b.remove());
    
    scanPage();
  };
  window.scanPage = scanPage;

})();
