import "dotenv/config";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import WebSocket, { WebSocketServer } from "ws";
import OpenAI from "openai";
import { principles, formatPrinciples } from "./coachingPrinciples.js";
import {
  getSpeakerLabel,
  findSafetyIssue,
  createLocalCoachSuggestion,
  parseAgentJson,
  stripLeadingFiller,
  redactCodewordFromSuggestion
} from "./coachLogic.js";

const app = express();
const server = http.createServer(app);
const port = Number(process.env.PORT || 3000);

// AssemblyAI handles all live transcription: one-mic diarization and the
// Online call mode's two single-speaker streams.
const assemblyAiApiKey = process.env.ASSEMBLYAI_API_KEY || "";

// OpenAI powers the conversation coach.
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
const COACH_MODELS = new Set(["gpt-5-mini", "gpt-5-nano"]);
const defaultCoachModel = COACH_MODELS.has(process.env.OPENAI_MODEL) ? process.env.OPENAI_MODEL : "gpt-5-mini";
// Reasoning models "think" before answering; less thinking = faster, more
// consistent latency. "minimal" suits this tightly-scoped task. Bump to "low"/
// "medium" via OPENAI_REASONING_EFFORT if suggestions ever feel shallow.
const REASONING_EFFORTS = new Set(["minimal", "low", "medium", "high"]);
const coachReasoningEffort = REASONING_EFFORTS.has(process.env.OPENAI_REASONING_EFFORT)
  ? process.env.OPENAI_REASONING_EFFORT
  : "minimal";

function resolveCoachModel(requested) {
  return COACH_MODELS.has(requested) ? requested : defaultCoachModel;
}

app.use(express.json({ limit: "1mb" }));
app.use(express.static("."));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    agentReady: Boolean(openai),
    diarizationReady: Boolean(assemblyAiApiKey),
    model: defaultCoachModel,
    coachModels: [...COACH_MODELS],
    reasoningEffort: coachReasoningEffort
  });
});

const diarizeStreamServer = new WebSocketServer({
  server,
  path: "/api/diarize-stream"
});

diarizeStreamServer.on("error", handleServerError);

diarizeStreamServer.on("connection", (clientSocket, request) => {
  const sendClientEvent = (payload) => {
    if (clientSocket.readyState === WebSocket.OPEN) {
      clientSocket.send(JSON.stringify(payload));
    }
  };

  if (!assemblyAiApiKey) {
    sendClientEvent({
      type: "error",
      error: "ASSEMBLYAI_API_KEY is not set. Add it to enable streaming transcription."
    });
    clientSocket.close(1011, "Streaming transcription is not configured.");
    return;
  }

  // diarize=0 → single known speaker per stream (Online call mode uses one
  // socket per source), so AssemblyAI speaker labeling is unnecessary.
  let diarize = true;
  try {
    diarize = new URL(request.url, "http://localhost").searchParams.get("diarize") !== "0";
  } catch {
    diarize = true;
  }

  connectAssemblyAiStream(clientSocket, sendClientEvent, { diarize });
});

