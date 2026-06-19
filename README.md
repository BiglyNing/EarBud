# EarBud

**EarBud** is a real-time conversation coach that runs directly in your browser.

Before a conversation, tell EarBud who you're talking to, what you're trying to accomplish, and any context that might help. As the conversation unfolds, EarBud listens to both sides and provides subtle, actionable suggestions to help move the discussion toward your goal.

Whether your talking with your boss, negotiating a raise, or just socializing with new people, EarBud acts as a live coach who speaks in your ears.

## How It Works

Before starting a session, you'll set a few things:

* Who you're talking to
* Your goal for the conversation
* The tone you'd like to maintain
* A custom codeword

When the session begins, you'll say your objective out loud. EarBud uses those first words both to understand your goal and to calibrate itself to your voice so it can distinguish you from other speakers.

Whenever you want coaching, simply say your codeword. EarBud will begin analyzing the conversation and looking for opportunities, objections, hesitation, or moments where you can strengthen your position. Say the codeword again to pause coaching.

A suggestion might look like:

> "Mention a specific result your work produced and how it benefited the company."

Suggestions are intentionally short and easy to glance at during a live conversation. If EarBud doesn't have anything useful to contribute, it stays silent.

---

## Transcription Modes

Each session can run in one of three modes:

### In-Person (Single Microphone)

A single microphone captures everyone in the room. EarBud uses AssemblyAI's speaker diarization to determine who's speaking.

The first voice detected is labeled **Me**, and everyone else is labeled **Them**. If the labels are reversed, you can swap them with a single click.

This mode works well with setups like AirPods or laptop microphones where one device captures the entire conversation. Additional turn-taking logic helps handle short responses that are difficult to diarize accurately.

### Online Calls

For virtual meetings, your microphone is treated as **Me**, while system audio or a shared browser tab becomes **Them**.

Since each audio source is already separated, no speaker diarization is required.

### Manual Mode

Enter speech through browser speech recognition or type messages manually while selecting the speaker from a dropdown.

This mode is useful for testing and development.

---

## Coaching Engine

EarBud's coaching system is built around a library of persuasion, negotiation, and communication principles defined in `coachingPrinciples.js`.

The principles are distilled from sources such as:

* *Never Split the Difference*
* *Influence*
* *The Art of War*
* *The 48 Laws of Power*
* *Aristotle's Rhetoric*

Each principle is represented as a concise tactical guideline tagged for specific situations. During a conversation, EarBud selects the most relevant lens and uses it to shape its reasoning and suggestions.

The system is designed to improve communication and strategy—not to encourage deception or manipulation.

---

## Running Locally

Install dependencies:

```powershell
npm install
```

Copy `.env.example` to `.env` and add your API keys:

* `OPENAI_API_KEY` powers the coaching engine.
* `ASSEMBLYAI_API_KEY` powers live transcription.

You can also configure:

* `OPENAI_MODEL` (`gpt-5-mini` or `gpt-5-nano`)
* `OPENAI_REASONING_EFFORT`

These settings can also be adjusted from the UI during a session.

Get API keys from:

* https://platform.openai.com/api-keys
* https://www.assemblyai.com/app

Start the application:

```powershell
npm start
```
Then open:

```text
http://localhost:3000
```

Run tests anytime with:

```powershell
npm test
```

---

## Deploying on Render

The repository includes a `render.yaml` file, allowing the entire application to be deployed as a single Render service.

The Node server hosts both the frontend and backend, so no separate static hosting setup is required.

### Deployment Steps

1. Push the repository to GitHub, GitLab, or Bitbucket.

2. Create a new Render Blueprint from the repository.

3. Provide your `OPENAI_API_KEY` and `ASSEMBLYAI_API_KEY`.

4. Deploy.

The application:

* Builds with `npm ci`
* Starts with `npm start`
* Uses `/api/health` for health checks
* Runs on Node 22
* Automatically uses the `PORT` provided by Render

The free tier works well for demos and testing, though cold starts may introduce a short delay.

### Important Note

EarBud is currently a prototype and does not include authentication.

A public deployment is fine for demonstrations, but production use should include authentication, authorization, and explicit user consent workflows before being made available to real users.

---

## Privacy

EarBud processes live conversation audio, so privacy should be taken seriously.

The prototype:

* Keeps audio in memory only
* Avoids storing conversation transcripts in server logs
* Allows session data to be deleted from the interface

The prototype does **not** enforce an in-app consent gate, so obtaining consent is your responsibility. If used in real-world situations, comply with local recording laws, obtain appropriate consent from participants, and provide clear indicators when audio is being processed.

For more details, see **Privacy and Safety** in `docs/privacy-and-safety.md`.
