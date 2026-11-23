/**
 * 수달런 (OTTER MATH RUN) - 귀여운 수달의 고1 수학 점프 & 부스터 런게임 메인 로직
 */
(function (global) {
  const SPEED_MAP = {
    slow: 9000,
    normal: 6500,
    fast: 4500
  };

  const state = {
    screen: 'intro', // 'intro' | 'game'
    skin: 'basic',   // 'basic' | 'scholar' | 'surfer' | 'king'
    chapterId: 'all',
    speedKey: 'normal',
    gateDurationMs: 6500,

    // Active run state
    running: false,
    pausedForCrash: false,
    isDashing: false,
    otterLane: 1, // 0 (Top), 1 (Middle), 2 (Bottom)
    otterMood: 'run', // 'run' | 'happy' | 'hurt'

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

    questionPool: [],
    currentQ: null,
    gateOptions: [], // [{ text, isCorrect, bonus }]
    gateStartTime: 0,
    gateProgress: 0, // 0..1
    history: [], // [{ q, ans, tip, passed }]

    // Floating coins on track
    coins: [],
    lastCoinSpawn: 0,
    lastFrameTime: 0,
    rafId: null,

    // PWA / Share URL
    deferredPrompt: null,
    shareUrl: null
  };

  // =========================================================================
  // CUTE OTTER SVG GENERATOR (4 Skins + 3 Facial Expressions + Shield Bubble)
  // =========================================================================
  function buildOtterSVG(skin = 'basic', mood = 'run', fever = false, shielded = false) {
    const useSurfboard = skin === 'surfer' || fever;

    // Eyes based on mood
    let eyesSvg = '';
    if (mood === 'happy') {
      eyesSvg = `
        <path d="M 38 40 Q 43 34 48 40" stroke="#1e293b" stroke-width="3.2" fill="none" stroke-linecap="round"/>
        <path d="M 64 40 Q 69 34 74 40" stroke="#1e293b" stroke-width="3.2" fill="none" stroke-linecap="round"/>
      `;
    } else if (mood === 'hurt') {
      eyesSvg = `
        <path d="M 38 36 L 47 43 M 47 36 L 38 43" stroke="#1e293b" stroke-width="3" stroke-linecap="round"/>
        <path d="M 65 36 L 74 43 M 74 36 L 65 43" stroke="#1e293b" stroke-width="3" stroke-linecap="round"/>
      `;
    } else {
      eyesSvg = `
        <circle cx="43" cy="39" r="5" fill="#0f172a"/>
        <circle cx="44.8" cy="37.2" r="1.8" fill="#ffffff"/>
        <circle cx="69" cy="39" r="5" fill="#0f172a"/>
        <circle cx="70.8" cy="37.2" r="1.8" fill="#ffffff"/>
      `;
    }

    // Accessories based on skin
    let hatSvg = '';
    let glassesSvg = '';
    let capeSvg = '';
    let boardSvg = '';

    if (useSurfboard) {
      boardSvg = `
        <ellipse cx="56" cy="92" rx="46" ry="9" fill="#06b6d4" stroke="#e0f2fe" stroke-width="2.5"/>
        <path d="M 22 92 L 90 92" stroke="#fbbf24" stroke-width="3" stroke-linecap="round"/>
      `;
    }
    if (skin === 'surfer') {
      glassesSvg = `
        <rect x="35" y="34" width="17" height="10" rx="3" fill="#0284c7" stroke="#e0f2fe" stroke-width="1.5"/>
        <rect x="60" y="34" width="17" height="10" rx="3" fill="#0284c7" stroke="#e0f2fe" stroke-width="1.5"/>
        <line x1="52" y1="38" x2="60" y2="38" stroke="#e0f2fe" stroke-width="2"/>
      `;
    }
    if (skin === 'scholar') {
      glassesSvg = `
        <circle cx="43" cy="39" r="7.5" fill="none" stroke="#ef4444" stroke-width="2.4"/>
        <circle cx="69" cy="39" r="7.5" fill="none" stroke="#ef4444" stroke-width="2.4"/>
        <line x1="50.5" y1="39" x2="61.5" y2="39" stroke="#ef4444" stroke-width="2.2"/>
      `;
      hatSvg = `
        <polygon points="56,7 26,19 56,28 86,19" fill="#1e293b" stroke="#38bdf8" stroke-width="1.5"/>
        <rect x="40" y="23" width="32" height="6" rx="2" fill="#334155"/>
        <path d="M 78 21 L 82 33" stroke="#fbbf24" stroke-width="2.5" stroke-linecap="round"/>
        <circle cx="82" cy="34" r="2.5" fill="#fbbf24"/>
      `;
    }
    if (skin === 'king') {
      capeSvg = `
        <path d="M 32 55 Q 10 72 16 88 L 40 82 Z" fill="#e11d48" stroke="#fbbf24" stroke-width="2"/>
      `;
      hatSvg = `
        <polygon points="37,24 41,9 50,18 56,6 62,18 71,9 75,24" fill="#fbbf24" stroke="#d97706" stroke-width="1.8"/>
        <circle cx="56" cy="18" r="2.5" fill="#e11d48"/>
      `;
    }

    const shieldSvg = shielded
      ? `<circle cx="56" cy="54" r="49" fill="rgba(56, 189, 248, 0.18)" stroke="#38bdf8" stroke-width="2.5" stroke-dasharray="6 4"/>`
      : '';

    return `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 112 106" width="100%" height="100%">
        ${boardSvg}
        ${capeSvg}
        <!-- Wagging Otter Tail -->
        <path d="M 30 76 Q 8 72 12 84 Q 18 92 34 85" fill="#7c4a21" stroke="#5c3415" stroke-width="2"/>
        <!-- Little Feet -->
        <ellipse cx="42" cy="88" rx="9" ry="5.5" fill="#6b3e1a"/>
        <ellipse cx="70" cy="88" rx="9" ry="5.5" fill="#6b3e1a"/>
        <!-- Plump Otter Body -->
        <ellipse cx="56" cy="68" rx="26" ry="23" fill="#9a6232" stroke="#5c3415" stroke-width="2"/>
        <!-- Cream Belly -->
        <ellipse cx="58" cy="70" rx="17" ry="16" fill="#fde6c4"/>
        <!-- Cute Ears -->
        <circle cx="32" cy="28" r="7.5" fill="#7c4a21" stroke="#5c3415" stroke-width="2"/>
        <circle cx="32" cy="28" r="4" fill="#f5cba7"/>
        <circle cx="80" cy="28" r="7.5" fill="#7c4a21" stroke="#5c3415" stroke-width="2"/>
        <circle cx="80" cy="28" r="4" fill="#f5cba7"/>
        <!-- Round Otter Head -->
        <ellipse cx="56" cy="40" rx="27" ry="22" fill="#9a6232" stroke="#5c3415" stroke-width="2"/>
        <!-- Cream Muzzle Cheeks -->
        <ellipse cx="50" cy="47" rx="10" ry="7.5" fill="#fef3c7"/>
        <ellipse cx="62" cy="47" rx="10" ry="7.5" fill="#fef3c7"/>
        <!-- Rosy Pink Blushes -->
        <ellipse cx="34" cy="46" rx="4.5" ry="2.8" fill="#fb7185" opacity="0.75"/>
        <ellipse cx="78" cy="46" rx="4.5" ry="2.8" fill="#fb7185" opacity="0.75"/>
        <!-- Eyes -->
        ${eyesSvg}
        ${glassesSvg}
        <!-- Cute Triangle Nose & Smile -->
        <polygon points="56,46 51,41 61,41" fill="#27272a"/>
        <path d="M 56 46 Q 51 52 46 49 M 56 46 Q 61 52 66 49" stroke="#5c3415" stroke-width="2.2" fill="none" stroke-linecap="round"/>
        <!-- Whiskers -->
        <line x1="25" y1="44" x2="36" y2="45" stroke="#5c3415" stroke-width="1.6" stroke-linecap="round"/>
        <line x1="24" y1="49" x2="36" y2="48" stroke="#5c3415" stroke-width="1.6" stroke-linecap="round"/>
        <line x1="76" y1="45" x2="87" y2="44" stroke="#5c3415" stroke-width="1.6" stroke-linecap="round"/>
        <line x1="76" y1="48" x2="88" y2="49" stroke="#5c3415" stroke-width="1.6" stroke-linecap="round"/>
        <!-- Golden Seashell held on tummy -->
        <path d="M 47 68 Q 58 56 69 68 L 64 77 L 52 77 Z" fill="#fbbf24" stroke="#d97706" stroke-width="1.8"/>
        <line x1="58" y1="62" x2="58" y2="76" stroke="#d97706" stroke-width="1.4"/>
        <line x1="53" y1="64" x2="55" y2="76" stroke="#d97706" stroke-width="1.4"/>
        <line x1="63" y1="64" x2="61" y2="76" stroke="#d97706" stroke-width="1.4"/>
        <!-- Little Paws holding the shell -->
        <circle cx="45" cy="69" r="5.5" fill="#7c4a21"/>
        <circle cx="71" cy="69" r="5.5" fill="#7c4a21"/>
        ${hatSvg}
        ${shieldSvg}
      </svg>
    `;
  }

  // =========================================================================
  // INITIALIZATION & NAVIGATION
  // =========================================================================
  async function init() {
    registerServiceWorker();
    await detectShareUrl();
    renderIntroOtter();
    renderChapterTabs();
    initKeyboardControls();
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

  function renderIntroOtter() {
    const box = document.getElementById('intro-otter-preview');
    if (box) {
      box.innerHTML = `<div style="width:105px;height:105px;">${buildOtterSVG(state.skin, 'happy', false, false)}</div>`;
    }
  }

  function selectSkin(skinKey) {
    KkachiSound.click();
    state.skin = skinKey;
    ['basic', 'scholar', 'surfer', 'king'].forEach((k) => {
      const btn = document.getElementById(`skin-btn-${k}`);
      if (btn) btn.classList.toggle('active', k === skinKey);
    });
    renderIntroOtter();
    renderGameOtter();
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
    renderIntroOtter();
  }

  // =========================================================================
  // RUNNER GAMEPLAY ENGINE
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
    KkachiSound.fever(1);

    state.screen = 'game';
    document.getElementById('screen-intro').style.display = 'none';
    document.getElementById('screen-game').style.display = 'block';
    document.getElementById('crash-tip-overlay').classList.remove('active');
    document.getElementById('modal-result').classList.remove('active');

    state.running = true;
    state.pausedForCrash = false;
    state.isDashing = false;
    state.otterLane = 1;
    state.otterMood = 'run';

    state.hearts = 5;
    state.hasShield = false;
    state.freeShieldUsed = false;
    state.distance = 0;
    state.score = 0;
    state.combo = 0;
    state.maxCombo = 0;
    state.gateCount = 0;
    state.history = [];
    state.coins = [];

    const shieldBtn = document.getElementById('btn-shield-chance');
    if (shieldBtn) {
      shieldBtn.disabled = false;
      shieldBtn.textContent = '🛡️ 무료 물방울 방패(1회)';
    }

    state.questionPool = buildQuestionPool();
    updateLaneUI();
    renderGameOtter();
    updateHudUI();
    spawnNextGate();

    state.lastFrameTime = performance.now();
    state.rafId = requestAnimationFrame(runLoop);
  }

  function stopRunLoop() {
    state.running = false;
    if (state.rafId) {
      cancelAnimationFrame(state.rafId);
      state.rafId = null;
    }
  }

  function renderGameOtter() {
    const box = document.getElementById('otter-svg-box');
    if (!box) return;
    const isFever = state.combo >= 5;
    box.innerHTML = buildOtterSVG(state.skin, state.otterMood, isFever, state.hasShield);

    const stage = document.getElementById('runner-stage');
    if (stage) stage.classList.toggle('fever-mode', isFever);
  }

  function updateLaneUI() {
    const actor = document.getElementById('otter-actor');
    if (actor) {
      actor.classList.remove('lane-0', 'lane-1', 'lane-2');
      actor.classList.add(`lane-${state.otterLane}`);
    }
    [0, 1, 2].forEach((i) => {
      const tr = document.getElementById(`track-lane-${i}`);
      const gp = document.getElementById(`gate-plat-${i}`);
      if (tr) tr.classList.toggle('active-lane', i === state.otterLane);
      if (gp) gp.classList.toggle('lane-selected', i === state.otterLane);
    });
  }

  function updateHudUI() {
    const heartStr = '❤️'.repeat(Math.max(0, state.hearts)) + '🖤'.repeat(Math.max(0, state.maxHearts - state.hearts));
    const shieldStr = state.hasShield ? ' 🛡️' : '';
    document.getElementById('hud-hearts').textContent = heartStr + shieldStr;
    document.getElementById('hud-distance').textContent = `${Math.floor(state.distance)} m`;
    document.getElementById('hud-score').textContent = `${state.score.toLocaleString()}점`;
    document.getElementById('hud-combo').textContent =
      state.combo >= 5 ? `🏄 ${state.combo} FEVER (x2)` : `${state.combo} COMBO`;
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
    renderGameOtter();

    // Assign random bonus items to the 3 platforms
    const bonusPool = shuffle(['star', 'heart', 'shield', 'none', 'none']);
    const rawOptions = [
      { text: q.ans, isCorrect: true, bonus: bonusPool[0] },
      { text: q.w1, isCorrect: false, bonus: bonusPool[1] },
      { text: q.w2, isCorrect: false, bonus: bonusPool[2] }
    ];
    state.gateOptions = shuffle(rawOptions);

    document.getElementById('q-gate-num').textContent = `GATE #${state.gateCount} / ${state.targetGates}`;
    document.getElementById('q-prompt-text').innerHTML = KkachiMathData.renderMathText(q.q);

    state.gateOptions.forEach((opt, idx) => {
      const plat = document.getElementById(`gate-plat-${idx}`);
      const laneName = idx === 0 ? '🔼 1번 발판' : idx === 1 ? '➡️ 2번 발판' : '🔽 3번 발판';
      let bonusHtml = '';
      if (opt.bonus === 'star') bonusHtml = `<span class="gate-bonus-tag bonus-star">⭐ 점수 2배</span>`;
      else if (opt.bonus === 'heart') bonusHtml = `<span class="gate-bonus-tag bonus-heart">❤️ 체력+1</span>`;
      else if (opt.bonus === 'shield') bonusHtml = `<span class="gate-bonus-tag bonus-shield">🛡️ 방패</span>`;

      if (plat) {
        plat.className = `gate-platform ${idx === state.otterLane ? 'lane-selected' : ''}`;
        plat.innerHTML = `
          <div class="gate-top-bar">
            <span>${laneName}</span>
            ${bonusHtml}
          </div>
          <div class="gate-formula-box">${KkachiMathData.renderMathText(opt.text)}</div>
        `;
      }

      const ctrlTxt = document.getElementById(`ctrl-text-${idx}`);
      if (ctrlTxt) {
        ctrlTxt.innerHTML = KkachiMathData.renderMathText(opt.text);
      }
    });

    state.gateStartTime = performance.now();
    state.gateProgress = 0;
    const gateCol = document.getElementById('gate-column');
    if (gateCol) gateCol.style.left = '76%';
  }

  // Player clicks a lane or presses 1/2/3 -> Otter jumps to that lane and booster-dashes through the gate!
  function jumpAndDash(laneIdx) {
    if (!state.running || state.pausedForCrash || state.isDashing) return;

    KkachiSound.click();
    state.otterLane = laneIdx;
    state.isDashing = true;
    updateLaneUI();

    const actor = document.getElementById('otter-actor');
    if (actor) {
      actor.classList.add('jumping', 'dashing');
      setTimeout(() => actor.classList.remove('jumping'), 220);
    }
  }

  function changeLaneOnly(delta) {
    if (!state.running || state.pausedForCrash || state.isDashing) return;
    const next = Math.max(0, Math.min(2, state.otterLane + delta));
    if (next !== state.otterLane) {
      KkachiSound.click();
      state.otterLane = next;
      updateLaneUI();
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
    renderGameOtter();
    updateHudUI();
  }

  function runLoop(now) {
    if (!state.running) return;
    const dt = Math.min(100, now - state.lastFrameTime);
    state.lastFrameTime = now;

    if (!state.pausedForCrash) {
      // Advance running distance
      const speedMult = (state.combo >= 5 ? 1.8 : 1) * (state.isDashing ? 4.5 : 1);
      state.distance += (dt / 1000) * 14 * speedMult;

      // Spawn & move floating collectible clams on track
      updateTrackCoins(now, dt, speedMult);

      // Advance Gate Wall approach
      if (state.isDashing) {
        state.gateProgress += (dt / 180);
      } else {
        state.gateProgress += dt / state.gateDurationMs;
      }

      const pct = Math.min(1, Math.max(0, state.gateProgress));
      const leftPct = 76 - pct * 58; // Moves from 76% to 18% (Otter collision point)
      const gateCol = document.getElementById('gate-column');
      if (gateCol) gateCol.style.left = `${leftPct}%`;

      const bar = document.getElementById('q-approach-bar');
      if (bar) bar.style.width = `${Math.round(pct * 100)}%`;

      const remSec = Math.max(0, ((1 - pct) * state.gateDurationMs) / 1000);
      const timeLbl = document.getElementById('q-time-label');
      if (timeLbl) {
        timeLbl.textContent = state.isDashing ? '🌊 부스터 돌진!!' : `충돌까지 ${remSec.toFixed(1)}초`;
      }

      if (pct >= 1) {
        resolveGateCollision();
      }

      updateHudUI();
    }

    state.rafId = requestAnimationFrame(runLoop);
  }

  function updateTrackCoins(now, dt, speedMult) {
    if (now - state.lastCoinSpawn > 950) {
      state.lastCoinSpawn = now;
      const lane = Math.floor(Math.random() * 3);
      const icon = Math.random() < 0.7 ? '🐚' : '🐟';
      state.coins.push({
        id: 'c_' + now + '_' + Math.random().toString(36).slice(2, 5),
        lane,
        x: 72,
        icon
      });
    }

    const layer = document.getElementById('coins-layer');
    if (!layer) return;

    const remaining = [];
    for (const c of state.coins) {
      c.x -= (dt / 1000) * 28 * speedMult;
      // Check collection by otter (around x = 12..18%)
      if (c.x <= 18 && c.x >= 9 && c.lane === state.otterLane) {
        state.score += 15;
        continue;
      }
      if (c.x > 4) {
        remaining.push(c);
      }
    }
    state.coins = remaining;

    layer.innerHTML = state.coins
      .map((c) => {
        const topPx = c.lane === 0 ? 45 : c.lane === 1 ? 165 : 285;
        return `<div class="track-coin" style="left:${c.x}%;top:${topPx}px;">${c.icon}</div>`;
      })
      .join('');
  }

  function resolveGateCollision() {
    state.pausedForCrash = true;
    const actor = document.getElementById('otter-actor');
    if (actor) actor.classList.remove('dashing');

    const pickedIdx = state.otterLane;
    const pickedOpt = state.gateOptions[pickedIdx];
    const platEl = document.getElementById(`gate-plat-${pickedIdx}`);

    if (pickedOpt && pickedOpt.isCorrect) {
      // BREAKTHROUGH SUCCESS!
      if (platEl) platEl.classList.add('gate-correct');
      state.combo += 1;
      if (state.combo > state.maxCombo) state.maxCombo = state.combo;
      state.otterMood = 'happy';

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

      renderGameOtter();
      updateHudUI();

      setTimeout(() => {
        state.pausedForCrash = false;
        spawnNextGate();
      }, 480);
    } else {
      // WRONG GATE COLLISION!
      if (platEl) platEl.classList.add('gate-wrong');
      // Highlight the actual correct gate
      state.gateOptions.forEach((o, i) => {
        if (o.isCorrect) {
          const el = document.getElementById(`gate-plat-${i}`);
          if (el) el.classList.add('gate-correct');
        }
      });

      state.history.push({
        q: state.currentQ.q,
        ans: state.currentQ.ans,
        tip: state.currentQ.tip,
        passed: false
      });

      if (state.hasShield) {
        // Shield absorbs the crash!
        state.hasShield = false;
        KkachiSound.radar();
        renderGameOtter();
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
      if (actor) {
        actor.classList.add('hurt');
        setTimeout(() => actor.classList.remove('hurt'), 500);
      }
      renderGameOtter();
      updateHudUI();

      // Show 1-line explanation overlay for 1.8s
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
      }, 1900);
    }
  }

  function finishRun(cleared) {
    stopRunLoop();
    KkachiSound.victory();

    const modal = document.getElementById('modal-result');
    document.getElementById('result-otter-box').innerHTML = buildOtterSVG(
      state.skin,
      cleared ? 'happy' : 'run',
      cleared,
      false
    );

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

  function initKeyboardControls() {
    window.addEventListener('keydown', (e) => {
      if (state.screen !== 'game' || !state.running || state.pausedForCrash) return;
      if (e.key === '1' || e.key === 'ArrowUp') {
        e.preventDefault();
        jumpAndDash(0);
      } else if (e.key === '2' || e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        jumpAndDash(1);
      } else if (e.key === '3' || e.key === 'ArrowDown') {
        e.preventDefault();
        jumpAndDash(2);
      } else if (e.key === 'w' || e.key === 'W') {
        e.preventDefault();
        changeLaneOnly(-1);
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        changeLaneOnly(1);
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
    jumpAndDash,
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
