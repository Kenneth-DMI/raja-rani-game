// Raja Rani - Traditional Indian School Game Server
// Deploy: Render (Web Service, Build: npm install, Start: npm start)
// Frontend (Netlify) connects via Socket.IO client.

const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

const PORT = process.env.PORT || 3001;

// ---------- Roles: classic 10-player ladder + extended court for 11-24 ----------
// Classic anchors (unchanged): Raja 1000, Rani 800, Minister 700, Commander 600,
// Soldier 500, Guard 400, Citizen 300, Villager 200, Helper 100, Thief 0.
// 11+ player games keep all 9 classic non-thief roles, then add extended court
// roles in points order, then the Thief.
const CLASSIC_ORDER = [
  { key: 'raja',     nameEn: 'Raja',     points: 1000, emoji: '👑', fixed: true,  desc: 'King - reveals first, always 1000' },
  { key: 'rani',     nameEn: 'Rani',     points: 800,  emoji: '👸', fixed: true,  desc: 'Queen - fixed 800' },
  { key: 'minister', nameEn: 'Minister', points: 700,  emoji: '📜', guesser: true, desc: 'Minister - must find the Thief' },
  { key: 'commander', nameEn: 'Commander', points: 600,  emoji: '🛡️', fixed: true,  desc: 'Commander - fixed 600' },
  { key: 'soldier',  nameEn: 'Soldier',  points: 500,  emoji: '💂', fixed: true,  desc: 'Soldier - fixed 500' },
  { key: 'guard',    nameEn: 'Guard',    points: 400,  emoji: '🏰', fixed: true,  desc: 'Guard - fixed 400' },
  { key: 'citizen',  nameEn: 'Citizen',  points: 300,  emoji: '🧑‍🌾', fixed: true,  desc: 'Citizen - fixed 300' },
  { key: 'villager', nameEn: 'Villager', points: 200,  emoji: '👳', fixed: true,  desc: 'Villager - fixed 200' },
  { key: 'helper',   nameEn: 'Helper',   points: 100,  emoji: '🙏', fixed: true,  desc: 'Helper - fixed 100' },
];

const EXTENDED_ROLES = [
  { key: 'crownprince', nameEn: 'Crown Prince', points: 900, emoji: '🤴', fixed: true, desc: 'Crown Prince - fixed 900' },
  { key: 'treasurer',   nameEn: 'Treasurer',    points: 850, emoji: '💎', fixed: true, desc: 'Treasurer - fixed 850' },
  { key: 'noble',       nameEn: 'Noble',        points: 750, emoji: '🎩', fixed: true, desc: 'Noble - fixed 750' },
  { key: 'advisor',     nameEn: 'Advisor',      points: 650, emoji: '🧙', fixed: true, desc: 'Advisor - fixed 650' },
  { key: 'captain',     nameEn: 'Captain',      points: 550, emoji: '⚔️', fixed: true, desc: 'Captain - fixed 550' },
  { key: 'archer',      nameEn: 'Archer',       points: 450, emoji: '🏹', fixed: true, desc: 'Archer - fixed 450' },
  { key: 'merchant',    nameEn: 'Merchant',     points: 350, emoji: '💰', fixed: true, desc: 'Merchant - fixed 350' },
  { key: 'blacksmith',  nameEn: 'Blacksmith',   points: 325, emoji: '🔨', fixed: true, desc: 'Blacksmith - fixed 325' },
  { key: 'messenger',   nameEn: 'Messenger',    points: 250, emoji: '✉️', fixed: true, desc: 'Messenger - fixed 250' },
  { key: 'drummer',     nameEn: 'Drummer',      points: 225, emoji: '🥁', fixed: true, desc: 'Drummer - fixed 225' },
  { key: 'farmer',      nameEn: 'Farmer',       points: 150, emoji: '🌾', fixed: true, desc: 'Farmer - fixed 150' },
  { key: 'cook',        nameEn: 'Cook',         points: 125, emoji: '🍳', fixed: true, desc: 'Cook - fixed 125' },
  { key: 'servant',     nameEn: 'Servant',      points: 50,  emoji: '🧹', fixed: true, desc: 'Servant - fixed 50' },
  { key: 'wanderer',    nameEn: 'Wanderer',     points: 25,  emoji: '🎒', fixed: true, desc: 'Wanderer - fixed 25' },
];

