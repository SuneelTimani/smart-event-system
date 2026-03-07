let nodemailer = null;
try {
  nodemailer = require("nodemailer");
} catch {
  nodemailer = null;
}
let twilio = null;
try {
  twilio = require("twilio");
} catch {
  twilio = null;
}
let QRCode = null;
try {
  QRCode = require("qrcode");
} catch {
  QRCode = null;
}
const mongoose = require("mongoose");
const NotificationJob = require("../models/NotificationJob");
const User = require("../models/User");
const { withRetry, createCircuitBreaker } = require("./resilience");
const { isPushConfigured, sanitizeSubscription, sendWebPush } = require("./pushNotifications");

const WEB_EMAIL = process.env.WEB_EMAIL || "";
const WEB_WHATSAPP_TO = process.env.WEB_WHATSAPP_TO || "";

const QUEUE_ENABLED = String(process.env.NOTIFICATION_QUEUE_ENABLED || "true") === "true";
const QUEUE_POLL_MS = Math.max(1000, Number(process.env.NOTIFICATION_QUEUE_POLL_MS || 4000));
const QUEUE_BATCH = Math.max(1, Math.min(50, Number(process.env.NOTIFICATION_QUEUE_BATCH || 10)));
const QUEUE_MAX_ATTEMPTS = Math.max(1, Math.min(20, Number(process.env.NOTIFICATION_QUEUE_MAX_ATTEMPTS || 5)));
const QUEUE_MAX_DELAY_MS = Math.max(1000, Number(process.env.NOTIFICATION_QUEUE_MAX_DELAY_MS || 300000));

const smtpBreaker = createCircuitBreaker("smtp", { failureThreshold: 4, cooldownMs: 20000 });
const twilioBreaker = createCircuitBreaker("twilio", { failureThreshold: 4, cooldownMs: 20000 });

const TEMPLATE_VERSION = Object.freeze({
  booking_confirmed: 1,
  booking_cancelled: 1,
  admin_new_booking: 1,
  user_welcome: 1,
  admin_new_signup: 1,
  admin_event_created: 1,
  login_alert: 1,
  smtp_test: 1,
  password_reset: 1,
  signup_otp: 1,
  saved_event_reminder_email: 1,
  saved_event_reminder_push: 1,
  organizer_weekly_digest: 1,
  waitlist_promoted: 1,
  whatsapp_booking_confirmed: 1,
  whatsapp_booking_cancelled: 1,
  whatsapp_admin_new_booking: 1
});

let queueTimer = null;
let queueLoopRunning = false;

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function templateMeta(templateId) {
  return {
    templateId: String(templateId || "generic"),
    templateVersion: Number(TEMPLATE_VERSION[templateId] || 1)
  };
}

function buildEmailHtml({ title, intro, bullets = [], ctaLabel = "", ctaUrl = "", footer = "Smart Event System", extraHtml = "" }) {
  const bulletHtml = bullets.map((b) => `<li style="margin:6px 0;">${escapeHtml(b)}</li>`).join("");
  const ctaHtml = ctaLabel && ctaUrl
    ? `<a href="${escapeHtml(ctaUrl)}" style="display:inline-block;margin-top:14px;background:#f59e0b;color:#111827;text-decoration:none;padding:10px 14px;border-radius:8px;font-weight:700;">${escapeHtml(ctaLabel)}</a>`
    : "";

  return `
    <div style="margin:0;padding:0;background:#0b1220;font-family:Arial,Helvetica,sans-serif;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0;">
        <tr><td align="center">
          <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;background:#111827;border:1px solid #1f2937;border-radius:12px;overflow:hidden;">
            <tr><td style="padding:18px 22px;background:#0f172a;border-bottom:1px solid #1f2937;">
              <div style="font-size:20px;font-weight:700;color:#67e8f9;">Smart Event System</div>
              <div style="font-size:12px;color:#94a3b8;margin-top:4px;">Notification</div>
            </td></tr>
            <tr><td style="padding:22px;color:#e5e7eb;">
              <h2 style="margin:0 0 10px 0;color:#f8fafc;font-size:22px;">${escapeHtml(title)}</h2>
              <p style="margin:0 0 12px 0;color:#cbd5e1;line-height:1.6;">${escapeHtml(intro)}</p>
              ${bulletHtml ? `<ul style="margin:0 0 8px 18px;color:#e2e8f0;">${bulletHtml}</ul>` : ""}
              ${ctaHtml}
              ${extraHtml || ""}
            </td></tr>
            <tr><td style="padding:14px 22px;border-top:1px solid #1f2937;color:#94a3b8;font-size:12px;">${escapeHtml(footer)}</td></tr>
          </table>
        </td></tr>
      </table>
    </div>
  `;
}

