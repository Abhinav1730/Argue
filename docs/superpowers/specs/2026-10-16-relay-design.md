# Argue Relay design

Date: 16 October 2026
Status: Proposed for written review; the Relay visual direction is selected.

## Intended outcome

Two remote people who share no language can speak, interrupt, clarify a mistranslation, and change their minds. The application interprets their conversation without adding arguments, judging a winner, or imposing alternating turns.

The user selected the exact Relay image preserved in `docs/references/relay-selected.png`. The application stack is Next.js and TypeScript. Low-cost and open-model options should remain possible; a free model download does not imply free hosting or reliable realtime performance.

## First deliverable

A runnable Next.js application that faithfully recreates Relay and includes:

- An explicit demonstration mode that works without credentials or microphone access.
- Private, two-person remote audio rooms with an invitation link.
- Independent local microphone capture and original audio over WebRTC.
- Source captions, translated captions, optional translated speech, interruption handling, and replay.
- A configurable server-side text translation adapter for OpenRouter.
- Typed input when browser speech recognition is unavailable or a participant prefers typing.
- Clear unavailable, delayed, disconnected, and quota-exhausted states.

Browser speech recognition and browser speech synthesis are the initial low-infrastructure speech adapters. Their availability and language coverage are checked at runtime. The first live voice release targets supported desktop Chromium browsers and is described as an early implementation, without promising universal browser support or production-grade simultaneous interpretation.

The provider contract allows a later local model service using Whisper-based recognition, pair-specific translation models, and Kokoro. Installing large model weights, choosing GPU hardware, paid subscriptions, and public deployment are separate work.

## Visual target and layout

Preserve the selected reference's hierarchy and composition:

- Near-black opaque application surfaces, warm-white primary text, acid-lime highlights, thin muted borders, and restrained active-state glow.
- A top header with the Argue wordmark, room context, Relay identity, and current time.
- At approximately 1487 px viewport width, a speaker rail about 460 px wide and a main caption stage occupying the remaining width.
- Two stacked participant panels with name, speaking language, current speech state, waveform, source transcript, and optional transliteration when explicitly available.
- A large main translation with the emphasized clause in lime, followed by a wide waveform and the original utterance.
- A bottom toolbar with microphone, captions, leave, and replay controls.
- A quiet footer matching the reference's typographic treatment.

Use Anton for the main captions, Inter Tight for names and the wordmark, and IBM Plex Mono for secondary labels. Use Phosphor Icons for microphone, captions, lock, replay, and hang-up icons. Waveforms are drawn as signal visualizations rather than used as decorative raster assets. Use Relay consistently in the small identity labels, including the footer.

Use the actual Next.js runtime requested by the user. Do not substitute the Product Design Vite starter.

At narrower desktop widths, the rail shrinks and caption typography scales without covering controls. Below 768 px, participant panels sit above the caption stage and controls wrap or use a compact bottom arrangement. Support 320 px widths, visible keyboard focus, readable text, and reduced-motion preferences. Original text, language, and state must not depend on color alone.

## Architecture

The system has three boundaries:

1. **Next.js application:** responsive UI, room setup, settings, source and translation rendering, and server-side translation gateway.
2. **TypeScript room service:** ephemeral membership, short-lived participant credentials, WebSocket signaling, ordered conversation events, and reconnect recovery. This runs independently of request-scoped rendering.
3. **Browser media controllers:** WebRTC audio, microphone analysis, speech adapter, playback queues, and local interruption detection. High-frequency audio frames stay outside React state.

There is one recognition and translation lane per participant. Never mix both microphone tracks before transcription, and never feed generated interpretation audio back into recognition.

The first release does not need a database. Rooms expire after 24 hours, participant credentials after 15 minutes with renewal while connected, and disconnected participant slots are reserved for 60 seconds. Retain at most the latest 100 room events and at most 10 minutes of reconnect history, whichever is smaller. Saved recordings and durable transcript history are not enabled by default.

## Room journey

The initial screen presents the faithful Relay demonstration with an unmistakable Demo label. A local control allows entering the real room journey.

1. Create a room and choose a speaking language and listening language.
2. Inspect browser capabilities and test playback through an explicit user gesture.
3. Share an unguessable invitation link.
4. The second person chooses their languages and sees the disclosed processing providers.
5. Microphone capture starts only after the participant's explicit action and browser permission.
6. Both participants can speak concurrently. Each sees their own recognized speech and the other person's translated speech.
7. A participant can mute, hide captions, replay a selected recent translation, type a correction, or leave.
8. Leaving stops capture, recognition, synthesis, audio contexts, media tracks, and room subscriptions.

No provider key is required to explore the demonstration. Real translation remains visibly unavailable until a configured adapter can serve it; the application must not substitute scripted text in a live room. Initially expose English, Hindi, and Spanish as selectable languages; runtime recognition and voice checks still determine which capabilities are available on the participant's device.

## Translation contract

