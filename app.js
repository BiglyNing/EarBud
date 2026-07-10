import {
  normalizeWakeWord,
  textContainsWakeWord,
  normalizeSpeaker,
  normalizeSpeakerMode,
  shouldToggleOnCodeword
} from "./sessionLogic.js";

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const SpeechSynthesisUtterance = window.SpeechSynthesisUtterance;
const speechSynthesis = window.speechSynthesis;

// Bud's house voice, shown in the picker simply as "Default Voice".
const DEFAULT_BUD_VOICE = "Google UK English Male";

const state = {
  active: false,
  paused: false,
  listening: false,
  coachingActive: false,
  requestingAgent: false,
  partner: "",
  goal: "",
  budVoice: DEFAULT_BUD_VOICE,
  wakeWord: "bud",
  coachModel: "gpt-5-mini",
  coachReasoningEffort: "minimal",
  speakerMode: "manual",
  liveSpeaker: "me",
  manualSpeaker: "me",
  phase: "Setup",
  conversationState: "Setup",
  transcript: [],
  liveTranscript: "Start a session, allow microphone access, then speak. Live words show here.",
  followUps: [],
  review: "End a session to generate a local review.",
  lastAction: "None",
  lastSuggestion: "Nothing, Bud is asleep. Start a session to wake him up.",
  currentSuggestion: "",
  lastLens: "None",
  awaitingObjective: false,
  spokenSuggestions: true,
  soundEffects: false,
  speechFrequency: "all",
  speechVolume: 0.7,
  speechRate: 0.95,
  speechSpeaking: false,
  lastSpokenSuggestion: "",
  recognition: null,
  shouldRestartRecognition: false,
  micStream: null,
  themStream: null,
  diarizeStream: null,
  diarizeSocket: null,
  diarizeRecorder: null,
  micSocket: null,
  themSocket: null,
  micPcm: null,
  themPcm: null,
  pendingTranscriptionChunks: 0,
  diarizeChunkMs: 1000,
  minDiarizeChunkBytes: 24000,
  meClusterId: null,
  knownClusters: [],
  diarizePcm: null,
  lastDiarizedSpeaker: null,
  lastConfidentSpeaker: null,
  health: null,
  lastCoachRequestAt: 0,
  coachCooldownMs: 6000,
  lastCodewordAt: 0,
  codewordCooldownMs: 2500
};

const elements = {
  goalForm: document.querySelector("#goalForm"),
  objectiveDisplay: document.querySelector("#objectiveDisplay"),
  budVoiceInput: document.querySelector("#budVoiceInput"),
  previewVoiceButton: document.querySelector("#previewVoiceButton"),
  wakeWordInput: document.querySelector("#wakeWordInput"),
  coachModelInput: document.querySelector("#coachModelInput"),
  coachSpeedInput: document.querySelector("#coachSpeedInput"),
  speakerModeInput: document.querySelector("#speakerModeInput"),
  speakerModeStatus: document.querySelector("#speakerModeStatus"),
  backendStatus: document.querySelector("#backendStatus"),
  deviceState: document.querySelector("#deviceState"),
  suggestionBox: document.querySelector("#suggestionBox"),
  conversationState: document.querySelector("#conversationState"),
  coachLens: document.querySelector("#coachLens"),
  lastAction: document.querySelector("#lastAction"),
  pauseButton: document.querySelector("#pauseButton"),
  endButton: document.querySelector("#endButton"),
  deleteButton: document.querySelector("#deleteButton"),
  manualTranscript: document.querySelector("#manualTranscript"),
  manualSpeakerInput: document.querySelector("#manualSpeakerInput"),
  addLineButton: document.querySelector("#addLineButton"),
  transcriptList: document.querySelector("#transcriptList"),
  liveTranscript: document.querySelector("#liveTranscript"),
  liveSpeakerInput: document.querySelector("#liveSpeakerInput"),
  swapSpeakerButton: document.querySelector("#swapSpeakerButton"),
  sessionStatus: document.querySelector("#sessionStatus"),
  reviewBox: document.querySelector("#reviewBox"),
  followupList: document.querySelector("#followupList"),
  spokenSuggestionsInput: document.querySelector("#spokenSuggestionsInput"),
  soundEffectsInput: document.querySelector("#soundEffectsInput"),
  speechFrequencyInput: document.querySelector("#speechFrequencyInput"),
  speechVolumeInput: document.querySelector("#speechVolumeInput"),
  speechRateInput: document.querySelector("#speechRateInput"),
  testVoiceButton: document.querySelector("#testVoiceButton"),
  stopVoiceButton: document.querySelector("#stopVoiceButton"),
  bud: document.querySelector("#bud")
};

let lastCuedSuggestion = "";
let wasSleeping = true; // tracks the sleeping->awake edge so Bud hoots once on wake

// Play Bud's "lens glint" once when a fresh suggestion appears. Purely cosmetic
// and fully guarded, so it never affects coaching if the mascot isn't present.
function triggerBudCue(suggestion) {
  const bud = elements.bud;
  if (!bud) return;
  if (suggestion && suggestion !== lastCuedSuggestion) {
    bud.classList.remove("bud--cue");
    void bud.getBoundingClientRect(); // force reflow so the animation restarts
    bud.classList.add("bud--cue");
    if (lastCuedSuggestion) playPageTurn(); // skip the very first render's default line
  }
  lastCuedSuggestion = suggestion || "";
}

// ---- Bud pulls the book he's citing off the shelf ----
// The coach returns a `lens` naming the source of its tactic (server.js asks
// for titles like "Never Split the Difference"), and the shelves are built
// from the same list. So when a lens comes back we find its spine and pull it
// out — the decoration becomes a readout of where the advice came from.

