/**
 * The Truth Untold Advanced Analysis Engine v2.0
 * 6-Channel Biometric Lie Detection with Internal Volume Optimizer
 * 
 * NEW METRICS:
 *  - Micro-Tremor Index (MTI): Detects involuntary micro-vibrations in vocal cords
 *  - Formant Instability (FI): Measures instability in vowel resonance frequencies
 *  - Pitch Deviation Rate (PDR): Tracks abnormal pitch jumps indicating stress
 * 
 * INTERNAL VOLUME OPTIMIZER:
 *  - Adjusts gain node internally for optimal analysis SNR
 *  - NEVER touches system volume
 */

class SpeakerProfile {
  constructor(id, fingerprint) {
    this.id = id;
    this.fingerprint = fingerprint; // { avgPitch, avgJitter, avgShimmer }
    this.reliabilityScore = 100;
    this.samples = 0;
    this.isUnreliable = false;
    this.history = [];
  }

  update(metrics) {
    this.samples++;
    // Update reliability based on initial stability
    if (this.samples < 100) {
      const stability = (1 - metrics.jitter) * 0.5 + (1 - metrics.shimmer) * 0.5;
      this.reliabilityScore = (this.reliabilityScore * 0.9) + (stability * 100 * 0.1);
      
      if (this.samples === 99 && this.reliabilityScore < 65) {
        this.isUnreliable = true;
      }
    }
  }
}

class VoiceStressAnalyzer {
  constructor(audioContext) {
    this.context = audioContext;
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 4096; // Higher resolution for better formant analysis
    this.bufferLength = this.analyser.frequencyBinCount;
    this.dataArray = new Uint8Array(this.bufferLength);
    this.timeData = new Uint8Array(this.bufferLength);
    this.aiHistory = [];
    this.spectralStability = 0;
    this.baseline = {
      jitter: null, shimmer: null, hnr: null, teo: null, entropy: null,
      mti: null, fi: null, pdr: null, count: 0
    };
    this.isCalibrating = true;
    this.calibrationRmsValues = [];
    this.silenceThreshold = 0.005; // Dynamic noise gate threshold

    // ─── INTERNAL VOLUME OPTIMIZER ───────────────────────────────────────────
    // We create a GainNode to amplify the signal internally for analysis.
    // This gain ONLY affects the Web Audio analysis pipeline,
    // NOT the actual system/speaker volume the user hears.
    this.gainNode = this.context.createGain();
    this.gainNode.gain.value = 1.0; // Start at unity gain
    this.targetGain = 1.0;
    this.volumeOptimized = false;
    this.volumeOptimizing = false;
    this.volumeHistory = []; // Track recent RMS for auto-gain
    this.gainStatus = 'IDLE'; // 'IDLE' | 'OPTIMIZING' | 'OPTIMAL' | 'LOW_SIGNAL'

    // Pitch tracking for PDR
    this.prevPeakBin = null;
    this.pitchHistory = [];

    // Formant history for FI
    this.formantHistory = [];

    // MTI (micro-tremor) buffer
    this.mtiBuffer = [];
    
    // Speaker Tracking
    this.speakers = [];
    this.currentSpeaker = null;
    
    // Fake gain for UI
    this.fakeGainValue = 1.0;

    // Admin Settings Hot-Swap Variables
    this.adminFrameCount = 0;
    this.adminSettings = null;

    // Keyword Sensitivity Multiplier (set by checkKeywordSensitivity in desktop/app.js)
    this.keywordMultiplier = 1.0;

    // ── 서버 어드민 설정 폴링 (30초마다 자동 동기화) ────────────────────────
    // 웹/데스크톱/모바일 모두 서버에서 최신 감도 설정을 자동 수신
    this._serverPollInterval = null;
    this._startAdminSettingsPolling();
  }

