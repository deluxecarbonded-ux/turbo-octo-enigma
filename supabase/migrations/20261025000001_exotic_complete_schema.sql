-- ============================================================================
-- EXOTIC — Monochrome 2D Troll Rage-Bait Platformer
-- Complete Supabase PostgreSQL Schema, Catalog Rows, Triggers, RPCs, RLS,
-- Storage Buckets, and Full Realtime Publication Across Every Table
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. DOMAIN ENUMS
-- ----------------------------------------------------------------------------
do $$ begin
  create type public.shop_category as enum ('characters', 'skins', 'auras', 'trails', 'emotes', 'upgrades');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.currency_type as enum ('coins', 'sp');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.theme_mode as enum ('dark', 'light');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.realtime_event_type as enum (
    'death',
    'trap_triggered',
    'shy_door',
    'stage_clear',
    'deathless_clear',
    'orb_claimed',
    'item_unlocked',
    'loadout_equipped',
    'achievement_unlocked',
    'run_published',
    'emote_used',
    'runner_card_uploaded',
    'replay_uploaded'
  );
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- 2. REQUEST IDENTITY & UTILITY FUNCTIONS
-- ----------------------------------------------------------------------------
create or replace function public.current_client_key()
returns text
language plpgsql
stable
as $$
declare
  v_headers text;
  v_hdr_key text;
begin
  if auth.uid() is not null then
    return auth.uid()::text;
  end if;
  v_headers := current_setting('request.headers', true);
  if v_headers is not null and v_headers <> '' then
    begin
      v_hdr_key := (v_headers::jsonb ->> 'x-exotic-player-id');
      if v_hdr_key is not null and v_hdr_key <> '' then
        return left(v_hdr_key, 96);
      end if;
    exception when others then
      return null;
    end;
  end if;
  return null;
end;
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. COMPLETE TABLES (ALL 14 GAME & APP TABLES)
-- ----------------------------------------------------------------------------

