/**
 * OmniMeet AI — Enterprise Application Logic
 * Integrates WebSockets, Web Audio API 16kHz PCM streaming,
 * Real WebRTC P2P Mesh video conferencing, synchronized live translations,
 * TTS speech synthesis, and autonomous AI meeting copilot.
 */

// Parse Room ID or Code from URL pathname (/meet/{code}) or search param (?room=... or ?code=...)
function getInitialRoomFromUrl() {
  const path = window.location.pathname;
  const meetMatch = path.match(/\/meet\/([a-zA-Z0-9_\-]+)/);
  if (meetMatch && meetMatch[1]) {
    return meetMatch[1].toLowerCase();
  }
  const params = new URLSearchParams(window.location.search);
  const qRoom = params.get("room") || params.get("code");
  if (qRoom) {
    return qRoom.toLowerCase().replace(/[^a-z0-9_\-]/g, "");
  }
  return null;
}

const urlRoomId = getInitialRoomFromUrl();
const initialRoomId = urlRoomId || "abc-defg-hij";

// Application State
const state = {
  currentView: urlRoomId ? "lobby" : "home", // "home" | "lobby" | "meeting" | "post-meeting"
  roomId: initialRoomId,
  meetingCode: initialRoomId,
  meetingId: null,
  publicAppUrl: "",
  userId: "usr_" + Math.random().toString(36).substring(2, 9),
  userName: "Alex Morgan",
  userInitials: "AM",
  isAuthenticated: false,
  sourceLang: "en",
  targetLang: "en",
  ws: null,
  wsReconnectTimer: null,
  wsReconnectAttempts: 0,
  wsHasConnected: false,
  broadcastChannel: null,
  peers: {}, // { [userId]: { name, lang, targetLang, initials, isMuted, isCameraOn, isScreenSharing, isDemo } }
  speechRecognition: null,
  isRecognizing: false,
  speechRecognitionBlocked: false,
  speechRestartTimer: null,
  speechRestartAttempts: 0,
  isConnected: false,
  isJoining: false,
  isMuted: false,
  isCameraOn: false,
  isScreenSharing: false,
  isHandRaised: false,
  subtitlesEnabled: true,
  showOriginal: true,
  translatedAudioOn: true,
  ttsVoice: "en-US",
  theme: localStorage.getItem("omnimeet_theme") || (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"),
  audioContext: null,
  mediaStream: null,     // Microphone MediaStream
  cameraStream: null,    // Webcam MediaStream
  screenStream: null,    // Screen share MediaStream
  audioProcessor: null,
  micAnalyser: null,     // Audio level AnalyserNode
  micAnimFrame: null,
  meetingSeconds: 0,
  timerInterval: null,
  summaryRefreshInterval: null,
  actionItems: [],       // Array of real action item objects
  transcripts: [],       // Array of real transcript objects
  chatMessages: [],      // Array of room-scoped persistent chat messages
  copilotPendingRequests: {}, // requestId -> timeout handle
  demoActionItems: [],   // Isolated demo action items
  demoTranscripts: [],   // Isolated demo transcripts
  activeSearchQuery: "",
  peerConnections: {},   // { [userId]: RTCPeerConnection }
  iceCandidatesQueue: {},// { [userId]: Array<RTCIceCandidateInit> }
  remoteMediaStreams: {},// { [userId]: MediaStream }
  livekitRoom: null,     // LiveKit Room instance if SFU is active
  mediaTransportMode: "mesh", // "mesh" | "sfu"
  rtcConfig: {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" }
    ]
  },
  aiPipelineStatus: {
    initialized: false,
    asrLoaded: false,
    loading: false,
    error: null
  }
};

// Navigation & Stages
const homeStage = document.getElementById("homeStage");
const lobbyStage = document.getElementById("lobbyStage");
const meetingStage = document.getElementById("meetingStage");
const postMeetingStage = document.getElementById("postMeetingStage");
const navHomeBtn = document.getElementById("navHomeBtn");
const navLobbyBtn = document.getElementById("navLobbyBtn");
const navMeetingBtn = document.getElementById("navMeetingBtn");
const railBrandLogo = document.getElementById("railBrandLogo");

// Home Landing Elements
const btnNewMeeting = document.getElementById("btnNewMeeting");
const joinMeetingCodeInput = document.getElementById("joinMeetingCodeInput");
const btnJoinFromInput = document.getElementById("btnJoinFromInput");
const homeJoinError = document.getElementById("homeJoinError");
const homeJoinErrorText = document.getElementById("homeJoinErrorText");
const homeUserNameInput = document.getElementById("homeUserNameInput");
const homeUserLangSelect = document.getElementById("homeUserLangSelect");

// Lobby Screen Elements
const joinMeetingBtn = document.getElementById("joinMeetingBtn");
const joinWithScreenBtn = document.getElementById("joinWithScreenBtn");
const lobbyDisplayNameInput = document.getElementById("lobbyDisplayNameInput");
const lobbySpokenLang = document.getElementById("lobbySpokenLang");
const lobbyTranslateInto = document.getElementById("lobbyTranslateInto");
const lobbyToggleMicBtn = document.getElementById("lobbyToggleMicBtn");
const lobbyToggleCamBtn = document.getElementById("lobbyToggleCamBtn");
const lobbySettingsBtn = document.getElementById("lobbySettingsBtn");
const lobbyTestSoundBtn = document.getElementById("lobbyTestSoundBtn");
const lobbyPreviewVideo = document.getElementById("lobbyPreviewVideo");
const lobbyAvatarFallback = document.getElementById("lobbyAvatarFallback");
const lobbyCamNameLabel = document.getElementById("lobbyCamNameLabel");
const lobbyRoomName = document.getElementById("lobbyRoomName");
const lobbyRoomLinkInput = document.getElementById("lobbyRoomLinkInput");
const lobbyRoomLinkCopyBtn = document.getElementById("lobbyRoomLinkCopyBtn");
const lobbyMicSelect = document.getElementById("lobbyMicSelect");
const lobbyCameraSelect = document.getElementById("lobbyCameraSelect");
const lobbyMicMeter = document.getElementById("lobbyMicMeter");

// Controls Dock
const toggleMicBtn = document.getElementById("toggleMicBtn");
const toggleCameraBtn = document.getElementById("toggleCameraBtn");
const toggleScreenBtn = document.getElementById("toggleScreenBtn");
const raiseHandBtn = document.getElementById("raiseHandBtn");
const toggleTranslateDockBtn = document.getElementById("toggleTranslateDockBtn");
const toggleCopilotDockBtn = document.getElementById("toggleCopilotDockBtn");
const openChatBtn = document.getElementById("openChatBtn");
const openMoreBtn = document.getElementById("openMoreBtn");
const leaveCallBtn = document.getElementById("leaveCallBtn");
const meetingTimer = document.getElementById("meetingTimer");
const themeToggleBtn = document.getElementById("themeToggleBtn");
const headerConnLabel = document.getElementById("headerConnLabel");
const headerConnDot = document.getElementById("headerConnDot");
const headerRoomLabel = document.getElementById("headerRoomLabel");
const headerCopyLinkBtn = document.getElementById("headerCopyLinkBtn");
const headerCopyLinkLabel = document.getElementById("headerCopyLinkLabel");
const meetingTitle = document.getElementById("meetingTitle");
const meetingMeta = document.getElementById("meetingMeta");
const metaParticipantCount = document.getElementById("metaParticipantCount");
const metaDuration = document.getElementById("metaDuration");
const dockMeetingCodeDisplay = document.getElementById("dockMeetingCodeDisplay");
const dockCopyCodeBtn = document.getElementById("dockCopyCodeBtn");

// Subtitles & Live Speech
const showOriginalToggle = document.getElementById("showOriginalToggle");
const transcriptFeed = document.getElementById("transcriptFeed");
const transcriptEmptyState = document.getElementById("transcriptEmptyState");
const liveSpeechInput = document.getElementById("liveSpeechInput");
const quickPhraseSelect = document.getElementById("quickPhraseSelect");
const sendSpeechBtn = document.getElementById("sendSpeechBtn");
const speechActiveUserLabel = document.getElementById("speechActiveUserLabel");

// Video Elements
const localVideo = document.getElementById("localVideo");
const avatarFallbackLocal = document.getElementById("avatarFallbackLocal");
const localMicIcon = document.getElementById("localMicIcon");
const localLangTag = document.getElementById("localLangTag");
const localParticipantName = document.getElementById("localParticipantName");
const remotePeersContainer = document.getElementById("remotePeersContainer");

// Copilot & Chat Drawer
const copilotSidebar = document.getElementById("copilotSidebar");
const collapseSidebarBtn = document.getElementById("collapseSidebarBtn");
const copilotTabs = document.querySelectorAll(".copilot-tab");
const copilotPanels = document.querySelectorAll(".copilot-tab-panel");
const copySummaryBtn = document.getElementById("copySummaryBtn");
const summaryText = document.getElementById("summaryText");
const decisionText = document.getElementById("decisionText");
const actionItemsList = document.getElementById("actionItemsList");
const actionItemCountBadge = document.getElementById("actionItemCount");
const openAddActionModalBtn = document.getElementById("openAddActionModalBtn");
const copilotQueryInput2 = document.getElementById("copilotQueryInput2");
const sendCopilotQueryBtn2 = document.getElementById("sendCopilotQueryBtn2");
const copilotMessages = document.getElementById("copilotMessages");
const inMeetingChatMessages = document.getElementById("inMeetingChatMessages");
const inMeetingChatInput = document.getElementById("inMeetingChatInput");
const sendInMeetingChatBtn = document.getElementById("sendInMeetingChatBtn");
const peopleList = document.getElementById("peopleList");
const peopleCountLabel = document.getElementById("peopleCountLabel");
const inviteFromPeopleTabBtn = document.getElementById("inviteFromPeopleTabBtn");
const exportMomBtn = document.getElementById("exportMomBtn");
const notesContent = document.getElementById("notesContent");
const notesDate = document.getElementById("notesDate");

// Post-Meeting Screen
const btnRejoinMeeting = document.getElementById("btnRejoinMeeting");
const btnReturnHome = document.getElementById("btnReturnHome");
const btnViewMeetingRecords = document.getElementById("btnViewMeetingRecords");
const postMeetingSubtitle = document.getElementById("postMeetingSubtitle");

// Modals
const newMeetingModal = document.getElementById("newMeetingModal");
const closeNewMeetingModal = document.getElementById("closeNewMeetingModal");
const btnCloseNewMeetingModal = document.getElementById("btnCloseNewMeetingModal");
const newMeetingLinkInput = document.getElementById("newMeetingLinkInput");
const newMeetingCodeSpan = document.getElementById("newMeetingCodeSpan");
const btnCopyNewMeetingLink = document.getElementById("btnCopyNewMeetingLink");
const btnEnterNewMeetingNow = document.getElementById("btnEnterNewMeetingNow");

const invitePeopleBtn = document.getElementById("invitePeopleBtn");
const inviteModal = document.getElementById("inviteModal");
const closeInviteModal = document.getElementById("closeInviteModal");
const copyShareLinkBtn = document.getElementById("copyShareLinkBtn");
const cancelInviteBtn = document.getElementById("cancelInviteBtn");
const sendInviteBtn = document.getElementById("sendInviteBtn");
const inviteEmailInput = document.getElementById("inviteEmailInput");
const meetingShareLink = document.getElementById("meetingShareLink");

const openSettingsBtn = document.getElementById("openSettingsBtn");
const settingsModal = document.getElementById("settingsModal");
const closeSettingsModal = document.getElementById("closeSettingsModal");
const saveSettingsBtn = document.getElementById("saveSettingsBtn");
const settingsMicSelect = document.getElementById("settingsMicSelect");
const settingsCameraSelect = document.getElementById("settingsCameraSelect");

const helpBtn = document.getElementById("helpBtn");
const helpModal = document.getElementById("helpModal");
const closeHelpModal = document.getElementById("closeHelpModal");
const closeHelpModalBtn = document.getElementById("closeHelpModalBtn");

const meetingDetailsBtn = document.getElementById("meetingDetailsBtn");
const meetingDetailsModal = document.getElementById("meetingDetailsModal");
const closeDetailsModal = document.getElementById("closeDetailsModal");
const closeDetailsModalBtn = document.getElementById("closeDetailsModalBtn");

const addActionModal = document.getElementById("addActionModal");
const closeAddActionModal = document.getElementById("closeAddActionModal");
const cancelAddActionBtn = document.getElementById("cancelAddActionBtn");
const saveNewActionBtn = document.getElementById("saveNewActionBtn");
const newActionTaskInput = document.getElementById("newActionTaskInput");
const newActionAssigneeInput = document.getElementById("newActionAssigneeInput");
const newActionPrioritySelect = document.getElementById("newActionPrioritySelect");

const recordsModal = document.getElementById("recordsModal");
const closeRecordsModal = document.getElementById("closeRecordsModal");
const closeRecordsModalBtn = document.getElementById("closeRecordsModalBtn");
const recordsModalContent = document.getElementById("recordsModalContent");
const btnDownloadRecordsMarkdown = document.getElementById("btnDownloadRecordsMarkdown");

// Demo button & Toasts
const startDemoBtn = document.getElementById("startDemoBtn");
const clearDemoBtn = document.getElementById("clearDemoBtn");
// Missing Element References & Safe Fallbacks
const userSourceLang = document.getElementById("userSourceLang") || document.getElementById("homeUserLangSelect");
const userTargetLang = document.getElementById("userTargetLang") || document.getElementById("lobbyTranslateInto");
const toggleTranslatedAudioBtn = document.getElementById("toggleTranslatedAudioBtn");
const translatedAudioLabel = document.getElementById("translatedAudioLabel");
const suggestedPromptBtn = document.getElementById("suggestedPromptBtn");
const copilotQueryInput = document.getElementById("copilotQueryInput") || document.getElementById("copilotQueryInput2");
const sendCopilotQueryBtn = document.getElementById("sendCopilotQueryBtn") || document.getElementById("sendCopilotQueryBtn2");
const lobbyJoinByIdBtn = document.getElementById("lobbyJoinByIdBtn");
const lobbyRoomIdInput = document.getElementById("lobbyRoomIdInput");
const transcriptSearchInput = document.getElementById("transcriptSearchInput");
const clearTranscriptSearchBtn = document.getElementById("clearTranscriptSearchBtn");
const followLiveBtn = document.getElementById("followLiveBtn");
const audioSettingsBtn = document.getElementById("audioSettingsBtn");
const ttsVoiceSelect = document.getElementById("ttsVoiceSelect");
const gatewayStatus = document.getElementById("gatewayStatus");
const speechRecognitionStatus = document.getElementById("speechRecognitionStatus");
const lobbyPreviewImg = document.getElementById("lobbyPreviewImg");

// Theme Controller
function initTheme() {
  const current = localStorage.getItem("omnimeet_theme") || "dark";
  document.documentElement.setAttribute("data-theme", current);
  state.theme = current;
  updateThemeIcons();
}

function toggleTheme() {
  const newTheme = state.theme === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", newTheme);
  state.theme = newTheme;
  localStorage.setItem("omnimeet_theme", newTheme);
  updateThemeIcons();
}

function updateThemeIcons() {
  const sun = document.querySelector(".theme-icon-sun");
  const moon = document.querySelector(".theme-icon-moon");
  if (sun && moon) {
    if (state.theme === "dark") {
      sun.classList.remove("hidden");
      moon.classList.add("hidden");
    } else {
      sun.classList.add("hidden");
      moon.classList.remove("hidden");
    }
  }
}