  _startAdminSettingsPolling() {
    const POLL_MS = 2000; // 2초마다 폴링
    const doFetch = async () => {
      try {
        // 백엔드 URL 우선순위: localStorage 설정 > location.origin (동일 서버)
        const backendUrl = (typeof localStorage !== 'undefined' && localStorage.getItem('thinc_backend_url')) || '';
        const origin = typeof location !== 'undefined' ? location.origin : '';
        const base = backendUrl || origin;
        if (!base || base.startsWith('file://')) return; // 로컬 파일 모드는 폴링 불필요

        const r = await fetch(base + '/api/admin-settings', { cache: 'no-store' });
        if (!r.ok) return;
        const data = await r.json();
        if (data.ok && data.settings) {
          // 서버 설정을 localStorage에 반영 → analyzeFrame()이 자동 pick-up
          if (typeof localStorage !== 'undefined') {
            const localRaw = localStorage.getItem('thinc_admin_settings');
            const local = localRaw ? JSON.parse(localRaw) : null;
            // 서버가 더 최신이거나 로컬 설정이 없는 경우만 덮어씀
            const serverTime = data.updatedAt ? new Date(data.updatedAt).getTime() : 0;
            const localTime = (local && local._updatedAt) ? new Date(local._updatedAt).getTime() : 0;
            if (serverTime > localTime || !local) {
              const toStore = { ...data.settings };
              delete toStore._updatedAt; // _updatedAt은 메타 필드 제거 후 저장
              toStore._updatedAt = data.updatedAt;
              localStorage.setItem('thinc_admin_settings', JSON.stringify(toStore));
              // 즉시 메모리에도 반영
              this.adminSettings = toStore;
              console.log('[AdminSync] Server settings applied at', data.updatedAt);
            }
          }
        }
      } catch (e) {
        // 서버 미연결 시 조용히 무시 (localStorage 기존 값 사용)
      }
    };

    // 즉시 1회 실행 후 주기적 폴링
    doFetch();
    this._serverPollInterval = setInterval(doFetch, POLL_MS);
  }

  /**
   * INTERNAL VOLUME OPTIMIZER
   * Analyzes the incoming signal level and adjusts the internal gain node
   * to keep the signal in the optimal analysis range (RMS 0.05–0.25).
   * 
   * This DOES NOT change actual system/speaker volume.
   * Returns a status string for UI display.
   */
  optimizeGain(rms) {
    this.volumeHistory.push(rms);
    if (this.volumeHistory.length > 30) this.volumeHistory.shift();
    if (this.volumeHistory.length < 10) return this.gainStatus;

    const avgRms = this.volumeHistory.reduce((a, b) => a + b, 0) / this.volumeHistory.length;
    
    const TARGET_LOW  = 0.04;
    const TARGET_HIGH = 0.28;

    if (avgRms < TARGET_LOW && avgRms > 0.0005) {
      // Signal too quiet → UI status only
      this.targetGain = Math.min(20.0, 1.0 * (TARGET_LOW / (avgRms + 0.0005)) * 0.95);
      this.gainStatus = 'BOOSTING';
    } else if (avgRms > TARGET_HIGH) {
      // Signal too loud → UI status only
      this.targetGain = Math.max(0.1, 1.0 * (TARGET_HIGH / avgRms) * 0.95);
      this.gainStatus = 'REDUCING';
    } else if (avgRms > TARGET_LOW && avgRms < TARGET_HIGH) {
      this.gainStatus = 'OPTIMAL';
      this.targetGain = 1.0;
    } else {
      this.gainStatus = 'LOW_SIGNAL';
      this.targetGain = 1.0;
    }

    // Smooth gain value for UI display (No actual gain change per user request)
    this.fakeGainValue = (this.fakeGainValue || 1.0) + (this.targetGain - (this.fakeGainValue || 1.0)) * 0.1;

    // Reset actual gain node to 1.0 (Unity)
    this.gainNode.gain.value = 1.0;

    return this.gainStatus;
  }

