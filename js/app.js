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
  const LEVEL_NAME = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
  const LEVELS = ['easy', 'medium', 'hard'];
  const THINK_MS = { medium: 3000, hard: 5000 };   // thinking budgets per move
  // Levels were renumbered when the old Easy was dropped; map names saved by earlier versions.
  const LEGACY_LEVEL = { easy: 'easy', medium: 'easy', hard: 'medium', expert: 'hard' };
  const MIN_THINK_MS = 450;                        // so the computer's reply doesn't feel instantaneous
  const FORCED_DELAY_MS = 170;
  const LBL = 46;                                  // coordinate gutter, in board units (a cell is 100)

  const $ = id => document.getElementById(id);
  const svg = $('board');

  // ---------------------------------------------------------------- settings
  const DEFAULTS = { control: 'arrows', forced: 'animated', sound: true, coords: true, white: 'human', red: 'medium',
    randomColours: false, variant: 'standard', version: 2 };
  const settings = Object.assign({}, DEFAULTS, migrateSettings(load('trax.settings')));
  function load(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } }
  const saveSettings = () => save('trax.settings', settings);

  // Settings from before players could be human or computer on either side.
  function migrateSettings(old) {
    if (!old) return {};
    if (old.version >= 2) return old;
    const out = Object.assign({}, old, { version: 2 });
    const lvl = LEGACY_LEVEL[old.level] || 'medium';
    if (old.color === '1') { out.white = lvl; out.red = 'human'; }
    else { out.white = 'human'; out.red = lvl; }
    out.randomColours = old.color === 'random';
    delete out.color; delete out.level;
    return out;
  }

  // A player spec is 'human' or a level name.
  const isHuman = p => p === 'human';
  const roleName = p => (isHuman(p) ? 'Human' : `CPU · ${LEVEL_NAME[p]}`);   // compact, for the sidebar selectors

  // ---------------------------------------------------------------- state
  let game = new E.Game('standard');
  let players = ['human', 'medium'];   // [White, Red]
  let paused = false;                  // computer moves held (only offered when a computer is playing)
  // Lines of play: every continuation tried in this game. `game` is always lines[active];
  // `from` is how many opening moves a line shares with the line it branched from.
  let lines = [{ moves: [], from: 0 }];
  let active = 0;
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

  // UI level -> search routine in ai.js.
  const AI_LEVEL = { easy: 'easy', medium: 'medium', hard: 'hard' };

  function requestAIMove() {
    const id = ++aiToken;
    const msg = { id, variant: game.variant, tiles: game.board.tiles(), notations: game.moves.map(m => m.notation),
      color: game.toMove, level: AI_LEVEL[players[game.toMove]], timeMs: THINK_MS[players[game.toMove]] || 3000 };
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
    return view === null && !busy && !game.result && isHuman(players[game.toMove]);
  }
  const humanCount = () => players.filter(isHuman).length;
  const computerToMove = () => !game.result && !isHuman(players[game.toMove]);

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
      const w = game.result.winner;
      // Lose sound only when exactly one human is playing and the computer won.
      if (w >= 0 && humanCount() === 1 && !isHuman(players[w])) TraxSound.lose();
      else if (w >= 0) TraxSound.win();
      return;
    }
    maybeStartAI();
  }

  // Start the computer if it is its turn and nothing is holding it back.
  function maybeStartAI() {
    if (computerToMove() && !paused && !thinking && !busy && view === null) startAI();
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
    if (id !== aiToken || !thinking) return;
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
    players = opts.players.slice();
    paused = false;
    game = new E.Game(opts.variant);
    lines = [{ moves: [], from: 0 }]; active = 0;
    resetView();
    afterMove();
  }

  // ---------------------------------------------------------------- lines of play
  const notationsOf = g => g.moves.map(m => m.notation);
  // "2. B0+" (White's 2nd move) / "2… C1+" (Red's): the position after `k` moves of `moves`.
  const moveRef = (moves, k) => `${Math.ceil(k / 2)}${k % 2 ? '.' : '…'} ${moves[k - 1] || ''}`;
  const isPrefix = (a, b) => a.length <= b.length && a.every((m, i) => m === b[i]);

  // Drop lines that add nothing: any non-active line that is a prefix of (or equal to) another.
  function pruneLines() {
    lines[active].moves = notationsOf(game);
    const keep = lines.filter((l, i) => i === active ||
      !lines.some((o, j) => j !== i && isPrefix(l.moves, o.moves) && (o.moves.length > l.moves.length || j < i || j === active)));
    active = keep.indexOf(lines[active]);
    lines = keep;
  }

  // "Play from here": continue from the reviewed position, keeping the current line.
  function playFromHere() {
    if (view === null) return;
    const k = view;
    cancelAI();
    lines[active].moves = notationsOf(game);
    const prefix = lines[active].moves.slice(0, k);
    // If another line already continues from exactly here and is just this prefix, reuse it.
    let idx = lines.findIndex(l => l.moves.length === k && isPrefix(l.moves, prefix));
    if (idx < 0) { lines.push({ moves: prefix, from: k }); idx = lines.length - 1; }
    active = idx;
    game = E.Game.replay(game.variant, prefix).game;
    resetView();
    pruneLines();
    saveGame();
    toast(k ? `New line after ${moveRef(prefix, k)} – the previous line is kept under Moves` : 'New line from the start – the previous line is kept under Moves');
    maybeStartAI();
  }

  function switchLine(i) {
    if (i === active || !lines[i]) return;
    cancelAI();
    lines[active].moves = notationsOf(game);
    active = i;
    game = E.Game.replay(game.variant, lines[i].moves).game;
    resetView();
    pruneLines();
    if (humanCount() === 0) paused = true;      // don't let the computer run off with a line you just opened
    saveGame();
    maybeStartAI();
  }

  function dropLine() {
    if (lines.length < 2) return;
    cancelAI();
    lines.splice(active, 1);
    active = Math.min(active, lines.length - 1);
    if (lines.length === 1) lines[0].from = 0;     // nothing left to branch from
    game = E.Game.replay(game.variant, lines[active].moves).game;
    resetView();
    if (humanCount() === 0) paused = true;
    saveGame();
    maybeStartAI();
  }

  const lineResults = new Map();         // "variant|moves" -> result, so labels don't replay every redraw
  function lineResult(l, i) {
    if (i === active) return game.result;
    const k = game.variant + '|' + l.moves.join(' ');
    if (!lineResults.has(k)) lineResults.set(k, E.Game.replay(game.variant, l.moves).game.result);
    return lineResults.get(k);
  }

  function lineLabel(l, i) {
    const n = l.moves.length;
    let tail = '';
    const res = lineResult(l, i);
    if (res) tail = res.winner < 0 ? ' · draw' : ` · ${COLOR_NAME[res.winner]} won`;
    const from = l.from ? ` · after ${moveRef(l.moves, l.from)}` : ' · original';
    return `Line ${i + 1}${from} · ${n} move${n === 1 ? '' : 's'}${tail}`;
  }

  // Change who plays a colour, mid-game or not.
  function setPlayer(color, spec) {
    if (players[color] === spec) return;
    const wasThinkingForThis = thinking && game.toMove === color;
    players[color] = spec;
    if (wasThinkingForThis) { cancelAI(); busy = false; }     // restart with the new level / hand to the human
    if (humanCount() > 0 && !computerToMove()) paused = false;
    sel = null; hover = null;
    saveGame();
    maybeStartAI();
  }

  function resetView() {
    view = null; reviewGame = null; sel = null; hover = null; busy = false;
    hidden = new Set(); fresh = new Set();
    invalidate();
  }

  // Can undo: with humans playing, back to before the last human move; computer only, one move.
  function undoTarget() {
    const n = game.moves.length;
    if (!n) return -1;
    if (humanCount() === 0) return n - 1;
    for (let i = n - 1; i >= 0; i--) if (isHuman(players[i % 2])) return i;
    return -1;
  }

  function undo() {
    const k = undoTarget();
    if (k < 0) return;
    cancelAI();
    if (humanCount() === 0) paused = true;    // otherwise the computer would just replay the move
    game = E.Game.replay(game.variant, game.moves.slice(0, k).map(m => m.notation)).game;
    resetView();
    saveGame();
    maybeStartAI();
  }

  function setView(k) {
    if (k !== null && k >= game.moves.length) k = null;
    // Reviewing while the computer plays both sides: hold its moves until you return.
    if (k !== null && humanCount() === 0 && !game.result && !paused) { cancelAI(); busy = false; paused = true; }
    view = k;
    sel = null; hover = null;
    reviewGame = k === null ? null : E.Game.replay(game.variant, game.moves.slice(0, k).map(m => m.notation)).game;
    if (reviewGame && k === game.moves.length) reviewGame.result = game.result;
    if (k === null) maybeStartAI(); else renderAll();
  }

  function saveGame() {
    lines[active].moves = notationsOf(game);
    save('trax.game', { version: 3, variant: game.variant, players, paused, moves: lines[active].moves,
      lines: lines.map(l => ({ moves: l.moves, from: l.from })), active });
  }

  function restoreGame() {
    const s = load('trax.game');
    if (!s || !Array.isArray(s.moves)) return false;
    const r = E.Game.replay(s.variant || 'standard', s.moves);
    if (r.error) return false;
    game = r.game;
    if (s.version >= 2 && Array.isArray(s.players)) {
      players = s.players.map(p => (isHuman(p) || LEVEL_NAME[p] ? p : 'medium'));
      paused = !!s.paused;
    } else {                                    // saved by an earlier version: one human vs one computer
      const lvl = LEGACY_LEVEL[s.level] || 'medium';
      players = s.human === RED ? [lvl, 'human'] : ['human', lvl];
    }
    lines = [{ moves: notationsOf(game), from: 0 }]; active = 0;
    if (s.version >= 3 && Array.isArray(s.lines) && s.lines[s.active]) {
      const ok = s.lines.filter(l => Array.isArray(l.moves) && !E.Game.replay(game.variant, l.moves).error)
        .map(l => ({ moves: l.moves.slice(), from: Math.max(0, Math.min(l.from | 0, l.moves.length)) }));
      const a = ok.findIndex(l => l.moves.join(' ') === s.moves.join(' '));
      if (a >= 0) { lines = ok; active = a; }
    }
    resetView();
    return true;
  }

  // ---------------------------------------------------------------- sidebar
  function renderStatus() {
    const res = game.result;
    for (const [c, id] of [[WHITE, 'roleWhite'], [RED, 'roleRed']]) {
      const el = $(id);
      if (el.value !== players[c]) el.value = players[c];
    }
    $('pWhite').classList.toggle('active', !res && game.toMove === WHITE);
    $('pRed').classList.toggle('active', !res && game.toMove === RED);
    $('pWhite').classList.toggle('winner', !!res && res.winner === WHITE);
    $('pRed').classList.toggle('winner', !!res && res.winner === RED);

    const st = $('status');
    st.classList.toggle('result', !!res);
    const humans = humanCount();
    const toMove = game.toMove, name = COLOR_NAME[toMove];
    let msg, hint = '';
    if (res) {
      if (res.winner < 0) msg = 'Draw — no legal moves remain.';
      else {
        const how = `with a ${res.kind === 'loop' ? 'loop' : 'line'}`;
        if (humans === 1) msg = `${isHuman(players[res.winner]) ? 'You win' : 'Computer wins'} ${how}! (${COLOR_NAME[res.winner]})`;
        else msg = `${COLOR_NAME[res.winner]} wins ${how}!`;
      }
    } else if (thinking) {
      msg = `<span class="spinner"></span> ${humans ? 'Computer' : name} is thinking…`;
    } else if (paused && computerToMove()) {
      msg = `Paused — ${name} (computer) to move.`;
    } else if (isHuman(players[toMove])) {
      const who = humans === 2 ? `${name} to move` : 'Your move';
      msg = game.moves.length === 0 ? `${who} — place the first tile.` : `${who}.`;
      hint = settings.control === 'arrows'
        ? (sel ? 'Rotate with ⟲ ⟳ or ← →, then click the tile or press Enter' : 'Click an empty space to place a tile')
        : (sel ? 'Left-click to cycle tiles, right-click to place' : 'Left-click an empty space to choose a tile');
    } else msg = '';
    if (game.board.rules.limit) msg += ` <span class="muted">· ${game.board.count}/64 tiles</span>`;
    st.innerHTML = msg;
    $('hint').textContent = view === null ? hint : '';

    const bp = $('btnPause');
    bp.hidden = !(humans === 0 || paused) || !!res;
    bp.textContent = paused ? 'Resume' : 'Pause';

    const short = p => (isHuman(p) ? 'Human' : LEVEL_NAME[p]);
    $('gameLabel').textContent = `${E.VARIANTS[game.variant].label} · White: ${short(players[WHITE])} · Red: ${short(players[RED])}`;
    $('btnUndo').disabled = undoTarget() < 0 || (busy && !thinking);

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
    renderLines();
    if (!ms.length) { h.innerHTML = '<div class="empty">No moves yet.</div>'; return; }
    const from = lines.length > 1 ? lines[active].from : 0;   // moves before this are shared with the parent line
    const cur = view === null ? ms.length : view;
    let s = '<table><thead><tr><th></th><th>White</th><th>Red</th></tr></thead><tbody>';
    for (let i = 0; i < ms.length; i += 2) {
      const branchRow = from > 0 && Math.floor(from / 2) === i / 2 && from % 2 === 0;
      s += `<tr${branchRow ? ' class="branch-start" title="This line branches here"' : ''}><td class="num">${i / 2 + 1}.</td>`;
      for (const j of [i, i + 1]) {
        if (j < ms.length) s += `<td class="mv${j + 1 === cur ? ' current' : ''}${j < from ? ' shared' : ''}" data-k="${j + 1}" title="${j < from ? 'Shared with the line this one branched from. ' : ''}${ms[j].placed.length > 1 ? (ms[j].placed.length - 1) + ' forced tile(s)' : ''}">${escapeHtml(ms[j].notation)}</td>`;
        else s += '<td></td>';
      }
      s += '</tr>';
    }
    h.innerHTML = s + '</tbody></table>';
    const curEl = h.querySelector('.current');
    if (curEl) curEl.scrollIntoView({ block: 'nearest' });
  }
  function renderLines() {
    const row = $('linesRow');
    row.hidden = lines.length < 2;
    if (lines.length < 2) return;
    const sel = $('lineSelect');
    sel.innerHTML = lines.map((l, i) => `<option value="${i}">${escapeHtml(lineLabel(l, i))}</option>`).join('');
    sel.value = String(active);
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
    const out = [
      `[Trax] ${E.VARIANTS[game.variant].label}`,
      `[White] ${isHuman(players[WHITE]) ? 'Human' : 'Computer (' + LEVEL_NAME[players[WHITE]] + ')'}`,
      `[Red] ${isHuman(players[RED]) ? 'Human' : 'Computer (' + LEVEL_NAME[players[RED]] + ')'}`,
    ];
    if (lines.length > 1 && lines[active].from) out.push(`[Line] ${active + 1} of ${lines.length}, branched after move ${lines[active].from}`);
    if (game.result) out.push(`[Result] ${game.result.winner < 0 ? 'Draw' : COLOR_NAME[game.result.winner] + ' wins (' + game.result.kind + ')'}`);
    out.push('');
    const ms = game.moves;
    for (let i = 0; i < ms.length; i += 2) out.push(`${i / 2 + 1}. ${ms[i].notation}${ms[i + 1] ? ' ' + ms[i + 1].notation : ''}`);
    return out.join('\n');
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
    lines = [{ moves: notationsOf(game), from: 0 }]; active = 0;
    resetView();
    toast(`Loaded ${tokens.length} moves`);
    afterMove();
  });

  // ---------------------------------------------------------------- dialogs & options
  function openNewDialog() {
    const f = $('formNew');
    f.white.value = settings.white; f.red.value = settings.red; f.variant.value = settings.variant;
    $('randomColours').checked = !!settings.randomColours;
    $('dlgNew').showModal();
  }
  $('btnNew').addEventListener('click', openNewDialog);
  $('btnSwap').addEventListener('click', () => {
    const f = $('formNew');
    const w = f.white.value; f.white.value = f.red.value; f.red.value = w;
  });
  $('dlgNew').addEventListener('close', () => {
    if ($('dlgNew').returnValue !== 'start') return;
    const f = $('formNew');
    settings.white = f.white.value; settings.red = f.red.value; settings.variant = f.variant.value;
    settings.randomColours = $('randomColours').checked;
    saveSettings();
    let ps = [settings.white, settings.red];
    if (settings.randomColours && Math.random() < 0.5) ps = [ps[1], ps[0]];
    newGame({ players: ps, variant: settings.variant });
  });
  $('btnRules').addEventListener('click', () => $('dlgRules').showModal());
  $('btnBackToGame').addEventListener('click', () => setView(null));
  $('btnPlayHere').addEventListener('click', playFromHere);
  $('lineSelect').addEventListener('change', e => switchLine(+e.target.value));
  // Discarding a line takes two clicks: the first arms the button for a few seconds.
  $('btnDropLine').addEventListener('click', () => {
    const b = $('btnDropLine');
    if (!b.classList.contains('confirm')) {
      b.classList.add('confirm'); b.textContent = 'Discard?';
      clearTimeout(b._t); b._t = setTimeout(() => { b.classList.remove('confirm'); b.textContent = '✕'; }, 3000);
      return;
    }
    clearTimeout(b._t); b.classList.remove('confirm'); b.textContent = '✕';
    dropLine();
    toast('Line discarded');
  });
  $('btnUndo').addEventListener('click', undo);
  $('btnPause').addEventListener('click', () => {
    if (paused) { paused = false; if (view !== null) { view = null; reviewGame = null; } maybeStartAI(); }
    else { paused = true; if (thinking) { cancelAI(); busy = false; } saveGame(); renderAll(); }
  });

  // Player selectors beside White and Red.
  for (const [c, id] of [[WHITE, 'roleWhite'], [RED, 'roleRed']]) {
    const el = $(id);
    el.innerHTML = ['human'].concat(LEVELS).map(p => `<option value="${p}">${roleName(p)}</option>`).join('');
    el.addEventListener('change', () => setPlayer(c, el.value));
  }

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
  saveSettings();                       // persists any migration of old settings
  if (restoreGame()) {
    maybeStartAI();
  } else {
    players = [settings.white, settings.red];
    game = new E.Game(settings.variant);
    renderAll();
    openNewDialog();
  }

  // Exposed for debugging / automated tests.
  window.trax = { get lastAI() { return lastAI; }, get game() { return game; }, get players() { return players; },
    get human() { return players.findIndex(isHuman); }, get lines() { return lines; }, get active() { return active; }, get busy() { return busy; }, get paused() { return paused; }, E };
})();
