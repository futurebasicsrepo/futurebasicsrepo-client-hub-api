/* Benny's Beans · Russian River Roastery — concept site: shared data + behaviour.
   Coffees, tasting notes, sizes, prices, roast levels, grinds, roast days, markets and pickup come from
   russianriverroastery.com (Oct 2026). Order cutoffs, transit times and all console data are illustrative.
   Nothing a visitor enters leaves the browser in this build (see README). */
(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var store = function (k, v) {
    try { if (v === undefined) return JSON.parse(localStorage.getItem(k) || "null"); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; }
  };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };

  // ---------- the coffee (live catalog, Oct 2026) ----------
  // roast: recommended range on the 5-step meter (1 light … 5 french). caf: regular | decaf | half | high.
  var COFFEES = [
    { id: "ethiopia", name: "Ethiopia Organic Buture Cooperative", short: "Ethiopia Buture", origin: "Ethiopia", detail: "Organic · cooperative lot", c: "#e9b949", ink: "#16120f",
      notes: ["Creamy honey", "Maple sugar", "Panela", "Lemon", "Stone fruit"], roast: [1, 3], caf: "regular", flavor: "bright", best: ["pourover", "drip", "espresso"],
      blurb: "On the sweeter side of our Ethiopian list: creamy honey, maple sugar, panela, a hint of lemon and stone fruit, with refreshing acidity. Darker roasts had juicy aspects and made exceptional espresso." },
    { id: "colombia", name: "Colombia Honey Process Aponte", short: "Colombia Aponte", origin: "Colombia", detail: "Aponte · honey process", c: "#d96a3b", ink: "#fff",
      notes: ["Cooked berry", "Molasses", "Raisin", "Dried pineapple", "Dark cacao"], roast: [2, 4], caf: "regular", flavor: "rich", best: ["espresso", "drip", "frenchpress"],
      blurb: "Versatile honey-process coffee: fruit-accented low tones, bright hints and a thick, inky body. Notes of rice syrup, molasses, cooked berry, raisin, dried pineapple and dark cacao, with a long finish. City to Full City+. Good for espresso." },
    { id: "plantation-aa", name: "Shade Grown Plantation AA", short: "Plantation AA", origin: "India", detail: "Coorg · shade grown", c: "#2f6b4f", ink: "#fff",
      notes: ["Rich body", "Low acidity", "Spice", "Cocoa"], roast: [2, 4], caf: "regular", flavor: "smooth", best: ["drip", "frenchpress", "espresso"],
      blurb: "Shade-grown at high altitude, these Indian beans ripen slowly alongside pepper, cardamom and fruit trees. That shared soil builds what sets South Indian coffee apart: a rich body, low acidity and a depth that grows with every sip.",
      cert: "Minority women-owned certified · handpicked & shade grown · kosher certified" },
    { id: "coorg-robusta", name: "Coorg Cherry Robusta", short: "Coorg Robusta", origin: "India", detail: "Coorg & Karnataka · natural", c: "#c8261c", ink: "#fff", badge: "High octane",
      notes: ["Cocoa", "Malt", "Earthy", "Big crema"], roast: [3, 5], caf: "high", flavor: "bold", best: ["espresso", "moka", "frenchpress"],
      blurb: "A premium natural-processed Robusta from the coffee estates of Coorg and Karnataka, India. Bold and full-bodied with elevated caffeine: cocoa, malt and earthy depth, plus excellent crema. Built for espresso blends or a strong, satisfying cup.",
      cert: "Minority women-owned certified · handpicked & shade grown · kosher certified" },
    { id: "mneb", name: "Mysore Nuggets Extra Bold", short: "Mysore Nuggets", origin: "India", detail: "Mysore · MNEB grade", c: "#16120f", ink: "#e9b949",
      notes: ["Bold", "Dark chocolate", "Full body"], roast: [4, 5], caf: "regular", flavor: "bold", best: ["espresso", "moka", "frenchpress"],
      blurb: "These beans live up to their name. The boldness so many people look for in great coffee is waiting in your next cup. Great for espresso; recommended at medium dark to darker roasts." },
    { id: "decaf", name: "Mexico Organic Chiapas WP Decaf", short: "Chiapas Decaf", origin: "Mexico", detail: "Chiapas · Water Process decaf", c: "#8fb3c9", ink: "#16120f", badge: "Back in stock",
      notes: ["Molasses bread", "Cinnamon", "Malted grain", "Chocolate almond"], roast: [2, 4], caf: "decaf", flavor: "smooth", best: ["drip", "pourover", "frenchpress"],
      blurb: "Brews a clean, crowd-pleasing decaf cup: malty-sweet and chocolate-toned. Notes of molasses bread, cinnamon, matcha tea, malted beer grains and chocolate almond." },
    { id: "halfcaff", name: "Roaster's Half-Caff Blend", short: "Half-Caff", origin: "Blend", detail: "50 / 50 · decaf + regular", c: "#e8d9bf", ink: "#16120f", badge: "Top seller",
      notes: ["Balanced", "Chocolate", "Gentle lift"], roast: [2, 4], caf: "half", flavor: "smooth", best: ["drip", "pourover", "espresso"],
      blurb: "Our signature Half-Caff is the current decaf blended with a caffeinated coffee chosen to match it in flavor, body and character. Not just any mix: a deliberate 50/50 built for the perfect balance." }
  ];
  var BY = {}; COFFEES.forEach(function (c) { BY[c.id] = c; });
  var PRICE = { 1: 20, 5: 80 };
  var ROASTS = ["Roaster's Choice", "Light", "Medium", "Medium Dark", "Dark", "French"];
  var GRINDS = ["Whole Bean", "Coarse", "Auto-Drip", "Espresso", "Fine", "Turkish"];
  var MERCH = [
    { id: "coaster-round", name: "Slate Coaster", price: 12, img: "coaster-round.webp", badge: "Handmade", blurb: "Natural slate, engraved with the coffee-ring logo and a QR code that brings you back for more." },
    { id: "coaster-square", name: "Square Slate Coaster", price: 12, img: "coaster-square.webp", badge: "New", blurb: "The square cut. Same engraved ring, same QR code, same protection for the table." },
    { id: "coaster-cork", name: "Cork Coaster", price: 5, img: "coaster-cork.webp", badge: "Limited", blurb: "Limited edition and going fast. Great for when you run out of coffee: the QR code reorders." }
  ];
  var MBY = {}; MERCH.forEach(function (m) { MBY[m.id] = m; });

  var BB = window.BB = {
    COFFEES: COFFEES, BY: BY, PRICE: PRICE, ROASTS: ROASTS, GRINDS: GRINDS, MERCH: MERCH, MBY: MBY,
    $: $, $$: $$, store: store, esc: esc,
    phone: "707-899-4183", sms: "sms:+17078994183", tel: "tel:+17078994183",
    freeShip: 60,
    pickup: { name: "True Value Hardware of Guerneville", short: "True Value, Guerneville", addr: "15600 River Rd, Guerneville, CA 95446", map: "https://maps.google.com/?q=True+Value+Hardware+Guerneville+CA" },
    markets: [
      { id: "occidental", name: "Occidental Farmers Market", town: "Occidental", day: 4, dayName: "Thursday", hours: "4:00–8:00 pm", open: 16, close: 20, map: "https://maps.google.com/?q=Occidental+Farmers+Market+CA" },
      { id: "cloverdale", name: "Cloverdale Certified Farmers Market", town: "Cloverdale", day: 0, dayName: "Sunday", hours: "9:30 am–1:00 pm", open: 9.5, close: 13, map: "https://maps.google.com/?q=Cloverdale+Certified+Farmers+Market+CA" }
    ],
    base: (function () { var s = document.currentScript && document.currentScript.src; return s ? s.replace(/assets\/site\.js.*$/, "") : "/"; })()
  };
  BB.money = function (n) { return "$" + (Math.round(n * 100) / 100).toFixed(n % 1 ? 2 : 0); };

  // ---------- roast calendar (Pacific time) ----------
  // Roast Mondays + Wednesdays, ship the next day. Illustrative cutoff: 11:59 pm the night before a roast.
  var DAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  var DS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  BB.DAY = DAY; BB.DS = DS; BB.MON = MON;
  BB.now = function () { try { return new Date(new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" })); } catch (e) { return new Date(); } };
  BB.addDays = function (d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; };
  BB.fmt = function (d, long) { return (long ? DAY[d.getDay()] : DS[d.getDay()]) + " " + MON[d.getMonth()] + " " + d.getDate(); };
  BB.ymd = function (d) { return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); };
  BB.roastDays = [1, 3];
  BB.nextRoast = function (from) {
    var now = from ? new Date(from) : BB.now();
    // an order placed today makes the next roast that is at least tomorrow (cutoff = midnight before)
    for (var i = 1; i < 9; i++) {
      var d = BB.addDays(now, i); d.setHours(7, 0, 0, 0);
      if (BB.roastDays.indexOf(d.getDay()) > -1) {
        var cutoff = BB.addDays(d, 0); cutoff.setHours(0, 0, 0, 0); cutoff = new Date(cutoff.getTime() - 60000);
        var ship = BB.addDays(d, 1);
        return { roast: d, ship: ship, cutoff: cutoff, arrive: [BB.addDays(ship, 2), BB.addDays(ship, 3)], pickup: ship, msLeft: cutoff - now };
      }
    }
  };
  BB.roastsAfter = function (n, from) { var out = [], d = from ? new Date(from) : BB.now(); for (var i = 0; i < n; i++) { var r = BB.nextRoast(d); out.push(r); d = r.roast; } return out; };
  BB.left = function (ms) { var h = Math.floor(ms / 36e5), m = Math.floor(ms % 36e5 / 6e4); return h >= 24 ? Math.floor(h / 24) + "d " + (h % 24) + "h" : h + "h " + m + "m"; };
  BB.nextMarket = function () {
    var now = BB.now(), best = null;
    BB.markets.forEach(function (m) {
      for (var i = 0; i < 8; i++) {
        var d = BB.addDays(now, i); d.setHours(Math.floor(m.open), (m.open % 1) * 60, 0, 0);
        var end = new Date(d); end.setHours(Math.floor(m.close), (m.close % 1) * 60, 0, 0);
        if (d.getDay() === m.day && end > now) { if (!best || d < best.start) best = { m: m, start: d, end: end, live: now >= d && now < end }; break; }
      }
    });
    return best;
  };

  // ---------- marks: the coffee ring, Benny's bean face, the bag ----------
  BB.ring = function (o) {
    o = o || {};
    var words = o.words === false ? "" : '<text x="60" y="57" text-anchor="middle" font-family="Allura, cursive" font-size="29" fill="currentColor">Benny\'s</text><text x="62" y="82" text-anchor="middle" font-family="Allura, cursive" font-size="29" fill="currentColor">Beans</text>';
    var sub = o.sub ? '<text x="60" y="97" text-anchor="middle" font-family="DM Mono, monospace" font-size="5.6" letter-spacing="1.4" fill="currentColor">' + esc(o.sub) + "</text>" : "";
    return '<svg class="ring ' + (o.cls || "") + '" viewBox="0 0 120 120" aria-hidden="true"><g class="stain" fill="none" stroke="currentColor" stroke-linecap="round">' +
      '<path d="M66 8.5C93 11 112 34 110.5 61c-1.6 27.5-24 49.5-51 49.4C32.4 110.3 10 88 9.6 61 9.3 40 21.5 22 39 13.6" stroke-width="5.5" opacity=".92"/>' +
      '<path d="M45 10.2c4-1 8-1.6 12.4-1.7" stroke-width="2.4"/>' +
      '<path d="M101 33c5.5 8 8.4 17.4 8 27.6" stroke-width="2" opacity=".6" transform="translate(-5 2)"/>' +
      '<path d="M18 86c5 9 13 16.5 23 20.6" stroke-width="1.6" opacity=".55" transform="translate(4 -3)"/>' +
      '<circle cx="21" cy="24" r="2.6" fill="currentColor" stroke="none"/><circle cx="16" cy="30" r="1.3" fill="currentColor" stroke="none"/>' +
      "</g>" + words + sub + "</svg>";
  };
  BB.face = function (c) { // Benny the bean: the crease is the smile
    return '<svg viewBox="0 0 40 40" aria-hidden="true"><ellipse cx="20" cy="20" rx="13" ry="16" fill="' + (c || "#fbf8f2") + '" transform="rotate(-18 20 20)"/>' +
      '<path d="M12.5 21.5c3.8 5 11.2 5.2 15.3-.4" fill="none" stroke="#16120f" stroke-width="2.4" stroke-linecap="round"/>' +
      '<circle cx="15.2" cy="15" r="1.9" fill="#16120f"/><circle cx="23.6" cy="13.6" r="1.9" fill="#16120f"/></svg>';
  };
  BB.bag = function (id, o) {
    o = o || {}; var c = BY[id] || { short: "Benny's Beans", origin: "Fresh roast", c: "#16120f", ink: "#fff" };
    var big = o.size === 5, uid = "b" + Math.random().toString(36).slice(2, 7);
    var name = (o.label || c.short).toUpperCase(), parts = name.split(" ");
    var l1 = parts.length > 1 ? parts.slice(0, Math.ceil(parts.length / 2)).join(" ") : name, l2 = parts.length > 1 ? parts.slice(Math.ceil(parts.length / 2)).join(" ") : "";
    return '<svg viewBox="0 0 200 270" role="img" aria-label="' + esc(c.name || name) + ' bag">' +
      '<defs><linearGradient id="k' + uid + '" x1="0" x2="1"><stop offset="0" stop-color="#b48d5d"/><stop offset=".18" stop-color="#cfab7e"/><stop offset=".55" stop-color="#d7b68b"/><stop offset=".85" stop-color="#c39d6d"/><stop offset="1" stop-color="#a98251"/></linearGradient></defs>' +
      '<path d="M24 44h152l7 210c.2 6-3.6 10-9.6 10H26.6c-6 0-9.8-4-9.6-10z" fill="url(#k' + uid + ')"/>' +
      '<path d="M26 12h148l2 34H24z" fill="#b8915f"/>' +
      '<path d="M26 12l6-6 6 6 6-6 6 6 6-6 6 6 6-6 6 6 6-6 6 6 6-6 6 6 6-6 6 6 6-6 6 6 6-6 6 6 6-6 6 6 6-6 6 6 6-6 6 6" fill="none" stroke="#a37c4b" stroke-width="1.5"/>' +
      '<rect x="16" y="34" width="168" height="7" rx="3.5" fill="#8d9296"/><rect x="16" y="34" width="168" height="2.4" rx="1.2" fill="#b9bec1"/>' +
      '<circle cx="100" cy="64" r="6" fill="#a37c4b" opacity=".55"/><circle cx="100" cy="64" r="2.6" fill="#8a6639" opacity=".7"/>' +
      '<rect x="34" y="82" width="132" height="70" rx="7" fill="' + c.c + '"/>' +
      '<text x="100" y="' + (l2 ? 112 : 121) + '" text-anchor="middle" font-family="Archivo, Arial, sans-serif" font-weight="900" font-size="' + (name.length > 16 ? 13.5 : 16) + '" letter-spacing=".3" fill="' + c.ink + '" style="font-variation-settings:\'wdth\' 115">' + esc(l1) + "</text>" +
      (l2 ? '<text x="100" y="130" text-anchor="middle" font-family="Archivo, Arial, sans-serif" font-weight="900" font-size="' + (name.length > 16 ? 13.5 : 16) + '" letter-spacing=".3" fill="' + c.ink + '" style="font-variation-settings:\'wdth\' 115">' + esc(l2) + "</text>" : "") +
      '<text x="100" y="146" text-anchor="middle" font-family="DM Mono, monospace" font-size="6.6" letter-spacing="1.6" fill="' + c.ink + '" opacity=".8">' + esc((o.roastLabel || c.origin || "").toUpperCase()) + "</text>" +
      '<g transform="translate(55 158) scale(.75)" style="color:#2a1d12" opacity=".82">' + BB.ring({ words: true }).replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "") + "</g>" +
      '<text x="100" y="252" text-anchor="middle" font-family="DM Mono, monospace" font-size="5.4" letter-spacing="1.1" fill="#5b4126" opacity=".85">' + (big ? "5 LB · " : "1 LB · ") + "EST. 2023 · GUERNEVILLE CA</text>" +
      "</svg>";
  };
  BB.roastBar = function (r) { var s = ""; for (var i = 1; i <= 5; i++) s += '<i class="' + (i >= r[0] && i <= r[1] ? "on" : "") + '"></i>'; return '<div class="roastbar" aria-label="Recommended roast">' + s + "</div>"; };

  // ---------- demo loop: what a visitor does shows up in the roaster console ----------
  BB.log = function (type, data) {
    var l = store("bb_demo") || []; l.unshift({ type: type, at: Date.now(), data: data }); store("bb_demo", l.slice(0, 60));
    document.dispatchEvent(new CustomEvent("demo:log", { detail: { type: type, data: data } }));
  };

  // ---------- chrome: concept bar, header, menu, reveal ----------
  if (store("bb_concept_closed")) document.documentElement.classList.add("concept-hidden");
  var cx = $(".concept button"); if (cx) cx.addEventListener("click", function () { document.documentElement.classList.add("concept-hidden"); store("bb_concept_closed", true); });
  var head = $(".site-head");
  if (head) { var sc = function () { head.classList.toggle("scrolled", scrollY > 8); }; addEventListener("scroll", sc, { passive: true }); sc(); }
  $$("[data-year]").forEach(function (el) { el.textContent = BB.now().getFullYear(); });
  $$(".menu-btn").forEach(function (btn) {
    var panel = document.getElementById(btn.getAttribute("aria-controls")); if (!panel) return;
    $$("a", panel).forEach(function (a, i) { a.style.setProperty("--i", i); });
    var set = function (o) { panel.classList.toggle("open", o); btn.setAttribute("aria-expanded", o); };
    btn.addEventListener("click", function (e) { e.stopPropagation(); set(!panel.classList.contains("open")); });
    panel.addEventListener("click", function (e) { if (e.target.closest("a")) set(false); });
    document.addEventListener("click", function (e) { if (panel.classList.contains("open") && !panel.contains(e.target)) set(false); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && panel.classList.contains("open")) { set(false); btn.focus(); } });
    addEventListener("resize", function () { if (panel.classList.contains("open") && getComputedStyle(btn).display === "none") set(false); });
  });
  BB.reveal = function (root) {
    var els = $$(".reveal:not(.in)", root);
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }); }, { rootMargin: "0px 0px -6% 0px" });
      els.forEach(function (el) { io.observe(el); });
    } else els.forEach(function (el) { el.classList.add("in"); });
  };
  // marks + roast stamps rendered from data attributes
  $$("[data-ring]").forEach(function (el) { el.innerHTML = BB.ring({ cls: el.dataset.ring, sub: el.dataset.sub }); });
  $$("[data-bag]").forEach(function (el) { el.innerHTML = BB.bag(el.dataset.bag, { size: +el.dataset.size || 1 }); });
  $$("[data-face]").forEach(function (el) { el.innerHTML = BB.face(el.dataset.face); });
  function paintRoast() {
    var r = BB.nextRoast();
    $$("[data-next-roast]").forEach(function (el) { el.textContent = BB.fmt(r.roast, el.dataset.nextRoast === "long"); });
    $$("[data-next-ship]").forEach(function (el) { el.textContent = BB.fmt(r.ship, el.dataset.nextShip === "long"); });
    $$("[data-cutoff]").forEach(function (el) { el.textContent = BB.left(r.msLeft); });
    $$("[data-roast-day]").forEach(function (el) { el.textContent = DAY[r.roast.getDay()]; });
    $$("[data-arrive]").forEach(function (el) { el.textContent = BB.fmt(r.arrive[0]) + "–" + r.arrive[1].getDate(); });
  }
  paintRoast(); setInterval(paintRoast, 30000);

  // ---------- toast ----------
  var toastEl;
  BB.toast = function (msg) {
    if (!toastEl) { toastEl = document.createElement("div"); toastEl.className = "toast"; toastEl.setAttribute("role", "status"); document.body.appendChild(toastEl); }
    toastEl.innerHTML = "<i></i>" + msg; toastEl.classList.add("on");
    clearTimeout(toastEl._t); toastEl._t = setTimeout(function () { toastEl.classList.remove("on"); }, 2800);
  };

  // ---------- cart ----------
  var cart = store("bb_cart") || [];
  var key = function (it) { return [it.kind, it.id, it.size || "", it.roast || "", it.grind || "", it.amount || "", it.to || ""].join("|"); };
  BB.lineName = function (it) {
    if (it.kind === "coffee") return BY[it.id] ? BY[it.id].name : it.id;
    if (it.kind === "merch") return MBY[it.id] ? MBY[it.id].name : it.id;
    if (it.kind === "gift") return "Gift card" + (it.to ? " for " + it.to : "");
    if (it.kind === "giftsub") return "Gift subscription" + (it.to ? " for " + it.to : "");
    return it.name || it.id;
  };
  BB.linePrice = function (it) {
    if (it.kind === "coffee") return PRICE[it.size || 1];
    if (it.kind === "merch") return MBY[it.id] ? MBY[it.id].price : 0;
    return it.amount || it.price || 0;
  };
  BB.cart = function () { return cart.slice(); };
  BB.count = function () { return cart.reduce(function (n, it) { return n + it.qty; }, 0); };
  BB.subtotal = function () { return cart.reduce(function (n, it) { return n + BB.linePrice(it) * it.qty; }, 0); };
  BB.shippable = function () { return cart.reduce(function (n, it) { return n + (it.kind === "gift" ? 0 : BB.linePrice(it) * it.qty); }, 0); };
  var saveCart = function () { store("bb_cart", cart); renderCart(); document.dispatchEvent(new CustomEvent("cart:change")); };
  BB.add = function (it, quiet) {
    it = Object.assign({ qty: 1 }, it); var k = key(it);
    var ex = cart.filter(function (x) { return key(x) === k; })[0];
    if (ex) ex.qty += it.qty; else cart.push(it);
    saveCart(); var cb = $(".cart-btn"); if (cb) { cb.classList.remove("bump"); void cb.offsetWidth; cb.classList.add("bump"); }
    if (!quiet) BB.openCart();
  };
  BB.setQty = function (i, q) { if (!cart[i]) return; if (q < 1) cart.splice(i, 1); else cart[i].qty = Math.min(q, 40); saveCart(); };
  BB.clearCart = function () { cart = []; saveCart(); };

  var scrim = document.createElement("div"); scrim.className = "scrim";
  var drawer = document.createElement("aside"); drawer.className = "drawer"; drawer.setAttribute("aria-label", "Your bag"); drawer.setAttribute("aria-hidden", "true");
  drawer.innerHTML = '<header><h2>Your bag</h2><button class="x" type="button" aria-label="Close">×</button></header>' +
    '<div class="ship"><p class="ship-msg"></p><div class="meter"><i></i></div></div><div class="items"></div>' +
    '<footer><div class="roastnote"><span style="flex:none;width:40px;color:var(--gold)">' + BB.ring({ words: false }) + '</span><span>Order now and it roasts <b data-next-roast="long"></b>, ships <b data-next-ship></b>.</span></div>' +
    '<div class="sum"><span>Subtotal</span><span class="st"></span></div><p class="tiny">Shipping, will-call pickup in Guerneville or market pickup: you choose at checkout.</p>' +
    '<a class="btn btn-red btn-block go" href="' + BB.base + 'checkout/">Checkout <span class="arr">→</span></a></footer>';
  document.body.appendChild(scrim); document.body.appendChild(drawer);
  var lastFocus;
  BB.openCart = function () { lastFocus = document.activeElement; paintRoast(); drawer.classList.add("open"); scrim.classList.add("on"); drawer.setAttribute("aria-hidden", "false"); setTimeout(function () { $(".x", drawer).focus(); }, 50); };
  BB.closeCart = function () { drawer.classList.remove("open"); scrim.classList.remove("on"); drawer.setAttribute("aria-hidden", "true"); if (lastFocus) lastFocus.focus(); };
  scrim.addEventListener("click", BB.closeCart); $(".x", drawer).addEventListener("click", BB.closeCart);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && drawer.classList.contains("open")) BB.closeCart(); });
  $$(".cart-btn").forEach(function (b) { b.addEventListener("click", BB.openCart); });
  BB.thumb = function (it) {
    if (it.kind === "coffee") return '<div class="thumb" style="--c:' + (BY[it.id] ? BY[it.id].c : "") + '22">' + BB.bag(it.id, { size: it.size }) + "</div>";
    if (it.kind === "merch") return '<div class="thumb"><img src="' + BB.base + "assets/img/" + MBY[it.id].img + '" alt=""></div>';
    return '<div class="thumb" style="--c:var(--cherry);display:grid;place-items:center;color:#fff;padding:8px">' + BB.ring({ words: false }) + "</div>";
  };
  BB.lineOpts = function (it) {
    if (it.kind === "coffee") return (it.size || 1) + " lb · " + esc(it.roast) + " · " + esc(it.grind);
    if (it.kind === "gift" || it.kind === "giftsub") return esc(it.note || "Delivered by email");
    return "";
  };
  function renderCart() {
    var n = BB.count();
    $$(".cart-btn .count").forEach(function (c) { c.textContent = n; c.classList.toggle("on", n > 0); });
    $$(".cart-btn").forEach(function (b) { b.setAttribute("aria-label", "Your bag, " + n + " item" + (n === 1 ? "" : "s")); });
    var ship = BB.shippable(), need = Math.max(0, BB.freeShip - ship);
    $(".ship-msg", drawer).innerHTML = ship === 0 ? "Free shipping on orders " + BB.money(BB.freeShip) + "+" : need > 0 ? "You're <b>" + BB.money(need) + "</b> from free shipping" : "<b>Free shipping</b> unlocked. Nice.";
    var m = $(".meter", drawer); $("i", m).style.width = Math.min(100, ship / BB.freeShip * 100) + "%"; m.classList.toggle("done", need === 0 && ship > 0);
    var box = $(".items", drawer);
    if (!cart.length) {
      box.innerHTML = '<div class="empty">' + BB.ring({ words: false }) + '<p><b>Nothing roasting for you yet.</b></p><p class="small">Every bag is roasted after you order.</p><a class="btn btn-sm" href="' + BB.base + 'shop/">Shop coffee</a></div>';
    } else {
      box.innerHTML = cart.map(function (it, i) {
        return '<div class="line">' + BB.thumb(it) + "<div><b>" + esc(BB.lineName(it)) + '</b><div class="opt">' + BB.lineOpts(it) + '</div><div class="qty"><button type="button" data-q="' + i + '" data-d="-1" aria-label="One less">−</button><span>' + it.qty + '</span><button type="button" data-q="' + i + '" data-d="1" aria-label="One more">+</button></div></div><div class="lp">' + BB.money(BB.linePrice(it) * it.qty) + '<button class="rm" type="button" data-rm="' + i + '">Remove</button></div></div>';
      }).join("");
      var hasMerch = cart.some(function (it) { return it.kind === "merch"; });
      if (!hasMerch && need > 0 && need <= 12) box.innerHTML += '<div class="upsell"><img src="' + BB.base + 'assets/img/coaster-cork.webp" alt=""><div><b>' + BB.money(need) + ' to go.</b> A cork coaster ($5) or slate coaster ($12) gets you closer.</div><button class="btn btn-sm btn-ghost" type="button" data-upsell="' + (need <= 5 ? "coaster-cork" : "coaster-round") + '">Add</button></div>';
    }
    $(".st", drawer).textContent = BB.money(BB.subtotal());
    $(".go", drawer).classList.toggle("hide", !cart.length); $(".go", drawer).style.display = cart.length ? "" : "none";
  }
  drawer.addEventListener("click", function (e) {
    var q = e.target.closest("[data-q]"); if (q) { var i = +q.dataset.q; BB.setQty(i, cart[i].qty + +q.dataset.d); return; }
    var r = e.target.closest("[data-rm]"); if (r) { BB.setQty(+r.dataset.rm, 0); return; }
    var u = e.target.closest("[data-upsell]"); if (u) BB.add({ kind: "merch", id: u.dataset.upsell }, true);
  });
  renderCart(); paintRoast();
  // quick-add buttons anywhere: data-quick="coffeeId" (1 lb, Roaster's Choice, Whole Bean) or data-merch
  document.addEventListener("click", function (e) {
    var q = e.target.closest("[data-quick]");
    if (q) { e.preventDefault(); BB.add({ kind: "coffee", id: q.dataset.quick, size: +(q.dataset.size || 1), roast: q.dataset.roast || "Roaster's Choice", grind: q.dataset.grind || "Whole Bean" }); }
    var m = e.target.closest("[data-merch]");
    if (m) { e.preventDefault(); BB.add({ kind: "merch", id: m.dataset.merch }); }
  });

  // ---------- "Ask Benny" ----------
  var fab = document.createElement("button"); fab.className = "fab"; fab.type = "button";
  fab.innerHTML = '<span class="face">' + BB.face() + '</span><span class="lbl">Ask Benny</span>'; fab.setAttribute("aria-label", "Ask Benny");
  var box = document.createElement("div"); box.className = "chat"; box.setAttribute("role", "dialog"); box.setAttribute("aria-label", "Ask Benny");
  box.innerHTML = '<header><span class="face">' + BB.face() + '</span><div><b>Ask Benny</b><small>Roasts, beans, pickup, wholesale</small></div><button class="x" type="button" aria-label="Close chat">×</button></header><div class="log" aria-live="polite"></div><form><label class="sr" for="askq">Your question</label><input id="askq" type="text" placeholder="e.g. what\'s good for espresso?" autocomplete="off"><button type="submit" aria-label="Send">↑</button></form>';
  if (!document.body.hasAttribute("data-no-chat")) { document.body.appendChild(fab); document.body.appendChild(box); }
  var log = $(".log", box), started = false;
  function add(cls, html) { var m = document.createElement("div"); m.className = "msg " + cls; m.innerHTML = html; log.appendChild(m); log.scrollTop = log.scrollHeight; return m; }
  function chips(list) {
    var c = document.createElement("div"); c.className = "chips";
    list.forEach(function (x) { var b = document.createElement("button"); b.type = "button"; b.className = "chip"; b.textContent = x; b.addEventListener("click", function () { c.remove(); handle(ALIAS[x] || x, x); }); c.appendChild(b); });
    log.appendChild(c); log.scrollTop = log.scrollHeight;
  }
  function bot(html, next) {
    var t = add("bot typing", "Benny is typing…");
    setTimeout(function () { t.remove(); add("bot", html); if (next) chips(next); }, matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : Math.min(900, 280 + html.length * 2.5));
  }
  function openChat() {
    box.classList.add("open"); fab.style.visibility = "hidden";
    if (!started) { started = true; var r = BB.nextRoast(); bot("Hey, I'm Benny's helper. Next roast is <b>" + BB.fmt(r.roast, true) + "</b>. Order in the next " + BB.left(r.msLeft) + " to make that batch. What can I help with?", ["What should I try?", "When will it ship?", "Where can I pick up?", "Wholesale"]); }
    setTimeout(function () { $("input", box).focus(); }, 60);
  }
  function closeChat() { box.classList.remove("open"); fab.style.visibility = ""; fab.focus(); }
  fab.addEventListener("click", openChat); $(".x", box).addEventListener("click", closeChat);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && box.classList.contains("open")) closeChat(); });
  $$("[data-chat]").forEach(function (el) { el.addEventListener("click", function (e) { e.preventDefault(); openChat(); }); });
  $("form", box).addEventListener("submit", function (e) { e.preventDefault(); var i = $("input", box); var q = i.value.trim(); if (!q) return; i.value = ""; handle(q); });
  var L = function (path, label) { return '<a href="' + BB.base + path + '">' + label + "</a>"; };
  function coffeeLink(c) { return L("coffee/?c=" + c.id, esc(c.name)); }
  function findCoffee(q) {
    var best = null;
    COFFEES.forEach(function (c) { var words = (c.name + " " + c.short + " " + c.origin + " " + c.id).toLowerCase(); if (q.split(/\W+/).some(function (w) { return w.length > 3 && words.indexOf(w) > -1; })) best = best || c; });
    return best;
  }
  var ALIAS = { "Bright & fruity": "fruity", "Bold & strong": "strong", "Smooth & low acid": "smooth", "For espresso": "espresso", "What should I try?": "recommend", "When will it ship?": "when ship", "Where can I pick up?": "pickup", "Subscriptions": "subscription", "Other coffees": "other coffees", "Add 1 lb to my bag": "add 1 lb" };
  function handle(q, shown) {
    add("me", esc(shown || q)); var s = q.toLowerCase(), r = BB.nextRoast(), mk = BB.nextMarket();
    if (/^add 1 ?lb/.test(s)) { var last = $$(".msg.bot a[href*='coffee/?c=']", log).pop(); var id = last ? last.getAttribute("href").split("c=")[1] : "halfcaff"; BB.add({ kind: "coffee", id: id, size: 1, roast: "Roaster's Choice", grind: "Whole Bean" }, true); return bot("Added 1 lb of " + esc(BY[id].short) + " (Roaster's Choice, whole bean) to your bag. Change roast or grind at " + L("checkout/", "checkout") + "."); }
    var c = findCoffee(s);
    if (/whole ?sale|cafe|café|restaurant|office|rental|airbnb|vrbo|bulk|account/.test(s)) return bot("Yes, Benny roasts for cafés, restaurants, offices and vacation rentals, with standing orders on the Monday or Wednesday roast. " + L("wholesale/", "See wholesale pricing and request samples") + ".", ["Subscriptions", "Where can I pick up?"]);
    if (/subscri|every month|monthly|auto|never run out/.test(s)) return bot("Subscriptions start at " + BB.money(20) + " a bag. Pick the coffee (or let Benny choose), how much and how often, then skip or swap any time before roast day. The 5 lb monthly is " + BB.money(80) + ". " + L("subscribe/", "Build a subscription") + ".");
    if (/ship|deliver|arriv|when|how long|roast day|fresh/.test(s)) return bot("Benny roasts on <b>Mondays and Wednesdays</b> and ships the next day. Order now and it roasts <b>" + BB.fmt(r.roast, true) + "</b>, ships " + BB.fmt(r.ship) + ", and usually lands " + BB.fmt(r.arrive[0]) + "–" + r.arrive[1].getDate() + ". Free shipping on orders $60+.", ["Where can I pick up?", "What should I try?"]);
    if (/pick ?up|will ?call|local|guerneville|true value|market|occidental|cloverdale|where/.test(s)) return bot("Three ways to skip shipping: will-call at <b>" + BB.pickup.name + "</b> (ready the day after roasting), the <b>Occidental Farmers Market</b> Thursdays 4–8, and the <b>Cloverdale Certified Farmers Market</b> Sundays 9:30–1." + (mk ? " Next up: " + mk.m.town + " " + (mk.live ? "<b>right now</b>" : DAY[mk.start.getDay()]) + "." : "") + " " + L("find-us/", "Pre-order for pickup") + ".");
    if (/decaf|no caffeine|caffeine free|pregnan|evening|night/.test(s)) return bot("Go for the " + coffeeLink(BY.decaf) + ": molasses bread, cinnamon, chocolate almond. Water Process, no chemicals. Want a little lift? The " + coffeeLink(BY.halfcaff) + " is 50/50 and our top seller.");
    if (/strong|caffeine|kick|wake|high octane|bold|robusta|crema/.test(s)) return bot("Strongest cup: the " + coffeeLink(BY["coorg-robusta"]) + ". Natural-process Robusta with elevated caffeine and big crema. For bold flavor with regular caffeine, the " + coffeeLink(BY.mneb) + ".");
    if (/espresso|latte|cappucc|shot|moka/.test(s)) return bot("For espresso: " + coffeeLink(BY.colombia) + " (thick, inky body), " + coffeeLink(BY.mneb) + " for classic and bold, or the " + coffeeLink(BY.ethiopia) + " at a darker roast if you like juicy shots. Ask for the Espresso grind if you don't grind at home.");
    if (/fruit|bright|light roast|floral|pour ?over|v60|chemex|acid/.test(s)) return bot("Bright and sweet: the " + coffeeLink(BY.ethiopia) + ", with honey, maple, lemon and stone fruit. Order it Light or Medium. Benny doesn't burn the beans; light-roast people, this is your bag.");
    if (/smooth|mild|low acid|stomach|easy/.test(s)) return bot("Low acid and smooth: the " + coffeeLink(BY["plantation-aa"]) + " from shade-grown estates in Coorg, India. Rich body, very little bite.");
    if (/recommend|try|suggest|best|favorite|first|which|help me|new/.test(s)) return bot("Tell me how you drink it and I'll match a bag, or take the 30-second " + L("brew/#quiz", "bean quiz") + ".", ["Bright & fruity", "Bold & strong", "Smooth & low acid", "Decaf", "For espresso"]);
    if (/price|cost|how much|\$/.test(s)) return bot((c ? "The " + coffeeLink(c) + " is " : "Every coffee is ") + BB.money(20) + " for 1 lb or " + BB.money(80) + " for 5 lb (that's a 5th pound free), roasted Light through French or Roaster's Choice and ground however you brew." + (c ? "" : " Coasters are $5–$12."), c ? ["Add 1 lb to my bag", "When will it ship?"] : null);
    if (/roaster'?s choice|which roast|roast level|dark|medium/.test(s)) return bot("<b>Roaster's Choice</b> is new: Benny roasts each batch where he thinks that bean tastes best. Prefer to pick? Every coffee comes Light, Medium, Medium Dark, Dark or French.");
    if (/grind|whole bean|grinder|ground/.test(s)) return bot("Whole bean keeps longest. If you need it ground: Coarse (French press, cold brew), Auto-Drip, Espresso, Fine or Turkish. Benny's grinder runs at a low RPM on purpose; heat strips flavor while grinding.");
    if (/gift|present|birthday|christmas|holiday/.test(s)) return bot("Gift cards land by email instantly, and gift subscriptions come with a printable card for under the tree. " + L("gifts/", "See gifts") + ".");
    if (/text|phone|call|contact|talk|email/.test(s)) return bot("Text Benny directly at <a href=\"" + BB.sms + "\">" + BB.phone + "</a>. He's happy to talk coffee.");
    if (c) return bot(coffeeLink(c) + ": " + esc(c.notes.join(", ").toLowerCase()) + ". " + BB.money(20) + "/lb, " + BB.money(80) + " for 5 lb. Order now and it roasts " + BB.fmt(r.roast) + ".", ["Add 1 lb to my bag", "Other coffees"]);
    if (/other coffee|all coffee|menu|selection|lineup|shop/.test(s)) return bot("This week's lineup: " + COFFEES.map(coffeeLink).join(", ") + ". " + L("shop/", "Shop all") + ".");
    bot("I can help with coffees, roast days, shipping, pickup, subscriptions and wholesale. For anything else, text Benny at <a href=\"" + BB.sms + "\">" + BB.phone + "</a>.", ["What should I try?", "When will it ship?", "Subscriptions"]);
  }
  BB.ask = function (q) { openChat(); if (q) setTimeout(function () { handle(q); }, 300); };
  // roast-day email sign-up (footer)
  $$("[data-news]").forEach(function (f) {
    f.addEventListener("submit", function (e) { e.preventDefault(); var i = $("input", f); BB.log("signup", { email: i.value }); i.value = ""; BB.toast("You're on the list. Next email: when a new coffee hits the roaster."); });
  });

  BB.reveal();
})();
