const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

const state = {
  active: false,
  paused: false,
  listening: false,
  coachingActive: false,
  requestingAgent: false,
  partner: "",
  goal: "",
  tone: "calm",
  wakeWord: "earbud",
  phase: "Setup",
  conversationState: "Setup",
  transcript: [],
  followUps: [],
  acceptedSuggestions: [],
  dismissedSuggestions: [],
  review: "End a session to generate a local review.",
  lastAction: "None",
  lastSuggestion: "Set an objective to begin.",
  currentSuggestion: "",
  recognition: null,
  shouldRestartRecognition: false,
  health: null,
  lastCoachRequestAt: 0,
  coachCooldownMs: 12000
};

const elements = {
  goalForm: document.querySelector("#goalForm"),
  partnerInput: document.querySelector("#partnerInput"),
  goalInput: document.querySelector("#goalInput"),
  toneInput: document.querySelector("#toneInput"),
  wakeWordInput: document.querySelector("#wakeWordInput"),
  backendStatus: document.querySelector("#backendStatus"),
  deviceState: document.querySelector("#deviceState"),
  phaseChip: document.querySelector("#phaseChip"),
  suggestionBox: document.querySelector("#suggestionBox"),
  conversationState: document.querySelector("#conversationState"),
  lastAction: document.querySelector("#lastAction"),
  pauseButton: document.querySelector("#pauseButton"),
  acceptButton: document.querySelector("#acceptButton"),
  dismissButton: document.querySelector("#dismissButton"),
  regenerateButton: document.querySelector("#regenerateButton"),
  endButton: document.querySelector("#endButton"),
  deleteButton: document.querySelector("#deleteButton"),
  manualTranscript: document.querySelector("#manualTranscript"),
  addLineButton: document.querySelector("#addLineButton"),
  transcriptList: document.querySelector("#transcriptList"),
  sessionStatus: document.querySelector("#sessionStatus"),
  reviewBox: document.querySelector("#reviewBox"),
  followupList: document.querySelector("#followupList")
};

function render() {
  elements.deviceState.textContent = state.listening
    ? "Listening"
    : SpeechRecognition
      ? "Mic standby"
      : "Typed mode";

  elements.phaseChip.textContent = state.requestingAgent
    ? "Thinking"
    : state.coachingActive
      ? "Coaching On"
      : state.phase;
  elements.suggestionBox.textContent = state.lastSuggestion;
  elements.conversationState.textContent = state.conversationState;
  elements.lastAction.textContent = state.lastAction;
  elements.reviewBox.textContent = state.review;
  elements.sessionStatus.textContent = state.active
    ? state.paused
      ? "Paused"
      : state.coachingActive
        ? "Coaching"
        : "Listening"
    : "Inactive";
  elements.sessionStatus.classList.toggle("active", state.active && !state.paused && state.coachingActive);

  elements.pauseButton.disabled = !state.active;
  elements.acceptButton.disabled = !state.active || !state.currentSuggestion || state.requestingAgent;
  elements.dismissButton.disabled = !state.active || !state.currentSuggestion || state.requestingAgent;
  elements.regenerateButton.disabled = !state.active || !state.coachingActive || state.requestingAgent || state.transcript.length === 0;
  elements.endButton.disabled = !state.active;
  elements.deleteButton.disabled = !state.active && state.transcript.length === 0 && state.followUps.length === 0 && !state.currentSuggestion;
  elements.addLineButton.disabled = !state.active || state.paused;
  elements.pauseButton.textContent = state.paused ? "Resume" : "Pause";
  renderBackendStatus();

  elements.transcriptList.innerHTML = "";
  state.transcript.forEach((line, index) => {
    const item = document.createElement("li");
    const meta = document.createElement("span");
    meta.className = "line-meta";
    meta.textContent = `Line ${index + 1} - ${line.time}${line.codeword ? " - codeword" : ""}`;
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
  elements.wakeWordInput.value = state.wakeWord;
  state.active = true;
  state.paused = false;
  state.coachingActive = false;
  state.phase = "Listening";
  state.conversationState = "Listening";
  state.transcript = [];
  state.followUps = [];
  state.acceptedSuggestions = [];
  state.dismissedSuggestions = [];
  state.review = "Session in progress. End the session to generate a local review.";
  state.lastAction = "Session started";
  state.currentSuggestion = "";
  state.lastCoachRequestAt = 0;
  state.lastSuggestion = `Listening locally. Say "${state.wakeWord}" to turn active coaching on. Say it again to turn coaching off.`;

  startContinuousListening();
  render();
}

function renderBackendStatus() {
  if (!state.health) {
    elements.backendStatus.textContent = "Checking backend...";
    return;
  }

  elements.backendStatus.textContent = state.health.agentReady
    ? `coach ready with ${state.health.model}`
    : "coach needs OPENAI_API_KEY for model suggestions";
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

function normalizeWakeWord(value) {
  const cleanValue = String(value || "").trim().toLowerCase();
  return cleanValue || "earbud";
}

function addTranscriptLine(text) {
  const cleanText = text.trim();
  if (!cleanText || !state.active || state.paused) return;

  const codeword = containsWakeWord(cleanText);
  const line = {
    text: cleanText,
    time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    codeword
  };

  state.transcript.push(line);

  if (codeword) {
    toggleCoaching();
    return;
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
}

function containsWakeWord(text) {
  return text.toLowerCase().includes(state.wakeWord.toLowerCase());
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
        tone: state.tone,
        wakeWord: state.wakeWord,
        latestLine: line.text,
        transcript: state.transcript,
        coachingActive: state.coachingActive
      })
    });

    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "Agent request failed.");
    }

    state.phase = payload.phase || "Guiding";
    state.conversationState = payload.state || payload.phase || "Guiding";
    state.lastSuggestion = payload.suggestion || "Stay quiet for now and keep listening for the next useful opening.";
    state.currentSuggestion = payload.shouldChimeIn === false ? "" : state.lastSuggestion;
    state.lastAction = payload.shouldChimeIn === false ? "Coach stayed quiet" : "Coach suggested a move";
    addFollowUp(payload.followUp);
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