// ============================================================
//  INITIALIZATION
// ============================================================
function init() {
  try {
    // Attach controls first so optional browser APIs cannot leave the page inert.
    setupEventListeners();
    initTheme();
    setupSpeechSynthesis();
    setupWebSpeechRecognition();
    try { initRoomBroadcast(); } catch (err) { console.warn("[Room] Same-browser presence is unavailable:", err); }
    loadPublicAppConfig();

    // Initialize display name from inputs or default
    if (homeUserNameInput) state.userName = homeUserNameInput.value || "Alex Morgan";
    if (homeUserLangSelect) state.sourceLang = homeUserLangSelect.value || "en";
    updateUserAvatar();
    switchMainView("home");

    // Device discovery must not prevent the meeting screens from initializing.
    enumerateMediaDevices().catch((err) => console.warn("[Media] Device discovery failed:", err));

    // If page was loaded with a room code, validate it and open the lobby.
    if (urlRoomId) {
      validateAndOpenRoom(urlRoomId, false).then((valid) => {
        if (!valid) {
          window.history.replaceState({}, "", "/");
          showToast("That meeting link is invalid or the meeting has ended.");
        }
      });
    }
  } catch (err) {
    console.error("[App] Startup failed:", err);
    showToast(`The app could not finish starting: ${err.message || err}`);
  }
}

function updateUserAvatar() {
  state.userInitials = state.userName.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "AM";
  const avatarPill = document.getElementById("userAvatarPill");
  if (avatarPill) {
    avatarPill.textContent = state.userInitials;
    avatarPill.title = state.userName + " (You)";
  }
  if (lobbyAvatarFallback) lobbyAvatarFallback.textContent = state.userInitials;
  if (avatarFallbackLocal) avatarFallbackLocal.textContent = state.userInitials;
  if (lobbyCamNameLabel) lobbyCamNameLabel.textContent = `${state.userName} (You)`;
  if (localParticipantName) localParticipantName.textContent = `${state.userName} (You)`;
}

// Stage Navigation Controller: "home" | "lobby" | "meeting" | "post-meeting"
function switchMainView(view) {
  if (state.currentView === "meeting" && (view === "home" || view === "lobby")) {
    showToast("Leave the call before leaving the meeting screen");
    return;
  }
  if (view !== "meeting" && state.wsReconnectTimer) {
    clearTimeout(state.wsReconnectTimer);
    state.wsReconnectTimer = null;
    state.wsReconnectAttempts = 0;
    state.wsHasConnected = false;
  }
  state.currentView = view;

  homeStage?.classList.add("hidden");
  lobbyStage?.classList.add("hidden");
  meetingStage?.classList.add("hidden");
  postMeetingStage?.classList.add("hidden");

  navHomeBtn?.classList.remove("active");
  navLobbyBtn?.classList.remove("active");
  navMeetingBtn?.classList.remove("active");

  if (view === "home") {
    homeStage?.classList.remove("hidden");
    navHomeBtn?.classList.add("active");
    copilotSidebar?.classList.add("collapsed");
    stopLobbyPreview();
  } else if (view === "lobby") {
    lobbyStage?.classList.remove("hidden");
    navLobbyBtn?.classList.add("active");
    copilotSidebar?.classList.add("collapsed");
    startLobbyPreview();
    updateMeetingLinkDisplays();
  } else if (view === "meeting") {
    meetingStage?.classList.remove("hidden");
    navMeetingBtn?.classList.add("active");
    copilotSidebar?.classList.remove("collapsed");
    stopLobbyPreview();
  } else if (view === "post-meeting") {
    postMeetingStage?.classList.remove("hidden");
    copilotSidebar?.classList.add("collapsed");
    stopLobbyPreview();
  }
}

// ============================================================
//  WEBSOCKET & BACKEND COMMUNICATION
// ============================================================
function connectWebSocket() {
  if (state.wsReconnectTimer) {
    clearTimeout(state.wsReconnectTimer);
    state.wsReconnectTimer = null;
  }
  if (state.ws) {
    try { state.ws.close(); } catch (e) {}
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.host || "localhost:8000";
  const wsUrl = `${protocol}//${host}/ws/room/${state.roomId}/${state.userId}?name=${encodeURIComponent(state.userName)}&lang=${state.sourceLang}&target_lang=${state.targetLang}`;

  updateConnectionStatus("connecting");

  try {
    const ws = new WebSocket(wsUrl);
    state.ws = ws;

    ws.onopen = () => {
      if (state.currentView !== "meeting" || state.ws !== ws) {
        ws.close();
        return;
      }
      state.wsReconnectAttempts = 0;
      state.wsHasConnected = true;
      state.isConnected = true;
      updateConnectionStatus("online");
      refreshAiPipelineStatus();
      broadcastLocalPeerState();
    };

    ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        await handleServerEvent(data);
      } catch (err) {
        console.warn("[WS] Error parsing message:", err, event.data);
      }
    };

    ws.onclose = () => {
      if (state.ws !== ws) return;
      state.ws = null;
      state.isConnected = false;
      const shouldReconnect = state.currentView === "meeting";
      updateConnectionStatus(shouldReconnect ? "reconnecting" : "offline");
      // Clean up remote peer WebRTC connections
      cleanupAllPeerConnections();
      if (shouldReconnect) {
        if (state.wsHasConnected) showToast("Connection interrupted. Reconnecting to the meeting…");
        scheduleWebSocketReconnect();
      }
    };

    ws.onerror = () => {
      state.isConnected = false;
      if (state.currentView === "meeting") updateConnectionStatus("reconnecting");
    };
  } catch (err) {
    console.warn("[WS] WebSocket initialization error:", err);
    state.ws = null;
    state.isConnected = false;
    if (state.currentView === "meeting") {
      updateConnectionStatus("reconnecting");
      scheduleWebSocketReconnect();
    } else {
      updateConnectionStatus("offline");
    }
  }
}

function scheduleWebSocketReconnect() {
  if (state.currentView !== "meeting" || state.wsReconnectTimer) return;
  const retry = state.wsReconnectAttempts++;
  const delay = Math.min(1000 * (2 ** Math.min(retry, 5)), 30000);
  state.wsReconnectTimer = setTimeout(() => {
    state.wsReconnectTimer = null;
    if (state.currentView === "meeting" && !state.isConnected) connectWebSocket();
  }, delay);
}

function updateConnectionStatus(status) {
  if (status === "online") {
    if (gatewayStatus) gatewayStatus.textContent = "Gateway: Online";
    if (headerConnLabel) headerConnLabel.textContent = "Gateway: Online • P2P WebRTC";
    if (headerConnDot) headerConnDot.style.background = "var(--accent-green)";
  } else if (status === "connecting") {
    if (gatewayStatus) gatewayStatus.textContent = "Connecting...";
    if (headerConnLabel) headerConnLabel.textContent = "Gateway: Connecting...";
    if (headerConnDot) headerConnDot.style.background = "#f59e0b";
  } else if (status === "reconnecting") {
    if (gatewayStatus) gatewayStatus.textContent = "Reconnecting...";
    if (headerConnLabel) headerConnLabel.textContent = "Gateway: Reconnecting...";
    if (headerConnDot) headerConnDot.style.background = "#f59e0b";
  } else {
    if (gatewayStatus) gatewayStatus.textContent = "Standby (Local)";
    if (headerConnLabel) headerConnLabel.textContent = "Gateway: Standby (Local)";
    if (headerConnDot) headerConnDot.style.background = "#94a3b8";
  }
}

async function refreshAiPipelineStatus() {
  try {
    const response = await fetch("/health", { cache: "no-store" });
    if (!response.ok) return;
    const status = await response.json();
    state.aiPipelineStatus = {
      initialized: Boolean(status.ai_pipeline_active),
      asrLoaded: Boolean(status.asr_model_loaded),
      loading: Boolean(status.ai_pipeline_loading),
      error: status.ai_pipeline_error || null
    };
    updatePipelineStatusIndicator();
    if (state.isConnected && state.aiPipelineStatus.loading) {
      setTimeout(refreshAiPipelineStatus, 2500);
    }
  } catch (err) {
    console.warn("[AI] Could not refresh speech pipeline status:", err);
  }
}

// Server Event Dispatcher
async function handleServerEvent(data) {
  switch (data.type) {
    case "room_state":
      // Backend sent the canonical room state
      handleRoomState(data);
      break;

    case "room_event":
      handleRoomEvent(data);
      break;

    case "subtitle_stream":
      renderReceivedSubtitle(data);
      break;

    case "action_item":
      handleReceivedActionItem(data);
      break;

    case "action_item_update":
      handleActionItemUpdate(data);
      break;

    case "action_item_delete":
      handleActionItemDelete(data.id);
      break;

    case "peer_state_update":
      handlePeerStateUpdate(data);
      break;

    case "webrtc_offer":
      await handleWebRTCOffer(data);
      break;

    case "webrtc_answer":
      await handleWebRTCAnswer(data);
      break;

    case "webrtc_ice_candidate":
      await handleWebRTCIceCandidate(data);
      break;

    case "chat_message":
      handleReceivedChatMessage(data);
      break;

    case "copilot_answer":
      if (data.requestId && state.copilotPendingRequests[data.requestId]) {
        cancelCopilotRequest(data.requestId);
        delete state.copilotPendingRequests[data.requestId];
      }
      renderCopilotMessage(data.answer, "bot");
      break;
  }
}

function handleRoomState(data) {
  // 1. AI speech pipeline state
  if (data.aiPipeline) {
    state.aiPipelineStatus = data.aiPipeline;
    updatePipelineStatusIndicator();
    syncSpeechRecognitionMode();
  }

  // 2. Persistent Chat Messages
  if (data.chatMessages) {
    state.chatMessages = data.chatMessages;
    renderChatMessagesList();
  }

  // 3. Media Transport Configuration (LiveKit SFU vs P2P Mesh)
  if (data.mediaConfig) {
    handleMediaTransportConfig(data.mediaConfig);
  }

  // 4. Transcripts
  state.transcripts = data.transcripts || [];
  if (transcriptFeed) {
    // Clear feed (except placeholder)
    const items = transcriptFeed.querySelectorAll(".conversation-item");
    items.forEach((i) => i.remove());
    if (state.transcripts.length > 0 && transcriptEmptyState) {
      transcriptEmptyState.style.display = "none";
    } else if (transcriptEmptyState) {
      transcriptEmptyState.style.display = "flex";
    }
    state.transcripts.forEach((t) => renderConversationItem(t));
  }

  // 5. Action items
  state.actionItems = data.actionItems || [];
  renderActionItemsList();

  // 4. Remote participants
  const participants = data.participants || [];
  participants.forEach((p) => {
    if (p.userId !== state.userId) {
      addRemotePeer({
        senderId: p.userId,
        name: p.userName,
        lang: p.preferredLanguage,
        targetLang: p.targetLanguage,
        isMuted: p.isMuted,
        isCameraOn: p.isCameraOn,
        isScreenSharing: p.isScreenSharing
      });

      // Mesh connections are only needed when the SFU is unavailable.
      if (state.mediaTransportMode !== "sfu") initiatePeerConnection(p.userId);
    }
  });

  updateParticipantCount();
}

function handleRoomEvent(data) {
  if (data.event === "user_joined" && data.userId !== state.userId) {
    addRemotePeer({
      senderId: data.userId,
      name: data.userName,
      lang: data.preferredLanguage,
      targetLang: data.targetLanguage
    });
    // Avoid a redundant mesh connection while connected through the SFU.
    if (state.mediaTransportMode !== "sfu") initiatePeerConnection(data.userId);
    showToast(`${data.userName || "A participant"} joined the room`);
  } else if (data.event === "user_left" && data.userId !== state.userId) {
    removeRemotePeer(data.userId);
  } else if (data.event === "language_switched" && data.userId !== state.userId) {
    if (state.peers[data.userId]) {
      state.peers[data.userId].lang = data.preferredLanguage;
      state.peers[data.userId].targetLang = data.targetLanguage;
      renderRemotePeers();
    }
  }
}

function updatePipelineStatusIndicator() {
  if (!speechRecognitionStatus) return;
  if (state.aiPipelineStatus.asrLoaded) {
    speechRecognitionStatus.textContent = "AI Speech Pipeline active (Faster-Whisper INT8)";
  } else if (state.aiPipelineStatus.loading) {
    speechRecognitionStatus.textContent = "Loading local speech models; browser speech recognition remains available.";
  } else if (state.aiPipelineStatus.error) {
    speechRecognitionStatus.textContent = "Local speech pipeline unavailable; using browser speech recognition.";
  } else {
    speechRecognitionStatus.textContent = "Web Speech recognition active • Multi-language translation ready";
  }
}

// ============================================================
//  REAL WEBRTC P2P MESH VIDEO & AUDIO CALLING
// ============================================================

function createPeerConnection(peerId) {
  if (state.peerConnections[peerId]) {
    return state.peerConnections[peerId];
  }

  const pc = new RTCPeerConnection(state.rtcConfig);
  state.peerConnections[peerId] = pc;
  state.iceCandidatesQueue[peerId] = [];

  // Add all active local media tracks to peer connection
  attachLocalTracksToPC(pc);

  // ICE Candidate Generation
  pc.onicecandidate = (event) => {
    if (event.candidate && state.ws && state.isConnected) {
      state.ws.send(JSON.stringify({
        type: "webrtc_ice_candidate",
        roomId: state.roomId,
        targetUserId: peerId,
        candidate: event.candidate.toJSON()
      }));
    }
  };

  // Remote media track received
  pc.ontrack = (event) => {
    let remoteStream = state.remoteMediaStreams[peerId];
    if (!remoteStream) {
      remoteStream = new MediaStream();
      state.remoteMediaStreams[peerId] = remoteStream;
    }
    event.streams[0].getTracks().forEach((track) => {
      remoteStream.addTrack(track);
    });

    const videoEl = document.getElementById(`video-peer-${peerId}`);
    if (videoEl) {
      videoEl.srcObject = remoteStream;
      videoEl.classList.remove("hidden");
      const fallback = document.getElementById(`avatar-fallback-${peerId}`);
      if (fallback) fallback.classList.add("hidden");
    }
  };

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
      cleanupPeerConnection(peerId);
    }
  };

  return pc;
}

function attachLocalTracksToPC(pc) {
  // If sharing screen, prioritize screen video track
  if (state.isScreenSharing && state.screenStream) {
    state.screenStream.getVideoTracks().forEach((track) => pc.addTrack(track, state.screenStream));
  } else if (state.isCameraOn && state.cameraStream) {
    state.cameraStream.getVideoTracks().forEach((track) => pc.addTrack(track, state.cameraStream));
  }

  // Add mic audio track if available
  if (state.mediaStream) {
    state.mediaStream.getAudioTracks().forEach((track) => pc.addTrack(track, state.mediaStream));
  }
}

async function initiatePeerConnection(peerId) {
  // Have exactly one participant create the offer for each pair. Without a
  // deterministic caller, simultaneous joins/reconnects can cause SDP glare.
  if (String(state.userId).localeCompare(String(peerId)) > 0) return;
  try {
    const pc = createPeerConnection(peerId);
    const offer = await pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true
    });
    await pc.setLocalDescription(offer);

    if (state.ws && state.isConnected) {
      state.ws.send(JSON.stringify({
        type: "webrtc_offer",
        roomId: state.roomId,
        targetUserId: peerId,
        sdp: pc.localDescription
      }));
    }
  } catch (err) {
    console.warn(`[WebRTC] Failed to create offer to ${peerId}:`, err);
  }
}

async function handleWebRTCOffer(data) {
  const senderId = data.senderId;
  if (!senderId || senderId === state.userId) return;

  try {
    const pc = createPeerConnection(senderId);
    await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));

    // Process any queued ICE candidates
    if (state.iceCandidatesQueue[senderId]) {
      for (const cand of state.iceCandidatesQueue[senderId]) {
        await pc.addIceCandidate(new RTCIceCandidate(cand));
      }
      state.iceCandidatesQueue[senderId] = [];
    }

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    if (state.ws && state.isConnected) {
      state.ws.send(JSON.stringify({
        type: "webrtc_answer",
        roomId: state.roomId,
        targetUserId: senderId,
        sdp: pc.localDescription
      }));
    }
  } catch (err) {
    console.warn(`[WebRTC] Failed to handle offer from ${senderId}:`, err);
  }
}