// Fold titles to a comparable core so "The 48 Laws of Power" (shelf) matches
// "48 Laws of Power" (coach): drop punctuation, &→and, and a leading "the".
function normalizeTitle(text) {
  return String(text)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\bthe\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

let lastHighlightedLens = null;
function highlightLensBook(lens) {
  const spines = document.querySelectorAll(".book[data-book]");
  if (!spines.length) return;

  const norm = lens && lens !== "None" ? normalizeTitle(lens) : "";
  if (norm === (lastHighlightedLens || "")) return; // unchanged since last render
  lastHighlightedLens = norm;

  // pick the spine whose core title is closest in length to the lens among
  // those that contain (or are contained by) it — avoids a short title like
  // "Impro" matching everything it's a substring of
  let match = null;
  if (norm) {
    spines.forEach((spine) => {
      const book = spine.dataset.book;
      if (!book || !(book === norm || book.includes(norm) || norm.includes(book))) return;
      if (!match || Math.abs(book.length - norm.length) < Math.abs(match.dataset.book.length - norm.length)) {
        match = spine;
      }
    });
  }

  spines.forEach((spine) => spine.classList.toggle("book--pulled", spine === match));
}

// Decorative "lens library" — the books Bud has read, shown as spines on the
// shelves so the sidebars fill out and hint at where the coaching comes from.
// These mirror the sources in coachingPrinciples.js (plus a few more). Purely
// cosmetic: the bookcases are aria-hidden and never affect coaching.
const LENS_BOOKS = [
  { full: "The 48 Laws of Power", spine: "48 Laws", color: "#592D2D" },
  { full: "The Prince", spine: "The Prince", color: "#A8392B" },
  { full: "The Art of War", spine: "Art of War", color: "#407732" },
  { full: "The 33 Strategies of War", spine: "33 Strategies", color: "#2f5a25" },
  { full: "Never Split the Difference", spine: "Never Split", color: "#A46650" },
  { full: "Getting to Yes", spine: "Getting to Yes", color: "#BA9E61", ink: "dark" },
  { full: "Influence", spine: "Influence", color: "#8a5341" },
  { full: "Pre-Suasion", spine: "Pre-Suasion", color: "#BA6F6F" },
  { full: "Aristotle's Rhetoric", spine: "Rhetoric", color: "#592D2D" },
  { full: "Thank You for Arguing", spine: "Thank You", color: "#E59D6A", ink: "dark" },
  { full: "How to Win Friends & Influence People", spine: "Win Friends", color: "#407732" },
  { full: "The Charisma Myth", spine: "Charisma Myth", color: "#BA6F6F" },
  { full: "The Laws of Human Nature", spine: "Human Nature", color: "#A46650" },
  { full: "Impro", spine: "Impro", color: "#A8392B" },
  { full: "Deep Work", spine: "Deep Work", color: "#2f5a25" },
  { full: "Crucial Conversations", spine: "Crucial Conversations", color: "#8a5341" },
  { full: "Difficult Conversations", spine: "Difficult Conversations", color: "#BA9E61", ink: "dark" },
  { full: "Start with No", spine: "Start with No", color: "#592D2D" },
  { full: "Pitch Anything", spine: "Pitch Anything", color: "#A46650" },
  { full: "Made to Stick", spine: "Made to Stick", color: "#E59D6A", ink: "dark" }
];

// Build the shelves: ONE row per sidebar. Spines flex-grow to fill the row (so
// it always reads near-full) and stand tall enough to read each title. Each
// shelf has its own widths/heights/lean/knick-knacks so the two rows look
// distinct, not mirrored. Purely decorative. Objects with a numeric `at` sit
// after that book index; `at: "end"` trails the row.
const SHELF_LAYOUT = {
  setup: {
    widths: [30, 23, 35, 27, 33, 22, 31, 26, 36, 24],
    heights: [100, 88, 96, 82, 99, 90, 85, 97, 91, 100],
    leans: [2, 7],
    objects: [{ kind: "plant", at: "end" }, { kind: "pokeball", at: "end" }]
  },
  transcript: {
    widths: [25, 34, 22, 31, 28, 36, 24, 30, 23, 33],
    heights: [90, 100, 84, 95, 87, 99, 82, 93, 100, 86],
    leans: [],
    leansRight: [4],
    objects: [{ kind: "stack", at: 3 }, { kind: "mug", at: "end" }]
  }
};

function makeObject(kind) {
  const obj = document.createElement("span");
  obj.className = `object object--${kind}`;
  if (kind === "stack") {
    for (let i = 0; i < 3; i += 1) obj.appendChild(document.createElement("i"));
  }
  return obj;
}

// Scale a spine's font so its full title fills the spine. The book is in
// writing-mode: vertical-rl, so the title runs down the (block) height axis —
// we grow the font until it would overflow the spine's height or width, then
// step back. Each spine gets its own size, so long and short titles both fill.
function fitSpine(spine) {
  const minPx = 7;
  const maxPx = 27;
  let size = minPx;
  spine.style.fontSize = `${size}px`;
  while (size < maxPx) {
    const next = size + 0.5;
    spine.style.fontSize = `${next}px`;
    if (spine.scrollHeight > spine.clientHeight || spine.scrollWidth > spine.clientWidth) {
      spine.style.fontSize = `${size}px`;
      break;
    }
    size = next;
  }
}

function renderLibrary() {
  const containers = document.querySelectorAll("[data-library]");
  if (!containers.length) return;

  const half = Math.ceil(LENS_BOOKS.length / 2);
  const sets = { setup: LENS_BOOKS.slice(0, half), transcript: LENS_BOOKS.slice(half) };

  containers.forEach((container) => {
    const which = container.getAttribute("data-library");
    const books = sets[which] || LENS_BOOKS;
    const layout = SHELF_LAYOUT[which] || SHELF_LAYOUT.setup;
    container.replaceChildren();

    const shelf = document.createElement("div");
    shelf.className = "shelf-level book-shelf";
    const strip = document.createElement("div");
    strip.className = "books";

    books.forEach((book, idx) => {
      const spine = document.createElement("span");
      const lean = layout.leans.includes(idx);
      const leanRight = (layout.leansRight || []).includes(idx);
      spine.className =
        "book" +
        (book.ink === "dark" ? " book--dark" : "") +
        (lean ? " book--lean" : "") +
        (leanRight ? " book--lean-right" : "");
      spine.style.background = book.color;
      spine.style.flexBasis = `${layout.widths[idx % layout.widths.length]}px`;
      spine.style.height = `${layout.heights[idx % layout.heights.length]}%`;
      spine.title = book.full;
      spine.dataset.book = normalizeTitle(book.full);
      spine.textContent = book.spine;
      strip.appendChild(spine);

      // drop in any mid-row knick-knack that sits after this book
      layout.objects
        .filter((object) => object.at === idx)
        .forEach((object) => strip.appendChild(makeObject(object.kind)));
    });

    // trailing knick-knacks round out the end of the shelf
    layout.objects
      .filter((object) => object.at === "end")
      .forEach((object) => strip.appendChild(makeObject(object.kind)));

    shelf.appendChild(strip);
    container.appendChild(shelf);

    // now that the spines are laid out, size each title to fill its spine
    strip.querySelectorAll(".book").forEach(fitSpine);
  });

  // refit once the display font finishes loading, since its metrics differ
  // from the fallback used on first paint
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      document.querySelectorAll("[data-library] .book").forEach(fitSpine);
    });
  }
}

