// Pure session/activation helpers shared by the browser app (app.js) and the
// automated tests. No DOM or network access — just deterministic logic for the
// wake word, codeword detection, and speaker normalization, so the activation
// behavior can be verified with `npm test`.

// Normalize the user's codeword: trimmed, lowercased, defaulting to "bud".
export function normalizeWakeWord(value) {
  const cleanValue = String(value || "").trim().toLowerCase();
  return cleanValue || "bud";
}

// True when the spoken text contains the codeword as a WHOLE word. Whole-word
// matching (not substring) keeps a short codeword like "bud" from triggering on
// "budget" or "buddy". An empty codeword never matches.
export function textContainsWakeWord(text, wakeWord) {
  const word = String(wakeWord || "").trim().toLowerCase();
  if (!word) return false;
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(String(text || ""));
}

// Collapse any speaker value to the three the app understands.
export function normalizeSpeaker(value) {
  if (value === "unknown") return "unknown";
  if (value === "them") return "them";
  return "me";
}

// Validate a speaker-detection mode, defaulting to manual.
export function normalizeSpeakerMode(value) {
  return ["manual", "source", "diarize"].includes(value) ? value : "manual";
}

// A single spoken codeword can be detected several times for one utterance:
// the diarization stream emits an unformatted then a formatted final for the
// same turn, source-mode audio chunks can overlap, and browser recognition can
// re-fire. Edge-debounce the toggle so one utterance flips coaching at most
// once. Returns true only when enough time has passed since the last toggle.
export function shouldToggleOnCodeword(now, lastCodewordAt, cooldownMs = 2500) {
  return now - lastCodewordAt >= cooldownMs;
}
