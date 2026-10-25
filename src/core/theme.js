(function () {
  const PALETTES = {
    dark: {
      mode: 'dark',
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
    light: {
      mode: 'light',
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
    }
  };

  let currentMode = 'dark';
  const listeners = new Set();

  function applyTheme(mode, notify = true) {
    currentMode = mode === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', currentMode);
    if (notify) {
      listeners.forEach((fn) => fn(currentMode, PALETTES[currentMode]));
    }
  }

  window.ExoticTheme = {
    init(initialMode) {
      applyTheme(initialMode || 'dark', false);
    },
    getMode() {
      return currentMode;
    },
    getPalette(overrideMode) {
      return PALETTES[overrideMode || currentMode] || PALETTES.dark;
    },
    setMode(mode) {
      applyTheme(mode, true);
    },
    toggle() {
      const next = currentMode === 'dark' ? 'light' : 'dark';
      applyTheme(next, true);
      return next;
    },
    onChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    }
  };
})();
