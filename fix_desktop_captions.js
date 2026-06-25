const fs = require('fs');
let content = fs.readFileSync('e:/vivpr/ai/lie/webapp/desktop.js', 'utf8');

const oldProxy = [
  "  const CORS_PROXIES = [",
  "    url => `https://corsproxy.io/?${encodeURIComponent(url)}`,",
  "    url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,",
  "    url => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`",
  "  ];"
].join('\n');

const newProxy = [
  "  const CORS_PROXIES = [",
  "    url => `https://corsproxy.io/?${encodeURIComponent(url)}`,",
  "    url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,",
  "    url => `https://thingproxy.freeboard.io/fetch/${url}`,",
  "    url => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,",
  "    url => `https://corsproxy.org/?${encodeURIComponent(url)}`,",
  "    url => `https://yacdn.org/proxy/${url}`",
  "  ];"
].join('\n');

if (content.includes(oldProxy)) {
  content = content.replace(oldProxy, newProxy);
  console.log('CORS_PROXIES 업데이트됨');
} else {
  console.log('패턴 없음');
}

// Also update loadCaptionsForVideo to add Piped + parseVTT
// Find and insert fetchPipedCaptions and parseVTT after loadCaptionsForVideo
const loadCapEnd = 'captionLoadStatus = \'failed\';\n    console.warn(\'All captions source failed, using mock/VSA mode\');\n    if (window.location.protocol === \'https:\') {\n      showToast(t(\'toast_captions_unavailable_online\'), 8000);\n      // Commented out to prevent blocking user interface on caption load failure.\n      // User is already notified via the 8-second toast message.\n      /*\n      const warningBanner = document.getElementById(\'online-warning-banner\');\n      if (warningBanner) {\n        warningBanner.classList.remove(\'hidden\');\n      }\n      */\n    } else {\n      showToast(t(\'toast_captions_unavailable\'));\n    }\n  }';

const newLoadCapEnd = `captionLoadStatus = 'failed';
    console.warn('All captions sources failed, using VSA mode');
    showToast(t('toast_captions_unavailable_online'), 8000);
  }

  // Fetch captions via Piped API (parallel race across instances)
  async function fetchPipedCaptions(videoId) {
    const PIPED_API_INSTANCES = [
      'https://pipedapi.kavin.rocks',
      'https://piped-api.lunar.icu',
      'https://api.piped.projectsegfau.lt',
      'https://pipedapi.tokhmi.xyz',
      'https://piped-api.garudalinux.org',
      'https://pipedapi.adminforge.de'
    ];
    const shuffled = [...PIPED_API_INSTANCES].sort(() => Math.random() - 0.5).slice(0, 4);
    const results = await Promise.allSettled(
      shuffled.map(api =>
        fetch(\`\${api}/streams/\${videoId}\`, { signal: getTimeoutSignal(4000) })
          .then(r => r.ok ? r.json() : null)
          .then(data => {
            if (!data || !data.subtitles || data.subtitles.length === 0) throw new Error('no subs');
            return data.subtitles;
          })
      )
    );
    let subtitles = null;
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) { subtitles = r.value; break; }
    }
    if (!subtitles) throw new Error('No Piped subtitles found');
    let track = subtitles.find(s => s.code === 'ko' || s.languageCode === 'ko');
    if (!track) track = subtitles.find(s => s.code === 'en' || s.languageCode === 'en');
    if (!track) track = subtitles[0];
    if (!track || !track.url) throw new Error('No valid Piped subtitle track');
    let vttUrl = track.url;
    if (!vttUrl.startsWith('http')) vttUrl = 'https:' + vttUrl;
    let vtt = null;
    try {
      const r = await fetch(vttUrl, { signal: getTimeoutSignal(5000) });
      if (r.ok) vtt = await r.text();
    } catch (e) {}
    if (!vtt) vtt = await fetchViaCORSProxy(vttUrl);
    if (!vtt || vtt.length < 30) throw new Error('Piped VTT empty');
    return parseVTT(vtt);
  }

  // Parse WebVTT text into caption segments
  function parseVTT(vttText) {
    const lines = vttText.split(/\\r?\\n/);
    const segments = [];
    let currentSeg = null;
    const timeRegex = /(\\d{2}):(\\d{2}):(\\d{2})[.,](\\d{3})\\s*-->\\s*(\\d{2}):(\\d{2}):(\\d{2})[.,](\\d{3})/;
    const shortTimeRegex = /(\\d{2}):(\\d{2})[.,](\\d{3})\\s*-->\\s*(\\d{2}):(\\d{2})[.,](\\d{3})/;
    function toSec(h, m, s, ms) { return +h*3600 + +m*60 + +s + +ms/1000; }
    function toSecShort(m, s, ms) { return +m*60 + +s + +ms/1000; }
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      let m = t.match(timeRegex);
      if (m) {
        if (currentSeg) segments.push(currentSeg);
        currentSeg = { start: Math.round(toSec(m[1],m[2],m[3],m[4])), dur: Math.max(1, Math.round(toSec(m[5],m[6],m[7],m[8]) - toSec(m[1],m[2],m[3],m[4]))), text: '' };
        continue;
      }
      m = t.match(shortTimeRegex);
      if (m) {
        if (currentSeg) segments.push(currentSeg);
        currentSeg = { start: Math.round(toSecShort(m[1],m[2],m[3])), dur: Math.max(1, Math.round(toSecShort(m[4],m[5],m[6]) - toSecShort(m[1],m[2],m[3]))), text: '' };
        continue;
      }
      if (currentSeg && !t.startsWith('WEBVTT') && !t.startsWith('NOTE') && !/^\\d+$/.test(t) && !t.startsWith('X-TIMESTAMP')) {
        const cleaned = t.replace(/<[^>]+>/g, '').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&nbsp;/g,' ').trim();
        if (cleaned) currentSeg.text += (currentSeg.text ? ' ' : '') + cleaned;
      }
    }
    if (currentSeg && currentSeg.text) segments.push(currentSeg);
    return segments.filter(s => s.text.trim().length > 0);
  }`;

