const crypto = require('crypto');

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const challenges = new Map();

function pruneChallenges() {
  const now = Date.now();
  for (const [k, exp] of challenges.entries()) {
    if (exp <= now) challenges.delete(k);
  }
}

function createChallenge() {
  pruneChallenges();
  const challenge = crypto.randomBytes(32).toString('base64url');
  challenges.set(challenge, Date.now() + CHALLENGE_TTL_MS);
  return challenge;
}

function consumeChallenge(challenge) {
  pruneChallenges();
  if (!challenge || typeof challenge !== 'string') return false;
  const exp = challenges.get(challenge);
  if (!exp) return false;
  challenges.delete(challenge);
  return exp > Date.now();
}

function fromBase64Url(str) {
  if (!str || typeof str !== 'string') return Buffer.alloc(0);
  return Buffer.from(str, 'base64url');
}

// Minimal RFC 8949 CBOR decoder for WebAuthn attestationObject & COSE_Key fallback
function decodeCborItem(buf, offset = 0) {
  if (offset >= buf.length) throw new Error('CBOR unexpected EOF');
  const first = buf[offset++];
  const major = first >> 5;
  const info = first & 0x1f;

  function readLength() {
    if (info < 24) return info;
    if (info === 24) return buf[offset++];
    if (info === 25) {
      const v = buf.readUInt16BE(offset);
      offset += 2;
      return v;
    }
    if (info === 26) {
      const v = buf.readUInt32BE(offset);
      offset += 4;
      return v;
    }
    if (info === 27) {
      const hi = buf.readUInt32BE(offset);
      const lo = buf.readUInt32BE(offset + 4);
      offset += 8;
      return hi * 0x100000000 + lo;
    }
    throw new Error('Unsupported CBOR indefinite length');
  }

  if (major === 0) {
    return { value: readLength(), offset };
  }
  if (major === 1) {
    return { value: -1 - readLength(), offset };
  }
  if (major === 2) {
    const len = readLength();
    const slice = buf.subarray(offset, offset + len);
    offset += len;
    return { value: Buffer.from(slice), offset };
  }
  if (major === 3) {
    const len = readLength();
    const str = buf.subarray(offset, offset + len).toString('utf8');
    offset += len;
    return { value: str, offset };
  }
  if (major === 4) {
    const len = readLength();
    const arr = [];
    for (let i = 0; i < len; i++) {
      const item = decodeCborItem(buf, offset);
      arr.push(item.value);
      offset = item.offset;
    }
    return { value: arr, offset };
  }
  if (major === 5) {
    const len = readLength();
    const map = new Map();
    for (let i = 0; i < len; i++) {
      const k = decodeCborItem(buf, offset);
      offset = k.offset;
      const v = decodeCborItem(buf, offset);
      offset = v.offset;
      map.set(k.value, v.value);
    }
    return { value: map, offset };
  }
  if (major === 6) {
    readLength();
    return decodeCborItem(buf, offset);
  }
  if (major === 7) {
    if (info === 20) return { value: false, offset };
    if (info === 21) return { value: true, offset };
    if (info === 22 || info === 23) return { value: null, offset };
  }
  throw new Error('Unsupported CBOR type');
}

function coseKeyToSpki(coseMap) {
  const kty = coseMap.get(1);
  const alg = coseMap.get(3);

  // EC2 (kty = 2, e.g., ES256 P-256 crv = 1)
  if (kty === 2) {
    const crv = coseMap.get(-1);
    const x = coseMap.get(-2);
    const y = coseMap.get(-3);
    const curveName = crv === 1 ? 'P-256' : crv === 2 ? 'P-384' : 'P-521';
    const pubKey = crypto.createPublicKey({
      key: {
        kty: 'EC',
        crv: curveName,
        x: Buffer.from(x).toString('base64url'),
        y: Buffer.from(y).toString('base64url')
      },
      format: 'jwk'
    });
    return {
      spki: pubKey.export({ type: 'spki', format: 'der' }).toString('base64url'),
      alg: typeof alg === 'number' ? alg : -7
    };
  }

  // RSA (kty = 3, e.g., RS256 alg = -257)
  if (kty === 3) {
    const n = coseMap.get(-1);
    const e = coseMap.get(-2);
    const pubKey = crypto.createPublicKey({
      key: {
        kty: 'RSA',
        n: Buffer.from(n).toString('base64url'),
        e: Buffer.from(e).toString('base64url')
      },
      format: 'jwk'
    });
    return {
      spki: pubKey.export({ type: 'spki', format: 'der' }).toString('base64url'),
      alg: typeof alg === 'number' ? alg : -257
    };
  }

  // OKP Ed25519 (kty = 1, crv = 6, alg = -8)
  if (kty === 1) {
    const x = coseMap.get(-2);
    const pubKey = crypto.createPublicKey({
      key: {
        kty: 'OKP',
        crv: 'Ed25519',
        x: Buffer.from(x).toString('base64url')
      },
      format: 'jwk'
    });
    return {
      spki: pubKey.export({ type: 'spki', format: 'der' }).toString('base64url'),
      alg: -8
    };
  }

  throw new Error('Unsupported authenticator COSE key type');
}

