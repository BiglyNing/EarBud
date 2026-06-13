# Architecture

This document outlines a possible technical architecture for EarBud.

## High-Level System

EarBud can be thought of as five major systems:

1. Audio capture
2. Speech transcription
3. Context and memory
4. Agent reasoning
5. User feedback through earbuds and app UI

## Components

### Mobile App

The mobile app is the control center for:

- Pairing earbuds.
- Starting and stopping listening sessions.
- Setting conversation goals.
- Reviewing summaries.
- Managing privacy settings.
- Deleting stored data.

### Audio Capture

Audio is captured from the user's microphone or connected earbuds.

The app should support clear user-controlled modes:

- Off
- Push-to-talk
- Active task session
- Active conversation coaching session

### Speech-To-Text

Speech-to-text converts live audio into text for the agent.

The system should optimize for:

- Low latency
- Speaker separation when possible
- Partial transcripts
- Noise handling
- Confidence scores

### Agent Orchestrator

The agent orchestrator decides what to do with incoming context.

Responsibilities include:

- Maintaining the active user goal.
- Tracking the state of a conversation.
- Detecting objections, decisions, and commitments.
- Choosing when to interrupt.
- Generating short suggestions.
- Logging follow-ups if the user allows it.

### Memory Layer

The memory layer stores user-approved context.

Examples:

- Current tasks
- Preferences
- Important contacts
- Past commitments
- Reusable conversation strategies

Sensitive transcripts should be treated differently from durable user preferences. The user should control what becomes long-term memory.

### Suggestion Delivery

Suggestions can be delivered through:

- A short spoken whisper in the user's ear
- A haptic signal
- A glanceable phone notification
- A live transcript and coaching screen

The default should be short and non-disruptive.

## Suggested Data Flow

1. User starts a session and defines a goal.
2. Audio is captured from earbuds or phone microphone.
3. Audio is transcribed in near real time.
4. Transcript chunks are sent to the agent.
5. Agent updates the conversation state.
6. Agent decides whether a suggestion is useful.
7. Suggestion is delivered privately to the user.
8. Session ends.
9. User reviews summary and chooses what to save.

## Early Prototype Stack

An early prototype could use:

- Mobile app: React Native, Swift, or Kotlin.
- Audio capture: native mobile audio APIs.
- Transcription: streaming speech-to-text provider.
- Agent backend: Node.js, Python, or serverless functions.
- Storage: Postgres plus encrypted object storage for optional transcripts.
- Realtime transport: WebSocket or WebRTC data channel.

## Engineering Priorities

- Latency must be low enough to help during live conversation.
- Audio handling must be explicit and user-controlled.
- The agent should produce short suggestions, not long paragraphs.
- Privacy controls should be built into the architecture from the beginning.
- The system should work even when the assistant decides silence is better than speaking.

