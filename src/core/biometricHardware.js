(function () {
  const BRIDGE_CHANNEL = 'exotic_biometric_bridge_v1';
  const CHALLENGE_MAX_AGE_MS = 4 * 60 * 1000;

  let capabilities = {
    probed: false,
    isSecure: Boolean(window.isSecureContext),
    isEmbeddedFrame: window.self !== window.top,
    webauthnApi: Boolean(
      window.isSecureContext &&
        typeof window.PublicKeyCredential === 'function' &&
        navigator.credentials &&
        typeof navigator.credentials.create === 'function'
    ),
    platformAuthenticator: null, // true | false | null (unknown inside restricted iframe)
    cameraApi: Boolean(
      window.isSecureContext &&
        navigator.mediaDevices &&
        typeof navigator.mediaDevices.getUserMedia === 'function'
    ),
    hasCameraDevice: null,
    isIOSDevice:
      /iPhone|iPad|iPod/i.test(navigator.userAgent || '') ||
      (navigator.platform === 'MacIntel' && Number(navigator.maxTouchPoints) > 1),
    inlineWebAuthnAllowed: true,
    inlineCameraAllowed: true
  };

  let cachedChallenge = {
    challenge: null,
    fetchedAt: 0,
    username: '',
    authMethod: null,
    biometricMode: null,
    biometricCredentialId: null
  };

  let activeCameraCleanup = null;

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

  function checkPolicyFeature(featureName) {
    try {
      const policy = document.permissionsPolicy || document.featurePolicy;
      if (policy && typeof policy.allowsFeature === 'function') {
        return Boolean(policy.allowsFeature(featureName));
      }
    } catch {
      // Ignore feature policy inspection error
    }
    // In cross-origin iframes without inspectable policy, WebAuthn is restricted unless explicitly delegated
    return window.self === window.top;
  }

  async function detectCapabilities() {
    capabilities.isSecure = Boolean(window.isSecureContext);
    capabilities.isEmbeddedFrame = window.self !== window.top;
    capabilities.inlineWebAuthnAllowed = checkPolicyFeature('publickey-credentials-get');
    capabilities.inlineCameraAllowed = checkPolicyFeature('camera');

    if (capabilities.webauthnApi) {
      try {
        if (
          typeof window.PublicKeyCredential
            .isUserVerifyingPlatformAuthenticatorAvailable === 'function'
        ) {
          const avail =
            await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
          // Inside a restricted iframe, browsers can report false even when hardware exists at top-level
          if (avail) {
            capabilities.platformAuthenticator = true;
          } else if (!capabilities.isEmbeddedFrame) {
            capabilities.platformAuthenticator = false;
          }
        }
      } catch {
        if (!capabilities.isEmbeddedFrame) {
          capabilities.platformAuthenticator = false;
        }
      }
    } else if (!capabilities.isEmbeddedFrame) {
      capabilities.platformAuthenticator = false;
    }

    if (
      capabilities.cameraApi &&
      typeof navigator.mediaDevices.enumerateDevices === 'function'
    ) {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const hasVideo = devices.some((d) => d && d.kind === 'videoinput');
        capabilities.hasCameraDevice = hasVideo;
      } catch {
        // Leave unknown until user prompts camera
      }
    } else if (!capabilities.isEmbeddedFrame) {
      capabilities.hasCameraDevice = false;
    }

    capabilities.probed = true;
    try {
      window.dispatchEvent(
        new CustomEvent('exotic:biometric-capabilities', {
          detail: { ...capabilities }
        })
      );
    } catch {
      // Ignore if CustomEvent unavailable
    }
    return { ...capabilities };
  }

  function getMethodSupport(method) {
    if (!capabilities.isSecure) {
      return {
        supported: false,
        reason: 'Biometric sensors require HTTPS or localhost'
      };
    }

    if (method === 'fingerprint') {
      if (!capabilities.webauthnApi && !capabilities.isEmbeddedFrame) {
        return {
          supported: false,
          reason: 'Fingerprint sensor is not supported in this browser'
        };
      }
      if (capabilities.platformAuthenticator === false && !capabilities.isEmbeddedFrame) {
        return {
          supported: false,
          reason: 'No Fingerprint hardware sensor detected on this device'
        };
      }
      return { supported: true, mode: 'webauthn' };
    }

    if (method === 'faceid') {
      // iOS / iPadOS uses TrueDepth hardware Face ID via WebAuthn
      if (capabilities.isIOSDevice) {
        if (capabilities.platformAuthenticator === false && !capabilities.isEmbeddedFrame) {
          return {
            supported: false,
            reason: 'Face ID is not enabled on this device'
          };
        }
        return { supported: true, mode: 'webauthn' };
      }

      // Desktop / Mac / Android: use real front camera Face ID if camera hardware exists, else WebAuthn platform biometric
      if (capabilities.hasCameraDevice === true || capabilities.isEmbeddedFrame) {
        return { supported: true, mode: 'camera_face' };
      }
      if (capabilities.platformAuthenticator === true) {
        return { supported: true, mode: 'webauthn' };
      }
      if (
        capabilities.hasCameraDevice === false &&
        capabilities.platformAuthenticator === false &&
        !capabilities.isEmbeddedFrame
      ) {
        return {
          supported: false,
          reason: 'No Face ID camera or biometric sensor detected on this device'
        };
      }
      return {
        supported: capabilities.cameraApi || capabilities.webauthnApi,
        mode: capabilities.cameraApi ? 'camera_face' : 'webauthn',
        reason: 'No Face ID hardware detected on this device'
      };
    }

    return { supported: true };
  }

  async function prefetchChallenge(username = '') {
    try {
      const clientKey = window.ExoticSupabase
        ? window.ExoticSupabase.getClientKey()
        : '';
      const cleanUser = String(username || '').trim();
      const qs = new URLSearchParams();
      if (cleanUser) qs.set('username', cleanUser);
      if (clientKey) qs.set('clientKey', clientKey);

      const res = await fetch(`/api/auth/webauthn-challenge?${qs.toString()}`, {
        method: 'GET',
        headers: clientKey ? { 'x-exotic-player-id': clientKey } : {}
      });
      const data = await res.json().catch(() => null);
      if (data && data.ok && data.challenge) {
        cachedChallenge = {
          challenge: data.challenge,
          fetchedAt: Date.now(),
          username: cleanUser.toLowerCase(),
          authMethod: data.authMethod || null,
          authMethods: Array.isArray(data.authMethods) ? data.authMethods : [],
          biometricModes: data.biometricModes || {},
          biometricCredentialIds: data.biometricCredentialIds || {},
          biometricMode: data.biometricMode || null,
          biometricCredentialId: data.biometricCredentialId || null
        };
        return { ...cachedChallenge };
      }
    } catch {
      // Network error handled when scan executes
    }
    return null;
  }

  function getReadyChallengeSync(username = '') {
    const now = Date.now();
    if (
      cachedChallenge.challenge &&
      now - cachedChallenge.fetchedAt < CHALLENGE_MAX_AGE_MS
    ) {
      return { ...cachedChallenge };
    }
    return null;
  }

  function stopActiveCamera() {
    if (typeof activeCameraCleanup === 'function') {
      try {
        activeCameraCleanup();
      } catch {
        // Ignore cleanup errors
      }
      activeCameraCleanup = null;
    }
  }

  function resolveCanonicalRpId() {
    try {
      const host = String(window.location.hostname || '').toLowerCase();
      if (host === 'devilexotix.com' || host === 'www.devilexotix.com') {
        return 'devilexotix.com';
      }
    } catch {
      // Ignore
    }
    return undefined;
  }

  // Must be invoked synchronously inside user click handler to preserve Safari/iOS user activation
  function startInlineWebAuthnEnrollSync({ username, method, challenge }) {
    const label = method === 'faceid' ? 'Face ID' : 'Fingerprint';
    const challengeBytes = base64UrlToBytes(challenge);
    const userBytes = new TextEncoder().encode(
      `${method}:${String(username).trim().toLowerCase()}`
    );
    const rpObj = { name: 'Exotic' };
    const canonicalRpId = resolveCanonicalRpId();
    if (canonicalRpId) rpObj.id = canonicalRpId;

    const createPromise = navigator.credentials.create({
      publicKey: {
        challenge: challengeBytes,
        rp: rpObj,
        user: {
          id: userBytes,
          name: `${username}`,
          displayName: `${username} (${label})`
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
          { type: 'public-key', alg: -8 }
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'preferred'
        },
        timeout: 45000,
        attestation: 'none'
      }
    });

    return createPromise.then(
      (cred) => {
        if (!cred || !cred.rawId || !cred.response) {
          return {
            ok: false,
            reason: `${label} hardware enrollment returned no passkey`
          };
        }
        const resp = cred.response;
        const authDataBuf =
          typeof resp.getAuthenticatorData === 'function'
            ? resp.getAuthenticatorData()
            : null;
        const pubKeyBuf =
          typeof resp.getPublicKey === 'function' ? resp.getPublicKey() : null;
        const pubKeyAlg =
          typeof resp.getPublicKeyAlgorithm === 'function'
            ? resp.getPublicKeyAlgorithm()
            : -7;

        // Refresh challenge for any subsequent scan
        prefetchChallenge(username);

        return {
          ok: true,
          biometricMode: 'webauthn',
          biometricCredentialId: bytesToBase64Url(new Uint8Array(cred.rawId)),
          webauthnAttestation: {
            credentialId: bytesToBase64Url(new Uint8Array(cred.rawId)),
            clientDataJSON: bytesToBase64Url(new Uint8Array(resp.clientDataJSON)),
            authenticatorData: authDataBuf
              ? bytesToBase64Url(new Uint8Array(authDataBuf))
              : '',
            attestationObject: resp.attestationObject
              ? bytesToBase64Url(new Uint8Array(resp.attestationObject))
              : '',
            publicKeySpki: pubKeyBuf
              ? bytesToBase64Url(new Uint8Array(pubKeyBuf))
              : '',
            publicKeyAlg: pubKeyAlg
          }
        };
      },
      (err) => {
        prefetchChallenge(username);
        const name = err?.name || '';
        const msg = String(err?.message || '');
        if (
          name === 'SecurityError' ||
          /Permissions Policy|feature is not enabled|not allowed in this document/i.test(msg)
        ) {
          return {
            ok: false,
            iframeBlocked: true,
            reason: `${label} requires top-level sensor window`
          };
        }
        if (name === 'NotSupportedError') {
          capabilities.platformAuthenticator = false;
          return {
            ok: false,
            unsupported: true,
            reason: `This device does not support hardware ${label}`
          };
        }
        if (name === 'NotAllowedError') {
          return {
            ok: false,
            canceled: true,
            reason: `${label} scan was canceled or not recognized by your device`
          };
        }
        return {
          ok: false,
          reason: `${label} hardware scan failed: ${msg || name || 'unknown error'}`
        };
      }
    );
  }

  // Must be invoked synchronously inside user click handler to preserve Safari/iOS user activation
  function startInlineWebAuthnVerifySync({
    username,
    method,
    challenge,
    credentialId
  }) {
    const label = method === 'faceid' ? 'Face ID' : 'Fingerprint';
    const challengeBytes = base64UrlToBytes(challenge);
    const publicKeyOpts = {
      challenge: challengeBytes,
      userVerification: 'required',
      timeout: 45000
    };
    const canonicalRpId = resolveCanonicalRpId();
    if (canonicalRpId) publicKeyOpts.rpId = canonicalRpId;

    if (credentialId) {
      publicKeyOpts.allowCredentials = [
        {
          type: 'public-key',
          id: base64UrlToBytes(credentialId),
          transports: ['internal', 'hybrid']
        }
      ];
    }

    const getPromise = navigator.credentials.get({ publicKey: publicKeyOpts });

    return getPromise.then(
      (assertion) => {
        if (!assertion || !assertion.rawId || !assertion.response) {
          return { ok: false, reason: `${label} verification returned no assertion` };
        }
        const resp = assertion.response;
        prefetchChallenge(username);

        return {
          ok: true,
          biometricMode: 'webauthn',
          biometricCredentialId: bytesToBase64Url(new Uint8Array(assertion.rawId)),
          webauthnAssertion: {
            credentialId: bytesToBase64Url(new Uint8Array(assertion.rawId)),
            clientDataJSON: bytesToBase64Url(new Uint8Array(resp.clientDataJSON)),
            authenticatorData: bytesToBase64Url(
              new Uint8Array(resp.authenticatorData)
            ),
            signature: bytesToBase64Url(new Uint8Array(resp.signature))
          }
        };
      },
      (err) => {
        prefetchChallenge(username);
        const name = err?.name || '';
        const msg = String(err?.message || '');
        if (
          name === 'SecurityError' ||
          /Permissions Policy|feature is not enabled|not allowed in this document/i.test(msg)
        ) {
          return {
            ok: false,
            iframeBlocked: true,
            reason: `${label} requires top-level sensor window`
          };
        }
        if (name === 'NotSupportedError') {
          capabilities.platformAuthenticator = false;
          return {
            ok: false,
            unsupported: true,
            reason: `This device does not support hardware ${label}`
          };
        }
        if (name === 'NotAllowedError') {
          return {
            ok: false,
            canceled: true,
            reason: `${label} scan was canceled or did not match`
          };
        }
        return {
          ok: false,
          reason: `${label} verification failed: ${msg || name || 'unknown error'}`
        };
      }
    );
  }

  // Extract 128-D illumination-normalized spatial + gradient facial geometry descriptor
  function computeFaceFrameAnalysis(grayGrid, prevGrid) {
    // grayGrid is 32x32 grayscale [0..255] inside the centered face crop
    let sum = 0;
    for (let i = 0; i < 1024; i++) sum += grayGrid[i];
    const mean = sum / 1024;

    let varSum = 0;
    for (let i = 0; i < 1024; i++) {
      const d = grayGrid[i] - mean;
      varSum += d * d;
    }
    const stdDev = Math.sqrt(varSum / 1024);

    // 1. Reject dark / covered camera or flat featureless wall
    if (stdDev < 14 || mean < 12 || mean > 246) {
      return { validFace: false, hint: 'Center your face in good lighting' };
    }

    // 2. Bilateral left-right facial symmetry check across central oval (rows 5..27, cols 5..26)
    let symDot = 0;
    let symLeftSq = 0;
    let symRightSq = 0;
    for (let y = 5; y < 27; y++) {
      for (let x = 5; x < 16; x++) {
        const mirrorX = 31 - x;
        const l = grayGrid[y * 32 + x] - mean;
        const r = grayGrid[y * 32 + mirrorX] - mean;
        symDot += l * r;
        symLeftSq += l * l;
        symRightSq += r * r;
      }
    }
    const symmetry =
      symLeftSq > 1 && symRightSq > 1
        ? symDot / Math.sqrt(symLeftSq * symRightSq)
        : 0;

    // 3. Viola-Haar vertical facial band structure: forehead & cheeks brighter than eye-socket band
    let foreheadSum = 0;
    let eyeBandSum = 0;
    let cheekSum = 0;
    let bandCount = 0;
    for (let x = 8; x < 24; x++) {
      for (let y = 6; y < 10; y++) foreheadSum += grayGrid[y * 32 + x];
      for (let y = 11; y < 15; y++) eyeBandSum += grayGrid[y * 32 + x];
      for (let y = 16; y < 20; y++) cheekSum += grayGrid[y * 32 + x];
      bandCount += 4;
    }
    const foreheadAvg = foreheadSum / bandCount;
    const eyeAvg = eyeBandSum / bandCount;
    const cheekAvg = cheekSum / bandCount;
    const hasEyeContrast = cheekAvg - eyeAvg > 1.8 || foreheadAvg - eyeAvg > 1.8;

    if (symmetry < 0.42 || !hasEyeContrast) {
      return { validFace: false, hint: 'Align your face straight inside the frame' };
    }

    let motionDelta = 0;
    if (prevGrid) {
      let diffSum = 0;
      for (let i = 0; i < 1024; i++) {
        diffSum += Math.abs(grayGrid[i] - prevGrid[i]);
      }
      motionDelta = diffSum / 1024;
    }

    // Build 128-D feature vector:
    // First 64: 8x8 pooled Z-normalized luminance blocks
    // Next 64: 8x8 pooled Sobel gradient orientation/magnitude features
    const vec = new Float64Array(128);
    const invStd = 1 / Math.max(stdDev, 1);

    for (let by = 0; by < 8; by++) {
      for (let bx = 0; bx < 8; bx++) {
        let blockLum = 0;
        let blockGrad = 0;
        for (let dy = 0; dy < 4; dy++) {
          for (let dx = 0; dx < 4; dx++) {
            const py = by * 4 + dy;
            const px = bx * 4 + dx;
            const val = (grayGrid[py * 32 + px] - mean) * invStd;
            blockLum += val;

            const pxL = Math.max(0, px - 1);
            const pxR = Math.min(31, px + 1);
            const pyU = Math.max(0, py - 1);
            const pyD = Math.min(31, py + 1);
            const gx = (grayGrid[py * 32 + pxR] - grayGrid[py * 32 + pxL]) * invStd;
            const gy = (grayGrid[pyD * 32 + px] - grayGrid[pyU * 32 + px]) * invStd;
            blockGrad += Math.sqrt(gx * gx + gy * gy);
          }
        }
        const idx = by * 8 + bx;
        vec[idx] = blockLum / 16;
        vec[64 + idx] = blockGrad / 16;
      }
    }

    return {
      validFace: true,
      motionDelta,
      vector: vec
    };
  }

  async function scanCameraFace({ canvas, challenge, onProgress }) {
    stopActiveCamera();

    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      return {
        ok: false,
        unsupported: true,
        reason: 'Camera access is not available on this device'
      };
    }

    let stream = null;
    const t0 = performance.now();
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 480 },
          height: { ideal: 480 }
        },
        audio: false
      });
    } catch (err) {
      const elapsed = performance.now() - t0;
      const name = err?.name || '';
      const msg = String(err?.message || '');
      if (
        window.self !== window.top &&
        (name === 'SecurityError' ||
          name === 'NotAllowedError' ||
          /Permissions Policy|dismissed|not allowed/i.test(msg)) &&
        elapsed < 220
      ) {
        return {
          ok: false,
          iframeBlocked: true,
          reason: 'Camera requires top-level Face ID window'
        };
      }
      if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        capabilities.hasCameraDevice = false;
        return {
          ok: false,
          unsupported: true,
          reason: 'No front camera found on this device'
        };
      }
      return {
        ok: false,
        canceled: true,
        reason: 'Camera permission was denied for Face ID scan'
      };
    }

    capabilities.hasCameraDevice = true;

    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.setAttribute('playsinline', '');
      video.setAttribute('autoplay', '');
      video.muted = true;
      video.srcObject = stream;

      const sampleCanvas = document.createElement('canvas');
      sampleCanvas.width = 32;
      sampleCanvas.height = 32;
      const sampleCtx = sampleCanvas.getContext('2d', { willReadFrequently: true });

      const viewSize = 220;
      if (canvas) {
        canvas.width = viewSize;
        canvas.height = viewSize;
      }
      const viewCtx = canvas
        ? canvas.getContext('2d', { willReadFrequently: true })
        : null;

      const nativeDetector =
        typeof window.FaceDetector === 'function'
          ? (() => {
              try {
                return new window.FaceDetector({
                  fastMode: true,
                  maxDetectedFaces: 1
                });
              } catch {
                return null;
              }
            })()
          : null;

      let finished = false;
      let rafId = 0;
      let detectingBox = false;
      let detectedFaceBox = null;
      let prevGrid = null;
      const capturedVectors = [];
      let totalMotion = 0;
      let motionSamples = 0;
      const REQUIRED_FRAMES = 8;
      let lastCaptureTime = 0;

      const timeoutId = setTimeout(() => {
        finish({
          ok: false,
          reason: 'Face ID timed out — align your face clearly in lighting and retry'
        });
      }, 16000);

      function cleanup() {
        if (rafId) cancelAnimationFrame(rafId);
        clearTimeout(timeoutId);
        try {
          video.pause();
          video.srcObject = null;
        } catch {
          // Ignore video cleanup error
        }
        if (stream) {
          stream.getTracks().forEach((track) => {
            try {
              track.stop();
            } catch {
              // Ignore track stop error
            }
          });
        }
      }

      activeCameraCleanup = () => {
        if (!finished) {
          finished = true;
          cleanup();
          resolve({ ok: false, canceled: true, reason: 'Face ID scan canceled' });
        }
      };

      function finish(result) {
        if (finished) return;
        finished = true;
        activeCameraCleanup = null;
        cleanup();
        resolve(result);
      }

      function renderLoop(now) {
        if (finished) return;

        if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
          const vw = video.videoWidth;
          const vh = video.videoHeight;
          const minSide = Math.min(vw, vh);
          const sx = (vw - minSide) * 0.5;
          const sy = (vh - minSide) * 0.5;

          // Optional native FaceDetector bounding box refinement
          if (nativeDetector && !detectingBox) {
            detectingBox = true;
            nativeDetector
              .detect(video)
              .then((faces) => {
                detectingBox = false;
                if (faces && faces.length > 0 && faces[0].boundingBox) {
                  detectedFaceBox = faces[0].boundingBox;
                } else {
                  detectedFaceBox = null;
                }
              })
              .catch(() => {
                detectingBox = false;
              });
          }

          // Render mirrored monochrome camera feed onto viewport canvas (fill-only, zero strokes/gradients)
          if (viewCtx) {
            viewCtx.save();
            viewCtx.translate(viewSize, 0);
            viewCtx.scale(-1, 1);
            viewCtx.drawImage(video, sx, sy, minSide, minSide, 0, 0, viewSize, viewSize);
            viewCtx.restore();

            const frameImg = viewCtx.getImageData(0, 0, viewSize, viewSize);
            const px = frameImg.data;
            for (let i = 0; i < px.length; i += 4) {
              const lum = Math.min(
                255,
                Math.max(
                  0,
                  Math.round(
                    (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114 - 118) * 1.16 +
                      122
                  )
                )
              );
              px[i] = lum;
              px[i + 1] = lum;
              px[i + 2] = lum;
            }
            viewCtx.putImageData(frameImg, 0, 0);

            // Solid monochrome Face ID corner brackets + progress bar (fillRect only)
            const isLight =
              document.documentElement.getAttribute('data-theme') === 'light';
            const fg = isLight ? '#09090b' : '#fafafa';
            const pad = 22;
            const arm = 24;
            const thick = 4;
            viewCtx.fillStyle = fg;
            // Top-left
            viewCtx.fillRect(pad, pad, arm, thick);
            viewCtx.fillRect(pad, pad, thick, arm);
            // Top-right
            viewCtx.fillRect(viewSize - pad - arm, pad, arm, thick);
            viewCtx.fillRect(viewSize - pad - thick, pad, thick, arm);
            // Bottom-left
            viewCtx.fillRect(pad, viewSize - pad - thick, arm, thick);
            viewCtx.fillRect(pad, viewSize - pad - arm, thick, arm);
            // Bottom-right
            viewCtx.fillRect(viewSize - pad - arm, viewSize - pad - thick, arm, thick);
            viewCtx.fillRect(viewSize - pad - thick, viewSize - pad - arm, thick, arm);

            // Progress bar along bottom
            const pct = capturedVectors.length / REQUIRED_FRAMES;
            viewCtx.globalAlpha = 0.25;
            viewCtx.fillRect(pad, viewSize - 12, viewSize - pad * 2, 4);
            viewCtx.globalAlpha = 1;
            viewCtx.fillRect(
              pad,
              viewSize - 12,
              Math.round((viewSize - pad * 2) * pct),
              4
            );
          }

          // Sample central face ROI into 32x32 grid every ~95ms
          if (now - lastCaptureTime >= 95) {
            lastCaptureTime = now;
            let roiX = sx + minSide * 0.22;
            let roiY = sy + minSide * 0.16;
            let roiW = minSide * 0.56;
            let roiH = minSide * 0.66;

            if (detectedFaceBox && detectedFaceBox.width > 36) {
              roiX = Math.max(0, detectedFaceBox.x);
              roiY = Math.max(0, detectedFaceBox.y);
              roiW = Math.min(vw - roiX, detectedFaceBox.width);
              roiH = Math.min(vh - roiY, detectedFaceBox.height);
            }

            // If native FaceDetector is active and confirmed zero faces, prompt alignment
            if (nativeDetector && !detectedFaceBox) {
              if (typeof onProgress === 'function') {
                onProgress({
                  pct: Math.round((capturedVectors.length / REQUIRED_FRAMES) * 100),
                  hint: 'Position your face inside the Face ID frame'
                });
              }
            } else {
              sampleCtx.drawImage(video, roiX, roiY, roiW, roiH, 0, 0, 32, 32);
              const sData = sampleCtx.getImageData(0, 0, 32, 32).data;
              const gray = new Float32Array(1024);
              for (let i = 0; i < 1024; i++) {
                const o = i * 4;
                gray[i] =
                  sData[o] * 0.299 + sData[o + 1] * 0.587 + sData[o + 2] * 0.114;
              }

              const analysis = computeFaceFrameAnalysis(gray, prevGrid);
              prevGrid = gray;

              if (analysis.validFace) {
                capturedVectors.push(analysis.vector);
                if (analysis.motionDelta > 0) {
                  totalMotion += analysis.motionDelta;
                  motionSamples += 1;
                }
                const pct = Math.min(
                  100,
                  Math.round((capturedVectors.length / REQUIRED_FRAMES) * 100)
                );
                if (typeof onProgress === 'function') {
                  onProgress({
                    pct,
                    hint: `Scanning Face ID (${pct}%)...`
                  });
                }

                if (capturedVectors.length >= REQUIRED_FRAMES) {
                  const avgMotion =
                    motionSamples > 0 ? totalMotion / motionSamples : 0.5;
                  if (avgMotion < 0.06) {
                    capturedVectors.length = 0;
                    if (typeof onProgress === 'function') {
                      onProgress({
                        pct: 0,
                        hint: 'Hold naturally in front of the camera...'
                      });
                    }
                  } else {
                    const avgVec = new Array(128).fill(0);
                    for (const v of capturedVectors) {
                      for (let k = 0; k < 128; k++) avgVec[k] += v[k];
                    }
                    let normSq = 0;
                    for (let k = 0; k < 128; k++) {
                      avgVec[k] /= capturedVectors.length;
                      normSq += avgVec[k] * avgVec[k];
                    }
                    const invNorm = 1 / Math.max(Math.sqrt(normSq), 1e-6);
                    const finalDescriptor = avgVec.map((v) =>
                      Number((v * invNorm).toFixed(6))
                    );

                    finish({
                      ok: true,
                      biometricMode: 'camera_face',
                      challenge,
                      faceDescriptor: finalDescriptor
                    });
                    return;
                  }
                }
              } else if (typeof onProgress === 'function') {
                onProgress({
                  pct: Math.round((capturedVectors.length / REQUIRED_FRAMES) * 100),
                  hint: analysis.hint
                });
              }
            }
          }
        }

        rafId = requestAnimationFrame(renderLoop);
      }

      video.play().catch(() => {});
      rafId = requestAnimationFrame(renderLoop);
    });
  }

  // Opens top-level hardware sensor bridge popup synchronously when cross-origin iframe restricts WebAuthn/Camera
  function openTopLevelSensorBridgeSync({
    mode,
    method,
    biometricMode,
    username,
    challenge,
    credentialId
  }) {
    const requestId = `bio_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const theme = document.documentElement.getAttribute('data-theme') || 'dark';
    const qs = new URLSearchParams({
      reqId: requestId,
      mode: mode || 'signup',
      method: method || 'fingerprint',
      bioMode: biometricMode || (method === 'faceid' ? 'auto' : 'webauthn'),
      username: username || '',
      challenge: challenge || '',
      credId: credentialId || '',
      theme
    });

    const w = 430;
    const h = 540;
    const left = Math.max(0, Math.round((window.screen.width - w) * 0.5));
    const top = Math.max(0, Math.round((window.screen.height - h) * 0.5));
    const popup = window.open(
      `/biometric-scan.html?${qs.toString()}`,
      'exotic_hardware_biometric',
      `popup=yes,width=${w},height=${h},left=${left},top=${top}`
    );

    if (!popup) {
      return Promise.resolve({
        ok: false,
        reason:
          'Allow the sensor window or open Exotic in a full browser tab to scan hardware biometrics'
      });
    }

    return new Promise((resolve) => {
      let settled = false;
      let bc = null;

      function done(payload) {
        if (settled) return;
        settled = true;
        window.removeEventListener('message', onMsg);
        if (bc) {
          try {
            bc.close();
          } catch {
            // Ignore close error
          }
        }
        clearInterval(closedPoll);
        resolve(payload);
      }

      function onMsg(ev) {
        const d = ev?.data;
        if (d && d.type === 'EXOTIC_BIOMETRIC_RESULT' && d.reqId === requestId) {
          done(d.result || { ok: false, reason: 'Biometric scan did not complete' });
        }
      }

      window.addEventListener('message', onMsg);
      if (typeof window.BroadcastChannel === 'function') {
        bc = new window.BroadcastChannel(BRIDGE_CHANNEL);
        bc.onmessage = onMsg;
      }

      const closedPoll = setInterval(() => {
        if (popup.closed) {
          setTimeout(() => {
            done({
              ok: false,
              canceled: true,
              reason: `${method === 'faceid' ? 'Face ID' : 'Fingerprint'} scan window was closed`
            });
          }, 180);
        }
      }, 320);
    });
  }

  window.ExoticBiometrics = {
    BRIDGE_CHANNEL,
    detectCapabilities,
    getCapabilities() {
      return { ...capabilities };
    },
    getMethodSupport,
    prefetchChallenge,
    getReadyChallengeSync,
    startInlineWebAuthnEnrollSync,
    startInlineWebAuthnVerifySync,
    scanCameraFace,
    stopActiveCamera,
    openTopLevelSensorBridgeSync
  };
})();
