(() => {
  const STYLE_ID = "evenix-footer-styles";
  const FOOTER_ID = "evenix-shared-footer";

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .ex-footer-wrap {
        width: min(1180px, calc(100% - 32px));
        margin: 32px auto 24px;
        font-family: "DM Sans", sans-serif;
      }
      .ex-footer {
        border: 1px solid rgba(255,255,255,0.07);
        border-radius: 24px;
        background:
          linear-gradient(180deg, rgba(13,17,23,0.96), rgba(13,17,23,0.9));
        box-shadow: 0 22px 48px rgba(0,0,0,0.22);
        padding: 24px;
        color: #f0f2f8;
      }
      .ex-footer-grid {
        display: grid;
        grid-template-columns: 1.2fr 1fr 1fr 1fr;
        gap: 18px;
      }
      .ex-footer-brand {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 12px;
      }
      .ex-footer-brand img {
        width: 42px;
        height: 42px;
        border-radius: 12px;
        object-fit: cover;
      }
      .ex-footer-name {
        display: block;
        font-size: 0.98rem;
        font-weight: 700;
        letter-spacing: -0.02em;
      }
      .ex-footer-tag {
        display: block;
        font-size: 0.74rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #8892a4;
      }
      .ex-footer-copy,
      .ex-footer-list a,
      .ex-footer-list span {
        color: #94a3b8;
        font-size: 0.92rem;
        line-height: 1.65;
      }
      .ex-footer-title {
        margin: 0 0 10px;
        font-size: 0.76rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #8892a4;
      }
      .ex-footer-list {
        display: grid;
        gap: 8px;
      }
      .ex-footer a {
        text-decoration: none;
        transition: color 0.15s ease;
      }
      .ex-footer a:hover {
        color: #f0f2f8;
      }
      .ex-footer-bottom {
        margin-top: 18px;
        padding-top: 14px;
        border-top: 1px solid rgba(255,255,255,0.06);
        display: flex;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
        color: #64748b;
        font-size: 0.84rem;
      }
      @media (max-width: 900px) {
        .ex-footer-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }
      @media (max-width: 640px) {
        .ex-footer-wrap {
          width: min(100%, calc(100% - 20px));
        }
        .ex-footer {
          padding: 20px;
          border-radius: 20px;
        }
        .ex-footer-grid {
          grid-template-columns: 1fr;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function createFooter() {
    if (document.getElementById(FOOTER_ID)) return;
    const wrap = document.createElement("div");
    wrap.className = "ex-footer-wrap";
    wrap.id = FOOTER_ID;
    wrap.innerHTML = `
      <footer class="ex-footer">
        <div class="ex-footer-grid">
          <section>
            <div class="ex-footer-brand">
              <img src="/assets/web-logo.png" alt="Evenix">
              <div>
                <span class="ex-footer-name">Evenix</span>
                <span class="ex-footer-tag">Discover · Book · Attend</span>
              </div>
            </div>
            <p class="ex-footer-copy">A modern event platform for discovery, booking, organizer operations, attendee passes, notifications, and analytics.</p>
          </section>
          <section>
            <h2 class="ex-footer-title">Explore</h2>
            <div class="ex-footer-list">
              <a href="/">Home</a>
              <a href="/book.html">Book Events</a>
              <a href="/ticketing.html">Ticketing</a>
              <a href="/blog.html">Blog</a>
            </div>
          </section>
          <section>
            <h2 class="ex-footer-title">Platform</h2>
            <div class="ex-footer-list">
              <a href="/contact.html">Contact & FAQ</a>
              <a href="/profile.html">Profile</a>
              <a href="/admin.html">Admin Dashboard</a>
              <a href="/organizer-tools.html">Organizer Tools</a>
            </div>
          </section>
          <section>
            <h2 class="ex-footer-title">Contact</h2>
            <div class="ex-footer-list">
              <a href="mailto:suneeltimani@gmail.com">suneeltimani@gmail.com</a>
              <span>Smart event workflows, reminders, and attendee operations.</span>
            </div>
          </section>
        </div>
        <div class="ex-footer-bottom">
          <span>© <span id="exFooterYear"></span> Evenix. All rights reserved.</span>
          <span>Built for event discovery, booking, and operations.</span>
        </div>
      </footer>
    `;
    document.body.appendChild(wrap);
    const yearEl = wrap.querySelector("#exFooterYear");
    if (yearEl) yearEl.textContent = String(new Date().getFullYear());
  }

  function init() {
    injectStyles();
    createFooter();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
