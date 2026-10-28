/*
 * Trax – user interface: board rendering, tile placement, computer turns, history, settings.
 */
(() => {
  'use strict';

  const E = TraxEngineModule();
  const { TILES, COLOR_EDGES, WHITE, RED } = E;
  const COLOR_NAME = ['White', 'Red'];
  const TRACK = ['#f3efe6', '#d4373a'];
  const TILE_BG = '#17171a';
  const OPTION_ORDER = [0, 1, 2, 4, 3, 5];        // cycle order for the ghost tile: straights, then curves clockwise
  const LEVEL_NAME = { easy: 'Easy', medium: 'Medium', hard: 'Hard', expert: 'Expert' };
  const THINK_MS = { hard: 3000, expert: 5000 };   // thinking budgets per move
  const MIN_THINK_MS = 450;                        // so the computer's reply doesn't feel instantaneous
  const FORCED_DELAY_MS = 170;
  const LBL = 46;                                  // coordinate gutter, in board units (a cell is 100)

  const $ = id => document.getElementById(id);
  const svg = $('board');

  // ---------------------------------------------------------------- settings
  const DEFAULTS = { control: 'arrows', forced: 'animated', sound: true, coords: true, color: '0', level: 'medium', variant: 'standard' };
  const settings = Object.assign({}, DEFAULTS, load('trax.settings') || {});
  function load(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } }
  const saveSettings = () => save('trax.settings', settings);

  // ---------------------------------------------------------------- state
  let game = new E.Game('standard');
  let human = WHITE;
  let level = 'medium';
  let view = null;              // null = live game; k = reviewing the position after k moves
  let reviewGame = null;
  let sel = null;               // {x, y, opts, idx}
  let hover = null;             // {x, y, opts}
  let busy = false;             // animating or computer thinking
  let thinking = false;
  let hidden = new Set();       // tiles placed in the engine but not yet revealed (forced-play animation)
  let fresh = new Set();        // tiles to animate on this render
  let legalCache = null;        // Map key -> legal tiles, for the live position
  let aiToken = 0;
  let geom = null;              // current board geometry for event mapping

  // ---------------------------------------------------------------- computer opponent (Web Worker)
  let worker = null;
  function makeWorker() {
    try {
      const analystSrc = typeof TraxAnalystModule === 'function' ? TraxAnalystModule.toString() : 'function TraxAnalystModule() { return null; }';
      const src = `${TraxEngineModule.toString()}\n${TraxAIModule.toString()}\n${analystSrc}\n` +
        `const E = TraxEngineModule(); const AI = TraxAIModule(E);\n` +
        `let Analyst = null; try { Analyst = TraxAnalystModule(); } catch (e) { Analyst = null; }\n` +
        `onmessage = ev => { const d = ev.data; const b = new E.Board(d.variant);\n` +
        `  for (const [x, y, t] of d.tiles) b._put(x, y, t);\n` +
        `  const r = AI.chooseMove(b, d.color, d.level, d.timeMs, { analyst: Analyst, notations: d.notations });\n` +
        `  postMessage({ id: d.id, result: r }); };`;
      const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      const w = new Worker(url);
      w.onmessage = ev => onAIResult(ev.data.id, ev.data.result);
      w.onerror = () => { worker = null; };
      return w;
    } catch {
      return null;   // fall back to thinking on the main thread
    }
  }
  worker = makeWorker();
  const localAI = TraxAIModule(E);
  let localAnalyst = null;
  try { localAnalyst = typeof TraxAnalystModule === 'function' ? TraxAnalystModule() : null; } catch (e) { localAnalyst = null; }

  function requestAIMove() {
    const id = ++aiToken;
    const msg = { id, variant: game.variant, tiles: game.board.tiles(), notations: game.moves.map(m => m.notation),
      color: game.toMove, level, timeMs: THINK_MS[level] || 3000 };
    if (worker) worker.postMessage(msg);
    else setTimeout(() => {
      const b = new E.Board(msg.variant);
      for (const [x, y, t] of msg.tiles) b._put(x, y, t);
      onAIResult(id, localAI.chooseMove(b, msg.color, msg.level, msg.timeMs, { analyst: localAnalyst, notations: msg.notations }));
    }, 30);
    return id;
  }

  function cancelAI() {
    aiToken++;
    if (thinking && worker) { worker.terminate(); worker = makeWorker(); }
    thinking = false;
  }

  // ---------------------------------------------------------------- tile drawing
  const MID = [[50, 0], [100, 50], [50, 100], [0, 50]];
  function segPath(a, b) {
    const [sx, sy] = MID[a], [ex, ey] = MID[b];
    if ((a + b) % 2 === 0) return `M${sx} ${sy}L${ex} ${ey}`;
    const v = (a % 2) ? a : b, h = (a % 2) ? b : a;
    const cx = MID[v][0], cy = MID[h][1];
    const sweep = (sx - cx) * (ey - cy) - (sy - cy) * (ex - cx) > 0 ? 1 : 0;
    return `M${sx} ${sy}A50 50 0 0 ${sweep} ${ex} ${ey}`;
  }
  const trackPath = (t, c) => segPath(COLOR_EDGES[t][c][0], COLOR_EDGES[t][c][1]);

  function tileInner(t) {
    const ed = TILES[t].edges;
    let s = `<rect x="2" y="2" width="96" height="96" rx="8" fill="${TILE_BG}"/>`;
    if (TILES[t].type === '+') {
      const under = ed[1], over = ed[0];      // the vertical track bridges over the horizontal one
      s += `<path d="${trackPath(t, under)}" stroke="${TRACK[under]}" stroke-width="18" fill="none"/>`;
      s += `<path d="M50 22V78" stroke="${TILE_BG}" stroke-width="28" fill="none"/>`;
      s += `<path d="${trackPath(t, over)}" stroke="${TRACK[over]}" stroke-width="18" fill="none"/>`;
    } else {
      for (const c of [WHITE, RED]) s += `<path d="${trackPath(t, c)}" stroke="${TRACK[c]}" stroke-width="18" fill="none"/>`;
    }
    return s;
  }

  // ---------------------------------------------------------------- helpers
  const shown = () => (view === null ? game : reviewGame);
  const key = (x, y) => E.key(x, y);
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function canInteract() {
    return view === null && !busy && !game.result && game.toMove === human;
  }

  function legalMap() {
    if (legalCache) return legalCache;
    const m = new Map();
    const b = game.board;
    for (const [x, y] of b.frontier()) {
      const opts = b.legalTilesAt(x, y).sort((p, q) => OPTION_ORDER.indexOf(p) - OPTION_ORDER.indexOf(q));
      if (opts.length) m.set(key(x, y), opts);
    }
    legalCache = m;
    return m;
  }
  const invalidate = () => { legalCache = null; };

  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => el.classList.remove('show'), 1800);
  }

  // ---------------------------------------------------------------- board rendering
  function renderBoard() {
    const g = shown();
    const b = g.board;
    const empty = b.count === 0;
    const x0 = empty ? 0 : b.minX - 1, x1 = empty ? 0 : b.maxX + 1;
    const y0 = empty ? 0 : b.minY - 1, y1 = empty ? 0 : b.maxY + 1;
    const cols = x1 - x0 + 1, rows = y1 - y0 + 1;
    const gut = settings.coords ? LBL : 6;

    const wrap = $('boardScroll');
    const availW = wrap.clientWidth - 40, availH = wrap.clientHeight - 70;
    const PAD = 34;                       // room for the ghost tile's buttons at the far edges
    const unitsW = cols * 100 + gut + PAD, unitsH = rows * 100 + gut + PAD;
    let cell = Math.floor(Math.min(availW / unitsW, availH / unitsH) * 100);
    cell = Math.max(30, Math.min(empty ? 110 : 88, cell));
    const scale = cell / 100;

    const vx = x0 * 100 - gut, vy = y0 * 100 - gut;
    svg.setAttribute('viewBox', `${vx} ${vy} ${unitsW} ${unitsH}`);
    svg.setAttribute('width', Math.round(unitsW * scale));
    svg.setAttribute('height', Math.round(unitsH * scale));
    geom = { x0, y0, x1, y1 };

    const parts = [];

    if (settings.coords) {
      // Labels follow standard notation: '@' / '0' is the empty column/row just outside the tiles.
      for (let x = x0; x <= x1; x++) parts.push(`<text class="coord" x="${x * 100 + 50}" y="${y0 * 100 - gut / 2}">${E.colName(x - x0)}</text>`);
      for (let y = y0; y <= y1; y++) parts.push(`<text class="coord" x="${x0 * 100 - gut / 2}" y="${y * 100 + 50}">${y - y0}</text>`);
    }

    // 8×8: once the board reaches full width/height, mark the boundary.
    if (b.rules.limit && !empty) {
      const lim = b.rules.limit;
      if (b.width >= lim) for (const x of [b.minX, b.maxX + 1]) parts.push(`<line class="limit-frame" x1="${x * 100}" x2="${x * 100}" y1="${y0 * 100}" y2="${(y1 + 1) * 100}"/>`);
      if (b.height >= lim) for (const y of [b.minY, b.maxY + 1]) parts.push(`<line class="limit-frame" y1="${y * 100}" y2="${y * 100}" x1="${x0 * 100}" x2="${(x1 + 1) * 100}"/>`);
    }

    for (const [x, y, t] of b.tiles()) {
      const k = key(x, y);
      if (view === null && hidden.has(k)) continue;
      const drop = view === null && fresh.has(k) ? ' drop' : '';
      parts.push(`<g transform="translate(${x * 100} ${y * 100})"><g class="tile-g${drop}">${tileInner(t)}</g></g>`);
    }

    // Last move markers.
    const lastMove = g.moves[g.moves.length - 1];
    if (lastMove && (view !== null || hidden.size === 0)) {
      lastMove.placed.forEach(([x, y], i) => {
        parts.push(i === 0
          ? `<rect class="last-primary" x="${x * 100 + 4}" y="${y * 100 + 4}" width="92" height="92" rx="8"/>`
          : `<rect class="last-forced" x="${x * 100 + 6}" y="${y * 100 + 6}" width="88" height="88" rx="8"/>`);
      });
    }

    // Winning path.
    if (g.result && g.result.cells && g.result.cells.length && hidden.size === 0) {
      const c = g.result.winner;
      for (const [x, y] of g.result.cells) {
        const t = b.get(x, y);
        if (t >= 0) parts.push(`<path class="win-glow" transform="translate(${x * 100} ${y * 100})" d="${trackPath(t, c)}" stroke-width="7"/>`);
      }
    }

    // Click targets for legal empty cells.
    if (canInteract()) {
      if (empty) parts.push(`<rect class="cell-target legal first" data-x="0" data-y="0" x="4" y="4" width="92" height="92" rx="8"/>`);
      else for (const k of legalMap().keys()) {
        const x = E.keyX(k), y = E.keyY(k);
        parts.push(`<rect class="cell-target legal" data-x="${x}" data-y="${y}" x="${x * 100 + 4}" y="${y * 100 + 4}" width="92" height="92" rx="8"/>`);
      }
    }
    parts.push('<g id="ghostLayer"></g>');
    svg.innerHTML = parts.join('');
    svg.classList.toggle('board-locked', !canInteract());
    fresh = new Set();
    renderGhost();
  }

  function renderGhost() {
    const layer = document.getElementById('ghostLayer');
    if (!layer) return;
    if (!canInteract()) { layer.innerHTML = ''; return; }
    let s = '';
    if (sel) {
      const { x, y, opts, idx } = sel;
      s += `<g class="ghost selected" data-role="ghost" transform="translate(${x * 100} ${y * 100})">${tileInner(opts[idx])}` +
           `<rect class="ghost-frame" x="2" y="2" width="96" height="96" rx="8"/></g>`;
      if (settings.control === 'arrows') {
        const one = opts.length < 2 ? ' disabled' : '';
        s += ctrlButton('prev', x * 100 - 6, y * 100 + 50, '⟲', one);
        s += ctrlButton('next', x * 100 + 106, y * 100 + 50, '⟳', one);
        s += ctrlButton('ok', x * 100 + 50, y * 100 + 106, '✓', '');
      }
    } else if (hover) {
      s += `<g class="ghost" transform="translate(${hover.x * 100} ${hover.y * 100})">${tileInner(hover.opts[0])}</g>`;
    }
    layer.innerHTML = s;
  }
  const ctrlButton = (act, cx, cy, glyph, extra) =>
    `<g class="ctrl${extra}" data-act="${act}"><circle cx="${cx}" cy="${cy}" r="21"/><text x="${cx}" y="${cy + 1}">${glyph}</text></g>`;

  function optsAt(x, y) {
    if (game.board.count === 0) return (x === 0 && y === 0) ? E.FIRST_TILES.slice() : null;
    return legalMap().get(key(x, y)) || null;
  }

  // ---------------------------------------------------------------- input
  svg.addEventListener('pointerover', e => {
    if (!canInteract()) return;
    const tgt = e.target.closest('.cell-target');
    if (!tgt) return;
    const x = +tgt.dataset.x, y = +tgt.dataset.y;
    if (hover && hover.x === x && hover.y === y) return;
    const opts = optsAt(x, y);
    hover = opts ? { x, y, opts } : null;
    renderGhost();
  });
  svg.addEventListener('pointerout', e => {
    const tgt = e.target.closest('.cell-target');
    if (tgt && !(e.relatedTarget && tgt.contains(e.relatedTarget))) { hover = null; renderGhost(); }
  });

  svg.addEventListener('click', e => {
    if (!canInteract()) return;
    const ctrl = e.target.closest('.ctrl');
    if (ctrl) {
      const act = ctrl.dataset.act;
      if (act === 'prev') cycle(-1); else if (act === 'next') cycle(1); else if (act === 'ok') confirm();
      return;
    }
    if (e.target.closest('[data-role="ghost"]')) {
      if (settings.control === 'arrows') confirm(); else cycle(1);
      return;
    }
    const tgt = e.target.closest('.cell-target');
    if (tgt) {
      const x = +tgt.dataset.x, y = +tgt.dataset.y;
      const opts = optsAt(x, y);
      if (!opts) return;
      sel = { x, y, opts, idx: 0 };
      hover = null;
      renderGhost();
      return;
    }
    if (sel) { sel = null; renderGhost(); }
  });

  svg.addEventListener('contextmenu', e => {
    e.preventDefault();
    if (!canInteract() || settings.control !== 'rightclick') return;
    if (sel && e.target.closest('[data-role="ghost"]')) confirm();
    else if (sel) { sel = null; renderGhost(); }
  });

  document.addEventListener('keydown', e => {
    if (document.querySelector('dialog[open]')) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
    if (sel && canInteract()) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); cycle(-1); }
      else if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); cycle(1); }
      else if (e.key === 'Enter') { e.preventDefault(); confirm(); }
      else if (e.key === 'Escape') { sel = null; renderGhost(); }
      return;
    }
    // History navigation when no tile is selected.
    const n = game.moves.length;
    if (e.key === 'ArrowLeft' && n) { e.preventDefault(); setView(view === null ? n - 1 : Math.max(0, view - 1)); }
    else if (e.key === 'ArrowRight' && view !== null) { e.preventDefault(); setView(view + 1 >= n ? null : view + 1); }
    else if (e.key === 'Escape' && view !== null) setView(null);
  });

  function cycle(d) {
    if (!sel || sel.opts.length < 2) return;
    sel.idx = (sel.idx + d + sel.opts.length) % sel.opts.length;
    renderGhost();
  }

  function confirm() {
    if (!sel || !canInteract()) return;
    const { x, y, opts, idx } = sel;
    sel = null; hover = null;
    playMove(x, y, opts[idx]);
  }

  // ---------------------------------------------------------------- playing moves
  async function playMove(x, y, t) {
    const mv = game.play(x, y, t);
    if (!mv) { toast('That move is not legal'); renderBoard(); return; }
    invalidate();
    await animateMove(mv);
    afterMove();
  }

  async function animateMove(mv) {
    busy = true;
    const keys = mv.placed.map(([x, y]) => key(x, y));
    TraxSound.place();
    if (settings.forced === 'animated' && keys.length > 1) {
      hidden = new Set(keys.slice(1));
      fresh = new Set([keys[0]]);
      renderAll();
      for (let i = 1; i < keys.length; i++) {
        await sleep(FORCED_DELAY_MS);
        hidden.delete(keys[i]);
        fresh = new Set([keys[i]]);
        renderBoard();
      }
    } else {
      hidden = new Set();
      fresh = new Set(keys);
      renderAll();
    }
    hidden = new Set();
    busy = false;
  }

  function afterMove() {
    saveGame();
    if (game.result) {
      renderAll();
      if (game.result.winner === human) TraxSound.win();
      else if (game.result.winner >= 0) TraxSound.lose();
      return;
    }
    if (game.toMove !== human) startAI();
    else renderAll();
  }

  function startAI() {
    busy = true;
    thinking = true;
    renderAll();
    const started = Date.now();
    const id = requestAIMove();
    startAI.pending = { id, started };
  }

  let lastAI = null;
  async function onAIResult(id, result) {
    if (id !== aiToken || !thinking) return;
    lastAI = result;
    const wait = MIN_THINK_MS - (Date.now() - startAI.pending.started);
    if (wait > 0) await sleep(wait);
    if (id !== aiToken) return;
    thinking = false;
    if (!result) { game.result = { winner: -1, kind: 'draw', cells: [] }; busy = false; renderAll(); return; }
    if (view !== null) { view = null; reviewGame = null; }
    const mv = game.play(...result.move);
    invalidate();
    if (!mv) { busy = false; renderAll(); return; }
    await animateMove(mv);
    afterMove();
  }

  // ---------------------------------------------------------------- game lifecycle
  function newGame(opts) {
    cancelAI();
    human = opts.color;
    level = opts.level;
    game = new E.Game(opts.variant);
    resetView();
    afterMove();
  }

  function resetView() {
    view = null; reviewGame = null; sel = null; hover = null; busy = false;
    hidden = new Set(); fresh = new Set();
    invalidate();
  }

  function undo() {
    const notes = game.moves.map(m => m.notation);
    if (!notes.some((_, i) => i % 2 === human)) return;
    cancelAI();
    let removedIdx;
    do { notes.pop(); removedIdx = notes.length; } while (removedIdx % 2 !== human);
    game = E.Game.replay(game.variant, notes).game;
    resetView();
    saveGame();
    renderAll();
  }

  function setView(k) {
    if (k !== null && k >= game.moves.length) k = null;
    view = k;
    sel = null; hover = null;
    reviewGame = k === null ? null : E.Game.replay(game.variant, game.moves.slice(0, k).map(m => m.notation)).game;
    if (reviewGame && k === game.moves.length) reviewGame.result = game.result;
    renderAll();
  }

  function saveGame() {
    save('trax.game', { variant: game.variant, human, level, moves: game.moves.map(m => m.notation), resigned: game.result && game.result.kind === 'resign' ? game.result : null });
  }

  function restoreGame() {
    const s = load('trax.game');
    if (!s || !Array.isArray(s.moves)) return false;
    const r = E.Game.replay(s.variant || 'standard', s.moves);
    if (r.error) return false;
    game = r.game; human = s.human === RED ? RED : WHITE; level = LEVEL_NAME[s.level] ? s.level : 'medium';
    resetView();
    return true;
  }

  // ---------------------------------------------------------------- sidebar
  function renderStatus() {
    const res = game.result;
    $('roleWhite').textContent = human === WHITE ? 'You' : `Computer · ${LEVEL_NAME[level]}`;
    $('roleRed').textContent = human === RED ? 'You' : `Computer · ${LEVEL_NAME[level]}`;
    $('pWhite').classList.toggle('active', !res && game.toMove === WHITE);
    $('pRed').classList.toggle('active', !res && game.toMove === RED);
    $('pWhite').classList.toggle('winner', !!res && res.winner === WHITE);
    $('pRed').classList.toggle('winner', !!res && res.winner === RED);

    const st = $('status');
    st.classList.toggle('result', !!res);
    let msg, hint = '';
    if (res) {
      if (res.winner < 0) msg = 'Draw — no legal moves remain.';
      else {
        const who = res.winner === human ? 'You win' : 'Computer wins';
        msg = `${who} with a ${res.kind === 'loop' ? 'loop' : 'line'}! (${COLOR_NAME[res.winner]})`;
      }
    } else if (thinking) {
      msg = '<span class="spinner"></span> Computer is thinking…';
    } else if (game.toMove === human) {
      msg = game.moves.length === 0 ? 'Your move — place the first tile.' : 'Your move.';
      hint = settings.control === 'arrows'
        ? (sel ? 'Rotate with ⟲ ⟳ or ← →, then click the tile or press Enter' : 'Click an empty space to place a tile')
        : (sel ? 'Left-click to cycle tiles, right-click to place' : 'Left-click an empty space to choose a tile');
    } else msg = '';
    if (game.board.rules.limit) msg += ` <span class="muted">· ${game.board.count}/64 tiles</span>`;
    st.innerHTML = msg;
    $('hint').textContent = view === null ? hint : '';

    $('gameLabel').textContent = `${E.VARIANTS[game.variant].label} · you play ${COLOR_NAME[human]} vs ${LEVEL_NAME[level]}`;
    $('btnUndo').disabled = !game.moves.some((_, i) => i % 2 === human) || (busy && !thinking);

    const rb = $('reviewBanner');
    rb.hidden = view === null;
    if (view !== null) {
      const m = game.moves[view - 1];
      $('reviewText').textContent = view === 0 ? 'Reviewing: start of game' : `Reviewing position after ${Math.ceil(view / 2)}${view % 2 ? '.' : '…'} ${m.notation}`;
    }
  }

  function renderHistory() {
    const h = $('history');
    const ms = game.moves;
    if (!ms.length) { h.innerHTML = '<div class="empty">No moves yet.</div>'; return; }
    const cur = view === null ? ms.length : view;
    const you = c => (c === human ? 'You' : 'CPU');
    let s = `<table><thead><tr><th></th><th>White · ${you(WHITE)}</th><th>Red · ${you(RED)}</th></tr></thead><tbody>`;
    for (let i = 0; i < ms.length; i += 2) {
      s += `<tr><td class="num">${i / 2 + 1}.</td>`;
      for (const j of [i, i + 1]) {
        if (j < ms.length) s += `<td class="mv${j + 1 === cur ? ' current' : ''}" data-k="${j + 1}" title="${ms[j].placed.length > 1 ? (ms[j].placed.length - 1) + ' forced tile(s)' : ''}">${escapeHtml(ms[j].notation)}</td>`;
        else s += '<td></td>';
      }
      s += '</tr>';
    }
    h.innerHTML = s + '</tbody></table>';
    const curEl = h.querySelector('.current');
    if (curEl) curEl.scrollIntoView({ block: 'nearest' });
  }
  const escapeHtml = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  $('history').addEventListener('click', e => {
    const td = e.target.closest('td.mv');
    if (!td) return;
    const k = +td.dataset.k;
    setView(k === game.moves.length ? null : k);
  });

  function renderAll() {
    renderStatus();
    renderHistory();
    renderBoard();
  }

  // ---------------------------------------------------------------- copy / load
  function gameRecord() {
    const lines = [
      `[Trax] ${E.VARIANTS[game.variant].label}`,
      `[White] ${human === WHITE ? 'You' : 'Computer (' + LEVEL_NAME[level] + ')'}`,
      `[Red] ${human === RED ? 'You' : 'Computer (' + LEVEL_NAME[level] + ')'}`,
    ];
    if (game.result) lines.push(`[Result] ${game.result.winner < 0 ? 'Draw' : COLOR_NAME[game.result.winner] + ' wins (' + game.result.kind + ')'}`);
    lines.push('');
    const ms = game.moves;
    for (let i = 0; i < ms.length; i += 2) lines.push(`${i / 2 + 1}. ${ms[i].notation}${ms[i + 1] ? ' ' + ms[i + 1].notation : ''}`);
    return lines.join('\n');
  }

  $('btnCopy').addEventListener('click', async () => {
    const text = gameRecord();
    try { await navigator.clipboard.writeText(text); toast('Game record copied'); }
    catch {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); toast('Game record copied'); } catch { toast('Copy failed'); }
      ta.remove();
    }
  });

  $('btnLoad').addEventListener('click', () => {
    $('loadText').value = '';
    $('loadError').textContent = '';
    $('loadVariant').value = game.variant;
    $('dlgLoad').showModal();
    $('loadText').focus();
  });
  $('btnLoadGo').addEventListener('click', e => {
    const text = $('loadText').value;
    const tokens = (text.match(/[@A-Za-z]+\d+[+\/\\]/g) || []).map(t => t.toUpperCase());
    if (!tokens.length) { e.preventDefault(); $('loadError').textContent = 'No moves found.'; return; }
    const r = E.Game.replay($('loadVariant').value, tokens);
    if (r.error) {
      e.preventDefault();
      $('loadError').textContent = `Move ${r.game.moves.length + 1} (${r.error}) is not legal in that position.`;
      return;
    }
    cancelAI();
    game = r.game;
    resetView();
    toast(`Loaded ${tokens.length} moves`);
    afterMove();
  });

  // ---------------------------------------------------------------- dialogs & options
  function openNewDialog() {
    const f = $('formNew');
    f.color.value = settings.color; f.level.value = settings.level; f.variant.value = settings.variant;
    $('dlgNew').showModal();
  }
  $('btnNew').addEventListener('click', openNewDialog);
  $('dlgNew').addEventListener('close', () => {
    if ($('dlgNew').returnValue !== 'start') return;
    const f = $('formNew');
    settings.color = f.color.value; settings.level = f.level.value; settings.variant = f.variant.value;
    saveSettings();
    const color = settings.color === 'random' ? (Math.random() < 0.5 ? WHITE : RED) : +settings.color;
    newGame({ color, level: settings.level, variant: settings.variant });
  });
  $('btnRules').addEventListener('click', () => $('dlgRules').showModal());
  $('btnBackToGame').addEventListener('click', () => setView(null));
  $('btnUndo').addEventListener('click', undo);

  const optControl = $('optControl'), optForced = $('optForced'), optSound = $('optSound'), optCoords = $('optCoords');
  optControl.value = settings.control; optForced.value = settings.forced;
  optSound.checked = settings.sound; optCoords.checked = settings.coords;
  TraxSound.setEnabled(settings.sound);
  optControl.addEventListener('change', () => { settings.control = optControl.value; saveSettings(); sel = null; renderAll(); });
  optForced.addEventListener('change', () => { settings.forced = optForced.value; saveSettings(); });
  optSound.addEventListener('change', () => { settings.sound = optSound.checked; TraxSound.setEnabled(settings.sound); saveSettings(); });
  optCoords.addEventListener('change', () => { settings.coords = optCoords.checked; saveSettings(); renderBoard(); });

  let resizeT;
  window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(renderBoard, 60); });

  // ---------------------------------------------------------------- start
  if (restoreGame()) {
    renderAll();
    if (!game.result && game.toMove !== human) startAI();
  } else {
    human = settings.color === '1' ? RED : WHITE;
    level = settings.level;
    game = new E.Game(settings.variant);
    renderAll();
    openNewDialog();
  }

  // Exposed for debugging / automated tests.
  window.trax = { get lastAI() { return lastAI; }, get game() { return game; }, get human() { return human; }, get busy() { return busy; }, E };
})();
