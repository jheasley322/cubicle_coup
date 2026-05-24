# Cubicle Coup 🏢

A two-player, turn-based office-territory strategy game. Two department heads fight to
control desks on a cartoon top-down office floor plan. Lure neutrals with coffee, poach
rivals with counter-offers, clear a wing by microwaving fish, and seize the corner
office. Most territory points after 12 rounds wins.

**▶ Play:** https://jheasley322.github.io/cubicle_coup/

Create a floor, send the 4-letter code to a friend, and play from any two devices.

---

## The game at a glance

- 8×6 floor, 12 rounds. Clout (⚡) +3/turn, banks to 6. Headcount (👥) 12 each.
- **9 actions:** Coffee Run, Free Bagels, Counter-Offer (poach), Loud Phone Call,
  Microwave Fish, Reply-All, Ergonomic Upgrade, The Reorg, Hackathon.
- **3 power zones** you unlock by sitting on them: Break Room, Conference Room, Collab Space.
- **Corner office** = 3 pts and the tiebreaker. Don't turtle — the points are in midfield.

Tap **rules** in-game for the full breakdown.

## How it works

GitHub Pages serves static files only, so the shared game state lives in Supabase. Two
separate deploys, two jobs:

```
  Player A browser ─┐
                    ├─ HTTPS ─► Edge Function `game` ─► Postgres (one row per game)
  Player B browser ─┘             (turn + version guards)      Realtime ──► both browsers
```

- **Front-end** — Vite + React, static-built and hosted on **GitHub Pages**. Talks only
  to the Edge Function; holds only the public *publishable* key.
- **Backend** — a single Supabase **Edge Function** (`supabase/functions/game`) implements
  create / join / read / move / rematch. It enforces two server-side guards:
  1. **Turn ownership** — a per-side secret token must match the side whose turn it is.
  2. **Optimistic concurrency** — a write only lands if `version == expectedVersion`.
- **Sync** — clients subscribe to the game row via **Supabase Realtime**, with a ~2s poll
  as a safety net. Move resolution is client-computed; the server is the authority on
  turn order and version.
- **Security** — side tokens live in a separate `cubicle_game_secrets` table that clients
  can't read, so Realtime/REST never leak them. The real DB credential never leaves Supabase.

## Local development

```bash
npm install
cp .env.example .env.local        # fill in VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
npm run dev                       # http://localhost:5173  (set VITE_BASE=/ if base path bites)
```

Both env values are safe in the browser — the publishable key is gated by RLS and the
Edge Function; the service_role key never ships to the client.

## Backend

Schema lives in `supabase/migrations/`; the API in `supabase/functions/game`.

```bash
# Apply schema (needs a Supabase access token, sbp_...)
#   via Management API query endpoint, or:  supabase db push

# Deploy the function
SUPABASE_ACCESS_TOKEN=sbp_... npx supabase functions deploy game \
  --project-ref <your-project-ref>

# Smoke-test the live API (create/join/turn-lock/version/stale guards)
python3 scripts/smoke_test.py
```

## Deployment

Pushing to `main` triggers `.github/workflows/deploy.yml`, which builds with Vite and
publishes `dist/` to GitHub Pages. The build reads `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` from repo secrets.

## Project structure

```
index.html                     # Vite entry
src/
  main.jsx                     # React mount
  App.jsx                      # screens, turn flow, targeting, rendering
  engine.js                    # pure game rules (behavioral source of truth)
  constants.js                 # board geometry, actions, colors
  components.jsx               # SVG art, board cell, scoreboard, modals
  net.js                       # Supabase sync layer (Edge Function + Realtime)
  config.js                    # build-time env
supabase/
  migrations/                  # cubicle_games + cubicle_game_secrets + RLS + realtime
  functions/game/              # the game API (Edge Function)
scripts/smoke_test.py          # headless API guard test
.github/workflows/deploy.yml   # build + deploy to Pages
```