function extractFromAttestationObject(attestationObjectB64) {
  const raw = fromBase64Url(attestationObjectB64);
  const decoded = decodeCborItem(raw, 0).value;
  const authData = decoded instanceof Map ? decoded.get('authData') : null;
  if (!Buffer.isBuffer(authData) || authData.length < 55) {
    throw new Error('Invalid WebAuthn attestation authData');
  }
  const credIdLen = authData.readUInt16BE(53);
  const credIdBuf = authData.subarray(55, 55 + credIdLen);
  const coseOffset = 55 + credIdLen;
  const coseDecoded = decodeCborItem(authData, coseOffset).value;
  const { spki, alg } = coseKeyToSpki(coseDecoded);
  return {
    authData,
    credentialId: credIdBuf.toString('base64url'),
    publicKeySpki: spki,
    publicKeyAlg: alg
  };
}

function verifyOriginAndRpHash(clientData, authData, expectedHost) {
  if (!clientData || typeof clientData.origin !== 'string') {
    throw new Error('Missing WebAuthn origin');
  }
  const originUrl = new URL(clientData.origin);
  if (expectedHost) {
    const cleanExpected = String(expectedHost).split(',')[0].trim().toLowerCase();
    if (cleanExpected && originUrl.host.toLowerCase() !== cleanExpected) {
      throw new Error('Origin mismatch');
    }
  }
  const expectedRpHash = crypto
    .createHash('sha256')
    .update(originUrl.hostname)
    .digest();
  const actualRpHash = authData.subarray(0, 32);
  if (!crypto.timingSafeEqual(expectedRpHash, actualRpHash)) {
    throw new Error('RP ID hash mismatch');
  }
}

function verifyRegistration({ attestation, expectedHost }) {
  if (!attestation || typeof attestation !== 'object') {
    return { ok: false, reason: 'Hardware biometric scan required' };
  }

  try {
    const clientDataBuf = fromBase64Url(attestation.clientDataJSON);
    const clientData = JSON.parse(clientDataBuf.toString('utf8'));
    if (clientData.type !== 'webauthn.create') {
      return { ok: false, reason: 'Invalid biometric registration type' };
    }
    if (!consumeChallenge(clientData.challenge)) {
      return { ok: false, reason: 'Biometric scan expired — please scan again' };
    }

    let authDataBuf = fromBase64Url(attestation.authenticatorData);
    let publicKeySpki = attestation.publicKeySpki || '';
    let publicKeyAlg = Number(attestation.publicKeyAlg || -7);
    let credentialId = String(attestation.credentialId || '').trim();

    if ((!authDataBuf.length || !publicKeySpki) && attestation.attestationObject) {
      const parsed = extractFromAttestationObject(attestation.attestationObject);
      if (!authDataBuf.length) authDataBuf = parsed.authData;
      if (!publicKeySpki) publicKeySpki = parsed.publicKeySpki;
      if (!attestation.publicKeyAlg) publicKeyAlg = parsed.publicKeyAlg;
      if (!credentialId) credentialId = parsed.credentialId;
    }

    if (authDataBuf.length < 37 || !credentialId || !publicKeySpki) {
      return { ok: false, reason: 'Incomplete hardware biometric attestation' };
    }

    verifyOriginAndRpHash(clientData, authDataBuf, expectedHost);

    const flags = authDataBuf[32];
    const userPresent = (flags & 0x01) !== 0;
    const userVerified = (flags & 0x04) !== 0;
    if (!userPresent || !userVerified) {
      return {
        ok: false,
        reason: 'Biometric sensor verification was not completed'
      };
    }

    const signCount = authDataBuf.readUInt32BE(33);

    // Validate SPKI public key parses cleanly in Node OpenSSL
    const spkiDer = fromBase64Url(publicKeySpki);
    crypto.createPublicKey({ key: spkiDer, format: 'der', type: 'spki' });

    return {
      ok: true,
      credentialId,
      publicKeySpki,
      publicKeyAlg,
      signCount
    };
  } catch (err) {
    return {
      ok: false,
      reason: err.message || 'Hardware biometric enrollment failed'
    };
  }
}

