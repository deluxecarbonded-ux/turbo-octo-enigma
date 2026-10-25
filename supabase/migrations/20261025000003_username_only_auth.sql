-- ============================================================================
-- EXOTIC — Username-Only Authentication & Forced Bound Account Lifecycle
-- 1. Unique case-insensitive `username` stored in `public.profiles`
-- 2. Device `client_key` bound to registered account until deleted in Settings
-- 3. Sign Out preserves bound account; Sign Back In restores exact same account
-- 4. Re-registration blocked until existing account is deleted from Settings
-- 5. Live username check RPC for HTML5 validation (available/taken & invalid/not registered)
-- ============================================================================

-- 1. Schema additions & cleanup of pre-auth anonymous rows
alter table public.profiles
  add column if not exists username text,
  add column if not exists is_signed_in boolean not null default true;

delete from public.live_presence_sessions
where profile_id in (
  select id from public.profiles where username is null or btrim(username) = ''
);

delete from public.profiles
where username is null or btrim(username) = '';

alter table public.profiles
  alter column username set not null;

alter table public.profiles
  drop constraint if exists chk_profiles_username_format;

alter table public.profiles
  add constraint chk_profiles_username_format
  check (username ~ '^[A-Za-z0-9_]{3,20}$');

create unique index if not exists idx_profiles_username_lower
  on public.profiles (lower(username));

update public.global_telemetry
set total_players = (select count(*) from public.profiles)
where id = 'global';

-- Keep total_players accurate when a user deletes their account from Settings
create or replace function public.handle_profile_deleted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.global_telemetry
  set total_players = (select count(*) from public.profiles)
  where id = 'global';
  return old;
end;
$$;

drop trigger if exists trg_profile_deleted_counter on public.profiles;
create trigger trg_profile_deleted_counter
after delete on public.profiles
for each row execute function public.handle_profile_deleted();

