-- ============================================================================
-- EXOTIC — Guest Users Migration
-- 1. Adds is_guest flag on public.profiles (persisted in Supabase with zero
--    passwords and zero auth methods).
-- 2. Adds auto-generated unique Guest username generator & Guest sign-up RPC
--    bound to client_key until deleted from Settings.
-- 3. Adds Guest username rename RPC with [username is available / username is taken]
--    validation and updates rpc_check_username / rpc_auth_signin /
--    rpc_auth_session_status / rpc_auth_signout.
-- 4. Enforces Guest limits in Postgres: Stages 01–03 cap, curated Shop subset,
--    no auth methods, and Leaderboards + Achievements disabled for Guests.
-- ============================================================================

alter table public.profiles
  add column if not exists is_guest boolean not null default false;

create or replace function public.is_guest_allowed_item(p_item_id text)
returns boolean
language sql
immutable
as $$
  select coalesce(p_item_id, '') = any(array[
    'aura_none',
    'char_classic',
    'char_mickey',
    'char_stickman',
    'skin_solid',
    'trail_none',
    'emote_salute',
    'char_cat',
    'char_bunny',
    'skin_inverted',
    'skin_steamboat',
    'aura_sparkle',
    'trail_dust',
    'emote_clap',
    'upg_coyote',
    'upg_magnet'
  ]::text[]);
$$;

create or replace function public.generate_unique_guest_username()
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_candidate text;
  v_tries integer := 0;
begin
  loop
    v_tries := v_tries + 1;
    v_candidate := 'guest_' || lower(substr(encode(extensions.gen_random_bytes(4), 'hex'), 1, 6));
    exit when not exists (
      select 1 from public.profiles where lower(username) = lower(v_candidate)
    ) or v_tries >= 25;
  end loop;
  return v_candidate;
end;
$$;

create or replace function public.rpc_generate_guest_username()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_u text := public.generate_unique_guest_username();
begin
  return jsonb_build_object(
    'ok', true,
    'username', v_u,
    'available', true,
    'signupMessage', 'username is available'
  );
end;
$$;

-- 1. Session status (includes isGuest)
create or replace function public.rpc_auth_session_status(p_client_key text)
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
    return jsonb_build_object(
      'ok', true,
      'hasAccount', false,
      'signedIn', false,
      'isGuest', false,
      'username', null,
      'authMethod', 'none',
      'authMethods', '[]'::jsonb,
      'biometricModes', '{}'::jsonb,
      'biometricCredentialIds', '{}'::jsonb
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
      'isGuest', false,
      'username', null,
      'authMethod', 'none',
      'authMethods', '[]'::jsonb,
      'biometricModes', '{}'::jsonb,
      'biometricCredentialIds', '{}'::jsonb
    );
  end if;

  if v_profile.is_guest then
    return jsonb_build_object(
      'ok', true,
      'hasAccount', true,
      'signedIn', v_profile.is_signed_in,
      'isGuest', true,
      'username', v_profile.username,
      'authMethod', 'none',
      'authMethods', '[]'::jsonb,
      'biometricMode', null,
      'biometricCredentialId', null,
      'biometricModes', '{}'::jsonb,
      'biometricCredentialIds', '{}'::jsonb,
      'profileId', v_profile.id,
      'snapshot', case when v_profile.is_signed_in then public.rpc_sync_runner_state(v_ck, null) else null end
    );
  end if;

  v_summary := public.get_profile_auth_methods_summary(v_profile.id);

  return jsonb_build_object(
    'ok', true,
    'hasAccount', true,
    'signedIn', v_profile.is_signed_in,
    'isGuest', false,
    'username', v_profile.username,
    'authMethod', coalesce(v_summary->>'primaryMethod', v_profile.auth_method),
    'authMethods', coalesce(v_summary->'authMethods', '[]'::jsonb),
    'biometricMode', v_summary->>'primaryBiometricMode',
    'biometricCredentialId', v_summary->>'primaryBiometricCredentialId',
    'biometricModes', coalesce(v_summary->'biometricModes', '{}'::jsonb),
    'biometricCredentialIds', coalesce(v_summary->'biometricCredentialIds', '{}'::jsonb),
    'profileId', v_profile.id,
    'snapshot', case when v_profile.is_signed_in then public.rpc_sync_runner_state(v_ck, null) else null end
  );
end;
$$;

-- 2. Check username (supports Sign Up, Sign In, and Guest username change validation)
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
  v_valid boolean;
  v_target public.profiles;
  v_bound public.profiles;
  v_has_target boolean := false;
  v_has_bound boolean := false;
  v_summary jsonb;
begin
  v_valid := (v_u ~ '^[A-Za-z0-9_]{3,20}$');

  if v_ck <> '' then
    select * into v_bound from public.profiles where client_key = v_ck;
    v_has_bound := found;
  end if;

  if not v_valid then
    return jsonb_build_object(
      'ok', true,
      'valid', false,
      'available', false,
      'taken', false,
      'exists', false,
      'isGuest', false,
      'authMethod', null,
      'authMethods', '[]'::jsonb,
      'biometricModes', '{}'::jsonb,
      'biometricCredentialIds', '{}'::jsonb,
      'boundUsername', case when v_has_bound then v_bound.username else null end,
      'boundIsGuest', case when v_has_bound then v_bound.is_guest else false end,
      'signupMessage', 'username is invalid',
      'signinMessage', 'username is invalid'
    );
  end if;

  select * into v_target
  from public.profiles
  where lower(username) = lower(v_u)
  limit 1;
  v_has_target := found;

  if v_has_target and not v_target.is_guest then
    v_summary := public.get_profile_auth_methods_summary(v_target.id);
  else
    v_summary := null;
  end if;

  return jsonb_build_object(
    'ok', true,
    'valid', true,
    'available', (not v_has_target),
    'taken', v_has_target,
    'exists', v_has_target,
    'isGuest', case when v_has_target then v_target.is_guest else false end,
    'canonicalUsername', case when v_has_target then v_target.username else v_u end,
    'authMethod', case
      when not v_has_target then null
      when v_target.is_guest then 'none'
      else coalesce(v_summary->>'primaryMethod', v_target.auth_method)
    end,
    'authMethods', case
      when not v_has_target or v_target.is_guest then '[]'::jsonb
      else coalesce(v_summary->'authMethods', '[]'::jsonb)
    end,
    'biometricMode', case when v_has_target and not v_target.is_guest then v_summary->>'primaryBiometricMode' else null end,
    'biometricCredentialId', case when v_has_target and not v_target.is_guest then v_summary->>'primaryBiometricCredentialId' else null end,
    'biometricModes', case when v_has_target and not v_target.is_guest then coalesce(v_summary->'biometricModes', '{}'::jsonb) else '{}'::jsonb end,
    'biometricCredentialIds', case when v_has_target and not v_target.is_guest then coalesce(v_summary->'biometricCredentialIds', '{}'::jsonb) else '{}'::jsonb end,
    'boundUsername', case when v_has_bound then v_bound.username else null end,
    'boundIsGuest', case when v_has_bound then v_bound.is_guest else false end,
    'matchesBound', case when v_has_bound and v_has_target then (v_bound.id = v_target.id) else false end,
    'signupMessage', case when v_has_target then 'username is taken' else 'username is available' end,
    'signinMessage', case when v_has_target then 'username is registered' else 'username is not registered' end
  );
end;
$$;

