const http = require('http');
const fs = require('fs');
const path = require('path');
const nodeCrypto = require('crypto');
const { PgWireClient, PgConnectionPool, parsePostgresUrl } = require('./src/server/pgClient');
const {
  createChallenge,
  verifyRegistration,
  verifyAssertion,
  verifyFaceDescriptorEnrollment,
  verifyFaceDescriptorMatch
} = require('./src/server/webauthnVerify');

const ROOT_DIR = __dirname;

// Load .env if present (zero external dependencies)
function loadDotEnv() {
  const envPath = path.join(ROOT_DIR, '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!(key in process.env)) {
      process.env[key] = val;
    }
  }
}
loadDotEnv();

const PORT = Number(process.env.PORT) || 8080;
const HOST = '0.0.0.0';
const IS_VERCEL = Boolean(process.env.VERCEL);
const DATA_DIR = IS_VERCEL ? path.join('/tmp', 'exotic-data') : path.join(ROOT_DIR, 'data');
const RUNS_FILE = path.join(DATA_DIR, 'runs.json');
const STORAGE_ROOT = path.join(DATA_DIR, 'storage');

const SUPABASE_PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'wwcjifbwqdedgvrmadly';
const SUPABASE_URL = process.env.SUPABASE_URL || `https://${SUPABASE_PROJECT_REF}.supabase.co`;
let runtimeAnonKey = process.env.SUPABASE_ANON_KEY || '';

const PG_CONFIG = process.env.SUPABASE_DB_URL
  ? parsePostgresUrl(process.env.SUPABASE_DB_URL)
  : process.env.SUPABASE_DB_PASSWORD
  ? {
      host: process.env.SUPABASE_POOLER_HOST || 'aws-0-eu-west-1.pooler.supabase.com',
      port: Number(process.env.SUPABASE_POOLER_PORT || 5432),
      user: process.env.SUPABASE_POOLER_USER || `postgres.${SUPABASE_PROJECT_REF}`,
      password: process.env.SUPABASE_DB_PASSWORD,
      database: process.env.SUPABASE_DB_NAME || 'postgres'
    }
  : null;

const REALTIME_TABLES = [
  'shop_items',
  'levels_catalog',
  'achievements_catalog',
  'global_telemetry',
  'profiles',
  'player_settings',
  'player_loadouts',
  'player_inventory',
  'player_level_progress',
  'player_achievements',
  'leaderboard_runs',
  'run_replays',
  'live_presence_sessions',
  'realtime_activity_feed'
];

const STORAGE_BUCKETS = ['runner-avatars', 'runner-cards', 'run-replays', 'stage-snapshots'];
const EDGE_FUNCTIONS = [
  'sync-profile',
  'shop-transaction',
  'verify-and-submit-run',
  'telemetry-ingest',
  'storage-upload-card',
  'auth-username'
];

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

// Local fallback storage directories
function ensureDirs() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(RUNS_FILE)) fs.writeFileSync(RUNS_FILE, '[]\n', 'utf8');
    for (const b of STORAGE_BUCKETS) {
      const dir = path.join(STORAGE_ROOT, b);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    }
  } catch {
    // Serverless read-only fallback guard
  }
}
ensureDirs();

