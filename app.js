const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

const state = {
  active: false,
  paused: false,
  listening: false,
  requestingAgent: false,
  partner: "",
  goal: "",
  tone: "calm",
  wakeWord: "earbud",
  transcriptionMode: "browser",
  phase: "Setup",
  transcript: [],
  followUps: [],
  lastSuggestion: "Set a goal to begin.",
  recognition: null,
  shouldRestartRecognition: false,
  mediaStream: null,
  mediaRecorder: null,
  transcribingAudio: false,
  pendingAudioChunks: 0,
  health: null
};

const elements = {
  goalForm: document.querySelector("#goalForm"),
  partnerInput: document.querySelector("#partnerInput"),
  goalInput: document.querySelector("#goalInput"),
  toneInput: document.querySelector("#toneInput"),
  wakeWordInput: document.querySelector("#wakeWordInput"),
  transcriptionModeInput: document.querySelector("#transcriptionModeInput"),
  backendStatus: document.querySelector("#backendStatus"),
  deviceState: document.querySelector("#deviceState"),
  phaseChip: document.querySelector("#phaseChip"),
  suggestionBox: document.querySelector("#suggestionBox"),
  pauseButton: document.querySelector("#pauseButton"),
  regenerateButton: document.querySelector("#regenerateButton"),
  endButton: document.querySelector("#endButton"),
  manualTranscript: document.querySelector("#manualTranscript"),
  addLineButton: document.querySelector("#addLineButton"),
  transcriptList: document.querySelector("#transcriptList"),
  sessionStatus: document.querySelector("#sessionStatus"),
  followupList: document.querySelector("#followupList")
};

function render() {
  elements.deviceState.textContent = state.listening
    ? state.transcriptionMode === "backend"
      ? "Recording chunks"
      : "Always listening"
    : state.transcriptionMode === "backend"
      ? "Backend STT"
      : SpeechRecognition
        ? "Mic standby"
        : "Typed mode";

  elements.phaseChip.textContent = state.requestingAgent
    ? "Thinking"
    : state.transcribingAudio
      ? "Transcribing"
      : state.phase;
  elements.suggestionBox.textContent = state.lastSuggestion;
  elements.sessionStatus.textContent = state.active ? (state.paused ? "Paused" : "Active") : "Inactive";
  elements.sessionStatus.classList.toggle("active", state.active && !state.paused);

  elements.pauseButton.disabled = !state.active;
  elements.regenerateButton.disabled = !state.active || state.requestingAgent || !findLastWakeLine();
  elements.endButton.disabled = !state.active;
  elements.addLineButton.disabled = !state.active || state.paused;
  elements.pauseButton.textContent = state.paused ? "Resume" : "Pause";
  renderBackendStatus();

  elements.transcriptList.innerHTML = "";
  state.transcript.forEach((line, index) => {
    const item = document.createElement("li");
    const meta = document.createElement("span");
    meta.className = "line-meta";
    meta.textContent = `Line ${index + 1} - ${line.time}${line.triggeredAgent ? " - agent asked" : ""}`;
    item.append(meta, document.createTextNode(line.text));
    elements.transcriptList.appendChild(item);
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

function startSession(event) {
  event.preventDefault();

  state.partner = elements.partnerInput.value.trim() || "this person";
  state.goal = elements.goalInput.value.trim() || "move the conversation toward a clear next step";
  state.tone = elements.toneInput.value;
  state.wakeWord = normalizeWakeWord(elements.wakeWordInput.value);
  state.transcriptionMode = elements.transcriptionModeInput.value;
  if (state.transcriptionMode === "backend" && state.health && !state.health.transcriptionReady) {
    state.transcriptionMode = "browser";
    elements.transcriptionModeInput.value = "browser";
    state.lastSuggestion = "Backend transcription needs OPENAI_API_KEY. Falling back to browser speech recognition.";
  }
  elements.wakeWordInput.value = state.wakeWord;
  state.active = true;
  state.paused = false;
  state.phase = "Listening";
  state.transcript = [];
  state.followUps = [];
  if (!state.lastSuggestion.includes("OPENAI_API_KEY")) {
    state.lastSuggestion = `Listening continuously. Say "${state.wakeWord}" when you want the agent to suggest what to say.`;
  }

  startListeningForMode();
  render();
}

function renderBackendStatus() {
  if (!state.health) {
    elements.backendStatus.textContent = "Checking backend...";
    return;
  }

  const agentStatus = state.health.agentReady ? "agent ready" : "agent needs API key";
  const transcriptionStatus = state.health.transcriptionReady ? "backend transcription ready" : "backend transcription needs API key";
  elements.backendStatus.textContent = `${agentStatus}; ${transcriptionStatus}.`;
}

async function fetchHealth() {
  try {
    const response = await fetch("/api/health");
    state.health = await response.json();
  } catch {
    state.health = {
      ok: false,
      agentReady: false,
      transcriptionReady: false
    };
  } finally {
    render();
  }
}

function normalizeWakeWord(value) {
  const cleanValue = String(value || "").trim().toLowerCase();
  return cleanValue || "earbud";
}

function addTranscriptLine(text) {
  const cleanText = text.trim();
  if (!cleanText || !state.active || state.paused) return;

  const triggeredAgent = containsWakeWord(cleanText);
  const line = {
    text: cleanText,
    time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    triggeredAgent
  };

  state.transcript.push(line);

  if (triggeredAgent) {
    requestAgentSuggestion(line);
  } else {
    state.phase = "Listening";
    state.lastSuggestion = `Heard and saved. I will stay quiet until you say "${state.wakeWord}".`;
  }

  render();
}

function startListeningForMode() {
  if (state.transcriptionMode === "backend") {
    startBackendRecording();
    return;
  }

  startContinuousListening();
}

function containsWakeWord(text) {
  return text.toLowerCase().includes(state.wakeWord.toLowerCase());
}

async function requestAgentSuggestion(line) {
  state.requestingAgent = true;
  state.phase = "Agent Asked";
  state.lastSuggestion = "Agent is thinking...";
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
        tone: state.tone,
        wakeWord: state.wakeWord,
        latestLine: line.text,
        transcript: state.transcript
      })
    });

    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "Agent request failed.");
    }

    state.phase = payload.phase || "Guiding";
    state.lastSuggestion = payload.suggestion || "Ask one clear question that moves the conversation toward your goal.";
    addFollowUp(payload.followUp);
  } catch (error) {
    state.phase = "Agent Offline";
    state.lastSuggestion = error.message || "The backend agent is unavailable.";
  } finally {
    state.requestingAgent = false;
    render();
  }
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
    render();
  };

  state.recognition.onresult = (event) => {
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      if (result.isFinal) {
        finalText += `${result[0].transcript} `;
      }
    }

    const cleanFinal = finalText.trim();
    if (cleanFinal) {
      finalText = "";
      addTranscriptLine(cleanFinal);
    }
  };

  state.recognition.onerror = () => {
    state.listening = false;
    if (state.active && !state.paused) {
      state.lastSuggestion = "Speech recognition paused. Typed transcript input still works.";
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

async function startBackendRecording() {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    state.lastSuggestion = "Backend transcription needs microphone recording support. Use browser speech recognition or typed input.";
    render();
    return;
  }

  if (state.mediaRecorder?.state === "recording") return;

  try {
    state.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const options = getRecorderOptions();
    state.mediaRecorder = new MediaRecorder(state.mediaStream, options);

    state.mediaRecorder.onstart = () => {
      state.listening = true;
      render();
    };

  state.mediaRecorder.ondataavailable = (event) => {
      if (event.data?.size > 0 && state.active && !state.paused) {
        sendAudioChunk(event.data);
      }
    };

    state.mediaRecorder.onerror = () => {
      state.lastSuggestion = "Audio recording failed. Typed transcript input still works.";
      state.listening = false;
      render();
    };

    state.mediaRecorder.onstop = () => {
      state.listening = false;
      render();
    };

    state.mediaRecorder.start(5000);
  } catch {
    state.lastSuggestion = "Microphone access was not available. Use typed transcript input to keep testing.";
    state.listening = false;
    render();
  }
}

function getRecorderOptions() {
  const supportedTypes = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4"
  ];
  const mimeType = supportedTypes.find((type) => MediaRecorder.isTypeSupported(type));
  return mimeType ? { mimeType } : undefined;
}

