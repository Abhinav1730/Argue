# Argue Relay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the selected Relay interface and an initial working two-person audio interpretation app with a credential-free demo.

**Architecture:** Next.js renders the interface and proxies authenticated API requests to one long-lived TypeScript room service. The room service owns ephemeral membership, WebSocket signaling, event history, and the translation limiter; its translation gateway calls OpenRouter with a server-only key. Browser controllers own separate audio tracks, recognition, and cancellable synthesis; React receives conversational state rather than individual audio frames.

**Tech Stack:** Next.js 16.4.2, React 19.3.1, TypeScript, Phosphor React 2.1.10, ws 8.22.0, jose 6.2.12, Zod, tsx, Vitest 5.0.5, browser WebRTC/SpeechRecognition/speechSynthesis, and Silero VAD through @ricky0123/vad-web 0.0.31. Resolve other dependencies from the registry during installation and commit the lockfile. Node 24.14.1 is available locally.

**Spec:** `docs/superpowers/specs/2026-10-16-relay-design.md`

## Global Constraints

- Next.js and TypeScript; preserve `docs/references/relay-selected.png` as the visual target.
- English, Hindi, and Spanish initially; never silently substitute an unsupported language.
- Use Anton, Inter Tight, IBM Plex Mono, and Phosphor icons. Use Relay consistently in small identity labels.
- Demo requires neither microphone permission nor inference credentials; live mode never substitutes scripted translations.
- Rooms expire after 24 hours; participant credentials expire after 15 minutes; disconnected slots are reserved for 60 seconds.
- History retains at most 100 events and at most 10 minutes, whichever is smaller.
- Source limit: 1000 Unicode code points; translated output: 2000 code points; context: six segments / 3000 characters; model output: 512 tokens.
- Server-wide translation capacity: 18 requests/minute, two concurrent requests, two queued stable units per room, five-second timeout, no automatic inference retries.
- Invitations contain at least 128 bits of cryptographic randomness; rooms permit two participants; WebSocket payload limit is 16 KiB.
- Credentials are server-only environment variables. No raw audio recording or conversation content in operational logs.
- Interrupt generated speech locally; continue source captions and capture; reject outdated playback epochs and segment revisions.
- Verify 1487 × 1058, 1024 px, 320 px, keyboard focus, and reduced motion. No public deployment or third-party account provisioning.

## Review Focus

1. A delayed translation arrives after a source correction: only the current source revision may update captions or speech (Task 1 and Task 3).
2. A participant leaves and joins another room while old async work finishes: old events cannot mutate the new room or restart audio (Task 4).
3. A refreshed invitation or reconnect attempts to take a third seat: membership and reconnect credentials must preserve the two-person limit (Task 2).
4. Provider output contains malformed JSON, wrong-language metadata, or oversized text: show an explicit translation failure without speaking it (Task 3).
5. Recognition repeatedly ends or the requested synthesis voice is missing: avoid restart storms and foreign-language playback; keep typed input and captions usable (Task 4).

## File Map

- `package.json`, `tsconfig.json`, `eslint.config.mjs`, `vitest.config.ts`, `.env.example`, `.gitignore`: reproducible tooling and safe configuration.
- `src/shared/protocol.ts`, `src/shared/conversation.ts`: schemas, language definitions, event reducer, state boundaries.
- `server/config.ts`, `server/auth.ts`, `server/rooms.ts`, `server/index.ts`: long-lived room service and authenticated transports.
- `server/translation.ts`, `server/translation-limiter.ts`: provider contract, OpenRouter implementation, bounded capacity.
- `src/app/api/[...path]/route.ts`: allowlisted Next.js proxy to the room service; no arbitrary upstream URL.
- `scripts/dev.ts`, `scripts/start.ts`, `scripts/copy-vad-assets.ts`: cross-platform lifecycle and same-origin VAD assets.
- `src/media/rtc.ts`, `src/media/recognition.ts`, `src/media/playback.ts`, `src/media/vad.ts`: disposable browser controllers.
- `src/hooks/use-room.ts`, `src/hooks/use-demo.ts`: room lifecycle and explicit scripted demo.
- `src/components/relay-app.tsx`, `room-setup.tsx`, `speaker-card.tsx`, `translation-stage.tsx`, `waveform.tsx`, `call-controls.tsx`: focused UI units under `src/components/`.
- `src/app/layout.tsx`, `page.tsx`, `globals.css`: font loading, entry point, responsive design tokens.
- `tests/*.test.ts`: behavior tests with synthetic media and provider fixtures.
- `README.md`, `docs/design-qa.md`: setup, architecture flowchart, limitations, verification evidence.