async function handleWebRTCAnswer(data) {
  const senderId = data.senderId;
  const pc = state.peerConnections[senderId];
  if (!pc) return;

  try {
    await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));

    // Process queued candidates
    if (state.iceCandidatesQueue[senderId]) {
      for (const cand of state.iceCandidatesQueue[senderId]) {
        await pc.addIceCandidate(new RTCIceCandidate(cand));
      }
      state.iceCandidatesQueue[senderId] = [];
    }
  } catch (err) {
    console.warn(`[WebRTC] Failed to handle answer from ${senderId}:`, err);
  }
}

async function handleWebRTCIceCandidate(data) {
  const senderId = data.senderId;
  const pc = state.peerConnections[senderId];
  if (!data.candidate) return;

  if (pc && pc.remoteDescription && pc.remoteDescription.type) {
    try {
      await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
    } catch (err) {
      console.warn(`[WebRTC] Error adding ICE candidate:`, err);
    }
  } else {
    if (!state.iceCandidatesQueue[senderId]) state.iceCandidatesQueue[senderId] = [];
    state.iceCandidatesQueue[senderId].push(data.candidate);
  }
}

function handlePeerStateUpdate(data) {
  const senderId = data.senderId;
  if (!senderId || !state.peers[senderId]) return;

  if ("isMuted" in data) state.peers[senderId].isMuted = data.isMuted;
  if ("isCameraOn" in data) state.peers[senderId].isCameraOn = data.isCameraOn;
  if ("isScreenSharing" in data) state.peers[senderId].isScreenSharing = data.isScreenSharing;
  if ("isHandRaised" in data) state.peers[senderId].isHandRaised = data.isHandRaised;

  // Update DOM tile icons
  const tile = document.getElementById(`peer-tile-${senderId}`);
  if (tile) {
    const micIcon = tile.querySelector(".mic-status-icon");
    if (micIcon) {
      micIcon.className = `mic-status-icon ${data.isMuted ? "muted" : "unmuted"}`;
    }
    const wrapper = tile.querySelector(".tile-media-wrapper");
    let handBadge = tile.querySelector(".hand-raise-badge");
    if (data.isHandRaised) {
      if (!handBadge && wrapper) {
        handBadge = document.createElement("span");
        handBadge.className = "hand-raise-badge";
        handBadge.style.cssText = "position:absolute; top:10px; left:10px; background:rgba(37,99,235,0.9); color:#fff; border-radius:50%; width:24px; height:24px; display:flex; align-items:center; justify-content:center; font-size:12px; z-index:10;";
        handBadge.textContent = "✋";
        wrapper.appendChild(handBadge);
      }
    } else if (handBadge) {
      handBadge.remove();
    }
  }
}

function updateLocalHandRaiseUI() {
  const localWrapper = document.querySelector("#tile-local .tile-media-wrapper");
  if (!localWrapper) return;
  let handBadge = localWrapper.querySelector(".hand-raise-badge");
  if (state.isHandRaised) {
    if (!handBadge) {
      handBadge = document.createElement("span");
      handBadge.className = "hand-raise-badge";
      handBadge.style.cssText = "position:absolute; top:10px; left:10px; background:rgba(37,99,235,0.9); color:#fff; border-radius:50%; width:24px; height:24px; display:flex; align-items:center; justify-content:center; font-size:12px; z-index:10;";
      handBadge.textContent = "✋";
      localWrapper.appendChild(handBadge);
    }
  } else if (handBadge) {
    handBadge.remove();
  }
}

function cleanupPeerConnection(peerId) {
  if (state.peerConnections[peerId]) {
    try {
      state.peerConnections[peerId].close();
    } catch (e) {}
    delete state.peerConnections[peerId];
  }
  delete state.remoteMediaStreams[peerId];
  delete state.iceCandidatesQueue[peerId];
}

function cleanupAllPeerConnections() {
  Object.keys(state.peerConnections).forEach((id) => cleanupPeerConnection(id));
}

// Broadcast local state changes (mute, camera, screen, hand)
function broadcastLocalPeerState() {
  const payload = {
    type: "peer_state_update",
    roomId: state.roomId,
    senderId: state.userId,
    isMuted: state.isMuted,
    isCameraOn: state.isCameraOn,
    isScreenSharing: state.isScreenSharing,
    isHandRaised: state.isHandRaised,
    timestamp: Date.now()
  };
  if (state.ws && state.isConnected) {
    state.ws.send(JSON.stringify(payload));
  }
  if (state.broadcastChannel) {
    state.broadcastChannel.postMessage(payload);
  }
}

// ============================================================
//  PEER REGISTRY & DYNAMIC VIDEO GRID
// ============================================================
function addRemotePeer(peer) {
  if (!peer || !peer.senderId || peer.senderId === state.userId) return;
  state.peers[peer.senderId] = {
    ...peer,
    initials: peer.initials || (peer.name || "P").replace(/[^a-zA-Z]/g, "").slice(0, 2).toUpperCase() || "P"
  };
  renderRemotePeers();
  updateParticipantCount();
}

function removeRemotePeer(peerId) {
  if (state.peers[peerId]) {
    const peerName = state.peers[peerId].name || "Participant";
    delete state.peers[peerId];
    cleanupPeerConnection(peerId);
    renderRemotePeers();
    updateParticipantCount();
    showToast(`${peerName.replace(" (You)", "")} left the call`);
  }
}

function renderRemotePeers() {
  if (!remotePeersContainer) return;
  remotePeersContainer.innerHTML = "";

  const ids = Object.keys(state.peers);
  ids.forEach((id) => {
    const peer = state.peers[id];
    const tile = document.createElement("div");
    tile.className = "video-tile remote-peer-tile";
    tile.id = `peer-tile-${id}`;
    const cleanName = (peer.name || "Guest").replace(" (You)", "");
    const initials = peer.initials || cleanName.slice(0, 2).toUpperCase();
    const langName = getLanguageName(peer.lang || "en");

    tile.innerHTML = `
      <div class="tile-media-wrapper">
        <video id="video-peer-${id}" autoplay playsinline class="remote-video-el hidden"></video>
        <div class="avatar-initials-fallback" id="avatar-fallback-${id}">
          <span>${initials}</span>
        </div>
        <div class="lang-overlay-tag">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 8l6 6"></path><path d="M4 14l6-6 2-3"></path><path d="M2 5h12"></path><path d="M7 2h1"></path><path d="M22 22l-5-10-5 10"></path><path d="M14 18h6"></path></svg>
          <span>${langName}</span>
        </div>
        ${peer.isDemo ? '<span class="demo-badge-overlay" style="position: absolute; top: 10px; right: 10px; background: rgba(234,88,12,0.85); color: #fff; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px;">DEMO</span>' : ''}
        <div class="speaking-audio-bubble hidden" id="speaking-peer-${id}" title="Speaking now">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
        </div>
        <div class="tile-bottom-bar">
          <span class="participant-name">${cleanName}</span>
          <span class="mic-status-icon ${peer.isMuted ? 'muted' : 'unmuted'}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="22"></line></svg>
          </span>
        </div>
      </div>
    `;
    remotePeersContainer.appendChild(tile);

    // If stream already exists, attach to new video element
    if (state.remoteMediaStreams[id]) {
      const v = tile.querySelector(`#video-peer-${id}`);
      if (v) {
        v.srcObject = state.remoteMediaStreams[id];
        v.classList.remove("hidden");
        tile.querySelector(`#avatar-fallback-${id}`)?.classList.add("hidden");
      }
    }
  });
}

function updateParticipantCount() {
  const remoteCount = Object.keys(state.peers).length;
  const total = 1 + remoteCount;

  if (participantCount) participantCount.textContent = total;
  if (metaParticipantCount) {
    metaParticipantCount.textContent = total === 1 ? "1 participant" : `${total} participants`;
  }
  if (lobbyPeerCountText) {
    lobbyPeerCountText.textContent = remoteCount === 0 ? "0 in room" : `${remoteCount} in room`;
  }

  // Unique languages
  const langs = new Set([state.sourceLang, state.targetLang]);
  Object.values(state.peers).forEach((p) => {
    if (p.lang) langs.add(p.lang);
  });
  if (metaLangCount) {
    metaLangCount.textContent = `${langs.size} ${langs.size === 1 ? 'language' : 'languages'}`;
  }
}

// ============================================================
//  CAMERA, MICROPHONE & SCREEN SHARE MANAGEMENT
// ============================================================

async function toggleMicrophone() {
  if (state.isMuted) {
    state.isMuted = false;
    toggleMicBtn?.classList.remove("muted-state");
    if (localMicIcon) {
      localMicIcon.classList.remove("muted");
      localMicIcon.classList.add("unmuted");
    }
    showToast("Microphone unmuted");
    await startAudioCapture();
    await syncLiveKitLocalTrack("audio", state.mediaStream?.getAudioTracks()[0] || null);

    syncSpeechRecognitionMode();
  } else {
    state.isMuted = true;
    toggleMicBtn?.classList.add("muted-state");
    if (localMicIcon) {
      localMicIcon.classList.remove("unmuted");
      localMicIcon.classList.add("muted");
    }
    showToast("Microphone muted");
    await syncLiveKitLocalTrack("audio", null);
    stopAudioCapture();

    syncSpeechRecognitionMode();
  }

  broadcastLocalPeerState();
}

async function startAudioCapture() {
  try {
    const audioConstraints = {
      audio: micSelect && micSelect.value !== "default" ? { deviceId: { exact: micSelect.value } } : true
    };
    const existingAudio = state.mediaStream?.active && state.mediaStream.getAudioTracks().some((track) => track.readyState === "live");
    const stream = existingAudio ? state.mediaStream : await navigator.mediaDevices.getUserMedia(audioConstraints);
    state.mediaStream = stream;

    // Add audio track to active WebRTC peer connections
    const audioTrack = stream.getAudioTracks()[0];
    Object.values(state.peerConnections).forEach((pc) => {
      const senders = pc.getSenders();
      const audioSender = senders.find((s) => s.track && s.track.kind === "audio");
      if (audioSender) {
        audioSender.replaceTrack(audioTrack);
      } else {
        pc.addTrack(audioTrack, stream);
      }
    });

    // 16kHz PCM streaming for server VAD/ASR
    if (!state.audioContext || state.audioContext.state === "closed") {
      state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    const source = state.audioContext.createMediaStreamSource(stream);
    const processor = state.audioContext.createScriptProcessor(4096, 1, 1);
    state.audioProcessor = processor;

    processor.onaudioprocess = (e) => {
      if (state.isMuted) return;
      const inputData = e.inputBuffer.getChannelData(0);
      const downsampled = resampleTo16k(inputData, state.audioContext.sampleRate);
      const pcm16 = floatToInt16(downsampled);

      if (state.ws && state.isConnected) {
        const base64Audio = arrayBufferToBase64(pcm16.buffer);
        state.ws.send(JSON.stringify({
          type: "audio_chunk",
          roomId: state.roomId,
          senderId: state.userId,
          senderName: state.userName,
          sourceLanguage: state.sourceLang,
          audioData: base64Audio,
          timestamp: Date.now()
        }));
      }
    };

    source.connect(processor);
    processor.connect(state.audioContext.destination);
  } catch (err) {
    console.warn("[Media] Microphone permission / device error:", err);
    showToast("Microphone access unavailable or denied");
  }
}

function stopAudioCapture() {
  if (state.mediaStream) {
    state.mediaStream.getAudioTracks().forEach((t) => t.stop());
    state.mediaStream = null;
  }
  if (state.audioContext) {
    try { state.audioContext.close(); } catch (e) {}
    state.audioContext = null;
  }
}

async function toggleCamera() {
  if (state.isCameraOn) {
    // Turn camera off
    state.isCameraOn = false;
    await syncLiveKitLocalTrack("video", null);
    if (state.cameraStream) {
      state.cameraStream.getVideoTracks().forEach((t) => t.stop());
      state.cameraStream = null;
    }
    if (localVideo) {
      localVideo.srcObject = null;
      localVideo.classList.add("hidden");
    }
    if (imgLocal) imgLocal.classList.add("hidden");
    if (avatarFallbackLocal) {
      avatarFallbackLocal.textContent = state.userInitials;
      avatarFallbackLocal.classList.remove("hidden");
    }
    toggleCameraBtn?.classList.remove("active-blue");

    // Replace video track in peer connections with null
    Object.values(state.peerConnections).forEach((pc) => {
      const videoSender = pc.getSenders().find((s) => s.track && s.track.kind === "video");
      if (videoSender) videoSender.replaceTrack(null);
    });

    showToast("Camera disabled");
  } else {
    // Turn camera on
    try {
      const videoConstraints = {
        video: cameraSelect && cameraSelect.value !== "default"
          ? { deviceId: { exact: cameraSelect.value } }
          : { width: { ideal: 1280 }, height: { ideal: 720 } }
      };
      const stream = await navigator.mediaDevices.getUserMedia(videoConstraints);
      state.cameraStream = stream;
      state.isCameraOn = true;

      if (localVideo) {
        localVideo.srcObject = stream;
        localVideo.classList.remove("hidden");
      }
      if (imgLocal) imgLocal.classList.add("hidden");
      if (avatarFallbackLocal) avatarFallbackLocal.classList.add("hidden");
      toggleCameraBtn?.classList.add("active-blue");

      const videoTrack = stream.getVideoTracks()[0];
      await syncLiveKitLocalTrack("video", videoTrack);
      Object.values(state.peerConnections).forEach((pc) => {
        const videoSender = pc.getSenders().find((s) => s.track && s.track.kind === "video");
        if (videoSender) {
          videoSender.replaceTrack(videoTrack);
        } else {
          pc.addTrack(videoTrack, stream);
        }
      });

      showToast("Camera enabled");
    } catch (err) {
      console.warn("[Media] Camera access error:", err);
      showToast("Camera unavailable: " + (err.message || "permission denied"));
    }
  }

  broadcastLocalPeerState();
}

async function toggleScreenShare() {
  if (state.isScreenSharing) {
    stopScreenSharing();
    showToast("Screen sharing stopped");
  } else {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      state.screenStream = stream;
      state.isScreenSharing = true;
      toggleScreenBtn?.classList.add("active-blue");

      if (localVideo) {
        localVideo.srcObject = stream;
        localVideo.classList.remove("hidden");
      }
      if (imgLocal) imgLocal.classList.add("hidden");
      if (avatarFallbackLocal) avatarFallbackLocal.classList.add("hidden");

      const screenTrack = stream.getVideoTracks()[0];
      await syncLiveKitLocalTrack("video", screenTrack);

      // Replace track on all active peer connections
      Object.values(state.peerConnections).forEach((pc) => {
        const videoSender = pc.getSenders().find((s) => s.track && s.track.kind === "video");
        if (videoSender) {
          videoSender.replaceTrack(screenTrack);
        } else {
          pc.addTrack(screenTrack, stream);
        }
      });

      // Browser native "Stop Sharing" button listener
      screenTrack.onended = () => {
        if (state.isScreenSharing) stopScreenSharing();
      };

      showToast("Sharing your screen 🖥️");
    } catch (err) {
      console.warn("[Media] Screen sharing cancelled / error:", err);
    }
  }

  broadcastLocalPeerState();
}

function stopScreenSharing() {
  if (state.screenStream) {
    state.screenStream.getTracks().forEach((t) => t.stop());
    state.screenStream = null;
  }
  state.isScreenSharing = false;
  toggleScreenBtn?.classList.remove("active-blue");

  // Restore camera track if camera was enabled
  if (state.isCameraOn && state.cameraStream) {
    const camTrack = state.cameraStream.getVideoTracks()[0];
    syncLiveKitLocalTrack("video", camTrack);
    if (localVideo) localVideo.srcObject = state.cameraStream;
    Object.values(state.peerConnections).forEach((pc) => {
      const sender = pc.getSenders().find((s) => s.track && s.track.kind === "video");
      if (sender) sender.replaceTrack(camTrack);
    });
  } else {
    syncLiveKitLocalTrack("video", null);
    if (localVideo) {
      localVideo.srcObject = null;
      localVideo.classList.add("hidden");
    }
    if (avatarFallbackLocal) {
      avatarFallbackLocal.textContent = state.userInitials;
      avatarFallbackLocal.classList.remove("hidden");
    }
    Object.values(state.peerConnections).forEach((pc) => {
      const sender = pc.getSenders().find((s) => s.track && s.track.kind === "video");
      if (sender) sender.replaceTrack(null);
    });
  }
}

