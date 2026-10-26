-- ============================================================================
-- EXOTIC — Halloween Special: Scream Character Migration
-- 1. Adds playable 'char_scream' ('Scream' — tier 'Halloween Special', 95 Coins)
--    to public.shop_items at sort_order 4 (featured right beside Starter row).
-- 2. Locked for Guest accounts (requires full account, unlocked with Coins).
-- ============================================================================

insert into public.shop_items (
  id, category, name, tier, cost, currency, description, is_starter, sort_order, metadata
) values (
  'char_scream',
  'characters',
  'Scream',
  'Halloween Special',
  95,
  'coins',
  'Shrouded Halloween phantom wearing the elongated Ghostface scream mask, billowing tattered reaper cloak, and gleaming prop blade. Full account required.',
  false,
  4,
  '{"tier":"Halloween Special","event":"Halloween","starter":false,"guestLocked":true}'::jsonb
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
    ('char_scream', 4),
    ('char_tom', 5),
    ('char_jerry', 6),
    ('char_bugs_bunny', 7),
    ('char_donald_duck', 8),
    ('char_cat', 9),
    ('char_bunny', 10),
    ('char_shinobi', 11),
    ('char_slime', 12),
    ('char_knight', 13),
    ('char_skeleton', 14),
    ('char_imp', 15),
    ('char_astronaut', 16),
    ('char_phantom', 17),
    ('char_tvhead', 18),
    ('char_cyborg', 19),
    ('char_ronin', 20),
    ('char_monolith', 21)
) as v(id, ord)
where s.id = v.id;
