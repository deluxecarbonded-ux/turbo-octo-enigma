-- ============================================================================
-- EXOTIC — Rebalance Level Completion Rewards (15 Coins + 1 SP First Clear Only;
-- 0 Coins & 0 SP on Replayed Already-Completed Levels)
-- ============================================================================

alter table public.levels_catalog
  add column if not exists reward_sp integer not null default 1 check (reward_sp >= 0);

update public.levels_catalog
set
  reward_coins = 15,
  reward_sp = 1;

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

    -- Replaying an already completed stage or re-touching an already collected orb grants 0 Coins & 0 SP
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

    -- Strictly 15 Coins + 1 SP on first completion; 0 Coins + 0 SP if already completed
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
