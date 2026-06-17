import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeWakeWord,
  textContainsWakeWord,
  normalizeSpeaker,
  normalizeSpeakerMode,
  shouldToggleOnCodeword
} from "../sessionLogic.js";

test("normalizeWakeWord trims, lowercases, and defaults to bud", () => {
  assert.equal(normalizeWakeWord("  Falcon "), "falcon");
  assert.equal(normalizeWakeWord(""), "bud");
  assert.equal(normalizeWakeWord(null), "bud");
});

test("textContainsWakeWord detects the codeword case-insensitively", () => {
  assert.equal(textContainsWakeWord("okay BUD let's go", "bud"), true);
  assert.equal(textContainsWakeWord("no trigger here", "bud"), false);
});

test("textContainsWakeWord matches whole words only, not substrings", () => {
  // "bud" must NOT fire on words that merely contain it.
  assert.equal(textContainsWakeWord("the budget is too tight", "bud"), false);
  assert.equal(textContainsWakeWord("hey buddy", "bud"), false);
  assert.equal(textContainsWakeWord("rosebud", "bud"), false);
  // But it does fire on the actual word, including next to punctuation.
  assert.equal(textContainsWakeWord("alright, bud.", "bud"), true);
});

test("textContainsWakeWord never matches on an empty codeword", () => {
  assert.equal(textContainsWakeWord("anything at all", ""), false);
  assert.equal(textContainsWakeWord("anything at all", null), false);
});

test("normalizeSpeaker collapses to me/them/unknown", () => {
  assert.equal(normalizeSpeaker("them"), "them");
  assert.equal(normalizeSpeaker("unknown"), "unknown");
  assert.equal(normalizeSpeaker("me"), "me");
  assert.equal(normalizeSpeaker("anything-else"), "me");
});

test("normalizeSpeakerMode validates the mode and defaults to manual", () => {
  assert.equal(normalizeSpeakerMode("diarize"), "diarize");
  assert.equal(normalizeSpeakerMode("source"), "source");
  assert.equal(normalizeSpeakerMode("manual"), "manual");
  assert.equal(normalizeSpeakerMode("bogus"), "manual");
  assert.equal(normalizeSpeakerMode(undefined), "manual");
});

test("shouldToggleOnCodeword fires once then debounces repeat detections", () => {
  const cooldown = 2500;
  // First detection of a fresh session (lastCodewordAt = 0) always toggles.
  assert.equal(shouldToggleOnCodeword(10_000, 0, cooldown), true);
  // A second detection of the SAME utterance, milliseconds later, is ignored.
  assert.equal(shouldToggleOnCodeword(10_120, 10_000, cooldown), false);
  // Overlapping source-mode chunk ~1s later is still the same utterance.
  assert.equal(shouldToggleOnCodeword(11_000, 10_000, cooldown), false);
  // A deliberate later codeword past the window toggles again.
  assert.equal(shouldToggleOnCodeword(13_000, 10_000, cooldown), true);
});
