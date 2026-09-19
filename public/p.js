/* Pulse tracking snippet. Ryder Schilling LLC.
   Install: <script async src="https://YOUR-PULSE-DOMAIN/p.js" data-site="SITE_KEY"></script>
   Tracks: pageviews, calls (tel:), emails (mailto:), sms, form submits, booking
   links, outbound links, button/link clicks (for the click map), scroll depth
   and time on page. No cookies. Two random ids in localStorage/sessionStorage.
   Manual events: window.pulse('booking', { label: 'Book a call' }) */
(function () {
  if (window.__pulseLoaded) return;
  window.__pulseLoaded = true;

  var script = document.currentScript || (function () {
    var s = document.getElementsByTagName("script");
    for (var i = s.length - 1; i >= 0; i--) if (s[i].getAttribute("data-site")) return s[i];
    return null;
  })();
  if (!script) return;
  var SITE = script.getAttribute("data-site");
  if (!SITE) return;
  var ORIGIN = (script.getAttribute("data-api") || script.src.replace(/\/p\.js.*$/, ""));
  var ENDPOINT = ORIGIN + "/api/collect";
  var BOOKING_HOSTS = /calendly\.com|cal\.com|acuityscheduling\.com|squareup\.com\/appointments|square\.site|app\.squareup\.com|booksy\.com|vagaro\.com|mindbodyonline\.com|zocdoc\.com|housecallpro\.com|setmore\.com|youcanbook\.me|tidycal\.com|hubspot\.com\/meetings|zeffy\.com|givebutter\.com/i;

  function rid() {
    var a = "";
    try {
      var b = new Uint8Array(12); crypto.getRandomValues(b);
      for (var i = 0; i < b.length; i++) a += (b[i] % 36).toString(36);
      return a;
    } catch (e) { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
  }
  function store(kind, key, val) {
    try {
      var s = kind === "l" ? localStorage : sessionStorage;
      if (val !== undefined) s.setItem(key, val);
      return s.getItem(key);
    } catch (e) { return null; }
  }
  var VID = store("l", "_pulse_v") || store("l", "_pulse_v", rid()) || rid();
  // Session: 30 minutes of inactivity starts a new one.
  var now = Date.now();
  var SID = store("s", "_pulse_s");
  var last = parseInt(store("s", "_pulse_t") || "0", 10);
  if (!SID || now - last > 30 * 60 * 1000) { SID = rid(); store("s", "_pulse_s", SID); }
  store("s", "_pulse_t", String(now));

  var params = {};
  try {
    var qs = new URLSearchParams(location.search);
    ["utm_source", "utm_medium", "utm_campaign"].forEach(function (k) { if (qs.get(k)) params[k] = qs.get(k); });
    // remember first-touch UTMs for the session
    if (params.utm_source) store("s", "_pulse_utm", JSON.stringify(params));
    else { var u = store("s", "_pulse_utm"); if (u) params = JSON.parse(u); }
  } catch (e) {}

  var w = window.innerWidth || 0;
  var DEVICE = w < 768 ? "mobile" : w < 1024 ? "tablet" : "desktop";
  var REF = store("s", "_pulse_ref");
  if (REF === null) {
    REF = document.referrer || "";
    try { if (REF && new URL(REF).host === location.host) REF = ""; } catch (e) {}
    store("s", "_pulse_ref", REF);
  }

  var queue = [];
  var timer = null;
  function flush(sync) {
    if (!queue.length) return;
    var body = JSON.stringify({ site: SITE, v: VID, s: SID, ref: REF, utm: params, device: DEVICE, events: queue });
    queue = [];
    try {
      if (navigator.sendBeacon && (sync || true)) {
        var ok = navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "text/plain" }));
        if (ok) return;
      }
      fetch(ENDPOINT, { method: "POST", body: body, keepalive: true, headers: { "Content-Type": "text/plain" }, mode: "cors", credentials: "omit" });
    } catch (e) {}
  }
  function push(type, extra) {
    var e = { t: type, p: location.pathname, ti: (document.title || "").slice(0, 120), at: Date.now() };
    if (extra) for (var k in extra) e[k] = extra[k];
    queue.push(e);
    store("s", "_pulse_t", String(Date.now()));
    clearTimeout(timer);
    timer = setTimeout(function () { flush(false); }, type === "pageview" ? 400 : 1500);
  }

  // --- pageviews (incl. SPA route changes) ---
  var pageStart = Date.now();
  var maxScroll = 0;
  var lastPath = location.pathname;
  function pageview() {
    pageStart = Date.now();
    maxScroll = 0;
    lastPath = location.pathname;
    push("pageview");
  }
  function leave() {
    var secs = Math.round((Date.now() - pageStart) / 1000);
    push("leave", { p: lastPath, v: secs, sc: maxScroll });
    flush(true);
  }
  pageview();
  var _ps = history.pushState;
  history.pushState = function () { leave(); _ps.apply(this, arguments); setTimeout(pageview, 0); };
  window.addEventListener("popstate", function () { leave(); setTimeout(pageview, 0); });

  // --- scroll depth ---
  function onScroll() {
    var h = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) - window.innerHeight;
    var pct = h <= 0 ? 100 : Math.min(100, Math.round(((window.scrollY || window.pageYOffset) / h) * 100));
    if (pct > maxScroll) maxScroll = pct;
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  setTimeout(onScroll, 1000);

  // --- clicks ---
  function textOf(el) {
    var t = (el.getAttribute("aria-label") || el.getAttribute("title") || el.innerText || el.textContent || el.getAttribute("alt") || "").replace(/\s+/g, " ").trim();
    if (!t && el.querySelector) { var img = el.querySelector("img[alt]"); if (img) t = img.getAttribute("alt"); }
    return t.slice(0, 80);
  }
  document.addEventListener("click", function (ev) {
    var el = ev.target;
    var a = null, btn = null;
    while (el && el !== document) {
      if (!a && el.tagName === "A") a = el;
      if (!btn && (el.tagName === "BUTTON" || el.getAttribute && el.getAttribute("role") === "button" || (el.tagName === "INPUT" && /submit|button/.test(el.type)))) btn = el;
      if (el.getAttribute && el.getAttribute("data-track")) {
        push("custom", { l: el.getAttribute("data-track"), h: (a && a.href) || "" });
        return;
      }
      el = el.parentNode;
    }
    var target = a || btn;
    if (!target) return;
    // A submit button inside a form is covered by the submit event.
    if (!a && btn && btn.form && /submit/.test(btn.type || "submit")) return;
    var href = a ? (a.getAttribute("href") || "") : "";
    var label = textOf(target);
    if (/^tel:/i.test(href)) return push("call", { l: label, h: href });
    if (/^mailto:/i.test(href)) return push("email", { l: label, h: href });
    if (/^sms:/i.test(href)) return push("sms", { l: label, h: href });
    if (a && a.href && BOOKING_HOSTS.test(a.href)) return push("booking", { l: label, h: a.href });
    if (a && a.host && a.host !== location.host && /^https?:/.test(a.href)) return push("outbound", { l: label, h: a.href });
    push("click", { l: label, h: href.slice(0, 200) });
  }, true);

  // --- forms ---
  document.addEventListener("submit", function (ev) {
    var f = ev.target;
    if (!f || f.tagName !== "FORM") return;
    var name = f.getAttribute("data-track") || f.getAttribute("name") || f.getAttribute("id") || f.getAttribute("aria-label") || "";
    if (!name) { var sb = f.querySelector("button[type=submit],input[type=submit],button:not([type])"); if (sb) name = textOf(sb); }
    push("form", { l: name || "form", h: (f.getAttribute("action") || "").slice(0, 200) });
    flush(true);
  }, true);

  // --- manual API ---
  window.pulse = function (type, extra) {
    extra = extra || {};
    push(type === "custom" || !type ? "custom" : type, { l: extra.label || extra.name || "", h: extra.href || "", v: extra.value });
  };

  window.addEventListener("pagehide", leave);
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") flush(true); });
})();
