(function () {
  let activeShopCategory = 'characters';
  let activeLbLevel = 'all';
  let activeLbSort = 'time';
  let lastWinPayload = null;
  let rageBannerTimer = null;

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
    for (const lvl of window.ExoticLevels.LEVELS) {
      const st = state.levelStats[lvl.id];
      if (!st || !st.cleared) return lvl.id;
    }
    return 1;
  }

  function updateGlobalHeader() {
    const state = window.ExoticStorage.getState();
    const coinsEl = document.getElementById('header-coins');
    const spEl = document.getElementById('header-sp');
    if (coinsEl) coinsEl.textContent = String(state.coins);
    if (spEl) spEl.textContent = String(state.skillPoints);

    const themeBtn = document.getElementById('header-theme-btn');
    const playThemeBtn = document.getElementById('play-theme-btn');
    const isDark = window.ExoticTheme.getMode() === 'dark';
    const themeIcon = window.ExoticIcons.get(isDark ? 'sun' : 'moon');
    const themeLabel = isDark ? 'Light Mode' : 'Dark Mode';
    if (themeBtn) {
      themeBtn.innerHTML = `${themeIcon}<span>${themeLabel}</span>`;
    }
    if (playThemeBtn) {
      playThemeBtn.innerHTML = themeIcon;
      playThemeBtn.setAttribute('title', `Switch to ${themeLabel}`);
    }

    const muteBtn = document.getElementById('header-mute-btn');
    const isMuted = window.ExoticAudio.isMuted();
    if (muteBtn) {
      muteBtn.innerHTML = window.ExoticIcons.get(isMuted ? 'soundOff' : 'soundOn');
      muteBtn.setAttribute('title', isMuted ? 'Unmute Audio' : 'Mute Audio');
    }
  }

  function renderMenuSummary() {
    const state = window.ExoticStorage.getState();
    const clearedCount = Object.values(state.levelStats).filter((s) => s && s.cleared).length;
    const nextLvl = window.ExoticLevels.getById(getNextPlayableLevelId());

    const playBtnLabel = document.getElementById('menu-play-label');
    if (playBtnLabel) {
      playBtnLabel.textContent =
        clearedCount === 0
          ? `Play — Level ${nextLvl.code}: ${nextLvl.title}`
          : clearedCount < 8
          ? `Continue — Level ${nextLvl.code}: ${nextLvl.title}`
          : 'Play — Replay Campaign';
    }

    const statCleared = document.getElementById('menu-stat-cleared');
    const statDeaths = document.getElementById('menu-stat-deaths');
    const statAch = document.getElementById('menu-stat-ach');
    if (statCleared) statCleared.textContent = `${clearedCount} / 8`;
    if (statDeaths) statDeaths.textContent = String(state.telemetry.totalDeaths);
    if (statAch) {
      statAch.textContent = `${state.unlockedAchievements.length} / ${window.ExoticAchievements.ACHIEVEMENTS.length}`;
    }

    const loadoutLabel = document.getElementById('menu-loadout-chip');
    if (loadoutLabel) {
      const charItem = window.ExoticShopData.getById(state.equipped.character);
      const auraItem = window.ExoticShopData.getById(state.equipped.aura);
      loadoutLabel.textContent = `${charItem ? charItem.name : 'Exotic Cube'} · ${
        auraItem && auraItem.id !== 'aura_none' ? auraItem.name : 'No Aura'
      }`;
    }
  }

  function renderLevelsView() {
    const grid = document.getElementById('levels-grid');
    if (!grid) return;
    window.ExoticPreviewDirector.clear();
    grid.innerHTML = '';

    const state = window.ExoticStorage.getState();

    window.ExoticLevels.LEVELS.forEach((lvl, idx) => {
      const stats = state.levelStats[lvl.id];
      const cleared = Boolean(stats && stats.cleared);
      const hasOrb = window.ExoticStorage.hasCollectedOrb(lvl.id);

      const card = document.createElement('article');
      card.className = 'ex-video-card';
      card.innerHTML = `
        <div class="ex-video-stage">
          <canvas class="ex-video-canvas"></canvas>
          <div class="ex-video-overlay-top">
            <span class="ex-video-badge"><span class="ex-video-dot"></span>LIVE · STAGE ${lvl.code}</span>
            ${
              cleared
                ? `<span class="ex-chip ex-chip--inverted">${window.ExoticIcons.get('check')}<span>Cleared</span></span>`
                : `<span class="ex-video-badge">+${lvl.rewardCoins} COINS · +2 SP</span>`
            }
          </div>
          <div class="ex-video-scrubber"><div class="ex-video-scrubber-fill"></div></div>
        </div>
        <div class="ex-card-body">
          <div class="ex-card-title-row">
            <h3 class="ex-card-title">${lvl.code}. ${escapeHtml(lvl.title)}</h3>
            <span class="ex-chip ex-chip--subtle">${hasOrb ? 'Orb Found' : '1 Skill Orb'}</span>
          </div>
          <p class="ex-card-desc">${escapeHtml(lvl.subtitle)}</p>
          <div class="level-meta-pills">
            <span class="ex-chip ex-chip--subtle mono">Best: ${
              cleared && stats.bestTimeMs ? formatTime(stats.bestTimeMs) : '—'
            }</span>
            <span class="ex-chip ex-chip--subtle mono">Min Deaths: ${
              cleared && typeof stats.leastDeaths === 'number' ? stats.leastDeaths : '—'
            }</span>
            <span class="ex-chip ex-chip--subtle mono">Par: ≤${lvl.parDeaths}d</span>
          </div>
        </div>
        <div class="ex-card-footer">
          <button type="button" class="ex-pill-btn ex-pill-btn--primary ex-pill-btn--md ex-pill-btn--full" data-play-level="${lvl.id}">
            ${window.ExoticIcons.get('play')}
            <span>${cleared ? `Replay Stage ${lvl.code}` : `Play Stage ${lvl.code}`}</span>
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

  function renderShopView() {
    const tabsWrap = document.getElementById('shop-category-tabs');
    const loadoutWrap = document.getElementById('shop-loadout-chips');
    const grid = document.getElementById('shop-items-grid');
    if (!tabsWrap || !grid) return;

    window.ExoticPreviewDirector.clear();
    const state = window.ExoticStorage.getState();

    // Category Pill Buttons
    tabsWrap.innerHTML = '';
    for (const cat of window.ExoticShopData.CATEGORIES) {
      const isAct = cat.id === activeShopCategory;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `ex-pill-btn ${isAct ? 'ex-pill-btn--primary' : 'ex-pill-btn--secondary'} ex-pill-btn--sm`;
      const currIcon = window.ExoticIcons.get(cat.currency === 'sp' ? 'skill' : 'coin');
      btn.innerHTML = `${currIcon}<span>${escapeHtml(cat.label)}</span>`;
      btn.addEventListener('click', () => {
        window.ExoticAudio.click();
        activeShopCategory = cat.id;
        renderShopView();
      });
      tabsWrap.appendChild(btn);
    }

    // Active Loadout Summary Chips
    if (loadoutWrap) {
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
          return `<span class="ex-chip ex-chip--subtle">${label}: ${escapeHtml(item ? item.name : id)}</span>`;
        })
        .join('');
    }

    // Shop Video Preview Cards
    grid.innerHTML = '';
    const items = window.ExoticShopData.getByCategory(activeShopCategory);

    items.forEach((item, idx) => {
      const owned = window.ExoticStorage.ownsItem(item.id);
      const isUpgrade = item.category === 'upgrades';
      const slotMap = {
        auras: 'aura',
        characters: 'character',
        skins: 'skin',
        trails: 'trail',
        emotes: 'emote'
      };
      const isEquipped = isUpgrade
        ? window.ExoticStorage.isUpgradeActive(item.id)
        : state.equipped[slotMap[item.category]] === item.id;

      const canAfford = isUpgrade ? state.skillPoints >= item.cost : state.coins >= item.cost;
      const currIcon = window.ExoticIcons.get(isUpgrade ? 'skill' : 'coin');
      const currUnit = isUpgrade ? 'SP' : 'Coins';

      let actionHtml = '';
      if (!owned) {
        actionHtml = `
          <button type="button" class="ex-pill-btn ${canAfford ? 'ex-pill-btn--primary' : 'ex-pill-btn--secondary'} ex-pill-btn--sm ex-pill-btn--full" data-buy-id="${item.id}" ${canAfford ? '' : 'disabled'}>
            ${currIcon}
            <span>${item.cost === 0 ? 'Claim Free' : `Unlock — ${item.cost} ${currUnit}`}</span>
          </button>
        `;
      } else if (isUpgrade) {
        actionHtml = `
          <button type="button" class="ex-pill-btn ${isEquipped ? 'ex-pill-btn--primary' : 'ex-pill-btn--secondary'} ex-pill-btn--sm ex-pill-btn--full" data-equip-id="${item.id}">
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

      const card = document.createElement('article');
      card.className = 'ex-video-card';
      card.innerHTML = `
        <div class="ex-video-stage">
          <canvas class="ex-video-canvas"></canvas>
          <div class="ex-video-overlay-top">
            <span class="ex-video-badge"><span class="ex-video-dot"></span>LIVE · ${escapeHtml(item.tier)}</span>
            ${
              isEquipped
                ? `<span class="ex-chip ex-chip--inverted">${isUpgrade ? 'Active' : 'Equipped'}</span>`
                : owned
                ? `<span class="ex-video-badge">Owned</span>`
                : `<span class="ex-video-badge">${item.cost} ${currUnit}</span>`
            }
          </div>
          <div class="ex-video-scrubber"><div class="ex-video-scrubber-fill"></div></div>
        </div>
        <div class="ex-card-body">
          <div class="ex-card-title-row">
            <h3 class="ex-card-title">${escapeHtml(item.name)}</h3>
          </div>
          <p class="ex-card-desc">${escapeHtml(item.desc)}</p>
        </div>
        <div class="ex-card-footer">
          ${actionHtml}
        </div>
      `;

      grid.appendChild(card);

      const canvas = card.querySelector('.ex-video-canvas');
      const scrubber = card.querySelector('.ex-video-scrubber-fill');
      window.ExoticPreviewDirector.registerShopCard(canvas, scrubber, item, idx);

      const buyBtn = card.querySelector('[data-buy-id]');
      if (buyBtn) {
        buyBtn.addEventListener('click', () => {
          const res = window.ExoticStorage.buyShopItem(item);
          if (res.ok) {
            window.ExoticAudio.buy();
            showToast(`Unlocked ${item.name}!`);
            const newlyUnlocked = window.ExoticAchievements.evaluateAll();
            for (const ach of newlyUnlocked) {
              showToast(`Achievement: ${ach.title} (+${ach.rewardCoins} Coins, +${ach.rewardSP} SP)`);
            }
            window.ExoticBackdrop.resetMenuTrail();
            renderShopView();
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
          renderShopView();
        });
      }
    });
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

    // Level Filter Pills
    const filterOptions = [
      { id: 'all', label: 'All Stages' },
      ...window.ExoticLevels.LEVELS.map((l) => ({ id: String(l.id), label: `Stage ${l.code}` }))
    ];
    levelTabs.innerHTML = '';
    for (const opt of filterOptions) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `ex-pill-btn ${activeLbLevel === opt.id ? 'ex-pill-btn--primary' : 'ex-pill-btn--secondary'} ex-pill-btn--xs`;
      btn.textContent = opt.label;
      btn.addEventListener('click', () => {
        window.ExoticAudio.click();
        activeLbLevel = opt.id;
        renderLeaderboardsView();
      });
      levelTabs.appendChild(btn);
    }

    // Sort Filter Pills
    const sortOptions = [
      { id: 'time', label: 'Fastest Time' },
      { id: 'deaths', label: 'Fewest Deaths' },
      { id: 'coins', label: 'Most Coins' }
    ];
    sortTabs.innerHTML = '';
    for (const sOpt of sortOptions) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `ex-pill-btn ${activeLbSort === sOpt.id ? 'ex-pill-btn--primary' : 'ex-pill-btn--secondary'} ex-pill-btn--xs`;
      btn.textContent = sOpt.label;
      btn.addEventListener('click', () => {
        window.ExoticAudio.click();
        activeLbSort = sOpt.id;
        renderLeaderboardsView();
      });
      sortTabs.appendChild(btn);
    }

    const runs = await window.ExoticStorage.fetchLeaderboard();
    let filtered = runs.filter((r) =>
      activeLbLevel === 'all' ? true : Number(r.levelId) === Number(activeLbLevel)
    );

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
          <p class="ex-card-desc" style="max-width:420px;">
            Exotic ships with zero mock users and zero fabricated entries. Complete any stage and submit your Callsign to claim Rank #1.
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
            <div style="font-weight:700;">${escapeHtml(r.callsign)}</div>
            <div class="lb-hide-sm" style="color:var(--fg-secondary);">${lvl ? `${lvl.code}. ${escapeHtml(lvl.title)}` : `Stage ${r.levelId}`}</div>
            <div class="mono" style="font-weight:700;">${formatTime(r.timeMs)}</div>
            <div class="mono">${r.deaths} ${r.deaths === 1 ? 'death' : 'deaths'}</div>
            <div class="lb-hide-sm mono">${r.coins || 0} coins</div>
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
        <div class="lb-hide-sm">Coins</div>
      </div>
      ${rowsHtml}
    `;
  }

  function renderSettingsView() {
    const state = window.ExoticStorage.getState();
    const s = state.settings;
    const isDark = window.ExoticTheme.getMode() === 'dark';

    const themeDarkBtn = document.getElementById('set-theme-dark');
    const themeLightBtn = document.getElementById('set-theme-light');
    if (themeDarkBtn && themeLightBtn) {
      themeDarkBtn.className = `ex-pill-btn ${isDark ? 'ex-pill-btn--primary' : 'ex-pill-btn--secondary'} ex-pill-btn--sm`;
      themeLightBtn.className = `ex-pill-btn ${!isDark ? 'ex-pill-btn--primary' : 'ex-pill-btn--secondary'} ex-pill-btn--sm`;
    }

    const muteBtn = document.getElementById('set-audio-toggle');
    if (muteBtn) {
      muteBtn.className = `ex-pill-btn ${!s.muted ? 'ex-pill-btn--primary' : 'ex-pill-btn--secondary'} ex-pill-btn--sm`;
      muteBtn.textContent = s.muted ? 'Muted (Click to Enable)' : 'Audio Enabled';
    }

    const volBtns = document.querySelectorAll('[data-vol-preset]');
    volBtns.forEach((btn) => {
      const val = Number(btn.getAttribute('data-vol-preset'));
      const active = Math.abs(s.volume - val) < 0.08 && !s.muted;
      btn.className = `ex-pill-btn ${active ? 'ex-pill-btn--primary' : 'ex-pill-btn--secondary'} ex-pill-btn--xs`;
    });

    const shakeBtn = document.getElementById('set-shake-toggle');
    if (shakeBtn) {
      shakeBtn.className = `ex-pill-btn ${s.screenShake ? 'ex-pill-btn--primary' : 'ex-pill-btn--secondary'} ex-pill-btn--sm`;
      shakeBtn.textContent = s.screenShake ? 'Enabled' : 'Disabled';
    }

    const touchBtn = document.getElementById('set-touch-toggle');
    if (touchBtn) {
      touchBtn.className = `ex-pill-btn ${s.touchControls ? 'ex-pill-btn--primary' : 'ex-pill-btn--secondary'} ex-pill-btn--sm`;
      touchBtn.textContent = s.touchControls ? 'Visible' : 'Hidden';
    }

    const callsignInput = document.getElementById('set-callsign-input');
    if (callsignInput) {
      callsignInput.value = state.callsign || '';
    }
  }

  function launchLevel(levelId) {
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
  }

  function openPauseModal(isPaused) {
    const modal = document.getElementById('pause-modal');
    if (!modal) return;
    modal.classList.toggle('is-open', Boolean(isPaused));
  }

  function openVictoryModal(payload) {
    lastWinPayload = payload;
    const modal = document.getElementById('victory-modal');
    if (!modal) return;

    const state = window.ExoticStorage.getState();
    const titleEl = document.getElementById('vic-stage-title');
    const timeEl = document.getElementById('vic-time');
    const deathsEl = document.getElementById('vic-deaths');
    const rewardsEl = document.getElementById('vic-rewards');
    const callsignInput = document.getElementById('vic-callsign-input');
    const publishBtn = document.getElementById('vic-publish-btn');
    const nextBtn = document.getElementById('vic-next-btn');

    if (titleEl) titleEl.textContent = `Stage ${payload.level.code}: ${payload.level.title} Cleared`;
    if (timeEl) timeEl.textContent = formatTime(payload.timeMs);
    if (deathsEl) deathsEl.textContent = String(payload.deaths);
    if (rewardsEl) {
      rewardsEl.textContent = `+${payload.rewardSummary.earnedCoins} Coins · +${payload.rewardSummary.earnedSP} SP`;
    }
    if (callsignInput) {
      callsignInput.value = state.callsign || '';
    }
    if (publishBtn) {
      publishBtn.disabled = false;
      publishBtn.innerHTML = `${window.ExoticIcons.get('leaderboards')}<span>Publish Verified Run</span>`;
    }
    if (nextBtn) {
      const hasNext = payload.level.id < 8;
      nextBtn.style.display = hasNext ? 'inline-flex' : 'none';
    }

    modal.classList.add('is-open');
  }

  function closeModals() {
    document.querySelectorAll('.ex-modal-scrim').forEach((el) => el.classList.remove('is-open'));
  }

  function bindStaticEvents() {
    // Global Topbar buttons
    document.getElementById('topbar-back-btn')?.addEventListener('click', () => {
      window.ExoticAudio.click();
      window.ExoticRouter.navigate('menu');
    });

    document.getElementById('header-theme-btn')?.addEventListener('click', () => {
      window.ExoticAudio.click();
      const mode = window.ExoticTheme.toggle();
      window.ExoticStorage.updateSettings({ theme: mode });
      updateGlobalHeader();
      if (window.ExoticRouter.getCurrent() === 'settings') renderSettingsView();
    });

    document.getElementById('play-theme-btn')?.addEventListener('click', () => {
      window.ExoticAudio.click();
      const mode = window.ExoticTheme.toggle();
      window.ExoticStorage.updateSettings({ theme: mode });
      updateGlobalHeader();
    });

    document.getElementById('header-mute-btn')?.addEventListener('click', () => {
      const next = !window.ExoticAudio.isMuted();
      window.ExoticAudio.setMuted(next);
      window.ExoticStorage.updateSettings({ muted: next });
      if (!next) window.ExoticAudio.click();
      updateGlobalHeader();
      if (window.ExoticRouter.getCurrent() === 'settings') renderSettingsView();
    });

    // Main Menu Route Buttons
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

    // In-Game Play HUD Pill Buttons
    document.getElementById('play-emote-btn')?.addEventListener('click', () => {
      window.ExoticEngine.triggerEmote();
    });

    document.getElementById('play-retry-btn')?.addEventListener('click', () => {
      window.ExoticAudio.click();
      window.ExoticEngine.quickRetry();
    });

    document.getElementById('play-pause-btn')?.addEventListener('click', () => {
      window.ExoticAudio.click();
      const next = !window.ExoticEngine.isPaused();
      window.ExoticEngine.setPaused(next);
      openPauseModal(next);
    });

    // Touch controls bindings
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

    // Pause Modal Pill Buttons
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

    // Victory Modal Pill Buttons
    document.getElementById('vic-publish-btn')?.addEventListener('click', async () => {
      if (!lastWinPayload) return;
      const inputEl = document.getElementById('vic-callsign-input');
      const callsign = inputEl ? inputEl.value.trim() : '';
      if (!callsign) {
        showToast('Enter your Callsign first to publish your run.');
        inputEl?.focus();
        return;
      }
      const btn = document.getElementById('vic-publish-btn');
      if (btn) btn.disabled = true;

      const res = await window.ExoticStorage.submitRun({
        callsign,
        levelId: lastWinPayload.level.id,
        levelTitle: lastWinPayload.level.title,
        timeMs: lastWinPayload.timeMs,
        deaths: lastWinPayload.deaths,
        coins: lastWinPayload.coinsCollected
      });

      if (res.ok) {
        window.ExoticAudio.buy();
        showToast(`Verified run published under ${callsign}!`);
        if (btn) {
          btn.innerHTML = `${window.ExoticIcons.get('check')}<span>Published to Leaderboard</span>`;
        }
      } else {
        if (btn) btn.disabled = false;
        showToast(res.reason || 'Could not publish run.');
      }
    });

    document.getElementById('vic-next-btn')?.addEventListener('click', () => {
      window.ExoticAudio.click();
      if (lastWinPayload && lastWinPayload.level.id < 8) {
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

    // Settings Controls
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

    document.getElementById('set-save-callsign-btn')?.addEventListener('click', () => {
      window.ExoticAudio.click();
      const inputEl = document.getElementById('set-callsign-input');
      const val = inputEl ? inputEl.value.trim() : '';
      window.ExoticStorage.setCallsign(val);
      showToast(val ? `Callsign saved as "${val}".` : 'Callsign cleared.');
    });

    document.getElementById('set-reset-btn')?.addEventListener('click', async () => {
      window.ExoticAudio.click();
      await window.ExoticStorage.resetAllData();
      showToast('All progress and local records reset to zero.');
      updateGlobalHeader();
      renderSettingsView();
    });
  }

  window.ExoticViews = {
    init() {
      bindStaticEvents();

      window.ExoticStorage.subscribe(() => {
        updateGlobalHeader();
        if (window.ExoticRouter.getCurrent() === 'menu') {
          renderMenuSummary();
        }
      });

      window.ExoticRouter.onNavigate((route) => {
        updateGlobalHeader();
        if (route === 'menu') renderMenuSummary();
        else if (route === 'levels') renderLevelsView();
        else if (route === 'shop') renderShopView();
        else if (route === 'achievements') renderAchievementsView();
        else if (route === 'leaderboards') renderLeaderboardsView();
        else if (route === 'settings') renderSettingsView();
      });

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
    },
    openVictoryModal,
    openPauseModal,
    showToast,
    showRageQuip,
    launchLevel
  };
})();
