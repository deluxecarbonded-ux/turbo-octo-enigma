const net = require('net');
const tls = require('tls');
const crypto = require('crypto');
const { EventEmitter } = require('events');

function cstr(str) {
  return Buffer.concat([Buffer.from(String(str), 'utf8'), Buffer.from([0])]);
}

function buildFrame(typeChar, payloadBuf) {
  const len = payloadBuf.length + 4;
  const header = Buffer.alloc(5);
  header.write(typeChar, 0, 1, 'ascii');
  header.writeInt32BE(len, 1);
  return Buffer.concat([header, payloadBuf]);
}

function hmacSha256(key, msg) {
  return crypto.createHmac('sha256', key).update(msg).digest();
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest();
}

function xorBuffers(a, b) {
  const out = Buffer.alloc(a.length);
  for (let i = 0; i < a.length; i++) {
    out[i] = a[i] ^ b[i];
  }
  return out;
}

function parsePgValue(rawStr, typeOid) {
  if (rawStr === null) return null;
  switch (typeOid) {
    case 16: // bool
      return rawStr === 't' || rawStr === 'true';
    case 20: // int8
    case 21: // int2
    case 23: { // int4
      const n = Number(rawStr);
      return Number.isSafeInteger(n) ? n : rawStr;
    }
    case 700: // float4
    case 701: // float8
    case 1700: // numeric
      return Number(rawStr);
    case 114: // json
    case 3802: // jsonb
      try {
        return JSON.parse(rawStr);
      } catch {
        return rawStr;
      }
    case 1009: { // _text (text[])
      if (rawStr === '{}') return [];
      const inner = rawStr.slice(1, -1);
      if (!inner) return [];
      const items = [];
      let cur = '';
      let inQuotes = false;
      for (let i = 0; i < inner.length; i++) {
        const ch = inner[i];
        if (ch === '\\' && inQuotes && i + 1 < inner.length) {
          cur += inner[++i];
        } else if (ch === '"') {
          inQuotes = !inQuotes;
        } else if (ch === ',' && !inQuotes) {
          items.push(cur);
          cur = '';
        } else {
          cur += ch;
        }
      }
      items.push(cur);
      return items;
    }
    default:
      return rawStr;
  }
}

