// Coaching principle library for EarBud.
//
// Each entry is a single, condensed persuasion/influence tactic distilled from a
// well-known source. We do NOT ship the books' text — the model already knows
// these works; these lines point it at WHICH technique to apply and HOW, in a
// consistent, tactical voice.
//
// DIRECTION
//   These are explicit persuasion, influence, and rhetoric techniques meant to
//   move the other person toward the user's objective. They work on framing,
//   leverage, status, and delivery — NOT on lying. Keep every entry truthful:
//   no fabricated facts, no threats, no coercion. The manner is aggressive; the
//   facts stay honest.
//
// HOW THIS IS USED
//   - Loaded once at server start (held in memory, not re-read per request).
//   - The library is small, so server.js sends ALL of it on each /api/coach
//     call via formatPrinciples(principles); the model then picks the single
//     most relevant tactic and names it in the `lens` field.
//   - selectPrinciples() can narrow the set by situation tags if the library
//     ever grows large enough that full inclusion costs too many tokens. It is
//     not currently wired into the request path (kept as a tested helper).
//
// EDITING
//   - Add/remove/reword freely. Keep each `principle` to one tight sentence.
//   - `tags` drive selection. Stick to the SITUATION_TAGS vocabulary below so
//     the selector can find them; add new tags there if you need them.
//   - `book` is for your reference and light attribution; it is not quoted.

// Situation tags the coach reasons about. The backend maps the live
// conversation moment (objective, tone, latest line) onto a subset of these.
export const SITUATION_TAGS = [
  "power",         // status, leverage, hidden dynamics
  "strategy",      // positioning, timing, when not to engage
  "negotiation",   // deals, asks, anchoring, trades
  "conflict",      // tension, objections, hostility, defusing
  "persuasion",    // moving someone toward a yes
  "rhetoric",      // verbal devices and how the point is framed/delivered
  "rapport",       // likeability, trust, warmth, connection
  "reading",       // reading motives, emotions, tells
  "status"         // raising/lowering social status in the moment
];

