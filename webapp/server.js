const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { YoutubeTranscript } = require('youtube-transcript');

// --- Failed Nodes Blacklist Cache ---
const failedNodesCache = new Map(); // hostname -> timestamp
const BLACKLIST_DURATION = 1 * 60 * 60 * 1000; // 1 Hour

// --- Admin Settings Server-Side Store ---
// 어드민이 온라인에서 설정하면 모든 클라이언트(데스크톱/모바일/웹)에 실시간 반영
const ADMIN_SETTINGS_FILE = path.join(__dirname, 'admin_settings.json');
let _adminSettingsCache = null;

function loadAdminSettingsFromDisk() {
  try {
    if (fs.existsSync(ADMIN_SETTINGS_FILE)) {
      const raw = fs.readFileSync(ADMIN_SETTINGS_FILE, 'utf8');
      _adminSettingsCache = JSON.parse(raw);
      console.log('[AdminSettings] Loaded from disk');
    }
  } catch (e) {
    console.warn('[AdminSettings] Failed to load from disk:', e.message);
  }
}
loadAdminSettingsFromDisk();

function handleAdminSettings(req, res) {
  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  };

  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS); res.end(); return;
  }

  if (req.method === 'GET') {
    // 모든 클라이언트가 읽기 가능
    res.writeHead(200, CORS);
    res.end(JSON.stringify({ ok: true, settings: _adminSettingsCache || null, updatedAt: _adminSettingsCache ? _adminSettingsCache._updatedAt : null }));
    return;
  }

  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        // 선택적 비밀번호 보호: X-Admin-Token 헤더 또는 payload.adminToken
        const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
        if (ADMIN_TOKEN) {
          const provided = req.headers['x-admin-token'] || payload.adminToken || '';
          if (provided !== ADMIN_TOKEN) {
            res.writeHead(401, CORS);
            res.end(JSON.stringify({ ok: false, error: 'Unauthorized' }));
            return;
          }
        }
        // adminToken 필드는 저장하지 않음
        delete payload.adminToken;
        payload._updatedAt = new Date().toISOString();
        _adminSettingsCache = payload;
        // 디스크에 영속 저장
        fs.writeFile(ADMIN_SETTINGS_FILE, JSON.stringify(payload, null, 2), e => {
          if (e) console.warn('[AdminSettings] Disk save failed:', e.message);
          else console.log('[AdminSettings] Saved to disk at', payload._updatedAt);
        });
        console.log('[AdminSettings] Updated by admin at', payload._updatedAt);
        res.writeHead(200, CORS);
        res.end(JSON.stringify({ ok: true, updatedAt: payload._updatedAt }));
      } catch (e) {
        res.writeHead(400, CORS);
        res.end(JSON.stringify({ ok: false, error: 'Invalid JSON: ' + e.message }));
      }
    });
    return;
  }

  res.writeHead(405, CORS);
  res.end(JSON.stringify({ ok: false, error: 'Method Not Allowed' }));
}

function markNodeFailed(nodeUrl) {
  try {
    const domain = new URL(nodeUrl).hostname;
    failedNodesCache.set(domain, Date.now());
    console.log(`[Blacklist] Marked ${domain} as failed (temporarily blocked from fallback list)`);
  } catch (e) {
    console.warn("markNodeFailed warning:", e.message);
  }
}

function isNodeBlacklisted(nodeUrl) {
  try {
    const domain = new URL(nodeUrl).hostname;
    if (failedNodesCache.has(domain)) {
      const timestamp = failedNodesCache.get(domain);
      if (Date.now() - timestamp < BLACKLIST_DURATION) {
        return true;
      } else {
        failedNodesCache.delete(domain);
      }
    }
  } catch (e) {}
  return false;
}

const PORT = process.env.PORT || 8080;
const PUBLIC_DIR = path.join(__dirname);

function serveStatic(res, filePath) {
  let ext = path.extname(filePath).toLowerCase();
  let contentType = 'text/html; charset=utf-8';
  
  if (ext === '.css') contentType = 'text/css; charset=utf-8';
  else if (ext === '.js') contentType = 'application/javascript; charset=utf-8';
  else if (ext === '.json') contentType = 'application/json; charset=utf-8';
  else if (ext === '.png') contentType = 'image/png';
  else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
  else if (ext === '.ico') contentType = 'image/x-icon';
  else if (ext === '.svg') contentType = 'image/svg+xml';
  else if (ext === '.woff2') contentType = 'font/woff2';

  // Prevent serving server.js itself
  if (filePath.endsWith('server.js')) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error: ' + err.code);
      }
    } else {
      res.writeHead(200, { 
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
      });
      res.end(content);
    }
  });
}

