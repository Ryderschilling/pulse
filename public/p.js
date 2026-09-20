/* Pulse tracking snippet. Ryder Schilling LLC.
   Install: <script async src="https://YOUR-PULSE-DOMAIN/p.js" data-site="SITE_KEY"></script>
   Tracks: pageviews, calls (tel:), emails (mailto:), sms, form submits, booking
   links, outbound links, button/link clicks (for the click map), scroll depth
   and time on page. No cookies. Two random ids in localStorage.
   Manual events: window.pulse('booking', { label: 'Book a call' })
   Exclude yourself: open any page with ?pulse_ignore=1 once (?pulse_ignore=0 undoes it). */
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

  function store(key, val) {
    try {
      if (val !== undefined) localStorage.setItem(key, val);
      return localStorage.getItem(key);
    } catch (e) { return null; }
  }

  // --- self exclusion: you, the client, anyone testing ---
  try {
    var ig = new URLSearchParams(location.search).get("pulse_ignore");
    if (ig === "1") store("_pulse_ignore", "1");
    if (ig === "0") { try { localStorage.removeItem("_pulse_ignore"); } catch (e) {} }
  } catch (e) {}
  if (store("_pulse_ignore") === "1") { window.pulse = function () {}; window.pulse.ignored = true; return; }
  // Prerendered pages (Chrome speculation rules) are not visits until shown.
  if (document.prerendering) { document.addEventListener("prerenderingchange", run, { once: true }); return; }
  run();

  function run() {
  function rid() {
    var a = "";
    try {
      var b = new Uint8Array(12); crypto.getRandomValues(b);
      for (var i = 0; i < b.length; i++) a += (b[i] % 36).toString(36);
      return a;
    } catch (e) { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
  }
  var VID = store("_pulse_v") || store("_pulse_v", rid()) || rid();
  // Session: 30 minutes of inactivity starts a new one. Kept in localStorage so
  // a link opened in a new tab stays in the same visit.
  var now = Date.now();
  var SID = store("_pulse_s");
  var last = parseInt(store("_pulse_t") || "0", 10);
  var fresh = !SID || now - last > 30 * 60 * 1000;
  if (fresh) { SID = rid(); store("_pulse_s", SID); }
  store("_pulse_t", String(now));

  var params = {};
  try {
    var qs = new URLSearchParams(location.search);
    ["utm_source", "utm_medium", "utm_campaign"].forEach(function (k) { if (qs.get(k)) params[k] = qs.get(k); });
    if (params.utm_source) store("_pulse_utm", JSON.stringify(params));
    else if (!fresh) { var u = store("_pulse_utm"); if (u) params = JSON.parse(u); }
    else { try { localStorage.removeItem("_pulse_utm"); } catch (e) {} }
  } catch (e) {}

  var w = window.innerWidth || 0;
  var DEVICE = w < 768 ? "mobile" : w < 1024 ? "tablet" : "desktop";
  var REF = fresh ? null : store("_pulse_ref");
  if (REF === null) {
    REF = document.referrer || "";
    try { if (REF && new URL(REF).host.replace(/^www\./, "") === location.host.replace(/^www\./, "")) REF = ""; } catch (e) {}
    store("_pulse_ref", REF);
  }

  var queue = [];
  var timer = null;
  function flush() {
    if (!queue.length) return;
    var body = JSON.stringify({ site: SITE, v: VID, s: SID, ref: REF, utm: params, device: DEVICE, host: location.host, events: queue });
    queue = [];
    try {
      if (navigator.sendBeacon) {
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
    store("_pulse_t", String(Date.now()));
    clearTimeout(timer);
    timer = setTimeout(flush, type === "pageview" ? 400 : 1500);
  }

  // --- pageviews (incl. SPA route changes) ---
  var pageStart = Date.now();
  var maxScroll = 0;
  var lastPath = location.pathname;
  var leftAlready = false;
  function pageview() {
    pageStart = Date.now();
    maxScroll = 0;
    leftAlready = false;
    lastPath = location.pathname;
    push("pageview");
  }
  function leave() {
    if (leftAlready) return;
    leftAlready = true;
    var secs = Math.round((Date.now() - pageStart) / 1000);
    push("leave", { p: lastPath, v: secs, sc: maxScroll });
    flush();
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
  function sameSite(host) { return host.replace(/^www\./, "") === location.host.replace(/^www\./, ""); }
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
    if (!a && btn && btn.form && /submit/.test(btn.type || "submit")) return;
    var href = a ? (a.getAttribute("href") || "") : "";
    var label = textOf(target);
    if (/^tel:/i.test(href)) return push("call", { l: label, h: href });
    if (/^mailto:/i.test(href)) return push("email", { l: label, h: href });
    if (/^sms:/i.test(href)) return push("sms", { l: label, h: href });
    if (a && a.href && BOOKING_HOSTS.test(a.href)) return push("booking", { l: label, h: a.href });
    if (a && a.host && !sameSite(a.host) && /^https?:/.test(a.href)) return push("outbound", { l: label, h: a.href });
    push("click", { l: label, h: href.slice(0, 200) });
  }, true);

  // --- forms ---
  // Fires on the submit event. A form that fails its own JS validation and is
  // resubmitted fires again; the server counts one per visit, so that is fine.
  // On Next.js sites that post with fetch, call window.pulse('form') in the
  // success branch instead (or wire the /api/lead webhook).
  document.addEventListener("submit", function (ev) {
    var f = ev.target;
    if (!f || f.tagName !== "FORM") return;
    if (f.getAttribute("data-pulse") === "off") return;
    var name = f.getAttribute("data-track") || f.getAttribute("name") || f.getAttribute("id") || f.getAttribute("aria-label") || "";
    if (!name) { var sb = f.querySelector("button[type=submit],input[type=submit],button:not([type])"); if (sb) name = textOf(sb); }
    push("form", { l: name || "form", h: (f.getAttribute("action") || "").slice(0, 200) });
    flush();
  }, true);

  // --- manual API ---
  window.pulse = function (type, extra) {
    extra = extra || {};
    push(type === "custom" || !type ? "custom" : type, { l: extra.label || extra.name || "", h: extra.href || "", v: extra.value });
    flush();
  };
  window.pulse.visitor = VID;
  window.pulse.session = SID;

  window.addEventListener("pagehide", leave);
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") leave(); else if (document.visibilityState === "visible" && leftAlready) { leftAlready = false; pageStart = Date.now(); } });
  } // run
})();
