(function () {
  let activeShopCategory = 'characters';
  let activeLbLevel = 'all';
  let activeLbSort = 'time';
  let lastWinPayload = null;
  let lastWinShareDecision = 'pending';
  const LB_NOTICE_LOCAL_PREFIX = 'exotic_lb_notice_seen_';
  let rageBannerTimer = null;
  let canvasFullscreen = false;
  let nativeFsActive = false;
  let signupDebounceTimer = null;
  let signinDebounceTimer = null;
  let guestSignupDebounceTimer = null;
  let guestRenameDebounceTimer = null;
  let signupCheckSeq = 0;
  let signinCheckSeq = 0;
  let guestSignupCheckSeq = 0;
  let guestRenameCheckSeq = 0;
  let guestSignupCandidateLoaded = false;
  let signinTargetIsGuest = false;
  let signupAuthMethod = 'password';
  let signinAuthMethod = 'password';
  let signupBioEnrollment = null;
  let signinBioAssertion = null;
  let signinExpectedMethod = null;
  let signinExpectedBioMode = null;
  let signinExpectedBioId = null;
  let signinAllowedMethods = [];
  let signinExpectedBioModes = {};
  let signinExpectedBioIds = {};
  let signinManualMethodOverride = false;
  let settingsAuthBusy = false;

  function getNativeFullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
  }

  function updateFullscreenButtons() {
    const playFsBtn = document.getElementById('play-fullscreen-btn');
    if (playFsBtn) {
      playFsBtn.className = `ex-pill-btn ${
        canvasFullscreen ? 'ex-pill-btn--primary' : 'ex-pill-btn--secondary'
      } ex-pill-btn--sm`;
      playFsBtn.innerHTML = `${window.ExoticIcons.get(
        canvasFullscreen ? 'fullscreenExit' : 'fullscreen'
      )}<span class="play-fs-text">${
        canvasFullscreen ? 'Exit Full Screen (F)' : 'Full Screen (F)'
      }</span>`;
      playFsBtn.setAttribute(
        'title',
        canvasFullscreen ? 'Exit Full Screen (F)' : 'Full Screen (F)'
      );
      playFsBtn.setAttribute('aria-pressed', String(canvasFullscreen));
    }

    const pauseFsBtn = document.getElementById('pause-fullscreen-btn');
    if (pauseFsBtn) {
      pauseFsBtn.innerHTML = `${window.ExoticIcons.get(
        canvasFullscreen ? 'fullscreenExit' : 'fullscreen'
      )}<span>${
        canvasFullscreen ? 'Exit Full Screen (F)' : 'Enter Full Screen (F)'
      }</span>`;
      pauseFsBtn.setAttribute('aria-pressed', String(canvasFullscreen));
    }
  }

  async function setCanvasFullscreen(nextState) {
    const appEl = document.getElementById('app');
    if (!appEl) return;

    canvasFullscreen = Boolean(nextState);
    appEl.classList.toggle('is-canvas-fullscreen', canvasFullscreen);
    updateFullscreenButtons();

    if (canvasFullscreen) {
      try {
        if (!getNativeFullscreenElement()) {
          if (appEl.requestFullscreen) {
            await appEl.requestFullscreen({ navigationUI: 'hide' });
            nativeFsActive = true;
          } else if (appEl.webkitRequestFullscreen) {
            appEl.webkitRequestFullscreen();
            nativeFsActive = true;
          }
        }
      } catch {
        // Sandboxed iframes without allowfullscreen still enjoy edge-to-edge viewport fullscreen
        nativeFsActive = false;
      }
    } else {
      nativeFsActive = false;
      const fsEl = getNativeFullscreenElement();
      if (fsEl) {
        try {
          if (document.exitFullscreen) {
            await document.exitFullscreen();
          } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
          }
        } catch {
          // Ignore exit error
        }
      }
    }
  }

  function toggleCanvasFullscreen() {
    window.ExoticAudio.click();
    setCanvasFullscreen(!canvasFullscreen);
  }

  function formatTime(ms) {
    if (!Number.isFinite(ms) || ms <= 0) return '00:00.00';
    const totalSec = ms / 1000;
    const mins = Math.floor(totalSec / 60);
    const secs = Math.floor(totalSec % 60);
    const centis = Math.floor((ms % 1000) / 10);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(centis).padStart(2, '0')}`;
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function showToast(message) {
    const stack = document.getElementById('toast-stack');
    if (!stack) return;
    const el = document.createElement('div');
    el.className = 'ex-toast';
    el.innerHTML = `${window.ExoticIcons.get('skill')}<span>${escapeHtml(message)}</span>`;
    stack.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(8px)';
      el.style.transition = 'opacity 200ms ease, transform 200ms ease';
      setTimeout(() => el.remove(), 220);
    }, 3100);
  }

  function showRageQuip(text) {
    const banner = document.getElementById('rage-banner');
    if (!banner) return;
    banner.textContent = text;
    banner.classList.add('is-visible');
    if (rageBannerTimer) clearTimeout(rageBannerTimer);
    rageBannerTimer = setTimeout(() => {
      banner.classList.remove('is-visible');
    }, 2100);
  }

  function getNextPlayableLevelId() {
    const state = window.ExoticStorage.getState();
    const isGuest = Boolean(window.ExoticAuth?.isGuest());
    const maxStage = isGuest ? window.ExoticAuth.GUEST_MAX_LEVEL : 8;
    for (const lvl of window.ExoticLevels.LEVELS) {
      if (lvl.id > maxStage) break;
      const st = state.levelStats[lvl.id];
      if (!st || !st.cleared) return lvl.id;
    }
    return 1;
  }

  function updateCloudIndicators() {
    if (!window.ExoticRealtime) return;
    const status = window.ExoticRealtime.getStatus();

    const setStatusChip = document.getElementById('set-cloud-status-chip');
    const setMetaDesc = document.getElementById('set-cloud-meta-desc');
    if (setStatusChip) {
      setStatusChip.textContent = status.connected ? 'ACTIVE' : 'OFFLINE';
    }
    if (setMetaDesc) {
      setMetaDesc.textContent = status.connected
        ? 'Runner profile, inventory, stage progress, and leaderboards are synchronized.'
        : 'Offline mode active · Waiting to synchronize...';
    }
  }

  function syncThemeButtonsUI() {
    const isDark = window.ExoticTheme.getMode() === 'dark';
    const themeIcon = window.ExoticIcons.get(isDark ? 'sun' : 'moon');
    const themeLabel = isDark ? 'Light Mode' : 'Dark Mode';
    const switchHint = `Switch to ${themeLabel}`;

    const fullPillIds = [
      'header-theme-btn',
      'signup-theme-btn',
      'signin-theme-btn',
      'splash-theme-btn',
      'pause-theme-btn'
    ];
    for (const id of fullPillIds) {
      const btn = document.getElementById(id);
      if (btn) {
        btn.innerHTML = `${themeIcon}<span>${themeLabel}</span>`;
        btn.setAttribute('title', switchHint);
        btn.setAttribute('aria-label', switchHint);
      }
    }

    const playThemeBtn = document.getElementById('play-theme-btn');
    if (playThemeBtn) {
      playThemeBtn.innerHTML = `${themeIcon}<span class="play-theme-text">${themeLabel}</span>`;
      playThemeBtn.setAttribute('title', switchHint);
      playThemeBtn.setAttribute('aria-label', switchHint);
    }

    const themeDarkBtn = document.getElementById('set-theme-dark');
    const themeLightBtn = document.getElementById('set-theme-light');
    if (themeDarkBtn && themeLightBtn) {
      themeDarkBtn.className = `ex-pill-btn ${
        isDark ? 'ex-pill-btn--primary' : 'ex-pill-btn--secondary'
      } ex-pill-btn--sm`;
      themeDarkBtn.setAttribute('aria-pressed', String(isDark));
      themeLightBtn.className = `ex-pill-btn ${
        !isDark ? 'ex-pill-btn--primary' : 'ex-pill-btn--secondary'
      } ex-pill-btn--sm`;
      themeLightBtn.setAttribute('aria-pressed', String(!isDark));
    }

    const isColored = window.ExoticTheme.getColorMode
      ? window.ExoticTheme.getColorMode() !== 'monochrome'
      : true;
    const colorColoredBtn = document.getElementById('set-color-colored');
    const colorMonoBtn = document.getElementById('set-color-monochrome');
    if (colorColoredBtn && colorMonoBtn) {
      colorColoredBtn.className = `ex-pill-btn ${
        isColored ? 'ex-pill-btn--primary' : 'ex-pill-btn--secondary'
      } ex-pill-btn--sm`;
      colorColoredBtn.setAttribute('aria-pressed', String(isColored));
      colorMonoBtn.className = `ex-pill-btn ${
        !isColored ? 'ex-pill-btn--primary' : 'ex-pill-btn--secondary'
      } ex-pill-btn--sm`;
      colorMonoBtn.setAttribute('aria-pressed', String(!isColored));
    }
  }

  function updateGlobalHeader() {
    const state = window.ExoticStorage.getState();
    const coinsEl = document.getElementById('header-coins');
    const spEl = document.getElementById('header-sp');
    if (coinsEl) coinsEl.textContent = String(state.coins);
    if (spEl) spEl.textContent = String(state.skillPoints);

    const hudCoins = document.getElementById('hud-coins-val');
    const hudSp = document.getElementById('hud-sp-val');
    if (hudCoins) hudCoins.textContent = String(state.coins);
    if (hudSp) hudSp.textContent = String(state.skillPoints);

    const headerUsername = document.getElementById('header-username');
    if (headerUsername && window.ExoticAuth) {
      const uname = window.ExoticAuth.getUsername() || state.callsign || 'runner';
      headerUsername.textContent = window.ExoticAuth.isGuest()
        ? `@${uname} · Guest`
        : `@${uname}`;
    }

    syncThemeButtonsUI();

    const muteBtn = document.getElementById('header-mute-btn');
    const isMuted = window.ExoticAudio.isMuted();
    if (muteBtn) {
      muteBtn.innerHTML = window.ExoticIcons.get(isMuted ? 'soundOff' : 'soundOn');
      muteBtn.setAttribute('title', isMuted ? 'Unmute Audio' : 'Mute Audio');
    }

    updateCloudIndicators();
  }

  function renderMenuSummary() {
    const state = window.ExoticStorage.getState();
    const isGuest = Boolean(window.ExoticAuth?.isGuest());
    const maxStages = isGuest ? window.ExoticAuth.GUEST_MAX_LEVEL : 8;
    const clearedCount = Object.entries(state.levelStats).filter(
      ([lvlId, s]) => Number(lvlId) <= maxStages && s && s.cleared
    ).length;
    const nextLvl = window.ExoticLevels.getById(getNextPlayableLevelId());

    const playBtnLabel = document.getElementById('menu-play-label');
    if (playBtnLabel) {
      playBtnLabel.textContent =
        clearedCount === 0
          ? `Play — Level ${nextLvl.code}: ${nextLvl.title}`
          : clearedCount < maxStages
          ? `Continue — Level ${nextLvl.code}: ${nextLvl.title}`
          : isGuest
          ? 'Play — Replay Guest Stages'
          : 'Play — Replay Campaign';
    }

    const statCleared = document.getElementById('menu-stat-cleared');
    const statDeaths = document.getElementById('menu-stat-deaths');
    const statAch = document.getElementById('menu-stat-ach');
    if (statCleared) statCleared.textContent = `${clearedCount} / ${maxStages}`;
    if (statDeaths) statDeaths.textContent = String(state.telemetry.totalDeaths);
    if (statAch) {
      statAch.textContent = isGuest
        ? 'Disabled'
        : `${state.unlockedAchievements.length} / ${window.ExoticAchievements.ACHIEVEMENTS.length}`;
    }

    const achBtn = document.getElementById('menu-btn-achievements');
    const achBtnLabel = document.getElementById('menu-ach-btn-label');
    if (achBtn) {
      achBtn.disabled = isGuest;
      achBtn.setAttribute('aria-disabled', String(isGuest));
      achBtn.title = isGuest ? 'Achievements are disabled for Guest accounts' : '';
    }
    if (achBtnLabel) {
      achBtnLabel.textContent = isGuest ? 'Achievements · Locked' : 'Achievements';
    }

    const lbBtn = document.getElementById('menu-btn-leaderboards');
    const lbBtnLabel = document.getElementById('menu-lb-btn-label');
    if (lbBtn) {
      lbBtn.disabled = isGuest;
      lbBtn.setAttribute('aria-disabled', String(isGuest));
      lbBtn.title = isGuest ? 'Leaderboards are disabled for Guest accounts' : '';
    }
    if (lbBtnLabel) {
      lbBtnLabel.textContent = isGuest ? 'Leaderboards · Locked' : 'Leaderboards';
    }

    const loadoutLabel = document.getElementById('menu-loadout-chip');
    if (loadoutLabel) {
      const charItem = window.ExoticShopData.getById(state.equipped.character);
      const auraItem = window.ExoticShopData.getById(state.equipped.aura);
      loadoutLabel.textContent = `${charItem ? charItem.name : 'Exotic Cube'} · ${
        auraItem && auraItem.id !== 'aura_none' ? auraItem.name : 'No Aura'
      }`;
    }

    updateCloudIndicators();
  }

  function buildLevelCardParts(lvl) {
    const state = window.ExoticStorage.getState();
    const stats = state.levelStats[lvl.id];
    const cleared = Boolean(stats && stats.cleared);
    const hasOrb = window.ExoticStorage.hasCollectedOrb(lvl.id);
    const guestLocked = Boolean(
      window.ExoticAuth?.isGuest() && !window.ExoticAuth.isGuestAllowedLevel(lvl.id)
    );

    const statusHtml = guestLocked
      ? `<span class="ex-chip ex-chip--subtle mono">${window.ExoticIcons.get('lock')}<span>Guest Locked</span></span>`
      : cleared
      ? `<span class="ex-chip ex-chip--inverted">${window.ExoticIcons.get('check')}<span>Cleared</span></span>`
      : `<span class="ex-video-badge">+${lvl.rewardCoins ?? 15} COINS · +${lvl.rewardSP ?? 1} SP</span>`;

    const badgeText = `STAGE ${lvl.code}`;

    const wrPill =
      !guestLocked && lvl.worldRecordTimeMs != null
        ? `<span class="ex-chip ex-chip--subtle mono">WR: ${formatTime(lvl.worldRecordTimeMs)}${
            lvl.worldRecordCallsign ? ` · ${escapeHtml(lvl.worldRecordCallsign)}` : ''
          }</span>`
        : '';

    const metaHtml = `
      <span class="ex-chip ex-chip--subtle mono">Best: ${
        cleared && stats.bestTimeMs ? formatTime(stats.bestTimeMs) : '—'
      }</span>
      <span class="ex-chip ex-chip--subtle mono">Min Deaths: ${
        cleared && typeof stats.leastDeaths === 'number' ? stats.leastDeaths : '—'
      }</span>
      <span class="ex-chip ex-chip--subtle mono">Par: ≤${lvl.parDeaths}d</span>
      ${wrPill}
    `;

    return {
      cleared,
      hasOrb,
      guestLocked,
      badgeText,
      statusHtml,
      metaHtml,
      btnLabel: guestLocked
        ? `Full Account Required · Stage ${lvl.code}`
        : cleared
        ? `Replay Stage ${lvl.code}`
        : `Play Stage ${lvl.code}`
    };
  }

  function renderLevelsView() {
    const grid = document.getElementById('levels-grid');
    if (!grid) return;
    window.ExoticPreviewDirector.clear();
    grid.innerHTML = '';

    const levelsChip = document.getElementById('levels-header-chip');
    if (levelsChip) {
      levelsChip.textContent = window.ExoticAuth?.isGuest()
        ? 'Guest Access · Stages 01–03 (04–08 Locked)'
        : '8 Stages · Hidden Skill Orbs · Par Targets';
    }

    window.ExoticLevels.LEVELS.forEach((lvl, idx) => {
      const parts = buildLevelCardParts(lvl);

      const card = document.createElement('article');
      card.className = `ex-video-card${parts.guestLocked ? ' is-guest-locked' : ''}`;
      card.setAttribute('data-level-card-id', String(lvl.id));
      card.innerHTML = `
        <div class="ex-video-stage">
          <canvas class="ex-video-canvas"></canvas>
          <div class="ex-video-overlay-top">
            <span class="ex-video-badge" data-lvl-badge>${escapeHtml(parts.badgeText)}</span>
            <span data-lvl-status style="display:inline-flex; align-items:center;">${parts.statusHtml}</span>
          </div>
          <div class="ex-video-scrubber"><div class="ex-video-scrubber-fill"></div></div>
        </div>
        <div class="ex-card-body">
          <div class="ex-card-title-row">
            <h3 class="ex-card-title" data-lvl-title>${lvl.code}. ${escapeHtml(lvl.title)}</h3>
            <span class="ex-chip ex-chip--subtle" data-lvl-orb>${
              parts.hasOrb ? 'Orb Found' : '1 Skill Orb'
            }</span>
          </div>
          <p class="ex-card-desc" data-lvl-desc>${escapeHtml(lvl.subtitle)}</p>
          <div class="level-meta-pills" data-lvl-meta>${parts.metaHtml}</div>
        </div>
        <div class="ex-card-footer">
          <button type="button" class="ex-pill-btn ${
            parts.guestLocked ? 'ex-pill-btn--secondary' : 'ex-pill-btn--primary'
          } ex-pill-btn--md ex-pill-btn--full" data-play-level="${lvl.id}" ${
        parts.guestLocked ? 'disabled' : ''
      }>
            <span data-lvl-btn-icon>${window.ExoticIcons.get(
              parts.guestLocked ? 'lock' : 'play'
            )}</span>
            <span data-lvl-btn-label>${escapeHtml(parts.btnLabel)}</span>
          </button>
        </div>
      `;

      grid.appendChild(card);

      const canvas = card.querySelector('.ex-video-canvas');
      const scrubber = card.querySelector('.ex-video-scrubber-fill');
      window.ExoticPreviewDirector.registerLevelCard(canvas, scrubber, lvl, idx);

      const btn = card.querySelector('[data-play-level]');
      btn.addEventListener('click', () => {
        window.ExoticAudio.click();
        launchLevel(lvl.id);
      });
    });
  }

  function patchLevelsViewInPlace() {
    const grid = document.getElementById('levels-grid');
    if (!grid) return;
    if (grid.children.length === 0) {
      renderLevelsView();
      return;
    }

    const levelsChip = document.getElementById('levels-header-chip');
    if (levelsChip) {
      levelsChip.textContent = window.ExoticAuth?.isGuest()
        ? 'Guest Access · Stages 01–03 (04–08 Locked)'
        : '8 Stages · Hidden Skill Orbs · Par Targets';
    }

    for (const lvl of window.ExoticLevels.LEVELS) {
      const card = grid.querySelector(`[data-level-card-id="${lvl.id}"]`);
      if (!card) continue;
      const parts = buildLevelCardParts(lvl);

      card.classList.toggle('is-guest-locked', Boolean(parts.guestLocked));

      const badgeEl = card.querySelector('[data-lvl-badge]');
      if (badgeEl) badgeEl.textContent = parts.badgeText;

      const statusEl = card.querySelector('[data-lvl-status]');
      if (statusEl) statusEl.innerHTML = parts.statusHtml;

      const titleEl = card.querySelector('[data-lvl-title]');
      if (titleEl) titleEl.textContent = `${lvl.code}. ${lvl.title}`;

      const orbEl = card.querySelector('[data-lvl-orb]');
      if (orbEl) orbEl.textContent = parts.hasOrb ? 'Orb Found' : '1 Skill Orb';

      const descEl = card.querySelector('[data-lvl-desc]');
      if (descEl) descEl.textContent = lvl.subtitle;

      const metaEl = card.querySelector('[data-lvl-meta]');
      if (metaEl) metaEl.innerHTML = parts.metaHtml;

      const btn = card.querySelector('[data-play-level]');
      if (btn) {
        btn.disabled = Boolean(parts.guestLocked);
        btn.className = `ex-pill-btn ${
          parts.guestLocked ? 'ex-pill-btn--secondary' : 'ex-pill-btn--primary'
        } ex-pill-btn--md ex-pill-btn--full`;
      }
      const btnIcon = card.querySelector('[data-lvl-btn-icon]');
      if (btnIcon) {
        btnIcon.innerHTML = window.ExoticIcons.get(parts.guestLocked ? 'lock' : 'play');
      }
      const btnLbl = card.querySelector('[data-lvl-btn-label]');
      if (btnLbl) btnLbl.textContent = parts.btnLabel;
    }
  }

  function renderShopLoadoutBar() {
    const loadoutWrap = document.getElementById('shop-loadout-chips');
    if (!loadoutWrap) return;
    const state = window.ExoticStorage.getState();
    const slots = [
      ['Aura', state.equipped.aura],
      ['Character', state.equipped.character],
      ['Skin', state.equipped.skin],
      ['Trail', state.equipped.trail],
      ['Emote', state.equipped.emote]
    ];
    loadoutWrap.innerHTML = slots
      .map(([label, id]) => {
        const item = window.ExoticShopData.getById(id);
        return `<span class="ex-chip ex-chip--subtle">${label}: ${escapeHtml(
          item ? item.name : id
        )}</span>`;
      })
      .join('');
  }

  function buildShopCardParts(item) {
    const state = window.ExoticStorage.getState();
    const guestLocked = Boolean(
      window.ExoticAuth?.isGuest() && !window.ExoticAuth.isGuestAllowedShopItem(item.id)
    );
    const owned = !guestLocked && window.ExoticStorage.ownsItem(item.id);
    const isUpgrade = item.category === 'upgrades';
    const slotMap = {
      auras: 'aura',
      characters: 'character',
      skins: 'skin',
      trails: 'trail',
      emotes: 'emote'
    };
    const isEquipped =
      !guestLocked &&
      (isUpgrade
        ? window.ExoticStorage.isUpgradeActive(item.id)
        : state.equipped[slotMap[item.category]] === item.id);

    const canAfford = isUpgrade ? state.skillPoints >= item.cost : state.coins >= item.cost;
    const currIcon = window.ExoticIcons.get(isUpgrade ? 'skill' : 'coin');
    const currUnit = isUpgrade ? 'SP' : 'Coins';

    let actionHtml = '';
    if (guestLocked) {
      actionHtml = `
        <button type="button" class="ex-pill-btn ex-pill-btn--secondary ex-pill-btn--sm ex-pill-btn--full" disabled>
          ${window.ExoticIcons.get('lock')}
          <span>Locked · Not Available for Guest</span>
        </button>
      `;
    } else if (!owned) {
      actionHtml = `
        <button type="button" class="ex-pill-btn ${
          canAfford ? 'ex-pill-btn--primary' : 'ex-pill-btn--secondary'
        } ex-pill-btn--sm ex-pill-btn--full" data-buy-id="${item.id}" ${
        canAfford ? '' : 'disabled'
      }>
          ${currIcon}
          <span>${item.cost === 0 ? 'Claim Free' : `Unlock — ${item.cost} ${currUnit}`}</span>
        </button>
      `;
    } else if (isUpgrade) {
      actionHtml = `
        <button type="button" class="ex-pill-btn ${
          isEquipped ? 'ex-pill-btn--primary' : 'ex-pill-btn--secondary'
        } ex-pill-btn--sm ex-pill-btn--full" data-equip-id="${item.id}">
          ${isEquipped ? window.ExoticIcons.get('check') : ''}
          <span>${isEquipped ? 'Active (Click to Disable)' : 'Disabled (Click to Enable)'}</span>
        </button>
      `;
    } else if (isEquipped) {
      actionHtml = `
        <button type="button" class="ex-pill-btn ex-pill-btn--secondary ex-pill-btn--sm ex-pill-btn--full" disabled>
          ${window.ExoticIcons.get('check')}
          <span>Equipped</span>
        </button>
      `;
    } else {
      actionHtml = `
        <button type="button" class="ex-pill-btn ex-pill-btn--primary ex-pill-btn--sm ex-pill-btn--full" data-equip-id="${item.id}">
          <span>Equip</span>
        </button>
      `;
    }

    const statusHtml = guestLocked
      ? `<span class="ex-chip ex-chip--subtle mono">Locked</span>`
      : isEquipped
      ? `<span class="ex-chip ex-chip--inverted">${isUpgrade ? 'Active' : 'Equipped'}</span>`
      : owned
      ? `<span class="ex-video-badge">Owned</span>`
      : `<span class="ex-video-badge">${item.cost} ${currUnit}</span>`;

    const globalUnlocksPill =
      item.totalUnlocks && item.totalUnlocks > 0
        ? `<span class="ex-chip ex-chip--subtle mono" style="height:22px; font-size:10px;">${item.totalUnlocks} Unlocked</span>`
        : '';

    return {
      guestLocked,
      actionHtml,
      statusHtml,
      globalUnlocksPill
    };
  }

  function bindShopCardAction(card, item) {
    const buyBtn = card.querySelector('[data-buy-id]');
    if (buyBtn) {
      buyBtn.addEventListener('click', () => {
        const res = window.ExoticStorage.buyShopItem(item);
        if (res.ok) {
          window.ExoticAudio.buy();
          showToast(`Unlocked ${item.name}!`);
          const newlyUnlocked = window.ExoticAchievements.evaluateAll();
          for (const ach of newlyUnlocked) {
            showToast(
              `Achievement: ${ach.title} (+${ach.rewardCoins} Coins, +${ach.rewardSP} SP)`
            );
          }
          window.ExoticBackdrop.resetMenuTrail();
          patchShopViewInPlace();
        } else {
          showToast(res.reason);
        }
      });
    }

    const equipBtn = card.querySelector('[data-equip-id]');
    if (equipBtn) {
      equipBtn.addEventListener('click', () => {
        window.ExoticAudio.click();
        window.ExoticStorage.equipItem(item);
        window.ExoticBackdrop.resetMenuTrail();
        patchShopViewInPlace();
      });
    }
  }

  function renderShopView() {
    const tabsWrap = document.getElementById('shop-category-tabs');
    const grid = document.getElementById('shop-items-grid');
    if (!tabsWrap || !grid) return;

    window.ExoticPreviewDirector.clear();

    tabsWrap.innerHTML = '';
    for (const cat of window.ExoticShopData.CATEGORIES) {
      const isAct = cat.id === activeShopCategory;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('data-shop-cat', cat.id);
      btn.className = `ex-pill-btn ${
        isAct ? 'ex-pill-btn--primary' : 'ex-pill-btn--secondary'
      } ex-pill-btn--sm`;
      const currIcon = window.ExoticIcons.get(cat.currency === 'sp' ? 'skill' : 'coin');
      btn.innerHTML = `${currIcon}<span>${escapeHtml(cat.label)}</span>`;
      btn.addEventListener('click', () => {
        window.ExoticAudio.click();
        activeShopCategory = cat.id;
        renderShopView();
      });
      tabsWrap.appendChild(btn);
    }

    renderShopLoadoutBar();

    grid.innerHTML = '';
    const items = window.ExoticShopData.getByCategory(activeShopCategory);

    items.forEach((item, idx) => {
      const parts = buildShopCardParts(item);

      const card = document.createElement('article');
      card.className = `ex-video-card${parts.guestLocked ? ' is-guest-locked' : ''}`;
      card.setAttribute('data-shop-card-id', item.id);
      card.innerHTML = `
        <div class="ex-video-stage">
          <canvas class="ex-video-canvas"></canvas>
          <div class="ex-video-overlay-top">
            <span class="ex-video-badge" data-shop-tier>${escapeHtml(item.tier)}</span>
            <span data-shop-status style="display:inline-flex; align-items:center;">${parts.statusHtml}</span>
          </div>
          <div class="ex-video-scrubber"><div class="ex-video-scrubber-fill"></div></div>
        </div>
        <div class="ex-card-body">
          <div class="ex-card-title-row">
            <h3 class="ex-card-title" data-shop-title>${escapeHtml(item.name)}</h3>
            <span data-shop-unlocks>${parts.globalUnlocksPill}</span>
          </div>
          <p class="ex-card-desc" data-shop-desc>${escapeHtml(item.desc)}</p>
        </div>
        <div class="ex-card-footer" data-shop-footer>
          ${parts.actionHtml}
        </div>
      `;

      grid.appendChild(card);

      const canvas = card.querySelector('.ex-video-canvas');
      const scrubber = card.querySelector('.ex-video-scrubber-fill');
      window.ExoticPreviewDirector.registerShopCard(canvas, scrubber, item, idx);

      bindShopCardAction(card, item);
    });
  }

  function patchShopViewInPlace() {
    renderShopLoadoutBar();
    const grid = document.getElementById('shop-items-grid');
    if (!grid) return;
    if (grid.children.length === 0) {
      renderShopView();
      return;
    }

    const items = window.ExoticShopData.getByCategory(activeShopCategory);
    for (const item of items) {
      const card = grid.querySelector(`[data-shop-card-id="${item.id}"]`);
      if (!card) continue;
      const parts = buildShopCardParts(item);
      card.classList.toggle('is-guest-locked', Boolean(parts.guestLocked));

      const tierEl = card.querySelector('[data-shop-tier]');
      if (tierEl) tierEl.textContent = item.tier;

      const statusEl = card.querySelector('[data-shop-status]');
      if (statusEl) statusEl.innerHTML = parts.statusHtml;

      const unlocksEl = card.querySelector('[data-shop-unlocks]');
      if (unlocksEl) unlocksEl.innerHTML = parts.globalUnlocksPill;

      const titleEl = card.querySelector('[data-shop-title]');
      if (titleEl) titleEl.textContent = item.name;

      const descEl = card.querySelector('[data-shop-desc]');
      if (descEl) descEl.textContent = item.desc;

      const footerEl = card.querySelector('[data-shop-footer]');
      if (footerEl) {
        footerEl.innerHTML = parts.actionHtml;
        bindShopCardAction(card, item);
      }
    }
  }

  function renderAchievementsView() {
    const grid = document.getElementById('achievements-grid');
    const summaryEl = document.getElementById('achievements-summary-chip');
    if (!grid) return;

    const state = window.ExoticStorage.getState();
    const list = window.ExoticAchievements.ACHIEVEMENTS;
    const unlockedCount = state.unlockedAchievements.length;

    if (summaryEl) {
      summaryEl.textContent = `${unlockedCount} / ${list.length} Unlocked`;
    }

    grid.innerHTML = list
      .map((ach) => {
        const unlocked = state.unlockedAchievements.includes(ach.id);
        const { current, target } = ach.progress(state);
        const pct = Math.min(100, Math.round((current / Math.max(1, target)) * 100));

        return `
          <article class="ach-card ${unlocked ? 'is-unlocked' : ''}">
            <div class="ach-top">
              <div class="ach-icon">
                ${window.ExoticIcons.get(unlocked ? 'check' : 'achievements')}
              </div>
              <div style="flex:1; display:flex; flex-direction:column; gap:4px;">
                <div class="ex-card-title-row">
                  <h3 class="ex-card-title">${escapeHtml(ach.title)}</h3>
                  <span class="ex-chip ex-chip--subtle mono">${current} / ${target}</span>
                </div>
                <p class="ex-card-desc">${escapeHtml(ach.desc)}</p>
              </div>
            </div>
            <div class="ach-progress-track">
              <div class="ach-progress-fill" style="width:${pct}%"></div>
            </div>
            <div class="ex-card-footer" style="padding-top:0;">
              <div style="display:flex; gap:6px; flex-wrap:wrap;">
                <span class="ex-chip ex-chip--subtle">+${ach.rewardCoins} Coins</span>
                <span class="ex-chip ex-chip--subtle">+${ach.rewardSP} SP</span>
                ${
                  ach.globalUnlocks && ach.globalUnlocks > 0
                    ? `<span class="ex-chip ex-chip--subtle mono">${ach.globalUnlocks} Global</span>`
                    : ''
                }
              </div>
              <span class="ex-chip ${unlocked ? 'ex-chip--inverted' : 'ex-chip--subtle'}">${
                unlocked ? 'Completed' : 'In Progress'
              }</span>
            </div>
          </article>
        `;
      })
      .join('');
  }

  async function renderLeaderboardsView() {
    const levelTabs = document.getElementById('lb-level-tabs');
    const sortTabs = document.getElementById('lb-sort-tabs');
    const panel = document.getElementById('lb-content');
    if (!panel || !levelTabs || !sortTabs) return;

    const filterOptions = [
      { id: 'all', label: 'All Stages' },
      ...window.ExoticLevels.LEVELS.map((l) => ({ id: String(l.id), label: `Stage ${l.code}` }))
    ];
    levelTabs.innerHTML = '';
    for (const opt of filterOptions) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `ex-pill-btn ${
        activeLbLevel === opt.id ? 'ex-pill-btn--primary' : 'ex-pill-btn--secondary'
      } ex-pill-btn--xs`;
      btn.textContent = opt.label;
      btn.addEventListener('click', () => {
        window.ExoticAudio.click();
        activeLbLevel = opt.id;
        renderLeaderboardsView();
      });
      levelTabs.appendChild(btn);
    }

    const sortOptions = [
      { id: 'time', label: 'Fastest Time' },
      { id: 'deaths', label: 'Fewest Deaths' },
      { id: 'coins', label: 'Most Coins' }
    ];
    sortTabs.innerHTML = '';
    for (const sOpt of sortOptions) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `ex-pill-btn ${
        activeLbSort === sOpt.id ? 'ex-pill-btn--primary' : 'ex-pill-btn--secondary'
      } ex-pill-btn--xs`;
      btn.textContent = sOpt.label;
      btn.addEventListener('click', () => {
        window.ExoticAudio.click();
        activeLbSort = sOpt.id;
        renderLeaderboardsView();
      });
      sortTabs.appendChild(btn);
    }

    const runs = await window.ExoticStorage.fetchLeaderboard();
    const filtered = runs
      .filter((r) =>
        activeLbLevel === 'all' ? true : Number(r.levelId) === Number(activeLbLevel)
      )
      .slice();

    filtered.sort((a, b) => {
      if (activeLbSort === 'deaths') {
        return a.deaths - b.deaths || a.timeMs - b.timeMs;
      }
      if (activeLbSort === 'coins') {
        return (b.coins || 0) - (a.coins || 0) || a.timeMs - b.timeMs;
      }
      return a.timeMs - b.timeMs || a.deaths - b.deaths;
    });

    if (filtered.length === 0) {
      panel.innerHTML = `
        <div class="lb-empty">
          <div class="lb-empty-icon">${window.ExoticIcons.get('leaderboards')}</div>
          <h3 class="ex-card-title" style="font-size:18px;">No Verified Runs Recorded Yet</h3>
          <p class="ex-card-desc" style="max-width:440px;">
            Be the first runner on the board. Complete any stage and publish your run to claim Rank #1.
          </p>
          <button type="button" class="ex-pill-btn ex-pill-btn--primary ex-pill-btn--md" id="lb-empty-play-btn">
            ${window.ExoticIcons.get('play')}
            <span>Play Stage 01 Now</span>
          </button>
        </div>
      `;
      const emptyPlayBtn = document.getElementById('lb-empty-play-btn');
      if (emptyPlayBtn) {
        emptyPlayBtn.addEventListener('click', () => {
          window.ExoticAudio.click();
          launchLevel(1);
        });
      }
      return;
    }

    const rowsHtml = filtered
      .slice(0, 50)
      .map((r, i) => {
        const lvl = window.ExoticLevels.getById(r.levelId);
        return `
          <div class="lb-row">
            <div><span class="lb-rank">#${i + 1}</span></div>
            <div style="font-weight:700; display:flex; align-items:center; gap:8px;">
              <span>${escapeHtml(r.callsign)}</span>
              ${
                r.deaths === 0
                  ? '<span class="ex-chip ex-chip--subtle" style="height:20px; font-size:10px;">0d</span>'
                  : ''
              }
            </div>
            <div class="lb-hide-sm" style="color:var(--fg-secondary);">${
              lvl ? `${lvl.code}. ${escapeHtml(lvl.title)}` : `Stage ${r.levelId}`
            }</div>
            <div class="mono" style="font-weight:700;">${formatTime(r.timeMs)}</div>
            <div class="mono">${r.deaths} ${r.deaths === 1 ? 'death' : 'deaths'}</div>
            <div class="lb-hide-sm">
              <button type="button" class="ex-pill-btn ex-pill-btn--secondary ex-pill-btn--xs" data-race-level="${
                r.levelId
              }">
                ${window.ExoticIcons.get('ghost')}
                <span>Race Ghost</span>
              </button>
            </div>
          </div>
        `;
      })
      .join('');

    panel.innerHTML = `
      <div class="lb-row lb-row--head">
        <div>Rank</div>
        <div>Player</div>
        <div class="lb-hide-sm">Stage</div>
        <div>Clear Time</div>
        <div>Deaths</div>
        <div class="lb-hide-sm">Ghost</div>
      </div>
      ${rowsHtml}
    `;

    panel.querySelectorAll('[data-race-level]').forEach((btn) => {
      btn.addEventListener('click', () => {
        window.ExoticAudio.click();
        launchLevel(Number(btn.getAttribute('data-race-level')));
      });
    });
  }

  function renderMonochromeRunnerCardPng() {
    const state = window.ExoticStorage.getState();
    const pal = window.ExoticTheme.getPalette();
    const off = document.createElement('canvas');
    off.width = 640;
    off.height = 360;
    const c = off.getContext('2d');

    c.fillStyle = pal.stageBg;
    c.fillRect(0, 0, 640, 360);

    c.fillStyle = pal.bgPillar;
    for (let x = 28; x < 640; x += 96) {
      c.fillRect(x, 36 + (x % 48), 28, 324);
    }

    c.fillStyle = pal.platformFill;
    c.globalAlpha = 0.08;
    c.beginPath();
    c.roundRect(28, 28, 236, 304, 22);
    c.fill();
    c.globalAlpha = 1;

    c.fillStyle = pal.platformFill;
    c.beginPath();
    c.roundRect(62, 248, 168, 18, 9);
    c.fill();
    if (pal.colored) {
      c.fillStyle = pal.platformCap;
      c.beginPath();
      c.roundRect(66, 248, 160, 4, 2);
      c.fill();
    }

    const t = performance.now() / 1000;
    c.save();
    c.translate(146, 206);
    c.scale(2.4, 2.4);
    window.ExoticAuraRenderer.drawBack(c, state.equipped.aura, 0, 0, t, pal);
    window.ExoticCharacterRenderer.draw(c, {
      x: -11,
      y: -13,
      w: 22,
      h: 26,
      vx: 0,
      vy: 0,
      facing: 1,
      gravitySign: 1,
      onGround: true,
      characterId: state.equipped.character,
      skinId: state.equipped.skin,
      palette: pal,
      time: t,
      alpha: 1
    });
    window.ExoticAuraRenderer.drawFront(c, state.equipped.aura, 0, 0, t, pal);
    c.restore();

    const isGuest = Boolean(window.ExoticAuth?.isGuest());
    const maxStages = isGuest ? window.ExoticAuth.GUEST_MAX_LEVEL : 8;
    const callsign = (state.callsign || 'EXOTIC RUNNER').toUpperCase();
    const cleared = Object.entries(state.levelStats).filter(
      ([lvlId, s]) => Number(lvlId) <= maxStages && s && s.cleared
    ).length;
    const charItem = window.ExoticShopData.getById(state.equipped.character);
    const skinItem = window.ExoticShopData.getById(state.equipped.skin);
    const auraItem = window.ExoticShopData.getById(state.equipped.aura);

    c.fillStyle = pal.colored
      ? pal.mode === 'light'
        ? '#4f46e5'
        : '#818cf8'
      : pal.playerPrimary;
    c.font = '900 13px -apple-system, BlinkMacSystemFont, sans-serif';
    c.fillText(isGuest ? 'EXOTIC · GUEST LOADOUT' : 'EXOTIC · RUNNER LOADOUT', 292, 64);

    if (pal.colored) {
      c.fillStyle = pal.text || pal.playerPrimary;
    }
    c.font = '900 32px -apple-system, BlinkMacSystemFont, sans-serif';
    c.fillText(callsign.slice(0, 16), 292, 108);

    c.globalAlpha = 0.72;
    c.font = '600 15px -apple-system, BlinkMacSystemFont, sans-serif';
    c.fillText(
      `${charItem ? charItem.name : 'Exotic Cube'} · ${skinItem ? skinItem.name : 'Pure Solid'}`,
      292,
      142
    );
    c.fillText(
      isGuest
        ? `Aura: ${auraItem ? auraItem.name : 'None'} · Guest Runner`
        : `Aura: ${auraItem ? auraItem.name : 'None'} · ${state.unlockedAchievements.length}/10 Achievements`,
      292,
      168
    );
    c.globalAlpha = 1;

    const pills = [
      ['CLEARED', `${cleared} / ${maxStages}`],
      ['DEATHS', `${state.telemetry.totalDeaths}`],
      ['COINS', `${state.coins}`]
    ];
    const pillAccents = pal.colored
      ? pal.mode === 'light'
        ? ['#059669', '#e11d48', '#d97706']
        : ['#34d399', '#fb7185', '#fbbf24']
      : [pal.playerPrimary, pal.playerPrimary, pal.playerPrimary];
    pills.forEach(([lbl, val], idx) => {
      const px = 292 + idx * 108;
      const py = 216;
      c.globalAlpha = pal.colored ? 0.14 : 0.1;
      c.fillStyle = pillAccents[idx];
      c.beginPath();
      c.roundRect(px, py, 98, 72, 16);
      c.fill();
      c.globalAlpha = pal.colored ? 0.72 : 0.62;
      c.fillStyle = pal.colored ? pal.text || pal.playerPrimary : pal.playerPrimary;
      c.font = '700 10px ui-monospace, SFMono-Regular, Menlo, monospace';
      c.fillText(lbl, px + 14, py + 24);
      c.globalAlpha = 1;
      c.fillStyle = pillAccents[idx];
      c.font = '800 19px ui-monospace, SFMono-Regular, Menlo, monospace';
      c.fillText(val, px + 14, py + 52);
    });

    return off.toDataURL('image/png');
  }

  function renderSettingsView() {
    const state = window.ExoticStorage.getState();
    const s = state.settings;
    syncThemeButtonsUI();

    const muteBtn = document.getElementById('set-audio-toggle');
    if (muteBtn) {
      muteBtn.className = `ex-pill-btn ${
        !s.muted ? 'ex-pill-btn--primary' : 'ex-pill-btn--secondary'
      } ex-pill-btn--sm`;
      muteBtn.textContent = s.muted ? 'Muted (Click to Enable)' : 'Audio Enabled';
    }

    const volBtns = document.querySelectorAll('[data-vol-preset]');
    volBtns.forEach((btn) => {
      const val = Number(btn.getAttribute('data-vol-preset'));
      const active = Math.abs(s.volume - val) < 0.08 && !s.muted;
      btn.className = `ex-pill-btn ${
        active ? 'ex-pill-btn--primary' : 'ex-pill-btn--secondary'
      } ex-pill-btn--xs`;
    });

    const shakeBtn = document.getElementById('set-shake-toggle');
    if (shakeBtn) {
      shakeBtn.className = `ex-pill-btn ${
        s.screenShake ? 'ex-pill-btn--primary' : 'ex-pill-btn--secondary'
      } ex-pill-btn--sm`;
      shakeBtn.textContent = s.screenShake ? 'Enabled' : 'Disabled';
    }

    const touchBtn = document.getElementById('set-touch-toggle');
    if (touchBtn) {
      touchBtn.className = `ex-pill-btn ${
        s.touchControls ? 'ex-pill-btn--primary' : 'ex-pill-btn--secondary'
      } ex-pill-btn--sm`;
      touchBtn.textContent = s.touchControls ? 'Visible' : 'Hidden';
    }

    const ghostsBtn = document.getElementById('set-ghosts-toggle');
    if (ghostsBtn) {
      const gOn = s.liveGhosts !== false;
      ghostsBtn.className = `ex-pill-btn ${
        gOn ? 'ex-pill-btn--primary' : 'ex-pill-btn--secondary'
      } ex-pill-btn--sm`;
      ghostsBtn.textContent = gOn ? 'Enabled' : 'Hidden';
    }

    const isGuest = Boolean(window.ExoticAuth?.isGuest());
    const lbControlsWrap = document.getElementById('set-lb-controls-wrap');
    const lbShareBtn = document.getElementById('set-lb-share-toggle');
    const lbPromptBtn = document.getElementById('set-lb-prompt-toggle');
    if (lbControlsWrap) {
      lbControlsWrap.classList.toggle('is-hidden', isGuest);
    }
    if (lbShareBtn) {
      const shareOn = !isGuest && Boolean(s.leaderboardShareEnabled);
      lbShareBtn.className = `ex-pill-btn ${
        shareOn ? 'ex-pill-btn--primary' : 'ex-pill-btn--secondary'
      } ex-pill-btn--sm`;
      lbShareBtn.textContent = shareOn ? 'Enabled' : 'Disabled';
      lbShareBtn.setAttribute('aria-pressed', String(shareOn));
      lbShareBtn.disabled = isGuest;
    }
    if (lbPromptBtn) {
      const promptOn = !isGuest && Boolean(s.leaderboardPromptEnabled);
      lbPromptBtn.className = `ex-pill-btn ${
        promptOn ? 'ex-pill-btn--primary' : 'ex-pill-btn--secondary'
      } ex-pill-btn--sm`;
      lbPromptBtn.textContent = promptOn ? 'Enabled' : 'Disabled';
      lbPromptBtn.setAttribute('aria-pressed', String(promptOn));
      lbPromptBtn.disabled = isGuest;
    }

    const roleTitle = document.getElementById('set-account-role-title');
    const roleDesc = document.getElementById('set-account-role-desc');
    const delBtnLabel = document.getElementById('set-delete-account-label');
    const accountBadge = document.getElementById('set-account-username');
    const guestWrap = document.getElementById('set-guest-username-wrap');
    const authMethodsWrap = document.getElementById('set-auth-methods-wrap');

    if (roleTitle) {
      roleTitle.textContent = isGuest ? 'Registered Guest Account' : 'Registered Account';
    }
    if (roleDesc) {
      roleDesc.textContent = isGuest
        ? 'You remain bound to this Guest account across sign-outs until deleted below. No password or authentication methods are used.'
        : 'You remain bound to this account across sign-outs until deleted below.';
    }
    if (delBtnLabel) {
      delBtnLabel.textContent = isGuest ? 'Delete Guest Account' : 'Delete Account';
    }
    if (accountBadge && window.ExoticAuth) {
      const uname = window.ExoticAuth.getUsername() || state.callsign || 'runner';
      if (isGuest) {
        accountBadge.textContent = `@${uname} · Guest Account`;
      } else {
        const activeList = window.ExoticAuth.getAuthMethods();
        const methodLabel = window.ExoticAuth.formatMethodListLabel(activeList);
        accountBadge.textContent = `@${uname} · ${methodLabel}`;
      }
    }

    if (guestWrap) guestWrap.classList.toggle('is-hidden', !isGuest);
    if (authMethodsWrap) authMethodsWrap.classList.toggle('is-hidden', isGuest);

    if (isGuest) {
      const guestInput = document.getElementById('set-guest-username-input');
      const curUname = window.ExoticAuth?.getUsername() || state.callsign || '';
      if (guestInput && document.activeElement !== guestInput) {
        guestInput.value = curUname;
        guestInput.setCustomValidity('');
        setAuthValidationUI(
          'set-guest',
          'neutral',
          `Current Guest username @${curUname} · Edit to check availability`,
          'GUEST',
          'user'
        );
      }
    } else {
      renderSettingsAuthMethods();
    }

    const delConfirmBox = document.getElementById('set-delete-confirm-box');
    if (delConfirmBox && !window.ExoticAuth?.isSignedIn?.()) {
      delConfirmBox.classList.remove('is-open');
    }

    const anonInput = document.getElementById('set-anon-key-input');
    if (anonInput && document.activeElement !== anonInput && window.ExoticSupabase) {
      const cfg = window.ExoticSupabase.getConfig();
      anonInput.value = cfg.anonKey || '';
    }

    const cardPreview = document.getElementById('set-card-preview-wrap');
    if (cardPreview) {
      if (state.runnerCardUrl) {
        cardPreview.classList.remove('is-empty');
        cardPreview.innerHTML = `<img src="${escapeHtml(
          state.runnerCardUrl
        )}" alt="Runner Loadout Card" />`;
      } else {
        cardPreview.classList.add('is-empty');
        cardPreview.innerHTML = '';
      }
    }

    updateCloudIndicators();
  }

  function launchLevel(levelId) {
    if (window.ExoticAuth?.isGuest() && !window.ExoticAuth.isGuestAllowedLevel(levelId)) {
      showToast('Stages 04–08 require a full account. Delete Guest in Settings to register.');
      return;
    }
    closeModals();
    window.ExoticRouter.navigate('play', { levelId });
    const touchWrap = document.getElementById('touch-controls');
    const useTouch =
      window.ExoticStorage.getState().settings.touchControls ||
      ('ontouchstart' in window && window.innerWidth < 960);
    if (touchWrap) {
      touchWrap.classList.toggle('is-enabled', Boolean(useTouch));
    }
    window.ExoticEngine.startLevel(levelId);
    updateCloudIndicators();
  }

  function openPauseModal(isPaused) {
    const modal = document.getElementById('pause-modal');
    if (!modal) return;
    modal.classList.toggle('is-open', Boolean(isPaused));
  }

  function getLocalLbNoticeKey(username) {
    return `${LB_NOTICE_LOCAL_PREFIX}${String(username || '').trim().toLowerCase()}`;
  }

  function hasSeenLbFirstSigninNotice(username) {
    const clean = String(username || '').trim().toLowerCase();
    if (!clean) return false;
    if (window.ExoticStorage?.getState()?.settings?.leaderboardNoticeSeen === true) {
      return true;
    }
    try {
      return localStorage.getItem(getLocalLbNoticeKey(clean)) === '1';
    } catch {
      return false;
    }
  }

  function markLbFirstSigninNoticeSeen(username) {
    const clean = String(username || '').trim().toLowerCase();
    if (clean) {
      try {
        localStorage.setItem(getLocalLbNoticeKey(clean), '1');
      } catch {
        // Ignore storage quota error
      }
    }
    return window.ExoticStorage?.updateSettings({ leaderboardNoticeSeen: true });
  }

  function clearLbFirstSigninNoticeLocal(username) {
    const clean = String(username || '').trim().toLowerCase();
    if (!clean) return;
    try {
      localStorage.removeItem(getLocalLbNoticeKey(clean));
    } catch {
      // Ignore storage error
    }
  }

  function maybeShowFirstSignInLeaderboardDialog() {
    const modal = document.getElementById('lb-first-signin-modal');
    if (!modal || !window.ExoticAuth) return;
    if (!window.ExoticAuth.isSignedIn() || window.ExoticAuth.isGuest()) {
      modal.classList.remove('is-open');
      return;
    }
    const route = window.ExoticRouter?.getCurrent?.() || '';
    if (!route || route === 'splash' || route === 'signup' || route === 'signin') {
      return;
    }
    if (modal.classList.contains('is-open')) {
      return;
    }
    const uname = window.ExoticAuth.getUsername();
    if (!uname || hasSeenLbFirstSigninNotice(uname)) {
      return;
    }
    markLbFirstSigninNoticeSeen(uname);
    modal.classList.add('is-open');
  }

  function syncVictoryLeaderboardUI() {
    const state = window.ExoticStorage.getState();
    const s = state.settings || {};
    const isGuest = Boolean(window.ExoticAuth?.isGuest());
    const shareEnabled = !isGuest && Boolean(s.leaderboardShareEnabled);

    const lbDisabledWrap = document.getElementById('vic-lb-disabled-wrap');
    const publishWrap = document.getElementById('vic-publish-wrap');
    const guestLbNote = document.getElementById('vic-guest-lb-disabled');
    const statusText = document.getElementById('vic-lb-status-text');
    const callsignInput = document.getElementById('vic-callsign-input');
    const publishBtn = document.getElementById('vic-publish-btn');
    const dontStoreBtn = document.getElementById('vic-dont-store-btn');

    if (guestLbNote) guestLbNote.classList.toggle('is-hidden', !isGuest);
    if (lbDisabledWrap) lbDisabledWrap.classList.toggle('is-hidden', isGuest || shareEnabled);
    if (publishWrap) publishWrap.classList.toggle('is-hidden', isGuest || !shareEnabled);

    if (callsignInput) {
      callsignInput.value =
        (window.ExoticAuth && window.ExoticAuth.getUsername()) || state.callsign || '';
    }

    if (!isGuest && shareEnabled) {
      if (lastWinShareDecision === 'shared') {
        if (statusText) {
          statusText.textContent = 'Shared publicly on Leaderboards (visible to everyone).';
        }
        if (publishBtn) {
          publishBtn.disabled = true;
          publishBtn.className = 'ex-pill-btn ex-pill-btn--primary ex-pill-btn--sm';
          publishBtn.innerHTML = `${window.ExoticIcons.get('check')}<span>Shared Publicly</span>`;
        }
        if (dontStoreBtn) dontStoreBtn.classList.add('is-hidden');
      } else if (lastWinShareDecision === 'declined') {
        if (statusText) {
          statusText.textContent = 'Run was not stored at all.';
        }
        if (publishBtn) {
          publishBtn.disabled = true;
          publishBtn.className = 'ex-pill-btn ex-pill-btn--secondary ex-pill-btn--sm';
          publishBtn.innerHTML = `<span>Run Not Stored</span>`;
        }
        if (dontStoreBtn) dontStoreBtn.classList.add('is-hidden');
      } else {
        if (statusText) {
          statusText.textContent =
            'Runs are never stored automatically. Choose whether to share publicly (visible to everyone) or not store it at all.';
        }
        if (publishBtn) {
          publishBtn.disabled = false;
          publishBtn.className = 'ex-pill-btn ex-pill-btn--primary ex-pill-btn--sm';
          publishBtn.innerHTML = `${window.ExoticIcons.get('leaderboards')}<span>Share Run Publicly</span>`;
        }
        if (dontStoreBtn) {
          dontStoreBtn.disabled = false;
          dontStoreBtn.classList.remove('is-hidden');
        }
      }
    }
  }

  function openLbSharePromptModal() {
    if (!lastWinPayload) return;
    if (window.ExoticAuth?.isGuest()) return;
    const state = window.ExoticStorage.getState();
    if (!state.settings?.leaderboardShareEnabled) return;
    if (lastWinShareDecision !== 'pending') return;

    const promptModal = document.getElementById('lb-share-prompt-modal');
    if (!promptModal) return;

    const uname =
      (window.ExoticAuth && window.ExoticAuth.getUsername()) || state.callsign || 'runner';
    const titleEl = document.getElementById('lb-share-prompt-title');
    const runnerEl = document.getElementById('lb-prompt-runner');
    const timeEl = document.getElementById('lb-prompt-time');
    const deathsEl = document.getElementById('lb-prompt-deaths');
    const confirmBtn = document.getElementById('lb-prompt-confirm-share-btn');
    const declineBtn = document.getElementById('lb-prompt-decline-btn');

    if (titleEl) {
      titleEl.textContent = `Share Stage ${lastWinPayload.level.code} Run Publicly?`;
    }
    if (runnerEl) runnerEl.textContent = `@${uname}`;
    if (timeEl) timeEl.textContent = formatTime(lastWinPayload.timeMs);
    if (deathsEl) deathsEl.textContent = String(lastWinPayload.deaths);
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.innerHTML = `${window.ExoticIcons.get('leaderboards')}<span>Share Publicly (Visible to Everyone)</span>`;
    }
    if (declineBtn) {
      declineBtn.disabled = false;
    }

    promptModal.classList.add('is-open');
  }

  function closeLbSharePromptModal() {
    document.getElementById('lb-share-prompt-modal')?.classList.remove('is-open');
  }

  async function confirmPublicRunShare() {
    if (!lastWinPayload) return;
    if (window.ExoticAuth?.isGuest()) return;
    const state = window.ExoticStorage.getState();
    if (!state.settings?.leaderboardShareEnabled) {
      showToast('Leaderboards Share is disabled in Settings.');
      closeLbSharePromptModal();
      syncVictoryLeaderboardUI();
      return;
    }

    const inputEl = document.getElementById('vic-callsign-input');
    const callsign =
      (inputEl && inputEl.value.trim()) ||
      (window.ExoticAuth && window.ExoticAuth.getUsername()) ||
      state.callsign ||
      '';
    if (!callsign) {
      showToast('Sign in with a full account to share runs publicly.');
      return;
    }

    const confirmBtn = document.getElementById('lb-prompt-confirm-share-btn');
    const declineBtn = document.getElementById('lb-prompt-decline-btn');
    const vicBtn = document.getElementById('vic-publish-btn');
    if (confirmBtn) confirmBtn.disabled = true;
    if (declineBtn) declineBtn.disabled = true;
    if (vicBtn) vicBtn.disabled = true;

    const res = await window.ExoticStorage.submitRun({
      callsign,
      levelId: lastWinPayload.level.id,
      levelTitle: lastWinPayload.level.title,
      timeMs: lastWinPayload.timeMs,
      deaths: lastWinPayload.deaths,
      coins: lastWinPayload.coinsCollected,
      sampleIntervalMs: lastWinPayload.sampleIntervalMs || 80,
      frames: lastWinPayload.frames || [],
      publicShareConfirmed: true
    });

    if (res.ok) {
      lastWinShareDecision = 'shared';
      closeLbSharePromptModal();
      syncVictoryLeaderboardUI();
      window.ExoticAudio.buy();
      showToast(`Run shared publicly on Leaderboards under @${callsign}.`);
    } else {
      if (confirmBtn) confirmBtn.disabled = false;
      if (declineBtn) declineBtn.disabled = false;
      syncVictoryLeaderboardUI();
      showToast(res.reason || 'Run was not stored.');
    }
  }

  function declinePublicRunShare() {
    lastWinShareDecision = 'declined';
    closeLbSharePromptModal();
    syncVictoryLeaderboardUI();
    showToast('Run was not stored.');
  }

  function openVictoryModal(payload) {
    lastWinPayload = payload;
    lastWinShareDecision = 'pending';
    const modal = document.getElementById('victory-modal');
    if (!modal) return;

    const state = window.ExoticStorage.getState();
    const s = state.settings || {};
    const isGuest = Boolean(window.ExoticAuth?.isGuest());
    const maxStage = isGuest ? window.ExoticAuth.GUEST_MAX_LEVEL : 8;
    const titleEl = document.getElementById('vic-stage-title');
    const timeEl = document.getElementById('vic-time');
    const deathsEl = document.getElementById('vic-deaths');
    const rewardsEl = document.getElementById('vic-rewards');
    const nextBtn = document.getElementById('vic-next-btn');

    if (titleEl) titleEl.textContent = `Stage ${payload.level.code}: ${payload.level.title} Cleared`;
    if (timeEl) timeEl.textContent = formatTime(payload.timeMs);
    if (deathsEl) deathsEl.textContent = String(payload.deaths);
    if (rewardsEl) {
      rewardsEl.textContent = payload.rewardSummary.firstClear
        ? `+${payload.rewardSummary.earnedCoins} Coins · +${payload.rewardSummary.earnedSP} SP`
        : 'Already Completed';
    }
    if (nextBtn) {
      const hasNext = payload.level.id < maxStage;
      nextBtn.style.display = hasNext ? 'inline-flex' : 'none';
    }

    closeLbSharePromptModal();
    syncVictoryLeaderboardUI();
    modal.classList.add('is-open');

    if (!isGuest && s.leaderboardShareEnabled === true && s.leaderboardPromptEnabled === true) {
      openLbSharePromptModal();
    }
  }

  function closeModals() {
    ['pause-modal', 'victory-modal', 'lb-share-prompt-modal'].forEach((id) => {
      document.getElementById(id)?.classList.remove('is-open');
    });
  }

  function getMethodIconName(method) {
    if (method === 'faceid') return 'faceid';
    if (method === 'fingerprint') return 'fingerprint';
    if (method === 'pin') return 'pin';
    return 'key';
  }

  function setAuthValidationUI(prefix, stateType, message, badgeText, iconName) {
    const pill = document.getElementById(`${prefix}-validation-pill`);
    const iconEl = document.getElementById(`${prefix}-validation-icon`);
    const msgEl = document.getElementById(`${prefix}-validation-msg`);
    const badgeEl = document.getElementById(`${prefix}-validation-badge`);
    if (pill) {
      pill.classList.remove('is-valid', 'is-invalid');
      if (stateType === 'valid') pill.classList.add('is-valid');
      else if (stateType === 'invalid') pill.classList.add('is-invalid');
    }
    if (iconEl && iconName) {
      iconEl.innerHTML = window.ExoticIcons.get(iconName);
    }
    if (msgEl) msgEl.textContent = message;
    if (badgeEl) badgeEl.textContent = badgeText;
  }

  function setCredentialValidationUI(prefix, stateType, message, badgeText, iconName) {
    const pill = document.getElementById(`${prefix}-cred-pill`);
    const iconEl = document.getElementById(`${prefix}-cred-icon`);
    const msgEl = document.getElementById(`${prefix}-cred-msg`);
    const badgeEl = document.getElementById(`${prefix}-cred-badge`);
    if (pill) {
      pill.classList.remove('is-valid', 'is-invalid');
      if (stateType === 'valid') pill.classList.add('is-valid');
      else if (stateType === 'invalid') pill.classList.add('is-invalid');
    }
    if (iconEl && iconName) {
      iconEl.innerHTML = window.ExoticIcons.get(iconName);
    }
    if (msgEl) msgEl.textContent = message;
    if (badgeEl) badgeEl.textContent = badgeText;
  }

  function syncBiometricCardUI(prefix) {
    const isSignup = prefix === 'signup';
    const method = isSignup ? signupAuthMethod : signinAuthMethod;
    if (method !== 'fingerprint' && method !== 'faceid') return;

    const support = window.ExoticAuth
      ? window.ExoticAuth.getMethodSupport(method)
      : { supported: true };
    const labelText = window.ExoticAuth
      ? window.ExoticAuth.formatMethodLabel(method)
      : method === 'faceid'
      ? 'Face ID'
      : 'Fingerprint';
    const iconName = getMethodIconName(method);
    const unameInput = document.getElementById(`${prefix}-username-input`);
    const currentUser = unameInput ? unameInput.value.trim().toLowerCase() : '';
    const tokenObj = isSignup ? signupBioEnrollment : signinBioAssertion;
    const isVerified = Boolean(
      tokenObj &&
        tokenObj.method === method &&
        (!currentUser || tokenObj.username === currentUser)
    );

    const lblEl = document.getElementById(`${prefix}-bio-label`);
    const tagEl = document.getElementById(`${prefix}-bio-tag`);
    const emblemEl = document.getElementById(`${prefix}-bio-emblem`);
    const titleEl = document.getElementById(`${prefix}-bio-title`);
    const descEl = document.getElementById(`${prefix}-bio-desc`);
    const cardEl = document.getElementById(`${prefix}-bio-card`);
    const scanBtn = document.getElementById(`${prefix}-bio-scan-btn`);
    const btnIconEl = document.getElementById(`${prefix}-bio-btn-icon`);
    const btnLblEl = document.getElementById(`${prefix}-bio-btn-label`);
    const viewportEl = document.getElementById(`${prefix}-face-viewport`);

    if (viewportEl && !cardEl?.classList.contains('is-scanning')) {
      viewportEl.classList.remove('is-open');
    }

    if (lblEl) lblEl.textContent = `${labelText} Passkey`;
    if (tagEl) {
      tagEl.textContent = !support.supported ? 'UNSUPPORTED' : 'HARDWARE SENSOR';
    }
    if (emblemEl) {
      emblemEl.innerHTML = window.ExoticIcons.get(
        !support.supported ? 'skull' : isVerified ? 'check' : iconName
      );
    }
    if (btnIconEl) {
      btnIconEl.innerHTML = window.ExoticIcons.get(isVerified ? 'check' : iconName);
    }
    if (cardEl) {
      cardEl.classList.remove('is-scanning');
      cardEl.classList.toggle('is-verified', isVerified && support.supported);
    }
    if (scanBtn) {
      scanBtn.disabled = !support.supported;
    }

    if (!support.supported) {
      const msg =
        support.reason ||
        `${labelText} hardware sensor is not available on this device — choose Password or PIN`;
      if (titleEl) titleEl.textContent = `${labelText} Unavailable`;
      if (descEl) descEl.textContent = msg;
      if (btnLblEl) btnLblEl.textContent = 'Unavailable';
      setCredentialValidationUI(prefix, 'invalid', msg, 'NO SENSOR', 'skull');
      return;
    }

    if (isSignup) {
      if (titleEl) {
        titleEl.textContent = isVerified
          ? `${labelText} Enrolled`
          : `Enroll ${labelText}`;
      }
      if (descEl) {
        descEl.textContent = isVerified
          ? `Hardware ${labelText} scan verified and ready for account creation.`
          : `Scan your ${labelText} on your device sensor now, or press Create Account to scan automatically.`;
      }
      if (btnLblEl) btnLblEl.textContent = isVerified ? 'Re-scan' : 'Scan';
      setCredentialValidationUI(
        'signup',
        isVerified ? 'valid' : 'neutral',
        isVerified
          ? `Hardware ${labelText} verified and ready`
          : `Tap Scan or Create Account to scan ${labelText}`,
        isVerified ? 'VERIFIED' : 'SENSOR',
        isVerified ? 'check' : iconName
      );
    } else {
      if (titleEl) {
        titleEl.textContent = isVerified
          ? `${labelText} Verified`
          : `Verify ${labelText}`;
      }
      if (descEl) {
        descEl.textContent = isVerified
          ? `Hardware ${labelText} verified — press Sign In to enter.`
          : `Scan your ${labelText} on your device sensor, or press Sign In to scan automatically.`;
      }
      if (btnLblEl) btnLblEl.textContent = isVerified ? 'Verified' : 'Verify';
      setCredentialValidationUI(
        'signin',
        isVerified ? 'valid' : 'neutral',
        isVerified
          ? `Hardware ${labelText} verified — ready to sign in`
          : `Tap Verify or Sign In to scan ${labelText}`,
        isVerified ? 'VERIFIED' : 'SENSOR',
        isVerified ? 'check' : iconName
      );
    }
  }

  function setSettingsAuthFeedback(status, message, badgeText, iconName) {
    const pill = document.getElementById('set-auth-feedback');
    const msgEl = document.getElementById('set-auth-feedback-msg');
    const badgeEl = document.getElementById('set-auth-feedback-badge');
    const iconEl = document.getElementById('set-auth-feedback-icon');
    if (!pill) return;

    pill.classList.remove('is-valid', 'is-invalid');
    if (status === 'valid') pill.classList.add('is-valid');
    if (status === 'invalid') pill.classList.add('is-invalid');

    if (msgEl) msgEl.textContent = message;
    if (badgeEl) badgeEl.textContent = badgeText;
    if (iconEl && window.ExoticIcons) {
      iconEl.innerHTML = window.ExoticIcons.get(iconName || 'lock');
    }
  }

  function renderSettingsAuthMethods(preserveFeedback = false) {
    if (!window.ExoticAuth) return;
    const activeMethods = window.ExoticAuth.getAuthMethods();

    if (!preserveFeedback && !settingsAuthBusy) {
      const summary = window.ExoticAuth.formatMethodListLabel(activeMethods);
      setSettingsAuthFeedback(
        'neutral',
        `Active on Sign In: ${summary}`,
        `${activeMethods.length} ACTIVE`,
        'check'
      );
    }

    const methods = ['password', 'pin', 'fingerprint', 'faceid'];
    for (const m of methods) {
      const isActive = activeMethods.includes(m);
      const statusChip = document.getElementById(`set-status-${m}`);
      const connectBtn = document.getElementById(`set-connect-${m}-btn`);
      const disconnectBtn = document.getElementById(`set-disconnect-${m}-btn`);

      if (isActive) {
        if (statusChip) {
          statusChip.className = 'ex-chip ex-chip--inverted mono';
          statusChip.textContent = 'ACTIVE';
        }
        if (connectBtn) {
          connectBtn.classList.add('is-hidden');
          connectBtn.hidden = true;
        }
        if (disconnectBtn) {
          disconnectBtn.classList.remove('is-hidden');
          disconnectBtn.hidden = false;
          disconnectBtn.disabled = settingsAuthBusy;
        }
        if (m === 'password' || m === 'pin') {
          document.getElementById(`set-drawer-${m}`)?.classList.remove('is-open');
        }
      } else {
        const sup =
          m === 'fingerprint' || m === 'faceid'
            ? window.ExoticAuth.getMethodSupport(m)
            : { supported: true };

        if (statusChip) {
          statusChip.className = 'ex-chip ex-chip--subtle mono';
          statusChip.textContent = sup.supported ? 'OFF' : 'NO SENSOR';
        }
        if (connectBtn) {
          connectBtn.classList.remove('is-hidden');
          connectBtn.hidden = false;
          connectBtn.disabled = settingsAuthBusy || !sup.supported;
        }
        if (disconnectBtn) {
          disconnectBtn.classList.add('is-hidden');
          disconnectBtn.hidden = true;
        }

        if (m === 'fingerprint') {
          const descEl = document.getElementById('set-desc-fingerprint');
          if (descEl) {
            descEl.textContent = sup.supported
              ? 'Hardware fingerprint sensor passkey'
              : sup.reason || 'No Fingerprint hardware sensor detected on this device';
          }
        } else if (m === 'faceid') {
          const descEl = document.getElementById('set-desc-faceid');
          if (descEl) {
            descEl.textContent = sup.supported
              ? 'TrueDepth sensor or front-camera facial scan'
              : sup.reason || 'No Face ID hardware detected on this device';
          }
        }
      }
    }
  }

  function applySigninAllowedMethods(methods, bioModes = {}, bioIds = {}) {
    const cleanList = window.ExoticAuth
      ? window.ExoticAuth.normalizeMethodList(methods)
      : [];
    signinAllowedMethods = cleanList;
    signinExpectedBioModes =
      bioModes && typeof bioModes === 'object' ? { ...bioModes } : {};
    signinExpectedBioIds =
      bioIds && typeof bioIds === 'object' ? { ...bioIds } : {};

    const methodBlock = document.getElementById('signin-method-block');
    const methodTabs = document.getElementById('signin-method-tabs');
    const methodHintTag = document.getElementById('signin-method-hint-tag');

    if (cleanList.length === 0) {
      if (methodBlock) methodBlock.classList.add('is-hidden');
      document.getElementById('signin-password-input')?.setCustomValidity('');
      document.getElementById('signin-pin-input')?.setCustomValidity('');
      signinExpectedMethod = null;
      signinExpectedBioMode = null;
      signinExpectedBioId = null;
      return;
    }

    if (methodBlock) methodBlock.classList.remove('is-hidden');
    if (methodTabs) {
      methodTabs.classList.toggle('is-single', cleanList.length === 1);
    }

    if (methodHintTag && window.ExoticAuth) {
      methodHintTag.textContent =
        cleanList.length === 1
          ? `REGISTERED: ${window.ExoticAuth.formatMethodLabel(cleanList[0]).toUpperCase()}`
          : `${cleanList.length} REGISTERED`;
    }

    document.querySelectorAll('[data-signin-method]').forEach((btn) => {
      const m = btn.getAttribute('data-signin-method');
      const allowed = cleanList.includes(m);
      btn.classList.toggle('is-hidden', !allowed);
      btn.hidden = !allowed;
    });

    let nextMethod = signinAuthMethod;
    if (!signinManualMethodOverride || !cleanList.includes(nextMethod)) {
      nextMethod = cleanList[0];
    }

    signinExpectedMethod = nextMethod;
    signinExpectedBioMode = signinExpectedBioModes[nextMethod] || null;
    signinExpectedBioId = signinExpectedBioIds[nextMethod] || null;
    applyAuthMethodUI('signin', nextMethod);
  }

  function applyAuthMethodUI(prefix, nextMethod) {
    const clean = window.ExoticAuth
      ? window.ExoticAuth.normalizeMethod(nextMethod)
      : nextMethod || 'password';
    const prevMethod = prefix === 'signup' ? signupAuthMethod : signinAuthMethod;
    const bioCard = document.getElementById(`${prefix}-bio-card`);
    const isActivelyScanning =
      Boolean(bioCard?.classList.contains('is-scanning')) && prevMethod === clean;

    if (!isActivelyScanning) {
      window.ExoticAuth?.stopCameraScan?.();
    }

    if (prefix === 'signup') {
      signupAuthMethod = clean;
    } else {
      signinAuthMethod = clean;
    }

    document.querySelectorAll(`[data-${prefix}-method]`).forEach((btn) => {
      const m = btn.getAttribute(`data-${prefix}-method`);
      const active = m === clean;
      const hiddenInSignin =
        prefix === 'signin' &&
        signinAllowedMethods.length > 0 &&
        !signinAllowedMethods.includes(m);
      const sup =
        m === 'fingerprint' || m === 'faceid'
          ? window.ExoticAuth?.getMethodSupport?.(m) || { supported: true }
          : { supported: true };
      btn.className = `ex-pill-btn ${
        active ? 'ex-pill-btn--primary' : 'ex-pill-btn--secondary'
      } ex-pill-btn--sm${hiddenInSignin ? ' is-hidden' : ''}`;
      btn.hidden = hiddenInSignin;
      btn.setAttribute('aria-pressed', String(active));
      if (!sup.supported) {
        btn.title = sup.reason || 'Not supported on this device';
      } else {
        btn.removeAttribute('title');
      }
    });

    const pwPanel = document.getElementById(`${prefix}-panel-password`);
    const pinPanel = document.getElementById(`${prefix}-panel-pin`);
    const bioPanel = document.getElementById(`${prefix}-panel-biometric`);
    const pwInput = document.getElementById(`${prefix}-password-input`);
    const pinInput = document.getElementById(`${prefix}-pin-input`);
    const faceViewport = document.getElementById(`${prefix}-face-viewport`);

    if (faceViewport && !isActivelyScanning) {
      faceViewport.classList.remove('is-open');
    }
    if (pwPanel) pwPanel.classList.toggle('is-active', clean === 'password');
    if (pinPanel) pinPanel.classList.toggle('is-active', clean === 'pin');
    if (bioPanel) {
      bioPanel.classList.toggle(
        'is-active',
        clean === 'fingerprint' || clean === 'faceid'
      );
    }

    // Clear validity on inactive fields so hidden inputs never block submission
    if (pwInput && clean !== 'password') pwInput.setCustomValidity('');
    if (pinInput && clean !== 'pin') pinInput.setCustomValidity('');

    if (clean === 'fingerprint' || clean === 'faceid') {
      if (!isActivelyScanning) {
        const unameVal = document
          .getElementById(`${prefix}-username-input`)
          ?.value?.trim();
        window.ExoticAuth?.prefetchBiometricChallenge?.(unameVal || '');
        syncBiometricCardUI(prefix);
      }
    } else {
      validateCredentialFieldLive(prefix);
    }
  }

  function validateCredentialFieldLive(prefix) {
    const method = prefix === 'signup' ? signupAuthMethod : signinAuthMethod;
    if (method === 'password') {
      const pwInput = document.getElementById(`${prefix}-password-input`);
      if (!pwInput) return false;
      const val = pwInput.value;
      if (!val) {
        pwInput.setCustomValidity('Password must be 4 to 64 characters');
        setCredentialValidationUI(
          prefix,
          'neutral',
          prefix === 'signup'
            ? 'Enter a password (4–64 characters)'
            : 'Enter your account password',
          'PASSWORD',
          'key'
        );
        return false;
      }
      if (!window.ExoticAuth?.isValidPassword(val)) {
        pwInput.setCustomValidity('Password must be 4 to 64 characters');
        setCredentialValidationUI(
          prefix,
          'invalid',
          'Password must be 4 to 64 characters',
          'SHORT',
          'skull'
        );
        return false;
      }
      pwInput.setCustomValidity('');
      setCredentialValidationUI(
        prefix,
        'valid',
        prefix === 'signup' ? 'Password ready' : 'Password entered',
        'READY',
        'check'
      );
      return true;
    }

    if (method === 'pin') {
      const pinInput = document.getElementById(`${prefix}-pin-input`);
      if (!pinInput) return false;
      const cleanDigits = pinInput.value.replace(/\D+/g, '').slice(0, 8);
      if (pinInput.value !== cleanDigits) {
        pinInput.value = cleanDigits;
      }
      if (!cleanDigits) {
        pinInput.setCustomValidity('PIN must be 4 to 8 digits');
        setCredentialValidationUI(
          prefix,
          'neutral',
          prefix === 'signup'
            ? 'Enter a 4–8 digit numeric PIN'
            : 'Enter your 4–8 digit PIN',
          'PIN',
          'pin'
        );
        return false;
      }
      if (!window.ExoticAuth?.isValidPin(cleanDigits)) {
        pinInput.setCustomValidity('PIN must be 4 to 8 digits');
        setCredentialValidationUI(
          prefix,
          'invalid',
          'PIN must be 4 to 8 digits',
          'INVALID',
          'skull'
        );
        return false;
      }
      pinInput.setCustomValidity('');
      setCredentialValidationUI(
        prefix,
        'valid',
        prefix === 'signup'
          ? `${cleanDigits.length}-digit PIN ready`
          : 'PIN entered',
        'READY',
        'check'
      );
      return true;
    }

    syncBiometricCardUI(prefix);
    return true;
  }

  // Must be called synchronously inside user click/submit event to preserve hardware WebAuthn gesture
  function startBiometricFlowSync(prefix) {
    if (!window.ExoticAuth) return Promise.resolve(null);
    const isSignup = prefix === 'signup';
    const method = isSignup ? signupAuthMethod : signinAuthMethod;
    if (method !== 'fingerprint' && method !== 'faceid') {
      return Promise.resolve(null);
    }

    const unameInput = document.getElementById(`${prefix}-username-input`);
    const username = unameInput ? unameInput.value.trim() : '';
    const labelText = window.ExoticAuth.formatMethodLabel(method);
    const iconName = getMethodIconName(method);
    const cardEl = document.getElementById(`${prefix}-bio-card`);
    const scanBtn = document.getElementById(`${prefix}-bio-scan-btn`);
    const faceViewport = document.getElementById(`${prefix}-face-viewport`);
    const faceCanvas = document.getElementById(`${prefix}-face-canvas`);

    if (!username || !window.ExoticAuth.isValidFormat(username)) {
      if (unameInput) {
        unameInput.setCustomValidity('username is invalid');
        unameInput.reportValidity();
      }
      setCredentialValidationUI(
        prefix,
        'invalid',
        `Enter your username first before scanning ${labelText}`,
        'USERNAME',
        'user'
      );
      return Promise.resolve(null);
    }

    const support = window.ExoticAuth.getMethodSupport(method);
    if (!support.supported) {
      syncBiometricCardUI(prefix);
      return Promise.resolve(null);
    }

    const expectedBioMode = isSignup
      ? support.mode
      : signinExpectedBioMode || support.mode;
    const caps = window.ExoticBiometrics?.getCapabilities?.() || {};
    const willOpenInlineCamera =
      method === 'faceid' &&
      expectedBioMode === 'camera_face' &&
      (!caps.isEmbeddedFrame || caps.inlineCameraAllowed);

    if (faceViewport) {
      faceViewport.classList.toggle('is-open', Boolean(willOpenInlineCamera));
    }
    if (cardEl) {
      cardEl.classList.remove('is-verified');
      cardEl.classList.add('is-scanning');
    }
    if (scanBtn) scanBtn.disabled = true;

    setCredentialValidationUI(
      prefix,
      'neutral',
      isSignup
        ? `Complete ${labelText} scan on your device...`
        : `Verifying ${labelText} on your device...`,
      'SCAN',
      iconName
    );

    // Synchronously start WebAuthn / Camera / Top-level Bridge inside user gesture!
    const scanPromise = window.ExoticAuth.startHardwareBiometricScanSync({
      flow: isSignup ? 'signup' : 'signin',
      method,
      username,
      credentialId: isSignup ? null : signinExpectedBioId,
      expectedBiometricMode: expectedBioMode,
      canvasEl: faceCanvas,
      onProgress(info) {
        if (info && info.hint) {
          setCredentialValidationUI(
            prefix,
            'neutral',
            info.hint,
            info.pct != null ? `${info.pct}%` : 'SCAN',
            iconName
          );
        }
      }
    });

    return scanPromise.then((bioRes) => {
      if (cardEl) cardEl.classList.remove('is-scanning');
      if (faceViewport) faceViewport.classList.remove('is-open');
      if (scanBtn) scanBtn.disabled = false;

      if (!bioRes || !bioRes.ok) {
        if (isSignup) signupBioEnrollment = null;
        else signinBioAssertion = null;
        if (bioRes?.unsupported) {
          applyAuthMethodUI(prefix, method);
          return null;
        }
        const errMsg = bioRes?.reason || `${labelText} scan did not complete`;
        setCredentialValidationUI(prefix, 'invalid', errMsg, 'FAILED', 'skull');
        return null;
      }

      const record = {
        method,
        username: username.toLowerCase(),
        biometricMode: bioRes.biometricMode || 'webauthn',
        biometricCredentialId: bioRes.biometricCredentialId || null,
        webauthnAttestation: bioRes.webauthnAttestation || null,
        webauthnAssertion: bioRes.webauthnAssertion || null,
        faceDescriptor: bioRes.faceDescriptor || null,
        challenge: bioRes.challenge || null
      };

      if (isSignup) signupBioEnrollment = record;
      else signinBioAssertion = record;

      window.ExoticAudio.click();
      syncBiometricCardUI(prefix);
      return record;
    });
  }

  async function validateSignUpUsername(immediate = false) {
    const input = document.getElementById('signup-username-input');
    if (!input || !window.ExoticAuth) return false;

    if (window.ExoticAuth.hasBoundAccount()) {
      const bound = window.ExoticAuth.getBoundUsername();
      const lockMsg = `Cannot re-register until @${bound} is deleted in Settings`;
      input.setCustomValidity(lockMsg);
      setAuthValidationUI('signup', 'invalid', lockMsg, 'LOCKED', 'lock');
      return false;
    }

    const raw = input.value.trim();
    if (!raw) {
      input.setCustomValidity('username is invalid');
      setAuthValidationUI(
        'signup',
        'neutral',
        'Type a username to verify availability',
        'CHECK',
        'user'
      );
      return false;
    }

    if (!window.ExoticAuth.isValidFormat(raw)) {
      input.setCustomValidity('username is invalid');
      setAuthValidationUI(
        'signup',
        'invalid',
        'username is invalid (3–20 letters, numbers, or _)',
        'INVALID',
        'skull'
      );
      return false;
    }

    const seq = ++signupCheckSeq;
    if (!immediate) {
      input.setCustomValidity('Checking username availability...');
      setAuthValidationUI('signup', 'neutral', 'Checking availability...', 'WAIT', 'user');
    }

    const res = await window.ExoticAuth.checkUsername(raw);
    if (seq !== signupCheckSeq) return false;

    if (window.ExoticAuth.hasBoundAccount()) {
      const bound = window.ExoticAuth.getBoundUsername();
      const lockMsg = `Cannot re-register until @${bound} is deleted in Settings`;
      input.setCustomValidity(lockMsg);
      setAuthValidationUI('signup', 'invalid', lockMsg, 'LOCKED', 'lock');
      return false;
    }

    if (res && (res.taken || res.exists)) {
      input.setCustomValidity('username is taken');
      setAuthValidationUI('signup', 'invalid', 'username is taken', 'TAKEN', 'skull');
      return false;
    }

    if (res && res.available) {
      input.setCustomValidity('');
      setAuthValidationUI('signup', 'valid', 'username is available', 'AVAILABLE', 'check');
      return true;
    }

    input.setCustomValidity('username is invalid');
    setAuthValidationUI('signup', 'invalid', 'username is invalid', 'INVALID', 'skull');
    return false;
  }

  async function validateGuestSignupUsername(immediate = false) {
    const input = document.getElementById('guest-signup-username-input');
    if (!input || !window.ExoticAuth) return false;

    if (window.ExoticAuth.hasBoundAccount()) {
      const bound = window.ExoticAuth.getBoundUsername();
      const lockMsg = `Cannot re-register until @${bound} is deleted in Settings`;
      input.setCustomValidity(lockMsg);
      setAuthValidationUI('guest-signup', 'invalid', lockMsg, 'LOCKED', 'lock');
      return false;
    }

    const raw = input.value.trim();
    if (!raw || !window.ExoticAuth.isValidFormat(raw)) {
      input.setCustomValidity('username is invalid');
      setAuthValidationUI(
        'guest-signup',
        'invalid',
        'username is invalid (3–20 letters, numbers, or _)',
        'INVALID',
        'skull'
      );
      return false;
    }

    const seq = ++guestSignupCheckSeq;
    if (!immediate) {
      input.setCustomValidity('Checking username availability...');
      setAuthValidationUI('guest-signup', 'neutral', 'Checking availability...', 'WAIT', 'user');
    }

    const res = await window.ExoticAuth.checkUsername(raw);
    if (seq !== guestSignupCheckSeq) return false;

    if (window.ExoticAuth.hasBoundAccount()) {
      const bound = window.ExoticAuth.getBoundUsername();
      const lockMsg = `Cannot re-register until @${bound} is deleted in Settings`;
      input.setCustomValidity(lockMsg);
      setAuthValidationUI('guest-signup', 'invalid', lockMsg, 'LOCKED', 'lock');
      return false;
    }

    if (res && (res.taken || res.exists)) {
      input.setCustomValidity('username is taken');
      setAuthValidationUI('guest-signup', 'invalid', 'username is taken', 'TAKEN', 'skull');
      return false;
    }

    if (res && res.available) {
      input.setCustomValidity('');
      setAuthValidationUI(
        'guest-signup',
        'valid',
        'username is available',
        'AVAILABLE',
        'check'
      );
      return true;
    }

    input.setCustomValidity('username is invalid');
    setAuthValidationUI('guest-signup', 'invalid', 'username is invalid', 'INVALID', 'skull');
    return false;
  }

  async function ensureGuestSignupCandidate(forceNew = false) {
    const input = document.getElementById('guest-signup-username-input');
    if (!input || !window.ExoticAuth) return;

    if (window.ExoticAuth.hasBoundAccount()) {
      const bound = window.ExoticAuth.getBoundUsername();
      const lockMsg = `Cannot re-register until @${bound} is deleted in Settings`;
      input.setCustomValidity(lockMsg);
      setAuthValidationUI('guest-signup', 'invalid', lockMsg, 'LOCKED', 'lock');
      return;
    }

    if (!forceNew && input.value.trim()) {
      await validateGuestSignupUsername(false);
      return;
    }

    const generated = await window.ExoticAuth.generateGuestUsername();
    if (window.ExoticAuth.hasBoundAccount()) return;
    if (forceNew || !input.value.trim()) {
      guestSignupCheckSeq += 1;
      input.value = generated;
      input.setCustomValidity('');
      setAuthValidationUI(
        'guest-signup',
        'valid',
        'username is available',
        'AVAILABLE',
        'check'
      );
      guestSignupCandidateLoaded = true;
    }
  }

  async function validateSettingsGuestUsername(immediate = false) {
    const input = document.getElementById('set-guest-username-input');
    if (!input || !window.ExoticAuth || !window.ExoticAuth.isGuest()) return false;

    const raw = input.value.trim();
    const current = window.ExoticAuth.getUsername() || '';

    if (!raw || !window.ExoticAuth.isValidFormat(raw)) {
      input.setCustomValidity('username is invalid');
      setAuthValidationUI(
        'set-guest',
        'invalid',
        'username is invalid (3–20 letters, numbers, or _)',
        'INVALID',
        'skull'
      );
      return false;
    }

    if (raw.toLowerCase() === current.toLowerCase()) {
      if (raw === current) {
        input.setCustomValidity('Enter a new Guest username to change');
        setAuthValidationUI(
          'set-guest',
          'neutral',
          `Current Guest username @${current} · Edit to check availability`,
          'CURRENT',
          'user'
        );
        return false;
      }
      input.setCustomValidity('');
      setAuthValidationUI(
        'set-guest',
        'valid',
        'username is available',
        'AVAILABLE',
        'check'
      );
      return true;
    }

    const seq = ++guestRenameCheckSeq;
    if (!immediate) {
      input.setCustomValidity('Checking username availability...');
      setAuthValidationUI('set-guest', 'neutral', 'Checking availability...', 'WAIT', 'user');
    }

    const res = await window.ExoticAuth.checkUsername(raw);
    if (seq !== guestRenameCheckSeq) return false;

    if (res && (res.taken || res.exists)) {
      input.setCustomValidity('username is taken');
      setAuthValidationUI('set-guest', 'invalid', 'username is taken', 'TAKEN', 'skull');
      return false;
    }

    if (res && res.available) {
      input.setCustomValidity('');
      setAuthValidationUI(
        'set-guest',
        'valid',
        'username is available',
        'AVAILABLE',
        'check'
      );
      return true;
    }

    input.setCustomValidity('username is invalid');
    setAuthValidationUI('set-guest', 'invalid', 'username is invalid', 'INVALID', 'skull');
    return false;
  }

  async function validateSignInUsername(immediate = false) {
    const input = document.getElementById('signin-username-input');
    if (!input || !window.ExoticAuth) return false;

    const raw = input.value.trim();
    if (!raw) {
      signinTargetIsGuest = false;
      applySigninAllowedMethods([]);
      input.setCustomValidity('username is invalid');
      setAuthValidationUI(
        'signin',
        'neutral',
        'Enter your registered username to load your sign-in method',
        'CHECK',
        'user'
      );
      return false;
    }

    if (!window.ExoticAuth.isValidFormat(raw)) {
      signinTargetIsGuest = false;
      applySigninAllowedMethods([]);
      input.setCustomValidity('username is invalid');
      setAuthValidationUI('signin', 'invalid', 'username is invalid', 'INVALID', 'skull');
      return false;
    }

    const seq = ++signinCheckSeq;
    if (!immediate) {
      input.setCustomValidity('Verifying username...');
      setAuthValidationUI('signin', 'neutral', 'Verifying username...', 'WAIT', 'user');
    }

    const res = await window.ExoticAuth.checkUsername(raw);
    if (seq !== signinCheckSeq) return false;

    if (!res || !res.valid) {
      signinTargetIsGuest = false;
      applySigninAllowedMethods([]);
      input.setCustomValidity('username is invalid');
      setAuthValidationUI('signin', 'invalid', 'username is invalid', 'INVALID', 'skull');
      return false;
    }

    if (!res.exists) {
      signinTargetIsGuest = false;
      applySigninAllowedMethods([]);
      input.setCustomValidity('username is not registered');
      setAuthValidationUI(
        'signin',
        'invalid',
        'username is not registered',
        'UNREGISTERED',
        'skull'
      );
      return false;
    }

    const bound = res.boundUsername || window.ExoticAuth.getBoundUsername();
    if (bound && raw.toLowerCase() !== bound.toLowerCase()) {
      signinTargetIsGuest = false;
      applySigninAllowedMethods([]);
      const lockMsg = `Account locked to @${bound} until deleted in Settings`;
      input.setCustomValidity(lockMsg);
      setAuthValidationUI('signin', 'invalid', lockMsg, 'LOCKED', 'lock');
      return false;
    }

    signinTargetIsGuest = Boolean(res.isGuest);

    if (signinTargetIsGuest) {
      applySigninAllowedMethods([]);
      input.setCustomValidity('');
      setAuthValidationUI(
        'signin',
        'valid',
        `@${res.canonicalUsername || raw} verified · Guest Account (No Password)`,
        'GUEST',
        'check'
      );
      return true;
    }

    const registeredMethods = window.ExoticAuth.normalizeMethodList(
      res.authMethods,
      res.authMethod && res.authMethod !== 'none' ? res.authMethod : 'password'
    );
    applySigninAllowedMethods(
      registeredMethods,
      res.biometricModes || {},
      res.biometricCredentialIds || {}
    );

    input.setCustomValidity('');
    const methodSuffix =
      registeredMethods.length > 0 && window.ExoticAuth
        ? ` · ${window.ExoticAuth.formatMethodListLabel(registeredMethods)}`
        : '';
    setAuthValidationUI(
      'signin',
      'valid',
      `@${res.canonicalUsername || raw} verified${methodSuffix}`,
      'VERIFIED',
      'check'
    );
    return true;
  }

  function renderSignUpView() {
    const input = document.getElementById('signup-username-input');
    const submitBtn = document.getElementById('signup-submit-btn');
    const guestInput = document.getElementById('guest-signup-username-input');
    const guestShuffleBtn = document.getElementById('guest-signup-shuffle-btn');
    const guestSubmitBtn = document.getElementById('guest-signup-submit-btn');
    const lockBanner = document.getElementById('signup-lock-banner');
    const lockTitle = document.getElementById('signup-lock-title');
    const lockDesc = document.getElementById('signup-lock-desc');

    const hasBound = window.ExoticAuth ? window.ExoticAuth.hasBoundAccount() : false;
    const bound = window.ExoticAuth ? window.ExoticAuth.getBoundUsername() : null;
    const boundIsGuest = window.ExoticAuth ? window.ExoticAuth.isBoundGuest() : false;

    applyAuthMethodUI('signup', signupAuthMethod);

    if (lockBanner) {
      lockBanner.classList.toggle('is-visible', hasBound);
    }
    if (hasBound && bound) {
      if (lockTitle) {
        lockTitle.textContent = boundIsGuest
          ? `Guest Account Locked to @${bound}`
          : `Registration Locked to @${bound}`;
      }
      if (lockDesc) {
        lockDesc.textContent = boundIsGuest
          ? `This device is registered as Guest @${bound}. Sign back in as @${bound} — you cannot register a new Guest or account until @${bound} is deleted from Settings.`
          : `This device is already registered as @${bound}. Sign back in as @${bound} — you cannot re-register until @${bound} is deleted from Settings.`;
      }
      if (input) {
        input.setCustomValidity(`Cannot re-register until @${bound} is deleted in Settings`);
      }
      if (submitBtn) submitBtn.disabled = false;
      setAuthValidationUI(
        'signup',
        'invalid',
        `Cannot re-register until @${bound} is deleted in Settings`,
        'LOCKED',
        'lock'
      );

      if (guestInput) {
        guestInput.value = boundIsGuest ? bound : guestInput.value;
        guestInput.setCustomValidity(`Cannot re-register until @${bound} is deleted in Settings`);
      }
      if (guestShuffleBtn) guestShuffleBtn.disabled = true;
      if (guestSubmitBtn) guestSubmitBtn.disabled = false;
      setAuthValidationUI(
        'guest-signup',
        'invalid',
        `Cannot re-register until @${bound} is deleted in Settings`,
        'LOCKED',
        'lock'
      );
      return;
    }

    if (guestShuffleBtn) guestShuffleBtn.disabled = false;
    ensureGuestSignupCandidate(!guestSignupCandidateLoaded && !guestInput?.value?.trim());

    if (input) {
      if (input.value.trim()) {
        validateSignUpUsername(false);
      } else {
        input.setCustomValidity('username is invalid');
        setAuthValidationUI(
          'signup',
          'neutral',
          'Type a username to verify availability',
          'CHECK',
          'user'
        );
      }
    }
  }

  function renderSignInView() {
    const input = document.getElementById('signin-username-input');
    const lockBanner = document.getElementById('signin-lock-banner');
    const lockTitle = document.getElementById('signin-lock-title');
    const lockDesc = document.getElementById('signin-lock-desc');
    const fillLabel = document.getElementById('signin-fill-bound-label');
    const switchHint = document.getElementById('signin-switch-hint');

    const hasBound = window.ExoticAuth ? window.ExoticAuth.hasBoundAccount() : false;
    const bound = window.ExoticAuth ? window.ExoticAuth.getBoundUsername() : null;
    const boundIsGuest = window.ExoticAuth ? window.ExoticAuth.isBoundGuest() : false;
    const boundMethods = window.ExoticAuth ? window.ExoticAuth.getBoundAuthMethods() : [];
    const authState = window.ExoticAuth ? window.ExoticAuth.getState() : {};

    if (hasBound && bound && input && !input.value.trim()) {
      input.value = bound;
    }
    if (hasBound && boundIsGuest) {
      signinTargetIsGuest = true;
      applySigninAllowedMethods([]);
    } else if (hasBound && boundMethods.length > 0) {
      if (!signinManualMethodOverride || !boundMethods.includes(signinAuthMethod)) {
        signinAuthMethod = boundMethods[0];
      }
      applySigninAllowedMethods(
        boundMethods,
        authState.biometricModes || {},
        authState.biometricCredentialIds || {}
      );
    } else if (!input?.value?.trim()) {
      applySigninAllowedMethods([]);
    }

    if (lockBanner) {
      lockBanner.classList.toggle('is-visible', hasBound);
    }
    if (hasBound && bound) {
      if (boundIsGuest) {
        if (lockTitle) lockTitle.textContent = `Bound Guest Account: @${bound}`;
        if (lockDesc) {
          lockDesc.textContent = `Signed out of Guest @${bound}. Press Sign In below to enter the same Guest account with no password required (re-registration stays locked until deleted from Settings).`;
        }
      } else {
        const mLabel =
          boundMethods.length > 0
            ? ` with ${window.ExoticAuth.formatMethodListLabel(boundMethods)}`
            : '';
        if (lockTitle) lockTitle.textContent = `Bound Account: @${bound}`;
        if (lockDesc) {
          lockDesc.textContent = `Signed out of @${bound}. Verify @${bound}${mLabel} below to sign back into the same account (re-registration stays locked until deleted from Settings).`;
        }
      }
      if (fillLabel) fillLabel.textContent = `Use @${bound}`;
      if (switchHint) switchHint.textContent = `Bound to @${bound}`;
      if (input && !input.value.trim()) {
        input.value = bound;
      }
    } else if (switchHint) {
      switchHint.textContent = 'No registered account yet?';
    }

    if (input) {
      if (input.value.trim()) {
        validateSignInUsername(false);
      } else {
        input.setCustomValidity('username is invalid');
        setAuthValidationUI(
          'signin',
          'neutral',
          'Enter your registered username',
          'CHECK',
          'user'
        );
      }
    }
  }

  function refreshCurrentRouteInPlace() {
    const route = window.ExoticRouter.getCurrent();
    if (route === 'signup') renderSignUpView();
    else if (route === 'signin') renderSignInView();
    else if (route === 'menu') renderMenuSummary();
    else if (route === 'levels') patchLevelsViewInPlace();
    else if (route === 'shop') patchShopViewInPlace();
    else if (route === 'achievements') renderAchievementsView();
    else if (route === 'leaderboards') renderLeaderboardsView();
    else if (route === 'settings') renderSettingsView();
  }

  function bindRealtimeHooks() {
    if (!window.ExoticRealtime) return;

    window.ExoticRealtime.useConnectionStatus(() => {
      updateCloudIndicators();
    });

    window.ExoticRealtime.useGlobalTelemetry(() => {
      updateCloudIndicators();
    });

    window.ExoticRealtime.usePresence(() => {
      updateCloudIndicators();
      if (window.ExoticRouter.getCurrent() === 'levels') {
        patchLevelsViewInPlace();
      }
    });

    window.ExoticRealtime.useActivityFeed(() => {
      updateCloudIndicators();
    });

    window.ExoticRealtime.useCatalog(({ table }) => {
      const route = window.ExoticRouter.getCurrent();
      if (route === 'shop' && (table === 'shop_items' || table === 'all')) {
        patchShopViewInPlace();
      } else if (route === 'levels' && (table === 'levels_catalog' || table === 'all')) {
        patchLevelsViewInPlace();
      } else if (route === 'achievements' && (table === 'achievements_catalog' || table === 'all')) {
        renderAchievementsView();
      }
    });

    window.ExoticRealtime.useLeaderboard(() => {
      const route = window.ExoticRouter.getCurrent();
      if (route === 'leaderboards') {
        renderLeaderboardsView();
      } else if (route === 'levels') {
        patchLevelsViewInPlace();
      }
    });

    window.ExoticRealtime.useStorage((evt) => {
      if (
        evt?.bucket === 'runner-cards' &&
        evt.clientKey === window.ExoticSupabase?.getClientKey()
      ) {
        if (window.ExoticRouter.getCurrent() === 'settings') {
          renderSettingsView();
        }
      }
    });
  }

  function bindStaticEvents() {
    document.getElementById('topbar-back-btn')?.addEventListener('click', () => {
      window.ExoticAudio.click();
      window.ExoticRouter.navigate('menu');
    });

    document.getElementById('header-account-btn')?.addEventListener('click', () => {
      window.ExoticAudio.click();
      window.ExoticRouter.navigate('settings');
    });

    const handleThemeToggleClick = () => {
      window.ExoticAudio.unlock();
      window.ExoticAudio.click();
      const mode = window.ExoticTheme.toggle();
      window.ExoticStorage.updateSettings({ theme: mode });
      updateGlobalHeader();
      if (window.ExoticRouter.getCurrent() === 'settings') renderSettingsView();
    };
    document.getElementById('signup-theme-btn')?.addEventListener('click', handleThemeToggleClick);
    document.getElementById('signin-theme-btn')?.addEventListener('click', handleThemeToggleClick);
    document.getElementById('splash-theme-btn')?.addEventListener('click', handleThemeToggleClick);
    document.getElementById('header-theme-btn')?.addEventListener('click', handleThemeToggleClick);
    document.getElementById('play-theme-btn')?.addEventListener('click', handleThemeToggleClick);
    document.getElementById('pause-theme-btn')?.addEventListener('click', handleThemeToggleClick);

    document.getElementById('signup-switch-signin-btn')?.addEventListener('click', () => {
      window.ExoticAudio.unlock();
      window.ExoticAudio.click();
      window.ExoticRouter.navigate('signin');
    });

    document.getElementById('signin-switch-signup-btn')?.addEventListener('click', () => {
      window.ExoticAudio.unlock();
      window.ExoticAudio.click();
      window.ExoticRouter.navigate('signup');
    });

    document.getElementById('signin-fill-bound-btn')?.addEventListener('click', () => {
      window.ExoticAudio.unlock();
      window.ExoticAudio.click();
      const bound = window.ExoticAuth?.getBoundUsername();
      const input = document.getElementById('signin-username-input');
      if (bound && input) {
        signinManualMethodOverride = false;
        input.value = bound;
        validateSignInUsername(false);
        input.focus();
      }
    });

    document.querySelectorAll('[data-signup-method]').forEach((btn) => {
      btn.addEventListener('click', () => {
        window.ExoticAudio.unlock();
        window.ExoticAudio.click();
        const method = btn.getAttribute('data-signup-method');
        applyAuthMethodUI('signup', method);
      });
    });

    document.querySelectorAll('[data-signin-method]').forEach((btn) => {
      btn.addEventListener('click', () => {
        window.ExoticAudio.unlock();
        window.ExoticAudio.click();
        const method = btn.getAttribute('data-signin-method');
        if (signinAllowedMethods.length > 0 && !signinAllowedMethods.includes(method)) {
          return;
        }
        signinManualMethodOverride = true;
        signinExpectedMethod = method;
        signinExpectedBioMode = signinExpectedBioModes[method] || null;
        signinExpectedBioId = signinExpectedBioIds[method] || null;
        applyAuthMethodUI('signin', method);
      });
    });

    function bindSecretRevealToggle(btnId, inputId) {
      const btn = document.getElementById(btnId);
      const inputEl = document.getElementById(inputId);
      if (!btn || !inputEl) return;
      btn.addEventListener('click', () => {
        window.ExoticAudio.click();
        const reveal = inputEl.type === 'password';
        inputEl.type = reveal ? 'text' : 'password';
        btn.innerHTML = window.ExoticIcons.get(reveal ? 'eyeOff' : 'eye');
      });
    }

    bindSecretRevealToggle('signup-pw-reveal-btn', 'signup-password-input');
    bindSecretRevealToggle('signup-pin-reveal-btn', 'signup-pin-input');
    bindSecretRevealToggle('signin-pw-reveal-btn', 'signin-password-input');
    bindSecretRevealToggle('signin-pin-reveal-btn', 'signin-pin-input');
    bindSecretRevealToggle('set-pw-reveal-btn', 'set-connect-password-input');
    bindSecretRevealToggle('set-pin-reveal-btn', 'set-connect-pin-input');

    document.getElementById('signup-password-input')?.addEventListener('input', () => {
      validateCredentialFieldLive('signup');
    });
    document.getElementById('signup-pin-input')?.addEventListener('input', () => {
      validateCredentialFieldLive('signup');
    });
    document.getElementById('signin-password-input')?.addEventListener('input', () => {
      validateCredentialFieldLive('signin');
    });
    document.getElementById('signin-pin-input')?.addEventListener('input', () => {
      validateCredentialFieldLive('signin');
    });

    document.getElementById('signup-bio-scan-btn')?.addEventListener('click', () => {
      window.ExoticAudio.unlock();
      window.ExoticAudio.click();
      startBiometricFlowSync('signup');
    });

    document.getElementById('signin-bio-scan-btn')?.addEventListener('click', () => {
      window.ExoticAudio.unlock();
      window.ExoticAudio.click();
      startBiometricFlowSync('signin');
    });

    window.addEventListener('exotic:biometric-capabilities', () => {
      const cur = window.ExoticRouter?.getCurrent?.();
      if (cur === 'signup') applyAuthMethodUI('signup', signupAuthMethod);
      else if (cur === 'signin') applyAuthMethodUI('signin', signinAuthMethod);
      else if (cur === 'settings') renderSettingsAuthMethods(true);
    });

    const signupInput = document.getElementById('signup-username-input');
    if (signupInput) {
      signupInput.addEventListener('input', () => {
        if (signupDebounceTimer) clearTimeout(signupDebounceTimer);
        const val = signupInput.value.trim();
        if (
          signupBioEnrollment &&
          signupBioEnrollment.username !== val.toLowerCase()
        ) {
          signupBioEnrollment = null;
          syncBiometricCardUI('signup');
        }
        if (window.ExoticAuth?.hasBoundAccount()) {
          validateSignUpUsername(true);
          return;
        }
        if (!val || !window.ExoticAuth?.isValidFormat(val)) {
          validateSignUpUsername(true);
          return;
        }
        signupInput.setCustomValidity('Checking username availability...');
        setAuthValidationUI(
          'signup',
          'neutral',
          'Checking availability...',
          'WAIT',
          'user'
        );
        signupDebounceTimer = setTimeout(() => {
          validateSignUpUsername(false);
        }, 160);
      });

      signupInput.addEventListener('invalid', () => {
        if (
          !signupInput.validationMessage ||
          signupInput.validity.valueMissing ||
          signupInput.validity.tooShort ||
          signupInput.validity.patternMismatch
        ) {
          if (window.ExoticAuth?.hasBoundAccount()) {
            const b = window.ExoticAuth.getBoundUsername();
            signupInput.setCustomValidity(
              `Cannot re-register until @${b} is deleted in Settings`
            );
            setAuthValidationUI(
              'signup',
              'invalid',
              `Cannot re-register until @${b} is deleted in Settings`,
              'LOCKED',
              'lock'
            );
          } else {
            signupInput.setCustomValidity('username is invalid');
            setAuthValidationUI(
              'signup',
              'invalid',
              'username is invalid (3–20 letters, numbers, or _)',
              'INVALID',
              'skull'
            );
          }
        }
      });
    }

    document.getElementById('signup-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      window.ExoticAudio.unlock();
      window.ExoticAudio.click();
      const input = document.getElementById('signup-username-input');
      const submitBtn = document.getElementById('signup-submit-btn');
      if (!input || !window.ExoticAuth) return;

      const username = input.value.trim();

      // Start hardware biometric scan synchronously BEFORE any network await to preserve user gesture!
      let pendingBioPromise = null;
      if (signupAuthMethod === 'fingerprint' || signupAuthMethod === 'faceid') {
        if (
          !signupBioEnrollment ||
          signupBioEnrollment.method !== signupAuthMethod ||
          signupBioEnrollment.username !== username.toLowerCase()
        ) {
          if (
            !window.ExoticAuth.hasBoundAccount() &&
            window.ExoticAuth.isValidFormat(username)
          ) {
            pendingBioPromise = startBiometricFlowSync('signup');
          }
        }
      }

      const isValid = await validateSignUpUsername(true);
      if (!isValid || !input.checkValidity()) {
        window.ExoticAuth.stopCameraScan?.();
        input.reportValidity();
        return;
      }

      let authPayload = { authMethod: signupAuthMethod };

      if (signupAuthMethod === 'password') {
        const pwInput = document.getElementById('signup-password-input');
        if (!validateCredentialFieldLive('signup') || !pwInput?.checkValidity()) {
          pwInput?.reportValidity();
          return;
        }
        authPayload.credential = pwInput.value;
      } else if (signupAuthMethod === 'pin') {
        const pinInput = document.getElementById('signup-pin-input');
        if (!validateCredentialFieldLive('signup') || !pinInput?.checkValidity()) {
          pinInput?.reportValidity();
          return;
        }
        authPayload.credential = pinInput.value.trim();
      } else {
        if (pendingBioPromise) {
          const enrolled = await pendingBioPromise;
          if (!enrolled) return;
        } else if (
          !signupBioEnrollment ||
          signupBioEnrollment.method !== signupAuthMethod ||
          signupBioEnrollment.username !== username.toLowerCase()
        ) {
          setCredentialValidationUI(
            'signup',
            'neutral',
            `Tap Scan to enroll ${window.ExoticAuth.formatMethodLabel(signupAuthMethod)}`,
            'SCAN',
            getMethodIconName(signupAuthMethod)
          );
          return;
        }
        authPayload = {
          authMethod: signupAuthMethod,
          biometricMode: signupBioEnrollment.biometricMode,
          biometricCredentialId: signupBioEnrollment.biometricCredentialId,
          webauthnAttestation: signupBioEnrollment.webauthnAttestation,
          faceDescriptor: signupBioEnrollment.faceDescriptor,
          challenge: signupBioEnrollment.challenge
        };
      }

      if (submitBtn) submitBtn.disabled = true;
      const res = await window.ExoticAuth.signUp(username, authPayload);
      if (submitBtn) submitBtn.disabled = false;

      if (res && res.ok) {
        input.value = '';
        const pwIn = document.getElementById('signup-password-input');
        const pinIn = document.getElementById('signup-pin-input');
        if (pwIn) pwIn.value = '';
        if (pinIn) pinIn.value = '';
        signupBioEnrollment = null;
        window.ExoticAudio.buy();
        const methodName = window.ExoticAuth.formatMethodLabel(
          res.authMethod || signupAuthMethod
        );
        showToast(`Account @${res.username} created (${methodName}).`);
        window.ExoticRouter.navigate('menu');
        return;
      }

      if (res?.code === 'USERNAME_TAKEN' || res?.error === 'username_taken') {
        input.setCustomValidity('username is taken');
        setAuthValidationUI('signup', 'invalid', 'username is taken', 'TAKEN', 'skull');
        input.reportValidity();
      } else if (res?.code === 'ACCOUNT_LOCKED' || res?.error === 'device_account_exists') {
        const b = res.boundUsername || window.ExoticAuth.getBoundUsername() || 'existing user';
        input.setCustomValidity(`Cannot re-register until @${b} is deleted in Settings`);
        renderSignUpView();
        input.reportValidity();
      } else if (res?.code === 'CREDENTIAL_INVALID') {
        setCredentialValidationUI(
          'signup',
          'invalid',
          res.reason || 'Check your authentication credential',
          'INVALID',
          'skull'
        );
      } else {
        input.setCustomValidity('username is invalid');
        setAuthValidationUI('signup', 'invalid', 'username is invalid', 'INVALID', 'skull');
        input.reportValidity();
      }
    });

    // Guest Sign-Up: Auto-Generated, Changeable Username with Custom HTML5 Validation (No Password / No Auth Methods)
    document.getElementById('guest-signup-shuffle-btn')?.addEventListener('click', () => {
      window.ExoticAudio.unlock();
      window.ExoticAudio.click();
      ensureGuestSignupCandidate(true);
    });

    const guestSignupInput = document.getElementById('guest-signup-username-input');
    if (guestSignupInput) {
      guestSignupInput.addEventListener('input', () => {
        if (guestSignupDebounceTimer) clearTimeout(guestSignupDebounceTimer);
        const val = guestSignupInput.value.trim();
        if (window.ExoticAuth?.hasBoundAccount()) {
          validateGuestSignupUsername(true);
          return;
        }
        if (!val || !window.ExoticAuth?.isValidFormat(val)) {
          validateGuestSignupUsername(true);
          return;
        }
        guestSignupInput.setCustomValidity('Checking username availability...');
        setAuthValidationUI(
          'guest-signup',
          'neutral',
          'Checking availability...',
          'WAIT',
          'user'
        );
        guestSignupDebounceTimer = setTimeout(() => {
          validateGuestSignupUsername(false);
        }, 160);
      });

      guestSignupInput.addEventListener('invalid', () => {
        if (
          !guestSignupInput.validationMessage ||
          guestSignupInput.validity.valueMissing ||
          guestSignupInput.validity.tooShort ||
          guestSignupInput.validity.patternMismatch
        ) {
          if (window.ExoticAuth?.hasBoundAccount()) {
            const b = window.ExoticAuth.getBoundUsername();
            guestSignupInput.setCustomValidity(
              `Cannot re-register until @${b} is deleted in Settings`
            );
            setAuthValidationUI(
              'guest-signup',
              'invalid',
              `Cannot re-register until @${b} is deleted in Settings`,
              'LOCKED',
              'lock'
            );
          } else {
            guestSignupInput.setCustomValidity('username is invalid');
            setAuthValidationUI(
              'guest-signup',
              'invalid',
              'username is invalid (3–20 letters, numbers, or _)',
              'INVALID',
              'skull'
            );
          }
        }
      });
    }

    document.getElementById('guest-signup-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      window.ExoticAudio.unlock();
      window.ExoticAudio.click();
      const input = document.getElementById('guest-signup-username-input');
      const submitBtn = document.getElementById('guest-signup-submit-btn');
      if (!input || !window.ExoticAuth) return;

      if (!input.value.trim() && !window.ExoticAuth.hasBoundAccount()) {
        await ensureGuestSignupCandidate(true);
      }

      const isValid = await validateGuestSignupUsername(true);
      if (!isValid || !input.checkValidity()) {
        input.reportValidity();
        return;
      }

      const guestUsername = input.value.trim();
      if (submitBtn) submitBtn.disabled = true;
      const res = await window.ExoticAuth.signUpGuest(guestUsername);
      if (submitBtn) submitBtn.disabled = false;

      if (res && res.ok) {
        window.ExoticAudio.buy();
        showToast(`Entered as Guest @${res.username}.`);
        window.ExoticRouter.navigate('menu');
        return;
      }

      if (res?.code === 'USERNAME_TAKEN' || res?.error === 'username_taken') {
        input.setCustomValidity('username is taken');
        setAuthValidationUI('guest-signup', 'invalid', 'username is taken', 'TAKEN', 'skull');
        input.reportValidity();
      } else if (res?.code === 'ACCOUNT_LOCKED' || res?.error === 'device_account_exists') {
        const b = res.boundUsername || window.ExoticAuth.getBoundUsername() || 'existing user';
        input.setCustomValidity(`Cannot re-register until @${b} is deleted in Settings`);
        renderSignUpView();
        input.reportValidity();
      } else {
        input.setCustomValidity('username is invalid');
        setAuthValidationUI('guest-signup', 'invalid', 'username is invalid', 'INVALID', 'skull');
        input.reportValidity();
      }
    });

    const signinInput = document.getElementById('signin-username-input');
    if (signinInput) {
      signinInput.addEventListener('input', () => {
        if (signinDebounceTimer) clearTimeout(signinDebounceTimer);
        signinManualMethodOverride = false;
        const val = signinInput.value.trim();
        if (
          signinBioAssertion &&
          signinBioAssertion.username !== val.toLowerCase()
        ) {
          signinBioAssertion = null;
          syncBiometricCardUI('signin');
        }
        if (!val || !window.ExoticAuth?.isValidFormat(val)) {
          validateSignInUsername(true);
          return;
        }
        signinInput.setCustomValidity('Verifying username...');
        setAuthValidationUI(
          'signin',
          'neutral',
          'Verifying username...',
          'WAIT',
          'user'
        );
        signinDebounceTimer = setTimeout(() => {
          validateSignInUsername(false);
        }, 160);
      });

      signinInput.addEventListener('invalid', () => {
        if (
          signinInput.validity.valueMissing ||
          signinInput.validity.tooShort ||
          signinInput.validity.patternMismatch
        ) {
          signinInput.setCustomValidity('username is invalid');
          setAuthValidationUI('signin', 'invalid', 'username is invalid', 'INVALID', 'skull');
        }
      });
    }

    document.getElementById('signin-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      window.ExoticAudio.unlock();
      window.ExoticAudio.click();
      const input = document.getElementById('signin-username-input');
      const submitBtn = document.getElementById('signin-submit-btn');
      if (!input || !window.ExoticAuth) return;

      const username = input.value.trim();

      // Start hardware biometric scan synchronously BEFORE any network await to preserve user gesture!
      let pendingBioPromise = null;
      if (
        !signinTargetIsGuest &&
        signinAllowedMethods.length > 0 &&
        (signinAuthMethod === 'fingerprint' || signinAuthMethod === 'faceid')
      ) {
        if (
          !signinBioAssertion ||
          signinBioAssertion.method !== signinAuthMethod ||
          signinBioAssertion.username !== username.toLowerCase()
        ) {
          if (window.ExoticAuth.isValidFormat(username)) {
            pendingBioPromise = startBiometricFlowSync('signin');
          }
        }
      }

      const isValid = await validateSignInUsername(true);
      if (!isValid || !input.checkValidity()) {
        window.ExoticAuth.stopCameraScan?.();
        input.reportValidity();
        return;
      }

      let authPayload = signinTargetIsGuest
        ? { authMethod: 'none', isGuest: true }
        : { authMethod: signinAuthMethod };

      if (!signinTargetIsGuest && signinAuthMethod === 'password') {
        const pwInput = document.getElementById('signin-password-input');
        if (!validateCredentialFieldLive('signin') || !pwInput?.checkValidity()) {
          pwInput?.reportValidity();
          return;
        }
        authPayload.credential = pwInput.value;
      } else if (!signinTargetIsGuest && signinAuthMethod === 'pin') {
        const pinInput = document.getElementById('signin-pin-input');
        if (!validateCredentialFieldLive('signin') || !pinInput?.checkValidity()) {
          pinInput?.reportValidity();
          return;
        }
        authPayload.credential = pinInput.value.trim();
      } else if (!signinTargetIsGuest) {
        if (pendingBioPromise) {
          const verified = await pendingBioPromise;
          if (!verified) return;
        } else if (
          !signinBioAssertion ||
          signinBioAssertion.method !== signinAuthMethod ||
          signinBioAssertion.username !== username.toLowerCase()
        ) {
          setCredentialValidationUI(
            'signin',
            'neutral',
            `Tap Verify to scan ${window.ExoticAuth.formatMethodLabel(signinAuthMethod)}`,
            'SCAN',
            getMethodIconName(signinAuthMethod)
          );
          return;
        }
        authPayload = {
          authMethod: signinAuthMethod,
          biometricMode: signinBioAssertion.biometricMode,
          biometricCredentialId: signinBioAssertion.biometricCredentialId,
          webauthnAssertion: signinBioAssertion.webauthnAssertion,
          webauthnAttestation: signinBioAssertion.webauthnAttestation,
          faceDescriptor: signinBioAssertion.faceDescriptor,
          challenge: signinBioAssertion.challenge
        };
      }

      if (submitBtn) submitBtn.disabled = true;
      const res = await window.ExoticAuth.signIn(username, authPayload);
      if (submitBtn) submitBtn.disabled = false;

      if (res && res.ok) {
        input.value = '';
        const pwIn = document.getElementById('signin-password-input');
        const pinIn = document.getElementById('signin-pin-input');
        if (pwIn) pwIn.value = '';
        if (pinIn) pinIn.value = '';
        signinBioAssertion = null;
        window.ExoticAudio.buy();
        showToast(`Signed in as @${res.username}.`);
        window.ExoticRouter.navigate('menu');
        return;
      }

      if (res?.code === 'AUTH_METHOD_MISMATCH' && res.expectedMethod) {
        signinManualMethodOverride = false;
        applySigninAllowedMethods(
          res.expectedMethods || [res.expectedMethod],
          res.biometricModes || {},
          res.biometricCredentialIds || {}
        );
        setCredentialValidationUI(
          'signin',
          'invalid',
          res.reason || `Use ${window.ExoticAuth.formatMethodLabel(res.expectedMethod)} to sign in`,
          'SWITCHED',
          getMethodIconName(res.expectedMethod)
        );
      } else if (res?.code === 'INVALID_CREDENTIAL' || res?.code === 'CREDENTIAL_INVALID') {
        const msg = res.reason || 'Incorrect credential';
        setCredentialValidationUI('signin', 'invalid', msg, 'DENIED', 'skull');
        if (signinAuthMethod === 'password') {
          const pwInput = document.getElementById('signin-password-input');
          if (pwInput) {
            pwInput.setCustomValidity(msg);
            pwInput.reportValidity();
          }
        } else if (signinAuthMethod === 'pin') {
          const pinInput = document.getElementById('signin-pin-input');
          if (pinInput) {
            pinInput.setCustomValidity(msg);
            pinInput.reportValidity();
          }
        } else {
          signinBioAssertion = null;
        }
      } else if (
        res?.code === 'USERNAME_NOT_REGISTERED' ||
        res?.error === 'username_not_registered'
      ) {
        input.setCustomValidity('username is not registered');
        setAuthValidationUI(
          'signin',
          'invalid',
          'username is not registered',
          'UNREGISTERED',
          'skull'
        );
        input.reportValidity();
      } else if (res?.code === 'FORCED_BOUND_ACCOUNT' || res?.error === 'account_locked') {
        const b = res.boundUsername || window.ExoticAuth.getBoundUsername() || 'runner';
        const lockMsg = `Account locked to @${b} until deleted in Settings`;
        input.setCustomValidity(lockMsg);
        setAuthValidationUI('signin', 'invalid', lockMsg, 'LOCKED', 'lock');
        renderSignInView();
        input.reportValidity();
      } else {
        input.setCustomValidity('username is invalid');
        setAuthValidationUI('signin', 'invalid', 'username is invalid', 'INVALID', 'skull');
        input.reportValidity();
      }
    });

    document.getElementById('header-mute-btn')?.addEventListener('click', () => {
      const next = !window.ExoticAudio.isMuted();
      window.ExoticAudio.setMuted(next);
      window.ExoticStorage.updateSettings({ muted: next });
      if (!next) window.ExoticAudio.click();
      updateGlobalHeader();
      if (window.ExoticRouter.getCurrent() === 'settings') renderSettingsView();
    });

    document.getElementById('menu-btn-play')?.addEventListener('click', () => {
      window.ExoticAudio.unlock();
      window.ExoticAudio.click();
      launchLevel(getNextPlayableLevelId());
    });

    document.querySelectorAll('[data-route]').forEach((btn) => {
      btn.addEventListener('click', () => {
        window.ExoticAudio.unlock();
        window.ExoticAudio.click();
        const route = btn.getAttribute('data-route');
        window.ExoticRouter.navigate(route);
      });
    });

    document.getElementById('play-emote-btn')?.addEventListener('click', () => {
      window.ExoticEngine.triggerEmote();
    });

    document.getElementById('play-retry-btn')?.addEventListener('click', () => {
      window.ExoticAudio.click();
      window.ExoticEngine.quickRetry();
    });

    document.getElementById('play-fullscreen-btn')?.addEventListener('click', () => {
      toggleCanvasFullscreen();
    });

    document.getElementById('pause-fullscreen-btn')?.addEventListener('click', () => {
      toggleCanvasFullscreen();
    });

    const handleNativeFullscreenChange = () => {
      const hasFs = Boolean(getNativeFullscreenElement());
      if (hasFs) {
        nativeFsActive = true;
        canvasFullscreen = true;
        document.getElementById('app')?.classList.add('is-canvas-fullscreen');
        updateFullscreenButtons();
      } else if (nativeFsActive) {
        nativeFsActive = false;
        canvasFullscreen = false;
        document.getElementById('app')?.classList.remove('is-canvas-fullscreen');
        updateFullscreenButtons();
      }
    };
    document.addEventListener('fullscreenchange', handleNativeFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleNativeFullscreenChange);

    document.getElementById('play-pause-btn')?.addEventListener('click', () => {
      window.ExoticAudio.click();
      const next = !window.ExoticEngine.isPaused();
      window.ExoticEngine.setPaused(next);
      openPauseModal(next);
    });

    document.querySelectorAll('[data-touch-key]').forEach((btn) => {
      const key = btn.getAttribute('data-touch-key');
      const press = (e) => {
        e.preventDefault();
        window.ExoticEngine.setTouchKey(key, true);
      };
      const release = (e) => {
        e.preventDefault();
        window.ExoticEngine.setTouchKey(key, false);
      };
      btn.addEventListener('pointerdown', press);
      btn.addEventListener('pointerup', release);
      btn.addEventListener('pointerleave', release);
      btn.addEventListener('pointercancel', release);
    });

    document.getElementById('pause-resume-btn')?.addEventListener('click', () => {
      window.ExoticAudio.click();
      window.ExoticEngine.setPaused(false);
      openPauseModal(false);
    });

    document.getElementById('pause-restart-btn')?.addEventListener('click', () => {
      window.ExoticAudio.click();
      openPauseModal(false);
      window.ExoticEngine.restartLevel();
    });

    document.getElementById('pause-levels-btn')?.addEventListener('click', () => {
      window.ExoticAudio.click();
      openPauseModal(false);
      window.ExoticRouter.navigate('levels');
    });

    document.getElementById('pause-menu-btn')?.addEventListener('click', () => {
      window.ExoticAudio.click();
      openPauseModal(false);
      window.ExoticRouter.navigate('menu');
    });

    document.getElementById('vic-publish-btn')?.addEventListener('click', () => {
      window.ExoticAudio.click();
      openLbSharePromptModal();
    });

    document.getElementById('vic-dont-store-btn')?.addEventListener('click', () => {
      window.ExoticAudio.click();
      declinePublicRunShare();
    });

    document.getElementById('vic-open-settings-btn')?.addEventListener('click', () => {
      window.ExoticAudio.click();
      closeModals();
      window.ExoticRouter.navigate('settings');
    });

    document.getElementById('lb-prompt-confirm-share-btn')?.addEventListener('click', async () => {
      window.ExoticAudio.click();
      await confirmPublicRunShare();
    });

    document.getElementById('lb-prompt-decline-btn')?.addEventListener('click', () => {
      window.ExoticAudio.click();
      declinePublicRunShare();
    });

    document.getElementById('lb-first-notice-dismiss-btn')?.addEventListener('click', async () => {
      window.ExoticAudio.click();
      const uname = window.ExoticAuth?.getUsername() || '';
      document.getElementById('lb-first-signin-modal')?.classList.remove('is-open');
      await markLbFirstSigninNoticeSeen(uname);
    });

    document.getElementById('vic-next-btn')?.addEventListener('click', () => {
      window.ExoticAudio.click();
      const maxStage = window.ExoticAuth?.isGuest()
        ? window.ExoticAuth.GUEST_MAX_LEVEL
        : 8;
      if (lastWinPayload && lastWinPayload.level.id < maxStage) {
        launchLevel(lastWinPayload.level.id + 1);
      }
    });

    document.getElementById('vic-replay-btn')?.addEventListener('click', () => {
      window.ExoticAudio.click();
      if (lastWinPayload) {
        launchLevel(lastWinPayload.level.id);
      }
    });

    document.getElementById('vic-levels-btn')?.addEventListener('click', () => {
      window.ExoticAudio.click();
      closeModals();
      window.ExoticRouter.navigate('levels');
    });

    document.getElementById('set-theme-dark')?.addEventListener('click', () => {
      window.ExoticAudio.click();
      window.ExoticTheme.setMode('dark');
      window.ExoticStorage.updateSettings({ theme: 'dark' });
      updateGlobalHeader();
      renderSettingsView();
    });

    document.getElementById('set-theme-light')?.addEventListener('click', () => {
      window.ExoticAudio.click();
      window.ExoticTheme.setMode('light');
      window.ExoticStorage.updateSettings({ theme: 'light' });
      updateGlobalHeader();
      renderSettingsView();
    });

    document.getElementById('set-color-colored')?.addEventListener('click', () => {
      window.ExoticAudio.click();
      window.ExoticTheme.setColorMode('colored');
      window.ExoticStorage.updateSettings({ colorMode: 'colored' });
      updateGlobalHeader();
      renderSettingsView();
    });

    document.getElementById('set-color-monochrome')?.addEventListener('click', () => {
      window.ExoticAudio.click();
      window.ExoticTheme.setColorMode('monochrome');
      window.ExoticStorage.updateSettings({ colorMode: 'monochrome' });
      updateGlobalHeader();
      renderSettingsView();
    });

    document.getElementById('set-audio-toggle')?.addEventListener('click', () => {
      const next = !window.ExoticAudio.isMuted();
      window.ExoticAudio.setMuted(next);
      window.ExoticStorage.updateSettings({ muted: next });
      if (!next) window.ExoticAudio.click();
      updateGlobalHeader();
      renderSettingsView();
    });

    document.querySelectorAll('[data-vol-preset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const val = Number(btn.getAttribute('data-vol-preset'));
        window.ExoticAudio.setMuted(false);
        window.ExoticAudio.setVolume(val);
        window.ExoticStorage.updateSettings({ muted: false, volume: val });
        window.ExoticAudio.click();
        updateGlobalHeader();
        renderSettingsView();
      });
    });

    document.getElementById('set-shake-toggle')?.addEventListener('click', () => {
      window.ExoticAudio.click();
      const cur = window.ExoticStorage.getState().settings.screenShake;
      window.ExoticStorage.updateSettings({ screenShake: !cur });
      renderSettingsView();
    });

    document.getElementById('set-touch-toggle')?.addEventListener('click', () => {
      window.ExoticAudio.click();
      const cur = window.ExoticStorage.getState().settings.touchControls;
      window.ExoticStorage.updateSettings({ touchControls: !cur });
      renderSettingsView();
    });

    document.getElementById('set-ghosts-toggle')?.addEventListener('click', () => {
      window.ExoticAudio.click();
      const cur = window.ExoticStorage.getState().settings.liveGhosts !== false;
      window.ExoticStorage.updateSettings({ liveGhosts: !cur });
      renderSettingsView();
    });

    document.getElementById('set-lb-share-toggle')?.addEventListener('click', async () => {
      if (window.ExoticAuth?.isGuest()) return;
      window.ExoticAudio.click();
      const cur = Boolean(window.ExoticStorage.getState().settings.leaderboardShareEnabled);
      const next = !cur;
      await window.ExoticStorage.updateSettings({ leaderboardShareEnabled: next });
      renderSettingsView();
      showToast(
        next
          ? 'Leaderboards Share enabled.'
          : 'Leaderboards Share disabled. Runs will not be stored.'
      );
    });

    document.getElementById('set-lb-prompt-toggle')?.addEventListener('click', async () => {
      if (window.ExoticAuth?.isGuest()) return;
      window.ExoticAudio.click();
      const cur = Boolean(window.ExoticStorage.getState().settings.leaderboardPromptEnabled);
      const next = !cur;
      await window.ExoticStorage.updateSettings({ leaderboardPromptEnabled: next });
      renderSettingsView();
      showToast(
        next
          ? 'Leaderboards Sharing Prompt enabled.'
          : 'Leaderboards Sharing Prompt disabled.'
      );
    });

    document.getElementById('set-signout-btn')?.addEventListener('click', async () => {
      window.ExoticAudio.click();
      const btn = document.getElementById('set-signout-btn');
      if (btn) btn.disabled = true;
      const prevUser = window.ExoticAuth?.getUsername() || 'runner';
      document.getElementById('lb-first-signin-modal')?.classList.remove('is-open');
      await window.ExoticAuth?.signOut();
      if (btn) btn.disabled = false;
      showToast(`Signed out of @${prevUser}. Sign back in anytime.`);
      window.ExoticRouter.navigate('signin');
    });

    document.getElementById('set-delete-account-btn')?.addEventListener('click', () => {
      window.ExoticAudio.click();
      const box = document.getElementById('set-delete-confirm-box');
      const txt = document.getElementById('set-delete-confirm-text');
      const uname = window.ExoticAuth?.getUsername() || 'runner';
      if (txt) {
        txt.textContent = `Permanently delete @${uname}? This removes your username, Coins, Skill Points, Loadout, and Verified Runs, and unlocks registering a new account.`;
      }
      box?.classList.toggle('is-open');
    });

    document.getElementById('set-cancel-delete-btn')?.addEventListener('click', () => {
      window.ExoticAudio.click();
      document.getElementById('set-delete-confirm-box')?.classList.remove('is-open');
    });

    document.getElementById('set-confirm-delete-btn')?.addEventListener('click', async () => {
      window.ExoticAudio.click();
      const btn = document.getElementById('set-confirm-delete-btn');
      if (btn) btn.disabled = true;
      const res = await window.ExoticAuth?.deleteAccount();
      if (btn) btn.disabled = false;
      document.getElementById('set-delete-confirm-box')?.classList.remove('is-open');
      if (res && res.ok) {
        clearLbFirstSigninNoticeLocal(res.deletedUsername);
        document.getElementById('lb-first-signin-modal')?.classList.remove('is-open');
        const signupInput = document.getElementById('signup-username-input');
        const guestInput = document.getElementById('guest-signup-username-input');
        const signinInput = document.getElementById('signin-username-input');
        if (signupInput) signupInput.value = '';
        if (guestInput) guestInput.value = '';
        if (signinInput) signinInput.value = '';
        guestSignupCandidateLoaded = false;
        signinTargetIsGuest = false;
        applySigninAllowedMethods([]);
        showToast(`Deleted @${res.deletedUsername}. You may register a new account.`);
        window.ExoticRouter.navigate('signup');
      } else {
        showToast('Could not delete account.');
      }
    });

    // Settings Guest Username Change (Custom HTML5 Validation: username is available / username is taken)
    document.getElementById('set-guest-shuffle-btn')?.addEventListener('click', async () => {
      window.ExoticAudio.unlock();
      window.ExoticAudio.click();
      const input = document.getElementById('set-guest-username-input');
      if (!input || !window.ExoticAuth?.isGuest()) return;
      const candidate = await window.ExoticAuth.generateGuestUsername();
      guestRenameCheckSeq += 1;
      input.value = candidate;
      input.setCustomValidity('');
      setAuthValidationUI(
        'set-guest',
        'valid',
        'username is available',
        'AVAILABLE',
        'check'
      );
    });

    const setGuestInput = document.getElementById('set-guest-username-input');
    if (setGuestInput) {
      setGuestInput.addEventListener('input', () => {
        if (guestRenameDebounceTimer) clearTimeout(guestRenameDebounceTimer);
        const val = setGuestInput.value.trim();
        const cur = window.ExoticAuth?.getUsername() || '';
        if (!val || !window.ExoticAuth?.isValidFormat(val) || val.toLowerCase() === cur.toLowerCase()) {
          validateSettingsGuestUsername(true);
          return;
        }
        setGuestInput.setCustomValidity('Checking username availability...');
        setAuthValidationUI(
          'set-guest',
          'neutral',
          'Checking availability...',
          'WAIT',
          'user'
        );
        guestRenameDebounceTimer = setTimeout(() => {
          validateSettingsGuestUsername(false);
        }, 160);
      });

      setGuestInput.addEventListener('invalid', () => {
        if (
          !setGuestInput.validationMessage ||
          setGuestInput.validity.valueMissing ||
          setGuestInput.validity.tooShort ||
          setGuestInput.validity.patternMismatch
        ) {
          setGuestInput.setCustomValidity('username is invalid');
          setAuthValidationUI(
            'set-guest',
            'invalid',
            'username is invalid (3–20 letters, numbers, or _)',
            'INVALID',
            'skull'
          );
        }
      });
    }

    document.getElementById('set-guest-username-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      window.ExoticAudio.unlock();
      window.ExoticAudio.click();
      const input = document.getElementById('set-guest-username-input');
      const saveBtn = document.getElementById('set-guest-save-btn');
      if (!input || !window.ExoticAuth?.isGuest()) return;

      const isValid = await validateSettingsGuestUsername(true);
      if (!isValid || !input.checkValidity()) {
        input.reportValidity();
        return;
      }

      const nextName = input.value.trim();
      if (saveBtn) saveBtn.disabled = true;
      const res = await window.ExoticAuth.renameGuestUsername(nextName);
      if (saveBtn) saveBtn.disabled = false;

      if (res && res.ok) {
        window.ExoticAudio.buy();
        input.value = res.username;
        input.setCustomValidity('');
        setAuthValidationUI(
          'set-guest',
          'valid',
          `Saved Guest username @${res.username}`,
          'SAVED',
          'check'
        );
        updateGlobalHeader();
        renderSettingsView();
        showToast(`Guest username updated to @${res.username}.`);
        return;
      }

      if (res?.code === 'USERNAME_TAKEN') {
        input.setCustomValidity('username is taken');
        setAuthValidationUI('set-guest', 'invalid', 'username is taken', 'TAKEN', 'skull');
        input.reportValidity();
      } else {
        input.setCustomValidity('username is invalid');
        setAuthValidationUI('set-guest', 'invalid', 'username is invalid', 'INVALID', 'skull');
        input.reportValidity();
      }
    });

    // Settings Authentication Methods: Connect / Disconnect (Password, PIN, Touch ID / Fingerprint, Face ID)
    document.getElementById('set-connect-password-btn')?.addEventListener('click', () => {
      window.ExoticAudio.click();
      document.getElementById('set-drawer-pin')?.classList.remove('is-open');
      const drawer = document.getElementById('set-drawer-password');
      const open = drawer ? !drawer.classList.contains('is-open') : false;
      drawer?.classList.toggle('is-open', open);
      if (open) {
        document.getElementById('set-connect-password-input')?.focus();
      }
    });

    document.getElementById('set-cancel-password-btn')?.addEventListener('click', () => {
      window.ExoticAudio.click();
      document.getElementById('set-drawer-password')?.classList.remove('is-open');
      const pwIn = document.getElementById('set-connect-password-input');
      if (pwIn) pwIn.value = '';
    });

    document.getElementById('set-save-password-btn')?.addEventListener('click', async () => {
      window.ExoticAudio.click();
      if (!window.ExoticAuth || settingsAuthBusy) return;
      const pwIn = document.getElementById('set-connect-password-input');
      const val = pwIn ? pwIn.value : '';
      if (!window.ExoticAuth.isValidPassword(val)) {
        setSettingsAuthFeedback(
          'invalid',
          'Password must be 4 to 64 characters',
          'SHORT',
          'skull'
        );
        pwIn?.focus();
        return;
      }

      settingsAuthBusy = true;
      renderSettingsAuthMethods(true);
      const res = await window.ExoticAuth.connectAuthMethod({
        authMethod: 'password',
        credential: val
      });
      settingsAuthBusy = false;

      if (res && res.ok) {
        if (pwIn) pwIn.value = '';
        document.getElementById('set-drawer-password')?.classList.remove('is-open');
        window.ExoticAudio.buy();
        setSettingsAuthFeedback(
          'valid',
          `Password active · Sign In methods: ${window.ExoticAuth.formatMethodListLabel(
            res.authMethods
          )}`,
          'ACTIVE',
          'check'
        );
        renderSettingsView();
        showToast('Password sign-in method enabled.');
      } else {
        setSettingsAuthFeedback(
          'invalid',
          res?.reason || 'Could not enable Password',
          'ERROR',
          'skull'
        );
        renderSettingsAuthMethods(true);
      }
    });

    document.getElementById('set-connect-pin-input')?.addEventListener('input', (e) => {
      const target = e.target;
      if (target) {
        const clean = target.value.replace(/\D+/g, '').slice(0, 8);
        if (target.value !== clean) target.value = clean;
      }
    });

    document.getElementById('set-connect-pin-btn')?.addEventListener('click', () => {
      window.ExoticAudio.click();
      document.getElementById('set-drawer-password')?.classList.remove('is-open');
      const drawer = document.getElementById('set-drawer-pin');
      const open = drawer ? !drawer.classList.contains('is-open') : false;
      drawer?.classList.toggle('is-open', open);
      if (open) {
        document.getElementById('set-connect-pin-input')?.focus();
      }
    });

    document.getElementById('set-cancel-pin-btn')?.addEventListener('click', () => {
      window.ExoticAudio.click();
      document.getElementById('set-drawer-pin')?.classList.remove('is-open');
      const pinIn = document.getElementById('set-connect-pin-input');
      if (pinIn) pinIn.value = '';
    });

    document.getElementById('set-save-pin-btn')?.addEventListener('click', async () => {
      window.ExoticAudio.click();
      if (!window.ExoticAuth || settingsAuthBusy) return;
      const pinIn = document.getElementById('set-connect-pin-input');
      const digits = pinIn ? pinIn.value.replace(/\D+/g, '').slice(0, 8) : '';
      if (!window.ExoticAuth.isValidPin(digits)) {
        setSettingsAuthFeedback(
          'invalid',
          'PIN must be 4 to 8 numeric digits',
          'INVALID',
          'skull'
        );
        pinIn?.focus();
        return;
      }

      settingsAuthBusy = true;
      renderSettingsAuthMethods(true);
      const res = await window.ExoticAuth.connectAuthMethod({
        authMethod: 'pin',
        credential: digits
      });
      settingsAuthBusy = false;

      if (res && res.ok) {
        if (pinIn) pinIn.value = '';
        document.getElementById('set-drawer-pin')?.classList.remove('is-open');
        window.ExoticAudio.buy();
        setSettingsAuthFeedback(
          'valid',
          `PIN active · Sign In methods: ${window.ExoticAuth.formatMethodListLabel(
            res.authMethods
          )}`,
          'ACTIVE',
          'check'
        );
        renderSettingsView();
        showToast('PIN sign-in method enabled.');
      } else {
        setSettingsAuthFeedback(
          'invalid',
          res?.reason || 'Could not enable PIN',
          'ERROR',
          'skull'
        );
        renderSettingsAuthMethods(true);
      }
    });

    function connectSettingsBiometricSync(method) {
      window.ExoticAudio.unlock();
      window.ExoticAudio.click();
      if (!window.ExoticAuth || settingsAuthBusy) return;

      const uname = window.ExoticAuth.getUsername();
      if (!uname) return;

      const label = method === 'faceid' ? 'Face ID' : 'Touch ID / Fingerprint';
      const iconName = getMethodIconName(method);
      const support = window.ExoticAuth.getMethodSupport(method);
      if (!support.supported) {
        setSettingsAuthFeedback(
          'invalid',
          support.reason || `${label} hardware is not available on this device`,
          'NO SENSOR',
          'skull'
        );
        renderSettingsAuthMethods(true);
        return;
      }

      document.getElementById('set-drawer-password')?.classList.remove('is-open');
      document.getElementById('set-drawer-pin')?.classList.remove('is-open');

      const faceViewport = document.getElementById('set-face-viewport');
      const faceCanvas = document.getElementById('set-face-canvas');
      const caps = window.ExoticBiometrics?.getCapabilities?.() || {};
      const willOpenInlineCamera =
        method === 'faceid' &&
        support.mode === 'camera_face' &&
        (!caps.isEmbeddedFrame || caps.inlineCameraAllowed);

      if (faceViewport) {
        faceViewport.classList.toggle('is-open', Boolean(willOpenInlineCamera));
      }

      settingsAuthBusy = true;
      renderSettingsAuthMethods(true);
      setSettingsAuthFeedback(
        'neutral',
        `Complete ${label} scan on your device...`,
        'SCAN',
        iconName
      );

      // Must run synchronously inside click gesture to preserve hardware WebAuthn user activation!
      const scanPromise = window.ExoticAuth.startHardwareBiometricScanSync({
        flow: 'signup',
        method,
        username: uname,
        expectedBiometricMode: support.mode,
        canvasEl: faceCanvas,
        onProgress(info) {
          if (info && info.hint) {
            setSettingsAuthFeedback(
              'neutral',
              info.hint,
              info.pct != null ? `${info.pct}%` : 'SCAN',
              iconName
            );
          }
        }
      });

      scanPromise.then(async (bioRes) => {
        if (faceViewport) faceViewport.classList.remove('is-open');

        if (!bioRes || !bioRes.ok) {
          settingsAuthBusy = false;
          setSettingsAuthFeedback(
            'invalid',
            bioRes?.reason || `${label} scan did not complete`,
            'FAILED',
            'skull'
          );
          renderSettingsAuthMethods(true);
          return;
        }

        const saveRes = await window.ExoticAuth.connectAuthMethod({
          authMethod: method,
          biometricMode: bioRes.biometricMode || 'webauthn',
          biometricCredentialId: bioRes.biometricCredentialId || null,
          webauthnAttestation: bioRes.webauthnAttestation || null,
          faceDescriptor: bioRes.faceDescriptor || null,
          challenge: bioRes.challenge || null
        });

        settingsAuthBusy = false;
        if (saveRes && saveRes.ok) {
          window.ExoticAudio.buy();
          setSettingsAuthFeedback(
            'valid',
            `${label} active · Sign In methods: ${window.ExoticAuth.formatMethodListLabel(
              saveRes.authMethods
            )}`,
            'ACTIVE',
            'check'
          );
          renderSettingsView();
          showToast(`${label} sign-in method enabled.`);
        } else {
          setSettingsAuthFeedback(
            'invalid',
            saveRes?.reason || `Could not enable ${label}`,
            'ERROR',
            'skull'
          );
          renderSettingsAuthMethods(true);
        }
      });
    }

    document
      .getElementById('set-connect-fingerprint-btn')
      ?.addEventListener('click', () => connectSettingsBiometricSync('fingerprint'));

    document
      .getElementById('set-connect-faceid-btn')
      ?.addEventListener('click', () => connectSettingsBiometricSync('faceid'));

    async function disconnectSettingsMethod(method) {
      window.ExoticAudio.click();
      if (!window.ExoticAuth || settingsAuthBusy) return;

      const label =
        method === 'fingerprint'
          ? 'Touch ID / Fingerprint'
          : window.ExoticAuth.formatMethodLabel(method);

      const currentMethods = window.ExoticAuth.getAuthMethods();
      if (currentMethods.length <= 1) {
        setSettingsAuthFeedback(
          'invalid',
          'Keep at least one sign-in method active. Connect another method first.',
          'LOCKED',
          'lock'
        );
        showToast('Connect another sign-in method before disconnecting your last one.');
        return;
      }

      settingsAuthBusy = true;
      renderSettingsAuthMethods(true);
      const res = await window.ExoticAuth.disconnectAuthMethod(method);
      settingsAuthBusy = false;

      if (res && res.ok) {
        setSettingsAuthFeedback(
          'neutral',
          `${label} removed · Active on Sign In: ${window.ExoticAuth.formatMethodListLabel(
            res.authMethods
          )}`,
          `${res.authMethods.length} ACTIVE`,
          'check'
        );
        renderSettingsView();
        showToast(`${label} sign-in method disconnected.`);
      } else {
        setSettingsAuthFeedback(
          'invalid',
          res?.reason || `Could not disconnect ${label}`,
          'LOCKED',
          'lock'
        );
        renderSettingsAuthMethods(true);
      }
    }

    ['password', 'pin', 'fingerprint', 'faceid'].forEach((m) => {
      document
        .getElementById(`set-disconnect-${m}-btn`)
        ?.addEventListener('click', () => disconnectSettingsMethod(m));
    });

    document.getElementById('set-save-anon-btn')?.addEventListener('click', async () => {
      window.ExoticAudio.click();
      const inputEl = document.getElementById('set-anon-key-input');
      const val = inputEl ? inputEl.value.trim() : '';
      if (window.ExoticSupabase) {
        await window.ExoticSupabase.setAnonKey(val);
      }
      showToast('Settings updated.');
      renderSettingsView();
    });

    document.getElementById('set-upload-card-btn')?.addEventListener('click', async () => {
      window.ExoticAudio.click();
      const btn = document.getElementById('set-upload-card-btn');
      if (btn) btn.disabled = true;
      const pngDataUrl = renderMonochromeRunnerCardPng();
      const res = await window.ExoticStorage.uploadRunnerCard(pngDataUrl);
      if (btn) btn.disabled = false;
      if (res.ok) {
        window.ExoticAudio.buy();
        showToast('Loadout Card saved to your profile.');
        renderSettingsView();
      } else {
        showToast('Could not save Loadout Card.');
      }
    });

    document.getElementById('set-sync-now-btn')?.addEventListener('click', async () => {
      window.ExoticAudio.click();
      const btn = document.getElementById('set-sync-now-btn');
      if (btn) btn.disabled = true;
      if (window.ExoticRealtime) {
        await window.ExoticRealtime.bootstrapFromCloud();
      }
      if (btn) btn.disabled = false;
      updateGlobalHeader();
      refreshCurrentRouteInPlace();
      showToast('Account profile, armory, and leaderboards synchronized.');
    });

    document.getElementById('set-reset-btn')?.addEventListener('click', async () => {
      window.ExoticAudio.click();
      await window.ExoticStorage.resetAllData();
      showToast('All runner progress has been reset.');
      updateGlobalHeader();
      renderSettingsView();
    });
  }

  window.ExoticViews = {
    init() {
      bindStaticEvents();
      bindRealtimeHooks();

      window.ExoticStorage.subscribe(() => {
        updateGlobalHeader();
        refreshCurrentRouteInPlace();
      });

      window.ExoticAuth?.subscribe(() => {
        updateGlobalHeader();
        refreshCurrentRouteInPlace();
      });

      window.ExoticTheme?.onChange(() => {
        syncThemeButtonsUI();
      });

      window.ExoticRouter.onNavigate((route) => {
        if (route !== 'signup' && route !== 'signin' && route !== 'settings') {
          window.ExoticAuth?.stopCameraScan?.();
        }
        if (route !== 'settings') {
          document.getElementById('set-face-viewport')?.classList.remove('is-open');
        }
        if (route !== 'play' && canvasFullscreen) {
          setCanvasFullscreen(false);
        }
        updateGlobalHeader();
        if (route === 'signup') renderSignUpView();
        else if (route === 'signin') renderSignInView();
        else if (route === 'menu') renderMenuSummary();
        else if (route === 'levels') renderLevelsView();
        else if (route === 'shop') renderShopView();
        else if (route === 'achievements') renderAchievementsView();
        else if (route === 'leaderboards') renderLeaderboardsView();
        else if (route === 'settings') renderSettingsView();

        maybeShowFirstSignInLeaderboardDialog();
      });

      updateFullscreenButtons();
      updateGlobalHeader();
    },
    onHudUpdate(hud) {
      const stageEl = document.getElementById('hud-stage-label');
      const deathsEl = document.getElementById('hud-deaths-val');
      const timeEl = document.getElementById('hud-time-val');
      const coinsEl = document.getElementById('hud-coins-val');
      const spEl = document.getElementById('hud-sp-val');

      const state = window.ExoticStorage.getState();
      if (stageEl) stageEl.textContent = `${hud.levelCode} · ${hud.levelTitle}`;
      if (deathsEl) deathsEl.textContent = String(hud.deaths);
      if (timeEl) timeEl.textContent = formatTime(hud.timeMs);
      if (coinsEl) coinsEl.textContent = String(state.coins);
      if (spEl) spEl.textContent = String(state.skillPoints);
      updateCloudIndicators();
    },
    openVictoryModal,
    openPauseModal,
    showToast,
    showRageQuip,
    launchLevel,
    toggleCanvasFullscreen
  };
})();
