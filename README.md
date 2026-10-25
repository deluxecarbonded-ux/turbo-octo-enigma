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
- **Multi-Method Runner Authentication**: Dedicated **Sign Up** and **Sign In** routes with custom validation and user-selectable **Password**, **PIN**, **Fingerprint**, or **Face ID** authentication, persistent stage Coin & Skill Orb pickups, and bound account protection until deleted in Settings.
- **Zero Mock Data**: Leaderboards and Achievements start empty and record strictly real verified player runs.

## Running Locally & Supabase Realtime Cloud

Copy `.env.example` to `.env` with your Supabase connection details, push migrations via the Supabase CLI, and launch the zero-dependency Node server:

```bash
supabase db push --db-url "$SUPABASE_DB_URL"
node server.js
```
Open `http://localhost:8080`.

### Supabase Architecture (`supabase/`)
- **14 Realtime-Enabled PostgreSQL Tables** (`REPLICA IDENTITY FULL` + `supabase_realtime` publication + Row Level Security across every table):
  `shop_items`, `levels_catalog`, `achievements_catalog`, `global_telemetry`, `profiles`, `player_settings`, `player_loadouts`, `player_inventory`, `player_level_progress`, `player_achievements`, `leaderboard_runs`, `run_replays`, `live_presence_sessions`, and `realtime_activity_feed`.
- **4 Storage Buckets**: `runner-avatars`, `runner-cards`, `run-replays`, and `stage-snapshots` with `storage.objects` RLS policies.
- **6 Edge Functions**: `auth-username`, `sync-profile`, `shop-transaction`, `verify-and-submit-run`, `telemetry-ingest`, and `storage-upload-card`.

### Static Hosting / GitHub Pages
Serve the root directory with any static web server (or GitHub Pages); you can optionally supply your Supabase publishable key in **Settings** for direct browser WebSocket subscriptions, or run fully offline with `localStorage`.

## Controls

| Action | Keys |
| --- | --- |
| Move | `A` / `D` or `Left` / `Right` Arrows |
| Jump | `Space`, `W`, or `Up` Arrow |
| Phase Dash *(Upgrade)* | `Shift` or `K` |
| Emote / Taunt | `E` |
| Quick Retry | `R` |
| Full Screen | `F` |
| Pause | `Esc` or `P` |
