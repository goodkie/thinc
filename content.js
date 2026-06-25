/**
 * TruthPulse ULTRA - Robust Content Script
 * Optimized for document_start injection.
 */
if (window.top !== window.self) {
  console.log("The Truth Untold: Ignored iframe execution.");
  throw new Error("The Truth Untold stops execution in iframe.");
}

(function emergencyBootMarker() {
  const injectMarker = () => {
    if (!document.documentElement) {
      setTimeout(injectMarker, 10);
      return;
    }
    const marker = document.createElement('div');
    marker.id = 'tp-emergency-marker';
    marker.style = "position:fixed; top:10px; left:10px; background:#ff0000; color:#fff; padding:8px 15px; border-radius:5px; font-size:12px; font-weight:bold; z-index:10000000; pointer-events:none; box-shadow: 0 0 20px rgba(255,0,0,0.5);";
    marker.innerText = "🚨 THE TRUTH UNTOLD LOADED";
    document.documentElement.appendChild(marker);
    setTimeout(() => marker.remove(), 4000);
  };
  
  injectMarker();
})();

console.log("THE TRUTH UNTOLD: Content script loaded.");
const TRANSLATIONS = {
  en: { 
    start: "START", stop: "STOP", scan: "MONITORING", lie: "LIE PROB", avg: "AVG", max: "MAX", summary: "SESSION REPORT", mode: "MODE", lang: "LANG", visual: "Visual", expert: "Expert", mini: "Mini",
    rel: "RELIABILITY", ai_scan: "AI SCAN: ACTIVE", jitter: "JITTER", shimmer: "SHIMMER", hnr: "HNR", ai_prob: "AI PROB", share: "SHARE THE TRUTH", shots: "Screenshots on Lie", autoshow: "Auto-Show",
    timeline: "SESSION TIMELINE ANALYSIS", report_title: "EXECUTIVE ANALYSIS REPORT (EXPERT GRADE)", session_id: "SESSION-ID", vocal_cog: "VOCAL & COGNITIVE ANALYTICS",
    stability: "STABILITY", avg_stress: "AVG STRESS", peak_stress: "PEAK STRESS", truth_content: "TRUTH CONTENT", lie_content: "LIE CONTENT",
    context_audit: "CONTEXTUAL & METADATA AUDIT", genre: "GENRE", integrity: "INTEGRITY INDEX", verdict_label: "EXECUTIVE VERDICT",
    neural_psy: "NEURAL & PSYCHOLOGICAL FINGERPRINTING", agitation: "AGITATION (TEO)", cog_load: "COGNITIVE LOAD (ENTROPY)", deception_density: "DECEPTION DENSITY",
    data_sheet: "SUBTITLE DATA SHEET (FULL RECORD)", time: "TIME", text: "SUBTITLE TEXT", deceptive_log: "DECEPTIVE EVENT LOG (LIES > 60%)",
    save_sheet: "📊 Save (Google Sheet)", share_btn: "Share the Truth", close: "CLOSE", ack_close: "ACKNOWLEDGE & CLOSE",
    ai_warning: "AI SYNTHETIC VOICE DETECTED", ai_warning_sub: "Analysis impossible: Synthetic voice detected.",
    share_report_title: "Share Final Analysis Report", share_report_sub: "Share the Executive Analysis Report",
    capturing: "Capturing report screenshot...", capture_fail: "Failed to capture report. Check permissions.", export_msg: "Analysis exported to CSV (Google Sheets compatible)!"
  },
  ko: { 
    start: "시작", stop: "중단", scan: "모니터링 중", lie: "거짓 확률", avg: "평균", max: "최대", summary: "세션 분석 보고서", mode: "모드", lang: "언어", visual: "비주얼", expert: "전문가", mini: "미니",
    rel: "신뢰도", ai_scan: "AI 스캔: 활성", jitter: "지터", shimmer: "시머", hnr: "조조비", ai_prob: "AI 확률", share: "진실을 알려라", shots: "거짓 포착 시 스크린샷", autoshow: "자동 표시",
    timeline: "세션 타임라인 분석", report_title: "심층 분석 리포트 (전문가 등급)", session_id: "세션 ID", vocal_cog: "음성 및 인지 분석",
    stability: "안정성", avg_stress: "평균 스트레스", peak_stress: "최고 스트레스", truth_content: "진실 함유량", lie_content: "거짓 함유량",
    context_audit: "문맥 및 메타데이터 감사", genre: "장르", integrity: "무결성 지수", verdict_label: "종합 판정",
    neural_psy: "신경 및 심리 지문", agitation: "동요도 (TEO)", cog_load: "인지 부하 (엔트로피)", deception_density: "기만 밀도",
    data_sheet: "자막 데이터 시트 (전체 기록)", time: "시간", text: "자막 내용", deceptive_log: "기만 이벤트 로그 (거짓 > 60%)",
    save_sheet: "📊 저장 (구글시트)", share_btn: "진실 공유하기", close: "닫기", ack_close: "확인 및 닫기",
    ai_warning: "AI 합성 음성 감지됨", ai_warning_sub: "분석 불가: 합성된 목소리가 감지되었습니다.",
    share_report_title: "최종 분석 리포트 공유", share_report_sub: "심층 분석 리포트를 공유합니다",
    capturing: "리포트 스크린샷 캡처 중...", capture_fail: "캡처 실패. 권한을 확인하세요.", export_msg: "분석 데이터가 CSV(구글 시트 호환)로 내보내졌습니다!"
  },
  jp: { 
    start: "開始", stop: "停止", scan: "監視中", lie: "嘘の確率", avg: "平均", max: "最大", summary: "セッション分析", mode: "モード", lang: "言語", visual: "ビジュアル", expert: "エキスパート", mini: "ミニ",
    rel: "信頼度", ai_scan: "AIスキャン: 有効", jitter: "ジッター", shimmer: "シマー", hnr: "HNR", ai_prob: "AI確率", share: "真実を伝える", shots: "嘘検出時のスクリーンショット", autoshow: "自動表示",
    timeline: "タイムライン分析", report_title: "エグゼクティブ分析レポート", session_id: "セッションID", vocal_cog: "音声・認知分析",
    stability: "安定性", avg_stress: "平均ストレス", peak_stress: "最大ストレス", truth_content: "真実の内容", lie_content: "嘘の内容",
    context_audit: "コンテキスト監査", genre: "ジャンル", integrity: "完全性指標", verdict_label: "総合判定",
    neural_psy: "心理的フィンガープリント", agitation: "動揺度", cog_load: "認知負荷", deception_density: "欺瞞密度",
    data_sheet: "データシート (全記録)", time: "時間", text: "テキスト", deceptive_log: "欺瞞ログ (嘘 > 60%)",
    save_sheet: "📊 保存 (Googleシート)", share_btn: "真実を共有", close: "閉じる", ack_close: "確認して閉じる",
    ai_warning: "AI合成音声検出", ai_warning_sub: "分析不可: 合成音声が検出されました。",
    share_report_title: "レポートの共有", share_report_sub: "分析レポートを共有します",
    capturing: "キャプチャ中...", capture_fail: "失敗しました。権限を確認してください。", export_msg: "CSVでエクスポートされました！"
  },
  zh: { 
    start: "开始", stop: "停止", scan: "监测中", lie: "谎言概率", avg: "平均", max: "最大", summary: "阶段分析报告", mode: "模式", lang: "语言", visual: "视觉", expert: "专家", mini: "微型",
    rel: "置信度", ai_scan: "AI 扫描: 激活", jitter: "抖动", shimmer: "闪烁", hnr: "谐噪比", ai_prob: "AI 概率", share: "揭示真相", shots: "谎言截图", autoshow: "自动显示",
    timeline: "会话时间线分析", report_title: "执行分析报告 (专家级)", session_id: "会话 ID", vocal_cog: "语音和认知分析",
    stability: "稳定性", avg_stress: "平均压力", peak_stress: "峰值压力", truth_content: "真实内容", lie_content: "谎言内容",
    context_audit: "上下文和元数据审计", genre: "类型", integrity: "完整性指数", verdict_label: "执行结论",
    neural_psy: "神经和心理指纹", agitation: "焦躁度", cog_load: "认知负荷", deception_density: "欺骗密度",
    data_sheet: "数据表 (完整记录)", time: "时间", text: "文本内容", deceptive_log: "欺骗事件日志 (谎言 > 60%)",
    save_sheet: "📊 保存 (Google 表格)", share_btn: "分享真相", close: "关闭", ack_close: "确认并关闭",
    ai_warning: "检测到 AI 合成语音", ai_warning_sub: "无法分析：检测到合成语音。",
    share_report_title: "分享分析报告", share_report_sub: "分享执行分析报告",
    capturing: "正在截屏...", capture_fail: "截屏失败。请检查权限。", export_msg: "已导出为 CSV！"
  }
};

let isRunning = false;
let sessionData = [];
let sensitivity = 5;
let viewMode = 'visual';
let currentLang = 'en';
let autoShow = true;
let animationId = null;
let analyzer = null;
let audioCtx = null;
let source = null;

let screenshotCount = 3;
let isCapturingTruth = false;

chrome.storage.local.get(['lang', 'viewMode', 'autoShow', 'screenshotCount'], (res) => {
  if (res.lang) currentLang = res.lang;
  if (res.viewMode) viewMode = res.viewMode;
  if (res.autoShow !== undefined) autoShow = res.autoShow;
  if (res.screenshotCount !== undefined) screenshotCount = res.screenshotCount;
  
  if (document.getElementById('truthpulse-hud')) {
    const existingHud = document.getElementById('truthpulse-hud');
    const isHidden = existingHud.style.display === 'none';
    const isSettingsOpen = !document.getElementById('tp-quick-settings').classList.contains('hidden');
    
    initHUD(() => {
      if (isHidden) document.getElementById('truthpulse-hud').style.display = 'none';
      if (isSettingsOpen) document.getElementById('tp-quick-settings').classList.remove('hidden');
    });
  }
});

