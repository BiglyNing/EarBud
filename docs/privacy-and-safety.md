# Privacy and Safety

EarBud handles live audio, conversation context, and personal goals. That makes privacy and safety core product requirements, not optional features.

## Core Principles

- The user controls when listening starts and stops.
- People should know when they are being recorded or transcribed where required.
- The app should clearly explain what is processed, stored, and deleted.
- Sensitive data should be minimized.
- Long-term memory should require user approval.
- The assistant should help with honest communication, not manipulation.

## Listening Modes

EarBud should make the current listening state obvious.

Recommended modes:

- Off: no audio capture.
- Push-to-talk: captures only while the user holds a control.
- Task session: listens for user commands and task context.
- Conversation coaching: listens during a user-started conversation session.

## Consent

Audio recording and transcription laws vary by location. EarBud should be designed with consent awareness from the beginning.

Possible consent features:

- Clear in-app disclosure before starting a session.
- Visible recording indicator.
- Optional spoken disclosure prompt.
- Region-aware reminders.
- Default transcript deletion after a session.

## Data Minimization

EarBud should avoid storing more than it needs.

Recommended defaults:

- Process temporary transcript chunks for live suggestions.
- Do not store raw audio unless the user explicitly enables it.
- Let users review summaries before saving them.
- Let users delete sessions permanently.
- Separate temporary conversation context from durable memory.

## Security

Recommended security practices:

- Encrypt data in transit.
- Encrypt sensitive data at rest.
- Use short-lived access tokens.
- Store secrets outside the client app.
- Log only what is necessary for debugging.
- Redact sensitive transcript content from analytics.
- Provide account deletion and data export.

## Safety Boundaries

EarBud should not provide help with:

- Deception
- Coercion
- Harassment
- Impersonation
- Evading consent requirements
- Secretly extracting private information
- Pressuring vulnerable people

The assistant should redirect toward honest, respectful communication.

## Trust Goals

Users should be able to answer these questions easily:

- Is EarBud listening right now?
- What is EarBud doing with the audio?
- What did EarBud save?
- How do I delete it?
- How do I stop listening immediately?

