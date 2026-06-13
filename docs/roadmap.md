# Roadmap

This roadmap is a starting point for building EarBud from concept to prototype. For a more detailed build sequence, see [Implementation Phases](implementation-phases.md).

## Phase 1: Product Foundation

- Define core user flows. Status: documented.
- Create product and technical documentation. Status: added.
- Decide initial platform. Status: browser prototype first, native iOS later for AirPods.
- Define privacy requirements. Status: documented.
- Design conversation coaching flow. Status: documented.
- Define the first code structure for the app, backend, and agent. Status: documented in implementation phases.

## Phase 2: Browser Prototype

- Build a desktop/browser demo. Status: complete.
- Add always-listening session mode. Status: complete.
- Add wake-word gated responses. Status: complete.
- Let users set a conversation goal. Status: complete.
- Show live suggestions in a basic UI. Status: complete.
- Add typed transcript fallback. Status: complete.

## Phase 3: Speech-To-Text Integration

- Add browser speech recognition. Status: complete for supported browsers.
- Add backend speech-to-text service. Status: complete with `/api/transcribe`.
- Add continuous audio chunk recording. Status: complete with `MediaRecorder`.
- Add backend readiness checks. Status: complete.
- Keep wake-word gating across all transcription modes. Status: complete.
- Document transcription setup. Status: complete.

## Phase 4: Agent Interaction Layer

- Add the first agent interaction loop. Status: `/api/coach` backend route added.
- Generate short coaching suggestions from transcript chunks. Status: OpenAI-backed backend agent added.
- Return structured phase, suggestion, and follow-up data. Status: added.
- Test with a live API key. Status: pending.
- Improve prompt handling and safety evaluation. Status: pending.

## Phase 5: Conversation Coaching MVP

- Add spoken suggestions.
- Add controls to accept, dismiss, or regenerate a suggestion.
- Add a cooldown so the agent does not interrupt too often.
- Generate a post-conversation summary.
- Turn agreed next steps into tasks.

## Phase 6: Earbud Experience

- Add support for AirPods or Bluetooth earbuds.
- Add private in-ear spoken suggestions.
- Add mute, pause, and stop controls.
- Improve latency.
- Test in realistic noisy environments.
- Show which audio input and output device is active.

## Phase 7: Task Assistant

- Add daily task setup.
- Add next-action recommendations.
- Add reminders and follow-ups.
- Add summaries after conversations.
- Add user-approved memory.

## Phase 8: Trust And Safety

- Add clear consent flows.
- Add data deletion controls.
- Add privacy settings.
- Add transcript review before saving.
- Add safety filters for manipulative or deceptive coaching.

## Open Questions

- Should the next prototype be mobile-first or desktop-first?
- Should live suggestions be spoken, visual, or both?
- How much memory should the assistant keep by default?
- What latency is acceptable for live coaching?
- How should EarBud handle multiple speakers?
- What is the best first user segment?

