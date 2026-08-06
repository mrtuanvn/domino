// Domino engine - bo 28 quan (double-six), kieu Mien Nam, 4 nguoi choi.
// Vi 4 nguoi x 7 quan = 28 = het bo, khong co no (boneyard).

const MAX_PIP = 6;

function generateTiles() {
  const tiles = [];
  for (let a = 0; a <= MAX_PIP; a++) {
    for (let b = a; b <= MAX_PIP; b++) {
      tiles.push([a, b]);
    }
  }
  return tiles; // 28 quan
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Chia bai cho 4 nguoi. tilesPerPlayer < 7 (bien the Draw) se de lai no (stock).
function dealHands(numPlayers = 4, tilesPerPlayer = 7) {
  const deck = shuffle(generateTiles());
  const hands = [];
  for (let p = 0; p < numPlayers; p++) {
    hands.push(deck.slice(p * tilesPerPlayer, (p + 1) * tilesPerPlayer));
  }
  const stock = deck.slice(numPlayers * tilesPerPlayer);
  return { hands, stock };
}

// Quan matador (bien the Matador): 2 mat cong du 7, hoac doi 0-0 theo quy uoc rieng cua bien
// the nay - noi duoc o bat ky dau nao du khong cong du 7 voi dau ho.
const MATADOR_TILES = [[0, 0], [1, 6], [2, 5], [3, 4]];

function isMatadorTile(tile) {
  return MATADOR_TILES.some(([x, y]) => (tile[0] === x && tile[1] === y) || (tile[0] === y && tile[1] === x));
}

// Xac dinh canh nao "cham" vao dau da mo (gia tri endValue) va gia tri dau moi lo ra, theo
// luat noi quan cua bien the dang choi. variant 'matador': noi khi tong = 7; quan matador la
// wildcard nen van noi duoc dù khong cong du 7 - luc do khong co canh nao "dung" theo luat,
// quy uoc lay tile[0] lam canh cham (khong anh huong luat choi, chi la quy uoc hien thi).
function resolveTouch(tile, endValue, variant) {
  const [a, b] = tile;
  if (variant === 'matador') {
    if (a + endValue === 7) return { touch: a, expose: b };
    if (b + endValue === 7) return { touch: b, expose: a };
    if (isMatadorTile(tile)) return { touch: a, expose: b };
    return null;
  }
  if (a === endValue) return { touch: a, expose: b };
  if (b === endValue) return { touch: b, expose: a };
  return null;
}

// Nguoi cam quan doi cao nhat di truoc (uu tien 6-6, roi 5-5 ... 0-0).
// Neu khong ai co doi nao, nguoi co quan diem cao nhat di truoc.
function findStartingSeat(hands) {
  for (let d = MAX_PIP; d >= 0; d--) {
    for (let seat = 0; seat < hands.length; seat++) {
      if (hands[seat].some((t) => t[0] === d && t[1] === d)) {
        return { seat, tile: [d, d] };
      }
    }
  }
  let best = { seat: 0, tile: hands[0][0], sum: -1 };
  hands.forEach((hand, seat) => {
    hand.forEach((t) => {
      const sum = t[0] + t[1];
      if (sum > best.sum) best = { seat, tile: t, sum };
    });
  });
  return { seat: best.seat, tile: best.tile };
}

function pipSum(hand) {
  return hand.reduce((s, t) => s + t[0] + t[1], 0);
}

// state.board: mang cac quan da danh theo thu tu { tile:[a,b], seat }
// state.ends: { left, right } - gia tri mo hai dau chuoi. null khi chua co quan nao.
function getOpenEnds(board) {
  if (board.length === 0) return null;
  return { left: board[0].left, right: board[board.length - 1].right };
}

// Tra ve danh sach nuoc di hop le: { handIndex, tile, side: 'left'|'right' }
// variant: 'block' (mac dinh, cung dung cho draw/muggins/allthrees/bergen) | 'matador'
function getValidMoves(hand, ends, variant = 'block') {
  const moves = [];
  if (!ends) {
    // chua co quan nao tren ban - moi quan deu choi duoc (dat lam quan dau)
    hand.forEach((tile, handIndex) => moves.push({ handIndex, tile, side: 'left' }));
    return moves;
  }
  hand.forEach((tile, handIndex) => {
    if (resolveTouch(tile, ends.left, variant)) moves.push({ handIndex, tile, side: 'left' });
    if (resolveTouch(tile, ends.right, variant)) moves.push({ handIndex, tile, side: 'right' });
  });
  return moves;
}

// Ap dung nuoc di, tra ve board moi (immutable) va gia tri dau moi
function applyMove(board, ends, move, variant = 'block') {
  const { tile, side } = move;
  const newBoard = board.slice();

  if (!ends) {
    // quan dau tien
    newBoard.push({ tile, seat: move.seat, left: tile[0], right: tile[1] });
    return newBoard;
  }

  if (side === 'left') {
    const { touch, expose } = resolveTouch(tile, ends.left, variant);
    newBoard.unshift({ tile, seat: move.seat, left: expose, right: touch });
  } else {
    const { touch, expose } = resolveTouch(tile, ends.right, variant);
    newBoard.push({ tile, seat: move.seat, left: touch, right: expose });
  }
  return newBoard;
}

// Tong diem 2 dau ho hien tai (dung cho bien the Muggins/All Threes). Doi quan lam dau
// (khi ban co >1 quan) tinh gap doi vi no duoc dat ngang, lo ca 2 mat.
function computeEndsScore(board) {
  if (!board.length) return 0;
  const leftEntry = board[0];
  const rightEntry = board[board.length - 1];
  let leftVal = leftEntry.left;
  let rightVal = rightEntry.right;
  if (board.length > 1) {
    if (leftEntry.tile[0] === leftEntry.tile[1]) leftVal *= 2;
    if (rightEntry.tile[0] === rightEntry.tile[1]) rightVal *= 2;
  }
  return leftVal + rightVal;
}

function tileKey(tile) {
  return `${tile[0]}-${tile[1]}`;
}

function removeTileFromHand(hand, tile) {
  const idx = hand.findIndex((t) => t[0] === tile[0] && t[1] === tile[1]);
  if (idx === -1) return hand;
  const newHand = hand.slice();
  newHand.splice(idx, 1);
  return newHand;
}

// Tinh ket qua khi tan van (het nuoc di - ca 4 nguoi deu bo luot)
// Nguoi co tong diem tay thap nhat thang. Diem thuong: mac dinh = tong diem tay nguoi thua,
// hoac opts.fixedPoints (bien the Bergen dung diem co dinh thay vi tong diem tay doi thu).
function resolveBlockedRound(hands, opts = {}) {
  const pips = hands.map(pipSum);
  const minPip = Math.min(...pips);
  const winners = pips.reduce((arr, p, i) => (p === minPip ? [...arr, i] : arr), []);
  if (winners.length > 1) {
    // hoa nhieu nguoi cung diem thap nhat - chia deu, khong ai duoc diem
    return { winnerSeats: winners, points: 0, reason: 'blocked-tie', pips };
  }
  const totalOthers = pips.reduce((s, p, i) => (winners.includes(i) ? s : s + p), 0);
  const points = opts.fixedPoints != null ? opts.fixedPoints : totalOthers;
  return { winnerSeats: winners, points, reason: 'blocked', pips };
}

// Nguoi thang khi het bai truoc: diem mac dinh = tong diem cac tay con lai,
// hoac opts.fixedPoints (bien the Bergen).
function resolveWinByEmptyHand(seat, hands, opts = {}) {
  const pips = hands.map(pipSum);
  const totalOthers = pips.reduce((s, p, i) => (i === seat ? s : s + p), 0);
  const points = opts.fixedPoints != null ? opts.fixedPoints : totalOthers;
  return { winnerSeats: [seat], points, reason: 'domino', pips };
}

const BERGEN_POINTS = { domino: 2, blocked: 1, doubleEnds: 2 };
const MUGGINS_DIVISOR = 5;
const ALLTHREES_DIVISOR = 3;

module.exports = {
  MAX_PIP,
  generateTiles,
  shuffle,
  dealHands,
  findStartingSeat,
  pipSum,
  getOpenEnds,
  getValidMoves,
  applyMove,
  tileKey,
  removeTileFromHand,
  resolveBlockedRound,
  resolveWinByEmptyHand,
  computeEndsScore,
  isMatadorTile,
  MATADOR_TILES,
  BERGEN_POINTS,
  MUGGINS_DIVISOR,
  ALLTHREES_DIVISOR,
};
