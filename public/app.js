const container = document.getElementById("events");
const refreshBtn = document.getElementById("refreshBtn");
const eventSearch = document.getElementById("eventSearch");
const localeSelect = document.getElementById("localeSelect");
const timezoneSelect = document.getElementById("timezoneSelect");
const installAppBtn = document.getElementById("installAppBtn");

let allEvents = [];
let searchTimer = null;
let activeSearchRequest = 0;
const initialQuery = new URLSearchParams(window.location.search).get("q") || "";
if (eventSearch && initialQuery) eventSearch.value = initialQuery;

function formatDate(value) {
  if (!value) return window.AppI18nTime?.t("no_date") || "No date";
  if (window.AppI18nTime) return window.AppI18nTime.formatDateTime(value);
  return new Date(value).toLocaleString();
}

function formatComingPeople(event) {
  const booked = Number(event.seatsBooked || 0);
  const capacity = Number(event.capacity || 0);
  return capacity > 0 ? `${booked} / ${capacity}` : `${booked}`;
}

function formatPrice(value) {
  return Number(value || 0).toFixed(2).replace(/\.00$/, "");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getEventDetailsUrl(event) {
  const url = new URL("/event-details.html", window.location.origin);
  if (event && event._id) url.searchParams.set("id", String(event._id));
  return url.toString();
}

function getEventImageUrl(event) {
  const src = String(event?.coverImage || "").trim();
  if (/^data:image\//i.test(src)) return src;
  if (/^https?:\/\//i.test(src)) return src;
  return "";
}

function renderEvents(events) {
  container.innerHTML = "";

  if (!events.length) {
    container.innerHTML = `
      <div class="glass col-span-full rounded-2xl border border-cyan-300/25 p-6 text-center text-slate-300">
        ${escapeHtml(window.AppI18nTime?.t("no_events") || "No events available right now. Click refresh or create events from admin.")}
      </div>
    `;
    return;
  }

  events.forEach((event) => {
    const imageUrl = getEventImageUrl(event);
    const card = document.createElement("article");
    card.className = "group cursor-pointer overflow-hidden rounded-2xl border border-cyan-300/20 bg-slate-900/80 shadow-lg shadow-slate-950/40 transition-all duration-300 hover:-translate-y-1 hover:border-cyan-300/50 hover:shadow-cyan-900/30";

    card.innerHTML = `
      ${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(event.title || "Event")}" class="h-44 w-full object-cover">` : `<div class="flex h-44 items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-amber-950/50"><img src="/assets/web-logo.png" alt="Smart Event System" class="h-16 w-16 rounded-xl object-cover opacity-80"></div>`}
      <div class="p-4">
        <div class="mb-2 flex items-center justify-between text-xs text-slate-300">
          <span class="inline-flex items-center gap-1 rounded-full bg-cyan-300/20 px-2 py-0.5 text-cyan-200">
            <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M8 2v4M16 2v4M3 10h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"/></svg>
            ${escapeHtml(formatDate(event.date))}
          </span>
          <span class="inline-flex items-center gap-1">
            <svg viewBox="0 0 24 24" class="h-3.5 w-3.5 text-cyan-200" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 22s7-4.35 7-11a7 7 0 1 0-14 0c0 6.65 7 11 7 11Z"/><circle cx="12" cy="11" r="2.5"/></svg>
            ${escapeHtml(event.location || "Location TBA")}
          </span>
        </div>
        <h3 class="text-lg font-bold">${escapeHtml(event.title || "Untitled Event")}</h3>
        <p class="mt-2 line-clamp-2 text-sm text-slate-300">${escapeHtml(event.description || "No description")}</p>
        ${Number(event.lowestTicketPrice || 0) > 0 ? `<p class="mt-2 text-xs font-semibold text-amber-300">From $${escapeHtml(formatPrice(event.lowestTicketPrice))} · ${escapeHtml(event.dynamicPricing?.label || "Dynamic pricing")}</p>` : ""}
        <p class="mt-2 inline-flex items-center gap-1 text-xs text-cyan-200">
          <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M20 8v6M23 11h-6"/></svg>
          ${escapeHtml(window.AppI18nTime?.t("coming_people") || "Coming People")}: ${escapeHtml(formatComingPeople(event))}
        </p>
        <a href="/event-details.html?id=${encodeURIComponent(String(event._id || ""))}" class="mt-4 inline-flex items-center gap-1 rounded-full border border-cyan-300/30 px-3 py-1 text-xs text-cyan-100 transition hover:bg-cyan-900/25">
          <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
          ${escapeHtml(window.AppI18nTime?.t("view_details") || "View Details")}
        </a>
      </div>
    `;

    const detailsUrl = getEventDetailsUrl(event);
    card.addEventListener("click", () => {
      window.location.href = detailsUrl;
    });

    const detailsLink = card.querySelector("a");
    if (detailsLink) {
      detailsLink.addEventListener("click", (e) => {
        e.stopPropagation();
      });
    }

    container.appendChild(card);
  });
}

function renderLoadingState(message = "Loading events...") {
  container.innerHTML = `
    <div class="col-span-full rounded-2xl border border-cyan-300/20 bg-slate-900/70 p-6 text-sm text-slate-300 inline-flex items-center gap-2">
      <svg viewBox="0 0 24 24" class="h-4 w-4 animate-spin" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>
      ${escapeHtml(message)}
    </div>
  `;
}

async function loadEvents() {
  renderLoadingState("Loading events...");
  try {
    const res = await fetch("/api/events");
    if (!res.ok) throw new Error("Failed to fetch events");
    const data = await res.json();
    allEvents = data;
    if (eventSearch && eventSearch.value.trim()) {
      await runMlSearch(eventSearch.value.trim());
      return;
    }
    renderEvents(allEvents);
  } catch (err) {
    container.innerHTML = `
      <div class="col-span-full rounded-2xl border border-red-400/30 bg-red-950/40 p-6 text-sm text-red-100">
        Could not load events. ${err.message}
      </div>
    `;
  }
}

async function runMlSearch(query) {
  const q = String(query || "").trim();
  const requestId = ++activeSearchRequest;

  if (!q) {
    renderEvents(allEvents);
    return;
  }

  renderLoadingState(`Searching for "${q}"...`);

  try {
    const res = await fetch(`/api/ml/search?q=${encodeURIComponent(q)}&limit=20`);
    if (!res.ok) throw new Error("ML search failed");
    const payload = await res.json();
    if (requestId !== activeSearchRequest) return;
    const results = Array.isArray(payload?.results) ? payload.results : [];
    renderEvents(results);
  } catch (err) {
    if (requestId !== activeSearchRequest) return;
    container.innerHTML = `
      <div class="col-span-full rounded-2xl border border-red-400/30 bg-red-950/40 p-6 text-sm text-red-100">
        Could not search events. ${escapeHtml(err.message)}
      </div>
    `;
  }
}

function scheduleMlSearch(query) {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    runMlSearch(query);
  }, 300);
}

if (refreshBtn) refreshBtn.addEventListener("click", loadEvents);
if (eventSearch) {
  eventSearch.addEventListener("input", () => {
    const q = eventSearch.value.trim();
    const url = q ? `/?q=${encodeURIComponent(q)}` : "/";
    window.history.replaceState({}, "", url);
    scheduleMlSearch(q);
  });
}

async function syncInstallPromptButton() {
  if (!installAppBtn || !window.PWAClient) return;
  const status = await window.PWAClient.getStatus().catch(() => ({ supported: false }));
  const shouldShow =
    status?.supported &&
    !window.matchMedia("(display-mode: standalone)").matches &&
    window.PWAClient.canInstall();

  installAppBtn.classList.toggle("hidden", !shouldShow);
}

if (installAppBtn) {
  installAppBtn.addEventListener("click", async () => {
    if (!window.PWAClient?.canInstall()) return;
    installAppBtn.disabled = true;
    try {
      const result = await window.PWAClient.promptInstall();
      if (result?.installed) {
        installAppBtn.classList.add("hidden");
      } else {
        await syncInstallPromptButton();
      }
    } finally {
      installAppBtn.disabled = false;
    }
  });

  window.addEventListener("pwa:install-available", syncInstallPromptButton);
  window.addEventListener("pwa:installed", syncInstallPromptButton);
  window.addEventListener("load", () => setTimeout(syncInstallPromptButton, 300));
}

loadEvents();

if (window.AppI18nTime) {
  if (localeSelect) {
    localeSelect.value = window.AppI18nTime.getLocale();
    localeSelect.addEventListener("change", () => {
      window.AppI18nTime.setLocale(localeSelect.value);
      if (eventSearch && eventSearch.value.trim()) {
        runMlSearch(eventSearch.value.trim());
      } else {
        renderEvents(allEvents);
      }
    });
  }
  if (timezoneSelect) {
    timezoneSelect.value = window.AppI18nTime.getTimeZone();
    timezoneSelect.addEventListener("change", () => {
      window.AppI18nTime.setTimeZone(timezoneSelect.value);
      if (eventSearch && eventSearch.value.trim()) {
        runMlSearch(eventSearch.value.trim());
      } else {
        renderEvents(allEvents);
      }
    });
  }
}
