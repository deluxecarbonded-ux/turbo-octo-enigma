(function () {
  function clampByte(v) {
    return Math.max(0, Math.min(255, Math.round(v)));
  }

  function parseColor(input) {
    const str = String(input || '').trim();
    if (!str) return { r: 128, g: 128, b: 128, a: 1 };

    if (str.startsWith('#')) {
      const hex = str.slice(1);
      if (hex.length === 3) {
        return {
          r: parseInt(hex[0] + hex[0], 16) || 0,
          g: parseInt(hex[1] + hex[1], 16) || 0,
          b: parseInt(hex[2] + hex[2], 16) || 0,
          a: 1
        };
      }
      if (hex.length >= 6) {
        return {
          r: parseInt(hex.slice(0, 2), 16) || 0,
          g: parseInt(hex.slice(2, 4), 16) || 0,
          b: parseInt(hex.slice(4, 6), 16) || 0,
          a: 1
        };
      }
    }

    const m = str.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/i);
    if (m) {
      return {
        r: Number(m[1]) || 0,
        g: Number(m[2]) || 0,
        b: Number(m[3]) || 0,
        a: m[4] != null ? Number(m[4]) : 1
      };
    }

    return { r: 140, g: 140, b: 140, a: 1 };
  }

  function formatRgb(r, g, b, a = 1) {
    const cr = clampByte(r);
    const cg = clampByte(g);
    const cb = clampByte(b);
    if (a < 0.999) {
      return `rgba(${cr}, ${cg}, ${cb}, ${Math.max(0, Math.min(1, Number(a.toFixed(3))))})`;
    }
    return `rgb(${cr}, ${cg}, ${cb})`;
  }

  // Strictly pure grayscale when !pal.colored (0 chromatic pixels guaranteed!)
  function shadeFace(baseColor, role, pal) {
    const c = parseColor(baseColor);
    const lum = c.r * 0.299 + c.g * 0.587 + c.b * 0.114;
    const isColored = Boolean(pal && pal.colored);

    if (!isColored) {
      let g = lum;
      if (lum < 56) {
        // Dark block (e.g. Light Mode #18181b platforms/characters): lift top & side faces cleanly
        if (role === 'top') g = lum + 66;
        else if (role === 'side') g = lum + 36;
        else if (role === 'deep') g = lum + 92;
        else if (role === 'extrudeNear') g = lum + 44;
        else if (role === 'extrudeFar') g = lum + 72;
      } else {
        // Bright or mid block (e.g. Dark Mode #e4e4e7 platforms/characters)
        if (role === 'top') g = Math.min(255, lum * 1.1 + 16);
        else if (role === 'side') g = lum * 0.62;
        else if (role === 'deep') g = lum * 0.42;
        else if (role === 'extrudeNear') g = lum * 0.72;
        else if (role === 'extrudeFar') g = lum * 0.48;
      }
      return formatRgb(g, g, g, c.a);
    }

    // Colored mode directional 3D face shading
    if (lum < 52) {
      if (role === 'top') return formatRgb(c.r + 48, c.g + 54, c.b + 68, c.a);
      if (role === 'side') return formatRgb(c.r + 22, c.g + 26, c.b + 38, c.a);
      if (role === 'deep') return formatRgb(c.r * 0.65, c.g * 0.65, c.b * 0.72, c.a);
      if (role === 'extrudeNear') return formatRgb(c.r + 28, c.g + 32, c.b + 44, c.a);
      if (role === 'extrudeFar') return formatRgb(c.r + 14, c.g + 16, c.b + 24, c.a);
      return formatRgb(c.r, c.g, c.b, c.a);
    }

    if (role === 'top') return formatRgb(c.r * 1.16 + 18, c.g * 1.16 + 18, c.b * 1.16 + 18, c.a);
    if (role === 'side') return formatRgb(c.r * 0.66, c.g * 0.66, c.b * 0.72, c.a);
    if (role === 'deep') return formatRgb(c.r * 0.45, c.g * 0.45, c.b * 0.52, c.a);
    if (role === 'extrudeNear') return formatRgb(c.r * 0.74, c.g * 0.74, c.b * 0.8, c.a);
    if (role === 'extrudeFar') return formatRgb(c.r * 0.52, c.g * 0.52, c.b * 0.6, c.a);
    return formatRgb(c.r, c.g, c.b, c.a);
  }

  function fillQuad(ctx, x1, y1, x2, y2, x3, y3, x4, y4) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x3, y3);
    ctx.lineTo(x4, y4);
    ctx.closePath();
    ctx.fill();
  }

  // Camera-aware 1-point + oblique 3D extrusion vector (always shows Top Roof + dynamic Side Wall)
  function computeExtrusion(centerX, vanishX, depth = 16) {
    const d = Math.max(4, depth);
    let dx = d * 0.52;
    if (typeof vanishX === 'number' && Number.isFinite(vanishX)) {
      const pull = (vanishX - centerX) * 0.038 + d * 0.34;
      dx = Math.max(-d * 0.88, Math.min(d * 0.88, pull));
      if (Math.abs(dx) < d * 0.22) {
        dx = dx >= 0 ? d * 0.22 : -d * 0.22;
      }
    }
    const dy = -d * 0.56;
    return { dx, dy };
  }

  // Solid 3-face extruded 3D rectangular prism (Top Deck + Left/Right Wall + Front Face)
  function drawExtrudedBox(ctx, x, y, w, h, opts = {}) {
    if (w <= 0 || h <= 0) return;
    const pal = opts.palette;
    const depth = opts.depth ?? 16;
    const { dx, dy } =
      opts.dx != null && opts.dy != null
        ? { dx: opts.dx, dy: opts.dy }
        : computeExtrusion(x + w * 0.5, opts.vanishX, depth);

    const frontColor = opts.frontColor || pal?.platform || '#888888';
    const topColor = opts.topColor || shadeFace(opts.capColor || frontColor, 'top', pal);
    const sideColor = opts.sideColor || shadeFace(frontColor, 'side', pal);

    ctx.save();

    // Optional soft solid ground/drop shadow quad behind the prism
    if (opts.castShadow !== false) {
      ctx.globalAlpha = pal?.mode === 'light' ? 0.11 : 0.24;
      ctx.fillStyle = pal?.colored ? '#020617' : pal?.mode === 'light' ? '#09090b' : '#000000';
      fillQuad(
        ctx,
        x + 4,
        y + h,
        x + w + 4,
        y + h,
        x + w + 4 + dx * 0.55,
        y + h + Math.max(4, Math.abs(dy) * 0.45),
        x + 4 + dx * 0.55,
        y + h + Math.max(4, Math.abs(dy) * 0.45)
      );
      ctx.globalAlpha = 1;
    }

    // 1. Receding Side Wall (Right wall if dx > 0, Left wall if dx < 0)
    if (Math.abs(dx) > 0.4) {
      ctx.fillStyle = sideColor;
      if (dx > 0) {
        fillQuad(ctx, x + w, y, x + w + dx, y + dy, x + w + dx, y + h + dy, x + w, y + h);
      } else {
        fillQuad(ctx, x + dx, y + dy, x, y, x, y + h, x + dx, y + h + dy);
      }
    }

    // 2. Receding Top Deck (if dy < 0) or Underside Deck (if dy > 0)
    if (Math.abs(dy) > 0.4) {
      ctx.fillStyle = topColor;
      if (dy < 0) {
        fillQuad(ctx, x + dx, y + dy, x + w + dx, y + dy, x + w, y, x, y);
      } else {
        fillQuad(ctx, x, y + h, x + w, y + h, x + w + dx, y + h + dy, x + dx, y + h + dy);
      }
    }

    // 3. Crisp Lit Front Face
    ctx.fillStyle = frontColor;
    if (opts.radius && opts.radius > 0 && window.ExoticCharacterRenderer?.fillRoundRect) {
      window.ExoticCharacterRenderer.fillRoundRect(ctx, x, y, w, h, opts.radius);
    } else {
      ctx.fillRect(x, y, w, h);
    }

    ctx.restore();
    return { dx, dy };
  }

  // True 3D 2-facet Pyramidal Spike
  function draw3DPyramidSpike(ctx, bx, by, w, h, dir, baseColor, pal, vanishX) {
    const { dx, dy } = computeExtrusion(bx + w * 0.5, vanishX, 9);
    const tipX = bx + w * 0.5 + dx * 0.28;
    const tipY = dir === 'down' ? by + h : by - h;
    const rearRightX = bx + w + dx * 0.55;
    const rearRightY = by + dy * 0.55;
    const rearLeftX = bx + dx * 0.55;
    const rearLeftY = by + dy * 0.55;

    ctx.save();
    // Rear side facet
    ctx.fillStyle = shadeFace(baseColor, 'deep', pal);
    ctx.beginPath();
    if (dx >= 0) {
      ctx.moveTo(bx + w, by);
      ctx.lineTo(rearRightX, rearRightY);
      ctx.lineTo(tipX, tipY);
    } else {
      ctx.moveTo(bx, by);
      ctx.lineTo(rearLeftX, rearLeftY);
      ctx.lineTo(tipX, tipY);
    }
    ctx.closePath();
    ctx.fill();

    // Left front facet (lit)
    ctx.fillStyle = shadeFace(baseColor, 'top', pal);
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx + w * 0.5, by);
    ctx.lineTo(tipX, tipY);
    ctx.closePath();
    ctx.fill();

    // Right front facet (mid-shaded)
    ctx.fillStyle = baseColor;
    ctx.beginPath();
    ctx.moveTo(bx + w * 0.5, by);
    ctx.lineTo(bx + w, by);
    ctx.lineTo(tipX, tipY);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // 3D Rotating Tumbled Cube (solid 3-face isometric projection for 3D motes & particles)
  function draw3DTumbledCube(ctx, cx, cy, size, angle, baseColor, pal) {
    const r = Math.max(2, size * 0.72);
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const topLift = r * 0.58;
    const ux = c * r;
    const uy = s * r * 0.42;
    const vx = -s * r;
    const vy = c * r * 0.42;

    ctx.save();
    // Top diamond face
    ctx.fillStyle = shadeFace(baseColor, 'top', pal);
    fillQuad(
      ctx,
      cx - ux - vx,
      cy - topLift - uy - vy,
      cx + ux - vx,
      cy - topLift + uy - vy,
      cx + ux + vx,
      cy - topLift + uy + vy,
      cx - ux + vx,
      cy - topLift - uy + vy
    );

    // Front-left face
    ctx.fillStyle = baseColor;
    fillQuad(
      ctx,
      cx - ux + vx,
      cy - topLift - uy + vy,
      cx + ux + vx,
      cy - topLift + uy + vy,
      cx + ux + vx,
      cy + topLift + uy + vy,
      cx - ux + vx,
      cy + topLift - uy + vy
    );

    // Front-right shaded face
    ctx.fillStyle = shadeFace(baseColor, 'side', pal);
    fillQuad(
      ctx,
      cx + ux + vx,
      cy - topLift + uy + vy,
      cx + ux - vx,
      cy - topLift + uy - vy,
      cx + ux - vx,
      cy + topLift + uy - vy,
      cx + ux + vx,
      cy + topLift + uy + vy
    );
    ctx.restore();
  }

  // 3D Rotating Octahedron Crystal (for Skill Orbs, Astral Orbs & Gems)
  function draw3DOctahedron(ctx, cx, cy, rx, ry, angle, baseColor, pal) {
    const split = Math.sin(angle) * rx * 0.55;
    const topY = cy - ry;
    const botY = cy + ry;
    const leftX = cx - rx;
    const rightX = cx + rx;
    const midX = cx + split;

    ctx.save();
    // Upper-left sunlit facet
    ctx.fillStyle = shadeFace(baseColor, 'top', pal);
    ctx.beginPath();
    ctx.moveTo(topX(cx), topY);
    ctx.lineTo(midX, cy);
    ctx.lineTo(leftX, cy);
    ctx.closePath();
    ctx.fill();

    // Upper-right facet
    ctx.fillStyle = baseColor;
    ctx.beginPath();
    ctx.moveTo(cx, topY);
    ctx.lineTo(rightX, cy);
    ctx.lineTo(midX, cy);
    ctx.closePath();
    ctx.fill();

    // Lower-left shaded facet
    ctx.fillStyle = shadeFace(baseColor, 'side', pal);
    ctx.beginPath();
    ctx.moveTo(leftX, cy);
    ctx.lineTo(midX, cy);
    ctx.lineTo(cx, botY);
    ctx.closePath();
    ctx.fill();

    // Lower-right deep facet
    ctx.fillStyle = shadeFace(baseColor, 'deep', pal);
    ctx.beginPath();
    ctx.moveTo(midX, cy);
    ctx.lineTo(rightX, cy);
    ctx.lineTo(cx, botY);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function topX(cx) {
    return cx;
  }

  // 3D Ground Contact Shadow Ellipse
  function drawGroundShadow(ctx, cx, groundY, rx, ry, alpha, pal) {
    if (rx <= 0 || ry <= 0 || alpha <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = Math.min(0.45, alpha);
    ctx.fillStyle = pal?.colored ? '#020617' : pal?.mode === 'light' ? '#18181b' : '#000000';
    ctx.beginPath();
    ctx.ellipse(cx + 2.5, groundY, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 3D Perspective Stage Chamber Floor / Ceiling Depth Tiles (pure solid trapezoids, zero strokes!)
  function draw3DStageChamber(ctx, viewW, viewH, scrollX, pal) {
    if (!pal || !pal.is3D) return;
    const horizonY = viewH * 0.56;
    const floorTopY = viewH * 0.84;
    const vx = viewW * 0.5;

    ctx.save();
    // Subtle receding floor perspective deck at bottom of stage chamber
    ctx.globalAlpha = pal.mode === 'light' ? 0.08 : 0.16;
    ctx.fillStyle = pal.bgPillarAlt || pal.platform;
    ctx.fillRect(0, floorTopY, viewW, viewH - floorTopY);

    // Perspective floor tiles scrolling with camera parallax (solid alternating trapezoids!)
    const tileWorldW = 130;
    const offset = ((scrollX * 0.55) % tileWorldW + tileWorldW) % tileWorldW;
    ctx.globalAlpha = pal.mode === 'light' ? 0.065 : 0.13;
    ctx.fillStyle = pal.colored ? pal.platformCap : pal.playerPrimary;

    for (let i = -5; i <= 6; i++) {
      const nearCenter = vx + i * tileWorldW - offset;
      const nearL = nearCenter - tileWorldW * 0.36;
      const nearR = nearCenter + tileWorldW * 0.36;
      const farL = vx + (nearL - vx) * 0.34;
      const farR = vx + (nearR - vx) * 0.34;
      fillQuad(ctx, farL, floorTopY, farR, floorTopY, nearR, viewH, nearL, viewH);
    }

    // Subtle upper ceiling perspective beams for enclosed 3D chamber depth
    ctx.globalAlpha = pal.mode === 'light' ? 0.045 : 0.09;
    ctx.fillStyle = pal.bgPillar || pal.platform;
    const ceilBotY = horizonY * 0.24;
    for (let i = -4; i <= 4; i += 2) {
      const nearCenter = vx + i * 165 - offset * 0.5;
      const nearL = nearCenter - 46;
      const nearR = nearCenter + 46;
      const farL = vx + (nearL - vx) * 0.42;
      const farR = vx + (nearR - vx) * 0.42;
      fillQuad(ctx, nearL, 0, nearR, 0, farR, ceilBotY, farL, ceilBotY);
    }

    ctx.restore();
  }

  window.Exotic3D = {
    shadeFace,
    fillQuad,
    computeExtrusion,
    drawExtrudedBox,
    draw3DPyramidSpike,
    draw3DTumbledCube,
    draw3DOctahedron,
    drawGroundShadow,
    draw3DStageChamber
  };
})();
