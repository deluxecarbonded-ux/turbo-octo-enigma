(function () {
  const GRAVITY = 1520;
  const MAX_FALL = 680;
  const FAST_FALL = 880;
  const BASE_MOVE_SPEED = 292;
  const JUMP_VEL = 560;
  const AIR_JUMP_VEL = 525;
  const WALL_SLIDE_MAX_VY = 135;

  let canvas = null;
  let ctx = null;
  let running = false;
  let paused = false;
  let rafId = null;
  let lastTime = 0;

  // Match configuration & runtime state
  let config = {
    mode: 'cpu_1v1', // 'cpu_1v1' | 'cpu_ffa' | 'local_2p' | 'online'
    difficulty: 'veteran', // 'rookie' | 'veteran' | 'legend'
    stocks: 3,
    mapId: 'brawl_map_haven',
    onlineRoomCode: null,
    onlineSlot: 0,
    onlineOpponent: null
  };

  let mapDef = null;
  let platforms = [];
  let fighters = [];
  let skyDrops = [];
  let thrownWeapons = [];
  let particles = [];
  let blastExplosions = [];
  let phantomPads = []; // Gravity-cancel mid-air platforms
  let matchTime = 0;
  let nextDropTimer = 2.0;
  let hitstopTimer = 0;
  let shakeTimer = 0;
  let shakeMag = 0;
  let matchEnded = false;
  let winnerFighter = null;
  let countdownTimer = 1.6; // "3.. 2.. 1.. BRAWL!"

  // Camera state (smoothly frames active fighters like Brawlhalla)
  const camera = {
    cx: 480,
    cy: 270,
    zoom: 1,
    targetCx: 480,
    targetCy: 270,
    targetZoom: 1
  };

  // Input state
  const keysDown = new Set();
  const keysJustPressed = new Set();
  let mouseButtonsJustPressed = new Set();
  let mouseButtonsDown = new Set();

  // Online sync transport (BroadcastChannel fast-path + /api/brawl/rooms cloud sync)
  let brawlChannel = null;
  let lastCloudSyncAt = 0;
  let cloudSyncInFlight = false;

  function ensureBroadcastChannel() {
    if (brawlChannel || typeof BroadcastChannel === 'undefined') return;
    try {
      brawlChannel = new BroadcastChannel('exotic_brawl_room_v1');
      brawlChannel.onmessage = (ev) => {
        const msg = ev?.data;
        if (!msg || !running || config.mode !== 'online') return;
        if (msg.roomCode !== config.onlineRoomCode) return;
        if (msg.slot === config.onlineSlot) return;
        applyRemoteFighterSnapshot(msg.slot, msg.fighterState, msg.worldState);
      };
    } catch {
      brawlChannel = null;
    }
  }

  function createFighter(opts) {
    return {
      slot: opts.slot,
      label: opts.label,
      isHuman: Boolean(opts.isHuman),
      isLocalP2: Boolean(opts.isLocalP2),
      isRemote: Boolean(opts.isRemote),
      isCpu: Boolean(opts.isCpu),
      characterId: opts.characterId || 'char_classic',
      skinId: opts.skinId || 'skin_solid',
      auraId: opts.auraId || 'aura_none',
      trailId: opts.trailId || 'trail_none',
      emoteId: opts.emoteId || 'emote_salute',
      preferredWeapon: opts.preferredWeapon || 'weapon_fists',
      heldWeapon: 'weapon_fists', // Every fighter starts every stock with Bare Fists!
      x: opts.x,
      y: opts.y,
      w: 22,
      h: 26,
      vx: 0,
      vy: 0,
      facing: opts.facing || 1,
      onGround: false,
      wallDir: 0, // -1 touching left wall of island, +1 touching right wall
      jumpsUsed: 0,
      maxJumps: 3,
      recoveryUsed: false,
      exhaustedRecoveryUsed: false,
      dodgeTimer: 0,
      dodgeCooldown: 0,
      spotDodging: false,
      invulnTimer: 1.4,
      respawnTimer: 0,
      hitstunTimer: 0,
      dropThroughTimer: 0,
      damage: 0,
      stocks: config.stocks,
      kos: 0,
      damageDealt: 0,
      lastHitBy: -1,
      eliminated: false,
      walkPhase: 0,
      emoteTimer: 0,
      attack: null,
      trailSys: window.ExoticTrailSystem ? new window.ExoticTrailSystem() : null,
      aiBrain: {
        decisionTimer: 0,
        wantLeft: false,
        wantRight: false,
        wantUp: false,
        wantDown: false,
        wantJump: false,
        wantLight: false,
        wantHeavy: false,
        wantDodge: false,
        wantPickup: false
      }
    };
  }

  function getDamageTierColor(dmg, pal) {
    if (!pal.colored) {
      const isLight = pal.mode === 'light';
      if (dmg < 50) return isLight ? '#d4d4d4' : '#ffffff';
      if (dmg < 100) return isLight ? '#a3a3a3' : '#d4d4d4';
      if (dmg < 150) return isLight ? '#525252' : '#737373';
      return isLight ? '#171717' : '#404040';
    }
    if (dmg < 40) return '#ffffff';
    if (dmg < 80) return '#fde047';
    if (dmg < 120) return '#fb923c';
    if (dmg < 165) return '#ef4444';
    return '#991b1b';
  }

  function getFighterIndicatorColor(slot, pal) {
    if (!pal.colored) return pal.playerPrimary;
    const paletteSlots = ['#38bdf8', '#f43f5e', '#fbbf24', '#34d399'];
    return paletteSlots[slot % paletteSlots.length];
  }

  function updateHudCards() {
    const wrap = document.getElementById('brawl-hud-fighters');
    if (!wrap) return;
    const pal = window.ExoticTheme.getPalette();

    if (wrap.children.length !== fighters.length) {
      wrap.innerHTML = '';
      fighters.forEach((f) => {
        const card = document.createElement('div');
        card.className = 'brawl-fighter-hud';
        card.setAttribute('data-fighter-slot', String(f.slot));
        card.innerHTML = `
          <div class="brawl-hud-top-row">
            <span class="brawl-hud-name"></span>
            <span class="brawl-hud-weapon mono"></span>
          </div>
          <div class="brawl-hud-mid-row">
            <div class="brawl-hud-dmg-pill">
              <span class="brawl-hud-dmg-dot"></span>
              <span class="brawl-hud-dmg-val mono">0</span>
            </div>
            <div class="brawl-hud-stocks"></div>
          </div>
        `;
        wrap.appendChild(card);
      });
    }

    fighters.forEach((f, idx) => {
      const card = wrap.children[idx];
      if (!card) return;
      card.classList.toggle('is-eliminated', f.eliminated);
      const nameEl = card.querySelector('.brawl-hud-name');
      const wepEl = card.querySelector('.brawl-hud-weapon');
      const dotEl = card.querySelector('.brawl-hud-dmg-dot');
      const dmgEl = card.querySelector('.brawl-hud-dmg-val');
      const stocksEl = card.querySelector('.brawl-hud-stocks');

      const wDef = window.ExoticBrawlData.getWeaponById(f.heldWeapon);
      if (nameEl) nameEl.textContent = f.label;
      if (wepEl) wepEl.textContent = wDef.shortName.toUpperCase();
      if (dmgEl) dmgEl.textContent = String(Math.round(f.damage));
      if (dotEl) {
        dotEl.style.backgroundColor = getDamageTierColor(f.damage, pal);
      }
      if (stocksEl) {
        let pips = '';
        const dotColor = getFighterIndicatorColor(f.slot, pal);
        for (let s = 0; s < config.stocks; s++) {
          const alive = s < f.stocks;
          pips += `<span class="brawl-stock-pip${alive ? ' is-alive' : ''}" style="${
            alive && pal.colored ? `background-color:${dotColor};` : ''
          }"></span>`;
        }
        stocksEl.innerHTML = pips;
      }
    });

    const timerEl = document.getElementById('brawl-hud-time-val');
    if (timerEl) {
      const mins = Math.floor(matchTime / 60);
      const secs = Math.floor(matchTime % 60);
      timerEl.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
  }

  function spawnSkyDrop() {
    if (!mapDef || !mapDef.dropZones || mapDef.dropZones.length === 0) return;
    if (skyDrops.length >= 2) return;
    const occupied = new Set(skyDrops.map((d) => d.zoneIdx));
    const candidates = mapDef.dropZones
      .map((z, idx) => ({ z, idx }))
      .filter((item) => !occupied.has(item.idx));
    if (candidates.length === 0) return;
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    skyDrops.push({
      id: 'drop_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      zoneIdx: pick.idx,
      x: pick.z.x,
      y: -140,
      targetY: pick.z.y,
      groundY: pick.z.y + 18,
      falling: true,
      ttl: 16,
      seed: Math.random() * 6
    });
  }

  function buildHumanInput(isLocalP2) {
    if (isLocalP2) {
      const left = keysDown.has('ArrowLeft');
      const right = keysDown.has('ArrowRight');
      const up = keysDown.has('ArrowUp');
      const down = keysDown.has('ArrowDown');
      const jumpPressed = keysJustPressed.has('ArrowUp');
      const lightPressed = keysJustPressed.has('KeyJ') || keysJustPressed.has('Comma');
      const heavyPressed = keysJustPressed.has('KeyK') || keysJustPressed.has('Period');
      const heavyHeld = keysDown.has('KeyK') || keysDown.has('Period');
      const dodgePressed = keysJustPressed.has('KeyL') || keysJustPressed.has('Slash');
      const pickupPressed = keysJustPressed.has('KeyU') || keysJustPressed.has('Semicolon');
      const tauntPressed = keysJustPressed.has('KeyI');
      return {
        left,
        right,
        up,
        down,
        jumpPressed,
        lightPressed,
        heavyPressed,
        heavyHeld,
        dodgePressed,
        pickupPressed,
        tauntPressed
      };
    }

    // In Local 2P, P1 strictly uses WASD + F/G/H/R/T so Arrow Keys belong exclusively to P2!
    const soloMode = config.mode !== 'local_2p';
    const left = keysDown.has('KeyA') || (soloMode && keysDown.has('ArrowLeft'));
    const right = keysDown.has('KeyD') || (soloMode && keysDown.has('ArrowRight'));
    const up = keysDown.has('KeyW') || (soloMode && keysDown.has('ArrowUp'));
    const down = keysDown.has('KeyS') || (soloMode && keysDown.has('ArrowDown'));
    const jumpPressed =
      keysJustPressed.has('KeyW') ||
      keysJustPressed.has('Space') ||
      (soloMode && keysJustPressed.has('ArrowUp'));
    const lightPressed =
      keysJustPressed.has('KeyF') ||
      (soloMode &&
        (keysJustPressed.has('KeyJ') ||
          keysJustPressed.has('KeyZ') ||
          mouseButtonsJustPressed.has(0)));
    const heavyPressed =
      keysJustPressed.has('KeyG') ||
      (soloMode &&
        (keysJustPressed.has('KeyK') ||
          keysJustPressed.has('KeyX') ||
          mouseButtonsJustPressed.has(2)));
    const heavyHeld =
      keysDown.has('KeyG') ||
      (soloMode &&
        (keysDown.has('KeyK') || keysDown.has('KeyX') || mouseButtonsDown.has(2)));
    const dodgePressed =
      (config.mode === 'local_2p' ? keysJustPressed.has('KeyH') : false) ||
      keysJustPressed.has('ShiftLeft') ||
      keysJustPressed.has('ShiftRight') ||
      (soloMode && keysJustPressed.has('KeyL'));
    const pickupPressed =
      keysJustPressed.has('KeyR') ||
      (soloMode &&
        (keysJustPressed.has('KeyH') ||
          keysJustPressed.has('KeyC') ||
          mouseButtonsJustPressed.has(1)));
    const tauntPressed =
      keysJustPressed.has('KeyT') || (soloMode && keysJustPressed.has('KeyE'));

    return {
      left,
      right,
      up,
      down,
      jumpPressed,
      lightPressed,
      heavyPressed,
      heavyHeld,
      dodgePressed,
      pickupPressed,
      tauntPressed
    };
  }

  function buildCpuInput(f, dt) {
    const brain = f.aiBrain;
    brain.decisionTimer -= dt;

    const diffCfg =
      config.difficulty === 'legend'
        ? { react: 0.08, aggro: 0.78, dodgeRate: 0.42, sigRate: 0.34 }
        : config.difficulty === 'rookie'
          ? { react: 0.28, aggro: 0.34, dodgeRate: 0.1, sigRate: 0.18 }
          : { react: 0.15, aggro: 0.58, dodgeRate: 0.25, sigRate: 0.26 };

    // Always evaluate off-stage emergency recovery every frame!
    const solids = platforms.filter((p) => p.type === 'solid');
    let nearestSolid = solids[0];
    let bestDist = Infinity;
    const fcx = f.x + f.w * 0.5;
    for (const s of solids) {
      const scx = s.x + s.w * 0.5;
      const d = Math.abs(fcx - scx);
      if (d < bestDist) {
        bestDist = d;
        nearestSolid = s;
      }
    }

    const overSolid = solids.some((s) => fcx >= s.x + 6 && fcx <= s.x + s.w - 6);
    const stageTopY = nearestSolid ? nearestSolid.y : 350;

    if (!overSolid || f.y > stageTopY + 18) {
      const targetX = nearestSolid ? nearestSolid.x + nearestSolid.w * 0.5 : 480;
      const wantL = fcx > targetX + 10;
      const wantR = fcx < targetX - 10;
      const needJump =
        f.vy > 85 &&
        (f.y > stageTopY - 12 || !overSolid) &&
        f.jumpsUsed < f.maxJumps &&
        Math.random() < 0.28;
      const needRec =
        f.vy > 60 &&
        f.y > stageTopY + 10 &&
        f.jumpsUsed >= f.maxJumps &&
        !f.recoveryUsed &&
        !f.attack;
      return {
        left: wantL,
        right: wantR,
        up: needRec || needJump,
        down: false,
        jumpPressed: needJump || (f.wallDir !== 0 && Math.random() < 0.35),
        lightPressed: false,
        heavyPressed: needRec,
        heavyHeld: false,
        dodgePressed: false,
        pickupPressed: false,
        tauntPressed: false
      };
    }

    let jumpPressed = false;
    let lightPressed = false;
    let heavyPressed = false;
    let dodgePressed = false;
    let pickupPressed = false;

    if (brain.decisionTimer <= 0) {
      brain.decisionTimer = diffCfg.react * (0.75 + Math.random() * 0.55);

      // Find nearest living enemy
      let target = null;
      let tDist = Infinity;
      for (const other of fighters) {
        if (other.slot === f.slot || other.eliminated || other.respawnTimer > 0) continue;
        const d = Math.hypot(other.x - f.x, other.y - f.y);
        if (d < tDist) {
          tDist = d;
          target = other;
        }
      }

      // If unarmed & a landed sky-drop exists nearby and CPU has a preferred shop weapon, go grab it!
      let seekDrop = null;
      if (f.heldWeapon === 'weapon_fists' && f.preferredWeapon !== 'weapon_fists') {
        for (const d of skyDrops) {
          if (!d.falling && Math.hypot(d.x - fcx, d.y - f.y) < 220) {
            seekDrop = d;
            break;
          }
        }
      }

      if (seekDrop) {
        brain.wantLeft = seekDrop.x < fcx - 14;
        brain.wantRight = seekDrop.x > fcx + 14;
        if (seekDrop.y < f.y - 26 && f.jumpsUsed < f.maxJumps) jumpPressed = true;
        if (Math.hypot(seekDrop.x - fcx, seekDrop.y - (f.y + 13)) < 36) {
          pickupPressed = true;
        }
      } else if (target) {
        const dx = target.x - f.x;
        const dy = target.y - f.y;
        const absX = Math.abs(dx);
        const desiredRange = f.heldWeapon === 'weapon_blasters' || f.heldWeapon === 'weapon_spear' ? 48 : 28;

        brain.wantLeft = dx < -desiredRange;
        brain.wantRight = dx > desiredRange;
        brain.wantUp = dy < -40;
        brain.wantDown = dy > 44 && !f.onGround;

        if (dy < -42 && f.jumpsUsed < f.maxJumps && Math.random() < 0.65) {
          jumpPressed = true;
        }

        // Dodge incoming attack
        if (
          target.attack &&
          absX < 68 &&
          Math.abs(dy) < 46 &&
          f.dodgeCooldown <= 0 &&
          Math.random() < diffCfg.dodgeRate
        ) {
          dodgePressed = true;
        } else if (absX < 64 && Math.abs(dy) < 44 && Math.random() < diffCfg.aggro) {
          if ((target.damage >= 95 || Math.random() < diffCfg.sigRate) && Math.random() < 0.45) {
            heavyPressed = true;
          } else {
            lightPressed = true;
          }
        }
      } else {
        brain.wantLeft = false;
        brain.wantRight = false;
      }
    }

    return {
      left: brain.wantLeft,
      right: brain.wantRight,
      up: brain.wantUp,
      down: brain.wantDown,
      jumpPressed,
      lightPressed,
      heavyPressed,
      heavyHeld: false,
      dodgePressed,
      pickupPressed,
      tauntPressed: false
    };
  }

  function startAttack(f, isHeavy, inp, gravityCanceled = false) {
    const wDef = window.ExoticBrawlData.getWeaponById(f.heldWeapon);
    const grounded = f.onGround || gravityCanceled;
    let moveKey = 'nlight';

    if (inp.left && !inp.right) f.facing = -1;
    else if (inp.right && !inp.left) f.facing = 1;

    if (grounded) {
      if (isHeavy) {
        if (inp.down) moveKey = 'dsig';
        else if (inp.left || inp.right) moveKey = 'ssig';
        else moveKey = 'nsig';
      } else {
        if (inp.down) moveKey = 'dlight';
        else if (inp.left || inp.right) moveKey = 'slight';
        else moveKey = 'nlight';
      }
    } else {
      if (isHeavy) {
        if (inp.down) {
          moveKey = 'groundpound';
        } else {
          if (f.recoveryUsed && f.exhaustedRecoveryUsed) return;
          moveKey = 'recovery';
        }
      } else {
        if (inp.down) moveKey = 'dair';
        else if (inp.left || inp.right) moveKey = 'sair';
        else moveKey = 'nair';
      }
    }

    const mv = wDef.moves[moveKey];
    if (!mv) return;

    f.invulnTimer = 0; // Attacking cancels spawn invulnerability (Brawlhalla rule!)
    f.spotDodging = false;
    f.dodgeTimer = 0;

    if (gravityCanceled) {
      phantomPads.push({
        x: f.x + f.w * 0.5 - 20,
        y: f.y + f.h + 2,
        w: 40,
        timer: 0.34,
        maxTimer: 0.34
      });
      f.vy = 0;
    }

    let liftMul = 1;
    if (moveKey === 'recovery') {
      if (f.recoveryUsed) {
        f.exhaustedRecoveryUsed = true;
        liftMul = 0.62;
      } else {
        f.recoveryUsed = true;
      }
    }

    f.attack = {
      moveKey,
      def: mv,
      sig: Boolean(mv.sig),
      charging: Boolean(mv.sig && grounded && inp.heavyHeld),
      chargeTime: 0,
      timer: 0,
      lungeApplied: false,
      liftMul,
      hitTargets: new Set()
    };

    if (window.ExoticAudio) {
      window.ExoticAudio.jump?.();
    }
  }

  function tryPickupOrThrow(f, inp, onlyPickup = false) {
    const fcx = f.x + f.w * 0.5;
    const fcy = f.y + f.h * 0.5;

    // 1. Check nearby Thrown Weapon Re-Pickup OR Sky-Drop Pickup when Unarmed
    if (f.heldWeapon === 'weapon_fists') {
      let bestThrownIdx = -1;
      let bestThrownD = 44;
      for (let i = 0; i < thrownWeapons.length; i++) {
        const tw = thrownWeapons[i];
        if (!tw.grounded) continue;
        if ((tw.age || 0) < 0.18 && tw.ownerSlot === f.slot) continue;
        const d = Math.hypot(tw.x - fcx, tw.y - fcy);
        if (d < bestThrownD) {
          bestThrownD = d;
          bestThrownIdx = i;
        }
      }
      if (bestThrownIdx >= 0) {
        const picked = thrownWeapons.splice(bestThrownIdx, 1)[0];
        f.heldWeapon = picked.weaponId || f.preferredWeapon || 'weapon_fists';
        f.dodgeCooldown = 0;
        spawnBurstParticles(fcx, fcy, 8, '#fbbf24');
        window.ExoticAudio?.orb?.();
        return true;
      }

      let bestIdx = -1;
      let bestD = 42;
      for (let i = 0; i < skyDrops.length; i++) {
        const d = Math.hypot(skyDrops[i].x - fcx, skyDrops[i].y - fcy);
        if (d < bestD) {
          bestD = d;
          bestIdx = i;
        }
      }
      if (bestIdx >= 0) {
        skyDrops.splice(bestIdx, 1);
        // Grant the fighter's equipped Shop Weapon (or Unarmed Surge if Bare Fists is equipped!)
        f.heldWeapon = f.preferredWeapon || 'weapon_fists';
        f.dodgeCooldown = 0;
        spawnBurstParticles(fcx, fcy, 8, '#fbbf24');
        window.ExoticAudio?.orb?.();
        return true;
      }
    }

    if (onlyPickup) return false;

    // 2. Throw currently held Shop Weapon (returns fighter to Bare Fists!)
    if (f.heldWeapon !== 'weapon_fists') {
      let aimX = f.facing;
      let aimY = 0;
      if (inp.left) aimX = -1;
      else if (inp.right) aimX = 1;
      if (inp.up) aimY = -1;
      else if (inp.down) aimY = 1;
      if (inp.up && !inp.left && !inp.right) aimX = 0;
      const len = Math.hypot(aimX, aimY) || 1;
      const speed = 640;

      thrownWeapons.push({
        ownerSlot: f.slot,
        weaponId: f.heldWeapon,
        x: fcx + (aimX / len) * 14,
        y: fcy + (aimY / len) * 14,
        vx: (aimX / len) * speed + f.vx * 0.25,
        vy: (aimY / len) * speed - 45,
        age: 0,
        grounded: false,
        ttl: 3.6,
        hitSlots: new Set()
      });
      f.heldWeapon = 'weapon_fists';
      f.attack = null;
      window.ExoticAudio?.dash?.();
      return true;
    }

    return false;
  }

  function spawnBurstParticles(x, y, count, color) {
    for (let i = 0; i < count; i++) {
      const ang = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      const spd = 70 + Math.random() * 165;
      particles.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        r: 2.5 + Math.random() * 3,
        timer: 0.28 + Math.random() * 0.2,
        maxTimer: 0.48,
        color
      });
    }
  }

  function applyHit(attacker, victim, opts) {
    if (victim.invulnTimer > 0 || victim.dodgeTimer > 0 || victim.eliminated || victim.respawnTimer > 0) {
      return;
    }
    const chargeMul = 1 + Math.min(0.35, (opts.chargeTime || 0) * 0.55);
    const dmg = opts.damage * chargeMul;
    victim.damage = Math.min(999, victim.damage + dmg);
    attacker.damageDealt += dmg;
    victim.lastHitBy = attacker.slot;

    // Authentic Brawlhalla Variable Knockback Scaling
    const force = (opts.baseForce + opts.varForce * (victim.damage / 100)) * chargeMul;
    const rad = (opts.angleDeg * Math.PI) / 180;
    const dirSign = opts.dirSign || attacker.facing || 1;
    victim.vx = Math.cos(rad) * force * dirSign;
    victim.vy = -Math.sin(rad) * force;
    victim.onGround = false;
    victim.attack = null;
    victim.hitstunTimer = Math.min(0.68, 0.14 + force * 0.00046);

    // Hitstop & screen shake scale with knockback force
    hitstopTimer = Math.max(hitstopTimer, Math.min(0.085, 0.032 + force * 0.00007));
    if (window.ExoticStorage.getState().settings.screenShake && force > 360) {
      shakeTimer = 0.16;
      shakeMag = Math.min(9, (force - 320) * 0.018);
    }

    spawnBurstParticles(
      victim.x + victim.w * 0.5,
      victim.y + victim.h * 0.5,
      force > 460 ? 12 : 7,
      getFighterIndicatorColor(attacker.slot, window.ExoticTheme.getPalette())
    );

    if (window.ExoticAudio) {
      if (force > 480) window.ExoticAudio.death?.();
      else window.ExoticAudio.coin?.();
    }
  }

  function handleBlastZoneKO(f, side) {
    const pal = window.ExoticTheme.getPalette();
    const sx = ((f.x + f.w * 0.5 - camera.cx) * camera.zoom) + 480;
    const sy = ((f.y + f.h * 0.5 - camera.cy) * camera.zoom) + 270;

    blastExplosions.push({
      side,
      sx,
      sy,
      timer: 0.55,
      maxTimer: 0.55,
      color: getFighterIndicatorColor(f.slot, pal)
    });

    if (window.ExoticStorage.getState().settings.screenShake) {
      shakeTimer = 0.28;
      shakeMag = 10;
    }
    window.ExoticAudio?.death?.();

    // Credit KO to last attacker
    if (f.lastHitBy >= 0 && f.lastHitBy !== f.slot) {
      const killer = fighters.find((k) => k.slot === f.lastHitBy);
      if (killer) killer.kos += 1;
    }

    f.stocks = Math.max(0, f.stocks - 1);
    f.damage = 0;
    f.heldWeapon = 'weapon_fists'; // Next stock ALWAYS starts with Bare Fists!
    f.attack = null;
    f.vx = 0;
    f.vy = 0;
    f.hitstunTimer = 0;
    f.lastHitBy = -1;

    if (f.stocks <= 0) {
      f.eliminated = true;
      checkMatchEnd();
    } else {
      const sp = mapDef.spawns[f.slot % mapDef.spawns.length] || { x: 480, y: 200, facing: 1 };
      f.x = sp.x - f.w * 0.5;
      f.y = -60;
      f.targetRespawnY = sp.y - 36;
      f.facing = sp.facing || 1;
      f.respawnTimer = 1.05;
      f.invulnTimer = 2.4;
      f.jumpsUsed = 0;
      f.recoveryUsed = false;
      f.exhaustedRecoveryUsed = false;
    }
  }

  function checkMatchEnd() {
    if (matchEnded) return;
    const alive = fighters.filter((f) => !f.eliminated);
    if (alive.length <= 1) {
      matchEnded = true;
      winnerFighter = alive[0] || fighters[0];
      onMatchFinished();
    }
  }

  function onMatchFinished() {
    const p1 = fighters[0];
    const playerWon = Boolean(winnerFighter && winnerFighter.slot === 0);
    let coinsEarned = 0;
    if (playerWon) {
      coinsEarned = config.mode === 'cpu_ffa' ? 18 : 12;
    } else if (p1 && p1.kos > 0) {
      coinsEarned = Math.min(6, p1.kos * 2);
    }

    if (coinsEarned > 0 || (p1 && p1.kos > 0)) {
      window.ExoticStorage.addCoins(coinsEarned, false);
      const clientKey = (window.ExoticSupabase?.getClientKey?.() || localStorage.getItem('exotic_runner_client_key_v1')) || '';
      fetch('/api/brawl/result', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-exotic-client-key': clientKey
        },
        body: JSON.stringify({
          clientKey,
          won: playerWon,
          kos: p1 ? p1.kos : 0,
          coinsReward: coinsEarned
        })
      })
        .then((r) => r.json())
        .then((data) => {
          if (data?.ok && data.snapshot) {
            window.ExoticStorage.hydrateFromCloudSnapshot(data.snapshot);
          }
        })
        .catch(() => {});
    }

    if (window.ExoticAudio && playerWon) {
      window.ExoticAudio.win?.();
    }

    // Open Brawl Victory / Results Modal
    const modal = document.getElementById('brawl-result-modal');
    if (modal) {
      const badgeEl = document.getElementById('brawl-res-badge');
      const titleEl = document.getElementById('brawl-res-title');
      const subEl = document.getElementById('brawl-res-subtitle');
      const kosEl = document.getElementById('brawl-res-kos');
      const dmgEl = document.getElementById('brawl-res-dmg');
      const rewardEl = document.getElementById('brawl-res-coins');

      if (badgeEl) {
        badgeEl.textContent =
          config.mode === 'local_2p'
            ? 'MATCH COMPLETE'
            : playerWon
              ? 'VICTORY'
              : 'ELIMINATED';
      }
      if (titleEl) {
        titleEl.textContent = winnerFighter
          ? `${winnerFighter.label} Wins!`
          : 'Draw Match!';
      }
      if (subEl) {
        subEl.textContent = `${mapDef.name} · ${config.stocks}-Stock Brawl`;
      }
      if (kosEl) kosEl.textContent = String(p1 ? p1.kos : 0);
      if (dmgEl) dmgEl.textContent = String(Math.round(p1 ? p1.damageDealt : 0));
      if (rewardEl) rewardEl.textContent = `+${coinsEarned} Coins`;
      modal.classList.add('is-open');
    }
  }

  function updateFighter(f, dt) {
    if (f.eliminated) return;

    if (f.invulnTimer > 0) f.invulnTimer = Math.max(0, f.invulnTimer - dt);
    if (f.dodgeCooldown > 0) f.dodgeCooldown = Math.max(0, f.dodgeCooldown - dt);
    if (f.dropThroughTimer > 0) f.dropThroughTimer = Math.max(0, f.dropThroughTimer - dt);
    if (f.emoteTimer > 0) f.emoteTimer = Math.max(0, f.emoteTimer - dt);

    // Descending on Valkyrie respawn platform
    if (f.respawnTimer > 0) {
      f.respawnTimer = Math.max(0, f.respawnTimer - dt);
      const targetY = f.targetRespawnY || 220;
      f.y += (targetY - f.y) * Math.min(1, dt * 6.5);
      f.vx = 0;
      f.vy = 0;
      return;
    }

    // Remote online opponent uses dead-reckoning interpolation
    if (f.isRemote) {
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      if (typeof f.netTargetX === 'number') {
        f.x += (f.netTargetX - f.x) * Math.min(1, dt * 14);
        f.y += (f.netTargetY - f.y) * Math.min(1, dt * 14);
      }
      if (f.attack) {
        f.attack.timer += dt;
        const mv = f.attack.def;
        if (f.attack.timer >= mv.startup + mv.active + mv.endlag) {
          f.attack = null;
        }
      }
      return;
    }

    const inp = f.isCpu ? buildCpuInput(f, dt) : buildHumanInput(f.isLocalP2);

    if (f.hitstunTimer > 0) {
      f.hitstunTimer = Math.max(0, f.hitstunTimer - dt);
      // Slight Directional Influence (DI) during hitstun like Brawlhalla
      if (inp.left) f.vx -= 140 * dt;
      if (inp.right) f.vx += 140 * dt;
      if (Math.hypot(f.vx, f.vy) > 360 && Math.random() < 0.45) {
        particles.push({
          x: f.x + f.w * 0.5,
          y: f.y + f.h * 0.5,
          vx: (Math.random() - 0.5) * 30,
          vy: (Math.random() - 0.5) * 30,
          r: 4.5,
          timer: 0.24,
          maxTimer: 0.24,
          color: null
        });
      }
    } else {
      // Taunt
      if (inp.tauntPressed && f.onGround && !f.attack) {
        f.emoteTimer = 1.1;
      }

      // Dodge / Dash / Gravity-Cancel
      if (f.dodgeTimer > 0) {
        f.dodgeTimer = Math.max(0, f.dodgeTimer - dt);
        // Gravity Cancel: Spot-Dodge in mid-air + Light or Heavy Attack!
        if (f.spotDodging && !f.onGround && (inp.lightPressed || inp.heavyPressed)) {
          f.dodgeTimer = 0;
          f.spotDodging = false;
          startAttack(f, inp.heavyPressed, inp, true);
        }
        if (f.dodgeTimer <= 0) {
          f.spotDodging = false;
        }
      } else if (inp.dodgePressed && f.dodgeCooldown <= 0 && !f.attack) {
        const dirX = inp.left ? -1 : inp.right ? 1 : 0;
        const dirY = inp.up ? -1 : inp.down ? 1 : 0;
        if (f.onGround) {
          if (dirX !== 0) {
            // Ground Dash!
            f.facing = dirX;
            f.vx = dirX * 505;
            f.dodgeTimer = 0.14;
            f.dodgeCooldown = 0.34;
          } else {
            // Ground Spot-Dodge!
            f.vx *= 0.25;
            f.spotDodging = true;
            f.dodgeTimer = 0.25;
            f.dodgeCooldown = 0.85;
          }
        } else {
          // Aerial Spot-Dodge (can Gravity-Cancel!) or Directional Air-Dodge
          if (dirX === 0 && dirY === 0) {
            f.vx *= 0.15;
            f.vy = 0;
            f.spotDodging = true;
            f.dodgeTimer = 0.26;
            f.dodgeCooldown = 2.4;
          } else {
            const len = Math.hypot(dirX, dirY) || 1;
            f.vx = (dirX / len) * 430;
            f.vy = (dirY / len) * 390;
            f.spotDodging = false;
            f.dodgeTimer = 0.22;
            f.dodgeCooldown = 2.5;
          }
        }
        window.ExoticAudio?.dash?.();
      }

      // Pick Up / Throw Weapon
      if (!f.attack && inp.pickupPressed) {
        tryPickupOrThrow(f, inp, false);
      }

      // Start Light or Heavy Attack (Unarmed Light Attack right over a Sky-Drop also picks it up cleanly!)
      if (!f.attack && (inp.lightPressed || inp.heavyPressed)) {
        let picked = false;
        if (inp.lightPressed && f.heldWeapon === 'weapon_fists' && f.preferredWeapon !== 'weapon_fists') {
          picked = tryPickupOrThrow(f, inp, true);
        }
        if (!picked) {
          startAttack(f, inp.heavyPressed, inp, false);
        }
      }

      // Active Attack progression
      if (f.attack) {
        const atk = f.attack;
        const mv = atk.def;
        if (atk.charging) {
          atk.chargeTime += dt;
          f.vx *= Math.pow(0.05, dt);
          if (!inp.heavyHeld || atk.chargeTime >= 0.65) {
            atk.charging = false;
          }
        } else {
          atk.timer += dt;
          if (!atk.lungeApplied && atk.timer >= mv.startup * 0.6) {
            atk.lungeApplied = true;
            if (mv.lungeVx) f.vx = f.facing * mv.lungeVx;
            if (mv.lungeVy) f.vy = mv.lungeVy * (atk.liftMul || 1);
          }

          if (atk.moveKey === 'groundpound' && atk.timer < mv.startup + mv.active) {
            f.vx *= 0.7;
            if (atk.timer >= mv.startup) f.vy = Math.max(f.vy, 610);
          }

          // Hitbox evaluation during active window
          if (atk.timer >= mv.startup && atk.timer <= mv.startup + mv.active) {
            const hx = f.x + f.w * 0.5 + f.facing * mv.ox;
            const hy = f.y + f.h * 0.5 + mv.oy;
            for (const other of fighters) {
              if (other.slot === f.slot || other.eliminated || atk.hitTargets.has(other.slot)) continue;
              const ocx = other.x + other.w * 0.5;
              const ocy = other.y + other.h * 0.5;
              if (
                Math.abs(ocx - hx) <= mv.rx + other.w * 0.5 &&
                Math.abs(ocy - hy) <= mv.ry + other.h * 0.5
              ) {
                atk.hitTargets.add(other.slot);
                const dirSign =
                  mv.visual === 'burst'
                    ? ocx >= f.x + f.w * 0.5
                      ? 1
                      : -1
                    : f.facing;
                applyHit(f, other, {
                  damage: mv.damage,
                  baseForce: mv.baseForce,
                  varForce: mv.varForce,
                  angleDeg: mv.angleDeg,
                  chargeTime: atk.chargeTime,
                  dirSign
                });
              }
            }
          }

          if (atk.timer >= mv.startup + mv.active + mv.endlag) {
            f.attack = null;
          }
        }
      } else if (f.dodgeTimer <= 0) {
        // Horizontal movement & jumps
        const wDef = window.ExoticBrawlData.getWeaponById(f.heldWeapon);
        const topSpeed = BASE_MOVE_SPEED * (wDef.speedMul || 1);
        let moveDir = 0;
        if (inp.left && !inp.right) moveDir = -1;
        else if (inp.right && !inp.left) moveDir = 1;

        if (moveDir !== 0) {
          f.facing = moveDir;
          const accel = f.onGround ? 2400 : 1450;
          f.vx += moveDir * accel * dt;
          if (Math.abs(f.vx) > topSpeed) {
            f.vx += (moveDir * topSpeed - f.vx) * Math.min(1, dt * 12);
          }
          if (f.onGround) f.walkPhase += dt * 13;
        } else {
          const fric = f.onGround ? 14 : 4.2;
          f.vx -= f.vx * Math.min(1, fric * dt);
        }

        // Drop through soft platform
        if (f.onGround && inp.down) {
          f.dropThroughTimer = 0.22;
          f.onGround = false;
        }

        // Jump / Wall-Jump / Multi-Air-Jump
        if (inp.jumpPressed) {
          if (f.wallDir !== 0 && !f.onGround) {
            // Kick off vertical island cliff!
            f.vx = -f.wallDir * 320;
            f.vy = -JUMP_VEL * 0.96;
            f.facing = -f.wallDir;
            f.wallDir = 0;
            f.jumpsUsed = 1;
            spawnBurstParticles(f.x + f.w * 0.5, f.y + f.h * 0.6, 5, null);
            window.ExoticAudio?.jump?.();
          } else if (f.jumpsUsed < f.maxJumps) {
            f.vy = f.jumpsUsed === 0 ? -JUMP_VEL : -AIR_JUMP_VEL;
            f.onGround = false;
            f.jumpsUsed += 1;
            if (f.jumpsUsed > 1) {
              spawnBurstParticles(f.x + f.w * 0.5, f.y + f.h, 5, null);
            }
            window.ExoticAudio?.jump?.();
          }
        }
      }
    }

    // Gravity & Fast-Fall
    const maxFallNow = inp.down && f.hitstunTimer <= 0 ? FAST_FALL : MAX_FALL;
    if (!f.spotDodging) {
      f.vy = Math.min(maxFallNow, f.vy + GRAVITY * dt);
    }

    // Integrate X & check solid island side walls (Wall-Slide!)
    const prevX = f.x;
    const prevY = f.y;
    f.x += f.vx * dt;
    f.wallDir = 0;

    for (const p of platforms) {
      if (p.type !== 'solid') continue;
      const wallH = Math.max(48, p.h * 0.72);
      if (f.y + f.h > p.y + 5 && f.y < p.y + wallH - 4) {
        if (prevX + f.w <= p.x + 4 && f.x + f.w > p.x) {
          f.x = p.x - f.w;
          if (f.hitstunTimer > 0 && Math.abs(f.vx) > 220) {
            f.vx = -f.vx * 0.65; // Stage bounce on heavy knockback!
          } else {
            f.vx = 0;
            if (!f.onGround && f.vy > 0) {
              f.wallDir = 1;
            }
          }
        } else if (prevX >= p.x + p.w - 4 && f.x < p.x + p.w) {
          f.x = p.x + p.w;
          if (f.hitstunTimer > 0 && Math.abs(f.vx) > 220) {
            f.vx = -f.vx * 0.65;
          } else {
            f.vx = 0;
            if (!f.onGround && f.vy > 0) {
              f.wallDir = -1;
            }
          }
        }
      }
    }

    if (f.wallDir !== 0 && f.hitstunTimer <= 0) {
      f.vy = Math.min(f.vy, WALL_SLIDE_MAX_VY);
      f.jumpsUsed = Math.min(f.jumpsUsed, 1);
      f.recoveryUsed = false;
      f.exhaustedRecoveryUsed = false;
      f.dodgeCooldown = Math.min(f.dodgeCooldown, 0.35);
    }

    // Integrate Y & check landing on solid islands + soft pass-through platforms
    f.y += f.vy * dt;
    f.onGround = false;

    for (const p of platforms) {
      const horizOverlap = f.x + f.w > p.x + 2 && f.x < p.x + p.w - 2;
      if (!horizOverlap) continue;

      if (p.type === 'solid') {
        const wallH = Math.max(48, p.h * 0.72);
        if (f.vy >= 0 && prevY + f.h <= p.y + 10 && f.y + f.h >= p.y) {
          f.y = p.y - f.h;
          if (f.hitstunTimer > 0 && f.vy > 360) {
            f.vy = -f.vy * 0.55;
          } else {
            f.vy = 0;
            f.onGround = true;
            f.jumpsUsed = 0;
            f.recoveryUsed = false;
            f.exhaustedRecoveryUsed = false;
            if (f.dodgeCooldown > 0.6) f.dodgeCooldown = 0.2;
            if (f.attack && f.attack.moveKey === 'groundpound') {
              spawnBurstParticles(f.x + f.w * 0.5, f.y + f.h, 8, null);
              f.attack.timer = f.attack.def.startup + f.attack.def.active;
            }
          }
          f.x += (p.vx || 0) * dt;
        } else if (f.vy < 0 && prevY >= p.y + wallH - 8 && f.y < p.y + wallH) {
          f.y = p.y + wallH;
          f.vy = 20;
        }
      } else if (p.type === 'soft' && f.dropThroughTimer <= 0) {
        if (f.vy >= 0 && prevY + f.h <= p.y + 11 && f.y + f.h >= p.y) {
          f.y = p.y - f.h;
          f.vy = 0;
          f.onGround = true;
          f.jumpsUsed = 0;
          f.recoveryUsed = false;
          f.exhaustedRecoveryUsed = false;
          if (f.dodgeCooldown > 0.6) f.dodgeCooldown = 0.2;
          f.x += (p.vx || 0) * dt;
          f.y += (p.vy || 0) * dt;
          if (f.attack && f.attack.moveKey === 'groundpound') {
            spawnBurstParticles(f.x + f.w * 0.5, f.y + f.h, 8, null);
            f.attack.timer = f.attack.def.startup + f.attack.def.active;
          }
        }
      }
    }

    // Update trail
    if (f.trailSys) {
      f.trailSys.update(dt, f.trailId || 'trail_none', {
        x: f.x,
        y: f.y,
        w: f.w,
        h: f.h,
        vx: f.vx,
        vy: f.vy,
        facing: f.facing,
        gravitySign: 1
      });
    }

    // Check Blast Zones!
    const bz = mapDef.blastZones;
    if (f.x + f.w < bz.left) handleBlastZoneKO(f, 'left');
    else if (f.x > bz.right) handleBlastZoneKO(f, 'right');
    else if (f.y + f.h < bz.top && f.hitstunTimer > 0) handleBlastZoneKO(f, 'top');
    else if (f.y > bz.bottom) handleBlastZoneKO(f, 'bottom');
  }

  function updateWorld(dt) {
    if (countdownTimer > 0) {
      countdownTimer = Math.max(0, countdownTimer - dt);
    }

    if (hitstopTimer > 0) {
      hitstopTimer = Math.max(0, hitstopTimer - dt);
      return;
    }

    matchTime += dt;
    platforms = window.ExoticBrawlData.evaluateMapPlatforms(mapDef, matchTime);

    // Sky-drop weapon spawn cadence
    if (!matchEnded && (config.mode !== 'online' || config.onlineSlot === 0)) {
      nextDropTimer -= dt;
      if (nextDropTimer <= 0) {
        spawnSkyDrop();
        nextDropTimer = 5.8 + Math.random() * 2.2;
      }
    }

    // Update Sky-Drops
    for (let i = skyDrops.length - 1; i >= 0; i--) {
      const d = skyDrops[i];
      if (d.falling) {
        d.y += 280 * dt;
        if (d.y >= d.targetY) {
          d.y = d.targetY;
          d.falling = false;
        }
      } else {
        d.ttl -= dt;
        if (d.ttl <= 0) skyDrops.splice(i, 1);
      }
    }

    // Update Thrown Weapon Projectiles (with Brawlhalla bounce & stage re-pickup!)
    for (let i = thrownWeapons.length - 1; i >= 0; i--) {
      const pw = thrownWeapons[i];
      pw.age = (pw.age || 0) + dt;
      const prevY = pw.y;

      if (!pw.grounded) {
        pw.x += pw.vx * dt;
        pw.y += pw.vy * dt;
        pw.vy += 420 * dt;

        // Check enemy collision while airborne
        for (const f of fighters) {
          if (f.slot === pw.ownerSlot || f.eliminated || f.respawnTimer > 0 || pw.hitSlots.has(f.slot)) {
            continue;
          }
          if (
            pw.x > f.x - 10 &&
            pw.x < f.x + f.w + 10 &&
            pw.y > f.y - 10 &&
            pw.y < f.y + f.h + 10
          ) {
            pw.hitSlots.add(f.slot);
            applyHit(fighters.find((a) => a.slot === pw.ownerSlot) || f, f, {
              damage: 9,
              baseForce: 230,
              varForce: 155,
              angleDeg: 38,
              chargeTime: 0,
              dirSign: pw.vx >= 0 ? 1 : -1
            });
            pw.vx = -pw.vx * 0.26;
            pw.vy = -195;
            pw.ttl = Math.max(pw.ttl, 4.2);
            break;
          }
        }

        // Land on stage platforms for re-pickup
        if (pw.vy > 0) {
          for (const p of platforms) {
            if (pw.x >= p.x && pw.x <= p.x + p.w && prevY <= p.y + 4 && pw.y >= p.y - 6) {
              pw.y = p.y - 6;
              pw.vx = 0;
              pw.vy = 0;
              pw.grounded = true;
              pw.ttl = Math.max(pw.ttl, 4.5);
              break;
            }
          }
        }
      }

      pw.ttl -= dt;
      if (pw.ttl <= 0 || pw.y > mapDef.blastZones.bottom) {
        thrownWeapons.splice(i, 1);
      }
    }

    // Update Fighters (only after 0.6s into initial countdown)
    if (!matchEnded && countdownTimer < 0.7) {
      for (const f of fighters) {
        updateFighter(f, dt);
      }
    }

    // Update Particles, Blast Explosions, Phantom Pads & Screen Shake
    for (let i = particles.length - 1; i >= 0; i--) {
      const pt = particles[i];
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.timer -= dt;
      if (pt.timer <= 0) particles.splice(i, 1);
    }
    for (let i = blastExplosions.length - 1; i >= 0; i--) {
      blastExplosions[i].timer -= dt;
      if (blastExplosions[i].timer <= 0) blastExplosions.splice(i, 1);
    }
    for (let i = phantomPads.length - 1; i >= 0; i--) {
      phantomPads[i].timer -= dt;
      if (phantomPads[i].timer <= 0) phantomPads.splice(i, 1);
    }
    if (shakeTimer > 0) shakeTimer = Math.max(0, shakeTimer - dt);

    // Smooth Dynamic Brawlhalla Camera framing all living fighters + stage core
    let minX = 270;
    let maxX = 690;
    let minY = 170;
    let maxY = 410;
    for (const f of fighters) {
      if (f.eliminated) continue;
      const fx = Math.max(-120, Math.min(1080, f.x + f.w * 0.5));
      const fy = Math.max(-100, Math.min(620, f.y + f.h * 0.5));
      if (fx - 90 < minX) minX = fx - 90;
      if (fx + 90 > maxX) maxX = fx + 90;
      if (fy - 80 < minY) minY = fy - 80;
      if (fy + 80 > maxY) maxY = fy + 80;
    }
    const spanW = Math.max(520, maxX - minX);
    const spanH = Math.max(300, maxY - minY);
    camera.targetZoom = Math.max(0.72, Math.min(1.08, Math.min(960 / spanW, 540 / spanH) * 0.92));
    camera.targetCx = (minX + maxX) * 0.5;
    camera.targetCy = (minY + maxY) * 0.5;
    camera.cx += (camera.targetCx - camera.cx) * Math.min(1, dt * 6);
    camera.cy += (camera.targetCy - camera.cy) * Math.min(1, dt * 6);
    camera.zoom += (camera.targetZoom - camera.zoom) * Math.min(1, dt * 5);

    // Online sync tick
    if (config.mode === 'online' && config.onlineRoomCode) {
      syncOnlineState();
    }
  }

  function serializeFighterNet(f) {
    return {
      x: Math.round(f.x * 10) / 10,
      y: Math.round(f.y * 10) / 10,
      vx: Math.round(f.vx),
      vy: Math.round(f.vy),
      facing: f.facing,
      damage: Math.round(f.damage),
      stocks: f.stocks,
      kos: f.kos,
      eliminated: f.eliminated,
      heldWeapon: f.heldWeapon,
      respawnTimer: f.respawnTimer,
      invulnTimer: f.invulnTimer,
      attackKey: f.attack ? f.attack.moveKey : null
    };
  }

  function applyRemoteFighterSnapshot(remoteSlot, st, worldSt) {
    if (!st) return;
    const rf = fighters.find((f) => f.slot === remoteSlot);
    if (rf) {
      rf.netTargetX = st.x;
      rf.netTargetY = st.y;
      rf.vx = st.vx || 0;
      rf.vy = st.vy || 0;
      rf.facing = st.facing || rf.facing;
      rf.damage = typeof st.damage === 'number' ? st.damage : rf.damage;
      rf.stocks = typeof st.stocks === 'number' ? st.stocks : rf.stocks;
      rf.kos = typeof st.kos === 'number' ? st.kos : rf.kos;
      rf.eliminated = Boolean(st.eliminated);
      rf.heldWeapon = st.heldWeapon || 'weapon_fists';
      rf.respawnTimer = st.respawnTimer || 0;
      if (st.attackKey && (!rf.attack || rf.attack.moveKey !== st.attackKey)) {
        const wDef = window.ExoticBrawlData.getWeaponById(rf.heldWeapon);
        const mv = wDef.moves[st.attackKey];
        if (mv) {
          rf.attack = { moveKey: st.attackKey, def: mv, sig: Boolean(mv.sig), timer: 0, hitTargets: new Set() };
        }
      }
      if (rf.eliminated) checkMatchEnd();
    }
    if (worldSt && config.onlineSlot === 1 && Array.isArray(worldSt.skyDrops)) {
      skyDrops = worldSt.skyDrops;
    }
  }

  function syncOnlineState() {
    const localF = fighters.find((f) => f.slot === config.onlineSlot);
    if (!localF) return;
    const fSnap = serializeFighterNet(localF);
    const wSnap = config.onlineSlot === 0 ? { skyDrops } : null;

    if (brawlChannel) {
      try {
        brawlChannel.postMessage({
          roomCode: config.onlineRoomCode,
          slot: config.onlineSlot,
          fighterState: fSnap,
          worldState: wSnap
        });
      } catch {
        // Ignore broadcast errors
      }
    }

    const now = performance.now();
    if (!cloudSyncInFlight && now - lastCloudSyncAt >= 95) {
      lastCloudSyncAt = now;
      cloudSyncInFlight = true;
      const clientKey = (window.ExoticSupabase?.getClientKey?.() || localStorage.getItem('exotic_runner_client_key_v1')) || '';
      fetch('/api/brawl/rooms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-exotic-client-key': clientKey
        },
        body: JSON.stringify({
          action: 'sync',
          clientKey,
          roomCode: config.onlineRoomCode,
          slot: config.onlineSlot,
          fighterState: fSnap,
          worldState: wSnap,
          winnerSlot: matchEnded && winnerFighter ? winnerFighter.slot : null
        })
      })
        .then((r) => r.json())
        .then((data) => {
          if (data?.ok && data.room) {
            const otherSlot = config.onlineSlot === 0 ? 1 : 0;
            const otherState =
              otherSlot === 0 ? data.room.host_state : data.room.guest_state;
            if (otherState && Object.keys(otherState).length > 0) {
              applyRemoteFighterSnapshot(otherSlot, otherState, data.room.world_state);
            }
          }
        })
        .catch(() => {})
        .finally(() => {
          cloudSyncInFlight = false;
        });
    }
  }

  function renderArenaFrame() {
    if (!canvas || !ctx || !mapDef) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const viewW = 960;
    const viewH = 540;
    if (canvas.width !== Math.round(viewW * dpr) || canvas.height !== Math.round(viewH * dpr)) {
      canvas.width = Math.round(viewW * dpr);
      canvas.height = Math.round(viewH * dpr);
    }

    const pal = window.ExoticTheme.getPalette();
    const R = window.ExoticBrawlRenderer;

    ctx.save();
    ctx.scale(dpr, dpr);

    // 1. Sky backdrop
    R.drawBrawlBackdrop(ctx, mapDef, viewW, viewH, matchTime, pal);

    // 2. Camera transform + screen shake
    const sx = shakeTimer > 0 ? (Math.random() - 0.5) * 2 * shakeMag : 0;
    const sy = shakeTimer > 0 ? (Math.random() - 0.5) * 2 * shakeMag : 0;

    ctx.save();
    ctx.translate(viewW * 0.5 + sx, viewH * 0.5 + sy);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.cx, -camera.cy);

    // 3. Stage floating islands & pass-through decks
    R.drawBrawlStageWorld(ctx, mapDef, platforms, matchTime, pal);

    // 4. Gravity-Cancel phantom stage pads
    for (const pad of phantomPads) {
      ctx.globalAlpha = (pad.timer / pad.maxTimer) * 0.85;
      ctx.fillStyle = pal.colored ? '#38bdf8' : pal.playerPrimary;
      R.fillRoundRect(ctx, pad.x, pad.y, pad.w, 6, 3);
      ctx.globalAlpha = 1;
    }

    // 5. Sky-Drop Weapon Beacons
    for (const drop of skyDrops) {
      R.drawSkyDropBeacon(ctx, drop, pal, matchTime);
    }

    // 6. Thrown Weapons
    for (const pw of thrownWeapons) {
      R.drawThrownWeapon(ctx, pw, pal, matchTime);
    }

    // 7. Particles (knockback smoke & hit bursts)
    for (const pt of particles) {
      ctx.globalAlpha = Math.max(0, pt.timer / pt.maxTimer) * 0.8;
      ctx.fillStyle = pal.colored && pt.color ? pt.color : pal.playerPrimary;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 8. Fighters + Auras + Trails + Held Weapons + Attack Slashes + Overhead Tags
    const is3D = Boolean(pal.is3D && window.Exotic3D);
    for (const f of fighters) {
      if (f.eliminated) continue;
      const fcx = f.x + f.w * 0.5;
      const fcy = f.y + f.h * 0.5;

      if (is3D) {
        // Project dynamic 3D ground contact shadow onto nearest stage platform underneath fighter
        let shadowY = null;
        for (const p of platforms) {
          if (fcx >= p.x && fcx <= p.x + p.w && p.y >= f.y + f.h - 6) {
            if (shadowY === null || p.y < shadowY) shadowY = p.y;
          }
        }
        if (shadowY !== null && shadowY - (f.y + f.h) < 165) {
          const distFrac = Math.max(0.35, 1 - (shadowY - (f.y + f.h)) / 180);
          window.Exotic3D.drawGroundShadow(
            ctx,
            fcx,
            shadowY - 1,
            13 * distFrac,
            3.8 * distFrac,
            0.34 * distFrac,
            pal
          );
        }
      }

      // Valkyrie Respawn Sled
      if (f.respawnTimer > 0) {
        ctx.fillStyle = pal.colored ? '#fbbf24' : pal.playerPrimary;
        R.fillRoundRect(ctx, fcx - 18, f.y + f.h + 2, 36, 5, 2.5);
        R.fillDiamond(ctx, fcx - 20, f.y + f.h - 2, 5, 3);
        R.fillDiamond(ctx, fcx + 20, f.y + f.h - 2, 5, 3);
      }

      if (f.trailSys) {
        f.trailSys.draw(ctx, f.trailId || 'trail_none', pal, f.characterId, f.skinId, matchTime);
      }

      const blinkAlpha =
        f.dodgeTimer > 0
          ? 0.45
          : f.invulnTimer > 0
            ? 0.62 + Math.sin(matchTime * 24) * 0.25
            : 1;

      window.ExoticAuraRenderer?.drawBack(ctx, f.auraId || 'aura_none', fcx, fcy, matchTime, pal);

      window.ExoticCharacterRenderer.draw(ctx, {
        x: f.x,
        y: f.y,
        w: f.w,
        h: f.h,
        vx: f.vx,
        vy: f.vy,
        onGround: f.onGround,
        facing: f.facing,
        walkPhase: f.walkPhase,
        time: matchTime,
        characterId: f.characterId,
        skinId: f.skinId,
        emoteId: f.emoteTimer > 0 ? f.emoteId : null,
        emoteProgress: f.emoteTimer > 0 ? 1 - f.emoteTimer / 1.1 : 0,
        alpha: blinkAlpha,
        palette: pal
      });

      const atkTotal = f.attack
        ? f.attack.def.startup + f.attack.def.active + f.attack.def.endlag
        : 1;
      R.drawWeaponInHand(ctx, f.heldWeapon, {
        cx: fcx,
        cy: fcy,
        facing: f.facing,
        attack: f.attack,
        attackProgress: f.attack ? f.attack.timer / atkTotal : 0,
        walkPhase: f.walkPhase,
        pal,
        time: matchTime
      });

      R.drawAttackEffect(ctx, f, pal, matchTime);
      window.ExoticAuraRenderer?.drawFront(ctx, f.auraId || 'aura_none', fcx, fcy, matchTime, pal);

      // Crisp overhead Brawlhalla pointer chevron (`P1` / `P2` / `CPU`)
      const tagColor = getFighterIndicatorColor(f.slot, pal);
      ctx.fillStyle = tagColor;
      ctx.beginPath();
      ctx.moveTo(fcx, f.y - 8);
      ctx.lineTo(fcx - 5, f.y - 15);
      ctx.lineTo(fcx + 5, f.y - 15);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore(); // End world camera space

    // 9. Off-screen fighter edge indicators (Brawlhalla edge bubbles!)
    for (const f of fighters) {
      if (f.eliminated) continue;
      const sx2 = (f.x + f.w * 0.5 - camera.cx) * camera.zoom + viewW * 0.5;
      const sy2 = (f.y + f.h * 0.5 - camera.cy) * camera.zoom + viewH * 0.5;
      if (sx2 < 16 || sx2 > viewW - 16 || sy2 < 16 || sy2 > viewH - 16) {
        const cx2 = Math.max(26, Math.min(viewW - 26, sx2));
        const cy2 = Math.max(26, Math.min(viewH - 26, sy2));
        ctx.fillStyle = getFighterIndicatorColor(f.slot, pal);
        R.fillRing(ctx, cx2, cy2, 16, 12);
        ctx.font = '700 10px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`P${f.slot + 1}`, cx2, cy2);
      }
    }

    // 10. Blast Zone KO Explosions
    for (const b of blastExplosions) {
      R.drawBlastExplosion(ctx, b, viewW, viewH, pal);
    }

    // 11. Match start "BRAWL!" banner
    if (countdownTimer > 0) {
      ctx.save();
      ctx.fillStyle = pal.playerPrimary;
      ctx.font = '800 44px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const label = countdownTimer > 0.65 ? 'READY' : 'BRAWL!';
      ctx.fillText(label, viewW * 0.5, viewH * 0.34);
      ctx.restore();
    }

    ctx.restore();
  }

  function loop(now) {
    if (!running) return;
    const dt = Math.min(0.04, Math.max(0.001, (now - lastTime) / 1000));
    lastTime = now;

    if (!paused) {
      updateWorld(dt);
      updateHudCards();
    }
    renderArenaFrame();

    keysJustPressed.clear();
    mouseButtonsJustPressed.clear();
    rafId = requestAnimationFrame(loop);
  }

  function startMatch(opts = {}) {
    canvas = document.getElementById('brawl-game-canvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    ensureBroadcastChannel();

    const st = window.ExoticStorage.getState();
    const eq = st.equipped || {};
    const authUser = window.ExoticAuth?.getUsername?.() || st.callsign || 'Player 1';

    config = {
      mode: opts.mode || config.mode || 'cpu_1v1',
      difficulty: opts.difficulty || config.difficulty || 'veteran',
      stocks: Math.max(1, Math.min(5, Number(opts.stocks || config.stocks || 3))),
      mapId: opts.mapId || eq.brawlMap || 'brawl_map_haven',
      onlineRoomCode: opts.onlineRoomCode || null,
      onlineSlot: typeof opts.onlineSlot === 'number' ? opts.onlineSlot : 0,
      onlineOpponent: opts.onlineOpponent || null
    };

    mapDef = window.ExoticBrawlData.getMapById(config.mapId);
    platforms = window.ExoticBrawlData.evaluateMapPlatforms(mapDef, 0);
    fighters = [];
    skyDrops = [];
    thrownWeapons = [];
    particles = [];
    blastExplosions = [];
    phantomPads = [];
    matchTime = 0;
    nextDropTimer = 2.0;
    hitstopTimer = 0;
    shakeTimer = 0;
    matchEnded = false;
    winnerFighter = null;
    countdownTimer = 1.4;
    paused = false;

    document.getElementById('brawl-pause-modal')?.classList.remove('is-open');
    document.getElementById('brawl-result-modal')?.classList.remove('is-open');

    const stageLabelEl = document.getElementById('brawl-hud-stage-label');
    if (stageLabelEl) {
      stageLabelEl.textContent = `${mapDef.name} · ${
        config.mode === 'local_2p'
          ? 'Local 2P'
          : config.mode === 'cpu_ffa'
            ? '4-Fighter Brawl'
            : config.mode === 'online'
              ? `Room ${config.onlineRoomCode}`
              : `1v1 · ${config.difficulty.toUpperCase()}`
      }`;
    }

    const sp0 = mapDef.spawns[0];
    const sp1 = mapDef.spawns[1];

    if (config.mode === 'online') {
      const isHost = config.onlineSlot === 0;
      const opp = config.onlineOpponent || {};
      const hostInfo = isHost
        ? {
            label: `@${authUser}`,
            characterId: eq.character,
            skinId: eq.skin,
            auraId: eq.aura,
            trailId: eq.trail,
            emoteId: eq.emote,
            preferredWeapon: eq.brawlWeapon || 'weapon_fists',
            isRemote: false
          }
        : {
            label: `@${opp.username || 'Host'}`,
            characterId: opp.loadout?.character || 'char_classic',
            skinId: opp.loadout?.skin || 'skin_solid',
            auraId: opp.loadout?.aura || 'aura_none',
            trailId: opp.loadout?.trail || 'trail_none',
            emoteId: opp.loadout?.emote || 'emote_salute',
            preferredWeapon: opp.loadout?.brawlWeapon || 'weapon_fists',
            isRemote: true
          };
      const guestInfo = !isHost
        ? {
            label: `@${authUser}`,
            characterId: eq.character,
            skinId: eq.skin,
            auraId: eq.aura,
            trailId: eq.trail,
            emoteId: eq.emote,
            preferredWeapon: eq.brawlWeapon || 'weapon_fists',
            isRemote: false
          }
        : {
            label: `@${opp.username || 'Challenger'}`,
            characterId: opp.loadout?.character || 'char_mickey',
            skinId: opp.loadout?.skin || 'skin_solid',
            auraId: opp.loadout?.aura || 'aura_none',
            trailId: opp.loadout?.trail || 'trail_none',
            emoteId: opp.loadout?.emote || 'emote_salute',
            preferredWeapon: opp.loadout?.brawlWeapon || 'weapon_fists',
            isRemote: true
          };

      fighters.push(
        createFighter({
          slot: 0,
          ...hostInfo,
          isHuman: !hostInfo.isRemote,
          x: sp0.x - 11,
          y: sp0.y - 26,
          facing: 1
        }),
        createFighter({
          slot: 1,
          ...guestInfo,
          isHuman: !guestInfo.isRemote,
          x: sp1.x - 11,
          y: sp1.y - 26,
          facing: -1
        })
      );
    } else if (config.mode === 'local_2p') {
      const p2Char = eq.character === 'char_scream' ? 'char_ronin' : 'char_scream';
      fighters.push(
        createFighter({
          slot: 0,
          label: `P1 · ${authUser}`,
          isHuman: true,
          isLocalP2: false,
          characterId: eq.character || 'char_classic',
          skinId: eq.skin || 'skin_solid',
          auraId: eq.aura || 'aura_none',
          trailId: eq.trail || 'trail_none',
          emoteId: eq.emote || 'emote_salute',
          preferredWeapon: eq.brawlWeapon || 'weapon_fists',
          x: sp0.x - 11,
          y: sp0.y - 26,
          facing: 1
        }),
        createFighter({
          slot: 1,
          label: 'P2 · Challenger',
          isHuman: true,
          isLocalP2: true,
          characterId: p2Char,
          skinId: 'skin_solid',
          auraId: 'aura_none',
          trailId: 'trail_none',
          emoteId: 'emote_salute',
          preferredWeapon: eq.brawlWeapon || 'weapon_fists',
          x: sp1.x - 11,
          y: sp1.y - 26,
          facing: -1
        })
      );
    } else {
      // 1v1 vs CPU or 4-Fighter Free-For-All vs CPUs
      fighters.push(
        createFighter({
          slot: 0,
          label: `@${authUser}`,
          isHuman: true,
          characterId: eq.character || 'char_classic',
          skinId: eq.skin || 'skin_solid',
          auraId: eq.aura || 'aura_none',
          trailId: eq.trail || 'trail_none',
          emoteId: eq.emote || 'emote_salute',
          preferredWeapon: eq.brawlWeapon || 'weapon_fists',
          x: sp0.x - 11,
          y: sp0.y - 26,
          facing: 1
        })
      );

      const cpuCount = config.mode === 'cpu_ffa' ? 3 : 1;
      const pool = window.ExoticBrawlData.CPU_ROSTER.filter((c) => c.character !== eq.character);
      for (let i = 0; i < cpuCount; i++) {
        const pick = pool[i % pool.length] || window.ExoticBrawlData.CPU_ROSTER[0];
        const sp = mapDef.spawns[(i + 1) % mapDef.spawns.length];
        fighters.push(
          createFighter({
            slot: i + 1,
            label: pick.label,
            isCpu: true,
            characterId: pick.character,
            skinId: pick.skin,
            preferredWeapon: config.difficulty === 'rookie' ? 'weapon_fists' : pick.weapon,
            x: sp.x - 11,
            y: sp.y - 26,
            facing: sp.facing || -1
          })
        );
      }
    }

    camera.cx = 480;
    camera.cy = 270;
    camera.zoom = 1;
    updateHudCards();

    running = true;
    lastTime = performance.now();
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
  }

  function stop() {
    running = false;
    paused = false;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    keysDown.clear();
    keysJustPressed.clear();
    mouseButtonsDown.clear();
    mouseButtonsJustPressed.clear();
    document.getElementById('brawl-pause-modal')?.classList.remove('is-open');
    document.getElementById('brawl-result-modal')?.classList.remove('is-open');
  }

  function setPaused(val) {
    if (!running || matchEnded) return;
    paused = Boolean(val);
    const modal = document.getElementById('brawl-pause-modal');
    if (modal) modal.classList.toggle('is-open', paused);
  }

  function bindGlobalInputs() {
    window.addEventListener('keydown', (e) => {
      if (!running) return;
      if (e.code === 'Escape') {
        e.preventDefault();
        setPaused(!paused);
        return;
      }
      if (e.code === 'KeyF' && e.shiftKey) {
        toggleBrawlFullscreen();
        return;
      }
      if (
        [
          'Space',
          'ArrowUp',
          'ArrowDown',
          'ArrowLeft',
          'ArrowRight'
        ].includes(e.code)
      ) {
        e.preventDefault();
      }
      if (!keysDown.has(e.code)) {
        keysJustPressed.add(e.code);
      }
      keysDown.add(e.code);
    });

    window.addEventListener('keyup', (e) => {
      keysDown.delete(e.code);
    });

    window.addEventListener('blur', () => {
      keysDown.clear();
      mouseButtonsDown.clear();
    });
  }

  function toggleBrawlFullscreen() {
    const frame = document.getElementById('brawl-stage-frame');
    if (!frame) return;
    if (!document.fullscreenElement) {
      frame.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }

  function initDomControls() {
    bindGlobalInputs();

    const cv = document.getElementById('brawl-game-canvas');
    if (cv) {
      cv.addEventListener('mousedown', (e) => {
        if (!running || paused) return;
        mouseButtonsJustPressed.add(e.button);
        mouseButtonsDown.add(e.button);
      });
      window.addEventListener('mouseup', (e) => {
        mouseButtonsDown.delete(e.button);
      });
      cv.addEventListener('contextmenu', (e) => {
        if (running) e.preventDefault();
      });
    }

    document.getElementById('brawl-pause-btn')?.addEventListener('click', () => {
      window.ExoticAudio?.click?.();
      setPaused(true);
    });
    document.getElementById('brawl-resume-btn')?.addEventListener('click', () => {
      window.ExoticAudio?.click?.();
      setPaused(false);
    });
    document.getElementById('brawl-restart-btn')?.addEventListener('click', () => {
      window.ExoticAudio?.click?.();
      startMatch(config);
    });
    document.getElementById('brawl-hud-retry-btn')?.addEventListener('click', () => {
      window.ExoticAudio?.click?.();
      startMatch(config);
    });
    document.getElementById('brawl-hud-emote-btn')?.addEventListener('click', () => {
      if (fighters[0] && fighters[0].onGround) fighters[0].emoteTimer = 1.1;
    });
    document.getElementById('brawl-fullscreen-btn')?.addEventListener('click', () => {
      window.ExoticAudio?.click?.();
      toggleBrawlFullscreen();
    });
    document.getElementById('brawl-pause-lobby-btn')?.addEventListener('click', () => {
      window.ExoticAudio?.click?.();
      stop();
      window.ExoticRouter.navigate('brawl');
    });
    document.getElementById('brawl-res-rematch-btn')?.addEventListener('click', () => {
      window.ExoticAudio?.click?.();
      startMatch(config);
    });
    document.getElementById('brawl-res-lobby-btn')?.addEventListener('click', () => {
      window.ExoticAudio?.click?.();
      stop();
      window.ExoticRouter.navigate('brawl');
    });
  }

  window.ExoticBrawlEngine = {
    init: initDomControls,
    startMatch,
    stop,
    setPaused,
    getState() {
      return {
        running,
        paused,
        matchEnded,
        matchTime,
        config,
        fighters,
        skyDrops,
        thrownWeapons
      };
    }
  };
})();
