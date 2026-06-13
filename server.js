import "dotenv/config";
import express from "express";
import OpenAI from "openai";

const app = express();
const port = Number(process.env.PORT || 3000);
const model = process.env.OPENAI_MODEL || "gpt-5.5";
const client = process.env.OPENAI_API_KEY ? new OpenAI() : null;

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
      error: "OPENAI_API_KEY is not set. Add it to your environment or .env file to enable the backend agent."
    });
    return;
  }

  const { partner, goal, tone, wakeWord, latestLine, transcript } = req.body || {};
  const recentTranscript = Array.isArray(transcript)
    ? transcript.slice(-16).map((line) => `${line.time || "unknown"}: ${line.text || ""}`).join("\n")
    : "";

  if (!latestLine || typeof latestLine !== "string") {
    res.status(400).json({ error: "latestLine is required." });
    return;
  }

  try {
    const response = await client.responses.create({
      model,
      reasoning: { effort: "low" },
      instructions: [
        "You are EarBud, a private in-ear conversation coach.",
        "The user is in a live conversation and wants a short, immediately useful next move.",
        "Return only valid JSON with keys: phase, suggestion, followUp.",
        "The suggestion must be one sentence, under 28 words, and easy to say out loud.",
        "The followUp value must be null unless there is a concrete task to remember.",
        "Do not suggest deception, coercion, manipulation, harassment, or false claims.",
        "Prefer honest, respectful, consent-aware communication."
      ].join("\n"),
      input: [
        `Conversation partner: ${partner || "unknown"}`,
        `User goal: ${goal || "move the conversation toward a clear next step"}`,
        `Desired tone: ${tone || "calm"}`,
        `Wake word: ${wakeWord || "earbud"}`,
        "Recent transcript:",
        recentTranscript || "(no transcript yet)",
        "Latest wake-word request:",
        latestLine,
        "Generate the next coaching suggestion now."
      ].join("\n\n")
    });

    const payload = parseAgentJson(response.output_text);
    res.json(payload);
  } catch (error) {
    console.error("Agent request failed:", error);
    res.status(500).json({
      error: "The backend agent failed to generate a suggestion."
    });
  }
});

function parseAgentJson(text) {
  const fallback = {
    phase: "Guiding",
    suggestion: text?.trim() || "Ask one clear question that moves the conversation toward your goal.",
    followUp: null
  };

  if (!text) return fallback;

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return fallback;

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      phase: typeof parsed.phase === "string" ? parsed.phase : fallback.phase,
      suggestion: typeof parsed.suggestion === "string" ? parsed.suggestion : fallback.suggestion,
      followUp: typeof parsed.followUp === "string" && parsed.followUp.trim() ? parsed.followUp : null
    };
  } catch {
    return fallback;
  }
}

app.listen(port, () => {
  console.log(`EarBud running at http://localhost:${port}`);
  console.log(client ? `Backend agent enabled with ${model}` : "Backend agent disabled: OPENAI_API_KEY is not set.");
});
