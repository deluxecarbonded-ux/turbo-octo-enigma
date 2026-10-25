-- Remove troll, platformer, 2D, and monochrome UI copy from live catalog rows

update public.shop_items set description = '1928 vintage toon mouse with iconic twin round ears, pie-cut eyes, snout, and wagging tail.' where id = 'char_mickey';
update public.shop_items set description = 'Classic stick figure runner with full procedural multi-jointed running and aerial limbs.' where id = 'char_stickman';
update public.shop_items set name = 'Syobon Mischief Cat', description = 'Mischievous pointed-ear feline tribute to classic rage-bait trap gauntlets.' where id = 'char_cat';
update public.shop_items set description = '1930s cartoon rabbit with velocity-reactive floppy ears and cotton tail.' where id = 'char_bunny';
update public.shop_items set description = 'Gelatinous blob with harmonic wobble physics and suspended core bubbles.' where id = 'char_slime';
update public.shop_items set description = 'Skull-and-ribcage runner risen from a hundred previous trap deaths.' where id = 'char_skeleton';
update public.shop_items set description = 'High-contrast solid fill tuned for maximum silhouette clarity.' where id = 'skin_solid';
update public.shop_items set description = 'Formal evening suit with crisp shirt V-lapel, bow tie, and dress buttons.' where id = 'skin_tuxedo';
update public.shop_items set description = 'Crisp chessboard weave locked across ears, limbs, and torso.' where id = 'skin_checker';
update public.shop_items set description = 'Bold angled stripes cutting across your character geometry.' where id = 'skin_tiger';
update public.shop_items set description = 'Layered criss-cross cloth bandages earned the hard way.' where id = 'skin_bandage';
update public.shop_items set description = 'Darkened chamber pulsing with visible internal bone segments.' where id = 'skin_xray';
update public.shop_items set description = 'Living night-sky silhouette filled with drifting twinkling stars.' where id = 'skin_stardust';
update public.shop_items set description = 'Four-point stars twinkling, rotating, and ascending around your body.' where id = 'aura_sparkle';
update public.shop_items set description = 'Articulated bats with flapping wings orbiting in figure-eight rings.' where id = 'aura_bat';
update public.shop_items set description = 'Fluttering butterflies spiraling upward on gentle air currents.' where id = 'aura_butterfly';
update public.shop_items set description = 'Sweeping feathers drifting in vortex updrafts with ground pulse rings.' where id = 'aura_feather';
update public.shop_items set description = 'Crisp tumbling micro-cubes kicked up along footsteps and jumps.' where id = 'trail_dust';
update public.shop_items set description = 'Crisp 0 and 1 blocks streaming behind high-speed movement.' where id = 'trail_binary';
update public.shop_items set description = 'Plants a stone RIP monument to honor your previous attempts.' where id = 'emote_rip';

update public.achievements_catalog set description = 'Trigger 10 hidden trap mechanisms across runs.' where id = 'ach_trap_magnet';

update public.realtime_activity_feed
set headline = replace(headline, 'Monochrome Loadout Card', 'Runner Loadout Card')
where headline ilike '%Monochrome%';
