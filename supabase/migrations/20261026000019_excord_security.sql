-- Excord HTTP gateway is the sole data boundary; no direct anonymous REST access.
DO $$ DECLARE t text; BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'excord_%' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
  END LOOP;
END $$;
-- Remove artificial seed boost counts. Boost purchases are not implemented.
UPDATE public.excord_servers SET boost_count=0, boost_tier=0 WHERE is_official;
ALTER TABLE public.excord_channels ADD COLUMN IF NOT EXISTS is_private boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS public.excord_reactions (
 message_id text NOT NULL REFERENCES public.excord_messages(id) ON DELETE CASCADE,
 profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 emoji text NOT NULL CHECK(emoji IN ('heart','fire','check','trophy','eyes')),
 PRIMARY KEY(message_id,profile_id,emoji)
);
CREATE TABLE IF NOT EXISTS public.excord_votes (
 message_id text NOT NULL REFERENCES public.excord_messages(id) ON DELETE CASCADE,
 profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 option_index integer NOT NULL CHECK(option_index BETWEEN 0 AND 7),
 PRIMARY KEY(message_id,profile_id)
);
CREATE TABLE IF NOT EXISTS public.excord_bans (
 server_id text NOT NULL REFERENCES public.excord_servers(id) ON DELETE CASCADE,
 profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 PRIMARY KEY(server_id,profile_id)
);
CREATE TABLE IF NOT EXISTS public.excord_rate_limits (
 profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 bucket text NOT NULL,
 window_at timestamptz NOT NULL DEFAULT now(),
 hits integer NOT NULL DEFAULT 1,
 PRIMARY KEY(profile_id,bucket)
);
ALTER TABLE public.excord_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.excord_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.excord_bans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.excord_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.excord_reactions, public.excord_votes, public.excord_bans, public.excord_rate_limits FROM anon,authenticated;
CREATE INDEX IF NOT EXISTS excord_member_profile_idx ON public.excord_server_members(profile_id);
CREATE INDEX IF NOT EXISTS excord_message_history_idx ON public.excord_messages(channel_id,created_at DESC,id DESC);
-- Deleting a game account also removes its owned servers rather than orphaning them.
CREATE OR REPLACE FUNCTION public.excord_delete_owned_servers() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 DELETE FROM public.excord_servers WHERE owner_id=OLD.id;
 RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS excord_profile_delete ON public.profiles;
CREATE TRIGGER excord_profile_delete BEFORE DELETE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.excord_delete_owned_servers();
CREATE TABLE IF NOT EXISTS public.excord_sessions (
 token_hash text PRIMARY KEY,
 profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL
);
ALTER TABLE public.excord_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.excord_sessions FROM anon,authenticated;
CREATE INDEX IF NOT EXISTS excord_sessions_profile_idx ON public.excord_sessions(profile_id);
-- Align the official hub's copy with the actual release; no claims of working calls or perks.
UPDATE public.excord_channels SET name='community-help',topic='Ask the community for help with Exotic and Excord.' WHERE id='1420070400000000102';
UPDATE public.excord_channels SET topic='Threaded strategy discussions for Gauntlet stages and Brawl.' WHERE id='1420070400000000106';
UPDATE public.excord_servers SET description='A community hub for registered Exotic players. Share strategies, find friends, and coordinate matches.' WHERE is_official;
CREATE TABLE IF NOT EXISTS public.excord_send_slots (
 profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 channel_id text NOT NULL REFERENCES public.excord_channels(id) ON DELETE CASCADE,
 next_at timestamptz NOT NULL,
 PRIMARY KEY(profile_id,channel_id)
);
ALTER TABLE public.excord_send_slots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.excord_send_slots FROM anon,authenticated;
CREATE UNIQUE INDEX IF NOT EXISTS excord_friend_pair_unique ON public.excord_friendships(least(requester_id,addressee_id),greatest(requester_id,addressee_id));
