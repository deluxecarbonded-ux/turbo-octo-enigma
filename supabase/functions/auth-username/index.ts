import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { getAdminClient } from '../_shared/supabaseAdmin.ts';

function fromBase64Url(input: string): Uint8Array {
  const pad = '='.repeat((4 - (input.length % 4)) % 4);
  const b64 = (input + pad).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function derEcdsaToRawP256(der: Uint8Array): Uint8Array | null {
  if (der.length === 64) return der;
  if (der.length < 8 || der[0] !== 0x30) return null;
  let offset = 2;
  if ((der[1] & 0x80) !== 0) offset = 2 + (der[1] & 0x7f);
  if (der[offset] !== 0x02) return null;
  const rLen = der[offset + 1];
  let r = der.slice(offset + 2, offset + 2 + rLen);
  offset += 2 + rLen;
  if (der[offset] !== 0x02) return null;
  const sLen = der[offset + 1];
  let s = der.slice(offset + 2, offset + 2 + sLen);
  while (r.length > 32 && r[0] === 0) r = r.slice(1);
  while (s.length > 32 && s[0] === 0) s = s.slice(1);
  if (r.length > 32 || s.length > 32) return null;
  const raw = new Uint8Array(64);
  raw.set(r, 32 - r.length);
  raw.set(s, 64 - s.length);
  return raw;
}

function normalizeFaceDescriptor(desc: unknown): number[] | null {
  if (!Array.isArray(desc) || desc.length !== 128) return null;
  const vals: number[] = [];
  let sumSq = 0;
  for (let i = 0; i < 128; i++) {
    const v = Number(desc[i]);
    if (!Number.isFinite(v)) return null;
    vals.push(v);
    sumSq += v * v;
  }
  const norm = Math.sqrt(sumSq);
  if (norm < 1e-6) return null;
  return vals.map((v) => Number((v / norm).toFixed(6)));
}

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

      if (action === 'challenge') {
        const bytes = crypto.getRandomValues(new Uint8Array(32));
        let bin = '';
        for (const b of bytes) bin += String.fromCharCode(b);
        const challenge = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
        const username = url.searchParams.get('username') ?? '';
        let target = null;
        if (username) {
          const { data } = await supabase.rpc('rpc_get_webauthn_target', {
            p_username: username,
            p_client_key: headerClientKey || null,
            p_auth_method: url.searchParams.get('authMethod') || null
          });
          if (data?.exists) {
            target = {
              authMethod: data.authMethod,
              authMethods: data.authMethods,
              biometricMode: data.biometricMode,
              credentialId: data.biometricCredentialId
            };
          }
        }
        return new Response(JSON.stringify({ ok: true, challenge, target }), {
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

    if (action === 'check') {
      const { data, error } = await supabase.rpc('rpc_check_username', {
        p_username: username,
        p_client_key: clientKey || null
      });
      if (error) throw error;
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (action === 'signup') {
      const chosen = (authMethod || 'password').toLowerCase();
      if (chosen === 'fingerprint' || chosen === 'faceid') {
        if (chosen === 'faceid' && body.biometricMode === 'camera_face') {
          const norm = normalizeFaceDescriptor(body.faceDescriptor);
          if (!norm) {
            return new Response(
              JSON.stringify({ ok: false, code: 'BIOMETRIC_REQUIRED', reason: 'Face ID scan is invalid.' }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
          const { data, error } = await supabase.rpc('rpc_auth_signup', {
            p_client_key: clientKey,
            p_username: username,
            p_auth_method: chosen,
            p_credential: null,
            p_biometric_id: biometricCredentialId,
            p_public_key_spki: null,
            p_public_key_alg: -7,
            p_sign_count: 0,
            p_biometric_mode: 'camera_face',
            p_face_descriptor: norm
          });
          if (error) throw error;
          return new Response(JSON.stringify(data), {
            status: data?.ok === false ? 400 : 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const att = body.webauthnAttestation;
        if (!att?.credentialId || !att?.publicKeySpki || !att?.authenticatorData) {
          return new Response(
            JSON.stringify({ ok: false, code: 'BIOMETRIC_REQUIRED', reason: 'Hardware biometric scan required.' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        const authData = fromBase64Url(String(att.authenticatorData));
        if (authData.length < 37 || (authData[32] & 0x05) !== 0x05) {
          return new Response(
            JSON.stringify({ ok: false, code: 'BIOMETRIC_FAILED', reason: 'Hardware user verification required.' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        const signCount =
          ((authData[33] << 24) >>> 0) + (authData[34] << 16) + (authData[35] << 8) + authData[36];
        const { data, error } = await supabase.rpc('rpc_auth_signup', {
          p_client_key: clientKey,
          p_username: username,
          p_auth_method: chosen,
          p_credential: null,
          p_biometric_id: String(att.credentialId),
          p_public_key_spki: String(att.publicKeySpki),
          p_public_key_alg: Number(att.publicKeyAlg || -7),
          p_sign_count: signCount,
          p_biometric_mode: 'webauthn',
          p_face_descriptor: null
        });
        if (error) throw error;
        return new Response(JSON.stringify(data), {
          status: data?.ok === false ? 400 : 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { data, error } = await supabase.rpc('rpc_auth_signup', {
        p_client_key: clientKey,
        p_username: username,
        p_auth_method: chosen,
        p_credential: credential,
        p_biometric_id: null,
        p_public_key_spki: null,
        p_public_key_alg: -7,
        p_sign_count: 0,
        p_biometric_mode: null,
        p_face_descriptor: null
      });
      if (error) throw error;
      return new Response(JSON.stringify(data), {
        status: data?.ok === false ? 400 : 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (action === 'signin') {
      const { data: target, error: tErr } = await supabase.rpc('rpc_get_webauthn_target', {
        p_username: username,
        p_client_key: clientKey || null,
        p_auth_method: authMethod
      });
      if (tErr) throw tErr;
      if (!target?.exists) {
        return new Response(
          JSON.stringify({ ok: false, code: 'NOT_REGISTERED', reason: 'username is not registered' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const storedMethod = String(target.authMethod || 'password');
      if (storedMethod === 'fingerprint' || storedMethod === 'faceid') {
        if (target.biometricMode === 'camera_face') {
          const probe = normalizeFaceDescriptor(body.faceDescriptor);
          const enrolled = normalizeFaceDescriptor(target.faceDescriptor);
          if (!probe || !enrolled) {
            return new Response(
              JSON.stringify({ ok: false, code: 'INVALID_CREDENTIAL', reason: 'Face ID scan did not match' }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
          let dot = 0;
          for (let i = 0; i < 128; i++) dot += probe[i] * enrolled[i];
          if (dot < 0.80) {
            return new Response(
              JSON.stringify({ ok: false, code: 'INVALID_CREDENTIAL', reason: 'Face ID did not match this account' }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
          const { data, error } = await supabase.rpc('rpc_auth_signin_biometric_verified', {
            p_client_key: clientKey,
            p_username: username,
            p_auth_method: authMethod,
            p_biometric_mode: 'camera_face',
            p_biometric_id: null,
            p_public_key_spki: null,
            p_public_key_alg: -7,
            p_new_sign_count: 0,
            p_face_descriptor: probe
          });
          if (error) throw error;
          return new Response(JSON.stringify(data), {
            status: data?.ok === false ? 400 : 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const asrt = body.webauthnAssertion;
        if (!asrt?.credentialId || !asrt?.authenticatorData || !asrt?.clientDataJSON || !asrt?.signature) {
          return new Response(
            JSON.stringify({ ok: false, code: 'INVALID_CREDENTIAL', reason: 'Hardware biometric scan required.' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        const authData = fromBase64Url(String(asrt.authenticatorData));
        const clientBytes = fromBase64Url(String(asrt.clientDataJSON));
        const sigDer = fromBase64Url(String(asrt.signature));
        const spkiDer = fromBase64Url(String(target.publicKeySpki || ''));
        if (authData.length < 37 || (authData[32] & 0x05) !== 0x05) {
          return new Response(
            JSON.stringify({ ok: false, code: 'INVALID_CREDENTIAL', reason: 'Hardware biometric check not completed.' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        const clientHash = new Uint8Array(await crypto.subtle.digest('SHA-256', clientBytes));
        const signedPayload = new Uint8Array(authData.length + clientHash.length);
        signedPayload.set(authData, 0);
        signedPayload.set(clientHash, authData.length);
        const rawSig = derEcdsaToRawP256(sigDer);
        const pubKey = await crypto.subtle.importKey(
          'spki',
          spkiDer,
          { name: 'ECDSA', namedCurve: 'P-256' },
          false,
          ['verify']
        );
        const verified = rawSig
          ? await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pubKey, rawSig, signedPayload)
          : false;
        if (!verified) {
          return new Response(
            JSON.stringify({ ok: false, code: 'INVALID_CREDENTIAL', reason: 'Biometric verification failed.' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        const signCount =
          ((authData[33] << 24) >>> 0) + (authData[34] << 16) + (authData[35] << 8) + authData[36];
        const { data, error } = await supabase.rpc('rpc_auth_signin_biometric_verified', {
          p_client_key: clientKey,
          p_username: username,
          p_auth_method: authMethod,
          p_biometric_mode: 'webauthn',
          p_biometric_id: String(asrt.credentialId),
          p_public_key_spki: null,
          p_public_key_alg: -7,
          p_new_sign_count: signCount,
          p_face_descriptor: null
        });
        if (error) throw error;
        return new Response(JSON.stringify(data), {
          status: data?.ok === false ? 400 : 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { data, error } = await supabase.rpc('rpc_auth_signin', {
        p_client_key: clientKey,
        p_username: username,
        p_auth_method: authMethod,
        p_credential: credential,
        p_biometric_id: null
      });
      if (error) throw error;
      return new Response(JSON.stringify(data), {
        status: data?.ok === false ? 400 : 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (action === 'connect_method') {
      const chosen = String(authMethod || '').toLowerCase();
      if (chosen === 'fingerprint' || chosen === 'faceid') {
        if (chosen === 'faceid' && body.biometricMode === 'camera_face') {
          const norm = normalizeFaceDescriptor(body.faceDescriptor);
          if (!norm) {
            return new Response(
              JSON.stringify({ ok: false, code: 'CREDENTIAL_INVALID', reason: 'Face ID scan required.' }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
          const { data, error } = await supabase.rpc('rpc_auth_connect_method', {
            p_client_key: clientKey,
            p_auth_method: chosen,
            p_credential: null,
            p_biometric_id: biometricCredentialId,
            p_public_key_spki: null,
            p_public_key_alg: -7,
            p_sign_count: 0,
            p_biometric_mode: 'camera_face',
            p_face_descriptor: norm
          });
          if (error) throw error;
          return new Response(JSON.stringify(data), {
            status: data?.ok === false ? 400 : 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        const att = body.webauthnAttestation;
        if (!att?.credentialId || !att?.publicKeySpki || !att?.authenticatorData) {
          return new Response(
            JSON.stringify({ ok: false, code: 'CREDENTIAL_INVALID', reason: 'Hardware biometric scan required.' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        const authData = fromBase64Url(String(att.authenticatorData));
        if (authData.length < 37 || (authData[32] & 0x05) !== 0x05) {
          return new Response(
            JSON.stringify({ ok: false, code: 'CREDENTIAL_INVALID', reason: 'Hardware user verification required.' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        const signCount =
          ((authData[33] << 24) >>> 0) + (authData[34] << 16) + (authData[35] << 8) + authData[36];
        const { data, error } = await supabase.rpc('rpc_auth_connect_method', {
          p_client_key: clientKey,
          p_auth_method: chosen,
          p_credential: null,
          p_biometric_id: String(att.credentialId),
          p_public_key_spki: String(att.publicKeySpki),
          p_public_key_alg: Number(att.publicKeyAlg || -7),
          p_sign_count: signCount,
          p_biometric_mode: 'webauthn',
          p_face_descriptor: null
        });
        if (error) throw error;
        return new Response(JSON.stringify(data), {
          status: data?.ok === false ? 400 : 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      const { data, error } = await supabase.rpc('rpc_auth_connect_method', {
        p_client_key: clientKey,
        p_auth_method: chosen,
        p_credential: credential,
        p_biometric_id: null,
        p_public_key_spki: null,
        p_public_key_alg: -7,
        p_sign_count: 0,
        p_biometric_mode: null,
        p_face_descriptor: null
      });
      if (error) throw error;
      return new Response(JSON.stringify(data), {
        status: data?.ok === false ? 400 : 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (action === 'disconnect_method') {
      const { data, error } = await supabase.rpc('rpc_auth_disconnect_method', {
        p_client_key: clientKey,
        p_auth_method: String(authMethod || '').toLowerCase()
      });
      if (error) throw error;
      return new Response(JSON.stringify(data), {
        status: data?.ok === false ? 400 : 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (action === 'signout') {
      const { data, error } = await supabase.rpc('rpc_auth_signout', { p_client_key: clientKey });
      if (error) throw error;
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (action === 'delete') {
      const { data, error } = await supabase.rpc('rpc_auth_delete_account', { p_client_key: clientKey });
      if (error) throw error;
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { data, error } = await supabase.rpc('rpc_auth_session_status', {
      p_client_key: clientKey
    });
    if (error) throw error;
    return new Response(JSON.stringify(data), {
      status: 200,
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