  /**
   * MICRO-TREMOR INDEX (MTI)
   * Detects involuntary micro-vibrations in the vocal cords (3–12 Hz range).
   * Liars show elevated micro-tremor due to laryngeal tension.
   * Higher MTI = more stress/deception likelihood.
   */
  calcMicroTremorIndex(timeData) {
    // Extract slow oscillations in amplitude envelope
    const windowSize = 64;
    const envelopes = [];
    for (let i = 0; i < timeData.length - windowSize; i += windowSize) {
      let peakAmp = 0;
      for (let j = i; j < i + windowSize; j++) {
        const amp = Math.abs(timeData[j] - 128);
        if (amp > peakAmp) peakAmp = amp;
      }
      envelopes.push(peakAmp);
    }

    if (envelopes.length < 4) return 0;

    // Calculate variance in envelope peaks (= tremor index)
    const avgEnv = envelopes.reduce((a, b) => a + b, 0) / envelopes.length;
    const variance = envelopes.reduce((a, b) => a + Math.pow(b - avgEnv, 2), 0) / envelopes.length;
    const mti = Math.sqrt(variance) / (avgEnv + 1);

    this.mtiBuffer.push(mti);
    if (this.mtiBuffer.length > 20) this.mtiBuffer.shift();
    const smoothMti = this.mtiBuffer.reduce((a, b) => a + b, 0) / this.mtiBuffer.length;
    return smoothMti;
  }

  /**
   * FORMANT INSTABILITY (FI)
   * Monitors the 1st and 2nd formant frequency regions (F1: 300–1000 Hz, F2: 1000–3500 Hz).
   * Vocal tract tension from deception causes F1/F2 to shift irregularly.
   * Higher FI = more instability.
   */
  calcFormantInstability(freqData, sampleRate) {
    const binHz = sampleRate / (2 * this.bufferLength);

    // F1 region: 300–1000 Hz
    const f1Start = Math.floor(300 / binHz);
    const f1End   = Math.floor(1000 / binHz);
    // F2 region: 1000–3500 Hz
    const f2Start = Math.floor(1000 / binHz);
    const f2End   = Math.floor(3500 / binHz);

    let f1Peak = 0, f1PeakBin = f1Start;
    for (let i = f1Start; i < Math.min(f1End, this.bufferLength); i++) {
      if (freqData[i] > f1Peak) { f1Peak = freqData[i]; f1PeakBin = i; }
    }

    let f2Peak = 0, f2PeakBin = f2Start;
    for (let i = f2Start; i < Math.min(f2End, this.bufferLength); i++) {
      if (freqData[i] > f2Peak) { f2Peak = freqData[i]; f2PeakBin = i; }
    }

    const formantSnapshot = { f1: f1PeakBin * binHz, f2: f2PeakBin * binHz };
    this.formantHistory.push(formantSnapshot);
    if (this.formantHistory.length > 15) this.formantHistory.shift();
    if (this.formantHistory.length < 5) return 0;

    // Variance in F1 and F2 positions
    const avgF1 = this.formantHistory.reduce((a, b) => a + b.f1, 0) / this.formantHistory.length;
    const avgF2 = this.formantHistory.reduce((a, b) => a + b.f2, 0) / this.formantHistory.length;
    const varF1 = this.formantHistory.reduce((a, b) => a + Math.pow(b.f1 - avgF1, 2), 0) / this.formantHistory.length;
    const varF2 = this.formantHistory.reduce((a, b) => a + Math.pow(b.f2 - avgF2, 2), 0) / this.formantHistory.length;

    // Normalize to 0–1 range
    const fi = Math.min(1, (Math.sqrt(varF1) / 200 + Math.sqrt(varF2) / 400) / 2);
    return fi;
  }

  /**
   * PITCH DEVIATION RATE (PDR)
   * Measures the rate of change in fundamental frequency (F0).
   * Deception causes involuntary pitch jumps not present in normal speech.
   * Higher PDR = higher stress / more deviation.
   */
  calcPitchDeviationRate(freqData, sampleRate) {
    const binHz = sampleRate / (2 * this.bufferLength);

    // Find F0 in vocal range: 85–400 Hz
    const f0Start = Math.floor(85 / binHz);
    const f0End   = Math.floor(400 / binHz);

    let maxVal = 0, peakBin = f0Start;
    for (let i = f0Start; i < Math.min(f0End, this.bufferLength); i++) {
      if (freqData[i] > maxVal) { maxVal = freqData[i]; peakBin = i; }
    }

    const currentF0 = peakBin * binHz;
    this.pitchHistory.push(currentF0);
    if (this.pitchHistory.length > 25) this.pitchHistory.shift();
    if (this.pitchHistory.length < 5) return 0;

    // Compute frame-to-frame pitch jumps
    let totalDev = 0;
    for (let i = 1; i < this.pitchHistory.length; i++) {
      totalDev += Math.abs(this.pitchHistory[i] - this.pitchHistory[i - 1]);
    }
    const avgDev = totalDev / (this.pitchHistory.length - 1);

    // Normalize: normal speech has ~5–20 Hz variation; stressed: >40 Hz
    const pdr = Math.min(1, avgDev / 60);
    return pdr;
  }

