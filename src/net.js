// Network/sync layer — the ONLY module that knows about the backend. Mirrors the
// old window.storage seam: createGame / joinGame / readGame / sendMove /
// sendRematch, plus a Realtime subscription (poll fallback) and the localStorage
// "which side am I" helpers. Everything else (engine, UI) stays transport-agnostic.

import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY, POLL_INTERVAL_MS } from "./config.js";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const FN = `${SUPABASE_URL}/functions/v1/game`;
const HEADERS = {
  "Content-Type": "application/json",
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
};

async function call(path, method, body) {
  const res = await fetch(`${FN}${path}`, {
    method,
    headers: HEADERS,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* empty/non-json body */
  }
  return { ok: res.ok, status: res.status, data };
}

// ---- create / join / read ---------------------------------------------------
export async function createGame(name) {
  const r = await call("", "POST", { name });
  if (!r.ok) throw new Error(r.data?.error || "Could not create a floor.");
  return r.data; // { code, side, token, state }
}

export async function joinGame(code, name) {
  const r = await call(`/${code}/join`, "POST", { name });
  if (r.status === 404) throw new Error("No game with that code.");
  if (r.status === 409) throw new Error("That game is full.");
  if (!r.ok) throw new Error(r.data?.error || "Could not join.");
  return r.data; // { side, token, state }
}

export async function readGame(code) {
  const r = await call(`/${code}`, "GET");
  if (!r.ok) return null;
  return r.data?.state ?? null;
}

// ---- writes -----------------------------------------------------------------
// The engine already bumped state.version by 1; we send the pre-move version as
// expectedVersion and the server re-derives the authoritative version on accept.
export async function sendMove(code, token, state) {
  const r = await call(`/${code}/move`, "POST", {
    token,
    expectedVersion: state.version - 1,
    state,
  });
  if (r.status === 409) return { conflict: true, state: r.data?.state ?? null };
  if (r.status === 403) throw new Error(r.data?.error || "Not your turn.");
  if (!r.ok) throw new Error(r.data?.error || "Move rejected.");
  return { state: r.data.state };
}

export async function sendRematch(code, token, state) {
  const r = await call(`/${code}/rematch`, "POST", {
    token,
    expectedVersion: state.version - 1,
    state,
  });
  if (r.status === 409) return { conflict: true, state: r.data?.state ?? null };
  if (!r.ok) throw new Error(r.data?.error || "Rematch failed.");
  return { state: r.data.state };
}

// ---- live updates -----------------------------------------------------------
// Realtime is primary; the interval is a safety net if a subscription drops.
// onState gets the full state object; the caller applies version gating.
export function subscribeGame(code, onState) {
  const channel = supabase
    .channel(`game-${code}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "cubicle_games", filter: `code=eq.${code}` },
      (payload) => {
        const s = payload.new?.state;
        if (s) onState(s);
      },
    )
    .subscribe();

  const poll = setInterval(async () => {
    const s = await readGame(code);
    if (s) onState(s);
  }, POLL_INTERVAL_MS);

  return () => {
    clearInterval(poll);
    supabase.removeChannel(channel);
  };
}

// ---- personal identity (this browser) ---------------------------------------
const PERSONAL = "cubicle:me";

export function readPersonal() {
  try {
    return JSON.parse(localStorage.getItem(PERSONAL));
  } catch {
    return null;
  }
}
export function writePersonal(obj) {
  try {
    localStorage.setItem(PERSONAL, JSON.stringify(obj));
  } catch {
    /* ignore */
  }
}
export function clearPersonal() {
  try {
    localStorage.removeItem(PERSONAL);
  } catch {
    /* ignore */
  }
}
