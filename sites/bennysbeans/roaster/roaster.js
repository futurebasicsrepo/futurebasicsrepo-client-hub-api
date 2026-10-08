/* Benny's Beans roaster console (sales demo).
   Every customer, account, order, stock level and history figure here is SAMPLE data, generated
   deterministically around the real roast calendar (Mon + Wed) so the demo always looks current.
   Anything this browser did on the public site (window.BB.log → localStorage "bb_demo") is merged in
   as "You, just now". Nothing is sent anywhere. */
document.addEventListener("DOMContentLoaded", function () {
  "use strict";
  var B = window.BB; if (!B) return;
  var $ = B.$, $$ = B.$$, esc = B.esc;
  var RC = "Roaster's Choice";
  var NOW = B.now(), TODAY = B.ymd(NOW);
  var money = function (n) { return "$" + Math.round(n).toLocaleString("en-US"); };
  var money2 = function (n) { return "$" + n.toFixed(2); };
  var lb = function (n) { return (Math.round(n * 10) / 10).toFixed(1).replace(/\.0$/, "") + " lb"; };
  var plural = function (n, w, p) { return n + " " + (n === 1 ? w : (p || w + "s")); };

  // ---------- console state (this browser only) ----------
  var S = B.store("bb_console") || {};
  ["roasted", "packed", "status", "sent", "samples", "paid", "apps"].forEach(function (k) { S[k] = S[k] || {}; });
  S.marketLog = S.marketLog || [];
  S.cap = S.cap || 6; S.shrink = S.shrink || 16; S.mins = S.mins || 15; S.start = S.start || "07:00";
  var save = function () { B.store("bb_console", S); };

  // ---------- seeded randomness ----------
  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { var a = seed >>> 0; return function () { a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  var int = function (r, a, b) { return a + Math.floor(r() * (b - a + 1)); };
  var pick = function (r, a) { return a[Math.floor(r() * a.length)]; };
  function wpick(r, pairs) { var t = 0, i; for (i = 0; i < pairs.length; i++) t += pairs[i][1]; var x = r() * t; for (i = 0; i < pairs.length; i++) { x -= pairs[i][1]; if (x <= 0) return pairs[i][0]; } return pairs[0][0]; }

  // ---------- dates ----------
  var day0 = function (d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  var parse = function (s) { var p = String(s).split("-"); return new Date(+p[0], p[1] - 1, +p[2]); };
  var dd = function (a, b) { return Math.round((day0(b) - day0(a)) / 864e5); };
  var isRoastDay = function (d) { return B.roastDays.indexOf(d.getDay()) > -1; };
  var EPOCH = new Date(2023, 0, 2); // a Monday
  var weekIdx = function (d) { return Math.floor(dd(EPOCH, d) / 7); };
  var tm = function (d) { var h = d.getHours(), m = d.getMinutes(); return (h % 12 || 12) + ":" + ("0" + m).slice(-2) + (h < 12 ? " am" : " pm"); };
  function mkRoast(d) {
    d = new Date(d); d.setHours(7, 0, 0, 0);
    var cutoff = day0(d); cutoff = new Date(cutoff.getTime() - 60000);
    return { d: d, ymd: B.ymd(d), ship: B.addDays(d, 1), cutoff: cutoff, label: B.fmt(d), long: B.fmt(d, true) };
  }
  var RO = {};
  function roastOf(ymd) { return RO[ymd] || (RO[ymd] = mkRoast(parse(ymd))); }
  function roastBefore(d) { for (var i = 1; i < 9; i++) { var x = B.addDays(d, -i); if (isRoastDay(x)) return roastOf(B.ymd(x)); } }
  function prevRoasts(n) { var out = [], d = NOW; while (out.length < n) { var r = roastBefore(d); out.push(r); d = r.d; } return out; }
  var NEXT = roastOf(B.ymd(B.nextRoast().roast));
  var NEXT2 = roastOf(B.ymd(B.nextRoast(NEXT.d).roast));
  var TODAYR = isRoastDay(NOW) ? roastOf(TODAY) : null;
  var PREV = prevRoasts(6).filter(function (r) { return r.ymd !== TODAY; });
  // which market a roast feeds: Monday's beans rest for Thursday's Occidental, Wednesday's for Sunday's Cloverdale
  var MK = {}; B.markets.forEach(function (m) { MK[m.id] = m; });
  function marketFor(R) { var m = R.d.getDay() === 1 ? MK.occidental : MK.cloverdale; var date = B.addDays(R.d, R.d.getDay() === 1 ? 3 : 4); return { m: m, date: date, ymd: B.ymd(date) }; }
  function feedingRoast(ymd) { var d = parse(ymd); return roastBefore(B.addDays(d, -1)).ymd; }

  // ---------- sample people ----------
  var FIRST = ["Hannah", "Marcus", "Priya", "Dana", "Leo", "Sofia", "Grant", "Mei", "Theo", "Rosa", "Caleb", "Nina", "Owen", "Jada", "Felix", "Ruth", "Ivan", "Tess", "Malik", "June", "Arlo", "Wren", "Diego", "Clara", "Sam", "Noor", "Eli", "Maya", "Hugo", "Lena", "Beau", "Iris", "Kofi", "Ada", "Reed", "Lucia", "Jonah", "Elsie", "Ravi", "Quinn", "Frank", "Gwen", "Abe", "Tara", "Nico", "Vera", "Simon", "Lily", "Omar", "Faye"];
  var LI = "ABCDEFGHJKLMNPRSTVWY";
  var SHIPTOWN = ["Santa Rosa, CA", "Sebastopol, CA", "Petaluma, CA", "Oakland, CA", "San Francisco, CA", "Sacramento, CA", "Portland, OR", "Seattle, WA", "Denver, CO", "Austin, TX", "Chicago, IL", "Brooklyn, NY", "Asheville, NC", "Los Angeles, CA", "Healdsburg, CA", "Napa, CA", "Eugene, OR", "Boise, ID"];
  var LOCAL = ["Guerneville", "Forestville", "Monte Rio", "Rio Nido", "Cazadero", "Occidental", "Cloverdale", "Sebastopol"];
  var PEOPLE = (function () {
    var r = rng(hash("people-v1")), seen = {}, out = [];
    while (out.length < 120) {
      var f = pick(r, FIRST), n = f + " " + LI[int(r, 0, LI.length - 1)] + ".";
      if (seen[n]) continue; seen[n] = 1;
      out.push({ i: out.length, name: n, first: f, ship: pick(r, SHIPTOWN), local: pick(r, LOCAL), drinkers: r() < .45 ? 2 : 1, sms: r() < .72, phone: "707-555-01" + ("0" + out.length % 100).slice(-2) });
    }
    return out;
  })();

  // ---------- catalog weights ----------
  var CW = [["halfcaff", 3], ["ethiopia", 2.6], ["colombia", 2.2], ["mneb", 1.6], ["plantation-aa", 1.3], ["coorg-robusta", 1.1], ["decaf", 1.3]];
  var GW = [["Whole Bean", 46], ["Auto-Drip", 20], ["Espresso", 13], ["Coarse", 12], ["Fine", 6], ["Turkish", 3]];
  var LV = B.ROASTS; // index 1..5 = Light..French
  function rcLevel(id) { var c = B.BY[id]; return LV[Math.floor((c.roast[0] + c.roast[1]) / 2)]; }
  function level(it) { return !it.roast || it.roast === RC ? rcLevel(it.id) : it.roast; }
  function lvIdx(l) { return Math.max(1, LV.indexOf(l)); }
  function mkItem(r, o) {
    o = o || {}; var id = o.id || wpick(r, CW), c = B.BY[id];
    var mid = Math.floor((c.roast[0] + c.roast[1]) / 2);
    var roast = o.roast || (r() < .45 ? RC : LV[r() < .55 ? mid : int(r, c.roast[0], c.roast[1])]);
    return { kind: "coffee", id: id, size: o.size || (r() < .12 ? 5 : 1), roast: roast, grind: o.grind || wpick(r, GW), qty: o.qty || (r() < .08 ? 2 : 1) };
  }
  var PRICE = function (it) { return it.size === 5 ? 80 : it.size < 1 ? 0 : 20 * it.size; };

  // ---------- subscribers (sample) ----------
  var SKIPWHY = ["Traveling", "Still has coffee", "Trying another roaster", "Budget", "Moving"];
  var SUBS = (function () {
    var r = rng(hash("subs-v2")), out = [];
    for (var i = 0; i < 64; i++) {
      var p = PEOPLE[60 + i % 60], size = wpick(r, [[1, 50], [2, 24], [5, 26]]);
      var every = size === 5 ? (r() < .85 ? 4 : 2) : wpick(r, [[1, 18], [2, 50], [4, 32]]);
      var real = size === 5 && every === 4 && r() < .6;
      var coffee = real ? "halfcaff" : r() < .2 ? "rotate" : wpick(r, CW);
      var roast = real ? (r() < .5 ? "Light" : "Dark") : (r() < .4 ? RC : LV[Math.floor((B.BY[coffee === "rotate" ? "colombia" : coffee].roast[0] + B.BY[coffee === "rotate" ? "colombia" : coffee].roast[1]) / 2)]);
      if (real) coffee = roast === "Light" ? "ethiopia" : "mneb";
      var status = i < 4 ? "paused" : "active";
      out.push({
        id: "S-" + (301 + i), p: p, size: size, every: every, coffee: coffee, roast: roast, grind: wpick(r, GW), day: r() < .5 ? 1 : 3, phase: int(r, 0, every - 1),
        fulfil: wpick(r, [["ship", 78], ["willcall", 16], ["market", 6]]), price: size === 5 ? 80 : size * 20, status: status,
        skips: i === 5 || i === 9 ? 2 : i === 14 || i === 22 || i === 31 ? 1 : 0, skipWhy: SKIPWHY[i % SKIPWHY.length],
        pausedDays: status === "paused" ? [12, 34, 41, 19][i] : 0, cardExp: i === 17 || i === 40, since: int(r, 3, 70)
      });
    }
    return out;
  })();
  var activeSubs = SUBS.filter(function (s) { return s.status === "active"; });
  var monthly = function (s) { return s.price * 4.33 / s.every; };
  function renews(s, R) { return s.status === "active" && R.d.getDay() === s.day && weekIdx(R.d) % s.every === s.phase; }
  function skipping(s, R) { return s.skips > 0 && R.ymd === NEXT.ymd; }
  var ROT = ["ethiopia", "colombia", "plantation-aa", "mneb", "decaf"];
  function subCoffee(s, R) { return s.coffee === "rotate" ? ROT[weekIdx(R.d) % ROT.length] : s.coffee; }

  // ---------- wholesale accounts (sample) ----------
  var ACCTS = [
    { id: "w1", name: "Riverside café", town: "Guerneville", type: "Café", day: 1, every: 1, terms: 15, ppl: 13, std: [["halfcaff", 5, 1, "Medium Dark", "Whole Bean"], ["colombia", 5, 1, RC, "Whole Bean"]] },
    { id: "w2", name: "Espresso bar", town: "Forestville", type: "Café", day: 3, every: 1, terms: 15, ppl: 13, std: [["mneb", 5, 1, "Dark", "Whole Bean"], ["ethiopia", 5, 1, "Medium", "Whole Bean"]] },
    { id: "w3", name: "Bistro kitchen", town: "Monte Rio", type: "Restaurant", day: 3, every: 2, terms: 30, ppl: 13, std: [["colombia", 5, 1, "Medium Dark", "Auto-Drip"], ["decaf", 1, 2, "Medium", "Auto-Drip"]] },
    { id: "w4", name: "Design studio office", town: "Santa Rosa", type: "Office", day: 1, every: 2, terms: 30, ppl: 14, std: [["halfcaff", 5, 1, RC, "Auto-Drip"]] },
    { id: "w5", name: "Riverfront cabin", town: "Guerneville", type: "Rental", day: 3, every: 1, terms: 15, ppl: 15, rental: { coffee: "halfcaff", base: 3 } },
    { id: "w6", name: "Redwood A-frame", town: "Cazadero", type: "Rental", day: 3, every: 1, terms: 15, ppl: 15, rental: { coffee: "ethiopia", base: 2 } },
    { id: "w7", name: "Monte Rio cottage", town: "Monte Rio", type: "Rental", day: 3, every: 1, terms: 15, ppl: 15, rental: { coffee: "halfcaff", base: 2 } },
    { id: "w8", name: "Vineyard bungalow", town: "Healdsburg", type: "Rental", day: 3, every: 1, terms: 15, ppl: 15, rental: { coffee: "colombia", base: 1 } }
  ];
  function acctItems(a, R) {
    if (a.rental) { var r = rng(hash(a.id + R.ymd)), n = Math.max(0, a.rental.base + int(r, -1, 1)); return n ? [{ kind: "coffee", id: a.rental.coffee, size: 1, roast: RC, grind: "Whole Bean", qty: n, welcome: true }] : []; }
    return a.std.map(function (s) { return { kind: "coffee", id: s[0], size: s[1], qty: s[2], roast: s[3], grind: s[4] }; });
  }
  function acctDue(a, R) { return R.d.getDay() === a.day && (a.every === 1 || weekIdx(R.d) % 2 === 0); }
  var acctLbs = function (a, R) { return acctItems(a, R).reduce(function (t, it) { return t + it.size * it.qty; }, 0); };
  var acctWeekly = function (a) { var R = NEXT.d.getDay() === a.day ? NEXT : NEXT2; return acctLbs(a, R) / a.every; };
  var SAMPLE_REQ = [
    { id: "SR-1", business: "Wine bar", town: "Healdsburg", contact: "Gwen T.", type: "Restaurant", coffees: ["ethiopia", "colombia", "mneb"], ago: 2, approved: true },
    { id: "SR-2", business: "Rental manager, 6 homes", town: "Jenner", contact: "Simon P.", type: "Rental", coffees: ["halfcaff", "decaf"], ago: 1, approved: false }
  ];

  // ---------- demo loop: what this browser did on the site ----------
  var DEMO = (B.store("bb_demo") || []).filter(function (e) { return e && e.type && e.data; });
  var pickable = [TODAYR, NEXT, NEXT2].filter(Boolean).map(function (r) { return r.ymd; });
  function clampRoast(ymd) { return ymd && pickable.indexOf(ymd) > -1 ? ymd : NEXT.ymd; }
  function normItem(it) {
    if (!it) return null;
    if (it.kind && it.kind !== "coffee") return { kind: it.kind, id: it.id, qty: it.qty || 1, amount: it.amount, name: B.lineName ? B.lineName(it) : it.id, price: B.linePrice ? B.linePrice(it) : it.amount || 0 };
    if (!B.BY[it.id]) return null;
    return { kind: "coffee", id: it.id, size: +it.size === 5 ? 5 : +it.size < 1 ? .25 : 1, roast: it.roast || RC, grind: it.grind || "Whole Bean", qty: Math.max(1, +it.qty || 1) };
  }
  function pt(t) { try { return new Date(new Date(t).toLocaleString("en-US", { timeZone: "America/Los_Angeles" })); } catch (x) { return new Date(t); } }
  function ago(t) { var m = Math.round((Date.now() - t) / 6e4); return m < 2 ? "just now" : m < 60 ? m + " min ago" : m < 1440 ? Math.round(m / 60) + " h ago" : Math.round(m / 1440) + " d ago"; }
  var DEMO_ORDERS = [], DEMO_APPS = [], DEMO_SAMPLES = [], DEMO_SIGNUPS = 0, DEMO_GIFTS = [];
  DEMO.forEach(function (e, k) {
    var d = e.data, base = { mine: true, at: e.at, placed: pt(e.at), no: "YOU-" + (DEMO.length - k) };
    var who = { name: d.name || d.contact || d.business || "You", first: (d.name || "there").split(" ")[0], ship: d.address ? String(d.address).split(",").slice(-2).join(",").trim() || "Your address" : "Your address", local: "Guerneville", sms: true };
    if (e.type === "order") {
      var items = (d.items || []).map(normItem).filter(Boolean);
      var f = d.fulfil === "willcall" ? "willcall" : d.fulfil === "market" ? "market" : "ship";
      var o = Object.assign(base, { ch: f === "willcall" ? "willcall" : f === "market" ? "market" : "web", who: who, items: items, fulfil: f, total: +d.total || items.reduce(function (t, it) { return t + (it.kind === "coffee" ? PRICE(it) : it.price || 0) * it.qty; }, 0), roast: clampRoast(d.roastDate), market: d.market, mdate: d.pickupDate, id: d.id });
      if (items.some(function (i) { return i.kind === "coffee"; })) DEMO_ORDERS.push(o); else DEMO_GIFTS.push(o);
    } else if (e.type === "subscription") {
      var sz = +d.size || 1, cid = B.BY[d.coffee] ? d.coffee : "halfcaff";
      DEMO_ORDERS.push(Object.assign(base, { ch: "sub", who: who, items: [{ kind: "coffee", id: cid, size: sz >= 5 ? 5 : 1, qty: sz >= 5 ? 1 : sz, roast: d.roast || RC, grind: d.grind || "Whole Bean" }], fulfil: d.fulfil === "willcall" ? "willcall" : d.fulfil === "market" ? "market" : "ship", total: +d.price || PRICE({ size: sz }), roast: clampRoast(d.firstRoast), sub: "Every " + (d.every || 4) + " wk · first box" }));
    } else if (e.type === "preorder") {
      var mid = MK[d.market] ? d.market : "occidental";
      DEMO_ORDERS.push(Object.assign(base, { ch: "market", who: who, items: (d.items || []).map(normItem).filter(Boolean), fulfil: "market", market: mid, mdate: d.date, total: (d.items || []).reduce(function (t, it) { return t + (B.linePrice ? B.linePrice(it) : 20) * (it.qty || 1); }, 0), roast: clampRoast(d.date ? feedingRoast(d.date) : null) }));
    } else if (e.type === "samples") {
      DEMO_SAMPLES.push({ id: "YOU-S" + k, business: d.business || "Your business", town: (d.address || "").split(",").slice(-2, -1).join("").trim() || "", contact: d.contact || "", coffees: (d.coffees || []).filter(function (c) { return B.BY[c]; }), mine: true, at: e.at, approved: !!S.samples["YOU-S" + k] });
    } else if (e.type === "wholesale") { DEMO_APPS.push({ k: "app" + k, d: d, at: e.at }); }
    else if (e.type === "signup") DEMO_SIGNUPS++;
    else if (e.type === "gift") DEMO_GIFTS.push(Object.assign(base, { ch: "web", who: { name: d.from || "You", first: "" }, items: [{ kind: "gift", name: "Gift card" + (d.to ? " for " + d.to : ""), qty: 1, price: +d.amount || 0 }], fulfil: "email", total: +d.amount || 0, roast: null }));
  });
  var ALL_SAMPLES = function () { return DEMO_SAMPLES.concat(SAMPLE_REQ).map(function (s) { s.approved = s.approved || !!S.samples[s.id]; return s; }); };

  // ---------- order generation per roast ----------
  var CACHE = {};
  function ordersFor(R) {
    if (!CACHE[R.ymd]) CACHE[R.ymd] = genRoast(R);
    var demo = DEMO_ORDERS.filter(function (o) { return o.roast === R.ymd; });
    var smp = R.ymd === NEXT.ymd ? ALL_SAMPLES().filter(function (s) { return s.approved && s.coffees.length; }).map(function (s) {
      return { no: s.id, ch: "samples", mine: s.mine, who: { name: s.business + (s.town ? ", " + s.town : ""), first: (s.contact || "").split(" ")[0] }, items: s.coffees.map(function (c) { return { kind: "coffee", id: c, size: .25, roast: RC, grind: "Whole Bean", qty: 1 }; }), fulfil: "ship", total: 0, roast: R.ymd, placed: NOW };
    }) : [];
    return demo.concat(smp, CACHE[R.ymd]);
  }
  function genRoast(R) {
    var r = rng(hash("roast-" + R.ymd)), out = [], seq = 0;
    var base = 2100 + Math.floor(dd(EPOCH, R.d) / 7) * 2 * 12 % 8000 + (R.d.getDay() === 3 ? 12 : 0);
    var prevCut = roastBefore(R.d).cutoff, endT = Math.min(R.cutoff.getTime(), NOW.getTime());
    var frac = Math.max(.6, Math.min(1, (endT - prevCut) / (R.cutoff - prevCut)));
    var placed = function () { var a = prevCut.getTime(), b = Math.max(a + 36e5, endT); return new Date(a + r() * (b - a)); };
    var add = function (o) { o.no = o.no || "#" + (base + seq++); o.roast = R.ymd; o.placed = o.placed || placed(); out.push(o); };
    var lines = function () { var n = wpick(r, [[1, 58], [2, 32], [3, 10]]), its = []; for (var i = 0; i < n; i++) its.push(mkItem(r)); if (r() < .08) its.push({ kind: "merch", id: r() < .5 ? "coaster-round" : "coaster-cork", qty: 1, name: r() < .5 ? "Slate Coaster" : "Cork Coaster", price: 12 }); return its; };
    var sum = function (its) { return its.reduce(function (t, it) { return t + (it.kind === "coffee" ? PRICE(it) : it.price) * it.qty; }, 0); };
    var nWeb = Math.round(int(r, 9, 13) * frac), nWc = Math.round(int(r, 2, 4) * frac), i;
    for (i = 0; i < nWeb; i++) { var its = lines(), st = sum(its); add({ ch: "web", who: PEOPLE[int(r, 0, 59)], items: its, fulfil: "ship", total: st + (st >= B.freeShip ? 0 : 8.5), shipFee: st >= B.freeShip ? 0 : 8.5 }); }
    for (i = 0; i < nWc; i++) { var w = lines().filter(function (x) { return x.kind === "coffee"; }); add({ ch: "willcall", who: PEOPLE[int(r, 0, 59)], items: w, fulfil: "willcall", total: sum(w) }); }
    SUBS.forEach(function (s) {
      if (!renews(s, R) || skipping(s, R)) return;
      var c = subCoffee(s, R);
      add({ ch: "sub", who: s.p, sub: (s.size === 2 ? "2 × 1 lb" : s.size + " lb") + " every " + plural(s.every, "wk"), subId: s.id, items: [{ kind: "coffee", id: c, size: s.size === 5 ? 5 : 1, qty: s.size === 2 ? 2 : 1, roast: s.roast, grind: s.grind }], fulfil: s.fulfil, total: s.price, market: s.fulfil === "market" ? marketFor(R).m.id : null, mdate: s.fulfil === "market" ? marketFor(R).ymd : null });
    });
    var mf = marketFor(R), nPre = mf.m.id === "occidental" ? int(r, 4, 6) : int(r, 3, 4);
    for (i = 0; i < nPre; i++) { var pi = [mkItem(r, { roast: r() < .6 ? RC : null, grind: r() < .7 ? "Whole Bean" : null })]; if (r() < .3) pi.push(mkItem(r, { size: 1 })); add({ ch: "market", who: PEOPLE[int(r, 0, 59)], items: pi, fulfil: "market", market: mf.m.id, mdate: mf.ymd, total: sum(pi) }); }
    ACCTS.forEach(function (a) { if (!acctDue(a, R)) return; var its = acctItems(a, R); if (!its.length) return; add({ ch: "wholesale", who: { name: a.name + ", " + a.town, first: "", acct: a }, items: its, fulfil: "delivery", total: its.reduce(function (t, it) { return t + it.size * it.qty * a.ppl; }, 0) }); });
    out.sort(function (a, b) { return b.placed - a.placed; });
    out.frac = frac;
    return out;
  }

  // ---------- market history (sample) + logged ----------
  var MBASE = { halfcaff: 4, ethiopia: 3, colombia: 3, mneb: 2, "plantation-aa": 2, "coorg-robusta": 1.2, decaf: 2 };
  function pastMarketDates(m, n) { var out = [], d = day0(NOW); for (var i = 1; out.length < n && i < 80; i++) { var x = B.addDays(d, -i); if (x.getDay() === m.day) out.push(x); } return out; }
  function marketHist(m) {
    return pastMarketDates(m, 6).map(function (d) {
      var ymd = B.ymd(d), logged = S.marketLog.filter(function (l) { return l.market === m.id && l.date === ymd; })[0];
      if (logged) return { ymd: ymd, d: d, sold: logged.sold, coasters: logged.coasters || 0, cash: +logged.cash || 0, card: +logged.card || 0, mine: true };
      var r = rng(hash(m.id + ymd)), k = m.id === "occidental" ? 1 : .7, sold = {}, rev = 0, co = int(r, 1, 5);
      B.COFFEES.forEach(function (c) { var b1 = Math.max(0, Math.round(MBASE[c.id] * k + (r() - .5) * 2.4)), b5 = r() < .14 * k ? 1 : 0; sold[c.id] = [b1, b5]; rev += b1 * 20 + b5 * 80; });
      rev += co * 12; var card = Math.round(rev * (.62 + r() * .14));
      return { ymd: ymd, d: d, sold: sold, coasters: co, cash: rev - card, card: card };
    });
  }
  function bringFor(m) {
    var h = marketHist(m), out = {};
    B.COFFEES.forEach(function (c) {
      var s1 = h.map(function (x) { return (x.sold[c.id] || [0, 0])[0]; }), s5 = h.map(function (x) { return (x.sold[c.id] || [0, 0])[1]; });
      var avg = s1.reduce(function (a, b) { return a + b; }, 0) / s1.length, avg5 = s5.reduce(function (a, b) { return a + b; }, 0) / s5.length;
      out[c.id] = { hist: s1, avg: avg, b1: Math.max(1, Math.ceil(avg * 1.15)), b5: avg5 >= .25 ? 1 : 0 };
    });
    return out;
  }

  // ---------- demand → batch plan ----------
  var CH = { web: "Web", sub: "Subscription", market: "Market pre-order", wholesale: "Wholesale", willcall: "Will-call", samples: "Samples", extra: "Market stock" };
  function demand(R) {
    var orders = ordersFor(R), bags = [];
    orders.forEach(function (o) { o.items.forEach(function (it, ii) { if (it.kind !== "coffee" || !B.BY[it.id]) return; for (var q = 0; q < it.qty; q++) bags.push({ key: o.no + "|" + ii + "|" + q, o: o, it: it, lv: level(it) }); }); });
    var mf = marketFor(R), br = bringFor(mf.m), stock = { no: "STOCK-" + mf.m.id, ch: "extra", who: { name: mf.m.town + " market table", first: "" }, items: [], fulfil: "market", market: mf.m.id, mdate: mf.ymd, roast: R.ymd };
    B.COFFEES.forEach(function (c) {
      if (br[c.id].b1) stock.items.push({ kind: "coffee", id: c.id, size: 1, qty: br[c.id].b1, roast: RC, grind: "Whole Bean" });
      if (br[c.id].b5) stock.items.push({ kind: "coffee", id: c.id, size: 5, qty: br[c.id].b5, roast: RC, grind: "Whole Bean" });
    });
    stock.items.forEach(function (it, ii) { for (var q = 0; q < it.qty; q++) bags.push({ key: stock.no + "|" + ii + "|" + q, o: stock, it: it, lv: level(it) }); });
    var G = {};
    bags.forEach(function (b) {
      var k = b.it.id + "|" + b.lv, g = G[k] || (G[k] = { k: k, id: b.it.id, lv: b.lv, roasted: 0, by: {}, bags: 0, rc: 0 });
      g.roasted += b.it.size; g.bags++; g.by[b.o.ch] = (g.by[b.o.ch] || 0) + b.it.size; if (b.it.roast === RC) g.rc++;
    });
    var order = B.COFFEES.map(function (c) { return c.id; });
    var groups = Object.keys(G).map(function (k) { return G[k]; }).sort(function (a, b) { return (a.id === "decaf") - (b.id === "decaf") || lvIdx(a.lv) - lvIdx(b.lv) || order.indexOf(a.id) - order.indexOf(b.id); });
    var shrink = S.shrink / 100, cap = S.cap;
    groups.forEach(function (g) { g.green = Math.ceil(g.roasted / (1 - shrink) * 10) / 10; g.n = Math.max(1, Math.ceil(g.green / cap - 1e-9)); g.per = g.green / g.n; });
    var st = S.start.split(":"), t = new Date(R.d); t.setHours(+st[0] || 7, +st[1] || 0, 0, 0);
    var slot = S.mins + 3, batches = [];
    groups.forEach(function (g) { for (var i = 0; i < g.n; i++) { var s = new Date(t); t = new Date(t.getTime() + slot * 6e4); batches.push({ key: R.ymd + "|" + g.k + "|" + i, g: g, i: i, green: g.per, start: s, end: new Date(s.getTime() + S.mins * 6e4) }); } });
    var done = batches.length ? new Date(batches[batches.length - 1].end.getTime() + 6 * 6e4) : t;
    var lvO = function (b) { return groups.indexOf(G[b.it.id + "|" + b.lv]); };
    var GO = GW.map(function (g) { return g[0]; });
    bags.sort(function (a, b) { return lvO(a) - lvO(b) || GO.indexOf(a.it.grind) - GO.indexOf(b.it.grind) || b.it.size - a.it.size || (a.o.ch > b.o.ch ? 1 : -1); });
    bags.forEach(function (b, i) { b.label = "L-" + ("00" + (i + 1)).slice(-3); });
    var tot = groups.reduce(function (a, g) { a.r += g.roasted; a.g += g.green; return a; }, { r: 0, g: 0 });
    return { R: R, orders: orders, stock: stock, bags: bags, groups: groups, batches: batches, done: done, roasted: tot.r, green: tot.g, mf: mf, br: br };
  }

  // ---------- statuses ----------
  var STL = { "new": "New", roasting: "Roasting", packed: "Packed", shipped: "Shipped", "picked up": "Picked up" };
  function statusOf(o) {
    if (S.status[o.no]) return S.status[o.no];
    if (!o.roast) return "shipped";
    if (o.roast > TODAY) return "new";
    if (o.roast === TODAY) { var p = o.items.every(function (it, ii) { if (it.kind !== "coffee") return true; for (var q = 0; q < it.qty; q++) if (!S.packed[o.no + "|" + ii + "|" + q]) return false; return true; }); return p ? "packed" : "roasting"; }
    var R = roastOf(o.roast), sinceShip = dd(R.ship, NOW);
    if (o.fulfil === "willcall") return sinceShip >= 2 ? "picked up" : "packed";
    if (o.fulfil === "market") return o.mdate && o.mdate < TODAY ? "picked up" : "packed";
    return sinceShip >= 0 ? "shipped" : "packed";
  }
  var stPill = function (s) { return '<span class="st st-' + s.replace(" ", "-") + '">' + STL[s] + "</span>"; };
  var chPill = function (ch) { return '<span class="chn chn-' + ch + '">' + CH[ch] + "</span>"; };
  function whoHTML(o) {
    var n = o.who.name;
    if (o.mine) return "<b>" + esc(n) + '</b> <span class="you">You, ' + ago(o.at) + "</span>";
    return "<b>" + esc(n) + '</b> <span class="smp">sample</span>';
  }
  var thumb = function (id, size) { var c = B.BY[id]; return '<span class="th" style="--c:' + (c ? c.c : "#ddd") + '">' + B.bag(id, { size: size === 5 ? 5 : 1 }) + "</span>"; };
  var itemTxt = function (it) { if (it.kind !== "coffee") return esc(it.name || it.id) + (it.qty > 1 ? " ×" + it.qty : ""); var c = B.BY[it.id]; return (it.qty > 1 ? it.qty + " × " : "") + sizeTxt(it.size) + " " + esc(c.short) + " · " + esc(it.roast === RC ? "Roaster's Choice" : it.roast) + " · " + esc(it.grind); };
  var sizeTxt = function (s) { return s < 1 ? "4 oz" : s + " lb"; };

  // =====================================================================
  // ROUTING
  // =====================================================================
  var views = $$(".view").map(function (v) { return v.id.slice(2); });
  var rendered = {}, firstRoute = true;
  function route() {
    var h = (location.hash || "#roastday").slice(1).split("/"), v = views.indexOf(h[0]) > -1 ? h[0] : "roastday";
    $$(".view").forEach(function (s) { s.hidden = s.id !== "v-" + v; });
    $$("#rc-rail a").forEach(function (a) { if (a.dataset.v === v) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
    var act = $("#rc-rail a[aria-current]"); if (act && act.scrollIntoView && innerWidth < 900) act.scrollIntoView({ block: "nearest", inline: "center" });
    if (!rendered[v]) { RENDER[v](); rendered[v] = true; }
    if (h[1]) { var t = document.getElementById("rd-" + h[1]); if (t) setTimeout(function () { t.scrollIntoView({ behavior: "smooth", block: "start" }); }, 30); }
    else if (!firstRoute) { var top = $("#main"); scrollTo(0, top.getBoundingClientRect().top + scrollY - 4); var hh = $("#v-" + v + " h1"); if (hh) hh.focus({ preventScroll: true }); }
    firstRoute = false;
  }
  // arrow keys move along the rail
  $("#rc-rail").addEventListener("keydown", function (e) {
    var links = $$("#rc-rail a"), i = links.indexOf(document.activeElement); if (i < 0) return;
    var k = e.key, n = k === "ArrowDown" || k === "ArrowRight" ? i + 1 : k === "ArrowUp" || k === "ArrowLeft" ? i - 1 : k === "Home" ? 0 : k === "End" ? links.length - 1 : null;
    if (n === null) return; e.preventDefault(); links[(n + links.length) % links.length].focus();
  });

  // clock
  function clock() { var n = B.now(); $("#rc-clock").textContent = B.DS[n.getDay()] + " " + B.MON[n.getMonth()] + " " + n.getDate() + " · " + tm(n) + " PT"; }
  clock(); setInterval(clock, 30000);

  // ---------- dialog: composed texts ----------
  var dlg = $("#dlg"), dlgCb = null;
  function segs(t) { var n = t.length; return n <= 160 ? 1 : Math.ceil(n / 153); }
  function updDlg() { var t = $("#dlg-msg").value; $("#dlg-bubble").textContent = t; $("#dlg-count").textContent = t.length + " characters · " + plural(segs(t), "SMS segment") + (/STOP/.test(t) ? "" : " · add “Reply STOP to opt out”"); }
  $("#dlg-msg").addEventListener("input", updDlg);
  function compose(title, to, msg, cb, sendLabel) {
    $("#dlg-h").textContent = title; $("#dlg-to").innerHTML = to; $("#dlg-msg").value = msg; $("#dlg-send").textContent = sendLabel || "Send (demo)"; dlgCb = cb; updDlg();
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "");
  }
  dlg.addEventListener("close", function () { if (dlg.returnValue === "send" && dlgCb) dlgCb($("#dlg-msg").value); dlgCb = null; });
  dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close("cancel"); });
  $$("[data-face]", dlg).forEach(function (el) { el.innerHTML = B.face(); });

  // ---------- printing ----------
  function printMode(mode, html) {
    $("#print-area").innerHTML = html; document.body.setAttribute("data-print", mode);
    var done = function () { document.body.removeAttribute("data-print"); removeEventListener("afterprint", done); };
    addEventListener("afterprint", done); setTimeout(function () { window.print(); }, 60);
  }
  window.BBConsolePrint = function (mode) { // used by QA / print preview
    var D = demand(CUR); $("#print-area").innerHTML = mode === "slips" ? slipsHTML(D) : labelsHTML(D.bags, D.R); document.body.setAttribute("data-print", mode);
  };

  // =====================================================================
  // ROAST DAY
  // =====================================================================
  var CUR = NEXT, labelsAll = false;
  function renderRoastDay() {
    var pk = $("#rd-pick"), opts = [];
    if (TODAYR) opts.push([TODAYR, "Today"]);
    opts.push([NEXT, TODAYR ? "Next" : "Next roast"]); opts.push([NEXT2, "After that"]);
    pk.innerHTML = opts.map(function (o) { return '<button type="button" aria-pressed="' + (o[0] === CUR) + '" data-r="' + o[0].ymd + '">' + o[0].label + "<small>" + o[1] + "</small></button>"; }).join("");
    var D = demand(CUR), R = CUR;
    $("#rd-day").textContent = B.DAY[R.d.getDay()]; $("#rd-md").textContent = B.MON[R.d.getMonth()] + " " + R.d.getDate();
    paintCut();
    var rb = D.batches.filter(function (b) { return S.roasted[b.key]; }).length;
    var kp = [
      ["Bags", D.bags.length, plural(D.orders.length + 1, "order") + " incl. market stock"],
      ["Roasted", lb(D.roasted), "needed out of the cooler"],
      ["Green", lb(D.green), "at " + S.shrink + "% shrink"],
      ["Batches", D.batches.length, rb ? rb + " roasted so far" : S.cap + " lb green each, max"],
      ["First drop", tm(D.batches.length ? D.batches[0].start : R.d), "preheat 30 min before"],
      ["Roast done", "~" + tm(D.done), "then grind + pack"]
    ];
    $("#rd-kpis").innerHTML = kp.map(function (k) { return '<div class="k"><span>' + k[0] + "</span><b>" + k[1] + "</b><small>" + k[2] + "</small></div>"; }).join("");
    $("#n-roastday").textContent = D.bags.length;
    renderLive(); renderDemand(D); renderPlan(D); renderPack(D); renderLabels(D); renderShip(D); renderWillcall(D); renderMarketBox(D);
  }
  function paintCut() {
    var R = CUR, el = $("#rd-cut"), now = B.now();
    if (R.ymd === TODAY) el.innerHTML = "<b>Roasting today.</b> Ships " + B.fmt(R.ship, true) + ". Will-call ready at " + esc(B.pickup.short) + " the same day.";
    else if (R.cutoff > now) el.innerHTML = 'Orders lock in <b class="cd">' + B.left(R.cutoff - now) + "</b> (11:59 pm " + B.DS[R.cutoff.getDay()] + "). Ships " + B.fmt(R.ship) + ". " + (R === NEXT && CACHE[R.ymd] && CACHE[R.ymd].frac < 1 ? '<span class="proj">Web orders still coming in; plan updates live.</span>' : "");
    else el.innerHTML = "Cutoff passed. Ships " + B.fmt(R.ship) + ".";
  }
  setInterval(function () { if (!$("#v-roastday").hidden) paintCut(); }, 30000);
  $("#rd-pick").addEventListener("click", function (e) { var b = e.target.closest("[data-r]"); if (!b) return; CUR = roastOf(b.dataset.r); labelsAll = false; renderRoastDay(); });

  var EVT = { order: "Order", subscription: "Subscription", preorder: "Market pre-order", wholesale: "Wholesale application", samples: "Sample request", gift: "Gift card", quiz: "Bean quiz", signup: "Roast-day email sign-up" };
  function evSummary(e) {
    var d = e.data;
    if (e.type === "order") return esc(d.name || "Order") + " · " + (d.items || []).length + " line" + ((d.items || []).length === 1 ? "" : "s") + " · " + money2(+d.total || 0) + " · " + (d.fulfil === "willcall" ? "will-call" : d.fulfil === "market" ? "market pickup" : "ship");
    if (e.type === "subscription") return esc(d.name || "") + " · " + esc(B.BY[d.coffee] ? B.BY[d.coffee].short : d.coffee || "") + " · " + (d.size || 1) + " lb every " + (d.every || 4) + " wk";
    if (e.type === "preorder") return esc(d.name || "") + " · " + esc(MK[d.market] ? MK[d.market].town : "") + " " + (d.date ? B.fmt(parse(d.date)) : "");
    if (e.type === "wholesale") return esc(d.business || "") + " · " + esc(d.type || "") + " · " + (d.lbsPerWeek || "?") + " lb/wk";
    if (e.type === "samples") return esc(d.business || "") + " · " + (d.coffees || []).length + " coffees";
    if (e.type === "gift") return money(+d.amount || 0) + (d.to ? " for " + esc(d.to) : "");
    if (e.type === "quiz") return "Matched " + esc(B.BY[d.result] ? B.BY[d.result].short : d.result || "");
    if (e.type === "signup") return esc(d.email || "");
    return "";
  }
  var EVLINK = { order: "#roastday/pack", subscription: "#subscriptions", preorder: "#markets", wholesale: "#wholesale", samples: "#wholesale", gift: "#orders", quiz: "#customers", signup: "#customers" };
  function renderLive() {
    var el = $("#rd-live");
    if (!DEMO.length) {
      el.innerHTML = '<div class="live-empty"><span class="dot"></span><p><b>Try the loop.</b> Place an order, start a subscription, pre-order for a market or request wholesale samples on the site. It lands here, in the right roast, as “You, just now”.</p><div class="row"><a class="btn btn-sm btn-red" href="../shop/">Order on the site</a><a class="btn btn-sm btn-ghost" href="../subscribe/">Subscribe</a><a class="btn btn-sm btn-ghost" href="../wholesale/">Wholesale</a></div></div>';
      return;
    }
    el.innerHTML = '<div class="live"><div class="live-h"><span class="dot"></span><b>Live from the site</b><span class="tiny">' + plural(DEMO.length, "event") + " from this browser</span></div><ul>" + DEMO.slice(0, 6).map(function (e) {
      return '<li><span class="you">You, ' + ago(e.at) + '</span><b>' + (EVT[e.type] || e.type) + "</b><span>" + evSummary(e) + '</span><a href="' + (EVLINK[e.type] || "#orders") + '">See it →</a></li>';
    }).join("") + "</ul></div>";
  }
  function renderDemand(D) {
    var by = {}; D.orders.concat([D.stock]).forEach(function (o) { var c = by[o.ch] || (by[o.ch] = { n: 0, lbs: 0, bags: 0, mine: 0 }); c.n++; if (o.mine) c.mine++; o.items.forEach(function (it) { if (it.kind === "coffee") { c.lbs += it.size * it.qty; c.bags += it.qty; } }); });
    var mx = Math.max.apply(null, Object.keys(by).map(function (k) { return by[k].lbs; }).concat([1]));
    var keys = ["web", "sub", "wholesale", "market", "willcall", "samples", "extra"].filter(function (k) { return by[k]; });
    $("#rd-demand").innerHTML = '<div class="pn-h"><h2>Due on this roast</h2><span class="tiny">' + lb(D.roasted) + " roasted across " + plural(D.bags.length, "bag") + "</span></div>" +
      '<ul class="dem">' + keys.map(function (k) { var c = by[k]; return '<li><span class="chn chn-' + k + '">' + CH[k] + '</span><b class="mono">' + lb(c.lbs) + '</b><span class="bar"><i style="width:' + (c.lbs / mx * 100).toFixed(1) + '%"></i></span><span class="tiny">' + (k === "extra" ? plural(c.bags, "bag") + " for " + esc(D.mf.m.town) + " walk-ups" : plural(c.n, k === "wholesale" ? "account" : "order") + " · " + plural(c.bags, "bag")) + (c.mine ? ' <span class="you">' + c.mine + " yours</span>" : "") + "</span></li>"; }).join("") + "</ul>";
  }
  function renderPlan(D) {
    $("#cfg-cap").value = S.cap; $("#cfg-shrink").value = S.shrink; $("#cfg-mins").value = S.mins; $("#cfg-start").value = S.start;
    $("#plan-assume").innerHTML = "Green needed = roasted ÷ (1 − " + S.shrink + "% shrink). Capacity and times are illustrative; set them to your roaster. Each slot adds 3 min to drop, cool in the tray and recharge.";
    var mine = {}; D.bags.forEach(function (b) { if (b.o.mine) mine[b.it.id + "|" + b.lv] = 1; });
    $("#plan-groups").innerHTML = '<table class="tbl stack plan"><thead><tr><th>Coffee · roast</th><th class="n">Roasted</th><th class="n">Green</th><th>Batches</th><th>Who it\'s for</th></tr></thead><tbody>' + D.groups.map(function (g) {
      var c = B.BY[g.id];
      return '<tr><td class="lead"><div class="cf">' + thumb(g.id) + "<div><b>" + esc(c.short) + "</b>" + (mine[g.k] ? ' <span class="you">You</span>' : "") + '<span class="lv">' + esc(g.lv) + (g.rc ? " · " + g.rc + " Roaster's Choice" : "") + "</span>" + B.roastBar([lvIdx(g.lv), lvIdx(g.lv)]) + "</div></div></td>" +
        '<td class="n" data-l="Roasted">' + lb(g.roasted) + '</td><td class="n" data-l="Green">' + lb(g.green) + "</td>" +
        '<td data-l="Batches"><b class="mono">' + g.n + " × " + lb(g.per) + "</b>" + (g.green < 2 ? '<span class="flag">Small charge: top up to 2 lb, extra to market stock</span>' : "") + "</td>" +
        '<td data-l="For" class="for">' + Object.keys(g.by).map(function (k) { return '<span class="chn chn-' + k + '">' + CH[k] + " " + lb(g.by[k]) + "</span>"; }).join(" ") + "</td></tr>";
    }).join("") + '</tbody><tfoot><tr><td>Total</td><td class="n" data-l="Roasted">' + lb(D.roasted) + '</td><td class="n" data-l="Green">' + lb(D.green) + '</td><td data-l="Batches">' + plural(D.batches.length, "batch", "batches") + "</td><td></td></tr></tfoot></table>";
    renderSched(D);
    // green stock check
    var short = greenShort(D);
    if (short.length) $("#plan-groups").insertAdjacentHTML("beforeend", '<p class="alert-line">Green check: ' + short.join(" · ") + ' · <a href="#green">See inventory →</a></p>');
  }
  function renderSched(D) {
    $("#plan-sched").innerHTML = D.batches.map(function (b, i) {
      var c = B.BY[b.g.id], on = !!S.roasted[b.key], id = "bt" + i;
      return '<li class="' + (on ? "done" : "") + '"><input type="checkbox" id="' + id + '" data-b="' + esc(b.key) + '"' + (on ? " checked" : "") + '><label for="' + id + '"><span class="t mono">' + tm(b.start) + '</span><span class="sw" style="background:' + c.c + '"></span><span class="nm"><b>' + esc(c.short) + "</b> " + esc(b.g.lv) + (b.g.n > 1 ? ' <span class="muted">' + (b.i + 1) + "/" + b.g.n + "</span>" : "") + '</span><span class="gw mono">' + lb(b.green) + " green → ~" + lb(b.green * (1 - S.shrink / 100)) + "</span></label></li>";
    }).join("");
    var n = D.batches.filter(function (b) { return S.roasted[b.key]; }).length, pct = D.batches.length ? n / D.batches.length * 100 : 0;
    $("#sched-prog").innerHTML = '<span class="mono">' + n + " / " + D.batches.length + ' roasted</span><div class="meter' + (pct === 100 ? " done" : "") + '"><i style="width:' + pct + '%"></i></div><span class="tiny">' + (pct === 100 ? "All batches done. On to grinding." : "Done ~" + tm(D.done)) + "</span>";
  }
  $("#plan-sched").addEventListener("change", function (e) {
    var k = e.target.dataset.b; if (!k) return; if (e.target.checked) S.roasted[k] = 1; else delete S.roasted[k]; save();
    e.target.closest("li").classList.toggle("done", e.target.checked); var D = demand(CUR); renderSched(D);
    $$("#rd-kpis .k")[3].querySelector("small").textContent = D.batches.filter(function (b) { return S.roasted[b.key]; }).length + " roasted so far";
    var li = $$("#plan-sched li"), idx = $$("#plan-sched input").indexOf(e.target); if (li[idx]) li[idx].querySelector("input").focus();
  });
  ["cap", "shrink", "mins", "start"].forEach(function (k) {
    $("#cfg-" + k).addEventListener("change", function () {
      var v = this.value; if (k === "start") { if (!/^\d\d:\d\d$/.test(v)) return; S.start = v; } else { v = parseFloat(v); if (!(v > 0)) return; S[k] = Math.min(+this.max, Math.max(+this.min, v)); }
      save(); renderRoastDay(); rendered.green = false;
    });
  });
  // GREEN INVENTORY model (sample) — weekly burn derived from the plans themselves
  var GREEN = [
    { id: "ethiopia", cover: 2.1, cost: 6.4, sup: "US specialty importer", lead: 3 },
    { id: "colombia", cover: 5.4, cost: 6.1, sup: "US specialty importer", lead: 3 },
    { id: "plantation-aa", cover: 8.6, cost: 5.2, sup: "Women-owned Coorg estate partner", lead: 6 },
    { id: "coorg-robusta", cover: 11.2, cost: 4.1, sup: "Women-owned Coorg estate partner", lead: 6 },
    { id: "mneb", cover: 7.4, cost: 4.8, sup: "Women-owned Coorg estate partner", lead: 6 },
    { id: "decaf", cover: 3.3, cost: 6.9, sup: "US specialty importer (WP decaf)", lead: 3 }
  ];
  function greenUse(D) { // green lbs per origin for one plan; Half-Caff splits 50/50 decaf + Colombia
    var u = {}; D.groups.forEach(function (g) { if (g.id === "halfcaff") { u.decaf = (u.decaf || 0) + g.green / 2; u.colombia = (u.colombia || 0) + g.green / 2; } else u[g.id] = (u[g.id] || 0) + g.green; }); return u;
  }
  var WEEKLY = null;
  function weekly() {
    if (WEEKLY) return WEEKLY;
    var a = greenUse(demandRaw(NEXT)), b = greenUse(demandRaw(NEXT2)); WEEKLY = {};
    GREEN.forEach(function (g) { WEEKLY[g.id] = Math.max(1, (a[g.id] || 0) + (b[g.id] || 0)); }); return WEEKLY;
  }
  function demandRaw(R) { return demand(R); }
  function onHand(g) { return Math.round(weekly()[g.id] * g.cover * (S.shrink ? 1 : 1)); }
  function greenShort(D) {
    var u = greenUse(D), out = [];
    GREEN.forEach(function (g) { var h = onHand(g); if ((u[g.id] || 0) > h) out.push(esc(B.BY[g.id].short) + " short " + lb(u[g.id] - h)); });
    return out;
  }

  function renderPack(D) {
    var gq = {}; D.bags.forEach(function (b) { gq[b.it.grind] = (gq[b.it.grind] || 0) + 1; });
    $("#grind-q").innerHTML = '<span class="label">Grinder queue</span>' + GW.filter(function (g) { return gq[g[0]]; }).map(function (g) { return '<span class="gq"><b class="mono">' + gq[g[0]] + "</b> " + esc(g[0]) + "</span>"; }).join("");
    var packed = D.bags.filter(function (b) { return S.packed[b.key]; }).length, last = "", LN = [], LI = {};
    D.bags.forEach(function (b, i) { var lk = b.key.replace(/\|\d+$/, ""); if (!LI[lk]) { LI[lk] = { lk: lk, bags: [], first: i }; LN.push(LI[lk]); } LI[lk].bags.push(b); });
    PACKLINES = LN;
    var rows = LN.map(function (L, i) {
      var b = L.bags[0], n = L.bags.length, c = B.BY[b.it.id], gk = b.it.id + "|" + b.lv, head = "";
      if (gk !== last) { last = gk; var gr = D.groups.filter(function (g) { return g.k === gk; })[0]; head = '<tr class="grp"><td colspan="7"><span class="sw" style="background:' + c.c + '"></span>' + esc(c.short) + " · " + esc(b.lv) + ' <span class="muted">' + plural(gr.bags, "bag") + " · " + lb(gr.roasted) + "</span></td></tr>"; }
      var on = L.bags.every(function (x) { return S.packed[x.key]; });
      return head + '<tr class="' + (on ? "done" : "") + (b.o.mine ? " mine" : "") + '"><td class="ck"><input type="checkbox" id="pk' + i + '" data-p="' + i + '"' + (on ? " checked" : "") + ' aria-label="Packed: ' + esc((n > 1 ? n + " × " : "") + c.short + " " + sizeTxt(b.it.size) + " for " + b.o.who.name) + '"></td>' +
        '<td class="lead"><div class="cf">' + thumb(b.it.id, b.it.size) + "<div><b>" + (n > 1 ? '<span class="qty-x">' + n + " ×</span> " : "") + esc(c.short) + '</b><span class="lv">' + sizeTxt(b.it.size) + " · " + esc(b.it.roast === RC ? "RC → " + b.lv : b.lv) + "</span></div></div></td>" +
        '<td data-l="Grind"><b>' + esc(b.it.grind) + "</b></td>" +
        '<td data-l="For" class="who">' + (b.o.ch === "extra" ? "<b>" + esc(b.o.who.name) + "</b>" : whoHTML(b.o)) + "</td>" +
        '<td data-l="Channel">' + chPill(b.o.ch) + (b.it.welcome ? ' <span class="tiny">welcome bags</span>' : "") + "</td>" +
        '<td data-l="Label" class="mono">' + b.label + (n > 1 ? "–" + L.bags[n - 1].label.slice(2) : "") + "</td>" +
        '<td class="act"><button class="lnk" type="button" data-pl="' + i + '">Print ' + (n > 1 ? n + " labels" : "label") + "</button></td></tr>";
    }).join("");
    $("#pack-list").innerHTML = '<div class="pk-prog"><span class="mono">' + packed + " / " + D.bags.length + ' bags packed</span><div class="meter' + (packed === D.bags.length && packed ? " done" : "") + '"><i style="width:' + (D.bags.length ? packed / D.bags.length * 100 : 0) + '%"></i></div></div>' +
      '<div class="tscroll"><table class="tbl stack pack"><thead><tr><th><span class="sr">Packed</span></th><th>Bag</th><th>Grind</th><th>For</th><th>Channel</th><th>Labels</th><th><span class="sr">Actions</span></th></tr></thead><tbody>' + rows + "</tbody></table></div>";
  }
  var PACKLINES = [];
  $("#pack-list").addEventListener("change", function (e) {
    var L = PACKLINES[+e.target.dataset.p]; if (!L) return; L.bags.forEach(function (b) { if (e.target.checked) S.packed[b.key] = 1; else delete S.packed[b.key]; }); save();
    e.target.closest("tr").classList.toggle("done", e.target.checked);
    var D = demand(CUR), n = D.bags.filter(function (b) { return S.packed[b.key]; }).length;
    $(".pk-prog .mono").textContent = n + " / " + D.bags.length + " bags packed"; $(".pk-prog .meter i").style.width = n / D.bags.length * 100 + "%"; $(".pk-prog .meter").classList.toggle("done", n === D.bags.length);
  });
  $("#pack-list").addEventListener("click", function (e) { var b = e.target.closest("[data-pl]"); if (!b) return; var L = PACKLINES[+b.dataset.pl]; printMode("labels", labelsHTML(L.bags, CUR)); });

  function labelHTML(b, R) {
    var c = B.BY[b.it.id];
    return '<div class="lbl" style="--lc:' + c.c + ";--li:" + c.ink + '"><div class="lbl-top"><span class="lbl-ring">' + B.ring({ words: false }) + '</span><span class="lbl-b">Benny\'s Beans</span><span class="lbl-n mono">' + b.label + "</span></div>" +
      '<div class="lbl-band"><b>' + esc(c.short) + "</b><span>" + esc(c.origin + " · " + c.detail) + "</span></div>" +
      '<dl class="lbl-kv"><dt>Roast</dt><dd>' + esc(b.lv) + (b.it.roast === RC ? " <i>(Roaster's Choice)</i>" : "") + "</dd><dt>Grind</dt><dd>" + esc(b.it.grind) + "</dd><dt>Size</dt><dd>" + sizeTxt(b.it.size) + "</dd><dt>Roasted</dt><dd>" + B.fmt(R.d, true) + ", " + R.d.getFullYear() + "</dd></dl>" +
      B.roastBar([lvIdx(b.lv), lvIdx(b.lv)]) +
      '<p class="lbl-notes">' + esc(c.notes.slice(0, 3).join(" · ")) + "</p>" +
      '<p class="lbl-for">For ' + esc(b.o.ch === "extra" ? "market table" : b.o.who.name) + "</p>" +
      '<p class="lbl-foot">Benny\'s Beans · Guerneville, CA · Est. 2023</p></div>';
  }
  function labelsHTML(bags, R) { return '<div class="lbl-sheet">' + bags.map(function (b) { return labelHTML(b, R); }).join("") + "</div>"; }
  function renderLabels(D) {
    var show = labelsAll ? D.bags : D.bags.slice(0, 8);
    $("#label-preview").innerHTML = show.map(function (b) { return labelHTML(b, D.R); }).join("");
    var m = $("#labels-more"); m.hidden = D.bags.length <= 8; m.textContent = labelsAll ? "Show fewer" : "Show all " + D.bags.length + " labels"; m.setAttribute("aria-expanded", labelsAll);
  }
  $("#labels-more").addEventListener("click", function () { labelsAll = !labelsAll; renderLabels(demand(CUR)); });
  $("#print-labels").addEventListener("click", function () { var D = demand(CUR); printMode("labels", labelsHTML(D.bags, D.R)); });

  // ---------- ship list ----------
  function shipOrders(D) { return D.orders.filter(function (o) { return o.fulfil === "ship"; }); }
  var weight = function (o) { return o.items.reduce(function (t, it) { return t + (it.kind === "coffee" ? (it.size + (it.size === 5 ? .3 : .12)) * it.qty : .4); }, 0) + .3; };
  function shipText(o) { var c = o.items.filter(function (i) { return i.kind === "coffee"; })[0]; return "Benny's Beans: Hi " + (o.who.first || "there") + ", your " + (c ? B.BY[c.id].short : "coffee") + " (roasted " + B.fmt(roastOf(o.roast).d, true) + ") just shipped. Track it: russianriverroastery.com/t/" + o.no.replace(/\W/g, "") + " Reply STOP to opt out."; }
  function renderShip(D) {
    var list = shipOrders(D);
    if (!list.length) { $("#ship-list").innerHTML = '<p class="empty-s">Nothing to ship on this roast.</p>'; return; }
    $("#ship-list").innerHTML = '<table class="tbl stack"><thead><tr><th>Order</th><th>Ship to</th><th>Bags</th><th class="n">Weight</th><th>Service</th><th>Status</th><th><span class="sr">Action</span></th></tr></thead><tbody>' + list.map(function (o) {
      var st = statusOf(o), w = weight(o);
      return '<tr class="' + (o.mine ? "mine" : "") + '"><td class="lead"><span class="mono ono">' + esc(o.no) + "</span> " + chPill(o.ch) + '</td><td data-l="Ship to" class="who">' + whoHTML(o) + '<span class="tiny">' + esc(o.who.ship || "") + "</span></td>" +
        '<td data-l="Bags">' + o.items.map(itemTxt).join("<br>") + '</td><td class="n" data-l="Weight">' + lb(w) + '</td><td data-l="Service" class="small">' + (o.ch === "samples" ? "First-Class envelope" : w > 4 ? "Priority Mail" : "Ground Advantage") + '</td><td data-l="Status">' + stPill(st) + "</td>" +
        '<td class="act">' + (st === "shipped" ? '<span class="tiny">Customer texted</span>' : '<button class="btn btn-sm" type="button" data-ship="' + esc(o.no) + '">Mark shipped → text</button>') + "</td></tr>";
    }).join("") + "</tbody></table>";
  }
  $("#ship-list").addEventListener("click", function (e) {
    var b = e.target.closest("[data-ship]"); if (!b) return; var o = demand(CUR).orders.filter(function (x) { return x.no === b.dataset.ship; })[0]; if (!o) return;
    compose("Shipped: " + o.no, "To <b>" + esc(o.who.name) + "</b> · " + (o.mine ? "you" : "sample customer") + " · opted in to order texts", shipText(o), function () {
      S.status[o.no] = "shipped"; if (o.ch === "samples") { S.sent["ship:" + o.no] = 1; } save(); CACHE = {}; renderRoastDay(); rendered.orders = false; rendered.wholesale = false; B.toast("Marked shipped. Text composed (demo, nothing sent).");
    }, "Mark shipped + send");
  });
  $("#ship-all").addEventListener("click", function () {
    var list = shipOrders(demand(CUR)).filter(function (o) { return statusOf(o) !== "shipped"; }); if (!list.length) return B.toast("Everything on this roast is already shipped.");
    list.forEach(function (o) { S.status[o.no] = "shipped"; }); save(); renderRoastDay(); rendered.orders = false; B.toast(plural(list.length, "order") + " marked shipped · " + list.length + " tracking texts composed (demo)");
  });
  function slipsHTML(D) {
    return shipOrders(D).map(function (o) {
      return '<section class="slip"><header><span class="slip-ring">' + B.ring({ words: true }) + '</span><div><b>Benny\'s Beans · Russian River Roastery</b><span>Guerneville, CA · Est. 2023 · Text 707-899-4183</span></div><span class="mono">' + esc(o.no) + "</span></header>" +
        '<div class="slip-to"><span class="label">Ship to</span><b>' + esc(o.who.name) + (o.mine ? "" : " (sample)") + "</b><span>" + esc(o.who.ship || "") + "</span></div>" +
        '<table><thead><tr><th>Qty</th><th>Item</th><th>Roast</th><th>Grind</th></tr></thead><tbody>' + o.items.map(function (it) { return it.kind === "coffee" ? "<tr><td>" + it.qty + "</td><td>" + sizeTxt(it.size) + " " + esc(B.BY[it.id].name) + "</td><td>" + esc(level(it)) + "</td><td>" + esc(it.grind) + "</td></tr>" : "<tr><td>" + it.qty + "</td><td>" + esc(it.name || it.id) + "</td><td></td><td></td></tr>"; }).join("") + "</tbody></table>" +
        '<p class="slip-note">Roasted ' + B.fmt(roastOf(o.roast).d, true) + ", packed by hand the same day. Best from day 4 to week 4 after roasting. Running low? Text Benny at 707-899-4183 and it goes on the next Monday or Wednesday roast.</p></section>";
    }).join("") || "<p>No ship orders.</p>";
  }
  $("#print-slips").addEventListener("click", function () { printMode("slips", slipsHTML(demand(CUR))); });

  // ---------- will-call ----------
  function renderWillcall(D) {
    var list = D.orders.filter(function (o) { return o.fulfil === "willcall"; });
    $("#wc-where").innerHTML = esc(B.pickup.name) + ", " + esc(B.pickup.addr) + ". Ready " + B.fmt(D.R.ship, true) + " from 10 am (illustrative).";
    if (!list.length) { $("#wc-list").innerHTML = '<p class="empty-s">No will-call pickups on this roast.</p>'; return; }
    $("#wc-list").innerHTML = '<ul class="shelf">' + list.map(function (o, i) {
      var st = statusOf(o), sent = S.sent["wc:" + o.no];
      return '<li class="' + (o.mine ? "mine" : "") + '"><span class="slot mono">' + "ABC"[Math.floor(i / 4)] + (i % 4 + 1) + '</span><div class="who">' + whoHTML(o) + '<span class="tiny">' + o.items.map(itemTxt).join(" + ") + " · " + (o.total ? "paid " + money(o.total) : "subscription") + '</span></div><div class="acts">' + stPill(st) +
        (st === "picked up" ? "" : '<button class="btn btn-sm btn-ghost" type="button" data-wct="' + esc(o.no) + '">' + (sent ? "Texted ✓" : "Text: ready") + '</button><button class="btn btn-sm" type="button" data-wcp="' + esc(o.no) + '">Picked up</button>') + "</div></li>";
    }).join("") + "</ul>";
  }
  $("#wc-list").addEventListener("click", function (e) {
    var t = e.target.closest("[data-wct]"), p = e.target.closest("[data-wcp]"), D = demand(CUR);
    if (t) { var o = D.orders.filter(function (x) { return x.no === t.dataset.wct; })[0]; compose("Ready for pickup", "To <b>" + esc(o.who.name) + "</b>", "Benny's Beans: Hi " + (o.who.first || "there") + ", your coffee (roasted " + B.fmt(D.R.d, true) + ") is on the will-call shelf at True Value Hardware, 15600 River Rd, Guerneville. Ask at the counter for order " + o.no + ". Reply STOP to opt out.", function () { S.sent["wc:" + o.no] = 1; save(); renderWillcall(D); B.toast("Pickup text composed (demo)"); }); }
    if (p) { S.status[p.dataset.wcp] = "picked up"; save(); renderWillcall(D); rendered.orders = false; B.toast("Marked picked up"); }
  });

  // ---------- market box ----------
  function renderMarketBox(D) {
    var mf = D.mf, pre = D.orders.filter(function (o) { return o.ch === "market" || (o.ch === "sub" && o.fulfil === "market"); });
    var preBy = {}; pre.forEach(function (o) { o.items.forEach(function (it) { if (it.kind === "coffee") preBy[it.id] = (preBy[it.id] || 0) + it.qty; }); });
    var tot1 = 0, tot5 = 0;
    $("#mb").innerHTML = '<p class="small"><b>' + esc(mf.m.name) + "</b> · " + B.fmt(mf.date, true) + " · " + esc(mf.m.hours) + '<br><span class="muted">' + B.DAY[D.R.d.getDay()] + "'s beans rest " + dd(D.R.d, mf.date) + " days and hit the table at their peak.</span></p>" +
      '<h3 class="h-s">Pre-orders · bag with names <span class="muted">(' + pre.length + ")</span></h3>" +
      (pre.length ? '<ul class="mini-list">' + pre.map(function (o) { return "<li><span>" + whoHTML(o) + "</span><span class=\"tiny\">" + o.items.map(itemTxt).join(" + ") + "</span></li>"; }).join("") + "</ul>" : '<p class="empty-s">No pre-orders yet.</p>') +
      '<h3 class="h-s">Bring for walk-ups</h3><table class="tbl mbx"><thead><tr><th>Coffee</th><th class="n">Pre-ord.</th><th class="n">Avg sold</th><th class="n">Bring 1 lb</th><th class="n">5 lb</th></tr></thead><tbody>' +
      B.COFFEES.map(function (c) { var b = D.br[c.id]; tot1 += b.b1; tot5 += b.b5; return "<tr><td>" + '<span class="sw" style="background:' + c.c + '"></span>' + esc(c.short) + '</td><td class="n">' + (preBy[c.id] || "–") + '</td><td class="n">' + b.avg.toFixed(1) + '</td><td class="n"><b>' + b.b1 + '</b></td><td class="n">' + (b.b5 || "–") + "</td></tr>"; }).join("") +
      '</tbody><tfoot><tr><td>Total</td><td class="n">' + pre.length + '</td><td></td><td class="n"><b>' + tot1 + '</b></td><td class="n">' + tot5 + "</td></tr></tfoot></table>" +
      '<p class="tiny">Walk-up stock = 6-week average + 15%, already in the batch plan as “Market stock”. Weather-agnostic on purpose: six weeks of averages already include the rainy ones.</p>';
  }

  // =====================================================================
  // ORDERS
  // =====================================================================
  var OF = { ch: "", st: "", q: "" };
  function allOrders() {
    var rs = PREV.slice(0, 3).concat(TODAYR ? [TODAYR] : [], [NEXT]), out = [];
    rs.forEach(function (R) { ordersFor(R).forEach(function (o) { out.push(o); }); });
    DEMO_ORDERS.forEach(function (o) { if (out.indexOf(o) < 0) out.push(o); });
    out = out.concat(DEMO_GIFTS);
    return out.sort(function (a, b) { return (b.mine ? 1 : 0) - (a.mine ? 1 : 0) || b.placed - a.placed; });
  }
  function renderOrders() {
    var all = allOrders();
    var chs = [["", "All"], ["web", "Web"], ["sub", "Subscription"], ["market", "Market"], ["wholesale", "Wholesale"], ["willcall", "Will-call"], ["samples", "Samples"]];
    $("#of-ch").innerHTML = chs.map(function (c) { var n = all.filter(function (o) { return !c[0] || o.ch === c[0]; }).length; return n || !c[0] ? '<button type="button" class="chip" aria-pressed="' + (OF.ch === c[0]) + '" data-ch="' + c[0] + '">' + c[1] + ' <span class="mono cnt">' + n + "</span></button>" : ""; }).join("");
    var q = OF.q.toLowerCase();
    var list = all.filter(function (o) {
      if (OF.ch && o.ch !== OF.ch) return false; if (OF.st && statusOf(o) !== OF.st) return false;
      if (q) { var hay = (o.no + " " + o.who.name + " " + o.items.map(function (it) { return it.kind === "coffee" ? B.BY[it.id].name + " " + it.grind + " " + it.roast : it.name || ""; }).join(" ")).toLowerCase(); if (hay.indexOf(q) < 0) return false; }
      return true;
    });
    $("#of-count").textContent = plural(list.length, "order") + " · last three roasts, " + (TODAYR ? "today, " : "") + "and the next one";
    $("#n-orders").textContent = all.filter(function (o) { return statusOf(o) === "new"; }).length;
    $("#of-list").innerHTML = list.length ? '<table class="tbl stack orders"><thead><tr><th>Order</th><th>Customer</th><th>Channel</th><th>Items</th><th>Roast</th><th class="n">Total</th><th>Status</th></tr></thead><tbody>' + list.slice(0, 120).map(function (o) {
      return '<tr class="' + (o.mine ? "mine" : "") + '"><td class="lead"><span class="mono ono">' + esc(o.no) + '</span><span class="tiny">' + B.fmt(o.placed) + " · " + tm(o.placed) + '</span></td><td data-l="Customer" class="who">' + whoHTML(o) + (o.sub ? '<span class="tiny">' + esc(o.sub) + "</span>" : "") + '</td><td data-l="Channel">' + chPill(o.ch) + '</td><td data-l="Items" class="small">' + o.items.map(itemTxt).join("<br>") + '</td><td data-l="Roast" class="mono small">' + (o.roast ? B.fmt(roastOf(o.roast).d) : "–") + '</td><td class="n" data-l="Total">' + (o.total ? money2(o.total) : o.ch === "samples" ? "free" : "–") + '</td><td data-l="Status">' + stPill(statusOf(o)) + "</td></tr>";
    }).join("") + "</tbody></table>" : '<p class="empty-s">No orders match. Clear a filter or search for something else.</p>';
  }
  $("#of-ch").addEventListener("click", function (e) { var b = e.target.closest("[data-ch]"); if (!b) return; OF.ch = b.dataset.ch; renderOrders(); var nb = $('#of-ch [data-ch="' + OF.ch + '"]'); if (nb) nb.focus(); });
  $("#of-st").addEventListener("change", function () { OF.st = this.value; renderOrders(); });
  $("#of-q").addEventListener("input", function () { OF.q = this.value.trim(); renderOrders(); });

  // =====================================================================
  // SUBSCRIPTIONS
  // =====================================================================
  function barChart(el, data, o) {
    // single-series vertical bars, inline SVG with a table fallback
    o = o || {}; var W = 560, H = 220, pl = 34, pb = 26, pt = 18, mx = o.max || Math.max.apply(null, data.map(function (d) { return d.v; })) * 1.12;
    var bw = (W - pl - 8) / data.length, ticks = o.ticks || [0, Math.round(mx / 2), Math.round(mx)];
    var y = function (v) { return pt + (H - pt - pb) * (1 - v / mx); };
    var svg = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(o.label) + '">' + ticks.map(function (t) { return '<line x1="' + pl + '" x2="' + W + '" y1="' + y(t) + '" y2="' + y(t) + '" class="gl"/><text x="' + (pl - 6) + '" y="' + (y(t) + 4) + '" class="ax" text-anchor="end">' + (o.fmt ? o.fmt(t) : t) + "</text>"; }).join("") +
      data.map(function (d, i) { var x = pl + i * bw + bw * .18, w = bw * .64, yy = y(d.v), h = Math.max(1, H - pb - yy); return '<g class="bg' + (d.hi ? " hi" : "") + '"><title>' + esc(d.k + ": " + (o.fmt ? o.fmt(d.v) : d.v)) + '</title><rect x="' + (pl + i * bw) + '" y="' + pt + '" width="' + bw + '" height="' + (H - pt - pb) + '" class="hit"/><path d="M' + x + " " + (H - pb) + "V" + (yy + 4) + "q0 -4 4 -4h" + (w - 8) + "q4 0 4 4V" + (H - pb) + 'z" class="b"/>' + (d.show ? '<text x="' + (x + w / 2) + '" y="' + (yy - 6) + '" class="vl" text-anchor="middle">' + (o.fmt ? o.fmt(d.v) : d.v) + "</text>" : "") + '<text x="' + (x + w / 2) + '" y="' + (H - 8) + '" class="ax" text-anchor="middle">' + esc(d.s != null ? d.s : d.k) + "</text></g>"; }).join("") + "</svg>";
    el.innerHTML = svg + '<details class="tbl-alt"><summary>Show as table</summary><table class="tbl"><thead><tr><th>' + esc(o.kh || "") + '</th><th class="n">' + esc(o.vh || "") + "</th></tr></thead><tbody>" + data.map(function (d) { return "<tr><td>" + esc(d.k) + '</td><td class="n">' + (o.fmt ? o.fmt(d.v) : d.v) + "</td></tr>"; }).join("") + "</tbody></table></details>";
  }
  function hbars(data, fmt) {
    var mx = Math.max.apply(null, data.map(function (d) { return d.v; }).concat([1]));
    return '<ul class="hb">' + data.map(function (d) { return "<li><span>" + d.k + '</span><span class="bar"><i style="width:' + (d.v / mx * 100).toFixed(1) + '%"></i></span><b class="mono">' + (fmt ? fmt(d.v) : d.v) + "</b></li>"; }).join("") + "</ul>";
  }
  function renderSubs() {
    var mrr = activeSubs.reduce(function (t, s) { return t + monthly(s); }, 0), nextR = SUBS.filter(function (s) { return renews(s, NEXT); });
    var paused = SUBS.filter(function (s) { return s.status === "paused"; }), mineSubs = DEMO_ORDERS.filter(function (o) { return o.ch === "sub"; });
    var act = activeSubs.length + mineSubs.length;
    $("#n-subs").textContent = act;
    $("#sub-kpis").innerHTML = [
      ["Active", act, mineSubs.length ? mineSubs.length + " from you, just now" : "+6 in the last 4 weeks"],
      ["MRR", money(mrr + mineSubs.reduce(function (t, o) { return t + o.total; }, 0)), "monthly recurring, sample"],
      ["Avg / sub", money(mrr / activeSubs.length) + "/mo", "≈ " + lb(activeSubs.reduce(function (t, s) { return t + s.size * 4.33 / s.every; }, 0) / activeSubs.length) + " a month"],
      ["Next roast", nextR.length - nextR.filter(function (s) { return skipping(s, NEXT); }).length, "renewals " + NEXT.label],
      ["Paused", paused.length, "auto-resume dates set"]
    ].map(kpi).join("");
    // 12-week history ending at today's count
    var r = rng(hash("subhist")), v = act, hist = [];
    for (var i = 0; i < 12; i++) { var wk = B.addDays(NOW, -7 * i); hist.unshift({ k: "Week of " + B.MON[wk.getMonth()] + " " + wk.getDate(), s: B.MON[wk.getMonth()] + " " + wk.getDate(), v: v, hi: i === 0, show: i === 0 || i === 11 }); v -= Math.max(0, Math.round(r() * 2.4 - .3)); }
    barChart($("#sub-chart"), hist.map(function (h, i) { h.s = i % 2 === 1 || i === 11 ? h.s : ""; return h; }), { label: "Active subscribers by week, last 12 weeks: from " + hist[0].v + " to " + hist[11].v, kh: "Week", vh: "Active subscribers", max: Math.ceil(act * 1.15 / 10) * 10, ticks: [0, 20, 40, 60].filter(function (t) { return t <= Math.ceil(act * 1.15 / 10) * 10; }) });
    $("#sub-chart").insertAdjacentHTML("beforeend", '<figcaption class="tiny">Active subscribers at the end of each week. Up ' + (hist[11].v - hist[0].v) + " in 12 weeks (sample).</figcaption>");
    // renewals next 4 roasts
    var rs = B.roastsAfter(4).map(function (x) { return roastOf(B.ymd(x.roast)); });
    $("#sub-renew").innerHTML = '<table class="tbl stack"><thead><tr><th>Roast</th><th class="n">Renewals</th><th class="n">Skipping</th><th class="n">Pounds</th><th class="n">Revenue</th></tr></thead><tbody>' + rs.map(function (R) {
      var due = SUBS.filter(function (s) { return renews(s, R); }), sk = due.filter(function (s) { return skipping(s, R); }), go = due.filter(function (s) { return !skipping(s, R); });
      return '<tr><td class="lead"><b>' + R.long + '</b></td><td class="n" data-l="Renewals">' + go.length + '</td><td class="n" data-l="Skipping">' + (sk.length || "–") + '</td><td class="n" data-l="Pounds">' + lb(go.reduce(function (t, s) { return t + s.size; }, 0)) + '</td><td class="n" data-l="Revenue">' + money(go.reduce(function (t, s) { return t + s.price; }, 0)) + "</td></tr>";
    }).join("") + '</tbody></table><p class="tiny">Renewals charge the night before the roast. Customers can skip or swap the coffee any time before cutoff.</p>';
    // churn risk
    var risk = SUBS.filter(function (s) { return s.skips >= 2 || s.pausedDays >= 30 || s.cardExp; });
    $("#sub-risk").innerHTML = '<ul class="rows">' + risk.map(function (s) {
      var why = s.skips >= 2 ? "Skipped 2 in a row · “" + s.skipWhy + "”" : s.pausedDays >= 30 ? "Paused " + s.pausedDays + " days" : "Card expires this month";
      var sent = S.sent["risk:" + s.id];
      return '<li><div><b>' + esc(s.p.name) + '</b> <span class="smp">sample</span><span class="tiny">' + esc(subDesc(s)) + " · " + why + '</span></div><button class="btn btn-sm ' + (sent ? "btn-ghost" : "") + '" type="button" data-risk="' + s.id + '">' + (sent ? "Sent ✓" : s.cardExp ? "Send card update link" : "Send check-in text") + "</button></li>";
    }).join("") + "</ul>";
    // skips
    var sk = SUBS.filter(function (s) { return s.skips === 1 || s.status === "paused"; });
    $("#sub-skips").innerHTML = '<ul class="rows">' + sk.map(function (s) { return "<li><div><b>" + esc(s.p.name) + '</b> <span class="smp">sample</span><span class="tiny">' + esc(subDesc(s)) + "</span></div>" + (s.status === "paused" ? '<span class="st st-packed">Paused ' + s.pausedDays + "d</span>" : '<span class="st st-new">Skips ' + NEXT.label + "</span>") + "</li>"; }).join("") + "</ul>";
    // mix
    var mix = {}; activeSubs.forEach(function (s) { var k = (s.size === 2 ? "2 × 1 lb" : s.size + " lb") + " every " + (s.every === 4 ? "4 weeks" : s.every === 1 ? "week" : "2 weeks"); mix[k] = (mix[k] || 0) + 1; });
    $("#sub-mix").innerHTML = hbars(Object.keys(mix).sort(function (a, b) { return mix[b] - mix[a]; }).map(function (k) { return { k: esc(k), v: mix[k] }; }), function (v) { return plural(v, "sub"); });
  }
  function subDesc(s) { return (s.size === 2 ? "2 × 1 lb" : s.size + " lb") + " " + (s.coffee === "rotate" ? "Roaster's pick" : B.BY[s.coffee].short) + " every " + plural(s.every, "wk") + " · " + (s.roast === RC ? "RC" : s.roast); }
  function kpi(k) { return '<div class="kpi"><span>' + k[0] + "</span><b>" + k[1] + "</b><small>" + k[2] + "</small></div>"; }
  $("#sub-risk").addEventListener("click", function (e) {
    var b = e.target.closest("[data-risk]"); if (!b) return; var s = SUBS.filter(function (x) { return x.id === b.dataset.risk; })[0];
    var msg = s.cardExp ? "Benny's Beans: Hi " + s.p.first + ", the card on your coffee subscription expires this month. Update it in 20 seconds so your next bag roasts on time: russianriverroastery.com/account Reply STOP to opt out."
      : "Benny's Beans: Hi " + s.p.first + ", Benny here. Noticed you've skipped a couple. Want a different coffee, a smaller bag or a longer gap? Just reply and I'll set it up. Reply STOP to opt out.";
    compose(s.cardExp ? "Card update" : "Check-in", "To <b>" + esc(s.p.name) + "</b> (sample) · " + esc(subDesc(s)), msg, function () { S.sent["risk:" + s.id] = 1; save(); renderSubs(); B.toast("Composed. In the live system this sends from Benny's number."); });
  });

  // =====================================================================
  // GREEN COFFEE
  // =====================================================================
  function renderGreen() {
    WEEKLY = null; var w = weekly(), alerts = [];
    var rows = GREEN.map(function (g) {
      var c = B.BY[g.id], h = onHand(g), cover = h / w[g.id], rp = g.lead + 1, st = cover < rp ? "low" : cover < rp + 1.5 ? "watch" : "ok";
      if (st === "low") alerts.push('<div class="al"><b>Reorder ' + esc(c.short) + ": " + cover.toFixed(1) + " weeks left.</b> " + g.lead + "-week lead time from " + esc(g.sup) + ". Suggest " + lb(Math.ceil(w[g.id] * 8 / 10) * 10) + " (8 weeks) ≈ " + money(Math.ceil(w[g.id] * 8 / 10) * 10 * g.cost) + ".</div>");
      return '<tr><td class="lead"><div class="cf">' + thumb(g.id) + "<div><b>" + esc(c.short) + '</b><span class="lv">' + esc(c.origin + " · " + c.detail) + "</span></div></div></td>" +
        '<td class="n" data-l="On hand">' + lb(h) + '</td><td class="n" data-l="Use / wk">' + lb(w[g.id]) + "</td>" +
        '<td data-l="Cover" class="cov"><div class="meter m-' + st + '" role="meter" aria-valuemin="0" aria-valuemax="12" aria-valuenow="' + cover.toFixed(1) + '" aria-label="' + esc(c.short) + ' weeks of cover"><i style="width:' + Math.min(100, cover / 12 * 100) + '%"></i><s style="left:' + (rp / 12 * 100) + '%"></s></div><span class="mono small">' + cover.toFixed(1) + ' wk</span> <span class="st ' + (st === "low" ? "st-roasting" : st === "watch" ? "st-new" : "st-shipped") + '">' + (st === "low" ? "Reorder" : st === "watch" ? "Watch" : "OK") + "</span></td>" +
        '<td data-l="Reorder at" class="small">' + rp + ' wk</td><td data-l="Supplier" class="small">' + esc(g.sup) + ' <span class="smp">illustrative</span></td><td class="n" data-l="Cost / lb">' + money2(g.cost) + "</td></tr>";
    }).join("");
    $("#gr-alerts").innerHTML = alerts.join("");
    $("#n-green").textContent = alerts.length || "";
    $("#gr-table").innerHTML = '<table class="tbl stack green"><thead><tr><th>Origin</th><th class="n">On hand</th><th class="n">Use / wk</th><th>Weeks of cover</th><th>Reorder at</th><th>Supplier</th><th class="n">Green $/lb</th></tr></thead><tbody>' + rows + '</tbody></table><p class="tiny">Weekly use = green needed for the next Monday + Wednesday plans. Half-Caff draws 50/50 from Chiapas Decaf and Colombia green. The tick on each meter is the reorder point (lead time + 1 week of safety).</p>';
    // calculator
    var sel = $("#c-coffee"); if (!sel.options.length) { sel.innerHTML = GREEN.map(function (g) { return '<option value="' + g.id + '">' + esc(B.BY[g.id].short) + "</option>"; }).join("") + '<option value="halfcaff">Half-Caff (50/50)</option>'; setCalc("ethiopia"); }
    calc();
  }
  var GC = {}; GREEN.forEach(function (g) { GC[g.id] = g.cost; }); GC.halfcaff = (GC.decaf + GC.colombia) / 2;
  function setCalc(id) { $("#c-green").value = GC[id].toFixed(2); $("#c-shrink").value = S.shrink; $("#c-pk1").value = "0.95"; $("#c-pk5").value = "2.10"; $("#c-energy").value = "0.35"; }
  $("#c-coffee").addEventListener("change", function () { $("#c-green").value = GC[this.value].toFixed(2); calc(); });
  ["c-green", "c-shrink", "c-pk1", "c-pk5", "c-energy", "c-fees"].forEach(function (id) { $("#" + id).addEventListener("input", calc); });
  function calc() {
    var g = parseFloat($("#c-green").value) || 0, sh = Math.min(40, parseFloat($("#c-shrink").value) || 0) / 100, p1 = parseFloat($("#c-pk1").value) || 0, p5 = parseFloat($("#c-pk5").value) || 0, en = parseFloat($("#c-energy").value) || 0, fees = $("#c-fees").checked;
    var perLb = g / (1 - sh) + en;
    var col = function (name, price, lbs, pk) { var cof = perLb * lbs, fee = fees ? price * .029 + .3 : 0, cost = cof + pk + fee, m = price - cost; return { name: name, price: price, cof: cof, pk: pk, fee: fee, cost: cost, m: m, pct: m / price * 100 }; };
    var cols = [col("1 lb retail", 20, 1, p1 + .12), col("5 lb retail", 80, 5, p5 + .12), col("5 lb wholesale", 65, 5, p5 + .12)];
    $("#c-out").innerHTML = '<div class="cpl"><span class="label">Cost per roasted lb</span><b class="mono">' + money2(perLb) + '</b><span class="tiny">' + money2(g) + " green ÷ (1 − " + (sh * 100).toFixed(1).replace(/\.0$/, "") + "%) + " + money2(en) + " energy</span></div>" +
      '<table class="tbl calc-t"><thead><tr><th></th>' + cols.map(function (c) { return '<th class="n">' + c.name + "</th>"; }).join("") + "</tr></thead><tbody>" +
      [["Price", "price"], ["Roasted coffee", "cof"], ["Bag + label", "pk"], ["Card fees", "fee"], ["Total cost", "cost"]].map(function (r) { return "<tr" + (r[1] === "cost" ? ' class="sum"' : "") + "><td>" + r[0] + "</td>" + cols.map(function (c) { return '<td class="n">' + money2(c[r[1]]) + "</td>"; }).join("") + "</tr>"; }).join("") +
      '<tr class="mg"><td>Margin</td>' + cols.map(function (c) { return '<td class="n"><b>' + money2(c.m) + "</b><span>" + c.pct.toFixed(0) + "%</span></td>"; }).join("") + "</tr></tbody></table>" +
      '<p class="tiny">Excludes shipping (free over $60) and Benny\'s time. Wholesale $65 / 5 lb is an illustrative tier.</p>';
  }

  // =====================================================================
  // MARKETS
  // =====================================================================
  function renderMarkets() {
    var nm = B.nextMarket(), m = nm.m, mymd = B.ymd(nm.start), fr = roastOf(feedingRoast(mymd));
    var pre = ordersFor(fr).filter(function (o) { return (o.ch === "market" || o.fulfil === "market") && o.market === m.id; }).concat(DEMO_ORDERS.filter(function (o) { return o.ch === "market" && o.market === m.id && o.mdate === mymd && o.roast !== fr.ymd; }));
    var now = B.now(), live = nm.live;
    $("#mk-next").innerHTML = '<div><p class="eyebrow">' + (live ? "Live now" : "Next market") + "</p><h2>" + esc(m.name) + '</h2><p class="mk-when"><b>' + B.fmt(nm.start, true) + "</b> · " + esc(m.hours) + "</p></div>" +
      '<div class="mk-cd">' + (live ? '<span class="livedot"></span><b>Open</b><span>closes ' + tm(nm.end) + "</span>" : "<b>" + B.left(nm.start - now) + "</b><span>until open</span>") + "</div>" +
      '<div class="mk-r"><span>Stock from</span><b>' + fr.long + ' roast</b><a class="lnk-l" href="' + m.map + '" target="_blank" rel="noopener">Map ↗</a></div>';
    $("#mk-pre-n").textContent = plural(pre.length, "pre-order") + " · " + plural(pre.reduce(function (t, o) { return t + o.items.reduce(function (a, i) { return a + (i.qty || 1); }, 0); }, 0), "bag");
    $("#n-markets").textContent = pre.length || "";
    $("#mk-pre").innerHTML = pre.length ? '<ul class="rows">' + pre.map(function (o) { return "<li><div>" + whoHTML(o) + '<span class="tiny">' + o.items.map(itemTxt).join(" + ") + '</span></div><span class="mono small">' + (o.total ? money(o.total) + " paid" : "sub") + "</span></li>"; }).join("") + "</ul>" : '<p class="empty-s">No pre-orders yet.</p>';
    var br = bringFor(m), t1 = 0, t5 = 0;
    $("#mk-bring").innerHTML = '<table class="tbl"><thead><tr><th>Coffee</th><th class="n">Avg / wk</th><th class="n">Bring 1 lb</th><th class="n">5 lb</th></tr></thead><tbody>' + B.COFFEES.map(function (c) { var b = br[c.id]; t1 += b.b1; t5 += b.b5; return '<tr><td><span class="sw" style="background:' + c.c + '"></span>' + esc(c.short) + '</td><td class="n">' + b.avg.toFixed(1) + '</td><td class="n"><b>' + b.b1 + '</b></td><td class="n">' + (b.b5 || "–") + "</td></tr>"; }).join("") + '</tbody><tfoot><tr><td>Total</td><td></td><td class="n"><b>' + t1 + '</b></td><td class="n">' + t5 + '</td></tr></tfoot></table><p class="tiny">Plus the pre-orders, bagged and named. Also pack: card reader, change float ($100 in 5s and 1s), coasters, sample cups.</p>';
    // history
    var hm = MK[HISTM] || m, h = marketHist(hm);
    $("#mk-hist").innerHTML = '<div class="seg seg-sm" role="group" aria-label="Market">' + B.markets.map(function (x) { return '<button type="button" data-hm="' + x.id + '" aria-pressed="' + (x === hm) + '">' + esc(x.town) + "</button>"; }).join("") + '</div><div class="tscroll"><table class="tbl hist"><thead><tr><th>Coffee</th>' + h.slice().reverse().map(function (x) { return '<th class="n">' + B.MON[x.d.getMonth()] + " " + x.d.getDate() + (x.mine ? " *" : "") + "</th>"; }).join("") + "</tr></thead><tbody>" +
      B.COFFEES.map(function (c) { return '<tr><td><span class="sw" style="background:' + c.c + '"></span>' + esc(c.short) + "</td>" + h.slice().reverse().map(function (x) { var s = x.sold[c.id] || [0, 0]; return '<td class="n">' + s[0] + (s[1] ? '<sup>+' + s[1] + "×5</sup>" : "") + "</td>"; }).join("") + "</tr>"; }).join("") +
      '<tr class="sum"><td>Revenue</td>' + h.slice().reverse().map(function (x) { return '<td class="n">' + money(x.cash + x.card) + "</td>"; }).join("") + '</tr></tbody></table></div><p class="tiny">' + esc(hm.name) + (h.some(function (x) { return x.mine; }) ? " · * logged by you in this browser" : "") + "</p>";
    renderLog();
  }
  var HISTM = null;
  $("#mk-hist").addEventListener("click", function (e) { var b = e.target.closest("[data-hm]"); if (!b) return; HISTM = b.dataset.hm; renderMarkets(); var nb = $('#mk-hist [data-hm="' + HISTM + '"]'); if (nb) nb.focus(); });
  function renderLog() {
    var opts = []; B.markets.forEach(function (m) { pastMarketDates(m, 2).forEach(function (d) { opts.push({ m: m, d: d }); }); var nm = B.nextMarket(); if (nm && nm.m === m && nm.live) opts.unshift({ m: m, d: day0(nm.start) }); });
    opts.sort(function (a, b) { return b.d - a.d; });
    var f = $("#mk-log");
    f.innerHTML = '<label class="field mk-which"><span>Market</span><select id="lg-which">' + opts.map(function (o, i) { return '<option value="' + i + '">' + esc(o.m.town) + " · " + B.fmt(o.d, true) + "</option>"; }).join("") + "</select></label>" +
      '<div class="lg-grid">' + B.COFFEES.map(function (c) { return '<div class="lg-c"><span class="lg-n"><span class="sw" style="background:' + c.c + '"></span>' + esc(c.short) + '</span>' + step(c.id + "-1", "1 lb") + step(c.id + "-5", "5 lb") + "</div>"; }).join("") +
      '<div class="lg-c"><span class="lg-n">Coasters</span>' + step("coasters", "sold") + "</div></div>" +
      '<div class="lg-money"><label class="field"><span>Cash counted $</span><input type="number" id="lg-cash" min="0" step="1" inputmode="numeric" value="0"></label><label class="field"><span>Card total $</span><input type="number" id="lg-card" min="0" step="1" inputmode="numeric" value="0"></label><div class="lg-tally" id="lg-tally" aria-live="polite"></div></div>' +
      '<div class="row"><button class="btn btn-red" type="submit">Save tally</button><span class="tiny">Feeds next week\'s “what to bring”.</span></div>';
    f._opts = opts; tally();
  }
  function step(k, l) { return '<span class="stp"><button type="button" data-st="' + k + '" data-d="-1" aria-label="One less ' + l + '">−</button><input type="number" min="0" value="0" id="st-' + k + '" aria-label="' + esc(k.split("-")[0]) + " " + l + '"><button type="button" data-st="' + k + '" data-d="1" aria-label="One more ' + l + '">+</button><i>' + l + "</i></span>"; }
  function tally() {
    var exp = 0; B.COFFEES.forEach(function (c) { exp += (+$("#st-" + c.id + "-1").value || 0) * 20 + (+$("#st-" + c.id + "-5").value || 0) * 80; }); exp += (+$("#st-coasters").value || 0) * 12;
    var got = (+$("#lg-cash").value || 0) + (+$("#lg-card").value || 0), diff = got - exp;
    $("#lg-tally").innerHTML = '<span>Expected <b class="mono">' + money(exp) + '</b></span><span>Counted <b class="mono">' + money(got) + '</b></span><span class="' + (Math.abs(diff) < 1 ? "ok" : "off") + '">' + (exp === 0 && got === 0 ? "Enter what sold" : Math.abs(diff) < 1 ? "Balanced ✓" : (diff > 0 ? "Over " : "Short ") + money(Math.abs(diff))) + "</span>";
  }
  $("#mk-log").addEventListener("click", function (e) { var b = e.target.closest("[data-st]"); if (!b) return; var i = $("#st-" + b.dataset.st); i.value = Math.max(0, (+i.value || 0) + +b.dataset.d); tally(); });
  $("#mk-log").addEventListener("input", tally);
  $("#mk-log").addEventListener("submit", function (e) {
    e.preventDefault(); var o = this._opts[+$("#lg-which").value], sold = {};
    B.COFFEES.forEach(function (c) { sold[c.id] = [+$("#st-" + c.id + "-1").value || 0, +$("#st-" + c.id + "-5").value || 0]; });
    var ymd = B.ymd(o.d); S.marketLog = S.marketLog.filter(function (l) { return !(l.market === o.m.id && l.date === ymd); });
    S.marketLog.push({ market: o.m.id, date: ymd, sold: sold, coasters: +$("#st-coasters").value || 0, cash: +$("#lg-cash").value || 0, card: +$("#lg-card").value || 0 }); save();
    CACHE = {}; WEEKLY = null; rendered.roastday = false; rendered.insights = false; rendered.green = false;
    HISTM = o.m.id; renderMarkets(); B.toast("Tally saved for " + esc(o.m.town) + " " + B.fmt(o.d) + ". History and next week's bring list updated.");
  });

  // =====================================================================
  // WHOLESALE
  // =====================================================================
  function renderWholesale() {
    var wk = ACCTS.reduce(function (t, a) { return t + acctWeekly(a); }, 0), rev = ACCTS.reduce(function (t, a) { return t + acctWeekly(a) * a.ppl * 4.33; }, 0);
    var inv = invoices(), overdue = inv.filter(function (i) { return i.st === "overdue"; }), samples = ALL_SAMPLES(), pendS = samples.filter(function (s) { return !s.approved; });
    $("#n-wholesale").textContent = (overdue.length + pendS.length + DEMO_APPS.filter(function (a) { return !S.apps[a.k]; }).length) || "";
    $("#ws-kpis").innerHTML = [["Accounts", ACCTS.length, "4 rentals, 2 cafés, 1 restaurant, 1 office"], ["Pounds / week", lb(wk), "standing orders"], ["Monthly", money(rev), "wholesale revenue, sample"], ["Overdue", money(overdue.reduce(function (t, i) { return t + i.amt; }, 0)), plural(overdue.length, "invoice")]].map(kpi).join("");
    $("#ws-apps").innerHTML = DEMO_APPS.map(function (a) {
      var d = a.d, ok = S.apps[a.k];
      return '<div class="pn app mine"><div class="pn-h"><div><span class="you">You, ' + ago(a.at) + '</span><h2>New application: ' + esc(d.business || "Your business") + '</h2></div>' + (ok ? '<span class="st st-shipped">Approved</span>' : '<button class="btn btn-red btn-sm" type="button" data-app="' + a.k + '">Approve · set standing order</button>') + "</div>" +
        '<dl class="kv"><dt>Type</dt><dd>' + esc(d.type || "") + "</dd><dt>Contact</dt><dd>" + esc([d.contact, d.email, d.phone].filter(Boolean).join(" · ")) + "</dd><dt>Volume</dt><dd>" + esc(d.lbsPerWeek || "?") + " lb / week</dd><dt>Coffees</dt><dd>" + esc((d.coffees || []).map(function (c) { return B.BY[c] ? B.BY[c].short : c; }).join(", ") || "Wants a recommendation") + "</dd>" + (d.notes ? "<dt>Notes</dt><dd>" + esc(d.notes) + "</dd>" : "") + "</dl></div>";
    }).join("");
    $("#ws-acc").innerHTML = '<table class="tbl stack"><thead><tr><th>Account</th><th>Type</th><th>Roast day</th><th>Standing order</th><th class="n">lb / wk</th><th class="n">$/lb</th></tr></thead><tbody>' + ACCTS.map(function (a) {
      var R = NEXT.d.getDay() === a.day ? NEXT : NEXT2, its = acctItems(a, R);
      return '<tr><td class="lead"><b>' + esc(a.name) + '</b> <span class="smp">sample</span><span class="tiny">' + esc(a.town) + " · Net " + a.terms + '</span></td><td data-l="Type">' + esc(a.type) + '</td><td data-l="Roast day">' + B.DAY[a.day] + (a.every === 2 ? " · every other" : "") + '</td><td data-l="Order" class="small">' + (a.rental ? "<b>" + plural(its.length ? its[0].qty : 0, "welcome bag") + "</b> this week (check-ins) · " + esc(B.BY[a.rental.coffee].short) : its.map(itemTxt).join("<br>")) + '</td><td class="n" data-l="lb / wk">' + lb(acctWeekly(a)) + '</td><td class="n" data-l="$/lb">' + money2(a.ppl) + "</td></tr>";
    }).join("") + '</tbody></table><p class="tiny">Rental welcome bags flex with each week\'s check-ins, synced from the booking calendar (illustrative). Wholesale tiers are illustrative; Benny quotes on request.</p>';
    $("#ws-standing").innerHTML = [1, 3].map(function (dy) {
      var R = NEXT.d.getDay() === dy ? NEXT : NEXT2, list = ACCTS.filter(function (a) { return acctDue(a, R); });
      return '<h3 class="h-s">' + R.long + ' <span class="muted">· ' + lb(list.reduce(function (t, a) { return t + acctLbs(a, R); }, 0)) + '</span></h3><ul class="rows">' + list.map(function (a) { return "<li><div><b>" + esc(a.name) + '</b><span class="tiny">' + acctItems(a, R).map(itemTxt).join(" + ") + '</span></div><span class="mono small">' + lb(acctLbs(a, R)) + "</span></li>"; }).join("") + "</ul>";
    }).join("");
    $("#ws-inv").innerHTML = '<ul class="rows">' + inv.map(function (i) {
      return '<li><div><b>' + esc(i.a.name) + ' <span class="mono small">' + i.no + '</span></b><span class="tiny">' + money2(i.amt) + " · due " + B.fmt(i.due) + (i.st === "overdue" ? " · " + plural(dd(i.due, NOW), "day") + " late" : "") + '</span></div><div class="acts">' + (i.st === "paid" ? '<span class="st st-shipped">Paid</span>' : '<span class="st ' + (i.st === "overdue" ? "st-roasting" : "st-new") + '">' + (i.st === "overdue" ? "Overdue" : "Due") + '</span><button class="btn btn-sm btn-ghost" type="button" data-rem="' + i.no + '">Reminder</button><button class="btn btn-sm" type="button" data-paid="' + i.no + '">Paid</button>') + "</div></li>";
    }).join("") + "</ul>";
    $("#ws-samples").innerHTML = '<ul class="rows">' + samples.map(function (s) {
      var shipped = S.sent["ship:" + s.id];
      return '<li class="' + (s.mine ? "mine" : "") + '"><div><b>' + esc(s.business) + (s.town ? ", " + esc(s.town) : "") + "</b> " + (s.mine ? '<span class="you">You, ' + ago(s.at) + "</span>" : '<span class="smp">sample</span>') + '<span class="tiny">' + esc(s.contact) + " · " + s.coffees.map(function (c) { return esc(B.BY[c].short); }).join(", ") + " · 4 oz each</span></div>" +
        (shipped ? '<span class="st st-shipped">Shipped</span>' : s.approved ? '<span class="st st-new">On ' + NEXT.label + ' roast</span>' : '<button class="btn btn-sm btn-red" type="button" data-smp="' + s.id + '">Send samples</button>') + "</li>";
    }).join("") + "</ul>";
  }
  function invoices() {
    var r = rng(hash("inv" + weekIdx(NOW))), out = [], n = 4100 + weekIdx(NOW) % 500 * 6;
    ACCTS.forEach(function (a, k) {
      [1, 2].forEach(function (w) {
        var issued = B.addDays(NOW, -7 * w - int(r, 0, 2)), due = B.addDays(issued, a.terms), amt = Math.round(acctWeekly(a) * a.ppl * (a.every === 2 ? 2 : 1));
        var no = "INV-" + (n + k * 2 + w), late = w === 2 && (k === 2 || k === 4);
        if (late) due = B.addDays(day0(NOW), -int(r, 4, 9));
        var st = S.paid[no] ? "paid" : late ? "overdue" : due < day0(NOW) ? "paid" : "due";
        if (amt > 0 && (st !== "paid" || w === 1)) out.push({ no: no, a: a, amt: amt, due: due, st: st });
      });
    });
    return out.sort(function (x, y) { return ({ overdue: 0, due: 1, paid: 2 })[x.st] - ({ overdue: 0, due: 1, paid: 2 })[y.st] || x.due - y.due; }).slice(0, 8);
  }
  $("#v-wholesale").addEventListener("click", function (e) {
    var a = e.target.closest("[data-app]"), rm = e.target.closest("[data-rem]"), pd = e.target.closest("[data-paid]"), sm = e.target.closest("[data-smp]");
    if (a) { S.apps[a.dataset.app] = 1; save(); renderWholesale(); B.toast("Approved. Standing order drafted for their roast day (demo)."); }
    if (pd) { S.paid[pd.dataset.paid] = 1; save(); renderWholesale(); B.toast("Marked paid"); }
    if (rm) { var i = invoices().filter(function (x) { return x.no === rm.dataset.rem; })[0]; compose("Invoice reminder", "To <b>" + esc(i.a.name) + "</b> (sample) · by email", "Hi! Friendly nudge from Benny's Beans: invoice " + i.no + " for " + money2(i.amt) + " was due " + B.fmt(i.due, true) + ". Pay by card or ACH here: russianriverroastery.com/pay/" + i.no + "\n\nThanks for pouring our coffee.\nBenny · 707-899-4183", function () { B.toast("Reminder composed (demo, nothing sent)"); }, "Send reminder (demo)"); }
    if (sm) { S.samples[sm.dataset.smp] = 1; save(); CACHE = {}; rendered.roastday = false; renderWholesale(); B.toast("Samples added to " + NEXT.long + "'s roast as 4 oz bags. They're in the batch plan and ship list."); }
  });

  // =====================================================================
  // CUSTOMERS & TEXTS
  // =====================================================================
  var LOWYOU = null;
  function lowList() {
    var r = rng(hash("low" + TODAY)), out = [];
    PEOPLE.slice(0, 60).forEach(function (p) {
      var daysAgo = int(r, 6, 34), size = r() < .1 ? 5 : 1, id = wpick(r, CW), last = B.addDays(day0(NOW), -daysAgo);
      var out_ = B.addDays(last, Math.round(size / (0.06 * p.drinkers))), until = dd(NOW, out_);
      if (until >= -4 && until <= 6) out.push({ p: p, id: id, size: size, last: last, out: out_, until: until });
    });
    DEMO_ORDERS.filter(function (o) { return o.ch === "web" || o.ch === "willcall"; }).slice(0, 1).forEach(function (o) {
      var it = o.items.filter(function (i) { return i.kind === "coffee"; })[0]; if (!it) return; var R = roastOf(o.roast), o2 = B.addDays(R.d, Math.round(it.size * it.qty / .06) + 3);
      var mx = { p: { name: o.who.name, first: o.who.first, drinkers: 1, sms: true }, id: it.id, size: it.size * it.qty, last: R.d, out: o2, until: dd(NOW, o2), mine: o }; if (mx.until <= 6) out.unshift(mx); else LOWYOU = mx;
    });
    return out.sort(function (a, b) { return !!b.mine - !!a.mine || a.until - b.until; }).slice(0, 12);
  }
  function lowText(x) { return "Benny's Beans: Hi " + x.p.first + ", by our math your " + B.BY[x.id].short + " is about gone. Want another " + sizeTxt(x.size > 1 && x.size < 5 ? 1 : x.size) + " on the " + B.DAY[NEXT.d.getDay()] + " roast? Reply YES and it's roasted " + B.fmt(NEXT.d) + ", shipped " + B.fmt(NEXT.ship) + ". Reply STOP to opt out."; }
  function renderCustomers() {
    var L = lowList();
    $("#low-n").textContent = plural(L.length, "customer") + " to nudge";
    $("#n-customers").textContent = L.filter(function (x) { return !S.sent["low:" + x.p.name]; }).length || "";
    $("#low-list").innerHTML = '<table class="tbl stack"><thead><tr><th>Customer</th><th>Last bag</th><th>Ordered</th><th>Runs out</th><th><span class="sr">Action</span></th></tr></thead><tbody>' + L.map(function (x, i) {
      var sent = S.sent["low:" + x.p.name];
      return '<tr class="' + (x.mine ? "mine" : "") + '"><td class="lead who"><b>' + esc(x.p.name) + "</b> " + (x.mine ? '<span class="you">You</span>' : '<span class="smp">sample</span>') + '<span class="tiny">' + plural(x.p.drinkers, "drinker") + (x.p.sms ? " · texts OK" : " · email only") + '</span></td><td data-l="Last bag">' + thumb(x.id, x.size) + " " + sizeTxt(x.size) + " " + esc(B.BY[x.id].short) + '</td><td data-l="Ordered" class="mono small">' + B.fmt(x.last) + '</td><td data-l="Runs out"><b class="' + (x.until <= 0 ? "red" : "") + '">' + (x.until < 0 ? "~" + plural(-x.until, "day") + " ago" : x.until === 0 ? "today" : "in " + plural(x.until, "day")) + '</b><span class="tiny">' + B.fmt(x.out) + '</span></td><td class="act"><button class="btn btn-sm ' + (sent ? "btn-ghost" : "btn-red") + '" type="button" data-low="' + i + '">' + (sent ? "Sent ✓" : x.p.sms ? "Send reorder text" : "Send reorder email") + "</button></td></tr>";
    }).join("") + "</tbody></table>" + (LOWYOU ? '<p class="tiny you-note"><span class="you">You</span> ' + esc(LOWYOU.p.name) + ": your " + sizeTxt(LOWYOU.size) + " " + esc(B.BY[LOWYOU.id].short) + " roasts " + B.fmt(LOWYOU.last) + ". At one drinker that lasts until about " + B.fmt(LOWYOU.out, true) + ", so the nudge goes out that week.</p>" : "");
    // reviews: orders shipped from the roast ~1 week ago (arrived ~5 days ago)
    var R = PREV.filter(function (r) { var a = dd(B.addDays(r.ship, 2), NOW); return a >= 4 && a <= 7; })[0] || PREV[2];
    var rv = ordersFor(R).filter(function (o) { return o.ch === "web" || o.ch === "sub"; }).slice(0, 6);
    $("#rev-list").innerHTML = '<p class="small muted">Shipped ' + B.fmt(R.ship) + ", arrived about " + B.fmt(B.addDays(R.ship, 2)) + '. One ask, no follow-ups. The link goes straight to Benny\'s Google review form.</p><ul class="rows">' + rv.map(function (o) {
      var sent = S.sent["rev:" + o.no];
      return '<li><div>' + whoHTML(o) + '<span class="tiny">' + o.items.filter(function (i) { return i.kind === "coffee"; }).map(itemTxt).join(" + ") + '</span></div><button class="btn btn-sm ' + (sent ? "btn-ghost" : "") + '" type="button" data-rev="' + esc(o.no) + '" data-r="' + R.ymd + '">' + (sent ? "Asked ✓" : "Ask for review") + "</button></li>";
    }).join("") + "</ul>";
    renderBroadcast();
  }
  $("#low-list").addEventListener("click", function (e) {
    var b = e.target.closest("[data-low]"); if (!b) return; var x = lowList()[+b.dataset.low];
    compose(x.p.sms ? "Reorder text" : "Reorder email", "To <b>" + esc(x.p.name) + "</b>" + (x.mine ? " (you)" : " (sample)") + " · est. out " + B.fmt(x.out), lowText(x), function () { S.sent["low:" + x.p.name] = 1; save(); renderCustomers(); B.toast("Composed. Replies of YES drop straight into the next roast."); });
  });
  $("#rev-list").addEventListener("click", function (e) {
    var b = e.target.closest("[data-rev]"); if (!b) return; var o = ordersFor(roastOf(b.dataset.r)).filter(function (x) { return x.no === b.dataset.rev; })[0];
    var c = o.items.filter(function (i) { return i.kind === "coffee"; })[0];
    compose("Review request", "To <b>" + esc(o.who.name) + "</b> (sample)", "Benny's Beans: Hi " + o.who.first + ", hope the " + (c ? B.BY[c.id].short : "coffee") + " is treating you well. If it earned it, a quick Google review helps a one-person roaster more than you'd think: russianriverroastery.com/review Reply STOP to opt out.", function () { S.sent["rev:" + o.no] = 1; save(); renderCustomers(); B.toast("Review request composed (demo)"); });
  });
  var BC_EMAIL = 318, BC_SMS = 142;
  function renderBroadcast() {
    var f = $("#bc");
    if (!f.dataset.ready) {
      f.dataset.ready = 1;
      f.innerHTML = '<div class="form-grid"><label class="field"><span>Coffee</span><select id="bc-c">' + B.COFFEES.map(function (c) { return '<option value="' + c.id + '">' + esc(c.short) + "</option>"; }).join("") + '</select></label><label class="field"><span>Send to</span><select id="bc-a"><option value="email">Roast-day email list</option><option value="sms">SMS opted-in</option><option value="both">Both</option></select></label>' +
        '<label class="field full"><span>Message</span><textarea id="bc-m" rows="5"></textarea></label></div><p class="bc-aud" id="bc-aud" aria-live="polite"></p><div class="bc-prev" id="bc-prev"></div><div class="row"><button class="btn btn-red" type="submit">Schedule for ' + B.DS[NEXT.d.getDay()] + ' 7 am</button><span class="tiny">Goes out as the first batch drops.</span></div>';
      var fill = function () { var c = B.BY[$("#bc-c").value], sms = $("#bc-a").value === "sms"; $("#bc-m").value = "New on the roaster: " + c.name + ". " + c.notes.slice(0, 3).join(", ") + ". Roasting " + NEXT.long + "; order by 11:59 pm the night before and it ships " + B.fmt(NEXT.ship) + ". russianriverroastery.com/coffee/?c=" + c.id + (sms ? " Reply STOP to opt out." : ""); bcAud(); };
      $("#bc-c").addEventListener("change", fill); $("#bc-a").addEventListener("change", fill); $("#bc-m").addEventListener("input", bcAud); fill();
      f.addEventListener("submit", function (e) { e.preventDefault(); B.toast("Scheduled for " + NEXT.long + ", 7:00 am to " + bcCount().toLocaleString() + " people (demo, nothing sent)"); });
    } else bcAud();
  }
  function bcCount() { var a = $("#bc-a").value, e = BC_EMAIL + DEMO_SIGNUPS; return a === "email" ? e : a === "sms" ? BC_SMS : e + BC_SMS - 61; }
  function bcAud() {
    var a = $("#bc-a").value, m = $("#bc-m").value, sms = a !== "email";
    if (sms && !/STOP/.test(m)) m += " Reply STOP to opt out.";
    $("#bc-aud").innerHTML = "Audience: <b>" + bcCount().toLocaleString() + "</b> " + (a === "email" ? "subscribers" : a === "sms" ? "opted-in numbers" : "people (deduplicated)") + (DEMO_SIGNUPS && a !== "sms" ? ' <span class="you">incl. ' + DEMO_SIGNUPS + " from you</span>" : "") + ' <span class="smp">sample counts</span>' + (sms ? ' · <span class="mono">' + m.length + " chars, " + plural(segs(m), "segment") + "</span>" : "");
    $("#bc-prev").innerHTML = sms ? '<div class="bubble">' + esc(m) + "</div>" : '<div class="email-prev"><span class="tiny">Subject</span><b>New on the roaster: ' + esc(B.BY[$("#bc-c").value].short) + "</b><p>" + esc(m) + "</p></div>";
  }

  // =====================================================================
  // INSIGHTS
  // =====================================================================
  function renderInsights() {
    var wkStart = B.addDays(day0(NOW), -((NOW.getDay() + 6) % 7)); // Monday
    var wkRoasts = PREV.concat(TODAYR ? [TODAYR] : []).filter(function (r) { return r.d >= wkStart; });
    var rev = { web: 0, willcall: 0, sub: 0, market: 0, wholesale: 0 }, web = [], nOrders = 0, sumOrders = 0;
    wkRoasts.forEach(function (R) { ordersFor(R).forEach(function (o) { if (rev[o.ch] === undefined) return; rev[o.ch] += o.total; if (o.ch === "web" || o.ch === "willcall") { nOrders++; sumOrders += o.total; } if (o.ch === "web") web.push(o); }); });
    B.markets.forEach(function (m) { marketHist(m).forEach(function (h) { if (h.d >= wkStart) rev.market += h.cash + h.card; }); });
    var mStart = new Date(NOW.getFullYear(), NOW.getMonth(), 1), mR = PREV.concat(TODAYR ? [TODAYR] : []).filter(function (r) { return r.d >= mStart; });
    var extra = prevRoasts(12).filter(function (r) { return r.d >= mStart && mR.indexOf(r) < 0; }); mR = mR.concat(extra);
    var lbs = 0, byC = {};
    mR.forEach(function (R) { var D = demand(R); lbs += D.roasted; D.bags.forEach(function (b) { byC[b.it.id] = (byC[b.it.id] || 0) + b.it.size; }); });
    var top = Object.keys(byC).sort(function (a, b) { return byC[b] - byC[a]; })[0] || "halfcaff";
    var hit = web.length ? web.filter(function (o) { return o.total - (o.shipFee || 0) >= B.freeShip; }).length / web.length : 0;
    $("#in-kpis").innerHTML = [
      ["Revenue this week", money(Object.keys(rev).reduce(function (t, k) { return t + rev[k]; }, 0)), "since Mon " + B.MON[wkStart.getMonth()] + " " + wkStart.getDate()],
      ["Roasted " + B.MON[NOW.getMonth()], lb(lbs), plural(mR.length, "roast") + " so far"],
      ["Top coffee", esc(B.BY[top].short), lb(byC[top] || 0) + " this month"],
      ["Avg order", nOrders ? money2(sumOrders / nOrders) : "–", "web + will-call"],
      ["Free-ship hit", Math.round(hit * 100) + "%", "of shipped web orders ≥ $60"]
    ].map(kpi).join("");
    var lab = { web: "Web (shipped)", willcall: "Will-call", sub: "Subscriptions", market: "Markets", wholesale: "Wholesale" };
    $("#in-rev").innerHTML = hbars(Object.keys(rev).sort(function (a, b) { return rev[b] - rev[a]; }).map(function (k) { return { k: lab[k], v: rev[k] }; }), money) + '<figcaption class="tiny">Roasts on ' + wkRoasts.slice().sort(function (a, b) { return a.d - b.d; }).map(function (r) { return r.label; }).join(" + ") + " and this week's markets. Sample.</figcaption>";
    $("#in-coffee").innerHTML = hbars(B.COFFEES.filter(function (c) { return byC[c.id]; }).sort(function (a, b) { return byC[b.id] - byC[a.id]; }).map(function (c) { return { k: '<span class="sw" style="background:' + c.c + '"></span>' + esc(c.short), v: byC[c.id] }; }), lb) + '<figcaption class="tiny">Roasted pounds, ' + B.MON[NOW.getMonth()] + " 1 to today, every channel.</figcaption>";
  }

  var RENDER = { roastday: renderRoastDay, orders: renderOrders, subscriptions: renderSubs, green: renderGreen, markets: renderMarkets, wholesale: renderWholesale, customers: renderCustomers, insights: renderInsights };
  addEventListener("hashchange", route);
  route();
  // fill the rail badges for views not yet opened
  setTimeout(function () { ["orders", "subscriptions", "green", "wholesale", "customers", "markets"].forEach(function (v) { if (!rendered[v]) { RENDER[v](); rendered[v] = true; } }); }, 50);
  // the site may log new events in another tab
  addEventListener("storage", function (e) { if (e.key === "bb_demo") location.reload(); });
});
