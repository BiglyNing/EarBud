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
- Use persuasion, influence, and rhetoric to advance your objective while staying truthful — no fabricated facts and no coercion.

## Strategy Library

EarBud's advice is shaped by a library of condensed persuasion, influence, and rhetoric tactics drawn from well-known sources, defined in [coachingPrinciples.js](coachingPrinciples.js). Each tactic is one line, tagged by situation (power, negotiation, conflict, persuasion, rhetoric, rapport, reading people, status). Sources include:

- `48 Laws of Power`, `The Prince`, `The Art of War`, `33 Strategies of War` — power, positioning, timing, leverage.
- `Never Split the Difference`, `Getting to Yes` — calibrated questions, tactical empathy, labels, mirrors, interests.
- `Influence`, `Pre-Suasion` — reciprocity, commitment, social proof, scarcity, framing.
- `Aristotle's Rhetoric`, `Thank You for Arguing` — ethos/pathos/logos, reframing, anchoring, the illusion of choice.
- `How to Win Friends and Influence People`, `The Charisma Myth` — rapport, attention, presence.
- `The Laws of Human Nature`, `Impro` — motives, emotional signals, status dynamics.

The library text is injected into the coach's system prompt; the model picks the single most relevant tactic per moment and reports it in the `lens` field. These are reasoning influences, not scripts to quote, and they work through framing and delivery rather than lying.

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
- Speaker-labeled transcripts for `Me` and `Them`.
- One-mic speaker diarization with AssemblyAI (Universal-3 Pro streaming); the first speaker is `Me` and other voices are `Them`, with a turn-taking guess for short unattributed replies.
- Automatic call mode where microphone audio is `Me` and shared tab/system audio is `Them`.
- Typed transcript fallback for testing.
- Backend coaching suggestions powered by OpenAI, shaped by the strategy library, with per-session model choice (`gpt-5-nano` / `gpt-5-mini`) and a speed/quality control.
- A consent gate and privacy disclosure required before a session can start.
- Codeword toggled active coaching.
- Accept, dismiss, evaluate, end, and delete controls.
- Optional browser-spoken suggestions with local voice controls.
- Local post-session review.
- Session follow-ups and review state.
- An automated test suite (`npm test`) covering the coaching, library, and activation logic.

After the codeword is spoken, EarBud continues listening and evaluates the conversation for useful advice until the codeword is spoken again.

For one mixed microphone (in-person, AirPods-style), EarBud uses AssemblyAI streaming diarization (set `ASSEMBLYAI_API_KEY`). The first speaker is labeled `Me` and other voices `Them` (tap Swap if reversed); short, unattributed replies are resolved by a turn-taking guess. For online calls, choose call mode instead, allow microphone access for `Me`, then share the call tab/window with audio for `Them`.

## Run Locally

Install dependencies:

```powershell
npm install
```

Create a `.env` file using [.env.example](.env.example), then set the keys for the features you want:

- `OPENAI_API_KEY` — powers the **conversation coach** (required for model suggestions). Optional `OPENAI_MODEL` (`gpt-5-nano` default or `gpt-5-mini`) and `OPENAI_REASONING_EFFORT` (`minimal` default; raise for sharper but slower advice). Both are also selectable per session in the UI.
- `GEMINI_API_KEY` — powers backend **audio transcription** only, used by the "Online call" speaker mode. Not needed if you only use one-mic (AssemblyAI) or manual modes.
- `ASSEMBLYAI_API_KEY` — powers one-mic streaming **diarization**.

Create keys here:

```text
OpenAI:     https://platform.openai.com/api-keys
Gemini:     https://aistudio.google.com/apikey
AssemblyAI: https://www.assemblyai.com/app
```

Run it with:

```powershell
npm start
```

Open:

```text
http://localhost:3000
```

Run the automated tests anytime with:

```powershell
npm test
```

The app is intended to run locally on your machine. Do not expose the local server publicly unless you have added proper authentication, consent flows, and production security controls.

The coach is low-cost on `gpt-5-nano`, but it is a paid API — check current OpenAI pricing and your usage limits. Gemini (transcription) and the providers above may use inputs per their own terms; review them before using sensitive data or sharing the app.

For one-mic automatic speaker detection, set `ASSEMBLYAI_API_KEY`. AssemblyAI streaming diarization provides the live words, timing, and speaker split (first speaker = `Me`). Short, unattributed single-word turns fall back to a turn-taking guess, and you can tap Swap if `Me` / `Them` end up reversed.

## Important Privacy Note

EarBud is built around sensitive live conversation audio. Any real use should handle:

- Consent from people being recorded or transcribed where required.
- Local laws around audio recording.
- Clear recording indicators.
- User control over what is stored.
- Secure handling of transcripts and summaries.
- Easy deletion of personal data.

The local prototype already enforces several of these: a consent gate blocks starting a session until you confirm you have the right to record, raw audio is held in memory only (never written to disk), conversation content is kept out of server logs, and you can delete local session data from the UI.

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

The local prototype is feature-complete: objective setup, live transcription (browser, one-mic AssemblyAI diarization, or online-call mode), OpenAI-powered strategic coaching with a tactics library, spoken suggestions, post-session review, consent/privacy controls, and an automated test suite. The remaining work is deploying to a real server and building a production frontend.
