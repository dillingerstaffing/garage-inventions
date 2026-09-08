/* ============================================================
   GARAGE FIELD UPGRADES
   Hand-built feature bundle for the Garage Inventions site.
   All features are real client-side machinery: live world data
   feeds, localStorage vault, Web Share, speech synthesis,
   canvas poster export, and a date-seeded daily challenge.
   ============================================================ */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  function toast(msg) {
    if (typeof window.showToast === "function") { window.showToast(msg); return; }
    var t = $("toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(function () { t.classList.remove("show"); }, 1800);
  }
  function el(tag, cls, html) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (html != null) d.innerHTML = html;
    return d;
  }
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  /* ---------- injected styles ---------- */
  var css = [
    ".live{margin:0 0 16px;background:rgba(16,23,22,.94);border:1px solid var(--line);padding:18px 20px;}",
    ".live-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:14px 0;}",
    ".live-tile{border:1px solid var(--line);padding:10px 12px;background:var(--panel-2);min-width:0;}",
    ".live-tile h4{margin:0 0 6px;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--cyan);font-weight:600;}",
    ".live-tile p{margin:0;font-size:11px;line-height:1.6;color:var(--ink);overflow-wrap:anywhere;}",
    ".live-tile p.dim{color:#72827f;}",
    ".vault{margin-top:16px;background:rgba(16,23,22,.94);border:1px solid var(--line);padding:20px;}",
    ".vault input[type=search]{width:100%;background:var(--black);border:1px solid var(--line);color:var(--ink);padding:10px 12px;margin:14px 0;font:inherit;font-size:12px;}",
    ".vault-item{border:1px solid var(--line);padding:12px 14px;margin-bottom:10px;background:var(--panel-2);}",
    ".vault-item h4{margin:0 0 4px;font-family:'Chakra Petch',sans-serif;font-size:17px;text-transform:uppercase;letter-spacing:-.01em;}",
    ".vault-item .meta{font-size:10px;color:#7c8d89;letter-spacing:.08em;text-transform:uppercase;margin-bottom:8px;}",
    ".vault-item .row{display:flex;gap:8px;flex-wrap:wrap;}",
    ".vault-empty{color:#72827f;font-size:12px;padding:8px 0;}",
    ".dossier .actions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;}",
    ".dossier .actions .secondary{flex:none;min-width:0;white-space:normal;line-height:1.5;}",
    ".voice-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:10px;font-size:10px;color:#7c8d89;text-transform:uppercase;letter-spacing:.08em;}",
    ".voice-row select,.voice-row input{font:inherit;}",
    ".voice-row select{background:var(--black);border:1px solid var(--line);color:var(--ink);padding:6px;font-size:11px;max-width:180px;}",
    ".part-links a{color:var(--acid);text-decoration:none;border-bottom:1px dotted var(--acid);margin-right:10px;font-size:11px;line-height:2;}",
    ".part-links a:hover{color:#fff;}",
    ".challenge{margin-top:18px;border:1px dashed var(--orange);padding:14px;background:rgba(255,107,44,.05);}",
    ".challenge h4{margin:0 0 8px;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--orange);}",
    ".challenge p{margin:0 0 12px;font-size:12px;line-height:1.6;color:var(--ink);}",
    ".challenge .row{display:flex;gap:8px;flex-wrap:wrap;}",
    "#printSheet{display:none;}",
    "@media print{",
    "  body.printing .page,body.printing .toast{display:none !important;}",
    "  body.printing #printSheet{display:block !important;color:#000;font-family:monospace;padding:24px;}",
    "  body.printing #printSheet h1{font-size:26px;margin:0 0 6px;}",
    "  body.printing #printSheet h2{font-size:13px;margin:18px 0 4px;text-transform:uppercase;letter-spacing:.1em;}",
    "  body.printing #printSheet p{font-size:13px;line-height:1.6;margin:0 0 6px;}",
    "}",
    "@media (max-width:900px){.live-grid{grid-template-columns:repeat(2,minmax(0,1fr));}.dossier .actions{grid-template-columns:repeat(2,minmax(0,1fr));}}"
  ].join("\n");
  var style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  /* ============================================================
     1. LIVE WORLD SIGNALS
     ============================================================ */
  var live = { weather: null, iss: null, moon: null, coords: null };

  var WMO = {
    0: "clear sky", 1: "mainly clear", 2: "partly cloudy", 3: "overcast",
    45: "fog", 48: "rime fog",
    51: "light drizzle", 53: "drizzle", 55: "heavy drizzle",
    56: "freezing drizzle", 57: "freezing drizzle",
    61: "light rain", 63: "rain", 65: "heavy rain",
    66: "freezing rain", 67: "freezing rain",
    71: "light snow", 73: "snow", 75: "heavy snow", 77: "snow grains",
    80: "light showers", 81: "showers", 82: "violent showers",
    85: "snow showers", 86: "snow showers",
    95: "thunderstorm", 96: "storm with hail", 99: "storm with hail"
  };

  function fetchTimeout(url, ms, opts) {
    var ctrl = new AbortController();
    var t = setTimeout(function () { ctrl.abort(); }, ms || 9000);
    return fetch(url, Object.assign({}, opts, { signal: ctrl.signal }))
      .then(function (r) {
        clearTimeout(t);
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .catch(function (e) { clearTimeout(t); throw e; });
  }

  function getCoords() {
    return new Promise(function (resolve) {
      if (navigator.geolocation) {
        var done = false;
        var timer = setTimeout(function () {
          if (!done) { done = true; ipFallback().then(resolve, function () { resolve(null); }); }
        }, 7000);
        navigator.geolocation.getCurrentPosition(function (pos) {
          if (!done) { done = true; clearTimeout(timer); resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude, src: "gps" }); }
        }, function () {
          if (!done) { done = true; clearTimeout(timer); ipFallback().then(resolve, function () { resolve(null); }); }
        }, { timeout: 6500, maximumAge: 600000 });
      } else {
        ipFallback().then(resolve, function () { resolve(null); });
      }
    });
    function ipFallback() {
      return fetchTimeout("https://ipapi.co/json/", 8000).then(function (j) {
        if (j && j.latitude && j.longitude) return { lat: j.latitude, lon: j.longitude, src: "ip" };
        throw new Error("no coords");
      });
    }
  }

  function loadWeather() {
    var p = $("sigWeather");
    return getCoords().then(function (c) {
      if (!c) throw new Error("location unavailable");
      live.coords = c;
      var url = "https://api.open-meteo.com/v1/forecast?latitude=" + c.lat.toFixed(3) +
        "&longitude=" + c.lon.toFixed(3) +
        "&current=temperature_2m,weather_code,wind_speed_10m&temperature_unit=celsius&timezone=auto";
      return fetchTimeout(url, 10000);
    }).then(function (j) {
      var cur = j.current;
      live.weather = {
        tempC: cur.temperature_2m,
        tempF: Math.round(cur.temperature_2m * 9 / 5 + 32),
        code: cur.weather_code,
        desc: WMO[cur.weather_code] || "unknown skies",
        wind: cur.wind_speed_10m
      };
      var w = live.weather;
      p.innerHTML = esc(w.tempF + "F / " + w.tempC.toFixed(1) + "C, " + w.desc + ", wind " + Math.round(w.wind) + " km/h");
      p.classList.remove("dim");
    }).catch(function () {
      live.weather = null;
      p.innerHTML = '<span class="dim">weather feed unreachable</span>';
    });
  }

  function haversineKm(a, b, c, d) {
    var R = 6371, t = Math.PI / 180;
    var s1 = Math.sin((c - a) * t / 2), s2 = Math.sin((d - b) * t / 2);
    var q = s1 * s1 + Math.cos(a * t) * Math.cos(c * t) * s2 * s2;
    return 2 * R * Math.asin(Math.sqrt(q));
  }

  function loadIss() {
    var p = $("sigIss");
    return fetchTimeout("https://api.wheretheiss.at/v1/satellites/25544", 10000)
      .catch(function () {
        return fetchTimeout("https://api.open-notify.org/iss-now.json", 10000).then(function (j) {
          return { latitude: parseFloat(j.iss_position.latitude), longitude: parseFloat(j.iss_position.longitude) };
        });
      })
      .then(function (j) {
        var lat = parseFloat(j.latitude), lon = parseFloat(j.longitude);
        var near = null;
        if (live.coords) {
          var km = haversineKm(live.coords.lat, live.coords.lon, lat, lon);
          near = km < 2500;
          live.iss = { lat: lat, lon: lon, kmAway: Math.round(km), overhead: near };
          p.textContent = "lat " + lat.toFixed(1) + ", lon " + lon.toFixed(1) + (near ? " - OVERHEAD" : " (" + Math.round(km) + " km away)");
        } else {
          live.iss = { lat: lat, lon: lon, kmAway: null, overhead: false };
          p.textContent = "lat " + lat.toFixed(1) + ", lon " + lon.toFixed(1);
        }
        p.classList.remove("dim");
      })
      .catch(function () {
        live.iss = null;
        p.innerHTML = '<span class="dim">orbital feed unreachable</span>';
      });
  }

  function loadMoon() {
    var p = $("sigMoon");
    try {
      var synodic = 29.530588853;
      var known = Date.UTC(2000, 0, 6, 18, 14) / 86400000;
      var now = Date.now() / 86400000;
      var phase = ((now - known) % synodic + synodic) % synodic / synodic;
      var names = ["New Moon", "Waxing Crescent", "First Quarter", "Waxing Gibbous",
        "Full Moon", "Waning Gibbous", "Last Quarter", "Waning Crescent"];
      var idx = Math.floor(phase * 8 + 0.5) % 8;
      var illum = Math.round((1 - Math.cos(2 * Math.PI * phase)) / 2 * 100);
      live.moon = { name: names[idx], illum: illum, phase: phase, full: idx === 4, new: idx === 0 };
      p.textContent = names[idx] + " (" + illum + "% lit)";
      p.classList.remove("dim");
    } catch (e) {
      p.innerHTML = '<span class="dim">lunar math failed</span>';
    }
  }

  function loadTime() {
    var p = $("sigTime");
    try {
      var d = new Date(), h = d.getHours();
      var label = h < 5 ? "deep night" : h < 12 ? "morning" : h < 17 ? "afternoon" : h < 21 ? "evening" : "night";
      live.timeOfDay = label;
      p.textContent = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + " (" + label + ")";
      p.classList.remove("dim");
    } catch (e) {
      p.innerHTML = '<span class="dim">clock broken</span>';
    }
  }

  function buildSignalsPanel() {
    var anchor = document.querySelector("section.signal");
    if (!anchor || $("liveSignals")) return;
    var sec = el("section", "live");
    sec.id = "liveSignals";
    sec.setAttribute("aria-label", "Live world signals");
    sec.innerHTML =
      '<div class="section-label"><span>Live world signals</span><span class="index">00</span></div>' +
      '<div class="live-grid">' +
      '<div class="live-tile"><h4>Weather</h4><p id="sigWeather" class="dim">scanning&hellip;</p></div>' +
      '<div class="live-tile"><h4>ISS position</h4><p id="sigIss" class="dim">scanning&hellip;</p></div>' +
      '<div class="live-tile"><h4>Moon</h4><p id="sigMoon" class="dim">scanning&hellip;</p></div>' +
      '<div class="live-tile"><h4>Local time</h4><p id="sigTime" class="dim">scanning&hellip;</p></div>' +
      "</div>" +
      '<button class="secondary" id="sigRefresh" style="max-width:220px;">Rescan signals</button>';
    anchor.parentNode.insertBefore(sec, anchor.nextSibling);
    $("sigRefresh").addEventListener("click", refreshSignals);
  }

  function refreshSignals() {
    ["sigWeather", "sigIss", "sigMoon", "sigTime"].forEach(function (id) {
      var n = $(id);
      n.innerHTML = '<span class="dim">scanning&hellip;</span>';
      n.classList.add("dim");
    });
    loadTime();
    loadMoon();
    loadWeather().then(function () { return loadIss(); }).then(updateInfluenceRow);
    toast("Rescanning the world");
  }

  function signalInfluences() {
    var out = [];
    var w = live.weather;
    if (w) {
      out.push(w.tempF + "F and " + w.desc + " outside");
      if (w.tempC >= 30) out.push("heat-rated components prioritized");
      if (w.tempC <= 5) out.push("cold-start circuitry specified");
      if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].indexOf(w.code) >= 0) out.push("enclosure sealed against precipitation");
      if ([71, 73, 75, 77, 85, 86].indexOf(w.code) >= 0) out.push("winterized lubricants specified");
      if ([95, 96, 99].indexOf(w.code) >= 0) out.push("lightning arrestors added, obviously");
      if (w.wind >= 30) out.push("wind-bracing added to the chassis");
    }
    if (live.iss && live.iss.overhead) out.push("ISS overhead: orbital relay window exploited");
    if (live.moon && live.moon.full) out.push("full moon: high-visibility night testing scheduled");
    if (live.moon && live.moon.new) out.push("new moon: light-pollution-free calibration run booked");
    if (live.timeOfDay === "deep night" || live.timeOfDay === "night") out.push("low-light operation assumed; running lights added");
    if (window.__dailyConstraint) out.push("daily constraint applied: " + window.__dailyConstraint);
    if (window.__crucibleCert) out.push(window.__crucibleCert);
    return out;
  }

  function currentInvention() {
    return {
      name: $("name").textContent,
      code: $("inventionId").textContent,
      purpose: $("purpose").textContent,
      built: $("built").textContent,
      power: $("power").textContent,
      failure: $("failure").textContent,
      utility: $("utilityText").textContent,
      signals: signalInfluences()
    };
  }

  function updateInfluenceRow() {
    var specs = document.querySelector(".dossier .specs");
    if (!specs) return;
    var row = $("liveInfluenceRow");
    if (!row) {
      row = el("div", "spec");
      row.id = "liveInfluenceRow";
      row.innerHTML = "<dt>Live signals</dt><dd id=\"liveInfluence\"></dd>";
      specs.appendChild(row);
    }
    var inf = signalInfluences();
    $("liveInfluence").textContent = inf.length
      ? inf.join(" / ")
      : "No live readings yet. Hit rescan above.";
  }

  /* ============================================================
     5. PARTS SOURCING (real shopping searches per component)
     ============================================================ */
  function updatePartLinks() {
    var specs = document.querySelector(".dossier .specs");
    if (!specs) return;
    var row = $("partLinksRow");
    if (!row) {
      row = el("div", "spec");
      row.id = "partLinksRow";
      row.innerHTML = "<dt>Source parts</dt><dd class=\"part-links\" id=\"partLinks\"></dd>";
      specs.appendChild(row);
    }
    var box = $("partLinks");
    box.innerHTML = "";
    var text = $("built").textContent;
    var parts = text.split(/,|\band\b/i).map(function (s) {
      return s.trim().replace(/^(a|an|the)\s+/i, "").replace(/\.$/, "");
    }).filter(function (s) { return s.length > 2; }).slice(0, 6);
    parts.forEach(function (part) {
      var a = document.createElement("a");
      a.href = "https://www.google.com/search?tbm=shop&q=" + encodeURIComponent("buy " + part);
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = part;
      box.appendChild(a);
    });
    if (!parts.length) box.innerHTML = '<span class="dim">no parts parsed</span>';
  }

  /* Watch for newly minted inventions and refresh derived rows */
  function hookInventionChanges() {
    updateInfluenceRow();
    updatePartLinks();
    var target = $("inventionId");
    if (!target || !window.MutationObserver) return;
    var obs = new MutationObserver(function () {
      updateInfluenceRow();
      updatePartLinks();
    });
    obs.observe(target, { childList: true, characterData: true, subtree: true });
  }

  /* ============================================================
     2. THE VAULT (localStorage collection)
     ============================================================ */
  var VAULT_KEY = "garage-vault-v1";
  function vaultLoad() {
    try {
      var raw = localStorage.getItem(VAULT_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function vaultSave(arr) {
    try { localStorage.setItem(VAULT_KEY, JSON.stringify(arr)); }
    catch (e) { toast("Vault storage is unavailable"); }
  }

  function dossierActions() {
    var box = document.querySelector(".dossier .actions");
    if (!box) return null;
    return box;
  }

  function addDossierButtons() {
    var box = dossierActions();
    if (!box || $("saveVaultBtn")) return;
    var mk = function (id, label, fn) {
      var b = el("button", "secondary", esc(label));
      b.id = id;
      b.addEventListener("click", fn);
      box.appendChild(b);
      return b;
    };
    mk("saveVaultBtn", "Save to vault", saveCurrentToVault);
    mk("shareBtn", "Share", function () { shareInvention(currentInvention()); });
    mk("narrateBtn", "Narrate", toggleNarration);
    mk("posterBtn", "Poster PNG", downloadPoster);
    var vr = el("div", "voice-row");
    vr.innerHTML = "<span>Voice</span>";
    var sel = el("select"); sel.id = "voiceSel"; sel.setAttribute("aria-label", "Narration voice");
    var rate = document.createElement("input");
    rate.type = "range"; rate.min = "0.6"; rate.max = "1.4"; rate.step = "0.1"; rate.value = "1";
    rate.id = "voiceRate"; rate.style.maxWidth = "110px"; rate.setAttribute("aria-label", "Narration rate");
    vr.appendChild(sel); vr.appendChild(rate);
    box.parentNode.insertBefore(vr, box.nextSibling);
    populateVoices();
    if (window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = populateVoices;
    }
  }

  function saveCurrentToVault() {
    var inv = currentInvention();
    inv.savedAt = new Date().toISOString();
    var arr = vaultLoad();
    arr.unshift(inv);
    vaultSave(arr);
    renderVault($("vaultSearch") ? $("vaultSearch").value : "");
    toast("Filed in the vault (" + arr.length + " specimens)");
  }

  function renderVault(filter) {
    var list = $("vaultList");
    if (!list) return;
    list.innerHTML = "";
    var q = (filter || "").toLowerCase();
    var arr = vaultLoad().filter(function (v) {
      return !q || (v.name + " " + v.code + " " + v.purpose).toLowerCase().indexOf(q) >= 0;
    });
    if (!arr.length) {
      list.appendChild(el("div", "vault-empty", q ? "Nothing in the vault matches." : "The vault is empty. Mint something worth keeping."));
      return;
    }
    arr.forEach(function (v, i) {
      var item = el("div", "vault-item");
      var d = new Date(v.savedAt);
      item.innerHTML =
        "<h4>" + esc(v.name) + "</h4>" +
        '<div class="meta">' + esc(v.code) + " &middot; " +
        (isNaN(d.getTime()) ? "undated" : d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })) +
        "</div>";
      var row = el("div", "row");
      var mk = function (label, fn) {
        var b = el("button", "secondary", esc(label));
        b.style.flex = "0 1 auto";
        b.addEventListener("click", function () { fn(v, i); });
        row.appendChild(b);
      };
      mk("Print sheet", function (inv) { printInvention(inv); });
      mk("Share", function (inv) { shareInvention(inv); });
      mk("Delete", function (inv, idx) {
        var all = vaultLoad();
        all.splice(idx, 1);
        vaultSave(all);
        renderVault($("vaultSearch").value);
        toast("Specimen scrapped");
      });
      item.appendChild(row);
      list.appendChild(item);
    });
  }

  function buildVaultSection() {
    var main = document.querySelector("main.page");
    if (!main || $("vaultSection")) return;
    var sec = el("section", "vault");
    sec.id = "vaultSection";
    sec.innerHTML =
      '<div class="section-label"><span>The vault</span><span class="index">02</span></div>' +
      '<input type="search" id="vaultSearch" placeholder="Search the vault&hellip;" aria-label="Search the vault" />' +
      '<div id="vaultList"></div>' +
      '<div class="row" style="display:flex;gap:8px;flex-wrap:wrap;">' +
      '<button class="secondary" id="vaultExport" style="flex:0 1 auto;">Export vault as JSON</button>' +
      "</div>";
    main.appendChild(sec);
    $("vaultSearch").addEventListener("input", function (e) { renderVault(e.target.value); });
    $("vaultExport").addEventListener("click", function () {
      var arr = vaultLoad();
      if (!arr.length) { toast("Vault is empty"); return; }
      var blob = new Blob([JSON.stringify(arr, null, 2)], { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "garage-vault.json";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
      toast("Vault exported (" + arr.length + " specimens)");
    });
    renderVault("");
  }

  function printInvention(v) {
    var sheet = $("printSheet");
    if (!sheet) {
      sheet = el("div"); sheet.id = "printSheet";
      document.body.appendChild(sheet);
    }
    var sig = (v.signals && v.signals.length) ? v.signals.join(" / ") : "No live signals recorded.";
    sheet.innerHTML =
      "<h1>" + esc(v.name) + "</h1>" +
      "<p><strong>" + esc(v.code) + "</strong> &middot; Garage Inventions build sheet</p>" +
      "<h2>Purpose</h2><p>" + esc(v.purpose) + "</p>" +
      "<h2>Built from</h2><p>" + esc(v.built) + "</p>" +
      "<h2>Power source</h2><p>" + esc(v.power) + "</p>" +
      "<h2>Known side effect</h2><p>" + esc(v.failure) + "</p>" +
      "<h2>Utility</h2><p>" + esc(v.utility) + "</p>" +
      "<h2>Live signals at minting</h2><p>" + esc(sig) + "</p>" +
      "<p>Reality is optional. Utility is not.</p>";
    document.body.classList.add("printing");
    var done = function () {
      document.body.classList.remove("printing");
      window.removeEventListener("afterprint", done);
    };
    window.addEventListener("afterprint", done);
    setTimeout(function () { window.print(); }, 60);
  }

  /* ============================================================
     3. SHARE (Web Share API with clipboard fallback)
     ============================================================ */
  var SITE_URL = "https://dillingerstaffing.github.io/garage-inventions/";
  function shareCardText(v) {
    return v.name + " (" + v.code + ")\n" +
      "Purpose: " + v.purpose + "\n" +
      "Built from: " + v.built + "\n" +
      "Powered by: " + v.power + "\n" +
      "Side effect: " + v.failure + "\n" +
      "Utility: " + v.utility + "\n" +
      "Minted in the Garage: " + SITE_URL;
  }
  function shareInvention(v) {
    var text = shareCardText(v);
    if (navigator.share) {
      navigator.share({ title: v.name + " - Garage Inventions", text: text, url: SITE_URL })
        .then(function () { toast("Invention dispatched"); })
        .catch(function () { /* user dismissed */ });
    } else if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        function () { toast("Invention card copied"); },
        function () { toast("Sharing is unavailable"); });
    } else {
      toast("Sharing is unavailable on this device");
    }
  }

  /* ============================================================
     4. SPOKEN SCHEMATICS (speech synthesis)
     ============================================================ */
  var speaking = false;
  function populateVoices() {
    var sel = $("voiceSel");
    if (!sel || !window.speechSynthesis) return;
    var voices = window.speechSynthesis.getVoices();
    sel.innerHTML = "";
    voices.forEach(function (voice, i) {
      var o = document.createElement("option");
      o.value = i;
      o.textContent = voice.name + " (" + voice.lang + ")";
      sel.appendChild(o);
    });
    var pref = voices.findIndex(function (v) { return /en/i.test(v.lang) && /female|samantha|zira|google us english/i.test(v.name); });
    sel.value = String(pref >= 0 ? pref : 0);
  }
  function toggleNarration() {
    if (!window.speechSynthesis) { toast("Speech is unavailable here"); return; }
    if (speaking) {
      window.speechSynthesis.cancel();
      speaking = false;
      $("narrateBtn").textContent = "Narrate";
      return;
    }
    var v = currentInvention();
    var script = "Behold the " + v.name + ". " + v.purpose + " " +
      "It is built from " + v.built + " " +
      "Powered by " + v.power + " " +
      "Warning. " + v.failure + " " +
      "Utility assessment: " + v.utility + ".";
    var u = new SpeechSynthesisUtterance(script);
    var sel = $("voiceSel");
    var voices = window.speechSynthesis.getVoices();
    if (sel && voices[Number(sel.value)]) u.voice = voices[Number(sel.value)];
    var rate = $("voiceRate");
    u.rate = rate ? Number(rate.value) : 1;
    u.pitch = 0.85;
    u.onend = u.onerror = function () {
      speaking = false;
      var b = $("narrateBtn");
      if (b) b.textContent = "Narrate";
    };
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    speaking = true;
    $("narrateBtn").textContent = "Stop";
    toast("Narrating the schematic");
  }

  /* ============================================================
     6. BLUEPRINT POSTER (canvas PNG export)
     ============================================================ */
  function wrapText(ctx, text, x, y, maxW, lh) {
    var words = String(text).split(/\s+/), line = "", yy = y;
    words.forEach(function (w) {
      var t = line ? line + " " + w : w;
      if (ctx.measureText(t).width > maxW && line) { ctx.fillText(line, x, yy); line = w; yy += lh; }
      else line = t;
    });
    ctx.fillText(line, x, yy);
    return yy + lh;
  }
  function downloadPoster() {
    try {
      var v = currentInvention();
      var W = 1200, H = 1600;
      var c = document.createElement("canvas");
      c.width = W; c.height = H;
      var x = c.getContext("2d");
      x.fillStyle = "#0a1416"; x.fillRect(0, 0, W, H);
      x.strokeStyle = "rgba(88,228,232,.12)"; x.lineWidth = 1;
      for (var gx = 0; gx <= W; gx += 40) { x.beginPath(); x.moveTo(gx, 0); x.lineTo(gx, H); x.stroke(); }
      for (var gy = 0; gy <= H; gy += 40) { x.beginPath(); x.moveTo(0, gy); x.lineTo(W, gy); x.stroke(); }
      x.strokeStyle = "#58e4e8"; x.lineWidth = 3; x.strokeRect(30, 30, W - 60, H - 60);
      x.fillStyle = "#58e4e8"; x.font = "600 28px monospace";
      x.fillText("GARAGE INVENTIONS // UNLICENSED BLUEPRINT", 70, 105);
      x.strokeStyle = "#c7ff38"; x.lineWidth = 2;
      x.beginPath(); x.moveTo(70, 130); x.lineTo(W - 70, 130); x.stroke();
      var y = 210;
      x.fillStyle = "#ff6b2c"; x.font = "600 24px monospace";
      x.fillText(v.code, 70, y); y += 70;
      x.fillStyle = "#e9f4e8"; x.font = "700 64px sans-serif";
      y = wrapText(x, v.name.toUpperCase(), 70, y, W - 140, 74) + 30;
      x.font = "24px monospace";
      var sections = [
        ["PURPOSE", v.purpose], ["BUILT FROM", v.built], ["POWER SOURCE", v.power],
        ["KNOWN SIDE EFFECT", v.failure], ["UTILITY", v.utility]
      ];
      sections.forEach(function (s) {
        if (y > H - 260) return;
        x.fillStyle = "#c7ff38"; x.font = "600 24px monospace";
        x.fillText(s[0], 70, y); y += 40;
        x.fillStyle = "#d5e2df"; x.font = "24px monospace";
        y = wrapText(x, s[1], 70, y, W - 140, 36) + 28;
      });
      x.strokeStyle = "rgba(199,255,56,.5)"; x.lineWidth = 2;
      [0, 1, 2].forEach(function (i) {
        x.beginPath(); x.arc(W - 220, H - 220, 60 + i * 45, 0, Math.PI * 2); x.stroke();
      });
      x.fillStyle = "#58e4e8"; x.font = "600 22px monospace";
      x.fillText("REV " + Date.now().toString(36).toUpperCase(), 70, H - 70);
      x.fillText("REALITY IS OPTIONAL. UTILITY IS NOT.", 70, H - 110);
      var a = document.createElement("a");
      a.href = c.toDataURL("image/png");
      a.download = v.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-blueprint.png";
      document.body.appendChild(a); a.click(); a.remove();
      toast("Blueprint poster downloaded");
    } catch (e) { toast("Poster rendering failed"); }
  }

  /* ============================================================
     7. DAILY CONSTRAINT CHALLENGE (date-seeded)
     ============================================================ */
  function xmur3(str) {
    var h = 1779033703 ^ str.length;
    for (var i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = h << 13 | h >>> 19; }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      return (h ^= h >>> 16) >>> 0;
    };
  }
  function sfc32(a, b, c, d) {
    return function () {
      a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
      var t = (a + b | 0) + d | 0;
      d = d + 1 | 0; a = b ^ b >>> 9; b = c + (c << 3) | 0;
      c = c << 21 | c >>> 11; c = c + t | 0;
      return (t >>> 0) / 4294967296;
    };
  }
  function dailyChallenge() {
    var day = new Date().toISOString().slice(0, 10);
    var seed = xmur3("garage-" + day)();
    var rnd = sfc32(seed, seed ^ 0x9e3779b9, seed ^ 0x85ebca6b, seed ^ 0xc2b2ae35);
    var pick = function (arr) { return arr[Math.floor(rnd() * arr.length)]; };
    var component = pick(["a rubber band", "a bicycle dynamo", "a mason jar", "a microwave turntable motor",
      "a garden hose", "a broken umbrella", "a CRT monitor", "a bag of concrete", "a kazoo",
      "a smoke detector", "a toaster", "a leaf blower", "a disco ball", "a fire extinguisher"]);
    var power = pick(["a potato battery", "solar", "a hand crank", "harvested static electricity",
      "a compost pile", "a water wheel", "a hamster wheel", "a theremin"]);
    var env = pick(["underwater", "in a thunderstorm", "during a blackout", "at 3 a.m.",
      "in zero gravity", "in a sauna", "in a sandstorm", "on a moving train"]);
    var twist = pick(["must be silent", "must fit in a pocket", "must be fixable with duct tape",
      "must run 10 years unattended", "must be operable by a raccoon", "must survive being dropped off a roof"]);
    return { day: day, text: "build it with " + component + ", powered by " + power + ", survives " + env + ", and it " + twist };
  }
  function buildChallengeBox() {
    var aside = document.querySelector("aside.controls");
    if (!aside || $("dailyChallenge")) return;
    var ch = dailyChallenge();
    var box = el("div", "challenge");
    box.id = "dailyChallenge";
    box.innerHTML =
      "<h4>Daily constraint // " + esc(ch.day) + "</h4>" +
      "<p>" + esc(ch.text) + ".</p>" +
      '<div class="row">' +
      '<button class="secondary" id="chMint" style="flex:1;">Mint under constraint</button>' +
      '<button class="secondary" id="chShare" style="flex:1;">Share challenge</button>' +
      "</div>";
    aside.appendChild(box);
    $("chMint").addEventListener("click", function () {
      window.__dailyConstraint = ch.text;
      if (typeof window.generate === "function") window.generate();
      updateInfluenceRow();
      toast("Constraint applied. No excuses.");
    });
    $("chShare").addEventListener("click", function () {
      var text = "Garage daily constraint (" + ch.day + "): " + ch.text + ". " + SITE_URL;
      if (navigator.share) {
        navigator.share({ title: "Garage daily constraint", text: text, url: SITE_URL }).catch(function () {});
      } else if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { toast("Challenge copied"); });
      } else { toast("Sharing is unavailable"); }
    });
  }

  /* ============================================================
     INIT
     ============================================================ */
  function init() {
    buildSignalsPanel();
    buildChallengeBox();
    addDossierButtons();
    buildVaultSection();
    hookInventionChanges();
    refreshSignals();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

  /* ============================================================
     8. THE CRUCIBLE: reactor stability trial (playable)
     Keep the reaction needle inside the green band for 30 seconds.
     Vent cools it down, stoke drives it up. Survive and the
     invention earns a crucible-forged certification.
     ============================================================ */
  var crucible = null;

  function buildCrucible() {
    var box = document.querySelector(".dossier .actions");
    if (!box || $("crucibleBtn")) return;
    var css2 = [
      ".crucible-overlay{position:fixed;inset:0;z-index:9999;background:rgba(4,8,8,.92);display:none;align-items:center;justify-content:center;padding:16px;}",
      ".crucible-overlay.open{display:flex;}",
      ".crucible-panel{width:min(780px,100%);background:#0a1416;border:1px solid var(--cyan);padding:16px;}",
      ".crucible-panel h3{margin:0 0 4px;font-family:'Chakra Petch',sans-serif;text-transform:uppercase;letter-spacing:.02em;}",
      ".crucible-panel .sub{font-size:11px;color:#7c8d89;margin:0 0 12px;text-transform:uppercase;letter-spacing:.1em;}",
      ".crucible-panel canvas{width:100%;height:auto;display:block;background:#060b0c;border:1px solid var(--line);touch-action:none;}",
      ".crucible-controls{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px;}",
      ".crucible-controls button{padding:18px;font-family:'Chakra Petch',sans-serif;font-size:15px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;border:1px solid var(--line);background:var(--panel-2);color:var(--ink);user-select:none;-webkit-user-select:none;touch-action:none;}",
      "#cruVent{border-color:var(--cyan);color:var(--cyan);}",
      "#cruStoke{border-color:var(--orange);color:var(--orange);}",
      ".crucible-controls button.held{background:rgba(88,228,232,.18);}",
      ".crucible-foot{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;}",
      ".crucible-foot .secondary{flex:1;}"
    ].join("\n");
    var st = document.createElement("style");
    st.textContent = css2;
    document.head.appendChild(st);

    var b = el("button", "secondary", "Enter the Crucible");
    b.id = "crucibleBtn";
    b.addEventListener("click", openCrucible);
    box.appendChild(b);

    var ov = el("div", "crucible-overlay");
    ov.id = "crucibleOverlay";
    ov.innerHTML =
      '<div class="crucible-panel" role="dialog" aria-label="The Crucible trial">' +
      "<h3>The Crucible</h3>" +
      '<p class="sub">Hold the needle in the green band for 30 seconds. Vent cools, stoke heats.</p>' +
      '<canvas id="cruCanvas" width="720" height="460"></canvas>' +
      '<div class="crucible-controls">' +
      '<button id="cruVent">Vent</button>' +
      '<button id="cruStoke">Stoke</button>' +
      "</div>" +
      '<div class="crucible-foot">' +
      '<button class="secondary" id="cruRestart">Run it again</button>' +
      '<button class="secondary" id="cruClose">Close</button>' +
      "</div></div>";
    document.body.appendChild(ov);

    crucible = {
      overlay: ov,
      canvas: $("cruCanvas"),
      running: false, won: false, lost: false,
      stability: 55, integrity: 100, timeLeft: 30,
      vent: false, stoke: false,
      shockTimer: 2.5, shake: 0, particles: [], raf: 0, last: 0
    };

    var bindHold = function (id, key) {
      var btn = $(id);
      var on = function (e) { e.preventDefault(); crucible[key] = true; btn.classList.add("held"); };
      var off = function () { crucible[key] = false; btn.classList.remove("held"); };
      btn.addEventListener("pointerdown", on);
      btn.addEventListener("pointerup", off);
      btn.addEventListener("pointerleave", off);
      btn.addEventListener("pointercancel", off);
    };
    bindHold("cruVent", "vent");
    bindHold("cruStoke", "stoke");

    document.addEventListener("keydown", function (e) {
      if (!crucible.overlay.classList.contains("open")) return;
      if (e.key === "ArrowLeft" || e.key === "a") crucible.vent = true;
      if (e.key === "ArrowRight" || e.key === "d") crucible.stoke = true;
    });
    document.addEventListener("keyup", function (e) {
      if (e.key === "ArrowLeft" || e.key === "a") crucible.vent = false;
      if (e.key === "ArrowRight" || e.key === "d") crucible.stoke = false;
    });

    $("cruRestart").addEventListener("click", startCrucible);
    $("cruClose").addEventListener("click", closeCrucible);
  }

  function openCrucible() {
    crucible.overlay.classList.add("open");
    startCrucible();
  }
  function closeCrucible() {
    crucible.overlay.classList.remove("open");
    crucible.running = false;
    cancelAnimationFrame(crucible.raf);
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  }
  function startCrucible() {
    crucible.running = true; crucible.won = false; crucible.lost = false;
    crucible.stability = 55; crucible.integrity = 100; crucible.timeLeft = 30;
    crucible.vent = false; crucible.stoke = false;
    crucible.shockTimer = 2.5; crucible.shake = 0; crucible.particles = [];
    crucible.last = performance.now();
    cancelAnimationFrame(crucible.raf);
    crucible.raf = requestAnimationFrame(crucibleTick);
  }

  function crucibleSpawn(n, good) {
    for (var i = 0; i < n; i++) {
      crucible.particles.push({
        x: 360 + (Math.random() - 0.5) * 160,
        y: 210 + (Math.random() - 0.5) * 120,
        vx: (Math.random() - 0.5) * 60,
        vy: -40 - Math.random() * 80,
        life: 0.8 + Math.random() * 0.8,
        color: good ? "#c7ff38" : "#ff6b2c"
      });
    }
  }

  function crucibleTick(now) {
    var c = crucible;
    if (!c.running) return;
    var dt = Math.min(0.05, (now - c.last) / 1000);
    c.last = now;

    c.shockTimer -= dt;
    if (c.shockTimer <= 0) {
      c.shockTimer = 2 + Math.random() * 3;
      var imp = (Math.random() < 0.5 ? -1 : 1) * (10 + Math.random() * 16);
      c.stability += imp;
      c.shake = 10;
      crucibleSpawn(14, false);
    }
    c.stability += (Math.random() - 0.5) * 22 * dt;
    c.stability += Math.sin(now / 700) * 6 * dt;
    if (c.vent) c.stability -= 30 * dt;
    if (c.stoke) c.stability += 30 * dt;
    c.stability = Math.max(0, Math.min(100, c.stability));

    var inBand = c.stability >= 40 && c.stability <= 70;
    if (inBand) {
      c.integrity = Math.min(100, c.integrity + 6 * dt);
      if (Math.random() < dt * 8) crucibleSpawn(2, true);
    } else {
      var dist = c.stability < 40 ? 40 - c.stability : c.stability - 70;
      c.integrity -= (8 + dist * 1.4) * dt;
      if (Math.random() < dt * 20) crucibleSpawn(3, false);
    }
    c.timeLeft -= dt;
    c.shake = Math.max(0, c.shake - 30 * dt);

    for (var i = c.particles.length - 1; i >= 0; i--) {
      var p = c.particles[i];
      p.life -= dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.life <= 0) c.particles.splice(i, 1);
    }

    if (c.integrity <= 0 && !c.lost) {
      c.integrity = 0; c.lost = true; c.running = false;
      crucibleSpawn(60, false);
    } else if (c.timeLeft <= 0 && !c.won) {
      c.timeLeft = 0; c.won = true; c.running = false;
      crucibleSpawn(80, true);
      var v = (typeof currentInvention === "function") ? currentInvention() : null;
      window.__crucibleCert = "crucible-forged" + (v ? " (" + v.name + ")" : "") + " " + new Date().toISOString().slice(0, 10);
      if (typeof updateInfluenceRow === "function") updateInfluenceRow();
      toast("FORGED. The invention survived the Crucible.");
    }

    crucibleDraw();
    if (c.running || c.particles.length) c.raf = requestAnimationFrame(crucibleTick);
    else crucibleDrawEnd();
  }

  function crucibleDraw() {
    var c = crucible, ctx = c.canvas.getContext("2d");
    var W = 720, H = 460;
    ctx.save();
    ctx.fillStyle = "#060b0c";
    ctx.fillRect(0, 0, W, H);
    if (c.shake > 0) ctx.translate((Math.random() - 0.5) * c.shake, (Math.random() - 0.5) * c.shake);

    var gx = 60, gw = 600;
    var sx = function (v) { return gx + (v / 100) * gw; };

    ctx.fillStyle = "#101716";
    ctx.fillRect(gx, 330, gw, 46);
    ctx.fillStyle = "rgba(199,255,56,.22)";
    ctx.fillRect(sx(40), 330, sx(70) - sx(40), 46);
    ctx.strokeStyle = "#c7ff38"; ctx.lineWidth = 2;
    ctx.strokeRect(sx(40), 330, sx(70) - sx(40), 46);
    ctx.fillStyle = "#7c8d89"; ctx.font = "600 16px monospace";
    ctx.fillText("0", gx, 400); ctx.fillText("100", gx + gw - 30, 400);
    ctx.fillStyle = "#c7ff38";
    ctx.fillText("KEEP THE NEEDLE IN THE GREEN", gx, 322);

    var nx = sx(c.stability);
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(nx, 322); ctx.lineTo(nx, 384); ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.moveTo(nx - 8, 322); ctx.lineTo(nx + 8, 322); ctx.lineTo(nx, 310); ctx.fill();

    var danger = c.stability < 40 ? (40 - c.stability) / 40 : c.stability > 70 ? (c.stability - 70) / 30 : 0;
    var pulse = 1 + Math.sin(performance.now() / 180) * 0.06;
    var coreR = 62 * pulse;
    var grad = ctx.createRadialGradient(360, 200, 8, 360, 200, coreR + 40);
    var hot = danger > 0.02;
    grad.addColorStop(0, hot ? "rgba(255,70,104,.9)" : "rgba(199,255,56,.75)");
    grad.addColorStop(1, "rgba(6,11,12,0)");
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(360, 200, coreR + 40, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = hot ? "#ff4668" : "#c7ff38"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(360, 200, coreR, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = "rgba(88,228,232,.5)"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(360, 200, coreR + 22, 0, Math.PI * 2); ctx.stroke();

    c.particles.forEach(function (p) {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, 3, 3);
    });
    ctx.globalAlpha = 1;

    ctx.fillStyle = "#7c8d89"; ctx.font = "600 16px monospace";
    ctx.fillText("HULL INTEGRITY", gx, 52);
    var bw = 300;
    ctx.fillStyle = "#101716"; ctx.fillRect(gx, 60, bw, 20);
    var ic = c.integrity > 50 ? "#c7ff38" : c.integrity > 25 ? "#ff6b2c" : "#ff4668";
    ctx.fillStyle = ic; ctx.fillRect(gx, 60, bw * (c.integrity / 100), 20);
    ctx.strokeStyle = "#2a3b37"; ctx.strokeRect(gx, 60, bw, 20);
    ctx.fillStyle = "#e9f4e8"; ctx.font = "700 22px monospace";
    ctx.fillText(Math.ceil(c.integrity) + "%", gx + bw + 14, 78);

    ctx.fillStyle = "#7c8d89"; ctx.font = "600 16px monospace";
    ctx.fillText("TIME", gx + 470, 52);
    ctx.fillStyle = "#58e4e8"; ctx.font = "700 30px monospace";
    ctx.fillText(Math.ceil(c.timeLeft) + "s", gx + 470, 80);

    ctx.restore();
  }

  function crucibleDrawEnd() {
    var c = crucible, ctx = c.canvas.getContext("2d");
    ctx.save();
    ctx.fillStyle = "rgba(4,8,8,.72)";
    ctx.fillRect(0, 0, 720, 460);
    ctx.textAlign = "center";
    if (c.won) {
      ctx.fillStyle = "#c7ff38"; ctx.font = "700 84px sans-serif";
      ctx.fillText("FORGED", 360, 210);
      ctx.fillStyle = "#e9f4e8"; ctx.font = "20px monospace";
      ctx.fillText("The invention survived the full burn.", 360, 260);
      ctx.fillText("Certification stamped on its record.", 360, 292);
    } else {
      ctx.fillStyle = "#ff4668"; ctx.font = "700 72px sans-serif";
      ctx.fillText("MELTDOWN", 360, 210);
      ctx.fillStyle = "#e9f4e8"; ctx.font = "20px monospace";
      ctx.fillText("Hull integrity reached zero.", 360, 260);
      ctx.fillText("The garage salutes your sacrifice.", 360, 292);
    }
    ctx.restore();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", buildCrucible);
  } else {
    buildCrucible();
  }
