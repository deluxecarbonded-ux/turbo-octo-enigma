(function () {
  const AUTH_BINDING_KEY = 'exotic_auth_binding_v1';
  const BIOMETRIC_VAULT_KEY = 'exotic_biometric_vault_v1';
  const USERNAME_REGEX = /^[A-Za-z0-9_]{3,20}$/;
  const PIN_REGEX = /^[0-9]{4,8}$/;
  const AUTH_METHODS = ['password', 'pin', 'fingerprint', 'faceid'];

  let state = {
    initialized: false,
    hasAccount: false,
    signedIn: false,
    username: null,
    boundUsername: null,
    authMethod: 'password',
    boundAuthMethod: null,
    biometricCredentialId: null,
    profileId: null
  };

  const subscribers = new Set();

  function normalizeMethod(method) {
    const m = String(method || '').trim().toLowerCase();
    return AUTH_METHODS.includes(m) ? m : 'password';
  }

  function formatMethodLabel(method) {
    switch (String(method || '').toLowerCase()) {
      case 'faceid':
        return 'Face ID';
      case 'fingerprint':
        return 'Fingerprint';
      case 'pin':
        return 'PIN';
      case 'password':
        return 'Password';
      default:
        return 'Password';
    }
  }

  function bytesToHex(bytes) {
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }

  function bytesToBase64Url(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i++) {
      bin += String.fromCharCode(bytes[i]);
    }
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function base64UrlToBytes(str) {
    const base64 = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
    const pad = base64.length % 4 === 0 ? '' : '='.repeat(4 - (base64.length % 4));
    const bin = atob(base64 + pad);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      out[i] = bin.charCodeAt(i);
    }
    return out;
  }

  function randomHex(byteLen = 32) {
    const arr = new Uint8Array(byteLen);
    if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
      window.crypto.getRandomValues(arr);
    } else {
      for (let i = 0; i < byteLen; i++) {
        arr[i] = Math.floor(Math.random() * 256);
      }
    }
    return bytesToHex(arr);
  }

  function readBiometricVault() {
    try {
      const raw = localStorage.getItem(BIOMETRIC_VAULT_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  function writeBiometricVault(vault) {
    try {
      localStorage.setItem(BIOMETRIC_VAULT_KEY, JSON.stringify(vault || {}));
    } catch {
      // Ignore storage quota errors
    }
  }

  function removeBiometricsForUsername(username) {
    if (!username) return;
    const lower = String(username).trim().toLowerCase();
    const vault = readBiometricVault();
    let changed = false;
    for (const key of Object.keys(vault)) {
      if (key.endsWith(`:${lower}`)) {
        delete vault[key];
        changed = true;
      }
    }
    if (changed) writeBiometricVault(vault);
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function loadCachedBinding() {
    try {
      const raw = localStorage.getItem(AUTH_BINDING_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        state.hasAccount = Boolean(parsed.hasAccount && parsed.boundUsername);
        state.signedIn = Boolean(parsed.signedIn && parsed.username);
        state.username = parsed.username || null;
        state.boundUsername = parsed.boundUsername || null;
        state.authMethod = parsed.authMethod || 'password';
        state.boundAuthMethod = parsed.boundAuthMethod || parsed.authMethod || null;
        state.biometricCredentialId = parsed.biometricCredentialId || null;
        state.profileId = parsed.profileId || null;
      }
    } catch {
      // Ignore storage access errors
    }
  }

  function persistBinding() {
    try {
      if (!state.hasAccount && !state.boundUsername) {
        localStorage.removeItem(AUTH_BINDING_KEY);
        return;
      }
      localStorage.setItem(
        AUTH_BINDING_KEY,
        JSON.stringify({
          hasAccount: state.hasAccount,
          signedIn: state.signedIn,
          username: state.username,
          boundUsername: state.boundUsername,
          authMethod: state.authMethod,
          boundAuthMethod: state.boundAuthMethod,
          biometricCredentialId: state.biometricCredentialId,
          profileId: state.profileId
        })
      );
    } catch {
      // Ignore storage quota errors
    }
  }

  function notify() {
    const snap = { ...state };
    subscribers.forEach((fn) => {
      try {
        fn(snap);
      } catch {
        // Ignore subscriber error
      }
    });
  }

  function buildHeaders() {
    const clientKey = window.ExoticSupabase ? window.ExoticSupabase.getClientKey() : '';
    return {
      'Content-Type': 'application/json',
      'x-exotic-player-id': clientKey
    };
  }

  async function requestAuth(path, method = 'GET', body = null) {
    try {
      const opts = {
        method,
        headers: buildHeaders()
      };
      if (body && method !== 'GET') {
        opts.body = JSON.stringify({
          clientKey: window.ExoticSupabase ? window.ExoticSupabase.getClientKey() : '',
          ...body
        });
      }
      const res = await fetch(path, opts);
      const data = await res.json().catch(() => ({ ok: false }));
      return data || { ok: false };
    } catch (err) {
      return { ok: false, error: 'network_error', message: err.message || 'Request failed' };
    }
  }

  function applySessionPayload(payload, opts = {}) {
    if (!payload || typeof payload !== 'object') return state;

    const resolvedUsername = payload.username || payload.boundUsername || null;
    const hasAcc = Boolean(payload.hasAccount && resolvedUsername);
    const signedIn = Boolean(hasAcc && payload.signedIn);
    const resolvedMethod =
      payload.authMethod && payload.authMethod !== 'none'
        ? normalizeMethod(payload.authMethod)
        : state.boundAuthMethod || 'password';

    state.initialized = true;
    state.hasAccount = hasAcc;
    state.signedIn = signedIn;
    state.boundUsername = hasAcc ? resolvedUsername : null;
    state.username = signedIn ? resolvedUsername : null;
    state.authMethod = resolvedMethod;
    state.boundAuthMethod = hasAcc ? resolvedMethod : null;
    state.biometricCredentialId = payload.biometricCredentialId || state.biometricCredentialId || null;
    state.profileId = payload.profileId || null;

    persistBinding();

    if (signedIn && payload.snapshot && window.ExoticStorage) {
      if (opts.cleanReplace) {
        window.ExoticStorage.resetLocalOnly();
      }
      window.ExoticStorage.hydrateFromCloudSnapshot(payload.snapshot, {
        replace: true
      });
    } else if (!hasAcc && window.ExoticStorage) {
      window.ExoticStorage.resetLocalOnly();
    }

    notify();
    return { ...state };
  }

  async function canAttemptNativeWebAuthn() {
    try {
      if (
        !window.isSecureContext ||
        typeof window.PublicKeyCredential !== 'function' ||
        !navigator.credentials ||
        typeof navigator.credentials.create !== 'function'
      ) {
        return false;
      }
      if (typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function') {
        return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      }
      return false;
    } catch {
      return false;
    }
  }

  async function enrollBiometric(method, username) {
    const cleanMethod = method === 'faceid' ? 'faceid' : 'fingerprint';
    const label = formatMethodLabel(cleanMethod);
    const cleanUser = String(username || 'runner').trim() || 'runner';
    const secret = `${cleanMethod}_${randomHex(32)}`;
    let credentialId = `bio_${cleanMethod}_${randomHex(16)}`;
    let mode = 'device';

    const tryNative = await canAttemptNativeWebAuthn();
    if (tryNative) {
      const t0 = performance.now();
      try {
        const challenge = new Uint8Array(32);
        window.crypto.getRandomValues(challenge);
        const userId = new TextEncoder().encode(`${cleanMethod}:${cleanUser.toLowerCase()}`);

        const cred = await navigator.credentials.create({
          publicKey: {
            challenge,
            rp: { name: 'Exotic' },
            user: {
              id: userId,
              name: `${cleanUser} (${label})`,
              displayName: cleanUser
            },
            pubKeyCredParams: [
              { type: 'public-key', alg: -7 },
              { type: 'public-key', alg: -257 }
            ],
            authenticatorSelection: {
              authenticatorAttachment: 'platform',
              userVerification: 'required',
              residentKey: 'preferred'
            },
            timeout: 25000,
            attestation: 'none'
          }
        });

        if (cred && cred.rawId) {
          credentialId = bytesToBase64Url(new Uint8Array(cred.rawId));
          mode = 'webauthn';
        }
      } catch (err) {
        const elapsed = performance.now() - t0;
        if (err && err.name === 'NotAllowedError' && window.top === window.self && elapsed > 300) {
          return {
            ok: false,
            canceled: true,
            reason: `${label} scan was canceled`
          };
        }
        await sleep(520);
      }
    } else {
      await sleep(520);
    }

    const vault = readBiometricVault();
    const vaultKey = `${cleanMethod}:${cleanUser.toLowerCase()}`;
    vault[vaultKey] = {
      method: cleanMethod,
      username: cleanUser.toLowerCase(),
      secret,
      credentialId,
      mode,
      createdAt: Date.now()
    };
    writeBiometricVault(vault);

    return {
      ok: true,
      method: cleanMethod,
      credential: secret,
      biometricCredentialId: credentialId,
      mode
    };
  }

  async function verifyBiometric(method, username, expectedCredentialId = null) {
    const cleanMethod = method === 'faceid' ? 'faceid' : 'fingerprint';
    const label = formatMethodLabel(cleanMethod);
    const cleanUser = String(username || '').trim().toLowerCase();
    const vault = readBiometricVault();

    let entry = cleanUser ? vault[`${cleanMethod}:${cleanUser}`] : null;
    if (!entry && expectedCredentialId) {
      entry = Object.values(vault).find(
        (v) => v && v.method === cleanMethod && v.credentialId === expectedCredentialId
      );
    }

    // Legacy account enrolling biometric on first Sign In when no credential existed yet
    if (!entry && !expectedCredentialId && cleanUser) {
      return enrollBiometric(cleanMethod, cleanUser);
    }

    if (!entry) {
      await sleep(360);
      return {
        ok: false,
        reason: `No ${label} passkey found for @${username || 'runner'} on this device`
      };
    }

    if (entry.mode === 'webauthn' && (await canAttemptNativeWebAuthn())) {
      const t0 = performance.now();
      try {
        const challenge = new Uint8Array(32);
        window.crypto.getRandomValues(challenge);
        const allowId = base64UrlToBytes(expectedCredentialId || entry.credentialId);

        const assertion = await navigator.credentials.get({
          publicKey: {
            challenge,
            allowCredentials: [{ type: 'public-key', id: allowId }],
            userVerification: 'required',
            timeout: 25000
          }
        });

        if (!assertion) {
          return { ok: false, reason: `${label} verification failed` };
        }
      } catch (err) {
        const elapsed = performance.now() - t0;
        if (err && err.name === 'NotAllowedError' && window.top === window.self && elapsed > 300) {
          return {
            ok: false,
            canceled: true,
            reason: `${label} verification was canceled`
          };
        }
        await sleep(460);
      }
    } else {
      await sleep(480);
    }

    return {
      ok: true,
      method: cleanMethod,
      credential: entry.secret,
      biometricCredentialId: entry.credentialId
    };
  }

  loadCachedBinding();

  window.ExoticAuth = {
    USERNAME_REGEX,
    PIN_REGEX,
    AUTH_METHODS,
    normalizeMethod,
    formatMethodLabel,

    isValidFormat(username) {
      return USERNAME_REGEX.test(String(username || '').trim());
    },

    isValidPassword(password) {
      const s = String(password ?? '');
      return s.length >= 4 && s.length <= 64;
    },

    isValidPin(pin) {
      return PIN_REGEX.test(String(pin || '').trim());
    },

    getState() {
      return { ...state };
    },

    isInitialized() {
      return state.initialized;
    },

    isSignedIn() {
      return Boolean(state.hasAccount && state.signedIn && state.username);
    },

    hasBoundAccount() {
      return Boolean(state.hasAccount && state.boundUsername);
    },

    getUsername() {
      return state.username || null;
    },

    getBoundUsername() {
      return state.boundUsername || null;
    },

    getAuthMethod() {
      return state.authMethod || state.boundAuthMethod || 'password';
    },

    getBoundAuthMethod() {
      return state.boundAuthMethod || state.authMethod || null;
    },

    getBiometricCredentialId() {
      return state.biometricCredentialId || null;
    },

    getDefaultEntryRoute() {
      if (this.isSignedIn()) return 'menu';
      if (this.hasBoundAccount()) return 'signin';
      return 'signup';
    },

    resolveGuardedRoute(requestedRoute) {
      if (requestedRoute === 'splash') return 'splash';

      if (this.isSignedIn()) {
        if (requestedRoute === 'signup' || requestedRoute === 'signin') {
          return 'menu';
        }
        return requestedRoute;
      }

      if (requestedRoute === 'signup' || requestedRoute === 'signin') {
        return requestedRoute;
      }

      return this.hasBoundAccount() ? 'signin' : 'signup';
    },

    subscribe(fn) {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },

    applySessionPayload,
    enrollBiometric,
    verifyBiometric,

    async init() {
      const clientKey = window.ExoticSupabase ? window.ExoticSupabase.getClientKey() : '';
      const res = await requestAuth(
        `/api/auth/session?clientKey=${encodeURIComponent(clientKey)}`,
        'GET'
      );
      if (res && typeof res.hasAccount === 'boolean') {
        applySessionPayload(res, { cleanReplace: true });
      } else {
        state.initialized = true;
        notify();
      }
      return { ...state };
    },

    async checkUsername(username) {
      const trimmed = String(username || '').trim();
      if (!USERNAME_REGEX.test(trimmed)) {
        return {
          ok: true,
          valid: false,
          exists: false,
          available: false,
          taken: false,
          reason: 'invalid_format'
        };
      }
      const clientKey = window.ExoticSupabase ? window.ExoticSupabase.getClientKey() : '';
      const res = await requestAuth(
        `/api/auth/check-username?username=${encodeURIComponent(trimmed)}&clientKey=${encodeURIComponent(clientKey)}`,
        'GET'
      );
      if (res && typeof res === 'object') {
        res.taken = Boolean(res.valid && res.exists);
      }
      return res;
    },

    async signUp(username, authOptions = {}) {
      const trimmed = String(username || '').trim();
      const authMethod = normalizeMethod(authOptions.authMethod);
      const credential = authOptions.credential != null ? String(authOptions.credential) : '';
      const biometricCredentialId = authOptions.biometricCredentialId || null;

      const res = await requestAuth('/api/auth/signup', 'POST', {
        username: trimmed,
        authMethod,
        credential,
        biometricCredentialId
      });
      if (res && res.ok) {
        // Re-key biometric vault entry to canonical username if casing differed
        if ((authMethod === 'fingerprint' || authMethod === 'faceid') && res.username) {
          const vault = readBiometricVault();
          const entry = vault[`${authMethod}:${trimmed.toLowerCase()}`];
          if (entry) {
            vault[`${authMethod}:${res.username.toLowerCase()}`] = entry;
            writeBiometricVault(vault);
          }
        }
        applySessionPayload(
          {
            hasAccount: true,
            signedIn: true,
            username: res.username,
            authMethod: res.authMethod || authMethod,
            biometricCredentialId: res.biometricCredentialId || biometricCredentialId,
            profileId: res.profileId,
            snapshot: res.snapshot
          },
          { cleanReplace: true }
        );
        window.ExoticRealtime?.bootstrapFromCloud?.();
        window.ExoticRealtime?.sendPresenceHeartbeat?.({ route: 'menu' });
      }
      return res;
    },

    async signIn(username, authOptions = {}) {
      const trimmed = String(username || '').trim();
      const authMethod = normalizeMethod(authOptions.authMethod);
      const credential = authOptions.credential != null ? String(authOptions.credential) : '';
      const biometricCredentialId = authOptions.biometricCredentialId || null;

      const res = await requestAuth('/api/auth/signin', 'POST', {
        username: trimmed,
        authMethod,
        credential,
        biometricCredentialId
      });
      if (res && res.ok) {
        applySessionPayload(
          {
            hasAccount: true,
            signedIn: true,
            username: res.username,
            authMethod: res.authMethod || authMethod,
            biometricCredentialId: res.biometricCredentialId || biometricCredentialId,
            profileId: res.profileId,
            snapshot: res.snapshot
          },
          { cleanReplace: true }
        );
        window.ExoticRealtime?.bootstrapFromCloud?.();
        window.ExoticRealtime?.sendPresenceHeartbeat?.({ route: 'menu' });
      }
      return res;
    },

    async signOut() {
      const res = await requestAuth('/api/auth/signout', 'POST', {});
      const lockedUsername =
        res?.boundUsername || res?.username || state.boundUsername || state.username;
      const lockedMethod =
        res?.authMethod && res.authMethod !== 'none'
          ? normalizeMethod(res.authMethod)
          : state.boundAuthMethod || state.authMethod || 'password';

      state.hasAccount = Boolean(lockedUsername);
      state.signedIn = false;
      state.username = null;
      state.boundUsername = lockedUsername || null;
      state.authMethod = lockedMethod;
      state.boundAuthMethod = lockedUsername ? lockedMethod : null;
      if (res?.biometricCredentialId) {
        state.biometricCredentialId = res.biometricCredentialId;
      }
      persistBinding();
      notify();
      return res;
    },

    async deleteAccount() {
      const prevUsername = state.username || state.boundUsername;
      const res = await requestAuth('/api/auth/delete-account', 'POST', {});
      if (res && res.ok) {
        removeBiometricsForUsername(res.deletedUsername || prevUsername);
        state.hasAccount = false;
        state.signedIn = false;
        state.username = null;
        state.boundUsername = null;
        state.authMethod = 'password';
        state.boundAuthMethod = null;
        state.biometricCredentialId = null;
        state.profileId = null;
        persistBinding();
        if (window.ExoticStorage) {
          window.ExoticStorage.resetLocalOnly();
        }
        window.ExoticRealtime?.bootstrapFromCloud?.();
        notify();
      }
      return res;
    }
  };
})();
