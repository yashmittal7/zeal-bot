/* ═══════════════════════════════════════════════════════════════════
   PERSISTENT CHAT HISTORY  —  uses localStorage to store all sessions
   ═══════════════════════════════════════════════════════════════════ */

/* ── Constants ─────────────────────────────────────────────────── */
const STORAGE_KEY   = "gemini_chat_sessions";   // localStorage key
const MAX_SESSIONS  = 50;                        // cap stored sessions

/* ── App State ─────────────────────────────────────────────────── */
let sessions            = loadSessions();        // { [id]: Session }
let activeSessionId     = null;
let isLoading           = false;

/*
  Session shape:
  {
    id:        string   (uuid-ish)
    title:     string   (first user message, truncated)
    createdAt: number   (Date.now())
    updatedAt: number
    messages:  [{ role:"user"|"bot", text:string, time:string }]
    history:   [{ role:"user"|"model", text:string }]   ← sent to Gemini
  }
*/

/* ── DOM refs ──────────────────────────────────────────────────── */
const messagesArea  = document.getElementById("messagesArea");
const messagesList  = document.getElementById("messagesList");
const emptyState    = document.getElementById("emptyState");
const userInput     = document.getElementById("userInput");
const sendBtn       = document.getElementById("sendBtn");
const newChatBtn    = document.getElementById("newChatBtn");
const historyList   = document.getElementById("historyList");
const menuBtn       = document.getElementById("menuBtn");
const sidebar       = document.querySelector(".sidebar");

/* ── Mobile sidebar overlay ────────────────────────────────────── */
const overlay = document.createElement("div");
overlay.className = "sidebar-overlay";
document.body.appendChild(overlay);
menuBtn.addEventListener("click", () => toggleSidebar(true));
overlay.addEventListener("click", () => toggleSidebar(false));

function toggleSidebar(open) {
  sidebar.classList.toggle("open", open);
  overlay.classList.toggle("show", open);
}

/* ── Input auto-resize & send-button gating ────────────────────── */
userInput.addEventListener("input", () => {
  userInput.style.height = "auto";
  userInput.style.height = Math.min(userInput.scrollHeight, 180) + "px";
  sendBtn.disabled = userInput.value.trim() === "" || isLoading;
});

userInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    if (!sendBtn.disabled) sendMessage();
  }
});

sendBtn.addEventListener("click", sendMessage);
newChatBtn.addEventListener("click", startNewChat);

/* ── Suggestion chips ──────────────────────────────────────────── */
document.querySelectorAll(".chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    userInput.value = chip.dataset.prompt;
    userInput.dispatchEvent(new Event("input"));
    sendMessage();
  });
});

/* ═══════════════════════════════════════════════════════════════════
   CORE: Send a message
   ═══════════════════════════════════════════════════════════════════ */
async function sendMessage() {
  const text = userInput.value.trim();
  if (!text || isLoading) return;

  /* ── Ensure there's an active session ── */
  if (!activeSessionId) createSession();

  emptyState.style.display = "none";

  /* ── Append user bubble & persist ── */
  const userTime = formatTime(new Date());
  appendMessageDOM("user", text, userTime);
  getSession().messages.push({ role: "user", text, time: userTime });
  getSession().history.push({ role: "user", text });

  /* ── Set session title on first message ── */
  if (getSession().messages.filter(m => m.role === "user").length === 1) {
    getSession().title = text.slice(0, 48) + (text.length > 48 ? "…" : "");
    renderHistorySidebar();   // update sidebar label immediately
  }

  /* ── Reset input ── */
  userInput.value = "";
  userInput.style.height = "auto";
  sendBtn.disabled = true;

  /* ── Typing indicator ── */
  const typingRow = appendTypingIndicator();
  setLoading(true);

  /* ── Build history to send (everything except the current message) ── */
  const historyToSend = getSession().history.slice(0, -1);

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, history: historyToSend }),
    });

    typingRow.remove();

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    const data  = await res.json();
    const reply = data.reply || "(No response)";

    /* ── Append bot bubble & persist ── */
    const botTime = formatTime(new Date());
    appendMessageDOM("bot", reply, botTime);
    getSession().messages.push({ role: "bot", text: reply, time: botTime });
    getSession().history.push({ role: "model", text: reply });

  } catch (err) {
    typingRow.remove();
    appendMessageDOM("bot", `⚠️ ${err.message}`, formatTime(new Date()), true);
  } finally {
    /* ── Save & refresh sidebar ── */
    getSession().updatedAt = Date.now();
    saveSessions();
    renderHistorySidebar();
    setLoading(false);
    sendBtn.disabled = userInput.value.trim() === "";
  }
}

