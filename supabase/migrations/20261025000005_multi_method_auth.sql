-- ============================================================================
-- EXOTIC — Multi-Method User Authentication (Fingerprint, Face ID, PIN, Password)
-- Migration: 20261025000005_multi_method_auth.sql
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

-- 1. Track chosen auth factor metadata on public.profiles
alter table public.profiles
  add column if not exists auth_method text not null default 'none';

alter table public.profiles
  drop constraint if exists chk_profiles_auth_method;

alter table public.profiles
  add constraint chk_profiles_auth_method
  check (auth_method in ('none', 'password', 'pin', 'fingerprint', 'faceid'));

-- 2. Private table for salted bcrypt hashes & biometric passkey handles
--    Kept separate from public.profiles so hashes never appear in sync snapshots or SSE notifications
create table if not exists public.profile_credentials (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  auth_method text not null check (auth_method in ('password', 'pin', 'fingerprint', 'faceid')),
  credential_hash text not null,
  biometric_credential_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profile_credentials enable row level security;

-- Drop legacy 2-parameter overloads to avoid PostgREST overload ambiguity
drop function if exists public.rpc_auth_signup(text, text);
drop function if exists public.rpc_auth_signin(text, text);

-- 3. Session Status RPC (includes chosen authMethod & biometric handle)
create or replace function public.rpc_auth_session_status(p_client_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
  v_cred public.profile_credentials;
  v_ck text := left(btrim(coalesce(p_client_key, '')), 96);
begin
  if v_ck = '' then
    return jsonb_build_object(
      'ok', true,
      'hasAccount', false,
      'signedIn', false,
      'username', null,
      'authMethod', null,
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
      'biometricCredentialId', null,
      'snapshot', null
    );
  end if;

  select * into v_cred
  from public.profile_credentials
  where profile_id = v_profile.id;

  return jsonb_build_object(
    'ok', true,
    'hasAccount', true,
    'signedIn', v_profile.is_signed_in,
    'username', v_profile.username,
    'authMethod', coalesce(v_cred.auth_method, v_profile.auth_method, 'none'),
    'biometricCredentialId', v_cred.biometric_credential_id,
    'profileId', v_profile.id,
    'snapshot', case when v_profile.is_signed_in then public.rpc_sync_runner_state(v_ck, null) else null end
  );
end;
$$;

-- 4. Username Check RPC (returns registered authMethod & biometricCredentialId for Sign In)
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

-- 5. Sign Up RPC with User's Chosen Authentication Factor (Password / PIN / Fingerprint / Face ID)
create or replace function public.rpc_auth_signup(
  p_client_key text,
  p_username text,
  p_auth_method text default 'password',
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
  v_method text := lower(btrim(coalesce(p_auth_method, 'password')));
  v_secret text;
  v_bio_id text := nullif(left(btrim(coalesce(p_biometric_id, '')), 256), '');
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
    return jsonb_build_object(
      'ok', false,
      'code', 'USERNAME_INVALID',
      'reason', 'Username is invalid'
    );
  end if;

  if exists(select 1 from public.profiles where lower(username) = lower(v_u)) then
    return jsonb_build_object(
      'ok', false,
      'code', 'USERNAME_TAKEN',
      'reason', 'Username is taken'
    );
  end if;

  if v_method not in ('password', 'pin', 'fingerprint', 'faceid') then
    return jsonb_build_object(
      'ok', false,
      'code', 'AUTH_METHOD_INVALID',
      'reason', 'Choose Password, PIN, Fingerprint, or Face ID'
    );
  end if;

  if v_method = 'password' then
    v_secret := coalesce(p_credential, '');
    if char_length(v_secret) < 4 or char_length(v_secret) > 64 then
      return jsonb_build_object(
        'ok', false,
        'code', 'CREDENTIAL_INVALID',
        'reason', 'Password must be 4 to 64 characters'
      );
    end if;
  elsif v_method = 'pin' then
    v_secret := btrim(coalesce(p_credential, ''));
    if v_secret !~ '^[0-9]{4,8}$' then
      return jsonb_build_object(
        'ok', false,
        'code', 'CREDENTIAL_INVALID',
        'reason', 'PIN must be 4 to 8 digits'
      );
    end if;
  elsif v_method = 'fingerprint' then
    v_secret := btrim(coalesce(p_credential, ''));
    if char_length(v_secret) < 16 then
      return jsonb_build_object(
        'ok', false,
        'code', 'CREDENTIAL_INVALID',
        'reason', 'Scan your Fingerprint to complete registration'
      );
    end if;
  elsif v_method = 'faceid' then
    v_secret := btrim(coalesce(p_credential, ''));
    if char_length(v_secret) < 16 then
      return jsonb_build_object(
        'ok', false,
        'code', 'CREDENTIAL_INVALID',
        'reason', 'Scan Face ID to complete registration'
      );
    end if;
  end if;

  insert into public.profiles (client_key, username, callsign, is_signed_in, auth_method)
  values (v_ck, v_u, v_u, true, v_method)
  returning * into v_profile;

  insert into public.profile_credentials (
    profile_id,
    auth_method,
    credential_hash,
    biometric_credential_id
  )
  values (
    v_profile.id,
    v_method,
    extensions.crypt(v_secret, extensions.gen_salt('bf', 10)),
    case when v_method in ('fingerprint', 'faceid') then v_bio_id else null end
  );

  return jsonb_build_object(
    'ok', true,
    'hasAccount', true,
    'signedIn', true,
    'username', v_profile.username,
    'authMethod', v_method,
    'biometricCredentialId', case when v_method in ('fingerprint', 'faceid') then v_bio_id else null end,
    'profileId', v_profile.id,
    'snapshot', public.rpc_sync_runner_state(v_ck, null)
  );
end;
$$;

-- 6. Sign In RPC with Credential Verification (and seamless credential enrollment for legacy accounts)
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
  v_bio_id text := nullif(left(btrim(coalesce(p_biometric_id, '')), 256), '');
  v_bound public.profiles;
  v_has_bound boolean := false;
  v_target public.profiles;
  v_cred public.profile_credentials;
  v_has_cred boolean := false;
  v_method_label text;
begin
  if v_ck = '' then
    return jsonb_build_object('ok', false, 'code', 'CLIENT_KEY_REQUIRED', 'reason', 'Session key required.');
  end if;

  if v_u !~ '^[A-Za-z0-9_]{3,20}$' then
    return jsonb_build_object(
      'ok', false,
      'code', 'USERNAME_INVALID',
      'reason', 'Username is invalid'
    );
  end if;

  select * into v_target
  from public.profiles
  where lower(username) = lower(v_u)
  for update;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'code', 'USERNAME_NOT_REGISTERED',
      'reason', 'Username is not registered'
    );
  end if;

  select * into v_bound
  from public.profiles
  where client_key = v_ck
  for update;
  v_has_bound := found;

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
  where profile_id = v_target.id
  for update;
  v_has_cred := found;

  if v_has_cred then
    v_method_label := case v_cred.auth_method
      when 'faceid' then 'Face ID'
      when 'fingerprint' then 'Fingerprint'
      when 'pin' then 'PIN'
      else 'Password'
    end;

    if v_method = '' then
      v_method := v_cred.auth_method;
    end if;

    if v_method <> v_cred.auth_method then
      return jsonb_build_object(
        'ok', false,
        'code', 'AUTH_METHOD_MISMATCH',
        'expectedMethod', v_cred.auth_method,
        'biometricCredentialId', v_cred.biometric_credential_id,
        'reason', format('This account uses %s authentication', v_method_label)
      );
    end if;

    if v_cred.auth_method = 'password' then
      v_secret := coalesce(p_credential, '');
    else
      v_secret := btrim(coalesce(p_credential, ''));
    end if;

    if v_secret = '' or extensions.crypt(v_secret, v_cred.credential_hash) <> v_cred.credential_hash then
      return jsonb_build_object(
        'ok', false,
        'code', 'INVALID_CREDENTIAL',
        'expectedMethod', v_cred.auth_method,
        'biometricCredentialId', v_cred.biometric_credential_id,
        'reason', case v_cred.auth_method
          when 'pin' then 'Incorrect PIN'
          when 'fingerprint' then 'Fingerprint verification failed for this account'
          when 'faceid' then 'Face ID verification failed for this account'
          else 'Incorrect password'
        end
      );
    end if;
  else
    -- Pre-existing account with no stored secret yet: bind chosen auth method on Sign In
    if v_method not in ('password', 'pin', 'fingerprint', 'faceid') then
      return jsonb_build_object(
        'ok', false,
        'code', 'AUTH_METHOD_INVALID',
        'reason', 'Choose Password, PIN, Fingerprint, or Face ID'
      );
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
      v_secret := btrim(coalesce(p_credential, ''));
      if char_length(v_secret) < 16 then
        return jsonb_build_object('ok', false, 'code', 'CREDENTIAL_INVALID', 'reason', 'Scan your Fingerprint to sign in');
      end if;
    elsif v_method = 'faceid' then
      v_secret := btrim(coalesce(p_credential, ''));
      if char_length(v_secret) < 16 then
        return jsonb_build_object('ok', false, 'code', 'CREDENTIAL_INVALID', 'reason', 'Scan Face ID to sign in');
      end if;
    end if;

    insert into public.profile_credentials (
      profile_id,
      auth_method,
      credential_hash,
      biometric_credential_id
    )
    values (
      v_target.id,
      v_method,
      extensions.crypt(v_secret, extensions.gen_salt('bf', 10)),
      case when v_method in ('fingerprint', 'faceid') then v_bio_id else null end
    );
  end if;

  update public.profiles
  set
    client_key = v_ck,
    is_signed_in = true,
    auth_method = coalesce(v_cred.auth_method, v_method, auth_method),
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
    'biometricCredentialId', coalesce(v_cred.biometric_credential_id, v_bio_id),
    'profileId', v_target.id,
    'snapshot', public.rpc_sync_runner_state(v_ck, null)
  );
end;
$$;

-- 7. Sign Out RPC (preserves boundUsername & authMethod for instant Sign In)
create or replace function public.rpc_auth_signout(p_client_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ck text := left(btrim(coalesce(p_client_key, '')), 96);
  v_profile public.profiles;
  v_cred public.profile_credentials;
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
      'boundUsername', null,
      'authMethod', null
    );
  end if;

  select * into v_cred
  from public.profile_credentials
  where profile_id = v_profile.id;

  update public.profiles
  set
    is_signed_in = false,
    updated_at = now()
  where id = v_profile.id;

  delete from public.live_presence_sessions
  where profile_id = v_profile.id or client_key = v_ck;

  return jsonb_build_object(
    'ok', true,
    'hasAccount', true,
    'signedIn', false,
    'boundUsername', v_profile.username,
    'authMethod', coalesce(v_cred.auth_method, v_profile.auth_method, 'none'),
    'biometricCredentialId', v_cred.biometric_credential_id
  );
end;
$$;

grant execute on function public.rpc_auth_session_status(text) to anon, authenticated, service_role;
grant execute on function public.rpc_check_username(text, text) to anon, authenticated, service_role;
grant execute on function public.rpc_auth_signup(text, text, text, text, text) to anon, authenticated, service_role;
grant execute on function public.rpc_auth_signin(text, text, text, text, text) to anon, authenticated, service_role;
grant execute on function public.rpc_auth_signout(text) to anon, authenticated, service_role;
grant execute on function public.rpc_auth_delete_account(text) to anon, authenticated, service_role;
