/**
 * 까치매스 (KKACHI MATH) Web Audio API Arcade Sound Synthesizer
 * 별도 오디오 파일 없이 즉각적인 타격감과 콤보 상승 사운드를 제공합니다.
 */
(function (global) {
  let ctx = null;
  let muted = false;

  // Pentatonic + Major scale frequencies for combo pitch escalation
  const COMBO_FREQS = [
    523.25, // C5 (1 combo)
    587.33, // D5 (2)
    659.25, // E5 (3)
    698.46, // F5 (4)
    783.99, // G5 (5 - FEVER)
    880.00, // A5 (6)
    987.77, // B5 (7)
    1046.50, // C6 (8)
    1174.66, // D6 (9)
    1318.51, // E6 (10 - SUPER FEVER)
    1396.91, // F6 (11)
    1567.98  // G6 (12+)
  ];

  function getCtx() {
    if (muted) return null;
    if (!ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) ctx = new AudioCtx();
    }
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    return ctx;
  }

  function playTone(freq, type, duration, gainVal = 0.14, delay = 0) {
    const audio = getCtx();
    if (!audio) return;

    const now = audio.currentTime + delay;
    const osc = audio.createOscillator();
    const gain = audio.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(gainVal, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(audio.destination);

    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  const Sound = {
    isMuted() {
      return muted;
    },
    toggleMute() {
      muted = !muted;
      if (!muted) this.click();
      return muted;
    },
    click() {
      playTone(680, 'sine', 0.06, 0.08);
    },
    join() {
      // Friendly magpie chirp
      playTone(740, 'triangle', 0.09, 0.11, 0);
      playTone(987.77, 'triangle', 0.13, 0.13, 0.07);
    },
    correct(combo = 1) {
      const idx = Math.min(COMBO_FREQS.length - 1, Math.max(0, (combo || 1) - 1));
      const base = COMBO_FREQS[idx];
      playTone(base, 'triangle', 0.12, 0.16, 0);
      playTone(base * 1.25, 'sine', 0.18, 0.14, 0.055);
    },
    fever(level = 1) {
      // Exciting power-up arpeggio
      const notes = level >= 2
        ? [523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98]
        : [440, 554.37, 659.25, 880, 1108.73];
      notes.forEach((f, i) => {
        playTone(f, 'sawtooth', 0.16, 0.1, i * 0.045);
      });
    },
    wrong() {
      // Ice freeze / buzz sound
      playTone(220, 'sawtooth', 0.16, 0.14, 0);
      playTone(164.81, 'sawtooth', 0.25, 0.14, 0.09);
    },
    countdown(isGo = false) {
      if (isGo) {
        playTone(880, 'triangle', 0.14, 0.18, 0);
        playTone(1174.66, 'triangle', 0.28, 0.2, 0.06);
      } else {
        playTone(440, 'sine', 0.12, 0.14, 0);
      }
    },
    tickUrgent() {
      playTone(880, 'sine', 0.05, 0.07, 0);
    },
    victory() {
      const melody = [
        { f: 523.25, d: 0.13, t: 0 },
        { f: 659.25, d: 0.13, t: 0.11 },
        { f: 783.99, d: 0.13, t: 0.22 },
        { f: 1046.50, d: 0.35, t: 0.33 },
        { f: 783.99, d: 0.12, t: 0.52 },
        { f: 1046.50, d: 0.45, t: 0.64 }
      ];
      melody.forEach((n) => playTone(n.f, 'triangle', n.d, 0.16, n.t));
    }
  };

  global.KkachiSound = Sound;
})(window);
