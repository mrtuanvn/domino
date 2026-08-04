(function () {
  const DOT_PATTERNS = {
    0: [],
    1: [4],
    2: [0, 8],
    3: [0, 4, 8],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8],
  };

  function makeHalf(value, isLeft) {
    const half = document.createElement('div');
    half.className = 'half' + (isLeft ? ' left' : '');
    for (let i = 0; i < 9; i++) {
      const cell = document.createElement('div');
      cell.className = 'dot-cell' + (DOT_PATTERNS[value].includes(i) ? ' filled' : '');
      half.appendChild(cell);
    }
    return half;
  }

  function makeTileEl(tile) {
    const el = document.createElement('div');
    el.className = 'domino-tile';
    el.appendChild(makeHalf(tile[0], true));
    el.appendChild(makeHalf(tile[1], false));
    return el;
  }

  const roomMatch = location.pathname.match(/^\/r\/([A-Za-z0-9]+)/);
  const lobbyView = document.getElementById('lobby-view');
  const roomView = document.getElementById('room-view');

  if (!roomMatch) {
    initLobby();
  } else {
    initRoom(roomMatch[1]);
  }

  function initLobby() {
    const form = document.getElementById('create-form');
    const matchWinsField = document.getElementById('matchWins-field');
    const targetScoreField = document.getElementById('targetScore-field');

    form.querySelectorAll('input[name=mode]').forEach((r) => {
      r.addEventListener('change', () => {
        const isScore = form.mode.value === 'score';
        matchWinsField.style.display = isScore ? 'none' : 'flex';
        targetScoreField.style.display = isScore ? 'flex' : 'none';
      });
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const mode = form.mode.value;
      const body = {
        mode,
        matchWins: document.getElementById('matchWins').value,
        targetScore: document.getElementById('targetScore').value,
      };
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      location.href = `/r/${data.roomId}`;
    });
  }

  function getOrCreateToken(roomId) {
    const key = `domino_token_${roomId}`;
    let token = localStorage.getItem(key);
    if (!token) {
      token = crypto.randomUUID();
      localStorage.setItem(key, token);
    }
    return token;
  }

  function getOrAskName() {
    let name = localStorage.getItem('domino_name');
    if (!name) {
      name = prompt('Ten hien thi cua ban:', 'Nguoi choi') || 'Nguoi choi';
      localStorage.setItem('domino_name', name);
    }
    return name;
  }

  function initRoom(roomId) {
    lobbyView.style.display = 'none';
    roomView.style.display = 'block';

    const token = getOrCreateToken(roomId);
    const name = getOrAskName();
    const socket = io();

    const els = {
      roomCode: document.getElementById('room-code'),
      copyBtn: document.getElementById('copy-link-btn'),
      scoreboard: document.getElementById('scoreboard'),
      seats: document.getElementById('seats'),
      lobbyActions: document.getElementById('lobby-actions'),
      startBtn: document.getElementById('start-btn'),
      boardArea: document.getElementById('board-area'),
      turnIndicator: document.getElementById('turn-indicator'),
      board: document.getElementById('board'),
      hand: document.getElementById('hand'),
      passBtn: document.getElementById('pass-btn'),
      resultOverlay: document.getElementById('result-overlay'),
      resultText: document.getElementById('result-text'),
      rematchBtn: document.getElementById('rematch-btn'),
      toast: document.getElementById('toast'),
    };

    els.roomCode.textContent = roomId;
    els.copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(location.href);
      showToast('Da sao chep link moi!');
    });
    els.startBtn.addEventListener('click', () => socket.emit('start-game'));
    els.passBtn.addEventListener('click', () => socket.emit('pass'));
    els.rematchBtn.addEventListener('click', () => socket.emit('rematch'));

    let toastTimer = null;
    function showToast(msg) {
      els.toast.textContent = msg;
      els.toast.style.display = 'block';
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => (els.toast.style.display = 'none'), 2500);
    }

    socket.on('connect', () => socket.emit('join', { roomId, token, name }));
    socket.on('errorMsg', showToast);
    socket.on('state', render);

    function seatLabel(mode, s, idx) {
      const type = s.type === 'bot' ? 'Bot' : s.type === 'human' ? 'Nguoi' : 'Trong';
      return `${s.name || `Ghe ${idx + 1}`} (${type})`;
    }

    function render(state) {
      // Ty le
      els.scoreboard.innerHTML = '';
      state.seats.forEach((s, idx) => {
        const val = state.mode === 'score' ? state.scores[idx] : state.roundWins[idx];
        const span = document.createElement('span');
        span.textContent = `${s.name || 'Ghe ' + (idx + 1)}: ${val}`;
        els.scoreboard.appendChild(span);
      });

      // Cac ghe
      els.seats.innerHTML = '';
      state.seats.forEach((s, idx) => {
        const card = document.createElement('div');
        card.className = 'seat-card' + (state.turnSeat === idx ? ' turn' : '');
        if (s.name) {
          card.innerHTML = `<span class="name">${s.isYou ? '(Ban) ' : ''}${seatLabel(state.mode, s, idx)}</span>
            <span class="meta"><span class="dot ${s.connected ? 'on' : 'off'}"></span>${s.handCount} quan</span>`;
        } else {
          card.innerHTML = `<span class="name">Ghe trong</span><span class="meta">Cho nguoi choi...</span>`;
        }
        els.seats.appendChild(card);
      });

      const inLobby = state.status === 'lobby';
      els.lobbyActions.style.display = inLobby ? 'block' : 'none';
      els.boardArea.style.display = inLobby ? 'none' : 'block';
      if (inLobby) return;

      // Ban co
      els.board.innerHTML = '';
      state.board.forEach((entry) => els.board.appendChild(makeTileEl(entry.tile)));

      // Chi bao luot
      if (state.status === 'match-over') {
        els.turnIndicator.textContent = 'Tran dau ket thuc!';
      } else if (!state.roundPlaying) {
        els.turnIndicator.textContent = 'Chuan bi van moi...';
      } else if (state.turnSeat !== null) {
        const turnSeatInfo = state.seats[state.turnSeat];
        els.turnIndicator.textContent = turnSeatInfo.isYou ? 'Den luot ban!' : `Den luot: ${turnSeatInfo.name}`;
      }

      // Bai tren tay
      els.hand.innerHTML = '';
      const isMyTurn = state.yourSeat !== -1 && state.turnSeat === state.yourSeat && state.roundPlaying;
      state.yourHand.forEach((tile, handIndex) => {
        const movesForTile = state.yourValidMoves.filter((m) => m.handIndex === handIndex);
        const el = makeTileEl(tile);
        el.classList.add('hand-tile');
        if (isMyTurn && movesForTile.length > 0) {
          el.classList.add('playable');
          el.addEventListener('click', () => {
            if (movesForTile.length === 1) {
              socket.emit('play', { handIndex, side: movesForTile[0].side });
            } else {
              showSideChoice(el, handIndex, movesForTile);
            }
          });
        } else {
          el.classList.add('disabled');
        }
        els.hand.appendChild(el);
      });

      function showSideChoice(anchorEl, handIndex, moves) {
        const wrap = document.createElement('div');
        wrap.className = 'side-choice';
        moves.forEach((m) => {
          const b = document.createElement('button');
          b.textContent = m.side === 'left' ? 'Trai' : 'Phai';
          b.addEventListener('click', (ev) => {
            ev.stopPropagation();
            socket.emit('play', { handIndex, side: m.side });
          });
          wrap.appendChild(b);
        });
        anchorEl.replaceWith(wrap);
        wrap.appendChild(anchorEl);
      }

      // Nut bo luot
      els.passBtn.style.display = isMyTurn && state.yourValidMoves.length === 0 ? 'inline-block' : 'none';

      // Ket qua van / tran
      if (state.status === 'match-over') {
        const scores = state.mode === 'score' ? state.scores : state.roundWins;
        const maxVal = Math.max(...scores);
        const winners = state.seats.filter((s, i) => scores[i] === maxVal && s.name);
        const winnerNames = winners.map((s) => s.name).join(', ');
        els.resultText.textContent = `Ket thuc tran dau!\nNguoi thang: ${winnerNames}`;
        els.resultOverlay.style.display = 'flex';
        els.rematchBtn.style.display = 'inline-block';
      } else if (state.lastResult) {
        const r = state.lastResult;
        const names = r.winnerSeats.map((i) => (state.seats[i].name || `Ghe ${i + 1}`)).join(', ');
        const reasonText = r.reason === 'domino' ? 'het bai truoc' : r.reason === 'blocked-tie' ? 'bi chan, hoa diem' : 'bi chan (thap diem nhat)';
        els.resultText.textContent = `Van nay: ${names || 'Hoa'} thang (${reasonText})${r.points ? ', +' + r.points + ' diem' : ''}`;
        els.resultOverlay.style.display = 'flex';
        els.rematchBtn.style.display = 'none';
      } else {
        els.resultOverlay.style.display = 'none';
      }
    }
  }
})();
