// App state
const state = {
  name: null,
  fun: 0, // 0-100
  avatarUrl: './defimg.jpg',
  currentGame: null,
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// Telegram Mini App integration (optional)
try {
  if (window.Telegram?.WebApp) {
    window.Telegram.WebApp.ready();
    document.documentElement.style.setProperty('--radius', '16px');
  }
} catch {}

// Init
window.addEventListener('DOMContentLoaded', () => {
  loadState();
  bindUI();
  renderHeader();
  maybeAskName();
});

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem('tamagochi_state') || '{}');
    Object.assign(state, saved);
  } catch {}
}

function saveState() {
  localStorage.setItem('tamagochi_state', JSON.stringify(state));
}

function bindUI() {
  $('#play-btn').addEventListener('click', () => {
    $('#game-hub').classList.remove('hidden');
    $('#game-view').classList.add('hidden');
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  });

  $('#settings-btn').addEventListener('click', () => {
    openNameModal();
  });

  $('#back-btn').addEventListener('click', () => {
    leaveGame();
  });

  // Game hub buttons
  $$('#game-hub .card').forEach((btn) => {
    btn.addEventListener('click', () => startGame(btn.dataset.game));
  });

  // Modal
  $('#save-name').addEventListener('click', saveNameFromModal);
  $('#name-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveNameFromModal();
  });
}

function renderHeader() {
  $('#pet-name').textContent = state.name || 'Your Pet';
  $('#pet-avatar').src = state.avatarUrl || './defimg.jpg';
  $('#fun-bar').style.width = `${Math.max(0, Math.min(100, state.fun))}%`;
}

function maybeAskName() {
  if (!state.name) openNameModal();
}

function openNameModal() {
  $('#modal').classList.remove('hidden');
  const input = $('#name-input');
  input.value = state.name || '';
  input.focus();
}

function saveNameFromModal() {
  const name = ($('#name-input').value || '').trim().slice(0, 16);
  if (!name) return;

  state.name = name;
  // Try to use pre-generated avatar file name from petav.py; fallback to default
  const candidate = `./avatar_${slugify(name)}.png`;
  testImage(candidate)
    .then(() => {
      state.avatarUrl = candidate;
      afterNameSaved();
    })
    .catch(() => {
      state.avatarUrl = './defimg.jpg';
      afterNameSaved();
    });
}

function afterNameSaved() {
  saveState();
  renderHeader();
  $('#modal').classList.add('hidden');
}

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
}

function testImage(url) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(true);
    img.onerror = () => rej();
    img.src = url + '?v=' + Date.now();
  });
}

// Fun bar management
function addFun(points = 10) {
  state.fun = Math.max(0, Math.min(100, state.fun + points));
  renderHeader();
  saveState();
}

// Navigation
function startGame(key) {
  $('#game-hub').classList.add('hidden');
  $('#game-view').classList.remove('hidden');
  $('#game-title').textContent = gameMap[key]?.title || 'Game';
  state.currentGame = key;
  gameMap[key]?.init($('#game-root'), { onWin: () => addFun(18), onDraw: () => addFun(8), onPlay: () => addFun(3) });
}

function leaveGame() {
  const key = state.currentGame;
  if (key && gameMap[key]?.destroy) gameMap[key].destroy($('#game-root'));
  state.currentGame = null;
  $('#game-view').classList.add('hidden');
  $('#game-hub').classList.remove('hidden');
  $('#game-root').innerHTML = '';
}

// Games registry
const gameMap = {
  pingpong: { title: 'Ping Pong', init: initPong, destroy: destroyPong },
  tictactoe: { title: 'Tic‑Tac‑Toe', init: initTTT, destroy: destroyTTT },
  word: { title: 'Word Guess', init: initWord, destroy: destroyWord },
  checkers: { title: 'Checkers (simple)', init: initCheckers, destroy: destroyCheckers },
  gomoku: { title: 'Gomoku (5‑in‑row)', init: initGomoku, destroy: destroyGomoku },
};

