const fs = require('fs');
let content = fs.readFileSync('e:/vivpr/ai/lie/webapp/desktop.js', 'utf8');

const oldList = `  const INVIDIOUS_INSTANCES = [
    "https://inv.nadeko.net",
    "https://invidious.nerdvpn.de",
    "https://invidious.privacydev.net",
    "https://invidious.projectsegfau.lt",
    "https://invidious.tiekoetter.com",
    "https://yewtu.be",
    "https://yt.chocolatemoo53.com",
    "https://inv.thepixora.com",
    "https://invidious.slipfox.xyz",
    "https://invidious.lunar.icu",
    "https://invidious.dhusch.de",
    "https://inv.tux.pizza",
    "https://invidious.drgns.space"
  ];`;

const newList = `  const INVIDIOUS_INSTANCES = [
    // 2025년 테스트 확인된 작동 인스턴스 (우선순위 순)
    "https://inv.nadeko.net",
    "https://inv.thepixora.com",
    "https://invidious.projectsegfau.lt",
    "https://inv.bp.projectsegfau.lt",
    "https://invidious.perennialte.ch",
    "https://invidious.lunar.icu",
    "https://yewtu.be",
    "https://yt.chocolatemoo53.com",
    "https://invidious.nerdvpn.de",
    "https://invidious.tiekoetter.com",
    "https://invidious.flokinet.to",
    "https://invidious.privacydev.net",
    "https://vid.puffyan.us"
  ];`;

if (content.includes(oldList)) {
  content = content.replace(oldList, newList);
  console.log('INVIDIOUS_INSTANCES 업데이트됨');
} else {
  // 부분 매칭 시도
  const idx = content.indexOf('const INVIDIOUS_INSTANCES = [');
  if (idx !== -1) {
    const end = content.indexOf('];', idx) + 2;
    const old = content.substring(idx - 2, end);
    console.log('Found at idx:', idx, '\nOld snippet:\n' + old.substring(0, 200));
  } else {
    console.log('패턴 없음');
  }
}

fs.writeFileSync('e:/vivpr/ai/lie/webapp/desktop.js', content, 'utf8');
console.log('desktop.js 저장 완료');
