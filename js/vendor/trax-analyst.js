/*
 * Bundled copy of @slugbugblue/trax (engine), @slugbugblue/trax-analyst (threat analysis),
 * @slugbugblue/point and @slugbugblue/lru, by Chad Transtrum.
 * Copyright 2019-2023 Chad Transtrum. Licensed under the Apache License, Version 2.0
 * (see LICENSE-trax-analyst.txt in this folder, or http://www.apache.org/licenses/LICENSE-2.0).
 *
 * Modifications for this project: bundled with esbuild into a single function (so it can be
 * shipped to a Web Worker as source); Node's util.inspect replaced by a stub; a polyfill
 * for Iterator.prototype.toArray added for older browsers. No functional changes.
 *
 * Used by the Expert opponent to recognise standard Trax threat patterns (corners, L threats, …).
 */
function TraxAnalystModule() {
  'use strict';
  const IterProto = Object.getPrototypeOf(Object.getPrototypeOf([][Symbol.iterator]()));
  if (!IterProto.toArray) Object.defineProperty(IterProto, 'toArray', { value: function () { return Array.from(this); }, configurable: true, writable: true });
var TraxAnalystBundle = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // entry.mjs
  var entry_exports = {};
  __export(entry_exports, {
    Trax: () => Trax,
    analyze: () => analyze
  });

  // node_modules/@slugbugblue/point/point.js
  /** Point class: provides simple (x,y) integer point functionality
   * @copyright 2022-2026
   * @author Chad Transtrum <chad@transtrum.net>
   * @license Apache-2.0
   *
   * Are you tired of doing x,y movements in multiple statements?
   *
   * I know I am.
   *
   * Point: an immutable two-dimensional location (x,y) with
   * functions for moving around quickly to neighboring points.
   */
  var between = (end1, mid, end2) => {
    const low = Math.min(end1, end2);
    const high = Math.max(end1, end2);
    return low <= mid && mid <= high;
  };
  var Point = class _Point {
    /** @type {number} */
    x;
    /** @type {number} */
    y;
    static dirs = ["up", "down", "left", "right"];
    /** You can call this with new Point(point) or new Point({x, y}) or new Point(x, y)
     * @arg {number | PointLike} x - the x value or a point
     * @arg {number} [y] - the y value
     */
    constructor(x, y) {
      if (typeof x === "object" && typeof x.x === "number" && typeof x.y === "number") {
        this.x = x.x;
        this.y = x.y;
      } else {
        if (typeof x !== "number" || Number.isNaN(x)) {
          throw new SyntaxError("x must be a number or a point-like object");
        }
        if (typeof y !== "number" || Number.isNaN(x)) {
          throw new SyntaxError("y must be a number");
        }
        this.x = x;
        this.y = y;
      }
      Object.freeze(this);
    }
    /** The point immediately above this point. */
    get up() {
      return new _Point(this.x, this.y - 1);
    }
    /** The point immediately below this point. */
    get down() {
      return new _Point(this.x, this.y + 1);
    }
    /** The point to the immediate left of this point. */
    get left() {
      return new _Point(this.x - 1, this.y);
    }
    /** The point to the immediate right of this point. */
    get right() {
      return new _Point(this.x + 1, this.y);
    }
    /** A list of the four points that surround this point: up, down, left, and right. */
    get around() {
      return [this.up, this.down, this.left, this.right];
    }
    /** Move in a specific direction by passing in a direction string.
     * @arg {string} direction - any string that begins with u, d, l, or r
     * @returns {Point}
     */
    dir(direction) {
      const error = "direction must be one of: up, down, left, right, u, d, l, r";
      if (typeof direction !== "string") throw new SyntaxError(error);
      direction = direction.toLowerCase();
      if (direction[0] === "u") return this.up;
      if (direction[0] === "d") return this.down;
      if (direction[0] === "l") return this.left;
      if (direction[0] === "r") return this.right;
      throw new SyntaxError(error);
    }
    /** @arg {PointLike} from - the point to measure x against. */
    distX(from) {
      return Math.abs(this.x - from.x);
    }
    /** @arg {PointLike} from - the point to measure y against. */
    distY(from) {
      return Math.abs(this.y - from.y);
    }
    /** @arg {PointLike} from - the point to measure against. */
    distance(from) {
      return Math.hypot(this.distX(from), this.distY(from));
    }
    /** @arg {PointLike} that - the point to test equality against. */
    eq(that) {
      return this.x === that.x && this.y === that.y;
    }
    /** Bounding box corners can be passed in any order.
     * @arg {PointLike} a - one corner of the bounding box
     * @arg {PointLike} b - the opposite corner
     * @returns {boolean} - true if the point is on or in the box
     */
    in(a, b) {
      return between(a.x, this.x, b.x) && between(a.y, this.y, b.y);
    }
    // Play nicely with the rest of the world
    toString() {
      return "Point(" + this.x + "," + this.y + ")";
    }
    /** @returns {PointLike} */
    toJSON() {
      return { x: this.x, y: this.y };
    }
    /** Custom Node.js inspect output for util.inspect and the REPL.
     * @arg {number} _ - The current recursion depth (unused)
     * @arg {NodeJS.InspectOptionsStylized} options - Inspect options including the stylize function
     * @returns {string}
     */
    [/* @__PURE__ */ Symbol.for("nodejs.util.inspect.custom")](_, options) {
      const [y, s, n] = [options.stylize, "special", "number"];
      return `${y("Point", s)}(${y(this.x, n)},${y(this.y, n)})`;
    }
  };

  // node_modules/@slugbugblue/trax/src/version.js
  var version = "1.3.2";

  // node_modules/@slugbugblue/trax/src/engine.js
  /**
  Trax engine.
  @copyright 2019-2026
  @author Chad Transtrum <chad@transtrum.net>
  @license Apache-2.0
  */
  var zero = new Point(0, 0);
  var moveNumberRegex = new RegExp("^\\d+[\\).:]?$", "v");
  var notationRegex = new RegExp("^(?<col>[@a-z]+)(?<row>\\d+)(?<slash>[+\\/\\\\])$", "iv");
  var notationGroups = (match) => (
    /** @type {{col: string, row: string, slash: string}} */
    match.groups
  );
  var tileTypes = ["a", "b", "c", "d", "e", "f"];
  var slash = { a: "\\", b: "+", c: "/", d: "/", e: "+", f: "\\" };
  var symmetry = {
    // Convert tile to different views
    flip: { a: "d", b: "b", c: "f", d: "a", e: "e", f: "c" },
    mirror: { a: "c", b: "b", c: "a", d: "f", e: "e", f: "d" },
    swap: { a: "f", b: "e", c: "d", d: "c", e: "b", f: "a" },
    counterclock: { a: "c", b: "e", c: "f", d: "a", e: "b", f: "d" }
  };
  var applySymmetry = (tile, options = {}) => {
    const { rightToLeft, bottomToTop, rotate, colorSwap } = options;
    if (colorSwap) tile = symmetry.swap[tile];
    if (rightToLeft) tile = symmetry.mirror[tile];
    if (bottomToTop) tile = symmetry.flip[tile];
    if (rotate) tile = symmetry.counterclock[tile];
    return tile;
  };
  var upColor = (t) => "abc".includes(String(t)) ? "b" : "def".includes(String(t)) ? "w" : false;
  var downColor = (t) => "bdf".includes(String(t)) ? "b" : "ace".includes(String(t)) ? "w" : false;
  var rightColor = (t) => "ade".includes(String(t)) ? "b" : "bcf".includes(String(t)) ? "w" : false;
  var leftColor = (t) => "cef".includes(String(t)) ? "b" : "abd".includes(String(t)) ? "w" : false;
  var addBlank = (code) => {
    const lastNumber = (
      /** @type {number} */
      code.codePointAt(code.length - 1)
    );
    return lastNumber > 47 && lastNumber < 57 ? code.slice(0, -1) + String.fromCodePoint(lastNumber + 1) : code + "0";
  };
  var codeRowLength = (row) => row.replaceAll(new RegExp("\\d", "gv"), (n) => ".".repeat(Number(n) + 1)).length;
  var minimalCode = (trax, colorSwap) => {
    let min = "z";
    const bools = [true, false];
    for (const rightToLeft of bools) {
      for (const bottomToTop of bools) {
        for (const rotate of bools) {
          const code = encodePosition(trax, {
            rightToLeft,
            bottomToTop,
            rotate,
            colorSwap
          });
          if (code < min) min = code;
        }
      }
    }
    return min;
  };
  var encodeTile = (trax, tile, loc, options) => {
    const { colorSwap, drops } = options;
    let encoded = applySymmetry(tile, options);
    if (trax.path.includes(trax.tileId(loc))) {
      const pathTurn = colorSwap && trax.turn ? Trax.playerNumber(Trax.other(Trax.colorOf(trax.turn))) : trax.turn;
      encoded = String.fromCodePoint(
        /** @type {number} */
        encoded.codePointAt(0) + pathTurn * 6
      );
    }
    if (drops?.dropped?.some((t) => loc.eq(t.loc))) {
      encoded = encoded.toUpperCase();
    }
    return encoded;
  };
  var encodePosition = (trax, options) => {
    const { rightToLeft, bottomToTop, rotate } = options;
    const startX = rightToLeft ? trax.right : trax.left;
    const startY = bottomToTop ? trax.bottom : trax.top;
    const incX = rightToLeft ? -1 : 1;
    const incY = bottomToTop ? -1 : 1;
    const code = [];
    let line = "";
    let x = startX;
    let y = startY;
    do {
      const loc = new Point(x, y);
      const tile = trax.tileAt(loc);
      if (tile) {
        line += encodeTile(trax, tile, loc, options);
      } else {
        line = addBlank(line);
      }
      if (rotate) {
        y += incY;
        if (y < trax.top || y > trax.bottom) {
          y = startY;
          x += incX;
          code.push(line.replace(new RegExp("\\d$", "v"), ""));
          line = "";
        }
      } else {
        x += incX;
        if (x < trax.left || x > trax.right) {
          x = startX;
          y += incY;
          code.push(line.replace(new RegExp("\\d$", "v"), ""));
          line = "";
        }
      }
    } while (x >= trax.left && x <= trax.right && y >= trax.top && y <= trax.bottom);
    if (rotate) code.reverse();
    return code.join(":");
  };
  var Trax = class _Trax {
    // Static class properties
    /** @readonly */
    static version = version;
    /**
    @readonly
    @type {Record<TraxVariant, string>}
    */
    static names = {
      trax: "Trax",
      traxloop: "Loop Trax",
      trax8: "8x8 Trax"
    };
    /** @readonly */
    static variants = new Set(Object.keys(this.names));
    // Known variants
    // Static class methods
    /**
    Create an x,y Point object with special functions.
    @param {number|PointLike} x - either the x value, or an object with x,y keys
    @param {number} [y] - if x is a number, y must be provided as well
    @returns {Point} a new Point object
    */
    static point = (x, y) => new Point(x, y);
    /**
    Given a player number, get the color.
    @param {number} playerNumber - the player number, 1 or 2
    @returns {Color} the color of that player, w or b
    */
    static colorOf = (playerNumber) => {
      const map = { 1: "w", 2: "b" };
      return map[playerNumber];
    };
    /**
    Given a color, get the player number.
    @param {string} color - the color, w or b
    @returns {number} the player number, 1 or 2
    */
    static playerNumber = (color) => {
      const map = { b: 2, w: 1 };
      return map[color];
    };
    /**
    Given a color, get the other color.
    @param {string} color - the color, w or b
    @returns {Color} the other color, b or w
    */
    static other = (color) => {
      const map = { b: "w", w: "b" };
      return map[color];
    };
    /**
    Encode a numeric column number into the Trax notation column letter.
    @param {number} col - the column number, with 0 just to the left of the tiles
    @returns {string} the encoded column letter
    */
    static encodeCol = (col) => {
      let n = "";
      while (col > 0) {
        n = String.fromCodePoint(65 + (col - 1) % 26) + n;
        col = Math.floor((col - 1) / 26);
      }
      return n || "@";
    };
    /**
    Decode a Trax notation column letter back to a number.
    @param {string} col - the Trax column letter
    @returns {number} the column number
    */
    static decodeCol = (col) => {
      col = col.toUpperCase();
      let n = 0;
      while (col.length > 0) {
        const cp = (
          /** @type {number} */
          col.codePointAt(0)
        );
        n += (cp - 64) * 26 ** (col.length - 1);
        col = col.slice(1);
      }
      return n;
    };
    // Trax class constructor
    /**
    Create a new Trax game
    @param {TraxVariant} [rules='trax'] - the variant to play
    @param {string|string[]} [moves=''] - the initial moves to pre-play
    @param {string} [id='trax'] - an id used to differentiate tiles from multiple games
    */
    constructor(rules = "trax", moves = "", id2 = "trax") {
      if (!_Trax.variants.has(rules)) rules = "trax";
      this.id = String(id2);
      this.rules = rules;
      this.turn = 1;
      this.over = false;
      this.left = 1;
      this.right = 0;
      this.top = 1;
      this.bottom = 0;
      this.count = 0;
      this.moves = [];
      this.frontier = /* @__PURE__ */ new Map();
      this.tiles = {};
      this.path = [];
      this.invalid = false;
      if (moves) {
        this.playMoves(moves);
      }
    }
    /**
    Save the current game data to a variable.
    @returns {SaveState} an opaque save state object
    @see restore for restoring the state
    */
    save() {
      return {
        id: this.id,
        move: this.move,
        turn: this.turn,
        over: this.over,
        left: this.left,
        right: this.right,
        top: this.top,
        bottom: this.bottom,
        moves: [...this.moves],
        frontier: this.frontier.entries().toArray(),
        tiles: JSON.stringify(this.tiles),
        path: JSON.stringify(this.path),
        invalid: this.invalid
      };
    }
    /**
    Restore a previously saved position.
    @param {SaveState} saved - the previously saved state
    @see save for saving the state
    */
    restore(saved) {
      this.id = saved.id;
      this.turn = saved.turn;
      this.over = saved.over;
      this.left = saved.left;
      this.right = saved.right;
      this.top = saved.top;
      this.bottom = saved.bottom;
      this.moves = [...saved.moves];
      this.frontier = new Map(saved.frontier);
      this.tiles = JSON.parse(saved.tiles);
      this.path = JSON.parse(saved.path);
      this.invalid = saved.invalid;
      for (const tile of Object.values(this.tiles)) {
        tile.loc = new Point(tile.loc);
      }
      this.count = Object.keys(this.tiles).length;
    }
    /**
    Lightweight checkpoint for internal rollback. Valid only for ancestor restores.
    Callers must be in a non-over, valid game state — rewind() restores those
    fields to those fixed values rather than saving and restoring them.
    @returns {Checkpoint} a lightweight snapshot of mutable board dimensions
    @typedef {{ move: number, count: number, turn: number, left: number, right: number, top: number, bottom: number }} Checkpoint
    */
    checkpoint() {
      return {
        move: this.move,
        count: this.count,
        turn: this.turn,
        left: this.left,
        right: this.right,
        top: this.top,
        bottom: this.bottom
      };
    }
    /**
    Rewind to a checkpoint. Only valid for ancestor restores.
    @param {Checkpoint} cp - the checkpoint to rewind to
    */
    rewind(cp) {
      this.count = cp.count;
      this.moves.length = cp.move;
      this.turn = cp.turn;
      this.left = cp.left;
      this.right = cp.right;
      this.top = cp.top;
      this.bottom = cp.bottom;
      this.over = false;
      this.invalid = false;
      this.path = [];
      const deleted = [];
      for (const [key, tile] of Object.entries(this.tiles)) {
        if (tile.move <= cp.move) continue;
        deleted.push(tile);
        delete this.tiles[key];
      }
      for (const tile of deleted) {
        if (tile.loc.around.some((adjacent) => this.tileAt(adjacent))) {
          this.frontier.set(tile.id, tile.loc);
        }
        for (const neighbor of tile.loc.around) {
          const neighborId = this.tileId(neighbor);
          if (!this.tileAt(neighbor) && this.frontier.has(neighborId) && neighbor.around.every((adjacent) => !this.tileAt(adjacent))) {
            this.frontier.delete(neighborId);
          }
        }
      }
    }
    /** The name of this variant. */
    get name() {
      return _Trax.names[this.rules];
    }
    /** The move number of the last-played move. */
    get move() {
      return this.moves.length;
    }
    /** The color of the current player, w or b. */
    get color() {
      return _Trax.colorOf(this.turn);
    }
    /** True if the game is over. */
    get gameOver() {
      return this.over;
    }
    /** 1 or 2 for a win, 0 for a tie, false if the game is still in progress. */
    get winner() {
      return this.over ? this.turn : false;
    }
    /**
    Provides the tile ID for the tile at the given location.
    @param {PointLike} loc - the location
    @returns {TileId} a string key encoding this game's id and the location
    */
    tileId(loc) {
      return this.id + "-" + String(loc.x) + "x" + String(loc.y);
    }
    /**
    Add a tile to the board. Note that no validity checking is done here,
    except that invalid tiles are not actually placed on the board, so this
    should only be called externally.
    @param {TileType} type - letter 'a'-'f' for valid tiles, 'x' for invalid
    @param {Point} loc - the location
    @returns {Tile} the tile placed on the board
    */
    addTile(type, loc) {
      const id2 = this.tileId(loc);
      const tile = { type, loc, id: id2, move: this.move, seq: this.count };
      if (type === "x") {
        this.invalid = true;
      } else {
        this.tiles[id2] = tile;
        this.count++;
        this.frontier.delete(id2);
        for (const neighbor of loc.around) {
          const neighborId = this.tileId(neighbor);
          if (!Object.hasOwn(this.tiles, neighborId)) {
            this.frontier.set(neighborId, neighbor);
          }
        }
        this.left = Math.min(this.left, loc.x);
        this.right = Math.max(this.right, loc.x);
        this.top = Math.min(this.top, loc.y);
        this.bottom = Math.max(this.bottom, loc.y);
      }
      return tile;
    }
    /**
    The type of tile at the given location.
    @param {PointLike} loc - the location the tile is in
    @returns {ValidTiles|undefined} the type of tile, or undefined if no tile
    */
    tileAt(loc) {
      return (
        /** @type {ValidTiles | undefined} */
        (this.tiles[this.tileId(loc)] || {}).type
      );
    }
    /**
    Is this tile valid?
    @type {(type: string, loc: Point) => type is ValidTiles}
    */
    validTile(type, loc) {
      if (this.count === 0 && loc.x === 0 && loc.y === 0) {
        return type === "d" || type === "e";
      }
      const up = downColor(this.tileAt(loc.up));
      const down = upColor(this.tileAt(loc.down));
      const left = rightColor(this.tileAt(loc.left));
      const right = leftColor(this.tileAt(loc.right));
      return (up || down || left || right) && (!up || up === upColor(type)) && (!down || down === downColor(type)) && (!left || left === leftColor(type)) && (!right || right === rightColor(type));
    }
    /**
    Get a list of possible tiles that can be played in this location.
    @param {Point} loc - the location to check
    @param {string} [slashFilter] - if provided, a direction modifier, '/', '\\', or '+'
    @returns {TileType[]} the list of valid tile types for this location
    */
    possibleTiles(loc, slashFilter) {
      const possibles = [];
      for (const t of tileTypes) {
        if ((!slashFilter || slashFilter === slash[t]) && this.validTile(t, loc)) {
          possibles.push(t);
        }
      }
      return possibles;
    }
    get height() {
      return this.bottom - this.top + 1;
    }
    get width() {
      return this.right - this.left + 1;
    }
    /**
    Determine if a location is valid to play in.
    @param {Point} loc - the location to check
    @returns {boolean} true if a tile can be placed here
    */
    validLocation(loc) {
      if (this.over || this.tileAt(loc)) return false;
      if (this.count === 0 && loc.eq(zero)) return true;
      if (this.rules === "trax8" && (this.width > 7 && (loc.x < this.left || loc.x > this.right) || this.height > 7 && (loc.y < this.top || loc.y > this.bottom))) {
        return false;
      }
      for (const location of loc.around) {
        if (this.tileAt(location)) return true;
      }
      return false;
    }
    /**
    Find all possible locations to play in. Note that these are not
    necessarily valid locations, just empty ones that border existing tiles.
    @returns {Point[]} all frontier locations
    */
    possibleLocations() {
      return this.count === 0 ? [zero] : this.frontier.values().toArray();
    }
    /**
      Find all possible moves as a list of notations,
      ie: ['@1+', '@1/', '@1\\', ...]
    
      @returns {string[]} all valid move notations from the current position
      */
    possibleMoves() {
      const possibles = [];
      if (this.over) return possibles;
      for (const loc of this.possibleLocations()) {
        for (const tile of this.possibleTiles(loc)) {
          const drop = this.dropTile(tile, loc, "tentative");
          if (drop.valid) possibles.push(drop.notation);
        }
      }
      return possibles;
    }
    /**
    Called after a move was just played, to determine the forced moves.
    @param {Point} loc - the location just played at
    @returns {Tile[]} a list of tiles that should be added as part of the move
    */
    forcedMoves(loc) {
      const forced = [];
      const invalids = {};
      let check = loc.around;
      while (check.length > 0) {
        const pos = (
          /** @type {Point} */
          check.shift()
        );
        if (!this.validLocation(pos)) continue;
        const possibles = this.possibleTiles(pos);
        if (possibles.length === 1) {
          forced.push(this.addTile(possibles[0], pos));
          check = [...check, ...pos.around];
        } else if (possibles.length === 0) {
          const invalid = this.addTile("x", pos);
          if (!Object.hasOwn(invalids, invalid.id)) forced.push(invalid);
          invalids[invalid.id] = true;
        }
      }
      return forced;
    }
    /**
    Determine the notation for a move. Note that this must be determined
    BEFORE the move is placed on the board.
    @param {ValidTiles} type - the tile placed on the board
    @param {Point} loc - the location the tile is placed
    @returns {string} the notation of the move
    */
    notate(type, loc) {
      let notation = _Trax.encodeCol(loc.x - this.left + 1);
      notation += String(loc.y - this.top + 1);
      notation += slash[type];
      return notation;
    }
    /**
    Turn a move notation into a tile type and location.
    @param {string} notation - a notation for a single move to be played at
    the current board position
    @returns {RawMove} the tile type and location of the move
    */
    decodeNotation(notation) {
      const bad = { type: "x", loc: zero };
      const match = notation.match(notationRegex);
      if (match === null) return bad;
      const { col, row, slash: slashType } = notationGroups(match);
      const loc = new Point(
        this.left - 1 + _Trax.decodeCol(col),
        this.top - 1 + Number(row)
      );
      const possible = this.possibleTiles(loc, slashType);
      return possible.length > 0 ? { type: possible[0], loc } : bad;
    }
    /**
    Follow a color from one location through one or more tiles to the other
    end of the color line.
    @param {Color} color - the color to follow
    @param {Point} loc - the location to start
    @param {string} from - the edge of the tile to start from
    @returns {LineEnd} the ending location and a list of the tile ids the path
    takes to get there
    */
    follow(color, loc, from) {
      const path = [];
      let id2 = this.tileId(loc);
      let tile = this.tileAt(loc);
      while (tile && path[0] !== id2) {
        if (from !== "top" && upColor(tile) === color) {
          from = "bottom";
          loc = loc.up;
        } else if (from !== "bottom" && downColor(tile) === color) {
          from = "top";
          loc = loc.down;
        } else if (from !== "left" && leftColor(tile) === color) {
          from = "right";
          loc = loc.left;
        } else if (from !== "right" && rightColor(tile) === color) {
          from = "left";
          loc = loc.right;
        }
        path.push(id2);
        id2 = this.tileId(loc);
        tile = this.tileAt(loc);
      }
      return { loc, path };
    }
    /**
    Given a tile and a color, follow the line for that color to each end.
    @param {Color} color - the color of ends of interest
    @param {Point} loc - the location of the tile of interest
    @returns {LineEnd[]} a list of two items, each one end of the line
    */
    findEnds(color, loc) {
      const ends = [];
      const tile = this.tileAt(loc);
      if (upColor(tile) === color) ends.push(this.follow(color, loc, "top"));
      if (downColor(tile) === color) ends.push(this.follow(color, loc, "bottom"));
      if (leftColor(tile) === color) ends.push(this.follow(color, loc, "left"));
      if (rightColor(tile) === color) ends.push(this.follow(color, loc, "right"));
      return ends;
    }
    /**
    Determine if a given line ends the game.
    @param {Point} locA - one end of the line
    @param {Point} locB - the other end of the line
    @returns {boolean} true if this line wins the game
    */
    lineWin(locA, locB) {
      if (this.rules === "traxloop") return false;
      return this.width > 7 && locA.distX(locB) > this.width || this.height > 7 && locA.distY(locB) > this.height;
    }
    /**
    Find the winning path for a color, if it has won with any of the given tiles.
    @param {Color} color - the color to check
    @param {Tile[]} tiles - a list of the tiles placed during the last move
    @returns {TileId[]|undefined} the winning path, or undefined if no win
    */
    winningPath(color, tiles) {
      for (const tile of tiles) {
        const [end1, end2] = this.findEnds(color, tile.loc);
        if (end1.loc.eq(end2.loc)) return end1.path;
        if (this.lineWin(end1.loc, end2.loc)) {
          return [...end1.path.toReversed(), ...end2.path.slice(1)];
        }
      }
    }
    /**
    Determine if the game has ended.
    @param {Tile[]} tiles - a list of the tiles placed during the last move
    */
    checkWin(tiles) {
      let winner;
      const colors = [this.color, _Trax.other(this.color)];
      for (const color of colors) {
        const path = this.winningPath(color, tiles);
        if (path) {
          winner = color;
          this.path = path;
          break;
        }
      }
      if (winner) {
        this.over = true;
        this.turn = _Trax.playerNumber(winner);
      } else if (
        // 8x8 Trax can end in a tie once there are no valid moves left
        this.rules === "trax8" && this.width > 7 && this.height > 7 && this.possibleMoves().length === 0
      ) {
        this.over = true;
        this.turn = 0;
      }
    }
    /**
    Play a move. Can be called either as:
    - play(moveNumber, notation) to ensure move safety, or
    - play(notation) for quicker access.
    @param {number|string} moveNumber - the move number or the notation
    @param {string} [notation] - the notation, if a move number was provided
    @returns {{dropped: Tile[], notation: string, valid: boolean}} the result of the move
    */
    play(moveNumber, notation) {
      if (notation) {
        if (moveNumber !== this.move + 1) {
          return { dropped: [], notation: "", valid: false };
        }
      } else {
        notation = String(moveNumber);
      }
      return this.dropTile(notation);
    }
    /**
    Play one or more moves.
    @param {string|string[]} moves - the list of moves, provided either as a
    space-separated string of notations, or as a list of notations. Move
    numbers are optional, but if provided will be checked for accuracy.
    */
    playMoves(moves) {
      if (Array.isArray(moves)) {
        moves = moves.join(" ");
      }
      moves = moves.replaceAll("\n", " ").split(new RegExp("\\s+", "v"));
      let moveNumber = 0;
      for (const move of moves) {
        if (moveNumberRegex.test(move)) {
          moveNumber = Number(move.replaceAll(new RegExp("\\D", "gv"), ""));
        }
        if (!notationRegex.test(move)) continue;
        if (moveNumber) {
          this.play(moveNumber, move);
        } else {
          this.play(move);
        }
        moveNumber = 0;
      }
    }
    /** The formatted notation string for the current game, wrapped at 80 columns. */
    get notation() {
      let result = "";
      let lineLength = 0;
      for (const [i, move] of this.moves.entries()) {
        const note = `${i + 1}. ${move}`;
        if (result) {
          if (lineLength + 1 + note.length > 79) {
            result += `
${note}`;
            lineLength = note.length;
          } else {
            result += ` ${note}`;
            lineLength += 1 + note.length;
          }
        } else {
          result = note;
          lineLength = note.length;
        }
      }
      return result;
    }
    /**
    Drop a tile onto the board. This is a lower level call. Use play() if possible instead.
    @param {string|ValidTiles} type - a special move, a tile type, or a notation
    @param {Point} [loc] - a location if type is a tile type
    @param {string|boolean} [tentative] - if truthy, the move will not be saved
    @returns {TileDrop} an object representing the results of the drop
    */
    dropTile(type, loc, tentative) {
      let dropped = [];
      let notation = "";
      let isValid = false;
      if (["timeout", "resign", "draw", "puzzled"].includes(type)) {
        this.over = true;
        if (type !== "puzzled") {
          this.turn = this.turn === 1 ? 2 : 1;
          if (type === "draw") this.turn = 0;
        }
        this.moves.push(type);
        notation = type;
        isValid = true;
      } else {
        if (type.search(notationRegex) === 0) {
          const decoded = this.decodeNotation(type);
          type = decoded.type;
          loc = decoded.loc;
        }
        if (loc && this.validLocation(loc) && this.validTile(type, loc)) {
          isValid = true;
          const cp = this.checkpoint();
          notation = this.notate(type, loc);
          this.moves.push(notation);
          dropped.push(this.addTile(type, loc));
          dropped = [...dropped, ...this.forcedMoves(loc)];
          if (tentative || this.invalid) {
            if (this.invalid) isValid = false;
            this.rewind(cp);
          } else {
            this.checkWin(dropped);
            if (!this.over) this.turn = this.turn === 1 ? 2 : 1;
          }
        }
      }
      return { dropped, notation, valid: isValid };
    }
    /**
    Symmetry helper. Finds the images of a move under the eight symmetries of
    the board (four rotations, each with its mirror image) in case we are trying
    to play a symmetrical rather than an exact move. Tile slashes can change
    under a symmetry, so both are offered for each location; the caller decides
    which actually plays. The move itself is always first.
    @param {string} move - the notation of the move to be rotated
    @returns {string[]} the distinct symmetric images of this move
    */
    moveRotations(move) {
      const match = move.match(notationRegex);
      if (match === null) return [];
      const { col, row, slash: s } = notationGroups(match);
      const x = _Trax.decodeCol(col);
      const y = Number(row);
      const w = this.width + 1;
      const h = this.height + 1;
      const locations = [
        [x, y],
        [w - x, y],
        [x, h - y],
        [w - x, h - y],
        [y, x],
        [w - y, x],
        [y, h - x],
        [w - y, h - x]
      ];
      const slashes = s === "+" ? [s] : [s, s === "/" ? "\\" : "/"];
      const moves = /* @__PURE__ */ new Set();
      for (const [c, r] of locations) {
        if (c < 0 || r < 0) continue;
        for (const mark of slashes) moves.add(_Trax.encodeCol(c) + r + mark);
      }
      return [...moves];
    }
    /**
    Play a provisional move if it matches the current position. A provisional
    move is one saved ahead of time: the `from` position, the `via` move, and the
    `to` position it should reach. When the current position matches `from`, the
    move (or its symmetrical equivalent) is played on this board, so on success
    the board has advanced by one move. In every other case the board is left
    untouched. To only look up the equivalent move without playing it, wrap the
    call in `checkpoint()` and `rewind()`.
    @param {string} from - the canonical encoding of the starting position (or,
    during the `normalize()` deprecation period, a normalized encoding)
    @param {string} to - the canonical (or normalized) encoding of the ending
    position, in the same encoding as `from`
    @param {string} via - the move to be used to transition
    @returns {false|string} if the provisional move doesn't match this position
    (nothing is played): false; if it will never match any future position
    (nothing is played): 'delete-provisional'; if it matches, the move was
    played, and the notation actually played is returned, which may be
    symmetrically adjusted (rotated or reflected) from `via` as needed
    */
    provisionalMove(from, to, via) {
      const isLegacy = ["W", "B", "T"].includes(from[0]);
      const code = isLegacy ? from.slice(1) : from;
      const lines = code.split(":");
      let cols = 0;
      for (const line of lines) {
        cols = Math.max(cols, codeRowLength(line));
      }
      const rows = lines.length;
      if (this.width > rows && this.height > cols || this.width > cols && this.height > rows) {
        return "delete-provisional";
      }
      if (from === (isLegacy ? this.normalized : this.canonical)) {
        const cp = this.checkpoint();
        for (const move of this.moveRotations(via)) {
          const drop = this.dropTile(move);
          if (!drop.valid) continue;
          if (to === (isLegacy ? this.normalized : this.canonical)) return move;
          this.rewind(cp);
        }
      }
      return false;
    }
    /**
    Get an encoded representation of the current position, useful for drawing
    the board without having to do much analysis.
    @returns {string} the current position code
    */
    get icon() {
      return this.positionCode();
    }
    /**
    Get an encoded representation of the current position, with a set of
    tiles highlighted differently, useful for showing the effects of a move.
    @param {TileDrop} drops - the drops of the most recent play
    @returns {string} the current position code, with drops highlighted
    */
    dropsIcon(drops) {
      return this.positionCode(void 0, void 0, void 0, drops);
    }
    /**
    Symmetry helper, draw the board from different angles.
    @param {boolean} [rightToLeft] - reverse order horizontally
    @param {boolean} [bottomToTop] - reverse order vertically
    @param {boolean} [rotate] - rotate the tiles by 90 degrees
    @param {TileDrop} [drops] - the drops of the most recent play, if you want
    them highlighted
    @returns {string} an encoding of the position
    */
    positionCode(rightToLeft, bottomToTop, rotate, drops) {
      return encodePosition(this, { rightToLeft, bottomToTop, rotate, drops });
    }
    /**
    Trax has the potential for symmetry, so this gives us the ability to
    examine horizontal, vertical, and rotational symmetry for a color.
    @deprecated Prefer `canonical`, which also collapses color-swapped
    duplicates - the same puzzle played by the other side. `normalize()` is
    kept for callers (such as `provisionalMove()`) that need a code sensitive
    to which color is to move, and is likely to be removed in a future major
    version.
    @returns {string} a position code that matches all symmetrical positions
    */
    normalize() {
      return (this.color || "t").toUpperCase() + minimalCode(this);
    }
    /**
    Get the normalized code for this position. All symmetrical positions will
    result in the same normalized code.
    @deprecated Prefer `canonical`; see `normalize()`.
    @returns {string} the normalized position code
    */
    get normalized() {
      return this.normalize();
    }
    /**
    Get the canonical code for this position: colors are swapped, if needed,
    so the code always reads as though white were about to move (or, once the
    game is over, as though white won), then minimized across all 8
    rotations/mirrors. Two positions that are identical up to a color swap and
    board symmetry - the same puzzle, played by the other side - produce the
    same canonical code. A tied game has no winner to canonicalize around, so
    its colors are left as-is.
    @returns {string} the canonical position code
    */
    get canonical() {
      return minimalCode(this, this.turn === 2);
    }
  };

  // shim/util.js
  var inspect = { custom: /* @__PURE__ */ Symbol.for("nodejs.util.inspect.custom") };

  // node_modules/@slugbugblue/lru/lru.js
  /** Least Recently Used cache
   * @copyright 2023-2026
   * @author Chad Transtrum <chad@transtrum.net>
   * @license Apache-2.0
   */
  var LRU = class {
    /** @type {Map<K, V>} */
    #cache;
    #capacity = 0;
    #hits = 0;
    #misses = 0;
    #expired = 0;
    /** Instantiate this class with the max number of cached items
     * @arg {number} capacity - the maximum number of items to cache
     */
    constructor(capacity = 1e3) {
      this.#cache = /* @__PURE__ */ new Map();
      if (typeof capacity === "number" && capacity >= 1) {
        this.#capacity = Math.floor(capacity);
      } else {
        throw new SyntaxError("capacity must be a positive integer");
      }
    }
    /** The maximum capacity. */
    get capacity() {
      return this.#capacity;
    }
    /** The current size. */
    get size() {
      return this.#cache.size;
    }
    /** Number of times we have had a cache hit. */
    get hits() {
      return this.#hits;
    }
    /** Number of times we have had a cache miss. */
    get misses() {
      return this.#misses;
    }
    /** Number of times we have expired a cache entry. */
    get expired() {
      return this.#expired;
    }
    /** Retrieve an item from the cache.
     * @arg {K} key - the key of the cached item
     * @returns {V | undefined} - the cached item or undefined
     */
    get(key) {
      if (this.#cache.has(key)) {
        const value = this.#cache.get(key);
        this.#cache.delete(key);
        this.#cache.set(
          key,
          /** @type {V} */
          value
        );
        this.#hits++;
      } else {
        this.#misses++;
      }
      return this.#cache.get(key);
    }
    /** Retrieve an item from the cache without triggering any LRU handling.
     * @arg {K} key - the key of the cached item to retrieve
     * @returns {V | undefined} - the cached item or undefined
     */
    peek(key) {
      return this.#cache.get(key);
    }
    /** Store an item in the cache.
     * @arg {K} key - the key of the cached item
     * @arg {V} value - the value to store
     */
    set(key, value) {
      this.#cache.delete(key);
      if (this.#cache.size >= this.#capacity) {
        this.#expired++;
        const [expire] = (
          /** @type {[K, V]} */
          this.#cache[Symbol.iterator]().next().value
        );
        this.#cache.delete(expire);
      }
      this.#cache.set(key, value);
    }
    /** Delete an item from the cache.
     * @arg {K} key - the key of the cached item
     * @returns {boolean} true if the item was in the cache
     */
    delete(key) {
      return this.#cache.delete(key);
    }
    /** Clear the cache and all its statistics. */
    clear() {
      this.#cache.clear();
      this.#hits = 0;
      this.#misses = 0;
      this.#expired = 0;
    }
    /** Get an iterator to return [key, value] pairs from the cache. Does not
     * update any LRU information.
     * @returns {IterableIterator<[K, V]>}
     */
    entries() {
      return this.#cache.entries();
    }
    /** Determine if a key is already in the cache. Does not trigger hit/miss.
     * @arg {K} key - the key to check
     * @returns {boolean} true if the key is in the cache
     */
    has(key) {
      return this.#cache.has(key);
    }
    /** Get an iterator for the keys stored in cache, in order from least to most
     * recent. Does not update any LRU information.
     * @returns {IterableIterator<K>}
     */
    keys() {
      return this.#cache.keys();
    }
    /** Get an iterator for the values stored in cache, in order from least to
     * most recent. Does not update any LRU information.
     * @returns {IterableIterator<V>}
     */
    values() {
      return this.#cache.values();
    }
    // Play nicely with the rest of the world
    toString() {
      return `LRU(${this.#cache.size} of ${this.#capacity})`;
    }
    [/* @__PURE__ */ Symbol.for("nodejs.util.inspect.custom")](_, options) {
      const { stylize } = options;
      return `${stylize("LRU", "special")}(${stylize(`${this.#cache.size}`, "number")} of ${stylize(`${this.#capacity}`, "number")})`;
    }
  };

  // node_modules/@slugbugblue/trax-analyst/src/threats.js
  /**
  Threats database: hand-coded threats
  @copyright 2022-2023
  @author Chad Transtrum <chad@transtrum.net>
  @license Apache-2.0
  */
  var REGEX = {
    // Some of these are one for one:
    // a: White that pairs with the next white
    A: "[am]",
    // White maybe in a hollow that pairs with next white
    // c: White that forms a connectable pair with next white
    C: "[cp]",
    // White maybe in a hollow connectable pair with next white
    l: "[lmp]",
    // Any White in a hollow
    // m: "a" in a hollow
    // p: "c" in a hollow)
    w: "[acw]",
    // Any white except in hollows
    W: "[aclmpw]",
    // Any white at all
    "!": "(?:b[acw])*?",
    // Ripple black/white
    "\xA1": "(?:[acw]b)*?",
    // Ripple white/black
    "*": "b*?",
    // Zero or more black pieces
    "?": "b?"
    // Zero or one black piece
  };
  var Threat = class {
    #depth = 0;
    #pattern = "";
    #rx;
    #doesReform = false;
    /**
    Creates a Threat with the given depth, pattern, and optional reforms flag.
    @param {number} depth - the number of moves required to activate
    @param {string} pattern - the source pattern string
    @param {boolean} [doesReform] - if true, this threat gets extra scoring weight
    */
    constructor(depth, pattern, doesReform = false) {
      this.#depth = depth;
      this.#pattern = pattern;
      this.#doesReform = doesReform;
      let rx = "";
      for (const char of pattern) {
        rx += REGEX[char] || char;
      }
      this.#rx = new RegExp("(?=(" + rx + "))", "gv");
    }
    get depth() {
      return this.#depth;
    }
    get pattern() {
      return this.#pattern;
    }
    get rx() {
      return this.#rx;
    }
    get value() {
      return this.#doesReform ? 2 : 1;
    }
    // To make life at the REPL a little easier
    /**
    Custom Node.js inspect output for the REPL.
    @param {unknown} _ - unused inspect depth
    @param {{ stylize: (text: unknown, style: string) => string }} out - inspect options
    */
    [inspect.custom](_, out) {
      const style = out.stylize;
      const display = [
        "[" + style("Threat", "special") + "]",
        "{",
        style(this.#pattern, "string") + ":",
        style(this.#depth, "number"),
        this.#doesReform ? "!" : "",
        "}"
      ];
      return display.filter((d) => d !== "").join(" ");
    }
  };
  var ThreatsDB = class {
    /** @type {Record<string, Threat>} */
    #db = {};
    #depth = 0;
    /**
    Creates a ThreatsDB seeded with corner patterns.
    @param {string[]} corners - the corner pattern strings to register at depth 0
    */
    constructor(corners2) {
      for (const corner of corners2) {
        this.add(0, corner);
      }
    }
    /**
    Compose a threat by normalizing interior A/W chars and registering it.
    @param {number} depth - the depth level of the composed threat
    @param {string} pattern - the raw pattern string
    */
    compose(depth, pattern) {
      pattern = pattern.replaceAll(new RegExp("(?<=.)A", "gv"), "a").replaceAll(new RegExp("W(?=.)", "gv"), "w");
      return this.add(depth, pattern);
    }
    /**
    Register a new threat pattern at the given depth.
    @param {number} depth - the depth level of the threat
    @param {string} pattern - the raw pattern string
    @param {boolean} [doesReform] - if true, the threat gets extra scoring weight
    */
    add(depth, pattern, doesReform = false) {
      this.#depth = Math.max(depth, this.#depth);
      if (Object.hasOwn(this.#db, pattern)) {
        throw new Error("Duplicate pattern: " + pattern);
      }
      this.#db[pattern] = new Threat(depth, pattern, doesReform);
      return this.#db[pattern];
    }
    /**
    Returns all threats at the given depth level.
    @param {number} depth - the depth to filter by
    */
    level(depth) {
      return Object.values(this.#db).filter((p) => p.depth === depth);
    }
    get list() {
      return Object.values(this.#db);
    }
    get maxDepth() {
      return this.#depth;
    }
    // To make life at the REPL a little easier
    /**
    Custom Node.js inspect output for the REPL.
    @param {unknown} _ - unused inspect depth
    @param {{ stylize: (text: unknown, style: string) => string }} out - inspect options
    */
    [inspect.custom](_, out) {
      const style = out.stylize;
      const inspection = "[" + style("Threats", "special") + ":";
      let total = 0;
      const keys = ["{"];
      for (let x = 0; x <= this.#depth; x++) {
        const count = this.level(x).length;
        keys.push(style(x, "string") + ":" + style(count, "number"));
        total += count;
      }
      return inspection + style(total, "number") + "] " + keys.join(" ") + " }";
    }
  };
  var pre = "pre";
  var post = "post";
  var corners = {
    ArW: { pre, post },
    // Simple corner
    AbrW: { post },
    // Wide-first corner
    ArbW: { pre },
    // Wide-second corner
    AbrbW: {},
    // Wide corner
    "ab?bW": { pre, post },
    // Flat corner and wide flat corner
    CW: { pre, post },
    // Connectable pair
    CbW: {}
    // Wide connectable pair
  };
  var threats = new ThreatsDB(Object.keys(corners));
  var attacks = [
    "a?W",
    // Simple attack and wide attack
    "m?W"
    // Simple and wide attack in a corner
  ];
  for (const a of attacks) threats.add(1, a);
  var reformAttacks = [
    "rm?lr",
    // Cave/wide cave attack
    "rbm?lbr",
    // Deep cave/deep wide cave attack (impossibly rare?)
    "ral?mrW",
    // Attack at top of cave; tolerates an extra black between the two hollows
    "arl?mwr"
    // Reversed
  ];
  for (const ra of reformAttacks) threats.add(1, ra, true);
  var reformThreats = [
    "rp?lr",
    // Cave/wide cave threat
    "rbp?lbr",
    // Deep cave/deep wide cave threat (impossibly rare?)
    "rmbb???w",
    // Black corner with a long white loop potential
    "abb???lr",
    // Reverse
    "a?rl?mrw",
    // Threat at top of cave, possible first wide corner
    "arl?mrbw"
    // Same, but with the second corner wide instead
  ];
  for (const rt of reformThreats) threats.add(2, rt);
  for (const [one, oneCorner] of Object.entries(corners)) {
    const start = one.replace("W", "l");
    let end = one.replace(new RegExp("a", "iv"), "m").replace("C", "p");
    const preFiller = oneCorner.post ? "?" : "";
    let postFiller = oneCorner.pre ? "?" : "";
    threats.compose(3, start + preFiller + "\xA1rm?W");
    threats.compose(3, "a?lr!" + postFiller + end);
    threats.compose(3, one + "\xA1ab*bwr");
    threats.compose(3, "rab*bw!" + one);
    threats.compose(3, one + "!brm*bW");
    threats.compose(3, one + "!bbrmW");
    threats.compose(3, "ab*lrb\xA1" + one);
    threats.compose(3, "alrbb\xA1" + one);
    threats.compose(4, one + "!b*b\xA1ra?lr");
    threats.compose(4, "rm?wr!b*b\xA1" + one);
    for (const [two, twoCorner] of Object.entries(corners)) {
      end = two.replace(new RegExp("a", "iv"), "m").replace("C", "p");
      postFiller = twoCorner.pre ? "?" : "";
      if (preFiller) {
        threats.compose(2, start + preFiller + "\xA1" + two);
        threats.compose(3, start + preFiller + "rb\xA1" + two);
        threats.compose(3, start + "?!rb\xA1" + two);
      }
      if (postFiller) {
        threats.compose(2, one + postFiller + "!" + end);
        threats.compose(3, one + postFiller + "!br" + end);
        threats.compose(3, one + "!br\xA1?" + end);
      }
      if (preFiller && postFiller) {
        threats.compose(3, start + "r" + end);
      }
      threats.compose(3, one + "!b*b\xA1" + two);
    }
  }
  threats.add(3, "Arl?\xA1rmrW");
  threats.add(3, "ralbmrW");
  threats.add(3, "Arlbmwr");
  threats.add(3, "arlrbwmrw");
  threats.add(3, "arlbbarw");
  threats.add(4, "wbrblrbabrw", true);
  threats.add(4, "rb\xA1c?w!br");
  threats.add(4, "ArlbmrW");
  threats.add(5, "A?rwarlrar?W");
  threats.add(4, "A?rlr!bralrar?W");
  threats.add(4, "A?rlrbrmrwar?W");
  threats.add(4, "A?rlr!bramrar?W");
  threats.add(3, "A?rlr!brm?wr!brmrW");
  threats.add(6, "Arw!b?rarlr");
  threats.add(5, "Arw!b?brbralr");
  threats.add(4, "Arw!b?brb\xA1arbW");
  threats.add(5, "Arw!b?brb\xA1rmrW");
  threats.add(4, "Arw!b?brb\xA1rmwr");
  threats.add(4, "A?r?w!b?\xA1brb\xA1a?r?W");

  // node_modules/@slugbugblue/trax-analyst/src/analyst.js
  /**
  Analyst module: provides analysis functions for Trax games.
  @copyright 2022-2026
  @author Chad Transtrum <chad@transtrum.net>
  @license Apache-2.0
  */
  var cache = new LRU(2750);
  var id = () => {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let code = "";
    while (code.length < 6) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return "analysis-" + code;
  };
  var byScoreDesc = (a, b) => b.score - a.score;
  var withinX = (highest, tolerance) => (s) => s.score === highest || highest - s.score <= tolerance;
  var randomDraw = (array) => array[Math.floor(Math.random() * array.length)];
  var leftTurn = { d: "r", l: "d", r: "u", u: "l" };
  var rightTurn = { d: "l", l: "u", r: "d", u: "r" };
  var follow = { d: "right", l: "bottom", r: "top", u: "left" };
  var edgeColor = (tile, dir) => ({ d: "ace", l: "abd", r: "bcf", u: "def" }[dir] ?? "").includes(tile) ? "w" : "b";
  var encodeNumber = (n) => String.fromCodePoint(48 + n);
  var spelunk = (rawEdge) => {
    for (let index = 1; index < rawEdge.length - 1; index++) {
      if (rawEdge[index].t !== "C") continue;
      const blank = () => ({ x: 0, y: 0, c: "", t: "" });
      const next = rawEdge[index + 1] || blank();
      if (next.t === "c") next.t = "C";
      const previous = rawEdge[index - 1] || blank();
      if (previous.t === "c") {
        previous.t = "C";
        if (index > 1) index -= 2;
      }
    }
    for (const space of rawEdge) {
      if (space.t === "c") space.t = "n";
      if (space.t === "C") space.t = "c";
    }
    return rawEdge;
  };
  var hollowOut = (rawEdge) => {
    for (let index = 1; index < rawEdge.length - 1; index++) {
      const space = rawEdge[index];
      if (space.c === "l") {
        Object.assign(space, rawEdge[index - 1], rawEdge[index + 1]);
        space.c = "l";
        rawEdge = rawEdge.toSpliced(index + 1, 1).toSpliced(index - 1, 1);
      }
    }
    return rawEdge;
  };
  var findPair = (rawEdge, index, color, pairs) => {
    const colors = /* @__PURE__ */ new Set([color, "l"]);
    const space = rawEdge[index];
    const nColor = "n" + color;
    for (const x of [1, 2]) {
      let j = x + index;
      if (j >= rawEdge.length) j -= rawEdge.length;
      const next = rawEdge[j];
      if (colors.has(next.c) && space[nColor] !== next[nColor]) {
        const one = color + space[nColor];
        const two = color + next[nColor];
        pairs[one + "-" + two] = index;
        if (Object.hasOwn(pairs, two + "-" + one)) {
          for (const y of [index, pairs[two + "-" + one]]) {
            rawEdge[y]["p" + color] = true;
          }
        }
        break;
      }
      if (next.c === "r") {
        break;
      }
    }
    for (let x = 1; x < rawEdge.length; x++) {
      let j = index + x;
      if (j >= rawEdge.length) j -= rawEdge.length;
      if (colors.has(rawEdge[j].c)) {
        space[color] = rawEdge[j][nColor] === space[nColor];
        break;
      }
    }
  };
  var pairUp = (rawEdge) => {
    const pairs = {};
    for (const [index, space] of rawEdge.entries()) {
      for (const bw of ["w", "b"]) {
        const colors = [bw, "l"];
        if (colors.includes(space.c)) {
          findPair(rawEdge, index, bw, pairs);
        }
      }
    }
    return rawEdge;
  };
  var label = (rawEdge) => {
    const final = { w: "", b: "", edge: rawEdge };
    let index = 0;
    for (const space of rawEdge) {
      for (
        const bw of
        /** @type {('b' | 'w')[]} */
        ["b", "w"]
      ) {
        const colors = /* @__PURE__ */ new Set([bw, "l"]);
        let z = "w";
        if (colors.has(space.c)) {
          if (bw === "b" ? space.pb : space.pw) z = "c";
          if (bw === "b" ? space.b : space.w) z = "a";
          if (space.c === "l") z = { w: "l", a: "m", c: "p" }[z] ?? z;
        } else {
          z = space.c === "r" ? "r" : "b";
        }
        if (space.t === "x") z = "x";
        space["z" + bw] = z;
        final[bw] += z;
      }
      space.idx = index;
      index += 1;
    }
    return final;
  };
  var length = (array) => array?.length || 0;
  var attackScore = (from, level, as) => {
    const count = length(from[level]);
    const calculateAs = Math.min(as === void 0 ? level : as, threats.maxDepth);
    if (calculateAs < 1) return count;
    return count * 10 ** (threats.maxDepth - calculateAs + 1);
  };
  var attackCount = (from) => length(from["1"]);
  var threatCount = (from, level) => length(from[level]);
  var passiveCount = (from) => {
    let count = 0;
    for (const [depth, array] of Object.entries(from)) {
      count += Number(depth) > 1 ? length(array) : 0;
    }
    return count;
  };
  var isActiveAttack = (from) => attackCount(from) > 1 || attackCount(from) === 1 && passiveCount(from) > 0;
  var isPassiveAttack = (from) => passiveCount(from) > 1;
  var isUnderThreat = (from) => attackCount(from) + passiveCount(from) > 0;
  function* matchesUpTo(string, rx, limit) {
    for (const match of string.matchAll(rx)) {
      if (match.index >= limit) return;
      yield match;
    }
  }
  var Analysis = class {
    /** @type {TraxVariant} */
    #rules = "trax";
    #id = "analysis";
    /** @type {string[]} - List of moves to arrive at this position */
    #moves = [];
    #notation = "";
    /** @type {EdgeObject | undefined} */
    #edge = void 0;
    /** @type {Trax} */
    #game;
    /** @type {Scores | undefined} */
    #scores = void 0;
    /** @type {FoundThreatsCollection | undefined} */
    #threats = void 0;
    #validated = false;
    /**
    Creates an Analysis for the given Trax game state.
    @param {Trax} game - the Trax game to analyze (gets copied on init)
    */
    constructor(game) {
      this.#rules = game.rules;
      this.#moves = game.moves;
      this.#id = id();
      this.#notation = game.notation;
      this.#game = new Trax(this.#rules, this.#moves, this.#id);
      this.count = {
        w: (level) => this.threats.w[level]?.length || 0,
        b: (level) => this.threats.b[level]?.length || 0
      };
      this.faulty = { b: [], w: [] };
      this.#validated = false;
      if (this.#moves.length === 0 || game.over) {
        this.#edge = { b: "", w: "", edge: [] };
        this.#threats = { b: {}, w: {} };
      }
    }
    /** A fresh copy of the game as presented on init. */
    get game() {
      if (this.#game.notation !== this.#notation) {
        this.#game = new Trax(this.#rules, this.#moves, this.#id);
      }
      return this.#game;
    }
    /** The edge of the playing area. */
    get edge() {
      this.#edge ||= this.#traceEdge();
      return this.#edge;
    }
    /**
    All threats present in this position.
    @returns {FoundThreatsCollection} - all threats found for both players
    */
    get threats() {
      this.#threats ||= { b: this.#applyThreats("b"), w: this.#applyThreats("w") };
      return this.#threats;
    }
    /**
    Determine the points of the currently active player.
    @returns {[number, number]} - the points for this player, and the level
    of the most dangerous threat
    */
    #activeScore() {
      let score = 0;
      let threatLevel = Infinity;
      const { game } = this;
      const active = this.threats[game.color];
      for (const key of Object.keys(active)) {
        const level = Number(key);
        if (level > 0) threatLevel = Math.min(threatLevel, level);
        score += attackScore(active, level);
      }
      return [score, threatLevel];
    }
    /**
    Determine the points of the waiting player.
    @param {Color} color - the color for which we are generating the score
    @param {number} threatLevel - the lowest level for which the active player
    has an active threat
    @returns {[number, number]} - the points for this player and the multiplier
    to be applied to the other player's points
    */
    #inactiveScore(color, threatLevel) {
      const { game } = this;
      const active = this.threats[game.color];
      const inactive = this.threats[Trax.other(game.color)];
      const isPassive = game.color !== color;
      const isAttacking = isActiveAttack(inactive);
      const isDefending = !isAttacking && isUnderThreat(active);
      const isThreatening = !isAttacking && isPassiveAttack(inactive);
      const shouldCalc = !isPassive || isAttacking || isDefending || isThreatening;
      const multiplier = isPassive && isAttacking && threatLevel > 1 ? 0.1 : 1;
      let score = 0;
      for (const key of Object.keys(inactive)) {
        const level = Number(key);
        const calcLevel = level > 0 && isDefending ? level + threatLevel - 1 : level;
        let points = attackScore(inactive, level, shouldCalc ? calcLevel : 0);
        if (level === threatLevel) {
          points = isPassive ? points / 2 : 0;
          if (isAttacking && threatLevel === 1) points /= 2;
        }
        if (isPassive && isThreatening) points /= 2;
        score += Math.floor(points);
      }
      return [score, multiplier];
    }
    /**
    Calculate the score for a player.
    @param {Color} color - Color of the player
    @returns {number} - positive score is better; ±Infinity for a win or loss
    */
    #score(color) {
      const { game } = this;
      if (game.over) {
        return game.color === color ? Infinity : game.color === Trax.other(color) ? -Infinity : -999999999;
      }
      const [currentPlayer, threatLevel] = this.#activeScore();
      const [nextPlayer, multiplier] = this.#inactiveScore(color, threatLevel);
      let score = Math.floor(currentPlayer * multiplier) - nextPlayer;
      if (score && game.color !== color) score *= -1;
      return score;
    }
    /**
    Is a given location in a cave?
    @param {Point} loc - the grid location to test
    */
    inCave(loc) {
      const { game } = this;
      if (game.tileAt(loc)) {
        return false;
      }
      const topLeft = new Point(game.left, game.top);
      const bottomRight = new Point(game.right, game.bottom);
      let count = 0;
      for (const dir of Point.dirs) {
        let look = loc.dir(dir);
        while (look.in(topLeft, bottomRight) && !game.tileAt(look)) {
          look = look.dir(dir);
        }
        if (game.tileAt(look)) count++;
      }
      return count > 2;
    }
    /** Get the scores for each player. */
    get scores() {
      if (this.#scores === void 0) {
        this.#scores = {
          w: this.#score("w"),
          b: this.#score("b")
        };
      }
      return this.#scores;
    }
    /** Get the score for the active player. */
    get score() {
      return this.scores[this.game.color];
    }
    /**
      Determine which type of space we have:
    
      determine which type of space we have:
      c = in a cave but has no restrictions (converted to n in edge)
      C = a cave where some moves are not allowed (converted to c in edge)
      n = normal space
      x = no tile can be played here
      @param {Point} loc - The location of the space
      @returns {string} - one of 'n', 'c', 'C', or 'x' indicating the space type
      */
    spaceType(loc) {
      const { game } = this;
      if (!game.validLocation(loc)) {
        return "x";
      }
      if (!this.inCave(loc)) {
        return "n";
      }
      let areSomeValid = false;
      let areSomeInvalid = false;
      for (const tile of game.possibleTiles(loc)) {
        const drop = game.dropTile(tile, loc, "tentative");
        if (drop.valid) {
          areSomeValid = true;
        } else {
          areSomeInvalid = true;
        }
      }
      if (!areSomeValid) {
        return "x";
      }
      if (areSomeInvalid) {
        return "C";
      }
      return "c";
    }
    /** Trace the edge of the playing area. */
    #traceEdge() {
      const { game } = this;
      const rawEdge = [];
      const lines = {};
      const count = { w: 0, b: 0 };
      let start = new Point(game.left, game.top);
      let dir = "r";
      while (!game.tileAt(start)) {
        start = start.right;
      }
      let loc = start;
      while (game.move > 0 && !game.over) {
        let space = loc.dir(leftTurn[dir]);
        if (rawEdge.length > 0 && space.eq(rawEdge[0])) break;
        const color = edgeColor(
          /** @type {ValidTiles} */
          game.tileAt(loc),
          leftTurn[dir]
        );
        const end = game.follow(color, loc, follow[dir]).loc;
        const type = this.spaceType(space);
        const tile = { x: space.x, y: space.y, c: color, t: type };
        const lineId = color + end.x + ":" + end.y;
        const nColor = "n" + color;
        if (Object.hasOwn(lines, lineId)) {
          tile[nColor] = lines[lineId][nColor];
        } else {
          tile[nColor] = encodeNumber(count[color]);
          count[color]++;
        }
        lines[color + space.x + ":" + space.y] = tile;
        rawEdge.push(tile);
        const next = loc.dir(dir);
        if (game.tileAt(next)) {
          loc = next.dir(leftTurn[dir]);
          if (game.tileAt(loc)) {
            rawEdge.push({ x: space.x, y: space.y, c: "l", t: type });
            dir = leftTurn[dir];
          } else {
            loc = next;
          }
        } else {
          space = next.dir(leftTurn[dir]);
          const t = this.inCave(space) ? "c" : "n";
          rawEdge.push({ x: space.x, y: space.y, c: "r", t });
          dir = rightTurn[dir];
        }
      }
      const spelunked = spelunk(rawEdge);
      const hollowed = hollowOut(spelunked);
      const paired = pairUp(hollowed);
      return label(paired);
    }
    /**
    Compose the threat into a FoundThreat object.
    @param {Threat} threat - the threat that has been found
    @param {RegExpMatchArray} match - the matching item
    @returns {FoundThreat} - a structured FoundThreat object for the match
    */
    #foundThreat(threat, match) {
      return {
        threat: threat.pattern,
        match: match[1],
        // The match is in the capturing group
        at: match.index ?? 0,
        value: threat.value,
        level: threat.depth
      };
    }
    /**
    Returns the edge locations relevant to activating or responding to a threat.
    @param {FoundThreat} threat - a threat
    @param {string} color - the player color
    @returns {Point[]} - locations relevant to the threat
    */
    threatLocs(threat, color) {
      const { edge } = this.edge;
      const max = edge.length;
      let index = threat.at;
      let count = 0;
      const locs = /* @__PURE__ */ new Set([index]);
      while (count < threat.match.length - 1) {
        index += 1;
        if (index >= max) index -= max;
        locs.add(index);
        count += 1;
        if (Object.hasOwn(edge[index], "p" + color)) {
          const line = "n" + color;
          const end = edge.find(
            (space) => space.idx !== edge[index].idx && space[line] === edge[index][line]
          );
          if (end) {
            locs.add(end.idx ?? 0);
            locs.add((end.idx ?? 0) - 1);
          }
        }
      }
      return [...locs].map((i) => new Point(edge[i] || { x: 0, y: 0 }));
    }
    /**
    Apply the threats to a color's regex-ready edge.
    @param {Color} color - the color to find threats for
    @returns {ColorThreats} - a map from depth level to matched FoundThreat arrays
    */
    #applyThreats(color) {
      const matches = {};
      const edgeLength = this.edge[color].length;
      const edge = this.edge[color].repeat(2);
      for (const threat of threats.list) {
        const find = matches[threat.depth] || [];
        for (const match of matchesUpTo(edge, threat.rx, edgeLength)) {
          if (find.every((f) => f.at !== match.index || f.match !== match[1])) {
            find.push(this.#foundThreat(threat, match));
          }
        }
        if (find.length > 0) matches[threat.depth] = find;
      }
      return matches;
    }
    /** Clean up the list of matches, removing any false positives. */
    validateThreats() {
      if (this.#validated) return;
      let areSomeFaulty = false;
      for (
        const bw of
        /** @type {Color[]} */
        ["w", "b"]
      ) {
        const matches = this.threats[bw];
        const levelKeys = Object.keys(matches).filter((k) => Number(k) >= 2);
        for (const key of levelKeys) {
          const level = Number(key);
          const verified = [];
          const foundThreats = matches[key];
          for (const threat of foundThreats) {
            if (this.#canActivateThreat(threat, bw, level)) {
              verified.push(threat);
            } else {
              this.faulty[bw].push(threat);
              areSomeFaulty = true;
            }
          }
          if (verified.length > 0) {
            matches[key] = verified;
          } else {
            delete matches[key];
          }
        }
      }
      if (areSomeFaulty) this.#scores = void 0;
      this.#validated = true;
    }
    /**
    Try a single tile placement at loc to see if it activates the threat.
    @param {Point} loc - the edge location to test a tile drop at
    @param {Color} color - the player color whose threat is being tested
    @param {number} level - the depth level of the threat
    @returns {boolean} - true if any tile placement at loc activates the threat
    */
    #testActivation(loc, color, level) {
      const attacks2 = attackCount(this.threats[color]);
      const player = Trax.playerNumber(color);
      const other = Trax.other(color);
      const otherAttacks = attackCount(this.threats[other]);
      const higher = threatCount(this.threats[color], level - 1);
      for (const type of this.game.possibleTiles(loc)) {
        const game = new Trax(this.game.rules, this.game.moves);
        const result = game.dropTile(type, loc);
        if (!result.valid) continue;
        if (game.over && game.turn === player) return true;
        if (game.over) continue;
        const { threats: gameThreats } = analyze(game);
        const faulty = attackCount(gameThreats[other]) - otherAttacks;
        if (faulty > 0) continue;
        const newAttacks = attackCount(gameThreats[color]) - attacks2;
        if (level === 2) {
          if (newAttacks > 1) return true;
        } else {
          const newThreats = threatCount(gameThreats[color], level - 1) - higher;
          if (newAttacks > 0 && newThreats > 0) return true;
        }
      }
      return false;
    }
    /**
    Determine if the given threat can be activated for this color
    @param {FoundThreat} threat - The threat to try to activate
    @param {Color} color - The color this match belongs to
    @param {number} level - The depth level of this threat
    @returns {boolean} - true if any relevant edge location can activate the threat
    */
    #canActivateThreat(threat, color, level) {
      for (const loc of this.threatLocs(threat, color)) {
        if (this.#testActivation(loc, color, level)) return true;
      }
      return false;
    }
    // Make a reasonable inspect representation of the analysis
    /**
    Custom Node.js inspect output for the REPL.
    @param {number} depth - current inspect depth
    @param {{ stylize: (text: unknown, style: string) => string, depth: number | null }} options - inspect options
    @param {(object: unknown, options: object) => string} inspectFn - the recursive inspect function
    */
    [inspect.custom](depth, options, inspectFn) {
      const sub = (object) => inspectFn(object, options).replaceAll("\n", "\n  ");
      const style = options.stylize;
      if (depth < 0) return style("<Analysis>", "special");
      if (options.depth !== null) options.depth -= 1;
      const tbd = style("tbd", "undefined");
      let custom = style("Analysis", "special") + " {\n";
      custom += "  game: " + style(this.#rules, "special");
      custom += "(" + style(this.#moves, "string") + "),\n";
      custom += "  edge: ";
      if (this.#edge) {
        custom += "{\n    w: " + style(this.#edge.w, "string");
        custom += ",\n    b: " + style(this.#edge.b, "string");
        custom += ",\n    edge: " + style("[rawEdge]", "special");
        custom += "\n  }";
      } else {
        custom += tbd;
      }
      const score = this.#scores ? this.score : null;
      custom += ",\n  threats: ";
      custom += this.#threats ? sub(this.#threats) : tbd;
      custom += ",\n  scores: ";
      custom += this.#scores ? sub(this.#scores) : tbd;
      custom += ",\n  score: ";
      custom += score === null ? tbd : style(score, "number");
      return custom + "\n}";
    }
  };
  var analyze = (game) => {
    const cacheKey = game.rules + game.normalized;
    const cached = cache.get(cacheKey);
    if (cached) return cached;
    const analysis = new Analysis(game);
    cache.set(cacheKey, analysis);
    return analysis;
  };
  var Suggestion = class {
    /** @type {PositionScore[]} */
    all = [];
    /** @type {PositionScore[]} */
    options = [];
    /** @type {PositionScore} */
    pick;
    ms = 0;
    /**
    Builds a Suggestion by sorting and re-evaluating analyzed positions.
    @param {Color} color - the active player's color
    @param {PositionScore[]} analyzed - all positions evaluated for the current move
    @param {number} ms - time taken in milliseconds
    */
    constructor(color, analyzed, ms) {
      analyzed.sort(byScoreDesc);
      this.all = analyzed;
      let best = analyzed[0] || { move: "", score: 0 };
      let score = -Infinity;
      while (score !== best.score) {
        score = best.score;
        const options = analyzed.filter(withinX(best.score, 5));
        for (const option of options) {
          option.analysis?.validateThreats();
          option.score = option.analysis?.scores[color] ?? option.score;
        }
        analyzed.sort(byScoreDesc);
        best = analyzed[0] || { move: "", score: 0 };
      }
      this.options = analyzed.filter(withinX(best.score, 5));
      this.pick = randomDraw(this.options) || best;
      this.ms = ms;
    }
    get best() {
      return this.all[0];
    }
    get analyzed() {
      return this.all.length;
    }
    // Make a nice representation for the nodejs REPL
    /**
    Custom Node.js inspect output for the REPL.
    @param {unknown} _ - unused inspect depth
    @param {{ stylize: (text: unknown, style: string) => string }} options - inspect options
    */
    [inspect.custom](_, options) {
      const style = options.stylize;
      let out = style(this.pick.move, "string");
      out += " " + style(this.pick.score, "number") + " [";
      out += this.options.slice(0, 5).map((s) => style(s.move, "string") + " " + style(s.score, "number")).join(", ");
      out += "] " + this.analyzed + " in " + this.ms + "ms";
      return out;
    }
  };
  return __toCommonJS(entry_exports);
})();

  return TraxAnalystBundle;
}

if (typeof module !== 'undefined') module.exports = TraxAnalystModule;