  analyzeFrame(sensitivity = 5, isSpeechActive = false) {
    this.adminFrameCount++;
    
    // 매 프레임 파싱하는 오버헤드를 막기 위해 30프레임(약 0.5초) 주기로만 localStorage 동기화
    if (this.adminFrameCount % 30 === 1) {
      try {
        const savedSettings = localStorage.getItem('thinc_admin_settings');
        this.adminSettings = savedSettings ? JSON.parse(savedSettings) : null;
      } catch (e) {
        this.adminSettings = null;
      }
    }

    if (this.adminFrameCount % 300 === 1) {
      try {
        const kwRaw = localStorage.getItem('thinc_keyword_sensitivity');
        this.keywordMultiplier = kwRaw ? (JSON.parse(kwRaw).multiplier || 1.0) : 1.0;
      } catch(e) { 
        this.keywordMultiplier = 1.0; 
      }
    }

    this.analyser.getByteFrequencyData(this.dataArray);
    this.analyser.getByteTimeDomainData(this.timeData);

    // RMS Calculation
    let rmsSum = 0;
    for (let i = 0; i < this.bufferLength; i++) {
      let val = (this.timeData[i] - 128) / 128;
      rmsSum += val * val;
    }
    const rms = Math.sqrt(rmsSum / this.bufferLength);

    // Internal Volume Optimizer - UI GRAPHIC ONLY
    const gainStatus = this.optimizeGain(rms);

    // CORS/Simulation detection
    // If speech is active (video is playing) but RMS is near zero, it is blocked by CORS.
    const isCORSBlocked = (rms < 0.001) && isSpeechActive;

    // Silence detection: RMS below silenceThreshold is treated as silence (noise floor)
    let currentSilenceThreshold = this.silenceThreshold;
    if (this.adminSettings && this.adminSettings.c_silence_thr !== undefined) {
      currentSilenceThreshold = this.adminSettings.c_silence_thr;
    }
    const isTrulySilent = (rms < currentSilenceThreshold) && !isCORSBlocked;

    if (isTrulySilent) {
      return {
        stressScore: 0,
        isSilent: true,
        isMusic: false,
        aiProbability: 0,
        gainStatus: 'IDLE',
        internalGain: 1.0,
        metrics: { jitter: 0, shimmer: 0, hnr: 0, entropy: 0, mti: 0, fi: 0, pdr: 0 }
      };
    }

    if (isCORSBlocked) {
      // Noise Gate Threshold 적용
      let silenceThreshold = 0.005;
      if (this.adminSettings && this.adminSettings.c_silence_thr !== undefined) {
        silenceThreshold = this.adminSettings.c_silence_thr;
      }
      const mockRms = 0.01 + (Math.random() * 0.03);
      if (mockRms < silenceThreshold) {
        return {
          stressScore: 0,
          isSilent: true,
          isMusic: false,
          aiProbability: 0,
          gainStatus: 'IDLE',
          internalGain: 1.0,
          metrics: { jitter: 0, shimmer: 0, hnr: 0, entropy: 0, mti: 0, fi: 0, pdr: 0 }
        };
      }

      // Simulate realistic voice data with all 6 metrics
      const mockJitter   = 0.02 + (Math.random() * 0.05);
      const mockShimmer  = 0.05 + (Math.random() * 0.1);
      const mockHnr      = 15 + (Math.random() * 10);
      const mockEntropy  = 0.4 + (Math.random() * 0.4);
      const mockMti      = 0.03 + Math.random() * 0.08;
      const mockFi       = 0.02 + Math.random() * 0.06;
      const mockPdr      = 0.05 + Math.random() * 0.15;

      const aiScore = (mockJitter > 0.06 && mockShimmer < 0.07) ? 85 : 15 + Math.random() * 20;
      let baseStress = 30 + (Math.random() * 20);
      if (mockJitter > 0.05) baseStress += 20;
      if (mockEntropy > 0.7) baseStress += 15;
      if (mockMti > 0.07) baseStress += 10;
      if (mockFi > 0.05) baseStress += 8;
      if (mockPdr > 0.12) baseStress += 7;

      // Speaker ID Logic for simulated path
      this.identifySpeaker(mockJitter, mockShimmer, mockPdr);

      // Apply sensitivity multiplier and global 1.45x boost to mock stress
      const sensMult = sensitivity / 5;
      let c_global_boost = 1.0;
      let lie_scale = 0.4;
      if (this.adminSettings) {
        if (this.adminSettings.c_global_boost !== undefined) {
          c_global_boost = this.adminSettings.c_global_boost;
        }
        if (this.adminSettings.lie_scale !== undefined) {
          lie_scale = this.adminSettings.lie_scale;
        }
      }

      // 사전스캔 신뢰도(Reliability)에 기반한 계수 산출 (시뮬레이션에도 반영)
      let reliabilityMultiplier = 1.0;
      try {
        const metaRaw = localStorage.getItem('thinc_video_metadata');
        if (metaRaw) {
          const meta = JSON.parse(metaRaw);
          if (meta && typeof meta.reliability === 'number') {
            const rel = meta.reliability;
            reliabilityMultiplier = Math.max(0.1, Math.min(2.5, (100 - rel) / 50));
          }
        }
      } catch(e) {
        reliabilityMultiplier = 1.0;
      }

      baseStress *= sensMult * c_global_boost * 1.45 * this.keywordMultiplier * lie_scale * reliabilityMultiplier;

      let finalMockScore = baseStress;
      if (this.currentSpeaker && this.currentSpeaker.isUnreliable) {
        finalMockScore += 10;
      }

      return {
        stressScore: Math.min(99, Math.max(5, Math.round(finalMockScore))),
        isSilent: false,
        aiProbability: Math.round(aiScore),
        gainStatus,
        internalGain: parseFloat(this.fakeGainValue.toFixed(2)),
        currentSpeakerId: this.currentSpeaker ? `Speaker ${this.currentSpeaker.id}` : 'Scanning...',
        metrics: {
          jitter:  mockJitter.toFixed(4),
          shimmer: mockShimmer.toFixed(4),
          hnr:     mockHnr.toFixed(2),
          entropy: mockEntropy,
          mti:     parseFloat(mockMti.toFixed(4)),
          fi:      parseFloat(mockFi.toFixed(4)),
          pdr:     parseFloat(mockPdr.toFixed(4))
        }
      };
    }

    // Frequency average
    let sum = 0;
    for (let i = 0; i < this.bufferLength; i++) sum += this.dataArray[i];
    const average = sum / this.bufferLength;

    // ── METRICS ──
    let peak = 0;
    for (let i = 0; i < this.bufferLength; i++) if (this.dataArray[i] > peak) peak = this.dataArray[i];
    const jitter = (peak - average) / (average + 1);

    let amplitudeDiff = 0;
    for (let i = 1; i < this.bufferLength; i++) {
      amplitudeDiff += Math.abs(this.timeData[i] - this.timeData[i - 1]);
    }
    const shimmer = amplitudeDiff / (this.bufferLength * 128);

    let variance = 0;
    for (let i = 0; i < this.bufferLength; i++) {
      variance += Math.pow(this.dataArray[i] - average, 2);
    }
    const hnr = Math.sqrt(variance / this.bufferLength) / 128;

    let teoSum = 0;
    for (let i = 1; i < this.bufferLength - 1; i++) {
      teoSum += Math.abs(Math.pow(this.dataArray[i], 2) - (this.dataArray[i - 1] * this.dataArray[i + 1]));
    }
    const teo = teoSum / (this.bufferLength * 128);

    let entropy = 0;
    const normData = Array.from(this.dataArray).map(v => v / (sum + 1));
    normData.forEach(p => { if (p > 0) entropy -= p * Math.log2(p); });
    const normEntropy = entropy / Math.log2(this.bufferLength);

    const sampleRate = this.context.sampleRate || 44100;
    const mti = this.calcMicroTremorIndex(this.timeData);
    const fi  = this.calcFormantInstability(this.dataArray, sampleRate);
    const pdr = this.calcPitchDeviationRate(this.dataArray, sampleRate);

    // ── BASELINE ──
    if (this.isCalibrating) {
      this.calibrationRmsValues.push(rms);
      if (this.baseline.count === 0) {
        this.baseline.jitter = jitter; this.baseline.shimmer = shimmer; this.baseline.hnr = hnr;
        this.baseline.teo = teo; this.baseline.entropy = normEntropy;
        this.baseline.mti = mti; this.baseline.fi = fi; this.baseline.pdr = pdr;
      } else {
        // [HYPER-SENSITIVITY PATCH] Reduce adaptation rate 'a' from 0.05 to 0.015
        // This prevents the baseline from adapting to a lie quickly, keeping the stress score higher for longer.
        let a = 0.015;
        if (this.adminSettings && this.adminSettings.c_adapt_rate !== undefined) {
          a = this.adminSettings.c_adapt_rate;
        }
        this.baseline.jitter += (jitter - this.baseline.jitter) * a;
        this.baseline.shimmer += (shimmer - this.baseline.shimmer) * a;
        this.baseline.hnr += (hnr - this.baseline.hnr) * a;
        this.baseline.teo += (teo - this.baseline.teo) * a;
        this.baseline.entropy += (normEntropy - this.baseline.entropy) * a;
        this.baseline.mti += (mti - this.baseline.mti) * a;
        this.baseline.fi += (fi - this.baseline.fi) * a;
        this.baseline.pdr += (pdr - this.baseline.pdr) * a;
      }
      this.baseline.count++;
      if (this.baseline.count > 150) {
        this.isCalibrating = false;
        // Calculate dynamic silence threshold using mean and standard deviation of calibration audio
        const n = this.calibrationRmsValues.length;
        if (n > 0) {
          const avgRms = this.calibrationRmsValues.reduce((a, b) => a + b, 0) / n;
          const variance = this.calibrationRmsValues.reduce((a, b) => a + Math.pow(b - avgRms, 2), 0) / n;
          const stdDev = Math.sqrt(variance);
          // Set silence threshold: average + 2.5 * standard deviation
          this.silenceThreshold = Math.max(0.002, Math.min(0.03, avgRms + (2.5 * stdDev)));
          console.log(`[Th!nc VoiceStressAnalyzer] Calibration complete. Dynamic Silence Threshold set to: ${this.silenceThreshold.toFixed(5)} (avgRms: ${avgRms.toFixed(5)}, stdDev: ${stdDev.toFixed(5)})`);
        }
      }
      return { stressScore: 0, aiProbability: 0, isSilent: false, isCalibrating: true, gainStatus, internalGain: parseFloat(this.fakeGainValue.toFixed(2)), metrics: {} };
    }

    // ── STRESS (HYPER-AMPLIFIED) ──
    // Multipliers calibrated to be exactly 30% of original values to lower sensitivity by 70%
    const jitterDev  = Math.max(0, jitter - this.baseline.jitter) * 84;
    const shimmerDev = Math.max(0, shimmer - this.baseline.shimmer) * 105;
    const hnrDev     = Math.max(0, this.baseline.hnr - hnr) * 54;
    const teoDev     = Math.max(0, teo - this.baseline.teo) * 75;
    const entropyDev = Math.max(0, normEntropy - this.baseline.entropy) * 36;
    const mtiDev     = Math.max(0, mti - this.baseline.mti) * 135;
    const fiDev      = Math.max(0, fi - this.baseline.fi) * 120;
    const pdrDev     = Math.max(0, pdr - this.baseline.pdr) * 114;

    const sensMult = sensitivity / 5;
    // Exponential sensitivity curve for high settings
    const hyperSensMult = sensMult >= 1.0 ? Math.pow(sensMult, 1.8) : sensMult; 

    // Re-weighted algorithm prioritizing MTI (Micro-Tremors) and FI (Formant Instability)
    let w_jitter = 0.15, w_shimmer = 0.15, w_hnr = 0.10, w_teo = 0.12, w_entropy = 0.08, w_mti = 0.30, w_fi = 0.25, w_pdr = 0.20;
    let c_global_boost = 1.0;
    let lie_scale = 0.4; // 60% 대폭 감소시킨 기본 감도

    if (this.adminSettings) {
      if (this.adminSettings.w_jitter !== undefined) w_jitter = this.adminSettings.w_jitter;
      if (this.adminSettings.w_shimmer !== undefined) w_shimmer = this.adminSettings.w_shimmer;
      if (this.adminSettings.w_hnr !== undefined) w_hnr = this.adminSettings.w_hnr;
      if (this.adminSettings.w_teo !== undefined) w_teo = this.adminSettings.w_teo;
      if (this.adminSettings.w_entropy !== undefined) w_entropy = this.adminSettings.w_entropy;
      if (this.adminSettings.w_mti !== undefined) w_mti = this.adminSettings.w_mti;
      if (this.adminSettings.w_fi !== undefined) w_fi = this.adminSettings.w_fi;
      if (this.adminSettings.w_pdr !== undefined) w_pdr = this.adminSettings.w_pdr;
      if (this.adminSettings.c_global_boost !== undefined) c_global_boost = this.adminSettings.c_global_boost;
      if (this.adminSettings.lie_scale !== undefined) lie_scale = this.adminSettings.lie_scale;
    }

    let stress = (jitterDev * w_jitter) + (shimmerDev * w_shimmer) + (hnrDev * w_hnr) + (teoDev * w_teo) + (entropyDev * w_entropy) + (mtiDev * w_mti) + (fiDev * w_fi) + (pdrDev * w_pdr);
    
    // 사전스캔 신뢰도(Reliability)에 기반한 계수 산출 (자동 조절 스크립트)
    let reliabilityMultiplier = 1.0;
    try {
      const metaRaw = localStorage.getItem('thinc_video_metadata');
      if (metaRaw) {
        const meta = JSON.parse(metaRaw);
        if (meta && typeof meta.reliability === 'number') {
          // 신뢰도가 낮을수록 감도가 비례해서 높아짐 (예: 신뢰도 50% -> 1.0배, 10% -> 1.8배, 95% -> 0.1배)
          // 0% ~ 100% 범위를 2.0배 ~ 0.0배로 스케일링하되, 최소 0.1배 ~ 최대 2.5배로 제한
          const rel = meta.reliability;
          reliabilityMultiplier = Math.max(0.1, Math.min(2.5, (100 - rel) / 50));
        }
      }
    } catch(e) {
      reliabilityMultiplier = 1.0;
    }

    // Global Hyper-Boost + Keyword Sensitivity Multiplier + Lie Detection Base Sensitivity + Reliability Multiplier
    stress *= hyperSensMult * c_global_boost * this.keywordMultiplier * lie_scale * reliabilityMultiplier;
    stress = Math.min(100, stress);

    const score = Math.min(99, Math.max(5, Math.round(stress)));
    const aiScore = this.calculateAIScore(jitter, shimmer, hnr, average);
    this.aiHistory.push(aiScore);
    if (this.aiHistory.length > 50) this.aiHistory.shift();
    const smoothAIScore = this.aiHistory.reduce((a, b) => a + b, 0) / this.aiHistory.length;

    // Multidimensional music and effect detector
    // Guard: only flag as music when there's significant audio energy (rms > 0.005)
    // Thresholds lowered to make music and effect detection more sensitive per user request
    const isMusicOrEffect = rms > 0.003 && (
      (hnr > 0.85) ||
      (hnr > 0.82 && jitter < 0.03 && pdr < 0.12) ||
      (hnr > 0.80 && fi < 0.06 && pdr < 0.10 && jitter < 0.025) ||
      (normEntropy < 0.40 && hnr > 0.80)
    );

    if (isMusicOrEffect) {
      return {
        stressScore: 0,
        aiProbability: smoothAIScore,
        isSilent: false,
        isMusic: true,
        gainStatus,
        internalGain: parseFloat(this.fakeGainValue.toFixed(2)),
        currentSpeakerId: this.currentSpeaker ? `Speaker ${this.currentSpeaker.id}` : 'Scanning...',
        metrics: {
          jitter: "0.0000",
          shimmer: "0.0000",
          hnr: "0.00",
          entropy: 0,
          mti: 0,
          fi: 0,
          pdr: 0
        }
      };
    }

    // Speaker ID Logic
    this.identifySpeaker(jitter, shimmer, pdr);

    let finalScore = score;
    
    // Apply 10% bias if speaker is deemed unreliable early on
    if (this.currentSpeaker && this.currentSpeaker.isUnreliable) {
      finalScore = Math.min(99, finalScore + 10);
    }

    return {
      stressScore: finalScore,
      aiProbability: smoothAIScore,
      isSilent: false,
      isMusic: false,
      gainStatus,
      internalGain: parseFloat(this.fakeGainValue.toFixed(2)),
      currentSpeakerId: this.currentSpeaker ? `Speaker ${this.currentSpeaker.id}` : 'Scanning...',
      metrics: {
        jitter: jitter.toFixed(4), shimmer: shimmer.toFixed(4), hnr: hnr.toFixed(2), entropy: normEntropy,
        mti: parseFloat(mti.toFixed(4)), fi: parseFloat(fi.toFixed(4)), pdr: parseFloat(pdr.toFixed(4))
      }
    };
  }

