(function () {
  class TrailSystem {
    constructor() {
      this.nodes = [];
      this.emitAcc = 0;
    }

    reset() {
      this.nodes.length = 0;
      this.emitAcc = 0;
    }

    update(dt, trailId, playerState) {
      if (!trailId || trailId === 'trail_none') {
        this.nodes.length = 0;
        return;
      }

      const speed = Math.hypot(playerState.vx || 0, playerState.vy || 0);
      const interval = trailId === 'trail_ribbon' || trailId === 'trail_bolt' ? 0.018 : 0.036;
      this.emitAcc += dt;

      if (speed > 24 && this.emitAcc >= interval) {
        this.emitAcc = 0;
        this.nodes.push({
          x: playerState.x + playerState.w * 0.5,
          y: playerState.y + playerState.h * 0.5,
          px: playerState.x,
          py: playerState.y,
          w: playerState.w,
          h: playerState.h,
          facing: playerState.facing || 1,
          gravitySign: playerState.gravitySign || 1,
          age: 0,
          life: trailId === 'trail_ghost' ? 0.28 : 0.38,
          jitterX: (Math.random() - 0.5) * 8,
          jitterY: (Math.random() - 0.5) * 8,
          glyph: Math.random() > 0.5 ? '1' : '0',
          rot: Math.random() * Math.PI
        });
      }

      for (let i = this.nodes.length - 1; i >= 0; i--) {
        const n = this.nodes[i];
        n.age += dt;
        if (n.age >= n.life) {
          this.nodes.splice(i, 1);
        }
      }
    }

    draw(ctx, trailId, pal, charId, skinId, time) {
      if (!trailId || trailId === 'trail_none' || this.nodes.length === 0) return;
      const { fillRing, fillDiamond } = window.ExoticCharacterRenderer;
      const isColored = Boolean(pal && pal.colored);
      const isLight = pal && pal.mode === 'light';

      ctx.save();

      if (trailId === 'trail_ribbon' && this.nodes.length >= 2) {
        // Tapered solid polygon ribbon (zero strokes!)
        ctx.fillStyle = isColored ? (isLight ? '#db2777' : '#f472b6') : pal.auraSoft;
        ctx.globalAlpha = isColored ? 0.68 : 0.55;
        ctx.beginPath();
        for (let i = 0; i < this.nodes.length; i++) {
          const n = this.nodes[i];
          const t = i / (this.nodes.length - 1);
          const halfThick = t * 7.5;
          if (i === 0) ctx.moveTo(n.x, n.y - halfThick);
          else ctx.lineTo(n.x, n.y - halfThick);
        }
        for (let i = this.nodes.length - 1; i >= 0; i--) {
          const n = this.nodes[i];
          const t = i / (this.nodes.length - 1);
          const halfThick = t * 7.5;
          ctx.lineTo(n.x, n.y + halfThick);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        return;
      }

      if (trailId === 'trail_bolt' && this.nodes.length >= 2) {
        // Solid angular lightning quads (zero strokes!)
        for (let i = 1; i < this.nodes.length; i++) {
          const a = this.nodes[i - 1];
          const b = this.nodes[i];
          const t = 1 - b.age / b.life;
          const offA = ((i % 2) * 2 - 1) * 4.5;
          const offB = (((i + 1) % 2) * 2 - 1) * 4.5;
          const thick = Math.max(1.2, t * 3.4);
          ctx.fillStyle = isColored
            ? i % 2 === 0
              ? isLight
                ? '#eab308'
                : '#facc15'
              : isLight
                ? '#0284c7'
                : '#38bdf8'
            : pal.auraBright;
          ctx.globalAlpha = t * 0.88;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y + offA - thick);
          ctx.lineTo(b.x, b.y + offB - thick);
          ctx.lineTo(b.x, b.y + offB + thick);
          ctx.lineTo(a.x, a.y + offA + thick);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
        return;
      }

      for (let i = 0; i < this.nodes.length; i++) {
        const n = this.nodes[i];
        const lifeLeft = Math.max(0, 1 - n.age / n.life);

        if (trailId === 'trail_dust') {
          ctx.globalAlpha = lifeLeft * (isColored ? 0.84 : 0.72);
          ctx.fillStyle = isColored
            ? i % 2 === 0
              ? isLight
                ? '#d97706'
                : '#fbbf24'
              : isLight
                ? '#f59e0b'
                : '#fde68a'
            : pal.auraSoft;
          const sz = Math.max(2, lifeLeft * 6);
          ctx.save();
          ctx.translate(n.x + n.jitterX * 0.6, n.y + 8 + n.jitterY * 0.4 - n.age * 16);
          ctx.rotate(n.rot + n.age * 5);
          ctx.fillRect(-sz * 0.5, -sz * 0.5, sz, sz);
          ctx.restore();
        } else if (trailId === 'trail_ghost') {
          window.ExoticCharacterRenderer.draw(ctx, {
            x: n.px,
            y: n.py,
            w: n.w,
            h: n.h,
            facing: n.facing,
            gravitySign: n.gravitySign,
            characterId: charId,
            skinId: skinId || 'skin_solid',
            palette: pal,
            time,
            alpha: lifeLeft * 0.34
          });
        } else if (trailId === 'trail_rings') {
          ctx.globalAlpha = lifeLeft * (isColored ? 0.78 : 0.62);
          ctx.fillStyle = isColored
            ? i % 2 === 0
              ? isLight
                ? '#0891b2'
                : '#22d3ee'
              : isLight
                ? '#4f46e5'
                : '#818cf8'
            : pal.auraBright;
          const r = 4 + (1 - lifeLeft) * 14;
          fillRing(ctx, n.x, n.y, r, Math.max(0.5, r - 2.2));
        } else if (trailId === 'trail_shards') {
          ctx.globalAlpha = lifeLeft * (isColored ? 0.9 : 0.82);
          ctx.fillStyle = isColored
            ? i % 3 === 0
              ? isLight
                ? '#e11d48'
                : '#fb7185'
              : i % 3 === 1
                ? isLight
                  ? '#d97706'
                  : '#fbbf24'
                : isLight
                  ? '#0891b2'
                  : '#22d3ee'
            : i % 2 === 0
              ? pal.auraBright
              : pal.auraSoft;
          ctx.save();
          ctx.translate(n.x + n.jitterX * 0.5, n.y + n.jitterY * 0.5);
          ctx.rotate(n.rot + n.age * 7);
          fillDiamond(ctx, 0, 0, 2.6 * lifeLeft + 1, 6.2 * lifeLeft + 1.5);
          ctx.restore();
        } else if (trailId === 'trail_binary') {
          ctx.globalAlpha = lifeLeft * (isColored ? 0.92 : 0.8);
          ctx.fillStyle = isColored ? (isLight ? '#059669' : '#34d399') : pal.auraBright;
          ctx.font = '700 10px ui-monospace, monospace';
          ctx.textAlign = 'center';
          ctx.fillText(n.glyph, n.x + n.jitterX * 0.4, n.y + n.jitterY * 0.5 - n.age * 14);
        }
      }

      ctx.restore();
    }
  }

  window.ExoticTrailSystem = TrailSystem;
})();
