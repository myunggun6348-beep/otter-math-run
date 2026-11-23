const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = process.env.PORT || 3000;
const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, 'data');
const DECKS_FILE = path.join(DATA_DIR, 'custom_decks.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (e) {
    // ignore
  }
}

// Active rooms in memory
const rooms = new Map();
// SSE subscribers per room: roomCode -> Set<res>
const roomSubscribers = new Map();

// Virtual bot profiles for classroom simulation
const BOT_PROFILES = [
  { name: '김민준', avatar: '🦅', accuracy: 0.86, speedMin: 1800, speedMax: 4200 },
  { name: '이서연', avatar: '🐥', accuracy: 0.91, speedMin: 1600, speedMax: 3800 },
  { name: '박도현', avatar: '🦉', accuracy: 0.74, speedMin: 2200, speedMax: 5200 },
  { name: '최지우', avatar: '🐧', accuracy: 0.82, speedMin: 1900, speedMax: 4500 },
  { name: '정우진', avatar: '🦜', accuracy: 0.68, speedMin: 1500, speedMax: 3500 },
  { name: '한소희', avatar: '🦢', accuracy: 0.88, speedMin: 2000, speedMax: 4100 },
  { name: '강태양', avatar: '🦩', accuracy: 0.77, speedMin: 2100, speedMax: 4800 },
  { name: '윤서아', avatar: '🕊️', accuracy: 0.93, speedMin: 2300, speedMax: 4600 },
  { name: '임재현', avatar: '🦚', accuracy: 0.71, speedMin: 1700, speedMax: 4000 },
  { name: '송하윤', avatar: '🐤', accuracy: 0.84, speedMin: 1900, speedMax: 4300 }
];

function getLocalIPs() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }
  // Sort to prioritize 192.168.x.x or 10.x.x.x
  ips.sort((a, b) => {
    const score = (ip) => (ip.startsWith('192.168.') ? 3 : ip.startsWith('10.') ? 2 : ip.startsWith('172.') ? 1 : 0);
    return score(b) - score(a);
  });
  return ips.length ? ips : ['localhost'];
}

function generateRoomCode() {
  for (let i = 0; i < 100; i++) {
    const code = String(Math.floor(1000 + Math.random() * 9000));
    if (!rooms.has(code)) return code;
  }
  return String(Math.floor(1000 + Math.random() * 9000));
}

function serializeRoom(room) {
  const now = Date.now();
  let remainingMs = 0;
  let countdownMs = 0;

  if (room.status === 'countdown') {
    countdownMs = Math.max(0, room.startTime - now);
    remainingMs = room.durationSec * 1000;
  } else if (room.status === 'playing') {
    remainingMs = Math.max(0, room.endTime - now);
  }

  const playersList = Array.from(room.players.values()).sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.maxCombo !== a.maxCombo) return b.maxCombo - a.maxCombo;
    return a.joinedAt - b.joinedAt;
  });

  playersList.forEach((p, idx) => {
    p.rank = idx + 1;
  });

  const questionStatsObj = {};
  for (const [qId, stat] of room.questionStats.entries()) {
    questionStatsObj[qId] = stat;
  }

  return {
    code: room.code,
    deckId: room.deckId,
    deckTitle: room.deckTitle,
    durationSec: room.durationSec,
    questionFilter: room.questionFilter || 'all',
    status: room.status,
    serverNow: now,
    startTime: room.startTime,
    endTime: room.endTime,
    countdownMs,
    remainingMs,
    questions: room.questions,
    players: playersList,
    questionStats: questionStatsObj,
    feed: room.feed.slice(0, 18)
  };
}

function broadcastRoom(roomCode, eventType = 'update') {
  const room = rooms.get(roomCode);
  const subs = roomSubscribers.get(roomCode);
  if (!room || !subs || subs.size === 0) return;

  const payload = JSON.stringify({
    type: eventType,
    room: serializeRoom(room)
  });

  for (const res of subs) {
    try {
      res.write(`data: ${payload}\n\n`);
    } catch (e) {
      subs.delete(res);
    }
  }
}

function addFeedItem(room, icon, text, highlight = 'normal') {
  room.feed.unshift({
    id: Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    icon,
    text,
    highlight,
    time: Date.now()
  });
  if (room.feed.length > 35) {
    room.feed.length = 35;
  }
}

