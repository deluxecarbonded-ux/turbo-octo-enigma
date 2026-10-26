-- ============================================================================
-- EXOTIC — Migration 000018: Excord Community Schema
-- Community data scaffold using the same
-- authenticated public.profiles account (strictly blocked for Guest accounts,
-- zero mock users, full cascading cleanup on account deletion).
-- ============================================================================

create table if not exists public.excord_user_profiles (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  display_name text not null default '',
  pronouns text not null default '',
  bio text not null default '',
  presence_status text not null default 'online'
    check (presence_status in ('online', 'idle', 'dnd', 'invisible')),
  custom_status_text text not null default '',
  custom_status_icon text not null default '',
  custom_status_expires_at timestamptz,
  banner_style text not null default 'obsidian',
  avatar_frame text not null default 'none',
  activity_text text not null default 'Exploring Excord',
  server_folders jsonb not null default '[]'::jsonb,
  user_notes jsonb not null default '{}'::jsonb,
  read_states jsonb not null default '{}'::jsonb,
  quest_claims text[] not null default '{}'::text[],
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.excord_friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null check (status in ('pending', 'accepted', 'blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint excord_friendships_no_self check (requester_id <> addressee_id),
  unique (requester_id, addressee_id)
);

create table if not exists public.excord_servers (
  id text primary key,
  name text not null,
  description text not null default '',
  icon_glyph text not null default 'logo',
  template_key text not null default 'gaming',
  owner_id uuid references public.profiles(id) on delete set null,
  invite_code text unique not null,
  is_public boolean not null default true,
  is_official boolean not null default false,
  boost_count integer not null default 0,
  boost_tier integer not null default 0,
  automod_config jsonb not null default '{"enabled":true,"blockedWords":[],"blockInvites":false,"maxMentions":6}'::jsonb,
  soundboard_custom jsonb not null default '[]'::jsonb,
  stickers_custom jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.excord_roles (
  id text primary key,
  server_id text not null references public.excord_servers(id) on delete cascade,
  name text not null,
  color_hex text not null default '#818cf8',
  position integer not null default 1,
  hoist boolean not null default true,
  permissions bigint not null default 2047,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.excord_server_members (
  server_id text not null references public.excord_servers(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  nickname text not null default '',
  role_ids text[] not null default '{}'::text[],
  boosts_given integer not null default 0,
  muted_server boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (server_id, profile_id)
);

create table if not exists public.excord_channels (
  id text primary key,
  server_id text references public.excord_servers(id) on delete cascade,
  category_name text not null default 'TEXT CHANNELS',
  name text not null,
  channel_type text not null
    check (channel_type in ('text', 'announcement', 'forum', 'media', 'voice', 'stage', 'dm', 'group_dm', 'thread')),
  topic text not null default '',
  position integer not null default 0,
  slowmode_sec integer not null default 0,
  forum_tags text[] not null default array['Strategy','Showcase','Brawl','Speedrun','Question']::text[],
  applied_tags text[] not null default '{}'::text[],
  dm_member_ids uuid[] not null default '{}'::uuid[],
  parent_channel_id text references public.excord_channels(id) on delete cascade,
  starter_message_id text,
  following_channel_ids text[] not null default '{}'::text[],
  archived boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.excord_messages (
  id text primary key,
  channel_id text not null references public.excord_channels(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete cascade,
  webhook_name text,
  content text not null default '',
  reply_to_id text references public.excord_messages(id) on delete set null,
  forwarded_from jsonb,
  attachments jsonb not null default '[]'::jsonb,
  embeds jsonb not null default '[]'::jsonb,
  poll jsonb,
  reactions jsonb not null default '{}'::jsonb,
  sticker_id text,
  pinned boolean not null default false,
  edited_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_excord_messages_channel_id_created
  on public.excord_messages (channel_id, id desc);

create table if not exists public.excord_bookmarks (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  message_id text not null references public.excord_messages(id) on delete cascade,
  note text not null default '',
  created_at timestamptz not null default now(),
  primary key (profile_id, message_id)
);

create table if not exists public.excord_events (
  id text primary key,
  server_id text not null references public.excord_servers(id) on delete cascade,
  creator_id uuid references public.profiles(id) on delete set null,
  title text not null,
  description text not null default '',
  location_label text not null default 'General Voice',
  starts_at timestamptz not null,
  interested_ids uuid[] not null default '{}'::uuid[],
  created_at timestamptz not null default now()
);

create table if not exists public.excord_voice_states (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  channel_id text not null references public.excord_channels(id) on delete cascade,
  server_id text,
  muted boolean not null default false,
  deafened boolean not null default false,
  noise_suppression boolean not null default true,
  camera_on boolean not null default false,
  screen_sharing boolean not null default false,
  speaking boolean not null default false,
  hand_raised boolean not null default false,
  is_stage_speaker boolean not null default false,
  active_activity jsonb,
  rtc_signal jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.excord_webhooks (
  id text primary key,
  server_id text not null references public.excord_servers(id) on delete cascade,
  channel_id text not null references public.excord_channels(id) on delete cascade,
  name text not null,
  token text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.excord_audit_logs (
  id text primary key,
  server_id text not null references public.excord_servers(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_username text not null default '',
  action_type text not null,
  target_label text not null default '',
  details text not null default '',
  created_at timestamptz not null default now()
);

-- Seed ONLY the official community server structure (ZERO mock users, ZERO fake user messages!)
insert into public.excord_servers (
  id, name, description, icon_glyph, template_key, owner_id, invite_code, is_public, is_official, boost_count, boost_tier
) values (
  '1420070400000000001',
  'Exotic Official',
  'Official community hub for registered Exotic runners and Brawl contenders. Coordinate matches, share clips, open strategy forums, and join voice squads.',
  'logo',
  'gaming',
  null,
  'EXOTIC',
  true,
  true,
  0,
  0
)
on conflict (id) do update set
  description = excluded.description,
  is_public = true,
  is_official = true;

insert into public.excord_roles (id, server_id, name, color_hex, position, hoist, permissions, is_default) values
  ('role_exotic_admin',   '1420070400000000001', 'Architect',      '#f43f5e', 40, true,  65535, false),
  ('role_exotic_mod',     '1420070400000000001', 'Warden',         '#f59e0b', 30, true,  32767, false),
  ('role_exotic_booster', '1420070400000000001', 'Server Booster', '#c084fc', 20, true,  4095,  false),
  ('role_exotic_runner',  '1420070400000000001', 'Runner',         '#38bdf8', 10, true,  2047,  true)
on conflict (id) do nothing;

insert into public.excord_channels (id, server_id, category_name, name, channel_type, topic, position) values
  ('1420070400000000101', '1420070400000000001', 'INFORMATION',      'announcements',     'announcement', 'Official season updates, character drops, and tournament dispatches.', 1),
  ('1420070400000000102', '1420070400000000001', 'INFORMATION',      'quests-and-perks',  'text',         'Check Excord Quests, slash commands (/stats, /loadout, /poll, /roll), and Server Boost perks.', 2),
  ('1420070400000000103', '1420070400000000001', 'COMMUNITY CHAT',   'general',           'text',         'Main hangout for registered Exotic players. Share runs, reactions, polls, and voice notes.', 3),
  ('1420070400000000104', '1420070400000000001', 'COMMUNITY CHAT',   'brawl-matchmaking', 'text',         'Post Brawl room codes, squad up for 1v1 or 4-fighter arenas, and compare weapon combos.', 4),
  ('1420070400000000105', '1420070400000000001', 'COMMUNITY CHAT',   'media-showcase',    'media',        'Share Loadout Portraits, canvas sketches, and stage clear captures.', 5),
  ('1420070400000000106', '1420070400000000001', 'STRATEGY FORUMS',  'stage-strategies',  'forum',        'Threaded strategy discussions for Stages 01–08, hidden Skill Orbs, and par times.', 6),
  ('1420070400000000107', '1420070400000000001', 'VOICE & STAGE',    'Lobby Voice',       'voice',        'Open voice channel with Soundboard, Screen Share, Camera, and Embedded Activities.', 7),
  ('1420070400000000108', '1420070400000000001', 'VOICE & STAGE',    'Brawl Corner',      'voice',        'Low-latency voice squad room for Brawl sparring and Activities.', 8),
  ('1420070400000000109', '1420070400000000001', 'VOICE & STAGE',    'Town Hall Stage',   'stage',        'Moderated speaker podium with Raise Hand queue and audience reactions.', 9)
on conflict (id) do nothing;
