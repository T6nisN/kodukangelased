-- =============================================================================
-- Kodukangelased — Supabase schema, RLS and RPC functions
-- Run once in Supabase Dashboard → SQL Editor (then run seed.sql).
--
-- Security model
--   * One Supabase Auth user = the family account. Only auth users listed in
--     public.family_users can read anything (RLS via public.is_family()).
--   * Clients get SELECT only. Every write goes through SECURITY DEFINER RPCs
--     below, which validate rules server-side (one claim per day, etc.).
--   * Parent actions require the parent PIN. The PIN hash lives in the
--     `private` schema, which PostgREST does not expose.
--   * All "today" logic uses Europe/Tallinn time, computed by the database.
-- =============================================================================

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------

create table public.family_users (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.members (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 1 and 30),
  role       text not null check (role in ('parent', 'child')),
  avatar     text not null default '🙂' check (char_length(avatar) between 1 and 16),
  color      text not null default '#7c5cff' check (color ~ '^#[0-9a-fA-F]{6}$'),
  -- Fairness: task points are multiplied by this (kids default 1.5).
  multiplier numeric(3, 2) not null default 1.00 check (multiplier between 0.5 and 3),
  sort_order int not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.tasks (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (char_length(name) between 1 and 80),
  emoji          text not null default '⭐' check (char_length(emoji) between 1 and 16),
  points         int not null check (points between 1 and 100),
  kind           text not null check (kind in ('shared_daily', 'personal_daily', 'personal_weekly')),
  assignees      uuid[],                                     -- null = everyone
  weekdays       smallint[] not null default '{1,2,3,4,5,6,7}', -- ISO: 1 = Mon … 7 = Sun
  streak_enabled boolean not null default false,             -- only meaningful for personal_daily
  active         boolean not null default true,
  archived       boolean not null default false,             -- "deleted" but kept for history
  sort_order     int not null default 0,
  created_at     timestamptz not null default now(),
  check (weekdays <@ '{1,2,3,4,5,6,7}'::smallint[] and cardinality(weekdays) > 0)
);

-- A "week" is a competition round: it starts when the previous one is closed
-- and ends when a parent presses "Lõpeta nädal" (typically Friday evening).
create table public.weeks (
  id                 uuid primary key default gen_random_uuid(),
  started_at         timestamptz not null default now(),
  ended_at           timestamptz,
  standings          jsonb,    -- snapshot at close: [{member_id,name,avatar,color,points,tasks}]
  winner_ids         uuid[],
  activity           text check (activity is null or char_length(activity) between 1 and 80),
  activity_emoji     text,
  activity_chosen_at timestamptz
);
-- At most one open week at any time.
create unique index weeks_one_open on public.weeks ((true)) where ended_at is null;

create table public.completions (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid not null references public.tasks (id),
  member_id    uuid not null references public.members (id),
  week_id      uuid not null references public.weeks (id),
  kind         text not null,               -- snapshot of tasks.kind (used by unique indexes)
  day          date not null,               -- Europe/Tallinn calendar date
  base_points  int not null,
  multiplier   numeric(3, 2) not null,
  bonus_points int not null default 0,      -- streak bonus
  points       int not null,                -- round(base * multiplier) + bonus
  streak       int not null default 0,
  status       text not null default 'done' check (status in ('done', 'pending', 'removed')),
  created_at   timestamptz not null default now(),
  removed_at   timestamptz
);

-- The completion rules, enforced by the database (race-proof across devices):
create unique index completions_shared_daily_once
  on public.completions (task_id, day)
  where kind = 'shared_daily' and status <> 'removed';
create unique index completions_personal_daily_once
  on public.completions (task_id, member_id, day)
  where kind = 'personal_daily' and status <> 'removed';
create unique index completions_personal_weekly_once
  on public.completions (task_id, member_id, week_id)
  where kind = 'personal_weekly' and status <> 'removed';

create index completions_week_idx on public.completions (week_id);
create index completions_day_idx on public.completions (day);
create index completions_streak_idx on public.completions (task_id, member_id, day);

create table public.activities (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 1 and 60),
  emoji      text not null default '🎉' check (char_length(emoji) between 1 and 16),
  active     boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table public.settings (
  id                boolean primary key default true check (id),  -- single row
  family_name       text not null default 'Kodukangelased' check (char_length(family_name) between 1 and 40),
  approval_required boolean not null default false,
  streak_length     int not null default 5 check (streak_length between 2 and 30),
  streak_bonus      int not null default 10 check (streak_bonus between 0 and 100),
  updated_at        timestamptz not null default now()
);

create table private.parent_secret (
  id              boolean primary key default true check (id),     -- single row
  pin_hash        text not null,
  failed_attempts int not null default 0,
  locked_until    timestamptz
);

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------

create or replace function public.is_family()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.family_users where user_id = auth.uid());
$$;

