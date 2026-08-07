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
        else if (name === 'draw') tone(330, 0, 0.1, 'sine', 0.1);
        else if (name === 'bonus') { tone(700, 0, 0.08, 'triangle', 0.16); tone(950, 0.09, 0.1, 'triangle', 0.16); }
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
    const rulesLink = document.getElementById('rules-link');
    const rulesModal = document.getElementById('rules-modal');
    const rulesCloseBtn = document.getElementById('rules-close-btn');

    rulesLink.addEventListener('click', (e) => {
      e.preventDefault();
      rulesModal.style.display = 'flex';
    });
    rulesCloseBtn.addEventListener('click', () => { rulesModal.style.display = 'none'; });
    rulesModal.addEventListener('click', (e) => {
      if (e.target === rulesModal) rulesModal.style.display = 'none';
    });

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
        variant: document.getElementById('variant').value,
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
    roomView.style.display = 'flex';

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
      opponentsRow: document.getElementById('opponents-row'),
      tableOval: document.getElementById('table-oval'),
      turnIndicator: document.getElementById('turn-indicator'),
      board: document.getElementById('board'),
      yourSeatChip: document.getElementById('your-seat-chip'),
      hand: document.getElementById('hand'),
      stockCounter: document.getElementById('stock-counter'),
      drawBtn: document.getElementById('draw-btn'),
      passBtn: document.getElementById('pass-btn'),
      pauseBtn: document.getElementById('pause-btn'),
      sideChoicePopup: document.getElementById('side-choice-popup'),
      sideChoiceLeft: document.getElementById('side-choice-left'),
      sideChoiceRight: document.getElementById('side-choice-right'),
      resultOverlay: document.getElementById('result-overlay'),
      resultText: document.getElementById('result-text'),
      rematchBtn: document.getElementById('rematch-btn'),
      toast: document.getElementById('toast'),
    };

    function openSideChoice(handIndex, moves) {
      const leftMove = moves.find((m) => m.side === 'left');
      const rightMove = moves.find((m) => m.side === 'right');
      els.sideChoiceLeft.style.display = leftMove ? 'inline-block' : 'none';
      els.sideChoiceRight.style.display = rightMove ? 'inline-block' : 'none';
      // gan lai onclick (khong dung addEventListener) de khong bao gio cong don handler cu
      els.sideChoiceLeft.onclick = () => {
        els.sideChoicePopup.style.display = 'none';
        SoundFX.play('place');
        socket.emit('play', { handIndex, side: 'left' });
      };
      els.sideChoiceRight.onclick = () => {
        els.sideChoicePopup.style.display = 'none';
        SoundFX.play('place');
        socket.emit('play', { handIndex, side: 'right' });
      };
      els.sideChoicePopup.style.display = 'flex';
    }

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
    els.drawBtn.addEventListener('click', () => { SoundFX.play('draw'); socket.emit('draw'); });
    els.rematchBtn.addEventListener('click', () => socket.emit('rematch'));
    els.pauseBtn.addEventListener('click', () => {
      socket.emit(lastState && lastState.paused ? 'resume' : 'pause');
    });

    // Canh bao khi roi trang luc dang choi dang do - khong chan duoc 100% nhung nhac truoc.
    window.addEventListener('beforeunload', (e) => {
      if (lastState && lastState.roundPlaying) {
        e.preventDefault();
        e.returnValue = '';
      }
    });

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
        if (last.seat !== state.yourSeat) {
          SoundFX.play(last.action === 'play' ? 'place' : last.action === 'draw' ? 'draw' : 'pass');
        }
        if (last.bonus) {
          SoundFX.play('bonus');
          const seatInfo = state.seats[last.seat];
          showToast(`${seatInfo && seatInfo.name ? seatInfo.name : 'Ghế ' + (last.seat + 1)} +${last.bonus} điểm thưởng!`);
        }
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
    // Uu tien di trong khung ban (that) - cham bien thi be vuong goc; neu khong con huong
    // nao vua khung thi van uu tien khong chong len nhanh da xep (an toan tuyet doi), va de
    // buoc scale-to-fit o renderSnakeBoard xu ly phan con lai. Nho vay ban se cuon dan vao
    // trong thanh xoan oc gan lap day hinh chu nhat, thay vi keo dai mai theo 1 huong.
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

    // Don vi chuan de tinh layout (ty le that: dai gap ~1.9 lan day).
    // Phai khop kich thuoc CSS that cua .domino-tile (.half 30px + border 1.5px => 63x33).
    const UNIT_LONG = 63;
    const UNIT_THIN = 33;

    // Xoan oc BAM BIEN THAT cua ban truoc, roi moi thu nho dan vao trong: vong dau tien di
    // sat 4 canh that cua khung (ring = {0,0,boundsW,boundsH}); moi canh (top/right/bottom/left)
    // cua ring duoc cap nhat lai bang TOA DO THUC vua dat (khong phai +-thin suy dien), nen
    // vong sau luon khop khit voi vi tri that cua vong truoc du long co chia het khong gian
    // ban hay khong - giong xep hinh xoan oc chu nhat kinh dien (spiral matrix) nhung buoc di
    // dai bien doi (long) thay vi 1 o.
    function computeSpiralLayout(boardEntries, boundsW, boundsH, long, thin) {
      let dirIdx = 0; // 0=Phai,1=Xuong,2=Trai,3=Len
      let ring = { left: 0, top: 0, right: boundsW, bottom: boundsH };
      let cursor = { x: 0, y: 0 };
      let prevBox = null;
      let prevDir = null;
      const positions = [];
      // Diem mut A luon la goc (0,0): quan dau tien luon xuat phat huong Phai tu day.
      const startTip = { x: cursor.x, y: cursor.y };

      // Diem neo mac dinh la con tro; chi can chinh lai o dung 4 cap chuyen huong (Phai->Xuong,
      // Trai->Len, Xuong->Trai, Len->Phai) - do la nhung cap ma con tro mac dinh khien quan moi
      // chi cham quan truoc dung 1 diem goc (nhin nhu ho/dut doan) thay vi khop canh; cong thuc
      // duoc suy tu hinh hoc that cua 2 hop chu nhat ke nhau.
      function anchorFor(cur, dir, pBox, pDir) {
        if (pBox && pDir !== dir) {
          // Phai->Xuong (goc tren-phai): quan doc phai nep vao mep TRONG (phia vua di toi) cua
          // quan ngang truoc, khong chi cham 1 diem goc - neu khong se ho hinh chu L o goc.
          if (pDir === 0 && dir === 1) return { x: cur.x - thin, y: cur.y + pBox.h };
          if ((pDir === 3 && dir === 0) || (pDir === 1 && dir === 2)) return { x: cur.x + pBox.w, y: cur.y };
        }
        return cur;
      }

      // Khoang dem giua vong xoan trong va vong ngoai: khong ap dung cho khop noi that giua
      // 2 quan lien tiep (anchorFor van khop khit nhu cu), chi lam vong trong dung lui vao
      // som hon mot chut de khong bao gio cham sat vao hang quan cua vong truoc (nhin nhu
      // "dinh chum" du ve mat toa do khong he chong lan).
      const RING_GAP = thin * 0.35;

      // Quan tiep theo theo huong `dir` co tran qua canh trong (ring.* - thin - RING_GAP, chua
      // cho canh vuong goc sap toi) khong - neu co thi phai re truoc khi dat quan, chua dat.
      function overflows(dir) {
        const box = spiralBox(anchorFor(cursor, dir, prevBox, prevDir), dir, long, thin);
        const margin = thin + RING_GAP;
        if (dir === 0) return box.x + box.w > ring.right - margin + 0.01;
        if (dir === 1) return box.y + box.h > ring.bottom - margin + 0.01;
        if (dir === 2) return box.x < ring.left + margin - 0.01;
        return box.y < ring.top + margin - 0.01;
      }

      function place(entry, dir, anchor) {
        const box = spiralBox(anchor, dir, long, thin);
        let v1, v2;
        if (dir === 2 || dir === 3) { v1 = entry.right; v2 = entry.left; } else { v1 = entry.left; v2 = entry.right; }
        positions.push({ x: box.x, y: box.y, w: box.w, h: box.h, vertical: box.vertical, v1, v2 });
        return box;
      }

      function advanceCursor(dir, box) {
        if (dir === 0) return { x: box.x + box.w, y: box.y };
        if (dir === 1) return { x: box.x, y: box.y + box.h };
        return { x: box.x, y: box.y };
      }

      function overlapArea(a, b) {
        const ox = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
        const oy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
        return ox * oy;
      }

      function worstOverlap(box) {
        let worst = 0;
        for (const p of positions) worst = Math.max(worst, overlapArea(p, box));
        return worst;
      }

      // Khung bao (bounding box) cua TOAN BO quan da xep tinh den hien tai - dung de biet
      // "tam cum" quan dang o dau, phuc vu buoc thoat hiem ben duoi khi vong xoan trong da
      // qua chat (khong con huong nao trong 3 huong thuong ma khong de len quan cu).
      let bboxMinX = Infinity, bboxMinY = Infinity, bboxMaxX = -Infinity, bboxMaxY = -Infinity;
      function trackBBox(box) {
        bboxMinX = Math.min(bboxMinX, box.x);
        bboxMinY = Math.min(bboxMinY, box.y);
        bboxMaxX = Math.max(bboxMaxX, box.x + box.w);
        bboxMaxY = Math.max(bboxMaxY, box.y + box.h);
      }

      // Dien tich con lai BEN TRONG ring hien tai, quy doi ra "so quan" toi da co the chua vua
      // (khong tinh khe ho giua cac quan). Dung de tu choi re vao trong (dong vong) neu phan
      // noi that sap toi khong du cho so quan CON LAI - tranh tao "vong donut" khep kin ma
      // ruot ben trong khong du rong, buoc phai de quan len nhau khi khong con duong lui.
      function interiorCapacity() {
        const w = Math.max(0, ring.right - ring.left);
        const h = Math.max(0, ring.bottom - ring.top);
        return (w * h) / (long * thin);
      }

      // Nhu interiorCapacity() nhung tinh THEO SAU khi ap dung canh ring se bi cap nhat boi
      // huong `dir` (mo phong dung 1 buoc "if (dir===0) ring.top=box.y ..." o cuoi vong lap
      // chinh) - dung de kiem tra truoc khi thuc su re, tranh dong vong roi moi phat hien het
      // cho (giong nhu truong hop turn "nhanh" da xu ly, nhung ap dung them cho ca vong lap
      // 3-huong du phong, vi do cung la 1 dang re lam hep ring y het).
      function interiorCapacityAfter(dir, box) {
        const r = { ...ring };
        if (dir === 0) r.top = box.y;
        else if (dir === 1) r.right = box.x;
        else if (dir === 2) r.bottom = box.y;
        else r.left = box.x;
        const w = Math.max(0, r.right - r.left);
        const h = Math.max(0, r.bottom - r.top);
        return (w * h) / (long * thin);
      }

      // Chon huong cho quan tiep theo: uu tien theo luat xoan oc chuan (thang tiep, chi re khi
      // canh ring ao bao het cho VA phan con lai du rong cho so quan chua xep), nhung LUON xac
      // nhan lai bang hinh hoc THAT (khong chi dua vao ring) truoc khi chot - vi ring chi la 1
      // hinh chu nhat dang thu hep dan vao trong, khong "nho" duoc het moi quan da xep tu cac
      // vong truoc do. Sau nhieu vong, huong ring tuong la con cho co the that ra da bi 1 quan
      // tu vong ngoai chiem mat (nhanh B "giao" lai vao vung da di qua) - luc do thu lan luot
      // thang tiep / re phai / re trai va chon huong dau tien khong de len quan nao, dam bao
      // KHONG BAO GIO ve quan chong len nhau.
      function pickDirection(remaining) {
        if (!overflows(dirIdx)) {
          const anchor = anchorFor(cursor, dirIdx, prevBox, prevDir);
          const box = spiralBox(anchor, dirIdx, long, thin);
          if (worstOverlap(box) <= 1) return { dir: dirIdx, anchor };
        } else {
          const nextDir = (dirIdx + 1) % 4;
          // He so 5.0 la bien an toan (spiral khong lap kin 100% dien tich do co khe ho/RING_GAP
          // giua cac vong, va ban than duong xoan oc cung khong the to kin moi ngoc ngach cua
          // hinh chu nhat) - re vao trong chi khi noi that con lai chac chan du cho, khong chi
          // vua du tren ly thuyet. Da kiem thu TOAN BO bo 28 quan (double-six, muc toi da cua
          // game nay) tren hang tram ty le khung hinh ngau nhien, ke ca khung vuong chat nhat
          // (1..28 quan, 1120 kich ban) - khong con quan nao de len nhau. He so < 5.0 (VD 2.6)
          // con ghi nhan overlap (nhanh B de nguoc len chinh no) o mot so khung chat.
          if (!overflows(nextDir) && interiorCapacity() >= remaining * 5.0) {
            const anchor = anchorFor(cursor, nextDir, prevBox, prevDir);
            const box = spiralBox(anchor, nextDir, long, thin);
            if (worstOverlap(box) <= 1) return { dir: nextDir, anchor };
          }
        }
        // Ring ao khong con dung - do lai ca 3 huong (thang tiep/re phai/re trai) bang hinh
        // hoc that, chon huong dau tien khong de. Voi 2 huong RE (khac dirIdx hien tai), van
        // phai kiem tra du cho cho so quan con lai nhu tren - neu khong, "re" o day se lai
        // tao ra dung 1 ring nho het cho y het truong hop turn "nhanh" vua tranh duoc.
        const candidates = [dirIdx, (dirIdx + 1) % 4, (dirIdx + 3) % 4];
        let best = null;
        for (const d of candidates) {
          const anchor = anchorFor(cursor, d, prevBox, prevDir);
          const box = spiralBox(anchor, d, long, thin);
          const overlap = worstOverlap(box);
          const isTurn = d !== dirIdx;
          const capacityOk = !isTurn || interiorCapacityAfter(d, box) >= (remaining - 1) * 5.0;
          if (overlap <= 1 && capacityOk) return { dir: d, anchor };
          if (!best || overlap < best.overlap) best = { dir: d, anchor, overlap };
        }
        // Ca 3 huong khong-quay-dau deu de (cuc hiem: vong xoan trong da qua chat so voi
        // "mieng" con lai) - nhanh B gio can THOAT hoan toan ra khoi cum quan da xep thay vi
        // co nhoi tiep vao giua, ke ca phai quay dau. Uu tien huong dua cursor ra xa TAM cum
        // quan nhat (huong do gan nhu chac chan con khoang trong that su), thu ca 4 huong.
        const cx = (bboxMinX + bboxMaxX) / 2;
        const cy = (bboxMinY + bboxMaxY) / 2;
        const escapeScore = [
          cursor.x - cx, // 0 = Phai: cang xa tam ve phia phai cang tot
          cursor.y - cy, // 1 = Xuong
          cx - cursor.x, // 2 = Trai
          cy - cursor.y, // 3 = Len
        ];
        const escapeDirs = [0, 1, 2, 3].sort((a, b) => escapeScore[b] - escapeScore[a]);
        for (const d of escapeDirs) {
          const anchor = anchorFor(cursor, d, prevBox, prevDir);
          const box = spiralBox(anchor, d, long, thin);
          const overlap = worstOverlap(box);
          if (overlap <= 1) return { dir: d, anchor };
          if (overlap < best.overlap) best = { dir: d, anchor, overlap };
        }
        return best;
      }

      for (let i = 0; i < boardEntries.length; i++) {
        const { dir, anchor } = pickDirection(boardEntries.length - i);
        dirIdx = dir;
        const box = place(boardEntries[i], dirIdx, anchor);
        trackBBox(box);
        // Cap nhat DUNG 1 canh cua ring ung voi huong vua di, bang toa do that vua dat - canh
        // nay se duoc dung lai boi vong xoan ben trong (hoac boi buoc dong vong hien tai).
        if (dirIdx === 0) ring.top = box.y;
        else if (dirIdx === 1) ring.right = box.x;
        else if (dirIdx === 2) ring.bottom = box.y;
        else ring.left = box.x;

        cursor = advanceCursor(dirIdx, box);
        prevBox = box;
        prevDir = dirIdx;
      }

      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      positions.forEach((p) => {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x + p.w);
        maxY = Math.max(maxY, p.y + p.h);
      });

      // Diem mut B: chinh la "cursor" sau quan cuoi - noi quan tiep theo se duoc gan vao.
      const endTip = cursor;

      return { positions, minX, minY, maxX, maxY, boundsW, boundsH, startTip, endTip };
    }

    function renderSnakeBoard(boardEntries) {
      els.board.innerHTML = '';
      if (boardEntries.length === 0) {
        els.board.style.width = '0';
        els.board.style.height = '0';
        return;
      }

      // Kich thuoc khung that cua ban (table-oval) - tru bot padding cua no. Ban to het co
      // theo layout CSS (flex:1 het chieu cao con lai man hinh), nen khung nay lon hon truoc
      // nhieu - xoan oc se cuon vua khap ban thay vi bi ep nho som.
      const padding = 16;
      const boundsW = Math.max(60, (els.tableOval.clientWidth || 320) - padding);
      const boundsH = Math.max(60, (els.tableOval.clientHeight || 240) - padding);

      // Xep layout o DON VI GOC (UNIT_LONG/THIN) - toa do nguyen nhat, khong chay lai theo scale.
      // Luu y: UNIT_LONG/UNIT_THIN phai khop kich thuoc CSS that cua .domino-tile (box-sizing:
      // border-box, 2 nua 26px + border 1.5px = 55x29) vi finalScale ben duoi scale deu ca vi
      // tri lan kich thuoc - doi don vi o day ma khong doi CSS se lam quan hien thi lech khoi
      // toa do da tinh (chong len nhau).
      const layout = computeSpiralLayout(boardEntries, boundsW, boundsH, UNIT_LONG, UNIT_THIN);

      const minX = layout.minX;
      const minY = layout.minY;
      const spanX = Math.max(1, layout.maxX - minX);
      const spanY = Math.max(1, layout.maxY - minY);

      // finalScale = he so nho nhat de vua (fitScale). Neu ban con trong (fitScale > 1) thi
      // phong to quan len toi da MAX_GROW de lấp het khoang trong thua (quan to hon thay vi de
      // quan nho o giua ban trong); neu chuoi dai hon ban thi thu nho dung bang fitScale de
      // luon vua khung that cua ban (KHONG dat san san mot muc thu nho toi thieu - lam vay se
      // ep quan to hon fitScale va tran ra ngoai khung khi chuoi qua dai so voi ban).
      const MAX_GROW = 2.2;
      const fitScale = Math.min(boundsW / spanX, boundsH / spanY);
      const finalScale = fitScale > 1 ? Math.min(MAX_GROW, fitScale) : fitScale;

      layout.positions.forEach((pos) => {
        const el = makeTileEl(pos.v1, pos.v2, pos.vertical);
        el.classList.add('board-tile');
        // Toa do goc (nguyen) nhan finalScale; moi quan cung finalScale origin top-left, nen canh
        // chung giua 2 quan lien tiep (xA+Aw)*k va xB*k = cung bien thuc -> khop khit khong hở.
        el.style.left = `${(pos.x - minX) * finalScale}px`;
        el.style.top = `${(pos.y - minY) * finalScale}px`;
        el.style.transform = `scale(${finalScale})`;
        el.style.transformOrigin = 'top left';
        els.board.appendChild(el);
      });

      // Nhan A/B tai 2 dau day quan bai (thay cho "Trai/Phai" vi day la xoan oc, khong phai
      // duong thang - "trai/phai" tren man hinh khong con dung voi dau nao cua chuoi nua).
      [['A', layout.startTip], ['B', layout.endTip]].forEach(([label, tip]) => {
        const badge = document.createElement('div');
        badge.className = 'chain-end-badge';
        badge.textContent = label;
        badge.style.left = `${(tip.x - minX) * finalScale}px`;
        badge.style.top = `${(tip.y - minY) * finalScale}px`;
        els.board.appendChild(badge);
      });

      // Board thuc chieu cao/rộng theo scale da dung, table-oval center no.
      els.board.style.width = `${spanX * finalScale}px`;
      els.board.style.height = `${spanY * finalScale}px`;
    }

    // 1 muc gon trong hang doi thu - chi chu, khong logo/avatar
    function makeOpponentItem(s, isTurn, scoreVal) {
      const item = document.createElement('div');
      item.className = 'opponent-item' + (isTurn ? ' turn' : '') + (s.name ? '' : ' empty');
      if (!s.name) {
        item.textContent = 'Ghế trống';
        return item;
      }
      const nameEl = document.createElement('span');
      nameEl.className = 'opp-name';
      nameEl.textContent = `${s.name}${s.connected ? '' : ' (mất kết nối)'}`;
      const scoreEl = document.createElement('span');
      scoreEl.className = 'opp-score';
      scoreEl.textContent = `${scoreVal} điểm`;
      const metaEl = document.createElement('span');
      metaEl.textContent = `${s.handCount} quân`;
      item.appendChild(nameEl);
      item.appendChild(scoreEl);
      item.appendChild(metaEl);
      return item;
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
      els.boardArea.style.display = inLobby ? 'none' : 'flex';
      if (inLobby) { stopCountdown(); return; }

      // Xoay bang ghe sao cho ban luon o duoi cung; 3 doi thu ve 1 dong ngang, khong logo
      const you = state.yourSeat !== -1 ? state.yourSeat : 0;
      const relSeat = (idx) => (idx - you + 4) % 4;
      const seatByRel = {};
      state.seats.forEach((s, idx) => { seatByRel[relSeat(idx)] = { ...s, idx }; });

      const scoreList = state.mode === 'score' ? state.scores : state.roundWins;

      els.opponentsRow.innerHTML = '';
      [seatByRel[1], seatByRel[2], seatByRel[3]].forEach((s) => {
        const info = s || {};
        const scoreVal = s ? scoreList[s.idx] : 0;
        els.opponentsRow.appendChild(makeOpponentItem(info, !!(s && state.turnSeat === s.idx), scoreVal));
      });

      // Ban co - xep xoan oc trong khung that cua ban, uu tien khong gian toi da
      renderSnakeBoard(state.board);

      // Chi bao luot (dem nguoc duoc noi them boi startCountdownFor)
      if (state.status === 'match-over') {
        els.turnIndicator.dataset.base = 'Trận đấu kết thúc!';
      } else if (state.paused) {
        els.turnIndicator.dataset.base = '⏸ Ván đang tạm dừng';
      } else if (!state.roundPlaying) {
        els.turnIndicator.dataset.base = 'Chuẩn bị ván mới...';
      } else if (state.turnSeat !== null) {
        const turnSeatInfo = state.seats[state.turnSeat];
        els.turnIndicator.dataset.base = turnSeatInfo.isYou ? 'Đến lượt bạn' : `Đến lượt: ${turnSeatInfo.name}`;
      }
      els.turnIndicator.textContent = els.turnIndicator.dataset.base;

      // Nut tam dung: bat ky ai cung bam duoc trong luc dang choi (khong phai luc cho van moi/het tran)
      els.pauseBtn.style.display = state.roundPlaying ? 'inline-block' : 'none';
      els.pauseBtn.textContent = state.paused ? '▶ Tiếp tục' : '⏸ Tạm dừng';

      // O ban than
      const isMyTurn = state.yourSeat !== -1 && state.turnSeat === state.yourSeat && state.roundPlaying && !state.paused;
      const youSeatInfo = state.seats[state.yourSeat] || { name: '', type: 'human' };
      els.yourSeatChip.classList.toggle('turn', isMyTurn);
      els.yourSeatChip.innerHTML = '';
      els.yourSeatChip.appendChild(makeAvatar(youSeatInfo));
      const chipName = document.createElement('span');
      chipName.className = 'seat-name-pill';
      const yourScoreVal = state.yourSeat !== -1 ? scoreList[state.yourSeat] : 0;
      chipName.textContent = `(Bạn) ${youSeatInfo.name || ''} · ${yourScoreVal} điểm`;
      els.yourSeatChip.appendChild(chipName);

      // Bai tren tay - xep dung, keo tha de sap xep lai
      const orderedHand = reconcileHandOrder(state.yourHand);
      els.hand.innerHTML = '';
      els.sideChoicePopup.style.display = 'none'; // bai duoc dung lai moi luot render - dong popup cu (neu co)
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
              openSideChoice(handIndex, movesForTile);
            }
          });
        } else {
          el.classList.add('disabled');
        }
        els.hand.appendChild(el);
      });

      // Nut bo luot / boc quan (bien the Draw: phai boc het noc moi duoc bo luot)
      const noMoves = isMyTurn && state.yourValidMoves.length === 0;
      const isDrawVariant = state.variant === 'draw';
      const canDraw = noMoves && isDrawVariant && state.stockCount > 0;
      els.drawBtn.style.display = canDraw ? 'inline-block' : 'none';
      els.passBtn.style.display = noMoves && !canDraw ? 'inline-block' : 'none';
      els.stockCounter.style.display = isDrawVariant ? 'inline-block' : 'none';
      if (isDrawVariant) els.stockCounter.textContent = `Nọc: ${state.stockCount}`;

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
