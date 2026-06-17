# Implementation Phases

This document describes the path from the current local prototype to a focused EarBud conversation-objective coach.

## Phase 0: Codebase Setup

Goal: maintain a simple local development foundation.

Steps:

- Keep the first platform as a desktop/browser app running on `localhost`.
- Keep the backend as a local Node/Express server.
- Define shared data models for sessions, objectives, transcripts, suggestions, and follow-ups.
- Add basic environment configuration for local development.
- Keep a simple local development workflow.

Deliverable:

- A working local app shell and backend shell with health checks.

Current status:

- Local browser app and Node backend exist.
- Static UI is served by Express.
- Backend health checks are available at `/api/health`.

## Phase 1: Product And UX Design

Goal: define how the user starts, activates, and ends a coaching session.

Steps:

- Design the local app screens:
  - Conversation setup
  - Live coaching session
  - Session review
  - Privacy and listening controls
- Define listening states:
  - Off
  - Session started
  - Active coaching on
  - Active coaching stopped
- Define a wake word/codeword toggle that turns active coaching on and off.
- Write the first strategic coaching prompt structure.
- Make the UI clearly show whether coaching is active.

Deliverable:

- A coded interface that shows the full local user flow without requiring production audio infrastructure.

Current status:

- Conversation setup, live suggestion, transcript, and review UI exist.
- The codeword now toggles active coaching on and off.

## Phase 2: Audio Capture Prototype

Goal: capture continuous browser audio after the user starts a session.

Steps:

- Request microphone permissions.
- Add local always-listening recording after session start.
- Add a wake word/codeword toggle for active coaching.
- Add start, pause, and stop controls.
- Stream or chunk audio locally.
- Display recording and coaching state clearly in the UI.
- Avoid saving raw audio by default.

Deliverable:

- The app can capture user speech and pass transcript chunks to the next layer.

Current status:

- Browser prototype added with continuous speech recognition where supported.
- Typed transcript fallback added for testing.
- Codeword behavior uses an active coaching toggle.

## Phase 3: Speech-To-Text Integration

Goal: convert live audio into text the coach can reason about.

Steps:

- Use browser speech recognition as the default local path.
- Show transcript lines in the live session screen.
- Track transcript timestamps.
- Add error handling for dropped audio, network failures, and unclear speech.
- Store temporary transcript chunks for the active session only.

Deliverable:

- The local app can listen during a session and produce a near-real-time transcript.

Current status:

- Browser speech recognition is available as the lowest-friction transcription path.
- Typed transcript input is available as a fallback.
- Transcript lines support user-selected speaker labels for `Me` and `Them`.
- Automatic call mode labels microphone audio as `Me` and shared tab/window/system audio as `Them`.
- Online call mode streams the mic and shared audio to AssemblyAI on separate non-diarized connections (`/api/diarize-stream?diarize=0`), labeling each by source.
- One-mic speaker diarization is available through AssemblyAI streaming at `/api/diarize-stream`.
- AssemblyAI returns speaker labels mapped to `Me` (first speaker) and `Them`, with short turns resolved by a turn-taking guess.

## Phase 4: Strategy Coach Interaction Layer

Goal: let the user set an objective and have the coach evaluate live context.

Steps:

- Send the user's objective, relevant context, and recent transcript chunks to the local backend.
- Build the active coaching loop:
  - Read the current objective.
  - Read recent transcript context.
  - Identify the conversation state.
  - Decide whether advice is needed.
  - Return either a short suggestion or silence.
- Add suggestion types:
  - Opening frame
  - Clarifying question
  - Objection response
  - Reframe
  - Closing ask
  - Follow-up reminder
- Add strategy lenses:
  - Strategic awareness
  - Positioning
  - Negotiation
  - Human nature
  - Execution
  - Focus
- Add guardrails against deceptive, coercive, or unsafe coaching.

Deliverable:

- The user can set an objective and receive live suggestions based on the conversation transcript while active coaching is on.

Current status:

- Node backend route exists at `/api/coach`.
- The coach runs on the OpenAI API when `OPENAI_API_KEY` is configured. All live transcription runs on AssemblyAI streaming (one-mic diarized, plus Online call mode's two per-source streams).
- The user picks the coach model per session: `gpt-5-nano` (default, cheapest) or `gpt-5-mini` (sharper). The allowlist lives in `server.js` and the picker is in the setup UI.
- The coach prompt injects a persuasion/influence/rhetoric tactics library (`coachingPrinciples.js`) so suggestions are shaped by named sources (48 Laws of Power, The Art of War, Never Split the Difference, Influence, and more) and report which one in the `lens` field.
- The backend requests strict JSON-schema structured output, returning phase, state, chime-in, suggestion, follow-up, and lens fields.
- The frontend sends transcript context while active coaching is on.
- The frontend sends speaker-labeled transcript context so the coach can distinguish the user from the other speaker.
- A local fallback coach (`coachLogic.js`) answers when the backend is unavailable, and a backstop safety screen redirects obvious coercive or deceptive requests.

## Phase 5: Conversation Coaching MVP

Goal: make the live coaching experience useful in realistic conversations.

Steps:

- Add a compact live coaching screen.
- Show only the most recent useful suggestion.
- Add controls to accept, dismiss, or regenerate a suggestion.
- Add a cooldown so the coach does not interrupt too often.
- Track whether the conversation is opening, exploring, handling objections, reframing, closing, reached, or blocked.
- Generate a post-conversation review.
- Turn agreed next steps into follow-ups.

Deliverable:

- A working local MVP where a user can prepare for a conversation, activate coaching, receive guidance, and review follow-ups.

Current status:

- Accept, dismiss, evaluate, pause, end, and delete controls are available.
- The UI tracks conversation state and the last user action.
- Ending a session generates a local review.
- Accepted suggestions can become follow-ups.
- Local session data can be deleted from the UI.

## Phase 6: Spoken Feedback

Goal: move from visual-only suggestions to optional local spoken guidance.

Steps:

- Add browser text-to-speech for assistant suggestions.
- Keep spoken suggestions short enough to understand during a live conversation.
- Add voice settings:
  - Spoken suggestions on or off
  - Volume
  - Speaking rate
  - Suggestion frequency
- Add interruption rules so EarBud does not speak over important moments.

Deliverable:

- EarBud can optionally speak short suggestions through the user's current audio output device.

Current status:

- Browser speech synthesis can speak suggestions locally when enabled.
- Voice controls include on/off, volume, speaking rate, and suggestion frequency.
- A test button and stop-voice control are available.
- EarBud only speaks model chime-ins, not every status message.
- Speech stops on pause, end, and delete.

## Phase 7: Privacy, Safety, And Local Hardening

Goal: make local use clear, controlled, and safer.

Steps:

- Add clear consent and recording disclosures.
- Add a visible active coaching indicator.
- Add a fast stop control.
- Avoid storing raw audio by default.
- Redact sensitive transcript content from logs.
- Add deletion controls for local session data.
- Add automated tests for session lifecycle, activation toggling, and safety rules.
- Run real-world testing in quiet, noisy, indoor, and outdoor environments.

Deliverable:

- A local prototype with clear listening controls, ethical coaching boundaries, and reliable session behavior.

Current status:

- A consent gate blocks starting a session until the user confirms they have the right/consent to record, with a privacy disclosure explaining that audio is never saved to disk and transcript text is sent only to the configured AI providers.
- Active listening/coaching state is shown in the UI (device pill, phase chip, session status), and pause/end/delete give fast control over the session.
- Raw audio is never written to disk (in-memory only), and local session data can be deleted from the UI.
- Server logs are kept clean of conversation content: errors log messages only, and no transcript/goal text is logged.
- An automated test suite runs with `npm test` (Node's built-in runner, no extra dependencies), covering:
  - coaching logic in `coachLogic.js` (speaker labels, safety guardrail, local fallback coach, model JSON parsing),
  - the tactics library in `coachingPrinciples.js` (tag selection, ranking, data integrity),
  - session/activation logic in `sessionLogic.js` (wake word normalization, codeword detection, speaker normalization).
- Pure, testable logic was extracted into `coachLogic.js` and `sessionLogic.js` so it can be verified without booting the server or a browser.
- Remaining before this phase is fully closed: structured real-world testing across quiet/noisy/indoor/outdoor environments. Nothing is persisted server-side, so "transcript review before saving" is not applicable in the local prototype.

What is left after the local prototype: deploy to a real server and build a production frontend (the two items intentionally out of scope here).

## Full Local MVP Milestone

EarBud reaches the local MVP milestone when a user can:

- Open the app locally in a browser.
- Start a conversation coaching session.
- Tell the coach who they are talking to and what outcome they want.
- Say the wake word/codeword to activate coaching.
- Have the app listen with clear indicators.
- Receive short strategic suggestions only when useful.
- Say the codeword again or click stop to turn active coaching off.
- Review follow-ups.
- Delete local session data.
