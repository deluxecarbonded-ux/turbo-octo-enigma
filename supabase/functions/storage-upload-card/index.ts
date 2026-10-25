import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { getServiceClient, resolveClientKey } from '../_shared/supabaseClient.ts';

const ALLOWED_BUCKETS = new Set([
  'runner-avatars',
  'runner-cards',
  'run-replays',
  'stage-snapshots'
]);

function decodeDataUrl(dataUrl: string): { bytes: Uint8Array; mime: string } {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) {
    const bytes = new TextEncoder().encode(dataUrl);
    return { bytes, mime: 'application/json' };
  }
  const mime = match[1];
  const bin = atob(match[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return { bytes, mime };
}

Deno.serve(async (req: Request) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  try {
    const body = await req.json().catch(() => ({}));
    const clientKey = resolveClientKey(req, body);
    const bucket = ALLOWED_BUCKETS.has(body.bucket) ? String(body.bucket) : 'runner-cards';
    const rawData = typeof body.data === 'string' ? body.data : JSON.stringify(body.data ?? {});

    if (!clientKey) {
      return jsonResponse({ ok: false, error: 'Missing clientKey.' }, 400);
    }

    const { bytes, mime } = decodeDataUrl(rawData);
    const ext = mime.includes('png') ? 'png' : mime.includes('svg') ? 'svg' : 'json';
    const safePrefix = clientKey.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 36);
    const objectPath = `${safePrefix}/${Date.now()}.${ext}`;

    const supabase = getServiceClient(req);
    const { error: uploadErr } = await supabase.storage.from(bucket).upload(objectPath, bytes, {
      contentType: mime,
      upsert: true
    });

    if (uploadErr) {
      return jsonResponse({ ok: false, error: uploadErr.message }, 400);
    }

    const { data: pubUrl } = supabase.storage.from(bucket).getPublicUrl(objectPath);

    if (bucket === 'runner-cards') {
      await supabase
        .from('profiles')
        .update({ runner_card_path: pubUrl.publicUrl })
        .eq('client_key', clientKey);
    } else if (bucket === 'runner-avatars') {
      await supabase
        .from('profiles')
        .update({ avatar_storage_path: pubUrl.publicUrl })
        .eq('client_key', clientKey);
    }

    return jsonResponse({
      ok: true,
      bucket,
      path: objectPath,
      publicUrl: pubUrl.publicUrl
    });
  } catch (err) {
    return jsonResponse(
      { ok: false, error: err instanceof Error ? err.message : 'Storage upload failed.' },
      500
    );
  }
});