function readFallbackRuns() {
  try {
    const parsed = JSON.parse(fs.readFileSync(RUNS_FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeFallbackRuns(runs) {
  try {
    fs.writeFileSync(RUNS_FILE, JSON.stringify(runs, null, 2) + '\n', 'utf8');
  } catch {
    // Ignore on stateless runtime
  }
}

// Live Supabase PostgreSQL Pool & Persistent LISTEN Client
const pgPool = PG_CONFIG ? new PgConnectionPool(PG_CONFIG, IS_VERCEL ? 2 : 4) : null;
let listenClient = null;
let dbConnected = false;
let realtimeListening = false;
let lastPingMs = 0;

// Active SSE Realtime Subscribers
const sseClients = new Set();

function broadcastSse(eventName, payloadObj) {
  const frame = `event: ${eventName}\ndata: ${JSON.stringify(payloadObj)}\n\n`;
  for (const client of sseClients) {
    try {
      client.res.write(frame);
    } catch {
      sseClients.delete(client);
    }
  }
}

async function startRealtimeListener() {
  if (!PG_CONFIG) return;
  try {
    const t0 = Date.now();
    const client = new PgWireClient({
      ...PG_CONFIG,
      applicationName: 'exotic_realtime_listener'
    });
    await client.connect();
    lastPingMs = Date.now() - t0;
    dbConnected = true;

    client.on('notification', (msg) => {
      if (msg.channel !== 'exotic_realtime') return;
      try {
        const parsed = JSON.parse(msg.payload);
        broadcastSse('postgres_changes', parsed);
      } catch {
        // Ignore malformed payload
      }
    });

    client.on('disconnect', () => {
      realtimeListening = false;
      listenClient = null;
      broadcastSse('status', { dbConnected, realtimeListening: false });
      setTimeout(startRealtimeListener, 2000);
    });

    await client.query('LISTEN exotic_realtime');
    listenClient = client;
    realtimeListening = true;
    broadcastSse('status', {
      dbConnected: true,
      realtimeListening: true,
      latencyMs: lastPingMs,
      projectRef: SUPABASE_PROJECT_REF
    });
    console.log(`[Supabase Realtime] Listening on exotic_realtime (${SUPABASE_PROJECT_REF}, ${lastPingMs}ms)`);
  } catch (err) {
    dbConnected = false;
    realtimeListening = false;
    console.error('[Supabase Realtime] Listener reconnect scheduled:', err.message);
    setTimeout(startRealtimeListener, 3500);
  }
}

function startKeepaliveTimer() {
  // Periodic keepalive for LISTEN connection + SSE heartbeats + stale presence cleanup
  setInterval(async () => {
    for (const c of sseClients) {
      try {
        c.res.write(`: keepalive ${Date.now()}\n\n`);
      } catch {
        sseClients.delete(c);
      }
    }
    if (listenClient && listenClient.connected) {
      const t0 = Date.now();
      try {
        await listenClient.query('SELECT 1');
        lastPingMs = Date.now() - t0;
        dbConnected = true;
      } catch {
        // disconnect handler will reconnect
      }
    }
  }, 18000);
}

function mapRunRow(r) {
  return {
    id: r.id,
    profileId: r.profile_id || null,
    clientKey: r.client_key || null,
    callsign: r.callsign,
    levelId: Number(r.level_id),
    levelTitle: r.level_title,
    timeMs: Number(r.time_ms),
    deaths: Number(r.deaths),
    coins: Number(r.coins || 0),
    characterId: r.character_id || 'char_classic',
    skinId: r.skin_id || 'skin_solid',
    auraId: r.aura_id || 'aura_none',
    trailId: r.trail_id || 'trail_none',
    activeUpgrades: Array.isArray(r.active_upgrades) ? r.active_upgrades : [],
    isDeathless: Boolean(r.is_deathless),
    replayStoragePath: r.replay_storage_path || null,
    runnerCardPath: r.runner_card_path || null,
    recordedAt: r.recorded_at
  };
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers':
      'Content-Type, Authorization, apikey, x-client-info, x-exotic-player-id, x-exotic-session-id'
  });
  res.end(body);
}

function readJsonBody(req, maxBytes = 2 * 1024 * 1024) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return Promise.resolve(req.body);
  }
  if (typeof req.body === 'string') {
    if (!req.body) return Promise.resolve({});
    try {
      return Promise.resolve(JSON.parse(req.body));
    } catch (err) {
      return Promise.reject(err);
    }
  }
  if (Buffer.isBuffer(req.body)) {
    if (!req.body.length) return Promise.resolve({});
    try {
      return Promise.resolve(JSON.parse(req.body.toString('utf8')));
    } catch (err) {
      return Promise.reject(err);
    }
  }
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > maxBytes) {
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function getClientKey(req, body) {
  const fromBody = body && typeof body.clientKey === 'string' ? body.clientKey.trim() : '';
  const fromHdr = String(req.headers['x-exotic-player-id'] || '').trim();
  return (fromBody || fromHdr).slice(0, 96);
}

async function fetchCloudBundle(clientKey, incomingState = null) {
  if (!pgPool) {
    return { ok: false, offline: true };
  }

  let snapshot = null;
  let authSession = { ok: true, hasAccount: false, signedIn: false, username: null };
  if (clientKey) {
    const authRes = await pgPool.query(
      'SELECT public.rpc_auth_session_status($1) AS res',
      [clientKey]
    );
    authSession = authRes.rows[0]?.res || authSession;
    if (authSession.signedIn && incomingState) {
      const syncRes = await pgPool.query(
        'SELECT public.rpc_sync_runner_state($1, $2::jsonb) AS snap',
        [clientKey, JSON.stringify(incomingState)]
      );
      snapshot = syncRes.rows[0]?.snap || authSession.snapshot || null;
    } else {
      snapshot = authSession.snapshot || null;
    }
  }

  const [telRes, lvlRes, shopRes, achRes, runsRes, feedRes, presRes] = await Promise.all([
    pgPool.query("SELECT * FROM public.global_telemetry WHERE id = 'global' LIMIT 1"),
    pgPool.query(
      'SELECT id, code, title, subtitle, width, height, par_deaths, par_time_ms, reward_coins, reward_sp, global_attempts, global_clears, global_deaths, global_orbs_found, world_record_time_ms, world_record_callsign, world_record_deaths FROM public.levels_catalog ORDER BY id ASC'
    ),
    pgPool.query(
      'SELECT id, category, name, tier, cost, currency, description, is_starter, sort_order, total_unlocks, total_equips FROM public.shop_items ORDER BY sort_order ASC'
    ),
    pgPool.query('SELECT * FROM public.achievements_catalog ORDER BY sort_order ASC'),
    pgPool.query(
      'SELECT * FROM public.leaderboard_runs ORDER BY time_ms ASC, deaths ASC LIMIT 120'
    ),
    pgPool.query(
      'SELECT * FROM public.realtime_activity_feed ORDER BY created_at DESC LIMIT 25'
    ),
    pgPool.query(
      "SELECT * FROM public.live_presence_sessions WHERE is_online = true AND heartbeat_at >= now() - interval '45 seconds' ORDER BY heartbeat_at DESC LIMIT 40"
    )
  ]);

  return {
    ok: true,
    authSession,
    snapshot,
    globalTelemetry: telRes.rows[0] || null,
    levelsCatalog: lvlRes.rows,
    shopCatalog: shopRes.rows,
    achievementsCatalog: achRes.rows,
    leaderboardRuns: runsRes.rows.map(mapRunRow),
    activityFeed: feedRes.rows,
    presence: presRes.rows
  };
}

async function handleRequest(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers':
        'Content-Type, Authorization, apikey, x-client-info, x-exotic-player-id, x-exotic-session-id'
    });
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const rawPathname = parsedUrl.searchParams.get('__pathname') || parsedUrl.pathname;
  const pathname = decodeURIComponent(rawPathname);

  // --------------------------------------------------------------------------
  // 1. LIVE SUPABASE REALTIME SSE STREAM (/api/realtime/stream)
  // --------------------------------------------------------------------------
  if (pathname === '/api/realtime/stream' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: IS_VERCEL ? 'close' : 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': '*'
    });

    if (IS_VERCEL) {
      res.write('retry: 25000\n');
      res.write(
        `event: status\ndata: ${JSON.stringify({
          dbConnected: Boolean(pgPool),
          realtimeListening: true,
          latencyMs: lastPingMs || 18,
          projectRef: SUPABASE_PROJECT_REF,
          connectedClients: 1
        })}\n\n`
      );
      res.end();
      return;
    }

    const clientEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      res
    };
    sseClients.add(clientEntry);

    res.write(
      `event: status\ndata: ${JSON.stringify({
        dbConnected,
        realtimeListening,
        latencyMs: lastPingMs,
        projectRef: SUPABASE_PROJECT_REF,
        connectedClients: sseClients.size
      })}\n\n`
    );

    req.on('close', () => {
      sseClients.delete(clientEntry);
    });
    return;
  }

  // --------------------------------------------------------------------------
  // 2. TRANSIENT LOW-LATENCY REALTIME BROADCAST (/api/realtime/broadcast)
  // --------------------------------------------------------------------------
  if (pathname === '/api/realtime/broadcast' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req, 65536);
      broadcastSse('broadcast', {
        channel: String(body.channel || 'exotic:stage'),
        event: String(body.event || 'state'),
        payload: body.payload || {},
        sentAt: Date.now()
      });
      sendJson(res, 200, { ok: true });
    } catch {
      sendJson(res, 400, { ok: false });
    }
    return;
  }

  // --------------------------------------------------------------------------
  // 3. SUPABASE RUNTIME CONFIG & HEALTH (/api/supabase/config)
  // --------------------------------------------------------------------------
  if (pathname === '/api/supabase/config') {
    if (req.method === 'GET') {
      sendJson(res, 200, {
        ok: true,
        projectRef: SUPABASE_PROJECT_REF,
        supabaseUrl: SUPABASE_URL,
        anonKey: runtimeAnonKey || '',
        dbConnected,
        realtimeListening,
        latencyMs: lastPingMs,
        sseSubscribers: sseClients.size,
        realtimeTables: REALTIME_TABLES,
        storageBuckets: STORAGE_BUCKETS,
        edgeFunctions: EDGE_FUNCTIONS
      });
      return;
    }
    if (req.method === 'POST') {
      try {
        const body = await readJsonBody(req, 16384);
        if (typeof body.anonKey === 'string') {
          runtimeAnonKey = body.anonKey.trim();
        }
        sendJson(res, 200, { ok: true, hasAnonKey: Boolean(runtimeAnonKey) });
      } catch {
        sendJson(res, 400, { ok: false });
      }
      return;
    }
  }

  // --------------------------------------------------------------------------
  // 3b. USERNAME-ONLY AUTHENTICATION (/api/auth/* & /functions/v1/auth-username)
  // --------------------------------------------------------------------------
  if (
    pathname.startsWith('/api/auth/') ||
    pathname === '/functions/v1/auth-username'
  ) {
    try {
      if (!pgPool) {
        sendJson(res, 503, { ok: false, reason: 'Service temporarily unavailable.' });
        return;
      }

      const body = req.method === 'POST' ? await readJsonBody(req) : {};
      const clientKey =
        getClientKey(req, body) || parsedUrl.searchParams.get('clientKey') || '';

      let action = 'session';
      if (pathname === '/api/auth/session') action = 'session';
      else if (pathname === '/api/auth/webauthn-challenge') action = 'challenge';
      else if (pathname === '/api/auth/check-username') action = 'check';
      else if (pathname === '/api/auth/guest-candidate') action = 'guest_candidate';
      else if (pathname === '/api/auth/guest-signup') action = 'guest_signup';
      else if (pathname === '/api/auth/guest-rename') action = 'rename_guest';
      else if (pathname === '/api/auth/signup') action = 'signup';
      else if (pathname === '/api/auth/signin') action = 'signin';
      else if (pathname === '/api/auth/signout') action = 'signout';
      else if (pathname === '/api/auth/delete-account') action = 'delete';
      else if (pathname === '/api/auth/methods/connect') action = 'connect_method';
      else if (pathname === '/api/auth/methods/disconnect') action = 'disconnect_method';
      else if (pathname === '/functions/v1/auth-username') {
        action = String(
          body.action || parsedUrl.searchParams.get('action') || 'session'
        );
      }

      const username = String(
        body.username ?? parsedUrl.searchParams.get('username') ?? ''
      );
      const authMethod =
        body.authMethod != null
          ? String(body.authMethod).toLowerCase()
          : parsedUrl.searchParams.get('authMethod')?.toLowerCase() || null;
      const credential =
        body.credential != null ? String(body.credential) : null;
      const biometricCredentialId =
        body.biometricCredentialId != null
          ? String(body.biometricCredentialId)
          : null;
      const expectedHost = String(
        req.headers['x-forwarded-host'] || req.headers.host || ''
      );

      if (action === 'challenge') {
        const challenge = createChallenge();
        let userMeta = null;
        if (username && /^[A-Za-z0-9_]{3,20}$/.test(username.trim())) {
          const chkQ = await pgPool.query(
            'SELECT public.rpc_check_username($1, $2) AS res',
            [username.trim(), clientKey || null]
          );
          userMeta = chkQ.rows[0]?.res || null;
        }
        const pickedMethod = authMethod || userMeta?.authMethod || null;
        const bioModes = userMeta?.biometricModes || {};
        const bioIds = userMeta?.biometricCredentialIds || {};
        sendJson(res, 200, {
          ok: true,
          challenge,
          exists: Boolean(userMeta?.exists),
          authMethod: userMeta?.authMethod || null,
          authMethods: Array.isArray(userMeta?.authMethods) ? userMeta.authMethods : [],
          biometricModes: bioModes,
          biometricCredentialIds: bioIds,
          biometricMode:
            (pickedMethod && bioModes[pickedMethod]) || userMeta?.biometricMode || null,
          biometricCredentialId:
            (pickedMethod && bioIds[pickedMethod]) || userMeta?.biometricCredentialId || null
        });
        return;
      }

      let q;
      if (action === 'check') {
        q = await pgPool.query(
          'SELECT public.rpc_check_username($1, $2) AS res',
          [username, clientKey || null]
        );
      } else if (action === 'guest_candidate') {
        q = await pgPool.query(
          'SELECT public.rpc_generate_guest_username() AS res'
        );
      } else if (action === 'guest_signup') {
        q = await pgPool.query(
          'SELECT public.rpc_auth_guest_signup($1, $2) AS res',
          [clientKey, username || null]
        );
      } else if (action === 'rename_guest') {
        q = await pgPool.query(
          'SELECT public.rpc_auth_rename_guest($1, $2) AS res',
          [clientKey, username]
        );
      } else if (action === 'signup') {
        const chosen = authMethod || 'password';
        if (chosen === 'fingerprint' || chosen === 'faceid') {
          if (chosen === 'faceid' && body.biometricMode === 'camera_face') {
            const fv = verifyFaceDescriptorEnrollment({
              faceDescriptor: body.faceDescriptor,
              challenge: body.challenge
            });
            if (!fv.ok) {
              sendJson(res, 400, {
                ok: false,
                code: 'CREDENTIAL_INVALID',
                reason: fv.reason
              });
              return;
            }
            q = await pgPool.query(
              'SELECT public.rpc_auth_signup($1, $2, $3, NULL, $4, NULL, -7, 0, $5, $6::float8[]) AS res',
              [
                clientKey,
                username,
                chosen,
                biometricCredentialId || null,
                'camera_face',
                `{${fv.normalizedDescriptor.join(',')}}`
              ]
            );
          } else {
            const rv = verifyRegistration({
              attestation: body.webauthnAttestation,
              expectedHost
            });
            if (!rv.ok) {
              sendJson(res, 400, {
                ok: false,
                code: 'CREDENTIAL_INVALID',
                reason: rv.reason
              });
              return;
            }
            q = await pgPool.query(
              'SELECT public.rpc_auth_signup($1, $2, $3, NULL, $4, $5, $6, $7, $8, NULL) AS res',
              [
                clientKey,
                username,
                chosen,
                rv.credentialId,
                rv.publicKeySpki,
                rv.publicKeyAlg,
                rv.signCount,
                'webauthn'
              ]
            );
          }
        } else {
          q = await pgPool.query(
            'SELECT public.rpc_auth_signup($1, $2, $3, $4, NULL, NULL, -7, 0, NULL, NULL) AS res',
            [clientKey, username, chosen, credential]
          );
        }
      } else if (action === 'signin') {
        if (authMethod === 'fingerprint' || authMethod === 'faceid') {
          const targetQ = await pgPool.query(
            'SELECT public.rpc_get_webauthn_target($1, $2, $3) AS res',
            [username, clientKey || null, authMethod]
          );
          const target = targetQ.rows[0]?.res || { ok: false };
          if (!target.ok) {
            sendJson(res, 400, target);
            return;
          }
          const activeList = Array.isArray(target.authMethods) ? target.authMethods : [];
          if (!target.hasCredential && activeList.length > 0) {
            sendJson(res, 400, {
              ok: false,
              code: 'AUTH_METHOD_MISMATCH',
              expectedMethod: target.authMethod,
              expectedMethods: activeList,
              biometricModes: target.biometricModes || {},
              biometricCredentialIds: target.biometricCredentialIds || {},
              reason: 'That authentication method is not active on this account'
            });
            return;
          }

          if (target.hasCredential) {
            if (target.biometricMode === 'camera_face') {
              const fm = verifyFaceDescriptorMatch({
                enrolledDescriptor: target.faceDescriptor,
                candidateDescriptor: body.faceDescriptor,
                challenge: body.challenge
              });
              if (!fm.ok) {
                sendJson(res, 400, {
                  ok: false,
                  code: 'INVALID_CREDENTIAL',
                  expectedMethod: target.authMethod,
                  reason: fm.reason
                });
                return;
              }
              q = await pgPool.query(
                'SELECT public.rpc_auth_signin_biometric_verified($1, $2, $3, $4, $5, NULL, -7, 0, NULL) AS res',
                [
                  clientKey,
                  username,
                  authMethod,
                  'camera_face',
                  target.biometricCredentialId
                ]
              );
            } else {
              const av = verifyAssertion({
                assertion: body.webauthnAssertion,
                expectedCredentialId: target.biometricCredentialId,
                publicKeySpki: target.publicKeySpki,
                publicKeyAlg: target.publicKeyAlg,
                prevSignCount: target.signCount,
                expectedHost
              });
              if (!av.ok) {
                sendJson(res, 400, {
                  ok: false,
                  code: 'INVALID_CREDENTIAL',
                  expectedMethod: target.authMethod,
                  biometricCredentialId: target.biometricCredentialId,
                  reason: av.reason
                });
                return;
              }
              q = await pgPool.query(
                'SELECT public.rpc_auth_signin_biometric_verified($1, $2, $3, $4, $5, NULL, $6, $7, NULL) AS res',
                [
                  clientKey,
                  username,
                  authMethod,
                  'webauthn',
                  target.biometricCredentialId,
                  target.publicKeyAlg,
                  av.newSignCount
                ]
              );
            }
          } else {
            // Bind hardware biometric onto pre-existing credential-less account
            if (authMethod === 'faceid' && body.biometricMode === 'camera_face') {
              const fv = verifyFaceDescriptorEnrollment({
                faceDescriptor: body.faceDescriptor,
                challenge: body.challenge
              });
              if (!fv.ok) {
                sendJson(res, 400, {
                  ok: false,
                  code: 'CREDENTIAL_INVALID',
                  reason: fv.reason
                });
                return;
              }
              q = await pgPool.query(
                'SELECT public.rpc_auth_signin_biometric_verified($1, $2, $3, $4, NULL, NULL, -7, 0, $5::float8[]) AS res',
                [
                  clientKey,
                  username,
                  authMethod,
                  'camera_face',
                  `{${fv.normalizedDescriptor.join(',')}}`
                ]
              );
            } else {
              const rv = verifyRegistration({
                attestation: body.webauthnAttestation,
                expectedHost
              });
              if (!rv.ok) {
                sendJson(res, 400, {
                  ok: false,
                  code: 'CREDENTIAL_INVALID',
                  reason: rv.reason
                });
                return;
              }
              q = await pgPool.query(
                'SELECT public.rpc_auth_signin_biometric_verified($1, $2, $3, $4, $5, $6, $7, $8, NULL) AS res',
                [
                  clientKey,
                  username,
                  authMethod,
                  'webauthn',
                  rv.credentialId,
                  rv.publicKeySpki,
                  rv.publicKeyAlg,
                  rv.signCount
                ]
              );
            }
          }
        } else {
          q = await pgPool.query(
            'SELECT public.rpc_auth_signin($1, $2, $3, $4, $5) AS res',
            [
              clientKey,
              username,
              authMethod || null,
              credential,
              biometricCredentialId
            ]
          );
        }
      } else if (action === 'connect_method') {
        const chosen = String(authMethod || '').toLowerCase();
        if (chosen === 'fingerprint' || chosen === 'faceid') {
          if (chosen === 'faceid' && body.biometricMode === 'camera_face') {
            const fv = verifyFaceDescriptorEnrollment({
              faceDescriptor: body.faceDescriptor,
              challenge: body.challenge
            });
            if (!fv.ok) {
              sendJson(res, 400, {
                ok: false,
                code: 'CREDENTIAL_INVALID',
                reason: fv.reason
              });
              return;
            }
            q = await pgPool.query(
              'SELECT public.rpc_auth_connect_method($1, $2, NULL, $3, NULL, -7, 0, $4, $5::float8[]) AS res',
              [
                clientKey,
                chosen,
                biometricCredentialId || null,
                'camera_face',
                `{${fv.normalizedDescriptor.join(',')}}`
              ]
            );
          } else {
            const rv = verifyRegistration({
              attestation: body.webauthnAttestation,
              expectedHost
            });
            if (!rv.ok) {
              sendJson(res, 400, {
                ok: false,
                code: 'CREDENTIAL_INVALID',
                reason: rv.reason
              });
              return;
            }
            q = await pgPool.query(
              'SELECT public.rpc_auth_connect_method($1, $2, NULL, $3, $4, $5, $6, $7, NULL) AS res',
              [
                clientKey,
                chosen,
                rv.credentialId,
                rv.publicKeySpki,
                rv.publicKeyAlg,
                rv.signCount,
                'webauthn'
              ]
            );
          }
        } else {
          q = await pgPool.query(
            'SELECT public.rpc_auth_connect_method($1, $2, $3, NULL, NULL, -7, 0, NULL, NULL) AS res',
            [clientKey, chosen, credential]
          );
        }
      } else if (action === 'disconnect_method') {
        q = await pgPool.query(
          'SELECT public.rpc_auth_disconnect_method($1, $2) AS res',
          [clientKey, String(authMethod || '').toLowerCase()]
        );
      } else if (action === 'signout') {
        q = await pgPool.query(
          'SELECT public.rpc_auth_signout($1) AS res',
          [clientKey]
        );
      } else if (action === 'delete') {
        q = await pgPool.query(
          'SELECT public.rpc_auth_delete_account($1) AS res',
          [clientKey]
        );
      } else {
        q = await pgPool.query(
          'SELECT public.rpc_auth_session_status($1) AS res',
          [clientKey]
        );
      }

      const rpcOut = q.rows[0]?.res || { ok: false };
      sendJson(res, rpcOut.ok === false ? 400 : 200, rpcOut);
    } catch (err) {
      sendJson(res, 500, { ok: false, reason: err.message });
    }
    return;
  }

  // --------------------------------------------------------------------------
  // 4. EDGE FUNCTION: sync-profile & /api/supabase/bootstrap
  // --------------------------------------------------------------------------
  if (
    (pathname === '/functions/v1/sync-profile' || pathname === '/api/supabase/bootstrap') &&
    (req.method === 'POST' || req.method === 'GET')
  ) {
    try {
      const body = req.method === 'POST' ? await readJsonBody(req) : {};
      const clientKey =
        getClientKey(req, body) || parsedUrl.searchParams.get('clientKey') || '';
      const bundle = await fetchCloudBundle(clientKey, body.state || null);
      sendJson(res, 200, bundle);
    } catch (err) {
      sendJson(res, 500, { ok: false, error: err.message });
    }
    return;
  }

  // --------------------------------------------------------------------------
  // 5. EDGE FUNCTION: shop-transaction
  // --------------------------------------------------------------------------
  if (pathname === '/functions/v1/shop-transaction' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      const clientKey = getClientKey(req, body);
      const itemId = String(body.itemId || '').trim();
      const action = body.action === 'equip' ? 'equip' : 'buy';
      if (!pgPool || !clientKey || !itemId) {
        sendJson(res, 400, { ok: false, reason: 'Missing clientKey or itemId.' });
        return;
      }
      const sql =
        action === 'equip'
          ? 'SELECT public.rpc_equip_loadout_item($1, $2) AS res'
          : 'SELECT public.rpc_purchase_shop_item($1, $2) AS res';
      const q = await pgPool.query(sql, [clientKey, itemId]);
      sendJson(res, 200, q.rows[0]?.res || { ok: false });
    } catch (err) {
      sendJson(res, 500, { ok: false, reason: err.message });
    }
    return;
  }

  // --------------------------------------------------------------------------
  // 6. EDGE FUNCTION: telemetry-ingest (Events, Presence, & Runner Reset)
  // --------------------------------------------------------------------------
  if (pathname === '/functions/v1/telemetry-ingest' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      const clientKey = getClientKey(req, body);
      if (!pgPool || !clientKey) {
        sendJson(res, 400, { ok: false, error: 'Missing clientKey.' });
        return;
      }

      if (body.kind === 'presence') {
        const sessionId = String(
          body.sessionId || req.headers['x-exotic-session-id'] || clientKey
        ).slice(0, 96);
        const q = await pgPool.query(
          'SELECT public.rpc_heartbeat_presence($1, $2, $3::jsonb) AS res',
          [sessionId, clientKey, JSON.stringify(body.payload || {})]
        );
        sendJson(res, 200, q.rows[0]?.res || { ok: true });
        return;
      }

      if (body.event === 'reset_runner') {
        const q = await pgPool.query('SELECT public.rpc_reset_runner_data($1) AS snap', [
          clientKey
        ]);
        sendJson(res, 200, { ok: true, snapshot: q.rows[0]?.snap || null });
        return;
      }

      const eventName = String(body.event || '').trim();
      const q = await pgPool.query(
        'SELECT public.rpc_record_gameplay_event($1, $2, $3::jsonb) AS res',
        [clientKey, eventName, JSON.stringify(body.payload || {})]
      );
      sendJson(res, 200, q.rows[0]?.res || { ok: true });
    } catch (err) {
      sendJson(res, 500, { ok: false, error: err.message });
    }
    return;
  }

  // --------------------------------------------------------------------------
  // 7. EDGE FUNCTION: verify-and-submit-run & /api/leaderboard
  // --------------------------------------------------------------------------
  if (pathname === '/functions/v1/verify-and-submit-run' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      const clientKey = getClientKey(req, body);
      const callsign = String(body.callsign || '').trim().slice(0, 20);
      const levelId = Number(body.levelId);
      const timeMs = Math.round(Number(body.timeMs));
      const deaths = Math.max(0, Math.round(Number(body.deaths || 0)));

      if (body.publicShareConfirmed !== true) {
        sendJson(res, 403, {
          ok: false,
          code: 'SHARE_CONSENT_REQUIRED',
          reason: 'Public leaderboard sharing requires your confirmation.'
        });
        return;
      }

      if (!callsign || !Number.isFinite(levelId) || levelId < 1 || levelId > 8 || !Number.isFinite(timeMs) || timeMs < 500) {
        sendJson(res, 400, { ok: false, reason: 'Invalid run payload.' });
        return;
      }

      const hasFrames = Array.isArray(body.frames) && body.frames.length > 0;
      const safeName = callsign.replace(/[^a-zA-Z0-9_-]/g, '_') || 'runner';
      const relFile = hasFrames ? `stage-0${levelId}-${Date.now()}-${safeName}.json` : null;
      const replayStoragePath = relFile ? `/storage/v1/object/public/run-replays/${relFile}` : null;

      if (pgPool) {
        const stageQ = await pgPool.query(
          'SELECT width, spawn_x FROM public.levels_catalog WHERE id = $1',
          [levelId]
        );
        const st = stageQ.rows[0];
        if (st) {
          const minMs = Math.max(500, Math.floor(((Number(st.width) - Number(st.spawn_x) - 80) / 620) * 1000));
          if (timeMs < minMs) {
            sendJson(res, 422, {
              ok: false,
              reason: `Rejected by kinematic speed verifier (${timeMs}ms < ${minMs}ms).`
            });
            return;
          }
        }

        const q = await pgPool.query(
          'SELECT public.rpc_publish_verified_run($1, $2::jsonb) AS res',
          [
            clientKey || null,
            JSON.stringify({
              ...body,
              callsign,
              levelId,
              timeMs,
              deaths,
              publicShareConfirmed: true,
              replayStoragePath
            })
          ]
        );
        const rpcOut = q.rows[0]?.res || { ok: false };
        if (rpcOut.ok && rpcOut.record) {
          // Only write replay file after DB verifies auth + leaderboard_share_enabled + consent
          if (hasFrames && relFile) {
            try {
              const absFile = path.join(STORAGE_ROOT, 'run-replays', relFile);
              fs.writeFileSync(
                absFile,
                JSON.stringify({
                  levelId,
                  callsign,
                  timeMs,
                  deaths,
                  characterId: body.characterId || 'char_classic',
                  skinId: body.skinId || 'skin_solid',
                  auraId: body.auraId || 'aura_none',
                  sampleIntervalMs: body.sampleIntervalMs || 80,
                  frames: body.frames
                }),
                'utf8'
              );
            } catch {
              // Read-only serverless fs may skip local copy while DB row holds frames
            }
          }

          const runsRes = await pgPool.query(
            'SELECT * FROM public.leaderboard_runs ORDER BY time_ms ASC, deaths ASC LIMIT 120'
          );
          sendJson(res, 201, {
            ok: true,
            record: mapRunRow(rpcOut.record),
            runs: runsRes.rows.map(mapRunRow)
          });
          return;
        }
        sendJson(res, 403, rpcOut);
        return;
      }

      // Local fallback if DB unreachable (still gated by publicShareConfirmed === true above)
      const fallback = readFallbackRuns();
      const rec = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        callsign,
        levelId,
        levelTitle: String(body.levelTitle || `Level ${levelId}`).slice(0, 40),
        timeMs,
        deaths,
        coins: Math.max(0, Math.round(Number(body.coins || 0))),
        characterId: String(body.characterId || 'char_classic'),
        skinId: String(body.skinId || 'skin_solid'),
        auraId: String(body.auraId || 'aura_none'),
        recordedAt: new Date().toISOString()
      };
      fallback.push(rec);
      writeFallbackRuns(fallback);
      sendJson(res, 201, { ok: true, record: rec, runs: fallback });
    } catch (err) {
      sendJson(res, 500, { ok: false, reason: err.message });
    }
    return;
  }

  if (pathname === '/api/leaderboard') {
    if (req.method === 'GET') {
      if (pgPool) {
        try {
          const q = await pgPool.query(
            'SELECT * FROM public.leaderboard_runs ORDER BY time_ms ASC, deaths ASC LIMIT 120'
          );
          sendJson(res, 200, { runs: q.rows.map(mapRunRow) });
          return;
        } catch {
          // Fall through to local file
        }
      }
      sendJson(res, 200, { runs: readFallbackRuns() });
      return;
    }

    if (req.method === 'POST') {
      try {
        const body = await readJsonBody(req, 524288);
        const clientKey = getClientKey(req, body);
        const callsign = String(body.callsign || '').trim().slice(0, 20);
        const levelId = Number(body.levelId);
        const timeMs = Math.round(Number(body.timeMs));
        const deaths = Math.max(0, Math.round(Number(body.deaths || 0)));

        if (body.publicShareConfirmed !== true) {
          sendJson(res, 403, {
            ok: false,
            code: 'SHARE_CONSENT_REQUIRED',
            reason: 'Public leaderboard sharing requires your confirmation.'
          });
          return;
        }

        if (!callsign || !Number.isFinite(levelId) || levelId < 1 || levelId > 8 || !Number.isFinite(timeMs) || timeMs < 500) {
          sendJson(res, 400, { ok: false, error: 'Invalid run payload.' });
          return;
        }

        if (pgPool) {
          const q = await pgPool.query(
            'SELECT public.rpc_publish_verified_run($1, $2::jsonb) AS res',
            [
              clientKey || null,
              JSON.stringify({ ...body, callsign, levelId, timeMs, deaths, publicShareConfirmed: true })
            ]
          );
          const out = q.rows[0]?.res || { ok: false };
          if (!out.ok || !out.record) {
            sendJson(res, 403, out);
            return;
          }
          const runsQ = await pgPool.query(
            'SELECT * FROM public.leaderboard_runs ORDER BY time_ms ASC, deaths ASC LIMIT 120'
          );
          sendJson(res, 201, {
            ok: true,
            record: mapRunRow(out.record),
            runs: runsQ.rows.map(mapRunRow)
          });
          return;
        }

        const runs = readFallbackRuns();
        const record = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          callsign,
          levelId,
          levelTitle: String(body.levelTitle || `Level ${levelId}`).slice(0, 40),
          timeMs,
          deaths,
          coins: Math.max(0, Math.round(Number(body.coins || 0))),
          characterId: String(body.characterId || 'char_classic').slice(0, 32),
          recordedAt: new Date().toISOString()
        };
        runs.push(record);
        writeFallbackRuns(runs);
        sendJson(res, 201, { ok: true, record, runs });
      } catch {
        sendJson(res, 400, { ok: false, error: 'Malformed JSON.' });
      }
      return;
    }

    if (req.method === 'DELETE') {
      const clientKey = getClientKey(req, {});
      if (pgPool && clientKey) {
        try {
          await pgPool.query('SELECT public.rpc_reset_runner_data($1)', [clientKey]);
          const runsQ = await pgPool.query(
            'SELECT * FROM public.leaderboard_runs ORDER BY time_ms ASC, deaths ASC LIMIT 120'
          );
          sendJson(res, 200, { runs: runsQ.rows.map(mapRunRow) });
          return;
        } catch {
          // Fall through
        }
      }
      writeFallbackRuns([]);
      sendJson(res, 200, { runs: [] });
      return;
    }
  }

  // --------------------------------------------------------------------------
  // 8b. BRAWL MODE ONLINE ROOMS & MATCH RESULTS (/api/brawl/*)
  // --------------------------------------------------------------------------
  if (pathname === '/api/brawl/result' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      const clientKey = getClientKey(req, body);
      if (!pgPool || !clientKey) {
        sendJson(res, 200, { ok: false, reason: 'Missing clientKey.' });
        return;
      }
      const won = Boolean(body.won);
      const kos = Math.max(0, Math.min(20, Math.round(Number(body.kos) || 0)));
      const coinsReward = Math.max(0, Math.min(30, Math.round(Number(body.coinsReward) || 0)));
      const q = await pgPool.query(
        'SELECT public.rpc_record_brawl_result($1, $2, $3, $4) AS res',
        [clientKey, won, kos, coinsReward]
      );
      sendJson(res, 200, q.rows[0]?.res || { ok: true });
    } catch (err) {
      sendJson(res, 500, { ok: false, reason: err.message });
    }
    return;
  }

  if (pathname === '/api/brawl/rooms' && (req.method === 'GET' || req.method === 'POST')) {
    if (!pgPool) {
      sendJson(res, 200, { ok: false, rooms: [], reason: 'Backend unavailable.' });
      return;
    }
    try {
      // Purge stale abandoned rooms older than 12 minutes
      await pgPool.query(
        `DELETE FROM public.brawl_rooms WHERE updated_at < now() - interval '12 minutes'`
      );

      if (req.method === 'GET') {
        const code = String(parsedUrl.searchParams.get('code') || '')
          .trim()
          .toUpperCase();
        if (code) {
          const r = await pgPool.query(
            `SELECT * FROM public.brawl_rooms WHERE room_code = $1 LIMIT 1`,
            [code]
          );
          sendJson(res, 200, { ok: true, room: r.rows[0] || null });
          return;
        }
        const list = await pgPool.query(
          `SELECT room_code, status, map_id, stocks, host_username, host_loadout, guest_username, created_at, updated_at
           FROM public.brawl_rooms
           WHERE status = 'waiting'
             AND updated_at > now() - interval '90 seconds'
           ORDER BY updated_at DESC
           LIMIT 12`
        );
        sendJson(res, 200, { ok: true, rooms: list.rows || [] });
        return;
      }

      const body = await readJsonBody(req);
      const action = String(body.action || '').trim();
      const clientKey = getClientKey(req, body);
      const username = String(body.username || 'Fighter')
        .replace(/[^A-Za-z0-9_]/g, '')
        .slice(0, 20) || 'Fighter';

      if (action === 'create') {
        if (!clientKey) {
          sendJson(res, 400, { ok: false, reason: 'Missing session.' });
          return;
        }
        const mapId = String(body.mapId || 'brawl_map_haven').slice(0, 48);
        const stocks = Math.max(1, Math.min(5, Math.round(Number(body.stocks) || 3)));
        const loadout = body.loadout && typeof body.loadout === 'object' ? body.loadout : {};

        await pgPool.query(
          `DELETE FROM public.brawl_rooms WHERE host_client_key = $1 AND status = 'waiting'`,
          [clientKey]
        );

        const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let roomCode = '';
        for (let attempt = 0; attempt < 6; attempt++) {
          let cand = '';
          const bytes = nodeCrypto.randomBytes(6);
          for (let i = 0; i < 6; i++) cand += alphabet[bytes[i] % alphabet.length];
          const exists = await pgPool.query(
            `SELECT 1 FROM public.brawl_rooms WHERE room_code = $1`,
            [cand]
          );
          if (exists.rows.length === 0) {
            roomCode = cand;
            break;
          }
        }
        if (!roomCode) roomCode = 'BR' + Date.now().toString(36).slice(-4).toUpperCase();

        const ins = await pgPool.query(
          `INSERT INTO public.brawl_rooms (
             room_code, status, map_id, stocks, host_client_key, host_username, host_loadout, host_seen_at, updated_at
           ) VALUES ($1, 'waiting', $2, $3, $4, $5, $6::jsonb, now(), now())
           RETURNING *`,
          [roomCode, mapId, stocks, clientKey, username, JSON.stringify(loadout)]
        );
        sendJson(res, 200, { ok: true, slot: 0, room: ins.rows[0] });
        return;
      }

      if (action === 'join') {
        const roomCode = String(body.roomCode || '')
          .trim()
          .toUpperCase();
        if (!clientKey || !roomCode) {
          sendJson(res, 400, { ok: false, reason: 'Enter a valid 6-character room code.' });
          return;
        }
        const loadout = body.loadout && typeof body.loadout === 'object' ? body.loadout : {};
        const cur = await pgPool.query(
          `SELECT * FROM public.brawl_rooms WHERE room_code = $1 LIMIT 1`,
          [roomCode]
        );
        const room = cur.rows[0];
        if (!room) {
          sendJson(res, 200, { ok: false, reason: 'Room code not found or expired.' });
          return;
        }
        if (room.host_client_key === clientKey) {
          sendJson(res, 200, { ok: true, slot: 0, room });
          return;
        }
        if (room.guest_client_key && room.guest_client_key !== clientKey && room.status !== 'waiting') {
          sendJson(res, 200, { ok: false, reason: 'This room is already full.' });
          return;
        }
        const upd = await pgPool.query(
          `UPDATE public.brawl_rooms
           SET status = 'active',
               guest_client_key = $2,
               guest_username = $3,
               guest_loadout = $4::jsonb,
               guest_seen_at = now(),
               updated_at = now()
           WHERE room_code = $1
           RETURNING *`,
          [roomCode, clientKey, username, JSON.stringify(loadout)]
        );
        sendJson(res, 200, { ok: true, slot: 1, room: upd.rows[0] });
        return;
      }

      if (action === 'sync') {
        const roomCode = String(body.roomCode || '')
          .trim()
          .toUpperCase();
        const slot = Number(body.slot) === 1 ? 1 : 0;
        const fighterState =
          body.fighterState && typeof body.fighterState === 'object' ? body.fighterState : {};
        const worldState =
          body.worldState && typeof body.worldState === 'object' ? body.worldState : null;
        const winnerSlot =
          typeof body.winnerSlot === 'number' ? Math.round(body.winnerSlot) : null;

        let upd;
        if (slot === 0) {
          upd = await pgPool.query(
            `UPDATE public.brawl_rooms
             SET host_state = $2::jsonb,
                 host_seen_at = now(),
                 world_state = COALESCE($3::jsonb, world_state),
                 winner_slot = COALESCE($4, winner_slot),
                 status = CASE WHEN $4 IS NOT NULL THEN 'finished' ELSE status END,
                 updated_at = now()
             WHERE room_code = $1 AND host_client_key = $5
             RETURNING *`,
            [
              roomCode,
              JSON.stringify(fighterState),
              worldState ? JSON.stringify(worldState) : null,
              winnerSlot,
              clientKey
            ]
          );
        } else {
          upd = await pgPool.query(
            `UPDATE public.brawl_rooms
             SET guest_state = $2::jsonb,
                 guest_seen_at = now(),
                 winner_slot = COALESCE($3, winner_slot),
                 status = CASE WHEN $3 IS NOT NULL THEN 'finished' ELSE status END,
                 updated_at = now()
             WHERE room_code = $1 AND guest_client_key = $4
             RETURNING *`,
            [roomCode, JSON.stringify(fighterState), winnerSlot, clientKey]
          );
        }
        sendJson(res, 200, { ok: true, room: upd.rows[0] || null });
        return;
      }

      if (action === 'leave') {
        const roomCode = String(body.roomCode || '')
          .trim()
          .toUpperCase();
        if (roomCode && clientKey) {
          await pgPool.query(
            `DELETE FROM public.brawl_rooms
             WHERE room_code = $1 AND (host_client_key = $2 OR guest_client_key = $2)`,
            [roomCode, clientKey]
          );
        }
        sendJson(res, 200, { ok: true });
        return;
      }

      sendJson(res, 400, { ok: false, reason: 'Unknown room action.' });
    } catch (err) {
      sendJson(res, 500, { ok: false, reason: err.message });
    }
    return;
  }

  // --------------------------------------------------------------------------
  // 8. GHOST REPLAY FETCHER (/api/replays)
  // --------------------------------------------------------------------------
  if (pathname === '/api/replays' && req.method === 'GET') {
    if (!pgPool) {
      sendJson(res, 200, { replay: null });
      return;
    }
    try {
      const runId = parsedUrl.searchParams.get('runId');
      const levelId = Number(parsedUrl.searchParams.get('levelId'));
      let q;
      if (runId) {
        q = await pgPool.query('SELECT * FROM public.run_replays WHERE run_id = $1 LIMIT 1', [
          runId
        ]);
      } else if (Number.isFinite(levelId) && levelId >= 1 && levelId <= 8) {
        q = await pgPool.query(
          'SELECT * FROM public.run_replays WHERE level_id = $1 ORDER BY time_ms ASC, created_at DESC LIMIT 1',
          [levelId]
        );
      } else {
        sendJson(res, 200, { replay: null });
        return;
      }
      const row = q.rows[0];
      sendJson(res, 200, {
        replay: row
          ? {
              id: row.id,
              runId: row.run_id,
              levelId: Number(row.level_id),
              callsign: row.callsign,
              timeMs: Number(row.time_ms),
              deaths: Number(row.deaths),
              characterId: row.character_id,
              skinId: row.skin_id,
              auraId: row.aura_id,
              sampleIntervalMs: Number(row.sample_interval_ms || 80),
              frames: Array.isArray(row.frames_inline) ? row.frames_inline : []
            }
          : null
      });
    } catch (err) {
      sendJson(res, 500, { replay: null, error: err.message });
    }
    return;
  }

  // --------------------------------------------------------------------------
  // 9. EDGE FUNCTION: storage-upload-card & PUBLIC BUCKET SERVING
  // --------------------------------------------------------------------------
  if (pathname === '/functions/v1/storage-upload-card' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req, 5 * 1024 * 1024);
      const clientKey = getClientKey(req, body);
      const bucket = STORAGE_BUCKETS.includes(body.bucket) ? body.bucket : 'runner-cards';
      const rawData = typeof body.data === 'string' ? body.data : JSON.stringify(body.data || {});

      let buf;
      let ext = 'json';
      let mime = 'application/json';
      const m = /^data:([^;]+);base64,(.+)$/.exec(rawData);
      if (m) {
        mime = m[1];
        buf = Buffer.from(m[2], 'base64');
        ext = mime.includes('png') ? 'png' : mime.includes('svg') ? 'svg' : 'bin';
      } else {
        buf = Buffer.from(rawData, 'utf8');
      }

      const safeKey = (clientKey || 'runner').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32);
      const fileName = `${safeKey}-${Date.now()}.${ext}`;
      try {
        const localPath = path.join(STORAGE_ROOT, bucket, fileName);
        fs.writeFileSync(localPath, buf);
      } catch {
        // Ignore on stateless runtime
      }

      let publicUrl = IS_VERCEL
        ? `data:${mime};base64,${buf.toString('base64')}`
        : `/storage/v1/object/public/${bucket}/${fileName}`;

      // If SUPABASE_ANON_KEY is available, also mirror directly into Supabase Storage object REST endpoint
      if (runtimeAnonKey) {
        try {
          const sbRes = await fetch(
            `${SUPABASE_URL}/storage/v1/object/${bucket}/${safeKey}/${fileName}`,
            {
              method: 'POST',
              headers: {
                apikey: runtimeAnonKey,
                Authorization: `Bearer ${runtimeAnonKey}`,
                'Content-Type': mime,
                'x-upsert': 'true'
              },
              body: buf
            }
          );
          if (sbRes.ok) {
            publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${safeKey}/${fileName}`;
          }
        } catch {
          // Keep local mirror URL
        }
      }

      if (pgPool && clientKey) {
        await pgPool.query('SELECT public.rpc_sync_runner_state($1, NULL)', [clientKey]);
        if (bucket === 'runner-cards') {
          await pgPool.query(
            'UPDATE public.profiles SET runner_card_path = $1 WHERE client_key = $2',
            [publicUrl, clientKey]
          );
        } else if (bucket === 'runner-avatars') {
          await pgPool.query(
            'UPDATE public.profiles SET avatar_storage_path = $1 WHERE client_key = $2',
            [publicUrl, clientKey]
          );
        }
        const profQ = await pgPool.query(
          'SELECT id, callsign FROM public.profiles WHERE client_key = $1 LIMIT 1',
          [clientKey]
        );
        const prof = profQ.rows[0];
        if (prof) {
          const cName = (prof.callsign || '').trim() || 'Runner';
          await pgPool.query(
            `INSERT INTO public.realtime_activity_feed (profile_id, callsign, event_type, headline, detail, payload)
             VALUES ($1, $2, 'runner_card_uploaded', $3, $4, $5::jsonb)`,
            [
              prof.id,
              cName,
              `${cName} minted a Runner Loadout Card`,
              `Bucket: ${bucket}`,
              JSON.stringify({ bucket, publicUrl })
            ]
          );
        }
      }

      broadcastSse('storage_changes', {
        bucket,
        path: fileName,
        publicUrl,
        clientKey,
        createdAt: new Date().toISOString()
      });

      sendJson(res, 200, { ok: true, bucket, path: fileName, publicUrl });
    } catch (err) {
      sendJson(res, 500, { ok: false, error: err.message });
    }
    return;
  }

  if (pathname.startsWith('/storage/v1/object/public/') && req.method === 'GET') {
    const rest = pathname.slice('/storage/v1/object/public/'.length);
    const slash = rest.indexOf('/');
    if (slash > 0) {
      const bucket = rest.slice(0, slash);
      const filePart = path.basename(rest.slice(slash + 1));
      if (STORAGE_BUCKETS.includes(bucket) && filePart) {
        const target = path.join(STORAGE_ROOT, bucket, filePart);
        if (fs.existsSync(target)) {
          const ext = path.extname(target).toLowerCase();
          res.writeHead(200, {
            'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
            'Cache-Control': 'public, max-age=3600',
            'Access-Control-Allow-Origin': '*'
          });
          res.end(fs.readFileSync(target));
          return;
        }
      }
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Storage object not found');
    return;
  }

  // --------------------------------------------------------------------------
  // 10. STATIC ASSET SERVING (HTML, CSS, Vanilla JS)
  // --------------------------------------------------------------------------
  let relativePath =
    pathname === '/'
      ? '/index.html'
      : pathname === '/favicon.ico'
      ? '/favicon.svg'
      : pathname;
  const resolvedPath = path.normalize(path.join(ROOT_DIR, relativePath));

  if (
    !resolvedPath.startsWith(ROOT_DIR) ||
    pathname.startsWith('/.env') ||
    pathname.startsWith('/.git') ||
    pathname.startsWith('/supabase')
  ) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  fs.stat(resolvedPath, (err, stats) => {
    let targetFile = resolvedPath;
    if (err || stats.isDirectory()) {
      targetFile = path.join(ROOT_DIR, 'index.html');
    }

    fs.readFile(targetFile, (readErr, content) => {
      if (readErr) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not Found');
        return;
      }

      const ext = path.extname(targetFile).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Access-Control-Allow-Origin': '*',
        'Permissions-Policy':
          'publickey-credentials-get=*, publickey-credentials-create=*, camera=*'
      });
      res.end(content);
    });
  });
}

if (require.main === module && !IS_VERCEL) {
  startKeepaliveTimer();
  startRealtimeListener();
  const server = http.createServer(handleRequest);
  server.listen(PORT, HOST, () => {
    console.log(`Exotic Live Cloud server listening on http://${HOST}:${PORT}`);
  });
}

module.exports = handleRequest;
