# EarBud

EarBud is a local-first conversation coaching app.

Before a conversation, you tell EarBud who you are talking to and what objective you want to accomplish. During the conversation, EarBud listens to the transcript, watches for moments that matter, and gives short tactical advice to help you move toward that objective.

The current direction is a desktop/browser prototype that runs locally.

## What It Does

EarBud is designed to help you:

- Prepare for a specific conversation with a clear objective.
- Track whether the conversation is moving toward or away from that objective.
- Notice openings, objections, leverage points, confusion, and closing moments.
- Get short suggestions for what to say or ask next.
- Stay strategic without becoming deceptive, coercive, or manipulative.

## Strategy Lens

EarBud's advice should be influenced by practical ideas from strategy, negotiation, human behavior, and execution. Examples of useful lenses include:

- `48 Laws of Power`: strategic awareness, incentives, status, leverage, and hidden dynamics.
- `The Art of War`: positioning, timing, terrain, and knowing when not to engage.
- `Never Split the Difference`: calibrated questions, tactical empathy, labels, mirrors, and clear asks.
- `The Laws of Human Nature`: motives, emotional signals, blind spots, and social patterns.
- `Atomic Habits`: small next actions, friction, cues, and follow-through.
- `Deep Work`: attention, clarity, and protecting the objective from distraction.

These are reasoning influences, not scripts to quote. EarBud should translate them into honest, situational guidance that a user can use in real conversation.

## Core Use Case

Before a conversation, the user gives EarBud:

- The person or people involved.
- The objective they want to accomplish.
- Any relevant context.
- The tone they want to maintain.
- Any boundaries or topics to avoid.

Example:

> "I am about to talk to Jordan. I want to ask for an extension on the project deadline without sounding unprepared."

EarBud then listens locally through the browser session. Once the user says the configured wake word, EarBud enters active coaching mode and continues monitoring the conversation. It can chime in whenever it has useful advice. It turns off only when the codeword is said again or the user ends the session.

## Example Flow

1. The user sets an objective:
   "I am going into a meeting with my manager. I want approval to hire a contractor."

2. EarBud creates a strategic frame:
   - What outcome matters most?
   - What resistance is likely?
   - What evidence or framing improves the ask?
   - What would count as a good fallback?

3. The user says the wake word to activate coaching.

4. EarBud listens to the conversation and watches for:
   - Agreement
   - Hesitation
   - Objections
   - Power dynamics
   - Misalignment
   - Opportunity to close

5. EarBud suggests a next move:
   "Label the budget concern first, then ask what approval threshold would make this workable."

6. The user says the codeword again to stop active coaching.

## Product Principles

- Local-first prototype.
- Objective-driven, not general-purpose.
- User-controlled listening state.
- Useful in the moment.
- Strategic but ethical.
- Human-controlled, never autonomous in conversations.
- Short suggestions instead of distracting monologues.

## Current Prototype

This repo includes a browser-based prototype and a Node backend agent:

- Conversation objective setup.
- Browser speech recognition when supported by the browser.
- Typed transcript fallback for testing.
- Backend coaching suggestions.
- Codeword toggled active coaching.
- Accept, dismiss, evaluate, end, and delete controls.
- Local post-session review.
- Session follow-ups and review state.

After the codeword is spoken, EarBud continues listening and evaluates the conversation for useful advice until the codeword is spoken again.

## Run Locally

Install dependencies:

```powershell
npm install
```

Create a `.env` file using [.env.example](.env.example), then set `OPENAI_API_KEY`.

Run it with:

```powershell
npm start
```

Open:

```text
http://localhost:3000
```

The app is intended to run locally on your machine. Do not expose the local server publicly unless you have added proper authentication, consent flows, and production security controls.

## Important Privacy Note

EarBud is built around sensitive live conversation audio. Any real use should handle:

- Consent from people being recorded or transcribed where required.
- Local laws around audio recording.
- Clear recording indicators.
- User control over what is stored.
- Secure handling of transcripts and summaries.
- Easy deletion of personal data.

See [Privacy and Safety](docs/privacy-and-safety.md) for the intended safety model.

## Documentation

- [Product Vision](docs/product.md)
- [Architecture](docs/architecture.md)
- [Conversation Coaching](docs/conversation-coaching.md)
- [Implementation Phases](docs/implementation-phases.md)
- [Speech-To-Text](docs/speech-to-text.md)
- [Privacy and Safety](docs/privacy-and-safety.md)
- [Roadmap](docs/roadmap.md)
- [Contributing](CONTRIBUTING.md)
- [Changelog](CHANGELOG.md)

## Project Status

EarBud is an early local prototype focused on objective-driven conversation coaching.
