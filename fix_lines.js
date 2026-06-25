const fs = require('fs');

function fixHtmlFile(path) {
  let lines = fs.readFileSync(path, 'utf8').split('\n');

  // Line-by-line exact replacements: [lineSubstring, replacement for entire line]
  const lineReplacements = [
    // Banner text
    [`<span id="banner-text">?湲?以?</span>`, `          <span id="banner-text">대기 중</span>`],
    [`<span id="banner-text">?湲?以?</span>`, `            <span id="banner-text">대기 중</span>`],
    // Float label/sub
    [`<span class="float-detector-label">?湲?</span>`, `        <span class="float-detector-label">대기</span>`],
    [`<div class="float-detector-sub" id="float-sub-display">?湲?以?..</div>`, `        <div class="float-detector-sub" id="float-sub-display">대기 중...</div>`],
    // VIP badge
    [`<div class="det-badge det-badge-vip hidden" id="det-vip-badge">?슚 VIP SENS X2</div>`, `            <div class="det-badge det-badge-vip hidden" id="det-vip-badge">⭐ VIP SENS X2</div>`],
    // Speaker badge
    [`<div class="speaker-badge" id="speaker-badge">음성 스캔 중..</div>`, `          <div class="speaker-badge" id="speaker-badge">음성 스캔 중..</div>`],
    // Vol optimizer
    [`<div class="vol-icon">?뵄</div>`, `          <div class="vol-icon">🔊</div>`],
    [`<div class="vol-title">?대? 蹂쇰ⅷ 理쒖쟻✕</div>`, `            <div class="vol-title">내부 볼륨 최적화</div>`],
    [`<div class="vol-status" id="vol-status">理쒖쟻✕?꾨즺</div>`, `            <div class="vol-status" id="vol-status">최적화 완료</div>`],
    [`<div class="vol-note">?쒖뒪✕蹂쇰ⅷ 蹂寃✕놁쓬</div>`, `          <div class="vol-note">시스템 볼륨 변경 없음</div>`],
    // Start btn icon
    [`<span class="btn-icon" id="btn-icon">✕</span>`, `            <span class="btn-icon" id="btn-icon">▶</span>`],
    // Sens label
    [`<span class="sens-label">誘쇨컧✕</span>`, `            <span class="sens-label">민감도</span>`],
    // Mode tabs
    [`<button class="mode-tab" data-mode="visual">鍮꾩＜✕</button>`, `            <button class="mode-tab" data-mode="visual">비주얼</button>`],
    [`<button class="mode-tab active" data-mode="expert">?꾨Ц媛</button>`, `            <button class="mode-tab active" data-mode="expert">전문가</button>`],
    [`<button class="mode-tab" data-mode="mini">誘몃땲</button>`, `            <button class="mode-tab" data-mode="mini">미니</button>`],
    // Chart header
    [`<div class="chart-header">?ㅼ떆媛?6梨꾨꼸 遺꾩꽍</div>`, `          <div class="chart-header">실시간 6채널 분석</div>`],
    // Feed header/placeholder
    [`<div class="feed-header">?ㅼ떆媛✕먮쭑 遺꾩꽍</div>`, `          <div class="feed-header">실시간 자막 분석</div>`],
    [`<div class="feed-placeholder">遺꾩꽍✕?쒖옉?섎㈃ ?먮쭑✕?쒖떆?⑸땲✕..</div>`, `            <div class="feed-placeholder">분석이 시작되면 자막이 표시됩니다...</div>`],
    // Share button
    [`            吏꾩떎✕?뚮젮✕          </button>`, `            진실을 알려라          </button>`],
    // Shot ctrl
    [`<button class="shot-ctrl-btn" id="btn-shot-minus">✕</button>`, `          <button class="shot-ctrl-btn" id="btn-shot-minus">−</button>`],
    [`<button class="shot-ctrl-btn" id="btn-shot-plus">✕</button>`, `          <button class="shot-ctrl-btn" id="btn-shot-plus">+</button>`],
    // Report
    [`<div class="report-title-label">?ъ링 遺꾩꽍 由ы룷✕</div>`, `          <div class="report-title-label">심층 분석 리포트</div>`],
    [`<div class="report-session-id" id="report-session-id">?몄뀡 ?놁쓬</div>`, `          <div class="report-session-id" id="report-session-id">세션 없음</div>`],
    [`<div class="report-empty-msg" id="report-empty-msg">遺꾩꽍✕?ㅽ뻾由ы룷?멸? ?앹꽦?⑸땲✕</div>`, `          <div class="report-empty-msg" id="report-empty-msg">분석을 실행한 후 리포트가 생성됩니다</div>`],
    // Stats
    [`<div class="stat-label">?됯퇏 ?ㅽ듃?덉뒪</div>`, `                <div class="stat-label">평균 스트레스</div>`],
    [`<div class="stat-label">理쒓퀬 ?ㅽ듃?덉뒪</div>`, `                <div class="stat-label">최고 스트레스</div>`],
    [`<div class="stat-label">?덉젙✕</div>`, `                <div class="stat-label">안정성</div>`],
    // Ratio
    [`<span class="ratio-truth-label">吏꾩떎 <span id="rpt-truth-ratio">-</span></span>`, `                <span class="ratio-truth-label">진실 <span id="rpt-truth-ratio">-</span></span>`],
    // Context audit
    [`<div class="report-card-title">臾몃㎘ & 硫뷀✕곗씠✕媛먯궗</div>`, `            <div class="report-card-title">문맥 & 메타데이터 감사</div>`],
    [`<div class="audit-row"><span>?λⅤ</span>`, `            <div class="audit-row"><span>장르</span>`],
    [`<div class="audit-row"><span>?좊ː✕</span>`, `            <div class="audit-row"><span>신뢰도</span>`],
    [`<div class="audit-row"><span>臾닿껐✕吏✕</span>`, `            <div class="audit-row"><span>무결성 지수</span>`],
    [`<div class="verdict-label">醫낇빀 ?먯젙</div>`, `              <div class="verdict-label">종합 판정</div>`],
    // Neural psy
    [`<div class="report-card-title">?좉꼍 & ?щ━ 吏臾?</div>`, `            <div class="report-card-title">신경 & 심리 지문</div>`],
    [`<div class="psy-label">?숈슂✕(TEO)</div>`, `                <div class="psy-label">동요도 (TEO)</div>`],
    [`<div class="psy-label">?몄? 遺✕</div>`, `                <div class="psy-label">인지 부하</div>`],
    [`<div class="psy-label">湲곕쭔 諛✕</div>`, `                <div class="psy-label">기만 밀도</div>`],
    // Deception log
    [`<div class="report-card-title red-title">湲곕쭔 ?대깽✕濡쒓렇 (嫄곗쭞 > 60%)</div>`, `            <div class="report-card-title red-title">기만 이벤트 로그 (거짓 > 60%)</div>`],
    [`<div class="lies-list" id="rpt-lies-list">?먯✕?湲곕쭔 ?놁쓬</div>`, `            <div class="lies-list" id="rpt-lies-list">탐지된 기만 없음</div>`],
    // Data sheet
    [`<div class="report-card-title">?먮쭑 ?곗씠✕?쒗듃</div>`, `            <div class="report-card-title">자막 데이터 시트</div>`],
    [`<th>?쒓컙</th>`, `                    <th>시간</th>`],
    // Report action buttons
    [`<button class="rpt-btn rpt-btn-green" id="btn-export-csv">?뱤 CSV ?대낫?닿린</button>`, `            <button class="rpt-btn rpt-btn-green" id="btn-export-csv">📊 CSV 내보내기</button>`],
    [`<button class="rpt-btn rpt-btn-red" id="btn-share-report">?뱾 由ы룷✕怨듭쑀</button>`, `            <button class="rpt-btn rpt-btn-red" id="btn-share-report">📤 리포트 공유</button>`],
    // History
    [`<div class="history-title">?몄뀡 기록</div>`, `          <div class="history-title">세션 기록</div>`],
    [`<button class="history-clear-btn" id="btn-clear-history">?꾩껜 ✕젣</button>`, `          <button class="history-clear-btn" id="btn-clear-history">전체 삭제</button>`],
    [`<div class="history-empty">??λ맂 ?몄뀡✕?놁뒿?덈떎</div>`, `          <div class="history-empty">저장된 세션이 없습니다</div>`],
    // Settings
    [`<div class="setting-label">?ㅽ겕由곗꺑 ✕(嫄곗쭞 媛먯? ✕</div>`, `        <div class="setting-label">스크린샷 수 (거짓 감지 시)</div>`],
    [`<div class="setting-label">嫄곗쭞 媛먯? ✕?먮룞 ?쒖떆</div>`, `        <div class="setting-label">거짓 감지 시 자동 표시</div>`],
    [`<button class="shot-ctrl-btn" id="set-shot-minus">✕</button>`, `          <button class="shot-ctrl-btn" id="set-shot-minus">−</button>`],
    [`<button class="shot-ctrl-btn" id="set-shot-plus">✕</button>`, `          <button class="shot-ctrl-btn" id="set-shot-plus">+</button>`],
    [`<button class="settings-btn settings-btn-save" id="btn-save-settings">?✕(Save)</button>`, `        <button class="settings-btn settings-btn-save" id="btn-save-settings">저장 (Save)</button>`],
    [`<button class="settings-btn settings-btn-reset" id="btn-reset-settings">珥덇린✕(Reset)</button>`, `        <button class="settings-btn settings-btn-reset" id="btn-reset-settings">초기화 (Reset)</button>`],
    [`<button class="drawer-close-btn" id="btn-close-settings">?リ린</button>`, `      <button class="drawer-close-btn" id="btn-close-settings">닫기</button>`],
    // Truth modal
    [`<div class="truth-modal-sub" id="modal-sub">寃곌낵瑜?湲곌린✕??ν븯嫄곕굹 怨듭쑀?섏꽭✕</div>`, `      <div class="truth-modal-sub" id="modal-sub">결과를 기기에 저장하거나 공유하세요</div>`],
    [`<button class="truth-btn-primary" id="btn-modal-go-report">?뱤 理쒖쥌 由ы룷✕?뺤씤</button>`, `        <button class="truth-btn-primary" id="btn-modal-go-report">📊 최종 리포트 확인</button>`],
    [`<button class="truth-btn-secondary" id="btn-modal-bottom-close">?リ린</button>`, `        <button class="truth-btn-secondary" id="btn-modal-bottom-close">닫기</button>`],
    // PWA
    [`<h3>Th!nc ✕?ㅼ튂?섍린</h3>`, `        <h3>Th!nc 앱 설치하기</h3>`],
    [`<p>✕?붾㈃✕異붽✕섏뿬 ✕鍮좊Ⅴ怨✕몃━?섍쾶 ?ㅽ뻾?섏꽭✕</p>`, `        <p>홈 화면에 추가하여 빠르게 실행하세요!</p>`],
    [`<button id="pwa-btn-dismiss" class="pwa-btn-cancel">?섏쨷✕</button>`, `        <button id="pwa-btn-dismiss" class="pwa-btn-cancel">나중에</button>`],
    [`<button id="pwa-btn-install" class="pwa-btn-install">?ㅼ튂</button>`, `        <button id="pwa-btn-install" class="pwa-btn-install">설치</button>`],
    // iOS PWA
    [`<p>✕?붾㈃✕?ㅼ튂?섎젮硫✕섎떒✕<strong>怨듭쑀</strong> ?꾩씠肄섏쓣 ?꾨Ⅴ怨?br><strong>'✕?붾㈃✕異붽?'</strong>瑜✕좏깮?섏꽭✕</p>`, `      <p>홈 화면에 설치하려면 하단의 <strong>공유</strong> 아이콘을 누르고<br><strong>'홈 화면에 추가'</strong>를 선택하세요</p>`],
    // AI warning
    [`<div class="ai-warn-icon">?슟</div>`, `    <div class="ai-warn-icon">⚠️</div>`],
    [`<div class="ai-warn-title">AI ?⑹꽦 ?뚯꽦 媛먯✕?</div>`, `    <div class="ai-warn-title">AI 합성 음성 감지됨</div>`],
    [`<div class="ai-warn-sub">遺꾩꽍 遺덇?: ?⑹꽦✕紐⑹냼由ш? 媛먯✕섏뿀?듬땲✕</div>`, `    <div class="ai-warn-sub">분석 불가: 합성된 목소리가 감지되었습니다.</div>`],
    // Social share modal
    [`<div class="social-modal-title">AI 遺꾩꽍 寃곌낵 ?뚯뀥 怨듭쑀 ??쒕낫✕</div>`, `      <div class="social-modal-title">AI 분석 결과 소셜 공유</div>`],
    [`<div class="social-modal-sub">?먮룞 罹≪쿂✕?대?吏瑜✕뺤씤?섍퀬, ?낅줈?쒗븷 ?뚯뀥 誘몃뵒?대? ?좏깮?섏꽭✕</div>`, `      <div class="social-modal-sub">자동 저장된 스크린샷을 확인하고, 원하는 소셜 미디어에 공유하세요</div>`],
    [`            罹≪쿂 ?곸뿭 誘몃━蹂닿린 `, `            스크린샷 미리보기 `],
    [`<span class="save-status-badge">?뮶 ?대?吏 濡쒖뺄 ?✕?꾨즺</span>`, `            <span class="save-status-badge">저장 완료</span>`],
    [`<div class="channel-select-label">?낅줈?쒗븷 SNS 留ㅼ껜 ?좏깮 (?ㅼ쨷 ?좏깮 媛✕</div>`, `          <div class="channel-select-label">원하는 SNS 채널 선택 (복수 선택 가능)</div>`],
    // Comments in widget section
    [`* "?ъ뒪✕?쒖옉"✕?대┃?섎㈃ ?좏깮✕留ㅼ껜蹂✕ъ뒪✕?꾩젽✕李⑤✕濡✕대━硫✕ъ뒪?멸? ?쒖감?곸쑝濡✕꾩꽦 諛✕꾩넚?⑸땲✕`, `   * "세션 시작" 버튼을 클릭하면 새창/팝업에서 로드된 화면의 스트림이 스피커를 통해 녹음됩니다.`],
    [`✕ ?좏깮✕留ㅼ껜濡✕쒖감 ?ъ뒪✕?쒖옉`, `     새창/팝업에서 세션 시작`],
    // Widget
    [`<label for="widget-share-text" id="lbl-widget-share-text">?먮룞 ?꾩꽦✕?ъ뒪✕蹂몃Ц (?섏젙 媛✕</label>`, `        <label for="widget-share-text" id="lbl-widget-share-text">자동 생성 게시글 (직접 수정 가능)</label>`],
    [`<button class="widget-publish-btn" id="btn-widget-publish">✕ ?ъ뒪✕寃뚯떆?섍린 (Publish)</button>`, `        <button class="widget-publish-btn" id="btn-widget-publish">📤 게시글 발행 (Publish)</button>`],
    [`<span class="progress-status" id="widget-status-text">?낅줈✕?湲?以?..</span>`, `          <span class="progress-status" id="widget-status-text">로딩 대기 중..</span>`],
    // Comment separators
    [`    <!-- ???????????????????????????????????????? -->`, `    <!-- ============================================ -->`],
    [`    <!-- ???????????????????????????????????????? -->`, `    <!-- ============================================ -->`],
    [`    <!-- ?? TOP NAVIGATION BAR ?? -->`, `    <!-- ===== TOP NAVIGATION BAR ===== -->`],
    [`    <!-- ?? BOTTOM TAB BAR ?? -->`, `    <!-- ===== BOTTOM TAB BAR ===== -->`],
    // Desktop only variants
    [`<button class="yt-back-btn hidden" id="btn-yt-back">⬅ 목록으로 돌아가기</button>`, `        <button class="yt-back-btn hidden" id="btn-yt-back">⬅ 목록으로 돌아가기</button>`],
  ];

  let count = 0;
  for (let i = 0; i < lines.length; i++) {
    for (const [search, replace] of lineReplacements) {
      if (lines[i].includes(search)) {
        lines[i] = replace;
        count++;
        break;
      }
    }
  }

  fs.writeFileSync(path, lines.join('\n'), 'utf8');
  console.log(`[${path}] ${count}개 라인 수정됨`);
}

fixHtmlFile('e:/vivpr/ai/lie/webapp/mobile.html');
fixHtmlFile('e:/vivpr/ai/lie/webapp/desktop.html');
console.log('완료!');
