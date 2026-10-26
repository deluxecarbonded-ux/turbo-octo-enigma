(function () {
  const VIEW_W = 960;
  const VIEW_H = 540;

  // 8 Handcrafted Brawlhalla-Style Floating Island Arenas (Brawl Game Mode Only)
  const MAPS = [
    {
      id: 'brawl_map_haven',
      name: 'Brawlhaven Sanctum',
      tier: 'Starter',
      starter: true,
      subtitle: 'Balanced central sanctum island with twin tri-platforms',
      blastZones: { left: -250, right: 1210, top: -250, bottom: 760 },
      coloredTheme: {
        darkSky: '#0b1329',
        lightSky: '#e0f2fe',
        darkPillar: '#162347',
        lightPillar: '#bae6fd',
        island: '#1e293b',
        islandLight: '#334155',
        cap: '#10b981',
        soft: '#0ea5e9',
        accent: '#34d399'
      },
      pillars: [
        { x: 110, y: 120, w: 38, h: 420 },
        { x: 812, y: 150, w: 38, h: 390 },
        { x: 456, y: 80, w: 48, h: 460 }
      ],
      platforms: [
        { id: 'main', type: 'solid', x: 230, y: 348, w: 500, h: 152 },
        { id: 'plat_l', type: 'soft', x: 266, y: 244, w: 132, h: 12 },
        { id: 'plat_r', type: 'soft', x: 562, y: 244, w: 132, h: 12 },
        { id: 'plat_top', type: 'soft', x: 416, y: 162, w: 128, h: 12 }
      ],
      spawns: [
        { x: 325, y: 310, facing: 1 },
        { x: 635, y: 310, facing: -1 },
        { x: 420, y: 124, facing: 1 },
        { x: 540, y: 124, facing: -1 }
      ],
      dropZones: [
        { x: 480, y: 132 },
        { x: 332, y: 214 },
        { x: 628, y: 214 },
        { x: 480, y: 316 }
      ]
    },
    {
      id: 'brawl_map_citadel',
      name: 'Monolith Citadel',
      tier: 'Starter',
      starter: true,
      subtitle: 'Split twin fortress bastions with an elevated skybridge',
      blastZones: { left: -260, right: 1220, top: -250, bottom: 770 },
      coloredTheme: {
        darkSky: '#131126',
        lightSky: '#ede9fe',
        darkPillar: '#241e46',
        lightPillar: '#ddd6fe',
        island: '#1e1b4b',
        islandLight: '#312e81',
        cap: '#8b5cf6',
        soft: '#a855f7',
        accent: '#c084fc'
      },
      pillars: [
        { x: 150, y: 90, w: 44, h: 450 },
        { x: 766, y: 90, w: 44, h: 450 }
      ],
      platforms: [
        { id: 'left_bastion', type: 'solid', x: 185, y: 344, w: 248, h: 168 },
        { id: 'right_bastion', type: 'solid', x: 527, y: 344, w: 248, h: 168 },
        { id: 'skybridge', type: 'soft', x: 374, y: 256, w: 212, h: 12 },
        { id: 'wing_l', type: 'soft', x: 205, y: 214, w: 112, h: 12 },
        { id: 'wing_r', type: 'soft', x: 643, y: 214, w: 112, h: 12 }
      ],
      spawns: [
        { x: 295, y: 306, facing: 1 },
        { x: 665, y: 306, facing: -1 },
        { x: 450, y: 218, facing: 1 },
        { x: 510, y: 218, facing: -1 }
      ],
      dropZones: [
        { x: 480, y: 224 },
        { x: 305, y: 312 },
        { x: 655, y: 312 },
        { x: 260, y: 184 },
        { x: 700, y: 184 }
      ]
    },
    {
      id: 'brawl_map_skyforge',
      name: 'Skyforge Anvil',
      tier: 'Uncommon',
      starter: false,
      subtitle: 'Wide anvil deck flanked by oscillating vertical wing lifts',
      blastZones: { left: -260, right: 1220, top: -260, bottom: 760 },
      coloredTheme: {
        darkSky: '#1c120c',
        lightSky: '#ffedd5',
        darkPillar: '#362115',
        lightPillar: '#fed7aa',
        island: '#292524',
        islandLight: '#44403c',
        cap: '#f97316',
        soft: '#fb923c',
        accent: '#fbbf24'
      },
      pillars: [
        { x: 290, y: 110, w: 34, h: 430 },
        { x: 636, y: 110, w: 34, h: 430 }
      ],
      platforms: [
        { id: 'anvil_core', type: 'solid', x: 256, y: 356, w: 448, h: 146 },
        {
          id: 'lift_l',
          type: 'soft',
          x: 132,
          y: 286,
          w: 102,
          h: 12,
          motion: { axis: 'y', amp: 54, speed: 1.35, phase: 0 }
        },
        {
          id: 'lift_r',
          type: 'soft',
          x: 726,
          y: 286,
          w: 102,
          h: 12,
          motion: { axis: 'y', amp: 54, speed: 1.35, phase: Math.PI }
        },
        { id: 'crown', type: 'soft', x: 392, y: 222, w: 176, h: 12 }
      ],
      spawns: [
        { x: 340, y: 318, facing: 1 },
        { x: 620, y: 318, facing: -1 },
        { x: 450, y: 184, facing: 1 },
        { x: 510, y: 184, facing: -1 }
      ],
      dropZones: [
        { x: 480, y: 192 },
        { x: 360, y: 324 },
        { x: 600, y: 324 }
      ]
    },
    {
      id: 'brawl_map_voidspire',
      name: 'Twilight Voidspire',
      tier: 'Rare',
      starter: false,
      subtitle: 'Asymmetric twilight spire with off-stage island outcropping',
      blastZones: { left: -270, right: 1230, top: -260, bottom: 770 },
      coloredTheme: {
        darkSky: '#140c24',
        lightSky: '#fae8ff',
        darkPillar: '#2a1748',
        lightPillar: '#f5d0fe',
        island: '#2e1065',
        islandLight: '#4c1d95',
        cap: '#ec4899',
        soft: '#d946ef',
        accent: '#f472b6'
      },
      pillars: [
        { x: 368, y: 48, w: 54, h: 492 },
        { x: 742, y: 190, w: 30, h: 350 }
      ],
      platforms: [
        { id: 'main_deck', type: 'solid', x: 204, y: 352, w: 432, h: 158 },
        { id: 'spire_wall', type: 'solid', x: 360, y: 226, w: 68, h: 132 },
        { id: 'side_island', type: 'solid', x: 694, y: 316, w: 118, h: 112 },
        { id: 'left_perch', type: 'soft', x: 224, y: 244, w: 108, h: 12 },
        { id: 'high_perch', type: 'soft', x: 500, y: 214, w: 124, h: 12 }
      ],
      spawns: [
        { x: 280, y: 314, facing: 1 },
        { x: 560, y: 314, facing: -1 },
        { x: 750, y: 278, facing: -1 },
        { x: 278, y: 206, facing: 1 }
      ],
      dropZones: [
        { x: 280, y: 212 },
        { x: 562, y: 184 },
        { x: 752, y: 284 },
        { x: 520, y: 320 }
      ]
    },
    {
      id: 'brawl_map_reactor',
      name: 'Aether Reactor',
      tier: 'Rare',
      starter: false,
      subtitle: 'Split reactor cores linked by a sweeping horizontal shuttle',
      blastZones: { left: -260, right: 1220, top: -250, bottom: 770 },
      coloredTheme: {
        darkSky: '#071923',
        lightSky: '#cffafe',
        darkPillar: '#0e3142',
        lightPillar: '#a5f3fc',
        island: '#0f172a',
        islandLight: '#1e293b',
        cap: '#06b6d4',
        soft: '#22d3ee',
        accent: '#67e8f9'
      },
      pillars: [
        { x: 220, y: 120, w: 36, h: 420 },
        { x: 704, y: 120, w: 36, h: 420 }
      ],
      platforms: [
        { id: 'core_l', type: 'solid', x: 156, y: 360, w: 226, h: 154 },
        { id: 'core_r', type: 'solid', x: 578, y: 360, w: 226, h: 154 },
        {
          id: 'shuttle',
          type: 'soft',
          x: 416,
          y: 298,
          w: 128,
          h: 13,
          motion: { axis: 'x', amp: 76, speed: 1.45, phase: 0 }
        },
        { id: 'upper_l', type: 'soft', x: 220, y: 228, w: 126, h: 12 },
        { id: 'upper_r', type: 'soft', x: 614, y: 228, w: 126, h: 12 }
      ],
      spawns: [
        { x: 268, y: 322, facing: 1 },
        { x: 692, y: 322, facing: -1 },
        { x: 280, y: 190, facing: 1 },
        { x: 680, y: 190, facing: -1 }
      ],
      dropZones: [
        { x: 270, y: 328 },
        { x: 690, y: 328 },
        { x: 282, y: 196 },
        { x: 678, y: 196 }
      ]
    },
    {
      id: 'brawl_map_galleon',
      name: 'Tempest Deck',
      tier: 'Epic',
      starter: false,
      subtitle: 'Stepped skyship hull with high twin mast perches',
      blastZones: { left: -260, right: 1220, top: -265, bottom: 765 },
      coloredTheme: {
        darkSky: '#091526',
        lightSky: '#dbeafe',
        darkPillar: '#162d4d',
        lightPillar: '#bfdbfe',
        island: '#1e293b',
        islandLight: '#334155',
        cap: '#38bdf8',
        soft: '#f59e0b',
        accent: '#fde047'
      },
      pillars: [
        { x: 332, y: 92, w: 22, h: 320 },
        { x: 606, y: 92, w: 22, h: 320 }
      ],
      platforms: [
        { id: 'hull_center', type: 'solid', x: 268, y: 364, w: 424, h: 146 },
        { id: 'prow_l', type: 'solid', x: 178, y: 330, w: 102, h: 120 },
        { id: 'stern_r', type: 'solid', x: 680, y: 330, w: 102, h: 120 },
        { id: 'mast_l', type: 'soft', x: 284, y: 212, w: 118, h: 12 },
        { id: 'mast_r', type: 'soft', x: 558, y: 212, w: 118, h: 12 },
        {
          id: 'crow_nest',
          type: 'soft',
          x: 430,
          y: 144,
          w: 100,
          h: 12,
          motion: { axis: 'x', amp: 44, speed: 1.1, phase: 0.6 }
        }
      ],
      spawns: [
        { x: 228, y: 292, facing: 1 },
        { x: 732, y: 292, facing: -1 },
        { x: 395, y: 326, facing: 1 },
        { x: 565, y: 326, facing: -1 }
      ],
      dropZones: [
        { x: 480, y: 332 },
        { x: 342, y: 180 },
        { x: 618, y: 180 },
        { x: 228, y: 298 },
        { x: 732, y: 298 }
      ]
    },
    {
      id: 'brawl_map_colosseum',
      name: 'Thundergard Ring',
      tier: 'Epic',
      starter: false,
      subtitle: 'Dual championship plates separated by a central knockout pit',
      blastZones: { left: -275, right: 1235, top: -260, bottom: 775 },
      coloredTheme: {
        darkSky: '#1f0b12',
        lightSky: '#ffe4e6',
        darkPillar: '#3d1523',
        lightPillar: '#fecdd3',
        island: '#27272a',
        islandLight: '#3f3f46',
        cap: '#f43f5e',
        soft: '#fb7185',
        accent: '#fda4af'
      },
      pillars: [
        { x: 142, y: 100, w: 40, h: 440 },
        { x: 778, y: 100, w: 40, h: 440 },
        { x: 462, y: 60, w: 36, h: 170 }
      ],
      platforms: [
        { id: 'plate_l', type: 'solid', x: 170, y: 350, w: 266, h: 162 },
        { id: 'plate_r', type: 'solid', x: 524, y: 350, w: 266, h: 162 },
        { id: 'pit_bridge', type: 'soft', x: 422, y: 312, w: 116, h: 12 },
        { id: 'deck_l', type: 'soft', x: 196, y: 236, w: 124, h: 12 },
        { id: 'deck_c', type: 'soft', x: 416, y: 192, w: 128, h: 12 },
        { id: 'deck_r', type: 'soft', x: 640, y: 236, w: 124, h: 12 }
      ],
      spawns: [
        { x: 300, y: 312, facing: 1 },
        { x: 660, y: 312, facing: -1 },
        { x: 258, y: 198, facing: 1 },
        { x: 702, y: 198, facing: -1 }
      ],
      dropZones: [
        { x: 480, y: 162 },
        { x: 480, y: 280 },
        { x: 300, y: 318 },
        { x: 660, y: 318 }
      ]
    },
    {
      id: 'brawl_map_valhalla',
      name: 'Apex Valhalla',
      tier: 'Exotic',
      starter: false,
      subtitle: 'Celestial hall with synchronized wing terraces and sovereign dais',
      blastZones: { left: -275, right: 1235, top: -270, bottom: 775 },
      coloredTheme: {
        darkSky: '#16132b',
        lightSky: '#fef9c3',
        darkPillar: '#2c2554',
        lightPillar: '#fde68a',
        island: '#1e1b4b',
        islandLight: '#312e81',
        cap: '#eab308',
        soft: '#38bdf8',
        accent: '#fde047'
      },
      pillars: [
        { x: 188, y: 74, w: 38, h: 466 },
        { x: 460, y: 44, w: 40, h: 496 },
        { x: 734, y: 74, w: 38, h: 466 }
      ],
      platforms: [
        { id: 'sovereign_base', type: 'solid', x: 238, y: 356, w: 484, h: 156 },
        { id: 'dais', type: 'soft', x: 406, y: 248, w: 148, h: 13 },
        {
          id: 'terrace_l',
          type: 'soft',
          x: 138,
          y: 266,
          w: 112,
          h: 12,
          motion: { axis: 'y', amp: 46, speed: 1.2, phase: 0 }
        },
        {
          id: 'terrace_r',
          type: 'soft',
          x: 710,
          y: 266,
          w: 112,
          h: 12,
          motion: { axis: 'y', amp: 46, speed: 1.2, phase: 0 }
        },
        { id: 'crown_top', type: 'soft', x: 422, y: 152, w: 116, h: 12 }
      ],
      spawns: [
        { x: 325, y: 318, facing: 1 },
        { x: 635, y: 318, facing: -1 },
        { x: 480, y: 210, facing: 1 },
        { x: 480, y: 114, facing: -1 }
      ],
      dropZones: [
        { x: 480, y: 122 },
        { x: 480, y: 218 },
        { x: 330, y: 324 },
        { x: 630, y: 324 }
      ]
    }
  ];

  // Helper to build full 11-move Brawlhalla weapon movesets cleanly
  function makeMoveset(overrides) {
    const base = {
      nlight: {
        startup: 0.055,
        active: 0.11,
        endlag: 0.13,
        damage: 11,
        baseForce: 225,
        varForce: 155,
        angleDeg: 52,
        lungeVx: 75,
        lungeVy: 0,
        ox: 22,
        oy: -2,
        rx: 22,
        ry: 15,
        visual: 'jab'
      },
      slight: {
        startup: 0.07,
        active: 0.13,
        endlag: 0.15,
        damage: 13,
        baseForce: 255,
        varForce: 195,
        angleDeg: 36,
        lungeVx: 245,
        lungeVy: 0,
        ox: 26,
        oy: 0,
        rx: 25,
        ry: 14,
        visual: 'thrust'
      },
      dlight: {
        startup: 0.065,
        active: 0.12,
        endlag: 0.15,
        damage: 12,
        baseForce: 295,
        varForce: 140,
        angleDeg: 78,
        lungeVx: 140,
        lungeVy: 0,
        ox: 22,
        oy: 8,
        rx: 24,
        ry: 12,
        visual: 'sweep'
      },
      nair: {
        startup: 0.06,
        active: 0.14,
        endlag: 0.14,
        damage: 12,
        baseForce: 235,
        varForce: 185,
        angleDeg: 68,
        lungeVx: 0,
        lungeVy: -60,
        ox: 4,
        oy: -2,
        rx: 26,
        ry: 24,
        visual: 'spin'
      },
      sair: {
        startup: 0.075,
        active: 0.13,
        endlag: 0.17,
        damage: 15,
        baseForce: 295,
        varForce: 285,
        angleDeg: 28,
        lungeVx: 165,
        lungeVy: -35,
        ox: 26,
        oy: -1,
        rx: 26,
        ry: 15,
        visual: 'slash'
      },
      dair: {
        startup: 0.075,
        active: 0.14,
        endlag: 0.18,
        damage: 14,
        baseForce: 275,
        varForce: 245,
        angleDeg: -62,
        lungeVx: 90,
        lungeVy: 210,
        ox: 14,
        oy: 16,
        rx: 20,
        ry: 20,
        visual: 'dive'
      },
      nsig: {
        startup: 0.14,
        active: 0.16,
        endlag: 0.25,
        damage: 22,
        baseForce: 345,
        varForce: 365,
        angleDeg: 64,
        lungeVx: 95,
        lungeVy: -245,
        ox: 18,
        oy: -18,
        rx: 28,
        ry: 28,
        sig: true,
        visual: 'upper'
      },
      ssig: {
        startup: 0.15,
        active: 0.17,
        endlag: 0.26,
        damage: 24,
        baseForce: 360,
        varForce: 390,
        angleDeg: 26,
        lungeVx: 365,
        lungeVy: -30,
        ox: 32,
        oy: -2,
        rx: 32,
        ry: 18,
        sig: true,
        visual: 'heavy_lunge'
      },
      dsig: {
        startup: 0.14,
        active: 0.17,
        endlag: 0.26,
        damage: 21,
        baseForce: 340,
        varForce: 355,
        angleDeg: 34,
        lungeVx: 0,
        lungeVy: 0,
        ox: 0,
        oy: 6,
        rx: 42,
        ry: 15,
        sig: true,
        visual: 'burst'
      },
      recovery: {
        startup: 0.08,
        active: 0.2,
        endlag: 0.2,
        damage: 16,
        baseForce: 315,
        varForce: 295,
        angleDeg: 74,
        lungeVx: 95,
        lungeVy: -520,
        ox: 10,
        oy: -18,
        rx: 22,
        ry: 26,
        visual: 'recovery'
      },
      groundpound: {
        startup: 0.11,
        active: 0.26,
        endlag: 0.24,
        damage: 18,
        baseForce: 315,
        varForce: 320,
        angleDeg: -78,
        lungeVx: 0,
        lungeVy: 620,
        ox: 0,
        oy: 18,
        rx: 21,
        ry: 22,
        visual: 'slam'
      }
    };
    const merged = {};
    for (const k of Object.keys(base)) {
      merged[k] = { ...base[k], ...(overrides[k] || {}) };
    }
    return merged;
  }

  // 9 Brawl Weapons (Default Bare Fists + 8 Shop Sky-Drop Weapons)
  const WEAPONS = {
    weapon_fists: {
      id: 'weapon_fists',
      name: 'Bare Fists',
      shortName: 'Fists',
      starter: true,
      coloredPrimary: '#f8fafc',
      coloredAccent: '#f97316',
      speedMul: 1.06,
      moves: makeMoveset({
        nlight: { startup: 0.045, damage: 10, ox: 19, rx: 19, ry: 13, visual: 'jab' },
        slight: { lungeVx: 270, damage: 12, ox: 22, rx: 21, angleDeg: 44, visual: 'thrust' },
        dlight: { lungeVx: 180, damage: 11, ox: 20, oy: 9, rx: 22, angleDeg: 80, visual: 'sweep' },
        sair: { damage: 15, baseForce: 300, varForce: 290, ox: 22, rx: 21, visual: 'thrust' },
        nsig: { damage: 22, lungeVy: -290, ox: 16, oy: -20, rx: 24, ry: 28, angleDeg: 70, visual: 'upper' },
        ssig: { damage: 24, lungeVx: 390, ox: 26, rx: 26, angleDeg: 24, visual: 'heavy_lunge' },
        recovery: { lungeVy: -545, ox: 10, oy: -18, rx: 20, ry: 26, visual: 'upper' }
      })
    },
    weapon_sword: {
      id: 'weapon_sword',
      name: 'Vanguard Blade',
      shortName: 'Sword',
      starter: false,
      coloredPrimary: '#e2e8f0',
      coloredAccent: '#38bdf8',
      speedMul: 1.03,
      moves: makeMoveset({
        nlight: { ox: 28, rx: 28, ry: 16, damage: 13, visual: 'slash' },
        slight: { lungeVx: 300, ox: 30, rx: 30, damage: 14, visual: 'slash' },
        dlight: { lungeVx: 210, ox: 28, oy: 7, rx: 28, angleDeg: 76, visual: 'sweep' },
        nair: { ox: 4, oy: -4, rx: 32, ry: 28, visual: 'spin' },
        sair: { ox: 30, rx: 30, ry: 17, damage: 16, varForce: 305, visual: 'slash' },
        dair: { ox: 4, oy: 20, rx: 26, ry: 20, angleDeg: -72, visual: 'slash' },
        ssig: { lungeVx: 420, ox: 36, rx: 36, damage: 25, varForce: 400, visual: 'heavy_lunge' },
        recovery: { lungeVy: -535, ox: 4, oy: -16, rx: 28, ry: 28, visual: 'spin' }
      })
    },
    weapon_spear: {
      id: 'weapon_spear',
      name: 'Skyreach Spear',
      shortName: 'Spear',
      starter: false,
      coloredPrimary: '#cbd5e1',
      coloredAccent: '#10b981',
      speedMul: 1.0,
      moves: makeMoveset({
        nlight: { ox: 36, rx: 34, ry: 11, damage: 12, lungeVx: 60, visual: 'thrust' },
        slight: { ox: 36, rx: 35, ry: 14, lungeVx: 240, damage: 14, angleDeg: 48, visual: 'thrust' },
        dlight: { ox: 28, oy: -8, rx: 30, ry: 20, lungeVx: 195, lungeVy: -190, angleDeg: 74, visual: 'upper' },
        nair: { ox: 0, oy: 0, rx: 36, ry: 28, damage: 13, visual: 'spin' },
        sair: { ox: 36, rx: 34, ry: 12, damage: 16, varForce: 310, visual: 'thrust' },
        dair: { ox: 4, oy: 24, rx: 14, ry: 26, lungeVy: -180, angleDeg: -80, visual: 'dive' },
        nsig: { ox: 32, oy: -24, rx: 32, ry: 30, damage: 24, angleDeg: 58, visual: 'upper' },
        recovery: { lungeVy: -525, ox: 0, oy: -18, rx: 36, ry: 20, visual: 'spin' },
        groundpound: { ox: 0, oy: 20, rx: 34, ry: 18, visual: 'slam' }
      })
    },
    weapon_katars: {
      id: 'weapon_katars',
      name: 'Twin Katars',
      shortName: 'Katars',
      starter: false,
      coloredPrimary: '#f1f5f9',
      coloredAccent: '#ec4899',
      speedMul: 1.1,
      moves: makeMoveset({
        nlight: { startup: 0.042, active: 0.1, endlag: 0.11, damage: 11, ox: 22, rx: 22, visual: 'slash' },
        slight: { startup: 0.055, lungeVx: 330, damage: 12, ox: 24, rx: 24, angleDeg: 40, visual: 'thrust' },
        dlight: { startup: 0.055, lungeVx: 130, lungeVy: -165, ox: 20, oy: -8, rx: 22, angleDeg: 76, visual: 'upper' },
        nair: { startup: 0.05, ox: 0, oy: 0, rx: 28, ry: 26, damage: 12, visual: 'spin' },
        dair: { lungeVx: 270, lungeVy: 290, ox: 20, oy: 16, rx: 22, ry: 20, angleDeg: -45, visual: 'dive' },
        nsig: { lungeVx: 180, lungeVy: -310, ox: 22, oy: -20, rx: 26, ry: 26, damage: 23, visual: 'upper' },
        ssig: { lungeVx: 440, ox: 28, rx: 28, damage: 24, varForce: 395, visual: 'heavy_lunge' },
        recovery: { lungeVx: 190, lungeVy: -540, ox: 18, oy: -18, rx: 24, ry: 24, visual: 'upper' }
      })
    },
    weapon_blasters: {
      id: 'weapon_blasters',
      name: 'Dual Blasters',
      shortName: 'Blasters',
      starter: false,
      coloredPrimary: '#94a3b8',
      coloredAccent: '#f59e0b',
      speedMul: 1.02,
      moves: makeMoveset({
        nlight: { ox: 44, rx: 22, ry: 16, lungeVx: 0, damage: 13, visual: 'blast' },
        slight: { ox: 52, rx: 24, ry: 14, lungeVx: 110, damage: 14, angleDeg: 32, visual: 'blast' },
        dlight: { ox: 34, oy: 8, rx: 26, ry: 14, lungeVx: 80, damage: 13, angleDeg: 74, visual: 'blast' },
        nair: { ox: 6, oy: -26, rx: 24, ry: 24, lungeVy: -95, damage: 13, angleDeg: 82, visual: 'blast' },
        sair: { ox: 48, rx: 24, ry: 14, lungeVx: -90, damage: 16, varForce: 310, visual: 'blast' },
        dair: { ox: 8, oy: 30, rx: 22, ry: 22, lungeVy: -150, damage: 15, angleDeg: -72, visual: 'blast' },
        nsig: { ox: 38, oy: -26, rx: 28, ry: 26, damage: 24, varForce: 390, visual: 'blast' },
        ssig: { ox: 58, rx: 30, ry: 18, lungeVx: 180, damage: 25, varForce: 410, visual: 'blast' },
        dsig: { ox: 0, oy: 6, rx: 52, ry: 16, lungeVy: -110, damage: 22, visual: 'burst' },
        recovery: { lungeVy: -545, ox: 8, oy: -22, rx: 24, ry: 28, visual: 'blast' }
      })
    },
    weapon_hammer: {
      id: 'weapon_hammer',
      name: 'Grapple Hammer',
      shortName: 'Hammer',
      starter: false,
      coloredPrimary: '#cbd5e1',
      coloredAccent: '#eab308',
      speedMul: 0.94,
      moves: makeMoveset({
        nlight: { startup: 0.075, ox: 26, rx: 26, damage: 15, varForce: 230, visual: 'slash' },
        slight: { startup: 0.09, lungeVx: 230, ox: 34, rx: 32, damage: 17, varForce: 270, visual: 'heavy_lunge' },
        dlight: { startup: 0.07, lungeVx: 40, ox: 18, oy: 10, rx: 28, damage: 12, angleDeg: 84, visual: 'slam' },
        nair: { ox: 2, oy: -20, rx: 30, ry: 26, damage: 17, varForce: 315, angleDeg: 78, visual: 'slash' },
        sair: { startup: 0.09, ox: 34, rx: 32, ry: 18, damage: 19, baseForce: 325, varForce: 345, visual: 'slash' },
        dair: { ox: 8, oy: -12, rx: 26, ry: 26, damage: 17, angleDeg: 82, varForce: 320, visual: 'upper' },
        ssig: { startup: 0.17, lungeVx: 330, ox: 38, rx: 36, ry: 22, damage: 28, baseForce: 385, varForce: 435, visual: 'heavy_lunge' },
        recovery: { lungeVy: -510, ox: 12, oy: -20, rx: 26, ry: 28, angleDeg: -65, damage: 18, visual: 'upper' },
        groundpound: { damage: 22, baseForce: 345, varForce: 365, rx: 28, visual: 'slam' }
      })
    },
    weapon_axe: {
      id: 'weapon_axe',
      name: 'Rift Cleaver',
      shortName: 'Axe',
      starter: false,
      coloredPrimary: '#e2e8f0',
      coloredAccent: '#ef4444',
      speedMul: 0.96,
      moves: makeMoveset({
        nlight: { startup: 0.08, ox: 28, rx: 30, ry: 20, damage: 16, varForce: 250, visual: 'slash' },
        slight: { startup: 0.085, lungeVx: 245, ox: 32, rx: 30, damage: 15, angleDeg: 66, visual: 'sweep' },
        dlight: { startup: 0.08, ox: 26, oy: -12, rx: 30, ry: 24, damage: 15, angleDeg: 58, visual: 'upper' },
        nair: { ox: 4, oy: -6, rx: 34, ry: 30, damage: 16, varForce: 280, visual: 'spin' },
        sair: { startup: 0.09, ox: 32, rx: 32, ry: 22, damage: 18, baseForce: 320, varForce: 335, visual: 'slash' },
        dair: { ox: 4, oy: 18, rx: 30, ry: 22, damage: 17, angleDeg: -68, varForce: 295, visual: 'slash' },
        ssig: { startup: 0.16, lungeVx: 360, ox: 36, rx: 36, ry: 24, damage: 27, varForce: 425, visual: 'heavy_lunge' },
        recovery: { lungeVx: 130, lungeVy: -520, ox: 4, oy: -8, rx: 34, ry: 32, damage: 18, visual: 'spin' }
      })
    },
    weapon_lance: {
      id: 'weapon_lance',
      name: 'Rocket Lance',
      shortName: 'Lance',
      starter: false,
      coloredPrimary: '#e2e8f0',
      coloredAccent: '#6366f1',
      speedMul: 1.0,
      moves: makeMoveset({
        nlight: { ox: 34, rx: 32, ry: 14, lungeVx: 130, damage: 14, visual: 'thrust' },
        slight: { lungeVx: 375, ox: 36, rx: 34, ry: 14, damage: 15, angleDeg: 46, visual: 'thrust' },
        dlight: { lungeVx: -70, ox: 30, oy: 6, rx: 30, damage: 14, angleDeg: 40, visual: 'blast' },
        nair: { ox: 4, oy: -6, rx: 34, ry: 28, lungeVy: -90, damage: 14, visual: 'spin' },
        sair: { lungeVx: 395, lungeVy: -25, ox: 36, rx: 34, ry: 15, damage: 17, varForce: 320, visual: 'thrust' },
        dair: { lungeVx: 320, lungeVy: 250, ox: 28, oy: 14, rx: 30, ry: 18, angleDeg: -38, visual: 'dive' },
        ssig: { lungeVx: 495, ox: 40, rx: 38, ry: 18, damage: 26, baseForce: 375, varForce: 420, visual: 'heavy_lunge' },
        recovery: { lungeVx: 260, lungeVy: -545, ox: 24, oy: -18, rx: 30, ry: 24, damage: 18, visual: 'upper' }
      })
    },
    weapon_scythe: {
      id: 'weapon_scythe',
      name: 'Phantom Scythe',
      shortName: 'Scythe',
      starter: false,
      coloredPrimary: '#e2e8f0',
      coloredAccent: '#a855f7',
      speedMul: 1.05,
      moves: makeMoveset({
        nlight: { ox: 26, oy: -6, rx: 28, ry: 20, damage: 13, angleDeg: 68, visual: 'slash' },
        slight: { lungeVx: 285, ox: 30, rx: 30, damage: 13, angleDeg: 48, visual: 'slash' },
        dlight: { lungeVx: 225, ox: 32, oy: 6, rx: 30, damage: 13, angleDeg: 132, visual: 'sweep' },
        nair: { ox: 12, oy: -10, rx: 30, ry: 26, damage: 14, angleDeg: 138, visual: 'slash' },
        sair: { ox: 30, rx: 30, ry: 20, damage: 16, varForce: 300, angleDeg: 32, visual: 'slash' },
        dair: { lungeVx: 215, lungeVy: 220, ox: 22, oy: 16, rx: 26, ry: 22, angleDeg: -125, visual: 'dive' },
        nsig: { lungeVx: 140, lungeVy: -275, ox: 24, oy: -22, rx: 32, ry: 28, damage: 24, varForce: 395, visual: 'upper' },
        ssig: { lungeVx: 410, ox: 36, rx: 36, ry: 20, damage: 25, varForce: 405, visual: 'heavy_lunge' },
        recovery: { lungeVx: 165, lungeVy: -535, ox: 16, oy: -18, rx: 30, ry: 28, damage: 17, visual: 'slash' }
      })
    }
  };

  // Curated CPU Opponent Roster (transparent CPU fighters using authentic Exotic Characters)
  const CPU_ROSTER = [
    { character: 'char_lucia', skin: 'skin_solid', weapon: 'weapon_blasters', label: 'CPU · Lucia' },
    { character: 'char_jason', skin: 'skin_solid', weapon: 'weapon_katars', label: 'CPU · Jason' },
    { character: 'char_scream', skin: 'skin_solid', weapon: 'weapon_scythe', label: 'CPU · Scream' },
    { character: 'char_ronin', skin: 'skin_checker', weapon: 'weapon_sword', label: 'CPU · Ronin' },
    { character: 'char_knight', skin: 'skin_tuxedo', weapon: 'weapon_hammer', label: 'CPU · Vanguard' },
    { character: 'char_shinobi', skin: 'skin_split', weapon: 'weapon_katars', label: 'CPU · Shinobi' },
    { character: 'char_mickey', skin: 'skin_solid', weapon: 'weapon_spear', label: 'CPU · Mickey' },
    { character: 'char_donald_duck', skin: 'skin_solid', weapon: 'weapon_axe', label: 'CPU · Donald' },
    { character: 'char_bugs_bunny', skin: 'skin_solid', weapon: 'weapon_blasters', label: 'CPU · Bugs' },
    { character: 'char_cyborg', skin: 'skin_scanline', weapon: 'weapon_lance', label: 'CPU · Unit-01' }
  ];

  function getMapById(mapId) {
    return MAPS.find((m) => m.id === mapId) || MAPS[0];
  }

  function getWeaponById(weaponId) {
    return WEAPONS[weaponId] || WEAPONS.weapon_fists;
  }

  function evaluateMapPlatforms(map, time) {
    return map.platforms.map((p) => {
      let x = p.x;
      let y = p.y;
      let vx = 0;
      let vy = 0;
      if (p.motion) {
        const arg = time * p.motion.speed + (p.motion.phase || 0);
        const offset = Math.sin(arg) * p.motion.amp;
        const vel = Math.cos(arg) * p.motion.amp * p.motion.speed;
        if (p.motion.axis === 'x') {
          x += offset;
          vx = vel;
        } else {
          y += offset;
          vy = vel;
        }
      }
      return {
        ...p,
        x,
        y,
        vx,
        vy
      };
    });
  }

  window.ExoticBrawlData = {
    VIEW_W,
    VIEW_H,
    MAPS,
    WEAPONS,
    CPU_ROSTER,
    getMapById,
    getWeaponById,
    evaluateMapPlatforms
  };
})();