function readableBookingRef(id) {
  const raw = String(id || "").trim();
  if (!raw) return "";
  return `BK-${raw.slice(-8).toUpperCase()}`;
}

async function buildBookingQrDataUrl({
  bookingId,
  attendeeName,
  eventTitle,
  ticketType,
  quantity
}) {
  if (!QRCode || !bookingId) return "";
  const payload = JSON.stringify({
    bookingId: String(bookingId),
    bookingRef: readableBookingRef(bookingId),
    attendee: String(attendeeName || ""),
    event: String(eventTitle || ""),
    ticketType: String(ticketType || "Standard"),
    quantity: Number(quantity || 1)
  });

  try {
    return await QRCode.toDataURL(payload, {
      width: 220,
      margin: 1,
      color: { dark: "#0f172a", light: "#ffffff" }
    });
  } catch {
    return "";
  }
}

function getTwilioClient() {
  if (!twilio) return null;
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_WHATSAPP_FROM) {
    return null;
  }
  return twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

function getTransporter() {
  if (!nodemailer) return null;
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || "false") === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

async function deliverEmailNow(to, subject, text, options = {}) {
  const html = options.html || "";
  const tm = templateMeta(options.templateId);
  if (!to) return { skipped: true, reason: "missing_to" };
  const transporter = getTransporter();
  if (!transporter) {
    console.log(`[Notification:skip-email] to=${to} subject="${subject}" reason="SMTP not configured or nodemailer missing"`);
    throw new Error("SMTP not configured");
  }

  const info = await smtpBreaker.execute(() =>
    withRetry(
      () => transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to,
        subject,
        text,
        ...(html ? { html } : {}),
        headers: {
          "X-Notification-Template": tm.templateId,
          "X-Template-Version": String(tm.templateVersion)
        }
      }),
      { retries: 2, baseDelayMs: 250 }
    )
  );
  console.log(`[Notification:sent] to=${to} subject="${subject}" template=${tm.templateId}@v${tm.templateVersion} id=${info.messageId || "n/a"}`);
  return { providerMessageId: info.messageId || "" };
}

function normalizeWhatsAppNumber(to) {
  const clean = String(to || "").trim();
  if (!clean) return "";
  if (/^whatsapp:\+\d{7,15}$/.test(clean)) return clean;
  if (/^\+\d{7,15}$/.test(clean)) return `whatsapp:${clean}`;
  return "";
}

async function deliverWhatsAppNow(to, body, options = {}) {
  const tm = templateMeta(options.templateId);
  const normalizedTo = normalizeWhatsAppNumber(to);
  if (!normalizedTo) return { skipped: true, reason: "invalid_to" };
  const client = getTwilioClient();
  if (!client) {
    console.log(`[Notification:skip-whatsapp] to=${normalizedTo} reason="Twilio not configured or twilio package missing"`);
    throw new Error("Twilio not configured");
  }

  const statusCallback =
    process.env.TWILIO_STATUS_CALLBACK_URL ||
    (process.env.CLIENT_BASE_URL
      ? `${process.env.CLIENT_BASE_URL.replace(/\/+$/, "")}/api/notifications/whatsapp-status`
      : "");

  const msg = await twilioBreaker.execute(() =>
    withRetry(
      () => client.messages.create({
        body,
        from: process.env.TWILIO_WHATSAPP_FROM,
        to: normalizedTo,
        ...(statusCallback ? { statusCallback } : {})
      }),
      { retries: 2, baseDelayMs: 250 }
    )
  );
  console.log(`[Notification:sent-whatsapp] to=${normalizedTo} template=${tm.templateId}@v${tm.templateVersion} sid=${msg.sid || "n/a"}`);
  return { providerMessageId: msg.sid || "" };
}