-- 3. Register Guest User (auto-generated or custom changeable username, no password, no auth methods)
create or replace function public.rpc_auth_guest_signup(
  p_client_key text,
  p_username text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_ck text := left(btrim(coalesce(p_client_key, '')), 96);
  v_u text := btrim(coalesce(p_username, ''));
  v_existing public.profiles;
  v_taken boolean;
  v_profile public.profiles;
begin
  if v_ck = '' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_CLIENT', 'reason', 'Missing client session key.');
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
      'boundIsGuest', v_existing.is_guest,
      'reason', format('Already registered as %s. Delete this account in Settings before registering again.', v_existing.username)
    );
  end if;

  if v_u = '' then
    v_u := public.generate_unique_guest_username();
  end if;

  if v_u !~ '^[A-Za-z0-9_]{3,20}$' then
    return jsonb_build_object('ok', false, 'code', 'USERNAME_INVALID', 'reason', 'username is invalid');
  end if;

  select exists(
    select 1 from public.profiles where lower(username) = lower(v_u)
  ) into v_taken;

  if v_taken then
    return jsonb_build_object('ok', false, 'code', 'USERNAME_TAKEN', 'reason', 'username is taken');
  end if;

  insert into public.profiles (client_key, username, callsign, is_signed_in, auth_method, is_guest)
  values (v_ck, v_u, v_u, true, 'none', true)
  returning * into v_profile;

  return jsonb_build_object(
    'ok', true,
    'hasAccount', true,
    'signedIn', true,
    'isGuest', true,
    'username', v_profile.username,
    'authMethod', 'none',
    'authMethods', '[]'::jsonb,
    'biometricModes', '{}'::jsonb,
    'biometricCredentialIds', '{}'::jsonb,
    'profileId', v_profile.id,
    'snapshot', public.rpc_sync_runner_state(v_ck, null)
  );
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'USERNAME_TAKEN', 'reason', 'username is taken');
end;
$$;

-- 4. Rename Guest Username (persisted in Supabase with [username is available / username is taken])
create or replace function public.rpc_auth_rename_guest(
  p_client_key text,
  p_new_username text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ck text := left(btrim(coalesce(p_client_key, '')), 96);
  v_u text := btrim(coalesce(p_new_username, ''));
  v_profile public.profiles;
  v_taken boolean;
begin
  if v_ck = '' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_CLIENT', 'reason', 'Missing client session key.');
  end if;

  select * into v_profile
  from public.profiles
  where client_key = v_ck and is_signed_in = true
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_SIGNED_IN', 'reason', 'Sign in first.');
  end if;

  if not v_profile.is_guest then
    return jsonb_build_object('ok', false, 'code', 'NOT_GUEST', 'reason', 'Only Guest usernames can be changed.');
  end if;

  if v_u !~ '^[A-Za-z0-9_]{3,20}$' then
    return jsonb_build_object('ok', false, 'code', 'USERNAME_INVALID', 'reason', 'username is invalid');
  end if;

  select exists(
    select 1 from public.profiles
    where lower(username) = lower(v_u)
      and id <> v_profile.id
  ) into v_taken;

  if v_taken then
    return jsonb_build_object('ok', false, 'code', 'USERNAME_TAKEN', 'reason', 'username is taken');
  end if;

  update public.profiles
  set
    username = v_u,
    callsign = v_u,
    updated_at = now(),
    last_seen_at = now()
  where id = v_profile.id
  returning * into v_profile;

  update public.live_presence_sessions
  set callsign = v_u
  where profile_id = v_profile.id;

  return jsonb_build_object(
    'ok', true,
    'hasAccount', true,
    'signedIn', true,
    'isGuest', true,
    'username', v_profile.username,
    'authMethod', 'none',
    'authMethods', '[]'::jsonb,
    'snapshot', public.rpc_sync_runner_state(v_ck, null)
  );
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'USERNAME_TAKEN', 'reason', 'username is taken');
end;
$$;

-- 5. Update Regular Sign Up to also report isGuest: false & boundIsGuest on lock
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
set search_path = public, extensions
as $$
declare
  v_ck text := left(btrim(coalesce(p_client_key, '')), 96);
  v_u text := btrim(coalesce(p_username, ''));
  v_method text := lower(btrim(coalesce(p_auth_method, 'password')));
  v_secret text := coalesce(p_credential, '');
  v_bio_id text := btrim(coalesce(p_biometric_id, ''));
  v_spki text := btrim(coalesce(p_public_key_spki, ''));
  v_bio_mode text := lower(btrim(coalesce(p_biometric_mode, 'webauthn')));
  v_existing public.profiles;
  v_taken boolean;
  v_profile public.profiles;
  v_hash text := null;
  v_summary jsonb;
begin
  if v_ck = '' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_CLIENT', 'reason', 'Missing client session key.');
  end if;

  if v_u !~ '^[A-Za-z0-9_]{3,20}$' then
    return jsonb_build_object('ok', false, 'code', 'USERNAME_INVALID', 'reason', 'username is invalid');
  end if;

  if v_method not in ('password', 'pin', 'fingerprint', 'faceid') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_METHOD', 'reason', 'Unsupported authentication method.');
  end if;

  if v_method = 'password' then
    if char_length(v_secret) < 4 or char_length(v_secret) > 64 then
      return jsonb_build_object('ok', false, 'code', 'CREDENTIAL_INVALID', 'reason', 'Password must be 4 to 64 characters.');
    end if;
    v_hash := extensions.crypt(v_secret, extensions.gen_salt('bf', 10));
    v_bio_mode := null;
  elsif v_method = 'pin' then
    if v_secret !~ '^[0-9]{4,8}$' then
      return jsonb_build_object('ok', false, 'code', 'CREDENTIAL_INVALID', 'reason', 'PIN must be 4 to 8 numeric digits.');
    end if;
    v_hash := extensions.crypt(v_secret, extensions.gen_salt('bf', 10));
    v_bio_mode := null;
  elsif v_method = 'fingerprint' then
    v_bio_mode := 'webauthn';
    if char_length(v_bio_id) < 12 or char_length(v_spki) < 40 then
      return jsonb_build_object('ok', false, 'code', 'CREDENTIAL_INVALID', 'reason', 'Hardware Fingerprint passkey attestation is required.');
    end if;
  elsif v_method = 'faceid' then
    if v_bio_mode = 'camera_face' then
      if p_face_descriptor is null or array_length(p_face_descriptor, 1) <> 128 then
        return jsonb_build_object('ok', false, 'code', 'CREDENTIAL_INVALID', 'reason', 'Camera Face ID scan descriptor is incomplete.');
      end if;
      if v_bio_id = '' then
        v_bio_id := 'face_' || encode(extensions.gen_random_bytes(12), 'hex');
      end if;
    else
      v_bio_mode := 'webauthn';
      if char_length(v_bio_id) < 12 or char_length(v_spki) < 40 then
        return jsonb_build_object('ok', false, 'code', 'CREDENTIAL_INVALID', 'reason', 'Hardware Face ID passkey attestation is required.');
      end if;
    end if;
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
      'boundIsGuest', v_existing.is_guest,
      'reason', format('Already registered as %s. Delete this user in Settings before registering again.', v_existing.username)
    );
  end if;

  select exists(
    select 1 from public.profiles where lower(username) = lower(v_u)
  ) into v_taken;

  if v_taken then
    return jsonb_build_object('ok', false, 'code', 'USERNAME_TAKEN', 'reason', 'username is taken');
  end if;

  insert into public.profiles (client_key, username, callsign, is_signed_in, auth_method, is_guest)
  values (v_ck, v_u, v_u, true, v_method, false)
  returning * into v_profile;

  insert into public.profile_credentials (
    profile_id,
    auth_method,
    secret_hash,
    biometric_credential_id,
    public_key_spki,
    public_key_alg,
    sign_count,
    biometric_mode,
    face_descriptor
  ) values (
    v_profile.id,
    v_method,
    v_hash,
    case when v_method in ('fingerprint', 'faceid') then v_bio_id else null end,
    case when v_bio_mode = 'webauthn' then v_spki else null end,
    coalesce(p_public_key_alg, -7),
    greatest(0, coalesce(p_sign_count, 0)),
    v_bio_mode,
    case when v_bio_mode = 'camera_face' then p_face_descriptor else null end
  );

  v_summary := public.get_profile_auth_methods_summary(v_profile.id);

  return jsonb_build_object(
    'ok', true,
    'hasAccount', true,
    'signedIn', true,
    'isGuest', false,
    'username', v_profile.username,
    'authMethod', v_method,
    'authMethods', coalesce(v_summary->'authMethods', jsonb_build_array(v_method)),
    'biometricMode', v_bio_mode,
    'biometricCredentialId', case when v_method in ('fingerprint', 'faceid') then v_bio_id else null end,
    'biometricModes', coalesce(v_summary->'biometricModes', '{}'::jsonb),
    'biometricCredentialIds', coalesce(v_summary->'biometricCredentialIds', '{}'::jsonb),
    'profileId', v_profile.id,
    'snapshot', public.rpc_sync_runner_state(v_ck, null)
  );
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'USERNAME_TAKEN', 'reason', 'username is taken');
end;
$$;

