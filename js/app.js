/**
 * 수달런 3D (OTTER MATH RUN 3D) - 3인칭 원근 투영(Perspective 3D) & 3D 볼륨 셰이딩 런게임 엔진
 * 서브웨이 서퍼 / 템플런 스타일 좌·중·우 3레인 입체 다리 질주 및 3D 몬스터 격파 액션
 */
(function (global) {
  const SPEED_MAP = {
    slow: 9000,
    normal: 6500,
    fast: 4500
  };

  // 3D World X coordinates for the 3 Lanes (Left, Center, Right)
  const LANE_X = [-240, 0, 240];

  const state = {
    screen: 'intro', // 'intro' | 'game'
    skin: 'basic',   // 'basic' | 'scholar' | 'surfer' | 'king'
    chapterId: 'all',
    speedKey: 'normal',
    gateDurationMs: 6500,

    // Intro 3D preview animation
    introRafId: null,
    introPhase: 0,
    introZ: 0,

    // Active 3D run state
    running: false,
    pausedForCrash: false,
    isDashing: false,
    targetLane: 1, // 0 (Left), 1 (Center), 2 (Right)

    // 3D Otter coordinates (wx, wy, wz)
    otterX3D: 0,
    otterY3D: 0,
    otterVy3D: 0,
    otterZ3D: 125,
    otterRoll: 0,
    otterSpin: 0,
    otterPhase: 0,
    otterJumpCount: 0,
    otterMood: 'run',

    // 3D Camera state
    camX: 0,
    camY: 162,
    camRoll: 0,
    fov: 410,
    horizonY: 132,

    // 3D World objects & FX
    trackZ: 0,
    voxels3D: [],        // 3D explosion cubes & footstep splash particles
    projectiles3D: [],   // [{ x, y, z, targetX, rot }]
    flyingMonsters3D: [],// [{ x, y, z, vx, vy, vz, rot, vRot, laneType }]
    shockwaves3D: [],    // [{ x, y, z, r, life, color }]
    floatingTexts: [],   // [{ x, y, text, subText, color, life }]
    ultBeamLife: 0,
    coins3D: [],         // [{ x, y, z, type }]
    lastCoinSpawn: 0,

    // Game stats
    hearts: 5,
    maxHearts: 5,
    hasShield: false,
    freeShieldUsed: false,
    ultGauge: 35,
    distance: 0,
    score: 0,
    combo: 0,
    maxCombo: 0,
    gateCount: 0,
    targetGates: 10,

    // Approaching 3D Monster Wave
    questionPool: [],
    currentQ: null,
    gateOptions: [],
    monstersAlive: [true, true, true],
    monsterZ: 1180, // Approaches from Z=1180 down to Z=140
    history: [],

    lastFrameTime: 0,
    rafId: null,

    // PWA / Share URL
    deferredPrompt: null,
    shareUrl: null
  };

  // =========================================================================
  // 3D PERSPECTIVE PROJECTION & SHADED 3D PRIMITIVES
  // =========================================================================
  function project3D(wx, wy, wz, W, H, camX, camY, fov, horizonY) {
    const safeZ = Math.max(10, wz);
    const scale = fov / (fov + safeZ);
    const sx = W * 0.5 + (wx - camX) * scale;
    const sy = horizonY + (camY - wy) * scale;
    return { x: sx, y: sy, scale };
  }

  // Draws a 3D Phong-shaded sphere with specular light highlight
  function drawShadedSphere(ctx, x, y, r, baseCol, lightCol, darkCol) {
    if (r <= 0.5) return;
    ctx.save();
    const grad = ctx.createRadialGradient(
      x - r * 0.32,
      y - r * 0.35,
      r * 0.08,
      x,
      y,
      r
    );
    grad.addColorStop(0, lightCol);
    grad.addColorStop(0.55, baseCol);
    grad.addColorStop(1, darkCol);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // =========================================================================
  // 3D VOLUMETRIC CUTE OTTER MODEL (3rd-Person Rear/Dynamic Perspective)
  // =========================================================================
  function draw3DOtter(ctx, sx, sy, sc, phase, opts = {}) {
    const skin = opts.skin || 'basic';
    const roll = opts.roll || 0;
    const spin = opts.spin || 0;
    const airborne = Boolean(opts.airborne);
    const fever = Boolean(opts.fever);
    const shielded = Boolean(opts.shielded);

    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(sc, sc);

    // 1. 3D Ground Shadow on the bridge deck
    const shadowScale = Math.max(0.35, 1 - (opts.heightY || 0) / 160);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
    ctx.beginPath();
    ctx.ellipse(0, 6, 36 * shadowScale, 11 * shadowScale, 0, 0, Math.PI * 2);
    ctx.fill();

    // Apply jump height & banking roll
    const bounceY = airborne ? 0 : Math.abs(Math.sin(phase)) * -7;
    ctx.translate(0, -32 + bounceY);
    ctx.rotate(roll + spin);

    // 2. 3D Hoverboard / Surfboard underneath (if surfer skin or 5+ combo FEVER)
    if (skin === 'surfer' || fever) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(0, -18);
      ctx.quadraticCurveTo(32, 10, 26, 36);
      ctx.lineTo(-26, 36);
      ctx.quadraticCurveTo(-32, 10, 0, -18);
      ctx.closePath();
      const bGrad = ctx.createLinearGradient(-26, 0, 26, 0);
      bGrad.addColorStop(0, fever ? '#f59e0b' : '#0284c7');
      bGrad.addColorStop(0.5, fever ? '#fef08a' : '#38bdf8');
      bGrad.addColorStop(1, fever ? '#d97706' : '#0369a1');
      ctx.fillStyle = bGrad;
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      ctx.restore();
    }

    // 3. Alternating 3D Hind Feet kicking up toward the camera!
    const leftLegSin = Math.sin(phase);
    const rightLegSin = -Math.sin(phase);

    // Left Foot (3D shaded paw)
    draw3DPaw(ctx, -17, 22 + leftLegSin * 9, 10 + leftLegSin * 2.5);
    // Right Foot
    draw3DPaw(ctx, 17, 22 + rightLegSin * 9, 10 + rightLegSin * 2.5);

    // 4. 3D Swinging Arms on the sides holding Golden Seashell
    const armSwing = Math.cos(phase) * 7;
    drawShadedSphere(ctx, -26, 2 - armSwing, 8.5, '#8b5428', '#b87a44', '#4a290e');
    drawShadedSphere(ctx, 26, 2 + armSwing, 8.5, '#8b5428', '#b87a44', '#4a290e');

    // Golden Seashell glowing next to right paw
    drawShadedSphere(ctx, 31, -2 + armSwing, 6.5, '#f59e0b', '#fef08a', '#92400e');

    // 5. 3D Volumetric Plump Otter Torso
    drawShadedSphere(ctx, 0, 6, 25, '#9a6232', '#c68b59', '#4a290e');
    // Soft Cream Fur Trim visible around neck/sides
    ctx.fillStyle = '#fde6c4';
    ctx.beginPath();
    ctx.ellipse(0, -7, 19, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    // 6. 3D Wagging Otter Tail (protruding toward the camera in 3D!)
    const tailSwingX = Math.sin(phase * 1.1) * 9;
    const tailSwingY = Math.cos(phase * 2.2) * 3;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(-9, 16);
    ctx.quadraticCurveTo(tailSwingX * 0.5, 32 + tailSwingY, tailSwingX, 42 + tailSwingY);
    ctx.quadraticCurveTo(tailSwingX * 0.5 + 8, 32 + tailSwingY, 9, 16);
    ctx.closePath();
    const tGrad = ctx.createLinearGradient(-10, 16, 10, 42);
    tGrad.addColorStop(0, '#7c4a21');
    tGrad.addColorStop(0.5, '#a46a38');
    tGrad.addColorStop(1, '#3b200b');
    ctx.fillStyle = tGrad;
    ctx.fill();
    ctx.restore();

    // 7. 3D Royal Cape (if King skin)
    if (skin === 'king') {
      ctx.save();
      const wave = Math.sin(phase * 1.5) * 6;
      ctx.beginPath();
      ctx.moveTo(-16, -8);
      ctx.lineTo(16, -8);
      ctx.lineTo(24 + wave, 26);
      ctx.quadraticCurveTo(0, 32, -24 + wave, 26);
      ctx.closePath();
      const cGrad = ctx.createLinearGradient(-20, -8, 20, 28);
      cGrad.addColorStop(0, '#f43f5e');
      cGrad.addColorStop(0.5, '#e11d48');
      cGrad.addColorStop(1, '#881337');
      ctx.fillStyle = cGrad;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#fbbf24';
      ctx.stroke();
      ctx.restore();
    }

    // 8. 3D Volumetric Otter Head & Chubby Cheeks
    const headTurn = roll * 18;
    ctx.save();
    ctx.translate(headTurn, -18);

    // 3D Left & Right Round Ears
    drawShadedSphere(ctx, -18, -11, 7.5, '#7c4a21', '#a46a38', '#3b200b');
    drawShadedSphere(ctx, -18, -11, 3.8, '#f5cba7', '#fde6c4', '#c68b59');
    drawShadedSphere(ctx, 18, -11, 7.5, '#7c4a21', '#a46a38', '#3b200b');
    drawShadedSphere(ctx, 18, -11, 3.8, '#f5cba7', '#fde6c4', '#c68b59');

    // Chubby Left & Right Cream Cheeks peeking from sides
    drawShadedSphere(ctx, -15, 3, 9, '#fde6c4', '#ffffff', '#d6b48c');
    drawShadedSphere(ctx, 15, 3, 9, '#fde6c4', '#ffffff', '#d6b48c');
    // Rosy Pink Blushes on cheeks
    ctx.fillStyle = 'rgba(251, 113, 133, 0.75)';
    ctx.beginPath();
    ctx.arc(-19, 3, 3.8, 0, Math.PI * 2);
    ctx.arc(19, 3, 3.8, 0, Math.PI * 2);
    ctx.fill();

    // Main 3D Head Sphere
    drawShadedSphere(ctx, 0, -2, 19.5, '#9a6232', '#d29968', '#4a290e');

    // 3D Headgear based on Skin
    if (skin === 'scholar') {
      // 3D Mortarboard Graduation Cap
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.moveTo(0, -27);
      ctx.lineTo(24, -18);
      ctx.lineTo(0, -10);
      ctx.lineTo(-24, -18);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      // Swinging Gold Tassel
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(16, -16);
      ctx.lineTo(21 + Math.sin(phase) * 3, -4);
      ctx.stroke();
    } else if (skin === 'surfer') {
      // 3D Neon Headband & Goggles Strap
      ctx.fillStyle = '#06b6d4';
      ctx.fillRect(-19, -8, 38, 6);
      ctx.strokeStyle = '#e0f2fe';
      ctx.lineWidth = 1.4;
      ctx.strokeRect(-19, -8, 38, 6);
    } else if (skin === 'king') {
      // 3D Golden Crown
      ctx.beginPath();
      ctx.moveTo(-13, -15);
      ctx.lineTo(-15, -28);
      ctx.lineTo(-6, -20);
      ctx.lineTo(0, -31);
      ctx.lineTo(6, -20);
      ctx.lineTo(15, -28);
      ctx.lineTo(13, -15);
      ctx.closePath();
      const crGrad = ctx.createLinearGradient(-14, -30, 14, -15);
      crGrad.addColorStop(0, '#fef08a');
      crGrad.addColorStop(0.5, '#f59e0b');
      crGrad.addColorStop(1, '#b45309');
      ctx.fillStyle = crGrad;
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    ctx.restore(); // End Head

    // 9. 3D Spherical Energy Shield Bubble
    if (shielded) {
      drawShadedSphere(
        ctx,
        0,
        -2,
        48,
        'rgba(56, 189, 248, 0.14)',
        'rgba(224, 242, 254, 0.38)',
        'rgba(2, 132, 199, 0.28)'
      );
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, -2, 48, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }

  function draw3DPaw(ctx, x, y, r) {
    drawShadedSphere(ctx, x, y, r, '#5c3415', '#8b5428', '#2a1505');
    // Cute pink paw pad visible when foot kicks up!
    ctx.fillStyle = '#fda4af';
    ctx.beginPath();
    ctx.arc(x, y + 1, r * 0.42, 0, Math.PI * 2);
    ctx.fill();
  }

  // =========================================================================
  // 3D VOLUMETRIC MONSTERS APPROACHING ALONG THE Z-AXIS
  // =========================================================================
  function draw3DMonster(ctx, sx, sy, sc, laneType, phase, isKO = false, rot = 0) {
    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(sc, sc);

    // 3D Ground Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.ellipse(0, 6, 40, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    const bob = isKO ? 0 : Math.sin(phase * 1.5 + laneType) * 8;
    ctx.translate(0, -34 + bob);
    if (rot !== 0) ctx.rotate(rot);

    if (laneType === 0) {
      // Left Lane: 🦇 3D 다크 배트 (3D Winged Bat Demon)
      const flap = isKO ? 0 : Math.sin(phase * 2.5) * 18;
      ctx.fillStyle = '#5b21b6';
      ctx.strokeStyle = '#c4b5fd';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-15, 0);
      ctx.quadraticCurveTo(-52, -26 + flap, -58, 12 + flap);
      ctx.quadraticCurveTo(-34, 14, -15, 10);
      ctx.moveTo(15, 0);
      ctx.quadraticCurveTo(52, -26 + flap, 58, 12 + flap);
      ctx.quadraticCurveTo(34, 14, 15, 10);
      ctx.fill();
      ctx.stroke();

      drawShadedSphere(ctx, 0, 0, 28, '#6d28d9', '#a78bfa', '#2e1065');
    } else if (laneType === 1) {
      // Center Lane: 👹 3D 아이언 고블린 (3D Horned Goblin Brute)
      // 3D Golden Horns
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.moveTo(-20, -14); ctx.lineTo(-34, -38); ctx.lineTo(-8, -24);
      ctx.moveTo(20, -14); ctx.lineTo(34, -38); ctx.lineTo(8, -24);
      ctx.fill();

      drawShadedSphere(ctx, 0, 2, 31, '#e11d48', '#fda4af', '#4c0519');
    } else {
      // Right Lane: 👾 3D 킹 슬라임 (3D Glossy Jelly Slime)
      drawShadedSphere(ctx, 0, 4, 32, '#10b981', '#a7f3d0', '#064e3b');
      // 3D Mini Crown on King Slime
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.moveTo(-12, -24); ctx.lineTo(-14, -36); ctx.lineTo(0, -28); ctx.lineTo(14, -36); ctx.lineTo(12, -24);
      ctx.closePath();
      ctx.fill();
    }

    // 3D Monster Glowing Face
    if (isKO) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(-14, -6); ctx.lineTo(-5, 3);
      ctx.moveTo(-5, -6); ctx.lineTo(-14, 3);
      ctx.moveTo(5, -6); ctx.lineTo(14, 3);
      ctx.moveTo(14, -6); ctx.lineTo(5, 3);
      ctx.stroke();
    } else {
      drawShadedSphere(ctx, -10, -3, 6, '#fef08a', '#ffffff', '#ca8a04');
      drawShadedSphere(ctx, 10, -3, 6, '#fef08a', '#ffffff', '#ca8a04');
      ctx.fillStyle = '#dc2626';
      ctx.beginPath();
      ctx.arc(-10, -3, 2.6, 0, Math.PI * 2);
      ctx.arc(10, -3, 2.6, 0, Math.PI * 2);
      ctx.fill();

      // Fangs
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(-11, 10); ctx.lineTo(-7, 18); ctx.lineTo(-3, 10);
      ctx.moveTo(3, 10); ctx.lineTo(7, 18); ctx.lineTo(11, 10);
      ctx.fill();

      // 3D Floating Number Badge (1, 2, 3) above Monster Head
      const badgeCol = laneType === 0 ? '#8b5cf6' : laneType === 1 ? '#f43f5e' : '#10b981';
      drawShadedSphere(ctx, 0, -48, 15, badgeCol, '#ffffff', '#0f172a');
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 17px Pretendard, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(laneType + 1), 0, -47);
    }

    ctx.restore();
  }

  // =========================================================================
  // INTRO 3D MINI PREVIEW LOOP
  // =========================================================================
  function startIntroPreviewLoop() {
    if (state.introRafId) cancelAnimationFrame(state.introRafId);
    const canvas = document.getElementById('intro-otter-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;

    function frame() {
      if (state.screen !== 'intro') return;
      state.introPhase += 0.22;
      state.introZ = (state.introZ + 14) % 80;

      // Sky & 3D Bridge Preview
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#090d16');
      sky.addColorStop(0.38, '#1e1b4b');
      sky.addColorStop(0.4, '#0c4a6e');
      sky.addColorStop(1, '#042f2e');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);

      // Draw Mini 3D Perspective Road
      const horY = 46;
      for (let z = 640; z >= 20; z -= 80) {
        const z1 = z - state.introZ;
        const z2 = z1 - 80;
        if (z2 < 10) continue;
        const p1L = project3D(-220, 0, z1, W, H, 0, 110, 180, horY);
        const p1R = project3D(220, 0, z1, W, H, 0, 110, 180, horY);
        const p2L = project3D(-220, 0, z2, W, H, 0, 110, 180, horY);
        const p2R = project3D(220, 0, z2, W, H, 0, 110, 180, horY);

        ctx.fillStyle = Math.floor(z / 80) % 2 === 0 ? '#0f172a' : '#1e293b';
        ctx.beginPath();
        ctx.moveTo(p1L.x, p1L.y);
        ctx.lineTo(p1R.x, p1R.y);
        ctx.lineTo(p2R.x, p2R.y);
        ctx.lineTo(p2L.x, p2L.y);
        ctx.closePath();
        ctx.fill();
      }

      // Gently swaying 3D Otter in preview
      const swayX = Math.sin(state.introPhase * 0.25) * 45;
      const pOtter = project3D(swayX, 0, 90, W, H, 0, 110, 180, horY);
      draw3DOtter(ctx, pOtter.x, pOtter.y, pOtter.scale * 1.15, state.introPhase, {
        skin: state.skin,
        roll: Math.cos(state.introPhase * 0.25) * 0.12
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
  // MAIN 3D RUNNER GAMEPLAY
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
    state.targetLane = 1;
    state.otterX3D = 0;
    state.otterY3D = 0;
    state.otterVy3D = 0;
    state.otterRoll = 0;
    state.otterSpin = 0;
    state.otterPhase = 0;
    state.otterJumpCount = 0;

    state.camX = 0;
    state.trackZ = 0;
    state.voxels3D = [];
    state.projectiles3D = [];
    state.flyingMonsters3D = [];
    state.shockwaves3D = [];
    state.floatingTexts = [];
    state.ultBeamLife = 0;
    state.coins3D = [];

    state.hearts = 5;
    state.hasShield = false;
    state.freeShieldUsed = false;
    state.ultGauge = 35;
    state.distance = 0;
    state.score = 0;
    state.combo = 0;
    state.maxCombo = 0;
    state.gateCount = 0;
    state.history = [];

    const shieldBtn = document.getElementById('btn-shield-chance');
    if (shieldBtn) {
      shieldBtn.disabled = false;
      shieldBtn.textContent = '🛡️ 3D 방어막(1회)';
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
    void wrap.offsetWidth;
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
        ultBtn.textContent = '🔥 3D 메가 워터캐논 발사! (100%)';
      } else {
        ultBtn.disabled = true;
        ultBtn.className = 'btn';
        ultBtn.textContent = `⚡ 3D 필살기 충전 (${Math.floor(state.ultGauge)}%)`;
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
    state.otterSpin = 0;
    state.monsterZ = 1220; // Starts far in the 3D horizon!
    state.monstersAlive = [true, true, true];
    state.projectiles3D = [];

    const bonusPool = shuffle(['star', 'heart', 'shield', 'none', 'none']);
    state.gateOptions = shuffle([
      { text: q.ans, isCorrect: true, bonus: bonusPool[0] },
      { text: q.w1, isCorrect: false, bonus: bonusPool[1] },
      { text: q.w2, isCorrect: false, bonus: bonusPool[2] }
    ]);

    document.getElementById('q-gate-num').textContent = `3D WAVE #${state.gateCount} / ${state.targetGates}`;
    document.getElementById('q-prompt-text').innerHTML = KkachiMathData.renderMathText(q.q);

    state.gateOptions.forEach((opt, idx) => {
      const cardEl = document.getElementById(`plat-card-${idx}`);
      const monName = idx === 0 ? '⬅️ ①번 다크배트 (왼쪽)' : idx === 1 ? '⬆️ ②번 고블린 (중앙)' : '➡️ ③번 킹슬라임 (오른쪽)';
      let bonusHtml = '';
      if (opt.bonus === 'star') bonusHtml = `<span style="color:#fde68a;">⭐2배</span>`;
      else if (opt.bonus === 'heart') bonusHtml = `<span style="color:#fecdd3;">❤️+1</span>`;
      else if (opt.bonus === 'shield') bonusHtml = `<span style="color:#a5f3fc;">🛡️방패</span>`;

      if (cardEl) {
        cardEl.className = `holo-shield lane-${idx} ${idx === state.targetLane ? 'selected-lane' : ''}`;
        cardEl.innerHTML = `
          <div style="display:flex;justify-content:space-between;font-size:0.75rem;font-weight:900;color:#7dd3fc;">
            <span>${monName}</span>
            ${bonusHtml}
          </div>
          <div style="font-size:1.1rem;font-weight:900;color:#fff;text-align:center;margin:auto 0;">
            ${KkachiMathData.renderMathText(opt.text)}
          </div>
        `;
      }

      const ctrlEl = document.getElementById(`ctrl-text-${idx}`);
      if (ctrlEl) ctrlEl.innerHTML = KkachiMathData.renderMathText(opt.text);
    });
  }

  // Player clicks Left(0), Center(1), or Right(2) Lane -> 3D Otter banks into that lane, jumps, and fires 3D Water Cannon!
  function jumpToFloorAndDash(laneIdx) {
    if (!state.running || state.pausedForCrash || state.isDashing) return;
    KkachiSound.shoot();

    state.targetLane = laneIdx;
    state.isDashing = true;
    state.otterVy3D = 12.5; // 3D jump upward (+Y in 3D world)

    const targetX = LANE_X[laneIdx];
    state.projectiles3D.push({
      x: state.otterX3D,
      y: state.otterY3D + 28,
      z: state.otterZ3D + 30,
      targetX,
      rot: 0
    });

    [0, 1, 2].forEach((i) => {
      const el = document.getElementById(`plat-card-${i}`);
      if (el) el.classList.toggle('selected-lane', i === laneIdx);
    });
  }

  // 3D MEGA WATER BREATH ULTIMATE (Blasts all 3 3D Monsters into the sky!)
  function fireUltimateSkill() {
    if (!state.running || state.pausedForCrash || state.ultGauge < 100) return;
    state.ultGauge = 0;
    state.pausedForCrash = true;
    state.ultBeamLife = 1.0;
    KkachiSound.ultimate();
    triggerScreenShake();

    [0, 1, 2].forEach((ln) => {
      state.monstersAlive[ln] = false;
      const cardEl = document.getElementById(`plat-card-${ln}`);
      if (cardEl) cardEl.classList.add('shield-ko');

      state.flyingMonsters3D.push({
        x: LANE_X[ln],
        y: 10,
        z: state.monsterZ,
        vx: (ln - 1) * 14,
        vy: 20 + Math.random() * 6,
        vz: 28,
        rot: 0,
        vRot: 0.38,
        laneType: ln
      });

      state.shockwaves3D.push({
        x: LANE_X[ln],
        y: 35,
        z: state.monsterZ,
        r: 10,
        life: 1.0,
        color: '#fbbf24'
      });
    });

    state.floatingTexts.push({
      x: 480,
      y: 155,
      text: '🌈 3D HYPER WATER BREATH!! 99,999 DMG!',
      subText: '좌·중·우 3D 몬스터 전원 일격 폭파! (+500점)',
      color: '#fde68a',
      life: 1.5
    });

    state.combo += 1;
    if (state.combo > state.maxCombo) state.maxCombo = state.combo;
    state.score += 500;
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
      state.otterVy3D = 12;
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
      btn.textContent = '🛡️ 방어막 장착됨';
    }
    updateHudUI();
  }

  // =========================================================================
  // 60FPS 3D WORLD PHYSICS & PERSPECTIVE RENDERER
  // =========================================================================
  function gameLoop(now) {
    if (!state.running) return;
    const dt = Math.min(50, now - state.lastFrameTime);
    state.lastFrameTime = now;
    const dtSec = dt / 1000;

    if (!state.pausedForCrash) {
      update3DPhysics(now, dtSec);
    }
    update3DActionFX(dtSec);
    render3DWorld();
    state.rafId = requestAnimationFrame(gameLoop);
  }

  function update3DPhysics(now, dtSec) {
    const feverMult = state.combo >= 5 ? 1.45 : 1;
    const dashMult = state.isDashing ? 4.2 : 1;
    const speedZ = 480 * feverMult * dashMult;

    state.trackZ += speedZ * dtSec;
    state.distance += 16 * feverMult * dashMult * dtSec;
    state.otterPhase += dtSec * (state.isDashing ? 26 : 16) * feverMult;

    // 1. 3D Lane Banking Movement (wx)
    const targetX = LANE_X[state.targetLane];
    const dx = targetX - state.otterX3D;
    state.otterX3D += dx * 0.18;
    state.otterRoll = Math.max(-0.35, Math.min(0.35, dx * 0.0022));

    // Smooth 3rd-person Camera Follow & Dynamic FOV Zoom
    state.camX += (state.otterX3D * 0.36 - state.camX) * 0.14;
    const targetFov = state.isDashing ? 345 : 410;
    state.fov += (targetFov - state.fov) * 0.15;

    // 2. 3D Jump Gravity (wy)
    state.otterY3D += state.otterVy3D;
    state.otterVy3D -= 0.72;
    if (state.otterY3D <= 0) {
      state.otterY3D = 0;
      state.otterVy3D = 0;
      state.otterJumpCount = 0;
    }

    if (state.otterSpin > 0) {
      state.otterSpin = Math.max(0, state.otterSpin - dtSec * 12);
    }

    // Spawn 3D footstep splash cubes under otter's paws
    if (state.otterY3D <= 2 && Math.random() < 0.4) {
      state.voxels3D.push({
        x: state.otterX3D + (Math.random() - 0.5) * 26,
        y: 4,
        z: state.otterZ3D - 10,
        vx: (Math.random() - 0.5) * 3,
        vy: 2 + Math.random() * 3,
        vz: -8,
        size: 6,
        color: state.combo >= 5 ? '#fde68a' : '#7dd3fc',
        life: 0.8
      });
    }

    // 3. Move 3D Projectiles down the Z-axis toward monsterZ
    for (const p of state.projectiles3D) {
      p.z += 2400 * dtSec;
      p.x += (p.targetX - p.x) * 0.28;
      p.rot += 20 * dtSec;
    }

    // 4. Move approaching 3D Monsters along the Z-axis (from Z=1220 to Z=130)
    const monSpeedZ = state.isDashing
      ? 2300
      : (1220 - state.otterZ3D) / (state.gateDurationMs / 1000);
    state.monsterZ -= monSpeedZ * dtSec;

    const remSec = Math.max(0, (state.monsterZ - state.otterZ3D) / Math.max(1, monSpeedZ));
    const timeLbl = document.getElementById('q-time-label');
    if (timeLbl) {
      timeLbl.textContent = state.isDashing ? '🌊 3D 워터캐논 발사!!' : `충돌까지 ${remSec.toFixed(1)}초`;
    }

    // Check 3D Collision!
    const projHit = state.projectiles3D.some((p) => p.z >= state.monsterZ - 40);
    if (projHit || state.monsterZ <= state.otterZ3D + 35) {
      state.projectiles3D = [];
      resolve3DMonsterCollision();
    }

    // 5. Spawn & move 3D Rotating Golden Seashell Coins along the 3 lanes
    if (now - state.lastCoinSpawn > 750) {
      state.lastCoinSpawn = now;
      const ln = Math.floor(Math.random() * 3);
      state.coins3D.push({
        x: LANE_X[ln],
        y: 18,
        z: 1150
      });
    }

    const nextCoins = [];
    for (const c of state.coins3D) {
      c.z -= speedZ * dtSec;
      if (Math.abs(c.z - state.otterZ3D) < 45 && Math.abs(c.x - state.otterX3D) < 55) {
        state.score += 20;
        state.ultGauge = Math.min(100, state.ultGauge + 5);
        continue;
      }
      if (c.z > 20) nextCoins.push(c);
    }
    state.coins3D = nextCoins;

    updateHudUI();
  }

  function update3DActionFX(dtSec) {
    state.flyingMonsters3D = state.flyingMonsters3D.filter((m) => {
      m.x += m.vx;
      m.y += m.vy;
      m.z += m.vz;
      m.vy -= 0.65;
      m.rot += m.vRot;
      return m.y > -100 && m.z < 2200;
    });

    state.shockwaves3D = state.shockwaves3D.filter((sw) => {
      sw.r += 260 * dtSec;
      sw.life -= dtSec * 2.4;
      return sw.life > 0;
    });

    state.voxels3D = state.voxels3D.filter((v) => {
      v.x += v.vx;
      v.y += v.vy;
      v.z += v.vz;
      v.vy -= 0.45;
      v.life -= dtSec * 1.6;
      return v.life > 0 && v.z > 10;
    });

    state.floatingTexts = state.floatingTexts.filter((ft) => {
      ft.y -= 42 * dtSec;
      ft.life -= dtSec * 1.1;
      return ft.life > 0;
    });

    if (state.ultBeamLife > 0) {
      state.ultBeamLife = Math.max(0, state.ultBeamLife - dtSec * 1.6);
    }
  }

  function render3DWorld() {
    const canvas = document.getElementById('runner-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    const camX = state.camX;
    const camY = state.camY;
    const fov = state.fov;
    const horY = state.horizonY;

    // 1. 3D Sky & Glowing Horizon Sun
    const skyGrad = ctx.createLinearGradient(0, 0, 0, H);
    skyGrad.addColorStop(0, '#050811');
    skyGrad.addColorStop(0.28, '#1e1b4b');
    skyGrad.addColorStop(0.31, '#0284c7');
    skyGrad.addColorStop(0.34, '#082f49');
    skyGrad.addColorStop(1, '#022c22');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, H);

    // Glowing 3D Cyber-Sun at Horizon
    const sunGrad = ctx.createRadialGradient(W * 0.5 - camX * 0.15, horY, 10, W * 0.5 - camX * 0.15, horY, 110);
    sunGrad.addColorStop(0, 'rgba(253, 224, 71, 0.55)');
    sunGrad.addColorStop(0.5, 'rgba(244, 63, 94, 0.22)');
    sunGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = sunGrad;
    ctx.beginPath();
    ctx.arc(W * 0.5 - camX * 0.15, horY, 110, 0, Math.PI * 2);
    ctx.fill();

    // 2. 3D Perspective Bridge Segments (from Z=1400 down to Z=10)
    const segLen = 70;
    const zOffset = state.trackZ % segLen;

    for (let z = 1400; z >= 20; z -= segLen) {
      const zFar = z - zOffset;
      const zNear = zFar - segLen;
      if (zNear < 10) continue;

      const pFarL = project3D(-330, 0, zFar, W, H, camX, camY, fov, horY);
      const pFarR = project3D(330, 0, zFar, W, H, camX, camY, fov, horY);
      const pNearL = project3D(-330, 0, zNear, W, H, camX, camY, fov, horY);
      const pNearR = project3D(330, 0, zNear, W, H, camX, camY, fov, horY);

      const isEven = Math.floor((z + state.trackZ) / segLen) % 2 === 0;

      // Main 3D Bridge Deck Quad
      ctx.fillStyle = isEven ? '#0f172a' : '#172554';
      ctx.beginPath();
      ctx.moveTo(pFarL.x, pFarL.y);
      ctx.lineTo(pFarR.x, pFarR.y);
      ctx.lineTo(pNearR.x, pNearR.y);
      ctx.lineTo(pNearL.x, pNearL.y);
      ctx.closePath();
      ctx.fill();

      // 3D Glowing Side Curbs / Guardrails
      ctx.strokeStyle = isEven ? '#38bdf8' : '#10b981';
      ctx.lineWidth = Math.max(1.5, 6 * pNearL.scale);
      ctx.beginPath();
      ctx.moveTo(pFarL.x, pFarL.y);
      ctx.lineTo(pNearL.x, pNearL.y);
      ctx.moveTo(pFarR.x, pFarR.y);
      ctx.lineTo(pNearR.x, pNearR.y);
      ctx.stroke();

      // 3D Neon Lane Dividers (between Left/Center and Center/Right)
      if (isEven) {
        [-105, 105].forEach((divX) => {
          const dFar = project3D(divX, 0, zFar, W, H, camX, camY, fov, horY);
          const dNear = project3D(divX, 0, zNear, W, H, camX, camY, fov, horY);
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
          ctx.lineWidth = Math.max(1, 3.5 * dNear.scale);
          ctx.beginPath();
          ctx.moveTo(dFar.x, dFar.y);
          ctx.lineTo(dNear.x, dNear.y);
          ctx.stroke();
        });
      }

      // 3D Roadside Crystal Lamp Pillars passing by
      if (Math.floor((z + state.trackZ) / segLen) % 3 === 0) {
        [-365, 365].forEach((pillarX) => {
          const pBase = project3D(pillarX, 0, zNear, W, H, camX, camY, fov, horY);
          const pTop = project3D(pillarX, 85, zNear, W, H, camX, camY, fov, horY);
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
          ctx.lineWidth = Math.max(1.5, 8 * pBase.scale);
          ctx.beginPath();
          ctx.moveTo(pBase.x, pBase.y);
          ctx.lineTo(pTop.x, pTop.y);
          ctx.stroke();
          drawShadedSphere(ctx, pTop.x, pTop.y, Math.max(2, 10 * pTop.scale), '#38bdf8', '#ffffff', '#0284c7');
        });
      }
    }

    // 3. Draw 3D Rotating Golden Seashell Coins
    for (const c of state.coins3D) {
      const p = project3D(c.x, c.y, c.z, W, H, camX, camY, fov, horY);
      const r = Math.max(3, 18 * p.scale);
      const spinWidth = Math.max(0.25, Math.abs(Math.cos(state.otterPhase * 0.6 + c.z * 0.01)));
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.scale(spinWidth, 1);
      drawShadedSphere(ctx, 0, 0, r, '#f59e0b', '#fef08a', '#b45309');
      ctx.restore();
    }

    // 4. Draw Approaching 3D Monsters & 3D Laser Pointer Tethers from the Top 3 Formula Shields!
    const dockCentersX = [W * 0.175, W * 0.5, W * 0.825];
    const tetherColors = ['rgba(167, 139, 250, 0.45)', 'rgba(251, 113, 133, 0.45)', 'rgba(52, 211, 153, 0.45)'];

    [0, 1, 2].forEach((ln) => {
      if (!state.monstersAlive[ln]) return;

      const wx = LANE_X[ln];
      const pMon = project3D(wx, 0, state.monsterZ, W, H, camX, camY, fov, horY);

      // Dashed 3D Laser Tether connecting Top Formula Card to Approaching 3D Monster
      ctx.save();
      ctx.strokeStyle = tetherColors[ln];
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(dockCentersX[ln], 90);
      ctx.lineTo(pMon.x, pMon.y - 65 * pMon.scale);
      ctx.stroke();
      ctx.restore();

      draw3DMonster(ctx, pMon.x, pMon.y, pMon.scale * 1.45, ln, state.otterPhase * 0.5, false, 0);
    });

    // 5. Draw Ragdoll 3D Monsters blasted into the sky!
    for (const fm of state.flyingMonsters3D) {
      const p = project3D(fm.x, fm.y, fm.z, W, H, camX, camY, fov, horY);
      draw3DMonster(ctx, p.x, p.y, p.scale * 1.4, fm.laneType, 0, true, fm.rot);
    }

    // 6. Draw 3D Shockwave Rings & Projectiles
    for (const sw of state.shockwaves3D) {
      const p = project3D(sw.x, sw.y, sw.z, W, H, camX, camY, fov, horY);
      ctx.save();
      ctx.globalAlpha = sw.life;
      ctx.strokeStyle = sw.color;
      ctx.lineWidth = Math.max(2, 8 * p.scale * sw.life);
      ctx.beginPath();
      ctx.arc(p.x, p.y, sw.r * p.scale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    for (const pr of state.projectiles3D) {
      const p = project3D(pr.x, pr.y, pr.z, W, H, camX, camY, fov, horY);
      const r = Math.max(4, 24 * p.scale);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.35, 0, Math.PI * 2);
      ctx.stroke();
      drawShadedSphere(ctx, 0, 0, r, '#f59e0b', '#ffffff', '#b45309');
      ctx.restore();
    }

    // 7. Draw 3D Hyper Water Breath Ultimate Tunnel Beam!
    if (state.ultBeamLife > 0) {
      const pNear = project3D(state.otterX3D, 30, state.otterZ3D + 20, W, H, camX, camY, fov, horY);
      const pFarL = project3D(-280, 40, 1200, W, H, camX, camY, fov, horY);
      const pFarR = project3D(280, 40, 1200, W, H, camX, camY, fov, horY);
      ctx.save();
      ctx.globalAlpha = state.ultBeamLife;
      const bGrad = ctx.createLinearGradient(0, pFarL.y, 0, pNear.y);
      bGrad.addColorStop(0, '#f43f5e');
      bGrad.addColorStop(0.5, '#38bdf8');
      bGrad.addColorStop(1, '#fde68a');
      ctx.fillStyle = bGrad;
      ctx.beginPath();
      ctx.moveTo(pNear.x - 45, pNear.y);
      ctx.lineTo(pFarL.x, pFarL.y);
      ctx.lineTo(pFarR.x, pFarR.y);
      ctx.lineTo(pNear.x + 45, pNear.y);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // 8. Draw 3D Explosion Voxel Cubes
    for (const v of state.voxels3D) {
      const p = project3D(v.x, v.y, v.z, W, H, camX, camY, fov, horY);
      const sz = Math.max(2, v.size * p.scale * 1.5);
      ctx.save();
      ctx.globalAlpha = Math.max(0, v.life);
      ctx.fillStyle = v.color;
      ctx.fillRect(p.x - sz * 0.5, p.y - sz * 0.5, sz, sz);
      ctx.restore();
    }

    // 9. Draw the 3D Volumetric Cute Otter in the foreground (Z = 125)!
    const pOtter = project3D(state.otterX3D, state.otterY3D, state.otterZ3D, W, H, camX, camY, fov, horY);
    draw3DOtter(ctx, pOtter.x, pOtter.y, pOtter.scale * 1.38, state.otterPhase, {
      skin: state.skin,
      roll: state.otterRoll,
      spin: state.otterSpin,
      airborne: state.otterY3D > 3,
      heightY: state.otterY3D,
      fever: state.combo >= 5,
      shielded: state.hasShield
    });

    // 10. Draw Floating 3D Critical Damage Texts
    for (const ft of state.floatingTexts) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, ft.life);
      ctx.font = '900 26px Pretendard, sans-serif';
      ctx.textAlign = 'center';
      ctx.strokeStyle = '#050b14';
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

  // =========================================================================
  // 3D MONSTER SMASH RESOLUTION & 3D RAGDOLL KNOCKBACK
  // =========================================================================
  function resolve3DMonsterCollision() {
    state.pausedForCrash = true;
    const pickedIdx = state.targetLane;
    const pickedOpt = state.gateOptions[pickedIdx];
    const cardEl = document.getElementById(`plat-card-${pickedIdx}`);

    if (pickedOpt && pickedOpt.isCorrect) {
      // 3D MONSTER SMASHED!
      state.monstersAlive[pickedIdx] = false;
      if (cardEl) cardEl.classList.add('shield-correct', 'shield-ko');

      const hitX3D = LANE_X[pickedIdx];
      state.flyingMonsters3D.push({
        x: hitX3D,
        y: 15,
        z: state.monsterZ,
        vx: (pickedIdx - 1) * 12 + (Math.random() - 0.5) * 8,
        vy: 22,
        vz: 32,
        rot: 0,
        vRot: 0.4,
        laneType: pickedIdx
      });

      state.shockwaves3D.push({
        x: hitX3D,
        y: 35,
        z: state.monsterZ,
        r: 12,
        life: 1.0,
        color: '#fbbf24'
      });

      // 25 3D Voxel Explosion Cubes bursting toward camera!
      for (let i = 0; i < 25; i++) {
        state.voxels3D.push({
          x: hitX3D,
          y: 35,
          z: state.monsterZ,
          vx: (Math.random() - 0.5) * 22,
          vy: 4 + Math.random() * 14,
          vz: -10 - Math.random() * 18,
          size: 8 + Math.random() * 7,
          color: i % 2 === 0 ? '#fbbf24' : '#38bdf8',
          life: 1.1
        });
      }

      triggerScreenShake();

      state.combo += 1;
      if (state.combo > state.maxCombo) state.maxCombo = state.combo;
      state.ultGauge = Math.min(100, state.ultGauge + 35);
      state.otterSpin = Math.PI * 2;

      let pts = 150 + (state.combo - 1) * 30;
      if (state.combo >= 5) pts *= 2;
      if (pickedOpt.bonus === 'star') pts *= 2;
      if (pickedOpt.bonus === 'heart' && state.hearts < state.maxHearts) state.hearts += 1;
      if (pickedOpt.bonus === 'shield') state.hasShield = true;

      state.score += pts;

      state.floatingTexts.push({
        x: 480 + (pickedIdx - 1) * 140,
        y: 170,
        text: `💥 3D CRITICAL! ${999 + state.combo * 1000} DMG!`,
        subText: `3D 몬스터 격파! (+${pts}점)`,
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
      // WRONG 3D MONSTER COLLISION!
      if (cardEl) cardEl.classList.add('shield-wrong');
      state.gateOptions.forEach((o, i) => {
        if (o.isCorrect) {
          const el = document.getElementById(`plat-card-${i}`);
          if (el) el.classList.add('shield-correct');
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
          x: 480,
          y: 180,
          text: '🛡️ 3D 방어막으로 충돌 방어!',
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
      KkachiSound.bomb();
      triggerScreenShake();
      updateHudUI();

      const overlay = document.getElementById('crash-tip-overlay');
      document.getElementById('crash-correct-text').innerHTML =
        `✔ 정답 3D 몬스터 수식: ${KkachiMathData.renderMathText(state.currentQ.ans)}`;
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
      ? `🎉 10개 3D 몬스터 웨이브 완전 토벌!`
      : `🦦 아쉽게 체력 소진! (${Math.floor(state.distance)}m 질주)`;

    document.getElementById('result-desc').innerHTML =
      `최종 점수 <strong style="color:#fbbf24;">${state.score.toLocaleString()}점</strong> · 토벌 성공 <strong style="color:#34d399;">${passedCount}/${state.history.length}마리</strong> · 최고 <strong>${state.maxCombo}연속 격파</strong>`;

    const reviewEl = document.getElementById('result-review-box');
    reviewEl.innerHTML =
      `<div style="font-weight:900;color:#38bdf8;margin-bottom:6px;">📘 이번 3D 출격에서 격파한 고1 수학 수식 복습</div>` +
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
      if (e.key === '1' || e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        jumpToFloorAndDash(0);
      } else if (e.key === '2' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W' || e.key === 's' || e.key === 'S') {
        e.preventDefault();
        jumpToFloorAndDash(1);
      } else if (e.key === '3' || e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
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