if (content.includes(loadCapEnd)) {
  content = content.replace(loadCapEnd, newLoadCapEnd);
  console.log('loadCaptionsForVideo 업데이트됨 (Piped + parseVTT 추가)');
} else {
  console.log('loadCaptionsForVideo 패턴 없음 - 수동 확인 필요');
}

// Also insert Piped captions attempt into loadCaptionsForVideo
const oldPipedInsert = "    // 2. Try official YouTube timedtext XML API directly via CORS proxy\n    try {\n      const resData = await fetchYoutubeTimedTextOfficialFrontend(videoId);";
const newPipedInsert = `    // 2. Try Piped API captions (fastest, no CORS issue)
    try {
      const captions = await fetchPipedCaptions(videoId);
      if (captions && captions.length > 0) {
        liveCaptions = captions;
        captionLoadStatus = 'loaded';
        showToast(t('toast_captions_loaded').replace('{lang}', 'Piped').replace('{count}', captions.length));
        return;
      }
    } catch (err) {
      console.warn('Piped captions failed:', err.message);
    }

    // 3. Try YouTube watch page scraping via CORS proxy
    try {
      const captions = await fetchYoutubeCaptionsOfficialFrontend(videoId);
      if (captions && captions.length > 0) {
        liveCaptions = captions;
        captionLoadStatus = 'loaded';
        showToast(t('toast_captions_loaded').replace('{lang}', '공식 자막').replace('{count}', captions.length));
        return;
      }
    } catch (err) {
      console.warn('YouTube watch page captions failed:', err.message);
    }

    // 4. Try official YouTube timedtext API via CORS proxy
    try {
      const resData = await fetchYoutubeTimedTextOfficialFrontend(videoId);`;

if (content.includes(oldPipedInsert)) {
  content = content.replace(oldPipedInsert, newPipedInsert);
  console.log('Piped 자막 시도 삽입됨');
} else {
  console.log('Piped 삽입 패턴 없음');
}

fs.writeFileSync('e:/vivpr/ai/lie/webapp/desktop.js', content, 'utf8');
console.log('desktop.js 저장 완료');
