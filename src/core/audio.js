(function () {
  let ctx = null;
  let muted = false;
  let masterVol = 0.7;

  function ensureContext() {
    if (muted) return null;
    if (!ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      ctx = new AudioCtx();
    }
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    return ctx;
  }

  function tone(freqStart, freqEnd, duration, type = 'square', gainPeak = 0.14, delay = 0) {
    const ac = ensureContext();
    if (!ac) return;
    const now = ac.currentTime + delay;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(24, freqStart), now);
    if (freqEnd !== freqStart) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(24, freqEnd), now + duration);
    }

    const peak = Math.max(0.001, gainPeak * masterVol);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(peak, now + Math.min(0.012, duration * 0.2));
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  function noiseBurst(duration = 0.09, gainPeak = 0.12) {
    const ac = ensureContext();
    if (!ac) return;
    const sampleCount = Math.floor(ac.sampleRate * duration);
    const buffer = ac.createBuffer(1, sampleCount, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < sampleCount; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / sampleCount);
    }
    const src = ac.createBufferSource();
    src.buffer = buffer;

    const filter = ac.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 900;

    const gain = ac.createGain();
    const now = ac.currentTime;
    gain.gain.setValueAtTime(gainPeak * masterVol, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(ac.destination);
    src.start(now);
  }

  window.ExoticAudio = {
    unlock() {
      ensureContext();
    },
    setMuted(flag) {
      muted = Boolean(flag);
    },
    isMuted() {
      return muted;
    },
    setVolume(val) {
      masterVol = Math.max(0, Math.min(1, Number(val)));
    },
    getVolume() {
      return masterVol;
    },
    click() {
      tone(540, 380, 0.045, 'triangle', 0.09);
    },
    hover() {
      tone(680, 720, 0.025, 'sine', 0.035);
    },
    jump() {
      tone(220, 520, 0.11, 'square', 0.09);
    },
    doubleJump() {
      tone(340, 760, 0.12, 'triangle', 0.12);
    },
    dash() {
      noiseBurst(0.08, 0.11);
      tone(420, 160, 0.09, 'sawtooth', 0.08);
    },
    land() {
      tone(130, 65, 0.055, 'triangle', 0.07);
    },
    spring() {
      tone(190, 820, 0.19, 'sine', 0.14);
    },
    coin() {
      tone(880, 880, 0.06, 'square', 0.08, 0);
      tone(1320, 1320, 0.11, 'square', 0.08, 0.055);
    },
    skillOrb() {
      tone(523.25, 659.25, 0.09, 'triangle', 0.11, 0);
      tone(783.99, 1046.5, 0.18, 'triangle', 0.12, 0.08);
    },
    trap() {
      tone(320, 140, 0.08, 'sawtooth', 0.11);
      noiseBurst(0.05, 0.08);
    },
    slam() {
      noiseBurst(0.14, 0.18);
      tone(110, 42, 0.16, 'square', 0.15);
    },
    gravity() {
      tone(260, 690, 0.16, 'sine', 0.11);
    },
    shieldBreak() {
      tone(660, 240, 0.15, 'triangle', 0.14);
      noiseBurst(0.09, 0.12);
    },
    death() {
      noiseBurst(0.15, 0.18);
      tone(310, 85, 0.24, 'sawtooth', 0.14, 0);
      tone(180, 62, 0.22, 'square', 0.11, 0.08);
    },
    win() {
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((n, idx) => {
        tone(n, n, 0.13, 'triangle', 0.12, idx * 0.075);
      });
    },
    buy() {
      tone(660, 880, 0.08, 'triangle', 0.11, 0);
      tone(990, 1320, 0.14, 'triangle', 0.12, 0.07);
    },
    emote() {
      tone(440, 660, 0.07, 'sine', 0.09, 0);
      tone(660, 540, 0.09, 'sine', 0.09, 0.07);
    }
  };
})();