A translation request contains a stable source segment, its language, the recipient's selected language, a segment identifier and revision, and at most six recent source segments totaling at most 3000 characters. Limit each source segment to 1000 Unicode code points, each returned translation to 2000 code points, and model output to 512 tokens. The server derives room identity and participant authorization from credentials rather than trusting client-supplied identities.

Translation preserves names, numbers, negation, uncertainty, concessions, and first-person perspective. It does not invent the end of a sentence, add advice, soften or intensify an argument, or follow instructions embedded in the utterance. Translation has no external tools.

Provisional recognition can be shown immediately, but unstable prefixes must not be treated as permanent meaning. Only committed translation units are eligible for speech. Source stability and linguistic completeness are different: the adapter may wait when enough context is not yet available.

Use a pinned, configurable model and allowed provider set. Verify the current model catalog before selecting the default. Do not claim a model is the fastest or most accurate without measurements on the actual language pairs. Never fall back automatically to a paid model or a provider outside the configured privacy policy.

## Interruptions and delivery

Each listener has a separate playback controller. On local speech onset:

- Stop incoming generated speech promptly, without waiting for a server round trip.
- Increment the playback epoch and discard late audio belonging to older epochs.
- Continue both microphone capture and caption pipelines.
- Retain unheard translated text and make replay available.
- Avoid automatically accumulating and replaying a long queue after the interruption.

Track source events, translations, and playback separately. A generated or delivered translation is not necessarily played, and played audio is not evidence that the recipient understood it.

Replay uses only the recent translated text retained for that participant. If there is nothing to replay, show an empty state. Caption visibility does not affect transcription, translation, or room membership.

## Event and state boundaries

Events carry a room sequence, event ID, participant identity, segment ID, revision, and source timestamp. Translation events identify the source revision and recipient language. Playback events identify the translation and playback epoch.

Reducers must ignore duplicates and obsolete revisions. Participant reconnection resumes only bounded recent state and shows an explicit gap when recovery cannot be complete. Late events after leaving must not restart audio or modify a new room.

The UI distinguishes demonstration, connecting, ready, speaking, overlap, muted, reconnecting, unavailable, and ended states. There is no global speaker lock.

## Provider setup and limitations

Server credentials remain in environment configuration and are never placed in browser bundles or committed files. Include an example configuration and clear local setup instructions.

OpenRouter free-model rate limits are a real capacity constraint. Use a server-wide token bucket capped at 18 translation requests per minute, at most two concurrent translation requests, and at most two queued stable units per room. A translation request times out after five seconds. Do not automatically retry failed inference in the live path; show a recoverable error instead. Surface server-side quota exhaustion to the participant; free access is not presented as unlimited. These initial limits are configurable server settings and deliberately constrain the alpha experience.

WebRTC ICE servers are configurable. Test both peers locally; explain that real internet calls may require a TURN service and secure HTTPS/WSS hosting. Do not provision a third-party account or deploy publicly as part of the initial local build.

Unsupported recognition or synthesis languages remain unavailable, with typed input or captions as appropriate. Do not silently use a different spoken language.

## Privacy

Disclose processing before a live room starts, including that the browser's recognition engine may use a cloud service. Raw audio recording is disabled. Do not persist conversation content in operational logs. Room invitation tokens use at least 128 bits of cryptographic randomness; enforce the two-participant limit and validate incoming events. Reject WebSocket messages larger than 16 KiB. Participant credentials are short-lived and must be renewed rather than used indefinitely.

Transport encryption does not imply that the translation provider cannot read the supplied text. Explain this trust boundary accurately. Retained ephemeral room text is cleared when the room expires.

## Acceptance and verification

The visual acceptance reference is the selected image at its 1487 x 1058 aspect ratio. Compare a matching demonstration state, viewport, layout proportions, colors, typography, icons, waveforms, and controls. Also inspect 1024 px and 320 px layouts and reduced-motion behavior.

Functional acceptance requires:

- Demonstration runs without credentials, external inference, or microphone permission.
- Microphone, captions, replay, leave, and language controls have real local state changes.
- Two browser clients join one room, exchange signaling, and receive the correct participant's source and translated events; a third participant is rejected.
- Provider validation, quota errors, timeouts, and unavailable configuration are handled without replacing them with fake translations.
- Interruption stops the intended playback lane and rejects obsolete chunks while source events continue.
- Duplicate events, stale source revisions, reconnects, and leave cleanup do not corrupt the conversation.
- TypeScript, linting, production build, focused behavior tests, and browser interaction checks pass.

Use synthetic or scripted fixtures for automated media tests. Actual recognition quality, cross-language fidelity, and deployed network performance require bilingual testing and configured services, and are reported separately from passing integration tests.

## Explicit boundaries

This first build includes a usable interface and initial live-room path, not a claim of production reliability. It excludes automatic judging, emotional profiling, voice cloning, user accounts, payments, durable recordings, group calls, and deployment. Those features are not required to prove the two-person interaction.
