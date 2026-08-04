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

// Chia bai cho 4 nguoi, moi nguoi 7 quan
function dealHands(numPlayers = 4, tilesPerPlayer = 7) {
  const deck = shuffle(generateTiles());
  const hands = [];
  for (let p = 0; p < numPlayers; p++) {
    hands.push(deck.slice(p * tilesPerPlayer, (p + 1) * tilesPerPlayer));
  }
  return hands;
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
function getValidMoves(hand, ends) {
  const moves = [];
  if (!ends) {
    // chua co quan nao tren ban - moi quan deu choi duoc (dat lam quan dau)
    hand.forEach((tile, handIndex) => moves.push({ handIndex, tile, side: 'left' }));
    return moves;
  }
  hand.forEach((tile, handIndex) => {
    const [a, b] = tile;
    if (a === ends.left || b === ends.left) moves.push({ handIndex, tile, side: 'left' });
    if (a === ends.right || b === ends.right) moves.push({ handIndex, tile, side: 'right' });
  });
  return moves;
}

// Ap dung nuoc di, tra ve board moi (immutable) va gia tri dau moi
function applyMove(board, ends, move) {
  const { tile, side } = move;
  const [a, b] = tile;
  const newBoard = board.slice();

  if (!ends) {
    // quan dau tien
    newBoard.push({ tile, seat: move.seat, left: a, right: b });
    return newBoard;
  }

  if (side === 'left') {
    // quan phai co dau khop voi ends.left, dau con lai tro thanh left moi
    const matchSide = a === ends.left ? a : b;
    const otherSide = a === ends.left ? b : a;
    newBoard.unshift({ tile, seat: move.seat, left: otherSide, right: matchSide });
  } else {
    const matchSide = a === ends.right ? a : b;
    const otherSide = a === ends.right ? b : a;
    newBoard.push({ tile, seat: move.seat, left: matchSide, right: otherSide });
  }
  return newBoard;
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
// Nguoi co tong diem tay thap nhat thang. Diem thuong = tong diem tay cua nhung nguoi thua.
function resolveBlockedRound(hands) {
  const pips = hands.map(pipSum);
  const minPip = Math.min(...pips);
  const winners = pips.reduce((arr, p, i) => (p === minPip ? [...arr, i] : arr), []);
  const totalOthers = pips.reduce((s, p, i) => (winners.includes(i) ? s : s + p), 0);
  if (winners.length > 1) {
    // hoa nhieu nguoi cung diem thap nhat - chia deu, khong ai duoc diem
    return { winnerSeats: winners, points: 0, reason: 'blocked-tie', pips };
  }
  return { winnerSeats: winners, points: totalOthers, reason: 'blocked', pips };
}

// Nguoi thang khi het bai truoc: diem = tong diem cac tay con lai
function resolveWinByEmptyHand(seat, hands) {
  const pips = hands.map(pipSum);
  const points = pips.reduce((s, p, i) => (i === seat ? s : s + p), 0);
  return { winnerSeats: [seat], points, reason: 'domino', pips };
}

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
};