async function syncLiveKitLocalTrack(kind, track) {
  const room = state.livekitRoom;
  if (!room?.localParticipant || !state.livekitConnected) return;
  const published = state.livekitPublishedTracks || (state.livekitPublishedTracks = {});
  const previous = published[kind];
  if (previous === track) return;

  try {
    if (previous) {
      await room.localParticipant.unpublishTrack(previous);
      delete published[kind];
    }
    if (track && track.readyState === "live") {
      await room.localParticipant.publishTrack(track);
      published[kind] = track;
    }
  } catch (err) {
    console.warn(`[Media] Could not update LiveKit ${kind} track:`, err);
    showToast(`Could not update ${kind === "audio" ? "microphone" : "camera/share"} on the meeting server`);
  }
}

// Media device enumeration for honest settings
async function enumerateMediaDevices() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    if (micSelect) {
      micSelect.innerHTML = `<option value="default">Default System Microphone</option>`;
      devices.filter((d) => d.kind === "audioinput").forEach((d, i) => {
        const opt = document.createElement("option");
        opt.value = d.deviceId;
        opt.textContent = d.label || `Microphone ${i + 1}`;
        micSelect.appendChild(opt);
      });
    }
    if (cameraSelect) {
      cameraSelect.innerHTML = `<option value="default">Default System Camera</option>`;
      devices.filter((d) => d.kind === "videoinput").forEach((d, i) => {
        const opt = document.createElement("option");
        opt.value = d.deviceId;
        opt.textContent = d.label || `Camera ${i + 1}`;
        cameraSelect.appendChild(opt);
      });
    }
  } catch (e) {
    console.warn("Could not enumerate devices:", e);
  }
}

// ============================================================
//  TRANSCRIPT, TRANSLATION & SUBTITLE FEED
// ============================================================

async function handleSendLiveSpeech() {
  const text = liveSpeechInput?.value?.trim();
  if (!text) {
    showToast("Please enter or select a test phrase");
    liveSpeechInput?.focus();
    return;
  }

  const srcLang = detectPhraseLanguage(text);
  await broadcastSpeechUtterance(text, srcLang);
  if (liveSpeechInput) liveSpeechInput.value = "";
}

async function broadcastSpeechUtterance(originalText, sourceLang) {
  const timestamp = Date.now();
  const sameLanguage = sourceLang === state.targetLang;
  const payload = {
    type: "speech_utterance",
    roomId: state.roomId,
    senderId: state.userId,
    senderName: state.userName,
    sourceLanguage: sourceLang,
    targetLanguage: state.targetLang,
    text: originalText,
    originalText: originalText,
    translatedText: sameLanguage ? originalText : "",
    translations: sameLanguage ? { [state.targetLang]: originalText } : {},
    translationAvailable: sameLanguage,
    translationPending: !sameLanguage,
    isFinal: true,
    timestamp
  };

  // Show what was spoken immediately; translation may need a network request.
  renderConversationItem(payload);
  if (state.broadcastChannel) state.broadcastChannel.postMessage({ ...payload, type: "subtitle_stream" });

  // Send the source speech immediately so the room can receive captions even
  // while this browser's translation provider is still responding.
  if (state.ws && state.isConnected) {
    try {
      state.ws.send(JSON.stringify(payload));
    } catch (e) {}
  }

  if (!sameLanguage) {
    const result = await translateTextDetailed(originalText, sourceLang, state.targetLang);
    payload.translatedText = result.translatedText;
    payload.translations = result.translated ? { [state.targetLang]: result.translatedText } : {};
    payload.translationAvailable = result.translated;
    payload.translationPending = false;
    renderConversationItem(payload);
  }
}

function renderReceivedSubtitle(data) {
  // If targetLanguage was personalized by backend, use it; otherwise translate locally
  if (data.targetLanguage === state.targetLang && data.translatedText) {
    renderConversationItem({ ...data, translationAvailable: data.translationAvailable !== false });
  } else if (data.translations && data.translations[state.targetLang]) {
    renderConversationItem({
      ...data,
      targetLanguage: state.targetLang,
      translatedText: data.translations[state.targetLang],
      translationAvailable: true
    });
  } else {
    // Show the original while the local fallback tries to translate it.
    const pending = {
      ...data,
      targetLanguage: state.targetLang,
      translatedText: data.sourceLanguage === state.targetLang ? data.originalText : "",
      translationAvailable: data.sourceLanguage === state.targetLang,
      translationPending: data.sourceLanguage !== state.targetLang
    };
    renderConversationItem(pending);
    translateTextDetailed(data.originalText, data.sourceLanguage, state.targetLang).then((result) => {
      renderConversationItem({
        ...pending,
        targetLanguage: state.targetLang,
        translatedText: result.translatedText,
        translationAvailable: result.translated,
        translationPending: false
      });
    });
  }
}

function renderConversationItem(data) {
  if (!state.subtitlesEnabled || !transcriptFeed) return;

  // Prevent duplicate rendering in DOM
  const existingDomItem = transcriptFeed.querySelector(
    `.conversation-item[data-timestamp="${data.timestamp}"][data-sender-id="${data.senderId}"]`
  );
  if (existingDomItem) {
    const transEl = existingDomItem.querySelector(".item-translated-text");
    if (transEl) {
      const displayTranslation = data.translationPending
        ? "Translating…"
        : data.translationAvailable === false
          ? "Translation unavailable"
          : (data.translatedText || "");
      transEl.textContent = displayTranslation;
      existingDomItem.dataset.translated = (data.translatedText || "").toLowerCase();
      const playButton = existingDomItem.querySelector(".tts-play-btn");
      if (playButton) {
        playButton.dataset.text = data.translatedText || "";
        playButton.disabled = !data.translatedText;
      }
    }
    return;
  }

  // Isolate demo transcripts from real room transcripts
  if (data.isDemo) {
    state.demoTranscripts.push(data);
    if (clearDemoBtn) clearDemoBtn.classList.remove("hidden");
  } else {
    const exists = state.transcripts.some((t) => t.timestamp === data.timestamp && t.senderId === data.senderId);
    if (!exists) {
      state.transcripts.push(data);
    }
  }

  const speaker = data.senderName || "Speaker";
  const orig = data.originalText || "";
  const trans = data.translatedText || "";
  const displayTranslation = data.translationPending
    ? "Translating…"
    : data.translationAvailable === false
      ? "Translation unavailable"
      : (trans || orig);
  const src = (data.sourceLanguage || "en").toUpperCase();
  const tgt = (data.targetLanguage || state.targetLang || "en").toUpperCase();
  const langPair = `${src} → ${tgt}`;

  const mins = Math.floor(state.meetingSeconds / 60);
  const secs = state.meetingSeconds % 60;
  const timeStr = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

  const cleanName = speaker.replace(" (You)", "");
  const initials = (data.initials || cleanName.split(" ").map((w) => w[0]).join("").slice(0, 2) || "P").toUpperCase();

  // Hide empty state
  if (transcriptEmptyState) transcriptEmptyState.style.display = "none";

  // Active Speaker Highlight
  highlightActiveSpeaker(data.senderId);

  // Filter check
  const isMatch = checkSearchFilter(cleanName, orig, trans, langPair);

  const item = document.createElement("div");
  item.className = "conversation-item active-highlight" + (isMatch ? "" : " hidden");
  item.dataset.speaker = cleanName.toLowerCase();
  item.dataset.original = orig.toLowerCase();
  item.dataset.translated = trans.toLowerCase();
  item.dataset.timestamp = String(data.timestamp || "");
  item.dataset.senderId = String(data.senderId || "");
  if (data.isDemo) item.dataset.isDemo = "true";

  item.innerHTML = `
    <div class="item-avatar avatar-sm">${initials}</div>
    <div class="item-body">
      <div class="item-meta-header">
        <span class="item-speaker-name">${cleanName}${data.isDemo ? ' <span style="font-size:10px; background:#ea580c; color:#fff; padding:1px 4px; border-radius:3px; font-weight:700;">DEMO</span>' : ''}</span>
        <span class="item-lang-pair">${langPair}</span>
        <span class="item-timestamp">${timeStr}</span>
        <button class="tts-play-btn" title="Play speech audio" data-text="${escapeHtml(trans)}" ${trans ? "" : "disabled"}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
        </button>
      </div>
      <div class="item-original-text" style="display: ${state.showOriginal ? 'block' : 'none'};">${escapeHtml(orig)}</div>
      <div class="item-translated-text">${escapeHtml(displayTranslation)}</div>
    </div>
  `;

  transcriptFeed.appendChild(item);
  transcriptFeed.scrollTop = transcriptFeed.scrollHeight;

  // TTS audio playback if enabled
  if (state.translatedAudioOn && data.senderId !== state.userId) {
    speakText(trans);
  }
}

function highlightActiveSpeaker(senderId) {
  document.querySelectorAll(".video-tile").forEach((t) => t.classList.remove("active-speaker"));
  document.querySelectorAll(".speaking-audio-bubble").forEach((b) => b.classList.add("hidden"));

  let tileId = "tile-local";
  let waveId = "speaking-local";

  if (senderId && senderId !== state.userId && document.getElementById(`peer-tile-${senderId}`)) {
    tileId = `peer-tile-${senderId}`;
    waveId = `speaking-peer-${senderId}`;
  }

  const targetTile = document.getElementById(tileId);
  const targetWave = document.getElementById(waveId);
  if (targetTile) targetTile.classList.add("active-speaker");
  if (targetWave) targetWave.classList.remove("hidden");

  clearTimeout(state.activeSpeakerTimeout);
  state.activeSpeakerTimeout = setTimeout(() => {
    document.querySelectorAll(".video-tile").forEach((t) => t.classList.remove("active-speaker"));
    document.querySelectorAll(".speaking-audio-bubble").forEach((b) => b.classList.add("hidden"));
  }, 4000);
}

// Transcript search & filter
function checkSearchFilter(speaker, orig, trans, lang) {
  if (!state.activeSearchQuery) return true;
  const q = state.activeSearchQuery.toLowerCase();
  return (
    speaker.toLowerCase().includes(q) ||
    orig.toLowerCase().includes(q) ||
    trans.toLowerCase().includes(q) ||
    lang.toLowerCase().includes(q)
  );
}

function filterTranscriptItems() {
  const items = transcriptFeed?.querySelectorAll(".conversation-item");
  if (!items) return;
  items.forEach((item) => {
    const speaker = item.dataset.speaker || "";
    const orig = item.dataset.original || "";
    const trans = item.dataset.translated || "";
    const isMatch = checkSearchFilter(speaker, orig, trans, "");
    item.classList.toggle("hidden", !isMatch);
  });
}

// ============================================================
//  ACTION ITEMS MANAGEMENT
// ============================================================

function handleReceivedActionItem(item) {
  if (item.isDemo) {
    const existingIdx = state.demoActionItems.findIndex((a) => a.id === item.id);
    if (existingIdx >= 0) {
      state.demoActionItems[existingIdx] = item;
    } else {
      state.demoActionItems.push(item);
    }
    if (clearDemoBtn) clearDemoBtn.classList.remove("hidden");
  } else {
    const existingIdx = state.actionItems.findIndex((a) => a.id === item.id);
    if (existingIdx >= 0) {
      state.actionItems[existingIdx] = item;
    } else {
      state.actionItems.push(item);
    }
  }
  renderActionItemsList();
}

function handleActionItemUpdate(data) {
  const item = state.actionItems.find((a) => a.id === data.id);
  if (item) {
    if ("completed" in data) item.completed = data.completed;
    if ("task" in data) item.task = data.task;
    if ("assignee" in data) item.assignee = data.assignee;
    renderActionItemsList();
    return;
  }
  const demoItem = state.demoActionItems.find((a) => a.id === data.id);
  if (demoItem) {
    if ("completed" in data) demoItem.completed = data.completed;
    if ("task" in data) demoItem.task = data.task;
    if ("assignee" in data) demoItem.assignee = data.assignee;
    renderActionItemsList();
  }
}

function handleActionItemDelete(id) {
  state.actionItems = state.actionItems.filter((a) => a.id !== id);
  state.demoActionItems = state.demoActionItems.filter((a) => a.id !== id);
  renderActionItemsList();
}

function renderActionItemsList() {
  if (!actionItemsList) return;
  actionItemsList.innerHTML = "";

  const allItems = [...state.actionItems, ...state.demoActionItems];

  if (allItems.length === 0) {
    actionItemsList.innerHTML = `
      <div class="empty-action-items" id="emptyActionItems" style="padding: 14px 10px; text-align: center; color: var(--text-muted); font-size: 13px;">
        <p style="margin: 0 0 4px; font-weight: 500;">No action items recorded yet.</p>
        <span style="font-size: 12px; color: var(--text-tertiary);">Spoken commitments or manual tasks will appear here.</span>
      </div>
    `;
    if (actionItemCountBadge) actionItemCountBadge.textContent = "0";
    return;
  }

  let pendingCount = 0;

  allItems.forEach((item) => {
    if (!item.completed) pendingCount++;
    const id = item.id;
    const card = document.createElement("div");
    card.className = "action-item-box" + (item.completed ? " completed-item" : "") + (item.isDemo ? " demo-action-box" : "");
    card.id = id;

    const assignee = item.assignee || "Team";
    const initials = assignee.slice(0, 2).toUpperCase();

    card.innerHTML = `
      <label class="action-checkbox-custom">
        <input type="checkbox" id="chk-${id}" ${item.completed ? "checked" : ""}>
        <span class="checkmark"></span>
      </label>
      <div class="action-content" style="flex: 1;">
        <p class="action-description" style="text-decoration: ${item.completed ? 'line-through' : 'none'}; color: ${item.completed ? 'var(--text-tertiary)' : 'var(--text-main)'};">
          ${escapeHtml(item.task)}
          ${item.isDemo ? '<span style="font-size:10px; background:#ea580c; color:#fff; padding:1px 4px; border-radius:3px; margin-left:6px; font-weight:700;">DEMO</span>' : ''}
        </p>
        <div class="action-footer-meta" style="display: flex; align-items: center; justify-content: space-between; margin-top: 4px;">
          <span class="assignee-badge">
            <span class="assignee-avatar avatar-sm-micro">${initials}</span>
            <span class="assignee-name">${escapeHtml(assignee)}</span>
          </span>
          <span class="due-date" style="font-size: 11px; color: var(--text-muted);">${escapeHtml(item.dueContext || "In-Meeting")}</span>
        </div>
      </div>
    `;

    // Checkbox toggle listener
    const chk = card.querySelector(`input[type='checkbox']`);
    chk?.addEventListener("change", (e) => {
      toggleActionItemCompletion(id, e.target.checked);
    });

    actionItemsList.appendChild(card);
  });

  if (actionItemCountBadge) actionItemCountBadge.textContent = pendingCount;
}

function toggleActionItemCompletion(id, isCompleted) {
  const item = state.actionItems.find((a) => a.id === id);
  if (item) {
    item.completed = isCompleted;
    renderActionItemsList();

    const updateMsg = {
      type: "action_item_update",
      roomId: state.roomId,
      id: id,
      completed: isCompleted
    };

    if (state.ws && state.isConnected) {
      state.ws.send(JSON.stringify(updateMsg));
    }
    if (state.broadcastChannel) {
      state.broadcastChannel.postMessage(updateMsg);
    }
    return;
  }

  const demoItem = state.demoActionItems.find((a) => a.id === id);
  if (demoItem) {
    demoItem.completed = isCompleted;
    renderActionItemsList();
  }
}

