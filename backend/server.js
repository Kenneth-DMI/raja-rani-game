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

// ---------- Classic roles ladder (traditional + extended for 4-10) ----------
// 10-player full court (points descending, like school score sheet):
// Raja 1000 > Rani 800 > Mantri 700 > Senapati 600 > Sipahi 500 >
// Kotwal 400 > Praja 300 > Villager 200 > Sahayak 100 > Chor 0
const FULL_COURT = [
  { key: 'raja',     nameEn: 'Raja',     nameHi: 'राजा',     points: 1000, emoji: '👑', fixed: true,  desc: 'King - reveals first, always 1000' },
  { key: 'rani',     nameEn: 'Rani',     nameHi: 'रानी',     points: 800,  emoji: '👸', fixed: true,  desc: 'Queen - fixed 800' },
  { key: 'mantri',   nameEn: 'Mantri',   nameHi: 'मंत्री',   points: 700,  emoji: '📜', guesser: true, desc: 'Minister - must find the Chor' },
  { key: 'senapati', nameEn: 'Senapati', nameHi: 'सेनापति', points: 600,  emoji: '🛡️', fixed: true,  desc: 'Commander - fixed 600' },
  { key: 'sipahi',   nameEn: 'Sipahi',   nameHi: 'सिपाही',   points: 500,  emoji: '💂', fixed: true,  desc: 'Soldier / Police - fixed 500' },
  { key: 'kotwal',   nameEn: 'Kotwal',   nameHi: 'कोतवाल',   points: 400,  emoji: '🏰', fixed: true,  desc: 'Guard - fixed 400' },
  { key: 'praja',    nameEn: 'Praja',    nameHi: 'प्रजा',    points: 300,  emoji: '🧑‍🌾', fixed: true,  desc: 'Villager - fixed 300' },
  { key: 'villager', nameEn: 'Villager', nameHi: 'ग्रामीण',  points: 200,  emoji: '👳', fixed: true,  desc: 'Villager - fixed 200' },
  { key: 'sahayak',  nameEn: 'Sahayak',  nameHi: 'सहायक',    points: 100,  emoji: '🙏', fixed: true,  desc: 'Helper - fixed 100' },
  { key: 'chor',     nameEn: 'Chor',     nameHi: 'चोर',      points: 0,    emoji: '🥷', chor: true,   desc: 'Thief - 0 if caught, steals guesser points if hidden' },
];

const SIPAHI_GUESSER_4P = { key: 'sipahi', nameEn: 'Sipahi (Police)', nameHi: 'सिपाही', points: 500, emoji: '💂', guesser: true, desc: 'Police - must find the Chor (4-player classic)' };

function getRolesForCount(n) {
  n = Math.max(4, Math.min(10, n));
  if (n === 4) {
    return [
      FULL_COURT[0], // Raja 1000
      FULL_COURT[1], // Rani 800
      SIPAHI_GUESSER_4P, // Sipahi 500 guesser
      FULL_COURT[9], // Chor 0
    ];
  }
  // 5-10: first (n-1) from top + Chor
  const top = FULL_COURT.slice(0, n - 1);
  return [...top, FULL_COURT[9]];
}

function roleByKey(roles, key) {
  return roles.find(r => r.key === key);
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
  const keys = shuffle(roles.map(r => r.key));
  const assignments = {};
  room.players.forEach((p, i) => { assignments[p.id] = keys[i]; });

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
      rajaId,
      rajaName: room.players.find(x => x.id === rajaId).name,
      guesserKey,
      players: publicPlayers(room),
      rolesInPlay: roles,
      message: `Round ${room.round.number}: Raja ${room.players.find(x => x.id === rajaId).name} mil gaye!`,
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
  const chorId = room.players.find(p => assignments[p.id] === 'chor').id;
  const correct = guessedId === chorId;
  room.round.correct = correct;

  const roundPoints = {};
  room.players.forEach(p => {
    const rk = assignments[p.id];
    const role = roleByKey(roles, rk);
    let pts = role.points;
    if (rk === guesserKey) pts = correct ? guesserRole.points : 0;
    if (rk === 'chor') pts = correct ? 0 : guesserRole.points;
    roundPoints[p.id] = pts;
    p.score += pts;
  });
  room.round.roundPoints = roundPoints;

  const result = {
    round: room.round.number,
    correct,
    guessedId,
    chorId,
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
  const n = Math.max(4, Math.min(10, parseInt(req.params.n) || 4));
  res.json({ count: n, roles: getRolesForCount(n) });
});

