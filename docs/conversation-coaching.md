# Conversation Coaching

Conversation coaching is EarBud's central feature.

The goal is to help a user complete a specific conversation objective. The assistant listens after activation, compares the conversation to the user's objective, and privately suggests useful next moves.

## Setup

Before the conversation, the user gives EarBud:

- Who they are talking to.
- What they want to accomplish.
- Any background context.
- The tone they want to maintain.
- Boundaries or topics to avoid.
- The wake word/codeword that turns active coaching on and off.

During the conversation, transcript lines are labeled as:

- `Me`: the EarBud user.
- `Them`: the conversation partner or other person.

One-mic mode uses AssemblyAI streaming diarization for live words, timing, and the speaker split; the first speaker is `Me` and other voices are `Them` (with short unattributed turns resolved by a turn-taking guess). Automatic call mode labels the microphone as `Me` and shared tab/window/system audio as `Them`. Manual mode uses user-selected labels. The coach uses those labels to decide what the user should say or do next.

Example:

> "I am about to talk to my professor. I want to ask for help understanding why I got a low grade, and I want to stay respectful."

## Coaching Model

### Prep

Before the conversation, EarBud can help frame the objective.

It can suggest:

- The main ask
- The strongest opening frame
- Likely objections
- Evidence or context to bring up
- A fallback position
- A clear closing question

### Active Coaching

The user says the wake word/codeword to activate coaching. After that, EarBud listens to the full conversation and can chime in whenever advice is likely to help. It does not require the wake word before every suggestion.

Examples:

- "Ask what timeline would work for them."
- "Label the concern before repeating your ask."
- "This is a good moment to close."
- "Do not defend yet. Ask what feels risky to them."
- "Reframe this around the business cost of waiting."

The user says the codeword again, clicks stop, or ends the session to turn active coaching off.

### Review

After the conversation, EarBud can summarize:

- Whether the objective was reached
- What was agreed
- What remains unresolved
- Follow-up actions
- Suggested next message

## Strategy Lenses

EarBud should reason through several lenses:

- Strategic awareness: incentives, leverage, status, and hidden dynamics.
- Positioning: timing, terrain, and whether to press, pause, or redirect.
- Negotiation: tactical empathy, labels, mirrors, calibrated questions, and concrete asks.
- Human nature: emotional signals, ego protection, defensiveness, trust, and motive.
- Execution: turning agreement into a small next action.
- Focus: keeping the conversation from drifting away from the objective.

The output should be original, practical coaching. It should not quote or reproduce source texts.

## Conversation State

The agent should track the conversation as a changing state.

Possible states include:

- Opening
- Building context
- Testing alignment
- Making the ask
- Handling objections
- Reframing
- Clarifying terms
- Closing
- Follow-up needed
- Objective reached
- Objective blocked

## Chime-In Rules

EarBud should speak up when:

- The user is drifting away from the objective.
- The other person gives an objection or hesitation.
- There is a clear chance to ask for commitment.
- The user should slow down, listen, or ask a clarifying question.
- A small tactical shift would improve the user's position.

EarBud should stay silent when:

- The conversation is already moving well.
- Advice would interrupt an important emotional moment.
- The transcript is too unclear.
- The user has not activated coaching.
- The best move is to listen.

## Suggestion Rules

Live suggestions should be:

- Short
- Actionable
- Respectful
- Aligned with the user's stated objective
- Directed at what the user should say or do, not what the other person should do
- Easy to say out loud
- Timed only when useful

The assistant should avoid:

- Deception
- Coercion
- Harassment
- Manipulative pressure
- False claims
- Secretly extracting private information
- Advice that ignores the other person's autonomy

## Example

User objective:

> "I want to convince my teammate to take ownership of the design handoff by Friday."

Conversation signal:

> Teammate says they are busy and not sure they can take it.

EarBud suggestion:

> "Ask what part feels hardest to take on, then offer to split the first step."

Possible user line:

> "What part of the handoff feels hardest to own by Friday? If it helps, I can set up the first draft and you can take final review."

## Ethical Boundary

EarBud should help users communicate strategically and honestly. It should not help users manipulate, deceive, coerce, or exploit another person.
