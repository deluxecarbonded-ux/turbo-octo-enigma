(function () {
  const PALETTES = {
    dark_monochrome: {
      mode: 'dark',
      colorMode: 'monochrome',
      colored: false,
      sky: '#0a0a0a',
      stageBg: '#0d0d0d',
      bgPillar: '#141414',
      bgPillarAlt: '#1a1a1a',
      bgMote: '#2b2b2b',
      moteColors: ['#2b2b2b', '#333333', '#242424', '#383838'],
      platform: '#262626',
      platformFill: '#262626',
      platformCap: '#f5f5f5',
      platformDetail: '#383838',
      platformShadow: '#080808',
      trapHint: '#333333',
      hazard: '#fafafa',
      hazardInner: '#0a0a0a',
      springBase: '#424242',
      springTop: '#ffffff',
      coinOuter: '#fafafa',
      coinInner: '#1a1a1a',
      skillOuter: '#ffffff',
      skillInner: '#525252',
      doorFrame: '#fafafa',
      doorVoid: '#141414',
      doorCore: '#ffffff',
      playerPrimary: '#ffffff',
      playerSecondary: '#0a0a0a',
      playerMid: '#a3a3a3',
      auraBright: '#ffffff',
      auraSoft: '#d4d4d4',
      auraDim: '#737373',
      gravityZone: 'rgba(255, 255, 255, 0.05)',
      signBg: '#262626',
      signTriggeredBg: '#fafafa',
      signTriggeredFg: '#0a0a0a',
      ghostBody: '#a3a3a3',
      text: '#fafafa',
      textMuted: '#a3a3a3'
    },
    light_monochrome: {
      mode: 'light',
      colorMode: 'monochrome',
      colored: false,
      sky: '#f5f5f5',
      stageBg: '#eeeeee',
      bgPillar: '#e6e6e6',
      bgPillarAlt: '#dedede',
      bgMote: '#cccccc',
      moteColors: ['#cccccc', '#c2c2c2', '#d4d4d4', '#b8b8b8'],
      platform: '#242424',
      platformFill: '#242424',
      platformCap: '#0a0a0a',
      platformDetail: '#3d3d3d',
      platformShadow: '#dcdcdc',
      trapHint: '#383838',
      hazard: '#0a0a0a',
      hazardInner: '#f5f5f5',
      springBase: '#525252',
      springTop: '#0a0a0a',
      coinOuter: '#0a0a0a',
      coinInner: '#ffffff',
      skillOuter: '#0a0a0a',
      skillInner: '#a3a3a3',
      doorFrame: '#0a0a0a',
      doorVoid: '#e5e5e5',
      doorCore: '#0a0a0a',
      playerPrimary: '#0a0a0a',
      playerSecondary: '#ffffff',
      playerMid: '#525252',
      auraBright: '#0a0a0a',
      auraSoft: '#262626',
      auraDim: '#737373',
      gravityZone: 'rgba(10, 10, 10, 0.055)',
      signBg: '#d4d4d4',
      signTriggeredBg: '#0a0a0a',
      signTriggeredFg: '#fafafa',
      ghostBody: '#525252',
      text: '#0a0a0a',
      textMuted: '#525252'
    },
    dark_colored: {
      mode: 'dark',
      colorMode: 'colored',
      colored: true,
      sky: '#0b1020',
      stageBg: '#0e1529',
      bgPillar: '#141f3b',
      bgPillarAlt: '#1b294d',
      bgMote: '#6366f1',
      moteColors: ['#818cf8', '#38bdf8', '#c084fc', '#fbbf24', '#34d399'],
      platform: '#243558',
      platformFill: '#243558',
      platformCap: '#34d399',
      platformDetail: '#3a517e',
      platformShadow: '#080c18',
      trapHint: '#f59e0b',
      hazard: '#fb7185',
      hazardInner: '#be123c',
      springBase: '#059669',
      springTop: '#a3e635',
      coinOuter: '#fbbf24',
      coinInner: '#92400e',
      skillOuter: '#22d3ee',
      skillInner: '#a855f7',
      doorFrame: '#818cf8',
      doorVoid: '#1e1b4b',
      doorCore: '#34d399',
      playerPrimary: '#f8fafc',
      playerSecondary: '#0f172a',
      playerMid: '#6366f1',
      auraBright: '#38bdf8',
      auraSoft: '#a78bfa',
      auraDim: '#6366f1',
      gravityZone: 'rgba(168, 85, 247, 0.14)',
      signBg: '#1e2c4a',
      signTriggeredBg: '#fbbf24',
      signTriggeredFg: '#1e1b4b',
      ghostBody: '#38bdf8',
      text: '#f4f7ff',
      textMuted: '#94a8d6'
    },
    light_colored: {
      mode: 'light',
      colorMode: 'colored',
      colored: true,
      sky: '#e8f0ff',
      stageBg: '#dce8ff',
      bgPillar: '#cbdcff',
      bgPillarAlt: '#b8cefc',
      bgMote: '#6366f1',
      moteColors: ['#6366f1', '#0ea5e9', '#a855f7', '#f59e0b', '#10b981'],
      platform: '#263863',
      platformFill: '#263863',
      platformCap: '#10b981',
      platformDetail: '#41598f',
      platformShadow: '#bfd2fa',
      trapHint: '#d97706',
      hazard: '#e11d48',
      hazardInner: '#ffe4e6',
      springBase: '#047857',
      springTop: '#84cc16',
      coinOuter: '#f59e0b',
      coinInner: '#fef3c7',
      skillOuter: '#0891b2',
      skillInner: '#7c3aed',
      doorFrame: '#4f46e5',
      doorVoid: '#e0e7ff',
      doorCore: '#059669',
      playerPrimary: '#1e293b',
      playerSecondary: '#ffffff',
      playerMid: '#4f46e5',
      auraBright: '#4f46e5',
      auraSoft: '#0891b2',
      auraDim: '#8b5cf6',
      gravityZone: 'rgba(124, 58, 237, 0.11)',
      signBg: '#c7d7fb',
      signTriggeredBg: '#f59e0b',
      signTriggeredFg: '#111827',
      ghostBody: '#0284c7',
      text: '#111a36',
      textMuted: '#475985'
    }
  };

  let currentMode = 'dark';
  let currentColorMode = 'colored';
  const listeners = new Set();

  function normalizeMode(mode) {
    return mode === 'light' ? 'light' : 'dark';
  }

  function normalizeColorMode(colorMode) {
    return colorMode === 'monochrome' ? 'monochrome' : 'colored';
  }

  function syncTabFavicon(mode, colorMode) {
    if (typeof document === 'undefined') return;
    let badgeBg = mode === 'light' ? '#09090b' : '#fafafa';
    let glyphFg = mode === 'light' ? '#fafafa' : '#09090b';
    if (colorMode === 'colored') {
      badgeBg = mode === 'light' ? '#4f46e5' : '#6366f1';
      glyphFg = '#ffffff';
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="20" fill="${badgeBg}"/><g transform="translate(11 11) scale(1.75)"><path fill="${glyphFg}" fill-rule="evenodd" clip-rule="evenodd" d="M4 3h16l-3 5H9v2.5h7l-2.2 3.5H9v2.5h8l3 4.5H4V3zm13.5 7.5L21 12l-3.5 1.5L16 17l-1.5-3.5L11 12l3.5-1.5L16 7l1.5 3.5z"/></g></svg>`;
    const dataUri = `data:image/svg+xml,${encodeURIComponent(svg)}`;
    let link = document.getElementById('app-favicon') || document.querySelector('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.id = 'app-favicon';
      link.rel = 'icon';
      link.type = 'image/svg+xml';
      document.head.appendChild(link);
    }
    link.href = dataUri;
  }

  function applyAttributesAndNotify() {
    document.documentElement.setAttribute('data-theme', currentMode);
    document.documentElement.setAttribute('data-color-mode', currentColorMode);
    syncTabFavicon(currentMode, currentColorMode);
    try {
      localStorage.setItem('exotic_theme_luminance', currentMode);
      localStorage.setItem('exotic_theme_color_mode', currentColorMode);
    } catch {
      // Ignore storage write error
    }
    const pal = resolvePalette(currentMode, currentColorMode);
    listeners.forEach((fn) => {
      try {
        fn(currentMode, pal, currentColorMode);
      } catch {
        // Ignore listener error
      }
    });
  }

  function resolvePalette(mode, colorMode) {
    const m = normalizeMode(mode || currentMode);
    const c = normalizeColorMode(colorMode || currentColorMode);
    return PALETTES[`${m}_${c}`] || PALETTES.dark_colored;
  }

  window.ExoticTheme = {
    init(initialMode = 'dark', initialColorMode = 'colored') {
      currentMode = normalizeMode(initialMode);
      currentColorMode = normalizeColorMode(initialColorMode);
      applyAttributesAndNotify();
    },
    getMode() {
      return currentMode;
    },
    getColorMode() {
      return currentColorMode;
    },
    isColored() {
      return currentColorMode === 'colored';
    },
    setMode(mode) {
      const next = normalizeMode(mode);
      if (
        next === currentMode &&
        document.documentElement.getAttribute('data-theme') === next
      ) {
        return;
      }
      currentMode = next;
      applyAttributesAndNotify();
    },
    setColorMode(colorMode) {
      const next = normalizeColorMode(colorMode);
      if (
        next === currentColorMode &&
        document.documentElement.getAttribute('data-color-mode') === next
      ) {
        return;
      }
      currentColorMode = next;
      applyAttributesAndNotify();
    },
    toggle() {
      const next = currentMode === 'dark' ? 'light' : 'dark';
      this.setMode(next);
      return next;
    },
    toggleColorMode() {
      const next = currentColorMode === 'colored' ? 'monochrome' : 'colored';
      this.setColorMode(next);
      return next;
    },
    getPalette(overrideMode, overrideColorMode) {
      return resolvePalette(overrideMode || currentMode, overrideColorMode || currentColorMode);
    },
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    }
  };
})();
