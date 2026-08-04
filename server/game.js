// Dieu phoi 1 van choi (round) va 1 tran (match) trong 1 phong.
// game.js chi thao tac du lieu (room.game / room.scores...), khong dong io.
// index.js se goi cac ham o day roi tu quyet dinh khi nao emit / delay.

const engine = require('./gameEngine');
const bot = require('./bot');
const { NUM_SEATS } = require('./rooms');

function nextSeat(seat) {
  return (seat + 1) % NUM_SEATS;
}

function startRound(room) {
  const hands = engine.dealHands(NUM_SEATS, 7);
  const { seat: startSeat, tile: startTile } = engine.findStartingSeat(hands);

  const game = {
    hands,
    board: [],
    ends: null,
    turnSeat: startSeat,
    passStreak: 0,
    memory: bot.createMemory(NUM_SEATS),
    history: [],
    status: 'playing',
    lastResult: null,
  };
  room.game = game;
  room.status = 'playing';

  // Nguoi cam doi cao nhat bat buoc phai danh doi do dau tien - tu dong thuc hien.
  const forcedMove = { handIndex: hands[startSeat].findIndex((t) => t[0] === startTile[0] && t[1] === startTile[1]), tile: startTile, side: 'left' };
  applyPlayInternal(room, startSeat, forcedMove);
  return game;
}

function applyPlayInternal(room, seat, move) {
  const game = room.game;
  game.board = engine.applyMove(game.board, game.ends, { ...move, seat });
  game.ends = engine.getOpenEnds(game.board);
  game.hands[seat] = engine.removeTileFromHand(game.hands[seat], move.tile);
  game.history.push({ seat, action: 'play', tile: move.tile });
  game.passStreak = 0;

  if (game.hands[seat].length === 0) {
    finishRound(room, engine.resolveWinByEmptyHand(seat, game.hands));
    return;
  }
  game.turnSeat = nextSeat(seat);
}

function applyPassInternal(room, seat) {
  const game = room.game;
  bot.recordPass(game.memory, seat, game.ends);
  game.history.push({ seat, action: 'pass' });
  game.passStreak += 1;

  if (game.passStreak >= NUM_SEATS) {
    finishRound(room, engine.resolveBlockedRound(game.hands));
    return;
  }
  game.turnSeat = nextSeat(seat);
}

function finishRound(room, result) {
  const game = room.game;
  game.status = 'round-over';
  game.lastResult = result;

  if (room.mode === 'score') {
    result.winnerSeats.forEach((s) => {
      room.scores[s] += result.points;
    });
    if (room.scores.some((s) => s >= room.targetScore)) {
      room.status = 'match-over';
    }
  } else {
    // mode 'block': moi van thang tinh 1 tran, ai thang du so tran truoc thi thang chung cuoc
    result.winnerSeats.forEach((s) => {
      room.roundWins[s] += 1;
    });
    if (room.roundWins.some((w) => w >= room.matchWins)) {
      room.status = 'match-over';
    }
  }
}

// Nguoi choi (human) yeu cau danh 1 quan. move: { handIndex, side }
function playTile(room, seat, move) {
  const game = room.game;
  if (!game || game.status !== 'playing') return { ok: false, error: 'Van choi chua san sang' };
  if (game.turnSeat !== seat) return { ok: false, error: 'Chua den luot ban' };

  const hand = game.hands[seat];
  const validMoves = engine.getValidMoves(hand, game.ends);
  const chosen = validMoves.find((m) => m.handIndex === move.handIndex && m.side === move.side);
  if (!chosen) return { ok: false, error: 'Nuoc di khong hop le' };

  applyPlayInternal(room, seat, chosen);
  return { ok: true };
}

function passTurn(room, seat) {
  const game = room.game;
  if (!game || game.status !== 'playing') return { ok: false, error: 'Van choi chua san sang' };
  if (game.turnSeat !== seat) return { ok: false, error: 'Chua den luot ban' };

  const hand = game.hands[seat];
  const validMoves = engine.getValidMoves(hand, game.ends);
  if (validMoves.length > 0) return { ok: false, error: 'Ban van con nuoc di, khong the bo luot' };

  applyPassInternal(room, seat);
  return { ok: true };
}

function isBotTurn(room) {
  const game = room.game;
  if (!game || game.status !== 'playing') return false;
  const seat = room.seats[game.turnSeat];
  return seat && seat.type === 'bot';
}

// Thuc hien 1 nuoc cua bot dang toi luot. Goi tu index.js theo nhip (setTimeout).
function botAutoMove(room) {
  const game = room.game;
  const seat = game.turnSeat;
  const hand = game.hands[seat];
  const move = bot.chooseBotMove(hand, game.ends, game.memory, seat, NUM_SEATS);

  if (!move) {
    applyPassInternal(room, seat);
    return { seat, action: 'pass' };
  }
  applyPlayInternal(room, seat, move);
  return { seat, action: 'play', tile: move.tile };
}

// Goc nhin cong khai gui cho 1 nguoi choi cu the: an bai nguoi khac, chi cho biet so luong.
function buildPublicState(room, viewerToken) {
  const viewerSeat = room.seats.findIndex((s) => s && s.token === viewerToken);
  const game = room.game;

  let yourValidMoves = [];
  if (game && viewerSeat !== -1 && game.turnSeat === viewerSeat && game.status === 'playing') {
    yourValidMoves = engine.getValidMoves(game.hands[viewerSeat], game.ends);
  }

  return {
    roomId: room.id,
    mode: room.mode,
    targetScore: room.targetScore,
    matchWins: room.matchWins,
    status: room.status,
    roundPlaying: !!(game && game.status === 'playing'),
    scores: room.scores,
    roundWins: room.roundWins,
    seats: room.seats.map((s, idx) => ({
      idx,
      name: s ? s.name : null,
      type: s ? s.type : null,
      connected: s ? !!s.connected : false,
      handCount: game ? game.hands[idx].length : 0,
      isYou: idx === viewerSeat,
    })),
    yourSeat: viewerSeat,
    yourHand: game && viewerSeat !== -1 ? game.hands[viewerSeat] : [],
    yourValidMoves,
    board: game ? game.board : [],
    ends: game ? game.ends : null,
    turnSeat: game ? game.turnSeat : null,
    lastResult: game ? game.lastResult : null,
    history: game ? game.history.slice(-8) : [],
  };
}

module.exports = {
  startRound,
  playTile,
  passTurn,
  isBotTurn,
  botAutoMove,
  buildPublicState,
};