create or replace function public.tallinn_today()
returns date
language sql stable
as $$
  select (now() at time zone 'Europe/Tallinn')::date;
$$;

create or replace function private.assert_family()
returns void
language plpgsql stable security definer
set search_path = public
as $$
begin
  if not public.is_family() then
    raise exception 'not_family' using errcode = '42501';
  end if;
end;
$$;

-- Returns 'ok' | 'wrong_pin' | 'pin_locked'. Deliberately does NOT raise:
-- raising would roll back the failed-attempt counter. Callers return the
-- status to the client instead. 5 wrong tries → locked for 5 minutes.
create or replace function private.pin_status(p_pin text)
returns text
language plpgsql security definer
set search_path = private, public, extensions
as $$
declare
  s private.parent_secret%rowtype;
begin
  perform private.assert_family();
  select * into s from private.parent_secret where id for update;

  if s.locked_until is not null and s.locked_until > now() then
    return 'pin_locked';
  end if;

  if p_pin is not null and extensions.crypt(p_pin, s.pin_hash) = s.pin_hash then
    update private.parent_secret set failed_attempts = 0, locked_until = null where id;
    return 'ok';
  end if;

  if s.failed_attempts + 1 >= 5 then
    update private.parent_secret
       set failed_attempts = 0, locked_until = now() + interval '5 minutes'
     where id;
    return 'pin_locked';
  end if;

  update private.parent_secret set failed_attempts = failed_attempts + 1 where id;
  return 'wrong_pin';
end;
$$;

create or replace function private.open_week_id()
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.weeks where ended_at is null;
  if v_id is null then
    insert into public.weeks default values on conflict do nothing;
    select id into v_id from public.weeks where ended_at is null;
  end if;
  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: everyone in the family (no PIN)
-- -----------------------------------------------------------------------------

