/**
 * 수달런 3D (OTTER MATH RUN 3D) - 3인칭 원근 투영(Perspective 3D) & 3D 볼륨 셰이딩 런게임 엔진
 * 서브웨이 서퍼 / 템플런 스타일 좌·중·우 3레인 입체 다리 질주 및 3D 몬스터 격파 액션
 */
(function (global) {
  const SPEED_MAP = {
    slow: 20000,
    normal: 15000,
    fast: 11000
  };

  // 3D World X coordinates for the 3 Lanes (Left, Center, Right)
  const LANE_X = [-325, 0, 325];

  const state = {
    screen: 'intro', // 'intro' | 'game'
    skin: 'basic',   // 'basic' | 'scholar' | 'surfer' | 'king'
    chapterId: 'all',
    speedKey: 'normal',
    gateDurationMs: 15000,

    // Intro 3D preview animation
    introRafId: null,
    introPhase: 0,
    introZ: 0,

    // Active 3D run state
    running: false,
    pausedForCrash: false,
    isDashing: false,
    targetLane: 1, // 0 (Left), 1 (Center), 2 (Right)

    // 3D Otter coordinates (wx, wy, wz) — Positioned at the very bottom foreground!
    otterX3D: 0,
    otterY3D: 0,
    otterVy3D: 0,
    otterZ3D: 55,
    otterRoll: 0,
    otterSpin: 0,
    otterPhase: 0,
    otterJumpCount: 0,
    otterMood: 'run',

    // 3D Camera state — Full-height runway from top horizon (y≈64px) to bottom edge (y=440px)
    camX: 0,
    camY: 515,
    camRoll: 0,
    fov: 380,
    horizonY: -42,

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

    // Approaching 3D Monster Wave & Thrill Mechanics
    questionPool: [],
    currentQ: null,
    gateOptions: [],
    selectedLane: null,
    hasSteeredThisWave: false,
    laneStayTimer: 0,
    monsterState: ['normal', 'normal', 'normal'],
    gateClearRunTimer: 0,
    monstersAlive: [true, true, true],
    monsterZ: 1180, // Approaches from Z=1180 down to Z=140
    isBossWave: false,
    isGoldenWave: false,
    waveStartTime: 0,
    isCounterDash: false,
    isQuickKillDash: false,
    slowMoTimer: 0,
    hitStopTimer: 0,
    lastHeartbeatTime: 0,
    otterTrails3D: [],
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
    // Wide-lane 3D perspective factor so the 3 Monster Characters & their Body Formula Shields never overlap!
    const xScale = W >= 700 ? (0.68 + 0.28 * scale) : scale;
    const sx = W * 0.5 + (wx - camX) * xScale;
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
  // 3D VOLUMETRIC MONSTERS WEARING THE ANSWER FORMULA ON THEIR BODIES!
  // =========================================================================
  function draw3DMonster(ctx, sx, sy, sc, laneType, phase, isKO = false, rot = 0) {
    ctx.save();
    ctx.translate(sx, sy);
    const bossScale = state.isBossWave && !isKO ? 1.18 : 1.0;
    ctx.scale(sc * bossScale, sc * bossScale);

    // 1. 3D Ground Shadow & Boss/Golden Glowing Floor Aura Ring
    ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
    ctx.beginPath();
    ctx.ellipse(0, 8, 56, 14, 0, 0, Math.PI * 2);
    ctx.fill();

    if (state.isBossWave && !isKO) {
      ctx.strokeStyle = '#f43f5e';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.ellipse(0, 8, 66 + Math.sin(phase * 3) * 5, 18, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (state.isGoldenWave && !isKO) {
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.ellipse(0, 8, 62 + Math.sin(phase * 3) * 4, 17, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 2. Monster Walking 3D Feet below its Body Formula Shield!
    const stepSin = isKO ? 0 : Math.sin(phase * 2.2 + laneType);
    const footCol = state.isGoldenWave
      ? ['#d97706', '#fef08a', '#78350f']
      : laneType === 0
        ? ['#4c1d95', '#a78bfa', '#1e1b4b']
        : laneType === 1
          ? ['#9f1239', '#fda4af', '#4c0519']
          : ['#065f46', '#6ee7b7', '#022c22'];
    drawShadedSphere(ctx, -22, -2 + stepSin * 7, 13, footCol[0], footCol[1], footCol[2]);
    drawShadedSphere(ctx, 22, -2 - stepSin * 7, 13, footCol[0], footCol[1], footCol[2]);

    const bob = 0; // No vertical bouncing so the formula on the character's body is 100% steady and easy to read!
    // Shift upward so the Monster's Torso (-45) holds the Body Formula Shield and its Head (-94) rises above the Shield!
    ctx.translate(0, -45 + bob);
    if (rot !== 0) ctx.rotate(rot);

    // 3. Monster Torso & Wide Wings/Arms holding the Body Formula Shield!
    if (state.isGoldenWave && !isKO) {
      drawShadedSphere(ctx, 0, 0, 44, '#f59e0b', '#fef9c3', '#92400e');
      drawShadedSphere(ctx, 0, -48, 28, '#f59e0b', '#fef9c3', '#92400e');
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.moveTo(-18, -62); ctx.lineTo(-32, -88); ctx.lineTo(-6, -70);
      ctx.moveTo(18, -62); ctx.lineTo(32, -88); ctx.lineTo(6, -70);
      ctx.fill();
    } else if (laneType === 0) {
      // Left Lane: 🦇 3D 다크 배트 (Wide Bat Wings flanking the Body Formula Shield + Head above!)
      const flap = isKO ? 0 : Math.sin(phase * 2.5) * 18;
      ctx.fillStyle = state.isBossWave ? '#991b1b' : '#5b21b6';
      ctx.strokeStyle = state.isBossWave ? '#fde047' : '#c4b5fd';
      ctx.lineWidth = 2.8;
      ctx.beginPath();
      ctx.moveTo(-25, -35);
      ctx.quadraticCurveTo(-88, -68 + flap, -96, -15 + flap);
      ctx.quadraticCurveTo(-60, -8, -25, -12);
      ctx.moveTo(25, -35);
      ctx.quadraticCurveTo(88, -68 + flap, 96, -15 + flap);
      ctx.quadraticCurveTo(60, -8, 25, -12);
      ctx.fill();
      ctx.stroke();

      drawShadedSphere(ctx, 0, 0, 42, '#5b21b6', '#8b5cf6', '#2e1065');
      drawShadedSphere(ctx, 0, -48, 27, '#6d28d9', '#a78bfa', '#2e1065');
      // Bat Ears
      ctx.fillStyle = '#4c1d95';
      ctx.beginPath();
      ctx.moveTo(-20, -64); ctx.lineTo(-28, -88); ctx.lineTo(-6, -72);
      ctx.moveTo(20, -64); ctx.lineTo(28, -88); ctx.lineTo(6, -72);
      ctx.fill();
    } else if (laneType === 1) {
      // Center Lane: 👹 3D 아이언 고블린 (Muscular Torso + Head & Golden Horns above the Formula Shield!)
      drawShadedSphere(ctx, 0, 2, 44, '#be123c', '#fb7185', '#4c0519');
      drawShadedSphere(ctx, 0, -48, 29, '#e11d48', '#fda4af', '#4c0519');
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.moveTo(-18, -62); ctx.lineTo(-36, -90); ctx.lineTo(-7, -72);
      ctx.moveTo(18, -62); ctx.lineTo(36, -90); ctx.lineTo(7, -72);
      ctx.fill();
    } else {
      // Right Lane: 👾 3D 킹 슬라임 (Giant Jelly Body + Cute Head & Crown above the Formula Shield!)
      drawShadedSphere(ctx, 0, 4, 46, '#059669', '#6ee7b7', '#064e3b');
      drawShadedSphere(ctx, 0, -46, 28, '#10b981', '#a7f3d0', '#064e3b');
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.moveTo(-14, -70); ctx.lineTo(-16, -86); ctx.lineTo(0, -76); ctx.lineTo(16, -86); ctx.lineTo(14, -70);
      ctx.closePath();
      ctx.fill();
    }

    // Boss Dragon Crown on Wave 5 & Wave 10
    if (state.isBossWave && !isKO) {
      ctx.fillStyle = '#fde047';
      ctx.strokeStyle = '#991b1b';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-18, -72);
      ctx.lineTo(-22, -92);
      ctx.lineTo(-8, -80);
      ctx.lineTo(0, -96);
      ctx.lineTo(8, -80);
      ctx.lineTo(22, -92);
      ctx.lineTo(18, -72);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // 4. Monster Face on the Head Sphere (at y = -48, right above the Body Formula Shield!)
    if (isKO) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(-14, -54); ctx.lineTo(-5, -45);
      ctx.moveTo(-5, -54); ctx.lineTo(-14, -45);
      ctx.moveTo(5, -54); ctx.lineTo(14, -45);
      ctx.moveTo(14, -54); ctx.lineTo(5, -45);
      ctx.stroke();
    } else {
      drawShadedSphere(ctx, -10, -51, 6.2, '#fef08a', '#ffffff', '#ca8a04');
      drawShadedSphere(ctx, 10, -51, 6.2, '#fef08a', '#ffffff', '#ca8a04');
      ctx.fillStyle = '#dc2626';
      ctx.beginPath();
      ctx.arc(-10, -51, 2.7, 0, Math.PI * 2);
      ctx.arc(10, -51, 2.7, 0, Math.PI * 2);
      ctx.fill();

      // Fangs peeking right over the top edge of the Body Formula Shield!
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(-11, -39); ctx.lineTo(-7, -30); ctx.lineTo(-3, -39);
      ctx.moveTo(3, -39); ctx.lineTo(7, -30); ctx.lineTo(11, -39);
      ctx.fill();

      // Visual 3D State Overlays on the Monster itself (Wrong Shield / Correct Halo)
      const mState = (state.monsterState && state.monsterState[laneType]) || 'normal';
      if (mState === 'wrong') {
        ctx.fillStyle = 'rgba(225, 29, 72, 0.26)';
        ctx.strokeStyle = '#f43f5e';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(0, -18, 56, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else if (mState === 'correct') {
        ctx.fillStyle = 'rgba(16, 185, 129, 0.25)';
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(0, -18, 56, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
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

      // Bright Blue Sky & Emerald Ocean 3D Bridge Preview
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#0284c7');
      sky.addColorStop(0.36, '#7dd3fc');
      sky.addColorStop(0.39, '#e0f2fe');
      sky.addColorStop(0.41, '#06b6d4');
      sky.addColorStop(1, '#10b981');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);

      // Little Fluffy Clouds in Intro Preview
      ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
      ctx.beginPath();
      ctx.arc(36, 22, 11, 0, Math.PI * 2);
      ctx.arc(48, 20, 14, 0, Math.PI * 2);
      ctx.arc(60, 23, 10, 0, Math.PI * 2);
      ctx.arc(140, 18, 10, 0, Math.PI * 2);
      ctx.arc(152, 16, 13, 0, Math.PI * 2);
      ctx.fill();

      // Draw Mini 3D Perspective Sunny Boardwalk Bridge
      const horY = 46;
      for (let z = 640; z >= 20; z -= 80) {
        const z1 = z - state.introZ;
        const z2 = z1 - 80;
        if (z2 < 10) continue;
        const p1L = project3D(-220, 0, z1, W, H, 0, 110, 180, horY);
        const p1R = project3D(220, 0, z1, W, H, 0, 110, 180, horY);
        const p2L = project3D(-220, 0, z2, W, H, 0, 110, 180, horY);
        const p2R = project3D(220, 0, z2, W, H, 0, 110, 180, horY);

        const isEv = Math.floor(z / 80) % 2 === 0;
        ctx.fillStyle = isEv ? '#fffbeb' : '#fde68a';
        ctx.beginPath();
        ctx.moveTo(p1L.x, p1L.y);
        ctx.lineTo(p1R.x, p1R.y);
        ctx.lineTo(p2R.x, p2R.y);
        ctx.lineTo(p2L.x, p2L.y);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = isEv ? '#0284c7' : '#10b981';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p1L.x, p1L.y);
        ctx.lineTo(p2L.x, p2L.y);
        ctx.moveTo(p1R.x, p1R.y);
        ctx.lineTo(p2R.x, p2R.y);
        ctx.stroke();
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

  function triggerImpactPunch() {
    const wrap = document.getElementById('canvas-stage-wrap');
    if (!wrap) return;
    wrap.classList.remove('impact-punch');
    void wrap.offsetWidth;
    wrap.classList.add('impact-punch');
  }

  function spawnGoldenCoinFountain(centerX, centerZ, count = 12) {
    for (let i = 0; i < count; i++) {
      const ln = i % 3;
      state.coins3D.push({
        x: LANE_X[ln] + (Math.random() - 0.5) * 45,
        y: 18 + (i % 3) * 12,
        z: Math.min(1150, Math.max(220, centerZ - i * 55))
      });
    }
  }

  function updateHudUI() {
    const heartStr = '❤️'.repeat(Math.max(0, state.hearts)) + '🖤'.repeat(Math.max(0, state.maxHearts - state.hearts));
    document.getElementById('hud-hearts').textContent = heartStr;
    document.getElementById('hud-score').textContent = `⭐ ${state.score.toLocaleString()}점`;
    document.getElementById('hud-combo').textContent = `🔥 ${state.combo} 콤보`;
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
    state.selectedLane = null;
    state.hasSteeredThisWave = false;
    state.laneStayTimer = 0;
    state.monsterState = ['normal', 'normal', 'normal'];
    state.gateClearRunTimer = 0;
    state.isCounterDash = false;
    state.isQuickKillDash = false;
    state.slowMoTimer = 0;
    state.otterSpin = 0;
    state.monsterZ = 820; // Spawns near the top of the full-height 3-lane runway (y≈121px)!
    state.monstersAlive = [true, true, true];
    state.projectiles3D = [];
    state.waveStartTime = performance.now();
    state.isBossWave = false;
    state.isGoldenWave = false;

    state.gateOptions = shuffle([
      { text: q.ans, isCorrect: true },
      { text: q.w1, isCorrect: false },
      { text: q.w2, isCorrect: false }
    ]);

    const waveTagEl = document.getElementById('q-gate-num');
    if (waveTagEl) {
      waveTagEl.textContent = `${state.gateCount} / ${state.targetGates}`;
      waveTagEl.style.background = '#0284c7';
    }
    document.getElementById('q-prompt-text').innerHTML = KkachiMathData.renderMathText(q.q);

    const gateBadges = ['🐉 ① 왼쪽 관문', '👹 ② 가운데 관문', '👾 ③ 오른쪽 관문'];
    state.gateOptions.forEach((opt, idx) => {
      const signEl = document.getElementById(`mon-sign-${idx}`);
      const renderedFormula = KkachiMathData.renderMathText(opt.text);

      // Render a sleek 1-line Pass-Through Arch Gate Banner with a top lane crest!
      if (signEl) {
        signEl.className = `monster-body-shield lane-${idx}`;
        signEl.innerHTML = `
          <span class="gate-arch-badge" id="gate-badge-${idx}">${gateBadges[idx]}</span>
          <div class="sign-formula">
            ${renderedFormula}
          </div>
        `;
      }
    });

    updateAimedMonsterUI();
  }

  function updateAimedMonsterUI() {
    const laneNames = ['왼쪽', '가운데', '오른쪽'];
    const defaultBadges = ['🐉 ① 왼쪽 관문', '👹 ② 가운데 관문', '👾 ③ 오른쪽 관문'];
    const aimedBadges = ['🎯 ① 왼쪽 관문 (내 수달 줄)', '🎯 ② 가운데 관문 (내 수달 줄)', '🎯 ③ 오른쪽 관문 (내 수달 줄)'];
    const lbl = document.getElementById('current-lane-label');
    if (lbl) lbl.textContent = laneNames[state.targetLane] || '가운데';

    [0, 1, 2].forEach((i) => {
      const signEl = document.getElementById(`mon-sign-${i}`);
      const badgeEl = document.getElementById(`gate-badge-${i}`);
      if (!signEl || state.isDashing || state.pausedForCrash || state.gateClearRunTimer > 0) return;
      const isAimed = i === state.targetLane;
      signEl.classList.toggle('otter-aimed', isAimed);
      if (badgeEl) {
        badgeEl.textContent = isAimed ? aimedBadges[i] : defaultBadges[i];
      }
    });
  }

  // Steer the 3D Otter Left (-1) or Right (+1) using Arrow Keys (←, →)
  function steerOtter(delta) {
    if (!state.running || state.pausedForCrash || state.isDashing || state.gateClearRunTimer > 0) return;
    const nextLane = Math.max(0, Math.min(2, state.targetLane + delta));
    if (nextLane !== state.targetLane) {
      KkachiSound.click();
      state.targetLane = nextLane;
      if (state.otterY3D <= 3) {
        state.otterVy3D = 6.2; // Gentle lane-switch hop
      }
      updateAimedMonsterUI();
    }
  }

  // Fast-forward Dash straight ahead in the Otter's current lane (Space / ↑ / Enter)
  function fireCurrentLane() {
    jumpToFloorAndDash(state.targetLane);
  }

  // Direct click on a Monster Character or 1/2/3 key: Move to that lane & Dash through!
  function selectAndFireLane(laneIdx) {
    if (!state.running || state.pausedForCrash || state.isDashing || state.gateClearRunTimer > 0) return;
    state.targetLane = laneIdx;
    updateAimedMonsterUI();
    jumpToFloorAndDash(laneIdx);
  }

  // Dash forward in the chosen lane to physically smash through the character!
  function jumpToFloorAndDash(laneIdx) {
    if (!state.running || state.pausedForCrash || state.isDashing || state.gateClearRunTimer > 0) return;
    KkachiSound.shoot();

    state.selectedLane = laneIdx;
    state.targetLane = laneIdx;
    state.isDashing = true;
    state.otterVy3D = 10.5;
    state.otterX3D = state.otterX3D * 0.25 + LANE_X[laneIdx] * 0.75;

    [0, 1, 2].forEach((i) => {
      const signEl = document.getElementById(`mon-sign-${i}`);
      if (signEl) {
        signEl.classList.toggle('otter-aimed', i === laneIdx);
      }
    });
  }

  // 3D MEGA WATER BREATH ULTIMATE (Blasts all 3 3D Monsters into the sky!)
  function fireUltimateSkill() {
    if (!state.running || state.pausedForCrash || state.gateClearRunTimer > 0 || state.ultGauge < 100) return;
    state.ultGauge = 0;
    state.isDashing = false;
    state.ultBeamLife = 1.0;
    KkachiSound.ultimate();
    triggerScreenShake();
    triggerImpactPunch();

    [0, 1, 2].forEach((ln) => {
      state.monstersAlive[ln] = false;
      const cardEl = document.getElementById(`plat-card-${ln}`);
      const signEl = document.getElementById(`mon-sign-${ln}`);
      const cardStat = document.getElementById(`card-status-${ln}`);
      const signStat = document.getElementById(`sign-status-${ln}`);
      const isAns = state.gateOptions[ln] && state.gateOptions[ln].isCorrect;

      if (isAns) {
        if (cardEl) cardEl.classList.add('shield-correct');
        if (signEl) signEl.classList.add('shield-correct');
        if (cardStat) cardStat.innerHTML = `<span style="color:#059669;font-weight:900;">⭕ 필살기 정답 격파!</span>`;
        if (signStat) signStat.innerHTML = `<span style="color:#059669;font-weight:900;">⭕ 정답!</span>`;
      } else {
        if (cardEl) cardEl.classList.add('shield-dissolve');
        if (signEl) signEl.classList.add('shield-dissolve');
      }

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
    state.gateClearRunTimer = 0.85;
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
    let dtSec = dt / 1000;

    // 1. Hit-Stop Freeze Frame (0.065s arcade impact pause on smash!)
    if (state.hitStopTimer > 0) {
      state.hitStopTimer = Math.max(0, state.hitStopTimer - dtSec);
      render3DWorld();
      state.rafId = requestAnimationFrame(gameLoop);
      return;
    }

    // 2. Bullet-Time Slow-Motion on Extreme Just Counter!
    if (state.slowMoTimer > 0) {
      state.slowMoTimer = Math.max(0, state.slowMoTimer - dtSec);
      dtSec *= 0.25;
    }

    if (!state.pausedForCrash) {
      update3DPhysics(now, dtSec);
    }
    update3DActionFX(dtSec);
    render3DWorld();
    state.rafId = requestAnimationFrame(gameLoop);
  }

  function update3DPhysics(now, dtSec) {
    const dashMult = (state.isDashing || state.gateClearRunTimer > 0) ? 5.5 : 1;
    const speedZ = 380 * dashMult;

    state.trackZ += speedZ * dtSec;
    state.distance += 15 * dashMult * dtSec;
    state.otterPhase += dtSec * ((state.isDashing || state.gateClearRunTimer > 0) ? 25 : 14);

    // 1. 3D Lane Movement (wx) — Smooth & Responsive Left/Right Otter Steering
    const targetX = LANE_X[state.targetLane];
    const dx = targetX - state.otterX3D;
    state.otterX3D += dx * 0.28;
    state.otterRoll = Math.max(-0.28, Math.min(0.28, dx * 0.0018));

    // Keep camera stable & centered so the 3 lanes and formulas never shift sideways!
    state.camX = 0;
    state.fov = 380;

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

    // 2.5 Post-Victory Sprint Across the Cleared Track!
    if (state.gateClearRunTimer > 0) {
      state.gateClearRunTimer = Math.max(0, state.gateClearRunTimer - dtSec);
      const timeLbl = document.getElementById('q-time-label');
      if (timeLbl) timeLbl.textContent = '⭕ 정답 통과!';
      updateHudUI();
      if (state.gateClearRunTimer <= 0) {
        spawnNextGate();
      }
      return;
    }

    // 3. Move the 3 Pass-Through Arch Gates steadily down the 3 lanes (from Z=820 to Z=240 right in front of the Otter's nose!)
    const START_MONSTER_Z = 820;
    const PASS_MONSTER_Z = 240;
    const baseMonSpeedZ = (START_MONSTER_Z - PASS_MONSTER_Z) / (state.gateDurationMs / 1000);
    const monSpeedZ = state.isDashing ? baseMonSpeedZ * 9.5 : baseMonSpeedZ;
    state.monsterZ -= monSpeedZ * dtSec;

    const remSec = Math.max(0, (state.monsterZ - PASS_MONSTER_Z) / Math.max(1, baseMonSpeedZ));
    const timeLbl = document.getElementById('q-time-label');
    if (timeLbl) {
      timeLbl.textContent = state.isDashing ? '⚡ 돌진중!' : `${remSec.toFixed(1)}초`;
    }

    const progFill = document.getElementById('q-progress-fill');
    if (progFill) {
      const remPct = Math.max(0, Math.min(100, ((state.monsterZ - PASS_MONSTER_Z) / (START_MONSTER_Z - PASS_MONSTER_Z)) * 100));
      progFill.style.width = `${remPct}%`;
    }

    // 4. Trigger Gate Pass / Collision the instant the Arch Gate threshold reaches right in front of the Otter's nose (Z=240, y≈274px) — never covering the Otter's head (y≈339px)!
    if (state.monsterZ <= PASS_MONSTER_Z) {
      state.selectedLane = state.targetLane;
      resolve3DMonsterCollision(false);
    }

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

    state.otterTrails3D = state.otterTrails3D.filter((tr) => {
      tr.z -= 320 * dtSec;
      tr.life -= dtSec * 2.4;
      return tr.life > 0 && tr.z > 15;
    });
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

    // 1. Calm, Clean Sky & Soft Emerald Sea Background
    const skyGrad = ctx.createLinearGradient(0, 0, 0, H);
    skyGrad.addColorStop(0, '#38bdf8');
    skyGrad.addColorStop(0.14, '#bae6fd');
    skyGrad.addColorStop(0.15, '#2dd4bf');
    skyGrad.addColorStop(1, '#0d9488');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, H);

    // 2. Full-Height 3-Lane Runway (Stretches from y≈64px near the top all the way down to y=440px at the bottom edge!)
    const TOP_Z = 1450;
    const BOT_Z = 15;
    const pTopL = project3D(-485, 0, TOP_Z, W, H, camX, camY, fov, horY);
    const pTopR = project3D(485, 0, TOP_Z, W, H, camX, camY, fov, horY);
    const pBotL = project3D(-485, 0, BOT_Z, W, H, camX, camY, fov, horY);
    const pBotR = project3D(485, 0, BOT_Z, W, H, camX, camY, fov, horY);

    ctx.fillStyle = '#fffbeb';
    ctx.beginPath();
    ctx.moveTo(pTopL.x, pTopL.y);
    ctx.lineTo(pTopR.x, pTopR.y);
    ctx.lineTo(pBotR.x, pBotR.y);
    ctx.lineTo(pBotL.x, pBotL.y);
    ctx.closePath();
    ctx.fill();

    // Clean Side Borders
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(pTopL.x, pTopL.y);
    ctx.lineTo(pBotL.x, pBotL.y);
    ctx.moveTo(pTopR.x, pTopR.y);
    ctx.lineTo(pBotR.x, pBotR.y);
    ctx.stroke();

    // 2.5 Highlight the Otter's Current Active Lane (state.targetLane) on the Full-Height Track Floor!
    const laneEdges = [
      [-485, -162],
      [-162, 162],
      [162, 485]
    ];
    const [curL, curR] = laneEdges[state.targetLane] || laneEdges[1];
    const hlTopL = project3D(curL, 0, TOP_Z, W, H, camX, camY, fov, horY);
    const hlTopR = project3D(curR, 0, TOP_Z, W, H, camX, camY, fov, horY);
    const hlBotL = project3D(curL, 0, BOT_Z, W, H, camX, camY, fov, horY);
    const hlBotR = project3D(curR, 0, BOT_Z, W, H, camX, camY, fov, horY);

    ctx.fillStyle = 'rgba(253, 224, 71, 0.38)';
    ctx.beginPath();
    ctx.moveTo(hlTopL.x, hlTopL.y);
    ctx.lineTo(hlTopR.x, hlTopR.y);
    ctx.lineTo(hlBotR.x, hlBotR.y);
    ctx.lineTo(hlBotL.x, hlBotL.y);
    ctx.closePath();
    ctx.fill();

    // Subtle Moving Horizontal Track Lines
    const segLen = 95;
    const zOffset = state.trackZ % segLen;
    ctx.strokeStyle = 'rgba(2, 132, 199, 0.14)';
    ctx.lineWidth = 2;
    for (let z = 1350; z >= 25; z -= segLen) {
      const zCur = z - zOffset;
      if (zCur < 15) continue;
      const pL = project3D(-480, 0, zCur, W, H, camX, camY, fov, horY);
      const pR = project3D(480, 0, zCur, W, H, camX, camY, fov, horY);
      ctx.beginPath();
      ctx.moveTo(pL.x, pL.y);
      ctx.lineTo(pR.x, pR.y);
      ctx.stroke();
    }

    // Two Clear Lane Divider Lines between Left / Center / Right
    ctx.strokeStyle = 'rgba(2, 132, 199, 0.35)';
    ctx.lineWidth = 3;
    [-162, 162].forEach((divX) => {
      const dTop = project3D(divX, 0, TOP_Z, W, H, camX, camY, fov, horY);
      const dBot = project3D(divX, 0, BOT_Z, W, H, camX, camY, fov, horY);
      ctx.beginPath();
      ctx.moveTo(dTop.x, dTop.y);
      ctx.lineTo(dBot.x, dBot.y);
      ctx.stroke();
    });

    // Forward Guide Chevrons on the Otter's Active Lane pointing from the Otter toward the approaching Arch Gate!
    const activeX = LANE_X[state.targetLane] || 0;
    [130, 195].forEach((cz) => {
      if (cz >= state.monsterZ - 20) return;
      const pTip = project3D(activeX, 0, cz + 24, W, H, camX, camY, fov, horY);
      const pBL = project3D(activeX - 38, 0, cz, W, H, camX, camY, fov, horY);
      const pBR = project3D(activeX + 38, 0, cz, W, H, camX, camY, fov, horY);
      ctx.save();
      ctx.strokeStyle = 'rgba(217, 119, 6, 0.55)';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(pBL.x, pBL.y);
      ctx.lineTo(pTip.x, pTip.y);
      ctx.lineTo(pBR.x, pBR.y);
      ctx.stroke();
      ctx.restore();
    });

    // 4. Draw Approaching 3D Pass-Through Arch Gates + Perched Monster Guardians Above the Slim Formula Banners!
    const gateColors = [
      { main: '#9333ea', dark: '#581c87', glow: 'rgba(147, 51, 234, 0.35)' },
      { main: '#e11d48', dark: '#881337', glow: 'rgba(225, 29, 72, 0.35)' },
      { main: '#059669', dark: '#064e3b', glow: 'rgba(5, 150, 105, 0.35)' }
    ];

    [0, 1, 2].forEach((ln) => {
      const signEl = document.getElementById(`mon-sign-${ln}`);
      if (!state.monstersAlive[ln]) return;

      const wx = LANE_X[ln];
      const pMon = project3D(wx, 0, state.monsterZ, W, H, camX, camY, fov, horY);
      const pPilL = project3D(wx - 125, 0, state.monsterZ, W, H, camX, camY, fov, horY);
      const pPilR = project3D(wx + 125, 0, state.monsterZ, W, H, camX, camY, fov, horY);

      const isAimed = ln === state.targetLane;
      const col = isAimed
        ? { main: '#f59e0b', dark: '#b45309', glow: 'rgba(245, 158, 11, 0.55)' }
        : gateColors[ln];

      const gateBannerY = pMon.y - 38;

      // 4.1 Draw Glowing Pass-Through Threshold Line on the Track Floor between the Left & Right Arch Pillars!
      ctx.save();
      ctx.strokeStyle = col.glow;
      ctx.lineWidth = isAimed ? 9 : 6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(pPilL.x, pMon.y);
      ctx.lineTo(pPilR.x, pMon.y);
      ctx.stroke();

      ctx.strokeStyle = col.main;
      ctx.lineWidth = isAimed ? 3.5 : 2.5;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.moveTo(pPilL.x, pMon.y);
      ctx.lineTo(pPilR.x, pMon.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // 4.2 Draw Left & Right 3D Arch Gate Pillars standing on the lane edges
      const pilW = Math.max(6, 12 * pMon.scale);
      [pPilL.x, pPilR.x].forEach((px) => {
        // Pillar ground base pad
        ctx.fillStyle = col.dark;
        ctx.beginPath();
        ctx.ellipse(px, pMon.y, pilW * 0.95, pilW * 0.42, 0, 0, Math.PI * 2);
        ctx.fill();

        // Vertical Arch Pillar column rising up to the Formula Gate Banner
        const pGrad = ctx.createLinearGradient(px - pilW * 0.5, 0, px + pilW * 0.5, 0);
        pGrad.addColorStop(0, col.dark);
        pGrad.addColorStop(0.45, col.main);
        pGrad.addColorStop(1, col.dark);
        ctx.fillStyle = pGrad;
        ctx.fillRect(px - pilW * 0.5, gateBannerY, pilW, pMon.y - gateBannerY);
      });
      ctx.restore();

      // 4.3 Draw the Cute 3D Monster Guardian Perched ON TOP of the Arch Gate Banner (100% visible above the formula!)
      const mScale = Math.max(0.72, Math.min(0.92, 0.54 + pMon.scale * 0.56));
      draw3DMonster(ctx, pMon.x, gateBannerY - 12, mScale, ln, state.otterPhase * 0.5, false, 0);

      // 4.4 Lock the Slim 1-Line Formula Gate Banner onto the Arch Crossbar (gateBannerY)
      if (signEl) {
        const leftPct = (pMon.x / W) * 100;
        const topPct = (gateBannerY / H) * 100;
        const shieldScale = Math.max(0.92, Math.min(1.04, 0.78 + pMon.scale * 0.36));
        signEl.style.left = `${leftPct.toFixed(2)}%`;
        signEl.style.top = `${topPct.toFixed(2)}%`;
        signEl.style.transform = `translate(-50%, -50%) scale(${shieldScale.toFixed(2)})`;
      }
    });

    // 5. Draw Ragdoll 3D Monsters blasted into the sky!
    for (const fm of state.flyingMonsters3D) {
      const p = project3D(fm.x, fm.y, fm.z, W, H, camX, camY, fov, horY);
      draw3DMonster(ctx, p.x, p.y, p.scale * 1.4, fm.laneType, 0, true, fm.rot);
    }

    // 6. Draw 3D Shockwave Rings & Projectiles (with Glowing Water Cannon Beam from Otter to Target Monster!)
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

    const pOtterPreview = project3D(state.otterX3D, state.otterY3D + 22, state.otterZ3D, W, H, camX, camY, fov, horY);
    for (const pr of state.projectiles3D) {
      const p = project3D(pr.x, pr.y, pr.z, W, H, camX, camY, fov, horY);
      const r = Math.max(6, 26 * p.scale);
      ctx.save();
      // Glowing Water Laser Stream connecting Otter directly to the flying projectile!
      const streamGrad = ctx.createLinearGradient(pOtterPreview.x, pOtterPreview.y, p.x, p.y);
      streamGrad.addColorStop(0, 'rgba(56, 189, 248, 0.25)');
      streamGrad.addColorStop(0.6, 'rgba(56, 189, 248, 0.85)');
      streamGrad.addColorStop(1, 'rgba(254, 240, 138, 0.98)');
      ctx.strokeStyle = streamGrad;
      ctx.lineWidth = Math.max(6, 18 * p.scale);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(pOtterPreview.x, pOtterPreview.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();

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

    // 8.5 Draw 3D Otter Booster Afterimage Trail Rings
    for (const tr of state.otterTrails3D) {
      const p = project3D(tr.x, tr.y, tr.z, W, H, camX, camY, fov, horY);
      ctx.save();
      ctx.globalAlpha = tr.life * 0.55;
      ctx.strokeStyle = tr.color;
      ctx.lineWidth = Math.max(2, 6 * p.scale);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 26 * p.scale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // 9. Draw the 3D Volumetric Cute Otter at the very bottom foreground (Z = 55, y ≈ 408px)!
    const pOtter = project3D(state.otterX3D, state.otterY3D, state.otterZ3D, W, H, camX, camY, fov, horY);
    draw3DOtter(ctx, pOtter.x, pOtter.y, pOtter.scale * 1.15, state.otterPhase, {
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
  // 3D MONSTER SMASH RESOLUTION & 1:1 SYNCHRONIZED VISUAL OUTCOME
  // =========================================================================
  function resolve3DMonsterCollision(isTimeout = false) {
    state.isDashing = false;
    const pickedIdx = state.selectedLane !== null ? state.selectedLane : state.targetLane;
    const pickedOpt = state.gateOptions[pickedIdx] || null;
    const correctIdx = state.gateOptions.findIndex((o) => o.isCorrect);

    if (pickedOpt && pickedOpt.isCorrect) {
      // 1. CORRECT CHARACTER PASSED / SMASHED!
      state.monstersAlive[pickedIdx] = false;
      state.monsterState[pickedIdx] = 'correct';

      [0, 1, 2].forEach((i) => {
        const signEl = document.getElementById(`mon-sign-${i}`);
        const badgeEl = document.getElementById(`gate-badge-${i}`);
        if (i === pickedIdx) {
          if (signEl) {
            signEl.classList.remove('otter-aimed', 'selected-lane');
            signEl.classList.add('shield-correct');
          }
          if (badgeEl) badgeEl.textContent = '⭕ 정답 관문 돌파!';
        } else {
          state.monstersAlive[i] = false;
          state.monsterState[i] = 'dissolved';
          if (signEl) signEl.classList.add('shield-dissolve');
        }
      });

      const hitX3D = LANE_X[pickedIdx];
      state.flyingMonsters3D.push({
        x: hitX3D,
        y: 15,
        z: state.monsterZ,
        vx: (pickedIdx - 1) * 10,
        vy: 20,
        vz: 28,
        rot: 0,
        vRot: 0.35,
        laneType: pickedIdx
      });

      state.shockwaves3D.push({
        x: hitX3D,
        y: 35,
        z: state.monsterZ,
        r: 12,
        life: 0.9,
        color: '#10b981'
      });

      state.combo += 1;
      if (state.combo > state.maxCombo) state.maxCombo = state.combo;
      state.otterSpin = Math.PI * 2;

      const pts = 200 + (state.combo - 1) * 40;
      state.score += pts;

      state.floatingTexts.push({
        x: 480 + (pickedIdx - 1) * 150,
        y: 230,
        text: `⭕ 정답 통과!! (+${pts}점)`,
        subText: state.combo >= 2 ? `🔥 ${state.combo}연속 정답!` : '',
        color: '#fde047',
        life: 1.05
      });

      state.history.push({
        q: state.currentQ.q,
        ans: state.currentQ.ans,
        tip: state.currentQ.tip,
        passed: true
      });

      KkachiSound.smash(state.combo);
      updateHudUI();
      state.gateClearRunTimer = 0.65;
    } else {
      // 2. WRONG CHARACTER COLLISION!
      state.pausedForCrash = true;
      state.monsterZ = Math.max(255, Math.min(380, state.monsterZ));

      [0, 1, 2].forEach((i) => {
        const signEl = document.getElementById(`mon-sign-${i}`);
        const badgeEl = document.getElementById(`gate-badge-${i}`);
        if (signEl) signEl.classList.remove('otter-aimed', 'selected-lane');

        if (i === correctIdx) {
          state.monsterState[i] = 'correct';
          if (signEl) signEl.classList.add('shield-correct');
          if (badgeEl) badgeEl.textContent = '⭕ 진짜 정답 관문!';
        } else if (i === pickedIdx) {
          state.monsterState[i] = 'wrong';
          if (signEl) signEl.classList.add('shield-wrong');
          if (badgeEl) badgeEl.textContent = '❌ 내가 고른 오답';
        } else {
          state.monstersAlive[i] = false;
          state.monsterState[i] = 'dissolved';
          if (signEl) signEl.classList.add('shield-dissolve');
        }
      });

      state.shockwaves3D.push({
        x: LANE_X[pickedIdx],
        y: 30,
        z: state.monsterZ,
        r: 14,
        life: 1.0,
        color: '#f43f5e'
      });
      state.otterVy3D = 8.0;

      state.history.push({
        q: state.currentQ.q,
        ans: state.currentQ.ans,
        tip: state.currentQ.tip,
        passed: false
      });

      state.combo = 0;
      state.hearts -= 1;
      KkachiSound.bomb();
      triggerScreenShake();
      updateHudUI();

      const overlay = document.getElementById('crash-tip-overlay');
      const headlineEl = document.getElementById('crash-headline-text');
      if (headlineEl) {
        headlineEl.textContent = `❌ 선택한 줄은 오답입니다! (초록색 ⭕ 표시가 진짜 정답)`;
      }
      document.getElementById('crash-correct-text').innerHTML =
        `⭕ 정답 수식 : ${KkachiMathData.renderMathText(state.currentQ.ans)}`;
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
      }, 2100);
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
      `최종 점수 <strong style="color:#d97706;">${state.score.toLocaleString()}점</strong> · 토벌 성공 <strong style="color:#059669;">${passedCount}/${state.history.length}마리</strong> · 최고 <strong>${state.maxCombo}연속 격파</strong>`;

    const reviewEl = document.getElementById('result-review-box');
    reviewEl.innerHTML =
      `<div style="font-weight:900;color:#0284c7;margin-bottom:6px;">📘 이번 3D 출격에서 격파한 고1 수학 수식 복습</div>` +
      state.history
        .map((h, i) => `
          <div style="border-bottom:1px solid #bae6fd;padding:6px 0;">
            <div style="font-weight:800;color:#0f172a;">
              ${h.passed ? '⚔️' : '🛡️'} #${i + 1}. ${KkachiMathData.renderMathText(h.q)}
              <span style="color:#059669;margin-left:6px;">→ ${KkachiMathData.renderMathText(h.ans)}</span>
            </div>
            ${!h.passed ? `<div style="font-size:0.8rem;color:#0369a1;margin-top:2px;">💡 ${KkachiMathData.renderMathText(h.tip)}</div>` : ''}
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
      canvas.addEventListener('pointerdown', (e) => {
        if (!state.running || state.pausedForCrash || state.isDashing || state.gateClearRunTimer > 0) return;
        const rect = canvas.getBoundingClientRect();
        const relX = (e.clientX - rect.left) / Math.max(1, rect.width);
        const clickedLane = relX < 0.34 ? 0 : relX > 0.66 ? 2 : 1;
        if (clickedLane === state.targetLane) {
          fireCurrentLane();
        } else {
          KkachiSound.click();
          state.targetLane = clickedLane;
          if (state.otterY3D <= 3) state.otterVy3D = 6.8;
          updateAimedMonsterUI();
        }
      });
    }

    window.addEventListener('keydown', (e) => {
      if (state.screen !== 'game' || !state.running || state.pausedForCrash) return;
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        steerOtter(-1);
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        steerOtter(1);
      } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        e.preventDefault();
        // Pressing Down also locks onto the current lane immediately (0.8s auto-fire)
        steerOtter(0);
      } else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W' || e.key === ' ') {
        e.preventDefault();
        fireCurrentLane();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (state.ultGauge >= 100) fireUltimateSkill();
        else fireCurrentLane();
      } else if (e.key === '1') {
        e.preventDefault();
        selectAndFireLane(0);
      } else if (e.key === '2') {
        e.preventDefault();
        selectAndFireLane(1);
      } else if (e.key === '3') {
        e.preventDefault();
        selectAndFireLane(2);
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
    steerOtter,
    fireCurrentLane,
    selectAndFireLane,
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