function render() {
  elements.deviceState.textContent = state.listening
    ? state.speakerMode === "source"
      ? "Auto call"
      : state.speakerMode === "diarize"
        ? "Diarizing"
        : "Listening"
    : SpeechRecognition
      ? "Mic standby"
      : "Typed mode";

  elements.suggestionBox.textContent = state.lastSuggestion;
  triggerBudCue(state.lastSuggestion);
  if (elements.bud) {
    // One mood at a time, by precedence. speaking wins (he's talking aloud);
    // then sleeping when there's no session; then thinking while he waits on
    // the coach; otherwise he's leaning in, listening. Built to be mutually
    // exclusive so their animations never stack.
    const speaking = Boolean(state.speechSpeaking);
    const sleeping = !state.active && !speaking;
    const thinking = state.active && state.requestingAgent && !speaking;
    const listening = state.active && !state.paused && !speaking && !thinking;
    elements.bud.classList.toggle("bud--speaking", speaking);
    elements.bud.classList.toggle("bud--sleeping", sleeping);
    elements.bud.classList.toggle("bud--thinking", thinking);
    elements.bud.classList.toggle("bud--listening", listening);
    // a soft hoot the moment he wakes (sleeping -> not sleeping)
    if (wasSleeping && !sleeping) playHoot();
    wasSleeping = sleeping;
  }
  highlightLensBook(state.lastLens);
  renderObjectiveDisplay();
  elements.conversationState.textContent = state.conversationState;
  if (elements.coachLens) {
    elements.coachLens.textContent = state.lastLens && state.lastLens !== "None" ? state.lastLens : "—";
  }
  elements.lastAction.textContent = state.lastAction;
  elements.reviewBox.textContent = state.review;
  elements.liveTranscript.textContent = state.liveTranscript;
  elements.sessionStatus.textContent = state.active
    ? state.paused
      ? "Paused"
      : state.coachingActive
        ? "Coaching"
        : "Listening"
    : "Inactive";
  elements.sessionStatus.classList.toggle("active", state.active && !state.paused && state.coachingActive);

  elements.pauseButton.disabled = !state.active;
  elements.endButton.disabled = !state.active;
  elements.deleteButton.disabled = !state.active && state.transcript.length === 0 && state.followUps.length === 0 && !state.currentSuggestion;
  elements.addLineButton.disabled = !state.active || state.paused;
  elements.pauseButton.textContent = state.paused ? "Resume" : "Pause";
  renderSpeakerModeStatus();
  renderVoiceControls();
  renderSwapControl();
  renderBackendStatus();

  elements.transcriptList.innerHTML = "";
  if (state.transcript.length === 0) {
    // an idle state with a bit of character instead of an empty box: a quill
    // waiting over a blank page. Text is deliberately minimal — edit freely.
    const empty = document.createElement("li");
    empty.className = "transcript-empty";
    empty.setAttribute("aria-hidden", "true");
    const mark = document.createElement("span");
    mark.className = "transcript-empty-mark";
    const note = document.createElement("span");
    note.className = "transcript-empty-note";
    note.textContent = state.active ? "Listening… the log fills as you talk." : "Nothing logged yet. Bud's pen is ready.";
    empty.append(mark, note);
    elements.transcriptList.appendChild(empty);
  }
  state.transcript.forEach((line, index) => {
    const item = document.createElement("li");
    const meta = document.createElement("span");
    meta.className = "line-meta";
    meta.textContent = `Line ${index + 1} - ${line.time} - ${getSpeakerLabel(line.speaker)}${line.codeword ? " - codeword" : ""}`;
    item.append(meta, document.createTextNode(line.text));
    elements.transcriptList.prepend(item);
  });

  elements.followupList.innerHTML = "";
  if (state.followUps.length === 0) {
    const item = document.createElement("li");
    item.textContent = "No follow-ups yet.";
    elements.followupList.appendChild(item);
  } else {
    state.followUps.forEach((followUp) => {
      const item = document.createElement("li");
      item.textContent = followUp;
      elements.followupList.appendChild(item);
    });
  }
}

function renderSpeakerModeStatus() {
  if (elements.swapSpeakerButton) {
    const canSwap = state.speakerMode === "diarize" && state.active && state.knownClusters.length > 1;
    elements.swapSpeakerButton.disabled = !canSwap;
  }

  if (state.speakerMode === "diarize") {
    const providerName = "AssemblyAI";
    const pending = state.pendingTranscriptionChunks > 0 ? ` ${state.pendingTranscriptionChunks} chunk(s) diarizing.` : "";
    elements.speakerModeStatus.textContent = `One-mic mode uses ${providerName} diarization to label Me/Them. First speaker = Me; tap Swap if reversed.${pending}`;
    elements.liveSpeakerInput.disabled = true;
    return;
  }

  if (state.speakerMode === "source") {
    const pending = state.pendingTranscriptionChunks > 0 ? ` ${state.pendingTranscriptionChunks} chunk(s) transcribing.` : "";
    elements.speakerModeStatus.textContent = `Call mode: mic is Me; shared tab/system audio is Them.${pending}`;
    elements.liveSpeakerInput.disabled = true;
    return;
  }

  elements.speakerModeStatus.textContent = "Manual mode uses browser speech recognition and speaker selectors.";
  elements.liveSpeakerInput.disabled = false;
}

function renderSwapControl() {
  if (elements.swapSpeakerButton) {
    const canSwap = state.speakerMode === "diarize" && state.active && state.knownClusters.length > 1;
    elements.swapSpeakerButton.disabled = !canSwap;
  }
}

function renderVoiceControls() {
  const supported = Boolean(SpeechSynthesisUtterance && speechSynthesis);
  elements.spokenSuggestionsInput.disabled = !supported;
  elements.speechFrequencyInput.disabled = !supported || !state.spokenSuggestions;
  elements.speechVolumeInput.disabled = !supported || !state.spokenSuggestions;
  elements.speechRateInput.disabled = !supported || !state.spokenSuggestions;
  elements.testVoiceButton.disabled = !supported;
  elements.stopVoiceButton.disabled = !supported || !state.speechSpeaking;
}

// Bud's wake-up one-liners — a random quip greets you when a session starts,
// since he sleeps until then. Purely flavor; the objective guidance lives in
// the objective display.
const BUD_WAKE_LINES = [
  "That was the strangest dream about persuasion theory ever.",
  "Asleep? No, I was just thinking bro, trust.",
  "Just finished the Art of War again. I'm ready for anything.",
  "Is it that time of day again? Why can't I just study Rhetoric."
];

function pickWakeLine() {
  return BUD_WAKE_LINES[Math.floor(Math.random() * BUD_WAKE_LINES.length)];
}

function startSession(event) {
  event.preventDefault();

  state.partner = "this person";
  state.goal = "";
  state.awaitingObjective = true;
  state.wakeWord = normalizeWakeWord(elements.wakeWordInput.value);
  if (elements.coachModelInput) {
    state.coachModel = elements.coachModelInput.value || state.coachModel;
  }
  if (elements.coachSpeedInput) {
    state.coachReasoningEffort = elements.coachSpeedInput.value || state.coachReasoningEffort;
  }
  state.speakerMode = normalizeSpeakerMode(elements.speakerModeInput.value);
  elements.wakeWordInput.value = state.wakeWord;
  state.active = true;
  state.paused = false;
  state.coachingActive = false;
  state.phase = "Listening";
  state.conversationState = "Listening";
  state.transcript = [];
  state.liveTranscript = "Listening for your objective. Say it out loud now.";
  state.followUps = [];
  state.review = "Session in progress. End the session to generate a local review.";
  state.lastAction = "Session started";
  state.currentSuggestion = "";
  state.lastLens = "None";
  state.lastCoachRequestAt = 0;
  state.lastCodewordAt = 0;
  state.meClusterId = null;
  state.knownClusters = [];
  state.lastDiarizedSpeaker = null;
  state.lastConfidentSpeaker = null;
  state.lastSuggestion = pickWakeLine();

  if (state.speakerMode === "source") {
    startSourceSeparatedTranscription();
  } else if (state.speakerMode === "diarize") {
    startDiarizedTranscription();
  } else {
    startContinuousListening();
  }
  render();
}

