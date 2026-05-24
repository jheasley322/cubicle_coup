// Presentational components — SVG art, board cell, scoreboard, modals. Ported
// verbatim from the artifact; no game logic lives here, only rendering.

import {
  GREEN, GREEN_D, ORANGE, ORANGE_D, NEUTRAL, NEUTRAL_D,
  ZONE_OF, TYPE_POINTS, rc, ACTIONS, MAX_ROUNDS, ROWS, COLS,
} from "./constants.js";

// ---- pieces -----------------------------------------------------------------
export function Person({ side, small }) {
  const fill = side === "green" ? GREEN : side === "orange" ? ORANGE : NEUTRAL;
  const stroke = side === "green" ? GREEN_D : side === "orange" ? ORANGE_D : NEUTRAL_D;
  const s = small ? 0.8 : 1;
  return (
    <g transform={`translate(50 56) scale(${s}) translate(-50 -56)`}>
      <ellipse cx="50" cy="78" rx="20" ry="6" fill="rgba(0,0,0,.10)" />
      <path d="M30 80 q0 -26 20 -26 q20 0 20 26 z" fill={fill} stroke={stroke} strokeWidth="3" />
      <circle cx="50" cy="40" r="15" fill={fill} stroke={stroke} strokeWidth="3" />
    </g>
  );
}

function Desk() {
  return (
    <g>
      <rect x="8" y="9" width="54" height="13" rx="4" fill="#d8b487" stroke="#a87f4f" strokeWidth="2.5" />
      <rect x="8" y="9" width="13" height="46" rx="4" fill="#d8b487" stroke="#a87f4f" strokeWidth="2.5" />
      <rect x="30" y="11" width="18" height="9" rx="2" fill="#3c4750" stroke="#222b31" strokeWidth="2" />
    </g>
  );
}

function RoomShell({ floor, wall, label, children }) {
  return (
    <g>
      <rect x="3" y="3" width="94" height="94" rx="9" fill={floor} stroke={wall} strokeWidth="3.5" />
      {children}
      <text x="50" y="93" textAnchor="middle" fontSize="11" fontWeight="700"
        fill={wall} style={{ fontFamily: "Fredoka, sans-serif" }}>{label}</text>
    </g>
  );
}

function BreakRoomArt() {
  return (
    <RoomShell floor="#fff3d6" wall="#caa24a" label="BREAK">
      <rect x="12" y="12" width="18" height="26" rx="3" fill="#e7eef2" stroke="#9bb0bb" strokeWidth="2.5" />
      <line x1="12" y1="25" x2="30" y2="25" stroke="#9bb0bb" strokeWidth="2" />
      <rect x="64" y="14" width="20" height="16" rx="3" fill="#cfd6db" stroke="#8b969d" strokeWidth="2.5" />
      <circle cx="74" cy="22" r="4" fill="#5b6770" stroke="#445057" strokeWidth="2" />
      <circle cx="50" cy="58" r="13" fill="#f6c453" stroke="#caa24a" strokeWidth="2.5" />
      <text x="50" y="62" textAnchor="middle" fontSize="13">🍩</text>
    </RoomShell>
  );
}
function ConferenceArt() {
  return (
    <RoomShell floor="#e7f0ff" wall="#5f86c9" label="CONF">
      <rect x="22" y="20" width="56" height="34" rx="9" fill="#c6d8f5" stroke="#5f86c9" strokeWidth="2.5" />
      {[26, 40, 54, 68].map((x) => <circle key={"t" + x} cx={x} cy="14" r="4" fill="#9db8e6" />)}
      {[26, 40, 54, 68].map((x) => <circle key={"b" + x} cx={x} cy="60" r="4" fill="#9db8e6" />)}
      <rect x="30" y="30" width="40" height="14" rx="2" fill="#fff" stroke="#5f86c9" strokeWidth="2" />
      <text x="50" y="41" textAnchor="middle" fontSize="9" fill="#5f86c9">📊</text>
    </RoomShell>
  );
}
function CollabArt() {
  return (
    <RoomShell floor="#e9f7ec" wall="#5aa86b" label="COLLAB">
      <circle cx="28" cy="30" r="11" fill="#f3a0a0" stroke="#c96f6f" strokeWidth="2.5" />
      <circle cx="58" cy="24" r="9" fill="#9cc7f0" stroke="#5f93c0" strokeWidth="2.5" />
      <rect x="50" y="42" width="30" height="16" rx="7" fill="#f6c453" stroke="#caa24a" strokeWidth="2.5" />
      <text x="24" y="62" fontSize="14">🪴</text>
    </RoomShell>
  );
}
function CornerOfficeArt() {
  return (
    <RoomShell floor="#f3ecff" wall="#8b6fc9" label="CORNER">
      <rect x="3" y="3" width="94" height="9" rx="3" fill="#bfe3f5" stroke="#8b6fc9" strokeWidth="2" />
      <rect x="3" y="3" width="9" height="94" rx="3" fill="#bfe3f5" stroke="#8b6fc9" strokeWidth="2" />
      <rect x="26" y="30" width="48" height="16" rx="4" fill="#caa472" stroke="#946f44" strokeWidth="2.5" />
      <text x="80" y="74" fontSize="15">🪴</text>
      <text x="50" y="64" textAnchor="middle" fontSize="13">👔</text>
    </RoomShell>
  );
}

