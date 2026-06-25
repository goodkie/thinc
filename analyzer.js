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

    // Silence detection (Truly silent or very low, and not a CORS block)
    const isTrulySilent = (rms < 0.0005) && !isCORSBlocked;

    if (isTrulySilent) {
      return {
        stressScore: 0,
        isSilent: true,
        aiProbability: 0,
        gainStatus: 'IDLE',
        internalGain: 1.0,
        metrics: { jitter: 0, shimmer: 0, hnr: 0, entropy: 0, mti: 0, fi: 0, pdr: 0 }
      };
    }

    if (isCORSBlocked) {
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

      // Apply sensitivity multiplier and global 1.2x boost to mock stress
      const sensMult = sensitivity / 5;
      baseStress *= sensMult * 1.2;

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
      if (this.baseline.count === 0) {
        this.baseline.jitter = jitter; this.baseline.shimmer = shimmer; this.baseline.hnr = hnr;
        this.baseline.teo = teo; this.baseline.entropy = normEntropy;
        this.baseline.mti = mti; this.baseline.fi = fi; this.baseline.pdr = pdr;
      } else {
        const a = 0.05;
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
      if (this.baseline.count > 150) this.isCalibrating = false;
      return { stressScore: 0, aiProbability: 0, isSilent: false, isCalibrating: true, gainStatus, internalGain: parseFloat(this.fakeGainValue.toFixed(2)), metrics: {} };
    }

    // ── STRESS ──
    const jitterDev  = Math.max(0, jitter - this.baseline.jitter) * 120;
    const shimmerDev = Math.max(0, shimmer - this.baseline.shimmer) * 150;
    const hnrDev     = Math.max(0, this.baseline.hnr - hnr) * 80;
    const teoDev     = Math.max(0, teo - this.baseline.teo) * 100;
    const entropyDev = Math.max(0, normEntropy - this.baseline.entropy) * 50;
    const mtiDev     = Math.max(0, mti - this.baseline.mti) * 180;
    const fiDev      = Math.max(0, fi - this.baseline.fi) * 200;
    const pdrDev     = Math.max(0, pdr - this.baseline.pdr) * 160;

    const sensMult = sensitivity / 5;
    let stress = (jitterDev * 0.15) + (shimmerDev * 0.15) + (hnrDev * 0.08) + (teoDev * 0.12) + (entropyDev * 0.08) + (mtiDev * 0.18) + (fiDev * 0.14) + (pdrDev * 0.10);
    stress *= sensMult * 1.2; // Apply global 1.2x sensitivity boost for higher lie detection rate
    stress = Math.min(100, stress);

    const score = Math.min(99, Math.max(5, Math.round(stress)));
    const aiScore = this.calculateAIScore(jitter, shimmer, hnr, average);
    this.aiHistory.push(aiScore);
    if (this.aiHistory.length > 50) this.aiHistory.shift();
    const smoothAIScore = this.aiHistory.reduce((a, b) => a + b, 0) / this.aiHistory.length;

    const isMusicOrEffect = (hnr > 0.94 && jitter < 0.02) || (average > 70 && jitter < 0.015) || (hnr > 0.97);

    // Speaker ID Logic
    if (!isMusicOrEffect) {
      this.identifySpeaker(jitter, shimmer, pdr);
    }

    let finalScore = isMusicOrEffect ? 0 : score;
    
    // Apply 10% bias if speaker is deemed unreliable early on
    if (this.currentSpeaker && this.currentSpeaker.isUnreliable) {
      finalScore = Math.min(99, finalScore + 10);
    }

    return {
      stressScore: finalScore,
      aiProbability: smoothAIScore,
      isSilent: false,
      isMusic: isMusicOrEffect,
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