async function deliverPushNow(subscription, payload, options = {}) {
  const tm = templateMeta(options.templateId);
  const cleanSub = sanitizeSubscription(subscription);
  if (!cleanSub) return { skipped: true, reason: "invalid_subscription" };
  if (!isPushConfigured()) {
    console.log(`[Notification:skip-push] endpoint=${cleanSub.endpoint} reason="Web push not configured or package missing"`);
    throw new Error("Web push not configured");
  }

  const response = await withRetry(
    () => sendWebPush(cleanSub, payload, options),
    { retries: 2, baseDelayMs: 250 }
  );

  console.log(`[Notification:sent-push] endpoint=${cleanSub.endpoint} template=${tm.templateId}@v${tm.templateVersion} status=${response?.statusCode || "n/a"}`);
  return { providerMessageId: String(response?.headers?.location || cleanSub.endpoint) };
}

async function enqueueNotificationJob({
  channel,
  to,
  payload,
  templateId = "generic",
  maxAttempts = QUEUE_MAX_ATTEMPTS,
  metadata = {}
}) {
  const tm = templateMeta(templateId);
  const job = await NotificationJob.create({
    channel,
    to,
    payload,
    templateId: tm.templateId,
    templateVersion: tm.templateVersion,
    status: "pending",
    attempts: 0,
    maxAttempts,
    nextAttemptAt: new Date(),
    metadata
  });
  console.log(`[Notification:queued] channel=${channel} to=${to} template=${tm.templateId}@v${tm.templateVersion} job=${job._id}`);
  return job;
}

function backoffDelayMs(nextAttempt) {
  const exp = Math.max(0, Number(nextAttempt) - 1);
  return Math.min(QUEUE_MAX_DELAY_MS, 1000 * (2 ** exp));
}

async function claimNextJob() {
  const now = new Date();
  return NotificationJob.findOneAndUpdate(
    {
      status: { $in: ["pending", "failed"] },
      nextAttemptAt: { $lte: now }
    },
    {
      $set: {
        status: "processing",
        lockedAt: now
      }
    },
    {
      sort: { nextAttemptAt: 1, createdAt: 1 },
      returnDocument: "after"
    }
  );
}

async function processJob(job) {
  try {
    let result = { providerMessageId: "" };
    if (job.channel === "email") {
      const p = job.payload || {};
      result = await deliverEmailNow(p.to || job.to, p.subject, p.text || "", {
        html: p.html || "",
        templateId: job.templateId || "generic"
      });
    } else if (job.channel === "whatsapp") {
      const p = job.payload || {};
      result = await deliverWhatsAppNow(p.to || job.to, p.body || "", {
        templateId: job.templateId || "generic"
      });
    } else if (job.channel === "push") {
      const p = job.payload || {};
      result = await deliverPushNow(p.subscription || {}, p.notification || {}, {
        templateId: job.templateId || "generic",
        ttl: p.ttl,
        urgency: p.urgency,
        topic: p.topic
      });
    } else {
      throw new Error(`Unsupported channel ${job.channel}`);
    }

    await NotificationJob.updateOne(
      { _id: job._id },
      {
        $set: {
          status: "sent",
          sentAt: new Date(),
          lockedAt: null,
          providerMessageId: result.providerMessageId || "",
          lastError: ""
        }
      }
    );
  } catch (err) {
    if (
      job.channel === "push" &&
      (Number(err?.statusCode || 0) === 404 || Number(err?.statusCode || 0) === 410) &&
      job?.metadata?.userId &&
      job?.metadata?.endpoint
    ) {
      await User.updateOne(
        { _id: job.metadata.userId },
        { $pull: { pushSubscriptions: { endpoint: String(job.metadata.endpoint) } } }
      ).catch(() => null);
    }

    const attempts = Number(job.attempts || 0) + 1;
    const maxAttempts = Number(job.maxAttempts || QUEUE_MAX_ATTEMPTS);
    const isDead = attempts >= maxAttempts;
    const nextAttemptAt = new Date(Date.now() + backoffDelayMs(attempts));
    await NotificationJob.updateOne(
      { _id: job._id },
      {
        $set: {
          attempts,
          status: isDead ? "dead_letter" : "failed",
          lockedAt: null,
          nextAttemptAt,
          lastError: String(err?.message || err || "Unknown error"),
          ...(isDead ? { deadLetterAt: new Date() } : {})
        }
      }
    );
    if (isDead) {
      console.error(`[Notification:dead-letter] job=${job._id} channel=${job.channel} to=${job.to} error=${String(err?.message || err)}`);
    } else {
      console.warn(`[Notification:retry] job=${job._id} attempt=${attempts}/${maxAttempts} next=${nextAttemptAt.toISOString()}`);
    }
  }
}

