(function () {
  const AUTH_BINDING_KEY = 'exotic_auth_binding_v1';
  const USERNAME_REGEX = /^[A-Za-z0-9_]{3,20}$/;
  const PIN_REGEX = /^[0-9]{4,8}$/;
  const AUTH_METHODS = ['password', 'pin', 'fingerprint', 'faceid'];
  const GUEST_MAX_LEVEL = 3;
  const GUEST_ALLOWED_SHOP_IDS = new Set([
    'aura_none',
    'char_classic',
    'char_mickey',
    'char_stickman',
    'skin_solid',
    'trail_none',
    'emote_salute',
    'char_cat',
    'char_bunny',
    'skin_inverted',
    'skin_steamboat',
    'aura_sparkle',
    'trail_dust',
    'emote_clap',
    'upg_coyote',
    'upg_magnet'
  ]);

  let state = {
    initialized: false,
    hasAccount: false,
    signedIn: false,
    isGuest: false,
    boundIsGuest: false,
    username: null,
    boundUsername: null,
    authMethod: 'password',
    boundAuthMethod: null,
    authMethods: [],
    boundAuthMethods: [],
    biometricModes: {},
    biometricCredentialIds: {},
    biometricMode: null,
    biometricCredentialId: null,
    profileId: null
  };

  const subscribers = new Set();

  function normalizeMethod(method) {
    const m = String(method || '').trim().toLowerCase();
    return AUTH_METHODS.includes(m) ? m : 'password';
  }

  function normalizeMethodList(list, fallbackMethod = null) {
    const out = [];
    if (Array.isArray(list)) {
      for (const raw of list) {
        const m = String(raw || '').trim().toLowerCase();
        if (AUTH_METHODS.includes(m) && !out.includes(m)) {
          out.push(m);
        }
      }
    }
    if (
      out.length === 0 &&
      fallbackMethod &&
      AUTH_METHODS.includes(String(fallbackMethod).trim().toLowerCase())
    ) {
      out.push(String(fallbackMethod).trim().toLowerCase());
    }
    return out;
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
      case 'none':
        return 'No Password';
      default:
        return 'Password';
    }
  }

  function formatMethodListLabel(methods) {
    const list = normalizeMethodList(methods);
    if (list.length === 0) return 'None';
    return list.map(formatMethodLabel).join(' · ');
  }

  function buildLocalGuestFallbackName() {
    const alphabet = '0123456789abcdef';
    let suffix = '';
    for (let i = 0; i < 6; i++) {
      suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return `guest_${suffix}`;
  }

  function loadCachedBinding() {
    try {
      const raw = localStorage.getItem(AUTH_BINDING_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        state.hasAccount = Boolean(parsed.hasAccount && parsed.boundUsername);
        state.signedIn = Boolean(parsed.signedIn && parsed.username);
        state.boundIsGuest = Boolean(parsed.boundIsGuest || parsed.isGuest);
        state.isGuest = Boolean(state.signedIn && state.boundIsGuest);
        state.username = parsed.username || null;
        state.boundUsername = parsed.boundUsername || null;
        if (state.boundIsGuest) {
          state.authMethod = 'none';
          state.boundAuthMethod = 'none';
          state.authMethods = [];
          state.boundAuthMethods = [];
          state.biometricModes = {};
          state.biometricCredentialIds = {};
          state.biometricMode = null;
          state.biometricCredentialId = null;
        } else {
          state.authMethod = parsed.authMethod || 'password';
          state.boundAuthMethod = parsed.boundAuthMethod || parsed.authMethod || null;
          state.authMethods = normalizeMethodList(
            parsed.authMethods,
            state.signedIn ? state.authMethod : null
          );
          state.boundAuthMethods = normalizeMethodList(
            parsed.boundAuthMethods || parsed.authMethods,
            state.hasAccount ? state.boundAuthMethod : null
          );
          state.biometricModes =
            parsed.biometricModes && typeof parsed.biometricModes === 'object'
              ? { ...parsed.biometricModes }
              : {};
          state.biometricCredentialIds =
            parsed.biometricCredentialIds && typeof parsed.biometricCredentialIds === 'object'
              ? { ...parsed.biometricCredentialIds }
              : {};
          state.biometricMode = parsed.biometricMode || null;
          state.biometricCredentialId = parsed.biometricCredentialId || null;
        }
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
          isGuest: state.isGuest,
          boundIsGuest: state.boundIsGuest,
          username: state.username,
          boundUsername: state.boundUsername,
          authMethod: state.authMethod,
          boundAuthMethod: state.boundAuthMethod,
          authMethods: state.authMethods,
          boundAuthMethods: state.boundAuthMethods,
          biometricModes: state.biometricModes,
          biometricCredentialIds: state.biometricCredentialIds,
          biometricMode: state.biometricMode,
          biometricCredentialId: state.biometricCredentialId,
          profileId: state.profileId
        })
      );
    } catch {
      // Ignore storage quota errors
    }
  }

  function notify() {
    const snap = {
      ...state,
      authMethods: [...state.authMethods],
      boundAuthMethods: [...state.boundAuthMethods],
      biometricModes: { ...state.biometricModes },
      biometricCredentialIds: { ...state.biometricCredentialIds }
    };
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

  function applyMethodsUpdate(payload) {
    if (!payload || typeof payload !== 'object') return;
    if (state.boundIsGuest || payload.isGuest) {
      state.authMethod = 'none';
      state.boundAuthMethod = state.hasAccount ? 'none' : null;
      state.authMethods = [];
      state.boundAuthMethods = [];
      state.biometricModes = {};
      state.biometricCredentialIds = {};
      state.biometricMode = null;
      state.biometricCredentialId = null;
      return;
    }
    const nextMethods = normalizeMethodList(
      payload.authMethods,
      payload.authMethod && payload.authMethod !== 'none'
        ? payload.authMethod
        : state.boundAuthMethod
    );
    const primary = nextMethods[0] || normalizeMethod(payload.authMethod || state.authMethod);
    state.authMethod = primary;
    state.boundAuthMethod = state.hasAccount ? primary : null;
    state.authMethods = nextMethods;
    state.boundAuthMethods = state.hasAccount ? [...nextMethods] : [];
    if (payload.biometricModes && typeof payload.biometricModes === 'object') {
      state.biometricModes = { ...payload.biometricModes };
    }
    if (payload.biometricCredentialIds && typeof payload.biometricCredentialIds === 'object') {
      state.biometricCredentialIds = { ...payload.biometricCredentialIds };
    }
    state.biometricMode =
      state.biometricModes[primary] || payload.biometricMode || null;
    state.biometricCredentialId =
      state.biometricCredentialIds[primary] || payload.biometricCredentialId || null;
  }

  function applySessionPayload(payload, opts = {}) {
    if (!payload || typeof payload !== 'object') return state;

    const resolvedUsername = payload.username || payload.boundUsername || null;
    const hasAcc = Boolean(payload.hasAccount && resolvedUsername);
    const signedIn = Boolean(hasAcc && payload.signedIn);
    const guestFlag = Boolean(
      payload.isGuest || payload.boundIsGuest || payload.snapshot?.profile?.is_guest
    );

    state.initialized = true;
    state.hasAccount = hasAcc;
    state.signedIn = signedIn;
    state.boundIsGuest = hasAcc ? guestFlag : false;
    state.isGuest = signedIn ? guestFlag : false;
    state.boundUsername = hasAcc ? resolvedUsername : null;
    state.username = signedIn ? resolvedUsername : null;

    if (hasAcc) {
      applyMethodsUpdate({ ...payload, isGuest: guestFlag });
    } else {
      state.authMethod = 'password';
      state.boundAuthMethod = null;
      state.authMethods = [];
      state.boundAuthMethods = [];
      state.biometricModes = {};
      state.biometricCredentialIds = {};
      state.biometricMode = null;
      state.biometricCredentialId = null;
    }

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

  /**
   * Synchronously starts real hardware Fingerprint / Face ID scanning inside a user click event
   * so transient user activation is never lost on Safari / iOS Face ID / macOS Touch ID / Popups.
   */
  function startHardwareBiometricScanSync({
    flow, // 'signup' | 'signin'
    method, // 'fingerprint' | 'faceid'
    username,
    credentialId = null,
    expectedBiometricMode = null,
    canvasEl = null,
    onProgress = null
  }) {
    const bio = window.ExoticBiometrics;
    if (!bio) {
      return Promise.resolve({
        ok: false,
        unsupported: true,
        reason: 'Biometric hardware module unavailable'
      });
    }

    const cleanMethod = method === 'faceid' ? 'faceid' : 'fingerprint';
    const support = bio.getMethodSupport(cleanMethod);
    if (!support.supported) {
      return Promise.resolve({
        ok: false,
        unsupported: true,
        reason: support.reason || `${formatMethodLabel(cleanMethod)} is not supported on this device`
      });
    }

    const caps = bio.getCapabilities();
    const ready = bio.getReadyChallengeSync(username);
    const activeChallenge = ready ? ready.challenge : null;
    const resolvedCredId =
      credentialId ||
      ready?.biometricCredentialIds?.[cleanMethod] ||
      state.biometricCredentialIds?.[cleanMethod] ||
      ready?.biometricCredentialId ||
      null;

    let targetBioMode = support.mode || 'webauthn';
    if (cleanMethod === 'fingerprint') {
      targetBioMode = 'webauthn';
    } else if (expectedBiometricMode === 'webauthn' || expectedBiometricMode === 'camera_face') {
      targetBioMode = expectedBiometricMode;
    } else if (flow === 'signin') {
      const rememberedMode =
        ready?.biometricModes?.[cleanMethod] || state.biometricModes?.[cleanMethod];
      if (rememberedMode === 'webauthn' || rememberedMode === 'camera_face') {
        targetBioMode = rememberedMode;
      }
    }

    // 1. Hardware WebAuthn Path (Touch ID, iOS Face ID, Windows Hello, Android BiometricPrompt)
    if (targetBioMode === 'webauthn') {
      if (caps.isEmbeddedFrame && !caps.inlineWebAuthnAllowed) {
        return bio.openTopLevelSensorBridgeSync({
          mode: flow,
          method: cleanMethod,
          biometricMode: 'webauthn',
          username,
          challenge: activeChallenge || '',
          credentialId: resolvedCredId || ''
        });
      }

      if (!activeChallenge) {
        return bio.prefetchChallenge(username).then((fresh) => {
          if (!fresh || !fresh.challenge) {
            return { ok: false, reason: 'Could not prepare biometric challenge — tap Scan again' };
          }
          return flow === 'signup'
            ? bio.startInlineWebAuthnEnrollSync({
                username,
                method: cleanMethod,
                challenge: fresh.challenge
              })
            : bio.startInlineWebAuthnVerifySync({
                username,
                method: cleanMethod,
                challenge: fresh.challenge,
                credentialId:
                  resolvedCredId ||
                  fresh.biometricCredentialIds?.[cleanMethod] ||
                  fresh.biometricCredentialId
              });
        });
      }

      return flow === 'signup'
        ? bio.startInlineWebAuthnEnrollSync({
            username,
            method: cleanMethod,
            challenge: activeChallenge
          })
        : bio.startInlineWebAuthnVerifySync({
            username,
            method: cleanMethod,
            challenge: activeChallenge,
            credentialId: resolvedCredId
          });
    }

    // 2. Real Front-Camera Face ID Biometric Scan Path
    if (caps.isEmbeddedFrame && !caps.inlineCameraAllowed) {
      return bio.openTopLevelSensorBridgeSync({
        mode: flow,
        method: 'faceid',
        biometricMode: 'camera_face',
        username,
        challenge: activeChallenge || '',
        credentialId: resolvedCredId || ''
      });
    }

    return (async () => {
      let ch = activeChallenge;
      if (!ch) {
        const fresh = await bio.prefetchChallenge(username);
        ch = fresh?.challenge || '';
      }
      if (!ch) {
        return { ok: false, reason: 'Could not initialize Face ID challenge' };
      }
      const res = await bio.scanCameraFace({
        canvas: canvasEl,
        challenge: ch,
        onProgress
      });
      bio.prefetchChallenge(username);
      return res;
    })();
  }

  loadCachedBinding();

  window.ExoticAuth = {
    USERNAME_REGEX,
    PIN_REGEX,
    AUTH_METHODS,
    GUEST_MAX_LEVEL,
    GUEST_ALLOWED_SHOP_IDS,
    normalizeMethod,
    normalizeMethodList,
    formatMethodLabel,
    formatMethodListLabel,

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

    getMethodSupport(method) {
      if (!window.ExoticBiometrics) return { supported: true };
      return window.ExoticBiometrics.getMethodSupport(method);
    },

    prefetchBiometricChallenge(username) {
      return window.ExoticBiometrics?.prefetchChallenge?.(username);
    },

    stopCameraScan() {
      window.ExoticBiometrics?.stopActiveCamera?.();
    },

    startHardwareBiometricScanSync,

    getState() {
      return {
        ...state,
        authMethods: [...state.authMethods],
        boundAuthMethods: [...state.boundAuthMethods],
        biometricModes: { ...state.biometricModes },
        biometricCredentialIds: { ...state.biometricCredentialIds }
      };
    },

    isInitialized() {
      return state.initialized;
    },

    isSignedIn() {
      return Boolean(state.hasAccount && state.signedIn && state.username);
    },

    isGuest() {
      return Boolean(state.hasAccount && state.signedIn && state.isGuest);
    },

    isBoundGuest() {
      return Boolean(state.hasAccount && state.boundIsGuest);
    },

    isGuestAllowedLevel(levelId) {
      if (!this.isGuest()) return true;
      const n = Number(levelId);
      return Number.isFinite(n) && n >= 1 && n <= GUEST_MAX_LEVEL;
    },

    isGuestAllowedShopItem(itemId) {
      if (!this.isGuest()) return true;
      return GUEST_ALLOWED_SHOP_IDS.has(String(itemId || ''));
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
      if (state.isGuest || state.boundIsGuest) return 'none';
      return state.authMethod || state.boundAuthMethod || 'password';
    },

    getBoundAuthMethod() {
      if (state.boundIsGuest) return 'none';
      return state.boundAuthMethod || state.authMethod || null;
    },

    getAuthMethods() {
      if (state.isGuest || state.boundIsGuest) return [];
      if (state.authMethods.length > 0) return [...state.authMethods];
      if (state.boundAuthMethods.length > 0) return [...state.boundAuthMethods];
      return state.boundAuthMethod && state.boundAuthMethod !== 'none'
        ? [state.boundAuthMethod]
        : [];
    },

    getBoundAuthMethods() {
      if (state.boundIsGuest) return [];
      if (state.boundAuthMethods.length > 0) return [...state.boundAuthMethods];
      return state.boundAuthMethod && state.boundAuthMethod !== 'none'
        ? [state.boundAuthMethod]
        : [];
    },

    isMethodActive(method) {
      if (state.isGuest || state.boundIsGuest) return false;
      const clean = String(method || '').toLowerCase();
      return this.getAuthMethods().includes(clean);
    },

    getBiometricMode(method = null) {
      if (method && state.biometricModes[method]) {
        return state.biometricModes[method];
      }
      return state.biometricMode || null;
    },

    getBiometricCredentialId(method = null) {
      if (method && state.biometricCredentialIds[method]) {
        return state.biometricCredentialIds[method];
      }
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
        if (
          this.isGuest() &&
          (requestedRoute === 'achievements' || requestedRoute === 'leaderboards')
        ) {
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

    async init() {
      if (window.ExoticBiometrics) {
        window.ExoticBiometrics.detectCapabilities().then(() => notify());
        if (!state.boundIsGuest && state.boundUsername) {
          window.ExoticBiometrics.prefetchChallenge(state.boundUsername);
        }
      }
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
      return this.getState();
    },

    async generateGuestUsername() {
      const clientKey = window.ExoticSupabase ? window.ExoticSupabase.getClientKey() : '';
      const res = await requestAuth(
        `/api/auth/guest-candidate?clientKey=${encodeURIComponent(clientKey)}`,
        'GET'
      );
      if (res && res.ok && res.username) {
        return res.username;
      }
      return buildLocalGuestFallbackName();
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
          isGuest: false,
          authMethods: [],
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
        res.isGuest = Boolean(res.isGuest);
        res.authMethods = res.isGuest
          ? []
          : normalizeMethodList(res.authMethods, res.authMethod);
      }
      if (!res?.isGuest) {
        window.ExoticBiometrics?.prefetchChallenge?.(trimmed);
      }
      return res;
    },

    async signUpGuest(preferredUsername = '') {
      const trimmed = String(preferredUsername || '').trim();
      const res = await requestAuth('/api/auth/guest-signup', 'POST', {
        username: trimmed
      });

      if (res && res.ok) {
        applySessionPayload(
          {
            hasAccount: true,
            signedIn: true,
            isGuest: true,
            boundIsGuest: true,
            username: res.username,
            authMethod: 'none',
            authMethods: [],
            biometricModes: {},
            biometricCredentialIds: {},
            profileId: res.profileId,
            snapshot: res.snapshot
          },
          { cleanReplace: true }
        );
        window.ExoticRealtime?.bootstrapFromCloud?.();
        window.ExoticRealtime?.sendPresenceHeartbeat?.({ route: 'menu' });
      } else if (res?.code === 'ACCOUNT_LOCKED' && res.boundUsername) {
        state.hasAccount = true;
        state.boundUsername = res.boundUsername;
        state.boundIsGuest = Boolean(res.boundIsGuest);
        persistBinding();
        notify();
      }
      return res;
    },

    async renameGuestUsername(newUsername) {
      const trimmed = String(newUsername || '').trim();
      const res = await requestAuth('/api/auth/guest-rename', 'POST', {
        username: trimmed
      });

      if (res && res.ok && res.username) {
        state.username = res.username;
        state.boundUsername = res.username;
        state.isGuest = true;
        state.boundIsGuest = true;
        state.authMethod = 'none';
        state.boundAuthMethod = 'none';
        state.authMethods = [];
        state.boundAuthMethods = [];
        persistBinding();
        if (window.ExoticStorage) {
          if (res.snapshot) {
            window.ExoticStorage.hydrateFromCloudSnapshot(res.snapshot, {
              replace: false
            });
          } else {
            window.ExoticStorage.setCallsign(res.username);
          }
        }
        window.ExoticRealtime?.sendPresenceHeartbeat?.({
          route: window.ExoticRouter?.getCurrent?.() || 'settings'
        });
        notify();
      }
      return res;
    },

    async signUp(username, authOptions = {}) {
      const trimmed = String(username || '').trim();
      const authMethod = normalizeMethod(authOptions.authMethod);

      const res = await requestAuth('/api/auth/signup', 'POST', {
        username: trimmed,
        authMethod,
        credential: authOptions.credential != null ? String(authOptions.credential) : '',
        biometricMode: authOptions.biometricMode || null,
        biometricCredentialId: authOptions.biometricCredentialId || null,
        webauthnAttestation: authOptions.webauthnAttestation || null,
        faceDescriptor: authOptions.faceDescriptor || null,
        challenge: authOptions.challenge || null
      });

      if (res && res.ok) {
        applySessionPayload(
          {
            hasAccount: true,
            signedIn: true,
            isGuest: false,
            boundIsGuest: false,
            username: res.username,
            authMethod: res.authMethod || authMethod,
            authMethods: res.authMethods || [authMethod],
            biometricModes: res.biometricModes || {},
            biometricCredentialIds: res.biometricCredentialIds || {},
            biometricMode: res.biometricMode || authOptions.biometricMode || null,
            biometricCredentialId:
              res.biometricCredentialId || authOptions.biometricCredentialId || null,
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
      const guestFlow =
        Boolean(authOptions.isGuest) ||
        String(authOptions.authMethod || '').trim().toLowerCase() === 'none';
      const authMethod = guestFlow ? 'none' : normalizeMethod(authOptions.authMethod);

      const res = await requestAuth('/api/auth/signin', 'POST', {
        username: trimmed,
        authMethod: guestFlow ? null : authMethod,
        credential: guestFlow
          ? null
          : authOptions.credential != null
          ? String(authOptions.credential)
          : '',
        biometricMode: guestFlow ? null : authOptions.biometricMode || null,
        biometricCredentialId: guestFlow ? null : authOptions.biometricCredentialId || null,
        webauthnAssertion: guestFlow ? null : authOptions.webauthnAssertion || null,
        webauthnAttestation: guestFlow ? null : authOptions.webauthnAttestation || null,
        faceDescriptor: guestFlow ? null : authOptions.faceDescriptor || null,
        challenge: guestFlow ? null : authOptions.challenge || null
      });

      if (res && res.ok) {
        const resolvedGuest = Boolean(res.isGuest || guestFlow);
        applySessionPayload(
          {
            hasAccount: true,
            signedIn: true,
            isGuest: resolvedGuest,
            boundIsGuest: resolvedGuest,
            username: res.username,
            authMethod: resolvedGuest ? 'none' : res.authMethod || authMethod,
            authMethods: resolvedGuest ? [] : res.authMethods || [authMethod],
            biometricModes: resolvedGuest ? {} : res.biometricModes || {},
            biometricCredentialIds: resolvedGuest ? {} : res.biometricCredentialIds || {},
            biometricMode: resolvedGuest
              ? null
              : res.biometricMode || authOptions.biometricMode || null,
            biometricCredentialId: resolvedGuest
              ? null
              : res.biometricCredentialId || authOptions.biometricCredentialId || null,
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

    async connectAuthMethod(authOptions = {}) {
      if (this.isGuest()) {
        return {
          ok: false,
          code: 'GUEST_NO_AUTH_METHODS',
          reason: 'Guest accounts do not use passwords or authentication methods.'
        };
      }
      const authMethod = normalizeMethod(authOptions.authMethod);
      const res = await requestAuth('/api/auth/methods/connect', 'POST', {
        authMethod,
        credential: authOptions.credential != null ? String(authOptions.credential) : '',
        biometricMode: authOptions.biometricMode || null,
        biometricCredentialId: authOptions.biometricCredentialId || null,
        webauthnAttestation: authOptions.webauthnAttestation || null,
        faceDescriptor: authOptions.faceDescriptor || null,
        challenge: authOptions.challenge || null
      });

      if (res && res.ok) {
        applyMethodsUpdate(res);
        persistBinding();
        window.ExoticBiometrics?.prefetchChallenge?.(state.username || '');
        notify();
      }
      return res;
    },

    async disconnectAuthMethod(method) {
      if (this.isGuest()) {
        return {
          ok: false,
          code: 'GUEST_NO_AUTH_METHODS',
          reason: 'Guest accounts do not use passwords or authentication methods.'
        };
      }
      const authMethod = normalizeMethod(method);
      const res = await requestAuth('/api/auth/methods/disconnect', 'POST', {
        authMethod
      });

      if (res && res.ok) {
        applyMethodsUpdate(res);
        persistBinding();
        window.ExoticBiometrics?.prefetchChallenge?.(state.username || '');
        notify();
      }
      return res;
    },

    async signOut() {
      window.ExoticBiometrics?.stopActiveCamera?.();
      const wasGuest = Boolean(state.isGuest || state.boundIsGuest);
      const res = await requestAuth('/api/auth/signout', 'POST', {});
      const lockedUsername =
        res?.boundUsername || res?.username || state.boundUsername || state.username;
      const guestBound =
        typeof res?.isGuest === 'boolean' ? res.isGuest : wasGuest;

      state.hasAccount = Boolean(lockedUsername);
      state.signedIn = false;
      state.isGuest = false;
      state.boundIsGuest = Boolean(lockedUsername && guestBound);
      state.username = null;
      state.boundUsername = lockedUsername || null;

      if (lockedUsername) {
        applyMethodsUpdate({
          isGuest: state.boundIsGuest,
          authMethod: state.boundIsGuest
            ? 'none'
            : res?.authMethod || state.boundAuthMethod || state.authMethod,
          authMethods: state.boundIsGuest
            ? []
            : res?.authMethods || state.boundAuthMethods || state.authMethods,
          biometricModes: state.boundIsGuest
            ? {}
            : res?.biometricModes || state.biometricModes,
          biometricCredentialIds: state.boundIsGuest
            ? {}
            : res?.biometricCredentialIds || state.biometricCredentialIds
        });
      }
      persistBinding();
      if (!state.boundIsGuest && lockedUsername) {
        window.ExoticBiometrics?.prefetchChallenge?.(lockedUsername);
      }
      notify();
      return res;
    },

    async deleteAccount() {
      window.ExoticBiometrics?.stopActiveCamera?.();
      const res = await requestAuth('/api/auth/delete-account', 'POST', {});
      if (res && res.ok) {
        state.hasAccount = false;
        state.signedIn = false;
        state.isGuest = false;
        state.boundIsGuest = false;
        state.username = null;
        state.boundUsername = null;
        state.authMethod = 'password';
        state.boundAuthMethod = null;
        state.authMethods = [];
        state.boundAuthMethods = [];
        state.biometricModes = {};
        state.biometricCredentialIds = {};
        state.biometricMode = null;
        state.biometricCredentialId = null;
        state.profileId = null;
        persistBinding();
        if (window.ExoticStorage) {
          window.ExoticStorage.resetLocalOnly();
        }
        window.ExoticRealtime?.bootstrapFromCloud?.();
        window.ExoticBiometrics?.prefetchChallenge?.('');
        notify();
      }
      return res;
    }
  };
})();