-- 6. Sign In (supports methodless/passwordless Guest accounts AND multi-method regular accounts)
drop function if exists public.rpc_auth_signin(text, text, text, text, text);

create or replace function public.rpc_auth_signin(
  p_client_key text,
  p_username text,
  p_auth_method text default null,
  p_credential text default null,
  p_biometric_id text default null,
  p_biometric_verified boolean default false,
  p_new_sign_count bigint default null,
  p_face_descriptor double precision[] default null,
  p_public_key_spki text default null,
  p_public_key_alg integer default -7,
  p_biometric_mode text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_ck text := left(btrim(coalesce(p_client_key, '')), 96);
  v_u text := btrim(coalesce(p_username, ''));
  v_method text := lower(btrim(coalesce(p_auth_method, '')));
  v_secret text := coalesce(p_credential, '');
  v_bio_id text := btrim(coalesce(p_biometric_id, ''));
  v_bound public.profiles;
  v_target public.profiles;
  v_cred public.profile_credentials;
  v_has_bound boolean := false;
  v_dist double precision;
  v_summary jsonb;
begin
  if v_ck = '' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_CLIENT', 'reason', 'Missing client session key.');
  end if;

  if v_u !~ '^[A-Za-z0-9_]{3,20}$' then
    return jsonb_build_object('ok', false, 'code', 'USERNAME_INVALID', 'reason', 'username is invalid');
  end if;

  select * into v_bound
  from public.profiles
  where client_key = v_ck
  for update;
  v_has_bound := found;

  select * into v_target
  from public.profiles
  where lower(username) = lower(v_u)
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'USERNAME_NOT_REGISTERED', 'reason', 'username is not registered');
  end if;

  if v_has_bound and v_bound.id <> v_target.id then
    return jsonb_build_object(
      'ok', false,
      'code', 'FORCED_BOUND_ACCOUNT',
      'boundUsername', v_bound.username,
      'boundIsGuest', v_bound.is_guest,
      'reason', format('Session is bound to %s until deleted in Settings.', v_bound.username)
    );
  end if;

  -- Guest accounts have NO password and NO auth methods; sign straight back into the persisted Guest profile
  if v_target.is_guest then
    if v_target.client_key <> v_ck and v_target.is_signed_in then
      return jsonb_build_object(
        'ok', false,
        'code', 'GUEST_BOUND_ELSEWHERE',
        'reason', 'This Guest session is active on another device.'
      );
    end if;

    update public.profiles
    set
      client_key = v_ck,
      is_signed_in = true,
      auth_method = 'none',
      callsign = username,
      last_seen_at = now(),
      updated_at = now()
    where id = v_target.id
    returning * into v_target;

    return jsonb_build_object(
      'ok', true,
      'hasAccount', true,
      'signedIn', true,
      'isGuest', true,
      'username', v_target.username,
      'authMethod', 'none',
      'authMethods', '[]'::jsonb,
      'biometricModes', '{}'::jsonb,
      'biometricCredentialIds', '{}'::jsonb,
      'profileId', v_target.id,
      'snapshot', public.rpc_sync_runner_state(v_ck, null)
    );
  end if;

  v_summary := public.get_profile_auth_methods_summary(v_target.id);

  if v_method = '' then
    v_method := coalesce(v_summary->>'primaryMethod', v_target.auth_method, 'password');
  end if;

  select * into v_cred
  from public.profile_credentials
  where profile_id = v_target.id
    and auth_method = v_method
  for update;

  if not found then
    if jsonb_array_length(coalesce(v_summary->'authMethods', '[]'::jsonb)) = 0
       and v_method in ('password', 'pin', 'fingerprint', 'faceid') then
      if v_method = 'password' and char_length(v_secret) between 4 and 64 then
        insert into public.profile_credentials (profile_id, auth_method, secret_hash)
        values (v_target.id, 'password', extensions.crypt(v_secret, extensions.gen_salt('bf', 10)))
        returning * into v_cred;
      elsif v_method = 'pin' and v_secret ~ '^[0-9]{4,8}$' then
        insert into public.profile_credentials (profile_id, auth_method, secret_hash)
        values (v_target.id, 'pin', extensions.crypt(v_secret, extensions.gen_salt('bf', 10)))
        returning * into v_cred;
      elsif v_method in ('fingerprint', 'faceid') and p_biometric_verified then
        insert into public.profile_credentials (
          profile_id, auth_method, biometric_credential_id, public_key_spki, public_key_alg, sign_count, biometric_mode, face_descriptor
        ) values (
          v_target.id, v_method, v_bio_id, p_public_key_spki, coalesce(p_public_key_alg, -7), 0, coalesce(p_biometric_mode, 'webauthn'), p_face_descriptor
        )
        returning * into v_cred;
      else
        return jsonb_build_object('ok', false, 'code', 'CREDENTIAL_INVALID', 'reason', 'Provide a valid credential to finish enrollment.');
      end if;
    else
      return jsonb_build_object(
        'ok', false,
        'code', 'AUTH_METHOD_MISMATCH',
        'expectedMethod', coalesce(v_summary->>'primaryMethod', v_target.auth_method),
        'expectedMethods', coalesce(v_summary->'authMethods', '[]'::jsonb),
        'biometricModes', coalesce(v_summary->'biometricModes', '{}'::jsonb),
        'biometricCredentialIds', coalesce(v_summary->'biometricCredentialIds', '{}'::jsonb),
        'reason', format('This account is not configured for %s sign-in.', initcap(v_method))
      );
    end if;
  else
    if v_method in ('password', 'pin') then
      if v_secret = '' or v_cred.secret_hash is null or v_cred.secret_hash <> extensions.crypt(v_secret, v_cred.secret_hash) then
        return jsonb_build_object(
          'ok', false,
          'code', 'INVALID_CREDENTIAL',
          'expectedMethod', v_method,
          'expectedMethods', coalesce(v_summary->'authMethods', '[]'::jsonb),
          'reason', case when v_method = 'pin' then 'Incorrect PIN code.' else 'Incorrect password.' end
        );
      end if;
    elsif v_method in ('fingerprint', 'faceid') then
      if v_cred.biometric_mode = 'camera_face' then
        v_dist := public.face_descriptor_distance(v_cred.face_descriptor, p_face_descriptor);
        if v_dist > 0.42 then
          return jsonb_build_object(
            'ok', false,
            'code', 'INVALID_CREDENTIAL',
            'expectedMethod', v_method,
            'expectedMethods', coalesce(v_summary->'authMethods', '[]'::jsonb),
            'reason', 'Face ID scan did not match the enrolled face.'
          );
        end if;
      else
        if not coalesce(p_biometric_verified, false) then
          return jsonb_build_object(
            'ok', false,
            'code', 'INVALID_CREDENTIAL',
            'expectedMethod', v_method,
            'expectedMethods', coalesce(v_summary->'authMethods', '[]'::jsonb),
            'reason', format('Hardware %s cryptographic verification failed.', case when v_method = 'faceid' then 'Face ID' else 'Fingerprint' end)
          );
        end if;
        if v_cred.biometric_credential_id is not null and v_bio_id <> v_cred.biometric_credential_id then
          return jsonb_build_object(
            'ok', false,
            'code', 'INVALID_CREDENTIAL',
            'expectedMethod', v_method,
            'expectedMethods', coalesce(v_summary->'authMethods', '[]'::jsonb),
            'reason', 'Passkey does not match the hardware biometric enrolled for this account.'
          );
        end if;
        if p_new_sign_count is not null and p_new_sign_count > 0 then
          update public.profile_credentials
          set sign_count = greatest(sign_count, p_new_sign_count), updated_at = now()
          where profile_id = v_target.id and auth_method = v_method;
        end if;
      end if;
    end if;
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

  v_summary := public.get_profile_auth_methods_summary(v_target.id);

  return jsonb_build_object(
    'ok', true,
    'hasAccount', true,
    'signedIn', true,
    'isGuest', false,
    'username', v_target.username,
    'authMethod', v_method,
    'authMethods', coalesce(v_summary->'authMethods', jsonb_build_array(v_method)),
    'biometricMode', v_cred.biometric_mode,
    'biometricCredentialId', v_cred.biometric_credential_id,
    'biometricModes', coalesce(v_summary->'biometricModes', '{}'::jsonb),
    'biometricCredentialIds', coalesce(v_summary->'biometricCredentialIds', '{}'::jsonb),
    'profileId', v_target.id,
    'snapshot', public.rpc_sync_runner_state(v_ck, null)
  );
