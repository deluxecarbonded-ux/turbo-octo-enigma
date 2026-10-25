(function () {
  function drawSign(ctx, sign, pal) {
    const text = sign.triggered ? sign.after : sign.before;
    const w = sign.w || 124;
    const h = sign.h || 34;
    const x = sign.x - w * 0.5;
    const y = sign.y - h * 0.5;

    ctx.save();
    // Sign post
    ctx.fillStyle = pal.bgPillarAlt;
    ctx.fillRect(sign.x - 3, y + h, 6, 38);

    // Solid monochrome sign board (inverts when triggered for comedic punch!)
    ctx.fillStyle = sign.triggered ? pal.platform : pal.bgPillarAlt;
    window.ExoticCharacterRenderer.fillRoundRect(ctx, x, y, w, h, 8);

    ctx.fillStyle = sign.triggered ? pal.playerSecondary : pal.textMuted;
    ctx.font = '800 11px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, sign.x, sign.y + 0.5);
    ctx.restore();
  }

  function drawFakeCheckpoint(ctx, cp, pal, time) {
    ctx.save();
    const poleH = 46;
    // Flag pole
    ctx.fillStyle = pal.platform;
    ctx.fillRect(cp.x - 2, cp.y - poleH, 4, poleH);
    ctx.beginPath();
    ctx.arc(cp.x, cp.y - poleH - 2, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Waving pennant flag
    const wave = Math.sin(time * 7) * 2.5;
    ctx.fillStyle = cp.triggered ? pal.hazard : pal.platformCap;
    ctx.beginPath();
    ctx.moveTo(cp.x + 2, cp.y - poleH + 2);
    ctx.lineTo(cp.x + 30, cp.y - poleH + 9 + wave);
    ctx.lineTo(cp.x + 2, cp.y - poleH + 18);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = pal.playerSecondary;
    ctx.font = '800 7px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(cp.triggered ? 'LIE' : 'SAVE', cp.x + 4, cp.y - poleH + 12);
    ctx.restore();
  }

  function drawChaserWall(ctx, wall, pal) {
    if (!wall || !wall.active) return;
    ctx.save();
    ctx.fillStyle = pal.platform;
    ctx.fillRect(wall.x - wall.w, 0, wall.w, 540);

    // Sawtooth spike wall teeth along right leading edge
    const toothH = 24;
    ctx.fillStyle = pal.hazard;
    for (let ty = 0; ty < 540; ty += toothH) {
      ctx.beginPath();
      ctx.moveTo(wall.x, ty);
      ctx.lineTo(wall.x + 15, ty + toothH * 0.5);
      ctx.lineTo(wall.x, ty + toothH);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPlatform(ctx, p, pal, showTrapRadar, time) {
    if (p.hiddenUntilReveal && !p.revealed) return;
    if (p.troll && p.troll.type === 'hidden_solid' && !p.revealed) {
      if (showTrapRadar) {
        ctx.save();
        ctx.globalAlpha = 0.14 + Math.abs(Math.sin(time * 5)) * 0.14;
        ctx.fillStyle = pal.trapHint;
        ctx.fillRect(p.x, p.y, p.w, p.h);
        ctx.restore();
      }
      return;
    }

    ctx.fillStyle = pal.platform;
    ctx.fillRect(p.x, p.y, p.w, p.h);

    // Solid contrasting surface cap (no border, pure tonal top strip)
    ctx.fillStyle = pal.platformCap;
    const capH = Math.min(4, p.h * 0.25);
    ctx.fillRect(p.x, p.y, p.w, capH);

    // Subtle interior architectural notches
    ctx.fillStyle = pal.platformDetail;
    const step = 44;
    for (let nx = p.x + 14; nx < p.x + p.w - 14; nx += step) {
      ctx.fillRect(nx, p.y + capH + 5, 10, 3);
    }

    // Smug troll face appears on trap blocks once they've betrayed you!
    if (p.triggered && p.w >= 40 && p.h >= 20) {
      const cx = p.x + p.w * 0.5;
      const cy = p.y + Math.min(20, p.h * 0.52);
      ctx.fillStyle = pal.playerSecondary;
      ctx.fillRect(cx - 8, cy - 3, 4, 2.5);
      ctx.fillRect(cx + 4, cy - 3, 4, 2.5);
      ctx.fillRect(cx - 5, cy + 3, 10, 2);
    }

    // Trap Instinct Upgrade pulse tick
    if (showTrapRadar && p.troll && !p.triggered) {
      ctx.save();
      ctx.globalAlpha = 0.35 + Math.abs(Math.sin(time * 7)) * 0.45;
      ctx.fillStyle = pal.playerSecondary;
      const cx = p.x + p.w * 0.5;
      window.ExoticCharacterRenderer.fillDiamond(ctx, cx, p.y + Math.min(14, p.h * 0.5), 4, 4);
      ctx.restore();
    }
  }

  function drawSpikes(ctx, sp, pal, showTrapRadar, time) {
    const toothW = 18;
    const toothH = 16;
    const progress = typeof sp.popProgress === 'number' ? sp.popProgress : sp.hidden ? 0 : 1;

    if (progress <= 0.02) {
      if (showTrapRadar && sp.hidden) {
        ctx.save();
        ctx.globalAlpha = 0.32 + Math.abs(Math.sin(time * 8)) * 0.3;
        ctx.fillStyle = pal.trapHint;
        const totalW = sp.count * toothW;
        ctx.fillRect(sp.x, sp.y - 3, totalW, 6);
        ctx.restore();
      }
      return;
    }

    const h = toothH * progress;
    for (let i = 0; i < sp.count; i++) {
      const bx = sp.x + i * toothW;
      ctx.fillStyle = pal.hazard;
      ctx.beginPath();
      if (sp.dir === 'down') {
        ctx.moveTo(bx, sp.y);
        ctx.lineTo(bx + toothW, sp.y);
        ctx.lineTo(bx + toothW * 0.5, sp.y + h);
      } else {
        ctx.moveTo(bx, sp.y);
        ctx.lineTo(bx + toothW, sp.y);
        ctx.lineTo(bx + toothW * 0.5, sp.y - h);
      }
      ctx.closePath();
      ctx.fill();

      // Inner tonal facet
      ctx.fillStyle = pal.hazardInner;
      ctx.beginPath();
      if (sp.dir === 'down') {
        ctx.moveTo(bx + toothW * 0.5, sp.y + 2);
        ctx.lineTo(bx + toothW - 3, sp.y + 2);
        ctx.lineTo(bx + toothW * 0.5, sp.y + h - 2);
      } else {
        ctx.moveTo(bx + toothW * 0.5, sp.y - 2);
        ctx.lineTo(bx + toothW - 3, sp.y - 2);
        ctx.lineTo(bx + toothW * 0.5, sp.y - h + 2);
      }
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawCrusher(ctx, cr, pal) {
    if (cr.y + cr.h < -8) return;
    ctx.fillStyle = pal.platform;
    ctx.fillRect(cr.x, cr.y, cr.w, cr.h);

    // Warning teeth along bottom edge
    const teeth = Math.max(2, Math.floor(cr.w / 16));
    const tw = cr.w / teeth;
    ctx.fillStyle = pal.hazard;
    for (let i = 0; i < teeth; i++) {
      const tx = cr.x + i * tw;
      ctx.beginPath();
      ctx.moveTo(tx, cr.y + cr.h);
      ctx.lineTo(tx + tw, cr.y + cr.h);
      ctx.lineTo(tx + tw * 0.5, cr.y + cr.h + 9);
      ctx.closePath();
      ctx.fill();
    }

    // Angry geometric eyes inside crusher block
    ctx.fillStyle = pal.playerSecondary;
    const cy = cr.y + cr.h * 0.52;
    const cx = cr.x + cr.w * 0.5;
    ctx.beginPath();
    ctx.moveTo(cx - 14, cy - 5);
    ctx.lineTo(cx - 4, cy - 1);
    ctx.lineTo(cx - 14, cy + 2);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(cx + 14, cy - 5);
    ctx.lineTo(cx + 4, cy - 1);
    ctx.lineTo(cx + 14, cy + 2);
    ctx.closePath();
    ctx.fill();
  }

  function drawSaw(ctx, saw, pal, time) {
    const { fillRing } = window.ExoticCharacterRenderer;
    ctx.save();
    ctx.translate(saw.x, saw.y);
    const spinSpeed = saw.awake === false && !saw.patrolDY && !saw.patrolDX ? 1.2 : 9.5;
    ctx.rotate(time * spinSpeed);

    const teeth = 10;
    const r = saw.r;
    ctx.fillStyle = pal.hazard;
    ctx.beginPath();
    for (let i = 0; i < teeth * 2; i++) {
      const rad = i % 2 === 0 ? r + 4 : r - 3;
      const a = (i * Math.PI) / teeth;
      const px = Math.cos(a) * rad;
      const py = Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = pal.playerSecondary;
    fillRing(ctx, 0, 0, r * 0.48, r * 0.2);
    ctx.restore();
  }

  function drawSpring(ctx, spr, pal) {
    const comp = spr.compress || 0;
    ctx.fillStyle = pal.springBase;
    ctx.fillRect(spr.x + 4, spr.y + 5 + comp * 4, spr.w - 8, spr.h - 5 - comp * 4);
    ctx.fillStyle = pal.springTop;
    ctx.fillRect(spr.x, spr.y + comp * 5, spr.w, 5);
  }

  function drawGravityZone(ctx, gz, pal, time) {
    ctx.save();
    ctx.fillStyle = pal.gravityZone;
    ctx.fillRect(gz.x, gz.y, gz.w, gz.h);

    ctx.fillStyle = pal.auraSoft;
    ctx.globalAlpha = 0.28;
    const dir = gz.gravitySign < 0 ? -1 : 1;
    for (let i = 0; i < 5; i++) {
      const cycle = (time * 0.8 + i * 0.2) % 1;
      const py = dir < 0 ? gz.y + gz.h - cycle * gz.h : gz.y + cycle * gz.h;
      const cx = gz.x + gz.w * 0.5;
      ctx.beginPath();
      ctx.moveTo(cx - 8, py - dir * 4);
      ctx.lineTo(cx, py + dir * 4);
      ctx.lineTo(cx + 8, py - dir * 4);
      ctx.lineTo(cx + 8, py - dir * 1);
      ctx.lineTo(cx, py + dir * 7);
      ctx.lineTo(cx - 8, py - dir * 1);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawCoin(ctx, c, pal, time) {
    if (c.collected) return;
    const { fillDiamond } = window.ExoticCharacterRenderer;
    const spin = Math.max(0.22, Math.abs(Math.cos(time * 4.5 + c.x * 0.02)));
    const bob = Math.sin(time * 3.8 + c.x * 0.05) * 2.5;
    ctx.save();
    ctx.translate(c.x, c.y + bob);
    ctx.scale(spin, 1);

    ctx.fillStyle = pal.coinOuter;
    ctx.beginPath();
    ctx.arc(0, 0, 8.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = pal.coinInner;
    fillDiamond(ctx, 0, 0, 4.2, 5.2);
    ctx.restore();
  }

  function drawSkillOrb(ctx, orb, alreadyOwned, pal, time) {
    if (!orb || orb.collected || alreadyOwned) return;
    const { fillRing, fillDiamond } = window.ExoticCharacterRenderer;
    const bob = Math.sin(time * 3.2) * 3.5;
    ctx.save();
    ctx.translate(orb.x, orb.y + bob);

    ctx.fillStyle = pal.skillOuter;
    fillRing(ctx, 0, 0, 12.5, 9.5);
    ctx.rotate(time * 2.2);
    fillDiamond(ctx, 0, 0, 6.5, 6.5);
    ctx.fillStyle = pal.coinInner;
    fillDiamond(ctx, 0, 0, 2.5, 2.5);
    ctx.restore();
  }

  function drawDoor(ctx, d, pal, time) {
    if (d.hiddenUntilReveal && !d.revealed) return;
    if (d.vanished) return;

    const w = d.w || 38;
    const h = d.h || 54;
    const archR = w * 0.5;

    ctx.save();
    ctx.fillStyle = pal.doorFrame;
    ctx.beginPath();
    ctx.arc(d.x + archR, d.y + archR, archR, Math.PI, 0);
    ctx.lineTo(d.x + w, d.y + h);
    ctx.lineTo(d.x, d.y + h);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = pal.doorVoid;
    const pad = 4.5;
    ctx.beginPath();
    ctx.arc(d.x + archR, d.y + archR + 1, archR - pad, Math.PI, 0);
    ctx.lineTo(d.x + w - pad, d.y + h);
    ctx.lineTo(d.x + pad, d.y + h);
    ctx.closePath();
    ctx.fill();

    const pulse = 5 + Math.sin(time * 5) * 1.6;
    ctx.fillStyle = pal.doorFrame;
    window.ExoticCharacterRenderer.fillDiamond(ctx, d.x + archR, d.y + h * 0.56, pulse, pulse * 1.35);
    ctx.restore();
  }

  window.ExoticWorldDraw = {
    drawSign,
    drawFakeCheckpoint,
    drawChaserWall,
    drawPlatform,
    drawSpikes,
    drawCrusher,
    drawSaw,
    drawSpring,
    drawGravityZone,
    drawCoin,
    drawSkillOrb,
    drawDoor
  };
})();
