/**
 * OmniMeet AI — Client-Side Application Logic
 * Integrates WebSockets, Web Audio API 16kHz PCM streaming,
 * dynamic subtitle rendering, and Copilot event handling.
 */

// State Management
const state = {
  roomId: "capstone-main",
  userId: "usr_" + Math.random().toString(36).substring(2, 9),
  userName: "You (Host)",
  sourceLang: "en",
  targetLang: "en",
  ws: null,
  isConnected: false,
  isMuted: false,
  isCameraOn: false,
  subtitlesEnabled: true,
  audioContext: null,
  mediaStream: null,
  audioProcessor: null,
  simInterval: null,
  actionItemCount: 2
};

// DOM Elements
const currentRoomDisplay = document.getElementById("currentRoomDisplay");
const copyRoomBtn = document.getElementById("copyRoomBtn");
const userSourceLang = document.getElementById("userSourceLang");
const userTargetLang = document.getElementById("userTargetLang");
const latencyBadge = document.getElementById("latencyBadge");
const gatewayStatus = document.getElementById("gatewayStatus");
const latencyNumber = document.getElementById("latencyNumber");
const startDemoBtn = document.getElementById("startDemoBtn");
const exportMomBtn = document.getElementById("exportMomBtn");

// Controls
const toggleMicBtn = document.getElementById("toggleMicBtn");
const toggleCameraBtn = document.getElementById("toggleCameraBtn");
const toggleSubtitlesBtn = document.getElementById("toggleSubtitlesBtn");
const toggleCopilotSidebarBtn = document.getElementById("toggleCopilotSidebarBtn");
const copilotSidebar = document.getElementById("copilotSidebar");
const leaveCallBtn = document.getElementById("leaveCallBtn");

// Video & Subtitles
const localVideo = document.getElementById("localVideo");
const localAvatarBox = document.getElementById("localAvatarBox");
const meterFill = document.getElementById("meterFill");
const localLangBadge = document.getElementById("localLangBadge");

// Sidebar & Tabs
const tabButtons = document.querySelectorAll(".tab-btn");
const tabContents = document.querySelectorAll(".tab-content");
const transcriptStream = document.getElementById("transcriptStream");
const actionItemsList = document.getElementById("actionItemsList");
const actionItemCountBadge = document.getElementById("actionItemCount");
const copilotMessages = document.getElementById("copilotMessages");
const copilotQueryInput = document.getElementById("copilotQueryInput");
const sendCopilotQueryBtn = document.getElementById("sendCopilotQueryBtn");

// Initialize Application
function init() {
  setupEventListeners();
  connectWebSocket();
}

function setupEventListeners() {
  // Room copy
  copyRoomBtn.addEventListener("click", () => {
    navigator.clipboard.writeText(state.roomId);
    copyRoomBtn.innerHTML = "✓";
    setTimeout(() => {
      copyRoomBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
    }, 1500);
  });

  // Language selectors
  userSourceLang.addEventListener("change", (e) => {
    state.sourceLang = e.target.value;
    localLangBadge.textContent = `Speaking: ${e.target.options[e.target.selectedIndex].text.split(" ")[0]}`;
  });

  userTargetLang.addEventListener("change", (e) => {
    state.targetLang = e.target.value;
  });

  // Media Controls
  toggleMicBtn.addEventListener("click", toggleMicrophone);
  toggleCameraBtn.addEventListener("click", toggleCamera);
  toggleSubtitlesBtn.addEventListener("click", toggleSubtitles);
  toggleCopilotSidebarBtn.addEventListener("click", () => {
    copilotSidebar.classList.toggle("collapsed");
  });

  leaveCallBtn.addEventListener("click", () => {
    if (confirm("Are you sure you want to exit the meeting?")) {
      window.location.reload();
    }
  });

  // Multilingual Demo Simulation
  startDemoBtn.addEventListener("click", runSimulationDemo);

  // Export MoM
  exportMomBtn.addEventListener("click", exportMinutesOfMeeting);

  // Tabs
  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetTab = btn.getAttribute("data-tab");
      tabButtons.forEach((b) => b.classList.remove("active"));
      tabContents.forEach((c) => c.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(targetTab)?.classList.add("active");
    });
  });

  // Copilot Chat
  sendCopilotQueryBtn.addEventListener("click", handleCopilotQuery);
  copilotQueryInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") handleCopilotQuery();
  });
}