/* ═══════════════════════════════════════════════════════════════════
   SESSION MANAGEMENT
   ═══════════════════════════════════════════════════════════════════ */

function createSession() {
  const id = `s_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  sessions[id] = {
    id,
    title:     "New chat",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages:  [],
    history:   [],
  };
  activeSessionId = id;
  pruneOldSessions();
  return sessions[id];
}

function getSession(id = activeSessionId) {
  return sessions[id];
}

function loadSession(id) {
  if (!sessions[id]) return;
  activeSessionId = id;

  /* ── Clear message pane ── */
  messagesList.innerHTML = "";
  emptyState.style.display = "none";

  /* ── Re-render all stored messages ── */
  const sess = getSession();
  if (sess.messages.length === 0) {
    emptyState.style.display = "";
  } else {
    sess.messages.forEach(({ role, text, time }) => {
      appendMessageDOM(role, text, time);
    });
  }

  renderHistorySidebar();
  toggleSidebar(false);
  scrollToBottom();
}

function startNewChat() {
  activeSessionId = null;
  messagesList.innerHTML = "";
  emptyState.style.display = "";
  userInput.value = "";
  userInput.style.height = "auto";
  sendBtn.disabled = true;
  renderHistorySidebar();
  toggleSidebar(false);
}

function deleteSession(id, e) {
  e.stopPropagation();   // don't trigger loadSession
  delete sessions[id];
  saveSessions();
  if (activeSessionId === id) startNewChat();
  else renderHistorySidebar();
}

function pruneOldSessions() {
  const ids = Object.keys(sessions).sort(
    (a, b) => sessions[b].updatedAt - sessions[a].updatedAt
  );
  if (ids.length > MAX_SESSIONS) {
    ids.slice(MAX_SESSIONS).forEach(id => delete sessions[id]);
  }
}

/* ═══════════════════════════════════════════════════════════════════
   SIDEBAR RENDERING
   ═══════════════════════════════════════════════════════════════════ */

function renderHistorySidebar() {
  historyList.innerHTML = "";

  /* Sort newest-first */
  const sorted = Object.values(sessions).sort(
    (a, b) => b.updatedAt - a.updatedAt
  );

  if (sorted.length === 0) {
    const empty = document.createElement("div");
    empty.className = "history-empty";
    empty.textContent = "No previous chats";
    historyList.appendChild(empty);
    return;
  }

  /* Group by date */
  const groups = groupByDate(sorted);

  for (const [label, items] of Object.entries(groups)) {
    /* Group header */
    const header = document.createElement("div");
    header.className = "history-group-label";
    header.textContent = label;
    historyList.appendChild(header);

    items.forEach(sess => {
      const item = document.createElement("div");
      item.className = "history-item" + (sess.id === activeSessionId ? " active" : "");
      item.title = sess.title;

      const titleSpan = document.createElement("span");
      titleSpan.className = "history-item-title";
      titleSpan.textContent = sess.title;

      const delBtn = document.createElement("button");
      delBtn.className = "history-del-btn";
      delBtn.setAttribute("aria-label", "Delete chat");
      delBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
      delBtn.addEventListener("click", (e) => deleteSession(sess.id, e));

      item.appendChild(titleSpan);
      item.appendChild(delBtn);
      item.addEventListener("click", () => loadSession(sess.id));
      historyList.appendChild(item);
    });
  }
}

/* Group sessions into Today / Yesterday / This Week / Earlier */
function groupByDate(sessions) {
  const now     = new Date();
  const today   = startOfDay(now);
  const yest    = startOfDay(new Date(today - 86400000));
  const week    = startOfDay(new Date(today - 6 * 86400000));

  const groups  = {};

  sessions.forEach(sess => {
    const d = new Date(sess.updatedAt);
    let label;
    if (d >= today)       label = "Today";
    else if (d >= yest)   label = "Yesterday";
    else if (d >= week)   label = "This Week";
    else                  label = d.toLocaleDateString(undefined, { month: "long", year: "numeric" });

    if (!groups[label]) groups[label] = [];
    groups[label].push(sess);
  });

  return groups;
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/* ═══════════════════════════════════════════════════════════════════
   STORAGE
   ═══════════════════════════════════════════════════════════════════ */

function loadSessions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveSessions() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch (e) {
    /* localStorage quota exceeded — trim oldest session and retry once */
    const oldest = Object.values(sessions).sort((a, b) => a.updatedAt - b.updatedAt)[0];
    if (oldest) {
      delete sessions[oldest.id];
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions)); } catch {}
    }
  }
}

/* ═══════════════════════════════════════════════════════════════════
   DOM HELPERS
   ═══════════════════════════════════════════════════════════════════ */

function appendMessageDOM(role, text, time, isError = false) {
  const row = document.createElement("div");
  row.className = `message-row ${role}`;

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  if (role === "user") {
    avatar.textContent = "U";
  } else {
    avatar.innerHTML = gemSVG(16);
  }

  const bubble = document.createElement("div");
  bubble.className = "bubble" + (isError ? " error-bubble" : "");
  bubble.innerHTML = formatMessage(text);

  const timeWrap = document.createElement("div");
  timeWrap.className = "msg-time";
  timeWrap.innerHTML = `<span>${time}</span>`;

  if (role === "user") {
    row.appendChild(timeWrap);
    row.appendChild(bubble);
    row.appendChild(avatar);
  } else {
    row.appendChild(avatar);
    row.appendChild(bubble);
    row.appendChild(timeWrap);
  }

  messagesList.appendChild(row);
  scrollToBottom();
  return row;
}

function appendTypingIndicator() {
  const row = document.createElement("div");
  row.className = "message-row bot";

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.innerHTML = gemSVG(16);

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.innerHTML = `<div class="typing-indicator">
    <div class="typing-dot"></div>
    <div class="typing-dot"></div>
    <div class="typing-dot"></div>
  </div>`;

  row.appendChild(avatar);
  row.appendChild(bubble);
  messagesList.appendChild(row);
  scrollToBottom();
  return row;
}

function gemSVG(size) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none">
    <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M2 17L12 22L22 17" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M2 12L12 17L22 12" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
  </svg>`;
}