function createManualActionItem(task, assignee, priority) {
  const act = {
    type: "action_item",
    id: "act_" + Date.now(),
    roomId: state.roomId,
    task: task,
    assignee: assignee || state.userName,
    priority: priority || "medium",
    dueContext: "Manual Task",
    completed: false,
    timestamp: Date.now()
  };

  handleReceivedActionItem(act);

  if (state.ws && state.isConnected) {
    state.ws.send(JSON.stringify(act));
  }
  if (state.broadcastChannel) {
    state.broadcastChannel.postMessage(act);
  }
}

// ============================================================
//  COPILOT Q&A, NOTES & MOM SYNTHESIS
// ============================================================

function submitCopilotQuestion(query) {
  query = String(query || "").trim();
  if (!query) return;
  renderCopilotMessage(query, "user");
  const requestId = `copilot_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const roomAtRequest = state.roomId;
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
    delete state.copilotPendingRequests[requestId];
    renderCopilotMessage(localCopilotAnswer(query), "bot");
  }, 27000);
  state.copilotPendingRequests[requestId] = { controller, timer };

  fetch(`/api/rooms/${encodeURIComponent(roomAtRequest)}/copilot/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
    signal: controller.signal
  }).then(async (response) => {
    if (!response.ok) throw new Error(`Copilot request failed (${response.status})`);
    return response.json();
  }).then((result) => {
    const pending = state.copilotPendingRequests[requestId];
    if (!pending || state.roomId !== roomAtRequest) return;
    clearTimeout(pending.timer);
    delete state.copilotPendingRequests[requestId];
    renderCopilotMessage(result.answer || "OmniCopilot could not produce an answer.", "bot");
  }).catch((err) => {
    const pending = state.copilotPendingRequests[requestId];
    if (!pending) return;
    clearTimeout(pending.timer);
    delete state.copilotPendingRequests[requestId];
    console.warn("[Copilot] Gateway request failed; using grounded local search:", err);
    renderCopilotMessage(localCopilotAnswer(query), "bot");
  });
}

function localCopilotAnswer(query) {
  const transcripts = state.transcripts || [];
  const items = [...(state.actionItems || []), ...(state.demoActionItems || [])];
  if (!transcripts.length && !items.length) {
    return "OmniCopilot: No dialogue or action items have been recorded in this meeting yet. Add meeting discussion or notes, then ask again.";
  }

  const q = query.toLowerCase();
  if (/action|task|todo|follow.?up/.test(q)) {
    return items.length
      ? `OmniCopilot (Local): Recorded action items:\n${items.map((item) => `• ${item.completed ? "Done" : "Open"}: ${item.task} — ${item.assignee || "Team"}`).join("\n")}`
      : "OmniCopilot (Local): No action items have been recorded in this meeting.";
  }
  if (/who|speaker|participant|attendee/.test(q)) {
    const speakers = [...new Set(transcripts.map((entry) => entry.senderName).filter(Boolean))];
    return speakers.length
      ? `OmniCopilot (Local): Speakers in the recorded transcript: ${speakers.join(", ")}.`
      : "OmniCopilot (Local): No speakers have been recorded yet.";
  }

  const stopWords = new Set(["what", "when", "where", "which", "about", "were", "with", "from", "they", "this", "that", "have", "does", "tell", "meeting"]);
  const terms = (q.match(/[\p{L}\p{N}]{3,}/gu) || []).filter((word) => !stopWords.has(word));
  const ranked = transcripts.map((entry) => {
    const text = `${entry.originalText || ""} ${entry.translatedText || ""}`.toLowerCase();
    return { entry, score: terms.reduce((sum, term) => sum + (text.includes(term) ? 1 : 0), 0) };
  }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score);
  if (ranked.length) {
    const matches = ranked.slice(0, 3).map(({ entry }) => `• ${entry.senderName || "Speaker"}: ${entry.translatedText || entry.originalText}`).join("\n");
    return `OmniCopilot (Local): The closest recorded discussion is:\n${matches}`;
  }
  return `OmniCopilot (Local): I couldn't find that in the ${transcripts.length} recorded utterance(s). I only answer from this meeting's transcript and action items.`;
}

function cancelCopilotRequest(requestId) {
  const pending = state.copilotPendingRequests[requestId];
  if (!pending) return;
  if (typeof pending === "object") {
    clearTimeout(pending.timer);
    pending.controller?.abort();
  } else {
    clearTimeout(pending);
  }
}

function renderCopilotMessage(text, role) {
  if (!copilotMessages) return;
  const bubble = document.createElement("div");
  bubble.className = `chat-bubble ${role}`;

  if (role === "bot") {
    bubble.innerHTML = `
      <div class="chat-bot-avatar">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2563EB" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
      </div>
      <div class="chat-text">${escapeHtml(text).replace(/\n/g, "<br>")}</div>
    `;
  } else {
    bubble.innerHTML = `<div class="chat-text">${escapeHtml(text)}</div>`;
  }

  copilotMessages.appendChild(bubble);
  copilotMessages.scrollTop = copilotMessages.scrollHeight;
}

// Refresh Minutes of Meeting Summary from backend
async function refreshMeetingSummary() {
  if (state.isConnected) {
    try {
      const res = await fetch(`/api/rooms/${encodeURIComponent(state.roomId)}/generate-summary`, { method: "POST" });
      if (res.ok) {
        const mom = await res.json();
        if (summaryText && mom.summary) summaryText.textContent = mom.summary;
        if (decisionText) {
          if (mom.keyDecisions && mom.keyDecisions.length > 0) {
            decisionText.innerHTML = mom.keyDecisions.map((d) => `• ${escapeHtml(d)}`).join("<br>");
          } else {
            decisionText.textContent = "No explicit decisions or agreements recorded yet.";
          }
        }
        if (notesContent) {
          if (mom.totalUtterances > 0 || mom.actionItems.length > 0) {
            notesContent.innerHTML = `
              <p><strong>Attendees:</strong> ${mom.participants.length ? mom.participants.join(", ") : "None recorded"}</p>
              <p><strong>Languages:</strong> ${mom.languages.length ? mom.languages.join(", ") : "None"}</p>
              <p><strong>Summary:</strong> ${escapeHtml(mom.summary)}</p>
            `;
          }
        }
      }
    } catch (e) {
      console.warn("Could not fetch room summary:", e);
    }
  }
}

// Export MoM Document (.md)
async function exportMinutesOfMeeting() {
  if (state.isConnected) {
    try {
      const res = await fetch(`/api/rooms/${encodeURIComponent(state.roomId)}/export-markdown`);
      if (res.ok) {
        const markdown = await res.text();
        downloadFile(markdown, `OmniMeet_MoM_${state.roomId}.md`, "text/markdown");
        showToast("Minutes of Meeting exported from server!");
        return;
      }
    } catch (err) {
      console.warn("Server markdown export failed, using local export:", err);
    }
  }

  // Local Standalone Export Fallback (clearly labeled)
  let mom = `# OmniMeet AI — Meeting Minutes (Local Browser Export)\n\n`;
  mom += `> **Notice:** Exported from local browser session memory (Gateway disconnected).\n\n`;
  mom += `**Room ID:** \`${state.roomId}\`  \n`;
  mom += `**Date:** ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}  \n`;
  mom += `**Duration:** ${meetingTimer?.textContent || "00:00"}  \n\n`;

  const attendees = [state.userName, ...Object.values(state.peers).map((p) => p.name)];
  mom += `**Participants:** ${attendees.join(", ")}  \n\n---\n\n`;

  mom += `### 1. Action Items\n`;
  if (!state.actionItems || state.actionItems.length === 0) {
    mom += `_No action items recorded._\n\n`;
  } else {
    state.actionItems.forEach((a) => {
      const chk = a.completed ? "[x]" : "[ ]";
      mom += `- ${chk} **[${(a.priority || "medium").toUpperCase()}]** ${a.task} (@${a.assignee || "Team"})\n`;
    });
    mom += `\n`;
  }

  mom += `### 2. Dialogue Transcripts\n`;
  if (!state.transcripts || state.transcripts.length === 0) {
    mom += `_No dialogue recorded in this session._\n`;
  } else {
    state.transcripts.forEach((t) => {
      const lang = (t.sourceLanguage || "en").toUpperCase();
      mom += `- **${t.senderName}** (${lang}): ${t.originalText}\n`;
      if (t.translatedText && t.translatedText !== t.originalText) {
        mom += `  > *Translation:* ${t.translatedText}\n`;
      }
    });
  }

  downloadFile(mom, `OmniMeet_Local_MoM_${state.roomId}.md`, "text/markdown");
  showToast("Local meeting notes exported!");
}

