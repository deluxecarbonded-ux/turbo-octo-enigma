(function () {
  function hydrateIcons() {
    document.querySelectorAll('[data-icon]').forEach((el) => {
      const name = el.getAttribute('data-icon');
      el.innerHTML = window.ExoticIcons.get(name);
    });
  }

  function runSplashBoot(authReadyPromise) {
    const fillEl = document.getElementById('splash-progress-fill');
    const pctEl = document.getElementById('splash-pct-label');
    const enterBtn = document.getElementById('splash-enter-btn');

    const steps = [20, 45, 70, 90, 100];

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
      const pct = steps[idx];
      if (fillEl) fillEl.style.width = `${pct}%`;
      if (pctEl) pctEl.textContent = `${pct}%`;
      idx += 1;
      setTimeout(advance, 160);
    }

    advance();
  }

  window.addEventListener('DOMContentLoaded', () => {
    hydrateIcons();

    const saved = window.ExoticStorage.init();
    window.ExoticTheme.init(
      saved.settings.theme || 'dark',
      saved.settings.colorMode || 'monochrome',
      saved.settings.dimensionMode || '2d'
    );
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

    window.ExoticBrawlEngine?.init();

    window.ExoticViews.init();

    const authReadyPromise = (async () => {
      await window.ExoticAuth.init();
      window.ExoticRealtime.init();
    })();

    runSplashBoot(authReadyPromise);
  });
})();