// Proxy the browser's raw PCM16 audio to AssemblyAI's v3 streaming endpoint and
// translate its Turn events into the {type:"transcript", segments} contract the
// client consumes.
function connectAssemblyAiStream(clientSocket, sendClientEvent, { diarize = true } = {}) {
  const url = new URL("wss://streaming.assemblyai.com/v3/ws");
  // Universal-3 Pro is AssemblyAI's most accurate real-time model.
  url.searchParams.set("speech_model", process.env.ASSEMBLYAI_MODEL || "u3-rt-pro");
  url.searchParams.set("sample_rate", "16000");
  url.searchParams.set("encoding", "pcm_s16le");
  // Diarization only matters for one-mic mode. Online call mode streams one
  // known speaker per socket, so it disables speaker labels.
  url.searchParams.set("speaker_labels", diarize ? "true" : "false");
  if (diarize) {
    url.searchParams.set("max_speakers", process.env.ASSEMBLYAI_MAX_SPEAKERS || "2");
  }
  url.searchParams.set("format_turns", "true");
  // Turn endpointing. AssemblyAI's defaults (confidence 0.4, min silence 400ms,
  // max silence 1280ms) finalize a turn on brief pauses, cutting speakers off
  // mid-sentence. These higher defaults make it wait longer before ending a
  // turn so a whole thought is captured. All three are env-overridable.
  url.searchParams.set("end_of_turn_confidence_threshold", process.env.ASSEMBLYAI_EOT_CONFIDENCE || "0.8");
  url.searchParams.set("min_turn_silence", process.env.ASSEMBLYAI_MIN_SILENCE || "1000");
  url.searchParams.set("max_turn_silence", process.env.ASSEMBLYAI_MAX_SILENCE || "3000");
  // Raise VAD threshold in noisy rooms to avoid false speech detection (0-1).
  if (process.env.ASSEMBLYAI_VAD_THRESHOLD) {
    url.searchParams.set("vad_threshold", process.env.ASSEMBLYAI_VAD_THRESHOLD);
  }

  const aaiSocket = new WebSocket(url, {
    headers: { Authorization: assemblyAiApiKey }
  });

  const queuedAudio = [];
  let aaiOpen = false;
  // AssemblyAI returns "UNKNOWN" for turns too short to attribute (and during
  // cold start). Carry the last confidently-labelled speaker forward so the
  // client never sees an "Unknown" speaker — there are only ever Me and Them.
  let lastSpeakerLabel = "A";
  aaiSocket.on("open", () => {
    aaiOpen = true;
    while (queuedAudio.length > 0) {
      aaiSocket.send(queuedAudio.shift());
    }
  });

  aaiSocket.on("message", (message) => {
    const payload = parseJsonMessage(message);
    if (!payload) return;

    if (payload.type === "Begin") {
      sendClientEvent({ type: "ready" });
      return;
    }

    if (payload.type === "Turn") {
      const text = String(payload.transcript || "").trim();
      if (!text) return;

      // Single-speaker stream (Online call mode): emit the whole turn as one
      // segment with no speaker — the client labels it by which socket it is.
      if (!diarize) {
        sendClientEvent({
          type: "transcript",
          isFinal: Boolean(payload.end_of_turn),
          turnOrder: Number.isInteger(payload.turn_order) ? payload.turn_order : null,
          isFormatted: Boolean(payload.turn_is_formatted),
          segments: [{ speaker: null, text, start: null, end: null, words: [], uncertain: false }]
        });
        return;
      }

      // null when AssemblyAI could not attribute the turn (too short / cold
      // start). Flag it as uncertain and carry the previous speaker only as a
      // provisional cluster — the client decides short turns separately.
      const rawLabel = normalizeAssemblySpeakerLabel(payload.speaker_label);
      const uncertain = !rawLabel;
      const label = rawLabel || lastSpeakerLabel;
      if (rawLabel) lastSpeakerLabel = rawLabel;

      // AssemblyAI labels every final word with its own speaker. Split the turn
      // into runs of consecutive same-speaker words so a turn that spans a quick
      // A→B exchange (which longer endpointing makes more likely) becomes
      // separate, correctly-attributed segments instead of one blended line.
      // A word with its own label, or any turn that AssemblyAI did attribute, is
      // "confident"; otherwise the run is provisional and the client resolves it.
      const enriched = Array.isArray(payload.words)
        ? payload.words.map((word) => {
          const ownLabel = normalizeAssemblySpeakerLabel(word.speaker_label || word.speaker);
          return {
            text: String(word.text || word.word || "").trim(),
            cluster: assemblySpeakerCluster(ownLabel || label),
            confident: Boolean(ownLabel) || Boolean(rawLabel),
            start: normalizeAssemblyTime(word.start),
            end: normalizeAssemblyTime(word.end)
          };
        }).filter((word) => word.text)
        : [];

      const segments = [];
      for (const word of enriched) {
        const wordEntry = { text: word.text, speaker: word.cluster, start: word.start, end: word.end };
        const run = segments[segments.length - 1];
        if (run && run.speaker === word.cluster && run.uncertain === !word.confident) {
          run.words.push(wordEntry);
          run.text = `${run.text} ${word.text}`.trim();
          run.end = word.end;
        } else {
          segments.push({
            speaker: word.cluster,
            text: word.text,
            start: word.start,
            end: word.end,
            words: [wordEntry],
            uncertain: !word.confident
          });
        }
      }
      // No word-level speakers (e.g. partial turns) — keep the whole turn as one
      // segment using its turn-level label.
      if (segments.length === 0) {
        segments.push({ speaker: assemblySpeakerCluster(label), text, start: null, end: null, words: [], uncertain });
      }

      // Very short answers ("yeah", "no") are unreliable to attribute and tend
      // to stick to whoever just spoke. Mark them provisional so the client
      // applies the turn-taking guess (a brief reply is usually the other
      // person) instead of inheriting the previous speaker's label.
      const shortTurnWords = Number(process.env.ASSEMBLYAI_SHORT_TURN_WORDS || 1);
      if (enriched.length > 0 && enriched.length <= shortTurnWords) {
        for (const segment of segments) segment.uncertain = true;
      }

      if (process.env.ASSEMBLYAI_DEBUG) {
        const runs = segments.map((s) => `${s.speaker || "?"}:"${s.text}"`).join(" | ");
        console.log(`[turn] order=${payload.turn_order} eot=${payload.end_of_turn} fmt=${payload.turn_is_formatted} runs=${runs}`);
      }

      sendClientEvent({
        type: "transcript",
        isFinal: Boolean(payload.end_of_turn),
        // format_turns emits two end_of_turn finals per turn_order: an
        // unformatted one, then a formatted one. isFormatted lets the client
        // commit a turn only on its formatted final, so it is never recorded
        // twice; turnOrder is forwarded for ordering/metadata.
        turnOrder: Number.isInteger(payload.turn_order) ? payload.turn_order : null,
        isFormatted: Boolean(payload.turn_is_formatted),
        segments
      });
      return;
    }

    if (payload.type === "Error" || payload.error) {
      const detail = payload.error || "AssemblyAI streaming diarization failed.";
      console.error("AssemblyAI stream error:", detail);
      sendClientEvent({ type: "error", error: detail });
    }
  });

  aaiSocket.on("error", (error) => {
    const detail = `AssemblyAI stream error: ${error.message || "unknown error"}`;
    console.error(detail);
    sendClientEvent({ type: "error", error: detail });
  });

  aaiSocket.on("unexpected-response", (_request, response) => {
    const detail = `AssemblyAI refused the stream (${response.statusCode}). Check ASSEMBLYAI_API_KEY and that your plan includes streaming diarization.`;
    console.error(detail);
    sendClientEvent({ type: "error", error: detail });
  });

  aaiSocket.on("close", (code, reason) => {
    const closeReason = reason?.toString() || "";
    if (code !== 1000 && code !== 1005) {
      console.error(`AssemblyAI stream closed (${code})${closeReason ? `: ${closeReason}` : ""}`);
    }
    sendClientEvent({ type: "closed", code, reason: closeReason });
  });

  clientSocket.on("message", (data, isBinary) => {
    if (!isBinary) return;
    if (aaiOpen && aaiSocket.readyState === WebSocket.OPEN) {
      aaiSocket.send(data);
    } else {
      queuedAudio.push(data);
    }
  });

  const terminate = () => {
    if (aaiSocket.readyState === WebSocket.OPEN) {
      aaiSocket.send(JSON.stringify({ type: "Terminate" }));
      aaiSocket.close();
    } else if (aaiSocket.readyState === WebSocket.CONNECTING) {
      aaiSocket.close();
    }
  };

  clientSocket.on("close", terminate);
  clientSocket.on("error", terminate);
}