end;
$$;

-- 7. Block auth methods on Guest accounts & preserve boundIsGuest on Sign Out
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
set search_path = public, extensions
as $$
declare
  v_ck text := left(btrim(coalesce(p_client_key, '')), 96);
  v_method text := lower(btrim(coalesce(p_auth_method, '')));
  v_secret text := coalesce(p_credential, '');
  v_bio_id text := btrim(coalesce(p_biometric_id, ''));
  v_spki text := btrim(coalesce(p_public_key_spki, ''));
  v_bio_mode text := lower(btrim(coalesce(p_biometric_mode, 'webauthn')));
  v_profile public.profiles;
  v_hash text := null;
  v_summary jsonb;
begin
  if v_ck = '' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_CLIENT', 'reason', 'Missing client session key.');
  end if;

  select * into v_profile
  from public.profiles
  where client_key = v_ck and is_signed_in = true
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_SIGNED_IN', 'reason', 'Sign in first to manage authentication methods.');
  end if;

  if v_profile.is_guest then
    return jsonb_build_object('ok', false, 'code', 'GUEST_NO_AUTH_METHODS', 'reason', 'Guest accounts do not use passwords or authentication methods.');
  end if;

  if v_method not in ('password', 'pin', 'fingerprint', 'faceid') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_METHOD', 'reason', 'Unsupported authentication method.');
  end if;

  if v_method = 'password' then
    if char_length(v_secret) < 4 or char_length(v_secret) > 64 then
      return jsonb_build_object('ok', false, 'code', 'CREDENTIAL_INVALID', 'reason', 'Password must be 4 to 64 characters.');
    end if;
    v_hash := extensions.crypt(v_secret, extensions.gen_salt('bf', 10));
    v_bio_mode := null;
  elsif v_method = 'pin' then
    if v_secret !~ '^[0-9]{4,8}$' then
      return jsonb_build_object('ok', false, 'code', 'CREDENTIAL_INVALID', 'reason', 'PIN must be 4 to 8 numeric digits.');
    end if;
    v_hash := extensions.crypt(v_secret, extensions.gen_salt('bf', 10));
    v_bio_mode := null;
  elsif v_method = 'fingerprint' then
    v_bio_mode := 'webauthn';
    if char_length(v_bio_id) < 12 or char_length(v_spki) < 40 then
      return jsonb_build_object('ok', false, 'code', 'CREDENTIAL_INVALID', 'reason', 'Hardware Fingerprint passkey scan is required.');
    end if;
  elsif v_method = 'faceid' then
    if v_bio_mode = 'camera_face' then
      if p_face_descriptor is null or array_length(p_face_descriptor, 1) <> 128 then
        return jsonb_build_object('ok', false, 'code', 'CREDENTIAL_INVALID', 'reason', 'Face ID scan descriptor is incomplete.');
      end if;
      if v_bio_id = '' then
        v_bio_id := 'face_' || encode(extensions.gen_random_bytes(12), 'hex');
      end if;
    else
      v_bio_mode := 'webauthn';
      if char_length(v_bio_id) < 12 or char_length(v_spki) < 40 then
        return jsonb_build_object('ok', false, 'code', 'CREDENTIAL_INVALID', 'reason', 'Hardware Face ID passkey scan is required.');
      end if;
    end if;
  end if;

  insert into public.profile_credentials (
    profile_id,
    auth_method,
    secret_hash,
    biometric_credential_id,
    public_key_spki,
    public_key_alg,
    sign_count,
    biometric_mode,
    face_descriptor,
    updated_at
  ) values (
    v_profile.id,
    v_method,
    v_hash,
    case when v_method in ('fingerprint', 'faceid') then v_bio_id else null end,
    case when v_bio_mode = 'webauthn' then v_spki else null end,
    coalesce(p_public_key_alg, -7),
    greatest(0, coalesce(p_sign_count, 0)),
    v_bio_mode,
    case when v_bio_mode = 'camera_face' then p_face_descriptor else null end,
    now()
  )
  on conflict (profile_id, auth_method) do update set
    secret_hash = excluded.secret_hash,
    biometric_credential_id = excluded.biometric_credential_id,
    public_key_spki = excluded.public_key_spki,
    public_key_alg = excluded.public_key_alg,
    sign_count = excluded.sign_count,
    biometric_mode = excluded.biometric_mode,
    face_descriptor = excluded.face_descriptor,
    updated_at = now();

  if v_profile.auth_method = 'none' then
    update public.profiles
    set auth_method = v_method, updated_at = now()
    where id = v_profile.id;
  end if;

  v_summary := public.get_profile_auth_methods_summary(v_profile.id);

  return jsonb_build_object(
    'ok', true,
    'connectedMethod', v_method,
    'username', v_profile.username,
    'isGuest', false,
    'authMethod', coalesce(v_summary->>'primaryMethod', v_method),
    'authMethods', coalesce(v_summary->'authMethods', jsonb_build_array(v_method)),
    'biometricModes', coalesce(v_summary->'biometricModes', '{}'::jsonb),
    'biometricCredentialIds', coalesce(v_summary->'biometricCredentialIds', '{}'::jsonb)
  );
end;
$$;

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
  select * into v_profile
  from public.profiles
  where client_key = v_ck
  for update;

  if not found then
    return jsonb_build_object(
      'ok', true,
      'hasAccount', false,
      'signedIn', false,
      'isGuest', false,
      'username', null,
      'authMethods', '[]'::jsonb
    );
  end if;

  update public.profiles
  set
    is_signed_in = false,
    updated_at = now()
  where id = v_profile.id
  returning * into v_profile;

  delete from public.live_presence_sessions
  where profile_id = v_profile.id or client_key = v_ck;

  if v_profile.is_guest then
    return jsonb_build_object(
      'ok', true,
      'hasAccount', true,
      'signedIn', false,
      'isGuest', true,
      'username', v_profile.username,
      'authMethod', 'none',
      'authMethods', '[]'::jsonb,
      'biometricModes', '{}'::jsonb,
      'biometricCredentialIds', '{}'::jsonb
    );
  end if;

  v_summary := public.get_profile_auth_methods_summary(v_profile.id);

  return jsonb_build_object(
    'ok', true,
    'hasAccount', true,
    'signedIn', false,
    'isGuest', false,
    'username', v_profile.username,
    'authMethod', coalesce(v_summary->>'primaryMethod', v_profile.auth_method),
    'authMethods', coalesce(v_summary->'authMethods', '[]'::jsonb),
    'biometricModes', coalesce(v_summary->'biometricModes', '{}'::jsonb),
    'biometricCredentialIds', coalesce(v_summary->'biometricCredentialIds', '{}'::jsonb)
  );
end;
$$;

