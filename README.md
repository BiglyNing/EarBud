# EarBud

EarBud is your personal coach who discreetly guides your speech and helps you toward your objective during your conversations. It is a browser-based application that can run on both phone and desktop.

Before speaking to Bud, your personal coach, you can choose your codeword, conversation type, Bud's suggestions, and even Bud's voice. Next, connect your earbuds or wireless audio device, start a session, and speak your objective to Bud who will listen to it and give guidance based on it. Say your codeword when you want help, and Bud will chime in and give suggestions based on the current conversation history and your objective.

EarBud is for all people, whether you are a student or a working professional. EarBud is there for all conversational tasks such as asking for a grade bump, pitching an idea to an investor, or making plans and forming bonds with those around you, as everyone forgets things and could use a coach on their side. EarBud leaves you free to focus on what matters, getting your ideas across and achieving your goals.

---

## Motivation

Imagine this, you're talking to your boss about a crucially needed raise. You explain why you want the raise and how it would help you. Your boss then asks why you should get this raise. Your mind goes blank, and you don't get the raise. With Bud on your side, he would have suggested you name a specific accomplishment you have recently done and how it benefited the company. Your boss then sees the direct impact of your work and can understand how your contributions merited a raise. You get the raise. With Bud on your side, you get things done.

Relationships dictate our lives and shape it in unimaginable ways. If you did not connect with that one teacher in high school, then you might not have gotten that recommendation letter, gotten into that prestigious college, gotten that high-paying job, and ultimately live a successful and desirable life. Bud guides you at one of the most essential aspects of life, human communication.

With earbuds, powerful computers, and fast and effective models which can reason in a live chat, it is finally possible to get an effective, fast, and accessible personal conversation coach like Bud.

Nothing out there helps while it is happening. Notes are passive, summarizers only look back, and you cannot bring a human coach into the room with you. Being always there for you, Bud blends all the aspects of a good coach, speed, reasoning, and dependability.

---

## Screenshots & Demo

**Watch the demo** (click to play on YouTube)