function handleSearch(req, res) {
  const parsedUrl = url.parse(req.url, true);
  const query = parsedUrl.query.q || '';
  const hl = parsedUrl.query.hl || 'en';
  
  if (!query) {
    res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: 'Missing query parameter q' }));
    return;
  }

  const gl = hl === 'ko' ? 'KR' : 'US';
  const ytUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&hl=${hl}&gl=${gl}`;
  
  const langHeader = hl === 'ko' ? 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7' : `${hl},en;q=0.9`;
  const options = {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': langHeader
    }
  };

  https.get(ytUrl, options, (ytRes) => {
    let dataBuffer = '';
    
    ytRes.on('data', (chunk) => {
      dataBuffer += chunk;
    });
    
    ytRes.on('end', () => {
      try {
        let jsonStr = null;
        const startMark = "ytInitialData = ";
        const startIdx = dataBuffer.indexOf(startMark);
        
        if (startIdx !== -1) {
          const endIdx = dataBuffer.indexOf("};", startIdx);
          if (endIdx !== -1) {
            jsonStr = dataBuffer.substring(startIdx + startMark.length, endIdx + 1);
          }
        }
        
        if (!jsonStr) {
          const altMark = 'window["ytInitialData"] = ';
          const altIdx = dataBuffer.indexOf(altMark);
          if (altIdx !== -1) {
            const endIdx = dataBuffer.indexOf("};", altIdx);
            if (endIdx !== -1) {
              jsonStr = dataBuffer.substring(altIdx + altMark.length, endIdx + 1);
            }
          }
        }

        if (!jsonStr) {
          throw new Error('ytInitialData not found in YouTube response HTML');
        }

        const parsedData = JSON.parse(jsonStr);
        const sections = parsedData?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents;
        if (!sections || sections.length === 0) {
          throw new Error('Empty sections inside search results');
        }

        const videos = [];
        const seenIds = new Set();

        for (const section of sections) {
          let items = section?.itemSectionRenderer?.contents;
          if (!items && section?.shelfRenderer?.content?.verticalListRenderer?.items) {
            items = section.shelfRenderer.content.verticalListRenderer.items;
          }
          
          if (items && Array.isArray(items)) {
            for (const item of items) {
              const vr = item.videoRenderer;
              if (vr && vr.videoId && !seenIds.has(vr.videoId)) {
                seenIds.add(vr.videoId);
                const title = vr.title?.runs?.[0]?.text || vr.title?.simpleText || "Unknown Title";
                const channel = vr.ownerText?.runs?.[0]?.text || vr.longBylineText?.runs?.[0]?.text || "Unknown Channel";
                const views = vr.viewCountText?.simpleText || vr.viewCountText?.runs?.[0]?.text || "0 views";
                const duration = vr.lengthText?.simpleText || "00:00";

                videos.push({
                  id: vr.videoId,
                  title,
                  channel,
                  views: views.replace("조회수", "").trim(),
                  duration
                });
              }
            }
          }
        }

        if (videos.length === 0) {
          const firstSectionContents = sections[0]?.itemSectionRenderer?.contents;
          if (firstSectionContents && Array.isArray(firstSectionContents)) {
            for (const item of firstSectionContents) {
              if (item.videoRenderer) {
                const vr = item.videoRenderer;
                if (vr.videoId && !seenIds.has(vr.videoId)) {
                  seenIds.add(vr.videoId);
                  const title = vr.title?.runs?.[0]?.text || "Unknown Title";
                  const channel = vr.ownerText?.runs?.[0]?.text || vr.longBylineText?.runs?.[0]?.text || "Unknown Channel";
                  const views = vr.viewCountText?.simpleText || vr.viewCountText?.runs?.[0]?.text || "0 views";
                  const duration = vr.lengthText?.simpleText || "00:00";
                  videos.push({
                    id: vr.videoId,
                    title,
                    channel,
                    views: views.replace("조회수", "").trim(),
                    duration
                  });
                }
              }
            }
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify(videos));

      } catch (err) {
        console.error('YouTube parse error:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ error: 'Failed to parse YouTube results', details: err.message }));
      }
    });
    
  }).on('error', (err) => {
    console.error('HTTPS request error:', err.message);
    res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: 'Failed to fetch YouTube page', details: err.message }));
  });
}

// WebVTT / XML Caption Fallback scrapers
async function fetchYoutubeTimedTextOfficialBackend(videoId) {
  const listUrl = `https://www.youtube.com/api/timedtext?v=${videoId}&type=list`;
  const options = {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
    }
  };
  
  let listXml = '';
  try {
    listXml = await new Promise((resolve, reject) => {
      https.get(listUrl, options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
      }).on('error', reject);
    });
  } catch (e) {
    console.warn("Failed to fetch timedtext list on backend:", e.message);
  }

  let targetLang = 'ko';
  let track = null;

  if (listXml) {
    const trackRegex = /<track\s+[^>]*lang_code="([^"]+)"(?:\s+[^>]*name="([^"]*)")?(?:\s+[^>]*kind="([^"]*)")?[^>]*>/gi;
    let trackMatch;
    const trackList = [];
    while ((trackMatch = trackRegex.exec(listXml)) !== null) {
      trackList.push({
        lang: trackMatch[1],
        name: trackMatch[2] || '',
        kind: trackMatch[3] || ''
      });
    }
    if (trackList.length > 0) {
      track = trackList.find(t => t.lang === 'ko');
      if (!track) track = trackList.find(t => t.lang === 'en');
      if (!track) track = trackList[0];
      if (track) targetLang = track.lang;
    }
  }

  const subUrls = [];
  if (track) {
    let subUrl = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${track.lang}&fmt=srv1`;
    if (track.name) subUrl += `&name=${encodeURIComponent(track.name)}`;
    if (track.kind) subUrl += `&kind=${encodeURIComponent(track.kind)}`;
    subUrls.push(subUrl);
  } else {
    subUrls.push(`https://www.youtube.com/api/timedtext?v=${videoId}&lang=ko&fmt=srv1`);
    subUrls.push(`https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&fmt=srv1`);
    subUrls.push(`https://www.youtube.com/api/timedtext?v=${videoId}&lang=ko&kind=asr&fmt=srv1`);
    subUrls.push(`https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&kind=asr&fmt=srv1`);
  }

  for (const url of subUrls) {
    try {
      const xml = await new Promise((resolve, reject) => {
        https.get(url, options, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => resolve(data));
        }).on('error', reject);
      });

      if (xml && xml.includes('<text')) {
        const regex = /<text\s+start="([\d.]+)"\s+dur="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/gi;
        let match;
        const segments = [];
        while ((match = regex.exec(xml)) !== null) {
          const start = parseFloat(match[1]);
          const dur = parseFloat(match[2]);
          let text = match[3]
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/<\/?[^>]+(>|$)/g, "")
            .trim();
          
          segments.push({
            start: Math.round(start),
            dur: Math.max(1, Math.round(dur)),
            text: text.replace(/\n/g, ' ')
          });
        }
        if (segments.length > 0) {
          return { lang: targetLang, captions: segments };
        }
      }
    } catch (err) {
      console.warn(`Timedtext backend fetch failed for ${url}:`, err.message);
    }
  }
  throw new Error("All timedtext backend attempts failed");
}

