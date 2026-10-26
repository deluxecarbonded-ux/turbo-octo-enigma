# Excord — community expansion release

## Access
Open Exotic → Main Menu → **Excord**. It uses the same registered game account. Guest access is blocked by the route guard, menu control, and API.

Existing players may need to sign out of Exotic and sign in once after this update. The **Verify game sign-in** button provides that path. A successful game signup/signin issues a separate random HTTP-only cookie for private community requests. There is no separate Excord account or password.

## Implemented
- Responsive server rail, channel navigation, conversation area and member list.
- Create servers (private-by-default), invite codes, public opt-in discovery, join/leave, and owner deletion.
- Text channels, owner-published announcements, owner-only private channels, forums and discussion threads.
- Friend requests, acceptance, removal and blocking.
- Private messages and group conversations between accepted friends.
- Persistent message history, 50-message pagination, replies, editing, deletion, five reaction types, 24-hour single-choice polls and pins.
- Escaped message rendering with basic bold, inline-code and spoiler formatting; no raw user markup execution.
- Full-history channel search and pins: returns up to 50 matches across stored history; supports `from:username`, `has:poll`, `pinned:true`, `before:YYYY-MM-DD`, and `after:YYYY-MM-DD`.
- Private saved messages with personal notes, an accessible-message list and removal. Saved items disappear from view if channel access is lost.
- Channel categories, positions, topic/name/privacy/slowmode editing, and confirmed deletion (the original server channel is retained).
- Owner thread archiving/unarchiving, enforced on posting.
- Owner-scheduled events, member RSVP toggles and event cancellation, with times displayed locally.
- Per-server nicknames and unread-badge muting.
- Invite rotation, ownership transfer to an existing member, kicks, ban list and unbanning.
- Group conversation renaming by its creator, departure with immediate history-access revocation, and creator handoff.
- Durable unread counts and read markers; typing indicators refreshed through authenticated HTTP.
- Copy-message control and additional escaped underline/italic/strikethrough/fenced-code formatting.
- Display name, bio, pronouns, presence preference and custom status.
- Owner settings, blocked-keyword AutoMod, mention limits, slowmode, bans, audit history.
- Existing Light/Dark and Colored/Monochrome controls; optional spatial card presentation.
- Authenticated HTTP refresh every six seconds while Excord is open. No global private-message broadcasts.

## Important limits — not Discord feature parity
- No working voice/video, screen sharing, file uploads, bots, developer APIs, webhook execution, subscriptions, boosts, external partnerships, mobile push, role hierarchies or per-role channel overrides.
- Owner-private channels are owner-only; there are no configurable role permissions in this release.
- Search returns at most 50 matches per query. Saved-message listing considers the most recent 100 saves and filters them by current channel access. There is no cross-server global search in this release.
- Presence is refreshed when an account uses Excord; it is not OS-level game/activity detection. The member sidebar is a snapshot at channel load.
- Messages are not end-to-end encrypted. Server/database operators can access stored data.
- Basic keyword rules and request quotas are not a complete anti-abuse, trust/safety or legal compliance system.
- Direct messages remain readable to existing participants after friendship removal/blocking, but blocked participants cannot send or create a bypass conversation.
- Voice and Stage scaffold channels are hidden from the released navigation; the API rejects their use.
- No actual Discord open-source library is installed. This release is original plain-JavaScript code, not Discord's source code or an official client.

## Security implementation
- API validates the signed-in, non-Guest game profile AND the verified Excord cookie on every operation.
- Cookies are HTTP-only, SameSite=Strict, and Secure on HTTPS deployment; only token hashes are stored.
- Signout revokes all Excord tokens for the profile; deleting the game account cascades Excord personal data and deletes owned servers.
- Membership/ownership is checked for every accessed message, channel or administrative object.
- Private data tables enable RLS and deny direct anon/authenticated table access; access occurs through the server gateway.
- Parameterized queries, JSON payload size limits and durable per-account read/write quotas.
- Reactions/votes use unique constraints; slowmode uses an atomic reservation to reject concurrent bypass.
- No payment, boosted counts or active call states are simulated.

The pre-existing game authentication system is still a custom account system. The separate Excord cookie strengthens chat access; it is not a full independent audit or redesign of every existing game endpoint.

## Migrations
1. `20261025000018_excord_platform.sql`: base community schema.
2. `20261026000019_excord_security.sql`: RLS, sessions, reaction/vote constraints, quotas, bans, atomic slowmode, deletion cleanup and accurate official hub copy.
3. `20261026000020_excord_community_features.sql`: private durable read markers, typing records and community query indexes.

Applied to the existing project. There are no seeded people or messages. Exotic Official is a real empty community structure; its member count is computed from actual registered memberships.

## Verification
- `node tests/excord-api.test.js`: real temporary registered/Guest accounts, ownership/membership checks, private chats, reactions/polls, blocking, AutoMod, bans, atomic slowmode, cookie binding and revoked sessions. Accounts are removed in cleanup.
- `NODE_PATH=./test-tools/node_modules node tests/excord-browser.test.js`: Playwright shared-account menu access, server creation, messages, markup safety, reactions, polls, desktop/mobile/theme screenshots, Guest menu/route restrictions. Requires Playwright installed locally.
- `node tests/excord-community.test.js`: saved-note privacy, revoked access, read markers, typing, categories, thread archive, events/RSVPs, invite rotation, kicks/unbans, ownership transfer, and group departure. Temporary history fixtures verify search can find a message beyond the latest 50-message page; the fixtures are removed with test-account cleanup.
- Browser tests additionally exercise saved-message notes/listing, event scheduling/RSVPs, and thread archive/unarchive.
- Database audit: RLS enabled and anonymous table reads denied on all 20 Excord tables.
- Syntax checks: all application JavaScript.

These tests cover the implemented release; they do not certify absent roadmap features or constitute a third-party security audit.

### Serverless connection reliability
Vercel queries use the Supavisor transaction pool on port 6543 when the configured pooler URL uses session port 5432. Local LISTEN behavior is unchanged. Pending connections reserve pool slots before asynchronous connection setup, preventing simultaneous cold-start queries from exceeding configured pool capacity. `node tests/pg-pool.test.js` verifies 12 concurrent calls stay within two connections.
