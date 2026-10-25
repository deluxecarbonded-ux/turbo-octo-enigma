-- ============================================================================
-- EXOTIC — Hardware Biometric Authentication (WebAuthn Passkeys & Camera Face ID)
-- Migration: 20261025000006_webauthn_hardware_biometrics.sql
-- ============================================================================

alter table public.profile_credentials
  add column if not exists biometric_mode text,
  add column if not exists public_key_spki text,
  add column if not exists public_key_alg integer not null default -7,
  add column if not exists sign_count bigint not null default 0,
  add column if not exists face_descriptor double precision[];

-- Drop earlier overloads to keep PostgREST resolution unambiguous
drop function if exists public.rpc_auth_signup(text, text, text, text, text);
drop function if exists public.rpc_auth_signup(text, text, text, text, text, text, integer, bigint);
drop function if exists public.rpc_auth_signin_webauthn_verified(text, text, text, text, text, integer, bigint);

-- 1. Update rpc_check_username so client knows registered authMethod, biometricMode, & credentialId ahead of click
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
  v_cred public.profile_credentials;
  v_bound_cred public.profile_credentials;
  v_has_target boolean := false;
  v_has_bound boolean := false;
  v_has_cred boolean := false;
begin
  if v_ck <> '' then
    select * into v_bound from public.profiles where client_key = v_ck;
    v_has_bound := found;
    if v_has_bound then
      select * into v_bound_cred from public.profile_credentials where profile_id = v_bound.id;
    end if;
  end if;

  if v_u !~ '^[A-Za-z0-9_]{3,20}$' then
    return jsonb_build_object(
      'ok', true,
      'valid', false,
      'exists', false,
      'available', false,
      'hasBoundAccount', v_has_bound,
      'boundUsername', case when v_has_bound then v_bound.username else null end,
      'boundAuthMethod', case when v_has_bound then coalesce(v_bound_cred.auth_method, v_bound.auth_method, 'none') else null end,
      'signupMessage', 'Username is invalid',
      'signinMessage', 'Username is invalid'
    );
  end if;

  select * into v_target
  from public.profiles
  where lower(username) = lower(v_u);
  v_has_target := found;

  if v_has_target then
    select * into v_cred from public.profile_credentials where profile_id = v_target.id;
    v_has_cred := found;
  end if;

  return jsonb_build_object(
    'ok', true,
    'valid', true,
    'exists', v_has_target,
    'available', (not v_has_target),
    'canonicalUsername', case when v_has_target then v_target.username else v_u end,
    'authMethod', case when v_has_target then coalesce(v_cred.auth_method, v_target.auth_method, 'none') else null end,
    'biometricMode', case when v_has_cred then v_cred.biometric_mode else null end,
    'hasCredential', v_has_cred,
    'biometricCredentialId', case when v_has_cred then v_cred.biometric_credential_id else null end,
    'hasBoundAccount', v_has_bound,
    'boundUsername', case when v_has_bound then v_bound.username else null end,
    'boundAuthMethod', case when v_has_bound then coalesce(v_bound_cred.auth_method, v_bound.auth_method, 'none') else null end,
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

-- 2. Server-only lookup for cryptographic WebAuthn / Face ID verification
create or replace function public.rpc_get_webauthn_target(
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
  v_cred public.profile_credentials;
  v_has_target boolean := false;
  v_has_bound boolean := false;
  v_has_cred boolean := false;
begin
  if v_ck <> '' then
    select * into v_bound from public.profiles where client_key = v_ck;
    v_has_bound := found;
  end if;

  if v_u !~ '^[A-Za-z0-9_]{3,20}$' then
    return jsonb_build_object('ok', false, 'code', 'USERNAME_INVALID', 'reason', 'Username is invalid');
  end if;

  select * into v_target
  from public.profiles
  where lower(username) = lower(v_u);
  v_has_target := found;

  if not v_has_target then
    return jsonb_build_object('ok', false, 'code', 'USERNAME_NOT_REGISTERED', 'reason', 'Username is not registered');
  end if;

  if v_has_bound and v_bound.id <> v_target.id then
    return jsonb_build_object(
      'ok', false,
      'code', 'FORCED_BOUND_ACCOUNT',
      'boundUsername', v_bound.username,
      'reason', format('You are bound to %s until deleted in Settings.', v_bound.username)
    );
  end if;

  select * into v_cred
  from public.profile_credentials
  where profile_id = v_target.id;
  v_has_cred := found;

  return jsonb_build_object(
    'ok', true,
    'exists', true,
    'username', v_target.username,
    'authMethod', coalesce(v_cred.auth_method, v_target.auth_method, 'none'),
    'biometricMode', v_cred.biometric_mode,
    'hasCredential', v_has_cred,
    'biometricCredentialId', v_cred.biometric_credential_id,
    'publicKeySpki', v_cred.public_key_spki,
    'publicKeyAlg', coalesce(v_cred.public_key_alg, -7),
    'signCount', coalesce(v_cred.sign_count, 0),
    'faceDescriptor', to_jsonb(v_cred.face_descriptor)
  );
end;
$$;

-- 3. Sign Up RPC storing Password/PIN bcrypt OR Hardware WebAuthn Public Key OR Camera Face Descriptor
create or replace function public.rpc_auth_signup(
  p_client_key text,
  p_username text,
  p_auth_method text default 'password',
  p_credential text default null,
  p_biometric_id text default null,
  p_public_key_spki text default null,
  p_public_key_alg integer default -7,
  p_sign_count bigint default 0,
  p_biometric_mode text default null,
  p_face_descriptor double precision[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ck text := left(btrim(coalesce(p_client_key, '')), 96);
  v_u text := btrim(coalesce(p_username, ''));
  v_method text := lower(btrim(coalesce(p_auth_method, 'password')));
  v_secret text;
  v_bio_id text := nullif(left(btrim(coalesce(p_biometric_id, '')), 512), '');
  v_spki text := nullif(btrim(coalesce(p_public_key_spki, '')), '');
  v_bio_mode text := nullif(lower(btrim(coalesce(p_biometric_mode, ''))), '');
  v_existing public.profiles;
  v_profile public.profiles;
begin
  if v_ck = '' then
    return jsonb_build_object('ok', false, 'code', 'CLIENT_KEY_REQUIRED', 'reason', 'Session key required.');
  end if;

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
    return jsonb_build_object('ok', false, 'code', 'USERNAME_INVALID', 'reason', 'Username is invalid');
  end if;

  if exists(select 1 from public.profiles where lower(username) = lower(v_u)) then
    return jsonb_build_object('ok', false, 'code', 'USERNAME_TAKEN', 'reason', 'Username is taken');
  end if;

  if v_method not in ('password', 'pin', 'fingerprint', 'faceid') then
    return jsonb_build_object('ok', false, 'code', 'AUTH_METHOD_INVALID', 'reason', 'Choose Password, PIN, Fingerprint, or Face ID');
  end if;

  if v_method = 'password' then
    v_secret := coalesce(p_credential, '');
    if char_length(v_secret) < 4 or char_length(v_secret) > 64 then
      return jsonb_build_object('ok', false, 'code', 'CREDENTIAL_INVALID', 'reason', 'Password must be 4 to 64 characters');
    end if;
  elsif v_method = 'pin' then
    v_secret := btrim(coalesce(p_credential, ''));
    if v_secret !~ '^[0-9]{4,8}$' then
      return jsonb_build_object('ok', false, 'code', 'CREDENTIAL_INVALID', 'reason', 'PIN must be 4 to 8 digits');
    end if;
  elsif v_method = 'fingerprint' then
    if v_bio_id is null or v_spki is null then
      return jsonb_build_object('ok', false, 'code', 'CREDENTIAL_INVALID', 'reason', 'Hardware Fingerprint scan required');
    end if;
    v_bio_mode := 'webauthn';
    v_secret := 'WEBAUTHN:' || v_bio_id;
  elsif v_method = 'faceid' then
    if v_bio_mode = 'camera_face' then
      if p_face_descriptor is null or cardinality(p_face_descriptor) <> 128 then
        return jsonb_build_object('ok', false, 'code', 'CREDENTIAL_INVALID', 'reason', 'Face ID scan required');
      end if;
      v_bio_id := coalesce(v_bio_id, 'face_cam_' || encode(extensions.gen_random_bytes(8), 'hex'));
      v_secret := 'FACEID_CAM:' || v_bio_id;
    else
      if v_bio_id is null or v_spki is null then
        return jsonb_build_object('ok', false, 'code', 'CREDENTIAL_INVALID', 'reason', 'Hardware Face ID scan required');
      end if;
      v_bio_mode := 'webauthn';
      v_secret := 'WEBAUTHN:' || v_bio_id;
    end if;
  end if;

  insert into public.profiles (client_key, username, callsign, is_signed_in, auth_method)
  values (v_ck, v_u, v_u, true, v_method)
  returning * into v_profile;

  insert into public.profile_credentials (
    profile_id,
    auth_method,
    biometric_mode,
    credential_hash,
    biometric_credential_id,
    public_key_spki,
    public_key_alg,
    sign_count,
    face_descriptor
  )
  values (
    v_profile.id,
    v_method,
    v_bio_mode,
    extensions.crypt(v_secret, extensions.gen_salt('bf', 10)),
    case when v_method in ('fingerprint', 'faceid') then v_bio_id else null end,
    case when v_bio_mode = 'webauthn' then v_spki else null end,
    coalesce(p_public_key_alg, -7),
    greatest(0, coalesce(p_sign_count, 0)),
    case when v_bio_mode = 'camera_face' then p_face_descriptor else null end
  );

  return jsonb_build_object(
    'ok', true,
    'hasAccount', true,
    'signedIn', true,
    'username', v_profile.username,
    'authMethod', v_method,
    'biometricMode', v_bio_mode,
    'biometricCredentialId', case when v_method in ('fingerprint', 'faceid') then v_bio_id else null end,
    'profileId', v_profile.id,
    'snapshot', public.rpc_sync_runner_state(v_ck, null)
  );
end;
$$;

-- 4. Finalize Hardware-Verified Biometric Sign In (WebAuthn Passkey or Verified Face Descriptor)
create or replace function public.rpc_auth_signin_biometric_verified(
  p_client_key text,
  p_username text,
  p_auth_method text,
  p_biometric_mode text default 'webauthn',
  p_biometric_id text default null,
  p_public_key_spki text default null,
  p_public_key_alg integer default -7,
  p_sign_count bigint default 0,
  p_face_descriptor double precision[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ck text := left(btrim(coalesce(p_client_key, '')), 96);
  v_u text := btrim(coalesce(p_username, ''));
  v_method text := lower(btrim(coalesce(p_auth_method, 'fingerprint')));
  v_bio_mode text := lower(btrim(coalesce(p_biometric_mode, 'webauthn')));
  v_bio_id text := nullif(left(btrim(coalesce(p_biometric_id, '')), 512), '');
  v_spki text := nullif(btrim(coalesce(p_public_key_spki, '')), '');
  v_bound public.profiles;
  v_target public.profiles;
  v_cred public.profile_credentials;
begin
  if v_ck = '' then
    return jsonb_build_object('ok', false, 'code', 'CLIENT_KEY_REQUIRED', 'reason', 'Session key required.');
  end if;

  select * into v_target
  from public.profiles
  where lower(username) = lower(v_u)
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'USERNAME_NOT_REGISTERED', 'reason', 'Username is not registered');
  end if;

  select * into v_bound
  from public.profiles
  where client_key = v_ck
  for update;

  if found and v_bound.id <> v_target.id then
    return jsonb_build_object(
      'ok', false,
      'code', 'FORCED_BOUND_ACCOUNT',
      'boundUsername', v_bound.username,
      'reason', format('You are bound to %s until deleted in Settings.', v_bound.username)
    );
  end if;

  select * into v_cred
  from public.profile_credentials
  where profile_id = v_target.id
  for update;

  if found then
    if v_cred.auth_method <> v_method then
      return jsonb_build_object(
        'ok', false,
        'code', 'AUTH_METHOD_MISMATCH',
        'expectedMethod', v_cred.auth_method,
        'biometricMode', v_cred.biometric_mode,
        'biometricCredentialId', v_cred.biometric_credential_id,
        'reason', format('This account uses %s authentication', case v_cred.auth_method when 'faceid' then 'Face ID' when 'fingerprint' then 'Fingerprint' when 'pin' then 'PIN' else 'Password' end)
      );
    end if;

    update public.profile_credentials
    set
      sign_count = greatest(sign_count, coalesce(p_sign_count, sign_count)),
      updated_at = now()
    where profile_id = v_target.id;
  else
    insert into public.profile_credentials (
      profile_id, auth_method, biometric_mode, credential_hash,
      biometric_credential_id, public_key_spki, public_key_alg, sign_count, face_descriptor
    ) values (
      v_target.id,
      v_method,
      v_bio_mode,
      extensions.crypt('BIO:' || coalesce(v_bio_id, 'bio'), extensions.gen_salt('bf', 10)),
      coalesce(v_bio_id, 'bio_' || encode(extensions.gen_random_bytes(8), 'hex')),
      v_spki,
      coalesce(p_public_key_alg, -7),
      greatest(0, coalesce(p_sign_count, 0)),
      p_face_descriptor
    );
  end if;

  update public.profiles
  set
    client_key = v_ck,
    is_signed_in = true,
    auth_method = v_method,
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
    'authMethod', v_target.auth_method,
    'biometricMode', coalesce(v_cred.biometric_mode, v_bio_mode),
    'biometricCredentialId', coalesce(v_cred.biometric_credential_id, v_bio_id),
    'profileId', v_target.id,
    'snapshot', public.rpc_sync_runner_state(v_ck, null)
  );
end;
$$;

grant execute on function public.rpc_check_username(text, text) to anon, authenticated, service_role;
grant execute on function public.rpc_get_webauthn_target(text, text) to service_role;
grant execute on function public.rpc_auth_signup(text, text, text, text, text, text, integer, bigint, text, double precision[]) to anon, authenticated, service_role;
grant execute on function public.rpc_auth_signin_biometric_verified(text, text, text, text, text, text, integer, bigint, double precision[]) to service_role;
