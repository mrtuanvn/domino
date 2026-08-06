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
  const tilesPerPlayer = room.variant === 'draw' ? 5 : 7;
  const { hands, stock } = engine.dealHands(NUM_SEATS, tilesPerPlayer);
  const { seat: startSeat, tile: startTile } = engine.findStartingSeat(hands);

  const game = {
    hands,
    stock,
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

// Cong diem thuong ngay (Muggins/All Threes/Bergen) neu du dieu kien sau nuoc di vua roi.
// Tra ve so diem thuong (0 neu khong co).
function applyVariantBonus(room, seat) {
  const game = room.game;
  let bonus = 0;
  if (room.variant === 'muggins') {
    const total = engine.computeEndsScore(game.board);
    if (total > 0 && total % engine.MUGGINS_DIVISOR === 0) bonus = total;
  } else if (room.variant === 'allthrees') {
    const total = engine.computeEndsScore(game.board);
    if (total > 0 && total % engine.ALLTHREES_DIVISOR === 0) bonus = total;
  } else if (room.variant === 'bergen' && game.ends && game.ends.left === game.ends.right) {
    bonus = engine.BERGEN_POINTS.doubleEnds;
  }
  if (bonus > 0) {
    room.scores[seat] += bonus;
    if (room.mode === 'score' && room.scores.some((s) => s >= room.targetScore)) {
      room.status = 'match-over';
    }
  }
  return bonus;
}

function applyPlayInternal(room, seat, move) {
  const game = room.game;
  game.board = engine.applyMove(game.board, game.ends, { ...move, seat }, room.variant);
  game.ends = engine.getOpenEnds(game.board);
  game.hands[seat] = engine.removeTileFromHand(game.hands[seat], move.tile);
  game.passStreak = 0;

  const bonus = applyVariantBonus(room, seat);
  game.history.push({ seat, action: 'play', tile: move.tile, bonus: bonus || undefined });

  if (game.hands[seat].length === 0) {
    const opts = room.variant === 'bergen' ? { fixedPoints: engine.BERGEN_POINTS.domino } : {};
    finishRound(room, engine.resolveWinByEmptyHand(seat, game.hands, opts));
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
    const opts = room.variant === 'bergen' ? { fixedPoints: engine.BERGEN_POINTS.blocked } : {};
    finishRound(room, engine.resolveBlockedRound(game.hands, opts));
    return;
  }
  game.turnSeat = nextSeat(seat);
}

// Bien the Draw: khi khong co nuoc di, phai boc tung quan tu noc thay vi bo luot ngay.
// Luot khong chuyen sang nguoi ke tiep - nguoi choi (hoac bot) thu lai sau khi boc.
function drawFromStock(room, seat) {
  const game = room.game;
  if (!game || game.status !== 'playing') return { ok: false, error: 'Ván chơi chưa sẵn sàng' };
  if (room.variant !== 'draw') return { ok: false, error: 'Phòng này không dùng luật bốc quân' };
  if (game.turnSeat !== seat) return { ok: false, error: 'Chưa đến lượt bạn' };

  const hand = game.hands[seat];
  const validMoves = engine.getValidMoves(hand, game.ends, room.variant);
  if (validMoves.length > 0) return { ok: false, error: 'Bạn vẫn còn nước đi, phải đánh trước' };
  if (game.stock.length === 0) return { ok: false, error: 'Nọc đã hết' };

  const [drawn, ...rest] = game.stock;
  game.stock = rest;
  game.hands[seat] = [...hand, drawn];
  game.history.push({ seat, action: 'draw' });
  return { ok: true };
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
  if (!game || game.status !== 'playing') return { ok: false, error: 'Ván chơi chưa sẵn sàng' };
  if (game.turnSeat !== seat) return { ok: false, error: 'Chưa đến lượt bạn' };

  const hand = game.hands[seat];
  const validMoves = engine.getValidMoves(hand, game.ends, room.variant);
  const chosen = validMoves.find((m) => m.handIndex === move.handIndex && m.side === move.side);
  if (!chosen) return { ok: false, error: 'Nước đi không hợp lệ' };

  applyPlayInternal(room, seat, chosen);
  return { ok: true };
}

function passTurn(room, seat) {
  const game = room.game;
  if (!game || game.status !== 'playing') return { ok: false, error: 'Ván chơi chưa sẵn sàng' };
  if (game.turnSeat !== seat) return { ok: false, error: 'Chưa đến lượt bạn' };

  const hand = game.hands[seat];
  const validMoves = engine.getValidMoves(hand, game.ends, room.variant);
  if (validMoves.length > 0) return { ok: false, error: 'Bạn vẫn còn nước đi, không thể bỏ lượt' };
  if (room.variant === 'draw' && game.stock.length > 0) {
    return { ok: false, error: 'Còn quân trong nọc, phải bốc quân trước khi bỏ lượt' };
  }

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
// Bien the Draw: neu bot khong co nuoc di va con noc, no boc 1 quan roi tra lai luot cho no
// (khong chuyen seat) - vong lap bot o index.js se tu goi lai botAutoMove cho cung ghe do.
function botAutoMove(room) {
  const game = room.game;
  const seat = game.turnSeat;
  const hand = game.hands[seat];
  const move = bot.chooseBotMove(hand, game.ends, game.memory, seat, NUM_SEATS, room.variant);

  if (!move) {
    if (room.variant === 'draw' && game.stock.length > 0) {
      const [drawn, ...rest] = game.stock;
      game.stock = rest;
      game.hands[seat] = [...hand, drawn];
      game.history.push({ seat, action: 'draw' });
      return { seat, action: 'draw' };
    }
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
    yourValidMoves = engine.getValidMoves(game.hands[viewerSeat], game.ends, room.variant);
  }

  return {
    roomId: room.id,
    mode: room.mode,
    variant: room.variant,
    targetScore: room.targetScore,
    matchWins: room.matchWins,
    status: room.status,
    paused: !!room.paused,
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
    stockCount: game ? game.stock.length : 0,
    board: game ? game.board : [],
    ends: game ? game.ends : null,
    turnSeat: game ? game.turnSeat : null,
    turnDeadline: room.turnDeadline || null,
    lastResult: game ? game.lastResult : null,
    history: game ? game.history.slice(-8) : [],
  };
}

module.exports = {
  startRound,
  playTile,
  passTurn,
  drawFromStock,
  isBotTurn,
  botAutoMove,
  buildPublicState,
};