// AssemblyAI labels speakers "A", "B", ... — map to the speaker_0 / speaker_1
// cluster ids the client already keys its Me/Them mapping on.
function normalizeAssemblySpeakerLabel(label) {
  const value = String(label || "").trim().toUpperCase();
  return value && value !== "UNKNOWN" ? value : null;
}

function normalizeAssemblyTime(value) {
  if (!Number.isFinite(value)) return null;
  return value / 1000;
}

function assemblySpeakerCluster(label) {
  const index = typeof label === "string" && label.length === 1
    ? label.toUpperCase().charCodeAt(0) - 65
    : -1;
  return index >= 0 ? `speaker_${index}` : null;
}

app.post("/api/coach", async (req, res) => {
  if (!openai) {
    res.status(503).json({
      error: "OPENAI_API_KEY is not set. Add it to your environment or .env file to enable the coaching agent."
    });
    return;
  }

  const { partner, goal, tone, wakeWord, latestLine, latestSpeaker, transcript, coachingActive } = req.body || {};
  const coachModel = resolveCoachModel(req.body?.model);
  const reasoningEffort = REASONING_EFFORTS.has(req.body?.reasoningEffort) ? req.body.reasoningEffort : coachReasoningEffort;
  const recentTranscript = Array.isArray(transcript)
    ? transcript.slice(-16).map((line) => {
      const speaker = getSpeakerLabel(line.speaker);
      return `${line.time || "unknown"} ${speaker}: ${line.text || ""}`;
    }).join("\n")
    : "";

  if (!latestLine || typeof latestLine !== "string") {
    res.status(400).json({ error: "latestLine is required." });
    return;
  }

  const localFallback = redactCodewordFromSuggestion(createLocalCoachSuggestion({
    goal,
    latestLine,
    latestSpeaker,
    transcript,
    coachingActive
  }), wakeWord);

  // Scan only the user's own intent (objective + their latest line). Scanning
  // the whole transcript would re-trip on the other person's words every call.
  const safetyIssue = findSafetyIssue([goal, latestLine].join("\n"));
  if (safetyIssue) {
    res.json(redactCodewordFromSuggestion({
      phase: "Boundary",
      state: "Boundary",
      shouldChimeIn: true,
      suggestion: safetyIssue,
      followUp: null,
      lens: "None"
    }, wakeWord));
    return;
  }

  const systemPrompt = [
    "You are EarBud, a private conversation coach.",
    "The user is in a live conversation and wants to complete a specific objective.",
    "Base suggestions primarily on the user's stated objective and the labeled transcript.",
    "Every suggestion must help Me move toward the user's objective or protect the objective from being harmed.",
    "Treat Me as the EarBud user who needs advice, and Them as the person the user is talking to.",
    "Suggest what Me should say or do next; do not give advice to Them.",
    "You have a library of persuasion, influence, and rhetoric tactics below. Pick the single most relevant tactic for this moment and let it shape your suggestion.",
    "Tactics library:",
    formatPrinciples(principles),
    "These are reasoning influences, not scripts: apply the chosen tactic naturally and never quote or imitate book text.",
    "Name the book of the tactic you used in the lens field (e.g. \"48 Laws of Power\", \"Never Split the Difference\"); use \"None\" only when advising to keep listening.",
    "You are called ONLY right after Them (the other person) finishes a turn — this is the moment to help Me respond. Default to chiming in (shouldChimeIn true) with one concrete move. Only set shouldChimeIn false when their turn is trivial filler ('okay', 'mm-hmm', 'right') or nothing useful genuinely applies.",
    "state must be one of: Opening, Exploring, Objection, Reframe, Ask, Closing, Reached, Blocked, Listen, Boundary.",
    "Length rule: aim for 6-10 words, and NEVER exceed 15. Before answering, count the words in your suggestion; if it is over 15, rewrite it shorter until it fits. A complete short suggestion always beats a long one.",
    "Write the suggestion as a terse imperative move for Me to make in Me's own words — a direction Me can interpret and adapt, NOT a line to read aloud verbatim.",
    "Start the suggestion with an imperative verb (Ask, Name, Offer, Mirror, Slow, Anchor, Acknowledge...). NEVER open with filler or an empathy preface such as 'Totally get it', 'I hear you', 'Got it', 'For sure', 'Makes sense', 'Of course', 'Absolutely', 'Right' — cut straight to the move.",
    "Never write a quote for Me to say word-for-word. Coach the intent: what to do and why, so Me chooses the exact words.",
    "Keep it plain and immediately understandable: no jargon, no book names inside the suggestion, no preamble, no hedging.",
    "The user's codeword (given as \"Codeword\" in the input) toggles coaching on and off. NEVER use that word anywhere in the suggestion or followUp — voicing it would flip the session off. If a natural phrasing would include it, reword to avoid it.",
    "Good suggestions: 'Acknowledge their budget worry, then ask their real ceiling.' / 'Slow down and let them fill the silence.' / 'Name the deadline pressure before proposing a date.'",
    "Bad suggestions (too long, or scripted words to recite): 'Say to them, I completely understand that the price feels like a lot right now, so...' — never do this.",
    "The followUp value must be null unless there is a concrete next step to remember.",
    "Use persuasion, influence, framing, tactical empathy, status, and rhetorical technique freely to advance the user's objective.",
    "Stay truthful: do not fabricate facts, tell outright lies, make threats, or coerce the other person against their will.",
    "The objective itself must be legitimate; only if it is to harm, exploit, or defraud the other person, return state Boundary and redirect."
  ].join("\n");

  const userPrompt = [
    `Conversation partner: ${partner || "unknown"}`,
    `User objective: ${goal || "move the conversation toward a clear next step"}`,
    "Speaker labels:",
    "- Me means the EarBud user.",
    "- Them means the conversation partner or other person.",
    `Desired tone: ${tone || "calm"}`,
    `Codeword: ${wakeWord || "bud"}`,
    `Active coaching: ${Boolean(coachingActive)}`,
    "Recent transcript:",
    recentTranscript || "(no transcript yet)",
    "Latest transcript line:",
    `${getSpeakerLabel(latestSpeaker)}: ${latestLine}`,
    "Decide whether to chime in now. If useful, generate the next strategic move."
  ].join("\n\n");

  try {
    const completion = await openai.chat.completions.create({
      model: coachModel,
      reasoning_effort: reasoningEffort,
      max_completion_tokens: 4000,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "coach_move",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              phase: { type: "string" },
              state: { type: "string" },
              shouldChimeIn: { type: "boolean" },
              suggestion: { type: "string" },
              followUp: { type: ["string", "null"] },
              lens: { type: "string" }
            },
            required: ["phase", "state", "shouldChimeIn", "suggestion", "followUp", "lens"]
          }
        }
      }
    });

    const parsed = parseAgentJson(completion.choices?.[0]?.message?.content);
    const deFillered = { ...parsed, suggestion: stripLeadingFiller(parsed.suggestion) };
    const payload = redactCodewordFromSuggestion(deFillered, wakeWord);
    res.json(payload);
  } catch (error) {
    // Message only — keep transcript/goal content out of server logs.
    console.error("Coach request failed:", error?.message || error);
    res.status(502).json({
      error: "The coaching backend failed to generate a suggestion.",
      fallback: localFallback
    });
  }
});

