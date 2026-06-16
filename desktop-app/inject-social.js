/**
 * Th!nc Social Extension Injection Script (inject-social.js)
 * Designed for YouTube, Facebook, Instagram, and TikTok official webviews.
 */
(function() {
  console.log('[Th!nc-Extension] Script injected successfully.');

  // 백엔드 API 주소 (실제 배포된 주소 또는 로컬 주소, Electron 메인에서 주입 가능하도록 설계)
  let backendUrl = 'https://thinc-lie-detector-production.up.railway.app';
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    backendUrl = 'http://localhost:8080';
  }

  // 캐시 및 스캔 중인 동영상 상태 관리
  const ratingCache = new Map(); // videoId -> ratingData
  const activeScans = new Set(); // videoId

  // --- 스타일 시트 인젝션 (아름다운 네온 3색 배지 스타일) ---
  const styleEl = document.createElement('style');
  styleEl.innerHTML = `
    .thinc-rating-badge {
      position: absolute;
      top: 8px;
      left: 8px;
      z-index: 9999;
      padding: 4px 8px;
      border-radius: 4px;
      font-family: 'Inter', sans-serif;
      font-size: 11px;
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #ffffff;
      box-shadow: 0 0 10px rgba(0,0,0,0.5);
      pointer-events: none;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      transition: all 0.3s ease;
    }
    .thinc-rating-badge.rating-safe {
      background: rgba(0, 200, 83, 0.85);
      border: 1px solid #00c853;
      box-shadow: 0 0 8px rgba(0, 200, 83, 0.4);
      text-shadow: 0 0 2px #00c853;
    }
    .thinc-rating-badge.rating-caution {
      background: rgba(255, 145, 0, 0.85);
      border: 1px solid #ff9100;
      box-shadow: 0 0 8px rgba(255, 145, 0, 0.4);
      text-shadow: 0 0 2px #ff9100;
    }
    .thinc-rating-badge.rating-danger {
      background: rgba(255, 23, 68, 0.85);
      border: 1px solid #ff1744;
      box-shadow: 0 0 8px rgba(255, 23, 68, 0.4);
      text-shadow: 0 0 2px #ff1744;
    }
    /* 각 소셜 플랫폼별 썸네일 오버레이 포지셔닝 대응 */
    ytd-rich-grid-media, ytd-video-renderer, ytd-compact-video-renderer, .style-scope.ytd-grid-video-renderer {
      position: relative;
    }
    .tiktok-video-card-container, .instagram-reel-card, .facebook-video-card {
      position: relative;
    }
  `;
  document.head.appendChild(styleEl);

  // --- 비디오 ID 파서 및 매핑 규칙 ---
  function extractVideoId(url) {
    if (!url) return null;
    try {
      const parsed = new URL(url, location.href);
      if (parsed.hostname.includes('youtube.com')) {
        return parsed.searchParams.get('v');
      } else if (parsed.hostname.includes('youtu.be')) {
        return parsed.pathname.substring(1);
      } else if (parsed.pathname.includes('/watch')) {
        const match = parsed.search.match(/v=([^&]+)/);
        return match ? match[1] : null;
      } else if (parsed.pathname.includes('/shorts/')) {
        const parts = parsed.pathname.split('/shorts/');
        return parts[1] ? parts[1].split('?')[0] : null;
      } else if (parsed.hostname.includes('tiktok.com') && parsed.pathname.includes('/video/')) {
        const parts = parsed.pathname.split('/video/');
        return parts[1] ? parts[1].split('?')[0] : null;
      } else if (parsed.hostname.includes('instagram.com') && parsed.pathname.includes('/reel/')) {
        const parts = parsed.pathname.split('/reel/');
        return parts[1] ? parts[1].split('/')[0] : null;
      } else if (parsed.hostname.includes('facebook.com') && (parsed.pathname.includes('/videos/') || parsed.pathname.includes('/watch/'))) {
        const match = parsed.pathname.match(/\/(?:videos|watch)\/([0-9]+)/);
        return match ? match[1] : null;
      }
    } catch (e) {}
    return null;
  }

  // --- 백그라운드 스캔 비동기 쿼리 ---
  async function fetchRating(videoId) {
    if (ratingCache.has(videoId)) return ratingCache.get(videoId);
    if (activeScans.has(videoId)) return null;

    activeScans.add(videoId);
    try {
      const response = await fetch(`${backendUrl}/api/analyze-video-fast?id=${videoId}`);
      if (!response.ok) throw new Error('API response fail');
      const data = await response.json();
      ratingCache.set(videoId, data);
      return data;
    } catch (e) {
      console.warn(`[Th!nc-Extension] Scan failed for ${videoId}:`, e.message);
      return null;
    } finally {
      activeScans.delete(videoId);
    }
  }

  // --- 배지 DOM 주입 ---
  function injectBadge(containerElement, videoId, data) {
    if (!containerElement || containerElement.querySelector('.thinc-rating-badge')) return;

    // 배지 생성
    const badge = document.createElement('div');
    badge.className = `thinc-rating-badge rating-${data.rating}`;
    
    let emoji = '🟢';
    if (data.rating === 'caution') emoji = '🟡';
    else if (data.rating === 'danger') emoji = '🔴';

    badge.innerHTML = `${emoji} ${data.badgeText}`;
    
    // 절대 위치 지원을 위한 relative 클래스 강제
    if (window.getComputedStyle(containerElement).position === 'static') {
      containerElement.style.position = 'relative';
    }

    containerElement.appendChild(badge);
    console.log(`[Th!nc-Extension] Injected badge: ${data.rating} for video: ${videoId}`);
  }

  // --- 화면 노출 영상 스캐너 기동 ---
  function scanPageElements() {
    const hostname = location.hostname;

    if (hostname.includes('youtube.com')) {
      // YouTube 데스크톱 및 모바일 타깃 카드들
      const videoElements = document.querySelectorAll('ytd-rich-grid-media, ytd-video-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer, ytm-video-with-context-renderer');
      videoElements.forEach(el => {
        const linkEl = el.querySelector('a#thumbnail, a.yt-simple-endpoint, a[href*="/watch"], a[href*="/shorts"]');
        if (linkEl) {
          const videoId = extractVideoId(linkEl.getAttribute('href'));
          const thumbEl = el.querySelector('#thumbnail, .ytm-video-thumbnail-container, ytm-thumbnail-overlay');
          if (videoId && thumbEl) {
            fetchRating(videoId).then(data => {
              if (data) injectBadge(thumbEl, videoId, data);
            });
          }
        }
      });
    } else if (hostname.includes('instagram.com')) {
      // Instagram Reels 카드들
      const reelCards = document.querySelectorAll('a[href*="/reel/"]');
      reelCards.forEach(el => {
        const videoId = extractVideoId(el.getAttribute('href'));
        if (videoId) {
          fetchRating(videoId).then(data => {
            if (data) injectBadge(el, videoId, data);
          });
        }
      });
    } else if (hostname.includes('tiktok.com')) {
      // TikTok 포스트들
      const tiktokCards = document.querySelectorAll('a[href*="/video/"]');
      tiktokCards.forEach(el => {
        const videoId = extractVideoId(el.getAttribute('href'));
        if (videoId) {
          fetchRating(videoId).then(data => {
            if (data) injectBadge(el, videoId, data);
          });
        }
      });
    } else if (hostname.includes('facebook.com')) {
      // Facebook 동영상 카드들
      const fbCards = document.querySelectorAll('a[href*="/videos/"], a[href*="/watch/"]');
      fbCards.forEach(el => {
        const videoId = extractVideoId(el.getAttribute('href'));
        if (videoId) {
          fetchRating(videoId).then(data => {
            if (data) injectBadge(el, videoId, data);
          });
        }
      });
    }
  }

  // --- 실시간 DOM 변화 감시 및 디바운스 기동 ---
  let scanTimeout = null;
  const observer = new MutationObserver(() => {
    if (scanTimeout) clearTimeout(scanTimeout);
    scanTimeout = setTimeout(scanPageElements, 600); // 600ms 디바운스로 스크롤/로딩 병목 방지
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  // 최초 로드 즉시 스캔
  setTimeout(scanPageElements, 1000);

  // --- 재생 비디오 음성/자막 추출 연동 (VSA 및 가로채기 기본 포석) ---
  setInterval(() => {
    const activeVideo = document.querySelector('video');
    if (activeVideo && !activeVideo.dataset.thincTracked) {
      activeVideo.dataset.thincTracked = 'true';
      console.log('[Th!nc-Extension] Found playing video element, binding events.');

      activeVideo.addEventListener('play', () => {
        const videoId = extractVideoId(location.href);
        if (videoId) {
          console.log('[Th!nc-Extension] Video playback detected:', videoId);
          if (window.ipcRenderer) {
            window.ipcRenderer.send('video-playback-started', { videoId, platform: location.hostname });
          } else {
            const event = new CustomEvent('thinc-video-play', { detail: { videoId, platform: location.hostname } });
            window.dispatchEvent(event);
          }
        }
      });
    }
  }, 1500);

})();
