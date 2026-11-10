# Trax

Browser-based Trax for two humans, a human against the computer, or the computer against itself. Open `index.html` in any modern browser — no build step or server needed.

## Features
- Each colour can be played by a human or the computer (Easy / Medium / Hard); White moves first. Choose in the New Game dialog (with *Swap colours* and *Random colours*), or change either side at any time with the selectors beside White and Red – e.g. hand a position to the computer, or take over from it.
- Computer-against-computer games can be paused and resumed; reviewing an earlier position pauses them automatically.
- Rules: Standard (unlimited board), 8×8, Loop Trax.
- Ghost-tile placement showing only legal orientations:
  - **Arrows mode** (default): click a space, rotate with ⟲ ⟳ or ← →, click the tile or press Enter to place; Esc cancels.
  - **Right-click mode**: left-click to show and cycle tiles, right-click to place.
- Forced plays resolved automatically, either one at a time or instantly.
- Move history in standard notation (forced tiles not listed). Click a move, or use ← → with nothing selected, to review earlier positions.
- **Play from here**: while reviewing, continue the game from that position instead. The moves you leave behind are kept as a separate *line*, so nothing is lost and no confirmation is needed. A selector above the move list switches between lines (labelled with where each branched, its length and result); ✕ discards a line (click twice). A line you branch but never play into is folded away automatically. Lines are saved with the game; Copy exports the current line.
- Undo (Ctrl+Z) takes back to before the last human move (one move when the computer plays both sides). Copy the game record, or load a pasted record.
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
- **Easy** – two-ply search (its move and your best reply).
- **Medium** – iterative-deepening alpha-beta for about 3 seconds per move.
- **Hard** – about 5 seconds per move, built around threats (moves that set up a win):
  1. takes any immediate win; if you threaten one, considers only moves that block it;
  2. *threat-space search*: looks for a forced win by a sequence of threats, so it follows attacks well beyond the normal search depth. For speed it only tries defences near each threat, so any win it finds is then re-checked against every possible defence (a block far away can work through forced plays) before Hard commits to it;
  3. ranks the remaining moves with Medium's alpha-beta search. Its evaluation treats an *open line* (both ends on the board's outer edges, pointing outward) as a countdown – 7 long is a double threat, 6 is won for whoever moves next – so 5- and 4-long open lines already carry real weight and it won't extend yours (Medium shares this evaluation);
  4. *threat patterns*: re-ranks the top 20 using a catalogue of standard Trax threat shapes (corners, connectable pairs, L threats, caves, multi-stage attacks) – see *Third-party code* below. Quiet moves are scored straight after the move. An *attack* (a move threatening to win next turn) is scored by what the exchange gains – the position after the opponent's best block compared with the position now – and must gain at least `MARGIN` (3 points, about three corners) to beat the best quiet move, so Hard doesn't spend threats that don't improve its position;
  5. *safety check*: walks down that ranking and rejects any move that lets you start a forced attack.

  Until November 2026 these levels were called Medium, Hard and Expert, and there was a weaker Easy level (half random moves), now removed. Saved settings and games from that version are converted automatically.

  Test history: the threat-based level beat the 3-second search 14–2 at standard rules, 3–1 at Loop Trax and 3–0 (one draw) at 8×8; adding threat patterns made it stronger again (14–4). In November 2026 attack scoring was reworked (step 4 above, plus excluding weak attacks from Hard's random choice among equally rated moves): on quiet positions taken from Hard-vs-Hard games, unforced attacks fell from 42% to 17% of its moves, and it played the previous version evenly (6–6 over 12 games).

Think times are `THINK_MS` in `js/app.js`; evaluation weights are at the top of `js/ai.js`.

## Performance notes
The engine's `apply()` and the AI's `winChecker()` avoid allocation in their inner loops. `winChecker` records the two ends of every open path once per position, so testing a move for a win only steps through the newly placed tiles and jumps across existing paths end-to-end. Both are verified against the straightforward implementations (`Board.winFlags` / `checkWins`) on hundreds of thousands of moves.

## Notation
Column letters `@ A B C …` and row numbers `0 1 2 …` count from the empty column and row just outside the tiles, as in the official notation. `+` is a straight tile, `/` and `\` are curves. The board's coordinate labels follow the same scheme, so you can read moves straight off the edges.

## Third-party code
`js/vendor/trax-analyst.js` is a bundled copy of [@slugbugblue/trax](https://www.npmjs.com/package/@slugbugblue/trax) and [@slugbugblue/trax-analyst](https://www.npmjs.com/package/@slugbugblue/trax-analyst) (with their small dependencies `@slugbugblue/point` and `@slugbugblue/lru`) by Chad Transtrum, licensed under the Apache License 2.0 – see `js/vendor/LICENSE-trax-analyst.txt`. It was bundled with esbuild into a single function so it can run in the AI's Web Worker; Node's `util.inspect` is stubbed and an `Iterator.prototype.toArray` polyfill added. Hard uses only its position analysis; all move search is this project's own. If the bundle fails to load in an older browser, Hard falls back to working without it.

To rebuild the bundle: install the two packages plus esbuild, then bundle an entry file that re-exports `Trax` and `analyze` as an IIFE (aliasing `node:util` to a stub that exports `inspect.custom`), and wrap the output in `function TraxAnalystModule() { … return TraxAnalystBundle; }`.