function downloadFile(content, fileName, contentType) {
  const a = document.createElement("a");
  const file = new Blob([content], { type: contentType });
  a.href = URL.createObjectURL(file);
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ============================================================
//  DEMO SIMULATION (Clearly Isolated with [DEMO] Badges)
// ============================================================
function runSimulationDemo() {
  if (!startDemoBtn) return;
  if (state.currentView !== "meeting") {
    showToast("Join the meeting before starting the demo");
    return;
  }
  startDemoBtn.disabled = true;
  startDemoBtn.innerHTML = `<span>Simulating...</span>`;
  showToast("Running demo simulation (clearly labeled sample data)");

  // Add demo peers with isDemo: true flag
  addRemotePeer({ senderId: "demo_sofia", name: "Sofia Martinez (Demo)", lang: "es", initials: "SM", isDemo: true });
  addRemotePeer({ senderId: "demo_yuki", name: "Yuki Tanaka (Demo)", lang: "ja", initials: "YT", isDemo: true });

  const script = [
    {
      speaker: "Sofia Martinez (Demo)",
      senderId: "demo_sofia",
      orig: "Podemos realizar las pruebas de integración en producción esta tarde.",
      trans: "We can conduct the production integration tests this afternoon.",
      lang: "es",
      isDemo: true,
      action: {
        task: "Verify production integration testing pipeline",
        assignee: "Sofia Martinez (Demo)",
        priority: "high"
      },
      delay: 1500
    },
    {
      speaker: "Yuki Tanaka (Demo)",
      senderId: "demo_yuki",
      orig: "金曜日までにドキュメントの多言語対応セクションを完成させます。",
      trans: "I will complete the multilingual documentation section by Friday.",
      lang: "ja",
      isDemo: true,
      action: {
        task: "Complete multilingual documentation section",
        assignee: "Yuki Tanaka (Demo)",
        priority: "medium"
      },
      delay: 4500
    }
  ];

  script.forEach((item) => {
    setTimeout(() => {
      renderConversationItem({
        senderId: item.senderId,
        senderName: item.speaker,
        sourceLanguage: item.lang,
        targetLanguage: state.targetLang || "en",
        originalText: item.orig,
        translatedText: item.trans,
        isDemo: true,
        timestamp: Date.now()
      });

      if (item.action) {
        handleReceivedActionItem({
          type: "action_item",
          id: "act_demo_" + Date.now(),
          roomId: state.roomId,
          task: item.action.task,
          assignee: item.action.assignee,
          priority: item.action.priority,
          dueContext: "Demo Simulation",
          completed: false,
          isDemo: true,
          timestamp: Date.now()
        });
      }
    }, item.delay);
  });

  setTimeout(() => {
    startDemoBtn.disabled = false;
    startDemoBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
      <span>Demo</span>
    `;
    if (clearDemoBtn) clearDemoBtn.classList.remove("hidden");
    showToast("Simulation completed! Click 'Clear Demo' to return to empty room state.");
  }, 6500);
}

function clearDemoData() {
  document.querySelectorAll('.conversation-item[data-is-demo="true"]').forEach((el) => el.remove());
  state.demoTranscripts = [];
  state.demoActionItems = [];
  delete state.peers["demo_sofia"];
  delete state.peers["demo_yuki"];
  renderRemotePeers();
  updateParticipantCount();
  if (state.transcripts.length === 0 && transcriptEmptyState) {
    transcriptEmptyState.style.display = "flex";
  }
  renderActionItemsList();
  if (clearDemoBtn) clearDemoBtn.classList.add("hidden");
  showToast("Demo simulation cleared");
}

// ============================================================
//  WEB SPEECH API RECOGNITION (BROWSER NATIVE)
// ============================================================
function setupWebSpeechRecognition() {
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRec) {
    if (speechRecognitionStatus) {
      speechRecognitionStatus.textContent = "Web Speech API not supported in this browser. Use speech test bar below.";
    }
    return;
  }

  const rec = new SpeechRec();
  rec.continuous = true;
  rec.interimResults = false;
  rec.lang = getSpeechLangCode(state.sourceLang);

  rec.onstart = () => {
    state.isRecognizing = true;
    state.speechRecognitionBlocked = false;
    state.speechRestartAttempts = 0;
    if (speechRecognitionStatus) speechRecognitionStatus.textContent = "Live speech captions are active.";
  };

  rec.onend = () => {
    state.isRecognizing = false;
    clearTimeout(state.speechRestartTimer);
    state.speechRestartTimer = null;
    const shouldRun = state.currentView === "meeting" && !state.isMuted && !state.aiPipelineStatus.asrLoaded;
    if (shouldRun && !state.speechRecognitionBlocked) {
      const delay = Math.min(700 * (2 ** state.speechRestartAttempts), 8000);
      state.speechRestartAttempts += 1;
      state.speechRestartTimer = setTimeout(() => syncSpeechRecognitionMode(), delay);
    }
  };

  rec.onresult = async (event) => {
    const last = event.results.length - 1;
    const text = event.results[last][0].transcript.trim();
    if (text) {
      await broadcastSpeechUtterance(text, state.sourceLang);
    }
  };

  rec.onerror = (e) => {
    state.isRecognizing = false;
    if (e.error !== "no-speech") {
      console.log("[SpeechRecognition] Notice:", e.error);
    }
    if (e.error === "not-allowed" || e.error === "service-not-allowed") {
      state.speechRecognitionBlocked = true;
      if (speechRecognitionStatus) speechRecognitionStatus.textContent = "Microphone or speech recognition permission is blocked. Allow microphone access in your browser, then reload.";
      showToast("Allow microphone access in your browser to enable live captions.");
    } else if (e.error !== "no-speech" && speechRecognitionStatus) {
      speechRecognitionStatus.textContent = `Speech recognition paused (${e.error}). Check your connection and microphone.`;
    }
  };

  state.speechRecognition = rec;
}

function syncSpeechRecognitionMode() {
  if (!state.speechRecognition) return;
  const shouldRun = state.currentView === "meeting" && !state.isMuted && !state.aiPipelineStatus.asrLoaded;
  if (!shouldRun) {
    clearTimeout(state.speechRestartTimer);
    state.speechRestartTimer = null;
    if (state.isRecognizing) {
      try { state.speechRecognition.stop(); } catch (err) {}
    }
    state.isRecognizing = false;
  } else if (!state.isRecognizing && !state.speechRecognitionBlocked) {
    try {
      state.speechRecognition.lang = getSpeechLangCode(state.sourceLang);
      state.speechRecognition.start();
      // Some implementations do not emit onstart consistently; avoid rapid duplicate starts.
      state.isRecognizing = true;
    } catch (err) {
      // Browser throws while recognition is already starting; onend/onstart will resync it.
    }
  }
}

// Text to Speech
function setupSpeechSynthesis() {
  if ("speechSynthesis" in window) {
    window.speechSynthesis.onvoiceschanged = () => {};
  }
}

function speakText(text) {
  if (!("speechSynthesis" in window) || !text) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.0;
  utterance.pitch = 1.0;
  utterance.lang = getSpeechLangCode(state.targetLang);
  window.speechSynthesis.speak(utterance);
}

// Multi-Tab BroadcastChannel (Same-browser multi-tab helper)
function initRoomBroadcast() {
  if (!("BroadcastChannel" in window)) return;
  if (state.broadcastChannel) {
    try { state.broadcastChannel.close(); } catch (e) {}
  }

  state.broadcastChannel = new BroadcastChannel(`omnimeet_room_${state.roomId}`);
  state.broadcastChannel.onmessage = async (event) => {
    const data = event.data;
    if (!data || data.senderId === state.userId) return;

    switch (data.type) {
      case "peer_joined":
        addRemotePeer(data.peer);
        break;
      case "peer_left":
        removeRemotePeer(data.senderId);
        break;
      case "peer_state_update":
        handlePeerStateUpdate(data);
        break;
      case "subtitle_stream":
        renderReceivedSubtitle(data);
        break;
      case "action_item":
        handleReceivedActionItem(data);
        break;
      case "action_item_update":
        handleActionItemUpdate(data);
        break;
    }
  };
}

function announcePresence() {
  if (state.broadcastChannel) {
    state.broadcastChannel.postMessage({
      type: "peer_joined",
      senderId: state.userId,
      peer: {
        senderId: state.userId,
        name: state.userName,
        lang: state.sourceLang,
        targetLang: state.targetLang,
        initials: state.userInitials,
        isMuted: state.isMuted,
        isCameraOn: state.isCameraOn,
        isScreenSharing: state.isScreenSharing
      }
    });
  }
}

// ============================================================
//  UI NAVIGATION, MODALS & EVENT LISTENERS
// ============================================================

function setupEventListeners() {
  // Theme Toggle
  themeToggleBtn?.addEventListener("click", toggleTheme);

  // Original Text Toggle
  showOriginalToggle?.addEventListener("change", (e) => {
    state.showOriginal = e.target.checked;
    document.querySelectorAll(".item-original-text").forEach((el) => {
      el.style.display = state.showOriginal ? "block" : "none";
    });
    showToast(state.showOriginal ? "Original transcript shown" : "Original transcript hidden");
  });

  // Language selectors
  userSourceLang?.addEventListener("change", (e) => {
    state.sourceLang = e.target.value;
    updateSpeechTestUserLabel();
    if (localLangTag) localLangTag.textContent = getLanguageName(state.sourceLang);
    if (state.speechRecognition) {
      state.speechRecognition.lang = getSpeechLangCode(state.sourceLang);
    }
    notifyLanguageUpdate();
    showToast(`Input Language: ${e.target.options[e.target.selectedIndex].text}`);
  });

  userTargetLang?.addEventListener("change", (e) => {
    state.targetLang = e.target.value;
    notifyLanguageUpdate();
    showToast(`Translating into: ${e.target.options[e.target.selectedIndex].text}`);
  });

  // Audio TTS Toggle
  toggleTranslatedAudioBtn?.addEventListener("click", () => {
    state.translatedAudioOn = !state.translatedAudioOn;
    toggleTranslatedAudioBtn.classList.toggle("active", state.translatedAudioOn);
    if (translatedAudioLabel) {
      translatedAudioLabel.textContent = state.translatedAudioOn ? "Translated audio on" : "Translated audio muted";
    }
    showToast(state.translatedAudioOn ? "Audio translation active" : "Audio translation muted");
  });

  // Controls Dock
  toggleMicBtn?.addEventListener("click", toggleMicrophone);
  toggleCameraBtn?.addEventListener("click", toggleCamera);
  toggleScreenBtn?.addEventListener("click", toggleScreenShare);

  raiseHandBtn?.addEventListener("click", () => {
    state.isHandRaised = !state.isHandRaised;
    raiseHandBtn.classList.toggle("active-blue", state.isHandRaised);
    updateLocalHandRaiseUI();
    broadcastLocalPeerState();
    showToast(state.isHandRaised ? "You raised your hand ✋" : "Hand lowered");
  });

  toggleTranslateDockBtn?.addEventListener("click", () => {
    state.subtitlesEnabled = !state.subtitlesEnabled;
    toggleTranslateDockBtn.classList.toggle("active-blue", state.subtitlesEnabled);
    if (transcriptFeed) transcriptFeed.style.opacity = state.subtitlesEnabled ? "1" : "0.3";
    showToast(state.subtitlesEnabled ? "Subtitles enabled" : "Subtitles disabled");
  });

  toggleCopilotDockBtn?.addEventListener("click", () => {
    copilotSidebar?.classList.toggle("collapsed");
  });

  collapseSidebarBtn?.addEventListener("click", () => {
    copilotSidebar?.classList.add("collapsed");
  });

  openChatBtn?.addEventListener("click", () => {
    copilotSidebar?.classList.remove("collapsed");
    switchCopilotTab("tab-chat");
  });

  openMoreBtn?.addEventListener("click", () => {
    settingsModal?.classList.remove("hidden");
  });

  leaveCallBtn?.addEventListener("click", handleLeaveCall);

  // Home Screen Listeners
  btnNewMeeting?.addEventListener("click", handleCreateNewMeeting);
  btnJoinFromInput?.addEventListener("click", handleJoinFromCodeInput);
  joinMeetingCodeInput?.addEventListener("input", (e) => {
    const val = e.target.value.trim();
    if (btnJoinFromInput) btnJoinFromInput.disabled = val.length === 0;
    if (homeJoinError) homeJoinError.classList.add("hidden");
  });
  joinMeetingCodeInput?.addEventListener("keypress", (e) => {
    if (e.key === "Enter") handleJoinFromCodeInput();
  });
  homeUserNameInput?.addEventListener("input", (e) => {
    state.userName = e.target.value.trim() || "Alex Morgan";
    if (lobbyDisplayNameInput) lobbyDisplayNameInput.value = state.userName;
    updateUserAvatar();
  });
  homeUserLangSelect?.addEventListener("change", (e) => {
    state.sourceLang = e.target.value;
    if (lobbySpokenLang) lobbySpokenLang.value = e.target.value;
    updateSpeechTestUserLabel();
  });

  // Top Nav & Rail Navigation
  navHomeBtn?.addEventListener("click", () => switchMainView("home"));
  railBrandLogo?.addEventListener("click", () => switchMainView("home"));
  navLobbyBtn?.addEventListener("click", () => switchMainView("lobby"));
  navMeetingBtn?.addEventListener("click", () => switchMainView("meeting"));

  // Lobby Screen Listeners
  joinMeetingBtn?.addEventListener("click", () => handleJoinMeeting(false));
  joinWithScreenBtn?.addEventListener("click", () => handleJoinMeeting(true));

  lobbyDisplayNameInput?.addEventListener("input", (e) => {
    state.userName = e.target.value.trim() || "Alex Morgan";
    if (homeUserNameInput) homeUserNameInput.value = state.userName;
    updateUserAvatar();
  });
  lobbySpokenLang?.addEventListener("change", (e) => {
    state.sourceLang = e.target.value;
    if (homeUserLangSelect) homeUserLangSelect.value = e.target.value;
    updateSpeechTestUserLabel();
  });
  lobbyTranslateInto?.addEventListener("change", (e) => {
    state.targetLang = e.target.value;
  });

  lobbyToggleMicBtn?.addEventListener("click", toggleLobbyMic);
  lobbyToggleCamBtn?.addEventListener("click", toggleLobbyCamera);
  lobbyTestSoundBtn?.addEventListener("click", playTestChime);
  lobbySettingsBtn?.addEventListener("click", () => settingsModal?.classList.remove("hidden"));

  lobbyMicSelect?.addEventListener("change", (e) => {
    switchMicrophoneDevice(e.target.value);
  });
  lobbyCameraSelect?.addEventListener("change", (e) => {
    switchCameraDevice(e.target.value);
  });

  // In-Meeting Chat Listeners
  sendInMeetingChatBtn?.addEventListener("click", handleSendInMeetingChat);
  inMeetingChatInput?.addEventListener("keypress", (e) => {
    if (e.key === "Enter") handleSendInMeetingChat();
  });

  // Post-Meeting Screen Listeners
  btnRejoinMeeting?.addEventListener("click", () => {
    switchMainView("lobby");
  });
  btnReturnHome?.addEventListener("click", () => {
    switchMainView("home");
  });
  btnViewMeetingRecords?.addEventListener("click", openMeetingRecordsModal);

  // New Meeting Share Modal
  closeNewMeetingModal?.addEventListener("click", () => newMeetingModal?.classList.add("hidden"));
  btnCloseNewMeetingModal?.addEventListener("click", () => newMeetingModal?.classList.add("hidden"));
  btnCopyNewMeetingLink?.addEventListener("click", () => {
    const link = newMeetingLinkInput?.value;
    if (link) copyTextToClipboard(link, "Meeting link copied! 📋");
  });
  btnEnterNewMeetingNow?.addEventListener("click", () => {
    newMeetingModal?.classList.add("hidden");
    switchMainView("lobby");
  });

  // Records Modal
  closeRecordsModal?.addEventListener("click", () => recordsModal?.classList.add("hidden"));
  closeRecordsModalBtn?.addEventListener("click", () => recordsModal?.classList.add("hidden"));
  btnDownloadRecordsMarkdown?.addEventListener("click", downloadCurrentRecordsMarkdown);

  // People Tab
  inviteFromPeopleTabBtn?.addEventListener("click", () => {
    updateMeetingLinkDisplays();
    inviteModal?.classList.remove("hidden");
  });

  // Dock code copy button
  dockCopyCodeBtn?.addEventListener("click", () => {
    copyTextToClipboard(state.meetingCode || state.roomId, "Meeting code copied! 📋");
  });

  // Copilot Tabs
  copilotTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.getAttribute("data-tab");
      switchCopilotTab(target);
      if (target === "tab-notes" || target === "tab-overview") {
        refreshMeetingSummary();
      }
    });
  });

  copySummaryBtn?.addEventListener("click", () => {
    const text = summaryText?.textContent?.trim() || "";
    navigator.clipboard.writeText(text);
    showToast("Summary copied to clipboard!");
  });

  suggestedPromptBtn?.addEventListener("click", () => {
    const q = suggestedPromptBtn.getAttribute("data-query");
    if (q) {
      switchCopilotTab("tab-ask");
      submitCopilotQuestion(q);
    }
  });

  sendCopilotQueryBtn?.addEventListener("click", () => {
    const q = copilotQueryInput?.value?.trim();
    if (q) {
      switchCopilotTab("tab-ask");
      submitCopilotQuestion(q);
      copilotQueryInput.value = "";
    }
  });

  copilotQueryInput?.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      const q = copilotQueryInput?.value?.trim();
      if (q) {
        switchCopilotTab("tab-ask");
        submitCopilotQuestion(q);
        copilotQueryInput.value = "";
      }
    }
  });

  sendCopilotQueryBtn2?.addEventListener("click", () => {
    const q = copilotQueryInput2?.value?.trim();
    if (q) {
      submitCopilotQuestion(q);
      copilotQueryInput2.value = "";
    }
  });

  copilotQueryInput2?.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      const q = copilotQueryInput2?.value?.trim();
      if (q) {
        submitCopilotQuestion(q);
        copilotQueryInput2.value = "";
      }
    }
  });

  exportMomBtn?.addEventListener("click", exportMinutesOfMeeting);
  startDemoBtn?.addEventListener("click", runSimulationDemo);

  // Link copy buttons
  headerCopyLinkBtn?.addEventListener("click", copyMeetingLink);
  lobbyRoomLinkCopyBtn?.addEventListener("click", copyMeetingLink);
  copyShareLinkBtn?.addEventListener("click", copyMeetingLink);

  // Join room by ID in lobby
  lobbyJoinByIdBtn?.addEventListener("click", handleJoinCustomRoom);
  lobbyRoomIdInput?.addEventListener("keypress", (e) => {
    if (e.key === "Enter") handleJoinCustomRoom();
  });

  // Speech test bar
  sendSpeechBtn?.addEventListener("click", handleSendLiveSpeech);
  liveSpeechInput?.addEventListener("keypress", (e) => {
    if (e.key === "Enter") handleSendLiveSpeech();
  });
  quickPhraseSelect?.addEventListener("change", (e) => {
    if (e.target.value) {
      if (liveSpeechInput) liveSpeechInput.value = e.target.value;
      handleSendLiveSpeech();
      e.target.selectedIndex = 0;
    }
  });

  // Transcript Search Filter
  transcriptSearchInput?.addEventListener("input", (e) => {
    state.activeSearchQuery = e.target.value.trim();
    clearTranscriptSearchBtn?.classList.toggle("hidden", !state.activeSearchQuery);
    filterTranscriptItems();
  });

  clearTranscriptSearchBtn?.addEventListener("click", () => {
    if (transcriptSearchInput) transcriptSearchInput.value = "";
    state.activeSearchQuery = "";
    clearTranscriptSearchBtn.classList.add("hidden");
    filterTranscriptItems();
  });

  followLiveBtn?.addEventListener("click", () => {
    if (transcriptFeed) {
      transcriptFeed.scrollTop = transcriptFeed.scrollHeight;
      showToast("Scrolled to latest dialogue");
    }
  });

  // Modals
  invitePeopleBtn?.addEventListener("click", () => {
    updateMeetingLinkDisplays();
    inviteModal?.classList.remove("hidden");
  });
  closeInviteModal?.addEventListener("click", () => inviteModal?.classList.add("hidden"));
  cancelInviteBtn?.addEventListener("click", () => inviteModal?.classList.add("hidden"));

  sendInviteBtn?.addEventListener("click", () => {
    const email = inviteEmailInput?.value?.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showToast("Enter a valid email address");
      inviteEmailInput?.focus();
      return;
    }
    const link = getMeetingShareUrl();
    const subject = encodeURIComponent(`Invitation to OmniMeet Video Call`);
    const body = encodeURIComponent(`Hi,\n\nPlease join the OmniMeet multilingual video conference using the link below:\n\n${link}\n\nBest,\n${state.userName}`);
    if (!email) {
      copyTextToClipboard(link, "Meeting link copied. Share it with your friend!");
      return;
    }
    window.location.href = `mailto:${encodeURIComponent(email)}?subject=${subject}&body=${body}`;
    inviteModal?.classList.add("hidden");
  });

  openSettingsBtn?.addEventListener("click", () => settingsModal?.classList.remove("hidden"));
  audioSettingsBtn?.addEventListener("click", () => settingsModal?.classList.remove("hidden"));
  lobbySettingsBtn?.addEventListener("click", () => settingsModal?.classList.remove("hidden"));
  clearDemoBtn?.addEventListener("click", clearDemoData);
  closeSettingsModal?.addEventListener("click", () => settingsModal?.classList.add("hidden"));
  saveSettingsBtn?.addEventListener("click", () => {
    if (ttsVoiceSelect) state.ttsVoice = ttsVoiceSelect.value;
    settingsModal?.classList.add("hidden");
    showToast("Settings updated");
  });

  helpBtn?.addEventListener("click", () => helpModal?.classList.remove("hidden"));
  closeHelpModal?.addEventListener("click", () => helpModal?.classList.add("hidden"));
  closeHelpModalBtn?.addEventListener("click", () => helpModal?.classList.add("hidden"));

  meetingDetailsBtn?.addEventListener("click", () => {
    const dRoom = document.getElementById("detailsRoomId");
    const dGate = document.getElementById("detailsGatewayStatus");
    const dWebRTC = document.getElementById("detailsWebRTCStatus");
    const dAI = document.getElementById("detailsAiPipelineStatus");
    const dPeers = document.getElementById("detailsPeerCount");

    if (dRoom) dRoom.textContent = state.roomId;
    if (dGate) {
      dGate.textContent = state.isConnected ? "Connected (WebSocket)" : "Disconnected (Local Standby)";
      dGate.style.color = state.isConnected ? "var(--accent-green)" : "var(--accent-red)";
    }
    if (dWebRTC) {
      const activePCs = Object.keys(state.peerConnections).length;
      dWebRTC.textContent = activePCs > 0 ? `${activePCs} P2P WebRTC Connection(s)` : "P2P Mesh Ready";
    }
    if (dAI) {
      dAI.textContent = state.aiPipelineStatus.asrLoaded
        ? "Faster-Whisper Active"
        : "Web Speech API (Browser Fallback)";
    }
    if (dPeers) dPeers.textContent = `${1 + Object.keys(state.peers).length} participant(s)`;

    meetingDetailsModal?.classList.remove("hidden");
  });
  closeDetailsModal?.addEventListener("click", () => meetingDetailsModal?.classList.add("hidden"));
  closeDetailsModalBtn?.addEventListener("click", () => meetingDetailsModal?.classList.add("hidden"));

  // Add Action Item Modal
  openAddActionModalBtn?.addEventListener("click", () => {
    if (newActionTaskInput) newActionTaskInput.value = "";
    if (newActionAssigneeInput) newActionAssigneeInput.value = state.userName;
    addActionModal?.classList.remove("hidden");
  });
  closeAddActionModal?.addEventListener("click", () => addActionModal?.classList.add("hidden"));
  cancelAddActionBtn?.addEventListener("click", () => addActionModal?.classList.add("hidden"));

  saveNewActionBtn?.addEventListener("click", () => {
    const task = newActionTaskInput?.value?.trim();
    if (!task) {
      showToast("Please enter a task description");
      newActionTaskInput?.focus();
      return;
    }
    const assignee = newActionAssigneeInput?.value?.trim() || state.userName;
    const prio = newActionPrioritySelect?.value || "medium";
    createManualActionItem(task, assignee, prio);
    addActionModal?.classList.add("hidden");
    showToast("Action item added!");
  });

  // TTS play on conversation items
  document.addEventListener("click", (e) => {
    const ttsBtn = e.target.closest(".tts-play-btn");
    if (ttsBtn) {
      const text = ttsBtn.getAttribute("data-text");
      if (text) speakText(text);
    }
  });
}

function notifyLanguageUpdate() {
  if (state.ws && state.isConnected) {
    state.ws.send(JSON.stringify({
      type: "language_update",
      roomId: state.roomId,
      preferredLanguage: state.sourceLang,
      targetLanguage: state.targetLang
    }));
  }
}

function switchCopilotTab(tabId) {
  copilotTabs.forEach((t) => t.classList.toggle("active", t.getAttribute("data-tab") === tabId));
  copilotPanels.forEach((p) => p.classList.toggle("active", p.id === tabId));
  if (tabId === "tab-overview" || tabId === "tab-notes") {
    refreshMeetingSummary();
  }
}

// ============================================================
//  NEW MEETING & CODE VALIDATION FLOWS
// ============================================================

async function handleCreateNewMeeting() {
  btnNewMeeting.disabled = true;
  btnNewMeeting.innerHTML = `<span>Creating...</span>`;

  try {
    const res = await fetch("/api/meetings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({
        title: `${state.userName}'s Meeting`,
        createdBy: state.userName
      })
    });

    if (!res.ok) {
      throw new Error(`Server returned ${res.status}`);
    }

    const data = await res.json();
    const meetingCode = data.code || data.meetingCode;
    const meetingId = data.id || data.meetingId;
    if (!meetingCode || !meetingId) throw new Error("The gateway returned an incomplete meeting record");
    state.meetingId = meetingId;
    state.meetingCode = meetingCode;
    state.roomId = meetingCode;
    initRoomBroadcast();

    // Update URL without page reload
    window.history.pushState({}, "", `/meet/${meetingCode}`);

    // Populate New Meeting share modal
    const shareUrl = getMeetingShareUrl();
    if (newMeetingLinkInput) newMeetingLinkInput.value = shareUrl;
    if (newMeetingCodeSpan) newMeetingCodeSpan.textContent = meetingCode;

    // Show share modal
    newMeetingModal?.classList.remove("hidden");
    updateMeetingLinkDisplays();
  } catch (err) {
    console.warn("Failed to create meeting:", err);
    showToast(`Could not create a meeting: ${err.message || "gateway unavailable"}`);
  } finally {
    btnNewMeeting.disabled = false;
    btnNewMeeting.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
      <span>New meeting</span>
    `;
  }
}

async function handleJoinFromCodeInput() {
  const rawInput = joinMeetingCodeInput?.value?.trim();
  if (!rawInput) return;

  btnJoinFromInput.disabled = true;
  btnJoinFromInput.textContent = "Checking...";

  let success = false;
  try {
    success = await validateAndOpenRoom(rawInput, true);
  } finally {
    btnJoinFromInput.disabled = false;
    btnJoinFromInput.textContent = "Join";
  }

  if (!success) {
    if (homeJoinError) {
      homeJoinError.classList.remove("hidden");
      if (homeJoinErrorText) homeJoinErrorText.textContent = "Invalid or expired meeting code. Please verify.";
    }
  }
}

async function validateAndOpenRoom(codeOrUrl, updateHistory = true) {
  try {
    const raw = String(codeOrUrl || "").trim();
    let candidate = raw;
    try {
      const parsed = new URL(raw, window.location.origin);
      const pathCode = parsed.pathname.match(/\/meet\/([a-zA-Z0-9_-]+)/i)?.[1];
      candidate = pathCode || parsed.searchParams.get("room") || parsed.searchParams.get("code") || raw;
    } catch (err) {}
    const cleaned = candidate.replace(/[^a-zA-Z0-9_-]/g, "").toLowerCase();

    if (!cleaned) return false;

    // Validate with backend
    const res = await fetch(`/api/meetings/${encodeURIComponent(cleaned)}`, {
      signal: AbortSignal.timeout(8000)
    });
    if (res.ok) {
      const data = await res.json();
      if (data.isActive === false) return false;
      state.meetingId = data.id || data.meetingId;
      state.meetingCode = data.code || data.meetingCode || cleaned;
      state.roomId = data.code || data.meetingCode || cleaned;
      initRoomBroadcast();

      if (updateHistory) {
        window.history.pushState({}, "", `/meet/${state.roomId}`);
      }

      switchMainView("lobby");
      return true;
    } else {
      // If 404 or validation fails on an explicit join
      return false;
    }
  } catch (err) {
    console.warn("Meeting validation failed:", err);
    showToast("Could not validate the meeting. Check that OmniMeet is running and try again.");
    return false;
  }
}

function getMeetingShareUrl() {
  const code = state.meetingCode || state.roomId;
  const baseUrl = state.publicAppUrl || window.location.origin;
  return `${baseUrl}/meet/${encodeURIComponent(code)}`;
}

async function loadPublicAppConfig() {
  try {
    const response = await fetch("/api/config", { cache: "no-store" });
    if (!response.ok) return;
    const config = await response.json();
    state.publicAppUrl = (config.publicAppUrl || "").replace(/\/$/, "");
    updateMeetingLinkDisplays();
  } catch (err) {
    // Sharing still works for devices that can reach this host directly.
  }
}

function updateMeetingLinkDisplays() {
  const code = state.meetingCode || state.roomId;
  const shareUrl = getMeetingShareUrl();
  if (lobbyRoomName) lobbyRoomName.textContent = code;
  if (lobbyRoomLinkInput) lobbyRoomLinkInput.value = shareUrl;
  if (meetingShareLink) meetingShareLink.value = shareUrl;
  if (newMeetingLinkInput) newMeetingLinkInput.value = shareUrl;
  if (newMeetingCodeSpan) newMeetingCodeSpan.textContent = code;
  if (headerRoomLabel) headerRoomLabel.textContent = code;
  if (dockMeetingCodeDisplay) dockMeetingCodeDisplay.textContent = code;
  const inviteHint = inviteModal?.querySelector(".modal-helper-text");
  if (inviteHint) {
    inviteHint.textContent = !state.publicAppUrl && ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname)
      ? "This is a local development link. Friends on other devices cannot open it until the app is deployed or exposed through a secure tunnel."
      : "Share this link with your guests. They can open it to join the meeting.";
  }
}

function copyMeetingLink() {
  copyTextToClipboard(getMeetingShareUrl(), "Meeting link copied! 📋");
}

async function handleJoinCustomRoom() {
  const code = lobbyRoomIdInput?.value?.trim();
  if (!code) {
    showToast("Enter a meeting code first");
    lobbyRoomIdInput?.focus();
    return;
  }

  if (lobbyJoinByIdBtn) lobbyJoinByIdBtn.disabled = true;
  try {
    const joined = await validateAndOpenRoom(code, true);
    if (!joined) showToast("That meeting code was not found. Check it and try again.");
  } finally {
    if (lobbyJoinByIdBtn) lobbyJoinByIdBtn.disabled = false;
  }
}

// ============================================================
//  LOBBY "GREEN ROOM" PREVIEW & AUDIO METER
// ============================================================

async function startLobbyPreview() {
  // If camera was already requested
  if (state.isCameraOn && !state.cameraStream) {
    await toggleLobbyCamera();
  }

  // Audio level meter visualization
  try {
    if (!state.mediaStream && !state.isMuted) {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      state.mediaStream = stream;
      attachLobbyMicMeter(stream);
    } else if (state.mediaStream) {
      attachLobbyMicMeter(state.mediaStream);
    }
  } catch (err) {
    console.warn("[Lobby] Mic preview not granted or available:", err);
  }
}

function attachLobbyMicMeter(stream) {
  try {
    if (!state.audioContext) {
      state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    const source = state.audioContext.createMediaStreamSource(stream);
    const analyser = state.audioContext.createAnalyser();
    analyser.fftSize = 64;
    source.connect(analyser);
    state.micAnalyser = analyser;

    const bars = lobbyMicMeter?.querySelectorAll(".meter-bar");
    if (!bars) return;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    function updateMeter() {
      if (state.currentView !== "lobby" || !state.micAnalyser) {
        return;
      }
      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
      const avg = sum / dataArray.length;

      // Map to 5 bars
      const activeCount = state.isMuted ? 0 : Math.min(5, Math.floor(avg / 15));
      bars.forEach((bar, idx) => {
        bar.classList.toggle("act", idx < activeCount);
      });

      state.micAnimFrame = requestAnimationFrame(updateMeter);
    }

    if (state.micAnimFrame) cancelAnimationFrame(state.micAnimFrame);
    state.micAnimFrame = requestAnimationFrame(updateMeter);
  } catch (e) {
    console.warn("Could not attach mic meter:", e);
  }
}

function stopLobbyPreview() {
  if (state.micAnimFrame) {
    cancelAnimationFrame(state.micAnimFrame);
    state.micAnimFrame = null;
  }
  const bars = lobbyMicMeter?.querySelectorAll(".meter-bar");
  bars?.forEach((b) => b.classList.remove("act"));
}

function toggleLobbyMic() {
  state.isMuted = !state.isMuted;
  lobbyToggleMicBtn?.classList.toggle("active", !state.isMuted);
  if (toggleMicBtn) {
    toggleMicBtn.classList.toggle("muted-state", state.isMuted);
  }
  if (localMicIcon) {
    localMicIcon.className = `mic-status-icon ${state.isMuted ? "muted" : "unmuted"}`;
  }
  showToast(state.isMuted ? "Microphone muted" : "Microphone active");
}

async function switchMicrophoneDevice(deviceId) {
  if (!deviceId || deviceId === "default") return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: { exact: deviceId } }
    });
    if (state.mediaStream) {
      state.mediaStream.getAudioTracks().forEach((t) => t.stop());
    }
    state.mediaStream = stream;
    attachLobbyMicMeter(stream);
    showToast("Microphone switched");
  } catch (err) {
    showToast("Could not switch microphone");
  }
}

async function switchCameraDevice(deviceId) {
  if (!deviceId || deviceId === "default") return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: deviceId } }
    });
    if (state.cameraStream) {
      state.cameraStream.getVideoTracks().forEach((t) => t.stop());
    }
    state.cameraStream = stream;
    state.isCameraOn = true;
    if (lobbyPreviewVideo) {
      lobbyPreviewVideo.srcObject = stream;
      lobbyPreviewVideo.classList.remove("hidden");
    }
    if (lobbyAvatarFallback) lobbyAvatarFallback.classList.add("hidden");
    if (localVideo) {
      localVideo.srcObject = stream;
      localVideo.classList.remove("hidden");
    }
    if (avatarFallbackLocal) avatarFallbackLocal.classList.add("hidden");
    showToast("Camera switched");
  } catch (err) {
    showToast("Could not switch camera");
  }
}

// ============================================================
//  JOINING & LEAVING THE ACTIVE MEETING

async function handleJoinMeeting(startWithScreen = false) {
  if (state.isJoining) return;
  state.isJoining = true;
  if (joinMeetingBtn) joinMeetingBtn.disabled = true;
  if (joinWithScreenBtn) joinWithScreenBtn.disabled = true;

  try {
    state.userName = lobbyDisplayNameInput?.value?.trim() || homeUserNameInput?.value?.trim() || state.userName || "Guest";
    state.sourceLang = lobbySpokenLang?.value || homeUserLangSelect?.value || state.sourceLang;
    state.targetLang = lobbyTranslateInto?.value || state.targetLang;
    updateUserAvatar();
    if (meetingTitle) meetingTitle.textContent = state.meetingCode || state.roomId;
    if (headerRoomLabel) headerRoomLabel.textContent = state.meetingCode || state.roomId;
    if (dockMeetingCodeDisplay) dockMeetingCodeDisplay.textContent = state.meetingCode || state.roomId;

    stopLobbyPreview();
    if (state.isMuted) {
      stopAudioCapture();
    } else {
      await startAudioCapture();
    }

    if (state.cameraStream?.active && localVideo) {
      localVideo.srcObject = state.cameraStream;
      localVideo.classList.remove("hidden");
      avatarFallbackLocal?.classList.add("hidden");
    }

    state.meetingSeconds = 0;
    updateMeetingClock();
    if (state.timerInterval) clearInterval(state.timerInterval);
    state.timerInterval = setInterval(updateMeetingClock, 1000);
    switchMainView("meeting");
    connectWebSocket();
    syncSpeechRecognitionMode();

    if (startWithScreen) {
      // Let the meeting screen and socket initialize before requesting screen capture.
      setTimeout(() => toggleScreenShare(), 300);
    }
    showToast("Joining meeting...");
  } catch (err) {
    console.error("[Meeting] Could not join:", err);
    showToast(`Could not join the meeting: ${err.message || err}`);
  } finally {
    state.isJoining = false;
    if (joinMeetingBtn) joinMeetingBtn.disabled = false;
    if (joinWithScreenBtn) joinWithScreenBtn.disabled = false;
  }
}

function updateMeetingClock() {
  state.meetingSeconds += 1;
  const minutes = Math.floor(state.meetingSeconds / 60);
  const seconds = state.meetingSeconds % 60;
  const display = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  if (meetingTimer) meetingTimer.textContent = display;
  if (metaDuration) metaDuration.textContent = display;
}

function handleLeaveCall() {
  if (state.wsReconnectTimer) {
    clearTimeout(state.wsReconnectTimer);
    state.wsReconnectTimer = null;
  }
  state.wsReconnectAttempts = 0;
  state.wsHasConnected = false;

  if (state.timerInterval) {
    clearInterval(state.timerInterval);
    state.timerInterval = null;
  }
  if (state.summaryRefreshInterval) {
    clearInterval(state.summaryRefreshInterval);
    state.summaryRefreshInterval = null;
  }

  Object.keys(state.copilotPendingRequests).forEach(cancelCopilotRequest);
  state.copilotPendingRequests = {};

  try { state.speechRecognition?.stop(); } catch (err) {}
  state.isRecognizing = false;
  state.isMuted = true;
  stopAudioCapture();

  [state.cameraStream, state.screenStream].forEach((stream) => {
    stream?.getTracks().forEach((track) => track.stop());
  });
  state.cameraStream = null;
  state.screenStream = null;
  state.isCameraOn = false;
  state.isScreenSharing = false;

  cleanupAllPeerConnections();
  try { state.livekitRoom?.disconnect(); } catch (err) {}
  state.livekitRoom = null;

  if (state.broadcastChannel) {
    try { state.broadcastChannel.postMessage({ type: "peer_left", senderId: state.userId }); } catch (err) {}
  }
  state.isConnected = false;
  if (state.ws) {
    try { state.ws.close(); } catch (err) {}
    state.ws = null;
  }

  state.peers = {};
  renderRemotePeers();
  updateParticipantCount();
  if (localVideo) {
    localVideo.srcObject = null;
    localVideo.classList.add("hidden");
  }
  if (avatarFallbackLocal) avatarFallbackLocal.classList.remove("hidden");
  switchMainView("post-meeting");
  if (postMeetingSubtitle) postMeetingSubtitle.textContent = `You left meeting ${state.meetingCode || state.roomId}. Your meeting records are available below.`;
}

function updateSpeechTestUserLabel() {
  if (speechActiveUserLabel) {
    const src = getLanguageName(state.sourceLang);
    speechActiveUserLabel.textContent = `You (${src})`;
  }
}

async function toggleLobbyCamera() {
  if (state.isCameraOn) {
    state.isCameraOn = false;
    if (lobbyPreviewVideo) {
      lobbyPreviewVideo.srcObject = null;
      lobbyPreviewVideo.classList.add("hidden");
    }
    if (lobbyPreviewImg) lobbyPreviewImg.classList.remove("hidden");
    lobbyToggleCamBtn?.classList.remove("active");
  } else {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      state.cameraStream = stream;
      state.isCameraOn = true;
      if (lobbyPreviewVideo) {
        lobbyPreviewVideo.srcObject = stream;
        lobbyPreviewVideo.classList.remove("hidden");
      }
      if (lobbyPreviewImg) lobbyPreviewImg.classList.add("hidden");
      lobbyToggleCamBtn?.classList.add("active");
    } catch (err) {
      showToast("Camera unavailable: " + err.message);
    }
  }
}

function playTestChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
    showToast("Speaker test sound playing 🔔");
  } catch (err) {
    showToast("Audio device ready");
  }
}

// Toast System
function showToast(msg) {
  if (!toastContainer) return;
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = msg;
  toastContainer.appendChild(toast);
  setTimeout(() => toast.remove(), 2800);
}

// Utilities
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getLanguageName(code) {
  const map = {
    en: "English",
    es: "Spanish",
    ja: "Japanese",
    fr: "French",
    hi: "Hindi",
    de: "German",
    auto: "Auto"
  };
  return map[code] || "English";
}

function getSpeechLangCode(code) {
  const map = {
    en: "en-US",
    es: "es-ES",
    ja: "ja-JP",
    fr: "fr-FR",
    hi: "hi-IN",
    de: "de-DE",
    auto: "en-US"
  };
  return map[code] || "en-US";
}

function detectPhraseLanguage(text) {
  if (!text) return "en";
  if (/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(text)) return "ja";
  if (/[\u0900-\u097F]/.test(text)) return "hi";
  if (/[áéíóúüñ¿¡]/i.test(text) || /\b(hola|gracias|podemos|equipo|pruebas)\b/i.test(text)) return "es";
  if (/[àâçéèêëîïôûùüÿœæ]/i.test(text) || /\b(bonjour|merci|réunion|tous)\b/i.test(text)) return "fr";
  if (/[äöüß]/i.test(text) || /\b(guten|tag|können|wir)\b/i.test(text)) return "de";
  return state.sourceLang || "en";
}

async function translateTextDetailed(text, srcLang, tgtLang) {
  if (!text) return { translatedText: "", translated: false };
  if (srcLang === tgtLang) return { translatedText: text, translated: true };

  try {
    const gatewayResponse = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, sourceLanguage: srcLang, targetLanguage: tgtLang }),
      signal: AbortSignal.timeout(5000)
    });
    if (gatewayResponse.ok) {
      const result = await gatewayResponse.json();
      if (result.translated && result.translatedText) {
        return { translatedText: result.translatedText, translated: true };
      }
    }
  } catch (err) {
    // Try the browser fallback when the gateway translation provider is unavailable.
  }

  try {
    const sl = srcLang === "auto" ? "auto" : srcLang;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2600);

    const res = await fetch(
      `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tgtLang}&dt=t&q=${encodeURIComponent(text)}`,
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data && data[0]) {
        const translatedText = data[0].map((chunk) => chunk[0]).join("").trim();
        if (translatedText) {
          return { translatedText, translated: true };
        }
      }
    }
  } catch (err) {
    // Offline or network error
  }

  return { translatedText: "", translated: false };
}

async function translateText(text, srcLang, tgtLang) {
  const result = await translateTextDetailed(text, srcLang, tgtLang);
  return result.translated ? result.translatedText : text;
}

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

// ============================================================
//  IN-MEETING CHAT (ROOM-SCOPED & PERSISTENT)
// ============================================================

function handleSendInMeetingChat() {
  const text = inMeetingChatInput?.value?.trim();
  if (!text) return;

  const msg = {
    id: "msg_" + Math.random().toString(36).substring(2, 9),
    meetingId: state.roomId,
    senderId: state.userId,
    senderName: state.userName,
    text: text,
    timestamp: Date.now()
  };

  state.chatMessages.push(msg);
  appendChatMessageToUI(msg);
  if (inMeetingChatInput) inMeetingChatInput.value = "";

  if (state.ws && state.isConnected) {
    state.ws.send(JSON.stringify({
      type: "chat_message",
      roomId: state.roomId,
      message: msg
    }));
  }
}

function handleReceivedChatMessage(data) {
  const msg = data.message || data;
  if (!msg || !msg.text) return;
  if (msg.senderId === state.userId) return; // Already rendered optimistically

  state.chatMessages.push(msg);
  appendChatMessageToUI(msg);

  // If user is currently looking at another tab, notify with toast
  const activeTab = document.querySelector(".copilot-tab.active")?.getAttribute("data-tab");
  if (activeTab !== "tab-chat") {
    showToast(`New message from ${msg.senderName}: "${msg.text.slice(0, 30)}..."`);
  }
}

function renderChatMessagesList() {
  if (!inMeetingChatMessages) return;
  // Keep the system notice
  inMeetingChatMessages.innerHTML = `
    <div class="chat-system-notice">
      <span>Messages are sent to everyone in this room and saved in meeting records.</span>
    </div>
  `;
  state.chatMessages.forEach((msg) => appendChatMessageToUI(msg));
}

function appendChatMessageToUI(msg) {
  if (!inMeetingChatMessages) return;

  const isSelf = msg.senderId === state.userId;
  const timeStr = new Date(msg.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const bubble = document.createElement("div");
  bubble.className = isSelf ? "chat-bubble-self" : "chat-bubble-peer";
  bubble.innerHTML = `
    <div class="sender-info">
      <span>${escapeHtml(msg.senderName || "Participant")}</span>
      <span style="font-size: 10px; color: var(--text-tertiary); margin-left: 4px;">${timeStr}</span>
    </div>
    <div class="message-content">${escapeHtml(msg.text)}</div>
  `;

  inMeetingChatMessages.appendChild(bubble);
  inMeetingChatMessages.scrollTop = inMeetingChatMessages.scrollHeight;
}

// ============================================================
//  LIVEKIT SFU MEDIA TRANSPORT (WITH WEBRTC MESH FALLBACK)
// ============================================================

let livekitClientLoadPromise = null;

function loadLivekitClient() {
  if (typeof LivekitClient !== "undefined") return Promise.resolve(LivekitClient);
  if (!livekitClientLoadPromise) {
    livekitClientLoadPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/livekit-client/dist/livekit-client.umd.min.js";
      script.async = true;
      script.onload = () => {
        if (typeof LivekitClient !== "undefined") resolve(LivekitClient);
        else reject(new Error("LiveKit client loaded without exposing its browser API."));
      };
      script.onerror = () => reject(new Error("Could not load the LiveKit client from the CDN."));
      document.head.appendChild(script);
    });
  }
  return livekitClientLoadPromise;
}

async function handleMediaTransportConfig(mediaConfig) {
  const modePill = document.getElementById("meetingTransportPill");
  const dMode = document.getElementById("detailsTransportMode");

  if (mediaConfig.iceServers && mediaConfig.iceServers.length > 0) {
    state.rtcConfig.iceServers = mediaConfig.iceServers;
  }

  if (mediaConfig.mode === "sfu" && mediaConfig.token) {
    state.mediaTransportMode = "sfu";
    if (modePill) modePill.textContent = "LIVEKIT SFU";
    const livekitUrl = mediaConfig.livekitUrl || mediaConfig.serverUrl;
    if (!livekitUrl) {
      console.warn("[Media] SFU credentials were returned without a LiveKit server URL; using mesh fallback.");
      state.mediaTransportMode = "mesh";
      if (modePill) modePill.textContent = "P2P MESH";
      if (dMode) dMode.textContent = "WebRTC P2P Mesh (STUN/TURN)";
      return;
    }
    if (dMode) dMode.textContent = `LiveKit SFU (${livekitUrl})`;
    console.log("[Media] Connecting via LiveKit SFU:", livekitUrl);

    try {
      const LivekitClient = await loadLivekitClient();
      const room = new LivekitClient.Room({
        adaptiveStream: true,
        dynacast: true
      });
      state.livekitRoom = room;
      state.livekitConnected = false;
      room.on(LivekitClient.RoomEvent.Disconnected, () => {
        state.livekitConnected = false;
        state.livekitPublishedTracks = {};
      });

      room.on(LivekitClient.RoomEvent.TrackSubscribed, (track, publication, participant) => {
        if (track.kind === "video" || track.kind === "audio") {
          const remoteStream = track.mediaStream || new MediaStream([track.mediaStreamTrack]);
          const peerId = participant.identity;
          state.remoteMediaStreams[peerId] = remoteStream;

          const videoEl = document.getElementById(`video-peer-${peerId}`);
          if (videoEl) {
            videoEl.srcObject = remoteStream;
            videoEl.classList.remove("hidden");
            const fallback = document.getElementById(`avatar-fallback-${peerId}`);
            if (fallback) fallback.classList.add("hidden");
          }
        }
      });

      await room.connect(livekitUrl, mediaConfig.token);
      state.livekitConnected = true;
      console.log("[Media] Connected to LiveKit SFU room successfully");

      // Publish local camera track if active
      if (state.cameraStream && state.isCameraOn) {
        const videoTrack = state.cameraStream.getVideoTracks()[0];
        if (videoTrack) await syncLiveKitLocalTrack("video", videoTrack);
      }
      // Publish mic if active
      if (state.mediaStream && !state.isMuted) {
        const audioTrack = state.mediaStream.getAudioTracks()[0];
        if (audioTrack) await syncLiveKitLocalTrack("audio", audioTrack);
      }
    } catch (err) {
      console.warn("[Media] LiveKit connection failed, fallback to P2P mesh:", err);
      state.mediaTransportMode = "mesh";
      state.livekitConnected = false;
      state.livekitPublishedTracks = {};
      if (modePill) modePill.textContent = "P2P MESH";
      if (dMode) dMode.textContent = "WebRTC P2P Mesh (STUN/TURN)";
    }
  } else {
    state.mediaTransportMode = "mesh";
    if (modePill) modePill.textContent = "P2P MESH";
    if (dMode) dMode.textContent = "WebRTC P2P Mesh (STUN/TURN)";
  }
}

// ============================================================
//  POST-MEETING RECORDS & ARCHIVE REVIEW
// ============================================================

async function openMeetingRecordsModal() {
  recordsModal?.classList.remove("hidden");
  if (recordsModalContent) {
    recordsModalContent.innerHTML = `<p style="padding: 20px; text-align: center; color: var(--text-muted);">Fetching persistent records from database...</p>`;
  }

  try {
    const res = await fetch(`/api/meetings/${encodeURIComponent(state.roomId)}/records`);
    if (!res.ok) {
      throw new Error(`Status ${res.status}`);
    }
    const data = await res.json();
    renderMeetingRecordsView(data);
  } catch (err) {
    if (recordsModalContent) {
      recordsModalContent.innerHTML = `
        <div style="padding: 16px; color: var(--accent-red); background: var(--accent-red-light); border-radius: 8px;">
          Failed to load remote records: ${escapeHtml(err.message || "Network error")}
        </div>
      `;
    }
  }
}

function renderMeetingRecordsView(data) {
  if (!recordsModalContent) return;

  const meeting = data.meeting || {};
  const transcripts = data.transcripts || [];
  const chat = data.chatMessages || [];
  const tasks = data.actionItems || [];
  const minutes = data.minutes || {};

  let html = `
    <div style="font-size: 13px; line-height: 1.6;">
      <div style="margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid var(--border-color);">
        <h4 style="margin: 0 0 4px; font-size: 16px; color: var(--text-main);">${escapeHtml(meeting.title || "Meeting Records")}</h4>
        <div style="display: flex; gap: 14px; font-size: 12px; color: var(--text-muted);">
          <span>Code: <strong>${escapeHtml(meeting.meeting_code || state.roomId)}</strong></span>
          <span>Created: ${meeting.created_at ? new Date(meeting.created_at).toLocaleString() : "Recent"}</span>
        </div>
      </div>
  `;

  // Summary
  if (minutes.summary) {
    html += `
      <div style="margin-bottom: 14px;">
        <h5 style="margin: 0 0 4px; color: var(--primary-blue);">Executive Summary</h5>
        <p style="margin: 0; background: var(--bg-subtle); padding: 8px 12px; border-radius: 6px;">${escapeHtml(minutes.summary)}</p>
      </div>
    `;
  }

  // Action Items
  html += `
    <div style="margin-bottom: 14px;">
      <h5 style="margin: 0 0 6px; color: var(--text-main);">Action Items (${tasks.length})</h5>
  `;
  if (tasks.length === 0) {
    html += `<p style="margin: 0; font-size: 12px; color: var(--text-muted);">No action items recorded.</p>`;
  } else {
    html += `<ul style="margin: 0; padding-left: 20px;">`;
    tasks.forEach((t) => {
      const chk = t.completed ? "<s>" : "";
      const chkEnd = t.completed ? "</s>" : "";
      html += `<li>${chk}<strong>${escapeHtml(t.task)}</strong> — @${escapeHtml(t.assignee || "Team")}${chkEnd}</li>`;
    });
    html += `</ul>`;
  }
  html += `</div>`;

  // Chat Messages
  html += `
    <div style="margin-bottom: 14px;">
      <h5 style="margin: 0 0 6px; color: var(--text-main);">In-Meeting Chat (${chat.length})</h5>
  `;
  if (chat.length === 0) {
    html += `<p style="margin: 0; font-size: 12px; color: var(--text-muted);">No chat messages recorded.</p>`;
  } else {
    html += `<div style="max-height: 120px; overflow-y: auto; background: var(--bg-subtle); padding: 8px; border-radius: 6px;">`;
    chat.forEach((m) => {
      html += `<div style="margin-bottom: 4px;"><strong>${escapeHtml(m.sender_name || "User")}:</strong> ${escapeHtml(m.message_text)}</div>`;
    });
    html += `</div>`;
  }
  html += `</div>`;

  // Transcripts
  html += `
    <div>
      <h5 style="margin: 0 0 6px; color: var(--text-main);">Dialogue Transcripts (${transcripts.length})</h5>
  `;
  if (transcripts.length === 0) {
    html += `<p style="margin: 0; font-size: 12px; color: var(--text-muted);">No speech utterances recorded.</p>`;
  } else {
    html += `<div style="max-height: 140px; overflow-y: auto; background: var(--bg-subtle); padding: 8px; border-radius: 6px;">`;
    transcripts.forEach((t) => {
      html += `<div style="margin-bottom: 4px;"><strong>${escapeHtml(t.sender_name)} (${(t.source_lang || "en").toUpperCase()}):</strong> ${escapeHtml(t.original_text)}`;
      if (t.translated_text && t.translated_text !== t.original_text) {
        html += `<br><span style="color: var(--text-secondary); font-style: italic;">└ Translation: ${escapeHtml(t.translated_text)}</span>`;
      }
      html += `</div>`;
    });
    html += `</div>`;
  }
  html += `</div></div>`;

  recordsModalContent.innerHTML = html;
}

function downloadCurrentRecordsMarkdown() {
  exportMinutesOfMeeting();
}

function copyTextToClipboard(text, successMsg = "Copied to clipboard! 📋") {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text)
      .then(() => showToast(successMsg))
      .catch(() => fallbackCopy(text));
  } else {
    fallbackCopy(text);
  }
}

// Window beforeunload: leave notification
window.addEventListener("beforeunload", () => {
  if (state.broadcastChannel) {
    state.broadcastChannel.postMessage({
      type: "peer_left",
      senderId: state.userId
    });
  }
  cleanupAllPeerConnections();
});

// Start Application on Load
window.addEventListener("DOMContentLoaded", init);

