(function () {
  const VIEW_W = 960;
  const VIEW_H = 540;

  let canvas = null;
  let ctx = null;
  let running = false;
  let paused = false;
  let currentLevelBlueprint = null;
  let runtime = null;
  let player = null;
  let trailSystem = null;

  let runDeaths = 0;
  let runTimeMs = 0;
  let stageCoins = 0;
  let respawnTimer = 0;
  let cameraX = 0;
  let shakeMag = 0;
  let quipIdx = 0;
  let attemptTimeMs = 0;
  let replaySampleAccumMs = 0;
  let attemptFrames = [];
  let completedRunFrames = [];

  const particles = [];
  const rings = [];

  const keys = {
    left: false,
    right: false
  };
  const input = {
    moveDir: 0,
    jumpPressed: false,
    jumpReleased: false,
    dashPressed: false
  };

  let hudCallbacks = {
    onHudUpdate: null,
    onLevelWin: null,
    onToast: null,
    onRageQuip: null,
    onPauseToggle: null,
    onFullscreenToggle: null
  };

  function getActiveUpgradesMap() {
    const s = window.ExoticStorage;
    return {
      coyote: s.isUpgradeActive('upg_coyote'),
      magnet: s.isUpgradeActive('upg_magnet'),
      doubleJump: s.isUpgradeActive('upg_double_jump'),
      dash: s.isUpgradeActive('upg_dash'),
      radar: s.isUpgradeActive('upg_radar'),
      shield: s.isUpgradeActive('upg_shield')
    };
  }

  function spawnBurst(x, y, count = 16, speed = 260) {
    for (let i = 0; i < count; i++) {
      const a = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
      const sp = speed * (0.4 + Math.random() * 0.75);
      particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 40,
        size: 3 + Math.random() * 5,
        age: 0,
        life: 0.35 + Math.random() * 0.28,
        rot: Math.random() * Math.PI
      });
    }
  }

  function spawnRing(x, y, maxR = 44, life = 0.32) {
    rings.push({ x, y, maxR, age: 0, life });
  }

  function addShake(amount) {
    const settings = window.ExoticStorage.getState().settings;
    if (!settings.screenShake) return;
    shakeMag = Math.min(14, shakeMag + amount);
  }

  function resetAttempt(incrementDeath = false) {
    if (!currentLevelBlueprint) return;
    if (incrementDeath) {
      runDeaths += 1;
      window.ExoticStorage.incrementTelemetry('totalDeaths', 1, {
        levelId: currentLevelBlueprint.id
      });
      checkAchievementsAndNotify();
    }
    runtime = window.ExoticTraps.cloneRuntimeLevel(currentLevelBlueprint);
    const upgs = getActiveUpgradesMap();
    player = window.ExoticPhysics.createPlayer(runtime.spawn, upgs);
    if (!trailSystem) trailSystem = new window.ExoticTrailSystem();
    trailSystem.reset();
    respawnTimer = 0;
    attemptTimeMs = 0;
    replaySampleAccumMs = 0;
    attemptFrames = [[Math.round(player.x), Math.round(player.y), 1, 1]];
    syncHud();
  }

  function checkAchievementsAndNotify() {
    const unlocked = window.ExoticAchievements.evaluateAll();
    if (unlocked.length > 0 && hudCallbacks.onToast) {
      for (const ach of unlocked) {
        hudCallbacks.onToast(
          `Achievement: ${ach.title} (+${ach.rewardCoins} Coins, +${ach.rewardSP} SP)`
        );
      }
    }
  }

  function syncHud() {
    if (hudCallbacks.onHudUpdate && runtime) {
      hudCallbacks.onHudUpdate({
        levelId: runtime.id,
        levelCode: runtime.code,
        levelTitle: runtime.title,
        deaths: runDeaths,
        timeMs: runTimeMs,
        stageCoins
      });
    }
  }

  function triggerEmote() {
    if (!running || paused || !player || player.dead || player.won) return;
    const eq = window.ExoticStorage.getState().equipped;
    player.emoteId = eq.emote || 'emote_salute';
    player.emoteTimer = 1.05;
    player.emoteDuration = 1.05;
    window.ExoticAudio.emote();
    window.ExoticStorage.incrementTelemetry('emotesUsedInStage', 1, {
      levelId: runtime ? runtime.id : 1
    });
    if (window.ExoticRealtime && runtime) {
      window.ExoticRealtime.broadcastStageFrame({
        levelId: runtime.id,
        x: Math.round(player.x),
        y: Math.round(player.y),
        vx: Math.round(player.vx),
        vy: Math.round(player.vy),
        facing: player.facing || 1,
        gravitySign: player.gravitySign || 1,
        emoteId: player.emoteId,
        deaths: runDeaths,
        timeMs: Math.round(runTimeMs)
      });
    }
    checkAchievementsAndNotify();
  }

  const worldCallbacks = {
    onTrapTriggered(kind) {
      window.ExoticAudio.trap();
      addShake(kind === 'double_slam' || kind === 'wall' ? 6 : 3.5);
      window.ExoticStorage.incrementTelemetry('trapsTriggered', 1);
      if (hudCallbacks.onRageQuip) {
        if (kind === 'double_slam') hudCallbacks.onRageQuip('Thought it was rising? DOUBLE SLAM.');
        else if (kind === 'spike_jump') hudCallbacks.onRageQuip('Surprise — the spike jumps too.');
        else if (kind === 'shy_coin') hudCallbacks.onRageQuip('Come get your free coin...');
        else if (kind === 'wall') hudCallbacks.onRageQuip('RUN! Spike Wall incoming!');
      }
      checkAchievementsAndNotify();
    },
    onSlam() {
      window.ExoticAudio.slam();
      addShake(8.5);
    },
    onShyDoor() {
      window.ExoticAudio.trap();
      addShake(4.5);
      window.ExoticStorage.incrementTelemetry('shyDoorsTriggered', 1);
      if (hudCallbacks.onRageQuip) {
        hudCallbacks.onRageQuip('Nope! Exit Door relocated.');
      }
      checkAchievementsAndNotify();
    }
  };

  const physicsCallbacks = {
    onJump(isAirJump) {
      if (isAirJump) {
        window.ExoticAudio.doubleJump();
        spawnRing(player.x + player.w * 0.5, player.y + player.h, 28, 0.26);
      } else {
        window.ExoticAudio.jump();
        spawnBurst(player.x + player.w * 0.5, player.y + player.h, 5, 90);
      }
    },
    onDash() {
      window.ExoticAudio.dash();
      addShake(2.5);
      spawnRing(player.x + player.w * 0.5, player.y + player.h * 0.5, 30, 0.22);
    },
    onLand() {
      window.ExoticAudio.land();
    },
    onSpring() {
      window.ExoticAudio.spring();
      spawnRing(player.x + player.w * 0.5, player.y + player.h, 32, 0.28);
    },
    onGravityFlip(sign) {
      window.ExoticAudio.gravity();
      addShake(3);
      spawnRing(player.x + player.w * 0.5, player.y + player.h * 0.5, 42, 0.3);
      window.ExoticStorage.incrementTelemetry('gravityFlipsSurvived', 1);
      if (hudCallbacks.onRageQuip) {
        hudCallbacks.onRageQuip(sign < 0 ? 'Polarity Inverted!' : 'Gravity Restored.');
      }
    },
    onTrapTriggered(kind) {
      worldCallbacks.onTrapTriggered(kind);
      if (kind === 'bonk' && hudCallbacks.onRageQuip) {
        hudCallbacks.onRageQuip('Hidden Block Discovered.');
      }
    },
    onCoin(c) {
      window.ExoticAudio.coin();
      const earned = window.ExoticStorage.collectStageCoin(runtime.id, c.id);
      if (earned) {
        stageCoins += 1;
      }
      spawnRing(c.x, c.y, 22, 0.24);
      checkAchievementsAndNotify();
      syncHud();
    },
    onSkillOrb(orb) {
      window.ExoticAudio.skillOrb();
      spawnBurst(orb.x, orb.y, 18, 220);
      spawnRing(orb.x, orb.y, 44, 0.38);
      const firstTime = window.ExoticStorage.markOrbCollected(runtime.id);
      if (firstTime && hudCallbacks.onToast) {
        hudCallbacks.onToast('Hidden Skill Orb Claimed (+1 Skill Point)');
      }
      syncHud();
    },
    onShieldSave() {
      window.ExoticAudio.shieldBreak();
      addShake(6);
      spawnRing(player.x + player.w * 0.5, player.y + player.h * 0.5, 52, 0.36);
      if (hudCallbacks.onRageQuip) {
        hudCallbacks.onRageQuip('Second Wind Parry!');
      }
    },
    onDecoyDoor(d) {
      window.ExoticAudio.trap();
      addShake(7);
      spawnBurst(d.x + d.w * 0.5, d.y + d.h * 0.5, 22, 260);
      window.ExoticStorage.incrementTelemetry('shyDoorsTriggered', 1);
      if (hudCallbacks.onRageQuip) {
        hudCallbacks.onRageQuip('Decoy Exit! Look up for the real door.');
      }
      checkAchievementsAndNotify();
    },
    onDeath(customQuip) {
      window.ExoticAudio.death();
      addShake(11);
      spawnBurst(player.x + player.w * 0.5, player.y + player.h * 0.5, 26, 330);
      spawnRing(player.x + player.w * 0.5, player.y + player.h * 0.5, 52, 0.32);

      runDeaths += 1;
      respawnTimer = 0.28;
      window.ExoticStorage.incrementTelemetry('totalDeaths', 1, { levelId: runtime.id });

      // Heartbreak check: did the player die heartbreakingly close to the real Exit Door?
      let nearDoorMsg = null;
      const realDoor = runtime.doors.find((d) => !d.fake && !d.vanished);
      if (realDoor) {
        const dist = Math.hypot(player.x - realDoor.x, player.y - realDoor.y);
        if (dist < 115) {
          const pct = Math.min(99, Math.max(94, Math.round(100 - dist * 0.05)));
          nearDoorMsg = `${pct}% — SO CLOSE TO THE DOOR.`;
        }
      }

      const quip =
        customQuip ||
        nearDoorMsg ||
        runtime.quips[quipIdx % runtime.quips.length] ||
        'Betrayed by geometry.';
      quipIdx += 1;

      if (hudCallbacks.onRageQuip) {
        hudCallbacks.onRageQuip(quip);
      }
      checkAchievementsAndNotify();
      syncHud();
    },
    onWin(d) {
      window.ExoticAudio.win();
      spawnBurst(d.x + d.w * 0.5, d.y + d.h * 0.5, 28, 280);
      spawnRing(d.x + d.w * 0.5, d.y + d.h * 0.5, 64, 0.45);

      const runStats = {
        deaths: runDeaths,
        timeMs: Math.max(500, Math.round(runTimeMs)),
        stageCoins
      };

      const rewardSummary = window.ExoticStorage.recordLevelClear(runtime, {
        deaths: runDeaths,
        timeMs: runStats.timeMs,
        stageCoins
      });

      attemptFrames.push([
        Math.round(player.x),
        Math.round(player.y),
        player.facing || 1,
        player.gravitySign || 1
      ]);
      completedRunFrames = attemptFrames.slice(0, 750);

      checkAchievementsAndNotify();
      syncHud();

      if (hudCallbacks.onLevelWin) {
        setTimeout(() => {
          hudCallbacks.onLevelWin({
            level: runtime,
            deaths: runDeaths,
            timeMs: runStats.timeMs,
            coinsCollected: stageCoins,
            rewardSummary,
            sampleIntervalMs: 80,
            frames: completedRunFrames
          });
        }, 320);
      }
    }
  };

  function update(dt, time) {
    if (!runtime || !player) return;

    input.moveDir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);

    if (!player.dead && !player.won) {
      const dtMs = dt * 1000;
      runTimeMs += dtMs;
      attemptTimeMs += dtMs;
      replaySampleAccumMs += dtMs;
      const upgs = getActiveUpgradesMap();

      // Sub-step physics into max 1/120s slices so fast drops/dashes never tunnel!
      const subSteps = dt > 0.02 ? 2 : 1;
      const subDt = dt / subSteps;
      for (let i = 0; i < subSteps; i++) {
        window.ExoticTraps.updateWorld(runtime, player, subDt, time, worldCallbacks);
        window.ExoticPhysics.stepPlayer(player, input, runtime, upgs, subDt, physicsCallbacks);
        if (player.dead || player.won) break;
      }

      if (replaySampleAccumMs >= 80 && attemptFrames.length < 750) {
        replaySampleAccumMs = 0;
        attemptFrames.push([
          Math.round(player.x),
          Math.round(player.y),
          player.facing || 1,
          player.gravitySign || 1
        ]);
      }

      if (window.ExoticRealtime) {
        window.ExoticRealtime.broadcastStageFrame({
          levelId: runtime.id,
          x: Math.round(player.x),
          y: Math.round(player.y),
          vx: Math.round(player.vx),
          vy: Math.round(player.vy),
          facing: player.facing || 1,
          gravitySign: player.gravitySign || 1,
          emoteId: player.emoteTimer > 0 ? player.emoteId : null,
          deaths: runDeaths,
          timeMs: Math.round(runTimeMs)
        });
      }

      const eq = window.ExoticStorage.getState().equipped;
      trailSystem.update(dt, eq.trail, player);
    } else if (player.dead) {
      respawnTimer -= dt;
      if (respawnTimer <= 0) {
        resetAttempt(false);
      }
    }

    // Smooth horizontal camera follow
    const targetCamX = Math.max(
      0,
      Math.min(runtime.width - VIEW_W, player.x + player.w * 0.5 - VIEW_W * 0.42)
    );
    cameraX += (targetCamX - cameraX) * Math.min(1, dt * 10);

    if (shakeMag > 0.1) {
      shakeMag *= Math.pow(0.04, dt);
    } else {
      shakeMag = 0;
    }

    // Update particles & shockwave rings
    for (let i = particles.length - 1; i >= 0; i--) {
      const pt = particles[i];
      pt.age += dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vy += 680 * dt;
      if (pt.age >= pt.life) particles.splice(i, 1);
    }

    for (let i = rings.length - 1; i >= 0; i--) {
      const rg = rings[i];
      rg.age += dt;
      if (rg.age >= rg.life) rings.splice(i, 1);
    }

    syncHud();
  }

  function render(time) {
    if (!canvas || !ctx || !runtime || !player) return;

    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    const cssW = canvas.clientWidth || VIEW_W;
    const scaleFactor = Math.max(dpr, Math.min(4, (cssW * dpr) / VIEW_W));
    const targetW = Math.round(VIEW_W * scaleFactor);
    const targetH = Math.round(VIEW_H * scaleFactor);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    const pal = window.ExoticTheme.getPalette();
    const state = window.ExoticStorage.getState();
    const eq = state.equipped;
    const showRadar = window.ExoticStorage.isUpgradeActive('upg_radar');
    const { fillRing } = window.ExoticCharacterRenderer;

    ctx.save();
    ctx.scale(canvas.width / VIEW_W, canvas.height / VIEW_H);

    // Stage background
    ctx.fillStyle = pal.stageBg;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    // Screen shake offset
    const sx = shakeMag > 0 ? (Math.random() - 0.5) * shakeMag * 2 : 0;
    const sy = shakeMag > 0 ? (Math.random() - 0.5) * shakeMag * 2 : 0;

    // Subtle parallax background columns
    ctx.fillStyle = pal.bgPillar;
    for (let bx = 60; bx < runtime.width + 200; bx += 190) {
      const screenX = bx - cameraX * 0.45;
      if (screenX > -80 && screenX < VIEW_W + 80) {
        ctx.fillRect(screenX, 48 + (bx % 70), 38, VIEW_H);
      }
    }

    ctx.translate(-cameraX + sx, sy);

    // Dishonest Background Wall Signs
    if (runtime.signs) {
      for (const sg of runtime.signs) {
        window.ExoticWorldDraw.drawSign(ctx, sg, pal);
      }
    }

    // Gravity zones
    for (const gz of runtime.gravityZones) {
      window.ExoticWorldDraw.drawGravityZone(ctx, gz, pal, time);
    }

    // Platforms
    for (const p of runtime.platforms) {
      window.ExoticWorldDraw.drawPlatform(ctx, p, pal, showRadar, time);
    }

    // Fake Checkpoint Betrayal Flags
    if (runtime.fakeCheckpoints) {
      for (const cp of runtime.fakeCheckpoints) {
        window.ExoticWorldDraw.drawFakeCheckpoint(ctx, cp, pal, time);
      }
    }

    // Springs
    for (const spr of runtime.springs) {
      window.ExoticWorldDraw.drawSpring(ctx, spr, pal);
    }

    // Spikes
    for (const sp of runtime.spikes) {
      window.ExoticWorldDraw.drawSpikes(ctx, sp, pal, showRadar, time);
    }

    // Crushers
    for (const cr of runtime.crushers) {
      window.ExoticWorldDraw.drawCrusher(ctx, cr, pal);
    }

    // Marching Chaser Spike Wall
    if (runtime.chaserWall) {
      window.ExoticWorldDraw.drawChaserWall(ctx, runtime.chaserWall, pal);
    }

    // Saws
    for (const saw of runtime.saws) {
      window.ExoticWorldDraw.drawSaw(ctx, saw, pal, time);
    }

    // Coins & Skill Orb
    for (const c of runtime.coins) {
      window.ExoticWorldDraw.drawCoin(ctx, c, pal, time);
    }
    window.ExoticWorldDraw.drawSkillOrb(
      ctx,
      runtime.skillOrb,
      window.ExoticStorage.hasCollectedOrb(runtime.id),
      pal,
      time
    );

    // Exit Doors
    for (const d of runtime.doors) {
      window.ExoticWorldDraw.drawDoor(ctx, d, pal, time);
    }

    // Live Supabase Stage World Record Replay Ghost & Co-Runner Multiplayer Ghosts (Pure Solid Fill)
    if (state.settings.liveGhosts !== false && window.ExoticRealtime) {
      const drawGhostTag = (gx, gy, labelText) => {
        ctx.save();
        ctx.font = '700 9px ui-monospace, SFMono-Regular, Menlo, monospace';
        const tw = Math.min(132, Math.max(38, ctx.measureText(labelText).width + 12));
        const px = gx - tw * 0.5;
        const py = gy - 26;
        const r = 8;
        ctx.globalAlpha = 0.72;
        ctx.fillStyle = pal.platformFill;
        ctx.beginPath();
        ctx.moveTo(px + r, py);
        ctx.arcTo(px + tw, py, px + tw, py + 16, r);
        ctx.arcTo(px + tw, py + 16, px, py + 16, r);
        ctx.arcTo(px, py + 16, px, py, r);
        ctx.arcTo(px, py, px + tw, py, r);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 0.92;
        ctx.fillStyle = pal.colored ? '#ffffff' : pal.stageBg;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(labelText, gx, py + 8.5);
        ctx.restore();
      };

      // 1. Stage World Record Ghost
      const replay = window.ExoticRealtime.getStageReplay(runtime.id);
      if (replay && Array.isArray(replay.frames) && replay.frames.length > 1) {
        const interval = replay.sampleIntervalMs || 80;
        const rawIdx = attemptTimeMs / interval;
        const i0 = Math.min(replay.frames.length - 1, Math.max(0, Math.floor(rawIdx)));
        const i1 = Math.min(replay.frames.length - 1, i0 + 1);
        const frac = Math.min(1, Math.max(0, rawIdx - i0));
        const f0 = replay.frames[i0];
        const f1 = replay.frames[i1];
        const gx = f0[0] + (f1[0] - f0[0]) * frac;
        const gy = f0[1] + (f1[1] - f0[1]) * frac;

        window.ExoticCharacterRenderer.draw(ctx, {
          x: gx,
          y: gy,
          w: player.w,
          h: player.h,
          vx: ((f1[0] - f0[0]) / Math.max(16, interval)) * 1000,
          vy: ((f1[1] - f0[1]) / Math.max(16, interval)) * 1000,
          facing: f0[2] || 1,
          gravitySign: f0[3] || 1,
          onGround: Math.abs(f1[1] - f0[1]) < 1,
          characterId: replay.characterId || 'char_classic',
          skinId: replay.skinId || 'skin_solid',
          palette: pal,
          time,
          alpha: 0.24
        });
        drawGhostTag(gx + player.w * 0.5, gy, `WR · ${(replay.callsign || 'GHOST').slice(0, 12)}`);
      }

      // 2. Live Co-Runner Multiplayer Ghosts
      const livePeers = window.ExoticRealtime.getLivePeersForLevel(runtime.id);
      for (const peer of livePeers) {
        peer.renderX = peer.renderX + (peer.x - peer.renderX) * 0.28;
        peer.renderY = peer.renderY + (peer.y - peer.renderY) * 0.28;
        window.ExoticCharacterRenderer.draw(ctx, {
          x: peer.renderX,
          y: peer.renderY,
          w: player.w,
          h: player.h,
          vx: peer.vx || 0,
          vy: peer.vy || 0,
          facing: peer.facing || 1,
          gravitySign: peer.gravitySign || 1,
          onGround: Math.abs(peer.vy || 0) < 10,
          characterId: peer.characterId || 'char_classic',
          skinId: peer.skinId || 'skin_solid',
          emoteId: peer.emoteId || null,
          emoteProgress: peer.emoteId ? (time * 1.2) % 1 : 0,
          palette: pal,
          time,
          alpha: 0.42
        });
        drawGhostTag(
          peer.renderX + player.w * 0.5,
          peer.renderY,
          `${(peer.callsign || 'RUNNER').slice(0, 12)}`
        );
      }
    }

    // Trail wake
    trailSystem.draw(ctx, eq.trail, pal, eq.character, eq.skin, time);

    // Player + Roblox-style Aura + Second Wind Shield Ring
    if (!player.dead) {
      const cx = player.x + player.w * 0.5;
      const cy = player.y + player.h * 0.5;

      window.ExoticAuraRenderer.drawBack(ctx, eq.aura, cx, cy, time, pal);

      if (player.shieldAvailable) {
        ctx.save();
        ctx.globalAlpha = 0.28 + Math.sin(time * 5) * 0.08;
        ctx.fillStyle = pal.auraBright;
        fillRing(ctx, cx, cy, 19.5, 17.5);
        ctx.restore();
      }

      const emoteProg =
        player.emoteId && player.emoteTimer > 0
          ? 1 - player.emoteTimer / player.emoteDuration
          : 0;

      window.ExoticCharacterRenderer.draw(ctx, {
        ...player,
        characterId: eq.character,
        skinId: eq.skin,
        emoteId: player.emoteId,
        emoteProgress: emoteProg,
        palette: pal,
        time,
        alpha: player.invulnTimer > 0 ? (Math.floor(time * 24) % 2 === 0 ? 0.45 : 1) : 1
      });

      window.ExoticAuraRenderer.drawFront(ctx, eq.aura, cx, cy, time, pal);
    }

    // Shockwave rings
    for (const rg of rings) {
      const t = rg.age / rg.life;
      const r = 4 + t * rg.maxR;
      ctx.save();
      ctx.globalAlpha = (1 - t) * 0.85;
      ctx.fillStyle = pal.auraBright;
      fillRing(ctx, rg.x, rg.y, r, Math.max(0.5, r - 2.6));
      ctx.restore();
    }

    // Shatter & dust particles
    for (let idx = 0; idx < particles.length; idx++) {
      const pt = particles[idx];
      const lifeLeft = 1 - pt.age / pt.life;
      ctx.save();
      ctx.globalAlpha = lifeLeft;
      ctx.fillStyle = pal.colored
        ? idx % 3 === 0
          ? pal.hazard
          : idx % 3 === 1
            ? pal.coinOuter
            : pal.auraBright
        : pal.playerPrimary;
      ctx.translate(pt.x, pt.y);
      ctx.rotate(pt.rot + pt.age * 8);
      const sz = pt.size * lifeLeft;
      ctx.fillRect(-sz * 0.5, -sz * 0.5, sz, sz);
      ctx.restore();
    }

    ctx.restore();
  }

  let lastFrame = performance.now();
  function frame(now) {
    const dt = Math.min(0.04, (now - lastFrame) / 1000);
    lastFrame = now;
    const time = now / 1000;

    if (running) {
      if (!paused) {
        update(dt, time);
      }
      render(time);
    }

    requestAnimationFrame(frame);
  }

  function bindInputs() {
    window.addEventListener('keydown', (e) => {
      if (!running) return;
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;

      const code = e.code;
      if (code === 'ArrowLeft' || code === 'KeyA') {
        keys.left = true;
      } else if (code === 'ArrowRight' || code === 'KeyD') {
        keys.right = true;
      } else if (code === 'Space' || code === 'ArrowUp' || code === 'KeyW') {
        e.preventDefault();
        if (!e.repeat && !paused) input.jumpPressed = true;
      } else if (code === 'ShiftLeft' || code === 'ShiftRight' || code === 'KeyK') {
        if (!e.repeat && !paused) input.dashPressed = true;
      } else if (code === 'KeyE') {
        if (!e.repeat && !paused) triggerEmote();
      } else if (code === 'KeyR') {
        if (!e.repeat && !paused && player && !player.won) {
          window.ExoticAudio.click();
          resetAttempt(!player.dead);
        }
      } else if (code === 'KeyF') {
        if (!e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) {
          if (hudCallbacks.onFullscreenToggle) hudCallbacks.onFullscreenToggle();
        }
      } else if (code === 'Escape' || code === 'KeyP') {
        if (!e.repeat && player && !player.won) {
          paused = !paused;
          if (hudCallbacks.onPauseToggle) hudCallbacks.onPauseToggle(paused);
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      const code = e.code;
      if (code === 'ArrowLeft' || code === 'KeyA') {
        keys.left = false;
      } else if (code === 'ArrowRight' || code === 'KeyD') {
        keys.right = false;
      } else if (code === 'Space' || code === 'ArrowUp' || code === 'KeyW') {
        input.jumpReleased = true;
      }
    });

    window.addEventListener('blur', () => {
      keys.left = false;
      keys.right = false;
    });
  }

  window.ExoticEngine = {
    init(callbacks) {
      canvas = document.getElementById('game-canvas');
      ctx = canvas ? canvas.getContext('2d') : null;
      hudCallbacks = { ...hudCallbacks, ...callbacks };
      trailSystem = new window.ExoticTrailSystem();
      bindInputs();
      requestAnimationFrame(frame);
    },
    startLevel(levelId) {
      currentLevelBlueprint = window.ExoticLevels.getById(levelId);
      runDeaths = 0;
      runTimeMs = 0;
      stageCoins = 0;
      cameraX = 0;
      particles.length = 0;
      rings.length = 0;
      keys.left = false;
      keys.right = false;
      paused = false;
      running = true;
      resetAttempt(false);
      if (window.ExoticRealtime) {
        window.ExoticRealtime.fetchStageReplay(levelId);
        window.ExoticRealtime.sendPresenceHeartbeat({ route: 'play', levelId });
      }
    },
    stop() {
      running = false;
      paused = false;
      keys.left = false;
      keys.right = false;
    },
    setPaused(flag) {
      paused = Boolean(flag);
    },
    isPaused() {
      return paused;
    },
    restartLevel() {
      if (!currentLevelBlueprint) return;
      runDeaths = 0;
      runTimeMs = 0;
      stageCoins = 0;
      paused = false;
      resetAttempt(false);
    },
    quickRetry() {
      if (!running || !player || player.won) return;
      resetAttempt(!player.dead);
    },
    triggerEmote,
    setTouchKey(key, pressed) {
      if (key === 'left') keys.left = pressed;
      if (key === 'right') keys.right = pressed;
      if (key === 'jump') {
        if (pressed) input.jumpPressed = true;
        else input.jumpReleased = true;
      }
      if (key === 'dash' && pressed) input.dashPressed = true;
    }
  };
})();
