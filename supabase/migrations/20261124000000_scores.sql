-- 全球排行榜（限时挑战 / 多人对抗）
create table if not exists public.scores (
  id bigint generated always as identity primary key,
  mode text not null check (mode in ('challenge', 'mp')),
  name text not null check (char_length(name) between 1 and 12),
  char text,
  score integer not null check (score between 0 and 100000),
  rings integer not null default 0,
  hoops integer not null default 0,
  snitch integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists scores_mode_score_idx on public.scores (mode, score desc);

-- 行级安全：任何人都能看排行榜、提交成绩，但不能修改或删除
alter table public.scores enable row level security;
drop policy if exists "scores readable" on public.scores;
create policy "scores readable" on public.scores for select to anon, authenticated using (true);
drop policy if exists "scores insertable" on public.scores;
create policy "scores insertable" on public.scores for insert to anon, authenticated with check (true);
grant select, insert on public.scores to anon, authenticated;
