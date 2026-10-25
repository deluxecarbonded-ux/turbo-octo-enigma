-- ============================================================================
-- EXOTIC — Full-App Color Mode Setting (Colored / Monochrome × Dark / Light)
-- 1. Adds color_mode ('colored' | 'monochrome', default 'colored') to
--    public.player_settings.
-- 2. Updates public.rpc_sync_runner_state so color_mode is persisted per user
--    (both Authenticated and Guest profiles) and returned in every snapshot.
-- ============================================================================

alter table public.player_settings
  add column if not exists color_mode text not null default 'colored';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'chk_player_settings_color_mode'
  ) then
    alter table public.player_settings
      add constraint chk_player_settings_color_mode
      check (color_mode in ('colored', 'monochrome'));
  end if;
end $$;

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
            and (not v_profile.is_guest or public.is_guest_allowed_item(id))
        ), character_id),
        skin_id = coalesce((
          select id from public.shop_items
          where id = (p_state #>> '{equipped,skin}')
            and (not v_profile.is_guest or public.is_guest_allowed_item(id))
        ), skin_id),
        aura_id = coalesce((
          select id from public.shop_items
          where id = (p_state #>> '{equipped,aura}')
            and (not v_profile.is_guest or public.is_guest_allowed_item(id))
        ), aura_id),
        trail_id = coalesce((
          select id from public.shop_items
          where id = (p_state #>> '{equipped,trail}')
            and (not v_profile.is_guest or public.is_guest_allowed_item(id))
        ), trail_id),
        emote_id = coalesce((
          select id from public.shop_items
          where id = (p_state #>> '{equipped,emote}')
            and (not v_profile.is_guest or public.is_guest_allowed_item(id))
        ), emote_id),
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