function renderObjectiveDisplay() {
  if (!elements.objectiveDisplay) return;
  const value = elements.objectiveDisplay.querySelector("strong");
  if (!value) return;
  if (state.goal) {
    value.textContent = state.goal;
  } else if (state.awaitingObjective) {
    value.textContent = state.speakerMode === "diarize"
      ? "Listening for your objective. Say it out loud and aim for at least 10 words so one-mic speaker detection can calibrate to your voice."
      : "Listening for your objective. Say it out loud and aim for at least 10 words to give the coach clear context.";
  } else {
    value.textContent = "Tell Bud who you are talking to, what you want from the conversation, and any other context. Your first words become the objective and aim for at least 10 clear words.";
  }
}

function renderBackendStatus() {
  if (!state.health) {
    elements.backendStatus.hidden = false;
    elements.backendStatus.textContent = "Checking backend...";
    return;
  }

  // when the coach is ready there's nothing to act on, so hide the line to
  // free up room in the advanced settings; only surface the actionable warning
  if (state.health.agentReady) {
    elements.backendStatus.hidden = true;
    elements.backendStatus.textContent = "";
    return;
  }

  elements.backendStatus.hidden = false;
  elements.backendStatus.textContent = "coach needs OPENAI_API_KEY for model suggestions";
}

async function fetchHealth() {
  try {
    const response = await fetch("/api/health");
    state.health = await response.json();
  } catch {
    state.health = {
      ok: false,
      agentReady: false
    };
  } finally {
    render();
  }
}

function addTranscriptLine(text, speaker = state.manualSpeaker, metadata = {}) {
  const cleanText = text.trim();
  if (!cleanText || !state.active || state.paused) return;

  // The first chunk after starting a session is the spoken objective, not a
  // conversation line — capture it as the goal and stop here.
  if (state.awaitingObjective) {
    setSpokenObjective(cleanText);
    return;
  }

  const normalizedSpeaker = normalizeSpeaker(speaker);
  state.liveTranscript = `Final (${getSpeakerLabel(normalizedSpeaker)}): ${cleanText}`;

  const codeword = containsWakeWord(cleanText);
  const line = {
    text: cleanText,
    speaker: normalizedSpeaker,
    cluster: metadata.cluster || null,
    turnOrder: Number.isInteger(metadata.turnOrder) ? metadata.turnOrder : null,
    time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    codeword
  };

  state.transcript.push(line);

  if (codeword) {
    // Debounce: one spoken codeword can be detected several times (formatted +
    // unformatted finals, overlapping chunks, re-fired recognition). Toggle only
    // on the first detection within the cooldown window.
    const now = Date.now();
    if (shouldToggleOnCodeword(now, state.lastCodewordAt, state.codewordCooldownMs)) {
      state.lastCodewordAt = now;
      toggleCoaching();
    } else {
      render();
    }
    return line;
  }

  // Earlier runs of a multi-speaker turn defer to the turn's last line so the
  // coach reacts once, to the newest content.
  if (metadata.deferCoaching) {
    render();
    return line;
  }

  if (state.coachingActive) {
    maybeRequestAgentSuggestion(line);
  } else {
    state.phase = "Listening";
    state.conversationState = "Listening";
    state.currentSuggestion = "";
    state.lastSuggestion = `Heard and saved. Say "${state.wakeWord}" when you want active coaching.`;
  }

  render();
  return line;
}

// Capture the first spoken chunk of a session as the objective instead of a
// transcript line. Coaching still waits for the codeword.
function setSpokenObjective(text) {
  state.goal = text;
  state.awaitingObjective = false;
  state.lastAction = "Objective set";
  state.liveTranscript = `Objective set: ${text}`;
  state.lastSuggestion = `Objective set: "${text}". Say "${state.wakeWord}" to turn active coaching on.`;
  render();
}

async function startSourceSeparatedTranscription() {
  if (!state.health?.diarizationReady) {
    state.lastSuggestion = "Online call mode needs ASSEMBLYAI_API_KEY for streaming transcription. Falling back to manual browser transcription.";
    state.speakerMode = "manual";
    elements.speakerModeInput.value = "manual";
    startContinuousListening();
    render();
    return;
  }

  if (!navigator.mediaDevices?.getUserMedia || !navigator.mediaDevices?.getDisplayMedia || typeof AudioWorkletNode === "undefined") {
    state.lastSuggestion = "Online call mode needs microphone, screen-audio sharing, and AudioWorklet support. Use Chrome or Edge, or switch to manual mode.";
    state.speakerMode = "manual";
    elements.speakerModeInput.value = "manual";
    startContinuousListening();
    render();
    return;
  }

  try {
    state.liveTranscript = "Choose microphone access for Me, then share a tab/window with audio for Them.";
    render();

    state.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    state.themStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true
    });

    // Me: mic → its own streaming-transcription socket (one known speaker).
    state.micSocket = createTranscriptionSocket("me");
    state.micPcm = await startPcmStream(state.micStream, state.micSocket);

    // Them: shared-tab audio → its own socket, if the share included audio.
    const themAudioTracks = state.themStream.getAudioTracks();
    if (themAudioTracks.length > 0) {
      state.themSocket = createTranscriptionSocket("them");
      state.themPcm = await startPcmStream(new MediaStream(themAudioTracks), state.themSocket);
    }

    state.listening = true;
    state.liveTranscript = themAudioTracks.length > 0
      ? "Online call mode listening: mic = Me, shared audio = Them."
      : "Listening to mic as Me. Shared source had no audio — re-share and pick 'Share tab audio' for Them.";
    render();
  } catch (error) {
    console.error("[source] start failed:", error);
    stopSourceSeparatedTranscription();
    state.speakerMode = "manual";
    elements.speakerModeInput.value = "manual";
    state.lastSuggestion = "Online call setup was cancelled or unavailable. Falling back to manual browser transcription.";
    startContinuousListening();
    render();
  }
}

// One streaming socket per known source. Diarization is off (diarize=0): every
// turn is attributed to the fixed `speaker` for this socket.
function createTranscriptionSocket(speaker) {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(`${protocol}//${window.location.host}/api/diarize-stream?diarize=0`);
  socket.binaryType = "arraybuffer";
  const who = getSpeakerLabel(speaker);

  socket.addEventListener("message", (event) => {
    const payload = parseSocketPayload(event.data);
    if (!payload) return;

    if (payload.type === "transcript" && Array.isArray(payload.segments)) {
      const text = payload.segments
        .map((segment) => String(segment.text || "").trim())
        .filter(Boolean)
        .join(" ")
        .trim();
      if (!text) return;

      // Commit only on the formatted final so a turn is never recorded twice.
      if (payload.isFinal && payload.isFormatted) {
        if (state.awaitingObjective) {
          setSpokenObjective(text);
        } else {
          addTranscriptLine(text, speaker, { turnOrder: payload.turnOrder });
        }
      } else {
        state.liveTranscript = `Hearing (${who}): ${text}`;
        render();
      }
      return;
    }

    if (payload.type === "error") {
      state.lastSuggestion = payload.error || "Streaming transcription failed.";
      render();
    }
  });

  socket.addEventListener("error", () => {
    state.lastSuggestion = "Could not connect to the local transcription stream.";
    render();
  });

  return socket;
}

