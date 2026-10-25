(function () {
  const SAVE_KEY = 'exotic_save_state_v1';
  const LOCAL_RUNS_KEY = 'exotic_verified_runs_v1';

  function createDefaultState() {
    return {
      callsign: '',
      coins: 0,
      skillPoints: 0,
      skinPricingMigrated: true,
      ownedItems: [
        'aura_none',
        'char_classic',
        'char_mickey',
        'char_stickman',
        'skin_solid',
        'trail_none',
        'emote_salute'
      ],
      equipped: {
        aura: 'aura_none',
        character: 'char_classic',
        skin: 'skin_solid',
        trail: 'trail_none',
        emote: 'emote_salute'
      },
      unlockedUpgrades: [],
      activeUpgrades: [],
      levelStats: {},
      collectedOrbs: {},
      unlockedAchievements: [],
      telemetry: {
        totalDeaths: 0,
        trapsTriggered: 0,
        partingFloorDeaths: 0,
        shyDoorsTriggered: 0,
        quickRestarts: 0,
        totalCoinsCollected: 0,
        emotesUsedInStage: 0,
        gravityFlipsSurvived: 0,
        deathlessClears: 0
      },
      settings: {
        theme: 'dark',
        muted: false,
        volume: 0.7,
        screenShake: true,
        touchControls: false
      }
    };
  }

  let state = createDefaultState();
  const subscribers = new Set();

  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const def = createDefaultState();
        state = {
          ...def,
          ...parsed,
          equipped: { ...def.equipped, ...(parsed.equipped || {}) },
          telemetry: { ...def.telemetry, ...(parsed.telemetry || {}) },
          settings: { ...def.settings, ...(parsed.settings || {}) },
          levelStats: parsed.levelStats || {},
          collectedOrbs: parsed.collectedOrbs || {}
        };
        if (!parsed.skinPricingMigrated) {
          const formerlyFreeSkins = new Set(['skin_steamboat', 'skin_sketch', 'skin_inverted']);
          state.ownedItems = (state.ownedItems || []).filter((id) => !formerlyFreeSkins.has(id));
          if (!state.ownedItems.includes(state.equipped.skin)) {
            state.equipped.skin = 'skin_solid';
          }
          state.skinPricingMigrated = true;
          save();
        }
      }
    } catch {
      state = createDefaultState();
    }
    return state;
  }

  function save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    } catch {
      // Storage quota or private mode fallback
    }
    subscribers.forEach((fn) => fn(state));
  }

  function getLocalRuns() {
    try {
      const raw = localStorage.getItem(LOCAL_RUNS_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function setLocalRuns(runs) {
    try {
      localStorage.setItem(LOCAL_RUNS_KEY, JSON.stringify(runs));
    } catch {
      // Ignore quota errors
    }
  }

  window.ExoticStorage = {
    init() {
      return load();
    },
    getState() {
      return state;
    },
    subscribe(fn) {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
    updateSettings(patch) {
      state.settings = { ...state.settings, ...patch };
      save();
    },
    setCallsign(name) {
      state.callsign = String(name || '').trim().slice(0, 20);
      save();
    },
    addCoins(amount) {
      const n = Math.max(0, Math.round(Number(amount) || 0));
      if (n <= 0) return;
      state.coins += n;
      save();
    },
    addSkillPoints(amount) {
      const n = Math.max(0, Math.round(Number(amount) || 0));
      if (n <= 0) return;
      state.skillPoints += n;
      save();
    },
    ownsItem(itemId) {
      return state.ownedItems.includes(itemId) || state.unlockedUpgrades.includes(itemId);
    },
    buyShopItem(item) {
      if (!item) return { ok: false, reason: 'Invalid item.' };
      if (item.category === 'upgrades') {
        if (state.unlockedUpgrades.includes(item.id)) {
          return { ok: false, reason: 'Already unlocked.' };
        }
        if (state.skillPoints < item.cost) {
          return { ok: false, reason: 'Not enough Skill Points.' };
        }
        state.skillPoints -= item.cost;
        state.unlockedUpgrades.push(item.id);
        if (!state.activeUpgrades.includes(item.id)) {
          state.activeUpgrades.push(item.id);
        }
        save();
        return { ok: true };
      }

      if (state.ownedItems.includes(item.id)) {
        return { ok: false, reason: 'Already owned.' };
      }
      if (state.coins < item.cost) {
        return { ok: false, reason: 'Not enough Coins.' };
      }
      state.coins -= item.cost;
      state.ownedItems.push(item.id);
      this.equipItem(item);
      save();
      return { ok: true };
    },
    equipItem(item) {
      if (!item) return;
      if (item.category === 'upgrades') {
        const idx = state.activeUpgrades.indexOf(item.id);
        if (idx >= 0) {
          state.activeUpgrades.splice(idx, 1);
        } else if (state.unlockedUpgrades.includes(item.id)) {
          state.activeUpgrades.push(item.id);
        }
        save();
        return;
      }

      const slotMap = {
        auras: 'aura',
        characters: 'character',
        skins: 'skin',
        trails: 'trail',
        emotes: 'emote'
      };
      const slot = slotMap[item.category];
      if (slot && state.ownedItems.includes(item.id)) {
        state.equipped[slot] = item.id;
        save();
      }
    },
    isUpgradeActive(upgId) {
      return state.activeUpgrades.includes(upgId);
    },
    incrementTelemetry(key, delta = 1) {
      if (typeof state.telemetry[key] !== 'number') {
        state.telemetry[key] = 0;
      }
      state.telemetry[key] += delta;
      save();
    },
    markOrbCollected(levelId) {
      if (state.collectedOrbs[levelId]) return false;
      state.collectedOrbs[levelId] = true;
      state.skillPoints += 1;
      save();
      return true;
    },
    hasCollectedOrb(levelId) {
      return Boolean(state.collectedOrbs[levelId]);
    },
    recordLevelClear(level, runStats) {
      const prev = state.levelStats[level.id];
      const firstClear = !prev || !prev.cleared;
      let earnedCoins = runStats.stageCoins + (firstClear ? level.rewardCoins : Math.ceil(level.rewardCoins * 0.35));
      let earnedSP = 0;

      if (firstClear) {
        earnedSP += 2;
      }
      const beatParDeaths = runStats.deaths <= level.parDeaths && (!prev || !prev.parDeathsMet);
      if (beatParDeaths) {
        earnedSP += 1;
      }
      const beatParTime = runStats.timeMs <= level.parTimeMs && (!prev || !prev.parTimeMet);
      if (beatParTime) {
        earnedSP += 1;
      }

      if (runStats.deaths === 0) {
        state.telemetry.deathlessClears += 1;
      }

      state.levelStats[level.id] = {
        cleared: true,
        clears: (prev ? prev.clears : 0) + 1,
        bestTimeMs: prev && prev.bestTimeMs ? Math.min(prev.bestTimeMs, runStats.timeMs) : runStats.timeMs,
        leastDeaths: prev && typeof prev.leastDeaths === 'number' ? Math.min(prev.leastDeaths, runStats.deaths) : runStats.deaths,
        parDeathsMet: Boolean((prev && prev.parDeathsMet) || runStats.deaths <= level.parDeaths),
        parTimeMet: Boolean((prev && prev.parTimeMet) || runStats.timeMs <= level.parTimeMs)
      };

      state.coins += earnedCoins;
      state.skillPoints += earnedSP;
      save();

      return {
        firstClear,
        earnedCoins,
        earnedSP,
        beatParDeaths,
        beatParTime
      };
    },
    unlockAchievement(ach) {
      if (state.unlockedAchievements.includes(ach.id)) return false;
      state.unlockedAchievements.push(ach.id);
      if (ach.rewardCoins) state.coins += ach.rewardCoins;
      if (ach.rewardSP) state.skillPoints += ach.rewardSP;
      save();
      return true;
    },
    async fetchLeaderboard() {
      const localRuns = getLocalRuns();
      try {
        const res = await fetch('/api/leaderboard', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.runs)) {
            setLocalRuns(data.runs);
            return data.runs;
          }
        }
      } catch {
        // Offline / static file fallback uses localRuns
      }
      return localRuns;
    },
    async submitRun(payload) {
      const cleanCallsign = String(payload.callsign || state.callsign || '').trim().slice(0, 20);
      if (!cleanCallsign) {
        return { ok: false, reason: 'Enter your Callsign to publish this run.' };
      }
      state.callsign = cleanCallsign;
      save();

      const entry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        callsign: cleanCallsign,
        levelId: payload.levelId,
        levelTitle: payload.levelTitle,
        timeMs: Math.round(payload.timeMs),
        deaths: Math.round(payload.deaths),
        coins: Math.round(payload.coins || 0),
        characterId: state.equipped.character,
        recordedAt: new Date().toISOString()
      };

      try {
        const res = await fetch('/api/leaderboard', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(entry)
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.runs)) {
            setLocalRuns(data.runs);
            return { ok: true, record: data.record };
          }
        }
      } catch {
        // Fallback to browser localStorage when opened without server
      }

      const local = getLocalRuns();
      local.push(entry);
      setLocalRuns(local);
      return { ok: true, record: entry };
    },
    async resetAllData() {
      const currentTheme = state.settings.theme;
      state = createDefaultState();
      state.settings.theme = currentTheme;
      save();
      setLocalRuns([]);
      try {
        await fetch('/api/leaderboard', { method: 'DELETE' });
      } catch {
        // Ignore network errors
      }
    }
  };
})();