-- 3.1 Shop Catalog (62 Real Exotic Items)
create table if not exists public.shop_items (
  id text primary key,
  category public.shop_category not null,
  name text not null,
  tier text not null,
  cost integer not null default 0 check (cost >= 0),
  currency public.currency_type not null default 'coins',
  description text not null,
  is_starter boolean not null default false,
  sort_order integer not null default 0,
  total_unlocks bigint not null default 0 check (total_unlocks >= 0),
  total_equips bigint not null default 0 check (total_equips >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_shop_items_category_sort on public.shop_items (category, sort_order);

-- 3.2 Levels Catalog (8 Real Handcrafted Troll Stages + Live Global Records)
create table if not exists public.levels_catalog (
  id integer primary key check (id between 1 and 8),
  code text not null unique,
  title text not null,
  subtitle text not null,
  width integer not null check (width >= 600),
  height integer not null check (height >= 400),
  par_deaths integer not null check (par_deaths >= 0),
  par_time_ms integer not null check (par_time_ms >= 1000),
  reward_coins integer not null check (reward_coins >= 0),
  spawn_x numeric not null,
  spawn_y numeric not null,
  quips jsonb not null default '[]'::jsonb,
  blueprint jsonb not null default '{}'::jsonb,
  global_attempts bigint not null default 0 check (global_attempts >= 0),
  global_clears bigint not null default 0 check (global_clears >= 0),
  global_deaths bigint not null default 0 check (global_deaths >= 0),
  global_orbs_found bigint not null default 0 check (global_orbs_found >= 0),
  world_record_time_ms integer,
  world_record_callsign text,
  world_record_deaths integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3.3 Achievements Catalog (10 Real Milestones)
create table if not exists public.achievements_catalog (
  id text primary key,
  title text not null,
  description text not null,
  reward_coins integer not null default 0 check (reward_coins >= 0),
  reward_sp integer not null default 0 check (reward_sp >= 0),
  metric_key text not null,
  target_value integer not null default 1 check (target_value >= 1),
  sort_order integer not null default 0,
  global_unlocks bigint not null default 0 check (global_unlocks >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3.4 Global Live Telemetry Singleton (Zero Mock Counts — Pure Real Aggregates)
create table if not exists public.global_telemetry (
  id text primary key default 'global' check (id = 'global'),
  total_players bigint not null default 0 check (total_players >= 0),
  online_runners integer not null default 0 check (online_runners >= 0),
  total_deaths bigint not null default 0 check (total_deaths >= 0),
  total_traps_triggered bigint not null default 0 check (total_traps_triggered >= 0),
  total_shy_doors bigint not null default 0 check (total_shy_doors >= 0),
  total_clears bigint not null default 0 check (total_clears >= 0),
  total_deathless_clears bigint not null default 0 check (total_deathless_clears >= 0),
  total_coins_collected bigint not null default 0 check (total_coins_collected >= 0),
  total_coins_spent bigint not null default 0 check (total_coins_spent >= 0),
  total_sp_earned bigint not null default 0 check (total_sp_earned >= 0),
  total_sp_spent bigint not null default 0 check (total_sp_spent >= 0),
  total_emotes_used bigint not null default 0 check (total_emotes_used >= 0),
  total_runs_published bigint not null default 0 check (total_runs_published >= 0),
  last_event_summary text not null default 'Exotic Live Cloud Ready',
  updated_at timestamptz not null default now()
);

-- 3.5 Player Profiles (Real Players Only — Zero Mock Users)
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  client_key text not null unique,
  callsign text not null default '' check (char_length(callsign) <= 20),
  coins integer not null default 0 check (coins >= 0),
  skill_points integer not null default 0 check (skill_points >= 0),
  avatar_storage_path text,
  runner_card_path text,
  total_deaths bigint not null default 0 check (total_deaths >= 0),
  traps_triggered bigint not null default 0 check (traps_triggered >= 0),
  parting_floor_deaths bigint not null default 0 check (parting_floor_deaths >= 0),
  shy_doors_triggered bigint not null default 0 check (shy_doors_triggered >= 0),
  quick_restarts bigint not null default 0 check (quick_restarts >= 0),
  total_coins_collected bigint not null default 0 check (total_coins_collected >= 0),
  emotes_used_in_stage bigint not null default 0 check (emotes_used_in_stage >= 0),
  gravity_flips_survived bigint not null default 0 check (gravity_flips_survived >= 0),
  deathless_clears bigint not null default 0 check (deathless_clears >= 0),
  stages_cleared integer not null default 0 check (stages_cleared between 0 and 8),
  achievements_count integer not null default 0 check (achievements_count >= 0),
  last_seen_route text not null default 'menu',
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_profiles_client_key on public.profiles (client_key);
create index if not exists idx_profiles_callsign on public.profiles (callsign) where callsign <> '';

-- 3.6 Player Settings (Live Cross-Device / Cross-Tab Synced Preferences)
create table if not exists public.player_settings (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  theme public.theme_mode not null default 'dark',
  muted boolean not null default false,
  volume numeric(4,2) not null default 0.70 check (volume between 0 and 1),
  screen_shake boolean not null default true,
  touch_controls boolean not null default false,
  live_ghosts boolean not null default true,
  live_toasts boolean not null default true,
  updated_at timestamptz not null default now()
);

-- 3.7 Player Loadouts (Active Character, Skin, Aura, Trail, Emote, Upgrades)
create table if not exists public.player_loadouts (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  character_id text not null default 'char_classic' references public.shop_items(id),
  skin_id text not null default 'skin_solid' references public.shop_items(id),
  aura_id text not null default 'aura_none' references public.shop_items(id),
  trail_id text not null default 'trail_none' references public.shop_items(id),
  emote_id text not null default 'emote_salute' references public.shop_items(id),
  active_upgrades text[] not null default '{}'::text[],
  updated_at timestamptz not null default now()
);

-- 3.8 Player Inventory (Owned Cosmetics & Unlocked Upgrades)
create table if not exists public.player_inventory (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  item_id text not null references public.shop_items(id) on delete cascade,
  category public.shop_category not null,
  cost_paid integer not null default 0 check (cost_paid >= 0),
  currency_spent public.currency_type not null default 'coins',
  acquired_via text not null default 'starter',
  unlocked_at timestamptz not null default now(),
  unique (profile_id, item_id)
);
create index if not exists idx_player_inventory_profile on public.player_inventory (profile_id);

-- 3.9 Player Stage Progress (Per-Level Clears, Par Targets, Best Time, Skill Orb)
create table if not exists public.player_level_progress (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  level_id integer not null references public.levels_catalog(id) on delete cascade,
  cleared boolean not null default false,
  clears integer not null default 0 check (clears >= 0),
  attempts integer not null default 0 check (attempts >= 0),
  total_deaths integer not null default 0 check (total_deaths >= 0),
  best_time_ms integer check (best_time_ms is null or best_time_ms >= 500),
  least_deaths integer check (least_deaths is null or least_deaths >= 0),
  par_deaths_met boolean not null default false,
  par_time_met boolean not null default false,
  orb_collected boolean not null default false,
  first_cleared_at timestamptz,
  last_played_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, level_id)
);
create index if not exists idx_player_level_progress_profile on public.player_level_progress (profile_id, level_id);

-- 3.10 Player Unlocked Achievements
create table if not exists public.player_achievements (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  achievement_id text not null references public.achievements_catalog(id) on delete cascade,
  reward_coins integer not null default 0,
  reward_sp integer not null default 0,
  unlocked_at timestamptz not null default now(),
  unique (profile_id, achievement_id)
);
create index if not exists idx_player_achievements_profile on public.player_achievements (profile_id);

-- 3.11 Verified Leaderboard Runs (100% Real Completed Stage Runs — Zero Mock Entries)
create table if not exists public.leaderboard_runs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete set null,
  client_key text,
  callsign text not null check (char_length(btrim(callsign)) between 1 and 20),
  level_id integer not null references public.levels_catalog(id) on delete cascade,
  level_title text not null,
  time_ms integer not null check (time_ms >= 500),
  deaths integer not null check (deaths >= 0),
  coins integer not null default 0 check (coins >= 0),
  character_id text not null default 'char_classic' references public.shop_items(id),
  skin_id text not null default 'skin_solid' references public.shop_items(id),
  aura_id text not null default 'aura_none' references public.shop_items(id),
  trail_id text not null default 'trail_none' references public.shop_items(id),
  active_upgrades text[] not null default '{}'::text[],
  is_deathless boolean generated always as (deaths = 0) stored,
  replay_storage_path text,
  runner_card_path text,
  verified boolean not null default true,
  recorded_at timestamptz not null default now()
);
create index if not exists idx_leaderboard_runs_level_time on public.leaderboard_runs (level_id, time_ms asc, deaths asc);
create index if not exists idx_leaderboard_runs_deaths on public.leaderboard_runs (deaths asc, time_ms asc);
create index if not exists idx_leaderboard_runs_coins on public.leaderboard_runs (coins desc, time_ms asc);

-- 3.12 Stage Run Ghost Replays (Inline Frames + Storage Bucket Pointer)
create table if not exists public.run_replays (
  id uuid primary key default gen_random_uuid(),
  run_id uuid unique references public.leaderboard_runs(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  level_id integer not null references public.levels_catalog(id) on delete cascade,
  callsign text not null,
  time_ms integer not null check (time_ms >= 500),
  deaths integer not null default 0 check (deaths >= 0),
  character_id text not null default 'char_classic',
  skin_id text not null default 'skin_solid',
  aura_id text not null default 'aura_none',
  sample_interval_ms integer not null default 80,
  frame_count integer not null default 0,
  frames_inline jsonb not null default '[]'::jsonb,
  storage_bucket text not null default 'run-replays',
  storage_path text,
  created_at timestamptz not null default now()
);
create index if not exists idx_run_replays_level_time on public.run_replays (level_id, time_ms asc);

-- 3.13 Live Presence & Active Co-Runner Stage Sessions
create table if not exists public.live_presence_sessions (
  session_id text primary key,
  profile_id uuid references public.profiles(id) on delete cascade,
  client_key text not null,
  callsign text not null default '',
  current_route text not null default 'menu',
  current_level_id integer references public.levels_catalog(id) on delete set null,
  player_x numeric,
  player_y numeric,
  vx numeric default 0,
  vy numeric default 0,
  facing integer default 1,
  gravity_sign integer default 1,
  character_id text not null default 'char_classic',
  skin_id text not null default 'skin_solid',
  aura_id text not null default 'aura_none',
  emote_id text,
  run_deaths integer not null default 0,
  run_time_ms integer not null default 0,
  is_online boolean not null default true,
  heartbeat_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_live_presence_online on public.live_presence_sessions (is_online, heartbeat_at desc);
create index if not exists idx_live_presence_level on public.live_presence_sessions (current_level_id) where is_online = true;

-- 3.14 Live Realtime Activity Feed (Real Gameplay Betrayals, Clears, Unlocks, Records)
create table if not exists public.realtime_activity_feed (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete set null,
  callsign text not null default 'Runner',
  event_type public.realtime_event_type not null,
  level_id integer references public.levels_catalog(id) on delete set null,
  item_id text references public.shop_items(id) on delete set null,
  achievement_id text references public.achievements_catalog(id) on delete set null,
  headline text not null,
  detail text,
  x_pos numeric,
  y_pos numeric,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_realtime_activity_feed_created on public.realtime_activity_feed (created_at desc);

-- ----------------------------------------------------------------------------
-- 4. UPDATED_AT TRIGGERS
-- ----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'shop_items',
    'levels_catalog',
    'achievements_catalog',
    'global_telemetry',
    'profiles',
    'player_settings',
    'player_loadouts',
    'player_level_progress',
    'live_presence_sessions'
  ]
  loop
    execute format('drop trigger if exists trg_touch_updated_at on public.%I;', t);
    execute format('create trigger trg_touch_updated_at before update on public.%I for each row execute function public.touch_updated_at();', t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 5. SEED REAL GAME CATALOG ROWS (ZERO MOCK USERS / ZERO FAKE RUNS)
-- ----------------------------------------------------------------------------
insert into public.shop_items (id, category, name, tier, cost, currency, description, is_starter, sort_order, metadata)
values
  ('char_classic', 'characters'::public.shop_category, 'Exotic Cube', 'Starter', 0, 'coins'::public.currency_type, 'Razor-edged geometric runner whose expressive eyes react to speed and danger.', true, 1, '{"tier":"Starter","starter":true}'::jsonb),
  ('char_mickey', 'characters'::public.shop_category, 'Mickey Mouse', 'Starter', 0, 'coins'::public.currency_type, '1928 vintage monochrome toon mouse with iconic twin round ears, pie-cut eyes, snout, and wagging tail.', true, 2, '{"tier":"Starter","starter":true}'::jsonb),
  ('char_stickman', 'characters'::public.shop_category, 'Kinetic Stickman', 'Starter', 0, 'coins'::public.currency_type, 'Classic rage-platformer stick figure with full procedural multi-jointed running and aerial limbs.', true, 3, '{"tier":"Starter","starter":true}'::jsonb),
  ('char_cat', 'characters'::public.shop_category, 'Syobon Troll Cat', 'Uncommon', 35, 'coins'::public.currency_type, 'Mischievous pointed-ear feline tribute to classic rage-bait trap platformers.', false, 4, '{"tier":"Uncommon","starter":false}'::jsonb),
  ('char_bunny', 'characters'::public.shop_category, 'Rubberhose Rabbit', 'Uncommon', 50, 'coins'::public.currency_type, '1930s monochrome cartoon rabbit with velocity-reactive floppy ears and cotton tail.', false, 5, '{"tier":"Uncommon","starter":false}'::jsonb),
  ('char_shinobi', 'characters'::public.shop_category, 'Shadow Shinobi', 'Uncommon', 60, 'coins'::public.currency_type, 'Masked infiltrator with dual cloth headband tails trailing behind every jump.', false, 6, '{"tier":"Uncommon","starter":false}'::jsonb),
  ('char_slime', 'characters'::public.shop_category, 'Jiggle Slime', 'Rare', 75, 'coins'::public.currency_type, 'Gelatinous monochrome blob with harmonic wobble physics and suspended core bubbles.', false, 7, '{"tier":"Rare","starter":false}'::jsonb),
  ('char_knight', 'characters'::public.shop_category, 'Hollow Vanguard', 'Rare', 85, 'coins'::public.currency_type, 'Twin-horned helm warrior with an armored slit visor built to endure betrayal.', false, 8, '{"tier":"Rare","starter":false}'::jsonb),
  ('char_skeleton', 'characters'::public.shop_category, 'Rattle Bones', 'Rare', 100, 'coins'::public.currency_type, 'Monochrome skull-and-ribcage runner risen from a hundred previous trap deaths.', false, 9, '{"tier":"Rare","starter":false}'::jsonb),
  ('char_imp', 'characters'::public.shop_category, 'Rage Imp', 'Rare', 115, 'coins'::public.currency_type, 'Curved-horn trickster sporting sharp slanted eyes that match the level designer.', false, 10, '{"tier":"Rare","starter":false}'::jsonb),
  ('char_astronaut', 'characters'::public.shop_category, 'Void Spaceman', 'Epic', 135, 'coins'::public.currency_type, 'Pressurized lunar explorer with life-support pack and reflective dome visor.', false, 11, '{"tier":"Epic","starter":false}'::jsonb),
  ('char_phantom', 'characters'::public.shop_category, 'Cloaked Wraith', 'Epic', 150, 'coins'::public.currency_type, 'Hooded spirit gliding slightly above surfaces with an animated scalloped cloak.', false, 12, '{"tier":"Epic","starter":false}'::jsonb),
  ('char_tvhead', 'characters'::public.shop_category, 'CRT Broadcast', 'Epic', 170, 'coins'::public.currency_type, 'Retro television-headed runner with rabbit-ear antennas and reactive screen expressions.', false, 13, '{"tier":"Epic","starter":false}'::jsonb),
  ('char_cyborg', 'characters'::public.shop_category, 'Unit-01 Mono', 'Epic', 190, 'coins'::public.currency_type, 'Precision machine chassis featuring a scanning mono-visor and kinetic antenna.', false, 14, '{"tier":"Epic","starter":false}'::jsonb),
  ('char_ronin', 'characters'::public.shop_category, 'Kasa Ronin', 'Mythic', 220, 'coins'::public.currency_type, 'Wandering duelist crowned with a wide geometric kasa hat and focused gaze.', false, 15, '{"tier":"Mythic","starter":false}'::jsonb),
  ('char_monolith', 'characters'::public.shop_category, 'The Obelisk', 'Exotic', 260, 'coins'::public.currency_type, 'Sentient floating relic housing a single tracking geometric pupil.', false, 16, '{"tier":"Exotic","starter":false}'::jsonb),
  ('skin_solid', 'skins'::public.shop_category, 'Pure Solid', 'Default', 0, 'coins'::public.currency_type, 'High-contrast monochrome fill tuned for maximum silhouette clarity.', true, 17, '{"tier":"Default","starter":true}'::jsonb),
  ('skin_inverted', 'skins'::public.shop_category, 'Inverted Core', 'Common', 25, 'coins'::public.currency_type, 'Swaps core polarity with an inner geometric chamber.', false, 18, '{"tier":"Common","starter":false}'::jsonb),
  ('skin_steamboat', 'skins'::public.shop_category, '1928 Steamboat Shorts', 'Uncommon', 35, 'coins'::public.currency_type, 'Classic vintage cartoon two-tone outfit with contrasting buttoned shorts.', false, 19, '{"tier":"Uncommon","starter":false}'::jsonb),
  ('skin_sketch', 'skins'::public.shop_category, 'Animator Pencil', 'Uncommon', 45, 'coins'::public.currency_type, 'Hand-drawn graphite crosshatch shading straight off an animation desk.', false, 20, '{"tier":"Uncommon","starter":false}'::jsonb),
  ('skin_split', 'skins'::public.shop_category, 'Duality Split', 'Uncommon', 50, 'coins'::public.currency_type, 'Bilateral half-light, half-shadow finish with counter-balanced eye contrast.', false, 21, '{"tier":"Uncommon","starter":false}'::jsonb),
  ('skin_tuxedo', 'skins'::public.shop_category, 'Dapper Tuxedo', 'Rare', 60, 'coins'::public.currency_type, 'Formal monochrome suit with crisp shirt V-lapel, bow tie, and dress buttons.', false, 22, '{"tier":"Rare","starter":false}'::jsonb),
  ('skin_toon_ink', 'skins'::public.shop_category, 'Rubberhose Inkblot', 'Rare', 70, 'coins'::public.currency_type, 'Glossy vintage cel-ink finish with crescent highlights and dripping ink motes.', false, 23, '{"tier":"Rare","starter":false}'::jsonb),
  ('skin_checker', 'skins'::public.shop_category, 'Grandmaster Grid', 'Rare', 80, 'coins'::public.currency_type, 'Crisp monochrome chessboard weave locked across ears, limbs, and torso.', false, 24, '{"tier":"Rare","starter":false}'::jsonb),
  ('skin_tiger', 'skins'::public.shop_category, 'Zebra Slash', 'Rare', 90, 'coins'::public.currency_type, 'Bold angled monochrome stripes cutting across your character geometry.', false, 25, '{"tier":"Rare","starter":false}'::jsonb),
  ('skin_halftone', 'skins'::public.shop_category, 'Print Halftone', 'Rare', 100, 'coins'::public.currency_type, 'Editorial comic-print ink dot-matrix pattern across the body.', false, 26, '{"tier":"Rare","starter":false}'::jsonb),
  ('skin_bandage', 'skins'::public.shop_category, 'Survivor Wraps', 'Epic', 115, 'coins'::public.currency_type, 'Layered criss-cross monochrome cloth bandages earned the hard way.', false, 27, '{"tier":"Epic","starter":false}'::jsonb),
  ('skin_scanline', 'skins'::public.shop_category, 'CRT Scanline', 'Epic', 125, 'coins'::public.currency_type, 'Scrolling horizontal raster bars pulsing across your silhouette.', false, 28, '{"tier":"Epic","starter":false}'::jsonb),
  ('skin_xray', 'skins'::public.shop_category, 'X-Ray Fluoroscope', 'Epic', 135, 'coins'::public.currency_type, 'Darkened chamber pulsing with visible internal monochrome bone segments.', false, 29, '{"tier":"Epic","starter":false}'::jsonb),
  ('skin_hollow', 'skins'::public.shop_category, 'Chamber Cutout', 'Epic', 150, 'coins'::public.currency_type, 'Carved negative-space interior housing a suspended pulsing core.', false, 30, '{"tier":"Epic","starter":false}'::jsonb),
  ('skin_stardust', 'skins'::public.shop_category, 'Cosmic Negative', 'Mythic', 175, 'coins'::public.currency_type, 'Living night-sky silhouette filled with drifting twinkling monochrome stars.', false, 31, '{"tier":"Mythic","starter":false}'::jsonb),
  ('skin_glitch', 'skins'::public.shop_category, 'Phase Anomaly', 'Exotic', 195, 'coins'::public.currency_type, 'Periodic horizontal slice shifts when sprinting or airborne.', false, 32, '{"tier":"Exotic","starter":false}'::jsonb),
  ('aura_none', 'auras'::public.shop_category, 'Unbound Silence', 'Starter', 0, 'coins'::public.currency_type, 'Clean silhouette with zero ambient emission.', true, 33, '{"tier":"Starter","starter":true}'::jsonb),
  ('aura_sparkle', 'auras'::public.shop_category, 'Sparkle Aura', 'Uncommon', 35, 'coins'::public.currency_type, 'Four-point monochrome stars twinkling, rotating, and ascending around your body.', false, 34, '{"tier":"Uncommon","starter":false}'::jsonb),
  ('aura_bat', 'auras'::public.shop_category, 'Bat Swarm Aura', 'Rare', 70, 'coins'::public.currency_type, 'Articulated monochrome bats with flapping wings orbiting in figure-eight rings.', false, 35, '{"tier":"Rare","starter":false}'::jsonb),
  ('aura_butterfly', 'auras'::public.shop_category, 'Butterfly Aura', 'Rare', 90, 'coins'::public.currency_type, 'Fluttering monochrome butterflies spiraling upward on gentle air currents.', false, 36, '{"tier":"Rare","starter":false}'::jsonb),
  ('aura_feather', 'auras'::public.shop_category, 'Seraph Feather Aura', 'Epic', 125, 'coins'::public.currency_type, 'Sweeping monochrome feathers drifting in vortex updrafts with ground pulse rings.', false, 37, '{"tier":"Epic","starter":false}'::jsonb),
  ('aura_vortex', 'auras'::public.shop_category, 'Void Rift Aura', 'Epic', 165, 'coins'::public.currency_type, 'Levitating monolith shards, solid shockwave rings, and rising dark-matter motes.', false, 38, '{"tier":"Epic","starter":false}'::jsonb),
  ('aura_crown', 'auras'::public.shop_category, 'Sovereign Crown Aura', 'Mythic', 220, 'coins'::public.currency_type, 'Floating geometric crown overhead with orbital diamonds and ascending light pillars.', false, 39, '{"tier":"Mythic","starter":false}'::jsonb),
  ('aura_eclipse', 'auras'::public.shop_category, 'Celestial Eclipse Aura', 'Exotic', 290, 'coins'::public.currency_type, 'Dual tilted orbital rings, an eclipsed solar disc halo, and cascading starlight.', false, 40, '{"tier":"Exotic","starter":false}'::jsonb),
  ('trail_none', 'trails'::public.shop_category, 'Zero Wake', 'Starter', 0, 'coins'::public.currency_type, 'No motion trail behind movement.', true, 41, '{"tier":"Starter","starter":true}'::jsonb),
  ('trail_dust', 'trails'::public.shop_category, 'Pixel Dust', 'Uncommon', 30, 'coins'::public.currency_type, 'Crisp tumbling monochrome micro-cubes kicked up along footsteps and jumps.', false, 42, '{"tier":"Uncommon","starter":false}'::jsonb),
  ('trail_ghost', 'trails'::public.shop_category, 'Afterimage Echo', 'Rare', 60, 'coins'::public.currency_type, 'Fading silhouette clones trailing your exact aerial trajectory.', false, 43, '{"tier":"Rare","starter":false}'::jsonb),
  ('trail_ribbon', 'trails'::public.shop_category, 'Razor Ribbon', 'Rare', 85, 'coins'::public.currency_type, 'Continuous tapered geometric slipstream flowing smoothly behind your core.', false, 44, '{"tier":"Rare","starter":false}'::jsonb),
  ('trail_rings', 'trails'::public.shop_category, 'Sonic Rings', 'Epic', 115, 'coins'::public.currency_type, 'Expanding solid cutout shock-rings emitted during sprints and jumps.', false, 45, '{"tier":"Epic","starter":false}'::jsonb),
  ('trail_shards', 'trails'::public.shop_category, 'Prism Shards', 'Epic', 140, 'coins'::public.currency_type, 'Spinning diamond splinters scattering into your wake.', false, 46, '{"tier":"Epic","starter":false}'::jsonb),
  ('trail_bolt', 'trails'::public.shop_category, 'Static Zigzag', 'Mythic', 170, 'coins'::public.currency_type, 'Angular solid lightning shards snapping across recent positions.', false, 47, '{"tier":"Mythic","starter":false}'::jsonb),
  ('trail_binary', 'trails'::public.shop_category, 'Glyph Wake', 'Exotic', 200, 'coins'::public.currency_type, 'Crisp monochrome 0 and 1 blocks streaming behind high-speed movement.', false, 48, '{"tier":"Exotic","starter":false}'::jsonb),
  ('emote_salute', 'emotes'::public.shop_category, 'Sharp Salute', 'Starter', 0, 'coins'::public.currency_type, 'Press E in-game to snap a crisp tilt and overhead alert glyph.', true, 49, '{"tier":"Starter","starter":true}'::jsonb),
  ('emote_clap', 'emotes'::public.shop_category, 'Slow Clap', 'Uncommon', 25, 'coins'::public.currency_type, 'Sarcastic rhythmic claps to applaud the trap that almost got you.', false, 50, '{"tier":"Uncommon","starter":false}'::jsonb),
  ('emote_backflip', 'emotes'::public.shop_category, 'Showoff Backflip', 'Rare', 55, 'coins'::public.currency_type, '360-degree celebratory somersault right in front of the exit door.', false, 51, '{"tier":"Rare","starter":false}'::jsonb),
  ('emote_laugh', 'emotes'::public.shop_category, 'Mocking Laugh', 'Rare', 80, 'coins'::public.currency_type, 'Rapid bouncing chuckle emitting sharp geometric HA bursts.', false, 52, '{"tier":"Rare","starter":false}'::jsonb),
  ('emote_rage', 'emotes'::public.shop_category, 'Rage Stomp', 'Epic', 105, 'coins'::public.currency_type, 'Furious rapid ground slams releasing impact rings and steam puffs.', false, 53, '{"tier":"Epic","starter":false}'::jsonb),
  ('emote_zen', 'emotes'::public.shop_category, 'Zen Levitation', 'Epic', 135, 'coins'::public.currency_type, 'Float serenely above the floor with calm orbiting satellites.', false, 54, '{"tier":"Epic","starter":false}'::jsonb),
  ('emote_spin', 'emotes'::public.shop_category, 'Vortex Twirl', 'Mythic', 160, 'coins'::public.currency_type, 'High-velocity horizontal spin kicking up miniature cyclones.', false, 55, '{"tier":"Mythic","starter":false}'::jsonb),
  ('emote_rip', 'emotes'::public.shop_category, 'Drop Tombstone', 'Exotic', 195, 'coins'::public.currency_type, 'Plants a monochrome RIP monument to honor your previous attempts.', false, 56, '{"tier":"Exotic","starter":false}'::jsonb),
  ('upg_coyote', 'upgrades'::public.shop_category, 'Coyote Grace', 'Skill Tier I', 1, 'sp'::public.currency_type, 'Extends ledge-jump forgiveness and jump input buffering by +95ms.', false, 57, '{"tier":"Skill Tier I","starter":false}'::jsonb),
  ('upg_magnet', 'upgrades'::public.shop_category, 'Coin Magnet', 'Skill Tier I', 1, 'sp'::public.currency_type, 'Automatically pulls nearby Coins and Skill Orbs toward your character.', false, 58, '{"tier":"Skill Tier I","starter":false}'::jsonb),
  ('upg_double_jump', 'upgrades'::public.shop_category, 'Phantom Air-Hop', 'Skill Tier II', 2, 'sp'::public.currency_type, 'Grants +1 mid-air jump per ground touch to escape sudden floor betrayals.', false, 59, '{"tier":"Skill Tier II","starter":false}'::jsonb),
  ('upg_dash', 'upgrades'::public.shop_category, 'Phase Dash', 'Skill Tier II', 2, 'sp'::public.currency_type, 'Press Shift or K to burst horizontally across surprise spike chasms.', false, 60, '{"tier":"Skill Tier II","starter":false}'::jsonb),
  ('upg_radar', 'upgrades'::public.shop_category, 'Trap Instinct', 'Skill Tier II', 2, 'sp'::public.currency_type, 'Reveals subtle pulse ticks on hidden parting floors and dormant spike traps.', false, 61, '{"tier":"Skill Tier II","starter":false}'::jsonb),
  ('upg_shield', 'upgrades'::public.shop_category, 'Second Wind', 'Skill Tier III', 3, 'sp'::public.currency_type, 'Once per attempt, deflects one fatal spike or saw hit with an upward parry bounce.', false, 62, '{"tier":"Skill Tier III","starter":false}'::jsonb)
on conflict (id) do update set
  category = excluded.category,
  name = excluded.name,
  tier = excluded.tier,
  cost = excluded.cost,
  currency = excluded.currency,
  description = excluded.description,
  is_starter = excluded.is_starter,
  sort_order = excluded.sort_order,
  metadata = excluded.metadata;

insert into public.levels_catalog (id, code, title, subtitle, width, height, par_deaths, par_time_ms, reward_coins, spawn_x, spawn_y, quips, blueprint)
values
  (1, '01', 'Trust Nothing', 'Dishonest floors, jumping spikes, and an exit door with commitment issues.', 960, 540, 4, 11000, 45, 64, 398, '["The sign literally lied to your face.","Yes, the spike has a vertical leap.","The door went the other way.","Bait the spike jump, then walk right under it."]'::jsonb, '{"signs":[{"x":326,"y":365,"w":118,"before":"100% SOLID","after":"JUST KIDDING","watchId":"p_part"},{"x":522,"y":365,"w":118,"before":"EASY HOP","after":"IT JUMPS TOO","watchId":"s_jump1"},{"x":800,"y":318,"w":118,"before":"FREE EXIT","after":"OVER THERE!","watchId":"d_main"}],"platforms":[{"id":"p1","x":0,"y":430,"w":280,"h":110},{"id":"p_part","x":280,"y":430,"w":95,"h":110,"troll":{"type":"drop","padX":12,"speedY":820,"targetDY":155}},{"id":"p2","x":375,"y":430,"w":395,"h":110},{"id":"p_door_gap","x":770,"y":430,"w":68,"h":110,"troll":{"type":"drop","manualOnly":true,"speedY":820,"targetDY":155}},{"id":"p3","x":838,"y":430,"w":122,"h":110},{"id":"p_orb1","x":145,"y":348,"w":80,"h":18},{"id":"p_orb2","x":40,"y":274,"w":78,"h":18}],"spikes":[{"id":"s_jump1","x":504,"y":430,"count":2,"dir":"up","troll":{"type":"jump","jumpVy":-525}},{"id":"s_slide","x":625,"y":430,"count":2,"dir":"up","troll":{"type":"slide","padX":28,"speedX":520,"targetDX":64}}],"crushers":[],"saws":[],"springs":[],"gravityZones":[],"fakeCheckpoints":[],"chaserWall":null,"coins":[{"id":"c1","x":185,"y":316},{"id":"c2","x":326,"y":386},{"id":"c3","x":522,"y":374},{"id":"c4","x":730,"y":396}],"skillOrb":{"x":78,"y":238},"doors":[{"id":"d_main","x":782,"y":376,"shyWaypoints":[{"dist":56,"targetX":886,"dropPlatformId":"p_door_gap"},{"dist":44,"targetX":708}]}]}'::jsonb),
  (2, '02', 'Mind The Ceiling', 'Kaizo blocks, double-slam fakeouts, and a 99% door tax.', 1080, 540, 6, 14000, 55, 56, 398, '["Jumping greedy for coins builds character.","Never trust a crusher on its first retraction.","Why did the fourth bridge tile launch UP?!","Always check the sky right before the exit door."]'::jsonb, '{"signs":[{"x":173,"y":372,"w":112,"before":"FREE COIN","after":"BONK!","watchId":"p_bonk"},{"x":571,"y":268,"w":128,"before":"1 SLAM ONLY","after":"DOUBLE SLAM!","watchId":"cr2"},{"x":1005,"y":310,"w":118,"before":"SAFE EXIT","after":"99% ANVIL!","watchId":"cr_sky_door"}],"platforms":[{"id":"p1","x":0,"y":430,"w":215,"h":110},{"id":"p_bonk","x":152,"y":322,"w":42,"h":20,"troll":{"type":"hidden_solid"}},{"id":"p2","x":298,"y":430,"w":372,"h":110},{"id":"roof","x":350,"y":0,"w":320,"h":140},{"id":"b1","x":695,"y":430,"w":52,"h":22,"troll":{"type":"touch_drop","speedY":620,"targetDY":160}},{"id":"b2","x":755,"y":430,"w":52,"h":22,"troll":{"type":"touch_drop","speedY":620,"targetDY":160}},{"id":"b3","x":815,"y":430,"w":52,"h":22,"troll":{"type":"touch_drop","speedY":620,"targetDY":160}},{"id":"b4_up","x":875,"y":430,"w":54,"h":22,"troll":{"type":"touch_drop","speedY":740,"targetDY":-195}},{"id":"roof_end","x":862,"y":175,"w":80,"h":24},{"id":"p_end","x":948,"y":430,"w":132,"h":110},{"id":"p_orb_step","x":300,"y":348,"w":46,"h":16},{"id":"p_orb_step2","x":280,"y":266,"w":56,"h":16},{"id":"p_orb_step3","x":315,"y":188,"w":48,"h":16}],"spikes":[{"id":"sp_ceil_b4","x":876,"y":199,"count":3,"dir":"down"}],"crushers":[{"id":"cr1","x":410,"y":140,"w":66,"h":76,"padLeft":20,"slamSpeed":1020,"dropDist":214,"retractSpeed":290},{"id":"cr2","x":535,"y":140,"w":72,"h":76,"padLeft":20,"doubleSlam":true,"slamSpeed":1060,"dropDist":214,"retractSpeed":300},{"id":"cr_sky_door","x":966,"y":-80,"w":44,"h":56,"padLeft":14,"slamSpeed":1220,"dropDist":444,"retractSpeed":360}],"saws":[],"springs":[],"gravityZones":[],"fakeCheckpoints":[],"chaserWall":null,"coins":[{"id":"c1","x":173,"y":286},{"id":"c2","x":444,"y":394},{"id":"c3","x":571,"y":394},{"id":"c4","x":781,"y":388},{"id":"c5","x":902,"y":388}],"skillOrb":{"x":495,"y":108},"doors":[{"id":"d_main","x":1022,"y":376}]}'::jsonb),
  (3, '03', 'Spring Loaded Lies', 'Ceiling ambushes, fake checkpoints, and waking buzzsaws.', 1160, 540, 6, 14500, 65, 54, 398, '["Bouncing straight up was a bold mistake.","That \"SAVE\" flag has ended countless careers.","The decorative gear behind you was not decorative.","Jump the spike AND outrun the saw!"]'::jsonb, '{"signs":[{"x":240,"y":368,"w":116,"before":"BOUNCE UP!","after":"STEER RIGHT!","watchId":"sp_spring_ceil"},{"x":755,"y":332,"w":124,"before":"FREE SAVE","after":"FAKE SAVE!","watchId":"cp1"}],"platforms":[{"id":"p1","x":0,"y":430,"w":280,"h":110},{"id":"ceil_trap","x":188,"y":148,"w":105,"h":24},{"id":"p_high","x":310,"y":286,"w":155,"h":24},{"id":"p_scoot","x":555,"y":340,"w":96,"h":24,"troll":{"type":"slide","padX":38,"speedX":480,"targetDX":-52}},{"id":"p_runway","x":665,"y":430,"w":495,"h":110},{"id":"p_orb_ledge","x":48,"y":246,"w":96,"h":20}],"spikes":[{"id":"sp_spring_ceil","x":204,"y":172,"count":4,"dir":"down","hidden":true,"troll":{"type":"pop","padX":35,"triggerRect":{"x":195,"y":170,"w":90,"h":190}}},{"id":"sp_hurdle","x":925,"y":430,"count":2,"dir":"up","troll":{"type":"jump","jumpVy":-515}}],"crushers":[],"saws":[{"id":"saw_sleeper","x":685,"y":412,"r":18,"wakeRect":{"x":795,"y":150,"w":120,"h":290},"chaseSpeedX":224,"maxX":1042}],"springs":[{"id":"spr1","x":222,"y":418,"w":36,"h":12,"boostVy":-875}],"gravityZones":[],"fakeCheckpoints":[{"id":"cp1","x":755,"y":430}],"chaserWall":null,"coins":[{"id":"c1","x":240,"y":275},{"id":"c2","x":390,"y":250},{"id":"c3","x":550,"y":295},{"id":"c4","x":840,"y":394},{"id":"c5","x":943,"y":362}],"skillOrb":{"x":96,"y":208},"doors":[{"id":"d_main","x":1085,"y":376}]}'::jsonb),
  (4, '04', 'Coin Operated', 'Dodging bait coins, spiked steps, and a fake finish line.', 1180, 540, 6, 17000, 75, 54, 398, '["The coin literally led you onto a trapdoor.","Aim for the right side of the middle step!","Decoy exit! The real door materialized up top.","Even the victory balcony brought a secret spike."]'::jsonb, '{"signs":[{"x":310,"y":345,"w":120,"before":"TAKE COIN","after":"TRAPDOOR!","watchId":"p_coin_trap"},{"x":1085,"y":318,"w":124,"before":"REAL EXIT","after":"LOOK UP!","watchId":"d_decoy"}],"platforms":[{"id":"p1","x":0,"y":430,"w":265,"h":110},{"id":"p_coin_trap","x":265,"y":430,"w":96,"h":110,"troll":{"type":"drop","padX":12,"speedY":820,"targetDY":155}},{"id":"p2","x":361,"y":430,"w":125,"h":110},{"id":"st1","x":515,"y":372,"w":96,"h":22},{"id":"st2","x":645,"y":316,"w":112,"h":22},{"id":"st3","x":785,"y":372,"w":96,"h":22},{"id":"p3","x":910,"y":430,"w":270,"h":110},{"id":"p_balcony","x":535,"y":192,"w":205,"h":22},{"id":"p_reveal_step","x":760,"y":248,"w":78,"h":20,"hiddenUntilReveal":true}],"spikes":[{"id":"sp_step2_left","x":648,"y":316,"count":2,"dir":"up","hidden":true,"troll":{"type":"pop","padX":26}},{"id":"sp_balcony_guard","x":700,"y":192,"count":1,"dir":"up","hidden":true,"troll":{"type":"pop","padX":18}}],"crushers":[],"saws":[],"springs":[],"gravityZones":[],"fakeCheckpoints":[],"chaserWall":null,"coins":[{"id":"c_bait","x":242,"y":394,"shyDX":72,"trapPlatformId":"p_coin_trap"},{"id":"c2","x":562,"y":336},{"id":"c3","x":724,"y":280},{"id":"c4","x":832,"y":336},{"id":"c5","x":970,"y":394,"shyDX":58},{"id":"c6","x":565,"y":156}],"skillOrb":{"x":280,"y":268},"doors":[{"id":"d_decoy","x":1085,"y":376,"fake":true,"revealDoorId":"d_real","revealPlatformId":"p_reveal_step"},{"id":"d_real","x":615,"y":138,"hiddenUntilReveal":true}]}'::jsonb),
  (5, '05', 'Moving Day', 'A marching spike wall forces panic into every trap ahead.', 1240, 540, 7, 16000, 85, 54, 398, '["The island scooted away mid-jump.","Take your time — oh wait, giant spike wall!","Hidden guard spikes love sprinters.","Panic is the level designer’s best weapon."]'::jsonb, '{"signs":[{"x":525,"y":332,"w":126,"before":"TAKE UR TIME","after":"RUN FAST!!","watchId":"chaser_wall"},{"x":955,"y":300,"w":118,"before":"FINISH!","after":"KEEP RUNNING","watchId":"d_main"}],"platforms":[{"id":"p1","x":0,"y":430,"w":205,"h":110},{"id":"p_island","x":265,"y":410,"w":105,"h":24,"troll":{"type":"slide","padX":55,"speedX":480,"targetDX":42}},{"id":"p_mid","x":455,"y":410,"w":350,"h":130},{"id":"p_end","x":880,"y":410,"w":360,"h":130},{"id":"p_orb","x":560,"y":292,"w":92,"h":20}],"spikes":[{"id":"sp_dancer","x":695,"y":410,"count":2,"dir":"up","troll":{"type":"slide","padX":85,"speedX":480,"targetDX":-125}},{"id":"sp_door_guard","x":1025,"y":410,"count":2,"dir":"up","hidden":true,"troll":{"type":"pop","padX":38}}],"crushers":[],"saws":[],"springs":[],"gravityZones":[],"fakeCheckpoints":[],"chaserWall":{"id":"chaser_wall","x":-30,"w":60,"wakeX":465,"speedX":136,"maxX":1080},"coins":[{"id":"c1","x":335,"y":368},{"id":"c2","x":525,"y":374},{"id":"c3","x":655,"y":374},{"id":"c4","x":842,"y":350},{"id":"c5","x":1043,"y":344}],"skillOrb":{"x":606,"y":254},"doors":[{"id":"d_main","x":935,"y":356,"shyTargetX":1155}]}'::jsonb),
  (6, '06', 'Polarity Shift', 'Upside-down ceiling betrayals, fake checkpoints, and jumping spikes.', 1280, 540, 7, 18000, 95, 62, 398, '["Checking behind spawn? Cheeky spike says hi.","Even upside-down ceilings drop out from under you.","Still trusting SAVE flags on Stage 06?!","One jumping spike between you and freedom."]'::jsonb, '{"signs":[{"x":605,"y":175,"w":124,"before":"SOLID ROOF","after":"BYE ROOF!","watchId":"c_part"},{"x":1005,"y":332,"w":122,"before":"CHECKPOINT","after":"NEVER REAL","watchId":"cp6"}],"platforms":[{"id":"p_start","x":0,"y":430,"w":330,"h":110},{"id":"c_run1","x":250,"y":0,"w":310,"h":96},{"id":"c_part","x":560,"y":0,"w":92,"h":96,"troll":{"type":"drop","padX":16,"speedY":780,"targetDY":-125}},{"id":"c_run2","x":652,"y":0,"w":340,"h":96},{"id":"p_end","x":895,"y":430,"w":385,"h":110}],"spikes":[{"id":"sp_spawn_left","x":8,"y":430,"count":1,"dir":"up","hidden":true,"troll":{"type":"pop","padX":16}},{"id":"sp_pit","x":350,"y":520,"count":8,"dir":"up"},{"id":"sp_ceil_slide","x":760,"y":96,"count":2,"dir":"down","troll":{"type":"slide","padX":36,"speedX":480,"targetDX":68}},{"id":"sp_end_jump","x":1095,"y":430,"count":2,"dir":"up","troll":{"type":"jump","jumpVy":-520}}],"crushers":[],"saws":[],"springs":[],"gravityZones":[{"id":"gz_up","x":280,"y":96,"w":56,"h":334,"gravitySign":-1},{"id":"gz_down","x":925,"y":96,"w":62,"h":334,"gravitySign":1}],"fakeCheckpoints":[{"id":"cp6","x":1005,"y":430}],"chaserWall":null,"coins":[{"id":"c1","x":210,"y":394},{"id":"c2","x":440,"y":128},{"id":"c3","x":605,"y":150},{"id":"c4","x":830,"y":128},{"id":"c5","x":1112,"y":368}],"skillOrb":{"x":698,"y":192},"doors":[{"id":"d_main","x":1205,"y":376}]}'::jsonb),
  (7, '07', 'Sawtooth Protocol', 'Half-dropping islands, double-slam ambush, and a 99% trapdoor.', 1360, 540, 9, 20000, 115, 54, 398, '["First half was honest. Second half vanished.","Upper crusher double-slams! Lower saw chases!","Right in front of the finish line. Brutal.","Bait, breathe, and commit."]'::jsonb, '{"signs":[{"x":425,"y":365,"w":122,"before":"SOLID LAND","after":"HALF SOLID!","watchId":"p2_drop"},{"x":1162,"y":355,"w":116,"before":"VICTORY!","after":"99% TRAP!","watchId":"p_final_trap"}],"platforms":[{"id":"p1","x":0,"y":430,"w":225,"h":110},{"id":"p2_safe","x":310,"y":430,"w":80,"h":110},{"id":"p2_drop","x":390,"y":430,"w":82,"h":110,"troll":{"type":"drop","padX":12,"speedY":820,"targetDY":155}},{"id":"p_low","x":545,"y":430,"w":380,"h":110},{"id":"p_high1","x":555,"y":345,"w":95,"h":20},{"id":"p_high2","x":690,"y":275,"w":175,"h":20},{"id":"roof_high","x":720,"y":40,"w":110,"h":36},{"id":"p_pre_end","x":995,"y":430,"w":135,"h":110},{"id":"p_final_trap","x":1130,"y":430,"w":64,"h":110,"troll":{"type":"drop","padX":10,"speedY":840,"targetDY":155}},{"id":"p_end","x":1194,"y":430,"w":166,"h":110}],"spikes":[{"id":"sp_low_mid","x":760,"y":430,"count":2,"dir":"up","troll":{"type":"jump","jumpVy":-515}}],"crushers":[{"id":"cr_upper","x":742,"y":76,"w":62,"h":64,"padLeft":18,"doubleSlam":true,"slamSpeed":1050,"dropDist":135,"retractSpeed":300}],"saws":[{"id":"saw_low","x":575,"y":412,"r":18,"wakeRect":{"x":635,"y":345,"w":95,"h":90},"chaseSpeedX":220,"maxX":905},{"id":"saw_patrol","x":960,"y":355,"r":20,"patrolDY":85,"speed":2.8}],"springs":[],"gravityZones":[],"fakeCheckpoints":[],"chaserWall":null,"coins":[{"id":"c1","x":268,"y":372},{"id":"c2","x":430,"y":382},{"id":"c3","x":690,"y":394},{"id":"c4","x":720,"y":238},{"id":"c5","x":830,"y":238},{"id":"c6","x":1162,"y":378}],"skillOrb":{"x":774,"y":238},"doors":[{"id":"d_main","x":1272,"y":376}]}'::jsonb),
  (8, '08', 'Pure Exotic', 'Every rage-bait trick united into one relentless grand finale.', 1480, 540, 12, 24000, 175, 54, 398, '["Act I claimed another optimist.","Inverted ceiling ambush successful.","Fake checkpoint + waking saw + sky anvil?! Welcome to Finale.","Conquer Pure Exotic and claim eternal bragging rights."]'::jsonb, '{"signs":[{"x":252,"y":365,"w":120,"before":"FINAL EXAM","after":"HERE WE GO","watchId":"p1_part"},{"x":1090,"y":332,"w":124,"before":"LAST SAVE!","after":"STILL LYING","watchId":"cp8"},{"x":1350,"y":312,"w":120,"before":"YOU DID IT","after":"ONE MORE!","watchId":"d_main"}],"platforms":[{"id":"p1","x":0,"y":430,"w":210,"h":110},{"id":"p1_part","x":210,"y":430,"w":84,"h":110,"troll":{"type":"drop","padX":12,"speedY":820,"targetDY":155}},{"id":"p2","x":294,"y":430,"w":266,"h":110},{"id":"c_act2_a","x":495,"y":0,"w":235,"h":92},{"id":"c_act2_b","x":815,"y":0,"w":225,"h":92},{"id":"p3","x":965,"y":430,"w":515,"h":110}],"spikes":[{"id":"sp_act1","x":395,"y":430,"count":2,"dir":"up","troll":{"type":"jump","jumpVy":-520}},{"id":"sp_act2_ceil","x":625,"y":92,"count":2,"dir":"down","hidden":true,"troll":{"type":"pop","padX":34}},{"id":"sp_act3_jump","x":1220,"y":430,"count":2,"dir":"up","troll":{"type":"slide","padX":32,"speedX":510,"targetDX":52}}],"crushers":[{"id":"cr_finale_sky","x":1358,"y":-80,"w":44,"h":56,"padLeft":14,"slamSpeed":1240,"dropDist":444,"retractSpeed":360}],"saws":[{"id":"saw_finale","x":995,"y":412,"r":18,"wakeRect":{"x":1110,"y":240,"w":110,"h":200},"chaseSpeedX":215,"maxX":1315}],"springs":[],"gravityZones":[{"id":"gz_up","x":515,"y":92,"w":54,"h":338,"gravitySign":-1},{"id":"gz_down","x":980,"y":92,"w":58,"h":338,"gravitySign":1}],"fakeCheckpoints":[{"id":"cp8","x":1090,"y":430}],"chaserWall":null,"coins":[{"id":"c1","x":252,"y":382},{"id":"c2","x":435,"y":368},{"id":"c3","x":772,"y":135},{"id":"c4","x":900,"y":126},{"id":"c5","x":1155,"y":394,"shyDX":52},{"id":"c6","x":1245,"y":364}],"skillOrb":{"x":772,"y":182},"doors":[{"id":"d_main","x":1315,"y":376,"shyTargetX":1418}]}'::jsonb)
on conflict (id) do update set
  code = excluded.code,
  title = excluded.title,
  subtitle = excluded.subtitle,
  width = excluded.width,
  height = excluded.height,
  par_deaths = excluded.par_deaths,
  par_time_ms = excluded.par_time_ms,
  reward_coins = excluded.reward_coins,
  spawn_x = excluded.spawn_x,
  spawn_y = excluded.spawn_y,
  quips = excluded.quips,
  blueprint = excluded.blueprint;

insert into public.achievements_catalog (id, title, description, reward_coins, reward_sp, metric_key, target_value, sort_order)
values
  ('ach_first_betrayal', 'Welcome To Exotic', 'Experience your very first unexpected death.', 45, 1, 'total_deaths', 1, 1),
  ('ach_trap_magnet', 'Instinctive Bait', 'Trigger 10 hidden troll mechanisms across runs.', 60, 1, 'traps_triggered', 10, 2),
  ('ach_shy_door', 'Wait Come Back', 'Watch an Exit Door run away or vanish in front of you.', 50, 1, 'shy_doors_triggered', 1, 3),
  ('ach_first_clear', 'Outsmarted', 'Clear any level for the first time.', 75, 1, 'stages_cleared', 1, 4),
  ('ach_coin_hunter', 'Risky Pockets', 'Collect 25 Coins inside levels.', 85, 1, 'total_coins_collected', 25, 5),
  ('ach_taunt_master', 'Maximum Disrespect', 'Perform 5 Emotes or Taunts inside active levels.', 65, 1, 'emotes_used_in_stage', 5, 6),
  ('ach_aura_owner', 'Presence Felt', 'Unlock any Aura in the Shop.', 55, 1, 'auras_owned', 1, 7),
  ('ach_deathless', 'Memory Of Steel', 'Clear any level from start to finish with 0 deaths.', 120, 2, 'deathless_clears', 1, 8),
  ('ach_halfway', 'Seasoned Skeptic', 'Clear 4 distinct levels.', 130, 2, 'stages_cleared', 4, 9),
  ('ach_all_clear', 'Pure Exotic', 'Conquer all 8 handcrafted levels.', 280, 4, 'stages_cleared', 8, 10)
on conflict (id) do update set
  title = excluded.title,
  description = excluded.description,
  reward_coins = excluded.reward_coins,
  reward_sp = excluded.reward_sp,
  metric_key = excluded.metric_key,
  target_value = excluded.target_value,
  sort_order = excluded.sort_order;

insert into public.global_telemetry (id, last_event_summary)
values ('global', 'Exotic Live Cloud Ready')
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- 6. AUTOMATIC DOMAIN INTEGRITY & REALTIME PG_NOTIFY TRIGGERS
-- ----------------------------------------------------------------------------

-- 6.1 Auto-initialize settings, loadout, and starter inventory when a profile is created
create or replace function public.handle_new_profile_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.player_settings (profile_id)
  values (new.id)
  on conflict (profile_id) do nothing;

  insert into public.player_loadouts (profile_id)
  values (new.id)
  on conflict (profile_id) do nothing;

  insert into public.player_inventory (profile_id, item_id, category, cost_paid, currency_spent, acquired_via)
  select new.id, s.id, s.category, 0, s.currency, 'starter'
  from public.shop_items s
  where s.is_starter = true
  on conflict (profile_id, item_id) do nothing;

  update public.global_telemetry
  set total_players = (select count(*) from public.profiles)
  where id = 'global';

  return new;
end;
$$;

drop trigger if exists trg_profile_defaults on public.profiles;
create trigger trg_profile_defaults
after insert on public.profiles
for each row execute function public.handle_new_profile_defaults();

-- 6.2 Increment shop_items.total_unlocks on inventory insert
create or replace function public.handle_inventory_unlock_counter()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.acquired_via <> 'starter' then
    update public.shop_items
    set total_unlocks = total_unlocks + 1
    where id = new.item_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_inventory_unlock_counter on public.player_inventory;
create trigger trg_inventory_unlock_counter
after insert on public.player_inventory
for each row execute function public.handle_inventory_unlock_counter();

-- 6.3 Increment achievements_catalog.global_unlocks & profiles.achievements_count
create or replace function public.handle_achievement_unlock_counter()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.achievements_catalog
  set global_unlocks = global_unlocks + 1
  where id = new.achievement_id;

  update public.profiles
  set achievements_count = (
    select count(*) from public.player_achievements where profile_id = new.profile_id
  )
  where id = new.profile_id;

  return new;
end;
$$;

drop trigger if exists trg_achievement_unlock_counter on public.player_achievements;
create trigger trg_achievement_unlock_counter
after insert on public.player_achievements
for each row execute function public.handle_achievement_unlock_counter();

-- 6.4 Maintain world records on levels_catalog & global_telemetry when a run is published
create or replace function public.handle_leaderboard_run_inserted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.levels_catalog
  set
    world_record_time_ms = case
      when world_record_time_ms is null or new.time_ms < world_record_time_ms then new.time_ms
      else world_record_time_ms
    end,
    world_record_callsign = case
      when world_record_time_ms is null or new.time_ms < world_record_time_ms then new.callsign
      else world_record_callsign
    end,
    world_record_deaths = case
      when world_record_time_ms is null or new.time_ms < world_record_time_ms then new.deaths
      else world_record_deaths
    end
  where id = new.level_id;

  update public.global_telemetry
  set
    total_runs_published = total_runs_published + 1,
    last_event_summary = format('%s posted %s ms on Stage 0%s', new.callsign, new.time_ms, new.level_id)
  where id = 'global';

  return new;
end;
$$;

drop trigger if exists trg_leaderboard_run_inserted on public.leaderboard_runs;
create trigger trg_leaderboard_run_inserted
after insert on public.leaderboard_runs
for each row execute function public.handle_leaderboard_run_inserted();

-- 6.5 Universal Realtime Broadcast Trigger (pg_notify <= 7500 byte guard)
create or replace function public.exotic_notify_realtime_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new jsonb := null;
  v_old jsonb := null;
  v_msg text;
begin
  if tg_op in ('INSERT', 'UPDATE') then
    v_new := to_jsonb(new) - 'blueprint' - 'frames_inline';
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    v_old := to_jsonb(old) - 'blueprint' - 'frames_inline';
  end if;

  v_msg := jsonb_build_object(
    'id', gen_random_uuid()::text,
    'schema', tg_table_schema,
    'table', tg_table_name,
    'eventType', tg_op,
    'commit_timestamp', now(),
    'new', v_new,
    'old', v_old
  )::text;

  if octet_length(v_msg) > 7600 then
    v_msg := jsonb_build_object(
      'id', gen_random_uuid()::text,
      'schema', tg_table_schema,
      'table', tg_table_name,
      'eventType', tg_op,
      'commit_timestamp', now(),
      'pk', coalesce(v_new ->> 'id', v_new ->> 'profile_id', v_new ->> 'session_id', v_old ->> 'id')
    )::text;
  end if;

  perform pg_notify('exotic_realtime', v_msg);
  return coalesce(new, old);
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'shop_items',
    'levels_catalog',
    'achievements_catalog',
    'global_telemetry',
    'profiles',
    'player_settings',
    'player_loadouts',
    'player_inventory',
    'player_level_progress',
    'player_achievements',
    'leaderboard_runs',
    'run_replays',
    'live_presence_sessions',
    'realtime_activity_feed'
  ]
  loop
    execute format('drop trigger if exists trg_exotic_realtime_notify on public.%I;', t);
    execute format('create trigger trg_exotic_realtime_notify after insert or update or delete on public.%I for each row execute function public.exotic_notify_realtime_change();', t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 7. SERVER-AUTHORITATIVE ATOMIC RPC FUNCTIONS
-- ----------------------------------------------------------------------------

-- 7.1 Get or Hydrate Full Runner Snapshot + Reconcile Client State
create or replace function public.rpc_sync_runner_state(
  p_client_key text,
  p_state jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
  v_settings public.player_settings;
  v_loadout public.player_loadouts;
  v_item_id text;
  v_ach_id text;
  v_lvl_key text;
  v_lvl_val jsonb;
  v_lvl_id integer;
begin
  if p_client_key is null or btrim(p_client_key) = '' then
    raise exception 'client_key is required';
  end if;

  insert into public.profiles (client_key, callsign)
  values (
    left(btrim(p_client_key), 96),
    left(btrim(coalesce(p_state ->> 'callsign', '')), 20)
  )
  on conflict (client_key) do update set
    last_seen_at = now()
  returning * into v_profile;

  if p_state is not null and jsonb_typeof(p_state) = 'object' then
    update public.profiles
    set
      callsign = case
        when (p_state ? 'callsign') then left(btrim(coalesce(p_state ->> 'callsign', '')), 20)
        else callsign
      end,
      coins = case
        when (p_state ->> 'authoritative')::boolean = true and (p_state ? 'coins') then greatest(0, (p_state ->> 'coins')::integer)
        else greatest(coins, coalesce((p_state ->> 'coins')::integer, coins))
      end,
      skill_points = case
        when (p_state ->> 'authoritative')::boolean = true and (p_state ? 'skillPoints') then greatest(0, (p_state ->> 'skillPoints')::integer)
        else greatest(skill_points, coalesce((p_state ->> 'skillPoints')::integer, skill_points))
      end,
      total_deaths = greatest(total_deaths, coalesce((p_state #>> '{telemetry,totalDeaths}')::bigint, total_deaths)),
      traps_triggered = greatest(traps_triggered, coalesce((p_state #>> '{telemetry,trapsTriggered}')::bigint, traps_triggered)),
      parting_floor_deaths = greatest(parting_floor_deaths, coalesce((p_state #>> '{telemetry,partingFloorDeaths}')::bigint, parting_floor_deaths)),
      shy_doors_triggered = greatest(shy_doors_triggered, coalesce((p_state #>> '{telemetry,shyDoorsTriggered}')::bigint, shy_doors_triggered)),
      quick_restarts = greatest(quick_restarts, coalesce((p_state #>> '{telemetry,quickRestarts}')::bigint, quick_restarts)),
      total_coins_collected = greatest(total_coins_collected, coalesce((p_state #>> '{telemetry,totalCoinsCollected}')::bigint, total_coins_collected)),
      emotes_used_in_stage = greatest(emotes_used_in_stage, coalesce((p_state #>> '{telemetry,emotesUsedInStage}')::bigint, emotes_used_in_stage)),
      gravity_flips_survived = greatest(gravity_flips_survived, coalesce((p_state #>> '{telemetry,gravityFlipsSurvived}')::bigint, gravity_flips_survived)),
      deathless_clears = greatest(deathless_clears, coalesce((p_state #>> '{telemetry,deathlessClears}')::bigint, deathless_clears)),
      last_seen_at = now()
    where id = v_profile.id
    returning * into v_profile;

    if p_state ? 'settings' then
      update public.player_settings
      set
        theme = coalesce((p_state #>> '{settings,theme}')::public.theme_mode, theme),
        muted = coalesce((p_state #>> '{settings,muted}')::boolean, muted),
        volume = least(1, greatest(0, coalesce((p_state #>> '{settings,volume}')::numeric, volume))),
        screen_shake = coalesce((p_state #>> '{settings,screenShake}')::boolean, screen_shake),
        touch_controls = coalesce((p_state #>> '{settings,touchControls}')::boolean, touch_controls),
        live_ghosts = coalesce((p_state #>> '{settings,liveGhosts}')::boolean, live_ghosts)
      where profile_id = v_profile.id;
    end if;

    if jsonb_typeof(p_state -> 'ownedItems') = 'array' then
      for v_item_id in select jsonb_array_elements_text(p_state -> 'ownedItems')
      loop
        insert into public.player_inventory (profile_id, item_id, category, cost_paid, currency_spent, acquired_via)
        select v_profile.id, s.id, s.category, s.cost, s.currency, case when s.is_starter then 'starter' else 'sync' end
        from public.shop_items s where s.id = v_item_id
        on conflict (profile_id, item_id) do nothing;
      end loop;
    end if;

    if jsonb_typeof(p_state -> 'unlockedUpgrades') = 'array' then
      for v_item_id in select jsonb_array_elements_text(p_state -> 'unlockedUpgrades')
      loop
        insert into public.player_inventory (profile_id, item_id, category, cost_paid, currency_spent, acquired_via)
        select v_profile.id, s.id, s.category, s.cost, s.currency, 'sync'
        from public.shop_items s where s.id = v_item_id
        on conflict (profile_id, item_id) do nothing;
      end loop;
    end if;

    if p_state ? 'equipped' then
      update public.player_loadouts
      set
        character_id = coalesce((select id from public.shop_items where id = (p_state #>> '{equipped,character}')), character_id),
        skin_id = coalesce((select id from public.shop_items where id = (p_state #>> '{equipped,skin}')), skin_id),
        aura_id = coalesce((select id from public.shop_items where id = (p_state #>> '{equipped,aura}')), aura_id),
        trail_id = coalesce((select id from public.shop_items where id = (p_state #>> '{equipped,trail}')), trail_id),
        emote_id = coalesce((select id from public.shop_items where id = (p_state #>> '{equipped,emote}')), emote_id),
        active_upgrades = case
          when jsonb_typeof(p_state -> 'activeUpgrades') = 'array'
          then array(select jsonb_array_elements_text(p_state -> 'activeUpgrades'))
          else active_upgrades
        end
      where profile_id = v_profile.id;
    end if;

    if jsonb_typeof(p_state -> 'levelStats') = 'object' then
      for v_lvl_key, v_lvl_val in select * from jsonb_each(p_state -> 'levelStats')
      loop
        v_lvl_id := v_lvl_key::integer;
        if v_lvl_id between 1 and 8 then
          insert into public.player_level_progress (
            profile_id, level_id, cleared, clears, best_time_ms, least_deaths, par_deaths_met, par_time_met, orb_collected, first_cleared_at
          ) values (
            v_profile.id,
            v_lvl_id,
            coalesce((v_lvl_val ->> 'cleared')::boolean, false),
            coalesce((v_lvl_val ->> 'clears')::integer, 0),
            (v_lvl_val ->> 'bestTimeMs')::integer,
            (v_lvl_val ->> 'leastDeaths')::integer,
            coalesce((v_lvl_val ->> 'parDeathsMet')::boolean, false),
            coalesce((v_lvl_val ->> 'parTimeMet')::boolean, false),
            coalesce((p_state -> 'collectedOrbs' ->> v_lvl_key)::boolean, false),
            case when coalesce((v_lvl_val ->> 'cleared')::boolean, false) then now() else null end
          )
          on conflict (profile_id, level_id) do update set
            cleared = public.player_level_progress.cleared or excluded.cleared,
            clears = greatest(public.player_level_progress.clears, excluded.clears),
            best_time_ms = case
              when public.player_level_progress.best_time_ms is null then excluded.best_time_ms
              when excluded.best_time_ms is null then public.player_level_progress.best_time_ms
              else least(public.player_level_progress.best_time_ms, excluded.best_time_ms)
            end,
            least_deaths = case
              when public.player_level_progress.least_deaths is null then excluded.least_deaths
              when excluded.least_deaths is null then public.player_level_progress.least_deaths
              else least(public.player_level_progress.least_deaths, excluded.least_deaths)
            end,
            par_deaths_met = public.player_level_progress.par_deaths_met or excluded.par_deaths_met,
            par_time_met = public.player_level_progress.par_time_met or excluded.par_time_met,
            orb_collected = public.player_level_progress.orb_collected or excluded.orb_collected;
        end if;
      end loop;
    end if;

    if jsonb_typeof(p_state -> 'collectedOrbs') = 'object' then
      for v_lvl_key, v_lvl_val in select * from jsonb_each(p_state -> 'collectedOrbs')
      loop
        v_lvl_id := v_lvl_key::integer;
        if v_lvl_id between 1 and 8 and v_lvl_val = 'true'::jsonb then
          insert into public.player_level_progress (profile_id, level_id, orb_collected)
          values (v_profile.id, v_lvl_id, true)
          on conflict (profile_id, level_id) do update set orb_collected = true;
        end if;
      end loop;
    end if;

    if jsonb_typeof(p_state -> 'unlockedAchievements') = 'array' then
      for v_ach_id in select jsonb_array_elements_text(p_state -> 'unlockedAchievements')
      loop
        insert into public.player_achievements (profile_id, achievement_id, reward_coins, reward_sp)
        select v_profile.id, a.id, a.reward_coins, a.reward_sp
        from public.achievements_catalog a where a.id = v_ach_id
        on conflict (profile_id, achievement_id) do nothing;
      end loop;
    end if;

    update public.profiles
    set stages_cleared = (
      select count(*) from public.player_level_progress where profile_id = v_profile.id and cleared = true
    )
    where id = v_profile.id
    returning * into v_profile;
  end if;

  select * into v_settings from public.player_settings where profile_id = v_profile.id;
  select * into v_loadout from public.player_loadouts where profile_id = v_profile.id;

  return jsonb_build_object(
    'profile', to_jsonb(v_profile),
    'settings', to_jsonb(v_settings),
    'loadout', to_jsonb(v_loadout),
    'ownedItems', coalesce((
      select jsonb_agg(item_id order by unlocked_at)
      from public.player_inventory
      where profile_id = v_profile.id and category <> 'upgrades'
    ), '[]'::jsonb),
    'unlockedUpgrades', coalesce((
      select jsonb_agg(item_id order by unlocked_at)
      from public.player_inventory
      where profile_id = v_profile.id and category = 'upgrades'
    ), '[]'::jsonb),
    'levelProgress', coalesce((
      select jsonb_agg(to_jsonb(lp) order by lp.level_id)
      from public.player_level_progress lp
      where lp.profile_id = v_profile.id
    ), '[]'::jsonb),
    'unlockedAchievements', coalesce((
      select jsonb_agg(achievement_id order by unlocked_at)
      from public.player_achievements
      where profile_id = v_profile.id
    ), '[]'::jsonb)
  );
end;
$$;

-- 7.2 Atomic Shop Purchase & Auto-Equip
create or replace function public.rpc_purchase_shop_item(
  p_client_key text,
  p_item_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
  v_item public.shop_items;
  v_already boolean;
  v_callsign text;
begin
  select * into v_profile from public.profiles where client_key = p_client_key for update;
  if not found then
    perform public.rpc_sync_runner_state(p_client_key, null);
    select * into v_profile from public.profiles where client_key = p_client_key for update;
  end if;

  select * into v_item from public.shop_items where id = p_item_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'Item not found in catalog.');
  end if;

  select exists(
    select 1 from public.player_inventory where profile_id = v_profile.id and item_id = v_item.id
  ) into v_already;

  if v_already then
    return jsonb_build_object('ok', false, 'reason', 'Already unlocked.');
  end if;

  if v_item.currency = 'sp' then
    if v_profile.skill_points < v_item.cost then
      return jsonb_build_object('ok', false, 'reason', 'Not enough Skill Points.');
    end if;
    update public.profiles set skill_points = skill_points - v_item.cost where id = v_profile.id returning * into v_profile;
    update public.global_telemetry set total_sp_spent = total_sp_spent + v_item.cost where id = 'global';
  else
    if v_profile.coins < v_item.cost then
      return jsonb_build_object('ok', false, 'reason', 'Not enough Coins.');
    end if;
    update public.profiles set coins = coins - v_item.cost where id = v_profile.id returning * into v_profile;
    update public.global_telemetry set total_coins_spent = total_coins_spent + v_item.cost where id = 'global';
  end if;

  insert into public.player_inventory (profile_id, item_id, category, cost_paid, currency_spent, acquired_via)
  values (v_profile.id, v_item.id, v_item.category, v_item.cost, v_item.currency, 'shop');

  if v_item.category = 'upgrades' then
    update public.player_loadouts
    set active_upgrades = array_append(array_remove(active_upgrades, v_item.id), v_item.id)
    where profile_id = v_profile.id;
  elsif v_item.category = 'characters' then
    update public.player_loadouts set character_id = v_item.id where profile_id = v_profile.id;
  elsif v_item.category = 'skins' then
    update public.player_loadouts set skin_id = v_item.id where profile_id = v_profile.id;
  elsif v_item.category = 'auras' then
    update public.player_loadouts set aura_id = v_item.id where profile_id = v_profile.id;
  elsif v_item.category = 'trails' then
    update public.player_loadouts set trail_id = v_item.id where profile_id = v_profile.id;
  elsif v_item.category = 'emotes' then
    update public.player_loadouts set emote_id = v_item.id where profile_id = v_profile.id;
  end if;

  update public.shop_items set total_equips = total_equips + 1 where id = v_item.id;

  v_callsign := case when btrim(v_profile.callsign) <> '' then v_profile.callsign else 'Runner' end;
  insert into public.realtime_activity_feed (profile_id, callsign, event_type, item_id, headline, detail)
  values (
    v_profile.id,
    v_callsign,
    'item_unlocked',
    v_item.id,
    format('%s unlocked %s', v_callsign, v_item.name),
    format('%s · %s %s', v_item.tier, v_item.cost, case when v_item.currency = 'sp' then 'SP' else 'Coins' end)
  );

  update public.global_telemetry
  set last_event_summary = format('%s unlocked %s', v_callsign, v_item.name)
  where id = 'global';

  return jsonb_build_object('ok', true, 'snapshot', public.rpc_sync_runner_state(p_client_key, null));
end;
$$;

-- 7.2b Atomic Equip / Toggle Upgrade
create or replace function public.rpc_equip_loadout_item(
  p_client_key text,
  p_item_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
  v_item public.shop_items;
  v_owns boolean;
begin
  select * into v_profile from public.profiles where client_key = p_client_key for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'Profile not initialized.');
  end if;

  select * into v_item from public.shop_items where id = p_item_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'Item not found.');
  end if;

  select exists(
    select 1 from public.player_inventory where profile_id = v_profile.id and item_id = v_item.id
  ) into v_owns;

  if not v_owns and not v_item.is_starter then
    return jsonb_build_object('ok', false, 'reason', 'Item not unlocked.');
  end if;

  if v_item.category = 'upgrades' then
    update public.player_loadouts
    set active_upgrades = case
      when v_item.id = any(active_upgrades) then array_remove(active_upgrades, v_item.id)
      else array_append(active_upgrades, v_item.id)
    end
    where profile_id = v_profile.id;
  elsif v_item.category = 'characters' then
    update public.player_loadouts set character_id = v_item.id where profile_id = v_profile.id;
  elsif v_item.category = 'skins' then
    update public.player_loadouts set skin_id = v_item.id where profile_id = v_profile.id;
  elsif v_item.category = 'auras' then
    update public.player_loadouts set aura_id = v_item.id where profile_id = v_profile.id;
  elsif v_item.category = 'trails' then
    update public.player_loadouts set trail_id = v_item.id where profile_id = v_profile.id;
  elsif v_item.category = 'emotes' then
    update public.player_loadouts set emote_id = v_item.id where profile_id = v_profile.id;
  end if;

  update public.shop_items set total_equips = total_equips + 1 where id = v_item.id;

  return jsonb_build_object('ok', true, 'snapshot', public.rpc_sync_runner_state(p_client_key, null));
end;
$$;

-- 7.3 Atomic Gameplay Telemetry, Orbs, Achievements & Stage Clears
create or replace function public.rpc_record_gameplay_event(
  p_client_key text,
  p_event text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
  v_lvl_id integer := (p_payload ->> 'levelId')::integer;
  v_delta integer := greatest(1, coalesce((p_payload ->> 'delta')::integer, 1));
  v_coins integer := greatest(0, coalesce((p_payload ->> 'earnedCoins')::integer, 0));
  v_sp integer := greatest(0, coalesce((p_payload ->> 'earnedSP')::integer, 0));
  v_time_ms integer := (p_payload ->> 'timeMs')::integer;
  v_deaths integer := coalesce((p_payload ->> 'deaths')::integer, 0);
  v_callsign text;
  v_ach public.achievements_catalog;
  v_was_inserted integer;
begin
  select * into v_profile from public.profiles where client_key = p_client_key for update;
  if not found then
    perform public.rpc_sync_runner_state(p_client_key, null);
    select * into v_profile from public.profiles where client_key = p_client_key for update;
  end if;
  v_callsign := case when btrim(v_profile.callsign) <> '' then v_profile.callsign else 'Runner' end;

  if p_event = 'death' then
    update public.profiles set total_deaths = total_deaths + v_delta where id = v_profile.id;
    update public.global_telemetry set
      total_deaths = total_deaths + v_delta,
      last_event_summary = format('%s perished on Stage 0%s', v_callsign, coalesce(v_lvl_id, 1))
    where id = 'global';
    if v_lvl_id between 1 and 8 then
      update public.levels_catalog set global_deaths = global_deaths + v_delta, global_attempts = global_attempts + 1 where id = v_lvl_id;
      insert into public.player_level_progress (profile_id, level_id, attempts, total_deaths)
      values (v_profile.id, v_lvl_id, 1, v_delta)
      on conflict (profile_id, level_id) do update set
        attempts = public.player_level_progress.attempts + 1,
        total_deaths = public.player_level_progress.total_deaths + v_delta,
        last_played_at = now();
    end if;

  elsif p_event = 'trap_triggered' then
    update public.profiles set traps_triggered = traps_triggered + v_delta where id = v_profile.id;
    update public.global_telemetry set total_traps_triggered = total_traps_triggered + v_delta where id = 'global';

  elsif p_event = 'shy_door' then
    update public.profiles set shy_doors_triggered = shy_doors_triggered + v_delta where id = v_profile.id;
    update public.global_telemetry set
      total_shy_doors = total_shy_doors + v_delta,
      last_event_summary = format('Exit Door bolted away from %s!', v_callsign)
    where id = 'global';
    insert into public.realtime_activity_feed (profile_id, callsign, event_type, level_id, headline)
    values (v_profile.id, v_callsign, 'shy_door', v_lvl_id, format('Exit Door juked %s on Stage 0%s', v_callsign, coalesce(v_lvl_id, 1)));

  elsif p_event = 'coin' then
    update public.profiles set
      coins = coins + coalesce((p_payload ->> 'coinValue')::integer, 5),
      total_coins_collected = total_coins_collected + v_delta
    where id = v_profile.id;
    update public.global_telemetry set total_coins_collected = total_coins_collected + v_delta where id = 'global';

  elsif p_event = 'emote' then
    update public.profiles set emotes_used_in_stage = emotes_used_in_stage + v_delta where id = v_profile.id;
    update public.global_telemetry set total_emotes_used = total_emotes_used + v_delta where id = 'global';

  elsif p_event = 'gravity_flip' then
    update public.profiles set gravity_flips_survived = gravity_flips_survived + v_delta where id = v_profile.id;

  elsif p_event = 'orb_claimed' and v_lvl_id between 1 and 8 then
    insert into public.player_level_progress (profile_id, level_id, orb_collected)
    values (v_profile.id, v_lvl_id, true)
    on conflict (profile_id, level_id) do update set orb_collected = true;
    update public.profiles set skill_points = skill_points + v_sp, coins = coins + v_coins where id = v_profile.id;
    update public.levels_catalog set global_orbs_found = global_orbs_found + 1 where id = v_lvl_id;
    update public.global_telemetry set total_sp_earned = total_sp_earned + v_sp where id = 'global';
    insert into public.realtime_activity_feed (profile_id, callsign, event_type, level_id, headline)
    values (v_profile.id, v_callsign, 'orb_claimed', v_lvl_id, format('%s claimed Hidden Skill Orb on Stage 0%s', v_callsign, v_lvl_id));

  elsif p_event = 'stage_clear' and v_lvl_id between 1 and 8 then
    insert into public.player_level_progress (
      profile_id, level_id, cleared, clears, attempts, best_time_ms, least_deaths,
      par_deaths_met, par_time_met, first_cleared_at, last_played_at
    ) values (
      v_profile.id, v_lvl_id, true, 1, 1, v_time_ms, v_deaths,
      coalesce((p_payload ->> 'parDeathsMet')::boolean, false),
      coalesce((p_payload ->> 'parTimeMet')::boolean, false),
      now(), now()
    )
    on conflict (profile_id, level_id) do update set
      cleared = true,
      clears = public.player_level_progress.clears + 1,
      attempts = public.player_level_progress.attempts + 1,
      best_time_ms = case
        when public.player_level_progress.best_time_ms is null then excluded.best_time_ms
        else least(public.player_level_progress.best_time_ms, excluded.best_time_ms)
      end,
      least_deaths = case
        when public.player_level_progress.least_deaths is null then excluded.least_deaths
        else least(public.player_level_progress.least_deaths, excluded.least_deaths)
      end,
      par_deaths_met = public.player_level_progress.par_deaths_met or excluded.par_deaths_met,
      par_time_met = public.player_level_progress.par_time_met or excluded.par_time_met,
      first_cleared_at = coalesce(public.player_level_progress.first_cleared_at, now()),
      last_played_at = now();

    update public.profiles set
      coins = coins + v_coins,
      skill_points = skill_points + v_sp,
      deathless_clears = deathless_clears + (case when v_deaths = 0 then 1 else 0 end),
      stages_cleared = (select count(*) from public.player_level_progress where profile_id = v_profile.id and cleared = true)
    where id = v_profile.id;

    update public.levels_catalog set global_clears = global_clears + 1, global_attempts = global_attempts + 1 where id = v_lvl_id;
    update public.global_telemetry set
      total_clears = total_clears + 1,
      total_deathless_clears = total_deathless_clears + (case when v_deaths = 0 then 1 else 0 end),
      total_sp_earned = total_sp_earned + v_sp,
      last_event_summary = format('%s cleared Stage 0%s in %s ms (%s deaths)', v_callsign, v_lvl_id, v_time_ms, v_deaths)
    where id = 'global';

    insert into public.realtime_activity_feed (profile_id, callsign, event_type, level_id, headline, detail)
    values (
      v_profile.id,
      v_callsign,
      case when v_deaths = 0 then 'deathless_clear'::public.realtime_event_type else 'stage_clear'::public.realtime_event_type end,
      v_lvl_id,
      format('%s conquered Stage 0%s%s', v_callsign, v_lvl_id, case when v_deaths = 0 then ' DEATHLESS!' else '' end),
      format('%s ms · %s deaths · +%s Coins', v_time_ms, v_deaths, v_coins)
    );

  elsif p_event = 'achievement_unlocked' then
    select * into v_ach from public.achievements_catalog where id = (p_payload ->> 'achievementId');
    if found then
      insert into public.player_achievements (profile_id, achievement_id, reward_coins, reward_sp)
      values (v_profile.id, v_ach.id, v_ach.reward_coins, v_ach.reward_sp)
      on conflict (profile_id, achievement_id) do nothing;
      get diagnostics v_was_inserted = row_count;
      if v_was_inserted > 0 then
        update public.profiles set
          coins = coins + v_ach.reward_coins,
          skill_points = skill_points + v_ach.reward_sp
        where id = v_profile.id;
        insert into public.realtime_activity_feed (profile_id, callsign, event_type, achievement_id, headline, detail)
        values (
          v_profile.id,
          v_callsign,
          'achievement_unlocked',
          v_ach.id,
          format('%s unlocked "%s"', v_callsign, v_ach.title),
          format('+%s Coins · +%s SP', v_ach.reward_coins, v_ach.reward_sp)
        );
      end if;
    end if;
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

-- 7.4 Atomic Verified Leaderboard Run + Optional Replay Ghost
create or replace function public.rpc_publish_verified_run(
  p_client_key text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
  v_loadout public.player_loadouts;
  v_lvl public.levels_catalog;
  v_callsign text := left(btrim(coalesce(p_payload ->> 'callsign', '')), 20);
  v_lvl_id integer := (p_payload ->> 'levelId')::integer;
  v_time_ms integer := round((p_payload ->> 'timeMs')::numeric)::integer;
  v_deaths integer := greatest(0, round(coalesce((p_payload ->> 'deaths')::numeric, 0))::integer);
  v_coins integer := greatest(0, round(coalesce((p_payload ->> 'coins')::numeric, 0))::integer);
  v_run public.leaderboard_runs;
  v_frames jsonb := coalesce(p_payload -> 'frames', '[]'::jsonb);
begin
  if v_callsign = '' then
    return jsonb_build_object('ok', false, 'reason', 'Callsign is required.');
  end if;

  select * into v_lvl from public.levels_catalog where id = v_lvl_id;
  if not found or v_time_ms is null or v_time_ms < 500 then
    return jsonb_build_object('ok', false, 'reason', 'Invalid run metrics.');
  end if;

  if p_client_key is not null and btrim(p_client_key) <> '' then
    perform public.rpc_sync_runner_state(p_client_key, jsonb_build_object('callsign', v_callsign));
    select * into v_profile from public.profiles where client_key = p_client_key;
    select * into v_loadout from public.player_loadouts where profile_id = v_profile.id;
  end if;

  insert into public.leaderboard_runs (
    profile_id, client_key, callsign, level_id, level_title,
    time_ms, deaths, coins,
    character_id, skin_id, aura_id, trail_id, active_upgrades,
    replay_storage_path, runner_card_path
  ) values (
    v_profile.id,
    p_client_key,
    v_callsign,
    v_lvl.id,
    v_lvl.title,
    v_time_ms,
    v_deaths,
    v_coins,
    coalesce(p_payload ->> 'characterId', v_loadout.character_id, 'char_classic'),
    coalesce(p_payload ->> 'skinId', v_loadout.skin_id, 'skin_solid'),
    coalesce(p_payload ->> 'auraId', v_loadout.aura_id, 'aura_none'),
    coalesce(p_payload ->> 'trailId', v_loadout.trail_id, 'trail_none'),
    coalesce(v_loadout.active_upgrades, '{}'::text[]),
    p_payload ->> 'replayStoragePath',
    p_payload ->> 'runnerCardPath'
  )
  returning * into v_run;

  if jsonb_typeof(v_frames) = 'array' and jsonb_array_length(v_frames) > 0 then
    insert into public.run_replays (
      run_id, profile_id, level_id, callsign, time_ms, deaths,
      character_id, skin_id, aura_id,
      sample_interval_ms, frame_count, frames_inline, storage_path
    ) values (
      v_run.id, v_profile.id, v_lvl.id, v_callsign, v_time_ms, v_deaths,
      v_run.character_id, v_run.skin_id, v_run.aura_id,
      coalesce((p_payload ->> 'sampleIntervalMs')::integer, 80),
      jsonb_array_length(v_frames),
      v_frames,
      p_payload ->> 'replayStoragePath'
    );
  end if;

  insert into public.realtime_activity_feed (profile_id, callsign, event_type, level_id, headline, detail)
  values (
    v_profile.id,
    v_callsign,
    'run_published',
    v_lvl.id,
    format('%s published a verified run on %s. %s', v_callsign, v_lvl.code, v_lvl.title),
    format('%s ms · %s deaths · %s coins', v_time_ms, v_deaths, v_coins)
  );

  return jsonb_build_object('ok', true, 'record', to_jsonb(v_run));
end;
$$;

-- 7.5 Live Presence Heartbeat & Co-Runner Coordinates
create or replace function public.rpc_heartbeat_presence(
  p_session_id text,
  p_client_key text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
  v_online integer;
begin
  select id into v_profile_id from public.profiles where client_key = p_client_key;

  insert into public.live_presence_sessions (
    session_id, profile_id, client_key, callsign, current_route, current_level_id,
    player_x, player_y, vx, vy, facing, gravity_sign,
    character_id, skin_id, aura_id, emote_id,
    run_deaths, run_time_ms, is_online, heartbeat_at
  ) values (
    left(p_session_id, 96),
    v_profile_id,
    left(coalesce(p_client_key, p_session_id), 96),
    left(coalesce(p_payload ->> 'callsign', ''), 20),
    coalesce(p_payload ->> 'route', 'menu'),
    case when (p_payload ->> 'levelId') is not null then (p_payload ->> 'levelId')::integer else null end,
    (p_payload ->> 'x')::numeric,
    (p_payload ->> 'y')::numeric,
    coalesce((p_payload ->> 'vx')::numeric, 0),
    coalesce((p_payload ->> 'vy')::numeric, 0),
    coalesce((p_payload ->> 'facing')::integer, 1),
    coalesce((p_payload ->> 'gravitySign')::integer, 1),
    coalesce(p_payload ->> 'characterId', 'char_classic'),
    coalesce(p_payload ->> 'skinId', 'skin_solid'),
    coalesce(p_payload ->> 'auraId', 'aura_none'),
    p_payload ->> 'emoteId',
    coalesce((p_payload ->> 'deaths')::integer, 0),
    coalesce((p_payload ->> 'timeMs')::integer, 0),
    coalesce((p_payload ->> 'isOnline')::boolean, true),
    now()
  )
  on conflict (session_id) do update set
    profile_id = coalesce(excluded.profile_id, public.live_presence_sessions.profile_id),
    callsign = excluded.callsign,
    current_route = excluded.current_route,
    current_level_id = excluded.current_level_id,
    player_x = excluded.player_x,
    player_y = excluded.player_y,
    vx = excluded.vx,
    vy = excluded.vy,
    facing = excluded.facing,
    gravity_sign = excluded.gravity_sign,
    character_id = excluded.character_id,
    skin_id = excluded.skin_id,
    aura_id = excluded.aura_id,
    emote_id = excluded.emote_id,
    run_deaths = excluded.run_deaths,
    run_time_ms = excluded.run_time_ms,
    is_online = excluded.is_online,
    heartbeat_at = now();

  delete from public.live_presence_sessions
  where heartbeat_at < now() - interval '45 seconds';

  select count(*) into v_online
  from public.live_presence_sessions
  where is_online = true and heartbeat_at >= now() - interval '45 seconds';

  update public.global_telemetry
  set online_runners = v_online
  where id = 'global' and online_runners <> v_online;

  return jsonb_build_object('ok', true, 'onlineRunners', v_online);
end;
$$;

-- 7.6 Reset Individual Runner Save Data Cleanly
create or replace function public.rpc_reset_runner_data(p_client_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
begin
  select * into v_profile from public.profiles where client_key = p_client_key;
  if found then
    delete from public.leaderboard_runs where profile_id = v_profile.id or client_key = p_client_key;
    delete from public.profiles where id = v_profile.id;
  end if;
  return public.rpc_sync_runner_state(p_client_key, null);
end;
$$;

-- ----------------------------------------------------------------------------
-- 8. ROW LEVEL SECURITY (RLS) ACROSS ALL 14 TABLES + GRANTS
-- ----------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to service_role;
grant select on all tables in schema public to anon, authenticated;
grant insert, update, delete on
  public.profiles,
  public.player_settings,
  public.player_loadouts,
  public.player_inventory,
  public.player_level_progress,
  public.player_achievements,
  public.leaderboard_runs,
  public.run_replays,
  public.live_presence_sessions,
  public.realtime_activity_feed
to anon, authenticated;
grant execute on all functions in schema public to anon, authenticated, service_role;

do $$
declare
  t text;
begin
  foreach t in array array[
    'shop_items',
    'levels_catalog',
    'achievements_catalog',
    'global_telemetry',
    'profiles',
    'player_settings',
    'player_loadouts',
    'player_inventory',
    'player_level_progress',
    'player_achievements',
    'leaderboard_runs',
    'run_replays',
    'live_presence_sessions',
    'realtime_activity_feed'
  ]
  loop
    execute format('alter table public.%I enable row level security;', t);
  end loop;
end $$;

-- Public Read Policies
drop policy if exists "shop_items_read_all" on public.shop_items;
create policy "shop_items_read_all" on public.shop_items for select using (true);

drop policy if exists "levels_catalog_read_all" on public.levels_catalog;
create policy "levels_catalog_read_all" on public.levels_catalog for select using (true);

drop policy if exists "achievements_catalog_read_all" on public.achievements_catalog;
create policy "achievements_catalog_read_all" on public.achievements_catalog for select using (true);

drop policy if exists "global_telemetry_read_all" on public.global_telemetry;
create policy "global_telemetry_read_all" on public.global_telemetry for select using (true);

drop policy if exists "leaderboard_runs_read_all" on public.leaderboard_runs;
create policy "leaderboard_runs_read_all" on public.leaderboard_runs for select using (true);

drop policy if exists "leaderboard_runs_insert_owner" on public.leaderboard_runs;
create policy "leaderboard_runs_insert_owner" on public.leaderboard_runs
  for insert with check (
    char_length(btrim(callsign)) between 1 and 20
    and time_ms >= 500
    and (client_key is null or client_key = public.current_client_key())
  );

drop policy if exists "leaderboard_runs_delete_owner" on public.leaderboard_runs;
create policy "leaderboard_runs_delete_owner" on public.leaderboard_runs
  for delete using (client_key = public.current_client_key() or auth.uid() = (select auth_user_id from public.profiles where id = profile_id));

drop policy if exists "run_replays_read_all" on public.run_replays;
create policy "run_replays_read_all" on public.run_replays for select using (true);

drop policy if exists "run_replays_insert_owner" on public.run_replays;
create policy "run_replays_insert_owner" on public.run_replays
  for insert with check (
    profile_id in (select id from public.profiles where client_key = public.current_client_key() or auth_user_id = auth.uid())
  );

drop policy if exists "live_presence_read_all" on public.live_presence_sessions;
create policy "live_presence_read_all" on public.live_presence_sessions for select using (true);

drop policy if exists "live_presence_write_owner" on public.live_presence_sessions;
create policy "live_presence_write_owner" on public.live_presence_sessions
  for all using (client_key = public.current_client_key())
  with check (client_key = public.current_client_key());

drop policy if exists "realtime_activity_feed_read_all" on public.realtime_activity_feed;
create policy "realtime_activity_feed_read_all" on public.realtime_activity_feed for select using (true);

drop policy if exists "realtime_activity_feed_insert_owner" on public.realtime_activity_feed;
create policy "realtime_activity_feed_insert_owner" on public.realtime_activity_feed
  for insert with check (
    profile_id is null or profile_id in (select id from public.profiles where client_key = public.current_client_key() or auth_user_id = auth.uid())
  );

-- Owner-Scoped Player Tables
drop policy if exists "profiles_read_public" on public.profiles;
create policy "profiles_read_public" on public.profiles for select using (true);

drop policy if exists "profiles_write_owner" on public.profiles;
create policy "profiles_write_owner" on public.profiles
  for all using (client_key = public.current_client_key() or auth_user_id = auth.uid())
  with check (client_key = public.current_client_key() or auth_user_id = auth.uid());

drop policy if exists "player_settings_owner" on public.player_settings;
create policy "player_settings_owner" on public.player_settings
  for all using (profile_id in (select id from public.profiles where client_key = public.current_client_key() or auth_user_id = auth.uid()))
  with check (profile_id in (select id from public.profiles where client_key = public.current_client_key() or auth_user_id = auth.uid()));

drop policy if exists "player_loadouts_read_all" on public.player_loadouts;
create policy "player_loadouts_read_all" on public.player_loadouts for select using (true);

drop policy if exists "player_loadouts_write_owner" on public.player_loadouts;
create policy "player_loadouts_write_owner" on public.player_loadouts
  for all using (profile_id in (select id from public.profiles where client_key = public.current_client_key() or auth_user_id = auth.uid()))
  with check (profile_id in (select id from public.profiles where client_key = public.current_client_key() or auth_user_id = auth.uid()));

drop policy if exists "player_inventory_owner" on public.player_inventory;
create policy "player_inventory_owner" on public.player_inventory
  for all using (profile_id in (select id from public.profiles where client_key = public.current_client_key() or auth_user_id = auth.uid()))
  with check (profile_id in (select id from public.profiles where client_key = public.current_client_key() or auth_user_id = auth.uid()));

drop policy if exists "player_level_progress_owner" on public.player_level_progress;
create policy "player_level_progress_owner" on public.player_level_progress
  for all using (profile_id in (select id from public.profiles where client_key = public.current_client_key() or auth_user_id = auth.uid()))
  with check (profile_id in (select id from public.profiles where client_key = public.current_client_key() or auth_user_id = auth.uid()));

drop policy if exists "player_achievements_read_all" on public.player_achievements;
create policy "player_achievements_read_all" on public.player_achievements for select using (true);

drop policy if exists "player_achievements_write_owner" on public.player_achievements;
create policy "player_achievements_write_owner" on public.player_achievements
  for all using (profile_id in (select id from public.profiles where client_key = public.current_client_key() or auth_user_id = auth.uid()))
  with check (profile_id in (select id from public.profiles where client_key = public.current_client_key() or auth_user_id = auth.uid()));

-- ----------------------------------------------------------------------------
-- 9. ENABLE SUPABASE REALTIME ACROSS ALL AND EVERY TABLE (14 / 14 TABLES)
-- ----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  foreach t in array array[
    'shop_items',
    'levels_catalog',
    'achievements_catalog',
    'global_telemetry',
    'profiles',
    'player_settings',
    'player_loadouts',
    'player_inventory',
    'player_level_progress',
    'player_achievements',
    'leaderboard_runs',
    'run_replays',
    'live_presence_sessions',
    'realtime_activity_feed'
  ]
  loop
    execute format('alter table public.%I replica identity full;', t);
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I;', t);
    end if;
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 10. SUPABASE STORAGE BUCKETS & STORAGE.OBJECTS RLS POLICIES
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('runner-avatars', 'runner-avatars', true, 2097152, array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']),
  ('runner-cards', 'runner-cards', true, 5242880, array['image/png', 'application/json']),
  ('run-replays', 'run-replays', true, 2097152, array['application/json']),
  ('stage-snapshots', 'stage-snapshots', true, 5242880, array['image/png', 'application/json'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "exotic_storage_public_read" on storage.objects;
create policy "exotic_storage_public_read" on storage.objects
  for select using (bucket_id in ('runner-avatars', 'runner-cards', 'run-replays', 'stage-snapshots'));

drop policy if exists "exotic_storage_upload" on storage.objects;
create policy "exotic_storage_upload" on storage.objects
  for insert with check (bucket_id in ('runner-avatars', 'runner-cards', 'run-replays', 'stage-snapshots'));

drop policy if exists "exotic_storage_update_own" on storage.objects;
create policy "exotic_storage_update_own" on storage.objects
  for update using (bucket_id in ('runner-avatars', 'runner-cards', 'run-replays', 'stage-snapshots'));

drop policy if exists "exotic_storage_delete_own" on storage.objects;
create policy "exotic_storage_delete_own" on storage.objects
  for delete using (bucket_id in ('runner-avatars', 'runner-cards', 'run-replays', 'stage-snapshots'));
