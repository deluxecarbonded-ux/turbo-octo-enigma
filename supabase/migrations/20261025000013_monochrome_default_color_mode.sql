-- ============================================================================
-- EXOTIC — Set Monochrome as Default Color Mode
-- 1. Updates public.player_settings.color_mode column default to 'monochrome'.
-- 2. Resets existing 'colored' defaults to 'monochrome' so Monochrome is the
--    baseline mode until a user explicitly switches to Colored in Settings.
-- ============================================================================

alter table public.player_settings
  alter column color_mode set default 'monochrome';

update public.player_settings
set color_mode = 'monochrome'
where color_mode = 'colored';
