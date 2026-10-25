(function () {
  function rectsOverlap(a, b) {
    return (
      a.x < b.x + b.w &&
      a.x + a.w > b.x &&
      a.y < b.y + b.h &&
      a.y + a.h > b.y
    );
  }

  function isPlayerMovingOrAirborne(player) {
    return Math.abs(player.vx) > 2 || Math.abs(player.vy) > 2 || !player.onGround;
  }

  function isNearRect(pBox, targetRect, padX, padY) {
    const expanded = {
      x: targetRect.x - padX,
      y: targetRect.y - padY,
      w: targetRect.w + padX * 2,
      h: targetRect.h + padY * 2
    };
    return rectsOverlap(pBox, expanded);
  }

  function cloneRuntimeLevel(blueprint) {
    return {
      id: blueprint.id,
      code: blueprint.code,
      title: blueprint.title,
      subtitle: blueprint.subtitle,
      width: blueprint.width,
      height: blueprint.height,
      parDeaths: blueprint.parDeaths,
      parTimeMs: blueprint.parTimeMs,
      rewardCoins: blueprint.rewardCoins,
      rewardSP: blueprint.rewardSP ?? 1,
      spawn: { ...blueprint.spawn },
      quips: [...blueprint.quips],
      signs: (blueprint.signs || []).map((sg) => ({
        ...sg,
        triggered: false
      })),
      fakeCheckpoints: (blueprint.fakeCheckpoints || []).map((cp) => ({
        ...cp,
        triggered: false
      })),
      chaserWall: blueprint.chaserWall
        ? { ...blueprint.chaserWall, active: false }
        : null,
      platforms: blueprint.platforms.map((p) => ({
        ...p,
        baseX: p.x,
        baseY: p.y,
        dx: 0,
        dy: 0,
        triggered: false,
        delayLeft: 0,
        moving: false,
        revealed: false,
        troll: p.troll ? { ...p.troll, delayMs: 0 } : null
      })),
      spikes: blueprint.spikes.map((s) => ({
        ...s,
        baseX: s.x,
        baseY: s.y,
        vy: 0,
        jumpUsed: false,
        triggered: false,
        delayLeft: 0,
        popProgress: s.hidden ? 0 : 1,
        troll: s.troll ? { ...s.troll, delayMs: 0 } : null
      })),
      crushers: blueprint.crushers.map((c) => ({
        ...c,
        baseY: c.y,
        dy: 0,
        phase: 'idle',
        didSecondSlam: false,
        timer: 0
      })),
      saws: blueprint.saws.map((s) => ({
        ...s,
        baseX: s.x,
        baseY: s.y,
        awake: !s.wakeRect
      })),
      springs: blueprint.springs.map((sp) => ({
        ...sp,
        baseX: sp.x,
        triggered: false,
        compress: 0
      })),
      gravityZones: blueprint.gravityZones.map((gz) => ({ ...gz })),
      coins: blueprint.coins.map((c, idx) => {
        const coinId = c.id || `coin_${idx}`;
        const alreadyCollected = Boolean(
          window.ExoticStorage &&
            window.ExoticStorage.isCoinCollected &&
            window.ExoticStorage.isCoinCollected(blueprint.id, coinId)
        );
        return {
          ...c,
          id: coinId,
          baseX: c.x,
          baseY: c.y,
          targetX: c.x,
          targetY: c.y,
          shyUsed: false,
          collected: alreadyCollected
        };
      }),
      skillOrb: blueprint.skillOrb
        ? {
            ...blueprint.skillOrb,
            collected: Boolean(
              window.ExoticStorage &&
                window.ExoticStorage.hasCollectedOrb &&
                window.ExoticStorage.hasCollectedOrb(blueprint.id)
            )
          }
        : null,
      doors: blueprint.doors.map((d) => ({
        ...d,
        w: d.w || 38,
        h: d.h || 54,
        targetX: d.x,
        waypointIdx: 0,
        shyTriggered: false,
        vanished: false,
        revealed: !d.hiddenUntilReveal
      }))
    };
  }

  function flipLinkedSigns(runtime, entityId) {
    if (!entityId || !runtime.signs) return;
    for (const sg of runtime.signs) {
      if (sg.watchId === entityId) {
        sg.triggered = true;
      }
    }
  }

  function triggerPlatformById(runtime, platId, callbacks) {
    const plat = runtime.platforms.find((p) => p.id === platId);
    if (!plat || plat.triggered) return;
    plat.triggered = true;
    plat.delayLeft = 0;
    flipLinkedSigns(runtime, plat.id);
    if (callbacks && callbacks.onTrapTriggered) {
      callbacks.onTrapTriggered('platform');
    }
  }

  function updateWorld(runtime, player, dt, time, callbacks) {
    const pBox = { x: player.x, y: player.y, w: player.w, h: player.h };
    const moving = isPlayerMovingOrAirborne(player);

    // 0. Update Chaser Spike Wall
    if (runtime.chaserWall) {
      const wall = runtime.chaserWall;
      if (!wall.active && moving && player.x >= wall.wakeX) {
        wall.active = true;
        flipLinkedSigns(runtime, wall.id || 'chaser_wall');
        if (callbacks && callbacks.onTrapTriggered) {
          callbacks.onTrapTriggered('wall');
        }
      }
      if (wall.active && wall.x < wall.maxX) {
        wall.x = Math.min(wall.maxX, wall.x + wall.speedX * dt);
      }
    }

    // 1. Update Troll Platforms
    for (const p of runtime.platforms) {
      p.dx = 0;
      p.dy = 0;
      if (p.hiddenUntilReveal && !p.revealed) continue;
      if (!p.troll) continue;

      if (!p.triggered && !p.troll.manualOnly && moving) {
        const hitTriggerRect = p.troll.triggerRect && rectsOverlap(pBox, p.troll.triggerRect);
        const padX = typeof p.troll.padX === 'number' ? p.troll.padX : 28;
        const hitProximity =
          (p.troll.type === 'drop' || p.troll.type === 'slide') &&
          isNearRect(pBox, { x: p.x, y: p.y - 24, w: p.w, h: Math.min(72, p.h + 40) }, padX, 58);
        const hitBridgeApproach =
          p.troll.type === 'touch_drop' &&
          isNearRect(pBox, { x: p.x, y: p.y - 10, w: p.w, h: p.h + 10 }, 4, 6);

        if (hitTriggerRect || hitProximity || hitBridgeApproach) {
          p.triggered = true;
          flipLinkedSigns(runtime, p.id);
          if (callbacks && callbacks.onTrapTriggered) {
            callbacks.onTrapTriggered(p.troll.type);
          }
        }
      }

      if (p.triggered) {
        if (p.troll.type === 'drop' || p.troll.type === 'touch_drop') {
          const speedY = Math.max(720, p.troll.speedY || 760);
          const targetY = p.baseY + p.troll.targetDY;
          const diff = targetY - p.y;
          if (Math.abs(diff) > 0.5) {
            const step = Math.sign(diff) * Math.min(Math.abs(diff), speedY * dt);
            p.y += step;
            p.dy = step;
          }
        } else if (p.troll.type === 'slide') {
          const speedX = Math.max(480, Math.abs(p.troll.speedX || 480));
          const targetX = p.baseX + p.troll.targetDX;
          const diff = targetX - p.x;
          if (Math.abs(diff) > 0.5) {
            const step = Math.sign(diff) * Math.min(Math.abs(diff), speedX * dt);
            p.x += step;
            p.dx = step;
          }
        }
      }
    }

    // 2. Update Troll Spikes (pop, slide, and mid-air JUMPING spikes!)
    for (const sp of runtime.spikes) {
      const spikeW = sp.count * 18;
      if (sp.troll && !sp.triggered && moving) {
        const spikeBox =
          sp.dir === 'down'
            ? { x: sp.x, y: sp.y, w: spikeW, h: 24 }
            : { x: sp.x, y: sp.y - 24, w: spikeW, h: 24 };

        if (sp.troll.type === 'jump') {
          // Jumps WITH the player when player jumps near it OR steps right up to it!
          const horizClose =
            pBox.x + pBox.w > sp.x - 54 && pBox.x < sp.x + spikeW + 36;
          const playerJumpingNear = horizClose && (!player.onGround || Math.abs(pBox.x + pBox.w - sp.x) < 22);
          if (playerJumpingNear) {
            sp.triggered = true;
            sp.vy = sp.troll.jumpVy || -520;
            flipLinkedSigns(runtime, sp.id);
            if (callbacks && callbacks.onTrapTriggered) {
              callbacks.onTrapTriggered('spike_jump');
            }
          }
        } else {
          const padX = typeof sp.troll.padX === 'number' ? sp.troll.padX : 26;
          const hitTriggerRect = sp.troll.triggerRect && rectsOverlap(pBox, sp.troll.triggerRect);
          const hitProximity = isNearRect(pBox, spikeBox, padX, 64);

          if (hitTriggerRect || hitProximity) {
            sp.triggered = true;
            flipLinkedSigns(runtime, sp.id);
            if (callbacks && callbacks.onTrapTriggered) {
              callbacks.onTrapTriggered('spike');
            }
          }
        }
      }

      if (sp.triggered && sp.troll) {
        if (sp.troll.type === 'pop') {
          sp.popProgress = Math.min(1, sp.popProgress + dt * 28);
        } else if (sp.troll.type === 'slide') {
          const speedX = Math.max(490, Math.abs(sp.troll.speedX || 490));
          const targetX = sp.baseX + sp.troll.targetDX;
          const diff = targetX - sp.x;
          if (Math.abs(diff) > 0.5) {
            sp.x += Math.sign(diff) * Math.min(Math.abs(diff), speedX * dt);
          }
        } else if (sp.troll.type === 'jump') {
          sp.y += sp.vy * dt;
          sp.vy += 1560 * dt;
          if (sp.y >= sp.baseY) {
            sp.y = sp.baseY;
            sp.vy = 0;
            // Re-arms after landing if player backs off and jumps again!
            if (pBox.x + pBox.w < sp.x - 65 || pBox.x > sp.x + spikeW + 65) {
              sp.triggered = false;
            }
          }
        }
      }
    }

    // 3. Update Crushers (including Double-Slam Fakeout & Offscreen Sky Anvils!)
    for (const cr of runtime.crushers) {
      cr.dy = 0;
      if (cr.phase === 'idle') {
        const padLeft = typeof cr.padLeft === 'number' ? cr.padLeft : 22;
        const laneRect = {
          x: cr.x - padLeft,
          y: Math.min(0, cr.baseY),
          w: cr.w + padLeft + 16,
          h: 540
        };
        const hitTrigger =
          moving &&
          ((cr.triggerRect && rectsOverlap(pBox, cr.triggerRect)) || rectsOverlap(pBox, laneRect));
        if (hitTrigger) {
          cr.phase = 'slam';
          cr.didSecondSlam = false;
          flipLinkedSigns(runtime, cr.id);
          if (callbacks && callbacks.onTrapTriggered) {
            callbacks.onTrapTriggered('crusher');
          }
        }
      } else if (cr.phase === 'slam') {
        const baseSlam = cr.didSecondSlam ? 1380 : Math.max(1040, cr.slamSpeed || 1040);
        const targetY = cr.baseY + cr.dropDist;
        const step = Math.min(targetY - cr.y, baseSlam * dt);
        cr.y += step;
        cr.dy = step;
        if (cr.y >= targetY - 0.5) {
          cr.y = targetY;
          cr.phase = 'hold';
          cr.timer = cr.doubleSlam && !cr.didSecondSlam ? 0.14 : 0.26;
          if (callbacks && callbacks.onSlam) callbacks.onSlam();
        }
      } else if (cr.phase === 'hold') {
        cr.timer -= dt;
        if (cr.timer <= 0) {
          cr.phase = cr.doubleSlam && !cr.didSecondSlam ? 'fake_retract' : 'retract';
        }
      } else if (cr.phase === 'fake_retract') {
        // Rises 40% back up to bait the player into sprinting under, then SLAMS AGAIN!
        const fakeTopY = cr.baseY + cr.dropDist * 0.58;
        const step = Math.min(cr.y - fakeTopY, 340 * dt);
        cr.y -= step;
        cr.dy = -step;
        if (cr.y <= fakeTopY + 0.5) {
          cr.didSecondSlam = true;
          cr.phase = 'slam';
          if (callbacks && callbacks.onTrapTriggered) {
            callbacks.onTrapTriggered('double_slam');
          }
        }
      } else if (cr.phase === 'retract') {
        const retractSpeed = Math.max(290, cr.retractSpeed || 290);
        const step = Math.min(cr.y - cr.baseY, retractSpeed * dt);
        cr.y -= step;
        cr.dy = -step;
        if (cr.y <= cr.baseY + 0.5) {
          cr.y = cr.baseY;
          cr.phase = 'idle';
        }
      }
    }

    // 4. Update Saws
    for (const saw of runtime.saws) {
      if (!saw.awake && moving) {
        const hitWake = saw.wakeRect && rectsOverlap(pBox, saw.wakeRect);
        const passedSaw = pBox.x > saw.x + 24 && Math.abs(pBox.y - saw.y) < 160;
        if (hitWake || passedSaw) {
          saw.awake = true;
          flipLinkedSigns(runtime, saw.id);
          if (callbacks && callbacks.onTrapTriggered) {
            callbacks.onTrapTriggered('saw');
          }
        }
      }
      if (saw.patrolDY) {
        saw.y = saw.baseY + Math.sin(time * (saw.speed || 2.5)) * saw.patrolDY;
      }
      if (saw.patrolDX) {
        saw.x = saw.baseX + Math.sin(time * (saw.speed || 2.5)) * saw.patrolDX;
      }
      if (saw.awake && saw.chaseSpeedX) {
        const limitX = saw.maxX || runtime.width - 54;
        if (saw.x < limitX) {
          saw.x = Math.min(limitX, saw.x + saw.chaseSpeedX * dt);
        }
      }
    }

    // 5. Update Springs (including dodging troll springs!)
    for (const spr of runtime.springs) {
      if (spr.compress > 0) {
        spr.compress = Math.max(0, spr.compress - dt * 4.5);
      }
      if (spr.dodgeDX && !spr.triggered && moving) {
        if (isNearRect(pBox, { x: spr.x, y: spr.y - 30, w: spr.w, h: 42 }, 36, 48)) {
          spr.triggered = true;
          flipLinkedSigns(runtime, spr.id);
          if (callbacks && callbacks.onTrapTriggered) callbacks.onTrapTriggered('spring_dodge');
        }
      }
      if (spr.triggered && spr.dodgeDX) {
        const tx = spr.baseX + spr.dodgeDX;
        const diff = tx - spr.x;
        if (Math.abs(diff) > 0.5) {
          spr.x += Math.sign(diff) * Math.min(Math.abs(diff), 460 * dt);
        }
      }
    }

    // 6. Update Shy Bait Coins (scoot toward danger when reached for!)
    for (const c of runtime.coins) {
      if (c.collected) continue;
      if (!c.shyUsed && (c.shyDX || c.shyDY) && moving) {
        const dist = Math.hypot(pBox.x + pBox.w * 0.5 - c.x, pBox.y + pBox.h * 0.5 - c.y);
        if (dist < 44) {
          c.shyUsed = true;
          c.targetX = c.baseX + (c.shyDX || 0);
          c.targetY = c.baseY + (c.shyDY || 0);
          if (callbacks && callbacks.onTrapTriggered) callbacks.onTrapTriggered('shy_coin');
        }
      }
      if (c.shyUsed) {
        c.x += (c.targetX - c.x) * Math.min(1, dt * 14);
        c.y += (c.targetY - c.y) * Math.min(1, dt * 14);
      }
    }

    // 7. Update Multi-Juke Shy & Decoy Exit Doors
    for (const d of runtime.doors) {
      if (d.hiddenUntilReveal && !d.revealed) continue;
      if (d.vanished) continue;

      // Multi-waypoint jukes support
      if (Array.isArray(d.shyWaypoints) && d.waypointIdx < d.shyWaypoints.length && moving) {
        const wp = d.shyWaypoints[d.waypointIdx];
        const doorRect = { x: d.x, y: d.y, w: d.w, h: d.h };
        if (isNearRect(pBox, doorRect, wp.dist || 62, 65)) {
          d.targetX = wp.targetX;
          d.waypointIdx += 1;
          d.shyTriggered = true;
          flipLinkedSigns(runtime, d.id);
          if (wp.dropPlatformId) {
            triggerPlatformById(runtime, wp.dropPlatformId, callbacks);
          }
          if (callbacks && callbacks.onShyDoor) {
            callbacks.onShyDoor();
          }
        }
      } else if (!d.shyTriggered && typeof d.shyTargetX === 'number' && moving) {
        const doorRect = { x: d.x, y: d.y, w: d.w, h: d.h };
        const hitShy =
          (d.shyTriggerRect && rectsOverlap(pBox, d.shyTriggerRect)) ||
          isNearRect(pBox, doorRect, 66, 65);

        if (hitShy) {
          d.shyTriggered = true;
          d.targetX = d.shyTargetX;
          flipLinkedSigns(runtime, d.id);
          if (d.shyDropPlatformId) {
            triggerPlatformById(runtime, d.shyDropPlatformId, callbacks);
          }
          if (callbacks && callbacks.onShyDoor) {
            callbacks.onShyDoor();
          }
        }
      }

      const diff = d.targetX - d.x;
      if (Math.abs(diff) > 0.5) {
        d.x += Math.sign(diff) * Math.min(Math.abs(diff), 680 * dt);
      }
    }
  }

  window.ExoticTraps = {
    rectsOverlap,
    cloneRuntimeLevel,
    triggerPlatformById,
    flipLinkedSigns,
    updateWorld
  };
})();