// ---- board cell -------------------------------------------------------------
export function Cell({ cell, i, mine, highlight, dim, onClick, turnCount }) {
  const isZone = !!ZONE_OF[i] || cell.type === "cornerOffice";
  const stinky = cell.stinkyUntil > turnCount;
  const fort = cell.fortifiedUntil > turnCount;

  let art = null;
  if (cell.type === "breakRoom") art = <BreakRoomArt />;
  else if (cell.type === "conferenceRoom") art = <ConferenceArt />;
  else if (cell.type === "collabSpace") art = <CollabArt />;
  else if (cell.type === "cornerOffice") art = <CornerOfficeArt />;
  else art = <Desk />;

  const windowTop = cell.type === "window";

  return (
    <button
      onClick={onClick}
      className={`cc-cell ${highlight ? "cc-hl" : ""} ${dim ? "cc-dim" : ""} ${mine ? "cc-mine" : ""}`}
      style={{ cursor: onClick ? "pointer" : "default" }}
      title={`${cell.type}${TYPE_POINTS[cell.type] ? " · " + TYPE_POINTS[cell.type] + "pt" : ""}`}
    >
      <svg viewBox="0 0 100 100" className="cc-svg">
        {windowTop && <rect x="2" y="0" width="96" height="6" rx="3" fill="#bfe3f5" />}
        {art}
        {cell.occupant && <Person side={cell.occupant} small={isZone} />}
        {fort && <text x="78" y="26" fontSize="20">🪑</text>}
        {stinky && <g className="cc-stink"><text x="50" y="44" textAnchor="middle" fontSize="34">🐟</text></g>}
      </svg>
      {TYPE_POINTS[cell.type] > 1 && <span className="cc-pts">{TYPE_POINTS[cell.type]}</span>}
    </button>
  );
}

// ---- chrome -----------------------------------------------------------------
export function Logo() {
  return (
    <div className="cc-logo">
      <span className="cc-l-cube">▦</span>
      <h1>CUBICLE<span>COUP</span></h1>
      <p>Two departments. One open floor plan. May the best politics win.</p>
    </div>
  );
}

function Swatch({ side }) {
  return (
    <svg width="20" height="20" viewBox="0 0 100 100" style={{ verticalAlign: "-4px" }}>
      <Person side={side} />
    </svg>
  );
}

export function Team({ side, name, score, clout, head, active, you }) {
  const c = side === "green" ? GREEN : ORANGE;
  return (
    <div className={`cc-team ${active ? "cc-team-active" : ""}`} style={{ borderColor: c }}>
      <div className="cc-team-name" style={{ color: c }}>
        <Swatch side={side} /> {name}{you && <em> (you)</em>}
      </div>
      <div className="cc-team-stats">
        <span className="cc-score" style={{ color: c }}>{score}<small>pts</small></span>
        <span>⚡{clout}</span><span>👥{head}</span>
      </div>
    </div>
  );
}

export function LinePicker({ mode, setMode, onPick, onCancel }) {
  const n = mode === "row" ? ROWS : COLS;
  return (
    <div className="cc-linepick">
      <div className="cc-lp-tabs">
        <button className={mode === "row" ? "on" : ""} onClick={() => setMode("row")}>Rows</button>
        <button className={mode === "col" ? "on" : ""} onClick={() => setMode("col")}>Columns</button>
        <button className="cc-lp-x" onClick={onCancel}>✕</button>
      </div>
      <div className="cc-lp-btns">
        {Array.from({ length: n }, (_, k) => (
          <button key={k} onClick={() => onPick(k)}>{mode === "row" ? `R${k + 1}` : `C${k + 1}`}</button>
        ))}
      </div>
    </div>
  );
}

export function GameOver({ game, me, onRematch, onLeave }) {
  const w = game.winner;
  const win = w === "draw" ? "It's a tie!" : `${game.players[w].name} wins!`;
  const iWon = w === me.side;
  return (
    <div className="cc-modal">
      <div className="cc-modal-card">
        <div className="cc-trophy">{w === "draw" ? "🤝" : iWon ? "🏆" : "📉"}</div>
        <h2>{win}</h2>
        <div className="cc-finalscore">
          <span style={{ color: GREEN }}>{game.players.green.name}: {game.finalScore.green}</span>
          <span style={{ color: ORANGE }}>{game.players.orange.name}: {game.finalScore.orange}</span>
        </div>
        <p className="cc-muted">{iWon ? "The floor is yours. Enjoy the corner office." : w === "draw" ? "Nobody's getting the corner office." : "Time to update your résumé."}</p>
        <button className="cc-btn cc-green" onClick={onRematch}>Rematch</button>
        <button className="cc-link" onClick={onLeave}>back to menu</button>
      </div>
    </div>
  );
}

export function Help({ onClose }) {
  return (
    <div className="cc-modal" onClick={onClose}>
      <div className="cc-modal-card cc-help" onClick={(e) => e.stopPropagation()}>
        <h2>How to play</h2>
        <p><b>Goal:</b> hold the most desk territory after {MAX_ROUNDS} rounds. Normal desk = 1pt, window seat = 2, the special rooms = 2, and the <b>Corner Office = 3</b>.</p>
        <p><b>Each turn:</b> first <b>deploy</b> one hire (free) onto an empty desk touching your team or your home edge — then spend <b>⚡clout</b> (+3/turn, banks to 6) on as many actions as you can afford.</p>
        <p><b>Power zones</b> — sit a worker on a room to unlock it: ☕ Break Room (free recruit), 📊 Conference Room (pull a rival lane into a meeting), 🛋️ Collab Space (fortify nearby desks).</p>
        <ul className="cc-help-list">
          {ACTIONS.map((a) => <li key={a.id}><span>{a.emoji} <b>{a.name}</b> · {a.cost}⚡</span> {a.desc}</li>)}
        </ul>
        <p className="cc-muted">Fortified desks (🪑) can't be flipped or moved. Stink-bombed desks (🐟) are unusable for a round. Don't turtle in your corner — the points are in the middle.</p>
        <button className="cc-btn cc-green" onClick={onClose}>Got it</button>
      </div>
    </div>
  );
}