const THIEF_ROLE = { key: 'thief', nameEn: 'Thief', points: 0, emoji: '🥷', thief: true, desc: 'Thief - 0 if caught, steals guesser points if hidden' };

const POLICE_GUESSER_4P = { key: 'police', nameEn: 'Police', points: 500, emoji: '🚓', guesser: true, desc: 'Police - must find the Thief (4-player classic)' };

// Fair rotation: royal roles may repeat (max 3x per player per game),
// every other role at most once per player per game.
const ROYAL_KEYS = new Set(['raja', 'rani', 'minister']);
const ROYAL_CAP = 3;
const OTHER_CAP = 1;
const MAX_PLAYERS = 24;

function getRolesForCount(n) {
  n = Math.max(4, Math.min(MAX_PLAYERS, n));
  if (n === 4) {
    return [
      CLASSIC_ORDER[0], // Raja 1000
      CLASSIC_ORDER[1], // Rani 800
      POLICE_GUESSER_4P, // Police 500 guesser
      THIEF_ROLE, // Thief 0
    ];
  }
  if (n <= 10) {
    // classic ladder: first (n-1) classics + Thief (unchanged behavior)
    return [...CLASSIC_ORDER.slice(0, n - 1), THIEF_ROLE];
  }
  // 11-24: all 9 classics + extended roles in points order + Thief
  return [...CLASSIC_ORDER, ...EXTENDED_ROLES.slice(0, n - 10), THIEF_ROLE];
}

function roleByKey(roles, key) {
  return roles.find(r => r.key === key);
}

// ---------- Fair rotation ----------
// Each game tracks how often every player (by name) has held each role.
// Non-royal roles: max once per player per game. Royals (raja/rani/minister):
// max 3 times. Assignment retries random deals and keeps the one with the
// fewest repeat violations (pure random fallback when a perfect deal is
// impossible, e.g. more rounds than distinct roles).
function histKey(p) { return (p.name || '').toLowerCase(); }
function roleCap(key) { return ROYAL_KEYS.has(key) ? ROYAL_CAP : OTHER_CAP; }

function dealRolesFair(room, roles) {
  const hist = room.fair || {};
  let best = null, bestViol = Infinity;
  for (let attempt = 0; attempt < 60; attempt++) {
    const remaining = shuffle(roles.slice());
    const order = shuffle(room.players.slice());
    const assign = {};
    let viol = 0;
    for (const p of order) {
      const seen = hist[histKey(p)] || {};
      let pool = remaining.filter(r => (seen[r.key] || 0) < roleCap(r.key));
      if (pool.length === 0) { pool = remaining.slice(); viol++; }
      const chosen = pool[Math.floor(Math.random() * pool.length)];
      assign[p.id] = chosen.key;
      remaining.splice(remaining.indexOf(chosen), 1);
    }
    if (viol === 0) { best = assign; bestViol = 0; break; }
    if (viol < bestViol) { best = assign; bestViol = viol; }
  }
  for (const p of room.players) {
    const k = histKey(p);
    hist[k] = hist[k] || {};
    hist[k][best[p.id]] = (hist[k][best[p.id]] || 0) + 1;
  }
  room.fair = hist;
  return best;
}

function fairnessFor(room, player, roleKey) {
  const seen = (room.fair[histKey(player)] || {});
  const timesHad = seen[roleKey] || 0;
  const unseenLeft = room.roles.filter(r => !(seen[r.key] > 0)).length;
  return { timesHad, isNewRole: timesHad <= 1, unseenLeft };
}

// ---------- Rooms (in-memory) ----------
const rooms = new Map(); // code -> room

function genCode() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  if (rooms.has(code)) return genCode();
  return code;
}

