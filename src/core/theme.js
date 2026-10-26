(function () {
  const PALETTES = {
    // Exact original Monochrome Dark palette preserved 1:1
    dark_monochrome: {
      mode: 'dark',
      colorMode: 'monochrome',
      colored: false,
      sky: '#0c0c0c',
      stageBg: '#0e0e0e',
      bgPillar: '#141414',
      bgPillarAlt: '#181818',
      bgMote: '#2b2b2b',
      platform: '#e6e6e6',
      platformCap: '#ffffff',
      platformDetail: '#b0b0b0',
      platformShadow: '#1a1a1a',
      trapHint: '#8f8f8f',
      hazard: '#ffffff',
      hazardInner: '#595959',
      springBase: '#bdbdbd',
      springTop: '#ffffff',
      coinOuter: '#ffffff',
      coinInner: '#0e0e0e',
      skillOuter: '#ffffff',
      skillInner: '#6e6e6e',
      doorFrame: '#ffffff',
      doorVoid: '#1c1c1c',
      doorCore: '#9e9e9e',
      playerPrimary: '#ffffff',
      playerSecondary: '#0e0e0e',
      playerMid: '#8a8a8a',
      auraBright: '#ffffff',
      auraSoft: '#bdbdbd',
      auraDim: '#5c5c5c',
      gravityZone: 'rgba(255, 255, 255, 0.06)',
      text: '#fafafa',
      textMuted: '#787878'
    },
    // Exact original Monochrome Light palette preserved 1:1
    light_monochrome: {
      mode: 'light',
      colorMode: 'monochrome',
      colored: false,
      sky: '#f4f4f4',
      stageBg: '#ededed',
      bgPillar: '#e3e3e3',
      bgPillarAlt: '#dcdcdc',
      bgMote: '#c8c8c8',
      platform: '#1a1a1a',
      platformCap: '#050505',
      platformDetail: '#4d4d4d',
      platformShadow: '#dadada',
      trapHint: '#757575',
      hazard: '#0a0a0a',
      hazardInner: '#9e9e9e',
      springBase: '#424242',
      springTop: '#0a0a0a',
      coinOuter: '#0a0a0a',
      coinInner: '#f4f4f4',
      skillOuter: '#0a0a0a',
      skillInner: '#8a8a8a',
      doorFrame: '#0a0a0a',
      doorVoid: '#dbdbdb',
      doorCore: '#5c5c5c',
      playerPrimary: '#0a0a0a',
      playerSecondary: '#f5f5f5',
      playerMid: '#737373',
      auraBright: '#0a0a0a',
      auraSoft: '#424242',
      auraDim: '#9e9e9e',
      gravityZone: 'rgba(0, 0, 0, 0.05)',
      text: '#0a0a0a',
      textMuted: '#707070'
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
  let currentColorMode = 'monochrome';
  let currentDimensionMode = '2d';
  const listeners = new Set();

  function normalizeMode(mode) {
    return mode === 'light' ? 'light' : 'dark';
  }

  function normalizeColorMode(colorMode) {
    return colorMode === 'colored' ? 'colored' : 'monochrome';
  }

  function normalizeDimensionMode(dim) {
    return dim === '3d' ? '3d' : '2d';
  }

  function syncTabFavicon(mode, colorMode) {
    if (typeof document === 'undefined') return;
    const isLight = mode === 'light';
    let bg = isLight ? '#0a0a0a' : '#fafafa';
    let fg = isLight ? '#fafafa' : '#0a0a0a';
    if (colorMode === 'colored') {
      bg = isLight ? '#4f46e5' : '#6366f1';
      fg = '#ffffff';
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect x="0" y="0" width="64" height="64" rx="20" ry="20" fill="${bg}"/><g transform="translate(13.2 13.2) scale(1.5667)"><path fill="${fg}" fill-rule="evenodd" clip-rule="evenodd" d="M4 3h16l-3 5H9v2.5h7l-2.2 3.5H9v2.5h8l3 4.5H4V3zm13.5 7.5L21 12l-3.5 1.5L16 17l-1.5-3.5L11 12l3.5-1.5L16 7l1.5 3.5z"/></g></svg>`;
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

  function resolvePalette(mode, colorMode, dimMode) {
    const m = normalizeMode(mode || currentMode);
    const c = normalizeColorMode(colorMode || currentColorMode);
    const d = normalizeDimensionMode(dimMode || currentDimensionMode);
    const base = PALETTES[`${m}_${c}`] || PALETTES.dark_monochrome;
    return {
      ...base,
      dimensionMode: d,
      is3D: d === '3d'
    };
  }

  function applyAttributesAndNotify(notify = true) {
    document.documentElement.setAttribute('data-theme', currentMode);
    document.documentElement.setAttribute('data-color-mode', currentColorMode);
    document.documentElement.setAttribute('data-dimension', currentDimensionMode);
    syncTabFavicon(currentMode, currentColorMode);
    try {
      localStorage.setItem('exotic_theme_luminance', currentMode);
      localStorage.setItem('exotic_theme_color_mode', currentColorMode);
      localStorage.setItem('exotic_theme_dimension_mode', currentDimensionMode);
    } catch {
      // Ignore storage write error
    }
    if (notify) {
      const pal = resolvePalette(currentMode, currentColorMode, currentDimensionMode);
      listeners.forEach((fn) => {
        try {
          fn(currentMode, pal, currentColorMode, currentDimensionMode);
        } catch {
          // Ignore listener error
        }
      });
    }
  }

  window.ExoticTheme = {
    init(initialMode = 'dark', initialColorMode = 'monochrome', initialDimensionMode = '2d') {
      currentMode = normalizeMode(initialMode);
      currentColorMode = normalizeColorMode(initialColorMode);
      currentDimensionMode = normalizeDimensionMode(initialDimensionMode);
      applyAttributesAndNotify(false);
    },
    getMode() {
      return currentMode;
    },
    getColorMode() {
      return currentColorMode;
    },
    getDimensionMode() {
      return currentDimensionMode;
    },
    isColored() {
      return currentColorMode === 'colored';
    },
    is3D() {
      return currentDimensionMode === '3d';
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
      applyAttributesAndNotify(true);
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
      applyAttributesAndNotify(true);
    },
    setDimensionMode(dimMode) {
      const next = normalizeDimensionMode(dimMode);
      if (
        next === currentDimensionMode &&
        document.documentElement.getAttribute('data-dimension') === next
      ) {
        return;
      }
      currentDimensionMode = next;
      applyAttributesAndNotify(true);
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
    toggleDimensionMode() {
      const next = currentDimensionMode === '3d' ? '2d' : '3d';
      this.setDimensionMode(next);
      return next;
    },
    getPalette(overrideMode, overrideColorMode, overrideDimensionMode) {
      return resolvePalette(
        overrideMode || currentMode,
        overrideColorMode || currentColorMode,
        overrideDimensionMode || currentDimensionMode
      );
    },
    onChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    }
  };
})();
