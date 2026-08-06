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

// Tạo phòng mới, trả về roomId để client điều hướng tới link mới.
app.post('/api/rooms', (req, res) => {
  const { mode, targetScore, matchWins, variant } = req.body || {};
  const room = rooms.createRoom({
    mode: mode === 'score' ? 'score' : 'block',
    targetScore: Number(targetScore) > 0 ? Number(targetScore) : 100,
    matchWins: Number(matchWins) > 0 ? Number(matchWins) : 3,
    variant: rooms.VARIANTS.includes(variant) ? variant : 'block',
  });
  res.json({ roomId: room.id });
});

// Link mời vào phòng - trả về SPA, client tự đọc roomId từ URL.
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
const TURN_TIME_MS = 20000;

function clearTurnTimer(room) {
  if (room.turnTimer) {
    clearTimeout(room.turnTimer);
    room.turnTimer = null;
  }
}

// Goi sau moi thay doi luot: xu ly vong lap bot, dem nguoc luot nguoi,
// va tu dong chuyen sang van moi khi 1 van ket thuc.
function afterTurnChange(roomId) {
  const room = rooms.getRoom(roomId);
  if (!room || !room.game || room.paused) return;
  clearTurnTimer(room);

  if (room.game.status === 'round-over') {
    room.turnDeadline = null;
    broadcastRoom(roomId);
    if (room.status === 'match-over') return; // cho nguoi choi bam "Choi lai"
    setTimeout(() => {
      const r2 = rooms.getRoom(roomId);
      if (!r2 || r2.status === 'match-over' || r2.paused) return;
      game.startRound(r2);
      broadcastRoom(roomId);
      afterTurnChange(roomId);
    }, NEXT_ROUND_DELAY_MS);
    return;
  }

  if (game.isBotTurn(room)) {
    room.turnDeadline = null;
    broadcastRoom(roomId);
    setTimeout(() => {
      const r2 = rooms.getRoom(roomId);
      if (r2 && r2.paused) return;
      if (!r2 || !r2.game || r2.game.status !== 'playing') {
        afterTurnChange(roomId);
        return;
      }
      game.botAutoMove(r2);
      broadcastRoom(roomId);
      afterTurnChange(roomId);
    }, BOT_MOVE_DELAY_MS);
    return;
  }

  // Den luot nguoi that - bat dong ho dem nguoc, het gio thi may tu danh thay.
  room.turnDeadline = Date.now() + TURN_TIME_MS;
  broadcastRoom(roomId);
  room.turnTimer = setTimeout(() => {
    const r2 = rooms.getRoom(roomId);
    if (!r2 || !r2.game || r2.game.status !== 'playing' || r2.paused) return;
    game.botAutoMove(r2); // het gio - may tu danh thay nguoi choi
    broadcastRoom(roomId);
    afterTurnChange(roomId);
  }, TURN_TIME_MS);
}

io.on('connection', (socket) => {
  socket.on('join', ({ roomId, token, name }) => {
    const room = rooms.getRoom(roomId);
    if (!room) {
      socket.emit('errorMsg', 'Không tìm thấy phòng.');
      return;
    }
    const seatIdx = rooms.joinRoom(room, token, name);
    if (seatIdx === -1) {
      socket.emit('errorMsg', 'Phòng đã đủ 4 người.');
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
    afterTurnChange(roomId);
  });

  socket.on('play', (move) => {
    const { roomId, token } = socket.data;
    const room = rooms.getRoom(roomId);
    if (!room) return;
    if (room.paused) { socket.emit('errorMsg', 'Ván đang tạm dừng'); return; }
    const seat = rooms.findSeatByToken(room, token);
    if (seat === -1) return;

    const result = game.playTile(room, seat, move);
    if (!result.ok) {
      socket.emit('errorMsg', result.error);
      return; // khong dung gio - de dong ho dem nguoc hien tai tiep tuc chay
    }
    broadcastRoom(roomId);
    afterTurnChange(roomId);
  });

  socket.on('pass', () => {
    const { roomId, token } = socket.data;
    const room = rooms.getRoom(roomId);
    if (!room) return;
    if (room.paused) { socket.emit('errorMsg', 'Ván đang tạm dừng'); return; }
    const seat = rooms.findSeatByToken(room, token);
    if (seat === -1) return;

    const result = game.passTurn(room, seat);
    if (!result.ok) {
      socket.emit('errorMsg', result.error);
      return;
    }
    broadcastRoom(roomId);
    afterTurnChange(roomId);
  });

  socket.on('draw', () => {
    const { roomId, token } = socket.data;
    const room = rooms.getRoom(roomId);
    if (!room) return;
    if (room.paused) { socket.emit('errorMsg', 'Ván đang tạm dừng'); return; }
    const seat = rooms.findSeatByToken(room, token);
    if (seat === -1) return;

    const result = game.drawFromStock(room, seat);
    if (!result.ok) {
      socket.emit('errorMsg', result.error);
      return;
    }
    broadcastRoom(roomId);
    afterTurnChange(roomId);
  });

  // Tam dung: bat ky nguoi choi nao trong phong cung bam duoc, dung dong ho + dung bot tu danh.
  socket.on('pause', () => {
    const { roomId, token } = socket.data;
    const room = rooms.getRoom(roomId);
    if (!room || !room.game || room.game.status !== 'playing' || room.paused) return;
    if (rooms.findSeatByToken(room, token) === -1) return;

    room.paused = true;
    clearTurnTimer(room);
    room.turnDeadline = null;
    broadcastRoom(roomId);
  });

  socket.on('resume', () => {
    const { roomId, token } = socket.data;
    const room = rooms.getRoom(roomId);
    if (!room || !room.paused) return;
    if (rooms.findSeatByToken(room, token) === -1) return;

    room.paused = false;
    broadcastRoom(roomId);
    afterTurnChange(roomId);
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
    afterTurnChange(roomId);
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
  console.log(`Domino server đang chạy tại http://localhost:${PORT}`);
});
