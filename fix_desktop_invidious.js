const fs = require('fs');
let content = fs.readFileSync('e:/vivpr/ai/lie/webapp/desktop.js', 'utf8');

// Find fetchInvidiousCaptionsParallel start
const startMarker = '  async function fetchInvidiousCaptionsParallel(videoId) {';
const startIdx = content.indexOf(startMarker);
if (startIdx === -1) { console.log('ERR: startMarker not found'); process.exit(1); }

// Find the end of this function (next 'async function' or '  function ')
const afterStart = content.indexOf('\n  async function ', startIdx + 10);
const afterStart2 = content.indexOf('\n  function recreateYTPlayer', startIdx + 10);
const endIdx = Math.min(
  afterStart === -1 ? Infinity : afterStart,
  afterStart2 === -1 ? Infinity : afterStart2
);
if (endIdx === Infinity) { console.log('ERR: endIdx not found'); process.exit(1); }

const oldFunc = content.substring(startIdx, endIdx);
console.log('Old function length:', oldFunc.length, 'chars');

const newFunc = `  async function fetchInvidiousCaptionsParallel(videoId) {
    const instances = await fetchDynamicInvidiousInstances();
    // 더 많은 인스턴스를 병렬로 시도
    const shuffled = [...instances].sort(() => Math.random() - 0.5).slice(0, 12);

    // 각 인스턴스에서 독립적으로 caption list → VTT 다운로드까지 완료하는 레이스
    const racePromises = shuffled.map(async (instance) => {
      const listUrl = \`\${instance}/api/v1/captions/\${videoId}\`;
      let listJson = null;

      // 1. 직접 fetch (Invidious는 대부분 CORS 허용)
      try {
        const r = await fetch(listUrl, { signal: getTimeoutSignal(4000) });
        if (r.ok) listJson = await r.json();
      } catch (e) {}

      // 2. CORS 프록시로 재시도
      if (!listJson) {
        try {
          const text = await fetchViaCORSProxy(listUrl);
          if (text && text.trim().startsWith('{')) {
            listJson = JSON.parse(text);
          }
        } catch (e) {}
      }

      if (!listJson || !Array.isArray(listJson.captions) || listJson.captions.length === 0) {
        throw new Error(\`No captions at \${instance}\`);
      }

      // 언어 우선순위: ko > en > 첫 번째
      let track = listJson.captions.find(c => c.languageCode === 'ko');
      if (!track) track = listJson.captions.find(c => c.languageCode === 'en');
      if (!track) track = listJson.captions[0];
      if (!track || !track.url) throw new Error('No valid track URL');

      // VTT URL 구성 (Invidious 인스턴스 기준 상대 URL)
      const vttUrl = track.url.startsWith('http') ? track.url : \`\${instance}\${track.url}\`;

      let vtt = null;
      // 3. VTT 직접 fetch
      try {
        const r = await fetch(vttUrl, { signal: getTimeoutSignal(5000) });
        if (r.ok) {
          const text = await r.text();
          if (text && text.length > 30) vtt = text;
        }
      } catch (e) {}

      // 4. CORS 프록시로 VTT 재시도
      if (!vtt) {
        try {
          const text = await fetchViaCORSProxy(vttUrl);
          if (text && text.length > 30) vtt = text;
        } catch (e) {}
      }

      // 5. label 파라미터 직접 URL 방식 시도
      if (!vtt && track.label) {
        try {
          const labelUrl = \`\${instance}/api/v1/captions/\${videoId}?label=\${encodeURIComponent(track.label)}\`;
          const r = await fetch(labelUrl, { signal: getTimeoutSignal(4000) });
          if (r.ok) {
            const text = await r.text();
            if (text && text.length > 30) vtt = text;
          }
        } catch (e) {}
      }

      if (!vtt || vtt.length < 30) throw new Error('VTT download failed');

      const segments = parseVTT(vtt);
      if (segments.length === 0) throw new Error('VTT parsed 0 segments');
      return segments;
    });

    // Promise.any: 첫 번째 성공한 인스턴스 결과 반환
    try {
      return await Promise.any(racePromises);
    } catch (aggErr) {
      throw new Error('All Invidious instances failed for captions');
    }
  }
`;

content = content.substring(0, startIdx) + newFunc + content.substring(endIdx);
fs.writeFileSync('e:/vivpr/ai/lie/webapp/desktop.js', content, 'utf8');
console.log('desktop.js fetchInvidiousCaptionsParallel 업데이트 완료');
