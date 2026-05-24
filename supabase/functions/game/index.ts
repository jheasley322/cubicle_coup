// Cubicle Coup — game API (Supabase Edge Function).
//
// Client-authoritative move resolution + two server-side guards (see
// docs/ARCHITECTURE.md "Authority model"):
//   1. turn ownership — a per-side secret token must match the side whose turn it is
//   2. optimistic concurrency — the write only lands if version == expectedVersion
//
// Routes (invoked at ${SUPABASE_URL}/functions/v1/game...):
//   POST   /game                 create  -> {code, side:"green", token, state}
//   POST   /game/{code}/join      join    -> {side:"orange", token, state}
//   GET    /game/{code}           read    -> {state}
//   POST   /game/{code}/move      move    -> {state} | 409 {state} | 403
//   POST   /game/{code}/rematch   rematch -> {state} (allows finished)
//
// Tokens live in cubicle_game_secrets (never exposed to clients). We talk to
// PostgREST with the auto-injected service_role key, which bypasses RLS.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const REST = `${SUPABASE_URL}/rest/v1`;

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no ambiguous O/0/I/1

function sbHeaders(extra: Record<string, string> = {}) {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

function json(status: number, obj: unknown) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function genCode() {
  const a = new Uint32Array(4);
  crypto.getRandomValues(a);
  return Array.from(a, (x) => ALPHABET[x % ALPHABET.length]).join("");
}

function genToken() {
  const a = new Uint8Array(24);
  crypto.getRandomValues(a);
  return btoa(String.fromCharCode(...a)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function selectGame(code: string) {
  const r = await fetch(`${REST}/cubicle_games?code=eq.${code}&select=state,version`, { headers: sbHeaders() });
  const rows = await r.json();
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function selectSecrets(code: string) {
  const r = await fetch(`${REST}/cubicle_game_secrets?code=eq.${code}&select=green_token,orange_token`, {
    headers: sbHeaders(),
  });
  const rows = await r.json();
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

// Mirror of freshBoard()/createGame() in the front-end engine. Only the very
// first board build lives here; rematch reuses the JS engine and POSTs state.
function blankState(code: string, greenName: string) {
  const COLS = 8, ROWS = 6, CELLS = COLS * ROWS;
  const idx = (r: number, c: number) => r * COLS + c;
  const SPECIAL: Record<string, number> = {
    cornerOffice: idx(0, 4),
    breakRoom: idx(2, 2),
    conferenceRoom: idx(2, 5),
    collabSpace: idx(4, 3),
  };
  const cellType = (i: number) => {
    for (const k in SPECIAL) if (SPECIAL[k] === i) return k;
    return Math.floor(i / COLS) === 0 ? "window" : "cube";
  };
  const board = [];
  for (let i = 0; i < CELLS; i++) board.push({ type: cellType(i), occupant: null, fortifiedUntil: 0, stinkyUntil: 0 });
  [idx(1, 3), idx(1, 4), idx(1, 5), idx(2, 3), idx(2, 4), idx(3, 2), idx(3, 3), idx(3, 5), idx(4, 4), idx(3, 4)]
    .forEach((i) => (board[i].occupant = "neutral"));
  [idx(1, 0), idx(2, 0), idx(3, 0)].forEach((i) => (board[i].occupant = "green"));
  [idx(2, 7), idx(3, 7), idx(4, 7)].forEach((i) => (board[i].occupant = "orange"));
  return {
    code,
    status: "lobby",
    round: 1,
    maxRounds: 12,
    turn: "green",
    turnCount: 0,
    version: 1,
    winner: null,
    finalScore: null,
    players: {
      green: { name: greenName, joined: true, clout: 3, headcount: 12 },
      orange: { name: "", joined: false, clout: 0, headcount: 12 },
    },
    board,
    turnFlags: { deploysUsed: 0, extraDeploys: 0, snackUsed: false, meetingUsed: false, brainstormUsed: false },
    log: ["Green created the floor. Waiting for a rival…"],
  };
}

async function createGame(name: string) {
  if (!name || !name.trim()) return json(400, { error: "Name your department first." });
  let code = genCode();
  for (let i = 0; i < 5; i++) {
    if (!(await selectGame(code))) break;
    code = genCode();
  }
  const greenToken = genToken();
  const state = blankState(code, name.trim());

  const gi = await fetch(`${REST}/cubicle_games`, {
    method: "POST",
    headers: sbHeaders({ Prefer: "return=minimal" }),
    body: JSON.stringify({ code, state, version: state.version }),
  });
  if (!gi.ok) return json(500, { error: "Could not create game.", detail: await gi.text() });

  const si = await fetch(`${REST}/cubicle_game_secrets`, {
    method: "POST",
    headers: sbHeaders({ Prefer: "return=minimal" }),
    body: JSON.stringify({ code, green_token: greenToken }),
  });
  if (!si.ok) return json(500, { error: "Could not create game (secrets)." });

  return json(200, { code, side: "green", token: greenToken, state });
}

async function joinGame(code: string, name: string) {
  if (!name || !name.trim()) return json(400, { error: "Name your department first." });
  code = code.toUpperCase();
  const game = await selectGame(code);
  if (!game) return json(404, { error: "No game with that code." });
  const secrets = await selectSecrets(code);
  if (secrets?.orange_token) return json(409, { error: "That game is full." });

  const state = game.state;
  state.players.orange.name = name.trim();
  state.players.orange.joined = true;
  state.status = "playing";
  state.version = game.version + 1;
  state.log = [`${name.trim()} stormed the floor. Game on!`, ...(state.log || [])].slice(0, 8);

  const orangeToken = genToken();
  await fetch(`${REST}/cubicle_game_secrets?code=eq.${code}`, {
    method: "PATCH",
    headers: sbHeaders({ Prefer: "return=minimal" }),
    body: JSON.stringify({ orange_token: orangeToken }),
  });
  const up = await fetch(`${REST}/cubicle_games?code=eq.${code}`, {
    method: "PATCH",
    headers: sbHeaders({ Prefer: "return=minimal" }),
    body: JSON.stringify({ state, version: state.version, updated_at: new Date().toISOString() }),
  });
  if (!up.ok) return json(500, { error: "Could not join game." });

  return json(200, { side: "orange", token: orangeToken, state });
}

async function getGame(code: string) {
  code = code.toUpperCase();
  const game = await selectGame(code);
  if (!game) return json(404, { error: "No game with that code." });
  return json(200, { state: game.state });
}

async function applyWrite(
  code: string,
  body: { token: string; expectedVersion: number; state: Record<string, unknown> },
  allowFinished: boolean,
) {
  code = code.toUpperCase();
  const { token, expectedVersion, state } = body;
  const game = await selectGame(code);
  if (!game) return json(404, { error: "No game with that code." });

  const secrets = await selectSecrets(code);
  let side: "green" | "orange" | null = null;
  if (secrets?.green_token && token === secrets.green_token) side = "green";
  else if (secrets?.orange_token && token === secrets.orange_token) side = "orange";
  if (!side) return json(403, { error: "Bad token." });

  // guard 1: optimistic concurrency
  if (expectedVersion !== game.version) {
    return json(409, { error: "version_mismatch", state: game.state });
  }
  const current = game.state;
  if (current.status === "finished" && !allowFinished) {
    return json(409, { error: "Game is already finished.", state: current });
  }
  // guard 2: turn ownership
  if (current.turn !== side && !allowFinished) {
    return json(403, { error: "Not your turn." });
  }

  const newState = state;
  const newVersion = game.version + 1;
  newState.version = newVersion; // server owns the version number

  // conditional PATCH guards the race: only updates the row still at expectedVersion
  const up = await fetch(`${REST}/cubicle_games?code=eq.${code}&version=eq.${expectedVersion}`, {
    method: "PATCH",
    headers: sbHeaders({ Prefer: "return=representation" }),
    body: JSON.stringify({ state: newState, version: newVersion, updated_at: new Date().toISOString() }),
  });
  const updated = await up.json();
  if (!Array.isArray(updated) || updated.length === 0) {
    const fresh = await selectGame(code);
    return json(409, { error: "version_mismatch", state: fresh?.state ?? current });
  }
  return json(200, { state: newState });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const parts = new URL(req.url).pathname.split("/").filter(Boolean);
  const gi = parts.indexOf("game");
  const rest = gi >= 0 ? parts.slice(gi + 1) : parts;

  try {
    if (req.method === "POST" && rest.length === 0) {
      const body = await req.json();
      return await createGame(body.name);
    }
    if (req.method === "POST" && rest.length === 2 && rest[1] === "join") {
      const body = await req.json();
      return await joinGame(rest[0], body.name);
    }
    if (req.method === "GET" && rest.length === 1) {
      return await getGame(rest[0]);
    }
    if (req.method === "POST" && rest.length === 2 && rest[1] === "move") {
      const body = await req.json();
      return await applyWrite(rest[0], body, false);
    }
    if (req.method === "POST" && rest.length === 2 && rest[1] === "rematch") {
      const body = await req.json();
      return await applyWrite(rest[0], body, true);
    }
    return json(404, { error: "Not found." });
  } catch (e) {
    return json(500, { error: (e as Error)?.message ?? String(e) });
  }
});