function publicPlayers(room) {
  return room.players.map(p => ({
    id: p.id, name: p.name, score: p.score,
    connected: p.connected, isHost: p.id === room.hostId
  }));
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function startRound(room) {
  const n = room.players.length;
  const roles = getRolesForCount(n);
  room.roles = roles;
  const assignments = dealRolesFair(room, roles);

  const guesserKey = roles.find(r => r.guesser).key;
  const rajaId = room.players.find(p => assignments[p.id] === 'raja').id;
  const guesserId = room.players.find(p => assignments[p.id] === guesserKey).id;

  room.round = {
    number: room.currentRound + 1,
    assignments,
    rajaId,
    guesserId,
    guesserKey,
    rajaCalled: false,
    guessedId: null,
    correct: null,
    roundPoints: {},
    guessDeadline: null,
  };
  room.status = 'playing';

  // send secret role to each player
  room.players.forEach(p => {
    const sock = io.sockets.sockets.get(p.socketId);
    if (!sock) return;
    const myRole = roleByKey(roles, assignments[p.id]);
    sock.emit('roundStarted', {
      roomCode: room.code,
      round: room.round.number,
      totalRounds: room.totalRounds,
      yourRole: myRole,
      yourRoleKey: myRole.key,
      fairness: fairnessFor(room, p, myRole.key),
      rajaId,
      rajaName: room.players.find(x => x.id === rajaId).name,
      guesserKey,
      players: publicPlayers(room),
      rolesInPlay: roles,
      message: `Round ${room.round.number}: Raja is ${room.players.find(x => x.id === rajaId).name}!`,
    });
  });

  io.to(room.code).emit('roomUpdate', roomSnapshot(room));
}

function roomSnapshot(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    maxPlayers: room.maxPlayers,
    totalRounds: room.totalRounds,
    currentRound: room.round ? room.round.number : 0,
    status: room.status,
    players: publicPlayers(room),
    rolesInPlay: room.roles || [],
  };
}

function scoreRound(room) {
  const { assignments, guesserId, guesserKey, guessedId } = room.round;
  const roles = room.roles;
  const guesserRole = roleByKey(roles, guesserKey);
  const thiefId = room.players.find(p => assignments[p.id] === 'thief').id;
  const correct = guessedId === thiefId;
  room.round.correct = correct;

  const roundPoints = {};
  room.players.forEach(p => {
    const rk = assignments[p.id];
    const role = roleByKey(roles, rk);
    let pts = role.points;
    if (rk === guesserKey) pts = correct ? guesserRole.points : 0;
    if (rk === 'thief') pts = correct ? 0 : guesserRole.points;
    roundPoints[p.id] = pts;
    p.score += pts;
  });
  room.round.roundPoints = roundPoints;

  const result = {
    round: room.round.number,
    correct,
    guessedId,
    thiefId,
    guesserId,
    rajaId: room.round.rajaId,
    reveal: room.players.map(p => ({
      id: p.id, name: p.name,
      roleKey: assignments[p.id],
      role: roleByKey(roles, assignments[p.id]),
      pointsThisRound: roundPoints[p.id],
      total: p.score,
    })),
    scoreboard: [...room.players].sort((a, b) => b.score - a.score).map(p => ({
      id: p.id, name: p.name, score: p.score, isHost: p.id === room.hostId
    })),
    isLastRound: room.round.number >= room.totalRounds,
  };
  room.status = 'revealing';
  io.to(room.code).emit('roundResult', result);
  io.to(room.code).emit('roomUpdate', roomSnapshot(room));
  return result;
}

// ---------- HTTP ----------
app.get('/', (req, res) => res.json({ ok: true, game: 'raja-rani', rooms: rooms.size }));
app.get('/health', (req, res) => res.json({ ok: true }));
app.get('/api/roles/:n', (req, res) => {
  const n = Math.max(4, Math.min(MAX_PLAYERS, parseInt(req.params.n) || 4));
  res.json({ count: n, roles: getRolesForCount(n) });
});

