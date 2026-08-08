// Quan ly phong choi trong bo nho (theo phien). Refresh trinh duyet van vao lai
// duoc phong cu nho token luu o localStorage cua client gui len lai.

const { customAlphabet } = require('nanoid');
const genRoomId = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6);

const rooms = new Map(); // roomId -> room

const NUM_SEATS = 4;

// Bien the luat choi 1 van (doc lap voi `mode` - mode chi quyet dinh cach tinh thang chung cuoc).
const VARIANTS = ['block', 'draw', 'muggins', 'allthrees', 'bergen', 'matador'];

function createRoom({ mode = 'block', targetScore = 100, matchWins = 3, variant = 'block' }) {
  let id = genRoomId();
  while (rooms.has(id)) id = genRoomId();

  const room = {
    id,
    mode, // 'block' | 'score'
    variant: VARIANTS.includes(variant) ? variant : 'block',
    targetScore,
    matchWins,
    seats: Array.from({ length: NUM_SEATS }, () => null), // { token, name, type: 'human'|'bot', connected }
    game: null, // trang thai van dang choi (server/game.js quan ly cau truc ben trong)
    scores: Array.from({ length: NUM_SEATS }, () => 0),
    roundWins: Array.from({ length: NUM_SEATS }, () => 0),
    createdAt: Date.now(),
    status: 'lobby', // lobby | playing | match-over
    paused: false,
    ready: new Set(), // seat index da bam "San sang" trong luc dang tam dung - reset moi lan pause moi
  };
  rooms.set(id, room);
  return room;
}

function getRoom(roomId) {
  return rooms.get(roomId) || null;
}

function findSeatByToken(room, token) {
  return room.seats.findIndex((s) => s && s.token === token);
}

// Them nguoi choi vao ghe trong dau tien, hoac neu token da co trong phong thi
// coi la ket noi lai (reconnect).
function joinRoom(room, token, name) {
  const existingIdx = findSeatByToken(room, token);
  if (existingIdx !== -1) {
    room.seats[existingIdx].connected = true;
    if (name) room.seats[existingIdx].name = name;
    return existingIdx;
  }
  const emptyIdx = room.seats.findIndex((s) => s === null);
  if (emptyIdx === -1) return -1; // phong day
  room.seats[emptyIdx] = { token, name: name || `Người chơi ${emptyIdx + 1}`, type: 'human', connected: true };
  return emptyIdx;
}

// Tra ve true neu thuc su co 1 nguoi (human) vua chuyen sang mat ket noi - de index.js
// quyet dinh co can tu dong tam dung phong hay khong.
function markDisconnected(room, token) {
  const idx = findSeatByToken(room, token);
  if (idx !== -1 && room.seats[idx].type === 'human' && room.seats[idx].connected) {
    room.seats[idx].connected = false;
    return true;
  }
  return false;
}

function fillBotSeats(room) {
  room.seats.forEach((seat, idx) => {
    if (seat === null) {
      room.seats[idx] = { token: `bot-${idx}-${Date.now()}`, name: `Bot ${idx + 1}`, type: 'bot', connected: true };
    }
  });
}

function isRoomReadyToStart(room) {
  return room.seats.some((s) => s !== null); // can it nhat 1 nguoi that
}

function removeRoom(roomId) {
  rooms.delete(roomId);
}

module.exports = {
  NUM_SEATS,
  VARIANTS,
  createRoom,
  getRoom,
  joinRoom,
  markDisconnected,
  fillBotSeats,
  isRoomReadyToStart,
  findSeatByToken,
  removeRoom,
};
