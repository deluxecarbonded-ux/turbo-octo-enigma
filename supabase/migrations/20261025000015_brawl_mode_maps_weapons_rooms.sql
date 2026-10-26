-- ============================================================================
-- EXOTIC — Brawl Game Mode: Brawl-Only Maps, Brawl-Only Weapons & Online Rooms
-- 1. Extends public.shop_category enum with 'maps' and 'weapons'.
-- 2. Seeds 8 Brawl Maps (2 free Starters + 6 Coin-unlockable Maps) and
--    9 Brawl Weapons (Bare Fists Starter + 8 Coin-unlockable Sky-Drop Weapons).
-- 3. Extends public.player_loadouts with brawl_map_id and brawl_weapon_id,
--    and public.profiles with brawl_wins and brawl_kos.
-- 4. Updates Guest item allowlist, purchase/equip RPCs, state sync RPC,
--    reset RPC, and creates public.brawl_rooms + rpc_record_brawl_result.
-- ============================================================================

alter type public.shop_category add value if not exists 'maps';
alter type public.shop_category add value if not exists 'weapons';

-- Seed 8 Brawl Maps & 9 Brawl Weapons (Brawl Game Mode Only)
insert into public.shop_items (
  id, category, name, tier, cost, currency, description, is_starter, sort_order, metadata
) values
  -- BRAWL MAPS (8 Maps — 2 Starters, 6 Shop Maps)
  (
    'brawl_map_haven',
    'maps',
    'Brawlhaven Sanctum',
    'Starter',
    0,
    'coins',
    'Brawl Mode Only. Suspended tournament sanctum island flanked by twin soft tri-platforms and deep recovery walls.',
    true,
    201,
    '{"tier":"Starter","starter":true,"brawlOnly":true,"guestLocked":false}'::jsonb
  ),
  (
    'brawl_map_citadel',
    'maps',
    'Monolith Citadel',
    'Starter',
    0,
    'coins',
    'Brawl Mode Only. Twin obsidian fortress bastions joined by an elevated pass-through skybridge over a central drop.',
    true,
    202,
    '{"tier":"Starter","starter":true,"brawlOnly":true,"guestLocked":false}'::jsonb
  ),
  (
    'brawl_map_skyforge',
    'maps',
    'Skyforge Anvil',
    'Uncommon',
    65,
    'coins',
    'Brawl Mode Only. Wide anvil battleground with oscillating wing lifts for high-altitude knockouts. Full account required.',
    false,
    203,
    '{"tier":"Uncommon","starter":false,"brawlOnly":true,"guestLocked":true}'::jsonb
  ),
  (
    'brawl_map_voidspire',
    'maps',
    'Twilight Voidspire',
    'Rare',
    85,
    'coins',
    'Brawl Mode Only. Asymmetric spire deck featuring a towering pinnacle perch and off-stage side island. Full account required.',
    false,
    204,
    '{"tier":"Rare","starter":false,"brawlOnly":true,"guestLocked":true}'::jsonb
  ),
  (
    'brawl_map_reactor',
    'maps',
    'Aether Reactor',
    'Rare',
    105,
    'coins',
    'Brawl Mode Only. Split core chambers bridged by a sweeping shuttle deck for ruthless edge-guarding. Full account required.',
    false,
    205,
    '{"tier":"Rare","starter":false,"brawlOnly":true,"guestLocked":true}'::jsonb
  ),
  (
    'brawl_map_galleon',
    'maps',
    'Tempest Deck',
    'Epic',
    130,
    'coins',
    'Brawl Mode Only. Broad skyship hull crowned with twin mast perches and steep side recovery cliffs. Full account required.',
    false,
    206,
    '{"tier":"Epic","starter":false,"brawlOnly":true,"guestLocked":true}'::jsonb
  ),
  (
    'brawl_map_colosseum',
    'maps',
    'Thundergard Ring',
    'Epic',
    155,
    'coins',
    'Brawl Mode Only. Championship dual-plate stadium with a center pit chasm and three upper pass-through decks. Full account required.',
    false,
    207,
    '{"tier":"Epic","starter":false,"brawlOnly":true,"guestLocked":true}'::jsonb
  ),
  (
    'brawl_map_valhalla',
    'maps',
    'Apex Valhalla',
    'Exotic',
    195,
    'coins',
    'Brawl Mode Only. Sovereign celestial hall with synchronized rising wing terraces and royal center dais. Full account required.',
    false,
    208,
    '{"tier":"Exotic","starter":false,"brawlOnly":true,"guestLocked":true}'::jsonb
  ),

  -- BRAWL WEAPONS (9 Weapons — Bare Fists Default + 8 Sky-Drop Shop Weapons)
  (
    'weapon_fists',
    'weapons',
    'Bare Fists',
    'Starter',
    0,
    'coins',
    'Brawl Mode Only. Default unarmed brawler gauntlets — blistering jab-uppercut strings, dash hooks, aerial haymakers, and meteor slams.',
    true,
    221,
    '{"tier":"Starter","starter":true,"brawlOnly":true,"guestLocked":false}'::jsonb
  ),
  (
    'weapon_sword',
    'weapons',
    'Vanguard Blade',
    'Uncommon',
    60,
    'coins',
    'Brawl Mode Only. Balanced broadsword picked up from stage sky-drops — crisp horizontal cleaves, lunging thrusts, and cyclone recovery.',
    false,
    222,
    '{"tier":"Uncommon","starter":false,"brawlOnly":true,"guestLocked":true}'::jsonb
  ),
  (
    'weapon_spear',
    'weapons',
    'Skyreach Spear',
    'Uncommon',
    75,
    'coins',
    'Brawl Mode Only. Long-reach polearm from stage sky-drops — precision pokes, pole-vault launchers, and helicopter aerial spins.',
    false,
    223,
    '{"tier":"Uncommon","starter":false,"brawlOnly":true,"guestLocked":true}'::jsonb
  ),
  (
    'weapon_katars',
    'weapons',
    'Twin Katars',
    'Rare',
    90,
    'coins',
    'Brawl Mode Only. Dual wrist-blades from stage sky-drops — diagonal dive-strikes, relentless rushdown flurries, and twin rising slashes.',
    false,
    224,
    '{"tier":"Rare","starter":false,"brawlOnly":true,"guestLocked":true}'::jsonb
  ),
  (
    'weapon_blasters',
    'weapons',
    'Dual Blasters',
    'Rare',
    110,
    'coins',
    'Brawl Mode Only. Twin kinetic pistols from stage sky-drops — spaced mid-range blast bursts, backstep shots, and rising twin volleys.',
    false,
    225,
    '{"tier":"Rare","starter":false,"brawlOnly":true,"guestLocked":true}'::jsonb
  ),
  (
    'weapon_hammer',
    'weapons',
    'Grapple Hammer',
    'Epic',
    130,
    'coins',
    'Brawl Mode Only. Colossal warhammer from stage sky-drops — earth-shaking stomps, overhead scoops, and crushing knockout swings.',
    false,
    226,
    '{"tier":"Epic","starter":false,"brawlOnly":true,"guestLocked":true}'::jsonb
  ),
  (
    'weapon_axe',
    'weapons',
    'Rift Cleaver',
    'Epic',
    145,
    'coins',
    'Brawl Mode Only. Heavy battle greataxe from stage sky-drops — sweeping 180-degree arcs, lunging cleaves, and spinning wheel recovery.',
    false,
    227,
    '{"tier":"Epic","starter":false,"brawlOnly":true,"guestLocked":true}'::jsonb
  ),
  (
    'weapon_lance',
    'weapons',
    'Rocket Lance',
    'Mythic',
    170,
    'coins',
    'Brawl Mode Only. Thruster-powered heavy lance from stage sky-drops — jet-boosted charges, multi-hit drills, and diagonal ignition boosts.',
    false,
    228,
    '{"tier":"Mythic","starter":false,"brawlOnly":true,"guestLocked":true}'::jsonb
  ),
  (
    'weapon_scythe',
    'weapons',
    'Phantom Scythe',
    'Exotic',
    195,
    'coins',
    'Brawl Mode Only. Curved crescent reaper scythe from stage sky-drops — directional hook throws, diagonal air-reaps, and soul-sweep finishers.',
    false,
    229,
    '{"tier":"Exotic","starter":false,"brawlOnly":true,"guestLocked":true}'::jsonb
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

-- Extend player_loadouts with Brawl-exclusive Map & Sky-Drop Weapon slots
alter table public.player_loadouts
  add column if not exists brawl_map_id text not null default 'brawl_map_haven' references public.shop_items(id),
  add column if not exists brawl_weapon_id text not null default 'weapon_fists' references public.shop_items(id);

-- Extend profiles with Brawl match stats
alter table public.profiles
  add column if not exists brawl_wins integer not null default 0,
  add column if not exists brawl_kos integer not null default 0;

-- Backfill new Brawl starter items into player_inventory for existing profiles
insert into public.player_inventory (profile_id, item_id, category, cost_paid, currency_spent, acquired_via)
select p.id, s.id, s.category, 0, s.currency, 'starter'
from public.profiles p
cross join public.shop_items s
where s.id in ('brawl_map_haven', 'brawl_map_citadel', 'weapon_fists')
on conflict (profile_id, item_id) do nothing;

-- Update Guest allowed item list (allows 2 starter Brawl Maps + Bare Fists; paid Brawl Maps & Weapons require full account)
create or replace function public.is_guest_allowed_item(p_item_id text)
returns boolean
language sql
immutable
as $$
  select coalesce(p_item_id, '') = any(array[
    'aura_none',
    'char_classic',
    'char_mickey',
    'char_stickman',
    'skin_solid',
    'trail_none',
    'emote_salute',
    'char_cat',
    'char_bunny',
    'skin_inverted',
    'skin_steamboat',
    'aura_sparkle',
    'trail_dust',
    'emote_clap',
    'upg_coyote',
    'upg_magnet',
    'brawl_map_haven',
    'brawl_map_citadel',
    'weapon_fists'
  ]::text[]);
$$;

grant execute on function public.is_guest_allowed_item(text) to anon, authenticated, service_role;

-- Update rpc_sync_runner_state to persist brawl_map_id and brawl_weapon_id
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
  v_lvl_val jsonb;
  v_lvl_id integer;
  v_max_lvl integer;
  v_incoming_coins text[];
  v_incoming_orb boolean;
begin
  if p_client_key is null or btrim(p_client_key) = '' then
    return null;
  end if;

  select * into v_profile
  from public.profiles
  where client_key = left(btrim(p_client_key), 96);

  if not found then
    return null;
  end if;

  v_max_lvl := case when v_profile.is_guest then 3 else 8 end;

  if v_profile.is_signed_in and p_state is not null and jsonb_typeof(p_state) = 'object' then
    update public.profiles
    set
      callsign = v_profile.username,
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
      brawl_wins = greatest(brawl_wins, coalesce((p_state #>> '{telemetry,brawlWins}')::integer, brawl_wins)),
      brawl_kos = greatest(brawl_kos, coalesce((p_state #>> '{telemetry,brawlKos}')::integer, brawl_kos)),
      last_seen_at = now()
    where id = v_profile.id
    returning * into v_profile;

    if p_state ? 'settings' then
      update public.player_settings
      set
        theme = coalesce((p_state #>> '{settings,theme}')::public.theme_mode, theme),
        color_mode = case
          when (p_state #>> '{settings,colorMode}') in ('colored', 'monochrome')
            then (p_state #>> '{settings,colorMode}')
          else color_mode
        end,
        muted = coalesce((p_state #>> '{settings,muted}')::boolean, muted),
        volume = least(1, greatest(0, coalesce((p_state #>> '{settings,volume}')::numeric, volume))),
        screen_shake = coalesce((p_state #>> '{settings,screenShake}')::boolean, screen_shake),
        touch_controls = coalesce((p_state #>> '{settings,touchControls}')::boolean, touch_controls),
        live_ghosts = coalesce((p_state #>> '{settings,liveGhosts}')::boolean, live_ghosts),
        leaderboard_share_enabled = case
          when v_profile.is_guest then false
          else coalesce((p_state #>> '{settings,leaderboardShareEnabled}')::boolean, leaderboard_share_enabled)
        end,
        leaderboard_prompt_enabled = case
          when v_profile.is_guest then false
          else coalesce((p_state #>> '{settings,leaderboardPromptEnabled}')::boolean, leaderboard_prompt_enabled)
        end,
        leaderboard_notice_seen = case
          when v_profile.is_guest then false
          else (leaderboard_notice_seen or coalesce((p_state #>> '{settings,leaderboardNoticeSeen}')::boolean, false))
        end
      where profile_id = v_profile.id;
    end if;

    if jsonb_typeof(p_state -> 'ownedItems') = 'array' then
      for v_item_id in select jsonb_array_elements_text(p_state -> 'ownedItems')
      loop
        if not v_profile.is_guest or public.is_guest_allowed_item(v_item_id) then
          insert into public.player_inventory (profile_id, item_id, category, cost_paid, currency_spent, acquired_via)
          select v_profile.id, s.id, s.category, s.cost, s.currency, case when s.is_starter then 'starter' else 'sync' end
          from public.shop_items s where s.id = v_item_id
          on conflict (profile_id, item_id) do nothing;
        end if;
      end loop;
    end if;

    if jsonb_typeof(p_state -> 'unlockedUpgrades') = 'array' then
      for v_item_id in select jsonb_array_elements_text(p_state -> 'unlockedUpgrades')
      loop
        if not v_profile.is_guest or public.is_guest_allowed_item(v_item_id) then
          insert into public.player_inventory (profile_id, item_id, category, cost_paid, currency_spent, acquired_via)
          select v_profile.id, s.id, s.category, s.cost, s.currency, 'sync'
          from public.shop_items s where s.id = v_item_id
          on conflict (profile_id, item_id) do nothing;
        end if;
      end loop;
    end if;

    if p_state ? 'equipped' then
      update public.player_loadouts
      set
        character_id = coalesce((
          select id from public.shop_items
          where id = (p_state #>> '{equipped,character}')
            and category = 'characters'
            and (not v_profile.is_guest or public.is_guest_allowed_item(id))
        ), character_id),
        skin_id = coalesce((
          select id from public.shop_items
          where id = (p_state #>> '{equipped,skin}')
            and category = 'skins'
            and (not v_profile.is_guest or public.is_guest_allowed_item(id))
        ), skin_id),
        aura_id = coalesce((
          select id from public.shop_items
          where id = (p_state #>> '{equipped,aura}')
            and category = 'auras'
            and (not v_profile.is_guest or public.is_guest_allowed_item(id))
        ), aura_id),
        trail_id = coalesce((
          select id from public.shop_items
          where id = (p_state #>> '{equipped,trail}')
            and category = 'trails'
            and (not v_profile.is_guest or public.is_guest_allowed_item(id))
        ), trail_id),
        emote_id = coalesce((
          select id from public.shop_items
          where id = (p_state #>> '{equipped,emote}')
            and category = 'emotes'
            and (not v_profile.is_guest or public.is_guest_allowed_item(id))
        ), emote_id),
        brawl_map_id = coalesce((
          select id from public.shop_items
          where id = (p_state #>> '{equipped,brawlMap}')
            and category = 'maps'
            and (not v_profile.is_guest or public.is_guest_allowed_item(id))
        ), brawl_map_id),
        brawl_weapon_id = coalesce((
          select id from public.shop_items
          where id = (p_state #>> '{equipped,brawlWeapon}')
            and category = 'weapons'
            and (not v_profile.is_guest or public.is_guest_allowed_item(id))
        ), brawl_weapon_id),
        active_upgrades = case
          when jsonb_typeof(p_state -> 'activeUpgrades') = 'array'
            then array(
              select x from jsonb_array_elements_text(p_state -> 'activeUpgrades') as x
              where not v_profile.is_guest or public.is_guest_allowed_item(x)
            )
          else active_upgrades
        end
      where profile_id = v_profile.id;
    end if;

    for v_lvl_id in 1..v_max_lvl loop
      v_lvl_val := coalesce(p_state #> array['levelStats', v_lvl_id::text], 'null'::jsonb);
      v_incoming_orb := coalesce(
        (p_state #>> array['collectedOrbs', v_lvl_id::text])::boolean,
        (p_state #>> array['collectedStageOrbs', v_lvl_id::text])::boolean,
        false
      );
      if jsonb_typeof(p_state #> array['collectedCoins', v_lvl_id::text]) = 'array' then
        v_incoming_coins := array(
          select distinct x from jsonb_array_elements_text(p_state #> array['collectedCoins', v_lvl_id::text]) as x
          where btrim(x) <> ''
        );
      else
        v_incoming_coins := '{}'::text[];
      end if;

      if jsonb_typeof(v_lvl_val) = 'object' or v_incoming_orb or cardinality(v_incoming_coins) > 0 then
        insert into public.player_level_progress (
          profile_id, level_id, cleared, clears, attempts, best_time_ms, least_deaths,
          orb_collected, collected_coins, first_cleared_at, last_played_at
        )
        values (
          v_profile.id,
          v_lvl_id,
          case when jsonb_typeof(v_lvl_val) = 'object' then coalesce((v_lvl_val ->> 'cleared')::boolean, false) else false end,
          case when jsonb_typeof(v_lvl_val) = 'object' then greatest(0, coalesce((v_lvl_val ->> 'clears')::integer, 0)) else 0 end,
          case when jsonb_typeof(v_lvl_val) = 'object' then greatest(0, coalesce((v_lvl_val ->> 'attempts')::integer, 0)) else 0 end,
          case when jsonb_typeof(v_lvl_val) = 'object' then (v_lvl_val ->> 'bestTimeMs')::integer else null end,
          case when jsonb_typeof(v_lvl_val) = 'object' then (v_lvl_val ->> 'leastDeaths')::integer else null end,
          v_incoming_orb,
          v_incoming_coins,
          case when jsonb_typeof(v_lvl_val) = 'object' and coalesce((v_lvl_val ->> 'cleared')::boolean, false) then now() else null end,
          now()
        )
        on conflict (profile_id, level_id) do update set
          cleared = public.player_level_progress.cleared or excluded.cleared,
          clears = greatest(public.player_level_progress.clears, excluded.clears),
          attempts = greatest(public.player_level_progress.attempts, excluded.attempts),
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
          orb_collected = public.player_level_progress.orb_collected or excluded.orb_collected,
          collected_coins = array(
            select distinct unnest(public.player_level_progress.collected_coins || excluded.collected_coins)
          ),
          first_cleared_at = coalesce(public.player_level_progress.first_cleared_at, excluded.first_cleared_at);
      end if;
    end loop;

    if not v_profile.is_guest and jsonb_typeof(p_state -> 'unlockedAchievements') = 'array' then
      for v_ach_id in select jsonb_array_elements_text(p_state -> 'unlockedAchievements')
      loop
        insert into public.player_achievements (profile_id, achievement_id, reward_coins, reward_sp)
        select v_profile.id, a.id, a.reward_coins, a.reward_sp
        from public.achievements_catalog a where a.id = v_ach_id
        on conflict (profile_id, achievement_id) do nothing;
      end loop;
    end if;

    update public.profiles
    set
      stages_cleared = (
        select count(*) from public.player_level_progress
        where profile_id = v_profile.id and cleared = true
      ),
      achievements_count = case
        when v_profile.is_guest then 0
        else (select count(*) from public.player_achievements where profile_id = v_profile.id)
      end
    where id = v_profile.id
    returning * into v_profile;
  else
    update public.profiles set last_seen_at = now() where id = v_profile.id returning * into v_profile;
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
    'unlockedAchievements', case
      when v_profile.is_guest then '[]'::jsonb
      else coalesce((
        select jsonb_agg(achievement_id order by unlocked_at)
        from public.player_achievements
        where profile_id = v_profile.id
      ), '[]'::jsonb)
    end
  );
end;
$$;

-- Update rpc_purchase_shop_item for 'maps' and 'weapons'
create or replace function public.rpc_purchase_shop_item(p_client_key text, p_item_id text)
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
  select * into v_profile from public.profiles where client_key = p_client_key and is_signed_in = true for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'Sign in required.');
  end if;

  select * into v_item from public.shop_items where id = p_item_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'Shop item not found.');
  end if;

  if v_profile.is_guest and not public.is_guest_allowed_item(v_item.id) then
    return jsonb_build_object('ok', false, 'code', 'GUEST_ITEM_LOCKED', 'reason', 'This item requires a full account.');
  end if;

  select exists(
    select 1 from public.player_inventory
    where profile_id = v_profile.id and item_id = v_item.id
  ) into v_already;

  if v_already then
    return jsonb_build_object('ok', true, 'alreadyOwned', true, 'snapshot', public.rpc_sync_runner_state(p_client_key, null));
  end if;

  if v_item.currency = 'sp' then
    if v_profile.skill_points < v_item.cost then
      return jsonb_build_object('ok', false, 'reason', 'Not enough Skill Points.');
    end if;
    update public.profiles set skill_points = skill_points - v_item.cost where id = v_profile.id;
    update public.global_telemetry set total_sp_spent = total_sp_spent + v_item.cost where id = 'global';
  else
    if v_profile.coins < v_item.cost then
      return jsonb_build_object('ok', false, 'reason', 'Not enough Coins.');
    end if;
    update public.profiles set coins = coins - v_item.cost where id = v_profile.id;
    update public.global_telemetry set total_coins_spent = total_coins_spent + v_item.cost where id = 'global';
  end if;

  insert into public.player_inventory (profile_id, item_id, category, cost_paid, currency_spent, acquired_via)
  values (v_profile.id, v_item.id, v_item.category, v_item.cost, v_item.currency, 'purchase')
  on conflict (profile_id, item_id) do nothing;

  if v_item.category = 'upgrades' then
    update public.player_loadouts
    set active_upgrades = case
      when not (v_item.id = any(active_upgrades)) then array_append(active_upgrades, v_item.id)
      else active_upgrades
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
  elsif v_item.category = 'maps' then
    update public.player_loadouts set brawl_map_id = v_item.id where profile_id = v_profile.id;
  elsif v_item.category = 'weapons' then
    update public.player_loadouts set brawl_weapon_id = v_item.id where profile_id = v_profile.id;
  end if;

  v_callsign := v_profile.username;
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

-- Update rpc_equip_loadout_item for 'maps' and 'weapons'
create or replace function public.rpc_equip_loadout_item(p_client_key text, p_item_id text)
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

  if v_profile.is_guest and not public.is_guest_allowed_item(v_item.id) then
    return jsonb_build_object('ok', false, 'code', 'GUEST_ITEM_LOCKED', 'reason', 'This item requires a full account.');
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
  elsif v_item.category = 'maps' then
    update public.player_loadouts set brawl_map_id = v_item.id where profile_id = v_profile.id;
  elsif v_item.category = 'weapons' then
    update public.player_loadouts set brawl_weapon_id = v_item.id where profile_id = v_profile.id;
  end if;

  update public.shop_items set total_equips = total_equips + 1 where id = v_item.id;

  return jsonb_build_object('ok', true, 'snapshot', public.rpc_sync_runner_state(p_client_key, null));
end;
$$;

-- Update rpc_reset_runner_data to also reset brawl_map_id & brawl_weapon_id
create or replace function public.rpc_reset_runner_data(p_client_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
begin
  select * into v_profile from public.profiles where client_key = p_client_key for update;
  if not found then
    return null;
  end if;

  delete from public.leaderboard_runs where profile_id = v_profile.id or client_key = p_client_key;
  delete from public.run_replays where profile_id = v_profile.id;
  delete from public.player_level_progress where profile_id = v_profile.id;
  delete from public.player_achievements where profile_id = v_profile.id;
  delete from public.player_inventory where profile_id = v_profile.id and acquired_via <> 'starter';

  insert into public.player_inventory (profile_id, item_id, category, cost_paid, currency_spent, acquired_via)
  select v_profile.id, s.id, s.category, 0, s.currency, 'starter'
  from public.shop_items s
  where s.is_starter = true
  on conflict (profile_id, item_id) do nothing;

  update public.player_loadouts
  set
    character_id = 'char_classic',
    skin_id = 'skin_solid',
    aura_id = 'aura_none',
    trail_id = 'trail_none',
    emote_id = 'emote_salute',
    brawl_map_id = 'brawl_map_haven',
    brawl_weapon_id = 'weapon_fists',
    active_upgrades = '{}'::text[]
  where profile_id = v_profile.id;

  update public.profiles
  set
    coins = 0,
    skill_points = 0,
    runner_card_path = null,
    total_deaths = 0,
    traps_triggered = 0,
    parting_floor_deaths = 0,
    shy_doors_triggered = 0,
    quick_restarts = 0,
    total_coins_collected = 0,
    emotes_used_in_stage = 0,
    gravity_flips_survived = 0,
    deathless_clears = 0,
    brawl_wins = 0,
    brawl_kos = 0,
    stages_cleared = 0,
    achievements_count = 0,
    updated_at = now()
  where id = v_profile.id;

  return public.rpc_sync_runner_state(p_client_key, null);
end;
$$;

-- Record Brawl match completion & Coin reward atomically
create or replace function public.rpc_record_brawl_result(
  p_client_key text,
  p_won boolean,
  p_kos integer default 0,
  p_coins_reward integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
  v_coins integer;
  v_kos integer;
begin
  select * into v_profile from public.profiles where client_key = p_client_key and is_signed_in = true for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'Not signed in.');
  end if;

  v_coins := least(30, greatest(0, coalesce(p_coins_reward, 0)));
  v_kos := least(20, greatest(0, coalesce(p_kos, 0)));

  update public.profiles
  set
    coins = coins + v_coins,
    brawl_wins = brawl_wins + case when coalesce(p_won, false) then 1 else 0 end,
    brawl_kos = brawl_kos + v_kos,
    updated_at = now()
  where id = v_profile.id;

  return jsonb_build_object('ok', true, 'snapshot', public.rpc_sync_runner_state(p_client_key, null));
end;
$$;

grant execute on function public.rpc_record_brawl_result(text, boolean, integer, integer) to anon, authenticated, service_role;

-- Online Brawl Matchmaking & Room State Table
create table if not exists public.brawl_rooms (
  id uuid primary key default gen_random_uuid(),
  room_code text not null unique,
  status text not null default 'waiting' check (status in ('waiting', 'active', 'finished')),
  map_id text not null default 'brawl_map_haven' references public.shop_items(id),
  stocks integer not null default 3 check (stocks between 1 and 5),
  host_client_key text not null,
  host_username text not null,
  host_loadout jsonb not null default '{}'::jsonb,
  host_state jsonb not null default '{}'::jsonb,
  host_seen_at timestamptz not null default now(),
  guest_client_key text,
  guest_username text,
  guest_loadout jsonb not null default '{}'::jsonb,
  guest_state jsonb not null default '{}'::jsonb,
  guest_seen_at timestamptz,
  world_state jsonb not null default '{}'::jsonb,
  winner_slot integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_brawl_rooms_status_updated on public.brawl_rooms(status, updated_at desc);

alter table public.brawl_rooms enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'brawl_rooms' and policyname = 'Public read brawl rooms'
  ) then
    create policy "Public read brawl rooms" on public.brawl_rooms for select using (true);
  end if;
end $$;
