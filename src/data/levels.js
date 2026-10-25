(function () {
  const LEVELS = [
    // LEVEL 01: TRUST NOTHING
    {
      id: 1,
      code: '01',
      title: 'Trust Nothing',
      subtitle: 'Dishonest floors, jumping spikes, and an exit door with commitment issues.',
      width: 960,
      height: 540,
      parDeaths: 4,
      parTimeMs: 11000,
      rewardCoins: 45,
      spawn: { x: 64, y: 398 },
      quips: [
        'The sign literally lied to your face.',
        'Yes, the spike has a vertical leap.',
        'The door went the other way.',
        'Bait the spike jump, then walk right under it.'
      ],
      signs: [
        { x: 326, y: 365, w: 118, before: '100% SOLID', after: 'JUST KIDDING', watchId: 'p_part' },
        { x: 522, y: 365, w: 118, before: 'EASY HOP', after: 'IT JUMPS TOO', watchId: 's_jump1' },
        { x: 800, y: 318, w: 118, before: 'FREE EXIT', after: 'OVER THERE!', watchId: 'd_main' }
      ],
      platforms: [
        { id: 'p1', x: 0, y: 430, w: 280, h: 110 },
        {
          id: 'p_part',
          x: 280,
          y: 430,
          w: 95,
          h: 110,
          troll: {
            type: 'drop',
            padX: 12,
            speedY: 820,
            targetDY: 155
          }
        },
        { id: 'p2', x: 375, y: 430, w: 395, h: 110 },
        {
          id: 'p_door_gap',
          x: 770,
          y: 430,
          w: 68,
          h: 110,
          troll: {
            type: 'drop',
            manualOnly: true,
            speedY: 820,
            targetDY: 155
          }
        },
        { id: 'p3', x: 838, y: 430, w: 122, h: 110 },
        // Upper optional Skill Orb shelf
        { id: 'p_orb1', x: 145, y: 348, w: 80, h: 18 },
        { id: 'p_orb2', x: 40, y: 274, w: 78, h: 18 }
      ],
      spikes: [
        {
          id: 's_jump1',
          x: 504,
          y: 430,
          count: 2,
          dir: 'up',
          troll: {
            type: 'jump',
            jumpVy: -525
          }
        },
        {
          id: 's_slide',
          x: 625,
          y: 430,
          count: 2,
          dir: 'up',
          troll: {
            type: 'slide',
            padX: 28,
            speedX: 520,
            targetDX: 64
          }
        }
      ],
      crushers: [],
      saws: [],
      springs: [],
      gravityZones: [],
      coins: [
        { id: 'c1', x: 185, y: 316 },
        { id: 'c2', x: 326, y: 386 },
        { id: 'c3', x: 522, y: 374 },
        { id: 'c4', x: 730, y: 396 }
      ],
      skillOrb: { x: 78, y: 238 },
      doors: [
        {
          id: 'd_main',
          x: 782,
          y: 376,
          shyWaypoints: [
            { dist: 56, targetX: 886, dropPlatformId: 'p_door_gap' },
            { dist: 44, targetX: 708 }
          ]
        }
      ]
    },

    // LEVEL 02: MIND THE CEILING
    {
      id: 2,
      code: '02',
      title: 'Mind The Ceiling',
      subtitle: 'Kaizo blocks, double-slam fakeouts, and a 99% door tax.',
      width: 1080,
      height: 540,
      parDeaths: 6,
      parTimeMs: 14000,
      rewardCoins: 55,
      spawn: { x: 56, y: 398 },
      quips: [
        'Jumping greedy for coins builds character.',
        'Never trust a crusher on its first retraction.',
        'Why did the fourth bridge tile launch UP?!',
        'Always check the sky right before the exit door.'
      ],
      signs: [
        { x: 173, y: 372, w: 112, before: 'FREE COIN', after: 'BONK!', watchId: 'p_bonk' },
        { x: 571, y: 268, w: 128, before: '1 SLAM ONLY', after: 'DOUBLE SLAM!', watchId: 'cr2' },
        { x: 1005, y: 310, w: 118, before: 'SAFE EXIT', after: '99% ANVIL!', watchId: 'cr_sky_door' }
      ],
      platforms: [
        { id: 'p1', x: 0, y: 430, w: 215, h: 110 },
        {
          id: 'p_bonk',
          x: 152,
          y: 322,
          w: 42,
          h: 20,
          troll: { type: 'hidden_solid' }
        },
        { id: 'p2', x: 298, y: 430, w: 372, h: 110 },
        { id: 'roof', x: 350, y: 0, w: 320, h: 140 },
        // Crumbling bridge (first 3 fall, 4th rockets upward into ceiling spikes!)
        {
          id: 'b1',
          x: 695,
          y: 430,
          w: 52,
          h: 22,
          troll: { type: 'touch_drop', speedY: 620, targetDY: 160 }
        },
        {
          id: 'b2',
          x: 755,
          y: 430,
          w: 52,
          h: 22,
          troll: { type: 'touch_drop', speedY: 620, targetDY: 160 }
        },
        {
          id: 'b3',
          x: 815,
          y: 430,
          w: 52,
          h: 22,
          troll: { type: 'touch_drop', speedY: 620, targetDY: 160 }
        },
        {
          id: 'b4_up',
          x: 875,
          y: 430,
          w: 54,
          h: 22,
          troll: { type: 'touch_drop', speedY: 740, targetDY: -195 }
        },
        { id: 'roof_end', x: 862, y: 175, w: 80, h: 24 },
        { id: 'p_end', x: 948, y: 430, w: 132, h: 110 },
        // Orb step above roof
        { id: 'p_orb_step', x: 300, y: 348, w: 46, h: 16 },
        { id: 'p_orb_step2', x: 280, y: 266, w: 56, h: 16 },
        { id: 'p_orb_step3', x: 315, y: 188, w: 48, h: 16 }
      ],
      spikes: [
        { id: 'sp_ceil_b4', x: 876, y: 199, count: 3, dir: 'down' }
      ],
      crushers: [
        {
          id: 'cr1',
          x: 410,
          y: 140,
          w: 66,
          h: 76,
          padLeft: 20,
          slamSpeed: 1020,
          dropDist: 214,
          retractSpeed: 290
        },
        {
          id: 'cr2',
          x: 535,
          y: 140,
          w: 72,
          h: 76,
          padLeft: 20,
          doubleSlam: true,
          slamSpeed: 1060,
          dropDist: 214,
          retractSpeed: 300
        },
        // Offscreen last-second Door Anvil!
        {
          id: 'cr_sky_door',
          x: 966,
          y: -80,
          w: 44,
          h: 56,
          padLeft: 14,
          slamSpeed: 1220,
          dropDist: 444,
          retractSpeed: 360
        }
      ],
      saws: [],
      springs: [],
      gravityZones: [],
      coins: [
        { id: 'c1', x: 173, y: 286 },
        { id: 'c2', x: 444, y: 394 },
        { id: 'c3', x: 571, y: 394 },
        { id: 'c4', x: 781, y: 388 },
        { id: 'c5', x: 902, y: 388 }
      ],
      skillOrb: { x: 495, y: 108 },
      doors: [
        { id: 'd_main', x: 1022, y: 376 }
      ]
    },

    // LEVEL 03: SPRING LOADED LIES
    {
      id: 3,
      code: '03',
      title: 'Spring Loaded Lies',
      subtitle: 'Ceiling ambushes, fake checkpoints, and waking buzzsaws.',
      width: 1160,
      height: 540,
      parDeaths: 6,
      parTimeMs: 14500,
      rewardCoins: 65,
      spawn: { x: 54, y: 398 },
      quips: [
        'Bouncing straight up was a bold mistake.',
        'That "SAVE" flag has ended countless careers.',
        'The decorative gear behind you was not decorative.',
        'Jump the spike AND outrun the saw!'
      ],
      signs: [
        { x: 240, y: 368, w: 116, before: 'BOUNCE UP!', after: 'STEER RIGHT!', watchId: 'sp_spring_ceil' },
        { x: 755, y: 332, w: 124, before: 'FREE SAVE', after: 'FAKE SAVE!', watchId: 'cp1' }
      ],
      fakeCheckpoints: [
        { id: 'cp1', x: 755, y: 430 }
      ],
      platforms: [
        { id: 'p1', x: 0, y: 430, w: 280, h: 110 },
        { id: 'ceil_trap', x: 188, y: 148, w: 105, h: 24 },
        { id: 'p_high', x: 310, y: 286, w: 155, h: 24 },
        {
          id: 'p_scoot',
          x: 555,
          y: 340,
          w: 96,
          h: 24,
          troll: {
            type: 'slide',
            padX: 38,
            speedX: 480,
            targetDX: -52
          }
        },
        { id: 'p_runway', x: 665, y: 430, w: 495, h: 110 },
        { id: 'p_orb_ledge', x: 48, y: 246, w: 96, h: 20 }
      ],
      spikes: [
        {
          id: 'sp_spring_ceil',
          x: 204,
          y: 172,
          count: 4,
          dir: 'down',
          hidden: true,
          troll: {
            type: 'pop',
            padX: 35,
            triggerRect: { x: 195, y: 170, w: 90, h: 190 }
          }
        },
        {
          id: 'sp_hurdle',
          x: 925,
          y: 430,
          count: 2,
          dir: 'up',
          troll: {
            type: 'jump',
            jumpVy: -515
          }
        }
      ],
      crushers: [],
      saws: [
        {
          id: 'saw_sleeper',
          x: 685,
          y: 412,
          r: 18,
          wakeRect: { x: 795, y: 150, w: 120, h: 290 },
          chaseSpeedX: 224,
          maxX: 1042
        }
      ],
      springs: [
        { id: 'spr1', x: 222, y: 418, w: 36, h: 12, boostVy: -875 }
      ],
      gravityZones: [],
      coins: [
        { id: 'c1', x: 240, y: 275 },
        { id: 'c2', x: 390, y: 250 },
        { id: 'c3', x: 550, y: 295 },
        { id: 'c4', x: 840, y: 394 },
        { id: 'c5', x: 943, y: 362 }
      ],
      skillOrb: { x: 96, y: 208 },
      doors: [
        { id: 'd_main', x: 1085, y: 376 }
      ]
    },

    // LEVEL 04: COIN OPERATED
    {
      id: 4,
      code: '04',
      title: 'Coin Operated',
      subtitle: 'Dodging bait coins, spiked steps, and a fake finish line.',
      width: 1180,
      height: 540,
      parDeaths: 6,
      parTimeMs: 17000,
      rewardCoins: 75,
      spawn: { x: 54, y: 398 },
      quips: [
        'The coin literally led you onto a trapdoor.',
        'Aim for the right side of the middle step!',
        'Decoy exit! The real door materialized up top.',
        'Even the victory balcony brought a secret spike.'
      ],
      signs: [
        { x: 310, y: 345, w: 120, before: 'TAKE COIN', after: 'TRAPDOOR!', watchId: 'p_coin_trap' },
        { x: 1085, y: 318, w: 124, before: 'REAL EXIT', after: 'LOOK UP!', watchId: 'd_decoy' }
      ],
      platforms: [
        { id: 'p1', x: 0, y: 430, w: 265, h: 110 },
        {
          id: 'p_coin_trap',
          x: 265,
          y: 430,
          w: 96,
          h: 110,
          troll: {
            type: 'drop',
            padX: 12,
            speedY: 820,
            targetDY: 155
          }
        },
        { id: 'p2', x: 361, y: 430, w: 125, h: 110 },
        { id: 'st1', x: 515, y: 372, w: 96, h: 22 },
        { id: 'st2', x: 645, y: 316, w: 112, h: 22 },
        { id: 'st3', x: 785, y: 372, w: 96, h: 22 },
        { id: 'p3', x: 910, y: 430, w: 270, h: 110 },
        { id: 'p_balcony', x: 535, y: 192, w: 205, h: 22 },
        {
          id: 'p_reveal_step',
          x: 760,
          y: 248,
          w: 78,
          h: 20,
          hiddenUntilReveal: true
        }
      ],
      spikes: [
        {
          id: 'sp_step2_left',
          x: 648,
          y: 316,
          count: 2,
          dir: 'up',
          hidden: true,
          troll: {
            type: 'pop',
            padX: 26
          }
        },
        {
          id: 'sp_balcony_guard',
          x: 700,
          y: 192,
          count: 1,
          dir: 'up',
          hidden: true,
          troll: {
            type: 'pop',
            padX: 18
          }
        }
      ],
      crushers: [],
      saws: [],
      springs: [],
      gravityZones: [],
      coins: [
        { id: 'c_bait', x: 242, y: 394, shyDX: 72, trapPlatformId: 'p_coin_trap' },
        { id: 'c2', x: 562, y: 336 },
        { id: 'c3', x: 724, y: 280 },
        { id: 'c4', x: 832, y: 336 },
        { id: 'c5', x: 970, y: 394, shyDX: 58 },
        { id: 'c6', x: 565, y: 156 }
      ],
      skillOrb: { x: 280, y: 268 },
      doors: [
        {
          id: 'd_decoy',
          x: 1085,
          y: 376,
          fake: true,
          revealDoorId: 'd_real',
          revealPlatformId: 'p_reveal_step'
        },
        {
          id: 'd_real',
          x: 615,
          y: 138,
          hiddenUntilReveal: true
        }
      ]
    },

    // LEVEL 05: MOVING DAY
    {
      id: 5,
      code: '05',
      title: 'Moving Day',
      subtitle: 'A marching spike wall forces panic into every trap ahead.',
      width: 1240,
      height: 540,
      parDeaths: 7,
      parTimeMs: 16000,
      rewardCoins: 85,
      spawn: { x: 54, y: 398 },
      quips: [
        'The island scooted away mid-jump.',
        'Take your time — oh wait, giant spike wall!',
        'Hidden guard spikes love sprinters.',
        'Panic is the level designer’s best weapon.'
      ],
      signs: [
        { x: 525, y: 332, w: 126, before: 'TAKE UR TIME', after: 'RUN FAST!!', watchId: 'chaser_wall' },
        { x: 955, y: 300, w: 118, before: 'FINISH!', after: 'KEEP RUNNING', watchId: 'd_main' }
      ],
      chaserWall: {
        id: 'chaser_wall',
        x: -30,
        w: 60,
        wakeX: 465,
        speedX: 136,
        maxX: 1080
      },
      platforms: [
        { id: 'p1', x: 0, y: 430, w: 205, h: 110 },
        {
          id: 'p_island',
          x: 265,
          y: 410,
          w: 105,
          h: 24,
          troll: {
            type: 'slide',
            padX: 55,
            speedX: 480,
            targetDX: 42
          }
        },
        { id: 'p_mid', x: 455, y: 410, w: 350, h: 130 },
        { id: 'p_end', x: 880, y: 410, w: 360, h: 130 },
        { id: 'p_orb', x: 560, y: 292, w: 92, h: 20 }
      ],
      spikes: [
        {
          id: 'sp_dancer',
          x: 695,
          y: 410,
          count: 2,
          dir: 'up',
          troll: {
            type: 'slide',
            padX: 85,
            speedX: 480,
            targetDX: -125
          }
        },
        {
          id: 'sp_door_guard',
          x: 1025,
          y: 410,
          count: 2,
          dir: 'up',
          hidden: true,
          troll: {
            type: 'pop',
            padX: 38
          }
        }
      ],
      crushers: [],
      saws: [],
      springs: [],
      gravityZones: [],
      coins: [
        { id: 'c1', x: 335, y: 368 },
        { id: 'c2', x: 525, y: 374 },
        { id: 'c3', x: 655, y: 374 },
        { id: 'c4', x: 842, y: 350 },
        { id: 'c5', x: 1043, y: 344 }
      ],
      skillOrb: { x: 606, y: 254 },
      doors: [
        {
          id: 'd_main',
          x: 935,
          y: 356,
          shyTargetX: 1155
        }
      ]
    },

    // LEVEL 06: POLARITY SHIFT
    {
      id: 6,
      code: '06',
      title: 'Polarity Shift',
      subtitle: 'Upside-down ceiling betrayals, fake checkpoints, and jumping spikes.',
      width: 1280,
      height: 540,
      parDeaths: 7,
      parTimeMs: 18000,
      rewardCoins: 95,
      spawn: { x: 62, y: 398 },
      quips: [
        'Checking behind spawn? Cheeky spike says hi.',
        'Even upside-down ceilings drop out from under you.',
        'Still trusting SAVE flags on Stage 06?!',
        'One jumping spike between you and freedom.'
      ],
      signs: [
        { x: 605, y: 175, w: 124, before: 'SOLID ROOF', after: 'BYE ROOF!', watchId: 'c_part' },
        { x: 1005, y: 332, w: 122, before: 'CHECKPOINT', after: 'NEVER REAL', watchId: 'cp6' }
      ],
      fakeCheckpoints: [
        { id: 'cp6', x: 1005, y: 430 }
      ],
      platforms: [
        { id: 'p_start', x: 0, y: 430, w: 330, h: 110 },
        { id: 'c_run1', x: 250, y: 0, w: 310, h: 96 },
        {
          id: 'c_part',
          x: 560,
          y: 0,
          w: 92,
          h: 96,
          troll: {
            type: 'drop',
            padX: 16,
            speedY: 780,
            targetDY: -125
          }
        },
        { id: 'c_run2', x: 652, y: 0, w: 340, h: 96 },
        { id: 'p_end', x: 895, y: 430, w: 385, h: 110 }
      ],
      spikes: [
        // Cheeky spawn-left punisher if you walk backward at the start!
        {
          id: 'sp_spawn_left',
          x: 8,
          y: 430,
          count: 1,
          dir: 'up',
          hidden: true,
          troll: {
            type: 'pop',
            padX: 16
          }
        },
        { id: 'sp_pit', x: 350, y: 520, count: 8, dir: 'up' },
        {
          id: 'sp_ceil_slide',
          x: 760,
          y: 96,
          count: 2,
          dir: 'down',
          troll: {
            type: 'slide',
            padX: 36,
            speedX: 480,
            targetDX: 68
          }
        },
        {
          id: 'sp_end_jump',
          x: 1095,
          y: 430,
          count: 2,
          dir: 'up',
          troll: {
            type: 'jump',
            jumpVy: -520
          }
        }
      ],
      crushers: [],
      saws: [],
      springs: [],
      gravityZones: [
        { id: 'gz_up', x: 280, y: 96, w: 56, h: 334, gravitySign: -1 },
        { id: 'gz_down', x: 925, y: 96, w: 62, h: 334, gravitySign: 1 }
      ],
      coins: [
        { id: 'c1', x: 210, y: 394 },
        { id: 'c2', x: 440, y: 128 },
        { id: 'c3', x: 605, y: 150 },
        { id: 'c4', x: 830, y: 128 },
        { id: 'c5', x: 1112, y: 368 }
      ],
      skillOrb: { x: 698, y: 192 },
      doors: [
        { id: 'd_main', x: 1205, y: 376 }
      ]
    },

    // LEVEL 07: SAWTOOTH PROTOCOL
    {
      id: 7,
      code: '07',
      title: 'Sawtooth Protocol',
      subtitle: 'Half-dropping islands, double-slam ambush, and a 99% trapdoor.',
      width: 1360,
      height: 540,
      parDeaths: 9,
      parTimeMs: 20000,
      rewardCoins: 115,
      spawn: { x: 54, y: 398 },
      quips: [
        'First half was honest. Second half vanished.',
        'Upper crusher double-slams! Lower saw chases!',
        'Right in front of the finish line. Brutal.',
        'Bait, breathe, and commit.'
      ],
      signs: [
        { x: 425, y: 365, w: 122, before: 'SOLID LAND', after: 'HALF SOLID!', watchId: 'p2_drop' },
        { x: 1162, y: 355, w: 116, before: 'VICTORY!', after: '99% TRAP!', watchId: 'p_final_trap' }
      ],
      platforms: [
        { id: 'p1', x: 0, y: 430, w: 225, h: 110 },
        { id: 'p2_safe', x: 310, y: 430, w: 80, h: 110 },
        {
          id: 'p2_drop',
          x: 390,
          y: 430,
          w: 82,
          h: 110,
          troll: {
            type: 'drop',
            padX: 12,
            speedY: 820,
            targetDY: 155
          }
        },
        { id: 'p_low', x: 545, y: 430, w: 380, h: 110 },
        { id: 'p_high1', x: 555, y: 345, w: 95, h: 20 },
        { id: 'p_high2', x: 690, y: 275, w: 175, h: 20 },
        { id: 'roof_high', x: 720, y: 40, w: 110, h: 36 },
        { id: 'p_pre_end', x: 995, y: 430, w: 135, h: 110 },
        {
          id: 'p_final_trap',
          x: 1130,
          y: 430,
          w: 64,
          h: 110,
          troll: {
            type: 'drop',
            padX: 10,
            speedY: 840,
            targetDY: 155
          }
        },
        { id: 'p_end', x: 1194, y: 430, w: 166, h: 110 }
      ],
      spikes: [
        {
          id: 'sp_low_mid',
          x: 760,
          y: 430,
          count: 2,
          dir: 'up',
          troll: {
            type: 'jump',
            jumpVy: -515
          }
        }
      ],
      crushers: [
        {
          id: 'cr_upper',
          x: 742,
          y: 76,
          w: 62,
          h: 64,
          padLeft: 18,
          doubleSlam: true,
          slamSpeed: 1050,
          dropDist: 135,
          retractSpeed: 300
        }
      ],
      saws: [
        {
          id: 'saw_low',
          x: 575,
          y: 412,
          r: 18,
          wakeRect: { x: 635, y: 345, w: 95, h: 90 },
          chaseSpeedX: 220,
          maxX: 905
        },
        {
          id: 'saw_patrol',
          x: 960,
          y: 355,
          r: 20,
          patrolDY: 85,
          speed: 2.8
        }
      ],
      springs: [],
      gravityZones: [],
      coins: [
        { id: 'c1', x: 268, y: 372 },
        { id: 'c2', x: 430, y: 382 },
        { id: 'c3', x: 690, y: 394 },
        { id: 'c4', x: 720, y: 238 },
        { id: 'c5', x: 830, y: 238 },
        { id: 'c6', x: 1162, y: 378 }
      ],
      skillOrb: { x: 774, y: 238 },
      doors: [
        { id: 'd_main', x: 1272, y: 376 }
      ]
    },

    // LEVEL 08: PURE EXOTIC (GRAND FINALE)
    {
      id: 8,
      code: '08',
      title: 'Pure Exotic',
      subtitle: 'Every rage-bait trick united into one relentless grand finale.',
      width: 1480,
      height: 540,
      parDeaths: 12,
      parTimeMs: 24000,
      rewardCoins: 175,
      spawn: { x: 54, y: 398 },
      quips: [
        'Act I claimed another optimist.',
        'Inverted ceiling ambush successful.',
        'Fake checkpoint + waking saw + sky anvil?! Welcome to Finale.',
        'Conquer Pure Exotic and claim eternal bragging rights.'
      ],
      signs: [
        { x: 252, y: 365, w: 120, before: 'FINAL EXAM', after: 'HERE WE GO', watchId: 'p1_part' },
        { x: 1090, y: 332, w: 124, before: 'LAST SAVE!', after: 'STILL LYING', watchId: 'cp8' },
        { x: 1350, y: 312, w: 120, before: 'YOU DID IT', after: 'ONE MORE!', watchId: 'd_main' }
      ],
      fakeCheckpoints: [
        { id: 'cp8', x: 1090, y: 430 }
      ],
      platforms: [
        { id: 'p1', x: 0, y: 430, w: 210, h: 110 },
        {
          id: 'p1_part',
          x: 210,
          y: 430,
          w: 84,
          h: 110,
          troll: {
            type: 'drop',
            padX: 12,
            speedY: 820,
            targetDY: 155
          }
        },
        { id: 'p2', x: 294, y: 430, w: 266, h: 110 },
        { id: 'c_act2_a', x: 495, y: 0, w: 235, h: 92 },
        { id: 'c_act2_b', x: 815, y: 0, w: 225, h: 92 },
        { id: 'p3', x: 965, y: 430, w: 515, h: 110 }
      ],
      spikes: [
        {
          id: 'sp_act1',
          x: 395,
          y: 430,
          count: 2,
          dir: 'up',
          troll: {
            type: 'jump',
            jumpVy: -520
          }
        },
        {
          id: 'sp_act2_ceil',
          x: 625,
          y: 92,
          count: 2,
          dir: 'down',
          hidden: true,
          troll: {
            type: 'pop',
            padX: 34
          }
        },
        {
          id: 'sp_act3_jump',
          x: 1220,
          y: 430,
          count: 2,
          dir: 'up',
          troll: {
            type: 'slide',
            padX: 32,
            speedX: 510,
            targetDX: 52
          }
        }
      ],
      crushers: [
        {
          id: 'cr_finale_sky',
          x: 1358,
          y: -80,
          w: 44,
          h: 56,
          padLeft: 14,
          slamSpeed: 1240,
          dropDist: 444,
          retractSpeed: 360
        }
      ],
      saws: [
        {
          id: 'saw_finale',
          x: 995,
          y: 412,
          r: 18,
          wakeRect: { x: 1110, y: 240, w: 110, h: 200 },
          chaseSpeedX: 215,
          maxX: 1315
        }
      ],
      springs: [],
      gravityZones: [
        { id: 'gz_up', x: 515, y: 92, w: 54, h: 338, gravitySign: -1 },
        { id: 'gz_down', x: 980, y: 92, w: 58, h: 338, gravitySign: 1 }
      ],
      coins: [
        { id: 'c1', x: 252, y: 382 },
        { id: 'c2', x: 435, y: 368 },
        { id: 'c3', x: 772, y: 135 },
        { id: 'c4', x: 900, y: 126 },
        { id: 'c5', x: 1155, y: 394, shyDX: 52 },
        { id: 'c6', x: 1245, y: 364 }
      ],
      skillOrb: { x: 772, y: 182 },
      doors: [
        {
          id: 'd_main',
          x: 1315,
          y: 376,
          shyTargetX: 1418
        }
      ]
    }
  ];

  window.ExoticLevels = {
    LEVELS,
    getById(id) {
      return LEVELS.find((lvl) => lvl.id === Number(id)) || LEVELS[0];
    }
  };
})();