/* ═══════════════════════════════════════════════════════════════════
   UTILITIES
   ═══════════════════════════════════════════════════════════════════ */

function setLoading(state) { isLoading = state; }

function scrollToBottom() {
  requestAnimationFrame(() => {
    messagesArea.scrollTo({ top: messagesArea.scrollHeight, behavior: "smooth" });
  });
}

function formatTime(date) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * Lightweight Markdown → HTML renderer.
 * Handles: fenced code blocks, inline code, bold, italic, lists, paragraphs.
 */
function formatMessage(text) {
  const escape = (s) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const parts = text.split(/(```[\s\S]*?```)/g);

  return parts.map((part) => {
    if (part.startsWith("```")) {
      const lines = part.slice(3, -3).split("\n");
      const lang  = lines[0].trim();
      const code  = escape(lines.slice(lang ? 1 : 0).join("\n").trimEnd());
      return `<pre><code class="lang-${escape(lang)}">${code}</code></pre>`;
    }

    let s = escape(part);
    s = s.replace(/`([^`]+)`/g,    "<code>$1</code>");
    s = s.replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>");
    s = s.replace(/__(.+?)__/g,    "<strong>$1</strong>");
    s = s.replace(/\*(.+?)\*/g,    "<em>$1</em>");
    s = s.replace(/_(.+?)_/g,      "<em>$1</em>");

    const lines = s.split("\n");
    let html = "", inUl = false, inOl = false;

    lines.forEach((line) => {
      const ulMatch = line.match(/^[-*] (.+)/);
      const olMatch = line.match(/^\d+\. (.+)/);

      if (ulMatch) {
        if (!inUl) { if (inOl) { html += "</ol>"; inOl = false; } html += "<ul>"; inUl = true; }
        html += `<li>${ulMatch[1]}</li>`;
      } else if (olMatch) {
        if (!inOl) { if (inUl) { html += "</ul>"; inUl = false; } html += "<ol>"; inOl = true; }
        html += `<li>${olMatch[1]}</li>`;
      } else {
        if (inUl) { html += "</ul>"; inUl = false; }
        if (inOl) { html += "</ol>"; inOl = false; }
        if (line.trim()) html += `<p>${line}</p>`;
      }
    });

    if (inUl) html += "</ul>";
    if (inOl) html += "</ol>";
    return html;
  }).join("");
}

/* ── Init ──────────────────────────────────────────────────────── */
renderHistorySidebar();