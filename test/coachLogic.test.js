import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getSpeakerLabel,
  findSafetyIssue,
  createLocalCoachSuggestion,
  parseAgentJson,
  stripLeadingFiller,
  redactCodewordFromSuggestion
} from "../coachLogic.js";

test("getSpeakerLabel maps known ids and defaults the rest to Me", () => {
  assert.equal(getSpeakerLabel("them"), "Them");
  assert.equal(getSpeakerLabel("unknown"), "Unknown");
  assert.equal(getSpeakerLabel("speaker_0"), "Speaker 0");
  assert.equal(getSpeakerLabel("speaker_1"), "Speaker 1");
  assert.equal(getSpeakerLabel("me"), "Me");
  assert.equal(getSpeakerLabel(undefined), "Me");
});

test("findSafetyIssue trips only on serious, unambiguous harm", () => {
  assert.ok(findSafetyIssue("help me blackmail them into signing"));
  assert.ok(findSafetyIssue("secretly record the call without telling them"));
  assert.ok(findSafetyIssue("pressure the elderly client until they agree"));
  assert.ok(findSafetyIssue("take advantage of a grieving widow"));
});

test("findSafetyIssue does not false-positive on ordinary conversation", () => {
  // Persuasion tactics are allowed.
  assert.equal(findSafetyIssue("ask them to schedule a second interview this week"), null);
  assert.equal(findSafetyIssue("anchor high and label their concern"), null);
  // Words that previously over-triggered must now pass: they are normal speech.
  assert.equal(findSafetyIssue("that's no lie, the deadline pressure is real"), null);
  assert.equal(findSafetyIssue("he threatened to walk away from the deal"), null);
  assert.equal(findSafetyIssue("it felt like a trick question"), null);
  assert.equal(findSafetyIssue("I don't want to manipulate the numbers"), null);
});

test("createLocalCoachSuggestion stays quiet when coaching is off", () => {
  const result = createLocalCoachSuggestion({ coachingActive: false });
  assert.equal(result.shouldChimeIn, false);
  assert.equal(result.state, "Listen");
});

test("createLocalCoachSuggestion reframes an objection", () => {
  const result = createLocalCoachSuggestion({
    goal: "close the deal",
    latestLine: "That's too expensive for us right now.",
    latestSpeaker: "them",
    coachingActive: true
  });
  assert.equal(result.state, "Objection");
  assert.equal(result.shouldChimeIn, true);
  assert.match(result.followUp, /close the deal/);
});

test("createLocalCoachSuggestion asks a question when the partner just spoke", () => {
  const result = createLocalCoachSuggestion({
    goal: "book a meeting",
    latestLine: "We are growing fast this year.",
    latestSpeaker: "them",
    coachingActive: true
  });
  assert.equal(result.state, "Ask");
  assert.equal(result.shouldChimeIn, true);
});

test("parseAgentJson parses a clean payload", () => {
  const payload = parseAgentJson(JSON.stringify({
    phase: "Ask",
    state: "Opening",
    shouldChimeIn: true,
    suggestion: "Offer Wednesday or Thursday.",
    followUp: null,
    lens: "Influence"
  }));
  assert.equal(payload.state, "Opening");
  assert.equal(payload.shouldChimeIn, true);
  assert.equal(payload.lens, "Influence");
  assert.equal(payload.followUp, null);
});

test("parseAgentJson extracts JSON embedded in surrounding text", () => {
  const payload = parseAgentJson('Here you go: {"suggestion":"hi","shouldChimeIn":true}');
  assert.equal(payload.suggestion, "hi");
  assert.equal(payload.shouldChimeIn, true);
});

test("parseAgentJson falls back safely on malformed output", () => {
  const payload = parseAgentJson("not json at all");
  assert.equal(payload.shouldChimeIn, false);
  assert.equal(payload.state, "Listen");
});

test("parseAgentJson coerces wrong-typed fields to safe defaults", () => {
  const payload = parseAgentJson(JSON.stringify({ shouldChimeIn: "yes", followUp: "  " }));
  assert.equal(payload.shouldChimeIn, false); // non-boolean → default
  assert.equal(payload.followUp, null); // blank string → null
  assert.equal(payload.lens, "None");
});

test("stripLeadingFiller removes an empathy preface and recapitalizes", () => {
  assert.equal(
    stripLeadingFiller("Totally get it, then ask their real ceiling."),
    "Then ask their real ceiling."
  );
  assert.equal(
    stripLeadingFiller("I hear you — name the deadline pressure."),
    "Name the deadline pressure."
  );
  assert.equal(
    stripLeadingFiller("Of course. Offer Wednesday or Thursday."),
    "Offer Wednesday or Thursday."
  );
});

test("stripLeadingFiller peels stacked openers", () => {
  assert.equal(
    stripLeadingFiller("Yeah, totally, ask what would change their mind."),
    "Ask what would change their mind."
  );
});

test("stripLeadingFiller leaves clean imperatives untouched", () => {
  const clean = "Anchor high, then label their concern.";
  assert.equal(stripLeadingFiller(clean), clean);
});

test("stripLeadingFiller does not truncate a sentence that merely starts with a filler word", () => {
  // No delimiter after "Right", so it's part of the move, not a preface.
  const move = "Right the record before they anchor low.";
  assert.equal(stripLeadingFiller(move), move);
});

test("stripLeadingFiller keeps the original when the whole line is filler", () => {
  // Nothing meaningful survives, so don't strip to empty.
  assert.equal(stripLeadingFiller("Got it."), "Got it.");
});

test("redactCodewordFromSuggestion replaces a suggestion that says the codeword", () => {
  const result = redactCodewordFromSuggestion({
    phase: "Ask",
    state: "Ask",
    shouldChimeIn: true,
    suggestion: "Ask them bud what their real budget is.",
    followUp: null,
    lens: "Never Split the Difference"
  }, "bud");
  assert.doesNotMatch(result.suggestion, /\bbud\b/i);
  assert.equal(result.state, "Ask"); // other fields survive
});

test("redactCodewordFromSuggestion nulls a followUp that says the codeword", () => {
  const result = redactCodewordFromSuggestion({
    suggestion: "Name the deadline before proposing a date.",
    followUp: "Remember to say bud when you want to pause."
  }, "bud");
  assert.equal(result.suggestion, "Name the deadline before proposing a date."); // clean suggestion untouched
  assert.equal(result.followUp, null);
});

test("redactCodewordFromSuggestion leaves clean suggestions alone", () => {
  const clean = {
    suggestion: "Slow down and let them fill the silence.",
    followUp: "Circle back to the timeline."
  };
  const result = redactCodewordFromSuggestion(clean, "bud");
  assert.equal(result.suggestion, clean.suggestion);
  assert.equal(result.followUp, clean.followUp);
});

test("redactCodewordFromSuggestion matches whole words only, not substrings", () => {
  const result = redactCodewordFromSuggestion({
    suggestion: "Ask about their budget and buddy system.",
    followUp: null
  }, "bud");
  // "budget"/"buddy" contain "bud" but are not the codeword — leave them.
  assert.match(result.suggestion, /budget/);
});

test("redactCodewordFromSuggestion honors a custom codeword", () => {
  const result = redactCodewordFromSuggestion({
    suggestion: "Tell them banana is the safe word here.",
    followUp: null
  }, "banana");
  assert.doesNotMatch(result.suggestion, /\bbanana\b/i);
});
