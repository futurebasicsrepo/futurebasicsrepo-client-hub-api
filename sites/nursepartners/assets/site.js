/* NursePartners concept site: shared behaviour + the after-hours care agent.
   Everything runs in the browser. Nothing a visitor types leaves the page in this
   concept build; see README for how the live version routes leads. */
(function () {
  "use strict";

  // ---------- agency facts (edit here; every page and the agent read these) ----------
  var NP = window.NP = {
    name: "NursePartners",
    phone: "(610) 323-9800",
    phoneHref: "tel:+16103239800",
    hours: { open: 8, close: 17, days: [1, 2, 3, 4, 5] }, // office hours, Eastern
    // Sample rates for the concept. Replace with the agency's real rate card before launch.
    rates: { companion: 34, personal: 36, dementia: 38, overnight: 34, live: 420 },
    marketMedian: 34, // CareScout 2025 Pennsylvania median, non-medical caregiver, $/hr
    va: { veteran: 2424, couple: 2875, spouse: 1557, netWorth: 163699, year: "Dec 2025 – Nov 2026" },
    chc: { income: 2982, assets: 8000, year: 2026 },
    ieb: "1-877-550-4227",
    base: (function () {
      var s = document.currentScript && document.currentScript.src;
      return s ? s.replace(/assets\/site\.js.*$/, "") : "/";
    })()
  };

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function store(key, val) {
    try {
      if (val === undefined) return JSON.parse(localStorage.getItem(key) || "null");
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) { return null; }
  }
  NP.store = store;
  NP.esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  NP.money = function (n) { return "$" + Math.round(n).toLocaleString("en-US"); };

  // ---------- eastern time + office status ----------
  NP.eastern = function () {
    var p = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "numeric", weekday: "short", hour12: false }).formatToParts(new Date());
    var o = {}; p.forEach(function (x) { o[x.type] = x.value; });
    var days = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return { h: (+o.hour) % 24, m: +o.minute, d: days[o.weekday] };
  };
  NP.officeOpen = function () {
    var t = NP.eastern();
    return NP.hours.days.indexOf(t.d) > -1 && t.h >= NP.hours.open && t.h < NP.hours.close;
  };
  $$("[data-office]").forEach(function (el) {
    el.textContent = NP.officeOpen() ? "Office open now" : "Nurse on call 24/7";
  });

  // ---------- service-area + minimums by ZIP ----------
  // Inner ring (4-hour minimum): Philadelphia County, and Delaware/Montgomery east of I-476.
  var inner = "19003 19004 19008 19010 19012 19018 19023 19026 19027 19031 19035 19036 19038 19041 19046 19050 19072 19074 19076 19079 19082 19083 19094 19095 19096 19118 19119 19150 19001 19006 19009 19075 19090".split(" ");
  var outerPrefix = ["190", "193", "194", "195"]; // rest of Montgomery, Delaware, Chester, Pottstown area
  var hoods = {
    "19145": "South Philadelphia (Girard Estate, Packer Park, Marconi)", "19146": "South Philadelphia (Point Breeze, Graduate Hospital)",
    "19147": "South Philadelphia (Queen Village, Bella Vista, Pennsport)", "19148": "South Philadelphia (Whitman, East Passyunk, Lower Moyamensing)",
    "19112": "South Philadelphia (Navy Yard)", "19103": "Center City / Rittenhouse", "19102": "Center City", "19107": "Center City / Chinatown",
    "19106": "Old City / Society Hill", "19130": "Fairmount / Logan Square", "19119": "Mount Airy", "19118": "Chestnut Hill",
    "19083": "Havertown", "19406": "King of Prussia", "19401": "Norristown", "19087": "Radnor / Wayne", "19041": "Haverford",
    "19063": "Media", "19078": "Ridley Park", "19012": "Cheltenham", "19464": "Pottstown"
  };
  NP.coverage = function (zip) {
    zip = String(zip || "").replace(/\D/g, "").slice(0, 5);
    if (zip.length !== 5) return null;
    var place = hoods[zip] || "";
    if (/^191[0-5]\d$/.test(zip) || inner.indexOf(zip) > -1) return { ok: true, min: 4, place: place || (/^191/.test(zip) ? "Philadelphia" : "your area"), zip: zip };
    if (outerPrefix.indexOf(zip.slice(0, 3)) > -1) return { ok: true, min: 6, place: place || "your area", zip: zip };
    return { ok: false, zip: zip };
  };

  // ---------- assessment slots (next business days) ----------
  NP.slots = function (n) {
    var out = [], d = new Date(); d.setHours(0, 0, 0, 0);
    var times = [["9:00 am", 9], ["11:30 am", 11.5], ["2:00 pm", 14], ["4:30 pm", 16.5]];
    var now = new Date(), taken = 0;
    while (out.length < (n || 8)) {
      if (d.getDay() !== 0) {
        times.forEach(function (t, i) {
          var at = new Date(d); at.setHours(Math.floor(t[1]), (t[1] % 1) * 60);
          if (at - now > 3 * 36e5 && out.length < (n || 8)) {
            // leave a believable gap or two so it reads like a real calendar
            if ((d.getDate() + i) % 3 !== 0 || taken > 2) out.push({ at: at, label: at.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }), time: t[0] });
            else taken++;
          }
        });
      }
      d.setDate(d.getDate() + 1);
    }
    return out;
  };

  // ---------- header, nav, concept bar, reveals ----------
  var head = $(".site-head");
  if (head) {
    var onScroll = function () { head.classList.toggle("scrolled", window.scrollY > 8); };
    window.addEventListener("scroll", onScroll, { passive: true }); onScroll();
  }
  var mb = $(".menu-btn"), nav = $(".nav");
  if (mb && nav) mb.addEventListener("click", function () {
    var o = nav.classList.toggle("open"); mb.setAttribute("aria-expanded", o);
  });
  var cx = $(".concept button");
  if (store("np_concept_closed")) document.documentElement.classList.add("concept-hidden");
  if (cx) cx.addEventListener("click", function () { document.documentElement.classList.add("concept-hidden"); store("np_concept_closed", true); });

  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { rootMargin: "0px 0px -8% 0px" });
    $$(".reveal").forEach(function (el) { io.observe(el); });
  } else $$(".reveal").forEach(function (el) { el.classList.add("in"); });

  $$("[data-year]").forEach(function (el) { el.textContent = new Date().getFullYear(); });

  // GEMS explorer (home + dementia page)
  $$(".gems").forEach(function (g) {
    var detail = g.nextElementSibling;
    $$(".gem", g).forEach(function (b) {
      b.addEventListener("click", function () {
        $$(".gem", g).forEach(function (x) { x.setAttribute("aria-pressed", "false"); });
        b.setAttribute("aria-pressed", "true");
        if (detail) detail.innerHTML = "<h4>" + b.dataset.t + "</h4><p class='muted' style='margin:0'>" + b.dataset.d + "</p>";
      });
    });
  });

  // ---------- the after-hours care agent ----------
  if (window.NP_NO_CHAT) return;
  var ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>';
  var SEND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
  var fab = document.createElement("button");
  fab.className = "chat-fab"; fab.type = "button"; fab.setAttribute("aria-haspopup", "dialog");
  fab.innerHTML = '<span class="av">' + ICON + '</span><span class="txt">Questions about care?<span class="sub">Answers any hour · books your free assessment</span></span>';
  var box = document.createElement("div");
  box.className = "chat"; box.setAttribute("role", "dialog"); box.setAttribute("aria-label", "NursePartners care line");
  box.innerHTML =
    '<div class="chat-head"><span class="av">' + ICON + '</span><div><b>NursePartners Care Line</b><small><span class="dot"></span> <span class="ch-status"></span></small></div><button class="x" type="button" aria-label="Close chat">×</button></div>' +
    '<div class="chat-log" aria-live="polite"></div>' +
    '<form class="chat-form"><label class="sr" for="chat-in">Type your question</label><input id="chat-in" autocomplete="off" placeholder="Ask about cost, insurance, starting care…"><button type="submit" aria-label="Send">' + SEND + '</button></form>' +
    '<div class="chat-foot">Please don\'t share medical details here; a nurse covers those privately at the assessment.</div>';
  document.body.appendChild(fab); document.body.appendChild(box);
  var log = $(".chat-log", box), form = $(".chat-form", box), input = $("#chat-in", box);
  $(".ch-status", box).textContent = NP.officeOpen() ? "Office open · replies instantly" : "After hours · replies instantly · nurse on call";

  var state = { started: false, flow: null, lead: {}, guarded: false };
  function scroll() { log.scrollTop = log.scrollHeight; }
  function add(cls, html) { var m = document.createElement("div"); m.className = "msg " + cls; m.innerHTML = html; log.appendChild(m); scroll(); return m; }
  function chips(list) {
    var c = document.createElement("div"); c.className = "chips";
    list.forEach(function (x) {
      var b = document.createElement("button"); b.type = "button"; b.className = "chip"; b.textContent = x.label || x;
      b.addEventListener("click", function () { c.remove(); handle(x.value || x.label || x, x.label || x); });
      c.appendChild(b);
    });
    log.appendChild(c); scroll();
  }
  function bot(html, then) {
    var t = document.createElement("div"); t.className = "msg bot typing"; t.innerHTML = "<i></i><i></i><i></i>"; log.appendChild(t); scroll();
    var delay = Math.min(1100, 350 + html.length * 4);
    setTimeout(function () { t.remove(); add("bot", html); if (then) then(); }, matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : delay);
  }
  var MENU = [
    { label: "What does it cost?", value: "cost" }, { label: "Long-term care insurance", value: "ltc" },
    { label: "VA Aid & Attendance", value: "va" }, { label: "Medicaid / Medicare", value: "medicaid" },
    { label: "How fast can you start?", value: "start" }, { label: "Book a free assessment", value: "book" }
  ];
  function open() {
    box.classList.add("open"); fab.style.display = "none"; input.focus();
    if (!state.started) {
      state.started = true;
      var t = NP.eastern(), late = t.h >= 20 || t.h < 7;
      bot((late ? "Hi. Lots of families find us at this hour, after the day's done. " : "Hi, thanks for reaching out. ") +
        "I can answer questions about cost, insurance and how care starts, and book a free in-home assessment with one of our nurses.\n\nWhat's on your mind?", function () { chips(MENU); });
    }
  }
  function close() { box.classList.remove("open"); fab.style.display = ""; fab.focus(); }
  fab.addEventListener("click", open);
  $(".x", box).addEventListener("click", close);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && box.classList.contains("open")) close(); });
  $$("[data-chat]").forEach(function (el) {
    el.addEventListener("click", function (e) { e.preventDefault(); open(); var q = el.dataset.chat; if (q) setTimeout(function () { handle(q, el.dataset.chatLabel || el.textContent.trim()); }, 300); });
  });
  NP.openChat = open;

  var R = NP.rates;
  var A = {
    cost: "Most families pay by the hour. In our concept rate card, companion care starts at $" + R.companion + "/hr, personal care at $" + R.personal + "/hr and dementia care at $" + R.dementia + "/hr. For reference, the 2025 Pennsylvania median is $" + NP.marketMedian + "/hr.\n\nVisits are at least 4 hours, twice a week, in Philadelphia and the inner suburbs (6 hours further out). A typical start is 4 hours, 3 days a week: about " + NP.money(R.personal * 12 * 4.33) + " a month.\n\nWant to price your own schedule? <a href='" + NP.base + "paying-for-care/#calculator'>Try the cost calculator</a>.",
    minimum: "Our minimum is a 4-hour visit, twice a week, in Philadelphia County and Delaware/Montgomery County east of I-476. Further out it's 6 hours, twice a week. Care is available 24/7, 365 days a year, including overnight and live-in.",
    ltc: "Yes, we work with long-term care insurance. We accept assignment of benefits, so the insurer pays us directly, and we help you open the claim and handle the monthly paperwork. You're billed only for anything the policy doesn't cover.\n\nThree things to find on the policy: the daily benefit, the elimination period (often 90 days), and whether it covers home care. <a href='" + NP.base + "paying-for-care/#ltc'>Our LTC policy checklist</a> walks you through it.",
    va: "VA Aid & Attendance is a monthly pension add-on for wartime veterans and surviving spouses who need help with daily activities. For " + NP.va.year + " the maximum is about " + NP.money(NP.va.veteran) + "/month for a single veteran and about " + NP.money(NP.va.spouse) + " for a surviving spouse, with a net-worth limit of " + NP.money(NP.va.netWorth) + ".\n\nIt pays the family, so you can use it for our care. Applications can take months, so it's worth starting early. <a href='" + NP.base + "paying-for-care/#eligibility'>Check likely eligibility</a> in two minutes.",
    medicaid: "Medicare doesn't pay for ongoing personal or companion care; it covers short, skilled home health after a hospital stay.\n\nPennsylvania Medicaid's home care waiver (Community HealthChoices) can, if income is under about " + NP.money(NP.chc.income) + "/month and countable assets under " + NP.money(NP.chc.assets) + " (" + NP.chc.year + "). We're a private-pay and LTC-insurance agency, so if the waiver is the better fit we'll say so and point you to the PA Independent Enrollment Broker at " + NP.ieb + ".",
    start: "Usually fast. We can typically do the nurse assessment within 24 hours, and our goal is to have a carepartner in the home within 24 hours of that, often the same day as the referral.\n\nComing home from the hospital? Tell us the discharge date and we'll plan around it.",
    who: "Every carepartner is a Certified Nursing Assistant (CNA) with at least a year of long-term care experience. We don't hire uncertified aides. They're bonded, insured and background-screened, and trained in Teepa Snow's Positive Approach to Care.\n\nWe introduce a primary and a relief carepartner, so the face at the door is a familiar one even on a sick day.",
    dementia: "Dementia care is where we started. Our founder, Angela Geiger RN, is a credentialed dementia practitioner, and we use Teepa Snow's GEMS model to match care to where your person is today. <a href='" + NP.base + "dementia-care/'>See how the GEMS approach works</a>.",
    area: "We serve Philadelphia (South Philly, Center City, Rittenhouse, Logan Square, Chinatown, Mount Airy and more) and Montgomery, Delaware and Chester Counties, from offices at Penn Square and in Pottstown. Tell me a ZIP code and I'll check.",
    jobs: "We're hiring CNAs. Pay is $18.50–$21.50/hr with weekly pay, health insurance and a 401(k) match. <a href='" + NP.base + "careers/'>Apply by text in about 3 minutes</a>.",
    pay: "Private pay, long-term care insurance (we bill the insurer directly) and VA benefits paid to the family are the most common. Cards are accepted (3% surcharge on credit) and payments can be automated weekly.",
    human: "Of course. Call " + NP.phone + ". After hours, the line reaches a member of our leadership team with clinical experience. Or I can book the free assessment and a nurse will call you first thing."
  };
  var INTENTS = [
    ["emergency", /\b(911|emergency|fell|has fallen|can'?t get up|not breathing|can'?t breathe|chest pain|unconscious|bleeding badly|stroke now)\b/i],
    ["book", /\b(book|assess|schedul|appointment|visit|consult|come out|meet)/i],
    ["jobs", /\b(job|hiring|apply|work for|cna job|position|employment|career)/i],
    ["ltc", /\b(long[- ]?term|ltc|genworth|john hancock|policy|elimination)/i],
    ["va", /\b(va|veteran|aid (and|&) attendance|a&a|military|served)\b/i],
    ["medicaid", /\b(medicaid|medicare|waiver|chc|community healthchoices|ma\b|medical assistance|life program)/i],
    ["minimum", /\b(minimum|how many hours|shortest|least)/i],
    ["cost", /\b(cost|price|rate|how much|afford|expens|per hour|hourly|charge)/i],
    ["pay", /\b(pay|payment|card|insurance|cover)/i],
    ["start", /\b(start|soon|fast|quick|tomorrow|today|discharg|hospital|rehab)/i],
    ["who", /\b(who|caregiver|carepartner|aide|cna|trained|background|same person|screen)/i],
    ["dementia", /\b(dementia|alzheimer|memory|confus|wander|gems|teepa)/i],
    ["area", /\b(area|serve|location|where|south philly|philadelphia|county|zip)\b/i],
    ["human", /\b(human|person|someone|call me|talk to|speak)/i]
  ];
  var PHI = /\b(diagnos\w*|medication|meds|prescri\w*|insulin|chemo\w*|dialysis|cancer|parkinson\w*|copd|chf|catheter|wound|ssn|social security number|date of birth|dob|medicare (number|id)|member id|mrn)\b/i;

  function handle(text, shown) {
    $$(".chips", log).forEach(function (c) { c.remove(); });
    add("me", NP.esc(shown || text));
    if (typeof state.flow === "number") return flowStep(text);
    var t = String(text);
    if (PHI.test(t) && !state.guarded) {
      state.guarded = true;
      add("msg guard", "Thank you. You don't need to share health details here. This chat isn't set up for medical information; a nurse covers that privately, in person, at the assessment.");
    }
    var hit = null;
    for (var i = 0; i < INTENTS.length; i++) if (t === INTENTS[i][0] || INTENTS[i][1].test(t)) { hit = INTENTS[i][0]; break; }
    var zip = t.match(/\b(\d{5})\b/);
    if (!hit && zip) return zipReply(zip[1]);
    if (hit === "emergency") return bot("If someone is hurt or in danger, please call <a href='tel:911'>911</a> now.\n\nFor anything urgent about care that's already in place, our on-call clinician is at <a href='" + NP.phoneHref + "'>" + NP.phone + "</a>, 24/7.");
    if (hit === "book") return startBooking();
    if (hit) return bot(A[hit], function () { chips(followUps(hit)); });
    bot("I may not have that one. I'm best with cost, insurance, VA benefits, Medicaid, how fast we start and booking a free assessment. A person can answer anything else at " + NP.phone + ".", function () { chips(MENU); });
  }
  function followUps(k) {
    var all = { cost: ["ltc", "va", "book"], ltc: ["cost", "va", "book"], va: ["ltc", "cost", "book"], medicaid: ["cost", "ltc", "book"], start: ["who", "cost", "book"], who: ["dementia", "start", "book"], dementia: ["who", "cost", "book"], area: ["cost", "start", "book"], pay: ["ltc", "va", "book"], minimum: ["cost", "start", "book"], human: ["book"], jobs: ["cost"] }[k] || ["book"];
    var names = { cost: "What does it cost?", ltc: "LTC insurance", va: "VA benefits", book: "Book a free assessment", who: "Who are the caregivers?", start: "How fast can you start?", dementia: "Dementia care" };
    return all.map(function (v) { return { label: names[v], value: v }; });
  }
  function zipReply(z) {
    var c = NP.coverage(z);
    if (!c) return bot("Could you share a 5-digit ZIP code?");
    if (!c.ok) return bot("That ZIP is outside our area. I'm sorry. Call " + NP.phone + " and we'll suggest a trusted agency closer to you.");
    bot("Yes, we serve " + NP.esc(c.place) + " (" + c.zip + "). The minimum there is " + c.min + " hours a visit, twice a week.", function () { chips([{ label: "Book a free assessment", value: "book" }, { label: "What does it cost?", value: "cost" }]); });
  }

  // booking flow: never asks for the care recipient's name or health information
  var FLOW = ["who", "zip", "when", "slot", "name", "phone", "consent"];
  function startBooking() {
    state.flow = 0; state.lead = { source: "Care Line chat", at: new Date().toISOString() };
    bot("Good. The assessment is free, in the home, with a nurse, and there's no obligation. Five quick questions.\n\nWho is the care for?", function () { chips(["Mom", "Dad", "Both parents", "My spouse", "Myself", "Someone else"]); });
  }
  function flowStep(v) {
    var key = FLOW[state.flow];
    if (key === "who") { state.lead.for = v; state.flow++; return bot("What ZIP code would care be in?"); }
    if (key === "zip") {
      var c = NP.coverage(v);
      if (!c) return bot("Just the 5-digit ZIP, please.");
      if (!c.ok) { state.flow = null; return bot("That ZIP is outside our area, I'm sorry. Call " + NP.phone + " and we'll point you to a good agency nearby."); }
      state.lead.zip = c.zip; state.lead.min = c.min; state.flow++;
      return bot("We cover " + NP.esc(c.place) + ". How soon is care needed?", function () { chips(["As soon as possible", "Coming home from hospital/rehab", "Within a few weeks", "Just planning ahead"]); });
    }
    if (key === "when") {
      state.lead.when = v; state.flow++;
      var s = NP.slots(6);
      return bot(/hospital|rehab/i.test(v) ? "We'll plan around the discharge. A nurse can meet you at the facility or at home. Pick a time that works:" : "Here are the next open times for a nurse visit:", function () {
        chips(s.map(function (x) { return { label: x.label + ", " + x.time, value: x.label + ", " + x.time }; }).concat([{ label: "None of these work", value: "call" }]));
      });
    }
    if (key === "slot") { state.lead.slot = v === "call" ? "Call to arrange" : v; state.flow++; return bot((v === "call" ? "No problem; we'll find a time by phone. " : "Held for you. ") + "What's your first name?"); }
    if (key === "name") { state.lead.name = v.split(" ")[0].slice(0, 30); state.flow++; return bot("Thanks, " + NP.esc(state.lead.name) + ". Best phone number for the nurse to confirm?"); }
    if (key === "phone") {
      var d = String(v).replace(/\D/g, "");
      if (d.length < 10) return bot("That looks short. A 10-digit number, please.");
      state.lead.phone = "(" + d.slice(-10, -7) + ") " + d.slice(-7, -4) + "-" + d.slice(-4); state.flow++;
      return bot("Can we text you a confirmation and reminder? Texts only ever say the time and a link, never health details.", function () { chips(["Yes, text me", "Call only, please"]); });
    }
    if (key === "consent") {
      state.lead.sms = /yes/i.test(v); state.flow = null;
      var leads = store("np_leads") || []; leads.unshift(state.lead); store("np_leads", leads.slice(0, 20));
      return bot("You're set" + (state.lead.slot !== "Call to arrange" ? " for " + NP.esc(state.lead.slot) : "") + ". A nurse will call " + NP.esc(state.lead.phone) + (NP.officeOpen() ? " shortly" : " by 8:30 tomorrow morning") + " to confirm and ask a few care questions privately.\n\n<span class='mini'>Concept demo: this request is saved only in your browser. Open the <a href='" + NP.base + "agency-console/#inbox'>agency console</a> to see how staff receive it.</span>", function () { chips([{ label: "What does it cost?", value: "cost" }, { label: "LTC insurance", value: "ltc" }]); });
    }
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault(); var v = input.value.trim(); if (!v) return; input.value = "";
    handle(v);
  });

  // open the chat automatically when linked with #chat
  if (location.hash === "#chat") setTimeout(open, 400);
})();
