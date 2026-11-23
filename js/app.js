/**
 * 까치매스 (KKACHI MATH) - 고1 수학 공식 12장 복불복 짝맞추기 웹앱
 * 5대 복불복 특수 기믹 (⭐2배, 😈점수뺏기, 💣시한폭탄, ⚡레이더 투시, 👑황금잭팟) + 🎰복불복 찬스 룰렛
 */
(function (global) {
  const STORAGE_KEY_CUSTOM = 'kkachi_g1_custom_pairs_v1';
  const STORAGE_KEY_BEST_SCORE = 'kkachi_g1_best_score_v1';

  const GIMMICK_TYPES = {
    star: {
      id: 'star',
      label: '⭐ 점수 2배',
      pillClass: 'gimmick-star',
      bannerClass: 'event-star'
    },
    steal: {
      id: 'steal',
      label: '😈 점수 뺏기',
      pillClass: 'gimmick-steal',
      bannerClass: 'event-steal'
    },
    bomb: {
      id: 'bomb',
      label: '💣 시한폭탄',
      pillClass: 'gimmick-bomb',
      bannerClass: 'event-bomb'
    },
    radar: {
      id: 'radar',
      label: '⚡ 레이더 투시',
      pillClass: 'gimmick-radar',
      bannerClass: 'event-radar'
    },
    jackpot: {
      id: 'jackpot',
      label: '👑 황금 잭팟',
      pillClass: 'gimmick-jackpot',
      bannerClass: 'event-star'
    },
    normal: {
      id: 'normal',
      label: '',
      pillClass: '',
      bannerClass: ''
    }
  };

  const state = {
    currentScreen: 'intro', // 'intro' | 'game'
    chapterId: 'all', // 'all' | 'ch1' | 'ch2' | 'ch3' | 'ch4' | 'ch5' | 'custom'
    gimmicksEnabled: true,
    customPairs: null,
    selectedPairs: [],
    cards: [], // 12 cards
    firstCardIdx: null,
    secondCardIdx: null,
    lockBoard: false,

    matchedCount: 0,
    moves: 0,
    combo: 0,
    score: 0,
    nextMatchDoubleBuff: false,
    rouletteUsed: false,

    startTime: 0,
    elapsedSec: 0,
    timerInterval: null,
    bestScore: 0,

    // Team mode (A팀 vs B팀)
    isTeamMode: false,
    currentTeam: 'A', // 'A' | 'B'
    scoreA: 0,
    scoreB: 0,
    pairsA: 0,
    pairsB: 0,

    // Web App / PWA state
    deferredPrompt: null,
    shareUrl: null
  };

  async function init() {
    loadSavedData();
    registerServiceWorker();
    await detectShareUrl();
    renderIntroDemoCards();
    renderChapterTabs();
    startNewGame();
  }

  function renderIntroDemoCards() {
    const qEl = document.getElementById('demo-card-q');
    const aEl = document.getElementById('demo-card-a');
    if (qEl) qEl.innerHTML = KkachiMathData.renderMathText('$a^3 + b^3$ 의 곱셈공식 변형');
    if (aEl) aEl.innerHTML = KkachiMathData.renderMathText('$(a+b)^3 - 3ab(a+b)$');
  }

  function showIntroScreen() {
    KkachiSound.click();
    if (state.timerInterval) {
      clearInterval(state.timerInterval);
      state.timerInterval = null;
    }
    state.currentScreen = 'intro';
    document.getElementById('screen-intro').style.display = 'block';
    document.getElementById('screen-game').style.display = 'none';
    renderChapterTabs();
    syncModeButtons();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function enterGameScreen() {
    KkachiSound.fever(1);
    state.currentScreen = 'game';
    document.getElementById('screen-intro').style.display = 'none';
    document.getElementById('screen-game').style.display = 'block';
    syncModeButtons();
    startNewGame();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function setIntroMode(teamMode) {
    KkachiSound.click();
    state.isTeamMode = Boolean(teamMode);
    syncModeButtons();
  }

  function syncModeButtons() {
    const soloBtn = document.getElementById('intro-mode-solo');
    const teamBtn = document.getElementById('intro-mode-team');
    if (soloBtn) soloBtn.classList.toggle('active', !state.isTeamMode);
    if (teamBtn) teamBtn.classList.toggle('active', state.isTeamMode);

    const gameToggleBtn = document.getElementById('btn-mode-toggle');
    if (gameToggleBtn) {
      gameToggleBtn.textContent = state.isTeamMode ? '⏱️ 1인 타임어택으로' : '🆚 2팀 대결 켜기';
    }
  }

  function toggleGimmicksEnabled() {
    KkachiSound.click();
    state.gimmicksEnabled = !state.gimmicksEnabled;
    const btn = document.getElementById('btn-gimmick-toggle');
    if (btn) {
      btn.textContent = state.gimmicksEnabled ? '🎲 복불복 ON' : '🎲 복불복 OFF';
    }
    startNewGame();
  }

  function loadSavedData() {
    try {
      const savedBest = localStorage.getItem(STORAGE_KEY_BEST_SCORE);
      if (savedBest && !isNaN(Number(savedBest))) {
        state.bestScore = Number(savedBest);
      }
      const savedCustom = localStorage.getItem(STORAGE_KEY_CUSTOM);
      if (savedCustom) {
        const parsed = JSON.parse(savedCustom);
        if (Array.isArray(parsed) && parsed.length === 6) {
          state.customPairs = parsed;
        }
      }
    } catch (e) {
      // ignore
    }
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
    const isLocalhost =
      location.hostname === 'localhost' ||
      location.hostname === '127.0.0.1';

    if (isLocalhost && location.protocol.startsWith('http')) {
      try {
        const res = await fetch('/api/info');
        const data = await res.json();
        if (data && data.ok && Array.isArray(data.ips) && data.ips.length > 0) {
          state.shareUrl = `http://${data.ips[0]}:${data.port || 3000}`;
          return;
        }
      } catch (e) {
        // fallback
      }
    }
    state.shareUrl = location.origin && location.origin !== 'null'
      ? location.origin + location.pathname
      : location.href;
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = a[i];
      a[i] = a[j];
      a[j] = tmp;
    }
    return a;
  }

  function renderChapterTabs() {
    const tabs = [
      { id: 'all', title: '🔥 고1 전체 랜덤' },
      ...KkachiMathData.CHAPTERS.map((c) => ({ id: c.id, title: c.title }))
    ];
    if (state.customPairs && state.customPairs.length === 6) {
      tabs.push({ id: 'custom', title: '⭐ 내 커스텀 문제' });
    }

    const html = tabs
      .map((t) => `
        <button type="button" class="tab-btn ${state.chapterId === t.id ? 'active' : ''}" onclick="MatchGame.selectChapter('${t.id}')">
          ${t.title}
        </button>
      `)
      .join('');

    const gameTabs = document.getElementById('chapter-tabs');
    const introTabs = document.getElementById('intro-chapter-tabs');
    if (gameTabs) gameTabs.innerHTML = html;
    if (introTabs) introTabs.innerHTML = html;
  }

  function selectChapter(chId) {
    KkachiSound.click();
    state.chapterId = chId;
    renderChapterTabs();
    if (state.currentScreen === 'game') {
      startNewGame();
    }
  }

  function pickSixPairs() {
    if (state.chapterId === 'custom' && state.customPairs && state.customPairs.length === 6) {
      return state.customPairs;
    }

    let pool = [];
    if (state.chapterId === 'all') {
      KkachiMathData.CHAPTERS.forEach((ch) => {
        pool = pool.concat(ch.pairs);
      });
    } else {
      const found = KkachiMathData.CHAPTERS.find((ch) => ch.id === state.chapterId);
      pool = found ? found.pairs : KkachiMathData.CHAPTERS[0].pairs;
    }

    return shuffle(pool).slice(0, 6);
  }

  function startNewGame() {
    if (state.timerInterval) {
      clearInterval(state.timerInterval);
      state.timerInterval = null;
    }

    const sixPairs = pickSixPairs();
    state.selectedPairs = sixPairs;

    // Assign random gimmicks to the 6 pairs
    const gimmickPool = state.gimmicksEnabled
      ? shuffle(['star', 'steal', 'bomb', 'radar', 'jackpot', 'normal'])
      : ['normal', 'normal', 'normal', 'normal', 'normal', 'normal'];

    const rawCards = [];
    sixPairs.forEach((pair, idx) => {
      const gKey = gimmickPool[idx] || 'normal';
      const gInfo = GIMMICK_TYPES[gKey] || GIMMICK_TYPES.normal;

      rawCards.push({
        pairId: pair.id,
        type: 'q',
        badge: '📘 개념·질문',
        content: pair.q,
        gimmick: gInfo.id,
        gimmickLabel: gInfo.label,
        gimmickClass: gInfo.pillClass,
        flipped: false,
        matched: false
      });
      rawCards.push({
        pairId: pair.id,
        type: 'a',
        badge: '💡 정답·공식',
        content: pair.a,
        gimmick: gInfo.id,
        gimmickLabel: gInfo.label,
        gimmickClass: gInfo.pillClass,
        flipped: false,
        matched: false
      });
    });

    state.cards = shuffle(rawCards);
    state.firstCardIdx = null;
    state.secondCardIdx = null;
    state.lockBoard = false;
    state.matchedCount = 0;
    state.moves = 0;
    state.combo = 0;
    state.score = 0;
    state.nextMatchDoubleBuff = false;
    state.rouletteUsed = false;
    state.elapsedSec = 0;
    state.startTime = 0;
    state.currentTeam = 'A';
    state.scoreA = 0;
    state.scoreB = 0;
    state.pairsA = 0;
    state.pairsB = 0;

    const rBtn = document.getElementById('btn-roulette');
    if (rBtn) {
      rBtn.disabled = false;
      rBtn.textContent = '🎰 복불복 찬스 뽑기 (1회)';
    }

    setGimmickBanner(
      state.gimmicksEnabled
        ? '🎲 카드마다 복불복 특수 기믹(⭐2배 · 😈점수뺏기 · 💣시한폭탄 · ⚡레이더 · 👑잭팟)이 숨어 있습니다!'
        : '📘 클래식 공식 짝맞추기 모드입니다. 6쌍의 개념과 공식을 연결하세요!',
      ''
    );

    renderStatusBar();
    renderCardsGrid();
  }

  function setGimmickBanner(text, eventClass = '') {
    const banner = document.getElementById('gimmick-event-banner');
    const txtEl = document.getElementById('gimmick-banner-text');
    if (!banner || !txtEl) return;
    banner.className = 'gimmick-event-banner ' + (eventClass || '');
    txtEl.innerHTML = text;
  }

  function showFloatingToast(text, borderColor = '#fbbf24') {
    const el = document.createElement('div');
    el.className = 'floating-gimmick-toast';
    el.style.borderColor = borderColor;
    el.textContent = text;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1400);
  }

  function ensureTimerStarted() {
    if (state.timerInterval || state.isTeamMode) return;
    state.startTime = performance.now();
    state.timerInterval = setInterval(() => {
      state.elapsedSec = (performance.now() - state.startTime) / 1000;
      const el = document.getElementById('stat-timer');
      if (el) el.textContent = `${state.elapsedSec.toFixed(1)}초`;
    }, 100);
  }

  function renderStatusBar() {
    const bar = document.getElementById('status-bar');
    if (!bar) return;

    if (!state.isTeamMode) {
      bar.innerHTML = `
        <div class="status-card">
          <span class="status-label">🏆 현재 점수</span>
          <span class="status-val" style="color:#fbbf24;">${state.score.toLocaleString()}점</span>
        </div>
        <div class="status-card">
          <span class="status-label">🎯 찾은 공식 짝</span>
          <span class="status-val" style="color:#10b981;">${state.matchedCount} / 6 쌍</span>
        </div>
        <div class="status-card">
          <span class="status-label">🔥 연속 콤보</span>
          <span class="status-val" style="color:#f472b6;">${state.combo} COMBO</span>
        </div>
        <div class="status-card">
          <span class="status-label">⏱️ 시간 / 최고점</span>
          <span class="status-val" id="stat-timer" style="color:#38bdf8;font-size:1.2rem;">${state.elapsedSec.toFixed(1)}초</span>
        </div>
      `;
    } else {
      bar.innerHTML = `
        <div class="status-card ${state.currentTeam === 'A' ? 'active-turn' : ''}">
          <div>
            <div class="status-label" style="color:#60a5fa;">🔵 A팀 (1분단) · ${state.pairsA}쌍</div>
            <div style="font-size:0.78rem;color:#fde68a;font-weight:800;">
              ${state.currentTeam === 'A' ? '👉 A팀 차례! (맞추면 연속 찬스!)' : '대기 중'}
            </div>
          </div>
          <span class="status-val" style="color:#60a5fa;">${state.scoreA.toLocaleString()}점</span>
        </div>
        <div class="status-card ${state.currentTeam === 'B' ? 'active-turn' : ''}">
          <div>
            <div class="status-label" style="color:#fb7185;">🔴 B팀 (2분단) · ${state.pairsB}쌍</div>
            <div style="font-size:0.78rem;color:#fde68a;font-weight:800;">
              ${state.currentTeam === 'B' ? '👉 B팀 차례! (맞추면 연속 찬스!)' : '대기 중'}
            </div>
          </div>
          <span class="status-val" style="color:#fb7185;">${state.scoreB.toLocaleString()}점</span>
        </div>
        <div class="status-card">
          <span class="status-label">🎯 남은 공식 짝</span>
          <span class="status-val" style="color:#10b981;">${6 - state.matchedCount} 쌍</span>
        </div>
      `;
    }
  }

  function renderCardsGrid() {
    const grid = document.getElementById('cards-grid');
    if (!grid) return;

    grid.innerHTML = state.cards
      .map((card, idx) => {
        const stateClasses = [
          card.flipped ? 'flipped' : '',
          card.matched ? 'matched' : ''
        ].join(' ');

        const hasMystery = state.gimmicksEnabled && card.gimmick !== 'normal';

        return `
          <div class="card-slot ${stateClasses}" id="card-slot-${idx}" onclick="MatchGame.onCardClick(${idx})">
            <div class="card-inner">
              <!-- Card Back: Big Number 1~12 -->
              <div class="card-face card-back ${hasMystery ? 'has-mystery' : ''}">
                ${hasMystery ? '<span class="mystery-back-tag">❓ 복불복</span>' : ''}
                <div class="card-num-circle">${idx + 1}</div>
                <div class="card-back-sub">🦅 ${idx + 1}번 카드</div>
              </div>

              <!-- Card Front: Formula + Gimmick Pill -->
              <div class="card-face card-front type-${card.type}">
                <div class="card-top-row">
                  <span class="card-type-badge">${card.badge}</span>
                  ${card.gimmickLabel ? `<span class="gimmick-pill ${card.gimmickClass}">${card.gimmickLabel}</span>` : `<span style="opacity:0.7;">#${idx + 1}</span>`}
                </div>
                <div class="card-math-content">
                  ${KkachiMathData.renderMathText(card.content)}
                </div>
                <div class="card-match-stamp">✔ 짝 맞추기 성공!</div>
              </div>
            </div>
          </div>
        `;
      })
      .join('');
  }

  function addPointsToCurrent(pts) {
    if (!state.isTeamMode) {
      state.score = Math.max(0, state.score + pts);
    } else {
      if (state.currentTeam === 'A') {
        state.scoreA = Math.max(0, state.scoreA + pts);
      } else {
        state.scoreB = Math.max(0, state.scoreB + pts);
      }
    }
  }

  function onCardClick(idx) {
    if (state.lockBoard) return;
    const card = state.cards[idx];
    if (!card || card.flipped || card.matched) return;

    ensureTimerStarted();
    KkachiSound.click();

    card.flipped = true;
    const slotEl = document.getElementById(`card-slot-${idx}`);
    if (slotEl) slotEl.classList.add('flipped');

    if (state.firstCardIdx === null) {
      state.firstCardIdx = idx;
      if (card.gimmick === 'bomb') {
        setGimmickBanner(
          '⚠️ 앗! [💣 시한폭탄] 카드를 열었습니다! 이번 턴에 짝을 맞추면 🛠️+250점 해체 대박, 틀리면 💥-50점 폭발!',
          'event-bomb'
        );
      }
      return;
    }

    state.secondCardIdx = idx;
    state.moves += 1;
    state.lockBoard = true;

    const firstCard = state.cards[state.firstCardIdx];
    const secondCard = state.cards[state.secondCardIdx];

    if (firstCard.pairId === secondCard.pairId) {
      // MATCH!
      firstCard.matched = true;
      secondCard.matched = true;
      state.matchedCount += 1;
      state.combo += 1;

      if (state.isTeamMode) {
        if (state.currentTeam === 'A') state.pairsA += 1;
        else state.pairsB += 1;
      }

      const el1 = document.getElementById(`card-slot-${state.firstCardIdx}`);
      const el2 = document.getElementById(`card-slot-${state.secondCardIdx}`);
      if (el1) el1.classList.add('matched');
      if (el2) el2.classList.add('matched');

      applyMatchGimmickReward(firstCard.gimmick);

      state.firstCardIdx = null;
      state.secondCardIdx = null;
      state.lockBoard = false;
      renderStatusBar();

      if (state.matchedCount === 6) {
        handleGameClear();
      }
    } else {
      // MISMATCH
      state.combo = 0;
      const idx1 = state.firstCardIdx;
      const idx2 = state.secondCardIdx;
      const el1 = document.getElementById(`card-slot-${idx1}`);
      const el2 = document.getElementById(`card-slot-${idx2}`);
      const hasBomb = firstCard.gimmick === 'bomb' || secondCard.gimmick === 'bomb';

      setTimeout(() => {
        if (hasBomb) {
          KkachiSound.bomb();
          addPointsToCurrent(-50);
          const who = state.isTeamMode ? `${state.currentTeam}팀` : '내 점수';
          setGimmickBanner(`💥 펑!! [💣 시한폭탄] 짝 맞추기에 실패해 폭탄이 터졌습니다! (${who} -50점)`, 'event-bomb');
          showFloatingToast('💥 펑! 시한폭탄 폭발 (-50점)', '#f43f5e');
          renderStatusBar();
        } else {
          KkachiSound.wrong();
        }
        if (el1) el1.classList.add('mismatch');
        if (el2) el2.classList.add('mismatch');
      }, 220);

      setTimeout(() => {
        firstCard.flipped = false;
        secondCard.flipped = false;
        if (el1) el1.classList.remove('flipped', 'mismatch');
        if (el2) el2.classList.remove('flipped', 'mismatch');

        if (state.isTeamMode) {
          state.currentTeam = state.currentTeam === 'A' ? 'B' : 'A';
        }
        state.firstCardIdx = null;
        state.secondCardIdx = null;
        state.lockBoard = false;
        renderStatusBar();
      }, 1150);
    }
  }

  function applyMatchGimmickReward(gimmick) {
    let basePts = 100 + (state.combo > 1 ? (state.combo - 1) * 30 : 0);
    if (state.nextMatchDoubleBuff) {
      basePts *= 2;
      state.nextMatchDoubleBuff = false;
    }

    const teamLabel = state.isTeamMode ? `${state.currentTeam}팀 ` : '';

    if (gimmick === 'star') {
      const pts = basePts * 2;
      addPointsToCurrent(pts);
      KkachiSound.fever(1);
      setGimmickBanner(`⭐ [더블 스타] 발동! ${teamLabel}점수 2배 획득! (+${pts}점)`, 'event-star');
      showFloatingToast(`⭐ 점수 2배! +${pts}점`, '#f59e0b');
    } else if (gimmick === 'steal') {
      KkachiSound.steal();
      if (state.isTeamMode) {
        const oppTeam = state.currentTeam === 'A' ? 'B' : 'A';
        const oppScore = oppTeam === 'A' ? state.scoreA : state.scoreB;
        const stolen = Math.min(100, oppScore);
        if (oppTeam === 'A') state.scoreA -= stolen;
        else state.scoreB -= stolen;
        const totalGain = basePts + (stolen > 0 ? stolen : 100);
        addPointsToCurrent(totalGain);
        setGimmickBanner(
          `😈 [스틸 조커] 발동! ${oppTeam}팀의 점수를 뺏어 ${state.currentTeam}팀이 +${totalGain}점 획득!!`,
          'event-steal'
        );
        showFloatingToast(`😈 상대 점수 강탈! +${totalGain}점`, '#c084fc');
      } else {
        const pts = basePts + 150;
        addPointsToCurrent(pts);
        setGimmickBanner(`😈 [스틸 조커] 보너스 발동! 추가 보너스 +${pts}점 획득!`, 'event-steal');
        showFloatingToast(`😈 조커 보너스! +${pts}점`, '#c084fc');
      }
    } else if (gimmick === 'bomb') {
      const pts = basePts + 150;
      addPointsToCurrent(pts);
      KkachiSound.jackpot();
      setGimmickBanner(`🛠️ [폭탄 해체 대성공!] 위험한 폭탄 짝을 정확히 맞춰 해체 보너스 +${pts}점 획득!`, 'event-star');
      showFloatingToast(`🛠️ 폭탄 해체 성공! +${pts}점`, '#10b981');
    } else if (gimmick === 'radar') {
      const pts = basePts + 50;
      addPointsToCurrent(pts);
      KkachiSound.radar();
      setGimmickBanner(`⚡ [천리안 레이더] 발동! 아직 안 맞춘 다른 공식 1쌍의 위치를 2초간 자동 투시합니다!`, 'event-radar');
      showFloatingToast(`⚡ 레이더 발동! 1쌍 위치 투시!`, '#22d3ee');
      triggerRadarPeek();
    } else if (gimmick === 'jackpot') {
      const pts = basePts + 200;
      addPointsToCurrent(pts);
      KkachiSound.jackpot();
      setGimmickBanner(`👑 [황금 까치 잭팟!!] 전설의 잭팟 카드를 맞췄습니다! (+${pts}점)`, 'event-star');
      showFloatingToast(`👑 황금 잭팟!! +${pts}점`, '#fbbf24');
    } else {
      addPointsToCurrent(basePts);
      KkachiSound.correct(state.matchedCount * 2);
      const comboTxt = state.combo >= 2 ? ` (${state.combo}연속 콤보!)` : '';
      setGimmickBanner(`✔ 공식 짝 맞추기 성공! +${basePts}점 획득${comboTxt}`, '');
    }
  }

  function triggerRadarPeek() {
    // Find one unmatched pair and reveal both cards for 2 seconds
    const unmatched = state.cards
      .map((c, idx) => ({ c, idx }))
      .filter((item) => !item.c.matched && !item.c.flipped);

    if (unmatched.length < 2) return;
    const targetPairId = unmatched[0].c.pairId;
    const pairIndices = unmatched
      .filter((item) => item.c.pairId === targetPairId)
      .map((item) => item.idx);

    pairIndices.forEach((i) => {
      const el = document.getElementById(`card-slot-${i}`);
      if (el) el.classList.add('flipped', 'radar-peek');
    });

    setTimeout(() => {
      pairIndices.forEach((i) => {
        if (!state.cards[i].matched && !state.cards[i].flipped) {
          const el = document.getElementById(`card-slot-${i}`);
          if (el) el.classList.remove('flipped', 'radar-peek');
        }
      });
    }, 2100);
  }

  // 1-Time Mystery Roulette Chance Button
  function spinMysteryRoulette() {
    if (state.lockBoard || state.rouletteUsed || state.matchedCount === 6) return;
    state.rouletteUsed = true;
    const rBtn = document.getElementById('btn-roulette');
    if (rBtn) {
      rBtn.disabled = true;
      rBtn.textContent = '🎰 찬스 사용 완료';
    }

    ensureTimerStarted();
    const outcomes = ['auto_match', 'super_radar', 'double_buff'];
    const pick = outcomes[Math.floor(Math.random() * outcomes.length)];

    if (pick === 'auto_match') {
      // Automatically match 1 unmatched pair!
      const unmatched = state.cards
        .map((c, idx) => ({ c, idx }))
        .filter((item) => !item.c.matched && !item.c.flipped);

      if (unmatched.length >= 2) {
        const targetPairId = unmatched[0].c.pairId;
        const pairItems = unmatched.filter((item) => item.c.pairId === targetPairId);
        pairItems.forEach((item) => {
          item.c.flipped = true;
          item.c.matched = true;
          const el = document.getElementById(`card-slot-${item.idx}`);
          if (el) el.classList.add('flipped', 'matched');
        });
        state.matchedCount += 1;
        if (state.isTeamMode) {
          if (state.currentTeam === 'A') state.pairsA += 1;
          else state.pairsB += 1;
        }
        addPointsToCurrent(150);
        KkachiSound.jackpot();
        setGimmickBanner('🎰 [복불복 찬스 대박!] 까치가 날아와 숨겨진 공식 1쌍을 자동으로 맞춰주었습니다! (+150점)', 'event-star');
        showFloatingToast('🎰 자동 1쌍 매칭 대박! (+150점)', '#fbbf24');
        renderStatusBar();
        if (state.matchedCount === 6) handleGameClear();
        return;
      }
    }

    if (pick === 'super_radar') {
      KkachiSound.radar();
      setGimmickBanner('🎰 [복불복 찬스!] ⚡ 슈퍼 레이더 가동! 숨겨진 공식 2쌍(4장)을 2.5초간 투시합니다!', 'event-radar');
      showFloatingToast('🎰 슈퍼 레이더! 4장 투시!', '#22d3ee');
      const unmatched = state.cards
        .map((c, idx) => ({ c, idx }))
        .filter((item) => !item.c.matched && !item.c.flipped)
        .slice(0, 4);

      unmatched.forEach((item) => {
        const el = document.getElementById(`card-slot-${item.idx}`);
        if (el) el.classList.add('flipped', 'radar-peek');
      });
      setTimeout(() => {
        unmatched.forEach((item) => {
          if (!item.c.matched && !item.c.flipped) {
            const el = document.getElementById(`card-slot-${item.idx}`);
            if (el) el.classList.remove('flipped', 'radar-peek');
          }
        });
      }, 2500);
      return;
    }

    // double_buff
    state.nextMatchDoubleBuff = true;
    KkachiSound.fever(2);
    setGimmickBanner('🎰 [복불복 찬스!] 🔥 다음번 짝을 맞출 때 획득 점수가 무조건 2배가 됩니다! (⭐더블 스타와 중복 시 4배!)', 'event-steal');
    showFloatingToast('🔥 다음 성공 점수 2배 버프!', '#ec4899');
  }

  function peekAllCards() {
    if (state.lockBoard || state.matchedCount === 6) return;
    state.lockBoard = true;
    KkachiSound.fever(1);

    const btn = document.getElementById('btn-peek');
    if (btn) btn.textContent = '👀 3초 동안 위치 기억하세요!';

    state.cards.forEach((c, idx) => {
      if (!c.matched) {
        const el = document.getElementById(`card-slot-${idx}`);
        if (el) el.classList.add('flipped');
      }
    });

    setTimeout(() => {
      state.cards.forEach((c, idx) => {
        if (!c.matched && !c.flipped) {
          const el = document.getElementById(`card-slot-${idx}`);
          if (el) el.classList.remove('flipped');
        }
      });
      if (btn) btn.textContent = '👀 3초 전체 힌트';
      state.lockBoard = false;
    }, 2800);
  }

  function toggleTeamMode() {
    KkachiSound.click();
    state.isTeamMode = !state.isTeamMode;
    syncModeButtons();
    startNewGame();
  }

  function handleGameClear() {
    if (state.timerInterval) {
      clearInterval(state.timerInterval);
      state.timerInterval = null;
    }

    if (!state.isTeamMode) {
      if (state.score > state.bestScore) {
        state.bestScore = state.score;
        try {
          localStorage.setItem(STORAGE_KEY_BEST_SCORE, String(state.bestScore));
        } catch (e) {
          // ignore
        }
      }
    }

    setTimeout(() => {
      KkachiSound.victory();
      const modal = document.getElementById('modal-clear');
      const titleEl = document.getElementById('clear-title');
      const descEl = document.getElementById('clear-desc');
      const reviewEl = document.getElementById('clear-pairs-review');

      if (!state.isTeamMode) {
        titleEl.textContent = `🎉 클리어! 최종 ${state.score.toLocaleString()}점!`;
        descEl.innerHTML = `걸린 시간 <strong>${state.elapsedSec.toFixed(1)}초</strong> · 시도 <strong>${state.moves}회</strong> · 최고 기록 <strong>${state.bestScore.toLocaleString()}점</strong>`;
      } else {
        if (state.scoreA > state.scoreB) {
          titleEl.textContent = '🏆 🔵 A팀 (1분단) 최종 승리!';
        } else if (state.scoreB > state.scoreA) {
          titleEl.textContent = '🏆 🔴 B팀 (2분단) 최종 승리!';
        } else {
          titleEl.textContent = '🤝 동점 무승부!';
        }
        descEl.innerHTML = `🔵 A팀 <strong>${state.scoreA.toLocaleString()}점 (${state.pairsA}쌍)</strong> vs 🔴 B팀 <strong>${state.scoreB.toLocaleString()}점 (${state.pairsB}쌍)</strong>`;
      }

      reviewEl.innerHTML =
        `<div style="font-weight:800;color:#38bdf8;margin-bottom:6px;">📘 이번 라운드 고1 핵심 공식 6쌍 복습</div>` +
        state.selectedPairs
          .map((p, i) => `
            <div style="display:flex;justify-content:space-between;gap:10px;border-bottom:1px solid rgba(255,255,255,0.07);padding:4px 0;">
              <span>${i + 1}. ${KkachiMathData.renderMathText(p.q)}</span>
              <span style="color:#34d399;font-weight:800;">= ${KkachiMathData.renderMathText(p.a)}</span>
            </div>
          `)
          .join('');

      modal.classList.add('active');
      renderStatusBar();
    }, 450);
  }

  function closeClearAndRestart() {
    KkachiSound.click();
    document.getElementById('modal-clear').classList.remove('active');
    startNewGame();
  }

  function closeClearAndGoIntro() {
    document.getElementById('modal-clear').classList.remove('active');
    showIntroScreen();
  }

  // Custom 6-Pair Modal
  function openCustomModal() {
    KkachiSound.click();
    const rowsEl = document.getElementById('custom-pairs-rows');
    const basePairs = state.selectedPairs.length === 6
      ? state.selectedPairs
      : KkachiMathData.CHAPTERS[0].pairs.slice(0, 6);

    rowsEl.innerHTML = basePairs
      .map((p, i) => `
        <div class="pair-edit-row">
          <span style="font-weight:900;color:#38bdf8;">#${i + 1}</span>
          <input type="text" class="pair-input" id="cp-q-${i}" value="${escapeAttr(p.q)}" placeholder="개념 또는 질문" />
          <input type="text" class="pair-input" id="cp-a-${i}" value="${escapeAttr(p.a)}" placeholder="정답 또는 공식" />
        </div>
      `)
      .join('');

    document.getElementById('modal-custom').classList.add('active');
  }

  function closeCustomModal() {
    document.getElementById('modal-custom').classList.remove('active');
  }

  function applyCustomPairs() {
    const custom = [];
    for (let i = 0; i < 6; i++) {
      const q = (document.getElementById(`cp-q-${i}`).value || '').trim();
      const a = (document.getElementById(`cp-a-${i}`).value || '').trim();
      if (!q || !a) {
        alert(`${i + 1}번째 줄의 질문과 정답을 모두 입력해주세요.`);
        return;
      }
      custom.push({ id: `cust_${i}`, q, a });
    }
    state.customPairs = custom;
    try {
      localStorage.setItem(STORAGE_KEY_CUSTOM, JSON.stringify(custom));
    } catch (e) {
      // ignore
    }
    state.chapterId = 'custom';
    closeCustomModal();
    renderChapterTabs();
    enterGameScreen();
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

  function escapeAttr(str) {
    return String(str || '').replace(/"/g, '&quot;');
  }

  global.MatchGame = {
    init,
    showIntroScreen,
    enterGameScreen,
    setIntroMode,
    toggleGimmicksEnabled,
    selectChapter,
    startNewGame,
    onCardClick,
    spinMysteryRoulette,
    peekAllCards,
    toggleTeamMode,
    closeClearAndRestart,
    closeClearAndGoIntro,
    openCustomModal,
    closeCustomModal,
    applyCustomPairs,
    openWebAppModal,
    closeWebAppModal,
    installPWA,
    copyWebAppUrl,
    toggleSound
  };

  window.addEventListener('DOMContentLoaded', init);
})(window);
