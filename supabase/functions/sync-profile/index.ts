import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { getServiceClient, resolveClientKey } from '../_shared/supabaseClient.ts';

Deno.serve(async (req: Request) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  try {
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const clientKey = resolveClientKey(req, body);
    if (!clientKey) {
      return jsonResponse({ ok: false, error: 'Missing clientKey / x-exotic-player-id.' }, 400);
    }

    const supabase = getServiceClient(req);

    const { data: snapshot, error: syncErr } = await supabase.rpc('rpc_sync_runner_state', {
      p_client_key: clientKey,
      p_state: body.state ?? null
    });
    if (syncErr) {
      return jsonResponse({ ok: false, error: syncErr.message }, 400);
    }

    const [telemetryRes, levelsRes, shopRes, achRes, feedRes, presenceRes] = await Promise.all([
      supabase.from('global_telemetry').select('*').eq('id', 'global').maybeSingle(),
      supabase
        .from('levels_catalog')
        .select(
          'id, code, title, subtitle, par_deaths, par_time_ms, reward_coins, reward_sp, global_attempts, global_clears, global_deaths, global_orbs_found, world_record_time_ms, world_record_callsign, world_record_deaths'
        )
        .order('id', { ascending: true }),
      supabase
        .from('shop_items')
        .select('id, category, name, tier, cost, currency, description, is_starter, sort_order, total_unlocks, total_equips')
        .order('sort_order', { ascending: true }),
      supabase
        .from('achievements_catalog')
        .select('*')
        .order('sort_order', { ascending: true }),
      supabase
        .from('realtime_activity_feed')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('live_presence_sessions')
        .select('*')
        .eq('is_online', true)
        .order('heartbeat_at', { ascending: false })
        .limit(40)
    ]);

    return jsonResponse({
      ok: true,
      snapshot,
      globalTelemetry: telemetryRes.data ?? null,
      levelsCatalog: levelsRes.data ?? [],
      shopCatalog: shopRes.data ?? [],
      achievementsCatalog: achRes.data ?? [],
      activityFeed: feedRes.data ?? [],
      presence: presenceRes.data ?? []
    });
  } catch (err) {
    return jsonResponse(
      { ok: false, error: err instanceof Error ? err.message : 'Unexpected sync error.' },
      500
    );
  }
});
