-- ============================================================================
-- EXOTIC — GTA 6 Featured Characters: Jason & Lucia
-- 1. Adds playable 'char_jason' ('Jason' — tier 'Mythic', 115 Coins) and
--    'char_lucia' ('Lucia' — tier 'Mythic', 120 Coins) to public.shop_items.
-- 2. Locked for Guest accounts (requires full account, unlocked with Coins).
-- 3. Re-orders character lineup cleanly (1..23, 94 total shop_items).
-- ============================================================================

insert into public.shop_items (
  id, category, name, tier, cost, currency, description, is_starter, sort_order, metadata
) values
  (
    'char_jason',
    'characters',
    'Jason',
    'Mythic',
    115,
    'coins',
    'Vice City getaway driver sporting a backwards snapback cap, neck bandana, sleeveless tank top, and cargo boots. Full account required.',
    false,
    4,
    '{"tier":"Mythic","series":"GTA 6","starter":false,"guestLocked":true}'::jsonb
  ),
  (
    'char_lucia',
    'characters',
    'Lucia',
    'Mythic',
    120,
    'coins',
    'Fearless Leonida powerhouse featuring a flowing ponytail, hoop earrings, signature halter top, denim stride, and ankle monitor. Full account required.',
    false,
    5,
    '{"tier":"Mythic","series":"GTA 6","starter":false,"guestLocked":true}'::jsonb
  )
on conflict (id) do update set
  category = excluded.category,
  name = excluded.name,
  tier = excluded.tier,
  cost = excluded.cost,
  currency = excluded.currency,
  description = excluded.description,
  is_starter = excluded.is_starter,
  sort_order = excluded.sort_order,
  metadata = excluded.metadata,
  updated_at = now();

update public.shop_items as s
set sort_order = v.ord
from (
  values
    ('char_classic', 1),
    ('char_mickey', 2),
    ('char_stickman', 3),
    ('char_jason', 4),
    ('char_lucia', 5),
    ('char_scream', 6),
    ('char_tom', 7),
    ('char_jerry', 8),
    ('char_bugs_bunny', 9),
    ('char_donald_duck', 10),
    ('char_cat', 11),
    ('char_bunny', 12),
    ('char_shinobi', 13),
    ('char_slime', 14),
    ('char_knight', 15),
    ('char_skeleton', 16),
    ('char_imp', 17),
    ('char_astronaut', 18),
    ('char_phantom', 19),
    ('char_tvhead', 20),
    ('char_cyborg', 21),
    ('char_ronin', 22),
    ('char_monolith', 23)
) as v(id, ord)
where s.id = v.id;
