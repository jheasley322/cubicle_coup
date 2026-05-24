// Pure game engine. Every function takes a state (+ args) and returns the next
// state, or a validity boolean. No React, no network, no I/O — this is the
// behavioral source of truth, ported 1:1 from the artifact (docs/GAME_DESIGN.md).
//
// Each mutating function increments `version` exactly as the original did (one
// bump per discrete action). The network layer sends the pre-move version as
// `expectedVersion`; the server re-derives the authoritative version on accept.

import {
  CELLS, MAX_ROUNDS, CLOUT_PER_TURN, CLOUT_CAP, START_HEADCOUNT,
  COLS, ROWS, idx, rc, SPECIAL, TYPE_POINTS, GREEN_EDGE, ORANGE_EDGE,
  neighbors, enemyOf, freshBoard, ACTIONS, FLAVOR,
} from "./constants.js";

// ---- scoring ----------------------------------------------------------------
export function scoreFor(board, side) {
  let s = 0;
  for (let i = 0; i < CELLS; i++) if (board[i].occupant === side) s += TYPE_POINTS[board[i].type];
  return s;
}
export function countWorkers(board, side) {
  let n = 0;
  for (let i = 0; i < CELLS; i++) if (board[i].occupant === side) n++;
  return n;
}
export function controlsZone(board, zoneName) {
  const cell = SPECIAL[zoneName];
  return board[cell].occupant === "green" ? "green" : board[cell].occupant === "orange" ? "orange" : null;
}

// ---- movement helpers -------------------------------------------------------
function emptyNeighborsOf(board, i, turnCount) {
  return neighbors(i).filter((n) => board[n].occupant === null && board[n].stinkyUntil <= turnCount);
}
export function isFortified(board, i, turnCount) {
  return board[i].fortifiedUntil > turnCount;
}
export function cloneBoard(b) {
  return b.map((c) => ({ ...c }));
}

// move occupant from `i` to a chosen empty neighbor. away = optional center to
// flee from. The randomness here is intentional ("keep some chaos") — preserve it.
export function fleeFrom(board, i, turnCount, away) {
  if (board[i].occupant === null) return;
  if (isFortified(board, i, turnCount)) return; // bolted down
  let opts = emptyNeighborsOf(board, i, turnCount);
  if (opts.length === 0) return; // hunker down
  if (away != null) {
    const [ar, ac] = rc(away);
    const dist = (x) => {
      const [r, c] = rc(x);
      return Math.abs(r - ar) + Math.abs(c - ac);
    };
    const outward = opts.filter((o) => dist(o) > dist(i));
    if (outward.length) opts = outward;
  }
  const to = opts[Math.floor(Math.random() * opts.length)];
  board[to].occupant = board[i].occupant;
  board[to].fortifiedUntil = 0;
  board[i].occupant = null;
}

// ---- state helpers ----------------------------------------------------------
// Matches baseClone() in the artifact: deep-enough copy of board/players/turnFlags.
function clone(state) {
  return {
    ...state,
    board: cloneBoard(state.board),
    players: { green: { ...state.players.green }, orange: { ...state.players.orange } },
    turnFlags: { ...state.turnFlags },
  };
}
function pushLog(s, line) {
  s.log = [line, ...s.log].slice(0, 8);
}
function lineCells(lineMode, lineIndex) {
  const cells = [];
  if (lineMode === "row") for (let c = 0; c < COLS; c++) cells.push(idx(lineIndex, c));
  else for (let r = 0; r < ROWS; r++) cells.push(idx(r, lineIndex));
  return cells;
}

// ---- turn lifecycle ---------------------------------------------------------
export function startTurnReset(state, side) {
  const board = state.board;
  for (let i = 0; i < CELLS; i++) {
    if (board[i].stinkyUntil <= state.turnCount) board[i].stinkyUntil = 0;
    if (board[i].fortifiedUntil <= state.turnCount) board[i].fortifiedUntil = 0;
  }
  state.players[side].clout = Math.min(CLOUT_CAP, state.players[side].clout + CLOUT_PER_TURN);
  state.turnFlags = { deploysUsed: 0, extraDeploys: 0, snackUsed: false, meetingUsed: false, brainstormUsed: false };
}