// ---------- Socket ----------
io.on('connection', (socket) => {
  // CREATE
  socket.on('createRoom', ({ playerName, maxPlayers = 6, totalRounds = 5 }, cb) => {
    try {
      const name = (playerName || '').trim().slice(0, 20);
      if (!name) return cb && cb({ error: 'Please enter your name' });
      maxPlayers = Math.max(4, Math.min(MAX_PLAYERS, parseInt(maxPlayers) || 6));
      totalRounds = Math.max(1, Math.min(MAX_PLAYERS, parseInt(totalRounds) || 5));
      const code = genCode();
      const player = { id: socket.id, name, socketId: socket.id, score: 0, connected: true };
      const room = {
        code, hostId: socket.id, maxPlayers, totalRounds,
        players: [player], status: 'lobby', currentRound: 0, round: null, roles: [],
        guessTimer: null, fair: {},
      };
      rooms.set(code, room);
      socket.join(code);
      socket.data.roomCode = code;
      cb && cb({ ok: true, roomCode: code, snapshot: roomSnapshot(room) });
      io.to(code).emit('roomUpdate', roomSnapshot(room));
    } catch (e) { cb && cb({ error: 'Error creating room' }); }
  });

  // JOIN
  socket.on('joinRoom', ({ roomCode, playerName }, cb) => {
    try {
      roomCode = (roomCode || '').trim().toUpperCase();
      const name = (playerName || '').trim().slice(0, 20);
      if (!roomCode || !rooms.has(roomCode)) return cb && cb({ error: 'Invalid room code' });
      if (!name) return cb && cb({ error: 'Please enter your name' });
      const room = rooms.get(roomCode);
      // rejoin by name?
      let existing = room.players.find(p => p.name.toLowerCase() === name.toLowerCase() && !p.connected);
      if (existing) {
        existing.id = socket.id; existing.socketId = socket.id; existing.connected = true;
      } else {
        if (room.status !== 'lobby') return cb && cb({ error: 'The game has already started' });
        if (room.players.length >= room.maxPlayers) return cb && cb({ error: 'Room is full (max ' + room.maxPlayers + ')' });
        if (room.players.some(p => p.name.toLowerCase() === name.toLowerCase())) return cb && cb({ error: 'This name is already taken' });
        room.players.push({ id: socket.id, name, socketId: socket.id, score: 0, connected: true });
      }
      socket.join(roomCode);
      socket.data.roomCode = roomCode;
      cb && cb({ ok: true, roomCode, snapshot: roomSnapshot(room) });
      io.to(roomCode).emit('roomUpdate', roomSnapshot(room));
      io.to(roomCode).emit('chat', { sys: true, text: `${name} joined 🎉` });
    } catch (e) { cb && cb({ error: 'Error joining room' }); }
  });

  // START (host)
  socket.on('startGame', (_, cb) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room) return cb && cb({ error: 'Room not found' });
    if (socket.id !== room.hostId) return cb && cb({ error: 'Only the host can start the game' });
    if (room.players.length < 4) return cb && cb({ error: 'Need at least 4 players (currently ' + room.players.length + ')' });
    room.players.forEach(p => p.score = 0);
    room.currentRound = 0;
    room.fair = {};
    room.status = 'playing';
    io.to(room.code).emit('gameStarted', { totalRounds: room.totalRounds });
    startRound(room);
    cb && cb({ ok: true });
  });

  // RAJA CALLS GUESSER: "Who is my Minister?"
  socket.on('rajaCall', (_, cb) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || !room.round) return cb && cb({ error: 'No round in progress' });
    if (socket.id !== room.round.rajaId) return cb && cb({ error: 'Only the Raja can call' });
    if (room.round.rajaCalled) return cb && cb({ ok: true });
    room.round.rajaCalled = true;
    const guesser = room.players.find(p => p.id === room.round.guesserId);
    const guesserRole = roleByKey(room.roles, room.round.guesserKey);
    room.round.guessDeadline = Date.now() + 60000;
    io.to(room.code).emit('rajaCalled', {
      guesserId: guesser.id, guesserName: guesser.name,
      guesserRole, rajaName: room.players.find(p => p.id === room.round.rajaId).name,
      deadlineSec: 60,
    });
    // auto-guess timeout (random) if guesser sleeps
    clearTimeout(room.guessTimer);
    room.guessTimer = setTimeout(() => {
      if (!room.round || room.round.guessedId) return;
      const candidates = room.players.filter(p => p.id !== room.round.rajaId && p.id !== room.round.guesserId);
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      room.round.guessedId = pick.id;
      io.to(room.code).emit('chat', { sys: true, text: `⏰ Time over! Auto-guess: ${pick.name}` });
      scoreRound(room);
    }, 62000);
    cb && cb({ ok: true });
  });

  // GUESS
  socket.on('makeGuess', ({ suspectId }, cb) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || !room.round) return cb && cb({ error: 'No round in progress' });
    if (socket.id !== room.round.guesserId) return cb && cb({ error: 'Only the Minister/Police can guess' });
    if (!room.round.rajaCalled) return cb && cb({ error: 'Wait for the Raja to call first' });
    if (room.round.guessedId) return cb && cb({ error: 'Guess already made' });
    if (!room.players.some(p => p.id === suspectId)) return cb && cb({ error: 'Invalid player' });
    if (suspectId === room.round.rajaId || suspectId === room.round.guesserId)
      return cb && cb({ error: 'You cannot guess the Raja or yourself' });
    room.round.guessedId = suspectId;
    clearTimeout(room.guessTimer);
    scoreRound(room);
    cb && cb({ ok: true });
  });

  // NEXT ROUND (host only)
  socket.on('nextRound', (_, cb) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room) return cb && cb({ error: 'Room not found' });
    if (socket.id !== room.hostId) return cb && cb({ error: 'Only the host can start the next round' });
    if (room.status !== 'revealing') return cb && cb({ error: 'Result not ready yet' });
    if (room.round.number >= room.totalRounds) {
      room.status = 'finished';
      const board = [...room.players].sort((a, b) => b.score - a.score);
      io.to(room.code).emit('gameOver', {
        winner: board[0], scoreboard: board.map(p => ({ id: p.id, name: p.name, score: p.score })),
      });
      io.to(room.code).emit('roomUpdate', roomSnapshot(room));
      return cb && cb({ ok: true, finished: true });
    }
    room.currentRound = room.round.number;
    startRound(room);
    cb && cb({ ok: true });
  });

  // RESTART (host)
  socket.on('restartGame', (_, cb) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room) return cb && cb({ error: 'Room not found' });
    if (socket.id !== room.hostId) return cb && cb({ error: 'Only the host can do this' });
    room.players.forEach(p => p.score = 0);
    room.currentRound = 0; room.round = null; room.status = 'lobby'; room.fair = {};
    io.to(room.code).emit('backToLobby', roomSnapshot(room));
    io.to(room.code).emit('roomUpdate', roomSnapshot(room));
    cb && cb({ ok: true });
  });

  // CHAT (small)
  socket.on('chat', ({ text }) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room) return;
    const me = room.players.find(p => p.socketId === socket.id);
    text = (text || '').slice(0, 120);
    if (!text || !me) return;
    io.to(room.code).emit('chat', { name: me.name, text });
  });

  socket.on('leaveRoom', () => {
    const code = socket.data.roomCode;
    if (!code || !rooms.has(code)) return;
    const room = rooms.get(code);
    room.players = room.players.filter(p => p.socketId !== socket.id);
    socket.leave(code);
    if (room.players.length === 0) { clearTimeout(room.guessTimer); rooms.delete(code); return; }
    if (room.hostId === socket.id) room.hostId = room.players[0].id;
    io.to(code).emit('roomUpdate', roomSnapshot(room));
    socket.data.roomCode = null;
  });

  socket.on('disconnect', () => {
    const code = socket.data.roomCode;
    if (!code || !rooms.has(code)) return;
    const room = rooms.get(code);
    const p = room.players.find(x => x.socketId === socket.id);
    if (p) p.connected = false;
    // remove if lobby
    if (room.status === 'lobby') {
      room.players = room.players.filter(x => x.socketId !== socket.id);
      if (room.hostId === socket.id && room.players.length) room.hostId = room.players[0].id;
    }
    if (room.players.length === 0) { clearTimeout(room.guessTimer); rooms.delete(code); return; }
    io.to(code).emit('roomUpdate', roomSnapshot(room));
  });
});

server.listen(PORT, () => console.log(`Raja-Rani server on :${PORT}`));