-- 8. Enforce Guest item/level/achievement/leaderboard restrictions in gameplay & shop RPCs
create or replace function public.rpc_purchase_shop_item(p_client_key text, p_item_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
  v_item public.shop_items;
  v_already boolean;
  v_callsign text;
begin
  select * into v_profile from public.profiles where client_key = p_client_key and is_signed_in = true for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'Sign in required.');
  end if;

  select * into v_item from public.shop_items where id = p_item_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'Shop item not found.');
  end if;

  if v_profile.is_guest and not public.is_guest_allowed_item(v_item.id) then
    return jsonb_build_object('ok', false, 'code', 'GUEST_ITEM_LOCKED', 'reason', 'This item requires a full account.');
  end if;

  select exists(
    select 1 from public.player_inventory
    where profile_id = v_profile.id and item_id = v_item.id
  ) into v_already;

  if v_already then
    return jsonb_build_object('ok', true, 'alreadyOwned', true, 'snapshot', public.rpc_sync_runner_state(p_client_key, null));
  end if;

  if v_item.currency = 'sp' then
    if v_profile.skill_points < v_item.cost then
      return jsonb_build_object('ok', false, 'reason', 'Not enough Skill Points.');
    end if;
    update public.profiles set skill_points = skill_points - v_item.cost where id = v_profile.id;
    update public.global_telemetry set total_sp_spent = total_sp_spent + v_item.cost where id = 'global';
  else
    if v_profile.coins < v_item.cost then
      return jsonb_build_object('ok', false, 'reason', 'Not enough Coins.');
    end if;
    update public.profiles set coins = coins - v_item.cost where id = v_profile.id;
    update public.global_telemetry set total_coins_spent = total_coins_spent + v_item.cost where id = 'global';
  end if;

  insert into public.player_inventory (profile_id, item_id, category, cost_paid, currency_spent, acquired_via)
  values (v_profile.id, v_item.id, v_item.category, v_item.cost, v_item.currency, 'purchase')
  on conflict (profile_id, item_id) do nothing;

  if v_item.category = 'upgrades' then
    update public.player_loadouts
    set active_upgrades = case
      when not (v_item.id = any(active_upgrades)) then array_append(active_upgrades, v_item.id)
      else active_upgrades
    end
    where profile_id = v_profile.id;
  elsif v_item.category = 'characters' then
    update public.player_loadouts set character_id = v_item.id where profile_id = v_profile.id;
  elsif v_item.category = 'skins' then
    update public.player_loadouts set skin_id = v_item.id where profile_id = v_profile.id;
  elsif v_item.category = 'auras' then
    update public.player_loadouts set aura_id = v_item.id where profile_id = v_profile.id;
  elsif v_item.category = 'trails' then
    update public.player_loadouts set trail_id = v_item.id where profile_id = v_profile.id;
  elsif v_item.category = 'emotes' then
    update public.player_loadouts set emote_id = v_item.id where profile_id = v_profile.id;
  end if;

  v_callsign := v_profile.username;
  insert into public.realtime_activity_feed (profile_id, callsign, event_type, item_id, headline, detail)
  values (
    v_profile.id,
    v_callsign,
    'item_unlocked',
    v_item.id,
    format('%s unlocked %s', v_callsign, v_item.name),
    format('%s · %s %s', v_item.tier, v_item.cost, case when v_item.currency = 'sp' then 'SP' else 'Coins' end)
  );

  update public.global_telemetry
  set last_event_summary = format('%s unlocked %s', v_callsign, v_item.name)
  where id = 'global';

  return jsonb_build_object('ok', true, 'snapshot', public.rpc_sync_runner_state(p_client_key, null));
end;
$$;

create or replace function public.rpc_equip_loadout_item(p_client_key text, p_item_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
  v_item public.shop_items;
  v_owns boolean;
begin
  select * into v_profile from public.profiles where client_key = p_client_key for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'Profile not initialized.');
  end if;

  select * into v_item from public.shop_items where id = p_item_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'Item not found.');
  end if;

  if v_profile.is_guest and not public.is_guest_allowed_item(v_item.id) then
    return jsonb_build_object('ok', false, 'code', 'GUEST_ITEM_LOCKED', 'reason', 'This item requires a full account.');
  end if;

  select exists(
    select 1 from public.player_inventory where profile_id = v_profile.id and item_id = v_item.id
  ) into v_owns;

  if not v_owns and not v_item.is_starter then
    return jsonb_build_object('ok', false, 'reason', 'Item not unlocked.');
  end if;

  if v_item.category = 'upgrades' then
    update public.player_loadouts
    set active_upgrades = case
      when v_item.id = any(active_upgrades) then array_remove(active_upgrades, v_item.id)
      else array_append(active_upgrades, v_item.id)
    end
    where profile_id = v_profile.id;
  elsif v_item.category = 'characters' then
    update public.player_loadouts set character_id = v_item.id where profile_id = v_profile.id;
  elsif v_item.category = 'skins' then
    update public.player_loadouts set skin_id = v_item.id where profile_id = v_profile.id;
  elsif v_item.category = 'auras' then
    update public.player_loadouts set aura_id = v_item.id where profile_id = v_profile.id;
  elsif v_item.category = 'trails' then
    update public.player_loadouts set trail_id = v_item.id where profile_id = v_profile.id;
  elsif v_item.category = 'emotes' then
    update public.player_loadouts set emote_id = v_item.id where profile_id = v_profile.id;
  end if;

  update public.shop_items set total_equips = total_equips + 1 where id = v_item.id;

  return jsonb_build_object('ok', true, 'snapshot', public.rpc_sync_runner_state(p_client_key, null));
end;
$$;

create or replace function public.rpc_publish_verified_run(p_client_key text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
  v_loadout public.player_loadouts;
  v_lvl public.levels_catalog;
  v_callsign text;
  v_lvl_id integer := (p_payload ->> 'levelId')::integer;
  v_time_ms integer := round((p_payload ->> 'timeMs')::numeric)::integer;
  v_deaths integer := greatest(0, round(coalesce((p_payload ->> 'deaths')::numeric, 0))::integer);
  v_coins integer := greatest(0, round(coalesce((p_payload ->> 'coins')::numeric, 0))::integer);
  v_run public.leaderboard_runs;
  v_min_time_ms integer;
begin
  select * into v_profile
  from public.profiles
  where client_key = p_client_key and is_signed_in = true
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'Sign in required.');
  end if;

  if v_profile.is_guest then
    return jsonb_build_object('ok', false, 'code', 'GUEST_LEADERBOARD_DISABLED', 'reason', 'Leaderboards are disabled for Guest accounts.');
  end if;

  v_callsign := v_profile.username;

  if v_lvl_id is null or v_lvl_id not between 1 and 8 then
    return jsonb_build_object('ok', false, 'reason', 'Invalid level ID.');
  end if;

  select * into v_lvl from public.levels_catalog where id = v_lvl_id;
  v_min_time_ms := greatest(500, floor(((v_lvl.width - v_lvl.spawn_x - 80)::numeric / 620.0) * 1000)::integer);
  if v_time_ms is null or v_time_ms < v_min_time_ms then
    return jsonb_build_object('ok', false, 'reason', format('Run time (%s ms) below physical limit (%s ms).', v_time_ms, v_min_time_ms));
  end if;

  select * into v_loadout from public.player_loadouts where profile_id = v_profile.id;

  insert into public.leaderboard_runs (
    profile_id, client_key, callsign, level_id, level_title, time_ms, deaths, coins,
    character_id, skin_id, aura_id, trail_id, active_upgrades, replay_storage_path, runner_card_path
  ) values (
    v_profile.id,
    p_client_key,
    v_callsign,
    v_lvl.id,
    v_lvl.title,
    v_time_ms,
    v_deaths,
    v_coins,
    coalesce(v_loadout.character_id, 'char_classic'),
    coalesce(v_loadout.skin_id, 'skin_solid'),
    coalesce(v_loadout.aura_id, 'aura_none'),
    coalesce(v_loadout.trail_id, 'trail_none'),
    coalesce(v_loadout.active_upgrades, '{}'::text[]),
    p_payload ->> 'replayStoragePath',
    v_profile.runner_card_path
  )
  returning * into v_run;

  if jsonb_typeof(p_payload -> 'frames') = 'array' and jsonb_array_length(p_payload -> 'frames') > 1 then
    insert into public.run_replays (
      run_id, profile_id, level_id, callsign, time_ms, deaths,
      character_id, skin_id, aura_id, sample_interval_ms, frame_count, frames_inline, storage_path
    ) values (
      v_run.id,
      v_profile.id,
      v_lvl.id,
      v_callsign,
      v_time_ms,
      v_deaths,
      v_run.character_id,
      v_run.skin_id,
      v_run.aura_id,
      greatest(16, coalesce((p_payload ->> 'sampleIntervalMs')::integer, 80)),
      jsonb_array_length(p_payload -> 'frames'),
      p_payload -> 'frames',
      p_payload ->> 'replayStoragePath'
    );
  end if;

  insert into public.realtime_activity_feed (profile_id, callsign, event_type, level_id, headline, detail)
  values (
    v_profile.id,
    v_callsign,
    'run_published',
    v_lvl.id,
    format('%s published a verified run on %s. %s', v_callsign, v_lvl.code, v_lvl.title),
    format('%s ms · %s deaths · %s coins', v_time_ms, v_deaths, v_coins)
  );

  return jsonb_build_object('ok', true, 'record', to_jsonb(v_run));