async function processNotificationQueueOnce() {
  if (!QUEUE_ENABLED) return;
  if (mongoose.connection.readyState !== 1) return;
  if (queueLoopRunning) return;
  queueLoopRunning = true;
  try {
    for (let i = 0; i < QUEUE_BATCH; i += 1) {
      const job = await claimNextJob();
      if (!job) break;
      await processJob(job);
    }
  } catch (err) {
    console.error("[Notification:queue] worker error:", err.message);
  } finally {
    queueLoopRunning = false;
  }
}

function startNotificationWorker() {
  if (!QUEUE_ENABLED || queueTimer) return;
  queueTimer = setInterval(() => {
    processNotificationQueueOnce().catch(() => {});
  }, QUEUE_POLL_MS);
  if (typeof queueTimer.unref === "function") queueTimer.unref();
  console.log(`[Notification:queue] started poll=${QUEUE_POLL_MS}ms batch=${QUEUE_BATCH}`);
}

function stopNotificationWorker() {
  if (!queueTimer) return;
  clearInterval(queueTimer);
  queueTimer = null;
}

async function sendEmail(to, subject, text, options = {}) {
  const throwOnError = Boolean(options.throwOnError);
  const immediate = Boolean(options.immediate || throwOnError || !QUEUE_ENABLED);
  const html = options.html || "";
  if (!to) return;

  if (!immediate) {
    await enqueueNotificationJob({
      channel: "email",
      to,
      payload: { to, subject, text, html },
      templateId: options.templateId || "generic",
      metadata: options.metadata || {}
    });
    return;
  }

  try {
    await deliverEmailNow(to, subject, text, options);
  } catch (err) {
    console.error(`[Notification:error] to=${to} subject="${subject}"`, err.message);
    if (throwOnError) throw err;
  }
}

async function sendWhatsApp(to, body, options = {}) {
  const immediate = Boolean(options.immediate || !QUEUE_ENABLED);
  const normalizedTo = normalizeWhatsAppNumber(to);
  if (!normalizedTo) return;

  if (!immediate) {
    await enqueueNotificationJob({
      channel: "whatsapp",
      to: normalizedTo,
      payload: { to: normalizedTo, body },
      templateId: options.templateId || "generic",
      metadata: options.metadata || {}
    });
    return;
  }

  try {
    await deliverWhatsAppNow(normalizedTo, body, options);
  } catch (err) {
    console.error(`[Notification:error-whatsapp] to=${normalizedTo}`, err.message);
  }
}

async function sendPush(subscription, notification, options = {}) {
  const cleanSub = sanitizeSubscription(subscription);
  if (!cleanSub) return;
  const immediate = Boolean(options.immediate || !QUEUE_ENABLED);
  const metadata = {
    ...(options.metadata || {}),
    endpoint: cleanSub.endpoint
  };

  if (!immediate) {
    await enqueueNotificationJob({
      channel: "push",
      to: cleanSub.endpoint,
      payload: {
        subscription: cleanSub,
        notification,
        ttl: options.ttl,
        urgency: options.urgency,
        topic: options.topic
      },
      templateId: options.templateId || "generic",
      metadata
    });
    return;
  }

  try {
    await deliverPushNow(cleanSub, notification, options);
  } catch (err) {
    console.error(`[Notification:error-push] endpoint=${cleanSub.endpoint}`, err.message);
  }
}

