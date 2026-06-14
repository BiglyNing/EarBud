# Roadmap

This roadmap reflects the pivot to a local-first conversation-objective coach. For a more detailed build sequence, see [Implementation Phases](implementation-phases.md).

## Phase 1: Product Foundation

- Define the focused conversation coaching flow. Status: documented.
- Set initial platform as local desktop/browser app. Status: documented.
- Define privacy requirements. Status: documented.
- Define strategic coaching lenses. Status: documented.
- Define wake word/codeword activation model. Status: documented.

## Phase 2: Browser Prototype

- Build a desktop/browser demo. Status: complete.
- Let users set a conversation objective. Status: complete.
- Show live suggestions in a basic UI. Status: complete.
- Add typed transcript fallback. Status: complete.
- Add browser speech recognition. Status: complete for supported browsers.

## Phase 3: Activation Behavior

- Use the codeword as an active coaching toggle. Status: complete.
- Keep listening after the wake word/codeword is spoken. Status: complete.
- Let the coach chime in when advice is useful. Status: complete in basic cooldown form.
- Turn active coaching off when the codeword is spoken again. Status: complete.
- Show active coaching state clearly in the UI. Status: complete.

## Phase 4: Strategy Coach

- Update the backend prompt for objective-completion coaching. Status: complete.
- Add strategic lenses for negotiation, positioning, human behavior, execution, and focus. Status: complete.
- Return structured state, suggestion, and follow-up data. Status: complete.
- Add a cooldown to prevent too many interruptions. Status: complete.
- Improve safety evaluation for coercive or deceptive advice. Status: complete in basic local form.

## Phase 5: Conversation Coaching MVP

- Add controls to accept, dismiss, or regenerate a suggestion. Status: complete.
- Track conversation state across the session. Status: complete.
- Generate a post-conversation review. Status: complete in local summary form.
- Turn agreed next steps into follow-ups. Status: complete.
- Add local deletion controls. Status: complete.

## Phase 6: Optional Spoken Suggestions

- Add browser text-to-speech for suggestions.
- Add voice controls.
- Add interruption rules.
- Test whether spoken guidance helps or distracts during real conversations.

## Phase 7: Trust And Safety

- Add clear consent flows.
- Add visible listening and active coaching indicators.
- Add data deletion controls.
- Add transcript review before saving anything.
- Add safety filters for manipulative or deceptive coaching.

## Open Questions

- How often should EarBud evaluate the transcript while active coaching is on?
- Should suggestions appear visually, be spoken aloud, or both?
- What cooldown prevents distraction without missing important openings?
- How should EarBud handle multiple speakers in the transcript?
- What is the best first user segment?
- Should the default model provider be OpenAI, Gemini, or configurable?
