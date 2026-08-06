// Bot choi domino - chi dung thong tin cong khai (bai cua chinh no, quan da danh,
// va suy luan tu nhung luot bo cua doi thu). KHONG duoc doc bai nguoi khac.

const { getValidMoves } = require('./gameEngine');

// Ghi nho: khi mot ghe bo luot, no chac chan khong co ca hai dau mo tai thoi diem do.
function recordPass(memory, seat, ends) {
  if (!ends) return;
  memory[seat].add(ends.left);
  memory[seat].add(ends.right);
}

function countValueInHand(hand, value) {
  return hand.reduce((c, t) => c + (t[0] === value ? 1 : 0) + (t[1] === value ? 1 : 0), 0);
}

// Diem uu tien cho tung nuoc di. Diem cang cao cang duoc chon.
function scoreMove(move, hand, ends, memory, seatIndex, numSeats, willEmptyHand) {
  let score = 0;
  const [a, b] = move.tile;
  let newOpenValue;
  if (!ends) {
    newOpenValue = a; // quan dau tien la doi (a === b)
  } else if (move.side === 'left') {
    const matchValue = a === ends.left ? a : b;
    newOpenValue = matchValue === a ? b : a;
  } else {
    const matchValue = a === ends.right ? a : b;
    newOpenValue = matchValue === a ? b : a;
  }

  if (willEmptyHand) score += 100000; // thang ngay la uu tien tuyet doi

  // Uu tien danh quan doi som (doi kho danh, giu lai de lau de bi ket)
  if (a === b) score += 12;

  // Uu tien xa bot quan thuoc "hang" ma minh dang giu nhieu nhat -> giu linh hoat
  score += countValueInHand(hand, newOpenValue) * 4;

  // Uu tien lam dau bai thanh gia tri ma cac doi thu (theo thu tu di sau) da lo la khong co
  // -> tang kha nang ho phai bo luot (chan doi thu)
  for (let step = 1; step < numSeats; step++) {
    const oppSeat = (seatIndex + step) % numSeats;
    if (memory[oppSeat] && memory[oppSeat].has(newOpenValue)) {
      score += 30 / step; // doi ke tiep bi chan quan trong hon
    }
  }

  // Uu tien quan nang (nhieu cham) de giam diem phat neu bi bit
  score += (a + b) * 1.5;

  return score;
}

// hand: mang tile con lai cua bot
// ends: {left,right} hoac null neu ban trong
// memory: mang Set[] - memory[seat] la cac gia tri seat do da lo khong co
// seatIndex: ghe cua bot, numSeats: tong so ghe (4), variant: bien the luat dang choi
// Tra ve { handIndex, tile, side } hoac null (bo luot / can boc quan o bien the Draw)
function chooseBotMove(hand, ends, memory, seatIndex, numSeats, variant = 'block') {
  const moves = getValidMoves(hand, ends, variant);
  if (moves.length === 0) return null;

  let best = null;
  let bestScore = -Infinity;
  for (const move of moves) {
    const willEmpty = hand.length === 1;
    const s = scoreMove(move, hand, ends, memory, seatIndex, numSeats, willEmpty);
    if (s > bestScore) {
      bestScore = s;
      best = move;
    }
  }
  return best;
}

function createMemory(numSeats) {
  return Array.from({ length: numSeats }, () => new Set());
}

module.exports = { chooseBotMove, createMemory, recordPass };