function serializeParam(val) {
  if (val === undefined || val === null) return null;
  if (typeof val === 'boolean') return val ? 'true' : 'false';
  if (typeof val === 'number') return String(val);
  if (val instanceof Date) return val.toISOString();
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

class PgWireClient extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.socket = null;
    this.connected = false;
    this.closed = false;
    this.rxBuffer = Buffer.alloc(0);

    this.scram = null;
    this.connectResolve = null;
    this.connectReject = null;

    this.queue = [];
    this.activeOp = null;
  }

  connect() {
    if (this.connected) return Promise.resolve(this);
    return new Promise((resolve, reject) => {
      this.connectResolve = resolve;
      this.connectReject = reject;

      const rawSock = net.createConnection({
        host: this.config.host,
        port: Number(this.config.port || 5432)
      });

      rawSock.setTimeout(10000);
      rawSock.once('timeout', () => {
        rawSock.destroy(new Error('PostgreSQL TCP connection timeout'));
      });

      rawSock.once('error', (err) => {
        if (this.connectReject) {
          const rj = this.connectReject;
          this.connectResolve = null;
          this.connectReject = null;
          rj(err);
        }
      });

      rawSock.once('connect', () => {
        rawSock.setTimeout(0);
        rawSock.setKeepAlive(true, 15000);
        // Send PostgreSQL SSLRequest (length=8, code=80877103)
        const sslReq = Buffer.alloc(8);
        sslReq.writeInt32BE(8, 0);
        sslReq.writeInt32BE(80877103, 4);
        rawSock.write(sslReq);

        rawSock.once('data', (chunk) => {
          const code = chunk[0];
          if (code !== 0x53) {
            // 'S' means SSL supported
            rawSock.destroy();
            if (this.connectReject) {
              this.connectReject(new Error('Server rejected TLS upgrade'));
            }
            return;
          }

          const tlsSock = tls.connect({
            socket: rawSock,
            servername: this.config.host,
            rejectUnauthorized: false
          });

          this.socket = tlsSock;

          tlsSock.on('data', (data) => this._onData(data));
          tlsSock.on('error', (err) => this._onSocketFatal(err));
          tlsSock.on('close', () => this._onSocketFatal(new Error('PostgreSQL connection closed')));

          tlsSock.once('secureConnect', () => {
            this._sendStartup();
          });
        });
      });
    });
  }

  _sendStartup() {
    const params = Buffer.concat([
      cstr('user'),
      cstr(this.config.user),
      cstr('database'),
      cstr(this.config.database || 'postgres'),
      cstr('application_name'),
      cstr(this.config.applicationName || 'exotic_live_cloud'),
      cstr('client_encoding'),
      cstr('UTF8'),
      Buffer.from([0])
    ]);
    const startup = Buffer.alloc(8 + params.length);
    startup.writeInt32BE(8 + params.length, 0);
    startup.writeInt32BE(196608, 4); // Protocol v3.0
    params.copy(startup, 8);
    this.socket.write(startup);
  }

  _onData(chunk) {
    this.rxBuffer = Buffer.concat([this.rxBuffer, chunk]);
    while (this.rxBuffer.length >= 5) {
      const msgType = String.fromCharCode(this.rxBuffer[0]);
      const msgLen = this.rxBuffer.readInt32BE(1);
      if (this.rxBuffer.length < 1 + msgLen) break;

      const body = this.rxBuffer.subarray(5, 1 + msgLen);
      this.rxBuffer = this.rxBuffer.subarray(1 + msgLen);
      this._handleBackendMessage(msgType, body);
    }
  }

  _handleBackendMessage(type, body) {
    if (type === 'A') {
      // NotificationResponse: Int32(pid) + cstr(channel) + cstr(payload)
      const pid = body.readInt32BE(0);
      const firstNull = body.indexOf(0, 4);
      const channel = body.subarray(4, firstNull).toString('utf8');
      const secondNull = body.indexOf(0, firstNull + 1);
      const payload = body
        .subarray(firstNull + 1, secondNull >= 0 ? secondNull : body.length)
        .toString('utf8');
      this.emit('notification', { pid, channel, payload });
      return;
    }

    if (type === 'N' || type === 'S' || type === 'K' || type === '1' || type === '2' || type === 'n') {
      return;
    }

    if (type === 'R') {
      this._handleAuth(body);
      return;
    }

    if (type === 'T') {
      // RowDescription
      if (this.activeOp) {
        const fieldCount = body.readInt16BE(0);
        let offset = 2;
        const fields = [];
        for (let i = 0; i < fieldCount; i++) {
          const end = body.indexOf(0, offset);
          const name = body.subarray(offset, end).toString('utf8');
          offset = end + 1;
          const typeOid = body.readInt32BE(offset + 6);
          offset += 18;
          fields.push({ name, typeOid });
        }
        this.activeOp.fields = fields;
      }
      return;
    }

    if (type === 'D') {
      // DataRow
      if (this.activeOp && this.activeOp.fields) {
        const colCount = body.readInt16BE(0);
        let offset = 2;
        const row = {};
        for (let i = 0; i < colCount; i++) {
          const len = body.readInt32BE(offset);
          offset += 4;
          const field = this.activeOp.fields[i];
          if (len === -1) {
            row[field.name] = null;
          } else {
            const rawVal = body.subarray(offset, offset + len).toString('utf8');
            offset += len;
            row[field.name] = parsePgValue(rawVal, field.typeOid);
          }
        }
        this.activeOp.rows.push(row);
      }
      return;
    }

    if (type === 'C') {
      // CommandComplete
      if (this.activeOp) {
        const end = body.indexOf(0);
        this.activeOp.command = body.subarray(0, end >= 0 ? end : body.length).toString('utf8');
      }
      return;
    }

    if (type === 'E') {
      // ErrorResponse
      const errInfo = {};
      let offset = 0;
      while (offset < body.length && body[offset] !== 0) {
        const code = String.fromCharCode(body[offset++]);
        const end = body.indexOf(0, offset);
        errInfo[code] = body.subarray(offset, end).toString('utf8');
        offset = end + 1;
      }
      const err = new Error(errInfo.M || 'PostgreSQL error');
      err.code = errInfo.C;
      err.detail = errInfo.D;

      if (!this.connected && this.connectReject) {
        const rj = this.connectReject;
        this.connectResolve = null;
        this.connectReject = null;
        rj(err);
      } else if (this.activeOp) {
        this.activeOp.error = err;
      }
      return;
    }

    if (type === 'Z') {
      // ReadyForQuery
      if (!this.connected) {
        this.connected = true;
        if (this.connectResolve) {
          const rs = this.connectResolve;
          this.connectResolve = null;
          this.connectReject = null;
          rs(this);
        }
        this._pumpQueue();
        return;
      }

      if (this.activeOp) {
        const finished = this.activeOp;
        this.activeOp = null;
        if (finished.error) {
          finished.reject(finished.error);
        } else {
          finished.resolve({
            rows: finished.rows,
            rowCount: finished.rows.length,
            command: finished.command
          });
        }
      }
      this._pumpQueue();
    }
  }

  _handleAuth(body) {
    const authType = body.readInt32BE(0);
    if (authType === 0) {
      // AuthenticationOk
      return;
    }

    if (authType === 3) {
      // CleartextPassword
      this.socket.write(buildFrame('p', cstr(this.config.password)));
      return;
    }

    if (authType === 10) {
      // AuthenticationSASL (SCRAM-SHA-256)
      const clientNonce = crypto.randomBytes(18).toString('base64');
      const clientFirstBare = `n=*,r=${clientNonce}`;
      const clientFirst = `n,,${clientFirstBare}`;
      this.scram = { clientNonce, clientFirstBare };

      const mech = cstr('SCRAM-SHA-256');
      const cfBuf = Buffer.from(clientFirst, 'utf8');
      const lenBuf = Buffer.alloc(4);
      lenBuf.writeInt32BE(cfBuf.length, 0);
      this.socket.write(buildFrame('p', Buffer.concat([mech, lenBuf, cfBuf])));
      return;
    }

    if (authType === 11) {
      // AuthenticationSASLContinue
      const serverFirst = body.subarray(4).toString('utf8');
      const parts = {};
      for (const seg of serverFirst.split(',')) {
        const eq = seg.indexOf('=');
        if (eq > 0) parts[seg.slice(0, eq)] = seg.slice(eq + 1);
      }
      const combinedNonce = parts.r || '';
      const salt = Buffer.from(parts.s || '', 'base64');
      const iterations = parseInt(parts.i || '4096', 10);

      if (!combinedNonce.startsWith(this.scram.clientNonce)) {
        throw new Error('SCRAM server nonce mismatch');
      }

      const saltedPassword = crypto.pbkdf2Sync(
        Buffer.from(String(this.config.password), 'utf8'),
        salt,
        iterations,
        32,
        'sha256'
      );
      const clientKey = hmacSha256(saltedPassword, 'Client Key');
      const storedKey = sha256(clientKey);
      const clientFinalWithoutProof = `c=biws,r=${combinedNonce}`;
      const authMessage = `${this.scram.clientFirstBare},${serverFirst},${clientFinalWithoutProof}`;
      const clientSignature = hmacSha256(storedKey, authMessage);
      const clientProof = xorBuffers(clientKey, clientSignature).toString('base64');
      const clientFinal = `${clientFinalWithoutProof},p=${clientProof}`;

      this.socket.write(buildFrame('p', Buffer.from(clientFinal, 'utf8')));
      return;
    }

    if (authType === 12) {
      // AuthenticationSASLFinal
      return;
    }
  }

  query(sql, params = []) {
    if (this.closed) {
      return Promise.reject(new Error('Client is closed'));
    }
    return new Promise((resolve, reject) => {
      this.queue.push({
        sql,
        params,
        rows: [],
        fields: null,
        command: '',
        error: null,
        resolve,
        reject
      });
      if (this.connected && !this.activeOp) {
        this._pumpQueue();
      }
    });
  }

  _pumpQueue() {
    if (!this.connected || this.activeOp || this.queue.length === 0) return;
    const op = this.queue.shift();
    this.activeOp = op;

    if (!op.params || op.params.length === 0) {
      // Simple Query ('Q')
      this.socket.write(buildFrame('Q', cstr(op.sql)));
      return;
    }

    // Extended Query Pipeline: Parse ('P') + Bind ('B') + Describe ('D') + Execute ('E') + Sync ('S')
    const parsePayload = Buffer.concat([
      cstr(''), // unnamed statement
      cstr(op.sql),
      Buffer.from([0, 0]) // 0 pre-specified param OIDs
    ]);

    const paramParts = [];
    const headerCounts = Buffer.alloc(4);
    headerCounts.writeInt16BE(0, 0); // 0 format codes (all text)
    headerCounts.writeInt16BE(op.params.length, 2);
    paramParts.push(headerCounts);

    for (const rawParam of op.params) {
      const strVal = serializeParam(rawParam);
      if (strVal === null) {
        const nullLen = Buffer.alloc(4);
        nullLen.writeInt32BE(-1, 0);
        paramParts.push(nullLen);
      } else {
        const valBuf = Buffer.from(strVal, 'utf8');
        const valLen = Buffer.alloc(4);
        valLen.writeInt32BE(valBuf.length, 0);
        paramParts.push(valLen, valBuf);
      }
    }

    const resultFormatCount = Buffer.alloc(2);
    resultFormatCount.writeInt16BE(0, 0); // all result cols text format

    const bindPayload = Buffer.concat([
      cstr(''), // unnamed portal
      cstr(''), // unnamed statement
      ...paramParts,
      resultFormatCount
    ]);

    const describePayload = Buffer.concat([Buffer.from('P', 'ascii'), cstr('')]);
    const execMaxRows = Buffer.alloc(4);
    execMaxRows.writeInt32BE(0, 0);
    const executePayload = Buffer.concat([cstr(''), execMaxRows]);

    this.socket.write(
      Buffer.concat([
        buildFrame('P', parsePayload),
        buildFrame('B', bindPayload),
        buildFrame('D', describePayload),
        buildFrame('E', executePayload),
        buildFrame('S', Buffer.alloc(0))
      ])
    );
  }

  _onSocketFatal(err) {
    const wasConnected = this.connected;
    this.connected = false;

    if (this.connectReject) {
      const rj = this.connectReject;
      this.connectResolve = null;
      this.connectReject = null;
      rj(err);
    }

    if (this.activeOp) {
      const op = this.activeOp;
      this.activeOp = null;
      op.reject(err);
    }

    while (this.queue.length > 0) {
      const q = this.queue.shift();
      q.reject(err);
    }

    if (wasConnected && !this.closed) {
      this.emit('disconnect', err);
    }
  }

  close() {
    this.closed = true;
    if (this.socket) {
      try {
        this.socket.write(buildFrame('X', Buffer.alloc(0)));
        this.socket.end();
      } catch {
        // Ignore close errors
      }
    }
  }
}

