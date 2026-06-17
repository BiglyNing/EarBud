import { test } from "node:test";
import assert from "node:assert/strict";
import {
  principles,
  SITUATION_TAGS,
  selectPrinciples,
  formatPrinciples
} from "../coachingPrinciples.js";

test("library has principles and every entry is well-formed", () => {
  assert.ok(principles.length > 0, "library should not be empty");
  const allowed = new Set(SITUATION_TAGS);
  for (const entry of principles) {
    assert.equal(typeof entry.book, "string");
    assert.ok(entry.book.length > 0, "every entry needs a book");
    assert.equal(typeof entry.principle, "string");
    assert.ok(entry.principle.length > 0, "every entry needs principle text");
    assert.ok(Array.isArray(entry.tags) && entry.tags.length > 0, "every entry needs tags");
    for (const tag of entry.tags) {
      assert.ok(allowed.has(tag), `tag "${tag}" must be in SITUATION_TAGS`);
    }
  }
});

test("selectPrinciples returns only entries matching the requested tags", () => {
  const picked = selectPrinciples(["negotiation"], 5);
  assert.ok(picked.length > 0);
  assert.ok(picked.length <= 5);
  for (const entry of picked) {
    assert.ok(entry.tags.includes("negotiation"));
  }
});

test("selectPrinciples ranks multi-tag matches above single-tag matches", () => {
  const picked = selectPrinciples(["negotiation", "rhetoric"], 50);
  const score = (entry) => entry.tags.filter((t) => ["negotiation", "rhetoric"].includes(t)).length;
  for (let i = 1; i < picked.length; i++) {
    assert.ok(score(picked[i - 1]) >= score(picked[i]), "results must be sorted by descending tag overlap");
  }
});

test("selectPrinciples respects the limit", () => {
  assert.equal(selectPrinciples(["persuasion"], 3).length, 3);
});

test("selectPrinciples falls back to a starter set when nothing matches", () => {
  const picked = selectPrinciples(["nonexistent-tag"], 4);
  assert.equal(picked.length, 4);
});

test("formatPrinciples renders one attributed line per entry", () => {
  const sample = principles.slice(0, 3);
  const text = formatPrinciples(sample);
  const lines = text.split("\n");
  assert.equal(lines.length, 3);
  for (const line of lines) {
    assert.match(line, /^- \(.+\) .+/);
  }
});
