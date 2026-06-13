# Roadmap

This roadmap is a starting point for building EarBud from concept to prototype. For a more detailed build sequence, see [Implementation Phases](implementation-phases.md).

## Phase 1: Product Foundation

- Define core user flows. Status: documented.
- Create product and technical documentation. Status: added.
- Decide initial platform. Status: iOS recommended for AirPods-first development.
- Define privacy requirements. Status: documented.
- Design conversation coaching flow. Status: documented.
- Define the first code structure for the app, backend, and agent. Status: documented in implementation phases.

## Phase 2: Prototype

- Build a desktop/browser demo. Status: browser prototype added.
- Add always-listening session mode. Status: added with browser speech recognition where supported.
- Add wake-word gated responses. Status: added with configurable wake word.
- Add streaming transcription. Status: partial browser transcription path added.
- Let users set a conversation goal. Status: added.
- Generate short coaching suggestions from transcript chunks. Status: OpenAI-backed backend agent added.
- Show live suggestions in a basic UI. Status: added.
- Add the first agent interaction loop. Status: `/api/coach` backend route added.

## Phase 3: Earbud Experience

- Add support for AirPods or Bluetooth earbuds.
- Add spoken suggestions.
- Add mute, pause, and stop controls.
- Improve latency.
- Test in realistic noisy environments.
- Show which audio input and output device is active.

## Phase 4: Task Assistant

- Add daily task setup.
- Add next-action recommendations.
- Add reminders and follow-ups.
- Add summaries after conversations.
- Add user-approved memory.

## Phase 5: Trust And Safety

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
