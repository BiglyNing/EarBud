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

## Automatic Speaker Mode

Automatic call mode is designed for online calls.

It separates speakers by audio source:

- Microphone audio is labeled `Me`.
- Shared tab/window/system audio is labeled `Them`.

The browser records short local audio chunks from each source and sends them to:

```text
POST /api/transcribe
```

The local backend sends each chunk to Gemini for transcription, then returns text with the known source label. This lets EarBud build a transcript such as:

```text
Me: I wanted to ask about the deadline.
Them: I do not think we can move it.
```

This is source separation, not voiceprint identification. It works best for calls where the user's microphone and the other person's tab/system audio are captured separately.

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

AssemblyAI cannot attribute turns shorter than about one second (single-word replies, cold start), and returns those as `UNKNOWN`. EarBud never shows `Unknown`: such turns are resolved with a fallback chain so every line is `Me` or `Them`.

1. If the user has calibrated a voiceprint, the turn's exact audio is sliced from a rolling buffer (padded to ~1.2s) and verified against the enrolled voice.
2. If the clip is still too short or the score is near the threshold, EarBud applies a turn-taking guess: a short reply is assumed to come from the other person than whoever just held the floor.
3. With no context yet, it defaults to `Me`.

Confident turns always come straight from AssemblyAI; the voiceprint is used **only** for these short/uncertain turns.

## Voice Verification

The voiceprint is optional and improves only the short-turn case above. The user taps **Calibrate my voice** once and speaks naturally for about 15 seconds. The browser records microphone audio, decodes it locally to WAV, and posts it to:

```text
POST /api/speaker-id/enroll
```

The backend pipes the audio to a persistent local SpeechBrain Python worker ([tools/speaker_verify.py](../tools/speaker_verify.py)), which computes a speaker embedding and stores it as the enrolled `Me` voiceprint. Everything runs on-device; nothing is sent to a cloud speaker-ID API.

For short turns, EarBud slices that turn's audio and posts it to:

```text
POST /api/speaker-id/verify
```

The worker returns a cosine-similarity score against the enrolled voiceprint. Scores at or above the configured threshold are `Me`; lower scores are `Them`; near-threshold scores fall through to the turn-taking guess.

### Engine And Setup

The worker is launched with `SPEAKER_PYTHON`. Install the dependencies from [requirements-speaker-id.txt](../requirements-speaker-id.txt) into that interpreter:

```text
npm run setup:speaker-id
```

The process is spawned lazily on the first calibration. If Python or the dependencies are missing, calibration returns a clear error and one-mic mode keeps working (short turns fall back to the turn-taking guess).

This relies on AssemblyAI for live words, timing, and the main speaker split, and on the local SpeechBrain worker only to resolve short turns. Diarization can still struggle with heavy overlap, single-word interjections, or noisy rooms.

## Speaker Labels

Browser speech recognition does not automatically detect who is speaking. It returns text, but it does not provide reliable speaker diarization.

EarBud currently uses two speaker labels:

- `Me`: the EarBud user.
- `Them`: the conversation partner or other person.

In one-mic mode these labels come from AssemblyAI's speaker split (first speaker = `Me`), with short turns resolved by the local voiceprint or turn-taking fallback. In manual mode, live microphone transcription defaults to `Me`, but the user can change the live mic speaker selector before speaking. Typed transcript input also has a speaker selector so test conversations can include both sides.

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
