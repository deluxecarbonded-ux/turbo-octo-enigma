import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

export function getServiceClient(req?: Request) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? 'https://wwcjifbwqdedgvrmadly.supabase.co';
  const serviceKey =
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const playerHeader = req?.headers.get('x-exotic-player-id') ?? '';

  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: playerHeader ? { 'x-exotic-player-id': playerHeader } : {}
    }
  });
}

export function resolveClientKey(req: Request, body?: Record<string, unknown>): string {
  const fromBody = typeof body?.clientKey === 'string' ? body.clientKey.trim() : '';
  const fromHeader = (req.headers.get('x-exotic-player-id') ?? '').trim();
  return (fromBody || fromHeader).slice(0, 96);
}
