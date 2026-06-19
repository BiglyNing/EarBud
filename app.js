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

const state = {
  active: false,
  paused: false,
  listening: false,
  coachingActive: false,
  requestingAgent: false,
  partner: "",
  goal: "",
  tone: "calm",
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
  acceptedSuggestions: [],
  dismissedSuggestions: [],
  review: "End a session to generate a local review.",
  lastAction: "None",
  lastSuggestion: "Start a session, then say your objective out loud.",
  currentSuggestion: "",
  lastLens: "None",
  awaitingObjective: false,
  spokenSuggestions: true,
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
  toneInput: document.querySelector("#toneInput"),
  wakeWordInput: document.querySelector("#wakeWordInput"),
  coachModelInput: document.querySelector("#coachModelInput"),
  coachSpeedInput: document.querySelector("#coachSpeedInput"),
  speakerModeInput: document.querySelector("#speakerModeInput"),
  speakerModeStatus: document.querySelector("#speakerModeStatus"),
  backendStatus: document.querySelector("#backendStatus"),
  deviceState: document.querySelector("#deviceState"),
  phaseChip: document.querySelector("#phaseChip"),
  suggestionBox: document.querySelector("#suggestionBox"),
  conversationState: document.querySelector("#conversationState"),
  coachLens: document.querySelector("#coachLens"),
  lastAction: document.querySelector("#lastAction"),
  pauseButton: document.querySelector("#pauseButton"),
  acceptButton: document.querySelector("#acceptButton"),
  dismissButton: document.querySelector("#dismissButton"),
  regenerateButton: document.querySelector("#regenerateButton"),
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
  voiceStatus: document.querySelector("#voiceStatus"),
  spokenSuggestionsInput: document.querySelector("#spokenSuggestionsInput"),
  speechFrequencyInput: document.querySelector("#speechFrequencyInput"),
  speechVolumeInput: document.querySelector("#speechVolumeInput"),
  speechRateInput: document.querySelector("#speechRateInput"),
  testVoiceButton: document.querySelector("#testVoiceButton"),
  stopVoiceButton: document.querySelector("#stopVoiceButton"),
  bud: document.querySelector("#bud")
};

let lastCuedSuggestion = "";

// Play Bud's "lens glint" once when a fresh suggestion appears. Purely cosmetic
// and fully guarded, so it never affects coaching if the mascot isn't present.
function triggerBudCue(suggestion) {
  const bud = elements.bud;
  if (!bud) return;
  if (suggestion && suggestion !== lastCuedSuggestion) {
    bud.classList.remove("bud--cue");
    void bud.getBoundingClientRect(); // force reflow so the animation restarts
    bud.classList.add("bud--cue");
  }
  lastCuedSuggestion = suggestion || "";
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

  elements.phaseChip.textContent = state.requestingAgent
    ? "Thinking"
    : state.coachingActive
      ? "Coaching On"
      : state.phase;
  elements.suggestionBox.textContent = state.lastSuggestion;
  triggerBudCue(state.lastSuggestion);
  if (elements.bud) {
    elements.bud.classList.toggle("bud--speaking", Boolean(state.speechSpeaking));
  }
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
  elements.acceptButton.disabled = !state.active || !state.currentSuggestion || state.requestingAgent;
  elements.dismissButton.disabled = !state.active || !state.currentSuggestion || state.requestingAgent;
  elements.regenerateButton.disabled = !state.active || !state.coachingActive || state.requestingAgent || state.transcript.length === 0;
  elements.endButton.disabled = !state.active;
  elements.deleteButton.disabled = !state.active && state.transcript.length === 0 && state.followUps.length === 0 && !state.currentSuggestion;
  elements.addLineButton.disabled = !state.active || state.paused;
  elements.pauseButton.textContent = state.paused ? "Resume" : "Pause";
  renderSpeakerModeStatus();
  renderVoiceControls();
  renderSwapControl();
  renderBackendStatus();

  elements.transcriptList.innerHTML = "";
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
  elements.voiceStatus.textContent = !supported
    ? "Unavailable"
    : state.speechSpeaking
      ? "Speaking"
      : state.spokenSuggestions
        ? "On"
        : "Off";
  elements.voiceStatus.classList.toggle("active", supported && state.spokenSuggestions);
}

