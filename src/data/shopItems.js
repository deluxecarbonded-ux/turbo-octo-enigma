(function () {
  const CATEGORIES = [
    { id: 'characters', label: 'Characters', currency: 'coins' },
    { id: 'skins', label: 'Skins', currency: 'coins' },
    { id: 'auras', label: 'Auras', currency: 'coins' },
    { id: 'trails', label: 'Trails', currency: 'coins' },
    { id: 'emotes', label: 'Emotes & Taunts', currency: 'coins' },
    { id: 'upgrades', label: 'Upgrades', currency: 'sp' }
  ];

  const ITEMS = [
    // CHARACTERS (Coins — 21 Playable Characters)
    {
      id: 'char_classic',
      category: 'characters',
      name: 'Exotic Cube',
      tier: 'Starter',
      cost: 0,
      currency: 'coins',
      desc: 'Razor-edged geometric runner whose expressive eyes react to speed and danger.'
    },
    {
      id: 'char_mickey',
      category: 'characters',
      name: 'Mickey Mouse',
      tier: 'Starter',
      cost: 0,
      currency: 'coins',
      desc: '1928 vintage toon mouse with iconic twin round ears, pie-cut eyes, snout, and wagging tail.'
    },
    {
      id: 'char_stickman',
      category: 'characters',
      name: 'Kinetic Stickman',
      tier: 'Starter',
      cost: 0,
      currency: 'coins',
      desc: 'Classic stick figure runner with full procedural multi-jointed running and aerial limbs.'
    },
    {
      id: 'char_scream',
      category: 'characters',
      name: 'Scream',
      tier: 'Halloween Special',
      cost: 95,
      currency: 'coins',
      desc: 'Shrouded Halloween phantom wearing the elongated Ghostface scream mask, billowing tattered reaper cloak, and gleaming prop blade. Full account required.'
    },
    {
      id: 'char_tom',
      category: 'characters',
      name: 'Tom',
      tier: 'Rare',
      cost: 65,
      currency: 'coins',
      desc: 'Scheming housecat rival with wide-set ears, cheek tufts, arched brows, and a white-tipped tail. Full account required.'
    },
    {
      id: 'char_jerry',
      category: 'characters',
      name: 'Jerry',
      tier: 'Rare',
      cost: 60,
      currency: 'coins',
      desc: 'Quick-witted little mouse sporting oversized saucer ears, forehead curl, bright eyes, and nimble stride. Full account required.'
    },
    {
      id: 'char_bugs_bunny',
      category: 'characters',
      name: 'Bugs Bunny',
      tier: 'Epic',
      cost: 85,
      currency: 'coins',
      desc: 'Suave wise-cracking hare with sky-high ears, puffed cheeks, half-lidded gaze, and buck teeth. Full account required.'
    },
    {
      id: 'char_donald_duck',
      category: 'characters',
      name: 'Donald Duck',
      tier: 'Epic',
      cost: 90,
      currency: 'coins',
      desc: 'Feisty sailor-capped duck featuring a wide expressive bill, bow-tied tunic, tail feathers, and webbed stride. Full account required.'
    },
    {
      id: 'char_cat',
      category: 'characters',
      name: 'Syobon Mischief Cat',
      tier: 'Uncommon',
      cost: 35,
      currency: 'coins',
      desc: 'Mischievous pointed-ear feline tribute to classic rage-bait trap gauntlets.'
    },
    {
      id: 'char_bunny',
      category: 'characters',
      name: 'Rubberhose Rabbit',
      tier: 'Uncommon',
      cost: 50,
      currency: 'coins',
      desc: '1930s cartoon rabbit with velocity-reactive floppy ears and cotton tail.'
    },
    {
      id: 'char_shinobi',
      category: 'characters',
      name: 'Shadow Shinobi',
      tier: 'Uncommon',
      cost: 60,
      currency: 'coins',
      desc: 'Masked infiltrator with dual cloth headband tails trailing behind every jump.'
    },
    {
      id: 'char_slime',
      category: 'characters',
      name: 'Jiggle Slime',
      tier: 'Rare',
      cost: 75,
      currency: 'coins',
      desc: 'Gelatinous blob with harmonic wobble physics and suspended core bubbles.'
    },
    {
      id: 'char_knight',
      category: 'characters',
      name: 'Hollow Vanguard',
      tier: 'Rare',
      cost: 85,
      currency: 'coins',
      desc: 'Twin-horned helm warrior with an armored slit visor built to endure betrayal.'
    },
    {
      id: 'char_skeleton',
      category: 'characters',
      name: 'Rattle Bones',
      tier: 'Rare',
      cost: 100,
      currency: 'coins',
      desc: 'Skull-and-ribcage runner risen from a hundred previous trap deaths.'
    },
    {
      id: 'char_imp',
      category: 'characters',
      name: 'Rage Imp',
      tier: 'Rare',
      cost: 115,
      currency: 'coins',
      desc: 'Curved-horn trickster sporting sharp slanted eyes that match the level designer.'
    },
    {
      id: 'char_astronaut',
      category: 'characters',
      name: 'Void Spaceman',
      tier: 'Epic',
      cost: 135,
      currency: 'coins',
      desc: 'Pressurized lunar explorer with life-support pack and reflective dome visor.'
    },
    {
      id: 'char_phantom',
      category: 'characters',
      name: 'Cloaked Wraith',
      tier: 'Epic',
      cost: 150,
      currency: 'coins',
      desc: 'Hooded spirit gliding slightly above surfaces with an animated scalloped cloak.'
    },
    {
      id: 'char_tvhead',
      category: 'characters',
      name: 'CRT Broadcast',
      tier: 'Epic',
      cost: 170,
      currency: 'coins',
      desc: 'Retro television-headed runner with rabbit-ear antennas and reactive screen expressions.'
    },
    {
      id: 'char_cyborg',
      category: 'characters',
      name: 'Unit-01 Mono',
      tier: 'Epic',
      cost: 190,
      currency: 'coins',
      desc: 'Precision machine chassis featuring a scanning mono-visor and kinetic antenna.'
    },
    {
      id: 'char_ronin',
      category: 'characters',
      name: 'Kasa Ronin',
      tier: 'Mythic',
      cost: 220,
      currency: 'coins',
      desc: 'Wandering duelist crowned with a wide geometric kasa hat and focused gaze.'
    },
    {
      id: 'char_monolith',
      category: 'characters',
      name: 'The Obelisk',
      tier: 'Exotic',
      cost: 260,
      currency: 'coins',
      desc: 'Sentient floating relic housing a single tracking geometric pupil.'
    },

    // SKINS (Coins — Base default + 23 Coin-unlockable Skins compatible with every Character)
    {
      id: 'skin_solid',
      category: 'skins',
      name: 'Pure Solid',
      tier: 'Default',
      cost: 0,
      currency: 'coins',
      desc: 'High-contrast solid fill tuned for maximum silhouette clarity.'
    },
    {
      id: 'skin_inverted',
      category: 'skins',
      name: 'Inverted Core',
      tier: 'Common',
      cost: 25,
      currency: 'coins',
      desc: 'Swaps core polarity with an inner geometric chamber.'
    },
    {
      id: 'skin_steamboat',
      category: 'skins',
      name: '1928 Steamboat Shorts',
      tier: 'Uncommon',
      cost: 35,
      currency: 'coins',
      desc: 'Classic vintage cartoon two-tone outfit with contrasting buttoned shorts.'
    },
    {
      id: 'skin_sailor',
      category: 'skins',
      name: 'Sailor Regalia',
      tier: 'Uncommon',
      cost: 40,
      currency: 'coins',
      desc: 'Nautical deck tunic sporting crisp collar stripes, V-neck kerchief, and front bow knot. Full account required.'
    },
    {
      id: 'skin_polka',
      category: 'skins',
      name: 'Vintage Polka',
      tier: 'Uncommon',
      cost: 55,
      currency: 'coins',
      desc: 'Staggered cartoon polka-dot weave locked cleanly across ears, limbs, and torso. Full account required.'
    },
    {
      id: 'skin_chevron',
      category: 'skins',
      name: 'Velocity Chevron',
      tier: 'Rare',
      cost: 75,
      currency: 'coins',
      desc: 'Kinetic directional chevron bands surging upward through your runner silhouette. Full account required.'
    },
    {
      id: 'skin_harlequin',
      category: 'skins',
      name: 'Harlequin Argyle',
      tier: 'Rare',
      cost: 95,
      currency: 'coins',
      desc: 'Classic theatrical diamond lattice inspired by slapstick stage performers. Full account required.'
    },
    {
      id: 'skin_filmstrip',
      category: 'skins',
      name: 'Celluloid Reel',
      tier: 'Epic',
      cost: 120,
      currency: 'coins',
      desc: 'Scrolling cinema reel perforations and frame bars straight from a projector booth. Full account required.'
    },
    {
      id: 'skin_mosaic',
      category: 'skins',
      name: 'Shattered Mosaic',
      tier: 'Epic',
      cost: 145,
      currency: 'coins',
      desc: 'Interlocking faceted geometric shards with alternating contrast plates. Full account required.'
    },
    {
      id: 'skin_eclipse',
      category: 'skins',
      name: 'Lunar Corona',
      tier: 'Mythic',
      cost: 170,
      currency: 'coins',
      desc: 'Concentric eclipse rings expanding gently from a shadowed inner crescent. Full account required.'
    },
    {
      id: 'skin_cipher',
      category: 'skins',
      name: 'Binary Cipher',
      tier: 'Exotic',
      cost: 205,
      currency: 'coins',
      desc: 'Cascading vertical glyph columns streaming smoothly across your form. Full account required.'
    },
    {
      id: 'skin_sketch',
      category: 'skins',
      name: 'Animator Pencil',
      tier: 'Uncommon',
      cost: 45,
      currency: 'coins',
      desc: 'Hand-drawn graphite crosshatch shading straight off an animation desk.'
    },
    {
      id: 'skin_split',
      category: 'skins',
      name: 'Duality Split',
      tier: 'Uncommon',
      cost: 50,
      currency: 'coins',
      desc: 'Bilateral half-light, half-shadow finish with counter-balanced eye contrast.'
    },
    {
      id: 'skin_tuxedo',
      category: 'skins',
      name: 'Dapper Tuxedo',
      tier: 'Rare',
      cost: 60,
      currency: 'coins',
      desc: 'Formal evening suit with crisp shirt V-lapel, bow tie, and dress buttons.'
    },
    {
      id: 'skin_toon_ink',
      category: 'skins',
      name: 'Rubberhose Inkblot',
      tier: 'Rare',
      cost: 70,
      currency: 'coins',
      desc: 'Glossy vintage cel-ink finish with crescent highlights and dripping ink motes.'
    },
    {
      id: 'skin_checker',
      category: 'skins',
      name: 'Grandmaster Grid',
      tier: 'Rare',
      cost: 80,
      currency: 'coins',
      desc: 'Crisp chessboard weave locked across ears, limbs, and torso.'
    },
    {
      id: 'skin_tiger',
      category: 'skins',
      name: 'Zebra Slash',
      tier: 'Rare',
      cost: 90,
      currency: 'coins',
      desc: 'Bold angled stripes cutting across your character geometry.'
    },
    {
      id: 'skin_halftone',
      category: 'skins',
      name: 'Print Halftone',
      tier: 'Rare',
      cost: 100,
      currency: 'coins',
      desc: 'Editorial comic-print ink dot-matrix pattern across the body.'
    },
    {
      id: 'skin_bandage',
      category: 'skins',
      name: 'Survivor Wraps',
      tier: 'Epic',
      cost: 115,
      currency: 'coins',
      desc: 'Layered criss-cross cloth bandages earned the hard way.'
    },
    {
      id: 'skin_scanline',
      category: 'skins',
      name: 'CRT Scanline',
      tier: 'Epic',
      cost: 125,
      currency: 'coins',
      desc: 'Scrolling horizontal raster bars pulsing across your silhouette.'
    },
    {
      id: 'skin_xray',
      category: 'skins',
      name: 'X-Ray Fluoroscope',
      tier: 'Epic',
      cost: 135,
      currency: 'coins',
      desc: 'Darkened chamber pulsing with visible internal bone segments.'
    },
    {
      id: 'skin_hollow',
      category: 'skins',
      name: 'Chamber Cutout',
      tier: 'Epic',
      cost: 150,
      currency: 'coins',
      desc: 'Carved negative-space interior housing a suspended pulsing core.'
    },
    {
      id: 'skin_stardust',
      category: 'skins',
      name: 'Cosmic Negative',
      tier: 'Mythic',
      cost: 175,
      currency: 'coins',
      desc: 'Living night-sky silhouette filled with drifting twinkling stars.'
    },
    {
      id: 'skin_glitch',
      category: 'skins',
      name: 'Phase Anomaly',
      tier: 'Exotic',
      cost: 195,
      currency: 'coins',
      desc: 'Periodic horizontal slice shifts when sprinting or airborne.'
    },

    // AURAS (Roblox-inspired full-body orbital & particle auras - Coins)
    {
      id: 'aura_none',
      category: 'auras',
      name: 'Unbound Silence',
      tier: 'Starter',
      cost: 0,
      currency: 'coins',
      desc: 'Clean silhouette with no ambient emission.'
    },
    {
      id: 'aura_sparkle',
      category: 'auras',
      name: 'Sparkle Aura',
      tier: 'Uncommon',
      cost: 35,
      currency: 'coins',
      desc: 'Four-point stars twinkling, rotating, and ascending around your body.'
    },
    {
      id: 'aura_bat',
      category: 'auras',
      name: 'Bat Swarm Aura',
      tier: 'Rare',
      cost: 70,
      currency: 'coins',
      desc: 'Articulated bats with flapping wings orbiting in figure-eight rings.'
    },
    {
      id: 'aura_butterfly',
      category: 'auras',
      name: 'Butterfly Aura',
      tier: 'Rare',
      cost: 90,
      currency: 'coins',
      desc: 'Fluttering butterflies spiraling upward on gentle air currents.'
    },
    {
      id: 'aura_feather',
      category: 'auras',
      name: 'Seraph Feather Aura',
      tier: 'Epic',
      cost: 125,
      currency: 'coins',
      desc: 'Sweeping feathers drifting in vortex updrafts with ground pulse rings.'
    },
    {
      id: 'aura_vortex',
      category: 'auras',
      name: 'Void Rift Aura',
      tier: 'Epic',
      cost: 165,
      currency: 'coins',
      desc: 'Levitating monolith shards, solid shockwave rings, and rising dark-matter motes.'
    },
    {
      id: 'aura_crown',
      category: 'auras',
      name: 'Sovereign Crown Aura',
      tier: 'Mythic',
      cost: 220,
      currency: 'coins',
      desc: 'Floating geometric crown overhead with orbital diamonds and ascending light pillars.'
    },
    {
      id: 'aura_eclipse',
      category: 'auras',
      name: 'Celestial Eclipse Aura',
      tier: 'Exotic',
      cost: 290,
      currency: 'coins',
      desc: 'Dual tilted orbital rings, an eclipsed solar disc halo, and cascading starlight.'
    },

    // TRAILS (Coins)
    {
      id: 'trail_none',
      category: 'trails',
      name: 'No Wake',
      tier: 'Starter',
      cost: 0,
      currency: 'coins',
      desc: 'No motion trail behind movement.'
    },
    {
      id: 'trail_dust',
      category: 'trails',
      name: 'Pixel Dust',
      tier: 'Uncommon',
      cost: 30,
      currency: 'coins',
      desc: 'Crisp tumbling micro-cubes kicked up along footsteps and jumps.'
    },
    {
      id: 'trail_ghost',
      category: 'trails',
      name: 'Afterimage Echo',
      tier: 'Rare',
      cost: 60,
      currency: 'coins',
      desc: 'Fading silhouette clones trailing your exact aerial trajectory.'
    },
    {
      id: 'trail_ribbon',
      category: 'trails',
      name: 'Razor Ribbon',
      tier: 'Rare',
      cost: 85,
      currency: 'coins',
      desc: 'Continuous tapered geometric slipstream flowing smoothly behind your core.'
    },
    {
      id: 'trail_rings',
      category: 'trails',
      name: 'Sonic Rings',
      tier: 'Epic',
      cost: 115,
      currency: 'coins',
      desc: 'Expanding solid cutout shock-rings emitted during sprints and jumps.'
    },
    {
      id: 'trail_shards',
      category: 'trails',
      name: 'Prism Shards',
      tier: 'Epic',
      cost: 140,
      currency: 'coins',
      desc: 'Spinning diamond splinters scattering into your wake.'
    },
    {
      id: 'trail_bolt',
      category: 'trails',
      name: 'Static Zigzag',
      tier: 'Mythic',
      cost: 170,
      currency: 'coins',
      desc: 'Angular solid lightning shards snapping across recent positions.'
    },
    {
      id: 'trail_binary',
      category: 'trails',
      name: 'Glyph Wake',
      tier: 'Exotic',
      cost: 200,
      currency: 'coins',
      desc: 'Crisp 0 and 1 blocks streaming behind high-speed movement.'
    },

    // EMOTES / TAUNTS (Coins)
    {
      id: 'emote_salute',
      category: 'emotes',
      name: 'Sharp Salute',
      tier: 'Starter',
      cost: 0,
      currency: 'coins',
      desc: 'Press E in-game to snap a crisp tilt and overhead alert glyph.'
    },
    {
      id: 'emote_clap',
      category: 'emotes',
      name: 'Slow Clap',
      tier: 'Uncommon',
      cost: 25,
      currency: 'coins',
      desc: 'Sarcastic rhythmic claps to applaud the trap that almost got you.'
    },
    {
      id: 'emote_backflip',
      category: 'emotes',
      name: 'Showoff Backflip',
      tier: 'Rare',
      cost: 55,
      currency: 'coins',
      desc: '360-degree celebratory somersault right in front of the exit door.'
    },
    {
      id: 'emote_laugh',
      category: 'emotes',
      name: 'Mocking Laugh',
      tier: 'Rare',
      cost: 80,
      currency: 'coins',
      desc: 'Rapid bouncing chuckle emitting sharp geometric HA bursts.'
    },
    {
      id: 'emote_rage',
      category: 'emotes',
      name: 'Rage Stomp',
      tier: 'Epic',
      cost: 105,
      currency: 'coins',
      desc: 'Furious rapid ground slams releasing impact rings and steam puffs.'
    },
    {
      id: 'emote_zen',
      category: 'emotes',
      name: 'Zen Levitation',
      tier: 'Epic',
      cost: 135,
      currency: 'coins',
      desc: 'Float serenely above the floor with calm orbiting satellites.'
    },
    {
      id: 'emote_spin',
      category: 'emotes',
      name: 'Vortex Twirl',
      tier: 'Mythic',
      cost: 160,
      currency: 'coins',
      desc: 'High-velocity horizontal spin kicking up miniature cyclones.'
    },
    {
      id: 'emote_rip',
      category: 'emotes',
      name: 'Drop Tombstone',
      tier: 'Exotic',
      cost: 195,
      currency: 'coins',
      desc: 'Plants a stone RIP monument to honor your previous attempts.'
    },

    // UPGRADES (Skill Points - SP)
    {
      id: 'upg_coyote',
      category: 'upgrades',
      name: 'Coyote Grace',
      tier: 'Skill Tier I',
      cost: 1,
      currency: 'sp',
      desc: 'Extends ledge-jump forgiveness and jump input buffering by +95ms.'
    },
    {
      id: 'upg_magnet',
      category: 'upgrades',
      name: 'Coin Magnet',
      tier: 'Skill Tier I',
      cost: 1,
      currency: 'sp',
      desc: 'Automatically pulls nearby Coins and Skill Orbs toward your character.'
    },
    {
      id: 'upg_double_jump',
      category: 'upgrades',
      name: 'Phantom Air-Hop',
      tier: 'Skill Tier II',
      cost: 2,
      currency: 'sp',
      desc: 'Grants +1 mid-air jump per ground touch to escape sudden floor betrayals.'
    },
    {
      id: 'upg_dash',
      category: 'upgrades',
      name: 'Phase Dash',
      tier: 'Skill Tier II',
      cost: 2,
      currency: 'sp',
      desc: 'Press Shift or K to burst horizontally across surprise spike chasms.'
    },
    {
      id: 'upg_radar',
      category: 'upgrades',
      name: 'Trap Instinct',
      tier: 'Skill Tier II',
      cost: 2,
      currency: 'sp',
      desc: 'Reveals subtle pulse ticks on hidden parting floors and dormant spike traps.'
    },
    {
      id: 'upg_shield',
      category: 'upgrades',
      name: 'Second Wind',
      tier: 'Skill Tier III',
      cost: 3,
      currency: 'sp',
      desc: 'Once per attempt, deflects one fatal spike or saw hit with an upward parry bounce.'
    }
  ];

  window.ExoticShopData = {
    CATEGORIES,
    ITEMS,
    getById(id) {
      return ITEMS.find((item) => item.id === id) || null;
    },
    getByCategory(cat) {
      return ITEMS.filter((item) => item.category === cat);
    }
  };
})();