async function sendAudioChunk(blob) {
  state.pendingAudioChunks += 1;
  state.transcribingAudio = true;
  render();

  try {
    const extension = blob.type.includes("mp4") ? "mp4" : "webm";
    const formData = new FormData();
    formData.append("audio", blob, `chunk.${extension}`);

    const response = await fetch("/api/transcribe", {
      method: "POST",
      body: formData
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "Transcription failed.");
    }

    if (payload.text?.trim()) {
      addTranscriptLine(payload.text);
    }
  } catch (error) {
    state.phase = "Transcription Offline";
    state.lastSuggestion = error.message || "Backend transcription is unavailable.";
  } finally {
    state.pendingAudioChunks = Math.max(0, state.pendingAudioChunks - 1);
    state.transcribingAudio = state.pendingAudioChunks > 0;
    render();
  }
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
    state.lastSuggestion = "Session paused.";
  } else {
    state.lastSuggestion = `Session resumed. Listening continuously for "${state.wakeWord}".`;
    startListeningForMode();
  }
  render();
}

function regenerateSuggestion() {
  const latest = findLastWakeLine();
  if (!latest) return;
  requestAgentSuggestion(latest);
}

function findLastWakeLine() {
  return [...state.transcript].reverse().find((line) => line.triggeredAgent);
}

function endSession() {
  stopAllListening();
  state.active = false;
  state.paused = false;
  state.listening = false;
  state.phase = "Review";
  if (state.transcript.length > 0) {
    addFollowUp(`Review whether the conversation with ${state.partner} achieved: ${state.goal}`);
  }
  state.lastSuggestion = "Session ended. Review follow-ups before saving anything long term.";
  render();
}

function stopAllListening() {
  stopContinuousListening();
  stopBackendRecording();
}

function stopBackendRecording() {
  if (state.mediaRecorder?.state === "recording") {
    state.mediaRecorder.stop();
  }

  if (state.mediaStream) {
    state.mediaStream.getTracks().forEach((track) => track.stop());
  }

  state.mediaRecorder = null;
  state.mediaStream = null;
  state.listening = false;
}

elements.goalForm.addEventListener("submit", startSession);
elements.addLineButton.addEventListener("click", () => {
  addTranscriptLine(elements.manualTranscript.value);
  elements.manualTranscript.value = "";
});
elements.pauseButton.addEventListener("click", togglePause);
elements.regenerateButton.addEventListener("click", regenerateSuggestion);
elements.endButton.addEventListener("click", endSession);

setupRecognition();
fetchHealth();
render();