create or replace function public.complete_task(p_task_id uuid, p_member_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  t        public.tasks%rowtype;
  m        public.members%rowtype;
  s        public.settings%rowtype;
  v_today  date := public.tallinn_today();
  v_week   uuid;
  v_streak int := 0;
  v_bonus  int := 0;
  v_points int;
  v_status text;
  v_id     uuid;
  d        date;
begin
  perform private.assert_family();

  select * into t from public.tasks where id = p_task_id and active and not archived;
  if not found then raise exception 'task_unavailable'; end if;

  select * into m from public.members where id = p_member_id and active;
  if not found then raise exception 'member_unavailable'; end if;

  if coalesce(cardinality(t.assignees), 0) > 0 and not (m.id = any (t.assignees)) then
    raise exception 'not_assigned';
  end if;

  if not (extract(isodow from v_today)::smallint = any (t.weekdays)) then
    raise exception 'not_today';
  end if;

  select * into s from public.settings where id;
  v_week := private.open_week_id();

  -- Streak: count consecutive *scheduled* days (incl. today) this member did it.
  if t.streak_enabled and t.kind = 'personal_daily' then
    v_streak := 1;
    d := v_today - 1;
    for i in 1..90 loop
      if extract(isodow from d)::smallint = any (t.weekdays) then
        exit when not exists (
          select 1 from public.completions c
           where c.task_id = t.id and c.member_id = m.id and c.day = d and c.status <> 'removed'
        );
        v_streak := v_streak + 1;
      end if;
      d := d - 1;
    end loop;
    if s.streak_bonus > 0 and v_streak % s.streak_length = 0 then
      v_bonus := s.streak_bonus;
    end if;
  end if;

  v_points := round(t.points * m.multiplier)::int + v_bonus;
  v_status := case when s.approval_required and m.role = 'child' then 'pending' else 'done' end;

  begin
    insert into public.completions
      (task_id, member_id, week_id, kind, day, base_points, multiplier, bonus_points, points, streak, status)
    values
      (t.id, m.id, v_week, t.kind, v_today, t.points, m.multiplier, v_bonus, v_points, v_streak, v_status)
    returning id into v_id;
  exception when unique_violation then
    if t.kind = 'shared_daily' then
      raise exception 'already_claimed';
    else
      raise exception 'already_done';
    end if;
  end;

  return jsonb_build_object(
    'id', v_id, 'points', v_points, 'bonus', v_bonus, 'streak', v_streak, 'status', v_status
  );
end;
$$;

-- Undo. Within 2 minutes of completing, anyone can undo ("oih, eksisin").
-- After that, the parent PIN is required. Only the open week can be changed.
create or replace function public.undo_completion(p_completion_id uuid, p_pin text default null)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  c  public.completions%rowtype;
  st text;
begin
  perform private.assert_family();

  select * into c from public.completions where id = p_completion_id and status <> 'removed';
  if not found then raise exception 'not_found'; end if;

  if c.week_id is distinct from (select id from public.weeks where ended_at is null) then
    raise exception 'week_closed';
  end if;

  if c.created_at < now() - interval '2 minutes' then
    st := private.pin_status(p_pin);
    if st <> 'ok' then return jsonb_build_object('error', st); end if;
  end if;

  update public.completions set status = 'removed', removed_at = now() where id = c.id;
  return jsonb_build_object('ok', true);
end;
$$;

-- The winner(s) pick the family activity for a closed week. Once only.
create or replace function public.choose_activity(p_week_id uuid, p_activity text, p_emoji text default null)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_name text := btrim(p_activity);
begin
  perform private.assert_family();
  if v_name is null or char_length(v_name) not between 1 and 80 then
    raise exception 'invalid_activity';
  end if;

  update public.weeks
     set activity = v_name,
         activity_emoji = coalesce(nullif(btrim(p_emoji), ''), '🎉'),
         activity_chosen_at = now()
   where id = p_week_id and ended_at is not null and activity is null;

  if not found then raise exception 'activity_already_chosen'; end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: parent actions (PIN required). Wrong PIN → {"error": "..."} result.
-- -----------------------------------------------------------------------------

create or replace function public.verify_pin(p_pin text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare st text;
begin
  st := private.pin_status(p_pin);
  if st <> 'ok' then return jsonb_build_object('error', st); end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.change_pin(p_old_pin text, p_new_pin text)
returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare st text;
begin
  st := private.pin_status(p_old_pin);
  if st <> 'ok' then return jsonb_build_object('error', st); end if;
  if p_new_pin is null or p_new_pin !~ '^[0-9]{4,8}$' then raise exception 'invalid_pin'; end if;

  update private.parent_secret
     set pin_hash = extensions.crypt(p_new_pin, extensions.gen_salt('bf'))
   where id;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.approve_completion(p_pin text, p_completion_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare st text;
begin
  st := private.pin_status(p_pin);
  if st <> 'ok' then return jsonb_build_object('error', st); end if;

  update public.completions set status = 'done'
   where id = p_completion_id and status = 'pending';
  if not found then raise exception 'not_found'; end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- Close the current round, snapshot standings, pick winner(s), open a new round.
-- p_week_id guards against two parents closing at the same moment (the second
-- would otherwise close the brand-new empty week).
create or replace function public.close_week(p_pin text, p_week_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  st         text;
  w          public.weeks%rowtype;
  v_stand    jsonb;
  v_max      int;
  v_winners  uuid[];
begin
  st := private.pin_status(p_pin);
  if st <> 'ok' then return jsonb_build_object('error', st); end if;

  select * into w from public.weeks where ended_at is null for update;
  if not found or w.id <> p_week_id then raise exception 'already_closed'; end if;

  -- Anything still waiting for approval counts — parents had their chance.
  update public.completions set status = 'done' where week_id = w.id and status = 'pending';

  with totals as (
    select m.id, m.name, m.avatar, m.color, m.sort_order,
           coalesce(sum(c.points), 0)::int as points,
           count(c.id)::int               as tasks
      from public.members m
      left join public.completions c
        on c.member_id = m.id and c.week_id = w.id and c.status = 'done'
     group by m.id
    having m.active or count(c.id) > 0
  )
  select jsonb_agg(jsonb_build_object(
           'member_id', id, 'name', name, 'avatar', avatar, 'color', color,
           'points', points, 'tasks', tasks)
         order by points desc, sort_order),
         max(points)
    into v_stand, v_max
    from totals;

  if coalesce(v_max, 0) > 0 then
    select array_agg((e ->> 'member_id')::uuid)
      into v_winners
      from jsonb_array_elements(v_stand) e
     where (e ->> 'points')::int = v_max;
  end if;

  update public.weeks
     set ended_at = now(), standings = coalesce(v_stand, '[]'::jsonb), winner_ids = v_winners
   where id = w.id;

  insert into public.weeks default values;

  return jsonb_build_object('ok', true, 'closed_week_id', w.id, 'winner_ids', to_jsonb(v_winners));
end;
$$;

-- Helpers to turn JSON arrays into typed Postgres arrays (empty → null/default).
create or replace function private.json_uuid_array(j jsonb)
returns uuid[]
language sql immutable
as $$
  select case
    when j is null or jsonb_typeof(j) <> 'array' or jsonb_array_length(j) = 0 then null
    else (select array_agg(v::uuid) from jsonb_array_elements_text(j) v)
  end;
$$;

create or replace function private.json_smallint_array(j jsonb)
returns smallint[]
language sql immutable
as $$
  select case
    when j is null or jsonb_typeof(j) <> 'array' or jsonb_array_length(j) = 0 then '{1,2,3,4,5,6,7}'::smallint[]
    else (select array_agg(distinct v::smallint order by v::smallint) from jsonb_array_elements_text(j) v)
  end;
$$;

create or replace function public.save_task(p_pin text, p_task jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  st   text;
  v_id uuid := nullif(p_task ->> 'id', '')::uuid;
begin
  st := private.pin_status(p_pin);
  if st <> 'ok' then return jsonb_build_object('error', st); end if;

  if v_id is null then
    insert into public.tasks (name, emoji, points, kind, assignees, weekdays, streak_enabled, active, sort_order)
    values (
      btrim(p_task ->> 'name'),
      coalesce(nullif(btrim(p_task ->> 'emoji'), ''), '⭐'),
      (p_task ->> 'points')::int,
      p_task ->> 'kind',
      private.json_uuid_array(p_task -> 'assignees'),
      private.json_smallint_array(p_task -> 'weekdays'),
      coalesce((p_task ->> 'streak_enabled')::boolean, false) and p_task ->> 'kind' = 'personal_daily',
      coalesce((p_task ->> 'active')::boolean, true),
      coalesce((p_task ->> 'sort_order')::int, (select coalesce(max(sort_order), 0) + 1 from public.tasks))
    )
    returning id into v_id;
  else
    update public.tasks set
      name           = btrim(p_task ->> 'name'),
      emoji          = coalesce(nullif(btrim(p_task ->> 'emoji'), ''), '⭐'),
      points         = (p_task ->> 'points')::int,
      kind           = p_task ->> 'kind',
      assignees      = private.json_uuid_array(p_task -> 'assignees'),
      weekdays       = private.json_smallint_array(p_task -> 'weekdays'),
      streak_enabled = coalesce((p_task ->> 'streak_enabled')::boolean, false) and p_task ->> 'kind' = 'personal_daily',
      active         = coalesce((p_task ->> 'active')::boolean, true),
      sort_order     = coalesce((p_task ->> 'sort_order')::int, sort_order)
    where id = v_id and not archived;
    if not found then raise exception 'not_found'; end if;
  end if;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- Tasks with history are archived (kept for past weeks); unused ones are deleted.
create or replace function public.delete_task(p_pin text, p_task_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare st text;
begin
  st := private.pin_status(p_pin);
  if st <> 'ok' then return jsonb_build_object('error', st); end if;

  if exists (select 1 from public.completions where task_id = p_task_id) then
    update public.tasks set archived = true, active = false where id = p_task_id;
  else
    delete from public.tasks where id = p_task_id;
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.save_member(p_pin text, p_member jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  st   text;
  v_id uuid := nullif(p_member ->> 'id', '')::uuid;
begin
  st := private.pin_status(p_pin);
  if st <> 'ok' then return jsonb_build_object('error', st); end if;

  if v_id is null then
    insert into public.members (name, role, avatar, color, multiplier, sort_order, active)
    values (
      btrim(p_member ->> 'name'),
      p_member ->> 'role',
      coalesce(nullif(btrim(p_member ->> 'avatar'), ''), '🙂'),
      coalesce(p_member ->> 'color', '#7c5cff'),
      coalesce((p_member ->> 'multiplier')::numeric, 1),
      coalesce((p_member ->> 'sort_order')::int, (select coalesce(max(sort_order), 0) + 1 from public.members)),
      coalesce((p_member ->> 'active')::boolean, true)
    )
    returning id into v_id;
  else
    update public.members set
      name       = btrim(p_member ->> 'name'),
      role       = p_member ->> 'role',
      avatar     = coalesce(nullif(btrim(p_member ->> 'avatar'), ''), avatar),
      color      = coalesce(p_member ->> 'color', color),
      multiplier = coalesce((p_member ->> 'multiplier')::numeric, multiplier),
      sort_order = coalesce((p_member ->> 'sort_order')::int, sort_order),
      active     = coalesce((p_member ->> 'active')::boolean, active)
    where id = v_id;
    if not found then raise exception 'not_found'; end if;
  end if;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

create or replace function public.save_activity(p_pin text, p_activity jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  st   text;
  v_id uuid := nullif(p_activity ->> 'id', '')::uuid;
begin
  st := private.pin_status(p_pin);
  if st <> 'ok' then return jsonb_build_object('error', st); end if;

  if v_id is null then
    insert into public.activities (name, emoji, active, sort_order)
    values (
      btrim(p_activity ->> 'name'),
      coalesce(nullif(btrim(p_activity ->> 'emoji'), ''), '🎉'),
      coalesce((p_activity ->> 'active')::boolean, true),
      (select coalesce(max(sort_order), 0) + 1 from public.activities)
    )
    returning id into v_id;
  else
    update public.activities set
      name   = btrim(p_activity ->> 'name'),
      emoji  = coalesce(nullif(btrim(p_activity ->> 'emoji'), ''), emoji),
      active = coalesce((p_activity ->> 'active')::boolean, active)
    where id = v_id;
    if not found then raise exception 'not_found'; end if;
  end if;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

create or replace function public.delete_activity(p_pin text, p_activity_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare st text;
begin
  st := private.pin_status(p_pin);
  if st <> 'ok' then return jsonb_build_object('error', st); end if;
  delete from public.activities where id = p_activity_id;  -- weeks keep the activity as text
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.save_settings(p_pin text, p_settings jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare st text;
begin
  st := private.pin_status(p_pin);
  if st <> 'ok' then return jsonb_build_object('error', st); end if;

  update public.settings set
    family_name       = coalesce(nullif(btrim(p_settings ->> 'family_name'), ''), family_name),
    approval_required = coalesce((p_settings ->> 'approval_required')::boolean, approval_required),
    streak_length     = coalesce((p_settings ->> 'streak_length')::int, streak_length),
    streak_bonus      = coalesce((p_settings ->> 'streak_bonus')::int, streak_bonus),
    updated_at        = now()
  where id;
  return jsonb_build_object('ok', true);
end;
$$;

-- -----------------------------------------------------------------------------
-- Row Level Security: family members may read; nobody writes directly.
-- -----------------------------------------------------------------------------

alter table public.family_users enable row level security;
alter table public.members      enable row level security;
alter table public.tasks        enable row level security;
alter table public.weeks        enable row level security;
alter table public.completions  enable row level security;
alter table public.activities   enable row level security;
alter table public.settings     enable row level security;
alter table private.parent_secret enable row level security;  -- no policies = no access

create policy "own row"     on public.family_users for select to authenticated using (user_id = auth.uid());
create policy "family read" on public.members      for select to authenticated using (public.is_family());
create policy "family read" on public.tasks        for select to authenticated using (public.is_family());
create policy "family read" on public.weeks        for select to authenticated using (public.is_family());
create policy "family read" on public.completions  for select to authenticated using (public.is_family());
create policy "family read" on public.activities   for select to authenticated using (public.is_family());
create policy "family read" on public.settings     for select to authenticated using (public.is_family());

-- Defence in depth: strip table write privileges (Supabase grants them by default).
revoke all on all tables in schema public from anon;
revoke insert, update, delete, truncate on all tables in schema public from authenticated;
revoke all on all tables in schema private from public, anon, authenticated;

-- Functions: nothing for anon; explicit allow-list for the family account.
revoke execute on all functions in schema public  from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;

grant execute on function public.is_family()                          to authenticated;
grant execute on function public.tallinn_today()                      to authenticated;
grant execute on function public.complete_task(uuid, uuid)            to authenticated;
grant execute on function public.undo_completion(uuid, text)          to authenticated;
grant execute on function public.choose_activity(uuid, text, text)    to authenticated;
grant execute on function public.verify_pin(text)                     to authenticated;
grant execute on function public.change_pin(text, text)               to authenticated;
grant execute on function public.approve_completion(text, uuid)       to authenticated;
grant execute on function public.close_week(text, uuid)               to authenticated;
grant execute on function public.save_task(text, jsonb)               to authenticated;
grant execute on function public.delete_task(text, uuid)              to authenticated;
grant execute on function public.save_member(text, jsonb)             to authenticated;
grant execute on function public.save_activity(text, jsonb)           to authenticated;
grant execute on function public.delete_activity(text, uuid)          to authenticated;
grant execute on function public.save_settings(text, jsonb)           to authenticated;

-- -----------------------------------------------------------------------------
-- Realtime: push changes to all family devices (RLS still applies).
-- -----------------------------------------------------------------------------

alter publication supabase_realtime add table
  public.members, public.tasks, public.weeks, public.completions, public.activities, public.settings;
