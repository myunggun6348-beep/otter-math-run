/**
 * 수달런 (OTTER MATH RUN) - 60FPS 횡스크롤 캔버스에서 네 발로 직접 달리고 점프하는 고1 수학 런게임
 */
(function (global) {
  const SPEED_MAP = {
    slow: 9000,
    normal: 6500,
    fast: 4500
  };

  // Floor Y coordinates on the 960x360 canvas (where the otter's feet land)
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
    introOtterY: 102,
    introOtterVy: 0,

    // Active run state
    running: false,
    pausedForCrash: false,
    isDashing: false,
    targetFloor: 2, // 0 (3층 구름), 1 (2층 다리), 2 (1층 강변 바닥)

    // Physical Otter coordinates & physics on the 960x360 canvas
    otterX: 145,
    otterBaseX: 145,
    otterY: FLOOR_Y[2],
    otterVy: 0,
    otterGravity: 0.62,
    otterJumpCount: 0,
    otterSpin: 0,     // radians for 360° backflip celebration
    otterPhase: 0,    // leg running cycle phase
    otterMood: 'run', // 'run' | 'happy' | 'hurt'

    // World scroll & particles
    scrollX: 0,
    dustParticles: [], // footstep puffs & celebration stars
    coins: [],         // collectible floating seashells & fish
    lastCoinSpawn: 0,

    // Game stats
    hearts: 5,
    maxHearts: 5,
    hasShield: false,
    freeShieldUsed: false,
    distance: 0,
    score: 0,
    combo: 0,
    maxCombo: 0,
    gateCount: 0,
    targetGates: 10,

    // Current Math Gate state
    questionPool: [],
    currentQ: null,
    gateOptions: [],
    gateX: 740, // Canvas X coordinate of approaching 3-story platforms (960 -> otterX)
    history: [],

    lastFrameTime: 0,
    rafId: null,

    // PWA / Share URL
    deferredPrompt: null,
    shareUrl: null
  };

  // =========================================================================
  // 60FPS ARTICULATED RUNNING OTTER RENDERER (Side-Profile with Swinging Legs!)
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

    // Running leg swing angles
    const legAngle = airborne ? 0.55 : Math.sin(phase) * 0.65;
    const bodyBounce = airborne ? 0 : Math.abs(Math.sin(phase)) * -4.5;
    const bodyTilt = airborne ? -0.14 : Math.cos(phase) * 0.06;

    ctx.translate(0, bodyBounce);
    ctx.rotate(bodyTilt);

    // 1. Surfboard (if surfer skin or 5+ combo FEVER)
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

    // 2. Fluttering Cape (if King skin)
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

    // 3. Wagging Otter Tail (extends to the left)
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

    // 4. Far Hind Leg & Far Front Leg (Darker brown, behind torso)
    drawLimb(ctx, -14, 13, -legAngle, '#6b3e1a');
    drawLimb(ctx, 14, 13, legAngle, '#6b3e1a');

    // 5. Plump Side-Profile Otter Torso
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, 4, 26, 15, -0.05, 0, Math.PI * 2);
    ctx.fillStyle = '#9a6232';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#4a290e';
    ctx.stroke();

    // Soft Cream Underbelly
    ctx.beginPath();
    ctx.ellipse(3, 9, 20, 9, -0.05, 0, Math.PI);
    ctx.fillStyle = '#fde6c4';
    ctx.fill();
    ctx.restore();

    // 6. Near Hind Leg & Near Front Leg (Alternating stride!)
    drawLimb(ctx, -12, 14, legAngle, '#8b5428');
    drawLimb(ctx, 16, 14, -legAngle, '#8b5428');

    // 7. Golden Seashell held at chest
    ctx.save();
    ctx.translate(10, 4);
    ctx.beginPath();
    ctx.arc(0, 0, 7, Math.PI, 0);
    ctx.lineTo(4, 6);
    ctx.lineTo(-4, 6);
    ctx.closePath();
    ctx.fillStyle = '#fbbf24';
    ctx.fill();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = '#b45309';
    ctx.stroke();
    ctx.restore();

    // 8. Cute Side-Profile Otter Head (Facing Right)
    ctx.save();
    ctx.translate(22, -10);

    // Back Ear
    ctx.beginPath();
    ctx.arc(-8, -12, 5.5, 0, Math.PI * 2);
    ctx.fillStyle = '#7c4a21';
    ctx.fill();
    ctx.strokeStyle = '#4a290e';
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // Main Head Sphere
    ctx.beginPath();
    ctx.ellipse(0, 0, 17, 14.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#9a6232';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#4a290e';
    ctx.stroke();

    // Chubby Cream Snout / Muzzle on Right
    ctx.beginPath();
    ctx.ellipse(11, 3, 9.5, 7.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#fef3c7';
    ctx.fill();

    // Rosy Pink Cheek Blush
    ctx.beginPath();
    ctx.ellipse(3, 5, 4.2, 2.8, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#fb7185';
    ctx.fill();

    // Cute Dark Nose Tip
    ctx.beginPath();
    ctx.ellipse(18, 0, 3.2, 2.4, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#1e293b';
    ctx.fill();

    // Smile mouth
    ctx.beginPath();
    ctx.arc(13, 4, 3.5, 0.2, Math.PI * 0.85);
    ctx.strokeStyle = '#4a290e';
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // Whiskers
    ctx.beginPath();
    ctx.moveTo(12, 3);
    ctx.lineTo(22, 1);
    ctx.moveTo(12, 5);
    ctx.lineTo(22, 6);
    ctx.strokeStyle = '#5c3415';
    ctx.lineWidth = 1.3;
    ctx.stroke();

    // Expressive Eye
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

    // Skin Headwear & Glasses
    if (skin === 'scholar') {
      // Red Glasses
      ctx.beginPath();
      ctx.arc(6, -3, 6.2, 0, Math.PI * 2);
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.stroke();
      // Mortarboard Graduation Cap
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
      // Cool Sunglasses
      ctx.fillStyle = '#0284c7';
      ctx.fillRect(1, -7, 11, 7);
      ctx.strokeStyle = '#e0f2fe';
      ctx.lineWidth = 1.4;
      ctx.strokeRect(1, -7, 11, 7);
    } else if (skin === 'king') {
      // Golden Crown
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

    ctx.restore(); // End Head

    // 9. Protective Water Bubble Shield
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
    // Little web paw at bottom
    ctx.beginPath();
    ctx.ellipse(2, 14, 5.5, 3.2, 0, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // =========================================================================
  // INTRO MINI CANVAS LOOP (Shows the Otter running & jumping on First Screen!)
  // =========================================================================
  function startIntroPreviewLoop() {
    if (state.introRafId) cancelAnimationFrame(state.introRafId);
    const canvas = document.getElementById('intro-otter-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    function frame() {
      if (state.screen !== 'intro') return;
      state.introPhase += 0.24;

      // Occasional cute automatic hop
      if (state.introOtterY >= 104 && Math.random() < 0.018) {
        state.introOtterVy = -6.8;
      }
      state.introOtterY += state.introOtterVy;
      state.introOtterVy += 0.42;
      if (state.introOtterY >= 104) {
        state.introOtterY = 104;
        state.introOtterVy = 0;
      }

      // Draw mini background
      const grad = ctx.createLinearGradient(0, 0, 0, 135);
      grad.addColorStop(0, '#0c4a6e');
      grad.addColorStop(0.75, '#0284c7');
      grad.addColorStop(0.76, '#10b981');
      grad.addColorStop(1, '#047857');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 190, 135);

      // Scrolling ground dashes
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      const offset = (state.introPhase * 12) % 40;
      for (let x = -offset; x < 190; x += 40) {
        ctx.fillRect(x, 112, 22, 4);
      }

      // Draw Running Otter
      drawArticulatedOtter(ctx, 88, state.introOtterY, state.introPhase, {
        skin: state.skin,
        mood: state.introOtterY < 100 ? 'happy' : 'run',
        airborne: state.introOtterY < 102,
        scale: 0.92
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
  // MAIN SIDE-SCROLLING RUNNER GAMEPLAY
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
    state.targetFloor = 2; // Start running on 1층 ground river bridge
    state.otterX = state.otterBaseX;
    state.otterY = FLOOR_Y[2];
    state.otterVy = 0;
    state.otterJumpCount = 0;
    state.otterSpin = 0;
    state.otterPhase = 0;
    state.otterMood = 'run';

    state.scrollX = 0;
    state.dustParticles = [];
    state.coins = [];
    state.hearts = 5;
    state.hasShield = false;
    state.freeShieldUsed = false;
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

  function updateHudUI() {
    const heartStr = '❤️'.repeat(Math.max(0, state.hearts)) + '🖤'.repeat(Math.max(0, state.maxHearts - state.hearts));
    const shieldStr = state.hasShield ? ' 🛡️' : '';
    document.getElementById('hud-hearts').textContent = heartStr + shieldStr;
    document.getElementById('hud-distance').textContent = `${Math.floor(state.distance)} m`;
    document.getElementById('hud-score').textContent = `${state.score.toLocaleString()}점`;
    document.getElementById('hud-combo').textContent =
      state.combo >= 5 ? `🏄 ${state.combo} FEVER (x2)` : `${state.combo} COMBO`;

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
    state.gateX = 760; // Starts on the right side of the 960px canvas

    const bonusPool = shuffle(['star', 'heart', 'shield', 'none', 'none']);
    state.gateOptions = shuffle([
      { text: q.ans, isCorrect: true, bonus: bonusPool[0] },
      { text: q.w1, isCorrect: false, bonus: bonusPool[1] },
      { text: q.w2, isCorrect: false, bonus: bonusPool[2] }
    ]);

    document.getElementById('q-gate-num').textContent = `GATE #${state.gateCount} / ${state.targetGates}`;
    document.getElementById('q-prompt-text').innerHTML = KkachiMathData.renderMathText(q.q);

    state.gateOptions.forEach((opt, idx) => {
      const cardEl = document.getElementById(`plat-card-${idx}`);
      const floorName = idx === 0 ? '🔼 3층 구름 발판' : idx === 1 ? '➡️ 2층 다리 발판' : '🔽 1층 강변 발판';
      let bonusHtml = '';
      if (opt.bonus === 'star') bonusHtml = `<span style="color:#fde68a;">⭐2배</span>`;
      else if (opt.bonus === 'heart') bonusHtml = `<span style="color:#fecdd3;">❤️+1</span>`;
      else if (opt.bonus === 'shield') bonusHtml = `<span style="color:#a5f3fc;">🛡️방패</span>`;

      if (cardEl) {
        cardEl.className = `platform-card floor-${idx} ${idx === state.targetFloor ? 'target-floor' : ''}`;
        cardEl.innerHTML = `
          <div style="display:flex;justify-content:space-between;font-size:0.72rem;font-weight:900;color:#93c5fd;">
            <span>${floorName}</span>
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

  // Player clicks a platform or presses 1/2/3 -> Otter physically jumps in a parabolic arc to that floor AND sprints forward!
  function jumpToFloorAndDash(floorIdx) {
    if (!state.running || state.pausedForCrash || state.isDashing) return;
    KkachiSound.click();

    state.targetFloor = floorIdx;
    state.isDashing = true;

    // Launch parabolic jump arc toward the target floor height
    const targetY = FLOOR_Y[floorIdx];
    const dy = targetY - state.otterY;
    if (dy < -10) {
      // Jumping UP to 2층 or 3층 platform
      state.otterVy = dy < -120 ? -14.8 : -11.2;
    } else if (dy > 10) {
      // Diving DOWN to lower platform
      state.otterVy = -4.5;
    } else {
      // Hop on current floor
      state.otterVy = -7.5;
    }

    // Spawn burst of water/dust jump particles under otter's feet
    for (let i = 0; i < 8; i++) {
      state.dustParticles.push({
        x: state.otterX,
        y: state.otterY,
        vx: -2 - Math.random() * 4,
        vy: -1 - Math.random() * 3,
        size: 4 + Math.random() * 5,
        color: '#bae6fd',
        life: 1
      });
    }

    [0, 1, 2].forEach((i) => {
      const el = document.getElementById(`plat-card-${i}`);
      if (el) el.classList.toggle('target-floor', i === floorIdx);
    });
  }

  // Free jump when clicking the canvas track (to collect coins or hop while thinking)
  function freeHop() {
    if (!state.running || state.pausedForCrash || state.isDashing) return;
    if (state.otterJumpCount < 2) {
      KkachiSound.click();
      state.otterVy = -10.5;
      state.otterJumpCount += 1;
      for (let i = 0; i < 5; i++) {
        state.dustParticles.push({
          x: state.otterX - 10,
          y: state.otterY,
          vx: -2 - Math.random() * 3,
          vy: -Math.random() * 2,
          size: 4 + Math.random() * 4,
          color: '#e0f2fe',
          life: 1
        });
      }
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
  // 60FPS MAIN GAME LOOP & SIDE-SCROLLING WORLD RENDERER
  // =========================================================================
  function gameLoop(now) {
    if (!state.running) return;
    const dt = Math.min(50, now - state.lastFrameTime);
    state.lastFrameTime = now;
    const dtSec = dt / 1000;

    if (!state.pausedForCrash) {
      updatePhysics(now, dt, dtSec);
    }

    renderCanvasWorld();
    state.rafId = requestAnimationFrame(gameLoop);
  }

  function updatePhysics(now, dt, dtSec) {
    const feverMult = state.combo >= 5 ? 1.5 : 1;
    const dashMult = state.isDashing ? 4.2 : 1;
    const worldSpeed = 240 * feverMult * dashMult;

    // 1. Advance scrolling background & running distance
    state.scrollX += worldSpeed * dtSec;
    state.distance += 15 * feverMult * dashMult * dtSec;

    // 2. Advance Otter's leg running cycle phase
    state.otterPhase += dtSec * (state.isDashing ? 26 : 15) * feverMult;

    // Spawn footstep dust/splash puffs while running on ground
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

    // 3. Otter vertical jump & platform landing physics
    state.otterY += state.otterVy;
    state.otterVy += state.otterGravity;

    if (state.otterVy > 0 && state.otterY >= targetGroundY) {
      state.otterY = targetGroundY;
      state.otterVy = 0;
      state.otterJumpCount = 0;
    }

    // 4. Otter horizontal forward sprint!
    // When dashing, the otter physically runs forward toward the middle of the bridge (x = 340),
    // then smoothly cruises back to base position (x = 145) after breaking through!
    if (state.isDashing) {
      state.otterX += (350 - state.otterX) * 0.14;
    } else {
      state.otterX += (state.otterBaseX - state.otterX) * 0.08;
    }

    if (state.otterSpin > 0) {
      state.otterSpin = Math.max(0, state.otterSpin - dtSec * 12);
    }

    // 5. Move approaching 3-story Math Gate platforms
    const gateSpeed = state.isDashing
      ? 1450
      : (760 - state.otterBaseX) / (state.gateDurationMs / 1000);
    state.gateX -= gateSpeed * dtSec;

    // Sync HTML formula overlay position with Canvas gateX
    const overlay = document.getElementById('gates-overlay');
    if (overlay) {
      const leftPct = (state.gateX / 960) * 100;
      overlay.style.left = `${Math.max(4, leftPct)}%`;
    }

    const remSec = Math.max(0, (state.gateX - state.otterX) / Math.max(1, gateSpeed));
    const timeLbl = document.getElementById('q-time-label');
    if (timeLbl) {
      timeLbl.textContent = state.isDashing ? '🌊 점프 & 전력돌진!!' : `관문까지 ${remSec.toFixed(1)}초`;
    }

    // Check Gate collision when Otter reaches the Gate X!
    if (state.gateX <= state.otterX + 35) {
      resolveGateCollision();
    }

    // 6. Update floating collectible clams & fish
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
        // Sparkle particle
        for (let i = 0; i < 5; i++) {
          state.dustParticles.push({
            x: c.x,
            y: c.y,
            vx: (Math.random() - 0.5) * 6,
            vy: (Math.random() - 0.5) * 6,
            size: 4,
            color: '#fbbf24',
            life: 1
          });
        }
        continue;
      }
      if (c.x > -30) nextCoins.push(c);
    }
    state.coins = nextCoins;

    // 7. Update dust & celebration particles
    const nextParticles = [];
    for (const p of state.dustParticles) {
      p.x += p.vx;
      p.y += p.vy;
      p.life -= dtSec * 1.9;
      if (p.life > 0) nextParticles.push(p);
    }
    state.dustParticles = nextParticles;

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

    // 2. Parallax Clouds
    ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
    const cloudOffset = (state.scrollX * 0.18) % 320;
    for (let x = -cloudOffset; x < W + 100; x += 320) {
      drawCloud(ctx, x + 50, 48, 36);
      drawCloud(ctx, x + 210, 75, 26);
    }

    // 3. Parallax Distant Hills & Pine Trees
    ctx.fillStyle = 'rgba(6, 78, 59, 0.45)';
    const hillOffset = (state.scrollX * 0.35) % 400;
    for (let x = -hillOffset; x < W + 400; x += 400) {
      ctx.beginPath();
      ctx.moveTo(x, 308);
      ctx.quadraticCurveTo(x + 200, 195, x + 400, 308);
      ctx.fill();
    }

    // 4. 3-Story Running Tracks / Stepping Bridges
    // Floor 0 (3층 하늘 구름 다리 - y = 92)
    drawTrackBridge(ctx, W, FLOOR_Y[0], state.scrollX * 0.85, 'rgba(56, 189, 248, 0.25)', '#38bdf8');
    // Floor 1 (2층 나무 징검다리 - y = 200)
    drawTrackBridge(ctx, W, FLOOR_Y[1], state.scrollX * 0.95, 'rgba(16, 185, 129, 0.25)', '#34d399');
    // Floor 2 (1층 강변 메인 다리 - y = 308)
    drawMainGroundBridge(ctx, W, FLOOR_Y[2], state.scrollX);

    // 5. Collectible Floating Seashells & Stars
    for (const c of state.coins) {
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.beginPath();
      ctx.arc(0, 0, 11, 0, Math.PI * 2);
      ctx.fillStyle = c.type === 'clam' ? 'rgba(251, 191, 36, 0.25)' : 'rgba(56, 189, 248, 0.25)';
      ctx.fill();
      ctx.font = '18px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(c.type === 'clam' ? '🐚' : '⭐', 0, 1);
      ctx.restore();
    }

    // 6. Footstep Dust & Celebration Particles
    for (const p of state.dustParticles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 7. Speed lines during Dash or Fever
    if (state.isDashing || state.combo >= 5) {
      ctx.save();
      ctx.strokeStyle = state.combo >= 5 ? 'rgba(251, 191, 36, 0.45)' : 'rgba(125, 211, 252, 0.45)';
      ctx.lineWidth = 2.5;
      for (let i = 0; i < 6; i++) {
        const ly = 40 + ((i * 55 + state.scrollX) % 270);
        const lx = ((state.scrollX * 2 + i * 170) % W);
        ctx.beginPath();
        ctx.moveTo(W - lx, ly);
        ctx.lineTo(W - lx + 55, ly);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 8. Draw the Articulated Running & Jumping Cute Otter!
    const targetGroundY = FLOOR_Y[state.targetFloor];
    const isAirborne = Math.abs(state.otterY - targetGroundY) > 5;

    // Shadow under the otter on its target floor
    ctx.save();
    const shadowScale = Math.max(0.35, 1 - Math.abs(targetGroundY - state.otterY) / 180);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.beginPath();
    ctx.ellipse(state.otterX, targetGroundY + 2, 26 * shadowScale, 6 * shadowScale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    drawArticulatedOtter(ctx, state.otterX, state.otterY, state.otterPhase, {
      skin: state.skin,
      mood: state.otterMood,
      airborne: isAirborne,
      spin: state.otterSpin,
      fever: state.combo >= 5,
      shielded: state.hasShield,
      scale: 1.08
    });
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

    // Moving planks along the bridge
    const offset = scroll % 60;
    ctx.fillStyle = strokeCol;
    for (let x = -offset; x < W; x += 60) {
      ctx.fillRect(x, y + 1, 24, 4);
    }
    ctx.restore();
  }

  function drawMainGroundBridge(ctx, W, y, scroll) {
    ctx.save();
    // Grass / wooden riverbank deck
    ctx.fillStyle = '#065f46';
    ctx.fillRect(0, y, W, 16);
    ctx.fillStyle = '#10b981';
    ctx.fillRect(0, y, W, 5);

    // Moving bridge planks & water ripples
    const offset = scroll % 50;
    ctx.fillStyle = '#34d399';
    for (let x = -offset; x < W; x += 50) {
      ctx.fillRect(x, y + 6, 26, 5);
    }

    // Sparkling river waves at bottom
    const waveOffset = (scroll * 1.2) % 80;
    ctx.strokeStyle = 'rgba(186, 230, 253, 0.35)';
    ctx.lineWidth = 2;
    for (let x = -waveOffset; x < W; x += 80) {
      ctx.beginPath();
      ctx.moveTo(x, y + 32);
      ctx.quadraticCurveTo(x + 20, y + 26, x + 40, y + 32);
      ctx.stroke();
    }
    ctx.restore();
  }

  // =========================================================================
  // GATE COLLISION & CELEBRATION / CRASH EXPLANATION
  // =========================================================================
  function resolveGateCollision() {
    state.pausedForCrash = true;
    const pickedIdx = state.targetFloor;
    const pickedOpt = state.gateOptions[pickedIdx];
    const cardEl = document.getElementById(`plat-card-${pickedIdx}`);

    if (pickedOpt && pickedOpt.isCorrect) {
      // SUCCESSFUL JUMP & BREAKTHROUGH!
      if (cardEl) cardEl.classList.add('plat-correct');
      state.combo += 1;
      if (state.combo > state.maxCombo) state.maxCombo = state.combo;
      state.otterMood = 'happy';
      state.otterSpin = Math.PI * 2; // 360° celebratory backflip!

      // Burst of golden celebration particles
      for (let i = 0; i < 20; i++) {
        state.dustParticles.push({
          x: state.otterX + 20,
          y: state.otterY - 20,
          vx: (Math.random() - 0.3) * 10,
          vy: (Math.random() - 0.7) * 10,
          size: 4 + Math.random() * 5,
          color: i % 2 === 0 ? '#fbbf24' : '#34d399',
          life: 1.2
        });
      }

      let pts = 150 + (state.combo - 1) * 30;
      if (state.combo >= 5) pts *= 2;
      if (pickedOpt.bonus === 'star') pts *= 2;
      if (pickedOpt.bonus === 'heart' && state.hearts < state.maxHearts) state.hearts += 1;
      if (pickedOpt.bonus === 'shield') state.hasShield = true;

      state.score += pts;
      state.history.push({
        q: state.currentQ.q,
        ans: state.currentQ.ans,
        tip: state.currentQ.tip,
        passed: true
      });

      if (state.combo === 5) {
        KkachiSound.jackpot();
      } else {
        KkachiSound.correct(state.combo * 2);
      }

      updateHudUI();
      setTimeout(() => {
        state.pausedForCrash = false;
        spawnNextGate();
      }, 460);
    } else {
      // WRONG PLATFORM COLLISION!
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
        updateHudUI();
        setTimeout(() => {
          state.pausedForCrash = false;
          spawnNextGate();
        }, 650);
        return;
      }

      state.combo = 0;
      state.hearts -= 1;
      state.otterMood = 'hurt';
      KkachiSound.bomb();
      updateHudUI();

      const overlay = document.getElementById('crash-tip-overlay');
      document.getElementById('crash-correct-text').innerHTML =
        `✔ 정답 발판: ${KkachiMathData.renderMathText(state.currentQ.ans)}`;
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
      ? `🎉 10개 수학 관문 완주 성공!`
      : `🦦 아쉽게 체력 소진! (${Math.floor(state.distance)}m 질주)`;

    document.getElementById('result-desc').innerHTML =
      `최종 점수 <strong style="color:#fbbf24;">${state.score.toLocaleString()}점</strong> · 달린 거리 <strong style="color:#38bdf8;">${Math.floor(state.distance)}m</strong> · 관문 돌파 <strong style="color:#34d399;">${passedCount}/${state.history.length}</strong> · 최고 <strong>${state.maxCombo}콤보</strong>`;

    const reviewEl = document.getElementById('result-review-box');
    reviewEl.innerHTML =
      `<div style="font-weight:900;color:#38bdf8;margin-bottom:6px;">📘 이번 질주에서 만난 고1 수학 관문 복습</div>` +
      state.history
        .map((h, i) => `
          <div style="border-bottom:1px solid rgba(255,255,255,0.08);padding:6px 0;">
            <div style="font-weight:800;">
              ${h.passed ? '🟢' : '🔴'} #${i + 1}. ${KkachiMathData.renderMathText(h.q)}
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
      } else if (e.key === ' ') {
        e.preventDefault();
        freeHop();
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
