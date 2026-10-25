(function () {
  const VALID_ROUTES = [
    'splash',
    'menu',
    'play',
    'levels',
    'shop',
    'settings',
    'achievements',
    'leaderboards',
    'credits'
  ];

  let currentRoute = 'splash';
  const listeners = new Set();

  function navigate(route, opts = {}) {
    const target = VALID_ROUTES.includes(route) ? route : 'menu';
    const prev = currentRoute;
    currentRoute = target;

    // Toggle active view element
    for (const id of VALID_ROUTES) {
      const el = document.getElementById(`view-${id}`);
      if (el) {
        el.classList.toggle('is-active', id === target);
      }
    }

    // Topbar visibility (shown on Menu and sub-pages, hidden on Splash & Play)
    const topbar = document.getElementById('global-topbar');
    if (topbar) {
      topbar.classList.toggle('is-hidden', target === 'splash' || target === 'play');
    }

    const backBtn = document.getElementById('topbar-back-btn');
    if (backBtn) {
      backBtn.style.display = target === 'menu' ? 'none' : 'inline-flex';
    }

    // Stop active gameplay loop when leaving Play route
    if (prev === 'play' && target !== 'play') {
      window.ExoticEngine.stop();
    }

    // Pause backdrop heavy drawing during fullscreen Play to dedicate 100% GPU to stage
    window.ExoticBackdrop.setActive(target !== 'play');

    // Clear offscreen video card observers when leaving Levels/Shop
    if (target !== 'levels' && target !== 'shop') {
      window.ExoticPreviewDirector.clear();
    }

    listeners.forEach((fn) => fn(target, opts));
  }

  window.ExoticRouter = {
    navigate,
    getCurrent() {
      return currentRoute;
    },
    onNavigate(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    }
  };
})();
