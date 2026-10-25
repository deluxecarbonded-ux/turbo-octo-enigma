(function () {
  const AUTH_BINDING_KEY = 'exotic_auth_binding_v1';
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
    biometricMode: null,
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
        state.biometricMode = parsed.biometricMode || null;
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
    if (payload.biometricMode) state.biometricMode = payload.biometricMode;
    if (payload.biometricCredentialId) {
      state.biometricCredentialId = payload.biometricCredentialId;
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
      credentialId || ready?.biometricCredentialId || state.biometricCredentialId || null;

    let targetBioMode = support.mode || 'webauthn';
    if (cleanMethod === 'fingerprint') {
      targetBioMode = 'webauthn';
    } else if (expectedBiometricMode === 'webauthn' || expectedBiometricMode === 'camera_face') {
      targetBioMode = expectedBiometricMode;
    }

    // 1. Hardware WebAuthn Path (Touch ID, iOS Face ID, Windows Hello, Android BiometricPrompt)
    if (targetBioMode === 'webauthn') {
      // If embedded in a cross-origin iframe that blocks inline WebAuthn, open top-level sensor window synchronously
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
                credentialId: resolvedCredId || fresh.biometricCredentialId
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
      // Refresh challenge in background after scan
      bio.prefetchChallenge(username);
      return res;
    })();
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

    getBiometricMode() {
      return state.biometricMode || null;
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

    async init() {
      if (window.ExoticBiometrics) {
        window.ExoticBiometrics.detectCapabilities().then(() => notify());
        window.ExoticBiometrics.prefetchChallenge(state.boundUsername || '');
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
      window.ExoticBiometrics?.prefetchChallenge?.(trimmed);
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
            username: res.username,
            authMethod: res.authMethod || authMethod,
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
      const authMethod = normalizeMethod(authOptions.authMethod);

      const res = await requestAuth('/api/auth/signin', 'POST', {
        username: trimmed,
        authMethod,
        credential: authOptions.credential != null ? String(authOptions.credential) : '',
        biometricMode: authOptions.biometricMode || null,
        biometricCredentialId: authOptions.biometricCredentialId || null,
        webauthnAssertion: authOptions.webauthnAssertion || null,
        webauthnAttestation: authOptions.webauthnAttestation || null,
        faceDescriptor: authOptions.faceDescriptor || null,
        challenge: authOptions.challenge || null
      });

      if (res && res.ok) {
        applySessionPayload(
          {
            hasAccount: true,
            signedIn: true,
            username: res.username,
            authMethod: res.authMethod || authMethod,
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

    async signOut() {
      window.ExoticBiometrics?.stopActiveCamera?.();
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
      window.ExoticBiometrics?.prefetchChallenge?.(lockedUsername || '');
      notify();
      return res;
    },

    async deleteAccount() {
      window.ExoticBiometrics?.stopActiveCamera?.();
      const res = await requestAuth('/api/auth/delete-account', 'POST', {});
      if (res && res.ok) {
        state.hasAccount = false;
        state.signedIn = false;
        state.username = null;
        state.boundUsername = null;
        state.authMethod = 'password';
        state.boundAuthMethod = null;
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