async function fetchYoutubeCaptionsFallback(videoId) {
  const pageUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const options = {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
      'Cache-Control': 'max-age=0',
      'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1'
    }
  };
  
  const html = await new Promise((resolve, reject) => {
    https.get(pageUrl, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
  
  let captionTracks = null;
  
  // Method 1: parse ytInitialPlayerResponse
  const responseMark = 'ytInitialPlayerResponse = ';
  const responseIdx = html.indexOf(responseMark);
  if (responseIdx !== -1) {
    const endIdx = html.indexOf('};', responseIdx);
    if (endIdx !== -1) {
      const rawResponse = html.substring(responseIdx + responseMark.length, endIdx + 1);
      try {
        const parsed = JSON.parse(rawResponse);
        captionTracks = parsed?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      } catch(e) {
        console.warn("Failed parsing ytInitialPlayerResponse on backend fallback:", e.message);
      }
    }
  }
  
  // Method 2: Search for "captionTracks" directly in HTML
  if (!captionTracks) {
    const trackMark = '"captionTracks":';
    const trackIdx = html.indexOf(trackMark);
    if (trackIdx !== -1) {
      let bracketsCount = 0;
      let arrayStart = html.indexOf('[', trackIdx);
      if (arrayStart !== -1) {
        let arrayEnd = -1;
        for (let i = arrayStart; i < html.length; i++) {
          if (html[i] === '[') bracketsCount++;
          else if (html[i] === ']') {
            bracketsCount--;
            if (bracketsCount === 0) {
              arrayEnd = i + 1;
              break;
            }
          }
        }
        if (arrayEnd !== -1) {
          try {
            captionTracks = JSON.parse(html.substring(arrayStart, arrayEnd));
          } catch(e) {
            console.warn("Failed parsing captionTracks array on backend fallback:", e.message);
          }
        }
      }
    }
  }
  
  // Method 3: Original marker check as a final attempt
  if (!captionTracks) {
    const marker = '"captions":';
    const startIdx = html.indexOf(marker);
    if (startIdx !== -1) {
      let bracketsCount = 0;
      let jsonStart = startIdx + marker.length;
      let jsonEnd = -1;
      for (let i = jsonStart; i < html.length; i++) {
        if (html[i] === '{') bracketsCount++;
        else if (html[i] === '}') {
          bracketsCount--;
          if (bracketsCount === 0) {
            jsonEnd = i + 1;
            break;
          }
        }
      }
      if (jsonEnd !== -1) {
        try {
          const captionsJson = JSON.parse(html.substring(jsonStart, jsonEnd));
          captionTracks = captionsJson?.playerCaptionsTracklistRenderer?.captionTracks;
        } catch(e) {
          console.warn("Failed parsing captionsJson on backend fallback:", e.message);
        }
      }
    }
  }
  
  if (!captionTracks || !Array.isArray(captionTracks) || captionTracks.length === 0) {
    throw new Error('No caption tracks found on backend fallback scraper');
  }
  
  let selectedTrack = captionTracks.find(t => t.languageCode === 'ko');
  if (!selectedTrack) selectedTrack = captionTracks.find(t => t.languageCode === 'en');
  if (!selectedTrack) selectedTrack = captionTracks[0];
  
  const baseUrl = selectedTrack.baseUrl;
  if (!baseUrl) throw new Error('No baseUrl for selected track');
  
  const dlOptions = {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Referer': 'https://www.youtube.com/',
      'Accept': '*/*',
      'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
    }
  };
  const xml = await new Promise((resolve, reject) => {
    https.get(baseUrl, dlOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
  
  const regex = /<text\s+start="([\d.]+)"\s+dur="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/gi;
  let match;
  const segments = [];
  while ((match = regex.exec(xml)) !== null) {
    const start = parseFloat(match[1]);
    const dur = parseFloat(match[2]);
    let text = match[3]
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/<\/?[^>]+(>|$)/g, "")
      .trim();
    
    segments.push({
      start: Math.round(start),
      dur: Math.max(1, Math.round(dur)),
      text: text.replace(/\n/g, ' ')
    });
  }
  if (!segments || segments.length === 0) {
    throw new Error('No caption segments parsed from watch page HTML');
  }
  return segments;
}

// ─── Promise.any Helper for Older Node.js Environments ────────────────────────
function promiseAny(promises) {
  return new Promise((resolve, reject) => {
    let rejectedCount = 0;
    const errors = [];
    if (promises.length === 0) {
      return reject(new Error("Empty promise array"));
    }
    promises.forEach((p, idx) => {
      Promise.resolve(p).then(resolve).catch((err) => {
        errors[idx] = err;
        rejectedCount++;
        if (rejectedCount === promises.length) {
          reject(new Error("All promises rejected: " + errors.map(e => e.message).join(', ')));
        }
      });
    });
  });
}

let cachedPipedInstances = [];
let lastPipedInstancesFetchTime = 0;

async function getPipedInstances() {
  const now = Date.now();
  
  const fallbackList = [
    "https://pipedapi.kavin.rocks",
    "https://api.piped.private.coffee",
    "https://pipedapi.in.projectsegfau.lt",
    "https://pipedapi.darkness.services",
    "https://piped-api.lunar.icu",
    "https://pipedapi.r4fo.com",
    "https://piped.video",
    "https://piped.yt"
  ];

  if (cachedPipedInstances.length > 0 && (now - lastPipedInstancesFetchTime < 6 * 3600 * 1000)) {
    const active = cachedPipedInstances.filter(url => !isNodeBlacklisted(url));
    return active.length > 0 ? active : cachedPipedInstances;
  }
  
  // Try dynamic fetching from multiple mirror sources
  const sources = [
    'https://piped-instances.kavin.rocks/',
    'https://raw.githubusercontent.com/team-piped/piped-instances/main/piped-instances.json'
  ];

  for (const src of sources) {
    try {
      const list = await new Promise((resolve, reject) => {
        const options = {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          timeout: 3000
        };
        https.get(src, options, (res) => {
          if (res.statusCode !== 200) {
            reject(new Error(`Status: ${res.statusCode}`));
            return;
          }
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
          });
        }).on('error', reject);
      });
      
      if (Array.isArray(list)) {
        let urls = list
          .filter(item => item && item.api_url)
          .map(item => item.api_url);
        
        // Ensure private.coffee is prioritized
        const index = urls.indexOf("https://api.piped.private.coffee");
        if (index !== -1) urls.splice(index, 1);
        urls.unshift("https://api.piped.private.coffee");
        
        if (urls.length > 0) {
          cachedPipedInstances = urls;
          lastPipedInstancesFetchTime = now;
          const active = cachedPipedInstances.filter(url => !isNodeBlacklisted(url));
          return active.length > 0 ? active : cachedPipedInstances;
        }
      }
    } catch (err) {
      console.warn(`Failed to fetch dynamic Piped instances from ${src}:`, err.message);
    }
  }
  
  const activeFallback = fallbackList.filter(url => !isNodeBlacklisted(url));
  return activeFallback.length > 0 ? activeFallback : fallbackList;
}

async function fetchPipedCaptionsBackend(videoId) {
  const instances = await getPipedInstances();
  const shuffled = [...instances].sort(() => Math.random() - 0.5);
  const priorityIndex = shuffled.indexOf("https://api.piped.private.coffee");
  if (priorityIndex !== -1) {
    shuffled.splice(priorityIndex, 1);
  }
  shuffled.unshift("https://api.piped.private.coffee");
  
  // Try up to 8 nodes concurrently in parallel race
  const instancesToTry = shuffled.slice(0, 8);
  
  const promises = instancesToTry.map(async (instance) => {
    try {
      const streamUrl = `${instance}/streams/${videoId}`;
      const streamData = await new Promise((resolve, reject) => {
        const req = https.get(streamUrl, {
          timeout: 3500,
          headers: { 
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' 
          }
        }, (res) => {
          if (res.statusCode !== 200) { reject(new Error(`Status: ${res.statusCode}`)); return; }
          let data = '';
          res.on('data', d => data += d);
          res.on('end', () => {
            try { resolve(JSON.parse(data)); } catch(e) { reject(e); }
          });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
      });
      
      if (!streamData || !streamData.subtitles || streamData.subtitles.length === 0) {
        throw new Error('No subtitles found in stream metadata');
      }
      
      let track = streamData.subtitles.find(s => s.code === 'ko' || s.languageCode === 'ko');
      if (!track) track = streamData.subtitles.find(s => s.code === 'en' || s.languageCode === 'en');
      if (!track) track = streamData.subtitles[0];
      
      if (!track || !track.url) throw new Error('No subtitle track URL');
      
      let vttUrl = track.url;
      if (!vttUrl.startsWith('http')) vttUrl = 'https:' + vttUrl;
      if (vttUrl.includes('fmt=')) {
        vttUrl = vttUrl.replace(/fmt=[^&]+/, 'fmt=vtt');
      } else {
        vttUrl += '&fmt=vtt';
      }
      
      const vtt = await new Promise((resolve, reject) => {
        const req = https.get(vttUrl, {
          timeout: 3000,
          headers: { 'User-Agent': 'Mozilla/5.0' }
        }, (res) => {
          if (res.statusCode !== 200) { reject(new Error(`Status: ${res.statusCode}`)); return; }
          let data = '';
          res.on('data', d => data += d);
          res.on('end', () => resolve(data));
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
      });
      
      if (!vtt || vtt.length < 50) throw new Error('VTT file empty or too short');
      
      const lines = vtt.split(/\r?\n/);
      const segments = [];
      let currentSeg = null;
      
      const timeRegex = /(\d{2}):(\d{2}):(\d{2})[.,](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[.,](\d{3})/;
      const shortTimeRegex = /(\d{2}):(\d{2})[.,](\d{3})\s*-->\s*(\d{2}):(\d{2})[.,](\d{3})/;
      
      function parseTimeToSec(h, m, s, ms) {
        return parseInt(h) * 3600 + parseInt(m) * 60 + parseInt(s) + parseInt(ms) / 1000;
      }
      const parseShortTimeToSec = (m, s, ms) => parseInt(m) * 60 + parseInt(s) + parseInt(ms) / 1000;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        let match = line.match(timeRegex);
        let start = 0, end = 0;
        let isTimeLine = false;
        
        if (match) {
          start = parseTimeToSec(match[1], match[2], match[3], match[4]);
          end = parseTimeToSec(match[5], match[6], match[7], match[8]);
          isTimeLine = true;
        } else {
          match = line.match(shortTimeRegex);
          if (match) {
            start = parseShortTimeToSec(match[1], match[2], match[3]);
            end = parseShortTimeToSec(match[4], match[5], match[6]);
            isTimeLine = true;
          }
        }
        
        if (isTimeLine) {
          if (currentSeg) segments.push(currentSeg);
          currentSeg = {
            start: Math.round(start),
            dur: Math.max(1, Math.round(end - start)),
            text: ""
          };
        } else if (currentSeg && !line.startsWith("WEBVTT") && !line.startsWith("NOTE") && !/^\d+$/.test(line)) {
          const cleaned = line.replace(/<[^>]+>/g, '').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&nbsp;/g,' ').trim();
          if (cleaned) currentSeg.text += (currentSeg.text ? " " : "") + cleaned;
        }
      }
      if (currentSeg) segments.push(currentSeg);
      
      const filtered = segments.filter(s => s.text.trim().length > 0);
      if (filtered.length > 0) {
        console.log(`[Parallel Race] Successfully fetched and parsed Piped captions from ${instance}`);
        return { lang: track.code || track.languageCode || 'en', captions: filtered };
      }
      throw new Error('No valid caption segments parsed');
    } catch (err) {
      // Only blacklist if it's a real server/network failure (timeout, 5xx, 403, etc.), not a video content issue
      const isContentError = err.message.includes('No subtitles') || 
                             err.message.includes('No subtitle track') || 
                             err.message.includes('No valid caption') ||
                             err.message.includes('Status: 404');
      if (!isContentError) {
        markNodeFailed(instance);
      }
      throw new Error(`Instance ${instance} failed: ${err.message}`);
    }
  });

  try {
    return await promiseAny(promises);
  } catch (err) {
    console.warn("[Parallel Race] All Piped instances failed: ", err.message);
    throw new Error("All Piped captions fallback attempts failed.");
  }
}

let cachedInvidiousInstances = [];
let lastInstancesFetchTime = 0;

async function getInvidiousInstances() {
  const now = Date.now();
  
  const fallbackList = [
    "https://inv.nadeko.net",
    "https://invidious.nerdvpn.de",
    "https://invidious.tiekoetter.com",
    "https://yewtu.be",
    "https://yt.chocolatemoo53.com",
    "https://invidious.lunar.icu",
    "https://invidious.drgns.space"
  ];

  if (cachedInvidiousInstances.length > 0 && (now - lastInstancesFetchTime < 6 * 3600 * 1000)) {
    const active = cachedInvidiousInstances.filter(url => !isNodeBlacklisted(url));
    return active.length > 0 ? active : cachedInvidiousInstances;
  }
  
  try {
    const list = await new Promise((resolve, reject) => {
      const options = {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
        timeout: 4000
      };
      https.get('https://api.invidious.io/instances.json', options, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`Status: ${res.statusCode}`));
          return;
        }
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
        });
      }).on('error', reject);
    });
    
    if (Array.isArray(list)) {
      const urls = list
        .filter(item => {
          const info = item[1];
          if (!info || info.type !== 'https' || info.monitor?.down) return false;
          // Filtering logic: Ensure instance has high uptime (daily ratio >= 92%)
          const ratio = info.monitor?.dailyRatios?.[0]?.ratio;
          if (ratio !== undefined && ratio < 92) return false;
          return true;
        })
        .map(item => item[1].uri || `https://${item[0]}`);
      
      if (urls.length > 0) {
        cachedInvidiousInstances = urls;
        lastInstancesFetchTime = now;
        const active = cachedInvidiousInstances.filter(url => !isNodeBlacklisted(url));
        return active.length > 0 ? active : cachedInvidiousInstances;
      }
    }
  } catch (err) {
    console.warn('Failed to fetch dynamic Invidious instances list, using fallbacks:', err.message);
  }
  
  const activeFallback = fallbackList.filter(url => !isNodeBlacklisted(url));
  return activeFallback.length > 0 ? activeFallback : fallbackList;
}

