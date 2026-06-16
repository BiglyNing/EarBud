import "dotenv/config";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import multer from "multer";
import WebSocket, { WebSocketServer } from "ws";
import { GoogleGenAI, Type } from "@google/genai";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const server = http.createServer(app);
const port = Number(process.env.PORT || 3000);
const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const client = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;
const assemblyAiApiKey = process.env.ASSEMBLYAI_API_KEY || "";
let geminiQuotaLimitedUntil = 0;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 24 * 1024 * 1024
  }
});

app.use(express.json({ limit: "1mb" }));
app.use(express.static("."));

app.get("/api/health", (_req, res) => {
  const quotaLimit = getGeminiQuotaLimit();
  res.json({
    ok: true,
    agentReady: Boolean(client),
    diarizationReady: Boolean(assemblyAiApiKey),
    model,
    geminiQuotaLimited: Boolean(quotaLimit),
    geminiQuotaRetryAt: quotaLimit?.retryAt || null
  });
});

const diarizeStreamServer = new WebSocketServer({
  server,
  path: "/api/diarize-stream"
});

diarizeStreamServer.on("error", handleServerError);

diarizeStreamServer.on("connection", (clientSocket) => {
  const sendClientEvent = (payload) => {
    if (clientSocket.readyState === WebSocket.OPEN) {
      clientSocket.send(JSON.stringify(payload));
    }
  };

  if (!assemblyAiApiKey) {
    sendClientEvent({
      type: "error",
      error: "ASSEMBLYAI_API_KEY is not set. Add it to enable one-mic diarization."
    });
    clientSocket.close(1011, "Diarization is not configured.");
    return;
  }

  connectAssemblyAiStream(clientSocket, sendClientEvent);
});