function startSession(event) {
  event.preventDefault();

  state.partner = "this person";
  state.goal = "";
  state.awaitingObjective = true;
  state.tone = elements.toneInput.value;
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
  state.liveTranscript = "Listening for your objective — say it out loud now.";
  state.followUps = [];
  state.acceptedSuggestions = [];
  state.dismissedSuggestions = [];
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
  state.lastSuggestion = `Say your objective out loud — your first words set the goal (at least 20 words helps one-mic speaker detection lock onto your voice). Then say "${state.wakeWord}" to turn active coaching on.`;

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
      ? "Listening for your objective — say it out loud now. Aim for at least 20 words so one-mic speaker detection can calibrate to your voice."
      : "Listening for your objective — say it out loud now. Aim for at least 20 words to give the coach clear context.";
  } else {
    value.textContent = "Start your session, then say your objective out loud. Tell Bud who you are talking to, what you want from the conversation, and any other context. Your first words become the objective so aim for at least 20 words.";
  }
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
      state.lastSuggestion = payload.error || `${providerName} streaming diarization failed.`;
      render();
      return;
    }

    if (payload.type === "closed") {
      const reason = payload.reason ? `: ${payload.reason}` : "";
      state.lastSuggestion = `${providerName} stream closed (${payload.code || "unknown"})${reason}`;
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

function findDuplicateStreamingLine(segment) {
  const textKey = normalizeTranscriptFingerprint(segment.text);
  if (!textKey) return null;
  const now = performance.now();
  state.streamingFinalHistory = state.streamingFinalHistory.filter((entry) => now - entry.seenAt < 20_000);

  return state.streamingFinalHistory.find((entry) => {
    if (entry.textKey !== textKey) return false;
    if (Number.isFinite(segment.start) && Number.isFinite(segment.end) && Number.isFinite(entry.start) && Number.isFinite(entry.end)) {
      return rangesOverlap(segment.start, segment.end, entry.start, entry.end, 0.8);
    }
    return now - entry.seenAt < 4_000;
  }) || null;
}

function rememberStreamingFinal(segment, line) {
  state.streamingFinalHistory.push({
    textKey: normalizeTranscriptFingerprint(segment.text),
    start: Number.isFinite(segment.start) ? segment.start : null,
    end: Number.isFinite(segment.end) ? segment.end : null,
    speaker: line.speaker,
    cluster: line.cluster,
    line,
    seenAt: performance.now()
  });
  state.streamingFinalHistory = state.streamingFinalHistory.slice(-24);
}

function normalizeTranscriptFingerprint(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function rangesOverlap(startA, endA, startB, endB, tolerance = 0) {
  return Math.max(startA, startB) <= Math.min(endA, endB) + tolerance;
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
        tone: state.tone,
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

function createLocalCoachPayload(line) {
  const speaker = normalizeSpeaker(line.speaker);
  const text = String(line.text || "").toLowerCase();

  if (/\b(no|can't|cannot|won't|not|never|problem|concern|issue|but|however|too much|too expensive|busy)\b/.test(text)) {
    return {
      phase: "Reframe",
      state: "Objection",
      shouldChimeIn: true,
      suggestion: "Label the concern, then ask what condition would make progress possible.",
      followUp: `Tie the next question back to: ${state.goal || "your objective"}`,
      lens: "Never Split the Difference"
    };
  }

  if (speaker === "them") {
    return {
      phase: "Guiding",
      state: "Ask",
      shouldChimeIn: true,
      suggestion: "Ask one calm question that connects their last point to your objective.",
      followUp: `Objective: ${state.goal || "move the conversation forward"}`,
      lens: "Never Split the Difference"
    };
  }

  return {
    phase: "Listening",
    state: "Listen",
    shouldChimeIn: false,
    suggestion: "Pause and listen for their real constraint before pushing the objective further.",
    followUp: null,
    lens: "Deep Work"
  };
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

function speakText(text) {
  if (!SpeechSynthesisUtterance || !speechSynthesis || !text) return;
  if (state.lastSpokenSuggestion === text && speechSynthesis.speaking) return;

  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
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

function updateSpeechSettings() {
  state.speechFrequency = elements.speechFrequencyInput.value;
  state.speechVolume = Number(elements.speechVolumeInput.value);
  state.speechRate = Number(elements.speechRateInput.value);
  render();
}

function testVoice() {
  speakText("Spoken suggestions are ready.");
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

function regenerateSuggestion() {
  const latest = state.transcript[state.transcript.length - 1];
  if (!latest) return;
  requestAgentSuggestion(latest);
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
  state.acceptedSuggestions = [];
  state.dismissedSuggestions = [];
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
if (elements.swapSpeakerButton) {
  elements.swapSpeakerButton.addEventListener("click", swapMeThem);
}
elements.pauseButton.addEventListener("click", togglePause);
elements.acceptButton.addEventListener("click", acceptSuggestion);
elements.dismissButton.addEventListener("click", dismissSuggestion);
elements.regenerateButton.addEventListener("click", regenerateSuggestion);
elements.endButton.addEventListener("click", endSession);
elements.deleteButton.addEventListener("click", deleteSessionData);
elements.spokenSuggestionsInput.addEventListener("change", toggleSpokenSuggestions);
elements.speechFrequencyInput.addEventListener("change", updateSpeechSettings);
elements.speechVolumeInput.addEventListener("input", updateSpeechSettings);
elements.speechRateInput.addEventListener("input", updateSpeechSettings);
elements.testVoiceButton.addEventListener("click", testVoice);
elements.stopVoiceButton.addEventListener("click", stopSpeaking);

setupRecognition();
fetchHealth();
render();