function verifyAssertion({
  assertion,
  expectedCredentialId,
  publicKeySpki,
  publicKeyAlg = -7,
  prevSignCount = 0,
  expectedHost
}) {
  if (!assertion || typeof assertion !== 'object') {
    return { ok: false, reason: 'Hardware biometric verification required' };
  }
  if (!expectedCredentialId || !publicKeySpki) {
    return { ok: false, reason: 'No hardware passkey registered for this account' };
  }

  try {
    if (String(assertion.credentialId || '').trim() !== expectedCredentialId) {
      return {
        ok: false,
        reason: 'Scanned passkey does not match this account'
      };
    }

    const clientDataBuf = fromBase64Url(assertion.clientDataJSON);
    const clientData = JSON.parse(clientDataBuf.toString('utf8'));
    if (clientData.type !== 'webauthn.get') {
      return { ok: false, reason: 'Invalid biometric assertion type' };
    }
    if (!consumeChallenge(clientData.challenge)) {
      return { ok: false, reason: 'Biometric scan expired — please scan again' };
    }

    const authDataBuf = fromBase64Url(assertion.authenticatorData);
    const sigBuf = fromBase64Url(assertion.signature);
    if (authDataBuf.length < 37 || !sigBuf.length) {
      return { ok: false, reason: 'Incomplete biometric signature' };
    }

    verifyOriginAndRpHash(clientData, authDataBuf, expectedHost);

    const flags = authDataBuf[32];
    const userPresent = (flags & 0x01) !== 0;
    const userVerified = (flags & 0x04) !== 0;
    if (!userPresent || !userVerified) {
      return {
        ok: false,
        reason: 'Hardware biometric verification flag missing'
      };
    }

    const newSignCount = authDataBuf.readUInt32BE(33);
    if (prevSignCount > 0 && newSignCount > 0 && newSignCount <= prevSignCount) {
      return { ok: false, reason: 'Authenticator signature counter invalid' };
    }

    const clientDataHash = crypto
      .createHash('sha256')
      .update(clientDataBuf)
      .digest();
    const signedData = Buffer.concat([authDataBuf, clientDataHash]);

    const pubKey = crypto.createPublicKey({
      key: fromBase64Url(publicKeySpki),
      format: 'der',
      type: 'spki'
    });

    const digestAlg = Number(publicKeyAlg) === -8 ? null : 'sha256';
    const valid = crypto.verify(digestAlg, signedData, pubKey, sigBuf);
    if (!valid) {
      return { ok: false, reason: 'Hardware biometric signature invalid' };
    }

    return { ok: true, newSignCount };
  } catch (err) {
    return {
      ok: false,
      reason: err.message || 'Biometric verification failed'
    };
  }
}

function normalizeFaceDescriptor(raw) {
  if (!Array.isArray(raw) || raw.length !== 128) return null;
  const vec = new Array(128);
  let normSq = 0;
  let mean = 0;
  for (let i = 0; i < 128; i++) {
    const v = Number(raw[i]);
    if (!Number.isFinite(v)) return null;
    vec[i] = v;
    mean += v;
  }
  mean /= 128;
  let variance = 0;
  for (let i = 0; i < 128; i++) {
    const d = vec[i] - mean;
    variance += d * d;
    normSq += vec[i] * vec[i];
  }
  if (variance < 1e-4 || normSq < 1e-4) return null;
  const invNorm = 1 / Math.sqrt(normSq);
  return vec.map((v) => Number((v * invNorm).toFixed(6)));
}

function verifyFaceDescriptorEnrollment({ faceDescriptor, challenge }) {
  if (!consumeChallenge(challenge)) {
    return { ok: false, reason: 'Face ID scan expired — please scan again' };
  }
  const normalized = normalizeFaceDescriptor(faceDescriptor);
  if (!normalized) {
    return { ok: false, reason: 'Invalid Face ID biometric capture' };
  }
  return { ok: true, normalizedDescriptor: normalized };
}

function verifyFaceDescriptorMatch({
  enrolledDescriptor,
  candidateDescriptor,
  challenge
}) {
  if (!consumeChallenge(challenge)) {
    return { ok: false, reason: 'Face ID scan expired — please scan again' };
  }
  const a = normalizeFaceDescriptor(enrolledDescriptor);
  const b = normalizeFaceDescriptor(candidateDescriptor);
  if (!a || !b) {
    return { ok: false, reason: 'Incomplete Face ID biometric capture' };
  }
  let dot = 0;
  let distSq = 0;
  for (let i = 0; i < 128; i++) {
    dot += a[i] * b[i];
    const diff = a[i] - b[i];
    distSq += diff * diff;
  }
  const dist = Math.sqrt(distSq);
  if (dot < 0.80 || dist > 0.632) {
    return {
      ok: false,
      reason: 'Face ID scan did not match the enrolled face for this account'
    };
  }
  return { ok: true, similarity: Number(dot.toFixed(4)) };
}

module.exports = {
  createChallenge,
  consumeChallenge,
  verifyRegistration,
  verifyAssertion,
  verifyFaceDescriptorEnrollment,
  verifyFaceDescriptorMatch
};
