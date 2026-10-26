(function () {
  function drawFourPointStar(ctx, x, y, r, rot = 0) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    const inner = r * 0.26;
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(inner, -inner);
    ctx.lineTo(r, 0);
    ctx.lineTo(inner, inner);
    ctx.lineTo(0, r);
    ctx.lineTo(-inner, inner);
    ctx.lineTo(-r, 0);
    ctx.lineTo(-inner, -inner);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawBatSilhouette(ctx, x, y, scale, flapPhase) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    const flap = Math.sin(flapPhase) * 5.5;

    // Center body + ears
    ctx.beginPath();
    ctx.moveTo(-2, -3);
    ctx.lineTo(-1, -5.5);
    ctx.lineTo(0, -3.5);
    ctx.lineTo(1, -5.5);
    ctx.lineTo(2, -3);
    ctx.lineTo(2.2, 2.5);
    ctx.lineTo(0, 4.2);
    ctx.lineTo(-2.2, 2.5);
    ctx.closePath();
    ctx.fill();

    // Left articulated bat wing
    ctx.beginPath();
    ctx.moveTo(-1.5, -1.5);
    ctx.lineTo(-8, -4.5 - flap);
    ctx.lineTo(-12.5, -1 - flap * 0.8);
    ctx.lineTo(-9, 1.5 - flap * 0.35);
    ctx.lineTo(-5.5, 0.8 - flap * 0.2);
    ctx.lineTo(-3, 2.5);
    ctx.closePath();
    ctx.fill();

    // Right articulated bat wing
    ctx.beginPath();
    ctx.moveTo(1.5, -1.5);
    ctx.lineTo(8, -4.5 - flap);
    ctx.lineTo(12.5, -1 - flap * 0.8);
    ctx.lineTo(9, 1.5 - flap * 0.35);
    ctx.lineTo(5.5, 0.8 - flap * 0.2);
    ctx.lineTo(3, 2.5);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  function drawButterflySilhouette(ctx, x, y, scale, flutterPhase, tilt) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);
    const wingSpan = 0.28 + Math.abs(Math.cos(flutterPhase)) * 0.85;
    ctx.scale(scale * wingSpan, scale);

    // Left upper + lower wing
    ctx.beginPath();
    ctx.moveTo(-0.8, -1);
    ctx.quadraticCurveTo(-9, -9, -9.5, -1.5);
    ctx.quadraticCurveTo(-8, 2, -1.2, 0.8);
    ctx.quadraticCurveTo(-7.5, 4, -6, 7.5);
    ctx.quadraticCurveTo(-2, 7, -0.6, 2.5);
    ctx.closePath();
    ctx.fill();

    // Right upper + lower wing
    ctx.beginPath();
    ctx.moveTo(0.8, -1);
    ctx.quadraticCurveTo(9, -9, 9.5, -1.5);
    ctx.quadraticCurveTo(8, 2, 1.2, 0.8);
    ctx.quadraticCurveTo(7.5, 4, 6, 7.5);
    ctx.quadraticCurveTo(2, 7, 0.6, 2.5);
    ctx.closePath();
    ctx.fill();

    // Thorax
    ctx.scale(1 / Math.max(0.25, wingSpan), 1);
    ctx.fillRect(-0.9, -4.2, 1.8, 8.2);
    ctx.restore();
  }

  function drawFeatherSilhouette(ctx, x, y, scale, rot) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(scale, scale);
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.quadraticCurveTo(4.2, -2, 2.2, 5.5);
    ctx.lineTo(0, 8);
    ctx.lineTo(-2.2, 5.5);
    ctx.quadraticCurveTo(-4.2, -2, 0, -8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function fillEllipseRingHalf(ctx, cx, cy, rx, ry, thickness, tilt, backHalf) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(tilt);
    const start = backHalf ? Math.PI : 0;
    const end = backHalf ? Math.PI * 2 : Math.PI;
    const steps = 20;
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const a = start + ((end - start) * i) / steps;
      const px = Math.cos(a) * rx;
      const py = Math.sin(a) * ry;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    for (let i = steps; i >= 0; i--) {
      const a = start + ((end - start) * i) / steps;
      const px = Math.cos(a) * (rx - thickness);
      const py = Math.sin(a) * Math.max(1, ry - thickness * 0.55);
      ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function resolveAuraColors(auraId, pal) {
    if (!pal || !pal.colored) {
      return {
        bright: pal.auraBright,
        soft: pal.auraSoft,
        dim: pal.auraDim,
        alt: pal.auraSoft
      };
    }
    const isLight = pal.mode === 'light';
    switch (auraId) {
      case 'aura_sparkle':
        return isLight
          ? { bright: '#f59e0b', soft: '#0891b2', dim: '#7c3aed', alt: '#ec4899' }
          : { bright: '#fbbf24', soft: '#38bdf8', dim: '#c084fc', alt: '#f472b6' };
      case 'aura_bat':
        return isLight
          ? { bright: '#7c3aed', soft: '#e11d48', dim: '#e11d48', alt: '#4f46e5' }
          : { bright: '#a855f7', soft: '#fb7185', dim: '#f43f5e', alt: '#818cf8' };
      case 'aura_butterfly':
        return isLight
          ? { bright: '#db2777', soft: '#0891b2', dim: '#d97706', alt: '#7c3aed' }
          : { bright: '#f472b6', soft: '#22d3ee', dim: '#fbbf24', alt: '#c084fc' };
      case 'aura_feather':
        return isLight
          ? { bright: '#0284c7', soft: '#eab308', dim: '#6366f1', alt: '#06b6d4' }
          : { bright: '#38bdf8', soft: '#fde047', dim: '#818cf8', alt: '#67e8f9' };
      case 'aura_vortex':
        return isLight
          ? { bright: '#7c3aed', soft: '#0891b2', dim: '#4f46e5', alt: '#e11d48' }
          : { bright: '#c084fc', soft: '#22d3ee', dim: '#6366f1', alt: '#f472b6' };
      case 'aura_crown':
        return isLight
          ? { bright: '#d97706', soft: '#f59e0b', dim: '#f59e0b', alt: '#e11d48' }
          : { bright: '#fbbf24', soft: '#fde047', dim: '#f59e0b', alt: '#fb7185' };
      case 'aura_eclipse':
        return isLight
          ? { bright: '#ea580c', soft: '#7c3aed', dim: '#d97706', alt: '#eab308' }
          : { bright: '#fb923c', soft: '#c084fc', dim: '#f59e0b', alt: '#fde047' };
      default:
        return {
          bright: pal.auraBright,
          soft: pal.auraSoft,
          dim: pal.auraDim,
          alt: pal.auraSoft
        };
    }
  }

  function renderLayer(ctx, auraId, cx, cy, time, pal, isFront) {
    if (!auraId || auraId === 'aura_none') return;
    const { fillRing, fillDiamond } = window.ExoticCharacterRenderer;
    const isColored = Boolean(pal && pal.colored);

    // Exact untouched original Monochrome Aura rendering when Monochrome is active
    if (!isColored) {
      ctx.save();
      if (auraId === 'aura_sparkle') {
        if (!isFront) {
          ctx.globalAlpha = 0.22;
          ctx.fillStyle = pal.auraSoft;
          const pulse = 18 + Math.sin(time * 4) * 3;
          fillEllipseRingHalf(ctx, cx, cy + 14, pulse, 5.5, 2, 0, true);
        } else {
          ctx.globalAlpha = 0.28;
          ctx.fillStyle = pal.auraSoft;
          const pulse = 18 + Math.sin(time * 4) * 3;
          fillEllipseRingHalf(ctx, cx, cy + 14, pulse, 5.5, 2, 0, false);
        }

        for (let i = 0; i < 8; i++) {
          const angle = time * 2.2 + i * 0.785;
          const depth = Math.sin(angle);
          if ((isFront && depth < 0) || (!isFront && depth >= 0)) continue;
          const lift = ((time * 26 + i * 11) % 38) - 19;
          const sx = cx + Math.cos(angle) * (20 + (i % 3) * 4);
          const sy = cy - lift * 0.85;
          const twinkle = 0.4 + Math.abs(Math.sin(time * 5 + i * 1.7)) * 0.6;
          ctx.globalAlpha = twinkle * (isFront ? 0.95 : 0.55);
          ctx.fillStyle = i % 2 === 0 ? pal.auraBright : pal.auraSoft;
          drawFourPointStar(ctx, sx, sy, (3.2 + (i % 3) * 1.4) * twinkle, time * 1.5 + i);
        }
      } else if (auraId === 'aura_bat') {
        if (!isFront) {
          ctx.fillStyle = pal.auraDim;
          for (let m = 0; m < 6; m++) {
            const prog = (time * 0.65 + m * 0.17) % 1;
            ctx.globalAlpha = (1 - prog) * 0.45;
            const mx = cx + Math.sin(time * 2 + m * 2.1) * 18;
            const my = cy + 14 - prog * 40;
            fillDiamond(ctx, mx, my, 2.2, 2.2);
          }
        }
        for (let i = 0; i < 6; i++) {
          const a = time * 2.6 + (i * Math.PI * 2) / 6;
          const depth = Math.sin(a);
          if ((isFront && depth < 0) || (!isFront && depth >= 0)) continue;
          const bx = cx + Math.cos(a) * 29;
          const by = cy + Math.sin(a * 2) * 9 - 2;
          const sc = 0.62 + (depth + 1) * 0.22;
          ctx.globalAlpha = isFront ? 0.95 : 0.52;
          ctx.fillStyle = pal.auraBright;
          drawBatSilhouette(ctx, bx, by, sc, time * 17 + i * 1.3);
        }
      } else if (auraId === 'aura_butterfly') {
        if (!isFront) {
          const ringProg = (time * 0.7) % 1;
          ctx.globalAlpha = (1 - ringProg) * 0.35;
          ctx.fillStyle = pal.auraSoft;
          fillEllipseRingHalf(ctx, cx, cy + 14, 12 + ringProg * 18, 4 + ringProg * 4, 2, 0, true);
        }
        for (let i = 0; i < 6; i++) {
          const a = time * 1.9 + (i * Math.PI * 2) / 6;
          const depth = Math.sin(a);
          if ((isFront && depth < 0) || (!isFront && depth >= 0)) continue;
          const cycle = (time * 0.45 + i * 0.16) % 1;
          const bx = cx + Math.cos(a) * (18 + Math.sin(cycle * Math.PI) * 9);
          const by = cy + 15 - cycle * 38;
          const sc = 0.58 + (depth + 1) * 0.18;
          ctx.globalAlpha = Math.sin(cycle * Math.PI) * (isFront ? 0.95 : 0.55);
          ctx.fillStyle = i % 2 === 0 ? pal.auraBright : pal.auraSoft;
          drawButterflySilhouette(ctx, bx, by, sc, time * 13 + i * 1.1, Math.cos(a) * 0.25);
        }
      } else if (auraId === 'aura_feather') {
        const wave = (time * 0.8) % 1;
        ctx.fillStyle = pal.auraSoft;
        ctx.globalAlpha = (1 - wave) * 0.4;
        fillEllipseRingHalf(ctx, cx, cy + 14, 10 + wave * 22, 3.5 + wave * 5, 2.2, 0, !isFront);

        for (let i = 0; i < 7; i++) {
          const a = time * 2.1 + i * 0.9;
          const depth = Math.sin(a);
          if ((isFront && depth < 0) || (!isFront && depth >= 0)) continue;
          const drift = (time * 0.5 + i * 0.14) % 1;
          const fx = cx + Math.cos(a) * 24;
          const fy = cy + 16 - drift * 40;
          ctx.globalAlpha = Math.sin(drift * Math.PI) * (isFront ? 0.92 : 0.5);
          ctx.fillStyle = pal.auraBright;
          drawFeatherSilhouette(ctx, fx, fy, 0.78, Math.sin(time * 3 + i) * 0.6 + 0.4);
        }
      } else if (auraId === 'aura_vortex') {
        for (let r = 0; r < 2; r++) {
          const p = (time * 0.9 + r * 0.5) % 1;
          ctx.globalAlpha = (1 - p) * 0.48;
          ctx.fillStyle = pal.auraBright;
          fillEllipseRingHalf(ctx, cx, cy + 14, 8 + p * 26, 3 + p * 6, 2.4, 0, !isFront);
        }
        for (let i = 0; i < 7; i++) {
          const a = -time * 3.1 + (i * Math.PI * 2) / 7;
          const depth = Math.sin(a);
          if ((isFront && depth < 0) || (!isFront && depth >= 0)) continue;
          const sx = cx + Math.cos(a) * 25;
          const sy = cy + Math.sin(a * 2 + i) * 8;
          ctx.globalAlpha = isFront ? 0.92 : 0.48;
          ctx.fillStyle = i % 2 === 0 ? pal.auraBright : pal.auraDim;
          fillDiamond(ctx, sx, sy, 3.2, 7.5);
        }
      } else if (auraId === 'aura_crown') {
        if (!isFront) {
          ctx.fillStyle = pal.auraDim;
          for (let p = 0; p < 3; p++) {
            const pulse = 0.14 + Math.abs(Math.sin(time * 3 + p)) * 0.18;
            ctx.globalAlpha = pulse;
            const px = cx + (p - 1) * 11;
            ctx.fillRect(px - 2, cy - 30, 4, 44);
          }
        }
        if (isFront) {
          const bob = Math.sin(time * 4.5) * 2.5;
          const crownY = cy - 26 + bob;
          ctx.globalAlpha = 0.96;
          ctx.fillStyle = pal.auraBright;
          ctx.beginPath();
          ctx.moveTo(cx - 10, crownY + 5);
          ctx.lineTo(cx - 11, crownY - 3);
          ctx.lineTo(cx - 5, crownY + 1);
          ctx.lineTo(cx, crownY - 6);
          ctx.lineTo(cx + 5, crownY + 1);
          ctx.lineTo(cx + 11, crownY - 3);
          ctx.lineTo(cx + 10, crownY + 5);
          ctx.closePath();
          ctx.fill();
        }
        for (let i = 0; i < 4; i++) {
          const a = time * 2.4 + (i * Math.PI) / 2;
          const depth = Math.sin(a);
          if ((isFront && depth < 0) || (!isFront && depth >= 0)) continue;
          const dx = cx + Math.cos(a) * 24;
          const dy = cy + depth * 5;
          ctx.globalAlpha = isFront ? 0.95 : 0.5;
          ctx.fillStyle = pal.auraBright;
          fillDiamond(ctx, dx, dy, 3.6, 5.2);
        }
      } else if (auraId === 'aura_eclipse') {
        if (!isFront) {
          ctx.globalAlpha = 0.28;
          ctx.fillStyle = pal.auraSoft;
          fillRing(ctx, cx, cy - 2, 23 + Math.sin(time * 3) * 1.5, 17);
          ctx.globalAlpha = 0.85;
          ctx.fillStyle = pal.auraBright;
          fillRing(ctx, cx, cy - 2, 17, 13.5);
        }
        ctx.globalAlpha = isFront ? 0.88 : 0.42;
        ctx.fillStyle = pal.auraBright;
        fillEllipseRingHalf(ctx, cx, cy, 31, 8.5, 2.2, 0.36, !isFront);
        ctx.fillStyle = pal.auraSoft;
        fillEllipseRingHalf(ctx, cx, cy, 28, 7.5, 1.9, -0.42, !isFront);
        for (let i = 0; i < 6; i++) {
          const a = time * 3 + i * 1.047;
          const depth = Math.sin(a);
          if ((isFront && depth < 0) || (!isFront && depth >= 0)) continue;
          const sx = cx + Math.cos(a) * 30;
          const sy = cy + Math.sin(a) * 9 * Math.cos(0.36);
          ctx.globalAlpha = isFront ? 0.98 : 0.55;
          ctx.fillStyle = pal.auraBright;
          drawFourPointStar(ctx, sx, sy, 4.2, time * 2 + i);
        }
      }
      ctx.restore();
      return;
    }

    const ac = resolveAuraColors(auraId, pal);

    ctx.save();

    if (auraId === 'aura_sparkle') {
      if (!isFront) {
        ctx.globalAlpha = 0.28;
        ctx.fillStyle = ac.soft;
        const pulse = 18 + Math.sin(time * 4) * 3;
        fillEllipseRingHalf(ctx, cx, cy + 14, pulse, 5.5, 2, 0, true);
      } else {
        ctx.globalAlpha = 0.34;
        ctx.fillStyle = ac.soft;
        const pulse = 18 + Math.sin(time * 4) * 3;
        fillEllipseRingHalf(ctx, cx, cy + 14, pulse, 5.5, 2, 0, false);
      }

      for (let i = 0; i < 8; i++) {
        const angle = time * 2.2 + i * 0.785;
        const depth = Math.sin(angle);
        if ((isFront && depth < 0) || (!isFront && depth >= 0)) continue;
        const lift = ((time * 26 + i * 11) % 38) - 19;
        const sx = cx + Math.cos(angle) * (20 + (i % 3) * 4);
        const sy = cy - lift * 0.85;
        const twinkle = 0.4 + Math.abs(Math.sin(time * 5 + i * 1.7)) * 0.6;
        ctx.globalAlpha = twinkle * (isFront ? 0.95 : 0.55);
        ctx.fillStyle = i % 3 === 0 ? ac.bright : i % 3 === 1 ? ac.soft : ac.alt;
        drawFourPointStar(ctx, sx, sy, (3.2 + (i % 3) * 1.4) * twinkle, time * 1.5 + i);
      }
    } else if (auraId === 'aura_bat') {
      // Rising dusk motes behind
      if (!isFront) {
        ctx.fillStyle = ac.dim;
        for (let m = 0; m < 6; m++) {
          const prog = (time * 0.65 + m * 0.17) % 1;
          ctx.globalAlpha = (1 - prog) * 0.55;
          const mx = cx + Math.sin(time * 2 + m * 2.1) * 18;
          const my = cy + 14 - prog * 40;
          fillDiamond(ctx, mx, my, 2.2, 2.2);
        }
      }

      // 6 articulated flapping bats in figure-eight 3D orbit
      for (let i = 0; i < 6; i++) {
        const a = time * 2.6 + (i * Math.PI * 2) / 6;
        const depth = Math.sin(a);
        if ((isFront && depth < 0) || (!isFront && depth >= 0)) continue;
        const bx = cx + Math.cos(a) * 29;
        const by = cy + Math.sin(a * 2) * 9 - 2;
        const sc = 0.62 + (depth + 1) * 0.22;
        ctx.globalAlpha = isFront ? 0.95 : 0.55;
        ctx.fillStyle = i % 2 === 0 ? ac.bright : ac.alt;
        drawBatSilhouette(ctx, bx, by, sc, time * 17 + i * 1.3);
      }
    } else if (auraId === 'aura_butterfly') {
      if (!isFront) {
        const ringProg = (time * 0.7) % 1;
        ctx.globalAlpha = (1 - ringProg) * 0.38;
        ctx.fillStyle = ac.soft;
        fillEllipseRingHalf(ctx, cx, cy + 14, 12 + ringProg * 18, 4 + ringProg * 4, 2, 0, true);
      }
      for (let i = 0; i < 6; i++) {
        const a = time * 1.9 + (i * Math.PI * 2) / 6;
        const depth = Math.sin(a);
        if ((isFront && depth < 0) || (!isFront && depth >= 0)) continue;
        const cycle = (time * 0.45 + i * 0.16) % 1;
        const bx = cx + Math.cos(a) * (18 + Math.sin(cycle * Math.PI) * 9);
        const by = cy + 15 - cycle * 38;
        const sc = 0.58 + (depth + 1) * 0.18;
        ctx.globalAlpha = Math.sin(cycle * Math.PI) * (isFront ? 0.95 : 0.6);
        ctx.fillStyle = i % 3 === 0 ? ac.bright : i % 3 === 1 ? ac.soft : ac.dim;
        drawButterflySilhouette(ctx, bx, by, sc, time * 13 + i * 1.1, Math.cos(a) * 0.25);
      }
    } else if (auraId === 'aura_feather') {
      const wave = (time * 0.8) % 1;
      ctx.fillStyle = ac.soft;
      ctx.globalAlpha = (1 - wave) * 0.42;
      fillEllipseRingHalf(ctx, cx, cy + 14, 10 + wave * 22, 3.5 + wave * 5, 2.2, 0, !isFront);

      for (let i = 0; i < 7; i++) {
        const a = time * 2.1 + i * 0.9;
        const depth = Math.sin(a);
        if ((isFront && depth < 0) || (!isFront && depth >= 0)) continue;
        const drift = (time * 0.5 + i * 0.14) % 1;
        const fx = cx + Math.cos(a) * 24;
        const fy = cy + 16 - drift * 40;
        ctx.globalAlpha = Math.sin(drift * Math.PI) * (isFront ? 0.92 : 0.55);
        ctx.fillStyle = i % 2 === 0 ? ac.bright : ac.soft;
        drawFeatherSilhouette(ctx, fx, fy, 0.78, Math.sin(time * 3 + i) * 0.6 + 0.4);
      }
    } else if (auraId === 'aura_vortex') {
      // Ground shockwave cutout rings + orbiting monolith shards
      for (let r = 0; r < 2; r++) {
        const p = (time * 0.9 + r * 0.5) % 1;
        ctx.globalAlpha = (1 - p) * 0.52;
        ctx.fillStyle = r === 0 ? ac.bright : ac.soft;
        fillEllipseRingHalf(ctx, cx, cy + 14, 8 + p * 26, 3 + p * 6, 2.4, 0, !isFront);
      }

      for (let i = 0; i < 7; i++) {
        const a = -time * 3.1 + (i * Math.PI * 2) / 7;
        const depth = Math.sin(a);
        if ((isFront && depth < 0) || (!isFront && depth >= 0)) continue;
        const sx = cx + Math.cos(a) * 25;
        const sy = cy + Math.sin(a * 2 + i) * 8;
        ctx.globalAlpha = isFront ? 0.92 : 0.54;
        ctx.fillStyle = i % 3 === 0 ? ac.bright : i % 3 === 1 ? ac.soft : ac.dim;
        fillDiamond(ctx, sx, sy, 3.2, 7.5);
      }
    } else if (auraId === 'aura_crown') {
      // Ascending vertical pillars behind player
      if (!isFront) {
        ctx.fillStyle = ac.dim;
        for (let p = 0; p < 3; p++) {
          const pulse = 0.14 + Math.abs(Math.sin(time * 3 + p)) * 0.2;
          ctx.globalAlpha = pulse;
          const px = cx + (p - 1) * 11;
          ctx.fillRect(px - 2, cy - 30, 4, 44);
        }
      }

      // Levitating Sovereign Crown above head (drawn on front pass for crisp visibility)
      if (isFront) {
        const bob = Math.sin(time * 4.5) * 2.5;
        const crownY = cy - 26 + bob;
        ctx.globalAlpha = 0.96;
        ctx.fillStyle = ac.bright;
        ctx.beginPath();
        ctx.moveTo(cx - 10, crownY + 5);
        ctx.lineTo(cx - 11, crownY - 3);
        ctx.lineTo(cx - 5, crownY + 1);
        ctx.lineTo(cx, crownY - 6);
        ctx.lineTo(cx + 5, crownY + 1);
        ctx.lineTo(cx + 11, crownY - 3);
        ctx.lineTo(cx + 10, crownY + 5);
        ctx.closePath();
        ctx.fill();
      }

      // Orbiting royal diamonds
      for (let i = 0; i < 4; i++) {
        const a = time * 2.4 + (i * Math.PI) / 2;
        const depth = Math.sin(a);
        if ((isFront && depth < 0) || (!isFront && depth >= 0)) continue;
        const dx = cx + Math.cos(a) * 24;
        const dy = cy + depth * 5;
        ctx.globalAlpha = isFront ? 0.95 : 0.55;
        ctx.fillStyle = i % 2 === 0 ? ac.alt : ac.bright;
        fillDiamond(ctx, dx, dy, 3.6, 5.2);
      }
    } else if (auraId === 'aura_eclipse') {
      // Back pass: Eclipsed solar halo disc behind character
      if (!isFront) {
        ctx.globalAlpha = 0.34;
        ctx.fillStyle = ac.soft;
        fillRing(ctx, cx, cy - 2, 23 + Math.sin(time * 3) * 1.5, 17);
        ctx.globalAlpha = 0.88;
        ctx.fillStyle = ac.bright;
        fillRing(ctx, cx, cy - 2, 17, 13.5);
      }

      // Dual tilted 3D orbital rings (passing cleanly behind and in front!)
      ctx.globalAlpha = isFront ? 0.88 : 0.45;
      ctx.fillStyle = ac.bright;
      fillEllipseRingHalf(ctx, cx, cy, 31, 8.5, 2.2, 0.36, !isFront);
      ctx.fillStyle = ac.soft;
      fillEllipseRingHalf(ctx, cx, cy, 28, 7.5, 1.9, -0.42, !isFront);

      // Cascading starlight sparks
      for (let i = 0; i < 6; i++) {
        const a = time * 3 + i * 1.047;
        const depth = Math.sin(a);
        if ((isFront && depth < 0) || (!isFront && depth >= 0)) continue;
        const sx = cx + Math.cos(a) * 30;
        const sy = cy + Math.sin(a) * 9 * Math.cos(0.36);
        ctx.globalAlpha = isFront ? 0.98 : 0.55;
        ctx.fillStyle = ac.alt;
        drawFourPointStar(ctx, sx, sy, 4.2, time * 2 + i);
      }
    }

    ctx.restore();
  }

  window.ExoticAuraRenderer = {
    drawBack(ctx, auraId, cx, cy, time, pal) {
      if (pal && pal.is3D && auraId && auraId !== 'aura_none') {
        ctx.save();
        ctx.globalAlpha = 0.34;
        ctx.translate(3.2, -2.6);
        renderLayer(ctx, auraId, cx, cy, time, pal, false);
        ctx.restore();
      }
      renderLayer(ctx, auraId, cx, cy, time, pal, false);
    },
    drawFront(ctx, auraId, cx, cy, time, pal) {
      if (pal && pal.is3D && auraId && auraId !== 'aura_none') {
        ctx.save();
        ctx.globalAlpha = 0.32;
        ctx.translate(2.4, -2.0);
        renderLayer(ctx, auraId, cx, cy, time, pal, true);
        ctx.restore();
      }
      renderLayer(ctx, auraId, cx, cy, time, pal, true);
    }
  };
})();