let displayedScore = 0;
let targetScore = 0;
let videoCategory = "General";
let categoryBias = 1.0;
let reliabilityScore = 70;
let reliabilityGrade = "Medium";

let historyPoints = [];
let currentSubtitle = "";
let subtitleRecords = [];
let currentSubRecord = null;

// 6-Level Trust Classification
let trustLevel = 0;       // 0 = unclassified, 1-6 = matched level
let trustFloor = 0;       // Minimum lie% floor based on matched level
let trustLabel = '';      // Human-readable label
let trustColor = '#888';  // Badge color

// Global score reduction factor: 0.67 = 33% reduction across all scores
const GLOBAL_SCORE_MULTIPLIER = 0.67;

// The dictionary is now loaded from dictionary.js
const RELIABILITY_CONSTANTS = window.TP_DICTIONARY || {
  GENRE_BASE: { news: 85, education: 80, science_technology: 75, finance: 60, health_medical: 55, politics_opinion: 50, entertainment_rumor: 40, shorts_memes: 30 },
  OFFICIAL_CHANNELS: ["official"], EXPERT_CHANNELS: ["dr"], CLICKBAIT: ["shocking"], SOURCES: ["study"],
  POLITICIANS: [], RELIGIOUS_FIGURES: []
};

console.log("The Truth Untold: Script initialized.");

function t(key) {
  const langData = TRANSLATIONS[currentLang] || TRANSLATIONS['en'];
  return langData[key] || key;
}

function initHUD(callback) {
  console.log("The Truth Untold: initHUD called.");
  const existingHud = document.getElementById('truthpulse-hud');
  if (existingHud) {
    console.log("The Truth Untold: Removing existing HUD.");
    existingHud.remove();
  }
  
  try {
    renderHUD();
    console.log("The Truth Untold: HUD rendered successfully.");
    if (callback) callback();
  } catch (err) {
    console.error("The Truth Untold: CRITICAL ERROR during initHUD", err);
  }
}

// Removed initHUDDelayed as logic is integrated into initHUD

