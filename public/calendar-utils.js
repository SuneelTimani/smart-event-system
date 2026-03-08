(function initCalendarUtils(global) {
  function escapeIcsText(value) {
    return String(value || "")
      .replace(/\\/g, "\\\\")
      .replace(/\r?\n/g, "\\n")
      .replace(/,/g, "\\,")
      .replace(/;/g, "\\;");
  }

  function toIcsDateUtc(value) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    const h = String(d.getUTCHours()).padStart(2, "0");
    const min = String(d.getUTCMinutes()).padStart(2, "0");
    const s = String(d.getUTCSeconds()).padStart(2, "0");
    return `${y}${m}${day}T${h}${min}${s}Z`;
  }

  function normalizeCalendarEvent(input) {
    const start = new Date(input.start || input.date || Date.now());
    if (Number.isNaN(start.getTime())) return null;
    const durationMin = Number(input.durationMin || 120);
    const end = new Date(start.getTime() + Math.max(30, durationMin) * 60 * 1000);
    const title = String(input.title || "Event").replace(/\s+/g, " ").trim().slice(0, 140);
    const location = String(input.location || "").replace(/\s+/g, " ").trim().slice(0, 255);
    return {
      title: title || "Event",
      description: String(input.description || ""),
      location,
      start,
      end
    };
  }

  function buildIcsContent(input) {
    const event = normalizeCalendarEvent(input);
    if (!event) return "";

    const uid = `${Date.now()}-${Math.random().toString(16).slice(2)}@smart-event-system`;
    const nowStamp = toIcsDateUtc(new Date());
    const dtStart = toIcsDateUtc(event.start);
    const dtEnd = toIcsDateUtc(event.end);

    return [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Evenix//Event Calendar//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${nowStamp}`,
      `DTSTART:${dtStart}`,
      `DTEND:${dtEnd}`,
      `SUMMARY:${escapeIcsText(event.title)}`,
      `DESCRIPTION:${escapeIcsText(event.description)}`,
      `LOCATION:${escapeIcsText(event.location)}`,
      "END:VEVENT",
      "END:VCALENDAR"
    ].join("\r\n");
  }

  function downloadIcsFile(input, fileName) {
    const ics = buildIcsContent(input);
    if (!ics) return false;
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName || "event.ics";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return true;
  }

  function toGoogleCalendarUrl(input) {
    const event = normalizeCalendarEvent(input);
    if (!event) return "";
    const dates = `${toIcsDateUtc(event.start)}/${toIcsDateUtc(event.end)}`;
    const params = new URLSearchParams({
      action: "TEMPLATE",
      text: event.title,
      dates,
      details: event.description,
      location: event.location
    });
    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  }

  function toOutlookCalendarUrl(input) {
    const event = normalizeCalendarEvent(input);
    if (!event) return "";
    const params = new URLSearchParams({
      path: "/calendar/action/compose",
      rru: "addevent",
      subject: event.title,
      startdt: event.start.toISOString(),
      enddt: event.end.toISOString(),
      body: event.description,
      location: event.location
    });
    return `https://outlook.office.com/calendar/0/deeplink/compose?${params.toString()}`;
  }

  global.CalendarUtils = {
    buildIcsContent,
    downloadIcsFile,
    addToAppleCalendar(input, fileName) {
      // Apple Calendar handles ICS import natively.
      return downloadIcsFile(input, fileName || "event.ics");
    },
    toGoogleCalendarUrl,
    toOutlookCalendarUrl
  };
})(window);