async function fetchInvidiousCaptionsFallback(videoId) {
  const instances = await getInvidiousInstances();
  const shuffled = [...instances].sort(() => Math.random() - 0.5);
  const instancesToTry = shuffled.slice(0, 8);
  
  const promises = instancesToTry.map(async (instance) => {
    try {
      const listUrl = `${instance}/api/v1/captions/${videoId}`;
      const listJson = await new Promise((resolve, reject) => {
        const req = https.get(listUrl, { 
          timeout: 3000,
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/124.0.0.0' }
        }, (res) => {
          if (res.statusCode !== 200) {
            reject(new Error(`Status: ${res.statusCode}`));
            return;
          }
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            try { resolve(JSON.parse(data)); } catch(e) { reject(e); }
          });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
      });
      
      if (!listJson || !listJson.captions || listJson.captions.length === 0) {
        throw new Error("No captions track list found");
      }
      
      let track = listJson.captions.find(c => c.languageCode === 'ko');
      if (!track) track = listJson.captions.find(c => c.languageCode === 'en');
      if (!track) track = listJson.captions[0];
      
      const trackUrl = `${instance}${track.url}`;
      const vtt = await new Promise((resolve, reject) => {
        const req = https.get(trackUrl, { 
          timeout: 3000,
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/124.0.0.0' }
        }, (res) => {
          if (res.statusCode !== 200) {
            reject(new Error(`Status: ${res.statusCode}`));
            return;
          }
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => resolve(data));
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
      });
      
      const lines = vtt.split(/\r?\n/);
      const segments = [];
      let currentSeg = null;
      
      const timeRegex = /(\d{2}):(\d{2}):(\d{2})[.,](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[.,](\d{3})/;
      const shortTimeRegex = /(\d{2}):(\d{2})[.,](\d{3})\s*-->\s*(\d{2}):(\d{2})[.,](\d{3})/;
      
      function parseTimeToSec(h, m, s, ms) {
        return parseInt(h) * 3600 + parseInt(m) * 60 + parseInt(s) + parseInt(ms) / 1000;
      }
      function parseShortTimeToSec(m, s, ms) {
        return parseInt(m) * 60 + parseInt(s) + parseInt(ms) / 1000;
      }
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        let match = line.match(timeRegex);
        let start = 0, end = 0;
        let isTimeLine = false;
        
        if (match) {
          start = parseTimeToSec(match[1], match[2], match[3], match[4]);
          end = parseTimeToSec(match[5], match[6], match[7], match[8]);
          isTimeLine = true;
        } else {
          match = line.match(shortTimeRegex);
          if (match) {
            start = parseShortTimeToSec(match[1], match[2], match[3]);
            end = parseShortTimeToSec(match[4], match[5], match[6]);
            isTimeLine = true;
          }
        }
        
        if (isTimeLine) {
          if (currentSeg) segments.push(currentSeg);
          currentSeg = {
            start: Math.round(start),
            dur: Math.max(1, Math.round(end - start)),
            text: ""
          };
        } else if (currentSeg && !line.startsWith("WEBVTT") && !line.startsWith("NOTE")) {
          currentSeg.text += (currentSeg.text ? " " : "") + line;
        }
      }
      if (currentSeg) segments.push(currentSeg);
      
      if (segments.length > 0) {
        console.log(`[Parallel Race] Successfully fetched Invidious captions from ${instance}`);
        return segments;
      }
      throw new Error("No segments parsed from VTT");
    } catch (err) {
      // Only blacklist if it's a real server/network failure (timeout, 5xx, 403, etc.), not a video content issue
      const isContentError = err.message.includes('No captions') || 
                             err.message.includes('No valid track') || 
                             err.message.includes('No segments') || 
                             err.message.includes('Status: 404');
      if (!isContentError) {
        markNodeFailed(instance);
      }
      throw new Error(`Instance ${instance} failed: ${err.message}`);
    }
  });

  try {
    return await promiseAny(promises);
  } catch (err) {
    console.warn("[Parallel Race] All Invidious instances failed: ", err.message);
    throw new Error("All Invidious captions fallback attempts failed.");
  }
}

async function getYouTubeTranscriptDirect(videoId, lang) {
  const pageUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
    'Referer': 'https://www.youtube.com/'
  };
  
  let html = '';
  try {
    html = await new Promise((resolve, reject) => {
      https.get(pageUrl, { headers }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
      }).on('error', reject);
    });
  } catch (e) {
    console.warn("Failed to fetch watch page HTML:", e.message);
  }
  
  let captionTracks = null;
  if (html) {
    // Attempt A: Parse ytInitialPlayerResponse
    const responseMark = 'ytInitialPlayerResponse = ';
    const responseIdx = html.indexOf(responseMark);
    if (responseIdx !== -1) {
      const endIdx = html.indexOf('};', responseIdx);
      if (endIdx !== -1) {
        const rawResponse = html.substring(responseIdx + responseMark.length, endIdx + 1);
        try {
          const parsed = JSON.parse(rawResponse);
          captionTracks = parsed?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
        } catch(e) {}
      }
    }
    
    // Attempt B: Parse "captionTracks" array directly
    if (!captionTracks) {
      const trackMark = '"captionTracks":';
      const trackIdx = html.indexOf(trackMark);
      if (trackIdx !== -1) {
        let bracketsCount = 0;
        let arrayStart = html.indexOf('[', trackIdx);
        if (arrayStart !== -1) {
          let arrayEnd = -1;
          for (let i = arrayStart; i < html.length; i++) {
            if (html[i] === '[') bracketsCount++;
            else if (html[i] === ']') {
              bracketsCount--;
              if (bracketsCount === 0) {
                arrayEnd = i + 1;
                break;
              }
            }
          }
          if (arrayEnd !== -1) {
            try {
              captionTracks = JSON.parse(html.substring(arrayStart, arrayEnd));
            } catch(e) {}
          }
        }
      }
    }
    
    // Attempt C: Parse '"captions":' object directly
    if (!captionTracks) {
      const marker = '"captions":';
      const startIdx = html.indexOf(marker);
      if (startIdx !== -1) {
        let bracketsCount = 0;
        let jsonStart = startIdx + marker.length;
        let jsonEnd = -1;
        for (let i = jsonStart; i < html.length; i++) {
          if (html[i] === '{') bracketsCount++;
          else if (html[i] === '}') {
            bracketsCount--;
            if (bracketsCount === 0) {
              jsonEnd = i + 1;
              break;
            }
          }
        }
        if (jsonEnd !== -1) {
          try {
            const captionsJson = JSON.parse(html.substring(jsonStart, jsonEnd));
            captionTracks = captionsJson?.playerCaptionsTracklistRenderer?.captionTracks;
          } catch(e) {}
        }
      }
    }
  }

  // 2. If watch page scraping failed (blocked, etc.), try InnerTube Player API with WEB/ANDROID/IOS clients
  if (!captionTracks) {
    let apiKey = '';
    if (html) {
      const keyMatch = html.match(/"innertubeApiKey"\s*:\s*"([^"]+)"/) || html.match(/"key"\s*:\s*"([^"]+)"/);
      if (keyMatch) apiKey = keyMatch[1];
    }
    // Fallback static keys if page is completely blocked
    const fallbackKeys = [
      apiKey,
      "AIzaSyAO_K2CwPqpjgXX-I3EDm5fTvT28I2Ip3g", // Official Web Key
      "AIzaSyD-aDj6stnH465S41hszj5q3bUeQ6mO0e8"  // Android Key
    ].filter(Boolean);

    // Client signature sets for emulation (TVHTML5 embedded player is most reliable for captions)
    const clientSignatures = [
      {
        name: 'TVHTML5_SIMPLY_EMBEDDED_PLAYER',
        version: '2.0',
        ua: 'Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.5) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/5.0 Chrome/85.0.4183.93 TV Safari/537.36',
        embedUrl: `https://www.youtube.com/embed/${videoId}`
      },
      {
        name: 'WEB',
        version: '2.20240409.01.00',
        ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      },
      {
        name: 'ANDROID',
        version: '19.05.35',
        ua: 'com.google.android.youtube/19.05.35 (Linux; U; Android 11; ko_KR) Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36 Mobile Safari/537.36'
      },
      {
        name: 'IOS',
        version: '19.08.2',
        ua: 'com.google.ios.youtube/19.08.2 (iPhone14,3; U; CPU iOS 15_4 like Mac OS X; ko_KR)'
      }
    ];

    for (const key of fallbackKeys) {
      for (const sig of clientSignatures) {
        try {
          const payloadObj = {
            context: {
              client: {
                clientName: sig.name,
                clientVersion: sig.version,
                hl: lang || 'ko',
                gl: 'KR',
                userAgent: sig.ua
              }
            },
            videoId: videoId
          };
          // TVHTML5 embedded player requires thirdParty.embedUrl
          if (sig.embedUrl) {
            payloadObj.context.thirdParty = { embedUrl: sig.embedUrl };
          }
          const payload = JSON.stringify(payloadObj);
          
          const resData = await new Promise((resolve, reject) => {
            const req = https.request({
              hostname: 'www.youtube.com',
              port: 443,
              path: `/youtubei/v1/player?key=${key}`,
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'User-Agent': sig.ua,
                'Referer': 'https://www.youtube.com/',
                'Content-Length': Buffer.byteLength(payload)
              }
            }, (res) => {
              let body = '';
              res.on('data', chunk => body += chunk);
              res.on('end', () => resolve(body));
            });
            req.on('error', reject);
            req.write(payload);
            req.end();
          });
          
          const data = JSON.parse(resData);
          const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
          if (tracks && Array.isArray(tracks) && tracks.length > 0) {
            captionTracks = tracks;
            console.log(`[InnerTube Emulation] Successfully fetched caption tracks via client: ${sig.name}`);
            break;
          }
        } catch (e) {
          console.warn(`[InnerTube Emulation] Failed client ${sig.name} with key ${key.substring(0, 8)}:`, e.message);
        }
      }
      if (captionTracks) break;
    }
  }

  if (!captionTracks || !Array.isArray(captionTracks) || captionTracks.length === 0) {
    throw new Error("No caption tracks available");
  }

  // Select target track: lang > ko > en > first
  let track = null;
  if (lang) track = captionTracks.find(t => (t.languageCode || '').toLowerCase().startsWith(lang.toLowerCase()));
  if (!track) track = captionTracks.find(t => (t.languageCode || '').toLowerCase().startsWith('ko'));
  if (!track) track = captionTracks.find(t => (t.languageCode || '').toLowerCase().startsWith('en'));
  if (!track) track = captionTracks[0];

  if (!track || !track.baseUrl) {
    throw new Error("No valid caption track URL found");
  }

  // Download caption XML/JSON with correct headers
  const dlUrl = track.baseUrl + (track.baseUrl.includes('?') ? '&' : '?') + 'fmt=srv1';
  
  // Try direct fetch with Android-like User-Agent first to bypass download block
  const downloadHeaders = {
    'User-Agent': 'com.google.android.youtube/19.05.35 (Linux; U; Android 11; ko_KR)',
    'Referer': 'https://www.youtube.com/'
  };

  let xml = '';
  try {
    xml = await new Promise((resolve, reject) => {
      https.get(dlUrl, { headers: downloadHeaders }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
      }).on('error', reject);
    });
  } catch (e) {
    console.warn("Direct download of track failed, falling back to general headers:", e.message);
    xml = await new Promise((resolve, reject) => {
      https.get(dlUrl, { headers }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
      }).on('error', reject);
    });
  }

  if (!xml || !xml.includes('<text')) {
    throw new Error("Empty caption content");
  }

  // Parse srv1 XML
  const regex = /<text\s+start="([\d.]+)"\s+dur="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/gi;
  let match;
  const segments = [];
  while ((match = regex.exec(xml)) !== null) {
    const start = parseFloat(match[1]);
    const dur = parseFloat(match[2]);
    let text = match[3]
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/<\/?[^>]+(>|$)/g, "")
      .trim();
    
    segments.push({
      start: Math.round(start),
      dur: Math.max(1, Math.round(dur)),
      text: text.replace(/\n/g, ' ')
    });
  }

  return segments;
}

