# EXOTIC

**Exotic** is a pure monochrome (Light Mode & Dark Mode) 2D rage-bait troll platformer built from scratch using **HTML5, CSS3, Vanilla JavaScript, and the 2D Canvas API** with zero external frameworks.

## Highlights

- **Monochrome Light & Dark Architecture**: Pure neutral luminance hierarchy with zero gradients, zero borders, and zero outlines across UI and Canvas rendering.
- **Custom Shadcn-Style Pill Interface**: Every interactive control across Splash, Main Menu, Play HUD, Levels, Shop, Settings, Achievements, Leaderboards, and Credits uses a unified pill button system.
- **8 Rage-Bait Stages**: Jumping spikes, double-slam fakeout crushers, 99% offscreen sky door anvils, parting floors, Kaizo blocks, fake `"SAVE"` checkpoints, shy bait coins, dynamic lying wall signs, gravity inversion fields, waking buzzsaws, marching spike walls, and multi-juke exit doors.
- **Live Video Card Previews**: Every stage card and every Shop item card renders the actual live engine scene in motion.
- **Dual-Currency Armory & Shop**:
  - **16 Playable Characters** (Mickey Mouse, Kinetic Stickman, Syobon Troll Cat, Rubberhose Rabbit, Exotic Cube, Shadow Shinobi, Hollow Vanguard, Rattle Bones, Void Spaceman, CRT Broadcast, Jiggle Slime, and more)
  - **16 Cross-Compatible Skins** (*Coins*)
  - **Roblox-Inspired 3D Orbital Auras** — Sparkle, Bat Swarm, Butterfly, Seraph Feather, Void Rift, Sovereign Crown, Celestial Eclipse (*Coins*)
  - **Motion Trails & In-Game Emotes/Taunts** (*Coins*)
  - **Gameplay Upgrades** — Coyote Grace, Coin Magnet, Phantom Air-Hop, Phase Dash, Trap Instinct, Second Wind (*Skill Points*)
- **Zero Mock Data**: Leaderboards and Achievements start empty and record strictly real verified player runs.

## Running Locally

### Option 1 — Node Server (with file-persisted `/api/leaderboard`)
```bash
node server.js
```
Open `http://localhost:8080`.

### Option 2 — Static Hosting / GitHub Pages
Serve the root directory with any static web server (or GitHub Pages); run records automatically fall back to browser `localStorage`.

## Controls

| Action | Keys |
| --- | --- |
| Move | `A` / `D` or `Left` / `Right` Arrows |
| Jump | `Space`, `W`, or `Up` Arrow |
| Phase Dash *(Upgrade)* | `Shift` or `K` |
| Emote / Taunt | `E` |
| Quick Retry | `R` |
| Pause | `Esc` or `P` |
