-- Cubicle Coup — initial schema.
-- One row per game. Side tokens are isolated in a separate table so they can
-- never leak via the anon REST API or Realtime payloads.

create table if not exists public.cubicle_games (
    code        text primary key,            -- 4-char room code
    state       jsonb       not null,         -- full game state object (see GAME_DESIGN)
    version     integer     not null default 1,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

-- Supports the stale-game cleanup job.
create index if not exists idx_cubicle_games_updated_at
    on public.cubicle_games (updated_at);

-- Secrets that control each side. NOT exposed to clients — only Edge Functions
-- (service_role) ever read or write these.
create table if not exists public.cubicle_game_secrets (
    code         text primary key references public.cubicle_games (code) on delete cascade,
    green_token  text not null,
    orange_token text
);

-- ---------------------------------------------------------------- RLS
alter table public.cubicle_games        enable row level security;
alter table public.cubicle_game_secrets enable row level security;

-- Anyone may READ a game row (needed for initial load + Realtime). No client
-- writes — all mutations go through Edge Functions using the service_role key,
-- which bypasses RLS.
drop policy if exists "games readable by anyone" on public.cubicle_games;
create policy "games readable by anyone"
    on public.cubicle_games
    for select
    to anon, authenticated
    using (true);

-- cubicle_game_secrets: no client policies at all => anon/authenticated have
-- zero access. Edge Functions reach it via service_role.

-- ---------------------------------------------------------------- Realtime
-- Broadcast row changes on cubicle_games so clients get pushed updates.
do $$
begin
    if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'cubicle_games'
    ) then
        alter publication supabase_realtime add table public.cubicle_games;
    end if;
end $$;