function processPlayerAnswer(room, { playerId, questionId, isCorrect, pointsDelta, responseTimeMs }) {
  if (room.status !== 'playing') return null;
  const player = room.players.get(playerId);
  if (!player) return null;

  // Record previous top player to check for overtake
  const prevTop = Array.from(room.players.values()).sort((a, b) => b.score - a.score)[0];

  // Update question stats
  if (questionId) {
    if (!room.questionStats.has(questionId)) {
      room.questionStats.set(questionId, { attempts: 0, correct: 0, wrong: 0 });
    }
    const qStat = room.questionStats.get(questionId);
    qStat.attempts += 1;
    if (isCorrect) qStat.correct += 1;
    else qStat.wrong += 1;
  }

  if (isCorrect) {
    player.combo += 1;
    if (player.combo > player.maxCombo) {
      player.maxCombo = player.combo;
    }
    player.correctCount += 1;
    player.totalResponseTimeMs += (responseTimeMs || 2000);

    const feverLevel = player.combo >= 10 ? 2 : player.combo >= 5 ? 1 : 0;
    player.feverLevel = feverLevel;

    const calculatedPoints = typeof pointsDelta === 'number'
      ? pointsDelta
      : Math.round((100 + Math.max(0, Math.floor((4000 - Math.min(4000, responseTimeMs || 2000)) / 80))) * (feverLevel === 2 ? 3 : feverLevel === 1 ? 2 : 1));

    player.score += calculatedPoints;
    player.lastAction = 'correct';
    player.lastActionAt = Date.now();

    if (player.combo === 5) {
      addFeedItem(room, '🔥', `${player.avatar} ${player.nickname} 5콤보 FEVER 돌입! (점수 2배)`, 'fever');
    } else if (player.combo === 10) {
      addFeedItem(room, '⚡', `${player.avatar} ${player.nickname} 10콤보 SUPER FEVER!! (점수 3배)`, 'super');
    } else if (player.combo >= 15 && player.combo % 5 === 0) {
      addFeedItem(room, '👑', `${player.avatar} ${player.nickname} 경이로운 ${player.combo}연속 정답!!`, 'super');
    } else if ((responseTimeMs || 3000) <= 1600 && Math.random() < 0.35) {
      addFeedItem(room, '🎯', `${player.avatar} ${player.nickname} 1초 컷 광속 정답! (+${calculatedPoints}점)`, 'fast');
    }
  } else {
    const brokenCombo = player.combo;
    player.combo = 0;
    player.feverLevel = 0;
    player.wrongCount += 1;
    player.lastAction = 'wrong';
    player.lastActionAt = Date.now();

    if (brokenCombo >= 5) {
      addFeedItem(room, '❄️', `${player.avatar} ${player.nickname} 아쉽게 ${brokenCombo}콤보 중단! (1.5초 빙결)`, 'freeze');
    } else if (Math.random() < 0.25) {
      addFeedItem(room, '🧊', `${player.avatar} ${player.nickname} 함정 문제에 걸려 1.5초 빙결!`, 'freeze');
    }
  }

  // Check if player just overtook 1st place
  const newTop = Array.from(room.players.values()).sort((a, b) => b.score - a.score)[0];
  if (
    newTop &&
    prevTop &&
    newTop.id === player.id &&
    prevTop.id !== player.id &&
    newTop.score > 300
  ) {
    addFeedItem(room, '🏆', `${player.avatar} ${player.nickname} 역전 1위 탈환! (${player.score.toLocaleString()}점)`, 'lead');
  }

  return player;
}

