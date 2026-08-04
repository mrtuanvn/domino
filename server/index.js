const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const rooms = require('./rooms');
const game = require('./game');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Tao phong moi, tra ve roomId de client dieu huong toi link moi.
app.post('/api/rooms', (req, res) => {
  const { mode, targetScore, matchWins } = req.body || {};
  const room = rooms.createRoom({
    mode: mode === 'score' ? 'score' : 'block',
    targetScore: Number(targetScore) > 0 ? Number(targetScore) : 100,
    matchWins: Number(matchWins) > 0 ? Number(matchWins) : 3,
  });
  res.json({ roomId: room.id });
});

// Link moi vao phong - tra ve SPA, client tu doc roomId tu URL.
app.get('/r/:roomId', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

function broadcastRoom(roomId) {
  const room = rooms.getRoom(roomId);
  if (!room) return;
  const socketsInRoom = io.sockets.adapter.rooms.get(roomId);
  if (!socketsInRoom) return;
  for (const socketId of socketsInRoom) {
    const s = io.sockets.sockets.get(socketId);
    if (!s || !s.data.token) continue;
    s.emit('state', game.buildPublicState(room, s.data.token));
  }
}

const BOT_MOVE_DELAY_MS = 700;
const NEXT_ROUND_DELAY_MS = 3500;

function tickBots(roomId) {
  const room = rooms.getRoom(roomId);
  if (!room || !room.game) return;

  if (room.game.status === 'round-over') {
    broadcastRoom(roomId);
    if (room.status === 'match-over') return; // cho nguoi choi bam "choi lai"
    setTimeout(() => {
      const r2 = rooms.getRoom(roomId);
      if (!r2 || r2.status === 'match-over') return;
      game.startRound(r2);
      broadcastRoom(roomId);
      tickBots(roomId);
    }, NEXT_ROUND_DELAY_MS);
    return;
  }

  if (game.isBotTurn(room)) {
    setTimeout(() => {
      const r2 = rooms.getRoom(roomId);
      if (!r2 || !r2.game || r2.game.status !== 'playing') {
        tickBots(roomId);
        return;
      }
      game.botAutoMove(r2);
      broadcastRoom(roomId);
      tickBots(roomId);
    }, BOT_MOVE_DELAY_MS);
  } else {
    broadcastRoom(roomId);
  }
}

io.on('connection', (socket) => {
  socket.on('join', ({ roomId, token, name }) => {
    const room = rooms.getRoom(roomId);
    if (!room) {
      socket.emit('errorMsg', 'Khong tim thay phong.');
      return;
    }
    const seatIdx = rooms.joinRoom(room, token, name);
    if (seatIdx === -1) {
      socket.emit('errorMsg', 'Phong da du 4 nguoi.');
      return;
    }
    socket.data.token = token;
    socket.data.roomId = roomId;
    socket.join(roomId);
    broadcastRoom(roomId);
  });

  socket.on('start-game', () => {
    const { roomId, token } = socket.data;
    const room = rooms.getRoom(roomId);
    if (!room || room.status === 'playing') return;
    if (rooms.findSeatByToken(room, token) === -1) return;

    rooms.fillBotSeats(room);
    room.scores = room.scores.map(() => 0);
    room.roundWins = room.roundWins.map(() => 0);
    room.status = 'playing';
    game.startRound(room);
    broadcastRoom(roomId);
    tickBots(roomId);
  });

  socket.on('play', (move) => {
    const { roomId, token } = socket.data;
    const room = rooms.getRoom(roomId);
    if (!room) return;
    const seat = rooms.findSeatByToken(room, token);
    if (seat === -1) return;

    const result = game.playTile(room, seat, move);
    if (!result.ok) {
      socket.emit('errorMsg', result.error);
      return;
    }
    broadcastRoom(roomId);
    tickBots(roomId);
  });

  socket.on('pass', () => {
    const { roomId, token } = socket.data;
    const room = rooms.getRoom(roomId);
    if (!room) return;
    const seat = rooms.findSeatByToken(room, token);
    if (seat === -1) return;

    const result = game.passTurn(room, seat);
    if (!result.ok) {
      socket.emit('errorMsg', result.error);
      return;
    }
    broadcastRoom(roomId);
    tickBots(roomId);
  });

  socket.on('rematch', () => {
    const { roomId, token } = socket.data;
    const room = rooms.getRoom(roomId);
    if (!room || room.status !== 'match-over') return;
    if (rooms.findSeatByToken(room, token) === -1) return;

    room.scores = room.scores.map(() => 0);
    room.roundWins = room.roundWins.map(() => 0);
    room.status = 'playing';
    game.startRound(room);
    broadcastRoom(roomId);
    tickBots(roomId);
  });

  socket.on('disconnect', () => {
    const { roomId, token } = socket.data;
    if (!roomId || !token) return;
    const room = rooms.getRoom(roomId);
    if (!room) return;
    rooms.markDisconnected(room, token);
    broadcastRoom(roomId);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Domino server dang chay tai http://localhost:${PORT}`);
});
