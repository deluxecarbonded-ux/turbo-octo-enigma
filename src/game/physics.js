(function () {
  const GRAVITY = 1680;
  const MAX_FALL = 790;
  const MOVE_SPEED = 278;
  const GROUND_ACCEL = 2650;
  const GROUND_DECEL = 3100;
  const AIR_ACCEL = 2050;
  const AIR_DECEL = 1450;
  const JUMP_VEL = 612;

  function createPlayer(spawn, upgrades) {
    return {
      x: spawn.x,
      y: spawn.y,
      w: 22,
      h: 26,
      vx: 0,
      vy: 0,
      facing: 1,
      gravitySign: 1,
      gravityCooldown: 0,
      onGround: false,
      groundPlat: null,
      coyoteTimer: 0,
      jumpBufferTimer: 0,
      airJumpsLeft: upgrades.doubleJump ? 1 : 0,
      dashTimer: 0,
      dashCooldown: 0,
      canAirDash: upgrades.dash,
      shieldAvailable: upgrades.shield,
      invulnTimer: 0,
      squashX: 1,
      squashY: 1,
      emoteId: null,
      emoteTimer: 0,
      emoteDuration: 1.0,
      dead: false,
      won: false
    };
  }

  function getSolidRects(runtime) {
    const list = [];
    for (const p of runtime.platforms) {
      if (p.hiddenUntilReveal && !p.revealed) continue;
      if (p.troll && p.troll.type === 'hidden_solid' && !p.revealed) continue;
      list.push(p);
    }
    for (const cr of runtime.crushers) {
      list.push(cr);
    }
    return list;
  }

  function stepPlayer(player, input, runtime, upgrades, dt, callbacks) {
    if (player.dead || player.won) return;

    const { rectsOverlap, triggerPlatformById, flipLinkedSigns } = window.ExoticTraps;

    // Smoothly relax squash & stretch
    player.squashX += (1 - player.squashX) * Math.min(1, dt * 16);
    player.squashY += (1 - player.squashY) * Math.min(1, dt * 16);

    if (player.invulnTimer > 0) player.invulnTimer = Math.max(0, player.invulnTimer - dt);
    if (player.gravityCooldown > 0) player.gravityCooldown = Math.max(0, player.gravityCooldown - dt);
    if (player.dashCooldown > 0) player.dashCooldown = Math.max(0, player.dashCooldown - dt);

    if (player.emoteTimer > 0) {
      player.emoteTimer = Math.max(0, player.emoteTimer - dt);
      if (player.emoteTimer === 0) player.emoteId = null;
    }

    // Carry from moving platform underneath
    if (player.onGround && player.groundPlat) {
      player.x += player.groundPlat.dx || 0;
      player.y += player.groundPlat.dy || 0;
    }

    // Coyote & Jump Buffer windows
    const graceMax = upgrades.coyote ? 0.19 : 0.095;
    if (player.onGround) {
      player.coyoteTimer = graceMax;
      player.airJumpsLeft = upgrades.doubleJump ? 1 : 0;
      if (upgrades.dash) player.canAirDash = true;
    } else {
      player.coyoteTimer = Math.max(0, player.coyoteTimer - dt);
    }

    if (input.jumpPressed) {
      player.jumpBufferTimer = upgrades.coyote ? 0.185 : 0.105;
      input.jumpPressed = false;
    } else {
      player.jumpBufferTimer = Math.max(0, player.jumpBufferTimer - dt);
    }

    // Phase Dash trigger
    if (input.dashPressed) {
      input.dashPressed = false;
      if (upgrades.dash && player.dashCooldown <= 0 && (player.onGround || player.canAirDash)) {
        if (!player.onGround) player.canAirDash = false;
        player.dashTimer = 0.145;
        player.dashCooldown = 0.52;
        const dir = input.moveDir !== 0 ? input.moveDir : player.facing;
        player.facing = dir;
        player.vx = dir * 565;
        player.vy = 0;
        player.squashX = 1.28;
        player.squashY = 0.76;
        if (callbacks.onDash) callbacks.onDash();
      }
    }

    if (player.dashTimer > 0) {
      player.dashTimer -= dt;
      player.vy = 0;
    } else {
      // Horizontal movement
      const dir = input.moveDir;
      if (dir !== 0) {
        player.facing = dir;
        const accel = player.onGround ? GROUND_ACCEL : AIR_ACCEL;
        player.vx += dir * accel * dt;
        if (Math.abs(player.vx) > MOVE_SPEED) {
          player.vx = dir * MOVE_SPEED;
        }
      } else {
        const decel = player.onGround ? GROUND_DECEL : AIR_DECEL;
        if (Math.abs(player.vx) <= decel * dt) {
          player.vx = 0;
        } else {
          player.vx -= Math.sign(player.vx) * decel * dt;
        }
      }

      // Gravity
      player.vy += GRAVITY * player.gravitySign * dt;
      if (player.gravitySign > 0 && player.vy > MAX_FALL) player.vy = MAX_FALL;
      if (player.gravitySign < 0 && player.vy < -MAX_FALL) player.vy = -MAX_FALL;
    }

    // Execute Jump (Ground/Coyote or Mid-Air Double Jump)
    if (player.jumpBufferTimer > 0) {
      if (player.coyoteTimer > 0) {
        player.vy = -JUMP_VEL * player.gravitySign;
        player.onGround = false;
        player.groundPlat = null;
        player.coyoteTimer = 0;
        player.jumpBufferTimer = 0;
        player.dashTimer = 0;
        player.squashX = 0.84;
        player.squashY = 1.2;
        if (callbacks.onJump) callbacks.onJump(false);
      } else if (player.airJumpsLeft > 0) {
        player.airJumpsLeft -= 1;
        player.vy = -JUMP_VEL * 0.94 * player.gravitySign;
        player.jumpBufferTimer = 0;
        player.dashTimer = 0;
        player.squashX = 0.82;
        player.squashY = 1.22;
        if (callbacks.onJump) callbacks.onJump(true);
      }
    }

    // Variable jump height cut when button released
    if (input.jumpReleased) {
      input.jumpReleased = false;
      if (player.gravitySign > 0 && player.vy < -180) {
        player.vy *= 0.48;
      } else if (player.gravitySign < 0 && player.vy > 180) {
        player.vy *= 0.48;
      }
    }

    const solids = getSolidRects(runtime);

    // Horizontal step & AABB resolution
    player.x += player.vx * dt;
    if (player.x < 0) {
      player.x = 0;
      player.vx = 0;
    } else if (player.x + player.w > runtime.width) {
      player.x = runtime.width - player.w;
      player.vx = 0;
    }

    for (const s of solids) {
      if (rectsOverlap(player, s)) {
        if (player.vx > 0) {
          player.x = s.x - player.w;
          player.vx = 0;
        } else if (player.vx < 0) {
          player.x = s.x + s.w;
          player.vx = 0;
        }
      }
    }

    // Vertical step & AABB resolution
    const wasOnGround = player.onGround;
    player.onGround = false;
    player.groundPlat = null;

    const prevY = player.y;
    player.y += player.vy * dt;

    // Hidden Kaizo block check when moving upward into underside!
    for (const p of runtime.platforms) {
      if (p.troll && p.troll.type === 'hidden_solid' && !p.revealed) {
        if (
          player.gravitySign > 0 &&
          player.vy < 0 &&
          prevY >= p.y + p.h - 12 &&
          rectsOverlap(player, p)
        ) {
          p.revealed = true;
          flipLinkedSigns(runtime, p.id);
          player.y = p.y + p.h;
          player.vy = 40;
          if (callbacks.onTrapTriggered) callbacks.onTrapTriggered('bonk');
        }
      }
    }

    const updatedSolids = getSolidRects(runtime);
    for (const s of updatedSolids) {
      if (!rectsOverlap(player, s)) continue;

      if (player.vy > 0) {
        player.y = s.y - player.h;
        player.vy = 0;
        if (player.gravitySign > 0) {
          player.onGround = true;
          player.groundPlat = s;
          if (s.troll && s.troll.type === 'touch_drop' && !s.triggered) {
            s.triggered = true;
            if (callbacks.onTrapTriggered) callbacks.onTrapTriggered('touch_drop');
          }
        }
      } else if (player.vy < 0) {
        player.y = s.y + s.h;
        player.vy = 0;
        if (player.gravitySign < 0) {
          player.onGround = true;
          player.groundPlat = s;
          if (s.troll && s.troll.type === 'touch_drop' && !s.triggered) {
            s.triggered = true;
            if (callbacks.onTrapTriggered) callbacks.onTrapTriggered('touch_drop');
          }
        }
      } else if (s.dy && s.dy > 0 && player.gravitySign > 0) {
        // Slammed from above by crusher
        triggerHazardHit(player, runtime, 'Crushed flat.', callbacks);
        return;
      }
    }

    if (!wasOnGround && player.onGround) {
      player.squashX = 1.18;
      player.squashY = 0.84;
      if (callbacks.onLand) callbacks.onLand();
    }

    // Void out-of-bounds death (bottom or top when inverted)
    if (player.y > runtime.height + 36 || player.y + player.h < -44) {
      triggerHazardHit(player, runtime, null, callbacks, true);
      return;
    }

    // Springs check
    for (const spr of runtime.springs) {
      const sprRect = { x: spr.x, y: spr.y - 4, w: spr.w, h: spr.h + 4 };
      if (rectsOverlap(player, sprRect) && player.vy >= -40) {
        player.vy = spr.boostVy || -840;
        player.onGround = false;
        player.squashX = 0.78;
        player.squashY = 1.28;
        spr.compress = 1;
        if (callbacks.onSpring) callbacks.onSpring();
      }
    }

    // Gravity Inversion Zones
    if (player.gravityCooldown <= 0) {
      for (const gz of runtime.gravityZones) {
        if (rectsOverlap(player, gz) && player.gravitySign !== gz.gravitySign) {
          player.gravitySign = gz.gravitySign;
          player.gravityCooldown = 0.25;
          player.vy = gz.gravitySign * 140;
          if (callbacks.onGravityFlip) callbacks.onGravityFlip(gz.gravitySign);
          break;
        }
      }
    }

    // Coin Magnet & Coin Pickup
    const pCenterX = player.x + player.w * 0.5;
    const pCenterY = player.y + player.h * 0.5;

    for (const c of runtime.coins) {
      if (c.collected) continue;
      const dx = pCenterX - c.x;
      const dy = pCenterY - c.y;
      const dist = Math.hypot(dx, dy);

      if (upgrades.magnet && dist < 138 && dist > 1) {
        const pull = 360 * dt;
        c.x += (dx / dist) * pull;
        c.y += (dy / dist) * pull;
      }

      if (dist < 21) {
        c.collected = true;
        if (c.trapPlatformId) {
          triggerPlatformById(runtime, c.trapPlatformId, callbacks);
        }
        if (callbacks.onCoin) callbacks.onCoin(c);
      }
    }

    // Skill Orb Pickup
    if (runtime.skillOrb && !runtime.skillOrb.collected) {
      const orb = runtime.skillOrb;
      const dx = pCenterX - orb.x;
      const dy = pCenterY - orb.y;
      const dist = Math.hypot(dx, dy);

      if (upgrades.magnet && dist < 138 && dist > 1) {
        const pull = 320 * dt;
        orb.x += (dx / dist) * pull;
        orb.y += (dy / dist) * pull;
      }

      if (dist < 24) {
        orb.collected = true;
        if (callbacks.onSkillOrb) callbacks.onSkillOrb(orb);
      }
    }

    // Hazard Collisions (Chaser Wall, Fake Checkpoints, Spikes, Crusher teeth, Saws)
    if (player.invulnTimer <= 0) {
      // Marching Chaser Spike Wall
      if (runtime.chaserWall && runtime.chaserWall.active) {
        if (player.x < runtime.chaserWall.x + 12) {
          triggerHazardHit(player, runtime, 'Too slow! Never hesitate.', callbacks, false);
          return;
        }
      }

      // Fake Checkpoint Flags ("SAVE" -> Betrayal!)
      if (runtime.fakeCheckpoints) {
        for (const cp of runtime.fakeCheckpoints) {
          const cpRect = { x: cp.x - 4, y: cp.y - 44, w: 28, h: 44 };
          if (rectsOverlap(player, cpRect)) {
            cp.triggered = true;
            flipLinkedSigns(runtime, cp.id);
            triggerHazardHit(
              player,
              runtime,
              'Fake Checkpoint! Jump OVER "Save" flags.',
              callbacks,
              false
            );
            return;
          }
        }
      }

      // Spikes (forgiving inner hitbox so grazing air feels fair!)
      for (const sp of runtime.spikes) {
        if (sp.popProgress < 0.45) continue;
        const totalW = sp.count * 18;
        const h = 13 * sp.popProgress;
        const hitRect =
          sp.dir === 'down'
            ? { x: sp.x + 3, y: sp.y, w: totalW - 6, h }
            : { x: sp.x + 3, y: sp.y - h, w: totalW - 6, h };

        if (rectsOverlap(player, hitRect)) {
          triggerHazardHit(player, runtime, null, callbacks, false);
          return;
        }
      }

      // Crusher bottom teeth
      for (const cr of runtime.crushers) {
        const teethRect = { x: cr.x + 4, y: cr.y + cr.h - 2, w: cr.w - 8, h: 10 };
        if (rectsOverlap(player, teethRect)) {
          triggerHazardHit(player, runtime, null, callbacks, false);
          return;
        }
      }

      // Saws (circle-rect overlap)
      for (const saw of runtime.saws) {
        const nearX = Math.max(player.x, Math.min(saw.x, player.x + player.w));
        const nearY = Math.max(player.y, Math.min(saw.y, player.y + player.h));
        const dist = Math.hypot(saw.x - nearX, saw.y - nearY);
        if (dist < saw.r - 2) {
          triggerHazardHit(player, runtime, null, callbacks, false);
          return;
        }
      }
    }

    // Exit Doors (Decoy vs Real Victory — cannot enter a Shy Door while it is actively bolting!)
    for (const d of runtime.doors) {
      if (d.hiddenUntilReveal && !d.revealed) continue;
      if (d.vanished) continue;
      if (typeof d.targetX === 'number' && Math.abs(d.targetX - d.x) > 2) continue;
      const doorHit = { x: d.x + 5, y: d.y + 6, w: d.w - 10, h: d.h - 6 };
      if (rectsOverlap(player, doorHit)) {
        if (d.fake) {
          d.vanished = true;
          flipLinkedSigns(runtime, d.id);
          if (d.revealDoorId) {
            const realD = runtime.doors.find((item) => item.id === d.revealDoorId);
            if (realD) realD.revealed = true;
          }
          if (d.revealPlatformId) {
            const revP = runtime.platforms.find((item) => item.id === d.revealPlatformId);
            if (revP) revP.revealed = true;
          }
          if (callbacks.onDecoyDoor) callbacks.onDecoyDoor(d);
        } else {
          player.won = true;
          if (callbacks.onWin) callbacks.onWin(d);
          return;
        }
      }
    }
  }

  function triggerHazardHit(player, runtime, customQuip, callbacks, isVoidFall = false) {
    // Second Wind Shield deflects lethal non-void hazards once per attempt!
    if (!isVoidFall && player.shieldAvailable) {
      player.shieldAvailable = false;
      player.invulnTimer = 0.65;
      player.vy = -490 * player.gravitySign;
      player.squashX = 0.8;
      player.squashY = 1.25;
      if (callbacks.onShieldSave) callbacks.onShieldSave();
      return;
    }

    player.dead = true;
    if (callbacks.onDeath) {
      callbacks.onDeath(customQuip);
    }
  }

  window.ExoticPhysics = {
    createPlayer,
    stepPlayer
  };
})();