// Proxy the browser's raw PCM16 audio to AssemblyAI's v3 streaming endpoint and
// translate its Turn events into the {type:"transcript", segments} contract the
// client consumes.
function connectAssemblyAiStream(clientSocket, sendClientEvent) {
  const url = new URL("wss://streaming.assemblyai.com/v3/ws");
  // Universal-3 Pro is AssemblyAI's most accurate real-time model.
  url.searchParams.set("speech_model", process.env.ASSEMBLYAI_MODEL || "u3-rt-pro");
  url.searchParams.set("sample_rate", "16000");
  url.searchParams.set("encoding", "pcm_s16le");
  url.searchParams.set("speaker_labels", "true");
  url.searchParams.set("max_speakers", process.env.ASSEMBLYAI_MAX_SPEAKERS || "2");
  url.searchParams.set("format_turns", "true");
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

      // null when AssemblyAI could not attribute the turn (too short / cold
      // start). Flag it as uncertain and carry the previous speaker only as a
      // provisional cluster — the client decides short turns separately.
      const rawLabel = normalizeAssemblySpeakerLabel(payload.speaker_label);
      const uncertain = !rawLabel;
      const label = rawLabel || lastSpeakerLabel;
      if (rawLabel) lastSpeakerLabel = rawLabel;

      const words = Array.isArray(payload.words)
        ? payload.words.map((word) => {
          const wordLabel = normalizeAssemblySpeakerLabel(word.speaker_label || word.speaker) || label;
          return {
            text: String(word.text || word.word || "").trim(),
            speaker: assemblySpeakerCluster(wordLabel),
            start: normalizeAssemblyTime(word.start),
            end: normalizeAssemblyTime(word.end)
          };
        }).filter((word) => word.text)
        : [];
      const start = words.length ? words[0].start : null;
      const end = words.length ? words[words.length - 1].end : null;

      sendClientEvent({
        type: "transcript",
        isFinal: Boolean(payload.end_of_turn),
        // turn_order is AssemblyAI's stable id for the turn. format_turns emits
        // an unformatted final then a formatted final for the SAME turn_order;
        // the client uses this to upgrade that line in place instead of
        // duplicating it or dropping the continuation.
        turnOrder: Number.isInteger(payload.turn_order) ? payload.turn_order : null,
        isFormatted: Boolean(payload.turn_is_formatted),
        segments: [{ speaker: assemblySpeakerCluster(label), text, start, end, words, uncertain }]
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

app.post("/api/transcribe", upload.single("audio"), async (req, res) => {
  if (!client) {
    res.status(503).json({
      error: "GEMINI_API_KEY is not set. Add it to your environment or .env file to enable transcription."
    });
    return;
  }

  const quotaLimit = getGeminiQuotaLimit();
  if (quotaLimit) {
    res.status(429).json({
      code: "GEMINI_QUOTA_EXHAUSTED",
      error: "Gemini quota is exhausted, so backend transcription is paused.",
      retryAt: quotaLimit.retryAt
    });
    return;
  }

  if (!req.file?.buffer) {
    res.status(400).json({ error: "Audio file is required." });
    return;
  }

  const speaker = req.body?.speaker === "them" ? "them" : "me";

  try {
    const response = await client.models.generateContent({
      model,
      contents: [
        {
          text: [
            "Transcribe this audio chunk.",
            "Return only the spoken words.",
            "If there is no clear speech, return an empty string.",
            "Do not add speaker labels, commentary, punctuation explanations, or markdown."
          ].join(" ")
        },
        {
          inlineData: {
            mimeType: req.file.mimetype || "audio/webm",
            data: req.file.buffer.toString("base64")
          }
        }
      ]
    });

    res.json({
      speaker,
      text: cleanTranscription(response.text)
    });
  } catch (error) {
    if (isGeminiQuotaError(error)) {
      const retryAt = setGeminiQuotaLimit(error);
      res.status(429).json({
        code: "GEMINI_QUOTA_EXHAUSTED",
        error: "Gemini quota is exhausted, so backend transcription is paused.",
        retryAt
      });
      return;
    }

    console.error("Transcription failed:", error);
    res.status(500).json({
      error: "Gemini failed to transcribe this audio chunk."
    });
  }
});

app.post("/api/coach", async (req, res) => {
  if (!client) {
    res.status(503).json({
      error: "GEMINI_API_KEY is not set. Add it to your environment or .env file to enable the backend agent."
    });
    return;
  }

  const { partner, goal, tone, wakeWord, latestLine, latestSpeaker, transcript, coachingActive } = req.body || {};
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

  const localFallback = createLocalCoachSuggestion({
    goal,
    latestLine,
    latestSpeaker,
    transcript,
    coachingActive
  });

  const safetyIssue = findSafetyIssue([goal, latestLine, recentTranscript].join("\n"));
  if (safetyIssue) {
    res.json({
      phase: "Boundary",
      state: "Safety Boundary",
      shouldChimeIn: true,
      suggestion: safetyIssue,
      followUp: null
    });
    return;
  }

  const quotaLimit = getGeminiQuotaLimit();
  if (quotaLimit) {
    res.status(429).json({
      code: "GEMINI_QUOTA_EXHAUSTED",
      error: "Gemini free-tier quota is exhausted for this project/model. EarBud is using local fallback coaching until the quota resets.",
      retryAt: quotaLimit.retryAt,
      fallback: localFallback
    });
    return;
  }

  try {
    const response = await client.models.generateContent({
      model,
      contents: [
        `Conversation partner: ${partner || "unknown"}`,
        `User objective: ${goal || "move the conversation toward a clear next step"}`,
        "Speaker labels:",
        "- Me means the EarBud user.",
        "- Them means the conversation partner or other person.",
        `Desired tone: ${tone || "calm"}`,
        `Codeword: ${wakeWord || "earbud"}`,
        `Active coaching: ${Boolean(coachingActive)}`,
        "Recent transcript:",
        recentTranscript || "(no transcript yet)",
        "Latest transcript line:",
        `${getSpeakerLabel(latestSpeaker)}: ${latestLine}`,
        "Decide whether to chime in now. If useful, generate the next strategic move."
      ].join("\n\n"),
      config: {
        systemInstruction: [
          "You are EarBud, a private conversation coach.",
          "The user is in a live conversation and wants to complete a specific objective.",
          "Base suggestions primarily on the user's stated objective and the labeled transcript.",
          "Every suggestion must help Me move toward the user's objective or protect the objective from being harmed.",
          "Treat Me as the EarBud user who needs advice, and Them as the person the user is talking to.",
          "Suggest what Me should say or do next; do not give advice to Them.",
          "Use strategic awareness, positioning, negotiation, human-nature reading, execution, and focus.",
          "Do not quote or imitate any source text. Synthesize original practical advice.",
          "Only chime in when advice is useful; otherwise say to keep listening.",
          "Return structured JSON with keys: phase, state, shouldChimeIn, suggestion, followUp.",
          "state must be one of: Opening, Exploring, Objection, Reframe, Ask, Closing, Reached, Blocked, Listen, Boundary.",
          "shouldChimeIn must be a boolean.",
          "The suggestion must be one sentence, under 28 words, and easy to say out loud.",
          "The followUp value must be null unless there is a concrete next step to remember.",
          "Do not suggest deception, coercion, manipulation, harassment, or false claims.",
          "If the user's objective is unsafe, return state Boundary and redirect to honest, consent-aware communication."
        ].join("\n"),
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            phase: { type: Type.STRING },
            state: { type: Type.STRING },
            shouldChimeIn: { type: Type.BOOLEAN },
            suggestion: { type: Type.STRING },
            followUp: { type: Type.STRING, nullable: true }
          },
          required: ["phase", "state", "shouldChimeIn", "suggestion", "followUp"]
        }
      }
    });

    const payload = parseAgentJson(response.text);
    res.json(payload);
  } catch (error) {
    if (isGeminiQuotaError(error)) {
      const retryAt = setGeminiQuotaLimit(error);
      res.status(429).json({
        code: "GEMINI_QUOTA_EXHAUSTED",
        error: "Gemini free-tier quota is exhausted for this project/model. EarBud is using local fallback coaching until the quota resets.",
        retryAt,
        fallback: localFallback
      });
      return;
    }

    console.error("Agent request failed:", error);
    res.status(500).json({
      error: "The backend agent failed to generate a suggestion."
    });
  }
});

function findSafetyIssue(text) {
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

function createLocalCoachSuggestion({ goal, latestLine, latestSpeaker, transcript, coachingActive }) {
  if (!coachingActive) {
    return {
      phase: "Listening",
      state: "Listen",
      shouldChimeIn: false,
      suggestion: "Keep listening for the next useful opening.",
      followUp: null
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
      followUp: `Tie the next question back to: ${objective}`
    };
  }

  if (speaker === "Them" || recentThemLines.length > 0) {
    return {
      phase: "Guiding",
      state: "Ask",
      shouldChimeIn: true,
      suggestion: "Ask one calm question that connects their last point to your objective.",
      followUp: `Objective: ${objective}`
    };
  }

  return {
    phase: "Listening",
    state: "Listen",
    shouldChimeIn: false,
    suggestion: "Pause and listen for their real constraint before pushing the objective further.",
    followUp: null
  };
}

function getGeminiQuotaLimit() {
  if (Date.now() >= geminiQuotaLimitedUntil) {
    geminiQuotaLimitedUntil = 0;
    return null;
  }

  return {
    retryAt: new Date(geminiQuotaLimitedUntil).toISOString()
  };
}

function isGeminiQuotaError(error) {
  return error?.status === 429 || /RESOURCE_EXHAUSTED|quota|rate limit/i.test(String(error?.message || error));
}

function setGeminiQuotaLimit(error) {
  const retryMs = getGeminiRetryMs(error);
  geminiQuotaLimitedUntil = Date.now() + retryMs;
  const retryAt = new Date(geminiQuotaLimitedUntil).toISOString();
  console.warn(`Gemini quota exhausted. Pausing Gemini calls until ${retryAt}.`);
  return retryAt;
}

function getGeminiRetryMs(error) {
  const message = String(error?.message || "");
  const parsed = parseGeminiErrorMessage(message);
  const retryDelay = parsed?.error?.details?.find((detail) => detail["@type"]?.includes("RetryInfo"))?.retryDelay;
  const retryMs = parseRetryDelayMs(retryDelay);

  if (retryMs > 1000) return retryMs;

  const quotaIds = parsed?.error?.details
    ?.flatMap((detail) => detail.violations || [])
    ?.map((violation) => violation.quotaId || "")
    ?.join(" ");

  if (/PerDay|RequestsPerDay|RPD/i.test(quotaIds || message)) {
    return Math.max(60_000, getNextPacificMidnightMs() - Date.now());
  }

  return 60_000;
}

function parseGeminiErrorMessage(message) {
  const jsonStart = message.indexOf("{");
  if (jsonStart === -1) return null;

  try {
    return JSON.parse(message.slice(jsonStart));
  } catch {
    return null;
  }
}

function parseRetryDelayMs(value) {
  const match = String(value || "").match(/^(\d+(?:\.\d+)?)s$/);
  return match ? Math.round(Number(match[1]) * 1000) : 0;
}

function getNextPacificMidnightMs() {
  const now = new Date();
  const today = getPacificDateParts(now);
  const target = new Date(Date.UTC(Number(today.year), Number(today.month) - 1, Number(today.day) + 1, 8));
  const targetParts = getPacificDateParts(target);

  for (let offsetMinutes = -720; offsetMinutes <= 720; offsetMinutes += 15) {
    const candidate = new Date(target.getTime() + offsetMinutes * 60_000);
    const parts = getPacificDateParts(candidate);
    if (
      parts.year === targetParts.year &&
      parts.month === targetParts.month &&
      parts.day === targetParts.day &&
      parts.hour === "00" &&
      parts.minute === "00"
    ) {
      return candidate.getTime();
    }
  }

  return Date.now() + 24 * 60 * 60 * 1000;
}

function getPacificDateParts(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);

  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function cleanTranscription(text) {
  const value = String(text || "").trim();
  if (!value || /^```/.test(value)) return "";
  return value
    .replace(/^["']|["']$/g, "")
    .replace(/^(transcription|transcript)\s*:\s*/i, "")
    .trim();
}

function getSpeakerLabel(speaker) {
  if (speaker === "unknown") return "Unknown";
  if (speaker === "them") return "Them";
  if (speaker === "speaker_0") return "Speaker 0";
  if (speaker === "speaker_1") return "Speaker 1";
  return "Me";
}

function parseJsonMessage(message) {
  try {
    return JSON.parse(message.toString());
  } catch {
    return null;
  }
}

function parseAgentJson(text) {
  const fallback = {
    phase: "Guiding",
    state: "Listen",
    shouldChimeIn: false,
    suggestion: text?.trim() || "Stay quiet for now and keep listening for the next useful opening.",
    followUp: null
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
      followUp: typeof parsed.followUp === "string" && parsed.followUp.trim() ? parsed.followUp : null
    };
  } catch {
    return fallback;
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
  console.log(client ? `Gemini conversation coach enabled with ${model}` : "Gemini conversation coach disabled: GEMINI_API_KEY is not set.");
  console.log(assemblyAiApiKey
    ? `Streaming diarization: AssemblyAI ${process.env.ASSEMBLYAI_MODEL || "u3-rt-pro"} (speaker_labels enabled).`
    : "Streaming diarization disabled: set ASSEMBLYAI_API_KEY.");
});