async function notifyBookingConfirmed({
  toUserEmail,
  eventTitle,
  quantity,
  amount,
  bookingId = "",
  attendeeName = "",
  eventDate = "",
  location = "",
  ticketType = "Standard"
}) {
  const bookingRef = readableBookingRef(bookingId);
  const when = eventDate ? new Date(eventDate).toLocaleString() : "TBD";
  const confirmationUrl = bookingId && process.env.CLIENT_BASE_URL
    ? `${process.env.CLIENT_BASE_URL.replace(/\/+$/, "")}/ticket-confirmation.html?bookingId=${encodeURIComponent(String(bookingId))}`
    : "";
  const qrDataUrl = await buildBookingQrDataUrl({
    bookingId,
    attendeeName,
    eventTitle,
    ticketType,
    quantity
  });
  const text = [
    `Your booking is confirmed for "${eventTitle}".`,
    `Booking Ref: ${bookingRef || "n/a"}`,
    `Tickets: ${quantity}`,
    `Ticket Type: ${ticketType || "Standard"}`,
    `Amount: $${amount}`,
    `Date: ${when}`,
    `Location: ${location || "TBD"}`,
    confirmationUrl ? `Pass: ${confirmationUrl}` : ""
  ].filter(Boolean).join("\n");

  const qrHtml = qrDataUrl
    ? `
      <div style="margin-top:18px;padding:16px;border:1px solid #1f2937;border-radius:10px;background:#0f172a;text-align:center;">
        <p style="margin:0 0 10px 0;color:#cbd5e1;font-size:13px;">Scan this QR at event entry</p>
        <img src="${qrDataUrl}" alt="Booking QR Code" width="180" height="180" style="display:block;margin:0 auto 8px auto;background:#ffffff;padding:8px;border-radius:10px;" />
        <p style="margin:0;color:#94a3b8;font-size:12px;">Booking Ref: ${escapeHtml(bookingRef || "n/a")}</p>
      </div>
    `
    : "";

    await sendEmail(
      toUserEmail,
      "Booking confirmed",
      text,
      {
        templateId: "booking_confirmed",
        html: buildEmailHtml({
          title: "Booking Confirmed",
          intro: "Your booking has been confirmed successfully.",
          bullets: [
            `Event: ${eventTitle}`,
            `Booking Ref: ${bookingRef || "n/a"}`,
            `Tickets: ${quantity}`,
            `Ticket Type: ${ticketType || "Standard"}`,
            `Amount: $${amount}`,
            `Date: ${when}`,
            `Location: ${location || "TBD"}`
          ],
          ctaLabel: confirmationUrl ? "Open Ticket Pass" : "",
          ctaUrl: confirmationUrl,
          footer: "Save this email for quick entry at the event.",
          extraHtml: qrHtml
        })
      }
    );
  }

async function notifyBookingConfirmedWhatsApp({ toWhatsApp, eventTitle, quantity, amount }) {
  await sendWhatsApp(
    toWhatsApp,
    `Booking confirmed for "${eventTitle}". Tickets: ${quantity}. Amount: $${amount}.`,
    { templateId: "whatsapp_booking_confirmed" }
  );
}

async function notifyBookingCancelled({ toUserEmail, eventTitle }) {
  const text = `Your booking for "${eventTitle}" has been cancelled.`;
  await sendEmail(
    toUserEmail,
    "Booking cancelled",
    text,
    {
      templateId: "booking_cancelled",
      html: buildEmailHtml({
        title: "Booking Cancelled",
        intro: "Your booking was cancelled successfully.",
        bullets: [`Event: ${eventTitle}`],
        footer: "If this was not expected, contact support."
      })
    }
  );
}

async function notifyBookingCancelledWhatsApp({ toWhatsApp, eventTitle }) {
  await sendWhatsApp(
    toWhatsApp,
    `Booking cancelled for "${eventTitle}".`,
    { templateId: "whatsapp_booking_cancelled" }
  );
}

