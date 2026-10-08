/* Modish Nail Spa concept site: shared data + behaviour.
   Prices are the salon's published menu. Durations are typical estimates for the concept.
   Nothing a visitor enters leaves the browser in this build (see README). */
(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var store = function (k, v) {
    try { if (v === undefined) return JSON.parse(localStorage.getItem(k) || "null"); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; }
  };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };

  // ---------- the menu (published prices; "up" = starting price) ----------
  var MENU = [
    { cat: "Natural nail care", id: "natural", items: [
      ["mani", "Manicure", 25, 0, 30], ["gelmani", "Manicure with gel polish", 35, 0, 45], ["gelhands", "Gel polish (hands)", 25, 0, 30],
      ["geltoes", "Gel polish (toes)", 25, 0, 30], ["gelrem", "Gel polish removal", 5, 0, 10], ["gelremno", "Gel polish removal (no redo)", 15, 0, 20, "Includes cut down, reshape and clear polish"]] },
    { cat: "SNS powder dipping", id: "sns", items: [
      ["sns", "SNS dip powder", 50, 1, 60], ["tipext", "Tip extension", 5, 1, 15], ["snsrem", "SNS dip removal", 5, 0, 10], ["manisns", "Manicure with SNS", 10, 0, 15],
      ["snspw", "SNS pink & white", 60, 0, 70], ["snsombre", "SNS ombre", 60, 0, 70], ["snsremno", "SNS removal (no redo)", 20, 0, 25]] },
    { cat: "Artificial nails", id: "acrylic", items: [
      ["fullset", "Full set (basic shape)", 50, 1, 75], ["fill", "Fill-in (basic shape)", 40, 1, 60], ["fullgel", "Full set with gel color", 50, 1, 80], ["fillgel", "Fill-in with gel color", 40, 1, 65],
      ["solar", "Solar nails (pink & white)", 65, 1, 90], ["fillpink", "Fill-in pink", 50, 1, 60], ["fillpw", "Fill-in pink & white", 55, 1, 70]] },
    { cat: "Pedicure", id: "pedicure", items: [
      ["pedrem", "Gel polish removal", 5, 0, 10], ["spaped", "Spa pedicure", 33, 0, 40, "Soak, shape, cuticle care, scrub, massage and polish"], ["delped", "Deluxe pedicure", 43, 0, 50, "Everything in the spa pedicure, plus a longer massage and hot towels"],
      ["jellyped", "Jelly deluxe pedicure", 53, 0, 60, "Deluxe pedicure with a warm jelly soak"], ["geltoesadd", "Gel polish on toes", 15, 0, 15]] },
    { cat: "Lite Concept", id: "lite", items: [
      ["litepw", "Full set pink & white", 65, 1, 90], ["litefillpw", "Fill-in pink & white", 50, 1, 70], ["litefillp", "Fill-in pink (only)", 45, 1, 60], ["litegel", "Full set with gel", 60, 1, 85],
      ["litefillgel", "Fill-in with gel", 50, 1, 65], ["literep", "Repair", 5, 1, 10]] },
    { cat: "Designs & extras", id: "designs", items: [
      ["change", "Nail polish change", 20, 0, 20], ["changeacr", "Nail polish change (acrylic)", 25, 1, 25], ["toechange", "Toe polish change", 20, 0, 20],
      ["french", "French / American tip", 10, 1, 10], ["design", "Nail designs", 5, 1, 10], ["cateye", "Cat eye", 10, 0, 5], ["chrome", "Chrome", 15, 0, 10],
      ["repair", "Nail repair", 5, 1, 10], ["cutdown", "Cut down and reshape", 5, 1, 10], ["shape", "Stiletto, almond or coffin shape", 5, 0, 5], ["acrsoak", "Acrylic soak off (no redo)", 25, 0, 30]] },
    { cat: "Children's services", id: "kids", note: "10 and under", items: [
      ["kchange", "Nail polish change", 15, 0, 15], ["ktoe", "Toe polish change", 15, 0, 15], ["kmani", "Manicure", 20, 0, 25], ["kgelh", "Gel polish (hands)", 20, 0, 25],
      ["kgelt", "Gel polish (toes)", 25, 0, 25], ["kped", "Pedicure", 28, 0, 30]] },
    { cat: "Waxing", id: "waxing", items: [
      ["brows", "Eyebrows", 13, 0, 10], ["lip", "Lip, chin or sideburn", 8, 1, 10, "Each"], ["underarm", "Under arm", 25, 0, 15], ["halfarm", "Half arm", 30, 0, 20],
      ["wholearm", "Whole arm", 60, 0, 30], ["face", "Facial waxing (whole face)", 50, 0, 30]] }
  ];
  var BY = {};
  MENU.forEach(function (c) { c.items.forEach(function (it) { BY[it[0]] = { id: it[0], name: it[1], price: it[2], up: !!it[3], mins: it[4], note: it[5] || "", cat: c.cat }; }); });

  // ---------- looks (real salon photos) mapped to the services that make them ----------
  var LOOKS = [
    { id: "rose-gold-chrome-stiletto", name: "Rose gold chrome", tags: ["Chrome", "Stiletto", "Gel"], svc: ["gelmani", "chrome", "shape"] },
    { id: "aura-ombre", name: "Aura ombré", tags: ["Ombré", "Almond", "Art"], svc: ["gelmani", "design", "shape"] },
    { id: "milky-nude", name: "Milky nude glaze", tags: ["Natural", "Almond", "Gel"], svc: ["gelmani", "shape"] },
    { id: "pearl-cat-eye", name: "Pearl cat eye", tags: ["Cat eye", "Almond", "Gel"], svc: ["gelmani", "cateye", "shape"] },
    { id: "blue-ombre-almond", name: "Ocean glitter fade", tags: ["Ombré", "Glitter", "Dip"], svc: ["sns", "design", "shape"] },
    { id: "mocha-chrome", name: "Mocha glaze", tags: ["Chrome", "Almond", "Gel"], svc: ["gelmani", "chrome", "shape"] },
    { id: "smoky-cat-eye", name: "Smoky cat eye", tags: ["Cat eye", "Moody", "Gel"], svc: ["gelmani", "cateye"] },
    { id: "silver-glitter-fade", name: "Silver stardust fade", tags: ["Glitter", "Almond", "Gel"], svc: ["gelmani", "design", "shape"] },
    { id: "yellow-french", name: "Lemon micro French", tags: ["French", "Almond", "Gel"], svc: ["gelmani", "french", "shape"] },
    { id: "cherry-marble", name: "Cherry marble", tags: ["Art", "Short", "Gel"], svc: ["gelmani", "design"] },
    { id: "bright-yellow-art", name: "Back-to-school art", tags: ["Art", "Short", "Gel"], svc: ["gelmani", "design"] }
  ];

  var SALON = window.MODISH = {
    phone: "267-335-5234", phoneHref: "tel:+12673355234", email: "modishnailsparox@gmail.com",
    hours: { open: 9.5, close: 19, days: [1, 2, 3, 4, 5, 6] }, // Mon–Sat 9:30–7, closed Sunday
    locations: {
      rox: { name: "Roxborough", addr: "7126 Ridge Ave", city: "Philadelphia, PA 19128", maps: "https://www.google.com/maps/search/?api=1&query=Modish+Nail+Spa+7126+Ridge+Ave+Philadelphia+PA+19128" },
      con: { name: "Conshohocken", addr: "34 Ridge Pike", city: "Conshohocken, PA 19428", maps: "https://www.google.com/maps/search/?api=1&query=Modish+Nail+Spa+34+Ridge+Pike+Conshohocken+PA+19428" }
    },
    MENU: MENU, BY: BY, LOOKS: LOOKS, store: store, esc: esc,
    base: (function () { var s = document.currentScript && document.currentScript.src; return s ? s.replace(/assets\/site\.js.*$/, "") : "/"; })()
  };
  SALON.money = function (n, up) { return "$" + n + (up ? "+" : ""); };

  // ---------- time, open status, walk-in estimate ----------
  SALON.now = function () {
    var p = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "numeric", weekday: "short", hour12: false }).formatToParts(new Date());
    var o = {}; p.forEach(function (x) { o[x.type] = x.value; });
    return { h: (+o.hour % 24) + (+o.minute) / 60, d: { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[o.weekday] };
  };
  SALON.isOpen = function () { var t = SALON.now(); return SALON.hours.days.indexOf(t.d) > -1 && t.h >= SALON.hours.open && t.h < SALON.hours.close - 0.25; };
  // Concept: a believable wait by day and hour. Live, this reads the check-in queue.
  SALON.wait = function (loc) {
    var t = SALON.now(); if (!SALON.isOpen()) return null;
    var busy = (t.d === 5 || t.d === 6 ? 1.6 : 1) * (t.h >= 16 ? 1.5 : t.h >= 11.5 && t.h < 14 ? 1.25 : 0.7);
    var w = Math.round((loc === "con" ? 8 : 12) * busy / 5) * 5;
    return Math.max(5, w);
  };
  SALON.statusText = function (loc) {
    if (SALON.isOpen()) { var w = SALON.wait(loc || "rox"); return { open: true, text: "Open now · walk-in wait about " + w + " min" }; }
    var t = SALON.now();
    var next = t.d === 6 && t.h >= 19 || t.d === 0 ? "Monday" : t.h < SALON.hours.open ? "today" : "tomorrow";
    return { open: false, text: "Closed now · opens " + next + " at 9:30" };
  };
  $$("[data-status]").forEach(function (el) {
    var s = SALON.statusText(el.dataset.status || "rox");
    el.innerHTML = '<span class="status-dot' + (s.open ? "" : " closed") + '"></span>' + esc(s.text);
  });
  $$("[data-today-row]").forEach(function (tr) { if (+tr.dataset.todayRow === SALON.now().d) tr.classList.add("today"); });
  $$("[data-year]").forEach(function (el) { el.textContent = new Date().getFullYear(); });

  // ---------- header / concept bar / menu motion / reveals ----------
  var head = $(".site-head");
  if (head) { var sc = function () { head.classList.toggle("scrolled", scrollY > 8); }; addEventListener("scroll", sc, { passive: true }); sc(); }
  if (store("md_concept_closed")) document.documentElement.classList.add("concept-hidden");
  var cx = $(".concept button");
  if (cx) cx.addEventListener("click", function () { document.documentElement.classList.add("concept-hidden"); store("md_concept_closed", true); });
  $$(".menu-btn").forEach(function (btn) {
    var panel = document.getElementById(btn.getAttribute("aria-controls")); if (!panel) return;
    $$("a", panel).forEach(function (a, i) { a.style.setProperty("--i", i); });
    var set = function (o) {
      panel.classList.toggle("open", o); btn.setAttribute("aria-expanded", String(o));
      btn.setAttribute("aria-label", o ? "Close menu" : "Menu"); document.documentElement.classList.toggle("menu-open", o);
    };
    btn.addEventListener("click", function (e) { e.stopPropagation(); set(!panel.classList.contains("open")); });
    panel.addEventListener("click", function (e) { if (e.target.closest("a")) set(false); });
    document.addEventListener("click", function (e) { if (panel.classList.contains("open") && !panel.contains(e.target)) set(false); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && panel.classList.contains("open")) { set(false); btn.focus(); } });
    addEventListener("resize", function () { if (panel.classList.contains("open") && getComputedStyle(btn).display === "none") set(false); });
  });
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }); }, { rootMargin: "0px 0px -8% 0px" });
    $$(".reveal").forEach(function (el) { io.observe(el); });
  } else $$(".reveal").forEach(function (el) { el.classList.add("in"); });

  // ---------- the visit tray: services follow you from page to page ----------
  var visit = store("md_visit") || { items: [], loc: "rox" };
  SALON.visit = function () { return visit; };
  SALON.total = function (ids) {
    ids = ids || visit.items; var p = 0, m = 0, up = false;
    ids.forEach(function (id) { var s = BY[id]; if (s) { p += s.price; m += s.mins; up = up || s.up; } });
    return { price: p, mins: m, up: up };
  };
  SALON.fmtMins = function (m) { return m >= 60 ? Math.floor(m / 60) + " hr" + (m % 60 ? " " + (m % 60) + " min" : "") : m + " min"; };
  var save = function () { store("md_visit", visit); renderTray(); syncButtons(); document.dispatchEvent(new CustomEvent("visit:change")); };
  SALON.add = function (id) { if (BY[id] && visit.items.indexOf(id) < 0) { visit.items.push(id); save(); bump(); } };
  SALON.remove = function (id) { visit.items = visit.items.filter(function (x) { return x !== id; }); save(); };
  SALON.toggle = function (id) { visit.items.indexOf(id) > -1 ? SALON.remove(id) : SALON.add(id); };
  SALON.setItems = function (ids, look) { visit.items = ids.filter(function (id) { return BY[id]; }); visit.look = look || null; save(); bump(); };
  SALON.setLoc = function (l) { visit.loc = l; save(); };
  SALON.clear = function () { visit = { items: [], loc: visit.loc }; save(); };

  var tray = document.createElement("div");
  tray.className = "tray"; tray.setAttribute("role", "region"); tray.setAttribute("aria-label", "Your visit");
  tray.innerHTML = '<div class="t-info"><b></b><span></span></div><button class="t-clear" type="button">Clear</button><a class="btn btn-gold" href="' + SALON.base + 'book/">Choose a time</a>';
  var onBook = /\/book\/?$/.test(location.pathname);
  if (!window.MD_NO_TRAY) document.body.appendChild(tray);
  $(".t-clear", tray).addEventListener("click", function () { SALON.clear(); });
  function renderTray() {
    var n = visit.items.length, t = SALON.total();
    tray.classList.toggle("on", n > 0 && !onBook);
    if (!n) return;
    $(".t-info b", tray).textContent = (visit.look ? visit.look + " · " : "") + visit.items.map(function (id) { return BY[id].name; }).join(" + ");
    $(".t-info span", tray).textContent = n + " service" + (n > 1 ? "s" : "") + " · " + SALON.money(t.price, t.up) + " · about " + SALON.fmtMins(t.mins);
  }
  function bump() { tray.classList.remove("bump"); void tray.offsetWidth; tray.classList.add("bump"); }
  function syncButtons() {
    $$("[data-add]").forEach(function (b) {
      var on = visit.items.indexOf(b.dataset.add) > -1;
      b.setAttribute("aria-pressed", String(on));
      if (b.classList.contains("plus")) { b.textContent = on ? "✓" : "+"; b.setAttribute("aria-label", (on ? "Remove " : "Add ") + BY[b.dataset.add].name); }
      else if (b.dataset.label) b.textContent = on ? "Added ✓" : b.dataset.label;
    });
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-add]"); if (b) { e.preventDefault(); SALON.toggle(b.dataset.add); return; }
    var l = e.target.closest("[data-look]");
    if (l) { e.preventDefault(); var lk = LOOKS.filter(function (x) { return x.id === l.dataset.look; })[0]; if (lk) { SALON.setItems(lk.svc, lk.name); location.href = SALON.base + "book/"; } }
  });
  SALON.lookPrice = function (lk) { return SALON.total(lk.svc); };
  renderTray(); syncButtons();

  // ---------- Ask Modish (concierge chat) ----------
  if (window.MD_NO_CHAT) return;
  var fab = document.createElement("button");
  fab.type = "button"; fab.className = "chat-fab"; fab.setAttribute("aria-label", "Ask Modish: prices, wait times, booking");
  fab.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg><span class="tip">Ask about prices, waits &amp; booking</span>';
  var box = document.createElement("div");
  box.className = "chat"; box.setAttribute("role", "dialog"); box.setAttribute("aria-label", "Ask Modish");
  box.innerHTML = '<div class="chat-head"><div><b>Ask Modish</b><small data-status="rox"></small></div><button class="x" type="button" aria-label="Close">×</button></div><div class="chat-log" aria-live="polite"></div><form class="chat-form"><label class="sr" for="md-chat">Your question</label><input id="md-chat" autocomplete="off" placeholder="“How much is a gel mani?”"><button type="submit" aria-label="Send">→</button></form>';
  document.body.appendChild(fab); document.body.appendChild(box);
  var st = SALON.statusText("rox"); $("[data-status]", box).textContent = st.text;
  var log = $(".chat-log", box), started = false;
  function add(cls, html) { var m = document.createElement("div"); m.className = "msg " + cls; m.innerHTML = html; log.appendChild(m); log.scrollTop = log.scrollHeight; }
  function chips(list) {
    var c = document.createElement("div"); c.className = "chips";
    list.forEach(function (x) { var b = document.createElement("button"); b.type = "button"; b.className = "chip"; b.textContent = x; b.addEventListener("click", function () { handle(x); }); c.appendChild(b); });
    log.appendChild(c); log.scrollTop = log.scrollHeight;
  }
  function bot(html, next) {
    var t = document.createElement("div"); t.className = "msg bot typing"; t.innerHTML = "<i></i><i></i><i></i>"; log.appendChild(t); log.scrollTop = log.scrollHeight;
    setTimeout(function () { t.remove(); add("bot", html); if (next) chips(next); }, matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : Math.min(900, 300 + html.length * 3));
  }
  var START = ["Prices", "Walk-in wait", "Hours & locations", "Book a visit"];
  function open() {
    box.classList.add("open"); fab.style.visibility = "hidden"; $("#md-chat").focus();
    if (!started) { started = true; bot("Hi, welcome to Modish. Ask me what anything costs, how long the wait is, or let me start a booking. Tip: try “how much is a deluxe pedicure”.", START); }
  }
  function close() { box.classList.remove("open"); fab.style.visibility = ""; fab.focus(); }
  fab.addEventListener("click", open); $(".x", box).addEventListener("click", close);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && box.classList.contains("open")) close(); });
  $$("[data-chat]").forEach(function (el) { el.addEventListener("click", function (e) { e.preventDefault(); open(); }); });
  SALON.openChat = open;

  // find the service a question is about: score words against service names
  var STOP = /\b(how|much|is|a|an|the|for|do|you|does|cost|price|of|what|with|get|my|i|want|and|on|your)\b/g;
  function findService(q) {
    var words = q.toLowerCase().replace(/[^a-z& ]/g, " ").replace(STOP, " ").split(/\s+/).filter(function (w) { return w.length > 2; });
    if (!words.length) return null;
    var syn = { dip: "sns", acrylic: "full", acrylics: "full", nails: "", pedi: "pedicure", mani: "manicure", gel: "gel", brow: "eyebrows", brows: "eyebrows", kid: "children", kids: "children" };
    words = words.map(function (w) { return syn[w] !== undefined ? syn[w] : w; }).filter(Boolean);
    var best = null, bs = 0;
    Object.keys(BY).forEach(function (id) {
      var s = BY[id], n = (s.name + " " + s.cat).toLowerCase(), sc = 0;
      words.forEach(function (w) { if (n.indexOf(w) > -1) sc += w.length; });
      if (s.cat === "Children's services" && !/child|kid/.test(q.toLowerCase())) sc -= 3;
      if (sc > bs) { bs = sc; best = s; }
    });
    return bs >= 4 ? best : null;
  }
  function handle(q) {
    add("me", esc(q)); var t = q.toLowerCase();
    var cs = $$(".chips", log); cs.forEach(function (c) { c.remove(); });
    if (/book|appoint|schedule|reserve/.test(t)) return bot("Lovely. Pick your services on the menu and I'll hold them in your visit, or go straight to booking. <a href='" + SALON.base + "book/'>Choose a time →</a>", ["Prices", "Walk-in wait"]);
    if (/wait|walk|now|today|busy|line/.test(t)) {
      var r = SALON.wait("rox"), c = SALON.wait("con");
      return bot(r ? "Walk-ins are welcome. Right now it's about " + r + " min in Roxborough and " + c + " min in Conshohocken. Want me to text you when a chair opens? <a href='" + SALON.base + "#waitlist'>Join the waitlist</a>" : "We're closed right now; doors open at 9:30 am, Monday to Saturday. You can book ahead so your chair is ready.", ["Book a visit", "Hours & locations"]);
    }
    if (/hour|open|close|sunday|location|where|address|park|direction/.test(t)) return bot("Two spas, same hours: Monday to Saturday, 9:30 am to 7 pm (closed Sunday).\n\nRoxborough: 7126 Ridge Ave, Philadelphia 19128\nConshohocken: 34 Ridge Pike, Conshohocken 19428\n\nCall " + SALON.phone + ".", ["Walk-in wait", "Book a visit"]);
    if (/wine|beer|drink|beverage|mimosa/.test(t)) return bot("Yes! Wine, beer and soft drinks are complimentary with any service (21+ for alcohol). Sip while you sit.", ["Prices", "Book a visit"]);
    if (/gift|card|certificate|voucher/.test(t)) return bot("Gift cards come in any amount and can be emailed or texted instantly. <a href='" + SALON.base + "gift-cards/'>Send one →</a>", ["Book a visit"]);
    if (/party|bridal|bride|wedding|group|birthday|shower/.test(t)) return bot("We love a party. Tell us the date and how many guests and we'll set up side-by-side chairs (and the wine). <a href='" + SALON.base + "parties/'>Plan a group visit →</a>", ["Prices"]);
    if (/clean|sanit|steril|safe|pregnan|toxic/.test(t)) return bot("Every pedicure basin gets a fresh disposable liner, metal tools are hospital-grade sterilized and individually packaged, files and buffers are single-use, and every manicure table has its own vacuum to pull away dust and vapors. Our polishes are safe for moms-to-be.", ["Prices", "Book a visit"]);
    if (/long|last|how long|duration|time does/.test(t) && !/wait/.test(t)) return bot("Gel usually lasts 2–3 weeks, dip (SNS) 3–4 weeks, and acrylic needs a fill every 2–3 weeks. A gel manicure takes about 45 minutes; a full set about an hour and a quarter.", ["Prices", "Book a visit"]);
    if (/prices|menu|list/.test(t) || t === "prices") return bot("A few favorites: manicure $25, gel manicure $35, SNS dip from $50, full set from $50, spa pedicure $33, deluxe $43, jelly deluxe $53. Ask me about any service, or <a href='" + SALON.base + "menu/'>see the full menu</a>.", ["How much is chrome?", "Kids' pedicure?", "Eyebrow wax?"]);
    var s = findService(q);
    if (s) return bot((s.cat === "Children's services" ? "Kids' " + s.name.charAt(0).toLowerCase() + s.name.slice(1) + " (10 and under)" : s.name) + " is " + SALON.money(s.price, s.up) + (s.up ? " (starting price; length and design can add)" : "") + ", about " + SALON.fmtMins(s.mins) + "." + (s.note ? "\n" + s.note + "." : "") + "\n\n<button class='chip' type='button' data-add='" + s.id + "'>Add to my visit</button>", ["Book a visit", "Prices"]);
    bot("I'm best with prices, wait times, hours and booking. For anything else, call us at <a href='" + SALON.phoneHref + "'>" + SALON.phone + "</a>.", START);
  }
  $(".chat-form", box).addEventListener("submit", function (e) { e.preventDefault(); var i = $("#md-chat"), v = i.value.trim(); if (v) { i.value = ""; handle(v); } });
})();
