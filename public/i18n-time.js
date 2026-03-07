(function initI18nTime(global) {
  const STORAGE_LOCALE = "app_locale";
  const STORAGE_TIMEZONE = "app_timezone";

  const DICT = {
    en: {
      no_date: "No date",
      no_events: "No events available right now. Click refresh or create events from admin.",
      coming_people: "Coming People",
      view_details: "View Details",
      open_page: "Open Page",
      date: "Date",
      location: "Location",
      organizer: "Organizer"
    },
    es: {
      no_date: "Sin fecha",
      no_events: "No hay eventos disponibles ahora. Pulsa actualizar o crea eventos desde admin.",
      coming_people: "Personas asistentes",
      view_details: "Ver detalles",
      open_page: "Abrir página",
      date: "Fecha",
      location: "Ubicación",
      organizer: "Organizador"
    },
    fr: {
      no_date: "Pas de date",
      no_events: "Aucun événement disponible pour le moment. Actualisez ou créez des événements côté admin.",
      coming_people: "Participants",
      view_details: "Voir les détails",
      open_page: "Ouvrir la page",
      date: "Date",
      location: "Lieu",
      organizer: "Organisateur"
    },
    ur: {
      no_date: "تاریخ دستیاب نہیں",
      no_events: "اس وقت کوئی ایونٹس دستیاب نہیں۔ ریفریش کریں یا ایڈمن سے ایونٹس بنائیں۔",
      coming_people: "آنے والے افراد",
      view_details: "تفصیل دیکھیں",
      open_page: "صفحہ کھولیں",
      date: "تاریخ",
      location: "مقام",
      organizer: "منتظم"
    }
  };

  function supportedLocale(value) {
    const v = String(value || "").trim().toLowerCase();
    if (DICT[v]) return v;
    return "en";
  }

  function getLocale() {
    return supportedLocale(localStorage.getItem(STORAGE_LOCALE) || navigator.language?.slice(0, 2) || "en");
  }

  function setLocale(locale) {
    const safe = supportedLocale(locale);
    localStorage.setItem(STORAGE_LOCALE, safe);
    return safe;
  }

  function getTimeZone() {
    const raw = String(localStorage.getItem(STORAGE_TIMEZONE) || "").trim();
    if (raw) return raw;
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
      return "UTC";
    }
  }

  function setTimeZone(tz) {
    const safe = String(tz || "").trim() || "UTC";
    localStorage.setItem(STORAGE_TIMEZONE, safe);
    return safe;
  }

  function t(key) {
    const locale = getLocale();
    return DICT[locale]?.[key] || DICT.en[key] || key;
  }

  function formatDate(dateValue, options = {}) {
    const d = new Date(dateValue);
    if (Number.isNaN(d.getTime())) return t("no_date");
    const locale = getLocale();
    const timeZone = getTimeZone();
    return new Intl.DateTimeFormat(locale, {
      dateStyle: options.dateStyle || "medium",
      timeStyle: options.timeStyle || undefined,
      timeZone
    }).format(d);
  }

  function formatDateTime(dateValue) {
    return formatDate(dateValue, { dateStyle: "medium", timeStyle: "short" });
  }

  function getTimeZoneLabel(dateValue = Date.now()) {
    const d = new Date(dateValue);
    if (Number.isNaN(d.getTime())) return getTimeZone();
    const locale = getLocale();
    const timeZone = getTimeZone();
    const parts = new Intl.DateTimeFormat(locale, {
      timeZone,
      timeZoneName: "short"
    }).formatToParts(d);
    const tzPart = parts.find((p) => p.type === "timeZoneName");
    return tzPart?.value || timeZone;
  }

  function formatDateTimeWithZone(dateValue) {
    const base = formatDateTime(dateValue);
    const label = getTimeZoneLabel(dateValue);
    return `${base} (${label})`;
  }

  global.AppI18nTime = {
    t,
    getLocale,
    setLocale,
    getTimeZone,
    setTimeZone,
    formatDate,
    formatDateTime,
    formatDateTimeWithZone,
    getTimeZoneLabel,
    supportedLocales: ["en", "es", "fr", "ur"]
  };
})(window);
