(function () {
  const cards = new Map();
  let observer = null;
  let rafId = null;
  let lastNow = performance.now();

  function ensureObserver() {
    if (observer || typeof IntersectionObserver === 'undefined') return;
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const rec = cards.get(entry.target);
          if (rec) {
            rec.visible = entry.isIntersecting;
          }
        }
      },
      { threshold: 0.05 }
    );
  }

  function fitCanvas(canvas) {
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const tw = Math.round(rect.width * dpr);
    const th = Math.round(rect.height * dpr);
    if (canvas.width !== tw || canvas.height !== th) {
      canvas.width = tw;
      canvas.height = th;
    }
    return { w: rect.width, h: rect.height, dpr };
  }

  function drawPreviewSlab(ctx, x, y, w, h, vanishX, pal, depth = 14) {
    if (pal && pal.is3D && window.Exotic3D) {
      window.Exotic3D.drawExtrudedBox(ctx, x, y, w, h, {
        palette: pal,
        vanishX,
        depth,
        frontColor: pal.platform,
        capColor: pal.platformCap,
        castShadow: false
      });
      if (pal.colored) {
        ctx.fillStyle = pal.platformCap;
        ctx.fillRect(x, y, w, 3);
      }
      return;
    }
    ctx.fillStyle = pal.platform;
    ctx.fillRect(x, y, w, h);
    if (pal.colored) {
      ctx.fillStyle = pal.platformCap;
      ctx.fillRect(x, y, w, 3);
    }
  }

  function renderShopPreview(rec, time, dt, pal) {
    const { ctx, canvas, item, trailSys, scrubber } = rec;
    const dim = fitCanvas(canvas);
    if (!dim) return;

    const loopDur = 4.0;
    const loopT = (time + rec.seed) % loopDur;
    const norm = loopT / loopDur;
    if (scrubber) {
      scrubber.style.width = `${(norm * 100).toFixed(1)}%`;
    }

    const state = window.ExoticStorage.getState();
    const eq = state.equipped;
    const { fillRing, fillDiamond } = window.ExoticCharacterRenderer;

    ctx.save();
    ctx.scale(dim.dpr, dim.dpr);
    ctx.fillStyle = pal.stageBg;
    ctx.fillRect(0, 0, dim.w, dim.h);

    const is3D = Boolean(pal.is3D && window.Exotic3D);
    window.ExoticWorldDraw.setVanishX?.(dim.w * 0.5);
    if (is3D && item.category !== 'maps' && item.category !== 'weapons') {
      window.Exotic3D.draw3DStageChamber(ctx, dim.w, dim.h, Math.sin(time * 0.8 + rec.seed) * 20, pal);
      window.Exotic3D.drawExtrudedBox(ctx, dim.w * 0.12, 16, 20, dim.h, {
        palette: pal,
        vanishX: dim.w * 0.5,
        depth: 10,
        frontColor: pal.bgPillar,
        castShadow: false
      });
      window.Exotic3D.drawExtrudedBox(ctx, dim.w * 0.8, 28, 26, dim.h, {
        palette: pal,
        vanishX: dim.w * 0.5,
        depth: 12,
        frontColor: pal.bgPillar,
        castShadow: false
      });
    } else {
      // Subtle architectural backdrop columns
      ctx.fillStyle = pal.bgPillar;
      ctx.fillRect(dim.w * 0.12, 16, 20, dim.h);
      ctx.fillRect(dim.w * 0.8, 28, 26, dim.h);
    }

    const floorY = dim.h * 0.77;

    if (item.category === 'maps' && window.ExoticBrawlRenderer) {
      window.ExoticBrawlRenderer.renderMapCardPreview(ctx, dim, item.id, time + rec.seed, pal);
      ctx.restore();
      return;
    }

    if (item.category === 'weapons' && window.ExoticBrawlRenderer) {
      window.ExoticBrawlRenderer.renderWeaponCardPreview(
        ctx,
        dim,
        item.id,
        time + rec.seed,
        pal,
        norm
      );
      ctx.restore();
      return;
    }

    if (item.category === 'upgrades') {
      // Bespoke live mechanic simulation per Upgrade
      if (item.id === 'upg_coyote') {
        drawPreviewSlab(ctx, 14, floorY, dim.w * 0.34, dim.h - floorY, dim.w * 0.5, pal);
        drawPreviewSlab(ctx, dim.w * 0.66, floorY, dim.w * 0.3, dim.h - floorY, dim.w * 0.5, pal);

        const px = 22 + norm * (dim.w - 68);
        let py = floorY - 26;
        // Steps off ledge at 0.34, hangs briefly via Coyote Grace at 0.41, then leaps!
        if (norm > 0.33 && norm <= 0.42) {
          py = floorY - 25;
          ctx.globalAlpha = 0.7;
          ctx.fillStyle = pal.auraBright;
          fillRing(ctx, px + 12, floorY + 2, 11, 8);
          ctx.globalAlpha = 1;
        } else if (norm > 0.42 && norm < 0.72) {
          const j = (norm - 0.42) / 0.3;
          py = floorY - 26 - Math.sin(j * Math.PI) * 44;
        }
        window.ExoticCharacterRenderer.draw(ctx, {
          x: px,
          y: py,
          w: 24,
          h: 26,
          facing: 1,
          characterId: eq.character,
          skinId: eq.skin,
          palette: pal,
          time
        });
      } else if (item.id === 'upg_magnet') {
        drawPreviewSlab(ctx, 12, floorY, dim.w - 24, dim.h - floorY, dim.w * 0.5, pal);
        const px = dim.w * 0.5 + Math.sin(norm * Math.PI * 2) * (dim.w * 0.25) - 12;
        const py = floorY - 26;

        // Magnetic field ring
        ctx.globalAlpha = 0.22;
        ctx.fillStyle = pal.auraBright;
        fillRing(ctx, px + 12, py + 13, 38 + Math.sin(time * 6) * 3, 35);
        ctx.globalAlpha = 1;

        // Coins curving toward player
        for (let c = 0; c < 3; c++) {
          const cProg = (norm * 2 + c * 0.33) % 1;
          const startX = c % 2 === 0 ? dim.w * 0.16 : dim.w * 0.84;
          const startY = floorY - 54 - c * 8;
          const cx = startX + (px + 12 - startX) * (cProg * cProg);
          const cy = startY + (py + 13 - startY) * (cProg * cProg);
          window.ExoticWorldDraw.drawCoin(ctx, { x: cx, y: cy, collected: cProg > 0.92 }, pal, time);
        }

        window.ExoticCharacterRenderer.draw(ctx, {
          x: px,
          y: py,
          w: 24,
          h: 26,
          facing: Math.cos(norm * Math.PI * 2) >= 0 ? 1 : -1,
          characterId: eq.character,
          skinId: eq.skin,
          palette: pal,
          time
        });
      } else if (item.id === 'upg_double_jump') {
        drawPreviewSlab(ctx, 12, floorY, dim.w * 0.26, dim.h - floorY, dim.w * 0.5, pal);
        drawPreviewSlab(ctx, dim.w * 0.74, floorY, dim.w * 0.22, dim.h - floorY, dim.w * 0.5, pal);

        const px = 22 + norm * (dim.w - 68);
        let py = floorY - 26;
        if (norm > 0.2 && norm <= 0.5) {
          const j1 = (norm - 0.2) / 0.3;
          py = floorY - 26 - Math.sin(j1 * Math.PI) * 32;
        } else if (norm > 0.5 && norm < 0.82) {
          const j2 = (norm - 0.5) / 0.32;
          py = floorY - 34 - Math.sin(j2 * Math.PI) * 44;
          if (j2 < 0.45) {
            ctx.globalAlpha = 1 - j2 * 2;
            ctx.fillStyle = pal.auraBright;
            fillRing(ctx, dim.w * 0.5, floorY - 26, 6 + j2 * 28, 4 + j2 * 25);
            ctx.globalAlpha = 1;
          }
        }
        window.ExoticCharacterRenderer.draw(ctx, {
          x: px,
          y: py,
          w: 24,
          h: 26,
          facing: 1,
          characterId: eq.character,
          skinId: eq.skin,
          palette: pal,
          time
        });
      } else if (item.id === 'upg_dash') {
        drawPreviewSlab(ctx, 10, floorY, dim.w * 0.28, dim.h - floorY, dim.w * 0.5, pal);
        drawPreviewSlab(ctx, dim.w * 0.72, floorY, dim.w * 0.24, dim.h - floorY, dim.w * 0.5, pal);
        window.ExoticWorldDraw.drawSpikes(
          ctx,
          { x: dim.w * 0.4, y: dim.h - 4, count: 4, dir: 'up' },
          pal,
          false,
          time
        );

        let px = 26;
        let py = floorY - 26;
        if (norm < 0.28) {
          px = 26 + (norm / 0.28) * 30;
          py = floorY - 26 - Math.sin((norm / 0.28) * Math.PI * 0.5) * 34;
        } else if (norm < 0.55) {
          const d = (norm - 0.28) / 0.27;
          px = 56 + d * (dim.w * 0.74 - 56);
          py = floorY - 60;
          // Phase Dash afterimages
          for (let g = 1; g <= 3; g++) {
            window.ExoticCharacterRenderer.draw(ctx, {
              x: px - g * 18,
              y: py,
              w: 24,
              h: 26,
              facing: 1,
              characterId: eq.character,
              skinId: 'skin_solid',
              palette: pal,
              time,
              alpha: 0.35 - g * 0.08
            });
          }
        } else {
          const l = (norm - 0.55) / 0.45;
          px = dim.w * 0.74 + l * 26;
          py = floorY - 60 + Math.min(1, l * 2.5) * 34;
        }

        window.ExoticCharacterRenderer.draw(ctx, {
          x: px,
          y: py,
          w: 24,
          h: 26,
          facing: 1,
          squashX: norm >= 0.28 && norm < 0.55 ? 1.22 : 1,
          squashY: norm >= 0.28 && norm < 0.55 ? 0.82 : 1,
          characterId: eq.character,
          skinId: eq.skin,
          palette: pal,
          time
        });
      } else if (item.id === 'upg_radar') {
        const fakePlat = {
          x: dim.w * 0.36,
          y: floorY,
          w: dim.w * 0.28,
          h: dim.h - floorY,
          troll: { type: 'drop' },
          triggered: false
        };
        drawPreviewSlab(ctx, 10, floorY, dim.w * 0.26, dim.h - floorY, dim.w * 0.5, pal);
        drawPreviewSlab(ctx, dim.w * 0.64, floorY, dim.w * 0.32, dim.h - floorY, dim.w * 0.5, pal);
        window.ExoticWorldDraw.drawPlatform(ctx, fakePlat, pal, true, time);
        window.ExoticWorldDraw.drawSpikes(
          ctx,
          { x: dim.w * 0.7, y: floorY, count: 2, dir: 'up', hidden: true },
          pal,
          true,
          time
        );

        // Radar pulse from player
        const px = dim.w * 0.2;
        const py = floorY - 26;
        const rWave = (time * 1.1) % 1;
        ctx.globalAlpha = (1 - rWave) * 0.5;
        ctx.fillStyle = pal.auraBright;
        fillRing(ctx, px + 12, py + 13, 12 + rWave * 75, 10 + rWave * 75);
        ctx.globalAlpha = 1;

        window.ExoticCharacterRenderer.draw(ctx, {
          x: px,
          y: py,
          w: 24,
          h: 26,
          facing: 1,
          characterId: eq.character,
          skinId: eq.skin,
          palette: pal,
          time
        });
      } else {
        // upg_shield Second Wind parry bounce
        drawPreviewSlab(ctx, 12, floorY, dim.w - 24, dim.h - floorY, dim.w * 0.5, pal);
        window.ExoticWorldDraw.drawSpikes(
          ctx,
          { x: dim.w * 0.5 - 18, y: floorY, count: 2, dir: 'up' },
          pal,
          false,
          time
        );

        const px = 24 + norm * (dim.w - 72);
        let py = floorY - 26;
        if (norm > 0.38 && norm < 0.85) {
          const b = (norm - 0.38) / 0.47;
          py = floorY - 26 - Math.sin(b * Math.PI) * 52;
          if (b < 0.4) {
            ctx.globalAlpha = 1 - b * 2.4;
            ctx.fillStyle = pal.auraBright;
            fillRing(ctx, dim.w * 0.5, floorY - 12, 8 + b * 36, 5 + b * 33);
            ctx.globalAlpha = 1;
          }
        }
        // Shield halo before hit
        if (norm <= 0.38) {
          ctx.globalAlpha = 0.35;
          ctx.fillStyle = pal.auraBright;
          fillRing(ctx, px + 12, py + 13, 19, 17);
          ctx.globalAlpha = 1;
        }
        window.ExoticCharacterRenderer.draw(ctx, {
          x: px,
          y: py,
          w: 24,
          h: 26,
          facing: 1,
          characterId: eq.character,
          skinId: eq.skin,
          palette: pal,
          time
        });
      }

      ctx.restore();
      return;
    }

    // Standard Showcase Stage for Auras, Characters, Skins, Trails, Emotes
    if (is3D) {
      window.Exotic3D.drawExtrudedBox(ctx, dim.w * 0.1, floorY, dim.w * 0.8, dim.h - floorY, {
        palette: pal,
        vanishX: dim.w * 0.5,
        depth: 18,
        frontColor: pal.platform,
        capColor: pal.platformCap,
        castShadow: false
      });
      ctx.fillStyle = pal.platformCap;
      ctx.fillRect(dim.w * 0.1, floorY, dim.w * 0.8, 3.5);
    } else {
      ctx.fillStyle = pal.platform;
      ctx.fillRect(dim.w * 0.1, floorY, dim.w * 0.8, dim.h - floorY);
      ctx.fillStyle = pal.platformCap;
      ctx.fillRect(dim.w * 0.1, floorY, dim.w * 0.8, 3.5);
    }

    const charId = item.category === 'characters' ? item.id : eq.character;
    const skinId = item.category === 'skins' ? item.id : eq.skin;
    const auraId = item.category === 'auras' ? item.id : 'aura_none';
    const trailId = item.category === 'trails' ? item.id : 'trail_none';
    const emoteId = item.category === 'emotes' ? item.id : null;

    let px = dim.w * 0.5 - 14;
    let py = floorY - 30;
    let vx = 0;
    let vy = 0;
    let facing = 1;
    let emoteProgress = 0;

    if (item.category === 'trails' || item.category === 'characters') {
      const span = dim.w * 0.28;
      const angle = norm * Math.PI * 2;
      px = dim.w * 0.5 + Math.sin(angle) * span - 13;
      vx = Math.cos(angle) * 210;
      facing = vx >= 0 ? 1 : -1;
      const hop = Math.max(0, Math.sin(angle * 2));
      py = floorY - 28 - hop * 34;
      vy = -Math.cos(angle * 2) * 140;
    } else if (item.category === 'skins') {
      const angle = norm * Math.PI * 2;
      px = dim.w * 0.5 + Math.sin(angle) * (dim.w * 0.16) - 16;
      vx = Math.cos(angle) * 140;
      facing = vx >= 0 ? 1 : -1;
      const hop = Math.abs(Math.sin(angle * 2));
      py = floorY - 34 - hop * 18;
    } else if (item.category === 'auras') {
      py = floorY - 32 - Math.sin(norm * Math.PI * 2) * 5;
    } else if (item.category === 'emotes') {
      emoteProgress = (norm * 1.4) % 1;
    }

    const pState = {
      x: px,
      y: py,
      w: item.category === 'skins' ? 32 : 28,
      h: item.category === 'skins' ? 34 : 30,
      vx,
      vy,
      facing,
      gravitySign: 1
    };

    if (trailSys) {
      trailSys.update(dt, trailId, pState);
      trailSys.draw(ctx, trailId, pal, charId, skinId, time);
    }

    const cx = pState.x + pState.w * 0.5;
    const cy = pState.y + pState.h * 0.5;

    if (is3D) {
      const dist = Math.max(0, floorY - (pState.y + pState.h));
      const scShadow = Math.max(0.45, 1 - dist / 65);
      window.Exotic3D.drawGroundShadow(
        ctx,
        cx,
        floorY - 1.5,
        13 * scShadow,
        3.6 * scShadow,
        0.3 * scShadow,
        pal
      );
    }

    window.ExoticAuraRenderer.drawBack(ctx, auraId, cx, cy, time, pal);
    window.ExoticCharacterRenderer.draw(ctx, {
      ...pState,
      characterId: charId,
      skinId: skinId,
      emoteId,
      emoteProgress,
      palette: pal,
      time
    });
    window.ExoticAuraRenderer.drawFront(ctx, auraId, cx, cy, time, pal);

    // Subtle floating diamond accents on empty-option cards so user knows preview is live
    if (item.id === 'aura_none' || item.id === 'trail_none') {
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = pal.auraDim;
      fillDiamond(ctx, dim.w * 0.22, floorY - 24, 3, 3);
      fillDiamond(ctx, dim.w * 0.78, floorY - 32, 3, 3);
    }

    ctx.restore();
  }

  function renderLevelPreview(rec, time, pal) {
    const { ctx, canvas, level, scrubber } = rec;
    const dim = fitCanvas(canvas);
    if (!dim) return;

    const loopDur = 5.5;
    const loopT = (time + rec.seed) % loopDur;
    const norm = loopT / loopDur;
    if (scrubber) {
      scrubber.style.width = `${(norm * 100).toFixed(1)}%`;
    }

    const state = window.ExoticStorage.getState();
    const eq = state.equipped;

    ctx.save();
    ctx.scale(dim.dpr, dim.dpr);
    ctx.fillStyle = pal.stageBg;
    ctx.fillRect(0, 0, dim.w, dim.h);

    const scale = dim.h / level.height;
    const viewWorldW = dim.w / scale;
    const maxPan = Math.max(0, level.width - viewWorldW);
    // Smooth ping-pong camera pan across the actual level!
    const panWave = 0.5 - 0.5 * Math.cos(norm * Math.PI * 2);
    const camX = panWave * maxPan;

    const is3D = Boolean(pal.is3D && window.Exotic3D);
    if (is3D) {
      window.Exotic3D.draw3DStageChamber(ctx, dim.w, dim.h, camX, pal);
    }

    ctx.scale(scale, scale);
    ctx.translate(-camX, 0);
    window.ExoticWorldDraw.setVanishX?.(camX + viewWorldW * 0.5);

    // Background pillars inside level preview
    ctx.fillStyle = pal.bgPillar;
    for (let bx = 80; bx < level.width; bx += 220) {
      if (is3D) {
        window.Exotic3D.drawExtrudedBox(ctx, bx, 60, 34, level.height, {
          palette: pal,
          vanishX: camX + viewWorldW * 0.5,
          depth: 16,
          frontColor: pal.bgPillar,
          castShadow: false
        });
      } else {
        ctx.fillRect(bx, 60, 34, level.height);
      }
    }

    // Dishonest wall signs (flip mid-preview loop!)
    if (level.signs) {
      for (const sg of level.signs) {
        window.ExoticWorldDraw.drawSign(
          ctx,
          { ...sg, triggered: norm > 0.45 && norm < 0.85 },
          pal
        );
      }
    }

    for (const gz of level.gravityZones) {
      window.ExoticWorldDraw.drawGravityZone(ctx, gz, pal, time);
    }

    // Animate actual troll platforms slightly in the preview!
    for (const p of level.platforms) {
      if (p.hiddenUntilReveal) continue;
      let ox = 0;
      let oy = 0;
      if (p.troll && p.troll.type === 'drop' && !p.troll.manualOnly) {
        const tWave = Math.max(0, Math.sin(norm * Math.PI * 2 - 1.2));
        oy = tWave * (p.troll.targetDY * 0.45);
      } else if (p.troll && p.troll.type === 'slide') {
        const tWave = Math.max(0, Math.sin(norm * Math.PI * 2 - 0.8));
        ox = tWave * p.troll.targetDX;
      }
      window.ExoticWorldDraw.drawPlatform(
        ctx,
        { ...p, x: p.x + ox, y: p.y + oy },
        pal,
        false,
        time
      );
    }

    if (level.fakeCheckpoints) {
      for (const cp of level.fakeCheckpoints) {
        window.ExoticWorldDraw.drawFakeCheckpoint(ctx, cp, pal, time);
      }
    }

    for (const spr of level.springs) {
      window.ExoticWorldDraw.drawSpring(ctx, spr, pal);
    }

    for (const sp of level.spikes) {
      let ox = 0;
      let oy = 0;
      let popProgress = sp.hidden ? (Math.sin(norm * Math.PI * 4) > 0.35 ? 1 : 0) : 1;
      if (sp.troll && sp.troll.type === 'slide') {
        ox = Math.max(0, Math.sin(norm * Math.PI * 2)) * sp.troll.targetDX;
      } else if (sp.troll && sp.troll.type === 'jump') {
        oy = -Math.max(0, Math.sin(norm * Math.PI * 4)) * 65;
      }
      window.ExoticWorldDraw.drawSpikes(
        ctx,
        { ...sp, x: sp.x + ox, y: sp.y + oy, popProgress },
        pal,
        false,
        time
      );
    }

    for (const cr of level.crushers) {
      const slamWave = Math.pow(Math.max(0, Math.sin(norm * Math.PI * 2 + cr.x * 0.01)), 3);
      window.ExoticWorldDraw.drawCrusher(
        ctx,
        { ...cr, y: cr.y + slamWave * cr.dropDist },
        pal
      );
    }

    for (const saw of level.saws) {
      let sx = saw.x;
      let sy = saw.y;
      if (saw.patrolDY) {
        sy += Math.sin(time * (saw.speed || 2.5)) * saw.patrolDY;
      } else if (saw.chaseSpeedX) {
        sx += Math.max(0, Math.sin(norm * Math.PI * 2)) * 120;
      }
      window.ExoticWorldDraw.drawSaw(ctx, { ...saw, x: sx, y: sy, awake: true }, pal, time);
    }

    for (const c of level.coins) {
      window.ExoticWorldDraw.drawCoin(ctx, c, pal, time);
    }

    window.ExoticWorldDraw.drawSkillOrb(
      ctx,
      level.skillOrb,
      window.ExoticStorage.hasCollectedOrb(level.id),
      pal,
      time
    );

    for (const d of level.doors) {
      if (d.hiddenUntilReveal) continue;
      let dx = d.x;
      if (d.shyTargetX) {
        const shyWave = norm > 0.58 ? Math.min(1, (norm - 0.58) * 5) : 0;
        dx = d.x + (d.shyTargetX - d.x) * shyWave;
      }
      window.ExoticWorldDraw.drawDoor(ctx, { ...d, x: dx }, pal, time);
    }

    // Autonomous miniature runner traversing the level preview!
    const runStart = level.spawn.x;
    const runEnd = Math.min(level.width - 90, runStart + 560);
    const rx = runStart + panWave * (runEnd - runStart);
    const hop = Math.abs(Math.sin(norm * Math.PI * 6)) * 56;
    const inGravFlip = level.gravityZones.some(
      (gz) => gz.gravitySign < 0 && rx > gz.x && rx < gz.x + 420
    );
    const baseGroundY = inGravFlip ? 96 + hop : level.spawn.y - hop;

    window.ExoticCharacterRenderer.draw(ctx, {
      x: rx,
      y: baseGroundY,
      w: 24,
      h: 26,
      facing: norm < 0.5 ? 1 : -1,
      gravitySign: inGravFlip ? -1 : 1,
      characterId: eq.character,
      skinId: eq.skin,
      palette: pal,
      time
    });

    ctx.restore();
  }

  function renderShopThumb(rec, time, dt, pal) {
    const { ctx, canvas, item, trailSys } = rec;
    const dim = fitCanvas(canvas);
    if (!dim) return;

    const state = window.ExoticStorage.getState();
    const eq = state.equipped;
    const { fillRing, fillDiamond } = window.ExoticCharacterRenderer;

    ctx.save();
    ctx.scale(dim.dpr, dim.dpr);
    ctx.fillStyle = pal.stageBg;
    ctx.fillRect(0, 0, dim.w, dim.h);

    const floorY = Math.round(dim.h * 0.82);
    window.ExoticWorldDraw.setVanishX?.(dim.w * 0.5);
    drawPreviewSlab(ctx, 4, floorY, dim.w - 8, dim.h - floorY, dim.w * 0.5, pal, 6);

    const sc = Math.min(0.68, (floorY - 6) / 28);
    const rw = 24 * sc;
    const rh = 26 * sc;
    const rx = (dim.w - rw) * 0.5;
    const bob = Math.abs(Math.sin((time + rec.seed) * 4.5)) * 2.2;
    const ry = floorY - rh - bob;

    const charId = item.category === 'characters' ? item.id : eq.character;
    const skinId = item.category === 'skins' ? item.id : eq.skin;
    const auraId = item.category === 'auras' ? item.id : 'aura_none';
    const emoteId = item.category === 'emotes' ? item.id : null;
    const emoteProgress = emoteId ? ((time * 0.72 + rec.seed) % 1) : 0;

    if (item.category === 'maps' && window.ExoticBrawlRenderer) {
      window.ExoticBrawlRenderer.renderMapCardPreview(ctx, dim, item.id, time + rec.seed, pal);
      ctx.restore();
      return;
    }

    if (item.category === 'weapons' && window.ExoticBrawlRenderer) {
      window.ExoticCharacterRenderer.draw(ctx, {
        x: rx - 4,
        y: ry,
        w: rw,
        h: rh,
        vx: 95,
        vy: 0,
        facing: 1,
        characterId: charId,
        skinId,
        palette: pal,
        time: time + rec.seed
      });
      ctx.save();
      ctx.translate(rx - 4 + rw * 0.5, ry + rh * 0.5);
      ctx.scale(0.76, 0.76);
      window.ExoticBrawlRenderer.drawWeaponInHand(ctx, item.id, {
        cx: 0,
        cy: 0,
        facing: 1,
        attack: { moveKey: 'slight', sig: false },
        attackProgress: (time * 1.8 + rec.seed) % 1,
        pal,
        time: time + rec.seed
      });
      ctx.restore();
      ctx.restore();
      return;
    }

    if (item.category === 'trails' && trailSys) {
      const sweep = ((time * 0.9 + rec.seed) % 1);
      const tx = 8 + sweep * (dim.w - rw - 14);
      ctx.save();
      ctx.translate(dim.w * 0.5, floorY);
      ctx.scale(sc, sc);
      ctx.translate(-dim.w * 0.5, -floorY);
      trailSys.update(dt, item.id, {
        x: tx,
        y: floorY - 26,
        w: 24,
        h: 26,
        vx: 165,
        vy: 0,
        facing: 1,
        grounded: true,
        dashing: true
      });
      trailSys.draw(ctx, item.id, pal, time, charId, skinId);
      window.ExoticCharacterRenderer.draw(ctx, {
        x: tx,
        y: floorY - 26,
        w: 24,
        h: 26,
        vx: 165,
        facing: 1,
        characterId: charId,
        skinId,
        palette: pal,
        time
      });
      ctx.restore();
      ctx.restore();
      return;
    }

    if (auraId && auraId !== 'aura_none') {
      ctx.save();
      ctx.translate(rx + rw * 0.5, ry + rh * 0.5);
      ctx.scale(sc, sc);
      window.ExoticAuraRenderer.drawBack(ctx, auraId, 0, 0, time + rec.seed, pal);
      ctx.restore();
    }

    if (item.category === 'upgrades') {
      ctx.save();
      ctx.fillStyle = pal.colored ? pal.skillOuter : pal.auraBright;
      ctx.globalAlpha = 0.72;
      const cx = rx + rw * 0.5;
      const cy = ry + rh * 0.5;
      if (item.id === 'upg_shield' || item.id === 'upg_magnet') {
        fillRing(ctx, cx, cy, 13, 10.8);
      } else {
        fillDiamond(ctx, cx + 11, cy - 5, 4.2, 4.2);
      }
      ctx.restore();
    }

    window.ExoticCharacterRenderer.draw(ctx, {
      x: rx,
      y: ry,
      w: rw,
      h: rh,
      vx: item.category === 'characters' || item.category === 'skins' ? 95 : 0,
      vy: 0,
      facing: 1,
      characterId: charId,
      skinId,
      emoteId,
      emoteProgress,
      palette: pal,
      time: time + rec.seed
    });

    if (auraId && auraId !== 'aura_none') {
      ctx.save();
      ctx.translate(rx + rw * 0.5, ry + rh * 0.5);
      ctx.scale(sc, sc);
      window.ExoticAuraRenderer.drawFront(ctx, auraId, 0, 0, time + rec.seed, pal);
      ctx.restore();
    }

    ctx.restore();
  }

  function tick(now) {
    const dt = Math.min(0.05, (now - lastNow) / 1000);
    lastNow = now;
    const time = now / 1000;
    const pal = window.ExoticTheme.getPalette();

    cards.forEach((rec) => {
      if (!rec.visible) return;
      if (rec.kind === 'shop') {
        renderShopPreview(rec, time, dt, pal);
      } else if (rec.kind === 'shop-thumb') {
        renderShopThumb(rec, time, dt, pal);
      } else if (rec.kind === 'level') {
        renderLevelPreview(rec, time, pal);
      }
    });

    rafId = requestAnimationFrame(tick);
  }

  window.ExoticPreviewDirector = {
    clear() {
      if (observer) {
        observer.disconnect();
      }
      cards.clear();
    },
    clearGroup(group) {
      if (!group) return;
      cards.forEach((rec, canvas) => {
        if (rec.group === group) {
          if (observer) observer.unobserve(canvas);
          cards.delete(canvas);
        }
      });
    },
    registerShopCard(canvas, scrubber, item, index = 0, group = 'grid') {
      if (!canvas || !item) return;
      ensureObserver();
      const rec = {
        kind: 'shop',
        group,
        canvas,
        ctx: canvas.getContext('2d'),
        scrubber,
        item,
        trailSys: item.category === 'trails' ? new window.ExoticTrailSystem() : null,
        visible: true,
        seed: index * 0.37
      };
      cards.set(canvas, rec);
      if (observer) observer.observe(canvas);
      if (!rafId) {
        lastNow = performance.now();
        rafId = requestAnimationFrame(tick);
      }
    },
    registerShopThumb(canvas, item, index = 0, group = 'raycast-list') {
      if (!canvas || !item) return;
      ensureObserver();
      const rec = {
        kind: 'shop-thumb',
        group,
        canvas,
        ctx: canvas.getContext('2d'),
        item,
        trailSys: item.category === 'trails' ? new window.ExoticTrailSystem() : null,
        visible: true,
        seed: index * 0.29
      };
      cards.set(canvas, rec);
      if (observer) observer.observe(canvas);
      if (!rafId) {
        lastNow = performance.now();
        rafId = requestAnimationFrame(tick);
      }
    },
    registerLevelCard(canvas, scrubber, level, index = 0, group = 'grid') {
      if (!canvas || !level) return;
      ensureObserver();
      const rec = {
        kind: 'level',
        group,
        canvas,
        ctx: canvas.getContext('2d'),
        scrubber,
        level,
        visible: true,
        seed: index * 0.61
      };
      cards.set(canvas, rec);
      if (observer) observer.observe(canvas);
      if (!rafId) {
        lastNow = performance.now();
        rafId = requestAnimationFrame(tick);
      }
    }
  };
})();