function addFollowUp(text) {
  if (typeof text === "string" && text.trim() && !state.followUps.includes(text.trim())) {
    state.followUps.push(text.trim());
  }
}

function acceptSuggestion() {
  if (!state.currentSuggestion) return;

  state.acceptedSuggestions.push({
    text: state.currentSuggestion,
    time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    state: state.conversationState
  });
  state.lastAction = "Suggestion accepted";
  addFollowUp(`Use accepted move: ${state.currentSuggestion}`);
  render();
}

function dismissSuggestion() {
  if (!state.currentSuggestion) return;

  state.dismissedSuggestions.push({
    text: state.currentSuggestion,
    time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    state: state.conversationState
  });
  state.currentSuggestion = "";
  state.lastSuggestion = "Suggestion dismissed. I will keep listening for a better opening.";
  state.lastAction = "Suggestion dismissed";
  render();
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
  } else {
    state.conversationState = "Listening";
    state.lastAction = "Resumed";
    state.lastSuggestion = `Session resumed. Say "${state.wakeWord}" to toggle active coaching.`;
    startContinuousListening();
  }
  render();
}

function regenerateSuggestion() {
  const latest = state.transcript[state.transcript.length - 1];
  if (!latest) return;
  requestAgentSuggestion(latest);
}

function endSession() {
  stopAllListening();
  state.active = false;
  state.paused = false;
  state.listening = false;
  state.coachingActive = false;
  state.phase = "Review";
  state.conversationState = "Review";
  state.currentSuggestion = "";
  if (state.transcript.length > 0) {
    addFollowUp(`Review whether the conversation with ${state.partner} achieved: ${state.goal}`);
  }
  state.review = generateLocalReview();
  state.lastAction = "Session ended";
  state.lastSuggestion = "Session ended. Review follow-ups, then delete local session data when finished.";
  render();
}

function generateLocalReview() {
  const lines = state.transcript.filter((line) => !line.codeword).length;
  const accepted = state.acceptedSuggestions.length;
  const dismissed = state.dismissedSuggestions.length;
  const followUps = state.followUps.length;

  return [
    `Objective: ${state.goal}`,
    `Partner: ${state.partner}`,
    `Transcript lines: ${lines}`,
    `Accepted suggestions: ${accepted}`,
    `Dismissed suggestions: ${dismissed}`,
    `Follow-ups captured: ${followUps}`,
    accepted > 0
      ? `Most recent accepted move: ${state.acceptedSuggestions[accepted - 1].text}`
      : "No suggestions were accepted in this session."
  ].join("\n");
}

function deleteSessionData() {
  stopAllListening();
  state.active = false;
  state.paused = false;
  state.coachingActive = false;
  state.requestingAgent = false;
  state.partner = "";
  state.goal = "";
  elements.partnerInput.value = "";
  elements.goalInput.value = "";
  state.phase = "Setup";
  state.conversationState = "Setup";
  state.transcript = [];
  state.followUps = [];
  state.acceptedSuggestions = [];
  state.dismissedSuggestions = [];
  state.review = "Local session data deleted.";
  state.lastAction = "Deleted";
  state.lastSuggestion = "Local session data deleted. Set a new objective to begin.";
  state.currentSuggestion = "";
  state.lastCoachRequestAt = 0;
  render();
}

function stopAllListening() {
  stopContinuousListening();
  state.listening = false;
}

elements.goalForm.addEventListener("submit", startSession);
elements.addLineButton.addEventListener("click", () => {
  addTranscriptLine(elements.manualTranscript.value);
  elements.manualTranscript.value = "";
});
elements.pauseButton.addEventListener("click", togglePause);
elements.acceptButton.addEventListener("click", acceptSuggestion);
elements.dismissButton.addEventListener("click", dismissSuggestion);
elements.regenerateButton.addEventListener("click", regenerateSuggestion);
elements.endButton.addEventListener("click", endSession);
elements.deleteButton.addEventListener("click", deleteSessionData);

setupRecognition();
fetchHealth();
render();
