# Excord — feature inventory and staged delivery plan

Planning baseline: October 26, 2026. Selected approach: inventory first; existing Vercel + Supabase hosting only.

## Product contract
- Independent Discord-style community product named Excord, not an official Discord client and not connected to Discord accounts or networks.
- Same registered Exotic account and account deletion lifecycle; no separate signup.
- Main Menu entry; Guest access denied in both UI and every backend operation.
- Preserve HTML/CSS/JavaScript/Canvas stack, theme and color modes, optional spatial presentation, pill controls, and existing game behavior.
- No fake people, fake messages, fake membership/boost counts, fake calls, or placeholder controls presented as working.
- Feature parity is an acceptance matrix, not a promise that Discord's proprietary backend can be installed from its open-source page.

## Current implementation status — first working messaging release

See `EXCORD_RELEASE.md` for the exact supported features, limitations and security tests. The shared-account Main Menu entry, registered-only access, separate verified cookie, community messaging interface and core server/friend/DM operations are implemented. This is not full Discord parity. Voice/video, uploads, advanced roles, payments and external integrations remain unimplemented.

The original preliminary renderer helpers have been removed; no Discord library names are represented as installed dependencies. The backend was replaced with a smaller authenticated gateway, per-object checks and no global chat broadcasts. Migration 000019 hardens access to the initial 000018 schema and removes artificial boost counts.

## Feature-family inventory
This is an initial planning inventory, NOT an independently verified exhaustive list of every historical rollout, experiment, regional variation, removed feature, or mobile/desktop implementation detail. Each row needs detailed acceptance tests before implementation.

| Family | Scope | Proposed phase / dependency |
|---|---|---|
| Shared identity | Game session, registered-only access, logout/revocation, deletion cascades | 1 |
| Profiles | Display name, avatar, bio, pronouns, status, notes, per-server identity, privacy | 2 |
| Relationships | Friend requests, accept/remove, blocking, DM permissions, spam controls | 2 |
| Servers | Create/delete, ownership transfer, invites, membership, folders, discovery | 2–3 |
| Channels | Categories, text, announcements, voice, stage, forums, media, reorder/pin | 2–4 |
| Authorization | Roles, hierarchy, per-channel overrides, private channels, moderation actions | 1–3; prerequisite for private data |
| Text messaging | History/pagination, edit/delete, replies, mentions, formatting, spoiler, code, silent sends | 2 |
| Message extras | Reactions, custom emoji, stickers, polls, pins, forwarding, saved messages, search | 3 |
| Files/media | Upload/download, file validation, quotas, previews, audio notes, image/video playback | 3; private Storage policies |
| October 2026 additions | Folder/channel move actions, formatted Markdown attachment previews, improved media layouts | 3; verify against official changelog |
| Large uploads | Discord's October 2026 Nitro 1GB limit is a reference, not an Excord default | Separate capacity/cost decision; never proxy large files through Vercel functions |
| Notifications | Read markers, unread/mention counts, channel mute, inbox, browser notifications | 3; email/mobile push requires additional setup |
| Community | Rules, onboarding, announcement following, scheduled events, RSVP, discovery moderation | 4 |
| Trust/safety | Reports, bans/kicks/timeouts, audit logs, slowmode, AutoMod, anti-spam, appeals | 1–4; ongoing operations required |
| Voice | Join/leave, mute/deafen, device selection, speaking indicators, noise processing | 5 feasibility gate |
| Video | Camera, screen sharing, stream selection, permissions, call recovery | 5 feasibility gate |
| Stage | Speakers/audience, raise hand, moderator promotion and removal | After reliable voice |
| Soundboard/activities | Shared sounds, activity sessions, integrated game invitations | After secure room transport; licensed assets only |
| Apps/developers | Bot identity, scoped API credentials, slash commands, webhooks, OAuth consent, rate limits | 6; independent Excord ecosystem |
| Monetization | Subscriptions, boosts, gifting, entitlements, cosmetics, refunds | Deferred; no fake purchases or entitlements |
| External programs | Quests, Shop partnerships, third-party perks and linked accounts | Requires partner agreements and explicit authorization |
| Age/privacy | Consent, retention, export/delete, age-restricted spaces, abuse reporting | Policy and legal review; do not collect IDs casually |
| Native clients | Desktop overlay, native mobile, console integration, OS capture features | Outside current browser-only stack |
| Historical features | Removed/renamed features and experiments | Separate archival inventory; do not reintroduce without approval |

## Existing-hosting architecture
- Vercel: static client and short HTTP API requests. Do not rely on function-local memory, long-lived sockets, or SSE for reliable cross-instance delivery.
- Supabase Postgres: durable messages, memberships, explicit server-checked permissions, indexes, transactional writes, and retention.
- Supabase Realtime: authorized private subscriptions or database change delivery with applicable RLS. No global broadcast of private messages or signaling.
- Supabase Storage: private buckets, upload constraints, signed URLs and access checks; direct uploads rather than base64 payloads in messages.
- Shared authentication: audit the game's custom session design and harden it before exposing private communications. A client-provided username or profile ID is never authentication.
- Existing hosting does not supply a production TURN relay or SFU. Direct browser WebRTC can be evaluated experimentally, but it cannot guarantee NAT traversal or scalable group calls. Do not label production voice/video complete until that dependency is resolved.

## Release gates
1. Security foundation: session/revocation review, schema/RLS, membership and role checks, no Guest access, data deletion tests, payload limits, rate limiting.
2. Functional messaging: two real test accounts exchange private and server messages; third account cannot read, modify, react, vote, bookmark, or subscribe to unauthorized content.
3. Complete interactions: persistence/reload, reconnect/pagination, attachments, threads, search, blocked-user behavior, unread counts, keyboard/mobile usability.
4. Administration/community: owner-only changes, role escalation denial, invitation rules, bans/timeouts, AutoMod, reports, audit visibility.
5. Media decision: document limitations on existing hosting; prototype only after explicit agreement. No simulated connected participants.
6. Production deployment: reviewed migration, regression tests for Exotic, cross-account security tests, both production domains verified, published supported/unsupported feature list.

## Acceptance examples
- Guest clicking/opening Excord, crafting an API request, or subscribing directly is denied.
- Account A sends a DM to B; C cannot fetch it by guessed message/channel ID.
- A blocked user cannot bypass blocking through new DM creation or group invitations.
- Member cannot modify another server by passing its role/channel/event ID.
- Webhook secrets are visible only to authorized managers and are revocable.
- Concurrent reactions/votes do not overwrite one another; expired polls reject votes.
- Rendering arbitrary user text or file names cannot execute script or inject markup.
- Deleting an account clears its personal Excord data; server ownership transfer/deletion semantics are explicit.
- Light/dark, Colored/Monochrome and optional spatial modes work without changing game defaults.

## Sources and library policy
- https://discord.com/open-source — individual open-source projects, not a complete application. Examples: Access, SortedSet, Lilliput, Manifold, Erlpack, SimpleAST. Their runtimes differ; evaluate licensing and compatibility individually rather than copying names onto custom code.
- https://discord.com/blog/discord-update-october-22-2026 — October changes including organization actions, Markdown previews, media presentation and Nitro upload/perk changes.
- https://discord.com/blog/discord-patch-notes-october-6-2026 — engineering/reliability reference.
- https://discord.com/blog/safer-for-teens-same-discord-for-adults — current age-assurance and teen safety reference; not a ready-made Excord policy.

Next work: extend the implemented release using itemized specifications and acceptance tests for each remaining feature family. Paid services, paid partnerships, additional hosting and native applications are not authorized by this plan.
