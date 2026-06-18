# Changelog

All notable changes to EarBud are documented in this file.

## 0.2.0 — 2026-06-17

The conversation-coaching prototype, feature-complete and deployable.

### Added

- One-mic speaker diarization via AssemblyAI streaming (Universal-3 Pro): the first speaker is labeled `Me` and other voices `Them`, with a turn-taking guess for short, unattributed replies and a Swap control if the labels are reversed.
- Online call mode: the microphone (`Me`) and shared tab/system audio (`Them`) are each streamed to AssemblyAI on their own connection with diarization disabled, since each stream carries one known speaker.
- OpenAI-powered conversation coach with per-session model choice (`gpt-5-mini` / `gpt-5-nano`) and a reasoning-effort (speed/quality) control.
- A persuasion/influence/rhetoric tactics library (`coachingPrinciples.js`) injected into the coach prompt; the model reports the tactic it used in a `lens` field.
- Strict JSON-schema structured output from the coach (phase, state, chime-in, suggestion, follow-up, lens).
- A deterministic local fallback coach and a safety backstop (`coachLogic.js`) for when the backend is unavailable or a request is coercive/deceptive.
- Optional browser-spoken suggestions with on/off, volume, rate, and frequency controls.
- A consent gate and privacy disclosure required before a session can start.
- Post-session local review, follow-ups, and accept/dismiss/evaluate/end/delete controls.
- An automated test suite (`npm test`, Node's built-in runner) covering coaching logic, the tactics library, and session/activation logic.
- Render deployment as a single web service via a `render.yaml` Blueprint, with a `/api/health` check; `server.js` reads `process.env.PORT` so the same server runs locally and on Render.

### Changed

- All live transcription now runs on AssemblyAI streaming (one-mic diarized, plus Online call mode's two per-source streams) instead of chunked batch transcription.
- The codeword acts as a toggle for active coaching rather than a per-request trigger.

### Removed

- Gemini-based transcription and the chunked audio-upload path (and the `multer` upload dependency).
- The Expo mobile prototype (phone implementation deferred).
- Unused local speaker-diarization model assets and their dependencies.

## 0.1.0 — Initial browser prototype

- Browser/desktop prototype with conversation-objective setup and a live coaching UI.
- Continuous browser speech recognition where supported, with a typed-transcript fallback for testing.
- Speaker-labeled transcript (`Me` / `Them`) sent to a Node/Express backend coaching route.
- Wake-word/codeword activation model for live suggestions and follow-ups.
- Initial documentation: README, product vision, architecture, conversation coaching, privacy and safety, roadmap, implementation phases, and contribution guide.