async function startDiarizedTranscription() {
  if (!state.health?.diarizationReady) {
    state.lastSuggestion = "One-mic diarization needs ASSEMBLYAI_API_KEY. Falling back to manual browser transcription.";
    state.speakerMode = "manual";
    elements.speakerModeInput.value = "manual";
    startContinuousListening();
    render();
    return;
  }

  if (!navigator.mediaDevices?.getUserMedia || typeof AudioWorkletNode === "undefined") {
    state.lastSuggestion = "One-mic diarization needs microphone access and AudioWorklet support. Use Chrome or Edge, or switch to manual mode.";
    state.speakerMode = "manual";
    elements.speakerModeInput.value = "manual";
    startContinuousListening();
    render();
    return;
  }

  try {
    state.liveTranscript = "Starting one-mic diarization. Speak first so you are labeled Me (use Swap if reversed).";
    render();

    state.diarizeStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    state.diarizeSocket = createDiarizeSocket();
    // AssemblyAI streaming takes raw PCM16, so stream linear16 from an
    // AudioWorklet instead of Opus chunks from MediaRecorder.
    state.diarizePcm = await startPcmStream(state.diarizeStream, state.diarizeSocket);
    state.listening = true;
    const providerName = "AssemblyAI";
    state.liveTranscript = `One-mic diarization is listening (${providerName}). First speaker = Me; tap Swap if reversed.`;
    render();
  } catch (error) {
    console.error("[diarize] start failed:", error);
    stopDiarizedTranscription();
    state.speakerMode = "manual";
    elements.speakerModeInput.value = "manual";
    const detail = error?.name === "NotAllowedError"
      ? "microphone access was blocked"
      : error?.name === "NotReadableError"
        ? "the microphone could not start (in use by another app?)"
        : `${error?.name || "error"}: ${error?.message || "unavailable"}`;
    state.lastSuggestion = `One-mic diarization fell back to manual — ${detail}.`;
    startContinuousListening();
    render();
  }
}


// Stream raw 16 kHz mono PCM16 from a media stream to a transcription websocket.
// Returns a handle so several streams (e.g. mic + shared audio) can run at once.
async function startPcmStream(stream, socket) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const context = new AudioContextClass();
  if (context.state === "suspended") await context.resume().catch(() => {});
  await context.audioWorklet.addModule("/pcm-worklet.js");

  const source = context.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(context, "pcm-capture");
  const sink = context.createGain();
  sink.gain.value = 0;
  const inputRate = context.sampleRate;

  const pcm = { context, node, source, sink, sampleRate: 16000 };

  node.port.onmessage = (event) => {
    if (!state.active || state.paused) return;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    const samples = downsampleFloat(event.data, inputRate, 16000);
    socket.send(float32ToPcm16(samples));
  };

  source.connect(node);
  node.connect(sink);
  sink.connect(context.destination);
  return pcm;
}

function stopPcmStream(pcm) {
  if (!pcm) return;
  try {
    pcm.node?.disconnect();
    pcm.source?.disconnect();
    pcm.sink?.disconnect();
    if (pcm.context && pcm.context.state !== "closed") pcm.context.close().catch(() => {});
  } catch {
    // ignore teardown errors
  }
}

// Nearest-neighbour downsample to 16 kHz (good enough for speech + diarization).
function downsampleFloat(input, inputRate, outRate) {
  if (inputRate === outRate) return input;
  const ratio = inputRate / outRate;
  const outLength = Math.floor(input.length / ratio);
  const samples = new Float32Array(outLength);
  for (let i = 0; i < outLength; i += 1) {
    samples[i] = input[Math.floor(i * ratio)];
  }
  return samples;
}

function float32ToPcm16(samples) {
  const buffer = new ArrayBuffer(samples.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }
  return buffer;
}

// The provider rejects a new live session while a previous one is still open
// (error text mentions concurrent sessions, close code 1008). A stuck stream
// can't be recovered in place, so point the user at the fix instead of a raw
// error string.
const CONCURRENT_SESSION_HELP =
  "Too many live sessions are open. End this session, give me a second to groom myself, refresh the page, and then start another session.";
function isConcurrentSessionError(text) {
  return typeof text === "string" && /concurrent session|too many/i.test(text);
}

function createDiarizeSocket() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(`${protocol}//${window.location.host}/api/diarize-stream`);
  socket.binaryType = "arraybuffer";

  const providerName = "AssemblyAI";

  socket.addEventListener("open", () => {
    state.liveTranscript = `Connected to ${providerName} streaming diarization.`;
    render();
  });

  socket.addEventListener("message", (event) => {
    const payload = parseSocketPayload(event.data);
    if (!payload) return;

    if (payload.type === "ready") {
      state.liveTranscript = `${providerName} stream ready. Speak naturally.`;
      render();
      return;
    }

    if (payload.type === "transcript" && Array.isArray(payload.segments)) {
      handleStreamingSegments(payload.segments, payload.isFinal, {
        turnOrder: payload.turnOrder,
        isFormatted: payload.isFormatted
      });
      return;
    }

    if (payload.type === "error") {
      const detail = payload.error || `${providerName} streaming diarization failed.`;
      state.lastSuggestion = isConcurrentSessionError(detail) ? CONCURRENT_SESSION_HELP : detail;
      render();
      return;
    }

    if (payload.type === "closed") {
      const reason = payload.reason ? `: ${payload.reason}` : "";
      state.lastSuggestion =
        payload.code === 1008 || isConcurrentSessionError(payload.reason)
          ? CONCURRENT_SESSION_HELP
          : `${providerName} stream closed (${payload.code || "unknown"})${reason}`;
      render();
    }
  });

  socket.addEventListener("close", () => {
    if (state.active && state.speakerMode === "diarize") {
      state.liveTranscript = "Diarization stream closed.";
      render();
    }
  });

  socket.addEventListener("error", () => {
    state.lastSuggestion = "Could not connect to the local diarization stream.";
    render();
  });

  return socket;
}

