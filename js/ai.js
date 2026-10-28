/*
 * Trax computer opponent: negamax with alpha-beta pruning, a transposition table,
 * killer moves and a path-shape heuristic.
 * Like engine.js, everything lives in one function so it can be shipped to a Worker as source.
 *
 *   Easy   – takes a win if it sees one; otherwise half the time a random move,
 *            half the time the best move by a one-ply look.
 *   Medium – fixed two-ply search (its move + your reply).
 *   Hard   – iterative deepening until the time budget runs out.
 */
function TraxAIModule(E) {
  'use strict';

  const WIN = 1e6;
  const MATE = WIN - 1000;
  const ABORT = { abort: true };
  const LOOP_W = [0, 40, 14, 5, 2];  // value of an open path whose two ends are d cells apart
  const { TILES, EXIT, COLOR_EDGES, DX, DY, OPP } = E;
  const KX = 4096, OFF = 2048;

  /**
   * Positional value of each colour's tracks, without allocating path arrays.
   * Rewards open paths whose ends are close together (loop threats) and long
   * paths whose ends point away from each other (line threats).
   * Returns [white, red].
   */
  /**
   * Value of a path as a potential line. A line wins once it spans `lim` (8) rows or columns
   * with both ends on opposite edges of the board. An *open* line – both ends already on the
   * board's outer edges, pointing outward – is a countdown: at lim-1 its owner has two ways to
   * finish (a double threat), at lim-2 the owner wins if it's their move, and even lim-3 is one
   * quiet move from that. So the value climbs steeply as the gap closes. A line with only one
   * end on the edge is worth much less (the other end must still be steered out), and one
   * with neither end on the edge less again.
   */
  const OPEN2 = [0, 5000, 1500, 150, 30, 8];      // by gap = lim - span, both ends open
  const OPEN1 = [0, 300, 100, 30, 8, 2];          // one end open
  function lineValue(board, ends, sx, sy, lim) {
    const ax = ends[0], ay = ends[1], ae = ends[2], bx = ends[3], by = ends[4], be = ends[5];
    let s, open;
    if ((ae === 1 && be === 3) || (ae === 3 && be === 1)) {
      s = sx;
      open = ((ae === 3 && ax === board.minX) || (ae === 1 && ax === board.maxX) ? 1 : 0) +
             ((be === 3 && bx === board.minX) || (be === 1 && bx === board.maxX) ? 1 : 0);
    } else if ((ae === 0 && be === 2) || (ae === 2 && be === 0)) {
      s = sy;
      open = ((ae === 0 && ay === board.minY) || (ae === 2 && ay === board.maxY) ? 1 : 0) +
             ((be === 0 && by === board.minY) || (be === 2 && by === board.maxY) ? 1 : 0);
    } else return 0;
    if (s < 3) return 0;
    const gap = lim - s;
    if (gap <= 0) return OPEN2[1];
    if (open === 2) return gap < OPEN2.length ? OPEN2[gap] : 0;
    if (open === 1) return gap < OPEN1.length ? OPEN1[gap] : 0;
    return (s - 2) * (s - 2) * (s >= lim - 2 ? 4 : 2);
  }

  function pathValues(board) {
    const cells = board.cells;
    const visited = new Set();
    const lines = board.rules.lines;
    const lim = board.rules.limit || 8;
    const out = [0, 0];
    for (const [k, t] of cells) {
      const x0 = Math.floor(k / KX) - OFF, y0 = (k % KX) - OFF;
      for (let c = 0; c < 2; c++) {
        const vk = k * 2 + c;
        if (visited.has(vk)) continue;
        visited.add(vk);
        let minX = x0, maxX = x0, minY = y0, maxY = y0;
        const ends = [];
        let loop = false;
        for (let side = 0; side < 2 && !loop; side++) {
          let x = x0, y = y0, e = COLOR_EDGES[t][c][side];
          for (;;) {
            const nx = x + DX[e], ny = y + DY[e];
            const nk = (nx + OFF) * KX + (ny + OFF);
            const nt = cells.get(nk);
            if (nt === undefined) { ends.push(x, y, e); break; }
            if (nk === k) { loop = true; break; }
            visited.add(nk * 2 + c);
            if (nx < minX) minX = nx; else if (nx > maxX) maxX = nx;
            if (ny < minY) minY = ny; else if (ny > maxY) maxY = ny;
            e = EXIT[nt][OPP[e]];
            x = nx; y = ny;
          }
        }
        if (loop) continue;
        const ae = ends[2], be = ends[5];
        const d = Math.abs(ends[0] + DX[ae] - ends[3] - DX[be]) + Math.abs(ends[1] + DY[ae] - ends[4] - DY[be]);
        let v = d < LOOP_W.length ? LOOP_W[d] : 0;
        if (lines) v += lineValue(board, ends, maxX - minX + 1, maxY - minY + 1, lim);
        out[c] += v;
      }
    }
    return out;
  }

  // Score for `color`, who has just moved (the opponent is to move, so their threats weigh more).
  function evaluate(board, color) {
    const v = pathValues(board);
    return v[color] - 1.3 * v[1 - color];
  }

  const mkey = m => (m[0] + OFF) * KX * 8 + (m[1] + OFF) * 8 + m[2];
  const EXACT = 0, LOWER = 1, UPPER = 2;

  class Searcher {
    constructor(board, deadline, tt) {
      this.board = board;
      this.deadline = deadline;
      this.nodes = 0;
      this.killers = [];
      this.tt = tt || new Map();
    }

    timeCheck() {
      this.nodes++;
      if (this.deadline && Date.now() > this.deadline) throw ABORT;
    }

    // Apply m, report a terminal score from the mover's view or null, and leave it applied.
    terminal(rec, color, ply, wc) {
      const wins = wc ? wc.flags(rec.placed) : this.board.winFlags(rec.placed);
      if (wins[color]) return WIN - ply;
      if (wins[1 - color]) return -(WIN - ply);
      const lim = this.board.rules.limit;
      if (lim && this.board.count >= lim * lim) return 0;
      return null;
    }

    // Order moves: TT move, killer, then (for deep nodes) by one-ply evaluation.
    order(moves, color, depth, ply, ttMove) {
      if (depth >= 3) {
        const board = this.board;
        const scored = [];
        const wc = winChecker(board);
        for (const m of moves) {
          const rec = board.apply(m[0], m[1], m[2]);
          if (!rec) continue;
          let s = this.terminal(rec, color, ply, wc);
          if (s === null) s = evaluate(board, color);
          board.undo(rec);
          scored.push([s, m]);
        }
        scored.sort((a, b) => b[0] - a[0]);
        moves = scored.map(x => x[1]);
      }
      const front = [ttMove, this.killers[ply]];
      for (let j = front.length - 1; j >= 0; j--) {
        if (front[j] === undefined) continue;
        const i = moves.findIndex(m => mkey(m) === front[j]);
        if (i > 0) { const m = moves[i]; moves.splice(i, 1); moves.unshift(m); }
      }
      return moves;
    }

    search(color, depth, alpha, beta, ply) {
      this.timeCheck();
      const board = this.board;
      const ttKey = (board.h1 ^ (color ? 0x9e3779b9 : 0)) >>> 0;
      const hit = this.tt.get(ttKey);
      let ttMove;
      if (hit && hit.h2 === board.h2) {
        ttMove = hit.best;
        if (hit.depth >= depth) {
          let s = hit.score;
          if (s > MATE) s -= ply; else if (s < -MATE) s += ply;
          if (hit.flag === EXACT) return s;
          if (hit.flag === LOWER && s >= beta) return s;
          if (hit.flag === UPPER && s <= alpha) return s;
        }
      }
      const alpha0 = alpha;
      const moves = this.order(board.candidateMoves(), color, depth, ply, ttMove);
      let best = -Infinity, bestMove, any = false;
      const wc = winChecker(board);
      for (const m of moves) {
        const rec = board.apply(m[0], m[1], m[2]);
        if (!rec) continue;
        any = true;
        let score = this.terminal(rec, color, ply, wc);
        if (score === null) {
          if (depth <= 1) score = evaluate(board, color);
          else {
            try { score = -this.search(1 - color, depth - 1, -beta, -alpha, ply + 1); }
            catch (e) { board.undo(rec); throw e; }
          }
        }
        board.undo(rec);
        if (score > best) { best = score; bestMove = m; }
        if (score > alpha) alpha = score;
        if (alpha >= beta) { this.killers[ply] = mkey(m); break; }
      }
      if (!any) return 0;
      let stored = best;
      if (stored > MATE) stored += ply; else if (stored < -MATE) stored -= ply;
      this.tt.set(ttKey, {
        h2: board.h2, depth, score: stored, best: mkey(bestMove),
        flag: best <= alpha0 ? UPPER : best >= beta ? LOWER : EXACT,
      });
      return best;
    }

    // Score each root move at `depth`. Moves that can't beat the best so far get upper bounds only.
    root(color, moves, depth) {
      const board = this.board;
      const out = [];
      let alpha = -Infinity;
      const wc = winChecker(board);
      for (const m of moves) {
        const rec = board.apply(m[0], m[1], m[2]);
        let score = this.terminal(rec, color, 0, wc);
        if (score === null) {
          if (depth <= 1) score = evaluate(board, color);
          else {
            try { score = -this.search(1 - color, depth - 1, -Infinity, -(alpha - 1), 1); }
            catch (e) { board.undo(rec); throw e; }
          }
        }
        board.undo(rec);
        out.push({ m, score });
        if (score > alpha) alpha = score;
      }
      return out;
    }
  }

  function pickBest(scored, jitter) {
    let bestScore = -Infinity;
    for (const s of scored) if (s.score > bestScore) bestScore = s.score;
    const top = scored.filter(s => s.score >= bestScore - jitter);
    return top[Math.floor(Math.random() * top.length)];
  }

  /**
   * Choose a move for `color` on `board`.
   * level: 'easy' | 'medium' | 'hard'.  timeMs: budget for hard.
   * Returns {move:[x,y,t], depth, score, nodes}.
   */
  function chooseMove(board, color, level, timeMs = 3000, opts = {}) {
    if (level === 'expert') {
      const withAnalyst = opts.analyst && opts.notations
        ? { rerank: analystRerank(opts.analyst, opts.notations, board.variant), searchEnd: 0.45, searchStop: 0.25, rerankEnd: 0.75 }
        : {};
      return chooseExpert(board, color, timeMs, withAnalyst);
    }
    const moves = board.legalMoves();
    if (!moves.length) return null;
    if (board.count === 0) return { move: moves[Math.floor(Math.random() * moves.length)], depth: 0, score: 0 };

    const s1 = new Searcher(board, 0);
    const ply1 = s1.root(color, moves, 1);
    const win = ply1.find(s => s.score >= MATE);
    if (win) return { move: win.m, depth: 1, score: win.score };

    if (level === 'easy') {
      if (Math.random() < 0.5) return { move: moves[Math.floor(Math.random() * moves.length)], depth: 0, score: 0 };
      return { move: pickBest(ply1, 6).m, depth: 1, score: 0 };
    }

    ply1.sort((a, b) => b.score - a.score);
    if (level === 'medium') {
      const s = new Searcher(board, 0);
      const scored = s.root(color, ply1.map(x => x.m), 2);
      const best = pickBest(scored, 2);
      return { move: best.m, depth: 2, score: best.score, nodes: s.nodes };
    }

    // Hard: iterative deepening; each pass reuses the transposition table and the previous ordering.
    const start = Date.now(), deadline = start + timeMs;
    const tt = new Map();
    let order = ply1, best = ply1[0], reached = 1, nodes = 0;
    for (let depth = 2; depth <= 16; depth++) {
      const s = new Searcher(board, deadline, tt);
      let scored;
      try { scored = s.root(color, order.map(x => x.m), depth); }
      catch (e) { if (e !== ABORT) throw e; nodes += s.nodes; break; }
      nodes += s.nodes;
      scored.sort((a, b) => b.score - a.score);
      order = scored;
      reached = depth;
      best = pickBest(scored, 0.5);
      if (scored[0].score >= MATE) { best = scored[0]; break; }       // forced win found
      if (scored[0].score <= -MATE) break;                             // every move loses; keep slowest loss
      if (Date.now() - start > timeMs * 0.45) break;                   // next pass won't finish in time
    }
    return { move: best.m, depth: reached, score: best.score, nodes };
  }

  // =====================================================================================
  // Expert: threat-based play.
  //
  // A "winning move" for colour c is a move that, played by c, completes a c loop or line.
  // A "threat" is having at least one. Expert:
  //   1. finds forced wins with a threat-space search (attack, every defence, attack again…),
  //   2. scores quiet positions by shape plus the immediate threats each side holds,
  //   3. before committing, checks the chosen move doesn't hand the opponent a forced win.
  // =====================================================================================

  /** One pass over all tracks: shape values per colour plus a record for every open path. */
  function analyzePaths(board) {
    const cells = board.cells;
    const visited = new Set();
    const lines = board.rules.lines;
    const lim = board.rules.limit || 8;
    const vals = [0, 0];
    const paths = [];
    const { minX, maxX, minY, maxY } = board;
    for (const [k, t] of cells) {
      const x0 = Math.floor(k / KX) - OFF, y0 = (k % KX) - OFF;
      for (let c = 0; c < 2; c++) {
        const vk = k * 2 + c;
        if (visited.has(vk)) continue;
        visited.add(vk);
        let pMinX = x0, pMaxX = x0, pMinY = y0, pMaxY = y0;
        const ends = [];
        let loop = false;
        for (let side = 0; side < 2 && !loop; side++) {
          let x = x0, y = y0, e = COLOR_EDGES[t][c][side];
          for (;;) {
            const nx = x + DX[e], ny = y + DY[e];
            const nk = (nx + OFF) * KX + (ny + OFF);
            const nt = cells.get(nk);
            if (nt === undefined) { ends.push(x, y, e); break; }
            if (nk === k) { loop = true; break; }
            visited.add(nk * 2 + c);
            if (nx < pMinX) pMinX = nx; else if (nx > pMaxX) pMaxX = nx;
            if (ny < pMinY) pMinY = ny; else if (ny > pMaxY) pMaxY = ny;
            e = EXIT[nt][OPP[e]];
            x = nx; y = ny;
          }
        }
        if (loop) continue;
        const ae = ends[2], be = ends[5];
        const ax = ends[0] + DX[ae], ay = ends[1] + DY[ae];
        const bx = ends[3] + DX[be], by = ends[4] + DY[be];
        const d = Math.abs(ax - bx) + Math.abs(ay - by);
        const sx = pMaxX - pMinX + 1, sy = pMaxY - pMinY + 1;
        const horiz = (ae === 1 && be === 3) || (ae === 3 && be === 1);
        const vert = (ae === 0 && be === 2) || (ae === 2 && be === 0);
        const atEdge = (tx, ty, e) => (e === 3 && tx === minX) || (e === 1 && tx === maxX) || (e === 0 && ty === minY) || (e === 2 && ty === maxY);
        const edge = atEdge(ends[0], ends[1], ae) || atEdge(ends[3], ends[4], be);
        let v = d < LOOP_W.length ? LOOP_W[d] : 0;
        if (lines) v += lineValue(board, ends, sx, sy, lim);
        vals[c] += v;
        paths.push({ c, ax, ay, bx, by, d, sx, sy, horiz, vert, edge });
      }
    }
    return { vals, paths };
  }

  /**
   * Empty cells worth examining for colour c (or both if c < 0): the cells at and around the
   * open ends of paths that are "live" – ends close enough to close a loop soon, or long
   * enough / anchored at the board edge to become a line.
   */
  function liveCells(board, paths, c, loopD, lineSlack, radius) {
    const out = new Set();
    const lines = board.rules.lines;
    const lim = board.rules.limit || 8;
    for (const p of paths) {
      if (c >= 0 && p.c !== c) continue;
      const hot = p.d <= loopD || (lines && (
        (p.horiz && p.sx >= lim - lineSlack) || (p.vert && p.sy >= lim - lineSlack) ||
        (p.edge && Math.max(p.sx, p.sy) >= 3)));
      if (!hot) continue;
      for (const [ex, ey] of [[p.ax, p.ay], [p.bx, p.by]]) {
        for (let dx = -radius; dx <= radius; dx++) {
          const r = radius - Math.abs(dx);
          for (let dy = -r; dy <= r; dy++) {
            const k = (ex + dx + OFF) * KX + (ey + dy + OFF);
            if (!board.cells.has(k)) out.add(k);
          }
        }
      }
    }
    return out;
  }

  // Moves (with every fitting tile) at the given empty cells.
  function movesAt(board, cellKeys) {
    const out = [];
    for (const k of cellKeys) {
      const x = Math.floor(k / KX) - OFF, y = (k % KX) - OFF;
      const c = board.constraints(x, y);
      if (c[0] < 0 && c[1] < 0 && c[2] < 0 && c[3] < 0) continue;
      for (let t = 0; t < 6; t++) if (E.Board.fits(t, c)) out.push([x, y, t]);
    }
    return out;
  }

  /**
   * Winning moves for each colour among `moves`. Returns [white, red], each a list of
   * {m, placed}. Moves are colourless; a move wins for c if it completes a c path
   * (when both complete, the mover wins, so it counts for whichever colour plays it).
   */
  function scanWins(board, moves) {
    const res = [[], []];
    const wc = winChecker(board);
    for (const m of moves) {
      const rec = board.apply(m[0], m[1], m[2]);
      if (!rec) continue;
      const w = wc.flags(rec.placed);
      board.undo(rec);
      if (w[0]) res[0].push({ m, placed: rec.placed });
      if (w[1]) res[1].push({ m, placed: rec.placed });
    }
    return res;
  }

  /**
   * Could tile t at (x,y) possibly win for anyone? Exact pre-filter, no move played:
   *  - a loop can only close through a forced play (two ends of one path can never enter the
   *    same empty space), so the tile must give some empty neighbour two same-coloured entries;
   *  - without a forced play, a line can only complete if the tile sits on the board's outer
   *    row/column and the board is already at least 8 long in that direction.
   */
  function mayWin(board, x, y, t) {
    const ed = TILES[t].edges;
    for (let e = 0; e < 4; e++) {
      const qx = x + DX[e], qy = y + DY[e];
      if (board.has(qx, qy)) continue;
      const col = ed[e];
      for (let f = 0; f < 4; f++) {
        if (f === OPP[e]) continue;                         // that side of Q is our new tile
        const nt = board.get(qx + DX[f], qy + DY[f]);
        if (nt >= 0 && TILES[nt].edges[OPP[f]] === col) return true;
      }
    }
    if (board.rules.lines) {
      const lim = board.rules.limit || 8;
      const nminX = Math.min(board.minX, x), nmaxX = Math.max(board.maxX, x);
      const nminY = Math.min(board.minY, y), nmaxY = Math.max(board.maxY, y);
      if (nmaxX - nminX + 1 >= lim && (x === nminX || x === nmaxX)) return true;
      if (nmaxY - nminY + 1 >= lim && (y === nminY || y === nmaxY)) return true;
    }
    return false;
  }

  // All winning moves for both colours in the current position (exact; see mayWin).
  const STATS = { threats: 0, threatMoves: 0, attacks: 0, defences: 0, tssNodes: 0 };
  function threats(board) {
    STATS.threats++;
    const moves = [];
    for (const m of board.candidateMoves()) if (mayWin(board, m[0], m[1], m[2])) moves.push(m);
    STATS.threatMoves += moves.length;
    return scanWins(board, moves);
  }

  /**
   * Fast win detection for many moves from one position. Built once per position: maps each
   * open path end (tile, exit edge) to the path's other end. After a move, following a track
   * only steps through the new tiles and jumps across existing paths end-to-end, instead of
   * walking every tile of every path.
   */
  function winChecker(board) {
    const cells = board.cells;
    const ends = new Map();        // (tileKey*4 + exitEdge) -> [x, y, exitEdge] of the other end
    const visited = new Set();
    for (const [k, t] of cells) {
      const x0 = Math.floor(k / KX) - OFF, y0 = (k % KX) - OFF;
      for (let c = 0; c < 2; c++) {
        if (visited.has(k * 2 + c)) continue;
        visited.add(k * 2 + c);
        const found = [];
        let loop = false;
        for (let side = 0; side < 2 && !loop; side++) {
          let x = x0, y = y0, e = COLOR_EDGES[t][c][side];
          for (;;) {
            const nx = x + DX[e], ny = y + DY[e];
            const nk = (nx + OFF) * KX + (ny + OFF);
            const nt = cells.get(nk);
            if (nt === undefined) { found.push(x, y, e); break; }
            if (nk === k) { loop = true; break; }
            visited.add(nk * 2 + c);
            e = EXIT[nt][OPP[e]]; x = nx; y = ny;
          }
        }
        if (loop) continue;
        ends.set(((found[0] + OFF) * KX + (found[1] + OFF)) * 4 + found[2], [found[3], found[4], found[5]]);
        ends.set(((found[3] + OFF) * KX + (found[4] + OFF)) * 4 + found[5], [found[0], found[1], found[2]]);
      }
    }

    // After board.apply() produced `placed`: [whiteWon, redWon].
    const PX = new Int32Array(256), PY = new Int32Array(256), SEEN = new Uint8Array(256);
    function flags(placed) {
      const n = placed.length;
      if (n > 256) return board.winFlags(placed);
      for (let i = 0; i < n; i++) { PX[i] = placed[i][0]; PY[i] = placed[i][1]; }
      const indexOf = (x, y) => { for (let j = 0; j < n; j++) if (PX[j] === x && PY[j] === y) return j; return -1; };
      const lines = board.rules.lines;
      const lim = board.rules.limit || 8;
      const res = [false, false];
      for (let c = 0; c < 2; c++) {
        SEEN.fill(0, 0, n);
        for (let i = 0; i < n && !res[c]; i++) {
          if (SEEN[i]) continue;                               // already on a path we traced
          SEEN[i] = 1;
          const sx = PX[i], sy = PY[i];
          const ce = COLOR_EDGES[placed[i][2]][c];
          let ax = 0, ay = 0, ae = 0, bx = 0, by = 0, be = 0;
          let loop = false;
          for (let side = 0; side < 2 && !loop; side++) {
            let x = sx, y = sy, e = ce[side];
            for (let guard = 0; guard < 100000; guard++) {
              const nx = x + DX[e], ny = y + DY[e];
              const nk = (nx + OFF) * KX + (ny + OFF);
              const nt = cells.get(nk);
              if (nt === undefined) break;
              if (nx === sx && ny === sy) { loop = true; break; }
              const j = indexOf(nx, ny);
              if (j >= 0) { SEEN[j] = 1; e = EXIT[nt][OPP[e]]; x = nx; y = ny; continue; }
              const far = ends.get(nk * 4 + OPP[e]);           // entered an old path at one end: jump to the other
              if (!far) return board.winFlags(placed);          // shouldn't happen; fall back to a full trace
              x = far[0]; y = far[1]; e = far[2];
            }
            if (side === 0) { ax = x; ay = y; ae = e; } else { bx = x; by = y; be = e; }
            if (!lines) break;                                  // loop-only rules: one direction suffices
          }
          if (loop) { res[c] = true; break; }
          if (!lines) continue;
          if (board.maxX - board.minX + 1 >= lim &&
              ((ae === 3 && ax === board.minX && be === 1 && bx === board.maxX) ||
               (ae === 1 && ax === board.maxX && be === 3 && bx === board.minX))) res[c] = true;
          else if (board.maxY - board.minY + 1 >= lim &&
              ((ae === 0 && ay === board.minY && be === 2 && by === board.maxY) ||
               (ae === 2 && ay === board.maxY && be === 0 && by === board.minY))) res[c] = true;
        }
      }
      return res;
    }
    return { flags };
  }

  // Count distinct cells among winning moves (two threats at one cell are one threat to block).
  function threatCells(list) {
    const s = new Set();
    for (const w of list) s.add(w.m[0] * 7919 + w.m[1]);
    return s.size;
  }

  class Expert {
    constructor(board, deadline) {
      this.board = board;
      this.deadline = deadline;
      this.nodes = 0;
      this.tssTT = new Map();
      this.tt = new Map();
      this.killers = [];
    }

    tick() {
      this.nodes++;
      if (this.deadline && Date.now() > this.deadline) throw ABORT;
    }

    // ---- threat-space search -------------------------------------------------------
    /**
     * Can `A` (to move) force a win making only threatening moves, within `depth` attacks?
     * Returns the first move of the winning sequence, or null.
     */
    tss(A, depth) {
      this.tick();
      const board = this.board, D = 1 - A;
      const an = analyzePaths(board);
      const thr = threats(board);
      if (thr[A].length) return thr[A][0].m;
      if (depth <= 0) return null;

      const ttKey = (board.h1 ^ (A ? 0x2545f491 : 0x6a09e667)) >>> 0;
      const hit = this.tssTT.get(ttKey);
      if (hit && hit.h2 === board.h2 && (hit.move || hit.depth >= depth)) return hit.move;

      const attacks = movesAt(board, liveCells(board, an.paths, A, 6, 4, 1));
      STATS.tssNodes++; STATS.attacks += attacks.length;
      let found = null;
      for (const m of attacks) {
        const rec = board.apply(m[0], m[1], m[2]);
        if (!rec) continue;
        let ok = false;
        try {
          const w = board.winFlags(rec.placed);
          if (w[A]) { ok = true; }
          else if (!w[D]) {
            const t2 = threats(board);
            if (!t2[D].length && t2[A].length) ok = this.defended(A, t2[A], depth);
          }
        } finally { board.undo(rec); }
        if (ok) { found = m; break; }
      }
      this.tssTT.set(ttKey, { h2: board.h2, depth, move: found });
      return found;
    }

    /** A has just made threats `aw`; true if every defence by D still loses to further attack. */
    defended(A, aw, depth) {
      const board = this.board, D = 1 - A;
      // Defences must occupy or touch the cells A's winning moves use.
      const cells = new Set();
      for (const w of aw) for (const [x, y] of w.placed) {
        for (let dx = -2; dx <= 2; dx++) {
          const r = 2 - Math.abs(dx);
          for (let dy = -r; dy <= r; dy++) {
            const k = (x + dx + OFF) * KX + (y + dy + OFF);
            if (!board.cells.has(k)) cells.add(k);
          }
        }
      }
      const defences = this.fullDefence ? board.candidateMoves() : movesAt(board, cells);
      STATS.defences += defences.length;
      for (const d of defences) {
        this.tick();
        const rec = board.apply(d[0], d[1], d[2]);
        if (!rec) continue;
        let attackerStillWins = true;
        try {
          const w = board.winFlags(rec.placed);
          if (w[D]) attackerStillWins = false;                 // the "defence" wins outright for D
          else if (!w[A]) {
            const t = threats(board);
            if (!t[A].length) attackerStillWins = !!this.tss(A, depth - 1);   // a real block
          }
        } finally { board.undo(rec); }
        if (!attackerStillWins) return false;
      }
      return true;
    }

    // ---- threat-aware evaluation -----------------------------------------------------
    // Position after `color` moved; the opponent is to move.
    evalAfter(color, ply) {
      const board = this.board, opp = 1 - color;
      const an = analyzePaths(board);
      const thr = threats(board);
      if (thr[opp].length) return -(WIN - ply - 1);           // opponent simply wins next move
      let v = an.vals[color] - 1.3 * an.vals[opp];
      const n = threatCells(thr[color]);
      if (n >= 2) v += 3000;                                  // two separate threats: usually decisive
      else if (n === 1) v += 250;                             // a threat the opponent must answer
      return v;
    }

    // ---- main search -----------------------------------------------------------------
    search(color, depth, alpha, beta, ply) {
      this.tick();
      const board = this.board;
      const ttKey = (board.h1 ^ (color ? 0x9e3779b9 : 0)) >>> 0;
      const hit = this.tt.get(ttKey);
      let ttMove;
      if (hit && hit.h2 === board.h2) {
        ttMove = hit.best;
        if (hit.depth >= depth) {
          let s = hit.score;
          if (s > MATE) s -= ply; else if (s < -MATE) s += ply;
          if (hit.flag === EXACT) return s;
          if (hit.flag === LOWER && s >= beta) return s;
          if (hit.flag === UPPER && s <= alpha) return s;
        }
      }
      const alpha0 = alpha;
      let moves = board.candidateMoves();
      // If the opponent threatens to win, only moves that touch the threat can matter.
      if (depth >= 1) {
        const thr = threats(board);
        if (thr[color].length) return WIN - ply;              // we can win right now
        if (thr[1 - color].length) {
          const near = new Set();
          for (const w of thr[1 - color]) for (const [x, y] of w.placed)
            for (let dx = -2; dx <= 2; dx++) for (let dy = -2 + Math.abs(dx); dy <= 2 - Math.abs(dx); dy++)
              near.add(E.key(x + dx, y + dy));
          moves = moves.filter(m => near.has(E.key(m[0], m[1])));
          if (!moves.length) return -(WIN - ply - 1);
        }
      }
      const front = [ttMove, this.killers[ply]];
      for (let j = front.length - 1; j >= 0; j--) {
        if (front[j] === undefined) continue;
        const i = moves.findIndex(m => mkey(m) === front[j]);
        if (i > 0) { const m = moves[i]; moves.splice(i, 1); moves.unshift(m); }
      }
      let best = -Infinity, bestMove, any = false;
      for (const m of moves) {
        const rec = board.apply(m[0], m[1], m[2]);
        if (!rec) continue;
        any = true;
        let score;
        try {
          const w = board.winFlags(rec.placed);
          if (w[color]) score = WIN - ply;
          else if (w[1 - color]) score = -(WIN - ply);
          else if (board.rules.limit && board.count >= 64) score = 0;
          else if (depth <= 1) score = this.evalAfter(color, ply + 1);
          else score = -this.search(1 - color, depth - 1, -beta, -alpha, ply + 1);
        } finally { board.undo(rec); }
        if (score > best) { best = score; bestMove = m; }
        if (score > alpha) alpha = score;
        if (alpha >= beta) { this.killers[ply] = mkey(m); break; }
      }
      if (!any) return 0;
      let stored = best;
      if (stored > MATE) stored += ply; else if (stored < -MATE) stored -= ply;
      this.tt.set(ttKey, { h2: board.h2, depth, score: stored, best: mkey(bestMove),
        flag: best <= alpha0 ? UPPER : best >= beta ? LOWER : EXACT });
      return best;
    }

    rootScores(color, moves, depth) {
      const board = this.board, out = [];
      let alpha = -Infinity;
      for (const m of moves) {
        const rec = board.apply(m[0], m[1], m[2]);
        let score;
        try {
          const w = board.winFlags(rec.placed);
          if (w[color]) score = WIN;
          else if (w[1 - color]) score = -WIN;
          else if (depth <= 1) score = this.evalAfter(color, 1);
          else score = -this.search(1 - color, depth - 1, -Infinity, -(alpha - 1), 1);
        } finally { board.undo(rec); }
        out.push({ m, score });
        if (score > alpha) alpha = score;
      }
      return out;
    }
  }

  /** Re-check a claimed forced win starting with move m, allowing every possible defence. */
  function confirmForcedWin(board, color, m, depth, deadline) {
    const vx = new Expert(board, deadline);
    vx.fullDefence = true;
    const rec = board.apply(m[0], m[1], m[2]);
    try {
      const w = board.winFlags(rec.placed);
      if (w[color]) return true;
      if (w[1 - color]) return false;
      const t = threats(board);
      if (t[1 - color].length || !t[color].length) return false;
      return vx.defended(color, t[color], depth);
    } catch (e) {
      if (e !== ABORT) throw e;
      return false;                       // couldn't confirm in time
    } finally { board.undo(rec); }
  }

  /**
   * Expert move choice:
   *   1. take an immediate win, or if the opponent threatens one, consider only blocking moves;
   *   2. look for our own forced win by threat-space search;
   *   3. rank moves with the same fast alpha-beta search Hard uses;
   *   4. walk down that ranking and take the first move after which the opponent has no
   *      forced win of their own.
   */
  function chooseExpert(board, color, timeMs, opts = {}) {
    const start = Date.now();
    const opp = 1 - color;
    const legal = board.legalMoves();
    if (!legal.length) return null;
    if (board.count === 0) return { move: legal[Math.floor(Math.random() * legal.length)], depth: 0, score: 0 };

    const now = threats(board);
    if (now[color].length) return { move: now[color][0].m, depth: 1, score: WIN, note: 'win' };
    let candidates = legal;
    if (now[opp].length) {
      candidates = legal.filter(m => {
        const rec = board.apply(m[0], m[1], m[2]);
        const w = board.winFlags(rec.placed);
        const ok = !w[opp] && threats(board)[opp].length === 0;
        board.undo(rec);
        return ok;
      });
      if (!candidates.length) return { move: legal[0], depth: 1, score: -WIN, note: 'lost' };
      if (candidates.length === 1) return { move: candidates[0], depth: 1, score: 0, note: 'forced block' };
    }
    const allowed = new Set(candidates.map(mkey));

    // 2. Our own forced win?
    let tssDepth = 0;
    const ex = new Expert(board, start + timeMs * 0.25);
    try {
      for (let d = 1; d <= 10; d++) {
        const m = ex.tss(color, d);
        tssDepth = d;
        if (m && allowed.has(mkey(m))) {
          // The search above only tries defences near each threat; a defence far away can still
          // work through a chain of forced plays. Confirm against every defence before trusting it.
          if (confirmForcedWin(board, color, m, d, start + timeMs * 0.5)) {
            return { move: m, depth: d, score: WIN, note: 'forced win', nodes: ex.nodes };
          }
          break;   // unconfirmed: let the normal search decide
        }
      }
    } catch (e) { if (e !== ABORT) throw e; }

    // 3. Rank moves with the fast search (iterative deepening, as Hard).
    const s1 = new Searcher(board, 0);
    let order = s1.root(color, candidates, 1).sort((a, b) => b.score - a.score);
    const tt = new Map();
    const searchEnd = start + timeMs * (opts.searchEnd || 0.6);
    let reached = 1;
    for (let depth = 2; depth <= 16; depth++) {
      const s = new Searcher(board, searchEnd, tt);
      let scored;
      try { scored = s.root(color, order.map(x => x.m), depth); }
      catch (e) { if (e !== ABORT) throw e; break; }
      scored.sort((a, b) => b.score - a.score);
      order = scored; reached = depth;
      if (scored[0].score >= MATE || scored[0].score <= -MATE) break;
      if (Date.now() > start + timeMs * (opts.searchStop || 0.35)) break;
    }

    // 3b. Optional re-ranking by an external evaluator (e.g. threat-pattern analysis).
    if (opts.rerank) {
      try { order = opts.rerank(order, board, color, start + timeMs * (opts.rerankEnd || 0.75)) || order; }
      catch (e) { if (e !== ABORT) throw e; }
    }

    // 4. Safety check against the opponent's forced attacks.
    const end = start + timeMs;
    const pool = order.filter(o => o.score > -MATE);
    if (!pool.length) return { move: order[0].m, depth: reached, score: order[0].score, note: 'lost' };
    const bestScore = pool[0].score;
    const near = pool.filter(o => o.score >= bestScore - 0.5);
    const first = near[Math.floor(Math.random() * near.length)];
    const queue = [first].concat(pool.filter(o => o !== first));
    let chosen = null, checked = 0, rejected = 0;
    for (const o of queue) {
      const left = end - Date.now();
      if (left <= 0) break;
      const per = Math.max(left / 3, Math.min(left, timeMs * 0.08));   // spend more on the first few
      const sx = new Expert(board, Date.now() + per);
      const rec = board.apply(o.m[0], o.m[1], o.m[2]);
      let unsafe = false;
      try {
        for (let d = 1; d <= 6; d++) if (sx.tss(opp, d)) { unsafe = true; break; }
      } catch (e) { if (e !== ABORT) throw e; }
      finally { board.undo(rec); }
      checked++;
      if (!unsafe) { chosen = o; break; }
      rejected++;
    }
    if (!chosen) chosen = first;
    return { move: chosen.m, depth: reached, tssDepth, score: chosen.score, checked, rejected, patterns: chosen.an !== undefined, note: rejected ? 'avoided attack' : 'search' };
  }

  /**
   * Re-rank Expert's top candidates with the threat-pattern analysis from
   * @slugbugblue/trax-analyst (Apache-2.0; bundled in js/vendor). For each candidate we build the
   * resulting position in that library's engine and take its validated score for us; it knows
   * the standard Trax threat shapes (corners, connectable pairs, L threats, caves, …) that our
   * own evaluation doesn't. Decisive verdicts dominate; otherwise the score is blended with the
   * search score. Weight AW = 60 won 14–4 over 18 games against Expert without it; a lighter
   * weight (20) went 0–4 and a heavier one (150) 2–4.
   */
  function analystRerank(Analyst, notations, variant, { K = 20, AW = 60 } = {}) {
    const rules = { standard: 'trax', loop: 'traxloop', limited: 'trax8' }[variant] || 'trax';
    const base = notations.join(' ');
    return (order, board, color, deadline) => {
      const me = color === 0 ? 'w' : 'b';
      const top = order.filter(o => o.score > -MATE).slice(0, K);
      const done = [];
      for (const o of top) {
        if (Date.now() > deadline) break;
        let s1;
        try {
          const T = new Analyst.Trax(rules, base + ' ' + board.notation(o.m[0], o.m[1], o.m[2]));
          if (T.over) continue;
          const a = Analyst.analyze(T);
          a.validateThreats();
          s1 = a.scores[me];
        } catch (e) { continue; }
        if (!Number.isFinite(s1)) continue;
        o.an = s1;
        o.combined = (Math.abs(s1) >= 50000 ? Math.sign(s1) * 1e7 : s1 * AW) + o.score;
        done.push(o);
      }
      if (!done.length) return order;
      done.sort((a, b) => b.combined - a.combined);
      return done.concat(order.filter(o => !done.includes(o)));
    };
  }

  // Diagnostic: iterative-deepening threat-space search for `color` with a time budget.
  function tssProbe(board, color, ms, fullDefence) {
    const ex = new Expert(board, Date.now() + ms);
    ex.fullDefence = !!fullDefence;
    let depth = 0;
    try {
      for (let d = 1; d <= 20; d++) { const m = ex.tss(color, d); depth = d; if (m) return { move: m, depth: d, nodes: ex.nodes }; }
    } catch (e) { if (e !== ABORT) throw e; }
    return { move: null, depth, nodes: ex.nodes };
  }

  const makeExpert = (board, deadline) => new Expert(board, deadline);
  return { lineValue, analystRerank, MATE, STATS, makeExpert, tssProbe, chooseMove, evaluate, pathValues, chooseExpert, analyzePaths, threats, scanWins, mayWin, winChecker };
}

if (typeof module !== 'undefined') module.exports = TraxAIModule;