function startRoomLifecycle(room) {
  // Clear existing intervals
  if (room.timerInterval) clearInterval(room.timerInterval);
  if (room.botInterval) clearInterval(room.botInterval);

  const now = Date.now();
  room.status = 'countdown';
  room.startTime = now + 3200;
  room.endTime = room.startTime + room.durationSec * 1000;
  addFeedItem(room, '🚀', `[${room.deckTitle}] ${room.durationSec}초 스피드 배틀이 곧 시작됩니다!`, 'lead');
  broadcastRoom(room.code, 'countdown');

  room.timerInterval = setInterval(() => {
    const current = Date.now();
    if (room.status === 'countdown' && current >= room.startTime) {
      room.status = 'playing';
      addFeedItem(room, '⚡', `배틀 시작! 카드를 스와이프하고 콤보를 쌓으세요!`, 'fever');
      broadcastRoom(room.code, 'start');
    } else if (room.status === 'playing' && current >= room.endTime) {
      endRoomGame(room);
    } else if (room.status === 'playing') {
      broadcastRoom(room.code, 'tick');
    }
  }, 1000);

  // Bot simulation loop
  room.botInterval = setInterval(() => {
    if (room.status !== 'playing') return;
    const current = Date.now();
    const questions = room.questions || [];
    if (!questions.length) return;

    let anyBotMoved = false;
    for (const player of room.players.values()) {
      if (!player.isBot) continue;
      if (current < (player.nextMoveAt || 0)) continue;

      const q = questions[Math.floor(Math.random() * questions.length)];
      const isCorrect = Math.random() < (player.botAccuracy || 0.8);
      const respTime = Math.floor(
        (player.botSpeedMin || 1800) + Math.random() * ((player.botSpeedMax || 4200) - (player.botSpeedMin || 1800))
      );

      processPlayerAnswer(room, {
        playerId: player.id,
        questionId: q.id,
        isCorrect,
        responseTimeMs: respTime
      });

      const penaltyWait = isCorrect ? 0 : 1500;
      player.nextMoveAt = current + respTime + penaltyWait;
      anyBotMoved = true;
    }

    if (anyBotMoved) {
      broadcastRoom(room.code, 'update');
    }
  }, 700);
}