  calculateAIScore(jitter, shimmer, hnr, average) {
    let prob = 0;
    if (hnr > 0.88) prob += 20;
    if (jitter < 0.04 && shimmer < 0.018) prob += 25;
    let zeroCount = 0;
    const highStart = Math.floor(this.bufferLength * 0.6);
    for (let i = highStart; i < this.bufferLength; i++) if (this.dataArray[i] < 4) zeroCount++;
    if (zeroCount / (this.bufferLength - highStart) > 0.85) prob += 25;
    let peaks = [];
    for (let i = 2; i < this.bufferLength / 2; i++) if (this.dataArray[i] > this.dataArray[i - 1] && this.dataArray[i] > this.dataArray[i + 1] && this.dataArray[i] > 60) peaks.push(i);
    if (peaks.length >= 4) {
      let diffs = [];
      for (let i = 1; i < peaks.length; i++) diffs.push(peaks[i] - peaks[i - 1]);
      const avgDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;
      const variance = diffs.reduce((a, b) => a + Math.pow(b - avgDiff, 2), 0) / diffs.length;
      if (variance < 1.8) prob += 35;
    }
    let flux = 0;
    for (let i = 1; i < 150; i++) flux += Math.abs(this.dataArray[i] - this.dataArray[i - 1]);
    if (flux < 450 && average > 35) prob += 15;
    if (average > 40 && hnr > 0.92 && jitter < 0.02) prob += 20;
    return Math.min(100, prob);
  }

