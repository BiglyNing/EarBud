# Speech-To-Text

EarBud uses browser speech recognition for the local prototype.

## Browser Speech Recognition

This is the default live transcription path.

The browser listens after the user starts a session. Final transcript lines are added to the session transcript.

The behavior is:

1. Session starts.
2. Transcript lines are captured when browser support is available.
3. The codeword toggles active coaching on.
4. While active coaching is on, transcript context is evaluated for useful advice.
5. The codeword toggles active coaching off.

Browser support varies. Typed transcript input remains available as a fallback for testing.

## Codeword Behavior

The codeword acts as a toggle:

- First codeword: active coaching turns on.
- While active: EarBud listens to the ongoing conversation and may chime in when useful.
- Second codeword: active coaching turns off.

The default codeword is:

```text
earbud
```
