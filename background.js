/**
 * TruthPulse Background Service Worker - Massive Dictionary Engine
 */

let massiveDict = new Map();
let isDictLoaded = false;

const languages = ['ar_arabic', 'de_german', 'en_english', 'es_spanish', 'fr_french', 'hi_hindi', 'ja_japanese', 'ko_korean', 'pt_portuguese', 'ru_russian', 'vi_vietnamese', 'zh_chinese'];

async function loadMassiveDictionaries() {
  if (isDictLoaded) return;
  console.log("Loading massive 1.2M dictionary...");
  let count = 0;
  for (let lang of languages) {
    try {
      const url = chrome.runtime.getURL(`dict/dictionary_${lang}.csv`);
      const res = await fetch(url);
      const text = await res.text();
      
      const lines = text.split('\n');
      for (let i = 1; i < lines.length; i++) { // Skip header
        if (!lines[i].trim()) continue;
        const lastComma = lines[i].lastIndexOf(',');
        if (lastComma !== -1) {
          let keywordRaw = lines[i].substring(0, lastComma);
          let scoreDeltaRaw = lines[i].substring(lastComma + 1);
          
          let keyword = keywordRaw.replace(/^"|"$/g, '').split('_')[0].toLowerCase().trim();
          let scoreDelta = parseInt(scoreDeltaRaw, 10);
          
          if (keyword && !isNaN(scoreDelta)) {
            massiveDict.set(keyword, scoreDelta);
            count++;
          }
        }
      }
    } catch(e) {
      console.warn(`Failed to load dict ${lang}:`, e);
    }
  }
  isDictLoaded = true;
  console.log(`Loaded ${count} dictionary items into Map.`);
}

chrome.runtime.onInstalled.addListener(() => {
  console.log('TruthPulse AI Lie Detector installed.');
  loadMassiveDictionaries();
});

// Load immediately on SW start
loadMassiveDictionaries();

function scoreText(text) {
  if (!text || !isDictLoaded) return { delta: 0, matched: [] };
  
  // Tokenize text
  const words = text.toLowerCase().split(/[\s,.;!?()]+/).filter(w => w.length > 0);
  let delta = 0;
  let matched = [];
  
  // Create 1-gram, 2-gram, 3-grams
  const ngrams = [];
  for (let i = 0; i < words.length; i++) {
    ngrams.push(words[i]);
    if (i < words.length - 1) ngrams.push(`${words[i]} ${words[i+1]}`);
    if (i < words.length - 2) ngrams.push(`${words[i]} ${words[i+1]} ${words[i+2]}`);
  }
  
  for (let token of ngrams) {
    if (massiveDict.has(token)) {
      delta += massiveDict.get(token);
      matched.push(token);
      if (matched.length >= 30) break; // Limit to 30 matches like python script
    }
  }
  
  return { delta, matched: [...new Set(matched)] };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SCORE_TEXT') {
    if (!isDictLoaded) {
      loadMassiveDictionaries().then(() => {
        sendResponse(scoreText(message.text));
      });
      return true; // Indicate async response
    } else {
      sendResponse(scoreText(message.text));
    }
  } else if (message.type === 'CAPTURE_VISIBLE_TAB') {
    const windowId = sender.tab ? sender.tab.windowId : null;
    chrome.tabs.captureVisibleTab(windowId, { format: 'jpeg', quality: 90 }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        console.error("Capture Error:", chrome.runtime.lastError.message);
        sendResponse({ error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ dataUrl });
      }
    });
    return true; // async
  }
});

