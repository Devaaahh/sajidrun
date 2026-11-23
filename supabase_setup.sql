-- Run this once in Supabase: Dashboard -> SQL Editor -> New query -> paste -> Run
create table if not exists public.scores (
  id          bigint generated always as identity primary key,
  name        text    not null check (char_length(name) <= 16),
  score       integer not null check (score >= 0),
  coins       integer not null default 0,
  distance    integer not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists scores_score_idx on public.scores (score desc);

-- Row Level Security: anyone with the anon key may read and add scores, nobody may edit/delete.
alter table public.scores enable row level security;

drop policy if exists "read scores" on public.scores;
create policy "read scores" on public.scores for select using (true);

drop policy if exists "add scores" on public.scores;
create policy "add scores" on public.scores for insert with check (true);
