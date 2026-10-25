(function () {
  function hydrateIcons() {
    document.querySelectorAll('[data-icon]').forEach((el) => {
      const name = el.getAttribute('data-icon');
      el.innerHTML = window.ExoticIcons.get(name);
    });
  }

  function runSplashBoot(authReadyPromise) {
    const fillEl = document.getElementById('splash-progress-fill');
    const stepEl = document.getElementById('splash-step-label');
    const pctEl = document.getElementById('splash-pct-label');
    const enterBtn = document.getElementById('splash-enter-btn');

    const steps = [
      { pct: 20, label: 'Loading monochrome palette & runner profile...' },
      { pct: 45, label: 'Verifying account session...' },
      { pct: 70, label: 'Preparing character, aura & trail systems...' },
      { pct: 90, label: 'Tuning sound effects & trap triggers...' },
      { pct: 100, label: 'Ready.' }
    ];

    let idx = 0;
    let entered = false;

    async function enterAppAfterAuth() {
      if (entered) return;
      entered = true;
      await authReadyPromise.catch(() => {});
      const hashRoute = (location.hash || '').replace('#', '').trim();
      const defaultRoute = window.ExoticAuth
        ? window.ExoticAuth.getDefaultEntryRoute()
        : 'menu';
      const target =
        hashRoute && hashRoute !== 'splash' ? hashRoute : defaultRoute;
      window.ExoticRouter.navigate(target);
    }

    if (enterBtn) {
      enterBtn.addEventListener('click', () => {
        window.ExoticAudio.unlock();
        window.ExoticAudio.click();
        enterAppAfterAuth();
      });
    }

    function advance() {
      if (idx >= steps.length) {
        if (enterBtn) enterBtn.style.opacity = '1';
        setTimeout(enterAppAfterAuth, 280);
        return;
      }
      const s = steps[idx];
      if (fillEl) fillEl.style.width = `${s.pct}%`;
      if (stepEl) stepEl.textContent = s.label;
      if (pctEl) pctEl.textContent = `${s.pct}%`;
      idx += 1;
      setTimeout(advance, 160);
    }

    advance();
  }

  window.addEventListener('DOMContentLoaded', () => {
    hydrateIcons();

    const saved = window.ExoticStorage.init();
    window.ExoticTheme.init(saved.settings.theme || 'dark');
    window.ExoticAudio.setMuted(Boolean(saved.settings.muted));
    window.ExoticAudio.setVolume(saved.settings.volume ?? 0.7);

    window.ExoticBackdrop.init();

    window.ExoticEngine.init({
      onHudUpdate: (hud) => window.ExoticViews.onHudUpdate(hud),
      onLevelWin: (payload) => window.ExoticViews.openVictoryModal(payload),
      onPauseToggle: (paused) => window.ExoticViews.openPauseModal(paused),
      onFullscreenToggle: () => window.ExoticViews.toggleCanvasFullscreen(),
      onToast: (msg) => window.ExoticViews.showToast(msg),
      onRageQuip: (quip) => window.ExoticViews.showRageQuip(quip)
    });

    window.ExoticViews.init();

    const authReadyPromise = (async () => {
      await window.ExoticAuth.init();
      window.ExoticRealtime.init();
    })();

    runSplashBoot(authReadyPromise);
  });
})();
