# Excord — first working release

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
- Bounded recent-message search and pin search: most recent 50 channel messages only.
- Display name, bio, pronouns, presence preference and custom status.
- Owner settings, blocked-keyword AutoMod, mention limits, slowmode, bans, audit history.
- Existing Light/Dark and Colored/Monochrome controls; optional spatial card presentation.
- Authenticated HTTP refresh every six seconds while Excord is open. No global private-message broadcasts.

## Important limits — not Discord feature parity
- No working voice/video, screen sharing, file uploads, bots, developer APIs, webhook execution, subscriptions, boosts, external partnerships, mobile push, events UI, role hierarchies or per-role channel overrides.
- Owner-private channels are owner-only; there are no configurable role permissions in this release.
- Search and pins are bounded to recent history, not a full historical index.
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

Applied to the existing project. There are no seeded people or messages. Exotic Official is a real empty community structure; its member count is computed from actual registered memberships.

## Verification
- `node tests/excord-api.test.js`: real temporary registered/Guest accounts, ownership/membership checks, private chats, reactions/polls, blocking, AutoMod, bans, atomic slowmode, cookie binding and revoked sessions. Accounts are removed in cleanup.
- `NODE_PATH=./test-tools/node_modules node tests/excord-browser.test.js`: Playwright shared-account menu access, server creation, messages, markup safety, reactions, polls, desktop/mobile/theme screenshots, Guest menu/route restrictions. Requires Playwright installed locally.
- Database audit: RLS enabled and anonymous table reads denied on all 18 Excord tables.
- Syntax checks: all application JavaScript.

These tests cover the implemented release; they do not certify absent roadmap features or constitute a third-party security audit.