function handleCaptions(req, res) {
  const parsedUrl = url.parse(req.url, true);
  const videoId = parsedUrl.query.id || '';
  const reqLang = parsedUrl.query.lang || '';
  
  console.log(`[handleCaptions] Incoming: id=${videoId}, lang=${reqLang}`);

  if (!videoId) {
    res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: 'Missing video id parameter' }));
    return;
  }

  const NOISE = /^\[.*\]$|^\(.*\)$|^\s*$/;

  async function tryFetch(lang) {
    let segments;
    try {
      const opts = lang ? { lang } : {};
      segments = await YoutubeTranscript.fetchTranscript(videoId, opts);
    } catch (err) {
      console.warn(`[handleCaptions] YoutubeTranscript library failed for lang=${lang}, trying direct robust fetcher:`, err.message);
      segments = await getYouTubeTranscriptDirect(videoId, lang);
    }
    if (!segments || segments.length === 0) {
      throw new Error('Empty transcript from API');
    }
    
    // Robust time unit auto-detection:
    // youtube-transcript may return offsets in seconds (float) or ms (integer).
    // If any segment has an offset or duration > 1000, it's highly likely to be milliseconds,
    // especially for short videos or segments where duration is typically a few seconds (ms > 1000).
    const isMs = segments.some(s => s.offset > 1000) || segments.some(s => s.duration > 1000);

    const filtered = segments
      .filter(s => !NOISE.test(s.text.trim()))
      .map(s => {
        const start = isMs ? Math.round(s.offset / 1000)   : Math.round(s.offset);
        const dur   = isMs ? Math.max(1, Math.round(s.duration / 1000)) : Math.max(1, Math.round(s.duration));
        return { start, dur, text: s.text.replace(/\n/g, ' ').trim() };
      });
      
    if (filtered.length === 0) {
      throw new Error('All transcripts filtered out');
    }
    return filtered;
  }

  // 3-Tier robust cascade capture pipeline
  // Build a deduped ordered list of languages to attempt so we never
  // call tryFetch() twice with the same language.
  let actualLang = reqLang || 'ko';
  const langQueue = [];
  if (reqLang) langQueue.push(reqLang);
  if (!langQueue.includes('ko')) langQueue.push('ko');
  if (!langQueue.includes('en')) langQueue.push('en');
  langQueue.push(null); // auto-detect / any

  // Build the initial chain: try each language in order
  let chain = Promise.reject(new Error('start'));
  for (const lng of langQueue) {
    chain = chain.catch(() =>
      tryFetch(lng).then(captions => {
        console.log(`[handleCaptions] tryFetch ${lng} success`);
        actualLang = lng || 'en';
        return captions;
      })
    );
  }

  chain
    // Fallback 1: Piped Captions Scrape (가장 우회율이 높음)
    .catch(() => fetchPipedCaptionsBackend(videoId).then(res => { console.log('[handleCaptions] Piped success:', res.lang); actualLang = res.lang; return res.captions; }))
    // Fallback 2: YouTube timedtext official backend scraper
    .catch(() => fetchYoutubeTimedTextOfficialBackend(videoId).then(res => { console.log('[handleCaptions] timedtext success'); actualLang = res.lang; return res.captions; }))
    // Fallback 3: YouTube Native XML Scraper Scrape
    .catch(() => fetchYoutubeCaptionsFallback(videoId).then(captions => { console.log('[handleCaptions] Native XML success'); actualLang = 'ko'; return captions; }))
    // Fallback 4: Invidious Open Captions Scrape
    .catch(() => fetchInvidiousCaptionsFallback(videoId).then(captions => { console.log('[handleCaptions] Invidious success'); actualLang = 'ko'; return captions; }))
    .then(captions => {
      console.log(`[handleCaptions] Returning ${captions.length} captions for ${videoId}`);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ lang: actualLang, captions }));
    })
    .catch(err => {
      console.warn(`[handleCaptions] Captions completely unavailable for ${videoId}:`, err.message);
      res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: 'No captions available', details: err.message }));
    });
}