class PgConnectionPool {
  constructor(config, maxSize = 3) {
    this.config = config;
    this.maxSize = maxSize;
    this.clients = [];
  }

  async _getClient() {
    for (const c of this.clients) {
      if (c.connected && !c.activeOp && c.queue.length === 0) {
        return c;
      }
    }
    if (this.clients.length < this.maxSize) {
      const c = new PgWireClient(this.config);
      c.on('disconnect', () => {
        const idx = this.clients.indexOf(c);
        if (idx >= 0) this.clients.splice(idx, 1);
      });
      await c.connect();
      this.clients.push(c);
      return c;
    }
    const pick = this.clients[Math.floor(Math.random() * this.clients.length)];
    if (!pick.connected) {
      const idx = this.clients.indexOf(pick);
      if (idx >= 0) this.clients.splice(idx, 1);
      return this._getClient();
    }
    return pick;
  }

  async query(sql, params = []) {
    const client = await this._getClient();
    return client.query(sql, params);
  }
}

function parsePostgresUrl(rawUrl, fallback = {}) {
  if (!rawUrl) return fallback;
  try {
    const u = new URL(rawUrl);
    return {
      host: u.hostname,
      port: Number(u.port || 5432),
      user: decodeURIComponent(u.username || fallback.user || 'postgres'),
      password: decodeURIComponent(u.password || fallback.password || ''),
      database: decodeURIComponent((u.pathname || '/postgres').replace(/^\//, '') || 'postgres')
    };
  } catch {
    return fallback;
  }
}

module.exports = {
  PgWireClient,
  PgConnectionPool,
  parsePostgresUrl
};