async function notifyAdminNewBooking({ eventTitle, attendeeEmail, quantity, amount }) {
  if (!WEB_EMAIL) return;
  const text = `New booking for "${eventTitle}". User: ${attendeeEmail}. Quantity: ${quantity}. Amount: $${amount}.`;
  await sendEmail(
    WEB_EMAIL,
    "New booking received",
    text,
    {
      templateId: "admin_new_booking",
      html: buildEmailHtml({
        title: "New Booking Received",
        intro: "A new booking was made on your platform.",
        bullets: [`Event: ${eventTitle}`, `User: ${attendeeEmail}`, `Quantity: ${quantity}`, `Amount: $${amount}`]
      })
    }
  );
}

async function notifyAdminNewBookingWhatsApp({ eventTitle, attendeeEmail, quantity, amount }) {
  if (!WEB_WHATSAPP_TO) return;
  await sendWhatsApp(
    WEB_WHATSAPP_TO,
    `New booking: "${eventTitle}" | User: ${attendeeEmail} | Qty: ${quantity} | Amount: $${amount}.`,
    { templateId: "whatsapp_admin_new_booking" }
  );
}

async function notifyUserWelcome({ toUserEmail, userName }) {
  const text = `Hi ${userName || "User"}, your account has been created successfully. You can now browse and book events.`;
  await sendEmail(
    toUserEmail,
    "Welcome to Smart Event System",
    text,
    {
      templateId: "user_welcome",
      html: buildEmailHtml({
        title: "Welcome to Smart Event System",
        intro: `Hi ${userName || "User"}, your account has been created successfully. You can now browse and book events.`
      })
    }
  );
}

async function notifyAdminNewSignup({ userName, userEmail }) {
  if (!WEB_EMAIL) return;
  const text = `A new user signed up.\nName: ${userName}\nEmail: ${userEmail}`;
  await sendEmail(
    WEB_EMAIL,
    "New user signup",
    text,
    {
      templateId: "admin_new_signup",
      html: buildEmailHtml({
        title: "New User Signup",
        intro: "A new user has registered.",
        bullets: [`Name: ${userName}`, `Email: ${userEmail}`]
      })
    }
  );
}

async function notifyAdminEventCreated({ eventTitle, eventDate, location, organizer }) {
  if (!WEB_EMAIL) return;
  const text = `A new event was created.\nTitle: ${eventTitle}\nDate: ${eventDate}\nLocation: ${location}\nOrganizer: ${organizer}`;
  await sendEmail(
    WEB_EMAIL,
    "New event created",
    text,
    {
      templateId: "admin_event_created",
      html: buildEmailHtml({
        title: "New Event Created",
        intro: "A new event was created successfully.",
        bullets: [`Title: ${eventTitle}`, `Date: ${eventDate}`, `Location: ${location}`, `Organizer: ${organizer}`]
      })
    }
  );
}

async function notifyUserLoginAlert({ toUserEmail, userName, ipAddress, userAgent }) {
  const nowIso = new Date().toISOString();
  const text = `Hi ${userName || "User"}, your account was just logged in.\nTime: ${nowIso}\nIP: ${ipAddress || "unknown"}\nDevice: ${userAgent || "unknown"}`;
  await sendEmail(
    toUserEmail,
    "Login alert",
    text,
    {
      templateId: "login_alert",
      html: buildEmailHtml({
        title: "Login Alert",
        intro: "A new login to your account was detected.",
        bullets: [`User: ${userName || "User"}`, `Time: ${nowIso}`, `IP: ${ipAddress || "unknown"}`, `Device: ${userAgent || "unknown"}`],
        footer: "If this was not you, reset your password immediately."
      })
    }
  );
}

async function notifyTestEmail(to) {
  const text = "This is a test email. SMTP notification pipeline is working.";
  await sendEmail(
    to || WEB_EMAIL,
    "Test notification from Smart Event System",
    text,
    {
      templateId: "smtp_test",
      html: buildEmailHtml({
        title: "SMTP Test Notification",
        intro: "This confirms your email notification pipeline is working."
      })
    }
  );
}

