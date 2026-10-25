import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { getServiceClient, resolveClientKey } from '../_shared/supabaseClient.ts';

Deno.serve(async (req: Request) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  try {
    const body = await req.json().catch(() => ({}));
    const clientKey = resolveClientKey(req, body);
    const itemId = typeof body.itemId === 'string' ? body.itemId.trim() : '';
    const action = body.action === 'equip' ? 'equip' : 'buy';

    if (!clientKey || !itemId) {
      return jsonResponse({ ok: false, reason: 'Missing clientKey or itemId.' }, 400);
    }

    const supabase = getServiceClient(req);
    const rpcName = action === 'equip' ? 'rpc_equip_loadout_item' : 'rpc_purchase_shop_item';
    const { data, error } = await supabase.rpc(rpcName, {
      p_client_key: clientKey,
      p_item_id: itemId
    });

    if (error) {
      return jsonResponse({ ok: false, reason: error.message }, 400);
    }

    return jsonResponse(data);
  } catch (err) {
    return jsonResponse(
      { ok: false, reason: err instanceof Error ? err.message : 'Shop transaction failed.' },
      500
    );
  }
});