function parseSocketPayload(data) {
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

function handleStreamingSegments(segments, isFinal, meta = {}) {
  const cleanSegments = segments
    .map((segment) => ({
      ...segment,
      text: String(segment.text || "").trim()
    }))
    .filter((segment) => segment.text);
  if (cleanSegments.length === 0) return;

  // AssemblyAI emits two end_of_turn finals per turn: an unformatted one, then a
  // formatted one (punctuation, casing, numbers) with the SAME turn_order. We
  // commit a turn only on its formatted final — AssemblyAI's own guidance, since
  // acting on both records every turn twice. Partials and the unformatted final
  // still drive the live transcript, so words still appear without waiting.
  const isCommit = isFinal && Boolean(meta.isFormatted);

  // Only attributed turns define the speaker clusters, and only at commit time:
  // the first confident cluster becomes Me (Swap corrects it). Uncertain short
  // turns are resolved separately and must not pollute the mapping.
  if (isCommit) {
    cleanSegments.forEach((segment) => {
      if (!segment.uncertain) registerCluster(segment.speaker);
    });
  }

  const labeled = cleanSegments.map((segment) => ({
    ...segment,
    cluster: segment.speaker,
    speaker: labelForCluster(segment.speaker)
  }));

  const display = labeled
    .map((segment) => `${getSpeakerLabel(segment.speaker)}: ${segment.text}`)
    .join("  ");
  if (display) {
    state.liveTranscript = `${isFinal ? "Final" : "Hearing"}: ${display}`;
  }

  if (isCommit) {
    commitFinalStreamingSegments(labeled, meta);
  } else {
    render();
  }
}

// Record a completed turn as one transcript line per speaker run. Called once
// per turn — on its formatted final only — so a turn is never committed twice.
function commitFinalStreamingSegments(segments, meta = {}) {
  const text = segments.map((segment) => segment.text).join(" ").trim();
  if (!text) return;

  // First chunk of the session is the spoken objective, not a transcript line.
  if (state.awaitingObjective) {
    setSpokenObjective(text);
    return;
  }

  appendTurnLines(segments, Number.isInteger(meta.turnOrder) ? meta.turnOrder : null);
}

// Add one transcript line per speaker run. Coaching is evaluated once, on the
// turn's last (newest) line, so a multi-speaker turn does not fire repeatedly.
function appendTurnLines(segments, turnOrder) {
  const lines = [];
  segments.forEach((segment, index) => {
    let speaker;
    if (!segment.uncertain) {
      // Confident run: AssemblyAI's cluster decides (first cluster = Me).
      speaker = segment.speaker === "them" ? "them" : "me";
      state.lastConfidentSpeaker = speaker;
    } else {
      // Provisional run: a turn-taking guess (a short reply is usually the
      // other person).
      speaker = guessShortTurnSpeaker();
    }

    state.lastDiarizedSpeaker = speaker;
    const line = addTranscriptLine(segment.text, speaker, {
      // Uncertain runs carry no cluster, so Swap (which re-maps by cluster)
      // leaves their heuristic decision intact.
      cluster: segment.uncertain ? null : segment.cluster,
      turnOrder,
      deferCoaching: index < segments.length - 1
    });
    if (line) lines.push(line);
  });
  return lines;
}

// A short reply usually comes from the other person than whoever just held the
// floor. If we have no context yet, default to Me (the user speaks first).
function guessShortTurnSpeaker() {
  if (state.lastConfidentSpeaker === "me") return "them";
  if (state.lastConfidentSpeaker === "them") return "me";
  return "me";
}

function registerCluster(cluster) {
  if (!cluster) return;
  if (!state.knownClusters.includes(cluster)) {
    state.knownClusters.push(cluster);
  }
  if (!state.meClusterId) {
    state.meClusterId = cluster;
  }
}

function labelForCluster(cluster) {
  if (!cluster || !state.meClusterId) return null;
  return cluster === state.meClusterId ? "me" : "them";
}

function swapMeThem() {
  const others = state.knownClusters.filter((cluster) => cluster !== state.meClusterId);
  if (others.length === 0) {
    state.lastSuggestion = "Only one voice heard so far. Swap once a second speaker has been detected.";
    render();
    return;
  }

  state.meClusterId = others[others.length - 1];
  state.transcript.forEach((line) => {
    if (line.cluster) {
      line.speaker = line.cluster === state.meClusterId ? "me" : "them";
    }
  });
  state.lastAction = "Swapped Me / Them";
  state.lastSuggestion = "Swapped Me and Them. New lines will use the corrected labels.";
  render();
}

function containsWakeWord(text) {
  return textContainsWakeWord(text, state.wakeWord);
}

function getSpeakerLabel(speaker) {
  const normalized = normalizeSpeaker(speaker);
  if (normalized === "unknown") return "Unknown";
  if (normalized === "them") return "Them";
  return "Me";
}

function toggleCoaching() {
  state.coachingActive = !state.coachingActive;
  state.phase = state.coachingActive ? "Active Coaching" : "Listening";
  state.conversationState = state.phase;
  state.lastAction = state.coachingActive ? "Coaching activated" : "Coaching stopped";
  state.currentSuggestion = "";
  state.lastSuggestion = state.coachingActive
    ? `Active coaching on. I will chime in only when there is a useful move toward: ${state.goal}`
    : "Active coaching off. I will keep the transcript but stay quiet.";
  render();
}

function maybeRequestAgentSuggestion(line) {
  const now = Date.now();
  if (now - state.lastCoachRequestAt < state.coachCooldownMs) {
    state.phase = "Listening";
    state.conversationState = "Tracking";
    state.currentSuggestion = "";
    state.lastSuggestion = "Tracking the conversation. No new move yet.";
    return;
  }

  requestAgentSuggestion(line);
}

async function requestAgentSuggestion(line = state.transcript[state.transcript.length - 1]) {
  if (!line) return;

  state.lastCoachRequestAt = Date.now();
  state.requestingAgent = true;
  state.phase = "Evaluating";
  state.lastSuggestion = "Coach is evaluating the next useful move...";
  render();

  try {
    const response = await fetch("/api/coach", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        partner: state.partner,
        goal: state.goal,
        wakeWord: state.wakeWord,
        model: state.coachModel,
        reasoningEffort: state.coachReasoningEffort,
        latestLine: line.text,
        latestSpeaker: line.speaker,
        transcript: state.transcript,
        coachingActive: state.coachingActive
      })
    });

    const payload = await response.json();

    if (!response.ok) {
      if (payload.fallback) {
        applyCoachPayload(payload.fallback, payload.error);
        return;
      }
      throw new Error(payload.error || "Agent request failed.");
    }

    applyCoachPayload(payload);
  } catch (error) {
    state.phase = "Agent Offline";
    state.conversationState = "Offline";
    state.currentSuggestion = "";
    state.lastSuggestion = error.message || "The coaching backend is unavailable.";
  } finally {
    state.requestingAgent = false;
    render();
  }
}

function applyCoachPayload(payload, notice = "") {
  state.phase = payload.phase || "Guiding";
  state.conversationState = payload.state || payload.phase || "Guiding";
  state.lastLens = typeof payload.lens === "string" && payload.lens.trim() ? payload.lens.trim() : "None";
  const suggestion = payload.suggestion || "Stay quiet for now and keep listening for the next useful opening.";
  state.lastSuggestion = notice ? `${notice} ${suggestion}` : suggestion;
  state.currentSuggestion = payload.shouldChimeIn === false ? "" : suggestion;
  state.lastAction = payload.shouldChimeIn === false ? "Coach stayed quiet" : "Coach suggested a move";
  addFollowUp(payload.followUp);
  speakSuggestionIfNeeded({ ...payload, suggestion });
}

function speakSuggestionIfNeeded(payload) {
  if (!state.spokenSuggestions || payload.shouldChimeIn === false || !state.currentSuggestion) return;
  if (state.speechFrequency === "important" && !isImportantSuggestion(payload)) return;
  speakText(state.currentSuggestion);
}

function isImportantSuggestion(payload) {
  const stateName = String(payload.state || payload.phase || "").toLowerCase();
  return [
    "objection",
    "reframe",
    "ask",
    "closing",
    "blocked",
    "boundary"
  ].some((keyword) => stateName.includes(keyword));
}

// ---- Sound effects (off by default) ----
// Synthesised with Web Audio so nothing has to be bundled or fetched. Two
// cues, kept quiet: a soft two-note hoot when Bud wakes, and a paper flutter
// when a fresh suggestion lands. getSoundCtx() returns null unless the user
// has switched effects on, so audio never fires unasked.
let soundCtx = null;
function getSoundCtx() {
  if (!state.soundEffects) return null;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  if (!soundCtx) soundCtx = new AudioCtx();
  if (soundCtx.state === "suspended") soundCtx.resume();
  return soundCtx;
}