-- 2. Update rpc_sync_runner_state: never auto-insert anonymous profiles; sync only registered accounts
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

    if jsonb_typeof(p_state -> 'levelStats') = 'object' then
      for v_lvl_key, v_lvl_val in select * from jsonb_each(p_state -> 'levelStats')
      loop
        v_lvl_id := nullif(regexp_replace(v_lvl_key, '[^0-9]', '', 'g'), '')::integer;
        if v_lvl_id between 1 and 8 and jsonb_typeof(v_lvl_val) = 'object' then
          insert into public.player_level_progress (
            profile_id, level_id, cleared, clears, attempts, best_time_ms, least_deaths, orb_collected, first_cleared_at, last_played_at
          )
          values (
            v_profile.id,
            v_lvl_id,
            coalesce((v_lvl_val ->> 'cleared')::boolean, false),
            greatest(0, coalesce((v_lvl_val ->> 'clears')::integer, 0)),
            greatest(0, coalesce((v_lvl_val ->> 'attempts')::integer, 0)),
            (v_lvl_val ->> 'bestTimeMs')::integer,
            (v_lvl_val ->> 'leastDeaths')::integer,
            coalesce((p_state -> 'collectedStageOrbs') ? (v_lvl_id::text), false),
            case when coalesce((v_lvl_val ->> 'cleared')::boolean, false) then now() else null end,
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
            first_cleared_at = coalesce(public.player_level_progress.first_cleared_at, excluded.first_cleared_at);
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

-- 3. Update Shop / Gameplay / Leaderboard / Reset RPCs for Registered Accounts
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
  select * into v_profile from public.profiles where client_key = p_client_key and is_signed_in = true for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'Sign in required.');
  end if;

  select * into v_item from public.shop_items where id = p_item_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'Shop item not found.');
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
  v_coins integer := 0;
  v_sp integer := 0;
  v_time_ms integer := (p_payload ->> 'timeMs')::integer;
  v_deaths integer := coalesce((p_payload ->> 'deaths')::integer, 0);
  v_callsign text;
  v_ach public.achievements_catalog;
  v_was_inserted integer;
  v_already_cleared boolean := false;
  v_already_orb boolean := false;
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

  elsif p_event = 'coin' then
    if v_lvl_id between 1 and 8 then
      select cleared into v_already_cleared
      from public.player_level_progress
      where profile_id = v_profile.id and level_id = v_lvl_id;
    end if;
    if not coalesce(v_already_cleared, false) then
      update public.profiles set total_coins_collected = total_coins_collected + v_delta where id = v_profile.id;
      update public.global_telemetry set total_coins_collected = total_coins_collected + v_delta where id = 'global';
    end if;

  elsif p_event = 'emote' then
    update public.profiles set emotes_used_in_stage = emotes_used_in_stage + v_delta where id = v_profile.id;
    update public.global_telemetry set total_emotes_used = total_emotes_used + v_delta where id = 'global';

  elsif p_event = 'gravity_flip' then
    update public.profiles set gravity_flips_survived = gravity_flips_survived + v_delta where id = v_profile.id;

  elsif p_event = 'orb_claimed' and v_lvl_id between 1 and 8 then
    select cleared, orb_collected into v_already_cleared, v_already_orb
    from public.player_level_progress
    where profile_id = v_profile.id and level_id = v_lvl_id;

    if not coalesce(v_already_cleared, false) and not coalesce(v_already_orb, false) then
      insert into public.player_level_progress (profile_id, level_id, orb_collected)
      values (v_profile.id, v_lvl_id, true)
      on conflict (profile_id, level_id) do update set orb_collected = true;

      update public.profiles set skill_points = skill_points + 1 where id = v_profile.id;
      update public.levels_catalog set global_orbs_found = global_orbs_found + 1 where id = v_lvl_id;
      update public.global_telemetry set total_sp_earned = total_sp_earned + 1 where id = 'global';
      insert into public.realtime_activity_feed (profile_id, callsign, event_type, level_id, headline)
      values (v_profile.id, v_callsign, 'orb_claimed', v_lvl_id, format('%s claimed Hidden Skill Orb on Stage 0%s', v_callsign, v_lvl_id));
    end if;

  elsif p_event = 'stage_clear' and v_lvl_id between 1 and 8 then
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
      last_event_summary = format('%s cleared Stage 0%s in %s ms (%s deaths)', v_callsign, v_lvl_id, v_time_ms, v_deaths)
    where id = 'global';

    insert into public.realtime_activity_feed (profile_id, callsign, event_type, level_id, headline, detail)
    values (
      v_profile.id,
      v_callsign,
      case when v_deaths = 0 then 'deathless_clear'::public.realtime_event_type else 'stage_clear'::public.realtime_event_type end,
      v_lvl_id,
      format('%s conquered Stage 0%s%s', v_callsign, v_lvl_id, case when v_deaths = 0 then ' DEATHLESS!' else '' end),
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

  return jsonb_build_object('ok', true, 'earnedCoins', v_coins, 'earnedSP', v_sp);
end;
$$;

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
  v_callsign text;
  v_lvl_id integer := (p_payload ->> 'levelId')::integer;
  v_time_ms integer := round((p_payload ->> 'timeMs')::numeric)::integer;
  v_deaths integer := greatest(0, round(coalesce((p_payload ->> 'deaths')::numeric, 0))::integer);
  v_coins integer := greatest(0, round(coalesce((p_payload ->> 'coins')::numeric, 0))::integer);
  v_run public.leaderboard_runs;
  v_min_time_ms integer;
begin
  select * into v_profile
  from public.profiles
  where client_key = p_client_key and is_signed_in = true
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'Sign in required.');
  end if;

  v_callsign := v_profile.username;

  if v_lvl_id is null or v_lvl_id not between 1 and 8 then
    return jsonb_build_object('ok', false, 'reason', 'Invalid level ID.');
  end if;

  select * into v_lvl from public.levels_catalog where id = v_lvl_id;
  v_min_time_ms := greatest(500, floor(((v_lvl.width - v_lvl.spawn_x - 80)::numeric / 620.0) * 1000)::integer);
  if v_time_ms is null or v_time_ms < v_min_time_ms then
    return jsonb_build_object('ok', false, 'reason', format('Run time (%s ms) below physical limit (%s ms).', v_time_ms, v_min_time_ms));
  end if;

  select * into v_loadout from public.player_loadouts where profile_id = v_profile.id;

  insert into public.leaderboard_runs (
    profile_id, client_key, callsign, level_id, level_title, time_ms, deaths, coins,
    character_id, skin_id, aura_id, trail_id, active_upgrades, replay_storage_path, runner_card_path
  ) values (
    v_profile.id,
    p_client_key,
    v_callsign,
    v_lvl.id,
    v_lvl.title,
    v_time_ms,
    v_deaths,
    v_coins,
    coalesce(v_loadout.character_id, 'char_classic'),
    coalesce(v_loadout.skin_id, 'skin_solid'),
    coalesce(v_loadout.aura_id, 'aura_none'),
    coalesce(v_loadout.trail_id, 'trail_none'),
    coalesce(v_loadout.active_upgrades, '{}'::text[]),
    p_payload ->> 'replayStoragePath',
    v_profile.runner_card_path
  )
  returning * into v_run;

  if jsonb_typeof(p_payload -> 'frames') = 'array' and jsonb_array_length(p_payload -> 'frames') > 1 then
    insert into public.run_replays (
      run_id, profile_id, level_id, callsign, time_ms, deaths,
      character_id, skin_id, aura_id, sample_interval_ms, frame_count, frames_inline, storage_path
    ) values (
      v_run.id,
      v_profile.id,
      v_lvl.id,
      v_callsign,
      v_time_ms,
      v_deaths,
      v_run.character_id,
      v_run.skin_id,
      v_run.aura_id,
      greatest(16, coalesce((p_payload ->> 'sampleIntervalMs')::integer, 80)),
      jsonb_array_length(p_payload -> 'frames'),
      p_payload -> 'frames',
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

-- Reset gameplay progress ONLY (keeps registered username & bound account intact!)
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
    stages_cleared = 0,
    achievements_count = 0,
    updated_at = now()
  where id = v_profile.id;

  return public.rpc_sync_runner_state(p_client_key, null);
end;
$$;

-- ============================================================================
-- 4. USERNAME-ONLY AUTHENTICATION RPCS
-- ============================================================================

-- 4.1 Get current device's bound account & session status
create or replace function public.rpc_auth_session_status(p_client_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
  v_ck text := left(btrim(coalesce(p_client_key, '')), 96);
begin
  if v_ck = '' then
    return jsonb_build_object(
      'ok', true,
      'hasAccount', false,
      'signedIn', false,
      'username', null,
      'snapshot', null
    );
  end if;

  select * into v_profile
  from public.profiles
  where client_key = v_ck;

  if not found then
    return jsonb_build_object(
      'ok', true,
      'hasAccount', false,
      'signedIn', false,
      'username', null,
      'snapshot', null
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'hasAccount', true,
    'signedIn', v_profile.is_signed_in,
    'username', v_profile.username,
    'profileId', v_profile.id,
    'snapshot', case when v_profile.is_signed_in then public.rpc_sync_runner_state(v_ck, null) else null end
  );
end;
$$;

-- 4.2 Real-time Username Validation Check (Sign Up: available/taken · Sign In: invalid/not registered)
create or replace function public.rpc_check_username(
  p_username text,
  p_client_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_u text := btrim(coalesce(p_username, ''));
  v_ck text := left(btrim(coalesce(p_client_key, '')), 96);
  v_target public.profiles;
  v_bound public.profiles;
  v_has_target boolean := false;
  v_has_bound boolean := false;
begin
  if v_ck <> '' then
    select * into v_bound from public.profiles where client_key = v_ck;
    v_has_bound := found;
  end if;

  if v_u !~ '^[A-Za-z0-9_]{3,20}$' then
    return jsonb_build_object(
      'ok', true,
      'valid', false,
      'exists', false,
      'available', false,
      'hasBoundAccount', v_has_bound,
      'boundUsername', case when v_has_bound then v_bound.username else null end,
      'signupMessage', 'Username is invalid',
      'signinMessage', 'Username is invalid'
    );
  end if;

  select * into v_target
  from public.profiles
  where lower(username) = lower(v_u);
  v_has_target := found;

  return jsonb_build_object(
    'ok', true,
    'valid', true,
    'exists', v_has_target,
    'available', (not v_has_target),
    'canonicalUsername', case when v_has_target then v_target.username else v_u end,
    'hasBoundAccount', v_has_bound,
    'boundUsername', case when v_has_bound then v_bound.username else null end,
    'matchesBound', (not v_has_bound) or (v_has_target and v_bound.id = v_target.id),
    'signupMessage', case
      when v_has_target then 'Username is taken'
      else 'Username is available'
    end,
    'signinMessage', case
      when not v_has_target then 'Username is not registered'
      else 'Username is registered'
    end
  );
end;
$$;

-- 4.3 Register Username (Sign Up — blocked if device already holds an undeleted account)
create or replace function public.rpc_auth_signup(
  p_client_key text,
  p_username text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ck text := left(btrim(coalesce(p_client_key, '')), 96);
  v_u text := btrim(coalesce(p_username, ''));
  v_existing public.profiles;
  v_profile public.profiles;
begin
  if v_ck = '' then
    return jsonb_build_object('ok', false, 'code', 'CLIENT_KEY_REQUIRED', 'reason', 'Device session key required.');
  end if;

  -- Users cannot re-register until their existing account is deleted from Settings
  select * into v_existing
  from public.profiles
  where client_key = v_ck
  for update;

  if found then
    return jsonb_build_object(
      'ok', false,
      'code', 'ACCOUNT_LOCKED',
      'boundUsername', v_existing.username,
      'reason', format('Already registered as %s. Delete this user in Settings before registering again.', v_existing.username)
    );
  end if;

  if v_u !~ '^[A-Za-z0-9_]{3,20}$' then
    return jsonb_build_object(
      'ok', false,
      'code', 'USERNAME_INVALID',
      'reason', 'Username is invalid'
    );
  end if;

  if exists(select 1 from public.profiles where lower(username) = lower(v_u)) then
    return jsonb_build_object(
      'ok', false,
      'code', 'USERNAME_TAKEN',
      'reason', 'Username is taken'
    );
  end if;

  insert into public.profiles (client_key, username, callsign, is_signed_in)
  values (v_ck, v_u, v_u, true)
  returning * into v_profile;

  return jsonb_build_object(
    'ok', true,
    'hasAccount', true,
    'signedIn', true,
    'username', v_profile.username,
    'profileId', v_profile.id,
    'snapshot', public.rpc_sync_runner_state(v_ck, null)
  );
end;
$$;

-- 4.4 Sign In with Username (forces bound account if device already registered an account)
create or replace function public.rpc_auth_signin(
  p_client_key text,
  p_username text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ck text := left(btrim(coalesce(p_client_key, '')), 96);
  v_u text := btrim(coalesce(p_username, ''));
  v_bound public.profiles;
  v_has_bound boolean := false;
  v_target public.profiles;
begin
  if v_ck = '' then
    return jsonb_build_object('ok', false, 'code', 'CLIENT_KEY_REQUIRED', 'reason', 'Device session key required.');
  end if;

  if v_u !~ '^[A-Za-z0-9_]{3,20}$' then
    return jsonb_build_object(
      'ok', false,
      'code', 'USERNAME_INVALID',
      'reason', 'Username is invalid'
    );
  end if;

  select * into v_target
  from public.profiles
  where lower(username) = lower(v_u)
  for update;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'code', 'USERNAME_NOT_REGISTERED',
      'reason', 'Username is not registered'
    );
  end if;

  select * into v_bound
  from public.profiles
  where client_key = v_ck
  for update;
  v_has_bound := found;

  if v_has_bound and v_bound.id <> v_target.id then
    return jsonb_build_object(
      'ok', false,
      'code', 'FORCED_BOUND_ACCOUNT',
      'boundUsername', v_bound.username,
      'reason', format('You are bound to %s until deleted in Settings.', v_bound.username)
    );
  end if;

  update public.profiles
  set
    client_key = v_ck,
    is_signed_in = true,
    callsign = username,
    last_seen_at = now(),
    updated_at = now()
  where id = v_target.id
  returning * into v_target;

  return jsonb_build_object(
    'ok', true,
    'hasAccount', true,
    'signedIn', true,
    'username', v_target.username,
    'profileId', v_target.id,
    'snapshot', public.rpc_sync_runner_state(v_ck, null)
  );
end;
$$;

-- 4.5 Sign Out (keeps account & device binding intact so signing back in restores same account)
create or replace function public.rpc_auth_signout(p_client_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ck text := left(btrim(coalesce(p_client_key, '')), 96);
  v_profile public.profiles;
begin
  select * into v_profile
  from public.profiles
  where client_key = v_ck
  for update;

  if not found then
    return jsonb_build_object(
      'ok', true,
      'hasAccount', false,
      'signedIn', false,
      'boundUsername', null
    );
  end if;

  update public.profiles
  set
    is_signed_in = false,
    updated_at = now()
  where id = v_profile.id;

  delete from public.live_presence_sessions
  where profile_id = v_profile.id or client_key = v_ck;

  return jsonb_build_object(
    'ok', true,
    'hasAccount', true,
    'signedIn', false,
    'boundUsername', v_profile.username
  );
end;
$$;

-- 4.6 Delete Account from Settings (permanently removes user & unlocks new registration)
create or replace function public.rpc_auth_delete_account(p_client_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ck text := left(btrim(coalesce(p_client_key, '')), 96);
  v_profile public.profiles;
begin
  select * into v_profile
  from public.profiles
  where client_key = v_ck
  for update;

  if not found then
    return jsonb_build_object(
      'ok', true,
      'deleted', false,
      'hasAccount', false,
      'signedIn', false
    );
  end if;

  delete from public.leaderboard_runs where profile_id = v_profile.id or client_key = v_ck;
  delete from public.live_presence_sessions where profile_id = v_profile.id or client_key = v_ck;
  delete from public.profiles where id = v_profile.id;

  return jsonb_build_object(
    'ok', true,
    'deleted', true,
    'deletedUsername', v_profile.username,
    'hasAccount', false,
    'signedIn', false
  );
end;
$$;

grant execute on function public.rpc_auth_session_status(text) to anon, authenticated, service_role;
grant execute on function public.rpc_check_username(text, text) to anon, authenticated, service_role;
grant execute on function public.rpc_auth_signup(text, text) to anon, authenticated, service_role;
grant execute on function public.rpc_auth_signin(text, text) to anon, authenticated, service_role;
grant execute on function public.rpc_auth_signout(text) to anon, authenticated, service_role;
grant execute on function public.rpc_auth_delete_account(text) to anon, authenticated, service_role;
