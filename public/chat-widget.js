(function initChatWidget() {
  if (document.getElementById("chatWidgetRoot")) return;

  const QUICK_PROMPTS = [
    { label: "Book", text: "How do I book an event?" },
    { label: "Cancel", text: "How can I cancel my booking?" },
    { label: "Promo", text: "How do promo codes work?" },
    { label: "Upcoming", text: "Show me upcoming events." }
  ];

  const MIN_RESPONSE_MS = 900;

  const root = document.createElement("div");
  root.id = "chatWidgetRoot";
  root.innerHTML = `
    <button id="chatWidgetToggle" class="fixed bottom-5 right-5 z-50 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-cyan-300 to-blue-300 px-4 py-2 text-sm font-semibold text-slate-900 shadow-lg shadow-cyan-900/40 hover:from-cyan-200 hover:to-blue-200">
      <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 3C7.03 3 3 6.58 3 11c0 2.04.86 3.91 2.28 5.34L4 21l5.03-1.16A10.2 10.2 0 0 0 12 20c4.97 0 9-3.58 9-8s-4.03-9-9-9Z"/><path d="M8 11h.01M12 11h.01M16 11h.01"/></svg>
      <span>AI Help</span>
    </button>
    <section id="chatWidgetPanel" class="fixed bottom-20 right-5 z-50 hidden w-[92vw] max-w-sm overflow-hidden rounded-xl border border-cyan-300/25 bg-slate-950 text-slate-100 shadow-2xl">
      <header class="flex items-center justify-between border-b border-slate-800 px-3 py-2 bg-slate-900/70">
        <p class="inline-flex items-center gap-2 text-sm font-semibold text-cyan-200">
          <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 3h6l1 3h3v3a6 6 0 0 1-6 6h-2a6 6 0 0 1-6-6V6h3l1-3Z"/><path d="M8 18h8M9.5 22h5"/></svg>
          Event Assistant
        </p>
        <button id="chatWidgetClose" class="rounded border border-slate-700 px-2 py-0.5 text-xs hover:bg-slate-800">Close</button>
      </header>
      <div id="chatWidgetMessages" class="max-h-72 overflow-y-auto space-y-2 px-3 py-3 text-sm bg-gradient-to-b from-slate-950 to-slate-900">
        <div class="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-slate-300">Ask about events, booking, cancellation, transfer, promo codes, or your booking status.</div>
      </div>
      <div id="chatWidgetChips" class="flex flex-wrap gap-2 border-t border-slate-800 px-3 py-2 bg-slate-950/80"></div>
      <form id="chatWidgetForm" class="border-t border-slate-800 p-3">
        <div class="flex gap-2">
          <input id="chatWidgetInput" maxlength="600" placeholder="Type your question..." class="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-cyan-400">
          <button id="chatWidgetSend" class="rounded-lg bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-cyan-300">Send</button>
        </div>
      </form>
    </section>
  `;
  document.body.appendChild(root);

  const toggle = document.getElementById("chatWidgetToggle");
  const panel = document.getElementById("chatWidgetPanel");
  const close = document.getElementById("chatWidgetClose");
  const form = document.getElementById("chatWidgetForm");
  const input = document.getElementById("chatWidgetInput");
  const sendButton = document.getElementById("chatWidgetSend");
  const messages = document.getElementById("chatWidgetMessages");
  const chipsWrap = document.getElementById("chatWidgetChips");

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function appendMessage(role, text) {
    const div = document.createElement("div");
    div.className = role === "user"
      ? "ml-8 rounded-lg bg-cyan-500/20 px-3 py-2 text-cyan-100"
      : "mr-8 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-slate-200";
    div.textContent = text;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
    return div;
  }

  function appendRecommendations(items, idsFallback) {
    let rows = Array.isArray(items) ? items : [];
    if (!rows.length && Array.isArray(idsFallback) && idsFallback.length) {
      rows = idsFallback.map((id) => ({ id, title: `Event ${id}` }));
    }
    if (!rows.length) return;

    const wrap = document.createElement("div");
    wrap.className = "mr-8 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-300";
    const title = document.createElement("p");
    title.className = "mb-1 text-slate-200";
    title.textContent = "Recommended events:";
    wrap.appendChild(title);

    rows.forEach((item) => {
      const a = document.createElement("a");
      const id = item.id || item._id || "";
      a.href = `/event-details.html?id=${encodeURIComponent(String(id))}`;
      a.className = "block text-cyan-300 hover:underline";
      const dt = item.date ? ` · ${new Date(item.date).toLocaleDateString()}` : "";
      a.textContent = `${item.title || `Event ${id}`}${dt}`;
      wrap.appendChild(a);
    });

    messages.appendChild(wrap);
    messages.scrollTop = messages.scrollHeight;
  }

  function getAuthHeader() {
    const token = localStorage.getItem("token") || "";
    if (!token) return {};
    return /^Bearer\s+/i.test(token)
      ? { Authorization: token }
      : { Authorization: `Bearer ${token}` };
  }

  function setSending(isSending) {
    input.disabled = isSending;
    sendButton.disabled = isSending;
    chipsWrap.querySelectorAll("button").forEach((b) => {
      b.disabled = isSending;
      b.classList.toggle("opacity-60", isSending);
    });
  }

  async function sendMessage(message) {
    if (!message) return;

    appendMessage("user", message);
    const thinking = appendMessage("assistant", "Thinking...");

    setSending(true);
    const start = Date.now();

    try {
      const res = await fetch("/api/chatbot", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeader()
        },
        body: JSON.stringify({ message, page: window.location.pathname })
      });

      const elapsed = Date.now() - start;
      if (elapsed < MIN_RESPONSE_MS) await wait(MIN_RESPONSE_MS - elapsed);

      if (thinking && thinking.parentNode) thinking.parentNode.removeChild(thinking);

      if (!res.ok) {
        appendMessage("assistant", "Chatbot is unavailable right now. Please try again.");
        return;
      }

      const data = await res.json().catch(() => ({}));
      appendMessage("assistant", data.reply || "I could not process that.");
      appendRecommendations(data.recommendedEvents, data.recommendedEventIds || []);
    } catch {
      if (thinking && thinking.parentNode) thinking.parentNode.removeChild(thinking);
      appendMessage("assistant", "Network issue. Please try again.");
    } finally {
      setSending(false);
      input.focus();
    }
  }

  QUICK_PROMPTS.forEach((item) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "rounded-full border border-cyan-400/35 px-3 py-1 text-xs text-cyan-200 hover:bg-slate-800";
    chip.textContent = item.label;
    chip.addEventListener("click", () => {
      sendMessage(item.text);
    });
    chipsWrap.appendChild(chip);
  });

  toggle.addEventListener("click", () => {
    panel.classList.toggle("hidden");
    if (!panel.classList.contains("hidden")) input.focus();
  });
  close.addEventListener("click", () => panel.classList.add("hidden"));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const message = input.value.trim();
    if (!message) return;
    input.value = "";
    await sendMessage(message);
  });
})();
