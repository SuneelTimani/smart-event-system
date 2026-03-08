(function initUiFeedback() {
  const TOAST_STYLE_ID = "eventarc-toast-styles";

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function ensureToastStyles() {
    if (document.getElementById(TOAST_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = TOAST_STYLE_ID;
    style.textContent = `
      .ea-toast-root {
        position: fixed;
        right: 16px;
        bottom: 16px;
        z-index: 2000;
        display: flex;
        flex-direction: column;
        gap: 10px;
        width: min(92vw, 360px);
        pointer-events: none;
      }
      .ea-toast {
        position: relative;
        overflow: hidden;
        border-radius: 16px;
        border: 1px solid rgba(255,255,255,0.08);
        background: rgba(13, 17, 23, 0.92);
        color: #f0f2f8;
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        box-shadow: 0 24px 48px rgba(0,0,0,0.35);
        pointer-events: auto;
        padding: 14px 14px 12px;
        animation: eaToastIn 180ms ease;
      }
      .ea-toast[data-tone="success"] { border-color: rgba(16,185,129,0.32); }
      .ea-toast[data-tone="error"] { border-color: rgba(239,68,68,0.32); }
      .ea-toast[data-tone="warning"] { border-color: rgba(245,158,11,0.32); }
      .ea-toast[data-tone="info"] { border-color: rgba(124,106,247,0.32); }
      .ea-toast-row {
        display: grid;
        grid-template-columns: 18px 1fr;
        gap: 10px;
        align-items: start;
      }
      .ea-toast-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 18px;
        height: 18px;
        margin-top: 1px;
      }
      .ea-toast-title {
        font-size: 0.8rem;
        font-weight: 700;
        letter-spacing: 0.02em;
      }
      .ea-toast-message {
        margin-top: 2px;
        font-size: 0.88rem;
        line-height: 1.45;
        color: #cbd5e1;
      }
      .ea-toast-progress {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        height: 3px;
        transform-origin: left;
        animation: eaToastProgress linear forwards;
      }
      .ea-toast-progress[data-tone="success"] { background: #10B981; }
      .ea-toast-progress[data-tone="error"] { background: #EF4444; }
      .ea-toast-progress[data-tone="warning"] { background: #F59E0B; }
      .ea-toast-progress[data-tone="info"] { background: #7C6AF7; }
      @keyframes eaToastIn {
        from { opacity: 0; transform: translateX(12px); }
        to { opacity: 1; transform: translateX(0); }
      }
      @keyframes eaToastOut {
        from { opacity: 1; transform: translateX(0); }
        to { opacity: 0; transform: translateX(10px); }
      }
      @keyframes eaToastProgress {
        from { transform: scaleX(1); }
        to { transform: scaleX(0); }
      }
    `;
    document.head.appendChild(style);
  }

  function ensureToastRoot() {
    ensureToastStyles();
    let root = document.getElementById("globalToastRoot");
    if (root) return root;
    root = document.createElement("div");
    root.id = "globalToastRoot";
    root.className = "ea-toast-root";
    document.body.appendChild(root);
    return root;
  }

  function getToastMeta(type) {
    const meta = {
      success: { title: "Success", icon: "✓" },
      error: { title: "Error", icon: "!" },
      warning: { title: "Warning", icon: "!" },
      info: { title: "Notice", icon: "i" }
    };
    return meta[type] || meta.info;
  }

  function showToast(message, type = "info", timeoutMs = 2600) {
    const root = ensureToastRoot();
    const meta = getToastMeta(type);
    const toast = document.createElement("div");
    toast.className = "ea-toast";
    toast.dataset.tone = type;
    toast.innerHTML = `
      <div class="ea-toast-row">
        <span class="ea-toast-icon" aria-hidden="true">${escapeHtml(meta.icon)}</span>
        <div>
          <div class="ea-toast-title">${escapeHtml(meta.title)}</div>
          <div class="ea-toast-message">${escapeHtml(String(message || ""))}</div>
        </div>
      </div>
      <div class="ea-toast-progress" data-tone="${escapeHtml(type)}" style="animation-duration:${Number(timeoutMs) || 2600}ms"></div>
    `;
    root.appendChild(toast);
    window.setTimeout(() => {
      toast.style.animation = "eaToastOut 140ms ease forwards";
      window.setTimeout(() => toast.remove(), 140);
    }, timeoutMs);
  }

  function skeletonCards(count) {
    return Array.from({ length: count }).map(() => `
      <div class="animate-pulse rounded-lg border border-slate-800 bg-slate-950 p-3">
        <div class="h-4 w-2/3 rounded bg-slate-800"></div>
        <div class="mt-2 h-3 w-full rounded bg-slate-800"></div>
        <div class="mt-2 h-3 w-4/5 rounded bg-slate-800"></div>
      </div>
    `).join("");
  }

  function emptyState(title, subtitle) {
    return `
      <div class="rounded-lg border border-dashed border-slate-700 bg-slate-950/70 p-4 text-center">
        <p class="text-sm font-semibold text-slate-300">${escapeHtml(title || "Nothing to show")}</p>
        <p class="mt-1 text-xs text-slate-500">${escapeHtml(subtitle || "")}</p>
      </div>
    `;
  }

  window.showToast = showToast;
  window.uiSkeletonCards = skeletonCards;
  window.uiEmptyState = emptyState;
})();
