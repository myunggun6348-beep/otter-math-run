/**
 * 수달런 (OTTER MATH RUN) - 60FPS 횡스크롤 몬스터 격파 & 워터캐논/부메랑 필살기 액션 런게임
 */
(function (global) {
  const SPEED_MAP = {
    slow: 9000,
    normal: 6500,
    fast: 4500
  };

  // Floor Y coordinates on the 960x360 canvas
  const FLOOR_Y = [92, 200, 308];

  const state = {
    screen: 'intro', // 'intro' | 'game'
    skin: 'basic',   // 'basic' | 'scholar' | 'surfer' | 'king'
    chapterId: 'all',
    speedKey: 'normal',
    gateDurationMs: 6500,

    // Intro preview animation
    introRafId: null,
    introPhase: 0,
    introProjX: -1,
    introMonX: 165,
    introMonFlyY: 0,
    introMonRot: 0,

    // Active run state
    running: false,
    pausedForCrash: false,
    isDashing: false,
    targetFloor: 2, // 0 (3층 박쥐), 1 (2층 고블린), 2 (1층 슬라임)

    // Physical Otter coordinates & physics on the 960x360 canvas
    otterX: 140,
    otterBaseX: 140,
    otterY: FLOOR_Y[2],
    otterVy: 0,
    otterGravity: 0.62,
    otterJumpCount: 0,
    otterSpin: 0,
    otterPhase: 0,
    otterMood: 'run',

    // Action FX arrays on Canvas
    scrollX: 0,
    dustParticles: [],
    projectiles: [],     // [{ x, y, targetY, skin, rot }]
    flyingMonsters: [],  // [{ x, y, vx, vy, rot, vRot, floorType }]
    slashEffects: [],    // [{ x, y, radius, life, color }]
    floatingTexts: [],   // [{ x, y, text, subText, color, life }]
    ultBeamLife: 0,      // > 0 when firing Mega Water Breath Ultimate!
    coins: [],
    lastCoinSpawn: 0,

    // Game stats
    hearts: 5,
    maxHearts: 5,
    hasShield: false,
    freeShieldUsed: false,
    ultGauge: 0, // 0..100%
    distance: 0,
    score: 0,
    combo: 0,
    maxCombo: 0,
    gateCount: 0,
    targetGates: 10,

    // Current Math Monster Wave state
    questionPool: [],
    currentQ: null,
    gateOptions: [],
    monstersAlive: [true, true, true],
    gateX: 740,
    history: [],

    lastFrameTime: 0,
    rafId: null,

    // PWA / Share URL
    deferredPrompt: null,
    shareUrl: null
  };

  // =========================================================================
  // 1. ARTICULATED RUNNING OTTER RENDERER (Side-Profile with Swinging Legs)
  // =========================================================================
  function drawArticulatedOtter(ctx, x, y, phase, opts = {}) {
    const skin = opts.skin || 'basic';
    const mood = opts.mood || 'run';
    const airborne = Boolean(opts.airborne);
    const spin = opts.spin || 0;
    const fever = Boolean(opts.fever);
    const shielded = Boolean(opts.shielded);
    const scale = opts.scale || 1;

    ctx.save();
    ctx.translate(x, y - 26 * scale);
    ctx.scale(scale, scale);
    if (spin !== 0) {
      ctx.rotate(spin);
    }

    const legAngle = airborne ? 0.55 : Math.sin(phase) * 0.65;
    const bodyBounce = airborne ? 0 : Math.abs(Math.sin(phase)) * -4.5;
    const bodyTilt = airborne ? -0.14 : Math.cos(phase) * 0.06;

    ctx.translate(0, bodyBounce);
    ctx.rotate(bodyTilt);

    // Surfboard
    if (skin === 'surfer' || fever) {
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(2, 26, 44, 7, 0, 0, Math.PI * 2);
      ctx.fillStyle = fever ? '#f59e0b' : '#06b6d4';
      ctx.fill();
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = '#e0f2fe';
      ctx.stroke();
      ctx.restore();
    }

    // Fluttering Cape
    if (skin === 'king') {
      ctx.save();
      const wave = Math.sin(phase * 1.4) * 5;
      ctx.beginPath();
      ctx.moveTo(-6, -8);
      ctx.quadraticCurveTo(-32, -14 + wave, -44, 6 + wave);
      ctx.lineTo(-18, 12);
      ctx.closePath();
      ctx.fillStyle = '#e11d48';
      ctx.fill();
      ctx.lineWidth = 1.8;
      ctx.strokeStyle = '#fbbf24';
      ctx.stroke();
      ctx.restore();
    }

    // Wagging Tail
    ctx.save();
    const tailWag = Math.sin(phase * 1.1) * 0.22;
    ctx.translate(-22, 6);
    ctx.rotate(tailWag);
    ctx.beginPath();
    ctx.moveTo(0, -4);
    ctx.quadraticCurveTo(-26, 0, -32, 8);
    ctx.quadraticCurveTo(-22, 14, 0, 6);
    ctx.closePath();
    ctx.fillStyle = '#7c4a21';
    ctx.fill();
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = '#4a290e';
    ctx.stroke();
    ctx.restore();

    // Far legs
    drawLimb(ctx, -14, 13, -legAngle, '#6b3e1a');
    drawLimb(ctx, 14, 13, legAngle, '#6b3e1a');

    // Torso
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, 4, 26, 15, -0.05, 0, Math.PI * 2);
    ctx.fillStyle = '#9a6232';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#4a290e';
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(3, 9, 20, 9, -0.05, 0, Math.PI);
    ctx.fillStyle = '#fde6c4';
    ctx.fill();
    ctx.restore();

    // Near legs
    drawLimb(ctx, -12, 14, legAngle, '#8b5428');
    drawLimb(ctx, 16, 14, -legAngle, '#8b5428');

    // Golden Seashell Weapon at chest
    ctx.save();
    ctx.translate(12, 4);
    ctx.beginPath();
    ctx.arc(0, 0, 7.5, Math.PI, 0);
    ctx.lineTo(4.5, 6.5);
    ctx.lineTo(-4.5, 6.5);
    ctx.closePath();
    ctx.fillStyle = '#fbbf24';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#b45309';
    ctx.stroke();
    ctx.restore();

    // Head
    ctx.save();
    ctx.translate(22, -10);

    ctx.beginPath();
    ctx.arc(-8, -12, 5.5, 0, Math.PI * 2);
    ctx.fillStyle = '#7c4a21';
    ctx.fill();
    ctx.strokeStyle = '#4a290e';
    ctx.lineWidth = 1.8;
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(0, 0, 17, 14.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#9a6232';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#4a290e';
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(11, 3, 9.5, 7.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#fef3c7';
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(3, 5, 4.2, 2.8, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#fb7185';
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(18, 0, 3.2, 2.4, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#1e293b';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(13, 4, 3.5, 0.2, Math.PI * 0.85);
    ctx.strokeStyle = '#4a290e';
    ctx.lineWidth = 1.8;
    ctx.stroke();

    if (mood === 'happy') {
      ctx.beginPath();
      ctx.arc(6, -3, 4, Math.PI * 1.1, Math.PI * 1.9);
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2.6;
      ctx.stroke();
    } else if (mood === 'hurt') {
      ctx.beginPath();
      ctx.moveTo(3, -6);
      ctx.lineTo(9, 0);
      ctx.moveTo(9, -6);
      ctx.lineTo(3, 0);
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(6, -3, 4.2, 0, Math.PI * 2);
      ctx.fillStyle = '#0f172a';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(7.4, -4.4, 1.5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    }

    if (skin === 'scholar') {
      ctx.beginPath();
      ctx.arc(6, -3, 6.2, 0, Math.PI * 2);
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.moveTo(-15, -14);
      ctx.lineTo(2, -21);
      ctx.lineTo(18, -14);
      ctx.lineTo(2, -9);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.4;
      ctx.stroke();
    } else if (skin === 'surfer') {
      ctx.fillStyle = '#0284c7';
      ctx.fillRect(1, -7, 11, 7);
      ctx.strokeStyle = '#e0f2fe';
      ctx.lineWidth = 1.4;
      ctx.strokeRect(1, -7, 11, 7);
    } else if (skin === 'king') {
      ctx.beginPath();
      ctx.moveTo(-9, -12);
      ctx.lineTo(-7, -23);
      ctx.lineTo(-1, -16);
      ctx.lineTo(4, -25);
      ctx.lineTo(9, -16);
      ctx.lineTo(14, -22);
      ctx.lineTo(12, -12);
      ctx.closePath();
      ctx.fillStyle = '#fbbf24';
      ctx.fill();
      ctx.strokeStyle = '#b45309';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    ctx.restore();

    if (shielded) {
      ctx.beginPath();
      ctx.arc(4, 0, 44, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(56, 189, 248, 0.18)';
      ctx.fill();
      ctx.lineWidth = 2.2;
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = '#38bdf8';
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.restore();
  }

  function drawLimb(ctx, hipX, hipY, angle, color) {
    ctx.save();
    ctx.translate(hipX, hipY);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.roundRect(-4.5, 0, 9, 15, 4.5);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = '#4a290e';
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(2, 14, 5.5, 3.2, 0, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // =========================================================================
  // 2. ANIMATED 3-FLOOR MONSTERS & PROJECTILES RENDERER
  // =========================================================================
  function drawMonsterOnCanvas(ctx, x, y, floorType, phase, isKnockedOut = false, rot = 0) {
    ctx.save();
    ctx.translate(x, y - 28);
    if (rot !== 0) ctx.rotate(rot);

    const bob = isKnockedOut ? 0 : Math.sin(phase * 1.4 + floorType) * 5;
    ctx.translate(0, bob);

    if (floorType === 0) {
      // 3층: 🦇 허수 박쥐 (Purple Bat Monster)
      const wingFlap = isKnockedOut ? 0.5 : Math.sin(phase * 2.4) * 14;
      ctx.fillStyle = '#6d28d9';
      ctx.strokeStyle = '#c4b5fd';
      ctx.lineWidth = 2;
      // Left & Right Bat Wings
      ctx.beginPath();
      ctx.moveTo(-10, 0);
      ctx.quadraticCurveTo(-34, -18 + wingFlap, -38, 8 + wingFlap);
      ctx.quadraticCurveTo(-22, 10, -10, 8);
      ctx.moveTo(10, 0);
      ctx.quadraticCurveTo(34, -18 + wingFlap, 38, 8 + wingFlap);
      ctx.quadraticCurveTo(22, 10, 10, 8);
      ctx.fill();
      ctx.stroke();

      // Bat Body
      ctx.beginPath();
      ctx.arc(0, 2, 18, 0, Math.PI * 2);
      ctx.fillStyle = '#4c1d95';
      ctx.fill();
      ctx.stroke();
    } else if (floorType === 1) {
      // 2층: 👹 판별식 고블린 (Horned Bridge Goblin)
      // Horns
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.moveTo(-14, -12);
      ctx.lineTo(-22, -28);
      ctx.lineTo(-6, -18);
      ctx.moveTo(14, -12);
      ctx.lineTo(22, -28);
      ctx.lineTo(6, -18);
      ctx.fill();

      // Goblin Body
      ctx.beginPath();
      ctx.roundRect(-20, -18, 40, 38, 12);
      ctx.fillStyle = '#be123c';
      ctx.fill();
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = '#fda4af';
      ctx.stroke();
    } else {
      // 1층: 👾 다항식 가시 슬라임 (Spiky River Slime)
      const squish = isKnockedOut ? 0 : Math.sin(phase * 1.8) * 2.5;
      ctx.beginPath();
      ctx.arc(0, 4 + squish, 22, Math.PI, 0);
      ctx.lineTo(22, 22);
      ctx.lineTo(-22, 22);
      ctx.closePath();
      ctx.fillStyle = '#15803d';
      ctx.fill();
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = '#86efac';
      ctx.stroke();
    }

    // Monster Eyes (Angry vs Knocked-Out X_X)
    if (isKnockedOut) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(-11, -5); ctx.lineTo(-4, 2);
      ctx.moveTo(-4, -5); ctx.lineTo(-11, 2);
      ctx.moveTo(4, -5); ctx.lineTo(11, 2);
      ctx.moveTo(11, -5); ctx.lineTo(4, 2);
      ctx.stroke();
    } else {
      // Glowing menacing eyes facing left toward the otter
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.arc(-8, -2, 4.5, 0, Math.PI * 2);
      ctx.arc(6, -2, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#dc2626';
      ctx.beginPath();
      ctx.arc(-9, -2, 2, 0, Math.PI * 2);
      ctx.arc(5, -2, 2, 0, Math.PI * 2);
      ctx.fill();
      // Angry Eyebrows
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(-14, -9); ctx.lineTo(-3, -5);
      ctx.moveTo(12, -9); ctx.lineTo(1, -5);
      ctx.stroke();
      // Fangs
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(-8, 8); ctx.lineTo(-5, 14); ctx.lineTo(-2, 8);
      ctx.moveTo(2, 8); ctx.lineTo(5, 14); ctx.lineTo(8, 8);
      ctx.fill();
    }

    ctx.restore();
  }

  function drawProjectile(ctx, p) {
    ctx.save();
    ctx.translate(p.x, p.y);

    // Water Laser Trail behind projectile
    const grad = ctx.createLinearGradient(-75, 0, 10, 0);
    grad.addColorStop(0, 'transparent');
    grad.addColorStop(0.5, p.skin === 'king' ? 'rgba(244, 63, 94, 0.7)' : 'rgba(56, 189, 248, 0.75)');
    grad.addColorStop(1, '#ffffff');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(-75, -7, 85, 14, 7);
    ctx.fill();

    // Spinning Golden Shell Boomerang / Energy Orb
    ctx.rotate(p.rot);
    ctx.beginPath();
    ctx.arc(0, 0, 13, 0, Math.PI * 2);
    ctx.fillStyle = '#fbbf24';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    ctx.restore();
  }

  // =========================================================================
  // INTRO MINI CANVAS LOOP (Shows Otter shooting & blasting a monster!)
  // =========================================================================
  function startIntroPreviewLoop() {
    if (state.introRafId) cancelAnimationFrame(state.introRafId);
    const canvas = document.getElementById('intro-otter-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    let monAlive = true;
    let monVx = 0, monVy = 0;

    function frame() {
      if (state.screen !== 'intro') return;
      state.introPhase += 0.24;

      // Every ~110 frames, fire a projectile at the demo monster!
      const cycle = Math.floor(state.introPhase * 4) % 120;
      if (cycle === 15) {
        state.introProjX = 80;
        monAlive = true;
        state.introMonX = 172;
        state.introMonFlyY = 104;
        state.introMonRot = 0;
      }

      if (state.introProjX > 0) {
        state.introProjX += 9;
        if (state.introProjX >= state.introMonX - 12 && monAlive) {
          monAlive = false;
          state.introProjX = -1;
          monVx = 6.5;
          monVy = -6.5;
        }
      }

      if (!monAlive) {
        state.introMonX += monVx;
        state.introMonFlyY += monVy;
        monVy += 0.35;
        state.introMonRot += 0.32;
      }

      const grad = ctx.createLinearGradient(0, 0, 0, 138);
      grad.addColorStop(0, '#0c4a6e');
      grad.addColorStop(0.75, '#0284c7');
      grad.addColorStop(0.76, '#10b981');
      grad.addColorStop(1, '#047857');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 210, 138);

      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      const offset = (state.introPhase * 12) % 40;
      for (let x = -offset; x < 210; x += 40) {
        ctx.fillRect(x, 114, 22, 4);
      }

      // Draw Demo Monster
      if (state.introMonX < 245) {
        drawMonsterOnCanvas(ctx, state.introMonX, state.introMonFlyY, 2, state.introPhase, !monAlive, state.introMonRot);
      }

      // Draw Projectile
      if (state.introProjX > 0) {
        drawProjectile(ctx, { x: state.introProjX, y: 84, rot: state.introPhase * 2, skin: state.skin });
      }

      // Draw Running Otter
      drawArticulatedOtter(ctx, 64, 106, state.introPhase, {
        skin: state.skin,
        mood: !monAlive ? 'happy' : 'run',
        scale: 0.86
      });

      state.introRafId = requestAnimationFrame(frame);
    }

    state.introRafId = requestAnimationFrame(frame);
  }

  // =========================================================================
  // INITIALIZATION & SETTINGS
  // =========================================================================
  async function init() {
    registerServiceWorker();
    await detectShareUrl();
    renderChapterTabs();
    initControls();
    startIntroPreviewLoop();
  }

  function registerServiceWorker() {
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      state.deferredPrompt = e;
    });
  }

  async function detectShareUrl() {
    const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (isLocal && location.protocol.startsWith('http')) {
      try {
        const res = await fetch('/api/info');
        const data = await res.json();
        if (data && data.ok && Array.isArray(data.ips) && data.ips.length > 0) {
          state.shareUrl = `http://${data.ips[0]}:${data.port || 3000}`;
          return;
        }
      } catch (e) {
        // ignore
      }
    }
    state.shareUrl = location.origin && location.origin !== 'null'
      ? location.origin + location.pathname
      : location.href;
  }

  function selectSkin(skinKey) {
    KkachiSound.click();
    state.skin = skinKey;
    ['basic', 'scholar', 'surfer', 'king'].forEach((k) => {
      const btn = document.getElementById(`skin-btn-${k}`);
      if (btn) btn.classList.toggle('active', k === skinKey);
    });
  }

  function setSpeed(spdKey) {
    KkachiSound.click();
    state.speedKey = spdKey;
    state.gateDurationMs = SPEED_MAP[spdKey] || 6500;
    ['slow', 'normal', 'fast'].forEach((k) => {
      const btn = document.getElementById(`spd-${k}`);
      if (btn) btn.classList.toggle('active', k === spdKey);
    });
  }

  function renderChapterTabs() {
    const tabs = [
      { id: 'all', title: '🔥 고1 전체 랜덤' },
      ...KkachiMathData.CHAPTERS.map((c) => ({ id: c.id, title: c.title }))
    ];
    const html = tabs
      .map((t) => `
        <button type="button" class="tab-btn ${state.chapterId === t.id ? 'active' : ''}" onclick="OtterRun.selectChapter('${t.id}')">
          ${t.title}
        </button>
      `)
      .join('');

    const introEl = document.getElementById('intro-chapter-tabs');
    const gameEl = document.getElementById('game-chapter-tabs');
    if (introEl) introEl.innerHTML = html;
    if (gameEl) gameEl.innerHTML = html;
  }

  function selectChapter(chId) {
    KkachiSound.click();
    state.chapterId = chId;
    renderChapterTabs();
    if (state.screen === 'game') {
      startGame();
    }
  }

  function showIntro() {
    KkachiSound.click();
    stopRunLoop();
    state.screen = 'intro';
    document.getElementById('screen-intro').style.display = 'block';
    document.getElementById('screen-game').style.display = 'none';
    startIntroPreviewLoop();
  }

  // =========================================================================
  // MAIN ACTION RUNNER GAMEPLAY
  // =========================================================================
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function buildQuestionPool() {
    let pool = [];
    if (state.chapterId === 'all') {
      KkachiMathData.CHAPTERS.forEach((c) => {
        pool = pool.concat(c.questions);
      });
    } else {
      const found = KkachiMathData.CHAPTERS.find((c) => c.id === state.chapterId);
      pool = found ? found.questions : KkachiMathData.CHAPTERS[0].questions;
    }
    return shuffle(pool);
  }

  function startGame() {
    stopRunLoop();
    if (state.introRafId) cancelAnimationFrame(state.introRafId);
    KkachiSound.fever(1);

    state.screen = 'game';
    document.getElementById('screen-intro').style.display = 'none';
    document.getElementById('screen-game').style.display = 'block';
    document.getElementById('crash-tip-overlay').classList.remove('active');
    document.getElementById('modal-result').classList.remove('active');

    state.running = true;
    state.pausedForCrash = false;
    state.isDashing = false;
    state.targetFloor = 2;
    state.otterX = state.otterBaseX;
    state.otterY = FLOOR_Y[2];
    state.otterVy = 0;
    state.otterJumpCount = 0;
    state.otterSpin = 0;
    state.otterPhase = 0;
    state.otterMood = 'run';

    state.scrollX = 0;
    state.dustParticles = [];
    state.projectiles = [];
    state.flyingMonsters = [];
    state.slashEffects = [];
    state.floatingTexts = [];
    state.ultBeamLife = 0;
    state.coins = [];

    state.hearts = 5;
    state.hasShield = false;
    state.freeShieldUsed = false;
    state.ultGauge = 35; // Start with 35% charge so players get their first Ultimate after 2 hits!
    state.distance = 0;
    state.score = 0;
    state.combo = 0;
    state.maxCombo = 0;
    state.gateCount = 0;
    state.history = [];

    const shieldBtn = document.getElementById('btn-shield-chance');
    if (shieldBtn) {
      shieldBtn.disabled = false;
      shieldBtn.textContent = '🛡️ 무료 방패(1회)';
    }

    state.questionPool = buildQuestionPool();
    updateHudUI();
    spawnNextGate();

    state.lastFrameTime = performance.now();
    state.rafId = requestAnimationFrame(gameLoop);
  }

  function stopRunLoop() {
    state.running = false;
    if (state.rafId) {
      cancelAnimationFrame(state.rafId);
      state.rafId = null;
    }
  }

  function triggerScreenShake() {
    const wrap = document.getElementById('canvas-stage-wrap');
    if (!wrap) return;
    wrap.classList.remove('shake-hit');
    void wrap.offsetWidth; // trigger reflow
    wrap.classList.add('shake-hit');
  }

  function updateHudUI() {
    const heartStr = '❤️'.repeat(Math.max(0, state.hearts)) + '🖤'.repeat(Math.max(0, state.maxHearts - state.hearts));
    const shieldStr = state.hasShield ? ' 🛡️' : '';
    document.getElementById('hud-hearts').textContent = heartStr + shieldStr;
    document.getElementById('hud-ult').textContent = `${Math.min(100, Math.floor(state.ultGauge))}%`;
    document.getElementById('hud-score').textContent = `${state.score.toLocaleString()}점`;
    document.getElementById('hud-combo').textContent =
      state.combo >= 5 ? `🏄 ${state.combo} FEVER (x2)` : `${state.combo} COMBO`;

    const ultBtn = document.getElementById('btn-ultimate');
    if (ultBtn) {
      if (state.ultGauge >= 100) {
        ultBtn.disabled = false;
        ultBtn.className = 'btn btn-ultimate-ready';
        ultBtn.textContent = '🔥 메가 워터캐논 발사! (100%)';
      } else {
        ultBtn.disabled = true;
        ultBtn.className = 'btn';
        ultBtn.textContent = `⚡ 필살기 충전 (${Math.floor(state.ultGauge)}%)`;
      }
    }

    const wrap = document.getElementById('canvas-stage-wrap');
    if (wrap) wrap.classList.toggle('fever-glow', state.combo >= 5);
  }

  function spawnNextGate() {
    if (state.gateCount >= state.targetGates) {
      finishRun(true);
      return;
    }
    if (state.questionPool.length === 0) {
      state.questionPool = buildQuestionPool();
    }

    const q = state.questionPool.pop();
    state.currentQ = q;
    state.gateCount += 1;
    state.isDashing = false;
    state.otterMood = 'run';
    state.otterSpin = 0;
    state.gateX = 760;
    state.monstersAlive = [true, true, true];
    state.projectiles = [];

    const bonusPool = shuffle(['star', 'heart', 'shield', 'none', 'none']);
    state.gateOptions = shuffle([
      { text: q.ans, isCorrect: true, bonus: bonusPool[0] },
      { text: q.w1, isCorrect: false, bonus: bonusPool[1] },
      { text: q.w2, isCorrect: false, bonus: bonusPool[2] }
    ]);

    document.getElementById('q-gate-num').textContent = `WAVE #${state.gateCount} / ${state.targetGates}`;
    document.getElementById('q-prompt-text').innerHTML = KkachiMathData.renderMathText(q.q);

    state.gateOptions.forEach((opt, idx) => {
      const cardEl = document.getElementById(`plat-card-${idx}`);
      const monName = idx === 0 ? '🦇 3층 하늘 박쥐' : idx === 1 ? '👹 2층 다리 고블린' : '👾 1층 강변 슬라임';
      let bonusHtml = '';
      if (opt.bonus === 'star') bonusHtml = `<span style="color:#fde68a;">⭐2배</span>`;
      else if (opt.bonus === 'heart') bonusHtml = `<span style="color:#fecdd3;">❤️+1</span>`;
      else if (opt.bonus === 'shield') bonusHtml = `<span style="color:#a5f3fc;">🛡️방패</span>`;

      if (cardEl) {
        cardEl.className = `platform-card floor-${idx} ${idx === state.targetFloor ? 'target-floor' : ''}`;
        cardEl.innerHTML = `
          <div style="display:flex;justify-content:space-between;font-size:0.72rem;font-weight:900;color:#fda4af;">
            <span>${monName}</span>
            ${bonusHtml}
          </div>
          <div style="font-size:1.02rem;font-weight:900;color:#fff;text-align:center;margin:auto 0;">
            ${KkachiMathData.renderMathText(opt.text)}
          </div>
        `;
      }

      const ctrlEl = document.getElementById(`ctrl-text-${idx}`);
      if (ctrlEl) ctrlEl.innerHTML = KkachiMathData.renderMathText(opt.text);
    });
  }

  // Player clicks a monster floor -> Otter jumps to that floor AND fires Boomerang + Water Cannon!
  function jumpToFloorAndDash(floorIdx) {
    if (!state.running || state.pausedForCrash || state.isDashing) return;
    KkachiSound.shoot();

    state.targetFloor = floorIdx;
    state.isDashing = true;

    const targetY = FLOOR_Y[floorIdx];
    const dy = targetY - state.otterY;
    if (dy < -10) {
      state.otterVy = dy < -120 ? -14.8 : -11.2;
    } else if (dy > 10) {
      state.otterVy = -4.5;
    } else {
      state.otterVy = -7.5;
    }

    // Fire Golden Boomerang & Water Laser toward the target monster!
    state.projectiles.push({
      x: state.otterX + 35,
      y: state.otterY - 24,
      targetY: targetY - 26,
      skin: state.skin,
      rot: 0
    });

    for (let i = 0; i < 8; i++) {
      state.dustParticles.push({
        x: state.otterX,
        y: state.otterY,
        vx: -2 - Math.random() * 4,
        vy: -1 - Math.random() * 3,
        size: 4 + Math.random() * 5,
        color: '#38bdf8',
        life: 1
      });
    }

    [0, 1, 2].forEach((i) => {
      const el = document.getElementById(`plat-card-${i}`);
      if (el) el.classList.toggle('target-floor', i === floorIdx);
    });
  }

  // MEGA WATER BREATH ULTIMATE SKILL (Blasts ALL 3 Monsters simultaneously!)
  function fireUltimateSkill() {
    if (!state.running || state.pausedForCrash || state.ultGauge < 100) return;
    state.ultGauge = 0;
    state.pausedForCrash = true;
    state.ultBeamLife = 1.0;
    KkachiSound.ultimate();
    triggerScreenShake();

    // Blast all 3 monsters off the screen!
    [0, 1, 2].forEach((fl) => {
      state.monstersAlive[fl] = false;
      const cardEl = document.getElementById(`plat-card-${fl}`);
      if (cardEl) cardEl.classList.add('plat-correct');

      state.flyingMonsters.push({
        x: state.gateX - 36,
        y: FLOOR_Y[fl],
        vx: 16 + Math.random() * 6,
        vy: -11 - Math.random() * 5,
        rot: 0,
        vRot: 0.42,
        floorType: fl
      });

      state.slashEffects.push({
        x: state.gateX - 30,
        y: FLOOR_Y[fl] - 26,
        radius: 52,
        life: 1.0,
        color: '#f59e0b'
      });
    });

    state.floatingTexts.push({
      x: 480,
      y: 160,
      text: '🌈 MEGA WATER BREATH!! 99,999 DMG!',
      subText: '3층 몬스터 전원 일격 소멸! (+500점)',
      color: '#fde68a',
      life: 1.5
    });

    state.combo += 1;
    if (state.combo > state.maxCombo) state.maxCombo = state.combo;
    state.score += 500;
    state.otterMood = 'happy';
    state.otterSpin = Math.PI * 2;

    state.history.push({
      q: state.currentQ.q,
      ans: state.currentQ.ans,
      tip: state.currentQ.tip,
      passed: true
    });

    updateHudUI();
    setTimeout(() => {
      state.pausedForCrash = false;
      spawnNextGate();
    }, 850);
  }

  function freeHop() {
    if (!state.running || state.pausedForCrash || state.isDashing) return;
    if (state.otterJumpCount < 2) {
      KkachiSound.click();
      state.otterVy = -10.5;
      state.otterJumpCount += 1;
    }
  }

  function activateFreeShield() {
    if (state.freeShieldUsed || state.hasShield || !state.running) return;
    KkachiSound.radar();
    state.freeShieldUsed = true;
    state.hasShield = true;
    const btn = document.getElementById('btn-shield-chance');
    if (btn) {
      btn.disabled = true;
      btn.textContent = '🛡️ 방패 장착됨';
    }
    updateHudUI();
  }

  // =========================================================================
  // 60FPS MAIN GAME LOOP & ACTION FX ENGINE
  // =========================================================================
  function gameLoop(now) {
    if (!state.running) return;
    const dt = Math.min(50, now - state.lastFrameTime);
    state.lastFrameTime = now;
    const dtSec = dt / 1000;

    if (!state.pausedForCrash) {
      updatePhysics(now, dt, dtSec);
    }
    updateActionFX(dtSec);
    renderCanvasWorld();
    state.rafId = requestAnimationFrame(gameLoop);
  }

  function updateActionFX(dtSec) {
    // Update flying ragdoll monsters blasted off screen
    state.flyingMonsters = state.flyingMonsters.filter((m) => {
      m.x += m.vx;
      m.y += m.vy;
      m.vy += 0.45;
      m.rot += m.vRot;
      // Trail smoke particles behind flying monster
      if (Math.random() < 0.6) {
        state.dustParticles.push({
          x: m.x,
          y: m.y - 20,
          vx: -2,
          vy: -1,
          size: 6,
          color: 'rgba(251, 191, 36, 0.75)',
          life: 0.7
        });
      }
      return m.x < 1050 && m.y < 450;
    });

    // Update slash bursts
    state.slashEffects = state.slashEffects.filter((s) => {
      s.life -= dtSec * 2.6;
      return s.life > 0;
    });

    // Update floating CRITICAL damage texts
    state.floatingTexts = state.floatingTexts.filter((ft) => {
      ft.y -= 42 * dtSec;
      ft.life -= dtSec * 1.1;
      return ft.life > 0;
    });

    if (state.ultBeamLife > 0) {
      state.ultBeamLife = Math.max(0, state.ultBeamLife - dtSec * 1.6);
    }

    // Update dust & explosion particles
    state.dustParticles = state.dustParticles.filter((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.life -= dtSec * 1.9;
      return p.life > 0;
    });
  }

  function updatePhysics(now, dt, dtSec) {
    const feverMult = state.combo >= 5 ? 1.5 : 1;
    const dashMult = state.isDashing ? 4.2 : 1;
    const worldSpeed = 240 * feverMult * dashMult;

    state.scrollX += worldSpeed * dtSec;
    state.distance += 15 * feverMult * dashMult * dtSec;
    state.otterPhase += dtSec * (state.isDashing ? 26 : 15) * feverMult;

    const targetGroundY = FLOOR_Y[state.targetFloor];
    const onGround = Math.abs(state.otterY - targetGroundY) < 4 && state.otterVy >= 0;
    if (onGround && Math.random() < 0.35) {
      state.dustParticles.push({
        x: state.otterX - 18,
        y: state.otterY - 2,
        vx: -3 - Math.random() * 3,
        vy: -0.5 - Math.random() * 1.5,
        size: 3.5 + Math.random() * 4,
        color: state.combo >= 5 ? '#fde68a' : 'rgba(255,255,255,0.65)',
        life: 1
      });
    }

    state.otterY += state.otterVy;
    state.otterVy += state.otterGravity;
    if (state.otterVy > 0 && state.otterY >= targetGroundY) {
      state.otterY = targetGroundY;
      state.otterVy = 0;
      state.otterJumpCount = 0;
    }

    if (state.isDashing) {
      state.otterX += (330 - state.otterX) * 0.15;
    } else {
      state.otterX += (state.otterBaseX - state.otterX) * 0.08;
    }

    if (state.otterSpin > 0) {
      state.otterSpin = Math.max(0, state.otterSpin - dtSec * 12);
    }

    // Move projectiles toward target monster
    for (const p of state.projectiles) {
      p.x += 1250 * dtSec;
      p.y += (p.targetY - p.y) * 0.25;
      p.rot += 22 * dtSec;
    }

    // Move approaching 3-story Monsters & Shields
    const gateSpeed = state.isDashing
      ? 1450
      : (760 - state.otterBaseX) / (state.gateDurationMs / 1000);
    state.gateX -= gateSpeed * dtSec;

    const overlay = document.getElementById('gates-overlay');
    if (overlay) {
      const leftPct = (state.gateX / 960) * 100;
      overlay.style.left = `${Math.max(4, leftPct)}%`;
    }

    const remSec = Math.max(0, (state.gateX - state.otterX) / Math.max(1, gateSpeed));
    const timeLbl = document.getElementById('q-time-label');
    if (timeLbl) {
      timeLbl.textContent = state.isDashing ? '🌊 필살기 발사!!' : `충돌까지 ${remSec.toFixed(1)}초`;
    }

    // Trigger collision when projectile or otter hits the monster line!
    const projHit = state.projectiles.some((p) => p.x >= state.gateX - 45);
    if (projHit || state.gateX <= state.otterX + 45) {
      state.projectiles = [];
      resolveGateCollision();
    }

    // Collectible floating clams
    if (now - state.lastCoinSpawn > 850) {
      state.lastCoinSpawn = now;
      const fl = Math.floor(Math.random() * 3);
      state.coins.push({
        x: 940,
        y: FLOOR_Y[fl] - 26,
        type: Math.random() < 0.7 ? 'clam' : 'star'
      });
    }

    const nextCoins = [];
    for (const c of state.coins) {
      c.x -= worldSpeed * dtSec;
      const distToOtter = Math.hypot(c.x - state.otterX, c.y - (state.otterY - 24));
      if (distToOtter < 44) {
        state.score += 20;
        state.ultGauge = Math.min(100, state.ultGauge + 5);
        continue;
      }
      if (c.x > -30) nextCoins.push(c);
    }
    state.coins = nextCoins;

    updateHudUI();
  }

  function renderCanvasWorld() {
    const canvas = document.getElementById('runner-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;

    // 1. Sky & River Gradient
    const skyGrad = ctx.createLinearGradient(0, 0, 0, H);
    skyGrad.addColorStop(0, '#082f49');
    skyGrad.addColorStop(0.55, '#0284c7');
    skyGrad.addColorStop(0.84, '#0369a1');
    skyGrad.addColorStop(0.85, '#0d9488');
    skyGrad.addColorStop(1, '#0f766e');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, H);

    // 2. Parallax Clouds & Hills
    ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
    const cloudOffset = (state.scrollX * 0.18) % 320;
    for (let x = -cloudOffset; x < W + 100; x += 320) {
      drawCloud(ctx, x + 50, 48, 36);
      drawCloud(ctx, x + 210, 75, 26);
    }

    ctx.fillStyle = 'rgba(6, 78, 59, 0.45)';
    const hillOffset = (state.scrollX * 0.35) % 400;
    for (let x = -hillOffset; x < W + 400; x += 400) {
      ctx.beginPath();
      ctx.moveTo(x, 308);
      ctx.quadraticCurveTo(x + 200, 195, x + 400, 308);
      ctx.fill();
    }

    // 3. 3-Story Running Bridges
    drawTrackBridge(ctx, W, FLOOR_Y[0], state.scrollX * 0.85, 'rgba(56, 189, 248, 0.25)', '#38bdf8');
    drawTrackBridge(ctx, W, FLOOR_Y[1], state.scrollX * 0.95, 'rgba(16, 185, 129, 0.25)', '#34d399');
    drawMainGroundBridge(ctx, W, FLOOR_Y[2], state.scrollX);

    // 4. Collectible Clams
    for (const c of state.coins) {
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.font = '18px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(c.type === 'clam' ? '🐚' : '⭐', 0, 1);
      ctx.restore();
    }

    // 5. Draw Approaching 3-Floor Monsters standing right in front of the formula cards!
    [0, 1, 2].forEach((fl) => {
      if (state.monstersAlive[fl]) {
        drawMonsterOnCanvas(ctx, state.gateX - 34, FLOOR_Y[fl], fl, state.otterPhase * 0.5, false, 0);
      }
    });

    // 6. Draw Ragdoll Monsters flying off screen!
    for (const fm of state.flyingMonsters) {
      drawMonsterOnCanvas(ctx, fm.x, fm.y, fm.floorType, 0, true, fm.rot);
    }

    // 7. Draw Active Projectiles (Golden Boomerang & Water Laser)
    for (const p of state.projectiles) {
      drawProjectile(ctx, p);
    }

    // 8. Draw Full-Screen Mega Water Breath Ultimate Beam!
    if (state.ultBeamLife > 0) {
      ctx.save();
      ctx.globalAlpha = state.ultBeamLife;
      const beamGrad = ctx.createLinearGradient(0, 40, 0, 320);
      beamGrad.addColorStop(0, '#f43f5e');
      beamGrad.addColorStop(0.3, '#fbbf24');
      beamGrad.addColorStop(0.6, '#38bdf8');
      beamGrad.addColorStop(1, '#10b981');
      ctx.fillStyle = beamGrad;
      ctx.fillRect(state.otterX + 20, 35, W - state.otterX, 275);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(state.otterX + 20, 110, W - state.otterX, 120);
      ctx.restore();
    }

    // 9. Draw Cross Slash & Impact Explosions
    for (const s of state.slashEffects) {
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.globalAlpha = s.life;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 6 * s.life;
      const len = s.radius * (1.4 - s.life * 0.4);
      ctx.beginPath();
      ctx.moveTo(-len, -len); ctx.lineTo(len, len);
      ctx.moveTo(len, -len); ctx.lineTo(-len, len);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(0, 0, s.radius * (1.2 - s.life * 0.5), 0, Math.PI * 2);
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 5 * s.life;
      ctx.stroke();
      ctx.restore();
    }

    // 10. Dust & Star Particles
    for (const p of state.dustParticles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 11. Draw the Articulated Running & Jumping Cute Otter!
    const targetGroundY = FLOOR_Y[state.targetFloor];
    const isAirborne = Math.abs(state.otterY - targetGroundY) > 5;

    drawArticulatedOtter(ctx, state.otterX, state.otterY, state.otterPhase, {
      skin: state.skin,
      mood: state.otterMood,
      airborne: isAirborne,
      spin: state.otterSpin,
      fever: state.combo >= 5,
      shielded: state.hasShield,
      scale: state.ultBeamLife > 0 ? 1.55 : 1.08
    });

    // 12. Draw Floating CRITICAL HIT Damage Texts
    for (const ft of state.floatingTexts) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, ft.life);
      ctx.font = '900 26px Pretendard, sans-serif';
      ctx.textAlign = 'center';
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 5;
      ctx.strokeText(ft.text, ft.x, ft.y);
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, ft.x, ft.y);

      if (ft.subText) {
        ctx.font = '800 16px Pretendard, sans-serif';
        ctx.strokeText(ft.subText, ft.x, ft.y + 24);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(ft.subText, ft.x, ft.y + 24);
      }
      ctx.restore();
    }
  }

  function drawCloud(ctx, x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.arc(x + r * 0.8, y + 4, r * 0.75, 0, Math.PI * 2);
    ctx.arc(x - r * 0.8, y + 6, r * 0.7, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawTrackBridge(ctx, W, y, scroll, fillCol, strokeCol) {
    ctx.save();
    ctx.fillStyle = fillCol;
    ctx.fillRect(0, y, W, 8);
    ctx.strokeStyle = strokeCol;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();

    const offset = scroll % 60;
    ctx.fillStyle = strokeCol;
    for (let x = -offset; x < W; x += 60) {
      ctx.fillRect(x, y + 1, 24, 4);
    }
    ctx.restore();
  }

  function drawMainGroundBridge(ctx, W, y, scroll) {
    ctx.save();
    ctx.fillStyle = '#065f46';
    ctx.fillRect(0, y, W, 16);
    ctx.fillStyle = '#10b981';
    ctx.fillRect(0, y, W, 5);

    const offset = scroll % 50;
    ctx.fillStyle = '#34d399';
    for (let x = -offset; x < W; x += 50) {
      ctx.fillRect(x, y + 6, 26, 5);
    }
    ctx.restore();
  }

  // =========================================================================
  // MONSTER SMASH RESOLUTION & RAGDOLL KNOCKBACK
  // =========================================================================
  function resolveGateCollision() {
    state.pausedForCrash = true;
    const pickedIdx = state.targetFloor;
    const pickedOpt = state.gateOptions[pickedIdx];
    const cardEl = document.getElementById(`plat-card-${pickedIdx}`);

    if (pickedOpt && pickedOpt.isCorrect) {
      // MONSTER SMASHED!
      if (cardEl) cardEl.classList.add('plat-correct');
      state.monstersAlive[pickedIdx] = false;

      // Launch hit monster spinning off the top-right of the screen!
      const hitX = state.gateX - 34;
      const hitY = FLOOR_Y[pickedIdx];
      state.flyingMonsters.push({
        x: hitX,
        y: hitY,
        vx: 15 + Math.random() * 5,
        vy: -11 - Math.random() * 3,
        rot: 0,
        vRot: 0.38,
        floorType: pickedIdx
      });

      // Cross Slash & Explosion effect
      state.slashEffects.push({
        x: hitX,
        y: hitY - 26,
        radius: 48,
        life: 1.0,
        color: '#fbbf24'
      });

      triggerScreenShake();

      state.combo += 1;
      if (state.combo > state.maxCombo) state.maxCombo = state.combo;
      state.ultGauge = Math.min(100, state.ultGauge + 35);
      state.otterMood = 'happy';
      state.otterSpin = Math.PI * 2;

      for (let i = 0; i < 24; i++) {
        state.dustParticles.push({
          x: hitX,
          y: hitY - 20,
          vx: (Math.random() - 0.3) * 12,
          vy: (Math.random() - 0.7) * 12,
          size: 4 + Math.random() * 6,
          color: i % 2 === 0 ? '#fbbf24' : '#38bdf8',
          life: 1.2
        });
      }

      let pts = 150 + (state.combo - 1) * 30;
      if (state.combo >= 5) pts *= 2;
      if (pickedOpt.bonus === 'star') pts *= 2;
      if (pickedOpt.bonus === 'heart' && state.hearts < state.maxHearts) state.hearts += 1;
      if (pickedOpt.bonus === 'shield') state.hasShield = true;

      state.score += pts;

      const skillNames = {
        basic: '🐚 황금부메랑 격파!',
        scholar: '🌊 워터레이저 격파!',
        surfer: '🏄 해일토네이도 격파!',
        king: '⚡ 썬더검기 격파!'
      };
      state.floatingTexts.push({
        x: Math.min(720, Math.max(240, hitX)),
        y: Math.max(65, hitY - 35),
        text: `💥 CRITICAL! ${999 + state.combo * 1000} DMG!`,
        subText: `${skillNames[state.skin] || '필살기 격파!'} (+${pts}점)`,
        color: '#fde68a',
        life: 1.2
      });

      state.history.push({
        q: state.currentQ.q,
        ans: state.currentQ.ans,
        tip: state.currentQ.tip,
        passed: true
      });

      if (state.combo === 5) {
        KkachiSound.jackpot();
      } else {
        KkachiSound.smash(state.combo * 2);
      }

      updateHudUI();
      setTimeout(() => {
        state.pausedForCrash = false;
        spawnNextGate();
      }, 520);
    } else {
      // WRONG MONSTER SHIELD COUNTERATTACK!
      if (cardEl) cardEl.classList.add('plat-wrong');
      state.gateOptions.forEach((o, i) => {
        if (o.isCorrect) {
          const el = document.getElementById(`plat-card-${i}`);
          if (el) el.classList.add('plat-correct');
        }
      });

      state.history.push({
        q: state.currentQ.q,
        ans: state.currentQ.ans,
        tip: state.currentQ.tip,
        passed: false
      });

      if (state.hasShield) {
        state.hasShield = false;
        KkachiSound.radar();
        state.floatingTexts.push({
          x: state.otterX + 60,
          y: state.otterY - 40,
          text: '🛡️ 물방울 방패로 반격 방어!',
          subText: '체력 감소 없음!',
          color: '#38bdf8',
          life: 1.2
        });
        updateHudUI();
        setTimeout(() => {
          state.pausedForCrash = false;
          spawnNextGate();
        }, 700);
        return;
      }

      state.combo = 0;
      state.hearts -= 1;
      state.otterMood = 'hurt';
      KkachiSound.bomb();
      triggerScreenShake();
      updateHudUI();

      const overlay = document.getElementById('crash-tip-overlay');
      document.getElementById('crash-correct-text').innerHTML =
        `✔ 정답 몬스터 수식: ${KkachiMathData.renderMathText(state.currentQ.ans)}`;
      document.getElementById('crash-tip-text').innerHTML =
        `💡 ${KkachiMathData.renderMathText(state.currentQ.tip)}`;
      overlay.classList.add('active');

      setTimeout(() => {
        overlay.classList.remove('active');
        if (state.hearts <= 0) {
          finishRun(false);
        } else {
          state.pausedForCrash = false;
          spawnNextGate();
        }
      }, 1850);
    }
  }

  function finishRun(cleared) {
    stopRunLoop();
    KkachiSound.victory();

    const modal = document.getElementById('modal-result');
    const passedCount = state.history.filter((h) => h.passed).length;

    document.getElementById('result-title').textContent = cleared
      ? `🎉 10개 몬스터 웨이브 완전 토벌!`
      : `🦦 아쉽게 체력 소진! (${Math.floor(state.distance)}m 진격)`;

    document.getElementById('result-desc').innerHTML =
      `최종 점수 <strong style="color:#fbbf24;">${state.score.toLocaleString()}점</strong> · 토벌 성공 <strong style="color:#34d399;">${passedCount}/${state.history.length}마리</strong> · 최고 <strong>${state.maxCombo}연속 격파</strong>`;

    const reviewEl = document.getElementById('result-review-box');
    reviewEl.innerHTML =
      `<div style="font-weight:900;color:#38bdf8;margin-bottom:6px;">📘 이번 출격에서 격파한 고1 수학 수식 복습</div>` +
      state.history
        .map((h, i) => `
          <div style="border-bottom:1px solid rgba(255,255,255,0.08);padding:6px 0;">
            <div style="font-weight:800;">
              ${h.passed ? '⚔️' : '🛡️'} #${i + 1}. ${KkachiMathData.renderMathText(h.q)}
              <span style="color:#34d399;margin-left:6px;">→ ${KkachiMathData.renderMathText(h.ans)}</span>
            </div>
            ${!h.passed ? `<div style="font-size:0.8rem;color:#93c5fd;margin-top:2px;">💡 ${KkachiMathData.renderMathText(h.tip)}</div>` : ''}
          </div>
        `)
        .join('');

    modal.classList.add('active');
  }

  function closeResultAndRestart() {
    document.getElementById('modal-result').classList.remove('active');
    startGame();
  }

  function closeResultAndIntro() {
    document.getElementById('modal-result').classList.remove('active');
    showIntro();
  }

  function initControls() {
    const canvas = document.getElementById('runner-canvas');
    if (canvas) {
      canvas.addEventListener('pointerdown', () => {
        freeHop();
      });
    }

    window.addEventListener('keydown', (e) => {
      if (state.screen !== 'game' || !state.running || state.pausedForCrash) return;
      if (e.key === '1' || e.key === 'ArrowUp') {
        e.preventDefault();
        jumpToFloorAndDash(0);
      } else if (e.key === '2' || e.key === 'ArrowRight') {
        e.preventDefault();
        jumpToFloorAndDash(1);
      } else if (e.key === '3' || e.key === 'ArrowDown') {
        e.preventDefault();
        jumpToFloorAndDash(2);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (state.ultGauge >= 100) fireUltimateSkill();
      } else if (e.key === ' ') {
        e.preventDefault();
        if (state.ultGauge >= 100) fireUltimateSkill();
        else freeHop();
      }
    });
  }

  // Web App (PWA Install & QR) Modal
  function openWebAppModal() {
    KkachiSound.click();
    const targetUrl = state.shareUrl || location.href;
    document.getElementById('webapp-url-label').textContent = targetUrl;
    const qrBox = document.getElementById('webapp-qr-box');
    if (qrBox && window.KkachiQR) {
      qrBox.innerHTML = KkachiQR.toSVG(targetUrl, 180);
    }
    document.getElementById('modal-webapp').classList.add('active');
  }

  function closeWebAppModal() {
    document.getElementById('modal-webapp').classList.remove('active');
  }

  async function installPWA() {
    KkachiSound.click();
    if (state.deferredPrompt) {
      state.deferredPrompt.prompt();
      await state.deferredPrompt.userChoice;
      state.deferredPrompt = null;
    } else {
      alert(
        '현재 브라우저 주소창 우측의 [앱 설치(⊕)] 아이콘을 클릭하시거나,\n스마트폰에서는 브라우저 메뉴 → [홈 화면에 추가]를 누르시면 바탕화면에 웹앱 아이콘이 설치됩니다!'
      );
    }
  }

  function copyWebAppUrl() {
    const url = state.shareUrl || location.href;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(() => {
        alert('웹앱 접속 주소가 복사되었습니다!\n' + url);
      });
    }
  }

  function toggleSound() {
    const muted = KkachiSound.toggleMute();
    const btn = document.getElementById('btn-sound');
    if (btn) btn.textContent = muted ? '🔇' : '🔊';
  }

  global.OtterRun = {
    init,
    selectSkin,
    setSpeed,
    selectChapter,
    showIntro,
    startGame,
    jumpToFloorAndDash,
    fireUltimateSkill,
    activateFreeShield,
    closeResultAndRestart,
    closeResultAndIntro,
    openWebAppModal,
    closeWebAppModal,
    installPWA,
    copyWebAppUrl,
    toggleSound
  };

  window.addEventListener('DOMContentLoaded', init);
})(window);