// WebSocket Connection
function connectWebSocket() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.host || "localhost:8000";
  const wsUrl = `${protocol}//${host}/ws/room/${state.roomId}/${state.userId}?name=${encodeURIComponent(state.userName)}&lang=${state.sourceLang}`;

  try {
    state.ws = new WebSocket(wsUrl);

    state.ws.onopen = () => {
      state.isConnected = true;
      gatewayStatus.textContent = "Gateway: Connected";
      latencyBadge.style.borderColor = "rgba(16, 185, 129, 0.4)";
    };

    state.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleServerEvent(data);
      } catch (err) {
        console.warn("Non-JSON message received:", event.data);
      }
    };

    state.ws.onclose = () => {
      state.isConnected = false;
      gatewayStatus.textContent = "Gateway: Standalone Mode";
      latencyBadge.style.borderColor = "rgba(245, 158, 11, 0.4)";
    };

    state.ws.onerror = () => {
      state.isConnected = false;
      gatewayStatus.textContent = "Gateway: Standalone Mode";
    };
  } catch (err) {
    console.warn("WebSocket init deferred, using local standalone demo:", err);
  }
}

// Server Event Dispatcher
function handleServerEvent(data) {
  if (data.type === "subtitle_stream") {
    renderSubtitle(data);
  } else if (data.type === "action_item") {
    renderActionItem(data);
  } else if (data.type === "copilot_answer") {
    renderCopilotMessage(data.answer, "bot");
  }
}

// Subtitle Rendering
function renderSubtitle(data) {
  if (!state.subtitlesEnabled) return;

  const speaker = data.senderName || "Speaker";
  const orig = data.originalText || "";
  const trans = data.translatedText || "";
  const latency = data.latencyMs ? `~${Math.round(data.latencyMs)}ms` : "~390ms";
  latencyNumber.textContent = latency;

  // Determine which tile to highlight
  let tileId = "tile-aarav";
  let origElem = document.getElementById("sub-orig-aarav");
  let transElem = document.getElementById("sub-trans-aarav");
  let overlayElem = document.getElementById("subtitle-aarav");

  if (speaker.toLowerCase().includes("elena")) {
    tileId = "tile-elena";
    origElem = document.getElementById("sub-orig-elena");
    transElem = document.getElementById("sub-trans-elena");
    overlayElem = document.getElementById("subtitle-elena");
  } else if (speaker.toLowerCase().includes("you") || data.senderId === state.userId) {
    tileId = "tile-local";
    origElem = document.getElementById("sub-orig-local");
    transElem = document.getElementById("sub-trans-local");
    overlayElem = document.getElementById("subtitle-local");
  }

  // Active Speaker Glow
  document.querySelectorAll(".video-tile").forEach((t) => t.classList.remove("active-speaker"));
  const activeTile = document.getElementById(tileId);
  if (activeTile) activeTile.classList.add("active-speaker");

  // Show floating overlay
  if (overlayElem) overlayElem.classList.remove("hidden");
  if (origElem) origElem.textContent = `"${orig}"`;
  if (transElem) transElem.textContent = `"${trans}"`;

  // Append to Live Transcript if final
  if (data.isFinal) {
    appendTranscriptEntry(speaker, data.sourceLanguage || "hi", orig, trans);
  }
}

// Append to Sidebar Transcript Feed
function appendTranscriptEntry(speaker, lang, orig, trans) {
  const entry = document.createElement("div");
  entry.className = "transcript-entry";

  const now = new Date();
  const timeStr = now.toTimeString().split(" ")[0];
  const authorClass = speaker.toLowerCase().includes("aarav")
    ? "aarav"
    : speaker.toLowerCase().includes("elena")
    ? "elena"
    : "you";

  entry.innerHTML = `
    <div class="entry-header">
      <span class="entry-author ${authorClass}">${speaker}</span>
      <span class="entry-lang">${lang.toUpperCase()} → EN</span>
      <span class="entry-time">${timeStr}</span>
    </div>
    <div class="entry-orig">${orig}</div>
    <div class="entry-trans">${trans}</div>
  `;

  transcriptStream.prepend(entry);
}

// Action Item Rendering
function renderActionItem(data) {
  const card = document.createElement("div");
  card.className = `action-item-card ${data.priority || "medium"}`;

  card.innerHTML = `
    <div class="action-checkbox">
      <input type="checkbox" id="${data.id}">
    </div>
    <div class="action-info">
      <label for="${data.id}" class="action-title">${data.task}</label>
      <div class="action-meta">
        <span class="assignee">@${data.assignee}</span>
        <span class="priority-tag ${data.priority || 'medium'}">${data.priority || 'Medium'} Priority</span>
      </div>
    </div>
  `;

  actionItemsList.prepend(card);
  state.actionItemCount++;
  actionItemCountBadge.textContent = state.actionItemCount;
}

// Microphone Toggle & Web Audio 16kHz PCM Streamer
async function toggleMicrophone() {
  if (state.isMuted) {
    // Unmute
    state.isMuted = false;
    toggleMicBtn.classList.remove("btn-danger");
    toggleMicBtn.querySelector("span").textContent = "Mute";
    startAudioCapture();
  } else {
    // Mute
    state.isMuted = true;
    toggleMicBtn.classList.add("btn-danger");
    toggleMicBtn.querySelector("span").textContent = "Unmuted";
    stopAudioCapture();
  }
}

