(async function initNavAuth() {
  const nav = document.querySelector("[data-role-nav]");
  if (!nav) return;

  nav.classList.add("fixed", "top-0", "left-0", "right-0", "z-[1200]");
  nav.style.position = "fixed";
  nav.style.top = "0";
  nav.style.left = "0";
  nav.style.right = "0";
  nav.style.zIndex = "1200";

  let spacer = document.getElementById("globalNavSpacer");
  if (!spacer) {
    spacer = document.createElement("div");
    spacer.id = "globalNavSpacer";
    nav.parentNode.insertBefore(spacer, nav.nextSibling);
  }

  function syncSpacer() {
    spacer.style.height = `${nav.offsetHeight + 12}px`;
  }
  syncSpacer();
  window.addEventListener("resize", syncSpacer);

  function normalizeToken(raw) {
    const value = String(raw || "").trim();
    if (!value) return "";
    return /^Bearer\s+/i.test(value) ? value : `Bearer ${value}`;
  }

  function makeAvatarUrl(name) {
    const initials = encodeURIComponent(
      String(name || "User")
        .split(" ")
        .map((p) => p[0] || "")
        .join("")
        .slice(0, 2)
        .toUpperCase()
    );
    return `https://ui-avatars.com/api/?name=${initials}&background=0f172a&color=f59e0b&size=96`;
  }

  async function refreshSession() {
    try {
      const res = await fetch("/api/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      if (!res.ok) return "";
      const data = await res.json();
      if (!data || !data.token) return "";
      localStorage.setItem("token", data.token);
      return normalizeToken(data.token);
    } catch {
      return "";
    }
  }

  async function getMe(token) {
    try {
      const res = await fetch("/api/auth/me", { headers: { Authorization: token } });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  function getRole(me) {
    if (!me) return "guest";
    return me.role === "admin" ? "admin" : "user";
  }

  function linkClass(isActive) {
    const base = "px-1 py-1 text-slate-200 transition-colors duration-200 hover:text-amber-300";
    return isActive ? `${base} text-amber-300 font-semibold` : base;
  }

  function isActiveHref(href) {
    const current = window.location.pathname.toLowerCase();
    const cleanHref = String(href || "").split("?")[0].toLowerCase();
    if (cleanHref === "/") return current === "/";
    return cleanHref === current;
  }

  function navItemsByRole(role) {
    if (role === "admin") {
      return [
        { href: "/", label: "Home" },
        { href: "/admin.html", label: "Dashboard" },

        { href: "/create-event.html", label: "Create" },
        { href: "/book.html", label: "Book" },
        { href: "/blog.html", label: "Blog" },
        { href: "/contact.html", label: "Contact" }
      ];
    }

    if (role === "user") {
      return [
        { href: "/", label: "Home" },
        { href: "/user.html", label: "Dashboard" },
        { href: "/book.html", label: "Book" },
        { href: "/blog.html", label: "Blog" },
        { href: "/contact.html", label: "Contact" }
      ];
    }

    return [
      { href: "/", label: "Home" },
      { href: "/book.html", label: "Book" },
      { href: "/blog.html", label: "Blog" },
      { href: "/contact.html", label: "Contact" },
      { href: "/login.html", label: "Login" },
      { href: "/signup.html", label: "Sign Up" }
    ];
  }

  function ensureNavSearch(linksWrap) {
    const form = document.createElement("form");
    form.id = "navTopSearch";
    form.className = "mr-2 inline-flex items-center";

    const params = new URLSearchParams(window.location.search);
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Search events...";
    input.value = params.get("q") || "";
    input.className = "h-8 w-40 rounded-md border border-slate-700 bg-slate-900/70 px-2 text-xs text-slate-100 placeholder-slate-400 outline-none focus:ring-1 focus:ring-amber-300 md:w-48";

    form.appendChild(input);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const q = (input.value || "").trim();
      window.location.href = q ? `/?q=${encodeURIComponent(q)}` : "/";
    });

    linksWrap.appendChild(form);
  }

  function renderNav(role, me) {
    const linksWrap = nav.querySelector(".flex.flex-wrap.gap-2.text-sm");
    if (!linksWrap) return;

    linksWrap.innerHTML = "";
    ensureNavSearch(linksWrap);

    const items = navItemsByRole(role);
    items.forEach((item) => {
      const a = document.createElement("a");
      a.href = item.href;
      a.textContent = item.label;
      a.className = linkClass(isActiveHref(item.href));
      linksWrap.appendChild(a);
    });

    if (role !== "guest") {
      const avatar = document.createElement("a");
      avatar.href = "/profile.html";
      avatar.className = "inline-flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full ring-2 ring-amber-300/40";
      avatar.setAttribute("aria-label", "Profile");

      const img = document.createElement("img");
      img.className = "block h-full w-full object-cover";
      img.alt = "Profile";
      img.src = me && me.profileImage ? me.profileImage : makeAvatarUrl(me ? me.name : "User");

      avatar.appendChild(img);
      linksWrap.appendChild(avatar);
    }
  }

  function ensureFooter() {
    if (document.getElementById("globalFooter")) return;

    const year = new Date().getFullYear();
    const footer = document.createElement("footer");
    footer.id = "globalFooter";
    footer.className = "mx-auto mt-10 w-full max-w-7xl px-4 pb-8 text-sm text-slate-300";

    footer.innerHTML = `
      <div class="rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-5 backdrop-blur">
        <div class="grid gap-4 md:grid-cols-3">
          <div>
            <p class="font-semibold text-slate-100">Smart Event System</p>
            <p class="mt-1 text-xs text-slate-400">Plan, discover, and manage events with secure booking and role-based access.</p>
          </div>
          <div>
            <p class="font-semibold text-slate-100">Quick Links</p>
            <div class="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
              <a href="/" class="hover:text-amber-300">Home</a>
              <a href="/book.html" class="hover:text-amber-300">Book Event</a>
              <a href="/blog.html" class="hover:text-amber-300">Blog</a>
              <a href="/contact.html" class="hover:text-amber-300">Contact / FAQ</a>
              <a href="/ticketing.html" class="hover:text-amber-300">Ticketing</a>
            </div>
          </div>
          <div>
            <p class="font-semibold text-slate-100">Support</p>
            <p class="mt-1 text-xs">Email: <a class="text-amber-300 hover:text-amber-200" href="mailto:suneeltimani@gmail.com">suneeltimani@gmail.com</a></p>
            <p class="mt-1 text-xs text-slate-500">Response time: usually within 24 hours</p>
          </div>
        </div>
        <div class="mt-4 border-t border-slate-800 pt-3 text-xs text-slate-500">
          &copy; ${year} Smart Event System. All rights reserved.
        </div>
      </div>
    `;

    document.body.appendChild(footer);
  }

  function ensurePwaScript() {
    if (document.querySelector('script[src^="/pwa.js"]')) return;
    const script = document.createElement("script");
    script.src = "/pwa.js";
    document.body.appendChild(script);
  }

  let token = normalizeToken(localStorage.getItem("token"));
  let me = token ? await getMe(token) : null;

  if (!me) {
    token = await refreshSession();
    me = token ? await getMe(token) : null;
  }

  renderNav(getRole(me), me);
  ensureFooter();
  ensurePwaScript();
  syncSpacer();
})();




