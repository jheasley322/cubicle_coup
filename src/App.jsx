import { useState, useEffect, useRef } from "react";

import { ACTIONS, MAX_ROUNDS } from "./constants.js";
import {
  scoreFor, controlsZone, validDeploy, validTarget,
  applyDeploy, applyHackathon, applyCellAction, applyLineAction,
  applySnackBreak, applyMeeting, applyBrainstorm, endTurnState, freshRematchState,
} from "./engine.js";
import {
  createGame as netCreate, joinGame as netJoin, readGame, sendMove, sendRematch,
  subscribeGame, readPersonal, writePersonal, clearPersonal,
} from "./net.js";
import { Logo, Team, Cell, LinePicker, GameOver, Help } from "./components.jsx";

export default function App() {
  const [screen, setScreen] = useState("home"); // home | lobby | game
  const [me, setMe] = useState(null); // { code, side, token, name }
  const [game, setGame] = useState(null);
  const [nameInput, setNameInput] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  // targeting
  const [pending, setPending] = useState(null); // { kind, actionId, cost, firstCell }
  const [lineMode, setLineMode] = useState(null); // 'row' | 'col'
  const [toast, setToast] = useState("");

  const gameRef = useRef(game);
  gameRef.current = game;
  const screenRef = useRef(screen);
  screenRef.current = screen;

  // ---------- restore on load ----------
  useEffect(() => {
    (async () => {
      const p = readPersonal();
      if (p && p.code) {
        const g = await readGame(p.code);
        if (g) {
          setMe(p);
          setGame(g);
          setScreen(g.status === "lobby" ? "lobby" : "game");
        } else {
          clearPersonal();
        }
      }
    })();
  }, []);

  // ---------- live shared state (Realtime + poll fallback) ----------
  useEffect(() => {
    if (!me?.code) return;
    const unsub = subscribeGame(me.code, (remote) => {
      if (!gameRef.current || remote.version > gameRef.current.version) {
        setGame(remote);
        if (remote.status !== "lobby" && screenRef.current === "lobby") setScreen("game");
      }
    });
    return unsub;
  }, [me?.code]);

  const flash = (m) => {
    setToast(m);
    setTimeout(() => setToast(""), 2600);
  };

  // Optimistically apply locally, then push to the server. Adopt the authoritative
  // state on success; on a 409 conflict, resync to the returned current state.
  async function pushState(next, isRematch = false) {
    setGame(next);
    setPending(null);
    setLineMode(null);
    try {
      const fn = isRematch ? sendRematch : sendMove;
      const r = await fn(me.code, me.token, next);
      if (r.conflict && r.state) {
        setGame(r.state);
        flash("The board updated — resynced.");
      } else if (r.state) {
        setGame(r.state);
      }
    } catch (e) {
      flash(e.message || "Sync error.");
      const cur = await readGame(me.code);
      if (cur) setGame(cur);
    }
  }

  // ---------- create / join / leave ----------
  async function createGame() {
    if (!nameInput.trim()) {
      setErr("Name your department first.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const r = await netCreate(nameInput.trim());
      const meObj = { code: r.code, side: "green", token: r.token, name: nameInput.trim() };
      writePersonal(meObj);
      setMe(meObj);
      setGame(r.state);
      setScreen("lobby");
    } catch (e) {
      setErr(e.message || "Could not create a floor.");
    } finally {
      setBusy(false);
    }
  }

  async function joinGame() {
    if (!nameInput.trim()) {
      setErr("Name your department first.");
      return;
    }
    const code = codeInput.trim().toUpperCase();
    if (code.length !== 4) {
      setErr("Enter the 4-letter room code.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const r = await netJoin(code, nameInput.trim());
      const meObj = { code, side: "orange", token: r.token, name: nameInput.trim() };
      writePersonal(meObj);
      setMe(meObj);
      setGame(r.state);
      setScreen("game");
    } catch (e) {
      setErr(e.message || "Could not join.");
    } finally {
      setBusy(false);
    }
  }

  function leave() {
    clearPersonal();
    setMe(null);
    setGame(null);
    setScreen("home");
    setPending(null);
    setLineMode(null);
  }

  // ---------- turn helpers ----------
  const myTurn = game && me && game.status === "playing" && game.turn === me.side;
  const flags = game?.turnFlags || {};
  const deploysLeft = myTurn ? 1 + (flags.extraDeploys || 0) - (flags.deploysUsed || 0) : 0;
  const myClout = game ? game.players[me?.side]?.clout : 0;
  const myHead = game ? game.players[me?.side]?.headcount : 0;

  // ---------- deploy ----------
  function doDeploy(i) {
    pushState(applyDeploy(game, me.side, i, me.name));
  }

  // ---------- actions ----------
  function beginAction(a) {
    if (!myTurn) return;
    if (myClout < a.cost) {
      flash(`Need ${a.cost} clout for ${a.name}.`);
      return;
    }
    if (a.id === "hackathon") {
      pushState(applyHackathon(game, me.side, me.name));
      return;
    }
    if (a.needs === "line") {
      setPending({ kind: "action", actionId: a.id, cost: a.cost, needs: "line" });
      setLineMode("row");
      return;
    }
    setPending({ kind: "action", actionId: a.id, cost: a.cost, needs: a.needs, firstCell: null });
    setLineMode(null);
  }

  function resolveCellAction(i) {
    if (pending.actionId === "reorg" && pending.firstCell == null) {
      setPending({ ...pending, firstCell: i }); // pick the second cell next
      return;
    }
    pushState(applyCellAction(game, me.side, pending.actionId, i, pending.firstCell, me.name));
  }

  function resolveLineAction(lineIndex) {
    pushState(applyLineAction(game, me.side, pending.actionId, lineMode, lineIndex, me.name));
  }

  // ---------- zone powers ----------
  function zoneControlled(zone) {
    return controlsZone(game.board, zone) === me?.side;
  }

  function snackBreak() {
    if (game.turnFlags.snackUsed) {
      flash("Snack break already used this turn.");
      return;
    }
    const next = applySnackBreak(game, me.side, me.name);
    if (!next) {
      flash("No neutral next to the break room.");
      return;
    }
    pushState(next);
  }

  function beginMeeting() {
    if (game.turnFlags.meetingUsed) {
      flash("Meeting already called this turn.");
      return;
    }
    if (myClout < 2) {
      flash("Need 2 clout for a meeting.");
      return;
    }
    setPending({ kind: "zone", actionId: "meeting", cost: 2, needs: "line" });
    setLineMode("row");
  }
  function resolveMeeting(lineIndex) {
    pushState(applyMeeting(game, me.side, lineMode, lineIndex, me.name));
  }

  function brainstorm() {
    if (game.turnFlags.brainstormUsed) {
      flash("Brainstorm already used this turn.");
      return;
    }
    if (myClout < 1) {
      flash("Need 1 clout to brainstorm.");
      return;
    }
    pushState(applyBrainstorm(game, me.side, me.name));
  }

  // ---------- end turn / rematch ----------
  function endTurn() {
    pushState(endTurnState(game));
  }
  function rematch() {
    pushState(freshRematchState(game), true);
  }

  // ---------- click router ----------
  function cellClick(i) {
    if (!myTurn) return;
    if (pending?.kind === "deploy") {
      if (validDeploy(game, me.side, i)) doDeploy(i);
      return;
    }
    if (pending?.kind === "action") {
      if (pending.needs === "line") return; // handled by line buttons
      if (validTarget(game, me.side, pending, i)) resolveCellAction(i);
      return;
    }
  }

  // ============================ render =======================================
  const greenName = game?.players?.green?.name || "Green Dept";
  const orangeName = game?.players?.orange?.name || "Orange Dept";

  return (
    <div className="cc-root">
      {screen === "home" && (
        <div className="cc-center">
          <Logo />
          <div className="cc-card">
            <label className="cc-lab">Your department name</label>
            <input
              className="cc-in"
              value={nameInput}
              maxLength={18}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="e.g. Data Wizards"
            />
            <button className="cc-btn cc-green" onClick={createGame} disabled={busy}>
              {busy ? "…" : "Create a floor →"}
            </button>
            <div className="cc-or">— or join one —</div>
            <input
              className="cc-in cc-code"
              value={codeInput}
              maxLength={4}
              onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
              placeholder="CODE"
            />
            <button className="cc-btn cc-orange" onClick={joinGame} disabled={busy}>
              Join with code
            </button>
            {err && <div className="cc-err">{err}</div>}
          </div>
          <button className="cc-link" onClick={() => setShowHelp(true)}>How do you play?</button>
        </div>
      )}

      {screen === "lobby" && game && (
        <div className="cc-center">
          <Logo />
          <div className="cc-card">
            <div className="cc-lobtitle">Floor created!</div>
            <div className="cc-codebox">{game.code}</div>
            <p className="cc-muted">Send this code to your rival. The game starts the moment they join.</p>
            <div className="cc-spin">Waiting for a challenger…</div>
            <button className="cc-link" onClick={leave}>Cancel</button>
          </div>
        </div>
      )}

      {screen === "game" && game && (
        <div className="cc-game">
          {/* scoreboard */}
          <div className="cc-top">
            <Team
              side="green" name={greenName} score={scoreFor(game.board, "green")}
              clout={game.players.green.clout} head={game.players.green.headcount}
              active={game.turn === "green"} you={me.side === "green"}
            />
            <div className="cc-roundbox">
              <div className="cc-round">Round {Math.min(game.round, MAX_ROUNDS)}/{MAX_ROUNDS}</div>
              <div className="cc-turnline">
                {game.status === "finished" ? "Final" : myTurn ? "Your move" : `${game.players[game.turn].name}'s move`}
              </div>
            </div>
            <Team
              side="orange" name={orangeName} score={scoreFor(game.board, "orange")}
              clout={game.players.orange.clout} head={game.players.orange.headcount}
              active={game.turn === "orange"} you={me.side === "orange"}
            />
          </div>

          {/* board */}
          <div className="cc-floorwrap">
            <div className="cc-floor">
              {game.board.map((cell, i) => {
                const hl =
                  (pending?.kind === "deploy" && validDeploy(game, me.side, i)) ||
                  (pending?.kind === "action" && pending.needs !== "line" && validTarget(game, me.side, pending, i)) ||
                  (pending?.actionId === "reorg" && pending.firstCell === i);
                const dim = pending && !hl && !(pending.actionId === "reorg" && pending.firstCell === i);
                return (
                  <Cell
                    key={i} cell={cell} i={i} turnCount={game.turnCount}
                    mine={cell.occupant === me.side}
                    highlight={!!hl}
                    dim={!!dim && (pending?.kind === "deploy" || (pending?.kind === "action" && pending.needs !== "line"))}
                    onClick={myTurn && game.status === "playing" ? () => cellClick(i) : null}
                  />
                );
              })}
            </div>
          </div>

          {/* line picker */}
          {lineMode && (
            <LinePicker
              mode={lineMode}
              setMode={setLineMode}
              onPick={(n) => (pending.actionId === "meeting" ? resolveMeeting(n) : resolveLineAction(n))}
              onCancel={() => {
                setPending(null);
                setLineMode(null);
              }}
            />
          )}

          {/* control bar */}
          {game.status === "playing" && (
            <div className="cc-controls">
              {!myTurn && <div className="cc-wait">⏳ Waiting for {game.players[game.turn].name}…</div>}

              {myTurn && (
                <>
                  <div className="cc-actionhint">
                    {pending
                      ? pending.kind === "deploy"
                        ? "Tap a glowing desk to onboard your hire."
                        : pending.actionId === "reorg" && pending.firstCell == null
                        ? "Tap the FIRST desk to swap."
                        : pending.actionId === "reorg"
                        ? "Tap an adjacent desk to swap with."
                        : pending.needs === "line"
                        ? "Pick a row or column above."
                        : "Tap a glowing target."
                      : `Deploy a hire, then spend clout. ${deploysLeft} deploy${deploysLeft === 1 ? "" : "s"} · ${myClout} clout left`}
                    {pending && (
                      <button
                        className="cc-cancel"
                        onClick={() => {
                          setPending(null);
                          setLineMode(null);
                        }}
                      >
                        cancel
                      </button>
                    )}
                  </div>

                  <div className="cc-bar">
                    <button
                      className="cc-act cc-deploy"
                      disabled={deploysLeft <= 0 || myHead <= 0}
                      onClick={() => setPending({ kind: "deploy" })}
                    >
                      <span className="cc-ae">🧑‍💼</span>
                      <span>Deploy</span>
                      <span className="cc-cost">{deploysLeft} left</span>
                    </button>
                    {ACTIONS.map((a) => (
                      <button
                        key={a.id}
                        className="cc-act"
                        disabled={myClout < a.cost}
                        title={a.desc}
                        onClick={() => beginAction(a)}
                      >
                        <span className="cc-ae">{a.emoji}</span>
                        <span>{a.name}</span>
                        <span className="cc-cost">{a.cost}⚡</span>
                      </button>
                    ))}
                  </div>

                  {/* zone powers you control */}
                  <div className="cc-zones">
                    {zoneControlled("breakRoom") && (
                      <button className="cc-zone" onClick={snackBreak} disabled={game.turnFlags.snackUsed}>
                        ☕ Snack Break <i>free</i>
                      </button>
                    )}
                    {zoneControlled("conferenceRoom") && (
                      <button
                        className="cc-zone"
                        onClick={beginMeeting}
                        disabled={game.turnFlags.meetingUsed || myClout < 2}
                      >
                        📊 Mandatory Meeting <i>2⚡</i>
                      </button>
                    )}
                    {zoneControlled("collabSpace") && (
                      <button
                        className="cc-zone"
                        onClick={brainstorm}
                        disabled={game.turnFlags.brainstormUsed || myClout < 1}
                      >
                        🛋️ Brainstorm <i>1⚡</i>
                      </button>
                    )}
                  </div>

                  <button className="cc-end" onClick={endTurn}>End turn ▸</button>
                </>
              )}
            </div>
          )}

          {/* log */}
          <div className="cc-log">
            {game.log.slice(0, 4).map((l, k) => (
              <div key={k} className={k === 0 ? "cc-l0" : ""}>{l}</div>
            ))}
          </div>

          <div className="cc-foot">
            <button className="cc-link" onClick={() => setShowHelp(true)}>rules</button>
            <span className="cc-code-sm">
              room {game.code} · you are {me.side === "green" ? greenName : orangeName}
            </span>
            <button className="cc-link" onClick={leave}>leave</button>
          </div>

          {game.status === "finished" && (
            <GameOver game={game} me={me} onRematch={rematch} onLeave={leave} />
          )}
        </div>
      )}

      {toast && <div className="cc-toast">{toast}</div>}
      {showHelp && <Help onClose={() => setShowHelp(false)} />}
    </div>
  );
}