function renderHUD() {
  try {
    const hud = document.createElement('div');
    hud.id = 'truthpulse-hud';
    hud.className = `tp-pro-theme tp-mode-${viewMode}`;
    // Force maximum visibility inline
    hud.style.cssText = "position:fixed; top:80px; right:20px; z-index:2147483647; background:rgba(5, 5, 10, 0.95); backdrop-filter:blur(30px); border:2px solid #00f2fe; border-radius:20px; min-width:340px; color:#fff; font-family:sans-serif; display:block;";
    
    const categoryBadge = `
      <div class="tp-badge-row">
        <div id="tp-cat-badge" class="tp-category-badge">${videoCategory.toUpperCase()}</div>
        <div id="tp-rel-badge" class="tp-reliability-badge grade-${reliabilityGrade.replace(' ', '-').toLowerCase()}">${reliabilityScore}% ${t('rel')}</div>
        <div id="tp-ai-badge" class="tp-ai-scanner-badge">${t('ai_scan')}</div>
        <div id="tp-music-badge" class="tp-music-badge hidden">MUSIC/FX</div>
        <div id="tp-trust-badge" class="tp-trust-badge${trustLevel === 0 ? ' hidden' : ''}" style="border-color:${trustColor};color:${trustColor}">${trustLabel} — BASE ${trustFloor}%</div>
      </div>
    `;

    let bodyHTML = "";
    if (viewMode === 'visual') {
      bodyHTML = `
        <div class="tp-main-stats">
          <div class="tp-scan-line"></div>
          <div class="tp-gauge-wrapper">
            <svg viewBox="0 0 36 36" class="tp-circular-chart">
              <path class="circle-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
              <path class="circle" id="tp-circle-fill" stroke-dasharray="0, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
              <text x="18" y="20.35" class="tp-percentage" id="tp-main-prob">0%</text>
            </svg>
          </div>
          <div class="tp-live-label">${t('lie')}</div>
        </div>
      `;
    } else if (viewMode === 'expert') {
      bodyHTML = `
        <div class="tp-expert-grid">
          <div class="tp-exp-card"><span>${t('jitter')}</span><div class="tp-exp-val" id="tp-val-jitter">0.00</div></div>
          <div class="tp-exp-card"><span>${t('shimmer')}</span><div class="tp-exp-val" id="tp-val-shimmer">0.00</div></div>
          <div class="tp-exp-card"><span>CENTROID</span><div class="tp-exp-val" id="tp-val-centroid">0.00</div></div>
          <div class="tp-exp-card"><span>ROLLOFF</span><div class="tp-exp-val" id="tp-val-rolloff">0.00</div></div>
          <div class="tp-exp-card"><span>AI PROB</span><div class="tp-exp-val" id="tp-val-ai" style="color: #ff416c;">0%</div></div>
          <div class="tp-exp-card"><span>GAIN (AGC)</span><div class="tp-exp-val" id="tp-val-gain">1.0x</div></div>
        </div>
      `;
    }

    const subtitleHTML = viewMode !== 'mini' ? `
      <div class="tp-subtitle-area">
        <div class="tp-sentence-viewer" id="tp-sentence-list">
          <div class="tp-sentence-placeholder">${t('scan')}...</div>
        </div>
      </div>
    ` : "";

    const headerHTML = `
      <div class="tp-header">
        <div class="tp-logo-group">
          <span class="tp-logo">THE TRUTH UNTOLD <span class="tp-ai-tag">AI ALPHA</span></span>
          <div class="tp-pulse-wave"></div>
        </div>
        <div class="tp-controls-top">
          <button id="tp-settings-btn" class="tp-icon-btn">⚙️</button>
          <button id="tp-minimize-hud" class="tp-icon-btn">➖</button>
          <button id="tp-close-hud" class="tp-icon-btn tp-close-x">✕</button>
        </div>
      </div>
      <div class="tp-center-action">
        <button id="tp-toggle-btn" class="tp-btn-massive tp-btn-${isRunning ? 'stop' : 'start'}">${isRunning ? t('stop') : t('start')}</button>
      </div>
      <div class="tp-sophisticated-share-zone">
        <button id="tp-massive-share-btn" class="tp-sophisticated-btn">
          <div class="tp-share-icon-wrapper">
            <svg class="tp-share-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="18" cy="5" r="3"></circle>
              <circle cx="6" cy="12" r="3"></circle>
              <circle cx="18" cy="19" r="3"></circle>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
            </svg>
          </div>
          <span class="tp-share-text">${t('share')}</span>
        </button>
        <div class="tp-share-count-ctrl">
          <button id="tp-count-minus" class="tp-ctrl-btn">❮</button>
          <span id="tp-mini-count-display">${screenshotCount}</span>
          <button id="tp-count-plus" class="tp-ctrl-btn">❯</button>
        </div>
      </div>
      ${categoryBadge}
      <div id="tp-quick-settings" class="tp-quick-settings hidden">
        <div class="tp-qs-item">
          <span>${t('mode')}</span>
          <div id="tp-qs-mode" class="tp-segmented-control">
            <button class="tp-segment-btn ${viewMode === 'visual' ? 'active' : ''}" data-value="visual">${t('visual')}</button>
            <button class="tp-segment-btn ${viewMode === 'expert' ? 'active' : ''}" data-value="expert">${t('expert')}</button>
            <button class="tp-segment-btn ${viewMode === 'mini' ? 'active' : ''}" data-value="mini">${t('mini')}</button>
          </div>
        </div>
        <div class="tp-qs-item">
          <span>${t('lang')}</span>
          <div id="tp-qs-lang" class="tp-chip-grid">
            <button class="tp-lang-chip ${currentLang === 'en' ? 'active' : ''}" data-value="en">EN</button>
            <button class="tp-lang-chip ${currentLang === 'ko' ? 'active' : ''}" data-value="ko">KO</button>
            <button class="tp-lang-chip ${currentLang === 'jp' ? 'active' : ''}" data-value="jp">JP</button>
            <button class="tp-lang-chip ${currentLang === 'zh' ? 'active' : ''}" data-value="zh">ZH</button>
            <button class="tp-lang-chip ${currentLang === 'fr' ? 'active' : ''}" data-value="fr">FR</button>
            <button class="tp-lang-chip ${currentLang === 'de' ? 'active' : ''}" data-value="de">DE</button>
            <button class="tp-lang-chip ${currentLang === 'es' ? 'active' : ''}" data-value="es">ES</button>
            <button class="tp-lang-chip ${currentLang === 'it' ? 'active' : ''}" data-value="it">IT</button>
            <button class="tp-lang-chip ${currentLang === 'pt' ? 'active' : ''}" data-value="pt">PT</button>
            <button class="tp-lang-chip ${currentLang === 'ru' ? 'active' : ''}" data-value="ru">RU</button>
            <button class="tp-lang-chip ${currentLang === 'ar' ? 'active' : ''}" data-value="ar">AR</button>
            <button class="tp-lang-chip ${currentLang === 'hi' ? 'active' : ''}" data-value="hi">HI</button>
          </div>
        </div>
        <div class="tp-qs-item">
          <span>${t('shots')}</span>
          <div class="tp-slider-wrap">
            <input type="range" id="tp-qs-shots" class="tp-slider" min="1" max="5" value="${screenshotCount}">
            <span class="tp-slider-val" id="tp-qs-shots-val">${screenshotCount}</span>
          </div>
        </div>
        <div class="tp-qs-item-inline">
          <span>${t('autoshow')}</span>
          <input type="checkbox" id="tp-qs-autoshow" ${autoShow ? 'checked' : ''}>
        </div>
      </div>
    `;

    const bottomChartHTML = viewMode !== 'mini' ? `
      <div class="tp-history-chart-container">
        <div class="tp-chart-header">${t('timeline')}</div>
        <canvas id="tp-history-line-chart"></canvas>
      </div>
      <div class="tp-history-chart-container" style="margin-top: 10px; border-color: rgba(162, 89, 255, 0.2);">
        <div class="tp-chart-header" style="color: #a259ff;">PSYCHOLOGICAL FINGERPRINT (SPECTRAL)</div>
        <canvas id="tp-fingerprint-chart"></canvas>
      </div>
    ` : "";

    const summaryHTML = `
      <div id="tp-summary" class="tp-summary-overlay hidden">
        <div class="tp-summary-modal">
          <div class="tp-summary-header">
            <h2>${t('report_title')}</h2>
            <div class="tp-report-id">${t('session_id')}: ${Math.random().toString(36).substr(2, 9).toUpperCase()}</div>
          </div>
          
          <div class="tp-summary-grid">
            <div class="tp-sum-section">
              <h4>${t('vocal_cog')}</h4>
              <div class="tp-sum-chart-box"><canvas id="tp-sum-chart"></canvas></div>
              <div class="tp-biometric-grid">
                <div class="tp-bio-item">${t('stability')}: <span id="tp-report-stability">-</span></div>
                <div class="tp-bio-item">${t('avg_stress')}: <span id="tp-report-avg">-</span></div>
                <div class="tp-bio-item">${t('peak_stress')}: <span id="tp-report-peak">-</span></div>
              </div>
              <div class="tp-content-ratio-box mt-10">
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                  <div class="tp-bio-item" style="font-size: 10px;">${t('truth_content')}: <span id="tp-report-truth-ratio" style="color: #00f2fe">-</span></div>
                  <div class="tp-bio-item" style="font-size: 10px;">${t('lie_content')}: <span id="tp-report-lie-ratio" style="color: #ff416c">-</span></div>
                </div>
                <div style="width: 100%; height: 12px; background: rgba(255,255,255,0.1); border-radius: 6px; overflow: hidden; display: flex;">
                  <div id="tp-bar-truth" style="height: 100%; background: #00f2fe; width: 0%; transition: width 1s ease-in-out;"></div>
                  <div id="tp-bar-lie" style="height: 100%; background: #ff416c; width: 0%; transition: width 1s ease-in-out;"></div>
                </div>
              </div>
            </div>
            
            <div class="tp-sum-section">
              <h4>${t('context_audit')}</h4>
              <div class="tp-audit-box">
                <div class="tp-audit-row"><span>${t('genre')}:</span> <span id="tp-report-genre">-</span></div>
                <div class="tp-audit-row"><span>${t('rel')}:</span> <span id="tp-report-rel">-</span></div>
                <div class="tp-audit-row"><span>${t('integrity')}:</span> <span id="tp-report-integrity">-</span></div>
              </div>
              <div class="tp-verdict-box">
                <div class="tp-verdict-label">${t('verdict_label')}</div>
                <div id="tp-report-verdict" class="tp-verdict-text">-</div>
              </div>
            </div>

            <div class="tp-sum-section" style="grid-column: span 2; margin-top: 10px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 15px;">
              <h4>${t('neural_psy')}</h4>
              <div id="tp-report-psyche" style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px;">
                <div class="tp-psy-item" style="background: rgba(255,255,255,0.03); padding: 10px; border-radius: 8px; text-align: center;">
                  <span style="font-size: 8px; color: rgba(255,255,255,0.4); display: block; margin-bottom: 5px;">${t('agitation')}</span>
                  <div id="tp-psy-agitation" style="font-size: 16px; font-weight: 900; color: #ff416c;">-</div>
                </div>
                <div class="tp-psy-item" style="background: rgba(255,255,255,0.03); padding: 10px; border-radius: 8px; text-align: center;">
                  <span style="font-size: 8px; color: rgba(255,255,255,0.4); display: block; margin-bottom: 5px;">${t('cog_load')}</span>
                  <div id="tp-psy-evasiveness" style="font-size: 16px; font-weight: 900; color: #f7971e;">-</div>
                </div>
                <div class="tp-psy-item" style="background: rgba(255,255,255,0.03); padding: 10px; border-radius: 8px; text-align: center;">
                  <span style="font-size: 8px; color: rgba(255,255,255,0.4); display: block; margin-bottom: 5px;">${t('deception_density')}</span>
                  <div id="tp-psy-density" style="font-size: 16px; font-weight: 900; color: #00f2fe;">-</div>
                </div>
              </div>
            </div>
          </div>

          <div class="tp-data-sheet-section" style="margin-top: 20px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 15px;">
            <div class="tp-verdict-label" style="color: #00f2fe; margin-bottom: 10px;">${t('data_sheet')}</div>
            <div id="tp-report-data-sheet" style="max-height: 300px; overflow-y: auto; background: rgba(0,0,0,0.4); border-radius: 8px; font-family: 'Consolas', monospace; font-size: 9px; padding: 0;">
              <table style="width: 100%; border-collapse: collapse; color: #fff;">
                <thead style="position: sticky; top: 0; background: #1a1a2e; border-bottom: 1px solid #444;">
                  <tr>
                    <th style="padding: 8px; text-align: left; width: 60px;">${t('time')}</th>
                    <th style="padding: 8px; text-align: left;">${t('text')}</th>
                    <th style="padding: 8px; text-align: center; width: 50px;">LIE%</th>
                    <th style="padding: 8px; text-align: center; width: 50px;">AI%</th>
                    <th style="padding: 8px; text-align: center; width: 50px;">COG.L</th>
                  </tr>
                </thead>
                <tbody id="tp-data-sheet-body">
                  <!-- Data rows injected here -->
                </tbody>
              </table>
            </div>
          </div>
          
          <div class="tp-detected-lies-section" style="margin-top: 20px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 15px;">
            <div class="tp-verdict-label" style="color: #ff416c; margin-bottom: 10px;">${t('deceptive_log')}</div>
            <div id="tp-report-lies-list" style="max-height: 150px; overflow-y: auto; font-size: 10px; color: rgba(255,255,255,0.8); background: rgba(0,0,0,0.3); padding: 10px; border-radius: 8px;">
              -
            </div>
          </div>

          <div class="tp-summary-actions" style="display: flex; gap: 10px; margin-top: 20px;">
            <button id="tp-save-sheet-direct" class="tp-pro-btn" style="background: linear-gradient(90deg, #0f9d58, #0b8043); color: #fff; flex: 1;">${t('save_sheet')}</button>
            <button id="tp-share-report-btn" class="tp-pro-btn" style="background: linear-gradient(90deg, #ff416c, #ff4b2b); color: #fff; flex: 1;">${t('share_btn')}</button>
            <button id="tp-close-summary" class="tp-pro-btn" style="flex: 1;">${t('close')}</button>
          </div>
        </div>
      </div>
    `;

    hud.innerHTML = headerHTML + '<div class="tp-body">' + bodyHTML + subtitleHTML + bottomChartHTML + '</div>';
    document.documentElement.appendChild(hud);

    // Create and append summary overlay separately to avoid CSS clipping by parent HUD
    const existingSummary = document.getElementById('tp-summary');
    if (existingSummary) existingSummary.remove();
    const summaryWrapper = document.createElement('div');
    summaryWrapper.innerHTML = summaryHTML;
    document.documentElement.appendChild(summaryWrapper.firstElementChild);

    // AI Warning Overlay
    const existingWarning = document.getElementById('tp-ai-warning');
    if (existingWarning) existingWarning.remove();
    const aiWarning = document.createElement('div');
    aiWarning.id = 'tp-ai-warning';
    aiWarning.className = 'tp-ai-warning hidden';
    aiWarning.innerHTML = `
      <div class="tp-ai-warning-content">
        <div class="tp-ai-warning-icon">🚫</div>
        <div class="tp-ai-warning-text">${t('ai_warning')}</div>
        <div class="tp-ai-warning-sub">${t('ai_warning_sub')}</div>
      </div>
    `;
    const targetContainer = document.body || document.documentElement;
    targetContainer.appendChild(aiWarning);

    historyCanvas = document.getElementById('tp-history-line-chart');
    if (historyCanvas) {
      historyCtx = historyCanvas.getContext('2d');
      historyCanvas.width = 280;
      historyCanvas.height = 40;
    }

    // Event Listeners
    document.getElementById('tp-toggle-btn').onclick = toggleSession;
    document.getElementById('tp-settings-btn').onclick = () => {
      document.getElementById('tp-quick-settings').classList.toggle('hidden');
    };

    document.querySelectorAll('#tp-qs-mode .tp-segment-btn').forEach(btn => {
      btn.onclick = (e) => {
        document.querySelectorAll('#tp-qs-mode .tp-segment-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        chrome.storage.local.set({ viewMode: e.target.dataset.value });
      };
    });

    document.querySelectorAll('#tp-qs-lang .tp-lang-chip').forEach(btn => {
      btn.onclick = (e) => {
        document.querySelectorAll('#tp-qs-lang .tp-lang-chip').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        currentLang = e.target.dataset.value;
        chrome.storage.local.set({ lang: currentLang });
        // Re-render the HUD with the new language
        const isSettingsOpen = !document.getElementById('tp-quick-settings').classList.contains('hidden');
        initHUD(() => {
          if (isSettingsOpen) {
            document.getElementById('tp-quick-settings').classList.remove('hidden');
          }
        });
      };
    });

    const shotsSlider = document.getElementById('tp-qs-shots');
    const shotsVal = document.getElementById('tp-qs-shots-val');
    if (shotsSlider) {
      shotsSlider.oninput = (e) => {
        screenshotCount = parseInt(e.target.value);
        shotsVal.innerText = screenshotCount;
        chrome.storage.local.set({ screenshotCount });
      };
    }

    document.getElementById('tp-qs-autoshow').onchange = (e) => {
      chrome.storage.local.set({ autoShow: e.target.checked });
    };

    document.getElementById('tp-massive-share-btn').onclick = () => {
      const video = document.querySelector('video');
      if (video) triggerTruthCapture(video, displayedScore);
      else showToast("No active video found to capture.");
    };

    document.getElementById('tp-count-minus').onclick = () => {
      if (screenshotCount > 1) {
        screenshotCount--;
        updateCountUI();
      }
    };
    document.getElementById('tp-count-plus').onclick = () => {
      if (screenshotCount < 5) {
        screenshotCount++;
        updateCountUI();
      }
    };

    function updateCountUI() {
      document.getElementById('tp-mini-count-display').innerText = screenshotCount;
      if (document.getElementById('tp-qs-shots')) {
        document.getElementById('tp-qs-shots').value = screenshotCount;
        document.getElementById('tp-qs-shots-val').innerText = screenshotCount;
      }
      chrome.storage.local.set({ screenshotCount });
    }

    document.getElementById('tp-close-hud').onclick = () => {
      hud.style.display = 'none';
      isRunning = false;
      if (animationId) cancelAnimationFrame(animationId);
      
      // Show reveal trigger
      createRevealTrigger(false);
    };

    document.getElementById('tp-minimize-hud').onclick = () => {
      hud.style.display = 'none';
      // Do NOT set isRunning to false. Session continues.
      createRevealTrigger(true);
    };

    function createRevealTrigger(isMinimizedAndRunning) {
      const existingTrigger = document.getElementById('tp-reveal-trigger');
      if (!existingTrigger) {
        const revealBtn = document.createElement('div');
        revealBtn.id = 'tp-reveal-trigger';
        if (isMinimizedAndRunning) {
          revealBtn.classList.add('tp-glowing-neon');
        }
        revealBtn.innerHTML = `<img src="${chrome.runtime.getURL('icon.png')}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
        revealBtn.title = 'Open The Truth Untold AI';
        revealBtn.onclick = () => {
          hud.style.display = 'block';
          revealBtn.remove();
        };
        const target = document.body || document.documentElement;
        if (target) target.appendChild(revealBtn);
      } else {
        if (isMinimizedAndRunning) {
          existingTrigger.classList.add('tp-glowing-neon');
        } else {
          existingTrigger.classList.remove('tp-glowing-neon');
        }
      }
    }

    if (viewMode !== 'mini') {
      const shareReportBtn = document.getElementById('tp-share-report-btn');
      if (shareReportBtn) {
        shareReportBtn.onclick = async () => {
          showToast("Capturing report screenshot...");
          const response = await new Promise(resolve => {
            chrome.runtime.sendMessage({ type: 'CAPTURE_VISIBLE_TAB' }, resolve);
          });
          
          if (response && response.dataUrl) {
            const reportScore = parseInt(document.getElementById('tp-report-peak').innerText) || 85;
            showTruthAlertUI([response.dataUrl], reportScore, 'report');
          } else {
            showToast("Failed to capture report. Ensure extension has permissions.");
          }
        };
      }

      const saveSheetDirect = document.getElementById('tp-save-sheet-direct');
      if (saveSheetDirect) {
        saveSheetDirect.onclick = () => exportToSheet();
      }

      const closeBtn = document.getElementById('tp-close-summary');
      if (closeBtn) {
        closeBtn.onclick = () => {
          document.getElementById('tp-summary').classList.add('hidden');
        };
      }
    }
  } catch (err) {
    console.error("The Truth Untold: Error rendering HUD", err);
  }
}

function toggleSession() {
  isRunning = !isRunning;
  if (isRunning) {
    sessionData = [];
    subtitleRecords = [];
    currentSubRecord = null;
    initHUD(() => {
      startAnalysis();
    });
  } else {
    if (animationId) cancelAnimationFrame(animationId);
    initHUD(() => {
      setTimeout(() => { showSummary(); }, 100); // Small delay to ensure DOM is ready
    });
  }
}

async function showSummary() {
  const summary = document.getElementById('tp-summary');
  if (!summary) return;
  
  await calculateReliability();

  if (sessionData.length === 0) {
    document.getElementById('tp-report-avg').innerText = `N/A`;
    document.getElementById('tp-report-peak').innerText = `N/A`;
    document.getElementById('tp-report-stability').innerText = `N/A`;
    document.getElementById('tp-report-genre').innerText = videoCategory.toUpperCase();
    document.getElementById('tp-report-rel').innerText = `${reliabilityScore}% (${reliabilityGrade})`;
    document.getElementById('tp-report-integrity').innerText = `N/A`;
    document.getElementById('tp-report-verdict').innerText = "NO VOCAL DATA: The session ended without detecting any clear vocal input.";
    document.getElementById('tp-report-verdict').className = `tp-verdict-text v-warn`;
    document.getElementById('tp-report-lies-list').innerHTML = "No lies detected (empty session).";
    summary.classList.remove('hidden');
    return;
  }

  const scores = sessionData.map(d => d.score);
  const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  const max = Math.max(...scores);
  const stability = Math.max(0, 100 - (max - avg) * 2);

  // Calculate Truth/Lie Ratio
  let lieFrames = 0;
  let truthFrames = 0;
  scores.forEach(s => {
    if (s >= 50) lieFrames++;
    else truthFrames++;
  });
  const totalFrames = scores.length || 1;
  const lieRatio = Math.round((lieFrames / totalFrames) * 100);
  const truthRatio = 100 - lieRatio;

  // Fill Report Data
  document.getElementById('tp-report-avg').innerText = `${avg}%`;
  document.getElementById('tp-report-peak').innerText = `${max}%`;
  document.getElementById('tp-report-stability').innerText = `${stability}%`;
  document.getElementById('tp-report-truth-ratio').innerText = `${truthRatio}%`;
  document.getElementById('tp-report-lie-ratio').innerText = `${lieRatio}%`;
  
  // Set Bar Graph Widths
  setTimeout(() => {
    const bTruth = document.getElementById('tp-bar-truth');
    const bLie = document.getElementById('tp-bar-lie');
    if (bTruth) bTruth.style.width = `${truthRatio}%`;
    if (bLie) bLie.style.width = `${lieRatio}%`;
  }, 100);

  document.getElementById('tp-report-genre').innerText = videoCategory.toUpperCase();
  document.getElementById('tp-report-rel').innerText = `${reliabilityScore}% (${reliabilityGrade})`;
  
  const integrity = Math.round((stability * 0.4) + (reliabilityScore * 0.6));
  document.getElementById('tp-report-integrity').innerText = `${integrity}%`;

  // Psychological Calculation (Super Strong)
  const agitation = Math.min(100, Math.round(max * 1.15));
  const evasiveness = Math.round((lieRatio * 0.8) + (max * 0.2));
  const density = Math.round(scores.filter(s => s > 55).length / totalFrames * 100);

  document.getElementById('tp-psy-agitation').innerText = `${agitation}%`;
  document.getElementById('tp-psy-evasiveness').innerText = `${evasiveness}%`;
  document.getElementById('tp-psy-density').innerText = `${density}%`;

  // Process Detected Lies - Show all chronologically (Threshold lowered to 60%)
  const liesList = [];
  let currentLieText = null;
  let currentLieMaxScore = 0;
  let currentLieTime = null;

  sessionData.forEach(d => {
    if (d.text && d.text.length > 2) {
      if (d.text !== currentLieText) {
        if (currentLieText && currentLieMaxScore >= 60) {
          liesList.push(`<div style="margin-bottom: 8px; padding: 8px; background: rgba(255,65,108,0.1); border-left: 3px solid #ff416c; border-radius: 4px;">
            <div style="font-weight: bold; color: #ff416c; margin-bottom: 4px;">DECEPTION DETECTED [${currentLieMaxScore}%] - ${new Date(currentLieTime).toLocaleTimeString()}</div>
            <div style="font-size: 11px; color: #fff;">"${currentLieText}"</div>
          </div>`);
        }
        currentLieText = d.text;
        currentLieMaxScore = d.score;
        currentLieTime = d.timestamp;
      } else {
        if (d.score > currentLieMaxScore) {
          currentLieMaxScore = d.score;
        }
      }
    }
  });

  if (currentLieText && currentLieMaxScore >= 60) {
    liesList.push(`<div style="margin-bottom: 8px; padding: 8px; background: rgba(255,65,108,0.1); border-left: 3px solid #ff416c; border-radius: 4px;">
      <div style="font-weight: bold; color: #ff416c; margin-bottom: 4px;">DECEPTION DETECTED [${currentLieMaxScore}%] - ${new Date(currentLieTime).toLocaleTimeString()}</div>
      <div style="font-size: 11px; color: #fff;">"${currentLieText}"</div>
    </div>`);
  }

  const liesHTML = liesList.length > 0 ? liesList.join('') : "No significant deceptions detected during this session.";
  document.getElementById('tp-report-lies-list').style.maxHeight = "150px";
  document.getElementById('tp-report-lies-list').innerHTML = liesHTML;

  // Render FULL DATA SHEET
  const dataSheetBody = document.getElementById('tp-data-sheet-body');
  if (dataSheetBody) {
    dataSheetBody.innerHTML = subtitleRecords.map(rec => {
      const avgScore = Math.round(rec.scores.reduce((a,b)=>a+b,0) / rec.scores.length);
      const avgAI = Math.round(rec.aiScores.reduce((a,b)=>a+b,0) / rec.aiScores.length);
      const avgEntropy = (rec.entropyScores.reduce((a,b)=>a+b,0) / rec.entropyScores.length).toFixed(2);
      const color = avgScore > 60 ? '#ff416c' : avgScore > 40 ? '#f7971e' : '#00f2fe';
      
      return `
        <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
          <td style="padding: 6px 8px; color: rgba(255,255,255,0.5);">${new Date(rec.startTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit'})}</td>
          <td style="padding: 6px 8px; color: #fff;">${rec.text}</td>
          <td style="padding: 6px 8px; text-align: center; color: ${color}; font-weight: 900;">${avgScore}%</td>
          <td style="padding: 6px 8px; text-align: center; color: ${avgAI > 50 ? '#ff416c' : '#fff'};">${avgAI}%</td>
          <td style="padding: 6px 8px; text-align: center; color: #fff;">${avgEntropy}</td>
        </tr>
      `;
    }).join('');
  }

  // Additional Stats
  const duration = Math.round((Date.now() - sessionData[0].timestamp) / 1000);
  const totalScanned = sessionData.length;
  
  const statsBox = document.createElement('div');
  statsBox.className = 'tp-audit-box';
  statsBox.style.marginTop = '15px';
  statsBox.innerHTML = `
    <div class="tp-audit-row"><span>SESSION DURATION:</span> <span>${duration}s</span></div>
    <div class="tp-audit-row"><span>SAMPLES COLLECTED:</span> <span>${totalScanned}</span></div>
    <div class="tp-audit-row"><span>AI CONFIDENCE:</span> <span>${Math.min(99, 85 + (totalScanned/100))}%</span></div>
  `;
  document.getElementById('tp-report-verdict').parentNode.insertBefore(statsBox, document.getElementById('tp-report-verdict'));

  // AI Voice Summary
  const avgAI = sessionData.reduce((a, b) => a + (b.ai || 0), 0) / sessionData.length;
  if (avgAI > 60) {
    const aiBox = document.createElement('div');
    aiBox.className = 'tp-sum-section';
    aiBox.style.gridColumn = 'span 2';
    aiBox.style.background = 'rgba(255, 65, 108, 0.1)';
    aiBox.style.border = '1px solid #ff416c';
    aiBox.style.padding = '15px';
    aiBox.style.borderRadius = '12px';
    aiBox.style.marginTop = '15px';
    aiBox.innerHTML = `
      <h4 style="color: #ff416c; margin-bottom: 5px;">⚠️ SYNTHETIC VOICE DETECTED</h4>
      <p style="font-size: 11px; color: #fff; margin: 0;">This audio contains high-probability synthetic markers (Probability: ${Math.round(avgAI)}%). Vocal stress analysis is medically invalid for AI-generated voices.</p>
    `;
    document.getElementById('tp-report-verdict').parentNode.insertBefore(aiBox, document.getElementById('tp-report-verdict'));
  }

  // Verdict Logic
  let verdict = "";
  if (integrity > 85) verdict = "HIGHLY CREDIBLE: Statements show consistent vocal stability and high context reliability.";
  else if (integrity > 65) verdict = "CREDIBLE: Minor vocal fluctuations noted, but overall integrity remains positive.";
  else if (integrity > 40) verdict = "CAUTION: Significant stress detected during key statements. Verification required.";
  else verdict = "HIGH RISK: Pattern of deceptive vocal traits combined with low contextual reliability.";
  
  document.getElementById('tp-report-verdict').innerText = verdict;
  document.getElementById('tp-report-verdict').className = `tp-verdict-text v-${integrity > 65 ? 'good' : integrity > 40 ? 'warn' : 'bad'}`;

  summary.classList.remove('hidden');
  setTimeout(drawSummaryChart, 100);
}

function drawSummaryChart() {
  const canvas = document.getElementById('tp-sum-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width = 300; canvas.height = 100;
  
  const scores = sessionData.map(d => d.score);
  ctx.strokeStyle = '#00f2fe';
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  const step = canvas.width / Math.max(1, scores.length);
  scores.forEach((d, i) => {
    const x = i * step;
    const y = canvas.height - (d / 100 * canvas.height);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Gradient fill
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, 'rgba(0, 242, 254, 0.2)');
  grad.addColorStop(1, 'rgba(0, 242, 254, 0)');
  ctx.fillStyle = grad;
  ctx.lineTo(canvas.width, canvas.height);
  ctx.lineTo(0, canvas.height);
  ctx.fill();
}

async function startAnalysis() {
  if (!isRunning) return;
  const video = document.querySelector('video');
  if (!video) return;

  // Auto-enable Captions if possible
  try {
    const ccBtn = document.querySelector('.ytp-subtitles-button');
    if (ccBtn && ccBtn.getAttribute('aria-pressed') === 'false') {
      ccBtn.click();
    }
  } catch (e) {}

  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (typeof VoiceStressAnalyzer !== 'undefined') {
        analyzer = new VoiceStressAnalyzer(audioCtx);
        source = audioCtx.createMediaElementSource(video);
        source.connect(analyzer.gainNode);
        analyzer.gainNode.connect(analyzer.analyser);
        analyzer.analyser.connect(audioCtx.destination);
      }
    } catch (e) {
      console.warn("The Truth Untold: Routing failed", e);
    }
  }

  if (audioCtx && audioCtx.state === 'suspended') await audioCtx.resume();

  chrome.storage.local.get(['sensitivity'], (res) => {
    sensitivity = res.sensitivity || 5;
  });

  function loop() {
    if (!isRunning) return;

    // ── Pause / End Detection ─────────────────────────────────────────────
    // If the video is paused or finished, instantly drop gauge to 0.
    const videoEl = document.querySelector('video');
    if (videoEl && (videoEl.paused || videoEl.ended)) {
      if (displayedScore !== 0) {
        displayedScore = 0;
        // Force UI to show 0 immediately
        const circle = document.getElementById('tp-circle-fill');
        const probText = document.getElementById('tp-main-prob');
        if (circle) {
          circle.setAttribute('stroke-dasharray', '0, 100');
          circle.style.stroke = '#00f2fe';
        }
        if (probText) {
          probText.textContent = '0%';
          probText.style.color = '';
        }
        drawHistoryChart(0);
      }
      animationId = requestAnimationFrame(loop);
      return; // Skip analysis while paused/stopped
    }
    // ─────────────────────────────────────────────────────────────────────

    if (analyzer) {
      try {
        const isVideoActive = videoEl && !videoEl.paused && !videoEl.ended && !videoEl.muted && videoEl.volume > 0;
        
        // Auto-enable Captions if possible
        try {
          const ccBtn = document.querySelector('.ytp-subtitles-button');
          if (ccBtn && ccBtn.getAttribute('aria-pressed') === 'false') {
            ccBtn.click();
          }
        } catch (e) {}

        // Check for subtitle presence to suppress during gaps
        const activeSubText = getSubtitleText();
        const hasSubtitle = activeSubText.length > 2;
        if (hasSubtitle) {
          currentSubtitle = activeSubText;
          updateSentenceHUD(activeSubText);
        }

        const result = analyzer.analyzeFrame(sensitivity, isVideoActive);
        let targetScore = result.stressScore;
        
        // 1. Music/Effect Suppression
        const musicBadge = document.getElementById('tp-music-badge');
        if (result.isMusic) {
          targetScore = 0;
          if (musicBadge) musicBadge.classList.remove('hidden');
        } else {
          if (musicBadge) musicBadge.classList.add('hidden');
        }

        // 2. Targeted Category Bias (Politician/Religious/Money)
        if (currentSubtitle && !result.isMusic) {
          const lowerSub = currentSubtitle.toLowerCase();
          const isPolitician = RELIABILITY_CONSTANTS.POLITICIANS.some(k => lowerSub.includes(k.toLowerCase()));
          const isReligious = RELIABILITY_CONSTANTS.RELIGIOUS_FIGURES.some(k => lowerSub.includes(k.toLowerCase()));
          const isMoney = RELIABILITY_CONSTANTS.MONEY_MAKING.some(k => lowerSub.includes(k.toLowerCase()));
          
          if (isPolitician || isReligious || isMoney) {
            targetScore = Math.min(99, targetScore * 1.5); 
            if (targetScore < 50) targetScore = 50; 
          }
        }

        // 3. Global 33% downward adjustment
        targetScore = Math.round(targetScore * GLOBAL_SCORE_MULTIPLIER);
        
        // Smooth Transition (Lerp) - Responsive 3x speed boost
        const lerpFactor = targetScore === 0 ? 0.3 : 0.15;
        displayedScore += (targetScore - displayedScore) * lerpFactor;

        // Apply trust-level floor (scaled by global multiplier)
        const scaledFloor = Math.round(trustFloor * GLOBAL_SCORE_MULTIPLIER);
        if (scaledFloor > 0 && !result.isMusic) {
          if (displayedScore < scaledFloor) displayedScore = scaledFloor;
        }
        
        const smoothResult = { ...result, stressScore: Math.round(displayedScore) };
        updateUI(smoothResult);
        drawHistoryChart(smoothResult.stressScore);
        drawFingerprintChart(result.metrics.centroid, result.metrics.rolloff);
        
        if (!result.isSilent) {
          const timestamp = Date.now();
          const dataPoint = {
            score: smoothResult.stressScore,
            ai: smoothResult.aiProbability,
            jitter: result.metrics.jitter,
            shimmer: result.metrics.shimmer,
            entropy: result.metrics.entropy || 0.5,
            text: currentSubtitle,
            timestamp: timestamp
          };
          sessionData.push(dataPoint);

          // Subtitle aggregation
          if (currentSubtitle && currentSubtitle.length > 1) {
            if (!currentSubRecord || currentSubRecord.text !== currentSubtitle) {
              if (currentSubRecord) subtitleRecords.push(currentSubRecord);
              currentSubRecord = {
                text: currentSubtitle,
                startTime: timestamp,
                scores: [smoothResult.stressScore],
                aiScores: [smoothResult.aiProbability],
                entropyScores: [result.metrics.entropy || 0.5]
              };
            } else {
              currentSubRecord.scores.push(smoothResult.stressScore);
              currentSubRecord.aiScores.push(smoothResult.aiProbability);
              currentSubRecord.entropyScores.push(result.metrics.entropy || 0.5);
            }
          }
          
          // Auto-trigger removed per user request. 
          // Capture now only triggers manually via the Share button.
        }
      } catch (err) {
        console.error("The Truth Untold: Loop error", err);
      }

    }
    animationId = requestAnimationFrame(loop);
  }
  loop();
}

async function triggerTruthCapture(video, score) {
  if (!video || video.videoWidth === 0) {
    showToast("Error: Video stream not ready for capture.");
    return;
  }
  isCapturingTruth = true;
  const screenshots = [];
  
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // Capture loop
    for (let i = 0; i < screenshotCount; i++) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // Add watermark
      ctx.font = "bold 40px Arial";
      ctx.fillStyle = "#ff416c";
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.shadowBlur = 10;
      ctx.fillText(`🚨 ${t('deception_density').toUpperCase()}: ${Math.round(score)}%`, 50, 80);
      ctx.fillStyle = "#00f2fe";
      ctx.fillText(`Powered by The Truth Untold AI`, 50, 140);
      
      // YouTube uses same-origin blob URLs for MSE, so this should not taint.
      screenshots.push(canvas.toDataURL('image/jpeg', 0.8));
      
      if (i < screenshotCount - 1) {
        await new Promise(r => setTimeout(r, 600));
      }
    }

    if (screenshots.length > 0) {
      showTruthAlertUI(screenshots, score);
    }
  } catch (err) {
    console.error("The Truth Untold: Capture failed", err);
    showToast(t('capture_fail'));
  }
  
  // Cooldown
  setTimeout(() => {
    isCapturingTruth = false;
  }, 10000);
}

function showTruthAlertUI(screenshots, score, mode = 'video') {
  let modal = document.getElementById('tp-truth-modal-ui');
  if (modal) modal.remove();
  
  modal = document.createElement('div');
  modal.id = 'tp-truth-modal-ui';
  modal.className = 'tp-truth-modal';
  
  let galleryHTML = screenshots.map((src, idx) => `
    <div class="tp-gallery-item" data-idx="${idx}">
      <img src="${src}" alt="Screenshot">
      <div class="tp-gallery-tag">SHOT ${idx+1}</div>
    </div>
  `).join('');

  modal.innerHTML = `
    <div class="tp-truth-modal-content">
      <button class="tp-truth-close">✕</button>
      <div class="tp-truth-title">${mode === 'report' ? t('share_report_title') : t('share')}</div>
      <div class="tp-truth-subtitle">${mode === 'report' ? t('share_report_sub') : `AI Lie Detector caught a deception event at ${Math.round(score)}%`}</div>
      
      <div class="tp-gallery-container">
        ${galleryHTML}
      </div>
      
      <div class="tp-social-buttons">
        <button class="tp-social-btn tp-btn-x" data-platform="x">𝕏 Share</button>
        <button class="tp-social-btn tp-btn-ig" data-platform="ig">Instagram</button>
        <button class="tp-social-btn tp-btn-tt" data-platform="tt">TikTok</button>
        ${mode === 'report' ? `<button class="tp-social-btn tp-btn-sheet" id="tp-btn-save-sheet">${t('save_sheet')}</button>` : ''}
      </div>
      
      <div style="margin-top: 30px;">
        <button class="tp-truth-close-bottom tp-pro-btn" style="background: rgba(255,255,255,0.1); color: #fff;">${t('close')}</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  
  // Force reflow for transition
  void modal.offsetWidth;
  modal.classList.add('show');
  
  const closeModal = () => {
    modal.classList.remove('show');
    setTimeout(() => modal.remove(), 400);
  };
  
  modal.querySelector('.tp-truth-close').onclick = closeModal;
  modal.querySelector('.tp-truth-close-bottom').onclick = closeModal;
  
  const sheetBtn = modal.querySelector('#tp-btn-save-sheet');
  if (sheetBtn) {
    sheetBtn.onclick = () => {
      exportToSheet();
    };
  }
  
  let selectedIdx = 0;
  const items = modal.querySelectorAll('.tp-gallery-item');
  items.forEach(item => {
    item.onclick = () => {
      items.forEach(i => i.style.borderColor = 'rgba(255, 255, 255, 0.1)');
      item.style.borderColor = '#00f2fe';
      selectedIdx = parseInt(item.dataset.idx);
    };
  });
  if(items.length > 0) items[0].style.borderColor = '#00f2fe';
  
  const handleShare = async (platform) => {
    const dataUrl = screenshots[selectedIdx];
    const blob = await (await fetch(dataUrl)).blob();
    
    // Copy to clipboard
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob })
      ]);
    } catch (e) {
      console.warn("Clipboard copy failed", e);
    }
    
    // Download File
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `truth_untold_evidence_${Date.now()}.jpg`;
    a.click();
    
    // Open Social Media
    const text = encodeURIComponent(`🚨 AI Lie Detector caught a deception event at ${Math.round(score)}%! #TheTruthUntold`);
    const url = encodeURIComponent(window.location.href);
    
    if (platform === 'x') {
      window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, '_blank');
    } else if (platform === 'ig') {
      showToast("이미지가 복사 및 다운로드되었습니다! 인스타그램에 붙여넣으세요.");
      setTimeout(() => window.open('https://instagram.com', '_blank'), 1500);
    } else if (platform === 'tt') {
      showToast("이미지가 복사 및 다운로드되었습니다! 틱톡에 업로드하세요.");
      setTimeout(() => window.open('https://tiktok.com/upload', '_blank'), 1500);
    }
  };
  
  modal.querySelectorAll('.tp-social-btn').forEach(btn => {
    btn.onclick = () => handleShare(btn.dataset.platform);
  });
}