app.post("/api/review", async (req, res) => {
  if (!openai) {
    res.status(503).json({
      error: "OPENAI_API_KEY is not set. Add it to your environment or .env file to enable AI reviews."
    });
    return;
  }

  const { partner, goal, transcript, followUps } = req.body || {};
  const coachModel = resolveCoachModel(req.body?.model);
  // A review runs once at session end and isn't latency-sensitive, so let it
  // think harder than the live coach (which defaults to "minimal") for depth.
  const reasoningEffort = REASONING_EFFORTS.has(req.body?.reasoningEffort) ? req.body.reasoningEffort : "medium";

  // The whole conversation matters for a review, but cap it to keep tokens sane.
  const conversation = Array.isArray(transcript)
    ? transcript
      .filter((line) => !line.codeword)
      .slice(-80)
      .map((line) => `${getSpeakerLabel(line.speaker)}: ${line.text || ""}`)
      .join("\n")
    : "";

  if (!conversation.trim()) {
    res.status(400).json({ error: "There is no conversation to review yet." });
    return;
  }

  const systemPrompt = [
    "You are EarBud, a private conversation coach writing a candid post-conversation review for the user.",
    "You receive the user's objective and the full labeled transcript. Me is the EarBud user; Them is the other person.",
    "Assess how well Me advanced their objective, grounded ONLY in what the transcript actually shows.",
    "Be specific and reference real moments from the conversation; never invent things that did not happen.",
    "Be honest and constructive: name what genuinely worked, what was weak, and what to do differently next time.",
    "Address the user directly as \"you\". Keep every list item to a single concrete sentence.",
    "outcome must be exactly one of: Achieved, Partially achieved, Not achieved, Inconclusive.",
    "summary is 1-2 sentences on how it went overall. Each list should have 1-3 items; use an empty list only if truly nothing applies."
  ].join("\n");

  const userPrompt = [
    `Conversation partner: ${partner || "unknown"}`,
    `Your objective: ${goal || "(no explicit objective was set)"}`,
    `Follow-ups captured: ${Array.isArray(followUps) && followUps.length ? followUps.join(" | ") : "(none)"}`,
    "Full transcript (Me = you):",
    conversation,
    "Write the review now."
  ].join("\n\n");

  try {
    const completion = await openai.chat.completions.create({
      model: coachModel,
      reasoning_effort: reasoningEffort,
      max_completion_tokens: 4000,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "conversation_review",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              outcome: { type: "string" },
              summary: { type: "string" },
              whatWorked: { type: "array", items: { type: "string" } },
              improvements: { type: "array", items: { type: "string" } },
              nextSteps: { type: "array", items: { type: "string" } }
            },
            required: ["outcome", "summary", "whatWorked", "improvements", "nextSteps"]
          }
        }
      }
    });

    const review = JSON.parse(completion.choices?.[0]?.message?.content || "{}");
    res.json(review);
  } catch (error) {
    // Message only — keep transcript/goal content out of server logs.
    console.error("Review request failed:", error?.message || error);
    res.status(502).json({ error: "The review backend failed to generate a review." });
  }
});

function parseJsonMessage(message) {
  try {
    return JSON.parse(message.toString());
  } catch {
    return null;
  }
}

let startupFailed = false;

function handleServerError(error) {
  if (startupFailed) return;
  startupFailed = true;

  if (error.code === "EADDRINUSE") {
    console.error(`Port ${port} is already in use. EarBud is probably already running at http://localhost:${port}.`);
    console.error("Close the other terminal/server, or set PORT to another number before running npm start.");
    process.exit(1);
  }

  console.error("EarBud server failed to start:", error);
  process.exit(1);
}

server.on("error", handleServerError);

server.listen(port, () => {
  console.log(`EarBud running at http://localhost:${port}`);
  console.log(openai
    ? `OpenAI coach enabled (default ${defaultCoachModel}, switchable to ${[...COACH_MODELS].join("/")}).`
    : "OpenAI coach disabled: OPENAI_API_KEY is not set.");
  console.log(assemblyAiApiKey
    ? `AssemblyAI transcription enabled (${process.env.ASSEMBLYAI_MODEL || "u3-rt-pro"}): one-mic diarization + Online call dual-stream.`
    : "AssemblyAI transcription disabled: set ASSEMBLYAI_API_KEY.");
});

