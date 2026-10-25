(function () {
  // Complete Reactive Cloud Store across all 14 Supabase tables
  const store = {
    status: {
      connected: false,
      transport: 'Syncing',
      latencyMs: 0,
      projectRef: 'wwcjifbwqdedgvrmadly',
      eventsCount: 0
    },
    profileId: null,
    globalTelemetry: {
      total_players: 0,
      online_runners: 1,
      total_deaths: 0,
      total_traps_triggered: 0,
      total_shy_doors: 0,
      total_clears: 0,
      total_deathless_clears: 0,
      total_coins_collected: 0,
      total_coins_spent: 0,
      total_sp_earned: 0,
      total_sp_spent: 0,
      total_emotes_used: 0,
      total_runs_published: 0,
      last_event_summary: 'Exotic Ready'
    },
    shopMetaById: {},
    levelMetaById: {},
    achievementMetaById: {},
    leaderboardRuns: [],
    activityFeed: [],
    presenceBySession: new Map(),
    livePeersBySession: new Map(),
    stageReplayByLevel: new Map(),
    latestStorageAssets: []
  };

  // Hook Subscriber Registries
  const tableHooks = new Map(); // tableName -> Set<{ event, fn }>
  const telemetryHooks = new Set();
  const catalogHooks = new Set();
  const leaderboardHooks = new Set();
  const presenceHooks = new Set();
  const feedHooks = new Set();
  const statusHooks = new Set();
  const storageHooks = new Set();

  let presenceTimer = null;
  let lastStageBroadcastAt = 0;

  function notifySet(set, arg) {
    set.forEach((fn) => {
      try {
        fn(arg);
      } catch {
        // Ignore subscriber error
      }
    });
  }

  function mapDbRun(r) {
    return {
      id: r.id,
      profileId: r.profile_id ?? r.profileId ?? null,
      clientKey: r.client_key ?? r.clientKey ?? null,
      callsign: r.callsign || 'Runner',
      levelId: Number(r.level_id ?? r.levelId ?? 1),
      levelTitle: r.level_title ?? r.levelTitle ?? '',
      timeMs: Number(r.time_ms ?? r.timeMs ?? 0),
      deaths: Number(r.deaths ?? 0),
      coins: Number(r.coins ?? 0),
      characterId: r.character_id ?? r.characterId ?? 'char_classic',
      skinId: r.skin_id ?? r.skinId ?? 'skin_solid',
      auraId: r.aura_id ?? r.auraId ?? 'aura_none',
      trailId: r.trail_id ?? r.trailId ?? 'trail_none',
      isDeathless: Boolean(r.is_deathless ?? r.isDeathless ?? Number(r.deaths) === 0),
      replayStoragePath: r.replay_storage_path ?? r.replayStoragePath ?? null,
      runnerCardPath: r.runner_card_path ?? r.runnerCardPath ?? null,
      recordedAt: r.recorded_at ?? r.recordedAt ?? new Date().toISOString()
    };
  }

  // Apply live catalog mutations directly into in-memory ExoticShopData / ExoticLevels / ExoticAchievements
  function applyShopCatalogRow(row) {
    if (!row || !row.id) return;
    store.shopMetaById[row.id] = {
      ...store.shopMetaById[row.id],
      ...row
    };
    if (window.ExoticShopData && Array.isArray(window.ExoticShopData.ITEMS)) {
      const target = window.ExoticShopData.ITEMS.find((i) => i.id === row.id);
      if (target) {
        if (typeof row.name === 'string') target.name = row.name;
        if (typeof row.tier === 'string') target.tier = row.tier;
        if (typeof row.cost === 'number') target.cost = row.cost;
        if (typeof row.description === 'string') target.desc = row.description;
        target.totalUnlocks = Number(row.total_unlocks || 0);
        target.totalEquips = Number(row.total_equips || 0);
      }
    }
  }

  function applyLevelCatalogRow(row) {
    if (!row || !row.id) return;
    const id = Number(row.id);
    store.levelMetaById[id] = {
      ...store.levelMetaById[id],
      ...row
    };
    if (window.ExoticLevels && Array.isArray(window.ExoticLevels.LEVELS)) {
      const target = window.ExoticLevels.LEVELS.find((l) => l.id === id);
      if (target) {
        if (typeof row.title === 'string') target.title = row.title;
        if (typeof row.subtitle === 'string') target.subtitle = row.subtitle;
        if (typeof row.par_deaths === 'number') target.parDeaths = row.par_deaths;
        if (typeof row.par_time_ms === 'number') target.parTimeMs = row.par_time_ms;
        if (typeof row.reward_coins === 'number') target.rewardCoins = row.reward_coins;
        if (typeof row.reward_sp === 'number') target.rewardSP = row.reward_sp;
        target.globalAttempts = Number(row.global_attempts || 0);
        target.globalClears = Number(row.global_clears || 0);
        target.globalDeaths = Number(row.global_deaths || 0);
        target.globalOrbsFound = Number(row.global_orbs_found || 0);
        target.worldRecordTimeMs = row.world_record_time_ms != null ? Number(row.world_record_time_ms) : null;
        target.worldRecordCallsign = row.world_record_callsign || null;
        target.worldRecordDeaths = row.world_record_deaths != null ? Number(row.world_record_deaths) : null;
      }
    }
  }

  function applyAchievementCatalogRow(row) {
    if (!row || !row.id) return;
    store.achievementMetaById[row.id] = {
      ...store.achievementMetaById[row.id],
      ...row
    };
    if (window.ExoticAchievements && Array.isArray(window.ExoticAchievements.ACHIEVEMENTS)) {
      const target = window.ExoticAchievements.ACHIEVEMENTS.find((a) => a.id === row.id);
      if (target) {
        if (typeof row.title === 'string') target.title = row.title;
        if (typeof row.description === 'string') target.desc = row.description;
        if (typeof row.reward_coins === 'number') target.rewardCoins = row.reward_coins;
        if (typeof row.reward_sp === 'number') target.rewardSP = row.reward_sp;
        target.globalUnlocks = Number(row.global_unlocks || 0);
      }
    }
  }

  function handlePostgresChange(evt) {
    store.status.eventsCount += 1;
    notifySet(statusHooks, getStatus());

    const { table, eventType } = evt;
    const rec = evt.new || null;
    const oldRec = evt.old || null;
    const myClientKey = window.ExoticSupabase.getClientKey();

    // 1. Global Telemetry
    if (table === 'global_telemetry' && rec) {
      store.globalTelemetry = { ...store.globalTelemetry, ...rec };
      notifySet(telemetryHooks, store.globalTelemetry);
    }

    // 2. Catalog Tables (Shop, Levels, Achievements)
    else if (table === 'shop_items' && rec) {
      applyShopCatalogRow(rec);
      notifySet(catalogHooks, { table, record: rec });
    } else if (table === 'levels_catalog' && rec) {
      applyLevelCatalogRow(rec);
      notifySet(catalogHooks, { table, record: rec });
    } else if (table === 'achievements_catalog' && rec) {
      applyAchievementCatalogRow(rec);
      notifySet(catalogHooks, { table, record: rec });
    }

    // 3. Leaderboard Runs (Instant Live Re-Ranking!)
    else if (table === 'leaderboard_runs') {
      if (eventType === 'INSERT' && rec) {
        const mapped = mapDbRun(rec);
        const existsIdx = store.leaderboardRuns.findIndex((r) => r.id === mapped.id);
        if (existsIdx >= 0) store.leaderboardRuns[existsIdx] = mapped;
        else store.leaderboardRuns.push(mapped);
      } else if (eventType === 'UPDATE' && rec) {
        const mapped = mapDbRun(rec);
        const idx = store.leaderboardRuns.findIndex((r) => r.id === mapped.id);
        if (idx >= 0) store.leaderboardRuns[idx] = mapped;
        else store.leaderboardRuns.push(mapped);
      } else if (eventType === 'DELETE' && oldRec) {
        store.leaderboardRuns = store.leaderboardRuns.filter((r) => r.id !== oldRec.id);
      }
      if (window.ExoticStorage && window.ExoticStorage.setCachedLeaderboard) {
        window.ExoticStorage.setCachedLeaderboard(store.leaderboardRuns);
      }
      notifySet(leaderboardHooks, store.leaderboardRuns);
    }

    // 4. Ghost Replays
    else if (table === 'run_replays' && rec) {
      const lvlId = Number(rec.level_id);
      if (lvlId >= 1 && lvlId <= 8) {
        const cur = store.stageReplayByLevel.get(lvlId);
        if (!cur || Number(rec.time_ms) <= Number(cur.timeMs)) {
          fetchStageReplay(lvlId);
        }
      }
    }

    // 5. Live Presence Sessions
    else if (table === 'live_presence_sessions') {
      if ((eventType === 'INSERT' || eventType === 'UPDATE') && rec) {
        if (rec.is_online === false) {
          store.presenceBySession.delete(rec.session_id);
        } else {
          store.presenceBySession.set(rec.session_id, rec);
        }
      } else if (eventType === 'DELETE' && oldRec?.session_id) {
        store.presenceBySession.delete(oldRec.session_id);
      }
      notifySet(presenceHooks, getActivePresence());
    }

    // 6. Live Realtime Activity Feed
    else if (table === 'realtime_activity_feed' && eventType === 'INSERT' && rec) {
      if (!store.activityFeed.some((f) => f.id === rec.id)) {
        store.activityFeed.unshift(rec);
        if (store.activityFeed.length > 30) store.activityFeed.length = 30;
        notifySet(feedHooks, { latest: rec, items: store.activityFeed });
      }
    }

    // 7. Current Runner's Own Profile / Settings / Loadout / Inventory / Progress / Achievements
    else if (table === 'profiles' && rec && rec.client_key === myClientKey) {
      store.profileId = rec.id;
      window.ExoticStorage?.applyRemoteTableRow('profiles', eventType, rec, oldRec);
    } else if (
      [
        'player_settings',
        'player_loadouts',
        'player_inventory',
        'player_level_progress',
        'player_achievements'
      ].includes(table)
    ) {
      const targetProfId = rec?.profile_id || oldRec?.profile_id;
      if (store.profileId && targetProfId === store.profileId) {
        window.ExoticStorage?.applyRemoteTableRow(table, eventType, rec, oldRec);
      }
    }

    // Fire generic useTable(...) hooks
    for (const key of [table, '*']) {
      const bucket = tableHooks.get(key);
      if (!bucket) continue;
      bucket.forEach((entry) => {
        if (entry.event === '*' || entry.event === eventType) {
          try {
            entry.fn(evt);
          } catch {
            // Ignore hook error
          }
        }
      });
    }
  }

  function handleBroadcast(msg) {
    if (!msg) return;
    if (msg.channel === 'exotic:stage' && msg.event === 'runner_frame' && msg.payload) {
      const p = msg.payload;
      if (p.sessionId === window.ExoticSupabase.getSessionId()) return;
      const prev = store.livePeersBySession.get(p.sessionId);
      store.livePeersBySession.set(p.sessionId, {
        ...prev,
        ...p,
        renderX: prev ? prev.renderX : p.x,
        renderY: prev ? prev.renderY : p.y,
        updatedAt: performance.now()
      });
      notifySet(presenceHooks, getActivePresence());
    } else if (msg.channel === 'exotic:local' && msg.event === 'profile_patch' && msg.payload) {
      window.ExoticStorage?.applyCrossTabState(msg.payload);
    }
  }

  function getActivePresence() {
    const nowMs = Date.now();
    const list = [];
    for (const [sid, row] of store.presenceBySession.entries()) {
      const hb = row.heartbeat_at ? new Date(row.heartbeat_at).getTime() : nowMs;
      if (nowMs - hb <= 55000) {
        list.push(row);
      } else {
        store.presenceBySession.delete(sid);
      }
    }
    return list;
  }

  function getLivePeersForLevel(levelId) {
    const nowPerf = performance.now();
    const mySid = window.ExoticSupabase.getSessionId();
    const peers = [];

    for (const [sid, peer] of store.livePeersBySession.entries()) {
      if (sid === mySid) continue;
      if (nowPerf - peer.updatedAt > 6000) {
        store.livePeersBySession.delete(sid);
        continue;
      }
      if (Number(peer.levelId) === Number(levelId)) {
        peers.push(peer);
      }
    }

    // Also include DB presence sessions on the same stage if not in high-freq stream yet
    for (const row of getActivePresence()) {
      if (row.session_id === mySid) continue;
      if (Number(row.current_level_id) === Number(levelId) && row.player_x != null) {
        if (!peers.some((p) => p.sessionId === row.session_id)) {
          peers.push({
            sessionId: row.session_id,
            callsign: row.callsign || 'Runner',
            levelId: Number(row.current_level_id),
            x: Number(row.player_x),
            y: Number(row.player_y),
            renderX: Number(row.player_x),
            renderY: Number(row.player_y),
            vx: Number(row.vx || 0),
            vy: Number(row.vy || 0),
            facing: Number(row.facing || 1),
            gravitySign: Number(row.gravity_sign || 1),
            characterId: row.character_id || 'char_classic',
            skinId: row.skin_id || 'skin_solid',
            auraId: row.aura_id || 'aura_none',
            emoteId: row.emote_id || null,
            updatedAt: nowPerf
          });
        }
      }
    }
    return peers;
  }

  async function fetchStageReplay(levelId) {
    try {
      const res = await fetch(`/api/replays?levelId=${encodeURIComponent(levelId)}`, {
        cache: 'no-store'
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (data?.replay && Array.isArray(data.replay.frames) && data.replay.frames.length > 1) {
        store.stageReplayByLevel.set(Number(levelId), data.replay);
        return data.replay;
      }
    } catch {
      // Ignore offline error
    }
    return null;
  }

  async function bootstrapFromCloud() {
    const signedIn = window.ExoticAuth ? window.ExoticAuth.isSignedIn() : false;
    const localState = signedIn && window.ExoticStorage ? window.ExoticStorage.getState() : null;
    const { data, error } = await window.ExoticSupabase.functions.invoke('sync-profile', {
      body: { state: localState }
    });
    if (error || !data || !data.ok) return null;

    if (data.authSession && window.ExoticAuth && !window.ExoticAuth.isInitialized()) {
      window.ExoticAuth.applySessionPayload(data.authSession, { cleanReplace: true });
    } else if (data.snapshot && (!window.ExoticAuth || window.ExoticAuth.isSignedIn())) {
      store.profileId = data.snapshot.profile?.id || store.profileId;
      window.ExoticStorage?.hydrateFromCloudSnapshot(data.snapshot);
    }

    if (data.globalTelemetry) {
      store.globalTelemetry = { ...store.globalTelemetry, ...data.globalTelemetry };
    }

    if (Array.isArray(data.shopCatalog)) {
      data.shopCatalog.forEach(applyShopCatalogRow);
    }
    if (Array.isArray(data.levelsCatalog)) {
      data.levelsCatalog.forEach(applyLevelCatalogRow);
    }
    if (Array.isArray(data.achievementsCatalog)) {
      data.achievementsCatalog.forEach(applyAchievementCatalogRow);
    }
    if (Array.isArray(data.leaderboardRuns)) {
      store.leaderboardRuns = data.leaderboardRuns.map(mapDbRun);
      window.ExoticStorage?.setCachedLeaderboard(store.leaderboardRuns);
    }
    if (Array.isArray(data.activityFeed)) {
      store.activityFeed = data.activityFeed;
    }
    if (Array.isArray(data.presence)) {
      store.presenceBySession.clear();
      for (const p of data.presence) {
        store.presenceBySession.set(p.session_id, p);
      }
    }

    notifySet(telemetryHooks, store.globalTelemetry);
    notifySet(catalogHooks, { table: 'all', record: null });
    notifySet(leaderboardHooks, store.leaderboardRuns);
    notifySet(presenceHooks, getActivePresence());
    if (store.activityFeed.length > 0) {
      notifySet(feedHooks, { latest: null, items: store.activityFeed });
    }

    return data;
  }

  function sendPresenceHeartbeat(extra = {}) {
    if (window.ExoticAuth && !window.ExoticAuth.isSignedIn()) return;
    const st = window.ExoticStorage ? window.ExoticStorage.getState() : null;
    const route = window.ExoticRouter ? window.ExoticRouter.getCurrent() : 'menu';
    const eq = st ? st.equipped : {};

    window.ExoticSupabase.functions
      .invoke('telemetry-ingest', {
        body: {
          kind: 'presence',
          payload: {
            callsign: st?.callsign || '',
            route,
            characterId: eq.character || 'char_classic',
            skinId: eq.skin || 'skin_solid',
            auraId: eq.aura || 'aura_none',
            isOnline: true,
            ...extra
          }
        }
      })
      .then(({ data }) => {
        if (data && typeof data.onlineRunners === 'number') {
          store.globalTelemetry.online_runners = data.onlineRunners;
          notifySet(telemetryHooks, store.globalTelemetry);
        }
      })
      .catch(() => {});
  }

  function getStatus() {
    return {
      ...store.status,
      onlineRunners: Math.max(
        1,
        Number(store.globalTelemetry.online_runners || 0),
        getActivePresence().length
      )
    };
  }

  async function init() {
    window.ExoticSupabase.onStatusChange((st) => {
      store.status = {
        ...store.status,
        ...st
      };
      notifySet(statusHooks, getStatus());
    });

    window.ExoticSupabase.onPostgresChange(handlePostgresChange);
    window.ExoticSupabase.onBroadcast(handleBroadcast);
    window.ExoticSupabase.onStorageChange((evt) => {
      store.latestStorageAssets.unshift(evt);
      if (store.latestStorageAssets.length > 20) store.latestStorageAssets.length = 20;
      notifySet(storageHooks, evt);
    });

    await window.ExoticSupabase.init();
    await bootstrapFromCloud();
    sendPresenceHeartbeat();

    if (presenceTimer) clearInterval(presenceTimer);
    presenceTimer = setInterval(() => {
      sendPresenceHeartbeat();
    }, 15000);

    if (window.ExoticRouter && window.ExoticRouter.onNavigate) {
      window.ExoticRouter.onNavigate((route, opts) => {
        sendPresenceHeartbeat({
          route,
          levelId: route === 'play' ? opts?.levelId || null : null
        });
      });
    }
  }

  // ==========================================================================
  // PUBLIC REACTIVE HOOKS API (Zero Page Refresh · Zero Navigation Required)
  // ==========================================================================
  window.ExoticRealtime = {
    init,
    bootstrapFromCloud,
    getStatus,
    getStore() {
      return store;
    },
    getGlobalTelemetry() {
      return store.globalTelemetry;
    },
    getActivityFeed() {
      return store.activityFeed;
    },
    getActivePresence,
    getLivePeersForLevel,
    getStageReplay(levelId) {
      return store.stageReplayByLevel.get(Number(levelId)) || null;
    },
    fetchStageReplay,
    sendPresenceHeartbeat,

    // Broadcast live co-runner stage movement at ~12Hz
    broadcastStageFrame(framePayload) {
      const now = performance.now();
      if (now - lastStageBroadcastAt < 78 && !framePayload.emoteId) return;
      lastStageBroadcastAt = now;

      const st = window.ExoticStorage ? window.ExoticStorage.getState() : null;
      window.ExoticSupabase.sendBroadcast('exotic:stage', 'runner_frame', {
        callsign: st?.callsign || 'Runner',
        characterId: st?.equipped?.character || 'char_classic',
        skinId: st?.equipped?.skin || 'skin_solid',
        auraId: st?.equipped?.aura || 'aura_none',
        ...framePayload
      });
    },

    // Hook 1: Subscribe to any of the 14 Supabase PostgreSQL tables
    useTable(tableName, eventOrCb, maybeCb) {
      const event = typeof eventOrCb === 'string' ? eventOrCb : '*';
      const fn = typeof eventOrCb === 'function' ? eventOrCb : maybeCb;
      if (typeof fn !== 'function') return () => {};
      if (!tableHooks.has(tableName)) {
        tableHooks.set(tableName, new Set());
      }
      const entry = { event, fn };
      tableHooks.get(tableName).add(entry);
      return () => tableHooks.get(tableName)?.delete(entry);
    },

    // Hook 2: Subscribe to live Supabase connection status & online count
    useConnectionStatus(fn) {
      statusHooks.add(fn);
      fn(getStatus());
      return () => statusHooks.delete(fn);
    },

    // Hook 3: Subscribe to Global Telemetry aggregates
    useGlobalTelemetry(fn) {
      telemetryHooks.add(fn);
      fn(store.globalTelemetry);
      return () => telemetryHooks.delete(fn);
    },

    // Hook 4: Subscribe to live Shop / Levels / Achievements catalog mutations
    useCatalog(fn) {
      catalogHooks.add(fn);
      return () => catalogHooks.delete(fn);
    },

    // Hook 5: Subscribe to live Verified Leaderboard updates
    useLeaderboard(fn) {
      leaderboardHooks.add(fn);
      if (store.leaderboardRuns.length > 0) fn(store.leaderboardRuns);
      return () => leaderboardHooks.delete(fn);
    },

    // Hook 6: Subscribe to live Online Runners & Stage Presence
    usePresence(fn) {
      presenceHooks.add(fn);
      fn(getActivePresence());
      return () => presenceHooks.delete(fn);
    },

    // Hook 7: Subscribe to live Realtime Activity Feed
    useActivityFeed(fn) {
      feedHooks.add(fn);
      if (store.activityFeed.length > 0) fn({ latest: null, items: store.activityFeed });
      return () => feedHooks.delete(fn);
    },

    // Hook 8: Subscribe to live Supabase Storage bucket uploads
    useStorage(fn) {
      storageHooks.add(fn);
      return () => storageHooks.delete(fn);
    }
  };
})();
