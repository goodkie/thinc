/**
 * TruthPulse Popup Script
 */

document.addEventListener('DOMContentLoaded', () => {
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  const resultCard = document.getElementById('analysis-result');
  const uploadSection = document.getElementById('section-upload');
  const historySection = document.getElementById('section-history');
  const settingsSection = document.getElementById('section-settings');
  const tabUpload = document.getElementById('tab-upload');
  const tabHistory = document.getElementById('tab-history');
  const tabSettings = document.getElementById('tab-settings');

  // Tab Switching
  function switchTab(activeTab, activeSection) {
    [tabUpload, tabHistory, tabSettings].forEach(t => t.classList.remove('active'));
    [uploadSection, historySection, settingsSection].forEach(s => s.classList.add('hidden'));
    activeTab.classList.add('active');
    activeSection.classList.remove('hidden');
  }

  tabUpload.addEventListener('click', () => switchTab(tabUpload, uploadSection));
  tabHistory.addEventListener('click', () => switchTab(tabHistory, historySection));
  tabSettings.addEventListener('click', () => switchTab(tabSettings, settingsSection));

  // Settings Logic
  const sensSlider = document.getElementById('sens-slider');
  const sensValue = document.getElementById('sens-value');
  const modeSelect = document.getElementById('mode-select');
  const langSelect = document.getElementById('lang-select');
  const shotsSlider = document.getElementById('shots-slider');
  const shotsValue = document.getElementById('shots-value');

  chrome.storage.local.get(['sensitivity', 'viewMode', 'lang'], (data) => {
    sensSlider.value = data.sensitivity || 5;
    sensValue.innerText = data.sensitivity || 5;
    
    // Set active state for Mode
    const savedMode = data.viewMode || 'visual';
    const modeBtns = document.querySelectorAll('#mode-select .segment-btn');
    modeBtns.forEach(btn => {
      if(btn.dataset.value === savedMode) btn.classList.add('active');
    });

    // Set active state for Lang
    const savedLang = data.lang || 'en';
    const langBtns = document.querySelectorAll('#lang-select .lang-chip');
    langBtns.forEach(btn => {
      if(btn.dataset.value === savedLang) btn.classList.add('active');
    });

    const savedShots = data.screenshotCount || 3;
    shotsSlider.value = savedShots;
    shotsValue.innerText = savedShots;
  });

  sensSlider.addEventListener('input', (e) => {
    const val = e.target.value;
    sensValue.innerText = val;
    chrome.storage.local.set({ sensitivity: parseInt(val) });
  });

  shotsSlider.addEventListener('input', (e) => {
    const val = e.target.value;
    shotsValue.innerText = val;
    chrome.storage.local.set({ screenshotCount: parseInt(val) });
  });

  document.querySelectorAll('#mode-select .segment-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('#mode-select .segment-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      chrome.storage.local.set({ viewMode: e.target.dataset.value });
    });
  });

  document.querySelectorAll('#lang-select .lang-chip').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('#lang-select .lang-chip').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      chrome.storage.local.set({ lang: e.target.dataset.value });
    });
  });

  // File Upload Logic
  dropZone.addEventListener('click', () => fileInput.click());

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = '#00f2fe';
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.style.borderColor = 'rgba(255, 255, 255, 0.1)';
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files.length > 0) handleFile(files[0]);
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) handleFile(e.target.files[0]);
  });

  async function handleFile(file) {
    if (!file.type.startsWith('audio/')) {
      alert('Please upload an audio file.');
      return;
    }

    dropZone.classList.add('hidden');
    resultCard.classList.remove('hidden');
    
    // UI Loading state
    document.getElementById('result-prob').innerText = '...';
    
    const arrayBuffer = await file.arrayBuffer();
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    
    const analyzer = new VoiceStressAnalyzer(audioCtx);
    const result = await analyzer.analyzeBuffer(audioBuffer);
    
    displayResult(result);
    saveToHistory(file.name, result);
  }

  function displayResult(result) {
    const probText = document.getElementById('result-prob');
    const gaugeFill = document.getElementById('gauge-fill');
    const stressVal = document.getElementById('res-stress');
    const confVal = document.getElementById('res-conf');

    const prob = result.probability;
    probText.innerText = `${prob}%`;
    
    // Update gauge (circumference is 283)
    const offset = 283 - (283 * prob) / 100;
    gaugeFill.style.strokeDashoffset = offset;
    
    // Color coding
    if (prob > 70) gaugeFill.style.stroke = '#ff416c';
    else if (prob > 40) gaugeFill.style.stroke = '#f7971e';
    else gaugeFill.style.stroke = '#00f2fe';

    stressVal.innerText = prob > 70 ? 'CRITICAL' : prob > 40 ? 'ELEVATED' : 'STABLE';
    confVal.innerText = `${result.confidence}%`;
  }

  function saveToHistory(filename, result) {
    chrome.storage.local.get(['history'], (data) => {
      const history = data.history || [];
      history.unshift({
        filename,
        probability: result.probability,
        date: new Date().toLocaleDateString(),
        id: Date.now()
      });
      chrome.storage.local.set({ history: history.slice(0, 10) });
      renderHistory();
    });
  }

  function renderHistory() {
    const historyList = document.getElementById('history-list');
    chrome.storage.local.get(['history'], (data) => {
      const history = data.history || [];
      if (history.length === 0) return;
      
      historyList.innerHTML = history.map(item => `
        <div class="history-item" style="background: rgba(255,255,255,0.03); padding: 12px; border-radius: 12px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <div style="font-size: 12px; font-weight: 600;">${item.filename}</div>
            <div style="font-size: 10px; color: rgba(255,255,255,0.4);">${item.date}</div>
          </div>
          <div style="color: ${item.probability > 70 ? '#ff416c' : '#00f2fe'}; font-weight: 800;">${item.probability}%</div>
        </div>
      `).join('');
    });
  }

  renderHistory();
});