async function notifyPasswordReset({ toUserEmail, resetUrl }) {
  const firstLine = String(resetUrl || "").split("\n")[0] || "";
  const text = `We received a password reset request.\n\nReset your password here:\n${resetUrl}\n\nIf you did not request this, you can ignore this email.`;
  await sendEmail(
    toUserEmail,
    "Password reset request",
    text,
    {
      throwOnError: true,
      immediate: true,
      templateId: "password_reset",
      html: buildEmailHtml({
        title: "Password Reset Request",
        intro: "We received a request to reset your password.",
        bullets: ["Use the OTP sent in this email and continue reset flow."],
        ctaLabel: firstLine ? "Open Verification Page" : "",
        ctaUrl: firstLine,
        footer: "If you did not request this, you can ignore this email."
      })
    }
  );
}

async function notifySignupOtp({ toUserEmail, userName, otp }) {
  const text = `Hi ${userName || "User"}, your signup OTP is ${otp}. It will expire in 10 minutes.`;
  await sendEmail(
    toUserEmail,
    "Verify your email with OTP",
    text,
    {
      throwOnError: true,
      immediate: true,
      templateId: "signup_otp",
      html: buildEmailHtml({
        title: "Verify Your Email",
        intro: `Hi ${userName || "User"}, use this OTP to complete signup.`,
        bullets: [`OTP: ${otp}`, "Valid for 10 minutes"],
        footer: "If you did not request this signup, please ignore this email."
      })
    }
  );
}

async function notifySavedEventReminder({
  toUserEmail,
  pushSubscriptions = [],
  userId,
  eventId,
  userName,
  eventTitle,
  eventDate,
  location,
  reminderHoursBefore
}) {
  const when = eventDate ? new Date(eventDate).toLocaleString() : "TBD";
  const title = eventTitle || "Upcoming Event";
  const eventUrl = eventId
    ? `/event-details.html?id=${encodeURIComponent(String(eventId))}`
    : "/user.html";
  const intro = `Hi ${userName || "User"}, reminder for an event you saved.`;
  const bullets = [
    `Event: ${title}`,
    `Date: ${when}`,
    `Location: ${location || "TBD"}`,
    `Reminder: ${Number(reminderHoursBefore || 24)} hours before`
  ];

  if (toUserEmail) {
    await sendEmail(
      toUserEmail,
      `Reminder: ${title}`,
      `Reminder: "${title}" is coming up on ${when} at ${location || "TBD"}.`,
      {
        templateId: "saved_event_reminder_email",
        html: buildEmailHtml({
          title: "Saved Event Reminder",
          intro,
          bullets,
          footer: "You are receiving this because you saved this event."
        })
      }
    );
  }

  for (const subscription of Array.isArray(pushSubscriptions) ? pushSubscriptions : []) {
    await sendPush(
      subscription,
      {
        title: `Reminder: ${title}`,
        body: `${when} • ${location || "TBD"}`,
        icon: "/assets/web-logo.png",
        badge: "/assets/web-logo.png",
        url: eventUrl,
        tag: `saved-event-${String(subscription.endpoint || "").slice(-24)}`,
        data: {
          url: eventUrl,
          eventId: String(eventId || ""),
          eventTitle: title,
          location: location || "TBD"
        }
      },
      {
        templateId: "saved_event_reminder_push",
        ttl: 60 * 60,
        urgency: "high",
        metadata: {
          userId: String(userId || "")
        }
      }
    );
  }
}