function endRoomGame(room) {
  if (room.timerInterval) {
    clearInterval(room.timerInterval);
    room.timerInterval = null;
  }
  if (room.botInterval) {
    clearInterval(room.botInterval);
    room.botInterval = null;
  }
  if (room.status === 'ended') return;
  room.status = 'ended';
  room.endTime = Date.now();

  const sorted = Array.from(room.players.values()).sort((a, b) => b.score - a.score);
  if (sorted.length > 0) {
    addFeedItem(room, '🎉', `게임 종료! 최종 우승: ${sorted[0].avatar} ${sorted[0].nickname} (${sorted[0].score.toLocaleString()}점)`, 'lead');
  } else {
    addFeedItem(room, '🏁', `시간 종료! 배틀이 마감되었습니다.`, 'lead');
  }
  broadcastRoom(room.code, 'ended');
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString('utf8');
      if (body.length > 5 * 1024 * 1024) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data));
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  try {
    // 1. Server Info API
    if (pathname === '/api/info' && req.method === 'GET') {
      return sendJson(res, 200, {
        ok: true,
        ips: getLocalIPs(),
        port: PORT,
        now: Date.now()
      });
    }

    // 2. Custom Decks Persistence API
    if (pathname === '/api/decks' && req.method === 'GET') {
      if (fs.existsSync(DECKS_FILE)) {
        const raw = fs.readFileSync(DECKS_FILE, 'utf8');
        return sendJson(res, 200, { ok: true, decks: JSON.parse(raw) });
      }
      return sendJson(res, 200, { ok: true, decks: null });
    }

    if (pathname === '/api/decks' && req.method === 'POST') {
      const body = await readJsonBody(req);
      if (Array.isArray(body.decks)) {
        fs.writeFileSync(DECKS_FILE, JSON.stringify(body.decks, null, 2), 'utf8');
        return sendJson(res, 200, { ok: true });
      }
      return sendJson(res, 400, { ok: false, error: 'Invalid decks payload' });
    }

    // 3. Create Room API
    if (pathname === '/api/rooms' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const code = body.preferredCode && !rooms.has(String(body.preferredCode))
        ? String(body.preferredCode)
        : generateRoomCode();

      const room = {
        code,
        deckId: body.deckId || 'math1',
        deckTitle: body.deckTitle || '고등수학 1',
        durationSec: Number(body.durationSec) || 60,
        questionFilter: body.questionFilter || 'all',
        questions: Array.isArray(body.questions) ? body.questions : [],
        status: 'lobby',
        createdAt: Date.now(),
        startTime: 0,
        endTime: 0,
        players: new Map(),
        questionStats: new Map(),
        feed: []
      };

      addFeedItem(room, '📢', `[${room.deckTitle}] 대기실이 열렸습니다! 방 코드: ${code}`, 'lead');
      rooms.set(code, room);
      roomSubscribers.set(code, new Set());

      return sendJson(res, 200, { ok: true, room: serializeRoom(room) });
    }

    // 4. Room routes: /api/rooms/:code[/action]
    const roomMatch = pathname.match(/^\/api\/rooms\/([A-Za-z0-9_-]+)(?:\/([a-z_]+))?$/);
    if (roomMatch) {
      const code = roomMatch[1];
      const action = roomMatch[2] || '';
      const room = rooms.get(code);

      if (!room) {
        return sendJson(res, 404, { ok: false, error: '방을 찾을 수 없습니다. 방 코드를 확인해주세요.' });
      }

      // GET /api/rooms/:code
      if (!action && req.method === 'GET') {
        return sendJson(res, 200, { ok: true, room: serializeRoom(room) });
      }

      // GET /api/rooms/:code/stream (SSE)
      if (action === 'stream' && req.method === 'GET') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*'
        });

        const subs = roomSubscribers.get(code) || new Set();
        subs.add(res);
        roomSubscribers.set(code, subs);

        // Send initial state immediately
        const initPayload = JSON.stringify({ type: 'init', room: serializeRoom(room) });
        res.write(`data: ${initPayload}\n\n`);

        req.on('close', () => {
          subs.delete(res);
        });
        return;
      }

      // POST /api/rooms/:code/join
      if (action === 'join' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const nickname = String(body.nickname || '익명까치').trim().slice(0, 12) || '익명까치';
        const avatar = String(body.avatar || '🐧');
        const playerId = body.playerId || ('p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6));

        let player = room.players.get(playerId);
        if (!player) {
          // Also check if same nickname exists and reconnect
          for (const existing of room.players.values()) {
            if (!existing.isBot && existing.nickname === nickname) {
              player = existing;
              break;
            }
          }
        }

        if (!player) {
          player = {
            id: playerId,
            nickname,
            avatar,
            score: 0,
            combo: 0,
            maxCombo: 0,
            feverLevel: 0,
            correctCount: 0,
            wrongCount: 0,
            totalResponseTimeMs: 0,
            isBot: false,
            joinedAt: Date.now(),
            lastAction: 'join',
            lastActionAt: Date.now()
          };
          room.players.set(player.id, player);
          addFeedItem(room, '👋', `${avatar} ${nickname} 학생이 입장했습니다!`, 'join');
          broadcastRoom(code, 'join');
        } else {
          player.avatar = avatar;
          broadcastRoom(code, 'update');
        }

        return sendJson(res, 200, {
          ok: true,
          player,
          room: serializeRoom(room)
        });
      }

      // POST /api/rooms/:code/answer
      if (action === 'answer' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const player = processPlayerAnswer(room, body);
        if (!player) {
          return sendJson(res, 400, { ok: false, error: '현재 답변을 제출할 수 없는 상태입니다.' });
        }
        broadcastRoom(code, 'answer');
        return sendJson(res, 200, {
          ok: true,
          player,
          room: serializeRoom(room)
        });
      }

      // POST /api/rooms/:code/control
      if (action === 'control' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const cmd = body.command;

        if (cmd === 'start') {
          // Reset scores before starting
          room.questionStats.clear();
          const now = Date.now();
          for (const p of room.players.values()) {
            p.score = 0;
            p.combo = 0;
            p.maxCombo = 0;
            p.feverLevel = 0;
            p.correctCount = 0;
            p.wrongCount = 0;
            p.totalResponseTimeMs = 0;
            if (p.isBot) {
              p.nextMoveAt = now + 3500 + Math.floor(Math.random() * 2000);
            }
          }
          if (Array.isArray(body.questions) && body.questions.length > 0) {
            room.questions = body.questions;
          }
          if (body.deckTitle) room.deckTitle = body.deckTitle;
          if (body.durationSec) room.durationSec = Number(body.durationSec);

          startRoomLifecycle(room);
          return sendJson(res, 200, { ok: true, room: serializeRoom(room) });
        }

        if (cmd === 'end') {
          endRoomGame(room);
          return sendJson(res, 200, { ok: true, room: serializeRoom(room) });
        }

        if (cmd === 'reset') {
          if (room.timerInterval) clearInterval(room.timerInterval);
          if (room.botInterval) clearInterval(room.botInterval);
          room.status = 'lobby';
          room.questionStats.clear();
          if (Array.isArray(body.questions) && body.questions.length > 0) {
            room.questions = body.questions;
          }
          if (body.deckTitle) room.deckTitle = body.deckTitle;
          if (body.durationSec) room.durationSec = Number(body.durationSec);

          for (const p of room.players.values()) {
            p.score = 0;
            p.combo = 0;
            p.maxCombo = 0;
            p.feverLevel = 0;
            p.correctCount = 0;
            p.wrongCount = 0;
            p.totalResponseTimeMs = 0;
          }
          addFeedItem(room, '🔄', `대기실로 복귀했습니다. 다음 라운드를 준비하세요!`, 'lead');
          broadcastRoom(code, 'reset');
          return sendJson(res, 200, { ok: true, room: serializeRoom(room) });
        }

        if (cmd === 'add_bots') {
          const count = Number(body.count) || 5;
          const existingNames = new Set(Array.from(room.players.values()).map((p) => p.nickname));
          let added = 0;
          for (const prof of BOT_PROFILES) {
            if (added >= count) break;
            let botName = prof.name + '(AI)';
            if (existingNames.has(botName)) {
              botName = prof.name + Math.floor(10 + Math.random() * 89) + '(AI)';
            }
            const botId = 'bot_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
            room.players.set(botId, {
              id: botId,
              nickname: botName,
              avatar: prof.avatar,
              score: 0,
              combo: 0,
              maxCombo: 0,
              feverLevel: 0,
              correctCount: 0,
              wrongCount: 0,
              totalResponseTimeMs: 0,
              isBot: true,
              botAccuracy: prof.accuracy,
              botSpeedMin: prof.speedMin,
              botSpeedMax: prof.speedMax,
              nextMoveAt: Date.now() + 2000 + Math.floor(Math.random() * 2500),
              joinedAt: Date.now(),
              lastAction: 'join',
              lastActionAt: Date.now()
            });
            existingNames.add(botName);
            added++;
          }
          addFeedItem(room, '🤖', `가상 학생 AI 봇 ${added}명이 교실에 합류했습니다!`, 'join');
          broadcastRoom(code, 'join');
          return sendJson(res, 200, { ok: true, room: serializeRoom(room) });
        }

        if (cmd === 'kick_player') {
          const targetId = body.playerId;
          if (targetId && room.players.has(targetId)) {
            room.players.delete(targetId);
            broadcastRoom(code, 'update');
          }
          return sendJson(res, 200, { ok: true, room: serializeRoom(room) });
        }

        return sendJson(res, 400, { ok: false, error: 'Unknown control command' });
      }
    }

    // 5. Static File Serving
    let relPath = pathname === '/' ? '/index.html' : decodeURIComponent(pathname);
    // Prevent directory traversal
    const safePath = path.normalize(path.join(ROOT_DIR, relPath));
    if (!safePath.startsWith(ROOT_DIR)) {
      res.writeHead(403);
      return res.end('Forbidden');
    }

    if (fs.existsSync(safePath) && fs.statSync(safePath).isFile()) {
      const ext = path.extname(safePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType });
      fs.createReadStream(safePath).pipe(res);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
    }
  } catch (err) {
    console.error('Server error:', err);
    sendJson(res, 500, { ok: false, error: err.message || 'Internal Server Error' });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  const ips = getLocalIPs();
  console.log('====================================================');
  console.log(' 🦅 까치매스 (KKACHI MATH) 실시간 교실 아케이드 서버');
  console.log('====================================================');
  console.log(` ▶ 교사용 PC 접속 주소 : http://localhost:${PORT}`);
  ips.forEach((ip) => {
    console.log(` ▶ 학생 스마트폰 접속  : http://${ip}:${PORT}`);
  });
  console.log('====================================================');
});