### Task 1: Runnable demo and conversation contracts

**Files:** Create project tooling, `src/shared/protocol.ts`, `src/shared/conversation.ts`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `src/hooks/use-demo.ts`, `tests/conversation.test.ts`.

**Interfaces:**
- Produces `Language = 'en' | 'hi' | 'es'`, `Participant`, `SourceSegment`, `Translation`, `RoomEvent`, `ConversationState`, and Zod request/event schemas.
- Events use `id`, `seq`, `participantId`, `segmentId`, `revision`, `sourceTimestamp`, and `createdAt`; translations additionally identify `recipientId`, `targetLanguage`, and `sourceRevision`.
- Produces `reduceRoomEvent(state: ConversationState, event: RoomEvent): ConversationState` and `useDemo(): DemoController` (state, muted, captionsVisible, replay, leave, reset).

- [ ] Scaffold the requested Next.js stack manually, add dev/build/start/lint/typecheck/test scripts, and retain the ignored local `.env`. Create `.env.example` containing placeholders only.
- [ ] Write `conversation.test.ts`: duplicate event IDs do not append; revision 2 replaces revision 1; a translation for revision 1 after source revision 2 is ignored; a room sequence gap sets `historyIncomplete`.
- [ ] Run `npm test -- tests/conversation.test.ts`; confirm failures refer to missing behavior rather than broken tooling.
- [ ] Implement schemas and reducer, including language enums, Unicode source limits, recipient filtering, and bounded client history. Add an explicit Demo controller with deterministic reference captions and independent control states.
- [ ] Run the test and `npm run typecheck`; require both to pass. Commit the runnable demo shell and contracts without credentials.

### Task 2: Private room service and signaling

**Files:** Create `server/config.ts`, `auth.ts`, `rooms.ts`, `index.ts`, `src/app/api/[...path]/route.ts`, `scripts/dev.ts`, `scripts/start.ts`, `tests/rooms.test.ts`, `tests/transport.test.ts`.

**Interfaces:**
- Consumes Task 1 schemas and `RoomEvent`.
- Produces `RoomStore.create(profile: ParticipantProfile): JoinResult`, `join(invite: string, profile: ParticipantProfile, resumeToken?: string): JoinResult`, `renew(token: string): Promise<JoinResult>`, `disconnect(participantId: string): void`, `append(event: NewRoomEvent): RoomEvent`, and `history(roomId: string, afterSeq: number): HistoryResult`.
- `JoinResult` contains `roomId`, invitation URL data, participant token, reconnect token, credential expiry, participant list, and WebSocket URL. `HistoryResult` contains `events`, `latestSeq`, and `historyIncomplete`.
- API: `POST /api/rooms`, `POST /api/rooms/join`, `POST /api/rooms/renew`, `POST /api/translate`; authenticated WS messages include `resume`, `signal`, `source`, `playback`, and `leave`. Membership identity is derived from the token.

- [ ] Write room tests using an injectable clock: third seat rejected; reconnect credential restores only its reserved seat; reservation expires at 60 seconds; room expires at 24 hours; JWT rejected at 15 minutes; history expires at 10 minutes and caps at 100 events.
- [ ] Run these tests and confirm expected failures.
- [ ] Implement cryptographically random invitations, jose-signed participant credentials, separate reconnect secrets, renewal, rate-limited joins, event sequencing, expiry cleanup, and a shared-secret internal HTTP boundary.
- [ ] Implement WebSocket authentication as the first message, a short authentication deadline, strict message schemas, 16 KiB maximum payload, recipient-scoped signaling/events, socket replacement on reconnect, and no conversation payload logging.
- [ ] Implement the allowlisted Next.js API proxy. Launch both services with a shared randomly generated process secret when none is configured, loading `.env` on the server; shut down both children on exit. Use hidden Windows child processes.
- [ ] Add integration tests with two real WebSocket clients: authenticate, exchange offer/answer/ICE and source events, reject forged identities and third join, reconnect with sequence recovery, reject oversized messages. Run focused tests and typecheck; commit.

### Task 3: Bounded server-side translation

