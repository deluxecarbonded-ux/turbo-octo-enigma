-- Excord community features: durable read markers and ephemeral typing, private by default.
CREATE TABLE IF NOT EXISTS public.excord_reads (
 profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 channel_id text NOT NULL REFERENCES public.excord_channels(id) ON DELETE CASCADE,
 read_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(profile_id,channel_id)
);
CREATE TABLE IF NOT EXISTS public.excord_typing (
 profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 channel_id text NOT NULL REFERENCES public.excord_channels(id) ON DELETE CASCADE,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(profile_id,channel_id)
);
ALTER TABLE public.excord_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.excord_typing ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.excord_reads,public.excord_typing FROM anon,authenticated;
CREATE INDEX IF NOT EXISTS excord_typing_channel_idx ON public.excord_typing(channel_id,updated_at);
CREATE INDEX IF NOT EXISTS excord_saved_user_idx ON public.excord_bookmarks(profile_id,created_at DESC);
CREATE INDEX IF NOT EXISTS excord_events_server_idx ON public.excord_events(server_id,starts_at);
