(function initPwaClient() {
  let deferredInstallPrompt = null;
  function ensureManifestLink() {
    if (document.querySelector('link[rel="manifest"]')) return;
    const link = document.createElement("link");
    link.rel = "manifest";
    link.href = "/manifest.json";
    document.head.appendChild(link);
  }

  function ensureThemeColorMeta() {
    if (document.querySelector('meta[name="theme-color"]')) return;
    const meta = document.createElement("meta");
    meta.name = "theme-color";
    meta.content = "#fbbf24";
    document.head.appendChild(meta);
  }

  async function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return null;
    try {
      return await navigator.serviceWorker.register("/sw.js");
    } catch (err) {
      console.warn("[PWA] Service worker registration failed:", err?.message || err);
      return null;
    }
  }

  function canInstall() {
    return Boolean(deferredInstallPrompt);
  }

  async function promptInstall() {
    if (!deferredInstallPrompt) {
      return { installed: false, reason: "unavailable" };
    }

    const promptEvent = deferredInstallPrompt;
    deferredInstallPrompt = null;
    await promptEvent.prompt();
    const outcome = await promptEvent.userChoice.catch(() => ({ outcome: "dismissed" }));
    return {
      installed: outcome?.outcome === "accepted",
      reason: outcome?.outcome || "dismissed"
    };
  }

  function normalizeToken(raw) {
    const value = String(raw || "").trim();
    if (!value) return "";
    return /^Bearer\s+/i.test(value) ? value : `Bearer ${value}`;
  }

  function urlBase64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; i += 1) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  async function getPublicKey() {
    const res = await fetch("/api/notifications/push/public-key");
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Push notifications are not configured.");
    }
    const data = await res.json();
    return String(data.publicKey || "").trim();
  }

  async function getCurrentSubscription() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
    const registration = await navigator.serviceWorker.ready;
    return registration.pushManager.getSubscription();
  }

  async function subscribe(token) {
    if (!("Notification" in window) || !("PushManager" in window)) {
      throw new Error("Push notifications are not supported on this browser.");
    }

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      throw new Error("Notification permission was not granted.");
    }

    const registration = await navigator.serviceWorker.ready;
    const publicKey = await getPublicKey();
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      });
    }

    const authToken = normalizeToken(token || localStorage.getItem("token"));
    if (!authToken) throw new Error("Login required to save push subscription.");

    const res = await fetch("/api/notifications/push/subscribe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authToken
      },
      body: JSON.stringify({
        subscription: subscription.toJSON(),
        userAgent: navigator.userAgent
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Failed to save push subscription.");
    }

    return subscription;
  }

  async function unsubscribe(token) {
    const subscription = await getCurrentSubscription();
    if (!subscription) return false;

    const authToken = normalizeToken(token || localStorage.getItem("token"));
    if (authToken) {
      await fetch("/api/notifications/push/subscribe", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: authToken
        },
        body: JSON.stringify({ endpoint: subscription.endpoint })
      }).catch(() => null);
    }

    return subscription.unsubscribe();
  }

  async function getStatus() {
    const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    if (!supported) {
      return { supported: false, permission: "unsupported", subscribed: false };
    }
    const permission = Notification.permission;
    const subscription = await getCurrentSubscription();
    return { supported: true, permission, subscribed: Boolean(subscription) };
  }

  ensureManifestLink();
  ensureThemeColorMeta();
  registerServiceWorker();

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    window.dispatchEvent(new CustomEvent("pwa:install-available"));
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    window.dispatchEvent(new CustomEvent("pwa:installed"));
  });

  window.PWAClient = {
    registerServiceWorker,
    canInstall,
    promptInstall,
    getStatus,
    subscribe,
    unsubscribe
  };
})();
