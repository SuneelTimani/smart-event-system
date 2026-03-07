(function initUiFeedback() {
  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function ensureToastRoot() {
    let root = document.getElementById("globalToastRoot");
    if (root) return root;
    root = document.createElement("div");
    root.id = "globalToastRoot";
    root.className = "pointer-events-none fixed right-4 top-24 z-[2000] flex w-[92vw] max-w-sm flex-col gap-2";
    document.body.appendChild(root);
    return root;
  }

  function showToast(message, type = "info", timeoutMs = 2600) {
    const root = ensureToastRoot();
    const palette = {
      success: "border-emerald-500/40 bg-emerald-950/80 text-emerald-200",
      error: "border-rose-500/40 bg-rose-950/80 text-rose-200",
      info: "border-cyan-500/40 bg-cyan-950/80 text-cyan-200",
      warning: "border-amber-500/40 bg-amber-950/80 text-amber-200"
    };
    const cls = palette[type] || palette.info;
    const toast = document.createElement("div");
    toast.className = `pointer-events-auto rounded-lg border px-3 py-2 text-sm shadow-lg backdrop-blur ${cls}`;
    toast.textContent = String(message || "");
    root.appendChild(toast);
    window.setTimeout(() => {
      toast.remove();
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
