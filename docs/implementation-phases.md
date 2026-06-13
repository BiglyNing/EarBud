# Implementation Phases

This document describes the path from initial code design to a fully working EarBud assistant that can listen through AirPods or other earbuds and interact with the user through an AI agent.

## Phase 0: Codebase Setup

Goal: create the technical foundation for the project.

Steps:

- Choose the first platform: iOS is the strongest starting point for AirPods integration.
- Create the app project and backend project.
- Define shared data models for users, sessions, goals, transcripts, suggestions, and tasks.
- Add basic environment configuration for local development.
- Add linting, formatting, and test setup.
- Create a simple local development workflow.

Deliverable:

- A working app shell and backend shell with basic health checks.

## Phase 1: Product And UX Design

Goal: define how the user starts, controls, and ends an assistant session.

Steps:

- Design the main app screens:
  - Home
  - Daily goals
  - Conversation setup
  - Live coaching session
  - Session summary
  - Privacy settings
- Define the listening states:
  - Off
  - Push-to-talk
  - Active task session
  - Active conversation coaching session
- Design controls for start, pause, mute, stop, and delete.
- Define visual and audio indicators for when EarBud is listening.
- Write the first conversation coaching prompt structure.

Deliverable:

- A clickable or coded interface that shows the full user flow without real audio processing.

## Phase 2: Audio Capture Prototype

Goal: capture continuous browser audio after the user starts a session, then prepare for phone and earbud input later.

Steps:

- Request microphone permissions.
- Add always-listening recording after session start.
- Add a wake word so the agent only responds when asked.
- Add start and stop controls for an active session.
- Stream or chunk audio locally.
- Display recording state clearly in the UI.
- Save temporary local test audio only when needed for debugging.
- Add a deletion path for any captured audio.

Deliverable:

- The app can capture user speech and pass audio chunks to the next layer.

Current status:

- Browser prototype added with continuous speech recognition where supported.
- Wake-word gated agent responses added.
- Typed transcript fallback added for testing.
- Native mobile microphone capture is postponed.

## Phase 3: Speech-To-Text Integration

Goal: convert live audio into text the agent can reason about.

Steps:

- Connect the audio pipeline to a streaming speech-to-text service.
- Show partial transcripts in the live session screen.
- Track transcript timestamps.
- Add error handling for dropped audio, network failures, and unclear speech.
- Add basic speaker labeling if the provider supports it.
- Store temporary transcript chunks for the active session.

Deliverable:

- The app can listen during a session and produce a near-real-time transcript.

## Phase 4: Agent Interaction Layer

Goal: let the user set a goal and have the agent respond to live context.

Steps:

- Create a conversation goal setup form.
- Send the user's goal, relevant context, and transcript chunks to the agent backend.
- Build the first agent loop:
  - Read the current goal.
  - Read recent transcript context.
  - Identify the conversation state.
  - Decide whether a suggestion is needed.
  - Return a short suggestion.
- Add suggestion types:
  - Opening line
  - Clarifying question
  - Objection response
  - Closing ask
  - Follow-up reminder
- Add guardrails so the agent refuses manipulative, deceptive, or unsafe coaching.

Deliverable:

- The user can set a goal and receive live text suggestions based on the conversation transcript.

Current status:

- Node backend agent route added at `/api/coach`.
- The backend uses the OpenAI Responses API when `OPENAI_API_KEY` is configured.
- The browser client sends recent transcript context only when the wake word is detected.

## Phase 5: Conversation Coaching MVP

Goal: make the live coaching experience useful in realistic conversations.

Steps:

- Add a compact live coaching screen.
- Show only the most recent useful suggestion.
- Add controls to accept, dismiss, or regenerate a suggestion.
- Add a cooldown so the agent does not interrupt too often.
- Track whether the conversation is opening, exploring, handling objections, or closing.
- Generate a post-conversation summary.
- Turn agreed next steps into tasks.

Deliverable:

- A working MVP where a user can prepare for a conversation, receive live guidance, and review follow-ups afterward.

## Phase 6: AirPods And Bluetooth Earbud Integration

Goal: route audio input and assistant output through AirPods or another connected Bluetooth device.

Steps:

- Detect connected Bluetooth audio devices.
- Use the mobile platform audio session APIs to prefer headset microphone input when available.
- Route assistant audio output to the connected earbuds.
- Handle device changes, such as AirPods connecting, disconnecting, or switching microphones.
- Test with:
  - AirPods
  - AirPods Pro
  - Wired earbuds
  - Phone microphone fallback
- Add UI that shows the active input and output device.
- Add a quick fallback when earbud audio quality is too low.

Deliverable:

- The app can use AirPods or supported earbuds for user speech input and private assistant output.

Recommended path:

- Keep the browser prototype focused on the agent loop first.
- Add mobile or native iOS only after the backend agent and wake-word flow are stable.
- Use native audio session APIs to prefer headset microphone input and route assistant speech to connected earbuds.

## Phase 7: Spoken Assistant Feedback

Goal: move from visual-only suggestions to private in-ear guidance.

Steps:

- Add text-to-speech for assistant suggestions.
- Keep spoken suggestions short enough to understand during a live conversation.
- Add voice settings:
  - Spoken suggestions on or off
  - Volume
  - Speaking rate
  - Suggestion frequency
- Add a subtle sound or haptic cue before suggestions if useful.
- Add interruption rules so EarBud does not speak over important moments.

Deliverable:

- EarBud can privately speak short suggestions into the user's earbuds.

## Phase 8: Daily Task Assistant

Goal: expand beyond conversations into day-long task support.

Steps:

- Let the user enter daily priorities.
- Convert goals into next actions.
- Let the agent recommend what to do next.
- Add reminders for follow-ups captured from conversations.
- Add check-ins when tasks are delayed or completed.
- Add a daily review summary.

Deliverable:

- EarBud helps the user move through the day, not only through individual conversations.

## Phase 9: Memory And Personalization

Goal: remember user-approved context that improves future guidance.

Steps:

- Add user-approved memory for preferences, recurring goals, important contacts, and communication style.
- Separate temporary session context from long-term memory.
- Let the user inspect, edit, and delete saved memory.
- Use memory to personalize suggestions.
- Avoid saving sensitive conversation details without explicit approval.

Deliverable:

- The assistant becomes more helpful over time while keeping the user in control.

## Phase 10: Privacy, Safety, And Production Readiness

Goal: prepare the product for real-world use.

Steps:

- Add clear consent and recording disclosures.
- Add region-aware reminders for audio recording laws.
- Add account deletion and data export.
- Encrypt sensitive data in transit and at rest.
- Redact sensitive transcript content from logs.
- Add monitoring for latency, transcription failures, and agent failures.
- Add automated tests for session lifecycle, data deletion, and safety rules.
- Run real-world testing in quiet, noisy, indoor, and outdoor environments.

Deliverable:

- A production-ready version with privacy controls, safety boundaries, reliable audio behavior, and usable live agent interaction.

## Full Implementation Milestone

EarBud reaches full implementation when a user can:

- Connect AirPods or another supported earbud device.
- Start a conversation coaching session.
- Tell the agent who they are talking to and what outcome they want.
- Have the app listen with clear consent and recording controls.
- Receive short private suggestions through the earbuds.
- End the session at any time.
- Review a summary and next steps.
- Choose what to save, edit, or delete.
- Use saved tasks and preferences to guide the rest of their day.
