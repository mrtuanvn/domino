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

  // ---------- Am thanh (Web Audio, tu tao tieng, khong can file ngoai) ----------
  const SoundFX = (() => {
    let ctx = null;
    let muted = localStorage.getItem('domino_muted') === '1';

    function ensureCtx() {
      if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }

    function tone(freq, startTime, duration, type, gainPeak) {
      const c = ensureCtx();
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, c.currentTime + startTime);
      gain.gain.setValueAtTime(0, c.currentTime + startTime);
      gain.gain.linearRampToValueAtTime(gainPeak, c.currentTime + startTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + startTime + duration);
      osc.connect(gain).connect(c.destination);
      osc.start(c.currentTime + startTime);
      osc.stop(c.currentTime + startTime + duration + 0.02);
    }

    function play(name) {
      if (muted) return;
      try {
        if (name === 'place') tone(520, 0, 0.08, 'square', 0.15);
        else if (name === 'pass') tone(180, 0, 0.18, 'sine', 0.12);
        else if (name === 'invalid') tone(110, 0, 0.2, 'sawtooth', 0.15);
        else if (name === 'yourTurn') { tone(660, 0, 0.1, 'triangle', 0.15); tone(880, 0.12, 0.12, 'triangle', 0.15); }
        else if (name === 'roundWin') { tone(523, 0, 0.12, 'triangle', 0.18); tone(659, 0.12, 0.12, 'triangle', 0.18); tone(784, 0.24, 0.2, 'triangle', 0.18); }
        else if (name === 'roundLose') { tone(392, 0, 0.15, 'sine', 0.13); tone(294, 0.15, 0.2, 'sine', 0.13); }
        else if (name === 'matchWin') { tone(523, 0, 0.12, 'triangle', 0.2); tone(659, 0.13, 0.12, 'triangle', 0.2); tone(784, 0.26, 0.12, 'triangle', 0.2); tone(1047, 0.39, 0.3, 'triangle', 0.22); }
        else if (name === 'tick') tone(880, 0, 0.05, 'square', 0.08);
      } catch (e) { /* trinh duyet chan audio - bo qua */ }
    }

    function setMuted(v) {
      muted = v;
      localStorage.setItem('domino_muted', v ? '1' : '0');
    }

    return { play, setMuted, isMuted: () => muted, ensureCtx };
  })();

  function makeHalf(value, isLeft) {
    const half = document.createElement('div');
    half.className = `half val-${value}` + (isLeft ? ' left' : '');
    for (let i = 0; i < 9; i++) {
      const cell = document.createElement('div');
      cell.className = 'dot-cell' + (DOT_PATTERNS[value].includes(i) ? ` filled val-${value}` : '');
      half.appendChild(cell);
    }
    return half;
  }

  function makeTileEl(tile, vertical) {
    const el = document.createElement('div');
    el.className = 'domino-tile' + (vertical ? ' vertical' : '');
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
      name = prompt('Tên hiển thị của bạn:', 'Người chơi') || 'Người chơi';
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
      soundToggle: document.getElementById('sound-toggle'),
      scoreboard: document.getElementById('scoreboard'),
      seats: document.getElementById('seats'),
      lobbyActions: document.getElementById('lobby-actions'),
      startBtn: document.getElementById('start-btn'),
      boardArea: document.getElementById('board-area'),
      seatTop: document.getElementById('seat-top'),
      seatLeft: document.getElementById('seat-left'),
      seatRight: document.getElementById('seat-right'),
      turnIndicator: document.getElementById('turn-indicator'),
      board: document.getElementById('board'),
      yourSeatChip: document.getElementById('your-seat-chip'),
      hand: document.getElementById('hand'),
      passBtn: document.getElementById('pass-btn'),
      resultOverlay: document.getElementById('result-overlay'),
      resultText: document.getElementById('result-text'),
      rematchBtn: document.getElementById('rematch-btn'),
      toast: document.getElementById('toast'),
    };

    function updateSoundIcon() {
      els.soundToggle.textContent = SoundFX.isMuted() ? '🔇' : '🔊';
    }
    updateSoundIcon();
    els.soundToggle.addEventListener('click', () => {
      SoundFX.ensureCtx();
      SoundFX.setMuted(!SoundFX.isMuted());
      updateSoundIcon();
    });

    els.roomCode.textContent = roomId;
    els.copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(location.href);
      showToast('Đã sao chép link mời!');
    });
    els.startBtn.addEventListener('click', () => { SoundFX.ensureCtx(); socket.emit('start-game'); });
    els.passBtn.addEventListener('click', () => { SoundFX.play('pass'); socket.emit('pass'); });
    els.rematchBtn.addEventListener('click', () => socket.emit('rematch'));

    let toastTimer = null;
    function showToast(msg) {
      els.toast.textContent = msg;
      els.toast.style.display = 'block';
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => (els.toast.style.display = 'none'), 2500);
    }

    socket.on('connect', () => socket.emit('join', { roomId, token, name }));
    socket.on('errorMsg', (m) => { showToast(m); SoundFX.play('invalid'); });
    socket.on('state', handleState);

    // ---------- Sap xep lai bai tren tay (keo tha), luu theo tung phong ----------
    const orderKey = `domino_handorder_${roomId}`;
    let handOrderKeys = JSON.parse(localStorage.getItem(orderKey) || '[]');
    let lastHandSize = null;

    function reconcileHandOrder(hand) {
      const keys = hand.map((t) => t.join('-'));
      if (lastHandSize === null || hand.length > lastHandSize) {
        handOrderKeys = keys.slice();
      } else {
        const keySet = new Set(keys);
        const order = handOrderKeys.filter((k) => keySet.has(k));
        keys.forEach((k) => { if (!order.includes(k)) order.push(k); });
        handOrderKeys = order;
      }
      lastHandSize = hand.length;
      localStorage.setItem(orderKey, JSON.stringify(handOrderKeys));
      return handOrderKeys.map((k) => hand.find((t) => t.join('-') === k)).filter(Boolean);
    }

    function reorderHand(fromIdx, toIdx) {
      if (fromIdx === toIdx) return;
      const item = handOrderKeys.splice(fromIdx, 1)[0];
      handOrderKeys.splice(toIdx, 0, item);
      localStorage.setItem(orderKey, JSON.stringify(handOrderKeys));
      if (lastState) render(lastState);
    }

    // ---------- Dem nguoc luot ----------
    let countdownTimer = null;
    let lastTickSecond = null;
    function stopCountdown() {
      clearInterval(countdownTimer);
      countdownTimer = null;
      lastTickSecond = null;
    }
    function startCountdownFor(state) {
      stopCountdown();
      if (!state.turnDeadline) return;
      const base = els.turnIndicator.dataset.base || '';
      const tick = () => {
        const remainingMs = state.turnDeadline - Date.now();
        const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
        els.turnIndicator.textContent = `${base} - Suy nghĩ... ${seconds}s`;
        els.turnIndicator.classList.toggle('warn', seconds <= 5);
        if (seconds <= 5 && seconds !== lastTickSecond && seconds > 0 && state.turnSeat === state.yourSeat) {
          SoundFX.play('tick');
        }
        lastTickSecond = seconds;
        if (remainingMs <= 0) stopCountdown();
      };
      tick();
      countdownTimer = setInterval(tick, 250);
    }

    // ---------- Phat hien su kien moi de phat am thanh dung luc ----------
    let lastState = null;
    function detectAndPlaySounds(state) {
      if (!lastState) return;
      const prevHist = lastState.history || [];
      const newHist = state.history || [];
      if (newHist.length && (prevHist.length === 0 || JSON.stringify(newHist[newHist.length - 1]) !== JSON.stringify(prevHist[prevHist.length - 1]))) {
        const last = newHist[newHist.length - 1];
        if (last.seat !== state.yourSeat) SoundFX.play(last.action === 'play' ? 'place' : 'pass');
      }
      if (state.turnSeat === state.yourSeat && lastState.turnSeat !== state.yourSeat && state.roundPlaying) {
        SoundFX.play('yourTurn');
      }
      if (state.lastResult && (!lastState.lastResult || JSON.stringify(state.lastResult) !== JSON.stringify(lastState.lastResult))) {
        const iWon = state.lastResult.winnerSeats.includes(state.yourSeat);
        SoundFX.play(iWon ? 'roundWin' : 'roundLose');
      }
      if (state.status === 'match-over' && lastState.status !== 'match-over') {
        SoundFX.play('matchWin');
      }
    }

    function handleState(state) {
      detectAndPlaySounds(state);
      render(state);
      lastState = state;
    }

    function makeAvatar(s) {
      const av = document.createElement('div');
      av.className = 'seat-avatar' + (s.type === 'bot' ? '' : ' human');
      av.textContent = s.type === 'bot' ? 'B' : (s.name || 'N').trim().charAt(0).toUpperCase();
      return av;
    }

    function renderSnakeBoard(boardEntries) {
      els.board.innerHTML = '';
      if (boardEntries.length === 0) {
        els.board.style.height = '40px';
        return;
      }

      // Kich thuoc thuc te cua 1 quan (khop CSS: nua quan 26px + vien 1.5px*2)
      const HORIZ_W = 55; // quan nam ngang: 2 nua canh nhau
      const ROW_H = 55; // chieu cao 1 hang = chieu cao quan dung (de cho quan re khong bi de)
      const TILE_THIN = 29; // be day quan (chieu cao quan nam / chieu rong quan dung)

      const containerWidth = els.board.clientWidth || 320;
      const cols = Math.max(3, Math.floor(containerWidth / HORIZ_W));

      let row = 0;
      let col = 0;
      let dir = 1;
      let prevRow = 0;

      boardEntries.forEach((entry, i) => {
        const isTurn = i > 0 && prevRow !== row;
        prevRow = row;

        const el = makeTileEl(entry.tile, isTurn);
        el.classList.add('board-tile');
        const top = row * ROW_H + (isTurn ? 0 : (TILE_THIN === ROW_H ? 0 : (ROW_H - TILE_THIN) / 2));
        const left = isTurn ? col * HORIZ_W + (HORIZ_W - TILE_THIN) / 2 : col * HORIZ_W;
        el.style.left = `${left}px`;
        el.style.top = `${top}px`;
        els.board.appendChild(el);

        const nextCol = col + dir;
        if (nextCol < 0 || nextCol >= cols) {
          row += 1;
          dir = -dir;
        } else {
          col = nextCol;
        }
      });

      els.board.style.height = `${(row + 1) * ROW_H}px`;
      els.board.style.width = `${cols * HORIZ_W}px`;
    }

    function renderOpponentSeat(container, s) {
      container.innerHTML = '';
      container.classList.toggle('empty', !s.name);
      if (!s.name) {
        container.innerHTML = '<span class="seat-name-pill">Ghế trống</span>';
        return;
      }
      const namePill = document.createElement('span');
      namePill.className = 'seat-name-pill';
      namePill.textContent = `${s.name}${s.connected ? '' : ' (mất kết nối)'}`;
      const metaEl = document.createElement('div');
      metaEl.className = 'seat-meta';
      metaEl.textContent = `${s.handCount} quân`;
      container.appendChild(makeAvatar(s));
      container.appendChild(namePill);
      container.appendChild(metaEl);
    }

    function render(state) {
      // Ty le diem
      els.scoreboard.innerHTML = '';
      state.seats.forEach((s, idx) => {
        const val = state.mode === 'score' ? state.scores[idx] : state.roundWins[idx];
        const span = document.createElement('span');
        span.textContent = `${s.name || 'Ghế ' + (idx + 1)}: ${val}`;
        els.scoreboard.appendChild(span);
      });

      // Danh sach ghe luc con o phong cho (an di khi da vao ban choi hinh tron)
      els.seats.style.display = state.status === 'lobby' ? 'grid' : 'none';
      els.seats.innerHTML = '';
      state.seats.forEach((s, idx) => {
        const card = document.createElement('div');
        card.className = 'seat-card' + (state.turnSeat === idx ? ' turn' : '');
        if (s.name) {
          card.innerHTML = `<span class="name">${s.isYou ? '(Bạn) ' : ''}${s.name} (${s.type === 'bot' ? 'Bot' : 'Người'})</span>
            <span class="meta"><span class="dot ${s.connected ? 'on' : 'off'}"></span>${s.handCount} quân</span>`;
        } else {
          card.innerHTML = `<span class="name">Ghế trống</span><span class="meta">Chờ người chơi...</span>`;
        }
        els.seats.appendChild(card);
      });

      const inLobby = state.status === 'lobby';
      els.seats.style.display = inLobby ? 'grid' : 'none';
      els.lobbyActions.style.display = inLobby ? 'block' : 'none';
      els.boardArea.style.display = inLobby ? 'none' : 'block';
      if (inLobby) { stopCountdown(); return; }

      // Xoay bang ghe sao cho ban luon o duoi cung
      const you = state.yourSeat !== -1 ? state.yourSeat : 0;
      const relSeat = (idx) => (idx - you + 4) % 4;
      const seatByRel = {};
      state.seats.forEach((s, idx) => { seatByRel[relSeat(idx)] = { ...s, idx }; });

      renderOpponentSeat(els.seatLeft, seatByRel[1] || {});
      renderOpponentSeat(els.seatTop, seatByRel[2] || {});
      renderOpponentSeat(els.seatRight, seatByRel[3] || {});

      [
        [els.seatLeft, seatByRel[1]],
        [els.seatTop, seatByRel[2]],
        [els.seatRight, seatByRel[3]],
      ].forEach(([elx, s]) => {
        elx.classList.toggle('turn', !!(s && state.turnSeat === s.idx));
      });

      // Ban co giua ban - xep kieu ran, chi re huong khi het cho ngang, uu tien ve het quan
      renderSnakeBoard(state.board);

      // Chi bao luot (dem nguoc duoc noi them boi startCountdownFor)
      if (state.status === 'match-over') {
        els.turnIndicator.dataset.base = 'Trận đấu kết thúc!';
      } else if (!state.roundPlaying) {
        els.turnIndicator.dataset.base = 'Chuẩn bị ván mới...';
      } else if (state.turnSeat !== null) {
        const turnSeatInfo = state.seats[state.turnSeat];
        els.turnIndicator.dataset.base = turnSeatInfo.isYou ? 'Đến lượt bạn' : `Đến lượt: ${turnSeatInfo.name}`;
      }
      els.turnIndicator.textContent = els.turnIndicator.dataset.base;

      // O ban than
      const isMyTurn = state.yourSeat !== -1 && state.turnSeat === state.yourSeat && state.roundPlaying;
      const youSeatInfo = state.seats[state.yourSeat] || { name: '', type: 'human' };
      els.yourSeatChip.classList.toggle('turn', isMyTurn);
      els.yourSeatChip.innerHTML = '';
      els.yourSeatChip.appendChild(makeAvatar(youSeatInfo));
      const chipName = document.createElement('span');
      chipName.className = 'seat-name-pill';
      chipName.textContent = `(Bạn) ${youSeatInfo.name || ''}`;
      els.yourSeatChip.appendChild(chipName);

      // Bai tren tay - xep dung, keo tha de sap xep lai
      const orderedHand = reconcileHandOrder(state.yourHand);
      els.hand.innerHTML = '';
      let dragFromIdx = null;

      orderedHand.forEach((tile, displayIdx) => {
        const handIndex = state.yourHand.findIndex((t) => t[0] === tile[0] && t[1] === tile[1]);
        const movesForTile = state.yourValidMoves.filter((m) => m.handIndex === handIndex);
        const el = makeTileEl(tile, true);
        el.classList.add('hand-tile');
        el.draggable = true;

        el.addEventListener('dragstart', () => { dragFromIdx = displayIdx; el.classList.add('dragging'); });
        el.addEventListener('dragend', () => el.classList.remove('dragging'));
        el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('drag-over'); });
        el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
        el.addEventListener('drop', (e) => {
          e.preventDefault();
          el.classList.remove('drag-over');
          if (dragFromIdx !== null) reorderHand(dragFromIdx, displayIdx);
        });

        if (isMyTurn && movesForTile.length > 0) {
          el.classList.add('playable');
          el.addEventListener('click', () => {
            if (movesForTile.length === 1) {
              SoundFX.play('place');
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
          b.textContent = m.side === 'left' ? 'Trái' : 'Phải';
          b.addEventListener('click', (ev) => {
            ev.stopPropagation();
            SoundFX.play('place');
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
        els.resultText.textContent = `Kết thúc trận đấu!\nNgười thắng: ${winnerNames}`;
        els.resultOverlay.style.display = 'flex';
        els.rematchBtn.style.display = 'inline-block';
      } else if (state.lastResult) {
        const r = state.lastResult;
        const names = r.winnerSeats.map((i) => (state.seats[i].name || `Ghế ${i + 1}`)).join(', ');
        const reasonText = r.reason === 'domino' ? 'hết bài trước' : r.reason === 'blocked-tie' ? 'bị chặn, hòa điểm' : 'bị chặn (thấp điểm nhất)';
        els.resultText.textContent = `Ván này: ${names || 'Hòa'} thắng (${reasonText})${r.points ? ', +' + r.points + ' điểm' : ''}`;
        els.resultOverlay.style.display = 'flex';
        els.rematchBtn.style.display = 'none';
      } else {
        els.resultOverlay.style.display = 'none';
      }

      startCountdownFor(state);
    }
  }
})();
