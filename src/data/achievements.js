(function () {
  const ACHIEVEMENTS = [
    {
      id: 'ach_first_betrayal',
      title: 'Welcome To Exotic',
      desc: 'Experience your very first unexpected death.',
      rewardCoins: 45,
      rewardSP: 1,
      progress(state) {
        return { current: Math.min(1, state.telemetry.totalDeaths), target: 1 };
      }
    },
    {
      id: 'ach_trap_magnet',
      title: 'Instinctive Bait',
      desc: 'Trigger 10 hidden troll mechanisms across runs.',
      rewardCoins: 60,
      rewardSP: 1,
      progress(state) {
        return { current: Math.min(10, state.telemetry.trapsTriggered), target: 10 };
      }
    },
    {
      id: 'ach_shy_door',
      title: 'Wait Come Back',
      desc: 'Watch an Exit Door run away or vanish in front of you.',
      rewardCoins: 50,
      rewardSP: 1,
      progress(state) {
        return { current: Math.min(1, state.telemetry.shyDoorsTriggered), target: 1 };
      }
    },
    {
      id: 'ach_first_clear',
      title: 'Outsmarted',
      desc: 'Clear any level for the first time.',
      rewardCoins: 75,
      rewardSP: 1,
      progress(state) {
        const cleared = Object.values(state.levelStats).filter((s) => s && s.cleared).length;
        return { current: Math.min(1, cleared), target: 1 };
      }
    },
    {
      id: 'ach_coin_hunter',
      title: 'Risky Pockets',
      desc: 'Collect 25 Coins inside levels.',
      rewardCoins: 85,
      rewardSP: 1,
      progress(state) {
        return { current: Math.min(25, state.telemetry.totalCoinsCollected), target: 25 };
      }
    },
    {
      id: 'ach_taunt_master',
      title: 'Maximum Disrespect',
      desc: 'Perform 5 Emotes or Taunts inside active levels.',
      rewardCoins: 65,
      rewardSP: 1,
      progress(state) {
        return { current: Math.min(5, state.telemetry.emotesUsedInStage), target: 5 };
      }
    },
    {
      id: 'ach_aura_owner',
      title: 'Presence Felt',
      desc: 'Unlock any Aura in the Shop.',
      rewardCoins: 55,
      rewardSP: 1,
      progress(state) {
        const count = state.ownedItems.filter((id) => id.startsWith('aura_') && id !== 'aura_none').length;
        return { current: Math.min(1, count), target: 1 };
      }
    },
    {
      id: 'ach_deathless',
      title: 'Memory Of Steel',
      desc: 'Clear any level from start to finish with 0 deaths.',
      rewardCoins: 120,
      rewardSP: 2,
      progress(state) {
        return { current: Math.min(1, state.telemetry.deathlessClears), target: 1 };
      }
    },
    {
      id: 'ach_halfway',
      title: 'Seasoned Skeptic',
      desc: 'Clear 4 distinct levels.',
      rewardCoins: 130,
      rewardSP: 2,
      progress(state) {
        const cleared = Object.values(state.levelStats).filter((s) => s && s.cleared).length;
        return { current: Math.min(4, cleared), target: 4 };
      }
    },
    {
      id: 'ach_all_clear',
      title: 'Pure Exotic',
      desc: 'Conquer all 8 handcrafted levels.',
      rewardCoins: 280,
      rewardSP: 4,
      progress(state) {
        const cleared = Object.values(state.levelStats).filter((s) => s && s.cleared).length;
        return { current: Math.min(8, cleared), target: 8 };
      }
    }
  ];

  window.ExoticAchievements = {
    ACHIEVEMENTS,
    evaluateAll() {
      const state = window.ExoticStorage.getState();
      const newlyUnlocked = [];
      for (const ach of ACHIEVEMENTS) {
        if (state.unlockedAchievements.includes(ach.id)) continue;
        const { current, target } = ach.progress(state);
        if (current >= target) {
          if (window.ExoticStorage.unlockAchievement(ach)) {
            newlyUnlocked.push(ach);
          }
        }
      }
      return newlyUnlocked;
    }
  };
})();
