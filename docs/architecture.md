# Architecture

This document outlines the local-first architecture for EarBud.

## High-Level System

EarBud can be thought of as five local prototype systems:

1. Local browser UI
2. Audio capture
3. Speech transcription
4. Conversation state and strategy engine
5. Suggestion display

## Components

### Local Browser App

The browser app is the control center for:

- Setting the conversation objective.
- Choosing the tone and wake word/codeword.
- Starting, pausing, and ending a session.
- Showing the transcript and latest suggestion.
- Reviewing follow-ups after the conversation.

The app should run at `localhost` during development.

### Audio Capture

Audio is captured from the computer microphone through the browser. In one-mic diarization mode, a single microphone stream is sent (as raw PCM16) to AssemblyAI streaming diarization for live words, timing, and the speaker split; the first speaker is `Me` and other voices `Them`. Short turns AssemblyAI cannot attribute are resolved by a turn-taking guess. In Online call mode, EarBud instead captures shared tab/window/system audio so the mic can be labeled `Me` and the shared audio `Them`.

The prototype should support clear user-controlled states:

- Off
- Session started
- Active coaching on
- Active coaching paused or stopped

### Speech-To-Text

Speech-to-text converts live audio into text for the coach.

The system should optimize for:

- Low latency
- Clear transcript chunks
- Browser speech recognition when available
- Source-separated transcription for online calls
- AssemblyAI streaming diarization for one-mic speaker detection
- Graceful fallback to typed transcript input

### Strategy Engine

The strategy engine decides whether the user needs advice.

Responsibilities include:

- Maintaining the active objective.
- Tracking the state of the conversation.
- Detecting objections, openings, power shifts, confusion, and closing moments.
- Deciding whether to chime in or stay silent.
- Generating short suggestions.
- Creating follow-ups only when there is a concrete next step.

The reasoning style should draw from negotiation, strategic positioning, human behavior, execution, and focus. It should avoid deceptive or coercive advice.

### Session State

The local session state stores temporary context.

Examples:

- Conversation partner
- User objective
- Desired tone
- Wake word/codeword
- Recent transcript
- Speaker labels for transcript lines: `Me` or `Them`
- Active coaching status
- Latest suggestion
- Follow-ups for review

The default should be temporary session memory, not durable storage.

### Suggestion Delivery

For the local prototype, suggestions are delivered through:

- A live suggestion panel
- Follow-up list
- Optional future text-to-speech

The default should be short and non-disruptive.

## Suggested Data Flow

1. User starts a local session and defines an objective.
2. Audio is captured through the browser or text is entered manually.
3. Transcript lines are added to the session with a speaker label.
4. The wake word/codeword toggles active coaching on.
5. While active, transcript chunks are sent to the coach for evaluation.
6. The coach either returns a short suggestion or chooses silence.
7. The UI shows the suggestion only when useful.
8. The wake word/codeword toggles active coaching off.
9. User reviews follow-ups and ends the session.

## Current Prototype Stack

- UI: vanilla HTML, CSS, and browser JavaScript.
- Server: local Node.js and Express.
- Transcription: browser speech recognition, AssemblyAI streaming (one-mic diarized, or Online call dual-stream), or typed transcript input.
- Speaker attribution: AssemblyAI streaming diarization (first speaker = `Me`) with a turn-taking guess for short unattributed turns in one-mic mode; per-stream `Me` / `Them` labels in Online call mode (each source on its own socket); user-selected `Me` / `Them` labels in manual mode.
- Coach backend: OpenAI API when `OPENAI_API_KEY` is configured (`gpt-5-mini` / `gpt-5-nano`, selectable per session), shaped by the tactics library in `coachingPrinciples.js`. A deterministic local fallback in `coachLogic.js` answers when the backend is unavailable.
- Transcription backend: AssemblyAI streaming (`/api/diarize-stream`). One-mic mode enables speaker labels; Online call mode opens one socket per source with `diarize=0` (no speaker labels) since each stream is a single known speaker.
- Storage: in-memory browser state for the active session; raw audio is never written to disk.

## Deployment

The architecture stays local-first by design, but the same Node server also deploys unchanged to a single Render web service (it serves both the API/WebSocket routes and the static frontend). `server.js` reads `process.env.PORT`, so it runs on `localhost:3000` locally and on Render's assigned port in the cloud; see [render.yaml](../render.yaml) and the README's "Deploy on Render" section. A public deployment is a single-user demo only — it has no authentication, so multi-user use would require auth and production consent flows first.

## Engineering Priorities

- Run locally by default.
- Keep activation and shutdown obvious.
- Make the agent decide when silence is better than advice.
- Keep suggestions short enough for live use.
- Minimize transcript storage.
- Keep the system easy to swap to another model provider later.