function showToast(msg) {
  let toast = document.getElementById('tp-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'tp-toast';
    toast.className = 'tp-toast-notification';
    document.body.appendChild(toast);
  }
  toast.innerText = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

function updateUI(result) {
  if (result.isSilent) {
    displayedScore = 0;
    renderFinalScore(0);
    return;
  }

  if (result.isCalibrating) {
    const probText = document.getElementById('tp-main-prob');
    if (probText) probText.textContent = "CAL";
    const liveLabel = document.querySelector('.tp-live-label');
    if (liveLabel) liveLabel.textContent = "CALIBRATING SPEAKER...";
    return;
  }

  const liveLabel = document.querySelector('.tp-live-label');
  if (liveLabel) liveLabel.textContent = t('lie');

  const score = result.stressScore;
  
  // PSYCHOLINGUISTIC ANALYSIS MODULE (PLM) - Academic Markers
  let linguisticBias = 0;
  if (currentSubtitle) {
    const text = currentSubtitle.toLowerCase();
    
    // 1. Self-Reference Reduction (Linguistic Distancing)
    const selfRefsEn = text.match(/\b(i|me|my|mine|myself)\b/g) || [];
    const selfRefsKo = text.match(/(나|저|내|제)(?=\s|$|[은는이가을를])/g) || [];
    const totalSelfRefs = selfRefsEn.length + selfRefsKo.length;
    if (totalSelfRefs === 0 && text.length > 30) linguisticBias += 8;
    
    // 2. Emotional Leakage (Negative Emotion Words)
    const negEmotionsEn = text.match(/\b(hate|sad|angry|bad|worthless|liar|wrong|guilty)\b/g) || [];
    const negEmotionsKo = text.match(/(싫어|나빠|화나|슬퍼|틀려|거짓|잘못)/g) || [];
    const totalNegEmotions = negEmotionsEn.length + negEmotionsKo.length;
    if (totalNegEmotions > 0) linguisticBias += 12;
    
    // 3. Cognitive Load (Complex Sentences with many conjunctions)
    const conjunctionsEn = text.match(/\b(and|because|but|although|if)\b/g) || [];
    const conjunctionsKo = text.match(/(그리고|그래서|하지만|때문에|만약)/g) || [];
    const totalConjunctions = conjunctionsEn.length + conjunctionsKo.length;
    if (text.length > 50 && totalConjunctions > 2) linguisticBias += 10;
    
    // 4. Exclusive Words (truthful people use boundary words more)
    const exclusivesEn = text.match(/\b(except|without|rather)\b/g) || [];
    const exclusivesKo = text.match(/(대신|제외|말고|비해)/g) || [];
    const totalExclusives = exclusivesEn.length + exclusivesKo.length;
    if (totalExclusives > 0) linguisticBias -= 3; // Slightly truthful
 
    // 5. Deflection / Vagueness signals — strong deception indicator
    const deflectionsEn = text.match(/\b(believe me|trust me|honestly|frankly|to be honest|i never|i always|everybody knows|people say|many people)\b/gi) || [];
    const deflectionsKo = text.match(/(솔직히|진심으로|믿어|절대|항상|한 번도)/gi) || [];
    const totalDeflections = deflectionsEn.length + deflectionsKo.length;
    if (totalDeflections > 0) linguisticBias += 15;
  }

  // BUG FIX: Removed sentimentBias — was subtracting -15 for common words like "yes", "no", "thanks"
  // This was the primary cause of all scores being suppressed to ~5% (false "truth" readings)

  // BUG FIX: relBias was (reliabilityScore-50)*0.4 = up to -20 subtracted from score
  // Now it only adds a tiny nudge to context-aware scoring without masking deception signals
  const relBias = (reliabilityScore - 50) * 0.05; // Drastically reduced from 0.4 → 0.05
  const finalScore = Math.min(99, Math.max(5, Math.round(score + linguisticBias - relBias)));
  
  renderFinalScore(finalScore);
  
  if (viewMode === 'expert') {
    if (document.getElementById('tp-val-jitter')) document.getElementById('tp-val-jitter').innerText = result.metrics.jitter;
    if (document.getElementById('tp-val-shimmer')) document.getElementById('tp-val-shimmer').innerText = result.metrics.shimmer;
    if (document.getElementById('tp-val-centroid')) document.getElementById('tp-val-centroid').innerText = result.metrics.centroid;
    if (document.getElementById('tp-val-rolloff')) document.getElementById('tp-val-rolloff').innerText = result.metrics.rolloff;
    if (document.getElementById('tp-val-ai')) document.getElementById('tp-val-ai').innerText = Math.round(result.aiProbability) + "%";
    if (document.getElementById('tp-val-gain')) document.getElementById('tp-val-gain').innerText = result.gain.toFixed(2) + "x";
  }

  // Live AI Badge Update
  const aiBadge = document.getElementById('tp-ai-badge');
  if (aiBadge) {
    if (result.aiProbability > 50) {
      aiBadge.innerText = `AI DETECTED: ${Math.round(result.aiProbability)}%`;
      aiBadge.classList.add('ai-warning');
    } else {
      aiBadge.innerText = `NEURAL SCAN: SAFE`;
      aiBadge.classList.remove('ai-warning');
    }
  }
  
  if (isRunning) drawHistoryChart(finalScore);

  // AI Voice Logic
  const aiWarning = document.getElementById('tp-ai-warning');
  if (result.aiProbability > 85) {
    if (aiWarning) aiWarning.classList.remove('hidden');
    // If AI is detected, we scramble or block the lie score as it's invalid
    const circle = document.getElementById('tp-circle-fill');
    const probText = document.getElementById('tp-main-prob');
    if (probText) {
      probText.textContent = "AI";
      probText.style.color = "#ff416c";
    }
    if (circle) circle.style.stroke = "#ff416c";
  } else {
    if (aiWarning) aiWarning.classList.add('hidden');
  }
}

let fingerprintPoints = [];
function drawFingerprintChart(centroid, rolloff) {
  const canvas = document.getElementById('tp-fingerprint-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width = 280;
  canvas.height = 40;
  
  fingerprintPoints.push({ c: parseFloat(centroid), r: parseFloat(rolloff) });
  if (fingerprintPoints.length > 50) fingerprintPoints.shift();
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Draw Centroid (Purple)
  ctx.strokeStyle = '#a259ff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  fingerprintPoints.forEach((p, i) => {
    const x = (i / 50) * canvas.width;
    const y = canvas.height - (p.c / 200 * canvas.height);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Draw Rolloff (Cyan)
  ctx.strokeStyle = '#00f2fe';
  ctx.beginPath();
  fingerprintPoints.forEach((p, i) => {
    const x = (i / 50) * canvas.width;
    const y = canvas.height - (p.r * canvas.height);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();
}



function renderFinalScore(score) {
  if (viewMode === 'visual') {
    const circle = document.getElementById('tp-circle-fill');
    const probText = document.getElementById('tp-main-prob');
    if (circle && probText) {
      circle.setAttribute('stroke-dasharray', `${score}, 100`);
      probText.textContent = `${score}%`;
      circle.style.stroke = score > 75 ? '#ff416c' : score > 45 ? '#f7971e' : '#00f2fe';
    }
  }
}

async function calculateReliability() {
  try {
    const title = (document.querySelector('h1.ytd-video-primary-info-renderer')?.innerText || document.title).toLowerCase();
    const channel = (document.querySelector('yt-formatted-string.ytd-channel-name')?.innerText || "").toLowerCase();
    const description = (document.querySelector('div#description-inline-expander')?.innerText || "").toLowerCase();
    const genre = (document.querySelector('meta[itemprop="genre"]')?.content || "general").toLowerCase();

    let score = RELIABILITY_CONSTANTS.GENRE_BASE[genre] || 50;
    const fullText = `${title} ${channel} ${description} ${genre}`;

    // Advanced Heuristic Pattern Recognition (Regex)
    if (RELIABILITY_CONSTANTS.PATTERNS) {
      const p = RELIABILITY_CONSTANTS.PATTERNS;
      if (title.match(p.EXAGGERATED_CAPS)) score -= 10;
      if (title.match(p.EXCESSIVE_PUNCTUATION)) score -= 15;
      if (title.match(p.FINANCIAL_HYPE)) score -= 20;
      if (title.match(p.CLICKBAIT_LISTS)) score -= 5;
      if (title.match(p.KOREAN_EXAGGERATION)) score -= 15;
      if (title.match(p.JAPANESE_EXAGGERATION)) score -= 15;
      if (description.match(p.OFFICIAL_DOC_ID)) score += 15;
      if (description.match(p.ACADEMIC_CITATION)) score += 20;
    }

    // Massive Keyword Analysis (3-Tiered)
    const allTrusted = [...RELIABILITY_CONSTANTS.OFFICIAL_CHANNELS, ...RELIABILITY_CONSTANTS.EXPERT_CHANNELS];
    allTrusted.forEach(word => { if(fullText.includes(word)) score += 8; });
    
    RELIABILITY_CONSTANTS.CLICKBAIT.forEach(word => { if(title.includes(word)) score -= 12; });
    RELIABILITY_CONSTANTS.SOURCES.forEach(word => { if(fullText.includes(word)) score += 6; });
    
    // Fact-checking trigger words
    if (fullText.includes("fact check") || fullText.includes("verified")) score += 15;
    if (fullText.includes("rumor") || fullText.includes("leak") || fullText.includes("unconfirmed")) score -= 20;

    // Massive 1.2M Dictionary Query via Service Worker
    const response = await new Promise(resolve => {
      chrome.runtime.sendMessage({ type: "SCORE_TEXT", text: fullText }, (res) => resolve(res || { delta: 0, matched: [] }));
    });
    
    score += (response.delta * 1.5); // Increase dictionary impact

    // Channel Verification & Badge Detection
    if (document.querySelector('ytd-badge-supported-renderer[class*="verified"]') || 
        document.querySelector('path[d*="M12,2C6.5,2,2,6.5,2,12s4.5,10,10,10s10-4.5,10-10S17.5,2,12,2z M10,17l-4-4l1.4-1.4l2.6,2.6l6.6-6.6l1.4,1.4L10,17z"]')) {
      score += 30; // Verified channel badge
    }
    RELIABILITY_CONSTANTS.OFFICIAL_CHANNELS.forEach(word => { if(channel.includes(word)) score += 20; });
    RELIABILITY_CONSTANTS.EXPERT_CHANNELS.forEach(word => { if(channel.includes(word)) score += 15; });
    if (["rumor", "gossip", "exposed", "이슈", "루머"].some(word => channel.includes(word))) score -= 15;

    // Description Analysis
    if (description.includes("http")) score += 5;
    if (RELIABILITY_CONSTANTS.SOURCES.some(word => description.includes(word))) score += 8;

    reliabilityScore = Math.max(10, Math.min(100, score));
    
    if (reliabilityScore >= 90) reliabilityGrade = "Very High";
    else if (reliabilityScore >= 75) reliabilityGrade = "High";
    else if (reliabilityScore >= 60) reliabilityGrade = "Medium";
    else if (reliabilityScore >= 40) reliabilityGrade = "Low";
    else reliabilityGrade = "Very Low";

    console.log(`TruthPulse: Reliability Scored - ${reliabilityScore}% (${reliabilityGrade}). Massive Dict Delta: ${response.delta}, Matched: ${response.matched.join(', ')}`);

    // Update UI directly if elements exist
    const relBadge = document.getElementById('tp-rel-badge');
    if (relBadge) {
      relBadge.className = `tp-reliability-badge grade-${reliabilityGrade.replace(' ', '-').toLowerCase()}`;
      relBadge.innerText = `${reliabilityScore}% RELIABILITY`;
    }
    const catBadge = document.getElementById('tp-cat-badge');
    if (catBadge) {
      catBadge.innerText = videoCategory.toUpperCase();
    }
    // Run trust level classification in parallel (non-blocking)
    classifyPageTrustLevel();
  } catch (e) {
    console.warn("TruthPulse: Reliability calculation failed", e);
  }
}

/**
 * classifyPageTrustLevel()
 * Scrapes YouTube page context (channel, title, description, hashtags, top comments)
 * and sends it to background.js for 6-level trust classification.
 * Sets the global trustFloor which acts as a minimum baseline for lie probability.
 */
async function classifyPageTrustLevel() {
  try {
    // 1. Channel name
    const channelName = (
      document.querySelector('ytd-channel-name yt-formatted-string')?.innerText ||
      document.querySelector('yt-formatted-string.ytd-channel-name')?.innerText ||
      document.querySelector('#channel-name')?.innerText || ''
    ).trim();

    // 2. Channel description (about section if expanded, or meta)
    const channelDesc = (
      document.querySelector('yt-formatted-string#description')?.innerText ||
      document.querySelector('meta[name="description"]')?.content || ''
    ).trim();

    // 3. Video title
    const videoTitle = (
      document.querySelector('h1.ytd-video-primary-info-renderer')?.innerText ||
      document.querySelector('h1.ytd-watch-metadata')?.innerText ||
      document.title || ''
    ).trim();

    // 4. Video description
    const videoDesc = (
      document.querySelector('div#description-inline-expander')?.innerText ||
      document.querySelector('div#description yt-formatted-string')?.innerText || ''
    ).trim();

    // 5. Hashtags (appear below title or in description)
    const hashtagEls = document.querySelectorAll('a.ytd-hashtag-header-renderer, a[href*="/hashtag/"]');
    const hashtags = Array.from(hashtagEls).map(el => el.innerText).join(' ');

    // 6. Top comments (first 5 visible)
    const commentEls = document.querySelectorAll('ytd-comment-renderer #content-text');
    const topComments = Array.from(commentEls).slice(0, 5).map(el => el.innerText).join(' ');

    // Combine all context
    const fullContext = [channelName, channelDesc, videoTitle, videoDesc, hashtags, topComments]
      .filter(Boolean)
      .join(' ');

    if (!fullContext.trim()) {
      console.log('The Truth Untold: No page context available for trust classification.');
      return;
    }

    console.log(`The Truth Untold: Classifying context (${fullContext.length} chars)...`);

    const result = await new Promise(resolve => {
      chrome.runtime.sendMessage({ type: 'CLASSIFY_CONTEXT', context: fullContext }, res => {
        resolve(res || { level: 0, floor: 0, label: 'UNCLASSIFIED', color: '#888888', matched: [] });
      });
    });

    // Update globals
    trustLevel = result.level;
    trustFloor = result.floor;
    trustLabel = result.label;
    trustColor = result.color;

    console.log(`The Truth Untold: Trust Level ${result.level} (${result.label}) — Floor: ${result.floor}% | Matched: ${result.matched.join(', ')}`);

    // Update HUD badge
    const badge = document.getElementById('tp-trust-badge');
    if (badge) {
      if (result.level === 0) {
        badge.classList.add('hidden');
      } else {
        badge.classList.remove('hidden');
        badge.style.borderColor = result.color;
        badge.style.color = result.color;
        badge.innerText = `${result.label} — BASE ${result.floor}%`;
      }
    }
  } catch(e) {
    console.warn('The Truth Untold: Trust classification failed', e);
  }
}

function drawHistoryChart(score) {
  if (!historyCtx) return;
  historyPoints.push(score);
  if (historyPoints.length > 100) historyPoints.shift();

  historyCtx.clearRect(0, 0, historyCanvas.width, historyCanvas.height);
  
  // Draw Grid
  historyCtx.strokeStyle = "rgba(255,255,255,0.05)";
  historyCtx.lineWidth = 1;
  historyCtx.beginPath();
  for(let i=0; i<historyCanvas.width; i+=20) {
    historyCtx.moveTo(i, 0); historyCtx.lineTo(i, historyCanvas.height);
  }
  historyCtx.stroke();

  historyCtx.strokeStyle = '#00f2fe';
  historyCtx.lineWidth = 2;
  historyCtx.beginPath();
  const step = historyCanvas.width / 100;
  historyPoints.forEach((p, i) => {
    const x = i * step;
    const y = historyCanvas.height - (p / 100 * historyCanvas.height);
    if (i === 0) historyCtx.moveTo(x, y); else historyCtx.lineTo(x, y);
  });
  historyCtx.stroke();
}

function detectCategory() {
  const genreMeta = document.querySelector('meta[itemprop="genre"]');
  if (genreMeta) {
    videoCategory = genreMeta.content;
    console.log("TruthPulse: Detected Category:", videoCategory);
    
    // Algorithm Detector Bias Logic
    if (["Entertainment", "Comedy", "Gaming"].includes(videoCategory)) {
      categoryBias = 1.2; // More suspicious
    } else if (["Education", "Science & Technology"].includes(videoCategory)) {
      categoryBias = 0.8; // More trustworthy
    } else {
      categoryBias = 1.0;
    }
  }
}

function getSubtitleText() {
  // 1. YouTube multi-segment captions
  const segments = document.querySelectorAll('.ytp-caption-segment');
  if (segments.length > 0) {
    return Array.from(segments).map(el => el.innerText.trim()).filter(t => t.length > 0).join(" ");
  }
  
  // 2. Generic containers
  const containers = [
    '.video-caption', 
    '.subtitles', 
    '.caption-window', 
    '.ytp-subtitles-player-content',
    'span[style*="background-color: rgba(0, 0, 0, 0.8)"]'
  ];
  for (const selector of containers) {
    const el = document.querySelector(selector);
    if (el) {
      const text = el.innerText.trim();
      if (text.length > 0) return text;
    }
  }
  return "";
}

// Robust Observer
const observer = new MutationObserver(() => {
  const video = document.querySelector('video');
  const hud = document.getElementById('truthpulse-hud');
  const reveal = document.getElementById('tp-reveal-trigger');
  
  if (video && !hud && !reveal) {
    console.log("TruthPulse: Video detected, initializing HUD...");
    initHUD();
  }
  
  if (isRunning) {
    const foundText = getSubtitleText();
    if (foundText && foundText.length > 2) {
      updateSentenceHUD(foundText);
    }
  }
});

function startObserver() {
  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  } else {
    setTimeout(startObserver, 100);
  }
}
startObserver();

let lastS = "";
function updateSentenceHUD(text) {
  if (text === lastS) return; 
  lastS = text;
  currentSubtitle = text;
  
  const list = document.getElementById('tp-sentence-list');
  if (!list) return;
  
  const score = Math.round(displayedScore);
  let status = "ANALYZING";
  let colorClass = "tp-border-unknown";
  let badgeClass = "tp-badge-unknown";

  if (score >= 70) {
    status = "LIE";
    colorClass = "tp-border-lie";
    badgeClass = "tp-badge-lie";
  } else if (score < 30) {
    status = "TRUTH";
    colorClass = "tp-border-truth";
    badgeClass = "tp-badge-truth";
  } else {
    status = "ANALYZING";
    colorClass = "tp-border-unknown";
    badgeClass = "tp-badge-unknown";
  }

  const card = document.createElement('div');
  card.className = `tp-sentence-card ${colorClass}`;
  card.innerHTML = `
    <div class="tp-card-header">
      <span class="tp-card-status ${badgeClass}">${status}</span>
      <span class="tp-card-score">${score}%</span>
    </div>
    <div class="tp-card-text">${text}</div>
  `;
  
  list.insertBefore(card, list.firstChild);
  if (list.children.length > 5) list.lastChild.remove();
}

// Enhanced bootstrapper
(function bootstrapper() {
  console.log("TruthPulse: Launching enhanced bootstrapper...");
  
  const tryInit = () => {
    if (document.getElementById('truthpulse-hud') || document.getElementById('tp-reveal-trigger')) return;
    
    const target = document.body || document.documentElement;
    if (target) {
      console.log("TruthPulse: Injecting HUD...");
      initHUD();
      detectCategory();
      // First trust classification pass (page metadata available early)
      setTimeout(classifyPageTrustLevel, 3000);
      // Second pass after comments and descriptions may have loaded
      setTimeout(classifyPageTrustLevel, 7000);
    }
  };

  // Immediate attempt
  tryInit();

  // On DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryInit);
  } else {
    tryInit();
  }

  // Periodic safety check (every 2s)
  setInterval(() => {
    if (!document.getElementById('truthpulse-hud') && !document.getElementById('tp-reveal-trigger')) {
      tryInit();
    }
  }, 2000);
})();

// YouTube SPA Navigation Support
window.addEventListener('yt-navigate-finish', () => {
  console.log("TruthPulse: YouTube SPA navigation detected.");

  // Reset trust classification for new page
  trustLevel = 0;
  trustFloor = 0;
  trustLabel = '';
  trustColor = '#888';
  const trustBadge = document.getElementById('tp-trust-badge');
  if (trustBadge) trustBadge.classList.add('hidden');

  detectCategory();
  setTimeout(calculateReliability, 2000);      // also calls classifyPageTrustLevel()
  setTimeout(classifyPageTrustLevel, 4000);    // second pass after comments may load

  if (isRunning) {
    isRunning = false;
    if (animationId) cancelAnimationFrame(animationId);
    sessionData = [];
    subtitleRecords = [];
    currentSubRecord = null;
  }

  setTimeout(() => {
    initHUD();
  }, 1000);
});

// Robust interval check as a last resort
setInterval(() => {
  if (!document.getElementById('truthpulse-hud') && !document.getElementById('tp-reveal-trigger')) {
    initHUD();
  }
}, 2000);
function exportToSheet() {
  let csv = "\uFEFF"; // UTF-8 BOM for Excel/Google Sheets compatibility
  
  const escapeCSV = (str) => {
    if (!str) return "";
    return `"${String(str).replace(/"/g, '""').replace(/\n/g, ' ')}"`;
  };

  // Section 1: Summary Stats
  csv += "--- EXECUTIVE SUMMARY ---\n";
  csv += `Report Generated, ${new Date().toLocaleString()}\n`;
  csv += `Average Lie%, ${document.getElementById('tp-report-avg').innerText}\n`;
  csv += `Peak Lie%, ${document.getElementById('tp-report-peak').innerText}\n`;
  csv += `Stability, ${document.getElementById('tp-report-stability').innerText}\n`;
  csv += `Reliability, ${document.getElementById('tp-report-rel').innerText}\n`;
  csv += `Integrity, ${document.getElementById('tp-report-integrity').innerText}\n`;
  csv += "\n";
  
  // Section 2: Deceptive Event Log
  csv += "--- DECEPTIVE EVENT LOG (LIES > 60%) ---\n";
  csv += "TIMESTAMP, SCORE, SUBTITLE TEXT\n";
  
  let currentLieText = null;
  let currentLieMaxScore = 0;
  let currentLieTime = null;

  sessionData.forEach(d => {
    if (d.text && d.text.length > 2) {
      if (d.text !== currentLieText) {
        if (currentLieText && currentLieMaxScore >= 60) {
          csv += `${escapeCSV(new Date(currentLieTime).toLocaleTimeString())}, ${currentLieMaxScore}%, ${escapeCSV(currentLieText)}\n`;
        }
        currentLieText = d.text;
        currentLieMaxScore = d.score;
        currentLieTime = d.timestamp;
      } else {
        if (d.score > currentLieMaxScore) {
          currentLieMaxScore = d.score;
        }
      }
    }
  });
  if (currentLieText && currentLieMaxScore >= 60) {
    csv += `${escapeCSV(new Date(currentLieTime).toLocaleTimeString())}, ${currentLieMaxScore}%, ${escapeCSV(currentLieText)}\n`;
  }
  csv += "\n";
  
  // Section 3: Full Data Sheet
  csv += "--- SUBTITLE DATA SHEET (FULL RECORD) ---\n";
  csv += "TIME, SUBTITLE TEXT, LIE%, AI%, COGNITIVE LOAD\n";
  
  subtitleRecords.forEach(rec => {
    const avgScore = Math.round(rec.scores.reduce((a,b)=>a+b,0) / rec.scores.length);
    const avgAI = Math.round(rec.aiScores.reduce((a,b)=>a+b,0) / rec.aiScores.length);
    const avgEntropy = (rec.entropyScores.reduce((a,b)=>a+b,0) / rec.entropyScores.length).toFixed(2);
    
    csv += `${escapeCSV(new Date(rec.startTime).toLocaleTimeString())}, ${escapeCSV(rec.text)}, ${avgScore}%, ${avgAI}%, ${avgEntropy}\n`;
  });
  
  // Create and trigger download
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  a.download = `TruthUntold_Full_Analysis_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  showToast(t('export_msg'));
}

