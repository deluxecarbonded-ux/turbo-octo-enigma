const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 8080;
const HOST = '0.0.0.0';
const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, 'data');
const RUNS_FILE = path.join(DATA_DIR, 'runs.json');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

function ensureRunsFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(RUNS_FILE)) {
    fs.writeFileSync(RUNS_FILE, '[]\n', 'utf8');
  }
}

function readRuns() {
  ensureRunsFile();
  try {
    const raw = fs.readFileSync(RUNS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRuns(runs) {
  ensureRunsFile();
  fs.writeFileSync(RUNS_FILE, JSON.stringify(runs, null, 2) + '\n', 'utf8');
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(parsedUrl.pathname);

  if (pathname === '/api/leaderboard') {
    if (req.method === 'GET') {
      const runs = readRuns();
      sendJson(res, 200, { runs });
      return;
    }

    if (req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
        if (body.length > 32768) {
          req.destroy();
        }
      });
      req.on('end', () => {
        try {
          const entry = JSON.parse(body || '{}');
          const callsign = String(entry.callsign || '').trim().slice(0, 20);
          const levelId = Number(entry.levelId);
          const timeMs = Number(entry.timeMs);
          const deaths = Number(entry.deaths);
          const coins = Number(entry.coins || 0);
          const characterId = String(entry.characterId || 'char_classic').slice(0, 32);

          if (!callsign || !Number.isFinite(levelId) || levelId < 1 || levelId > 8 || !Number.isFinite(timeMs) || timeMs < 500 || !Number.isFinite(deaths) || deaths < 0) {
            sendJson(res, 400, { error: 'Invalid run payload.' });
            return;
          }

          const runs = readRuns();
          const record = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            callsign,
            levelId,
            levelTitle: String(entry.levelTitle || `Level ${levelId}`).slice(0, 40),
            timeMs: Math.round(timeMs),
            deaths: Math.max(0, Math.round(deaths)),
            coins: Math.max(0, Math.round(coins)),
            characterId,
            recordedAt: new Date().toISOString()
          };

          runs.push(record);
          if (runs.length > 500) {
            runs.splice(0, runs.length - 500);
          }
          writeRuns(runs);
          sendJson(res, 201, { record, runs });
        } catch {
          sendJson(res, 400, { error: 'Malformed JSON.' });
        }
      });
      return;
    }

    if (req.method === 'DELETE') {
      writeRuns([]);
      sendJson(res, 200, { runs: [] });
      return;
    }

    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  let relativePath = pathname === '/' ? '/index.html' : pathname;
  const resolvedPath = path.normalize(path.join(ROOT_DIR, relativePath));

  if (!resolvedPath.startsWith(ROOT_DIR)) {
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
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(content);
    });
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Exotic server listening on http://${HOST}:${PORT}`);
});