end;
$$;

create or replace function public.rpc_sync_runner_state(
  p_client_key text,
  p_state jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
  v_settings public.player_settings;
  v_loadout public.player_loadouts;
  v_item_id text;
  v_ach_id text;
  v_lvl_val jsonb;
  v_lvl_id integer;
  v_max_lvl integer;
  v_incoming_coins text[];
  v_incoming_orb boolean;
begin
  if p_client_key is null or btrim(p_client_key) = '' then
    return null;
  end if;

  select * into v_profile
  from public.profiles
  where client_key = left(btrim(p_client_key), 96);

  if not found then
    return null;
  end if;

  v_max_lvl := case when v_profile.is_guest then 3 else 8 end;

  if v_profile.is_signed_in and p_state is not null and jsonb_typeof(p_state) = 'object' then
    update public.profiles
    set
      callsign = v_profile.username,
      coins = case
        when (p_state ->> 'authoritative')::boolean = true and (p_state ? 'coins') then greatest(0, (p_state ->> 'coins')::integer)
        else greatest(coins, coalesce((p_state ->> 'coins')::integer, coins))
      end,
      skill_points = case
        when (p_state ->> 'authoritative')::boolean = true and (p_state ? 'skillPoints') then greatest(0, (p_state ->> 'skillPoints')::integer)
        else greatest(skill_points, coalesce((p_state ->> 'skillPoints')::integer, skill_points))
      end,
      total_deaths = greatest(total_deaths, coalesce((p_state #>> '{telemetry,totalDeaths}')::bigint, total_deaths)),
      traps_triggered = greatest(traps_triggered, coalesce((p_state #>> '{telemetry,trapsTriggered}')::bigint, traps_triggered)),
      parting_floor_deaths = greatest(parting_floor_deaths, coalesce((p_state #>> '{telemetry,partingFloorDeaths}')::bigint, parting_floor_deaths)),
      shy_doors_triggered = greatest(shy_doors_triggered, coalesce((p_state #>> '{telemetry,shyDoorsTriggered}')::bigint, shy_doors_triggered)),
      quick_restarts = greatest(quick_restarts, coalesce((p_state #>> '{telemetry,quickRestarts}')::bigint, quick_restarts)),
      total_coins_collected = greatest(total_coins_collected, coalesce((p_state #>> '{telemetry,totalCoinsCollected}')::bigint, total_coins_collected)),
      emotes_used_in_stage = greatest(emotes_used_in_stage, coalesce((p_state #>> '{telemetry,emotesUsedInStage}')::bigint, emotes_used_in_stage)),
      gravity_flips_survived = greatest(gravity_flips_survived, coalesce((p_state #>> '{telemetry,gravityFlipsSurvived}')::bigint, gravity_flips_survived)),
      deathless_clears = greatest(deathless_clears, coalesce((p_state #>> '{telemetry,deathlessClears}')::bigint, deathless_clears)),
      last_seen_at = now()
    where id = v_profile.id
    returning * into v_profile;

    if p_state ? 'settings' then
      update public.player_settings
      set
        theme = coalesce((p_state #>> '{settings,theme}')::public.theme_mode, theme),
        muted = coalesce((p_state #>> '{settings,muted}')::boolean, muted),
        volume = least(1, greatest(0, coalesce((p_state #>> '{settings,volume}')::numeric, volume))),
        screen_shake = coalesce((p_state #>> '{settings,screenShake}')::boolean, screen_shake),
        touch_controls = coalesce((p_state #>> '{settings,touchControls}')::boolean, touch_controls),
        live_ghosts = coalesce((p_state #>> '{settings,liveGhosts}')::boolean, live_ghosts)
      where profile_id = v_profile.id;
    end if;

    if jsonb_typeof(p_state -> 'ownedItems') = 'array' then
      for v_item_id in select jsonb_array_elements_text(p_state -> 'ownedItems')
      loop
        if not v_profile.is_guest or public.is_guest_allowed_item(v_item_id) then
          insert into public.player_inventory (profile_id, item_id, category, cost_paid, currency_spent, acquired_via)
          select v_profile.id, s.id, s.category, s.cost, s.currency, case when s.is_starter then 'starter' else 'sync' end
          from public.shop_items s where s.id = v_item_id
          on conflict (profile_id, item_id) do nothing;
        end if;
      end loop;
    end if;

    if jsonb_typeof(p_state -> 'unlockedUpgrades') = 'array' then
      for v_item_id in select jsonb_array_elements_text(p_state -> 'unlockedUpgrades')
      loop
        if not v_profile.is_guest or public.is_guest_allowed_item(v_item_id) then
          insert into public.player_inventory (profile_id, item_id, category, cost_paid, currency_spent, acquired_via)
          select v_profile.id, s.id, s.category, s.cost, s.currency, 'sync'
          from public.shop_items s where s.id = v_item_id
          on conflict (profile_id, item_id) do nothing;
        end if;
      end loop;
    end if;

    if p_state ? 'equipped' then
      update public.player_loadouts
      set
        character_id = coalesce((
          select id from public.shop_items
          where id = (p_state #>> '{equipped,character}')
            and (not v_profile.is_guest or public.is_guest_allowed_item(id))
        ), character_id),
        skin_id = coalesce((
          select id from public.shop_items
          where id = (p_state #>> '{equipped,skin}')
            and (not v_profile.is_guest or public.is_guest_allowed_item(id))
        ), skin_id),
        aura_id = coalesce((
          select id from public.shop_items
          where id = (p_state #>> '{equipped,aura}')
            and (not v_profile.is_guest or public.is_guest_allowed_item(id))
        ), aura_id),
        trail_id = coalesce((
          select id from public.shop_items
          where id = (p_state #>> '{equipped,trail}')
            and (not v_profile.is_guest or public.is_guest_allowed_item(id))
        ), trail_id),
        emote_id = coalesce((
          select id from public.shop_items
          where id = (p_state #>> '{equipped,emote}')
            and (not v_profile.is_guest or public.is_guest_allowed_item(id))
        ), emote_id),
        active_upgrades = case
          when jsonb_typeof(p_state -> 'activeUpgrades') = 'array'
            then array(
              select x from jsonb_array_elements_text(p_state -> 'activeUpgrades') as x
              where not v_profile.is_guest or public.is_guest_allowed_item(x)
            )
          else active_upgrades
        end
      where profile_id = v_profile.id;
    end if;

    for v_lvl_id in 1..v_max_lvl loop
      v_lvl_val := coalesce(p_state #> array['levelStats', v_lvl_id::text], 'null'::jsonb);
      v_incoming_orb := coalesce(
        (p_state #>> array['collectedOrbs', v_lvl_id::text])::boolean,
        (p_state #>> array['collectedStageOrbs', v_lvl_id::text])::boolean,
        false
      );
      if jsonb_typeof(p_state #> array['collectedCoins', v_lvl_id::text]) = 'array' then
        v_incoming_coins := array(
          select distinct x from jsonb_array_elements_text(p_state #> array['collectedCoins', v_lvl_id::text]) as x
          where btrim(x) <> ''
        );
      else
        v_incoming_coins := '{}'::text[];
      end if;

      if jsonb_typeof(v_lvl_val) = 'object' or v_incoming_orb or cardinality(v_incoming_coins) > 0 then
        insert into public.player_level_progress (
          profile_id, level_id, cleared, clears, attempts, best_time_ms, least_deaths,
          orb_collected, collected_coins, first_cleared_at, last_played_at
        )
        values (
          v_profile.id,
          v_lvl_id,
          case when jsonb_typeof(v_lvl_val) = 'object' then coalesce((v_lvl_val ->> 'cleared')::boolean, false) else false end,
          case when jsonb_typeof(v_lvl_val) = 'object' then greatest(0, coalesce((v_lvl_val ->> 'clears')::integer, 0)) else 0 end,
          case when jsonb_typeof(v_lvl_val) = 'object' then greatest(0, coalesce((v_lvl_val ->> 'attempts')::integer, 0)) else 0 end,
          case when jsonb_typeof(v_lvl_val) = 'object' then (v_lvl_val ->> 'bestTimeMs')::integer else null end,
          case when jsonb_typeof(v_lvl_val) = 'object' then (v_lvl_val ->> 'leastDeaths')::integer else null end,
          v_incoming_orb,
          v_incoming_coins,
          case when jsonb_typeof(v_lvl_val) = 'object' and coalesce((v_lvl_val ->> 'cleared')::boolean, false) then now() else null end,
          now()
        )
        on conflict (profile_id, level_id) do update set
          cleared = public.player_level_progress.cleared or excluded.cleared,
          clears = greatest(public.player_level_progress.clears, excluded.clears),
          attempts = greatest(public.player_level_progress.attempts, excluded.attempts),
          best_time_ms = case
            when public.player_level_progress.best_time_ms is null then excluded.best_time_ms
            when excluded.best_time_ms is null then public.player_level_progress.best_time_ms
            else least(public.player_level_progress.best_time_ms, excluded.best_time_ms)
          end,
          least_deaths = case
            when public.player_level_progress.least_deaths is null then excluded.least_deaths
            when excluded.least_deaths is null then public.player_level_progress.least_deaths
            else least(public.player_level_progress.least_deaths, excluded.least_deaths)
          end,
          orb_collected = public.player_level_progress.orb_collected or excluded.orb_collected,
          collected_coins = array(
            select distinct unnest(public.player_level_progress.collected_coins || excluded.collected_coins)
          ),
          first_cleared_at = coalesce(public.player_level_progress.first_cleared_at, excluded.first_cleared_at);
      end if;
    end loop;

    if not v_profile.is_guest and jsonb_typeof(p_state -> 'unlockedAchievements') = 'array' then
      for v_ach_id in select jsonb_array_elements_text(p_state -> 'unlockedAchievements')
      loop
        insert into public.player_achievements (profile_id, achievement_id, reward_coins, reward_sp)
        select v_profile.id, a.id, a.reward_coins, a.reward_sp
        from public.achievements_catalog a where a.id = v_ach_id
        on conflict (profile_id, achievement_id) do nothing;
      end loop;
    end if;

    update public.profiles
    set
      stages_cleared = (
        select count(*) from public.player_level_progress
        where profile_id = v_profile.id and cleared = true
      ),
      achievements_count = case
        when v_profile.is_guest then 0
        else (select count(*) from public.player_achievements where profile_id = v_profile.id)
      end
    where id = v_profile.id
    returning * into v_profile;
  else
    update public.profiles set last_seen_at = now() where id = v_profile.id returning * into v_profile;
  end if;

  select * into v_settings from public.player_settings where profile_id = v_profile.id;
  select * into v_loadout from public.player_loadouts where profile_id = v_profile.id;

  return jsonb_build_object(
    'profile', to_jsonb(v_profile),
    'settings', to_jsonb(v_settings),
    'loadout', to_jsonb(v_loadout),
    'ownedItems', coalesce((
      select jsonb_agg(item_id order by unlocked_at)
      from public.player_inventory
      where profile_id = v_profile.id and category <> 'upgrades'
    ), '[]'::jsonb),
    'unlockedUpgrades', coalesce((
      select jsonb_agg(item_id order by unlocked_at)
      from public.player_inventory
      where profile_id = v_profile.id and category = 'upgrades'
    ), '[]'::jsonb),
    'levelProgress', coalesce((
      select jsonb_agg(to_jsonb(lp) order by lp.level_id)
      from public.player_level_progress lp
      where lp.profile_id = v_profile.id
    ), '[]'::jsonb),
    'unlockedAchievements', case
      when v_profile.is_guest then '[]'::jsonb
      else coalesce((
        select jsonb_agg(achievement_id order by unlocked_at)
        from public.player_achievements
        where profile_id = v_profile.id
      ), '[]'::jsonb)
    end
  );
end;
$$;

-- 9. Update rpc_record_gameplay_event to block Stages > 3 and Achievements for Guest users
create or replace function public.rpc_record_gameplay_event(
  p_client_key text,
  p_event text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
  v_callsign text;
  v_lvl_id integer := (p_payload ->> 'levelId')::integer;
  v_coin_id text := btrim(coalesce(p_payload ->> 'coinId', ''));
  v_delta integer := greatest(1, coalesce((p_payload ->> 'delta')::integer, 1));
  v_deaths integer := greatest(0, coalesce((p_payload ->> 'deaths')::integer, 0));
  v_time_ms integer := greatest(0, coalesce((p_payload ->> 'timeMs')::integer, 0));
  v_coins integer := greatest(0, coalesce((p_payload ->> 'earnedCoins')::integer, 0));
  v_sp integer := greatest(0, coalesce((p_payload ->> 'earnedSP')::integer, 0));
  v_ach public.achievements_catalog;
  v_lp public.player_level_progress;
  v_was_inserted integer := 0;
  v_already_cleared boolean := false;
  v_lvl_reward_coins integer := 15;
  v_lvl_reward_sp integer := 1;
begin
  select * into v_profile
  from public.profiles
  where client_key = left(btrim(coalesce(p_client_key, '')), 96)
    and is_signed_in = true
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'Sign in required.');
  end if;

  if v_profile.is_guest then
    if v_lvl_id is not null and v_lvl_id > 3 then
      return jsonb_build_object('ok', false, 'code', 'GUEST_LEVEL_LOCKED', 'reason', 'Stages 04–08 require a full account.');
    end if;
    if p_event = 'achievement_unlocked' then
      return jsonb_build_object('ok', false, 'code', 'GUEST_ACHIEVEMENTS_DISABLED', 'reason', 'Achievements are disabled for Guest accounts.');
    end if;
  end if;

  v_callsign := v_profile.username;

  if p_event = 'reset_runner' then
    delete from public.player_inventory where profile_id = v_profile.id and acquired_via <> 'starter';
    delete from public.player_level_progress where profile_id = v_profile.id;
    delete from public.player_achievements where profile_id = v_profile.id;
    update public.player_loadouts
    set
      character_id = 'char_classic',
      skin_id = 'skin_solid',
      aura_id = 'aura_none',
      trail_id = 'trail_none',
      emote_id = 'emote_salute',
      active_upgrades = '{}'::text[]
    where profile_id = v_profile.id;
    update public.profiles
    set
      coins = 0,
      skill_points = 0,
      total_deaths = 0,
      traps_triggered = 0,
      parting_floor_deaths = 0,
      shy_doors_triggered = 0,
      quick_restarts = 0,
      total_coins_collected = 0,
      emotes_used_in_stage = 0,
      gravity_flips_survived = 0,
      deathless_clears = 0,
      stages_cleared = 0,
      achievements_count = 0
    where id = v_profile.id
    returning * into v_profile;

    return jsonb_build_object(
      'ok', true,
      'coins', v_profile.coins,
      'skillPoints', v_profile.skill_points,
      'snapshot', public.rpc_sync_runner_state(p_client_key, null)
    );
  end if;

  if p_event = 'death' then
    update public.profiles set
      total_deaths = total_deaths + v_delta,
      parting_floor_deaths = parting_floor_deaths + (case when (p_payload ->> 'cause') = 'parting_floor' then 1 else 0 end)
    where id = v_profile.id;
    update public.global_telemetry set
      total_deaths = total_deaths + v_delta,
      last_event_summary = format('%s met a trap on Stage 0%s', v_callsign, coalesce(v_lvl_id, 1))
    where id = 'global';
    if v_lvl_id between 1 and 8 then
      update public.levels_catalog set global_deaths = global_deaths + v_delta, global_attempts = global_attempts + 1 where id = v_lvl_id;
    end if;

  elsif p_event = 'trap_triggered' then
    update public.profiles set traps_triggered = traps_triggered + v_delta where id = v_profile.id;
    update public.global_telemetry set total_traps_triggered = total_traps_triggered + v_delta where id = 'global';

  elsif p_event = 'shy_door' then
    update public.profiles set shy_doors_triggered = shy_doors_triggered + v_delta where id = v_profile.id;
    update public.global_telemetry set total_shy_doors_triggered = total_shy_doors_triggered + v_delta where id = 'global';

  elsif p_event = 'coin_collected' and v_lvl_id between 1 and 8 and v_coin_id <> '' then
    insert into public.player_level_progress (profile_id, level_id, collected_coins)
    values (v_profile.id, v_lvl_id, '{}'::text[])
    on conflict (profile_id, level_id) do nothing;

    select * into v_lp
    from public.player_level_progress
    where profile_id = v_profile.id and level_id = v_lvl_id
    for update;

    if not (v_coin_id = any(coalesce(v_lp.collected_coins, '{}'::text[]))) then
      v_coins := 1;
      update public.player_level_progress
      set
        collected_coins = array_append(coalesce(collected_coins, '{}'::text[]), v_coin_id),
        last_played_at = now()
      where profile_id = v_profile.id and level_id = v_lvl_id;

      update public.profiles set
        coins = coins + 1,
        total_coins_collected = total_coins_collected + 1
      where id = v_profile.id;
      update public.global_telemetry set total_coins_collected = total_coins_collected + 1 where id = 'global';
    end if;

  elsif p_event = 'coin' then
    update public.profiles set
      coins = coins + greatest(1, coalesce((p_payload ->> 'coinValue')::integer, 1)),
      total_coins_collected = total_coins_collected + v_delta
    where id = v_profile.id;
    update public.global_telemetry set total_coins_collected = total_coins_collected + v_delta where id = 'global';

  elsif p_event = 'emote' then
    update public.profiles set emotes_used_in_stage = emotes_used_in_stage + v_delta where id = v_profile.id;
    update public.global_telemetry set total_emotes_used = total_emotes_used + v_delta where id = 'global';

  elsif p_event = 'gravity_flip' then
    update public.profiles set gravity_flips_survived = gravity_flips_survived + v_delta where id = v_profile.id;
    update public.global_telemetry set total_gravity_flips = total_gravity_flips + v_delta where id = 'global';

  elsif p_event = 'orb_claimed' and v_lvl_id between 1 and 8 then
    insert into public.player_level_progress (profile_id, level_id, orb_collected)
    values (v_profile.id, v_lvl_id, false)
    on conflict (profile_id, level_id) do nothing;

    select * into v_lp
    from public.player_level_progress
    where profile_id = v_profile.id and level_id = v_lvl_id
    for update;

    if not coalesce(v_lp.orb_collected, false) then
      v_sp := 1;
      update public.player_level_progress
      set
        orb_collected = true,
        last_played_at = now()
      where profile_id = v_profile.id and level_id = v_lvl_id;

      update public.profiles set skill_points = skill_points + 1 where id = v_profile.id;
      update public.levels_catalog set global_orbs_found = global_orbs_found + 1 where id = v_lvl_id;
      update public.global_telemetry set total_sp_earned = total_sp_earned + 1 where id = 'global';
      insert into public.realtime_activity_feed (profile_id, callsign, event_type, level_id, headline)
      values (v_profile.id, v_callsign, 'orb_claimed', v_lvl_id, format('%s claimed Hidden Skill Orb on Stage 0%s', v_callsign, v_lvl_id));
    end if;

  elsif p_event in ('stage_clear', 'level_clear') and v_lvl_id between 1 and 8 then
    select cleared into v_already_cleared
    from public.player_level_progress
    where profile_id = v_profile.id and level_id = v_lvl_id;

    select reward_coins, reward_sp into v_lvl_reward_coins, v_lvl_reward_sp
    from public.levels_catalog
    where id = v_lvl_id;

    if coalesce(v_already_cleared, false) then
      v_coins := 0;
      v_sp := 0;
    else
      v_coins := coalesce(v_lvl_reward_coins, 15);
      v_sp := coalesce(v_lvl_reward_sp, 1);
    end if;

    insert into public.player_level_progress (
      profile_id, level_id, cleared, clears, attempts, best_time_ms, least_deaths,
      par_deaths_met, par_time_met, first_cleared_at, last_played_at
    ) values (
      v_profile.id, v_lvl_id, true, 1, 1, v_time_ms, v_deaths,
      coalesce((p_payload ->> 'parDeathsMet')::boolean, false),
      coalesce((p_payload ->> 'parTimeMet')::boolean, false),
      now(), now()
    )
    on conflict (profile_id, level_id) do update set
      cleared = true,
      clears = public.player_level_progress.clears + 1,
      attempts = public.player_level_progress.attempts + 1,
      best_time_ms = case
        when public.player_level_progress.best_time_ms is null then excluded.best_time_ms
        else least(public.player_level_progress.best_time_ms, excluded.best_time_ms)
      end,
      least_deaths = case
        when public.player_level_progress.least_deaths is null then excluded.least_deaths
        else least(public.player_level_progress.least_deaths, excluded.least_deaths)
      end,
      par_deaths_met = public.player_level_progress.par_deaths_met or excluded.par_deaths_met,
      par_time_met = public.player_level_progress.par_time_met or excluded.par_time_met,
      first_cleared_at = coalesce(public.player_level_progress.first_cleared_at, now()),
      last_played_at = now();

    update public.profiles set
      coins = coins + v_coins,
      skill_points = skill_points + v_sp,
      deathless_clears = deathless_clears + (case when v_deaths = 0 then 1 else 0 end),
      stages_cleared = (select count(*) from public.player_level_progress where profile_id = v_profile.id and cleared = true)
    where id = v_profile.id;

    update public.levels_catalog set global_clears = global_clears + 1, global_attempts = global_attempts + 1 where id = v_lvl_id;
    update public.global_telemetry set
      total_clears = total_clears + 1,
      total_deathless_clears = total_deathless_clears + (case when v_deaths = 0 then 1 else 0 end),
      total_sp_earned = total_sp_earned + v_sp,
      last_event_summary = format('%s cleared Stage 0%s in %s ms', v_callsign, v_lvl_id, v_time_ms)
    where id = 'global';

    insert into public.realtime_activity_feed (profile_id, callsign, event_type, level_id, headline, detail)
    values (
      v_profile.id,
      v_callsign,
      case when v_deaths = 0 then 'deathless_clear'::public.realtime_event_type else 'stage_clear'::public.realtime_event_type end,
      v_lvl_id,
      format('%s conquered Stage 0%s%s', v_callsign, v_lvl_id, case when v_deaths = 0 then ' FLAWLESS!' else '' end),
      case
        when v_coins > 0 or v_sp > 0 then format('%s ms · %s deaths · +%s Coins · +%s SP', v_time_ms, v_deaths, v_coins, v_sp)
        else format('%s ms · %s deaths · Replay', v_time_ms, v_deaths)
      end
    );

  elsif p_event = 'achievement_unlocked' and not v_profile.is_guest then
    select * into v_ach from public.achievements_catalog where id = (p_payload ->> 'achievementId');
    if found then
      insert into public.player_achievements (profile_id, achievement_id, reward_coins, reward_sp)
      values (v_profile.id, v_ach.id, v_ach.reward_coins, v_ach.reward_sp)
      on conflict (profile_id, achievement_id) do nothing;
      get diagnostics v_was_inserted = row_count;
      if v_was_inserted > 0 then
        update public.profiles set
          coins = coins + v_ach.reward_coins,
          skill_points = skill_points + v_ach.reward_sp
        where id = v_profile.id;
        insert into public.realtime_activity_feed (profile_id, callsign, event_type, achievement_id, headline, detail)
        values (
          v_profile.id,
          v_callsign,
          'achievement_unlocked',
          v_ach.id,
          format('%s unlocked "%s"', v_callsign, v_ach.title),
          format('+%s Coins · +%s SP', v_ach.reward_coins, v_ach.reward_sp)
        );
      end if;
    end if;
  end if;

  select * into v_profile from public.profiles where id = v_profile.id;

  return jsonb_build_object(
    'ok', true,
    'earnedCoins', v_coins,
    'earnedSP', v_sp,
    'coins', v_profile.coins,
    'skillPoints', v_profile.skill_points
  );
end;
$$;

grant execute on function public.is_guest_allowed_item(text) to anon, authenticated, service_role;
grant execute on function public.generate_unique_guest_username() to anon, authenticated, service_role;
grant execute on function public.rpc_generate_guest_username() to anon, authenticated, service_role;
grant execute on function public.rpc_auth_guest_signup(text, text) to anon, authenticated, service_role;
grant execute on function public.rpc_auth_rename_guest(text, text) to anon, authenticated, service_role;
