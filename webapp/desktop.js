/**
 * Th!nc — MOBILE WEBAPP CORE LOGIC
 * High-Fidelity YouTube Lie Detector Engine
 */

(function () {
  // ===== STATE VARIABLES =====
  let isRunning = false;
  let currentUploaderName = '';
  let currentTab = 'youtube';
  let viewMode = 'expert'; // visual, expert, mini
  let currentLang = 'en';
  let screenshotCount = 3;
  let autoShow = true;
  let tempLang = 'en';
  let tempScreenshotCount = 3;
  let tempAutoShow = true;
  
  // Real-time analysis variables
  let audioCtx = null;
  let analyzer = null;
  let mediaStream = null;
  let sourceNode = null;
  let animationId = null;
  let activeVideoId = null;
  let activePlatform = 'youtube';
  let videoMetadata = {
    title: "일반 유튜브 비디오",
    channel: "YouTube Creator",
    genre: "General",
    reliability: 70,
    grade: "Medium"
  };

  // YouTube player state tracking
  let isVideoPlaying = false;
  let lastTimeUpdate = Date.now();
  let lastTimeValue = -1;
  let analysisStartTime = 0;
  let ytPlayer = null;

  // Subtitles & Deception logging
  let currentSubtitle = "";
  let sessionData = [];
  let subtitleRecords = [];
  let currentSubRecord = null;
  let liesLogged = [];
  let displayedScore = 0;
  let targetScore = 0;

  // Real-time captions engine state
  let liveCaptions = [];          // [{start, dur, text}] loaded from server API
  let captionPlaybackSec = 0;     // Current playback position in seconds (from iframe)
  let lastShownCaptionIdx = -1;   // Track which caption was last displayed
  let activeCardElement = null;   // Active card DOM element in sentence list
  let captionLoadStatus = 'none'; // 'none' | 'loading' | 'loaded' | 'failed'
  let isAnalysisLocked = false;   // ✅ 중복 loadSocialVideoAnalysis 실행 방지 전역 잠금 플래그

  // Cache for fast video analysis ratings
  const scanCache = {};

  // Background Thumbnail Captions Scraping Queue
  const bgScanQueue = [];
  let isBgScanning = false;

  async function enqueueBgScan(videoId, onComplete, onFailure) {
    bgScanQueue.push({ videoId, onComplete, onFailure });
    processNextBgScan();
  }

  async function processNextBgScan() {
    if (isBgScanning || bgScanQueue.length === 0) return;
    isBgScanning = true;
    
    const task = bgScanQueue.shift();
    try {
      console.log(`[Queue] Starting background scrap scan for video: ${task.videoId}`);
      if (window.electronAPI && window.electronAPI.fetchBackgroundCaptions) {
        const result = await window.electronAPI.fetchBackgroundCaptions(task.videoId);
        if (result && result.ok && result.captions && result.captions.length > 0) {
          const localResult = analyzeCaptionsLocally(task.videoId, result.captions);
          task.onComplete(localResult);
        } else {
          task.onFailure(new Error(result?.error || 'No captions in background scrap'));
        }
      } else {
        task.onFailure(new Error('electronAPI not available'));
      }
    } catch (e) {
      console.warn(`[Queue] Background scrap failed for ${task.videoId}:`, e.message);
      task.onFailure(e);
    } finally {
      isBgScanning = false;
      setTimeout(processNextBgScan, 1000);
    }
  }

  // History sessions list
  let sessionHistory = [];

  // Charts
  let chartContexts = {
    lie: null, jitter: null, shimmer: null, mti: null, fi: null, pdr: null
  };
  let historyData = {
    lie: [], jitter: [], shimmer: [], mti: [], fi: [], pdr: []
  };

  // Timeline report chart
  let reportTimelineCanvas = null;
  let reportTimelineCtx = null;

  // Dictionary Constants (matches TruthPulse content script)
  const RELIABILITY_CONSTANTS = window.TP_DICTIONARY || {
    GENRE_BASE: { news: 85, education: 80, science_technology: 75, finance: 60, health_medical: 55, politics_opinion: 50, entertainment_rumor: 40, shorts_memes: 30 },
    OFFICIAL_CHANNELS: ["official", "sbs", "kbs", "mbc", "jtbc", "ytn", "news"],
    EXPERT_CHANNELS: ["dr", "professor", "박사", "교수", "전문가"],
    CLICKBAIT: ["shocking", "충격", "폭로", "사건", "실체", "소름", "대박"],
    SOURCES: ["study", "논문", "연구", "조사", "결과"]
  };

  // ===== Backend Call Fallback Helper =====
  async function fetchWithBackendFallback(endpoint, options = {}) {
    const baseUrls = [];

    // 모바일(Capacitor) 또는 데스크톱(Electron) 환경에서는 Railway 백엔드를 최우선으로 시도
    const isCapacitor = typeof window !== 'undefined' && window.Capacitor && window.Capacitor.isNativePlatform;
    const isElectron = typeof window !== 'undefined' && window.electronAPI && window.electronAPI.isElectron;
    
    if (isCapacitor || isElectron) {
      const savedUrl = localStorage.getItem('thinc_backend_url');
      if (savedUrl && savedUrl.trim().startsWith('http')) {
        baseUrls.push(savedUrl.trim().replace(/\/$/, ''));
      }
      baseUrls.push('https://thinc-lie-detector-production.up.railway.app');
      baseUrls.push('http://localhost:8080');
      baseUrls.push('http://127.0.0.1:8080');
    } else {
      // 1. Relative path (Same host server context)
      baseUrls.push('');
      
      // 2. Custom Backend URL from admin console
      const savedUrl = localStorage.getItem('thinc_backend_url');
      if (savedUrl && savedUrl.trim().startsWith('http')) {
        baseUrls.push(savedUrl.trim().replace(/\/$/, ''));
      }
      
      // 3. Default deployed online backend server (Automatic fallback)
      baseUrls.push('https://thinc-lie-detector-production.up.railway.app');
      
      // 4. Localhost fallbacks
      baseUrls.push('http://localhost:8080');
      baseUrls.push('http://127.0.0.1:8080');
    }
    
    const uniqueUrls = Array.from(new Set(baseUrls));
    let lastError = null;
    
    // Extract the user-provided signal (if any) to respect overall timeout,
    // but each URL also gets its own per-attempt timeout so one slow host
    // doesn't eat the entire budget.
    const { signal: userSignal, ...restOptions } = options;
    
    for (const baseUrl of uniqueUrls) {
      // Skip if the caller's overall signal already aborted
      if (userSignal && userSignal.aborted) break;
      const startTime = performance.now();
      const fullUrl = baseUrl ? `${baseUrl}${endpoint}` : endpoint;
      try {
        // Each attempt: 18s for captions/scan, 8s for others, honouring caller signal when provided
        const isTimeoutHeavy = endpoint.includes('/api/captions') || endpoint.includes('/api/analyze-video-fast');
        const timeoutDuration = isTimeoutHeavy ? 18000 : 8000;
        
        const perAttemptController = new AbortController();
        const perAttemptTimer = setTimeout(() => perAttemptController.abort(), timeoutDuration);
        if (userSignal) {
          userSignal.addEventListener('abort', () => perAttemptController.abort(), { once: true });
        }
        
        if (window.PerformanceLogger) {
          window.PerformanceLogger.log('Network', 'Backend Attempt Start', 0, 'Info', `Target: ${fullUrl}`);
        }
        
        const res = await fetch(fullUrl, { ...restOptions, signal: perAttemptController.signal });
        clearTimeout(perAttemptTimer);
        const duration = performance.now() - startTime;
        
        if (res.ok) {
          if (window.PerformanceLogger) {
            window.PerformanceLogger.log('Network', 'Backend Attempt Success', duration, 'Success', `URL: ${fullUrl}, status: ${res.status}`);
          }
          return res;
        }
        if (res.status === 404) {
          const err = new Error('HTTP 404');
          err.status = 404;
          throw err;
        }
        throw new Error(`HTTP ${res.status}`);
      } catch (err) {
        const duration = performance.now() - startTime;
        if (window.PerformanceLogger) {
          window.PerformanceLogger.log('Network', 'Backend Attempt Failed', duration, 'Failed', `URL: ${fullUrl}, error: ${err.message}`);
        }
        console.warn(`[Backend Fallback] Call failed for ${baseUrl || 'relative'}${endpoint}:`, err.message);
        lastError = err;
        if (err.status === 404 || err.message.includes('404')) {
          break; // 백엔드가 404(자막 없음)를 응답한 경우 로컬 서버 폴백 시도 생략
        }
      }
    }
    throw lastError || new Error(`All backend fallbacks failed for ${endpoint}`);
  }

  const TRANSLATIONS = {
    ko: {
      start: "분석 시작", stop: "분석 중단", scanning: "음성 분석 중...", idle: "대기 중",
      lie: "거짓 확률", avg: "평균", max: "최대", rel: "신뢰도",
      ai_scan: "AI 스캔: 활성", ai_idle: "AI 스캔: 대기",
      jitter: "지터", shimmer: "시머", hnr: "조조비", ai_prob: "AI 확률",
      mti: "미세진동", fi: "포먼트 불안정", pdr: "피치 편차율",
      speaker: "화자", music: "음악/효과음 감지",
      verdict_label: "종합 판정", stability: "안정성", avg_stress: "평균 스트레스", peak_stress: "최고 스트레스",
      truth_content: "진실 함유량", lie_content: "거짓 함유량",
      integrity: "무결성 지수", genre: "장르",
      vocal_cog: "음성 및 인지 분석", context_audit: "문맥 및 메타데이터 감사", neural_psy: "신경 및 심리 지문",
      agitation: "동요도 (TEO)", cog_load: "인지 부하", deception_density: "기만 밀도",
      timeline: "세션 타임라인 분석", data_sheet: "자막 데이터 시트",
      save_sheet: "📊 저장 (CSV)", share_btn: "진실 공유하기", close: "닫기",
      ai_warning: "AI 합성 음성 감지됨", ai_warning_sub: "분석 불가: 합성된 목소리가 감지되었습니다.",
      report_title: "심층 분석 리포트", session_id: "세션 ID",
      toast_mic_needed: "마이크 권한을 승인해주세요.",
      toast_export: "CSV 파일이 저장되었습니다!",
      toast_share: "리포트 공유 스크린샷이 저장되었습니다!",
      toast_history_cleared: "기록이 삭제되었습니다.",
      nav_title: "소셜 거짓말 탐지기",
      splash_desc: "유튜브 실시간 음성 거짓말 탐지기",
      tab_youtube: "유튜브",
      tab_detector: "탐지기",
      tab_report: "리포트",
      tab_history: "기록",
      yt_placeholder: "YouTube URL 또는 검색어 입력...",
      yt_quick_home: "🏠 홈",
      yt_quick_trending: "🔥 인기",
      yt_quick_shorts: "▶ Shorts",
      yt_back_to_list: "⬅ 목록으로 돌아가기",
      yt_feed_title: "🔥 실시간 인기 분석 비디오",
      yt_placeholder_go_title: "YouTube로 이동하세요",
      yt_placeholder_go_sub: "위 검색창에 YouTube URL을 입력하거나<br>아래 인기 목록을 눌러 분석을 시작하세요",
      yt_open_btn: "YouTube 열기",
      float_idle: "대기",
      float_idle_sub: "대기 중...",
      float_truth: "진실",
      float_doubt: "의심",
      float_lie: "거짓",
      detector_banner_idle: "대기 중",
      detector_banner_scanning: "음성 분석 중...",
      speaker_scanning: "음성 스캔 중...",
      music_fx: "음악/효과음 감지",
      gauge_sub_label: "거짓 확률",
      vol_title: "내부 볼륨 최적화",
      vol_status_ok: "✅ 최적화 완료",
      vol_status_adjusting: "⚡ 신호 최적화 중",
      vol_note: "시스템 볼륨 변경 없음",
      sens_label: "민감도",
      mode_visual: "비주얼",
      mode_expert: "전문가",
      mode_mini: "미니",
      chart_header: "실시간 6채널 분석",
      feed_header: "실시간 자막 분석",
      feed_placeholder: "분석이 시작되면 자막이 표시됩니다...",
      btn_share: "진실을 알려라",
      report_session_empty: "세션 없음",
      report_empty_msg: "분석을 실행한 후 리포트가 생성됩니다",
      report_vocal_cog: "음성 & 인지 분석",
      report_context_audit: "문맥 & 메타데이터 감사",
      report_neural_psy: "신경 & 심리 지문",
      report_deceptive_events: "기만 이벤트 로그 (거짓 > 60%)",
      rpt_no_deceptions: "탐지된 기만 없음",
      report_data_sheet: "자막 데이터 시트",
      table_time: "시간",
      table_content: "자막 내용",
      table_lie: "거짓%",
      table_ai: "AI%",
      btn_export_csv: "📊 CSV 내보내기",
      btn_share_report: "📤 리포트 공유",
      history_title: "세션 기록",
      btn_clear_history: "전체 삭제",
      history_empty: "저장된 세션이 없습니다",
      settings_title: "설정",
      settings_lang: "표시 언어",
      settings_screenshot_count: "스크린샷 수 (거짓 감지 시)",
      settings_autoshow: "거짓 감지 시 자동 표시",
      settings_close: "닫기",
      modal_title_done: "분석 완료",
      modal_sub_done: "결과를 기기에 저장하거나 공유하세요",
      btn_modal_go_report: "📊 최종 리포트 확인",
      pwa_install_title: "Th!nc 앱 설치하기",
      pwa_install_desc: "홈 화면에 추가하여 더 빠르고 편리하게 실행하세요!",
      pwa_btn_dismiss: "나중에",
      pwa_btn_install: "설치",
      ios_pwa_text: "홈 화면에 설치하려면 하단의 <strong>공유</strong> 아이콘을 누르고<br><strong>'홈 화면에 추가'</strong>를 선택하세요.",
      ai_warning: "AI 합성 음성 감지됨",
      ai_warning_sub: "분석 불가: 합성된 목소리가 감지되었습니다.",
      verdict_good: "신뢰도가 매우 높음: 분석 대상의 음성 파형이 안정적이며, 자막 기만 징후가 최소화되었습니다.",
      verdict_warn: "주의가 필요한 단계: 특정 구간에서 간헐적인 음성 떨림과 인지 부하가 상승하는 기만 패턴이 포착되었습니다.",
      verdict_bad: "높은 기만 위험군: 전반적으로 불규칙한 피치 변동성과 다수의 고스트레스 정황이 문맥과 일치합니다.",
      disclaimer_title: "이용 규칙 및 면책 고지",
      disclaimer_text: "본 애플리케이션은 음성 스펙트럼 스캔 및 생체 지표 분석 알고리즘을 활용한 엔터테인먼트 및 학술 연구 지원 목적으로 개발되었습니다. 본 시스템이 검출하는 음성 스트레스 지수(VSA) 및 실시간 신뢰성 판정 데이터는 어떠한 경우에도 법적 증거 자료, 임상 진단 자료, 혹은 사법적 수사 증거로 원용되거나 사용될 수 없습니다. 본 앱에서 분석된 데이터의 해석, 인용, 배포 및 활용에 따르는 모든 민형사상의 권한과 법적 책임은 전적으로 이용자 본인에게 귀속됩니다. 개발자 및 제공자는 사용자의 오용 또는 잘못된 인용으로 인해 발생한 일체의 직접적/간접적 손해에 대해 면책됩니다. 다만, 본 애플리케이션은 성대 미세진동(MTI), 티거 에너지 오퍼레이터(TEO) 등 현대 디지털 신호 처리 과학 이론을 근거로 정밀하고 수준 높은 분석 결과를 지향합니다.",
      disclaimer_agree: "위 면책 고지 사항을 완전히 이해하고 동의합니다.",
      disclaimer_btn: "동의하고 닫기"
    },
    en: {
      start: "Start Analysis", stop: "Stop Analysis", scanning: "ANALYZING VOICE...", idle: "IDLE",
      lie: "LIE PROBABILITY", avg: "AVG", max: "MAX", rel: "RELIABILITY",
      ai_scan: "AI SCAN: ACTIVE", ai_idle: "AI SCAN: IDLE",
      jitter: "Jitter", shimmer: "Shimmer", hnr: "HNR", ai_prob: "AI Prob",
      mti: "Micro-Tremor", fi: "Formant Instab.", pdr: "Pitch Dev Rate",
      speaker: "SPEAKER", music: "MUSIC/FX",
      verdict_label: "EXECUTIVE VERDICT", stability: "STABILITY", avg_stress: "AVG STRESS", peak_stress: "PEAK STRESS",
      truth_content: "TRUTH CONTENT", lie_content: "LIE CONTENT",
      integrity: "INTEGRITY INDEX", genre: "GENRE",
      vocal_cog: "VOCAL & COGNITIVE ANALYTICS", context_audit: "CONTEXTUAL AUDIT", neural_psy: "NEURAL PSYCHOLOGY",
      agitation: "AGITATION (TEO)", cog_load: "COGNITIVE LOAD", deception_density: "DECEPTION DENSITY",
      timeline: "TIMELINE ANALYSIS", data_sheet: "SUBTITLE DATA SHEET",
      save_sheet: "📊 Export (CSV)", share_btn: "Share the Truth", close: "Close",
      ai_warning: "AI SYNTHETIC VOICE DETECTED", ai_warning_sub: "Analysis impossible: Synthetic voice detected.",
      report_title: "EXECUTIVE ANALYSIS REPORT", session_id: "SESSION ID",
      toast_mic_needed: "Please grant microphone permissions.",
      toast_export: "CSV exported successfully!",
      toast_share: "Report share screenshot saved!",
      toast_history_cleared: "History cleared.",
      nav_title: "Social Lie Detector",
      splash_desc: "YouTube Real-time Voice Lie Detector",
      tab_youtube: "YouTube",
      tab_detector: "Detector",
      tab_report: "Report",
      tab_history: "History",
      yt_placeholder: "Enter YouTube URL or search query...",
      yt_quick_home: "🏠 Home",
      yt_quick_trending: "🔥 Trending",
      yt_quick_shorts: "▶ Shorts",
      yt_back_to_list: "⬅ Back to list",
      yt_feed_title: "🔥 Real-time Trending Videos",
      yt_placeholder_go_title: "Go to YouTube",
      yt_placeholder_go_sub: "Enter a YouTube URL in the search bar above or<br>select a video from the trending list below to start.",
      yt_open_btn: "Open YouTube",
      float_idle: "Idle",
      float_idle_sub: "Waiting...",
      float_truth: "Truth",
      float_doubt: "Doubt",
      float_lie: "Lie",
      detector_banner_idle: "Idle",
      detector_banner_scanning: "Analyzing Voice...",
      speaker_scanning: "Voice Scanning...",
      music_fx: "MUSIC/FX DETECTED",
      gauge_sub_label: "Lie Probability",
      vol_title: "Internal Gain Optimizer",
      vol_status_ok: "Optimal",
      vol_status_adjusting: "Optimizing Signal",
      vol_note: "No system volume change",
      sens_label: "Sensitivity",
      mode_visual: "Visual",
      mode_expert: "Expert",
      mode_mini: "Mini",
      chart_header: "Real-time 6-Channel Analysis",
      feed_header: "Real-time Subtitle Analysis",
      feed_placeholder: "Subtitles will display here once analysis starts...",
      btn_share: "Share the Truth",
      report_session_empty: "No Session",
      report_empty_msg: "A report will be generated after running analysis",
      report_vocal_cog: "Vocal & Cognitive Analytics",
      report_context_audit: "Contextual Audit",
      report_neural_psy: "Neural Psychology",
      report_deceptive_events: "Deceptive Events Log (Lie > 60%)",
      rpt_no_deceptions: "No deceptive events detected",
      report_data_sheet: "Subtitle Data Sheet",
      table_time: "Time",
      table_content: "Subtitle Content",
      table_lie: "Lie%",
      table_ai: "AI%",
      btn_export_csv: "📊 Export CSV",
      btn_share_report: "📤 Share Report",
      history_title: "Session History",
      btn_clear_history: "Clear All",
      history_empty: "No saved sessions",
      settings_title: "Settings",
      settings_lang: "Display Language",
      settings_screenshot_count: "Screenshots (on Lie detection)",
      settings_autoshow: "Auto-show on Lie detection",
      settings_close: "Close",
      modal_title_done: "Analysis Complete",
      modal_sub_done: "Save or share the results on your device",
      btn_modal_go_report: "📊 View Executive Report",
      pwa_install_title: "Install Th!nc App",
      pwa_install_desc: "Add to home screen for faster and easier access!",
      pwa_btn_dismiss: "Later",
      pwa_btn_install: "Install",
      ios_pwa_text: "To install on home screen, tap the Share icon below and select 'Add to Home Screen'.",
      ai_warning: "AI SYNTHETIC VOICE DETECTED",
      ai_warning_sub: "Analysis impossible: Synthetic voice detected.",
      verdict_good: "High Reliability: The subject's voice waveforms are stable, and deceptive subtitle signs are minimized.",
      verdict_warn: "Caution Advised: Intermittent vocal tremors and elevated cognitive load indicate potential deceptive patterns in specific sections.",
      verdict_bad: "High Deception Risk: General irregular pitch fluctuations and multiple high-stress instances match contextual cues.",
      disclaimer_title: "Terms of Use & Legal Disclaimer",
      disclaimer_text: "This application has been developed for entertainment and academic research assistance purposes, utilizing spectral audio scans and voice biometric analysis algorithms. The Voice Stress Analysis (VSA) scores and real-time integrity ratings generated by this system are NOT intended to, and cannot be, used as legal evidence, clinical diagnostics, or judicial testimony under any circumstances. All civil and criminal responsibilities arising from the interpretation, citation, dissemination, or utilization of the data generated herein rest solely and exclusively with the user. The developers and providers shall be fully indemnified against any direct or indirect damages resulting from misuse or citation. However, the system's underlying algorithm strictly pursues mathematically precise results grounded in established signal processing theories, including laryngeal micro-tremors (MTI) and Teager Energy (TEO) parameters.",
      disclaimer_agree: "I fully understand and agree to the disclaimer.",
      disclaimer_btn: "I Agree & Close"
    },
    jp: {
      start: "分析開始", stop: "分析中止", scanning: "音声分析中...", idle: "待機中",
      lie: "嘘の確率", avg: "平均", max: "最大", rel: "信頼度",
      ai_scan: "AIスキャン: 有効", ai_idle: "AIスキャン: 待機中",
      jitter: "ジター", shimmer: "シマー", hnr: "調調比", ai_prob: "AI確率",
      mti: "微細振動", fi: "フォルマント不安定", pdr: "ピッチ偏差率",
      speaker: "話者", music: "音楽/効果音を検出",
      verdict_label: "総合判定", stability: "安定性", avg_stress: "平均ストレス", peak_stress: "最大ストレス",
      truth_content: "真実含有量", lie_content: "嘘含有量",
      integrity: "完全性指数", genre: "ジャンル",
      vocal_cog: "音声・認知分析", context_audit: "文脈・メタデータ監査", neural_psy: "神経・心理指紋",
      agitation: "動揺度 (TEO)", cog_load: "認知負荷", deception_density: "欺瞞密度",
      timeline: "セッションタイムライン分析", data_sheet: "字幕データシート",
      save_sheet: "📊 保存 (CSV)", share_btn: "真実を伝える", close: "閉じる",
      ai_warning: "AI合成音声を検出", ai_warning_sub: "分析不可：合成された音声が検出されました。",
      report_title: "深層分析レポート", session_id: "セッションID",
      toast_mic_needed: "マイクの使用権限を許可してください。",
      toast_export: "CSVファイルが保存されました！",
      toast_share: "レポート共有スクリーンショットが保存されました！",
      toast_history_cleared: "履歴が削除されました。",
      nav_title: "ソーシャル嘘発見器",
      splash_desc: "YouTubeリアルタイム音声嘘発見器",
      tab_youtube: "YouTube",
      tab_detector: "検出器",
      tab_report: "レポート",
      tab_history: "履歴",
      yt_placeholder: "YouTubeのURLまたは検索ワードを入力...",
      yt_quick_home: "🏠 ホーム",
      yt_quick_trending: "🔥 急上昇",
      yt_quick_shorts: "▶ Shorts",
      yt_back_to_list: "⬅ リストに戻る",
      yt_feed_title: "🔥 リアルタイム人気分析ビデオ",
      yt_placeholder_go_title: "YouTubeへ移動",
      yt_placeholder_go_sub: "上の検索バーにYouTubeのURLを入力するか、<br>下急上昇リストから動画を選択して開始してください。",
      yt_open_btn: "YouTubeを開く",
      float_idle: "待機",
      float_idle_sub: "待機中...",
      float_truth: "真実",
      float_doubt: "疑い",
      float_lie: "嘘",
      detector_banner_idle: "待機中",
      detector_banner_scanning: "音声分析中...",
      speaker_scanning: "音声スキャン中...",
      music_fx: "音楽・効果音を検出",
      gauge_sub_label: "嘘の確率",
      vol_title: "内部音量最適化",
      vol_status_ok: "✅ 最適化完了",
      vol_status_adjusting: "⚡ 信号最適化中",
      vol_note: "システム音量変更なし",
      sens_label: "感度",
      mode_visual: "ビジュアル",
      mode_expert: "エキスパート",
      mode_mini: "ミニ",
      chart_header: "リアルタイム6チャンネル分析",
      feed_header: "リアルタイム字幕分析",
      feed_placeholder: "分析が開始されると字幕が表示されます...",
      btn_share: "真実を伝える",
      report_session_empty: "セッションなし",
      report_empty_msg: "分析を実行した後にレポートが生成されます",
      report_vocal_cog: "音声・認知分析",
      report_context_audit: "文脈・メタデータ監査",
      report_neural_psy: "神経・心理指紋",
      report_deceptive_events: "欺瞞イベントログ (嘘 > 60%)",
      rpt_no_deceptions: "検出された欺瞞はありません",
      report_data_sheet: "字幕データシート",
      table_time: "時間",
      table_content: "字幕内容",
      table_lie: "嘘%",
      table_ai: "AI%",
      btn_export_csv: "📊 CSV書き出し",
      btn_share_report: "📤 レポート共有",
      history_title: "セッション履歴",
      btn_clear_history: "すべて削除",
      history_empty: "保存されたセッションはありません",
      settings_title: "設定",
      settings_lang: "表示言語",
      settings_screenshot_count: "スクリーン샷数 (嘘検出時)",
      settings_autoshow: "嘘検出時に自動表示",
      settings_close: "閉じる",
      modal_title_done: "分析完了",
      modal_sub_done: "結果を保存または共有してください",
      btn_modal_go_report: "📊 最終レポートを確認",
      pwa_install_title: "Th!ncアプリをインストール",
      pwa_install_desc: "ホーム画面に追加して、より速く便利に起動！",
      pwa_btn_dismiss: "後で",
      pwa_btn_install: "インストール",
      ios_pwa_text: "ホーム画面にインストールするには、下の共有アイコンをタップして「ホーム画面に追加」を選択してください。",
      ai_warning: "AI合成音声を検出",
      ai_warning_sub: "分析不可：合成された音声が検出されました。",
      verdict_good: "信頼度高：音声波形が安定しており、字幕の欺瞞的兆候が最小限に抑えられています。",
      verdict_warn: "注意が必要：特定の区間で一時的な音声の震えや認知負荷の上昇など、欺瞞的パターンが検出されました。",
      verdict_bad: "欺瞞リスク高：全体的に不規則なピッチの変動があり、多数の高ストレス状況が文脈と一致しています。"
    },
    zh: {
      start: "开始分析", stop: "停止分析", scanning: "语音分析中...", idle: "等待中",
      lie: "谎言概率", avg: "平均", max: "最大", rel: "置信度",
      ai_scan: "AI扫描: 激活", ai_idle: "AI扫描: 等待中",
      jitter: "抖动", shimmer: "闪烁", hnr: "谐噪比", ai_prob: "AI概率",
      mti: "微声震颤", fi: "共振峰不稳定", pdr: "音高偏差率",
      speaker: "说话人", music: "检测到音乐/音效",
      verdict_label: "综合判定", stability: "稳定性", avg_stress: "平均压力", peak_stress: "最高压力",
      truth_content: "真实含量", lie_content: "谎言含量",
      integrity: "完整性指数", genre: "类型",
      vocal_cog: "语音与认知分析", context_audit: "上下文与元数据审计", neural_psy: "神经与心理指纹",
      agitation: "动摇度 (TEO)", cog_load: "认知负荷", deception_density: "欺骗密度",
      timeline: "会话时间线分析", data_sheet: "字幕数据表",
      save_sheet: "📊 保存 (CSV)", share_btn: "传播真相", close: "关闭",
      ai_warning: "检测到AI合成语音", ai_warning_sub: "无法分析：检测到合成语音。",
      report_title: "深度报告", session_id: "会话ID",
      toast_mic_needed: "请授予麦克风权限。",
      toast_export: "CSV文件已成功保存！",
      toast_share: "报告分享截图已成功保存！",
      toast_history_cleared: "历史记录已删除。",
      nav_title: "社交谎言检测器",
      splash_desc: "YouTube实时语音测谎仪",
      tab_youtube: "YouTube",
      tab_detector: "检测器",
      tab_report: "报告",
      tab_history: "历史",
      yt_placeholder: "输入YouTube网址或搜索词...",
      yt_quick_home: "🏠 首页",
      yt_quick_trending: "🔥 热门",
      yt_quick_shorts: "▶ Shorts",
      yt_back_to_list: "⬅ 返回列表",
      yt_feed_title: "🔥 实时热门分析视频",
      yt_placeholder_go_title: "前往YouTube",
      yt_placeholder_go_sub: "在上方搜索栏输入YouTube网址，或<br>点击下方热门列表中的视频开始分析。",
      yt_open_btn: "打开YouTube",
      float_idle: "空闲",
      float_idle_sub: "等待中...",
      float_truth: "真实",
      float_doubt: "可疑",
      float_lie: "谎言",
      detector_banner_idle: "等待中",
      detector_banner_scanning: "语音分析中...",
      speaker_scanning: "语音扫描中...",
      music_fx: "检测到音乐/音效",
      gauge_sub_label: "谎言概率",
      vol_title: "内部音量优化",
      vol_status_ok: "✅ 优化完成",
      vol_status_adjusting: "⚡ 信号优化中",
      vol_note: "系统音量未更改",
      sens_label: "敏感度",
      mode_visual: "视觉",
      mode_expert: "专家",
      mode_mini: "微型",
      chart_header: "实时6通道分析",
      feed_header: "实时字幕分析",
      feed_placeholder: "分析开始后将在此显示字幕...",
      btn_share: "传播真相",
      report_session_empty: "无会话",
      report_empty_msg: "运行分析后将生成报告",
      report_vocal_cog: "语音与认知分析",
      report_context_audit: "上下文与元数据审计",
      report_neural_psy: "神经与心理指纹",
      report_deceptive_events: "欺骗事件日志 (谎言 > 60%)",
      rpt_no_deceptions: "未检测到欺骗事件",
      report_data_sheet: "字幕数据表",
      table_time: "时间",
      table_content: "字幕内容",
      table_lie: "谎言%",
      table_ai: "AI%",
      btn_export_csv: "📊 导出CSV",
      btn_share_report: "📤 分享报告",
      history_title: "会话历史",
      btn_clear_history: "清除全部",
      history_empty: "无已保存的会话",
      settings_title: "设置",
      settings_lang: "显示语言",
      settings_screenshot_count: "屏幕截图数 (检测到谎言时)",
      settings_autoshow: "检测到谎言时自动显示",
      settings_close: "关闭",
      modal_title_done: "分析完成",
      modal_sub_done: "将结果保存或分享到您的设备",
      btn_modal_go_report: "📊 查看最终报告",
      pwa_install_title: "安装Th!nc应用",
      pwa_install_desc: "添加到主屏幕，启动更快更方便！",
      pwa_btn_dismiss: "以后",
      pwa_btn_install: "安装",
      ios_pwa_text: "要安装到主屏幕，请点击下方的分享图标并选择“添加到主屏幕”。",
      ai_warning: "检测到AI合成语音",
      ai_warning_sub: "无法分析：检测到合成语音。",
      verdict_good: "高可靠性：受试者的语音波形稳定，欺骗性字幕特征极少。",
      verdict_warn: "需要注意：特定部分出现断续的语音颤抖和认知负荷升高，提示潜在欺骗特征。",
      verdict_bad: "高欺骗风险：总体上音高波动不规则，且多处高压力状态与上下文特征相符。"
    },
    fr: {
      start: "Lancer l'analyse", stop: "Arrêter l'analyse", scanning: "Analyse vocale...", idle: "En attente",
      lie: "PROBABILITÉ DE MENSONGE", avg: "MOY", max: "MAX", rel: "FIABILITÉ",
      ai_scan: "SCAN IA: ACTIF", ai_idle: "SCAN IA: VEILLE",
      jitter: "Jitter", shimmer: "Shimmer", hnr: "HNR", ai_prob: "Prob IA",
      mti: "Micro-tremblement", fi: "Instabilité formants", pdr: "Taux déviation pitch",
      speaker: "ORATEUR", music: "MUSIQUE/FX DÉTECTÉ",
      verdict_label: "VERDICT GLOBAL", stability: "STABILITÉ", avg_stress: "STRESS MOYEN", peak_stress: "STRESS MAXIMAL",
      truth_content: "CONTENU VÉRITABLE", lie_content: "CONTENU MENSONGER",
      integrity: "INDICE D'INTÉGRITÉ", genre: "GENRE",
      vocal_cog: "ANALYSE VOCALE & COGNITIVE", context_audit: "AUDIT CONTEXTUEL", neural_psy: "EMPREINTE PSYCHOLOGIQUE",
      agitation: "AGITATION (TEO)", cog_load: "CHARGE COGNITIVE", deception_density: "DENSITÉ DE TROMPERIE",
      timeline: "ANALYSE DU TIMELINE", data_sheet: "FICHE DE DONNÉES",
      save_sheet: "📊 Exporter (CSV)", share_btn: "Partager la vérité", close: "Fermer",
      ai_warning: "VOIX SYNTHÉTIQUE IA DÉTECTÉE", ai_warning_sub: "Analyse impossible : voix synthétique détectée.",
      report_title: "RAPPORT D'ANALYSE APPROFONDI", session_id: "SESSION ID",
      toast_mic_needed: "Veuillez accorder les autorisations micro.",
      toast_export: "Fichier CSV enregistré avec succès !",
      toast_share: "Capture d'écran du rapport enregistrée !",
      toast_history_cleared: "Historique effacé.",
      nav_title: "Détecteur de mensonge social",
      splash_desc: "Détecteur de mensonge vocal en temps réel YouTube",
      tab_youtube: "YouTube",
      tab_detector: "Détecteur",
      tab_report: "Rapport",
      tab_history: "Historique",
      yt_placeholder: "Entrez l'URL YouTube ou le terme de recherche...",
      yt_quick_home: "🏠 Accueil",
      yt_quick_trending: "🔥 Tendances",
      yt_quick_shorts: "▶ Shorts",
      yt_back_to_list: "Analyse des vidéos populaires",
      yt_feed_title: "🔥 Vidéos populaires en temps réel",
      yt_placeholder_go_title: "Aller sur YouTube",
      yt_placeholder_go_sub: "Entrez une URL YouTube ci-dessus ou<br>sélectionnez une vidéo populaire pour commencer.",
      yt_open_btn: "Ouvrir YouTube",
      float_idle: "Veille",
      float_idle_sub: "En attente...",
      float_truth: "Vérité",
      float_doubt: "Doute",
      float_lie: "Mensonge",
      detector_banner_idle: "En attente",
      detector_banner_scanning: "Analyse vocale...",
      speaker_scanning: "Scan vocal en cours...",
      music_fx: "MUSIQUE/FX DÉTECTÉ",
      gauge_sub_label: "Probabilité de mensonge",
      vol_title: "Optimiseur de gain interne",
      vol_status_ok: "Optimal",
      vol_status_adjusting: "Optimisation du signal",
      vol_note: "Aucun changement du volume système",
      sens_label: "Sensibilité",
      mode_visual: "Visuel",
      mode_expert: "Expert",
      mode_mini: "Mini",
      chart_header: "Analyse en temps réel à 6 canaux",
      feed_header: "Analyse des sous-titres en temps réel",
      feed_placeholder: "Les sous-titres s'afficheront ici une fois l'analyse commencée...",
      btn_share: "Partager la vérité",
      report_session_empty: "Aucune session",
      report_empty_msg: "Un rapport sera généré après avoir effectué l'analyse",
      report_vocal_cog: "Analyse vocale et cognitive",
      report_context_audit: "Audit contextuel et métadonnées",
      report_neural_psy: "Empreinte neuropsychologique",
      report_deceptive_events: "Journal des événements trompeurs (Mensonge > 60%)",
      rpt_no_deceptions: "Aucun événement trompeur détecté",
      report_data_sheet: "Fiche de données des sous-titres",
      table_time: "Temps",
      table_content: "Contenu",
      table_lie: "Mensonge%",
      table_ai: "IA%",
      btn_export_csv: "📊 Exporter en CSV",
      btn_share_report: "📤 Partager le rapport",
      history_title: "Historique de session",
      btn_clear_history: "Tout effacer",
      history_empty: "Aucune session enregistrée",
      settings_title: "Paramètres",
      settings_lang: "Langue d'affichage",
      settings_screenshot_count: "Captures d'écran (sur Mensonge)",
      settings_autoshow: "Affichage auto sur Mensonge",
      settings_close: "Fermer",
      modal_title_done: "Analyse terminée",
      modal_sub_done: "Enregistrez ou partagez les résultats",
      btn_modal_go_report: "📊 Voir le rapport d'analyse",
      pwa_install_title: "Installer l'app Th!nc",
      pwa_install_desc: "Ajoutez à l'écran d'accueil pour un accès plus rapide !",
      pwa_btn_dismiss: "Plus tard",
      pwa_btn_install: "Installer",
      ios_pwa_text: "Pour installer sur l'écran d'accueil, appuyez sur l'icône Partager et sélectionnez 'Sur l'écran d'accueil'.",
      ai_warning: "VOIX SYNTHÉTIQUE IA DÉTECTÉE",
      ai_warning_sub: "Analyse impossible : voix synthétique détectée.",
      verdict_good: "Fiabilité élevée: les ondes vocales du sujet sont stables et les signes de tromperie sont minimisés.",
      verdict_warn: "Attention recommandée: Des tremblements vocaux intermittents et une charge cognitive élevée indiquent des schémas de tromperie.",
      verdict_bad: "Risque de tromperie élevé: Fluctuations de hauteur irrégulières et multiples cas de stress élevé concordant avec le contexte."
    },
    de: {
      start: "Analyse starten", stop: "Analyse stoppen", scanning: "Stimme wird analysiert...", idle: "Bereit",
      lie: "LÜGENWAHRSCHEINLICHKEIT", avg: "AVG", max: "MAX", rel: "GLAUBWÜRDIGKEIT",
      ai_scan: "KI SCAN: AKTIV", ai_idle: "KI SCAN: BEREIT",
      jitter: "Jitter", shimmer: "Shimmer", hnr: "HNR", ai_prob: "KI Prob",
      mti: "Mikrozittern", fi: "Formant-Instabilität", pdr: "Tonhöhen-Abweichung",
      speaker: "SPRECHER", music: "MUSIK/EFFEKTE ERKANNT",
      verdict_label: "GESAMTURTEIL", stability: "STABILITÄT", avg_stress: "DURCHSCHN. STRESS", peak_stress: "MAX. STRESS",
      truth_content: "WAHRHEITSGEHALT", lie_content: "LÜGENANTEIL",
      integrity: "INTEGRITÄTSINDEX", genre: "GENRE",
      vocal_cog: "VOKALE & KOGNITIVE ANALYSE", context_audit: "KONTEXTPRÜFUNG", neural_psy: "NEUROPSYCHOLOGIE",
      agitation: "ERREGUNG (TEO)", cog_load: "KOGNITIVE BELASTUNG", deception_density: "TÄUSCHUNGSDICHTE",
      timeline: "ZEITLINIENANALYSE", data_sheet: "DATENBLATT",
      save_sheet: "📊 Export (CSV)", share_btn: "Wahrheit teilen", close: "Schließen",
      ai_warning: "KI-SYNTHETISCHE STIMME ERKANNT", ai_warning_sub: "Analyse unmöglich: Synthetische Stimme erkannt.",
      report_title: "AUSFÜHRLICHER ANALYSEBERICHT", session_id: "SITZUNGS-ID",
      toast_mic_needed: "Bitte erteilen Sie Mikrofonberechtigungen.",
      toast_export: "CSV-Datei erfolgreich gespeichert!",
      toast_share: "Bericht-Screenshot erfolgreich gespeichert!",
      toast_history_cleared: "Verlauf gelöscht.",
      nav_title: "Sozialer Lügendetektor",
      splash_desc: "YouTube-Echtzeit-Stimmenlügendetektor",
      tab_youtube: "YouTube",
      tab_detector: "Detektor",
      tab_report: "Bericht",
      tab_history: "Verlauf",
      yt_placeholder: "YouTube-URL oder Suchbegriff eingeben...",
      yt_quick_home: "🏠 Start",
      yt_quick_trending: "🔥 Trends",
      yt_quick_shorts: "▶ Shorts",
      yt_back_to_list: "⬅ Zurück zur Liste",
      yt_feed_title: "🔥 Echtzeit-Trendvideos zur Analyse",
      yt_placeholder_go_title: "Gehe zu YouTube",
      yt_placeholder_go_sub: "Geben Sie oben eine YouTube-URL ein oder<br>wählen Sie ein Trendvideo aus der Liste unten.",
      yt_open_btn: "YouTube öffnen",
      float_idle: "Bereit",
      float_idle_sub: "Warten...",
      float_truth: "Wahrheit",
      float_doubt: "Zweifel",
      float_lie: "Lüge",
      detector_banner_idle: "Bereit",
      detector_banner_scanning: "Stimme wird analysiert...",
      speaker_scanning: "Stimmen-Scan läuft...",
      music_fx: "MUSIK/EFFEKTE ERKANNT",
      gauge_sub_label: "Lügenwahrscheinlichkeit",
      vol_title: "Interne Lautstärkeoptimierung",
      vol_status_ok: "Optimal",
      vol_status_adjusting: "Signaloptimierung",
      vol_note: "Systemlautstärke unverändert",
      sens_label: "Empfindlichkeit",
      mode_visual: "Visuell",
      mode_expert: "Experte",
      mode_mini: "Mini",
      chart_header: "Echtzeit-6-Kanal-Analyse",
      feed_header: "Echtzeit-Untertitelanalyse",
      feed_placeholder: "Untertitel werden hier angezeigt, sobald die Analyse beginnt...",
      btn_share: "Wahrheit teilen",
      report_session_empty: "Keine Sitzung",
      report_empty_msg: "Ein Bericht wird nach der Analyse generiert",
      report_vocal_cog: "Vokale & kognitive Analyse",
      report_context_audit: "Kontext- & Metadatenprüfung",
      report_neural_psy: "Neuropsychologische Fingerabdrücke",
      report_deceptive_events: "Täuschungsereignis-Protokoll (Lüge > 60%)",
      rpt_no_deceptions: "Keine Täuschungsereignisse erkannt",
      report_data_sheet: "Untertitel-Datenblatt",
      table_time: "Zeit",
      table_content: "Inhalt",
      table_lie: "Lüge%",
      table_ai: "KI%",
      btn_export_csv: "📊 CSV exportieren",
      btn_share_report: "📤 Bericht teilen",
      history_title: "Sitzungsverlauf",
      btn_clear_history: "Alle löschen",
      history_empty: "Keine gespeicherten Sitzungen",
      settings_title: "Einstellungen",
      settings_lang: "Anzeigesprache",
      settings_screenshot_count: "Screenshots (bei Lügenerkennung)",
      settings_autoshow: "Autom. Anzeige bei Lügenerkennung",
      settings_close: "Schließen",
      modal_title_done: "Analyse abgeschlossen",
      modal_sub_done: "Ergebnisse speichern oder teilen",
      btn_modal_go_report: "📊 Abschlussbericht anzeigen",
      pwa_install_title: "Th!nc-App installieren",
      pwa_install_desc: "Fügen Sie es zum Startbildschirm hinzu für schnelleren Zugriff!",
      pwa_btn_dismiss: "Später",
      pwa_btn_install: "Installieren",
      ios_pwa_text: "Tippen Sie unten auf das Teilen-Symbol und wählen Sie 'Zum Startbildschirm hinzufügen'.",
      ai_warning: "KI-SYNTHETISCHE STIMME ERKANNT",
      ai_warning_sub: "Analyse unmöglich: Synthetische Stimme erkannt.",
      verdict_good: "Hohe Glaubwürdigkeit: Die Stimmenwellenform ist stabil, Täuschungszeichen im Untertitel sind minimal.",
      verdict_warn: "Vorsicht empfohlen: Unregelmäßiges Stimmenzittern und erhöhte kognitive Belastung weisen auf mögliche Täuschungsmuster hin.",
      verdict_bad: "Hohes Täuschungsrisiko: Unregelmäßige Tonhöhenschwankungen und mehrere Stressereignisse stimmen mit Kontextindikatoren überein."
    },
    es: {
      start: "Iniciar análisis", stop: "Detener análisis", scanning: "Analizando voz...", idle: "Listo",
      lie: "PROBABILIDAD DE MENTIRA", avg: "PROMEDIO", max: "MAX", rel: "CONFIABILIDAD",
      ai_scan: "SCANNER IA: ACTIVO", ai_idle: "SCANNER IA: ESPERA",
      jitter: "Jitter", shimmer: "Shimmer", hnr: "HNR", ai_prob: "Prob IA",
      mti: "Micro-temblor", fi: "Inestabilidad formantes", pdr: "Tasa desviación tono",
      speaker: "HABLANTE", music: "MÚSICA/EFECTOS DETECTADOS",
      verdict_label: "VERDICTO FINAL", stability: "ESTABILIDAD", avg_stress: "ESTRÉS PROMEDIO", peak_stress: "ESTRÉS MÁXIMO",
      truth_content: "CONTENIDO VERDADERO", lie_content: "CONTENIDO DE MENTIRA",
      integrity: "ÍNDICE DE INTEGRIDAD", genre: "GÉNERO",
      vocal_cog: "ANÁLISIS VOCAL & COGNITIVO", context_audit: "AUDITORÍA CONTEXTUAL", neural_psy: "NEUROPSICOLOGÍA",
      agitation: "AGITACIÓN (TEO)", cog_load: "CARGA COGNITIVA", deception_density: "DENSIDAD DE ENGAÑO",
      timeline: "ANÁLISIS DE TIMELINE", data_sheet: "HOJA DE DATOS",
      save_sheet: "📊 Exportar (CSV)", share_btn: "Compartir la verdad", close: "Cerrar",
      ai_warning: "VOZ SINTÉTICA DE IA DETECTADA", ai_warning_sub: "Análisis imposible: voz sintética detectada.",
      report_title: "INFORME DE ANÁLISIS PROFUNDO", session_id: "SESSION ID",
      toast_mic_needed: "Por favor, conceda permisos de micrófono.",
      toast_export: "¡Archivo CSV guardado con éxito!",
      toast_share: "¡Captura del informe guardada con éxito!",
      toast_history_cleared: "Historial borrado.",
      nav_title: "Detector de mentiras social",
      splash_desc: "Detector de mentiras de voz en tiempo real de YouTube",
      tab_youtube: "YouTube",
      tab_detector: "Detector",
      tab_report: "Informe",
      tab_history: "Historial",
      yt_placeholder: "Ingrese URL de YouTube o término de búsqueda...",
      yt_quick_home: "🏠 Inicio",
      yt_quick_trending: "🔥 Tendencias",
      yt_quick_shorts: "▶ Shorts",
      yt_back_to_list: "⬅ Volver a la lista",
      yt_feed_title: "🔥 Videos de análisis de tendencias",
      yt_placeholder_go_title: "Ir a YouTube",
      yt_placeholder_go_sub: "Ingrese una URL de YouTube arriba o<br>seleccione un video de la lista de tendencias para comenzar.",
      yt_open_btn: "Abrir YouTube",
      float_idle: "Espera",
      float_idle_sub: "Esperando...",
      float_truth: "Verdad",
      float_doubt: "Duda",
      float_lie: "Mentira",
      detector_banner_idle: "Listo",
      detector_banner_scanning: "Analizando voz...",
      speaker_scanning: "Escaneando voz...",
      music_fx: "MÚSICA/EFECTOS DETECTADOS",
      gauge_sub_label: "Probabilidad de mentira",
      vol_title: "Optimización de ganancia interna",
      vol_status_ok: "Óptimo",
      vol_status_adjusting: "Optimizando señal",
      vol_note: "Sin cambios en el volumen del sistema",
      sens_label: "Sensibilidad",
      mode_visual: "Visual",
      mode_expert: "Experto",
      mode_mini: "Mini",
      chart_header: "Análisis de 6 canales en tiempo real",
      feed_header: "Análisis de subtítulos en tiempo real",
      feed_placeholder: "Los subtítulos se mostrarán aquí cuando comience el análisis...",
      btn_share: "Compartir la verdad",
      report_session_empty: "Sin sesión",
      report_empty_msg: "Se generará un informe después de ejecutar el análisis",
      report_vocal_cog: "Análisis vocal y cognitivo",
      report_context_audit: "Auditoría de contexto y metadatos",
      report_neural_psy: "Huella neuropsicológica",
      report_deceptive_events: "Registro de engaños (Mentira > 60%)",
      rpt_no_deceptions: "No se detectaron engaños",
      report_data_sheet: "Hoja de datos de subtítulos",
      table_time: "Tiempo",
      table_content: "Contenido",
      table_lie: "Mentira%",
      table_ai: "IA%",
      btn_export_csv: "📊 Exportar CSV",
      btn_share_report: "📤 Compartir informe",
      history_title: "Historial de sesiones",
      btn_clear_history: "Borrar todo",
      history_empty: "No hay sesiones guardadas",
      settings_title: "Configuración",
      settings_lang: "Idioma de pantalla",
      settings_screenshot_count: "Capturas de pantalla (al detectar mentiras)",
      settings_autoshow: "Mostrar auto al detectar mentiras",
      settings_close: "Cerrar",
      modal_title_done: "Análisis completo",
      modal_sub_done: "Guarde o comparta los resultados en su dispositivo",
      btn_modal_go_report: "📊 Ver informe final",
      pwa_install_title: "Instalar app Th!nc",
      pwa_install_desc: "¡Añada a la pantalla de inicio para un acceso más rápido!",
      pwa_btn_dismiss: "Más tarde",
      pwa_btn_install: "Instalar",
      ios_pwa_text: "Para instalar en la pantalla de inicio, toque Compartir y elija 'Añadir a la pantalla de inicio'.",
      ai_warning: "VOZ SINTÉTICA DE IA DETECTADA",
      ai_warning_sub: "Análisis imposible: voz sintética detectada.",
      verdict_good: "Alta confiabilidad: Las ondas de voz son estables y los signos de engaño son mínimos.",
      verdict_warn: "Se recomienda precaución: Temblores vocales intermitentes y una carga cognitiva elevada indican posibles patrones de engaño.",
      verdict_bad: "Alto riesgo de engaño: Fluctuaciones irregulares del tono e instancias de alto estrés coinciden con las pistas contextuales."
    },
    ru: {
      start: "Начать анализ", stop: "Остановить", scanning: "Анализ голоса...", idle: "Ожидание",
      lie: "ВЕРОЯТНОСТЬ ЛЖИ", avg: "СРЕДН", max: "МАКС", rel: "НАДЕЖНОСТЬ",
      ai_scan: "ИИ СКАНИРОВАНИЕ: АКТИВНО", ai_idle: "ИИ СКАНИРОВАНИЕ: ГОТОВ",
      jitter: "Джиттер", shimmer: "Шиммер", hnr: "HNR", ai_prob: "ИИ вер.",
      mti: "Микро-тремор", fi: "Нестаб. формантов", pdr: "Отклон. высоты тона",
      speaker: "ГОВОРЯЩИЙ", music: "ОБНАРУЖЕНА МУЗЫКА/ЭФФЕКТЫ",
      verdict_label: "ИТОГОВЫЙ ВЕРДИКТ", stability: "СТАБИЛЬНОСТЬ", avg_stress: "СРЕДНИЙ СТРЕСС", peak_stress: "ПИКОВЫЙ СТРЕСС",
      truth_content: "ПРАВДА", lie_content: "ЛОЖЬ",
      integrity: "ИНДЕКС ЧЕСТНОСТИ", genre: "ЖАНР",
      vocal_cog: "ВОКАЛЬНО-КОГНИТИВНЫЙ АНАЛИЗ", context_audit: "КОНТЕКСТНЫЙ АУДИТ", neural_psy: "НЕЙРОПСИХОЛОГИЯ",
      agitation: "ВОЛНЕНИЕ (TEO)", cog_load: "КОГНИТИВНАЯ НАГРУЗКА", deception_density: "ПЛОТНОСТЬ ОБМАНА",
      timeline: "АНАЛИЗ ХРОНОЛОГИИ", data_sheet: "ТАБЛИЦА ДАННЫХ",
      save_sheet: "📊 Сохранить (CSV)", share_btn: "Поделиться правдой", close: "Закрыть",
      ai_warning: "ОБНАРУЖЕН СИНТЕТИЧЕСКИЙ ГОЛОС ИИ", ai_warning_sub: "Анализ невозможен: обнаружен синтетический голос.",
      report_title: "ПОДРОБНЫЙ АНАЛИТИЧЕСКИЙ ОТЧЕТ", session_id: "SESSION ID",
      toast_mic_needed: "Пожалуйста, предоставьте разрешение на микрофон.",
      toast_export: "Файл CSV успешно экспортирован!",
      toast_share: "Скриншот отчета сохранен!",
      toast_history_cleared: "История очищена.",
      nav_title: "Социальный детектор лжи",
      splash_desc: "Детектор лжи по голосу в реальном времени YouTube",
      tab_youtube: "YouTube",
      tab_detector: "Детектор",
      tab_report: "Отчет",
      tab_history: "История",
      yt_placeholder: "Введите URL-адрес YouTube или поисковый запрос...",
      yt_quick_home: "🏠 Главная",
      yt_quick_trending: "🔥 В тренде",
      yt_quick_shorts: "▶ Shorts",
      yt_back_to_list: "⬅ Назад к списку",
      yt_feed_title: "🔥 Популярные видео для анализа",
      yt_placeholder_go_title: "Перейти на YouTube",
      yt_placeholder_go_sub: "Введите URL YouTube в строке поиска выше или<br>выберите видео из списка популярных ниже, чтобы начать.",
      yt_open_btn: "Открыть YouTube",
      float_idle: "Ожидание",
      float_idle_sub: "Ожидание...",
      float_truth: "Правда",
      float_doubt: "Сомнение",
      float_lie: "Ложь",
      detector_banner_idle: "Ожидание",
      detector_banner_scanning: "Анализ голоса...",
      speaker_scanning: "Сканирование голоса...",
      music_fx: "ОБНАРУЖЕНА МУЗЫКА/ЭФФЕКТЫ",
      gauge_sub_label: "Вероятность лжи",
      vol_title: "Оптимизация громкости",
      vol_status_ok: "Оптимально",
      vol_status_adjusting: "Оптимизация сигнала",
      vol_note: "Громкость системы не изменена",
      sens_label: "Чувствительность",
      mode_visual: "Визуальный",
      mode_expert: "Эксперт",
      mode_mini: "Мини",
      chart_header: "Анализ 6 каналов в реальном времени",
      feed_header: "Анализ субтитров в реальном времени",
      feed_placeholder: "Субтитры появятся здесь после начала анализа...",
      btn_share: "Поделиться правдой",
      report_session_empty: "Нет сеанса",
      report_empty_msg: "Отчет будет создан после проведения анализа",
      report_vocal_cog: "Вокально-когнитивный анализ",
      report_context_audit: "Контекстный аудит и метаданные",
      report_neural_psy: "Нейропсихологический отпечаток",
      report_deceptive_events: "Журнал обманов (Ложь > 60%)",
      rpt_no_deceptions: "Обманов не обнаружено",
      report_data_sheet: "Таблица субтитров",
      table_time: "Время",
      table_content: "Содержимое субтитра",
      table_lie: "Ложь%",
      table_ai: "ИИ%",
      btn_export_csv: "📊 Экспорт в CSV",
      btn_share_report: "📤 Поделиться отчетом",
      history_title: "История сеансов",
      btn_clear_history: "Очистить все",
      history_empty: "Нет сохраненных сеансов",
      settings_title: "Настройки",
      settings_lang: "Язык интерфейса",
      settings_screenshot_count: "Снимки экрана (при обнаружении лжи)",
      settings_autoshow: "Автопоказ при обнаружении лжи",
      settings_close: "Закрыть",
      modal_title_done: "Анализ завершен",
      modal_sub_done: "Сохраните или поделитесь результатами",
      btn_modal_go_report: "📊 Посмотреть итоговый отчет",
      pwa_install_title: "Установить приложение Th!nc",
      pwa_install_desc: "Добавьте на главный экран для быстрого и удобного доступа!",
      pwa_btn_dismiss: "Позже",
      pwa_btn_install: "Установить",
      ios_pwa_text: "Чтобы установить на главный экран, нажмите кнопку «Поделиться» и выберите «На экран \"Домой\"».",
      ai_warning: "ОБНАРУЖЕН СИНТЕТИЧЕСКИЙ ГОЛОС ИИ",
      ai_warning_sub: "Анализ невозможен: обнаружен синтетический голос.",
      verdict_good: "Высокая надежность: Волновые формы голоса стабильны, признаки обмана в субтитрах минимизированы.",
      verdict_warn: "Рекомендуется осторожность: Прерывистое дрожание голоса и повышенная когнитивная нагрузка указывают на возможный обман.",
      verdict_bad: "Высокий риск обмана: Общие нерегулярные колебания высоты тона и множественные проявления высокого стресса совпадают с контекстом."
    }
  };



  // In-app premium video database — Real globally-embeddable YouTube IDs only
  const MOCK_VIDEOS = [
    { id: "UF8uR6Z6KLc", title: "스티브 잡스 2005년 스탠포드 대학교 졸업식 명연설", channel: "Stanford", views: "4.2M", duration: "15:04", genre: "education" },
    { id: "3tWJ8H1r31E", title: "[거짓말 탐지] 엘리자베스 홈즈 테라노스 인터뷰 - 목소리 톤 변화", channel: "Theranos Archive", views: "1.8M", duration: "05:22", genre: "finance" },
    { id: "sh163n1lJFM", title: "역사적 거짓말? 닉슨 대통령의 명연설 'I am not a crook' 분석", channel: "Nixon Foundation", views: "2.3M", duration: "03:15", genre: "politics_opinion" },
    { id: "u4ZoJKF_VuA", title: "사이먼 시넥 '왜(Why)에서 시작하라' 명강연 분석", channel: "TED Talk", views: "3.5M", duration: "18:04", genre: "science_technology" },
    { id: "ykpn8kR1s10", title: "일론 머스크 AI의 위협과 인류의 인지 부하 심층 인터뷰", channel: "Future Watch", views: "1.2M", duration: "11:22", genre: "science_technology" },
    { id: "6Af6b_wyiwI", title: "빌 게이츠의 2015년 전염병 대유행 예측과 음성 신뢰도", channel: "TED Talk", views: "2.9M", duration: "08:32", genre: "science_technology" },
    { id: "jTlh2sg5Q1U", title: "MKBHD 테크 크리에이터의 음성 명료도 및 테오 동요도 분석", channel: "MKBHD Review", views: "980K", duration: "12:15", genre: "science_technology" },
    { id: "eWynt87PaJ0", title: "버락 오바마를 역사상 최강의 연설가로 만든 2004년 DNC 연설", channel: "DNC Broadcast", views: "5.1M", duration: "16:24", genre: "politics_opinion" }
  ];

  const MOCK_VIDEO_TRANSLATIONS = {
    "UF8uR6Z6KLc": {
      ko: { title: "스티브 잡스 2005년 스탠포드 대학교 졸업식 명연설", channel: "Stanford" },
      en: { title: "Steve Jobs' 2005 Stanford Commencement Address", channel: "Stanford" },
      jp: { title: "スティーブ・ジョブズ 2005年スタンフォード大学卒業式スピーチ", channel: "Stanford" },
      zh: { title: "史蒂夫·乔布斯 2005年斯坦福大学毕业典礼演讲", channel: "Stanford" },
      fr: { title: "Discours de Steve Jobs à l'Université de Stanford en 2005", channel: "Stanford" },
      de: { title: "Steve Jobs' 2005 Stanford Abschlussrede", channel: "Stanford" },
      es: { title: "Discurso de graduación de Steve Jobs en Stanford, 2005", channel: "Stanford" },
      ru: { title: "Речь Стива Джобса на выпуске в Стэнфорде, 2005", channel: "Stanford" }
    },
    "3tWJ8H1r31E": {
      ko: { title: "[거짓말 탐지] 엘리자베스 홈즈 테라노스 인터뷰 - 목소리 톤 변화", channel: "테라노스 아카이브" },
      en: { title: "[Lie Detection] Elizabeth Holmes Theranos Interview - Voice Pitch Shift Analysis", channel: "Theranos Archive" },
      jp: { title: "[嘘発見] エリザベス・ホームズ テラノス インタビュー - 声のトーン変化", channel: "Theranos Archive" },
      zh: { title: "[谎言检测] 伊丽莎白·霍姆斯 Theranos 访谈 - 声调变化分析", channel: "Theranos Archive" },
      fr: { title: "[Détection de mensonge] Interview d'Elizabeth Holmes (Theranos) - Analyse du ton de la voix", channel: "Theranos Archive" },
      de: { title: "[Lügendetektion] Elizabeth Holmes Theranos Interview - Analyse der Tonhöhenänderung", channel: "Theranos Archive" },
      es: { title: "[Detección de mentiras] Entrevista de Elizabeth Holmes (Theranos) - Análisis de tono", channel: "Theranos Archive" },
      ru: { title: "[Детекция лжи] Интервью Элизабет Холмс (Theranos) - Изменение тона голоса", channel: "Theranos Archive" }
    },
    "sh163n1lJFM": {
      ko: { title: "역사적 거짓말? 닉슨 대통령의 명연설 'I am not a crook' 분석", channel: "닉슨 재단" },
      en: { title: "A Historical Lie? Analysis of President Nixon's Famous 'I am not a crook' Speech", channel: "Nixon Foundation" },
      jp: { title: "歴史的な嘘？ニクソン大統領の名演説「私は詐欺師ではない」分析", channel: "Nixon Foundation" },
      zh: { title: "历史性的谎言？尼克松总统著名演讲“我不是骗子”分析", channel: "Nixon Foundation" },
      fr: { title: "Un mensonge historique ? Analyse du célèbre discours de Nixon 'I am not a crook'", channel: "Nixon Foundation" },
      de: { title: "Eine historische Lüge? Analyse von Präsident Nixons berühmter Rede 'I am not a crook'", channel: "Nixon Foundation" },
      es: { title: "¿Una mentira histórica? Análisis del famoso discurso de Nixon 'No soy un estafador'", channel: "Nixon Foundation" },
      ru: { title: "Историческая ложь? Анализ знаменитой речи президента Никсона «Я не жулик»", channel: "Nixon Foundation" }
    },
    "u4ZoJKF_VuA": {
      ko: { title: "사이먼 시넥 '왜(Why)에서 시작하라' 명강연 분석", channel: "TED Talk" },
      en: { title: "Simon Sinek's Legendary 'Start with Why' Speech Analysis", channel: "TED Talk" },
      jp: { title: "サイモン・シネックの「Whyから始めよ」名講義分析", channel: "TED Talk" },
      zh: { title: "西蒙·斯涅克“从为什么开始”名演讲分析", channel: "TED Talk" },
      fr: { title: "Analyse du discours légendaire de Simon Sinek 'Commencer par le Pourquoi'", channel: "TED Talk" },
      de: { title: "Simon Sineks legendäre Rede 'Start mit dem Warum' - Analyse", channel: "TED Talk" },
      es: { title: "Análisis del legendario discurso de Simon Sinek 'Empieza con el Porqué'", channel: "TED Talk" },
      ru: { title: "Анализ легендарной речи Саймона Синека «Начни с Почему»", channel: "TED Talk" }
    },
    "ykpn8kR1s10": {
      ko: { title: "일론 머스크 AI의 위협과 인류의 인지 부하 심층 인터뷰", channel: "퓨처 워치" },
      en: { title: "Elon Musk Deep Interview: AI Threats and Humanity's Cognitive Load", channel: "Future Watch" },
      jp: { title: "イーロン・マスク深層インタビュー：AIの脅威と人類の認知負荷", channel: "Future Watch" },
      zh: { title: "埃隆·马斯克深度访谈：AI威胁与人类认知负荷", channel: "Future Watch" },
      fr: { title: "Interview d'Elon Musk : Les menaces de l'IA et la charge cognitive de l'humanité", channel: "Future Watch" },
      de: { title: "Elon Musk Deep Interview: KI-Bedrohungen und die kognitive Belastung der Menschheit", channel: "Future Watch" },
      es: { title: "Entrevista en profundidad con Elon Musk: Amenazas de la IA y carga cognitiva de la humanidad", channel: "Future Watch" },
      ru: { title: "Глубокое интервью Илона Маска: Угрозы ИИ и когнитивная нагрузка человечества", channel: "Future Watch" }
    },
    "6Af6b_wyiwI": {
      ko: { title: "빌 게이츠의 2015년 전염병 대유행 예측과 음성 신뢰도", channel: "TED Talk" },
      en: { title: "Bill Gates' 2015 Pandemic Prediction and Voice Sincerity Analysis", channel: "TED Talk" },
      jp: { title: "ビル・ゲイツの2015年パンデミック予測と声의 信頼度分析", channel: "TED Talk" },
      zh: { title: "比尔·盖茨2015年流行病大流行预测与声音可信度分析", channel: "TED Talk" },
      fr: { title: "Prédiction de la pandémie de 2015 par Bill Gates et analyse de la sincérité vocale", channel: "TED Talk" },
      de: { title: "Bill Gates' Pandemie-Vorhersage 2015 und Analyse der Sprachaufrichtigkeit", channel: "TED Talk" },
      es: { title: "La predicción de la pandemia de 2015 de Bill Gates y análisis de sinceridad de la voz", channel: "TED Talk" },
      ru: { title: "Прогноз пандемии 2015 года от Билла Гейтса и анализ искренности голоса", channel: "TED Talk" }
    },
    "jTlh2sg5Q1U": {
      ko: { title: "MKBHD 테크 크리에이터의 음성 명료도 및 태도 동요도 분석", channel: "MKBHD 리뷰" },
      en: { title: "MKBHD Tech Creator's Voice Clarity and Sentiment Deviation Analysis", channel: "MKBHD Review" },
      jp: { title: "MKBHD テッククリエイターの声の明瞭度と態度動揺度分析", channel: "MKBHD Review" },
      zh: { title: "MKBHD 科技创作者的声音清晰度与情绪偏离分析", channel: "MKBHD Review" },
      fr: { title: "Analyse de la clarté vocale et de la déviation d'attitude du créateur tech MKBHD", channel: "MKBHD Review" },
      de: { title: "MKBHD Tech Creator: Analyse der Sprachklarheit und Einstellungsabweichung", channel: "MKBHD Review" },
      es: { title: "Análisis de claridad de voz y desviación de actitud del creador tecnológico MKBHD", channel: "MKBHD Review" },
      ru: { title: "Анализ ясности голоса и отклонения отношения техноблогера MKBHD", channel: "MKBHD Review" }
    },
    "eWynt87PaJ0": {
      ko: { title: "버락 오바마를 역사상 최강의 연설가로 만든 2004년 DNC 연설", channel: "DNC 방송" },
      en: { title: "The 2004 DNC Speech that Made Barack Obama a Historical Orator", channel: "DNC Broadcast" },
      jp: { title: "バラク・オバマを歴史上最強の演説者にした2004年DNC演説", channel: "DNC Broadcast" },
      zh: { title: "让巴拉克·奥巴马成为历史性演讲者的2004年DNC演讲", channel: "DNC Broadcast" },
      fr: { title: "Le discours du DNC de 2004 qui a fait de Barack Obama un orateur historique", channel: "DNC Broadcast" },
      de: { title: "Die DNC-Rede von 2004, die Barack Obama zu einem historischen Redner machte", channel: "DNC Broadcast" },
      es: { title: "El discurso de la DNC de 2004 que convirtió a Barack Obama en un orador histórico", channel: "DNC Broadcast" },
      ru: { title: "Речь на DNC 2004 года, сделавшая Барака Обаму историческим оратором", channel: "DNC Broadcast" }
    }
  };

  function getLocalizedVideo(video) {
    if (!video) return video;
    const trans = MOCK_VIDEO_TRANSLATIONS[video.id];
    if (trans) {
      const local = trans[currentLang] || trans['en'];
      if (local) {
        return {
          ...video,
          title: local.title || video.title,
          channel: local.channel || video.channel
        };
      }
    }
    return video;
  }

  // Helper for translations
  function t(key) {
    const langData = TRANSLATIONS[currentLang] || TRANSLATIONS['en'];
    return langData[key] || key;
  }

  const additionalTranslations = {
    ko: {
      settings_save: "저장 (Save)",
      settings_reset: "초기화 (Reset)",
      toast_settings_saved: "설정이 성공적으로 저장되었습니다.",
      confirm_clear_all_data: "모든 로컬 데이터를 지우고 앱을 초기화하시겠습니까?",
      system_diagnostic_title: "시스템 진단 정보",
      system_platform: "플랫폼: 데스크탑 대시보드 모드 (v3.5)",
      system_audio_engine: "오디오 엔진: 오프라인 웹 오디오 FFT 시뮬레이션",
      system_ai_engine: "AI 엔진 상태: 로드됨 (Alpha 3.5)",
      expert_metrics_title: "실시간 세부 음성 매개변수",
      wave_scan_title: "실시간 음향 파형 스캔",
      stress_deviation_label: "STRESS DEVIATION BAR",
      toast_captions_unavailable_online: "⚠️ [온라인 가이드] 유튜브 보안 차단으로 자막 임포트가 불가능합니다. 로컬 서버(server.js) 실행 후 http://localhost:8080 으로 접속해 재생하시면 100% 정상 작동합니다."
    },
    en: {
      settings_save: "Save",
      settings_reset: "Reset",
      toast_settings_saved: "Settings saved successfully.",
      confirm_clear_all_data: "Are you sure you want to clear all local data and reset the app?",
      system_diagnostic_title: "System Diagnostic Information",
      system_platform: "Platform: Desktop Dashboard Mode (v3.5)",
      system_audio_engine: "Audio Engine: Offline Web Audio FFT Simulation",
      system_ai_engine: "AI Engine State: Loaded (Alpha 3.5)",
      expert_metrics_title: "Real-time Voice Parameters",
      wave_scan_title: "Real-time Waveform Scan",
      stress_deviation_label: "STRESS DEVIATION BAR",
      toast_captions_unavailable_online: "⚠️ [Online Notice] YouTube blocked the proxy. Run your local server (server.js) and access http://localhost:8080 for 100% successful caption import."
    },
    jp: {
      settings_save: "保存 (Save)",
      settings_reset: "初期化 (Reset)",
      toast_settings_saved: "設定が正常に保存されました。",
      confirm_clear_all_data: "すべてのローカルデータを削除し、アプリを初期化しますか？",
      system_diagnostic_title: "システム診断情報",
      system_platform: "プラットフォーム: デスクトップダッシュボードモード (v3.5)",
      system_audio_engine: "オーディオエンジン: オフラインWeb Audio FFTシミュレーション",
      system_ai_engine: "AIエンジン状態: ロード完了 (Alpha 3.5)",
      expert_metrics_title: "リアルタイム詳細音声パラメータ",
      wave_scan_title: "リアルタイム音響波形スキャン",
      stress_deviation_label: "ストレス偏差バー",
      toast_captions_unavailable_online: "⚠️ [オンライン案内] YouTubeのセキュリティ制限により字幕を取得できません。ローカルサーバー(server.js)を実行し、http://localhost:8080 からアクセスすると100%正常に動作します。"
    },
    zh: {
      settings_save: "保存 (Save)",
      settings_reset: "重置 (Reset)",
      toast_settings_saved: "设置已成功保存。",
      confirm_clear_all_data: "您确定要清除所有本地数据并重置应用吗？",
      system_diagnostic_title: "系统诊断信息",
      system_platform: "平台：桌面仪表板模式 (v3.5)",
      system_audio_engine: "音频引擎：离线 Web Audio FFT 模拟",
      system_ai_engine: "AI 引擎状态：已加载 (Alpha 3.5)",
      expert_metrics_title: "实时详细语音参数",
      wave_scan_title: "实时声波扫描",
      stress_deviation_label: "压力偏差栏",
      toast_captions_unavailable_online: "⚠️ [在线提示] YouTube 安全策略阻挡了代理。请运行本地服务器(server.js)并访问 http://localhost:8080 播放即可 100% 正常获取字幕。"
    },
    fr: {
      settings_save: "Enregistrer (Save)",
      settings_reset: "Réinitialiser (Reset)",
      toast_settings_saved: "Paramètres enregistrés avec succès.",
      confirm_clear_all_data: "Êtes-vous sûr de vouloir effacer toutes les données locales et réinitialiser l'application ?",
      system_diagnostic_title: "Informations de diagnostic système",
      system_platform: "Plateforme : Mode tableau de bord de bureau (v3.5)",
      system_audio_engine: "Moteur audio : Simulation FFT Web Audio hors ligne",
      system_ai_engine: "État du moteur IA : Chargé (Alpha 3.5)",
      expert_metrics_title: "Paramètres vocaux détaillés en temps réel",
      wave_scan_title: "Scan de forme d'onde acoustique en temps réel",
      stress_deviation_label: "BARRE DE DÉVIATION DE STRESS",
      toast_captions_unavailable_online: "⚠️ [Avis en ligne] YouTube a bloqué le proxy. Exécutez votre serveur local (server.js) et accédez à http://localhost:8080 pour un import de sous-titres réussi à 100%."
    },
    de: {
      settings_save: "Speichern (Save)",
      settings_reset: "Zurücksetzen (Reset)",
      toast_settings_saved: "Einstellungen erfolgreich gespeichert.",
      confirm_clear_all_data: "Sind Sie sicher, dass Sie alle lokalen Daten löschen und die App zurücksetzen möchten?",
      system_diagnostic_title: "Systemdiagnoseinformationen",
      system_platform: "Plattform: Desktop-Dashboard-Modus (v3.5)",
      system_audio_engine: "Audio-Engine: Offline-Web-Audio-FFT-Simulation",
      system_ai_engine: "KI-Engine-Status: Geladen (Alpha 3.5)",
      expert_metrics_title: "Echtzeit-Stimmenparameter",
      wave_scan_title: "Echtzeit-Schallwellen-Scan",
      stress_deviation_label: "STRESS-ABWEICHUNGSBALKEN",
      toast_captions_unavailable_online: "⚠️ [Online-Hinweis] YouTube hat den Proxy blockiert. Starten Sie Ihren lokalen Server (server.js) und greifen Sie auf http://localhost:8080 zu, um Untertitel zu 100% erfolgreich zu importieren."
    },
    es: {
      settings_save: "Guardar (Save)",
      settings_reset: "Restablecer (Reset)",
      toast_settings_saved: "Configuración guardada con éxito.",
      confirm_clear_all_data: "¿Está seguro de que desea borrar todos los datos locales y restablecer la aplicación?",
      system_diagnostic_title: "Información de diagnóstico del sistema",
      system_platform: "Plataforma: Modo de panel de escritorio (v3.5)",
      system_audio_engine: "Motor de audio: Simulación FFT de audio web sin conexión",
      system_ai_engine: "Estado del motor de IA: Cargado (Alpha 3.5)",
      expert_metrics_title: "Parámetros de voz detallados en tiempo real",
      wave_scan_title: "Escaneo de forma de onda acústica en tiempo real",
      stress_deviation_label: "BARRA DE DESVIACIÓN DE ESTRÉS",
      toast_captions_unavailable_online: "⚠️ [Aviso en línea] YouTube bloqueó el proxy. Ejecute su servidor local (server.js) y acceda a http://localhost:8080 para importar subtítulos con éxito al 100%."
    },
    ru: {
      settings_save: "Сохранить (Save)",
      settings_reset: "Сбросить (Reset)",
      toast_settings_saved: "Настройки успешно сохранены.",
      confirm_clear_all_data: "Вы уверены, что хотите удалить все локальные данные и сбросить приложение?",
      system_diagnostic_title: "Системная диагностическая информация",
      system_platform: "Платформа: Режим настольной панели (v3.5)",
      system_audio_engine: "Аудиодвижок: Офлайн-симуляция Web Audio FFT",
      system_ai_engine: "Состояние ИИ-движка: Загружено (Alpha 3.5)",
      expert_metrics_title: "Детальные параметры голоса в реальном времени",
      wave_scan_title: "Сканирование звуковой волны в реальном времени",
      stress_deviation_label: "ШКАЛА ОТКЛОНЕНИЯ СТРЕССА",
      toast_captions_unavailable_online: "⚠️ [Онлайн-руководство] Блокировка YouTube мешает импорту субтитров. Запустите локальный сервер (server.js) и используйте http://localhost:8080 для 100% успешного импорта субтитров."
    }
  };

  for (const lang in additionalTranslations) {
    if (TRANSLATIONS[lang]) {
      Object.assign(TRANSLATIONS[lang], additionalTranslations[lang]);
    }
  }

  // Dynamically attach extra search history, favorites, toasts, and UI labels
  const extraTranslations = {
    ko: {
      recent_searches: "최근 검색어",
      favorites_title: "⭐ 즐겨찾기 비디오",
      loading_more: "🔄 더 많은 결과 로딩 중...",
      fav_removed: "즐겨찾기에서 제거되었습니다.",
      fav_added: "즐겨찾기에 추가되었습니다.",
      yt_no_results: "검색 결과가 없습니다.",
      toast_searching: "🔍 \"{q}\" 실제 유튜브 검색 중...",
      toast_complete: "\"{q}\" 유튜브 실시간 원본 검색 완료!",
      toast_scraped: "\"{q}\" 유튜브 실시간 스크래핑 성공!",
      toast_invidious: "\"{q}\" 유튜브 검색 완료! (Invidious 백업)",
      toast_mock: "로컬 데이터베이스에서 \"{q}\" 임시 검색 완료",
      toast_loaded: "분석 대상 비디오가 로드되었습니다.",
      toast_home_blocked: "⚠️ 유튜브 홈은 보안상 임베드가 불가능하여, 실시간 인기 목록으로 대체합니다.",
      toast_captions_loaded: "✅ 실시간 자막 로드 완료 ({lang}, {count}개)",
      toast_captions_unavailable: "⚠️ 이 비디오는 자막을 지원하지 않거나 가져올 수 없습니다. 실시간 스트레스(VSA) 분석으로만 진행됩니다.",
      toast_session_saved: "분석 세션이 저장되었습니다. 리포트 탭을 확인하세요!",
      toast_audio_check: "ℹ️ [안내] 팝업 창 하단의 \"오디오 공유\" 체크박스를 반드시 선택하세요!",
      toast_audio_captured: "🎵 탭 오디오 캡처 성공! 유튜브 실시간 원본 음성을 직접 분석합니다.",
      toast_mic_captured: "🎤 마이크 캡처 성공! 스피커 주변 소리 및 목소리를 실시간 분석합니다.",
      toast_ai_active: "✨ 자막 기반 컨텍스트 모델 활성화 — 실시간 AI 분석을 시작합니다.",
      toast_high_stress: "⚠️ 고스트레스 감지! 기만 패턴 징후 포착",
      toast_saving_report: "리포트 이미지 저장 중...",
      toast_capturing_screenshot: "스크린샷 캡처 중...",
      toast_session_loaded: "기록 세션 데이터를 불러왔습니다.",
      confirm_clear_history: "정말 모든 세션 기록을 삭제하시겠습니까?",
      pwa_https_alert: "보안 연결(HTTPS) 환경이 아니어 자동 설치가 차단되었습니다. 브라우저 우측 상단 메뉴(⋮)에서 '홈 화면에 추가'를 직접 선택해 주세요.",
      toast_popular_list: "인기 검증 분석 비디오 목록",
      toast_shorts_list: "Shorts 분석 인기 비디오",
      data_none: "데이터 없음",
      deception_detected: "기만 이벤트 감지"
    },
    en: {
      recent_searches: "Recent Searches",
      favorites_title: "⭐ Favorites",
      loading_more: "🔄 Loading more results...",
      fav_removed: "Removed from favorites.",
      fav_added: "Added to favorites.",
      yt_no_results: "No search results found.",
      toast_searching: "🔍 Searching YouTube for \"{q}\"...",
      toast_complete: "\"{q}\" YouTube Search Complete!",
      toast_scraped: "\"{q}\" Scraped Successfully!",
      toast_invidious: "\"{q}\" Search Complete (Invidious Backup)!",
      toast_mock: "Mock Search Complete for \"{q}\"",
      toast_loaded: "Analysis video loaded.",
      toast_home_blocked: "⚠️ YouTube homepage cannot be embedded. Switched to popular videos.",
      toast_captions_loaded: "✅ Live captions loaded ({lang}, {count} items)",
      toast_captions_unavailable: "⚠️ Captions unavailable. Stress analysis (VSA) only.",
      toast_session_saved: "Analysis session saved. Check Report tab!",
      toast_audio_check: "ℹ️ [Notice] Please check \"Share audio\" at the bottom of the popup!",
      toast_audio_captured: "🎵 Tab audio captured successfully. Analyzing live audio.",
      toast_mic_captured: "🎤 Mic captured successfully. Analyzing ambient voice.",
      toast_ai_active: "✨ Subtitle-based context model active. Starting live AI analysis.",
      toast_high_stress: "⚠️ High stress detected! Potential deceptive pattern.",
      toast_saving_report: "Saving report image...",
      toast_capturing_screenshot: "Capturing screenshot...",
      toast_session_loaded: "Loaded session history.",
      confirm_clear_history: "Are you sure you want to clear all session history?",
      pwa_https_alert: "Auto-install blocked due to non-HTTPS. Please use browser menu to add to home screen.",
      toast_popular_list: "Popular Verification Videos",
      toast_shorts_list: "Trending Shorts Videos",
      data_none: "No Data",
      deception_detected: "Deception Detected"
    },
    jp: {
      recent_searches: "最近の検索ワード",
      favorites_title: "⭐ お気に入り動画",
      loading_more: "🔄 さらに検索結果を読み込み中...",
      fav_removed: "お気に入りから削除されました。",
      fav_added: "お気に入りに追加されました。",
      yt_no_results: "検索結果が見つかりません。",
      toast_searching: "🔍 YouTubeで \"{q}\" を検索中...",
      toast_complete: "\"{q}\" YouTube検索が完了しました！",
      toast_scraped: "\"{q}\" スクレイピングに成功しました！",
      toast_invidious: "\"{q}\" 検索完了（Invidiousバックアップ）！",
      toast_mock: "\"{q}\" モック検索が完了しました。",
      toast_loaded: "分析ビデオがロードされました。",
      toast_home_blocked: "⚠️ YouTubeホームページは埋め込めません。人気動画に切り替えました。",
      toast_captions_loaded: "✅ リアルタイム字幕をロードしました ({lang}, {count}件)",
      toast_captions_unavailable: "⚠️ 字幕を利用できません。ストレス分析（VSA）のみ開始します。",
      toast_session_saved: "分析セッションが保存されました。レポートタブを確認してください！",
      toast_audio_check: "ℹ️ [案内] ポップアップ下の「オーディオ共有」を必ずチェックしてください！",
      toast_audio_captured: "🎵 タブオーディオのキャプチャ成功！ライブ音声を分析します。",
      toast_mic_captured: "🎤 マイクキャプチャ成功！周辺音声を分析します。",
      toast_ai_active: "✨ 字幕ベースのコンテキストモデル有効。ライブAI分析を開始します。",
      toast_high_stress: "⚠️ 高ストレス検出！潜在的な欺瞞パターン。",
      toast_saving_report: "レポート画像を保存中...",
      toast_capturing_screenshot: "スクリーンショットキャプチャ中...",
      toast_session_loaded: "セッション履歴をロードしました。",
      confirm_clear_history: "本当にすべてのセッション履歴をクリアしますか？",
      pwa_https_alert: "HTTPS接続ではないため自動インストールはブロックされました。ブラウザメニューをご利用ください。",
      toast_popular_list: "人気検証ビデオ一覧",
      toast_shorts_list: "急上昇Shortsビデオ",
      data_none: "データなし",
      deception_detected: "欺瞞イベント検出"
    },
    zh: {
      recent_searches: "最近搜索",
      favorites_title: "⭐ 收藏视频",
      loading_more: "🔄 正在加载更多结果...",
      fav_removed: "已从收藏夹中移除。",
      fav_added: "已添加到收藏夹。",
      yt_no_results: "未找到搜索结果。",
      toast_searching: "🔍 正在YouTube搜索 \"{q}\"...",
      toast_complete: "\"{q}\" YouTube 搜索完成！",
      toast_scraped: "\"{q}\" 成功抓取！",
      toast_invidious: "\"{q}\" 搜索完成（Invidious 备份）！",
      toast_mock: "\"{q}\" 模拟搜索完成",
      toast_loaded: "分析视频已加载。",
      toast_home_blocked: "⚠️ 无法嵌入 YouTube 主页。已切换至热门视频。",
      toast_captions_loaded: "✅ 实时字幕已加载 ({lang}, {count} 条)",
      toast_captions_unavailable: "⚠️ 字幕不可用。仅进行语音压力（VSA）分析。",
      toast_session_saved: "分析会话已保存。请查看报告标签页！",
      toast_audio_check: "ℹ️ [提示] 请务必勾选弹窗底部的“共享音频”！",
      toast_audio_captured: "🎵 标签页音频捕获成功！正在分析实时音频。",
      toast_mic_captured: "🎤 麦克风捕获成功！正在分析环境语音。",
      toast_ai_active: "✨ 基于字幕的上下文模型已激活。开始实时 AI 分析。",
      toast_high_stress: "⚠️ 检测到高压力！潜在的欺骗模式。",
      toast_saving_report: "正在保存报告图片...",
      toast_capturing_screenshot: "正在截取屏幕...",
      toast_session_loaded: "已加载会话历史。",
      confirm_clear_history: "您确定要清除所有会话历史吗？",
      pwa_https_alert: "由于非 HTTPS 环境阻碍自动安装。请使用浏览器菜单手动添加至主屏幕。",
      toast_popular_list: "热门验证视频列表",
      toast_shorts_list: "热门 Shorts 视频",
      data_none: "无数据",
      deception_detected: "检测到欺骗"
    },
    fr: {
      recent_searches: "Recherches récentes",
      favorites_title: "⭐ Favoris",
      loading_more: "🔄 Chargement de plus de résultats...",
      fav_removed: "Retiré des favoris.",
      fav_added: "Ajouté aux favoris.",
      yt_no_results: "Aucun résultat trouvé.",
      toast_searching: "🔍 Recherche sur YouTube pour \"{q}\"...",
      toast_complete: "Recherche YouTube terminée pour \"{q}\" !",
      toast_scraped: "Scraping réussi pour \"{q}\" !",
      toast_invidious: "Recherche terminée (Backup Invidious) pour \"{q}\" !",
      toast_mock: "Recherche mock terminée pour \"{q}\"",
      toast_loaded: "Vidéo d'analyse chargée.",
      toast_home_blocked: "⚠️ La page d'accueil YouTube ne peut être intégrée. Redirection vers les vidéos populaires.",
      toast_captions_loaded: "✅ Sous-titres chargés ({lang}, {count} éléments)",
      toast_captions_unavailable: "⚠️ Sous-titres indisponibles. Analyse de stress (VSA) uniquement.",
      toast_session_saved: "Session d'analyse enregistrée. Consultez l'onglet Rapport !",
      toast_audio_check: "ℹ️ [Avis] Veuillez cocher \"Partager l'audio\" en bas de la popup !",
      toast_audio_captured: "🎵 Audio de l'onglet capturé avec succès. Analyse de l'audio en direct.",
      toast_mic_captured: "🎤 Micro capturé avec succès. Analyse de la voix ambiante.",
      toast_ai_active: "✨ Modèle contextuel basé sur les sous-titres activé. Début de l'analyse IA en direct.",
      toast_high_stress: "⚠️ Stress élevé détecté ! Modèle trompeur potentiel.",
      toast_saving_report: "Enregistrement de l'image du rapport...",
      toast_capturing_screenshot: "Capture d'écran en cours...",
      toast_session_loaded: "Historique de session chargé.",
      confirm_clear_history: "Êtes-vous sûr de vouloir effacer tout l'historique ?",
      pwa_https_alert: "Installation automatique bloquée (non-HTTPS). Veuillez utiliser le menu du navigateur.",
      toast_popular_list: "Vidéos de vérification populaires",
      toast_shorts_list: "Vidéos Shorts tendances",
      data_none: "Pas de données",
      deception_detected: "Tromperie détectée"
    },
    de: {
      recent_searches: "Letzte Suchen",
      favorites_title: "⭐ Favoriten",
      loading_more: "🔄 Weitere Ergebnisse werden geladen...",
      fav_removed: "Aus Favoriten entfernt.",
      fav_added: "Zu Favoriten hinzugefügt.",
      yt_no_results: "Keine Suchergebnisse gefunden.",
      toast_searching: "🔍 YouTube-Suche nach \"{q}\"...",
      toast_complete: "YouTube-Suche für \"{q}\" abgeschlossen!",
      toast_scraped: "Scraping für \"{q}\" erfolgreich!",
      toast_invidious: "Suche abgeschlossen (Invidious Backup) für \"{q}\"!",
      toast_mock: "Mock-Suche abgeschlossen für \"{q}\"",
      toast_loaded: "Analysevideo geladen.",
      toast_home_blocked: "⚠️ YouTube-Startseite kann nicht eingebettet werden. Auf beliebte Videos umgeschaltet.",
      toast_captions_loaded: "✅ Untertitel geladen ({lang}, {count} Elemente)",
      toast_captions_unavailable: "⚠️ Untertitel nicht verfügbar. Nur Stressanalyse (VSA).",
      toast_session_saved: "Analysesitzung gespeichert. Siehe Bericht-Tab!",
      toast_audio_check: "ℹ️ [Hinweis] Bitte aktivieren Sie \"Audio teilen\" unten im Popup!",
      toast_audio_captured: "🎵 Tab-Audio erfolgreich erfasst. Live-Audio-Analyse gestartet.",
      toast_mic_captured: "🎤 Mikrofon erfolgreich erfasst. Umgebungsstimme wird analysiert.",
      toast_ai_active: "✨ Untertitelbasiertes Kontextmodell aktiv. Live-KI-Analyse gestartet.",
      toast_high_stress: "⚠️ Hoher Stress erkannt! Potenzielles Täuschungsmuster.",
      toast_saving_report: "Berichtsbild wird gespeichert...",
      toast_capturing_screenshot: "Screenshot wird erfasst...",
      toast_session_loaded: "Sitzungsverlauf geladen.",
      confirm_clear_history: "Sind Sie sicher, dass Sie den Verlauf löschen möchten?",
      pwa_https_alert: "Installation blockiert (kein HTTPS). Bitte nutzen Sie das Browsermenü.",
      toast_popular_list: "Beliebte Verifizierungsvideos",
      toast_shorts_list: "Beliebte Shorts-Videos",
      data_none: "Keine Daten",
      deception_detected: "Täuschung erkannt"
    },
    es: {
      recent_searches: "Búsquedas recientes",
      favorites_title: "⭐ Favoritos",
      loading_more: "🔄 Cargando más resultados...",
      fav_removed: "Eliminado de favoritos.",
      fav_added: "Añadido a favoritos.",
      yt_no_results: "No se encontraron resultados.",
      toast_searching: "🔍 Buscando en YouTube \"{q}\"...",
      toast_complete: "¡Búsqueda de YouTube completada para \"{q}\"!",
      toast_scraped: "¡Scraping exitoso para \"{q}\"!",
      toast_invidious: "¡Búsqueda completada (Backup Invidious) para \"{q}\"!",
      toast_mock: "Búsqueda mock completada para \"{q}\"",
      toast_loaded: "Vídeo de análisis cargado.",
      toast_home_blocked: "⚠️ La página de inicio de YouTube no se puede incrustar. Cambiado a vídeos populares.",
      toast_captions_loaded: "✅ Subtítulos cargados ({lang}, {count} elementos)",
      toast_captions_unavailable: "⚠️ Subtítulos no disponibles. Solo análisis de estrés (VSA).",
      toast_session_saved: "Sesión de análisis guardada. ¡Consulte la pestaña Reporte!",
      toast_audio_check: "ℹ️ [Aviso] ¡Marque la casilla \"Compartir audio\" abajo en la ventana emergente!",
      toast_audio_captured: "🎵 ¡Audio de pestaña capturado con éxito! Analizando audio en vivo.",
      toast_mic_captured: "🎤 ¡Micrófono capturado con éxito! Analizando voz ambiental.",
      toast_ai_active: "✨ Modelo de contexto basado en subtítulos activo. Iniciando análisis de IA.",
      toast_high_stress: "⚠️ ¡Estrés alto detectado! Patrón engañoso potencial.",
      toast_saving_report: "Guardando imagen del reporte...",
      toast_capturing_screenshot: "Capturando pantalla...",
      toast_session_loaded: "Historial de sesión cargado.",
      confirm_clear_history: "¿Está seguro de que desea borrar todo el historial?",
      pwa_https_alert: "Instalación automática bloqueada (no-HTTPS). Use el menú del navegador.",
      toast_popular_list: "Vídeos de verificación populares",
      toast_shorts_list: "Vídeos Shorts de tendencia",
      data_none: "Sin datos",
      deception_detected: "Engaño detectado"
    },
    ru: {
      recent_searches: "Недавние поиски",
      favorites_title: "⭐ Избранное",
      loading_more: "🔄 Загрузка дополнительных результатов...",
      fav_removed: "Удалено из избранного.",
      fav_added: "Добавлено в избранное.",
      yt_no_results: "Результаты поиска не найдены.",
      toast_searching: "🔍 Поиск на YouTube по запросу \"{q}\"...",
      toast_complete: "Поиск на YouTube по запросу \"{q}\" завершен!",
      toast_scraped: "Скрейпинг по запросу \"{q}\" выполнен успешно!",
      toast_invidious: "Поиск завершен (Invidious Backup) для \"{q}\"!",
      toast_mock: "Имитационный поиск завершен для \"{q}\"",
      toast_loaded: "Видео для анализа загружено.",
      toast_home_blocked: "⚠️ Главная страница YouTube не может быть встроена. Переключено на популярные видео.",
      toast_captions_loaded: "✅ Субтитры загружены ({lang}, {count} шт.)",
      toast_captions_unavailable: "⚠️ Субтитры недоступны. Анализируется только стресс (VSA).",
      toast_session_saved: "Сессия анализа сохранена. Проверьте вкладку Отчет!",
      toast_audio_check: "Внимание] Обязательно установите флажок «Предоставить доступ к звуку» внизу всплывающего окна!",
      toast_audio_captured: "🎵 Звук вкладки захвачен! Анализ живого аудио.",
      toast_mic_captured: "🎤 Микрофон захвачен! Анализ окружающего голоса.",
      toast_ai_active: "✨ Модель контекста субтитров активна. Начало живого ИИ-анализа.",
      toast_high_stress: "⚠️ Обнаружен высокий стресс! Подозрение на обман.",
      toast_saving_report: "Сохранение изображения отчета...",
      toast_capturing_screenshot: "Создание снимка экрана...",
      toast_session_loaded: "История сессии загружена.",
      confirm_clear_history: "Вы уверены, что хотите очистить всю историю сессий?",
      pwa_https_alert: "Автоматическая установка заблокирована (нет HTTPS). Добавьте вручную через меню браузера.",
      toast_popular_list: "Популярные проверочные видео",
      toast_shorts_list: "Популярные Shorts",
      data_none: "Нет данных",
      deception_detected: "Обнаружен обман"
    }
  };

  for (const lang in extraTranslations) {
    if (TRANSLATIONS[lang]) {
      Object.assign(TRANSLATIONS[lang], extraTranslations[lang]);
    }
  }

  // ===== INITIALIZATION =====
  document.addEventListener('DOMContentLoaded', () => {
    // Initialize settings & language immediately (for splash translations)
    initSettings();
    syncAdminSettingsFromServer();
    const splashDesc = document.querySelector('.splash-desc');
    if (splashDesc) {
      splashDesc.innerText = t('splash_desc');
    }

    // Hide splash screen after delay — always show app even if splash element is missing
    const hideSplash = () => {
      const appEl = document.getElementById('app');
      if (appEl) appEl.classList.remove('hidden');
      const splash = document.getElementById('splash-screen');
      if (splash) {
        splash.classList.add('fade-out');
        setTimeout(() => { if (splash.parentNode) splash.remove(); }, 700);
      }
    };
    setTimeout(hideSplash, 2200);

    // Initialize UI state & binds
    initTabs();
    initBinds();
    loadHistory();
    initMiniCharts();
    loadSearchHistory();
    loadFavorites();
    setupInfiniteScroll();
    
    // Prefetch Invidious instances in the background to ensure immediate search response
    triggerBackgroundInstanceFetch();

    // Render initial real-time popular video browser feed
    loadPopularVideos();

    // Initialize PWA logic after splash delay
    setTimeout(() => {
      initPWA();
    }, 3000);
  });

  // ===== NAVIGATION & TABS =====
  function initTabs() {
    const tabBtns = document.querySelectorAll('.sidebar-menu .menu-btn');
    const tabContents = document.querySelectorAll('.right-panel .tab-content');

    const updateTabIcons = () => {
      // LIVE icon (YouTube tab) - not in desktop sidebar, but checking just in case
      const liveIcon = document.querySelector('.tab-live-icon');
      const ytBtn = document.getElementById('tab-youtube');
      if (liveIcon && ytBtn) {
        liveIcon.src = ytBtn.classList.contains('active')
          ? liveIcon.dataset.active
          : liveIcon.dataset.inactive;
      }
      // Detector icon
      const detectorIcon = document.querySelector('.tab-detector-icon');
      const detBtn = document.getElementById('tab-detector');
      if (detectorIcon && detBtn) {
        detectorIcon.src = detBtn.classList.contains('active')
          ? detectorIcon.dataset.active
          : detectorIcon.dataset.inactive;
      }
      // History icon
      const historyIcon = document.querySelector('.tab-history-icon');
      const histBtn = document.getElementById('tab-history');
      if (historyIcon && histBtn) {
        historyIcon.src = histBtn.classList.contains('active')
          ? historyIcon.dataset.active
          : historyIcon.dataset.inactive;
      }
      // Report icon
      const reportIcon = document.querySelector('.tab-report-icon');
      const repBtn = document.getElementById('tab-report');
      if (reportIcon && repBtn) {
        reportIcon.src = repBtn.classList.contains('active')
          ? reportIcon.dataset.active
          : reportIcon.dataset.inactive;
      }
    };

    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        if (!tab) return;
        
        tabBtns.forEach(b => b.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));

        btn.classList.add('active');
        const targetContent = document.getElementById(`tab-content-${tab}`);
        if (targetContent) targetContent.classList.add('active');
        currentTab = tab;

        updateTabIcons();

        if (tab !== 'detector') {
          const overlay = document.getElementById('wv-float-overlay');
          if (overlay) {
            overlay.classList.add('hidden');
          }
          if (isRunning) {
            toggleSession();
          }
        }

        // Re-initialize mini charts when detector tab becomes visible
        if (tab === 'detector') {
          setTimeout(initMiniCharts, 100);
        }

        // Draw timeline report chart if report tab is open and contains data
        if (tab === 'report') {
          setTimeout(drawReportTimelineChart, 200);
        }
      });
    });

    // Set initial state icons
    updateTabIcons();
  }

  // ===== DOM EVENT BINDINGS =====
  function initBinds() {
    // 사이드바 & 우측 분석패널 토글 바인딩
    const btnSidebarToggle = document.getElementById('btn-sidebar-toggle');
    const sidebarEl = document.querySelector('.sidebar');
    if (btnSidebarToggle && sidebarEl) {
      btnSidebarToggle.addEventListener('click', () => {
        sidebarEl.classList.toggle('collapsed');
        document.body.classList.toggle('sidebar-collapsed');
        const isCollapsed = sidebarEl.classList.contains('collapsed');
        btnSidebarToggle.innerText = isCollapsed ? '▶' : '◀';
        window.dispatchEvent(new Event('resize'));
      });
    }

    const btnRightPanelToggle = document.getElementById('btn-right-panel-toggle');
    const rightPanelEl = document.querySelector('.right-panel');
    if (btnRightPanelToggle && rightPanelEl) {
      btnRightPanelToggle.addEventListener('click', () => {
        rightPanelEl.classList.toggle('collapsed');
        document.body.classList.toggle('right-panel-collapsed');
        const isCollapsed = rightPanelEl.classList.contains('collapsed');
        btnRightPanelToggle.innerText = isCollapsed ? '◀' : '▶';
        window.dispatchEvent(new Event('resize'));
      });
    }

    // 웹뷰 오버레이 분석 시작 버튼 바인딩
    const wvFloatStartBtn = document.getElementById('wv-float-start-btn');
    if (wvFloatStartBtn) {
      wvFloatStartBtn.addEventListener('click', () => {
        toggleSession();
      });
    }

    // 백그라운드 거짓 스캔 버튼 바인딩
    const btnBgScan = document.getElementById('btn-bg-scan');
    if (btnBgScan) {
      btnBgScan.addEventListener('click', () => {
        showToast("백그라운드 거짓 스캔을 실행합니다...");
        const activeTab = document.querySelector('.platform-tab.active');
        const platform = activeTab ? activeTab.dataset.platform : 'youtube';
        const activeWebview = document.getElementById(`wv-${platform}`);
        if (activeWebview) {
          activeWebview.executeJavaScript('if (typeof forceScanPage === "function") { forceScanPage(); } else if (typeof scanPage === "function") { scanPage(); }');
        }
      });
    }

    // YouTube Loader Binds
    const btnOpenYoutube = document.getElementById('btn-open-youtube');
    if (btnOpenYoutube) {
      btnOpenYoutube.addEventListener('click', () => {
        loadYouTubeVideo("home");
      });
    }

    const btnYtGo = document.getElementById('btn-yt-go');
    if (btnYtGo) {
      btnYtGo.addEventListener('click', () => {
        const val = document.getElementById('yt-url-input')?.value;
        if (val) loadYouTubeVideo(val);
      });
    }

    const ytUrlInput = document.getElementById('yt-url-input');
    if (ytUrlInput) {
      ytUrlInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          const val = e.target.value;
          if (val) loadYouTubeVideo(val);
          e.target.blur(); // Hide software keyboard on mobile
        }
      });
    }

    // Search input focus & history dropdown handling
    const searchInput = document.getElementById('yt-url-input');
    const historyWrap = document.getElementById('yt-search-history-wrap');

    if (searchInput && historyWrap) {
      searchInput.addEventListener('focus', () => {
        renderSearchHistory();
        historyWrap.classList.remove('hidden');
      });

      // Close history wrap when clicking outside
      document.addEventListener('click', (e) => {
        const isSearchArea = searchInput.contains(e.target) || historyWrap.contains(e.target);
        if (!isSearchArea) {
          historyWrap.classList.add('hidden');
        }
      });
    }

    // Clear search history button
    const clearHistoryBtn = document.getElementById('btn-clear-search-history');
    if (clearHistoryBtn) {
      clearHistoryBtn.addEventListener('click', () => {
        clearSearchHistory();
      });
    }

    document.querySelectorAll('.yt-quick-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const url = btn.dataset.url;
        if (url.includes('trending')) {
          isPopularMode = true;
          activeSearchQuery = "";
          popularPageCounter = 0;
          allSearchResults = [];
          displayedVideoCount = 0;
          showBrowserFeed();
          showToast(t('toast_popular_list'));
          const instances = await fetchDynamicInvidiousInstances();
          const shuffled = [...instances].sort(() => Math.random() - 0.5).slice(0, 10);
          const endpoints = ['trending?type=default', 'trending?type=music', 'trending?type=news', 'popular'];
          const promises = [];
          for (const inst of shuffled) {
            for (const ep of endpoints) {
              const u = `${inst}/api/v1/${ep}`;
              promises.push(fetch(u, { signal: getTimeoutSignal(3000) }).then(r => r.ok ? r.json() : []).catch(() => []));
            }
          }
          const results = await Promise.allSettled(promises);
          const seenIds = new Set();
          const videos = [];
          for (const r of results) {
            if (r.status !== 'fulfilled' || !r.value) continue;
            const data = Array.isArray(r.value) ? r.value : [];
            for (const v of data) {
              if (!v || !v.videoId || seenIds.has(v.videoId)) continue;
              seenIds.add(v.videoId);
              videos.push({ id: v.videoId, title: v.title || '', channel: v.author || '', views: formatViews(v.viewCount), duration: formatDuration(v.lengthSeconds), genre: detectGenre(v.title || '') });
            }
          }
          renderVideoFeed(videos.length > 0 ? videos : MOCK_VIDEOS.filter(v => v.genre === 'politics_opinion' || v.genre === 'finance'));
        } else if (url.includes('shorts')) {
          isPopularMode = true;
          activeSearchQuery = "";
          popularPageCounter = 0;
          allSearchResults = [];
          displayedVideoCount = 0;
          showBrowserFeed();
          showToast(t('toast_shorts_list'));
          const query = currentLang === 'ko' ? '인기 쇼츠 shorts' : 'trending shorts viral';
          const instances = await fetchDynamicInvidiousInstances();
          const shuffled = [...instances].sort(() => Math.random() - 0.5).slice(0, 10);
          const region = currentLang === 'ko' ? 'KR' : 'US';
          const promises = [searchInvidiousParallel(query, 1).then(res => res && res.data ? res.data : []).catch(() => [])];
          for (const inst of shuffled.slice(0, 5)) {
            const u = `${inst}/api/v1/trending?type=default&region=${region}`;
            promises.push(fetch(u, { signal: getTimeoutSignal(3000) }).then(r => r.ok ? r.json() : []).catch(() => []));
          }
          const results = await Promise.allSettled(promises);
          const seenIds = new Set();
          const videos = [];
          for (const r of results) {
            if (r.status !== 'fulfilled' || !r.value) continue;
            const data = Array.isArray(r.value) ? r.value : [];
            for (const v of data) {
              const vid = v.videoId || v.id;
              if (!vid || seenIds.has(vid)) continue;
              seenIds.add(vid);
              videos.push({ id: vid, title: v.title || '', channel: v.author || '', views: formatViews(v.viewCount), duration: formatDuration(v.lengthSeconds), genre: detectGenre(v.title || '') });
            }
          }
          renderVideoFeed(videos.length > 0 ? videos : MOCK_VIDEOS.filter(v => v.genre === 'science_technology' || v.genre === 'entertainment_rumor'));
        } else {
          loadYouTubeVideo('home');
        }
      });
    });

    // Back to feed list
    const btnYtBack = document.getElementById('btn-yt-back');
    if (btnYtBack) {
      btnYtBack.addEventListener('click', () => {
        disableAlternativePlayer();
        if (ytBlockedTimer) clearTimeout(ytBlockedTimer);
        const blockedOverlay = document.getElementById('yt-blocked-overlay');
        if (blockedOverlay) blockedOverlay.classList.add('hidden');
        showBrowserFeed();
      });
    }

    // Alternative player event binds
    const btnUseAlt = document.getElementById('btn-use-alt');
    if (btnUseAlt) {
      btnUseAlt.addEventListener('click', () => {
        enableAlternativePlayer(activeVideoId);
      });
    }

    const btnRetryYt = document.getElementById('btn-retry-yt');
    if (btnRetryYt) {
      btnRetryYt.addEventListener('click', () => {
        const blockedOverlay = document.getElementById('yt-blocked-overlay');
        if (blockedOverlay) blockedOverlay.classList.add('hidden');
        loadYouTubeVideo(activeVideoId);
      });
    }

    const btnAltToggle = document.getElementById('btn-alt-toggle');
    if (btnAltToggle) {
      btnAltToggle.addEventListener('click', () => {
        toggleAlternativePlayer();
      });
    }
    
    initAltPlayerEvents();

    // YouTube Quickstart Button Binds
    const quickstartBtn = document.getElementById('btn-yt-quickstart');
    if (quickstartBtn) {
      quickstartBtn.addEventListener('click', toggleSession);
    }

    // Start/Stop analysis
    const btnToggle = document.getElementById('btn-toggle');
    if (btnToggle) {
      btnToggle.addEventListener('click', toggleSession);
    }

    // Sensitivity slider
    const sensSlider = document.getElementById('sens-slider');
    const sensVal = document.getElementById('sens-val');
    if (sensSlider && sensVal) {
      sensSlider.addEventListener('input', (e) => {
        sensVal.innerText = e.target.value;
      });
    }

    // View Modes tabs
    const modeTabs = document.querySelectorAll('#mode-tabs .mode-tab');
    modeTabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        modeTabs.forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        viewMode = e.target.dataset.mode;
        
        // Hide/Show grids
        const expertGrid = document.getElementById('expert-grid');
        const multichart = document.getElementById('multichart-container');
        const feed = document.getElementById('subtitle-feed');

        if (viewMode === 'expert') {
          if (expertGrid) expertGrid.classList.remove('hidden');
          if (multichart) multichart.classList.remove('hidden');
          if (feed) feed.classList.remove('hidden');
        } else if (viewMode === 'mini') {
          if (expertGrid) expertGrid.classList.add('hidden');
          if (multichart) multichart.classList.add('hidden');
          if (feed) feed.classList.add('hidden');
        } else { // visual
          if (expertGrid) expertGrid.classList.add('hidden');
          if (multichart) multichart.classList.remove('hidden');
          if (feed) feed.classList.remove('hidden');
        }
      });
    });

    // Settings drawer trigger (Note: not used on desktop settings tab)
    const btnSettingsNav = document.getElementById('btn-settings-nav');
    if (btnSettingsNav) {
      btnSettingsNav.addEventListener('click', () => {
        const overlay = document.getElementById('settings-overlay');
        if (overlay) overlay.classList.remove('hidden');
      });
    }

    const btnCloseSettings = document.getElementById('btn-close-settings');
    if (btnCloseSettings) {
      btnCloseSettings.addEventListener('click', () => {
        const overlay = document.getElementById('settings-overlay');
        if (overlay) overlay.classList.add('hidden');
      });
    }

    // Bottom settings clicks
    const setShotMinus = document.getElementById('set-shot-minus');
    if (setShotMinus) setShotMinus.addEventListener('click', () => adjustScreenshotCount(-1));
    const setShotPlus = document.getElementById('set-shot-plus');
    if (setShotPlus) setShotPlus.addEventListener('click', () => adjustScreenshotCount(1));
    const btnShotMinus = document.getElementById('btn-shot-minus');
    if (btnShotMinus) btnShotMinus.addEventListener('click', () => adjustScreenshotCount(-1));
    const btnShotPlus = document.getElementById('btn-shot-plus');
    if (btnShotPlus) btnShotPlus.addEventListener('click', () => adjustScreenshotCount(1));

    // Share alert modal
    const btnShare = document.getElementById('btn-share');
    if (btnShare) btnShare.addEventListener('click', triggerTruthCapture);
    const btnCloseModal = document.getElementById('btn-close-modal');
    if (btnCloseModal) btnCloseModal.addEventListener('click', closeTruthModal);
    const btnModalBottomClose = document.getElementById('btn-modal-bottom-close');
    if (btnModalBottomClose) btnModalBottomClose.addEventListener('click', closeTruthModal);
    
    // Final Report Access from modal
    const btnGoReport = document.getElementById('btn-modal-go-report');
    if (btnGoReport) {
      btnGoReport.addEventListener('click', () => {
        closeTruthModal();
        const tabReport = document.getElementById('tab-report');
        if (tabReport) tabReport.click();
      });
    }


    // Export report CSV
    const btnExportCsv = document.getElementById('btn-export-csv');
    if (btnExportCsv) btnExportCsv.addEventListener('click', exportCSV);
    const btnShareReport = document.getElementById('btn-share-report');
    if (btnShareReport) btnShareReport.addEventListener('click', shareReportScreenshot);

    // Clear history
    const btnClearHistory = document.getElementById('btn-clear-history');
    if (btnClearHistory) btnClearHistory.addEventListener('click', clearHistory);

    // Minimize float button redirect
    const floatBtn = document.getElementById('float-detector-btn');
    if (floatBtn) {
      floatBtn.addEventListener('click', () => {
        const tabDet = document.getElementById('tab-detector');
        if (tabDet) tabDet.click();
      });
    }

    // Float scroll down buttons
    const btnScrollDet = document.getElementById('btn-scroll-down-detector');
    if (btnScrollDet) {
      btnScrollDet.addEventListener('click', () => {
        const area = document.querySelector('#tab-content-detector .detector-scroll-area');
        if (area) area.scrollTo({ top: area.scrollHeight, behavior: 'smooth' });
      });
    }

    const btnScrollRep = document.getElementById('btn-scroll-down-report');
    if (btnScrollRep) {
      btnScrollRep.addEventListener('click', () => {
        const area = document.querySelector('#tab-content-report .report-scroll-area');
        if (area) area.scrollTo({ top: area.scrollHeight, behavior: 'smooth' });
      });
    }

    // Drag Capture & Social Share Init
    initDragCapture();
    initSocialShareBinds();
    initSocialExtension();
  }

  // ===== TH!NC INTEGRATED SOCIAL EXTENSION =====
  function initSocialExtension() {
    console.log('[Th!nc-Extension] Initializing Social Integration...');

    const tabs = document.querySelectorAll('.platform-tab');
    const webviews = document.querySelectorAll('.social-webview');
    const urlInput = document.getElementById('yt-url-input');
    const btnGo = document.getElementById('btn-yt-go');
    const btnPrev = document.getElementById('btn-nav-prev');
    const btnNext = document.getElementById('btn-nav-next');
    const btnReload = document.getElementById('btn-nav-reload');
    const btnLogin = document.getElementById('btn-platform-login');

    let activeWebview = document.getElementById('wv-youtube');

    // 1. 탭 전환 제어
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const platform = tab.dataset.platform;
        
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        webviews.forEach(wv => {
          wv.classList.remove('active');
          if (wv.id === `wv-${platform}`) {
            wv.classList.add('active');
            activeWebview = wv;

            // 탭 포커스 시 비로소 로딩 (백그라운드 소리/재생 방지)
            const currentSrc = wv.getAttribute('src');
            const dataSrc = wv.getAttribute('data-src');
            if ((!currentSrc || currentSrc === 'about:blank') && dataSrc) {
              console.log(`[Th!nc-Extension] Lazy loading webview ${wv.id} with ${dataSrc}`);
              wv.setAttribute('src', dataSrc);
            }
          }
        });

        // 로그인 버튼은 유튜브 플랫폼일 때만 노출
        if (btnLogin) {
          if (platform === 'youtube') btnLogin.classList.remove('hidden');
          else btnLogin.classList.add('hidden');
        }

        // 주소창 업데이트
        try {
          urlInput.value = activeWebview.getURL();
        } catch(e) {
          if (platform === 'youtube') urlInput.value = 'https://m.youtube.com';
          else if (platform === 'facebook') urlInput.value = 'https://m.facebook.com';
          else if (platform === 'instagram') urlInput.value = 'https://www.instagram.com';
          else if (platform === 'tiktok') urlInput.value = 'https://www.tiktok.com';
        }
      });
    });

    // 2. 뒤로 / 앞으로 / 새로고침 제어
    if (btnPrev) btnPrev.addEventListener('click', () => { if (activeWebview && activeWebview.canGoBack()) activeWebview.goBack(); });
    if (btnNext) btnNext.addEventListener('click', () => { if (activeWebview && activeWebview.canGoForward()) activeWebview.goForward(); });
    if (btnReload) btnReload.addEventListener('click', () => { if (activeWebview) activeWebview.reload(); });

    // 3. 주소 이동 및 검색 처리
    function navigateToUrl() {
      let val = urlInput.value.trim();
      if (!val) return;

      if (!val.startsWith('http://') && !val.startsWith('https://')) {
        const platform = document.querySelector('.platform-tab.active').dataset.platform;
        if (platform === 'youtube') val = `https://m.youtube.com/results?q=${encodeURIComponent(val)}`;
        else if (platform === 'facebook') val = `https://m.facebook.com/search/top/?q=${encodeURIComponent(val)}`;
        else if (platform === 'instagram') val = `https://www.instagram.com/explore/tags/${encodeURIComponent(val)}`;
        else if (platform === 'tiktok') val = `https://www.tiktok.com/search?q=${encodeURIComponent(val)}`;
      }
      if (activeWebview) activeWebview.loadURL(val);
    }

    if (btnGo) btnGo.addEventListener('click', navigateToUrl);
    if (urlInput) urlInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        navigateToUrl();
        urlInput.blur();
      }
    });

    // 4. 구글 로그인 버튼 연동
    if (btnLogin) btnLogin.addEventListener('click', () => {
      if (window.electronAPI && window.electronAPI.openYoutubeLogin) {
        window.electronAPI.openYoutubeLogin();
      }
    });

    function extractVideoIdFromUrl(url) {
      if (!url) return null;
      try {
        const parsed = new URL(url);
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

    function checkAndTriggerAnalysis(url, webviewId) {
      const lowerUrl = (url || '').toLowerCase();
      const isWatchOrShorts = lowerUrl.includes('watch') || lowerUrl.includes('/shorts/') || 
                              lowerUrl.includes('/reel/') || lowerUrl.includes('/video/') ||
                              lowerUrl.includes('facebook.com/videos');

      if (!isWatchOrShorts) {
        console.log(`[Th!nc-Extension] URL does not contain watch/shorts/reel/video. Hiding overlay immediately.`);
        const overlay = document.getElementById('wv-float-overlay');
        if (overlay) {
          overlay.classList.add('hidden');
          overlay.style.display = 'none';
        }
        if (isRunning) {
          toggleSession();
        }
        return;
      }

      const videoId = extractVideoIdFromUrl(url);
      if (videoId) {
        console.log(`[Th!nc-Extension] Auto-triggered analysis from navigation: ${videoId}`);
        loadSocialVideoAnalysis(videoId, webviewId);
      } else {
        console.log(`[Th!nc-Extension] Navigation away from video. Hiding overlay.`);
        const overlay = document.getElementById('wv-float-overlay');
        if (overlay) {
          overlay.classList.add('hidden');
          overlay.style.display = 'none';
        }
        if (isRunning) {
          toggleSession();
        }
      }
    }

    // 5. 웹뷰 로딩 이벤트 감지 및 주소창 동기화 + 인젝션
    const injectScriptText = (window.electronAPI && window.electronAPI.readSocialInjectScript) ? window.electronAPI.readSocialInjectScript() : '';

    webviews.forEach(wv => {
      wv.addEventListener('did-navigate', (e) => {
        if (wv === activeWebview) {
          urlInput.value = e.url;
        }
        if (window.PerformanceLogger) {
          window.PerformanceLogger.log('Webview', `Webview Navigated (${wv.id})`, 0, 'Info', `URL: ${e.url}`);
        }
        checkAndTriggerAnalysis(e.url, wv.id);
      });
      wv.addEventListener('did-navigate-in-page', (e) => {
        if (wv === activeWebview) {
          urlInput.value = e.url;
        }
        if (window.PerformanceLogger) {
          window.PerformanceLogger.log('Webview', `Webview In-Page Navigated (${wv.id})`, 0, 'Info', `URL: ${e.url}`);
        }
        checkAndTriggerAnalysis(e.url, wv.id);
      });

      wv.addEventListener('console-message', async (e) => {
        const msg = e.message;
        if (msg && msg.startsWith('[THINC-PLAYBACK]')) {
          try {
            const data = JSON.parse(msg.substring('[THINC-PLAYBACK]'.length));
            console.log(`[Th!nc-Extension] Received playback console msg:`, data);
            if (window.PerformanceLogger) {
              window.PerformanceLogger.log('Webview', `Playback Detected (${wv.id})`, 0, 'Info', `Video ID: ${data.videoId}`);
            }
            if (data.videoId) {
              loadSocialVideoAnalysis(data.videoId, data.platform);
            }
          } catch(err) {
            console.error('Failed to parse playback msg:', err);
          }
        } else if (msg && msg.startsWith('[THINC-TIMEUPDATE]')) {
          try {
            const data = JSON.parse(msg.substring('[THINC-TIMEUPDATE]'.length));
            if (data.videoId) {
              if (data.videoId !== activeVideoId) {
                console.log(`[Th!nc-Extension] Auto-aligning activeVideoId on timeupdate: ${activeVideoId} -> ${data.videoId}`);
                activeVideoId = data.videoId;
              }
              captionPlaybackSec = data.currentTime;
            }
          } catch(err) {}
        } else if (msg && msg.startsWith('[THINC-CAPTIONS-DATA]')) {
          try {
            const data = JSON.parse(msg.substring('[THINC-CAPTIONS-DATA]'.length));
            if (data.captions && data.captions.length > 0) {
              if (data.videoId && data.videoId !== activeVideoId) {
                console.log(`[Th!nc-Extension] Auto-aligning activeVideoId on captions: ${activeVideoId} -> ${data.videoId}`);
                activeVideoId = data.videoId;
              }
              console.log(`[Th!nc-Extension] Received ${data.captions.length} captions directly from injected webview!`);
              liveCaptions = await translateCaptionsIfRequired(data.captions, currentLang);
              captionLoadStatus = 'loaded';
              const localizedLang = data.lang === 'ko' ? (currentLang === 'ko' ? '한국어' : 'Korean') : (currentLang === 'ko' ? '영어' : 'English');
              showToast(t('toast_captions_loaded').replace('{lang}', localizedLang + ' (Direct)').replace('{count}', data.captions.length));
              
              if (window.PerformanceLogger) {
                window.PerformanceLogger.log('Captions', 'Load Captions Complete', 0, 'Success', `Source: Webview Direct, Count: ${data.captions.length}`);
              }
            }
          } catch(err) {
            console.error('Failed to parse injected captions:', err);
          }
        } else if (msg && msg.startsWith('[THINC-DOM-SUBTITLE]')) {
          try {
            const data = JSON.parse(msg.substring('[THINC-DOM-SUBTITLE]'.length));
            if (data.text) {
              if (data.videoId && data.videoId !== activeVideoId) {
                console.log(`[Th!nc-Extension] Auto-aligning activeVideoId on DOM subtitles: ${activeVideoId} -> ${data.videoId}`);
                activeVideoId = data.videoId;
              }
              currentSubtitle = data.text;
              captionLoadStatus = 'loaded';

              // 실시간 DOM 자막 데이터를 liveCaptions에도 안전하게 적재하여 분석 파이프라인 동화
              const startSec = captionPlaybackSec > 0 ? captionPlaybackSec : 0;
              const hasDuplicate = liveCaptions.some(c => c.text === data.text && Math.abs(c.start - startSec) < 3);
              if (!hasDuplicate) {
                liveCaptions.push({
                  start: startSec,
                  dur: 3,
                  text: data.text
                });
              }

              const currentLieScore = isSilentOrMusicOrPaused ? 0 : Math.min(99, Math.max(0, Math.round(finalScore)));
              updateSentenceFeed(data.text, currentLieScore, false);
              
              // 실시간 자막 감지에 따라 민감도 실시간 갱신 실행
              if (activeVideoId) {
                checkKeywordSensitivity(activeVideoId);
              }
            }
          } catch(err) {}
        } else if (msg && msg.startsWith('[THINC-VIDEO-RECT]')) {
          try {
            const data = JSON.parse(msg.substring('[THINC-VIDEO-RECT]'.length));
            const overlay = document.getElementById('wv-float-overlay');
            if (overlay) {
              const currentUrl = wv.getURL ? wv.getURL() : '';
              const lowerUrl = (currentUrl || '').toLowerCase();
              const isWatchOrShorts = lowerUrl.includes('watch') || lowerUrl.includes('/shorts/') || 
                                      lowerUrl.includes('/reel/') || lowerUrl.includes('/video/') ||
                                      lowerUrl.includes('facebook.com/videos');

              if (!isWatchOrShorts) {
                overlay.classList.add('hidden');
                overlay.style.display = 'none';
                if (isRunning) {
                  toggleSession();
                }
                return;
              }

              if (data.isVisible) {
                const wvRect = wv.getBoundingClientRect();
                const width = data.width;
                overlay.style.position = 'fixed';
                overlay.style.left = `${wvRect.left + data.left}px`;
                overlay.style.top = `${wvRect.top + data.top}px`;
                overlay.style.width = `${width}px`;
                overlay.style.height = `${data.height}px`;
                overlay.style.display = '';
                
                if (width < 540) {
                  overlay.classList.add('mini-overlay');
                } else {
                  overlay.classList.remove('mini-overlay');
                }
                
                overlay.classList.remove('hidden');

                // 분석 구동 상태에 따라 게이지와 누적 바 숨김/보임 처리
                const truthBar = document.getElementById('wv-float-truth-bar');
                const gauge = document.getElementById('wv-float-gauge');
                const sub = document.getElementById('wv-float-subtitle');

                if (isRunning) {
                  if (truthBar) truthBar.classList.remove('hidden');
                  if (gauge) gauge.classList.remove('hidden');
                  if (sub) sub.classList.remove('hidden');
                } else {
                  if (truthBar) truthBar.classList.add('hidden');
                  if (gauge) gauge.classList.add('hidden');
                  if (sub) sub.classList.add('hidden');
                }
              } else {
                overlay.classList.add('hidden');
                overlay.style.display = 'none';
              }
            }
          } catch(err) {}
        }
      });

      wv.addEventListener('dom-ready', () => {
        if (window.PerformanceLogger) {
          window.PerformanceLogger.log('Webview', `DOM Ready (${wv.id})`, 0, 'Success', `Guest webview content loaded.`);
        }
        if (injectScriptText) {
          console.log(`[Th!nc-Extension] Injecting script to webview: ${wv.id}`);
          if (window.PerformanceLogger) {
            window.PerformanceLogger.log('Webview', `Injecting Social Extension (${wv.id})`, 0, 'Info', `Executing inject-social.js`);
          }
          wv.executeJavaScript(injectScriptText);
        }
      });
    });

    // 6. 소셜 미디어 내 동영상 재생 시작 감지 수신
    if (window.electronAPI && window.electronAPI.onVideoPlaybackStarted) {
      window.electronAPI.onVideoPlaybackStarted((data) => {
        console.log('[Th!nc-Extension] Received playing signal from background:', data);
        if (data.videoId) {
          loadSocialVideoAnalysis(data.videoId, data.platform);
        }
      });
    }
  }

  // 유튜브 및 타 소셜 영상 실시간 분석 트리거 함수
  async function loadSocialVideoAnalysis(videoId, platform) {
    // ✅ 진행 중인 분석이 있거나 동일 비디오이면 스킵
    if (isAnalysisLocked) {
      console.log(`[Th!nc-Extension] Analysis already running (locked). Ignoring call for: ${videoId}`);
      if (window.PerformanceLogger) {
        window.PerformanceLogger.log('Analysis', 'Social Video Analysis Skipped (Locked)', 0, 'Info', `Already analyzing: ${activeVideoId}, new request: ${videoId}`);
      }
      return;
    }
    if (activeVideoId === videoId && (captionLoadStatus === 'loaded' || captionLoadStatus === 'loading')) {
      console.log(`[Th!nc-Extension] Analysis already active/loading for video: ${videoId}. Skipping re-fetch. (Status: ${captionLoadStatus})`);
      if (window.PerformanceLogger) {
        window.PerformanceLogger.log('Analysis', 'Social Video Analysis Skipped (Already Active)', 0, 'Info', `Video ID: ${videoId}, Status: ${captionLoadStatus}`);
      }
      return;
    }

    isAnalysisLocked = true; // ✅ 잠금 활성화
    console.log(`[Th!nc-Extension] Requesting analysis for video: ${videoId} on ${platform}`);
    activeVideoId = videoId;
    activePlatform = platform;
    
    if (window.PerformanceLogger) {
      window.PerformanceLogger.log('Analysis', 'Social Video Analysis Requested', 0, 'Info', `Video ID: ${videoId}, Platform: ${platform}`);
    }

    const bannerText = document.getElementById('banner-text');
    if (bannerText) bannerText.innerText = '분석 시작 중...';
    
    captionLoadStatus = 'loading';
    liveCaptions = [];
    subtitleRecords = [];

    let captionsLoaded = false;

    // 유튜브 백그라운드 자막 가져오기
    if (platform.includes('youtube')) {
      // 0순위: 데스크톱 앱(Electron) 환경에서는 CORS 차단이 없으므로 브라우저에서 다이렉트로 InnerTube 자막 추출 시도 (초고속 및 캡차 완벽 우회)
      if (window.electronAPI) {
        try {
          console.log(`[Th!nc-Extension] Electron direct InnerTube capture started for video: ${videoId}`);
          const directResult = await getYouTubeTranscriptDirectBrowser(videoId, currentLang);
          if (directResult && directResult.captions && directResult.captions.length > 0) {
            console.log(`[Th!nc-Extension] Successfully fetched direct browser captions (${directResult.captions.length} segments) in 100ms.`);
            liveCaptions = directResult.captions;
            captionLoadStatus = 'loaded';
            captionsLoaded = true;
            captionPlaybackSec = 0;
            lastShownCaptionIdx = -1;
          }
        } catch (directErr) {
          console.warn('[Th!nc-Extension] Direct browser InnerTube capture failed, falling back to other ways:', directErr.message);
        }
      }

      // 1순위: 다이렉트 획득 실패 시, 기존 백그라운드 스크래핑 BrowserWindow 윈도우 호출 시도
      if (!captionsLoaded && window.electronAPI && window.electronAPI.fetchBackgroundCaptions) {
        try {
          if (window.PerformanceLogger) {
            window.PerformanceLogger.log('Captions', 'Background Captions Fetch Start', 0, 'Info', `Requesting background scraper window for video ${videoId}`);
          }
          const result = await window.electronAPI.fetchBackgroundCaptions(videoId);
          if (result && result.ok && result.captions) {
            console.log(`[Th!nc-Extension] Successfully fetched background captions (${result.captions.length} segments).`);
            if (window.PerformanceLogger) {
              window.PerformanceLogger.log('Captions', 'Background Captions Scraping Success', 0, 'Success', `Scraped ${result.captions.length} caption segments.`);
            }
            // background 스크래퍼가 돌려주는 segment 구조는 { offset, duration, text } 이므로 { start, dur, text } 로 정규화
            liveCaptions = result.captions.map(c => ({
              start: c.start !== undefined ? c.start : (c.offset !== undefined ? c.offset / 1000 : 0),
              dur: c.dur !== undefined ? c.dur : (c.duration !== undefined ? c.duration / 1000 : 1.0),
              text: c.text
            }));
            captionLoadStatus = 'loaded';
            captionsLoaded = true;
            captionPlaybackSec = 0;
            lastShownCaptionIdx = -1;
          } else {
            if (window.PerformanceLogger) {
              window.PerformanceLogger.log('Captions', 'Background Captions Scraping Empty', 0, 'Warning', result ? result.error || 'No captions returned' : 'No result');
            }
          }
        } catch (err) {
          console.warn('[Th!nc-Extension] Background caption fetch exception:', err.message);
          if (window.PerformanceLogger) {
            window.PerformanceLogger.log('Captions', 'Background Captions Scraping Error', 0, 'Failed', err.message);
          }
        }
      }
    }

    // 유튜브 백그라운드 수집 실패 시, 강력한 5계층 자막 획득 에이전트(loadCaptionsForVideo)로 우회 시도
    if (!captionsLoaded && platform.includes('youtube')) {
      console.log(`[Th!nc-Extension] Background scraper failed or skipped. Trying robust loadCaptionsForVideo fallback...`);
      if (window.PerformanceLogger) {
        window.PerformanceLogger.log('Captions', 'Triggering loadCaptionsForVideo Fallback', 0, 'Info', 'Running 5-tier robust transcription cascade');
      }
      try {
        await loadCaptionsForVideo(videoId);
        if (liveCaptions && liveCaptions.length > 0) {
          captionsLoaded = true;
          captionPlaybackSec = 0;
          lastShownCaptionIdx = -1;
          if (window.PerformanceLogger) {
            window.PerformanceLogger.log('Captions', 'Robust Caption Fallback Loaded', 0, 'Success', `Loaded ${liveCaptions.length} segments via frontend cascade.`);
          }
        } else {
          if (window.PerformanceLogger) {
            window.PerformanceLogger.log('Captions', 'Robust Caption Fallback Failed', 0, 'Failed', 'No subtitles retrieved via cascade.');
          }
        }
      } catch (err) {
        console.warn('[Th!nc-Extension] Robust caption load fallback failed:', err.message);
        if (window.PerformanceLogger) {
          window.PerformanceLogger.log('Captions', 'Robust Caption Fallback Error', 0, 'Failed', err.message);
        }
      }
    }

    // 유튜브 백그라운드 수집 실패 또는 타 플랫폼(페이스북, 인스타, 틱톡)
    try {
      if (window.PerformanceLogger) {
        window.PerformanceLogger.log('Network', 'Fetch Fast Rating Score', 0, 'Info', `Requesting fast analyze API for ${videoId}`);
      }
      const resp = await fetchWithBackendFallback(`/api/analyze-video-fast?id=${videoId}&channel=${encodeURIComponent(currentUploaderName || '')}`);
      const data = await resp.json();
      if (data && data.ok) {
        console.log(`[Th!nc-Extension] Fast rating score obtained: ${data.score}%`);
        if (window.PerformanceLogger) {
          window.PerformanceLogger.log('Network', 'Fast Rating Score Received', 0, 'Success', `Reliability Score: ${data.score}%, rating: ${data.rating}`);
        }
        
        targetScore = data.score;
        const relBadge = document.getElementById('det-rel-badge');
        if (relBadge) relBadge.innerText = `${data.score}% RELIABILITY`;
      }
    } catch (e) {
      console.warn('[Th!nc-Extension] Fallback fast rating failed:', e.message);
      if (window.PerformanceLogger) {
        window.PerformanceLogger.log('Network', 'Fast Rating Fetch Failed', 0, 'Failed', e.message);
      }
    }

    // 분석 기능 기동 (음성/자막) - 이미 실행 중이면 중복 클릭 방지
    if (bannerText) bannerText.innerText = '음성 분석 중...';
    if (!isRunning) {
      if (window.PerformanceLogger) {
        window.PerformanceLogger.log('Analysis', 'Auto-starting VSA engine', 0, 'Info', 'Triggering analysis toggle session');
      }
      const btnToggle = document.getElementById('btn-toggle');
      if (btnToggle && btnToggle.dataset.running === 'false') {
        btnToggle.click();
      }
    }

    isAnalysisLocked = false; // ✅ 분석 요청 완료 후 잠금 해제 (다음 영상 분석 허용)
  }

  const isLocalHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

  function getTimeoutSignal(ms) {
    if (typeof AbortSignal.timeout === 'function') {
      return AbortSignal.timeout(ms);
    }
    const controller = new AbortController();
    setTimeout(() => controller.abort(), ms);
    return controller.signal;
  }

  // ===== INVIDIOUS REAL-TIME YOUTUBE DATA AGENT =====
  const INVIDIOUS_INSTANCES = [
    "https://inv.nadeko.net",
    "https://invidious.nerdvpn.de",
    "https://invidious.tiekoetter.com",
    "https://yewtu.be",
    "https://yt.chocolatemoo53.com",
    "https://invidious.lunar.icu",
    "https://invidious.drgns.space"
  ];

  // Strong, reliable multi-CORS proxy pool with automatic fallbacks
  const CORS_PROXIES = [
    url => `https://proxy.corsfix.com/?${url}`,
    url => `https://api.cors.lol/?url=${encodeURIComponent(url)}`,
    url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    url => `https://cors.eu.org/${url}`,
    url => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
    url => `https://corsproxy.org/?${encodeURIComponent(url)}`
  ];

  async function fetchViaCORSProxy(targetUrl) {
    // Electron(데스크톱) 또는 Capacitor(모바일) 환경: CORS 제약 없이 직접 Fetch를 먼저 시도
    const isElectron = window.electronAPI && window.electronAPI.isElectron;
    const isCapacitor = typeof window !== 'undefined' && window.Capacitor && window.Capacitor.isNativePlatform;
    if (isElectron || isCapacitor) {
      try {
        console.log(`[Direct] Fetching directly: ${targetUrl}`);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const response = await fetch(targetUrl, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (response.status === 404) {
          throw new Error("HTTP 404 - Not Found");
        }
        if (response.ok) {
          const text = await response.text();
          if (text && !text.includes("pricing") && !text.includes("limited to localhost") && !text.includes("Access Denied")) {
            return text;
          }
        }
      } catch (err) {
        console.warn(`[Direct] Direct fetch failed for ${targetUrl}, falling back to proxies:`, err.message || err);
        if (err.message.includes("404")) {
          throw err;
        }
      }
    }

    // 1. Try primary configured proxies first
    for (const getProxyUrl of CORS_PROXIES) {
      try {
        const proxyUrl = getProxyUrl(targetUrl);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4500); // 4.5 seconds timeout per proxy
        
        const response = await fetch(proxyUrl, { signal: controller.signal });
        clearTimeout(timeoutId);
        
        if (response.ok) {
          const text = await response.text();
          // Check if proxy returned a blocked/usage-limit notice
          if (text.includes("pricing") || text.includes("limited to localhost") || text.includes("Access Denied")) {
            throw new Error("Proxy limit or block detected");
          }
          return text;
        }
      } catch (err) {
        console.warn(`CORS Proxy failed for URL: ${targetUrl}`, err);
      }
    }
    
    // 2. Fallback: AllOrigins JSON Wrapper (Highly effective for raw text/XML bypassing)
    try {
      console.log(`Trying AllOrigins JSON Wrapper fallback for: ${targetUrl}`);
      const fallbackUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000); // 6s timeout
      
      const response = await fetch(fallbackUrl, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const json = await response.json();
        if (json && json.contents) {
          return json.contents;
        }
      }
    } catch (err) {
      console.warn("AllOrigins JSON Wrapper fallback failed:", err);
    }
    
    throw new Error("All CORS proxies in the pool failed.");
  }

  // --- Failed Frontend Nodes Blacklist Cache ---
  const failedFrontendNodes = new Map(); // hostname -> timestamp
  const FRONTEND_BLACKLIST_DURATION = 1 * 60 * 60 * 1000; // 1 Hour

  function markFrontendNodeFailed(nodeUrl) {
    try {
      const domain = new URL(nodeUrl).hostname;
      failedFrontendNodes.set(domain, Date.now());
      console.log(`[Frontend Blacklist] Marked ${domain} as failed (temporarily blocked)`);
    } catch (e) {
      console.warn("markFrontendNodeFailed warning:", e.message);
    }
  }

  function isFrontendNodeBlacklisted(nodeUrl) {
    try {
      const domain = new URL(nodeUrl).hostname;
      if (failedFrontendNodes.has(domain)) {
        const timestamp = failedFrontendNodes.get(domain);
        if (Date.now() - timestamp < FRONTEND_BLACKLIST_DURATION) {
          return true;
        } else {
          failedFrontendNodes.delete(domain);
        }
      }
    } catch (e) {}
    return false;
  }

  const PIPED_API_INSTANCES = [
    "https://pipedapi.kavin.rocks",
    "https://api.piped.private.coffee",
    "https://pipedapi.in.projectsegfau.lt",
    "https://pipedapi.darkness.services",
    "https://piped-api.lunar.icu",
    "https://piped-api.garudalinux.org",
    "https://pipedapi.tokhmi.xyz"
  ];

  let dynamicPipedInstances = [...PIPED_API_INSTANCES];
  let dynamicInvidiousInstances = [...INVIDIOUS_INSTANCES];

  function fetchDynamicPipedInstances() {
    // Try multiple Piped mirror sources for dynamics
    const sources = [
      'https://piped-instances.kavin.rocks/',
      'https://raw.githubusercontent.com/team-piped/piped-instances/main/piped-instances.json'
    ];
    
    const trySource = (idx) => {
      if (idx >= sources.length) return;
      fetchViaCORSProxy(sources[idx]).then(text => {
        const list = JSON.parse(text);
        if (Array.isArray(list)) {
          const urls = list
            .filter(item => item && item.api_url)
            .map(item => item.api_url);
          
          const index = urls.indexOf("https://api.piped.private.coffee");
          if (index !== -1) urls.splice(index, 1);
          urls.unshift("https://api.piped.private.coffee");
          
          if (urls.length > 0) {
            dynamicPipedInstances = urls;
            console.log(`[Th!nc Piped] Dynamically loaded ${urls.length} instances in background from source ${idx}.`);
          }
        }
      }).catch(err => {
        console.warn(`Failed to fetch dynamic Piped instances from source ${idx}:`, err);
        trySource(idx + 1);
      });
    };
    trySource(0);
  }

  function triggerBackgroundInstanceFetch() {
    const targetUrl = 'https://api.invidious.io/instances.json';
    fetchViaCORSProxy(targetUrl).then(text => {
      const list = JSON.parse(text);
      if (Array.isArray(list)) {
        const urls = list
          .filter(item => {
            const info = item[1];
            if (!info || info.type !== 'https' || info.monitor?.down) return false;
            const ratio = info.monitor?.dailyRatios?.[0]?.ratio;
            if (ratio !== undefined && ratio < 92) return false;
            return true;
          })
          .map(item => item[1].uri || `https://${item[0]}`);
        
        if (urls.length > 0) {
          const combined = [...new Set([...urls, ...INVIDIOUS_INSTANCES])];
          dynamicInvidiousInstances = combined;
          console.log(`[Th!nc Invidious] Dynamically loaded ${combined.length} instances in background.`);
        }
      }
    }).catch(err => {
      console.warn("Failed to fetch dynamic Invidious instances in background:", err);
    });
    
    fetchDynamicPipedInstances();
  }

  async function fetchDynamicInvidiousInstances() {
    const active = dynamicInvidiousInstances.filter(url => !isFrontendNodeBlacklisted(url));
    return active.length > 0 ? active : dynamicInvidiousInstances;
  }

  async function fetchDynamicPipedInstancesList() {
    const active = dynamicPipedInstances.filter(url => !isFrontendNodeBlacklisted(url));
    return active.length > 0 ? active : dynamicPipedInstances;
  }

  async function fetchFromInvidious(path) {
    const instances = await fetchDynamicInvidiousInstances();
    for (const instance of instances) {
      try {
        const targetUrl = `${instance}${path}`;
        // Proxy the Invidious request too to prevent browser CORS blocks
        const text = await fetchViaCORSProxy(targetUrl);
        return JSON.parse(text);
      } catch (err) {
        console.warn(`Failed fetching from Invidious instance: ${instance}`, err);
      }
    }
    throw new Error("All Invidious instances failed");
  }

  function formatViews(count) {
    if (!count) return "0";
    if (count >= 1000000) return (count / 1000000).toFixed(1) + "M";
    if (count >= 1000) return (count / 1000).toFixed(1) + "K";
    return count.toString();
  }

  function formatDuration(seconds) {
    if (!seconds) return "00:00";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  function detectGenre(title) {
    const t = title.toLowerCase();
    if (t.includes('news') || t.includes('뉴스') || t.includes('속보') || t.includes('청문회')) return 'NEWS';
    if (t.includes('coin') || t.includes('bitcoin') || t.includes('투자') || t.includes('주식') || t.includes('돈') || t.includes('해명')) return 'FINANCE';
    if (t.includes('ai') || t.includes('tech') || t.includes('review') || t.includes('과학') || t.includes('리뷰') || t.includes('로봇')) return 'SCIENCE TECHNOLOGY';
    if (t.includes('opinion') || t.includes('speech') || t.includes('연설') || t.includes('정치') || t.includes('대통령')) return 'POLITICS OPINION';
    return 'GENERAL';
  }

  async function loadPopularVideos() {
    isPopularMode = true;
    activeSearchQuery = "";
    popularPageCounter = 0;
    allSearchResults = [];
    displayedVideoCount = 0;
    
    const grid = document.getElementById('yt-video-grid');
    if (grid) {
      grid.innerHTML = `
        <div class="search-loader-container">
          <svg class="search-loader-logo" viewBox="0 0 200 200" fill="currentColor">
            <g transform="translate(10, -10)">
              <rect x="85" y="145" width="20" height="30" />
              <circle cx="95" cy="115" r="40" />
              <rect x="135" y="108" width="45" height="14" />
              <g transform="rotate(-30 95 115)">
                <rect x="68" y="10" width="54" height="110" />
                <rect x="55" y="75" width="80" height="16" />
              </g>
            </g>
          </svg>
          <div class="search-loader-text">LOADING VIDEOS...</div>
        </div>
      `;
    }

    // Load multiple popular sources in parallel for maximum speed and volume
    const instances = await fetchDynamicInvidiousInstances();
    const shuffled = [...instances].sort(() => Math.random() - 0.5).slice(0, 10);
    
    // Fire all requests at once — popular + trending from multiple instances
    const region = currentLang === 'ko' ? 'KR' : 'US';
    const endpoints = [
      `popular?region=${region}`,
      `trending?type=default&region=${region}`,
      `trending?type=music&region=${region}`,
      `trending?type=news&region=${region}`
    ];
    const allPromises = [];
    
    for (const instance of shuffled) {
      for (const endpoint of endpoints) {
        const url = `${instance}/api/v1/${endpoint}`;
        allPromises.push(
          fetch(url, { signal: getTimeoutSignal(3000) })
            .then(r => r.ok ? r.json() : null)
            .catch(() =>
              fetchViaCORSProxy(url)
                .then(text => JSON.parse(text))
                .catch(() => null)
            )
        );
      }
    }

    const results = await Promise.allSettled(allPromises);
    const seenIds = new Set();
    const videos = [];

    for (const result of results) {
      if (result.status !== 'fulfilled' || !result.value) continue;
      const data = Array.isArray(result.value) ? result.value : [];
      for (const v of data) {
        if (!v || !v.videoId || seenIds.has(v.videoId)) continue;
        seenIds.add(v.videoId);
        videos.push({
          id: v.videoId,
          title: v.title || '',
          channel: v.author || v.authorId || '',
          views: formatViews(v.viewCount),
          duration: formatDuration(v.lengthSeconds),
          genre: detectGenre(v.title || '')
        });
      }
    }

    if (videos.length > 0) {
      renderVideoFeed(videos);
      return;
    }
    
    // Fallback to mock if all real sources fail
    renderVideoFeed(MOCK_VIDEOS);
  }

  // ===== YOUTUBE IFRAME CONTROLLER =====
  let allSearchResults = [];     // Stores all search results
  let lastSearchResults = [];    // Reference to popular videos or last search results
  let displayedVideoCount = 0;   // Count of currently rendered videos
  const CHUNK_SIZE = 99;         // Grid loading chunk size
  let activeSearchQuery = "";    // Tracker for query string
  let searchPageCounter = 1;     // Tracker for Invidious search page
  let isFetchingMore = false;    // Mutex lock for scroll queries
  let isPopularMode = false;     // True when showing popular/trending feed (not a search)
  let popularPageCounter = 0;    // Page tracker for popular feed expansion

  // Search History State & Helpers
  let searchHistory = [];

  function loadSearchHistory() {
    try {
      const stored = localStorage.getItem('thinc_search_history');
      searchHistory = stored ? JSON.parse(stored) : [];
    } catch (e) {
      console.warn("Failed to load search history", e);
      searchHistory = [];
    }
    renderSearchHistory();
  }

  function saveSearchHistory() {
    try {
      localStorage.setItem('thinc_search_history', JSON.stringify(searchHistory));
    } catch (e) {
      console.warn("Failed to save search history", e);
    }
  }

  function addSearchTerm(term) {
    if (!term || typeof term !== 'string') return;
    const cleanTerm = term.trim();
    if (!cleanTerm) return;

    searchHistory = searchHistory.filter(item => item.toLowerCase() !== cleanTerm.toLowerCase());
    searchHistory.unshift(cleanTerm);
    if (searchHistory.length > 10) {
      searchHistory = searchHistory.slice(0, 10);
    }
    saveSearchHistory();
    renderSearchHistory();
  }

  function deleteSearchHistoryItem(index) {
    searchHistory.splice(index, 1);
    saveSearchHistory();
    renderSearchHistory();
  }

  function clearSearchHistory() {
    searchHistory = [];
    saveSearchHistory();
    renderSearchHistory();
  }

  function renderSearchHistory() {
    const listEl = document.getElementById('search-history-list');
    if (!listEl) return;

    if (searchHistory.length === 0) {
      listEl.innerHTML = `<div style="padding: 10px; text-align: center; color: rgba(255,255,255,0.3); font-size: 12px;">${t('history_empty')}</div>`;
      return;
    }

    listEl.innerHTML = searchHistory.map((term, idx) => {
      return `
        <div class="search-history-item" onclick="handleHistoryItemClick('${term.replace(/'/g, "\\'")}')">
          <span>${term}</span>
          <button class="btn-delete-history-item" onclick="event.stopPropagation(); handleDeleteHistoryClick(${idx})">×</button>
        </div>
      `;
    }).join('');
  }

  window.handleHistoryItemClick = function(term) {
    const input = document.getElementById('yt-url-input');
    if (input) input.value = term;
    loadYouTubeVideo(term);
    const wrap = document.getElementById('yt-search-history-wrap');
    if (wrap) wrap.classList.add('hidden');
  };

  window.handleDeleteHistoryClick = function(index) {
    deleteSearchHistoryItem(index);
  };

  // Favorites State & Helpers
  let favorites = [];

  function loadFavorites() {
    try {
      const stored = localStorage.getItem('thinc_favorites');
      favorites = stored ? JSON.parse(stored) : [];
    } catch (e) {
      console.warn("Failed to load favorites", e);
      favorites = [];
    }
    renderFavoritesGrid();
  }

  function saveFavorites() {
    try {
      localStorage.setItem('thinc_favorites', JSON.stringify(favorites));
    } catch (e) {
      console.warn("Failed to save favorites", e);
    }
  }

  function isVideoFavorite(id) {
    return favorites.some(v => v.id === id);
  }

  function toggleFavorite(video) {
    const idx = favorites.findIndex(v => v.id === video.id);
    if (idx !== -1) {
      favorites.splice(idx, 1);
      showToast(t('fav_removed'));
    } else {
      favorites.push(video);
      showToast(t('fav_added'));
    }
    saveFavorites();
    renderFavoritesGrid();

    // Sync other visible video feeds representation
    const favButtons = document.querySelectorAll(`.yt-fav-btn`);
    favButtons.forEach(btn => {
      try {
        const videoJson = btn.getAttribute('data-video-json');
        const v = JSON.parse(videoJson);
        if (v && v.id === video.id) {
          const isFavNow = isVideoFavorite(video.id);
          if (isFavNow) {
            btn.classList.add('is-fav');
            btn.innerText = '⭐';
          } else {
            btn.classList.remove('is-fav');
            btn.innerText = '☆';
          }
        }
      } catch (err) {}
    });
  }

  function renderFavoritesGrid() {
    const gridEl = document.getElementById('yt-favorites-grid');
    const feedEl = document.getElementById('yt-favorites-feed');
    if (!gridEl || !feedEl) return;

    if (favorites.length === 0) {
      feedEl.classList.add('hidden');
      gridEl.innerHTML = "";
      return;
    }

    feedEl.classList.remove('hidden');
    gridEl.innerHTML = favorites.map(video => {
      const localized = getLocalizedVideo(video);
      return `
        <div class="yt-video-card" onclick="playYouTubeEmbed('${localized.id}')" data-video-id="${localized.id}">
          <div class="yt-video-thumbnail-wrap">
            <img src="https://img.youtube.com/vi/${localized.id}/hqdefault.jpg" alt="${localized.title}">
            <span class="yt-video-duration">${localized.duration}</span>
            <button class="yt-fav-btn is-fav" data-video-json='${JSON.stringify(video).replace(/'/g, "&apos;")}' onclick="event.stopPropagation(); handleToggleFavClick(this)">⭐</button>
          </div>
          <div class="yt-video-info">
            <div class="yt-video-title">${localized.title}</div>
            <div class="yt-video-channel">${localized.channel}</div>
            <div class="yt-video-meta">👁 ${localized.views} views</div>
          </div>
        </div>
      `;
    }).join('');
    
    autoScanDesktopVideos();
  }

  window.handleToggleFavClick = function(btn) {
    try {
      const videoJson = btn.getAttribute('data-video-json');
      const video = JSON.parse(videoJson);
      toggleFavorite(video);
    } catch (e) {
      console.error("Failed to parse video json on fav click", e);
    }
  };

  function renderVideoFeed(videos) {
    allSearchResults = videos;
    lastSearchResults = videos;
    displayedVideoCount = 0;

    const grid = document.getElementById('yt-video-grid');
    if (!grid) return;

    if (videos.length === 0) {
      grid.innerHTML = `<div class="feed-placeholder" style="grid-column: span 2; padding: 40px 0;">${t('yt_no_results')}</div>`;
      return;
    }

    grid.innerHTML = "";
    renderVideoFeedChunk();
  }

  function renderVideoFeedChunk() {
    const grid = document.getElementById('yt-video-grid');
    if (!grid) return;

    const nextChunk = allSearchResults.slice(displayedVideoCount, displayedVideoCount + CHUNK_SIZE);
    if (nextChunk.length === 0) return;

    const chunkHtml = nextChunk.map(video => {
      const isFav = isVideoFavorite(video.id);
      const localized = getLocalizedVideo(video);
      return `
        <div class="yt-video-card" onclick="playYouTubeEmbed('${localized.id}')" data-video-id="${localized.id}">
          <div class="yt-video-thumbnail-wrap">
            <img src="https://img.youtube.com/vi/${localized.id}/hqdefault.jpg" alt="${localized.title}">
            <span class="yt-video-duration">${localized.duration}</span>
            <button class="yt-fav-btn ${isFav ? 'is-fav' : ''}" data-video-json='${JSON.stringify(video).replace(/'/g, "&apos;")}' onclick="event.stopPropagation(); handleToggleFavClick(this)">${isFav ? '⭐' : '☆'}</button>
          </div>
          <div class="yt-video-info">
            <div class="yt-video-title">${localized.title}</div>
            <div class="yt-video-channel">${localized.channel}</div>
            <div class="yt-video-meta">👁 ${localized.views} views</div>
          </div>
        </div>
      `;
    }).join('');

    if (displayedVideoCount === 0) {
      grid.innerHTML = chunkHtml;
    } else {
      grid.insertAdjacentHTML('beforeend', chunkHtml);
    }

    displayedVideoCount += nextChunk.length;
    reattachSentinel();
    
    // 새로 렌더된 카드에 백그라운드 사전 스캔 실행
    autoScanDesktopVideos();
  }

  async function autoScanDesktopVideos() {
    const cards = document.querySelectorAll('.yt-video-card:not([data-scanned])');
    if (cards.length === 0) return;
    
    const CONCURRENCY = 4; // 동시 요청 수 제한
    
    const scanCard = async (card) => {
      const videoId = card.getAttribute('data-video-id') || 
        card.getAttribute('onclick')?.match(/playYouTubeEmbed\('([^']+)'\)/)?.[1];
      if (!videoId) return;
      card.setAttribute('data-scanned', '1');
      
      const channelEl = card.querySelector('.yt-video-channel');
      const channelName = channelEl ? channelEl.innerText.trim() : '';
      
      const thumbWrap = card.querySelector('.yt-video-thumbnail-wrap');
      if (!thumbWrap) return;
      if (thumbWrap.querySelector('.yt-lie-badge:not(.scan-pie)')) return;

      if (scanCache[videoId]) {
        const data = scanCache[videoId];
        const badge = document.createElement('div');
        badge.className = `yt-lie-badge ${data.rating}`;
        badge.style.opacity = '0';
        badge.style.transition = 'opacity 0.3s ease';
        const emoji = data.rating === 'safe' ? '🟢' : data.rating === 'caution' ? '🟡' : data.rating === 'scanning' ? '⏳' : '🔴';
        badge.innerHTML = `${emoji} ${data.badgeText || data.score + '%'}`;
        thumbWrap.appendChild(badge);
        requestAnimationFrame(() => { badge.style.opacity = '1'; });
        return;
      }
      
      // 파이차트 진행률 뱃지 삽입 (회전 효과 추가)
      const pieBadge = document.createElement('div');
      pieBadge.className = 'yt-lie-badge scan-pie';
      pieBadge.innerHTML = `<svg class="scan-pie-svg" viewBox="0 0 24 24" style="animation: thinc-spin-pulse 3s linear infinite;">
        <circle cx="12" cy="12" r="10" fill="rgba(10,10,20,0.7)" stroke="rgba(255,255,255,0.08)" stroke-width="1.5"/>
        <circle class="scan-pie-track" cx="12" cy="12" r="9" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="2.5"/>
        <circle class="scan-pie-arc" cx="12" cy="12" r="9" fill="none" stroke="#f1c40f" stroke-width="2.5"
          stroke-dasharray="0 56.55" stroke-linecap="round" transform="rotate(-90 12 12)"/>
        <circle cx="12" cy="12" r="2" fill="#f1c40f" opacity="0.85"/>
      </svg>`;
      thumbWrap.appendChild(pieBadge);
      
      const arc = pieBadge.querySelector('.scan-pie-arc');
      const CIRC = 56.55;
      let animFrame;
      let isLocalScanning = false;
      const startTime = Date.now();
      const ANIM_DURATION = 4000;
      
      const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
      
      const animate = () => {
        const elapsed = Date.now() - startTime;
        const rawPct = Math.min(elapsed / ANIM_DURATION, 1);
        
        let pct = easeOutCubic(rawPct) * 0.95;
        if (isLocalScanning) {
          // 백그라운드 2차 로컬 스캔 시에는 90%~95% 바운싱 애니메이션 수행 (대기 시각화)
          pct = 0.92 + Math.sin(Date.now() / 150) * 0.03;
        }
        
        if (arc) arc.setAttribute('stroke-dasharray', `${pct * CIRC} ${CIRC}`);
        if (rawPct < 1 || isLocalScanning) {
          animFrame = requestAnimationFrame(animate);
        }
      };
      animFrame = requestAnimationFrame(animate);
      
      const applyResult = async (data) => {
        cancelAnimationFrame(animFrame);
        if (arc) arc.setAttribute('stroke-dasharray', `${CIRC} ${CIRC}`);
        
        await new Promise(r => setTimeout(r, 200)); // 100% 충전 잠시 표시
        pieBadge.style.transition = 'opacity 0.25s ease';
        pieBadge.style.opacity = '0';
        await new Promise(r => setTimeout(r, 250));
        pieBadge.remove();
        
        if (data && data.ok) {
          scanCache[videoId] = data; // 결과 로컬 캐싱 적용
          if (thumbWrap.querySelector('.yt-lie-badge:not(.scan-pie)')) return;
          const badge = document.createElement('div');
          badge.className = `yt-lie-badge ${data.rating}`;
          badge.style.opacity = '0';
          badge.style.transition = 'opacity 0.3s ease';
          const emoji = data.rating === 'safe' ? '🟢' : data.rating === 'caution' ? '🟡' : data.rating === 'scanning' ? '⏳' : '🔴';
          badge.innerHTML = `${emoji} ${data.badgeText || data.score + '%'}`;
          thumbWrap.appendChild(badge);
          requestAnimationFrame(() => { badge.style.opacity = '1'; });
        }
      };
      
      const handleScanFailure = async () => {
        const defaultData = {
          ok: true,
          rating: 'scanning',
          score: 0,
          badgeText: '스캔중'
        };
        await applyResult(defaultData);
      };
      
      try {
        const resp = await fetchWithBackendFallback(`/api/analyze-video-fast?id=${encodeURIComponent(videoId)}&channel=${encodeURIComponent(channelName)}`);
        const data = await resp.json();
        
        if (data && data.ok) {
          await applyResult(data);
        } else {
          if (window.electronAPI && window.electronAPI.fetchBackgroundCaptions) {
            isLocalScanning = true;
            enqueueBgScan(videoId,
              async (localResult) => {
                isLocalScanning = false;
                await applyResult(localResult);
              },
              async (err) => {
                isLocalScanning = false;
                await handleScanFailure();
              }
            );
          } else {
            await applyResult(data);
          }
        }
      } catch (e) {
        if (window.electronAPI && window.electronAPI.fetchBackgroundCaptions) {
          isLocalScanning = true;
          enqueueBgScan(videoId,
            async (localResult) => {
              isLocalScanning = false;
              await applyResult(localResult);
            },
            async (err) => {
              isLocalScanning = false;
              await handleScanFailure();
            }
          );
        } else {
          await handleScanFailure();
        }
      }
    };
    
    // CONCURRENCY 개씩 배치 처리
    const cardArray = Array.from(cards);
    for (let i = 0; i < cardArray.length; i += CONCURRENCY) {
      const batch = cardArray.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(scanCard));
    }
  }

  // Sentinel element for IntersectionObserver-based infinite scroll
  let _scrollSentinel = null;
  let _scrollObserver = null;

  function triggerMoreLoad() {
    const browserFeed = document.getElementById('yt-browser-feed');
    if (!browserFeed || browserFeed.classList.contains('hidden')) return;

    if (displayedVideoCount < allSearchResults.length) {
      renderVideoFeedChunk();
    } else if (isPopularMode && !isFetchingMore) {
      fetchMorePopularVideos();
    } else if (activeSearchQuery && !isFetchingMore) {
      fetchBackgroundSearchExtension();
    }
  }

  function setupInfiniteScroll() {
    const browserFeed = document.getElementById('yt-browser-feed');
    if (!browserFeed) return;

    if (_scrollObserver) { _scrollObserver.disconnect(); _scrollObserver = null; }
    if (_scrollSentinel && _scrollSentinel.parentNode) {
      _scrollSentinel.parentNode.removeChild(_scrollSentinel);
    }
    _scrollSentinel = document.createElement('div');
    _scrollSentinel.id = 'infinite-scroll-sentinel';
    _scrollSentinel.style.cssText = 'height:2px;width:100%;pointer-events:none;';
    const grid = document.getElementById('yt-video-grid');
    if (grid && grid.parentNode) {
      grid.parentNode.appendChild(_scrollSentinel);
    } else {
      browserFeed.appendChild(_scrollSentinel);
    }

    _scrollObserver = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) triggerMoreLoad(); },
      { root: browserFeed, rootMargin: '0px 0px 400px 0px', threshold: 0.01 }
    );
    _scrollObserver.observe(_scrollSentinel);

    const onScroll = () => {
      const feed = document.getElementById('yt-browser-feed');
      if (!feed || feed.classList.contains('hidden')) return;
      if (feed.scrollHeight - feed.scrollTop - feed.clientHeight < 800) triggerMoreLoad();
    };
    const onWindowScroll = () => {
      const feed = document.getElementById('yt-browser-feed');
      if (!feed || feed.classList.contains('hidden')) return;
      if (document.documentElement.scrollHeight - window.scrollY - window.innerHeight < 800) triggerMoreLoad();
    };
    browserFeed.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('scroll', onWindowScroll, { passive: true });
    document.addEventListener('scroll', onWindowScroll, { passive: true });
  }

  function reattachSentinel() {
    const grid = document.getElementById('yt-video-grid');
    if (!_scrollSentinel || !grid || !grid.parentNode) return;
    grid.parentNode.appendChild(_scrollSentinel);
    if (_scrollObserver && _scrollSentinel) {
      _scrollObserver.unobserve(_scrollSentinel);
      _scrollObserver.observe(_scrollSentinel);
    }
  }

  // Fetch more popular/trending videos for infinite scroll on the homepage feed
  async function fetchMorePopularVideos() {
    if (isFetchingMore) return;
    isFetchingMore = true;
    popularPageCounter++;
    showToast(t('loading_more'));

    try {
      const instances = await fetchDynamicInvidiousInstances();
      const shuffled = [...instances].sort(() => Math.random() - 0.5).slice(0, 8);
      const popularQueries = [
        currentLang === 'ko' ? '인기 뉴스 2026' : 'trending news 2026',
        currentLang === 'ko' ? '실시간 인기 동영상' : 'most viewed videos today',
        currentLang === 'ko' ? '인기 채널 최신' : 'viral videos this week',
        currentLang === 'ko' ? '유튜브 인기 급상승' : 'youtube trending now',
        currentLang === 'ko' ? '인기 동영상 2026' : 'popular videos 2026',
        currentLang === 'ko' ? '핫한 영상 최신' : 'hot videos latest',
      ];
      const query = popularQueries[popularPageCounter % popularQueries.length];
      const region = currentLang === 'ko' ? 'KR' : 'US';
      const endpoints = [
        `popular?region=${region}`,
        `trending?type=default&region=${region}`,
        `trending?type=music&region=${region}`,
        `trending?type=news&region=${region}`
      ];
      const allPromises = [];
      allPromises.push(searchInvidiousParallel(query, 1).then(res => res && res.data ? res.data : []).catch(() => []));
      for (const instance of shuffled.slice(0, 5)) {
        for (const endpoint of endpoints.slice(0, 2)) {
          const url = `${instance}/api/v1/${endpoint}`;
          allPromises.push(fetch(url, { signal: getTimeoutSignal(2500) }).then(r => r.ok ? r.json() : []).catch(() => []));
        }
      }
      const results = await Promise.allSettled(allPromises);
      const seenIds = new Set(allSearchResults.map(v => v.id));
      const newVideos = [];
      for (const result of results) {
        if (result.status !== 'fulfilled' || !result.value) continue;
        const data = Array.isArray(result.value) ? result.value : [];
        for (const v of data) {
          const vid = v.videoId || v.id;
          if (!vid || seenIds.has(vid)) continue;
          seenIds.add(vid);
          newVideos.push({ id: vid, title: v.title || '', channel: v.author || v.channel || v.authorId || '', views: formatViews(v.viewCount || v.views), duration: formatDuration(v.lengthSeconds || 0), genre: detectGenre(v.title || '') });
        }
      }
      if (newVideos.length > 0) {
        allSearchResults = allSearchResults.concat(newVideos);
        renderVideoFeedChunk();
      }
    } catch (err) {
      console.warn('fetchMorePopularVideos error:', err);
    } finally {
      isFetchingMore = false;
    }
  }

  // Parallel racing Invidious search (outer scope - accessible to both initial search and background extension)
  async function searchInvidiousParallel(query, page = 1) {
    const instances = await fetchDynamicInvidiousInstances();
    const shuffled = [...instances].sort(() => Math.random() - 0.5).slice(0, 8);
    const region = currentLang === 'ko' ? 'KR' : 'US';
    
    // 1. Try direct parallel fetches first (CORS allowed instances) with a 2.5s timeout
    const directPromises = shuffled.map(async (instance) => {
      const targetUrl = `${instance}/api/v1/search?q=${encodeURIComponent(query)}&type=video&page=${page}&hl=${currentLang}&region=${region}`;
      const response = await fetch(targetUrl, { signal: getTimeoutSignal(2500) });
      if (!response.ok) throw new Error(`Status ${response.status}`);
      const data = await response.json();
      if (!data || data.length === 0) throw new Error("Empty data");
      return data;
    });
    
    try {
      const result = await Promise.any(directPromises);
      return { data: result, method: 'direct' };
    } catch (err) {
      console.warn("Direct parallel Invidious search failed, trying via CORS proxies...", err);
    }
    
    // 2. Fallback: Try parallel fetches via CORS proxies
    const proxyPromises = shuffled.slice(0, 4).map(async (instance) => {
      const targetUrl = `${instance}/api/v1/search?q=${encodeURIComponent(query)}&type=video&page=${page}&hl=${currentLang}&region=${region}`;
      const proxyText = await fetchViaCORSProxy(targetUrl);
      const data = JSON.parse(proxyText);
      if (!data || data.length === 0) throw new Error("Empty proxy data");
      return data;
    });
    
    const result = await Promise.any(proxyPromises);
    return { data: result, method: 'proxy' };
  }

  async function fetchBackgroundSearchExtension() {
    if (!activeSearchQuery || isFetchingMore) return;
    isFetchingMore = true;
    searchPageCounter++;
    showToast(t('loading_more'));
    try {
      let allNewVideos = [];
      const extensions = currentLang === 'ko' ? [" 2026", " 비디오", " 다큐", " 이슈", " 스페셜", " 뉴스"] : [" 2026", " video", " doc", " issue", " special", " news"];
      const extensionIndex = Math.floor(allSearchResults.length / 30) % extensions.length;
      const extendedQuery = activeSearchQuery + extensions[extensionIndex];
      const localPromise = fetchWithBackendFallback(`/api/search?q=${encodeURIComponent(extendedQuery)}&hl=${currentLang}`, { signal: getTimeoutSignal(1500) })
        .then(res => res.ok ? res.json() : [])
        .catch(() => []);
      const invidiousPromise = searchInvidiousParallel(activeSearchQuery, searchPageCounter)
        .then(res => res && res.data ? res.data.filter(v => v.type === 'video').map(v => ({ id: v.videoId, title: v.title, channel: v.author, views: formatViews(v.viewCount), duration: formatDuration(v.lengthSeconds) })) : [])
        .catch(() => []);
      const [localVideos, invidiousVideos] = await Promise.all([localPromise, invidiousPromise]);
      if (localVideos && localVideos.length > 0) allNewVideos.push(...localVideos);
      if (invidiousVideos && invidiousVideos.length > 0) allNewVideos.push(...invidiousVideos);
      if (allNewVideos.length === 0) {
        const filtered = MOCK_VIDEOS.filter(v => v.title.toLowerCase().includes(activeSearchQuery.toLowerCase()) || v.channel.toLowerCase().includes(activeSearchQuery.toLowerCase()));
        if (filtered.length > 0) {
          const sliced = filtered.slice((searchPageCounter - 1) * 6, searchPageCounter * 6);
          if (sliced.length > 0) { allNewVideos = sliced; showToast(t('toast_mock').replace('{q}', activeSearchQuery)); }
        }
      }
      if (allNewVideos && allNewVideos.length > 0) {
        const newVideos = allNewVideos.filter(v => !allSearchResults.some(e => e.id === v.id)).map(v => ({ ...v, genre: detectGenre(v.title) }));
        if (newVideos.length > 0) { allSearchResults = allSearchResults.concat(newVideos); renderVideoFeedChunk(); }
      }
    } catch (err) {
      console.warn('fetchBackgroundSearchExtension error:', err);
    } finally {
      isFetchingMore = false;
    }
  }

  window.playYouTubeEmbed = function(id) {
    loadYouTubeVideo(`https://www.youtube.com/embed/${id}`);
  };

  // ===== ALTERNATIVE HTML5 VIDEO PLAYER (Invidious Bypass) =====
  let isAltPlayerActive = false;
  let ytBlockedTimer = null;

  function initAltPlayerEvents() {
    const altVideo = document.getElementById('alt-player');
    if (!altVideo) return;

    altVideo.addEventListener('play', () => {
      isVideoPlaying = true;
      isPausedOrStopped = false;
    });

    altVideo.addEventListener('pause', () => {
      isVideoPlaying = false;
      isPausedOrStopped = true;
      targetScore = 0;
      displayedScore = 0;
      if (typeof updateDetectorUI === 'function') {
        updateDetectorUI({ isSilent: true, stressScore: 0, aiProbability: 0, metrics: { lvp: 0, microT: 0, spectral: 0, jitter: '0.0000', shimmer: '0.0000', hnr: '0.0000', pdr: '0.0000' } }, 0);
      }
    });

    altVideo.addEventListener('ended', () => {
      isVideoPlaying = false;
      isPausedOrStopped = true;
      targetScore = 0;
      displayedScore = 0;
      if (typeof updateDetectorUI === 'function') {
        updateDetectorUI({ isSilent: true, stressScore: 0, aiProbability: 0, metrics: { lvp: 0, microT: 0, spectral: 0, jitter: '0.0000', shimmer: '0.0000', hnr: '0.0000', pdr: '0.0000' } }, 0);
      }
    });

    altVideo.addEventListener('timeupdate', () => {
      captionPlaybackSec = altVideo.currentTime;
      if (lastTimeValue !== -1 && Math.abs(captionPlaybackSec - lastTimeValue) > 2.0) {
        console.log(`[Th!nc AltPlayer] Seek detected from ${lastTimeValue}s to ${captionPlaybackSec}s. Resetting lastShownCaptionIdx.`);
        lastShownCaptionIdx = -1;
      }
      if (captionPlaybackSec !== lastTimeValue) {
        lastTimeValue = captionPlaybackSec;
        lastTimeUpdate = Date.now();
      }
    });
  }

  // Piped frontend embed instances (no API needed, just embed URL)
  const PIPED_INSTANCES = [
    "https://pipedapi.kavin.rocks",
    "https://piped-api.lunar.icu",
    "https://api.piped.projectsegfau.lt",
    "https://pipedapi.tokhmi.xyz",
    "https://piped-api.garudalinux.org",
    "https://pipedapi.colby.net"
  ];

  // Piped frontend (for embed iframe) — separate from API
  const PIPED_FRONTEND_INSTANCES = [
    "https://piped.video",
    "https://piped.kavin.rocks",
    "https://piped.lunar.icu",
    "https://piped.projectsegfau.lt",
    "https://piped.garudalinux.org",
    "https://piped.adminforge.de"
  ];

  async function fetchPipedVideoStreamUrl(videoId) {
    const shuffled = [...PIPED_INSTANCES].sort(() => Math.random() - 0.5).slice(0, 4);
    const results = await Promise.allSettled(
      shuffled.map(apiHost =>
        fetch(`${apiHost}/streams/${videoId}`, { signal: getTimeoutSignal(3000) })
          .then(r => r.ok ? r.json() : null)
          .then(data => {
            if (!data) return null;
            const streams = data.videoStreams || [];
            const mp4 = streams.find(s => s.mimeType && s.mimeType.includes("video/mp4") && !s.videoOnly) ||
                        streams.find(s => s.mimeType && s.mimeType.includes("video/mp4")) ||
                        streams[0];
            return (mp4 && mp4.url) ? mp4.url : null;
          })
      )
    );
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) {
        console.log('[Th!nc Stream] Piped API stream resolved.');
        return r.value;
      }
    }
    return null;
  }

  async function fetchAltVideoStreamUrl(videoId) {
    // 1. Try Piped API (parallel)
    try {
      const pipedUrl = await fetchPipedVideoStreamUrl(videoId);
      if (pipedUrl) return pipedUrl;
    } catch (err) {
      console.warn("Piped stream resolving failed:", err);
    }

    // 2. Fallback: Invidious API (parallel, short timeout)
    const targets = (typeof dynamicInvidiousInstances !== 'undefined' && dynamicInvidiousInstances.length > 0)
      ? dynamicInvidiousInstances.slice(0, 5)
      : INVIDIOUS_INSTANCES.slice(0, 5);

    const invResults = await Promise.allSettled(
      targets.map(inst => {
        let host = inst.trim();
        if (!host) return Promise.resolve(null);
        if (!host.startsWith('http')) host = 'https://' + host;
        return fetch(`${host}/api/v1/videos/${videoId}`, { signal: getTimeoutSignal(3500) })
          .then(r => r.ok ? r.json() : null)
          .then(data => {
            if (!data) return null;
            const streams = data.formatStreams || [];
            const mp4 = streams.find(s => s.container === 'mp4') || streams[0];
            return (mp4 && mp4.url) ? mp4.url : null;
          });
      })
    );
    for (const r of invResults) {
      if (r.status === 'fulfilled' && r.value) {
        console.log('[Th!nc Stream] Invidious API stream resolved.');
        return r.value;
      }
    }
    return null;
  }

  function enableAlternativePlayer(videoId) {
    if (!videoId) return;
    
    isAltPlayerActive = true;
    
    // Hide the IFrame player div
    const ytPlayerDiv = document.getElementById('yt-player');
    if (ytPlayerDiv) ytPlayerDiv.classList.add('hidden');
    
    const blockedOverlay = document.getElementById('yt-blocked-overlay');
    if (blockedOverlay) blockedOverlay.classList.add('hidden');
    
    if (ytPlayer && typeof ytPlayer.pauseVideo === 'function') {
      try { ytPlayer.pauseVideo(); } catch (e) {}
    }
    
    const altVideo = document.getElementById('alt-player');
    if (!altVideo) return;

    // Hide native video element initially — we'll use an iframe embed first
    altVideo.classList.add('hidden');
    altVideo.src = '';
    altVideo.innerHTML = '';

    // Check if there's already an alt iframe, remove it
    const existingAltIframe = document.getElementById('alt-embed-iframe');
    if (existingAltIframe) existingAltIframe.remove();

    // --- Strategy 1: Piped Embed Iframe (no bot check, no CORS) ---
    const pipedFrontend = PIPED_FRONTEND_INSTANCES[Math.floor(Math.random() * PIPED_FRONTEND_INSTANCES.length)];
    const pipedEmbedUrl = `${pipedFrontend}/embed/${videoId}?autoplay=1&quality=auto`;

    const altIframe = document.createElement('iframe');
    altIframe.id = 'alt-embed-iframe';
    altIframe.src = pipedEmbedUrl;
    altIframe.setAttribute('allowfullscreen', '');
    altIframe.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture');
    altIframe.setAttribute('frameborder', '0');
    altIframe.style.cssText = 'width:100%;height:100%;border:none;display:block;';

    const ytPlayerWrapper = document.getElementById('yt-player-wrapper');
    if (ytPlayerWrapper) {
      ytPlayerWrapper.appendChild(altIframe);
    }

    // --- Strategy 2: Parallel async direct stream fetch ---
    let streamResolved = false;
    fetchAltVideoStreamUrl(videoId).then(directUrl => {
      if (!directUrl || !isAltPlayerActive) return;
      streamResolved = true;
      console.log('[Th!nc AltPlayer] Direct stream URL resolved. Using native <video> for audio analysis.');
      if (altIframe) altIframe.style.display = 'none';
      altVideo.classList.remove('hidden');
      altVideo.src = directUrl;
      altVideo.load();
      altVideo.play().catch(e => console.warn('Alt video direct stream play failed:', e));
    }).catch(err => console.warn('Direct stream resolution failed:', err));

    // --- Strategy 3: Fallback to Invidious embed after 8s ---
    setTimeout(() => {
      if (!isAltPlayerActive || streamResolved) return;
      const invInstances = dynamicInvidiousInstances.length > 0 ? dynamicInvidiousInstances : INVIDIOUS_INSTANCES;
      const invHost = invInstances[Math.floor(Math.random() * Math.min(invInstances.length, 5))];
      let invBase = (invHost || '').trim();
      if (!invBase.startsWith('http')) invBase = 'https://' + invBase;
      const invEmbedUrl = `${invBase}/embed/${videoId}?autoplay=1&local=true`;
      console.log('[Th!nc AltPlayer] Piped timeout, switching to Invidious embed:', invBase);
      if (altIframe && altIframe.isConnected) {
        altIframe.src = invEmbedUrl;
      }
    }, 8000);

    showToast('우회 플레이어로 재생 중입니다.');
    
    const toggleBtn = document.getElementById('btn-alt-toggle');
    if (toggleBtn) {
      toggleBtn.classList.add('active-alt');
      toggleBtn.innerText = '📺 공식 플레이어 사용';
    }
    
    if (ytBlockedTimer) clearTimeout(ytBlockedTimer);
  }

  function disableAlternativePlayer() {
    isAltPlayerActive = false;
    
    // Remove alt embed iframe if present
    const existingAltIframe = document.getElementById('alt-embed-iframe');
    if (existingAltIframe) existingAltIframe.remove();

    const altVideo = document.getElementById('alt-player');
    if (altVideo) {
      try { altVideo.pause(); } catch (e) {}
      altVideo.src = '';
      altVideo.classList.add('hidden');
    }
    
    const ytPlayerDiv = document.getElementById('yt-player');
    if (ytPlayerDiv) ytPlayerDiv.classList.remove('hidden');
    
    const toggleBtn = document.getElementById('btn-alt-toggle');
    if (toggleBtn) {
      toggleBtn.classList.remove('active-alt');
      toggleBtn.innerText = '🔄 우회 플레이어';
    }
  }

  function toggleAlternativePlayer() {
    if (isAltPlayerActive) {
      disableAlternativePlayer();
      if (activeVideoId) {
        loadYouTubeVideo(activeVideoId);
      }
    } else {
      if (activeVideoId) {
        enableAlternativePlayer(activeVideoId);
      }
    }
  }



  function showBrowserFeed() {
    const ytWrapperEl = document.getElementById('yt-player-wrapper');
    if (ytWrapperEl) ytWrapperEl.classList.add('hidden');
    
    const controls = document.getElementById('yt-player-controls');
    if (controls) controls.classList.add('hidden');
    
    document.getElementById('btn-yt-back').classList.add('hidden');
    
    const quickstartBtn = document.getElementById('btn-yt-quickstart');
    if (quickstartBtn) quickstartBtn.classList.add('hidden');

    document.getElementById('yt-browser-feed').classList.remove('hidden');
    document.getElementById('yt-placeholder').classList.add('hidden');
    
    if (ytPlayer && typeof ytPlayer.pauseVideo === 'function') {
      try {
        ytPlayer.pauseVideo();
      } catch (e) {}
    }

    if (isRunning) {
      toggleSession();
    }
  }

  async function searchYouTubeVideos(query) {
    showToast(t('toast_searching').replace('{q}', query));
    isPopularMode = false;
    activeSearchQuery = query;
    searchPageCounter = 1;
    addSearchTerm(query);

    
    const grid = document.getElementById('yt-video-grid');
    if (grid) {
      grid.innerHTML = `
        <div class="search-loader-container">
          <svg class="search-loader-logo" viewBox="0 0 200 200" fill="currentColor">
            <g transform="translate(10, -10)">
              <rect x="85" y="145" width="20" height="30" />
              <circle cx="95" cy="115" r="40" />
              <rect x="135" y="108" width="45" height="14" />
              <g transform="rotate(-30 95 115)">
                <rect x="68" y="10" width="54" height="110" />
                <rect x="55" y="75" width="80" height="16" />
              </g>
            </g>
          </svg>
          <div class="search-loader-text">SEARCHING...</div>
        </div>
      `;
    }
    
    // ENGINE 1: Local/Online Native Backend Search API
    let searchVideos = null;
    try {
      const response = await fetchWithBackendFallback(`/api/search?q=${encodeURIComponent(query)}&hl=${currentLang}`);
      if (response.ok) {
        searchVideos = await response.json();
      }
    } catch (err) {
      console.warn("Native search API failed:", err);
    }

    if (searchVideos && searchVideos.length > 0) {
      const mappedVideos = searchVideos.map(v => ({
        ...v,
        genre: detectGenre(v.title)
      }));
      renderVideoFeed(mappedVideos);
      showBrowserFeed();
      showToast(t('toast_complete').replace('{q}', query));
      return;
    }
    
    // ENGINE 2: CORS Proxy Scraper Fallback
    const targetUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&hl=${currentLang}`;
    try {
      const html = await fetchViaCORSProxy(targetUrl);
      
      let jsonStr = null;
      const startMark = "ytInitialData = ";
      const startIdx = html.indexOf(startMark);
      if (startIdx !== -1) {
        const endIdx = html.indexOf("};", startIdx);
        if (endIdx !== -1) {
          jsonStr = html.substring(startIdx + startMark.length, endIdx + 1);
        }
      }
      
      if (!jsonStr) {
        const altMark = 'window["ytInitialData"] = ';
        const altIdx = html.indexOf(altMark);
        if (altIdx !== -1) {
          const endIdx = html.indexOf("};", altIdx);
          if (endIdx !== -1) {
            jsonStr = html.substring(altIdx + altMark.length, endIdx + 1);
          }
        }
      }

      if (jsonStr) {
        const data = JSON.parse(jsonStr);
        const sections = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents;
        
        if (sections && sections.length > 0) {
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
                    title: title,
                    channel: channel,
                    views: views.replace("조회수", "").trim(),
                    duration: duration,
                    genre: detectGenre(title)
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
                      title: title,
                      channel: channel,
                      views: views.replace("조회수", "").trim(),
                      duration: duration,
                      genre: detectGenre(title)
                    });
                  }
                }
              }
            }
          }

          if (videos.length > 0) {
            renderVideoFeed(videos);
            showBrowserFeed();
            showToast(t('toast_scraped').replace('{q}', query));
            return;
          }
        }
      }
    } catch (scrapeErr) {
      console.warn("CORS proxy scraper also failed, trying Invidious direct fallback:", scrapeErr);
    }

    // ENGINE 3: Invidious API Fallback with Parallel Racing (Promise.any)
    try {
      const res = await searchInvidiousParallel(query);
      if (res && res.data && res.data.length > 0) {
        const videos = res.data.filter(v => v.type === 'video').slice(0, 99).map(v => ({
          id: v.videoId,
          title: v.title,
          channel: v.author,
          views: formatViews(v.viewCount),
          duration: formatDuration(v.lengthSeconds),
          genre: detectGenre(v.title)
        }));
        renderVideoFeed(videos);
        showBrowserFeed();
        showToast(t('toast_invidious').replace('{q}', query));
        return;
      }
    } catch (invidiousErr) {
      console.warn("Parallel Invidious search also failed:", invidiousErr);
    }
    
    // OFFLINE / CRITICAL FALLBACK
    const filtered = MOCK_VIDEOS.filter(v => 
      v.title.toLowerCase().includes(query.toLowerCase()) || 
      v.channel.toLowerCase().includes(query.toLowerCase())
    );
    renderVideoFeed(filtered);
    showBrowserFeed();
    showToast(t('toast_mock').replace('{q}', query));
  }

  function loadYouTubeVideo(inputStr) {
    const ytPlayerEl = document.getElementById('yt-player');
    const placeholder = document.getElementById('yt-placeholder');
    const floatBtn = document.getElementById('float-detector-btn');
    const feed = document.getElementById('yt-browser-feed');
    const backBtn = document.getElementById('btn-yt-back');
    const quickstartBtn = document.getElementById('btn-yt-quickstart');

    let videoId = extractVideoID(inputStr);
    
    if (videoId) {
      activeVideoId = videoId;
      activePlatform = 'youtube';
      placeholder.classList.add('hidden');
      feed.classList.add('hidden');
      const ytWrapperEl = document.getElementById('yt-player-wrapper');
      if (ytWrapperEl) ytWrapperEl.classList.remove('hidden');
      
      const controls = document.getElementById('yt-player-controls');
      if (controls) controls.classList.remove('hidden');
      
      // Reset Alternative player state
      disableAlternativePlayer();
      const blockedOverlay = document.getElementById('yt-blocked-overlay');
      if (blockedOverlay) blockedOverlay.classList.add('hidden');

      if (floatBtn) floatBtn.classList.remove('hidden');
      if (backBtn) backBtn.classList.remove('hidden');
      if (quickstartBtn) quickstartBtn.classList.remove('hidden');
      
      // Reset caption state for new video
      liveCaptions = [];
      captionPlaybackSec = 0;
      lastShownCaptionIdx = -1;
      captionLoadStatus = 'none';

      // 모든 환경에서 youtube-nocookie.com IFrame을 먼저 시도합니다.
      // IFrame이 7초 내에 재생되지 않으면 우회 플레이어(Piped embed)로 자동 전환합니다.
      console.log('[Th!nc Player] Loading video via youtube-nocookie.com IFrame...');
      
      if (ytBlockedTimer) clearTimeout(ytBlockedTimer);

      if (ytPlayer && typeof ytPlayer.loadVideoById === 'function') {
        try {
          ytPlayer.loadVideoById(videoId);
        } catch (err) {
          console.warn('Failed to load video via player instance, rebuilding:', err);
          recreateYTPlayer(videoId);
        }
      } else {
        recreateYTPlayer(videoId);
      }

      // Fallback timer: if IFrame doesn't play within 7s, switch to bypass player
      ytBlockedTimer = setTimeout(() => {
        const ytWrapper = document.getElementById('yt-player-wrapper');
        if (!isVideoPlaying && ytWrapper && !ytWrapper.classList.contains('hidden') && !isAltPlayerActive) {
          console.warn('[Th!nc] IFrame player timed out. Auto-switching to bypass player...');
          enableAlternativePlayer(videoId);
        }
      }, 7000);

      // Attempt to load real captions from server
      loadCaptionsForVideo(videoId);
      
      // ── Keyword Sensitivity: match title/tags/captions against DB ──
      checkKeywordSensitivity(videoId);
      
      generateMockMetadata();
      
      showToast(t('toast_loaded'));
    } else {
      // Handle search/filters or blocked homepage inputs
      const query = inputStr.toLowerCase().trim();
      
      if (query.includes('youtube.com') || query.includes('youtu.be') || query === 'home' || query === '') {
        loadPopularVideos();
        showBrowserFeed();
        
        if (query.includes('youtube.com') || query.includes('youtu.be')) {
          showToast(t('toast_home_blocked'));
        }
      } else {
        searchYouTubeVideos(inputStr);
      }
    }
  }

  // ────────────────────────────────────────────────────────
  // KEYWORD SENSITIVITY ENGINE
  // ────────────────────────────────────────────────────────
  /**
   * Fetches video metadata (title, tags, description) from the local server proxy
   * and matches against the admin-configured keyword database (thinc_keyword_db).
   * Writes result to localStorage key 'thinc_keyword_sensitivity' which the
   * VoiceStressAnalyzer reads every frame to apply the correct multiplier.
   *
   * Tiers: 상(HIGH) ×2.5 | 중(MEDIUM) ×1.2 | 하(LOW) ×0.4 | none ×1.0
   */
  async function fetchVideoMetaDirect(videoId) {
    const instances = (typeof dynamicPipedInstances !== 'undefined' && dynamicPipedInstances.length > 0)
      ? dynamicPipedInstances
      : (typeof PIPED_API_INSTANCES !== 'undefined' ? PIPED_API_INSTANCES : []);
    
    const toTry = instances.slice(0, 5);
    for (const instance of toTry) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);
        const resp = await fetch(`${instance}/streams/${videoId}`, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (resp.ok) {
          const data = await resp.json();
          if (data && data.title) {
            return {
              title: data.title || '',
              description: (data.description || '').substring(0, 800),
              tags: Array.isArray(data.tags) ? data.tags : [],
              uploaderName: data.uploaderName || ''
            };
          }
        }
      } catch (err) {
        console.warn(`[fetchVideoMetaDirect] ${instance} failed:`, err.message);
      }
    }
    return null;
  }

  async function checkKeywordSensitivity(videoId) {
    try {
      // 1. Load keyword DB (now channel DB) based on current language setting
      const targetLang = (currentLang === 'ko') ? 'ko' : 'en';
      let db = null;
      
      // 1순위: 어드민 설정 캐시에서 동적 민감도 사전 로드
      try {
        const adminSettings = JSON.parse(localStorage.getItem('thinc_admin_settings'));
        if (adminSettings) {
          if (targetLang === 'ko' && adminSettings.sensitivity_dict_ko) {
            db = adminSettings.sensitivity_dict_ko;
          } else if (targetLang === 'en' && adminSettings.sensitivity_dict_en) {
            db = adminSettings.sensitivity_dict_en;
          }
        }
      } catch(e) {}

      // 2순위: 개별 로컬 스토리지 키 로드
      if (!db) {
        try { db = JSON.parse(localStorage.getItem(`thinc_keyword_db_${targetLang}`)); } catch(e) {}
      }
      
      // Fallback to legacy or defaults if not customized
      if (!db) {
        if (targetLang === 'ko') {
          try { db = JSON.parse(localStorage.getItem('thinc_keyword_db')); } catch(e) {}
          if (!db) {
            db = {
              high:   ['사기', '거짓말', '폭로', '음모', '조작', '허위', '가짜', '범죄', '협박', '비리', '부패', '조장', '한국찐반응'],
              medium: ['논란', '의혹', '주장', '소문', '의심', '논쟁', '갈등', '비판', '반박', '해명'],
              low:    ['교육', '과학', '연구', '공식', '발표', '강의', '다큐멘터리', '학습', '분석', '리포트', '논문']
            };
          }
        } else {
          db = {
            high:   ['scam', 'fraud', 'lie', 'fake', 'manipulation', 'expose', 'conspiracy', 'crime', 'blackmail', 'corruption', 'hoax', 'propaganda'],
            medium: ['controversy', 'rumor', 'suspicion', 'dispute', 'conflict', 'criticism', 'rebuttal', 'explanation', 'debate', 'claim'],
            low:    ['education', 'science', 'research', 'official', 'announcement', 'lecture', 'documentary', 'learning', 'analysis', 'report', 'thesis', 'study']
          };
        }
      }

      if (!db || (!db.high?.length && !db.medium?.length && !db.low?.length)) {
        localStorage.setItem('thinc_keyword_sensitivity', JSON.stringify({ tier: 'none', multiplier: 1.0, matchedKeywords: [], lang: targetLang }));
        return;
      }

      // 2. Fetch meta from server proxy, fallback to direct Piped API
      let meta = { title: '', tags: [], description: '', uploaderName: '' };
      let metaFetched = false;

      // ── 최우선 순위: 데스크톱(Electron) 환경의 유튜브 webview DOM에서 직접 채널명 추출 (Piped API 차단 대응) ──
      const isElectron = typeof window !== 'undefined' && window.electronAPI && window.electronAPI.isElectron;
      if (isElectron && typeof activePlatform !== 'undefined' && activePlatform === 'youtube') {
        try {
          const wv = document.getElementById('wv-youtube');
          if (wv && typeof wv.executeJavaScript === 'function') {
            const author = await wv.executeJavaScript('window.ytInitialPlayerResponse?.videoDetails?.author || ""');
            if (author) {
              meta.uploaderName = author;
              metaFetched = true;
              console.log('[Th!nc Keywords] Successfully retrieved uploaderName directly from webview context:', author);
            }
          }
        } catch(wvErr) {
          console.warn('[Th!nc Keywords] Failed to fetch uploaderName from webview context:', wvErr);
        }
      }

      if (!metaFetched) {
        try {
          const resp = await fetchWithBackendFallback(`/api/video-meta?id=${encodeURIComponent(videoId)}`);
          if (resp.ok) {
            meta = await resp.json();
            metaFetched = true;
          }
        } catch(e) {}
      }

      if (!metaFetched) {
        try {
          const directMeta = await fetchVideoMetaDirect(videoId);
          if (directMeta) {
            meta = directMeta;
            metaFetched = true;
          }
        } catch(e) {
          console.warn('[Th!nc Keywords] Direct fallback fetch failed:', e);
        }
      }

      currentUploaderName = meta.uploaderName || '';
      const cleanUploader = (meta.uploaderName || '').trim().toLowerCase();
      if (!cleanUploader) {
        localStorage.setItem('thinc_keyword_sensitivity', JSON.stringify({ tier: 'none', multiplier: 1.0, matchedKeywords: [], videoId, lang: targetLang }));
        return;
      }

      // 3. Match tiers by channel name
      const TIERS = [
        { key: 'high',   keywords: db.high   || [], multiplier: 22.5, label: '🔴 상 (HIGH)' },
        { key: 'medium', keywords: db.medium || [], multiplier: 4.8, label: '🟡 중 (MEDIUM)' },
        { key: 'low',    keywords: db.low    || [], multiplier: 0.4, label: '🟢 하 (LOW)' }
      ];

      for (const tier of TIERS) {
        const matched = tier.keywords.filter(kw => {
          const k = (kw || '').toLowerCase().trim();
          return k.length > 0 && cleanUploader.includes(k);
        });
        if (matched.length > 0) {
          const result = {
            tier: tier.key,
            multiplier: tier.multiplier,
            matchedKeywords: [matched[0]],
            label: tier.label,
            videoId,
            lang: targetLang
          };
          localStorage.setItem('thinc_keyword_sensitivity', JSON.stringify(result));
          showToast(`🔍 채널명 매칭 ${tier.label}: "${matched[0]}" → ×${tier.multiplier}`);
          console.log('[Th!nc Keywords] Channel Match:', result);
          return;
        }
      }

      // No match in any tier → default multiplier
      localStorage.setItem('thinc_keyword_sensitivity', JSON.stringify({ tier: 'none', multiplier: 1.0, matchedKeywords: [], videoId, lang: targetLang }));
      console.log('[Th!nc Keywords] No keyword match for video', videoId);
    } catch(err) {
      console.warn('[Th!nc Keywords] Error during sensitivity check:', err);
    }
  }

  // Also re-run keyword check after captions finish loading (captions text improves matching)
  function reCheckKeywordAfterCaptions(videoId) {
    if (!videoId) return;
    setTimeout(() => checkKeywordSensitivity(videoId), 4000);
  }

  // ===== REAL YOUTUBE CAPTIONS ENGINE =====
  function decodeHTMLEntities(text) {
    const textArea = document.createElement('textarea');
    textArea.innerHTML = text;
    return textArea.value;
  }

  async function fetchYoutubeTimedTextOfficialFrontend(videoId) {
    let listXml = null;
    const listUrl = `https://www.youtube.com/api/timedtext?v=${videoId}&type=list`;
    
    // Electron/Capacitor 환경인 경우 직접 모바일/크롬 헤더를 싣고 직접 요청
    const isElectron = window.electronAPI && window.electronAPI.isElectron;
    const isCapacitor = typeof window !== 'undefined' && window.Capacitor && window.Capacitor.isNativePlatform;
    
    if (isElectron || isCapacitor) {
      try {
        console.log(`[Direct TimedText] Fetching list directly: ${listUrl}`);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(listUrl, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
            'Referer': 'https://www.youtube.com/'
          }
        });
        clearTimeout(timeoutId);
        if (res.ok) {
          listXml = await res.text();
        }
      } catch (err) {
        console.warn("[Direct TimedText] Direct list fetch failed:", err.message);
      }
    }
    
    if (!listXml) {
      try {
        listXml = await fetchViaCORSProxy(listUrl);
      } catch (e) {
        console.warn("TimedText list fetch failed via proxy:", e.message);
      }
    }

    let targetLang = currentLang; // ko or en
    let track = null;

    if (listXml) {
      try {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(listXml, "text/xml");
        const tracks = xmlDoc.getElementsByTagName('track');
        if (tracks && tracks.length > 0) {
          const trackList = [];
          for (let i = 0; i < tracks.length; i++) {
            const tr = tracks[i];
            trackList.push({
              lang: tr.getAttribute('lang_code') || '',
              name: tr.getAttribute('name') || '',
              kind: tr.getAttribute('kind') || ''
            });
          }
          track = trackList.find(t => t.lang === 'ko');
          if (!track) track = trackList.find(t => t.lang === 'en');
          if (!track) track = trackList[0];
          if (track) {
            targetLang = track.lang;
          }
        }
      } catch (err) {
        console.warn("Error parsing TimedText list XML:", err);
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
        let xmlText = null;
        if (isElectron || isCapacitor) {
          try {
            console.log(`[Direct TimedText] Fetching track directly: ${url}`);
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 4000);
            const res = await fetch(url, {
              signal: controller.signal,
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
                'Referer': 'https://www.youtube.com/'
              }
            });
            clearTimeout(timeoutId);
            if (res.status === 404) {
              throw new Error("HTTP 404 - Not Found");
            }
            if (res.ok) xmlText = await res.text();
          } catch (e) {
            console.warn("[Direct TimedText] Direct track fetch failed:", e.message);
            if (e.message.includes("404")) throw e;
          }
        }
        if (!xmlText) {
          xmlText = await fetchViaCORSProxy(url);
        }
        if (xmlText && xmlText.includes('<text')) {
          const parser = new DOMParser();
          const xmlDoc = parser.parseFromString(xmlText, "text/xml");
          const textElements = xmlDoc.getElementsByTagName('text');
          if (textElements && textElements.length > 0) {
            const parsedCaptions = [];
            for (let i = 0; i < textElements.length; i++) {
              const el = textElements[i];
              const start = parseFloat(el.getAttribute('start') || '0');
              const dur = parseFloat(el.getAttribute('dur') || '0');
              const text = el.textContent || '';
              parsedCaptions.push({
                start: Math.round(start),
                dur: Math.round(dur),
                end: Math.round(start + dur),
                text: decodeHTMLEntities(text.replace(/\n/g, ' ').trim())
              });
            }
            if (parsedCaptions.length > 0) {
              return { lang: targetLang, captions: parsedCaptions };
            }
          }
        }
      } catch (err) {
        console.warn(`TimedText fetch failed for url ${url}:`, err.message);
      }
    }
    throw new Error("All TimedText fetch attempts failed");
  }

  async function fetchYoutubeCaptionsOfficialFrontend(videoId) {
    console.log(`[Diagnostic] fetchYoutubeCaptionsOfficialFrontend started for ${videoId}`);
    const pageUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const isElectronEnv = !!(window.electronAPI && window.electronAPI.isElectron);

    let html = null;

    // ✅ Electron 환경에서는 직접 fetch (CORS 제한 없음)
    if (isElectronEnv) {
      try {
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(pageUrl, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
          }
        });
        clearTimeout(tid);
        if (res.ok) {
          html = await res.text();
          console.log(`[Diagnostic] HTML fetched via Electron direct, length: ${html?.length}`);
        }
      } catch (err) {
        console.warn('[Diagnostic] Electron direct page fetch failed:', err.message);
      }
    }

    // 직접 페치 실패 시 CORS 프록시 폴백
    if (!html) {
      html = await fetchViaCORSProxy(pageUrl);
      console.log(`[Diagnostic] HTML fetched via CORS proxy, length: ${html?.length}`);
    }


    
    let captionTracks = null;
    
    // Attempt 1: playerCaptionsTracklistRenderer in ytInitialPlayerResponse
    const responseMark = 'ytInitialPlayerResponse = ';
    const responseIdx = html.indexOf(responseMark);
    if (responseIdx !== -1) {
      // 안전한 JSON 추출: 브래킷 카운팅으로 정확한 끝 찾기
      try {
        let jsonStart = responseIdx + responseMark.length;
        let depth = 0;
        let jsonEnd = -1;
        for (let i = jsonStart; i < html.length; i++) {
          if (html[i] === '{') depth++;
          else if (html[i] === '}') {
            depth--;
            if (depth === 0) { jsonEnd = i + 1; break; }
          }
        }
        if (jsonEnd !== -1) {
          const rawResponse = html.substring(jsonStart, jsonEnd);
          const parsed = JSON.parse(rawResponse);
          captionTracks = parsed?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
          console.log(`[Diagnostic] Attempt 1 parsed captionTracks:`, captionTracks?.length);
        }
      } catch(e) {
        console.warn('[Diagnostic] Failed parsing ytInitialPlayerResponse:', e.message);
      }
    } else {
      console.log(`[Diagnostic] Attempt 1 responseMark not found`);
    }
    
    // Attempt 2: Search for "captionTracks" directly in HTML
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
              console.log(`[Diagnostic] Attempt 2 parsed captionTracks:`, captionTracks);
            } catch(e) {
              console.warn("[Diagnostic] Failed parsing captionTracks array:", e);
            }
          }
        }
      } else {
        console.log(`[Diagnostic] Attempt 2 trackMark not found`);
      }
    }
    
    // Attempt 3: Search for '"captions":' directly in HTML (Method 3 backend fallback)
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
            console.log(`[Diagnostic] Attempt 3 parsed captionTracks:`, captionTracks);
          } catch(e) {
            console.warn("[Diagnostic] Failed parsing captionsJson on frontend:", e.message);
          }
        }
      } else {
        console.log(`[Diagnostic] Attempt 3 marker not found`);
      }
    }
    
    // Attempt 4: Regex-based captionTracks extraction (Safest backup when HTML is slightly broken)
    if (!captionTracks) {
      try {
        console.log(`[Diagnostic] Attempt 4: Regex-based extraction started`);
        const match = html.match(/"captionTracks"\s*:\s*(\[[^\]]+\])/);
        if (match && match[1]) {
          captionTracks = JSON.parse(match[1]);
          console.log(`[Diagnostic] Attempt 4 parsed captionTracks via Regex:`, captionTracks);
        }
      } catch (e) {
        console.warn("[Diagnostic] Failed Regex captionTracks parsing:", e.message);
      }
    }
    
    if (!captionTracks || !Array.isArray(captionTracks) || captionTracks.length === 0) {
      console.warn(`[Diagnostic] No official caption tracks found in watch page`);
      throw new Error("No official caption tracks found in watch page");
    }
    
    // Prioritize Korean, then English, then whatever is first (Loosened matching)
    let track = captionTracks.find(t => (t.languageCode || '').toLowerCase().startsWith('ko'));
    if (!track) track = captionTracks.find(t => (t.languageCode || '').toLowerCase().startsWith('en'));
    if (!track) track = captionTracks[0];
    
    if (!track || (!track.baseUrl && !track.languageCode)) {
      console.warn(`[Diagnostic] No valid caption track URL found among ${captionTracks.length} tracks`);
      throw new Error("No valid caption track URL found");
    }
    
    // baseUrl이 없으면 languageCode로 timedtext URL 직접 구성
    let xmlUrl = track.baseUrl;
    if (!xmlUrl && track.languageCode) {
      xmlUrl = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${track.languageCode}&fmt=srv1`;
      console.log(`[Diagnostic] No baseUrl, constructed timedtext URL for lang ${track.languageCode}`);
    } else if (xmlUrl) {
      if (!xmlUrl.startsWith('http')) xmlUrl = 'https:' + xmlUrl;
      // 유튜브 서명 URL(baseUrl)은 절대 변조(fmt=json3 강제 등)하면 안 됩니다. 서명이 깨져 빈 응답이 옵니다.
    }
    console.log(`[Diagnostic] Selected track language: ${track.languageCode}, URL: ${xmlUrl}`);
    let xmlText = null;

    // ✅ Electron 직접 페치 우선 시도 (CORS 우회, 최고 성공률)
    if (isElectronEnv) {
      try {
        console.log(`[Direct XML] Electron direct fetch for: ${xmlUrl}`);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(xmlUrl, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'text/xml,application/xml,application/json,*/*'
          }
        });
        clearTimeout(timeoutId);
        if (res.ok) {
          xmlText = await res.text();
          console.log(`[Direct XML] Electron direct fetch succeeded, length: ${xmlText?.length}`);
        }
      } catch (err) {
        console.warn('[Direct XML] Electron direct fetch failed:', err.message);
      }
    }

    // 직접 페치 실패 시 CORS 프록시 폴백
    if (!xmlText) {
      console.log(`[Direct XML] Falling back to CORS proxy for: ${xmlUrl}`);
      xmlText = await fetchViaCORSProxy(xmlUrl);
    }
    console.log(`[Diagnostic] Fetched XML/JSON text length: ${xmlText?.length}`);

    const parsedCaptions = [];
    const trimmedText = (xmlText || '').trim();

    if (trimmedText.startsWith('{') || trimmedText.startsWith('[')) {
      // ✅ JSON 포맷 파싱 (유튜브가 JSON 형태로 자막을 반환하는 경우)
      try {
        const json = JSON.parse(trimmedText);
        const events = json.events || [];
        events.forEach(event => {
          if (!event.segs) return;
          const text = event.segs.map(s => s.utf8).join('').trim();
          if (!text) return;
          const startMs = event.tStartMs ? Number(event.tStartMs) : 0;
          const durMs = event.dDurationMs ? Number(event.dDurationMs) : 1000;
          parsedCaptions.push({
            start: startMs / 1000,
            dur: durMs / 1000,
            end: (startMs + durMs) / 1000,
            text: decodeHTMLEntities(text.replace(/\n/g, ' ').trim())
          });
        });
        console.log(`[Diagnostic] Parsed ${parsedCaptions.length} JSON caption segments.`);
      } catch (jsonErr) {
        console.warn('[Diagnostic] Failed parsing captions as JSON:', jsonErr.message);
        throw new Error('JSON caption parse error: ' + jsonErr.message);
      }
    } else {
      // ✅ XML 포맷 파싱
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(trimmedText, 'text/xml');
      const parserError = xmlDoc.getElementsByTagName('parsererror');
      if (parserError.length > 0) {
        console.warn(`[Diagnostic] XML parse error`);
        throw new Error('XML parse error');
      }
      const textElements = xmlDoc.getElementsByTagName('text');
      if (!textElements || textElements.length === 0) {
        console.warn(`[Diagnostic] No captions text nodes in XML`);
        throw new Error('No captions text nodes in XML');
      }
      console.log(`[Diagnostic] Parsed ${textElements.length} text elements from XML`);
      for (let i = 0; i < textElements.length; i++) {
        const el = textElements[i];
        const start = parseFloat(el.getAttribute('start') || '0');
        const dur = parseFloat(el.getAttribute('dur') || '0');
        parsedCaptions.push({
          start: start,
          dur: dur,
          end: start + dur,
          text: decodeHTMLEntities(el.textContent || '')
        });
      }
    }

    if (parsedCaptions.length === 0) {
      console.warn(`[Diagnostic] No captions parsed from response`);
      throw new Error('No captions parsed from response');
    }

    return parsedCaptions;
  }

  async function translateCaptions(captions, targetLang) {
    try {
      if (!captions || captions.length === 0) return captions;
      
      showToast(targetLang === 'ko' ? '자막을 한국어로 자동 번역 중입니다...' : 'Translating captions to English...');
      
      const BATCH_SIZE = 30; // 30줄씩 나누어 번역
      const translated = [];
      
      for (let i = 0; i < captions.length; i += BATCH_SIZE) {
        const batch = captions.slice(i, i + BATCH_SIZE);
        const batchText = batch.map(c => (c && c.text) ? c.text : '').join('\n');
        
        try {
          const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(batchText)}`;
          let response;
          try {
            response = await fetch(url);
          } catch (fetchErr) {
            const proxiedUrl = await fetchViaCORSProxy(url);
            response = await fetch(proxiedUrl);
          }
          
          if (response && !response.ok) {
            const proxiedUrl = await fetchViaCORSProxy(url);
            response = await fetch(proxiedUrl);
          }
          
          if (response && response.ok) {
            const data = await response.json();
            if (data && data[0]) {
              let translatedLines = [];
              data[0].forEach(item => {
                if (item && item[0]) {
                  translatedLines.push(item[0]);
                }
              });
              
              const fullTranslatedText = translatedLines.join('');
              const splitLines = fullTranslatedText.split('\n');
              
              for (let j = 0; j < batch.length; j++) {
                let textVal = '';
                if (splitLines[j] !== undefined && splitLines[j].trim() !== '') {
                  textVal = splitLines[j].trim();
                } else if (data[0] && data[0][j] && data[0][j][0]) {
                  textVal = data[0][j][0].trim();
                } else {
                  textVal = (batch[j] && batch[j].text) ? batch[j].text : '';
                }
                translated.push({
                  start: batch[j].start,
                  dur: batch[j].dur,
                  text: textVal
                });
              }
            } else {
              batch.forEach(c => translated.push({ ...c }));
            }
          } else {
            batch.forEach(c => translated.push({ ...c }));
          }
        } catch (err) {
          console.warn('Batch translation failed at index:', i, err);
          batch.forEach(c => translated.push({ ...c }));
        }
      }
      
      showToast(targetLang === 'ko' ? '자막 자동 번역이 완료되었습니다!' : 'Captions translated successfully!');
      return translated;
    } catch (globalErr) {
      console.warn("translateCaptions global failure, using original captions:", globalErr);
      return captions;
    }
  }

  async function translateCaptionsIfRequired(captions, targetLang) {
    try {
      if (!captions || captions.length === 0) return captions;
      
      // 요소 무결성 검증 필터링
      const validCaptions = captions.filter(c => c && typeof c === 'object' && typeof c.text === 'string');
      if (validCaptions.length === 0) return captions;
      
      const sampleText = validCaptions.slice(0, 10).map(c => c.text).join(' ');
      const hasKorean = /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(sampleText);
      
      let needsTranslation = false;
      if (targetLang === 'ko' && !hasKorean) {
        needsTranslation = true;
      } else if (targetLang !== 'ko' && hasKorean) {
        needsTranslation = true;
      }
      
      if (needsTranslation) {
        return await translateCaptions(validCaptions, targetLang);
      }
      return validCaptions;
    } catch (err) {
      console.warn("translateCaptionsIfRequired global failure, using original captions:", err);
      return captions;
    }
  }

  // CORS 차단이 없는 Electron 환경용 초고속 브라우저 InnerTube 자막 추출 함수
  async function getYouTubeTranscriptDirectBrowser(videoId, lang = 'ko') {
    let htmlCaptions = null;
    try {
      console.log(`[Th!nc-Extension] Trying HTML watch page scraping for ${videoId}`);
      const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
        },
        signal: getTimeoutSignal(5000)
      });
      const html = await res.text();
      let captionTracks = null;
      
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

      if (captionTracks && captionTracks.length > 0) {
        let targetTrack = captionTracks.find(t => (t.languageCode || '').toLowerCase().startsWith((lang || 'ko').toLowerCase()) && t.kind !== 'asr');
        if (!targetTrack) targetTrack = captionTracks.find(t => (t.languageCode || '').toLowerCase().startsWith((lang || 'ko').toLowerCase()));
        if (!targetTrack && lang !== 'ko') targetTrack = captionTracks.find(t => (t.languageCode || '').toLowerCase().startsWith('ko'));
        if (!targetTrack) targetTrack = captionTracks.find(t => (t.languageCode || '').toLowerCase().startsWith('en'));
        if (!targetTrack) targetTrack = captionTracks[0];

        if (targetTrack && targetTrack.baseUrl) {
          console.log(`[Th!nc-Extension] Found track via HTML scrape: ${targetTrack.languageCode}`);
          let requestUrl = targetTrack.baseUrl;
          if (requestUrl.includes('fmt=')) requestUrl = requestUrl.replace(/([&?])fmt=[^&]*/, '$1fmt=json3');
          else requestUrl += (requestUrl.includes('?') ? '&' : '?') + 'fmt=json3';

          const trackRes = await fetch(requestUrl, { signal: getTimeoutSignal(5000) });
          const trackText = await trackRes.text();
          if (trackText && trackText.includes('events')) {
            const data = JSON.parse(trackText);
            const segments = [];
            if (data && Array.isArray(data.events)) {
              for (const ev of data.events) {
                if (!ev.segs) continue;
                const text = ev.segs.map(s => s.utf8).join('').trim();
                if (!text) continue;
                const startSec = ev.startMs / 1000;
                const durSec = (ev.durationMs || 1000) / 1000;
                segments.push({ start: startSec, dur: durSec, text });
              }
            }
            if (segments.length > 0) {
              console.log(`[Th!nc-Extension] HTML scrape parse success: ${segments.length} segments`);
              return { lang: targetTrack.languageCode, captions: segments };
            }
          }
        }
      }
    } catch (e) {
      console.warn('[Th!nc-Extension] HTML watch page scraping failed:', e.message);
    }

    const clientSignatures = [
      {
        name: 'MWEB',
        version: '2.20250619.01.00',
        ua: 'Mozilla/5.0 (Linux; Android 11; Pixel 4a) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.82 Mobile Safari/537.36',
        hl: lang || 'ko',
        gl: 'KR'
      },
      {
        name: 'ANDROID',
        version: '19.44.41',
        ua: 'com.google.android.youtube/19.44.41 (Linux; U; Android 14; ko_KR) AppleWebKit/537.36 Mobile Safari/537.36',
        hl: lang || 'ko',
        gl: 'KR'
      },
      {
        name: 'TVHTML5_SIMPLY_EMBEDDED_PLAYER',
        version: '2.0',
        ua: 'Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.5) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/5.0 Chrome/85.0.4183.93 TV Safari/537.36',
        hl: lang || 'ko',
        gl: 'KR'
      },
      {
        name: 'WEB',
        version: '2.20250619.01.00',
        ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        hl: lang || 'ko',
        gl: 'KR'
      }
    ];

    let lastError = null;

    for (const sig of clientSignatures) {
      try {
        const payloadObj = {
          context: {
            client: {
              clientName: sig.name,
              clientVersion: sig.version,
              hl: sig.hl || lang || 'ko',
              gl: sig.gl || 'KR',
              userAgent: sig.ua
            }
          },
          videoId: videoId
        };

        const headers = {
          'Content-Type': 'application/json',
          'User-Agent': sig.ua,
          'Referer': 'https://www.youtube.com/',
          'Origin': 'https://www.youtube.com',
          'X-YouTube-Client-Name': sig.name === 'MWEB' ? '2' : sig.name === 'ANDROID' ? '3' : '1',
          'X-YouTube-Client-Version': sig.version
        };

        console.log(`[getYouTubeTranscriptDirectBrowser] Trying client ${sig.name} for ${videoId}`);
        const response = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
          method: 'POST',
          headers: headers,
          body: JSON.stringify(payloadObj),
          signal: getTimeoutSignal(6000)
        });

        if (!response.ok) {
          throw new Error(`InnerTube server returned status ${response.status}`);
        }

        const data = await response.json();
        if (!data.captions || !data.captions.playerCaptionsTracklistRenderer) {
          throw new Error('No captions metadata in player response');
        }

        const tracklist = data.captions.playerCaptionsTracklistRenderer;
        const tracks = tracklist.captionTracks || [];
        if (tracks.length === 0) {
          throw new Error('No caption tracks found');
        }

        // 언어 트랙 매칭 우선순위 지능형 필터링 (수동 자막 우선순위)
        let targetTrack = null;
        const normLang = (lang || 'ko').toLowerCase();
        
        // 1순위: 수동 매칭 언어 (ASR 아님)
        targetTrack = tracks.find(t => (t.languageCode || '').toLowerCase().startsWith(normLang) && t.kind !== 'asr');
        // 2순위: 자동생성 매칭 언어
        if (!targetTrack) targetTrack = tracks.find(t => (t.languageCode || '').toLowerCase().startsWith(normLang));
        // 3순위: 수동 한국어
        if (!targetTrack && normLang !== 'ko') targetTrack = tracks.find(t => (t.languageCode || '').toLowerCase().startsWith('ko') && t.kind !== 'asr');
        // 4순위: 자동생성 한국어
        if (!targetTrack && normLang !== 'ko') targetTrack = tracks.find(t => (t.languageCode || '').toLowerCase().startsWith('ko'));
        // 5순위: 수동 영어
        if (!targetTrack && normLang !== 'en') targetTrack = tracks.find(t => (t.languageCode || '').toLowerCase().startsWith('en') && t.kind !== 'asr');
        // 6순위: 자동생성 영어
        if (!targetTrack && normLang !== 'en') targetTrack = tracks.find(t => (t.languageCode || '').toLowerCase().startsWith('en'));
        // 7순위: 첫 번째 사용가능한 트랙
        if (!targetTrack) targetTrack = tracks[0];

        if (!targetTrack || !targetTrack.baseUrl) {
          throw new Error('No baseUrl in chosen caption track');
        }

        const selectedLang = targetTrack.languageCode || lang;
        console.log(`[getYouTubeTranscriptDirectBrowser] Selected track: ${selectedLang} (ASR: ${targetTrack.kind === 'asr'}), url: ${targetTrack.baseUrl}`);

        // JSON 포맷을 선호하여 &fmt=json 으로 우선 호출
        let requestUrl = targetTrack.baseUrl;
        if (requestUrl.includes('fmt=')) {
          requestUrl = requestUrl.replace(/([&?])fmt=[^&]*/, '$1fmt=json');
        } else {
          requestUrl += (requestUrl.includes('?') ? '&' : '?') + 'fmt=json';
        }
        
        let captionResponse = null;
        let isJsonSuccess = false;
        try {
          captionResponse = await fetch(requestUrl, { signal: getTimeoutSignal(5000) });
          if (captionResponse.ok) {
            isJsonSuccess = true;
          } else {
            console.warn(`[getYouTubeTranscriptDirectBrowser] fmt=json fetch returned status ${captionResponse.status}, trying raw XML fallback`);
          }
        } catch (fetchErr) {
          console.warn('[getYouTubeTranscriptDirectBrowser] fmt=json fetch failed (network/timeout), trying raw XML fallback:', fetchErr.message);
        }

        if (!isJsonSuccess) {
          const rawUrl = targetTrack.baseUrl.includes('fmt=')
            ? targetTrack.baseUrl.replace(/([&?])fmt=[^&]*/, '$1fmt=srv1')
            : targetTrack.baseUrl + (targetTrack.baseUrl.includes('?') ? '&' : '?') + 'fmt=srv1';
          
          try {
            captionResponse = await fetch(rawUrl, { signal: getTimeoutSignal(5000) });
            if (!captionResponse.ok) {
              throw new Error(`Failed to fetch raw XML: ${captionResponse.status}`);
            }
          } catch (xmlErr) {
            throw new Error(`All format attempts failed: ${xmlErr.message}`);
          }
        }

        const contentType = captionResponse.headers.get('Content-Type') || '';
        const responseText = await captionResponse.text();
        const segments = [];

        if (contentType.includes('json') || responseText.trim().startsWith('{')) {
          // JSON 포맷 파싱
          const captionsJson = JSON.parse(responseText);
          if (captionsJson && Array.isArray(captionsJson.events)) {
            captionsJson.events.forEach(event => {
              if (!event.segs) return;
              const text = event.segs.map(s => s.utf8).join('').trim();
              if (!text) return;
              const startSec = event.tStartMs ? event.tStartMs / 1000 : 0;
              const durSec = event.dDurationMs ? event.dDurationMs / 1000 : 1.0;
              segments.push({ start: startSec, dur: durSec, text });
            });
          }
        } else {
          // XML 포맷 파싱 (DOMParser 활용)
          const parser = new DOMParser();
          const xmlDoc = parser.parseFromString(responseText, "text/xml");
          const textNodes = xmlDoc.getElementsByTagName("text");
          for (let i = 0; i < textNodes.length; i++) {
            const node = textNodes[i];
            const text = (node.textContent || '').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim();
            if (!text) continue;
            const startSec = parseFloat(node.getAttribute("start") || "0");
            const durSec = parseFloat(node.getAttribute("dur") || "1.0");
            segments.push({ start: startSec, dur: durSec, text });
          }
        }

        if (segments.length > 0) {
          console.log(`[getYouTubeTranscriptDirectBrowser] Success! Parsed ${segments.length} segments.`);
          return { lang: selectedLang, captions: segments };
        } else {
          throw new Error('Parsed captions were empty');
        }
      } catch (err) {
        console.warn(`[getYouTubeTranscriptDirectBrowser] Client ${sig.name} failed:`, err.message);
        lastError = err;
      }
    }

    throw lastError || new Error('All InnerTube clients failed');
  }

  async function loadCaptionsForVideo(videoId) {
    captionLoadStatus = 'loading';
    const overallStartTime = performance.now();
    if (window.PerformanceLogger) {
      window.PerformanceLogger.log('Captions', 'Load Captions Started', 0, 'Info', `Video ID: ${videoId}`);
    }

  // 1. Try local/online backend first (generous timeout: backend may cascade through multiple fallbacks)
    let captionData = null;
    const backendStartTime = performance.now();
    try {
      if (window.PerformanceLogger) {
        window.PerformanceLogger.log('Captions', 'Step 1: Backend Call', 0, 'Info', `Requesting captions for ${videoId}`);
      }
      const res = await fetchWithBackendFallback(`/api/captions?id=${encodeURIComponent(videoId)}&lang=${currentLang}`);
      if (res.ok) {
        captionData = await res.json();
      }
    } catch (err) {
      console.warn('Backend captions load failed:', err.message);
      if (window.PerformanceLogger) {
        window.PerformanceLogger.log('Captions', 'Step 1: Backend Call Failed', performance.now() - backendStartTime, 'Warning', err.message);
      }
    }

    if (captionData && captionData.captions && captionData.captions.length > 0) {
      const transStartTime = performance.now();
      liveCaptions = await translateCaptionsIfRequired(captionData.captions, currentLang);
      if (window.PerformanceLogger) {
        window.PerformanceLogger.log('Captions', 'Translate Captions', performance.now() - transStartTime, 'Success', `Translating to ${currentLang}`);
      }
      captionLoadStatus = 'loaded';
      const localizedLang = captionData.lang === 'ko' ? (currentLang === 'ko' ? '한국어' : 'Korean') : (currentLang === 'ko' ? '영어' : 'English');
      showToast(t('toast_captions_loaded').replace('{lang}', localizedLang).replace('{count}', captionData.captions.length));
      if (window.PerformanceLogger) {
        window.PerformanceLogger.log('Captions', 'Load Captions Complete', performance.now() - overallStartTime, 'Success', `Source: Backend, Count: ${captionData.captions.length}`);
      }
      return;
    } else {
      if (window.PerformanceLogger) {
        window.PerformanceLogger.log('Captions', 'Step 1: Backend Returned No Data', performance.now() - backendStartTime, 'Warning', 'Moving to Piped fallback');
      }
    }
    
    // 2. Try Piped API captions (parallel race, fastest fallback)
    const pipedStartTime = performance.now();
    try {
      if (window.PerformanceLogger) {
        window.PerformanceLogger.log('Captions', 'Step 2: Piped API Call', 0, 'Info', 'Fetching from Piped instances');
      }
      const captions = await fetchPipedCaptions(videoId);
      if (captions && captions.length > 0) {
        liveCaptions = await translateCaptionsIfRequired(captions, currentLang);
        captionLoadStatus = 'loaded';
        showToast(t('toast_captions_loaded').replace('{lang}', 'Piped').replace('{count}', captions.length));
        if (window.PerformanceLogger) {
          window.PerformanceLogger.log('Captions', 'Load Captions Complete', performance.now() - overallStartTime, 'Success', `Source: Piped, Count: ${captions.length}`);
        }
        return;
      }
    } catch (err) {
      console.warn('Piped captions failed:', err.message);
      if (window.PerformanceLogger) {
        window.PerformanceLogger.log('Captions', 'Step 2: Piped API Failed', performance.now() - pipedStartTime, 'Warning', err.message);
      }
    }

    // 3. Try official YouTube timedtext API via CORS proxy
    const timedtextStartTime = performance.now();
    try {
      if (window.PerformanceLogger) {
        window.PerformanceLogger.log('Captions', 'Step 3: YouTube timedtext', 0, 'Info', 'Fetching from official timedtext API');
      }
      const resData = await fetchYoutubeTimedTextOfficialFrontend(videoId);
      if (resData && resData.captions && resData.captions.length > 0) {
        liveCaptions = await translateCaptionsIfRequired(resData.captions, currentLang);
        captionLoadStatus = 'loaded';
        const localizedLang = resData.lang === 'ko' ? (currentLang === 'ko' ? '한국어' : 'Korean') : (currentLang === 'ko' ? '영어' : 'English');
        showToast(t('toast_captions_loaded').replace('{lang}', localizedLang).replace('{count}', resData.captions.length));
        if (window.PerformanceLogger) {
          window.PerformanceLogger.log('Captions', 'Load Captions Complete', performance.now() - overallStartTime, 'Success', `Source: timedtext API, Count: ${resData.captions.length}`);
        }
        return;
      }
    } catch (err) {
      console.warn('Frontend YouTube timedtext API failed:', err.message);
      if (window.PerformanceLogger) {
        window.PerformanceLogger.log('Captions', 'Step 3: YouTube timedtext Failed', performance.now() - timedtextStartTime, 'Warning', err.message);
      }
    }

    // 4. Try YouTube watch page scraping via CORS proxy
    const scrapingStartTime = performance.now();
    try {
      if (window.PerformanceLogger) {
        window.PerformanceLogger.log('Captions', 'Step 4: Watch Page Scrape', 0, 'Info', 'Scraping YouTube watch page');
      }
      const captions = await fetchYoutubeCaptionsOfficialFrontend(videoId);
      if (captions && captions.length > 0) {
        liveCaptions = await translateCaptionsIfRequired(captions, currentLang);
        captionLoadStatus = 'loaded';
        showToast(t('toast_captions_loaded').replace('{lang}', currentLang === 'ko' ? '공식 자막' : 'Official Captions').replace('{count}', captions.length));
        if (window.PerformanceLogger) {
          window.PerformanceLogger.log('Captions', 'Load Captions Complete', performance.now() - overallStartTime, 'Success', `Source: Watch Page Scrape, Count: ${captions.length}`);
        }
        return;
      }
    } catch (err) {
      console.warn('YouTube watch page captions failed:', err.message);
      if (window.PerformanceLogger) {
        window.PerformanceLogger.log('Captions', 'Step 4: Watch Page Scrape Failed', performance.now() - scrapingStartTime, 'Warning', err.message);
      }
    }
    
    // 5. Try Invidious captions fallback on the frontend via CORS proxy parallel race
    const invidiousStartTime = performance.now();
    try {
      if (window.PerformanceLogger) {
        window.PerformanceLogger.log('Captions', 'Step 5: Invidious Race', 0, 'Info', 'Fetching from Invidious instances');
      }
      const captions = await fetchInvidiousCaptionsParallel(videoId);
      if (captions && captions.length > 0) {
        liveCaptions = await translateCaptionsIfRequired(captions, currentLang);
        captionLoadStatus = 'loaded';
        showToast(t('toast_captions_loaded').replace('{lang}', currentLang === 'ko' ? '한국어/영어' : 'Korean/English').replace('{count}', captions.length));
        if (window.PerformanceLogger) {
          window.PerformanceLogger.log('Captions', 'Load Captions Complete', performance.now() - overallStartTime, 'Success', `Source: Invidious, Count: ${captions.length}`);
        }
        return;
      }
    } catch (err) {
      console.warn('Frontend Invidious captions load failed:', err.message);
      if (window.PerformanceLogger) {
        window.PerformanceLogger.log('Captions', 'Step 5: Invidious Race Failed', performance.now() - invidiousStartTime, 'Warning', err.message);
      }
    }
    
    captionLoadStatus = 'failed';
    console.warn('All captions sources failed, using VSA mode');
    showToast(t('toast_captions_unavailable_online'), 8000);
    if (window.PerformanceLogger) {
      window.PerformanceLogger.log('Captions', 'Load Captions Failed', performance.now() - overallStartTime, 'Failed', 'All caption pipelines failed. VSA fallback enabled.');
    }
  }

  // Fetch captions via Piped API (parallel race across instances with robust VTT checking)
  async function fetchPipedCaptions(videoId) {
    console.log(`[Diagnostic] fetchPipedCaptions started for ${videoId}`);
    const instances = await fetchDynamicPipedInstancesList();
    const shuffled = [...instances].sort(() => Math.random() - 0.5);
    const priorityIndex = shuffled.indexOf("https://api.piped.private.coffee");
    if (priorityIndex !== -1) {
      shuffled.splice(priorityIndex, 1);
    }
    shuffled.unshift("https://api.piped.private.coffee");
    
    // Try up to 8 nodes concurrently in parallel race
    const shuffledSelection = shuffled.slice(0, 8);
    
    const racePromises = shuffledSelection.map(async (instance) => {
      try {
        let streamData = null;
        // 1. Direct fetch
        try {
          const r = await fetch(`${instance}/streams/${videoId}`, { signal: getTimeoutSignal(3500) });
          if (r.ok) streamData = await r.json();
        } catch (e) {}
        
        // 2. CORS Proxy fallback
        if (!streamData) {
          try {
            const text = await fetchViaCORSProxy(`${instance}/streams/${videoId}`);
            if (text && text.trim().startsWith('{')) {
              streamData = JSON.parse(text);
            }
          } catch (e) {}
        }
        
        if (!streamData || !streamData.subtitles || streamData.subtitles.length === 0) {
          throw new Error(`No subtitles metadata at ${instance}`);
        }
        
        let track = streamData.subtitles.find(s => (s.code || s.languageCode || '').toLowerCase().startsWith('ko'));
        if (!track) track = streamData.subtitles.find(s => (s.code || s.languageCode || '').toLowerCase().startsWith('en'));
        if (!track) track = streamData.subtitles[0];
        
        if (!track || !track.url) throw new Error(`No valid track URL at ${instance}`);
        
        let vttUrl = track.url;
        if (!vttUrl.startsWith('http')) vttUrl = 'https:' + vttUrl;
        
        if (vttUrl.includes('youtube.com') || vttUrl.includes('google.com') || vttUrl.includes('timedtext')) {
          if (vttUrl.includes('fmt=')) {
            vttUrl = vttUrl.replace(/fmt=[^&]+/, 'fmt=vtt');
          } else {
            vttUrl += (vttUrl.includes('?') ? '&' : '?') + 'fmt=vtt';
          }
        }
        
        let vtt = null;
        // 3. VTT direct fetch
        try {
          const r = await fetch(vttUrl, { signal: getTimeoutSignal(4000) });
          if (r.ok) vtt = await r.text();
        } catch (e) {}
        
        // 4. CORS Proxy VTT fallback
        if (!vtt) {
          try {
            vtt = await fetchViaCORSProxy(vttUrl);
          } catch (e) {}
        }
        
        if (!vtt || vtt.length < 50) throw new Error(`VTT file empty or too short at ${instance}`);
        
        const segments = parseVTT(vtt);
        if (segments.length === 0) throw new Error(`Parsed 0 segments from VTT at ${instance}`);
        
        console.log(`[Parallel Race] Successfully fetched Piped captions from ${instance}`);
        return segments;
      } catch (err) {
        const isContentError = err.message.includes('No subtitles') || 
                               err.message.includes('No valid track') || 
                               err.message.includes('0 segments') || 
                               err.message.includes('404');
        if (!isContentError) {
          markFrontendNodeFailed(instance);
        }
        throw err;
      }
    });

    try {
      return await Promise.any(racePromises);
    } catch (aggErr) {
      throw new Error('All Piped instances failed for captions');
    }
  }

  // Parse WebVTT text into caption segments
  function parseVTT(vttText) {
    const lines = vttText.split(/\r?\n/);
    const segments = [];
    let currentSeg = null;
    const timeRegex = /(\d{2}):(\d{2}):(\d{2})[.,](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[.,](\d{3})/;
    const shortTimeRegex = /(\d{2}):(\d{2})[.,](\d{3})\s*-->\s*(\d{2}):(\d{2})[.,](\d{3})/;
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
      if (currentSeg && !t.startsWith('WEBVTT') && !t.startsWith('NOTE') && !/^\d+$/.test(t) && !t.startsWith('X-TIMESTAMP')) {
        const cleaned = t.replace(/<[^>]+>/g, '').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&nbsp;/g,' ').trim();
        if (cleaned) currentSeg.text += (currentSeg.text ? ' ' : '') + cleaned;
      }
    }
    if (currentSeg && currentSeg.text) segments.push(currentSeg);
    return segments.filter(s => s.text.trim().length > 0);
  }

  async function fetchInvidiousCaptionsParallel(videoId) {
    const instances = await fetchDynamicInvidiousInstances();
    const shuffled = [...instances].sort(() => Math.random() - 0.5).slice(0, 8);

    const racePromises = shuffled.map(async (instance) => {
      try {
        const listUrl = `${instance}/api/v1/captions/${videoId}`;
        let listJson = null;

        // 1. Direct fetch
        try {
          const r = await fetch(listUrl, { signal: getTimeoutSignal(3500) });
          if (r.ok) listJson = await r.json();
        } catch (e) {}

        // 2. CORS proxy fallback
        if (!listJson) {
          try {
            const text = await fetchViaCORSProxy(listUrl);
            if (text && text.trim().startsWith('{')) {
              listJson = JSON.parse(text);
            }
          } catch (e) {}
        }

        if (!listJson || !Array.isArray(listJson.captions) || listJson.captions.length === 0) {
          throw new Error(`No captions metadata at ${instance}`);
        }

        let track = listJson.captions.find(c => c.languageCode === 'ko');
        if (!track) track = listJson.captions.find(c => c.languageCode === 'en');
        if (!track) track = listJson.captions[0];
        if (!track || !track.url) throw new Error(`No valid track URL at ${instance}`);

        const vttUrl = track.url.startsWith('http') ? track.url : `${instance}${track.url}`;

        let vtt = null;
        // 3. VTT direct fetch
        try {
          const r = await fetch(vttUrl, { signal: getTimeoutSignal(4000) });
          if (r.ok) {
            const text = await r.text();
            if (text && text.length > 30) vtt = text;
          }
        } catch (e) {}

        // 4. CORS Proxy VTT fallback
        if (!vtt) {
          try {
            const text = await fetchViaCORSProxy(vttUrl);
            if (text && text.length > 30) vtt = text;
          } catch (e) {}
        }

        // 5. Label parameter fallback
        if (!vtt && track.label) {
          try {
            const labelUrl = `${instance}/api/v1/captions/${videoId}?label=${encodeURIComponent(track.label)}`;
            const r = await fetch(labelUrl, { signal: getTimeoutSignal(3500) });
            if (r.ok) {
              const text = await r.text();
              if (text && text.length > 30) vtt = text;
            }
          } catch (e) {}
        }

        if (!vtt || vtt.length < 50) throw new Error(`VTT download failed at ${instance}`);

        const segments = parseVTT(vtt);
        if (segments.length === 0) throw new Error(`Parsed 0 segments at ${instance}`);
        return segments;
      } catch (err) {
        const isContentError = err.message.includes('No captions') || 
                               err.message.includes('No valid track') || 
                               err.message.includes('0 segments') || 
                               err.message.includes('404');
        if (!isContentError) {
          markFrontendNodeFailed(instance);
        }
        throw err;
      }
    });

    try {
      return await Promise.any(racePromises);
    } catch (aggErr) {
      throw new Error('All Invidious instances failed for captions');
    }
  }

  function recreateYTPlayer(videoId) {
    try {
      ytPlayer = new YT.Player('yt-player', {
        host: 'https://www.youtube-nocookie.com',
        height: '100%',
        width: '100%',
        videoId: videoId,
        playerVars: {
          autoplay: 1,
          enablejsapi: 1,
          origin: window.location.origin,
          widget_referrer: window.location.href,
          modestbranding: 1,
          rel: 0,
          playsinline: 1
        },
        events: {
          'onStateChange': onPlayerStateChange
        }
      });
    } catch (e) {
      console.error("YouTube Player initialization failed:", e);
    }
  }

  function onPlayerStateChange(event) {
    // 1: PLAYING, 3: BUFFERING
    isVideoPlaying = (event.data === 1 || event.data === 3);
    if (event.data === 2 || event.data === 0) { // PAUSED or ENDED
      isPausedOrStopped = true;
      targetScore = 0;
      displayedScore = 0;
      if (typeof updateDetectorUI === 'function') {
        updateDetectorUI({ isSilent: true, stressScore: 0, aiProbability: 0, metrics: { lvp: 0, microT: 0, spectral: 0, jitter: '0.0000', shimmer: '0.0000', hnr: '0.0000', pdr: '0.0000' } }, 0);
      }
    } else if (isVideoPlaying) {
      isPausedOrStopped = false;
    }
    if (isVideoPlaying && ytBlockedTimer) {
      clearTimeout(ytBlockedTimer);
      const blockedOverlay = document.getElementById('yt-blocked-overlay');
      if (blockedOverlay) blockedOverlay.classList.add('hidden');
    }
  }

  // Poll YouTube player API directly for high-resolution playback sync (every 100ms)
  setInterval(() => {
    const isLocalYoutube = activePlatform === 'youtube';
    if (isLocalYoutube && ytPlayer && typeof ytPlayer.getCurrentTime === 'function' && isVideoPlaying) {
      try {
        const t = ytPlayer.getCurrentTime();
        if (typeof t === 'number' && !isNaN(t)) {
          captionPlaybackSec = t;
          // Seek Detection: Reset lastShownCaptionIdx if jump is greater than 2 seconds
          if (lastTimeValue !== -1 && Math.abs(captionPlaybackSec - lastTimeValue) > 2.0) {
            console.log(`[Th!nc YTPlayer] Seek detected from ${lastTimeValue}s to ${captionPlaybackSec}s. Resetting lastShownCaptionIdx.`);
            lastShownCaptionIdx = -1;
          }
          if (captionPlaybackSec !== lastTimeValue) {
            lastTimeValue = captionPlaybackSec;
            lastTimeUpdate = Date.now();
          }
        }
      } catch (e) { /* ignore player state access errors */ }
    }
  }, 100);

  function extractVideoID(url) {
    url = url.trim();
    if (url.length === 11 && /^[a-zA-Z0-9_-]{11}$/.test(url)) {
      return url;
    }
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=|shorts\/|live\/)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  }

  function generateMockMetadata() {
    const genres = ["news", "education", "science_technology", "finance", "politics_opinion", "entertainment_rumor"];
    const selectedGenre = genres[Math.floor(Math.random() * genres.length)];
    
    let baseScore = RELIABILITY_CONSTANTS.GENRE_BASE[selectedGenre] || 60;
    // Apply random modifier
    baseScore = Math.max(15, Math.min(99, baseScore + Math.floor(Math.random() * 20) - 10));

    let grade = "Medium";
    if (baseScore >= 80) grade = "High";
    else if (baseScore <= 45) grade = "Low";

    videoMetadata = {
      title: "YouTube Video Analysis — ID: " + activeVideoId,
      channel: "Creator_" + activeVideoId.substring(0, 4),
      genre: selectedGenre.toUpperCase().replace('_', ' '),
      reliability: baseScore,
      grade: grade
    };

    try {
      localStorage.setItem('thinc_video_metadata', JSON.stringify(videoMetadata));
    } catch(e) {}

    // Update Banner UI
    document.getElementById('det-cat-badge').innerText = videoMetadata.genre;
    const relBadge = document.getElementById('det-rel-badge');
    relBadge.innerText = `${videoMetadata.reliability}% RELIABILITY`;
    relBadge.className = `det-badge det-badge-rel grade-${grade.toLowerCase()}`;
  }

  // ===== REAL VOICE / MOCK WORKER LOGIC =====
  async function toggleSession() {
    const btn = document.getElementById('btn-toggle');
    const bannerDot = document.getElementById('banner-dot');
    const bannerText = document.getElementById('banner-text');
    const quickstartBtn = document.getElementById('btn-yt-quickstart');

    if (isRunning) {
      // Stop session
      isRunning = false;
      btn.dataset.running = "false";
      btn.querySelector('#btn-icon').innerText = "▶";
      btn.querySelector('#btn-text').innerText = t('start');

      // 웹뷰 오버레이 스타트 버튼 상태 업데이트
      const wvStartBtn = document.getElementById('wv-float-start-btn');
      if (wvStartBtn) {
        wvStartBtn.setAttribute('data-running', 'false');
        const iconSpan = wvStartBtn.querySelector('.wv-start-icon');
        const labelSpan = wvStartBtn.querySelector('.wv-start-label');
        if (iconSpan) iconSpan.innerText = '▶';
        if (labelSpan) labelSpan.innerText = '분석 시작';
      }
      
      if (window.PerformanceLogger) {
        window.PerformanceLogger.log('Session', 'Stop Analysis Session', 0, 'Info', `VSA session stopped. Total datapoints collected: ${sessionData.length}`);
      }

      if (quickstartBtn) {
        quickstartBtn.classList.remove('running');
        quickstartBtn.innerText = "▶️ " + t('start');
      }
      
      bannerDot.classList.remove('active');
      bannerText.innerText = t('idle');

      if (animationId) {
        cancelAnimationFrame(animationId);
      }
      
      // Stop Audio recording stream if active
      if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        mediaStream = null;
      }

      // Hide Live Truth Floating Bar
      const truthBarContainer = document.getElementById('yt-live-truth-bar-container');
      if (truthBarContainer) {
        truthBarContainer.classList.add('hidden');
      }

      saveSessionToHistory();
      renderReportTab();
      showToast(t('toast_session_saved'));
      
      // Show Final Report Access Modal
      const truthModal = document.getElementById('truth-modal');
      if (truthModal) {
        truthModal.classList.remove('hidden');
      }
      
    } else {
      // Start session
      isRunning = true;
      btn.dataset.running = "true";
      btn.querySelector('#btn-icon').innerText = "■";
      btn.querySelector('#btn-text').innerText = t('stop');

      // 웹뷰 오버레이 스타트 버튼 상태 업데이트
      const wvStartBtn = document.getElementById('wv-float-start-btn');
      if (wvStartBtn) {
        wvStartBtn.setAttribute('data-running', 'true');
        const iconSpan = wvStartBtn.querySelector('.wv-start-icon');
        const labelSpan = wvStartBtn.querySelector('.wv-start-label');
        if (iconSpan) iconSpan.innerText = '■';
        if (labelSpan) labelSpan.innerText = '분석 중단';
      }
      
      if (window.PerformanceLogger) {
        window.PerformanceLogger.log('Session', 'Start Analysis Session', 0, 'Info', `VSA session started. Target video ID: ${activeVideoId || 'None'}`);
      }

      if (quickstartBtn) {
        quickstartBtn.classList.add('running');
        quickstartBtn.innerText = "■ " + t('stop');
      }
      
      bannerDot.classList.add('active');

      // Show Live Truth Floating Bar
      const truthBarContainer = document.getElementById('yt-live-truth-bar-container');
      if (truthBarContainer) {
        truthBarContainer.classList.remove('hidden');
        updateLiveTruthBar();
      }
      bannerText.innerText = t('scanning');

      // Initialize dataset
      sessionData = [];
      subtitleRecords = [];
      currentSubRecord = null;
      liesLogged = [];
      displayedScore = 0;
      targetScore = 0;
      lastShownCaptionIdx = -1; // Reset caption index so it starts fresh
      // ── CRITICAL: Reset lastTimeUpdate to NOW so analysis doesn't immediately
      //    flag video as paused (Bug: was initialized at module load, not analysis start)
      lastTimeUpdate = Date.now();
      lastTimeValue = -1; // Also reset lastTimeValue for seek detection

      // Clear Feed
      document.getElementById('sentence-list').innerHTML = "";

      // ============================================================
      // AUDIO CAPTURE STRATEGY (3-tier graceful fallback)
      // Tier 1: Tab audio (getDisplayMedia) - captures YouTube directly
      // Tier 2: Microphone - if user speaks near device
      // Tier 3: Premium caption-based context model (zero error UX)
      // ============================================================
      let audioConnected = false;

      // Initialize AudioContext safely
      try {
        if (!audioCtx) {
          audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') {
          await audioCtx.resume();
        }
      } catch (ctxErr) {
        console.warn('AudioContext init failed:', ctxErr.message);
        if (window.PerformanceLogger) {
          window.PerformanceLogger.log('Audio', 'AudioContext Initialization Failed', 0, 'Failed', ctxErr.message);
        }
      }

      // Tier 1: Try tab audio capture (getDisplayMedia) — only if supported
      const hasMediaDevices = !!(navigator.mediaDevices);
      const hasGetDisplayMedia = hasMediaDevices && !!(navigator.mediaDevices.getDisplayMedia);

      if (hasGetDisplayMedia && audioCtx) {
        try {
          if (window.PerformanceLogger) {
            window.PerformanceLogger.log('Audio', 'Tab Audio Capture Request', 0, 'Info', 'Requesting getDisplayMedia for tab audio.');
          }
          // Pre-capture guidance toast (read it before the system dialog appears)
          showToast(t('toast_audio_check'));
          await new Promise(resolve => setTimeout(resolve, 900));

          const displayStream = await navigator.mediaDevices.getDisplayMedia({
            video: { displaySurface: 'browser' },
            audio: {
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false
            },
            preferCurrentTab: true
          });

          if (displayStream.getAudioTracks().length > 0) {
            mediaStream = displayStream;
            analyzer = new VoiceStressAnalyzer(audioCtx);
            sourceNode = audioCtx.createMediaStreamSource(mediaStream);
            sourceNode.connect(analyzer.gainNode);
            analyzer.gainNode.connect(analyzer.analyser);
            audioConnected = true;
            showToast(t('toast_audio_captured'));
            if (window.PerformanceLogger) {
              window.PerformanceLogger.log('Audio', 'Tab Audio Capture Success', 0, 'Success', 'Display audio track successfully bound to VSA.');
            }
          } else {
            // User shared screen but did not check "Share audio" — silently clean up
            displayStream.getTracks().forEach(t => t.stop());
            console.info('[Th!nc] Tab shared without audio — falling back to mic or context mode.');
            if (window.PerformanceLogger) {
              window.PerformanceLogger.log('Audio', 'Tab Shared Without Audio', 0, 'Warning', 'User shared display without enabling tab audio.');
            }
          }
        } catch (tabErr) {
          // User cancelled the dialog or browser blocked — NOT an error from user perspective
          console.info('[Th!nc] Tab audio capture not established:', tabErr.message);
          if (window.PerformanceLogger) {
            window.PerformanceLogger.log('Audio', 'Tab Audio Capture Skipped/Failed', 0, 'Warning', tabErr.message);
          }
        }
      }

      // Tier 3: Premium Caption-Based Context Model

      // No error message — this is a premium feature, not a fallback failure
      if (!audioConnected) {
        analyzer = null;
        showToast(t('toast_ai_active'));
        if (window.PerformanceLogger) {
          window.PerformanceLogger.log('Audio', 'VSA Running on Caption Context Model Only', 0, 'Success', 'No physical audio captured. Utilizing context linguistic analysis.');
        }
      }

      startAnalysisLoop();
    }
  }

  function checkVIPMatch(title, channel, subtitle) {
    if (!RELIABILITY_CONSTANTS || !RELIABILITY_CONSTANTS.US_VIP_999) return false;
    const t = (title || "").toLowerCase();
    const c = (channel || "").toLowerCase();
    const s = (subtitle || "").toLowerCase();
    
    return RELIABILITY_CONSTANTS.US_VIP_999.some(vip => {
      if (vip.length < 5) {
        const reg = new RegExp(`\\b${vip}\\b`, 'i');
        if (/[\uac00-\ud7a3]/.test(vip)) {
          const krReg = new RegExp(`(^|\\s|[^a-zA-Z0-9\uac00-\ud7a3])${vip}($|\\s|[^a-zA-Z0-9\uac00-\ud7a3])`, 'i');
          return krReg.test(t) || krReg.test(c) || krReg.test(s);
        }
        return reg.test(t) || reg.test(c) || reg.test(s);
      }
      return t.includes(vip) || c.includes(vip) || s.includes(vip);
    });
  }

  function startAnalysisLoop() {
    let mockIndex = 0;
    let mockTick = 0;
    let mockSubTick = 0;       // separate subtitle tick
    analysisStartTime = Date.now();
    const SUBTITLE_INTERVAL_MS = 3000; // show new subtitle every 3 seconds
    let lastSubtitleTime = 0;

    function loop() {
      if (!isRunning) return;

      const sensitivity = parseInt(document.getElementById('sens-slider').value);

      // ── Direct ytPlayer state poll each frame (more reliable than event callbacks) ──
      let playerState = -1;
      const isYoutube = activePlatform && activePlatform.includes('youtube');
      const isLocalYoutube = activePlatform === 'youtube';
      if (isLocalYoutube && ytPlayer && typeof ytPlayer.getPlayerState === 'function') {
        try {
          playerState = ytPlayer.getPlayerState();
          // YT states: -1=unstarted, 0=ended, 1=playing, 2=paused, 3=buffering, 5=cued
          isVideoPlaying = (playerState === 1 || playerState === 3);
        } catch(e) {}
      }

      // Check if YouTube Player API is responding properly
      const timeSinceLastUpdate = Date.now() - lastTimeUpdate;
      const isPlayerResponding = (ytPlayer && typeof ytPlayer.getCurrentTime === 'function' && timeSinceLastUpdate < 5000);

      // Check if video is paused/stopped (both YouTube and local video player)
      const altVideo = document.getElementById('alt-player');
      const isAltPausedOrEnded = isAltPlayerActive && altVideo && (altVideo.paused || altVideo.ended);
      
      let isYtPausedOrEnded = false;
      if (isLocalYoutube && activeVideoId) {
        if (isPlayerResponding) {
          isYtPausedOrEnded = (playerState === 2 || playerState === 0 || playerState === 5 || playerState === -1);
        } else {
          isYtPausedOrEnded = (playerState === 2 || playerState === 0);
        }
      }

      const isPausedOrEnded = isYtPausedOrEnded || isAltPausedOrEnded;

      if (isPausedOrEnded) {
        // 동영상이 일시정지되거나 끝나면 모든 분석 기능도 일시정지되고 0으로 후퇴시킵니다.
        displayedScore = 0;
        targetScore = 0;
        currentSubtitle = "";
        
        const zeroResult = {
          stressScore: 0,
          isSilent: true,
          isMusic: false,
          aiProbability: 0,
          gainStatus: 'IDLE',
          metrics: {
            jitter: '0.0000',
            shimmer: '0.0000',
            hnr: '0.00',
            entropy: 0,
            mti: 0.0000,
            fi: 0.0000,
            pdr: 0.0000
          }
        };

        updateDetectorUI(zeroResult, 0);
        drawHistoryCharts(zeroResult, 0);
        drawLiveReliabilityBar();
        updateLiveTruthBar();

        animationId = requestAnimationFrame(loop);
        return;
      }

      if (isLocalYoutube && activeVideoId) {
        // Grace period: first 3 seconds of analysis exempt from pause detection
        // (gives YouTube Player API time to initialize and fire state events)
        const analysisElapsedMs = Date.now() - analysisStartTime;
        const timeSinceLastUpdate = Date.now() - lastTimeUpdate;
        
        // Check if YouTube Player API is responding properly
        const isPlayerResponding = (ytPlayer && typeof ytPlayer.getCurrentTime === 'function' && timeSinceLastUpdate < 5000);
        
        if (analysisElapsedMs > 3000) {
          if (isPlayerResponding) {
            // playerState가 명확히 2(paused)인 경우 또는
            // 5초 이상 시간 업데이트 없고 재생 중이 아닌 경우에만 멈춤으로 판단
            if (playerState === 2 || (!isVideoPlaying && timeSinceLastUpdate > 5000)) {
              isPausedOrStopped = true;
            }
          }
        }

        // Mute state detection
        if (ytPlayer) {
          if (typeof ytPlayer.isMuted === 'function' && ytPlayer.isMuted()) isMutedOrSilent = true;
          if (typeof ytPlayer.getVolume === 'function' && ytPlayer.getVolume() === 0) isMutedOrSilent = true;
        }
      }

      // Caption Gap Detection: If real captions are loaded, force silence during caption gaps
      let isCaptionGap = false;
      if (isYoutube && captionLoadStatus === 'loaded' && liveCaptions.length > 0) {
        // ── DIRECT ytPlayer position query for accurate gap detection ──
        let nowSec = 0;
        if (isLocalYoutube && ytPlayer && typeof ytPlayer.getCurrentTime === 'function') {
          try {
            const t = ytPlayer.getCurrentTime();
            if (typeof t === 'number' && !isNaN(t)) {
              nowSec = t;
              captionPlaybackSec = t; // Keep global in sync
            }
          } catch(e) {}
        }
        if (nowSec === 0) {
          // Fallback: cached position or elapsed time since analysis start
          const elapsedSec = (Date.now() - analysisStartTime) / 1000;
          nowSec = captionPlaybackSec > 0 ? captionPlaybackSec : elapsedSec;
        }

        const hasMatchingCaption = liveCaptions.some(cap => {
          const capEnd = cap.start + Math.max(cap.dur, 1.5);
          const isMatched = nowSec >= cap.start && nowSec < capEnd;
          if (isMatched) {
            // [소리 지시어 제거 처리] 음악/효과음/웃음소리/박수 등 노이즈 텍스트 자막은 소리 신호 분석 제외(갭으로 간주)
            const text = (cap.text || '').trim();
            // [공백], [효과음], [음악], (웃음), ♪ 기호 포함 등 모두 제거
            const isAudioNoise = /^[\[\(].*[\]\)]$|^[\s]*$|🎵|🎶|♪|♬/.test(text) ||
              /^\[.*\]$|^\(.*\)$/.test(text) ||
              /\[음악\]|\[music\]|\[효과음\]|\[박수\]|\[웃음\]|\[웅성거림\]|\[소음\]|\[침묵\]|\[무음\]|\[배경음\]|\[앰비언트\]/i.test(text) ||
              /\(음악\)|\(music\)|\(laughter\)|\(applause\)|\(crowd\)|\(noise\)|\(effects\)|\(background\)/i.test(text);
            if (isAudioNoise) {
              return false;
            }
          }
          return isMatched;
        });

        if (!hasMatchingCaption) {
          isCaptionGap = true;
        }
      }

      // Speech active state
      const isSpeechActive = !isPausedOrStopped && !isMutedOrSilent && !isCaptionGap;

      // VIP detection check
      const vipDetected = checkVIPMatch(videoMetadata.title, videoMetadata.channel, currentSubtitle);
      let currentSens = sensitivity;
      if (vipDetected) {
        currentSens = Math.min(10, sensitivity * 2);
      }

      // Run VSA engine analysis frame
      let result = null;
      if (analyzer) {
        result = analyzer.analyzeFrame(currentSens, isSpeechActive);
      } else {
        result = getMockAnalysisFrame(currentSens, isSpeechActive);
      }

      // Update VIP UI Badge
      const vipBadge = document.getElementById('det-vip-badge');
      if (vipBadge) {
        if (vipDetected) vipBadge.classList.remove('hidden');
        else vipBadge.classList.add('hidden');
      }

      // ── SILENCE / MUSIC / PAUSED / MUTED / CAPTION GAP: immediate zero ──
      const isSilentOrMusicOrPaused = result.isSilent || result.isMusic || isPausedOrStopped || isMutedOrSilent || isCaptionGap;
      if (isSilentOrMusicOrPaused) {
        displayedScore = 0;
        targetScore = 0;
        result.stressScore = 0;
        result.isSilent = true; // force silent flag for UI metrics reset
        result.aiProbability = 0; // force AI probability to 0 when silent/paused
        // If it's a caption gap or silent, make sure metrics inside result are zeroed
        if (result.metrics) {
          result.metrics.jitter = '0.0000';
          result.metrics.shimmer = '0.0000';
          result.metrics.hnr = '0.00';
          result.metrics.mti = 0.0000;
          result.metrics.fi = 0.0000;
          result.metrics.pdr = 0.0000;
        }
      } else {
        targetScore = result.stressScore;
        // Fast lerp: 15% per frame for snappy response (was 8%)
        displayedScore += (targetScore - displayedScore) * 0.15;
      }

      // PSYCHOLINGUISTIC ANALYSIS MODULE (PLM)
      let linguisticBias = 0;
      if (currentSubtitle && !isSilentOrMusicOrPaused) {
        const text = currentSubtitle.toLowerCase();
        
        // 1. Self-Reference Reduction (Linguistic Distancing)
        const selfRefsEn = text.match(/\b(i|me|my|mine|myself)\b/g) || [];
        const selfRefsKo = text.match(/(나|저|내|제)(?=\s|$|[은는이가을를])/g) || [];
        const totalSelfRefs = selfRefsEn.length + selfRefsKo.length;
        if (totalSelfRefs === 0 && text.length > 30) linguisticBias += 10;
        
        // 2. Emotional Leakage (Negative Emotion Words)
        const negEmotionsEn = text.match(/\b(hate|sad|angry|bad|worthless|liar|wrong|guilty)\b/g) || [];
        const negEmotionsKo = text.match(/(싫어|나빠|화나|슬퍼|틀려|거짓|잘못)/g) || [];
        const totalNegEmotions = negEmotionsEn.length + negEmotionsKo.length;
        if (totalNegEmotions > 0) linguisticBias += 15;
        
        // 3. Cognitive Load
        const conjunctionsEn = text.match(/\b(and|because|but|although|if)\b/g) || [];
        const conjunctionsKo = text.match(/(그리고|그래서|하지만|때문에|만약)/g) || [];
        const totalConjunctions = conjunctionsEn.length + conjunctionsKo.length;
        if (text.length > 50 && totalConjunctions > 2) linguisticBias += 12;
        
        // 4. Exclusive Words (boundary words)
        const exclusivesEn = text.match(/\b(except|without|rather)\b/g) || [];
        const exclusivesKo = text.match(/(대신|제외|말고|비해)/g) || [];
        const totalExclusives = exclusivesEn.length + exclusivesKo.length;
        if (totalExclusives > 0) linguisticBias -= 3;
     
        // 5. Deflection / Vagueness signals
        const deflectionsEn = text.match(/\b(believe me|trust me|honestly|frankly|to be honest|i never|i always|everybody knows|people say|many people)\b/gi) || [];
        const deflectionsKo = text.match(/(솔직히|진심으로|믿어|절대|항상|한 번도)/gi) || [];
        const totalDeflections = deflectionsEn.length + deflectionsKo.length;
        if (totalDeflections > 0) linguisticBias += 20;
      }

      // Add reliability bias
      const relBias = ((videoMetadata.reliability || 70) - 50) * 0.05;

      let finalScore = isSilentOrMusicOrPaused ? 0 : Math.min(99, Math.max(5, Math.round(displayedScore + linguisticBias - relBias)));
      mockTick++;

      // ===== REAL-TIME CAPTION FEED ENGINE =====
      const now = Date.now();
      const MOCK_SUBTITLES_KO = [
        "여러분 반갑습니다. 오늘 나눌 분석 주제는 매우 민감합니다.",
        "제가 직접 검토하고 연구해 본 결과, 이것은 완벽한 팩트입니다.",
        "하지만 세간의 몇몇 사람들은 이에 대해 의문을 던지기도 하죠.",
        "솔직히 말씀드리면, 이 정보는 100% 신뢰할 수 있다고 보장합니다.",
        "아무도 몰랐던 충격적인 진실을 오늘 방송에서 최초로 폭로하겠습니다.",
        "이 분석 데이터는 공식적이고 객관적인 통계를 근거로 작성되었습니다.",
        "저를 꼭 믿어주세요, 이것은 절대 거짓말이나 선동이 아닙니다.",
        "AI 음성 감정기를 가동하여 실시간 음역 진동수를 추출 중입니다.",
        "발화자의 인지적 부하와 스트레스 점수가 실시간 변동하기 시작합니다.",
        "이 모든 지표는 신경학적 목소리 톤 변화에 기반한 과학적 사실입니다."
      ];
      const MOCK_SUBTITLES_EN = [
        "Welcome everyone. Today's analysis topic is extremely critical.",
        "After researching the transcripts, I can assure you this is a fact.",
        "However, some people still raise questions and express doubts.",
        "Honestly speaking, I guarantee this information is 100% reliable.",
        "I will expose the hidden shocking truth for the first time today.",
        "This data has been verified through official academic publications.",
        "Please trust me, this is absolutely not a lie or manipulation.",
        "We are extracting vocal micro-tremors via our active AI engine.",
        "The speaker's cognitive load and stress scores are fluctuating.",
        "All indicators point toward a neurologically measured speech stress pattern."
      ];

      if (captionLoadStatus === 'loaded' && liveCaptions.length > 0) {
        // ── DIRECT ytPlayer position query for accurate caption display ──
        let nowSec = 0;
        const isLocalYoutube = activePlatform === 'youtube';
        if (isLocalYoutube && ytPlayer && typeof ytPlayer.getCurrentTime === 'function') {
          try {
            const t = ytPlayer.getCurrentTime();
            if (typeof t === 'number' && !isNaN(t)) nowSec = t;
          } catch(e) {}
        }
        if (nowSec === 0) {
          const elapsedSec = (now - analysisStartTime) / 1000;
          nowSec = captionPlaybackSec > 0 ? captionPlaybackSec : elapsedSec;
        }

        for (let i = 0; i < liveCaptions.length; i++) {
          const cap = liveCaptions[i];
          const capEnd = cap.start + Math.max(cap.dur, 1.5);
          if (nowSec >= cap.start && nowSec < capEnd) {
            currentSubtitle = cap.text;
            const currentLieScore = isSilentOrMusicOrPaused ? 0 : Math.min(99, Math.max(0, Math.round(finalScore)));
            if (i !== lastShownCaptionIdx) {
              lastShownCaptionIdx = i;
              updateSentenceFeed(cap.text, currentLieScore, false);
            } else {
              updateSentenceFeed(cap.text, currentLieScore, true);
            }
            break;
          }
        }
      } else {
        // Real captions failed/missing: Do not simulate mock subtitles.
        currentSubtitle = "";
        const list = document.getElementById('sentence-list');
        if (list && (list.innerHTML === "" || list.querySelector('.feed-placeholder'))) {
          list.innerHTML = `<div class="feed-placeholder error-placeholder" style="color: var(--accent-red); font-weight: 600; font-style: normal; padding: 20px 0;">${t('toast_captions_unavailable')}</div>`;
        }
      }

      // Update UI
      updateDetectorUI(result, finalScore);
      drawHistoryCharts(result, finalScore);
      drawLiveReliabilityBar();
      updateLiveTruthBar();

      if (!isSilentOrMusicOrPaused && finalScore >= 80 && Math.random() < 0.002) {
        showToast(t('toast_high_stress'));
      }

      animationId = requestAnimationFrame(loop);
    }
    loop();
  }

  function getMockAnalysisFrame(sensitivity, isSpeechActive = false) {
    const now = Date.now();

    // ── GUARD: No video loaded → always silent ──
    if (!activeVideoId) {
      return {
        stressScore: 0, isSilent: true, isMusic: false, aiProbability: 0, gainStatus: 'IDLE',
        metrics: { jitter: '0.0000', shimmer: '0.0000', hnr: '0.00', entropy: 0, mti: '0.0000', fi: '0.0000', pdr: '0.0000' }
      };
    }

    // ── GUARD: isSpeechActive=false 이면 즉시 silence ──
    if (!isSpeechActive) {
      return {
        stressScore: 0, isSilent: true, isMusic: false, aiProbability: 0, gainStatus: 'IDLE',
        metrics: { jitter: '0.0000', shimmer: '0.0000', hnr: '0.00', entropy: 0, mti: '0.0000', fi: '0.0000', pdr: '0.0000' }
      };
    }

    // 1. Captions loaded: use accurate video position for caption-based context
    if (captionLoadStatus === 'loaded' && liveCaptions.length > 0) {
      // Direct player query first (most accurate)
      let nowSec = 0;
      const isLocalYoutube = activePlatform === 'youtube';
      if (isLocalYoutube && ytPlayer && typeof ytPlayer.getCurrentTime === 'function') {
        try {
          const t = ytPlayer.getCurrentTime();
          if (typeof t === 'number' && !isNaN(t)) nowSec = t;
        } catch(e) {}
      }
      if (nowSec === 0) {
        const elapsedSec = (now - analysisStartTime) / 1000;
        nowSec = captionPlaybackSec > 0 ? captionPlaybackSec : elapsedSec;
      }

      let hasActiveCaption = false;
      let activeCaptionText = '';
      for (let i = 0; i < liveCaptions.length; i++) {
        const cap = liveCaptions[i];
        const capEnd = cap.start + Math.max(cap.dur, 1.5);
        if (nowSec >= cap.start && nowSec < capEnd) {
          hasActiveCaption = true;
          activeCaptionText = cap.text;
          break;
        }
      }

      // No active caption → silence (gap between speech)
      if (!hasActiveCaption) {
        return {
          stressScore: 0, isSilent: true, isMusic: false, aiProbability: 0, gainStatus: 'IDLE',
          metrics: { jitter: '0.0000', shimmer: '0.0000', hnr: '0.00', entropy: 0, mti: '0.0000', fi: '0.0000', pdr: '0.0000' }
        };
      }

      // Music/FX caption → suppress score
      // 음악/효과음/박수/웃음소리/무음 등 노이즈 자막 감지 → 분석 억제
      const MUSIC_FX_REGEX = /\[음악\]|\[Music\]|\[웅성거림\]|\[웃음\]|\[박수\]|\[효과음\]|\[배경음\]|\[소음\]|\[무음\]|\[침묵\]|\[앰비언트\]|\(음악\)|\(Music\)|\(Laughter\)|\(Applause\)|\(Crowd\)|\(Loud\)|\(Noise\)|\(Effects\)|\(Background\)|🎵|🎶|♪|♬/i;
      if (MUSIC_FX_REGEX.test(activeCaptionText)) {
        return {
          stressScore: 0, isSilent: false, isMusic: true, aiProbability: 0, gainStatus: 'OPTIMAL',
          metrics: { jitter: '0.0010', shimmer: '0.0050', hnr: '0.98', entropy: 0, mti: '0.0010', fi: '0.0010', pdr: '0.0010' }
        };
      }

    } else {
      // 2. No captions: 6-second natural speech cycle (4s speak, 2s pause)
      const cycleSec = Math.floor((now / 1000) % 6);
      if (cycleSec >= 4) {
        return {
          stressScore: 0, isSilent: true, isMusic: false, aiProbability: 0, gainStatus: 'IDLE',
          metrics: { jitter: '0.0000', shimmer: '0.0000', hnr: '0.00', entropy: 0, mti: '0.0000', fi: '0.0000', pdr: '0.0000' }
        };
      }
      if (Math.random() < 0.04) {
        return {
          stressScore: 0, isSilent: false, isMusic: true, aiProbability: 0, gainStatus: 'OPTIMAL',
          metrics: { jitter: '0.0010', shimmer: '0.0050', hnr: '0.98', entropy: 0, mti: '0.0010', fi: '0.0010', pdr: '0.0010' }
        };
      }
    }

    // 3. Generate REALISTIC mock stress score
    // ─────────────────────────────────────────────────────────────────────────
    // IMPORTANT FIX: Old formula always produced 92~99 because the base metric
    // values (mti:0.06~0.24, fi:0.04~0.18) × huge multipliers (×135, ×100) ×
    // global 2.5x boost = always ≥ 92. Replaced with direct percentage ranges.
    // ─────────────────────────────────────────────────────────────────────────
    // 지수적 민감도 증폭 수식 적용 (슬라이더 조작 시 더욱 격적이고 빠른 피드백 제공)
    const sensMult = Math.max(0.2, Math.pow(sensitivity / 5, 1.3) * 1.25);

    // Natural 30-second speech variability pattern with soft time-based oscillator
    const patternSec = (now / 1000) % 30;
    const osc = (Math.sin(now / 1200) * 0.4) + (Math.cos(now / 450) * 0.3) + (Math.sin(now / 150) * 0.1); // -0.8 ~ 0.8
    let stressBase;
    if      (patternSec < 8)  stressBase = 15 + osc * 8;   // calm: 7–23%
    else if (patternSec < 16) stressBase = 45 + osc * 15;  // moderate: 30–60%
    else if (patternSec < 22) stressBase = 25 + osc * 10;  // relaxed: 15–35%
    else                      stressBase = 65 + osc * 18;  // stressed: 47–83%

    // Admin Settings Hot-Swap for Mock Frame
    let globalBoost = 1.0;
    let lieScale = 0.4;
    let silenceThreshold = 0.005;
    try {
      const savedSettings = localStorage.getItem('thinc_admin_settings');
      if (savedSettings) {
        const adminSettings = JSON.parse(savedSettings);
        if (adminSettings) {
          if (adminSettings.c_global_boost !== undefined) {
            globalBoost = adminSettings.c_global_boost;
          }
          if (adminSettings.lie_scale !== undefined) {
            lieScale = adminSettings.lie_scale;
          }
          if (adminSettings.c_silence_thr !== undefined) {
            silenceThreshold = adminSettings.c_silence_thr;
          }
        }
      }
    } catch (e) {}

    // Simulate mock RMS and check against dynamic silence threshold
    const mockRms = 0.01 + (Math.random() * 0.03);
    const isMockSilent = mockRms < silenceThreshold;

    if (isMockSilent) {
      return {
        stressScore: 0,
        isSilent: true,
        isMusic: false,
        aiProbability: 0,
        gainStatus: 'IDLE',
        internalGain: 1.0,
        metrics: { jitter: '0.0000', shimmer: '0.0000', hnr: '0.00', entropy: 0, mti: '0.0000', fi: '0.0000', pdr: '0.0000' }
      };
    }

    // 민감도가 높을수록 요동성(volatility)을 부드럽게 반영하여 더 예민하게 피드백
    const volatility = (sensitivity / 5) * 10;
    const noise = osc * volatility + (Math.sin(now / 50) * 1.5); // 아주 부드러운 오실레이션 + 미세 지터
    // 사전스캔 신뢰도(Reliability)에 기반한 감도 계수 — analyzer.js의 reliabilityMultiplier와 동일 공식
    let mockReliabilityMult = 1.0;
    try {
      const metaRawMock = localStorage.getItem('thinc_video_metadata');
      if (metaRawMock) {
        const metaMock = JSON.parse(metaRawMock);
        if (metaMock && typeof metaMock.reliability === 'number') {
          // 신뢰도 0% → 2.0배, 50% → 1.0배, 100% → 0.1배 (analyzer.js와 동일 공식)
          mockReliabilityMult = Math.max(0.1, Math.min(2.5, (100 - metaMock.reliability) / 50));
        }
      }
    } catch(e) { mockReliabilityMult = 1.0; }
    const scaledStress = Math.min(99, Math.max(5, Math.round((stressBase * sensMult + noise) * globalBoost * lieScale * mockReliabilityMult)));

    // Plausible metric values (time-based smooth variation, NOT rapid blink)
    const mockJitter  = 0.012 + Math.abs(osc) * 0.03 + (Math.sin(now / 80) * 0.002);
    const mockShimmer = 0.025 + Math.abs(osc * 1.2) * 0.04 + (Math.cos(now / 90) * 0.003);
    const mockHnr     = 0.45 - Math.abs(osc) * 0.15 + (Math.sin(now / 120) * 0.01);
    const mockMti     = 0.015 + Math.abs(osc) * 0.04 + (Math.cos(now / 70) * 0.002);
    const mockFi      = 0.012 + Math.abs(osc) * 0.03 + (Math.sin(now / 110) * 0.002);
    const mockPdr     = 0.022 + Math.abs(osc * 1.5) * 0.06 + (Math.cos(now / 60) * 0.003);

    const aiProb = (mockJitter < 0.025 && mockShimmer < 0.04)
      ? 60 + Math.floor(Math.abs(osc) * 20)
      : 3  + Math.floor(Math.abs(osc) * 15);

    return {
      stressScore: scaledStress,
      isSilent: false,
      isMusic: false,
      aiProbability: aiProb,
      gainStatus: 'OPTIMAL',
      currentSpeakerId: 'Speaker 1',
      metrics: {
        jitter:  mockJitter.toFixed(4),
        shimmer: mockShimmer.toFixed(4),
        hnr:     mockHnr.toFixed(4),
        mti:     mockMti.toFixed(4),
        fi:      mockFi.toFixed(4),
        pdr:     mockPdr.toFixed(4)
      }
    };
  }

  // ===== DETECTOR UI UPDATER =====
  function updateDetectorUI(result, smoothScore) {
    // 1. Update Gauge Circle Arc
    const circle = document.getElementById('gauge-arc');
    const text = document.getElementById('gauge-pct');
    const floatDisplay = document.getElementById('float-score-display');

    if (circle && text) {
      // 2 * PI * Radius = 314 (approx circumference of R=50)
      const circumference = 314;
      const strokeVal = (smoothScore / 100) * circumference;
      circle.style.strokeDasharray = `${strokeVal} ${circumference}`;
      
      text.textContent = `${smoothScore}%`;
      if (floatDisplay) floatDisplay.innerText = `${smoothScore}%`;

      // Change neon stroke color based on stress thresholds (LIE >= 60%, SUSPICIOUS >= 40%)
      if (smoothScore >= 60) {
        circle.style.stroke = "var(--accent-red)";
      } else if (smoothScore >= 40) {
        circle.style.stroke = "var(--accent-orange)";
      } else {
        circle.style.stroke = "var(--accent-green)";
      }
    }

    // 1b. Update Floating Detector Button (YouTube overlay) status and color
    const floatBtn = document.getElementById('float-detector-btn');
    if (floatBtn) {
      const floatLabel = floatBtn.querySelector('.float-detector-label');
      const floatPulse = floatBtn.querySelector('.float-detector-pulse');
      const floatDisplay = document.getElementById('float-score-display');
      const floatSub = document.getElementById('float-sub-display');
      
      // Update real-time subtitle text to the left of the badge
      if (floatSub) {
        if (currentSubtitle && !result.isSilent && !result.isMusic) {
          floatSub.innerText = currentSubtitle;
          floatSub.classList.add('active');
        } else {
          floatSub.classList.remove('active');
        }
      }
      
      // Reset inline styles that might override CSS classes
      floatBtn.removeAttribute('style');
      if (floatPulse) floatPulse.removeAttribute('style');
      if (floatDisplay) floatDisplay.removeAttribute('style');
      if (floatLabel) floatLabel.removeAttribute('style');
      
      // Clean up previous state classes
      floatBtn.classList.remove('truth', 'doubt', 'lie');
      
      if (smoothScore >= 60) {
        floatBtn.classList.add('lie');
        if (floatLabel) floatLabel.innerText = t('float_lie');
        if (floatSub) {
          floatSub.style.borderColor = "var(--accent-red)";
          floatSub.style.boxShadow = "0 4px 15px rgba(255, 65, 108, 0.25)";
        }
      } else if (smoothScore >= 40) {
        floatBtn.classList.add('doubt');
        if (floatLabel) floatLabel.innerText = t('float_doubt');
        if (floatSub) {
          floatSub.style.borderColor = "var(--accent-orange)";
          floatSub.style.boxShadow = "0 4px 15px rgba(247, 151, 30, 0.25)";
        }
      } else {
        floatBtn.classList.add('truth');
        if (floatLabel) floatLabel.innerText = t('float_truth');
        if (floatSub) {
          floatSub.style.borderColor = "var(--accent-green)";
          floatSub.style.boxShadow = "0 4px 15px rgba(16, 185, 129, 0.25)";
        }
      }
    }

    // 2. Expert metrics display
    if (viewMode === 'expert') {
      document.getElementById('exp-jitter').innerText = result.metrics.jitter || '0.0000';
      document.getElementById('exp-shimmer').innerText = result.metrics.shimmer || '0.0000';
      document.getElementById('exp-hnr').innerText = result.metrics.hnr || '0.00';
      document.getElementById('exp-ai').innerText = `${Math.round(result.aiProbability || 0)}%`;
      document.getElementById('exp-mti').innerText = result.metrics.mti || '0.0000';
      document.getElementById('exp-fi').innerText = result.metrics.fi || '0.0000';
      document.getElementById('exp-pdr').innerText = result.metrics.pdr || '0.0000';
    }

    // 3. AI Scanner badge
    const aiBadge = document.getElementById('det-ai-badge');
    if (aiBadge) {
      if (result.aiProbability > 75) {
        aiBadge.innerText = `AI DETECTED: ${Math.round(result.aiProbability)}%`;
        aiBadge.classList.add('ai-alert');
        // Blinking red overlay removed per user request for premium distraction-free UX
        // document.getElementById('ai-warning').classList.remove('hidden');
      } else {
        aiBadge.innerText = `NEURAL SCAN: SAFE`;
        aiBadge.classList.remove('ai-alert');
        // document.getElementById('ai-warning').classList.add('hidden');
      }
    }

    // 3b. Analysis Source Badge
    const sourceBadge = document.getElementById('det-source-badge');
    if (sourceBadge) {
      const isRealAudioActive = analyzer && !result.isSilent && !result.isMusic;
      if (isRealAudioActive) {
        sourceBadge.innerText = "🎙️ AUDIO ACTIVE";
        sourceBadge.style.backgroundColor = "rgba(16, 185, 129, 0.2)";
        sourceBadge.style.color = "var(--accent-green)";
        sourceBadge.style.borderColor = "var(--accent-green)";
      } else {
        sourceBadge.innerText = "📝 CAPTION CONTEXT";
        sourceBadge.style.backgroundColor = "rgba(79, 172, 254, 0.2)";
        sourceBadge.style.color = "var(--accent-cyan)";
        sourceBadge.style.borderColor = "var(--accent-cyan)";
      }
    }

    // 4. Music/Effect Suppression
    const musicBadge = document.getElementById('music-badge');
    if (musicBadge) {
      if (result.isMusic) {
        musicBadge.classList.remove('hidden');
      } else {
        musicBadge.classList.add('hidden');
      }
    }

    // 5. Volume Optimizer UI
    const volOpt = document.getElementById('vol-optimizer');
    if (volOpt) {
      volOpt.classList.remove('hidden');
      document.getElementById('vol-status').innerText = result.gainStatus === 'OPTIMAL' ? t('vol_status_ok') : t('vol_status_adjusting');
      document.getElementById('vol-gain-val').innerText = result.internalGain || '1.0';
    }

    // Collect data point for final session reporting
    if (!result.isSilent && isRunning) {
      sessionData.push({
        score: smoothScore,
        ai: result.aiProbability,
        jitter: parseFloat(result.metrics.jitter) || 0,
        shimmer: parseFloat(result.metrics.shimmer) || 0,
        mti: parseFloat(result.metrics.mti) || 0,
        fi: parseFloat(result.metrics.fi) || 0,
        pdr: parseFloat(result.metrics.pdr) || 0,
        text: currentSubtitle,
        timestamp: Date.now()
      });
    }

    // Real-time oscilloscope drawing
    drawOscilloscope(result, smoothScore);

    // Advanced Diagnostic HUD update
    const _isSpeechActiveForHUD = !result.isSilent && !result.isMusic;
    updateDiagnosticHUD(result, smoothScore, _isSpeechActiveForHUD);

    // ===== 웹뷰 위 플로팅 오버레이 실시간 연동 (데스크톱/모바일 동시 대응) =====
    const wvOverlay = document.getElementById('wv-float-overlay');
    if (wvOverlay) {
      if (isRunning) {
        wvOverlay.classList.remove('hidden');
      } else {
        wvOverlay.classList.add('hidden');
      }

      // 우측 하단 원형 게이지 strokeDasharray 업데이트 (Radius=24, 둘레=151)
      const wvArc = document.getElementById('wv-gauge-arc');
      const wvPct = document.getElementById('wv-float-pct');
      const wvGauge = document.getElementById('wv-float-gauge');
      if (wvArc && wvPct) {
        const circumference = 151;
        const strokeVal = (smoothScore / 100) * circumference;
        wvArc.style.strokeDasharray = `${strokeVal} ${circumference}`;
        wvPct.textContent = `${smoothScore}%`;

        // 원형 게이지 테두리 색상 및 맥박 애니메이션 연동
        if (wvGauge) {
          wvGauge.classList.remove('truth', 'doubt', 'lie', 'analyzing');
          if (isRunning) wvGauge.classList.add('analyzing');

          if (smoothScore >= 60) {
            wvGauge.classList.add('lie');
            wvArc.style.stroke = "var(--accent-red)";
          } else if (smoothScore >= 40) {
            wvGauge.classList.add('doubt');
            wvArc.style.stroke = "var(--accent-orange)";
          } else {
            wvGauge.classList.add('truth');
            wvArc.style.stroke = "var(--accent-green)";
          }
        }
      }

      // 우측 상단 진실/거짓 누적 바 업데이트
      const wvTruthPct = document.getElementById('wv-truth-pct');
      const wvLiePct = document.getElementById('wv-lie-pct');
      const wvTruthFill = document.getElementById('wv-truth-fill');
      const wvLieFill = document.getElementById('wv-lie-fill');
      if (wvTruthPct && wvLiePct && wvTruthFill && wvLieFill) {
        let avgScore = smoothScore;
        if (sessionData && sessionData.length > 0) {
          const total = sessionData.reduce((sum, d) => sum + d.score, 0);
          avgScore = Math.round(total / sessionData.length);
        }
        const liePct = avgScore;
        const truthPct = 100 - liePct;
        wvTruthPct.textContent = `${truthPct}%`;
        wvLiePct.textContent = `${liePct}%`;
        wvTruthFill.style.width = `${truthPct}%`;
        wvLieFill.style.width = `${liePct}%`;
      }

      // 실시간 자막 플로팅 (웹앱 스타일)
      const wvSub = document.getElementById('wv-float-subtitle');
      if (wvSub) {
        if (currentSubtitle && !result.isSilent && !result.isMusic) {
          wvSub.innerText = currentSubtitle;
          wvSub.classList.add('show');
          if (smoothScore >= 60) {
            wvSub.style.borderColor = "var(--accent-red)";
            wvSub.style.boxShadow = "0 4px 15px rgba(255, 65, 108, 0.45)";
          } else if (smoothScore >= 40) {
            wvSub.style.borderColor = "var(--accent-orange)";
            wvSub.style.boxShadow = "0 4px 15px rgba(247, 151, 30, 0.45)";
          } else {
            wvSub.style.borderColor = "var(--accent-green)";
            wvSub.style.boxShadow = "0 4px 15px rgba(16, 185, 129, 0.45)";
          }
        } else {
          wvSub.classList.remove('show');
        }
      }
    }
  }

  function updateSentenceFeed(text, score, isUpdate = false) {
    currentSubtitle = text;

    const list = document.getElementById('sentence-list');
    if (!list) return;

    let status = "TRUTH";
    let statusClass = "status-truth";
    let levelClass = "level-truth";

    if (score >= 60) {
      status = "LIE";
      statusClass = "status-lie";
      levelClass = "level-lie";
    } else if (score >= 40) {
      status = "SUSPICIOUS";
      statusClass = "status-analyzing";
      levelClass = "level-suspicious";
    }

    if (isUpdate && activeCardElement && activeCardElement.parentNode === list) {
      // Update existing card's UI in real-time
      const headerSpan = activeCardElement.querySelector('.card-status');
      const scoreSpan = activeCardElement.querySelector('.card-score');
      
      if (headerSpan) {
        headerSpan.className = `card-status ${statusClass}`;
        headerSpan.innerText = status;
      }
      if (scoreSpan) {
        scoreSpan.innerText = `${score}%`;
      }
      
      // Update card border & text theme dynamically
      activeCardElement.className = `sentence-card ${levelClass}`;
      
      // Update the score of the latest record
      if (subtitleRecords.length > 0) {
        const lastRec = subtitleRecords[subtitleRecords.length - 1];
        if (lastRec.text === text && score > lastRec.score) {
          lastRec.score = score;
        }
      }
      
      // Log to deceptive events if it crosses the threshold
      if (score >= 60) {
        const alreadyLogged = liesLogged.some(l => l.text === text);
        if (!alreadyLogged) {
          liesLogged.push({
            text: text,
            score: score,
            time: new Date().toLocaleTimeString()
          });
        } else {
          const entry = liesLogged.find(l => l.text === text);
          if (entry && score > entry.score) {
            entry.score = score;
          }
        }
      }
      return;
    }

    // Initial check for lies
    if (score >= 60) {
      const alreadyLogged = liesLogged.some(l => l.text === text);
      if (!alreadyLogged) {
        liesLogged.push({
          text: text,
          score: score,
          time: new Date().toLocaleTimeString(),
          videoTime: captionPlaybackSec
        });
      }
    }

    // Record subtitle log
    subtitleRecords.push({
      text: text,
      score: score,
      ai: Math.floor(Math.random() * 15) + 5,
      time: new Date().toLocaleTimeString(),
      videoTime: captionPlaybackSec
    });

    const card = document.createElement('div');
    card.className = `sentence-card ${levelClass}`;
    card.innerHTML = `
      <div class="card-header">
        <span class="card-status ${statusClass}">${status}</span>
        <span class="card-score">${score}%</span>
      </div>
      <div class="card-text">${text}</div>
    `;

    list.insertBefore(card, list.firstChild);
    activeCardElement = card;
    
    // Limit to 5 visible elements on screen
    if (list.children.length > 5) {
      list.lastChild.remove();
    }
  }

  // ===== REAL-TIME 6-CHANNEL MINICHARTS =====
  function initMiniCharts() {
    const ids = ['lie', 'jitter', 'shimmer', 'mti', 'fi', 'pdr'];
    ids.forEach(id => {
      const canvas = document.getElementById(`chart-${id}`);
      if (canvas) {
        const ctx = canvas.getContext('2d');
        // Use explicit fixed size to ensure canvas renders even when tab is hidden on load
        const parentWidth = canvas.parentElement ? canvas.parentElement.offsetWidth : 140;
        const w = parentWidth > 0 ? parentWidth : 140;
        const h = 32;
        canvas.width = w;
        canvas.height = h;
        chartContexts[id] = ctx;
      }
    });
  }

  function drawHistoryCharts(result, smoothScore) {
    const metrics = {
      lie: smoothScore,
      jitter: parseFloat(result.metrics.jitter) * 800 || 0,
      shimmer: parseFloat(result.metrics.shimmer) * 350 || 0,
      mti: parseFloat(result.metrics.mti) * 600 || 0,
      fi: parseFloat(result.metrics.fi) * 500 || 0,
      pdr: parseFloat(result.metrics.pdr) * 400 || 0
    };

    const colors = {
      lie: '#00f2fe', jitter: '#f7971e', shimmer: '#a259ff',
      mti: '#ff416c', fi: '#00c6ff', pdr: '#ffd700'
    };

    Object.keys(metrics).forEach(key => {
      const ctx = chartContexts[key];
      if (!ctx) return;

      historyData[key].push(metrics[key]);
      if (historyData[key].length > 40) historyData[key].shift();

      const canvas = ctx.canvas;
      // If canvas has zero size (was hidden on init), reinitialize
      if (canvas.width === 0 || canvas.height === 0) {
        const parentWidth = canvas.parentElement ? canvas.parentElement.offsetWidth : 140;
        canvas.width = parentWidth > 0 ? parentWidth : 140;
        canvas.height = 32;
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw Grid
      ctx.strokeStyle = "rgba(255,255,255,0.03)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < canvas.width; i += 24) {
        ctx.moveTo(i, 0); ctx.lineTo(i, canvas.height);
      }
      ctx.stroke();

      // Draw smooth line
      ctx.strokeStyle = colors[key];
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      
      const step = canvas.width / 40;
      historyData[key].forEach((val, i) => {
        const x = i * step;
        const y = canvas.height - (Math.min(100, val) / 100 * canvas.height);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });
  }

  // ===== REPORT GENERATION & RENDERING =====
  function renderReportTab() {
    if (sessionData.length === 0) return;

    document.getElementById('report-empty-msg').classList.add('hidden');
    document.getElementById('report-body').classList.remove('hidden');

    const sessionId = "SESSION-" + Math.random().toString(36).substring(2, 10).toUpperCase();
    document.getElementById('report-session-id').innerText = sessionId;

    // Calculate core statistics
    const scores = sessionData.map(d => d.score);
    const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    const max = Math.max(...scores);
    const stability = Math.max(0, 100 - (max - avg) * 2.2);

    document.getElementById('rpt-avg').innerText = `${avg}%`;
    document.getElementById('rpt-peak').innerText = `${max}%`;
    document.getElementById('rpt-stability').innerText = `${stability}%`;

    // High stress ratios
    let lieCounts = scores.filter(s => s >= 65).length;
    let truthRatio = Math.round(((scores.length - lieCounts) / scores.length) * 100);
    let lieRatio = 100 - truthRatio;

    document.getElementById('rpt-truth-ratio').innerText = `${truthRatio}%`;
    document.getElementById('rpt-lie-ratio').innerText = `${lieRatio}%`;
    document.getElementById('rpt-bar-truth').style.width = `${truthRatio}%`;
    document.getElementById('rpt-bar-lie').style.width = `${lieRatio}%`;

    // Metadata
    document.getElementById('rpt-genre').innerText = videoMetadata.genre;
    document.getElementById('rpt-reliability').innerText = `${videoMetadata.reliability}% (${videoMetadata.grade})`;
    
    const integrity = Math.round((stability * 0.4) + (videoMetadata.reliability * 0.6));
    document.getElementById('rpt-integrity').innerText = `${integrity}%`;

    // Psychological metrics
    const agitation = Math.min(99, Math.round(max * 1.12));
    const cogLoad = Math.round((lieRatio * 0.7) + (max * 0.3));
    const density = Math.round((lieCounts / scores.length) * 100);

    document.getElementById('rpt-agitation').innerText = `${agitation}%`;
    document.getElementById('rpt-cog-load').innerText = `${cogLoad}%`;
    document.getElementById('rpt-density').innerText = `${density}%`;

    // Comprehensive verdict text
    let verdict = "";
    let verdictClass = "verdict-good";
    if (integrity > 80) {
      verdict = t('verdict_good');
      verdictClass = "verdict-good";
    } else if (integrity > 50) {
      verdict = t('verdict_warn');
      verdictClass = "verdict-warn";
    } else {
      verdict = t('verdict_bad');
      verdictClass = "verdict-bad";
    }

    const vText = document.getElementById('rpt-verdict');
    vText.innerText = verdict;
    vText.className = `verdict-text ${verdictClass}`;

    // Deceptive Events list
    const liesList = document.getElementById('rpt-lies-list');
    if (liesLogged.length > 0) {
      liesList.innerHTML = liesLogged.map(lie => `
        <div class="deception-item">
          <div class="deception-header">🚨 ${t('deception_detected')} [${t('float_lie')} ${lie.score}%] — ${lie.time}</div>
          <div class="deception-text">"${lie.text}"</div>
        </div>
      `).join('');
    } else {
      liesList.innerHTML = `<div class="feed-placeholder">${t('rpt_no_deceptions')}</div>`;
    }

    // Subtitle table data sheet
    const tbody = document.getElementById('rpt-data-tbody');
    if (captionLoadStatus === 'loaded' && subtitleRecords.length > 0) {
      tbody.innerHTML = subtitleRecords.map(rec => `
        <tr>
          <td>${rec.time}</td>
          <td>${rec.text}</td>
          <td style="color:${rec.score > 60 ? '#ff416c' : '#00f2fe'}; font-weight:800">${rec.score}%</td>
          <td>${rec.ai}%</td>
        </tr>
      `).join('');
    } else {
      const msg = captionLoadStatus === 'failed' ? t('toast_captions_unavailable') : t('data_none');
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color: var(--accent-red); font-weight:600;">${msg}</td></tr>`;
    }
  }

  // Draw timeline report chart
  function drawReportTimelineChart() {
    reportTimelineCanvas = document.getElementById('report-timeline-chart');
    if (!reportTimelineCanvas || sessionData.length === 0) return;

    reportTimelineCtx = reportTimelineCanvas.getContext('2d');
    const width = reportTimelineCanvas.offsetWidth;
    const height = reportTimelineCanvas.offsetHeight;
    reportTimelineCanvas.width = width;
    reportTimelineCanvas.height = height;

    reportTimelineCtx.clearRect(0, 0, width, height);

    const scores = sessionData.map(d => d.score);
    if (scores.length === 0) return;

    const step = width / Math.max(1, scores.length - 1);
    
    // Draw Gradient Fill
    const fillGrad = reportTimelineCtx.createLinearGradient(0, 0, 0, height);
    fillGrad.addColorStop(0, 'rgba(0, 242, 254, 0.25)');
    fillGrad.addColorStop(1, 'rgba(0, 242, 254, 0)');
    
    reportTimelineCtx.fillStyle = fillGrad;
    reportTimelineCtx.beginPath();
    reportTimelineCtx.moveTo(0, height);
    
    scores.forEach((s, idx) => {
      const x = idx * step;
      const y = height - (s / 100 * height);
      reportTimelineCtx.lineTo(x, y);
    });
    reportTimelineCtx.lineTo(width, height);
    reportTimelineCtx.closePath();
    reportTimelineCtx.fill();

    // Draw Line
    reportTimelineCtx.strokeStyle = '#00f2fe';
    reportTimelineCtx.lineWidth = 3;
    reportTimelineCtx.lineJoin = 'round';
    reportTimelineCtx.beginPath();
    
    scores.forEach((s, idx) => {
      const x = idx * step;
      const y = height - (s / 100 * height);
      if (idx === 0) reportTimelineCtx.moveTo(x, y);
      else reportTimelineCtx.lineTo(x, y);
    });
    reportTimelineCtx.stroke();
  }

  // ===== EXPORTS & CAPTURES =====
  function exportCSV() {
    if (sessionData.length === 0) return;

    let csv = "\uFEFF"; // UTF-8 BOM
    csv += "--- Th!nc SESSION ANALYSIS ---\n";
    csv += `Session Date, ${new Date().toLocaleString()}\n`;
    csv += `Reliability Integrity, ${document.getElementById('rpt-integrity').innerText}\n`;
    csv += `Average Stress, ${document.getElementById('rpt-avg').innerText}\n`;
    csv += `Peak Stress, ${document.getElementById('rpt-peak').innerText}\n\n`;

    csv += "TIMESTAMP, TEXT, STRESS SCORE, AI PROBABILITY\n";
    subtitleRecords.forEach(rec => {
      csv += `"${rec.time}", "${rec.text.replace(/"/g, '""')}", ${rec.score}%, ${rec.ai}%\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `LieDetector_Analysis_${Date.now()}.csv`;
    link.click();
    
    showToast(t('toast_export'));
  }

  function shareReportScreenshot() {
    activateCaptureMask();
  }

  function triggerTruthCapture() {
    activateCaptureMask();
  }

  function activateCaptureMask() {
    const mask = document.getElementById('capture-mask');
    if (mask) {
      mask.classList.remove('hidden');
      showToast(currentLang === 'ko' ? "마우스를 드래그하여 캡처할 영역을 지정하세요. (마우스 휠 스크롤 가능)" : "Drag your mouse to select capture area. (Mouse wheel scroll available)");
    }
  }

  window.selectGalleryItem = function (el) {
    document.querySelectorAll('.gallery-img-wrap').forEach(w => w.classList.remove('selected'));
    el.classList.add('selected');
  };

  function closeTruthModal() {
    document.getElementById('truth-modal').classList.add('hidden');
  }

  // ===== HISTORY MANAGEMENT =====
  function saveSessionToHistory() {
    if (sessionData.length === 0) return;

    const scores = sessionData.map(d => d.score);
    const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    const max = Math.max(...scores);

    const sessionObj = {
      id: "TTU-" + Math.random().toString(36).substring(2, 7).toUpperCase(),
      date: new Date().toLocaleDateString(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      title: videoMetadata.title,
      avg: avg,
      max: max,
      genre: videoMetadata.genre
    };

    sessionHistory.unshift(sessionObj);
    localStorage.setItem('truthpulse_history', JSON.stringify(sessionHistory));
    
    renderHistoryTab();
  }

  function loadHistory() {
    const saved = localStorage.getItem('truthpulse_history');
    if (saved) {
      sessionHistory = JSON.parse(saved);
      renderHistoryTab();
    }
  }

  function renderHistoryTab() {
    const list = document.getElementById('history-list');
    if (!list) return;

    if (sessionHistory.length === 0) {
      list.innerHTML = `<div class="history-empty">${t('history_empty')}</div>`;
      return;
    }

    list.innerHTML = sessionHistory.map(session => `
      <div class="history-card" onclick="loadHistorySession('${session.id}')">
        <div class="history-card-top">
          <div class="history-card-title">${session.title}</div>
          <div class="history-card-score ${session.max < 50 ? 'good' : ''}">${session.max}% ${t('float_lie')}</div>
        </div>
        <div class="history-card-bottom">
          <span>${session.date} ${session.time} • ${session.genre}</span>
          <span>${t('avg_stress')}: ${session.avg}%</span>
        </div>
      </div>
    `).join('');
  }

  window.loadHistorySession = function (id) {
    const session = sessionHistory.find(s => s.id === id);
    if (!session) return;

    // Direct redirection to Report page with simulated past details
    document.getElementById('report-empty-msg').classList.add('hidden');
    document.getElementById('report-body').classList.remove('hidden');

    document.getElementById('report-session-id').innerText = session.id;
    document.getElementById('rpt-avg').innerText = `${session.avg}%`;
    document.getElementById('rpt-peak').innerText = `${session.max}%`;
    
    const stability = Math.max(0, 100 - (session.max - session.avg) * 2.2);
    document.getElementById('rpt-stability').innerText = `${stability}%`;

    let truthRatio = Math.max(10, 100 - session.avg);
    let lieRatio = 100 - truthRatio;

    document.getElementById('rpt-truth-ratio').innerText = `${truthRatio}%`;
    document.getElementById('rpt-lie-ratio').innerText = `${lieRatio}%`;
    document.getElementById('rpt-bar-truth').style.width = `${truthRatio}%`;
    document.getElementById('rpt-bar-lie').style.width = `${lieRatio}%`;

    document.getElementById('rpt-genre').innerText = session.genre;
    document.getElementById('rpt-reliability').innerText = `${100 - session.avg}%`;
    const integrity = Math.round((stability + (100 - session.avg)) / 2);
    document.getElementById('rpt-integrity').innerText = `${integrity}%`;

    let verdict = "";
    let verdictClass = "verdict-good";
    if (integrity > 80) {
      verdict = t('verdict_good');
      verdictClass = "verdict-good";
    } else if (integrity > 50) {
      verdict = t('verdict_warn');
      verdictClass = "verdict-warn";
    } else {
      verdict = t('verdict_bad');
      verdictClass = "verdict-bad";
    }
    const vText = document.getElementById('rpt-verdict');
    vText.innerText = verdict;
    vText.className = `verdict-text ${verdictClass}`;

    document.getElementById('tab-report').click();
    showToast(t('toast_session_loaded'));
  };

  function clearHistory() {
    if (confirm(t('confirm_clear_history'))) {
      sessionHistory = [];
      localStorage.removeItem('truthpulse_history');
      renderHistoryTab();
      showToast(t('toast_history_cleared'));
    }
  }

  // ===== SETTINGS & GENERAL =====
  function detectBrowserLanguage() {
    const lang = (navigator.language || navigator.userLanguage || 'en').toLowerCase();
    const primary = lang.split('-')[0];
    
    if (primary === 'ko') return 'ko';
    if (primary === 'ja') return 'jp';
    if (primary === 'zh') return 'zh';
    if (primary === 'fr') return 'fr';
    if (primary === 'de') return 'de';
    if (primary === 'es') return 'es';
    if (primary === 'ru') return 'ru';
    
    return 'en';
  }

  function initSettings() {
    // Check local storage first
    const savedSettingsStr = localStorage.getItem('thinc_settings');
    if (savedSettingsStr) {
      try {
        const savedSettings = JSON.parse(savedSettingsStr);
        currentLang = savedSettings.language || detectBrowserLanguage() || 'en';
        screenshotCount = savedSettings.screenshotCount !== undefined ? savedSettings.screenshotCount : 3;
        autoShow = savedSettings.autoShow !== undefined ? savedSettings.autoShow : true;
      } catch (e) {
        currentLang = detectBrowserLanguage() || 'en';
        screenshotCount = 3;
        autoShow = true;
      }
    } else {
      // Compatibility fallback
      const legacyLang = localStorage.getItem('thinc_selected_language');
      currentLang = legacyLang || detectBrowserLanguage() || 'en';
      screenshotCount = 3;
      autoShow = true;
    }

    // Initialize temporary variables
    tempLang = currentLang;
    tempScreenshotCount = screenshotCount;
    tempAutoShow = autoShow;

    // Helper functions for UI sync
    function syncSettingsUI() {
      // Language chips
      const langChips = document.querySelectorAll('#lang-grid .lang-chip');
      langChips.forEach(chip => {
        if (chip.dataset.lang === tempLang) {
          chip.classList.add('active');
        } else {
          chip.classList.remove('active');
        }
      });

      // Screenshot count display in settings
      const setShotDisplay = document.getElementById('set-shot-display');
      if (setShotDisplay) setShotDisplay.innerText = tempScreenshotCount;

      // Autoshow toggle
      const toggleAutoshow = document.getElementById('toggle-autoshow');
      if (toggleAutoshow) toggleAutoshow.checked = tempAutoShow;
    }

    function syncMainUI() {
      const shotCountDisplay = document.getElementById('shot-count-display');
      if (shotCountDisplay) shotCountDisplay.innerText = screenshotCount;
    }

    // Initial sync
    syncSettingsUI();
    syncMainUI();

    // Multi-language chip click bindings (temp selection only)
    const langChips = document.querySelectorAll('#lang-grid .lang-chip');
    langChips.forEach(chip => {
      chip.addEventListener('click', (e) => {
        langChips.forEach(c => c.classList.remove('active'));
        e.target.classList.add('active');
        tempLang = e.target.dataset.lang;
      });
    });

    // Auto show toggle binding (temp selection only)
    const toggleAutoshow = document.getElementById('toggle-autoshow');
    if (toggleAutoshow) {
      toggleAutoshow.addEventListener('change', (e) => {
        tempAutoShow = e.target.checked;
      });
    }

    // Screenshot count settings buttons (temp selection only)
    const setShotMinus = document.getElementById('set-shot-minus');
    const setShotPlus = document.getElementById('set-shot-plus');
    if (setShotMinus) {
      setShotMinus.addEventListener('click', () => {
        tempScreenshotCount = Math.max(1, Math.min(5, tempScreenshotCount - 1));
        const setShotDisplay = document.getElementById('set-shot-display');
        if (setShotDisplay) setShotDisplay.innerText = tempScreenshotCount;
      });
    }
    if (setShotPlus) {
      setShotPlus.addEventListener('click', () => {
        tempScreenshotCount = Math.max(1, Math.min(5, tempScreenshotCount + 1));
        const setShotDisplay = document.getElementById('set-shot-display');
        if (setShotDisplay) setShotDisplay.innerText = tempScreenshotCount;
      });
    }

    // Save Settings Button click binding (commit to disk & global states)
    const btnSaveSettings = document.getElementById('btn-save-settings');
    if (btnSaveSettings) {
      btnSaveSettings.addEventListener('click', () => {
        currentLang = tempLang;
        screenshotCount = tempScreenshotCount;
        autoShow = tempAutoShow;

        // Persist to local storage
        localStorage.setItem('thinc_settings', JSON.stringify({
          language: currentLang,
          screenshotCount: screenshotCount,
          autoShow: autoShow
        }));

        // Synchronize main view UI elements
        syncMainUI();

        // Run global translation sweep
        updateAppLanguage();

        // Show toast confirmation
        showToast(t('toast_settings_saved'));
      });
    }

    // Reset settings button click binding (factory reset local storage)
    const btnResetSettings = document.getElementById('btn-reset-settings');
    if (btnResetSettings) {
      btnResetSettings.addEventListener('click', () => {
        const confirmed = confirm(t('confirm_clear_all_data'));
        if (confirmed) {
          localStorage.clear();
          sessionData = [];
          subtitleRecords = [];
          liesLogged = [];
          location.reload();
        }
      });
    }

    // Run translation sweep on load
    updateAppLanguage();
  }

  async function syncAdminSettingsFromServer() {
    try {
      const backendUrl = localStorage.getItem('thinc_backend_url') || '';
      const origin = typeof location !== 'undefined' ? location.origin : '';
      const base = backendUrl || origin;
      if (!base || base.startsWith('file://')) return;

      const r = await fetch(base + '/api/admin-settings', { cache: 'no-store' });
      if (!r.ok) return;
      const data = await r.json();
      if (data.ok && data.settings) {
        const localRaw = localStorage.getItem('thinc_admin_settings');
        const local = localRaw ? JSON.parse(localRaw) : null;
        const serverTime = data.updatedAt ? new Date(data.updatedAt).getTime() : 0;
        const localTime = (local && local._updatedAt) ? new Date(local._updatedAt).getTime() : 0;
        if (serverTime > localTime || !local) {
          const toStore = { ...data.settings };
          delete toStore._updatedAt;
          toStore._updatedAt = data.updatedAt;
          localStorage.setItem('thinc_admin_settings', JSON.stringify(toStore));
          console.log('[AdminSync] Startup Settings synced from server:', data.updatedAt);
        }
      }
    } catch (e) {
      console.warn('[AdminSync] Startup sync failed:', e.message);
    }
  }

  function updateAppLanguage() {
    // Re-translate top title, buttons, settings labels
    const navTitle = document.getElementById('nav-title');
    if (navTitle) navTitle.innerText = t('nav_title');
    
    const footerTitle = document.querySelector('.sidebar-footer .footer-title');
    if (footerTitle) footerTitle.innerText = t('nav_title');

    const btnOpenYt = document.getElementById('btn-open-youtube');
    if (btnOpenYt) btnOpenYt.innerText = t('yt_open_btn');
    
    // Sidebar / Bottom Nav Labels
    const detLabel = document.querySelector('#tab-detector .menu-label') || document.querySelector('#tab-detector .tab-label');
    if (detLabel) detLabel.innerText = t('tab_detector');

    const repLabel = document.querySelector('#tab-report .menu-label') || document.querySelector('#tab-report .tab-label');
    if (repLabel) repLabel.innerText = t('tab_report');

    const histLabel = document.querySelector('#tab-history .menu-label') || document.querySelector('#tab-history .tab-label');
    if (histLabel) histLabel.innerText = t('tab_history');

    const setLabel = document.querySelector('#tab-settings-nav .menu-label') || document.querySelector('#tab-settings-nav .tab-label');
    if (setLabel) setLabel.innerText = t('settings_title');

    // Detector button text
    const running = document.getElementById('btn-toggle').dataset.running === 'true';
    document.getElementById('btn-text').innerText = running ? t('stop') : t('start');
    
    // YouTube Loader Search Input Placeholder
    document.getElementById('yt-url-input').placeholder = t('yt_placeholder');

    // Search History overlay translations
    const txtHistoryLabel = document.getElementById('txt-history-label');
    if (txtHistoryLabel) txtHistoryLabel.innerText = t('recent_searches');
    const btnClearSearchHistory = document.getElementById('btn-clear-search-history');
    if (btnClearSearchHistory) btnClearSearchHistory.innerText = t('btn_clear_history');

    // Favorites overlay translations
    const txtFavoritesTitle = document.getElementById('txt-favorites-title');
    if (txtFavoritesTitle) txtFavoritesTitle.innerText = t('favorites_title');
    const txtTrendingTitle = document.getElementById('txt-trending-title');
    if (txtTrendingTitle) txtTrendingTitle.innerText = t('yt_feed_title');
    
    // Quick Buttons
    const quickButtons = document.querySelectorAll('.yt-quick-btn');
    if (quickButtons.length >= 3) {
      quickButtons[0].innerText = t('yt_quick_home');
      quickButtons[1].innerText = t('yt_quick_trending');
      quickButtons[2].innerText = t('yt_quick_shorts');
    }
    
    // Back Button
    const btnYtBack = document.getElementById('btn-yt-back');
    if (btnYtBack) btnYtBack.innerText = t('yt_back_to_list');

    // Browser Feed Title
    const feedTitle = document.querySelector('.feed-section-title');
    if (feedTitle) feedTitle.innerText = t('yt_feed_title');
    
    // Placeholder Elements
    const phTitle = document.querySelector('.yt-placeholder-title');
    if (phTitle) phTitle.innerText = t('yt_placeholder_go_title');
    const phSub = document.querySelector('.yt-placeholder-sub');
    if (phSub) phSub.innerHTML = t('yt_placeholder_go_sub');
    
    // Floating detector labels
    const floatLabel = document.querySelector('.float-detector-label');
    if (floatLabel) {
      const currentScoreText = document.getElementById('float-score-display').innerText;
      if (currentScoreText === '--' || currentScoreText === '0%') {
        floatLabel.innerText = t('float_idle');
      } else {
        const scoreVal = parseInt(currentScoreText);
        if (scoreVal >= 60) floatLabel.innerText = t('float_lie');
        else if (scoreVal >= 40) floatLabel.innerText = t('float_doubt');
        else floatLabel.innerText = t('float_truth');
      }
    }
    const floatSub = document.getElementById('float-sub-display');
    if (floatSub && floatSub.innerText === "대기 중...") {
      floatSub.innerText = t('float_idle_sub');
    }
    
    // Detector Banner
    const bannerText = document.getElementById('banner-text');
    if (bannerText) {
      if (bannerText.innerText === "대기 중" || bannerText.innerText === "Idle" || bannerText.innerText === "待機中" || bannerText.innerText === "等待中" || bannerText.innerText === "En attente" || bannerText.innerText === "Bereit" || bannerText.innerText === "En espera" || bannerText.innerText === "Ожидание") {
        bannerText.innerText = t('detector_banner_idle');
      } else {
        bannerText.innerText = t('detector_banner_scanning');
      }
    }
    
    // Speaker Badge
    const speakerBadge = document.getElementById('speaker-badge');
    if (speakerBadge && (speakerBadge.innerText === "음성 스캔 중..." || speakerBadge.innerText === "Voice Scanning..." || speakerBadge.innerText === "音声スキャン中..." || speakerBadge.innerText === "语音扫描中..." || speakerBadge.innerText === "Scan vocal en cours..." || speakerBadge.innerText === "Stimmen-Scan läuft..." || speakerBadge.innerText === "Escaneando voz..." || speakerBadge.innerText === "Сканирование голоса...")) {
      speakerBadge.innerText = t('speaker_scanning');
    }
    
    // Music Badge
    const musicBadge = document.getElementById('music-badge');
    if (musicBadge) musicBadge.innerText = t('music_fx');
    
    // Circular Gauge Label
    const gaugeSubLabel = document.getElementById('gauge-sub-label');
    if (gaugeSubLabel) gaugeSubLabel.innerText = t('gauge_sub_label');
    
    // Volume Optimizer
    const volTitle = document.querySelector('.vol-title');
    if (volTitle) volTitle.innerText = t('vol_title');
    const volStatus = document.getElementById('vol-status');
    if (volStatus) {
      if (volStatus.innerText.includes('완료') || volStatus.innerText.includes('Optimal') || volStatus.innerText.includes('完了') || volStatus.innerText.includes('完成') || volStatus.innerText.includes('Óptimo') || volStatus.innerText.includes('Оптимально')) {
        volStatus.innerText = t('vol_status_ok');
      } else {
        volStatus.innerText = t('vol_status_adjusting');
      }
    }
    const volNote = document.querySelector('.vol-note');
    if (volNote) volNote.innerText = t('vol_note');
    
    // Sensitivity Label
    const sensLabel = document.querySelector('.sens-label');
    if (sensLabel) sensLabel.innerText = t('sens_label');
    
    // View Mode Tabs
    const modeTabs = document.querySelectorAll('#mode-tabs .mode-tab');
    if (modeTabs.length >= 3) {
      modeTabs[0].innerText = t('mode_visual');
      modeTabs[1].innerText = t('mode_expert');
      modeTabs[2].innerText = t('mode_mini');
    }
    
    // Mini Charts Header
    const chartHeader = document.querySelector('.chart-header');
    if (chartHeader) chartHeader.innerText = t('chart_header');
    
    // Subtitle Feed Header
    const feedHeader = document.querySelector('.subtitle-feed .feed-header');
    if (feedHeader) feedHeader.innerText = t('feed_header');
    
    // Feed Placeholder
    const feedPlaceholder = document.querySelector('.sentence-list .feed-placeholder');
    if (feedPlaceholder) feedPlaceholder.innerText = t('feed_placeholder');
    
    // Share Button
    const shareBigBtn = document.getElementById('btn-share');
    if (shareBigBtn) {
      const svgHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="share-svg"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>`;
      shareBigBtn.innerHTML = svgHTML + ' ' + t('btn_share');
    }
    
    // Report Title Label
    const reportTitleLabel = document.querySelector('.report-title-label');
    if (reportTitleLabel) reportTitleLabel.innerText = t('report_title');
    
    const reportSessionId = document.getElementById('report-session-id');
    if (reportSessionId && (reportSessionId.innerText === "세션 없음" || reportSessionId.innerText === "No Session" || reportSessionId.innerText === "セッションなし" || reportSessionId.innerText === "无会话" || reportSessionId.innerText === "Aucune session" || reportSessionId.innerText === "Keine Sitzung" || reportSessionId.innerText === "Sin sesión" || reportSessionId.innerText === "Нет сеанса")) {
      reportSessionId.innerText = t('report_session_empty');
    }
    
    const reportEmptyMsg = document.getElementById('report-empty-msg');
    if (reportEmptyMsg) reportEmptyMsg.innerText = t('report_empty_msg');
    
    // Report Cards
    const reportCards = document.querySelectorAll('.report-card');
    if (reportCards.length >= 5) {
      reportCards[0].querySelector('.report-card-title').innerText = t('report_vocal_cog');
      const statsLabels = reportCards[0].querySelectorAll('.stat-label');
      if (statsLabels.length >= 3) {
        statsLabels[0].innerText = t('rpt_avg_stress');
        statsLabels[1].innerText = t('rpt_peak_stress');
        statsLabels[2].innerText = t('rpt_stability');
      }
      reportCards[0].querySelector('.ratio-truth-label').innerHTML = `${t('rpt_truth')} <span id="rpt-truth-ratio">${document.getElementById('rpt-truth-ratio').innerText}</span>`;
      reportCards[0].querySelector('.ratio-lie-label').innerHTML = `${t('rpt_lie')} <span id="rpt-lie-ratio">${document.getElementById('rpt-lie-ratio').innerText}</span>`;
      
      reportCards[1].querySelector('.report-card-title').innerText = t('report_context_audit');
      const auditRows = reportCards[1].querySelectorAll('.audit-row');
      if (auditRows.length >= 3) {
        auditRows[0].querySelector('span:first-child').innerText = t('rpt_genre');
        auditRows[1].querySelector('span:first-child').innerText = t('rpt_reliability');
        auditRows[2].querySelector('span:first-child').innerText = t('rpt_integrity');
      }
      reportCards[1].querySelector('.verdict-label').innerText = t('rpt_verdict_label');
      
      reportCards[2].querySelector('.report-card-title').innerText = t('report_neural_psy');
      const psyLabels = reportCards[2].querySelectorAll('.psy-label');
      if (psyLabels.length >= 3) {
        psyLabels[0].innerText = t('rpt_agitation');
        psyLabels[1].innerText = t('rpt_cog_load');
        psyLabels[2].innerText = t('rpt_density');
      }
      
      reportCards[3].querySelector('.report-card-title').innerText = t('report_deceptive_events');
      const rptLiesList = document.getElementById('rpt-lies-list');
      if (rptLiesList && (rptLiesList.innerText === "탐지된 기만 없음" || rptLiesList.innerText === "No deceptive events detected" || rptLiesList.innerText === "検出された欺瞞はありません" || rptLiesList.innerText === "未检测到欺骗事件" || rptLiesList.innerText === "Aucun événement trompeur détecté" || rptLiesList.innerText === "Keine Täuschungsereignisse erkannt" || rptLiesList.innerText === "No se detectaron engaños" || rptLiesList.innerText === "Обманов не обнаружено")) {
        rptLiesList.innerText = t('rpt_no_deceptions');
      }
      
      reportCards[4].querySelector('.report-card-title').innerText = t('report_data_sheet');
      const ths = reportCards[4].querySelectorAll('.data-table th');
      if (ths.length >= 4) {
        ths[0].innerText = t('table_time');
        ths[1].innerText = t('table_content');
        ths[2].innerText = t('table_lie');
        ths[3].innerText = t('table_ai');
      }
    }
    
    document.getElementById('btn-export-csv').innerText = t('btn_export_csv');
    document.getElementById('btn-share-report').innerText = t('btn_share_report');
    
    const historyTitle = document.querySelector('.history-title');
    if (historyTitle) historyTitle.innerText = t('history_title');
    document.getElementById('btn-clear-history').innerText = t('btn_clear_history');
    
    const historyEmpty = document.querySelector('.history-empty');
    if (historyEmpty) historyEmpty.innerText = t('history_empty');
    
    // Setting Tab translations
    const secSettingsTitle = document.querySelector('#tab-content-settings .panel-section-title');
    if (secSettingsTitle) secSettingsTitle.innerText = t('settings_title');
    
    const settingsContainer = document.querySelector('.settings-container');
    if (settingsContainer) {
      const settingLabels = settingsContainer.querySelectorAll('.setting-label');
      if (settingLabels.length >= 3) {
        settingLabels[0].innerText = t('settings_lang');
        settingLabels[1].innerText = t('settings_screenshot_count');
        settingLabels[2].innerText = t('settings_autoshow');
      }
    }

    const btnSaveSettings = document.getElementById('btn-save-settings');
    if (btnSaveSettings) btnSaveSettings.innerText = t('settings_save');
    const btnResetSettings = document.getElementById('btn-reset-settings');
    if (btnResetSettings) btnResetSettings.innerText = t('settings_reset');

    const infoCard = document.querySelector('.settings-info-card');
    if (infoCard) {
      const h4 = infoCard.querySelector('h4');
      if (h4) h4.innerText = t('system_diagnostic_title');
      const ps = infoCard.querySelectorAll('p');
      if (ps.length >= 3) {
        ps[0].innerText = t('system_platform');
        ps[1].innerText = t('system_audio_engine');
        ps[2].innerText = t('system_ai_engine');
      }
    }
    
    // Detector extra title translation
    const secDetectorTitle = document.getElementById('sec-detector-title');
    if (secDetectorTitle) secDetectorTitle.innerText = t('detector_banner_scanning');
    
    const expertTitle = document.querySelector('.expert-metrics-section .section-sub-title');
    if (expertTitle) expertTitle.innerText = t('expert_metrics_title');
    
    const waveTitle = document.querySelector('.wave-card .wave-title');
    if (waveTitle) waveTitle.innerText = t('wave_scan_title');
    
    const riskLabel = document.querySelector('.risk-label');
    if (riskLabel) riskLabel.innerText = t('stress_deviation_label');

    // Drawer settings panel (same mapping fallback)
    const settingsDrawer = document.getElementById('settings-drawer');
    if (settingsDrawer) {
      settingsDrawer.querySelector('.drawer-title').innerText = t('settings_title');
      const settingLabels = settingsDrawer.querySelectorAll('.setting-label');
      if (settingLabels.length >= 3) {
        settingLabels[0].innerText = t('settings_lang');
        settingLabels[1].innerText = t('settings_screenshot_count');
        settingLabels[2].innerText = t('settings_autoshow');
      }
      document.getElementById('btn-close-settings').innerText = t('settings_close');
    }
    
    const truthModal = document.getElementById('truth-modal');
    if (truthModal) {
      document.getElementById('modal-title').innerText = t('modal_title_done');
      document.getElementById('modal-sub').innerText = t('modal_sub_done');
      document.getElementById('btn-modal-go-report').innerText = t('btn_modal_go_report');
      document.getElementById('btn-modal-bottom-close').innerText = t('settings_close');
    }
    
    const pwaPopup = document.getElementById('pwa-popup');
    if (pwaPopup) {
      pwaPopup.querySelector('h3').innerText = t('pwa_install_title');
      pwaPopup.querySelector('p').innerText = t('pwa_install_desc');
      document.getElementById('pwa-btn-dismiss').innerText = t('pwa_btn_dismiss');
      document.getElementById('pwa-btn-install').innerText = t('pwa_btn_install');
    }
    
    const iosPwaPopup = document.getElementById('ios-pwa-popup');
    if (iosPwaPopup) {
      iosPwaPopup.querySelector('p').innerHTML = t('ios_pwa_text');
    }
    
    const aiWarning = document.getElementById('ai-warning');
    if (aiWarning) {
      aiWarning.querySelector('.ai-warn-title').innerText = t('ai_warning');
      aiWarning.querySelector('.ai-warn-sub').innerText = t('ai_warning_sub');
    }

    // Refresh video listings with the newly selected language
    if (typeof renderFavoritesGrid === 'function') {
      renderFavoritesGrid();
    }
    if (typeof loadPopularVideos === 'function') {
      if (activeSearchQuery) {
        renderVideoFeed(allSearchResults);
      } else {
        loadPopularVideos();
      }
    }

    // Re-translate executive report verdict statement
    const rptVerdict = document.getElementById('rpt-verdict');
    if (rptVerdict && sessionData.length > 0) {
      const total = sessionData.reduce((sum, d) => sum + d.score, 0);
      const avgScore = Math.round(total / sessionData.length);
      let verdictText = "";
      if (avgScore >= 60) verdictText = t('verdict_bad');
      else if (avgScore >= 40) verdictText = t('verdict_warn');
      else verdictText = t('verdict_good');
      rptVerdict.innerText = verdictText;
    }

    // Hot-reload captions and fully re-render logs, tables, and events
    reloadCaptionsAndReRender();
  }

  async function reloadCaptionsAndReRender() {
    if (!activeVideoId) return;

    if (captionLoadStatus === 'loaded') {
      try {
        const res = await fetch(`/api/captions?id=${encodeURIComponent(activeVideoId)}&lang=${currentLang}`);
        if (res.ok) {
          const data = await res.json();
          if (data.captions && data.captions.length > 0) {
            liveCaptions = data.captions;
          }
        }
      } catch (e) {
        console.warn("Failed to reload captions for new language:", e);
      }
    }

    // Translate all accumulated subtitleRecords
    subtitleRecords.forEach(rec => {
      const vTime = rec.videoTime !== undefined ? rec.videoTime : -1;
      if (vTime !== -1) {
        if (captionLoadStatus === 'loaded' && liveCaptions.length > 0) {
          let matchedText = "";
          for (let i = 0; i < liveCaptions.length; i++) {
            const cap = liveCaptions[i];
            const capEnd = cap.start + Math.max(cap.dur, 1.5);
            if (vTime >= cap.start && vTime < capEnd) {
              matchedText = cap.text;
              break;
            }
          }
          if (matchedText) rec.text = matchedText;
        } else {
          const MOCK_SUBTITLES_KO = [
            "여러분 반갑습니다. 오늘 나눌 분석 주제는 매우 민감합니다.",
            "제가 직접 검토하고 연구해 본 결과, 이것은 완벽한 팩트입니다.",
            "하지만 세간의 몇몇 사람들은 이에 대해 의문을 던지기도 하죠.",
            "솔직히 말씀드리면, 이 정보는 100% 신뢰할 수 있다고 보장합니다.",
            "아무도 몰랐던 충격적인 진실을 오늘 방송에서 최초로 폭로하겠습니다.",
            "이 분석 데이터는 공식적이고 객관적인 통계를 근거로 작성되었습니다.",
            "저를 꼭 믿어주세요, 이것은 절대 거짓말이나 선동이 아닙니다.",
            "AI 음성 감정기를 가동하여 실시간 음역 진동수를 추출 중입니다.",
            "발화자의 인지적 부하와 스트레스 점수가 실시간 변동하기 시작합니다.",
            "이 모든 지표는 신경학적 목소리 톤 변화에 기반한 과학적 사실입니다."
          ];
          const MOCK_SUBTITLES_EN = [
            "Welcome everyone. Today's analysis topic is extremely critical.",
            "After researching the transcripts, I can assure you this is a fact.",
            "However, some people still raise questions and express doubts.",
            "Honestly speaking, I guarantee this information is 100% reliable.",
            "I will expose the hidden shocking truth for the first time today.",
            "This data has been verified through official academic publications.",
            "Please trust me, this is absolutely not a lie or manipulation.",
            "We are extracting vocal micro-tremors via our active AI engine.",
            "The speaker's cognitive load and stress scores are fluctuating.",
            "All indicators point toward a neurologically measured speech stress pattern."
          ];
          let mockTexts = currentLang === 'ko' ? MOCK_SUBTITLES_KO : MOCK_SUBTITLES_EN;
          const mockIdx = Math.floor(vTime / 3.5);
          if (mockIdx >= 0) {
            rec.text = mockTexts[mockIdx % mockTexts.length];
          }
        }
      }
    });

    // Translate liesLogged
    liesLogged.forEach(lie => {
      const vTime = lie.videoTime !== undefined ? lie.videoTime : -1;
      if (vTime !== -1) {
        if (captionLoadStatus === 'loaded' && liveCaptions.length > 0) {
          let matchedText = "";
          for (let i = 0; i < liveCaptions.length; i++) {
            const cap = liveCaptions[i];
            const capEnd = cap.start + Math.max(cap.dur, 1.5);
            if (vTime >= cap.start && vTime < capEnd) {
              matchedText = cap.text;
              break;
            }
          }
          if (matchedText) lie.text = matchedText;
        } else {
          const MOCK_SUBTITLES_KO = [
            "여러분 반갑습니다. 오늘 나눌 분석 주제는 매우 민감합니다.",
            "제가 직접 검토하고 연구해 본 결과, 이것은 완벽한 팩트입니다.",
            "하지만 세간의 몇몇 사람들은 이에 대해 의문을 던지기도 하죠.",
            "솔직히 말씀드리면, 이 정보는 100% 신뢰할 수 있다고 보장합니다.",
            "아무도 몰랐던 충격적인 진실을 오늘 방송에서 최초로 폭로하겠습니다.",
            "이 분석 데이터는 공식적이고 객관적인 통계를 근거로 작성되었습니다.",
            "저를 꼭 믿어주세요, 이것은 절대 거짓말이나 선동이 아닙니다.",
            "AI 음성 감정기를 가동하여 실시간 음역 진동수를 추출 중입니다.",
            "발화자의 인지적 부하와 스트레스 점수가 실시간 변동하기 시작합니다.",
            "이 모든 지표는 신경학적 목소리 톤 변화에 기반한 과학적 사실입니다."
          ];
          const MOCK_SUBTITLES_EN = [
            "Welcome everyone. Today's analysis topic is extremely critical.",
            "After researching the transcripts, I can assure you this is a fact.",
            "However, some people still raise questions and express doubts.",
            "Honestly speaking, I guarantee this information is 100% reliable.",
            "I will expose the hidden shocking truth for the first time today.",
            "This data has been verified through official academic publications.",
            "Please trust me, this is absolutely not a lie or manipulation.",
            "We are extracting vocal micro-tremors via our active AI engine.",
            "The speaker's cognitive load and stress scores are fluctuating.",
            "All indicators point toward a neurologically measured speech stress pattern."
          ];
          let mockTexts = currentLang === 'ko' ? MOCK_SUBTITLES_KO : MOCK_SUBTITLES_EN;
          const mockIdx = Math.floor(vTime / 3.5);
          if (mockIdx >= 0) {
            lie.text = mockTexts[mockIdx % mockTexts.length];
          }
        }
      }
    });

    reRenderSentenceFeed();
    reRenderDataSheet();
    reRenderLiesList();
  }

  function reRenderSentenceFeed() {
    const list = document.getElementById('sentence-list');
    if (!list) return;
    list.innerHTML = "";

    if (captionLoadStatus === 'loaded' && subtitleRecords.length > 0) {
      subtitleRecords.forEach(rec => {
        let status = "TRUTH";
        let statusClass = "status-truth";
        let levelClass = "level-truth";

        if (rec.score >= 60) {
          status = "LIE";
          statusClass = "status-lie";
          levelClass = "level-lie";
        } else if (rec.score >= 40) {
          status = "SUSPICIOUS";
          statusClass = "status-analyzing";
          levelClass = "level-suspicious";
        }

        if (currentLang !== 'ko') {
          if (status === "TRUTH") status = t('float_truth').toUpperCase();
          else if (status === "LIE") status = t('float_lie').toUpperCase();
          else if (status === "SUSPICIOUS") status = "DOUBT";
        }

        const card = document.createElement('div');
        card.className = `sentence-card ${levelClass}`;
        card.innerHTML = `
          <div class="card-header">
            <span class="card-status ${statusClass}">${status}</span>
            <span class="card-score">${rec.score}%</span>
          </div>
          <div class="card-text">${rec.text}</div>
        `;
        list.insertBefore(card, list.firstChild);
      });
    } else {
      const msg = captionLoadStatus === 'failed' ? t('toast_captions_unavailable') : t('feed_placeholder');
      const colorStyle = captionLoadStatus === 'failed' ? 'color: var(--accent-red); font-weight: 600; font-style: normal; padding: 20px 0;' : '';
      list.innerHTML = `<div class="feed-placeholder" style="${colorStyle}">${msg}</div>`;
    }
  }

  function reRenderDataSheet() {
    const tbody = document.getElementById('rpt-data-tbody');
    if (!tbody) return;
    tbody.innerHTML = "";

    if (captionLoadStatus === 'loaded' && subtitleRecords.length > 0) {
      subtitleRecords.forEach(rec => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${rec.time}</td>
          <td>${rec.text}</td>
          <td class="${rec.score >= 60 ? 'red' : (rec.score >= 40 ? 'orange' : 'cyan')}">${rec.score}%</td>
          <td>${rec.ai}%</td>
        `;
        tbody.appendChild(tr);
      });
    } else {
      const msg = captionLoadStatus === 'failed' ? t('toast_captions_unavailable') : t('data_none');
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color: var(--accent-red); font-weight:600;">${msg}</td></tr>`;
    }
  }

  function reRenderLiesList() {
    const rptLiesList = document.getElementById('rpt-lies-list');
    if (!rptLiesList) return;

    if (liesLogged.length > 0) {
      rptLiesList.innerHTML = "";
      liesLogged.forEach(lie => {
        const item = document.createElement('div');
        item.className = "lie-log-item";
        const prefix = currentLang === 'ko' ? '⚠️ 거짓 감지:' : '⚠️ Lie Detected:';
        item.innerHTML = `${prefix} <span class="lie-log-time">${lie.time}</span> <span class="lie-log-text">${lie.text}</span> (<span class="lie-log-score">${lie.score}%</span>)`;
        rptLiesList.appendChild(item);
      });
    } else {
      rptLiesList.innerText = t('rpt_no_deceptions');
    }
  }

  function adjustScreenshotCount(delta) {
    screenshotCount = Math.max(1, Math.min(5, screenshotCount + delta));
    tempScreenshotCount = screenshotCount; // Sync temp variable
    
    // Auto-save to localStorage
    localStorage.setItem('thinc_settings', JSON.stringify({
      language: currentLang,
      screenshotCount: screenshotCount,
      autoShow: autoShow
    }));

    document.getElementById('shot-count-display').innerText = screenshotCount;
    const setShotDisplay = document.getElementById('set-shot-display');
    if (setShotDisplay) setShotDisplay.innerText = screenshotCount;
  }

  function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.innerText = msg;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 2800);
  }

  function initPWA() {
    let deferredPrompt;
    const pwaPopup = document.getElementById('pwa-popup');
    const btnInstall = document.getElementById('pwa-btn-install');
    const btnDismiss = document.getElementById('pwa-btn-dismiss');
    
    const iosPwaPopup = document.getElementById('ios-pwa-popup');
    const iosPwaClose = document.getElementById('ios-pwa-close');

    // Detect iOS
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    // Detect Standalone (Already installed)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

    if (isStandalone) {
      return; // Already installed
    }

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch((err) => {
        console.log('Service Worker registration failed: ', err);
      });
    }

    if (pwaPopup && btnDismiss && btnInstall) {
      // Android / Desktop Chrome PWA prompt handling
      window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        if (!isIOS) {
          pwaPopup.classList.remove('hidden');
        }
      });

      btnDismiss.addEventListener('click', () => {
        pwaPopup.classList.add('hidden');
      });

      btnInstall.addEventListener('click', async () => {
        if (deferredPrompt) {
          pwaPopup.classList.add('hidden');
          deferredPrompt.prompt();
          const { outcome } = await deferredPrompt.userChoice;
          if (outcome === 'accepted') {
            console.log('User accepted the A2HS prompt');
          }
          deferredPrompt = null;
        } else {
          alert(t('pwa_https_alert'));
          pwaPopup.classList.add('hidden');
        }
      });
    }

    if (iosPwaPopup && iosPwaClose) {
      // Fallback display for HTTP environments or to guarantee popup appears
      setTimeout(() => {
        if (isIOS) {
          iosPwaPopup.classList.remove('hidden');
        } else if (!isStandalone && pwaPopup) {
          pwaPopup.classList.remove('hidden');
        }
      }, 1500);

      iosPwaClose.addEventListener('click', () => {
        iosPwaPopup.classList.add('hidden');
      });
    }
  }

  // ===== ADVANCED DIAGNOSTIC HUD =====
  (function initDiagnosticHUD() {
    function toggleHUD() {
      const hud = document.getElementById('diagnostic-hud');
      if (hud) hud.classList.toggle('hidden');
    }
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'D') { e.preventDefault(); toggleHUD(); }
    });
    const btnDiag = document.getElementById('btn-diag-hud');
    if (btnDiag) btnDiag.addEventListener('click', toggleHUD);
    const btnClose = document.getElementById('diag-close-btn');
    if (btnClose) btnClose.addEventListener('click', () => {
      const hud = document.getElementById('diagnostic-hud');
      if (hud) hud.classList.add('hidden');
    });
  })();

  function updateDiagnosticHUD(result, smoothScore, isSpeechActive) {
    const d = result.diagnostic || {};
    const vadStatus = d.vadStatus || (analyzer ? analyzer.lastVadStatus : 'N/A');
    const snrDb = d.snrDb !== undefined ? d.snrDb : (analyzer ? analyzer.frameSNR : null);
    const confidence = d.confidence !== undefined ? d.confidence : (analyzer ? analyzer.frameConfidence : 0);
    const vadText = document.getElementById('vad-status-text');
    const snrText = document.getElementById('vad-snr-text');
    const confText = document.getElementById('vad-conf-text');
    if (vadText) {
      const vadColors = { 'VOICE_ACTIVE': '#10b981', 'WEAK_SIGNAL': '#f7971e', 'NO_VOICE': '#ff416c', 'N/A': '#888' };
      vadText.textContent = vadStatus || '--';
      vadText.style.color = vadColors[vadStatus] || '#00f2fe';
    }
    if (snrText) snrText.textContent = snrDb !== null ? `${snrDb} dB` : '-- dB';
    if (confText) confText.textContent = `${confidence}%`;
    const hud = document.getElementById('diagnostic-hud');
    if (!hud || hud.classList.contains('hidden')) return;
    const isRealAnalyzer = !!analyzer;
    const dataSource = d.dataSource || (isRealAnalyzer ? 'REAL_AUDIO' : 'CAPTION_SIM');
    const setEl = (id, val, color) => { const el = document.getElementById(id); if (!el) return; el.textContent = val; if (color) el.style.color = color; };
    const srcColors = { 'REAL_AUDIO': '#10b981', 'CORS_SIMULATION': '#f7971e', 'CAPTION_SIM': '#a259ff', 'SILENT': '#888' };
    setEl('diag-source', dataSource, srcColors[dataSource] || '#00f2fe');
    const rmsVal = d.rms !== undefined ? d.rms : (analyzer ? analyzer.frameRms : 0);
    setEl('diag-rms', rmsVal !== undefined ? rmsVal.toFixed(6) : '--');
    setEl('diag-snr', snrDb !== null ? `${snrDb} dB` : '-- dB');
    const noiseFloor = d.noiseFloor !== undefined ? d.noiseFloor : (analyzer ? analyzer.noiseFloor : null);
    setEl('diag-noise-floor', noiseFloor !== null ? noiseFloor.toFixed(6) : '--');
    const vadColors2 = { 'VOICE_ACTIVE': '#10b981', 'WEAK_SIGNAL': '#f7971e', 'NO_VOICE': '#ff416c' };
    setEl('diag-vad', vadStatus, vadColors2[vadStatus] || '#888');
    setEl('diag-speech', isSpeechActive ? '✅ TRUE' : '❌ FALSE', isSpeechActive ? '#10b981' : '#ff416c');
    setEl('diag-confidence', `${confidence}%`, confidence >= 70 ? '#10b981' : confidence >= 40 ? '#f7971e' : '#ff416c');
    const isCalibrating = d.isCalibrating !== undefined ? d.isCalibrating : (analyzer ? analyzer.isCalibrating : false);
    const calibProgress = d.calibrationProgress !== undefined ? d.calibrationProgress : 0;
    setEl('diag-calibration', isCalibrating ? `CALIBRATING ${calibProgress}%` : '✅ CALIBRATED', isCalibrating ? '#f7971e' : '#10b981');
    const gainStatusColors = { 'OPTIMAL': '#10b981', 'BOOSTING': '#f7971e', 'REDUCING': '#a259ff', 'LOW_SIGNAL': '#ff416c', 'IDLE': '#888' };
    setEl('diag-gain-status', result.gainStatus || 'IDLE', gainStatusColors[result.gainStatus] || '#888');
    setEl('diag-internal-gain', result.internalGain ? `${result.internalGain}x` : '1.0x');
    setEl('diag-analyzer-mode', isRealAnalyzer ? '🎙️ REAL VSA' : '📝 MOCK SIM', isRealAnalyzer ? '#10b981' : '#f7971e');
    setEl('diag-caption', typeof captionLoadStatus !== 'undefined' ? captionLoadStatus.toUpperCase() : '--', captionLoadStatus === 'loaded' ? '#10b981' : '#f7971e');
    const scoreSource = isRealAnalyzer ? 'ACOUSTIC FFT' : (typeof captionLoadStatus !== 'undefined' && captionLoadStatus === 'loaded' ? 'CAPTION CTX' : 'TIME CYCLE');
    setEl('diag-score-source', scoreSource);
  }

  // ===== REAL-TIME WAVE SCANNER (OSCILLOSCOPE) =====
  let waveFrameCount = 0;

  function drawOscilloscope(result, smoothScore) {
    const canvas = document.getElementById('wave-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    // Clear background
    ctx.fillStyle = '#050510';
    ctx.fillRect(0, 0, width, height);

    // Draw tech grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)';
    ctx.lineWidth = 1;
    for (let y = 15; y < height; y += 15) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
    }
    for (let x = 20; x < width; x += 20) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
    }

    // Center baseline
    ctx.strokeStyle = 'rgba(0, 242, 254, 0.12)';
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
    ctx.beginPath(); ctx.moveTo(0, height / 2); ctx.lineTo(width, height / 2); ctx.stroke();

    const isSilentMode = result.isSilent || result.isMusic || !isRunning;
    if (isRunning && !isSilentMode) {
      waveFrameCount++;
    }

    const colors = [
      'rgba(0, 242, 254, 0.85)', // Neon Cyan
      'rgba(162, 89, 255, 0.65)', // Neon Purple
      'rgba(255, 65, 108, 0.6)'   // Neon Red
    ];

    // CORS 시뮬레이션 모드(dataSource='CORS_SIMULATION')에서는 timeData에 실제 오디오 없음
    // 실제 Real Audio가 있을 때만 Real Waveform 그리기
    const isRealAudioActive = analyzer && !result.isSilent && !result.isMusic
        && result.diagnostic && result.diagnostic.dataSource === 'REAL_AUDIO';

    if (isRealAudioActive) {
      // 1. Real Audio Waveform
      const timeData = analyzer.timeData;
      const bufferLength = analyzer.bufferLength;
      
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = colors[0];
      ctx.shadowBlur = 8;
      ctx.shadowColor = colors[0];
      ctx.beginPath();

      const sliceWidth = width * 1.0 / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        // 무음값(128) 편차를 계산해 3.5배 증폭하여 그리기 (미세 톤 파형 시각화 개선)
        const deviation = (timeData[i] - 128) / 128.0;
        const y = Math.max(2, Math.min(height - 2, (height / 2) + deviation * (height / 2) * 3.5));
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        x += sliceWidth;
      }
      ctx.lineTo(width, height / 2);
      ctx.stroke();

      // Shadow overlay shift wave
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = colors[1];
      ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';
      ctx.beginPath();
      x = 0;
      for (let i = 0; i < bufferLength; i++) {
        const shiftedIdx = (i + 5) % bufferLength;
        const deviation = (timeData[shiftedIdx] - 128) / 128.0;
        const y = Math.max(2, Math.min(height - 2, (height / 2) + (deviation * (height / 2) * 3.5) + (Math.sin(i * 0.04 + waveFrameCount * 0.1) * 3)));
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        x += sliceWidth;
      }
      ctx.lineTo(width, height / 2);
      ctx.stroke();

    } else {
      // 2. Simulated Tech Pulse Waveform
      const baseAmp = isSilentMode ? 0.0 : (smoothScore / 100) * 45 + 5;
      const baseFreq1 = isSilentMode ? 0.008 : 0.02 + (smoothScore / 100) * 0.04;
      const baseFreq2 = isSilentMode ? 0.012 : 0.04 + (smoothScore / 100) * 0.05;
      const noiseAmp = isSilentMode ? 0.0 : (smoothScore / 100) * 3.5;

      const layers = isSilentMode ? 1 : 3;

      for (let l = 0; l < layers; l++) {
        ctx.lineWidth = l === 0 ? 2.5 : 1.2;
        
        let waveColor = colors[l];
        if (smoothScore >= 60 && l === 0) {
          waveColor = colors[2]; // red warning color
        }

        ctx.strokeStyle = waveColor;
        
        if (l === 0) {
          ctx.shadowBlur = isSilentMode ? 0 : 10;
          ctx.shadowColor = waveColor;
        } else {
          ctx.shadowBlur = 0;
        }

        ctx.beginPath();
        for (let x = 0; x < width; x++) {
          const phase1 = waveFrameCount * 0.07 * (l + 1) + x * baseFreq1;
          const phase2 = -waveFrameCount * 0.04 * (l + 1) + x * baseFreq2;
          
          let yOffset = Math.sin(phase1) * baseAmp * 0.65 + Math.cos(phase2) * baseAmp * 0.35;
          if (!isSilentMode) {
            yOffset += (Math.random() - 0.5) * noiseAmp;
          }

          const envelope = Math.sin((x / width) * Math.PI);
          const y = (height / 2) + yOffset * envelope;

          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }
    ctx.shadowBlur = 0;
  }

  // ===== DRAG SELECTION SCREEN CAPTURE ENGINE =====
  let isCapturing = false;
  let dragStartCoords = { x: 0, y: 0 };
  let autoScrollTimer = null;

  function initDragCapture() {
    const mask = document.getElementById('capture-mask');
    const box = document.getElementById('capture-box');
    if (!mask || !box) return;

    mask.addEventListener('mousedown', startDrag);
    
    function startDrag(e) {
      if (e.button !== 0) return; // Left click only
      e.preventDefault();
      
      const startX = e.clientX;
      const startY = e.clientY;

      dragStartCoords = { x: startX, y: startY };

      box.style.left = `${startX}px`;
      box.style.top = `${startY}px`;
      box.style.width = '0px';
      box.style.height = '0px';
      box.classList.remove('hidden');

      mask.appendChild(box);

      document.addEventListener('mousemove', dragMove);
      document.addEventListener('mouseup', endDrag);
    }

    function dragMove(e) {
      const currentX = e.clientX;
      const currentY = e.clientY;

      const left = Math.min(dragStartCoords.x, currentX);
      const top = Math.min(dragStartCoords.y, currentY);
      const width = Math.abs(dragStartCoords.x - currentX);
      const height = Math.abs(dragStartCoords.y - currentY);

      box.style.left = `${left}px`;
      box.style.top = `${top}px`;
      box.style.width = `${width}px`;
      box.style.height = `${height}px`;

      // Drag Auto Scroll boundary detection
      const edgeThreshold = 50;
      const scrollSpeed = 20;

      clearInterval(autoScrollTimer);
      autoScrollTimer = setInterval(() => {
        let scrollY = 0;
        let scrollX = 0;
        let activeScrollable = null;

        const rightScroll = document.querySelector('.tab-content.active .scroll-wrapper');
        const leftScroll = document.getElementById('yt-frame-container');

        if (rightScroll) {
          const rRect = rightScroll.getBoundingClientRect();
          if (e.clientX >= rRect.left && e.clientX <= rRect.right &&
              e.clientY >= rRect.top && e.clientY <= rRect.bottom) {
            activeScrollable = rightScroll;
          }
        }

        if (!activeScrollable && leftScroll) {
          const lRect = leftScroll.getBoundingClientRect();
          if (e.clientX >= lRect.left && e.clientX <= lRect.right &&
              e.clientY >= lRect.top && e.clientY <= lRect.bottom) {
            activeScrollable = leftScroll;
          }
        }

        if (activeScrollable) {
          const rect = activeScrollable.getBoundingClientRect();
          if (e.clientY > rect.bottom - edgeThreshold) {
            scrollY = scrollSpeed;
          } else if (e.clientY < rect.top + edgeThreshold) {
            scrollY = -scrollSpeed;
          }

          if (e.clientX > rect.right - edgeThreshold) {
            scrollX = scrollSpeed;
          } else if (e.clientX < rect.left + edgeThreshold) {
            scrollX = -scrollSpeed;
          }

          if (scrollY !== 0 || scrollX !== 0) {
            activeScrollable.scrollTop += scrollY;
            activeScrollable.scrollLeft += scrollX;
          }
        }
      }, 30);
    }

    function endDrag(e) {
      document.removeEventListener('mousemove', dragMove);
      document.removeEventListener('mouseup', endDrag);
      clearInterval(autoScrollTimer);

      const currentX = e.clientX;
      const currentY = e.clientY;

      const left = Math.min(dragStartCoords.x, currentX);
      const top = Math.min(dragStartCoords.y, currentY);
      const width = Math.abs(dragStartCoords.x - currentX);
      const height = Math.abs(dragStartCoords.y - currentY);

      mask.classList.add('hidden');
      box.classList.add('hidden');
      document.body.appendChild(box); // reset parent container

      if (width > 12 && height > 12) {
        performCapture(left, top, width, height);
      } else {
        showToast(currentLang === 'ko' ? "캡처 영역이 너무 좁습니다. 다시 시도해 주세요." : "Capture area is too small. Please try again.");
      }
    }
  }

  // Generate simulated capture card matching selection ratio
  function performCapture(left, top, width, height) {
    showToast(currentLang === 'ko' ? "실제 화면 캡처 중..." : "Capturing actual screen...");

    // Temporarily hide the capture-mask so it's not captured in the screenshot!
    const mask = document.getElementById('capture-mask');
    if (mask) mask.classList.add('hidden');

    // Temporarily overlay YouTube thumbnail on top of the iframe for screenshot capture
    let thumbOverlay = null;
    const ytPlayerEl = document.getElementById('yt-player');
    if (ytPlayerEl && activeVideoId && !ytPlayerEl.classList.contains('hidden')) {
      const rect = ytPlayerEl.getBoundingClientRect();
      thumbOverlay = document.createElement('img');
      thumbOverlay.src = `https://img.youtube.com/vi/${activeVideoId}/maxresdefault.jpg`;
      thumbOverlay.style.position = 'absolute';
      thumbOverlay.style.left = `${rect.left + window.scrollX}px`;
      thumbOverlay.style.top = `${rect.top + window.scrollY}px`;
      thumbOverlay.style.width = `${rect.width}px`;
      thumbOverlay.style.height = `${rect.height}px`;
      thumbOverlay.style.zIndex = '99999';
      thumbOverlay.style.objectFit = 'cover';
      thumbOverlay.crossOrigin = 'anonymous'; // critical for html2canvas CORS bypass
      document.body.appendChild(thumbOverlay);
    }

    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    const scale = window.devicePixelRatio || 1;

    html2canvas(document.body, {
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#050510',
      scale: scale
    }).then(fullCanvas => {
      if (thumbOverlay) thumbOverlay.remove();

      // Create cropped canvas
      const cropCanvas = document.createElement('canvas');
      cropCanvas.width = width;
      cropCanvas.height = height;
      const cropCtx = cropCanvas.getContext('2d');

      const sx = (left + scrollX) * scale;
      const sy = (top + scrollY) * scale;
      const sw = width * scale;
      const sh = height * scale;

      cropCtx.drawImage(fullCanvas, sx, sy, sw, sh, 0, 0, width, height);

      const dataURL = cropCanvas.toDataURL('image/jpeg', 0.95);

      // Auto local download trigger
      const link = document.createElement('a');
      link.href = dataURL;
      link.download = `TruthReport_${Date.now()}.jpg`;
      link.click();

      openSocialShareModal(dataURL);
    }).catch(err => {
      console.error("html2canvas capture error:", err);
      showToast(currentLang === 'ko' ? "캡처 중 오류가 발생했습니다." : "Error capturing screenshot.");
      if (thumbOverlay) thumbOverlay.remove();
      if (mask) mask.classList.remove('hidden');
    });
  }

  // ===== SOCIAL SHARE DASHBOARD SIMULATOR WITH MULTI-SELECT & SEQUENTIAL WIDGETS =====
  let capturedImageURL = '';
  let socialQueue = [];
  let currentPostingIndex = -1;

  function openSocialShareModal(imgURL) {
    capturedImageURL = imgURL;
    const modal = document.getElementById('social-share-modal');
    const previewImg = document.getElementById('social-preview-img');
    if (!modal || !previewImg) return;

    previewImg.src = imgURL;
    
    // Reset select inputs to default (X and Instagram checked by default)
    document.querySelectorAll('.chk-channel').forEach(chk => {
      const channel = chk.value;
      if (channel === 'x' || channel === 'instagram') {
        chk.checked = true;
        chk.closest('.channel-chip').classList.add('active');
      } else {
        chk.checked = false;
        chk.closest('.channel-chip').classList.remove('active');
      }
    });

    modal.classList.remove('hidden');
  }

  function getSocialPostTextForChannel(channel) {
    const score = Math.round(displayedScore);
    let text = '';
    if (channel === 'x') {
      text = `[𝕏 분석 통보] 유튜브 라이브 팩트 체크 완료! 영상: "${videoMetadata.title}"에 대해 Th!nc AI가 실시간 기만 음파를 감지했습니다 (거짓 지수: ${score}%). 진실은 감출 수 없습니다. #거짓말탐지기 #FactCheck #Thinc`;
    } else if (channel === 'instagram') {
      text = `🔍 Th!nc AI 실시간 팩트 체크 리포트\n\n방금 분석을 완료한 유튜브 영상 "${videoMetadata.title}"의 거짓 지수는 무려 ${score}%입니다. AI 바이오메트릭 분석기가 미세 성대 떨림과 인지 부하를 감지했습니다.\n\n#거짓말탐지기 #AI탐지 #팩트체크 #유튜브검증 #진실을알려라 #Thinc #InstaTruth`;
    } else if (channel === 'facebook') {
      text = `[Th!nc AI 거짓 분석 보고서]\n\n유튜브 영상: "${videoMetadata.title}"\n분석 일시: ${new Date().toLocaleString()}\n거짓 확률 지수: ${score}%\n\nTh!nc AI 대시보드로 실시간 오디오 성문(Jitter, Tremor)을 스캔한 결과, 기만 패턴이 포착되었습니다. 대중은 진실을 알 권리가 있습니다.\n\n#Thinc #거짓말탐지기 #실시간분석 #정보공유`;
    } else if (channel === 'tiktok') {
      text = `🚨 이거 진짜일까? Th!nc AI로 유튜브 돌려봤더니 거짓 지수 ${score}% 실화?? 🤫 성대 미세진동까지 털어버리는 실시간 팩트체크! 풀버전은 Th!nc 대시보드에서 확인해보세요. #거짓말탐지기 #팩트체크 #AI분석 #TikTokTruth #Thinc`;
    }
    return text;
  }

  function handleChannelChipChange(e) {
    const chk = e.target;
    const chip = chk.closest('.channel-chip');
    if (chk.checked) {
      chip.classList.add('active');
    } else {
      chip.classList.remove('active');
    }
  }

  function handleStartSequentialPosting() {
    socialQueue = [];
    document.querySelectorAll('.chk-channel:checked').forEach(chk => {
      socialQueue.push(chk.value);
    });

    if (socialQueue.length === 0) {
      showToast(currentLang === 'ko' ? "업로드할 소셜 매체를 최소 하나 이상 선택해주세요!" : "Please select at least one social media platform!");
      return;
    }

    // Hide selection dashboard
    document.getElementById('social-share-modal').classList.add('hidden');
    
    // Start queue
    currentPostingIndex = 0;
    runNextSocialWidget();
  }

  function runNextSocialWidget() {
    if (currentPostingIndex >= socialQueue.length) {
      // All done!
      document.getElementById('social-widget-modal').classList.add('hidden');
      showToast(currentLang === 'ko' ? "모든 소셜 매체에 공유가 성공적으로 완료되었습니다!" : "Successfully shared to all selected social media platforms!");
      return;
    }

    const channel = socialQueue[currentPostingIndex];
    const widgetModal = document.getElementById('social-widget-modal');
    if (!widgetModal) return;
    
    const widgetContent = widgetModal.querySelector('.widget-modal-content');
    const widgetIcon = document.getElementById('widget-channel-icon');
    const widgetTitle = document.getElementById('widget-title');
    const widgetPreviewImg = document.getElementById('widget-preview-img');
    const widgetTextarea = document.getElementById('widget-share-text');
    
    const userNameEl = document.getElementById('widget-user-name');
    const userHandleEl = document.getElementById('widget-user-handle');
    const publishBtn = document.getElementById('btn-widget-publish');
    const progressWrap = document.getElementById('widget-progress-wrap');

    const statusText = document.getElementById('widget-status-text');
    const pctText = document.getElementById('widget-pct-text');
    const barFill = document.getElementById('widget-progress-fill');

    if (!widgetContent || !widgetIcon || !widgetTitle || !widgetPreviewImg || !widgetTextarea || !statusText || !pctText || !barFill || !publishBtn || !progressWrap) return;

    // Reset widget visual state
    widgetContent.classList.remove('complete');
    barFill.style.width = '0%';
    pctText.innerText = '0%';
    statusText.innerText = currentLang === 'ko' ? "공유 준비 완료. 소셜 위젯을 클릭하세요." : "Ready to share. Please click the social widget.";
    
    // Hide progress and show publish button for manual user action
    progressWrap.classList.add('hidden');
    publishBtn.classList.remove('hidden');
    publishBtn.innerText = currentLang === 'ko' ? "공유 완료 (다음 매체)" : "Share Complete (Next Channel)";

    // Configure widget values
    widgetPreviewImg.src = capturedImageURL;
    widgetTextarea.value = getSocialPostTextForChannel(channel);

    // Channel specific visual customizations & profile setup
    let channelLabel = '';
    let channelIconChar = '';
    let channelThemeColor = 'var(--primary)';

    if (channel === 'x') {
      channelLabel = '𝕏 (Twitter)';
      channelIconChar = '𝕏';
      channelThemeColor = '#ffffff';
      if (userNameEl) userNameEl.innerText = 'Truth Seeker';
      if (userHandleEl) userHandleEl.innerText = '@truth_seeker_99';
    } else if (channel === 'instagram') {
      channelLabel = 'Instagram';
      channelIconChar = '📸';
      channelThemeColor = '#f7971e';
      if (userNameEl) userNameEl.innerText = 'Truth Seeker';
      if (userHandleEl) userHandleEl.innerText = '@truth_seeker_insta';
    } else if (channel === 'facebook') {
      channelLabel = 'Facebook';
      channelIconChar = 'f';
      channelThemeColor = '#4facfe';
      if (userNameEl) userNameEl.innerText = 'Truth Seeker Group';
      if (userHandleEl) userHandleEl.innerText = 'truth.seeker.official';
    } else if (channel === 'tiktok') {
      channelLabel = 'TikTok';
      channelIconChar = '🎵';
      channelThemeColor = '#ff416c';
      if (userNameEl) userNameEl.innerText = 'TruthSeekerTok';
      if (userHandleEl) userHandleEl.innerText = '@truth_seeker_tiktok';
    }

    widgetTitle.innerText = `${channelLabel} Posting Widget`;
    widgetIcon.innerText = channelIconChar;
    widgetIcon.style.backgroundColor = channelThemeColor;
    widgetIcon.style.color = (channel === 'x' || channel === 'instagram') ? '#000000' : '#ffffff';
    widgetContent.style.borderColor = channelThemeColor;

    // Dynamically render actual social widgets inside container
    const container = document.getElementById('social-widget-container');
    if (container) {
      container.innerHTML = '';
      const updateWidgets = () => {
        container.innerHTML = '';
        const currentText = widgetTextarea.value;
        const shareUrl = "https://github.com/google-deepmind";

        if (channel === 'x') {
          if (typeof twttr !== 'undefined' && twttr.widgets) {
            twttr.widgets.createShareButton(
              shareUrl,
              container,
              {
                text: currentText,
                size: 'large'
              }
            );
          } else {
            container.innerHTML = `<a href="https://twitter.com/intent/tweet?text=${encodeURIComponent(currentText)}" target="_blank" class="widget-publish-btn" style="background:#ffffff; color:#000000; text-decoration:none; padding:8px 16px; border-radius:30px; font-weight:bold; display:inline-block; font-size:13px; border:1px solid #ccc;">𝕏에 공유하기 (Tweet)</a>`;
          }
        } else if (channel === 'facebook') {
          container.innerHTML = `<div class="fb-share-button" data-href="${shareUrl}" data-layout="button" data-size="large"></div>`;
          if (typeof FB !== 'undefined') {
            FB.XFBML.parse(container);
          } else {
            container.innerHTML = `<a href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}&quote=${encodeURIComponent(currentText)}" target="_blank" class="widget-publish-btn" style="background:#1877f2; color:#ffffff; text-decoration:none; padding:8px 16px; border-radius:30px; font-weight:bold; display:inline-block; font-size:13px;">Facebook에 공유하기</a>`;
          }
        } else if (channel === 'instagram') {
          container.innerHTML = `<button id="btn-insta-go" class="widget-publish-btn" style="background:linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%); font-weight:bold; padding:8px 16px; font-size:13px; color:#ffffff; border:none; border-radius:20px; cursor:pointer;">📸 복사 및 Instagram 열기</button>`;
          const btn = document.getElementById('btn-insta-go');
          if (btn) {
            btn.addEventListener('click', () => {
              if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(widgetTextarea.value).then(() => {
                  showToast(currentLang === 'ko' ? "본문이 복사되었습니다! Instagram에 이미지를 업로드하고 붙여넣으세요." : "Post copied! Upload image to Instagram and paste.");
                  window.open("https://www.instagram.com/", '_blank');
                });
              }
            });
          }
        } else if (channel === 'tiktok') {
          container.innerHTML = `<button id="btn-tiktok-go" class="widget-publish-btn" style="background:#ff416c; font-weight:bold; padding:8px 16px; font-size:13px; color:#ffffff; border:none; border-radius:20px; cursor:pointer;">🎵 복사 및 TikTok 업로드 열기</button>`;
          const btn = document.getElementById('btn-tiktok-go');
          if (btn) {
            btn.addEventListener('click', () => {
              if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(widgetTextarea.value).then(() => {
                  showToast(currentLang === 'ko' ? "본문이 복사되었습니다! TikTok에 이미지를 업로드하고 붙여넣으세요." : "Post copied! Upload image to TikTok and paste.");
                  window.open("https://www.tiktok.com/upload", '_blank');
                });
              }
            });
          }
        }
      };

      updateWidgets();
      // Update widget link dynamically if user edits the text
      widgetTextarea.oninput = updateWidgets;
    }

    widgetModal.classList.remove('hidden');

    // Clone and replace publish button to reset event listeners safely
    const newPublishBtn = publishBtn.cloneNode(true);
    publishBtn.parentNode.replaceChild(newPublishBtn, publishBtn);

    newPublishBtn.addEventListener('click', () => {
      newPublishBtn.classList.add('hidden');
      progressWrap.classList.remove('hidden');

      let percent = 0;
      const interval = setInterval(() => {
        percent += 10;
        if (percent >= 100) {
          percent = 100;
          clearInterval(interval);

          pctText.innerText = '100%';
          barFill.style.width = '100%';
          statusText.innerText = currentLang === 'ko' ? "공유 완료!" : "Successfully Shared!";
          widgetContent.classList.add('complete');

          // Wait 1s and go to next
          setTimeout(() => {
            currentPostingIndex++;
            runNextSocialWidget();
          }, 1000);
        } else {
          pctText.innerText = `${percent}%`;
          barFill.style.width = `${percent}%`;
          statusText.innerText = currentLang === 'ko' ? "채널 전송 확인 중..." : "Verifying channel transmission...";
        }
      }, 50);
    });
  }

  function initSocialShareBinds() {
    const closeBtn = document.getElementById('btn-close-social-modal');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        document.getElementById('social-share-modal').classList.add('hidden');
      });
    }

    // Checkbox changes for channel selection
    document.querySelectorAll('.chk-channel').forEach(chk => {
      chk.addEventListener('change', handleChannelChipChange);
    });

    const startBtn = document.getElementById('btn-social-post-start');
    if (startBtn) {
      startBtn.addEventListener('click', handleStartSequentialPosting);
    }
  }

  // Draw Live timeline reliability bar on top of YouTube Player
  function drawLiveReliabilityBar() {
    const canvas = document.getElementById('yt-live-reliability-bar');
    if (!canvas || sessionData.length === 0) return;
    
    // Ensure display size matches canvas size
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    
    const len = sessionData.length;
    const barWidth = w / len;
    
    for (let i = 0; i < len; i++) {
      const data = sessionData[i];
      const score = data.score;
      let color = "var(--accent-green, #00f2fe)";
      if (score >= 60) {
        color = "var(--accent-red, #ff416c)";
      } else if (score >= 40) {
        color = "var(--accent-orange, #f7971e)";
      }
      
      ctx.fillStyle = color;
      ctx.fillRect(i * barWidth, 0, barWidth + 1, h);
    }
  }

  // Show mega 3-color ratio bar graph on top of YouTube video upon stop
  function showAnalysisEndOverlay() {
    const overlay = document.getElementById('yt-analysis-end-overlay');
    if (!overlay || sessionData.length === 0) return;
    
    // Calculate statistics
    const scores = sessionData.map(d => d.score);
    const total = scores.length;
    if (total === 0) return;
    
    const truthCount = scores.filter(s => s < 40).length;
    const doubtCount = scores.filter(s => s >= 40 && s < 60).length;
    const lieCount = scores.filter(s => s >= 60).length;
    
    const truthPct = Math.round((truthCount / total) * 100);
    const doubtPct = Math.round((doubtCount / total) * 100);
    const liePct = 100 - truthPct - doubtPct; // ensure sum is 100%
    
    // Overall Verdict
    const avg = Math.round(scores.reduce((a, b) => a + b, 0) / total);
    let verdictText = "";
    let verdictClass = "";
    
    if (avg >= 60) {
      verdictText = currentLang === 'ko' ? "기만 성향 다수 검출 (거짓 우려)" : "Deceptive Patterns Detected (High Risk)";
      verdictClass = "verdict-bad";
    } else if (avg >= 40) {
      verdictText = currentLang === 'ko' ? "신뢰도 모호 (불분명/의심)" : "Suspicious Reliability (Unclear)";
      verdictClass = "verdict-warn";
    } else {
      verdictText = currentLang === 'ko' ? "신뢰도 양호 (진실 판단)" : "High Reliability (Truth Judged)";
      verdictClass = "verdict-good";
    }
    
    overlay.innerHTML = `
      <div class="end-overlay-title">${currentLang === 'ko' ? "실시간 신뢰성 분석 판정" : "Real-time Reliability Analysis Verdict"}</div>
      <div class="end-overlay-verdict ${verdictClass}">${verdictText} (Stress Avg: ${avg}%)</div>
      
      <div class="mega-ratio-container">
        <div class="mega-ratio-bar">
          ${truthPct > 0 ? `<div class="mega-bar-truth" style="width: ${truthPct}%">${currentLang === 'ko' ? '진실' : 'Truth'} ${truthPct}%</div>` : ''}
          ${doubtPct > 0 ? `<div class="mega-bar-doubt" style="width: ${doubtPct}%">${currentLang === 'ko' ? '불분명' : 'Unclear'} ${doubtPct}%</div>` : ''}
          ${liePct > 0 ? `<div class="mega-bar-lie" style="width: ${liePct}%">${currentLang === 'ko' ? '거짓' : 'Lie'} ${liePct}%</div>` : ''}
        </div>
      </div>
      
      <button class="end-overlay-close-btn" id="btn-close-end-overlay">${currentLang === 'ko' ? "확인" : "Confirm"}</button>
    `;
    
    overlay.classList.remove('hidden');
    
    const closeBtn = document.getElementById('btn-close-end-overlay');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        overlay.classList.add('hidden');
      });
    }
  }

  // Update Live Truth vs Lie Floating ProgressBar
  function updateLiveTruthBar() {
    const container = document.getElementById('yt-live-truth-bar-container');
    const truthFill = document.getElementById('yt-live-truth-fill');
    const lieFill = document.getElementById('yt-live-lie-fill');
    const truthPctText = document.getElementById('yt-live-truth-pct');
    const liePctText = document.getElementById('yt-live-lie-pct');
    if (!container || !truthFill || !lieFill || !truthPctText || !liePctText) return;
    
    if (sessionData.length === 0) {
      truthFill.style.width = '100%';
      lieFill.style.width = '0%';
      truthPctText.innerText = '100%';
      liePctText.innerText = '0%';
      return;
    }
    
    const scores = sessionData.map(d => d.score);
    const total = scores.length;
    const truthCount = scores.filter(s => s < 50).length;
    const truthPct = Math.round((truthCount / total) * 100);
    const liePct = 100 - truthPct;
    
    truthFill.style.width = `${truthPct}%`;
    lieFill.style.width = `${liePct}%`;
    truthPctText.innerText = `${truthPct}%`;
    liePctText.innerText = `${liePct}%`;
  }

  // ===== LEGAL DISCLAIMER MODAL LIFECYCLE =====
  function initDisclaimerModal() {
    const isAccepted = localStorage.getItem('thinc_disclaimer_accepted') === 'true';
    const modal = document.getElementById('disclaimer-modal');
    const chkAgree = document.getElementById('chk-disclaimer-agree');
    const btnClose = document.getElementById('btn-disclaimer-close');
    const titleEl = document.getElementById('disclaimer-title');
    const textEl = document.getElementById('disclaimer-text');
    const agreeLabel = document.getElementById('disclaimer-agree-label');

    if (!modal || !chkAgree || !btnClose) return;

    if (isAccepted) {
      modal.classList.add('hidden');
      return;
    }

    // Set translation text dynamically
    if (titleEl) titleEl.innerText = t('disclaimer_title');
    if (textEl) textEl.innerText = t('disclaimer_text');
    if (agreeLabel) agreeLabel.innerText = t('disclaimer_agree');
    btnClose.innerText = t('disclaimer_btn');

    // Display modal
    modal.classList.remove('hidden');

    // Agree checkbox listener
    chkAgree.addEventListener('change', () => {
      btnClose.disabled = !chkAgree.checked;
    });

    // Close button listener
    btnClose.addEventListener('click', () => {
      if (chkAgree.checked) {
        localStorage.setItem('thinc_disclaimer_accepted', 'true');
        modal.classList.add('hidden');
      }
    });
  }

  // ===== BRAND TITLE REDIRECT BINDING =====
  window.addEventListener('DOMContentLoaded', () => {
    const brandBtn = document.getElementById('sidebar-brand');
    if (brandBtn) {
      brandBtn.addEventListener('click', () => {
        const browserLang = (navigator.language || navigator.userLanguage || 'en').toLowerCase();
        const landingPage = browserLang.startsWith('ko') ? 'landing_ko.html' : 'landing_en.html';
        window.location.href = landingPage;
      });
    }

    // Initialize legal disclaimer modal
    initDisclaimerModal();

    // Initialize Diagnostic UI keyboard shortcut
    if (window.DiagnosticUI) {
      window.DiagnosticUI.initShortcut();
    }

    // 100% Real-time Admin Settings Hot-Swap Listener
    window.addEventListener('storage', (e) => {
      if (e.key === 'thinc_admin_settings' && analyzer) {
        try {
          const savedSettings = localStorage.getItem('thinc_admin_settings');
          if (savedSettings) {
            analyzer.adminSettings = JSON.parse(savedSettings);
          } else {
            analyzer.adminSettings = null;
          }
        } catch (err) {
          analyzer.adminSettings = null;
        }
      }
    });
  });

})();

// ===== Diagnostic & Performance Logger =====
const PerformanceLogger = (function() {
  const logs = [];
  const MAX_LOGS = 1000;

  function getTimestamp() {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    const ms = String(now.getMilliseconds()).padStart(3, '0');
    return `${h}:${m}:${s}.${ms}`;
  }

  return {
    log: function(category, operation, durationMs, status, details) {
      const item = {
        timestamp: getTimestamp(),
        category: category || 'System',
        operation: operation || 'Unknown',
        durationMs: durationMs !== null && durationMs !== undefined ? Math.round(durationMs) : null,
        status: status || 'Info',
        details: details || ''
      };
      logs.push(item);
      if (logs.length > MAX_LOGS) {
        logs.shift();
      }
      console.log(`[Diagnostic][${item.category}][${item.status}] ${item.operation} (${item.durationMs ? item.durationMs + 'ms' : 'N/A'}) - ${item.details}`);
    },
    getLogs: function() {
      return logs;
    },
    clearLogs: function() {
      logs.length = 0;
      this.log('System', 'Logs cleared by user', 0, 'Info', 'Diagnostic database initialized.');
    },
    copyToClipboard: function() {
      const isElectron = window.electronAPI && window.electronAPI.isElectron;
      const isCapacitor = window.Capacitor && window.Capacitor.isNative;
      const platformType = isElectron ? 'Electron Desktop App' : (isCapacitor ? 'Capacitor Mobile App' : 'Standard Web Browser');
      
      const header = `=== THE TRUTH UNTOLD DIAGNOSTIC LOG ===\nGenerated at: ${new Date().toLocaleString()}\nPlatform: ${platformType}\nUser Agent: ${navigator.userAgent}\n---------------------------------------\n`;
      const body = logs.map(l => `[${l.timestamp}][${l.category}][${l.status}] ${l.operation} (${l.durationMs !== null ? l.durationMs + 'ms' : 'N/A'}) - ${l.details}`).join('\n');
      const text = header + body;
      
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
          alert('Diagnostic logs copied to clipboard!');
        }).catch(err => {
          console.error('Failed to copy via navigator.clipboard:', err);
          fallbackCopy(text);
        });
      } else {
        fallbackCopy(text);
      }
    },
    saveToFile: function() {
      const isElectron = window.electronAPI && window.electronAPI.isElectron;
      const isCapacitor = window.Capacitor && window.Capacitor.isNative;
      const platformType = isElectron ? 'Electron Desktop App' : (isCapacitor ? 'Capacitor Mobile App' : 'Standard Web Browser');
      
      const header = `=== THE TRUTH UNTOLD DIAGNOSTIC LOG ===\nGenerated at: ${new Date().toLocaleString()}\nPlatform: ${platformType}\nUser Agent: ${navigator.userAgent}\n---------------------------------------\n`;
      const body = logs.map(l => `[${l.timestamp}][${l.category}][${l.status}] ${l.operation} (${l.durationMs !== null ? l.durationMs + 'ms' : 'N/A'}) - ${l.details}`).join('\n');
      const text = header + body;
      
      try {
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `thinc_diagnostic_logs_${Date.now()}.txt`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        this.log('System', 'Diagnostic logs saved to file', 0, 'Success', 'Logs downloaded successfully.');
      } catch (err) {
        alert('File download failed: ' + err.message);
        this.log('System', 'Diagnostic save failed', 0, 'Failed', err.message);
      }
    }
  };

  function fallbackCopy(text) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.width = "2em";
    textArea.style.height = "2em";
    textArea.style.padding = "0";
    textArea.style.border = "none";
    textArea.style.outline = "none";
    textArea.style.boxShadow = "none";
    textArea.style.background = "transparent";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      const successful = document.execCommand('copy');
      if (successful) alert('Diagnostic logs copied to clipboard!');
      else alert('Unable to copy logs.');
    } catch (err) {
      alert('Copy failed: ' + err.message);
    }
    document.body.removeChild(textArea);
  }
})();
window.PerformanceLogger = PerformanceLogger;

// ===== Local Caption-based Lie Analyzer (Client-Side Fallback) =====
function analyzeCaptionsLocally(videoId, captions) {
  if (!captions || captions.length === 0) {
    return {
      ok: true,
      videoId,
      score: 82,
      rating: 'safe',
      badgeText: '안전 82%',
      detectedKeywords: [],
      captionAvailable: false
    };
  }
  
  const normalizedSegs = captions.map(s => {
    let rawStart = s.start !== undefined ? s.start : (s.offset !== undefined ? s.offset : 0);
    let rawDur = s.dur !== undefined ? s.dur : (s.duration !== undefined ? s.duration : 1);
    const isMs = rawStart > 1000 || rawDur > 1000;
    return {
      text: (s.text || '').replace(/\[.*?\]/g, '').trim(),
      startSec: isMs ? rawStart / 1000 : rawStart,
      dur: isMs ? rawDur / 1000 : rawDur
    };
  }).filter(s => s.text.length > 0);
  
  let textBuffer = '';
  if (normalizedSegs.length > 0) {
    const firstSec = normalizedSegs[0].startSec;
    const endSec = firstSec + 15;
    const filtered = normalizedSegs.filter(s => s.startSec >= firstSec && s.startSec <= endSec);
    textBuffer = filtered.map(s => s.text).join(' ');
  }
  
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
    score = 82;
  }
  
  let rating = 'safe';
  let badgeText = `안전 ${score}%`;
  if (score < 50) {
    rating = 'danger';
    badgeText = `위험 ${100 - score}%`;
  } else if (score < 80) {
    rating = 'caution';
    badgeText = `주의 ${100 - score}%`;
  }
  
  return {
    ok: true,
    videoId,
    score,
    rating,
    badgeText,
    detectedKeywords: detected.slice(0, 10),
    captionAvailable: textBuffer.length > 0
  };
}

// ===== Diagnostic Log Viewer UI =====
const DiagnosticUI = (function() {
  let modalElement = null;

  function createModal() {
    const styleId = 'diagnostic-ui-style';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.innerHTML = `
        .diag-modal-overlay {
          position: fixed;
          top: 0; left: 0; width: 100vw; height: 100vh;
          background: rgba(10, 10, 26, 0.75);
          backdrop-filter: blur(12px);
          z-index: 999999;
          display: flex; align-items: center; justify-content: center;
          font-family: 'Inter', -apple-system, sans-serif;
          color: #e2e8f0;
        }
        .diag-modal-content {
          width: 80%; max-width: 900px; height: 75vh;
          background: rgba(15, 23, 42, 0.85);
          border: 1px solid rgba(59, 130, 246, 0.4);
          border-radius: 16px;
          box-shadow: 0 0 30px rgba(59, 130, 246, 0.2);
          display: flex; flex-direction: column;
          overflow: hidden;
          animation: diagFadeIn 0.25s ease-out;
        }
        @keyframes diagFadeIn {
          from { opacity: 0; transform: scale(0.97); }
          to { opacity: 1; transform: scale(1); }
        }
        .diag-header {
          padding: 16px 24px;
          background: rgba(30, 41, 59, 0.5);
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          display: flex; justify-content: space-between; align-items: center;
        }
        .diag-title {
          font-size: 1.15rem; font-weight: 700;
          color: #60a5fa; display: flex; align-items: center; gap: 8px;
        }
        .diag-actions {
          display: flex; gap: 10px;
        }
        .diag-btn {
          background: rgba(59, 130, 246, 0.2);
          border: 1px solid rgba(59, 130, 246, 0.5);
          color: #60a5fa; padding: 6px 12px; border-radius: 6px;
          cursor: pointer; font-size: 0.85rem; font-weight: 500;
          transition: all 0.2s ease;
        }
        .diag-btn:hover {
          background: rgba(59, 130, 246, 0.4);
          box-shadow: 0 0 10px rgba(59, 130, 246, 0.3);
        }
        .diag-btn-danger {
          background: rgba(239, 68, 68, 0.2);
          border: 1px solid rgba(239, 68, 68, 0.5);
          color: #f87171;
        }
        .diag-btn-danger:hover {
          background: rgba(239, 68, 68, 0.4);
          box-shadow: 0 0 10px rgba(239, 68, 68, 0.3);
        }
        .diag-btn-close {
          background: transparent; border: none; color: #94a3b8;
          font-size: 1.5rem; cursor: pointer; display: flex; align-items: center;
        }
        .diag-btn-close:hover { color: #f87171; }
        .diag-body {
          flex: 1; padding: 20px; overflow-y: auto;
          display: flex; flex-direction: column; gap: 16px;
        }
        .diag-sysinfo {
          background: rgba(30, 41, 59, 0.3);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 8px; padding: 12px; font-size: 0.85rem;
          line-height: 1.5; color: #94a3b8;
        }
        .diag-sysinfo-grid {
          display: grid; grid-template-columns: 1fr 1fr; gap: 8px;
        }
        .diag-table-container {
          flex: 1; border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 8px; overflow: hidden; background: rgba(15, 23, 42, 0.5);
        }
        .diag-table {
          width: 100%; border-collapse: collapse; font-size: 0.85rem;
          text-align: left;
        }
        .diag-table th {
          background: rgba(30, 41, 59, 0.8); padding: 10px 12px;
          color: #94a3b8; font-weight: 600; font-size: 0.8rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }
        .diag-table td {
          padding: 8px 12px; border-bottom: 1px solid rgba(255, 255, 255, 0.02);
          color: #cbd5e1; word-break: break-all;
        }
        .diag-table tr:hover {
          background: rgba(255, 255, 255, 0.02);
        }
        .badge-status {
          display: inline-block; padding: 2px 6px; border-radius: 4px;
          font-size: 0.75rem; font-weight: 600;
        }
        .badge-Success { background: rgba(34, 197, 94, 0.2); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.4); }
        .badge-Warning { background: rgba(234, 179, 8, 0.2); color: #facc15; border: 1px solid rgba(234, 179, 8, 0.4); }
        .badge-Failed { background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.4); }
        .badge-Info { background: rgba(148, 163, 184, 0.2); color: #cbd5e1; border: 1px solid rgba(148, 163, 184, 0.4); }
        .badge-category {
          color: #60a5fa; font-weight: 500;
        }
      `;
      document.head.appendChild(style);
    }

    const overlay = document.createElement('div');
    overlay.className = 'diag-modal-overlay';
    
    const isElectron = window.electronAPI && window.electronAPI.isElectron;
    const isCapacitor = window.Capacitor && window.Capacitor.isNative;
    const platformType = isElectron ? 'Electron Desktop App' : (isCapacitor ? 'Capacitor Mobile App' : 'Standard Web Browser');
    
    overlay.innerHTML = `
      <div class="diag-modal-content">
        <div class="diag-header">
          <div class="diag-title">
            <span>📊</span> Th!nc 히든 진단 로그 (Ctrl+Shift+L)
          </div>
          <div class="diag-actions">
            <select id="diag-filter-cat" style="background:rgba(30,41,59,0.8);color:#cbd5e1;border:1px solid rgba(59,130,246,0.4);border-radius:6px;padding:5px 8px;font-size:0.82rem;cursor:pointer;">
              <option value="all">전체 카테고리</option>
              <option value="System">System</option>
              <option value="Audio">Audio</option>
              <option value="Captions">Captions</option>
              <option value="Network">Network</option>
              <option value="Webview">Webview</option>
              <option value="Analysis">Analysis</option>
              <option value="Session">Session</option>
              <option value="Error">Error</option>
            </select>
            <button class="diag-btn" id="diag-btn-copy">📋 복사</button>
            <button class="diag-btn" id="diag-btn-save">💾 파일저장</button>
            <button class="diag-btn diag-btn-danger" id="diag-btn-clear">🗑 초기화</button>
            <button class="diag-btn-close" id="diag-btn-close">&times;</button>
          </div>
        </div>
        <div class="diag-body">
          <div class="diag-sysinfo">
            <div class="diag-sysinfo-grid">
              <div><strong>Platform:</strong> ${platformType}</div>
              <div><strong>Language:</strong> ${navigator.language}</div>
              <div><strong>Total Logs:</strong> <span id="diag-log-count">0</span> / 1000</div>
              <div><strong>Session Start:</strong> ${new Date().toLocaleTimeString()}</div>
              <div style="grid-column: span 2"><strong>User Agent:</strong> ${navigator.userAgent}</div>
            </div>
          </div>
          <div class="diag-table-container">
            <div style="max-height: 44vh; overflow-y: auto;" id="diag-scroll-area">
              <table class="diag-table">
                <thead>
                  <tr>
                    <th style="width: 95px;">시간</th>
                    <th style="width: 90px;">카테고리</th>
                    <th style="width: 200px;">작업</th>
                    <th style="width: 75px;">소요(ms)</th>
                    <th style="width: 75px;">상태</th>
                    <th>상세 내용</th>
                  </tr>
                </thead>
                <tbody id="diag-logs-tbody">
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(overlay);
    modalElement = overlay;

    document.getElementById('diag-btn-close').addEventListener('click', hide);
    document.getElementById('diag-btn-clear').addEventListener('click', () => {
      PerformanceLogger.clearLogs();
      renderLogs();
    });
    document.getElementById('diag-btn-copy').addEventListener('click', () => {
      PerformanceLogger.copyToClipboard();
    });
    document.getElementById('diag-btn-save').addEventListener('click', () => {
      PerformanceLogger.saveToFile();
    });
    document.getElementById('diag-filter-cat').addEventListener('change', () => {
      renderLogs();
    });
    
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) hide();
    });

    renderLogs();
  }

  function renderLogs() {
    const tbody = document.getElementById('diag-logs-tbody');
    if (!tbody) return;
    
    const allLogs = PerformanceLogger.getLogs();
    const filterEl = document.getElementById('diag-filter-cat');
    const filterCat = filterEl ? filterEl.value : 'all';
    const logs = filterCat === 'all' ? allLogs : allLogs.filter(l => l.category === filterCat);

    const countEl = document.getElementById('diag-log-count');
    if (countEl) countEl.textContent = allLogs.length;
    
    if (logs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #64748b; padding: 20px;">${filterCat !== 'all' ? filterCat + ' 카테고리에 로그 없음' : '로그가 없습니다.'}</td></tr>`;
      return;
    }

    tbody.innerHTML = logs.slice().reverse().map(log => {
      const rowBg = log.status === 'Failed' ? 'rgba(239,68,68,0.06)' : log.status === 'Warning' ? 'rgba(234,179,8,0.05)' : '';
      return `
      <tr style="background: ${rowBg}">
        <td style="color: #64748b; font-family: monospace; font-size:0.78rem;">${log.timestamp}</td>
        <td><span class="badge-category" style="font-size:0.78rem;">${log.category}</span></td>
        <td style="font-weight: 500; font-size:0.82rem;">${log.operation}</td>
        <td style="font-family: monospace; font-size:0.8rem; color: ${log.durationMs && log.durationMs > 2000 ? '#facc15' : log.durationMs && log.durationMs > 500 ? '#fb923c' : '#cbd5e1'}">
          ${log.durationMs !== null ? log.durationMs + ' ms' : '-'}
        </td>
        <td><span class="badge-status badge-${log.status}">${log.status}</span></td>
        <td style="color: #94a3b8; font-size: 0.78rem; word-break: break-word; max-width: 340px;">${log.details}</td>
      </tr>
    `}).join('');

    // 자동 스크롤 (가장 최신 로그가 맨 위에 표시됨)
    const scrollArea = document.getElementById('diag-scroll-area');
    if (scrollArea) scrollArea.scrollTop = 0;
  }


  function show() {
    if (modalElement) {
      renderLogs();
      modalElement.style.display = 'flex';
    } else {
      createModal();
    }
    PerformanceLogger.log('System', 'Opened Diagnostic Log Viewer', 0, 'Info', 'Diagnostic UI displayed.');
  }

  function hide() {
    if (modalElement) {
      modalElement.style.display = 'none';
    }
  }

  function toggle() {
    if (modalElement && modalElement.style.display !== 'none') {
      hide();
    } else {
      show();
    }
  }

  function initShortcut() {
    window.addEventListener('keydown', (e) => {
      const isL = e.key === 'l' || e.key === 'L' || e.keyCode === 76;
      const isCtrl = e.ctrlKey || e.metaKey;
      const isShift = e.shiftKey;
      
      if (isCtrl && isShift && isL) {
        e.preventDefault();
        toggle();
      }
    });
    PerformanceLogger.log('System', 'PerformanceLogger Initialized', 0, 'Success', 'Keyboard shortcut registered (Ctrl+Shift+L).');
  }

  return {
    show: show,
    hide: hide,
    toggle: toggle,
    initShortcut: initShortcut
  };
})();
window.DiagnosticUI = DiagnosticUI;

