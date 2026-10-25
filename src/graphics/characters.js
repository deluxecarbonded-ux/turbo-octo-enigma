(function () {
  function addRoundRectSubpath(ctx, x, y, w, h, r) {
    const rad = Math.min(r, Math.abs(w) * 0.5, Math.abs(h) * 0.5);
    ctx.moveTo(x + rad, y);
    ctx.lineTo(x + w - rad, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
    ctx.lineTo(x + w, y + h - rad);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
    ctx.lineTo(x + rad, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
    ctx.lineTo(x, y + rad);
    ctx.quadraticCurveTo(x, y, x + rad, y);
    ctx.closePath();
  }

  function fillRoundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    addRoundRectSubpath(ctx, x, y, w, h, r);
    ctx.fill();
  }

  function addCircleSubpath(ctx, cx, cy, r) {
    if (r <= 0) return;
    ctx.moveTo(cx + r, cy);
    ctx.arc(cx, cy, r, 0, Math.PI * 2, false);
    ctx.closePath();
  }

  function addEllipseSubpath(ctx, cx, cy, rx, ry, rot = 0) {
    const safeRx = Math.max(0.5, rx);
    const safeRy = Math.max(0.5, ry);
    ctx.moveTo(cx + safeRx * Math.cos(rot), cy + safeRx * Math.sin(rot));
    ctx.ellipse(cx, cy, safeRx, safeRy, rot, 0, Math.PI * 2, false);
    ctx.closePath();
  }

  // Clockwise solid capsule subpath (zero strokes, clean union under nonzero clip!)
  function addCapsuleSubpath(ctx, x1, y1, x2, y2, r) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (len < 0.001) {
      addCircleSubpath(ctx, x1, y1, r);
      return;
    }
    const ang = Math.atan2(dy, dx);
    const nx = Math.cos(ang - Math.PI * 0.5) * r;
    const ny = Math.sin(ang - Math.PI * 0.5) * r;

    ctx.moveTo(x1 + nx, y1 + ny);
    ctx.lineTo(x2 + nx, y2 + ny);
    ctx.arc(x2, y2, r, ang - Math.PI * 0.5, ang + Math.PI * 0.5, false);
    ctx.lineTo(x1 - nx, y1 - ny);
    ctx.arc(x1, y1, r, ang + Math.PI * 0.5, ang + Math.PI * 1.5, false);
    ctx.closePath();
  }

  function fillCapsule(ctx, x1, y1, x2, y2, r) {
    ctx.beginPath();
    addCapsuleSubpath(ctx, x1, y1, x2, y2, r);
    ctx.fill();
  }

  function fillRing(ctx, cx, cy, outerR, innerR) {
    if (outerR <= 0) return;
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, 0, Math.PI * 2, false);
    if (innerR > 0) {
      ctx.arc(cx, cy, Math.max(0.1, innerR), 0, Math.PI * 2, true);
    }
    ctx.fill('evenodd');
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

  function fillPieEye(ctx, cx, cy, rx, ry, facing, eyeColor, bgCutColor) {
    ctx.fillStyle = eyeColor;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();

    // Classic 1928 vintage pie-wedge eye notch
    ctx.fillStyle = bgCutColor;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + facing * (rx + 1.5), cy - ry * 0.65);
    ctx.lineTo(cx + facing * (rx + 1.5), cy - ry * 0.05);
    ctx.closePath();
    ctx.fill();
  }

  function computeStickmanJoints(w, h, facing, vx, vy, time) {
    const speed = Math.abs(vx);
    const running = speed > 18;
    const airborne = Math.abs(vy) > 35;
    const scale = h / 26;

    const lean = running ? facing * 2.4 * scale : 0;
    const bob = running && !airborne ? Math.abs(Math.sin(time * 15)) * 1.6 * scale : Math.sin(time * 3.5) * 0.6 * scale;

    const headX = lean * 1.15;
    const headY = (-9.2 - bob * 0.4) * scale;
    const neckX = lean * 0.85;
    const neckY = (-3.8 - bob * 0.3) * scale;
    const hipX = 0;
    const hipY = (4.2 - bob * 0.2) * scale;

    const phase = running ? time * 15 : time * 3.2;
    const swing = running ? 1 : 0.16;

    let lElbowX, lElbowY, lHandX, lHandY;
    let rElbowX, rElbowY, rHandX, rHandY;
    let lKneeX, lKneeY, lFootX, lFootY;
    let rKneeX, rKneeY, rFootX, rFootY;

    if (airborne && vy < -35) {
      // Heroic mid-air jump tuck
      lElbowX = neckX - facing * 5.5 * scale;
      lElbowY = neckY - 2.5 * scale;
      lHandX = neckX - facing * 8.5 * scale;
      lHandY = neckY - 7.5 * scale;

      rElbowX = neckX + facing * 6.2 * scale;
      rElbowY = neckY - 3.5 * scale;
      rHandX = neckX + facing * 8.8 * scale;
      rHandY = neckY - 9.0 * scale;

      lKneeX = hipX - facing * 4.5 * scale;
      lKneeY = hipY + 4.5 * scale;
      lFootX = hipX - facing * 7.5 * scale;
      lFootY = hipY + 8.5 * scale;

      rKneeX = hipX + facing * 6.2 * scale;
      rKneeY = hipY + 2.2 * scale;
      rFootX = hipX + facing * 4.0 * scale;
      rFootY = hipY + 7.8 * scale;
    } else if (airborne && vy >= 35) {
      // Falling flail pose
      const flail = Math.sin(time * 22) * 2.2 * scale;
      lElbowX = neckX - 6.5 * scale;
      lElbowY = neckY - 4.5 * scale + flail;
      lHandX = neckX - 9.5 * scale;
      lHandY = neckY - 9.5 * scale - flail;

      rElbowX = neckX + 6.5 * scale;
      rElbowY = neckY - 4.5 * scale - flail;
      rHandX = neckX + 9.5 * scale;
      rHandY = neckY - 9.5 * scale + flail;

      lKneeX = hipX - 4.5 * scale;
      lKneeY = hipY + 4.5 * scale;
      lFootX = hipX - 6.5 * scale;
      lFootY = hipY + 9.2 * scale;

      rKneeX = hipX + 4.5 * scale;
      rKneeY = hipY + 4.5 * scale;
      rFootX = hipX + 6.5 * scale;
      rFootY = hipY + 9.2 * scale;
    } else {
      // Ground stride / idle stance
      const s1 = Math.sin(phase) * swing;
      const s2 = Math.sin(phase + Math.PI) * swing;

      lElbowX = neckX + s2 * 5.2 * scale - (!running ? 3.2 * scale : 0);
      lElbowY = neckY + 4.2 * scale;
      lHandX = lElbowX + (running ? facing * 3.8 * scale + s2 * 2.5 * scale : -1.2 * scale);
      lHandY = lElbowY + (running ? -1.8 * scale : 3.2 * scale);

      rElbowX = neckX + s1 * 5.2 * scale + (!running ? 3.2 * scale : 0);
      rElbowY = neckY + 4.2 * scale;
      rHandX = rElbowX + (running ? facing * 3.8 * scale + s1 * 2.5 * scale : 1.2 * scale);
      rHandY = rElbowY + (running ? -1.8 * scale : 3.2 * scale);

      const legSpread = running ? 0 : 3.4 * scale;
      lKneeX = hipX + s1 * 5.5 * scale - legSpread * 0.7;
      lKneeY = hipY + 4.6 * scale - Math.max(0, s1 * facing) * 1.6 * scale;
      lFootX = hipX + s1 * 8.2 * scale - legSpread - (running && s1 * facing < 0 ? facing * 2 * scale : 0);
      lFootY = (12.2 - Math.max(0, s1 * facing) * 2.6) * scale;

      rKneeX = hipX + s2 * 5.5 * scale + legSpread * 0.7;
      rKneeY = hipY + 4.6 * scale - Math.max(0, s2 * facing) * 1.6 * scale;
      rFootX = hipX + s2 * 8.2 * scale + legSpread - (running && s2 * facing < 0 ? facing * 2 * scale : 0);
      rFootY = (12.2 - Math.max(0, s2 * facing) * 2.6) * scale;
    }

    return {
      scale,
      headX,
      headY,
      headR: 5.4 * scale,
      limbR: 1.95 * scale,
      neckX,
      neckY,
      hipX,
      hipY,
      lElbowX,
      lElbowY,
      lHandX,
      lHandY,
      rElbowX,
      rElbowY,
      rHandX,
      rHandY,
      lKneeX,
      lKneeY,
      lFootX,
      lFootY,
      rKneeX,
      rKneeY,
      rFootX,
      rFootY
    };
  }

  function applyBodyPath(ctx, charId, w, h, facing, vx, vy, time) {
    const hw = w * 0.5;
    const hh = h * 0.5;
    const speed = Math.abs(vx);
    const stride = speed > 18 ? Math.sin(time * 15) * 3.4 : Math.sin(time * 3) * 0.5;

    ctx.beginPath();

    if (charId === 'char_stickman') {
      const j = computeStickmanJoints(w, h, facing, vx, vy, time);
      addCircleSubpath(ctx, j.headX, j.headY, j.headR);
      addCapsuleSubpath(ctx, j.neckX, j.neckY, j.hipX, j.hipY, j.limbR * 1.12);
      // Arms
      addCapsuleSubpath(ctx, j.neckX, j.neckY + 0.8, j.lElbowX, j.lElbowY, j.limbR * 0.9);
      addCapsuleSubpath(ctx, j.lElbowX, j.lElbowY, j.lHandX, j.lHandY, j.limbR * 0.85);
      addCapsuleSubpath(ctx, j.neckX, j.neckY + 0.8, j.rElbowX, j.rElbowY, j.limbR * 0.9);
      addCapsuleSubpath(ctx, j.rElbowX, j.rElbowY, j.rHandX, j.rHandY, j.limbR * 0.85);
      // Legs
      addCapsuleSubpath(ctx, j.hipX, j.hipY, j.lKneeX, j.lKneeY, j.limbR);
      addCapsuleSubpath(ctx, j.lKneeX, j.lKneeY, j.lFootX, j.lFootY, j.limbR * 0.92);
      addCapsuleSubpath(ctx, j.hipX, j.hipY, j.rKneeX, j.rKneeY, j.limbR);
      addCapsuleSubpath(ctx, j.rKneeX, j.rKneeY, j.rFootX, j.rFootY, j.limbR * 0.92);
      return;
    }

    if (charId === 'char_mickey') {
      const sc = h / 26;
      const earBob = Math.sin(time * 8) * 0.7 * sc;
      // Iconic twin circular 3/4 Mouse Ears
      addCircleSubpath(ctx, -facing * 6.8 * sc, (-12.2 + earBob) * sc, 5.2 * sc);
      addCircleSubpath(ctx, facing * 4.4 * sc, (-13.2 - earBob * 0.6) * sc, 5.2 * sc);
      // Round toon head + protruding snout
      addCircleSubpath(ctx, 0, -4.5 * sc, 7.6 * sc);
      addCircleSubpath(ctx, facing * 6.8 * sc, -3.2 * sc, 3.6 * sc);
      // Rounded torso
      addRoundRectSubpath(ctx, -5.8 * sc, 1.8 * sc, 11.6 * sc, 8.6 * sc, 4 * sc);
      // Swinging rubberhose arms + gloved hands
      addCapsuleSubpath(ctx, -4.5 * sc, 3.5 * sc, (-8.5 - stride * 0.5) * sc, 7.8 * sc, 1.7 * sc);
      addCircleSubpath(ctx, (-8.8 - stride * 0.5) * sc, 8.2 * sc, 2.7 * sc);
      addCapsuleSubpath(ctx, 4.5 * sc, 3.5 * sc, (8.5 + stride * 0.5) * sc, 7.2 * sc, 1.7 * sc);
      addCircleSubpath(ctx, (8.8 + stride * 0.5) * sc, 7.6 * sc, 2.7 * sc);
      // Striding legs + oversized vintage toon shoes
      addCapsuleSubpath(ctx, -2.8 * sc, 9.2 * sc, (-3.2 + stride) * sc, 12.6 * sc, 1.7 * sc);
      addCapsuleSubpath(ctx, 2.8 * sc, 9.2 * sc, (3.2 - stride) * sc, 12.6 * sc, 1.7 * sc);
      addRoundRectSubpath(ctx, (-6.8 + stride) * sc, 11.2 * sc, 7.2 * sc, 3.6 * sc, 1.8 * sc);
      addRoundRectSubpath(ctx, (-0.4 - stride) * sc, 11.2 * sc, 7.2 * sc, 3.6 * sc, 1.8 * sc);
      return;
    }

    if (charId === 'char_tom') {
      const sc = h / 26;
      const earFlick = Math.sin(time * 9) * 0.7 * sc;
      // Wide-set tall pointed tomcat ears (clockwise!)
      ctx.moveTo(-8.8 * sc, -5.2 * sc);
      ctx.lineTo(-10.8 * sc, (-16.2 + earFlick) * sc);
      ctx.lineTo(-2.4 * sc, -9.8 * sc);
      ctx.closePath();

      ctx.moveTo(2.4 * sc, -9.8 * sc);
      ctx.lineTo(10.8 * sc, (-16.2 - earFlick * 0.6) * sc);
      ctx.lineTo(8.8 * sc, -5.2 * sc);
      ctx.closePath();

      // Fluffy side cheek jowl tufts + tomcat head + protruding muzzle
      addEllipseSubpath(ctx, -7.4 * sc, -2.2 * sc, 3.9 * sc, 2.7 * sc);
      addEllipseSubpath(ctx, 7.4 * sc, -2.2 * sc, 3.9 * sc, 2.7 * sc);
      addCircleSubpath(ctx, 0, -4.6 * sc, 7.8 * sc);
      addEllipseSubpath(ctx, facing * 4.4 * sc, -2.0 * sc, 4.4 * sc, 2.8 * sc);
      // Sleek upright cat torso + swinging gloved paws + striding tomcat feet
      addRoundRectSubpath(ctx, -5.8 * sc, 1.8 * sc, 11.6 * sc, 8.8 * sc, 4.2 * sc);
      addCapsuleSubpath(ctx, -4.6 * sc, 3.6 * sc, (-8.4 - stride * 0.5) * sc, 7.8 * sc, 1.65 * sc);
      addCircleSubpath(ctx, (-8.7 - stride * 0.5) * sc, 8.2 * sc, 2.5 * sc);
      addCapsuleSubpath(ctx, 4.6 * sc, 3.6 * sc, (8.4 + stride * 0.5) * sc, 7.2 * sc, 1.65 * sc);
      addCircleSubpath(ctx, (8.7 + stride * 0.5) * sc, 7.6 * sc, 2.5 * sc);
      addCapsuleSubpath(ctx, -2.8 * sc, 9.4 * sc, (-3.2 + stride) * sc, 12.6 * sc, 1.7 * sc);
      addCapsuleSubpath(ctx, 2.8 * sc, 9.4 * sc, (3.2 - stride) * sc, 12.6 * sc, 1.7 * sc);
      addRoundRectSubpath(ctx, (-6.8 + stride) * sc, 11.2 * sc, 7.0 * sc, 3.5 * sc, 1.7 * sc);
      addRoundRectSubpath(ctx, (-0.2 - stride) * sc, 11.2 * sc, 7.0 * sc, 3.5 * sc, 1.7 * sc);
      return;
    }

    if (charId === 'char_jerry') {
      const sc = h / 26;
      const earBob = Math.sin(time * 10) * 0.8 * sc;
      // Oversized wide-splayed saucer mouse ears + forehead hair curl
      addCircleSubpath(ctx, -8.2 * sc, (-9.2 + earBob) * sc, 5.5 * sc);
      addCircleSubpath(ctx, 8.2 * sc, (-9.2 - earBob * 0.7) * sc, 5.5 * sc);
      addCapsuleSubpath(ctx, 0, -9.8 * sc, facing * 2.8 * sc, -13.4 * sc, 1.3 * sc);
      addCapsuleSubpath(ctx, -0.6 * sc, -9.8 * sc, -facing * 1.5 * sc, -12.6 * sc, 1.0 * sc);
      // Nimble mouse head + cheeky upturned snout + agile compact body + scurrying feet
      addCircleSubpath(ctx, 0, -3.5 * sc, 6.6 * sc);
      addEllipseSubpath(ctx, facing * 5.6 * sc, -2.2 * sc, 3.3 * sc, 2.3 * sc);
      addRoundRectSubpath(ctx, -4.8 * sc, 2.0 * sc, 9.6 * sc, 7.8 * sc, 4.2 * sc);
      addCapsuleSubpath(ctx, -3.8 * sc, 3.6 * sc, (-7.2 - stride * 0.5) * sc, 7.2 * sc, 1.45 * sc);
      addCapsuleSubpath(ctx, 3.8 * sc, 3.6 * sc, (7.2 + stride * 0.5) * sc, 6.8 * sc, 1.45 * sc);
      addRoundRectSubpath(ctx, (-6.0 + stride) * sc, 10.6 * sc, 6.2 * sc, 3.2 * sc, 1.6 * sc);
      addRoundRectSubpath(ctx, (-0.2 - stride) * sc, 10.6 * sc, 6.2 * sc, 3.2 * sc, 1.6 * sc);
      return;
    }

    if (charId === 'char_bugs_bunny') {
      const sc = h / 26;
      const earBend = Math.max(-4.5, Math.min(4.5, -vx * 0.016)) * sc;
      // Sky-high upright hare ears with velocity-reactive bend
      addCapsuleSubpath(ctx, -2.8 * sc, -8.2 * sc, -3.8 * sc + earBend * 0.45, -15.2 * sc, 2.25 * sc);
      addCapsuleSubpath(ctx, -3.8 * sc + earBend * 0.45, -15.2 * sc, -5.0 * sc + earBend, -20.8 * sc, 2.05 * sc);
      addCapsuleSubpath(ctx, 2.4 * sc, -8.2 * sc, 3.4 * sc + earBend * 0.45, -15.2 * sc, 2.25 * sc);
      addCapsuleSubpath(ctx, 3.4 * sc + earBend * 0.45, -15.2 * sc, 4.6 * sc + earBend, -20.8 * sc, 2.05 * sc);
      // Wide puffed rabbit cheeks + head + slender torso + gloved hands + cotton tail + long thumper feet
      addEllipseSubpath(ctx, -6.8 * sc, -1.8 * sc, 4.2 * sc, 2.6 * sc);
      addEllipseSubpath(ctx, 6.8 * sc, -1.8 * sc, 4.2 * sc, 2.6 * sc);
      addCircleSubpath(ctx, 0, -4.2 * sc, 6.6 * sc);
      addRoundRectSubpath(ctx, -5.0 * sc, 1.6 * sc, 10.0 * sc, 9.0 * sc, 4.2 * sc);
      addCircleSubpath(ctx, -facing * 6.8 * sc, 7.6 * sc, 3.1 * sc);
      addCapsuleSubpath(ctx, -4.2 * sc, 3.4 * sc, (-8.0 - stride * 0.5) * sc, 7.6 * sc, 1.55 * sc);
      addCircleSubpath(ctx, (-8.3 - stride * 0.5) * sc, 8.0 * sc, 2.4 * sc);
      addCapsuleSubpath(ctx, 4.2 * sc, 3.4 * sc, (8.0 + stride * 0.5) * sc, 7.0 * sc, 1.55 * sc);
      addCircleSubpath(ctx, (8.3 + stride * 0.5) * sc, 7.4 * sc, 2.4 * sc);
      addRoundRectSubpath(ctx, (-7.4 + stride) * sc, 11.0 * sc, 8.6 * sc, 3.4 * sc, 1.7 * sc);
      addRoundRectSubpath(ctx, (-0.2 - stride) * sc, 11.0 * sc, 8.6 * sc, 3.4 * sc, 1.7 * sc);
      return;
    }

    if (charId === 'char_donald_duck') {
      const sc = h / 26;
      const tailWag = Math.sin(time * 11) * 0.9 * sc;
      // Jaunty tilted Sailor Cap + cap band
      addEllipseSubpath(ctx, -facing * 1.4 * sc, -11.8 * sc, 6.8 * sc, 2.9 * sc, -facing * 0.2);
      addRoundRectSubpath(ctx, -5.0 * sc, -10.5 * sc, 9.6 * sc, 2.4 * sc, 1.0 * sc);
      // Round duck head + prominent forward-extending duck bill
      addCircleSubpath(ctx, 0, -4.4 * sc, 7.2 * sc);
      addRoundRectSubpath(
        ctx,
        (facing > 0 ? 1.2 : -11.8) * sc,
        -4.2 * sc,
        10.6 * sc,
        3.8 * sc,
        1.9 * sc
      );
      addCircleSubpath(ctx, facing * 10.4 * sc, -3.2 * sc, 2.0 * sc);
      // Sailor tunic torso + upturned pointed duck tail feathers + wing-arms + wide webbed feet
      addRoundRectSubpath(ctx, -5.8 * sc, 1.8 * sc, 11.6 * sc, 8.6 * sc, 4.2 * sc);
      addCapsuleSubpath(ctx, -facing * 4.5 * sc, 6.8 * sc, -facing * 10.4 * sc, (3.4 + tailWag) * sc, 2.1 * sc);
      addCapsuleSubpath(ctx, -facing * 4.5 * sc, 8.2 * sc, -facing * 9.4 * sc, (6.0 + tailWag) * sc, 1.6 * sc);
      addCapsuleSubpath(ctx, -4.6 * sc, 3.6 * sc, (-8.4 - stride * 0.5) * sc, 7.6 * sc, 1.75 * sc);
      addCapsuleSubpath(ctx, 4.6 * sc, 3.6 * sc, (8.4 + stride * 0.5) * sc, 7.0 * sc, 1.75 * sc);
      addRoundRectSubpath(ctx, (-7.2 + stride) * sc, 11.2 * sc, 7.8 * sc, 3.2 * sc, 1.5 * sc);
      addRoundRectSubpath(ctx, (-0.4 - stride) * sc, 11.2 * sc, 7.8 * sc, 3.2 * sc, 1.5 * sc);
      return;
    }

    if (charId === 'char_cat') {
      const sc = h / 26;
      // Pointed triangular cat ears (clockwise!)
      ctx.moveTo(-8.5 * sc, -5.5 * sc);
      ctx.lineTo(-9.5 * sc, -14.2 * sc);
      ctx.lineTo(-2.2 * sc, -9.2 * sc);
      ctx.closePath();

      ctx.moveTo(2.2 * sc, -9.2 * sc);
      ctx.lineTo(9.5 * sc, -14.2 * sc);
      ctx.lineTo(8.5 * sc, -5.5 * sc);
      ctx.closePath();

      // Plump cat head + compact body + running paws
      addCircleSubpath(ctx, 0, -3.5 * sc, 8.6 * sc);
      addRoundRectSubpath(ctx, -6.5 * sc, 2.5 * sc, 13 * sc, 9 * sc, 4.2 * sc);
      addCircleSubpath(ctx, (-3.6 + stride * 0.8) * sc, 12.2 * sc, 2.5 * sc);
      addCircleSubpath(ctx, (3.6 - stride * 0.8) * sc, 12.2 * sc, 2.5 * sc);
      return;
    }

    if (charId === 'char_bunny') {
      const sc = h / 26;
      const earTilt = Math.max(-4, Math.min(4, -vx * 0.015)) * sc;
      // Tall twin rubberhose rabbit ears
      addCapsuleSubpath(ctx, -3.6 * sc, -8 * sc, -4.8 * sc + earTilt, -18.2 * sc, 2.5 * sc);
      addCapsuleSubpath(ctx, 3.2 * sc, -8 * sc, 4.2 * sc + earTilt, -18.2 * sc, 2.5 * sc);
      // Head, body, fluffy cotton tail & long rabbit feet
      addCircleSubpath(ctx, 0, -3.5 * sc, 7.4 * sc);
      addRoundRectSubpath(ctx, -5.6 * sc, 2.2 * sc, 11.2 * sc, 8.8 * sc, 4 * sc);
      addCircleSubpath(ctx, -facing * 6.8 * sc, 8.2 * sc, 2.8 * sc);
      addRoundRectSubpath(ctx, (-6.8 + stride) * sc, 11.2 * sc, 7.6 * sc, 3.2 * sc, 1.6 * sc);
      addRoundRectSubpath(ctx, (-0.4 - stride) * sc, 11.2 * sc, 7.6 * sc, 3.2 * sc, 1.6 * sc);
      return;
    }

    if (charId === 'char_slime') {
      const wobble = Math.sin(time * 10) * 1.8;
      ctx.moveTo(-hw - 1, hh);
      ctx.quadraticCurveTo(-hw - 2, -2 + wobble, -hw * 0.55, -hh + 3 - wobble);
      ctx.quadraticCurveTo(0, -hh - 2 + wobble, hw * 0.55, -hh + 3 - wobble);
      ctx.quadraticCurveTo(hw + 2, -2 + wobble, hw + 1, hh);
      ctx.closePath();
      return;
    }

    if (charId === 'char_skeleton') {
      const sc = h / 26;
      // Rounded cranium + jawbone + rib torso + leg bones
      addCircleSubpath(ctx, 0, -5.8 * sc, 7.8 * sc);
      addRoundRectSubpath(ctx, -4.8 * sc, -1.2 * sc, 9.6 * sc, 4.8 * sc, 1.8 * sc);
      addRoundRectSubpath(ctx, -5.2 * sc, 3.5 * sc, 10.4 * sc, 6.5 * sc, 2 * sc);
      addCapsuleSubpath(ctx, -3.2 * sc, 9.5 * sc, (-3.6 + stride * 0.8) * sc, 13.2 * sc, 1.7 * sc);
      addCapsuleSubpath(ctx, 3.2 * sc, 9.5 * sc, (3.6 - stride * 0.8) * sc, 13.2 * sc, 1.7 * sc);
      return;
    }

    if (charId === 'char_astronaut') {
      const sc = h / 26;
      // Oxygen life-support backpack + round space helmet + pressurized suit + lunar boots
      addRoundRectSubpath(ctx, -facing * 9.5 * sc - 2.5 * sc, -3 * sc, 5.5 * sc, 10.5 * sc, 2 * sc);
      addCircleSubpath(ctx, 0, -4.2 * sc, 8.2 * sc);
      addRoundRectSubpath(ctx, -6.5 * sc, 2.2 * sc, 13 * sc, 8.8 * sc, 3.2 * sc);
      addRoundRectSubpath(ctx, (-6.2 + stride * 0.7) * sc, 10.5 * sc, 5.2 * sc, 3.8 * sc, 1.6 * sc);
      addRoundRectSubpath(ctx, (1.0 - stride * 0.7) * sc, 10.5 * sc, 5.2 * sc, 3.8 * sc, 1.6 * sc);
      return;
    }

    if (charId === 'char_tvhead') {
      const sc = h / 26;
      // Wide retro CRT monitor head + suited runner body + feet
      addRoundRectSubpath(ctx, -10.5 * sc, -12.5 * sc, 21 * sc, 14.5 * sc, 3 * sc);
      addRoundRectSubpath(ctx, -6.2 * sc, 2.0 * sc, 12.4 * sc, 8.6 * sc, 2.5 * sc);
      addRoundRectSubpath(ctx, (-5.8 + stride * 0.8) * sc, 10.2 * sc, 4.8 * sc, 3.6 * sc, 1.5 * sc);
      addRoundRectSubpath(ctx, (1.0 - stride * 0.8) * sc, 10.2 * sc, 4.8 * sc, 3.6 * sc, 1.5 * sc);
      return;
    }

    if (charId === 'char_phantom') {
      ctx.moveTo(-hw, -hh + 8);
      ctx.quadraticCurveTo(-hw, -hh - 2, 0, -hh - 2);
      ctx.quadraticCurveTo(hw, -hh - 2, hw, -hh + 8);
      ctx.lineTo(hw + 1, hh);
      const wave = Math.sin(time * 9) * 2.2;
      ctx.lineTo(hw * 0.5, hh - 4 + wave);
      ctx.lineTo(0, hh + 1 - wave);
      ctx.lineTo(-hw * 0.5, hh - 4 + wave);
      ctx.lineTo(-hw - 1, hh);
      ctx.closePath();
      return;
    }

    if (charId === 'char_monolith') {
      ctx.moveTo(0, -hh - 4);
      ctx.lineTo(hw - 2, -hh + 5);
      ctx.lineTo(hw, hh - 3);
      ctx.lineTo(0, hh + 2);
      ctx.lineTo(-hw, hh - 3);
      ctx.lineTo(-hw + 2, -hh + 5);
      ctx.closePath();
      return;
    }

    const rad = charId === 'char_cyborg' ? 3 : 5;
    addRoundRectSubpath(ctx, -hw, -hh, w, h, rad);
  }

  function resolveCharacterColors(charId, pal) {
    if (!pal || !pal.colored) {
      return {
        colored: false,
        primary: pal.playerPrimary,
        secondary: pal.playerSecondary,
        mid: pal.playerMid,
        accent: pal.playerMid,
        eyeWhite: pal.playerSecondary,
        pupil: pal.playerPrimary
      };
    }
    const isLight = pal.mode === 'light';
    switch (charId) {
      case 'char_classic':
        return {
          colored: true,
          primary: isLight ? '#4f46e5' : '#6366f1',
          secondary: '#ffffff',
          mid: '#38bdf8',
          accent: '#fbbf24',
          eyeWhite: '#ffffff',
          pupil: '#0f172a'
        };
      case 'char_mickey':
        return {
          colored: true,
          primary: '#18181b',
          secondary: '#fde6d2',
          mid: '#ef4444',
          accent: '#facc15',
          glove: '#ffffff',
          eyeWhite: '#fde6d2',
          pupil: '#18181b'
        };
      case 'char_stickman':
        return {
          colored: true,
          primary: isLight ? '#0284c7' : '#38bdf8',
          secondary: '#ffffff',
          mid: '#f43f5e',
          accent: '#fbbf24',
          eyeWhite: '#ffffff',
          pupil: '#0f172a'
        };
      case 'char_tom':
        return {
          colored: true,
          primary: '#5b6e8c',
          secondary: '#f8fafc',
          mid: '#f472b6',
          accent: '#bef264',
          eyeWhite: '#d9f99d',
          pupil: '#0f172a'
        };
      case 'char_jerry':
        return {
          colored: true,
          primary: '#b45309',
          secondary: '#fde68a',
          mid: '#f9a8d4',
          accent: '#78350f',
          eyeWhite: '#ffffff',
          pupil: '#1c1917'
        };
      case 'char_bugs_bunny':
        return {
          colored: true,
          primary: '#7c8ba1',
          secondary: '#ffffff',
          mid: '#f472b6',
          accent: '#cbd5e1',
          eyeWhite: '#ffffff',
          pupil: '#0f172a'
        };
      case 'char_donald_duck':
        return {
          colored: true,
          primary: isLight ? '#f8fafc' : '#ffffff',
          secondary: '#2563eb',
          mid: '#f97316',
          accent: '#ef4444',
          eyeWhite: '#ffffff',
          pupil: '#0f172a'
        };
      case 'char_cat':
        return {
          colored: true,
          primary: isLight ? '#f59e0b' : '#fde68a',
          secondary: '#1e293b',
          mid: '#f472b6',
          accent: '#ffffff',
          eyeWhite: '#1e293b',
          pupil: '#1e293b'
        };
      case 'char_bunny':
        return {
          colored: true,
          primary: '#8b5cf6',
          secondary: '#ffffff',
          mid: '#f43f5e',
          accent: '#ddd6fe',
          eyeWhite: '#ffffff',
          pupil: '#1e1b4b'
        };
      case 'char_shinobi':
        return {
          colored: true,
          primary: '#1e293b',
          secondary: '#fde68a',
          mid: '#ef4444',
          accent: '#dc2626',
          eyeWhite: '#fde68a',
          pupil: '#0f172a'
        };
      case 'char_slime':
        return {
          colored: true,
          primary: isLight ? '#059669' : '#10b981',
          secondary: '#064e3b',
          mid: '#6ee7b7',
          accent: '#ecfdf5',
          eyeWhite: '#064e3b',
          pupil: '#ffffff'
        };
      case 'char_knight':
        return {
          colored: true,
          primary: isLight ? '#64748b' : '#cbd5e1',
          secondary: '#0f172a',
          mid: '#fbbf24',
          accent: '#f59e0b',
          eyeWhite: '#0f172a',
          pupil: '#38bdf8'
        };
      case 'char_skeleton':
        return {
          colored: true,
          primary: isLight ? '#cbd5e1' : '#f8fafc',
          secondary: '#0f172a',
          mid: '#22d3ee',
          accent: '#94a3b8',
          eyeWhite: '#0f172a',
          pupil: '#22d3ee'
        };
      case 'char_imp':
        return {
          colored: true,
          primary: '#e11d48',
          secondary: '#fef08a',
          mid: '#fbbf24',
          accent: '#881337',
          eyeWhite: '#fef08a',
          pupil: '#450a0a'
        };
      case 'char_astronaut':
        return {
          colored: true,
          primary: isLight ? '#dbeafe' : '#f8fafc',
          secondary: '#0891b2',
          mid: '#f97316',
          accent: '#bae6fd',
          eyeWhite: '#0891b2',
          pupil: '#e0f2fe'
        };
      case 'char_phantom':
        return {
          colored: true,
          primary: '#7c3aed',
          secondary: '#67e8f9',
          mid: '#c084fc',
          accent: '#312e81',
          eyeWhite: '#67e8f9',
          pupil: '#ffffff'
        };
      case 'char_tvhead':
        return {
          colored: true,
          primary: '#334155',
          secondary: '#052e16',
          mid: '#4ade80',
          accent: '#fbbf24',
          eyeWhite: '#052e16',
          pupil: '#4ade80'
        };
      case 'char_cyborg':
        return {
          colored: true,
          primary: '#2563eb',
          secondary: '#0f172a',
          mid: '#ef4444',
          accent: '#fbbf24',
          eyeWhite: '#0f172a',
          pupil: '#ef4444'
        };
      case 'char_ronin':
        return {
          colored: true,
          primary: '#312e81',
          secondary: '#fef08a',
          mid: '#eab308',
          accent: '#ef4444',
          eyeWhite: '#fef08a',
          pupil: '#ffffff'
        };
      case 'char_monolith':
        return {
          colored: true,
          primary: '#4c1d95',
          secondary: '#fbbf24',
          mid: '#f43f5e',
          accent: '#a855f7',
          eyeWhite: '#fbbf24',
          pupil: '#be123c'
        };
      default:
        return {
          colored: true,
          primary: '#6366f1',
          secondary: '#ffffff',
          mid: '#38bdf8',
          accent: '#fbbf24',
          eyeWhite: '#ffffff',
          pupil: '#0f172a'
        };
    }
  }

  function resolveSkinColors(skinId, cc, pal) {
    if (!pal || !pal.colored) {
      return {
        primary: pal.playerPrimary,
        secondary: pal.playerSecondary,
        mid: pal.playerMid
      };
    }
    switch (skinId) {
      case 'skin_solid':
        return { primary: cc.primary, secondary: cc.secondary, mid: cc.mid };
      case 'skin_steamboat':
        return { primary: '#18181b', secondary: '#facc15', mid: '#ef4444' };
      case 'skin_sketch':
        return { primary: '#fef3c7', secondary: '#1e3a8a', mid: '#2563eb' };
      case 'skin_inverted':
        return { primary: '#4c1d95', secondary: '#22d3ee', mid: '#c084fc' };
      case 'skin_tuxedo':
        return { primary: '#0f172a', secondary: '#ffffff', mid: '#e11d48' };
      case 'skin_toon_ink':
        return { primary: '#312e81', secondary: '#38bdf8', mid: '#f472b6' };
      case 'skin_split':
        return { primary: '#f43f5e', secondary: '#ffffff', mid: '#06b6d4' };
      case 'skin_checker':
        return { primary: '#6d28d9', secondary: '#fbbf24', mid: '#f472b6' };
      case 'skin_tiger':
        return { primary: '#f97316', secondary: '#18181b', mid: '#fde047' };
      case 'skin_halftone':
        return { primary: '#db2777', secondary: '#fde047', mid: '#38bdf8' };
      case 'skin_bandage':
        return { primary: '#fde68a', secondary: '#92400e', mid: '#d97706' };
      case 'skin_scanline':
        return { primary: '#0f172a', secondary: '#34d399', mid: '#10b981' };
      case 'skin_xray':
        return { primary: '#0c4a6e', secondary: '#67e8f9', mid: '#38bdf8' };
      case 'skin_hollow':
        return { primary: '#f59e0b', secondary: '#2e1065', mid: '#fde047' };
      case 'skin_stardust':
        return { primary: '#1e1b4b', secondary: '#fde047', mid: '#c084fc' };
      case 'skin_glitch':
        return { primary: '#111827', secondary: '#22d3ee', mid: '#f43f5e' };
      case 'skin_sailor':
        return { primary: '#2563eb', secondary: '#ffffff', mid: '#ef4444' };
      case 'skin_polka':
        return { primary: '#e11d48', secondary: '#ffffff', mid: '#fde047' };
      case 'skin_chevron':
        return { primary: '#1e3a8a', secondary: '#22d3ee', mid: '#818cf8' };
      case 'skin_harlequin':
        return { primary: '#581c87', secondary: '#f43f5e', mid: '#fbbf24' };
      case 'skin_filmstrip':
        return { primary: '#78350f', secondary: '#fef3c7', mid: '#fbbf24' };
      case 'skin_mosaic':
        return { primary: '#0f172a', secondary: '#14b8a6', mid: '#fb7185' };
      case 'skin_eclipse':
        return { primary: '#1e1b4b', secondary: '#fde047', mid: '#f97316' };
      case 'skin_cipher':
        return { primary: '#052e16', secondary: '#4ade80', mid: '#10b981' };
      default:
        return { primary: cc.primary, secondary: cc.secondary, mid: cc.mid };
    }
  }

  function drawSkinFill(ctx, skinId, charId, w, h, facing, vx, vy, pal, time) {
    const bx = -w - 10;
    const by = -h - 14;
    const bw = (w + 10) * 2;
    const bh = (h + 14) * 2;
    const sc = h / 26;

    const cc = resolveCharacterColors(charId, pal);
    const sk = resolveSkinColors(skinId, cc, pal);
    const primary = sk.primary;
    const secondary = sk.secondary;
    const mid = sk.mid;

    ctx.save();
    applyBodyPath(ctx, charId, w, h, facing, vx, vy, time);
    ctx.clip();

    if (skinId === 'skin_inverted') {
      ctx.fillStyle = primary;
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = secondary;
      fillRoundRect(ctx, -w * 0.5 + 3, -h * 0.5 + 3, w - 6, h - 6, 3);
    } else if (skinId === 'skin_steamboat') {
      // Classic 1928 vintage two-tone: dark upper body/ears + contrasting buttoned shorts below!
      ctx.fillStyle = primary;
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = mid;
      ctx.fillRect(bx, 3.2, bw, bh);
      // Crisp belt divider + twin vintage oval shorts buttons
      ctx.fillStyle = secondary;
      ctx.fillRect(bx, 2.6, bw, 1.6);
      ctx.fillStyle = primary;
      ctx.beginPath();
      addEllipseSubpath(ctx, -2.5, 6.6, 1.3, 2.1);
      addEllipseSubpath(ctx, 2.5, 6.6, 1.3, 2.1);
      ctx.fill();
    } else if (skinId === 'skin_sketch') {
      // Animator paper base + diagonal graphite crosshatch slivers
      ctx.fillStyle = primary;
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = mid;
      ctx.save();
      ctx.rotate(-0.55);
      const jitter = Math.floor(time * 8) % 2 === 0 ? 0 : 1.5;
      for (let gx = -bw; gx < bw; gx += 4.5) {
        ctx.fillRect(gx + jitter, -bh, 1.5, bh * 2);
      }
      ctx.restore();
    } else if (skinId === 'skin_tuxedo') {
      // Formal monochrome suit + crisp V-lapel shirt + bow tie + buttons
      ctx.fillStyle = primary;
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = secondary;
      ctx.beginPath();
      ctx.moveTo(-5.5, 1);
      ctx.lineTo(5.5, 1);
      ctx.lineTo(0, 11);
      ctx.closePath();
      ctx.fill();
      // Bow tie
      ctx.fillStyle = mid;
      ctx.beginPath();
      ctx.moveTo(0, 3.2);
      ctx.lineTo(-4.2, 1.4);
      ctx.lineTo(-4.2, 5.0);
      ctx.moveTo(0, 3.2);
      ctx.lineTo(4.2, 1.4);
      ctx.lineTo(4.2, 5.0);
      ctx.closePath();
      ctx.fill();
    } else if (skinId === 'skin_toon_ink') {
      ctx.fillStyle = primary;
      ctx.fillRect(bx, by, bw, bh);
      // Glossy vintage ink highlight crescents
      ctx.fillStyle = secondary;
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      addEllipseSubpath(ctx, -3.5, -7.5, 3.8, 1.6, -0.4);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = mid;
      const dropY = ((time * 16) % 18) - 8;
      ctx.beginPath();
      ctx.arc(-4, dropY, 2, 0, Math.PI * 2);
      ctx.arc(4.5, ((dropY + 9) % 18) - 8, 1.6, 0, Math.PI * 2);
      ctx.fill();
    } else if (skinId === 'skin_split') {
      ctx.fillStyle = primary;
      ctx.fillRect(bx, by, -bx, bh);
      ctx.fillStyle = mid;
      ctx.fillRect(0, by, bw, bh);
    } else if (skinId === 'skin_checker') {
      ctx.fillStyle = primary;
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = secondary;
      const cell = 6.5;
      for (let gx = -32; gx < 32; gx += cell) {
        for (let gy = -32; gy < 32; gy += cell) {
          const ix = Math.floor((gx + 32) / cell);
          const iy = Math.floor((gy + 32) / cell);
          if ((ix + iy) % 2 === 1) {
            ctx.fillRect(gx, gy, cell, cell);
          }
        }
      }
    } else if (skinId === 'skin_tiger') {
      ctx.fillStyle = primary;
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = secondary;
      for (let sy = -28; sy < 28; sy += 6.5) {
        ctx.beginPath();
        ctx.moveTo(-30, sy);
        ctx.lineTo(8, sy + 2.2);
        ctx.lineTo(-30, sy + 3.6);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(30, sy + 3);
        ctx.lineTo(-6, sy + 5.2);
        ctx.lineTo(30, sy + 6.6);
        ctx.closePath();
        ctx.fill();
      }
    } else if (skinId === 'skin_halftone') {
      ctx.fillStyle = primary;
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = secondary;
      for (let gx = -26; gx <= 26; gx += 5.2) {
        for (let gy = -26; gy <= 26; gy += 5.2) {
          ctx.beginPath();
          ctx.arc(gx, gy, 1.45, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else if (skinId === 'skin_bandage') {
      ctx.fillStyle = primary;
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = mid;
      ctx.save();
      ctx.rotate(0.28);
      for (let gy = -26; gy < 26; gy += 7) {
        ctx.fillRect(-34, gy, 68, 2.5);
      }
      ctx.rotate(-0.56);
      for (let gy = -26; gy < 26; gy += 9) {
        ctx.fillStyle = secondary;
        ctx.fillRect(-34, gy, 68, 1.6);
      }
      ctx.restore();
    } else if (skinId === 'skin_scanline') {
      ctx.fillStyle = primary;
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = mid;
      const scroll = (time * 22) % 6;
      for (let gy = -28 + scroll; gy < 28; gy += 6) {
        ctx.fillRect(bx, gy, bw, 2.2);
      }
    } else if (skinId === 'skin_xray') {
      ctx.fillStyle = primary;
      ctx.fillRect(bx, by, bw, bh);
      const flash = Math.sin(time * 9) > -0.2;
      if (flash) {
        ctx.fillStyle = secondary;
        fillRoundRect(ctx, -w * 0.36, -h * 0.36, w * 0.72, h * 0.72, 3);
        ctx.fillStyle = primary;
        ctx.fillRect(-1.2, -7, 2.4, 15);
        for (let ry = -4; ry <= 4; ry += 4) {
          ctx.fillRect(-5.5, ry, 11, 1.8);
        }
      }
    } else if (skinId === 'skin_hollow') {
      ctx.fillStyle = primary;
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = secondary;
      fillRoundRect(ctx, -w * 0.5 + 4, -h * 0.5 + 4, w - 8, h - 8, 2);
      const pulse = 3.2 + Math.sin(time * 8) * 1.1;
      ctx.fillStyle = primary;
      fillDiamond(ctx, 0, 2, pulse, pulse * 1.2);
    } else if (skinId === 'skin_stardust') {
      ctx.fillStyle = primary;
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = secondary;
      for (let i = 0; i < 11; i++) {
        const sx = Math.sin(i * 3.7 + time * 0.9) * 11;
        const sy = (((i * 7.3 - time * 10) % 34) + 34) % 34 - 17;
        const sz = (i % 3 === 0 ? 2.3 : 1.4) * (0.6 + Math.abs(Math.sin(time * 5 + i)) * 0.5);
        fillDiamond(ctx, sx, sy, sz, sz);
      }
    } else if (skinId === 'skin_glitch') {
      ctx.fillStyle = primary;
      ctx.fillRect(bx, by, bw, bh);
      const glitchTick = Math.floor(time * 14);
      if (glitchTick % 3 === 0) {
        ctx.fillStyle = mid;
        ctx.fillRect(bx, -3, bw, 4);
        ctx.fillStyle = secondary;
        ctx.fillRect(-w * 0.4, 5, w * 0.65, 3);
      }
    } else if (skinId === 'skin_sailor') {
      // Nautical deck tunic: crisp collar stripes + V-neck kerchief + front bow knot
      ctx.fillStyle = primary;
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = mid;
      ctx.fillRect(bx, 6.2, bw, bh);
      // Double nautical collar stripes
      ctx.fillStyle = secondary;
      ctx.fillRect(bx, 1.2, bw, 1.2);
      ctx.fillRect(bx, 3.1, bw, 1.0);
      // V-kerchief & bow tie
      ctx.beginPath();
      ctx.moveTo(-5.2, 1.2);
      ctx.lineTo(5.2, 1.2);
      ctx.lineTo(0, 7.6);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = mid;
      ctx.beginPath();
      ctx.moveTo(0, 4.6);
      ctx.lineTo(-4.4, 2.8);
      ctx.lineTo(-4.4, 6.4);
      ctx.moveTo(0, 4.6);
      ctx.lineTo(4.4, 2.8);
      ctx.lineTo(4.4, 6.4);
      ctx.closePath();
      ctx.fill();
    } else if (skinId === 'skin_polka') {
      // Staggered vintage cartoon polka-dot weave
      ctx.fillStyle = primary;
      ctx.fillRect(bx, by, bw, bh);
      const pulse = 1 + Math.sin(time * 4.5) * 0.14;
      let rowIdx = 0;
      for (let gy = -28; gy <= 28; gy += 6.2) {
        const xShift = rowIdx % 2 === 0 ? 0 : 3.4;
        for (let gx = -28; gx <= 28; gx += 6.8) {
          ctx.fillStyle = (rowIdx + Math.round(gx)) % 3 === 0 ? mid : secondary;
          ctx.beginPath();
          ctx.arc(gx + xShift, gy, 1.85 * pulse, 0, Math.PI * 2);
          ctx.fill();
        }
        rowIdx += 1;
      }
    } else if (skinId === 'skin_chevron') {
      // Animated upward velocity chevrons
      ctx.fillStyle = primary;
      ctx.fillRect(bx, by, bw, bh);
      const shift = ((time * 18) % 9);
      for (let gy = -30 - shift; gy <= 34; gy += 9) {
        ctx.fillStyle = secondary;
        ctx.beginPath();
        ctx.moveTo(-30, gy + 7);
        ctx.lineTo(0, gy);
        ctx.lineTo(30, gy + 7);
        ctx.lineTo(30, gy + 9.8);
        ctx.lineTo(0, gy + 2.8);
        ctx.lineTo(-30, gy + 9.8);
        ctx.closePath();
        ctx.fill();
      }
    } else if (skinId === 'skin_harlequin') {
      // Theatrical interlocking diamond argyle lattice
      ctx.fillStyle = primary;
      ctx.fillRect(bx, by, bw, bh);
      const stepX = 8.4;
      const stepY = 10.4;
      for (let gy = -32; gy <= 32; gy += stepY) {
        for (let gx = -32; gx <= 32; gx += stepX) {
          ctx.fillStyle = secondary;
          fillDiamond(ctx, gx, gy, stepX * 0.46, stepY * 0.46);
          ctx.fillStyle = mid;
          fillDiamond(ctx, gx + stepX * 0.5, gy + stepY * 0.5, 1.7, 2.2);
        }
      }
    } else if (skinId === 'skin_filmstrip') {
      // Scrolling 35mm cinema reel perforations & frame dividers
      ctx.fillStyle = primary;
      ctx.fillRect(bx, by, bw, bh);
      const scroll = (time * 20) % 10;
      ctx.fillStyle = mid;
      for (let fy = -30 + scroll; fy <= 30; fy += 10) {
        ctx.fillRect(bx, fy, bw, 1.6);
      }
      ctx.fillStyle = secondary;
      const perfScroll = (time * 20) % 5;
      for (let py = -30 + perfScroll; py <= 30; py += 5) {
        fillRoundRect(ctx, -8.8, py, 2.2, 2.8, 0.5);
        fillRoundRect(ctx, 6.6, py, 2.2, 2.8, 0.5);
      }
    } else if (skinId === 'skin_mosaic') {
      // Faceted geometric shard plates
      ctx.fillStyle = primary;
      ctx.fillRect(bx, by, bw, bh);
      for (let i = 0; i < 14; i++) {
        const mx = ((i * 11) % 28) - 14;
        const my = Math.floor(i / 2.2) * 7 - 17;
        ctx.fillStyle = i % 2 === 0 ? secondary : mid;
        ctx.beginPath();
        ctx.moveTo(mx, my - 3.6);
        ctx.lineTo(mx + 4.4, my - 0.8);
        ctx.lineTo(mx + 2.2, my + 3.8);
        ctx.lineTo(mx - 3.2, my + 2.1);
        ctx.closePath();
        ctx.fill();
      }
    } else if (skinId === 'skin_eclipse') {
      // Concentric lunar corona rings & eclipsed crescent core
      ctx.fillStyle = primary;
      ctx.fillRect(bx, by, bw, bh);
      const wave = (time * 6) % 8;
      ctx.fillStyle = mid;
      fillRing(ctx, 0, -1, 7 + wave, 5.2 + wave);
      fillRing(ctx, 0, -1, 14 + wave * 0.7, 12.4 + wave * 0.7);
      ctx.fillStyle = secondary;
      ctx.beginPath();
      ctx.arc(0, -1, 5.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = primary;
      ctx.beginPath();
      ctx.arc(2.1, -2.0, 4.7, 0, Math.PI * 2);
      ctx.fill();
    } else if (skinId === 'skin_cipher') {
      // Cascading vertical binary micro-glyph columns
      ctx.fillStyle = primary;
      ctx.fillRect(bx, by, bw, bh);
      for (let col = -3; col <= 3; col++) {
        const cx = col * 3.8;
        const speed = 15 + (Math.abs(col) % 3) * 6;
        const headY = (((time * speed + col * 9.5) % 38) + 38) % 38 - 19;
        ctx.fillStyle = secondary;
        ctx.fillRect(cx - 1.1, headY, 2.2, 3.0);
        ctx.fillStyle = mid;
        ctx.fillRect(cx - 1.0, headY - 4.4, 2.0, 2.4);
        ctx.fillRect(cx - 0.9, headY - 8.2, 1.8, 1.8);
      }
    } else {
      ctx.fillStyle = primary;
      ctx.fillRect(bx, by, bw, bh);
      // Iconic signature garment color blocks on base skin in Colored Mode
      if (cc.colored) {
        if (charId === 'char_mickey') {
          // Red buttoned shorts + golden shoes + white gloves
          ctx.fillStyle = cc.mid;
          ctx.fillRect(-6.8 * sc, 2.8 * sc, 13.6 * sc, 6.2 * sc);
          ctx.fillStyle = cc.accent;
          ctx.fillRect(bx, 9.6 * sc, bw, bh);
          ctx.fillStyle = cc.glove || '#ffffff';
          ctx.fillRect(bx, 1.5 * sc, -bx - 6.6 * sc, 8.0 * sc);
          ctx.fillRect(6.6 * sc, 1.5 * sc, bw, 8.0 * sc);
        } else if (charId === 'char_donald_duck') {
          // Royal blue sailor cap + royal blue sailor tunic + bright orange webbed feet
          ctx.fillStyle = cc.secondary;
          ctx.fillRect(bx, by, bw, -by - 9.8 * sc);
          ctx.fillRect(-7.2 * sc, 1.4 * sc, 14.4 * sc, 5.6 * sc);
          ctx.fillStyle = cc.mid;
          ctx.fillRect(bx, 9.6 * sc, bw, bh);
        } else if (charId === 'char_tom') {
          // Snowy white cat paws
          ctx.fillStyle = cc.secondary;
          ctx.fillRect(bx, 10.2 * sc, bw, bh);
        } else if (charId === 'char_bugs_bunny') {
          // Crisp white rabbit feet & gloves
          ctx.fillStyle = cc.secondary;
          ctx.fillRect(bx, 10.2 * sc, bw, bh);
          ctx.fillRect(bx, 2.0 * sc, -bx - 6.8 * sc, 7.6 * sc);
          ctx.fillRect(6.8 * sc, 2.0 * sc, bw, 7.6 * sc);
        }
      }
    }

    ctx.restore();
  }

  function drawCharacterFeatures(ctx, charId, skinId, w, h, facing, vx, vy, pal, time) {
    const hw = w * 0.5;
    const hh = h * 0.5;
    const sc = h / 26;
    const cc = resolveCharacterColors(charId, pal);
    const sk = resolveSkinColors(skinId, cc, pal);
    const invertedInterior =
      skinId === 'skin_inverted' || skinId === 'skin_hollow';
    const eyeFill = cc.colored
      ? cc.eyeWhite
      : invertedInterior
        ? pal.playerPrimary
        : pal.playerSecondary;
    const crestFill = cc.colored ? sk.primary : pal.playerPrimary;
    const lookX = facing * 2.3 + Math.max(-2, Math.min(2, vx * 0.005));
    const lookY = Math.max(-2, Math.min(2.2, vy * 0.003));

    if (charId === 'char_mickey') {
      const mFace = cc.colored ? cc.secondary : pal.playerSecondary;
      const mInk = cc.colored ? cc.pupil : pal.playerPrimary;
      // Whippy curved vintage mouse tail behind character
      const wag = Math.sin(time * 11) * 3.2 * sc;
      ctx.fillStyle = cc.colored ? cc.primary : crestFill;
      ctx.beginPath();
      ctx.moveTo(-facing * 5 * sc, 7.5 * sc);
      ctx.quadraticCurveTo(-facing * 12 * sc, (6 + wag) * sc, -facing * 14.5 * sc, (1.5 - wag) * sc);
      ctx.quadraticCurveTo(-facing * 11.5 * sc, (8.2 + wag) * sc, -facing * 5 * sc, 9.4 * sc);
      ctx.closePath();
      ctx.fill();

      // Classic 1928 widow's-peak cartoon face mask
      ctx.fillStyle = mFace;
      ctx.beginPath();
      addEllipseSubpath(ctx, facing * 0.6 * sc, -5.8 * sc, 2.9 * sc, 4.4 * sc);
      addEllipseSubpath(ctx, facing * 4.2 * sc, -5.8 * sc, 2.7 * sc, 4.2 * sc);
      addEllipseSubpath(ctx, facing * 3.2 * sc, -2.2 * sc, 5.8 * sc, 3.2 * sc);
      ctx.fill();

      // Pie-cut vintage cartoon eyes
      const blink = Math.sin(time * 2.9) > 0.985;
      if (blink) {
        ctx.fillStyle = mInk;
        ctx.fillRect(facing * 0.2 * sc, -5.5 * sc, 3 * sc, 1.2 * sc);
        ctx.fillRect(facing * 3.8 * sc, -5.5 * sc, 3 * sc, 1.2 * sc);
      } else {
        fillPieEye(
          ctx,
          facing * 1.1 * sc,
          -5.5 * sc,
          1.45 * sc,
          2.7 * sc,
          facing,
          mInk,
          mFace
        );
        fillPieEye(
          ctx,
          facing * 4.4 * sc,
          -5.5 * sc,
          1.35 * sc,
          2.55 * sc,
          facing,
          mInk,
          mFace
        );
      }

      // Iconic shiny button nose at tip of snout
      ctx.fillStyle = mInk;
      ctx.beginPath();
      addEllipseSubpath(ctx, facing * 9.8 * sc, -3.8 * sc, 2.3 * sc, 1.65 * sc, -facing * 0.2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      if (!cc.colored) ctx.fillStyle = pal.playerSecondary;
      ctx.beginPath();
      ctx.arc(facing * 9.4 * sc, -4.3 * sc, 0.65 * sc, 0, Math.PI * 2);
      ctx.fill();

      // Cheerful cartoon smile crescent
      ctx.fillStyle = mInk;
      ctx.beginPath();
      ctx.moveTo(facing * 0.5 * sc, -1.6 * sc);
      ctx.quadraticCurveTo(facing * 3.5 * sc, 0.8 * sc, facing * 6.2 * sc, -1.4 * sc);
      ctx.quadraticCurveTo(facing * 3.5 * sc, -0.3 * sc, facing * 0.5 * sc, -1.6 * sc);
      ctx.closePath();
      ctx.fill();

      // Classic two shorts buttons (unless tuxedo overrides torso)
      if (skinId !== 'skin_tuxedo') {
        ctx.fillStyle = cc.colored ? cc.accent : pal.playerSecondary;
        ctx.beginPath();
        addEllipseSubpath(ctx, (-1.8 + facing * 0.8) * sc, 6.2 * sc, 1.15 * sc, 1.9 * sc);
        addEllipseSubpath(ctx, (2.2 + facing * 0.8) * sc, 6.2 * sc, 1.15 * sc, 1.9 * sc);
        ctx.fill();
      }
      return;
    }

    if (charId === 'char_tom') {
      const tomWhite = cc.colored ? cc.secondary : pal.playerSecondary;
      const tomPink = cc.colored ? cc.mid : pal.playerSecondary;
      const tomEye = cc.colored ? cc.eyeWhite : pal.playerSecondary;
      const tomInk = cc.colored ? cc.pupil : pal.playerPrimary;
      // Whippy tomcat tail behind body with contrasting white tail tip
      const wag = Math.sin(time * 10) * 3.4 * sc;
      const tipX = -facing * 15.2 * sc;
      const tipY = (1.6 - wag) * sc;
      ctx.fillStyle = crestFill;
      fillCapsule(ctx, -facing * 5.2 * sc, 8.2 * sc, -facing * 10.6 * sc, (6.2 + wag * 0.5) * sc, 1.85 * sc);
      fillCapsule(ctx, -facing * 10.6 * sc, (6.2 + wag * 0.5) * sc, tipX, tipY, 1.75 * sc);
      ctx.fillStyle = tomWhite;
      ctx.beginPath();
      ctx.arc(tipX, tipY, 2.35 * sc, 0, Math.PI * 2);
      ctx.fill();

      // Inner ear triangles
      ctx.fillStyle = tomPink;
      ctx.beginPath();
      ctx.moveTo(-7.6 * sc, -6.6 * sc);
      ctx.lineTo(-9.2 * sc, -13.4 * sc);
      ctx.lineTo(-3.8 * sc, -9.4 * sc);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(3.8 * sc, -9.4 * sc);
      ctx.lineTo(9.2 * sc, -13.4 * sc);
      ctx.lineTo(7.6 * sc, -6.6 * sc);
      ctx.closePath();
      ctx.fill();

      // Lighter cartoon muzzle puff + chest bib
      ctx.fillStyle = tomWhite;
      ctx.beginPath();
      addEllipseSubpath(ctx, facing * 2.6 * sc, -1.8 * sc, 5.4 * sc, 2.8 * sc);
      if (skinId !== 'skin_tuxedo' && skinId !== 'skin_sailor') {
        addEllipseSubpath(ctx, facing * 0.8 * sc, 5.8 * sc, 3.2 * sc, 3.4 * sc);
      }
      ctx.fill();

      // Tall oval cartoon cat eyes + scheming arched brows + slit pupils
      ctx.fillStyle = tomEye;
      ctx.beginPath();
      addEllipseSubpath(ctx, (facing * 0.4 - 1.8) * sc, -5.8 * sc, 1.9 * sc, 3.0 * sc);
      addEllipseSubpath(ctx, (facing * 0.4 + 2.6) * sc, -5.8 * sc, 1.9 * sc, 3.0 * sc);
      ctx.fill();

      ctx.fillStyle = tomInk;
      ctx.beginPath();
      addEllipseSubpath(ctx, (facing * 1.1 - 1.8) * sc, -5.6 * sc, 0.85 * sc, 1.9 * sc);
      addEllipseSubpath(ctx, (facing * 1.1 + 2.6) * sc, -5.6 * sc, 0.85 * sc, 1.9 * sc);
      ctx.fill();

      // Arched tomcat eyebrows
      fillCapsule(ctx, (-3.8 + facing * 0.3) * sc, -8.8 * sc, (-0.4 + facing * 0.3) * sc, -7.8 * sc, 0.75 * sc);
      fillCapsule(ctx, (1.2 + facing * 0.3) * sc, -7.8 * sc, (4.6 + facing * 0.3) * sc, -8.8 * sc, 0.75 * sc);

      // Triangular cat nose + sly smirk + 3 cheek whiskers per side
      ctx.fillStyle = cc.colored ? tomPink : tomInk;
      fillDiamond(ctx, facing * 5.8 * sc, -2.5 * sc, 1.6 * sc, 1.15 * sc);
      ctx.fillStyle = tomInk;
      fillCapsule(ctx, facing * 1.2 * sc, -0.8 * sc, facing * 4.8 * sc, -0.5 * sc, 0.55 * sc);

      ctx.fillRect(-12.2 * sc, -3.2 * sc, 4.2 * sc, 0.75 * sc);
      ctx.fillRect(-12.0 * sc, -1.6 * sc, 4.0 * sc, 0.75 * sc);
      ctx.fillRect(8.0 * sc, -3.2 * sc, 4.2 * sc, 0.75 * sc);
      ctx.fillRect(8.0 * sc, -1.6 * sc, 4.0 * sc, 0.75 * sc);
      return;
    }

    if (charId === 'char_jerry') {
      const jerryTan = cc.colored ? cc.secondary : pal.playerSecondary;
      const jerryPink = cc.colored ? cc.mid : pal.playerSecondary;
      const jerryInk = cc.colored ? cc.pupil : pal.playerPrimary;
      const earBob = Math.sin(time * 10) * 0.8 * sc;
      const wag = Math.sin(time * 13) * 3.0 * sc;
      // Thin playful curved mouse tail
      ctx.fillStyle = crestFill;
      fillCapsule(ctx, -facing * 4.4 * sc, 7.6 * sc, -facing * 10.2 * sc, (5.8 + wag * 0.6) * sc, 1.05 * sc);
      fillCapsule(ctx, -facing * 10.2 * sc, (5.8 + wag * 0.6) * sc, -facing * 13.8 * sc, (2.2 - wag) * sc, 0.85 * sc);

      // Huge contrasting inner ear saucers (signature Jerry silhouette!)
      ctx.fillStyle = jerryPink;
      ctx.beginPath();
      addCircleSubpath(ctx, -8.0 * sc, (-9.0 + earBob) * sc, 3.4 * sc);
      addCircleSubpath(ctx, 8.0 * sc, (-9.0 - earBob * 0.7) * sc, 3.4 * sc);
      ctx.fill();

      // Warm lighter belly & cheeky muzzle patch
      ctx.fillStyle = jerryTan;
      ctx.beginPath();
      if (skinId !== 'skin_tuxedo' && skinId !== 'skin_sailor') {
        addEllipseSubpath(ctx, facing * 0.6 * sc, 5.8 * sc, 2.9 * sc, 3.2 * sc);
      }
      addEllipseSubpath(ctx, facing * 3.0 * sc, -1.8 * sc, 4.4 * sc, 2.5 * sc);
      ctx.fill();

      // Big bright mouse eyes with lively catchlights
      ctx.fillStyle = cc.colored ? cc.eyeWhite : pal.playerSecondary;
      ctx.beginPath();
      addEllipseSubpath(ctx, (facing * 0.6 - 1.5) * sc, -4.6 * sc, 1.7 * sc, 2.6 * sc);
      addEllipseSubpath(ctx, (facing * 0.6 + 2.1) * sc, -4.6 * sc, 1.7 * sc, 2.6 * sc);
      ctx.fill();

      ctx.fillStyle = jerryInk;
      ctx.beginPath();
      addEllipseSubpath(ctx, (facing * 1.1 - 1.4) * sc, -4.5 * sc, 0.9 * sc, 1.6 * sc);
      addEllipseSubpath(ctx, (facing * 1.1 + 2.2) * sc, -4.5 * sc, 0.9 * sc, 1.6 * sc);
      // Upturned button nose
      addEllipseSubpath(ctx, facing * 8.2 * sc, -2.6 * sc, 1.65 * sc, 1.25 * sc);
      ctx.fill();

      // Cheerful smile & delicate mouse whiskers
      fillCapsule(ctx, facing * 1.6 * sc, -0.8 * sc, facing * 5.0 * sc, -0.6 * sc, 0.55 * sc);
      ctx.fillRect(-9.6 * sc, -2.2 * sc, 3.2 * sc, 0.7 * sc);
      ctx.fillRect(6.8 * sc, -2.2 * sc, 3.2 * sc, 0.7 * sc);
      return;
    }

    if (charId === 'char_bugs_bunny') {
      const bugsWhite = cc.colored ? cc.secondary : pal.playerSecondary;
      const bugsPink = cc.colored ? cc.mid : pal.playerSecondary;
      const bugsInk = cc.colored ? cc.pupil : pal.playerPrimary;
      const earBend = Math.max(-4.5, Math.min(4.5, -vx * 0.016)) * sc;
      // Tall narrow inner ear slots
      ctx.fillStyle = bugsPink;
      fillCapsule(ctx, -2.8 * sc, -9.6 * sc, -4.5 * sc + earBend * 0.85, -18.8 * sc, 1.0 * sc);
      fillCapsule(ctx, 2.4 * sc, -9.6 * sc, 4.1 * sc + earBend * 0.85, -18.8 * sc, 1.0 * sc);

      // Puffed white cheek mask + chest bib + fluffy cotton tail puff
      ctx.fillStyle = bugsWhite;
      ctx.beginPath();
      addEllipseSubpath(ctx, -4.6 * sc, -1.6 * sc, 3.8 * sc, 2.3 * sc);
      addEllipseSubpath(ctx, 4.6 * sc, -1.6 * sc, 3.8 * sc, 2.3 * sc);
      addEllipseSubpath(ctx, facing * 1.6 * sc, -1.6 * sc, 4.8 * sc, 2.5 * sc);
      addCircleSubpath(ctx, -facing * 7.2 * sc, 7.6 * sc, 2.2 * sc);
      if (skinId !== 'skin_tuxedo' && skinId !== 'skin_sailor') {
        addEllipseSubpath(ctx, facing * 0.6 * sc, 5.8 * sc, 3.0 * sc, 3.5 * sc);
      }
      ctx.fill();

      // Tall cartoon eyes + suave half-lidded upper lids
      ctx.fillStyle = bugsWhite;
      ctx.beginPath();
      addEllipseSubpath(ctx, (facing * 0.5 - 1.7) * sc, -5.4 * sc, 1.7 * sc, 2.9 * sc);
      addEllipseSubpath(ctx, (facing * 0.5 + 2.1) * sc, -5.4 * sc, 1.7 * sc, 2.9 * sc);
      ctx.fill();

      ctx.fillStyle = cc.colored ? cc.accent : pal.playerMid;
      fillRoundRect(ctx, (facing * 0.5 - 3.4) * sc, -8.3 * sc, 3.4 * sc, 1.8 * sc, 0.8 * sc);
      fillRoundRect(ctx, (facing * 0.5 + 0.4) * sc, -8.3 * sc, 3.4 * sc, 1.8 * sc, 0.8 * sc);

      ctx.fillStyle = bugsInk;
      ctx.beginPath();
      addEllipseSubpath(ctx, (facing * 1.0 - 1.6) * sc, -4.9 * sc, 0.85 * sc, 1.55 * sc);
      addEllipseSubpath(ctx, (facing * 1.0 + 2.2) * sc, -4.9 * sc, 0.85 * sc, 1.55 * sc);
      ctx.fill();

      // Triangular rabbit nose + signature twin rectangular buck teeth!
      ctx.fillStyle = cc.colored ? bugsPink : bugsInk;
      fillDiamond(ctx, facing * 3.4 * sc, -2.4 * sc, 1.5 * sc, 1.05 * sc);
      ctx.fillStyle = bugsWhite;
      fillRoundRect(ctx, (facing * 2.8 - 1.8) * sc, -0.7 * sc, 3.6 * sc, 2.5 * sc, 0.5 * sc);
      ctx.fillStyle = bugsInk;
      ctx.fillRect((facing * 2.8 - 0.35) * sc, -0.7 * sc, 0.7 * sc, 2.5 * sc);

      // Crisp splayed rabbit whiskers
      ctx.fillRect(-11.4 * sc, -2.5 * sc, 3.8 * sc, 0.75 * sc);
      ctx.fillRect(-11.2 * sc, -1.0 * sc, 3.6 * sc, 0.75 * sc);
      ctx.fillRect(7.6 * sc, -2.5 * sc, 3.8 * sc, 0.75 * sc);
      ctx.fillRect(7.6 * sc, -1.0 * sc, 3.6 * sc, 0.75 * sc);
      return;
    }

    if (charId === 'char_donald_duck') {
      const duckInk = cc.colored ? cc.pupil : pal.playerPrimary;
      const duckWhite = cc.colored ? '#ffffff' : pal.playerSecondary;
      const duckBill = cc.colored ? cc.mid : pal.playerMid;
      const duckBow = cc.colored ? cc.accent : pal.playerMid;
      const ribbonFlutter = Math.sin(time * 13) * 1.8 * sc;
      // Fluttering sailor cap ribbons behind head + cap tally band
      ctx.fillStyle = duckInk;
      fillCapsule(ctx, -facing * 4.8 * sc, -9.6 * sc, -facing * 10.6 * sc, (-7.8 + ribbonFlutter) * sc, 0.95 * sc);
      fillCapsule(ctx, -facing * 4.8 * sc, -8.8 * sc, -facing * 9.8 * sc, (-5.8 - ribbonFlutter * 0.7) * sc, 0.85 * sc);
      ctx.fillStyle = cc.colored ? '#fbbf24' : pal.playerSecondary;
      fillRoundRect(ctx, -4.6 * sc, -10.1 * sc, 8.6 * sc, 1.4 * sc, 0.6 * sc);

      // Expressive tall duck eyes + feisty slanted Donald brow ridge
      ctx.fillStyle = cc.colored ? '#e0f2fe' : pal.playerSecondary;
      ctx.beginPath();
      addEllipseSubpath(ctx, (facing * 0.6 - 1.5) * sc, -5.8 * sc, 1.8 * sc, 2.9 * sc);
      addEllipseSubpath(ctx, (facing * 0.6 + 2.2) * sc, -5.8 * sc, 1.8 * sc, 2.9 * sc);
      ctx.fill();

      ctx.fillStyle = duckInk;
      ctx.beginPath();
      addEllipseSubpath(ctx, (facing * 1.2 - 1.4) * sc, -5.5 * sc, 0.9 * sc, 1.7 * sc);
      addEllipseSubpath(ctx, (facing * 1.2 + 2.3) * sc, -5.5 * sc, 0.9 * sc, 1.7 * sc);
      ctx.fill();
      // Determined slanted duck brow
      fillCapsule(ctx, -3.2 * sc, -8.4 * sc, 4.2 * sc, (-7.6 + facing * 0.4) * sc, 0.85 * sc);

      // Wide contrasting Duck Bill + expressive bill smile crease
      ctx.fillStyle = duckBill;
      fillRoundRect(
        ctx,
        (facing > 0 ? 1.0 : -11.4) * sc,
        -3.9 * sc,
        10.4 * sc,
        3.4 * sc,
        1.7 * sc
      );
      ctx.beginPath();
      ctx.arc(facing * 10.2 * sc, -3.0 * sc, 1.7 * sc, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = cc.colored ? '#9a3412' : pal.playerPrimary;
      fillCapsule(ctx, facing * 2.0 * sc, -2.1 * sc, facing * 9.6 * sc, -2.3 * sc, 0.55 * sc);

      // Classic Sailor Tunic V-collar stripe + prominent front Bow Tie
      if (skinId !== 'skin_tuxedo') {
        ctx.fillStyle = duckWhite;
        ctx.beginPath();
        ctx.moveTo(-4.2 * sc, 2.2 * sc);
        ctx.lineTo(4.2 * sc, 2.2 * sc);
        ctx.lineTo(0, 6.8 * sc);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = duckBow;
        ctx.beginPath();
        ctx.moveTo(facing * 0.8 * sc, 4.4 * sc);
        ctx.lineTo((facing * 0.8 - 3.8) * sc, 2.6 * sc);
        ctx.lineTo((facing * 0.8 - 3.8) * sc, 6.2 * sc);
        ctx.moveTo(facing * 0.8 * sc, 4.4 * sc);
        ctx.lineTo((facing * 0.8 + 3.8) * sc, 2.6 * sc);
        ctx.lineTo((facing * 0.8 + 3.8) * sc, 6.2 * sc);
        ctx.closePath();
        ctx.fill();
      }
      return;
    }

    if (charId === 'char_stickman') {
      const j = computeStickmanJoints(w, h, facing, vx, vy, time);
      // Expressive focused eyes on Stickman head
      ctx.fillStyle = cc.colored ? cc.eyeWhite : pal.playerSecondary;
      const ex = j.headX + facing * 1.6 * sc;
      const ey = j.headY - 0.5 * sc;
      const squint = Math.abs(vx) > 40 ? 0.72 : 1;
      fillRoundRect(ctx, ex - 2.6 * sc, ey - 1.6 * sc, 1.8 * sc, 3.1 * sc * squint, 0.8 * sc);
      fillRoundRect(ctx, ex + 0.6 * sc, ey - 1.6 * sc, 1.8 * sc, 3.1 * sc * squint, 0.8 * sc);

      // Extra bow-tie flair at Stickman's collar if wearing Tuxedo!
      if (skinId === 'skin_tuxedo') {
        ctx.fillStyle = sk.mid;
        ctx.beginPath();
        ctx.moveTo(j.neckX, j.neckY + 1 * sc);
        ctx.lineTo(j.neckX - 3.6 * sc, j.neckY - 0.8 * sc);
        ctx.lineTo(j.neckX - 3.6 * sc, j.neckY + 2.6 * sc);
        ctx.moveTo(j.neckX, j.neckY + 1 * sc);
        ctx.lineTo(j.neckX + 3.6 * sc, j.neckY - 0.8 * sc);
        ctx.lineTo(j.neckX + 3.6 * sc, j.neckY + 2.6 * sc);
        ctx.closePath();
        ctx.fill();
      }
      return;
    }

    if (charId === 'char_cat') {
      // Swaying feline tail
      const sway = Math.sin(time * 8) * 3 * sc;
      ctx.fillStyle = crestFill;
      fillCapsule(ctx, -facing * 5.5 * sc, 8 * sc, -facing * 12.5 * sc, (3 + sway) * sc, 1.7 * sc);

      // Inner ear triangles + mischievous Syobon eyes + whiskers
      ctx.fillStyle = cc.colored ? cc.mid : eyeFill;
      ctx.beginPath();
      ctx.moveTo(-7.2 * sc, -6.8 * sc);
      ctx.lineTo(-8.0 * sc, -12.0 * sc);
      ctx.lineTo(-3.6 * sc, -8.8 * sc);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(3.6 * sc, -8.8 * sc);
      ctx.lineTo(8.0 * sc, -12.0 * sc);
      ctx.lineTo(7.2 * sc, -6.8 * sc);
      ctx.closePath();
      ctx.fill();

      // Eyes + tiny nose + ":3" cat mouth
      const lx = facing * 1.6 * sc;
      ctx.fillStyle = cc.colored ? cc.pupil : eyeFill;
      ctx.beginPath();
      ctx.arc(lx - 3.4 * sc, -4.2 * sc, 1.65 * sc, 0, Math.PI * 2);
      ctx.arc(lx + 3.4 * sc, -4.2 * sc, 1.65 * sc, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = cc.colored ? cc.mid : eyeFill;
      fillDiamond(ctx, lx, -1.8 * sc, 1.5 * sc, 1.1 * sc);

      ctx.fillStyle = cc.colored ? cc.pupil : eyeFill;
      // Crisp cheek whiskers
      ctx.fillRect(-10.5 * sc, -3.5 * sc, 3.5 * sc, 0.9 * sc);
      ctx.fillRect(-10.2 * sc, -1.6 * sc, 3.2 * sc, 0.9 * sc);
      ctx.fillRect(7.0 * sc, -3.5 * sc, 3.5 * sc, 0.9 * sc);
      ctx.fillRect(7.0 * sc, -1.6 * sc, 3.2 * sc, 0.9 * sc);
      return;
    }

    if (charId === 'char_bunny') {
      const bunMuzzle = cc.colored ? cc.secondary : pal.playerSecondary;
      const bunInk = cc.colored ? cc.pupil : pal.playerPrimary;
      // Pie-cut vintage toon rabbit eyes + nose
      ctx.fillStyle = bunMuzzle;
      ctx.beginPath();
      addEllipseSubpath(ctx, facing * 2.2 * sc, -3.2 * sc, 5.2 * sc, 4.4 * sc);
      ctx.fill();

      fillPieEye(
        ctx,
        facing * 0.6 * sc,
        -4.4 * sc,
        1.3 * sc,
        2.4 * sc,
        facing,
        bunInk,
        bunMuzzle
      );
      fillPieEye(
        ctx,
        facing * 3.8 * sc,
        -4.4 * sc,
        1.3 * sc,
        2.4 * sc,
        facing,
        bunInk,
        bunMuzzle
      );

      ctx.fillStyle = cc.colored ? cc.mid : pal.playerPrimary;
      ctx.beginPath();
      ctx.arc(facing * 6.5 * sc, -2.6 * sc, 1.5 * sc, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    if (charId === 'char_slime') {
      // Floating inner bubbles + bouncy wide eyes
      ctx.fillStyle = cc.colored ? cc.mid : eyeFill;
      ctx.globalAlpha = cc.colored ? 0.55 : 0.45;
      ctx.beginPath();
      ctx.arc(-6 * sc, 5 * sc + Math.sin(time * 5) * 1.5, 2.1 * sc, 0, Math.PI * 2);
      ctx.arc(6.5 * sc, 6.5 * sc + Math.cos(time * 4) * 1.2, 1.5 * sc, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      const bounce = Math.sin(time * 10) * 1.1;
      ctx.fillStyle = eyeFill;
      ctx.beginPath();
      ctx.arc(lookX - 4.4 * sc, -1.5 * sc + bounce, 2.3 * sc, 0, Math.PI * 2);
      ctx.arc(lookX + 4.4 * sc, -1.5 * sc - bounce * 0.6, 2.3 * sc, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = cc.colored ? cc.pupil : crestFill;
      ctx.beginPath();
      ctx.arc(lookX - 4.0 * sc, -1.8 * sc + bounce, 0.9 * sc, 0, Math.PI * 2);
      ctx.arc(lookX + 4.8 * sc, -1.8 * sc - bounce * 0.6, 0.9 * sc, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    if (charId === 'char_skeleton') {
      // Hollow skull eye sockets + nasal triangle + tooth notches + ribs
      ctx.fillStyle = cc.colored ? cc.secondary : pal.playerSecondary;
      ctx.beginPath();
      ctx.arc(lookX * 0.4 - 3.1 * sc, -6.2 * sc, 2.2 * sc, 0, Math.PI * 2);
      ctx.arc(lookX * 0.4 + 3.1 * sc, -6.2 * sc, 2.2 * sc, 0, Math.PI * 2);
      ctx.fill();

      if (cc.colored) {
        ctx.fillStyle = cc.pupil;
        ctx.beginPath();
        ctx.arc(lookX * 0.5 - 3.1 * sc, -6.2 * sc, 0.9 * sc, 0, Math.PI * 2);
        ctx.arc(lookX * 0.5 + 3.1 * sc, -6.2 * sc, 0.9 * sc, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = cc.secondary;
      }

      ctx.beginPath();
      ctx.moveTo(lookX * 0.4, -4.2 * sc);
      ctx.lineTo(lookX * 0.4 - 1.4 * sc, -2.0 * sc);
      ctx.lineTo(lookX * 0.4 + 1.4 * sc, -2.0 * sc);
      ctx.closePath();
      ctx.fill();

      // Jaw teeth slots & ribcage slots
      ctx.fillRect(-2.6 * sc, 0.4 * sc, 1.2 * sc, 2.6 * sc);
      ctx.fillRect(-0.5 * sc, 0.4 * sc, 1.2 * sc, 2.6 * sc);
      ctx.fillRect(1.6 * sc, 0.4 * sc, 1.2 * sc, 2.6 * sc);

      ctx.fillRect(-3.6 * sc, 4.8 * sc, 7.2 * sc, 1.3 * sc);
      ctx.fillRect(-3.2 * sc, 7.2 * sc, 6.4 * sc, 1.3 * sc);
      return;
    }

    if (charId === 'char_astronaut') {
      // Wide reflective lunar dome visor + specular highlight crescent
      ctx.fillStyle = cc.colored ? cc.secondary : pal.playerSecondary;
      fillRoundRect(ctx, (-5.2 + facing * 1.8) * sc, -8.5 * sc, 10.8 * sc, 7.4 * sc, 3.6 * sc);
      ctx.fillStyle = cc.colored ? '#e0f2fe' : pal.playerPrimary;
      fillRoundRect(ctx, (-3.4 + facing * 1.8) * sc, -7.2 * sc, 4.2 * sc, 1.8 * sc, 0.9 * sc);
      // Chest suit console
      ctx.fillStyle = cc.colored ? cc.mid : pal.playerSecondary;
      fillRoundRect(ctx, -3.2 * sc, 3.8 * sc, 6.4 * sc, 3.8 * sc, 1 * sc);
      return;
    }

    if (charId === 'char_tvhead') {
      // Rabbit-ear V antennas on top of monitor
      ctx.fillStyle = cc.colored ? cc.accent : crestFill;
      fillCapsule(ctx, -2 * sc, -12 * sc, -6.5 * sc, -17.5 * sc, 0.95 * sc);
      fillCapsule(ctx, 2 * sc, -12 * sc, 6.5 * sc, -17.5 * sc, 0.95 * sc);

      // Inner CRT screen bezel
      ctx.fillStyle = cc.colored ? cc.secondary : pal.playerSecondary;
      fillRoundRect(ctx, -8.4 * sc, -10.6 * sc, 16.8 * sc, 10.6 * sc, 1.8 * sc);

      // Reactive digital CRT eyes
      ctx.fillStyle = cc.colored ? cc.pupil : pal.playerPrimary;
      if (Math.abs(vy) > 130) {
        // Surprised hollow rings in fast air
        fillRing(ctx, lookX * 0.5 - 3.8 * sc, -5.4 * sc, 2.4 * sc, 1.2 * sc);
        fillRing(ctx, lookX * 0.5 + 3.8 * sc, -5.4 * sc, 2.4 * sc, 1.2 * sc);
      } else {
        fillRoundRect(ctx, lookX * 0.6 - 5.4 * sc, -7.2 * sc, 3.2 * sc, 3.8 * sc, 1 * sc);
        fillRoundRect(ctx, lookX * 0.6 + 2.2 * sc, -7.2 * sc, 3.2 * sc, 3.8 * sc, 1 * sc);
      }
      return;
    }

    if (charId === 'char_shinobi') {
      const dir = -facing;
      const flutter1 = Math.sin(time * 15) * 3.5;
      const flutter2 = Math.cos(time * 13) * 3.2;
      ctx.fillStyle = cc.colored ? cc.mid : crestFill;
      ctx.beginPath();
      ctx.moveTo(dir * (hw - 2), -hh + 5);
      ctx.lineTo(dir * (hw + 13), -hh + 2 + flutter1);
      ctx.lineTo(dir * (hw + 11), -hh + 7 + flutter1);
      ctx.lineTo(dir * (hw - 2), -hh + 9);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = cc.colored ? cc.accent : pal.playerMid;
      ctx.beginPath();
      ctx.moveTo(dir * (hw - 2), -hh + 8);
      ctx.lineTo(dir * (hw + 10), -hh + 9 + flutter2);
      ctx.lineTo(dir * (hw + 8), -hh + 13 + flutter2);
      ctx.lineTo(dir * (hw - 2), -hh + 11);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = eyeFill;
      ctx.fillRect(-hw + 2, -hh + 5, w - 4, 5);
      ctx.fillStyle = cc.colored ? cc.pupil : crestFill;
      ctx.fillRect(lookX - 6, -hh + 6.5, 4.5, 2.2);
      ctx.fillRect(lookX + 2, -hh + 6.5, 4.5, 2.2);
      return;
    }

    if (charId === 'char_knight') {
      ctx.fillStyle = cc.colored ? cc.mid : crestFill;
      ctx.beginPath();
      ctx.moveTo(-hw + 1, -hh + 2);
      ctx.lineTo(-hw - 5, -hh - 7);
      ctx.lineTo(-hw + 7, -hh + 1);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(hw - 1, -hh + 2);
      ctx.lineTo(hw + 5, -hh - 7);
      ctx.lineTo(hw - 7, -hh + 1);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = eyeFill;
      ctx.fillRect(-hw + 4 + lookX * 0.4, -4, w - 8, 3.2);
      ctx.fillRect(-1.6 + lookX * 0.5, -4, 3.2, 10);
      return;
    }

    if (charId === 'char_imp') {
      ctx.fillStyle = cc.colored ? cc.mid : crestFill;
      ctx.beginPath();
      ctx.moveTo(-hw + 3, -hh + 1);
      ctx.lineTo(-hw - 3, -hh - 8);
      ctx.lineTo(-hw + 8, -hh + 1);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(hw - 3, -hh + 1);
      ctx.lineTo(hw + 3, -hh - 8);
      ctx.lineTo(hw - 8, -hh + 1);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = eyeFill;
      ctx.beginPath();
      ctx.moveTo(lookX - 7, -5);
      ctx.lineTo(lookX - 1.5, -2.5);
      ctx.lineTo(lookX - 6.5, -1);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(lookX + 7, -5);
      ctx.lineTo(lookX + 1.5, -2.5);
      ctx.lineTo(lookX + 6.5, -1);
      ctx.closePath();
      ctx.fill();
      return;
    }

    if (charId === 'char_cyborg') {
      const tilt = Math.max(-5, Math.min(5, -vx * 0.015));
      ctx.fillStyle = cc.colored ? cc.accent : crestFill;
      ctx.beginPath();
      ctx.moveTo(-1.5, -hh);
      ctx.lineTo(1.5, -hh);
      ctx.lineTo(1 + tilt, -hh - 7);
      ctx.lineTo(-1 + tilt, -hh - 7);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.arc(tilt, -hh - 8, 2.4, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = eyeFill;
      fillRoundRect(ctx, -hw + 3, -5, w - 6, 5.5, 2);
      ctx.fillStyle = cc.colored ? cc.pupil : crestFill;
      const scan = Math.sin(time * 7) * 4 + lookX;
      ctx.fillRect(scan - 2, -4, 4, 3.5);
      return;
    }

    if (charId === 'char_ronin') {
      ctx.fillStyle = cc.colored ? cc.mid : crestFill;
      ctx.beginPath();
      ctx.moveTo(0, -hh - 9);
      ctx.lineTo(hw + 9, -hh + 2);
      ctx.lineTo(-hw - 9, -hh + 2);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = eyeFill;
      ctx.fillRect(lookX - 6.5, -2.5 + lookY * 0.4, 4.5, 2.6);
      ctx.fillRect(lookX + 2, -2.5 + lookY * 0.4, 4.5, 2.6);
      return;
    }

    if (charId === 'char_monolith') {
      ctx.fillStyle = eyeFill;
      fillDiamond(ctx, lookX * 0.7, -2 + lookY * 0.6, 6.5, 4.5);
      ctx.fillStyle = cc.colored ? cc.pupil : crestFill;
      ctx.beginPath();
      ctx.arc(lookX * 0.9, -2 + lookY * 0.6, 1.9, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    // Classic Cube & Cloaked Wraith eyes
    ctx.fillStyle = eyeFill;
    const blink = Math.sin(time * 2.7) > 0.985 ? 0.25 : 1;
    const eyeH = 5.4 * blink;
    fillRoundRect(ctx, lookX - 6.5, -4.5 + lookY + (5.4 - eyeH) * 0.5, 4.2, Math.max(1.2, eyeH), 1.5);
    fillRoundRect(ctx, lookX + 2.3, -4.5 + lookY + (5.4 - eyeH) * 0.5, 4.2, Math.max(1.2, eyeH), 1.5);
  }

  function drawEmoteOverlay(ctx, emoteId, progress, pal) {
    if (!emoteId || progress <= 0 || progress >= 1) return;
    const t = progress;
    const isColored = Boolean(pal && pal.colored);
    const isLight = pal && pal.mode === 'light';
    ctx.save();
    ctx.fillStyle = pal.playerPrimary;

    if (emoteId === 'emote_salute') {
      if (isColored) ctx.fillStyle = isLight ? '#d97706' : '#fbbf24';
      const yOff = -28 - Math.sin(t * Math.PI) * 7;
      fillRoundRect(ctx, -2.2, yOff - 9, 4.4, 8, 1.5);
      ctx.beginPath();
      ctx.arc(0, yOff + 2.5, 2.2, 0, Math.PI * 2);
      ctx.fill();
    } else if (emoteId === 'emote_clap') {
      if (isColored) ctx.fillStyle = isLight ? '#0891b2' : '#22d3ee';
      const beat = Math.abs(Math.sin(t * Math.PI * 5));
      const r = 6 + beat * 9;
      ctx.globalAlpha = 1 - beat * 0.55;
      fillRing(ctx, 0, -24, r, r - 2.2);
    } else if (emoteId === 'emote_backflip') {
      for (let i = 0; i < 4; i++) {
        if (isColored) {
          ctx.fillStyle = i % 2 === 0 ? (isLight ? '#d97706' : '#fbbf24') : '#a855f7';
        }
        const ang = t * Math.PI * 2 + (i * Math.PI) / 2;
        const px = Math.cos(ang) * 20;
        const py = Math.sin(ang) * 20;
        fillDiamond(ctx, px, py, 3, 3);
      }
    } else if (emoteId === 'emote_laugh') {
      if (isColored) ctx.fillStyle = isLight ? '#ca8a04' : '#facc15';
      ctx.font = '800 10px ui-monospace, monospace';
      ctx.textAlign = 'center';
      const bounce = Math.abs(Math.sin(t * Math.PI * 6)) * 6;
      ctx.fillText('HA!', -12, -22 - bounce);
      ctx.fillText('HA!', 13, -18 - bounce * 0.7);
    } else if (emoteId === 'emote_rage') {
      if (isColored) ctx.fillStyle = isLight ? '#e11d48' : '#fb7185';
      const stomp = (t * 4) % 1;
      ctx.globalAlpha = 1 - stomp;
      fillRing(ctx, 0, 13, 6 + stomp * 20, 4 + stomp * 18);
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.arc(-11, -20 - stomp * 8, 3.2, 0, Math.PI * 2);
      ctx.arc(11, -22 - stomp * 6, 2.8, 0, Math.PI * 2);
      ctx.fill();
    } else if (emoteId === 'emote_zen') {
      if (isColored) ctx.fillStyle = isLight ? '#059669' : '#34d399';
      for (let i = 0; i < 3; i++) {
        const a = t * Math.PI * 4 + (i * Math.PI * 2) / 3;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * 19, Math.sin(a) * 6 - 4, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (emoteId === 'emote_spin') {
      if (isColored) ctx.fillStyle = isLight ? '#4f46e5' : '#818cf8';
      ctx.globalAlpha = isColored ? 0.55 : 0.45;
      fillRing(ctx, 0, 2, 18, 14);
      fillRing(ctx, 0, 8, 12, 9);
    } else if (emoteId === 'emote_rip') {
      if (isColored) ctx.fillStyle = isLight ? '#475569' : '#94a3b8';
      const rise = Math.min(1, t * 4);
      const mh = 18 * rise;
      ctx.fillRect(18, 14 - mh, 14, mh);
      ctx.beginPath();
      ctx.arc(25, 14 - mh, 7, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = isColored ? '#0f172a' : pal.playerSecondary;
      ctx.fillRect(21, 14 - mh + 3, 8, 2);
    }

    ctx.restore();
  }

  window.ExoticCharacterRenderer = {
    fillRing,
    fillDiamond,
    fillRoundRect,
    fillCapsule,
    draw(ctx, opts) {
      const {
        x,
        y,
        w = 24,
        h = 26,
        vx = 0,
        vy = 0,
        facing = 1,
        gravitySign = 1,
        squashX = 1,
        squashY = 1,
        characterId = 'char_classic',
        skinId = 'skin_solid',
        emoteId = null,
        emoteProgress = 0,
        palette,
        time = 0,
        alpha = 1
      } = opts;

      const pal = palette || window.ExoticTheme.getPalette();
      const cx = x + w * 0.5;
      const cy = y + h * 0.5;

      let rot = 0;
      let extraY = 0;
      let sx = squashX;
      let sy = squashY;

      if (emoteId && emoteProgress > 0 && emoteProgress < 1) {
        const ep = emoteProgress;
        if (emoteId === 'emote_salute') {
          rot = facing * Math.sin(ep * Math.PI) * 0.22;
        } else if (emoteId === 'emote_backflip') {
          rot = -facing * ep * Math.PI * 2;
          extraY = -Math.sin(ep * Math.PI) * 18;
        } else if (emoteId === 'emote_laugh') {
          extraY = -Math.abs(Math.sin(ep * Math.PI * 6)) * 5;
        } else if (emoteId === 'emote_rage') {
          extraY = -Math.abs(Math.sin(ep * Math.PI * 8)) * 7;
          sx = 1.1;
          sy = 0.92;
        } else if (emoteId === 'emote_zen') {
          extraY = -8 - Math.sin(ep * Math.PI * 2) * 3;
        } else if (emoteId === 'emote_spin') {
          sx = Math.cos(ep * Math.PI * 8);
          if (Math.abs(sx) < 0.18) sx = sx < 0 ? -0.18 : 0.18;
        }
      }

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(cx, cy + extraY);
      if (gravitySign < 0) {
        ctx.scale(1, -1);
      }
      if (rot !== 0) {
        ctx.rotate(rot);
      }
      ctx.scale(sx, sy);

      drawSkinFill(ctx, skinId, characterId, w, h, facing, vx, vy, pal, time);
      drawCharacterFeatures(ctx, characterId, skinId, w, h, facing, vx, vy, pal, time);
      drawEmoteOverlay(ctx, emoteId, emoteProgress, pal);

      ctx.restore();
    }
  };
})();
