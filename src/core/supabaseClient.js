(function () {
  const CLIENT_KEY_STORAGE = 'exotic_runner_client_key_v1';
  const ANON_KEY_STORAGE = 'exotic_supabase_anon_key_v1';
  const DEFAULT_PROJECT_REF = 'wwcjifbwqdedgvrmadly';
  const DEFAULT_SUPABASE_URL = `https://${DEFAULT_PROJECT_REF}.supabase.co`;

  function randomId(prefix) {
    const rand =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID().replace(/-/g, '')
        : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
    return `${prefix}_${rand.slice(0, 24)}`;
  }

  function getOrCreateClientKey() {
    try {
      let existing = localStorage.getItem(CLIENT_KEY_STORAGE);
      if (!existing || existing.length < 8) {
        existing = randomId('runner');
        localStorage.setItem(CLIENT_KEY_STORAGE, existing);
      }
      return existing;
    } catch {
      return randomId('runner');
    }
  }

  const clientKey = getOrCreateClientKey();
  const sessionId = randomId('sess');

  let config = {
    projectRef: DEFAULT_PROJECT_REF,
    supabaseUrl: DEFAULT_SUPABASE_URL,
    anonKey: '',
    dbConnected: false,
    realtimeListening: false,
    latencyMs: 0,
    realtimeTables: [],
    storageBuckets: ['runner-avatars', 'runner-cards', 'run-replays', 'stage-snapshots'],
    edgeFunctions: [
      'sync-profile',
      'shop-transaction',
      'verify-and-submit-run',
      'telemetry-ingest',
      'storage-upload-card'
    ]
  };

  try {
    const savedAnon = localStorage.getItem(ANON_KEY_STORAGE);
    if (savedAnon) config.anonKey = savedAnon.trim();
  } catch {
    // Ignore storage block
  }

  // Deduplication ring buffer so hybrid WS + SSE + BroadcastChannel never fires twice
  const seenIds = new Set();
  const seenQueue = [];
  function markSeen(id) {
    if (!id) return false;
    if (seenIds.has(id)) return true;
    seenIds.add(id);
    seenQueue.push(id);
    if (seenQueue.length > 600) {
      const oldest = seenQueue.shift();
      seenIds.delete(oldest);
    }
    return false;
  }

  const pgChangeListeners = new Set();
  const broadcastListeners = new Set();
  const storageListeners = new Set();
  const statusListeners = new Set();

  let sseSource = null;
  let sseConnected = false;
  let wsSocket = null;
  let wsConnected = false;
  let wsHeartbeatTimer = null;
  let wsRef = 1;
  let localBus = null;

  function emitStatus() {
    const snapshot = {
      connected: Boolean(wsConnected || (sseConnected && config.dbConnected)),
      wsConnected,
      sseConnected,
      dbConnected: config.dbConnected,
      realtimeListening: config.realtimeListening,
      transport: wsConnected
        ? 'Supabase WebSocket + PG Stream'
        : sseConnected && config.dbConnected
        ? 'Supabase PG Live Stream'
        : sseConnected
        ? 'Local Stream'
        : 'Reconnecting',
      latencyMs: config.latencyMs || 0,
      projectRef: config.projectRef,
      supabaseUrl: config.supabaseUrl,
      hasAnonKey: Boolean(config.anonKey),
      realtimeTables: config.realtimeTables,
      storageBuckets: config.storageBuckets,
      edgeFunctions: config.edgeFunctions,
      clientKey,
      sessionId
    };
    statusListeners.forEach((fn) => {
      try {
        fn(snapshot);
      } catch {
        // Ignore subscriber error
      }
    });
  }

  function dispatchPgChange(payload) {
    if (!payload || !payload.table) return;
    if (payload.id && markSeen(payload.id)) return;
    pgChangeListeners.forEach((fn) => {
      try {
        fn(payload);
      } catch {
        // Ignore subscriber error
      }
    });
  }

  function dispatchBroadcast(msg) {
    if (!msg) return;
    if (msg.id && markSeen(msg.id)) return;
    broadcastListeners.forEach((fn) => {
      try {
        fn(msg);
      } catch {
        // Ignore subscriber error
      }
    });
  }

  function dispatchStorage(evt) {
    if (!evt) return;
    storageListeners.forEach((fn) => {
      try {
        fn(evt);
      } catch {
        // Ignore subscriber error
      }
    });
  }

  // 1. Cross-Tab Instant BroadcastChannel (<2ms same-origin sync)
  function initBroadcastChannel() {
    if (typeof BroadcastChannel === 'undefined') return;
    try {
      localBus = new BroadcastChannel('exotic_supabase_realtime_v1');
      localBus.onmessage = (ev) => {
        const data = ev.data;
        if (!data || data.senderSession === sessionId) return;
        if (data.kind === 'broadcast') {
          dispatchBroadcast(data.payload);
        } else if (data.kind === 'state_sync') {
          dispatchBroadcast({
            channel: 'exotic:local',
            event: 'profile_patch',
            payload: data.payload
          });
        }
      };
    } catch {
      localBus = null;
    }
  }

  // 2. Live Server-Sent Events Stream (/api/realtime/stream -> Supabase PG LISTEN exotic_realtime)
  function connectSseStream() {
    if (typeof EventSource === 'undefined') return;
    if (sseSource) {
      try {
        sseSource.close();
      } catch {
        // Ignore
      }
    }

    try {
      const es = new EventSource('/api/realtime/stream');
      sseSource = es;

      es.onopen = () => {
        sseConnected = true;
        emitStatus();
      };

      es.addEventListener('status', (e) => {
        try {
          const st = JSON.parse(e.data);
          config.dbConnected = Boolean(st.dbConnected);
          config.realtimeListening = Boolean(st.realtimeListening);
          if (typeof st.latencyMs === 'number') config.latencyMs = st.latencyMs;
          sseConnected = true;
          emitStatus();
        } catch {
          // Ignore
        }
      });

      es.addEventListener('postgres_changes', (e) => {
        try {
          const parsed = JSON.parse(e.data);
          dispatchPgChange(parsed);
        } catch {
          // Ignore
        }
      });

      es.addEventListener('broadcast', (e) => {
        try {
          const parsed = JSON.parse(e.data);
          if (parsed?.payload?.sessionId === sessionId) return;
          dispatchBroadcast(parsed);
        } catch {
          // Ignore
        }
      });

      es.addEventListener('storage_changes', (e) => {
        try {
          dispatchStorage(JSON.parse(e.data));
        } catch {
          // Ignore
        }
      });

      es.onerror = () => {
        sseConnected = false;
        emitStatus();
      };
    } catch {
      sseConnected = false;
      emitStatus();
    }
  }

  // 3. Direct Supabase Phoenix Realtime WebSocket (wss://<ref>.supabase.co/realtime/v1/websocket)
  function connectSupabaseWebSocket() {
    if (!config.anonKey || typeof WebSocket === 'undefined') return;
    if (wsSocket) {
      try {
        wsSocket.close();
      } catch {
        // Ignore
      }
      wsSocket = null;
    }

    try {
      const wsBase = config.supabaseUrl.replace(/^http/, 'ws');
      const wsUrl = `${wsBase}/realtime/v1/websocket?apikey=${encodeURIComponent(
        config.anonKey
      )}&vsn=1.0.0`;
      const sock = new WebSocket(wsUrl);
      wsSocket = sock;

      sock.onopen = () => {
        wsConnected = true;
        emitStatus();

        // Join universal postgres_changes channel for all public tables
        const joinPg = {
          topic: 'realtime:public',
          event: 'phx_join',
          payload: {
            config: {
              broadcast: { ack: false, self: false },
              presence: { key: sessionId },
              postgres_changes: [{ event: '*', schema: 'public' }]
            },
            access_token: config.anonKey
          },
          ref: String(wsRef++)
        };
        sock.send(JSON.stringify(joinPg));

        // Join transient stage broadcast channel
        const joinStage = {
          topic: 'realtime:exotic:stage',
          event: 'phx_join',
          payload: {
            config: {
              broadcast: { ack: false, self: false },
              presence: { key: sessionId }
            },
            access_token: config.anonKey
          },
          ref: String(wsRef++)
        };
        sock.send(JSON.stringify(joinStage));

        if (wsHeartbeatTimer) clearInterval(wsHeartbeatTimer);
        wsHeartbeatTimer = setInterval(() => {
          if (sock.readyState === WebSocket.OPEN) {
            sock.send(
              JSON.stringify({
                topic: 'phoenix',
                event: 'heartbeat',
                payload: {},
                ref: String(wsRef++)
              })
            );
          }
        }, 25000);
      };

      sock.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.event === 'postgres_changes' && msg.payload?.data) {
            const d = msg.payload.data;
            dispatchPgChange({
              id: `${d.commit_timestamp || Date.now()}_${d.table}_${d.type}`,
              schema: d.schema || 'public',
              table: d.table,
              eventType: d.type,
              commit_timestamp: d.commit_timestamp,
              new: d.record || null,
              old: d.old_record || null
            });
          } else if (msg.event === 'broadcast' && msg.payload) {
            if (msg.payload?.payload?.sessionId === sessionId) return;
            dispatchBroadcast({
              channel: msg.topic.replace(/^realtime:/, ''),
              event: msg.payload.event,
              payload: msg.payload.payload
            });
          }
        } catch {
          // Ignore malformed WS message
        }
      };

      sock.onclose = () => {
        wsConnected = false;
        if (wsHeartbeatTimer) clearInterval(wsHeartbeatTimer);
        emitStatus();
        if (config.anonKey) {
          setTimeout(connectSupabaseWebSocket, 4000);
        }
      };

      sock.onerror = () => {
        wsConnected = false;
        emitStatus();
      };
    } catch {
      wsConnected = false;
      emitStatus();
    }
  }

  function commonHeaders(extra = {}) {
    const h = {
      'Content-Type': 'application/json',
      'x-exotic-player-id': clientKey,
      'x-exotic-session-id': sessionId,
      ...extra
    };
    if (config.anonKey) {
      h.apikey = config.anonKey;
      h.Authorization = `Bearer ${config.anonKey}`;
    }
    return h;
  }

  // Supabase Edge Functions Invoker (Direct Cloud Function -> Local Live PG Bridge seamless fallback)
  const functionsApi = {
    async invoke(fnName, opts = {}) {
      const bodyObj = { ...(opts.body || {}), clientKey, sessionId };

      if (config.anonKey) {
        try {
          const cloudRes = await fetch(`${config.supabaseUrl}/functions/v1/${fnName}`, {
            method: opts.method || 'POST',
            headers: commonHeaders(opts.headers),
            body: JSON.stringify(bodyObj)
          });
          if (cloudRes.ok) {
            const data = await cloudRes.json();
            return { data, error: null };
          }
        } catch {
          // Fallback to /functions/v1/<fnName> on server.js
        }
      }

      try {
        const res = await fetch(`/functions/v1/${fnName}`, {
          method: opts.method || 'POST',
          headers: commonHeaders(opts.headers),
          body: JSON.stringify(bodyObj)
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          return { data, error: new Error(data?.reason || data?.error || `HTTP ${res.status}`) };
        }
        return { data, error: null };
      } catch (err) {
        return { data: null, error: err };
      }
    }
  };

  // Supabase Storage Buckets Client
  const storageApi = {
    from(bucketId) {
      return {
        async upload(dataPayload) {
          return functionsApi.invoke('storage-upload-card', {
            body: {
              bucket: bucketId,
              data: dataPayload
            }
          });
        },
        getPublicUrl(objectPath) {
          if (!objectPath) return { data: { publicUrl: '' } };
          if (objectPath.startsWith('http') || objectPath.startsWith('/storage/')) {
            return { data: { publicUrl: objectPath } };
          }
          return {
            data: {
              publicUrl: `${config.supabaseUrl}/storage/v1/object/public/${bucketId}/${objectPath}`
            }
          };
        }
      };
    }
  };

  async function init() {
    initBroadcastChannel();
    try {
      const res = await fetch('/api/supabase/config', { cache: 'no-store' });
      if (res.ok) {
        const remoteCfg = await res.json();
        config = {
          ...config,
          ...remoteCfg,
          anonKey: config.anonKey || remoteCfg.anonKey || ''
        };
      }
    } catch {
      // Static mode fallback
    }
    connectSseStream();
    if (config.anonKey) {
      connectSupabaseWebSocket();
    }
    emitStatus();
    return config;
  }

  window.ExoticSupabase = {
    init,
    getClientKey() {
      return clientKey;
    },
    getSessionId() {
      return sessionId;
    },
    getConfig() {
      return { ...config };
    },
    async setAnonKey(key) {
      const clean = String(key || '').trim();
      config.anonKey = clean;
      try {
        if (clean) localStorage.setItem(ANON_KEY_STORAGE, clean);
        else localStorage.removeItem(ANON_KEY_STORAGE);
      } catch {
        // Ignore
      }
      try {
        await fetch('/api/supabase/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ anonKey: clean })
        });
      } catch {
        // Ignore
      }
      if (clean) connectSupabaseWebSocket();
      emitStatus();
    },
    functions: functionsApi,
    storage: storageApi,
    sendBroadcast(channel, event, payload) {
      const envelope = {
        id: randomId('bcast'),
        channel,
        event,
        payload: { ...payload, sessionId, clientKey }
      };
      if (localBus) {
        try {
          localBus.postMessage({
            senderSession: sessionId,
            kind: 'broadcast',
            payload: envelope
          });
        } catch {
          // Ignore
        }
      }
      if (wsSocket && wsSocket.readyState === WebSocket.OPEN) {
        try {
          wsSocket.send(
            JSON.stringify({
              topic: `realtime:${channel}`,
              event: 'broadcast',
              payload: { type: 'broadcast', event, payload: envelope.payload },
              ref: String(wsRef++)
            })
          );
        } catch {
          // Ignore
        }
      }
      fetch('/api/realtime/broadcast', {
        method: 'POST',
        headers: commonHeaders(),
        body: JSON.stringify(envelope),
        keepalive: true
      }).catch(() => {});
    },
    notifyLocalTabs(patch) {
      if (!localBus) return;
      try {
        localBus.postMessage({
          senderSession: sessionId,
          kind: 'state_sync',
          payload: patch
        });
      } catch {
        // Ignore
      }
    },
    onPostgresChange(fn) {
      pgChangeListeners.add(fn);
      return () => pgChangeListeners.delete(fn);
    },
    onBroadcast(fn) {
      broadcastListeners.add(fn);
      return () => broadcastListeners.delete(fn);
    },
    onStorageChange(fn) {
      storageListeners.add(fn);
      return () => storageListeners.delete(fn);
    },
    onStatusChange(fn) {
      statusListeners.add(fn);
      emitStatus();
      return () => statusListeners.delete(fn);
    }
  };
})();
