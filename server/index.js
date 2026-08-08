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
const TURN_TIME_MS = 20000;

function clearTurnTimer(room) {
  if (room.turnTimer) {
    clearTimeout(room.turnTimer);
    room.turnTimer = null;
  }
}

// Tat ca nguoi that DANG KET NOI da bam "San sang" chua? Dieu kien de tiep tuc sau khi tam
// dung: ghe trong/bot luon coi la san sang; nguoi that DANG KET NOI phai chinh tay bam "San
// sang" (ke ca nguoi vua reconnect - reconnect khong tu dong resume, phai bam lai). Nguoi
// that DANG MAT KET NOI khong the bam "San sang" (dang offline) nen khong tinh vao dieu kien
// cho nay - nguoc lai neu tinh se bi "block" vi khong bao gio nguoi do san sang duoc, lam ca
// phong ket vinh vien. Khi nguoi do connect lai (joinRoom set connected=true) thi lai phai
// bam "San sang" nhu moi nguoi dang ket noi khac.
function allConnectedHumansReady(room) {
  return room.seats.every((s, idx) => {
    if (!s || s.type === 'bot') return true;
    if (!s.connected) return true; // offline khong the bam - khong khoa resume
    return room.ready.has(idx); // connected human phai bam "San sang"
  });
}

// Goi sau moi thay doi luot: xu ly vong lap bot va dem nguoc luot nguoi. Khi 1 van ket thuc
// (round-over), DUNG LAI cho nguoi choi bam "Tiep tuc" (event 'continue') moi sang van moi -
// khong con tu dong chuyen sau 1 khoang delay nhu truoc.
function afterTurnChange(roomId) {
  const room = rooms.getRoom(roomId);
  if (!room || !room.game || room.paused) return;
  clearTurnTimer(room);

  if (room.game.status === 'round-over') {
    room.turnDeadline = null;
    broadcastRoom(roomId);
    return; // cho nguoi choi bam "Tiep tuc" (hoac "Choi lai" neu match-over)
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
  // Reset danh sach "san sang" - moi lan tam dung la 1 phien moi, ai cung phai bam lai du
  // khong phai nguyen nhan gay tam dung.
  socket.on('pause', () => {
    const { roomId, token } = socket.data;
    const room = rooms.getRoom(roomId);
    if (!room || !room.game || room.game.status !== 'playing' || room.paused) return;
    if (rooms.findSeatByToken(room, token) === -1) return;

    room.paused = true;
    room.ready = new Set();
    clearTurnTimer(room);
    room.turnDeadline = null;
    broadcastRoom(roomId);
  });

  // San sang: danh dau rieng ghe cua nguoi gui. Chi tu dong tiep tuc khi TAT CA nguoi that
  // dang ket noi deu da san sang (bot va nguoi dang mat ket noi khong tinh vao dieu kien nay
  // theo 2 huong nguoc nhau - xem allConnectedHumansReady).
  socket.on('ready', () => {
    const { roomId, token } = socket.data;
    const room = rooms.getRoom(roomId);
    if (!room || !room.paused) return;
    const seat = rooms.findSeatByToken(room, token);
    if (seat === -1) return;

    room.ready.add(seat);
    if (allConnectedHumansReady(room)) {
      room.paused = false;
      room.ready = new Set();
      broadcastRoom(roomId);
      afterTurnChange(roomId);
    } else {
      broadcastRoom(roomId);
    }
  });

  // Tiep tuc sang van moi sau khi 1 van ket thuc (round-over) - bat ky ai trong phong cung
  // bam duoc, giong cach "rematch" hoat dong.
  socket.on('continue', () => {
    const { roomId, token } = socket.data;
    const room = rooms.getRoom(roomId);
    if (!room || !room.game || room.game.status !== 'round-over' || room.status === 'match-over' || room.paused) return;
    if (rooms.findSeatByToken(room, token) === -1) return;

    game.startRound(room);
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

  // Mat ket noi (rot mang/dong tab): tu dong tam dung ca phong neu dang choi do dang, giong
  // nhu co nguoi chu dong bam "Tam dung" - tranh 3 nguoi con lai (hoac bot) tiep tuc choi/het
  // gio tu danh thay trong luc 1 nguoi khong con o do.
  socket.on('disconnect', () => {
    const { roomId, token } = socket.data;
    if (!roomId || !token) return;
    const room = rooms.getRoom(roomId);
    if (!room) return;
    const wasConnected = rooms.markDisconnected(room, token);
    if (wasConnected && room.game && room.game.status === 'playing' && !room.paused) {
      room.paused = true;
      room.ready = new Set();
      clearTurnTimer(room);
      room.turnDeadline = null;
    }
    broadcastRoom(roomId);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Domino server đang chạy tại http://localhost:${PORT}`);
});
