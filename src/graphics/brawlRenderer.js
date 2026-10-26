(function () {
  function fillCapsule(ctx, x1, y1, x2, y2, r) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (len < 0.001) {
      ctx.beginPath();
      ctx.arc(x1, y1, r, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    const ang = Math.atan2(dy, dx);
    ctx.beginPath();
    ctx.arc(x1, y1, r, ang + Math.PI * 0.5, ang + Math.PI * 1.5);
    ctx.arc(x2, y2, r, ang - Math.PI * 0.5, ang + Math.PI * 0.5);
    ctx.closePath();
    ctx.fill();
  }

  function fillDiamond(ctx, cx, cy, rx, ry) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - ry);
    ctx.lineTo(cx + rx, cy);
    ctx.lineTo(cx, cy + ry);
    ctx.lineTo(cx - rx, cy);
    ctx.closePath();
    ctx.fill();
  }

  function fillRing(ctx, cx, cy, outerR, innerR) {
    if (outerR <= 0) return;
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, 0, Math.PI * 2, false);
    if (innerR > 0 && innerR < outerR) {
      ctx.arc(cx, cy, innerR, 0, Math.PI * 2, true);
    }
    ctx.fill('evenodd');
  }

  function fillRoundRect(ctx, x, y, w, h, r) {
    const rr = Math.max(0, Math.min(r, w * 0.5, h * 0.5));
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    ctx.lineTo(x + rr, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
    ctx.lineTo(x, y + rr);
    ctx.quadraticCurveTo(x, y, x + rr, y);
    ctx.closePath();
    ctx.fill();
  }

  function resolveArenaPalette(map, pal) {
    const isLight = pal.mode === 'light';
    if (!pal.colored) {
      return {
        sky: pal.stageBg,
        pillar: pal.bgPillar,
        island: pal.platform,
        islandUnder: isLight ? '#262626' : '#d4d4d4',
        cap: isLight ? '#0a0a0a' : '#ffffff',
        soft: pal.platform,
        accent: pal.playerPrimary,
        subtle: pal.playerMid,
        cutout: pal.stageBg
      };
    }
    const ct = map.coloredTheme || {};
    return {
      sky: isLight ? ct.lightSky || '#e0f2fe' : ct.darkSky || '#0b1329',
      pillar: isLight ? ct.lightPillar || '#bae6fd' : ct.darkPillar || '#162347',
      island: isLight ? ct.islandLight || '#334155' : ct.island || '#1e293b',
      islandUnder: isLight ? '#1e293b' : '#0f172a',
      cap: ct.cap || '#10b981',
      soft: ct.soft || '#38bdf8',
      accent: ct.accent || '#fbbf24',
      subtle: isLight ? '#64748b' : '#94a3b8',
      cutout: isLight ? ct.lightSky || '#e0f2fe' : ct.darkSky || '#0b1329'
    };
  }

  function resolveWeaponColors(weaponId, pal) {
    const wDef = window.ExoticBrawlData.getWeaponById(weaponId);
    const isLight = pal.mode === 'light';
    if (!pal.colored) {
      return {
        primary: pal.playerPrimary,
        secondary: isLight ? '#525252' : '#a3a3a3',
        grip: isLight ? '#262626' : '#525252',
        accent: pal.playerPrimary
      };
    }
    return {
      primary: isLight ? '#1e293b' : wDef.coloredPrimary || '#e2e8f0',
      secondary: wDef.coloredAccent || '#38bdf8',
      grip: isLight ? '#0f172a' : '#334155',
      accent: wDef.coloredAccent || '#f97316'
    };
  }

  function drawBrawlBackdrop(ctx, map, viewW, viewH, time, pal) {
    const ap = resolveArenaPalette(map, pal);
    const is3D = Boolean(pal && pal.is3D && window.Exotic3D);
    ctx.fillStyle = ap.sky;
    ctx.fillRect(0, 0, viewW, viewH);

    if (is3D) {
      window.Exotic3D.draw3DStageChamber(ctx, viewW, viewH, Math.sin(time * 0.4) * 36, pal);
    }

    // Subtle floating atmospheric diamond motes (or 3D tumbled cubes in 3D Mode!)
    ctx.save();
    ctx.globalAlpha = pal.colored ? (is3D ? 0.34 : 0.22) : is3D ? 0.22 : 0.12;
    ctx.fillStyle = ap.accent;
    for (let i = 0; i < 10; i++) {
      const mx = ((i * 137 + time * (10 + (i % 3) * 5)) % (viewW + 80)) - 40;
      const my = 46 + ((i * 89) % (viewH - 120)) + Math.sin(time * 1.6 + i) * 8;
      const r = 2.5 + (i % 3) * 1.4;
      if (is3D) {
        window.Exotic3D.draw3DTumbledCube(ctx, mx, my, r * 2.3, time * 1.3 + i, ap.accent, pal);
      } else {
        fillDiamond(ctx, mx, my, r, r);
      }
    }
    ctx.restore();
  }

  function drawBrawlStageWorld(ctx, map, platforms, time, pal) {
    const ap = resolveArenaPalette(map, pal);
    const is3D = Boolean(pal && pal.is3D && window.Exotic3D);
    const vanishX = 480;

    // Architectural backdrop monolith pillars in world space
    ctx.save();
    ctx.fillStyle = ap.pillar;
    for (const pil of map.pillars || []) {
      if (is3D) {
        window.Exotic3D.drawExtrudedBox(ctx, pil.x, pil.y, pil.w, pil.h, {
          palette: pal,
          vanishX,
          depth: 18,
          frontColor: ap.pillar,
          radius: 6,
          castShadow: false
        });
      } else {
        fillRoundRect(ctx, pil.x, pil.y, pil.w, pil.h, 6);
      }
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = ap.cutout;
      ctx.fillRect(pil.x + pil.w * 0.38, pil.y + 18, pil.w * 0.24, pil.h - 36);
      ctx.globalAlpha = 1;
      ctx.fillStyle = ap.pillar;
    }
    ctx.restore();

    // Draw platforms (solid floating islands + soft pass-through decks)
    for (const p of platforms) {
      if (p.type === 'solid') {
        const wallH = Math.max(48, p.h * 0.72);
        const taper = Math.min(44, p.w * 0.16);

        if (is3D) {
          const { dx, dy } = window.Exotic3D.computeExtrusion(p.x + p.w * 0.5, vanishX, 26);
          // 3D extruded underside vault side facet
          ctx.fillStyle = window.Exotic3D.shadeFace(ap.islandUnder, 'deep', pal);
          if (dx >= 0) {
            window.Exotic3D.fillQuad(
              ctx,
              p.x + p.w,
              p.y + wallH - 4,
              p.x + p.w + dx,
              p.y + wallH - 4 + dy,
              p.x + p.w - taper + dx * 0.7,
              p.y + p.h + dy * 0.7,
              p.x + p.w - taper,
              p.y + p.h
            );
          } else {
            window.Exotic3D.fillQuad(
              ctx,
              p.x + dx,
              p.y + wallH - 4 + dy,
              p.x,
              p.y + wallH - 4,
              p.x + taper,
              p.y + p.h,
              p.x + taper + dx * 0.7,
              p.y + p.h + dy * 0.7
            );
          }
        }

        // Tapered floating island underside
        ctx.fillStyle = ap.islandUnder;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y + 14);
        ctx.lineTo(p.x + p.w, p.y + 14);
        ctx.lineTo(p.x + p.w - taper, p.y + p.h);
        ctx.lineTo(p.x + taper, p.y + p.h);
        ctx.closePath();
        ctx.fill();

        // Main wall-slideable stage block (vertical top ~75% of island height)
        if (is3D) {
          window.Exotic3D.drawExtrudedBox(ctx, p.x, p.y, p.w, wallH, {
            palette: pal,
            vanishX,
            depth: 26,
            frontColor: ap.island,
            capColor: ap.cap,
            radius: 6,
            castShadow: false
          });
        } else {
          ctx.fillStyle = ap.island;
          fillRoundRect(ctx, p.x, p.y, p.w, wallH, 6);
        }

        // Top turf / cap strip
        ctx.fillStyle = ap.cap;
        fillRoundRect(ctx, p.x, p.y, p.w, 8, 4);

        // Subtle architectural notches inside island face
        ctx.globalAlpha = 0.22;
        ctx.fillStyle = ap.cutout;
        const count = Math.max(2, Math.floor(p.w / 92));
        const step = p.w / (count + 1);
        for (let i = 1; i <= count; i++) {
          fillRoundRect(ctx, p.x + step * i - 10, p.y + 20, 20, 6, 3);
        }
        ctx.globalAlpha = 1;
      } else {
        // Soft pass-through aerial platform (distinct beveled deck + underside brackets)
        if (is3D) {
          window.Exotic3D.drawExtrudedBox(ctx, p.x + 8, p.y + 6, p.w - 16, p.h, {
            palette: pal,
            vanishX,
            depth: 15,
            frontColor: ap.islandUnder,
            radius: 4,
            castShadow: true
          });
          window.Exotic3D.drawExtrudedBox(ctx, p.x, p.y, p.w, p.h - 2, {
            palette: pal,
            vanishX,
            depth: 18,
            frontColor: ap.soft,
            capColor: ap.soft,
            radius: 5,
            castShadow: false
          });
        } else {
          ctx.fillStyle = ap.islandUnder;
          fillRoundRect(ctx, p.x + 8, p.y + 6, p.w - 16, p.h, 4);

          ctx.fillStyle = ap.soft;
          fillRoundRect(ctx, p.x, p.y, p.w, p.h - 2, 5);
        }

        if (p.motion) {
          ctx.fillStyle = ap.accent;
          const pulse = 3 + Math.sin(time * 6) * 0.8;
          fillDiamond(ctx, p.x + p.w * 0.5, p.y + p.h * 0.5 - 1, pulse + 2, pulse);
        }
      }
    }
  }

  function drawSkyDropBeacon(ctx, drop, pal, time) {
    const accent = pal.colored ? '#fbbf24' : pal.playerPrimary;
    const core = pal.colored ? '#ffffff' : pal.playerPrimary;
    const hover = Math.sin(time * 5.2 + (drop.seed || 0)) * 4.5;
    const cx = drop.x;
    const cy = drop.y + hover;

    ctx.save();
    // Vertical sky beacon column while descending or freshly landed
    const colAlpha = drop.falling ? 0.24 : 0.12 + Math.sin(time * 6) * 0.04;
    ctx.globalAlpha = Math.max(0.05, colAlpha);
    ctx.fillStyle = accent;
    ctx.fillRect(cx - 8, cy - 110, 16, 122);
    ctx.globalAlpha = Math.max(0.08, colAlpha * 1.5);
    ctx.fillRect(cx - 3, cy - 125, 6, 137);

    // Base ring on platform surface
    ctx.globalAlpha = 0.55;
    fillRing(ctx, drop.x, drop.groundY || drop.y + 14, 14 + Math.sin(time * 5) * 2, 10);

    // Iconic Brawlhalla upright Sky-Sword emblem
    ctx.globalAlpha = 1;
    ctx.translate(cx, cy - 8);
    // Blade pointing downward into stage aura
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.moveTo(0, 14);
    ctx.lineTo(-4.2, -3);
    ctx.lineTo(-3, -10);
    ctx.lineTo(3, -10);
    ctx.lineTo(4.2, -3);
    ctx.closePath();
    ctx.fill();

    // Crossguard & pommel
    ctx.fillStyle = accent;
    fillRoundRect(ctx, -8.5, -12.5, 17, 3.6, 1.8);
    ctx.fillRect(-1.8, -19, 3.6, 7);
    fillDiamond(ctx, 0, -20.5, 3.6, 3.6);

    // Orbiting motes
    for (let m = 0; m < 2; m++) {
      const ang = time * 4 + m * Math.PI;
      const ox = Math.cos(ang) * 14;
      const oy = Math.sin(ang) * 5;
      fillDiamond(ctx, ox, oy, 2.5, 2.5);
    }
    ctx.restore();
  }

  function drawWeaponInHand(ctx, weaponId, opts) {
    if (opts && opts.pal && opts.pal.is3D && !opts._is3DShadowPass) {
      ctx.save();
      ctx.globalAlpha = 0.44;
      drawWeaponInHand(ctx, weaponId, {
        ...opts,
        cx: opts.cx - (opts.facing || 1) * 2.6,
        cy: opts.cy - 2.2,
        _is3DShadowPass: true
      });
      ctx.restore();
    }
    const {
      cx,
      cy,
      facing = 1,
      attack = null,
      attackProgress = 0,
      walkPhase = 0,
      pal,
      time = 0
    } = opts;

    const wc = resolveWeaponColors(weaponId, pal);
    const bob = Math.sin(walkPhase * 2 || time * 5) * 1.4;
    let extX = 0;
    let extY = bob;
    let rot = 0;

    if (attack) {
      const swing = Math.sin(Math.min(1, attackProgress) * Math.PI);
      const mv = attack.moveKey;
      if (mv === 'nlight' || mv === 'slight' || mv === 'sair' || mv === 'ssig') {
        extX = swing * 15;
        rot = facing * (-0.35 + swing * 0.95);
      } else if (mv === 'dlight' || mv === 'dsig') {
        extX = swing * 12;
        extY = 6 + swing * 4;
        rot = facing * 0.75 * swing;
      } else if (mv === 'nsig' || mv === 'recovery') {
        extX = swing * 6;
        extY = -swing * 15;
        rot = -facing * (0.85 * swing);
      } else if (mv === 'dair' || mv === 'groundpound') {
        extY = swing * 14;
        rot = facing * 1.25;
      } else if (mv === 'nair') {
        rot = time * 18 * facing;
      }
    }

    ctx.save();
    ctx.translate(cx, cy);

    if (!weaponId || weaponId === 'weapon_fists') {
      // Bare Fists: Twin solid brawler gauntlets flanking the fighter
      const punch = attack ? Math.sin(Math.min(1, attackProgress) * Math.PI) : 0;
      const leadX = facing * (10.5 + punch * 14) + (attack ? 0 : Math.sin(time * 7) * 1.2);
      const leadY = 1.5 + extY * 0.7;
      const rearX = -facing * 7.5 + facing * punch * 4;
      const rearY = 3.2 - bob * 0.6;

      // Rear guard fist
      ctx.fillStyle = wc.secondary;
      fillRoundRect(ctx, rearX - 4.2, rearY - 4.0, 8.4, 8.0, 3.2);
      // Lead striking fist
      ctx.fillStyle = wc.primary;
      const fistR = attack && attack.sig ? 6.2 : 4.8;
      fillRoundRect(ctx, leadX - fistR, leadY - fistR * 0.92, fistR * 2, fistR * 1.84, 3.8);
      // Knuckle band
      ctx.fillStyle = wc.accent;
      fillRoundRect(ctx, leadX + facing * 1.2 - 1.6, leadY - fistR * 0.65, 3.2, fistR * 1.3, 1.5);
      ctx.restore();
      return;
    }

    ctx.translate(facing * (9 + extX * 0.65), 1 + extY * 0.6);
    ctx.scale(facing, 1);
    ctx.rotate(rot * facing);

    if (weaponId === 'weapon_sword') {
      // Broadsword
      ctx.fillStyle = wc.grip;
      fillRoundRect(ctx, -6, -2, 6, 4, 1.5);
      ctx.fillStyle = wc.accent;
      fillRoundRect(ctx, -1, -6.5, 3.5, 13, 1.6);
      ctx.fillStyle = wc.primary;
      ctx.beginPath();
      ctx.moveTo(2.5, -3.6);
      ctx.lineTo(22, -2.4);
      ctx.lineTo(27, 0);
      ctx.lineTo(22, 2.4);
      ctx.lineTo(2.5, 3.6);
      ctx.closePath();
      ctx.fill();
    } else if (weaponId === 'weapon_spear') {
      // Long Spear
      ctx.fillStyle = wc.grip;
      fillRoundRect(ctx, -14, -1.7, 36, 3.4, 1.6);
      ctx.fillStyle = wc.accent;
      fillDiamond(ctx, 20, 0, 3.5, 4.5);
      ctx.fillStyle = wc.primary;
      ctx.beginPath();
      ctx.moveTo(20, -4.4);
      ctx.lineTo(33, 0);
      ctx.lineTo(20, 4.4);
      ctx.lineTo(22.5, 0);
      ctx.closePath();
      ctx.fill();
    } else if (weaponId === 'weapon_katars') {
      // Twin Katars (front + offhand)
      for (const off of [
        { ox: 2, oy: 0, sc: 1 },
        { ox: -16, oy: 2.5, sc: 0.86 }
      ]) {
        ctx.save();
        ctx.translate(off.ox, off.oy);
        ctx.scale(off.sc, off.sc);
        ctx.fillStyle = wc.accent;
        fillRoundRect(ctx, -2, -5.2, 3.2, 10.4, 1.5);
        ctx.fillStyle = wc.primary;
        ctx.beginPath();
        ctx.moveTo(1, -4.5);
        ctx.lineTo(16, 0);
        ctx.lineTo(1, 4.5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    } else if (weaponId === 'weapon_blasters') {
      // Dual Kinetic Pistols
      for (const off of [
        { ox: 3, oy: -1 },
        { ox: -15, oy: 2 }
      ]) {
        ctx.save();
        ctx.translate(off.ox, off.oy);
        ctx.fillStyle = wc.grip;
        fillRoundRect(ctx, -2, 0, 4.5, 7, 1.5);
        ctx.fillStyle = wc.primary;
        fillRoundRect(ctx, -2, -3.5, 13.5, 5.2, 2);
        ctx.fillStyle = wc.accent;
        fillRoundRect(ctx, 9, -2.5, 4, 3.2, 1.2);
        ctx.restore();
      }
    } else if (weaponId === 'weapon_hammer') {
      // Grapple Warhammer
      ctx.fillStyle = wc.grip;
      fillRoundRect(ctx, -10, -2, 28, 4, 1.8);
      ctx.fillStyle = wc.primary;
      fillRoundRect(ctx, 13, -11, 12, 22, 3);
      ctx.fillStyle = wc.accent;
      fillRoundRect(ctx, 16, -12, 6, 24, 2);
    } else if (weaponId === 'weapon_axe') {
      // Rift Cleaver Greataxe
      ctx.fillStyle = wc.grip;
      fillRoundRect(ctx, -10, -2, 28, 4, 1.8);
      ctx.fillStyle = wc.primary;
      ctx.beginPath();
      ctx.moveTo(11, -3);
      ctx.quadraticCurveTo(22, -15, 25, -9);
      ctx.quadraticCurveTo(28, 0, 25, 9);
      ctx.quadraticCurveTo(22, 15, 11, 3);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = wc.accent;
      fillDiamond(ctx, 16, 0, 3.4, 3.4);
    } else if (weaponId === 'weapon_lance') {
      // Rocket Lance
      ctx.fillStyle = wc.accent;
      ctx.beginPath();
      ctx.moveTo(-14, -4.5);
      ctx.lineTo(-6, -6.5);
      ctx.lineTo(-6, 6.5);
      ctx.lineTo(-14, 4.5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = wc.primary;
      ctx.beginPath();
      ctx.moveTo(-6, -7.2);
      ctx.lineTo(8, -5.8);
      ctx.lineTo(31, 0);
      ctx.lineTo(8, 5.8);
      ctx.lineTo(-6, 7.2);
      ctx.closePath();
      ctx.fill();
    } else if (weaponId === 'weapon_scythe') {
      // Phantom Reaper Scythe
      ctx.fillStyle = wc.grip;
      fillRoundRect(ctx, -12, -1.8, 32, 3.6, 1.6);
      ctx.fillStyle = wc.accent;
      fillDiamond(ctx, 18, 0, 3.6, 3.6);
      ctx.fillStyle = wc.primary;
      ctx.beginPath();
      ctx.moveTo(18, -3);
      ctx.quadraticCurveTo(27, 4, 19, 18);
      ctx.quadraticCurveTo(15, 10, 14, 1);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }

  function drawAttackEffect(ctx, fighter, pal, time) {
    const atk = fighter.attack;
    if (!atk) return;
    const mv = atk.def;
    const total = mv.startup + mv.active + mv.endlag;
    const prog = Math.min(1, atk.timer / Math.max(0.01, total));
    const inActive = atk.timer >= mv.startup && atk.timer <= mv.startup + mv.active;
    if (!inActive && !atk.charging) return;

    const wc = resolveWeaponColors(fighter.heldWeapon, pal);
    const fcx = fighter.x + fighter.w * 0.5;
    const fcy = fighter.y + fighter.h * 0.5;

    ctx.save();

    if (atk.charging) {
      // Signature charge ring pulsing under fighter
      const pulse = 15 + Math.sin(time * 22) * 3.5;
      ctx.globalAlpha = 0.65;
      ctx.fillStyle = wc.accent;
      fillRing(ctx, fcx, fcy + fighter.h * 0.45, pulse, pulse - 3.5);
      ctx.restore();
      return;
    }

    const hx = fcx + fighter.facing * mv.ox;
    const hy = fcy + mv.oy;
    ctx.globalAlpha = mv.sig ? 0.78 : 0.55;
    ctx.fillStyle = mv.sig ? wc.accent : wc.primary;

    if (mv.visual === 'blast') {
      // Twin spaced kinetic blasts (Brawlhalla Blasters signature visual!)
      const r1 = mv.rx * (0.58 + Math.sin(prog * Math.PI) * 0.25);
      fillRing(ctx, hx - fighter.facing * 7, hy - 3, r1 * 0.72, r1 * 0.3);
      fillDiamond(ctx, hx + fighter.facing * 5, hy + 2, r1 * 0.85, r1 * 0.65);
    } else if (mv.visual === 'spin') {
      fillRing(ctx, hx, hy, mv.rx * 0.95, mv.rx * 0.62);
    } else if (mv.visual === 'slam') {
      fillCapsule(ctx, hx, hy - mv.ry * 0.6, hx, hy + mv.ry * 0.5, mv.rx * 0.52);
    } else if (mv.visual === 'burst') {
      fillCapsule(ctx, hx - mv.rx * 0.85, hy, hx + mv.rx * 0.85, hy, mv.ry * 0.55);
    } else {
      // Crescent slash / punch shockwave cone
      ctx.translate(hx, hy);
      ctx.scale(fighter.facing, 1);
      ctx.beginPath();
      ctx.moveTo(-mv.rx * 0.55, -mv.ry * 0.78);
      ctx.quadraticCurveTo(mv.rx * 0.95, -mv.ry * 0.25, mv.rx * 0.95, 0);
      ctx.quadraticCurveTo(mv.rx * 0.95, mv.ry * 0.25, -mv.rx * 0.55, mv.ry * 0.78);
      ctx.quadraticCurveTo(mv.rx * 0.35, 0, -mv.rx * 0.55, -mv.ry * 0.78);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }

  function drawThrownWeapon(ctx, proj, pal, time) {
    const wc = resolveWeaponColors(proj.weaponId, pal);
    if (pal && pal.is3D && window.Exotic3D) {
      ctx.save();
      ctx.translate(proj.x + 2.8, proj.y - 2.4);
      ctx.rotate(time * 18 * (proj.vx >= 0 ? 1 : -1));
      ctx.fillStyle = window.Exotic3D.shadeFace(wc.primary, 'side', pal);
      fillRing(ctx, 0, 0, 14, 10.5);
      fillRoundRect(ctx, -11, -3, 22, 6, 2.5);
      ctx.restore();
    }
    ctx.save();
    ctx.translate(proj.x, proj.y);
    ctx.rotate(time * 18 * (proj.vx >= 0 ? 1 : -1));
    ctx.fillStyle = wc.accent;
    fillRing(ctx, 0, 0, 14, 10.5);
    ctx.fillStyle = wc.primary;
    fillRoundRect(ctx, -11, -3, 22, 6, 2.5);
    fillDiamond(ctx, 0, 0, 5, 9);
    ctx.restore();
  }

  function drawBlastExplosion(ctx, blast, viewW, viewH, pal) {
    const t = 1 - blast.timer / blast.maxTimer;
    const alpha = Math.max(0, 1 - t * t);
    const fill = pal.colored ? blast.color || '#f97316' : pal.playerPrimary;
    const core = pal.colored ? '#ffffff' : pal.playerSecondary;

    ctx.save();
    ctx.globalAlpha = alpha * 0.88;
    ctx.fillStyle = fill;

    const spread = 42 * (1 - t * 0.55);
    const len = 320 * Math.sin(Math.min(1, t * 2.2) * Math.PI * 0.5);

    if (blast.side === 'left') {
      ctx.beginPath();
      ctx.moveTo(0, blast.sy - spread);
      ctx.lineTo(len, blast.sy);
      ctx.lineTo(0, blast.sy + spread);
      ctx.closePath();
      ctx.fill();
    } else if (blast.side === 'right') {
      ctx.beginPath();
      ctx.moveTo(viewW, blast.sy - spread);
      ctx.lineTo(viewW - len, blast.sy);
      ctx.lineTo(viewW, blast.sy + spread);
      ctx.closePath();
      ctx.fill();
    } else if (blast.side === 'top') {
      ctx.beginPath();
      ctx.moveTo(blast.sx - spread, 0);
      ctx.lineTo(blast.sx, len);
      ctx.lineTo(blast.sx + spread, 0);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(blast.sx - spread, viewH);
      ctx.lineTo(blast.sx, viewH - len);
      ctx.lineTo(blast.sx + spread, viewH);
      ctx.closePath();
      ctx.fill();
    }

    ctx.globalAlpha = alpha * 0.65;
    ctx.fillStyle = core;
    fillRing(
      ctx,
      Math.max(24, Math.min(viewW - 24, blast.sx)),
      Math.max(24, Math.min(viewH - 24, blast.sy)),
      38 * t + 10,
      28 * t + 4
    );
    ctx.restore();
  }

  // Shop / Lobby 60fps Map Preview Renderer
  function renderMapCardPreview(ctx, dim, mapId, time, pal) {
    const map = window.ExoticBrawlData.getMapById(mapId);
    const platforms = window.ExoticBrawlData.evaluateMapPlatforms(map, time);

    drawBrawlBackdrop(ctx, map, dim.w, dim.h, time, pal);

    const scale = Math.min(dim.w / 960, dim.h / 540) * 1.08;
    const ox = (dim.w - 960 * scale) * 0.5;
    const oy = (dim.h - 540 * scale) * 0.5 + 8;

    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(scale, scale);

    drawBrawlStageWorld(ctx, map, platforms, time, pal);

    // Sky-drop weapon beacon at first dropZone
    if (map.dropZones && map.dropZones[0]) {
      const dz = map.dropZones[0];
      drawSkyDropBeacon(ctx, { x: dz.x, y: dz.y, groundY: dz.y + 18, seed: 1.2 }, pal, time);
    }

    // Two miniature fighters actively sparring across the stage
    const s0 = map.spawns[0] || { x: 340, y: 310 };
    const s1 = map.spawns[1] || { x: 620, y: 310 };
    const midX = (s0.x + s1.x) * 0.5;
    const wave = Math.sin(time * 2.5);
    const f1x = midX - 48 + wave * 34;
    const f2x = midX + 26 - wave * 34;
    const f1y = s0.y - Math.abs(Math.sin(time * 4.2)) * 28;
    const f2y = s1.y - Math.abs(Math.cos(time * 3.7)) * 22;

    const eq = window.ExoticStorage.getState().equipped;
    window.ExoticCharacterRenderer.draw(ctx, {
      x: f1x,
      y: f1y,
      w: 22,
      h: 26,
      vx: Math.cos(time * 2.5) * 160,
      vy: 0,
      onGround: true,
      facing: 1,
      walkPhase: time * 7,
      time,
      characterId: eq.character || 'char_classic',
      skinId: eq.skin || 'skin_solid',
      palette: pal
    });
    drawWeaponInHand(ctx, eq.brawlWeapon || 'weapon_fists', {
      cx: f1x + 11,
      cy: f1y + 13,
      facing: 1,
      attack: Math.sin(time * 6) > 0.35 ? { moveKey: 'slight', sig: false } : null,
      attackProgress: (time * 3) % 1,
      pal,
      time
    });

    window.ExoticCharacterRenderer.draw(ctx, {
      x: f2x,
      y: f2y,
      w: 22,
      h: 26,
      vx: -Math.cos(time * 2.5) * 160,
      vy: 0,
      onGround: true,
      facing: -1,
      walkPhase: time * 7 + 1,
      time,
      characterId: 'char_scream',
      skinId: 'skin_solid',
      palette: pal
    });
    drawWeaponInHand(ctx, 'weapon_fists', {
      cx: f2x + 11,
      cy: f2y + 13,
      facing: -1,
      attack: Math.cos(time * 6) > 0.45 ? { moveKey: 'nlight', sig: false } : null,
      attackProgress: (time * 2.7 + 0.4) % 1,
      pal,
      time
    });

    ctx.restore();
  }

  // Shop 60fps Weapon Preview Renderer (equipped Character showcasing that Brawl Weapon!)
  function renderWeaponCardPreview(ctx, dim, weaponId, time, pal, norm) {
    const eq = window.ExoticStorage.getState().equipped;
    const map = window.ExoticBrawlData.getMapById(eq.brawlMap || 'brawl_map_haven');
    drawBrawlBackdrop(ctx, map, dim.w, dim.h, time, pal);

    const floorY = dim.h * 0.77;
    const ap = resolveArenaPalette(map, pal);
    if (pal && pal.is3D && window.Exotic3D) {
      window.Exotic3D.drawExtrudedBox(ctx, 18, floorY + 6, dim.w - 36, 26, {
        palette: pal,
        vanishX: dim.w * 0.5,
        depth: 14,
        frontColor: ap.islandUnder,
        radius: 6,
        castShadow: false
      });
      window.Exotic3D.drawExtrudedBox(ctx, 14, floorY, dim.w - 28, 16, {
        palette: pal,
        vanishX: dim.w * 0.5,
        depth: 18,
        frontColor: ap.island,
        capColor: ap.cap,
        radius: 5,
        castShadow: false
      });
      ctx.fillStyle = ap.cap;
      fillRoundRect(ctx, 14, floorY, dim.w - 28, 4.5, 2.5);
    } else {
      ctx.fillStyle = ap.islandUnder;
      fillRoundRect(ctx, 18, floorY + 6, dim.w - 36, 26, 6);
      ctx.fillStyle = ap.island;
      fillRoundRect(ctx, 14, floorY, dim.w - 28, 16, 5);
      ctx.fillStyle = ap.cap;
      fillRoundRect(ctx, 14, floorY, dim.w - 28, 4.5, 2.5);
    }

    const wDef = window.ExoticBrawlData.getWeaponById(weaponId);
    const cycle = norm * 3; // 3 distinct combo beats across loop
    const beat = Math.floor(cycle);
    const beatT = cycle - beat;
    const moveKeys = ['slight', 'dlight', 'ssig'];
    const curMoveKey = moveKeys[beat % 3];
    const mv = wDef.moves[curMoveKey];

    const lunge = Math.sin(beatT * Math.PI) * 18;
    const hop = curMoveKey === 'ssig' ? Math.sin(beatT * Math.PI) * 14 : 0;
    const px = dim.w * 0.34 + lunge - 11;
    const py = floorY - 26 - hop;

    const fakeFighter = {
      x: px,
      y: py,
      w: 22,
      h: 26,
      facing: 1,
      heldWeapon: weaponId,
      attack:
        beatT > 0.15 && beatT < 0.78
          ? {
              moveKey: curMoveKey,
              def: mv,
              sig: Boolean(mv.sig),
              timer: mv.startup + (beatT - 0.15) * mv.active
            }
          : null
    };

    window.ExoticCharacterRenderer.draw(ctx, {
      x: px,
      y: py,
      w: 22,
      h: 26,
      vx: 140,
      vy: 0,
      onGround: hop < 1,
      facing: 1,
      walkPhase: time * 6,
      time,
      characterId: eq.character || 'char_classic',
      skinId: eq.skin || 'skin_solid',
      palette: pal
    });

    drawWeaponInHand(ctx, weaponId, {
      cx: px + 11,
      cy: py + 13,
      facing: 1,
      attack: fakeFighter.attack,
      attackProgress: beatT,
      walkPhase: time * 6,
      pal,
      time
    });
    drawAttackEffect(ctx, fakeFighter, pal, time);

    // Sparring dummy reacting with Brawlhalla knockback & damage flashes
    const hitActive = beatT > 0.28 && beatT < 0.75;
    const knock = hitActive ? Math.sin(((beatT - 0.28) / 0.47) * Math.PI) : 0;
    const dx = dim.w * 0.64 + knock * (curMoveKey === 'ssig' ? 32 : 16) - 11;
    const dy = floorY - 26 - knock * (curMoveKey === 'dlight' ? 24 : 10);

    if (hitActive && beatT < 0.45) {
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = pal.colored ? wDef.coloredAccent : pal.playerPrimary;
      fillRing(ctx, dx + 11, dy + 13, 18, 13);
      ctx.globalAlpha = 1;
    }

    window.ExoticCharacterRenderer.draw(ctx, {
      x: dx,
      y: dy,
      w: 22,
      h: 26,
      vx: -knock * 90,
      vy: 0,
      onGround: knock < 0.1,
      facing: -1,
      walkPhase: 0,
      time,
      characterId: 'char_knight',
      skinId: 'skin_solid',
      palette: pal
    });

    // If previewing a Sky-Drop Shop Weapon (non-Fists), show subtle mini sky-drop icon at far left
    if (weaponId !== 'weapon_fists') {
      drawSkyDropBeacon(
        ctx,
        { x: dim.w * 0.15, y: floorY - 12, groundY: floorY, seed: 0.4 },
        pal,
        time
      );
    }
  }

  window.ExoticBrawlRenderer = {
    fillCapsule,
    fillDiamond,
    fillRing,
    fillRoundRect,
    resolveArenaPalette,
    resolveWeaponColors,
    drawBrawlBackdrop,
    drawBrawlStageWorld,
    drawSkyDropBeacon,
    drawWeaponInHand,
    drawAttackEffect,
    drawThrownWeapon,
    drawBlastExplosion,
    renderMapCardPreview,
    renderWeaponCardPreview
  };
})();
