(function () {
  const SAVE_KEY = 'exotic_save_state_v1';
  const LOCAL_RUNS_KEY = 'exotic_verified_runs_v1';

  function createDefaultState() {
    return {
      callsign: '',
      coins: 0,
      skillPoints: 0,
      skinPricingMigrated: true,
      defaultMonochromeMigrated: true,
      runnerCardUrl: '',
      avatarUrl: '',
      ownedItems: [
        'aura_none',
        'char_classic',
        'char_mickey',
        'char_stickman',
        'skin_solid',
        'trail_none',
        'emote_salute',
        'brawl_map_haven',
        'brawl_map_citadel',
        'weapon_fists'
      ],
      equipped: {
        aura: 'aura_none',
        character: 'char_classic',
        skin: 'skin_solid',
        trail: 'trail_none',
        emote: 'emote_salute',
        brawlMap: 'brawl_map_haven',
        brawlWeapon: 'weapon_fists'
      },
      unlockedUpgrades: [],
      activeUpgrades: [],
      levelStats: {},
      collectedOrbs: {},
      collectedCoins: {},
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
        colorMode: 'monochrome',
        dimensionMode: '2d',
        muted: false,
        volume: 0.7,
        screenShake: true,
        touchControls: false,
        liveGhosts: true,
        liveToasts: true,
        leaderboardShareEnabled: false,
        leaderboardPromptEnabled: false,
        leaderboardNoticeSeen: false
      }
    };
  }

  let state = createDefaultState();
  const subscribers = new Set();
  let syncDebounceTimer = null;
  let lastLocalSettingsMutationAt = 0;

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
          collectedOrbs: parsed.collectedOrbs || {},
          collectedCoins: parsed.collectedCoins || {}
        };
        for (const reqStarter of ['brawl_map_haven', 'brawl_map_citadel', 'weapon_fists']) {
          if (!state.ownedItems.includes(reqStarter)) {
            state.ownedItems.push(reqStarter);
          }
        }
        if (!state.equipped.brawlMap || !state.ownedItems.includes(state.equipped.brawlMap)) {
          state.equipped.brawlMap = 'brawl_map_haven';
        }
        if (!state.equipped.brawlWeapon || !state.ownedItems.includes(state.equipped.brawlWeapon)) {
          state.equipped.brawlWeapon = 'weapon_fists';
        }
        if (!parsed.skinPricingMigrated) {
          const formerlyFreeSkins = new Set(['skin_steamboat', 'skin_sketch', 'skin_inverted']);
          state.ownedItems = (state.ownedItems || []).filter((id) => !formerlyFreeSkins.has(id));
          if (!state.ownedItems.includes(state.equipped.skin)) {
            state.equipped.skin = 'skin_solid';
          }
          state.skinPricingMigrated = true;
          persistLocalOnly();
        }
        if (!parsed.defaultMonochromeMigrated) {
          state.settings.colorMode = 'monochrome';
          state.defaultMonochromeMigrated = true;
          persistLocalOnly();
        }
        if (state.settings.dimensionMode !== '3d') {
          state.settings.dimensionMode = '2d';
        }
      }
    } catch {
      state = createDefaultState();
    }
    return state;
  }

  function persistLocalOnly() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    } catch {
      // Ignore quota errors
    }
  }

  function notifySubscribers() {
    subscribers.forEach((fn) => {
      try {
        fn(state);
      } catch {
        // Ignore subscriber error
      }
    });
  }

  function flushCloudStateSync(authoritative = false) {
    if (!window.ExoticSupabase) return Promise.resolve(null);
    if (window.ExoticAuth && !window.ExoticAuth.isSignedIn()) return Promise.resolve(null);
    if (syncDebounceTimer) {
      clearTimeout(syncDebounceTimer);
      syncDebounceTimer = null;
    }
    window.ExoticSupabase.notifyLocalTabs(state);
    return window.ExoticSupabase.functions
      .invoke('sync-profile', {
        body: {
          state: {
            ...state,
            authoritative
          }
        }
      })
      .catch(() => null);
  }

  function scheduleCloudStateSync(authoritative = false) {
    if (!window.ExoticSupabase) return;
    if (window.ExoticAuth && !window.ExoticAuth.isSignedIn()) return;
    window.ExoticSupabase.notifyLocalTabs(state);

    if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
    syncDebounceTimer = setTimeout(() => {
      syncDebounceTimer = null;
      if (window.ExoticAuth && !window.ExoticAuth.isSignedIn()) return;
      window.ExoticSupabase.functions
        .invoke('sync-profile', {
          body: {
            state: {
              ...state,
              authoritative
            }
          }
        })
        .catch(() => {});
    }, 180);
  }

  function save(syncCloud = true, authoritative = false) {
    persistLocalOnly();
    notifySubscribers();
    if (syncCloud) {
      scheduleCloudStateSync(authoritative);
    }
  }

  function sendTelemetryEvent(event, payload = {}) {
    if (!window.ExoticSupabase) return;
    if (window.ExoticAuth && !window.ExoticAuth.isSignedIn()) return;
    window.ExoticSupabase.functions
      .invoke('telemetry-ingest', {
        body: { event, payload }
      })
      .then(({ data }) => {
        if (data && data.ok) {
          let changed = false;
          if (typeof data.coins === 'number' && data.coins > state.coins) {
            state.coins = data.coins;
            changed = true;
          }
          if (typeof data.skillPoints === 'number' && data.skillPoints > state.skillPoints) {
            state.skillPoints = data.skillPoints;
            changed = true;
          }
          if (changed) {
            persistLocalOnly();
            notifySubscribers();
          }
        }
      })
      .catch(() => {});
  }

  function applySideEffectSettings(nextSettings) {
    if (!nextSettings) return;
    if (window.ExoticTheme) {
      if (nextSettings.theme && window.ExoticTheme.getMode() !== nextSettings.theme) {
        window.ExoticTheme.setMode(nextSettings.theme);
      }
      if (
        nextSettings.colorMode &&
        window.ExoticTheme.getColorMode &&
        window.ExoticTheme.getColorMode() !== nextSettings.colorMode
      ) {
        window.ExoticTheme.setColorMode(nextSettings.colorMode);
      }
      if (
        nextSettings.dimensionMode &&
        window.ExoticTheme.getDimensionMode &&
        window.ExoticTheme.getDimensionMode() !== nextSettings.dimensionMode
      ) {
        window.ExoticTheme.setDimensionMode(nextSettings.dimensionMode);
      }
    }
    if (window.ExoticAudio) {
      if (typeof nextSettings.muted === 'boolean') {
        window.ExoticAudio.setMuted(nextSettings.muted);
      }
      if (typeof nextSettings.volume === 'number') {
        window.ExoticAudio.setVolume(nextSettings.volume);
      }
    }
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

    // Hydrate full cloud snapshot returned by sync-profile / auth RPC without echo loop
    hydrateFromCloudSnapshot(snap, opts = {}) {
      if (!snap || typeof snap !== 'object') return;
      const replace = Boolean(opts.replace);
      const prof = snap.profile || {};
      const sets = snap.settings || {};
      const load = snap.loadout || {};

      const resolvedName =
        (typeof prof.username === 'string' && prof.username) ||
        (typeof prof.callsign === 'string' && prof.callsign) ||
        '';
      if (resolvedName) state.callsign = resolvedName;

      if (typeof prof.coins === 'number') {
        state.coins = replace ? prof.coins : Math.max(state.coins, prof.coins);
      }
      if (typeof prof.skill_points === 'number') {
        state.skillPoints = replace
          ? prof.skill_points
          : Math.max(state.skillPoints, prof.skill_points);
      }
      state.runnerCardUrl = prof.runner_card_path || (replace ? '' : state.runnerCardUrl);
      state.avatarUrl = prof.avatar_storage_path || (replace ? '' : state.avatarUrl);

      if (replace) {
        state.telemetry = {
          totalDeaths: Number(prof.total_deaths || 0),
          trapsTriggered: Number(prof.traps_triggered || 0),
          partingFloorDeaths: Number(prof.parting_floor_deaths || 0),
          shyDoorsTriggered: Number(prof.shy_doors_triggered || 0),
          quickRestarts: Number(prof.quick_restarts || 0),
          totalCoinsCollected: Number(prof.total_coins_collected || 0),
          emotesUsedInStage: Number(prof.emotes_used_in_stage || 0),
          gravityFlipsSurvived: Number(prof.gravity_flips_survived || 0),
          deathlessClears: Number(prof.deathless_clears || 0)
        };
      } else {
        state.telemetry = {
          ...state.telemetry,
          totalDeaths: Math.max(state.telemetry.totalDeaths, Number(prof.total_deaths || 0)),
          trapsTriggered: Math.max(
            state.telemetry.trapsTriggered,
            Number(prof.traps_triggered || 0)
          ),
          partingFloorDeaths: Math.max(
            state.telemetry.partingFloorDeaths,
            Number(prof.parting_floor_deaths || 0)
          ),
          shyDoorsTriggered: Math.max(
            state.telemetry.shyDoorsTriggered,
            Number(prof.shy_doors_triggered || 0)
          ),
          quickRestarts: Math.max(
            state.telemetry.quickRestarts,
            Number(prof.quick_restarts || 0)
          ),
          totalCoinsCollected: Math.max(
            state.telemetry.totalCoinsCollected,
            Number(prof.total_coins_collected || 0)
          ),
          emotesUsedInStage: Math.max(
            state.telemetry.emotesUsedInStage,
            Number(prof.emotes_used_in_stage || 0)
          ),
          gravityFlipsSurvived: Math.max(
            state.telemetry.gravityFlipsSurvived,
            Number(prof.gravity_flips_survived || 0)
          ),
          deathlessClears: Math.max(
            state.telemetry.deathlessClears,
            Number(prof.deathless_clears || 0)
          )
        };
      }

      if (Array.isArray(snap.ownedItems)) {
        const baseStarter = createDefaultState().ownedItems;
        state.ownedItems = replace
          ? Array.from(new Set([...baseStarter, ...snap.ownedItems]))
          : Array.from(new Set([...state.ownedItems, ...snap.ownedItems]));
      }
      if (Array.isArray(snap.unlockedUpgrades)) {
        state.unlockedUpgrades = replace
          ? Array.from(new Set(snap.unlockedUpgrades))
          : Array.from(new Set([...state.unlockedUpgrades, ...snap.unlockedUpgrades]));
      }

      if (load.character_id) state.equipped.character = load.character_id;
      if (load.skin_id) state.equipped.skin = load.skin_id;
      if (load.aura_id) state.equipped.aura = load.aura_id;
      if (load.trail_id) state.equipped.trail = load.trail_id;
      if (load.emote_id) state.equipped.emote = load.emote_id;
      if (load.brawl_map_id) state.equipped.brawlMap = load.brawl_map_id;
      if (load.brawl_weapon_id) state.equipped.brawlWeapon = load.brawl_weapon_id;
      if (Array.isArray(load.active_upgrades)) {
        state.activeUpgrades = load.active_upgrades;
      }

      const recentLocalMutation = !replace && Date.now() - lastLocalSettingsMutationAt < 2500;
      if (!recentLocalMutation) {
        if (sets.theme) state.settings.theme = sets.theme;
        if (sets.color_mode === 'colored' || sets.color_mode === 'monochrome') {
          state.settings.colorMode = sets.color_mode;
        }
        if (sets.dimension_mode === '2d' || sets.dimension_mode === '3d') {
          state.settings.dimensionMode = sets.dimension_mode;
        }
        if (typeof sets.muted === 'boolean') state.settings.muted = sets.muted;
        if (sets.volume != null) state.settings.volume = Number(sets.volume);
        if (typeof sets.screen_shake === 'boolean') state.settings.screenShake = sets.screen_shake;
        if (typeof sets.touch_controls === 'boolean') {
          state.settings.touchControls = sets.touch_controls;
        }
        if (typeof sets.live_ghosts === 'boolean') state.settings.liveGhosts = sets.live_ghosts;
      }

      const isGuestProf =
        Boolean(prof.is_guest) || Boolean(window.ExoticAuth && window.ExoticAuth.isGuest());
      if (isGuestProf) {
        state.settings.leaderboardShareEnabled = false;
        state.settings.leaderboardPromptEnabled = false;
        state.settings.leaderboardNoticeSeen = false;
      } else {
        if (typeof sets.leaderboard_share_enabled === 'boolean') {
          state.settings.leaderboardShareEnabled = sets.leaderboard_share_enabled;
        } else if (replace) {
          state.settings.leaderboardShareEnabled = false;
        }
        if (typeof sets.leaderboard_prompt_enabled === 'boolean') {
          state.settings.leaderboardPromptEnabled = sets.leaderboard_prompt_enabled;
        } else if (replace) {
          state.settings.leaderboardPromptEnabled = false;
        }
        if (typeof sets.leaderboard_notice_seen === 'boolean') {
          state.settings.leaderboardNoticeSeen = sets.leaderboard_notice_seen;
        } else if (replace) {
          state.settings.leaderboardNoticeSeen = false;
        }
      }

      if (Array.isArray(snap.levelProgress)) {
        if (replace) {
          state.levelStats = {};
          state.collectedOrbs = {};
          state.collectedCoins = {};
        }
        for (const lp of snap.levelProgress) {
          const id = Number(lp.level_id);
          if (id >= 1 && id <= 8) {
            state.levelStats[id] = {
              cleared: Boolean(lp.cleared),
              clears: Number(lp.clears || 0),
              bestTimeMs: lp.best_time_ms != null ? Number(lp.best_time_ms) : null,
              leastDeaths: lp.least_deaths != null ? Number(lp.least_deaths) : null,
              parDeathsMet: Boolean(lp.par_deaths_met),
              parTimeMet: Boolean(lp.par_time_met)
            };
            if (lp.orb_collected) {
              state.collectedOrbs[id] = true;
            }
            if (Array.isArray(lp.collected_coins)) {
              const prevCoins = replace ? [] : state.collectedCoins[id] || [];
              state.collectedCoins[id] = Array.from(
                new Set([...prevCoins, ...lp.collected_coins.map(String)])
              );
            }
          }
        }
      }

      if (Array.isArray(snap.unlockedAchievements)) {
        state.unlockedAchievements = replace
          ? Array.from(new Set(snap.unlockedAchievements))
          : Array.from(new Set([...state.unlockedAchievements, ...snap.unlockedAchievements]));
      }

      applySideEffectSettings(state.settings);
      persistLocalOnly();
      notifySubscribers();
    },

    // Apply live row-level Realtime mutations from Supabase Postgres (instant zero-refresh updates!)
    applyRemoteTableRow(table, eventType, rec, oldRec) {
      if (table === 'profiles' && rec) {
        if (typeof rec.callsign === 'string') state.callsign = rec.callsign;
        if (typeof rec.coins === 'number') state.coins = rec.coins;
        if (typeof rec.skill_points === 'number') state.skillPoints = rec.skill_points;
        if (rec.runner_card_path) state.runnerCardUrl = rec.runner_card_path;
        if (rec.avatar_storage_path) state.avatarUrl = rec.avatar_storage_path;
        state.telemetry.totalDeaths = Number(rec.total_deaths ?? state.telemetry.totalDeaths);
        state.telemetry.trapsTriggered = Number(rec.traps_triggered ?? state.telemetry.trapsTriggered);
        state.telemetry.shyDoorsTriggered = Number(
          rec.shy_doors_triggered ?? state.telemetry.shyDoorsTriggered
        );
        state.telemetry.totalCoinsCollected = Number(
          rec.total_coins_collected ?? state.telemetry.totalCoinsCollected
        );
        state.telemetry.emotesUsedInStage = Number(
          rec.emotes_used_in_stage ?? state.telemetry.emotesUsedInStage
        );
        state.telemetry.deathlessClears = Number(
          rec.deathless_clears ?? state.telemetry.deathlessClears
        );
      } else if (table === 'player_settings' && rec) {
        if (Date.now() - lastLocalSettingsMutationAt < 2500) {
          return;
        }
        const isGuestNow = Boolean(window.ExoticAuth && window.ExoticAuth.isGuest());
        state.settings = {
          ...state.settings,
          theme: rec.theme || state.settings.theme,
          colorMode:
            rec.color_mode === 'colored' || rec.color_mode === 'monochrome'
              ? rec.color_mode
              : state.settings.colorMode,
          muted: typeof rec.muted === 'boolean' ? rec.muted : state.settings.muted,
          volume: rec.volume != null ? Number(rec.volume) : state.settings.volume,
          screenShake:
            typeof rec.screen_shake === 'boolean' ? rec.screen_shake : state.settings.screenShake,
          touchControls:
            typeof rec.touch_controls === 'boolean'
              ? rec.touch_controls
              : state.settings.touchControls,
          liveGhosts:
            typeof rec.live_ghosts === 'boolean' ? rec.live_ghosts : state.settings.liveGhosts,
          leaderboardShareEnabled: isGuestNow
            ? false
            : typeof rec.leaderboard_share_enabled === 'boolean'
              ? rec.leaderboard_share_enabled
              : state.settings.leaderboardShareEnabled,
          leaderboardPromptEnabled: isGuestNow
            ? false
            : typeof rec.leaderboard_prompt_enabled === 'boolean'
              ? rec.leaderboard_prompt_enabled
              : state.settings.leaderboardPromptEnabled,
          leaderboardNoticeSeen: isGuestNow
            ? false
            : typeof rec.leaderboard_notice_seen === 'boolean'
              ? rec.leaderboard_notice_seen
              : state.settings.leaderboardNoticeSeen
        };
        applySideEffectSettings(state.settings);
      } else if (table === 'player_loadouts' && rec) {
        state.equipped = {
          aura: rec.aura_id || state.equipped.aura,
          character: rec.character_id || state.equipped.character,
          skin: rec.skin_id || state.equipped.skin,
          trail: rec.trail_id || state.equipped.trail,
          emote: rec.emote_id || state.equipped.emote,
          brawlMap: rec.brawl_map_id || state.equipped.brawlMap || 'brawl_map_haven',
          brawlWeapon: rec.brawl_weapon_id || state.equipped.brawlWeapon || 'weapon_fists'
        };
        if (Array.isArray(rec.active_upgrades)) {
          state.activeUpgrades = rec.active_upgrades;
        }
        window.ExoticBackdrop?.resetMenuTrail();
      } else if (table === 'player_inventory') {
        if (eventType !== 'DELETE' && rec?.item_id) {
          if (rec.category === 'upgrades') {
            if (!state.unlockedUpgrades.includes(rec.item_id)) {
              state.unlockedUpgrades.push(rec.item_id);
            }
          } else if (!state.ownedItems.includes(rec.item_id)) {
            state.ownedItems.push(rec.item_id);
          }
        } else if (eventType === 'DELETE' && oldRec?.item_id) {
          state.ownedItems = state.ownedItems.filter((i) => i !== oldRec.item_id);
          state.unlockedUpgrades = state.unlockedUpgrades.filter((i) => i !== oldRec.item_id);
        }
      } else if (table === 'player_level_progress' && rec) {
        const lid = Number(rec.level_id);
        if (lid >= 1 && lid <= 8) {
          state.levelStats[lid] = {
            cleared: Boolean(rec.cleared),
            clears: Number(rec.clears || 0),
            bestTimeMs: rec.best_time_ms != null ? Number(rec.best_time_ms) : null,
            leastDeaths: rec.least_deaths != null ? Number(rec.least_deaths) : null,
            parDeathsMet: Boolean(rec.par_deaths_met),
            parTimeMet: Boolean(rec.par_time_met)
          };
          if (rec.orb_collected) state.collectedOrbs[lid] = true;
          if (Array.isArray(rec.collected_coins)) {
            const prevCoins = state.collectedCoins[lid] || [];
            state.collectedCoins[lid] = Array.from(
              new Set([...prevCoins, ...rec.collected_coins.map(String)])
            );
          }
        }
      } else if (table === 'player_achievements' && rec?.achievement_id) {
        if (!state.unlockedAchievements.includes(rec.achievement_id)) {
          state.unlockedAchievements.push(rec.achievement_id);
        }
      }

      persistLocalOnly();
      notifySubscribers();
    },

    applyCrossTabState(incoming) {
      if (!incoming || typeof incoming !== 'object') return;
      state = {
        ...state,
        ...incoming,
        equipped: { ...state.equipped, ...(incoming.equipped || {}) },
        telemetry: { ...state.telemetry, ...(incoming.telemetry || {}) },
        settings: { ...state.settings, ...(incoming.settings || {}) }
      };
      applySideEffectSettings(state.settings);
      persistLocalOnly();
      notifySubscribers();
    },

    setCachedLeaderboard(runs) {
      if (Array.isArray(runs)) setLocalRuns(runs);
    },

    updateSettings(patch) {
      const safePatch = { ...(patch || {}) };
      if (window.ExoticAuth && window.ExoticAuth.isGuest()) {
        safePatch.leaderboardShareEnabled = false;
        safePatch.leaderboardPromptEnabled = false;
        safePatch.leaderboardNoticeSeen = false;
      }
      lastLocalSettingsMutationAt = Date.now();
      state.settings = { ...state.settings, ...safePatch };
      const immediateCloudSync =
        'theme' in safePatch ||
        'colorMode' in safePatch ||
        'leaderboardShareEnabled' in safePatch ||
        'leaderboardPromptEnabled' in safePatch ||
        'leaderboardNoticeSeen' in safePatch;
      if (immediateCloudSync) {
        persistLocalOnly();
        notifySubscribers();
        return flushCloudStateSync(false);
      }
      save(true, false);
      return Promise.resolve(null);
    },
    setCallsign(name) {
      state.callsign = String(name || '').trim().slice(0, 20);
      save(true, false);
    },
    addCoins(amount, emitCloud = false) {
      const n = Math.max(0, Math.round(Number(amount) || 0));
      if (n <= 0) return;
      state.coins += n;
      save(!emitCloud, true);
      if (emitCloud) {
        sendTelemetryEvent('coin', { coinValue: n, delta: 1 });
      }
    },
    addSkillPoints(amount) {
      const n = Math.max(0, Math.round(Number(amount) || 0));
      if (n <= 0) return;
      state.skillPoints += n;
      save(true, true);
    },
    ownsItem(itemId) {
      return state.ownedItems.includes(itemId) || state.unlockedUpgrades.includes(itemId);
    },
    buyShopItem(item) {
      if (!item) return { ok: false, reason: 'Invalid item.' };
      if (window.ExoticAuth && !window.ExoticAuth.isGuestAllowedShopItem(item.id)) {
        return { ok: false, reason: 'This item requires a full account.' };
      }
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
      } else {
        if (state.ownedItems.includes(item.id)) {
          return { ok: false, reason: 'Already owned.' };
        }
        if (state.coins < item.cost) {
          return { ok: false, reason: 'Not enough Coins.' };
        }
        state.coins -= item.cost;
        state.ownedItems.push(item.id);
        const slotMap = {
          auras: 'aura',
          characters: 'character',
          skins: 'skin',
          trails: 'trail',
          emotes: 'emote',
          maps: 'brawlMap',
          weapons: 'brawlWeapon'
        };
        const slot = slotMap[item.category];
        if (slot) state.equipped[slot] = item.id;
      }

      persistLocalOnly();
      notifySubscribers();
      window.ExoticSupabase?.notifyLocalTabs(state);

      // Execute atomic server-side Supabase transaction
      window.ExoticSupabase?.functions
        .invoke('shop-transaction', {
          body: { action: 'buy', itemId: item.id }
        })
        .then(({ data }) => {
          if (data?.ok && data.snapshot) {
            this.hydrateFromCloudSnapshot(data.snapshot);
          }
        })
        .catch(() => {});

      return { ok: true };
    },
    equipItem(item) {
      if (!item) return;
      if (window.ExoticAuth && !window.ExoticAuth.isGuestAllowedShopItem(item.id)) {
        return;
      }
      if (item.category === 'upgrades') {
        const idx = state.activeUpgrades.indexOf(item.id);
        if (idx >= 0) {
          state.activeUpgrades.splice(idx, 1);
        } else if (state.unlockedUpgrades.includes(item.id)) {
          state.activeUpgrades.push(item.id);
        }
      } else {
        const slotMap = {
          auras: 'aura',
          characters: 'character',
          skins: 'skin',
          trails: 'trail',
          emotes: 'emote',
          maps: 'brawlMap',
          weapons: 'brawlWeapon'
        };
        const slot = slotMap[item.category];
        if (slot && state.ownedItems.includes(item.id)) {
          state.equipped[slot] = item.id;
        }
      }

      persistLocalOnly();
      notifySubscribers();
      window.ExoticSupabase?.notifyLocalTabs(state);

      window.ExoticSupabase?.functions
        .invoke('shop-transaction', {
          body: { action: 'equip', itemId: item.id }
        })
        .catch(() => {});
    },
    isUpgradeActive(upgId) {
      return state.activeUpgrades.includes(upgId);
    },
    incrementTelemetry(key, delta = 1, meta = {}) {
      if (typeof state.telemetry[key] !== 'number') {
        state.telemetry[key] = 0;
      }
      state.telemetry[key] += delta;
      persistLocalOnly();
      notifySubscribers();
      window.ExoticSupabase?.notifyLocalTabs(state);

      const eventMap = {
        totalDeaths: 'death',
        trapsTriggered: 'trap_triggered',
        shyDoorsTriggered: 'shy_door',
        totalCoinsCollected: 'coin',
        emotesUsedInStage: 'emote',
        gravityFlipsSurvived: 'gravity_flip'
      };
      const cloudEvt = eventMap[key];
      if (cloudEvt) {
        sendTelemetryEvent(cloudEvt, { delta, ...meta });
      }
    },
    isLevelCompleted(levelId) {
      return Boolean(state.levelStats[levelId] && state.levelStats[levelId].cleared);
    },
    getCollectedCoins(levelId) {
      return Array.isArray(state.collectedCoins[levelId]) ? state.collectedCoins[levelId] : [];
    },
    isCoinCollected(levelId, coinId) {
      const cid = String(coinId || '').trim();
      if (!cid) return false;
      return Boolean(
        Array.isArray(state.collectedCoins[levelId]) &&
          state.collectedCoins[levelId].includes(cid)
      );
    },
    collectStageCoin(levelId, coinId) {
      const cid = String(coinId || '').trim();
      if (!cid || this.isCoinCollected(levelId, cid)) {
        return false;
      }
      if (!Array.isArray(state.collectedCoins[levelId])) {
        state.collectedCoins[levelId] = [];
      }
      state.collectedCoins[levelId].push(cid);
      state.coins += 1;
      state.telemetry.totalCoinsCollected = (state.telemetry.totalCoinsCollected || 0) + 1;
      persistLocalOnly();
      notifySubscribers();
      window.ExoticSupabase?.notifyLocalTabs(state);
      sendTelemetryEvent('coin_collected', { levelId, coinId: cid });
      scheduleCloudStateSync(false);
      return true;
    },
    markOrbCollected(levelId) {
      if (state.collectedOrbs[levelId]) {
        return false;
      }
      state.collectedOrbs[levelId] = true;
      state.skillPoints += 1;
      persistLocalOnly();
      notifySubscribers();
      window.ExoticSupabase?.notifyLocalTabs(state);
      sendTelemetryEvent('orb_claimed', { levelId, earnedSP: 1, earnedCoins: 0 });
      scheduleCloudStateSync(false);
      return true;
    },
    hasCollectedOrb(levelId) {
      return Boolean(state.collectedOrbs[levelId]);
    },
    recordLevelClear(level, runStats) {
      const prev = state.levelStats[level.id];
      const alreadyCompleted = Boolean(prev && prev.cleared);
      const firstClear = !alreadyCompleted;

      // Completed replayed levels earn 0 Coins and 0 Skill Points
      const earnedCoins = firstClear ? (level.rewardCoins ?? 15) : 0;
      const earnedSP = firstClear ? (level.rewardSP ?? 1) : 0;

      const beatParDeaths = runStats.deaths <= level.parDeaths && (!prev || !prev.parDeathsMet);
      const beatParTime = runStats.timeMs <= level.parTimeMs && (!prev || !prev.parTimeMet);

      if (runStats.deaths === 0) {
        state.telemetry.deathlessClears += 1;
      }

      const parDeathsMet = Boolean((prev && prev.parDeathsMet) || runStats.deaths <= level.parDeaths);
      const parTimeMet = Boolean((prev && prev.parTimeMet) || runStats.timeMs <= level.parTimeMs);

      state.levelStats[level.id] = {
        cleared: true,
        clears: (prev ? prev.clears : 0) + 1,
        bestTimeMs:
          prev && prev.bestTimeMs ? Math.min(prev.bestTimeMs, runStats.timeMs) : runStats.timeMs,
        leastDeaths:
          prev && typeof prev.leastDeaths === 'number'
            ? Math.min(prev.leastDeaths, runStats.deaths)
            : runStats.deaths,
        parDeathsMet,
        parTimeMet
      };

      if (earnedCoins > 0) state.coins += earnedCoins;
      if (earnedSP > 0) state.skillPoints += earnedSP;
      persistLocalOnly();
      notifySubscribers();
      window.ExoticSupabase?.notifyLocalTabs(state);

      sendTelemetryEvent('stage_clear', {
        levelId: level.id,
        timeMs: runStats.timeMs,
        deaths: runStats.deaths,
        earnedCoins,
        earnedSP,
        firstClear,
        parDeathsMet,
        parTimeMet
      });

      return {
        firstClear,
        alreadyCompleted,
        earnedCoins,
        earnedSP,
        beatParDeaths,
        beatParTime
      };
    },
    unlockAchievement(ach) {
      if (window.ExoticAuth && window.ExoticAuth.isGuest()) return false;
      if (state.unlockedAchievements.includes(ach.id)) return false;
      state.unlockedAchievements.push(ach.id);
      if (ach.rewardCoins) state.coins += ach.rewardCoins;
      if (ach.rewardSP) state.skillPoints += ach.rewardSP;
      persistLocalOnly();
      notifySubscribers();
      window.ExoticSupabase?.notifyLocalTabs(state);
      sendTelemetryEvent('achievement_unlocked', { achievementId: ach.id });
      return true;
    },
    async fetchLeaderboard() {
      const rtStore = window.ExoticRealtime?.getStore();
      if (rtStore && Array.isArray(rtStore.leaderboardRuns) && rtStore.leaderboardRuns.length > 0) {
        return rtStore.leaderboardRuns;
      }
      const localRuns = getLocalRuns();
      try {
        const res = await fetch('/api/leaderboard', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.runs)) {
            setLocalRuns(data.runs);
            if (rtStore) rtStore.leaderboardRuns = data.runs;
            return data.runs;
          }
        }
      } catch {
        // Offline fallback
      }
      return localRuns;
    },
    async submitRun(payload) {
      if (window.ExoticAuth && window.ExoticAuth.isGuest()) {
        return {
          ok: false,
          code: 'GUEST_LEADERBOARD_DISABLED',
          reason: 'Leaderboards are disabled for Guest accounts.'
        };
      }
      if (window.ExoticAuth && !window.ExoticAuth.isSignedIn()) {
        return {
          ok: false,
          code: 'AUTH_REQUIRED',
          reason: 'Sign in with a full account to share runs publicly.'
        };
      }
      if (state.settings.leaderboardShareEnabled !== true) {
        return {
          ok: false,
          code: 'LEADERBOARD_SHARE_DISABLED',
          reason: 'Leaderboards Share is disabled in Settings.'
        };
      }
      if (!payload || payload.publicShareConfirmed !== true) {
        return {
          ok: false,
          code: 'SHARE_CONSENT_REQUIRED',
          reason: 'Public leaderboard sharing requires your confirmation.'
        };
      }

      const cleanCallsign = String(payload.callsign || state.callsign || '').trim().slice(0, 20);
      if (!cleanCallsign) {
        return { ok: false, reason: 'Enter your Callsign to publish this run.' };
      }
      state.callsign = cleanCallsign;
      save(true, false);

      const reqBody = {
        callsign: cleanCallsign,
        levelId: payload.levelId,
        levelTitle: payload.levelTitle,
        timeMs: Math.round(payload.timeMs),
        deaths: Math.round(payload.deaths),
        coins: Math.round(payload.coins || 0),
        characterId: state.equipped.character,
        skinId: state.equipped.skin,
        auraId: state.equipped.aura,
        trailId: state.equipped.trail,
        sampleIntervalMs: payload.sampleIntervalMs || 80,
        frames: Array.isArray(payload.frames) ? payload.frames : [],
        publicShareConfirmed: true
      };

      if (window.ExoticSupabase) {
        // Ensure latest Settings (e.g. leaderboardShareEnabled) are persisted before server check
        await flushCloudStateSync(false);
        const { data, error } = await window.ExoticSupabase.functions.invoke(
          'verify-and-submit-run',
          { body: reqBody }
        );
        if (!error && data?.ok) {
          if (Array.isArray(data.runs)) {
            setLocalRuns(data.runs);
            const rtStore = window.ExoticRealtime?.getStore();
            if (rtStore) rtStore.leaderboardRuns = data.runs;
          }
          return { ok: true, record: data.record };
        }
        return {
          ok: false,
          code: data?.code || 'VERIFY_FAILED',
          reason: data?.reason || error?.message || 'Run was not stored.'
        };
      }

      return { ok: false, reason: 'Leaderboard service unavailable. Run was not stored.' };
    },
    async uploadRunnerCard(pngDataUrl) {
      if (!window.ExoticSupabase) return { ok: false, error: 'Cloud client not loaded.' };
      const { data, error } = await window.ExoticSupabase.storage
        .from('runner-cards')
        .upload(pngDataUrl);
      if (error || !data?.ok) {
        return { ok: false, error: error?.message || data?.error || 'Upload failed.' };
      }
      state.runnerCardUrl = data.publicUrl;
      persistLocalOnly();
      notifySubscribers();
      return { ok: true, publicUrl: data.publicUrl };
    },
    resetLocalOnly() {
      const currentTheme = state.settings.theme;
      const currentColorMode = state.settings.colorMode || 'monochrome';
      state = createDefaultState();
      state.settings.theme = currentTheme;
      state.settings.colorMode = currentColorMode;
      persistLocalOnly();
      notifySubscribers();
    },
    async resetAllData() {
      const currentTheme = state.settings.theme;
      const currentColorMode = state.settings.colorMode || 'monochrome';
      const keepNoticeSeen = Boolean(state.settings.leaderboardNoticeSeen);
      const keepUsername =
        (window.ExoticAuth && window.ExoticAuth.getUsername()) || state.callsign || '';
      state = createDefaultState();
      state.settings.theme = currentTheme;
      state.settings.colorMode = currentColorMode;
      state.settings.leaderboardNoticeSeen = keepNoticeSeen;
      state.callsign = keepUsername;
      persistLocalOnly();
      setLocalRuns([]);
      notifySubscribers();
      window.ExoticSupabase?.notifyLocalTabs(state);

      if (window.ExoticSupabase && (!window.ExoticAuth || window.ExoticAuth.isSignedIn())) {
        await window.ExoticSupabase.functions
          .invoke('telemetry-ingest', {
            body: { event: 'reset_runner', payload: {} }
          })
          .catch(() => {});
      }
    }
  };
})();
