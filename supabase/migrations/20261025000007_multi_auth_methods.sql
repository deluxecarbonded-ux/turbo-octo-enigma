-- ============================================================================
-- EXOTIC — Multi-Credential Account Methods (Sign-In Registered-Only + Settings Connect/Disconnect)
-- Migration: 20261025000007_multi_auth_methods.sql
-- ============================================================================

-- 1. Upgrade profile_credentials primary key from (profile_id) to (profile_id, auth_method)
--    so any runner can connect Password, PIN, Fingerprint (Touch ID), Face ID, or all four simultaneously.
do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.profile_credentials'::regclass
      and conname = 'profile_credentials_pkey'
  ) then
    alter table public.profile_credentials drop constraint profile_credentials_pkey;
  end if;
end;
$$;

alter table public.profile_credentials
  add constraint profile_credentials_pkey primary key (profile_id, auth_method);

create index if not exists idx_profile_credentials_profile_created
  on public.profile_credentials (profile_id, created_at asc);

-- 2. Helper returning all active authentication methods and biometric metadata for a profile
create or replace function public.get_profile_auth_summary(p_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_methods jsonb := '[]'::jsonb;
  v_bio_modes jsonb := '{}'::jsonb;
  v_bio_ids jsonb := '{}'::jsonb;
  v_primary text := null;
  v_fallback text := null;
  r record;
begin
  if p_profile_id is null then
    return jsonb_build_object(
      'authMethods', '[]'::jsonb,
      'primaryMethod', null,
      'biometricModes', '{}'::jsonb,
      'biometricCredentialIds', '{}'::jsonb
    );
  end if;

  for r in
    select auth_method, biometric_mode, biometric_credential_id
    from public.profile_credentials
    where profile_id = p_profile_id
    order by created_at asc,
      case auth_method
        when 'password' then 1
        when 'pin' then 2
        when 'fingerprint' then 3
        when 'faceid' then 4
        else 5
      end asc
  loop
    if v_primary is null then
      v_primary := r.auth_method;
    end if;
    v_methods := v_methods || to_jsonb(r.auth_method);
    if r.biometric_mode is not null then
      v_bio_modes := v_bio_modes || jsonb_build_object(r.auth_method, r.biometric_mode);
    end if;
    if r.biometric_credential_id is not null then
      v_bio_ids := v_bio_ids || jsonb_build_object(r.auth_method, r.biometric_credential_id);
    end if;
  end loop;

  if jsonb_array_length(v_methods) = 0 then
    select auth_method into v_fallback from public.profiles where id = p_profile_id;
    if v_fallback in ('password', 'pin', 'fingerprint', 'faceid') then
      v_primary := v_fallback;
      v_methods := jsonb_build_array(v_fallback);
    end if;
  end if;

  return jsonb_build_object(
    'authMethods', v_methods,
    'primaryMethod', v_primary,
    'biometricModes', v_bio_modes,
    'biometricCredentialIds', v_bio_ids
  );
end;
$$;

-- 3. Session Status RPC returning all connected authMethods
create or replace function public.rpc_auth_session_status(p_client_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
  v_summary jsonb;
  v_primary text;
  v_ck text := left(btrim(coalesce(p_client_key, '')), 96);
begin
  if v_ck = '' then
    return jsonb_build_object(
      'ok', true,
      'hasAccount', false,
      'signedIn', false,
      'username', null,
      'authMethod', null,
      'authMethods', '[]'::jsonb,
      'biometricModes', '{}'::jsonb,
      'biometricCredentialIds', '{}'::jsonb,
      'biometricCredentialId', null,
      'snapshot', null
    );
  end if;

  select * into v_profile
  from public.profiles
  where client_key = v_ck;

  if not found then
    return jsonb_build_object(
      'ok', true,
      'hasAccount', false,
      'signedIn', false,
      'username', null,
      'authMethod', null,
      'authMethods', '[]'::jsonb,
      'biometricModes', '{}'::jsonb,
      'biometricCredentialIds', '{}'::jsonb,
      'biometricCredentialId', null,
      'snapshot', null
    );
  end if;

  v_summary := public.get_profile_auth_summary(v_profile.id);
  v_primary := coalesce(v_summary->>'primaryMethod', v_profile.auth_method, 'none');

  return jsonb_build_object(
    'ok', true,
    'hasAccount', true,
    'signedIn', v_profile.is_signed_in,
    'username', v_profile.username,
    'authMethod', v_primary,
    'authMethods', coalesce(v_summary->'authMethods', '[]'::jsonb),
    'biometricModes', coalesce(v_summary->'biometricModes', '{}'::jsonb),
    'biometricCredentialIds', coalesce(v_summary->'biometricCredentialIds', '{}'::jsonb),
    'biometricMode', (v_summary->'biometricModes')->>v_primary,
    'biometricCredentialId', (v_summary->'biometricCredentialIds')->>v_primary,
    'profileId', v_profile.id,
    'snapshot', case when v_profile.is_signed_in then public.rpc_sync_runner_state(v_ck, null) else null end
  );
end;
$$;

-- 4. Username Check RPC returning exact registered/connected authMethods for Sign In
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
  v_target_summary jsonb := null;
  v_bound_summary jsonb := null;
  v_target_primary text := null;
  v_bound_primary text := null;
  v_has_target boolean := false;
  v_has_bound boolean := false;
begin
  if v_ck <> '' then
    select * into v_bound from public.profiles where client_key = v_ck;
    v_has_bound := found;
    if v_has_bound then
      v_bound_summary := public.get_profile_auth_summary(v_bound.id);
      v_bound_primary := coalesce(v_bound_summary->>'primaryMethod', v_bound.auth_method, 'none');
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
      'boundAuthMethod', v_bound_primary,
      'boundAuthMethods', case when v_has_bound then coalesce(v_bound_summary->'authMethods', '[]'::jsonb) else '[]'::jsonb end,
      'boundBiometricModes', case when v_has_bound then coalesce(v_bound_summary->'biometricModes', '{}'::jsonb) else '{}'::jsonb end,
      'boundBiometricCredentialIds', case when v_has_bound then coalesce(v_bound_summary->'biometricCredentialIds', '{}'::jsonb) else '{}'::jsonb end,
      'signupMessage', 'Username is invalid',
      'signinMessage', 'Username is invalid'
    );
  end if;

  select * into v_target
  from public.profiles
  where lower(username) = lower(v_u);
  v_has_target := found;

  if v_has_target then
    v_target_summary := public.get_profile_auth_summary(v_target.id);
    v_target_primary := coalesce(v_target_summary->>'primaryMethod', v_target.auth_method, 'none');
  end if;

  return jsonb_build_object(
    'ok', true,
    'valid', true,
    'exists', v_has_target,
    'available', (not v_has_target),
    'canonicalUsername', case when v_has_target then v_target.username else v_u end,
    'authMethod', v_target_primary,
    'authMethods', case when v_has_target then coalesce(v_target_summary->'authMethods', '[]'::jsonb) else '[]'::jsonb end,
    'biometricModes', case when v_has_target then coalesce(v_target_summary->'biometricModes', '{}'::jsonb) else '{}'::jsonb end,
    'biometricCredentialIds', case when v_has_target then coalesce(v_target_summary->'biometricCredentialIds', '{}'::jsonb) else '{}'::jsonb end,
    'biometricMode', case when v_has_target then (v_target_summary->'biometricModes')->>v_target_primary else null end,
    'biometricCredentialId', case when v_has_target then (v_target_summary->'biometricCredentialIds')->>v_target_primary else null end,
    'hasCredential', case when v_has_target then jsonb_array_length(coalesce(v_target_summary->'authMethods', '[]'::jsonb)) > 0 else false end,
    'hasBoundAccount', v_has_bound,
    'boundUsername', case when v_has_bound then v_bound.username else null end,
    'boundAuthMethod', v_bound_primary,
    'boundAuthMethods', case when v_has_bound then coalesce(v_bound_summary->'authMethods', '[]'::jsonb) else '[]'::jsonb end,
    'boundBiometricModes', case when v_has_bound then coalesce(v_bound_summary->'biometricModes', '{}'::jsonb) else '{}'::jsonb end,
    'boundBiometricCredentialIds', case when v_has_bound then coalesce(v_bound_summary->'biometricCredentialIds', '{}'::jsonb) else '{}'::jsonb end,
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

-- 5. Server-only lookup for cryptographic WebAuthn / Face ID verification per requested method
drop function if exists public.rpc_get_webauthn_target(text, text);

create or replace function public.rpc_get_webauthn_target(
  p_username text,
  p_client_key text default null,
  p_auth_method text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_u text := btrim(coalesce(p_username, ''));
  v_ck text := left(btrim(coalesce(p_client_key, '')), 96);
  v_req_method text := nullif(lower(btrim(coalesce(p_auth_method, ''))), '');
  v_target public.profiles;
  v_bound public.profiles;
  v_cred public.profile_credentials;
  v_summary jsonb;
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

  v_summary := public.get_profile_auth_summary(v_target.id);

  if v_req_method is not null then
    select * into v_cred
    from public.profile_credentials
    where profile_id = v_target.id
      and auth_method = v_req_method;
    v_has_cred := found;
  else
    select * into v_cred
    from public.profile_credentials
    where profile_id = v_target.id
    order by
      case when auth_method in ('fingerprint', 'faceid') then 0 else 1 end asc,
      created_at asc
    limit 1;
    v_has_cred := found;
  end if;

  return jsonb_build_object(
    'ok', true,
    'exists', true,
    'username', v_target.username,
    'authMethod', coalesce(v_cred.auth_method, v_summary->>'primaryMethod', v_target.auth_method, 'none'),
    'authMethods', coalesce(v_summary->'authMethods', '[]'::jsonb),
    'biometricModes', coalesce(v_summary->'biometricModes', '{}'::jsonb),
    'biometricCredentialIds', coalesce(v_summary->'biometricCredentialIds', '{}'::jsonb),
    'biometricMode', case when v_has_cred then v_cred.biometric_mode else null end,
    'hasCredential', v_has_cred,
    'biometricCredentialId', case when v_has_cred then v_cred.biometric_credential_id else null end,
    'publicKeySpki', case when v_has_cred then v_cred.public_key_spki else null end,
    'publicKeyAlg', case when v_has_cred then coalesce(v_cred.public_key_alg, -7) else -7 end,
    'signCount', case when v_has_cred then coalesce(v_cred.sign_count, 0) else 0 end,
    'faceDescriptor', case when v_has_cred then to_jsonb(v_cred.face_descriptor) else null end
  );
end;
$$;

-- 6. Sign Up RPC storing initial method and returning authMethods array
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
  v_summary jsonb;
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

  v_summary := public.get_profile_auth_summary(v_profile.id);

  return jsonb_build_object(
    'ok', true,
    'hasAccount', true,
    'signedIn', true,
    'username', v_profile.username,
    'authMethod', v_method,
    'authMethods', coalesce(v_summary->'authMethods', jsonb_build_array(v_method)),
    'biometricModes', coalesce(v_summary->'biometricModes', '{}'::jsonb),
    'biometricCredentialIds', coalesce(v_summary->'biometricCredentialIds', '{}'::jsonb),
    'biometricMode', v_bio_mode,
    'biometricCredentialId', case when v_method in ('fingerprint', 'faceid') then v_bio_id else null end,
    'profileId', v_profile.id,
    'snapshot', public.rpc_sync_runner_state(v_ck, null)
  );
end;
$$;

-- 7. Password / PIN Sign In RPC checking the requested method row among connected methods
create or replace function public.rpc_auth_signin(
  p_client_key text,
  p_username text,
  p_auth_method text default null,
  p_credential text default null,
  p_biometric_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ck text := left(btrim(coalesce(p_client_key, '')), 96);
  v_u text := btrim(coalesce(p_username, ''));
  v_method text := lower(btrim(coalesce(p_auth_method, '')));
  v_secret text;
  v_bound public.profiles;
  v_target public.profiles;
  v_cred public.profile_credentials;
  v_summary jsonb;
  v_primary text;
begin
  if v_ck = '' then
    return jsonb_build_object('ok', false, 'code', 'CLIENT_KEY_REQUIRED', 'reason', 'Session key required.');
  end if;

  if v_u !~ '^[A-Za-z0-9_]{3,20}$' then
    return jsonb_build_object('ok', false, 'code', 'USERNAME_INVALID', 'reason', 'Username is invalid');
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

  v_summary := public.get_profile_auth_summary(v_target.id);
  v_primary := coalesce(v_summary->>'primaryMethod', v_target.auth_method, 'password');

  if v_method = '' then
    v_method := v_primary;
  end if;

  if v_method in ('fingerprint', 'faceid') then
    return jsonb_build_object(
      'ok', false,
      'code', 'BIOMETRIC_VERIFICATION_REQUIRED',
      'expectedMethod', v_method,
      'expectedMethods', coalesce(v_summary->'authMethods', '[]'::jsonb),
      'reason', 'Hardware biometric verification required'
    );
  end if;

  select * into v_cred
  from public.profile_credentials
  where profile_id = v_target.id
    and auth_method = v_method
  for update;

  if not found then
    -- If legacy account has zero rows in profile_credentials, enroll on first sign-in
    if jsonb_array_length(coalesce(v_summary->'authMethods', '[]'::jsonb)) = 0
       or not exists (select 1 from public.profile_credentials where profile_id = v_target.id) then
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
      else
        return jsonb_build_object('ok', false, 'code', 'AUTH_METHOD_INVALID', 'reason', 'Choose a registered sign-in method');
      end if;

      insert into public.profile_credentials (profile_id, auth_method, credential_hash)
      values (v_target.id, v_method, extensions.crypt(v_secret, extensions.gen_salt('bf', 10)));
      v_summary := public.get_profile_auth_summary(v_target.id);
    else
      return jsonb_build_object(
        'ok', false,
        'code', 'AUTH_METHOD_MISMATCH',
        'expectedMethod', v_primary,
        'expectedMethods', coalesce(v_summary->'authMethods', '[]'::jsonb),
        'biometricModes', coalesce(v_summary->'biometricModes', '{}'::jsonb),
        'biometricCredentialIds', coalesce(v_summary->'biometricCredentialIds', '{}'::jsonb),
        'reason', 'That authentication method is not active on this account'
      );
    end if;
  else
    if v_method = 'password' then
      v_secret := coalesce(p_credential, '');
    else
      v_secret := btrim(coalesce(p_credential, ''));
    end if;

    if v_secret = '' or extensions.crypt(v_secret, v_cred.credential_hash) <> v_cred.credential_hash then
      return jsonb_build_object(
        'ok', false,
        'code', 'INVALID_CREDENTIAL',
        'expectedMethod', v_method,
        'expectedMethods', coalesce(v_summary->'authMethods', '[]'::jsonb),
        'reason', case when v_method = 'pin' then 'Incorrect PIN' else 'Incorrect password' end
      );
    end if;
  end if;

  update public.profiles
  set
    client_key = v_ck,
    is_signed_in = true,
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
    'authMethod', coalesce(v_summary->>'primaryMethod', v_method),
    'usedAuthMethod', v_method,
    'authMethods', coalesce(v_summary->'authMethods', '[]'::jsonb),
    'biometricModes', coalesce(v_summary->'biometricModes', '{}'::jsonb),
    'biometricCredentialIds', coalesce(v_summary->'biometricCredentialIds', '{}'::jsonb),
    'profileId', v_target.id,
    'snapshot', public.rpc_sync_runner_state(v_ck, null)
  );
end;
$$;

-- 8. Biometric Sign In RPC checking the specific (profile_id, p_auth_method) row
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
  v_bound public.profiles;
  v_target public.profiles;
  v_cred public.profile_credentials;
  v_summary jsonb;
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

  v_summary := public.get_profile_auth_summary(v_target.id);

  select * into v_cred
  from public.profile_credentials
  where profile_id = v_target.id
    and auth_method = v_method
  for update;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'code', 'AUTH_METHOD_MISMATCH',
      'expectedMethod', v_summary->>'primaryMethod',
      'expectedMethods', coalesce(v_summary->'authMethods', '[]'::jsonb),
      'biometricModes', coalesce(v_summary->'biometricModes', '{}'::jsonb),
      'biometricCredentialIds', coalesce(v_summary->'biometricCredentialIds', '{}'::jsonb),
      'reason', 'That biometric method is not active on this account'
    );
  end if;

  update public.profile_credentials
  set
    sign_count = greatest(sign_count, coalesce(p_sign_count, sign_count)),
    updated_at = now()
  where profile_id = v_target.id
    and auth_method = v_method;

  update public.profiles
  set
    client_key = v_ck,
    is_signed_in = true,
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
    'authMethod', coalesce(v_summary->>'primaryMethod', v_method),
    'usedAuthMethod', v_method,
    'authMethods', coalesce(v_summary->'authMethods', '[]'::jsonb),
    'biometricModes', coalesce(v_summary->'biometricModes', '{}'::jsonb),
    'biometricCredentialIds', coalesce(v_summary->'biometricCredentialIds', '{}'::jsonb),
    'biometricMode', coalesce(v_cred.biometric_mode, v_bio_mode),
    'biometricCredentialId', coalesce(v_cred.biometric_credential_id, v_bio_id),
    'profileId', v_target.id,
    'snapshot', public.rpc_sync_runner_state(v_ck, null)
  );
end;
$$;

-- 9. Settings RPC: Connect (Add or Update) an Authentication Method on Signed-In Account
create or replace function public.rpc_auth_connect_method(
  p_client_key text,
  p_auth_method text,
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
  v_method text := lower(btrim(coalesce(p_auth_method, '')));
  v_secret text;
  v_bio_id text := nullif(left(btrim(coalesce(p_biometric_id, '')), 512), '');
  v_spki text := nullif(btrim(coalesce(p_public_key_spki, '')), '');
  v_bio_mode text := nullif(lower(btrim(coalesce(p_biometric_mode, ''))), '');
  v_profile public.profiles;
  v_summary jsonb;
begin
  if v_ck = '' then
    return jsonb_build_object('ok', false, 'code', 'CLIENT_KEY_REQUIRED', 'reason', 'Session key required.');
  end if;

  select * into v_profile
  from public.profiles
  where client_key = v_ck
  for update;

  if not found or not v_profile.is_signed_in then
    return jsonb_build_object('ok', false, 'code', 'NOT_SIGNED_IN', 'reason', 'Sign in first to manage authentication methods.');
  end if;

  if v_method not in ('password', 'pin', 'fingerprint', 'faceid') then
    return jsonb_build_object('ok', false, 'code', 'AUTH_METHOD_INVALID', 'reason', 'Choose Password, PIN, Fingerprint, or Face ID.');
  end if;

  if v_method = 'password' then
    v_secret := coalesce(p_credential, '');
    if char_length(v_secret) < 4 or char_length(v_secret) > 64 then
      return jsonb_build_object('ok', false, 'code', 'CREDENTIAL_INVALID', 'reason', 'Password must be 4 to 64 characters.');
    end if;
    v_bio_mode := null;
  elsif v_method = 'pin' then
    v_secret := btrim(coalesce(p_credential, ''));
    if v_secret !~ '^[0-9]{4,8}$' then
      return jsonb_build_object('ok', false, 'code', 'CREDENTIAL_INVALID', 'reason', 'PIN must be 4 to 8 digits.');
    end if;
    v_bio_mode := null;
  elsif v_method = 'fingerprint' then
    if v_bio_id is null or v_spki is null then
      return jsonb_build_object('ok', false, 'code', 'CREDENTIAL_INVALID', 'reason', 'Hardware Fingerprint scan required.');
    end if;
    v_bio_mode := 'webauthn';
    v_secret := 'WEBAUTHN:' || v_bio_id;
  elsif v_method = 'faceid' then
    if v_bio_mode = 'camera_face' then
      if p_face_descriptor is null or cardinality(p_face_descriptor) <> 128 then
        return jsonb_build_object('ok', false, 'code', 'CREDENTIAL_INVALID', 'reason', 'Face ID scan required.');
      end if;
      v_bio_id := coalesce(v_bio_id, 'face_cam_' || encode(extensions.gen_random_bytes(8), 'hex'));
      v_secret := 'FACEID_CAM:' || v_bio_id;
    else
      if v_bio_id is null or v_spki is null then
        return jsonb_build_object('ok', false, 'code', 'CREDENTIAL_INVALID', 'reason', 'Hardware Face ID scan required.');
      end if;
      v_bio_mode := 'webauthn';
      v_secret := 'WEBAUTHN:' || v_bio_id;
    end if;
  end if;

  insert into public.profile_credentials (
    profile_id,
    auth_method,
    biometric_mode,
    credential_hash,
    biometric_credential_id,
    public_key_spki,
    public_key_alg,
    sign_count,
    face_descriptor,
    updated_at
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
    case when v_bio_mode = 'camera_face' then p_face_descriptor else null end,
    now()
  )
  on conflict (profile_id, auth_method) do update set
    biometric_mode = excluded.biometric_mode,
    credential_hash = excluded.credential_hash,
    biometric_credential_id = excluded.biometric_credential_id,
    public_key_spki = excluded.public_key_spki,
    public_key_alg = excluded.public_key_alg,
    sign_count = excluded.sign_count,
    face_descriptor = excluded.face_descriptor,
    updated_at = now();

  v_summary := public.get_profile_auth_summary(v_profile.id);

  update public.profiles
  set
    auth_method = coalesce(v_summary->>'primaryMethod', v_method),
    updated_at = now()
  where id = v_profile.id;

  return jsonb_build_object(
    'ok', true,
    'connectedMethod', v_method,
    'username', v_profile.username,
    'authMethod', coalesce(v_summary->>'primaryMethod', v_method),
    'authMethods', coalesce(v_summary->'authMethods', '[]'::jsonb),
    'biometricModes', coalesce(v_summary->'biometricModes', '{}'::jsonb),
    'biometricCredentialIds', coalesce(v_summary->'biometricCredentialIds', '{}'::jsonb)
  );
end;
$$;

-- 10. Settings RPC: Disconnect an Authentication Method (preventing lockout of the last remaining method)
create or replace function public.rpc_auth_disconnect_method(
  p_client_key text,
  p_auth_method text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ck text := left(btrim(coalesce(p_client_key, '')), 96);
  v_method text := lower(btrim(coalesce(p_auth_method, '')));
  v_profile public.profiles;
  v_count integer := 0;
  v_summary jsonb;
begin
  if v_ck = '' then
    return jsonb_build_object('ok', false, 'code', 'CLIENT_KEY_REQUIRED', 'reason', 'Session key required.');
  end if;

  select * into v_profile
  from public.profiles
  where client_key = v_ck
  for update;

  if not found or not v_profile.is_signed_in then
    return jsonb_build_object('ok', false, 'code', 'NOT_SIGNED_IN', 'reason', 'Sign in first to manage authentication methods.');
  end if;

  if not exists (
    select 1
    from public.profile_credentials
    where profile_id = v_profile.id
      and auth_method = v_method
  ) then
    return jsonb_build_object('ok', false, 'code', 'METHOD_NOT_ACTIVE', 'reason', 'That authentication method is not active.');
  end if;

  select count(*)::int into v_count
  from public.profile_credentials
  where profile_id = v_profile.id;

  if v_count <= 1 then
    return jsonb_build_object(
      'ok', false,
      'code', 'LAST_METHOD',
      'reason', 'Keep at least one sign-in method active. Connect another method first.'
    );
  end if;

  delete from public.profile_credentials
  where profile_id = v_profile.id
    and auth_method = v_method;

  v_summary := public.get_profile_auth_summary(v_profile.id);

  update public.profiles
  set
    auth_method = coalesce(v_summary->>'primaryMethod', 'password'),
    updated_at = now()
  where id = v_profile.id;

  return jsonb_build_object(
    'ok', true,
    'disconnectedMethod', v_method,
    'username', v_profile.username,
    'authMethod', coalesce(v_summary->>'primaryMethod', 'password'),
    'authMethods', coalesce(v_summary->'authMethods', '[]'::jsonb),
    'biometricModes', coalesce(v_summary->'biometricModes', '{}'::jsonb),
    'biometricCredentialIds', coalesce(v_summary->'biometricCredentialIds', '{}'::jsonb)
  );
end;
$$;

-- 11. Sign Out RPC returning full authMethods summary so bound Sign In knows exact enabled methods
create or replace function public.rpc_auth_signout(p_client_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ck text := left(btrim(coalesce(p_client_key, '')), 96);
  v_profile public.profiles;
  v_summary jsonb;
begin
  if v_ck = '' then
    return jsonb_build_object('ok', true, 'signedIn', false, 'hasAccount', false);
  end if;

  update public.profiles
  set
    is_signed_in = false,
    updated_at = now()
  where client_key = v_ck
  returning * into v_profile;

  if not found then
    return jsonb_build_object('ok', true, 'signedIn', false, 'hasAccount', false);
  end if;

  v_summary := public.get_profile_auth_summary(v_profile.id);

  return jsonb_build_object(
    'ok', true,
    'hasAccount', true,
    'signedIn', false,
    'username', v_profile.username,
    'authMethod', coalesce(v_summary->>'primaryMethod', v_profile.auth_method, 'none'),
    'authMethods', coalesce(v_summary->'authMethods', '[]'::jsonb),
    'biometricModes', coalesce(v_summary->'biometricModes', '{}'::jsonb),
    'biometricCredentialIds', coalesce(v_summary->'biometricCredentialIds', '{}'::jsonb)
  );
end;
$$;

grant execute on function public.get_profile_auth_summary(uuid) to anon, authenticated, service_role;
grant execute on function public.rpc_auth_session_status(text) to anon, authenticated, service_role;
grant execute on function public.rpc_check_username(text, text) to anon, authenticated, service_role;
grant execute on function public.rpc_get_webauthn_target(text, text, text) to service_role;
grant execute on function public.rpc_auth_signup(text, text, text, text, text, text, integer, bigint, text, double precision[]) to anon, authenticated, service_role;
grant execute on function public.rpc_auth_signin(text, text, text, text, text) to anon, authenticated, service_role;
grant execute on function public.rpc_auth_signin_biometric_verified(text, text, text, text, text, text, integer, bigint, double precision[]) to service_role;
grant execute on function public.rpc_auth_connect_method(text, text, text, text, text, integer, bigint, text, double precision[]) to anon, authenticated, service_role;
grant execute on function public.rpc_auth_disconnect_method(text, text) to anon, authenticated, service_role;
grant execute on function public.rpc_auth_signout(text) to anon, authenticated, service_role;