async function notifyOrganizerWeeklyDigest({
  toUserEmail,
  organizerName,
  summary,
  dashboardUrl
}) {
  if (!toUserEmail || !summary) return;

  const topEvents = Array.isArray(summary.topEvents) ? summary.topEvents : [];
  const predictions = Array.isArray(summary.upcomingPredictions) ? summary.upcomingPredictions : [];
  const atRiskUsers = Array.isArray(summary.atRiskUsers) ? summary.atRiskUsers : [];

  const bullets = [
    `Bookings last 7 days: ${Number(summary.bookingsLast7 || 0)} (${String(summary.bookingsTrendLabel || "0 vs previous week")})`,
    `Revenue last 7 days: $${Number(summary.revenueLast7 || 0).toFixed(2)}`,
    `Confirmed / cancelled: ${Number(summary.confirmedLast7 || 0)} / ${Number(summary.cancelledLast7 || 0)}`,
    `Active events: ${Number(summary.activeEvents || 0)}`,
    `Upcoming events analysed: ${Number(summary.upcomingEvents || 0)}`
  ];

  if (topEvents.length) {
    bullets.push(...topEvents.slice(0, 3).map((row) =>
      `Top event: ${row.title} (${Number(row.bookings || 0)} bookings, $${Number(row.revenue || 0).toFixed(2)} revenue)`
    ));
  }

  if (predictions.length) {
    bullets.push(...predictions.slice(0, 3).map((row) =>
      `Attendance forecast: ${row.title} -> ${Number(row.predictedAttendance || 0)} attending, ${Number(row.predictedNoShows || 0)} no-shows (${Number(row.showUpRate || 0)}% show-up)`
    ));
  }

  if (atRiskUsers.length) {
    bullets.push(...atRiskUsers.slice(0, 3).map((row) =>
      `At-risk attendee: ${row.userName || row.userEmail || "User"} for ${row.eventTitle || "event"} (${Number(row.churnScore || 0)}% churn risk)`
    ));
  } else {
    bullets.push("At-risk attendees: no high-risk churn users detected this week.");
  }

  const intro = `Hi ${organizerName || "Organizer"}, here is your weekly event performance digest.`;
  const text = [
    intro,
    ...bullets
  ].join("\n");

  await sendEmail(
    toUserEmail,
    "Your weekly organizer digest",
    text,
    {
      templateId: "organizer_weekly_digest",
      html: buildEmailHtml({
        title: "Weekly Organizer Digest",
        intro,
        bullets,
        ctaLabel: dashboardUrl ? "Open Dashboard" : "",
        ctaUrl: dashboardUrl || "",
        footer: "Smart Event System weekly organizer summary"
      })
    }
  );
}

async function notifyWaitlistPromoted({
  toUserEmail,
  userName,
  eventTitle,
  eventDate,
  location,
  quantity,
  amount,
  dashboardUrl
}) {
  if (!toUserEmail) return;
  const when = eventDate ? new Date(eventDate).toLocaleString() : "TBD";
  const intro = `Hi ${userName || "there"}, a seat opened up from the waitlist for an event you requested.`;
  const bullets = [
    `Event: ${eventTitle || "Upcoming Event"}`,
    `Date: ${when}`,
    `Location: ${location || "TBD"}`,
    `Quantity reserved: ${Number(quantity || 1)}`,
    `Amount due: $${Number(amount || 0).toFixed(2)}`
  ];

  await sendEmail(
    toUserEmail,
    `Waitlist seat available: ${eventTitle || "Event"}`,
    `${intro}\nEvent: ${eventTitle || "Upcoming Event"}\nDate: ${when}\nLocation: ${location || "TBD"}\nQuantity reserved: ${Number(quantity || 1)}\nAmount due: $${Number(amount || 0).toFixed(2)}`,
    {
      templateId: "waitlist_promoted",
      html: buildEmailHtml({
        title: "Waitlist Seat Available",
        intro,
        bullets,
        ctaLabel: dashboardUrl ? "Open My Bookings" : "",
        ctaUrl: dashboardUrl || "",
        footer: "Complete payment or review your booking from your dashboard."
      })
    }
  );
}

module.exports = {
  notifyBookingConfirmed,
  notifyBookingConfirmedWhatsApp,
  notifyBookingCancelled,
  notifyBookingCancelledWhatsApp,
  notifyAdminNewBooking,
  notifyAdminNewBookingWhatsApp,
  notifyUserWelcome,
  notifyAdminNewSignup,
  notifyAdminEventCreated,
  notifyUserLoginAlert,
  notifyTestEmail,
  notifyPasswordReset,
  notifySignupOtp,
  notifySavedEventReminder,
  notifyOrganizerWeeklyDigest,
  notifyWaitlistPromoted,
  sendPush,
  sendEmail,
  startNotificationWorker,
  stopNotificationWorker,
  processNotificationQueueOnce
};
