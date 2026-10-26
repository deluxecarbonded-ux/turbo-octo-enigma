(function () {
  const VALID_ROUTES = [
    'splash',
    'signup',
    'signin',
    'menu',
    'play',
    'brawl',
    'brawl-play',
    'levels',
    'shop',
    'achievements',
    'leaderboards',
    'settings',
    'credits'
  ];

  const TOPBAR_HIDDEN_ROUTES = new Set(['splash', 'signup', 'signin', 'play', 'brawl-play']);

  let currentRoute = 'splash';
  const listeners = new Set();

  function setRouteView(route, options = {}) {
    const requested = VALID_ROUTES.includes(route) ? route : 'menu';
    const target = window.ExoticAuth
      ? window.ExoticAuth.resolveGuardedRoute(requested)
      : requested;
    const prev = currentRoute;
    currentRoute = target;

    document.querySelectorAll('.ex-view').forEach((el) => {
      const isMatch = el.id === `view-${target}`;
      el.classList.toggle('is-active', isMatch);
    });

    const topbar = document.getElementById('global-topbar');
    if (topbar) {
      topbar.classList.toggle('is-hidden', TOPBAR_HIDDEN_ROUTES.has(target));
    }

    const backBtn = document.getElementById('topbar-back-btn');
    if (backBtn) {
      backBtn.style.display = target === 'menu' ? 'none' : 'inline-flex';
    }

    if (prev === 'play' && target !== 'play' && window.ExoticEngine) {
      window.ExoticEngine.stop();
    }
    if (prev === 'brawl-play' && target !== 'brawl-play' && window.ExoticBrawlEngine) {
      window.ExoticBrawlEngine.stop();
    }

    if (window.ExoticBackdrop && typeof window.ExoticBackdrop.setActive === 'function') {
      window.ExoticBackdrop.setActive(target !== 'play' && target !== 'brawl-play');
    }

    if (
      target !== 'levels' &&
      target !== 'shop' &&
      target !== 'brawl' &&
      window.ExoticPreviewDirector &&
      typeof window.ExoticPreviewDirector.clear === 'function'
    ) {
      window.ExoticPreviewDirector.clear();
    }

    if (!options.silentHash && target !== 'splash') {
      try {
        history.replaceState(null, '', `#${target}`);
      } catch {
        // Ignore history restrictions in sandboxed frames
      }
    }

    listeners.forEach((fn) => {
      try {
        fn(target, options);
      } catch (err) {
        console.error('[ExoticRouter] Navigation listener error:', err);
      }
    });
  }

  window.addEventListener('popstate', () => {
    const hash = (location.hash || '').replace('#', '').trim();
    if (VALID_ROUTES.includes(hash) && hash !== 'splash') {
      setRouteView(hash, { silentHash: true });
    }
  });

  window.ExoticRouter = {
    navigate(route, options = {}) {
      setRouteView(route, options);
    },
    getCurrent() {
      return currentRoute;
    },
    onNavigate(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    }
  };
})();
