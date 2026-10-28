/*
 * Trax rules engine.
 *
 * Wrapped in a single function so the same source can run on the page and,
 * via Function.prototype.toString(), inside a Web Worker created from a Blob
 * (which keeps the AI working when the game is opened straight from disk).
 *
 * Coordinates: x grows to the right, y grows downward. The first tile sits at (0,0).
 * Edges: 0 = North, 1 = East, 2 = South, 3 = West.
 * Colours: 0 = White, 1 = Red.
 */
function TraxEngineModule() {
  'use strict';

  const WHITE = 0, RED = 1;
  const N = 0, E = 1, S = 2, W = 3;
  const DX = [0, 1, 0, -1];
  const DY = [-1, 0, 1, 0];
  const OPP = [2, 3, 0, 1];

  // Edge colours [N, E, S, W] for the six tile orientations.
  //  '+' : straights crossing.  '/' and '\' : curves (named for the diagonal
  //  joining the corners between the unconnected sides, per standard notation).
  const TILES = [
    { type: '+', edges: [WHITE, RED, WHITE, RED] },   // 0: white vertical
    { type: '+', edges: [RED, WHITE, RED, WHITE] },   // 1: white horizontal
    { type: '/', edges: [WHITE, RED, RED, WHITE] },   // 2: white curve N-W, red S-E
    { type: '/', edges: [RED, WHITE, WHITE, RED] },   // 3: white curve S-E, red N-W
    { type: '\\', edges: [WHITE, WHITE, RED, RED] },  // 4: white curve N-E, red S-W
    { type: '\\', edges: [RED, RED, WHITE, WHITE] },  // 5: white curve S-W, red N-E
  ];

  // EXIT[t][e] = the other edge of tile t that carries the same colour as edge e.
  const EXIT = TILES.map(tile => tile.edges.map((col, e) => {
    for (let f = 0; f < 4; f++) if (f !== e && tile.edges[f] === col) return f;
    return -1;
  }));
  // COLOR_EDGES[t][c] = the two edges of tile t carrying colour c.
  const COLOR_EDGES = TILES.map(tile => [0, 1].map(c => [0, 1, 2, 3].filter(e => tile.edges[e] === c)));

  // The two legal opening tiles (@0/ and @0+).
  const FIRST_TILES = [2, 0];

  const VARIANTS = {
    standard: { limit: 0, lines: true, label: 'Standard (unlimited)' },
    limited: { limit: 8, lines: true, label: '8×8' },
    loop: { limit: 0, lines: false, label: 'Loop Trax' },
  };

  const OFF = 2048;
  // Flat edge-colour table: TE[t*4 + edge].
  const TE = new Int8Array(24);
  TILES.forEach((tile, t) => tile.edges.forEach((c, e) => { TE[t * 4 + e] = c; }));
  // Scratch space reused by apply() (single-threaded, not re-entrant).
  const QUEUE = new Int32Array(4096);
  const COLS = new Int8Array(4);
  const key = (x, y) => (x + OFF) * 4096 + (y + OFF);
  const keyX = k => Math.floor(k / 4096) - OFF;
  const keyY = k => (k % 4096) - OFF;

  class Board {
    constructor(variant = 'standard') {
      this.variant = variant;
      this.rules = VARIANTS[variant] || VARIANTS.standard;
      this.cells = new Map();
      this.minX = 0; this.maxX = -1; this.minY = 0; this.maxY = -1;
      this.h1 = 0; this.h2 = 0;   // Zobrist-style position hash (used by the AI)
    }

    get count() { return this.cells.size; }
    get width() { return this.count ? this.maxX - this.minX + 1 : 0; }
    get height() { return this.count ? this.maxY - this.minY + 1 : 0; }

    get(x, y) { const t = this.cells.get(key(x, y)); return t === undefined ? -1 : t; }
    has(x, y) { return this.cells.has(key(x, y)); }

    clone() {
      const b = new Board(this.variant);
      b.cells = new Map(this.cells);
      b.minX = this.minX; b.maxX = this.maxX; b.minY = this.minY; b.maxY = this.maxY;
      b.h1 = this.h1; b.h2 = this.h2;
      return b;
    }

    tiles() {
      const out = [];
      for (const [k, t] of this.cells) out.push([keyX(k), keyY(k), t]);
      return out;
    }

    _put(x, y, t) {
      if (this.cells.size === 0) {
        this.minX = this.maxX = x; this.minY = this.maxY = y;
      } else {
        if (x < this.minX) this.minX = x; if (x > this.maxX) this.maxX = x;
        if (y < this.minY) this.minY = y; if (y > this.maxY) this.maxY = y;
      }
      const k = key(x, y);
      this.cells.set(k, t);
      const z = k * 7 + t;
      this.h1 ^= mix(z); this.h2 ^= mix(z ^ 0x5bd1e995);
    }

    _withinLimit() {
      const lim = this.rules.limit;
      return !lim || (this.maxX - this.minX < lim && this.maxY - this.minY < lim);
    }

    // Colour entering each edge of empty cell (x,y) from its neighbours, or -1.
    constraints(x, y) {
      const c = [-1, -1, -1, -1];
      for (let e = 0; e < 4; e++) {
        const t = this.get(x + DX[e], y + DY[e]);
        if (t >= 0) c[e] = TILES[t].edges[OPP[e]];
      }
      return c;
    }

    static fits(t, c) {
      const ed = TILES[t].edges;
      return (c[0] < 0 || c[0] === ed[0]) && (c[1] < 0 || c[1] === ed[1]) &&
             (c[2] < 0 || c[2] === ed[2]) && (c[3] < 0 || c[3] === ed[3]);
    }

    /**
     * Play tile t at (x,y) and resolve all forced plays.
     * Returns a record {placed:[[x,y,t]...], bounds} that undo() accepts, or null
     * if the move is illegal (in which case the board is left unchanged).
     */
    apply(x, y, t) {
      const cells = this.cells;
      if (cells.has(key(x, y))) return null;
      const placed = [];
      const rec = { placed, bounds: [this.minX, this.maxX, this.minY, this.maxY] };
      if (cells.size === 0) {
        this._put(x, y, t); placed.push([x, y, t]);
        return rec;
      }
      // Must touch the board and match every neighbouring edge.
      let adjacent = false;
      for (let e = 0; e < 4; e++) {
        const nt = cells.get(key(x + DX[e], y + DY[e]));
        if (nt === undefined) continue;
        adjacent = true;
        if (TE[nt * 4 + OPP[e]] !== TE[t * 4 + e]) return null;
      }
      if (!adjacent) return null;

      this._put(x, y, t); placed.push([x, y, t]);
      if (!this._withinLimit()) { this.undo(rec); return null; }

      // Resolve forced plays: any empty neighbour with two same-coloured entries gets filled.
      const queue = QUEUE;
      let qn = 0;
      for (let e = 0; e < 4; e++) { queue[qn++] = x + DX[e]; queue[qn++] = y + DY[e]; }
      while (qn > 0) {
        const cy = queue[--qn], cx = queue[--qn];
        if (cells.has(key(cx, cy))) continue;
        let w = 0, r = 0;
        const col = COLS;
        for (let e = 0; e < 4; e++) {
          const nt = cells.get(key(cx + DX[e], cy + DY[e]));
          const v = nt === undefined ? -1 : TE[nt * 4 + OPP[e]];
          col[e] = v;
          if (v === WHITE) w++; else if (v === RED) r++;
        }
        if (w > 2 || r > 2) { this.undo(rec); return null; }
        if (w < 2 && r < 2) continue;
        let ft = -1;
        for (let k = 0; k < 6; k++) {
          const b = k * 4;
          if ((col[0] < 0 || col[0] === TE[b]) && (col[1] < 0 || col[1] === TE[b + 1]) &&
              (col[2] < 0 || col[2] === TE[b + 2]) && (col[3] < 0 || col[3] === TE[b + 3])) { ft = k; break; }
        }
        if (ft < 0) { this.undo(rec); return null; }
        this._put(cx, cy, ft); placed.push([cx, cy, ft]);
        if (!this._withinLimit()) { this.undo(rec); return null; }
        if (qn + 8 > queue.length) { this.undo(rec); return this._applySlow(x, y, t); }
        for (let e = 0; e < 4; e++) { queue[qn++] = cx + DX[e]; queue[qn++] = cy + DY[e]; }
      }
      return rec;
    }

    // Same as apply() but with an unbounded queue (only needed for enormous forced chains).
    _applySlow(x, y, t) {
      const placed = [];
      const rec = { placed, bounds: [this.minX, this.maxX, this.minY, this.maxY] };
      this._put(x, y, t); placed.push([x, y, t]);
      if (!this._withinLimit()) { this.undo(rec); return null; }
      const queue = [];
      for (let e = 0; e < 4; e++) queue.push(x + DX[e], y + DY[e]);
      while (queue.length) {
        const cy = queue.pop(), cx = queue.pop();
        if (this.has(cx, cy)) continue;
        const c = this.constraints(cx, cy);
        let w = 0, r = 0;
        for (let e = 0; e < 4; e++) { if (c[e] === WHITE) w++; else if (c[e] === RED) r++; }
        if (w > 2 || r > 2) { this.undo(rec); return null; }
        if (w < 2 && r < 2) continue;
        let ft = -1;
        for (let k = 0; k < 6; k++) if (Board.fits(k, c)) { ft = k; break; }
        if (ft < 0) { this.undo(rec); return null; }
        this._put(cx, cy, ft); placed.push([cx, cy, ft]);
        if (!this._withinLimit()) { this.undo(rec); return null; }
        for (let e = 0; e < 4; e++) queue.push(cx + DX[e], cy + DY[e]);
      }
      return rec;
    }

    undo(rec) {
      const pl = rec.placed;
      for (let i = 0; i < pl.length; i++) {
        const p = pl[i], t = p[2];
        const k = key(p[0], p[1]);
        this.cells.delete(k);
        const z = k * 7 + t;
        this.h1 ^= mix(z); this.h2 ^= mix(z ^ 0x5bd1e995);
      }
      [this.minX, this.maxX, this.minY, this.maxY] = rec.bounds;
    }

    // Empty cells adjacent to the board where a tile could go (before legality checks).
    frontier() {
      if (this.count === 0) return [[0, 0]];
      const seen = new Set();
      const out = [];
      for (const k of this.cells.keys()) {
        const x = keyX(k), y = keyY(k);
        for (let e = 0; e < 4; e++) {
          const nx = x + DX[e], ny = y + DY[e];
          const nk = key(nx, ny);
          if (this.cells.has(nk) || seen.has(nk)) continue;
          seen.add(nk);
          out.push([nx, ny]);
        }
      }
      return out;
    }

    // Moves that match neighbouring edges (forced-play legality not yet checked).
    candidateMoves() {
      if (this.count === 0) return FIRST_TILES.map(t => [0, 0, t]);
      const lim = this.rules.limit;
      const out = [];
      for (const [x, y] of this.frontier()) {
        if (lim) {
          const w = Math.max(this.maxX, x) - Math.min(this.minX, x);
          const h = Math.max(this.maxY, y) - Math.min(this.minY, y);
          if (w >= lim || h >= lim) continue;
        }
        const c = this.constraints(x, y);
        for (let t = 0; t < 6; t++) if (Board.fits(t, c)) out.push([x, y, t]);
      }
      return out;
    }

    // Fully legal moves, each with the tiles it places.
    legalMoves() {
      const out = [];
      for (const m of this.candidateMoves()) {
        const rec = this.apply(m[0], m[1], m[2]);
        if (rec) { out.push(m); this.undo(rec); }
      }
      return out;
    }

    // Legal tiles for one cell (used by the UI's ghost tile).
    legalTilesAt(x, y) {
      if (this.count === 0) return (x === 0 && y === 0) ? FIRST_TILES.slice() : [];
      if (this.has(x, y)) return [];
      const c = this.constraints(x, y);
      const out = [];
      for (let t = 0; t < 6; t++) {
        if (!Board.fits(t, c)) continue;
        const rec = this.apply(x, y, t);
        if (rec) { out.push(t); this.undo(rec); }
      }
      return out;
    }

    /**
     * Follow colour c out of tile (x,y) through edge e.
     * Returns {loop:true} if it comes back to (sx,sy), otherwise the last tile and exit edge.
     */
    _walk(sx, sy, e, cells) {
      let x = sx, y = sy;
      for (;;) {
        const nx = x + DX[e], ny = y + DY[e];
        const t = this.get(nx, ny);
        if (t < 0) return { loop: false, x, y, e };
        if (nx === sx && ny === sy) return { loop: true };
        cells.push([nx, ny, OPP[e]]);
        e = EXIT[t][OPP[e]];
        x = nx; y = ny;
      }
    }

    /**
     * Trace the colour-c track through tile (x,y).
     * Returns {loop, cells:[[x,y,enterEdge?]...], ends:[{x,y,e},{x,y,e}]}.
     */
    tracePath(x, y, c) {
      const t = this.get(x, y);
      const [e1, e2] = COLOR_EDGES[t][c];
      const fwd = [];
      const a = this._walk(x, y, e1, fwd);
      if (a.loop) return { loop: true, cells: [[x, y]].concat(fwd), ends: null };
      const back = [];
      const b = this._walk(x, y, e2, back);
      return { loop: false, cells: back.reverse().concat([[x, y]], fwd), ends: [b, a] };
    }

    isWinningLine(path) {
      if (!this.rules.lines || path.loop) return false;
      const [a, b] = path.ends;
      const lim = this.rules.limit || 8;
      const test = (p, q, lo, hi, minEdge, maxEdge, coord) =>
        p.e === minEdge && q.e === maxEdge && p[coord] === lo && q[coord] === hi && hi - lo + 1 >= lim;
      return test(a, b, this.minX, this.maxX, W, E, 'x') || test(b, a, this.minX, this.maxX, W, E, 'x') ||
             test(a, b, this.minY, this.maxY, N, S, 'y') || test(b, a, this.minY, this.maxY, N, S, 'y');
    }

    /**
     * Check loops and lines passing through the given tiles (the tiles placed this turn).
     * Returns [whiteWin, redWin] where each is null or {kind:'loop'|'line', cells}.
     */
    checkWins(placed) {
      const res = [null, null];
      for (let c = 0; c < 2; c++) {
        const seen = new Set();
        for (const [x, y] of placed) {
          const k = key(x, y);
          if (seen.has(k)) continue;
          const p = this.tracePath(x, y, c);
          for (const cell of p.cells) seen.add(key(cell[0], cell[1]));
          if (p.loop) { res[c] = { kind: 'loop', cells: p.cells.map(q => [q[0], q[1]]) }; break; }
          if (this.isWinningLine(p)) { res[c] = { kind: 'line', cells: p.cells.map(q => [q[0], q[1]]) }; break; }
        }
      }
      return res;
    }

    /**
     * Allocation-free version of checkWins for the AI: returns [whiteWon, redWon] booleans
     * for paths through the given tiles.
     */
    winFlags(placed) {
      const out = [false, false];
      for (let c = 0; c < 2; c++) {
        for (let i = 0; i < placed.length; i++) {
          if (this._winThrough(placed[i][0], placed[i][1], c)) { out[c] = true; break; }
        }
      }
      return out;
    }

    _winThrough(sx, sy, c) {
      const t0 = this.get(sx, sy);
      const ce = COLOR_EDGES[t0][c];
      let x = sx, y = sy, e = ce[0];
      for (;;) {
        const nx = x + DX[e], ny = y + DY[e];
        const nt = this.get(nx, ny);
        if (nt < 0) break;
        if (nx === sx && ny === sy) return true;              // loop
        e = EXIT[nt][OPP[e]]; x = nx; y = ny;
      }
      if (!this.rules.lines) return false;
      const ax = x, ay = y, ae = e;
      x = sx; y = sy; e = ce[1];
      for (;;) {
        const nx = x + DX[e], ny = y + DY[e];
        const nt = this.get(nx, ny);
        if (nt < 0) break;
        e = EXIT[nt][OPP[e]]; x = nx; y = ny;
      }
      const lim = this.rules.limit || 8;
      if (this.maxX - this.minX + 1 >= lim &&
          ((ae === W && ax === this.minX && e === E && x === this.maxX) ||
           (ae === E && ax === this.maxX && e === W && x === this.minX))) return true;
      if (this.maxY - this.minY + 1 >= lim &&
          ((ae === N && ay === this.minY && e === S && y === this.maxY) ||
           (ae === S && ay === this.maxY && e === N && y === this.minY))) return true;
      return false;
    }

    // Standard notation for a move, computed from the board BEFORE the move is played.
    notation(x, y, t) {
      if (this.count === 0) return '@0' + TILES[t].type;
      return colName(x - this.minX + 1) + (y - this.minY + 1) + TILES[t].type;
    }

    // Parse notation into a legal [x,y,t] for this board, or null.
    parse(str) {
      const m = /^\s*([@A-Z]+)(\d+)([+\/\\])\s*$/i.exec(str || '');
      if (!m) return null;
      const col = colIndex(m[1].toUpperCase());
      const row = parseInt(m[2], 10);
      const type = m[3];
      if (this.count === 0) {
        if (col !== 0 || row !== 0) return null;
        if (type === '/') return [0, 0, 2];
        if (type === '+') return [0, 0, 0];
        return null;
      }
      const x = this.minX - 1 + col, y = this.minY - 1 + row;
      for (const t of this.legalTilesAt(x, y)) if (TILES[t].type === type) return [x, y, t];
      return null;
    }
  }

  function mix(x) {
    x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
    x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
    return (x ^ (x >>> 16)) >>> 0;
  }

  function colName(i) {
    if (i === 0) return '@';
    let s = '';
    while (i > 0) { i--; s = String.fromCharCode(65 + (i % 26)) + s; i = Math.floor(i / 26); }
    return s;
  }
  function colIndex(s) {
    if (s === '@') return 0;
    let n = 0;
    for (const ch of s) {
      if (ch < 'A' || ch > 'Z') return -1;
      n = n * 26 + (ch.charCodeAt(0) - 64);
    }
    return n;
  }

  /**
   * A whole game: board plus move list and result.
   * White always moves first.
   */
  class Game {
    constructor(variant = 'standard') {
      this.variant = variant;
      this.board = new Board(variant);
      this.moves = [];      // {x,y,t,notation,color,placed}
      this.result = null;   // {winner:0|1|-1, kind:'loop'|'line'|'draw'|'resign', cells}
    }
    get toMove() { return this.moves.length % 2 === 0 ? WHITE : RED; }

    play(x, y, t) {
      if (this.result) return null;
      const color = this.toMove;
      const notation = this.board.notation(x, y, t);
      const rec = this.board.apply(x, y, t);
      if (!rec) return null;
      const move = { x, y, t, notation, color, placed: rec.placed };
      this.moves.push(move);
      const wins = this.board.checkWins(rec.placed);
      if (wins[color]) this.result = { winner: color, kind: wins[color].kind, cells: wins[color].cells };
      else if (wins[1 - color]) this.result = { winner: 1 - color, kind: wins[1 - color].kind, cells: wins[1 - color].cells };
      else if (this.board.legalMoves().length === 0) this.result = { winner: -1, kind: 'draw', cells: [] };
      return move;
    }

    playNotation(str) {
      const m = this.board.parse(str);
      return m ? this.play(m[0], m[1], m[2]) : null;
    }

    resign(color) { this.result = { winner: 1 - color, kind: 'resign', cells: [] }; }

    static replay(variant, notations) {
      const g = new Game(variant);
      for (const n of notations) if (!g.playNotation(n)) return { game: g, error: n };
      return { game: g, error: null };
    }
  }

  return {
    WHITE, RED, N, E, S, W, DX, DY, OPP, TILES, EXIT, COLOR_EDGES, FIRST_TILES, VARIANTS,
    Board, Game, key, keyX, keyY, colName, colIndex,
  };
}

if (typeof module !== 'undefined') module.exports = TraxEngineModule;