[![EarBud demo video](https://img.youtube.com/vi/PHzw6_PkUc8/maxresdefault.jpg)](https://youtu.be/PHzw6_PkUc8)

**Bud waiting for a session**

Pick your voice, codeword, and conversation type, then say your objective to wake Bud up.

![EarBud setup screen with Bud the owl asleep](docs/screenshots/setup.png)

**A suggestion mid-conversation**

Bud reads the live transcript and responds with a suggestion.

![EarBud coaching a live conversation, showing Bud's suggestion, state, and lens](docs/screenshots/coaching.png)


---

## Features

Bud has all the features you'd expect from a coach:
- Live feedback
- Real time voice diarization Me/Them
- Video call mode with diarization
- Advice tailored for the user based on the conversation context
- Gives easy to say and effective advice

---

## How Do Sessions Work

Before a session starts, you can set a few things:

- Bud's response vs. reasoning levels
- Bud's spoken suggestion voice, speed, and volume
- The type of conversation
- A codeword to trigger coaching

When the session begins you say your objective out loud. EarBud uses those first words two ways. It reads them as your goal, and it uses your voice to calibrate so it can tell you apart from the other speakers.
 
When you start the conversation, you can just say your codeword whenever you want help. EarBud reads past and current conversation history in order to understand the conversation and provide the most effective suggestions to achieve the objective. Say the codeword again to pause coaching.

Each new line of transcript can trigger a call to the `/api/coach` route. The server builds a prompt from your objective, the codeword, and the last 16 lines of the labeled transcript, then asks OpenAI for the next move. The model replies in a JSON with these fields:

- `state`: one of Opening, Exploring, Objection, Reframe, Ask, Closing, Reached, Blocked, Listen, Boundary
- `shouldChimeIn`: whether there is anything worth saying right now
- `suggestion`: one short suggestion capped at around 15 words, written to be easy to say out loud
- `followUp`: a concrete next step to remember
- `lens`: the tactic the suggestion is based on (the book it came from, or None)

A suggestion might read like:

> "Mention a specific flavor which makes your hotdog special"

Suggestions stay short on purpose so you can glance at them mid conversation. If Bud has nothing useful to add, it stays quiet.

If the OpenAI call fails, the server falls back to a simple local suggestion built in `coachLogic.js` so the session keeps running.

When the session ends, the `/api/review` route sends the transcript back to OpenAI for a recap. The review comes back(Achieved, partially achieved, not achieved, or inconclusive), a short summary, and three short lists that cover what worked, what to improve, and next steps. The review runs once and is not time sensitive, so the model can reason for longer and create a more comprehensive review.

---

## How Does Coaching Work

The coaching lives in `coachingPrinciples.js`, a library of persuasion, negotiation, and communication tactics.

The tactics are distilled from sources like:

- *Never Split the Difference*
- *Influence*
- *The Art of War*
- *The 48 Laws of Power*
- *Aristotle's Rhetoric*

Each one is a short tactical principle labeled for the situations it fits. The full library is sent in the coach prompt, and for each suggestion the model picks the single most relevant tactic and names it in the `lens` field. The tactics just shape the advice, so the model never quotes or imitates book text.

There are also guardrails, meaning before every coaching call the server scans your objective and your latest line with `findSafetyIssue`. If the goal involves harming, defrauding, or exploiting anyone, EarBud redirects instead of helping. Bud is also told to stay truthful and to not make up facts or lie. It is also told to only advise **Me**, never the other person. At the end of the day, the goal is better communication, not deception or manipulation.

---

## Tech Stack

EarBud is one small Node.js app that runs both the website and everything behind it.

The app itself is just plain JavaScript, HTML, and CSS, with no big frameworks. It listens to your audio in the browser and streams it out live as you talk.

AssemblyAI listens and turns the speech into text, figuring out who said what (Me or Them). OpenAI is the actual coach, reading the conversation as it happens along with ideas from books like the Art of War, then coming back with a suggestion. If you don't have an AssemblyAI key, it falls back to your browser's built-in speech recognition so you can still try it out.

The whole thing runs on Render as a single service, and it stays connected for your entire session so the live coaching never drops out.

---

## Transcription Modes

Each session runs in one of three modes.

### In Person (single microphone)

One microphone picks up everyone in the room, and AssemblyAI's speaker diarization works out who is talking.

The first voice it hears is labeled **Me** and everyone else is labeled **Them**. If the labels come out backwards you can just swap them.

This mode works best with AirPods or other clip on mics, where a single device hears the whole conversation. Extra turn taking logic in `coachLogic.js` and `sessionLogic.js` helps with short replies that are hard to attribute. The server also tunes AssemblyAI's diarization logic, so it's better at catching full phrases and not cutting them off.

### Online Calls

For virtual meetings your microphone is **Me** and the system audio or a shared browser tab is **Them**.

Each source is already separate, so there is one WebSocket per source and diarization is turned off as it is unnecesary.

### Manual Mode

You can type in the speech lines yourself and change who is speaking with the dropdown menu.

This one is useful for testing and development, and it works with no AssemblyAI key set as it does not need diarization or transcription.

---

## Running Locally

Install dependencies:

```powershell
npm install
```

Copy `.env.example` to `.env` and add your keys:

- `OPENAI_API_KEY` powers the coaching and the review.
- `ASSEMBLYAI_API_KEY` powers live transcription.

Get keys from:

- https://platform.openai.com/api-keys
- https://www.assemblyai.com/app

Start the app:

```powershell
npm start
```

Then open:

```text
http://localhost:3000
```

For development with auto reload on file changes:

```powershell
npm run dev
```

To run the tests:

```powershell
npm test
```

If you start it with no `OPENAI_API_KEY` the coach is disabled. No `ASSEMBLYAI_API_KEY` also means live transcription is disabled, but you can still use manual mode to input dialogue.

---

## Configuration

All settings are read from the environment (use `.env` locally). The model and reasoning effort can also be changed from the UI during a session.

---

## Deploying on Render

The repo includes a `render.yaml`, so the whole app deploys as a single Render service. The Node server hosts both the frontend and the backend, so there is no separate static host to set up.

Steps:
1. Push the repo to GitHub, GitLab, or Bitbucket.
2. Create a new Render Blueprint from the repo.
3. Add your `OPENAI_API_KEY` and `ASSEMBLYAI_API_KEY`.
4. Deploy.

The service:
- Builds with `npm ci`
- Starts with `npm start`
- Runs on Node 22
- Uses `/api/health` for health checks
- Picks up the `PORT` Render provides

The free tier is fine for demos. It sleeps when idle, so the first visit after a while takes a few seconds to wake up.

---

> Built with the help of Claude Code and Codex.

