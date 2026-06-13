# Conversation Coaching

Conversation coaching is one of EarBud's main features.

The goal is to help a user communicate more clearly during an important conversation. The assistant listens for context, compares the conversation to the user's stated goal, and privately suggests useful next moves.

## Setup

Before the conversation, the user gives EarBud:

- Who they are talking to.
- What they want to accomplish.
- Any background context.
- The tone they want to maintain.
- Boundaries or topics to avoid.

Example:

> "I am about to talk to my professor. I want to ask for help understanding why I got a low grade, and I want to stay respectful."

## Coaching Modes

### Prep Mode

Before the conversation, EarBud helps the user prepare.

It can suggest:

- Opening lines
- Key points
- Possible objections
- Questions to ask
- A closing ask

### Live Mode

During the conversation, EarBud listens and provides short suggestions.

Examples:

- "Ask what timeline would work for them."
- "Acknowledge the concern before repeating your ask."
- "This is a good moment to close."
- "Ask for a specific next step."

### Review Mode

After the conversation, EarBud summarizes:

- What was discussed
- What was decided
- Open questions
- Follow-up tasks
- Suggested next message

## Conversation State

The agent should track the conversation as a changing state.

Possible states include:

- Opening
- Building context
- Making the ask
- Handling objections
- Clarifying details
- Closing
- Follow-up needed

## Suggestion Rules

Live suggestions should be:

- Short
- Actionable
- Respectful
- Aligned with the user's stated goal
- Easy to say out loud
- Timed only when useful

The assistant should avoid:

- Over-talking
- Manipulative tactics
- Deception
- Pressure against the other person's interests
- Suggesting false claims
- Recording or storing data without clear permission

## Example

User goal:

> "I want to convince my teammate to take ownership of the design handoff by Friday."

Conversation signal:

> Teammate says they are busy and not sure they can take it.

EarBud suggestion:

> "Ask what part feels hardest to take on, then offer to split the first step."

Possible user line:

> "What part of the handoff feels hardest to own by Friday? If it helps, I can set up the first draft and you can take final review."

## Ethical Boundary

EarBud should help users communicate honestly and effectively. It should not help users manipulate, deceive, coerce, or secretly exploit another person.

