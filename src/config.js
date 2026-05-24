// Build-time config. Values come from Vite env (VITE_*), never hardcoded.
// See .env.example. Missing values fail loud in dev so misconfig is obvious.
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Realtime is primary; this poll is a safety net if a subscription drops.
export const POLL_INTERVAL_MS = 2000;

if (import.meta.env.DEV && (!SUPABASE_URL || !SUPABASE_ANON_KEY)) {
  console.warn(
    "[cubicle-coup] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set. " +
      "Copy .env.example to .env.local and fill them in."
  );
}