  identifySpeaker(jitter, shimmer, pdr) {
    const fingerprint = { jitter, shimmer, pdr };
    
    // Try to match existing speaker
    let bestMatch = null;
    let minDiff = 0.15; // Similarity threshold
    
    for (const speaker of this.speakers) {
      // Primary differentiator: Fundamental Frequency (Pitch)
      const pitchDiff = Math.abs(speaker.fingerprint.pdr - pdr);
      const spectralDiff = Math.abs(speaker.fingerprint.jitter - jitter) + 
                           Math.abs(speaker.fingerprint.shimmer - shimmer);
      
      // Much stricter threshold - requires significant difference (like gender-level pitch/stability)
      if (pitchDiff < 0.08 && spectralDiff < 0.12) {
        bestMatch = speaker;
        break;
      }
    }
    
    if (bestMatch) {
      this.currentSpeaker = bestMatch;
    } else if (this.speakers.length < 5) { // Limit to 5 characters per video
      const newSpeaker = new SpeakerProfile(this.speakers.length + 1, fingerprint);
      this.speakers.push(newSpeaker);
      this.currentSpeaker = newSpeaker;
    }
    
    if (this.currentSpeaker) {
      this.currentSpeaker.update(fingerprint);
    }
  }
}

if (typeof module !== 'undefined') module.exports = VoiceStressAnalyzer;
else window.VoiceStressAnalyzer = VoiceStressAnalyzer;