// ─── /api/analyze-video-fast ──────────────────────────────────────────────────
// 초고속 비디오 자막 신뢰도(거짓) 스캔 및 3색 등급 판별 API
// - 음성이 처음 감지되는 세그먼트 시점부터 30초만 샘플링
// - YoutubeTranscript → getYouTubeTranscriptDirect → Piped 순서 폴백
async function handleAnalyzeVideoFast(req, res) {
  const parsedUrl = url.parse(req.url, true);
  const videoId = (parsedUrl.query.id || '').trim();
  const CORS = { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' };

  if (!videoId) {
    res.writeHead(400, CORS);
    res.end(JSON.stringify({ error: 'Missing video id' }));
    return;
  }

  console.log(`[handleAnalyzeVideoFast] Scanning video: ${videoId}`);

  try {
  // ── 자막 세그먼트 수집 (다단 폴백) ──────────────────────────────────────────
  let rawSegments = null;
  
  // 1차: YoutubeTranscript 라이브러리 (가장 빠름)
  try {
    rawSegments = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'ko' });
  } catch (e1) {
    try {
      rawSegments = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'en' });
    } catch (e2) {
      // no-op, try next
    }
  }
  
  // 2차: YouTube 직접 스크래핑 폴백
  if (!rawSegments || rawSegments.length === 0) {
    try {
      rawSegments = await getYouTubeTranscriptDirect(videoId, 'ko');
    } catch(e) {}
  }
  if (!rawSegments || rawSegments.length === 0) {
    try {
      rawSegments = await getYouTubeTranscriptDirect(videoId, 'en');
    } catch(e) {}
  }
  
  // 3차: Piped 폴백 (병렬 다인스턴스 레이스)
  if (!rawSegments || rawSegments.length === 0) {
    try {
      rawSegments = await fetchPipedCaptionsBackend(videoId);
    } catch(e) {
      console.warn(`[handleAnalyzeVideoFast] Piped fallback failed: ${e.message}`);
    }
  }

  // ── 30초 음성 구간 샘플링 ─────────────────────────────────────────────────────
  let textBuffer = '';
  if (rawSegments && rawSegments.length > 0) {
    // 세그먼트 시간 필드 통일 (start/offset 둘 다 지원)
    const isMs = rawSegments.some(s => (s.offset && s.offset > 1000) || (s.start && s.start > 1000));
    const normalizedSegs = rawSegments.map(s => {
      let rawStart = s.start !== undefined ? s.start : (s.offset !== undefined ? s.offset : 0);
      let rawDur = s.duration !== undefined ? s.duration : (s.dur !== undefined ? s.dur : 1);
      return {
        text: (s.text || '').replace(/\[.*?\]/g, '').trim(),
        startSec: isMs ? rawStart / 1000 : rawStart,
        dur: isMs ? rawDur / 1000 : rawDur
      };
    }).filter(s => s.text.length > 0);
    
    if (normalizedSegs.length > 0) {
      // 첫 음성 감지 시점(무음·공백 제외 첫 세그먼트)부터 15초
      const firstSec = normalizedSegs[0].startSec;
      const endSec = firstSec + 15;
      
      const filtered = normalizedSegs.filter(s => s.startSec >= firstSec && s.startSec <= endSec);
      textBuffer = filtered.map(s => s.text).join(' ');
      
      console.log(`[handleAnalyzeVideoFast] 15s sampling: ${firstSec.toFixed(1)}s → ${endSec.toFixed(1)}s | ` +
        `${filtered.length}/${normalizedSegs.length} segs | "${textBuffer.substring(0, 80)}..."`);
    }
  } else {
    console.warn(`[handleAnalyzeVideoFast] No captions retrieved for ${videoId}`);
  }

  // ── 거짓 감지 로직 ────────────────────────────────────────────────────────────
  let score = 80;
  const detected = [];

  if (textBuffer) {
    const dangerKeywords = [
      '거짓말', '사실무근', '조작', '루머', '음모론', '날조', '사기', '사칭', '선동', '속임수', '구라', '허위',
      'lie', 'fake', 'rumor', 'fabricat', 'hoax', 'fraud', 'deceit', 'manipulat'
    ];
    const suspiciousKeywords = [
      '솔직히', '사실은', '진짜로', '오해', '해명', '억울', '맹세', '비밀', '아마도', '해프닝', '짜깁기',
      'honestly', 'actually', 'truth', 'clarify', 'secret', 'promise', 'maybe'
    ];

    let dangerCount = 0;
    let suspiciousCount = 0;
    const lowerText = textBuffer.toLowerCase();

    dangerKeywords.forEach(word => {
      let idx = lowerText.indexOf(word);
      while (idx !== -1) {
        dangerCount++;
        if (!detected.includes(word)) detected.push(word);
        idx = lowerText.indexOf(word, idx + word.length);
      }
    });

    suspiciousKeywords.forEach(word => {
      let idx = lowerText.indexOf(word);
      while (idx !== -1) {
        suspiciousCount++;
        if (!detected.includes(word)) detected.push(word);
        idx = lowerText.indexOf(word, idx + word.length);
      }
    });

    score = 100 - (dangerCount * 12 + suspiciousCount * 4);
    score = Math.max(10, Math.min(100, score));
  } else {
    score = 82; // 자막 없을 때 기본값
  }

  let rating = 'safe';
  let badgeText = `Safe ${score}%`;

  if (score < 50) {
    rating = 'danger';
    badgeText = `Danger ${100 - score}%`;
  } else if (score < 80) {
    rating = 'caution';
    badgeText = `Caution ${100 - score}%`;
  }

  res.writeHead(200, CORS);
  res.end(JSON.stringify({
    ok: true,
    videoId,
    score,
    rating,
    badgeText,
    detectedKeywords: detected.slice(0, 10),
    captionAvailable: textBuffer.length > 0
  }));

  } catch (fatalErr) {
    console.error(`[handleAnalyzeVideoFast] Fatal error for ${videoId}:`, fatalErr.message);
    // 어떤 예외가 발생해도 유효한 기본값 JSON 응답을 반환
    try {
      res.writeHead(200, CORS);
      res.end(JSON.stringify({
        ok: true,
        videoId,
        score: 82,
        rating: 'safe',
        badgeText: 'Safe 82%',
        detectedKeywords: [],
        captionAvailable: false
      }));
    } catch(ignored) {}
  }
}

