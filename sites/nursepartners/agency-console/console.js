/* Agency console demo. All data is illustrative and lives in this file or in the
   visitor's own localStorage (from using the public site's chat and forms). */
(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var E = NP.esc, M = NP.money;
  var slow = !matchMedia("(prefers-reduced-motion: reduce)").matches;
  function ago(iso) {
    var m = Math.round((Date.now() - new Date(iso)) / 6e4);
    return m < 1 ? "just now" : m < 60 ? m + " min ago" : m < 1440 ? Math.round(m / 60) + " hr ago" : Math.round(m / 1440) + " d ago";
  }
  function at(hoursAgo) { return new Date(Date.now() - hoursAgo * 36e5).toISOString(); }

  // ---------- routing ----------
  function route() {
    var v = (location.hash || "#today").slice(1);
    if (!$("#v-" + v)) v = "today";
    $$(".view").forEach(function (s) { s.hidden = s.id !== "v-" + v; });
    $$(".c-nav a").forEach(function (a) { a.setAttribute("aria-current", a.dataset.v === v ? "page" : "false"); });
    window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", route); route();
  function tick() { $("#clock").textContent = new Date().toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }) + " ET"; }
  tick(); setInterval(tick, 30000);

  // ---------- inquiries ----------
  var demoLeads = [
    { at: at(7.2), name: "Dana R.", for: "Dad", zip: "19148", min: 4, when: "ASAP", help: "Personal care, Memory care", source: "Care Line chat", slot: "Booked: tomorrow 9:00 am", sms: true, after: true },
    { at: at(9.5), name: "Michelle T.", for: "Mom", zip: "19147", min: 4, when: "Hospital/rehab discharge", help: "Personal care", source: "Assessment form · Google", slot: "Booked: tomorrow 11:30 am", after: true },
    { at: at(10.1), email: "k••••@gmail.com", source: "Cost calculator", help: "Estimate: $2,494/mo after LTC", slot: "Nurture: LTC claim checklist sent", after: true },
    { at: at(26), name: "Case manager", for: "Patient R.M.", zip: "19145", source: "Referral: South Philly hospital", when: "Discharge Thu", help: "Overnight/24h", slot: "Nurse assessing at bedside Wed" },
    { at: at(50), name: "Paul S.", for: "Both parents", zip: "19103", source: "Care Line chat", help: "Companionship", slot: "Client · started Monday", won: true }
  ];
  var mine = (NP.store("np_leads") || []).map(function (l) { l.mine = true; return l; });
  var leads = mine.concat(demoLeads);
  $("#n-lead").textContent = leads.length;
  $("#t-leads").textContent = (mine.length + 3) + " new";
  $("#lead-tbl tbody").innerHTML = leads.map(function (l) {
    var who = l.name ? E(l.name) + (l.for ? " <span class='muted'>for " + E(l.for) + "</span>" : "") : E(l.email || "Anonymous");
    var need = [l.help, l.zip ? l.zip + (l.min ? " · " + l.min + "h min" : "") : "", l.when].filter(Boolean).map(E).join("<br>");
    var next = l.mine ? (l.slot && l.slot !== "Call to arrange" ? "<span class='pill ok'>Assessment: " + E(l.slot) + "</span>" : l.est ? "<span class='pill lime'>Estimate sent · nurture</span>" : "<span class='pill warn'>Call back</span>") :
      "<span class='pill " + (l.won ? "lime" : /Booked|Nurse/.test(l.slot) ? "ok" : "") + "'>" + E(l.slot) + "</span>";
    return "<tr" + (l.mine ? " style='background:#fbf8ff'" : "") + "><td>" + ago(l.at) + (l.after || (l.mine && !NP.officeOpen()) ? "<br><span class='tiny muted'>after hours</span>" : "") + (l.mine ? "<br><span class='pill' style='margin-top:4px'>You, just now</span>" : "") + "</td><td>" + who + "</td><td class='small'>" + need + "</td><td class='small'>" + E(l.source || "") + "</td><td>" + next + "</td></tr>";
  }).join("");

  // ROI
  function roi() {
    var g = function (id) { return +$("#" + id).value; };
    var cpl = g("roi-cpl"), mo = g("roi-mo"), len = g("roi-len"), n = g("roi-n"), cr = g("roi-cr") / 100;
    $("#roi-cpl").nextElementSibling.textContent = "$" + cpl;
    $("#roi-mo").nextElementSibling.textContent = M(mo);
    $("#roi-len").nextElementSibling.textContent = len + " mo";
    $("#roi-n").nextElementSibling.textContent = n;
    $("#roi-cr").nextElementSibling.textContent = Math.round(cr * 100) + "%";
    var ltv = mo * len, clients = n * cr;
    $("#roi-out").innerHTML =
      "<div><b>" + M(ltv) + "</b><span>lifetime value of one private-pay client</span></div>" +
      "<div><b>" + M(n * cpl * 12) + "/yr</b><span>what " + n + " leads a month would cost from an aggregator (and they're sold to competitors too)</span></div>" +
      "<div><b>" + M(clients * ltv * 12) + "</b><span>care revenue a year from " + clients.toFixed(1) + " new clients a month via the site</span></div>";
  }
  $$("#v-inbox input[type=range]").forEach(function (i) { i.addEventListener("input", roi); }); roi();

  // ---------- shift fill ----------
  var CPs = [
    { n: "Maria S.", knows: "Yes · primary", d: "0.6 mi", h: 28, reply: "YES", t: 2.1 },
    { n: "Tamika J.", knows: "Met twice", d: "1.1 mi", h: 24, reply: "Can't today, sorry!", t: 1.4 },
    { n: "Luz R.", knows: "—", d: "1.4 mi", h: 32, reply: "YES I can", t: 2.9 },
    { n: "Andre P.", knows: "—", d: "2.0 mi", h: 16, reply: null },
    { n: "Grace O.", knows: "—", d: "2.6 mi", h: 36, reply: "no", t: 3.4 }
  ];
  function renderElig(state) {
    $("#elig-tbl tbody").innerHTML = CPs.map(function (c, i) {
      var st = state && state[i] || "<span class='muted'>Ready</span>";
      return "<tr" + (state && state.won === i ? " class='won'" : "") + "><td><b>" + c.n + "</b></td><td>" + c.knows + "</td><td>" + c.d + "</td><td>" + c.h + " / 40</td><td>" + st + "</td></tr>";
    }).join("");
  }
  renderElig();
  var timers = [];
  function sms(cls, txt) { var l = $("#fill-log"), m = document.createElement("div"); m.className = cls; m.textContent = txt; l.appendChild(m); l.scrollTop = l.scrollHeight; }
  $("#fill-go").addEventListener("click", function () {
    var b = this; b.disabled = true;
    $("#fill-log").innerHTML = "<span class='sms-time'>Today 5:53 AM</span>";
    var state = {};
    sms("sms in", "NursePartners: Open shift TODAY 9:00a–1:00p, South Philly (19148), personal care, $20.50/hr. Reply YES to take it. First yes gets it.");
    CPs.forEach(function (c, i) { state[i] = "<span class='pill'>Texted 5:53</span>"; });
    renderElig(state);
    var won = null, order = CPs.map(function (c, i) { return i; }).filter(function (i) { return CPs[i].reply; }).sort(function (a, b) { return CPs[a].t - CPs[b].t; });
    order.forEach(function (i) {
      var c = CPs[i];
      timers.push(setTimeout(function () {
        var yes = /yes/i.test(c.reply);
        if (yes && won === null) {
          won = i; state.won = i; state[i] = "<span class='pill ok'>Booked ✓</span>";
          sms("sms out", c.n.split(" ")[0] + ": " + c.reply);
          sms("sms in", "Confirmed, " + c.n.split(" ")[0] + "! You're on today 9:00a–1:00p. Address and care notes are in your app. Thank you!");
          $("#shift-status").className = "pill ok"; $("#shift-status").textContent = "Filled · 5:55 am";
          $("#n-shift").textContent = "";
          var s = $("#fill-sum"); s.hidden = false;
          s.innerHTML = "<h3>Filled in 2 min 6 sec</h3><div class='kv'><span>Covered by</span><b>" + c.n + " (" + c.knows.toLowerCase() + ")</b></div><div class='kv'><span>Family notified</span><b>Dana, 7:00 am text</b></div><div class='kv'><span>Scheduler calls made</span><b>0</b></div><div class='kv'><span>Others told \"filled, thanks\"</span><b>automatically</b></div><p class='tiny muted' style='margin:10px 0 0'>Family text: \"Good morning. Keisha is out sick today, so Maria is covering 9–1. Frank knows her well.\" No health details.</p>";
        } else if (yes) {
          state[i] = "<span class='pill'>Too late · thanked</span>";
          sms("sms out", c.n.split(" ")[0] + ": " + c.reply);
          sms("sms in", "Thanks " + c.n.split(" ")[0] + ", that one's filled. We'll keep you first in line next time.");
        } else {
          state[i] = "<span class='pill warn'>Declined</span>";
        }
        renderElig(state);
      }, slow ? c.t * 1100 : 0));
    });
  });
  $("#fill-reset").addEventListener("click", function () {
    timers.forEach(clearTimeout); timers = [];
    $("#fill-go").disabled = false; $("#fill-sum").hidden = true;
    $("#fill-log").innerHTML = "<span class='sms-time'>Waiting to send…</span>";
    $("#shift-status").className = "pill warn"; $("#shift-status").textContent = "Unfilled · 5:52 am";
    $("#n-shift").textContent = "1"; renderElig();
  });

  // ---------- recruiting ----------
  var cols = [["texted", "Texted in"], ["screened", "Screened"], ["interview", "Interview booked"], ["offer", "Conditional offer"], ["quiet", "Went quiet"]];
  var apps = [
    { n: "Aaliyah M.", c: "interview", cert: "CNA active", exp: "3+ yrs", areas: "Philadelphia", avail: "Weekday days", tr: "SEPTA", when: "Thu 11:30" },
    { n: "Brian K.", c: "interview", cert: "CNA active", exp: "1–3 yrs", areas: "Delaware Co.", avail: "Overnights, Weekends", tr: "Car", when: "Thu 2:00" },
    { n: "Rosa D.", c: "offer", cert: "CNA active", exp: "3+ yrs", areas: "Philadelphia", avail: "Weekday days, Evenings", tr: "Car" },
    { n: "Jamal W.", c: "screened", cert: "Renewing now", exp: "1–3 yrs", areas: "Philadelphia, Montgomery Co.", avail: "Evenings", tr: "SEPTA", flag: "Cert renewal: verify date" },
    { n: "Ngoc T.", c: "screened", cert: "CNA active", exp: "Under 1 year", areas: "Philadelphia", avail: "Weekends", tr: "SEPTA", flag: "Under 1 yr: review for facility" },
    { n: "Destiny L.", c: "texted", cert: "—", exp: "—", areas: "—", avail: "—", tr: "—", flag: "Stopped at question 2 · 3h ago" },
    { n: "Kevin O.", c: "quiet", cert: "CNA active", exp: "1–3 yrs", areas: "Montgomery Co.", avail: "Weekday days", tr: "Car", flag: "No reply 3 days · text #2 queued" },
    { n: "Sharon B.", c: "quiet", cert: "CNA active", exp: "3+ yrs", areas: "Philadelphia", avail: "Overnights", tr: "SEPTA", flag: "Missed interview · text #1 queued" }
  ];
  var mineA = (NP.store("np_applicants") || []).map(function (a) {
    return { n: a.name || "You", c: a.interview && a.interview !== "None of these" ? "interview" : a.stage && /Nurture/.test(a.stage) ? "quiet" : "screened", cert: a.cert, exp: a.exp, areas: a.areas, avail: a.avail, tr: a.transport, when: a.interview, mine: true, flag: a.stage && /Nurture/.test(a.stage) ? "Cert pending · CNA class alert" : a.exp === "Under 1 year" ? "Under 1 yr: review for facility" : "" };
  });
  apps = mineA.concat(apps);
  $("#n-app").textContent = apps.length;
  $("#r-total").textContent = 14 + mineA.length;
  $("#t-apps").textContent = (14 + mineA.length) + " this week";
  function renderK() {
    $("#kanban").innerHTML = cols.map(function (c) {
      var list = apps.filter(function (a) { return a.c === c[0]; });
      return "<div class='col'><h4>" + c[1] + "<span>" + list.length + "</span></h4>" + list.map(function (a) {
        return "<div class='app" + (a.mine ? " new" : "") + "'><b>" + E(a.n) + (a.mine ? " <span class='pill' style='font-size:11px'>you</span>" : "") + "</b><span class='meta'>" + E(a.cert || "") + " · " + E(a.exp || "") + "<br>" + E(a.areas || "") + "<br>" + E(a.avail || "") + " · " + E(a.tr || "") + "</span>" +
          (a.when ? "<br><span class='pill ok' style='margin-top:6px'>" + E(a.when) + "</span>" : "") + (a.flag ? "<br><span class='flag'>⚑ " + E(a.flag) + "</span>" : "") + "</div>";
      }).join("") + "</div>";
    }).join("");
  }
  renderK();
  $("#reengage").addEventListener("click", function () {
    this.disabled = true;
    $("#re-out").innerHTML = "Sent 3 texts: <b>Destiny L.</b> (resume link), <b>Kevin O.</b> (text #2, Montco clients), <b>Sharon B.</b> (reschedule). Replies route to Robert's inbox.";
    setTimeout(function () {
      apps.forEach(function (a) { if (a.n === "Sharon B.") { a.c = "interview"; a.when = "Fri 9:00"; a.flag = "Re-engaged · rebooked"; } });
      renderK();
      $("#re-out").innerHTML += "<br><span class='pill ok' style='margin-top:6px'>Sharon B. replied \"sorry! can I do Friday?\" → rebooked Fri 9:00</span>";
    }, slow ? 1600 : 0);
  });

  // ---------- digests ----------
  var D = [
    { c: "Frank R.", fam: "Dana, Michael, Teresa", flag: "Left knee pain 3/10 on Wed → nurse follow-up task created", raw: "WED 9-13 K.W.  pt fatigued pm, napped ~2h. c/o L knee pain 3/10, no swelling noted, no fall. lunch 50%. reminder taken.\nTHU 9-13 M.S.  shower w/ assist. knee \"better\", ambulated to corner x1 w/ RW. podiatry appt 10/9 2pm - family to confirm transport?", draft: "<p><b>Needs you:</b> Podiatry Thursday at 2pm. Maria can take him if you'd like.</p><p>A good week. Frank walked to the corner with Maria twice and ate well most days. Wednesday he was tired and mentioned his left knee was a little sore; it was better Thursday, and our nurse will check it at next week's visit.</p>" },
    { c: "Eleanor B.", fam: "Steven", flag: null, raw: "MON 13-19 T.J.  pleasant, played rummy, dinner 100%. evening routine completed, in bed 18:45.\nWED 13-19 T.J.  walked in courtyard 20 min. called sister. dinner 75%.", draft: "<p>Eleanor had a lovely, steady week. She beat Tamika at rummy (twice, she wants you to know), walked in the courtyard for 20 minutes on Wednesday and had a long call with her sister.</p>" },
    { c: "Joseph & Ann P.", fam: "Lisa", flag: "Ann: appetite down 3 days → nurse follow-up task created", raw: "TUE 8-14 L.R.  Ann lunch 25%, says not hungry. Joseph ambulating well.\nTHU 8-14 L.R.  Ann lunch 30%, drank ensure. Joseph helped fold laundry, good mood.", draft: "<p><b>Heads-up:</b> Ann hasn't been very hungry this week. She's drinking her shakes, and our nurse is calling you today to talk it through.</p><p>Joseph was in great form and helped Luz fold the laundry on Thursday.</p>" },
    { c: "Rita C.", fam: "Anthony, Gina", flag: null, raw: "MON/WED/FRI 9-13 G.O.  morning walk, mass on fri, meals 100%. no concerns.", draft: "<p>Rita made it to Mass on Friday with Grace and kept up her morning walks all week. Meals all eaten, no concerns.</p>" }
  ];
  for (var k = 0; k < 5; k++) D.push({ c: ["Walter H.", "Mae L.", "Sal V.", "Dorothy K.", "Hung N."][k], fam: "Family", flag: null, raw: "(visit notes)", draft: "<p>Draft ready.</p>" });
  function renderD(i) {
    var d = D[i];
    $$("#dlist button").forEach(function (b, j) { b.setAttribute("aria-current", j === i); });
    $("#dview").innerHTML = "<div class='row-between' style='gap:12px;flex-wrap:wrap'><h3 style='margin:0'>" + E(d.c) + "</h3><span class='tiny muted'>To: " + E(d.fam) + " · Fri 4:00 pm</span></div>" +
      (d.flag ? "<div class='flagbox'>⚑ " + E(d.flag) + "</div>" : "") +
      "<p class='tiny muted' style='margin:14px 0 6px'>VISIT NOTES (excerpt)</p><div class='raw'>" + E(d.raw) + "</div>" +
      "<p class='tiny muted' style='margin:16px 0 6px'>DRAFT FOR FAMILY</p><div style='background:var(--cream);border-radius:12px;padding:14px 16px;font-size:15px'>" + d.draft + "</div>" +
      "<div style='display:flex;gap:10px;margin-top:14px;flex-wrap:wrap'><button class='btn btn-primary btn-sm' type='button' id='approve'>" + (d.ok ? "Approved ✓" : "Approve &amp; schedule") + "</button><button class='btn btn-ghost btn-sm' type='button'>Edit</button><a class='btn btn-ghost btn-sm' href='../family-updates/'>Family view</a></div>";
    var ab = $("#approve"); ab.disabled = !!d.ok;
    ab.addEventListener("click", function () { d.ok = true; renderList(); renderD(i); });
  }
  function renderList() {
    $("#dlist").innerHTML = D.map(function (d, i) {
      return "<li><button type='button'><span>" + E(d.c) + "<small>" + (d.flag ? "⚑ clinical flag" : "No flags") + "</small></span>" + (d.ok ? "<span class='pill ok'>Approved</span>" : d.flag ? "<span class='pill warn'>Review</span>" : "<span class='pill'>Draft</span>") + "</button></li>";
    }).join("");
    $$("#dlist button").forEach(function (b, i) { b.addEventListener("click", function () { renderD(i); }); });
  }
  renderList(); renderD(0);

  // ---------- partners ----------
  var src = [["Hospital case managers", 23], ["Google search", 19], ["Care Line (after hours)", 14], ["Elder law attorneys", 7], ["Senior living", 6], ["Aggregator (paid)", 4]];
  var max = 23;
  $("#src-bars").innerHTML = src.map(function (s) { return "<div><span>" + s[0] + "</span><i" + (/Google|Care Line/.test(s[0]) ? " class='lime'" : "") + " style='width:" + (s[1] / max * 100) + "%'></i><b>" + s[1] + "</b></div>"; }).join("");
  var nm = new Date(); nm.setDate(nm.getDate() + ((8 - nm.getDay()) % 7 || 7));
  $("#next-mon").textContent = nm.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) + ", 7:00 am";
})();
