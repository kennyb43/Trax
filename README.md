# Trax

Browser-based Trax against a computer opponent. Open `index.html` in any modern browser — no build step or server needed.

## Features
- Choose your colour (White moves first), opponent level (Easy / Medium / Hard / Expert), and rules (Standard unlimited, 8×8, Loop Trax).
- Ghost-tile placement showing only legal orientations:
  - **Arrows mode** (default): click a space, rotate with ⟲ ⟳ or ← →, click the tile or press Enter to place; Esc cancels.
  - **Right-click mode**: left-click to show and cycle tiles, right-click to place.
- Forced plays resolved automatically, either one at a time or instantly.
- Move history in standard notation (forced tiles not listed). Click a move, or use ← → with nothing selected, to review earlier positions.
- Undo (Ctrl+Z), copy the game record, or load a pasted record.
- Placement sound plus win/lose chimes (synthesised, no audio files), with a mute toggle.
- The game in progress and your settings persist across reloads (browser localStorage).

## Files
| File | Purpose |
|---|---|
| `index.html` | Page layout and dialogs |
| `css/styles.css` | Styling |
| `js/engine.js` | Rules: placement, forced plays, loop/line detection, variants, notation |
| `js/ai.js` | Computer opponent (negamax + alpha-beta, transposition table, iterative deepening) |
| `js/sound.js` | Web Audio sound effects |
| `js/app.js` | UI, board rendering, input, history, settings |
| `js/vendor/trax-analyst.js` | Bundled threat-pattern analysis (third-party, Apache-2.0) |

The engine and AI are each wrapped in a single function so the page can ship their source into a Web Worker via a Blob. That keeps the AI off the UI thread even when the page is opened from disk (`file://`).

## AI levels
- **Easy** – always takes an immediate win; otherwise half random, half best one-ply move.
- **Medium** – two-ply search (its move and your best reply).
- **Hard** – iterative-deepening alpha-beta for about 3 seconds per move.
- **Expert** – about 5 seconds per move, built around threats (moves that set up a win):
  1. takes any immediate win; if you threaten one, considers only moves that block it;
  2. *threat-space search*: looks for a forced win by a sequence of threats, so it follows attacks well beyond the normal search depth. For speed it only tries defences near each threat, so any win it finds is then re-checked against every possible defence (a block far away can work through forced plays) before Expert commits to it;
  3. ranks the remaining moves with the same alpha-beta search as Hard. Its evaluation treats an *open line* (both ends on the board's outer edges, pointing outward) as a countdown – 7 long is a double threat, 6 is won for whoever moves next – so 5- and 4-long open lines already carry real weight and it won't extend yours (Hard shares this evaluation);
  4. *threat patterns*: re-ranks the top 20 using a catalogue of standard Trax threat shapes (corners, connectable pairs, L threats, caves, multi-stage attacks), so it builds its own threats and avoids leaving you yours – see *Third-party code* below;
  5. *safety check*: walks down that ranking and rejects any move that lets you start a forced attack.

  In testing against Hard (before step 4 was added): 14–2 at standard rules, 3–1 at Loop Trax, and 3–0 with one draw at 8×8. Adding step 4 made it stronger again: 14–4 over 18 games against Expert without it.

Think times are `THINK_MS` in `js/app.js`; evaluation weights are at the top of `js/ai.js`.

## Performance notes
The engine's `apply()` and the AI's `winChecker()` avoid allocation in their inner loops. `winChecker` records the two ends of every open path once per position, so testing a move for a win only steps through the newly placed tiles and jumps across existing paths end-to-end. Both are verified against the straightforward implementations (`Board.winFlags` / `checkWins`) on hundreds of thousands of moves.

## Notation
Column letters `@ A B C …` and row numbers `0 1 2 …` count from the empty column and row just outside the tiles, as in the official notation. `+` is a straight tile, `/` and `\` are curves. The board's coordinate labels follow the same scheme, so you can read moves straight off the edges.

## Third-party code
`js/vendor/trax-analyst.js` is a bundled copy of [@slugbugblue/trax](https://www.npmjs.com/package/@slugbugblue/trax) and [@slugbugblue/trax-analyst](https://www.npmjs.com/package/@slugbugblue/trax-analyst) (with their small dependencies `@slugbugblue/point` and `@slugbugblue/lru`) by Chad Transtrum, licensed under the Apache License 2.0 – see `js/vendor/LICENSE-trax-analyst.txt`. It was bundled with esbuild into a single function so it can run in the AI's Web Worker; Node's `util.inspect` is stubbed and an `Iterator.prototype.toArray` polyfill added. Expert uses only its position analysis; all move search is this project's own. If the bundle fails to load in an older browser, Expert falls back to working without it.

To rebuild the bundle: install the two packages plus esbuild, then bundle an entry file that re-exports `Trax` and `analyze` as an IIFE (aliasing `node:util` to a stub that exports `inspect.custom`), and wrap the output in `function TraxAnalystModule() { … return TraxAnalystBundle; }`.