// ─── /api/video-meta ──────────────────────────────────────────────────────────
// Returns title, tags, description for a YouTube video ID via Piped API.
async function handleVideoMeta(req, res) {
  const parsedUrl = url.parse(req.url, true);
  const videoId = (parsedUrl.query.id || '').trim();
  const CORS = { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' };

  if (!videoId) {
    res.writeHead(400, CORS);
    res.end(JSON.stringify({ error: 'Missing video id' }));
    return;
  }

  console.log(`[handleVideoMeta] Fetching meta for: ${videoId}`);

  let instances;
  try { instances = await getPipedInstances(); } catch(e) { instances = []; }
  const toTry = instances.slice(0, 5);

  for (const instance of toTry) {
    try {
      const streamData = await new Promise((resolve, reject) => {
        const r = https.get(`${instance}/streams/${videoId}`, {
          timeout: 3500,
          headers: { 'User-Agent': 'Mozilla/5.0' }
        }, (resp) => {
          if (resp.statusCode !== 200) { reject(new Error(`Status: ${resp.statusCode}`)); return; }
          let data = '';
          resp.on('data', d => data += d);
          resp.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
        });
        r.on('error', reject);
        r.on('timeout', () => { r.destroy(); reject(new Error('timeout')); });
      });

      if (streamData && streamData.title) {
        const meta = {
          title: streamData.title || '',
          description: (streamData.description || '').substring(0, 800),
          tags: Array.isArray(streamData.tags) ? streamData.tags : [],
          uploaderName: streamData.uploaderName || ''
        };
        console.log(`[handleVideoMeta] OK from ${instance}: "${meta.title}" tags:${meta.tags.length}`);
        res.writeHead(200, CORS);
        res.end(JSON.stringify(meta));
        return;
      }
    } catch(err) {
      console.warn(`[handleVideoMeta] ${instance} failed: ${err.message}`);
    }
  }

  // All instances failed — return empty so client gracefully handles it
  res.writeHead(200, CORS);
  res.end(JSON.stringify({ title: '', tags: [], description: '', uploaderName: '' }));
}

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  
  if (parsedUrl.pathname === '/api/search') {
    handleSearch(req, res);
  } else if (parsedUrl.pathname === '/api/video-meta') {
    handleVideoMeta(req, res);
  } else if (parsedUrl.pathname === '/api/captions') {
    handleCaptions(req, res);
  } else if (parsedUrl.pathname === '/api/analyze-video-fast') {
    handleAnalyzeVideoFast(req, res);
  } else if (parsedUrl.pathname === '/api/admin-settings') {
    handleAdminSettings(req, res);
  } else {
    let safePath = parsedUrl.pathname;
    if (safePath === '/' || safePath === '') {
      safePath = '/index.html';
    }
    const filePath = path.join(PUBLIC_DIR, safePath);
    serveStatic(res, filePath);
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`======================================================`);
  console.log(`   Th!nc Premium Server Running Natively              `);
  console.log(`   - Local:    http://127.0.0.1:${PORT}                `);
  console.log(`   - Network:  http://0.0.0.0:${PORT}                  `);
  console.log(`======================================================\n`);
});
