/**
 * 까치매스 (KKACHI MATH) - 고1 수학 공식 12장 짝맞추기 웹앱 (Vercel & PWA 배포 최적화)
 */
(function (global) {
  const STORAGE_KEY_CUSTOM = 'kkachi_g1_custom_pairs_v1';
  const STORAGE_KEY_BEST = 'kkachi_g1_best_time_v1';

  const state = {
    chapterId: 'all', // 'all' | 'ch1' | 'ch2' | 'ch3' | 'ch4' | 'ch5' | 'custom'
    customPairs: null,
    selectedPairs: [],
    cards: [], // 12 cards
    firstCardIdx: null,
    secondCardIdx: null,
    lockBoard: false,

    matchedCount: 0,
    moves: 0,
    startTime: 0,
    elapsedSec: 0,
    timerInterval: null,
    bestTimeSec: null,

    // Team mode (A팀 vs B팀)
    isTeamMode: false,
    currentTeam: 'A', // 'A' | 'B'
    scoreA: 0,
    scoreB: 0,

    // Web App / PWA state
    deferredPrompt: null,
    shareUrl: null
  };

  async function init() {
    loadSavedData();
    registerServiceWorker();
    await detectShareUrl();
    renderChapterTabs();
    startNewGame();
  }

  function loadSavedData() {
    try {
      const savedBest = localStorage.getItem(STORAGE_KEY_BEST);
      if (savedBest && !isNaN(Number(savedBest))) {
        state.bestTimeSec = Number(savedBest);
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
        // fallback to current URL
      }
    }
    // On Vercel (https://*.vercel.app) or custom domain, use clean origin + pathname
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
    const container = document.getElementById('chapter-tabs');
    if (!container) return;

    const tabs = [
      { id: 'all', title: '🔥 고1 전체 랜덤' },
      ...KkachiMathData.CHAPTERS.map((c) => ({ id: c.id, title: c.title }))
    ];
    if (state.customPairs && state.customPairs.length === 6) {
      tabs.push({ id: 'custom', title: '⭐ 내 커스텀 문제' });
    }

    container.innerHTML = tabs
      .map((t) => `
        <button class="tab-btn ${state.chapterId === t.id ? 'active' : ''}" onclick="MatchGame.selectChapter('${t.id}')">
          ${t.title}
        </button>
      `)
      .join('');
  }

  function selectChapter(chId) {
    KkachiSound.click();
    state.chapterId = chId;
    renderChapterTabs();
    startNewGame();
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

    // Create 12 cards (6 Question cards + 6 Answer cards)
    const rawCards = [];
    sixPairs.forEach((pair) => {
      rawCards.push({
        pairId: pair.id,
        type: 'q',
        badge: '📘 개념 · 질문',
        content: pair.q,
        flipped: false,
        matched: false
      });
      rawCards.push({
        pairId: pair.id,
        type: 'a',
        badge: '💡 정답 · 공식',
        content: pair.a,
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
    state.elapsedSec = 0;
    state.startTime = 0;
    state.currentTeam = 'A';
    state.scoreA = 0;
    state.scoreB = 0;

    renderStatusBar();
    renderCardsGrid();
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
          <span class="status-label">🎯 찾은 공식 짝</span>
          <span class="status-val" style="color:#10b981;">${state.matchedCount} / 6 쌍</span>
        </div>
        <div class="status-card">
          <span class="status-label">👆 뒤집은 횟수</span>
          <span class="status-val" style="color:#38bdf8;">${state.moves} 회</span>
        </div>
        <div class="status-card">
          <span class="status-label">⏱️ 경과 시간</span>
          <span class="status-val" id="stat-timer" style="color:#fbbf24;">${state.elapsedSec.toFixed(1)}초</span>
        </div>
        <div class="status-card">
          <span class="status-label">🏆 최고 기록</span>
          <span class="status-val" style="color:#f472b6;">${state.bestTimeSec ? state.bestTimeSec.toFixed(1) + '초' : '-'}</span>
        </div>
      `;
    } else {
      bar.innerHTML = `
        <div class="status-card ${state.currentTeam === 'A' ? 'active-turn' : ''}">
          <div>
            <div class="status-label" style="color:#60a5fa;">🔵 A팀 (1분단)</div>
            <div style="font-size:0.78rem;color:#fde68a;font-weight:800;">
              ${state.currentTeam === 'A' ? '👉 현재 A팀 차례! (맞추면 한 번 더!)' : '대기 중'}
            </div>
          </div>
          <span class="status-val" style="color:#60a5fa;">${state.scoreA} 쌍</span>
        </div>
        <div class="status-card ${state.currentTeam === 'B' ? 'active-turn' : ''}">
          <div>
            <div class="status-label" style="color:#fb7185;">🔴 B팀 (2분단)</div>
            <div style="font-size:0.78rem;color:#fde68a;font-weight:800;">
              ${state.currentTeam === 'B' ? '👉 현재 B팀 차례! (맞추면 한 번 더!)' : '대기 중'}
            </div>
          </div>
          <span class="status-val" style="color:#fb7185;">${state.scoreB} 쌍</span>
        </div>
        <div class="status-card">
          <span class="status-label">🎯 남은 카드 짝</span>
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

        return `
          <div class="card-slot ${stateClasses}" id="card-slot-${idx}" onclick="MatchGame.onCardClick(${idx})">
            <div class="card-inner">
              <!-- Card Back: Big Number 1~12 -->
              <div class="card-face card-back">
                <div class="card-num-circle">${idx + 1}</div>
                <div class="card-back-sub">🦅 ${idx + 1}번 카드</div>
              </div>

              <!-- Card Front: Formula or Concept -->
              <div class="card-face card-front type-${card.type}">
                <div class="card-top-row">
                  <span class="card-type-badge">${card.badge}</span>
                  <span style="opacity:0.75;">#${idx + 1}</span>
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

      if (state.isTeamMode) {
        if (state.currentTeam === 'A') state.scoreA += 1;
        else state.scoreB += 1;
      }

      const el1 = document.getElementById(`card-slot-${state.firstCardIdx}`);
      const el2 = document.getElementById(`card-slot-${state.secondCardIdx}`);
      if (el1) el1.classList.add('matched');
      if (el2) el2.classList.add('matched');

      KkachiSound.correct(state.matchedCount * 2);
      state.firstCardIdx = null;
      state.secondCardIdx = null;
      state.lockBoard = false;
      renderStatusBar();

      if (state.matchedCount === 6) {
        handleGameClear();
      }
    } else {
      // MISMATCH -> Wait 1.05s so students can see and memorize, then flip back
      const idx1 = state.firstCardIdx;
      const idx2 = state.secondCardIdx;
      const el1 = document.getElementById(`card-slot-${idx1}`);
      const el2 = document.getElementById(`card-slot-${idx2}`);

      setTimeout(() => {
        KkachiSound.wrong();
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
      }, 1100);
    }
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
    const btn = document.getElementById('btn-mode-toggle');
    if (btn) {
      btn.textContent = state.isTeamMode ? '⏱️ 1인 타임어택으로 전환' : '🆚 2팀 대결 모드 켜기';
    }
    startNewGame();
  }

  function handleGameClear() {
    if (state.timerInterval) {
      clearInterval(state.timerInterval);
      state.timerInterval = null;
    }

    if (!state.isTeamMode) {
      if (!state.bestTimeSec || state.elapsedSec < state.bestTimeSec) {
        state.bestTimeSec = state.elapsedSec;
        try {
          localStorage.setItem(STORAGE_KEY_BEST, String(state.bestTimeSec));
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
        titleEl.textContent = '🎉 6쌍 모두 짝맞추기 클리어!';
        descEl.innerHTML = `총 <strong>${state.moves}번</strong> 뒤집기 · 걸린 시간 <strong>${state.elapsedSec.toFixed(1)}초</strong>!`;
      } else {
        if (state.scoreA > state.scoreB) {
          titleEl.textContent = '🏆 🔵 A팀 (1분단) 승리!';
        } else if (state.scoreB > state.scoreA) {
          titleEl.textContent = '🏆 🔴 B팀 (2분단) 승리!';
        } else {
          titleEl.textContent = '🤝 3 대 3 무승부!';
        }
        descEl.innerHTML = `🔵 A팀 <strong>${state.scoreA}쌍</strong> vs 🔴 B팀 <strong>${state.scoreB}쌍</strong> (총 ${state.moves}회 시도)`;
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
    startNewGame();
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
    selectChapter,
    startNewGame,
    onCardClick,
    peekAllCards,
    toggleTeamMode,
    closeClearAndRestart,
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