function playHoot() {
  const ctx = getSoundCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  const level = 0.11 * (0.5 + state.speechVolume * 0.5);
  [[523.25, 0], [392.0, 0.17]].forEach(([freq, offset]) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, now + offset);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.92, now + offset + 0.2);
    gain.gain.setValueAtTime(0.0001, now + offset);
    gain.gain.exponentialRampToValueAtTime(level, now + offset + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.24);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now + offset);
    osc.stop(now + offset + 0.28);
  });
}

function playPageTurn() {
  const ctx = getSoundCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  const dur = 0.26;
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) {
    const t = i / data.length;
    // decaying noise with a light flutter, so it reads as a page, not a hiss
    const env = Math.exp(-7 * t) * (0.55 + 0.45 * Math.sin(t * 46));
    data[i] = (Math.random() * 2 - 1) * env;
  }
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = 2500;
  band.Q.value = 0.7;
  const gain = ctx.createGain();
  gain.gain.value = 0.34 * (0.5 + state.speechVolume * 0.5);
  src.connect(band).connect(gain).connect(ctx.destination);
  src.start(now);
}

function speakText(text) {
  if (!SpeechSynthesisUtterance || !speechSynthesis || !text) return;
  if (state.lastSpokenSuggestion === text && speechSynthesis.speaking) return;

  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const voice = getSelectedVoice();
  if (voice) utterance.voice = voice;
  utterance.volume = state.speechVolume;
  utterance.rate = state.speechRate;
  utterance.pitch = 1;
  utterance.onstart = () => {
    state.speechSpeaking = true;
    state.lastSpokenSuggestion = text;
    render();
  };
  utterance.onend = () => {
    state.speechSpeaking = false;
    render();
  };
  utterance.onerror = () => {
    state.speechSpeaking = false;
    render();
  };
  speechSynthesis.speak(utterance);
}

function stopSpeaking() {
  if (speechSynthesis) {
    speechSynthesis.cancel();
  }
  state.speechSpeaking = false;
  render();
}

function toggleSpokenSuggestions() {
  state.spokenSuggestions = elements.spokenSuggestionsInput.checked;
  state.lastAction = state.spokenSuggestions ? "Voice enabled" : "Voice disabled";
  if (!state.spokenSuggestions) {
    stopSpeaking();
    return;
  }
  render();
}

function toggleSoundEffects() {
  state.soundEffects = elements.soundEffectsInput.checked;
  state.lastAction = state.soundEffects ? "Sound effects on" : "Sound effects off";
  // the checkbox click is a user gesture, so it's a valid moment to warm up
  // the audio context and confirm it's audible with a single hoot
  if (state.soundEffects) playHoot();
  render();
}

function updateSpeechSettings() {
  state.speechFrequency = elements.speechFrequencyInput.value;
  state.speechVolume = Number(elements.speechVolumeInput.value);
  state.speechRate = Number(elements.speechRateInput.value);
  render();
}

function testVoice() {
  speakText("Spoken suggestions are ready.");
}

// The browser's TTS voices load asynchronously, so populate the picker now and
// again on the voiceschanged event. value = the SpeechSynthesisVoice.name.
function getSelectedVoice() {
  if (!speechSynthesis || !state.budVoice) return null;
  return speechSynthesis.getVoices().find((v) => v.name === state.budVoice) || null;
}

function populateVoices() {
  const select = elements.budVoiceInput;
  if (!select || !speechSynthesis) return;
  const voices = speechSynthesis.getVoices();
  if (!voices.length) return;

  // Prefer English voices for an English-speaking coach, but fall back to all.
  const english = voices.filter((v) => /^en\b|^en-/i.test(v.lang));
  const list = english.length ? english : voices;

  select.replaceChildren();
  list.forEach((voice) => {
    const option = document.createElement("option");
    option.value = voice.name;
    // Bud's house voice (Google UK English Male) is shown as "Default Voice"
    option.textContent =
      voice.name === DEFAULT_BUD_VOICE ? "Default Voice" : `${voice.name} (${voice.lang})`;
    select.appendChild(option);
  });

  // select the saved/default voice if present, otherwise the first available
  if (list.some((voice) => voice.name === state.budVoice)) {
    select.value = state.budVoice;
  } else {
    state.budVoice = list[0].name;
    select.value = state.budVoice;
  }
}

// Speak a sample in whatever voice the dropdown currently shows. Syncing from
// the select first means the preview button works even when the selection
// didn't change (clicking the already-selected voice still plays).
function previewBudVoice() {
  state.budVoice = elements.budVoiceInput.value;
  speakText("Hi, I'm Bud. I'll sound like this.");
}

function changeBudVoice() {
  state.lastAction = "Voice changed";
  render();
  previewBudVoice();
}

function addFollowUp(text) {
  if (typeof text === "string" && text.trim() && !state.followUps.includes(text.trim())) {
    state.followUps.push(text.trim());
  }
}

function setupRecognition() {
  if (!SpeechRecognition) return;

  state.recognition = new SpeechRecognition();
  state.recognition.continuous = true;
  state.recognition.interimResults = true;
  state.recognition.lang = "en-US";

  let finalText = "";

  state.recognition.onstart = () => {
    finalText = "";
    state.listening = true;
    state.liveTranscript = "Listening for speech...";
    render();
  };

  state.recognition.onresult = (event) => {
    let interimText = "";

    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      if (result.isFinal) {
        finalText += `${result[0].transcript} `;
      } else {
        interimText += `${result[0].transcript} `;
      }
    }

    const cleanInterim = interimText.trim();
    if (cleanInterim) {
      state.liveTranscript = `Hearing (${getSpeakerLabel(state.liveSpeaker)}): ${cleanInterim}`;
      render();
    }

    const cleanFinal = finalText.trim();
    if (cleanFinal) {
      finalText = "";
      addTranscriptLine(cleanFinal, state.liveSpeaker);
    }
  };

  state.recognition.onerror = () => {
    state.listening = false;
    if (state.active && !state.paused) {
      state.lastSuggestion = "Speech recognition paused. Typed transcript input still works.";
      state.liveTranscript = "Speech recognition paused.";
    }
    render();
  };

  state.recognition.onend = () => {
    state.listening = false;
    render();

    if (state.shouldRestartRecognition && state.active && !state.paused) {
      window.setTimeout(() => {
        if (state.active && !state.paused) {
          startContinuousListening();
        }
      }, 250);
    }
  };
}

function startContinuousListening() {
  if (!state.recognition || state.listening || !state.active || state.paused) return;

  state.shouldRestartRecognition = true;
  try {
    state.recognition.start();
  } catch {
    state.lastSuggestion = "Speech recognition could not start. Type transcript lines to keep testing the agent.";
  }
}

function stopContinuousListening() {
  state.shouldRestartRecognition = false;
  if (!state.recognition || !state.listening) return;
  state.recognition.stop();
}

