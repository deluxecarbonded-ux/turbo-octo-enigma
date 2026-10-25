import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { getServiceClient, resolveClientKey } from '../_shared/supabaseClient.ts';

Deno.serve(async (req: Request) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  try {
    const body = await req.json().catch(() => ({}));
    const clientKey = resolveClientKey(req, body);
    const levelId = Number(body.levelId);
    const timeMs = Math.round(Number(body.timeMs));
    const deaths = Math.max(0, Math.round(Number(body.deaths ?? 0)));
    const callsign = String(body.callsign ?? '').trim().slice(0, 20);

    if (body.publicShareConfirmed !== true) {
      return jsonResponse(
        {
          ok: false,
          code: 'SHARE_CONSENT_REQUIRED',
          reason: 'Public leaderboard sharing requires your confirmation.'
        },
        403
      );
    }

    if (!callsign || !Number.isFinite(levelId) || levelId < 1 || levelId > 8 || !Number.isFinite(timeMs)) {
      return jsonResponse({ ok: false, reason: 'Invalid run submission payload.' }, 400);
    }

    const supabase = getServiceClient(req);

    // Fetch stage width to enforce anti-cheat kinematic speed floor
    const { data: stage } = await supabase
      .from('levels_catalog')
      .select('id, width, spawn_x')
      .eq('id', levelId)
      .maybeSingle();

    const traversalPx = Math.max(400, (stage?.width ?? 960) - (stage?.spawn_x ?? 64) - 80);
    // Max theoretical horizontal speed with Phase Dash bursts is ~620 px/s
    const minPhysicalMs = Math.max(500, Math.floor((traversalPx / 620) * 1000));
    if (timeMs < minPhysicalMs) {
      return jsonResponse(
        {
          ok: false,
          reason: `Run rejected by kinematic verifier (${timeMs}ms < ${minPhysicalMs}ms physical bound).`
        },
        422
      );
    }

    const hasFrames = Array.isArray(body.frames) && body.frames.length > 0;
    const storageKey = hasFrames
      ? `stage-${String(levelId).padStart(2, '0')}/${Date.now()}-${callsign.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`
      : null;

    const { data, error } = await supabase.rpc('rpc_publish_verified_run', {
      p_client_key: clientKey,
      p_payload: {
        ...body,
        callsign,
        levelId,
        timeMs,
        deaths,
        publicShareConfirmed: true,
        replayStoragePath: storageKey
      }
    });

    if (error) {
      return jsonResponse({ ok: false, reason: error.message }, 400);
    }

    if (!data?.ok) {
      return jsonResponse(data ?? { ok: false, reason: 'Leaderboard sharing is disabled.' }, 403);
    }

    if (hasFrames && storageKey) {
      const replayBlob = new TextEncoder().encode(
        JSON.stringify({
          levelId,
          callsign,
          timeMs,
          deaths,
          characterId: body.characterId ?? 'char_classic',
          skinId: body.skinId ?? 'skin_solid',
          auraId: body.auraId ?? 'aura_none',
          sampleIntervalMs: body.sampleIntervalMs ?? 80,
          frames: body.frames
        })
      );
      await supabase.storage
        .from('run-replays')
        .upload(storageKey, replayBlob, {
          contentType: 'application/json',
          upsert: true
        });
    }

    return jsonResponse(data, 201);
  } catch (err) {
    return jsonResponse(
      { ok: false, reason: err instanceof Error ? err.message : 'Run verification failed.' },
      500
    );
  }
});
