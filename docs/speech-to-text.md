# Speech-To-Text

EarBud currently supports two transcription paths.

## Browser Speech Recognition

This is the default mode.

The browser listens continuously after the user starts a session. Final transcript lines are added to the session transcript. EarBud stays quiet unless a line includes the configured wake word.

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

## Wake Word Behavior

Both transcription modes feed the same transcript pipeline.

EarBud only asks the backend coaching agent for a suggestion when a transcript line includes the wake word, which defaults to:

```text
earbud
```

This keeps the assistant from responding to every sentence and helps control API usage.

