# Speech-To-Text

EarBud supports browser speech recognition, source-separated transcription, and one-mic speaker diarization.

## Browser Speech Recognition

This is the default live transcription path for manual speaker-label mode.

The browser listens after the user starts a session. Final transcript lines are added to the session transcript.

The behavior is:

1. Session starts.
2. Transcript lines are captured when browser support is available.
3. The codeword toggles active coaching on.
4. While active coaching is on, transcript context is evaluated for useful advice.
5. The codeword toggles active coaching off.

Browser support varies. Typed transcript input remains available as a fallback for testing.

## Online Call Mode

Online call mode is designed for online calls and separates speakers by audio source:

- Microphone audio is labeled `Me`.
- Shared tab/window/system audio is labeled `Them`.

Each source is streamed to AssemblyAI on its **own** WebSocket connection, using the same low-latency streaming pipeline as one-mic mode but with diarization disabled (`/api/diarize-stream?diarize=0`). Because each connection carries a single known speaker, no speaker labeling is needed — the client tags every turn from a socket with that socket's fixed label:

```text
Me: I wanted to ask about the deadline.
Them: I do not think we can move it.
```

<<<<<<< Updated upstream
This is source separation, not speaker diarization. It works best for calls where the user's microphone and the other person's tab/system audio are captured separately. Streaming each source (rather than uploading short audio chunks) keeps words intact and avoids the latency and fragmentation of chunked batch transcription.
=======
This is source separation, not voice identification. It works best for calls where the user's microphone and the other person's tab/system audio are captured separately.
>>>>>>> Stashed changes

## One-Mic Diarization

One-mic diarization is designed for in-person conversation with AirPods-style input where everyone is captured through one microphone.

The browser opens a local WebSocket stream and sends microphone audio chunks to:

```text
WS /api/diarize-stream
```

The backend forwards the audio to AssemblyAI streaming diarization (Universal-3 Pro, `u3-rt-pro`) with `speaker_labels` enabled. AssemblyAI returns live words, word timings, and per-turn speaker labels such as:

```text
Speaker 0: I wanted to ask about the deadline.
Speaker 1: I do not think we can move it.
```

AssemblyAI is the sole speaker source. The first speaker EarBud hears is labeled `Me`; every other speaker is `Them`. The mapping is locked for the session, and a **Swap Me / Them** control corrects it if the other person spoke first.

## Short / Unattributed Turns

AssemblyAI cannot attribute turns shorter than about one second (single-word replies, cold start), and returns those as `UNKNOWN`. EarBud never shows `Unknown`: such turns are resolved with a turn-taking guess so every line is `Me` or `Them`.

<<<<<<< Updated upstream
1. A short reply is assumed to come from the other person than whoever just held the floor.
2. With no context yet, it defaults to `Me`.

Confident turns always come straight from AssemblyAI; the turn-taking guess is used **only** for these short/uncertain turns.

This relies on AssemblyAI for live words, timing, and the main speaker split. Diarization can still struggle with heavy overlap, single-word interjections, or noisy rooms.
=======
1. If AssemblyAI confidently attributes the turn, EarBud uses that speaker cluster.
2. If AssemblyAI marks the turn as unattributed, EarBud applies a turn-taking guess: a short reply is assumed to come from the other person than whoever just held the floor.
3. With no context yet, it defaults to `Me`.

Confident turns always come straight from AssemblyAI. Diarization can still struggle with heavy overlap, single-word interjections, or noisy rooms.
>>>>>>> Stashed changes

## Speaker Labels

Browser speech recognition does not automatically detect who is speaking. It returns text, but it does not provide reliable speaker diarization.

EarBud currently uses two speaker labels:

- `Me`: the EarBud user.
- `Them`: the conversation partner or other person.

<<<<<<< Updated upstream
In one-mic mode these labels come from AssemblyAI's speaker split (first speaker = `Me`), with short turns resolved by a turn-taking fallback. In manual mode, live microphone transcription defaults to `Me`, but the user can change the live mic speaker selector before speaking. Typed transcript input also has a speaker selector so test conversations can include both sides.
=======
In one-mic mode these labels come from AssemblyAI's speaker split (first speaker = `Me`), with short unattributed turns resolved by the turn-taking fallback. In manual mode, live microphone transcription defaults to `Me`, but the user can change the live mic speaker selector before speaking. Typed transcript input also has a speaker selector so test conversations can include both sides.
>>>>>>> Stashed changes

These labels are sent to the coach so suggestions are aimed at what `Me` should say or do next, based on the user's stated objective and what `Them` has said.

## Codeword Behavior

The codeword acts as a toggle:

- First codeword: active coaching turns on.
- While active: EarBud listens to the ongoing conversation and may chime in when useful.
- Second codeword: active coaching turns off.

The default codeword is:

```text
earbud
```
