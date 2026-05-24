// Static game data + board geometry. Ported verbatim from the artifact so the
// named constants cross-reference docs/GAME_DESIGN.md. No game-state logic here.

export const COLS = 8,
  ROWS = 6,
  CELLS = COLS * ROWS;
export const MAX_ROUNDS = 12;
export const CLOUT_PER_TURN = 3,
  CLOUT_CAP = 6;
export const START_HEADCOUNT = 12;

export const GREEN = "#61a729",
  GREEN_D = "#43761c";
export const ORANGE = "#f8981d",
  ORANGE_D = "#b86c08";
export const NEUTRAL = "#9aa0a6",
  NEUTRAL_D = "#6b7075";

export const idx = (r, c) => r * COLS + c;
export const rc = (i) => [Math.floor(i / COLS), i % COLS];

// ---- floor layout -----------------------------------------------------------
export const SPECIAL = {
  cornerOffice: idx(0, 4),
  breakRoom: idx(2, 2),
  conferenceRoom: idx(2, 5),
  collabSpace: idx(4, 3),
};
export const ZONE_OF = {
  [SPECIAL.breakRoom]: "breakRoom",
  [SPECIAL.conferenceRoom]: "conferenceRoom",
  [SPECIAL.collabSpace]: "collabSpace",
};
export const TYPE_POINTS = {
  cube: 1,
  window: 2,
  cornerOffice: 3,
  breakRoom: 2,
  conferenceRoom: 2,
  collabSpace: 2,
};
export const GREEN_EDGE = 0,
  ORANGE_EDGE = COLS - 1;

export const NEUTRAL_START = [
  idx(1, 3), idx(1, 4), idx(1, 5), idx(2, 3), idx(2, 4),
  idx(3, 2), idx(3, 3), idx(3, 5), idx(4, 4), idx(3, 4),
];
export const GREEN_START = [idx(1, 0), idx(2, 0), idx(3, 0)];
export const ORANGE_START = [idx(2, 7), idx(3, 7), idx(4, 7)];

export function cellType(i) {
  for (const k in SPECIAL) if (SPECIAL[k] === i) return k;
  const [r] = rc(i);
  if (r === 0) return "window";
  return "cube";
}

export function freshBoard() {
  const b = [];
  for (let i = 0; i < CELLS; i++) {
    b.push({ type: cellType(i), occupant: null, fortifiedUntil: 0, stinkyUntil: 0 });
  }
  NEUTRAL_START.forEach((i) => (b[i].occupant = "neutral"));
  GREEN_START.forEach((i) => (b[i].occupant = "green"));
  ORANGE_START.forEach((i) => (b[i].occupant = "orange"));
  return b;
}

// orthogonal neighbors only — no diagonals
export function neighbors(i) {
  const [r, c] = rc(i);
  const out = [];
  if (r > 0) out.push(i - COLS);
  if (r < ROWS - 1) out.push(i + COLS);
  if (c > 0) out.push(i - 1);
  if (c < COLS - 1) out.push(i + 1);
  return out;
}

export const enemyOf = (s) => (s === "green" ? "orange" : "green");

// ---- actions ----------------------------------------------------------------
export const ACTIONS = [
  { id: "coffee", name: "Coffee Run", emoji: "☕", cost: 1, needs: "cell", desc: "Recruit a neutral next to you" },
  { id: "bagels", name: "Free Bagels", emoji: "🥯", cost: 2, needs: "cell", desc: "Lure an adjacent rival → neutral" },
  { id: "poach", name: "Counter-Offer", emoji: "💰", cost: 4, needs: "cell", desc: "Instantly poach an adjacent rival" },
  { id: "phone", name: "Loud Phone Call", emoji: "📞", cost: 1, needs: "cell", desc: "A worker flees to a nearby empty desk" },
  { id: "fish", name: "Microwave Fish", emoji: "🐟", cost: 3, needs: "cell", desc: "Stink-bomb a desk + its neighbors" },
  { id: "replyall", name: "Reply-All", emoji: "📧", cost: 3, needs: "line", desc: "Scatter an entire row or column" },
  { id: "ergo", name: "Ergonomic Upgrade", emoji: "🪑", cost: 2, needs: "cell", desc: "Fortify one of your desks" },
  { id: "reorg", name: "The Reorg", emoji: "🔄", cost: 2, needs: "two", desc: "Swap two adjacent desks" },
  { id: "hackathon", name: "Hackathon", emoji: "🦄", cost: 3, needs: "none", desc: "+2 bonus deploys this turn" },
];

export const FLAVOR = {
  coffee: (n) => `${n} lured a free agent with fresh coffee. ☕`,
  bagels: (n) => `${n} put out free bagels — a rival wandered off to neutral. 🥯`,
  poach: (n) => `${n} made a counter-offer they couldn't refuse. 💰`,
  phone: (n) => `${n} took a VERY loud call. Someone fled. 📞`,
  fish: (n) => `${n} microwaved fish. The area has been evacuated. 🐟`,
  replyall: (n) => `${n} hit Reply-All. Chaos scattered the line. 📧`,
  ergo: (n) => `${n} expensed a fancy chair. That desk is locked in. 🪑`,
  reorg: (n) => `${n} announced a reorg. Two desks swapped. 🔄`,
  hackathon: (n) => `${n} ran a hackathon — two fresh hires incoming. 🦄`,
  deploy: (n) => `${n} onboarded a new hire.`,
  snack: (n) => `${n} ran a snack break and recruited a neutral. 🍩`,
  meeting: (n) => `${n} called a mandatory meeting — a rival lane got pulled out. 📊`,
  brainstorm: (n) => `${n} held a brainstorm — desks near the lounge are fortified. 🛋️`,
};