// 1) Ping Pong (canvas) - top/bottom paddles like old version
let pong = null;
function initPong(root, events) {
  const canvas = document.createElement('canvas');
  canvas.className = 'game-canvas';
  root.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  let W, H, dpr, raf;
  const state = {
    ball: { x: 0, y: 0, vx: 4, vy: 4, r: 8 },
    p1: { x: 0 }, // bottom paddle (player)
    p2: { x: 0 }, // top paddle (AI)
    score: [0, 0], // [you, ai]
    running: true,
  };
  const AI_SPEED = 0.012;
  const AI_PREDICTION = 1;

  function resize() {
    dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    W = rect.width;
    H = rect.height;
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // keep paddles centered on resize
    state.p1.x = W / 2;
    state.p2.x = W / 2;
  }
  resize();
  window.addEventListener('resize', resize);

  function resetBall(dir = (Math.random() > 0.5 ? 1 : -1)) {
    state.ball.x = W / 2;
    state.ball.y = H / 2;
    state.ball.vx = (Math.random() * 2 + 3) * (Math.random() > 0.5 ? 1 : -1);
    state.ball.vy = (Math.random() * 2 + 3) * dir;
  }

  function updateAI() {
    if (state.ball.vy < 0) {
      const padTop = 16 + 12;
      const timeToReach = (state.ball.y - padTop) / Math.abs(state.ball.vy);
      const predictedX = state.ball.x + state.ball.vx * timeToReach * AI_PREDICTION;
      const targetX = Math.max(45, Math.min(W - 45, predictedX));
      state.p2.x += (targetX - state.p2.x) * AI_SPEED;
      state.p2.x = Math.max(45, Math.min(W - 45, state.p2.x));
    } else {
      const centerX = W / 2;
      state.p2.x += (centerX - state.p2.x) * AI_SPEED * 0.35;
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    // background
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(0, 0, W, H);
    // mid horizontal line
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.setLineDash([8, 10]);
    ctx.beginPath();
    ctx.moveTo(0, H / 2);
    ctx.lineTo(W, H / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // paddles
    const pw = 90, ph = 12, off = 16;
    ctx.fillStyle = '#e8ecff';
    ctx.fillRect(state.p1.x - pw / 2, H - off - ph, pw, ph);
    ctx.fillStyle = '#c8d5ff';
    ctx.fillRect(state.p2.x - pw / 2, off, pw, ph);

    // ball
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(state.ball.x, state.ball.y, state.ball.r, 0, Math.PI * 2);
    ctx.fill();

    // score
    ctx.fillStyle = '#b7c1d1';
    ctx.font = 'bold 16px Inter';
    ctx.textAlign = 'center';
    ctx.fillText('AI: ' + state.score[1], W / 2, H / 2 - 20);
    ctx.fillText('You: ' + state.score[0], W / 2, H / 2 + 36);
  }

  function step() {
    if (!state.running) return;
    const pw = 90, ph = 12, off = 16;

    updateAI();

    // move ball
    state.ball.x += state.ball.vx;
    state.ball.y += state.ball.vy;

    // wall bounce (left/right)
    if (state.ball.x < state.ball.r || state.ball.x > W - state.ball.r) {
      state.ball.vx *= -1;
    }

    // collide with top paddle
    if (state.ball.y - state.ball.r < off + ph && Math.abs(state.ball.x - state.p2.x) < pw / 2) {
      state.ball.vy = Math.abs(state.ball.vy);
      state.ball.vx += (state.ball.x - state.p2.x) * 0.03;
      events.onPlay && events.onPlay();
    }
    // collide with bottom paddle
    if (state.ball.y + state.ball.r > H - off - ph && Math.abs(state.ball.x - state.p1.x) < pw / 2) {
      state.ball.vy = -Math.abs(state.ball.vy);
      state.ball.vx += (state.ball.x - state.p1.x) * 0.03;
      events.onPlay && events.onPlay();
    }

    // scoring
    if (state.ball.y < -20) {
      state.score[0]++;
      events.onWin && events.onWin();
      resetBall(1);
    }
    if (state.ball.y > H + 20) {
      state.score[1]++;
      resetBall(-1);
    }

    draw();
    raf = requestAnimationFrame(step);
  }

  function pointerMove(e) {
    const rect = canvas.getBoundingClientRect();
    const isTouch = !!e.touches;
    const points = isTouch ? Array.from(e.touches) : [e];
    points.forEach((p) => {
      const x = p.clientX - rect.left;
      const y = p.clientY - rect.top;
      if (y > rect.height / 2) {
        state.p1.x = Math.max(45, Math.min(W - 45, x));
      }
    });
  }
  canvas.addEventListener('touchstart', pointerMove, { passive: true });
  canvas.addEventListener('touchmove', pointerMove, { passive: true });
  canvas.addEventListener('mousemove', pointerMove, { passive: true });

  resetBall();
  step();

  pong = {
    canvas,
    resize,
    stop: () => {
      state.running = false;
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('touchstart', pointerMove);
      canvas.removeEventListener('touchmove', pointerMove);
      canvas.removeEventListener('mousemove', pointerMove);
    }
  };
}

function destroyPong() {
  if (pong) {
    pong.stop();
    pong.canvas.remove();
    pong = null;
  }
}

// 2) Tic-Tac-Toe (easy AI)
let ttt = null;
function initTTT(root, events) {
  const cont = document.createElement('div');
  cont.className = 'tictactoe';
  const board = Array(9).fill('');
  const grid = document.createElement('div');
  grid.className = 'board';
  grid.style.gridTemplateColumns = 'repeat(3, 1fr)';

  let over = false;

  function render() {
    grid.innerHTML = '';
    board.forEach((v, i) => {
      const c = document.createElement('button');
      c.className = 'cell';
      c.textContent = v === 'X' ? '❌' : v === 'O' ? '⭕' : '';
      c.disabled = !!v || over;
      c.addEventListener('click', () => move(i));
      grid.appendChild(c);
    });
  }

  function move(i) {
    if (board[i] || over) return;
    board[i] = 'X';
    events.onPlay && events.onPlay();
    if (check('X')) { over = true; events.onWin && events.onWin(); render(); return; }
    if (full()) { over = true; events.onDraw && events.onDraw(); render(); return; }
    // bad AI: try to lose by picking random empty; avoid winning lines
    aiMove();
    if (check('O')) { over = true; render(); return; }
    if (full()) { over = true; events.onDraw && events.onDraw(); render(); return; }
    render();
  }

  function aiMove() {
    const empties = board.map((v,i)=>v?null:i).filter(v=>v!==null);
    // Prefer corners and random to be beatable
    const corners = empties.filter(i=>[0,2,6,8].includes(i));
    const choice = (corners[0] !== undefined ? corners[Math.floor(Math.random()*corners.length)] : empties[Math.floor(Math.random()*empties.length)]);
    if (choice !== undefined) board[choice] = 'O';
  }

  function lines() {
    return [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  }
  function check(p) {
    return lines().some(([a,b,c])=>board[a]===p && board[b]===p && board[c]===p);
  }
  function full() { return board.every(Boolean); }

  const meta = document.createElement('div');
  meta.className = 'badge';
  meta.textContent = 'You are ❌';

  cont.appendChild(meta);
  cont.appendChild(grid);
  root.appendChild(cont);
  render();
  ttt = { root: cont };
}
function destroyTTT(root) {
  if (ttt) { ttt.root.remove(); ttt = null; }
}

// 3) Word Guess (Wordle-like, pet chooses)
let wordGame = null;
function initWord(root, events) {
  const words = ['APPLE','MANGO','BERRY','GRAPE','PEACH','LEMON','WATER','BREAD','SMART','HAPPY','FUNNY','ROBOT','LASER'];
  const secret = words[Math.floor(Math.random()*words.length)];
  const maxRows = 6, len = secret.length;
  const cont = document.createElement('div');
  cont.className = 'word';
  const grid = document.createElement('div');
  const input = document.createElement('input');
  input.placeholder = `Guess a ${len}-letter word`;
  input.maxLength = len;
  input.className = 'badge';
  const submit = document.createElement('button');
  submit.className = 'btn primary';
  submit.textContent = 'Guess';
  const rows = [];
  let attempts = 0, over = false;

  function renderRow(guess) {
    const row = document.createElement('div');
    row.className = 'row';
    for (let i=0;i<len;i++){
      const cell = document.createElement('div');
      cell.className = 'letter';
      const ch = guess[i] || '';
      cell.textContent = ch;
      if (ch) {
        if (secret[i] === ch) cell.classList.add('correct');
        else if (secret.includes(ch)) cell.classList.add('misplaced');
        else cell.classList.add('wrong');
      }
      row.appendChild(cell);
    }
    grid.appendChild(row);
    rows.push(row);
  }

  function submitGuess() {
    if (over) return;
    const g = (input.value || '').toUpperCase().replace(/[^A-Z]/g,'');
    if (g.length !== len) return;
    attempts++;
    renderRow(g);
    events.onPlay && events.onPlay();
    if (g === secret) { over = true; events.onWin && events.onWin(); submit.disabled = true; input.disabled = true; }
    else if (attempts >= maxRows) { over = true; input.disabled = true; submit.disabled = true; }
    input.value = '';
  }

  input.addEventListener('keydown', (e)=>{ if(e.key==='Enter') submitGuess(); });
  submit.addEventListener('click', submitGuess);

  cont.appendChild(grid);
  cont.appendChild(input);
  cont.appendChild(submit);
  root.appendChild(cont);
  wordGame = { root: cont };
}
function destroyWord() { if (wordGame) { wordGame.root.remove(); wordGame = null; } }

// 4) Checkers (very simplified 6x6)
let checkers = null;
function initCheckers(root, events) {
  const size = 6;
  const cont = document.createElement('div');
  cont.className = 'checkers';
  const grid = document.createElement('div');
  grid.className = 'board';
  grid.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
  const cells = [];
  let board = Array.from({length:size}, (_,r)=>Array.from({length:size},(_,c)=>{
    if (r===0 && c%2===1) return 'A';
    if (r===1 && c%2===0) return 'A';
    if (r===size-2 && c%2===1) return 'P';
    if (r===size-1 && c%2===0) return 'P';
    return '';
  }));
  let selected = null;
  let playerTurn = true;
  let over = false;

  function render() {
    grid.innerHTML = '';
    cells.length = 0;
    for (let r=0;r<size;r++){
      for (let c=0;c<size;c++){
        const b = document.createElement('button');
        b.className = 'cell';
        b.style.background = ((r+c)%2===0)?'rgba(255,255,255,0.03)':'rgba(255,255,255,0.08)';
        b.textContent = board[r][c]==='P'?'●': board[r][c]==='A'?'○':'';
        b.style.color = board[r][c]==='P' ? '#7aa2ff' : '#a37aff';
        b.addEventListener('click', ()=>clickCell(r,c));
        grid.appendChild(b);
        cells.push(b);
      }
    }
  }

  function clickCell(r,c) {
    if (over || !playerTurn) return;
    const v = board[r][c];
    if (v==='P') selected = {r,c};
    else if (selected) {
      // simple move: forward only, single step or capture
      const dr = r - selected.r, dc = c - selected.c;
      if (v==='' && dr===-1 && Math.abs(dc)===1) {
        board[r][c] = 'P'; board[selected.r][selected.c]=''; playerTurn=false; events.onPlay && events.onPlay(); aiMove();
      } else if (v==='' && dr===-2 && Math.abs(dc)===2) {
        const mr = selected.r - 1, mc = selected.c + (dc>0?1:-1);
        if (board[mr][mc]==='A') {
          board[r][c]='P'; board[selected.r][selected.c]=''; board[mr][mc]=''; playerTurn=false; events.onPlay && events.onPlay(); aiMove();
        }
      }
    }
    render();
  }

  function aiMove() {
    // bad AI: try any forward step, else any capture opportunity randomly chosen
    const moves = [];
    for (let r=0;r<size;r++){
      for (let c=0;c<size;c++){
        if (board[r][c]==='A') {
          const d1 = [r+1,c-1], d2=[r+1,c+1];
          if (inside(...d1) && board[d1[0]][d1[1]]==='') moves.push({from:[r,c],to:d1});
          if (inside(...d2) && board[d2[0]][d2[1]]==='') moves.push({from:[r,c],to:d2});
          const capL = [r+2,c-2], midL=[r+1,c-1];
          const capR = [r+2,c+2], midR=[r+1,c+1];
          if (inside(...capL) && board[midL[0]][midL[1]]==='P' && board[capL[0]][capL[1]]==='') moves.push({from:[r,c],to:capL, cap:midL});
          if (inside(...capR) && board[midR[0]][midR[1]]==='P' && board[capR[0]][capR[1]]==='') moves.push({from:[r,c],to:capR, cap:midR});
        }
      }
    }
    if (moves.length===0) { over = true; events.onWin && events.onWin(); return; }
    const mv = moves[Math.floor(Math.random()*moves.length)];
    const [fr,fc] = mv.from, [tr,tc]=mv.to;
    board[tr][tc]='A'; board[fr][fc]=''; if (mv.cap) board[mv.cap[0]][mv.cap[1]]='';
    playerTurn = true;
    render();
  }

  function inside(r,c){ return r>=0 && r<size && c>=0 && c<size; }

  cont.appendChild(grid);
  root.appendChild(cont);
  render();
  checkers = { root: cont };
}
function destroyCheckers() { if (checkers) { checkers.root.remove(); checkers = null; } }

// 5) Gomoku (5 in a row) on 11x11
let gomoku = null;
function initGomoku(root, events) {
  const N = 11;
  const cont = document.createElement('div');
  cont.className = 'gomoku';
  const grid = document.createElement('div');
  grid.className = 'board';
  grid.style.gridTemplateColumns = `repeat(${N}, 1fr)`;

  let board = Array.from({length:N*N}, ()=>''), over=false;

  function render() {
    grid.innerHTML='';
    board.forEach((v, i)=>{
      const b = document.createElement('button');
      b.className = 'cell';
      b.style.width='min(9vw,44px)'; b.style.height='min(9vw,44px)';
      b.textContent = v==='X'?'❌': v==='O'?'⭕':'';
      b.addEventListener('click', ()=>move(i));
      grid.appendChild(b);
    });
  }

  function move(i) {
    if (over || board[i]) return;
    board[i] = 'X';
    events.onPlay && events.onPlay();
    if (checkWin('X')) { over=true; events.onWin && events.onWin(); render(); return; }
    aiMove();
    if (checkWin('O')) { over=true; render(); return; }
    render();
  }

  function aiMove() {
    // bad AI: random adjacent to any O if possible, otherwise random empty
    const empties = board.map((v,i)=>v?null:i).filter(v=>v!==null);
    let choices = empties.filter(i=>neighbors(i).some(j=>board[j]==='O'));
    if (choices.length===0) choices = empties;
    if (choices.length>0) board[choices[Math.floor(Math.random()*choices.length)]]='O';
  }

  function neighbors(i){
    const r = Math.floor(i/N), c = i%N;
    const ds = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]];
    return ds.map(([dr,dc])=>[r+dr,c+dc]).filter(([rr,cc])=>rr>=0&&rr<N&&cc>=0&&cc<N).map(([rr,cc])=>rr*N+cc);
  }

  function checkWin(p) {
    const dirs = [[1,0],[0,1],[1,1],[1,-1]];
    for (let r=0;r<N;r++){
      for (let c=0;c<N;c++){
        for (const [dr,dc] of dirs){
          let ok=true;
          for (let k=0;k<5;k++){
            const rr=r+dr*k, cc=c+dc*k;
            if (rr<0||cc<0||rr>=N||cc>=N||board[rr*N+cc]!==p){ ok=false; break; }
          }
          if (ok) return true;
        }
      }
    }
    return false;
  }

  cont.appendChild(grid);
  root.appendChild(cont);
  render();
  gomoku = { root: cont };
}
function destroyGomoku(){ if (gomoku) { gomoku.root.remove(); gomoku=null; } }
