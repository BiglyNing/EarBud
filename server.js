import "dotenv/config";
import express from "express";
import { GoogleGenAI, Type } from "@google/genai";

const app = express();
const port = Number(process.env.PORT || 3000);
const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const client = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;

app.use(express.json({ limit: "1mb" }));
app.use(express.static("."));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    agentReady: Boolean(client),
    model
  });
});

app.post("/api/coach", async (req, res) => {
  if (!client) {
    res.status(503).json({
      error: "GEMINI_API_KEY is not set. Add it to your environment or .env file to enable the backend agent."
    });
    return;
  }

  const { partner, goal, tone, wakeWord, latestLine, transcript, coachingActive } = req.body || {};
  const recentTranscript = Array.isArray(transcript)
    ? transcript.slice(-16).map((line) => `${line.time || "unknown"}: ${line.text || ""}`).join("\n")
    : "";

  if (!latestLine || typeof latestLine !== "string") {
    res.status(400).json({ error: "latestLine is required." });
    return;
  }

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

  try {
    const response = await client.models.generateContent({
      model,
      contents: [
        `Conversation partner: ${partner || "unknown"}`,
        `User objective: ${goal || "move the conversation toward a clear next step"}`,
        `Desired tone: ${tone || "calm"}`,
        `Codeword: ${wakeWord || "earbud"}`,
        `Active coaching: ${Boolean(coachingActive)}`,
        "Recent transcript:",
        recentTranscript || "(no transcript yet)",
        "Latest transcript line:",
        latestLine,
        "Decide whether to chime in now. If useful, generate the next strategic move."
      ].join("\n\n"),
      config: {
        systemInstruction: [
          "You are EarBud, a private conversation coach.",
          "The user is in a live conversation and wants to complete a specific objective.",
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

app.listen(port, () => {
  console.log(`EarBud running at http://localhost:${port}`);
  console.log(client ? `Gemini conversation coach enabled with ${model}` : "Gemini conversation coach disabled: GEMINI_API_KEY is not set.");
});
