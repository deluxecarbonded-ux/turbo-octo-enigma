-- ============================================================================
-- EXOTIC — Cartoon Legends Characters & New Skins Set Migration
-- 1. Adds 4 playable Cartoon Legends characters (Tom, Jerry, Bugs Bunny,
--    Donald Duck) and a set of 8 new Coin-unlockable Skins to public.shop_items.
-- 2. All 12 new items have is_starter = false, cost > 0 Coins, and are NOT in
--    public.is_guest_allowed_item(text), so they are Locked (Not Available For
--    Guest Users) across rpc_shop_transaction, rpc_equip_loadout_item, and
--    rpc_sync_runner_state.
-- ============================================================================

insert into public.shop_items (
  id, category, name, tier, cost, currency, description, is_starter, sort_order, metadata
) values
  -- 4 New Characters (Locked for Guest Users)
  (
    'char_tom',
    'characters',
    'Tom',
    'Rare',
    65,
    'coins',
    'Scheming housecat rival with wide-set ears, cheek tufts, arched brows, and a white-tipped tail. Full account required.',
    false,
    4,
    '{"tier":"Rare","starter":false,"guestLocked":true}'::jsonb
  ),
  (
    'char_jerry',
    'characters',
    'Jerry',
    'Rare',
    60,
    'coins',
    'Quick-witted little mouse sporting oversized saucer ears, forehead curl, bright eyes, and nimble stride. Full account required.',
    false,
    5,
    '{"tier":"Rare","starter":false,"guestLocked":true}'::jsonb
  ),
  (
    'char_bugs_bunny',
    'characters',
    'Bugs Bunny',
    'Epic',
    85,
    'coins',
    'Suave wise-cracking hare with sky-high ears, puffed cheeks, half-lidded gaze, and buck teeth. Full account required.',
    false,
    6,
    '{"tier":"Epic","starter":false,"guestLocked":true}'::jsonb
  ),
  (
    'char_donald_duck',
    'characters',
    'Donald Duck',
    'Epic',
    90,
    'coins',
    'Feisty sailor-capped duck featuring a wide expressive bill, bow-tied tunic, tail feathers, and webbed stride. Full account required.',
    false,
    7,
    '{"tier":"Epic","starter":false,"guestLocked":true}'::jsonb
  ),
  -- 8 New Skins (Locked for Guest Users)
  (
    'skin_sailor',
    'skins',
    'Sailor Regalia',
    'Uncommon',
    40,
    'coins',
    'Nautical deck tunic sporting crisp collar stripes, V-neck kerchief, and front bow knot. Full account required.',
    false,
    24,
    '{"tier":"Uncommon","starter":false,"guestLocked":true}'::jsonb
  ),
  (
    'skin_polka',
    'skins',
    'Vintage Polka',
    'Uncommon',
    55,
    'coins',
    'Staggered cartoon polka-dot weave locked cleanly across ears, limbs, and torso. Full account required.',
    false,
    25,
    '{"tier":"Uncommon","starter":false,"guestLocked":true}'::jsonb
  ),
  (
    'skin_chevron',
    'skins',
    'Velocity Chevron',
    'Rare',
    75,
    'coins',
    'Kinetic directional chevron bands surging upward through your runner silhouette. Full account required.',
    false,
    26,
    '{"tier":"Rare","starter":false,"guestLocked":true}'::jsonb
  ),
  (
    'skin_harlequin',
    'skins',
    'Harlequin Argyle',
    'Rare',
    95,
    'coins',
    'Classic theatrical diamond lattice inspired by slapstick stage performers. Full account required.',
    false,
    27,
    '{"tier":"Rare","starter":false,"guestLocked":true}'::jsonb
  ),
  (
    'skin_filmstrip',
    'skins',
    'Celluloid Reel',
    'Epic',
    120,
    'coins',
    'Scrolling cinema reel perforations and frame bars straight from a projector booth. Full account required.',
    false,
    28,
    '{"tier":"Epic","starter":false,"guestLocked":true}'::jsonb
  ),
  (
    'skin_mosaic',
    'skins',
    'Shattered Mosaic',
    'Epic',
    145,
    'coins',
    'Interlocking faceted geometric shards with alternating contrast plates. Full account required.',
    false,
    29,
    '{"tier":"Epic","starter":false,"guestLocked":true}'::jsonb
  ),
  (
    'skin_eclipse',
    'skins',
    'Lunar Corona',
    'Mythic',
    170,
    'coins',
    'Concentric eclipse rings expanding gently from a shadowed inner crescent. Full account required.',
    false,
    30,
    '{"tier":"Mythic","starter":false,"guestLocked":true}'::jsonb
  ),
  (
    'skin_cipher',
    'skins',
    'Binary Cipher',
    'Exotic',
    205,
    'coins',
    'Cascading vertical glyph columns streaming smoothly across your form. Full account required.',
    false,
    31,
    '{"tier":"Exotic","starter":false,"guestLocked":true}'::jsonb
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

-- Re-sequence sort_order cleanly across all 74 shop_items rows to match UI catalog order
with ordered_ids(id, seq) as (
  values
    ('char_classic', 1),
    ('char_mickey', 2),
    ('char_stickman', 3),
    ('char_tom', 4),
    ('char_jerry', 5),
    ('char_bugs_bunny', 6),
    ('char_donald_duck', 7),
    ('char_cat', 8),
    ('char_bunny', 9),
    ('char_shinobi', 10),
    ('char_slime', 11),
    ('char_knight', 12),
    ('char_skeleton', 13),
    ('char_imp', 14),
    ('char_astronaut', 15),
    ('char_phantom', 16),
    ('char_tvhead', 17),
    ('char_cyborg', 18),
    ('char_ronin', 19),
    ('char_monolith', 20),
    ('skin_solid', 21),
    ('skin_inverted', 22),
    ('skin_steamboat', 23),
    ('skin_sailor', 24),
    ('skin_polka', 25),
    ('skin_chevron', 26),
    ('skin_harlequin', 27),
    ('skin_filmstrip', 28),
    ('skin_mosaic', 29),
    ('skin_eclipse', 30),
    ('skin_cipher', 31),
    ('skin_sketch', 32),
    ('skin_split', 33),
    ('skin_tuxedo', 34),
    ('skin_toon_ink', 35),
    ('skin_checker', 36),
    ('skin_tiger', 37),
    ('skin_halftone', 38),
    ('skin_bandage', 39),
    ('skin_scanline', 40),
    ('skin_xray', 41),
    ('skin_hollow', 42),
    ('skin_stardust', 43),
    ('skin_glitch', 44),
    ('aura_none', 45),
    ('aura_sparkle', 46),
    ('aura_bat', 47),
    ('aura_butterfly', 48),
    ('aura_feather', 49),
    ('aura_vortex', 50),
    ('aura_crown', 51),
    ('aura_eclipse', 52),
    ('trail_none', 53),
    ('trail_dust', 54),
    ('trail_ghost', 55),
    ('trail_ribbon', 56),
    ('trail_rings', 57),
    ('trail_shards', 58),
    ('trail_bolt', 59),
    ('trail_binary', 60),
    ('emote_salute', 61),
    ('emote_clap', 62),
    ('emote_backflip', 63),
    ('emote_laugh', 64),
    ('emote_rage', 65),
    ('emote_zen', 66),
    ('emote_spin', 67),
    ('emote_rip', 68),
    ('upg_coyote', 69),
    ('upg_magnet', 70),
    ('upg_double_jump', 71),
    ('upg_dash', 72),
    ('upg_radar', 73),
    ('upg_shield', 74)
)
update public.shop_items s
set
  sort_order = o.seq,
  updated_at = now()
from ordered_ids o
where s.id = o.id;
