(function () {
  let backdropCanvas = null;
  let backdropCtx = null;
  let menuCharCanvas = null;
  let menuCharCtx = null;
  let splashCanvas = null;
  let splashCtx = null;

  const menuTrail = new window.ExoticTrailSystem();
  let motes = [];
  let pillars = [];
  let mouseX = 0.5;
  let mouseY = 0.5;
  let active = true;

  function seedBackdrop() {
    motes = [];
    for (let i = 0; i < 36; i++) {
      motes.push({
        x: Math.random(),
        y: Math.random(),
        size: 2 + Math.random() * 4.5,
        speedY: 0.015 + Math.random() * 0.03,
        drift: Math.random() * Math.PI * 2
      });
    }

    pillars = [];
    for (let i = 0; i < 14; i++) {
      pillars.push({
        x: i / 13,
        w: 38 + (i % 4) * 26,
        h: 0.25 + ((i * 37) % 50) / 100,
        depth: 0.3 + (i % 3) * 0.28
      });
    }
  }

  function resizeCanvas(canvas) {
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const targetW = Math.round(rect.width * dpr);
    const targetH = Math.round(rect.height * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }
    return { w: rect.width, h: rect.height, dpr };
  }

  function renderSplashLogo(time) {
    if (!splashCanvas || !splashCtx) return;
    const dim = resizeCanvas(splashCanvas);
    if (!dim) return;
    const pal = window.ExoticTheme.getPalette();
    const { fillRing, fillDiamond } = window.ExoticCharacterRenderer;

    splashCtx.save();
    splashCtx.scale(dim.dpr, dim.dpr);
    splashCtx.fillStyle = pal.stageBg;
    splashCtx.fillRect(0, 0, dim.w, dim.h);

    const cx = dim.w * 0.5;
    const cy = dim.h * 0.5;

    // Rotating monochrome orbital rings
    splashCtx.fillStyle = pal.auraDim;
    splashCtx.globalAlpha = 0.35;
    fillRing(splashCtx, cx, cy, 52 + Math.sin(time * 3) * 2, 49);

    splashCtx.globalAlpha = 0.85;
    splashCtx.fillStyle = pal.playerPrimary;
    for (let i = 0; i < 4; i++) {
      const a = time * 2.2 + (i * Math.PI) / 2;
      fillDiamond(splashCtx, cx + Math.cos(a) * 50, cy + Math.sin(a) * 50, 4, 4);
    }

    // Hero runner hopping in center
    const hop = Math.abs(Math.sin(time * 4.2)) * 14;
    window.ExoticCharacterRenderer.draw(splashCtx, {
      x: cx - 15,
      y: cy - 12 - hop,
      w: 30,
      h: 32,
      facing: 1,
      squashX: hop > 8 ? 0.92 : 1.06,
      squashY: hop > 8 ? 1.08 : 0.94,
      characterId: 'char_classic',
      skinId: 'skin_solid',
      palette: pal,
      time
    });

    // Solid ground plinth
    splashCtx.fillStyle = pal.platform;
    splashCtx.fillRect(cx - 34, cy + 22, 68, 8);
    splashCtx.restore();
  }

  function renderBackdrop(time, dt) {
    if (!backdropCanvas || !backdropCtx) return;
    const dim = resizeCanvas(backdropCanvas);
    if (!dim) return;
    const pal = window.ExoticTheme.getPalette();

    backdropCtx.save();
    backdropCtx.scale(dim.dpr, dim.dpr);
    backdropCtx.fillStyle = pal.sky;
    backdropCtx.fillRect(0, 0, dim.w, dim.h);

    const parallaxX = (mouseX - 0.5) * 34;
    const parallaxY = (mouseY - 0.5) * 16;

    // Architectural background monoliths
    for (let i = 0; i < pillars.length; i++) {
      const p = pillars[i];
      const px = p.x * dim.w + parallaxX * p.depth - p.w * 0.5;
      const ph = p.h * dim.h;
      const py = dim.h - ph + parallaxY * p.depth * 0.5;
      backdropCtx.fillStyle = i % 2 === 0 ? pal.bgPillar : pal.bgPillarAlt;
      backdropCtx.fillRect(px, py, p.w, ph + 30);
    }

    // Drifting geometric motes
    backdropCtx.fillStyle = pal.bgMote;
    for (let i = 0; i < motes.length; i++) {
      const m = motes[i];
      m.y -= m.speedY * dt;
      if (m.y < -0.05) {
        m.y = 1.05;
        m.x = Math.random();
      }
      const mx = m.x * dim.w + Math.sin(time * 1.2 + m.drift) * 14 + parallaxX * 0.4;
      const my = m.y * dim.h;
      backdropCtx.save();
      backdropCtx.translate(mx, my);
      backdropCtx.rotate(time + m.drift);
      backdropCtx.fillRect(-m.size * 0.5, -m.size * 0.5, m.size, m.size);
      backdropCtx.restore();
    }

    backdropCtx.restore();
  }

  function renderMenuShowcase(time, dt) {
    if (!menuCharCanvas || !menuCharCtx) return;
    const dim = resizeCanvas(menuCharCanvas);
    if (!dim) return;

    const pal = window.ExoticTheme.getPalette();
    const state = window.ExoticStorage.getState();
    const eq = state.equipped;

    menuCharCtx.save();
    menuCharCtx.scale(dim.dpr, dim.dpr);
    menuCharCtx.fillStyle = pal.stageBg;
    menuCharCtx.fillRect(0, 0, dim.w, dim.h);

    // Subtle background columns
    menuCharCtx.fillStyle = pal.bgPillarAlt;
    menuCharCtx.fillRect(dim.w * 0.14, 30, 32, dim.h);
    menuCharCtx.fillRect(dim.w * 0.76, 55, 42, dim.h);

    const floorY = dim.h * 0.74;
    menuCharCtx.fillStyle = pal.platform;
    menuCharCtx.fillRect(dim.w * 0.1, floorY, dim.w * 0.8, dim.h - floorY);
    menuCharCtx.fillStyle = pal.platformCap;
    menuCharCtx.fillRect(dim.w * 0.1, floorY, dim.w * 0.8, 4);

    // Autonomous showcase figure-8 patrol + periodic jump + emote
    const cycle = time * 1.65;
    const patrolRange = Math.min(95, dim.w * 0.24);
    const px = dim.w * 0.5 + Math.sin(cycle) * patrolRange - 14;
    const vx = Math.cos(cycle) * patrolRange * 1.65;
    const jumpWave = Math.max(0, Math.sin(cycle * 2));
    const py = floorY - 30 - jumpWave * 42;
    const vy = -Math.cos(cycle * 2) * 140;
    const facing = vx >= 0 ? 1 : -1;

    const emoteCycle = time % 5.5;
    const emoteProgress = emoteCycle > 4.2 ? (emoteCycle - 4.2) / 1.1 : 0;

    const playerState = {
      x: px,
      y: py,
      w: 28,
      h: 30,
      vx,
      vy,
      facing,
      gravitySign: 1
    };

    menuTrail.update(dt, eq.trail, playerState);
    menuTrail.draw(menuCharCtx, eq.trail, pal, eq.character, eq.skin, time);

    const cx = px + 14;
    const cy = py + 15;
    window.ExoticAuraRenderer.drawBack(menuCharCtx, eq.aura, cx, cy, time, pal);
    window.ExoticCharacterRenderer.draw(menuCharCtx, {
      ...playerState,
      squashX: jumpWave > 0.5 ? 0.93 : 1.04,
      squashY: jumpWave > 0.5 ? 1.07 : 0.96,
      characterId: eq.character,
      skinId: eq.skin,
      emoteId: emoteProgress > 0 && emoteProgress < 1 ? eq.emote : null,
      emoteProgress,
      palette: pal,
      time
    });
    window.ExoticAuraRenderer.drawFront(menuCharCtx, eq.aura, cx, cy, time, pal);

    menuCharCtx.restore();
  }

  let lastTs = performance.now();
  function tick(now) {
    const dt = Math.min(0.05, (now - lastTs) / 1000);
    lastTs = now;
    const time = now / 1000;

    if (active) {
      renderBackdrop(time, dt);
      const splashEl = document.getElementById('view-splash');
      if (splashEl && splashEl.classList.contains('is-active')) {
        renderSplashLogo(time);
      }
      const menuEl = document.getElementById('view-menu');
      if (menuEl && menuEl.classList.contains('is-active')) {
        renderMenuShowcase(time, dt);
      }
    }

    requestAnimationFrame(tick);
  }

  window.ExoticBackdrop = {
    init() {
      backdropCanvas = document.getElementById('backdrop-canvas');
      backdropCtx = backdropCanvas ? backdropCanvas.getContext('2d') : null;
      menuCharCanvas = document.getElementById('menu-character-canvas');
      menuCharCtx = menuCharCanvas ? menuCharCanvas.getContext('2d') : null;
      splashCanvas = document.getElementById('splash-logo-canvas');
      splashCtx = splashCanvas ? splashCanvas.getContext('2d') : null;

      seedBackdrop();

      window.addEventListener('pointermove', (e) => {
        mouseX = e.clientX / Math.max(1, window.innerWidth);
        mouseY = e.clientY / Math.max(1, window.innerHeight);
      });

      requestAnimationFrame(tick);
    },
    setActive(flag) {
      active = Boolean(flag);
    },
    resetMenuTrail() {
      menuTrail.reset();
    }
  };
})();