export function endTurnState(prev) {
  const s = {
    ...prev,
    board: cloneBoard(prev.board),
    players: { green: { ...prev.players.green }, orange: { ...prev.players.orange } },
  };
  s.turnCount += 1;
  s.version = prev.version + 1; // bump BEFORE round-end branch so the final state syncs
  if (s.turn === "green") {
    s.turn = "orange";
    startTurnReset(s, "orange");
  } else {
    s.round += 1;
    if (s.round > MAX_ROUNDS) {
      finishGame(s);
      return s;
    }
    s.turn = "green";
    startTurnReset(s, "green");
  }
  return s;
}

export function finishGame(s) {
  const g = scoreFor(s.board, "green"),
    o = scoreFor(s.board, "orange");
  let winner;
  if (g > o) winner = "green";
  else if (o > g) winner = "orange";
  else {
    const co = s.board[SPECIAL.cornerOffice].occupant;
    if (co === "green" || co === "orange") winner = co;
    else {
      const gw = countWorkers(s.board, "green"),
        ow = countWorkers(s.board, "orange");
      winner = gw > ow ? "green" : ow > gw ? "orange" : "draw";
    }
  }
  s.status = "finished";
  s.winner = winner;
  s.finalScore = { green: g, orange: o };
}

// ---- validity ---------------------------------------------------------------
export function validDeploy(state, side, i) {
  const b = state.board;
  if (b[i].occupant !== null) return false;
  if (b[i].stinkyUntil > state.turnCount) return false;
  const [, c] = rc(i);
  if (side === "green" && c === GREEN_EDGE) return true;
  if (side === "orange" && c === ORANGE_EDGE) return true;
  return neighbors(i).some((n) => b[n].occupant === side);
}

// pending = { actionId, firstCell } for the in-flight single-cell/two-cell action
export function validTarget(state, side, pending, i) {
  if (!pending) return false;
  const b = state.board,
    tc = state.turnCount;
  const adjMine = neighbors(i).some((n) => b[n].occupant === side);
  switch (pending.actionId) {
    case "coffee":
      return b[i].occupant === "neutral" && adjMine;
    case "bagels":
    case "poach":
      return b[i].occupant === enemyOf(side) && adjMine && !isFortified(b, i, tc);
    case "phone":
      return !!b[i].occupant && !isFortified(b, i, tc);
    case "fish":
      return b[i].stinkyUntil <= tc;
    case "ergo":
      return b[i].occupant === side && !isFortified(b, i, tc);
    case "reorg":
      if (pending.firstCell == null) return b[i].occupant !== null && !isFortified(b, i, tc);
      return neighbors(pending.firstCell).includes(i) && !isFortified(b, i, tc);
    default:
      return false;
  }
}

// ---- deploy + actions (return next state) -----------------------------------
export function applyDeploy(state, side, i, name) {
  const s = clone(state);
  s.board[i].occupant = side;
  s.players[side].headcount -= 1;
  s.turnFlags.deploysUsed += 1;
  s.version += 1;
  pushLog(s, FLAVOR.deploy(name));
  return s;
}

export function applyHackathon(state, side, name) {
  const a = ACTIONS.find((x) => x.id === "hackathon");
  const s = clone(state);
  s.players[side].clout -= a.cost;
  s.turnFlags.extraDeploys += 2;
  pushLog(s, FLAVOR.hackathon(name));
  s.version += 1;
  return s;
}

