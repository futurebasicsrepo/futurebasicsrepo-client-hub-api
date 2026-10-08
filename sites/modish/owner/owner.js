/* Salon console demo. Data is illustrative, plus whatever this browser did on the public site. */
(function () {
  "use strict";
  var M = window.MODISH, $ = function (s) { return document.querySelector(s); }, $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  var E = M.esc, slow = !matchMedia("(prefers-reduced-motion: reduce)").matches;
  function route() {
    var v = (location.hash || "#today").slice(1); if (!$("#v-" + v)) v = "today";
    $$(".view").forEach(function (s) { s.hidden = s.id !== "v-" + v; });
    $$(".o-nav a").forEach(function (a) { var on = a.dataset.v === v; a.setAttribute("aria-current", on ? "page" : "false"); if (on) $("#o-where").textContent = a.childNodes[0].textContent.trim(); });
    scrollTo(0, 0);
  }
  addEventListener("hashchange", route); route();
  var hr = M.now().h; $("#greet").textContent = hr < 12 ? "Good morning." : hr < 17 ? "Good afternoon." : "Good evening.";
  var tick = function () { $("#clock").textContent = new Date().toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }) + " ET"; }; tick(); setInterval(tick, 30000);

  // ---------- today's book ----------
  var demo = [
    ["9:30", "Maria L.", ["delped"], "Any available", "Online"], ["10:00", "Jess T.", ["gelmani", "cateye"], "Requested tech", "Online · rebook text"], ["11:00", "Bridal party (5)", ["gelmani", "spaped"], "Group", "Party request"],
    ["12:30", "Dana R.", ["gelmani", "chrome"], "Any available", "Fill reminder"], ["1:00", "Ava (age 8) + mom", ["kmani", "kped"], "Any available", "Online"], ["3:30", "Priya S.", ["sns", "shape"], "Requested tech", "Online"], ["5:00", "Tara M.", ["fillgel"], "Any available", "Walk-in"]
  ];
  var mine = (M.store("md_bookings") || []).filter(function (b) { return new Date(b.at) > new Date(Date.now() - 864e5); });
  var rows = mine.map(function (b) { var d = new Date(b.at); return { t: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + "<br>" + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }), who: b.name, svc: b.items, tech: b.tech, src: "You, just now · " + M.locations[b.loc].name, total: b.total, up: b.up, mine: true }; })
    .concat(demo.map(function (d) { var t = M.total(d[2]); return { t: d[0], who: d[1], svc: d[2], tech: d[3], src: d[4], total: t.price * (/\((\d)\)/.test(d[1]) ? +d[1].match(/\((\d)\)/)[1] : 1), up: t.up }; }));
  $("#book").innerHTML = rows.map(function (r) {
    return '<div class="appt' + (r.mine ? " new" : "") + '"><span class="tm">' + r.t + '</span><span class="who"><b>' + E(r.who) + '</b><small>' + r.svc.map(function (id) { return M.BY[id].name; }).join(" + ") + " · " + E(r.tech) + '</small></span><span class="pill' + (r.mine ? " gold" : /reminder|rebook/.test(r.src) ? " ok" : "") + '">' + E(r.src) + "</span></div>";
  }).join("");
  var rev = rows.reduce(function (a, r) { return a + r.total; }, 0);
  $("#t-booked").textContent = rows.length; $("#t-booked-s").textContent = mine.length ? mine.length + " from you, just now" : "2 came from fill reminders";
  $("#t-rev").textContent = "$" + rev.toLocaleString(); $("#n-today").textContent = rows.length;

  // ---------- walk-in queue ----------
  var wl = (M.store("md_waitlist") || []).map(function (w) { return { name: w.name, svc: w.svc, party: w.party, loc: w.loc, mine: true }; })
    .concat([{ name: "Jess K.", svc: "Gel manicure", party: "1" }, { name: "Rosa & Ann", svc: "Mani + pedi", party: "2" }, { name: "Nicole P.", svc: "Pedicure", party: "1" }]);
  $("#t-wl").textContent = wl.length; $("#n-wl").textContent = wl.length;
  $("#queue").innerHTML = wl.map(function (w, i) {
    return '<div class="q"><span class="pos">' + (i + 1) + '</span><span><b>' + E(w.name) + "</b>" + (w.mine ? ' <span class="pill gold">you</span>' : "") + "<small>" + E(w.svc) + " · party of " + E(w.party) + " · est. " + (10 + i * 12) + ' min</small></span><button class="btn btn-dark btn-sm" type="button" data-ready="' + i + '">Text: chair ready</button></div>';
  }).join("");
  $("#queue").addEventListener("click", function (e) {
    var b = e.target.closest("[data-ready]"); if (!b) return;
    b.textContent = "Texted ✓"; b.disabled = true; b.closest(".q").classList.add("sent");
  });

  // ---------- fill reminders ----------
  var due = [["Dana R.", "Gel manicure + chrome", "17 days", "$50"], ["Priya S.", "SNS dip", "24 days", "$50+"], ["Kelly W.", "Fill-in with gel color", "15 days", "$40+"], ["Monique B.", "Gel manicure", "16 days", "$35"], ["Sam H.", "Fill-in pink & white", "18 days", "$55+"]];
  $("#due").innerHTML = due.map(function (d, i) { return '<div class="rv"><span><b>' + d[0] + "</b><small>Usual: " + d[1] + " · last visit " + d[2] + ' ago</small></span><span class="pill" id="due-' + i + '">' + d[3] + "</span></div>"; }).join("");
  $("#send-due").addEventListener("click", function () {
    this.disabled = true; $("#due-out").textContent = "Sent 5 reminders. Replies and bookings land here.";
    [[0, "Booked Thu 12:30 ✓", "ok"], [3, "Booked Fri 10:00 ✓", "ok"], [1, "Opened link", ""]].forEach(function (r, k) {
      setTimeout(function () { var p = $("#due-" + r[0]); p.textContent = r[1]; p.className = "pill " + r[2]; }, slow ? 900 + k * 1100 : 0);
    });
  });

  // ---------- slow-hour fill ----------
  var hours = ["9:30", "10:30", "11:30", "12:30", "1:30", "2:30", "3:30", "4:30", "5:30", "6:30"], load = [3, 5, 6, 5, 4, 1, 1, 2, 5, 4];
  function heat() {
    $("#heat").innerHTML = hours.map(function (h, i) { var a = load[i] / 6; return '<div style="background:rgba(168,120,47,' + (0.12 + a * 0.75).toFixed(2) + ');color:' + (a > .6 ? "#fff8ec" : "var(--espresso)") + '"><b>' + load[i] + "/6</b>" + h + "</div>"; }).join("");
  }
  heat();
  $("#send-slow").addEventListener("click", function () {
    this.disabled = true; var out = $("#slow-out"); out.innerHTML = '<div class="feed"></div>'; var f = out.firstChild;
    var ev = [["Sent to 42 guests", null], ["Erin B. booked 2:30 · deluxe pedicure", 5], ["Claire D. booked 3:30 · spa pedicure", 6], ["Mia T. booked 2:30 · jelly deluxe", 5], ["Lauren K. booked 4:30 · spa pedicure + gel toes", 7], ["4 chair-hours filled · ~$170 that would've been $0", null]];
    ev.forEach(function (x, k) { setTimeout(function () { var d = document.createElement("div"); d.textContent = x[0]; if (x[1] != null) { load[x[1]]++; heat(); } if (k === ev.length - 1) d.style.fontWeight = "600"; f.appendChild(d); }, slow ? k * 1000 : 0); });
  });

  // ---------- reviews ----------
  var rv = [["Maria L.", "Sample reply: “So relaxing, thank you!”", "5★ → sent Google link", "ok"], ["Jess T.", "Sample reply: “Love my cat eye!”", "5★ → left a Google review", "ok"], ["Guest", "Sample reply: “Waited longer than expected.”", "2★ → manager notified privately", "warn"]];
  $("#rev").innerHTML = rv.map(function (r) { return '<div class="rv"><span><b>' + r[0] + "</b><small>" + r[1] + '</small></span><span class="pill ' + r[3] + '">' + r[2] + "</span></div>"; }).join("");

  // ---------- gifts ----------
  var g = (M.store("md_gifts") || []).map(function (x) { return { amt: x.amt, to: x.to || "Someone lovely", from: x.from || "", mine: true }; })
    .concat([{ amt: 100, to: "Mom", from: "Katie" }, { amt: 75, to: "Jen", from: "Coworkers" }, { amt: 50, to: "Grace", from: "Dad" }, { amt: 150, to: "Bridal party", from: "Maid of honor" }]);
  var sum = g.reduce(function (a, x) { return a + x.amt; }, 0);
  $("#g-sum").textContent = "$" + sum; $("#g-n").textContent = g.length; $("#g-avg").textContent = "$" + Math.round(sum / g.length); $("#n-gift").textContent = (M.store("md_gifts") || []).length || "";
  $("#gifts").innerHTML = g.map(function (x) { return '<div class="rv"><span><b>$' + x.amt + " · for " + E(x.to) + "</b><small>" + (x.from ? "From " + E(x.from) : "") + '</small></span><span class="pill' + (x.mine ? " gold" : "") + '">' + (x.mine ? "You, just now" : "Delivered") + "</span></div>"; }).join("");

  // ---------- parties ----------
  var p = (M.store("md_parties") || []).map(function (x) { x.mine = true; return x; })
    .concat([{ occasion: "Bridal", date: "Sat · in 3 weeks", guests: "7–9", loc: "rox", name: "Alexis M.", svc: "Gel manicures, Pedicures" }, { occasion: "Birthday", date: "Sat · in 5 weeks", guests: "5–6", loc: "con", name: "Brianna's mom", svc: "Kids" }]);
  $("#n-party").textContent = (M.store("md_parties") || []).length || "";
  $("#parties").innerHTML = p.map(function (x) { return '<div class="rv"><span><b>' + E(x.occasion) + " · " + E(x.guests) + " guests · " + E(M.locations[x.loc] ? M.locations[x.loc].name : x.loc) + "</b><small>" + E(x.name) + " · " + E(x.date) + (x.svc ? " · " + E(x.svc) : "") + '</small></span><span class="pill' + (x.mine ? " gold" : "") + '">' + (x.mine ? "You, just now" : "Text to confirm") + "</span></div>"; }).join("");
})();
