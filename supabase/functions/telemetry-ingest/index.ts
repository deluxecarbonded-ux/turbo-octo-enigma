import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { getServiceClient, resolveClientKey } from '../_shared/supabaseClient.ts';

Deno.serve(async (req: Request) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  try {
    const body = await req.json().catch(() => ({}));
    const clientKey = resolveClientKey(req, body);
    const sessionId = String(
      body.sessionId ?? req.headers.get('x-exotic-session-id') ?? clientKey
    ).slice(0, 96);

    if (!clientKey) {
      return jsonResponse({ ok: false, error: 'Missing clientKey.' }, 400);
    }

    const supabase = getServiceClient(req);

    if (body.kind === 'presence') {
      const { data, error } = await supabase.rpc('rpc_heartbeat_presence', {
        p_session_id: sessionId,
        p_client_key: clientKey,
        p_payload: body.payload ?? {}
      });
      if (error) return jsonResponse({ ok: false, error: error.message }, 400);
      return jsonResponse(data);
    }

    const eventName = String(body.event ?? '').trim();
    if (!eventName) {
      return jsonResponse({ ok: false, error: 'Missing event name.' }, 400);
    }

    const { data, error } = await supabase.rpc('rpc_record_gameplay_event', {
      p_client_key: clientKey,
      p_event: eventName,
      p_payload: body.payload ?? {}
    });

    if (error) {
      return jsonResponse({ ok: false, error: error.message }, 400);
    }

    return jsonResponse(data);
  } catch (err) {
    return jsonResponse(
      { ok: false, error: err instanceof Error ? err.message : 'Telemetry ingest error.' },
      500
    );
  }
});