// Single-cell + two-cell (reorg) actions. Caller resolves the targeting UI and
// passes the final cell(s); `firstCell` is only used by reorg.
export function applyCellAction(state, side, actionId, i, firstCell, name) {
  const a = ACTIONS.find((x) => x.id === actionId);
  const s = clone(state);
  const b = s.board;
  switch (actionId) {
    case "coffee":
      b[i].occupant = side;
      break;
    case "bagels":
      b[i].occupant = "neutral";
      break;
    case "poach":
      b[i].occupant = side;
      break;
    case "phone":
      fleeFrom(b, i, s.turnCount, null);
      break;
    case "fish": {
      const blast = [i, ...neighbors(i)];
      blast.forEach((n) => {
        if (n !== i) fleeFrom(b, n, s.turnCount, i);
      });
      fleeFrom(b, i, s.turnCount, i); // center also flees outward
      blast.forEach((n) => {
        b[n].stinkyUntil = s.turnCount + 2;
      });
      break;
    }
    case "ergo":
      b[i].fortifiedUntil = s.turnCount + 2;
      break;
    case "reorg": {
      const f = firstCell;
      const tmp = b[f].occupant;
      b[f].occupant = b[i].occupant;
      b[i].occupant = tmp;
      break;
    }
    default:
      break;
  }
  s.players[side].clout -= a.cost;
  pushLog(s, FLAVOR[actionId](name));
  s.version += 1;
  return s;
}

export function applyLineAction(state, side, actionId, lineMode, lineIndex, name) {
  const a = ACTIONS.find((x) => x.id === actionId);
  const s = clone(state);
  const b = s.board;
  const cells = lineCells(lineMode, lineIndex);
  if (actionId === "replyall") {
    cells.forEach((c) => {
      if (b[c].occupant) fleeFrom(b, c, s.turnCount, null);
    });
  }
  s.players[side].clout -= a.cost;
  pushLog(s, FLAVOR.replyall(name));
  s.version += 1;
  return s;
}

// ---- zone powers ------------------------------------------------------------
// Returns null when there is no valid target (caller surfaces the message).
export function applySnackBreak(state, side, name) {
  const cell = SPECIAL.breakRoom;
  const target = neighbors(cell).find((n) => state.board[n].occupant === "neutral");
  if (target == null) return null;
  const s = clone(state);
  s.board[target].occupant = side;
  s.turnFlags.snackUsed = true;
  pushLog(s, FLAVOR.snack(name));
  s.version += 1;
  return s;
}

export function applyMeeting(state, side, lineMode, lineIndex, name) {
  const s = clone(state);
  const b = s.board;
  const foe = enemyOf(side);
  const cells = lineCells(lineMode, lineIndex);
  let pulled = 0;
  cells.forEach((c) => {
    if (b[c].occupant === foe && !isFortified(b, c, s.turnCount)) {
      b[c].occupant = null;
      s.players[foe].headcount += 1;
      pulled++;
    }
  });
  s.players[side].clout -= 2;
  s.turnFlags.meetingUsed = true;
  pushLog(s, `${name} called a mandatory meeting — ${pulled} rival(s) sent back to the bench. 📊`);
  s.version += 1;
  return s;
}

export function applyBrainstorm(state, side, name) {
  const s = clone(state);
  const b = s.board;
  neighbors(SPECIAL.collabSpace).forEach((n) => {
    if (b[n].occupant === side) b[n].fortifiedUntil = s.turnCount + 2;
  });
  s.players[side].clout -= 1;
  s.turnFlags.brainstormUsed = true;
  pushLog(s, FLAVOR.brainstorm(name));
  s.version += 1;
  return s;
}

// ---- whole-game state factories ---------------------------------------------
// Built client-side for rematch (server stores it like any move). The very first
// create is built server-side in the Edge Function; both must agree on shape.
export function freshRematchState(prev) {
  return {
    ...prev,
    status: "playing",
    round: 1,
    turn: "green",
    turnCount: 0,
    winner: null,
    finalScore: null,
    version: prev.version + 1,
    players: {
      green: { ...prev.players.green, clout: CLOUT_PER_TURN, headcount: START_HEADCOUNT },
      orange: { ...prev.players.orange, clout: CLOUT_PER_TURN, headcount: START_HEADCOUNT },
    },
    board: freshBoard(),
    turnFlags: { deploysUsed: 0, extraDeploys: 0, snackUsed: false, meetingUsed: false, brainstormUsed: false },
    log: ["Fresh floor plan. Rematch!"],
  };
}
