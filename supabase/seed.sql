-- =============================================================================
-- Kodukangelased — seed data. Run after schema.sql.
-- Default parent PIN is 1234 — change it in the app (Vanemad → Seaded).
-- =============================================================================

insert into public.settings (family_name, approval_required, streak_length, streak_bonus)
values ('Kodukangelased', false, 5, 10);

insert into private.parent_secret (pin_hash)
values (extensions.crypt('1234', extensions.gen_salt('bf')));

insert into public.members (name, role, avatar, color, multiplier, sort_order) values
  ('Tõnis',   'parent', '🐻', '#2563eb', 1.00, 1),
  ('Riin',    'parent', '🦊', '#ea580c', 1.00, 2),
  ('Trevor',  'child',  '🦖', '#16a34a', 1.50, 3),
  ('Rosanna', 'child',  '🦄', '#c026d3', 1.50, 4);

-- Shared daily: first one to claim it today gets the points.
insert into public.tasks (name, emoji, points, kind, sort_order) values
  ('Nõudepesumasina tühjendamine', '🍽️', 10, 'shared_daily', 1),
  ('Laua katmine',                 '🍴',  6, 'shared_daily', 2);

-- Personal daily for everyone.
insert into public.tasks (name, emoji, points, kind, sort_order) values
  ('Oma toa koristamine', '🧸', 8, 'personal_daily', 3);

-- Kids only.
insert into public.tasks (name, emoji, points, kind, assignees, weekdays, streak_enabled, sort_order)
select v.name, v.emoji, v.points, v.kind,
       (select array_agg(id order by sort_order) from public.members where role = 'child'),
       v.weekdays::smallint[], v.streak, v.sort_order
  from (values
    ('Kooliks harjutamine',                                    '📚', 10, 'personal_daily',  '{1,2,3,4,5,6,7}', false, 4),
    -- School nights only (Sun–Thu), so the streak isn't broken by the weekend.
    ('Koolikoti ja asjade valmis panemine järgmiseks päevaks', '🎒',  5, 'personal_daily',  '{1,2,3,4,7}',     true,  5),
    ('Koolipäeviku täitmine järgmiseks nädalaks',              '📒', 15, 'personal_weekly', '{1,2,3,4,5,6,7}', false, 6)
  ) as v(name, emoji, points, kind, weekdays, streak, sort_order);

insert into public.activities (name, emoji, sort_order) values
  ('Filmiõhtu diivanil',       '🎬', 1),
  ('Lauamänguõhtu',            '🎲', 2),
  ('Pitsaõhtu',                '🍕', 3),
  ('Väljasõit',                '🚗', 4),
  ('Matk metsas',              '🌲', 5),
  ('Veekeskus või ujula',      '🏊', 6),
  ('Pannkoogihommik',          '🥞', 7),
  ('Kinoskäik',                '🍿', 8),
  ('Piknik',                   '🧺', 9),
  ('Bowling',                  '🎳', 10);

-- The first competition week starts now.
insert into public.weeks default values;