// ---------- Socket ----------
io.on('connection', (socket) => {
  // CREATE
  socket.on('createRoom', ({ playerName, maxPlayers = 6, totalRounds = 5 }, cb) => {
    try {
      name = (playerName || '').trim().slice(0, 20);
      if (!name) return cb && cb({ error: 'Naam likho (enter your name)' });
      maxPlayers = Math.max(4, Math.min(10, parseInt(maxPlayers) || 6));
      totalRounds = Math.max(1, Math.min(10, parseInt(totalRounds) || 5));
      const code = genCode();
      const player = { id: socket.id, name, socketId: socket.id, score: 0, connected: true };
      const room = {
        code, hostId: socket.id, maxPlayers, totalRounds,
        players: [player], status: 'lobby', currentRound: 0, round: null, roles: [],
        guessTimer: null,
      };
      rooms.set(code, room);
      socket.join(code);
      socket.data.roomCode = code;
      cb && cb({ ok: true, roomCode: code, snapshot: roomSnapshot(room) });
      io.to(code).emit('roomUpdate', roomSnapshot(room));
    } catch (e) { cb && cb({ error: 'Room banane me error' }); }
  });

  // JOIN
  socket.on('joinRoom', ({ roomCode, playerName }, cb) => {
    try {
      roomCode = (roomCode || '').trim().toUpperCase();
      const name = (playerName || '').trim().slice(0, 20);
      if (!roomCode || !rooms.has(roomCode)) return cb && cb({ error: 'Room code galat hai' });
      if (!name) return cb && cb({ error: 'Naam likho' });
      const room = rooms.get(roomCode);
      // rejoin by name?
      let existing = room.players.find(p => p.name.toLowerCase() === name.toLowerCase() && !p.connected);
      if (existing) {
        existing.id = socket.id; existing.socketId = socket.id; existing.connected = true;
        if (room.hostId && !room.players.find(p => p.id === room.hostId && p.connected)) {
          // keep host if disconnected? transfer if host gone
        }
      } else {
        if (room.status !== 'lobby') return cb && cb({ error: 'Game already shuru ho gaya' });
        if (room.players.length >= room.maxPlayers) return cb && cb({ error: 'Room full hai (max ' + room.maxPlayers + ')' });
        if (room.players.some(p => p.name.toLowerCase() === name.toLowerCase())) return cb && cb({ error: 'Ye naam already liya gaya' });
        room.players.push({ id: socket.id, name, socketId: socket.id, score: 0, connected: true });
      }
      socket.join(roomCode);
      socket.data.roomCode = roomCode;
      cb && cb({ ok: true, roomCode, snapshot: roomSnapshot(room) });
      io.to(roomCode).emit('roomUpdate', roomSnapshot(room));
      io.to(roomCode).emit('chat', { sys: true, text: `${name} jud gaya 🎉` });
    } catch (e) { cb && cb({ error: 'Join me error' }); }
  });

  // START (host)
  socket.on('startGame', (_, cb) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room) return cb && cb({ error: 'Room nahi mila' });
    if (socket.id !== room.hostId) return cb && cb({ error: 'Sirf host start kar sakta hai' });
    if (room.players.length < 4) return cb && cb({ error: 'Kam se kam 4 players chahiye (abhi ' + room.players.length + ')' });
    room.players.forEach(p => p.score = 0);
    room.currentRound = 0;
    room.status = 'playing';
    io.to(room.code).emit('gameStarted', { totalRounds: room.totalRounds });
    startRound(room);
    cb && cb({ ok: true });
  });

  // RAJA CALLS GUESSER: "Mera Mantri Kaun?"
  socket.on('rajaCall', (_, cb) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || !room.round) return cb && cb({ error: 'Round nahi chal raha' });
    if (socket.id !== room.round.rajaId) return cb && cb({ error: 'Sirf Raja bula sakta hai' });
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
    if (!room || !room.round) return cb && cb({ error: 'Round nahi chal raha' });
    if (socket.id !== room.round.guesserId) return cb && cb({ error: 'Sirf Mantri/Sipahi guess karega' });
    if (!room.round.rajaCalled) return cb && cb({ error: 'Pehle Raja ko pukarne do' });
    if (room.round.guessedId) return cb && cb({ error: 'Guess ho chuka' });
    if (!room.players.some(p => p.id === suspectId)) return cb && cb({ error: 'Galat player' });
    if (suspectId === room.round.rajaId || suspectId === room.round.guesserId)
      return cb && cb({ error: 'Raja ya khud ko guess nahi kar sakte' });
    room.round.guessedId = suspectId;
    clearTimeout(room.guessTimer);
    scoreRound(room);
    cb && cb({ ok: true });
  });

  // NEXT ROUND (host, or anyone after reveal? keep host)
  socket.on('nextRound', (_, cb) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room) return cb && cb({ error: 'Room nahi mila' });
    if (socket.id !== room.hostId) return cb && cb({ error: 'Sirf host next round karega' });
    if (room.status !== 'revealing') return cb && cb({ error: 'Abhi result nahi aaya' });
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
    if (!room) return cb && cb({ error: 'Room nahi mila' });
    if (socket.id !== room.hostId) return cb && cb({ error: 'Sirf host' });
    room.players.forEach(p => p.score = 0);
    room.currentRound = 0; room.round = null; room.status = 'lobby';
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
    // if game in progress with <4, end? just update
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