**Files:** Create `server/translation.ts`, `server/translation-limiter.ts`, `tests/translation.test.ts`, `tests/translation-limiter.test.ts`; modify room service and `.env.example`.

**Interfaces:**
- Consumes source/event schemas and authorized room membership from Task 2.
- Produces `TranslationAdapter.translate(input: TranslationInput, signal: AbortSignal): Promise<TranslationResult>` and `TranslationScheduler.submit(roomId: string, work: (signal: AbortSignal) => Promise<TranslationResult>): Promise<TranslationResult>`.
- `TranslationInput` includes source text/language, recipient language, segment/revision, and bounded recent source context. `TranslationResult` is `{ status: 'translated', text: string } | { status: 'needs_context' }`.
- Structured errors are `unavailable`, `rate_limited`, `queue_full`, `timeout`, `provider_error`, and `invalid_output`; expose safe messages, never keys or provider response bodies.

- [ ] Write tests: missing key returns unavailable; source 1001 code points rejected; context over six segments or 3000 characters rejected; output over 2000 code points rejected; malformed/wrong-language responses rejected; negation/names/numbers remain literal in the request data; stale completion is not published.
- [ ] Write fake-clock scheduler tests: request 19 within a minute is refused, concurrent work never exceeds two, a room's third queued unit is refused, timeout aborts after 5000 ms, rejected inference is not retried. Run and confirm failures.
- [ ] Verify the current OpenRouter catalog and provider endpoint policy before pinning `OPENROUTER_MODEL` and `OPENROUTER_ALLOWED_PROVIDERS`. Use a verified `:free` model only; explicit provider allowlist, no paid routing fallback, no privacy-policy bypass. Fail configuration visibly if no suitable endpoint is available.
- [ ] Implement structured translation prompting with source content treated as data, explicit preservation of uncertainty/concessions/negation, no external tools, `max_tokens: 512`, temperature zero where supported, and `needs_context` support.
- [ ] Implement the shared scheduler and translation publication only when the stored source revision still matches. Derive recipient and source identity from room membership. Publish generated and delivered states separately from playback acknowledgments.
- [ ] Run provider-fixture and scheduler tests, typecheck, and a credential-redacted configuration check. Do not claim language accuracy from mocked tests; commit.

### Task 4: Independent browser media and interruption

**Files:** Create `src/media/rtc.ts`, `recognition.ts`, `playback.ts`, `vad.ts`, `src/hooks/use-room.ts`, `scripts/copy-vad-assets.ts`, `tests/playback.test.ts`, `tests/room-lifecycle.test.ts`, `tests/recognition.test.ts`.

**Interfaces:**
- `RtcController.start(stream: MediaStream): Promise<void>`, `handleSignal(signal: RtcSignal): Promise<void>`, `setMuted(muted: boolean): void`, `dispose(): void`; emits signaling and attaches only the remote original audio track.
- `RecognitionController.start(language: Language): void`, `stop(): void`, `dispose(): void`; emits provisional/stable source revisions and capability/errors.
- `PlaybackController.enqueue(translation: Translation): void`, `interrupt(): void`, `replay(): void`, `dispose(): void`; tracks epoch and generated/delivered/played separately.
- `VadController.start(stream: MediaStream, onSpeechStart: () => void): Promise<void>`, `dispose(): Promise<void>`; consumes the existing local microphone stream.
- `useRoom(): RoomController` exposes create/join, startAudio, sendTyped, mute, captions, interpretation, replay, leave, status, state, capabilities, and error.

- [ ] Write fake-synthesis tests: interruption cancels immediately and increments epoch; old completion cannot mark new speech played; only committed/current revisions speak; missing matching voice leaves captions available; bounded queue does not auto-drain unheard interruptions.
- [ ] Write lifecycle tests: leave stops every track/socket/controller; late recognition/provider/renewal results cannot mutate a later room; recognition end/error loops use bounded restart with backoff, and permission denial never triggers repeated prompts. Run and confirm failures.
- [ ] Implement peer negotiation with collision-safe polite/impolite roles, trickle ICE, configurable ICE servers, connection status, and distinct original-audio versus interpretation controls. Capture only on explicit user action.
- [ ] Implement browser recognition with runtime capability detection, supported language settings, interim captions, stable final revisions, typed corrections, and explicit cloud-processing disclosure. Never append synthetic speech as source.
- [ ] Implement Silero local VAD with same-origin packaged ONNX/worklet assets and reduced-frame React updates. Speech onset stops the listener's generated audio locally; continue recognition/source events. If VAD fails, show degraded interruption support and allow manual cancellation; do not silently promise reliable detection.
- [ ] Implement voice selection only for the selected language, user-gesture playback unlocking, epoch cancellation, recent-text replay restricted to 30 seconds, renewal, reconnect sequence recovery, and cleanup. Recommend headphones and default original remote audio to muted while interpretation is on to reduce acoustic feedback; explain that physical echo isolation remains a live-test limitation.
- [ ] Run focused tests and typecheck; commit.