function togglePause() {
  state.paused = !state.paused;
  if (state.paused) {
    stopAllListening();
    state.coachingActive = false;
    state.conversationState = "Paused";
    state.currentSuggestion = "";
    state.lastAction = "Paused";
    state.lastSuggestion = "Session paused.";
    stopSpeaking();
  } else {
    state.conversationState = "Listening";
    state.lastAction = "Resumed";
    state.lastSuggestion = `Session resumed. Say "${state.wakeWord}" to toggle active coaching.`;
    startContinuousListening();
  }
  render();
}

function endSession() {
  stopAllListening();
  stopSpeaking();
  state.active = false;
  state.paused = false;
  state.listening = false;
  state.liveTranscript = "Session ended.";
  state.coachingActive = false;
  state.phase = "Review";
  state.conversationState = "Review";
  state.currentSuggestion = "";
  const hasConversation = state.transcript.filter((line) => !line.codeword).length > 0;
  if (state.transcript.length > 0) {
    addFollowUp(`Review whether the conversation with ${state.partner} achieved: ${state.goal}`);
  }
  // Show the basic local summary immediately, then ask the model for a real
  // review and swap it in. The local one stays as the fallback if that fails.
  const localReview = generateLocalReview();
  state.review = hasConversation ? "Bud is reviewing the conversation…" : localReview;
  state.lastAction = "Session ended";
  state.lastSuggestion = "Session ended. Review follow-ups, then delete local session data when finished.";
  render();
  if (hasConversation) requestReview(localReview);
}

async function requestReview(fallback) {
  try {
    const response = await fetch("/api/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        partner: state.partner,
        goal: state.goal,
        transcript: state.transcript,
        followUps: state.followUps,
        model: state.coachModel
      })
    });
    if (!response.ok) throw new Error("review request failed");
    state.review = formatReview(await response.json());
  } catch {
    // model unavailable (e.g. no API key) — keep the basic local summary
    state.review = fallback;
  }
  render();
}

function formatReview(data) {
  const lines = [];
  if (data.outcome) lines.push(`Outcome: ${data.outcome}`);
  if (data.summary) lines.push("", data.summary);

  const section = (title, items) => {
    if (Array.isArray(items) && items.length) {
      lines.push("", `${title}:`);
      items.forEach((item) => lines.push(`• ${item}`));
    }
  };
  section("What worked", data.whatWorked);
  section("What to improve", data.improvements);
  section("Next steps", data.nextSteps);

  return lines.join("\n").trim() || "No review was generated.";
}

function generateLocalReview() {
  const lines = state.transcript.filter((line) => !line.codeword).length;
  const followUps = state.followUps.length;

  return [
    `Objective: ${state.goal}`,
    `Partner: ${state.partner}`,
    `Transcript lines: ${lines}`,
    `Follow-ups captured: ${followUps}`
  ].join("\n");
}

function deleteSessionData() {
  stopAllListening();
  stopSpeaking();
  state.active = false;
  state.paused = false;
  state.coachingActive = false;
  state.requestingAgent = false;
  state.partner = "";
  state.goal = "";
  state.awaitingObjective = false;
  state.liveSpeaker = "me";
  state.manualSpeaker = "me";
  state.speakerMode = "manual";
  elements.liveSpeakerInput.value = "me";
  elements.manualSpeakerInput.value = "me";
  elements.speakerModeInput.value = "manual";
  state.phase = "Setup";
  state.conversationState = "Setup";
  state.transcript = [];
  state.liveTranscript = "Local session data deleted.";
  state.followUps = [];
  state.review = "Local session data deleted.";
  state.lastAction = "Deleted";
  state.lastSuggestion = "Local session data deleted. Set a new objective to begin.";
  state.currentSuggestion = "";
  state.lastLens = "None";
  state.lastCoachRequestAt = 0;
  state.lastCodewordAt = 0;
  render();
}

function stopAllListening() {
  stopContinuousListening();
  stopSourceSeparatedTranscription();
  stopDiarizedTranscription();
  state.listening = false;
}

function stopSourceSeparatedTranscription() {
  stopPcmStream(state.micPcm);
  stopPcmStream(state.themPcm);
  state.micPcm = null;
  state.themPcm = null;

  [state.micSocket, state.themSocket].forEach((socket) => {
    if (socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) {
      socket.close();
    }
  });
  state.micSocket = null;
  state.themSocket = null;

  [state.micStream, state.themStream].forEach((stream) => {
    stream?.getTracks().forEach((track) => track.stop());
  });
  state.micStream = null;
  state.themStream = null;
  state.pendingTranscriptionChunks = 0;
}

function stopDiarizedTranscription() {
  if (state.diarizeRecorder?.state === "recording") {
    state.diarizeRecorder.stop();
  }

  stopPcmStream(state.diarizePcm);
  state.diarizePcm = null;
  state.diarizeStream?.getTracks().forEach((track) => track.stop());
  if (state.diarizeSocket?.readyState === WebSocket.OPEN || state.diarizeSocket?.readyState === WebSocket.CONNECTING) {
    state.diarizeSocket.close();
  }
  state.diarizeRecorder = null;
  state.diarizeStream = null;
  state.diarizeSocket = null;
  state.pendingTranscriptionChunks = 0;
}

elements.goalForm.addEventListener("submit", startSession);
elements.addLineButton.addEventListener("click", () => {
  addTranscriptLine(elements.manualTranscript.value, state.manualSpeaker);
  elements.manualTranscript.value = "";
});
elements.manualSpeakerInput.addEventListener("change", () => {
  state.manualSpeaker = normalizeSpeaker(elements.manualSpeakerInput.value);
});
elements.liveSpeakerInput.addEventListener("change", () => {
  state.liveSpeaker = normalizeSpeaker(elements.liveSpeakerInput.value);
});
elements.speakerModeInput.addEventListener("change", () => {
  state.speakerMode = normalizeSpeakerMode(elements.speakerModeInput.value);
  render();
});
if (elements.coachModelInput) {
  elements.coachModelInput.addEventListener("change", () => {
    state.coachModel = elements.coachModelInput.value || state.coachModel;
    renderBackendStatus();
  });
}
if (elements.swapSpeakerButton) {
  elements.swapSpeakerButton.addEventListener("click", swapMeThem);
}
elements.pauseButton.addEventListener("click", togglePause);
elements.endButton.addEventListener("click", endSession);
elements.deleteButton.addEventListener("click", deleteSessionData);
elements.spokenSuggestionsInput.addEventListener("change", toggleSpokenSuggestions);
elements.soundEffectsInput.addEventListener("change", toggleSoundEffects);
elements.speechFrequencyInput.addEventListener("change", updateSpeechSettings);
elements.speechVolumeInput.addEventListener("input", updateSpeechSettings);
elements.speechRateInput.addEventListener("input", updateSpeechSettings);
elements.testVoiceButton.addEventListener("click", testVoice);
elements.stopVoiceButton.addEventListener("click", stopSpeaking);
elements.budVoiceInput.addEventListener("change", changeBudVoice);
elements.previewVoiceButton.addEventListener("click", previewBudVoice);

renderLibrary();
setupRecognition();
fetchHealth();
populateVoices();
if (speechSynthesis) {
  // voices often aren't ready on first paint; refill when the browser loads them
  speechSynthesis.addEventListener("voiceschanged", populateVoices);
}
render();
