/**
 * 수달런 (OTTER MATH RUN) - 액션 타격음 & 필살기 사운드 신디사이저 (Web Audio API)
 */
(function (global) {
  let ctx = null;
  let muted = false;

  const COMBO_FREQS = [
    523.25, 587.33, 659.25, 698.46, 783.99, 880.00,
    987.77, 1046.50, 1174.66, 1318.51, 1396.91, 1567.98
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

  function playTone(freq, type, duration, gainVal = 0.14, delay = 0, slideToFreq = null) {
    const audio = getCtx();
    if (!audio) return;

    const now = audio.currentTime + delay;
    const osc = audio.createOscillator();
    const gain = audio.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideToFreq) {
      osc.frequency.exponentialRampToValueAtTime(slideToFreq, now + duration);
    }

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(gainVal, now + 0.012);
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
    shoot() {
      // Fast boomerang / water laser launch whoosh
      playTone(360, 'sawtooth', 0.14, 0.14, 0, 980);
      playTone(620, 'triangle', 0.12, 0.12, 0.03, 1420);
    },
    smash(combo = 1) {
      // Heavy impact thud + critical hit chime!
      playTone(145, 'sawtooth', 0.16, 0.25, 0, 48);
      playTone(260, 'square', 0.11, 0.18, 0.01, 90);
      const idx = Math.min(COMBO_FREQS.length - 1, Math.max(0, (combo || 1) - 1));
      const base = COMBO_FREQS[idx];
      playTone(base, 'triangle', 0.15, 0.18, 0.05);
      playTone(base * 1.5, 'sine', 0.22, 0.16, 0.1);
    },
    ultimate() {
      // Mega Otter Water Breath cannon blast!
      playTone(180, 'sawtooth', 0.35, 0.24, 0, 55);
      [523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98].forEach((f, i) => {
        playTone(f, 'sawtooth', 0.22, 0.15, i * 0.045);
      });
    },
    eat(combo = 1) {
      const base = COMBO_FREQS[Math.min(COMBO_FREQS.length - 1, Math.max(0, combo - 1))];
      playTone(420, 'sine', 0.07, 0.08, 0, 580);
      playTone(base, 'triangle', 0.13, 0.11, 0.08);
      playTone(base * 1.5, 'sine', 0.18, 0.10, 0.16);
    },
    correct(combo = 1) {
      this.smash(combo);
    },
    fever(level = 1) {
      const notes = level >= 2
        ? [523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98]
        : [440, 554.37, 659.25, 880, 1108.73];
      notes.forEach((f, i) => {
        playTone(f, 'sawtooth', 0.16, 0.1, i * 0.045);
      });
    },
    wrong() {
      playTone(220, 'sawtooth', 0.15, 0.13, 0);
      playTone(164.81, 'sawtooth', 0.22, 0.13, 0.08);
    },
    bomb() {
      [180, 140, 110, 85, 65].forEach((f, i) => {
        playTone(f, 'sawtooth', 0.18, 0.2, i * 0.045);
      });
    },
    jackpot() {
      [523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98, 2093.0].forEach((f, i) => {
        playTone(f, 'triangle', 0.18, 0.16, i * 0.05);
      });
    },
    radar() {
      playTone(1174.66, 'sine', 0.14, 0.15, 0);
      playTone(1567.98, 'sine', 0.24, 0.14, 0.12);
    },
    siren() {
      // Boss Warning Siren (Dramatic 2-tone arcade alarm)
      playTone(440, 'sawtooth', 0.22, 0.18, 0, 880);
      playTone(880, 'sawtooth', 0.22, 0.18, 0.22, 440);
      playTone(440, 'sawtooth', 0.24, 0.2, 0.45, 920);
    },
    heartbeat() {
      // Danger proximity heartbeat thump-thump
      playTone(95, 'sine', 0.11, 0.26, 0, 48);
      playTone(82, 'sine', 0.14, 0.22, 0.14, 42);
    },
    counter() {
      // Bullet-time slow-mo counter flash + electric crit!
      playTone(220, 'triangle', 0.18, 0.22, 0, 1480);
      playTone(1174.66, 'sawtooth', 0.16, 0.2, 0.12);
      playTone(1760.0, 'sine', 0.28, 0.22, 0.18);
    },
    coinBurst() {
      // Quick-Kill Golden Seashell Fountain chime
      [987.77, 1318.51, 1567.98, 2093.0].forEach((f, i) => {
        playTone(f, 'sine', 0.14, 0.15, i * 0.04);
      });
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