### Task 5: Faithful Relay interface and complete room journey

**Files:** Create the components listed in the file map; modify app layout/styles/page and hooks; add `tests/room-journey.test.ts`.

**Interfaces:**
- UI consumes `DemoController | RoomController` and shared participant/conversation models. `RelayApp` selects explicit demo or live state; no demo data enters a live room.
- `Waveform({ active, analyser?, seed, reducedMotion })` draws deterministic demo or measured live amplitudes on canvas without per-frame React state.
- `RoomSetup` collects name, source/listening languages, processing consent, invitation, and capability status before live capture.

- [ ] Implement desktop composition at 1487 × 1058: approximately 460 px rail, stacked participant cards, large cream/lime caption stage, long waveform, original text, circular toolbar, and restrained footer. Load the specified fonts using Next font support.
- [ ] Implement responsive layouts down to 320 px, readable long translations, non-Latin text, accessible control names, visible focus, and reduced-motion rendering. Use Phosphor icons and real canvas signal visualization.
- [ ] Wire mic, captions, interpretation, replay, leave, demo reset, create/join, language settings, copy invitation, and typed correction. Display connecting, ready, speaking, overlap, muted, reconnecting, unavailable, and ended states without turn locking.
- [ ] Add flow tests: no media request in demo; live missing-provider error retains source captions; caption toggle does not stop capture; leave returns an ended view; setup consent is required before live capture. Confirm failing behavior first, implement, and rerun.
- [ ] Run lint, typecheck, focused tests, and build. Commit the complete interface.

### Task 6: Integration verification, design QA, and local handoff

**Files:** Create `README.md`, `docs/design-qa.md`, `docs/qa/` screenshots; update plan checkboxes and `.env.example` as implementation decisions settle.

**Interfaces:** Consumes all prior tasks. Produces a documented local app and recorded evidence rather than new runtime contracts.

- [ ] Document `npm install`, `npm run dev`, `npm run build`, `npm start`, configured ports, server-only environment variables, OpenRouter constraints, ICE/TURN/HTTPS requirements, browser limitations, ephemeral retention, processing providers, and local open-model extension points.
- [ ] Include Mermaid architecture and interruption flowcharts. Distinguish tested integration behavior from unmeasured bilingual accuracy and real internet latency. Explain local `.env` is ignored and not automatically copied to another worktree.
- [ ] Read Product Design design-QA instructions. Start the actual app, inspect the same demo state at 1487 × 1058, compare with the saved selected image, record screenshots and findings, and fix visual P0/P1/P2 issues until the required QA result passes. Inspect 1024 px, 320 px, focus navigation, reduced motion, long Hindi/Spanish captions, and all controls.
- [ ] Verify two browser contexts join a real room and exchange synthetic source/translation/signaling fixtures; verify a third is rejected. Exercise actual configured translation only with synthetic short text and report its result without exposing credentials. Do not claim real microphone or cross-network quality from fixtures.
- [ ] Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`; require successful exits. Perform one fresh whole-branch review using the required execution skill's reviewer workflow, fix material findings, and repeat only affected checks.
- [ ] Commit code/docs with `.env` still ignored, keep the local preview running, open the app in Codex, and hand off its clickable URL with concise verified behavior and remaining service limitations. Do not push, merge, or deploy unless requested.

## Self-review

Spec coverage checked across visual layout (Tasks 1/5/6), room/privacy/event boundaries (Tasks 1/2), provider behavior and quotas (Task 3), local media/interruption/delivery (Task 4), and full flow verification (Tasks 5/6). Each Review Focus item has a named owning test. Shared interfaces use the same names across tasks. This is one integrated initial release; work proceeds in order because transport, media, and UI share the event contracts.

Execution is pending user review of this plan and selection of Native or Subagent-driven implementation.