export const principles = [
  // ── POWER & STRATEGY ─────────────────────────────────────────────
  // The 48 Laws of Power (Robert Greene)
  { book: "48 Laws of Power", tags: ["power", "rhetoric"], principle: "Say less than necessary; strategic silence pressures them to fill the gap and concede ground." },
  { book: "48 Laws of Power", tags: ["power", "strategy"], principle: "Reveal your goal only in fragments; keep them guessing so they can't position against you." },
  { book: "48 Laws of Power", tags: ["power", "persuasion"], principle: "Frame every ask around their self-interest; make your outcome look like their idea of winning." },
  { book: "48 Laws of Power", tags: ["power", "reading"], principle: "Find their core insecurity or desire — that is the lever; press it and they move." },
  { book: "48 Laws of Power", tags: ["power", "status"], principle: "Let them feel they're in control while you quietly steer; the visible winner is rarely the real one." },
  { book: "48 Laws of Power", tags: ["power", "negotiation"], principle: "Make them chase; whoever needs the deal less dictates the terms." },

  // The Prince (Machiavelli)
  { book: "The Prince", tags: ["power", "strategy"], principle: "Pick the outcome you need and choose your means to fit it, not to feel righteous." },
  { book: "The Prince", tags: ["power", "reading"], principle: "Read people by their incentives and likely behavior, never by their stated good intentions." },

  // The Art of War (Sun Tzu)
  { book: "The Art of War", tags: ["strategy", "conflict"], principle: "Win without fighting — hand them an exit that looks like their own victory." },
  { book: "The Art of War", tags: ["strategy"], principle: "Choose the timing and the ground; engage only when it favors you, otherwise wait them out." },
  { book: "The Art of War", tags: ["strategy", "reading"], principle: "Know their true position and your own before you commit to any move." },
  { book: "The Art of War", tags: ["strategy", "conflict"], principle: "When weak in the moment, project patience; when strong, never overreach." },

  // The 33 Strategies of War (Robert Greene)
  { book: "33 Strategies of War", tags: ["strategy", "conflict"], principle: "Respond to the conversation as it actually is now, not the script you walked in with." },
  { book: "33 Strategies of War", tags: ["strategy"], principle: "Control the tempo: slow it down to think, speed it up to deny them time to resist." },

  // ── NEGOTIATION ──────────────────────────────────────────────────
  // Never Split the Difference (Chris Voss)
  { book: "Never Split the Difference", tags: ["negotiation", "rapport"], principle: "Label the emotion you sense out loud (\"It sounds like this feels rushed\") to defuse it and make them feel read." },
  { book: "Never Split the Difference", tags: ["negotiation", "conflict"], principle: "Deploy a calibrated How/What question (\"How am I supposed to do that?\") to hand your problem back to them." },
  { book: "Never Split the Difference", tags: ["negotiation", "rhetoric"], principle: "Mirror their last few words, then go silent; they'll fill the gap and hand you more." },
  { book: "Never Split the Difference", tags: ["negotiation"], principle: "Drive to a \"that's right\" — the instant they feel fully understood is when they become movable." },
  { book: "Never Split the Difference", tags: ["negotiation", "persuasion"], principle: "Invite a \"no\" first; people relax and engage once they feel free to refuse." },

  // Getting to Yes (Fisher & Ury)
  { book: "Getting to Yes", tags: ["negotiation", "conflict"], principle: "Attack the problem, never the person; keep them on your side of the table." },
  { book: "Getting to Yes", tags: ["negotiation"], principle: "Dig for the interest underneath their position; that's where the deal actually hides." },
  { book: "Getting to Yes", tags: ["negotiation"], principle: "Know your walkaway alternative; it sets how hard you can press without bluffing." },

  // Start with No (Jim Camp)
  { book: "Start with No", tags: ["negotiation", "persuasion"], principle: "Give them permission to say no; a real \"no\" starts the negotiation while a pressured \"yes\" just stalls it." },
  { book: "Start with No", tags: ["negotiation", "power"], principle: "Kill your neediness — act fully ready to walk and the pressure shifts back onto them." },
  { book: "Start with No", tags: ["negotiation", "rhetoric"], principle: "Ask open \"what\" and \"how\" questions that make them describe their own problem, doing your persuading for you." },

  // ── DIFFICULT & HIGH-STAKES CONVERSATIONS ────────────────────────
  // Crucial Conversations (Patterson, Grenny, McMillan, Switzler)
  { book: "Crucial Conversations", tags: ["conflict", "rapport"], principle: "When they go defensive, stop arguing the point and rebuild safety first; nothing lands until they feel unthreatened." },
  { book: "Crucial Conversations", tags: ["conflict", "strategy"], principle: "Open by stating what you actually want, so the talk can't drift into scoring points or winning." },
  { book: "Crucial Conversations", tags: ["conflict", "rhetoric"], principle: "Use contrast to repair a misread: say what you don't mean, then what you do, before it hardens." },

  // Difficult Conversations (Stone, Patton, Heen)
  { book: "Difficult Conversations", tags: ["conflict", "negotiation"], principle: "Drop the blame frame; ask what each side contributed so they keep problem-solving instead of defending." },
  { book: "Difficult Conversations", tags: ["conflict", "rapport"], principle: "Acknowledge the feeling before the logic; an unheard emotion blocks every argument you make." },
  { book: "Difficult Conversations", tags: ["conflict", "reading"], principle: "Separate intent from impact — name the effect without accusing motive, so they can fix it without losing face." },

  // ── PERSUASION ───────────────────────────────────────────────────
  // Influence / Pre-Suasion (Robert Cialdini)
  { book: "Influence", tags: ["persuasion"], principle: "Give a small genuine concession or favor first; reciprocity makes them feel they owe you a yes." },
  { book: "Influence", tags: ["persuasion", "rapport"], principle: "Extract a small yes before the big ask; people stay consistent with what they've already agreed to." },
  { book: "Influence", tags: ["persuasion"], principle: "Cite what people like them already chose; social proof quietly dissolves resistance." },
  { book: "Influence", tags: ["persuasion"], principle: "Surface a real deadline or limited option; loss aversion sharpens a wavering yes." },
  { book: "Influence", tags: ["persuasion", "rhetoric"], principle: "Use the contrast principle: float a bigger option first so your real ask feels small and reasonable." },
  { book: "Pre-Suasion", tags: ["persuasion", "rhetoric"], principle: "Set the frame just before the ask — what you raise in the seconds prior shapes how they hear it." },

  // ── RHETORIC & PERSUASIVE DEVICES ────────────────────────────────
  // Rhetoric (Aristotle) / Thank You for Arguing (Jay Heinrichs)
  { book: "Aristotle's Rhetoric", tags: ["rhetoric", "persuasion"], principle: "Lead with ethos: establish your credibility or shared values before you argue the point." },
  { book: "Aristotle's Rhetoric", tags: ["rhetoric", "persuasion"], principle: "Move them with pathos: make the stakes vivid and concrete, not abstract." },
  { book: "Aristotle's Rhetoric", tags: ["rhetoric", "persuasion"], principle: "Back it with logos: give one clean, strong reason rather than piling on five weak ones." },
  { book: "Thank You for Arguing", tags: ["rhetoric", "persuasion"], principle: "Ask the rhetorical question that leads them to voice your conclusion as if it were theirs." },
  { book: "Thank You for Arguing", tags: ["rhetoric", "negotiation"], principle: "Reframe their words: restate their point in language that quietly favors your position." },
  { book: "Thank You for Arguing", tags: ["rhetoric", "persuasion"], principle: "Offer the illusion of choice (\"A or B?\") where both options lead where you want." },
  { book: "Thank You for Arguing", tags: ["rhetoric", "persuasion"], principle: "Presuppose the outcome: \"when we move forward\" assumes the yes and skips the argument." },
  { book: "Thank You for Arguing", tags: ["rhetoric", "negotiation"], principle: "Anchor with the first number or frame; everything they say after is judged against it." },
  { book: "Thank You for Arguing", tags: ["rhetoric", "persuasion"], principle: "Bind them with identity: \"you're someone who keeps their word\" makes the behavior follow." },
  { book: "Thank You for Arguing", tags: ["rhetoric", "persuasion"], principle: "Repeat your key phrase; repetition makes a point feel both true and memorable." },
  { book: "Thank You for Arguing", tags: ["rhetoric", "conflict"], principle: "Concede a small point to win the big one; visible agreement disarms their resistance." },

  // Made to Stick (Chip & Dan Heath)
  { book: "Made to Stick", tags: ["rhetoric", "persuasion"], principle: "Make the point concrete and unexpected; one vivid image sticks where abstractions slide off." },
  { book: "Made to Stick", tags: ["rhetoric"], principle: "Lead with a single core message and cut the rest; a stripped idea is the one they remember and repeat." },
  { book: "Made to Stick", tags: ["rhetoric", "persuasion"], principle: "Wrap the ask in a short story, not statistics; people move on narrative, then justify with the numbers." },

  // ── RAPPORT & CHARISMA ───────────────────────────────────────────
  // How to Win Friends and Influence People (Dale Carnegie)
  { book: "How to Win Friends", tags: ["rapport", "persuasion"], principle: "Talk only in terms of what they want; people act for their reasons, never yours." },
  { book: "How to Win Friends", tags: ["rapport"], principle: "Use their name and ask about their interests; sincere attention is the fastest route to trust." },
  { book: "How to Win Friends", tags: ["rapport", "conflict"], principle: "Never tell them they're wrong; let them save face and they'll drift toward you." },
  { book: "How to Win Friends", tags: ["rapport", "persuasion"], principle: "Plant the idea so they believe it's theirs; ownership beats being convinced." },

  // The Charisma Myth (Olivia Fox Cabane)
  { book: "The Charisma Myth", tags: ["rapport", "status"], principle: "Be fully present — slow down, hold eye contact, and don't rush to your next point." },
  { book: "The Charisma Myth", tags: ["rapport", "rhetoric"], principle: "Pause two beats before answering; it reads as confidence and that you weighed their words." },

  // ── HUMAN NATURE & READING PEOPLE ────────────────────────────────
  // The Laws of Human Nature (Robert Greene)
  { book: "Laws of Human Nature", tags: ["reading"], principle: "Watch the gap between their words and their tone; the gap reveals the real feeling to work with." },
  { book: "Laws of Human Nature", tags: ["reading", "rapport"], principle: "People crave to feel significant; make them feel seen and they hand you the opening." },
  { book: "Laws of Human Nature", tags: ["reading", "conflict"], principle: "Defensiveness marks a touched nerve; ease off and circle back rather than pushing harder." },

  // ── STATUS & SOCIAL DYNAMICS ─────────────────────────────────────
  // Impro (Keith Johnstone)
  { book: "Impro", tags: ["status"], principle: "Every line is a status move; stillness and a low, steady voice raise you, fidgeting lowers you." },
  { book: "Impro", tags: ["status", "rapport"], principle: "Deliberately lower your status to make a guarded person feel safe enough to open up." },

  // Pitch Anything (Oren Klaff)
  { book: "Pitch Anything", tags: ["status", "power"], principle: "Win the frame, not the argument; whoever sets the terms of the exchange quietly controls it." },
  { book: "Pitch Anything", tags: ["status", "rhetoric"], principle: "Make a small confident frame-control move (\"I've only got a few minutes\") so you're chased, not chasing." },
  { book: "Pitch Anything", tags: ["persuasion", "rhetoric"], principle: "Create intrigue with one tight, vivid stake instead of a wall of detail; attention follows tension, not information." }
];

// Pick the most relevant principles for the current situation.
//   tags  – array of SITUATION_TAGS describing the live moment
//   limit – max principles to include (keeps token cost predictable)
// Entries are ranked by how many of the requested tags they match.
export function selectPrinciples(tags = [], limit = 8) {
  const wanted = new Set(tags);
  const scored = principles
    .map((p) => ({ p, score: p.tags.reduce((n, t) => n + (wanted.has(t) ? 1 : 0), 0) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  const chosen = scored.slice(0, limit).map((x) => x.p);

  // If nothing matched (or no tags given), fall back to a broad starter set.
  if (chosen.length === 0) {
    return principles.slice(0, limit);
  }
  return chosen;
}

// Render principles as a compact block for the system prompt.
export function formatPrinciples(list = principles) {
  return list.map((p) => `- (${p.book}) ${p.principle}`).join("\n");
}
