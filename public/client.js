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

  function makeTileEl(val1, val2, vertical) {
    const el = document.createElement('div');
    el.className = 'domino-tile' + (vertical ? ' vertical' : '');
    el.appendChild(makeHalf(val1, true));
    el.appendChild(makeHalf(val2, false));
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
      roomCode2: document.getElementById('room-code-2'),
      settingsBtn: document.getElementById('settings-btn'),
      settingsCloseBtn: document.getElementById('settings-close-btn'),
      settingsModal: document.getElementById('settings-modal'),
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
    els.roomCode2.textContent = roomId;
    els.copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(location.href);
      showToast('Đã sao chép link mời!');
    });
    els.settingsBtn.addEventListener('click', () => { els.settingsModal.style.display = 'flex'; });
    els.settingsCloseBtn.addEventListener('click', () => { els.settingsModal.style.display = 'none'; });
    els.settingsModal.addEventListener('click', (e) => {
      if (e.target === els.settingsModal) els.settingsModal.style.display = 'none';
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

    // dirIdx theo chieu kim dong ho: 0=Phai, 1=Xuong, 2=Trai, 3=Len.
    // Xay layout tu do (khong bi chui vao 1 khung co dinh khi xep): quan thuong noi tiep
    // theo huong hien tai, quan doi be vuong goc. Khi cham biên (container co dinh) HOAC cham
    // nhanh da xep, thi be vuong goc 90. Sau khi xep xong hoan toan tu do, render se thu nho
    // toan bo (scale) cho vua khung 340px - nen khong bao gio phai "keo dai" ban vo han.
    function spiralBox(cursor, dirIdx, long, thin) {
      const vertical = dirIdx === 1 || dirIdx === 3;
      const w = vertical ? thin : long;
      const h = vertical ? long : thin;
      let x = cursor.x;
      let y = cursor.y;
      if (dirIdx === 2) x -= w; // Trai: quan noi ve phia trai diem cam
      if (dirIdx === 3) y -= h; // Len: quan noi ve phia tren diem cam
      return { x, y, w, h, vertical };
    }

    function boxOverlapsAny(box, rects) {
      return rects.some((r) => {
        const ox = Math.min(box.x + box.w, r.x + r.w) - Math.max(box.x, r.x);
        const oy = Math.min(box.y + box.h, r.y + r.h) - Math.max(box.y, r.y);
        return ox > 1 && oy > 1; // cham canh (0/1px) thi cho, chi chan noi that su
      });
    }

    // Don vi chuan de tinh layout (ty le that: dai gap ~1.9 lan day). Layout tinh 1 lan
    // duy nhat o don vi nay, KHONG phu thuoc container - viec thu nho cho vua khung se lam
    // o buoc render (scale toan bo). Nho the khong can xep lai layout nhieu lan.
    const UNIT_LONG = 55;
    const UNIT_THIN = 29;

    // Xep tu do theo ca 4 huong (khong bi ep vao 1 khung ngang khi xep): quan thuong noi
    // tiep theo huong hien tai, quan doi be vuong goc (giong domino that). Cham nhanh da
    // xep truoc thi be vuong goc tiep (chieu kim dong ho) - tu nhien cuon thanh xoan oc.
    function computeSpiralLayout(boardEntries) {
      let dirIdx = 0;
      let cursor = { x: 0, y: 0 };
      const rects = [];
      const positions = [];

      boardEntries.forEach((entry, i) => {
        const isDouble = entry.tile[0] === entry.tile[1];
        const startDir = isDouble && i > 0 ? (dirIdx + 1) % 4 : dirIdx;

        let chosenDir = null;
        for (let attempt = 0; attempt < 4; attempt++) {
          const tryDir = (startDir + attempt) % 4;
          const box = spiralBox(cursor, tryDir, UNIT_LONG, UNIT_THIN);
          if (!boxOverlapsAny(box, rects)) {
            chosenDir = tryDir;
            break;
          }
        }
        if (chosenDir === null) chosenDir = startDir; // ket cung - hiem khi xay ra, chap nhan

        dirIdx = chosenDir;
        const box = spiralBox(cursor, dirIdx, UNIT_LONG, UNIT_THIN);
        positions.push({ x: box.x, y: box.y, w: box.w, h: box.h, vertical: box.vertical });
        rects.push(box);

        // cap nhat diem cam tiep theo dung theo huong da chon, de quan sau noi lien mach
        if (dirIdx === 0) cursor = { x: box.x + box.w, y: box.y };
        else if (dirIdx === 1) cursor = { x: box.x, y: box.y + box.h };
        else cursor = { x: box.x, y: box.y }; // Trai/Len: diem cam la chinh goc quan vua dat
      });

      // dua tat ca ve toa do khong am (phong khi xoan oc lan sang trai/len goc xuat phat)
      let minX = 0;
      let minY = 0;
      positions.forEach((p) => {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
      });
      const offsetX = -minX;
      const offsetY = -minY;

      let maxX = 0;
      let maxY = 0;
      const shifted = positions.map((p) => {
        const x = p.x + offsetX;
        const y = p.y + offsetY;
        maxX = Math.max(maxX, x + p.w);
        maxY = Math.max(maxY, y + p.h);
        return { x, y, vertical: p.vertical };
      });

      return { positions: shifted, maxX, maxY };
    }

    function renderSnakeBoard(boardEntries) {
      els.board.innerHTML = '';
      els.board.style.width = '100%'; // reset ve day container truoc khi do, tranh do nham gia tri cu
      els.board.style.height = '';
      if (boardEntries.length === 0) {
        els.board.style.height = '40px';
        return;
      }

      const MAX_BOARD_HEIGHT = 340; // khung ban co dinh - khong keo dai vo han, thu nho quan de vua thay vao do
      const containerWidth = els.board.clientWidth || 320;

      // Layout tinh 1 lan duy nhat o don vi chuan, khong chong lan (dam bao boi thuat toan).
      const layout = computeSpiralLayout(boardEntries);

      // Thu nho toan bo (scale) de vua ca chieu rong container lan chieu cao gioi han -
      // khong phong to qua 1 (van dai ngan thi giu nguyen co that).
      const scale = Math.min(1, containerWidth / layout.maxX, MAX_BOARD_HEIGHT / layout.maxY);

      layout.positions.forEach((pos, i) => {
        const entry = boardEntries[i];
        // dung dung dau quan dang lo ra (entry.left/entry.right) de cham diem khop nhau,
        // khong dung thu tu goc cua quan [a,b] - tranh noi sai diem nhu bug da gap
        const el = makeTileEl(entry.left, entry.right, pos.vertical);
        el.classList.add('board-tile');
        el.style.left = `${pos.x * scale}px`;
        el.style.top = `${pos.y * scale}px`;
        el.style.transform = `scale(${scale})`;
        el.style.transformOrigin = 'top left';
        els.board.appendChild(el);
      });

      els.board.style.width = `${Math.max(layout.maxX * scale, containerWidth)}px`;
      els.board.style.height = `${Math.max(layout.maxY * scale, 40)}px`;
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
        const el = makeTileEl(tile[0], tile[1], true);
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
