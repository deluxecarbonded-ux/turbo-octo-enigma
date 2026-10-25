(function () {
  function hydrateIcons() {
    document.querySelectorAll('[data-icon]').forEach((el) => {
      const name = el.getAttribute('data-icon');
      el.innerHTML = window.ExoticIcons.get(name);
    });
  }

  function runSplashBoot() {
    const fillEl = document.getElementById('splash-progress-fill');
    const stepEl = document.getElementById('splash-step-label');
    const pctEl = document.getElementById('splash-pct-label');
    const enterBtn = document.getElementById('splash-enter-btn');

    const steps = [
      { pct: 18, label: 'Loading monochrome palette & save state...' },
      { pct: 42, label: 'Compiling 2D sub-step collision & trap choreography...' },
      { pct: 68, label: 'Warming Canvas aura, trail & character renderers...' },
      { pct: 88, label: 'Calibrating WebAudio synthesizer...' },
      { pct: 100, label: 'Ready.' }
    ];

    let idx = 0;
    let entered = false;

    function enterMainMenu() {
      if (entered) return;
      entered = true;
      window.ExoticRouter.navigate('menu');
    }

    if (enterBtn) {
      enterBtn.addEventListener('click', () => {
        window.ExoticAudio.unlock();
        window.ExoticAudio.click();
        enterMainMenu();
      });
    }

    function advance() {
      if (idx >= steps.length) {
        if (enterBtn) enterBtn.style.opacity = '1';
        setTimeout(enterMainMenu, 360);
        return;
      }
      const s = steps[idx];
      if (fillEl) fillEl.style.width = `${s.pct}%`;
      if (stepEl) stepEl.textContent = s.label;
      if (pctEl) pctEl.textContent = `${s.pct}%`;
      idx += 1;
      setTimeout(advance, 190);
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
      onToast: (msg) => window.ExoticViews.showToast(msg),
      onRageQuip: (quip) => window.ExoticViews.showRageQuip(quip)
    });

    window.ExoticViews.init();
    runSplashBoot();
  });
})();
