import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { getAdminClient } from '../_shared/supabaseAdmin.ts';

Deno.serve(async (req: Request) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  try {
    const supabase = getAdminClient();
    const headerClientKey = (req.headers.get('x-exotic-player-id') ?? '').trim();

    if (req.method === 'GET') {
      const url = new URL(req.url);
      const action = url.searchParams.get('action') ?? 'session';
      if (action === 'check') {
        const username = url.searchParams.get('username') ?? '';
        const { data, error } = await supabase.rpc('rpc_check_username', {
          p_username: username,
          p_client_key: headerClientKey || null
        });
        if (error) throw error;
        return new Response(JSON.stringify(data), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { data, error } = await supabase.rpc('rpc_auth_session_status', {
        p_client_key: headerClientKey
      });
      if (error) throw error;
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const body = await req.json().catch(() => ({}));
    const clientKey = String(body.clientKey || headerClientKey || '').trim();
    const action = String(body.action || 'session');
    const username = String(body.username || '');
    const authMethod = body.authMethod != null ? String(body.authMethod) : null;
    const credential = body.credential != null ? String(body.credential) : null;
    const biometricCredentialId =
      body.biometricCredentialId != null ? String(body.biometricCredentialId) : null;

    let rpcName = 'rpc_auth_session_status';
    let rpcArgs: Record<string, unknown> = { p_client_key: clientKey };

    if (action === 'check') {
      rpcName = 'rpc_check_username';
      rpcArgs = { p_username: username, p_client_key: clientKey || null };
    } else if (action === 'signup') {
      rpcName = 'rpc_auth_signup';
      rpcArgs = {
        p_client_key: clientKey,
        p_username: username,
        p_auth_method: authMethod || 'password',
        p_credential: credential,
        p_biometric_id: biometricCredentialId
      };
    } else if (action === 'signin') {
      rpcName = 'rpc_auth_signin';
      rpcArgs = {
        p_client_key: clientKey,
        p_username: username,
        p_auth_method: authMethod,
        p_credential: credential,
        p_biometric_id: biometricCredentialId
      };
    } else if (action === 'signout') {
      rpcName = 'rpc_auth_signout';
      rpcArgs = { p_client_key: clientKey };
    } else if (action === 'delete') {
      rpcName = 'rpc_auth_delete_account';
      rpcArgs = { p_client_key: clientKey };
    }

    const { data, error } = await supabase.rpc(rpcName, rpcArgs);
    if (error) throw error;

    return new Response(JSON.stringify(data), {
      status: data?.ok === false ? 400 : 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
