# Speech-To-Text

EarBud currently supports two transcription paths for the local browser prototype.

## Browser Speech Recognition

This is the default mode.

The browser listens after the user starts a session. Final transcript lines are added to the session transcript. The intended behavior is:

1. Session starts.
2. Transcript lines are captured locally when browser support is available.
3. The wake word/codeword toggles active coaching on.
4. While active coaching is on, transcript context is evaluated for useful advice.
5. The codeword toggles active coaching off.

This mode is useful because it requires no backend transcription call, but support depends on the browser.

## Backend Audio Transcription

Backend transcription records short audio chunks in the browser and sends them to:

```text
POST /api/transcribe
```

The backend uses the OpenAI SDK to transcribe the uploaded audio when `OPENAI_API_KEY` is configured.

Configuration:

```env
OPENAI_API_KEY=your_api_key_here
OPENAI_TRANSCRIBE_MODEL=gpt-4o-mini-transcribe
```

If the backend does not have an API key, the UI falls back to browser speech recognition.

## Wake Word And Codeword Behavior

Both transcription modes feed the same transcript pipeline.

The intended behavior is a toggle:

- First codeword: active coaching turns on.
- While active: EarBud listens to the ongoing conversation and may chime in when useful.
- Second codeword: active coaching turns off.

The default codeword is:

```text
earbud
```

The current implementation still sends an agent request only when a transcript line includes the wake word. The next implementation step is to make the wake word/codeword activate a continuous coaching window.
