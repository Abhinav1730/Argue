# Relay build and verification notes

## 18 October 2026 — single-project Vercel assignment mode

The user explicitly requested a working prototype with Next.js, API and WebSockets on one Vercel project and declined Redis or a separate backend host. No Redis integration had been implemented; dependency inspection confirms no `redis`, `ioredis` or `@upstash/redis` installed.

Implemented native `@vercel/functions` WebSocket upgrades at `/api/relay` with a 16 KiB payload cap, origin checks and a 300-second maximum duration. HTTPS clients create/join/renew/translate using correlated request/reply messages on their existing socket; existing authentication, room and translation contracts are reused without localhost HTTP calls. Local HTTP development remains compatible.

Verification: 45 tests passed in 14 files using `npm test -- --pool=threads --maxWorkers=1`; TypeScript, lint and production build passed. The built routes include `/api/relay`. A real two-client socket test covers creation, joining, authentication, translation, third-seat rejection and forged credentials. Browser-bridge tests cover connecting/open/closed states and listener cleanup. The secret scan reports a configured local key, ignored/untracked `.env` and no key in browser assets.

One read-only independent review found no Critical, Important or actionable Minor issues. Accepted/declined scope: cross-instance routing, in-memory room loss and function-duration expiry are intentional prototype limitations; provider capacity, TURN and actual Vercel runtime WebSocket availability require deployment testing. Mocked route tests establish adapter wiring, not deployed platform support. No external project, Redis resource or public deployment was created as part of this change. See README for exact Vercel credentials and settings.

The historical notes below describe the original local build.

User approved the written design and Native execution on 16 October 2026. Work is on `codex/relay` in the attached worktree; main, the remote and public hosting are unchanged.

## Independent review and fixes

One fresh read-only reviewer examined base `9c39205` through functional commit `2041686`. No Critical issues were found. Four Important findings were addressed in one fix pass, with failing regression cases observed before the changes:

| Finding | Fix | Regression evidence |
| --- | --- | --- |
| Resume request could evict an occupied seat while its old socket still received content | HTTP resume preserves socket ownership; delivery checks current connected membership; stale sockets cannot send authorized events | `tests/membership-regressions.test.ts`: occupied-seat resume sequence |
| Expired sockets left permanently connected seats | Centralized detachment records disconnection and broadcasts membership exactly once | `tests/membership-regressions.test.ts`: credential expiry, then 60-second replacement |
| Corrected speech remained queued or replayable | Playback carries source identity/revision, invalidates current/pending/history and rechecks eligibility | `tests/playback.test.ts`: corrected queue, replay and late delivery |
| Latest source / Correct last selected an older phrase | Shared latest-source selector uses event sequence; stage original resolves the displayed translation's exact source revision | `tests/latest-source.test.ts` |

An additional recovery check found a cached expired resume token could prevent a fresh join. The UI now removes that expired cached token so a subsequent explicit join can request a seat; there is no automatic inference retry.

Other RED→GREEN fixes during implementation cover normalized Next.js origins, recipient-side provider error delivery, replay while automatic speech is off, and leaving during delayed audio-context initialization.

No code-review Minor findings were deferred. Visual P3 differences are recorded in `design-qa.md`.

## Evidence and limits

- Final behavior suite: **40 tests passed across 12 files**. Lint, TypeScript and the production build exited successfully. An earlier worker-start timeout was resolved by bounding Vitest to two workers; the subsequent complete suite passed.
- Two browser clients joined one live room and exchanged Spanish source text. A third browser received “Room is full.” Leaving displayed the ended state and the partner saw the departure.
- The configured free OpenRouter endpoint returned `429 rate_limited` on synthetic text. No paid or privacy-policy fallback was enabled. Successful external translation and bilingual quality remain unverified.
- The browser automation cannot install a synthetic microphone initialization script. No real microphone access was requested. HTTP/WebSocket signaling, playback epochs, matching-language voice selection, recognition restart policy and resource cleanup were verified through controlled tests.
- Actual microphone accuracy, acoustic feedback, browser peer audio and cross-network latency require two-person testing with working provider capacity and secure network/ICE configuration.
- Secret scan: local key configured; `.env` untracked/ignored; key absent from browser assets.
- Final production build also passed after adding compact-height desktop styles. The additional 1280 × 720 visual capture could not finish: the in-app browser reported `ERR_NETWORK_IO_SUSPENDED` after the computer slept. Required desktop/narrow/mobile screenshots had already passed; this extra compact-height adjustment has build verification but still needs visual confirmation.
- npm's five development-tool audit findings through the Next ESLint dependency chain are described in README; no incompatible forced downgrade was made.

## Rulings and their costs

1. Use PowerShell ledger/brief equivalents instead of POSIX workflow scripts on Windows. This preserves the same progress record; its cost is manual bookkeeping.
2. Use direct HTTP fetch for the approved narrow OpenRouter adapter. This avoids introducing an unrelated gateway and preserves explicit routing limits; its cost is maintaining the provider API boundary.
3. Report live bilingual/device/network performance as unverified rather than infer it from fixtures. Its cost is a required real two-person validation session before reliability claims.
4. Complete visual acceptance locally using combined screenshots and responsive evidence. Exact generated glyph geometry remains accepted P3 approximation.
5. Keep deployment hardening outside this local alpha, as specified. Its cost is separate HTTPS/WSS, temporary TURN credentials, operational limits and deployment work before a public release.

## Local setup and architecture

See README for commands, configuration, Mermaid architecture/interruption flowcharts, browser/provider limitations and open-source model extension points. The preview is intended to remain running locally; no remote push, merge or deployment was performed.