async function startAudioCapture() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    state.mediaStream = stream;
    state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = state.audioContext.createMediaStreamSource(stream);

    // Audio processor node for PCM capture
    const processor = state.audioContext.createScriptProcessor(4096, 1, 1);
    state.audioProcessor = processor;

    processor.onaudioprocess = (e) => {
      if (state.isMuted) return;

      const inputData = e.inputBuffer.getChannelData(0);

      // Compute RMS volume for visual meter
      let sum = 0;
      for (let i = 0; i < inputData.length; i++) {
        sum += inputData[i] * inputData[i];
      }
      const rms = Math.sqrt(sum / inputData.length);
      const levelPercent = Math.min(100, Math.round(rms * 400));
      if (meterFill) meterFill.style.height = `${levelPercent}%`;

      // Resample down to 16,000 Hz int16 PCM
      const downsampled = resampleTo16k(inputData, state.audioContext.sampleRate);
      const pcm16 = floatToInt16(downsampled);

      // Send to WebSocket if connected
      if (state.ws && state.isConnected) {
        const base64Audio = arrayBufferToBase64(pcm16.buffer);
        state.ws.send(
          JSON.stringify({
            type: "audio_chunk",
            roomId: state.roomId,
            senderId: state.userId,
            senderName: state.userName,
            sourceLanguage: state.sourceLang,
            data: base64Audio,
            timestamp: Date.now()
          })
        );
      }
    };

    source.connect(processor);
    processor.connect(state.audioContext.destination);
    console.log("[✓] Local microphone streaming at 16kHz active.");
  } catch (err) {
    console.warn("Microphone access permission required or device unavailable:", err);
  }
}

function stopAudioCapture() {
  if (state.mediaStream) {
    state.mediaStream.getTracks().forEach((t) => t.stop());
  }
  if (state.audioContext) {
    state.audioContext.close();
  }
  if (meterFill) meterFill.style.height = "0%";
}

// Camera Toggle
async function toggleCamera() {
  if (state.isCameraOn) {
    state.isCameraOn = false;
    localVideo.srcObject = null;
    localVideo.classList.add("hidden");
    localAvatarBox.classList.remove("hidden");
    toggleCameraBtn.classList.remove("active-state");
  } else {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      localVideo.srcObject = stream;
      localVideo.classList.remove("hidden");
      localAvatarBox.classList.add("hidden");
      toggleCameraBtn.classList.add("active-state");
      state.isCameraOn = true;
    } catch (err) {
      alert("Camera access denied or unavailable: " + err.message);
    }
  }
}

// Subtitles Toggle
function toggleSubtitles() {
  state.subtitlesEnabled = !state.subtitlesEnabled;
  if (state.subtitlesEnabled) {
    toggleSubtitlesBtn.classList.add("active-state");
    toggleSubtitlesBtn.querySelector("span").textContent = "Captions On";
    document.querySelectorAll(".floating-subtitle-overlay").forEach((el) => el.classList.remove("hidden"));
  } else {
    toggleSubtitlesBtn.classList.remove("active-state");
    toggleSubtitlesBtn.querySelector("span").textContent = "Captions Off";
    document.querySelectorAll(".floating-subtitle-overlay").forEach((el) => el.classList.add("hidden"));
  }
}

// Copilot Query
function handleCopilotQuery() {
  const query = copilotQueryInput.value.trim();
  if (!query) return;

  renderCopilotMessage(query, "user");
  copilotQueryInput.value = "";

  if (state.ws && state.isConnected) {
    state.ws.send(
      JSON.stringify({
        type: "copilot_query",
        roomId: state.roomId,
        query: query,
        timestamp: Date.now()
      })
    );
  } else {
    // Standalone intelligent reply
    setTimeout(() => {
      const reply = `OmniMeet Copilot: Regarding "${query}", based on Aarav and Elena's dialogue, the team has agreed to finalize the Faster-Whisper benchmark by evening and maintain end-to-end latency strictly below 800 ms.`;
      renderCopilotMessage(reply, "bot");
    }, 600);
  }
}

function renderCopilotMessage(text, role) {
  const bubble = document.createElement("div");
  bubble.className = `copilot-bubble ${role}`;

  if (role === "bot") {
    bubble.innerHTML = `
      <div class="bot-avatar">AI</div>
      <div class="bubble-text">${text}</div>
    `;
  } else {
    bubble.innerHTML = `<div class="bubble-text">${text}</div>`;
  }

  copilotMessages.appendChild(bubble);
  copilotMessages.scrollTop = copilotMessages.scrollHeight;
}

