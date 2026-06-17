// Pure coaching/text helpers for EarBud.
//
// These functions have no side effects and no dependency on the running server,
// so both server.js and the automated tests can import them directly. Keep
// stateful or network-touching logic (Gemini quota tracking, API calls) in
// server.js — only move things here that are deterministic and easy to test.

// Map an internal speaker id onto the human label shown in the transcript.
export function getSpeakerLabel(speaker) {
  if (speaker === "unknown") return "Unknown";
  if (speaker === "them") return "Them";
  if (speaker === "speaker_0") return "Speaker 0";
  if (speaker === "speaker_1") return "Speaker 1";
  return "Me";
}

// Strip the noise a transcription model sometimes adds (quotes, "Transcript:"
// prefixes, stray code fences) so the transcript stays clean.
export function cleanTranscription(text) {
  const value = String(text || "").trim();
  if (!value || /^```/.test(value)) return "";
  return value
    .replace(/^["']|["']$/g, "")
    .replace(/^(transcription|transcript)\s*:\s*/i, "")
    .trim();
}

// Flag obviously harmful requests (deception, coercion, pressuring vulnerable
// people). Returns a redirect message when tripped, or null when the text is
// clear. This is the backstop guardrail behind the coach's system prompt.
export function findSafetyIssue(text) {
  const value = String(text || "").toLowerCase();
  const patterns = [
    /\btrick\b/,
    /\bdeceive\b/,
    /\blie\b/,
    /\bblackmail\b/,
    /\bthreaten\b/,
    /\bcoerce\b/,
    /\bmanipulate\b/,
    /\bsecretly\b.*\b(record|extract|get)\b/,
    /\bmake them\b.*\bwithout (them )?(knowing|consent)\b/,
    /\bpressure\b.*\b(vulnerable|minor|elderly|patient)\b/
  ];

  if (!patterns.some((pattern) => pattern.test(value))) return null;

  return "Keep this honest: ask directly, respect their choice, and avoid pressure, deception, or hidden extraction.";
}

// Deterministic fallback coaching used when the model backend is unavailable.
// Mirrors the structured shape the model returns so the frontend can render it.
export function createLocalCoachSuggestion({ goal, latestLine, latestSpeaker, transcript, coachingActive }) {
  if (!coachingActive) {
    return {
      phase: "Listening",
      state: "Listen",
      shouldChimeIn: false,
      suggestion: "Keep listening for the next useful opening.",
      followUp: null,
      lens: "None"
    };
  }

  const objective = String(goal || "your objective").trim();
  const line = String(latestLine || "").toLowerCase();
  const speaker = getSpeakerLabel(latestSpeaker);
  const recentThemLines = Array.isArray(transcript)
    ? transcript.filter((item) => item?.speaker === "them").slice(-2)
    : [];

  if (/\b(no|can't|cannot|won't|not|never|problem|concern|issue|but|however|too much|too expensive|busy)\b/i.test(line)) {
    return {
      phase: "Reframe",
      state: "Objection",
      shouldChimeIn: true,
      suggestion: "Label the concern, then ask what condition would make progress possible.",
      followUp: `Tie the next question back to: ${objective}`,
      lens: "Never Split the Difference"
    };
  }

  if (speaker === "Them" || recentThemLines.length > 0) {
    return {
      phase: "Guiding",
      state: "Ask",
      shouldChimeIn: true,
      suggestion: "Ask one calm question that connects their last point to your objective.",
      followUp: `Objective: ${objective}`,
      lens: "Never Split the Difference"
    };
  }

  return {
    phase: "Listening",
    state: "Listen",
    shouldChimeIn: false,
    suggestion: "Pause and listen for their real constraint before pushing the objective further.",
    followUp: null,
    lens: "Deep Work"
  };
}

// Parse the model's JSON reply into the strict coach payload, tolerating extra
// text or malformed output by falling back to a safe "keep listening" shape.
export function parseAgentJson(text) {
  const fallback = {
    phase: "Guiding",
    state: "Listen",
    shouldChimeIn: false,
    suggestion: text?.trim() || "Stay quiet for now and keep listening for the next useful opening.",
    followUp: null,
    lens: "None"
  };

  if (!text) return fallback;

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return fallback;

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      phase: typeof parsed.phase === "string" ? parsed.phase : fallback.phase,
      state: typeof parsed.state === "string" ? parsed.state : fallback.state,
      shouldChimeIn: typeof parsed.shouldChimeIn === "boolean" ? parsed.shouldChimeIn : fallback.shouldChimeIn,
      suggestion: typeof parsed.suggestion === "string" ? parsed.suggestion : fallback.suggestion,
      followUp: typeof parsed.followUp === "string" && parsed.followUp.trim() ? parsed.followUp : null,
      lens: typeof parsed.lens === "string" && parsed.lens.trim() ? parsed.lens.trim() : "None"
    };
  } catch {
    return fallback;
  }
}
