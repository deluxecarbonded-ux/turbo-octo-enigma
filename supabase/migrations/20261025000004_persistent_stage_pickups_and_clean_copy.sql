-- ============================================================================
-- EXOTIC — Persistent Earned Stage Coins & Skill Orbs + Clean UI Catalog Copy
-- Migration: 20261025000004_persistent_stage_pickups_and_clean_copy.sql
-- ============================================================================

-- 1. Persist exact collected coin IDs per (profile_id, level_id) so earned coins
--    never spawn again after death, restart, reload, or sign-out/sign-in.
alter table public.player_level_progress
  add column if not exists collected_coins text[] not null default '{}'::text[];

-- 2. Clean catalog text so zero meta/tech/"zero" wording exists in synced DB rows
update public.shop_items
set description = 'Clean silhouette with no ambient emission.'
where id = 'aura_none';

update public.shop_items
set name = 'No Wake'
where id = 'trail_none';

update public.achievements_catalog
set description = 'Clear any level from start to finish without dying.'
where id = 'ach_deathless';

update public.global_telemetry
set last_event_summary = 'Exotic Ready'
where id = 'global';

-- 3. Update rpc_sync_runner_state to persist collectedCoins & collectedOrbs cleanly
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

    -- Sync levelStats, collectedOrbs, and collectedCoins across stages 1..8
    for v_lvl_id in 1..8 loop
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
    set
      stages_cleared = (
        select count(*) from public.player_level_progress
        where profile_id = v_profile.id and cleared = true
      ),
      achievements_count = (
        select count(*) from public.player_achievements
        where profile_id = v_profile.id
      )
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
    'unlockedAchievements', coalesce((
      select jsonb_agg(achievement_id order by unlocked_at)
      from public.player_achievements
      where profile_id = v_profile.id
    ), '[]'::jsonb)
  );
end;
$$;

-- 4. Update rpc_record_gameplay_event so every collected Coin & Skill Orb persists
--    immediately to the user (even if they die right after) and never double-awards.
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
  v_lp public.player_level_progress;
  v_lvl_id integer := (p_payload ->> 'levelId')::integer;
  v_coin_id text := left(btrim(coalesce(p_payload ->> 'coinId', '')), 48);
  v_delta integer := greatest(1, coalesce((p_payload ->> 'delta')::integer, 1));
  v_coins integer := 0;
  v_sp integer := 0;
  v_time_ms integer := (p_payload ->> 'timeMs')::integer;
  v_deaths integer := coalesce(
    (p_payload ->> 'deaths')::integer,
    (p_payload ->> 'runDeaths')::integer,
    0
  );
  v_callsign text;
  v_ach public.achievements_catalog;
  v_was_inserted integer;
  v_already_cleared boolean := false;
  v_lvl_reward_coins integer := 15;
  v_lvl_reward_sp integer := 1;
begin
  select * into v_profile from public.profiles where client_key = p_client_key and is_signed_in = true for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'Sign in required.');
  end if;
  v_callsign := v_profile.username;

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

  elsif p_event in ('coin_collected', 'coin') and v_lvl_id between 1 and 8 then
    insert into public.player_level_progress (profile_id, level_id)
    values (v_profile.id, v_lvl_id)
    on conflict (profile_id, level_id) do nothing;

    select * into v_lp
    from public.player_level_progress
    where profile_id = v_profile.id and level_id = v_lvl_id
    for update;

    if v_coin_id <> '' then
      if not (v_coin_id = any(v_lp.collected_coins)) then
        v_coins := 1;
        update public.player_level_progress
        set
          collected_coins = array_append(collected_coins, v_coin_id),
          last_played_at = now()
        where profile_id = v_profile.id and level_id = v_lvl_id;

        update public.profiles
        set
          coins = coins + 1,
          total_coins_collected = total_coins_collected + 1
        where id = v_profile.id;

        update public.global_telemetry
        set total_coins_collected = total_coins_collected + 1
        where id = 'global';
      end if;
    end if;

  elsif p_event = 'emote' then
    update public.profiles set emotes_used_in_stage = emotes_used_in_stage + v_delta where id = v_profile.id;
    update public.global_telemetry set total_emotes_used = total_emotes_used + v_delta where id = 'global';

  elsif p_event = 'gravity_flip' then
    update public.profiles set gravity_flips_survived = gravity_flips_survived + v_delta where id = v_profile.id;

  elsif p_event = 'orb_claimed' and v_lvl_id between 1 and 8 then
    insert into public.player_level_progress (profile_id, level_id)
    values (v_profile.id, v_lvl_id)
    on conflict (profile_id, level_id) do nothing;

    select * into v_lp
    from public.player_level_progress
    where profile_id = v_profile.id and level_id = v_lvl_id
    for update;

    if not coalesce(v_lp.orb_collected, false) then
      v_sp := 1;
      update public.player_level_progress
      set
        orb_collected = true,
        last_played_at = now()
      where profile_id = v_profile.id and level_id = v_lvl_id;

      update public.profiles set skill_points = skill_points + 1 where id = v_profile.id;
      update public.levels_catalog set global_orbs_found = global_orbs_found + 1 where id = v_lvl_id;
      update public.global_telemetry set total_sp_earned = total_sp_earned + 1 where id = 'global';
      insert into public.realtime_activity_feed (profile_id, callsign, event_type, level_id, headline)
      values (v_profile.id, v_callsign, 'orb_claimed', v_lvl_id, format('%s claimed Hidden Skill Orb on Stage 0%s', v_callsign, v_lvl_id));
    end if;

  elsif p_event in ('stage_clear', 'level_clear') and v_lvl_id between 1 and 8 then
    select cleared into v_already_cleared
    from public.player_level_progress
    where profile_id = v_profile.id and level_id = v_lvl_id;

    select reward_coins, reward_sp into v_lvl_reward_coins, v_lvl_reward_sp
    from public.levels_catalog
    where id = v_lvl_id;

    if coalesce(v_already_cleared, false) then
      v_coins := 0;
      v_sp := 0;
    else
      v_coins := coalesce(v_lvl_reward_coins, 15);
      v_sp := coalesce(v_lvl_reward_sp, 1);
    end if;

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
      last_event_summary = format('%s cleared Stage 0%s in %s ms', v_callsign, v_lvl_id, v_time_ms)
    where id = 'global';

    insert into public.realtime_activity_feed (profile_id, callsign, event_type, level_id, headline, detail)
    values (
      v_profile.id,
      v_callsign,
      case when v_deaths = 0 then 'deathless_clear'::public.realtime_event_type else 'stage_clear'::public.realtime_event_type end,
      v_lvl_id,
      format('%s conquered Stage 0%s%s', v_callsign, v_lvl_id, case when v_deaths = 0 then ' FLAWLESS!' else '' end),
      case
        when v_coins > 0 or v_sp > 0 then format('%s ms · %s deaths · +%s Coins · +%s SP', v_time_ms, v_deaths, v_coins, v_sp)
        else format('%s ms · %s deaths · Replay', v_time_ms, v_deaths)
      end
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

  select * into v_profile from public.profiles where id = v_profile.id;

  return jsonb_build_object(
    'ok', true,
    'earnedCoins', v_coins,
    'earnedSP', v_sp,
    'coins', v_profile.coins,
    'skillPoints', v_profile.skill_points
  );
end;
$$;