// Run Multilingual Demo Simulation
function runSimulationDemo() {
  startDemoBtn.disabled = true;
  startDemoBtn.innerHTML = `<span>Simulation Running...</span>`;

  const script = [
    {
      speaker: "Aarav Sharma",
      orig: "नमस्ते टीम, आज हम Faster-Whisper के लेटेंसी बेंचमार्क पर काम करेंगे।",
      trans: "Hello team, today we will work on Faster-Whisper latency benchmarks.",
      lang: "hi",
      action: null,
      delay: 1500
    },
    {
      speaker: "Elena Rodriguez",
      orig: "Excelente, acabo de configurar el modelo NLLB-200 para la traducción al inglés.",
      trans: "Excellent, I just configured the NLLB-200 model for English translation.",
      lang: "es",
      action: null,
      delay: 3500
    },
    {
      speaker: "Aarav Sharma",
      orig: "मैं आज शाम 6 बजे तक सभी टेस्ट रिज़ल्ट्स डॉक्यूमेंट कर दूँगा।",
      trans: "I will document all test results by 6 PM today.",
      lang: "hi",
      action: {
        task: "Document all Faster-Whisper benchmark test results by 6 PM",
        assignee: "Aarav Sharma",
        priority: "high"
      },
      delay: 6000
    },
    {
      speaker: "Elena Rodriguez",
      orig: "Perfecto, yo prepararé la interfaz de usuario para la presentación del proyecto.",
      trans: "Perfect, I will prepare the user interface for the project exhibition.",
      lang: "es",
      action: {
        task: "Prepare the user interface for project exhibition review",
        assignee: "Elena Rodriguez",
        priority: "medium"
      },
      delay: 8500
    }
  ];

  script.forEach((item) => {
    setTimeout(() => {
      renderSubtitle({
        type: "subtitle_stream",
        senderName: item.speaker,
        sourceLanguage: item.lang,
        targetLanguage: "en",
        isFinal: true,
        originalText: item.orig,
        translatedText: item.trans,
        latencyMs: 380 + Math.random() * 40
      });

      if (item.action) {
        renderActionItem({
          type: "action_item",
          id: "act_" + Date.now(),
          task: item.action.task,
          assignee: item.action.assignee,
          priority: item.action.priority
        });
      }
    }, item.delay);
  });

  setTimeout(() => {
    startDemoBtn.disabled = false;
    startDemoBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <polygon points="5 3 19 12 5 21 5 3"></polygon>
      </svg>
      <span>Run Multilingual Demo</span>
    `;
  }, 10000);
}

// Export Minutes of Meeting (MoM)
async function exportMinutesOfMeeting() {
  try {
    const res = await fetch(`/api/rooms/${state.roomId}/export-markdown`);
    if (res.ok) {
      const text = await res.text();
      downloadFile(text, `OmniMeet_MoM_${state.roomId}.md`, "text/markdown");
      return;
    }
  } catch (e) {
    // Local client fallback
  }

  // Client-side fallback download
  let mom = `# OmniMeet AI: Minutes of Meeting (MoM)\n`;
  mom += `**Room ID:** ${state.roomId}\n`;
  mom += `**Date:** ${new Date().toLocaleString()}\n`;
  mom += `**Subtitles Latency:** ~380ms\n\n---\n`;
  mom += `## 1. Action Items\n`;

  document.querySelectorAll(".action-item-card").forEach((card) => {
    const title = card.querySelector(".action-title")?.textContent || "";
    const assignee = card.querySelector(".assignee")?.textContent || "";
    const prio = card.querySelector(".priority-tag")?.textContent || "";
    mom += `- [ ] **[${prio}]** ${title} (${assignee})\n`;
  });

  mom += `\n---\n## 2. Spoken Transcript Excerpts\n`;
  document.querySelectorAll(".transcript-entry").forEach((entry) => {
    const author = entry.querySelector(".entry-author")?.textContent || "";
    const orig = entry.querySelector(".entry-orig")?.textContent || "";
    const trans = entry.querySelector(".entry-trans")?.textContent || "";
    mom += `- **${author}:** ${orig}\n  > *Subtitles:* ${trans}\n`;
  });

  downloadFile(mom, `OmniMeet_MoM_${state.roomId}.md`, "text/markdown");
}

function downloadFile(content, fileName, contentType) {
  const a = document.createElement("a");
  const file = new Blob([content], { type: contentType });
  a.href = URL.createObjectURL(file);
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(a.href);
}

// Audio Utilities
function resampleTo16k(audioBuffer, originalSampleRate) {
  if (originalSampleRate === 16000) return audioBuffer;
  const ratio = originalSampleRate / 16000;
  const newLength = Math.round(audioBuffer.length / ratio);
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    result[i] = audioBuffer[Math.round(i * ratio)];
  }
  return result;
}

function floatToInt16(float32Array) {
  const int16Array = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return int16Array;
}

function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

// Start
window.addEventListener("DOMContentLoaded", init);
