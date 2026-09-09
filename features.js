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
    var steps = [buildSignalsPanel, buildChallengeBox, addDossierButtons, buildVaultSection, hookInventionChanges, refreshSignals];
    for (var i = 0; i < steps.length; i++) {
      try { steps[i](); } catch (e) { if (window.console && console.warn) console.warn("garage feature failed", e); }
    }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

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

  /* ============================================================
     8. WIRE THE PROTOTYPE (circuit puzzle bench)
     Real machinery: a solvable-by-construction pipe puzzle on canvas.
     Tap tiles to rotate them and link the battery to the invention
     before the capacitor charge runs out. Win stamps the dossier and
     unlocks a downloadable wiring certificate. Lose shorts the board.
     ============================================================ */
  var WP = {
    DX: { 1: 0, 2: 1, 4: 0, 8: -1 },
    DY: { 1: -1, 2: 0, 4: 1, 8: 0 },
    OPP: { 1: 4, 2: 8, 4: 1, 8: 2 },
    BASE: { I: 10, L: 3, T: 11, X: 15, SRC: 2, SNK: 8 }
  };
  var WP_LEVEL = 1;
  var wpg = null;

  function wpRot(mask, r) {
    r = r & 3;
    return ((mask << r) | (mask >> (4 - r))) & 15;
  }
  function wpBit(dx, dy) {
    if (dx === 1) return 2;
    if (dx === -1) return 8;
    if (dy === 1) return 4;
    return 1;
  }
  function wpMaskOf(cell) {
    return wpRot(WP.BASE[cell.type], cell.rot);
  }

  function wpFindPath(n, sy, ey) {
    function k(x, y) { return y * n + x; }
    var path = [[0, sy]], seen = {};
    seen[k(0, sy)] = 1;
    var guard = 0;
    while (path.length && guard < 4000) {
      guard++;
      var last = path[path.length - 1];
      if (last[0] === n - 1 && last[1] === ey) return path;
      var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (var i = dirs.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var t = dirs[i]; dirs[i] = dirs[j]; dirs[j] = t;
      }
      var moved = false;
      for (var d = 0; d < 4; d++) {
        var nx = last[0] + dirs[d][0], ny = last[1] + dirs[d][1];
        if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
        if (seen[k(nx, ny)]) continue;
        path.push([nx, ny]); seen[k(nx, ny)] = 1; moved = true; break;
      }
      if (!moved) { var p = path.pop(); delete seen[k(p[0], p[1])]; }
    }
    return null;
  }

  function wpSolved(cells, n, snkIdx) {
    var seen = {}, q = [];
    var start = -1;
    for (var s = 0; s < n * n; s++) if (cells[s].type === "SRC") { start = s; break; }
    if (start < 0) return { ok: false, set: seen };
    seen[start] = 1; q.push(start);
    var dirs = [1, 2, 4, 8];
    while (q.length) {
      var i = q.pop(), x = i % n, y = (i / n) | 0;
      var mask = wpMaskOf(cells[i]);
      for (var a = 0; a < 4; a++) {
        var d = dirs[a];
        if (!(mask & d)) continue;
        var nx = x + WP.DX[d], ny = y + WP.DY[d];
        if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
        var j = ny * n + nx;
        if (!(wpMaskOf(cells[j]) & WP.OPP[d])) continue;
        if (!seen[j]) { seen[j] = 1; q.push(j); }
      }
    }
    return { ok: !!seen[snkIdx], set: seen };
  }

  function wpNewBoard(level) {
    wpStopTick();
    var n = 4 + level, sy = Math.floor(Math.random() * n), ey = Math.floor(Math.random() * n);
    var path = null, tries = 0;
    while (!path && tries < 60) {
      tries++;
      var cand = wpFindPath(n, sy, ey);
      if (!cand || cand.length < 3) continue;
      var p1 = cand[1], pn = cand[cand.length - 2];
      if (p1[0] === 1 && p1[1] === sy && pn[0] === n - 2 && pn[1] === ey) path = cand;
    }
    if (!path) {
      path = [];
      for (var fx = 0; fx <= n - 2; fx++) path.push([fx, sy]);
      var step = ey > sy ? 1 : -1;
      for (var fy = sy + step; step > 0 ? fy <= ey : fy >= ey; fy += step) path.push([n - 2, fy]);
      path.push([n - 1, ey]);
    }
    var cells = [];
    for (var i = 0; i < n * n; i++) cells.push({ type: "X", rot: 0 });
    var onPath = {}, interior = [];
    path.forEach(function (p, idx) {
      var x = p[0], y = p[1], ci = y * n + x;
      onPath[ci] = 1;
      if (idx === 0) { cells[ci] = { type: "SRC", rot: 0, fixed: true }; return; }
      if (idx === path.length - 1) { cells[ci] = { type: "SNK", rot: 0, fixed: true }; return; }
      var a = path[idx - 1], b = path[idx + 1];
      var need = wpBit(a[0] - x, a[1] - y) | wpBit(b[0] - x, b[1] - y);
      var done = false;
      ["I", "L"].forEach(function (tp) {
        if (done) return;
        for (var r = 0; r < 4; r++) {
          if (wpRot(WP.BASE[tp], r) === need) { cells[ci] = { type: tp, rot: r }; done = true; break; }
        }
      });
      interior.push(ci);
    });
    var noise = ["I", "L", "T", "X"];
    for (var q = 0; q < n * n; q++) {
      if (onPath[q]) continue;
      cells[q] = { type: noise[Math.floor(Math.random() * noise.length)], rot: Math.floor(Math.random() * 4) };
    }
    interior.forEach(function (ci) {
      cells[ci].rot = (cells[ci].rot + 1 + Math.floor(Math.random() * 3)) % 4;
    });
    var snk = path[path.length - 1], snkIdx = snk[1] * n + snk[0];
    var guard = 0;
    while (wpSolved(cells, n, snkIdx).ok && guard < 80) {
      var ci2 = interior[Math.floor(Math.random() * interior.length)];
      cells[ci2].rot = (cells[ci2].rot + 1) % 4;
      guard++;
    }
    var pathLen = Math.max(1, path.length - 2);
    var full = Math.max(100, 60 + 8 * pathLen);
    wpg = {
      n: n, cells: cells, level: level, snkIdx: snkIdx,
      charge: full, maxCharge: full, moves: 0, elapsed: 0,
      running: true, won: false, lost: false, par: pathLen, timer: null
    };
    $("wpResult").style.display = "none";
    $("wpCertBtn").disabled = true;
    wpStartTick();
    wpHUD();
    wpDraw();
  }

  function wpStartTick() {
    if (!wpg || wpg.timer) return;
    wpg.timer = setInterval(function () {
      if (!wpg || !wpg.running) return;
      if (!$("wpOverlay") || !$("wpOverlay").classList.contains("open")) return;
      wpg.elapsed += 0.2;
      wpg.charge -= 0.1;
      if (wpg.charge <= 0) { wpFail(); return; }
      wpHUD();
    }, 200);
  }
  function wpStopTick() {
    if (wpg && wpg.timer) { clearInterval(wpg.timer); wpg.timer = null; }
  }

  function wpChargeColor() {
    var f = wpg.charge / wpg.maxCharge;
    return f > 0.5 ? "#c7ff38" : f > 0.25 ? "#ff6b2c" : "#ff4668";
  }
  function wpFmtTime(s) {
    s = Math.floor(s);
    return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2);
  }
  function wpBest() {
    try { return JSON.parse(localStorage.getItem("garage_wire_best_v1") || "{}"); }
    catch (e) { return {}; }
  }
  function wpHUD() {
    if (!wpg) return;
    var fill = $("wpChargeFill"), txt = $("wpChargeTxt");
    var pct = Math.max(0, Math.round(100 * wpg.charge / wpg.maxCharge));
    fill.style.width = pct + "%";
    fill.style.background = wpChargeColor();
    txt.textContent = pct + "% charge";
    $("wpMoves").textContent = wpg.moves + " moves";
    $("wpTime").textContent = wpFmtTime(wpg.elapsed);
    $("wpPar").textContent = "par " + wpg.par;
    var b = wpBest()[wpg.level];
    $("wpBest").textContent = b ? ("best " + b.moves + " moves") : "no best yet";
  }

  function wpDraw() {
    var cv = $("wpCanvas");
    if (!cv || !wpg) return;
    var ctx = cv.getContext("2d"), S = 640, n = wpg.n, cell = S / n;
    ctx.fillStyle = "#060b0c";
    ctx.fillRect(0, 0, S, S);
    var sol = wpSolved(wpg.cells, n, wpg.snkIdx), en = sol.set;
    var lw = Math.max(4, cell * 0.14);
    for (var y = 0; y < n; y++) {
      for (var x = 0; x < n; x++) {
        var ci = y * n + x, c = wpg.cells[ci];
        var cx = x * cell + cell / 2, cy = y * cell + cell / 2;
        ctx.fillStyle = ((x + y) % 2) ? "#0a1214" : "#0c1618";
        ctx.fillRect(x * cell + 1, y * cell + 1, cell - 2, cell - 2);
        var hot = !!en[ci];
        if (c.type === "SRC") {
          ctx.fillStyle = "#ff6b2c";
          ctx.fillRect(cx - cell * 0.26, cy - cell * 0.26, cell * 0.52, cell * 0.52);
          ctx.fillStyle = "#0a1416";
          ctx.font = "700 " + Math.round(cell * 0.4) + "px monospace";
          ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText("+", cx, cy + 1);
          ctx.fillStyle = "#ff6b2c";
          ctx.fillRect(cx + cell * 0.26, cy - cell * 0.1, cell * 0.12, cell * 0.2);
        } else if (c.type === "SNK") {
          ctx.lineWidth = 3;
          ctx.strokeStyle = hot ? "#c7ff38" : "#58e4e8";
          if (hot) { ctx.shadowColor = "#c7ff38"; ctx.shadowBlur = 18; }
          ctx.beginPath(); ctx.arc(cx, cy, cell * 0.3, 0, Math.PI * 2); ctx.stroke();
          ctx.shadowBlur = 0;
          if (hot) {
            ctx.fillStyle = "#c7ff38";
            ctx.beginPath(); ctx.arc(cx, cy, cell * 0.16, 0, Math.PI * 2); ctx.fill();
          } else {
            ctx.fillStyle = "#58e4e8";
            ctx.font = "600 " + Math.round(cell * 0.22) + "px monospace";
            ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillText("OUT", cx, cy + 1);
          }
        } else {
          var mask = wpMaskOf(c);
          ctx.strokeStyle = hot ? "#c7ff38" : "#7e4419";
          ctx.lineWidth = lw;
          ctx.lineCap = "round";
          if (hot) { ctx.shadowColor = "#c7ff38"; ctx.shadowBlur = 12; }
          [1, 2, 4, 8].forEach(function (d) {
            if (!(mask & d)) return;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + WP.DX[d] * cell / 2, cy + WP.DY[d] * cell / 2);
            ctx.stroke();
          });
          ctx.shadowBlur = 0;
          ctx.fillStyle = hot ? "#c7ff38" : "#7e4419";
          ctx.beginPath(); ctx.arc(cx, cy, lw * 0.55, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
    ctx.strokeStyle = "#1d2b29";
    ctx.lineWidth = 1;
    for (var g = 0; g <= n; g++) {
      ctx.beginPath(); ctx.moveTo(g * cell, 0); ctx.lineTo(g * cell, S); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, g * cell); ctx.lineTo(S, g * cell); ctx.stroke();
    }
    if (wpg.lost) {
      ctx.fillStyle = "rgba(4,8,8,.55)";
      ctx.fillRect(0, 0, S, S);
    }
  }

  function wpShowResult(win) {
    var r = $("wpResult");
    r.style.display = "block";
    r.className = "wp-result " + (win ? "win" : "lose");
    var stats = "Level " + wpg.level + " (" + wpg.n + "x" + wpg.n + "), " +
      wpg.moves + " moves, " + wpFmtTime(wpg.elapsed) +
      (win ? ", " + Math.max(0, Math.round(100 * wpg.charge / wpg.maxCharge)) + "% charge left" : "");
    if (win) {
      var b = wpBest()[wpg.level];
      var note = b ? "Best on this level: " + b.moves + " moves." : "First clear on this level. The bench remembers.";
      r.innerHTML = "<strong>WIRED.</strong> Current flows from battery to invention. " + esc(stats) + ". " + esc(note);
    } else {
      r.innerHTML = "<strong>SHORTED OUT.</strong> The capacitor died before the circuit closed. Hit New board and wire it cleaner.";
    }
  }

  function wpSaveBest() {
    try {
      var all = wpBest(), cur = all[wpg.level];
      if (!cur || wpg.moves < cur.moves) {
        all[wpg.level] = { moves: wpg.moves, secs: Math.round(wpg.elapsed) };
        localStorage.setItem("garage_wire_best_v1", JSON.stringify(all));
      }
    } catch (e) { /* storage unavailable, play on */ }
  }

  function wpStampRow(nm, code) {
    var specs = document.querySelector(".dossier .specs");
    if (!specs) return;
    var row = $("wpCertRow");
    if (!row) {
      row = el("div", "spec");
      row.id = "wpCertRow";
      specs.appendChild(row);
    }
    row.innerHTML = "<dt>Bench certification</dt><dd>" + esc("wired live: level " + wpg.level + ", " + wpg.moves + " moves, " + wpFmtTime(wpg.elapsed)) + "</dd>";
    void nm; void code;
  }

  function wpWin() {
    wpg.running = false; wpg.won = true;
    wpStopTick();
    var v = (typeof currentInvention === "function") ? currentInvention() : null;
    var nm = v ? v.name : "unnamed prototype";
    window.__wiredCert = "bench-wired (" + nm + ") " + new Date().toISOString().slice(0, 10);
    wpStampRow(nm, v ? v.code : "");
    wpSaveBest();
    $("wpCertBtn").disabled = false;
    wpShowResult(true);
    wpHUD();
    wpDraw();
    toast("WIRED. The prototype is live.");
  }

  function wpFail() {
    if (!wpg || !wpg.running) return;
    wpg.running = false; wpg.lost = true; wpg.charge = 0;
    wpStopTick();
    wpShowResult(false);
    wpHUD();
    wpDraw();
    toast("Shorted out. The capacitor is dead.");
  }

  function wpGlyph(type, rot) {
    if (type === "SRC") return ">";
    if (type === "SNK") return "O";
    var g = {
      "I0": "-", "I1": "|", "I2": "-", "I3": "|",
      "L0": "L", "L1": "r", "L2": "7", "L3": "J",
      "T0": "v", "T1": ">", "T2": "^", "T3": "<",
      "X0": "+", "X1": "+", "X2": "+", "X3": "+"
    };
    return g[type + rot] || "?";
  }

  function wpCertificate() {
    if (!wpg || !wpg.won) return;
    var v = (typeof currentInvention === "function") ? currentInvention() : null;
    var nm = v ? v.name : "unnamed prototype";
    var code = v ? v.code : "n/a";
    var rows = [];
    for (var y = 0; y < wpg.n; y++) {
      var line = "";
      for (var x = 0; x < wpg.n; x++) {
        var c = wpg.cells[y * wpg.n + x];
        line += wpGlyph(c.type, c.rot) + " ";
      }
      rows.push(line.replace(/ $/, ""));
    }
    var txt =
      "WIRING CERTIFICATE\n" +
      "Garage Inventions Bench Trials\n" +
      "================================\n" +
      "Invention : " + nm + " (" + code + ")\n" +
      "Date      : " + new Date().toISOString().slice(0, 10) + "\n" +
      "Level     : " + wpg.level + " (" + wpg.n + "x" + wpg.n + " board)\n" +
      "Result    : WIRED, current flowing\n" +
      "Moves     : " + wpg.moves + " (par " + wpg.par + ")\n" +
      "Time      : " + wpFmtTime(wpg.elapsed) + "\n" +
      "Charge    : " + Math.max(0, Math.round(100 * wpg.charge / wpg.maxCharge)) + "% remaining\n" +
      "\nFinal wiring (> battery, O invention):\n" +
      rows.join("\n") + "\n" +
      "\nCertified by the bench. Reality is optional. Utility is not.\n";
    var blob = new Blob([txt], { type: "text/plain" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "wiring-certificate.txt";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    toast("Wiring certificate downloaded");
  }

  function wpOnCanvasTap(e) {
    if (!wpg || !wpg.running) return;
    var cv = $("wpCanvas"), rect = cv.getBoundingClientRect();
    var px = (e.clientX - rect.left) * (640 / rect.width);
    var py = (e.clientY - rect.top) * (640 / rect.height);
    var n = wpg.n, cell = 640 / n;
    var x = Math.floor(px / cell), y = Math.floor(py / cell);
    if (x < 0 || y < 0 || x >= n || y >= n) return;
    var c = wpg.cells[y * n + x];
    if (c.fixed) { toast("That terminal is bolted down"); return; }
    c.rot = (c.rot + 1) % 4;
    wpg.moves++;
    wpg.charge -= 2;
    if (wpg.charge <= 0) { wpFail(); return; }
    if (wpSolved(wpg.cells, n, wpg.snkIdx).ok) { wpWin(); return; }
    wpHUD();
    wpDraw();
  }

  function wpSetLevel(lv) {
    WP_LEVEL = lv;
    [1, 2, 3].forEach(function (l) {
      var b = $("wpLv" + l);
      if (b) b.classList.toggle("on", l === lv);
    });
    wpNewBoard(lv);
  }

  function wpOpen() {
    var ov = $("wpOverlay");
    if (!ov) return;
    ov.classList.add("open");
    if (!wpg) wpNewBoard(WP_LEVEL);
    else if (wpg.running && !wpg.timer) wpStartTick();
    wpHUD();
    wpDraw();
  }
  function wpClose() {
    var ov = $("wpOverlay");
    if (ov) ov.classList.remove("open");
  }

  function wpBuild() {
    var box = document.querySelector(".dossier .actions");
    if (!box || $("wireProtoBtn")) return;

    var css = [
      ".wp-overlay{position:fixed;inset:0;z-index:9999;background:rgba(4,8,8,.92);display:none;align-items:center;justify-content:center;padding:16px;}",
      ".wp-overlay.open{display:flex;}",
      ".wp-panel{width:min(700px,100%);max-height:94vh;overflow-y:auto;background:#0a1416;border:1px solid var(--orange);padding:16px;}",
      ".wp-panel h3{margin:0 0 4px;font-family:'Chakra Petch',sans-serif;text-transform:uppercase;letter-spacing:.02em;}",
      ".wp-sub{font-size:11px;color:#7c8d89;margin:0 0 12px;text-transform:uppercase;letter-spacing:.1em;line-height:1.7;}",
      ".wp-hud{display:grid;grid-template-columns:1fr;gap:8px;margin-bottom:10px;}",
      ".wp-charge{display:flex;align-items:center;gap:10px;}",
      ".wp-chargetrack{flex:1;height:14px;background:#101716;border:1px solid var(--line);}",
      ".wp-chargefill{height:100%;width:100%;background:var(--acid);transition:width .2s;}",
      ".wp-charge span{font-size:11px;color:var(--ink);white-space:nowrap;font-family:monospace;}",
      ".wp-stats{display:flex;gap:14px;flex-wrap:wrap;font-size:11px;font-family:monospace;color:#7c8d89;text-transform:uppercase;letter-spacing:.08em;}",
      ".wp-levels{display:flex;gap:8px;align-items:center;font-size:11px;color:#7c8d89;text-transform:uppercase;letter-spacing:.08em;}",
      ".wp-levels button{min-width:52px;min-height:44px;padding:10px 14px;font-family:'Chakra Petch',sans-serif;font-weight:700;cursor:pointer;background:var(--panel-2);border:1px solid var(--line);color:var(--ink);}",
      ".wp-levels button.on{border-color:var(--orange);color:var(--orange);}",
      "#wpCanvas{width:100%;height:auto;display:block;background:#060b0c;border:1px solid var(--line);touch-action:manipulation;cursor:pointer;}",
      ".wp-result{display:none;margin-top:10px;padding:12px 14px;font-size:12px;line-height:1.6;border:1px solid;}",
      ".wp-result.win{border-color:var(--acid);background:rgba(199,255,56,.06);color:var(--ink);}",
      ".wp-result.win strong{color:var(--acid);}",
      ".wp-result.lose{border-color:#ff4668;background:rgba(255,70,104,.06);color:var(--ink);}",
      ".wp-result.lose strong{color:#ff4668;}",
      ".wp-foot{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;}",
      ".wp-foot .secondary{flex:1;min-height:44px;}",
      ".wp-foot .secondary:disabled{opacity:.35;cursor:not-allowed;}"
    ].join("\n");
    var st = document.createElement("style");
    st.textContent = css;
    document.head.appendChild(st);

    var b = el("button", "secondary", "Wire the Prototype");
    b.id = "wireProtoBtn";
    b.addEventListener("click", wpOpen);
    box.appendChild(b);

    var ov = el("div", "wp-overlay");
    ov.id = "wpOverlay";
    ov.innerHTML =
      '<div class="wp-panel" role="dialog" aria-label="Wire the prototype">' +
      "<h3>Wire the Prototype</h3>" +
      '<p class="wp-sub">Tap tiles to rotate them. Link the battery to the invention before the capacitor drains. Every rotation and every second costs charge.</p>' +
      '<div class="wp-hud">' +
      '<div class="wp-charge"><div class="wp-chargetrack"><div class="wp-chargefill" id="wpChargeFill"></div></div><span id="wpChargeTxt">100% charge</span></div>' +
      '<div class="wp-stats"><span id="wpMoves">0 moves</span><span id="wpTime">0:00</span><span id="wpPar"></span><span id="wpBest"></span></div>' +
      '<div class="wp-levels"><span>Bench level</span><button id="wpLv1" class="on">1</button><button id="wpLv2">2</button><button id="wpLv3">3</button></div>' +
      "</div>" +
      '<canvas id="wpCanvas" width="640" height="640"></canvas>' +
      '<div class="wp-result" id="wpResult"></div>' +
      '<div class="wp-foot">' +
      '<button class="secondary" id="wpNew">New board</button>' +
      '<button class="secondary" id="wpCertBtn" disabled>Download certificate</button>' +
      '<button class="secondary" id="wpClose">Close</button>' +
      "</div>" +
      "</div>";
    document.body.appendChild(ov);

    $("wpCanvas").addEventListener("click", wpOnCanvasTap);
    $("wpNew").addEventListener("click", function () { wpNewBoard(WP_LEVEL); });
    $("wpCertBtn").addEventListener("click", wpCertificate);
    $("wpClose").addEventListener("click", wpClose);
    ov.addEventListener("click", function (e) { if (e.target === ov) wpClose(); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && ov.classList.contains("open")) wpClose();
    });
    [1, 2, 3].forEach(function (l) {
      $("wpLv" + l).addEventListener("click", function () { wpSetLevel(l); });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wpBuild);
  } else {
    wpBuild();
  }

  /* ============================================================
     9. SIGNAL LOCK: the calibration bench (oscilloscope game)
     Real machinery: a drifting target signal wobbles across the
     scope. Tune the bench oscillator's frequency and phase with the
     buttons (or arrow keys) until the two traces phase-lock. Hold
     lock at 93 percent or better for 5 seconds to earn a
     calibration certificate. Let the timer run out and the signal
     is lost.
     ============================================================ */
  var slg = null;
  var SL_SPAN = 1.25; /* seconds of trace shown on the scope */

  function slNewSignal() {
    slg.ft = 1.5 + Math.random() * 4.0;
    slg.fp = 1.0;
    slg.phT = Math.random() * Math.PI * 2;
    slg.phP = 0;
    slg.driftTimer = 2.5 + Math.random() * 2;
  }

  function slStart() {
    slg.running = true; slg.won = false; slg.lost = false;
    slg.lock = 0; slg.holdT = 0; slg.timeLeft = 60;
    slg.moves = 0; slg.t = 0;
    slg.last = performance.now();
    slNewSignal();
    $("slResult").style.display = "none";
    $("slCertBtn").disabled = true;
    cancelAnimationFrame(slg.raf);
    slg.raf = requestAnimationFrame(slTick);
    slHUD();
  }

  function slOpen() {
    var ov = $("slOverlay");
    if (!ov) return;
    ov.classList.add("open");
    slStart();
  }

  function slClose() {
    var ov = $("slOverlay");
    if (ov) ov.classList.remove("open");
    if (slg) { slg.running = false; cancelAnimationFrame(slg.raf); }
  }

  function slAdjustFreq(delta) {
    if (!slg || !slg.running) return;
    slg.fp = Math.max(0.5, Math.min(8, slg.fp + delta));
    slg.moves++;
    slHUD();
  }

  function slAdjustPhase(deltaDeg) {
    if (!slg || !slg.running) return;
    slg.phP = (slg.phP + deltaDeg * Math.PI / 180) % (Math.PI * 2);
    slg.moves++;
    slHUD();
  }

  function slComputeLock() {
    var sum = 0, N = 64, i, tt, dphi;
    for (i = 0; i < N; i++) {
      tt = slg.t - i * 0.02;
      dphi = 2 * Math.PI * (slg.ft - slg.fp) * tt + (slg.phT - slg.phP);
      sum += Math.abs(Math.cos(dphi));
    }
    return sum / N;
  }

  function slTick(now) {
    var c = slg;
    if (!c.running) return;
    var dt = Math.min(0.05, (now - c.last) / 1000);
    c.last = now;
    c.t += dt;

    /* target drifts: frequency random walk, phase wobble */
    c.driftTimer -= dt;
    if (c.driftTimer <= 0) {
      c.driftTimer = 2 + Math.random() * 2.5;
      var jump = (Math.random() - 0.5) * 1.3;
      c.ft = Math.max(1, Math.min(7, c.ft + jump));
      c.phT += (Math.random() - 0.5) * 1.6;
      if (Math.abs(jump) > 0.75 && !c.won && !c.lost) toast("Target drifted. Re-tune the bench.");
    }
    c.phT += 0.06 * dt;

    c.lock = slComputeLock();
    if (c.lock >= 0.93) {
      c.holdT += dt;
      if (c.holdT >= 5 && !c.won) { slWin(); return; }
    } else {
      c.holdT = Math.max(0, c.holdT - 3 * dt);
    }

    c.timeLeft -= dt;
    if (c.timeLeft <= 0 && !c.won) { slFail(); return; }

    slHUD();
    slDraw();
    c.raf = requestAnimationFrame(slTick);
  }

  function slWin() {
    var c = slg;
    c.won = true; c.running = false;
    var v = (typeof currentInvention === "function") ? currentInvention() : null;
    var nm = v ? v.name : "unnamed prototype";
    window.__signalCert = "signal-locked (" + nm + ") " + new Date().toISOString().slice(0, 10);
    $("slCertBtn").disabled = false;
    slShowResult(true);
    slDraw();
    toast("SIGNAL LOCKED. The bench oscillator holds phase.");
  }

  function slFail() {
    var c = slg;
    c.lost = true; c.running = false; c.timeLeft = 0;
    slShowResult(false);
    slDraw();
    toast("Signal lost. The trace dissolved into static.");
  }

  function slShowResult(win) {
    var r = $("slResult");
    r.style.display = "block";
    r.className = "sl-result " + (win ? "win" : "lose");
    if (win) {
      r.innerHTML = "<strong>SIGNAL LOCKED.</strong> Five seconds of phase lock at " +
        Math.round(slg.lock * 100) + "% coherence. " +
        "The bench certifies this oscillator for field service.";
    } else {
      r.innerHTML = "<strong>SIGNAL LOST.</strong> The timer expired before a stable lock. " +
        "Re-seat the oscillator, breathe, and try the bench again.";
    }
  }

  function slHint() {
    var df = slg.fp - slg.ft;
    if (Math.abs(df) > 0.06) return df > 0 ? "FREQ HIGH, tune down" : "FREQ LOW, tune up";
    if (slg.lock < 0.93) return "FREQ MATCHED, adjust phase";
    return "LOCKED, hold it steady";
  }

  function slHUD() {
    var c = slg;
    var pct = Math.round(c.lock * 100);
    $("slLockPct").textContent = pct + "% lock";
    var bar = $("slLockFill");
    bar.style.width = pct + "%";
    bar.style.background = pct >= 93 ? "var(--acid)" : pct >= 70 ? "var(--cyan)" : "var(--orange)";
    $("slHoldFill").style.width = Math.min(100, c.holdT / 5 * 100) + "%";
    $("slHoldTxt").textContent = "Hold " + Math.min(5, c.holdT).toFixed(1) + "s / 5s";
    $("slTime").textContent = Math.ceil(c.timeLeft) + "s";
    $("slFp").textContent = c.fp.toFixed(2) + " Hz";
    $("slPp").textContent = Math.round(c.phP * 180 / Math.PI) + " deg";
    $("slHint").textContent = (c.won || c.lost) ? "" : slHint();
    $("slMoves").textContent = c.moves + " tweaks";
  }

  function slDraw() {
    var c = slg, ctx = $("slCanvas").getContext("2d");
    var W = 720, H = 460, mid = 210, amp = 128;
    ctx.fillStyle = "#060b0c";
    ctx.fillRect(0, 0, W, H);

    /* graticule */
    ctx.strokeStyle = "#14201f";
    ctx.lineWidth = 1;
    var x, y;
    for (x = 0; x <= W; x += 72) { ctx.beginPath(); ctx.moveTo(x, 40); ctx.lineTo(x, 380); ctx.stroke(); }
    for (y = 40; y <= 380; y += 68) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    ctx.strokeStyle = "#22302e";
    ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(W, mid); ctx.stroke();

    /* target trace (orange), player trace (cyan) */
    var drawTrace = function (f, ph, color, width, glow) {
      ctx.save();
      if (glow) { ctx.shadowColor = color; ctx.shadowBlur = 14; }
      ctx.strokeStyle = color; ctx.lineWidth = width;
      ctx.beginPath();
      var i, tt, px, py;
      for (i = 0; i <= 360; i++) {
        px = (i / 360) * W;
        tt = c.t - SL_SPAN * (1 - i / 360);
        py = mid - amp * Math.sin(2 * Math.PI * f * tt + ph);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.restore();
    };
    var locked = c.lock >= 0.93;
    drawTrace(c.ft, c.phT, "#ff6b2c", 3, false);
    drawTrace(c.fp, c.phP, locked ? "#c7ff38" : "#58e4e8", 2, locked);

    /* legend */
    ctx.font = "600 15px monospace";
    ctx.fillStyle = "#ff6b2c";
    ctx.fillText("TARGET", 14, 66);
    ctx.fillStyle = locked ? "#c7ff38" : "#58e4e8";
    ctx.fillText("BENCH", 120, 66);
    if (locked) {
      ctx.fillStyle = "#c7ff38";
      ctx.fillText("PHASE LOCK", W - 150, 66);
    }

    /* time ruler */
    ctx.fillStyle = "#7c8d89"; ctx.font = "600 13px monospace";
    ctx.fillText("t - " + SL_SPAN.toFixed(2) + "s", 14, 402);
    ctx.fillText("now", W - 44, 402);

    if (c.won || c.lost) {
      ctx.fillStyle = "rgba(4,8,8,.72)";
      ctx.fillRect(0, 0, W, H);
      ctx.textAlign = "center";
      if (c.won) {
        ctx.fillStyle = "#c7ff38"; ctx.font = "700 84px sans-serif";
        ctx.fillText("LOCKED", 360, 210);
        ctx.fillStyle = "#e9f4e8"; ctx.font = "20px monospace";
        ctx.fillText("Five seconds of phase lock.", 360, 262);
        ctx.fillText("The oscillator is field-certified.", 360, 294);
      } else {
        ctx.fillStyle = "#ff4668"; ctx.font = "700 72px sans-serif";
        ctx.fillText("LOST", 360, 210);
        ctx.fillStyle = "#e9f4e8"; ctx.font = "20px monospace";
        ctx.fillText("The timer expired.", 360, 262);
        ctx.fillText("The trace dissolved into static.", 360, 294);
      }
      ctx.textAlign = "left";
    }
  }

  function slCertificate() {
    if (!slg || !slg.won) return;
    var v = (typeof currentInvention === "function") ? currentInvention() : null;
    var nm = v ? v.name : "unnamed prototype";
    var code = v ? v.code : "n/a";
    var txt =
      "CALIBRATION CERTIFICATE\n" +
      "Garage Inventions Signal Lock Bench\n" +
      "================================\n" +
      "Invention : " + nm + " (" + code + ")\n" +
      "Date      : " + new Date().toISOString().slice(0, 10) + "\n" +
      "Result    : PHASE LOCK HELD 5.0s\n" +
      "Coherence : " + Math.round(slg.lock * 100) + "%\n" +
      "Bench freq: " + slg.fp.toFixed(2) + " Hz\n" +
      "Tweaks    : " + slg.moves + "\n" +
      "\nCertified by the bench. Reality is optional. Utility is not.\n";
    var blob = new Blob([txt], { type: "text/plain" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "signal-lock-certificate.txt";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    toast("Calibration certificate downloaded");
  }

  function slBuild() {
    var box = document.querySelector(".dossier .actions");
    if (!box || $("signalLockBtn")) return;

    var css = [
      ".sl-overlay{position:fixed;inset:0;z-index:9999;background:rgba(4,8,8,.92);display:none;align-items:center;justify-content:center;padding:16px;}",
      ".sl-overlay.open{display:flex;}",
      ".sl-panel{width:min(760px,100%);max-height:94vh;overflow-y:auto;background:#0a1416;border:1px solid var(--cyan);padding:16px;}",
      ".sl-panel h3{margin:0 0 4px;font-family:'Chakra Petch',sans-serif;text-transform:uppercase;letter-spacing:.02em;}",
      ".sl-sub{font-size:11px;color:#7c8d89;margin:0 0 12px;text-transform:uppercase;letter-spacing:.1em;line-height:1.7;}",
      ".sl-hud{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-bottom:10px;}",
      ".sl-tile{border:1px solid var(--line);padding:8px 10px;background:var(--panel-2);}",
      ".sl-tile h5{margin:0 0 4px;font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:#7c8d89;font-weight:600;}",
      ".sl-tile p{margin:0;font:700 17px monospace;color:var(--ink);}",
      ".sl-meter{height:10px;background:#101716;border:1px solid var(--line);margin-top:4px;}",
      ".sl-meter div{height:100%;width:0;background:var(--cyan);transition:width .15s;}",
      ".sl-hint{font:600 12px monospace;color:var(--orange);text-transform:uppercase;letter-spacing:.1em;margin:2px 0 10px;min-height:16px;}",
      "#slCanvas{width:100%;height:auto;display:block;background:#060b0c;border:1px solid var(--line);}",
      ".sl-ctl{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:12px;}",
      ".sl-ctl .grp{border:1px solid var(--line);padding:8px;background:var(--panel-2);}",
      ".sl-ctl h5{margin:0 0 6px;font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:#7c8d89;}",
      ".sl-ctl .btns{display:grid;grid-template-columns:1fr 1fr;gap:6px;}",
      ".sl-ctl button{min-height:48px;font:700 14px monospace;cursor:pointer;background:var(--black);border:1px solid var(--line);color:var(--ink);}",
      ".sl-ctl button:active{border-color:var(--cyan);color:var(--cyan);}",
      ".sl-result{display:none;margin-top:10px;padding:12px 14px;font-size:12px;line-height:1.6;border:1px solid;}",
      ".sl-result.win{border-color:var(--acid);background:rgba(199,255,56,.06);color:var(--ink);}",
      ".sl-result.win strong{color:var(--acid);}",
      ".sl-result.lose{border-color:#ff4668;background:rgba(255,70,104,.06);color:var(--ink);}",
      ".sl-result.lose strong{color:#ff4668;}",
      ".sl-foot{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;}",
      ".sl-foot .secondary{flex:1;min-height:44px;}",
      ".sl-foot .secondary:disabled{opacity:.35;cursor:not-allowed;}",
      "@media (max-width:640px){.sl-hud{grid-template-columns:repeat(2,minmax(0,1fr));}.sl-ctl{grid-template-columns:1fr 1fr;}}"
    ].join("\n");
    var st = document.createElement("style");
    st.textContent = css;
    document.head.appendChild(st);

    var b = el("button", "secondary", "Signal Lock Bench");
    b.id = "signalLockBtn";
    b.addEventListener("click", slOpen);
    box.appendChild(b);

    var ov = el("div", "sl-overlay");
    ov.id = "slOverlay";
    ov.innerHTML =
      '<div class="sl-panel" role="dialog" aria-label="Signal lock calibration bench">' +
      "<h3>Signal Lock Bench</h3>" +
      '<p class="sl-sub">The orange target drifts. Tune the cyan bench oscillator with the buttons or arrow keys until the traces phase-lock. Hold 93% lock for 5 seconds before the timer runs out.</p>' +
      '<div class="sl-hud">' +
      '<div class="sl-tile"><h5>Lock</h5><p id="slLockPct">0% lock</p><div class="sl-meter"><div id="slLockFill"></div></div></div>' +
      '<div class="sl-tile"><h5>Hold</h5><p id="slHoldTxt">Hold 0.0s / 5s</p><div class="sl-meter"><div id="slHoldFill"></div></div></div>' +
      '<div class="sl-tile"><h5>Bench freq</h5><p id="slFp">1.00 Hz</p><p style="font-size:11px;color:#7c8d89" id="slPp">0 deg</p></div>' +
      '<div class="sl-tile"><h5>Clock</h5><p id="slTime">60s</p><p style="font-size:11px;color:#7c8d89"><span id="slMoves">0 tweaks</span></p></div>' +
      "</div>" +
      '<div class="sl-hint" id="slHint"></div>' +
      '<canvas id="slCanvas" width="720" height="460"></canvas>' +
      '<div class="sl-ctl">' +
      '<div class="grp"><h5>Freq coarse</h5><div class="btns">' +
      '<button data-sl="f" data-d="-1">-1 Hz</button><button data-sl="f" data-d="1">+1 Hz</button></div></div>' +
      '<div class="grp"><h5>Freq fine</h5><div class="btns">' +
      '<button data-sl="f" data-d="-0.05">-0.05</button><button data-sl="f" data-d="0.05">+0.05</button></div></div>' +
      '<div class="grp"><h5>Phase coarse</h5><div class="btns">' +
      '<button data-sl="p" data-d="-15">-15 deg</button><button data-sl="p" data-d="15">+15 deg</button></div></div>' +
      '<div class="grp"><h5>Phase fine</h5><div class="btns">' +
      '<button data-sl="p" data-d="-2">-2 deg</button><button data-sl="p" data-d="2">+2 deg</button></div></div>' +
      "</div>" +
      '<div class="sl-result" id="slResult"></div>' +
      '<div class="sl-foot">' +
      '<button class="secondary" id="slNew">New signal</button>' +
      '<button class="secondary" id="slCertBtn" disabled>Download certificate</button>' +
      '<button class="secondary" id="slClose">Close</button>' +
      "</div>" +
      "</div>";
    document.body.appendChild(ov);

    slg = { raf: 0 };

    var buttons = ov.querySelectorAll("[data-sl]");
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].addEventListener("click", function () {
        var kind = this.getAttribute("data-sl");
        var d = parseFloat(this.getAttribute("data-d"));
        if (kind === "f") slAdjustFreq(d); else slAdjustPhase(d);
      });
    }

    document.addEventListener("keydown", function (e) {
      if (!ov.classList.contains("open")) return;
      var big = e.shiftKey;
      if (e.key === "ArrowUp") { slAdjustFreq(big ? 1 : 0.05); e.preventDefault(); }
      else if (e.key === "ArrowDown") { slAdjustFreq(big ? -1 : -0.05); e.preventDefault(); }
      else if (e.key === "ArrowRight") { slAdjustPhase(big ? 15 : 2); e.preventDefault(); }
      else if (e.key === "ArrowLeft") { slAdjustPhase(big ? -15 : -2); e.preventDefault(); }
      else if (e.key === "Escape") slClose();
    });

    $("slNew").addEventListener("click", slStart);
    $("slCertBtn").addEventListener("click", slCertificate);
    $("slClose").addEventListener("click", slClose);
    ov.addEventListener("click", function (e) { if (e.target === ov) slClose(); });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", slBuild);
  } else {
    slBuild();
  }


  /* ============================================================
     10. THE GOVERNOR: PID tuning bench (playable)
     A real discrete PID loop drives a second-order plant with
     actuator saturation and anti-windup. Tune Kp, Ki, Kd, start
     the trial, and hold the response inside the 4% band for
     1.5 seconds with under 12% overshoot before the 12s shift
     ends. Win and the machine earns a tuning certificate.
     ============================================================ */
  var GV_MACHINES = [
    { name: "Conveyor 7", unit: "m/s", r: 2.4, wn: 2.2, zeta: 0.35, blurb: "Belt drive, lightly damped. Likes to overshoot the mark." },
    { name: "Hydraulic lift, bay 2", unit: "m", r: 1.5, wn: 1.1, zeta: 0.8, blurb: "Slow and heavy. Forgiving, but do not fall asleep on it." },
    { name: "Lathe spindle", unit: "rpm", r: 900, wn: 3.0, zeta: 0.18, blurb: "Fast, twitchy, barely damped. Respect the derivative term." },
    { name: "Paint mixer, drum B", unit: "rpm", r: 320, wn: 1.6, zeta: 0.5, blurb: "Viscous load. Steady, but it punishes greedy integral gain." },
    { name: "Dust collector fan", unit: "cfm x100", r: 4.8, wn: 2.6, zeta: 0.25, blurb: "Big inertia, thin air. Overshoots if you blink." },
    { name: "Parts washer pump", unit: "psi", r: 65, wn: 3.4, zeta: 0.12, blurb: "The wild one. Almost no natural damping at all." }
  ];
  var gvs = null;

  function gvMakeState(m, kp, ki, kd) {
    return {
      m: m, kp: kp, ki: ki, kd: kd,
      t: 0, y: 0.02 * m.r, v: 0, integ: 0, prevYn: 0.02,
      maxY: 0.02 * m.r, bandT: 0, uNow: 0,
      won: false, failed: false, tSettle: 0, reason: "",
      trace: []
    };
  }

  function gvStep(s, dt) {
    var en = (s.m.r - s.y) / s.m.r;
    var P = s.kp * en;
    s.integ += en * dt;
    var I = s.ki * s.integ;
    var yn = s.y / s.m.r;
    var D = -s.kd * ((yn - s.prevYn) / dt);
    var u = P + I + D;
    if ((u > 1.25 && en > 0) || (u < 0 && en < 0)) {
      s.integ -= en * dt; I = s.ki * s.integ; u = P + I + D;
    }
    u = Math.max(0, Math.min(1.25, u));
    s.uNow = u;
    var acc = s.m.wn * s.m.wn * (u * 1.25 * s.m.r - s.y) - 2 * s.m.zeta * s.m.wn * s.v;
    s.v += acc * dt;
    s.prevYn = yn;
    s.y += s.v * dt;
    s.t += dt;
    if (s.y > s.maxY) s.maxY = s.y;
    if (Math.abs(en) <= 0.04) s.bandT += dt; else s.bandT = 0;
    if (s.bandT >= 1.5 && s.t >= 1.0) { s.won = true; s.tSettle = s.t - 1.5; }
    if (s.y > 3 * s.m.r || s.y < -s.m.r) { s.failed = true; s.reason = "blowout"; }
    if (s.trace.length < 2400) s.trace.push([s.t, s.y, u]);
  }

  function gvOvershoot(s) { return Math.max(0, (s.maxY - s.m.r) / s.m.r); }

  function gvReadGains() {
    return {
      kp: parseFloat($("gvKp").value),
      ki: parseFloat($("gvKi").value),
      kd: parseFloat($("gvKd").value)
    };
  }

  function gvSetGains(g) {
    $("gvKp").value = g.kp; $("gvKi").value = g.ki; $("gvKd").value = g.kd;
    gvGainLabels();
  }

  function gvGainLabels() {
    $("gvKpV").textContent = parseFloat($("gvKp").value).toFixed(2);
    $("gvKiV").textContent = parseFloat($("gvKi").value).toFixed(2);
    $("gvKdV").textContent = parseFloat($("gvKd").value).toFixed(2);
  }

  function gvLockControls(locked) {
    var ids = ["gvKp", "gvKi", "gvKd", "gvStart", "gvNew", "gvGuess"];
    for (var i = 0; i < ids.length; i++) $(ids[i]).disabled = locked;
  }

  function gvNewMachine() {
    gvHalt();
    var m = GV_MACHINES[Math.floor(Math.random() * GV_MACHINES.length)];
    gvs.machine = m;
    $("gvMachine").textContent = m.name;
    $("gvTarget").textContent = m.r + " " + m.unit;
    $("gvBlurb").textContent = m.blurb;
    $("gvResult").textContent = "";
    $("gvResult").className = "gv-result";
    $("gvCertBtn").disabled = true;
    var st = gvMakeState(m, 0, 0, 0);
    gvs.preview = st;
    gvDrawPreview();
    gvHud(st, 0);
  }

  function gvHalt() {
    if (gvs && gvs.raf) { cancelAnimationFrame(gvs.raf); gvs.raf = 0; }
    if (gvs) gvs.running = false;
    gvLockControls(false);
  }

  function gvStart() {
    if (gvs.running) return;
    var g = gvReadGains();
    var st = gvMakeState(gvs.machine, g.kp, g.ki, g.kd);
    gvs.state = st;
    gvs.running = true;
    gvs.lastNow = 0;
    $("gvResult").textContent = "";
    $("gvResult").className = "gv-result";
    $("gvCertBtn").disabled = true;
    gvLockControls(true);
    $("gvStop").disabled = false;
    gvs.raf = requestAnimationFrame(gvLoop);
  }

  function gvStop(silent) {
    gvHalt();
    if (!silent) {
      $("gvResult").textContent = "Trial aborted. The machine keeps its secrets.";
      $("gvResult").className = "gv-result fail";
    }
  }

  function gvLoop(now) {
    if (!gvs.running) return;
    if (!gvs.lastNow) gvs.lastNow = now;
    var realDt = Math.min(0.1, (now - gvs.lastNow) / 1000);
    gvs.lastNow = now;
    var simBudget = realDt * gvs.speed;
    var s = gvs.state;
    var dt = 0.01;
    while (simBudget > 0 && !s.won && !s.failed && s.t < 12) {
      var h = Math.min(dt, simBudget);
      gvStep(s, h);
      simBudget -= h;
    }
    gvDraw(s);
    gvHud(s, gvOvershoot(s));
    var done = s.won || s.failed || s.t >= 12;
    if (!done) {
      gvs.raf = requestAnimationFrame(gvLoop);
    } else {
      gvs.running = false;
      gvLockControls(false);
      var ov = gvOvershoot(s);
      if (s.won && ov <= 0.12) gvFinish(true, s);
      else gvFinish(false, s);
    }
  }

  function gvFinish(won, s) {
    var ov = gvOvershoot(s);
    var r = $("gvResult");
    if (won) {
      r.textContent = "TUNED. Settled in " + s.tSettle.toFixed(2) + "s with " +
        (ov * 100).toFixed(1) + "% overshoot. The machine hums your name.";
      r.className = "gv-result win";
      $("gvCertBtn").disabled = false;
      gvs.cert = {
        settle: s.tSettle, ov: ov,
        kp: s.kp, ki: s.ki, kd: s.kd, machine: s.m.name
      };
      var v = (typeof currentInvention === "function") ? currentInvention() : null;
      window.__govCert = "governor-tuned (" + (v ? v.code : "bench") + ") " + new Date().toISOString().slice(0, 10);
      var bk = s.m.name;
      if (!gvs.best[bk] || s.tSettle < gvs.best[bk]) {
        gvs.best[bk] = s.tSettle;
        toast("New best settle on " + bk + ": " + s.tSettle.toFixed(2) + "s.");
      } else {
        toast("Machine tuned. Certificate unlocked.");
      }
    } else {
      var why = s.failed
        ? "The loop went unstable and the response blew past the red line."
        : "The 12 second shift ended before the response settled in the band.";
      r.textContent = "NOT TUNED. " + why + " Overshoot hit " + (ov * 100).toFixed(1) + "%.";
      r.className = "gv-result fail";
      toast("Trial failed. Adjust the gains and go again.");
    }
  }

  function gvCertificate() {
    if (!gvs.cert) return;
    var c = gvs.cert;
    var v = (typeof currentInvention === "function") ? currentInvention() : null;
    var nm = v ? v.name : "unnamed prototype";
    var code = v ? v.code : "n/a";
    var txt =
      "GOVERNOR TUNING CERTIFICATE\n" +
      "Garage Inventions PID Bench\n" +
      "================================\n" +
      "Invention : " + nm + " (" + code + ")\n" +
      "Machine   : " + c.machine + "\n" +
      "Date      : " + new Date().toISOString().slice(0, 10) + "\n" +
      "Result    : LOOP TUNED, 4% BAND HELD 1.5s\n" +
      "Gains     : Kp=" + c.kp.toFixed(2) + " Ki=" + c.ki.toFixed(2) + " Kd=" + c.kd.toFixed(2) + "\n" +
      "Settle    : " + c.settle.toFixed(2) + "s\n" +
      "Overshoot : " + (c.ov * 100).toFixed(1) + "%\n" +
      "\nCertified by the bench. Reality is optional. Utility is not.\n";
    var blob = new Blob([txt], { type: "text/plain" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "governor-tuning-certificate.txt";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    toast("Tuning certificate downloaded");
  }

  function gvHud(s, ov) {
    $("gvClock").textContent = s.t.toFixed(1) + "s / 12s";
    $("gvOv").textContent = (ov * 100).toFixed(1) + "%";
    $("gvY").textContent = s.y.toFixed(2) + " " + s.m.unit;
    $("gvBand").textContent = Math.min(s.bandT, 1.5).toFixed(1) + "s / 1.5s";
    var bk = s.m.name;
    $("gvBest").textContent = gvs.best[bk] ? gvs.best[bk].toFixed(2) + "s" : "--";
    var uPct = Math.round((s.uNow / 1.25) * 100);
    $("gvDriveFill").style.width = uPct + "%";
    $("gvDriveTxt").textContent = "drive " + uPct + "%";
    var inBand = Math.abs(s.y - s.m.r) / s.m.r <= 0.04;
    $("gvStatus").textContent = s.won ? "IN BAND" : (inBand ? "band edge" : "hunting");
  }

  function gvDrawPreview() {
    var cv = $("gvCanvas");
    var ctx = cv.getContext("2d");
    var W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);
    var m = gvs.machine;
    var L = 46, R = 12, T = 14, B = 26;
    var yMax = 1.4 * m.r;
    function X(t) { return L + (t / 12) * (W - L - R); }
    function Y(v) { return H - B - (v / yMax) * (H - T - B); }
    ctx.fillStyle = "rgba(199,255,56,.07)";
    ctx.fillRect(L, Y(m.r * 1.04), W - L - R, Y(m.r * 0.96) - Y(m.r * 1.04));
    ctx.strokeStyle = "#c7ff38"; ctx.setLineDash([6, 5]); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(L, Y(m.r)); ctx.lineTo(W - R, Y(m.r)); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#7c8d89"; ctx.font = "10px monospace"; ctx.textAlign = "left";
    ctx.fillText("target " + m.r + " " + m.unit, L + 4, Y(m.r) - 6);
    ctx.fillText("0", 8, Y(0) + 3);
    ctx.fillText("4% band", L + 4, Y(m.r * 1.04) - 4);
    ctx.fillStyle = "#58e4e8";
    ctx.fillText("Set the gains, then start the trial.", L, H - 8);
  }

  function gvDraw(s) {
    var cv = $("gvCanvas");
    var ctx = cv.getContext("2d");
    var W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);
    var m = s.m;
    var L = 46, R = 12, T = 14, B = 26;
    var peak = m.r * 1.4;
    for (var i = 0; i < s.trace.length; i += 12) {
      if (s.trace[i][1] * 1.08 > peak) peak = s.trace[i][1] * 1.08;
    }
    function X(t) { return L + (t / 12) * (W - L - R); }
    function Y(v) { return H - B - (v / peak) * (H - T - B); }
    ctx.strokeStyle = "#1c2a28"; ctx.lineWidth = 1;
    ctx.fillStyle = "#7c8d89"; ctx.font = "10px monospace"; ctx.textAlign = "center";
    for (var tt = 0; tt <= 12; tt += 2) {
      ctx.beginPath(); ctx.moveTo(X(tt), T); ctx.lineTo(X(tt), H - B); ctx.stroke();
      ctx.fillText(tt + "s", X(tt), H - 8);
    }
    ctx.fillStyle = "rgba(199,255,56,.07)";
    ctx.fillRect(L, Y(m.r * 1.04), W - L - R, Y(m.r * 0.96) - Y(m.r * 1.04));
    ctx.strokeStyle = "#c7ff38"; ctx.setLineDash([6, 5]); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(L, Y(m.r)); ctx.lineTo(W - R, Y(m.r)); ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = "rgba(255,70,104,.55)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(L, Y(3 * m.r)); ctx.lineTo(W - R, Y(3 * m.r)); ctx.stroke();
    ctx.fillStyle = "#ff4668"; ctx.textAlign = "left";
    ctx.fillText("blowout line", L + 4, Y(3 * m.r) - 4);
    ctx.strokeStyle = "#58e4e8"; ctx.lineWidth = 2; ctx.beginPath();
    var started = false;
    for (var j = 0; j < s.trace.length; j++) {
      var px = X(s.trace[j][0]), py = Y(s.trace[j][1]);
      if (!started) { ctx.moveTo(px, py); started = true; } else ctx.lineTo(px, py);
    }
    ctx.stroke();
    if (s.trace.length) {
      var last = s.trace[s.trace.length - 1];
      ctx.fillStyle = "#58e4e8";
      ctx.beginPath(); ctx.arc(X(last[0]), Y(last[1]), 4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = "#7c8d89"; ctx.textAlign = "left";
    ctx.fillText("target " + m.r + " " + m.unit, L + 4, Y(m.r) - 6);
  }

  function gvBuild() {
    var box = document.querySelector(".dossier .actions");
    if (!box || $("governorBtn")) return;

    var css = [
      ".gv-overlay{position:fixed;inset:0;z-index:9999;background:rgba(4,8,8,.92);display:none;align-items:center;justify-content:center;padding:16px;}",
      ".gv-overlay.open{display:flex;}",
      ".gv-panel{width:min(780px,100%);max-height:94vh;overflow-y:auto;background:#0a1416;border:1px solid var(--acid);padding:16px;}",
      ".gv-panel h3{margin:0 0 4px;font-family:'Chakra Petch',sans-serif;text-transform:uppercase;letter-spacing:.02em;}",
      ".gv-sub{font-size:11px;color:#7c8d89;margin:0 0 12px;text-transform:uppercase;letter-spacing:.1em;line-height:1.7;}",
      ".gv-tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:10px;}",
      ".gv-tile{border:1px solid var(--line);padding:8px 10px;background:var(--panel-2);min-width:0;}",
      ".gv-tile h5{margin:0 0 4px;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--acid);font-weight:600;}",
      ".gv-tile p{margin:0;font-size:13px;font-family:monospace;color:var(--ink);}",
      ".gv-tile p.dim{font-size:10px;color:#7c8d89;}",
      "#gvCanvas{width:100%;height:auto;display:block;background:#060b0c;border:1px solid var(--line);}",
      ".gv-drive{display:flex;align-items:center;gap:10px;margin:10px 0;}",
      ".gv-drivetrack{flex:1;height:14px;background:#101716;border:1px solid var(--line);}",
      "#gvDriveFill{height:100%;width:0;background:var(--orange);transition:width .08s linear;}",
      ".gv-drive span{font-size:11px;color:var(--ink);white-space:nowrap;font-family:monospace;}",
      ".gv-gains{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:10px 0;}",
      ".gv-gain{border:1px solid var(--line);padding:10px;background:var(--panel-2);}",
      ".gv-gain h5{margin:0 0 2px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--cyan);}",
      ".gv-gain p{margin:0 0 6px;font-size:10px;color:#7c8d89;}",
      ".gv-gain .val{font-family:monospace;font-size:15px;color:var(--ink);}",
      ".gv-gain input[type=range]{width:100%;min-height:44px;accent-color:var(--acid);}",
      ".gv-btns{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:10px;}",
      ".gv-btns button{min-height:48px;padding:12px 8px;font-family:'Chakra Petch',sans-serif;font-weight:700;font-size:12px;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;background:var(--panel-2);border:1px solid var(--line);color:var(--ink);}",
      ".gv-btns button:disabled{opacity:.35;cursor:default;}",
      "#gvStart{border-color:var(--acid);color:var(--acid);}",
      ".gv-result{margin-top:10px;padding:10px 12px;font-size:13px;font-family:monospace;border:1px solid var(--line);min-height:20px;}",
      ".gv-result.win{border-color:var(--acid);color:var(--acid);}",
      ".gv-result.fail{border-color:#ff4668;color:#ff8ba0;}",
      ".gv-foot{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;}",
      ".gv-foot .secondary{flex:1;min-height:44px;}",
      "@media (max-width:640px){.gv-tiles{grid-template-columns:repeat(2,minmax(0,1fr));}.gv-gains{grid-template-columns:1fr;}.gv-btns{grid-template-columns:repeat(2,minmax(0,1fr));}}"
    ].join("\n");
    var st = document.createElement("style");
    st.textContent = css;
    document.head.appendChild(st);

    var b = el("button", "secondary", "Tune the Governor");
    b.id = "governorBtn";
    b.addEventListener("click", function () { $("gvOverlay").classList.add("open"); });
    box.appendChild(b);

    var ov = el("div", "gv-overlay");
    ov.id = "gvOverlay";
    ov.innerHTML =
      '<div class="gv-panel" role="dialog" aria-label="The Governor PID tuning bench">' +
      "<h3>The Governor</h3>" +
      '<p class="gv-sub">A live PID loop on real shop machinery. Tune Kp, Ki, Kd, start the trial, hold the trace inside the 4% band for 1.5s with under 12% overshoot. The shift ends at 12s.</p>' +
      '<div class="gv-tiles">' +
      '<div class="gv-tile"><h5>Machine</h5><p id="gvMachine">--</p><p class="dim" id="gvBlurb"></p></div>' +
      '<div class="gv-tile"><h5>Target</h5><p id="gvTarget">--</p><p class="dim" id="gvY">--</p></div>' +
      '<div class="gv-tile"><h5>Clock</h5><p id="gvClock">0.0s / 12s</p><p class="dim" id="gvStatus">idle</p></div>' +
      '<div class="gv-tile"><h5>Overshoot</h5><p id="gvOv">0.0%</p><p class="dim">limit 12%</p></div>' +
      '<div class="gv-tile"><h5>Band hold</h5><p id="gvBand">0.0s / 1.5s</p><p class="dim">inside 4%</p></div>' +
      '<div class="gv-tile"><h5>Best settle</h5><p id="gvBest">--</p><p class="dim">this machine</p></div>' +
      "</div>" +
      '<canvas id="gvCanvas" width="720" height="420"></canvas>' +
      '<div class="gv-drive"><div class="gv-drivetrack"><div id="gvDriveFill"></div></div><span id="gvDriveTxt">drive 0%</span></div>' +
      '<div class="gv-gains">' +
      '<div class="gv-gain"><h5>Kp <span class="val" id="gvKpV">1.00</span></h5><p>Proportional: muscle. Too much and it oscillates.</p><input type="range" id="gvKp" min="0" max="6" step="0.05" value="1"></div>' +
      '<div class="gv-gain"><h5>Ki <span class="val" id="gvKiV">0.50</span></h5><p>Integral: memory. Kills steady error, feeds overshoot.</p><input type="range" id="gvKi" min="0" max="4" step="0.05" value="0.5"></div>' +
      '<div class="gv-gain"><h5>Kd <span class="val" id="gvKdV">0.30</span></h5><p>Derivative: brakes. Calms the twitchy machines.</p><input type="range" id="gvKd" min="0" max="4" step="0.05" value="0.3"></div>' +
      "</div>" +
      '<div class="gv-btns">' +
      '<button id="gvStart">Start trial</button>' +
      '<button id="gvStop" disabled>Stop</button>' +
      '<button id="gvSpeed">Speed 1x</button>' +
      '<button id="gvNew">New machine</button>' +
      '<button id="gvGuess">Shop guess</button>' +
      '<button id="gvZero">Zero gains</button>' +
      "</div>" +
      '<div class="gv-result" id="gvResult"></div>' +
      '<div class="gv-foot">' +
      '<button class="secondary" id="gvCertBtn" disabled>Download certificate</button>' +
      '<button class="secondary" id="gvClose">Close</button>' +
      "</div>" +
      "</div>";
    document.body.appendChild(ov);

    gvs = { machine: null, running: false, raf: 0, speed: 1, cert: null, best: {}, state: null, preview: null, lastNow: 0 };

    $("gvKp").addEventListener("input", gvGainLabels);
    $("gvKi").addEventListener("input", gvGainLabels);
    $("gvKd").addEventListener("input", gvGainLabels);
    $("gvStart").addEventListener("click", gvStart);
    $("gvStop").addEventListener("click", function () { gvStop(false); });
    $("gvSpeed").addEventListener("click", function () {
      gvs.speed = (gvs.speed === 1) ? 4 : 1;
      $("gvSpeed").textContent = "Speed " + gvs.speed + "x";
    });
    $("gvNew").addEventListener("click", gvNewMachine);
    $("gvGuess").addEventListener("click", function () {
      gvSetGains({ kp: 1.0, ki: 0.5, kd: 0.3 });
      toast("Shop guess loaded. It works, slowly. Beat it.");
    });
    $("gvZero").addEventListener("click", function () {
      gvSetGains({ kp: 0, ki: 0, kd: 0 });
      toast("Gains zeroed. The machine does nothing, reliably.");
    });
    $("gvCertBtn").addEventListener("click", gvCertificate);
    $("gvClose").addEventListener("click", function () { gvStop(true); $("gvOverlay").classList.remove("open"); });
    ov.addEventListener("click", function (e) { if (e.target === ov) { gvStop(true); ov.classList.remove("open"); } });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && ov.classList.contains("open")) { gvStop(true); ov.classList.remove("open"); }
    });

    gvNewMachine();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", gvBuild);
  } else {
    gvBuild();
  }


/* Silicon Anvil core: RV32I subset assembler + interpreter. No DOM, pure logic.
   Shared verbatim between node tests and the features.js module. */
"use strict";

var RV_ABI = {zero:0,ra:1,sp:2,gp:3,tp:4,t0:5,t1:6,t2:7,s0:8,fp:8,s1:9,a0:10,a1:11,a2:12,a3:13,a4:14,a5:15,a6:16,a7:17,s2:18,s3:19,s4:20,s5:21,s6:22,s7:23,s8:24,s9:25,s10:26,s11:27,t3:28,t4:29,t5:30,t6:31};
var RV_REGNAMES = ["zero","ra","sp","gp","tp","t0","t1","t2","s0","s1","a0","a1","a2","a3","a4","a5","a6","a7","s2","s3","s4","s5","s6","s7","s8","s9","s10","s11","t3","t4","t5","t6"];

function rvParseReg(s, line) {
  s = String(s).trim().toLowerCase();
  var n;
  if (s.charAt(0) === "x") n = parseInt(s.slice(1), 10);
  else if (RV_ABI.hasOwnProperty(s)) n = RV_ABI[s];
  else throw { line: line, msg: "bad register '" + s + "'" };
  if (isNaN(n) || n < 0 || n > 31 || (s.charAt(0) === "x" && !/^\d+$/.test(s.slice(1)))) throw { line: line, msg: "bad register '" + s + "'" };
  return n;
}
function rvParseImm(s, line) {
  s = String(s).trim().toLowerCase();
  var neg = false;
  if (s.charAt(0) === "-") { neg = true; s = s.slice(1); }
  else if (s.charAt(0) === "+") s = s.slice(1);
  var v = (s.indexOf("0x") === 0) ? parseInt(s, 16) : parseInt(s, 10);
  if (isNaN(v)) throw { line: line, msg: "bad number '" + s + "'" };
  return neg ? -v : v;
}
function rvParseMem(s, line) {
  var m = String(s).trim().match(/^(-?[^\s\(]*)\(\s*([^\)\s]+)\s*\)$/);
  if (!m) throw { line: line, msg: "bad memory operand '" + s + "' (want off(reg))" };
  return { off: m[1] === "" ? 0 : rvParseImm(m[1], line), rs: rvParseReg(m[2], line) };
}

var RV_OPS = {
  addi:{op:0x13,f3:0,ty:"I"}, slti:{op:0x13,f3:2,ty:"I"}, sltiu:{op:0x13,f3:3,ty:"I"},
  xori:{op:0x13,f3:4,ty:"I"}, ori:{op:0x13,f3:6,ty:"I"}, andi:{op:0x13,f3:7,ty:"I"},
  slli:{op:0x13,f3:1,ty:"Is"}, srli:{op:0x13,f3:5,ty:"Is",f7:0}, srai:{op:0x13,f3:5,ty:"Is",f7:32},
  add:{op:0x33,f3:0,f7:0,ty:"R"}, sub:{op:0x33,f3:0,f7:32,ty:"R"},
  sll:{op:0x33,f3:1,f7:0,ty:"R"}, slt:{op:0x33,f3:2,f7:0,ty:"R"}, sltu:{op:0x33,f3:3,f7:0,ty:"R"},
  xor:{op:0x33,f3:4,f7:0,ty:"R"}, srl:{op:0x33,f3:5,f7:0,ty:"R"}, sra:{op:0x33,f3:5,f7:32,ty:"R"},
  or:{op:0x33,f3:6,f7:0,ty:"R"}, and:{op:0x33,f3:7,f7:0,ty:"R"},
  lb:{op:0x03,f3:0,ty:"L"}, lh:{op:0x03,f3:1,ty:"L"}, lw:{op:0x03,f3:2,ty:"L"},
  lbu:{op:0x03,f3:4,ty:"L"}, lhu:{op:0x03,f3:5,ty:"L"},
  sb:{op:0x23,f3:0,ty:"S"}, sh:{op:0x23,f3:1,ty:"S"}, sw:{op:0x23,f3:2,ty:"S"},
  beq:{op:0x63,f3:0,ty:"B"}, bne:{op:0x63,f3:1,ty:"B"}, blt:{op:0x63,f3:4,ty:"B"},
  bge:{op:0x63,f3:5,ty:"B"}, bltu:{op:0x63,f3:6,ty:"B"}, bgeu:{op:0x63,f3:7,ty:"B"},
  jal:{op:0x6F,ty:"J"}, jalr:{op:0x67,f3:0,ty:"Jr"},
  lui:{op:0x37,ty:"U"}, auipc:{op:0x17,ty:"U"},
  ecall:{op:0x73,ty:"E"}
};

function rvEncR(f7, rs2, rs1, f3, rd, op) { return (((f7 << 25) | (rs2 << 20) | (rs1 << 15) | (f3 << 12) | (rd << 7) | op) >>> 0); }
function rvEncI(imm, rs1, f3, rd, op) { return ((((imm & 0xFFF) << 20) | (rs1 << 15) | (f3 << 12) | (rd << 7) | op) >>> 0); }
function rvEncS(imm, rs2, rs1, f3, op) {
  imm &= 0xFFF;
  return (((((imm >> 5) & 0x7F) << 25) | (rs2 << 20) | (rs1 << 15) | (f3 << 12) | ((imm & 0x1F) << 7) | op) >>> 0);
}
function rvEncB(off, rs2, rs1, f3, op) {
  var w = ((((off >> 12) & 1) << 31) | (((off >> 11) & 1) << 7) | (((off >> 5) & 0x3F) << 25) | (((off >> 1) & 0xF) << 8));
  return ((w | (rs2 << 20) | (rs1 << 15) | (f3 << 12) | op) >>> 0);
}
function rvEncU(imm20, rd, op) { return ((((imm20 & 0xFFFFF) << 12) | (rd << 7) | op) >>> 0); }
function rvEncJ(off, rd, op) {
  var w = ((((off >> 20) & 1) << 31) | (((off >> 12) & 0xFF) << 12) | (((off >> 11) & 1) << 20) | (((off >> 1) & 0x3FF) << 21));
  return ((w | (rd << 7) | op) >>> 0);
}
function rvRange(v, lo, hi, what, line) {
  if (v < lo || v > hi) throw { line: line, msg: what + " " + v + " out of range [" + lo + "," + hi + "]" };
}
function rvAligned(v, what, line) {
  if (v & 1) throw { line: line, msg: what + " target misaligned (offset " + v + ")" };
}

function rvExpandPseudo(op, args, ln) {
  if (op === "nop") return [["addi", ["x0", "x0", "0"]]];
  if (op === "mv" && args.length === 2) return [["addi", [args[0], args[1], "0"]]];
  if (op === "ret" && args.length === 0) return [["jalr", ["x0", "0(x1)"]]];
  if (op === "j" && args.length === 1) return [["jal", ["x0", args[0]]]];
  if (op === "li" && args.length === 2) {
    var v = rvParseImm(args[1], ln);
    if (v >= -2048 && v <= 2047) return [["addi", [args[0], "x0", String(v)]]];
    var hi = (v + 0x800) >> 12, lo = v - (hi << 12);
    return [["lui", [args[0], String(hi)]], ["addi", [args[0], args[0], String(lo)]]];
  }
  return [[op, args]];
}

function rvEncode(op, args, addr, labels, line) {
  var d = RV_OPS[op];
  if (!d) throw { line: line, msg: "unknown instruction '" + op + "'" };
  function need(n) { if (args.length !== n) throw { line: line, msg: op + " wants " + n + " operands, got " + args.length }; }
  switch (d.ty) {
    case "R": {
      need(3);
      return rvEncR(d.f7, rvParseReg(args[2], line), rvParseReg(args[1], line), d.f3, rvParseReg(args[0], line), d.op);
    }
    case "I": {
      need(3);
      var im = rvParseImm(args[2], line); rvRange(im, -2048, 2047, "immediate", line);
      return rvEncI(im, rvParseReg(args[1], line), d.f3, rvParseReg(args[0], line), d.op);
    }
    case "Is": {
      need(3);
      var sh = rvParseImm(args[2], line); rvRange(sh, 0, 31, "shift amount", line);
      return rvEncR(d.f7, sh, rvParseReg(args[1], line), d.f3, rvParseReg(args[0], line), d.op);
    }
    case "L": {
      need(2);
      var lm = rvParseMem(args[1], line); rvRange(lm.off, -2048, 2047, "offset", line);
      return rvEncI(lm.off, lm.rs, d.f3, rvParseReg(args[0], line), d.op);
    }
    case "S": {
      need(2);
      var sm = rvParseMem(args[1], line); rvRange(sm.off, -2048, 2047, "offset", line);
      return rvEncS(sm.off, rvParseReg(args[0], line), sm.rs, d.f3, d.op);
    }
    case "B": {
      need(3);
      var tgt = String(args[2]).toLowerCase();
      if (!labels.hasOwnProperty(tgt)) throw { line: line, msg: "unknown label '" + args[2] + "'" };
      var off = labels[tgt] - addr;
      rvRange(off, -4096, 4094, "branch offset", line); rvAligned(off, "branch", line);
      return rvEncB(off, rvParseReg(args[1], line), rvParseReg(args[0], line), d.f3, d.op);
    }
    case "J": {
      need(2);
      var jt = String(args[1]).toLowerCase();
      if (!labels.hasOwnProperty(jt)) throw { line: line, msg: "unknown label '" + args[1] + "'" };
      var joff = labels[jt] - addr;
      rvRange(joff, -1048576, 1048574, "jump offset", line); rvAligned(joff, "jump", line);
      return rvEncJ(joff, rvParseReg(args[0], line), d.op);
    }
    case "Jr": {
      need(2);
      var jm = rvParseMem(args[1], line); rvRange(jm.off, -2048, 2047, "offset", line);
      return rvEncI(jm.off, jm.rs, d.f3, rvParseReg(args[0], line), d.op);
    }
    case "U": {
      need(2);
      var u = rvParseImm(args[1], line);
      return rvEncU(u, rvParseReg(args[0], line), d.op);
    }
    case "E": {
      if (args.length) throw { line: line, msg: "ecall takes no operands" };
      return 0x73;
    }
  }
  throw { line: line, msg: "cannot encode '" + op + "'" };
}

function rvAssemble(src) {
  var raw = String(src).split("\n");
  var items = [];
  var labels = {};
  var addr = 0;
  for (var i = 0; i < raw.length; i++) {
    var ln = i + 1;
    var t = raw[i].replace(/#.*$/, "").trim();
    if (!t) continue;
    var m = t.match(/^([A-Za-z_][\w.]*)\s*:\s*(.*)$/);
    var label = null;
    if (m) { label = m[1].toLowerCase(); t = m[2].trim(); }
    if (label) {
      if (labels.hasOwnProperty(label)) throw { line: ln, msg: "duplicate label '" + label + "'" };
      labels[label] = addr;
    }
    if (!t) continue;
    if (t.charAt(0) === ".") {
      var dm = t.match(/^\.(\w+)\s*(.*)$/);
      if (dm && dm[1] === "word") {
        var vals = dm[2].split(",").map(function (s) { return rvParseImm(s, ln); });
        if (!vals.length) throw { line: ln, msg: ".word needs values" };
        items.push({ line: ln, op: ".word", args: vals, addr: addr, src: raw[i].trim() });
        addr += 4 * vals.length;
      } else throw { line: ln, msg: "unsupported directive '" + t + "'" };
      continue;
    }
    var sp = t.search(/\s/);
    var op = (sp < 0 ? t : t.slice(0, sp)).toLowerCase();
    var rest = sp < 0 ? "" : t.slice(sp).trim();
    var args = rest ? rest.split(",").map(function (s) { return s.trim(); }).filter(function (s) { return s.length; }) : [];
    var expanded = rvExpandPseudo(op, args, ln);
    for (var k = 0; k < expanded.length; k++) {
      items.push({ line: ln, op: expanded[k][0], args: expanded[k][1], addr: addr, src: raw[i].trim() });
      addr += 4;
    }
  }
  var words = [], listing = [];
  items.forEach(function (it) {
    if (it.op === ".word") {
      it.args.forEach(function (v, j) {
        words.push(v >>> 0);
        listing.push({ addr: it.addr + j * 4, word: v >>> 0, src: it.src, line: it.line });
      });
    } else {
      var w = rvEncode(it.op, it.args, it.addr, labels, it.line);
      words.push(w);
      listing.push({ addr: it.addr, word: w, src: it.src, line: it.line });
    }
  });
  return { words: words, labels: labels, listing: listing };
}

/* CPU */
function rvCpu(words) {
  var MEMSZ = 4096;
  var mem = new Uint8Array(MEMSZ);
  for (var i = 0; i < words.length; i++) {
    if (i * 4 + 4 > MEMSZ) throw { trap: "program too big for 4K memory" };
    var w = words[i] >>> 0;
    mem[i * 4] = w & 0xFF; mem[i * 4 + 1] = (w >>> 8) & 0xFF;
    mem[i * 4 + 2] = (w >>> 16) & 0xFF; mem[i * 4 + 3] = (w >>> 24) & 0xFF;
  }
  var R = new Array(32);
  for (var r = 0; r < 32; r++) R[r] = 0;
  R[2] = 0x1000;
  return { mem: mem, memsz: MEMSZ, R: R, pc: 0, halted: false, steps: 0, out: [], lastWord: 0 };
}
function rvLoadW(cpu, a) {
  if (a & 3) throw { trap: "misaligned load at 0x" + (a >>> 0).toString(16) };
  if (a + 4 > cpu.memsz || a < 0) throw { trap: "load out of bounds at 0x" + (a >>> 0).toString(16) };
  return (cpu.mem[a] | (cpu.mem[a + 1] << 8) | (cpu.mem[a + 2] << 16) | (cpu.mem[a + 3] << 24)) | 0;
}
function rvStep(cpu) {
  if (cpu.halted) return "halt";
  var pc = cpu.pc >>> 0;
  if (pc & 3) throw { trap: "misaligned PC 0x" + pc.toString(16) };
  if (pc + 4 > cpu.memsz) throw { trap: "PC ran off the end of memory" };
  var w = (cpu.mem[pc] | (cpu.mem[pc + 1] << 8) | (cpu.mem[pc + 2] << 16) | (cpu.mem[pc + 3] << 24)) >>> 0;
  cpu.lastWord = w;
  var op = w & 0x7F, rd = (w >>> 7) & 31, f3 = (w >>> 12) & 7;
  var rs1 = (w >>> 15) & 31, rs2 = (w >>> 20) & 31, f7 = (w >>> 25) & 0x7F;
  var R = cpu.R;
  var npc = (pc + 4) >>> 0;
  function sx(v, bits) { return (v << (32 - bits)) >> (32 - bits); }
  function wr(d, v) { if (d) R[d] = v | 0; }
  function chkA(a, n) { if (a + n > cpu.memsz || a < 0) throw { trap: "memory access out of bounds at 0x" + (a >>> 0).toString(16) }; }
  switch (op) {
    case 0x33: {
      var a = R[rs1] | 0, b = R[rs2] | 0;
      if (f7 === 0) {
        if (f3 === 0) wr(rd, a + b);
        else if (f3 === 1) wr(rd, a << (b & 31));
        else if (f3 === 2) wr(rd, a < b ? 1 : 0);
        else if (f3 === 3) wr(rd, (a >>> 0) < (b >>> 0) ? 1 : 0);
        else if (f3 === 4) wr(rd, a ^ b);
        else if (f3 === 5) wr(rd, a >>> (b & 31));
        else if (f3 === 6) wr(rd, a | b);
        else if (f3 === 7) wr(rd, a & b);
        else throw { trap: "bad funct3" };
      } else if (f7 === 32) {
        if (f3 === 0) wr(rd, a - b);
        else if (f3 === 5) wr(rd, a >> (b & 31));
        else throw { trap: "bad funct7/funct3" };
      } else throw { trap: "bad funct7" };
      break;
    }
    case 0x13: {
      var imm = sx(w >>> 20, 12), s1 = R[rs1] | 0;
      if (f3 === 0) wr(rd, s1 + imm);
      else if (f3 === 1) wr(rd, s1 << (rs2 & 31));
      else if (f3 === 2) wr(rd, s1 < imm ? 1 : 0);
      else if (f3 === 3) wr(rd, (s1 >>> 0) < (imm >>> 0) ? 1 : 0);
      else if (f3 === 4) wr(rd, s1 ^ imm);
      else if (f3 === 6) wr(rd, s1 | imm);
      else if (f3 === 7) wr(rd, s1 & imm);
      else if (f3 === 5) {
        if (f7 === 0) wr(rd, s1 >>> (rs2 & 31));
        else if (f7 === 32) wr(rd, s1 >> (rs2 & 31));
        else throw { trap: "bad shift funct7" };
      } else throw { trap: "bad funct3" };
      break;
    }
    case 0x03: {
      var lo = sx(w >>> 20, 12), ad = (R[rs1] + lo) | 0, au = ad >>> 0;
      if (f3 === 2) { if (au & 3) throw { trap: "misaligned lw" }; chkA(au, 4); wr(rd, rvLoadW(cpu, au)); }
      else if (f3 === 1) { if (au & 1) throw { trap: "misaligned lh" }; chkA(au, 2); wr(rd, sx(cpu.mem[au] | (cpu.mem[au + 1] << 8), 16)); }
      else if (f3 === 0) { chkA(au, 1); wr(rd, sx(cpu.mem[au], 8)); }
      else if (f3 === 5) { if (au & 1) throw { trap: "misaligned lhu" }; chkA(au, 2); wr(rd, cpu.mem[au] | (cpu.mem[au + 1] << 8)); }
      else if (f3 === 4) { chkA(au, 1); wr(rd, cpu.mem[au]); }
      else throw { trap: "bad load funct3" };
      break;
    }
    case 0x23: {
      var so = sx(((w >>> 25) << 5) | ((w >>> 7) & 31), 12), sa = (R[rs1] + so) | 0, su = sa >>> 0, sv = R[rs2] | 0;
      if (f3 === 2) { if (su & 3) throw { trap: "misaligned sw" }; chkA(su, 4); cpu.mem[su] = sv & 0xFF; cpu.mem[su + 1] = (sv >>> 8) & 0xFF; cpu.mem[su + 2] = (sv >>> 16) & 0xFF; cpu.mem[su + 3] = (sv >>> 24) & 0xFF; }
      else if (f3 === 1) { if (su & 1) throw { trap: "misaligned sh" }; chkA(su, 2); cpu.mem[su] = sv & 0xFF; cpu.mem[su + 1] = (sv >>> 8) & 0xFF; }
      else if (f3 === 0) { chkA(su, 1); cpu.mem[su] = sv & 0xFF; }
      else throw { trap: "bad store funct3" };
      break;
    }
    case 0x63: {
      var bo = sx((((w >>> 31) & 1) << 12) | (((w >>> 7) & 1) << 11) | (((w >>> 25) & 0x3F) << 5) | (((w >>> 8) & 0xF) << 1), 13);
      var x = R[rs1] | 0, y = R[rs2] | 0, take = false;
      if (f3 === 0) take = x === y;
      else if (f3 === 1) take = x !== y;
      else if (f3 === 4) take = x < y;
      else if (f3 === 5) take = x >= y;
      else if (f3 === 6) take = (x >>> 0) < (y >>> 0);
      else if (f3 === 7) take = (x >>> 0) >= (y >>> 0);
      else throw { trap: "bad branch funct3" };
      if (take) npc = (pc + bo) >>> 0;
      break;
    }
    case 0x6F: {
      var jo = sx((((w >>> 31) & 1) << 20) | (((w >>> 12) & 0xFF) << 12) | (((w >>> 20) & 1) << 11) | (((w >>> 21) & 0x3FF) << 1), 21);
      wr(rd, pc + 4); npc = (pc + jo) >>> 0;
      break;
    }
    case 0x67: {
      var ji = sx(w >>> 20, 12);
      wr(rd, pc + 4); npc = ((R[rs1] + ji) & ~1) >>> 0;
      break;
    }
    case 0x37: wr(rd, w & 0xFFFFF000); break;
    case 0x17: wr(rd, (pc + (w & 0xFFFFF000)) | 0); break;
    case 0x73: {
      if (w !== 0x73) throw { trap: "bad SYSTEM encoding" };
      var svc = R[17] | 0;
      if (svc === 10) { cpu.halted = true; cpu.pc = npc; R[0] = 0; cpu.steps++; return "halt"; }
      if (svc === 1) { cpu.out.push(R[10] | 0); }
      else throw { trap: "unknown ecall service " + svc + " (use 1=print, 10=halt)" };
      break;
    }
    default: throw { trap: "illegal instruction 0x" + w.toString(16) + " at PC 0x" + pc.toString(16) };
  }
  R[0] = 0;
  cpu.pc = npc;
  cpu.steps++;
  return "ok";
}
function rvRun(cpu, limit) {
  limit = limit || 200000;
  while (!cpu.halted) {
    if (cpu.steps >= limit) throw { trap: "runaway program: " + limit + " steps with no halt (check your loop)" };
    rvStep(cpu);
  }
  return cpu;
}

/* Disassembler for the bench readout */
function rvDis(w) {
  w = w >>> 0;
  var op = w & 0x7F, rd = (w >>> 7) & 31, f3 = (w >>> 12) & 7;
  var rs1 = (w >>> 15) & 31, rs2 = (w >>> 20) & 31, f7 = (w >>> 25) & 0x7F;
  function sx(v, bits) { return (v << (32 - bits)) >> (32 - bits); }
  function rn(r) { return "x" + r; }
  var Rtab = { "0x33": null };
  if (op === 0x33) {
    var nm = { "0,0": "add", "0,32": "sub", "1,0": "sll", "2,0": "slt", "3,0": "sltu", "4,0": "xor", "5,0": "srl", "5,32": "sra", "6,0": "or", "7,0": "and" }[f3 + "," + f7];
    return nm ? nm + " " + rn(rd) + "," + rn(rs1) + "," + rn(rs2) : ".word 0x" + w.toString(16);
  }
  if (op === 0x13) {
    var im = sx(w >>> 20, 12);
    if (f3 === 1) return "slli " + rn(rd) + "," + rn(rs1) + "," + rs2;
    if (f3 === 5) return (f7 === 32 ? "srai " : "srli ") + rn(rd) + "," + rn(rs1) + "," + rs2;
    var nm2 = { 0: "addi", 2: "slti", 3: "sltiu", 4: "xori", 6: "ori", 7: "andi" }[f3];
    return nm2 ? nm2 + " " + rn(rd) + "," + rn(rs1) + "," + im : ".word 0x" + w.toString(16);
  }
  if (op === 0x03) {
    var nm3 = { 0: "lb", 1: "lh", 2: "lw", 4: "lbu", 5: "lhu" }[f3];
    return nm3 ? nm3 + " " + rn(rd) + "," + sx(w >>> 20, 12) + "(" + rn(rs1) + ")" : ".word 0x" + w.toString(16);
  }
  if (op === 0x23) {
    var nm4 = { 0: "sb", 1: "sh", 2: "sw" }[f3];
    return nm4 ? nm4 + " " + rn(rs2) + "," + sx(((w >>> 25) << 5) | ((w >>> 7) & 31), 12) + "(" + rn(rs1) + ")" : ".word 0x" + w.toString(16);
  }
  if (op === 0x63) {
    var nm5 = { 0: "beq", 1: "bne", 4: "blt", 5: "bge", 6: "bltu", 7: "bgeu" }[f3];
    var bo = sx((((w >>> 31) & 1) << 12) | (((w >>> 7) & 1) << 11) | (((w >>> 25) & 0x3F) << 5) | (((w >>> 8) & 0xF) << 1), 13);
    return nm5 ? nm5 + " " + rn(rs1) + "," + rn(rs2) + ",pc+" + bo : ".word 0x" + w.toString(16);
  }
  if (op === 0x6F) {
    var jo = sx((((w >>> 31) & 1) << 20) | (((w >>> 12) & 0xFF) << 12) | (((w >>> 20) & 1) << 11) | (((w >>> 21) & 0x3FF) << 1), 21);
    return "jal " + rn(rd) + ",pc+" + jo;
  }
  if (op === 0x67) return "jalr " + rn(rd) + "," + sx(w >>> 20, 12) + "(" + rn(rs1) + ")";
  if (op === 0x37) return "lui " + rn(rd) + ",0x" + ((w >>> 12) & 0xFFFFF).toString(16);
  if (op === 0x17) return "auipc " + rn(rd) + ",0x" + ((w >>> 12) & 0xFFFFF).toString(16);
  if (w === 0x73) return "ecall";
  return ".word 0x" + w.toString(16);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { rvAssemble: rvAssemble, rvCpu: rvCpu, rvStep: rvStep, rvRun: rvRun, rvDis: rvDis, RV_REGNAMES: RV_REGNAMES, rvLoadW: rvLoadW };
}
/* ================= THE SILICON ANVIL =================
   A real RV32I test rig: write assembly, assemble it to machine code,
   step a genuine 32-bit core, pass trials, earn certificates. */

var RV_CHALLENGES = [
  { id: "firstlight", name: "First Light",
    goal: "Put the value 42 into a0, then halt the core with ecall (a7 = 10).",
    hint: "li a0, 42  /  li a7, 10  /  ecall",
    check: function (cpu) { return (cpu.R[10] | 0) === 42; } },
  { id: "counter", name: "The Counter",
    goal: "Print 1, 2, 3, 4, 5 through the UART (ecall with a7 = 1, value in a0), then halt.",
    hint: "loop with beq, mv a0, t0, ecall, addi t0, t0, 1",
    check: function (cpu) {
      var o = cpu.out;
      return o.length === 5 && o[0] === 1 && o[1] === 2 && o[2] === 3 && o[3] === 4 && o[4] === 5;
    } },
  { id: "courier", name: "Memory Courier",
    goal: "Store the word 0xCAFE at byte address 0x100, then halt.",
    hint: "li t0, 0xCAFE  /  li t1, 0x100  /  sw t0, 0(t1)",
    check: function (cpu) { return (rvLoadW(cpu, 0x100) >>> 0) === 0xCAFE; } }
];

var RV_EXAMPLES = {
  fib: "# Fibonacci(10) into a0, the hard way. Watch t2 carry the sum.\n" +
    "addi a0, x0, 0\naddi a1, x0, 1\naddi t0, x0, 10\naddi t1, x0, 1\n" +
    "loop:\nbeq t1, t0, done\nadd t2, a0, a1\nmv a0, a1\nmv a1, t2\naddi t1, t1, 1\nj loop\n" +
    "done:\nli a7, 10\necall",
  counter: "# Count 1..5 out the UART. a7=1 prints a0, a7=10 halts.\n" +
    "addi t0, x0, 1\naddi t1, x0, 6\nloop:\nbeq t0, t1, done\nmv a0, t0\nli a7, 1\necall\naddi t0, t0, 1\nj loop\ndone:\nli a7, 10\necall",
  blank: "# THE SILICON ANVIL: a real RV32I core on the bench.\n" +
    "# Real instructions: addi add sub and or xor sll srl sra slt sltu,\n" +
    "# lw lh lb lbu lhu sw sh sb, beq bne blt bge bltu bgeu,\n" +
    "# jal jalr lui auipc ecall. Pseudos: li mv nop j ret. Comments start with #.\n" +
    "# Registers: x0..x31 or ABI names (a0..a7, t0..t6, s0..s11, ra, sp).\n" +
    "# ecall services: a7=1 prints a0 to the UART, a7=10 halts the core.\n# Memory: 4 KB, sp starts at 0x1000.\n\n" +
    "li a0, 42\nli a7, 10\necall"
};

var rvs = null;

function rvHex(n, pad) {
  var s = (n >>> 0).toString(16);
  while (s.length < pad) s = "0" + s;
  return s;
}

function rvBuild() {
  var box = document.querySelector(".dossier .actions");
  if (!box || $("rvAnvilBtn")) return;

  var css = [
    ".rv-overlay{position:fixed;inset:0;z-index:9999;background:rgba(4,8,8,.92);display:none;align-items:center;justify-content:center;padding:16px;}",
    ".rv-overlay.open{display:flex;}",
    ".rv-panel{width:min(860px,100%);max-height:94vh;overflow-y:auto;background:#0a1416;border:1px solid var(--acid);padding:16px;}",
    ".rv-panel h3{margin:0 0 4px;font-family:'Chakra Petch',sans-serif;text-transform:uppercase;letter-spacing:.02em;}",
    ".rv-sub{font-size:11px;color:#7c8d89;margin:0 0 12px;text-transform:uppercase;letter-spacing:.1em;line-height:1.7;}",
    ".rv-trials{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:10px;}",
    ".rv-trial{border:1px solid var(--line);padding:8px 10px;background:var(--panel-2);cursor:pointer;min-width:0;}",
    ".rv-trial.sel{border-color:var(--acid);}",
    ".rv-trial h5{margin:0 0 4px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--cyan);}",
    ".rv-trial p{margin:0 0 4px;font-size:11px;color:var(--ink);line-height:1.5;}",
    ".rv-trial p.hint{font-family:monospace;font-size:10px;color:#7c8d89;}",
    ".rv-ed{width:100%;min-height:190px;background:#060b0c;border:1px solid var(--line);color:var(--ink);font-family:monospace;font-size:12px;line-height:1.55;padding:10px;box-sizing:border-box;resize:vertical;}",
    ".rv-btns{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin:10px 0;}",
    ".rv-btns button{min-height:46px;padding:10px 6px;font-family:'Chakra Petch',sans-serif;font-weight:700;font-size:11px;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;background:var(--panel-2);border:1px solid var(--line);color:var(--ink);}",
    ".rv-btns button:disabled{opacity:.35;cursor:default;}",
    "#rvRun{border-color:var(--acid);color:var(--acid);}",
    ".rv-btns2{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:0 0 10px;}",
    ".rv-btns2 button{min-height:40px;padding:8px 6px;font-family:monospace;font-size:11px;cursor:pointer;background:var(--panel-2);border:1px solid var(--line);color:var(--cyan);}",
    ".rv-status{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-bottom:10px;}",
    ".rv-stat{border:1px solid var(--line);padding:6px 8px;background:var(--panel-2);min-width:0;}",
    ".rv-stat h6{margin:0 0 2px;font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:#7c8d89;font-weight:600;}",
    ".rv-stat p{margin:0;font-family:monospace;font-size:12px;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
    ".rv-cols{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;}",
    ".rv-box{border:1px solid var(--line);background:#060b0c;padding:8px;min-width:0;}",
    ".rv-box h6{margin:0 0 6px;font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:#7c8d89;font-weight:600;}",
    ".rv-regs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px;}",
    ".rv-reg{border:1px solid var(--line);padding:4px 6px;font-family:monospace;font-size:10px;color:var(--ink);}",
    ".rv-reg b{color:#7c8d89;font-weight:400;margin-right:4px;}",
    ".rv-reg.chg{border-color:var(--acid);color:var(--acid);}",
    ".rv-reg.chg b{color:var(--acid);}",
    ".rv-mem{font-family:monospace;font-size:10px;color:var(--ink);line-height:1.7;white-space:pre;overflow-x:auto;}",
    ".rv-mem .ad{color:#7c8d89;}",
    ".rv-uart{font-family:monospace;font-size:12px;color:var(--cyan);min-height:34px;white-space:pre-wrap;}",
    ".rv-listing{font-family:monospace;font-size:10px;color:var(--ink);line-height:1.7;max-height:150px;overflow-y:auto;white-space:pre;}",
    ".rv-listing .ad{color:#7c8d89;}",
    ".rv-listing .hx{color:var(--orange);}",
    ".rv-result{margin-top:10px;padding:10px 12px;font-size:13px;font-family:monospace;border:1px solid var(--line);min-height:20px;}",
    ".rv-result.win{border-color:var(--acid);color:var(--acid);}",
    ".rv-result.fail{border-color:#ff4668;color:#ff8ba0;}",
    ".rv-foot{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;}",
    ".rv-foot .secondary{flex:1;min-height:44px;}",
    "@media (max-width:640px){.rv-trials{grid-template-columns:1fr;}.rv-btns{grid-template-columns:repeat(2,minmax(0,1fr));}.rv-status{grid-template-columns:repeat(2,minmax(0,1fr));}.rv-cols{grid-template-columns:1fr;}.rv-regs{grid-template-columns:repeat(4,minmax(0,1fr));}}"
  ].join("\n");
  var st = document.createElement("style");
  st.textContent = css;
  document.head.appendChild(st);

  var b = el("button", "secondary", "Fire the Silicon Anvil");
  b.id = "rvAnvilBtn";
  b.addEventListener("click", function () { $("rvAnvilOverlay").classList.add("open"); });
  box.appendChild(b);

  var trialsHtml = RV_CHALLENGES.map(function (c, i) {
    return '<div class="rv-trial' + (i === 0 ? " sel" : "") + '" data-i="' + i + '" role="button" tabindex="0">' +
      "<h5>Trial " + (i + 1) + ": " + c.name + "</h5><p>" + c.goal + "</p>" +
      '<p class="hint">' + c.hint + "</p></div>";
  }).join("");

  var regsHtml = "";
  for (var r = 0; r < 32; r++) {
    regsHtml += '<div class="rv-reg" id="rvReg' + r + '"><b>' + RV_REGNAMES[r] + "</b><span>0</span></div>";
  }

  var ov = el("div", "rv-overlay");
  ov.id = "rvAnvilOverlay";
  ov.innerHTML =
    '<div class="rv-panel" role="dialog" aria-label="The Silicon Anvil RISC-V test rig">' +
    "<h3>The Silicon Anvil</h3>" +
    '<p class="rv-sub">A real RV32I core bolted to the bench. Write assembly, assemble it to machine code, step the silicon, pass a trial. Traps are free, certificates are earned. Craving the full curriculum? <a href="https://dillingerstaffing.github.io/riscv-playground/" target="_blank" rel="noopener" style="color:#ffd166;text-decoration:underline">Open the RISC-V Playground</a>, ten guided lessons and auto-graded challenges on the same core.</p>' +
    '<div class="rv-trials">' + trialsHtml + "</div>" +
    '<textarea class="rv-ed" id="rvEd" spellcheck="false"></textarea>' +
    '<div class="rv-btns">' +
    '<button id="rvAsm">Assemble</button>' +
    '<button id="rvRun">Run</button>' +
    '<button id="rvStep">Step</button>' +
    '<button id="rvStop" disabled>Stop</button>' +
    '<button id="rvReset">Reset</button>' +
    "</div>" +
    '<div class="rv-btns2">' +
    '<button id="rvExFib">Load: Fibonacci</button>' +
    '<button id="rvExCnt">Load: Counter</button>' +
    '<button id="rvExBlk">Load: Template</button>' +
    "</div>" +
    '<div class="rv-status">' +
    '<div class="rv-stat"><h6>PC</h6><p id="rvPc">0x00000000</p></div>' +
    '<div class="rv-stat"><h6>Next instruction</h6><p id="rvNext">--</p></div>' +
    '<div class="rv-stat"><h6>Steps</h6><p id="rvSteps">0</p></div>' +
    '<div class="rv-stat"><h6>State</h6><p id="rvState">no program</p></div>' +
    "</div>" +
    '<div class="rv-cols">' +
    '<div class="rv-box"><h6>Registers (32, live)</h6><div class="rv-regs">' + regsHtml + "</div></div>" +
    '<div class="rv-box"><h6>UART (ecall prints)</h6><div class="rv-uart" id="rvUart">(silent)</div>' +
    '<h6 style="margin-top:8px;">Memory</h6><div class="rv-mem" id="rvMem">--</div></div>' +
    "</div>" +
    '<div class="rv-box"><h6>Machine code listing</h6><div class="rv-listing" id="rvListing">Assemble something first.</div></div>' +
    '<div class="rv-result" id="rvResult"></div>' +
    '<div class="rv-foot">' +
    '<button class="secondary" id="rvHexBtn" disabled>Download HEX</button>' +
    '<button class="secondary" id="rvCertBtn" disabled>Download certificate</button>' +
    '<button class="secondary" id="rvClose">Close</button>' +
    "</div>" +
    "</div>";
  document.body.appendChild(ov);

  rvs = { asm: null, cpu: null, running: false, timer: 0, challenge: 0, cert: null, prev: null };

  $("rvEd").value = RV_EXAMPLES.blank;

  var trials = ov.querySelectorAll(".rv-trial");
  for (var ti = 0; ti < trials.length; ti++) {
    (function (t, i) {
      function sel() {
        rvs.challenge = i;
        for (var k = 0; k < trials.length; k++) trials[k].classList.remove("sel");
        t.classList.add("sel");
        toast("Trial selected: " + RV_CHALLENGES[i].name);
      }
      t.addEventListener("click", sel);
      t.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); sel(); } });
    })(trials[ti], ti);
  }

  $("rvAsm").addEventListener("click", rvAssembleUI);
  $("rvRun").addEventListener("click", rvRunUI);
  $("rvStep").addEventListener("click", rvStepUI);
  $("rvStop").addEventListener("click", rvStopUI);
  $("rvReset").addEventListener("click", rvResetUI);
  $("rvExFib").addEventListener("click", function () { $("rvEd").value = RV_EXAMPLES.fib; toast("Fibonacci example loaded"); });
  $("rvExCnt").addEventListener("click", function () { $("rvEd").value = RV_EXAMPLES.counter; toast("Counter example loaded"); });
  $("rvExBlk").addEventListener("click", function () { $("rvEd").value = RV_EXAMPLES.blank; toast("Blank template loaded"); });
  $("rvHexBtn").addEventListener("click", rvHexDownload);
  $("rvCertBtn").addEventListener("click", rvCertificate);
  $("rvClose").addEventListener("click", function () { rvStopUI(); ov.classList.remove("open"); });
  ov.addEventListener("click", function (e) { if (e.target === ov) { rvStopUI(); ov.classList.remove("open"); } });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && ov.classList.contains("open")) { rvStopUI(); ov.classList.remove("open"); }
  });

  rvRefresh();
}

function rvSetResult(msg, cls) {
  var r = $("rvResult");
  r.textContent = msg;
  r.className = "rv-result" + (cls ? " " + cls : "");
}

function rvAssembleUI() {
  rvStopUI();
  var src = $("rvEd").value;
  try {
    var a = rvAssemble(src);
    if (!a.words.length) throw { line: 0, msg: "nothing to assemble" };
    rvs.asm = a;
    rvs.cpu = rvCpu(a.words);
    rvs.prev = null;
    rvs.cert = null;
    $("rvCertBtn").disabled = true;
    $("rvHexBtn").disabled = false;
    var lh = a.listing.map(function (l) {
      return '<span class="ad">0x' + rvHex(l.addr, 8) + "</span>  " +
        '<span class="hx">' + rvHex(l.word, 8) + "</span>  " +
        rvDis(l.word) + "   <span class='ad'>; " + l.src.replace(/</g, "&lt;") + "</span>";
    }).join("\n");
    $("rvListing").innerHTML = lh;
    rvSetResult("Assembled " + a.words.length + " words. Core reset, sp = 0x1000. Run it, or step it like you mean it.", "");
    rvRefresh();
    toast("Assembled " + a.words.length + " words");
  } catch (e) {
    rvSetResult("Assembly failed" + (e.line ? " at line " + e.line : "") + ": " + (e.msg || e.trap || "error"), "fail");
  }
}

function rvStopUI() {
  rvs.running = false;
  if (rvs.timer) { clearTimeout(rvs.timer); rvs.timer = 0; }
  var rs = $("rvRun"), sp = $("rvStop");
  if (rs) rs.disabled = !rvs.cpu;
  if (sp) sp.disabled = true;
}

function rvStepOnce() {
  try {
    var st = rvStep(rvs.cpu);
    return st;
  } catch (e) {
    rvSetResult("TRAP: " + (e.trap || e.msg || "unknown") + ". The core is halted in shame.", "fail");
    rvs.cpu.halted = true;
    rvStopUI();
    rvRefresh();
    return "trap";
  }
}

function rvStepUI() {
  if (!rvs.cpu || rvs.running) return;
  var st = rvStepOnce();
  rvRefresh();
  if (st === "halt") rvOnHalt();
}

function rvRunUI() {
  if (!rvs.cpu || rvs.running) return;
  rvSetResult("Running...", "");
  rvs.running = true;
  $("rvRun").disabled = true;
  $("rvStop").disabled = false;
  function chunk() {
    if (!rvs.running) return;
    var n = 0, done = false, trapped = null;
    try {
      while (n < 4000 && !rvs.cpu.halted) { rvStep(rvs.cpu); n++; }
      done = rvs.cpu.halted;
    } catch (e) { trapped = e.trap || e.msg || "unknown"; rvs.cpu.halted = true; }
    rvRefresh();
    if (trapped) {
      rvSetResult("TRAP: " + trapped + ". The core is halted in shame.", "fail");
      rvStopUI();
      return;
    }
    if (done) { rvStopUI(); rvOnHalt(); return; }
    rvs.timer = setTimeout(chunk, 16);
  }
  chunk();
}

function rvResetUI() {
  rvStopUI();
  if (!rvs.asm) return;
  rvs.cpu = rvCpu(rvs.asm.words);
  rvs.prev = null;
  rvs.cert = null;
  $("rvCertBtn").disabled = true;
  rvSetResult("Core reset. Same program, fresh silicon.", "");
  rvRefresh();
}

function rvOnHalt() {
  var c = RV_CHALLENGES[rvs.challenge];
  var pass = false;
  try { pass = c.check(rvs.cpu); } catch (e) { pass = false; }
  if (pass) {
    rvs.cert = { trial: c.name, steps: rvs.cpu.steps, date: new Date().toISOString().slice(0, 10) };
    $("rvCertBtn").disabled = false;
    rvSetResult("TRIAL PASSED: " + c.name + " in " + rvs.cpu.steps + " steps. The anvil rings true. Certificate unlocked.", "win");
    toast("Trial passed: " + c.name);
  } else {
    rvSetResult("Halted after " + rvs.cpu.steps + " steps, but trial '" + c.name + "' not satisfied. Check the goal and try again.", "");
  }
}

function rvRefresh() {
  if (!rvs.cpu) {
    $("rvPc").textContent = "0x00000000";
    $("rvNext").textContent = "--";
    $("rvSteps").textContent = "0";
    $("rvState").textContent = "no program";
    $("rvUart").textContent = "(silent)";
    $("rvMem").textContent = "--";
    return;
  }
  var cpu = rvs.cpu;
  $("rvPc").textContent = "0x" + rvHex(cpu.pc, 8);
  $("rvSteps").textContent = String(cpu.steps);
  $("rvState").textContent = cpu.halted ? "halted" : (rvs.running ? "running" : "ready");
  var nxt = "--";
  if (cpu.pc + 4 <= cpu.memsz) {
    nxt = rvDis(cpu.mem[cpu.pc] | (cpu.mem[cpu.pc + 1] << 8) | (cpu.mem[cpu.pc + 2] << 16) | (cpu.mem[cpu.pc + 3] << 24));
  }
  $("rvNext").textContent = nxt;
  for (var r = 0; r < 32; r++) {
    var cell = $("rvReg" + r);
    var v = cpu.R[r] | 0;
    var changed = rvs.prev && rvs.prev[r] !== v;
    cell.className = "rv-reg" + (changed ? " chg" : "");
    cell.querySelector("span").textContent = "0x" + rvHex(v, 8);
    cell.title = RV_REGNAMES[r] + " = " + v + " (signed)";
  }
  rvs.prev = cpu.R.slice();
  $("rvUart").textContent = cpu.out.length ? cpu.out.join(" ") : "(silent)";
  var mh = "";
  function wordAt(a) { return (cpu.mem[a] | (cpu.mem[a + 1] << 8) | (cpu.mem[a + 2] << 16) | (cpu.mem[a + 3] << 24)) >>> 0; }
  for (var m = 0; m < 8; m++) {
    var a = m * 4;
    mh += '<span class="ad">0x' + rvHex(a, 4) + "</span> " + rvHex(wordAt(a), 8) + (m === 3 ? "\n" : "  ");
  }
  mh += "\n" + '<span class="ad">0x0100</span> ' + rvHex(wordAt(0x100), 8) + "   " + '<span class="ad">0x0FFC</span> ' + rvHex(wordAt(0xFFC), 8);
  $("rvMem").innerHTML = mh;
  $("rvRun").disabled = cpu.halted || rvs.running;
}

function rvHexDownload() {
  if (!rvs.asm) return;
  var txt = rvs.asm.listing.map(function (l) {
    return "0x" + rvHex(l.addr, 8) + "  " + rvHex(l.word, 8) + "  " + rvDis(l.word);
  }).join("\n");
  var blob = new Blob(["# Silicon Anvil machine code\n" + txt + "\n"], { type: "text/plain" });
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "anvil-program.hex";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  toast("HEX listing downloaded");
}

function rvCertificate() {
  if (!rvs.cert) return;
  var c = rvs.cert;
  var v = (typeof currentInvention === "function") ? currentInvention() : null;
  var nm = v ? v.name : "unnamed prototype";
  var code = v ? v.code : "n/a";
  var txt =
    "SILICON ANVIL TRIAL CERTIFICATE\n" +
    "Garage Inventions RV32I Test Rig\n" +
    "================================\n" +
    "Invention : " + nm + " (" + code + ")\n" +
    "Trial     : " + c.trial + "\n" +
    "Date      : " + c.date + "\n" +
    "Result    : TRIAL PASSED, CORE HALTED CLEAN\n" +
    "Steps     : " + c.steps + "\n" +
    "\nCertified by the bench. The silicon does not lie, it just traps.\n";
  var blob = new Blob([txt], { type: "text/plain" });
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "anvil-trial-certificate.txt";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  toast("Trial certificate downloaded");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", rvBuild);
} else {
  rvBuild();
}

/* ============================================================
   N. THE COIL-OVER LAB
   A real quarter-car suspension bench: tune spring rate and
   damping on a live RK4 simulation, then survive three road
   trials (speed table, pothole, washboard). Pass all three to
   earn a setup sheet.
   ============================================================ */
var CO_MS = 380, CO_MU = 42, CO_KT = 190000;
var CO_TRAVEL_MAX = 0.10, CO_ACC_MAX = 5.5, CO_SETTLE_MAX = 1.8;
var CO_TIRE_MIN = -3200, CO_RMS_MAX = 2.6;

var CO_TRIALS = [
  {
    name: "Trial 1: The Speed Table",
    desc: "A municipal speed table, 50 mm tall and 2.0 m long, taken at a dignified 6 m/s. The county thanks you for your patience.",
    kind: "bump",
    v: 6,
    T: 5,
    road: function (t) {
      var h = 0.05, L = 2.0, v = 6, dur = L / v;
      return (t >= 0 && t <= dur) ? h * Math.sin(Math.PI * t / dur) : 0;
    }
  },
  {
    name: "Trial 2: The Pothole",
    desc: "A 30 mm deep crater, 1.0 m across, at 8 m/s. Compliments of the county, no note attached.",
    kind: "pothole",
    v: 8,
    T: 5,
    road: function (t) {
      var d = 0.03, L = 1.0, v = 8, dur = L / v;
      return (t >= 0 && t <= dur) ? -d * Math.sin(Math.PI * t / dur) : 0;
    }
  },
  {
    name: "Trial 3: The Washboard",
    desc: "Corrugated gravel: 8 mm ripples on a 2.0 m wavelength at 15 m/s. Two full seconds of chatter. Hold on to your fillings.",
    kind: "wash",
    v: 15,
    T: 5,
    road: function (t) {
      var amp = 0.008, wl = 2.0, v = 15;
      return (t <= 2) ? amp * Math.sin(2 * Math.PI * v * t / wl) : 0;
    }
  }
];

function coDeriv(st, t, ks, c, roadFn) {
  var zr = roadFn(t);
  var Fs = ks * (st[0] - st[2]) + c * (st[1] - st[3]);
  var Ft = CO_KT * (st[2] - zr);
  return [st[1], -Fs / CO_MS, st[3], (Fs - Ft) / CO_MU];
}

/* Run the quarter-car sim with RK4. Returns metrics plus
   replay samples (zs, zu, zr) at 240 Hz for the animation. */
function coSim(ks, c, ti) {
  var tr = CO_TRIALS[ti];
  var dt = 0.0005, n = Math.floor(tr.T / dt);
  var s = [0, 0, 0, 0], i, j;
  var maxTravel = 0, minTire = Infinity, maxAcc = 0;
  var sumAcc2 = 0, nAcc = 0, k1, k2, k3, k4, t, acc, travel, tire;
  var rec = Math.floor(0.0041667 / dt) || 1;
  var samples = [];
  var bumpEnd = (tr.kind === "bump") ? 2.0 / 6 : (tr.kind === "pothole" ? 1.0 / 8 : 2.0);
  for (i = 0; i < n; i++) {
    t = i * dt;
    var zr = tr.road(t);
    travel = Math.abs(s[0] - s[2]);
    if (travel > maxTravel) maxTravel = travel;
    tire = CO_KT * (zr - s[2]);
    if (tire < minTire) minTire = tire;
    acc = (-ks * (s[0] - s[2]) - c * (s[1] - s[3])) / CO_MS;
    if (Math.abs(acc) > maxAcc) maxAcc = Math.abs(acc);
    var inRms = (tr.kind === "wash") ? (t > 0.4 && t < 2.0) : (t > tr.T - 1.5);
    if (inRms) { sumAcc2 += acc * acc; nAcc++; }
    if (i % rec === 0) samples.push([s[0], s[2], zr]);
    k1 = coDeriv(s, t, ks, c, tr.road);
    var a = [], b = [], d = [];
    for (j = 0; j < 4; j++) { a[j] = s[j] + 0.5 * dt * k1[j]; }
    k2 = coDeriv(a, t + 0.5 * dt, ks, c, tr.road);
    for (j = 0; j < 4; j++) { b[j] = s[j] + 0.5 * dt * k2[j]; }
    k3 = coDeriv(b, t + 0.5 * dt, ks, c, tr.road);
    for (j = 0; j < 4; j++) { d[j] = s[j] + dt * k3[j]; }
    k4 = coDeriv(d, t + dt, ks, c, tr.road);
    for (j = 0; j < 4; j++) s[j] += dt / 6 * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]);
  }
  /* settle time after the bump ends (bump and pothole only) */
  var settle = 0;
  if (tr.kind !== "wash") {
    var s2 = [0, 0, 0, 0];
    settle = 99;
    for (i = 0; i < n; i++) {
      t = i * dt;
      k1 = coDeriv(s2, t, ks, c, tr.road);
      for (j = 0; j < 4; j++) { a[j] = s2[j] + 0.5 * dt * k1[j]; }
      k2 = coDeriv(a, t + 0.5 * dt, ks, c, tr.road);
      for (j = 0; j < 4; j++) { b[j] = s2[j] + 0.5 * dt * k2[j]; }
      k3 = coDeriv(b, t + 0.5 * dt, ks, c, tr.road);
      for (j = 0; j < 4; j++) { d[j] = s2[j] + dt * k3[j]; }
      k4 = coDeriv(d, t + dt, ks, c, tr.road);
      for (j = 0; j < 4; j++) s2[j] += dt / 6 * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]);
      if (t > bumpEnd && settle === 99 && Math.abs(s2[0]) < 0.004 && Math.abs(s2[1]) < 0.03) settle = t - bumpEnd;
    }
  }
  var fails = [];
  if (maxTravel >= CO_TRAVEL_MAX) fails.push("bottomed: damper travel " + Math.round(maxTravel * 1000) + " mm over the 100 mm limit");
  if (minTire <= CO_TIRE_MIN) fails.push("lost contact: tire unloaded " + Math.round(-minTire) + " N past the 3200 N limit (wheel hopped)");
  if (tr.kind === "wash") {
    var rms = nAcc ? Math.sqrt(sumAcc2 / nAcc) : 0;
    if (rms >= CO_RMS_MAX) fails.push("chatter: RMS cabin accel " + rms.toFixed(2) + " m/s^2 over the 2.6 limit");
  } else {
    if (maxAcc >= CO_ACC_MAX) fails.push("harsh: peak cabin accel " + maxAcc.toFixed(2) + " m/s^2 over the 5.5 limit");
    if (settle >= CO_SETTLE_MAX) fails.push("floaty: settle time " + settle.toFixed(2) + " s over the 1.8 s limit");
  }
  return {
    samples: samples, dtSamp: rec * dt,
    maxTravel: maxTravel, minTire: minTire, maxAcc: maxAcc,
    rmsAcc: nAcc ? Math.sqrt(sumAcc2 / nAcc) : 0, settle: settle,
    pass: fails.length === 0, fails: fails
  };
}

function coHint(fails) {
  var tips = [];
  fails.forEach(function (f) {
    if (f.indexOf("harsh") === 0 || f.indexOf("chatter") === 0) tips.push("too harsh: soften the spring, ease off the damping, or both");
    if (f.indexOf("floaty") === 0) tips.push("too bouncy: add damping to calm it down");
    if (f.indexOf("bottomed") === 0) tips.push("bottoming out: stiffen the spring (a touch more damping helps too)");
    if (f.indexOf("lost contact") === 0) tips.push("wheel hopped: soften damping so the tire stays planted");
  });
  return tips.length ? tips.join(" ") : "";
}

function coFmt(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }

var cos = null;

function coBuild() {
  var box = document.querySelector(".dossier .actions");
  if (!box || $("coLabBtn")) return;

  var css = [
    ".co-overlay{position:fixed;inset:0;z-index:9999;background:rgba(4,8,8,.92);display:none;align-items:center;justify-content:center;padding:16px;}",
    ".co-overlay.open{display:flex;}",
    ".co-panel{width:min(860px,100%);max-height:94vh;overflow-y:auto;background:#0a1416;border:1px solid var(--acid);padding:16px;}",
    ".co-panel h3{margin:0 0 4px;font-family:'Chakra Petch',sans-serif;text-transform:uppercase;letter-spacing:.02em;}",
    ".co-sub{font-size:11px;color:#7c8d89;margin:0 0 12px;text-transform:uppercase;letter-spacing:.1em;line-height:1.7;}",
    ".co-sliders{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;}",
    ".co-ctl{border:1px solid var(--line);background:var(--panel-2);padding:10px 12px;}",
    ".co-ctl h6{margin:0 0 6px;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--cyan);font-weight:600;}",
    ".co-ctl .val{font-family:monospace;font-size:13px;color:var(--ink);margin-bottom:6px;}",
    ".co-ctl input[type=range]{width:100%;min-height:44px;accent-color:var(--acid);}",
    ".co-presets{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:10px;}",
    ".co-presets button{min-height:46px;padding:10px 6px;font-family:'Chakra Petch',sans-serif;font-weight:700;font-size:11px;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;background:var(--panel-2);border:1px solid var(--line);color:var(--cyan);}",
    ".co-trials{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:10px;}",
    ".co-trial{border:1px solid var(--line);padding:10px;background:var(--panel-2);display:flex;flex-direction:column;gap:8px;min-width:0;}",
    ".co-trial h5{margin:0;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--cyan);}",
    ".co-trial p{margin:0;font-size:11px;color:var(--ink);line-height:1.6;flex:1;}",
    ".co-trial .badge{font-family:monospace;font-size:11px;padding:4px 8px;border:1px solid var(--line);color:#72827f;text-align:center;}",
    ".co-trial .badge.pass{border-color:var(--acid);color:var(--acid);}",
    ".co-trial .badge.fail{border-color:#ff4668;color:#ff8ba0;}",
    ".co-trial button{min-height:46px;padding:10px 6px;font-family:'Chakra Petch',sans-serif;font-weight:700;font-size:11px;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;background:#0a1416;border:1px solid var(--orange);color:var(--orange);}",
    ".co-trial button:disabled{opacity:.35;cursor:default;}",
    ".co-stage{border:1px solid var(--line);background:#060b0c;margin-bottom:10px;}",
    ".co-stage canvas{display:block;width:100%;height:240px;}",
    ".co-tel{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:10px;}",
    ".co-tel .t{border:1px solid var(--line);padding:6px 10px;background:var(--panel-2);}",
    ".co-tel .t h6{margin:0 0 2px;font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:#7c8d89;font-weight:600;}",
    ".co-tel .t p{margin:0;font-family:monospace;font-size:13px;color:var(--ink);}",
    ".co-tel .t p.bad{color:#ff8ba0;}",
    ".co-result{margin-top:0;padding:10px 12px;font-size:13px;font-family:monospace;border:1px solid var(--line);min-height:20px;line-height:1.6;margin-bottom:10px;}",
    ".co-result.win{border-color:var(--acid);color:var(--acid);}",
    ".co-result.fail{border-color:#ff4668;color:#ff8ba0;}",
    ".co-foot{display:flex;gap:8px;flex-wrap:wrap;}",
    ".co-foot .secondary{flex:1;min-height:44px;}",
    "@media (max-width:640px){.co-sliders{grid-template-columns:1fr;}.co-trials{grid-template-columns:1fr;}.co-presets{grid-template-columns:1fr;}.co-tel{grid-template-columns:1fr;}}"
  ].join("\n");
  var st = document.createElement("style");
  st.textContent = css;
  document.head.appendChild(st);

  var b = el("button", "secondary", "Open the Coil-Over Lab");
  b.id = "coLabBtn";
  b.addEventListener("click", function () { $("coLabOverlay").classList.add("open"); coDraw(0, null, null); });
  box.appendChild(b);

  var trialsHtml = CO_TRIALS.map(function (tr, i) {
    return '<div class="co-trial"><h5>' + tr.name + '</h5><p>' + tr.desc + '</p>' +
      '<div class="badge" id="coBadge' + i + '">not run</div>' +
      '<button id="coRun' + i + '">Run trial</button></div>';
  }).join("");

  var ov = el("div", "co-overlay");
  ov.id = "coLabOverlay";
  ov.innerHTML =
    '<div class="co-panel" role="dialog" aria-label="The Coil-Over Lab suspension bench">' +
    "<h3>The Coil-Over Lab</h3>" +
    '<p class="co-sub">A quarter-car rig with real physics (380 kg body, 42 kg wheel, live tire spring). Tune the spring rate and damping, then survive three road trials. Pass all three and the bench signs your setup sheet.</p>' +
    '<div class="co-sliders">' +
    '<div class="co-ctl"><h6>Spring rate</h6><div class="val" id="coKsVal"></div>' +
    '<input type="range" id="coKs" min="12000" max="70000" step="1000" value="30000" aria-label="Spring rate"></div>' +
    '<div class="co-ctl"><h6>Damping</h6><div class="val" id="coCVal"></div>' +
    '<input type="range" id="coC" min="800" max="8000" step="100" value="3000" aria-label="Damping"></div>' +
    "</div>" +
    '<div class="co-presets">' +
    '<button id="coPComfort">Comfort tune</button>' +
    '<button id="coPSport">Sport tune</button>' +
    '<button id="coPTrack">Track tune</button>' +
    "</div>" +
    '<div class="co-trials">' + trialsHtml + "</div>" +
    '<div class="co-stage"><canvas id="coCanvas"></canvas></div>' +
    '<div class="co-tel">' +
    '<div class="t"><h6>Cabin accel</h6><p id="coTelAcc">--</p></div>' +
    '<div class="t"><h6>Damper travel</h6><p id="coTelTrav">--</p></div>' +
    '<div class="t"><h6>Tire contact</h6><p id="coTelTire">--</p></div>' +
    "</div>" +
    '<div class="co-result" id="coResult">Set your spring and damping, then run a trial.</div>' +
    '<div class="co-foot">' +
    '<button class="secondary" id="coSheetBtn" disabled>Download setup sheet</button>' +
    '<button class="secondary" id="coClose">Close</button>' +
    "</div>" +
    "</div>";
  document.body.appendChild(ov);

  cos = { ks: 30000, c: 3000, passed: [false, false, false], at: [null, null, null], running: false, anim: null };

  function refreshLabels() {
    $("coKsVal").textContent = coFmt(cos.ks) + " N/m (" + (cos.ks / 1000).toFixed(0) + " N/mm)";
    $("coCVal").textContent = coFmt(cos.c) + " N-s/m";
  }
  $("coKs").addEventListener("input", function (e) { cos.ks = +e.target.value; refreshLabels(); });
  $("coC").addEventListener("input", function (e) { cos.c = +e.target.value; refreshLabels(); });
  function preset(ks, c, nm) {
    cos.ks = ks; cos.c = c;
    $("coKs").value = ks; $("coC").value = c;
    refreshLabels();
    toast(nm + " loaded: " + coFmt(ks) + " N/m, " + coFmt(c) + " N-s/m");
  }
  $("coPComfort").addEventListener("click", function () { preset(14000, 1000, "Comfort"); });
  $("coPSport").addEventListener("click", function () { preset(20000, 1800, "Sport"); });
  $("coPTrack").addEventListener("click", function () { preset(45000, 6500, "Track"); });

  for (var i = 0; i < 3; i++) {
    (function (ti) {
      $("coRun" + ti).addEventListener("click", function () { coRunTrial(ti); });
    })(i);
  }

  $("coClose").addEventListener("click", function () {
    if (cos.anim) { cancelAnimationFrame(cos.anim); cos.anim = null; }
    cos.running = false;
    $("coLabOverlay").classList.remove("open");
  });
  $("coSheetBtn").addEventListener("click", coCertificate);
  refreshLabels();
}

function coRunTrial(ti) {
  if (cos.running) return;
  cos.running = true;
  for (var i = 0; i < 3; i++) $("coRun" + i).disabled = true;
  var res;
  try {
    res = coSim(cos.ks, cos.c, ti);
  } catch (e) {
    cos.running = false;
    for (var k = 0; k < 3; k++) $("coRun" + k).disabled = false;
    $("coResult").className = "co-result fail";
    $("coResult").textContent = "The rig threw a rod (simulation error). Try different settings.";
    return;
  }
  var tr = CO_TRIALS[ti];
  var dur = 3.4;
  var t0 = performance.now();
  var canvas = $("coCanvas");
  function frame(now) {
    var t = Math.min((now - t0) / 1000 / dur, 1) * tr.T;
    var idx = Math.min(Math.floor(t / res.dtSamp), res.samples.length - 1);
    var smp = res.samples[idx];
    coDraw(t, smp, res, tr);
    if (t < tr.T) {
      cos.anim = requestAnimationFrame(frame);
    } else {
      cos.anim = null;
      cos.running = false;
      for (var j = 0; j < 3; j++) $("coRun" + j).disabled = false;
      coFinishTrial(ti, res);
    }
  }
  cos.anim = requestAnimationFrame(frame);
  $("coResult").className = "co-result";
  $("coResult").textContent = "Running " + tr.name + " at " + coFmt(cos.ks) + " N/m, " + coFmt(cos.c) + " N-s/m...";
}

function coFinishTrial(ti, res) {
  var badge = $("coBadge" + ti);
  if (res.pass) {
    cos.passed[ti] = true;
    cos.at[ti] = { ks: cos.ks, c: cos.c };
    badge.className = "badge pass";
    badge.textContent = "PASSED";
    $("coResult").className = "co-result win";
    var txt = CO_TRIALS[ti].name + " PASSED at " + coFmt(cos.ks) + " N/m, " + coFmt(cos.c) + " N-s/m. ";
    txt += "Peak cabin accel " + res.maxAcc.toFixed(2) + " m/s^2, travel " + Math.round(res.maxTravel * 1000) + " mm";
    if (CO_TRIALS[ti].kind === "wash") txt += ", RMS accel " + res.rmsAcc.toFixed(2) + " m/s^2";
    else txt += ", settle " + res.settle.toFixed(2) + " s";
    txt += ".";
    $("coResult").textContent = txt;
    toast(CO_TRIALS[ti].name + " passed");
  } else {
    badge.className = "badge fail";
    badge.textContent = "FAILED";
    $("coResult").className = "co-result fail";
    var hint = coHint(res.fails);
    $("coResult").textContent = CO_TRIALS[ti].name + " FAILED: " + res.fails.join("; ") + ". " + hint;
    toast("Trial failed");
  }
  if (cos.passed[0] && cos.passed[1] && cos.passed[2]) {
    $("coSheetBtn").disabled = false;
    $("coResult").textContent += " ALL THREE TRIALS PASSED. The bench will sign your setup sheet.";
  }
}

function coDraw(t, smp, res, tr) {
  var cv = $("coCanvas");
  if (!cv) return;
  var dpr = window.devicePixelRatio || 1;
  var w = cv.clientWidth, h = 240;
  if (cv.width !== w * dpr) { cv.width = w * dpr; cv.height = h * dpr; }
  var g = cv.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = "#060b0c";
  g.fillRect(0, 0, w, h);

  var SY = 300; /* px per meter, vertical */
  var wheelX = w * 0.34;
  var roadBase = h - 44;
  var wheelR = 30;
  var zs = smp ? smp[0] : 0, zu = smp ? smp[1] : 0;

  /* road surface, scrolling */
  if (tr && smp) {
    g.beginPath();
    g.moveTo(0, h);
    var pxm = 46;
    for (var x = 0; x <= w; x += 6) {
      var tAt = t - (x - wheelX) / pxm / tr.v;
      var ry = roadBase - tr.road(tAt < 0 ? 0 : tAt) * SY;
      g.lineTo(x, ry);
    }
    g.lineTo(w, h);
    g.closePath();
    g.fillStyle = "#101a1b";
    g.fill();
    g.strokeStyle = "#2a3a3c";
    g.lineWidth = 1;
    g.stroke();
  } else {
    g.fillStyle = "#101a1b";
    g.fillRect(0, roadBase, w, h - roadBase);
  }

  var wy = roadBase - wheelR - zu * SY;
  var bodyW = 170, bodyH = 46;
  var by = wy - 96 - zs * SY + zu * 0; /* body rides on its own offset */
  by = roadBase - wheelR - 96 - zs * SY;

  /* spring: zigzag between body and wheel */
  var topY = by + bodyH, botY = wy - wheelR;
  var cx = wheelX;
  g.strokeStyle = "#9dff57";
  g.lineWidth = 3;
  g.beginPath();
  var coils = 7, yy;
  g.moveTo(cx - 26, topY);
  g.lineTo(cx - 26, topY + 6);
  for (var cI = 0; cI <= coils; cI++) {
    yy = topY + 6 + (botY - topY - 12) * (cI / coils);
    g.lineTo(cx + (cI % 2 ? 16 : -16), yy);
  }
  g.lineTo(cx + 26, botY - 6);
  g.lineTo(cx + 26, botY);
  g.stroke();
  /* damper */
  g.strokeStyle = "#39d7ff";
  g.lineWidth = 5;
  var dx = wheelX + 44;
  g.beginPath();
  g.moveTo(dx, topY);
  g.lineTo(dx, (topY + botY) / 2);
  g.stroke();
  g.fillStyle = "#39d7ff";
  g.fillRect(dx - 8, (topY + botY) / 2 - 4, 16, 8);
  g.strokeStyle = "#39d7ff";
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(dx, (topY + botY) / 2 + 4);
  g.lineTo(dx, botY);
  g.stroke();

  /* wheel */
  g.beginPath();
  g.arc(wheelX, wy, wheelR, 0, Math.PI * 2);
  g.fillStyle = "#1a2425";
  g.fill();
  g.strokeStyle = "#7c8d89";
  g.lineWidth = 2;
  g.stroke();
  g.beginPath();
  g.arc(wheelX, wy, 10, 0, Math.PI * 2);
  g.fillStyle = "#39494b";
  g.fill();

  /* body */
  g.fillStyle = "#14201f";
  g.strokeStyle = "#9dff57";
  g.lineWidth = 1.5;
  var bx = wheelX - bodyW / 2;
  g.beginPath();
  g.rect(bx, by, bodyW, bodyH);
  g.fill();
  g.stroke();
  g.fillStyle = "#9dff57";
  g.font = "10px monospace";
  g.fillText("380 KG", bx + 8, by + 18);
  g.fillStyle = "#39d7ff";
  g.fillText("COIL-OVER RIG", bx + 8, by + 34);

  /* live telemetry */
  if (smp && res) {
    var idxT = Math.min(Math.floor(t / res.dtSamp), res.samples.length - 1);
    var sNow = res.samples[idxT];
    var accNow = 0;
    if (idxT > 1) {
      var vNow = (res.samples[idxT][0] - res.samples[idxT - 1][0]) / res.dtSamp;
      var vPrev = (res.samples[idxT - 1][0] - res.samples[idxT - 2][0]) / res.dtSamp;
      accNow = (vNow - vPrev) / res.dtSamp;
    }
    var travNow = Math.abs(sNow[0] - sNow[1]);
    var tireNow = CO_KT * (sNow[2] - sNow[1]);
    var elA = $("coTelAcc"), elT = $("coTelTrav"), elC = $("coTelTire");
    if (elA) {
      elA.textContent = Math.abs(accNow).toFixed(2) + " m/s^2";
      elA.className = Math.abs(accNow) > CO_ACC_MAX ? "bad" : "";
    }
    if (elT) {
      elT.textContent = Math.round(travNow * 1000) + " mm";
      elT.className = travNow > CO_TRAVEL_MAX ? "bad" : "";
    }
    if (elC) {
      elC.textContent = tireNow > CO_TIRE_MIN ? "planted" : "AIRBORNE";
      elC.className = tireNow > CO_TIRE_MIN ? "" : "bad";
    }
  }
}

function coCertificate() {
  if (!(cos.passed[0] && cos.passed[1] && cos.passed[2])) return;
  var v = (typeof currentInvention === "function") ? currentInvention() : null;
  var nm = v ? v.name : "unnamed prototype";
  var code = v ? v.code : "n/a";
  var lines = cos.at.map(function (a, i) {
    return "  " + CO_TRIALS[i].name + ": " + coFmt(a.ks) + " N/m, " + coFmt(a.c) + " N-s/m";
  });
  var txt =
    "COIL-OVER LAB SETUP SHEET\n" +
    "Garage Inventions Suspension Bench\n" +
    "==================================\n" +
    "Invention : " + nm + " (" + code + ")\n" +
    "Date      : " + new Date().toISOString().slice(0, 10) + "\n" +
    "Result    : ALL THREE ROAD TRIALS PASSED\n" +
    "Winning setups:\n" + lines.join("\n") + "\n" +
    "\nLimits held: damper travel under 100 mm, peak cabin accel under\n" +
    "5.5 m/s^2 on bumps, settle under 1.8 s, washboard RMS under\n" +
    "2.6 m/s^2, tires planted throughout.\n" +
    "\nSigned by the bench. The road does not grade on a curve.\n";
  var blob = new Blob([txt], { type: "text/plain" });
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "coilover-setup-sheet.txt";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  toast("Setup sheet downloaded");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", coBuild);
} else {
  coBuild();
}


/* ============================================================
   11. THE WIND TUNNEL: low-speed aerodynamics bench (playable)
   Real thin-airfoil theory: Cl = 2*pi*(alpha - alpha0),
   Cd = Cd0 + Cl^2 / (pi * AR * e), with a post-stall lift
   bleed past the critical angle. Tune camber, thickness and
   angle of attack, then blow three fixed-speed trials.
   ============================================================ */
var WT_S = 10;       /* wing area, m^2 */
var WT_RHO = 1.225;  /* air density, kg/m^3 */
var WT_AR = 6;       /* aspect ratio */
var WT_E = 0.9;      /* Oswald efficiency */

function wtAlpha0(camber) { return -camber; }              /* deg: 2% camber gives -2 deg zero-lift angle */
function wtAlphaCrit(camber) { return 14 - 0.5 * camber; } /* deg: cambered wings stall earlier */

function wtPolar(camber, thick, alphaDeg) {
  var a0 = wtAlpha0(camber), ac = wtAlphaCrit(camber);
  var slope = 2 * Math.PI * Math.PI / 180; /* thin-airfoil lift slope, per degree */
  var cl, stalled = alphaDeg > ac;
  if (!stalled) {
    cl = slope * (alphaDeg - a0);
  } else {
    var clCrit = slope * (ac - a0);
    var over = Math.min(alphaDeg - ac, 14);
    cl = clCrit * (1 - 0.42 * over / 14); /* separated flow bleeds lift off */
  }
  var cd0 = 0.006 + 0.0004 * thick;
  var k = 1 / (Math.PI * WT_AR * WT_E);
  var cd = cd0 + k * cl * cl;
  return { cl: cl, cd: cd, a0: a0, ac: ac, stalled: stalled };
}

function wtForces(camber, thick, alphaDeg, v) {
  var p = wtPolar(camber, thick, alphaDeg);
  var qS = 0.5 * WT_RHO * v * v * WT_S;
  return {
    cl: p.cl, cd: p.cd,
    l: qS * p.cl, d: qS * p.cd,
    ld: p.cd > 0 ? p.cl / p.cd : 0,
    a0: p.a0, ac: p.ac, stalled: p.stalled,
    margin: p.ac - alphaDeg
  };
}

var WT_TRIALS = [
  {
    name: "Trial 1: Heavy Lift",
    desc: "Fixed 38 m/s headwind. Generate at least 14.0 kN of lift. Camber is cheap lift, but the wing stalls at a lower angle when cambered.",
    v: 38,
    judge: function (f) { return f.l >= 14000; }
  },
  {
    name: "Trial 2: Endurance Glide",
    desc: "Fixed 60 m/s. Hold lift-to-drag of 20 or better while carrying at least 8.0 kN. Thin wings and small angles glide best.",
    v: 60,
    judge: function (f) { return f.ld >= 20 && f.l >= 8000; }
  },
  {
    name: "Trial 3: Carrier Approach",
    desc: "Fixed 30 m/s. Carry at least 8.0 kN with 3 degrees or more of stall margin. High camber, high angle, short of the buffet.",
    v: 30,
    judge: function (f) { return f.l >= 8000 && f.margin >= 3; }
  }
];

var wts = null;

function wtBuild() {
  var box = document.querySelector(".dossier .actions");
  if (!box || $("wtBtn")) return;

  var css = [
    ".wt-overlay{position:fixed;inset:0;z-index:9999;background:rgba(4,8,8,.92);display:none;align-items:center;justify-content:center;padding:16px;}",
    ".wt-overlay.open{display:flex;}",
    ".wt-panel{width:min(860px,100%);max-height:94vh;overflow-y:auto;background:#0a1416;border:1px solid var(--acid);padding:16px;}",
    ".wt-panel h3{margin:0 0 4px;font-family:'Chakra Petch',sans-serif;text-transform:uppercase;letter-spacing:.02em;}",
    ".wt-sub{font-size:11px;color:#7c8d89;margin:0 0 12px;text-transform:uppercase;letter-spacing:.1em;line-height:1.7;}",
    ".wt-sliders{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;}",
    ".wt-ctl{border:1px solid var(--line);background:var(--panel-2);padding:10px 12px;}",
    ".wt-ctl h6{margin:0 0 6px;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--cyan);font-weight:600;}",
    ".wt-ctl .val{font-family:monospace;font-size:13px;color:var(--ink);margin-bottom:6px;}",
    ".wt-ctl input[type=range]{width:100%;min-height:44px;accent-color:var(--acid);}",
    ".wt-trials{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:10px;}",
    ".wt-trial{border:1px solid var(--line);padding:10px;background:var(--panel-2);display:flex;flex-direction:column;gap:8px;min-width:0;}",
    ".wt-trial h5{margin:0;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--cyan);}",
    ".wt-trial p{margin:0;font-size:11px;color:var(--ink);line-height:1.6;flex:1;}",
    ".wt-trial .badge{font-family:monospace;font-size:11px;padding:4px 8px;border:1px solid var(--line);color:#72827f;text-align:center;}",
    ".wt-trial .badge.pass{border-color:var(--acid);color:var(--acid);}",
    ".wt-trial .badge.fail{border-color:#ff4668;color:#ff8ba0;}",
    ".wt-trial button{min-height:46px;padding:10px 6px;font-family:'Chakra Petch',sans-serif;font-weight:700;font-size:11px;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;background:#0a1416;border:1px solid var(--orange);color:var(--orange);}",
    ".wt-trial button:disabled{opacity:.35;cursor:default;}",
    ".wt-stage{border:1px solid var(--line);background:#060b0c;margin-bottom:10px;}",
    ".wt-stage canvas{display:block;width:100%;height:240px;}",
    ".wt-tel{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:10px;}",
    ".wt-tel .t{border:1px solid var(--line);padding:6px 10px;background:var(--panel-2);}",
    ".wt-tel .t h6{margin:0 0 2px;font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:#7c8d89;font-weight:600;}",
    ".wt-tel .t p{margin:0;font-family:monospace;font-size:13px;color:var(--ink);}",
    ".wt-tel .t p.warn{color:var(--orange);}",
    ".wt-tel .t p.bad{color:#ff8ba0;}",
    ".wt-result{margin-top:0;padding:10px 12px;font-size:13px;font-family:monospace;border:1px solid var(--line);min-height:20px;line-height:1.6;margin-bottom:10px;}",
    ".wt-result.win{border-color:var(--acid);color:var(--acid);}",
    ".wt-result.fail{border-color:#ff4668;color:#ff8ba0;}",
    ".wt-foot{display:flex;gap:8px;flex-wrap:wrap;}",
    ".wt-foot .secondary{flex:1;min-height:44px;}",
    "@media (max-width:640px){.wt-sliders{grid-template-columns:1fr;}.wt-trials{grid-template-columns:1fr;}.wt-tel{grid-template-columns:1fr;}}"
  ].join("\n");
  var st = document.createElement("style");
  st.textContent = css;
  document.head.appendChild(st);

  var b = el("button", "secondary", "Open the Wind Tunnel");
  b.id = "wtBtn";
  b.addEventListener("click", function () {
    $("wtOverlay").classList.add("open");
    wtSizeCanvas();
    wtRefresh();
  });
  box.appendChild(b);

  var trialsHtml = WT_TRIALS.map(function (tr, i) {
    return '<div class="wt-trial"><h5>' + tr.name + '</h5><p>' + tr.desc + '</p>' +
      '<div class="badge" id="wtBadge' + i + '">not run</div>' +
      '<button id="wtRun' + i + '">Run trial</button></div>';
  }).join("");

  var ov = el("div", "wt-overlay");
  ov.id = "wtOverlay";
  ov.innerHTML =
    '<div class="wt-panel" role="dialog" aria-label="The Wind Tunnel aerodynamics bench">' +
    "<h3>The Wind Tunnel</h3>" +
    '<p class="wt-sub">A 10 m^2 test wing on the balance. Real thin-airfoil polars, a live smoke tunnel, and three fixed-speed trials. Pass all three and the tunnel signs your log.</p>' +
    '<div class="wt-sliders">' +
    '<div class="wt-ctl"><h6>Angle of attack</h6><div class="val" id="wtAlphaVal"></div>' +
    '<input type="range" id="wtAlpha" min="-4" max="24" step="0.5" value="6" aria-label="Angle of attack"></div>' +
    '<div class="wt-ctl"><h6>Camber</h6><div class="val" id="wtCamberVal"></div>' +
    '<input type="range" id="wtCamber" min="0" max="6" step="0.5" value="2" aria-label="Camber"></div>' +
    '<div class="wt-ctl"><h6>Thickness</h6><div class="val" id="wtThickVal"></div>' +
    '<input type="range" id="wtThick" min="6" max="18" step="0.5" value="12" aria-label="Thickness"></div>' +
    '<div class="wt-ctl"><h6>Airspeed (live tunnel)</h6><div class="val" id="wtVVal"></div>' +
    '<input type="range" id="wtV" min="20" max="90" step="1" value="50" aria-label="Airspeed"></div>' +
    "</div>" +
    '<div class="wt-trials">' + trialsHtml + "</div>" +
    '<div class="wt-stage"><canvas id="wtCanvas"></canvas></div>' +
    '<div class="wt-tel">' +
    '<div class="t"><h6>Lift coefficient</h6><p id="wtCl">--</p></div>' +
    '<div class="t"><h6>Drag coefficient</h6><p id="wtCd">--</p></div>' +
    '<div class="t"><h6>Lift</h6><p id="wtLift">--</p></div>' +
    '<div class="t"><h6>Drag</h6><p id="wtDrag">--</p></div>' +
    '<div class="t"><h6>Lift / drag</h6><p id="wtLD">--</p></div>' +
    '<div class="t"><h6>Stall margin</h6><p id="wtMargin">--</p></div>' +
    "</div>" +
    '<div class="wt-result" id="wtResult">Set your wing, then run a trial.</div>' +
    '<div class="wt-foot">' +
    '<button class="secondary" id="wtCertBtn" disabled>Download tunnel log</button>' +
    '<button class="secondary" id="wtClose">Close</button>' +
    "</div>" +
    "</div>";
  document.body.appendChild(ov);

  wts = {
    alpha: 6, camber: 2, thick: 12, v: 50,
    passed: [false, false, false], setups: [null, null, null],
    running: false, anim: null, parts: [], trialV: null
  };

  ["wtAlpha", "wtCamber", "wtThick", "wtV"].forEach(function (id) {
    $(id).addEventListener("input", function () {
      if (wts.running) return;
      wts.alpha = +$("wtAlpha").value;
      wts.camber = +$("wtCamber").value;
      wts.thick = +$("wtThick").value;
      wts.v = +$("wtV").value;
      wtRefresh();
    });
  });

  for (var i = 0; i < 3; i++) {
    (function (ti) {
      $("wtRun" + ti).addEventListener("click", function () { wtRunTrial(ti); });
    })(i);
  }

  $("wtClose").addEventListener("click", function () {
    if (wts.anim) { cancelAnimationFrame(wts.anim); wts.anim = null; }
    wts.running = false;
    $("wtOverlay").classList.remove("open");
  });
  $("wtCertBtn").addEventListener("click", wtCertificate);
  wtInitParts();
}

function wtSizeCanvas() {
  var c = $("wtCanvas");
  if (!c) return;
  var w = c.clientWidth || 700;
  c.width = w;
  c.height = 240;
}

function wtInitParts() {
  wts.parts = [];
  for (var i = 0; i < 120; i++) {
    wts.parts.push({ x: Math.random() * 900, y: Math.random() * 240, s: 0.7 + Math.random() * 0.6 });
  }
}

function wtRefresh() {
  $("wtAlphaVal").textContent = wts.alpha.toFixed(1) + " deg";
  $("wtCamberVal").textContent = wts.camber.toFixed(1) + " % chord";
  $("wtThickVal").textContent = wts.thick.toFixed(1) + " % chord";
  $("wtVVal").textContent = wts.v + " m/s";
  var f = wtForces(wts.camber, wts.thick, wts.alpha, wts.v);
  wtTelUpdate(f);
  wtDrawPerf(performance.now() / 1000, wts.v, f);
}

function wtTelUpdate(f) {
  $("wtCl").textContent = f.cl.toFixed(3);
  $("wtCd").textContent = f.cd.toFixed(4);
  $("wtLift").textContent = (f.l / 1000).toFixed(1) + " kN";
  $("wtDrag").textContent = Math.round(f.d) + " N";
  $("wtLD").textContent = f.ld.toFixed(1);
  var m = $("wtMargin");
  if (f.stalled) {
    m.textContent = "STALLED (" + f.margin.toFixed(1) + " deg)";
    m.className = "bad";
  } else if (f.margin < 3) {
    m.textContent = f.margin.toFixed(1) + " deg (thin)";
    m.className = "warn";
  } else {
    m.textContent = f.margin.toFixed(1) + " deg";
    m.className = "";
  }
}

function wtAirfoilPts(camber, thick) {
  var m = camber / 100, t = thick / 100, p = 0.4, n = 42, up = [], lo = [];
  for (var i = 0; i <= n; i++) {
    var x = i / n, yc, dyc;
    var yt = 5 * t * (0.2969 * Math.sqrt(x) - 0.1260 * x - 0.3516 * x * x + 0.2843 * x * x * x - 0.1015 * x * x * x * x);
    if (x < p) {
      yc = m / (p * p) * (2 * p * x - x * x);
      dyc = 2 * m / (p * p) * (p - x);
    } else {
      yc = m / ((1 - p) * (1 - p)) * ((1 - 2 * p) + 2 * p * x - x * x);
      dyc = 2 * m / ((1 - p) * (1 - p)) * (p - x);
    }
    var th = Math.atan(dyc);
    up.push([x - yt * Math.sin(th), yc + yt * Math.cos(th)]);
    lo.push([x + yt * Math.sin(th), yc - yt * Math.cos(th)]);
  }
  return { up: up, lo: lo };
}

function wtDrawPerf(t, v, f) {
  var c = $("wtCanvas");
  if (!c || !c.width) return;
  var g = c.getContext("2d");
  var W = c.width, H = c.height;
  g.fillStyle = "#060b0c";
  g.fillRect(0, 0, W, H);

  var wx = W * 0.36, wy = H * 0.56, chord = Math.min(170, W * 0.24);
  var pxPerM = chord; /* 1 chord = 1 unit of influence radius math */

  /* smoke particles */
  var i, p, vx, iwx, dyp, wake = f.stalled;
  var base = v * 2.6;
  for (i = 0; i < wts.parts.length; i++) {
    p = wts.parts[i];
    vx = base * p.s;
    var dxp = p.x - wx;
    var near = Math.abs(dxp) < chord * 1.1;
    if (near) {
      dyp = p.y - wy;
      if (dxp < 0 && Math.abs(dyp) < chord * 0.6) {
        p.y -= 0.35 * (1 + Math.max(0, f.cl));           /* upwash ahead */
        if (dyp < 0) vx *= 1 + 0.35 * Math.min(1.5, Math.max(0, f.cl)); /* faster over the top */
      }
      if (dxp > 0 && Math.abs(dyp) < chord * 0.8) {
        p.y += 0.18 * Math.max(0, f.cl) + 0.12;          /* downwash behind */
      }
      if (wake && dxp > -chord * 0.3 && Math.abs(dyp) < chord * 0.55) {
        p.x += (Math.random() - 0.5) * 5;               /* separated buffet */
        p.y += (Math.random() - 0.5) * 6;
      }
    }
    p.x += vx * 0.016;
    if (p.x > W + 8) { p.x = -8; p.y = Math.random() * H; }

    var trail = Math.min(26, vx * 0.045);
    var col = "rgba(57,215,255,0.5)";
    if (near && p.y < wy && p.y > wy - chord * 0.55) col = "rgba(157,255,87,0.75)";   /* suction side */
    if (wake && dxp > 0 && Math.abs(p.y - wy) < chord * 0.5) col = "rgba(255,150,60,0.8)"; /* stalled wake */
    g.strokeStyle = col;
    g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(p.x, p.y);
    g.lineTo(p.x - trail, p.y);
    g.stroke();
  }

  /* the wing: NACA 4-digit-ish profile, pitched by alpha (nose up) */
  var pts = wtAirfoilPts(wts.camber, wts.thick);
  var ar = -wts.alpha * Math.PI / 180;
  var cosA = Math.cos(ar), sinA = Math.sin(ar);
  function X(xn, yn) {
    var rx = (xn - 0.25) * chord, ry = -yn * chord;
    return [wx + rx * cosA - ry * sinA, wy + rx * sinA + ry * cosA];
  }
  g.beginPath();
  var q = X(pts.up[0][0], pts.up[0][1]);
  g.moveTo(q[0], q[1]);
  for (i = 1; i < pts.up.length; i++) { q = X(pts.up[i][0], pts.up[i][1]); g.lineTo(q[0], q[1]); }
  for (i = pts.lo.length - 1; i >= 0; i--) { q = X(pts.lo[i][0], pts.lo[i][1]); g.lineTo(q[0], q[1]); }
  g.closePath();
  g.fillStyle = "#14201f";
  g.fill();
  g.strokeStyle = f.stalled ? "#ff8ba0" : "#9dff57";
  g.lineWidth = 2;
  g.stroke();

  /* balance strut */
  g.strokeStyle = "#39494b";
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(wx + chord * 0.25 * cosA, wy + 6);
  g.lineTo(wx + chord * 0.25 * cosA, H - 4);
  g.stroke();

  /* labels */
  g.fillStyle = "#7c8d89";
  g.font = "10px monospace";
  g.fillText("TEST SECTION", 10, 16);
  g.fillText(v + " m/s", 10, 32);
  if (f.stalled) {
    g.fillStyle = "#ff8ba0";
    g.fillText("FLOW SEPARATED", 10, 48);
  }
}

function wtJudgeLine(ti, avg) {
  if (ti === 0) return "Measured lift " + (avg.l / 1000).toFixed(1) + " kN (needed 14.0).";
  if (ti === 1) return "Measured L/D " + avg.ld.toFixed(1) + " (needed 20.0) at " + (avg.l / 1000).toFixed(1) + " kN lift.";
  return "Measured lift " + (avg.l / 1000).toFixed(1) + " kN (needed 8.0), stall margin " + avg.margin.toFixed(1) + " deg (needed 3.0).";
}

function wtHint(ti, avg) {
  var ac = wtAlphaCrit(wts.camber);
  if (ti === 0 && avg.l < 14000) return "Hint: more lift means more camber and more angle, but the wing stalls at " + ac.toFixed(1) + " deg with this camber.";
  if (ti === 1) return "Hint: drag is eating the glide. Try a thinner wing and a smaller angle, near the L/D sweet spot.";
  if (ti === 2 && avg.margin < 3) return "Hint: too close to the buffet. Back the angle off and add camber to keep the lift.";
  if (ti === 2) return "Hint: not enough lift at this speed. More camber, more angle, but keep 3 degrees of margin.";
  return "";
}

function wtRunTrial(ti) {
  if (wts.running) return;
  wts.running = true;
  wts.trialV = WT_TRIALS[ti].v;
  var ids = ["wtAlpha", "wtCamber", "wtThick", "wtV"];
  ids.forEach(function (id) { $(id).disabled = true; });
  for (var i = 0; i < 3; i++) $("wtRun" + i).disabled = true;
  $("wtResult").className = "wt-result";
  $("wtResult").textContent = WT_TRIALS[ti].name + " blowing at " + WT_TRIALS[ti].v + " m/s. Stand clear of the intake.";
  var acc = { l: 0, d: 0, ld: 0, margin: 0, n: 0 };
  var dur = 3.2, t0 = performance.now();
  function frame(now) {
    var el2 = (now - t0) / 1000;
    var f = wtForces(wts.camber, wts.thick, wts.alpha, wts.trialV);
    acc.l += f.l; acc.d += f.d; acc.ld += f.ld; acc.margin += f.margin; acc.n++;
    wtTelUpdate(f);
    wtDrawPerf(now / 1000, wts.trialV, f);
    if (el2 < dur) { wts.anim = requestAnimationFrame(frame); return; }
    finish();
  }
  function finish() {
    wts.running = false;
    wts.trialV = null;
    ids.forEach(function (id) { $(id).disabled = false; });
    for (var k = 0; k < 3; k++) $("wtRun" + k).disabled = false;
    var avg = { l: acc.l / acc.n, d: acc.d / acc.n, ld: acc.ld / acc.n, margin: acc.margin / acc.n };
    var tr = WT_TRIALS[ti];
    var ok = tr.judge(avg);
    var badge = $("wtBadge" + ti);
    if (ok) {
      wts.passed[ti] = true;
      wts.setups[ti] = { camber: wts.camber, thick: wts.thick, alpha: wts.alpha, l: avg.l, ld: avg.ld, margin: avg.margin };
      badge.textContent = "pass";
      badge.className = "badge pass";
      $("wtResult").className = "wt-result win";
      $("wtResult").textContent = tr.name + ": PASSED. " + wtJudgeLine(ti, avg);
      toast(tr.name + " passed");
    } else {
      badge.textContent = "fail";
      badge.className = "badge fail";
      $("wtResult").className = "wt-result fail";
      $("wtResult").textContent = tr.name + ": FAILED. " + wtJudgeLine(ti, avg) + " " + wtHint(ti, avg);
    }
    if (wts.passed[0] && wts.passed[1] && wts.passed[2]) {
      $("wtCertBtn").disabled = false;
      $("wtResult").textContent += " ALL THREE TRIALS PASSED. The tunnel will sign your log.";
    }
    wtRefresh();
  }
  wts.anim = requestAnimationFrame(frame);
}

function wtCertificate() {
  if (!(wts.passed[0] && wts.passed[1] && wts.passed[2])) return;
  var v = (typeof currentInvention === "function") ? currentInvention() : null;
  var nm = v ? v.name : "unnamed prototype";
  var code = v ? v.code : "n/a";
  var lines = wts.setups.map(function (s, i) {
    return "  " + WT_TRIALS[i].name + ": camber " + s.camber.toFixed(1) + "%, thickness " +
      s.thick.toFixed(1) + "%, alpha " + s.alpha.toFixed(1) + " deg, lift " +
      (s.l / 1000).toFixed(1) + " kN, L/D " + s.ld.toFixed(1) + ", margin " + s.margin.toFixed(1) + " deg";
  });
  var txt =
    "WIND TUNNEL LOG\n" +
    "Garage Inventions Aerodynamics Bench\n" +
    "====================================\n" +
    "Invention : " + nm + " (" + code + ")\n" +
    "Date      : " + new Date().toISOString().slice(0, 10) + "\n" +
    "Wing      : 10.0 m^2, aspect ratio 6, Oswald 0.90, sea level\n" +
    "Result    : ALL THREE TUNNEL TRIALS PASSED\n" +
    "Winning setups:\n" + lines.join("\n") + "\n" +
    "\nHeavy lift at 38 m/s, glide efficiency at 60 m/s, carrier approach\n" +
    "at 30 m/s with stall margin held throughout.\n" +
    "\nSigned by the tunnel. The air does not negotiate.\n";
  var blob = new Blob([txt], { type: "text/plain" });
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "windtunnel-log.txt";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  toast("Tunnel log downloaded");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", wtBuild);
} else {
  wtBuild();
}

})();


/* ============================================================
   12. THE DYNO ROOM: engine tuning bench (playable)
   A 2.0L naturally aspirated four on the rollers. Tune
   ignition advance, mixture, and cam timing, then run three
   fixed trials: a peak-power pull, a torque-plateau pull, and
   a three-pull endurance run. Too much advance or too lean a
   mixture detonates; too much retard melts the exhaust.
   ============================================================ */
(function () {
  /* Self-contained: local copies of the $ / toast / el helpers, so this
     module never depends on helpers scoped inside other modules. */
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

var DY_MBT = 27;       /* best-torque timing, deg BTDC */
var DY_AFR0 = 12.8;    /* best-power mixture */
var DY_TPEAK = 230;    /* peak crank torque, Nm */
var DY_HP = 7121;      /* Nm*rpm per hp */

function dyAt(adv, afr, cam, rpm) {
  var peakRpm = 4500 + cam * 120;
  var shape = Math.exp(-Math.pow((rpm - peakRpm) / 2300, 2));
  var t = DY_TPEAK * (0.35 + 0.65 * shape);
  var dafr = afr - DY_AFR0;
  var afrEff = 1 - 0.02 * dafr * dafr;
  if (afr > 16.5) afrEff *= 0.6;      /* lean misfire */
  if (afr < 11) afrEff *= 0.92;       /* rich wash */
  var advEff = adv <= DY_MBT
    ? 1 - 0.0016 * Math.pow(DY_MBT - adv, 2)
    : 1 - 0.002 * Math.pow(adv - DY_MBT, 2);
  var knockLimit = DY_MBT + 5 - 1.6 * dafr - (rpm > 5500 ? 3 : 0) - (rpm > 6500 ? 2 : 0);
  var excess = adv - knockLimit;
  var knockPen = excess > 0 ? Math.min(0.3, 0.05 * excess) : 0;
  var T = Math.max(0, t * Math.max(0, afrEff) * Math.max(0, advEff) * (1 - knockPen));
  var egt = 600 + 26 * dafr + 14 * Math.max(0, DY_MBT - adv) * 0.5 +
    (rpm / 7000) * 90 + (excess > 0 ? 40 * excess : 0);
  return { t: T, hp: T * rpm / DY_HP, egt: egt, knock: Math.max(0, excess) };
}

var DY_TRIALS = [
  {
    name: "Trial 1: Peak Power",
    desc: "One full sweep, 2000 to 7000 rpm. Make at least 190 hp at the crank. High cam timing moves the torque peak up the range; nail the advance and mixture.",
    judge: function (s) { return s.peak >= 190; }
  },
  {
    name: "Trial 2: Torque Plateau",
    desc: "Same sweep. Average at least 205 Nm between 3000 and 5500 rpm. Fat midrange wants the cam centered and the tune right on the edge of best torque.",
    judge: function (s) { return s.avgT >= 205; }
  },
  {
    name: "Trial 3: Endurance",
    desc: "Three back-to-back pulls. Every pull must clear 155 hp, exhaust temp must stay under 850 C, and there must be zero knock events. Calm tunes survive.",
    judge: function (s) { return s.peak >= 155 && s.maxEGT < 850 && s.knocks === 0; }
  }
];

var dys = null;

function dyBuild() {
  var box = document.querySelector(".dossier .actions");
  if (!box || $("dyBtn")) return;

  var css = [
    ".dy-overlay{position:fixed;inset:0;z-index:9999;background:rgba(4,8,8,.92);display:none;align-items:center;justify-content:center;padding:16px;}",
    ".dy-overlay.open{display:flex;}",
    ".dy-panel{width:min(880px,100%);max-height:94vh;overflow-y:auto;background:#0a1416;border:1px solid var(--acid);padding:16px;}",
    ".dy-panel h3{margin:0 0 4px;font-family:'Chakra Petch',sans-serif;text-transform:uppercase;letter-spacing:.02em;}",
    ".dy-sub{font-size:11px;color:#7c8d89;margin:0 0 12px;text-transform:uppercase;letter-spacing:.1em;line-height:1.7;}",
    ".dy-sliders{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;}",
    ".dy-ctl{border:1px solid var(--line);background:var(--panel-2);padding:10px 12px;}",
    ".dy-ctl h6{margin:0 0 6px;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--cyan);font-weight:600;}",
    ".dy-ctl .val{font-family:monospace;font-size:13px;color:var(--ink);margin-bottom:6px;}",
    ".dy-ctl input[type=range]{width:100%;min-height:44px;accent-color:var(--acid);}",
    ".dy-trials{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:10px;}",
    ".dy-trial{border:1px solid var(--line);padding:10px;background:var(--panel-2);display:flex;flex-direction:column;gap:8px;min-width:0;}",
    ".dy-trial h5{margin:0;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--cyan);}",
    ".dy-trial p{margin:0;font-size:11px;color:var(--ink);line-height:1.6;flex:1;}",
    ".dy-trial .badge{font-family:monospace;font-size:11px;padding:4px 8px;border:1px solid var(--line);color:#72827f;text-align:center;}",
    ".dy-trial .badge.pass{border-color:var(--acid);color:var(--acid);}",
    ".dy-trial .badge.fail{border-color:#ff4668;color:#ff8ba0;}",
    ".dy-trial button{min-height:46px;padding:10px 6px;font-family:'Chakra Petch',sans-serif;font-weight:700;font-size:11px;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;background:#0a1416;border:1px solid var(--orange);color:var(--orange);}",
    ".dy-trial button:disabled{opacity:.35;cursor:default;}",
    ".dy-stage{border:1px solid var(--line);background:#060b0c;margin-bottom:10px;}",
    ".dy-stage canvas{display:block;width:100%;height:250px;}",
    ".dy-tel{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-bottom:10px;}",
    ".dy-tel .t{border:1px solid var(--line);padding:6px 10px;background:var(--panel-2);}",
    ".dy-tel .t h6{margin:0 0 2px;font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:#7c8d89;font-weight:600;}",
    ".dy-tel .t p{margin:0;font-family:monospace;font-size:13px;color:var(--ink);}",
    ".dy-tel .t p.warn{color:var(--orange);}",
    ".dy-tel .t p.bad{color:#ff8ba0;}",
    ".dy-result{padding:10px 12px;font-size:13px;font-family:monospace;border:1px solid var(--line);min-height:20px;line-height:1.6;margin-bottom:10px;}",
    ".dy-result.win{border-color:var(--acid);color:var(--acid);}",
    ".dy-result.fail{border-color:#ff4668;color:#ff8ba0;}",
    ".dy-foot{display:flex;gap:8px;flex-wrap:wrap;}",
    ".dy-foot .secondary{flex:1;min-height:44px;}",
    "@media (max-width:640px){.dy-sliders{grid-template-columns:1fr;}.dy-trials{grid-template-columns:1fr;}.dy-tel{grid-template-columns:repeat(2,minmax(0,1fr));}}"
  ].join("\n");
  var st = document.createElement("style");
  st.textContent = css;
  document.head.appendChild(st);

  var b = el("button", "secondary", "Open the Dyno Room");
  b.id = "dyBtn";
  b.addEventListener("click", function () {
    $("dyOverlay").classList.add("open");
    dySizeCanvas();
    dyRefresh();
  });
  box.appendChild(b);

  var trialsHtml = DY_TRIALS.map(function (tr, i) {
    return '<div class="dy-trial"><h5>' + tr.name + '</h5><p>' + tr.desc + '</p>' +
      '<div class="badge" id="dyBadge' + i + '">not run</div>' +
      '<button id="dyRun' + i + '">Run trial</button></div>';
  }).join("");

  var ov = el("div", "dy-overlay");
  ov.id = "dyOverlay";
  ov.innerHTML =
    '<div class="dy-panel" role="dialog" aria-label="The Dyno Room engine tuning bench">' +
    "<h3>The Dyno Room</h3>" +
    '<p class="dy-sub">A 2.0L naturally aspirated four strapped to the rollers. Tune the ignition, the mixture, and the cam, then run three trials. Best torque timing is 27 deg; best power mixture is 12.8. Everything else is a trade.</p>' +
    '<div class="dy-sliders">' +
    '<div class="dy-ctl"><h6>Ignition advance</h6><div class="val" id="dyAdvVal"></div>' +
    '<input type="range" id="dyAdv" min="0" max="40" step="0.5" value="18" aria-label="Ignition advance"></div>' +
    '<div class="dy-ctl"><h6>Mixture (AFR)</h6><div class="val" id="dyAfrVal"></div>' +
    '<input type="range" id="dyAfr" min="10" max="18" step="0.1" value="14.5" aria-label="Air fuel ratio"></div>' +
    '<div class="dy-ctl"><h6>Cam timing</h6><div class="val" id="dyCamVal"></div>' +
    '<input type="range" id="dyCam" min="-12" max="12" step="1" value="-4" aria-label="Cam timing"></div>' +
    '<div class="dy-ctl"><h6>Live RPM (dyno readout)</h6><div class="val" id="dyRpmVal"></div>' +
    '<input type="range" id="dyRpm" min="2000" max="7000" step="100" value="4000" aria-label="Live RPM"></div>' +
    "</div>" +
    '<div class="dy-trials">' + trialsHtml + "</div>" +
    '<div class="dy-stage"><canvas id="dyCanvas"></canvas></div>' +
    '<div class="dy-tel">' +
    '<div class="t"><h6>Power</h6><p id="dyHp">--</p></div>' +
    '<div class="t"><h6>Torque</h6><p id="dyTq">--</p></div>' +
    '<div class="t"><h6>Exhaust temp</h6><p id="dyEgt">--</p></div>' +
    '<div class="t"><h6>Knock</h6><p id="dyKnock">--</p></div>' +
    "</div>" +
    '<div class="dy-result" id="dyResult">Set your tune, then run a trial. The rollers do not care about your intentions.</div>' +
    '<div class="dy-foot">' +
    '<button class="secondary" id="dyCertBtn" disabled>Download dyno sheet</button>' +
    '<button class="secondary" id="dyClose">Close the dyno room</button>' +
    "</div></div>";
  document.body.appendChild(ov);

  dys = {
    adv: 18, afr: 14.5, cam: -4, rpm: 4000,
    running: false, anim: null, sweepRpm: null, sweepMax: 7000,
    passed: [false, false, false], setups: [null, null, null], pull: 0
  };

  ["dyAdv", "dyAfr", "dyCam", "dyRpm"].forEach(function (id, i) {
    $(id).addEventListener("input", function (e) {
      var v = parseFloat(e.target.value);
      if (i === 0) dys.adv = v; else if (i === 1) dys.afr = v;
      else if (i === 2) dys.cam = v; else dys.rpm = v;
      dyRefresh();
    });
  });

  for (var i = 0; i < 3; i++) {
    (function (ti) {
      $("dyRun" + ti).addEventListener("click", function () { dyRunTrial(ti); });
    })(i);
  }

  $("dyClose").addEventListener("click", function () {
    if (dys.anim) { cancelAnimationFrame(dys.anim); dys.anim = null; }
    dys.running = false;
    dys.sweepRpm = null;
    $("dyOverlay").classList.remove("open");
  });
  $("dyCertBtn").addEventListener("click", dyCertificate);
}

function dySizeCanvas() {
  var c = $("dyCanvas");
  if (!c) return;
  var w = c.clientWidth || 700;
  c.width = w;
  c.height = 250;
}

function dyRefresh() {
  $("dyAdvVal").textContent = dys.adv.toFixed(1) + " deg BTDC";
  $("dyAfrVal").textContent = dys.afr.toFixed(1) + ":1";
  $("dyCamVal").textContent = (dys.cam > 0 ? "+" : "") + dys.cam.toFixed(0) + " deg";
  $("dyRpmVal").textContent = Math.round(dys.rpm) + " rpm";
  dyTelUpdate(dyAt(dys.adv, dys.afr, dys.cam, dys.rpm));
  dyDraw(dys.rpm, -1);
}

function dyTelUpdate(r) {
  $("dyHp").textContent = r.hp.toFixed(1) + " hp";
  $("dyTq").textContent = Math.round(r.t) + " Nm";
  var e = $("dyEgt");
  e.textContent = Math.round(r.egt) + " C";
  e.className = r.egt > 920 ? "bad" : (r.egt > 850 ? "warn" : "");
  var k = $("dyKnock");
  if (r.knock > 6) { k.textContent = "SEVERE"; k.className = "bad"; }
  else if (r.knock > 2) { k.textContent = "pinging"; k.className = "warn"; }
  else if (r.knock > 0) { k.textContent = "trace"; k.className = ""; }
  else { k.textContent = "none"; k.className = ""; }
}

function dyDraw(rpmNow, revealRpm) {
  var c = $("dyCanvas");
  if (!c || !c.width) return;
  var g = c.getContext("2d");
  var W = c.width, H = c.height;
  g.fillStyle = "#060b0c";
  g.fillRect(0, 0, W, H);
  var L = 46, R = 14, T = 14, B = 26;
  var x0 = function (rpm) { return L + (rpm - 2000) / 5000 * (W - L - R); };
  var yP = function (hp) { return T + (1 - hp / 230) * (H - T - B); };
  var yT = function (tq) { return T + (1 - tq / 280) * (H - T - B); };

  g.strokeStyle = "#1b2b2d";
  g.lineWidth = 1;
  g.fillStyle = "#7c8d89";
  g.font = "9px monospace";
  var r;
  for (r = 2000; r <= 7000; r += 1000) {
    g.beginPath(); g.moveTo(x0(r), T); g.lineTo(x0(r), H - B); g.stroke();
    g.fillText((r / 1000) + "k", x0(r) - 6, H - 10);
  }
  for (var hp = 50; hp <= 200; hp += 50) {
    g.beginPath(); g.moveTo(L, yP(hp)); g.lineTo(W - R, yP(hp)); g.stroke();
    g.fillText(hp + " hp", 6, yP(hp) + 3);
  }

  /* full predicted curves, faint */
  function trace(yf, col, alpha) {
    g.strokeStyle = col;
    g.globalAlpha = alpha;
    g.lineWidth = 1.5;
    g.beginPath();
    for (var rr = 2000; rr <= 7000; rr += 100) {
      var d = dyAt(dys.adv, dys.afr, dys.cam, rr);
      var x = x0(rr), y = yf === "hp" ? yP(d.hp) : yT(d.t);
      if (rr === 2000) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
    g.globalAlpha = 1;
  }
  trace("hp", "#39d7ff", 0.35);
  trace("tq", "#9dff57", 0.35);

  /* measured (revealed) portion, bright */
  if (revealRpm > 2000) {
    g.strokeStyle = "#39d7ff";
    g.lineWidth = 2.5;
    g.beginPath();
    var started = false;
    for (var m = 2000; m <= Math.min(revealRpm, 7000); m += 50) {
      var dd = dyAt(dys.adv, dys.afr, dys.cam, m);
      var xx = x0(m);
      if (!started) { g.moveTo(xx, yP(dd.hp)); started = true; }
      else g.lineTo(xx, yP(dd.hp));
      if (dd.knock > 2) { /* knock tick */
        g.stroke();
        g.strokeStyle = "#ff4668";
        g.beginPath(); g.moveTo(xx, yP(dd.hp)); g.lineTo(xx, yP(dd.hp) - 8); g.stroke();
        g.strokeStyle = "#39d7ff";
        g.beginPath(); g.moveTo(xx, yP(dd.hp));
      }
    }
    g.stroke();
  }

  /* sweep marker */
  var xm = x0(rpmNow);
  g.strokeStyle = "rgba(255,255,255,.55)";
  g.lineWidth = 1;
  g.beginPath(); g.moveTo(xm, T); g.lineTo(xm, H - B); g.stroke();
  var now = dyAt(dys.adv, dys.afr, dys.cam, rpmNow);
  g.fillStyle = "#39d7ff";
  g.beginPath(); g.arc(xm, yP(now.hp), 4, 0, 7); g.fill();

  g.fillStyle = "#7c8d89";
  g.fillText("POWER (cyan)", L, T - 2);
  g.fillStyle = "#9dff57";
  g.fillText("TORQUE (green)", L + 110, T - 2);
  if (dys.sweepRpm != null) {
    g.fillStyle = "#ff8ba0";
    g.fillText("PULL IN PROGRESS", W - 150, T - 2);
  }
}

function dyJudgeLine(ti, s) {
  if (ti === 0) return "Peak " + s.peak.toFixed(1) + " hp (needed 190).";
  if (ti === 1) return "Average " + s.avgT.toFixed(1) + " Nm from 3000 to 5500 rpm (needed 205).";
  return "Peak " + s.peak.toFixed(1) + " hp, max EGT " + Math.round(s.maxEGT) + " C, knock events " + s.knocks + ".";
}

function dyHint(ti, s) {
  if (s.damaged) return "The engine is damaged. Back the timing off toward 27 deg and richen the mixture toward 12.8 before trying again.";
  if (ti === 0 && s.peak < 190) return "Hint: more cam timing moves the torque peak up the revs, but only if the mixture and advance are near their best.";
  if (ti === 1 && s.avgT < 205) return "Hint: the plateau lives in the midrange. Center the cam, run 27 deg and 12.8 AFR, and let the fat part of the curve do the work.";
  if (ti === 2 && s.knocks > 0) return "Hint: knock kills endurance runs. Retard the advance a degree or two and add a touch of fuel.";
  if (ti === 2 && s.maxEGT >= 850) return "Hint: the exhaust is running hot. Richen the mixture and avoid heavy retard.";
  if (ti === 2) return "Hint: 155 hp is not much, but three clean pulls in a row is. Tune for calm, not glory.";
  return "";
}

function dyRunTrial(ti) {
  if (dys.running) return;
  dys.running = true;
  dys.pull = 0;
  var ids = ["dyAdv", "dyAfr", "dyCam", "dyRpm"];
  ids.forEach(function (id) { $(id).disabled = true; });
  for (var i = 0; i < 3; i++) $("dyRun" + i).disabled = true;
  $("dyResult").className = "dy-result";
  var pulls = ti === 2 ? 3 : 1;
  $("dyResult").textContent = DY_TRIALS[ti].name + ": " + (pulls > 1 ? "three pulls" : "one pull") + ", 2000 to 7000 rpm. Stand behind the barrier.";
  var s = { peak: 0, sumT: 0, nT: 0, maxEGT: 0, knocks: 0, damaged: false };
  var t0 = performance.now(), dur = 3.4;
  dys.sweepRpm = 2000;

  function sample(rpm) {
    var r = dyAt(dys.adv, dys.afr, dys.cam, rpm);
    if (r.hp > s.peak) s.peak = r.hp;
    if (rpm >= 3000 && rpm <= 5500) { s.sumT += r.t; s.nT++; }
    if (r.egt > s.maxEGT) s.maxEGT = r.egt;
    if (r.knock > 2) s.knocks++;
    if (r.knock > 6 || r.egt > 920) s.damaged = true;
    return r;
  }

  function frame(now) {
    var el2 = (now - t0) / 1000;
    var rpm = 2000 + Math.min(el2 / dur, 1) * 5000;
    dys.sweepRpm = rpm;
    var r = sample(rpm);
    dyTelUpdate(r);
    dyDraw(rpm, rpm);
    if (s.damaged) { abort(); return; }
    if (el2 < dur) { dys.anim = requestAnimationFrame(frame); return; }
    dys.pull++;
    if (dys.pull < pulls) {
      t0 = performance.now();
      dys.sweepRpm = 2000;
      $("dyResult").textContent = DY_TRIALS[ti].name + ": pull " + (dys.pull + 1) + " of " + pulls + ". Cool-down lap.";
      dys.anim = requestAnimationFrame(frame);
      return;
    }
    finish();
  }

  function abort() {
    dys.running = false;
    dys.sweepRpm = null;
    dys.anim = null;
    ids.forEach(function (id) { $(id).disabled = false; });
    for (var k = 0; k < 3; k++) $("dyRun" + k).disabled = false;
    var badge = $("dyBadge" + ti);
    badge.textContent = "fail";
    badge.className = "badge fail";
    $("dyResult").className = "dy-result fail";
    $("dyResult").textContent = DY_TRIALS[ti].name + ": FAILED. Engine damaged on the rollers. " + dyHint(ti, s);
    dyRefresh();
  }

  function finish() {
    dys.running = false;
    dys.sweepRpm = null;
    dys.anim = null;
    ids.forEach(function (id) { $(id).disabled = false; });
    for (var k = 0; k < 3; k++) $("dyRun" + k).disabled = false;
    var avgT = s.nT ? s.sumT / s.nT : 0;
    var sum = { peak: s.peak, avgT: avgT, maxEGT: s.maxEGT, knocks: s.knocks, damaged: s.damaged };
    var ok = !s.damaged && DY_TRIALS[ti].judge(sum);
    var badge = $("dyBadge" + ti);
    if (ok) {
      dys.passed[ti] = true;
      dys.setups[ti] = { adv: dys.adv, afr: dys.afr, cam: dys.cam, peak: s.peak, avgT: avgT, maxEGT: s.maxEGT, knocks: s.knocks };
      badge.textContent = "pass";
      badge.className = "badge pass";
      $("dyResult").className = "dy-result win";
      $("dyResult").textContent = DY_TRIALS[ti].name + ": PASSED. " + dyJudgeLine(ti, sum);
      toast(DY_TRIALS[ti].name + " passed");
    } else {
      badge.textContent = "fail";
      badge.className = "badge fail";
      $("dyResult").className = "dy-result fail";
      $("dyResult").textContent = DY_TRIALS[ti].name + ": FAILED. " + dyJudgeLine(ti, sum) + " " + dyHint(ti, sum);
    }
    if (dys.passed[0] && dys.passed[1] && dys.passed[2]) {
      $("dyCertBtn").disabled = false;
      $("dyResult").textContent += " ALL THREE TRIALS PASSED. The dyno will sign your sheet.";
    }
    dyRefresh();
  }

  dys.anim = requestAnimationFrame(frame);
}

function dyCertificate() {
  if (!(dys.passed[0] && dys.passed[1] && dys.passed[2])) return;
  var v = (typeof currentInvention === "function") ? currentInvention() : null;
  var nm = v ? v.name : "unnamed prototype";
  var code = v ? v.code : "n/a";
  var lines = dys.setups.map(function (x, i) {
    return "  " + DY_TRIALS[i].name + ": advance " + x.adv.toFixed(1) + " deg, AFR " +
      x.afr.toFixed(1) + ", cam " + (x.cam > 0 ? "+" : "") + x.cam.toFixed(0) +
      " deg, peak " + x.peak.toFixed(1) + " hp, plateau " + x.avgT.toFixed(1) +
      " Nm, max EGT " + Math.round(x.maxEGT) + " C, knock events " + x.knocks;
  });
  var txt =
    "DYNO SHEET\n" +
    "Garage Inventions Engine Tuning Bench\n" +
    "=====================================\n" +
    "Invention : " + nm + " (" + code + ")\n" +
    "Date      : " + new Date().toISOString().slice(0, 10) + "\n" +
    "Engine    : 2.0L naturally aspirated four, 2000-7000 rpm sweeps\n" +
    "Result    : ALL THREE DYNO TRIALS PASSED\n" +
    "Winning tunes:\n" + lines.join("\n") + "\n" +
    "\nPeak power over 190 hp, a 205 Nm midrange plateau, and three\n" +
    "clean endurance pulls with no knock and a cool exhaust.\n" +
    "\nSigned by the rollers. Horsepower is a receipt.\n";
  var blob = new Blob([txt], { type: "text/plain" });
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "dyno-sheet.txt";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  toast("Dyno sheet downloaded");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", dyBuild);
} else {
  dyBuild();
}
})();

/* ============================================================
   13. THE MANGONEL RANGE: torsion siege-engine bench (playable)
   A rope-skein stone thrower on the range. Tune the skein
   preload, arm length, sling length, stone mass, and release
   pin, then loose three trials: a max-range throw in calm air,
   a precision shot at the 80 m stake in shifting wind, and a
   three-stone siege-train volley. Over-wound short arms shear
   at the pivot; long slings plow the field; weak skeins cannot
   lift the stone. All flight is integrated live with quadratic
   drag, so the animation is the physics, not a cartoon of it.
   Fully self-contained: defines its own helpers, touches
   nothing else in this file.
   MANGONEL-RANGE-BENCH-13
   ============================================================ */
(function () {
  "use strict";

  /* ---------- physics ---------- */
  var MG_G = 9.81;
  var MG_RHO = 1.225;
  var MG_CD = 0.47;
  var MG_STONE_RHO = 2700;
  var MG_PIVOT_H = 1.2;
  var MG_THETA0 = -60 * Math.PI / 180;      /* cocked arm angle */
  var MG_THETA_STOP = 55 * Math.PI / 180;   /* crossbar stop angle */
  var MG_K = 5.5;                            /* skein energy, J per turn^2 */
  var MG_EFF = 0.82;                         /* swing efficiency */
  var MG_SHEAR = 1400;                       /* J per m of arm: shear limit */
  var MG_TARGET = 80;                        /* stake distance, m */

  function mgStoneRadius(m) { return Math.pow(3 * m / (4 * Math.PI * MG_STONE_RHO), 1 / 3); }

  /* Full shot model. Returns {fail:"drag"|"shear"|"weak"} or
     {fail:null, range, v0, x0, y0, lamDeg, k, wind}. */
  function mgSim(N, L, S, mp, lamDeg, wind) {
    if (S > 0.6 * L) return { fail: "drag" };
    var E = MG_K * N * N;
    var armMass = 6 + 1.5 * L;
    if (E / L > MG_SHEAR) return { fail: "shear" };
    var rEff = L + S;
    var iArm = (1 / 3) * armMass * L * L;
    var iTot = iArm + mp * rEff * rEff;
    var dPE = MG_G * (armMass * L / 2 + mp * rEff) *
      (Math.sin(MG_THETA_STOP) - Math.sin(MG_THETA0));
    if (E <= dPE) return { fail: "weak" };
    var omega = Math.sqrt(2 * MG_EFF * (E - dPE) / iTot);
    var v = omega * rEff;
    var lam = lamDeg * Math.PI / 180;
    var x0 = L * Math.cos(MG_THETA_STOP) + S * Math.cos(lam);
    var y0 = MG_PIVOT_H + L * Math.sin(MG_THETA_STOP) + S * Math.sin(lam);
    var r = mgStoneRadius(mp);
    var k = 0.5 * MG_RHO * MG_CD * Math.PI * r * r / mp;
    var x = x0, y = y0;
    var vx = v * Math.cos(lam), vy = v * Math.sin(lam);
    var dt = 0.004, t = 0;
    while (y > 0 && t < 40) {
      var rvx = vx - wind, rvy = vy;
      var sp = Math.sqrt(rvx * rvx + rvy * rvy);
      vx -= k * sp * rvx * dt;
      vy -= (MG_G + k * sp * rvy) * dt;
      x += vx * dt; y += vy * dt; t += dt;
    }
    return { fail: null, range: x, v0: v, x0: x0, y0: y0, lamDeg: lamDeg, k: k, wind: wind };
  }

  function mgFrameLoad(N, L) { return MG_K * N * N / L / MG_SHEAR; }

  var MG_FAIL_MSG = {
    drag: "Sling drag: the stone plows the field. The sling must stay under 60 percent of the arm.",
    shear: "Structural failure: the arm shears at the pivot. Less preload, or a longer arm to spread the load.",
    weak: "The skein cannot lift the stone. More preload, a longer arm, or a lighter stone."
  };

  /* ---------- tiny local helpers (no reliance on page globals) ---------- */
  function mg$(id) { return document.getElementById(id); }
  function mgEl(tag, cls, html) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (html != null) d.innerHTML = html;
    return d;
  }
  function mgToast(msg) {
    if (typeof window.showToast === "function") { window.showToast(msg); return; }
    var t = mg$("toast") || mg$("mgToast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(function () { t.classList.remove("show"); }, 1800);
  }
  function mgFmt(n, d) { return Number(n).toFixed(d == null ? 1 : d); }

  /* ---------- trials ---------- */
  var MG_TRIALS = [
    {
      name: "Trial 1: The Far Field",
      desc: "One throw, dead calm air. Clear 120 m. Long arms forgive heavy preloads; light stones fly farthest.",
      judge: function (s) { return s.range >= 120; }
    },
    {
      name: "Trial 2: The Keep Gate",
      desc: "One stone at the 80 m stake, within 5 m. The flag shows the wind for your next shot: read it, compensate, loose.",
      judge: function (s) { return Math.abs(s.range - MG_TARGET) <= 5; }
    },
    {
      name: "Trial 3: The Siege Train",
      desc: "A three-stone volley at the 80 m stake. Every stone must land within 8 m, with fresh wind per stone and no broken machinery.",
      judge: function (shots) {
        for (var i = 0; i < shots.length; i++) {
          if (shots[i].fail || Math.abs(shots[i].range - MG_TARGET) > 8) return false;
        }
        return true;
      }
    }
  ];

  /* ---------- state ---------- */
  var mg = {
    built: false,
    animating: false,
    raf: 0,
    badges: [null, null, null],
    wins: [],
    best: 0,
    nextWind: 0,
    view: { xMax: 120, theta: MG_THETA0, flights: [], landed: [] },
    lastShots: []
  };

  function mgRollWind() {
    mg.nextWind = Math.round((Math.random() * 16 - 8) * 10) / 10;
  }

  function mgParams() {
    return {
      N: parseFloat(mg$("mgN").value),
      L: parseFloat(mg$("mgL").value),
      S: parseFloat(mg$("mgS").value),
      mp: parseFloat(mg$("mgM").value),
      lam: parseFloat(mg$("mgLam").value)
    };
  }

  function mgWindText(w) {
    if (Math.abs(w) < 0.05) return "calm";
    return (w > 0 ? "+" : "") + mgFmt(w, 1) + " m/s " + (w > 0 ? "tailwind" : "headwind");
  }

  /* ---------- build ---------- */
  function mgBuild() {
    var box = document.querySelector(".dossier .actions");
    if (!box || mg$("mgBtn")) return;

    var css = [
      ".mg-overlay{position:fixed;inset:0;z-index:9999;background:rgba(4,8,8,.92);display:none;align-items:center;justify-content:center;padding:16px;}",
      ".mg-overlay.open{display:flex;}",
      ".mg-panel{width:min(900px,100%);max-height:94vh;overflow-y:auto;background:#0a1416;border:1px solid var(--acid);padding:16px;}",
      ".mg-panel h3{margin:0 0 4px;font-family:'Chakra Petch',sans-serif;text-transform:uppercase;letter-spacing:.02em;}",
      ".mg-sub{font-size:11px;color:#7c8d89;margin:0 0 12px;text-transform:uppercase;letter-spacing:.1em;line-height:1.7;}",
      ".mg-sliders{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:10px;}",
      ".mg-ctl{border:1px solid var(--line);background:var(--panel-2);padding:10px 12px;}",
      ".mg-ctl h6{margin:0 0 6px;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--cyan);font-weight:600;}",
      ".mg-ctl .val{font-family:monospace;font-size:13px;color:var(--ink);margin-bottom:6px;}",
      ".mg-ctl input[type=range]{width:100%;min-height:44px;accent-color:var(--acid);}",
      ".mg-pred{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-bottom:10px;}",
      ".mg-pred .t{border:1px solid var(--line);padding:6px 10px;background:var(--panel-2);}",
      ".mg-pred .t h6{margin:0 0 2px;font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:#7c8d89;font-weight:600;}",
      ".mg-pred .t p{margin:0;font-family:monospace;font-size:13px;color:var(--ink);}",
      ".mg-pred .t p.warn{color:var(--orange);}",
      ".mg-pred .t p.bad{color:#ff8ba0;}",
      ".mg-pred .t p.good{color:var(--acid);}",
      ".mg-trials{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:10px;}",
      ".mg-trial{border:1px solid var(--line);padding:10px;background:var(--panel-2);display:flex;flex-direction:column;gap:8px;min-width:0;}",
      ".mg-trial h5{margin:0;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--cyan);}",
      ".mg-trial p{margin:0;font-size:11px;color:var(--ink);line-height:1.6;flex:1;}",
      ".mg-trial .badge{font-family:monospace;font-size:11px;padding:4px 8px;border:1px solid var(--line);color:#72827f;text-align:center;}",
      ".mg-trial .badge.pass{border-color:var(--acid);color:var(--acid);}",
      ".mg-trial .badge.fail{border-color:#ff4668;color:#ff8ba0;}",
      ".mg-trial button{min-height:46px;padding:10px 6px;font-family:'Chakra Petch',sans-serif;font-weight:700;font-size:11px;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;background:#0a1416;border:1px solid var(--orange);color:var(--orange);}",
      ".mg-trial button:disabled{opacity:.35;cursor:default;}",
      ".mg-stage{border:1px solid var(--line);background:#060b0c;margin-bottom:10px;position:relative;}",
      ".mg-stage canvas{display:block;width:100%;height:270px;}",
      ".mg-tel{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin-bottom:10px;}",
      ".mg-tel .t{border:1px solid var(--line);padding:6px 10px;background:var(--panel-2);}",
      ".mg-tel .t h6{margin:0 0 2px;font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:#7c8d89;font-weight:600;}",
      ".mg-tel .t p{margin:0;font-family:monospace;font-size:13px;color:var(--ink);}",
      ".mg-result{padding:10px 12px;font-size:13px;font-family:monospace;border:1px solid var(--line);min-height:20px;line-height:1.6;margin-bottom:10px;}",
      ".mg-result.win{border-color:var(--acid);color:var(--acid);}",
      ".mg-result.fail{border-color:#ff4668;color:#ff8ba0;}",
      ".mg-foot{display:flex;gap:8px;flex-wrap:wrap;}",
      ".mg-foot .secondary{flex:1;min-height:44px;}",
      "@media (max-width:640px){.mg-sliders{grid-template-columns:1fr;}.mg-trials{grid-template-columns:1fr;}.mg-pred{grid-template-columns:repeat(2,minmax(0,1fr));}.mg-tel{grid-template-columns:repeat(2,minmax(0,1fr));}}"
    ].join("\n");
    var st = document.createElement("style");
    st.textContent = css;
    document.head.appendChild(st);

    var b = mgEl("button", "secondary", "Open the Mangonel Range");
    b.id = "mgBtn";
    b.addEventListener("click", function () {
      mg$("mgOverlay").classList.add("open");
      mgRollWind();
      mgSizeCanvas();
      mgRefresh();
      mgDrawIdle();
    });
    box.appendChild(b);

    var trialsHtml = MG_TRIALS.map(function (tr, i) {
      return '<div class="mg-trial"><h5>' + tr.name + '</h5><p>' + tr.desc + '</p>' +
        '<div class="badge" id="mgBadge' + i + '">not run</div>' +
        '<button id="mgRun' + i + '">Loose</button></div>';
    }).join("");

    var ov = mgEl("div", "mg-overlay");
    ov.id = "mgOverlay";
    ov.innerHTML =
      '<div class="mg-panel" role="dialog" aria-label="The Mangonel Range torsion siege engine bench">' +
      "<h3>The Mangonel Range</h3>" +
      '<p class="mg-sub">A rope-skein stone thrower on the range. Twist the skein, rig the arm, set the release pin, and loose. Trial 1 is dead calm; trials 2 and 3 read the flag, because the wind is always personal.</p>' +
      '<div class="mg-sliders">' +
      '<div class="mg-ctl"><h6>Skein preload</h6><div class="val" id="mgNVal"></div>' +
      '<input type="range" id="mgN" min="5" max="30" step="1" value="24" aria-label="Skein preload in turns"></div>' +
      '<div class="mg-ctl"><h6>Arm length</h6><div class="val" id="mgLVal"></div>' +
      '<input type="range" id="mgL" min="2" max="5" step="0.25" value="4.5" aria-label="Arm length in meters"></div>' +
      '<div class="mg-ctl"><h6>Sling length</h6><div class="val" id="mgSVal"></div>' +
      '<input type="range" id="mgS" min="0.5" max="2.5" step="0.25" value="2" aria-label="Sling length in meters"></div>' +
      '<div class="mg-ctl"><h6>Stone mass</h6><div class="val" id="mgMVal"></div>' +
      '<input type="range" id="mgM" min="2" max="20" step="1" value="3" aria-label="Stone mass in kilograms"></div>' +
      '<div class="mg-ctl"><h6>Release pin</h6><div class="val" id="mgLamVal"></div>' +
      '<input type="range" id="mgLam" min="20" max="60" step="1" value="45" aria-label="Release pin angle in degrees"></div>' +
      '<div class="mg-ctl"><h6>Flag wind (next shot)</h6><div class="val" id="mgWindVal">calm</div>' +
      '<div class="val" style="color:#7c8d89;font-size:11px;">Trial 1 always flies in calm air.</div></div>' +
      "</div>" +
      '<div class="mg-pred">' +
      '<div class="t"><h6>Release velocity</h6><p id="mgPredV">--</p></div>' +
      '<div class="t"><h6>Predicted range</h6><p id="mgPredR">--</p></div>' +
      '<div class="t"><h6>Frame load</h6><p id="mgLoad">--</p></div>' +
      '<div class="t"><h6>Range warning</h6><p id="mgWarn">--</p></div>' +
      "</div>" +
      '<div class="mg-trials">' + trialsHtml + "</div>" +
      '<div class="mg-stage"><canvas id="mgCanvas"></canvas></div>' +
      '<div class="mg-tel">' +
      '<div class="t"><h6>Release vel.</h6><p id="mgTelV">--</p></div>' +
      '<div class="t"><h6>Launch angle</h6><p id="mgTelLam">--</p></div>' +
      '<div class="t"><h6>Range</h6><p id="mgTelR">--</p></div>' +
      '<div class="t"><h6>Miss vs 80 m</h6><p id="mgTelMiss">--</p></div>' +
      '<div class="t"><h6>Wind</h6><p id="mgTelWind">--</p></div>' +
      "</div>" +
      '<div class="mg-result" id="mgResult">Rig the machine and loose a trial. The range is patient; the stake is not.</div>' +
      '<div class="mg-foot">' +
      '<button class="secondary" id="mgCertBtn" disabled>Download range certificate</button>' +
      '<button class="secondary" id="mgClose">Close the range</button>' +
      "</div>" +
      "</div>";
    document.body.appendChild(ov);

    ["mgN", "mgL", "mgS", "mgM", "mgLam"].forEach(function (id) {
      mg$(id).addEventListener("input", mgRefresh);
    });
    mg$("mgRun0").addEventListener("click", function () { mgFire(0); });
    mg$("mgRun1").addEventListener("click", function () { mgFire(1); });
    mg$("mgRun2").addEventListener("click", function () { mgFire(2); });
    mg$("mgClose").addEventListener("click", function () {
      mgStopAnim();
      mg$("mgOverlay").classList.remove("open");
    });
    mg$("mgCertBtn").addEventListener("click", mgCert);
    window.addEventListener("resize", mgSizeCanvas);
    mg.built = true;
  }

  /* ---------- prediction / readouts ---------- */
  function mgRefresh() {
    var p = mgParams();
    mg$("mgNVal").textContent = p.N + " turns";
    mg$("mgLVal").textContent = mgFmt(p.L, 2) + " m";
    mg$("mgSVal").textContent = mgFmt(p.S, 2) + " m";
    mg$("mgMVal").textContent = mgFmt(p.mp, 0) + " kg";
    mg$("mgLamVal").textContent = mgFmt(p.lam, 0) + " deg";
    mg$("mgWindVal").textContent = mgWindText(mg.nextWind);

    var shot = mgSim(p.N, p.L, p.S, p.mp, p.lam, mg.nextWind);
    var vEl = mg$("mgPredV"), rEl = mg$("mgPredR"),
        lEl = mg$("mgLoad"), wEl = mg$("mgWarn");
    if (shot.fail) {
      vEl.textContent = "--"; rEl.textContent = "--";
      lEl.textContent = Math.round(mgFrameLoad(p.N, p.L) * 100) + " %";
      lEl.className = mgFrameLoad(p.N, p.L) > 1 ? "bad" : "";
      wEl.textContent = MG_FAIL_MSG[shot.fail];
      wEl.className = "bad";
    } else {
      vEl.textContent = mgFmt(shot.v0, 1) + " m/s";
      rEl.textContent = mgFmt(shot.range, 1) + " m";
      var load = mgFrameLoad(p.N, p.L);
      lEl.textContent = Math.round(load * 100) + " %";
      lEl.className = load > 0.85 ? "warn" : "good";
      wEl.textContent = p.S > 0.5 * p.L
        ? "Sling is getting long for this arm."
        : (load > 0.85 ? "Frame is near its shear limit." : "Rig looks sound.");
      wEl.className = (p.S > 0.5 * p.L || load > 0.85) ? "warn" : "good";
    }
    mg.view.xMax = Math.max(110, (shot.fail ? 110 : shot.range) * 1.15);
    if (!mg.animating) mgDrawIdle();
  }

  /* ---------- canvas ---------- */
  var mgCtx = null, mgW = 0, mgH = 0, mgDpr = 1;

  function mgSizeCanvas() {
    var c = mg$("mgCanvas");
    if (!c) return;
    mgDpr = window.devicePixelRatio || 1;
    mgW = c.clientWidth; mgH = c.clientHeight;
    c.width = Math.max(1, Math.round(mgW * mgDpr));
    c.height = Math.max(1, Math.round(mgH * mgDpr));
    mgCtx = c.getContext("2d");
    if (!mg.animating) mgDrawIdle();
  }

  function mgScale() {
    var x0 = 56, x1 = mgW - 18;
    return { x0: x0, s: (x1 - x0) / mg.view.xMax, gy: mgH - 30 };
  }

  function mgDrawMachine(ctx, sc, theta, slingLag) {
    var px = sc.x0, py = sc.gy - MG_PIVOT_H * sc.s;
    var m = sc.s; /* px per meter */
    ctx.strokeStyle = "#8a6f4d"; ctx.lineWidth = 5; ctx.lineCap = "round";
    /* A-frame legs */
    ctx.beginPath();
    ctx.moveTo(px - 0.9 * m, sc.gy); ctx.lineTo(px, py);
    ctx.moveTo(px + 0.9 * m, sc.gy); ctx.lineTo(px, py);
    ctx.stroke();
    /* base rail */
    ctx.strokeStyle = "#5d4c36"; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(px - 1.4 * m, sc.gy); ctx.lineTo(px + 1.4 * m, sc.gy); ctx.stroke();
    /* skein bundle */
    ctx.fillStyle = "#a8875a";
    ctx.beginPath(); ctx.arc(px, sc.gy - 0.35 * m, 0.28 * m, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#6b5638"; ctx.lineWidth = 2;
    for (var i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(px - 0.28 * m, sc.gy - 0.35 * m + i * 0.1 * m);
      ctx.lineTo(px + 0.28 * m, sc.gy - 0.35 * m + i * 0.1 * m);
      ctx.stroke();
    }
    /* arm */
    var p = mgParams();
    var ax = px + Math.cos(theta) * p.L * m, ay = py - Math.sin(theta) * p.L * m;
    ctx.strokeStyle = "#c9a86a"; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(ax, ay); ctx.stroke();
    /* pivot */
    ctx.fillStyle = "#e8e4da";
    ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.fill();
    /* crossbar stop */
    var sx = px + Math.cos(MG_THETA_STOP) * (p.L + 0.4) * m,
        sy = py - Math.sin(MG_THETA_STOP) * (p.L + 0.4) * m;
    ctx.strokeStyle = "#ff6b4a"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(sx - 6, sy - 6); ctx.lineTo(sx + 6, sy + 6); ctx.stroke();
    /* sling + stone while cocked/swinging */
    var sa = theta - slingLag;
    var ex = ax + Math.cos(sa) * p.S * m, ey = ay - Math.sin(sa) * p.S * m;
    ctx.strokeStyle = "#d8cfb8"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.fillStyle = "#b9b2a0";
    ctx.beginPath(); ctx.arc(ex, ey, 6, 0, Math.PI * 2); ctx.fill();
  }

  function mgDrawScene(ctx, sc, wind) {
    var i, x, lx;
    /* ground */
    ctx.strokeStyle = "#2c3a38"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, sc.gy); ctx.lineTo(mgW, sc.gy); ctx.stroke();
    /* distance markers */
    ctx.fillStyle = "#5f726e"; ctx.font = "10px monospace"; ctx.textAlign = "center";
    for (i = 20; i <= mg.view.xMax; i += 20) {
      x = sc.x0 + i * sc.s;
      ctx.strokeStyle = "#22302e"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, sc.gy); ctx.lineTo(x, sc.gy - 8); ctx.stroke();
      ctx.fillText(i + " m", x, sc.gy + 14);
    }
    /* target stake at 80 m */
    x = sc.x0 + MG_TARGET * sc.s;
    ctx.strokeStyle = "#7c8d89"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x, sc.gy); ctx.lineTo(x, sc.gy - 26); ctx.stroke();
    ctx.fillStyle = "#ff6b4a";
    ctx.beginPath(); ctx.arc(x, sc.gy - 30, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#ff6b4a"; ctx.font = "10px monospace";
    ctx.fillText("80 m stake", x, sc.gy - 40);
    /* 5 m gate band */
    ctx.fillStyle = "rgba(255,107,74,.10)";
    ctx.fillRect(sc.x0 + (MG_TARGET - 5) * sc.s, sc.gy - 4, 10 * sc.s, 4);
    /* wind flag behind the machine */
    var fx = sc.x0 - 3.2 * sc.s, fy = sc.gy - 2.6 * sc.s;
    if (fx > 8) {
      ctx.strokeStyle = "#7c8d89"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(fx, sc.gy); ctx.lineTo(fx, fy); ctx.stroke();
      var fl = Math.min(34, 6 + Math.abs(wind) * 3.2);
      var dir = wind >= 0 ? 1 : -1;
      ctx.fillStyle = Math.abs(wind) < 0.05 ? "#3a4a47" : "#ffd166";
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(fx + dir * fl, fy + 6);
      ctx.lineTo(fx, fy + 12);
      ctx.closePath(); ctx.fill();
    }
    /* landed stones */
    for (i = 0; i < mg.view.landed.length; i++) {
      lx = sc.x0 + mg.view.landed[i] * sc.s;
      ctx.fillStyle = "rgba(185,178,160,.85)";
      ctx.beginPath(); ctx.ellipse(lx, sc.gy - 2, 7, 3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#ff8ba0"; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(lx - 5, sc.gy - 14); ctx.lineTo(lx + 5, sc.gy - 6);
      ctx.moveTo(lx + 5, sc.gy - 14); ctx.lineTo(lx - 5, sc.gy - 6);
      ctx.stroke();
    }
  }

  function mgDrawIdle() {
    if (!mgCtx) return;
    var ctx = mgCtx;
    ctx.setTransform(mgDpr, 0, 0, mgDpr, 0, 0);
    ctx.clearRect(0, 0, mgW, mgH);
    var sc = mgScale();
    mgDrawScene(ctx, sc, mg.nextWind);
    mgDrawMachine(ctx, sc, MG_THETA0, 0.9);
  }

  /* ---------- firing + animation ---------- */
  function mgStopAnim() {
    mg.animating = false;
    if (mg.raf) { cancelAnimationFrame(mg.raf); mg.raf = 0; }
  }

  function mgSetRunning(on) {
    mg.animating = on;
    for (var i = 0; i < 3; i++) mg$("mgRun" + i).disabled = on;
  }

  function mgFire(trial) {
    if (mg.animating) return;
    var p = mgParams();
    var shots, winds;
    if (trial === 0) {
      shots = [mgSim(p.N, p.L, p.S, p.mp, p.lam, 0)];
      winds = [0];
    } else if (trial === 1) {
      shots = [mgSim(p.N, p.L, p.S, p.mp, p.lam, mg.nextWind)];
      winds = [mg.nextWind];
      mgRollWind();
    } else {
      winds = [mgRollWind0(), mgRollWind0(), mgRollWind0()];
      shots = winds.map(function (w) { return mgSim(p.N, p.L, p.S, p.mp, p.lam, w); });
      mgRollWind();
    }
    mg.lastShots = shots;
    var broken = shots.some(function (s) { return s.fail; });
    mgSetRunning(true);
    mg$("mgResult").className = "mg-result";
    mg$("mgResult").textContent = broken
      ? "The crew steps back. Something is about to give."
      : "Loose!";
    mgRefresh();
    mgAnimate(trial, shots, winds, broken);
  }

  function mgRollWind0() { return Math.round((Math.random() * 16 - 8) * 10) / 10; }

  function mgAnimate(trial, shots, winds, broken) {
    var ctx = mgCtx, sc = mgScale();
    var okShots = shots.filter(function (s) { return !s.fail; });
    var maxR = 0;
    okShots.forEach(function (s) { if (s.range > maxR) maxR = s.range; });
    mg.view.xMax = Math.max(110, maxR * 1.18, MG_TARGET * 1.25);
    mg.view.landed = [];
    mg.view.flights = okShots.map(function (s, i) {
      return {
        shot: s, delay: broken ? 0 : i * 0.7,
        t: 0, done: false,
        x: s.x0, y: s.y0,
        vx: s.v0 * Math.cos(s.lamDeg * Math.PI / 180),
        vy: s.v0 * Math.sin(s.lamDeg * Math.PI / 180),
        trail: []
      };
    });

    var swingT = 0, SWING_DUR = 0.7, last = performance.now();

    function frame(now) {
      if (!mg.animating) return;
      var dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      ctx.setTransform(mgDpr, 0, 0, mgDpr, 0, 0);
      ctx.clearRect(0, 0, mgW, mgH);
      sc = mgScale();
      mgDrawScene(ctx, sc, winds[0]);

      if (broken) {
        /* the machine fails at the crossbar: shake, then report */
        swingT += dt;
        var th = MG_THETA0 + (MG_THETA_STOP - MG_THETA0) * Math.min(1, swingT / SWING_DUR);
        var jx = (Math.random() - 0.5) * 6 * Math.min(1, swingT * 3);
        ctx.save();
        ctx.translate(jx, 0);
        mgDrawMachine(ctx, sc, th, 0.35);
        ctx.restore();
        if (swingT > 1.1) { mgFinish(trial, shots, winds); return; }
        mg.raf = requestAnimationFrame(frame);
        return;
      }

      /* swing phase, then staggered flights */
      if (swingT < SWING_DUR) {
        swingT += dt;
        var k2 = Math.min(1, swingT / SWING_DUR);
        var e2 = 1 - Math.pow(1 - k2, 3);
        mgDrawMachine(ctx, sc, MG_THETA0 + (MG_THETA_STOP - MG_THETA0) * e2, 0.9 - 0.55 * e2);
      } else {
        mgDrawMachine(ctx, sc, MG_THETA_STOP, 0.35);
        var allDone = true;
        mg.view.flights.forEach(function (f) {
          if (f.delay > 0) { f.delay -= dt; allDone = false; return; }
          if (!f.done) {
            allDone = false;
            var sub = dt, h = 1 / 240;
            while (sub > 0 && !f.done) {
              var st = Math.min(h, sub);
              var rvx = f.vx - f.shot.wind, rvy = f.vy;
              var sp = Math.sqrt(rvx * rvx + rvy * rvy);
              f.vx -= f.shot.k * sp * rvx * st;
              f.vy -= (MG_G + f.shot.k * sp * rvy) * st;
              f.x += f.vx * st; f.y += f.vy * st; f.t += st; sub -= st;
              if (f.y <= 0) { f.done = true; f.x = f.shot.range; f.y = 0; }
            }
            f.trail.push([f.x, f.y]);
            if (f.trail.length > 400) f.trail.shift();
          }
        });
        /* draw trails + stones */
        mg.view.flights.forEach(function (f, fi) {
          if (f.delay > 0 || f.trail.length < 2) return;
          var cols = ["#ffd166", "#7ce8c4", "#ff8ba0"];
          ctx.strokeStyle = cols[fi % 3];
          ctx.lineWidth = 2;
          ctx.globalAlpha = 0.85;
          ctx.beginPath();
          for (var i = 0; i < f.trail.length; i++) {
            var tx = sc.x0 + f.trail[i][0] * sc.s,
                ty = sc.gy - f.trail[i][1] * sc.s;
            if (i === 0) ctx.moveTo(tx, ty); else ctx.lineTo(tx, ty);
          }
          ctx.stroke();
          ctx.globalAlpha = 1;
          if (!f.done) {
            ctx.fillStyle = "#e8e4da";
            ctx.beginPath();
            ctx.arc(sc.x0 + f.x * sc.s, sc.gy - f.y * sc.s, 5, 0, Math.PI * 2);
            ctx.fill();
          }
        });
        if (allDone && mg.view.flights.length) {
          mg.view.flights.forEach(function (f) {
            if (mg.view.landed.indexOf(f.shot.range) < 0) mg.view.landed.push(f.shot.range);
          });
          mgDrawScene(ctx, sc, winds[0]);
          mgFinish(trial, shots, winds);
          return;
        }
      }
      mg.raf = requestAnimationFrame(frame);
    }
    mg.raf = requestAnimationFrame(frame);
  }

  /* ---------- judging + telemetry ---------- */
  function mgSetBadge(i, pass) {
    var b = mg$("mgBadge" + i);
    b.textContent = pass ? "passed" : "failed";
    b.className = "badge " + (pass ? "pass" : "fail");
    mg.badges[i] = pass;
    if (mg.badges[0] && mg.badges[1] && mg.badges[2]) {
      mg$("mgCertBtn").disabled = false;
      mgToast("All three trials passed. The range will sign your certificate.");
    }
  }

  function mgCfgText(p) {
    return p.N + " turns, arm " + mgFmt(p.L, 2) + " m, sling " + mgFmt(p.S, 2) +
      " m, stone " + mgFmt(p.mp, 0) + " kg, pin " + mgFmt(p.lam, 0) + " deg";
  }

  function mgFinish(trial, shots, winds) {
    mgSetRunning(false);
    mgStopAnim();
    var p = mgParams();
    var res = mg$("mgResult");
    var tel = function (s, w) {
      mg$("mgTelV").textContent = s.fail ? "--" : mgFmt(s.v0, 1) + " m/s";
      mg$("mgTelLam").textContent = s.fail ? "--" : mgFmt(s.lamDeg, 0) + " deg";
      mg$("mgTelR").textContent = s.fail ? "--" : mgFmt(s.range, 1) + " m";
      mg$("mgTelMiss").textContent = s.fail ? "--" :
        (s.range >= MG_TARGET ? "+" : "") + mgFmt(s.range - MG_TARGET, 1) + " m";
      mg$("mgTelWind").textContent = mgWindText(w);
    };

    if (shots[0].fail) {
      tel(shots[0], winds[0]);
      res.className = "mg-result fail";
      res.textContent = MG_FAIL_MSG[shots[0].fail];
      mgSetBadge(trial, false);
      mgToast("The machine failed. Read the range warning and re-rig.");
      mgRefresh();
      return;
    }

    if (trial === 0) {
      var s = shots[0];
      tel(s, 0);
      if (s.range > mg.best) mg.best = s.range;
      var pass = MG_TRIALS[0].judge(s);
      res.className = "mg-result " + (pass ? "win" : "fail");
      res.textContent = pass
        ? mgFmt(s.range, 1) + " m. The far field is yours."
        : mgFmt(s.range, 1) + " m. Short of the 120 m mark: more preload, a longer arm, or a lighter stone.";
      mgSetBadge(0, pass);
      if (pass) mg.wins.push({ t: 0, cfg: mgCfgText(p), range: s.range });
    } else if (trial === 1) {
      var s1 = shots[0];
      tel(s1, winds[0]);
      if (s1.range > mg.best) mg.best = s1.range;
      var miss = s1.range - MG_TARGET;
      var pass1 = MG_TRIALS[1].judge(s1);
      res.className = "mg-result " + (pass1 ? "win" : "fail");
      res.textContent = pass1
        ? mgFmt(s1.range, 1) + " m (" + (miss >= 0 ? "+" : "") + mgFmt(miss, 1) +
          " m). Gate hit. The flag read " + mgWindText(winds[0]) + " and you read the flag."
        : mgFmt(s1.range, 1) + " m (" + (miss >= 0 ? "+" : "") + mgFmt(miss, 1) +
          " m). Outside the 5 m gate. Fresh wind on the flag: " + mgWindText(mg.nextWind) + ". Compensate and loose again.";
      mgSetBadge(1, pass1);
      if (pass1) mg.wins.push({ t: 1, cfg: mgCfgText(p), range: s1.range, wind: winds[0] });
    } else {
      var worst = 0, detail = [];
      shots.forEach(function (s, i) {
        var m = Math.abs(s.range - MG_TARGET);
        if (m > worst) worst = m;
        if (s.range > mg.best) mg.best = s.range;
        detail.push("stone " + (i + 1) + ": " + mgFmt(s.range, 1) + " m (" +
          (s.range >= MG_TARGET ? "+" : "") + mgFmt(s.range - MG_TARGET, 1) + " m, wind " +
          mgWindText(winds[i]) + ")");
      });
      tel(shots[shots.length - 1], winds[winds.length - 1]);
      var pass2 = MG_TRIALS[2].judge(shots);
      res.className = "mg-result " + (pass2 ? "win" : "fail");
      res.textContent = (pass2
        ? "Siege train complete. Worst stone " + mgFmt(worst, 1) + " m off the stake. "
        : "Siege train broken. Worst stone " + mgFmt(worst, 1) + " m off the stake (limit 8 m). ") +
        detail.join(" ");
      mgSetBadge(2, pass2);
      if (pass2) mg.wins.push({ t: 2, cfg: mgCfgText(p), range: worst, wind: winds.join("/") });
    }
    mgToast("Shot recorded.");
    mgRefresh();
  }

  /* ---------- certificate ---------- */
  function mgCert() {
    var lines = mg.wins.map(function (w) {
      return MG_TRIALS[w.t].name + ": " + w.cfg +
        (w.wind != null ? ", wind " + w.wind : "") +
        (w.t === 2 ? ", worst miss " + mgFmt(w.range, 1) + " m" : ", range " + mgFmt(w.range, 1) + " m");
    });
    var txt =
      "RANGE CERTIFICATE\n" +
      "Garage Inventions Mangonel Range\n" +
      "================================\n" +
      "Date      : " + new Date().toISOString().slice(0, 10) + "\n" +
      "Machine   : rope-skein mangonel, quadratic-drag flight model\n" +
      "Result    : ALL THREE RANGE TRIALS PASSED\n" +
      "Best throw: " + mgFmt(mg.best, 1) + " m\n" +
      "Winning rigs:\n" + lines.join("\n") + "\n" +
      "\n120 m in calm air, the 80 m stake inside 5 m against the wind,\n" +
      "and a three-stone volley inside 8 m with no broken machinery.\n" +
      "\nSigned by the stake. Gravity did the paperwork.\n";
    var blob = new Blob([txt], { type: "text/plain" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "range-certificate.txt";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    mgToast("Range certificate downloaded");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mgBuild);
  } else {
    mgBuild();
  }

})();
/* ============================================================
   THE LATHE ROOM
   A machinist's bench: turn 25 mm bar stock to blueprint on a
   manual engine lathe. Cross-slide, spindle RPM, feed, and cut
   range are real controls; springback, chatter, feed marks, and
   insert snaps are a real (if simplified) cutting model.
   Trial 1 is a plain pin; trials 2 and 3 are stepped shafts with
   tighter tolerance. Cut under size and the part is scrap,
   because metal does not grow back.
   Self-contained IIFE, local helpers only, no page globals.
   ============================================================ */
(function () {
  "use strict";

  /* ---------- tiny local helpers (no reliance on page globals) ---------- */
  function lt$(id) { return document.getElementById(id); }
  function ltEl(tag, cls, html) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (html != null) d.innerHTML = html;
    return d;
  }
  function ltToast(msg) {
    if (typeof window.showToast === "function") { window.showToast(msg); return; }
    var t = lt$("toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(function () { t.classList.remove("show"); }, 1800);
  }
  function ltFmt(n, d) { return Number(n).toFixed(d == null ? 2 : d); }

  /* ---------- cutting model (pure logic, no DOM) ---------- */
  var LT_LEN = 100, LT_N = 50, LT_STOCK = 25.0;
  var LT_ZC = [];
  (function () { for (var i = 0; i < LT_N; i++) LT_ZC.push((i + 0.5) * (LT_LEN / LT_N)); })();

  var LT_TRIALS = [
    { name: "Trial 1: The Pin",
      desc: "One diameter, full length: 20.00 mm, tolerance plus or minus 0.05. Rough it down in steps, then sneak up with light finish passes.",
      tol: 0.05, steps: [[0, 100, 20.00]] },
    { name: "Trial 2: The Shoulder",
      desc: "A stepped shaft: 22.00 mm for the first 40 mm, 18.00 mm for the rest, plus or minus 0.05. Set the cut range to work one step at a time.",
      tol: 0.05, steps: [[0, 40, 22.00], [40, 100, 18.00]] },
    { name: "Trial 3: The Fit",
      desc: "Three steps at 24.00, 20.00, and 16.00 mm, tolerance plus or minus 0.03. Finish passes only, slow feed, no heroics.",
      tol: 0.03, steps: [[0, 30, 24.00], [30, 70, 20.00], [70, 100, 16.00]] }
  ];
  var LT_SHORT = ["The Pin", "The Shoulder", "The Fit"];

  function ltTarget(ti, z) {
    var steps = LT_TRIALS[ti].steps;
    for (var s = 0; s < steps.length; s++) {
      if (z < steps[s][1]) return steps[s][2];
    }
    return steps[steps.length - 1][2];
  }

  /* Cut one station. Returns "snap", "cut", or "none". rand() in [0,1). */
  function ltCutStation(dia, i, xdia, rpm, feed, rand) {
    var d = dia[i] - xdia;
    if (d <= 0.0005) return "none";
    if (d > 2.0 + 1e-9) return "snap"; /* epsilon: a displayed 2.00 mm cut must not snap */
    var nd = xdia + 0.15 * d; /* springback: the bar pushes off the tool */
    if (d > 0.8 && rpm < 600) nd += (rand() * 0.10 - 0.05); /* chatter wander */
    if (d <= 0.35 && feed > 0.15) nd += (rand() * 0.04 - 0.02); /* feed witness lines */
    if (nd > dia[i]) nd = dia[i];
    dia[i] = nd;
    return "cut";
  }

  function ltFreshStock() {
    var a = [];
    for (var i = 0; i < LT_N; i++) a.push(LT_STOCK);
    return a;
  }

  function ltGrade(ti, dia) {
    var tol = LT_TRIALS[ti].tol, worst = 0, worstZ = 0, over = 0, scrap = null;
    for (var i = 0; i < LT_N; i++) {
      var dev = dia[i] - ltTarget(ti, LT_ZC[i]);
      if (Math.abs(dev) > Math.abs(worst)) { worst = dev; worstZ = LT_ZC[i]; }
      if (dev < -tol && !scrap) scrap = { z: LT_ZC[i], dev: dev, act: dia[i] };
      if (dev > tol) over++;
    }
    return { scrap: scrap, over: over, worst: worst, worstZ: worstZ, pass: !scrap && over === 0 };
  }

  /* ---------- state ---------- */
  var lt = { trial: 0, animating: false, raf: 0, carriage: null, chips: [], trials: [], wins: [] };
  (function () {
    for (var t = 0; t < LT_TRIALS.length; t++) {
      lt.trials.push({ dia: ltFreshStock(), passes: 0, badge: null, measured: null });
    }
  })();

  function ltParams() {
    var z0 = parseFloat(lt$("ltZ0").value), z1 = parseFloat(lt$("ltZ1").value);
    if (z0 > z1) { var t = z0; z0 = z1; z1 = t; }
    return {
      xdia: parseFloat(lt$("ltX").value),
      rpm: parseFloat(lt$("ltRpm").value),
      feed: parseFloat(lt$("ltFeed").value),
      z0: z0, z1: z1
    };
  }

  /* ---------- canvas ---------- */
  function ltChip(z, xdia) {
    for (var k = 0; k < 3; k++) {
      lt.chips.push({
        z: z, y: xdia / 2,
        vz: (Math.random() * 14 - 11), vy: -(Math.random() * 5 + 2),
        life: 26 + Math.random() * 14
      });
    }
    if (lt.chips.length > 220) lt.chips.splice(0, lt.chips.length - 220);
  }

  function ltDraw() {
    var cv = lt$("ltCanvas");
    if (!cv || !cv.getContext) return;
    var ctx = cv.getContext("2d");
    var W = cv.width, H = cv.height;
    var ti = lt.trial, st = lt.trials[ti], tol = LT_TRIALS[ti].tol;
    var p = { xdia: 23, z0: 0, z1: 100 };
    try { p = ltParams(); } catch (e) { /* elements not built yet */ }
    var x0 = 64, x1 = W - 24, ym = H / 2, S = 10;
    function X(z) { return x0 + (z / LT_LEN) * (x1 - x0); }

    ctx.fillStyle = "#060b0c";
    ctx.fillRect(0, 0, W, H);

    /* machine bed */
    ctx.fillStyle = "#0c1312";
    ctx.fillRect(0, ym + 13.4 * S, W, H - (ym + 13.4 * S));

    /* Z ruler */
    ctx.fillStyle = "#5b6d69";
    ctx.font = "10px monospace";
    ctx.textAlign = "center";
    for (var rz = 0; rz <= 100; rz += 20) {
      ctx.fillRect(X(rz) - 0.5, H - 26, 1, 8);
      ctx.fillText(rz + "", X(rz), H - 12);
    }
    ctx.textAlign = "left";
    ctx.fillText("Z mm", x0, H - 30);

    /* chuck */
    ctx.fillStyle = "#1b2624";
    ctx.fillRect(10, ym - 62, x0 - 18, 124);
    ctx.strokeStyle = "#2a3b37";
    ctx.strokeRect(10.5, ym - 61.5, x0 - 19, 123);
    ctx.fillStyle = "#5b6d69";
    ctx.fillText("CHUCK", 14, ym - 66);

    /* target profile, dashed acid */
    ctx.save();
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = "rgba(199,255,56,.75)";
    ctx.lineWidth = 1;
    var steps = LT_TRIALS[ti].steps;
    for (var s = 0; s < steps.length; s++) {
      var yt = ym - (steps[s][2] / 2) * S, yb = ym + (steps[s][2] / 2) * S;
      ctx.beginPath(); ctx.moveTo(X(steps[s][0]), yt); ctx.lineTo(X(steps[s][1]), yt); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(X(steps[s][0]), yb); ctx.lineTo(X(steps[s][1]), yb); ctx.stroke();
    }
    ctx.restore();

    /* the bar, station by station, tinted by tolerance state */
    var sw = (x1 - x0) / LT_N;
    for (var i = 0; i < LT_N; i++) {
      var dia = st.dia[i], dev = dia - ltTarget(ti, LT_ZC[i]);
      var top = ym - (dia / 2) * S, h = dia * S, lx = X(LT_ZC[i]) - sw / 2;
      ctx.fillStyle = "#46564f";
      ctx.fillRect(lx, top, Math.max(1, sw - 0.6), h);
      if (dev < -tol) ctx.fillStyle = "rgba(255,70,104,.6)";
      else if (dev > tol) ctx.fillStyle = "rgba(255,107,44,.5)";
      else ctx.fillStyle = "rgba(199,255,56,.38)";
      ctx.fillRect(lx, top, Math.max(1, sw - 0.6), h);
    }

    /* center line */
    ctx.strokeStyle = "rgba(90,110,106,.5)";
    ctx.beginPath(); ctx.moveTo(x0, ym); ctx.lineTo(x1, ym); ctx.stroke();

    /* cross-slide setting across the cut range */
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = "rgba(255,107,44,.9)";
    var xy = ym - (p.xdia / 2) * S;
    ctx.beginPath(); ctx.moveTo(X(p.z0), xy); ctx.lineTo(X(p.z1), xy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(X(p.z0), 2 * ym - xy); ctx.lineTo(X(p.z1), 2 * ym - xy); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = "#ff6b2c";
    ctx.fillText("XD " + ltFmt(p.xdia) + " mm", X(p.z1) + 4 > x1 - 90 ? x1 - 90 : X(p.z1) + 4, xy - 6);

    /* tool at the carriage */
    if (lt.carriage != null) {
      var tx = X(lt.carriage), ty = ym - (p.xdia / 2) * S;
      ctx.fillStyle = "#ff6b2c";
      ctx.beginPath();
      ctx.moveTo(tx, ty); ctx.lineTo(tx + 12, ty - 2); ctx.lineTo(tx + 12, ty - 12); ctx.lineTo(tx, ty - 10);
      ctx.closePath(); ctx.fill();
      ctx.fillRect(tx + 10, ty - 34, 7, 24);
    }

    /* chips */
    ctx.fillStyle = "#ffb02c";
    for (var c = 0; c < lt.chips.length; c++) {
      var ch = lt.chips[c];
      ctx.globalAlpha = Math.max(0, Math.min(1, ch.life / 30));
      ctx.fillRect(X(ch.z) - 1, ym - ch.y * S - 1, 2.5, 2.5);
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- readouts ---------- */
  function ltRefresh() {
    var p;
    try { p = ltParams(); } catch (e) { return; }
    lt$("ltXVal").textContent = ltFmt(p.xdia) + " mm";
    lt$("ltRpmVal").textContent = p.rpm + " rpm";
    lt$("ltFeedVal").textContent = ltFmt(p.feed) + " mm/rev";
    lt$("ltZ0Val").textContent = "Z " + p.z0 + " mm";
    lt$("ltZ1Val").textContent = "Z " + p.z1 + " mm";

    for (var t = 0; t < 3; t++) {
      var tab = lt$("ltTab" + t), bst = lt.trials[t].badge;
      tab.className = "lt-tab" + (t === lt.trial ? " active" : "") +
        (bst === "pass" ? " pass" : bst === "fail" ? " fail" : "");
      tab.innerHTML = LT_SHORT[t] + '<span class="lt-tab-badge">' +
        (bst ? bst.toUpperCase() : "NOT RUN") + "</span>";
    }

    var tr = LT_TRIALS[lt.trial];
    lt$("ltBlueprint").innerHTML =
      "<h6>Blueprint: " + tr.name + " (tolerance plus or minus " + ltFmt(tr.tol) + " mm)</h6>" +
      tr.steps.map(function (s) {
        return '<div class="lt-step"><span>Z ' + s[0] + " to " + s[1] + ' mm</span><b>' + ltFmt(s[2]) + " mm</b></div>";
      }).join("") +
      "<p>" + tr.desc + "</p>";

    var st = lt.trials[lt.trial], deep = 0, deepZ = 0;
    for (var i = 0; i < LT_N; i++) {
      if (LT_ZC[i] < p.z0 || LT_ZC[i] > p.z1) continue;
      var d = st.dia[i] - p.xdia;
      if (d > deep) { deep = d; deepZ = LT_ZC[i]; }
    }
    var ph;
    if (deep <= 0.0005) {
      ph = '<div class="t"><h6>Cut</h6><p class="dim">No cut: the cross-slide sits above the bar. Dial it in.</p></div>';
    } else {
      var warn;
      if (deep > 2.0) warn = '<div class="t"><h6>Insert</h6><p class="bad">WILL SNAP past the 2.00 mm limit. Back the cross-slide out.</p></div>';
      else if (deep > 0.8 && p.rpm < 600) warn = '<div class="t"><h6>Chatter</h6><p class="warn">Heavy cut under 600 rpm will chatter and wander. Raise RPM or lighten up.</p></div>';
      else if (deep <= 0.35 && p.feed > 0.15) warn = '<div class="t"><h6>Finish</h6><p class="warn">Fast feed on a finish pass leaves witness lines. Drop to 0.15 mm/rev or below.</p></div>';
      else warn = '<div class="t"><h6>Springback</h6><p class="good">Expect about ' + ltFmt(0.15 * deep) +
        " mm of springback. Finish passes under 0.35 mm sneak up on size.</p></div>";
      ph = '<div class="t"><h6>Deepest cut</h6><p>' + ltFmt(deep) + " mm at Z " + ltFmt(deepZ, 0) + " mm</p></div>" + warn;
    }
    lt$("ltPred").innerHTML = ph;

    var tel = '<div class="t"><h6>Passes</h6><p>' + st.passes + "</p></div>";
    if (st.measured) {
      tel += '<div class="t"><h6>Stations in tol</h6><p>' + st.measured.inTol + " / " + LT_N + "</p></div>";
      tel += '<div class="t"><h6>Worst deviation</h6><p>' + (st.measured.worst >= 0 ? "+" : "") +
        ltFmt(st.measured.worst) + " mm</p></div>";
    } else {
      tel += '<div class="t"><h6>Stations in tol</h6><p class="dim">measure first</p></div>' +
        '<div class="t"><h6>Worst deviation</h6><p class="dim">measure first</p></div>';
    }
    lt$("ltTel").innerHTML = tel;

    if (lt.trials.every(function (s) { return s.badge === "pass"; })) {
      lt$("ltCertBtn").style.display = "";
    }
    ltDraw();
  }

  /* ---------- actions ---------- */
  function ltTakePass() {
    if (lt.animating) { ltToast("Hold still: a pass is already running."); return; }
    var p = ltParams(), st = lt.trials[lt.trial];
    if (p.z1 - p.z0 < 1) { ltToast("Cut range is empty."); return; }
    var dur = Math.max(600, 1700 * ((p.z1 - p.z0) / 100) * (0.12 / p.feed));
    var t0 = null, cutDone = {};
    lt.animating = true;
    lt.carriage = p.z0;
    lt.chips = [];
    lt$("ltMeasWrap").style.display = "none";
    function frame(ts) {
      if (!t0) t0 = ts;
      var k = Math.min(1, (ts - t0) / dur);
      var z = p.z0 + (p.z1 - p.z0) * k;
      lt.carriage = z;
      for (var i = 0; i < LT_N; i++) {
        if (!cutDone[i] && LT_ZC[i] <= z && LT_ZC[i] >= p.z0 - 0.001) {
          cutDone[i] = true;
          var r = ltCutStation(st.dia, i, p.xdia, p.rpm, p.feed, Math.random);
          if (r === "snap") { ltSnap(st, i); return; }
          if (r === "cut") ltChip(LT_ZC[i], p.xdia);
        }
      }
      for (var c = lt.chips.length - 1; c >= 0; c--) {
        var ch = lt.chips[c];
        ch.z += ch.vz * 0.016; ch.y += ch.vy * 0.016; ch.vy += 0.35; ch.life--;
        if (ch.life <= 0) lt.chips.splice(c, 1);
      }
      ltDraw();
      if (k < 1) { lt.raf = requestAnimationFrame(frame); }
      else {
        lt.animating = false;
        lt.carriage = null;
        lt.chips = [];
        st.passes++;
        st.measured = null;
        ltDraw();
        ltRefresh();
        ltToast("Pass complete: " + st.passes + (st.passes === 1 ? " pass" : " passes") + " on this setup.");
      }
    }
    lt.raf = requestAnimationFrame(frame);
  }

  function ltSnap(st, i) {
    cancelAnimationFrame(lt.raf);
    lt.animating = false;
    lt.carriage = null;
    lt.chips = [];
    st.badge = "fail";
    st.measured = null;
    var res = lt$("ltResult");
    res.className = "lt-result fail";
    res.textContent = "INSERT SNAPPED at Z " + ltFmt(LT_ZC[i], 0) + " mm: the cut ran past the 2.00 mm limit. " +
      "Back the cross-slide out, re-rig a fresh bar, and work down in steps.";
    ltToast("Snap. That insert had a family.");
    ltRefresh();
  }

  function ltMeasure() {
    if (lt.animating) { ltToast("Hold still: a pass is running."); return; }
    var ti = lt.trial, st = lt.trials[ti], tol = LT_TRIALS[ti].tol;
    var rows = "", inTol = 0, worst = 0, n = 0;
    for (var z = 5; z <= 95; z += 10) {
      var i = (z - 1) / 2, tgt = ltTarget(ti, LT_ZC[i]), act = st.dia[i], dev = act - tgt;
      n++;
      var ok = Math.abs(dev) <= tol;
      if (ok) inTol++;
      if (Math.abs(dev) > Math.abs(worst)) worst = dev;
      rows += "<tr><td>" + z + "</td><td>" + ltFmt(tgt) + "</td><td>" + ltFmt(act) + "</td>" +
        '<td class="' + (ok ? "ok" : dev < 0 ? "under" : "over") + '">' +
        (dev >= 0 ? "+" : "") + ltFmt(dev) + "</td>" +
        '<td class="' + (ok ? "ok" : "no") + '">' + (ok ? "IN" : "OUT") + "</td></tr>";
    }
    st.measured = { inTol: Math.round(inTol / n * LT_N), worst: worst };
    lt$("ltMeas").innerHTML =
      '<table><thead><tr><th>Z mm</th><th>Print</th><th>Mic</th><th>Dev</th><th></th></tr></thead><tbody>' +
      rows + "</tbody></table>";
    lt$("ltMeasWrap").style.display = "";
    ltRefresh();
    ltToast("Micrometer says " + inTol + " of " + n + " stations in tolerance.");
  }

  function ltSubmit() {
    if (lt.animating) { ltToast("Hold still: a pass is running."); return; }
    var ti = lt.trial, st = lt.trials[ti], tol = LT_TRIALS[ti].tol;
    var g = ltGrade(ti, st.dia), res = lt$("ltResult");
    if (g.scrap) {
      st.badge = "fail";
      res.className = "lt-result fail";
      res.textContent = "SCRAP. Z " + ltFmt(g.scrap.z, 0) + " mm measures " + ltFmt(g.scrap.act) +
        " mm, " + ltFmt(-g.scrap.dev) + " mm under the low limit. Metal does not grow back: re-rig a fresh bar and try again.";
      ltToast("Scrapped. The bin is hungry today.");
    } else if (g.over > 0) {
      res.className = "lt-result";
      res.textContent = "Not yet: " + g.over + " of " + LT_N + " stations still oversize (worst +" +
        ltFmt(g.worst) + " mm at Z " + ltFmt(g.worstZ, 0) + " mm). Dial in and keep cutting.";
      ltToast("Still oversize. Keep cutting.");
    } else {
      st.badge = "pass";
      res.className = "lt-result win";
      res.textContent = "BLUEPRINT HELD. All " + LT_N + " stations within plus or minus " + ltFmt(tol) +
        " mm after " + st.passes + " passes. Trial logged.";
      ltToast("To tolerance. Nice work, machinist.");
      var p = ltParams();
      var dup = false;
      for (var w = 0; w < lt.wins.length; w++) if (lt.wins[w].t === ti) dup = true;
      if (!dup) lt.wins.push({ t: ti, passes: st.passes, rpm: p.rpm, feed: p.feed });
    }
    ltRefresh();
  }

  function ltRerig() {
    if (lt.animating) { ltToast("Hold still: a pass is running."); return; }
    var st = lt.trials[lt.trial];
    st.dia = ltFreshStock();
    st.passes = 0;
    st.measured = null;
    lt$("ltMeasWrap").style.display = "none";
    lt$("ltResult").className = "lt-result";
    lt$("ltResult").textContent = "Fresh 25.00 mm bar chucked up. Dial in and take a pass.";
    ltToast("Fresh bar chucked up.");
    ltRefresh();
  }

  function ltSetTrial(i) {
    if (lt.animating) { ltToast("Finish the pass first."); return; }
    lt.trial = i;
    lt.carriage = null;
    lt.chips = [];
    lt$("ltMeasWrap").style.display = "none";
    lt$("ltResult").className = "lt-result";
    lt$("ltResult").textContent = LT_TRIALS[i].name + " loaded. Dial in and take a pass.";
    ltRefresh();
  }

  function ltCert() {
    var lines = lt.wins.map(function (w) {
      return LT_TRIALS[w.t].name + ": " + w.passes + " passes, " + w.rpm +
        " rpm, " + ltFmt(w.feed) + " mm/rev feed";
    });
    var txt =
      "MACHINIST CERTIFICATE\n" +
      "Garage Inventions Lathe Room\n" +
      "================================\n" +
      "Date   : " + new Date().toISOString().slice(0, 10) + "\n" +
      "Result : ALL THREE BLUEPRINTS TURNED TO TOLERANCE\n" +
      "Stock  : 25.00 mm bar, manual engine lathe\n" +
      "\nWinning setups:\n" + lines.join("\n") + "\n" +
      "\nOne pin, one shoulder, one three-step fit.\n" +
      "No scrap was harmed in the making of this certificate.\n" +
      "(One insert was. It is missed.)\n" +
      "\nSigned by the micrometer. The chips do not lie.\n";
    var blob = new Blob([txt], { type: "text/plain" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "lathe-certificate.txt";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    ltToast("Machinist certificate downloaded");
  }

  /* ---------- build ---------- */
  function ltBuild() {
    var box = document.querySelector(".dossier .actions");
    if (!box || lt$("ltBtn")) return;

    var css = [
      ".lt-overlay{position:fixed;inset:0;z-index:9999;background:rgba(4,8,8,.92);display:none;align-items:center;justify-content:center;padding:16px;}",
      ".lt-overlay.open{display:flex;}",
      ".lt-panel{width:min(920px,100%);max-height:94vh;overflow-y:auto;background:#0a1416;border:1px solid var(--acid);padding:16px;}",
      ".lt-panel h3{margin:0 0 4px;font-family:'Chakra Petch',sans-serif;text-transform:uppercase;letter-spacing:.02em;}",
      ".lt-sub{font-size:11px;color:#7c8d89;margin:0 0 12px;text-transform:uppercase;letter-spacing:.1em;line-height:1.7;}",
      ".lt-tabs{display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;}",
      ".lt-tab{flex:1;min-width:150px;min-height:48px;padding:8px;font-family:'Chakra Petch',sans-serif;font-weight:700;font-size:11px;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;background:#0a1416;border:1px solid var(--line);color:var(--ink);display:flex;flex-direction:column;gap:4px;align-items:center;justify-content:center;}",
      ".lt-tab.active{border-color:var(--cyan);}",
      ".lt-tab.pass{border-color:var(--acid);}",
      ".lt-tab.fail{border-color:#ff4668;}",
      ".lt-tab-badge{font-family:monospace;font-size:9px;letter-spacing:.14em;color:#72827f;}",
      ".lt-tab.pass .lt-tab-badge{color:var(--acid);}",
      ".lt-tab.fail .lt-tab-badge{color:#ff8ba0;}",
      ".lt-blue{border:1px solid var(--line);background:var(--panel-2);padding:10px 12px;margin-bottom:10px;}",
      ".lt-blue h6{margin:0 0 8px;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--cyan);font-weight:600;}",
      ".lt-step{display:flex;justify-content:space-between;font-family:monospace;font-size:12px;color:var(--ink);padding:2px 0;}",
      ".lt-step b{color:var(--acid);}",
      ".lt-blue p{margin:8px 0 0;font-size:11px;color:var(--ink);line-height:1.6;}",
      ".lt-sliders{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:10px;}",
      ".lt-ctl{border:1px solid var(--line);background:var(--panel-2);padding:10px 12px;}",
      ".lt-ctl h6{margin:0 0 6px;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--cyan);font-weight:600;}",
      ".lt-ctl .val{font-family:monospace;font-size:13px;color:var(--ink);margin-bottom:6px;}",
      ".lt-ctl input[type=range]{width:100%;min-height:44px;accent-color:var(--acid);}",
      ".lt-jogs{display:flex;gap:6px;flex-wrap:wrap;}",
      ".lt-jog{flex:1;min-width:56px;min-height:40px;font-family:monospace;font-size:12px;cursor:pointer;background:#0a1416;border:1px solid var(--line);color:var(--ink);}",
      ".lt-pred{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-bottom:10px;}",
      ".lt-pred .t{border:1px solid var(--line);padding:6px 10px;background:var(--panel-2);}",
      ".lt-pred .t h6{margin:0 0 2px;font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:#7c8d89;font-weight:600;}",
      ".lt-pred .t p{margin:0;font-family:monospace;font-size:13px;color:var(--ink);}",
      ".lt-pred .t p.dim{color:#72827f;}",
      ".lt-pred .t p.warn{color:var(--orange);}",
      ".lt-pred .t p.bad{color:#ff8ba0;}",
      ".lt-pred .t p.good{color:var(--acid);}",
      ".lt-stage{border:1px solid var(--line);background:#060b0c;margin-bottom:10px;}",
      ".lt-stage canvas{display:block;width:100%;height:auto;}",
      ".lt-actions{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-bottom:10px;}",
      ".lt-actions button{min-height:48px;padding:10px 6px;font-family:'Chakra Petch',sans-serif;font-weight:700;font-size:11px;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;background:#0a1416;border:1px solid var(--line);color:var(--ink);}",
      ".lt-go{border-color:var(--orange) !important;color:var(--orange) !important;}",
      ".lt-tel{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:10px;}",
      ".lt-tel .t{border:1px solid var(--line);padding:6px 10px;background:var(--panel-2);}",
      ".lt-tel .t h6{margin:0 0 2px;font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:#7c8d89;font-weight:600;}",
      ".lt-tel .t p{margin:0;font-family:monospace;font-size:13px;color:var(--ink);}",
      ".lt-tel .t p.dim{color:#72827f;}",
      ".lt-meas{margin-bottom:10px;border:1px solid var(--line);background:var(--panel-2);padding:10px 12px;}",
      ".lt-meas h6{margin:0 0 8px;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--cyan);font-weight:600;}",
      ".lt-meas table{width:100%;border-collapse:collapse;font-family:monospace;font-size:12px;}",
      ".lt-meas th,.lt-meas td{border:1px solid var(--line);padding:5px 8px;text-align:right;color:var(--ink);}",
      ".lt-meas th{color:#7c8d89;font-weight:600;text-transform:uppercase;font-size:10px;letter-spacing:.08em;}",
      ".lt-meas td.ok{color:var(--acid);}",
      ".lt-meas td.under{color:#ff8ba0;}",
      ".lt-meas td.over{color:var(--orange);}",
      ".lt-meas td.no{color:#72827f;}",
      ".lt-result{padding:10px 12px;font-size:13px;font-family:monospace;border:1px solid var(--line);min-height:20px;line-height:1.6;margin-bottom:10px;color:var(--ink);}",
      ".lt-result.win{border-color:var(--acid);color:var(--acid);}",
      ".lt-result.fail{border-color:#ff4668;color:#ff8ba0;}",
      ".lt-foot{display:flex;gap:8px;flex-wrap:wrap;}",
      ".lt-foot .secondary{flex:1;min-height:44px;}",
      "@media (max-width:640px){.lt-sliders{grid-template-columns:1fr;}.lt-actions{grid-template-columns:1fr 1fr;}.lt-pred{grid-template-columns:1fr;}.lt-tel{grid-template-columns:1fr;}}"
    ].join("\n");
    var st = document.createElement("style");
    st.textContent = css;
    document.head.appendChild(st);

    var b = ltEl("button", "secondary", "Open the Lathe Room");
    b.id = "ltBtn";
    b.addEventListener("click", function () {
      lt$("ltOverlay").classList.add("open");
      ltRefresh();
    });
    box.appendChild(b);

    var tabsHtml = LT_SHORT.map(function (n, i) {
      return '<button class="lt-tab" id="ltTab' + i + '">' + n + "</button>";
    }).join("");

    var ov = ltEl("div", "lt-overlay");
    ov.id = "ltOverlay";
    ov.innerHTML =
      '<div class="lt-panel" role="dialog" aria-label="The Lathe Room machinist bench">' +
      "<h3>The Lathe Room</h3>" +
      '<p class="lt-sub">A manual engine lathe and three blueprints. Dial the cross-slide, pick RPM and feed, set the cut range, and take passes. Springback is real: rough it close, then sneak up with finish passes. Cut under size and the part is scrap, because metal does not grow back.</p>' +
      '<div class="lt-tabs">' + tabsHtml + "</div>" +
      '<div class="lt-blue" id="ltBlueprint"></div>' +
      '<div class="lt-sliders">' +
      '<div class="lt-ctl"><h6>Cross-slide (diameter)</h6><div class="val" id="ltXVal"></div>' +
      '<input type="range" id="ltX" min="10" max="25" step="0.05" value="23" aria-label="Cross-slide diameter in millimeters">' +
      '<div class="lt-jogs">' +
      '<button class="lt-jog" data-d="-0.10">-0.10</button>' +
      '<button class="lt-jog" data-d="-0.02">-0.02</button>' +
      '<button class="lt-jog" data-d="0.02">+0.02</button>' +
      '<button class="lt-jog" data-d="0.10">+0.10</button>' +
      "</div></div>" +
      '<div class="lt-ctl"><h6>Spindle RPM</h6><div class="val" id="ltRpmVal"></div>' +
      '<input type="range" id="ltRpm" min="100" max="1500" step="50" value="800" aria-label="Spindle speed in revolutions per minute"></div>' +
      '<div class="lt-ctl"><h6>Feed</h6><div class="val" id="ltFeedVal"></div>' +
      '<input type="range" id="ltFeed" min="0.05" max="0.30" step="0.01" value="0.12" aria-label="Feed in millimeters per revolution"></div>' +
      '<div class="lt-ctl"><h6>Cut from (Z)</h6><div class="val" id="ltZ0Val"></div>' +
      '<input type="range" id="ltZ0" min="0" max="100" step="2" value="0" aria-label="Cut start position in millimeters"></div>' +
      '<div class="lt-ctl"><h6>Cut to (Z)</h6><div class="val" id="ltZ1Val"></div>' +
      '<input type="range" id="ltZ1" min="0" max="100" step="2" value="100" aria-label="Cut end position in millimeters"></div>' +
      '<div class="lt-ctl"><h6>Shop notes</h6><div class="val" style="font-size:11px;line-height:1.7;color:#9aacaa;">' +
      "Insert limit 2.00 mm per pass. Chatter past 0.80 mm under 600 rpm. " +
      "Finish feed at or under 0.15 mm/rev. The dashed acid line is the print; green stations are in tolerance.</div></div>" +
      "</div>" +
      '<div class="lt-pred" id="ltPred"></div>' +
      '<div class="lt-stage"><canvas id="ltCanvas" width="860" height="300"></canvas></div>' +
      '<div class="lt-actions">' +
      '<button id="ltPass" class="lt-go">Take pass</button>' +
      '<button id="ltMeasureBtn" class="secondary">Measure</button>' +
      '<button id="ltSubmit" class="secondary">Submit part</button>' +
      '<button id="ltRerig" class="secondary">Re-rig</button>' +
      "</div>" +
      '<div class="lt-tel" id="ltTel"></div>' +
      '<div class="lt-meas" id="ltMeasWrap" style="display:none;"><h6>Micrometer readings</h6><div id="ltMeas"></div></div>' +
      '<div class="lt-result" id="ltResult">Chuck a blueprint and take a pass.</div>' +
      '<div class="lt-foot">' +
      '<button id="ltCertBtn" class="secondary" style="display:none;">Download machinist certificate</button>' +
      '<button id="ltClose" class="secondary">Close</button>' +
      "</div>" +
      "</div>";
    document.body.appendChild(ov);

    ["ltX", "ltRpm", "ltFeed", "ltZ0", "ltZ1"].forEach(function (id) {
      lt$(id).addEventListener("input", ltRefresh);
    });
    var jogs = ov.querySelectorAll(".lt-jog");
    for (var j = 0; j < jogs.length; j++) {
      (function (btn) {
        btn.addEventListener("click", function () {
          var x = lt$("ltX");
          var v = Math.round((parseFloat(x.value) + parseFloat(btn.getAttribute("data-d"))) * 100) / 100;
          x.value = Math.max(10, Math.min(25, v));
          ltRefresh();
        });
      })(jogs[j]);
    }
    for (var t = 0; t < 3; t++) {
      (function (ti) {
        lt$("ltTab" + ti).addEventListener("click", function () { ltSetTrial(ti); });
      })(t);
    }
    lt$("ltPass").addEventListener("click", ltTakePass);
    lt$("ltMeasureBtn").addEventListener("click", ltMeasure);
    lt$("ltSubmit").addEventListener("click", ltSubmit);
    lt$("ltRerig").addEventListener("click", ltRerig);
    lt$("ltCertBtn").addEventListener("click", ltCert);
    lt$("ltClose").addEventListener("click", function () {
      lt$("ltOverlay").classList.remove("open");
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && lt$("ltOverlay").classList.contains("open") && !lt.animating) {
        lt$("ltOverlay").classList.remove("open");
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ltBuild);
  } else {
    ltBuild();
  }

  /* node test hook: harmless in the browser */
  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      ltCutStation: ltCutStation,
      ltTarget: ltTarget,
      ltGrade: ltGrade,
      ltFreshStock: ltFreshStock,
      LT_TRIALS: LT_TRIALS,
      LT_ZC: LT_ZC,
      LT_N: LT_N
    };
  }

})();


/* ============================================================
   14. THE GEAR SHOP: compound gearbox tuning bench (playable)
   One 1200 RPM motor, three compound stages, six gears you
   choose. Shaft spacing is fixed, so every mating pair must
   total exactly 26 teeth or the gears clash. Three trials:
   a reduction for a conveyor, near-direct for a mill, and a
   compound overdrive for a centrifuge. Output RPM within
   plus or minus 3 percent wins the trial; clash or miss and
   the bench tells you exactly why.
   Self-contained IIFE, local helpers only, no page globals.
   ============================================================ */
(function () {
  "use strict";

  /* ---------- tiny local helpers (no reliance on page globals) ---------- */
  function gs$(id) { return document.getElementById(id); }
  function gsEl(tag, cls, html) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (html != null) d.innerHTML = html;
    return d;
  }
  function gsToast(msg) {
    if (typeof window.showToast === "function") { window.showToast(msg); return; }
    var t = gs$("toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(function () { t.classList.remove("show"); }, 1800);
  }
  function gsFmt(n, d) { return Number(n).toFixed(d == null ? 1 : d); }

  /* GS-PURE-START */
  /* ---------- pure gearbox logic (no DOM; extracted for node tests) ---------- */
  var GS_MOTOR_RPM = 1200;
  var GS_MESH_SUM = 26;      /* fixed shaft spacing, in teeth */
  var GS_TOL = 0.03;         /* plus or minus 3 percent */
  var GS_LIMITS = { P: [8, 16], A1: [8, 20], B1: [8, 20], A2: [8, 20], B2: [8, 20], A3: [8, 20] };
  var GS_ORDER = ["P", "A1", "B1", "A2", "B2", "A3"];
  var GS_LABELS = { P: "P: motor pinion", A1: "A1: stage 1 driven", B1: "B1: stage 1 driver", A2: "A2: stage 2 driven", B2: "B2: stage 2 driver", A3: "A3: output gear" };
  var GS_TRIALS = [
    { name: "Trial 1: The Conveyor", short: "The Conveyor", target: 150,
      desc: "The packaging conveyor wants 150 RPM at the drum. The motor gives 1200. Stack three reductions and mind the mesh: every mating pair must total exactly 26 teeth, because the shafts are bolted down and the gears do not negotiate." },
    { name: "Trial 2: The Mill", short: "The Mill", target: 900,
      desc: "The grain mill is happiest at 900 RPM. Close to direct drive, but the mesh rule still applies: 26 teeth per pair, no exceptions, no shims, no filing teeth in the parking lot." },
    { name: "Trial 3: The Centrifuge", short: "The Centrifuge", target: 3000,
      desc: "The centrifuge needs 3000 RPM from a 1200 RPM motor. This one runs the other way: compound overdrive. Big driving small, three times in a row, and every pair still totals 26 teeth." }
  ];

  function gsDefaultTeeth() {
    return { P: 12, A1: 14, B1: 12, A2: 14, B2: 12, A3: 14 };
  }
  function gsClampTeeth(key, v) {
    var lim = GS_LIMITS[key];
    v = Math.round(v);
    if (v < lim[0]) v = lim[0];
    if (v > lim[1]) v = lim[1];
    return v;
  }
  /* Meshes in chain order: [driverKey, drivenKey]. */
  var GS_MESHES = [["P", "A1"], ["B1", "A2"], ["B2", "A3"]];
  function gsMeshStatus(t) {
    return GS_MESHES.map(function (m) {
      var sum = t[m[0]] + t[m[1]];
      return { a: m[0], b: m[1], sum: sum, ok: sum === GS_MESH_SUM };
    });
  }
  function gsMeshesOk(t) {
    var ms = gsMeshStatus(t);
    for (var i = 0; i < ms.length; i++) if (!ms[i].ok) return false;
    return true;
  }
  function gsRatio(t) {
    return (t.P / t.A1) * (t.B1 / t.A2) * (t.B2 / t.A3);
  }
  function gsShaftRpms(t) {
    var r0 = GS_MOTOR_RPM;
    var r1 = r0 * (t.P / t.A1);
    var r2 = r1 * (t.B1 / t.A2);
    var r3 = r2 * (t.B2 / t.A3);
    return [r0, r1, r2, r3];
  }
  function gsOutputRpm(t) { return gsShaftRpms(t)[3]; }
  function gsWithinTol(rpm, target) {
    return Math.abs(rpm - target) / target <= GS_TOL + 1e-9;
  }
  /* Grade a trial setup. Returns plain data; the UI formats it. */
  function gsGrade(trialIdx, t) {
    var target = GS_TRIALS[trialIdx].target;
    var ms = gsMeshStatus(t);
    var bad = ms.filter(function (m) { return !m.ok; });
    if (bad.length > 0) {
      return { ok: false, reason: "clash", bad: bad, rpm: gsOutputRpm(t), target: target };
    }
    var rpm = gsOutputRpm(t);
    var dev = (rpm - target) / target;
    if (gsWithinTol(rpm, target)) {
      return { ok: true, reason: "held", rpm: rpm, dev: dev, target: target };
    }
    return { ok: false, reason: dev > 0 ? "fast" : "slow", rpm: rpm, dev: dev, target: target };
  }
  /* Mesh phase: driven tooth pattern offset so a gap faces the contact point
     whenever the driver presents a tooth. Angles in degrees, SVG frame
     (clockwise positive, 0 = +x). Contact is at 0 deg for the driver
     (pointing right) and 180 deg for the driven (pointing left). */
  function gsRotations(phi, t) {
    var r0 = phi;
    var r1 = -(t.P / t.A1) * r0 + 180 + 180 / t.A1;
    var r2 = -(t.B1 / t.A2) * r1 + 180 + 180 / t.A2;
    var r3 = -(t.B2 / t.A3) * r2 + 180 + 180 / t.A3;
    return [r0, r1, r2, r3];
  }
  /* GS-PURE-END */

  /* ---------- state ---------- */  var gs = {
    open: false, trial: 0, teeth: gsDefaultTeeth(), wins: [],
    phi: 0, last: 0
  };

  /* ---------- gear SVG ---------- */
  var GS_M = 80 / 13;              /* module, px per tooth: spacing 80px = 26 teeth */
  var GS_XS = [75, 155, 235, 315];
  var GS_CY = 95;
  var GS_COLORS = { P: "#c7ff38", A1: "#58e4e8", B1: "#ff6b2c", A2: "#58e4e8", B2: "#ff6b2c", A3: "#c7ff38" };
  var GS_SHAFT_NAMES = ["M", "S1", "S2", "OUT"];
  var GS_DIRS = ["CW", "CCW", "CW", "CCW"];

  function gsPolar(cx, cy, r, deg) {
    var a = deg * Math.PI / 180;
    return (cx + r * Math.cos(a)).toFixed(1) + "," + (cy + r * Math.sin(a)).toFixed(1);
  }
  /* Tooth 0 is centered at body-angle 0 (pointing +x), so mesh phasing math holds. */
  function gsGearGroup(key, t, cx, cy) {
    var rp = GS_M * t / 2, ro = rp + 0.85 * GS_M, rr = Math.max(4, rp - 1.05 * GS_M);
    var step = 360 / t, d = "";
    for (var i = 0; i < t; i++) {
      var c = i * step;
      d += (i === 0 ? "M" : "L") +
        gsPolar(cx, cy, rr, c - 0.30 * step) + "L" +
        gsPolar(cx, cy, ro, c - 0.13 * step) + "L" +
        gsPolar(cx, cy, ro, c + 0.13 * step) + "L" +
        gsPolar(cx, cy, rr, c + 0.30 * step);
    }
    d += "Z";
    var col = GS_COLORS[key];
    var hub = Math.max(7, rp * 0.28).toFixed(1);
    return '<g id="gsGear' + key + '">' +
      '<path d="' + d + '" fill="#182625" stroke="' + col + '" stroke-width="1.6"/>' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + hub + '" fill="#0a1416" stroke="' + col + '" stroke-width="1"/>' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="3" fill="#05090a"/></g>';
  }
  function gsDrawGears() {
    var t = gs.teeth, s = "";
    s += gsGearGroup("P", t.P, GS_XS[0], GS_CY);
    s += gsGearGroup("A1", t.A1, GS_XS[1], GS_CY);
    s += gsGearGroup("B1", t.B1, GS_XS[1], GS_CY);
    s += gsGearGroup("A2", t.A2, GS_XS[2], GS_CY);
    s += gsGearGroup("B2", t.B2, GS_XS[2], GS_CY);
    s += gsGearGroup("A3", t.A3, GS_XS[3], GS_CY);
    gs$("gsGears").innerHTML = s;
  }
  /* Rotation angles per frame come from gsRotations (pure section). */
  function gsSetRot(id, cx, cy, deg) {
    var g = document.getElementById(id);
    if (g) g.setAttribute("transform", "rotate(" + deg.toFixed(2) + " " + cx + " " + cy + ")");
  }
  function gsTick(now) {
    requestAnimationFrame(gsTick);
    if (!gs.open || document.hidden) { gs.last = now; return; }
    var dt = Math.min(0.1, (now - gs.last) / 1000);
    gs.last = now;
    gs.phi = (gs.phi + dt * 120) % 360;
    var r = gsRotations(gs.phi, gs.teeth);
    gsSetRot("gsGearP", GS_XS[0], GS_CY, r[0]);
    gsSetRot("gsGearA1", GS_XS[1], GS_CY, r[1]);
    gsSetRot("gsGearB1", GS_XS[1], GS_CY, r[1]);
    gsSetRot("gsGearA2", GS_XS[2], GS_CY, r[2]);
    gsSetRot("gsGearB2", GS_XS[2], GS_CY, r[2]);
    gsSetRot("gsGearA3", GS_XS[3], GS_CY, r[3]);
  }

  function gsBuildSvg() {
    var s = '<rect x="30" y="18" width="330" height="150" fill="#0b1214" stroke="#2a3b37"/>';
    var i;
    for (i = 0; i < 4; i++) {
      s += '<rect x="' + (GS_XS[i] - 5) + '" y="150" width="10" height="18" fill="#151e1c" stroke="#2a3b37"/>';
    }
    s += '<rect x="20" y="168" width="350" height="10" fill="#101716" stroke="#2a3b37"/>';
    s += '<rect x="8" y="68" width="46" height="54" fill="#151e1c" stroke="#c7ff38"/>' +
      '<text x="31" y="92" text-anchor="middle" font-family="monospace" font-size="9" fill="#c7ff38">MOTOR</text>' +
      '<text x="31" y="106" text-anchor="middle" font-family="monospace" font-size="9" fill="#e9f4e8">1200</text>';
    var caps = [["P", "A1"], ["B1", "A2"], ["B2", "A3"]];
    for (i = 0; i < 3; i++) {
      var mx = (GS_XS[i] + GS_XS[i + 1]) / 2;
      s += '<text id="gsCap' + i + '" x="' + mx + '" y="32" text-anchor="middle" font-family="monospace" font-size="10" fill="#72827f">' +
        caps[i][0] + "+" + caps[i][1] + "</text>";
    }
    for (i = 0; i < 4; i++) {
      s += '<text x="' + GS_XS[i] + '" y="190" text-anchor="middle" font-family="monospace" font-size="10" fill="#7c8d89">' +
        GS_SHAFT_NAMES[i] + "</text>";
    }
    s += '<g id="gsGears"></g>';
    gs$("gsSvg").innerHTML = s;
  }

  /* ---------- refresh ---------- */
  function gsRefresh() {
    var t = gs.teeth, i, k;
    for (i = 0; i < GS_ORDER.length; i++) {
      k = GS_ORDER[i];
      var v = gs$("gsV" + k);
      if (v) v.textContent = t[k] + " T";
    }
    var ms = gsMeshStatus(t);
    for (i = 0; i < 3; i++) {
      var row = gs$("gsMesh" + i), cap = gs$("gsCap" + i);
      if (row) {
        row.className = "gs-mrow " + (ms[i].ok ? "ok" : "bad");
        row.innerHTML = "<span>" + ms[i].a + " + " + ms[i].b + " = " + ms[i].sum + "</span><span>" +
          (ms[i].ok ? "MESH" : "CLASH (need 26)") + "</span>";
      }
      if (cap) cap.setAttribute("fill", ms[i].ok ? "#c7ff38" : "#ff4668");
    }
    var rpms = gsShaftRpms(t);
    for (i = 0; i < 4; i++) {
      var rEl = gs$("gsRpm" + i);
      if (rEl) rEl.innerHTML = gsFmt(rpms[i]) + ' RPM <span class="dim">' + GS_DIRS[i] + "</span>";
    }
    var ratio = gsRatio(t), ratioTxt;
    if (ratio < 0.999) ratioTxt = gsFmt(1 / ratio, 2) + " : 1 reduction";
    else if (ratio > 1.001) ratioTxt = gsFmt(ratio, 2) + " : 1 overdrive";
    else ratioTxt = "1.00 : 1 direct";
    var rOut = gs$("gsRatio");
    if (rOut) rOut.textContent = ratioTxt + "  (torque x" + gsFmt(1 / ratio, 2) + ")";
    var trial = GS_TRIALS[gs.trial];
    var out = gs$("gsOut");
    if (out) {
      out.innerHTML = "OUTPUT <strong>" + gsFmt(rpms[3]) + " RPM</strong> " + GS_DIRS[3] +
        ' <span class="dim">target ' + trial.target + " RPM, plus or minus 3 percent</span>";
      out.className = "gs-out " + (gsWithinTol(rpms[3], trial.target) && gsMeshesOk(t) ? "ok" : (gsMeshesOk(t) ? "" : "bad"));
    }
    gsDrawGears();
    var tabs = ["gsTab0", "gsTab1", "gsTab2"];
    for (i = 0; i < 3; i++) {
      var tab = gs$(tabs[i]);
      if (tab) {
        var won = false;
        for (var w = 0; w < gs.wins.length; w++) if (gs.wins[w].t === i) won = true;
        tab.className = "gs-tab" + (i === gs.trial ? " active" : "") + (won ? " won" : "");
        tab.textContent = GS_TRIALS[i].short + (won ? " PASS" : "");
      }
    }
    var cert = gs$("gsCert");
    if (cert) cert.disabled = gs.wins.length < 3;
  }

  function gsSetTrial(i) {
    gs.trial = i;
    var tr = GS_TRIALS[i];
    gs$("gsTrialName").textContent = tr.name;
    gs$("gsTrialTarget").textContent = "Target output: " + tr.target + " RPM, plus or minus 3 percent. Motor: 1200 RPM fixed.";
    gs$("gsTrialDesc").textContent = tr.desc;
    var res = gs$("gsResult");
    res.className = "gs-result";
    res.textContent = tr.name + " loaded. Set your teeth, check the meshes, run the trial.";
    gsRefresh();
  }

  function gsBump(key, d) {
    gs.teeth[key] = gsClampTeeth(key, gs.teeth[key] + d);
    gsRefresh();
  }

  function gsRunTrial() {
    var g = gsGrade(gs.trial, gs.teeth);
    var res = gs$("gsResult");
    var tr = GS_TRIALS[gs.trial];
    if (g.reason === "clash") {
      var parts = g.bad.map(function (m) { return m.a + " + " + m.b + " = " + m.sum; });
      res.className = "gs-result fail";
      res.textContent = "CLASH. " + parts.join("; ") + ". The shafts sit exactly 26 teeth apart, so a mating pair must total 26. No trial on a clashing box: fix the teeth and spin again.";
      gsToast("Gears clash. Fix the mesh.");
    } else if (g.reason === "fast") {
      res.className = "gs-result fail";
      res.textContent = "TOO FAST. Output " + gsFmt(g.rpm) + " RPM against a " + g.target + " RPM target (plus or minus 3 percent), running " +
        gsFmt(g.dev * 100) + " percent over. Add reduction: smaller drivers, bigger drivens.";
      gsToast("Too fast. Add reduction.");
    } else if (g.reason === "slow") {
      res.className = "gs-result fail";
      res.textContent = "TOO SLOW. Output " + gsFmt(g.rpm) + " RPM against a " + g.target + " RPM target (plus or minus 3 percent), running " +
        gsFmt(-g.dev * 100) + " percent under. Take reduction out: bigger drivers, smaller drivens.";
      gsToast("Too slow. Remove reduction.");
    } else {
      res.className = "gs-result win";
      res.textContent = "TRIAL HELD. Output " + gsFmt(g.rpm) + " RPM against " + g.target + " RPM (plus or minus 3 percent). All three meshes clean. Trial logged.";
      gsToast("To the RPM. Trial held.");
      var dup = false, w;
      for (w = 0; w < gs.wins.length; w++) if (gs.wins[w].t === gs.trial) dup = true;
      if (!dup) gs.wins.push({ t: gs.trial, teeth: JSON.parse(JSON.stringify(gs.teeth)), rpm: g.rpm });
      if (gs.wins.length === 3) {
        res.textContent += " All three trials held: the certificate is unlocked below.";
      }
    }
    gsRefresh();
  }

  function gsRandomize() {
    var keys = GS_ORDER;
    for (var i = 0; i < keys.length; i++) {
      var lim = GS_LIMITS[keys[i]];
      gs.teeth[keys[i]] = lim[0] + Math.floor(Math.random() * (lim[1] - lim[0] + 1));
    }
    var res = gs$("gsResult");
    res.className = "gs-result";
    res.textContent = "The parts bin has spoken. Check the meshes before you run anything.";
    gsToast("Random teeth fitted.");
    gsRefresh();
  }

  function gsCert() {
    var lines = gs.wins.map(function (w) {
      var t = w.teeth;
      return GS_TRIALS[w.t].name + ": P=" + t.P + " A1=" + t.A1 + " B1=" + t.B1 +
        " A2=" + t.A2 + " B2=" + t.B2 + " A3=" + t.A3 + " -> " + gsFmt(w.rpm) + " RPM";
    });
    var txt =
      "GEAR SHOP CERTIFICATE\n" +
      "Garage Inventions Gear Shop\n" +
      "================================\n" +
      "Date   : " + new Date().toISOString().slice(0, 10) + "\n" +
      "Result : ALL THREE TRIALS HELD TO PLUS OR MINUS 3 PERCENT\n" +
      "Motor  : 1200 RPM fixed, three compound stages\n" +
      "\nWinning gear trains:\n" + lines.join("\n") + "\n" +
      "\nMesh rule honored: every mating pair totals exactly 26 teeth.\n" +
      "No shims were used. The shafts never moved.\n" +
      "\nSigned by the dial indicator. The teeth do not lie.\n";
    var blob = new Blob([txt], { type: "text/plain" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "gear-shop-certificate.txt";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    gsToast("Gear shop certificate downloaded");
  }

  /* ---------- build ---------- */
  function gsBuild() {
    var box = document.querySelector(".dossier .actions");
    if (!box || gs$("gsBtn")) return;

    var css = [
      ".gs-overlay{position:fixed;inset:0;z-index:9999;background:rgba(4,8,8,.92);display:none;align-items:center;justify-content:center;padding:16px;}",
      ".gs-overlay.open{display:flex;}",
      ".gs-panel{width:min(920px,100%);max-height:94vh;overflow-y:auto;background:#0a1416;border:1px solid var(--acid);padding:16px;}",
      ".gs-panel h3{font-family:'Chakra Petch',sans-serif;margin:0 0 6px;font-size:24px;letter-spacing:.02em;text-transform:uppercase;color:var(--acid);}",
      ".gs-sub{font-size:12px;line-height:1.7;color:#9fb3ae;margin:0 0 12px;}",
      ".gs-tabs{display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;}",
      ".gs-tab{flex:1;min-width:120px;min-height:44px;background:#0a1416;border:1px solid var(--line);color:var(--ink);font-family:'Chakra Petch',sans-serif;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;padding:10px 6px;}",
      ".gs-tab.active{border-color:var(--acid);color:var(--acid);}",
      ".gs-tab.won{border-color:var(--cyan);}",
      ".gs-trial{border:1px solid var(--line);background:var(--panel-2);padding:10px 12px;margin-bottom:10px;}",
      ".gs-trial h4{margin:0 0 4px;font-family:'Chakra Petch',sans-serif;font-size:15px;color:var(--ink);text-transform:uppercase;letter-spacing:.02em;}",
      ".gs-trial .tgt{font-family:monospace;font-size:12px;color:var(--cyan);margin:0 0 6px;}",
      ".gs-trial p{margin:0;font-size:12px;line-height:1.6;color:#9fb3ae;}",
      ".gs-stage{border:1px solid var(--line);background:#060b0c;margin-bottom:10px;}",
      ".gs-stage svg{display:block;width:100%;height:auto;}",
      ".gs-gears{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:10px;}",
      ".gs-gear{border:1px solid var(--line);background:var(--panel-2);padding:8px 10px;}",
      ".gs-gear h6{margin:0 0 4px;font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:#7c8d89;font-weight:600;}",
      ".gs-gear .val{font-family:monospace;font-size:18px;color:var(--ink);margin:2px 0 6px;}",
      ".gs-step{display:flex;gap:6px;}",
      ".gs-step button{flex:1;min-height:44px;background:#0a1416;border:1px solid var(--line);color:var(--ink);font-size:18px;cursor:pointer;font-family:monospace;}",
      ".gs-step button:active{background:#1a2a28;}",
      ".gs-mesh{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:10px;}",
      ".gs-mrow{border:1px solid var(--line);padding:8px 10px;font-family:monospace;font-size:11px;display:flex;justify-content:space-between;gap:6px;background:var(--panel-2);}",
      ".gs-mrow.ok{border-color:var(--acid);color:var(--acid);}",
      ".gs-mrow.bad{border-color:#ff4668;color:#ff8ba0;}",
      ".gs-read{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-bottom:10px;}",
      ".gs-read .t{border:1px solid var(--line);padding:6px 10px;background:var(--panel-2);}",
      ".gs-read .t h6{margin:0 0 2px;font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:#7c8d89;font-weight:600;}",
      ".gs-read .t p{margin:0;font-family:monospace;font-size:13px;color:var(--ink);}",
      ".gs-read .t p .dim{color:#72827f;font-size:11px;}",
      ".gs-ratio{font-family:monospace;font-size:12px;color:var(--cyan);margin:0 0 10px;}",
      ".gs-out{border:1px solid var(--line);padding:10px 12px;font-family:monospace;font-size:14px;margin-bottom:10px;color:var(--ink);background:var(--panel-2);}",
      ".gs-out .dim{color:#72827f;font-size:12px;}",
      ".gs-out strong{color:var(--orange);font-size:18px;}",
      ".gs-out.ok{border-color:var(--acid);}",
      ".gs-out.ok strong{color:var(--acid);}",
      ".gs-out.bad{border-color:#ff4668;}",
      ".gs-result{padding:10px 12px;font-size:13px;font-family:monospace;border:1px solid var(--line);min-height:20px;line-height:1.6;margin-bottom:10px;color:var(--ink);}",
      ".gs-result.win{border-color:var(--acid);color:var(--acid);}",
      ".gs-result.fail{border-color:#ff4668;color:#ff8ba0;}",
      ".gs-actions{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;}",
      ".gs-actions button{min-height:48px;padding:10px 6px;font-family:'Chakra Petch',sans-serif;font-weight:700;font-size:11px;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;background:#0a1416;border:1px solid var(--line);color:var(--ink);}",
      ".gs-actions button:disabled{opacity:.35;cursor:default;}",
      ".gs-run{border-color:var(--orange) !important;color:var(--orange) !important;}",
      "@media (max-width:640px){.gs-gears{grid-template-columns:repeat(2,minmax(0,1fr));}.gs-mesh{grid-template-columns:1fr;}.gs-read{grid-template-columns:repeat(2,minmax(0,1fr));}.gs-actions{grid-template-columns:1fr 1fr;}}"
    ].join("\n");
    var st = document.createElement("style");
    st.textContent = css;
    document.head.appendChild(st);

    var b = gsEl("button", "secondary", "Open the Gear Shop");
    b.id = "gsBtn";
    b.addEventListener("click", function () {
      gs.open = true;
      gs.last = performance.now();
      gs$("gsOverlay").classList.add("open");
      gsRefresh();
    });
    box.appendChild(b);

    var ov = gsEl("div", "gs-overlay");
    ov.id = "gsOverlay";
    var gearsHtml = GS_ORDER.map(function (k) {
      var lim = GS_LIMITS[k];
      return '<div class="gs-gear"><h6>' + GS_LABELS[k] + " (" + lim[0] + " to " + lim[1] + ')</h6>' +
        '<div class="val" id="gsV' + k + '"></div>' +
        '<div class="gs-step"><button data-k="' + k + '" data-d="-1" aria-label="Fewer teeth on ' + k + '">-</button>' +
        '<button data-k="' + k + '" data-d="1" aria-label="More teeth on ' + k + '">+</button></div></div>';
    }).join("");
    var readHtml = GS_SHAFT_NAMES.map(function (n, i) {
      return '<div class="t"><h6>Shaft ' + n + "</h6><p id=\"gsRpm" + i + "\"></p></div>";
    }).join("");
    ov.innerHTML =
      '<div class="gs-panel" role="dialog" aria-label="The Gear Shop compound gearbox bench">' +
      "<h3>The Gear Shop</h3>" +
      '<p class="gs-sub">A compound gearbox bench: one 1200 RPM motor, three compound stages, six gears you choose. ' +
      "Shaft spacing is fixed, so every mating pair must total exactly 26 teeth or the gears clash. " +
      "Hit the trial target within plus or minus 3 percent and the trial is yours.</p>" +
      '<div class="gs-tabs"><button class="gs-tab" id="gsTab0"></button><button class="gs-tab" id="gsTab1"></button><button class="gs-tab" id="gsTab2"></button></div>' +
      '<div class="gs-trial"><h4 id="gsTrialName"></h4><p class="tgt" id="gsTrialTarget"></p><p id="gsTrialDesc"></p></div>' +
      '<div class="gs-stage"><svg id="gsSvg" viewBox="0 0 390 195" role="img" aria-label="Animated gear train"></svg></div>' +
      '<div class="gs-gears">' + gearsHtml + "</div>" +
      '<div class="gs-mesh"><div class="gs-mrow" id="gsMesh0"></div><div class="gs-mrow" id="gsMesh1"></div><div class="gs-mrow" id="gsMesh2"></div></div>' +
      '<div class="gs-read">' + readHtml + "</div>" +
      '<p class="gs-ratio" id="gsRatio"></p>' +
      '<div class="gs-out" id="gsOut"></div>' +
      '<div class="gs-result" id="gsResult"></div>' +
      '<div class="gs-actions">' +
      '<button class="gs-run" id="gsRun">Run trial</button>' +
      '<button class="secondary" id="gsRand">Randomize</button>' +
      '<button class="secondary" id="gsCert" disabled>Certificate</button>' +
      '<button class="secondary" id="gsClose">Close the shop</button>' +
      "</div></div>";
    document.body.appendChild(ov);

    gsBuildSvg();

    var i;
    for (i = 0; i < 3; i++) {
      (function (ti) {
        gs$("gsTab" + ti).addEventListener("click", function () { gsSetTrial(ti); });
      })(i);
    }
    var steps = ov.querySelectorAll(".gs-step button");
    for (i = 0; i < steps.length; i++) {
      (function (btn) {
        btn.addEventListener("click", function () {
          gsBump(btn.getAttribute("data-k"), parseInt(btn.getAttribute("data-d"), 10));
        });
      })(steps[i]);
    }
    gs$("gsRun").addEventListener("click", gsRunTrial);
    gs$("gsRand").addEventListener("click", gsRandomize);
    gs$("gsCert").addEventListener("click", gsCert);
    gs$("gsClose").addEventListener("click", function () {
      gs.open = false;
      gs$("gsOverlay").classList.remove("open");
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && gs$("gsOverlay").classList.contains("open")) {
        gs.open = false;
        gs$("gsOverlay").classList.remove("open");
      }
    });

    gsSetTrial(0);
    requestAnimationFrame(gsTick);
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", gsBuild);
    } else {
      gsBuild();
    }
  }

  /* node test hook: harmless in the browser */
  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      gsGrade: gsGrade,
      gsMeshStatus: gsMeshStatus,
      gsMeshesOk: gsMeshesOk,
      gsRatio: gsRatio,
      gsShaftRpms: gsShaftRpms,
      gsOutputRpm: gsOutputRpm,
      gsWithinTol: gsWithinTol,
      gsDefaultTeeth: gsDefaultTeeth,
      gsRotations: gsRotations,
      GS_TRIALS: GS_TRIALS,
      GS_MESH_SUM: GS_MESH_SUM
    };
  }

})();
/* ============================================================
   THE BOILER ROOM
   A real-time steam boiler management game. Two minutes on the
   shovel: keep pressure in the green band, keep water on the
   glass, answer the mill's whistle. Explosion, dry boiler, and
   stall are all real fail states. Pure sim functions below are
   shared verbatim with the node test harness.
   ============================================================ */
(function () {
  "use strict";

  /* ---------- local helpers (never touch outer scope) ---------- */
  var br$ = function (id) { return document.getElementById(id); };
  function brEl(tag, cls, html) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (html != null) d.innerHTML = html;
    return d;
  }
  function brToast(msg) {
    if (typeof window.showToast === "function") { window.showToast(msg); return; }
    var t = br$("toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(function () { t.classList.remove("show"); }, 1800);
  }
  function brEsc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function brMMSS(t) {
    t = Math.max(0, Math.floor(t));
    var m = Math.floor(t / 60), s = t % 60;
    return (m < 10 ? "0" + m : "" + m) + ":" + (s < 10 ? "0" + s : "" + s);
  }

  /* ---------- pure simulation (verbatim from tested sim) ---------- */
  var BR_LEN = 120;
  var BR_GREEN_LO = 110, BR_GREEN_HI = 160;
  var BR_BOOM = 205, BR_VALVE = 192, BR_STALL = 45;

  function brRng(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function brNewShift(seed) {
    var rng = brRng(seed);
    var times = [15, 42, 68, 94];
    var types = ["mill", "mill", "mill", "quiet"];
    var i, j, tmp;
    for (i = types.length - 1; i > 0; i--) {
      j = Math.floor(rng() * (i + 1));
      tmp = types[i]; types[i] = types[j]; types[j] = tmp;
    }
    var sched = [];
    for (i = 0; i < 4; i++) {
      var at = times[i] + (rng() * 10 - 5);
      if (types[i] === "mill") {
        sched.push({
          at: at, dur: 15 + rng() * 7,
          demand: 0.68 + rng() * 0.2,
          kind: "mill",
          name: "the mill whistle blows: line " + (1 + Math.floor(rng() * 3)) + " is drawing hard steam"
        });
      } else {
        sched.push({
          at: at, dur: 14, demand: 0.08, kind: "quiet",
          name: "night draw: the mill throttles back. Mind the needle climbing."
        });
      }
    }
    sched.sort(function (a, b) { return a.at - b.at; });
    return {
      seed: seed, t: 0, P: 130, W: 70, coal: 100, fire: 0.3,
      damper: false, feed: false,
      sched: sched, log: [], warned: {},
      greenT: 0, stallT: 0, lifted: false,
      del1: false, del2: false,
      over: false, won: false, reason: ""
    };
  }

  function brDemandAt(s) {
    for (var i = 0; i < s.sched.length; i++) {
      var e = s.sched[i];
      if (s.t >= e.at && s.t <= e.at + e.dur) return e.demand;
    }
    return 0.22;
  }

  function brLog(s, msg) {
    s.log.push({ t: s.t, msg: msg });
    if (s.log.length > 40) s.log.shift();
  }

  function brStep(s, inp, dt) {
    if (s.over) return s;
    if (dt <= 0) return s;
    if (dt > 0.1) dt = 0.1;

    var stoke = !!(inp && inp.stoke);
    var blow = !!(inp && inp.blow);

    if (stoke && s.coal > 0) {
      s.fire = Math.min(1, s.fire + 0.55 * dt);
      s.coal = Math.max(0, s.coal - 4.5 * dt);
    }
    s.fire = Math.max(0, s.fire - s.fire * (s.damper ? 0.11 : 0.055) * dt);

    var demand = brDemandAt(s);
    var HF = s.damper ? 6.5 : 4.2;
    var dP = (s.fire * HF - demand * 5.0) * dt;
    if (s.feed) dP -= 0.9 * dt;
    if (blow) dP -= 6.0 * dt;
    s.P += dP;

    if (s.P >= BR_VALVE) {
      s.P -= 2.5 * dt;
      if (!s.lifted) {
        s.lifted = true;
        brLog(s, "SAFETY VALVE LIFTED at " + Math.round(s.P) + " psi. She is screaming: ease the fire.");
      }
    }

    var dW = (s.feed ? 4.5 : 0) * dt - (s.fire * 3.2 + 0.35) * dt;
    if (blow) dW -= 9.0 * dt;
    s.W += dW;
    if (s.W < 0) s.W = 0;
    if (s.W > 100) s.W = 100;

    if (!s.del1 && s.t >= 40) { s.del1 = true; s.coal = Math.min(100, s.coal + 45); brLog(s, "Coal wagon arrived: bunker topped up."); }
    if (!s.del2 && s.t >= 80) { s.del2 = true; s.coal = Math.min(100, s.coal + 45); brLog(s, "Second coal wagon arrived: bunker topped up."); }

    var i, e;
    for (i = 0; i < s.sched.length; i++) {
      e = s.sched[i];
      if (!s.warned[i] && s.t >= e.at - 6 && s.t < e.at) {
        s.warned[i] = true;
        brLog(s, "Fireman hears it early: " + e.name + ".");
      }
    }

    if (s.P >= BR_GREEN_LO && s.P <= BR_GREEN_HI) s.greenT += dt;
    if (s.P < BR_STALL) s.stallT += dt; else s.stallT = Math.max(0, s.stallT - 2 * dt);

    s.t += dt;

    if (s.P >= BR_BOOM) {
      s.over = true; s.won = false;
      s.reason = "BOILER EXPLOSION at " + Math.round(s.P) + " psi. The crown sheet let go and the roof is now a skylight.";
    } else if (s.W <= 0) {
      s.over = true; s.won = false;
      s.reason = "DRY BOILER. The water dropped off the glass and the crown sheet burned. She will never steam again.";
    } else if (s.stallT > 8) {
      s.over = true; s.won = false;
      s.reason = "ENGINE STALLED. Pressure fell below 45 psi for too long and the mill ground to a halt.";
    } else if (s.t >= BR_LEN) {
      s.over = true; s.won = true;
      s.reason = "SHIFT COMPLETE. Two minutes on the shovel and the mill never missed a beat.";
    }
    return s;
  }

  function brRating(s) {
    var pct = Math.round(100 * s.greenT / BR_LEN);
    var title = pct >= 90 ? "Master Stoker" : pct >= 75 ? "Journeyman Fireman" : pct >= 55 ? "Apprentice" : "Ash Cat";
    return { pct: pct, title: title };
  }

  /* ---------- game state ---------- */
  var br = {
    s: null, running: false, last: 0,
    stoke: false, blow: false,
    raf: 0, seed: (Date.now() % 100000) | 0,
    best: null
  };

  function brBestGet() {
    try {
      var raw = window.localStorage.getItem("garage-boiler-best");
      if (raw) br.best = JSON.parse(raw);
    } catch (e) { br.best = null; }
  }
  function brBestSet(pct, title) {
    br.best = { pct: pct, title: title };
    try { window.localStorage.setItem("garage-boiler-best", JSON.stringify(br.best)); } catch (e) {}
  }

  /* ---------- rendering ---------- */
  function brDrawGauge() {
    var cv = br$("brGauge");
    if (!cv) return;
    var ctx = cv.getContext("2d");
    var W = cv.width, H = cv.height;
    var cx = W / 2, cy = H * 0.62, R = Math.min(W, H) * 0.42;
    ctx.clearRect(0, 0, W, H);
    // zone arcs
    function arc(p0, p1, color, lw) {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = lw;
      ctx.arc(cx, cy, R, Math.PI + Math.PI * (p0 / 210), Math.PI + Math.PI * (p1 / 210));
      ctx.stroke();
    }
    arc(0, 210, "#23302d", 14);
    arc(BR_GREEN_LO, BR_GREEN_HI, "#7ee787", 14);
    arc(BR_GREEN_HI, BR_VALVE, "#ff9f43", 14);
    arc(BR_VALVE, 210, "#ff4668", 14);
    // ticks
    ctx.fillStyle = "#9fb3ae";
    ctx.font = "10px monospace";
    ctx.textAlign = "center";
    var p, a, x1, y1, x2, y2;
    for (p = 0; p <= 210; p += 15) {
      a = Math.PI + Math.PI * (p / 210);
      x1 = cx + Math.cos(a) * (R - 12); y1 = cy + Math.sin(a) * (R - 12);
      x2 = cx + Math.cos(a) * (R - 20); y2 = cy + Math.sin(a) * (R - 20);
      ctx.strokeStyle = "#9fb3ae"; ctx.lineWidth = p % 30 === 0 ? 2 : 1;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      if (p % 30 === 0) {
        ctx.fillText(String(p), cx + Math.cos(a) * (R - 32), cy + Math.sin(a) * (R - 32) + 3);
      }
    }
    // needle
    var P = Math.max(0, Math.min(215, br.s ? br.s.P : 0));
    a = Math.PI + Math.PI * (P / 210);
    ctx.strokeStyle = "#ff4668"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * (R - 8), cy + Math.sin(a) * (R - 8));
    ctx.stroke();
    ctx.fillStyle = "#0a1416";
    ctx.beginPath(); ctx.arc(cx, cy, 8, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#9fb3ae"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, 8, 0, Math.PI * 2); ctx.stroke();
    // digital readout
    ctx.fillStyle = "#e9f4e8";
    ctx.font = "bold 22px monospace";
    ctx.fillText(Math.round(P) + " psi", cx, cy + 42);
    ctx.fillStyle = "#7c8d89";
    ctx.font = "10px monospace";
    ctx.fillText("STEAM PRESSURE", cx, cy + 58);
  }

  function brRender() {
    if (!br.s) return;
    var s = br.s;
    brDrawGauge();
    // water glass
    var wl = br$("brWaterFill");
    if (wl) {
      wl.style.height = Math.max(0, Math.min(100, s.W)) + "%";
      wl.className = "br-water-fill" + (s.W < 25 ? " low" : "");
    }
    var wt = br$("brWaterTxt");
    if (wt) wt.textContent = Math.round(s.W) + "%";
    // coal
    var cf = br$("brCoalFill");
    if (cf) cf.style.width = Math.max(0, Math.min(100, s.coal)) + "%";
    var ct = br$("brCoalTxt");
    if (ct) ct.textContent = Math.round(s.coal) + "%";
    // fire
    var fl = br$("brFlames");
    if (fl) fl.style.opacity = (0.15 + 0.85 * s.fire).toFixed(2);
    var ft = br$("brFireTxt");
    if (ft) ft.textContent = s.fire < 0.15 ? "dying" : s.fire < 0.45 ? "steady" : s.fire < 0.75 ? "roaring" : "raging";
    // demand
    var d = brDemandAt(s);
    var df = br$("brDrawFill");
    if (df) df.style.width = Math.round(d * 100) + "%";
    var dt2 = br$("brDrawTxt");
    if (dt2) dt2.textContent = d > 0.5 ? "MILL DRAWING HARD" : d > 0.3 ? "mill drawing" : "light draw";
    // vent indicator
    var venting = s.P >= BR_VALVE || br.blow;
    var v = br$("brVent");
    if (v) v.style.display = venting ? "block" : "none";
    // green lamp
    var lamp = br$("brLamp");
    if (lamp) lamp.className = "br-lamp" + (s.P >= BR_GREEN_LO && s.P <= BR_GREEN_HI ? " on" : "");
    // timer
    var tm = br$("brTimer");
    if (tm) tm.textContent = brMMSS(s.t) + " / " + brMMSS(BR_LEN);
    var pg = br$("brProgFill");
    if (pg) pg.style.width = Math.min(100, 100 * s.t / BR_LEN) + "%";
    // ticker
    var ul = br$("brLog");
    if (ul) {
      var items = s.log.slice(-6).reverse();
      var html = "";
      for (var i = 0; i < items.length; i++) {
        html += "<li><span class=\"br-ts\">[" + brMMSS(items[i].t) + "]</span> " + brEsc(items[i].msg) + "</li>";
      }
      ul.innerHTML = html || "<li class=\"dim\">Shift log is quiet. Too quiet.</li>";
    }
    // toggle button states
    var dm = br$("brDamper");
    if (dm) { dm.textContent = s.damper ? "DAMPER: OPEN" : "DAMPER: SHUT"; dm.classList.toggle("on", s.damper); }
    var fp = br$("brFeed");
    if (fp) { fp.textContent = s.feed ? "FEED PUMP: ON" : "FEED PUMP: OFF"; fp.classList.toggle("on", s.feed); }
  }

  /* ---------- game loop ---------- */
  function brLoop(now) {
    if (!br.running) return;
    var dt = (now - br.last) / 1000;
    br.last = now;
    if (dt > 0.25) dt = 0.25;
    var acc = dt;
    while (acc > 0.0001 && !br.s.over) {
      var h = Math.min(0.05, acc);
      brStep(br.s, { stoke: br.stoke, blow: br.blow }, h);
      acc -= h;
    }
    brRender();
    if (br.s.over) {
      br.running = false;
      brShowEnd();
      return;
    }
    br.raf = requestAnimationFrame(brLoop);
  }

  function brStartShift() {
    br.s = brNewShift(br.seed);
    br.seed = (br.seed + 1) | 0;
    br.stoke = false; br.blow = false;
    brLog(br.s, "Shift begins. Steam at " + Math.round(br.s.P) + " psi, glass at " + Math.round(br.s.W) + " percent. Mind the whistle.");
    br$("brStart").style.display = "none";
    br$("brEnd").style.display = "none";
    br$("brGame").style.display = "block";
    br.running = true;
    br.last = performance.now();
    br.raf = requestAnimationFrame(brLoop);
    brRender();
    brToast("Shift started. Keep her in the green.");
  }

  function brStop() {
    br.running = false;
    if (br.raf) cancelAnimationFrame(br.raf);
    br.raf = 0;
    br.stoke = false; br.blow = false;
  }

  function brShowEnd() {
    var s = br.s;
    var r = brRating(s);
    br$("brGame").style.display = "none";
    var end = br$("brEnd");
    end.style.display = "block";
    var cls = s.won ? "br-result win" : "br-result fail";
    var bestLine = "";
    if (s.won && (!br.best || r.pct > br.best.pct)) {
      brBestSet(r.pct, r.title);
      bestLine = "<p class=\"br-best\">New house record.</p>";
    } else if (br.best) {
      bestLine = "<p class=\"br-best\">House best: " + br.best.pct + "% (" + brEsc(br.best.title) + ").</p>";
    }
    end.innerHTML =
      "<div class=\"" + cls + "\">" + brEsc(s.reason) + "</div>" +
      "<div class=\"br-score\">SHIFT RATING <strong>" + r.pct + "%</strong> <span class=\"dim\">(" + brEsc(r.title) + ")</span></div>" +
      "<p class=\"br-sub\">Time in the green (110 to 160 psi): " + Math.round(s.greenT) + "s of " + BR_LEN + "s." +
      (s.lifted ? " The safety valve lifted at least once." : " The safety valve never had to lift.") + "</p>" +
      bestLine +
      "<div class=\"br-actions\">" +
      "<button id=\"brReport\" class=\"br-big\">Download shift report</button>" +
      "<button id=\"brAgain\" class=\"br-big accent\">Work another shift</button>" +
      "<button id=\"brClose2\" class=\"br-big\">Back to the garage</button>" +
      "</div>";
    br$("brReport").addEventListener("click", brReport);
    br$("brAgain").addEventListener("click", brStartShift);
    br$("brClose2").addEventListener("click", brClose);
  }

  function brReport() {
    var s = br.s;
    if (!s) return;
    var r = brRating(s);
    var lines = s.log.map(function (e) { return "[" + brMMSS(e.t) + "] " + e.msg; });
    var txt =
      "BOILER ROOM SHIFT REPORT\n" +
      "Garage Inventions: The Boiler Room\n" +
      "================================\n" +
      "Date   : " + new Date().toISOString().slice(0, 10) + "\n" +
      "Seed   : " + s.seed + "\n" +
      "Result : " + (s.won ? "SHIFT COMPLETE" : "FAILED") + "\n" +
      "Detail : " + s.reason + "\n" +
      "Rating : " + r.pct + "% (" + r.title + ")\n" +
      "Green  : " + Math.round(s.greenT) + "s of " + BR_LEN + "s in the 110-160 psi band\n" +
      "Valve  : " + (s.lifted ? "lifted" : "never lifted") + "\n" +
      "Coal left: " + Math.round(s.coal) + "%\n" +
      "\nShift log:\n" + lines.join("\n") + "\n" +
      "\nSigned by the pressure gauge. The needle does not lie.\n";
    var blob = new Blob([txt], { type: "text/plain" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "boiler-room-shift-report.txt";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    brToast("Shift report downloaded");
  }

  function brClose() {
    brStop();
    br$("brOverlay").classList.remove("open");
  }

  /* ---------- build ---------- */
  function brBuild() {
    var box = document.querySelector(".dossier .actions");
    if (!box || br$("brBtn")) return;
    brBestGet();

    var css = [
      ".br-overlay{position:fixed;inset:0;z-index:9999;background:rgba(4,8,8,.93);display:none;align-items:center;justify-content:center;padding:14px;}",
      ".br-overlay.open{display:flex;}",
      ".br-panel{width:min(860px,100%);max-height:94vh;overflow-y:auto;background:#0a1416;border:1px solid var(--orange);padding:16px;}",
      ".br-panel h3{font-family:'Chakra Petch',sans-serif;margin:0 0 6px;font-size:24px;letter-spacing:.02em;text-transform:uppercase;color:var(--orange);}",
      ".br-sub{font-size:12px;line-height:1.7;color:#9fb3ae;margin:0 0 12px;}",
      ".br-rules{border:1px dashed var(--orange);padding:12px 14px;margin-bottom:12px;background:rgba(255,107,44,.05);}",
      ".br-rules p{margin:0 0 8px;font-size:12px;line-height:1.7;color:var(--ink);}",
      ".br-rules p:last-child{margin-bottom:0;}",
      ".br-rules strong{color:var(--orange);}",
      ".br-top{display:flex;gap:10px;align-items:stretch;margin-bottom:10px;flex-wrap:wrap;}",
      ".br-timer{border:1px solid var(--line);background:var(--panel-2);padding:8px 12px;font-family:monospace;font-size:15px;color:var(--ink);display:flex;align-items:center;gap:10px;}",
      ".br-lamp{width:18px;height:18px;border-radius:50%;background:#3a2a2a;border:1px solid var(--line);flex:none;}",
      ".br-lamp.on{background:var(--acid);box-shadow:0 0 10px var(--acid);}",
      ".br-prog{flex:1;min-width:140px;border:1px solid var(--line);background:#060b0c;position:relative;min-height:40px;}",
      ".br-prog-fill{position:absolute;left:0;top:0;bottom:0;background:rgba(126,231,135,.25);width:0;}",
      ".br-prog span{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:monospace;font-size:11px;color:#9fb3ae;letter-spacing:.1em;}",
      ".br-dials{display:grid;grid-template-columns:1fr 120px 1fr;gap:10px;margin-bottom:10px;}",
      ".br-dialbox{border:1px solid var(--line);background:#060b0c;padding:6px;display:flex;flex-direction:column;align-items:center;}",
      ".br-dialbox canvas{width:100%;height:auto;}",
      ".br-glassbox{border:1px solid var(--line);background:#060b0c;padding:8px;display:flex;flex-direction:column;align-items:center;gap:6px;}",
      ".br-glass{width:44px;height:170px;border:2px solid #9fb3ae;background:#0a1416;position:relative;overflow:hidden;}",
      ".br-water-fill{position:absolute;bottom:0;left:0;right:0;background:linear-gradient(to top,#1e6f8e,#4fc3e8);transition:height .2s;}",
      ".br-water-fill.low{background:linear-gradient(to top,#8e1e2e,#e84f6a);}",
      ".br-glass .mark{position:absolute;left:0;right:0;border-top:1px dashed #ff9f43;}",
      ".br-cap{font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:#7c8d89;text-align:center;font-weight:600;}",
      ".br-sidecol{display:flex;flex-direction:column;gap:10px;}",
      ".br-meter{border:1px solid var(--line);background:var(--panel-2);padding:8px 10px;}",
      ".br-meter h6{margin:0 0 6px;font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:#7c8d89;font-weight:600;}",
      ".br-bar{height:14px;background:#060b0c;border:1px solid var(--line);position:relative;overflow:hidden;}",
      ".br-bar i{position:absolute;left:0;top:0;bottom:0;background:var(--cyan);display:block;}",
      ".br-bar.coal i{background:var(--orange);}",
      ".br-meter p{margin:6px 0 0;font-family:monospace;font-size:11px;color:var(--ink);}",
      ".br-firebox{border:1px solid var(--line);background:#050808;height:86px;position:relative;overflow:hidden;margin-bottom:10px;}",
      ".br-flames{position:absolute;inset:0;background:radial-gradient(ellipse 60% 90% at 30% 100%,rgba(255,180,60,.95),rgba(255,107,44,.7) 45%,rgba(120,30,10,0) 75%),radial-gradient(ellipse 50% 80% at 65% 100%,rgba(255,220,120,.9),rgba(255,107,44,.55) 50%,rgba(120,30,10,0) 75%),radial-gradient(ellipse 40% 70% at 85% 100%,rgba(255,150,50,.8),rgba(255,107,44,.4) 55%,rgba(120,30,10,0) 75%);animation:brFlick .5s infinite alternate ease-in-out;}",
      "@keyframes brFlick{from{transform:scaleY(1);}to{transform:scaleY(1.12) translateY(-2px);}}",
      ".br-firebox .br-cap{position:absolute;top:6px;left:10px;z-index:2;}",
      ".br-firetxt{position:absolute;top:6px;right:10px;z-index:2;font-family:monospace;font-size:11px;color:var(--orange);}",
      ".br-vent{display:none;position:absolute;inset:0;z-index:3;background:repeating-linear-gradient(to top,rgba(200,220,220,0) 0 14px,rgba(200,220,220,.28) 14px 22px);animation:brRise .7s infinite linear;pointer-events:none;}",
      "@keyframes brRise{from{background-position:0 44px;}to{background-position:0 0;}}",
      ".br-ticker{border:1px solid var(--line);background:var(--panel-2);padding:8px 12px;margin-bottom:10px;min-height:96px;}",
      ".br-ticker ul{list-style:none;margin:0;padding:0;font-family:monospace;font-size:11px;line-height:1.8;color:var(--ink);}",
      ".br-ticker .br-ts{color:var(--cyan);}",
      ".br-ticker .dim{color:#72827f;}",
      ".br-controls{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-bottom:10px;}",
      ".br-controls button{min-height:64px;padding:10px 6px;font-family:'Chakra Petch',sans-serif;font-weight:700;font-size:12px;letter-spacing:.05em;text-transform:uppercase;cursor:pointer;background:#0a1416;border:1px solid var(--line);color:var(--ink);touch-action:none;user-select:none;-webkit-user-select:none;}",
      ".br-controls button:active{background:#1a2a28;}",
      ".br-controls button.on{border-color:var(--acid);color:var(--acid);}",
      ".br-controls button.held{background:#2a1a10;border-color:var(--orange);color:var(--orange);}",
      ".br-controls button.warn{border-color:#ff4668;color:#ff8ba0;}",
      ".br-actions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;}",
      ".br-big{min-height:52px;padding:10px 8px;font-family:'Chakra Petch',sans-serif;font-weight:700;font-size:12px;letter-spacing:.05em;text-transform:uppercase;cursor:pointer;background:#0a1416;border:1px solid var(--line);color:var(--ink);}",
      ".br-big.accent{border-color:var(--orange);color:var(--orange);}",
      ".br-result{padding:12px 14px;font-size:13px;font-family:monospace;border:1px solid var(--line);line-height:1.7;margin-bottom:10px;color:var(--ink);}",
      ".br-result.win{border-color:var(--acid);color:var(--acid);}",
      ".br-result.fail{border-color:#ff4668;color:#ff8ba0;}",
      ".br-score{font-family:monospace;font-size:14px;color:var(--ink);margin-bottom:8px;}",
      ".br-score strong{color:var(--orange);font-size:20px;}",
      ".br-score .dim{color:#72827f;font-size:12px;}",
      ".br-best{font-family:monospace;font-size:12px;color:var(--cyan);margin:0 0 10px;}",
      ".br-bestline{font-family:monospace;font-size:11px;color:#7c8d89;margin:0 0 12px;}",
      ".br-foot{display:flex;gap:8px;flex-wrap:wrap;}",
      ".br-foot .br-big{flex:1;min-width:140px;}",
      "@media (max-width:640px){.br-dials{grid-template-columns:1fr 96px;}.br-sidecol{grid-column:1/-1;display:grid;grid-template-columns:1fr 1fr;}.br-controls{grid-template-columns:1fr 1fr;}.br-actions{grid-template-columns:1fr;}}"
    ].join("\n");
    var st = document.createElement("style");
    st.textContent = css;
    document.head.appendChild(st);

    var b = brEl("button", "secondary", "Fire the Boiler Room");
    b.id = "brBtn";
    box.appendChild(b);

    var ov = brEl("div", "br-overlay");
    ov.id = "brOverlay";
    ov.innerHTML =
      "<div class=\"br-panel\" role=\"dialog\" aria-label=\"The Boiler Room steam boiler game\">" +
      "<h3>The Boiler Room</h3>" +
      "<p class=\"br-sub\">Lancashire boiler, one fireman, two minutes. The mill is counting on you.</p>" +
      "<div id=\"brStart\">" +
      "<div class=\"br-rules\">" +
      "<p><strong>The job:</strong> hold steam between <strong>110 and 160 psi</strong> for a full two-minute shift. The green lamp tells you when she is in the band.</p>" +
      "<p><strong>Deaths, all real:</strong> past <strong>205 psi</strong> she explodes. Water off the glass and the crown sheet burns. Under <strong>45 psi</strong> for 8 seconds and the engine stalls. At 192 the safety valve lifts and screams, but it will not save you twice.</p>" +
      "<p><strong>The tools:</strong> hold <strong>SHOVEL</strong> to feed the fire (burns coal). <strong>DAMPER</strong> open burns hotter and faster. <strong>FEED PUMP</strong> adds water but cools the steam. Hold <strong>BLOWDOWN</strong> to dump steam and water in an emergency. Watch the ticker: the whistle warns you before the mill draws.</p>" +
      "</div>" +
      "<p class=\"br-bestline\" id=\"brBestLine\"></p>" +
      "<div class=\"br-foot\"><button id=\"brBegin\" class=\"br-big accent\">Begin shift</button>" +
      "<button id=\"brClose0\" class=\"br-big\">Not today</button></div>" +
      "</div>" +
      "<div id=\"brGame\" style=\"display:none;\">" +
      "<div class=\"br-top\">" +
      "<div class=\"br-timer\"><span class=\"br-lamp\" id=\"brLamp\"></span><span id=\"brTimer\">00:00 / 02:00</span></div>" +
      "<div class=\"br-prog\"><div class=\"br-prog-fill\" id=\"brProgFill\"></div><span>SHIFT PROGRESS</span></div>" +
      "</div>" +
      "<div class=\"br-dials\">" +
      "<div class=\"br-dialbox\"><canvas id=\"brGauge\" width=\"300\" height=\"230\"></canvas></div>" +
      "<div class=\"br-glassbox\"><div class=\"br-cap\">Water glass</div><div class=\"br-glass\"><div class=\"br-water-fill\" id=\"brWaterFill\" style=\"height:70%\"></div><div class=\"mark\" style=\"bottom:25%\"></div><div class=\"mark\" style=\"bottom:85%\"></div></div><div class=\"br-cap\" id=\"brWaterTxt\">70%</div></div>" +
      "<div class=\"br-sidecol\">" +
      "<div class=\"br-meter\"><h6>Coal bunker</h6><div class=\"br-bar coal\"><i id=\"brCoalFill\" style=\"width:100%\"></i></div><p id=\"brCoalTxt\">100%</p></div>" +
      "<div class=\"br-meter\"><h6>Mill draw</h6><div class=\"br-bar\"><i id=\"brDrawFill\" style=\"width:22%\"></i></div><p id=\"brDrawTxt\">light draw</p></div>" +
      "</div>" +
      "</div>" +
      "<div class=\"br-firebox\"><span class=\"br-cap\">Firebox</span><span class=\"br-firetxt\" id=\"brFireTxt\">steady</span><div class=\"br-flames\" id=\"brFlames\"></div><div class=\"br-vent\" id=\"brVent\"></div></div>" +
      "<div class=\"br-ticker\"><ul id=\"brLog\"></ul></div>" +
      "<div class=\"br-controls\">" +
      "<button id=\"brStoke\">Shovel coal (hold)</button>" +
      "<button id=\"brDamper\">Damper: shut</button>" +
      "<button id=\"brFeed\">Feed pump: off</button>" +
      "<button id=\"brBlow\" class=\"warn\">Blowdown (hold)</button>" +
      "</div>" +
      "<div class=\"br-foot\"><button id=\"brAbort\" class=\"br-big\">Abandon shift</button><button id=\"brClose1\" class=\"br-big\">Close</button></div>" +
      "</div>" +
      "<div id=\"brEnd\" style=\"display:none;\"></div>" +
      "</div>";
    document.body.appendChild(ov);

    function hold(btn, set) {
      var on = function (e) { e.preventDefault(); set(true); btn.classList.add("held"); };
      var off = function () { set(false); btn.classList.remove("held"); };
      btn.addEventListener("pointerdown", on);
      btn.addEventListener("pointerup", off);
      btn.addEventListener("pointerleave", off);
      btn.addEventListener("pointercancel", off);
      btn.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    }

    br$("brBegin").addEventListener("click", brStartShift);
    br$("brClose0").addEventListener("click", brClose);
    br$("brClose1").addEventListener("click", brClose);
    br$("brAbort").addEventListener("click", function () {
      brStop();
      br$("brGame").style.display = "none";
      br$("brEnd").style.display = "none";
      br$("brStart").style.display = "block";
      brToast("Shift abandoned. The mill understands.");
    });
    hold(br$("brStoke"), function (v) { br.stoke = v; });
    hold(br$("brBlow"), function (v) { br.blow = v; });
    br$("brDamper").addEventListener("click", function () { if (br.s && !br.s.over) br.s.damper = !br.s.damper; });
    br$("brFeed").addEventListener("click", function () { if (br.s && !br.s.over) br.s.feed = !br.s.feed; });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && ov.classList.contains("open")) brClose();
      if (e.code === "Space" && ov.classList.contains("open") && br.running && br.s && !br.s.over) {
        e.preventDefault();
        if (!br.stoke) { br.stoke = true; br$("brStoke").classList.add("held"); }
      }
    });
    document.addEventListener("keyup", function (e) {
      if (e.code === "Space" && br.stoke) { br.stoke = false; var b2 = br$("brStoke"); if (b2) b2.classList.remove("held"); }
    });
    ov.addEventListener("click", function (e) { if (e.target === ov) brClose(); });
    b.addEventListener("click", function () {
      ov.classList.add("open");
      var bl = br$("brBestLine");
      if (bl) bl.textContent = br.best ? ("House best: " + br.best.pct + "% (" + br.best.title + ").") : "No fireman has completed a shift yet. Be the first.";
      if (br.s && !br.s.over && !br.running) {
        br.running = true;
        br.last = performance.now();
        br.raf = requestAnimationFrame(brLoop);
      }
    });
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", brBuild);
    } else {
      brBuild();
    }
  }

  /* node test hook: harmless in the browser */
  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      brNewShift: brNewShift,
      brStep: brStep,
      brDemandAt: brDemandAt,
      brRating: brRating,
      BR_LEN: BR_LEN
    };
  }

})();
/* ============================================================
   THE GANTRY YARD
   An overhead crane game with real pendulum physics on the hook.
   Three crates, three painted drop zones. The load remembers
   every stop you make: swing it into a stack, drop it off the
   paint, or slam it down and the lift is lost. Pure sim functions
   are shared verbatim with the node test harness (see the
   GY-SIM markers below).
   ============================================================ */
(function () {
  "use strict";

  /* ---------- local helpers (never touch outer scope) ---------- */
  var gy$ = function (id) { return document.getElementById(id); };
  function gyEl(tag, cls, html) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (html != null) d.innerHTML = html;
    return d;
  }
  function gyToast(msg) {
    if (typeof window.showToast === "function") { window.showToast(msg); return; }
    var t = gy$("toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(function () { t.classList.remove("show"); }, 1800);
  }
  function gyEsc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function gyMMSS(t) {
    t = Math.max(0, Math.ceil(t));
    var m = Math.floor(t / 60), s = t % 60;
    return (m < 10 ? "0" + m : "" + m) + ":" + (s < 10 ? "0" + s : "" + s);
  }

/* GY-SIM-BEGIN */
var GY = {
  G: 9.81,
  YARD_W: 24,
  RAIL_Y: 11,
  X_MIN: 1.2, X_MAX: 22.8,
  L_MIN: 2.2, L_MAX: 9.2,
  TROLLEY_ACCEL: 4.2,
  TROLLEY_FRIC: 1.1,
  TROLLEY_MAX: 6.5,
  HOIST_RATE: 2.6,
  THETA_DAMP: 0.30,
  CRATE_W: 1.4, CRATE_H: 1.4,
  LIFT_TIME: 75,
  ENDSTOP_KICK: 0.45
};

function gyRng(seed) {
  var a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gyNewLift(seed, idx) {
  var r = gyRng(((seed * 2654435761) ^ (idx * 40503 + 1)) >>> 0);
  var pickupX = 2.2 + r() * 1.8;
  var targetX = 19.8 + r() * 1.8;
  var targetW = 2.8;
  var stacks = [];
  var bandLo = 6.0, bandHi = 16.5, slot = (bandHi - bandLo) / 3;
  for (var i = 0; i < 3; i++) {
    var w = 1.4 + r() * 1.0;
    var h = 1.6 + r() * 2.4;
    var sx = bandLo + i * slot + r() * (slot - w);
    stacks.push({ x: sx, w: w, h: h });
  }
  return { seed: seed, idx: idx, pickupX: pickupX, targetX: targetX, targetW: targetW, stacks: stacks };
}

function gyNewState(lift) {
  return {
    lift: lift,
    x: lift.pickupX, vx: 0,
    theta: 0, omega: 0, l: 5.0, dl: 0,
    attached: true, over: false, won: false, reason: "",
    t: GY.LIFT_TIME, tUsed: 0,
    drop: null, stats: null
  };
}

function gyHook(s) {
  return { hx: s.x + s.l * Math.sin(s.theta), hy: GY.RAIL_Y - s.l * Math.cos(s.theta) };
}

function gyCrateRect(s) {
  var h = gyHook(s);
  return { l: h.hx - GY.CRATE_W / 2, r: h.hx + GY.CRATE_W / 2, b: h.hy - GY.CRATE_H, t: h.hy };
}

function gyOverlap(a, b) {
  return a.l < b.r && a.r > b.l && a.b < b.t && a.t > b.b;
}

function gyTimeout(s) {
  s.over = true; s.won = false;
  s.reason = "The shift whistle blew with the crate still on the hook.";
  return [{ type: "fail", reason: s.reason }];
}

function gyStepHook(s, inp, dt) {
  var ev = [];
  if (s.over || !s.attached) return ev;
  s.t -= dt; s.tUsed += dt;
  if (s.t <= 0) { s.t = 0; return gyTimeout(s); }
  var dir = inp.dir || 0;
  var ax = dir * GY.TROLLEY_ACCEL - GY.TROLLEY_FRIC * s.vx;
  var nvx = s.vx + ax * dt;
  if (nvx > GY.TROLLEY_MAX) nvx = GY.TROLLEY_MAX;
  if (nvx < -GY.TROLLEY_MAX) nvx = -GY.TROLLEY_MAX;
  var nx = s.x + nvx * dt;
  if (nx <= GY.X_MIN) {
    nx = GY.X_MIN;
    if (nvx < -2.5) { s.omega += (-nvx / s.l) * GY.ENDSTOP_KICK; ev.push({ type: "bump", msg: "End stop hit. The hook kicks." }); }
    nvx = Math.abs(nvx) * 0.2;
  } else if (nx >= GY.X_MAX) {
    nx = GY.X_MAX;
    if (nvx > 2.5) { s.omega += (-nvx / s.l) * GY.ENDSTOP_KICK; ev.push({ type: "bump", msg: "End stop hit. The hook kicks." }); }
    nvx = -Math.abs(nvx) * 0.2;
  }
  s.x = nx; s.vx = nvx;
  s.dl = (inp.hoist || 0) * GY.HOIST_RATE;
  s.l += s.dl * dt;
  if (s.l < GY.L_MIN) { s.l = GY.L_MIN; s.dl = 0; }
  if (s.l > GY.L_MAX) { s.l = GY.L_MAX; s.dl = 0; }
  var thAcc = -(GY.G / s.l) * Math.sin(s.theta) - (ax / s.l) * Math.cos(s.theta) - GY.THETA_DAMP * s.omega;
  s.omega += thAcc * dt;
  s.theta += s.omega * dt;
  var cr = gyCrateRect(s);
  for (var i = 0; i < s.lift.stacks.length; i++) {
    var st = s.lift.stacks[i];
    if (gyOverlap(cr, { l: st.x, r: st.x + st.w, b: 0, t: st.h })) {
      s.over = true; s.won = false;
      s.reason = "The crate swung into stack " + (i + 1) + " and burst open.";
      ev.push({ type: "fail", reason: s.reason });
      return ev;
    }
  }
  return ev;
}

function gyRelease(s) {
  var ev = [];
  if (s.over || !s.attached) return ev;
  var h = gyHook(s);
  var tipVx = s.vx + s.l * Math.cos(s.theta) * s.omega + Math.sin(s.theta) * s.dl;
  var tipVy = s.l * Math.sin(s.theta) * s.omega - Math.cos(s.theta) * s.dl;
  s.attached = false;
  s.drop = {
    bx: h.hx, by: h.hy - GY.CRATE_H,
    lvx: tipVx, lvy: tipVy,
    relVx: tipVx, relVy: tipVy,
    relY: h.hy - GY.CRATE_H,
    relSway: s.theta, relL: s.l
  };
  ev.push({ type: "released" });
  return ev;
}

function gyStepDrop(s, dt) {
  var ev = [];
  if (s.over || s.attached) return ev;
  var d = s.drop;
  s.t -= dt; s.tUsed += dt;
  if (s.t <= 0) { s.t = 0; return gyTimeout(s); }
  d.lvy -= GY.G * dt;
  d.bx += d.lvx * dt;
  d.by += d.lvy * dt;
  if (d.bx < -1 || d.bx > GY.YARD_W + 1) {
    s.over = true; s.won = false;
    s.reason = "The crate sailed over the fence and is gone.";
    ev.push({ type: "fail", reason: s.reason });
    return ev;
  }
  var cr = { l: d.bx - GY.CRATE_W / 2, r: d.bx + GY.CRATE_W / 2, b: d.by, t: d.by + GY.CRATE_H };
  for (var i = 0; i < s.lift.stacks.length; i++) {
    var st = s.lift.stacks[i];
    if (gyOverlap(cr, { l: st.x, r: st.x + st.w, b: 0, t: st.h })) {
      s.over = true; s.won = false;
      s.reason = "The crate smashed onto stack " + (i + 1) + ".";
      ev.push({ type: "fail", reason: s.reason });
      return ev;
    }
  }
  if (d.by <= 0) {
    d.by = 0;
    var res = gyEvalLanding(s);
    s.over = true; s.won = res.ok; s.reason = res.msg; s.stats = res.stats;
    ev.push({ type: res.ok ? "delivered" : "fail", reason: s.reason, stats: res.stats });
  }
  return ev;
}

function gyEvalLanding(s) {
  var d = s.drop, L = s.lift;
  var offC = Math.abs(d.bx - L.targetX);
  var impactV = -d.lvy;
  var stats = { offC: offC, relVx: d.relVx, impactV: impactV, relY: d.relY, relSway: d.relSway, tUsed: s.tUsed };
  if (offC > L.targetW / 2 - 0.2) {
    return { ok: false, stats: stats, msg: "Dropped " + offC.toFixed(1) + " m off the paint. The foreman is not impressed." };
  }
  if (Math.abs(d.lvx) > 1.6) {
    return { ok: false, stats: stats, msg: "Inside the zone but drifting " + Math.abs(d.lvx).toFixed(1) + " m/s sideways. The crate tipped over." };
  }
  if (impactV > 4.0) {
    return { ok: false, stats: stats, msg: "Slammed in at " + impactV.toFixed(1) + " m/s. The crate burst open." };
  }
  var sc = gyScoreLift(stats);
  return { ok: true, stats: stats, msg: "Delivered. " + sc.score + " points (" + sc.title + ")." };
}

function gyScoreLift(st) {
  var sc = 100 - st.offC * 10 - Math.abs(st.relVx) * 6 - st.impactV * 2 - st.relY * 2 - st.tUsed * 0.15;
  sc = Math.max(10, Math.min(100, Math.round(sc)));
  var title = sc >= 90 ? "Silk Hand"
    : sc >= 75 ? "Journeyman Rigger"
    : sc >= 55 ? "Shop Hand"
    : sc >= 30 ? "Needs Supervision"
    : "Hazard to Navigation";
  return { score: sc, title: title };
}
/* GY-SIM-END */

  /* ---------- game state (DOM side) ---------- */
  var G = {
    raf: 0, running: false, last: 0, acc: 0,
    inp: { dir: 0, hoist: 0 },
    keyL: false, keyR: false, keyU: false, keyD: false,
    btnL: false, btnR: false, btnU: false, btnD: false,
    s: null, liftIdx: 0, lifts: [], seed: 1, log: [], best: null
  };

  var CW = 920, CH = 430, SC = 37, OX = 16, OY = 416;
  function px(x) { return OX + x * SC; }
  function py(y) { return OY - y * SC; }

  function gyBestGet() {
    try {
      var raw = window.localStorage.getItem("garage-gantry-best");
      G.best = raw ? JSON.parse(raw) : null;
    } catch (e) { G.best = null; }
  }
  function gyBestSet(avg, title) {
    G.best = { avg: avg, title: title, date: new Date().toISOString().slice(0, 10) };
    try { window.localStorage.setItem("garage-gantry-best", JSON.stringify(G.best)); } catch (e) {}
  }

  function gyLog(msg) {
    G.log.push({ t: G.s ? G.s.tUsed : 0, msg: msg });
    if (G.log.length > 40) G.log.shift();
    var ul = gy$("gyLog");
    if (!ul) return;
    ul.innerHTML = "";
    var start = Math.max(0, G.log.length - 6);
    for (var i = start; i < G.log.length; i++) {
      var e = G.log[i];
      var li = gyEl("li", "", "<span class=\"gy-ts\">[" + gyMMSS(e.t) + "]</span> " + gyEsc(e.msg));
      ul.appendChild(li);
    }
  }

  /* ---------- rendering ---------- */
  function gyDrawCrate(c, cx, cyBottom) {
    var w = GY.CRATE_W * SC, h = GY.CRATE_H * SC;
    var x0 = px(cx) - w / 2, y1 = py(cyBottom);
    c.fillStyle = "rgba(255,107,44,.88)";
    c.fillRect(x0, y1 - h, w, h);
    c.strokeStyle = "#7a3a12";
    c.lineWidth = 2;
    c.strokeRect(x0, y1 - h, w, h);
    c.strokeStyle = "rgba(122,58,18,.8)";
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(x0 + 4, y1 - 4); c.lineTo(x0 + w - 4, y1 - h + 4);
    c.moveTo(x0 + w - 4, y1 - 4); c.lineTo(x0 + 4, y1 - h + 4);
    c.stroke();
    c.fillStyle = "#2a1404";
    c.font = "700 10px monospace";
    c.textAlign = "center";
    c.fillText("FRAGILE", px(cx), y1 - h / 2 + 3);
  }

  function gyRender() {
    var cv = gy$("gyCanvas");
    if (!cv || !G.s) return;
    var c = cv.getContext("2d");
    var s = G.s, L = s.lift;
    c.clearRect(0, 0, CW, CH);
    c.fillStyle = "#060b0c";
    c.fillRect(0, 0, CW, CH);
    /* ground */
    c.fillStyle = "#0b1110";
    c.fillRect(0, OY, CW, CH - OY);
    c.strokeStyle = "rgba(126,231,135,.35)";
    c.lineWidth = 2;
    c.beginPath(); c.moveTo(0, OY); c.lineTo(CW, OY); c.stroke();
    /* gantry columns + rail */
    c.fillStyle = "#1b2b29";
    c.fillRect(px(0.4) - 6, py(GY.RAIL_Y) - 4, 12, py(0) - py(GY.RAIL_Y) + 4);
    c.fillRect(px(23.6) - 6, py(GY.RAIL_Y) - 4, 12, py(0) - py(GY.RAIL_Y) + 4);
    c.strokeStyle = "#4a5d59";
    c.lineWidth = 3;
    c.beginPath(); c.moveTo(px(0), py(GY.RAIL_Y)); c.lineTo(px(24), py(GY.RAIL_Y)); c.stroke();
    c.lineWidth = 1;
    c.beginPath(); c.moveTo(px(0), py(GY.RAIL_Y) - 8); c.lineTo(px(24), py(GY.RAIL_Y) - 8); c.stroke();
    /* end stops */
    c.fillStyle = "#ff4668";
    c.fillRect(px(GY.X_MIN) - 4, py(GY.RAIL_Y) - 16, 8, 16);
    c.fillRect(px(GY.X_MAX) - 4, py(GY.RAIL_Y) - 16, 8, 16);
    /* pickup pallet */
    c.fillStyle = "#2c2117";
    c.fillRect(px(L.pickupX) - 40, OY - 8, 80, 8);
    c.fillStyle = "#7c8d89";
    c.font = "600 10px monospace"; c.textAlign = "center";
    c.fillText("PICKUP", px(L.pickupX), OY + 14);
    /* drop zone */
    var zx0 = px(L.targetX - L.targetW / 2), zx1 = px(L.targetX + L.targetW / 2);
    c.save();
    c.setLineDash([8, 6]);
    c.strokeStyle = "#7ee787";
    c.lineWidth = 2;
    c.strokeRect(zx0, OY - 18, zx1 - zx0, 18);
    c.restore();
    c.fillStyle = "rgba(126,231,135,.12)";
    c.fillRect(zx0, OY - 18, zx1 - zx0, 18);
    c.fillStyle = "#7ee787";
    c.font = "600 10px monospace";
    c.fillText("DROP ZONE", px(L.targetX), OY + 14);
    /* stacks */
    for (var i = 0; i < L.stacks.length; i++) {
      var st = L.stacks[i];
      var sx0 = px(st.x), sw = st.w * SC, sh = st.h * SC;
      c.fillStyle = "#2c2117";
      c.fillRect(sx0, OY - sh, sw, sh);
      c.strokeStyle = "#6b4a2a";
      c.lineWidth = 2;
      c.strokeRect(sx0, OY - sh, sw, sh);
      c.strokeStyle = "rgba(107,74,42,.7)";
      c.lineWidth = 1;
      for (var yy = OY - 30; yy > OY - sh; yy -= 30) {
        c.beginPath(); c.moveTo(sx0, yy); c.lineTo(sx0 + sw, yy); c.stroke();
      }
      c.fillStyle = "#9fb3ae";
      c.font = "600 10px monospace";
      c.fillText("S" + (i + 1), sx0 + sw / 2, OY - sh - 6);
    }
    /* trolley */
    var tx = px(s.x), ty = py(GY.RAIL_Y);
    c.fillStyle = "#16211f";
    c.strokeStyle = "#7ee787";
    c.lineWidth = 2;
    c.fillRect(tx - 24, ty - 26, 48, 26);
    c.strokeRect(tx - 24, ty - 26, 48, 26);
    /* cable + hook + crate */
    var hook, crateY;
    if (s.attached) {
      hook = gyHook(s);
      c.strokeStyle = "#9fb3ae";
      c.lineWidth = 2;
      c.beginPath(); c.moveTo(tx, ty); c.lineTo(px(hook.hx), py(hook.hy)); c.stroke();
      c.fillStyle = "#9fb3ae";
      c.beginPath(); c.arc(px(hook.hx), py(hook.hy), 5, 0, Math.PI * 2); c.fill();
      crateY = hook.hy - GY.CRATE_H;
      gyDrawCrate(c, hook.hx, crateY);
    } else {
      var d = s.drop;
      c.strokeStyle = "#9fb3ae";
      c.lineWidth = 2;
      c.beginPath(); c.moveTo(tx, ty); c.lineTo(tx, py(GY.RAIL_Y - s.l)); c.stroke();
      c.fillStyle = "#9fb3ae";
      c.beginPath(); c.arc(tx, py(GY.RAIL_Y - s.l), 5, 0, Math.PI * 2); c.fill();
      if (d) gyDrawCrate(c, d.bx, d.by);
    }
    /* result stamp */
    if (s.over) {
      c.font = "700 26px 'Chakra Petch',sans-serif";
      c.textAlign = "center";
      c.fillStyle = s.won ? "#7ee787" : "#ff4668";
      c.fillText(s.won ? "DELIVERED" : "LIFT LOST", CW / 2, 44);
    }
  }

  function gyHud() {
    var s = G.s;
    if (!s) return;
    gy$("gyTimer").textContent = gyMMSS(s.t);
    gy$("gyLift").textContent = "LIFT " + (G.liftIdx + 1) + "/3";
    var deg = s.attached ? s.theta * 180 / Math.PI : 0;
    var sw = gy$("gySway");
    sw.textContent = "SWAY " + Math.abs(deg).toFixed(1) + " deg";
    sw.style.color = Math.abs(deg) < 3 ? "#7ee787" : Math.abs(deg) < 10 ? "#ff9f43" : "#ff4668";
    var alt;
    if (s.attached) { var h = gyHook(s); alt = h.hy - GY.CRATE_H; }
    else if (s.drop) { alt = s.drop.by; }
    else { alt = 0; }
    gy$("gyAlt").textContent = "LOAD " + Math.max(0, alt).toFixed(1) + " m";
    gy$("gyDeliv").textContent = "DELIVERED " + G.lifts.filter(function (x) { return x.won; }).length;
    var db = gy$("gyDrop");
    if (db) db.disabled = !s.attached || s.over;
  }

  /* ---------- loop ---------- */
  function gyOnEvent(e) {
    if (e.type === "bump") {
      gyLog(e.msg);
      gyToast("End stop. Watch the hook.");
    } else if (e.type === "released") {
      gyLog("Load released.");
    } else if (e.type === "delivered" || e.type === "fail") {
      gyLog(e.reason);
      gyFinishLift(e.type === "delivered", e.reason, e.stats);
    }
  }

  function gyPollInput() {
    G.inp.dir = ((G.keyR || G.btnR) ? 1 : 0) - ((G.keyL || G.btnL) ? 1 : 0);
    G.inp.hoist = ((G.keyD || G.btnD) ? 1 : 0) - ((G.keyU || G.btnU) ? 1 : 0);
  }

  function gyLoop(now) {
    if (!G.running) return;
    var dt = Math.min(0.05, (now - G.last) / 1000);
    G.last = now;
    gyPollInput();
    G.acc += dt;
    var step = 1 / 120, n = 0;
    while (G.acc >= step && n < 14) {
      var ev = G.s.attached ? gyStepHook(G.s, G.inp, step) : gyStepDrop(G.s, step);
      G.acc -= step; n++;
      for (var i = 0; i < ev.length; i++) gyOnEvent(ev[i]);
      if (G.s.over) break;
    }
    gyRender();
    gyHud();
    G.raf = requestAnimationFrame(gyLoop);
  }

  function gyStop() {
    G.running = false;
    if (G.raf) cancelAnimationFrame(G.raf);
    G.raf = 0;
    G.keyL = G.keyR = G.keyU = G.keyD = false;
    G.btnL = G.btnR = G.btnU = G.btnD = false;
  }

  function gyClose() {
    gyStop();
    gy$("gyOverlay").classList.remove("open");
  }

  function gyStartShift() {
    G.seed = (Math.random() * 1000000000) | 0;
    G.liftIdx = 0;
    G.lifts = [];
    G.log = [];
    gyBeginLift();
  }

  function gyBeginLift() {
    G.s = gyNewState(gyNewLift(G.seed, G.liftIdx));
    G.acc = 0;
    gy$("gyStart").style.display = "none";
    gy$("gyMid").style.display = "none";
    gy$("gyEnd").style.display = "none";
    gy$("gyGame").style.display = "block";
    gyLog("Lift " + (G.liftIdx + 1) + ": crate rigged at pickup. Run her over to the drop zone.");
    if (!G.running) {
      G.running = true;
      G.last = performance.now();
      G.raf = requestAnimationFrame(gyLoop);
    }
    gyRender();
    gyHud();
  }

  function gyFinishLift(won, reason, stats) {
    gyStop();
    var sc = stats ? gyScoreLift(stats) : { score: 0, title: "Lost" };
    G.lifts.push({ won: won, score: won ? sc.score : 0, title: won ? sc.title : "Lift lost", reason: reason });
    var mid = gy$("gyMid");
    mid.style.display = "block";
    gy$("gyGame").style.display = "none";
    gy$("gyMidTitle").textContent = won ? "Lift " + (G.liftIdx + 1) + " delivered" : "Lift " + (G.liftIdx + 1) + " lost";
    gy$("gyMidTitle").style.color = won ? "#7ee787" : "#ff4668";
    var body = gyEsc(reason);
    if (won && stats) {
      body += "<br>Miss: " + stats.offC.toFixed(1) + " m. Release sway: " +
        (Math.abs(stats.relSway) * 180 / Math.PI).toFixed(1) + " deg. Impact: " +
        stats.impactV.toFixed(1) + " m/s. Time: " + Math.round(stats.tUsed) + " s.";
      body += "<br><strong>" + sc.score + " points (" + gyEsc(sc.title) + ").</strong>";
    }
    gy$("gyMidBody").innerHTML = body;
    gy$("gyNext").textContent = G.liftIdx < 2 ? "Rig the next lift" : "See the shift report";
  }

  function gyNextLift() {
    if (G.liftIdx < 2) {
      G.liftIdx++;
      gyBeginLift();
    } else {
      gyShowEnd();
    }
  }

  function gyAvg() {
    var sum = 0;
    for (var i = 0; i < G.lifts.length; i++) sum += G.lifts[i].score;
    return G.lifts.length ? Math.round(sum / G.lifts.length) : 0;
  }

  function gyShowEnd() {
    gyStop();
    gy$("gyMid").style.display = "none";
    gy$("gyGame").style.display = "none";
    var end = gy$("gyEnd");
    end.style.display = "block";
    var delivered = G.lifts.filter(function (x) { return x.won; }).length;
    var won = delivered === 3;
    var avg = gyAvg();
    var overall = gyScoreLift({ offC: 0, relVx: 0, impactV: 0, relY: 0, tUsed: 0 });
    var title = avg >= 90 ? "Silk Hand" : avg >= 75 ? "Journeyman Rigger" : avg >= 55 ? "Shop Hand" : avg >= 30 ? "Needs Supervision" : "Hazard to Navigation";
    var cls = won ? "gy-result win" : "gy-result fail";
    var bestLine = "";
    if (won && (!G.best || avg > G.best.avg)) {
      gyBestSet(avg, title);
      bestLine = "<p class=\"gy-best\">New house record.</p>";
    } else if (G.best) {
      bestLine = "<p class=\"gy-best\">House best: " + G.best.avg + "% (" + gyEsc(G.best.title) + ").</p>";
    }
    var rows = "";
    for (var i = 0; i < G.lifts.length; i++) {
      var x = G.lifts[i];
      rows += "<div class=\"gy-liftrow " + (x.won ? "win" : "fail") + "\"><span>LIFT " + (i + 1) + "</span><span>" +
        (x.won ? x.score + " pts" : "LOST") + "</span><span>" + gyEsc(x.won ? x.title : x.reason) + "</span></div>";
    }
    gy$("gyEndBody").innerHTML =
      "<div class=\"" + cls + "\">" + (won ? "Three for three. The yard is clear." : "Shift over: " + delivered + " of 3 lifts delivered.") + "</div>" +
      "<div class=\"gy-score\">SHIFT RATING <strong>" + avg + "%</strong> <span class=\"dim\">(" + gyEsc(title) + ")</span></div>" +
      rows + bestLine +
      "<div class=\"gy-actions\">" +
      "<button id=\"gyManifest\" class=\"gy-big\">Download manifest</button>" +
      (won ? "<button id=\"gyCert\" class=\"gy-big\">Operator certificate</button>" : "") +
      "<button id=\"gyAgain\" class=\"gy-big accent\">Work another shift</button>" +
      "<button id=\"gyClose2\" class=\"gy-big\">Back to the garage</button>" +
      "</div>";
    gy$("gyManifest").addEventListener("click", gyManifest);
    var cb = gy$("gyCert");
    if (cb) cb.addEventListener("click", gyCert);
    gy$("gyAgain").addEventListener("click", gyStartShift);
    gy$("gyClose2").addEventListener("click", gyClose);
  }

  function gyManifest() {
    var delivered = G.lifts.filter(function (x) { return x.won; }).length;
    var lines = G.log.map(function (e) { return "[" + gyMMSS(e.t) + "] " + e.msg; });
    var lifts = G.lifts.map(function (x, i) {
      return "Lift " + (i + 1) + ": " + (x.won ? "DELIVERED, " + x.score + " pts (" + x.title + ")" : "LOST") + "\n  " + x.reason;
    }).join("\n");
    var txt =
      "GANTRY YARD SHIFT MANIFEST\n" +
      "Garage Inventions: The Gantry Yard\n" +
      "================================\n" +
      "Date   : " + new Date().toISOString().slice(0, 10) + "\n" +
      "Seed   : " + G.seed + "\n" +
      "Result : " + (delivered === 3 ? "SHIFT COMPLETE" : "SHIFT INCOMPLETE") + " (" + delivered + "/3 delivered)\n" +
      "Rating : " + gyAvg() + "%\n\n" +
      lifts + "\n\nShift log:\n" + lines.join("\n") + "\n\n" +
      "Signed by the hook block. It remembers every stop.\n";
    var blob = new Blob([txt], { type: "text/plain" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "gantry-yard-manifest.txt";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    gyToast("Shift manifest downloaded");
  }

  function gyCert() {
    var txt =
      "GANTRY YARD OPERATOR CERTIFICATE\n" +
      "Garage Inventions\n" +
      "================================\n" +
      "This certifies that the bearer ran the gantry crane for a\n" +
      "full three-lift shift and delivered every crate to the paint.\n\n" +
      "Date   : " + new Date().toISOString().slice(0, 10) + "\n" +
      "Rating : " + gyAvg() + "%\n\n" +
      "No stacks were harmed. The hook block vouches for the sway.\n";
    var blob = new Blob([txt], { type: "text/plain" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "gantry-yard-operator-certificate.txt";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    gyToast("Certificate downloaded");
  }

  function gyDoRelease() {
    if (!G.s || G.s.over) return;
    if (!G.s.attached) { gyToast("No load on the hook."); return; }
    var ev = gyRelease(G.s);
    for (var i = 0; i < ev.length; i++) gyOnEvent(ev[i]);
  }

  function gyRerig() {
    if (!G.s || G.s.over) return;
    gyStop();
    G.s.over = true; G.s.won = false;
    G.s.reason = "The rigger cut the lift short and re-slung the load.";
    gyLog(G.s.reason);
    gyFinishLift(false, G.s.reason, null);
  }

  /* ---------- build ---------- */
  function gyBuild() {
    var box = document.querySelector(".dossier .actions");
    if (!box || gy$("gyBtn")) return;
    gyBestGet();

    var css = [
      ".gy-overlay{position:fixed;inset:0;z-index:9999;background:rgba(4,8,8,.93);display:none;align-items:center;justify-content:center;padding:14px;}",
      ".gy-overlay.open{display:flex;}",
      ".gy-panel{width:min(980px,100%);max-height:94vh;overflow-y:auto;background:#0a1416;border:1px solid var(--acid);padding:16px;}",
      ".gy-panel h3{font-family:'Chakra Petch',sans-serif;margin:0 0 6px;font-size:24px;letter-spacing:.02em;text-transform:uppercase;color:var(--acid);}",
      ".gy-sub{font-size:12px;line-height:1.7;color:#9fb3ae;margin:0 0 12px;}",
      ".gy-rules{border:1px dashed var(--acid);padding:12px 14px;margin-bottom:12px;background:rgba(126,231,135,.05);}",
      ".gy-rules p{margin:0 0 8px;font-size:12px;line-height:1.7;color:var(--ink);}",
      ".gy-rules p:last-child{margin-bottom:0;}",
      ".gy-rules strong{color:var(--acid);}",
      ".gy-hud{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px;}",
      ".gy-hud .cell{border:1px solid var(--line);background:var(--panel-2);padding:8px 12px;font-family:monospace;font-size:14px;color:var(--ink);min-width:110px;text-align:center;}",
      ".gy-hud .cell small{display:block;font-size:9px;letter-spacing:.12em;color:#7c8d89;text-transform:uppercase;margin-bottom:2px;}",
      ".gy-canvasbox{border:1px solid var(--line);background:#060b0c;margin-bottom:10px;}",
      ".gy-canvasbox canvas{width:100%;height:auto;display:block;}",
      ".gy-ticker{border:1px solid var(--line);background:var(--panel-2);padding:8px 12px;margin-bottom:10px;min-height:96px;}",
      ".gy-ticker ul{list-style:none;margin:0;padding:0;font-family:monospace;font-size:11px;line-height:1.8;color:var(--ink);}",
      ".gy-ticker .gy-ts{color:var(--cyan);}",
      ".gy-controls{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin-bottom:10px;}",
      ".gy-controls button{min-height:64px;padding:10px 6px;font-family:'Chakra Petch',sans-serif;font-weight:700;font-size:12px;letter-spacing:.05em;text-transform:uppercase;cursor:pointer;background:#0a1416;border:1px solid var(--line);color:var(--ink);touch-action:none;user-select:none;-webkit-user-select:none;}",
      ".gy-controls button:active{background:#1a2a28;}",
      ".gy-controls button.held{background:#122a18;border-color:var(--acid);color:var(--acid);}",
      ".gy-controls button.drop{border-color:#ff4668;color:#ff8ba0;}",
      ".gy-controls button.drop:disabled{opacity:.35;cursor:default;}",
      ".gy-foot{display:flex;gap:8px;flex-wrap:wrap;}",
      ".gy-big{min-height:52px;padding:10px 8px;font-family:'Chakra Petch',sans-serif;font-weight:700;font-size:12px;letter-spacing:.05em;text-transform:uppercase;cursor:pointer;background:#0a1416;border:1px solid var(--line);color:var(--ink);}",
      ".gy-big.accent{border-color:var(--acid);color:var(--acid);}",
      ".gy-foot .gy-big{flex:1;min-width:140px;}",
      ".gy-result{padding:12px 14px;font-size:13px;font-family:monospace;border:1px solid var(--line);line-height:1.7;margin-bottom:10px;color:var(--ink);}",
      ".gy-result.win{border-color:var(--acid);color:var(--acid);}",
      ".gy-result.fail{border-color:#ff4668;color:#ff8ba0;}",
      ".gy-score{font-family:monospace;font-size:14px;color:var(--ink);margin-bottom:8px;}",
      ".gy-score strong{color:var(--acid);font-size:20px;}",
      ".gy-score .dim{color:#72827f;font-size:12px;}",
      ".gy-best{font-family:monospace;font-size:12px;color:var(--cyan);margin:0 0 10px;}",
      ".gy-bestline{font-family:monospace;font-size:11px;color:#7c8d89;margin:0 0 12px;}",
      ".gy-liftrow{display:grid;grid-template-columns:70px 90px 1fr;gap:10px;font-family:monospace;font-size:12px;padding:8px 10px;border:1px solid var(--line);margin-bottom:6px;color:var(--ink);}",
      ".gy-liftrow.win{border-color:var(--acid);}",
      ".gy-liftrow.fail{border-color:#ff4668;}",
      ".gy-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:10px;}",
      ".gy-midtitle{font-family:'Chakra Petch',sans-serif;font-size:22px;text-transform:uppercase;margin:0 0 10px;}",
      ".gy-midbody{font-size:13px;line-height:1.8;color:var(--ink);font-family:monospace;margin:0 0 14px;}",
      ".gy-midbody strong{color:var(--acid);}",
      "@media (max-width:640px){.gy-controls{grid-template-columns:repeat(3,minmax(0,1fr));}.gy-actions{grid-template-columns:1fr;}.gy-liftrow{grid-template-columns:1fr;gap:2px;}}"
    ].join("\n");
    var st = document.createElement("style");
    st.textContent = css;
    document.head.appendChild(st);

    var b = gyEl("button", "secondary", "Run the Gantry Yard");
    b.id = "gyBtn";
    box.appendChild(b);

    var ov = gyEl("div", "gy-overlay");
    ov.id = "gyOverlay";
    ov.innerHTML =
      "<div class=\"gy-panel\" role=\"dialog\" aria-label=\"The Gantry Yard overhead crane game\">" +
      "<h3>The Gantry Yard</h3>" +
      "<p class=\"gy-sub\">Overhead crane, one hook, three crates. The yard is counting on you.</p>" +
      "<div id=\"gyStart\">" +
      "<div class=\"gy-rules\">" +
      "<p><strong>The job:</strong> sling three crates from the pickup pallet to the painted drop zone. A full shift is three delivered loads, 75 seconds per lift.</p>" +
      "<p><strong>The machine:</strong> hold <strong>trolley</strong> buttons to run the bridge, hold <strong>hoist</strong> buttons to reel the cable. The load is a real pendulum: it remembers every stop you make. Settle the sway, lower the crate low over the paint, then <strong>DROP</strong>. Arrow keys work too, Space drops.</p>" +
      "<p><strong>Ways to lose a lift:</strong> swing the crate into a stack, drop it off the paint, land it drifting faster than <strong>1.6 m/s</strong> (it tips), slam it down faster than <strong>4.0 m/s</strong> (it bursts), or let the clock run out. Hit the end stops hard and the hook kicks.</p>" +
      "</div>" +
      "<p class=\"gy-bestline\" id=\"gyBestLine\"></p>" +
      "<div class=\"gy-foot\"><button id=\"gyBegin\" class=\"gy-big accent\">Begin shift</button>" +
      "<button id=\"gyClose0\" class=\"gy-big\">Not today</button></div>" +
      "</div>" +
      "<div id=\"gyGame\" style=\"display:none;\">" +
      "<div class=\"gy-hud\">" +
      "<div class=\"cell\"><small>Lift</small><span id=\"gyLift\">LIFT 1/3</span></div>" +
      "<div class=\"cell\"><small>Clock</small><span id=\"gyTimer\">01:15</span></div>" +
      "<div class=\"cell\"><small>Sway</small><span id=\"gySway\">SWAY 0.0 deg</span></div>" +
      "<div class=\"cell\"><small>Load height</small><span id=\"gyAlt\">LOAD 0.0 m</span></div>" +
      "<div class=\"cell\"><small>Scoreboard</small><span id=\"gyDeliv\">DELIVERED 0</span></div>" +
      "</div>" +
      "<div class=\"gy-canvasbox\"><canvas id=\"gyCanvas\" width=\"920\" height=\"430\"></canvas></div>" +
      "<div class=\"gy-ticker\"><ul id=\"gyLog\"></ul></div>" +
      "<div class=\"gy-controls\">" +
      "<button id=\"gyTrolL\">Trolley &#9664;</button>" +
      "<button id=\"gyTrolR\">Trolley &#9654;</button>" +
      "<button id=\"gyHoistU\">Hoist &#9650;</button>" +
      "<button id=\"gyHoistD\">Hoist &#9660;</button>" +
      "<button id=\"gyDrop\" class=\"drop\">Drop load</button>" +
      "</div>" +
      "<div class=\"gy-foot\"><button id=\"gyRerig\" class=\"gy-big\">Re-rig lift</button><button id=\"gyClose1\" class=\"gy-big\">Close</button></div>" +
      "</div>" +
      "<div id=\"gyMid\" style=\"display:none;\">" +
      "<h4 class=\"gy-midtitle\" id=\"gyMidTitle\"></h4>" +
      "<p class=\"gy-midbody\" id=\"gyMidBody\"></p>" +
      "<div class=\"gy-foot\"><button id=\"gyNext\" class=\"gy-big accent\">Rig the next lift</button></div>" +
      "</div>" +
      "<div id=\"gyEnd\" style=\"display:none;\"><div id=\"gyEndBody\"></div></div>" +
      "</div>";
    document.body.appendChild(ov);

    function hold(btn, set) {
      var on = function (e) { e.preventDefault(); set(true); btn.classList.add("held"); };
      var off = function () { set(false); btn.classList.remove("held"); };
      btn.addEventListener("pointerdown", on);
      btn.addEventListener("pointerup", off);
      btn.addEventListener("pointerleave", off);
      btn.addEventListener("pointercancel", off);
      btn.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    }

    hold(gy$("gyTrolL"), function (v) { G.btnL = v; });
    hold(gy$("gyTrolR"), function (v) { G.btnR = v; });
    hold(gy$("gyHoistU"), function (v) { G.btnU = v; });
    hold(gy$("gyHoistD"), function (v) { G.btnD = v; });
    gy$("gyDrop").addEventListener("click", gyDoRelease);
    gy$("gyBegin").addEventListener("click", gyStartShift);
    gy$("gyClose0").addEventListener("click", gyClose);
    gy$("gyClose1").addEventListener("click", gyClose);
    gy$("gyRerig").addEventListener("click", gyRerig);
    gy$("gyNext").addEventListener("click", gyNextLift);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && ov.classList.contains("open")) gyClose();
      if (!ov.classList.contains("open")) return;
      if (e.code === "Space" && !e.repeat) { e.preventDefault(); gyDoRelease(); return; }
      if (e.key === "ArrowLeft") { G.keyL = true; e.preventDefault(); }
      if (e.key === "ArrowRight") { G.keyR = true; e.preventDefault(); }
      if (e.key === "ArrowUp") { G.keyU = true; e.preventDefault(); }
      if (e.key === "ArrowDown") { G.keyD = true; e.preventDefault(); }
    });
    document.addEventListener("keyup", function (e) {
      if (e.key === "ArrowLeft") G.keyL = false;
      if (e.key === "ArrowRight") G.keyR = false;
      if (e.key === "ArrowUp") G.keyU = false;
      if (e.key === "ArrowDown") G.keyD = false;
    });
    ov.addEventListener("click", function (e) { if (e.target === ov) gyClose(); });
    b.addEventListener("click", function () {
      ov.classList.add("open");
      var bl = gy$("gyBestLine");
      if (bl) bl.textContent = G.best ? ("House best: " + G.best.avg + "% (" + G.best.title + ").") : "No rigger has finished a shift yet. Be the first.";
      if (G.s && !G.s.over && !G.running) {
        G.running = true;
        G.last = performance.now();
        G.raf = requestAnimationFrame(gyLoop);
      }
    });
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", gyBuild);
    } else {
      gyBuild();
    }
  }

  /* node test hook: harmless in the browser */
  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      GY: GY,
      gyRng: gyRng,
      gyNewLift: gyNewLift,
      gyNewState: gyNewState,
      gyHook: gyHook,
      gyStepHook: gyStepHook,
      gyRelease: gyRelease,
      gyStepDrop: gyStepDrop,
      gyEvalLanding: gyEvalLanding,
      gyScoreLift: gyScoreLift
    };
  }

})();
/* ============================================================
   THE RELAY RACK
   A ladder-logic relay panel: wire NO/NC contacts, relay coils
   and a pilot lamp across four rungs, then prove four shift
   specs with the foreman's step tester. Real PLC-style scan,
   seal-in latching, dead-short and chatter fault detection.
   ============================================================ */
(function () {
  "use strict";

  /* ---------- local helpers (never touch outer scope) ---------- */
  var rr$ = function (id) { return document.getElementById(id); };
  function rrEl(tag, cls, html) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (html != null) d.innerHTML = html;
    return d;
  }
  function rrToast(msg) {
    if (typeof window.showToast === "function") { window.showToast(msg); return; }
    var t = rr$("toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(function () { t.classList.remove("show"); }, 1800);
  }
  function rrEsc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function rrStoreGet(k) {
    try { return window.localStorage.getItem(k); } catch (e) { return null; }
  }
  function rrStoreSet(k, v) {
    try { window.localStorage.setItem(k, v); } catch (e) { /* ignore */ }
  }

  /* ============================================================
     PURE SIM (no DOM): ladder-logic scan
     ============================================================ */
  var RR_PALETTE = [
    { label: "WIRE", wire: true },
    { label: "NO·A", type: "no", src: "A" },
    { label: "NC·A", type: "nc", src: "A" },
    { label: "NO·B", type: "no", src: "B" },
    { label: "NC·B", type: "nc", src: "B" },
    { label: "NO·C", type: "no", src: "C" },
    { label: "NC·C", type: "nc", src: "C" },
    { label: "NO·K1", type: "no", src: "K1" },
    { label: "NC·K1", type: "nc", src: "K1" },
    { label: "NO·K2", type: "no", src: "K2" },
    { label: "NC·K2", type: "nc", src: "K2" }
  ];
  var RR_OUTPUTS = ["NONE", "K1", "K2", "LAMP"];
  var RR_SCAN_LIMIT = 16;

  function rrSignal(src, inputs, coils) {
    if (src === "A" || src === "B" || src === "C") return !!inputs[src];
    return !!coils[src];
  }
  function rrClosed(palIdx, inputs, coils) {
    var p = RR_PALETTE[palIdx];
    if (!p || p.wire) return true;
    var s = rrSignal(p.src, inputs, coils);
    return p.type === "no" ? s : !s;
  }
  function rrBranchConducts(cells, inputs, coils) {
    var has = false, i;
    for (i = 0; i < cells.length; i++) { if (cells[i] !== 0) { has = true; break; } }
    if (!has) return false;
    for (i = 0; i < cells.length; i++) { if (!rrClosed(cells[i], inputs, coils)) return false; }
    return true;
  }
  function rrRungConducts(rung, inputs, coils) {
    return rrBranchConducts(rung.a, inputs, coils) || rrBranchConducts(rung.b, inputs, coils);
  }
  /* One full PLC-style scan: evaluate all rungs against the coil
     state, update coils, repeat until nothing changes. Coils are
     retentive across scans (that is what makes seal-in work). */
  function rrScan(rungs, inputs, coils) {
    var K = { K1: !!coils.K1, K2: !!coils.K2 };
    var lamp = false, short = false, chatter = false, stable = false;
    var iter, r, cond, out;
    for (iter = 0; iter < RR_SCAN_LIMIT && !stable; iter++) {
      stable = true;
      var nK1 = false, nK2 = false, nLamp = false, nShort = false;
      for (r = 0; r < rungs.length; r++) {
        cond = rrRungConducts(rungs[r], inputs, K);
        if (!cond) continue;
        out = RR_OUTPUTS[rungs[r].out];
        if (out === "NONE") nShort = true;
        else if (out === "K1") nK1 = true;
        else if (out === "K2") nK2 = true;
        else if (out === "LAMP") nLamp = true;
      }
      if (nK1 !== K.K1 || nK2 !== K.K2) stable = false;
      K.K1 = nK1; K.K2 = nK2;
      lamp = nLamp; short = nShort;
    }
    if (!stable) chatter = true;
    return { coils: K, lamp: lamp, short: short, chatter: chatter };
  }
  function rrBlankRungs() {
    var rungs = [], r;
    for (r = 0; r < 4; r++) rungs.push({ a: [0, 0, 0], b: [0, 0, 0], out: 0 });
    return rungs;
  }
  function rrComboSteps(fn) {
    var steps = [], a, b, c;
    for (a = 0; a <= 1; a++) for (b = 0; b <= 1; b++) for (c = 0; c <= 1; c++) {
      steps.push({
        inputs: { A: a, B: b, C: c },
        expect: !!fn(a, b, c),
        note: "A=" + a + " B=" + b + " C=" + c
      });
    }
    return steps;
  }
  var RR_SPECS = [
    { id: "bench", tab: "Shift 1", name: "The Bench Light",
      brief: "The pilot lamp must burn only while both pushbuttons A and B are held down. Every other combination stays dark.",
      hint: "One rung, one branch: NO·A and NO·B in series, feeding the LAMP. Contacts in series make an AND.",
      kind: "combo",
      steps: rrComboSteps(function (a, b) { return a && b; }) },
    { id: "cutout", tab: "Shift 2", name: "The Safety Cutout",
      brief: "The lamp must burn when A or C is made, but the B kill switch always wins: any combination with B on stays dark.",
      hint: "Two parallel branches make an OR. Put NC·B in series on both branches so the kill switch breaks each one.",
      kind: "combo",
      steps: rrComboSteps(function (a, b, c) { return (a || c) && !b; }) },
    { id: "xor", tab: "Shift 3", name: "The Mismatch Alarm",
      brief: "Two feed sensors, A and B. The alarm lamp must burn when exactly one of them is on, and stay dark when they agree.",
      hint: "Two rungs into the same lamp: NO·A with NC·B on rung one, NC·A with NO·B on rung two. Both rungs feed LAMP.",
      kind: "combo",
      steps: rrComboSteps(function (a, b) { return (a ? 1 : 0) !== (b ? 1 : 0); }) },
    { id: "latch", tab: "Shift 4", name: "The Conveyor Latch",
      brief: "A is START (momentary), B is STOP (momentary), C is the overload trip. Pressing A must latch the motor on through relay K1 until B or C breaks the seal, and the lamp shows the motor. Steps run in order, and coils stay latched between steps.",
      hint: "Rung 1 drives coil K1 with two parallel branches: NO·A alone on branch a, NO·K1 (the seal-in contact) on branch b, with NC·B and NC·C in series on both. Rung 2 puts NO·K1 in series with the LAMP.",
      kind: "seq",
      steps: [
        { inputs: { A: 0, B: 0, C: 0 }, expect: false, note: "line at rest" },
        { inputs: { A: 1, B: 0, C: 0 }, expect: true,  note: "START pressed" },
        { inputs: { A: 0, B: 0, C: 0 }, expect: true,  note: "seal-in holds" },
        { inputs: { A: 0, B: 0, C: 1 }, expect: false, note: "overload trips" },
        { inputs: { A: 0, B: 0, C: 0 }, expect: false, note: "tripped, stays off" },
        { inputs: { A: 1, B: 0, C: 0 }, expect: true,  note: "restart" },
        { inputs: { A: 0, B: 1, C: 0 }, expect: false, note: "STOP pressed" },
        { inputs: { A: 0, B: 0, C: 0 }, expect: false, note: "line stopped" }
      ] }
  ];
  function rrRunSteps(rungs, spec) {
    var coils = { K1: false, K2: false };
    var results = [], i, st, scan, pass, verdict;
    for (i = 0; i < spec.steps.length; i++) {
      st = spec.steps[i];
      if (spec.kind === "combo") { coils.K1 = false; coils.K2 = false; }
      scan = rrScan(rungs, st.inputs, coils);
      coils = scan.coils;
      if (scan.short) {
        pass = false;
        verdict = "DEAD SHORT: a rung conducts straight across the rails with no load";
      } else if (scan.chatter) {
        pass = false;
        verdict = "CHATTER: a relay is buzzing, the scan never settles";
      } else {
        pass = (scan.lamp === st.expect);
        verdict = pass ? "PASS"
          : ("lamp is " + (scan.lamp ? "ON" : "OFF") + ", spec wants " + (st.expect ? "ON" : "OFF"));
      }
      results.push({ n: i + 1, inputs: st.inputs, note: st.note, expect: st.expect,
        got: scan.lamp, pass: pass, verdict: verdict });
    }
    var all = true, j;
    for (j = 0; j < results.length; j++) { if (!results[j].pass) { all = false; break; } }
    return { results: results, allPass: all };
  }

/* RR-SIM-END */

  /* ---------- relay click audio ---------- */
  var rrAudio = null;
  function rrBlip(freq) {
    try {
      if (!rrAudio) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        rrAudio = new AC();
      }
      var t = rrAudio.currentTime;
      var o = rrAudio.createOscillator();
      var g = rrAudio.createGain();
      o.type = "square";
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.05, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      o.connect(g); g.connect(rrAudio.destination);
      o.start(t); o.stop(t + 0.06);
    } catch (e) { /* audio is a garnish, never a failure */ }
  }

  /* ---------- live state ---------- */
  var S = {
    rungs: rrBlankRungs(),
    inputs: { A: 0, B: 0, C: 0 },
    coils: { K1: false, K2: false },
    power: false,
    specIdx: 0,
    passed: {},
    lastScan: null
  };
  try {
    var raw = rrStoreGet("rrPassedV1");
    if (raw) S.passed = JSON.parse(raw) || {};
  } catch (e) { S.passed = {}; }
  function rrSavePassed() { rrStoreSet("rrPassedV1", JSON.stringify(S.passed)); }

  function rrSpec() { return RR_SPECS[S.specIdx]; }

  function rrRungText(rung, idx) {
    function cells(cs) {
      var parts = [];
      for (var i = 0; i < cs.length; i++) {
        if (cs[i] !== 0) parts.push(RR_PALETTE[cs[i]].label);
      }
      return parts.length ? parts.join(" + ") : "(empty)";
    }
    return "RUNG " + (idx + 1) + ":  branch a: " + cells(rung.a) +
      "  ||  branch b: " + cells(rung.b) + "  -> " + RR_OUTPUTS[rung.out];
  }
  function rrWiringSheet() {
    var lines = [];
    lines.push("RELAY RACK WIRING SHEET");
    lines.push("Garage Inventions: The Relay Rack");
    lines.push("======================================");
    lines.push("Date: " + new Date().toISOString().slice(0, 10));
    lines.push("Rails: left = +24V, right = 0V. Branches are parallel, contacts in series.");
    lines.push("");
    for (var i = 0; i < S.rungs.length; i++) lines.push(rrRungText(S.rungs[i], i));
    lines.push("");
    lines.push("Live inputs: A=" + S.inputs.A + " B=" + S.inputs.B + " C=" + S.inputs.C);
    lines.push("Coils: K1=" + (S.coils.K1 ? "ENERGIZED" : "dropped") +
      " K2=" + (S.coils.K2 ? "ENERGIZED" : "dropped"));
    return lines.join("\n");
  }
  function rrCertificate(spec) {
    var lines = [];
    lines.push("RELAY RACK SHIFT CERTIFICATE");
    lines.push("Garage Inventions: The Relay Rack");
    lines.push("======================================");
    lines.push("Shift : " + spec.tab + ", " + spec.name);
    lines.push("Date  : " + new Date().toISOString().slice(0, 10));
    lines.push("Result: ALL " + spec.steps.length + " STEPS PASSED");
    lines.push("");
    lines.push("Proven wiring:");
    for (var i = 0; i < S.rungs.length; i++) lines.push("  " + rrRungText(S.rungs[i], i));
    lines.push("");
    lines.push("Signed by the foreman. No contact was harmed in this shift.");
    return lines.join("\n");
  }
  function rrDownload(name, text) {
    var blob = new Blob([text], { type: "text/plain" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 400);
  }

  /* ---------- live refresh (power flow + visuals) ---------- */
  function rrRefresh(clicks) {
    var scan = rrScan(S.rungs, S.power ? S.inputs : { A: 0, B: 0, C: 0 }, S.coils);
    if (clicks) {
      if (scan.coils.K1 !== S.coils.K1) rrBlip(scan.coils.K1 ? 1900 : 900);
      if (scan.coils.K2 !== S.coils.K2) setTimeout(function () { rrBlip(scan.coils.K2 ? 1900 : 900); }, 70);
    }
    S.coils = scan.coils;
    S.lastScan = scan;
    var i, r, b, cell;
    for (r = 0; r < 4; r++) {
      var rung = S.rungs[r];
      var cond = S.power && rrRungConducts(rung, S.inputs, S.coils);
      var branches = [["a", rung.a], ["b", rung.b]];
      for (b = 0; b < 2; b++) {
        var bCond = S.power && rrBranchConducts(branches[b][1], S.inputs, S.coils);
        for (i = 0; i < 3; i++) {
          cell = rr$("rrSlot" + r + branches[b][0] + i);
          if (!cell) continue;
          cell.classList.toggle("live", bCond && rrClosed(rung[branches[b][0]][i], S.inputs, S.coils));
          cell.classList.toggle("wire", rung[branches[b][0]][i] === 0);
        }
      }
      var out = rr$("rrOut" + r);
      if (out) out.classList.toggle("live", cond);
    }
    var k1 = rr$("rrCoilK1"), k2 = rr$("rrCoilK2"), lamp = rr$("rrLampChip");
    if (k1) k1.classList.toggle("on", !!S.coils.K1);
    if (k2) k2.classList.toggle("on", !!S.coils.K2);
    if (lamp) lamp.classList.toggle("on", !!scan.lamp);
    var pw = rr$("rrPower");
    if (pw) {
      pw.textContent = S.power ? "POWER: ON" : "POWER: OFF";
      pw.classList.toggle("on", S.power);
    }
    var sws = { A: "rrSwA", B: "rrSwB", C: "rrSwC" };
    for (var k in sws) {
      var sw = rr$(sws[k]);
      if (sw) sw.classList.toggle("on", !!S.inputs[k]);
    }
    var fault = rr$("rrFault");
    if (fault) {
      if (S.power && scan.short) {
        fault.textContent = "FAULT: dead short across the rails. Give that rung a load.";
        fault.className = "rr-fault bad";
      } else if (S.power && scan.chatter) {
        fault.textContent = "FAULT: relay chatter. A coil is fighting its own contact.";
        fault.className = "rr-fault bad";
      } else if (S.power) {
        fault.textContent = "Panel live. Coils are retentive: they hold state until a rung drops them.";
        fault.className = "rr-fault ok";
      } else {
        fault.textContent = "Panel dead. Flip the power to see current flow.";
        fault.className = "rr-fault";
      }
    }
  }

  /* ---------- build ---------- */
  function rrBuild() {
    var box = document.querySelector(".dossier .actions");
    if (!box || rr$("rrBtn")) return;

    var css = [
      ".rr-overlay{position:fixed;inset:0;z-index:9999;background:rgba(4,8,8,.93);display:none;align-items:center;justify-content:center;padding:14px;}",
      ".rr-overlay.open{display:flex;}",
      ".rr-panel{width:min(980px,100%);max-height:94vh;overflow-y:auto;background:#0a1416;border:1px solid var(--cyan);padding:16px;}",
      ".rr-panel h3{font-family:'Chakra Petch',sans-serif;margin:0 0 6px;font-size:24px;letter-spacing:.02em;text-transform:uppercase;color:var(--cyan);}",
      ".rr-sub{font-size:12px;line-height:1.7;color:#9fb3ae;margin:0 0 12px;}",
      ".rr-tabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;}",
      ".rr-tab{flex:1;min-width:120px;min-height:44px;font-family:'Chakra Petch',sans-serif;font-weight:700;font-size:12px;letter-spacing:.05em;text-transform:uppercase;cursor:pointer;background:#0a1416;border:1px solid var(--line);color:var(--ink);}",
      ".rr-tab.active{border-color:var(--cyan);color:var(--cyan);}",
      ".rr-tab.done{border-color:var(--acid);}",
      ".rr-tab.done::after{content:' ✓';color:var(--acid);}",
      ".rr-brief{border:1px dashed var(--cyan);padding:12px 14px;margin-bottom:12px;background:rgba(94,234,255,.05);}",
      ".rr-brief p{margin:0;font-size:12px;line-height:1.7;color:var(--ink);}",
      ".rr-brief strong{color:var(--cyan);}",
      ".rr-rack{border:1px solid var(--line);background:#060b0c;padding:10px;margin-bottom:10px;}",
      ".rr-rails{display:flex;justify-content:space-between;font-family:monospace;font-size:10px;color:#7c8d89;letter-spacing:.12em;text-transform:uppercase;padding:0 4px 6px;}",
      ".rr-rung{border:1px solid var(--line);margin-bottom:8px;padding:8px;background:var(--panel-2);}",
      ".rr-runghead{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;}",
      ".rr-runghead .t{font-family:'Chakra Petch',sans-serif;font-size:13px;font-weight:700;letter-spacing:.08em;color:var(--ink);}",
      ".rr-out{min-height:44px;min-width:110px;padding:8px 10px;font-family:monospace;font-weight:700;font-size:13px;cursor:pointer;background:#0a1416;border:1px solid var(--line);color:var(--ink);}",
      ".rr-out.live{border-color:var(--acid);color:var(--acid);box-shadow:0 0 10px rgba(199,255,56,.25);}",
      ".rr-branch{display:grid;grid-template-columns:26px repeat(3,minmax(0,1fr));gap:6px;margin-bottom:6px;}",
      ".rr-branch:last-child{margin-bottom:0;}",
      ".rr-blabel{font-family:monospace;font-size:11px;color:#7c8d89;align-self:center;text-align:center;}",
      ".rr-slot{min-height:48px;padding:8px 4px;font-family:monospace;font-weight:700;font-size:12px;cursor:pointer;background:#0a1416;border:1px solid var(--line);color:var(--ink);touch-action:manipulation;}",
      ".rr-slot.wire{color:#5c6f6b;font-weight:400;}",
      ".rr-slot.live{border-color:var(--acid);color:var(--acid);box-shadow:0 0 8px rgba(199,255,56,.3);}",
      ".rr-mini{min-height:36px;padding:4px 10px;font-family:monospace;font-size:11px;cursor:pointer;background:transparent;border:1px solid var(--line);color:#7c8d89;}",
      ".rr-switches{display:flex;gap:8px;flex-wrap:wrap;align-items:stretch;margin-bottom:10px;}",
      ".rr-sw{flex:1;min-width:90px;min-height:56px;font-family:'Chakra Petch',sans-serif;font-weight:700;font-size:14px;cursor:pointer;background:#0a1416;border:1px solid var(--line);color:var(--ink);touch-action:manipulation;}",
      ".rr-sw.on{border-color:var(--orange);color:var(--orange);}",
      ".rr-sw.power.on{border-color:var(--acid);color:var(--acid);}",
      ".rr-chips{display:flex;gap:8px;flex:1 1 100%;flex-wrap:wrap;}",
      ".rr-chip{flex:1;min-width:90px;text-align:center;border:1px solid var(--line);padding:8px;font-family:monospace;font-size:12px;color:#5c6f6b;background:var(--panel-2);}",
      ".rr-chip.on{border-color:var(--acid);color:var(--acid);}",
      ".rr-chip.lamp.on{background:rgba(199,255,56,.12);}",
      ".rr-fault{font-family:monospace;font-size:12px;padding:10px 12px;border:1px solid var(--line);margin-bottom:10px;color:#9fb3ae;line-height:1.6;}",
      ".rr-fault.bad{border-color:#ff4668;color:#ff8ba0;}",
      ".rr-fault.ok{border-color:var(--acid);color:var(--acid);}",
      ".rr-actions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:10px;}",
      ".rr-big{min-height:52px;padding:10px 8px;font-family:'Chakra Petch',sans-serif;font-weight:700;font-size:12px;letter-spacing:.05em;text-transform:uppercase;cursor:pointer;background:#0a1416;border:1px solid var(--line);color:var(--ink);touch-action:manipulation;}",
      ".rr-big.accent{border-color:var(--acid);color:var(--acid);}",
      ".rr-big:disabled{opacity:.35;cursor:default;}",
      ".rr-hint{border:1px dashed var(--orange);padding:12px 14px;margin-bottom:10px;font-size:12px;line-height:1.7;color:var(--ink);background:rgba(255,107,44,.05);}",
      ".rr-hint strong{color:var(--orange);}",
      ".rr-results{margin-bottom:10px;}",
      ".rr-resrow{display:grid;grid-template-columns:44px 1fr auto;gap:10px;font-family:monospace;font-size:12px;padding:8px 10px;border:1px solid var(--line);margin-bottom:6px;color:var(--ink);line-height:1.5;}",
      ".rr-resrow.pass{border-color:var(--acid);}",
      ".rr-resrow.fail{border-color:#ff4668;}",
      ".rr-resrow .v{font-weight:700;}",
      ".rr-resrow.pass .v{color:var(--acid);}",
      ".rr-resrow.fail .v{color:#ff8ba0;}",
      ".rr-sum{font-family:monospace;font-size:13px;padding:10px 12px;border:1px solid var(--line);margin-bottom:6px;color:var(--ink);line-height:1.6;}",
      ".rr-sum.win{border-color:var(--acid);color:var(--acid);}",
      ".rr-sum.lose{border-color:#ff4668;color:#ff8ba0;}",
      ".rr-foot{font-size:11px;color:#7c8d89;line-height:1.7;font-family:monospace;}",
      "@media (max-width:640px){.rr-actions{grid-template-columns:1fr;}.rr-resrow{grid-template-columns:1fr;gap:2px;}}"
    ].join("\n");
    var st = document.createElement("style");
    st.textContent = css;
    document.head.appendChild(st);

    var b = rrEl("button", "secondary", "Run the Relay Rack");
    b.id = "rrBtn";
    box.appendChild(b);

    var ov = rrEl("div", "rr-overlay");
    ov.id = "rrOverlay";

    var tabsHtml = "";
    for (var ti = 0; ti < RR_SPECS.length; ti++) {
      tabsHtml += "<button class=\"rr-tab\" data-spec=\"" + ti + "\">" + rrEsc(RR_SPECS[ti].tab) + "</button>";
    }

    var rackHtml = "<div class=\"rr-rails\"><span>+24V rail</span><span>0V rail</span></div>";
    for (var r = 0; r < 4; r++) {
      rackHtml += "<div class=\"rr-rung\">" +
        "<div class=\"rr-runghead\"><span class=\"t\">RUNG " + (r + 1) + "</span>" +
        "<span><button class=\"rr-out\" id=\"rrOut" + r + "\">NONE</button> " +
        "<button class=\"rr-mini\" data-clear=\"" + r + "\">clear</button></span></div>";
      var brs = [["a", "a"], ["b", "b"]];
      for (var bb = 0; bb < 2; bb++) {
        rackHtml += "<div class=\"rr-branch\"><span class=\"rr-blabel\">" + brs[bb][0] + "</span>";
        for (var i = 0; i < 3; i++) {
          rackHtml += "<button class=\"rr-slot wire\" id=\"rrSlot" + r + brs[bb][1] + i + "\">WIRE</button>";
        }
        rackHtml += "</div>";
      }
      rackHtml += "</div>";
    }

    ov.innerHTML =
      "<div class=\"rr-panel\" role=\"dialog\" aria-label=\"The Relay Rack relay panel game\">" +
      "<h3>The Relay Rack</h3>" +
      "<p class=\"rr-sub\">A ladder-logic relay panel, wired by hand. Tap any contact slot to cycle parts " +
      "(NO and NC contacts for inputs A, B, C and relays K1, K2), tap an output to choose NONE, a coil, or the pilot lamp. " +
      "Two branches per rung sit in parallel. Flip the power to watch current flow, then run the shift test to prove the spec.</p>" +
      "<div class=\"rr-tabs\" id=\"rrTabs\">" + tabsHtml + "</div>" +
      "<div class=\"rr-brief\" id=\"rrBrief\"></div>" +
      "<div class=\"rr-rack\">" + rackHtml + "</div>" +
      "<div class=\"rr-switches\">" +
      "<button class=\"rr-sw\" id=\"rrSwA\">A</button>" +
      "<button class=\"rr-sw\" id=\"rrSwB\">B</button>" +
      "<button class=\"rr-sw\" id=\"rrSwC\">C</button>" +
      "<button class=\"rr-sw power\" id=\"rrPower\">POWER: OFF</button>" +
      "<div class=\"rr-chips\">" +
      "<div class=\"rr-chip\" id=\"rrCoilK1\">K1 COIL</div>" +
      "<div class=\"rr-chip\" id=\"rrCoilK2\">K2 COIL</div>" +
      "<div class=\"rr-chip lamp\" id=\"rrLampChip\">PILOT LAMP</div>" +
      "</div></div>" +
      "<div class=\"rr-fault\" id=\"rrFault\"></div>" +
      "<div class=\"rr-actions\">" +
      "<button class=\"rr-big accent\" id=\"rrTest\">Run the shift test</button>" +
      "<button class=\"rr-big\" id=\"rrHintBtn\">Foreman's hint</button>" +
      "<button class=\"rr-big\" id=\"rrResetCoils\">Reset coils</button>" +
      "<button class=\"rr-big\" id=\"rrClearRack\">Clear rack</button>" +
      "<button class=\"rr-big\" id=\"rrSheet\">Wiring sheet</button>" +
      "<button class=\"rr-big\" id=\"rrCert\" disabled>Shift certificate</button>" +
      "</div>" +
      "<div class=\"rr-hint\" id=\"rrHint\" hidden></div>" +
      "<div class=\"rr-results\" id=\"rrResults\"></div>" +
      "<p class=\"rr-foot\">The panel scans like a real PLC: every rung is evaluated, coils update together, " +
      "and the scan repeats until nothing changes. Coils hold their state between scans, which is exactly " +
      "what makes a seal-in latch possible. A rung that conducts with no load is a dead short. A coil that " +
      "fights its own contact buzzes forever: that is chatter, and the foreman fails it on the spot.</p>" +
      "<div class=\"rr-actions\"><button class=\"rr-big\" id=\"rrClose\">Close the panel</button></div>" +
      "</div>";
    document.body.appendChild(ov);

    function rrShowSpec() {
      var spec = rrSpec();
      rr$("rrBrief").innerHTML = "<p><strong>" + rrEsc(spec.tab + ": " + spec.name) + ".</strong> " +
        rrEsc(spec.brief) + " (" + spec.steps.length + " steps.)</p>";
      var hint = rr$("rrHint");
      hint.hidden = true;
      hint.innerHTML = "<strong>Foreman's hint:</strong> " + rrEsc(spec.hint);
      var tabs = ov.querySelectorAll(".rr-tab");
      for (var i = 0; i < tabs.length; i++) {
        tabs[i].classList.toggle("active", i === S.specIdx);
        tabs[i].classList.toggle("done", !!S.passed[RR_SPECS[i].id]);
      }
      rr$("rrCert").disabled = !S.passed[spec.id];
      rr$("rrResults").innerHTML = "";
    }

    function rrClose() {
      ov.classList.remove("open");
      S.power = false;
      rrRefresh(false);
    }

    function rrRunTest() {
      var spec = rrSpec();
      var res = rrRunSteps(S.rungs, spec);
      var box2 = rr$("rrResults");
      var html = "";
      for (var i = 0; i < res.results.length; i++) {
        var r = res.results[i];
        html += "<div class=\"rr-resrow " + (r.pass ? "pass" : "fail") + "\">" +
          "<span>#" + r.n + "</span>" +
          "<span>" + rrEsc(r.note) + " &middot; want " + (r.expect ? "ON" : "OFF") +
          ", got " + (r.got ? "ON" : "OFF") + "<br>" + rrEsc(r.verdict) + "</span>" +
          "<span class=\"v\">" + (r.pass ? "PASS" : "FAIL") + "</span></div>";
      }
      var n = res.results.length, ok = 0;
      for (var j = 0; j < res.results.length; j++) { if (res.results[j].pass) ok++; }
      if (res.allPass) {
        html += "<div class=\"rr-sum win\">SHIFT COMPLETE: " + ok + "/" + n +
          " steps passed. The foreman signs the certificate.</div>";
        if (!S.passed[spec.id]) {
          S.passed[spec.id] = true;
          rrSavePassed();
        }
        rrBlip(2400);
        rrToast("Shift complete: " + spec.name);
      } else {
        html += "<div class=\"rr-sum lose\">SHIFT FAILED: " + ok + "/" + n +
          " steps passed. Rewire and run it again.</div>";
        rrBlip(300);
      }
      box2.innerHTML = html;
      rrShowSpec();
      if (res.allPass && S.specIdx < RR_SPECS.length - 1) {
        setTimeout(function () {
          if (rr$("rrOverlay").classList.contains("open")) rrToast("Next shift is on the tabs above");
        }, 1200);
      }
    }

    /* wire the rack */
    var rr2, bb2, ii2;
    for (rr2 = 0; rr2 < 4; rr2++) {
      (function (r) {
        var out = rr$("rrOut" + r);
        out.addEventListener("click", function () {
          S.rungs[r].out = (S.rungs[r].out + 1) % RR_OUTPUTS.length;
          out.textContent = RR_OUTPUTS[S.rungs[r].out];
          rrRefresh(true);
        });
      })(rr2);
      var branches = ["a", "b"];
      for (bb2 = 0; bb2 < 2; bb2++) {
        (function (r, br) {
          for (var i = 0; i < 3; i++) {
            (function (r2, br2, i2) {
              var cell = rr$("rrSlot" + r2 + br2 + i2);
              cell.addEventListener("click", function () {
                var cur = S.rungs[r2][br2][i2];
                var nxt = (cur + 1) % RR_PALETTE.length;
                S.rungs[r2][br2][i2] = nxt;
                cell.textContent = RR_PALETTE[nxt].label;
                rrRefresh(true);
              });
            })(r, br, i);
          }
        })(rr2, branches[bb2]);
      }
    }

    var clears = ov.querySelectorAll("[data-clear]");
    for (var ci = 0; ci < clears.length; ci++) {
      (function (btn) {
        btn.addEventListener("click", function () {
          var r = parseInt(btn.getAttribute("data-clear"), 10);
          S.rungs[r] = { a: [0, 0, 0], b: [0, 0, 0], out: 0 };
          rr$("rrOut" + r).textContent = "NONE";
          var brs = ["a", "b"], i;
          for (var bb = 0; bb < 2; bb++) for (i = 0; i < 3; i++) {
            rr$("rrSlot" + r + brs[bb] + i).textContent = "WIRE";
          }
          rrRefresh(true);
        });
      })(clears[ci]);
    }

    var tabs = ov.querySelectorAll(".rr-tab");
    for (var tbi = 0; tbi < tabs.length; tbi++) {
      (function (btn, idx) {
        btn.addEventListener("click", function () {
          S.specIdx = idx;
          rrShowSpec();
        });
      })(tabs[tbi], tbi);
    }

    function rrFlipSw(k, id) {
      rr$(id).addEventListener("click", function () {
        S.inputs[k] = S.inputs[k] ? 0 : 1;
        rrRefresh(true);
      });
    }
    rrFlipSw("A", "rrSwA"); rrFlipSw("B", "rrSwB"); rrFlipSw("C", "rrSwC");
    rr$("rrPower").addEventListener("click", function () {
      S.power = !S.power;
      rrBlip(S.power ? 1400 : 700);
      rrRefresh(true);
    });
    rr$("rrTest").addEventListener("click", rrRunTest);
    rr$("rrHintBtn").addEventListener("click", function () {
      var h = rr$("rrHint");
      h.hidden = !h.hidden;
    });
    rr$("rrResetCoils").addEventListener("click", function () {
      S.coils = { K1: false, K2: false };
      rrRefresh(true);
      rrToast("Coils dropped");
    });
    rr$("rrClearRack").addEventListener("click", function () {
      S.rungs = rrBlankRungs();
      S.coils = { K1: false, K2: false };
      for (var r = 0; r < 4; r++) {
        rr$("rrOut" + r).textContent = "NONE";
        var brs = ["a", "b"], i;
        for (var bb = 0; bb < 2; bb++) for (i = 0; i < 3; i++) {
          rr$("rrSlot" + r + brs[bb] + i).textContent = "WIRE";
        }
      }
      rrRefresh(true);
      rrToast("Rack cleared");
    });
    rr$("rrSheet").addEventListener("click", function () {
      rrDownload("relay-rack-wiring.txt", rrWiringSheet());
      rrToast("Wiring sheet downloaded");
    });
    rr$("rrCert").addEventListener("click", function () {
      var spec = rrSpec();
      if (!S.passed[spec.id]) return;
      rrDownload("relay-rack-" + spec.id + "-certificate.txt", rrCertificate(spec));
      rrToast("Certificate downloaded");
    });
    rr$("rrClose").addEventListener("click", rrClose);
    ov.addEventListener("click", function (e) { if (e.target === ov) rrClose(); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && ov.classList.contains("open")) rrClose();
    });

    b.addEventListener("click", function () {
      ov.classList.add("open");
      rrShowSpec();
      rrRefresh(false);
    });

    rrShowSpec();
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", rrBuild);
    } else {
      rrBuild();
    }
  }

  /* node test hook: harmless in the browser */
  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      RR: {
        PALETTE: RR_PALETTE,
        OUTPUTS: RR_OUTPUTS,
        SPECS: RR_SPECS,
        blankRungs: rrBlankRungs,
        scan: rrScan,
        runSteps: rrRunSteps,
        rungText: rrRungText
      }
    };
  }

})();
/* ============================================================
   THE PAINT BOOTH
   An automotive paint mixing and spraying bench. Mix six toners
   to match the target chip (live delta-E in CIELAB), set gun
   distance, travel speed, and coats, then spray the panel. Film
   build must land inside spec, with no runs, no dry spray, and
   no mottling on metallics. Three jobs, graded separately, with
   a downloadable spray ticket when all three pass.
   Self-contained IIFE, local helpers only, no page globals.
   ============================================================ */
(function () {

  /* ---------- tiny local helpers (no reliance on page globals) ---------- */
  var pb$ = function (id) { return document.getElementById(id); };
  function pbEl(tag, cls, html) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (html != null) d.innerHTML = html;
    return d;
  }
  function pbToast(msg) {
    if (typeof window.showToast === "function") { window.showToast(msg); return; }
    var t = pb$("toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(function () { t.classList.remove("show"); }, 1800);
  }
  function pbCss(c) {
    return "#" + ((1 << 24) + (Math.round(c[0]) << 16) + (Math.round(c[1]) << 8) + Math.round(c[2])).toString(16).slice(1);
  }

  /* ---------- pure color and spray model (testable, no DOM) ---------- */
  var PB_TONERS = [
    { name: "Bright White", rgb: [242, 242, 238] },
    { name: "Jet Black",    rgb: [14, 14, 16] },
    { name: "Torch Red",    rgb: [198, 24, 28] },
    { name: "Sun Yellow",   rgb: [244, 196, 24] },
    { name: "Cobalt Blue",  rgb: [28, 62, 178] },
    { name: "Glacier Pearl", rgb: [206, 224, 232] }
  ];
  var PB_JOBS = [
    { name: "Job 1: Shop Black",
      desc: "Solid gloss black, fleet work. Match within 2.5 delta-E and lay 4.0 to 6.0 mils dry.",
      target: [18, 18, 20], maxDE: 2.5, filmLo: 4.0, filmHi: 6.0, metallic: false },
    { name: "Job 2: Torch Red",
      desc: "Metallic red, show car. Match within 1.5 delta-E and lay 4.0 to 6.0 mils dry. Metallics mottle if you crowd the gun under 14 cm.",
      target: [178, 30, 34], maxDE: 1.5, filmLo: 4.0, filmHi: 6.0, metallic: true },
    { name: "Job 3: Pearl Mist",
      desc: "Tri-stage pearl, concours. Match within 1.0 delta-E and lay 5.0 to 7.0 mils dry. No room for error.",
      target: [214, 226, 232], maxDE: 1.0, filmLo: 5.0, filmHi: 7.0, metallic: true }
  ];

  function pbMix(parts) {
    var t = 0, r = 0, g = 0, b = 0, i;
    for (i = 0; i < PB_TONERS.length; i++) t += Math.max(0, parts[i] || 0);
    if (t <= 0) return [150, 150, 150];
    for (i = 0; i < PB_TONERS.length; i++) {
      var p = parts[i] || 0;
      r += PB_TONERS[i].rgb[0] * p;
      g += PB_TONERS[i].rgb[1] * p;
      b += PB_TONERS[i].rgb[2] * p;
    }
    return [r / t, g / t, b / t];
  }

  function pbRgbToLab(rgb) {
    function lin(c) {
      c /= 255;
      return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }
    function f(t) { return t > 0.008856 ? Math.pow(t, 1 / 3) : (7.787 * t) + 16 / 116; }
    var r = lin(rgb[0]), g = lin(rgb[1]), b = lin(rgb[2]);
    var fx = f((r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047);
    var fy = f(r * 0.2126 + g * 0.7152 + b * 0.0722);
    var fz = f((r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  }

  function pbDeltaE(a, b) {
    var la = pbRgbToLab(a), lb = pbRgbToLab(b);
    var dl = la[0] - lb[0], da = la[1] - lb[1], db = la[2] - lb[2];
    return Math.sqrt(dl * dl + da * da + db * db);
  }

  function pbSpray(distance, speed, coats) {
    var te = 0.95 - 0.025 * (distance - 15);
    te = Math.max(0.35, Math.min(0.95, te));
    var wetPerCoat = 3.0 * (15 / distance) * (25 / speed) * (te / 0.8);
    var dryTotal = wetPerCoat * coats * 0.55;
    var defects = [];
    if (wetPerCoat > 3.4) defects.push("runs");
    if (distance > 25 || speed > 33) defects.push("dry spray");
    return { wetPerCoat: wetPerCoat, dryTotal: dryTotal, te: te, defects: defects };
  }

  function pbGrade(job, parts, distance, speed, coats) {
    var mix = pbMix(parts);
    var de = pbDeltaE(mix, job.target);
    var s = pbSpray(distance, speed, coats);
    var notes = [];
    var pass = true;
    if (de > job.maxDE) {
      pass = false;
      notes.push("color off at " + de.toFixed(2) + " delta-E (needs " + job.maxDE.toFixed(1) + " or less)");
    }
    if (s.dryTotal < job.filmLo || s.dryTotal > job.filmHi) {
      pass = false;
      notes.push("film build " + s.dryTotal.toFixed(1) + " mils dry, spec is " + job.filmLo.toFixed(1) + " to " + job.filmHi.toFixed(1));
    }
    if (s.defects.indexOf("runs") >= 0) {
      pass = false;
      notes.push("runs: too wet, back the gun off or move faster");
    }
    if (s.defects.indexOf("dry spray") >= 0) {
      pass = false;
      notes.push("dry spray: too far or too fast, move in closer and slow down");
    }
    if (job.metallic && distance < 14) {
      pass = false;
      notes.push("mottling: metallics hate a crowded gun, hold 14 cm or more");
    }
    return { pass: pass, de: de, film: s.dryTotal, te: s.te, notes: notes, mix: mix };
  }

  /* ---------- state ---------- */
  var pbJobIdx = 0;
  var pbParts = [17, 17, 17, 17, 16, 16];
  var pbDistance = 18, pbSpeed = 25, pbCoats = 3;
  var pbPass = [false, false, false];
  var pbResults = [null, null, null];
  var pbPanel = [150, 150, 150];
  var pbSpraying = false;

  /* ---------- styles ---------- */
  var PB_CSS = [
    ".pb-overlay{position:fixed;inset:0;z-index:9999;background:rgba(4,8,8,.92);display:none;align-items:center;justify-content:center;padding:16px;}",
    ".pb-overlay.open{display:flex;}",
    ".pb-panel{width:min(920px,100%);max-height:94vh;overflow-y:auto;background:#0a1416;border:1px solid var(--acid);padding:16px;}",
    ".pb-panel h3{margin:0 0 4px;font-family:'Chakra Petch',sans-serif;text-transform:uppercase;letter-spacing:.02em;}",
    ".pb-sub{font-size:11px;color:#7c8d89;margin:0 0 12px;text-transform:uppercase;letter-spacing:.1em;line-height:1.7;}",
    ".pb-tabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;}",
    ".pb-tabs button{min-height:44px;padding:10px 14px;font-family:'Chakra Petch',sans-serif;font-weight:700;font-size:11px;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;background:#0a1416;border:1px solid var(--line);color:#72827f;}",
    ".pb-tabs button.on{border-color:var(--acid);color:var(--acid);}",
    ".pb-tabs button.done{border-color:var(--cyan);color:var(--cyan);}",
    ".pb-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;}",
    ".pb-card{border:1px solid var(--line);background:var(--panel-2);padding:12px;}",
    ".pb-card h5{margin:0 0 8px;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--cyan);font-weight:600;}",
    ".pb-chips{display:flex;gap:10px;margin-bottom:10px;}",
    ".pb-chip{flex:1;text-align:center;}",
    ".pb-chip .sw{height:52px;border:1px solid var(--line);margin-bottom:4px;}",
    ".pb-chip p{margin:0;font-size:10px;color:#7c8d89;text-transform:uppercase;letter-spacing:.1em;}",
    ".pb-de{font-family:monospace;font-size:13px;color:var(--ink);margin:0 0 10px;}",
    ".pb-de.good{color:var(--acid);}",
    ".pb-de.bad{color:#ff8ba0;}",
    ".pb-row{margin-bottom:8px;}",
    ".pb-row label{display:flex;justify-content:space-between;font-size:11px;color:#7c8d89;text-transform:uppercase;letter-spacing:.08em;margin-bottom:2px;}",
    ".pb-row label span{font-family:monospace;color:var(--ink);}",
    ".pb-row input[type=range]{width:100%;min-height:44px;accent-color:var(--acid);}",
    ".pb-film{font-family:monospace;font-size:12px;line-height:1.7;color:var(--ink);}",
    ".pb-film .warn{color:var(--orange);}",
    ".pb-film .bad{color:#ff8ba0;}",
    ".pb-film .good{color:var(--acid);}",
    ".pb-stage{border:1px solid var(--line);background:#060b0c;margin-bottom:12px;}",
    ".pb-stage canvas{display:block;width:100%;height:230px;}",
    ".pb-result{padding:10px 12px;font-size:13px;font-family:monospace;border:1px solid var(--line);min-height:20px;line-height:1.7;margin-bottom:10px;}",
    ".pb-result.win{border-color:var(--acid);color:var(--acid);}",
    ".pb-result.fail{border-color:#ff4668;color:#ff8ba0;}",
    ".pb-foot{display:flex;gap:8px;flex-wrap:wrap;}",
    ".pb-foot button{min-height:44px;padding:10px 14px;font-family:'Chakra Petch',sans-serif;font-weight:700;font-size:11px;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;}",
    ".pb-foot .go{background:var(--acid);border:1px solid var(--acid);color:#06110c;flex:2;}",
    ".pb-foot .go:disabled{opacity:.35;cursor:default;}",
    ".pb-foot .ghost{background:#0a1416;border:1px solid var(--line);color:#72827f;flex:1;}",
    "@media (max-width:640px){.pb-grid{grid-template-columns:1fr;}}"
  ].join("\n");

  /* ---------- booth animation ---------- */
  var pbCanvas = null, pbCtx = null, pbParts2 = [], pbGunX = 0, pbGunDir = 1, pbAnimId = null;

  function pbDrawBooth() {
    if (!pbCtx || !pbCanvas) return;
    var W = pbCanvas.width, H = pbCanvas.height;
    pbCtx.clearRect(0, 0, W, H);
    pbCtx.fillStyle = "#060b0c";
    pbCtx.fillRect(0, 0, W, H);
    var pw = W * 0.52, ph = H * 0.52, px = (W - pw) / 2, py = H * 0.30;
    pbCtx.fillStyle = pbCss(pbPanel);
    pbCtx.fillRect(px, py, pw, ph);
    pbCtx.strokeStyle = "#2a3a38";
    pbCtx.strokeRect(px, py, pw, ph);
    var gx = px + pbGunX * pw, gy = py - 26;
    pbCtx.fillStyle = "#9aa8a4";
    pbCtx.fillRect(gx - 5, gy - 8, 10, 16);
    if (pbSpraying) {
      pbCtx.fillStyle = "rgba(190,220,215,.18)";
      pbCtx.beginPath();
      pbCtx.moveTo(gx, gy + 8);
      pbCtx.lineTo(gx - 26, py);
      pbCtx.lineTo(gx + 26, py);
      pbCtx.closePath();
      pbCtx.fill();
    }
    var i, p;
    for (i = pbParts2.length - 1; i >= 0; i--) {
      p = pbParts2[i];
      p.x += p.vx; p.y += p.vy; p.life -= 1;
      if (p.life <= 0) { pbParts2.splice(i, 1); continue; }
      pbCtx.fillStyle = p.color;
      pbCtx.fillRect(p.x, p.y, 2, 2);
    }
    pbCtx.fillStyle = "#3d4f4c";
    pbCtx.font = "10px monospace";
    pbCtx.fillText("BOOTH 3", 8, 14);
  }

  function pbAnimLoop() {
    if (!pbCanvas || !pb$("pbOverlay") || !pb$("pbOverlay").classList.contains("open")) {
      pbAnimId = null;
      return;
    }
    pbGunX += 0.008 * pbGunDir;
    if (pbGunX > 1) { pbGunX = 1; pbGunDir = -1; }
    if (pbGunX < 0) { pbGunX = 0; pbGunDir = 1; }
    if (pbSpraying && pbParts2.length < 220) {
      var W = pbCanvas.width, H = pbCanvas.height;
      var pw = W * 0.52, px = (W - pw) / 2, py = H * 0.30;
      var gx = px + pbGunX * pw;
      var mixCss = pbCss(pbMix(pbParts));
      for (var k = 0; k < 4; k++) {
        pbParts2.push({
          x: gx + (Math.random() - 0.5) * 10,
          y: py - 18,
          vx: (Math.random() - 0.5) * 1.6,
          vy: 1 + Math.random() * 2,
          life: 26 + Math.random() * 14,
          color: mixCss
        });
      }
    }
    pbDrawBooth();
    pbAnimId = requestAnimationFrame(pbAnimLoop);
  }

  function pbKickAnim() {
    if (pbAnimId == null && typeof requestAnimationFrame === "function") {
      pbAnimLoop();
    } else {
      pbDrawBooth();
    }
  }

  /* ---------- ui construction ---------- */
  var pbEls = {};

  function pbSliderRow(label, min, max, step, val, fmt, oninput) {
    var row = pbEl("div", "pb-row");
    var lab = pbEl("label", "", label + "<span></span>");
    var span = lab.querySelector("span");
    var input = pbEl("input");
    input.type = "range";
    input.min = min; input.max = max; input.step = step; input.value = val;
    function upd() {
      span.textContent = fmt(parseFloat(input.value));
      oninput(parseFloat(input.value));
    }
    input.addEventListener("input", upd);
    upd();
    row.appendChild(lab);
    row.appendChild(input);
    return { row: row, input: input, set: function (v) { input.value = v; upd(); } };
  }

  function pbRefresh() {
    var job = PB_JOBS[pbJobIdx];
    var mix = pbMix(pbParts);
    var de = pbDeltaE(mix, job.target);
    var s = pbSpray(pbDistance, pbSpeed, pbCoats);
    pbEls.mixSw.style.background = pbCss(mix);
    pbEls.targetSw.style.background = pbCss(job.target);
    pbEls.deLine.textContent = "color match: " + de.toFixed(2) + " delta-E (needs " + job.maxDE.toFixed(1) + " or less)";
    pbEls.deLine.className = "pb-de " + (de <= job.maxDE ? "good" : "bad");
    var html = "transfer efficiency: " + Math.round(s.te * 100) + "%<br>" +
      "wet per coat: " + s.wetPerCoat.toFixed(2) + " mils<br>" +
      "total dry: <span class=\"" + (s.dryTotal >= job.filmLo && s.dryTotal <= job.filmHi ? "good" : "bad") + "\">" +
      s.dryTotal.toFixed(1) + " mils</span> (spec " + job.filmLo.toFixed(1) + " to " + job.filmHi.toFixed(1) + ")";
    if (s.defects.length || (job.metallic && pbDistance < 14)) {
      var warns = s.defects.slice();
      if (job.metallic && pbDistance < 14) warns.push("mottling risk");
      html += "<br><span class=\"warn\">warning: " + warns.join(", ") + "</span>";
    }
    pbEls.filmLine.innerHTML = html;
    pbEls.jobDesc.textContent = job.desc;
  }

  function pbSelectJob(i) {
    pbJobIdx = i;
    var tabs = pbEls.tabs.querySelectorAll("button");
    for (var k = 0; k < tabs.length; k++) {
      tabs[k].className = (k === i ? "on" : "") + (pbPass[k] ? " done" : "");
      tabs[k].className = tabs[k].className.trim();
    }
    pbRefresh();
    pbShowResult();
  }

  function pbShowResult() {
    var r = pbResults[pbJobIdx];
    var box = pbEls.result;
    if (!r) {
      box.className = "pb-result";
      box.textContent = "No spray yet on this job. Mix, set the gun, and spray the panel.";
      return;
    }
    box.className = "pb-result " + (r.pass ? "win" : "fail");
    var t = (r.pass ? "PASS" : "FAIL") + " " + PB_JOBS[pbJobIdx].name +
      " (delta-E " + r.de.toFixed(2) + ", film " + r.film.toFixed(1) + " mils)";
    if (r.notes.length) t += "\n" + r.notes.join("\n");
    box.textContent = t;
  }

  function pbCheckTicket() {
    var all = pbPass[0] && pbPass[1] && pbPass[2];
    pbEls.ticket.disabled = !all;
    if (all) pbToast("All three jobs passed, spray ticket unlocked");
  }

  function pbSprayPanel() {
    if (pbSpraying) return;
    pbSpraying = true;
    pbEls.spray.disabled = true;
    pbPanel = [150, 150, 150];
    pbKickAnim();
    var coatsDone = 0;
    var mix = pbMix(pbParts);
    var step = setInterval(function () {
      coatsDone++;
      for (var i = 0; i < 3; i++) {
        pbPanel[i] = pbPanel[i] + (mix[i] - pbPanel[i]) * 0.55;
      }
      pbDrawBooth();
      if (coatsDone >= pbCoats) {
        clearInterval(step);
        pbSpraying = false;
        pbEls.spray.disabled = false;
        var r = pbGrade(PB_JOBS[pbJobIdx], pbParts, pbDistance, pbSpeed, pbCoats);
        pbResults[pbJobIdx] = r;
        if (r.pass) pbPass[pbJobIdx] = true;
        pbShowResult();
        pbSelectJob(pbJobIdx);
        pbCheckTicket();
        pbToast(r.pass ? "Panel passed" : "Panel failed, check the notes");
      }
    }, 650);
  }

  function pbTicket() {
    var d = new Date();
    var lines = [
      "PAINT BOOTH SPRAY TICKET",
      "Garage Inventions paint booth, " + d.toISOString().slice(0, 10),
      ""
    ];
    for (var i = 0; i < 3; i++) {
      var r = pbResults[i];
      lines.push(PB_JOBS[i].name + ": " + (r && r.pass ? "PASS" : "FAIL") +
        " (delta-E " + (r ? r.de.toFixed(2) : "-") + ", film " + (r ? r.film.toFixed(1) : "-") + " mils)");
    }
    lines.push("", "Signed: the booth");
    var blob = new Blob([lines.join("\n")], { type: "text/plain" });
    var a = pbEl("a");
    a.href = URL.createObjectURL(blob);
    a.download = "paint-booth-spray-ticket.txt";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 4000);
    pbToast("Spray ticket downloaded");
  }

  function pbReset() {
    pbParts = [17, 17, 17, 17, 16, 16];
    pbDistance = 18; pbSpeed = 25; pbCoats = 3;
    pbPanel = [150, 150, 150];
    for (var i = 0; i < pbEls.tonerInputs.length; i++) pbEls.tonerInputs[i].set(pbParts[i]);
    pbEls.distSet(pbDistance);
    pbEls.speedSet(pbSpeed);
    pbEls.coatsSet(pbCoats);
    pbRefresh();
  }

  function pbBuild() {
    var box = document.querySelector(".dossier .actions");
    if (!box || pb$("pbBtn")) return;

    var st = document.createElement("style");
    st.textContent = PB_CSS;
    document.head.appendChild(st);

    var b = pbEl("button", "secondary", "Open the Paint Booth");
    b.id = "pbBtn";
    b.addEventListener("click", function () {
      pb$("pbOverlay").classList.add("open");
      pbKickAnim();
      pbRefresh();
    });
    box.appendChild(b);

    var ov = pbEl("div", "pb-overlay");
    ov.id = "pbOverlay";
    var panel = pbEl("div", "pb-panel");
    panel.innerHTML =
      "<h3>The Paint Booth</h3>" +
      '<p class="pb-sub">Mix toners to match the chip, set the gun, spray the panel. Color is scored in delta-E, film build in mils, defects fail the job.</p>';
    ov.appendChild(panel);
    document.body.appendChild(ov);

    var tabs = pbEl("div", "pb-tabs");
    pbEls.tabs = tabs;
    for (var ti = 0; ti < 3; ti++) {
      (function (idx) {
        var t = pbEl("button", idx === 0 ? "on" : "", PB_JOBS[idx].name);
        t.addEventListener("click", function () { pbSelectJob(idx); });
        tabs.appendChild(t);
      })(ti);
    }
    panel.appendChild(tabs);
    pbEls.jobDesc = pbEl("p", "pb-sub", "");
    panel.appendChild(pbEls.jobDesc);

    var grid = pbEl("div", "pb-grid");
    panel.appendChild(grid);

    var lab = pbEl("div", "pb-card");
    lab.innerHTML = "<h5>Color lab</h5>";
    var chips = pbEl("div", "pb-chips");
    var c1 = pbEl("div", "pb-chip", '<div class="sw"></div><p>target</p>');
    var c2 = pbEl("div", "pb-chip", '<div class="sw"></div><p>your mix</p>');
    pbEls.targetSw = c1.querySelector(".sw");
    pbEls.mixSw = c2.querySelector(".sw");
    chips.appendChild(c1);
    chips.appendChild(c2);
    lab.appendChild(chips);
    pbEls.deLine = pbEl("p", "pb-de", "");
    lab.appendChild(pbEls.deLine);
    pbEls.tonerInputs = [];
    for (var gi = 0; gi < PB_TONERS.length; gi++) {
      (function (idx) {
        var s = pbSliderRow(PB_TONERS[idx].name, 0, 100, 1, pbParts[idx],
          function (v) { return Math.round(v) + " pts"; },
          function (v) { pbParts[idx] = v; pbRefresh(); });
        pbEls.tonerInputs.push(s);
        lab.appendChild(s.row);
      })(gi);
    }
    grid.appendChild(lab);

    var gun = pbEl("div", "pb-card");
    gun.innerHTML = "<h5>Spray gun</h5>";
    var ds = pbSliderRow("Gun distance", 10, 30, 0.5, pbDistance,
      function (v) { return v.toFixed(1) + " cm"; },
      function (v) { pbDistance = v; pbRefresh(); });
    var ss = pbSliderRow("Travel speed", 10, 40, 0.5, pbSpeed,
      function (v) { return v.toFixed(1) + " cm/s"; },
      function (v) { pbSpeed = v; pbRefresh(); });
    var cs = pbSliderRow("Coats", 1, 4, 1, pbCoats,
      function (v) { return String(Math.round(v)); },
      function (v) { pbCoats = Math.round(v); pbRefresh(); });
    pbEls.distSet = ds.set; pbEls.speedSet = ss.set; pbEls.coatsSet = cs.set;
    gun.appendChild(ds.row);
    gun.appendChild(ss.row);
    gun.appendChild(cs.row);
    pbEls.filmLine = pbEl("p", "pb-film", "");
    gun.appendChild(pbEls.filmLine);
    grid.appendChild(gun);

    var stage = pbEl("div", "pb-stage");
    pbCanvas = pbEl("canvas");
    pbCanvas.width = 640;
    pbCanvas.height = 230;
    pbCtx = pbCanvas.getContext("2d");
    stage.appendChild(pbCanvas);
    panel.appendChild(stage);

    pbEls.result = pbEl("div", "pb-result", "");
    panel.appendChild(pbEls.result);

    var foot = pbEl("div", "pb-foot");
    pbEls.spray = pbEl("button", "go", "Spray the panel");
    pbEls.spray.addEventListener("click", pbSprayPanel);
    var reset = pbEl("button", "ghost", "Reset");
    reset.addEventListener("click", pbReset);
    pbEls.ticket = pbEl("button", "ghost", "Download spray ticket");
    pbEls.ticket.disabled = true;
    pbEls.ticket.addEventListener("click", pbTicket);
    var close = pbEl("button", "ghost", "Close");
    close.addEventListener("click", function () {
      pb$("pbOverlay").classList.remove("open");
    });
    foot.appendChild(pbEls.spray);
    foot.appendChild(reset);
    foot.appendChild(pbEls.ticket);
    foot.appendChild(close);
    panel.appendChild(foot);

    pbSelectJob(0);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", pbBuild);
  } else {
    pbBuild();
  }

  /* node test hook: harmless in the browser */
  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      PB: {
        TONERS: PB_TONERS,
        JOBS: PB_JOBS,
        mix: pbMix,
        rgbToLab: pbRgbToLab,
        deltaE: pbDeltaE,
        spray: pbSpray,
        grade: pbGrade
      }
    };
  }

})();
/* ============================================================
   THE REFLOW OVEN
   A conveyor reflow oven bench: dial in five zone temps and the
   belt speed, run a real lumped-capacitance thermal sim, and grade
   the measured profile against a lead-free (SAC305) process window.
   Three boards, five checks each, one downloadable profile card.
   ============================================================ */
(function () {
  "use strict";

  var rf$ = function (id) { return document.getElementById(id); };
  function rfToast(msg) {
    if (typeof window.showToast === "function") { window.showToast(msg); return; }
    var t = rf$("toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(function () { t.classList.remove("show"); }, 1800);
  }
  function rfEl(tag, cls, html) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (html != null) d.innerHTML = html;
    return d;
  }
  function rfEsc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  var RF_CSS = [
    ".rf-overlay{position:fixed;inset:0;z-index:9999;background:rgba(4,8,8,.92);display:none;align-items:center;justify-content:center;padding:16px;}",
    ".rf-overlay.open{display:flex;}",
    ".rf-panel{width:min(940px,100%);max-height:94vh;overflow-y:auto;background:#0a1416;border:1px solid var(--orange);padding:16px;}",
    ".rf-panel h3{margin:0 0 4px;font-family:'Chakra Petch',sans-serif;text-transform:uppercase;letter-spacing:.02em;}",
    ".rf-sub{font-size:11px;color:#7c8d89;margin:0 0 12px;text-transform:uppercase;letter-spacing:.1em;line-height:1.7;}",
    ".rf-tabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;}",
    ".rf-tabs button{min-height:44px;padding:10px 14px;font-family:'Chakra Petch',sans-serif;font-weight:700;font-size:11px;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;background:#0a1416;border:1px solid var(--line);color:#72827f;}",
    ".rf-tabs button.on{border-color:var(--orange);color:var(--orange);}",
    ".rf-tabs button.done{border-color:var(--cyan);color:var(--cyan);}",
    ".rf-blurb{font-size:12px;color:#7c8d89;margin:0 0 12px;line-height:1.6;}",
    ".rf-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;}",
    ".rf-card{border:1px solid var(--line);background:var(--panel-2);padding:12px;}",
    ".rf-card h5{margin:0 0 8px;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--orange);font-weight:600;}",
    ".rf-row{margin-bottom:8px;}",
    ".rf-row label{display:flex;justify-content:space-between;font-size:11px;color:#7c8d89;text-transform:uppercase;letter-spacing:.08em;margin-bottom:2px;}",
    ".rf-row label span{font-family:monospace;color:var(--ink);}",
    ".rf-row input[type=range]{width:100%;min-height:44px;accent-color:var(--orange);}",
    ".rf-stage{border:1px solid var(--line);background:#060b0c;margin-bottom:12px;}",
    ".rf-stage canvas{display:block;width:100%;height:320px;}",
    ".rf-read{font-family:monospace;font-size:12px;color:var(--cyan);margin:0 0 10px;min-height:18px;}",
    ".rf-result{padding:10px 12px;font-size:12px;font-family:monospace;border:1px solid var(--line);line-height:1.8;margin-bottom:10px;}",
    ".rf-result .ok{color:var(--acid);}",
    ".rf-result .bad{color:#ff8ba0;}",
    ".rf-result .note{color:#7c8d89;}",
    ".rf-result.win{border-color:var(--acid);}",
    ".rf-result.fail{border-color:#ff4668;}",
    ".rf-foot{display:flex;gap:8px;flex-wrap:wrap;}",
    ".rf-foot button{min-height:44px;padding:10px 14px;font-family:'Chakra Petch',sans-serif;font-weight:700;font-size:11px;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;}",
    ".rf-foot .go{background:var(--orange);border:1px solid var(--orange);color:#140a02;flex:2;}",
    ".rf-foot .go:disabled{opacity:.35;cursor:default;}",
    ".rf-foot .ghost{background:#0a1416;border:1px solid var(--line);color:#72827f;flex:1;}",
    ".rf-foot .ghost:disabled{opacity:.35;cursor:default;}",
    "@media (max-width:640px){.rf-grid{grid-template-columns:1fr;}}"
  ].join("\n");

  /* ---------- process model ---------- */
  var RF_ZONE_LEN = 60, RF_ZONES = 5, RF_TOTAL = RF_ZONE_LEN * RF_ZONES;
  var RF_ZONE_META = [
    { name: "Z1 Preheat", min: 100, max: 220, def: 150 },
    { name: "Z2 Soak", min: 140, max: 240, def: 180 },
    { name: "Z3 Reflow", min: 200, max: 285, def: 240 },
    { name: "Z4 Tail", min: 160, max: 280, def: 200 },
    { name: "Z5 Cool air", min: 25, max: 90, def: 55 }
  ];
  var RF_DEF_SPEED = 75, RF_MIN_SPEED = 25, RF_MAX_SPEED = 110;

  var RF_BOARDS = [
    { name: "Beacon Board", tau: 18, peakLo: 235, peakHi: 247,
      blurb: "Featherweight LED beacon board, fine-pitch parts. Reacts fast, forgives nothing. Keep the peak under 247C or the LEDs cook." },
    { name: "Mixed Bag", tau: 30, peakLo: 235, peakHi: 252,
      blurb: "Two-layer general purpose board. The everyman of the oven. Wants a textbook SAC305 profile." },
    { name: "Ground Plane Special", tau: 48, peakLo: 235, peakHi: 255,
      blurb: "Four layers of solid copper pour. A thermal brick with opinions. Slow the belt, it soaks up heat like a sponge." }
  ];

  function rfSimulate(zones, speed, tau) {
    var dt = 0.5, v = speed / 60, T = 25, x = 0, t = 0;
    var tauCool = tau * 1.8;
    var hist = [];
    while (x < RF_TOTAL && t < 1500) {
      var zi = Math.min(4, Math.floor(x / RF_ZONE_LEN));
      var tc = (zi === 4) ? tauCool : tau;
      T += (zones[zi] - T) * (dt / tc);
      x += v * dt; t += dt;
      hist.push([t, T, x]);
    }
    return hist;
  }

  function rfGrade(hist, board) {
    var dt = 0.5, peak = 25;
    var t150 = -1, soak = 0, tal = 0;
    var t5in = -1, T5in = 0, T5out = 0, t5 = 0;
    for (var i = 0; i < hist.length; i++) {
      var T = hist[i][1];
      if (T > peak) peak = T;
      if (t150 < 0 && T >= 150) t150 = hist[i][0];
      if (T >= 150 && T <= 200) soak += dt;
      if (T > 217) tal += dt;
    }
    for (var k = 0; k < hist.length; k++) {
      if (t5in < 0 && hist[k][2] >= RF_TOTAL - RF_ZONE_LEN) {
        t5in = hist[k][0]; T5in = hist[k][1];
      }
    }
    var last = hist[hist.length - 1];
    t5 = last[0] - t5in; T5out = last[1];
    var cool = t5 > 0 ? (T5in - T5out) / t5 : 0;
    var ramp = (t150 > 0) ? 125 / t150 : 0;
    var checks = [];
    function chk(name, val, lo, hi, unit, failLo, failHi) {
      var pass = val >= lo && val <= hi;
      checks.push({ name: name, val: val, lo: lo, hi: hi, unit: unit, pass: pass,
        note: pass ? "" : (val < lo ? failLo : failHi) });
    }
    if (t150 < 0) {
      checks.push({ name: "Preheat ramp", val: 0, lo: 1, hi: 3, unit: "C/s", pass: false,
        note: "The board never reached 150C. Raise the early zones or slow the belt." });
    } else {
      chk("Preheat ramp", ramp, 1.0, 3.0, "C/s",
        "Flux gave up and went home before reflow. Speed up the belt or raise zone 1.",
        "The board took that personally. Thermal shock, cracked ceramics, sadness.");
    }
    chk("Soak 150-200C", soak, 60, 120, "s",
      "Tombstoning risk. Your resistors are doing handstands.",
      "Flux is exhausted. Wetting failed, the joints look like raisins.");
    chk("Time above liquidus", tal, 45, 150, "s",
      "Cold joints. The paste waved at the pads and left.",
      "Intermetallics grew fangs. Brittle joints, do not drop the board.");
    chk("Peak temperature", peak, board.peakLo, board.peakHi, "C",
      "The paste never fully melted. It is basically glue now.",
      "Pads lifted, parts delaminated. The board smells like regret.");
    chk("Cooling rate", cool, 1.2, 6.5, "C/s",
      "Coarse grain structure. These joints will age like milk.",
      "Thermal shock on the way out. The joints are stressed.");
    var pass = true;
    for (var c = 0; c < checks.length; c++) if (!checks[c].pass) pass = false;
    return { checks: checks, pass: pass, ramp: ramp, soak: soak, tal: tal, peak: peak, cool: cool };
  }

  /* ---------- state ---------- */
  var rfBoardIdx = 0;
  var rfZones = [150, 180, 240, 200, 55];
  var rfSpeed = RF_DEF_SPEED;
  var rfPass = [false, false, false];
  var rfWin = [null, null, null]; /* winning {zones, speed, grade} per board */
  var rfEls = {};
  var rfHist = null, rfPlayT = 0, rfPlaying = false, rfRaf = null;
  var rfCanvas = null, rfCtx = null;

  function rfZoneColor(t) {
    var h = 210 - Math.max(0, Math.min(1, (t - 25) / 260)) * 210;
    return "hsl(" + h.toFixed(0) + ",70%,42%)";
  }

  function rfDraw() {
    if (!rfCtx || !rfCanvas) return;
    var W = rfCanvas.width, H = rfCanvas.height;
    var ctx = rfCtx;
    ctx.clearRect(0, 0, W, H);
    var ovenH = 118, chartY = ovenH + 26, chartH = H - chartY - 26;

    /* oven tunnel */
    var zw = W / 5;
    for (var z = 0; z < 5; z++) {
      ctx.fillStyle = rfZoneColor(rfZones[z]);
      ctx.globalAlpha = 0.55;
      ctx.fillRect(z * zw + 1, 8, zw - 2, ovenH - 16);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "#2a3b37";
      ctx.strokeRect(z * zw + 1, 8, zw - 2, ovenH - 16);
      ctx.fillStyle = "#e9f4e8";
      ctx.font = "11px monospace";
      ctx.textAlign = "center";
      ctx.fillText("Z" + (z + 1), z * zw + zw / 2, 26);
      ctx.fillText(rfZones[z] + "C", z * zw + zw / 2, 42);
    }
    /* conveyor */
    ctx.strokeStyle = "#72827f";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, ovenH - 8);
    ctx.lineTo(W, ovenH - 8);
    ctx.stroke();
    ctx.lineWidth = 1;

    /* board position */
    var bx = 0, bT = 25, bt = 0;
    if (rfHist && rfHist.length) {
      var idx = 0;
      while (idx < rfHist.length - 1 && rfHist[idx][0] < rfPlayT) idx++;
      bt = rfHist[idx][0]; bT = rfHist[idx][1]; bx = rfHist[idx][2];
    }
    var px = Math.min(W - 34, (bx / RF_TOTAL) * W);
    ctx.fillStyle = "#0e5c2e";
    ctx.fillRect(px, ovenH - 44, 32, 30);
    ctx.fillStyle = "#c8c8c8";
    ctx.fillRect(px + 4, ovenH - 40, 8, 8);
    ctx.fillRect(px + 18, ovenH - 40, 8, 8);
    ctx.fillRect(px + 4, ovenH - 28, 8, 8);
    ctx.fillRect(px + 18, ovenH - 28, 8, 8);
    /* thermocouple readout */
    ctx.fillStyle = "#ffd166";
    ctx.font = "bold 12px monospace";
    ctx.textAlign = "left";
    ctx.fillText("TC " + bT.toFixed(0) + "C", 8, ovenH + 16);
    ctx.textAlign = "right";
    ctx.fillText("T+" + bt.toFixed(0) + "s", W - 8, ovenH + 16);
    ctx.textAlign = "left";

    /* chart */
    var tMax = rfHist && rfHist.length ? rfHist[rfHist.length - 1][0] : 300;
    var tMin = 0, yMax = 285;
    function cx(t) { return (t - tMin) / (tMax - tMin) * W; }
    function cy(T) { return chartY + chartH - (T / yMax) * chartH; }
    var board = RF_BOARDS[rfBoardIdx];
    /* soak band */
    ctx.fillStyle = "rgba(0,229,255,.10)";
    ctx.fillRect(0, cy(200), W, cy(150) - cy(200));
    /* peak band */
    ctx.fillStyle = "rgba(178,255,0,.10)";
    ctx.fillRect(0, cy(board.peakHi), W, cy(board.peakLo) - cy(board.peakHi));
    /* liquidus line */
    ctx.strokeStyle = "#ff6b2c";
    ctx.setLineDash([6, 4]);
    ctx.beginPath(); ctx.moveTo(0, cy(217)); ctx.lineTo(W, cy(217)); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#ff6b2c";
    ctx.font = "10px monospace";
    ctx.fillText("LIQ 217C", 6, cy(217) - 4);
    /* axes labels */
    ctx.fillStyle = "#72827f";
    ctx.fillText("0", 4, chartY + chartH - 4);
    ctx.fillText(tMax.toFixed(0) + "s", W - 34, chartY + chartH - 4);
    ctx.fillText("285C", 4, chartY + 10);
    /* curve */
    if (rfHist && rfHist.length) {
      ctx.strokeStyle = "#b2ff00";
      ctx.lineWidth = 2;
      ctx.beginPath();
      var started = false;
      for (var i = 0; i < rfHist.length; i++) {
        if (rfHist[i][0] > rfPlayT) break;
        var X = cx(rfHist[i][0]), Y = cy(rfHist[i][1]);
        if (!started) { ctx.moveTo(X, Y); started = true; }
        else ctx.lineTo(X, Y);
      }
      ctx.stroke();
      ctx.lineWidth = 1;
    }
  }

  function rfLoop() {
    if (!rfPlaying) return;
    var now = (typeof performance !== "undefined") ? performance.now() : Date.now();
    if (!rfLoop.last) rfLoop.last = now;
    var dtReal = (now - rfLoop.last) / 1000;
    rfLoop.last = now;
    var simT = rfHist[rfHist.length - 1][0];
    rfPlayT += dtReal * (simT / 12);
    if (rfPlayT >= simT) {
      rfPlayT = simT;
      rfPlaying = false;
      rfFinish();
    }
    rfDraw();
    rfRead();
    if (rfPlaying) rfRaf = requestAnimationFrame(rfLoop);
    else rfRaf = null;
  }

  function rfKick() {
    rfLoop.last = 0;
    if (typeof requestAnimationFrame === "function") {
      if (!rfRaf) rfRaf = requestAnimationFrame(rfLoop);
    } else {
      rfDraw(); rfRead();
    }
  }

  function rfRead() {
    if (!rfEls.read) return;
    if (!rfHist || !rfHist.length) {
      rfEls.read.textContent = "Set the zones, set the belt, run the profile.";
      return;
    }
    var idx = 0;
    while (idx < rfHist.length - 1 && rfHist[idx][0] < rfPlayT) idx++;
    var zi = Math.min(4, Math.floor(rfHist[idx][2] / RF_ZONE_LEN));
    rfEls.read.textContent = "T+" + rfHist[idx][0].toFixed(0) + "s, board " +
      rfHist[idx][1].toFixed(0) + "C, zone Z" + (zi + 1) +
      (rfPlaying ? " (running)" : " (done)");
  }

  function rfRun() {
    if (rfPlaying) return;
    var board = RF_BOARDS[rfBoardIdx];
    rfHist = rfSimulate(rfZones.slice(), rfSpeed, board.tau);
    rfPlayT = 0;
    rfPlaying = true;
    rfEls.run.disabled = true;
    rfEls.result.className = "rf-result";
    rfEls.result.innerHTML = "<span class='note'>Profile running, watch the thermocouple.</span>";
    rfKick();
  }

  function rfFinish() {
    var board = RF_BOARDS[rfBoardIdx];
    var g = rfGrade(rfHist, board);
    rfEls.run.disabled = false;
    var html = "";
    for (var i = 0; i < g.checks.length; i++) {
      var c = g.checks[i];
      html += "<div class='" + (c.pass ? "ok" : "bad") + "'>" +
        (c.pass ? "[PASS] " : "[FAIL] ") + rfEsc(c.name) + ": " +
        c.val.toFixed(c.unit === "s" ? 0 : 2) + c.unit +
        " (window " + c.lo + " to " + c.hi + " " + c.unit + ")" +
        (c.pass ? "" : "<br><span class='note'>" + rfEsc(c.note) + "</span>") +
        "</div>";
    }
    rfEls.result.innerHTML = html;
    rfEls.result.className = "rf-result " + (g.pass ? "win" : "fail");
    if (g.pass) {
      rfPass[rfBoardIdx] = true;
      rfWin[rfBoardIdx] = { zones: rfZones.slice(), speed: rfSpeed, grade: g };
      rfToast("Board passed, joints shiny");
      rfMarkTabs();
      rfCheckCard();
    } else {
      rfToast("Profile failed, check the notes");
    }
    rfDraw();
    rfRead();
  }

  function rfMarkTabs() {
    if (!rfEls.tabs) return;
    var kids = rfEls.tabs.children;
    for (var i = 0; i < kids.length; i++) {
      kids[i].classList.toggle("done", !!rfPass[i]);
      kids[i].classList.toggle("on", i === rfBoardIdx);
    }
  }

  function rfCheckCard() {
    var all = rfPass[0] && rfPass[1] && rfPass[2];
    rfEls.card.disabled = !all;
    if (all) rfToast("All three boards passed, profile card unlocked");
  }

  function rfCard() {
    var d = new Date();
    var lines = [
      "REFLOW OVEN PROFILE CARD",
      "Garage Inventions reflow bench, SAC305 lead-free, " + d.toISOString().slice(0, 10),
      ""
    ];
    for (var i = 0; i < 3; i++) {
      var w = rfWin[i], b = RF_BOARDS[i], g = w.grade;
      lines.push(b.name.toUpperCase());
      lines.push("  zones C: " + w.zones.join(" / ") + ", belt " + w.speed + " cm/min");
      lines.push("  ramp " + g.ramp.toFixed(2) + " C/s, soak " + g.soak.toFixed(0) +
        "s, TAL " + g.tal.toFixed(0) + "s, peak " + g.peak.toFixed(1) +
        "C, cool " + g.cool.toFixed(2) + " C/s");
      lines.push("");
    }
    lines.push("Signed: the oven");
    var blob = new Blob([lines.join("\n")], { type: "text/plain" });
    var a = rfEl("a");
    a.href = URL.createObjectURL(blob);
    a.download = "reflow-oven-profile-card.txt";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    rfToast("Profile card downloaded");
  }

  function rfReset() {
    rfZones = RF_ZONE_META.map(function (m) { return m.def; });
    rfSpeed = RF_DEF_SPEED;
    for (var i = 0; i < rfEls.zoneInputs.length; i++) {
      rfEls.zoneInputs[i].input.value = rfZones[i];
      rfEls.zoneInputs[i].val.textContent = rfZones[i] + "C";
    }
    rfEls.speedInput.value = rfSpeed;
    rfEls.speedVal.textContent = rfSpeed + " cm/min";
    rfHist = null; rfPlayT = 0; rfPlaying = false;
    if (rfRaf && typeof cancelAnimationFrame === "function") cancelAnimationFrame(rfRaf);
    rfRaf = null;
    rfEls.result.className = "rf-result";
    rfEls.result.innerHTML = "<span class='note'>Oven reset to the house recipe. It fails, that is the point.</span>";
    rfDraw();
    rfRead();
  }

  function rfSelectBoard(i) {
    rfBoardIdx = i;
    rfMarkTabs();
    rfEls.blurb.textContent = RF_BOARDS[i].blurb;
    rfDraw();
  }

  function rfBuild() {
    var box = document.querySelector(".dossier .actions");
    if (!box || rf$("rfBtn")) return;

    var st = document.createElement("style");
    st.textContent = RF_CSS;
    document.head.appendChild(st);

    var b = rfEl("button", "secondary", "Run the Reflow Oven");
    b.id = "rfBtn";
    b.addEventListener("click", function () {
      rf$("rfOverlay").classList.add("open");
      rfDraw();
      rfRead();
    });
    box.appendChild(b);

    var ov = rfEl("div", "rf-overlay");
    ov.id = "rfOverlay";
    var panel = rfEl("div", "rf-panel");
    panel.innerHTML =
      "<h3>The Reflow Oven</h3>" +
      '<p class="rf-sub">Dial in a lead-free reflow profile: five zones, one conveyor, three boards with opinions. Pass all five process windows on every board and take the profile card.</p>';
    ov.appendChild(panel);
    document.body.appendChild(ov);

    var tabs = rfEl("div", "rf-tabs");
    rfEls.tabs = tabs;
    for (var ti = 0; ti < 3; ti++) {
      (function (idx) {
        var t = rfEl("button", idx === 0 ? "on" : "", RF_BOARDS[idx].name);
        t.addEventListener("click", function () { rfSelectBoard(idx); });
        tabs.appendChild(t);
      })(ti);
    }
    panel.appendChild(tabs);

    rfEls.blurb = rfEl("p", "rf-blurb", RF_BOARDS[0].blurb);
    panel.appendChild(rfEls.blurb);

    var grid = rfEl("div", "rf-grid");

    var zcard = rfEl("div", "rf-card");
    zcard.appendChild(rfEl("h5", null, "Zone air temps"));
    rfEls.zoneInputs = [];
    RF_ZONE_META.forEach(function (m, zi) {
      var row = rfEl("div", "rf-row");
      var lab = rfEl("label", null, "<span>" + rfEsc(m.name) + "</span>");
      var val = rfEl("span", null, m.def + "C");
      lab.appendChild(val);
      var inp = rfEl("input", null, null);
      inp.type = "range";
      inp.min = m.min; inp.max = m.max; inp.step = 5; inp.value = m.def;
      inp.setAttribute("aria-label", m.name + " temperature");
      (function (idx, v) {
        inp.addEventListener("input", function () {
          rfZones[idx] = parseInt(inp.value, 10);
          v.textContent = inp.value + "C";
          rfDraw();
        });
      })(zi, val);
      row.appendChild(lab);
      row.appendChild(inp);
      zcard.appendChild(row);
      rfEls.zoneInputs.push({ input: inp, val: val });
    });
    grid.appendChild(zcard);

    var scard = rfEl("div", "rf-card");
    scard.appendChild(rfEl("h5", null, "Conveyor"));
    var srow = rfEl("div", "rf-row");
    var slab = rfEl("label", null, "<span>Belt speed</span>");
    rfEls.speedVal = rfEl("span", null, RF_DEF_SPEED + " cm/min");
    slab.appendChild(rfEls.speedVal);
    rfEls.speedInput = rfEl("input", null, null);
    rfEls.speedInput.type = "range";
    rfEls.speedInput.min = RF_MIN_SPEED;
    rfEls.speedInput.max = RF_MAX_SPEED;
    rfEls.speedInput.step = 5;
    rfEls.speedInput.value = RF_DEF_SPEED;
    rfEls.speedInput.setAttribute("aria-label", "Belt speed");
    rfEls.speedInput.addEventListener("input", function () {
      rfSpeed = parseInt(rfEls.speedInput.value, 10);
      rfEls.speedVal.textContent = rfSpeed + " cm/min";
    });
    srow.appendChild(slab);
    srow.appendChild(rfEls.speedInput);
    scard.appendChild(srow);
    var how = rfEl("p", "rf-blurb",
      "Process windows (SAC305): ramp 1 to 3 C/s, soak 60 to 120 s at 150 to 200C, " +
      "time above liquidus 45 to 150 s, peak in the board band, cool 1.2 to 6.5 C/s. " +
      "Slow the belt to buy time, cool the air to shed it.");
    scard.appendChild(how);
    grid.appendChild(scard);
    panel.appendChild(grid);

    var stage = rfEl("div", "rf-stage");
    rfCanvas = rfEl("canvas");
    rfCanvas.width = 660;
    rfCanvas.height = 320;
    rfCtx = rfCanvas.getContext("2d");
    stage.appendChild(rfCanvas);
    panel.appendChild(stage);

    rfEls.read = rfEl("p", "rf-read", "Set the zones, set the belt, run the profile.");
    panel.appendChild(rfEls.read);

    rfEls.result = rfEl("div", "rf-result",
      "<span class='note'>No profile run yet. The oven is cold and judgmental.</span>");
    panel.appendChild(rfEls.result);

    var foot = rfEl("div", "rf-foot");
    rfEls.run = rfEl("button", "go", "Run the profile");
    rfEls.run.addEventListener("click", rfRun);
    var reset = rfEl("button", "ghost", "Reset");
    reset.addEventListener("click", rfReset);
    rfEls.card = rfEl("button", "ghost", "Download profile card");
    rfEls.card.disabled = true;
    rfEls.card.addEventListener("click", rfCard);
    var close = rfEl("button", "ghost", "Close");
    close.addEventListener("click", function () {
      rf$("rfOverlay").classList.remove("open");
      rfPlaying = false;
      if (rfRaf && typeof cancelAnimationFrame === "function") cancelAnimationFrame(rfRaf);
      rfRaf = null;
      rfEls.run.disabled = false;
    });
    foot.appendChild(rfEls.run);
    foot.appendChild(reset);
    foot.appendChild(rfEls.card);
    foot.appendChild(close);
    panel.appendChild(foot);

    rfSelectBoard(0);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", rfBuild);
  } else {
    rfBuild();
  }

  /* node test hook: harmless in the browser */
  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      RF: {
        BOARDS: RF_BOARDS,
        ZONE_META: RF_ZONE_META,
        simulate: rfSimulate,
        grade: rfGrade
      }
    };
  }

})();

/* ============================================================
   THE BALANCING STAND
   A wheel balancing machine bench. Three wheels roll in shaking;
   spin each one, read the two-plane imbalance vectors, clip
   weights onto the rim at the right angles, and get the residual
   under tolerance. Real two-plane vector balancing (residual =
   initial + sum of weight vectors), noisy machine readouts like a
   real balancer, a spin animation, and a downloadable balance
   report for every wheel that makes tolerance.
   ============================================================ */
(function () {
  "use strict";

  var bs$ = function (id) { return document.getElementById(id); };
  function bsToast(msg) {
    if (typeof window.showToast === "function") { window.showToast(msg); return; }
    var t = bs$("toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(function () { t.classList.remove("show"); }, 1800);
  }
  function bsEl(tag, cls, html) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (html != null) d.innerHTML = html;
    return d;
  }
  function bsEsc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  /* ---------- pure balancing core (shared with node tests) ---------- */
  function bsLcg(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }
  /* angle convention: degrees clockwise from 12 o'clock, y grows downward */
  function bsVec(mag, deg) {
    var r = deg * Math.PI / 180;
    return { x: mag * Math.sin(r), y: mag * Math.cos(r) };
  }
  function bsAddV(a, b) { return { x: a.x + b.x, y: a.y + b.y }; }
  function bsMag(v) { return Math.sqrt(v.x * v.x + v.y * v.y); }
  function bsAng(v) {
    var a = Math.atan2(v.x, v.y) * 180 / Math.PI;
    return ((a % 360) + 360) % 360;
  }
  function bsResidual(initMag, initDeg, weights) {
    var v = bsVec(initMag, initDeg);
    for (var i = 0; i < weights.length; i++) {
      v = bsAddV(v, bsVec(weights[i].mag, weights[i].deg));
    }
    return v;
  }
  function bsNewWheel(def, seed) {
    var rnd = bsLcg(seed);
    function one(lo, hi) {
      return { mag: lo + rnd() * (hi - lo), deg: Math.floor(rnd() * 36) * 10 };
    }
    return { inner: one(def.lo, def.hi), outer: one(def.lo, def.hi) };
  }
  /* a real balancer reading: truth plus a little machine noise */
  function bsMeasure(res, rnd) {
    var m = Math.max(0, bsMag(res) * (1 + (rnd() - 0.5) * 0.06));
    var a = bsAng(res) + (rnd() - 0.5) * 8;
    a = ((Math.round(a / 5) * 5) % 360 + 360) % 360;
    return { mag: m, deg: a };
  }
  function bsPlaneTotal(weights) {
    var t = 0;
    for (var i = 0; i < weights.length; i++) t += weights[i].mag;
    return t;
  }

  var BS_WHEELS = [
    { name: "Commuter Special", tol: 0.25, lo: 1.5, hi: 3.0,
      blurb: "A daily driver with a shimmy at 65 mph. Tolerance: 0.25 oz per plane. The owner swears it is the alignment. It is not the alignment." },
    { name: "Half-Ton Hauler", tol: 0.50, lo: 2.5, hi: 5.0,
      blurb: "A pickup wheel that rattles the mirrors at idle. Bigger imbalance, looser tolerance: 0.50 oz per plane." },
    { name: "Track Day Special", tol: 0.15, lo: 1.0, hi: 2.2,
      blurb: "A featherweight track wheel. Tolerance: 0.15 oz per plane. The driver counts grams. You will count ounces." }
  ];
  var BS_SIZES = [0.25, 0.5, 1.0, 2.0];

  var BS_CSS = [
    ".bs-overlay{position:fixed;inset:0;z-index:9999;background:rgba(4,8,8,.92);display:none;align-items:center;justify-content:center;padding:16px;}",
    ".bs-overlay.open{display:flex;}",
    ".bs-panel{width:min(940px,100%);max-height:94vh;overflow-y:auto;background:#0a1416;border:1px solid var(--cyan);padding:16px;}",
    ".bs-panel h3{margin:0 0 4px;font-family:'Chakra Petch',sans-serif;text-transform:uppercase;letter-spacing:.02em;}",
    ".bs-sub{font-size:11px;color:#7c8d89;margin:0 0 12px;text-transform:uppercase;letter-spacing:.1em;line-height:1.7;}",
    ".bs-tabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;}",
    ".bs-tabs button{min-height:44px;padding:10px 14px;font-family:'Chakra Petch',sans-serif;font-weight:700;font-size:11px;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;background:#0a1416;border:1px solid var(--line);color:#72827f;}",
    ".bs-tabs button.on{border-color:var(--cyan);color:var(--cyan);}",
    ".bs-tabs button.done{border-color:var(--acid);color:var(--acid);}",
    ".bs-blurb{font-size:12px;color:#7c8d89;margin:0 0 12px;line-height:1.6;}",
    ".bs-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;}",
    "@media (max-width:760px){.bs-grid{grid-template-columns:1fr;}}",
    ".bs-card{border:1px solid var(--line);background:var(--panel-2);padding:12px;}",
    ".bs-card h5{margin:0 0 8px;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--cyan);font-weight:600;}",
    ".bs-card canvas{display:block;width:100%;max-width:360px;margin:0 auto;touch-action:manipulation;cursor:crosshair;}",
    ".bs-hint{font-size:11px;color:#7c8d89;line-height:1.6;margin:8px 0 0;}",
    ".bs-ctl-row{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;}",
    ".bs-ctl-row button{min-height:44px;padding:10px 12px;font-family:'Chakra Petch',sans-serif;font-weight:700;font-size:11px;letter-spacing:.05em;text-transform:uppercase;cursor:pointer;background:#0a1416;border:1px solid var(--line);color:#cfe3dd;}",
    ".bs-ctl-row button.on{border-color:var(--acid);color:var(--acid);}",
    ".bs-ctl-row button:disabled{opacity:.4;cursor:default;}",
    ".bs-ctl-label{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#7c8d89;margin:0 0 6px;font-weight:600;}",
    ".bs-read{border:1px solid var(--line);background:#0a1416;padding:12px;margin-bottom:12px;font-size:12px;line-height:1.8;}",
    ".bs-read .ok{color:var(--acid);}",
    ".bs-read .bad{color:var(--orange);}",
    ".bs-read .dim{color:#72827f;}",
    ".bs-banner{border:1px solid var(--acid);background:rgba(120,255,120,.06);padding:12px;margin-bottom:12px;}",
    ".bs-banner h4{margin:0 0 4px;font-family:'Chakra Petch',sans-serif;text-transform:uppercase;color:var(--acid);letter-spacing:.06em;}",
    ".bs-banner p{margin:0;font-size:12px;color:#cfe3dd;line-height:1.6;}",
    ".bs-chips{margin:0 0 10px;}",
    ".bs-chip{display:inline-block;border:1px solid var(--line);background:#0a1416;padding:6px 8px;margin:0 6px 6px 0;font-size:11px;color:#cfe3dd;}",
    ".bs-chip button{margin-left:8px;background:none;border:none;color:var(--orange);cursor:pointer;font:inherit;padding:4px;}",
    ".bs-foot{display:flex;gap:8px;flex-wrap:wrap;}",
    ".bs-foot button{min-height:48px;padding:12px 16px;font-family:'Chakra Petch',sans-serif;font-weight:700;font-size:12px;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;border:1px solid var(--line);background:#0a1416;color:#cfe3dd;}",
    ".bs-foot button.primary{border-color:var(--acid);color:var(--acid);}",
    ".bs-foot button:disabled{opacity:.4;cursor:default;}",
    ".bs-spins{font-size:11px;color:#7c8d89;text-transform:uppercase;letter-spacing:.1em;}"
  ].join("\n");

  var bsWheelIdx = 0;
  var bsInit = null;
  var bsWeights = { inner: [], outer: [] };
  var bsPlane = "inner";
  var bsSize = 0.5;
  var bsSpins = 0;
  var bsBalanced = false;
  var bsSpinning = false;
  var bsSpinAngle = 0;
  var bsRaf = null;
  var bsDone = [false, false, false];
  var bsEls = {};

  function bsDef() { return BS_WHEELS[bsWheelIdx]; }

  function bsReset(seed) {
    bsInit = bsNewWheel(bsDef(), seed == null ? (Date.now() % 100000) : seed);
    bsWeights = { inner: [], outer: [] };
    bsSpins = 0;
    bsBalanced = false;
    bsSpinning = false;
    bsSpinAngle = 0;
    if (bsRaf && typeof cancelAnimationFrame === "function") cancelAnimationFrame(bsRaf);
    bsRaf = null;
    bsEls.blurb.textContent = bsDef().blurb;
    bsEls.read.innerHTML = '<span class="dim">Spin the wheel to read the imbalance. Then clip weights on the rim: tap the wheel face at the angle you want, on the selected plane.</span>';
    bsEls.banner.style.display = "none";
    bsEls.report.disabled = true;
    bsEls.spin.disabled = false;
    bsRenderChips();
    bsUpdateSpins();
    bsDraw();
  }

  function bsGrade() {
    if (bsSpins <= 2) return "ONE-SPIN WONDER";
    if (bsSpins <= 4) return "SHOP MATERIAL";
    if (bsSpins <= 7) return "GETS IT DONE";
    return "PERSISTENT";
  }

  function bsTrueResiduals() {
    return {
      inner: bsResidual(bsInit.inner.mag, bsInit.inner.deg, bsWeights.inner),
      outer: bsResidual(bsInit.outer.mag, bsInit.outer.deg, bsWeights.outer)
    };
  }

  function bsUpdateSpins() {
    bsEls.spins.textContent = "Spins: " + bsSpins;
  }

  function bsDraw() {
    var c = bs$("bsCanvas");
    if (!c) return;
    var g = c.getContext("2d");
    var S = c.width, cx = S / 2, cy = S / 2;
    g.clearRect(0, 0, S, S);
    var R = S * 0.44;
    var rIn = R * 0.60, rOut = R * 0.82;
    function pt(r, deg) {
      var a = (deg + bsSpinAngle) * Math.PI / 180;
      return { x: cx + r * Math.sin(a), y: cy - r * Math.cos(a) };
    }
    /* tire */
    g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fillStyle = "#101312"; g.fill();
    g.lineWidth = 3; g.strokeStyle = "#2a332f"; g.stroke();
    /* tread ticks */
    g.strokeStyle = "#232a28"; g.lineWidth = 4;
    for (var ti = 0; ti < 36; ti++) {
      var p1 = pt(R * 0.94, ti * 10), p2 = pt(R * 0.995, ti * 10);
      g.beginPath(); g.moveTo(p1.x, p1.y); g.lineTo(p2.x, p2.y); g.stroke();
    }
    /* rim */
    g.beginPath(); g.arc(cx, cy, R * 0.72, 0, Math.PI * 2); g.fillStyle = "#161d1b"; g.fill();
    g.lineWidth = 2; g.strokeStyle = "#3a4a46"; g.stroke();
    /* spokes */
    g.strokeStyle = "#2c3835"; g.lineWidth = S * 0.02;
    for (var si = 0; si < 5; si++) {
      var sp = pt(R * 0.66, si * 72);
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(sp.x, sp.y); g.stroke();
    }
    g.beginPath(); g.arc(cx, cy, S * 0.055, 0, Math.PI * 2); g.fillStyle = "#0a0e0d"; g.fill();
    g.lineWidth = 2; g.strokeStyle = "#3a4a46"; g.stroke();
    /* plane rings */
    [["inner", rIn, "#35e0d2"], ["outer", rOut, "#ff7a2e"]].forEach(function (pr) {
      g.beginPath(); g.arc(cx, cy, pr[1], 0, Math.PI * 2);
      g.lineWidth = bsPlane === pr[0] ? 3 : 1;
      g.strokeStyle = bsPlane === pr[0] ? pr[2] : "#2a332f";
      g.stroke();
    });
    /* 36 slot ticks on the outer ring */
    g.strokeStyle = "#3a4a46"; g.lineWidth = 2;
    for (var k = 0; k < 36; k++) {
      var q1 = pt(rOut - 6, k * 10), q2 = pt(rOut + 6, k * 10);
      g.beginPath(); g.moveTo(q1.x, q1.y); g.lineTo(q2.x, q2.y); g.stroke();
    }
    /* weights */
    [["inner", rIn, "#35e0d2"], ["outer", rOut, "#ff7a2e"]].forEach(function (pr) {
      var list = bsWeights[pr[0]];
      for (var wi = 0; wi < list.length; wi++) {
        var w = list[wi];
        var p = pt(pr[1], w.deg);
        var rot = (w.deg + bsSpinAngle) * Math.PI / 180;
        g.save();
        g.translate(p.x, p.y);
        g.rotate(rot);
        var bw = 6 + w.mag * 10;
        g.fillStyle = pr[2];
        g.fillRect(-bw / 2, -7, bw, 14);
        g.strokeStyle = "#0a1416"; g.lineWidth = 2; g.strokeRect(-bw / 2, -7, bw, 14);
        g.restore();
      }
    });
    /* 12 o'clock marker */
    g.fillStyle = "#72827f";
    g.font = (S * 0.035) + "px monospace";
    g.textAlign = "center";
    g.fillText("0 deg", cx, cy - R - 8);
  }

  function bsRenderChips() {
    [["inner", "INNER"], ["outer", "OUTER"]].forEach(function (pr) {
      var box = bsEls["chips_" + pr[0]];
      box.innerHTML = "";
      var list = bsWeights[pr[0]];
      if (!list.length) {
        var none = bsEl("span", null, null);
        none.style.cssText = "font-size:11px;color:#72827f;";
        none.textContent = "no weights";
        box.appendChild(none);
        return;
      }
      list.forEach(function (w, i) {
        var chip = bsEl("span", "bs-chip", null);
        chip.textContent = w.mag.toFixed(2) + " oz at " + w.deg + " deg";
        var x = bsEl("button", null, "x");
        x.setAttribute("aria-label", "remove weight");
        (function (idx) {
          x.addEventListener("click", function () {
            bsWeights[pr[0]].splice(idx, 1);
            bsRenderChips();
            bsDraw();
            bsToast("Weight pulled off the " + pr[1] + " plane");
          });
        })(i);
        chip.appendChild(x);
        box.appendChild(chip);
      });
    });
  }

  function bsPlace(evt) {
    if (bsSpinning || bsBalanced) return;
    var c = bs$("bsCanvas");
    var rect = c.getBoundingClientRect();
    var sx = c.width / rect.width, sy = c.height / rect.height;
    var x = (evt.clientX - rect.left) * sx, y = (evt.clientY - rect.top) * sy;
    var S = c.width, cx = S / 2, cy = S / 2;
    var dx = x - cx, dy = y - cy;
    var dist = Math.sqrt(dx * dx + dy * dy);
    var R = S * 0.44;
    if (dist < R * 0.45 || dist > R * 1.02) {
      bsToast("Tap on the rim band to clip a weight there");
      return;
    }
    var deg = Math.atan2(dx, -dy) * 180 / Math.PI;
    deg = ((Math.round(deg / 10) * 10) % 360 + 360) % 360;
    var list = bsWeights[bsPlane];
    if (list.length >= 12) { bsToast("That plane is full of clips, pull some off"); return; }
    if (bsPlaneTotal(list) + bsSize > 8) { bsToast("Over 8 oz on one plane, the rack refuses"); return; }
    list.push({ mag: bsSize, deg: deg });
    bsRenderChips();
    bsDraw();
    bsToast(bsSize.toFixed(2) + " oz clipped at " + deg + " deg (" + bsPlane.toUpperCase() + ")");
  }

  function bsSpin() {
    if (bsSpinning || bsBalanced) return;
    bsSpinning = true;
    bsEls.spin.disabled = true;
    var t0 = null, DUR = 1900;
    function frame(ts) {
      if (t0 == null) t0 = ts;
      var t = Math.min(1, (ts - t0) / DUR);
      var speed = 900 * Math.sin(Math.PI * Math.min(1, t * 1.15));
      bsSpinAngle = (bsSpinAngle + speed * 0.016) % 360;
      bsDraw();
      if (t < 1) {
        bsRaf = requestAnimationFrame(frame);
      } else {
        bsSpinning = false;
        bsSpinAngle = 0;
        bsRaf = null;
        bsReadout();
      }
    }
    bsRaf = requestAnimationFrame(frame);
  }

  function bsReadout() {
    bsSpins++;
    bsUpdateSpins();
    var tol = bsDef().tol;
    var tr = bsTrueResiduals();
    var rnd = bsLcg((Date.now() % 100000) + bsSpins * 7919);
    var mi = bsMeasure(tr.inner, rnd), mo = bsMeasure(tr.outer, rnd);
    var ti = bsMag(tr.inner), to = bsMag(tr.outer);
    var html = "";
    function line(name, m, t) {
      var ok = t <= tol;
      var cls = ok ? "ok" : "bad";
      /* correction angle: the weight goes opposite the heavy spot, like a real balancer */
      var corr = (m.deg + 180) % 360;
      if (m.mag <= tol * 0.5) {
        return '<div><span class="' + cls + '">' + name + ": BALANCED</span> <span class=\"dim\">(reads " +
          m.mag.toFixed(2) + " oz)</span></div>";
      }
      return '<div><span class="' + cls + '">' + name + ": ADD " + m.mag.toFixed(2) + " OZ AT " + corr +
        " DEG</span> <span class=\"dim\">(tolerance " + tol.toFixed(2) + " oz)</span></div>";
    }
    html += line("INNER", mi, ti) + line("OUTER", mo, to);
    if (ti <= tol && to <= tol) {
      bsBalanced = true;
      bsDone[bsWheelIdx] = true;
      bsRefreshTabs();
      var g = bsGrade();
      bsEls.banner.style.display = "block";
      bsEls.banner.innerHTML = "<h4>Balanced</h4><p>" + bsEsc(bsDef().name) +
        " is true within " + tol.toFixed(2) + " oz on both planes after " + bsSpins +
        (bsSpins === 1 ? " spin" : " spins") + ". Grade: " + g +
        ". Take the balance report for the glovebox.</p>";
      bsEls.report.disabled = false;
      bsEls.spin.disabled = true;
      bsToast("Balanced: " + g);
    } else {
      if (bsSpins >= 10) {
        html += '<div class="dim">The rack would like you to know it has feelings too.</div>';
      } else if (ti > 3 || to > 3) {
        html += '<div class="dim">That wobble is visible from the parking lot. Keep clipping.</div>';
      }
    }
    bsEls.read.innerHTML = html;
    bsDraw();
  }

  function bsReport() {
    if (!bsBalanced) return;
    var tol = bsDef().tol;
    var tr = bsTrueResiduals();
    function wline(name, list) {
      if (!list.length) return "  " + name + ": none";
      return "  " + name + ": " + list.map(function (w) {
        return w.mag.toFixed(2) + " oz at " + w.deg + " deg";
      }).join(", ");
    }
    var txt = [
      "GARAGE INVENTIONS - THE BALANCING STAND",
      "Balance report",
      "----------------------------------------",
      "Wheel:     " + bsDef().name,
      "Tolerance: " + tol.toFixed(2) + " oz per plane",
      "Spins:     " + bsSpins,
      "Grade:     " + bsGrade(),
      "Date:      " + new Date().toISOString().slice(0, 10),
      "",
      "Final residual (true):",
      "  INNER: " + bsMag(tr.inner).toFixed(2) + " oz at " + Math.round(bsAng(tr.inner)) + " deg",
      "  OUTER: " + bsMag(tr.outer).toFixed(2) + " oz at " + Math.round(bsAng(tr.outer)) + " deg",
      "",
      "Weights clipped:",
      wline("INNER", bsWeights.inner),
      wline("OUTER", bsWeights.outer),
      "",
      "Signed: the rack. Witnessed: the shop cat."
    ].join("\n");
    var blob = new Blob([txt], { type: "text/plain" });
    var a = document.createElement("a");
    a.href = (window.URL || window.webkitURL).createObjectURL(blob);
    a.download = "balancing-stand-report.txt";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      (window.URL || window.webkitURL).revokeObjectURL(a.href);
      a.remove();
    }, 500);
    bsToast("Balance report downloaded");
  }

  function bsRefreshTabs() {
    var tabs = bsEls.tabs.children;
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].className = (i === bsWheelIdx ? "on" : "") + (bsDone[i] ? " done" : "");
    }
  }

  function bsSelectWheel(i) {
    if (bsSpinning) return;
    bsWheelIdx = i;
    bsRefreshTabs();
    bsReset();
  }

  function bsBuild() {
    var box = document.querySelector(".dossier .actions");
    if (!box || bs$("bsBtn")) return;

    var st = document.createElement("style");
    st.textContent = BS_CSS;
    document.head.appendChild(st);

    var b = bsEl("button", "secondary", "Run the Balancing Stand");
    b.id = "bsBtn";
    b.addEventListener("click", function () {
      bs$("bsOverlay").classList.add("open");
      bsDraw();
    });
    box.appendChild(b);

    var ov = bsEl("div", "bs-overlay");
    ov.id = "bsOverlay";
    var panel = bsEl("div", "bs-panel");
    panel.innerHTML =
      "<h3>The Balancing Stand</h3>" +
      '<p class="bs-sub">Two-plane wheel balancing. Spin, read the vectors, clip weights on the rim, beat the tolerance. Real balancer math, no excuses.</p>';
    ov.appendChild(panel);
    document.body.appendChild(ov);

    var tabs = bsEl("div", "bs-tabs");
    bsEls.tabs = tabs;
    BS_WHEELS.forEach(function (w, i) {
      var t = bsEl("button", i === 0 ? "on" : "", bsEsc(w.name));
      t.addEventListener("click", function () { bsSelectWheel(i); });
      tabs.appendChild(t);
    });
    panel.appendChild(tabs);

    bsEls.blurb = bsEl("p", "bs-blurb", BS_WHEELS[0].blurb);
    panel.appendChild(bsEls.blurb);

    var grid = bsEl("div", "bs-grid");

    var wcard = bsEl("div", "bs-card");
    wcard.appendChild(bsEl("h5", null, "Wheel (tap the rim to clip a weight)"));
    var c = document.createElement("canvas");
    c.id = "bsCanvas";
    c.width = 600; c.height = 600;
    c.setAttribute("aria-label", "Wheel face. Tap the rim to clip a weight at that angle.");
    c.addEventListener("click", bsPlace);
    wcard.appendChild(c);
    wcard.appendChild(bsEl("p", "bs-hint", "Angles are in degrees clockwise from 12 o\u2019clock, snapped to 10 degree slots like real clip positions. The readout tells you exactly where to clip each weight."));
    grid.appendChild(wcard);

    var ccard = bsEl("div", "bs-card");
    ccard.appendChild(bsEl("h5", null, "Controls"));

    ccard.appendChild(bsEl("p", "bs-ctl-label", "Plane"));
    var prow = bsEl("div", "bs-ctl-row");
    bsEls.planeBtns = {};
    ["inner", "outer"].forEach(function (p) {
      var pb = bsEl("button", p === "inner" ? "on" : "", p.toUpperCase());
      pb.addEventListener("click", function () {
        bsPlane = p;
        bsEls.planeBtns.inner.className = p === "inner" ? "on" : "";
        bsEls.planeBtns.outer.className = p === "outer" ? "on" : "";
        bsDraw();
      });
      bsEls.planeBtns[p] = pb;
      prow.appendChild(pb);
    });
    ccard.appendChild(prow);

    ccard.appendChild(bsEl("p", "bs-ctl-label", "Clip weight size"));
    var srow = bsEl("div", "bs-ctl-row");
    bsEls.sizeBtns = [];
    BS_SIZES.forEach(function (s) {
      var sb = bsEl("button", s === bsSize ? "on" : "", s.toFixed(2) + " oz");
      sb.addEventListener("click", function () {
        bsSize = s;
        bsEls.sizeBtns.forEach(function (x, xi) {
          x.className = BS_SIZES[xi] === s ? "on" : "";
        });
      });
      bsEls.sizeBtns.push(sb);
      srow.appendChild(sb);
    });
    ccard.appendChild(srow);

    ccard.appendChild(bsEl("p", "bs-ctl-label", "Weights on the rim"));
    ccard.appendChild(bsEl("p", "bs-ctl-label", "Inner plane"));
    var ci = bsEl("div", "bs-chips"); bsEls.chips_inner = ci; ccard.appendChild(ci);
    ccard.appendChild(bsEl("p", "bs-ctl-label", "Outer plane"));
    var co = bsEl("div", "bs-chips"); bsEls.chips_outer = co; ccard.appendChild(co);
    grid.appendChild(ccard);
    panel.appendChild(grid);

    bsEls.banner = bsEl("div", "bs-banner", "");
    bsEls.banner.style.display = "none";
    panel.appendChild(bsEls.banner);

    bsEls.read = bsEl("div", "bs-read",
      '<span class="dim">Spin the wheel to read the imbalance. Then clip weights on the rim: tap the wheel face at the angle you want, on the selected plane.</span>');
    panel.appendChild(bsEls.read);

    var foot = bsEl("div", "bs-foot");
    var spin = bsEl("button", "primary", "Spin the wheel");
    bsEls.spin = spin;
    spin.addEventListener("click", bsSpin);
    var fresh = bsEl("button", null, "New imbalance");
    fresh.addEventListener("click", function () { if (!bsSpinning) { bsReset(); bsToast("Fresh wobble, same wheel"); } });
    var rep = bsEl("button", null, "Download balance report");
    bsEls.report = rep;
    rep.disabled = true;
    rep.addEventListener("click", bsReport);
    bsEls.spins = bsEl("span", "bs-spins", "Spins: 0");
    bsEls.spins.style.alignSelf = "center";
    var close = bsEl("button", null, "Close");
    close.addEventListener("click", function () {
      bs$("bsOverlay").classList.remove("open");
      if (bsRaf && typeof cancelAnimationFrame === "function") cancelAnimationFrame(bsRaf);
      bsRaf = null;
      bsSpinning = false;
      bsSpinAngle = 0;
      bsEls.spin.disabled = bsBalanced;
    });
    foot.appendChild(spin);
    foot.appendChild(fresh);
    foot.appendChild(rep);
    foot.appendChild(bsEls.spins);
    foot.appendChild(close);
    panel.appendChild(foot);

    bsReset(20260909);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bsBuild);
  } else {
    bsBuild();
  }

  /* node test hook: harmless in the browser */
  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      BS: {
        newWheel: bsNewWheel,
        residual: bsResidual,
        measure: bsMeasure,
        mag: bsMag,
        ang: bsAng,
        vec: bsVec,
        WHEELS: BS_WHEELS
      }
    };
  }

})();
/* ============================================================
   THE WIPE STATION
   NIST 800-88 drive sanitization bench for the OLD IRON intake
   rack. Pick a method per drive (Clear / Purge / Destroy), run
   the passes, watch verification sample every block, and issue
   per-serial certificates. Fail states are real: bad-sector
   spinners and lying firmware cannot be purged, they must be
   destroyed. Self-contained, appended at the end of features.js.
   ============================================================ */
(function () {
  "use strict";

  function ws$(id) { return document.getElementById(id); }
  function wsEl(tag, cls, html) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (html != null) d.innerHTML = html;
    return d;
  }
  function wsEsc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function wsToast(msg) {
    if (typeof window.showToast === "function") { window.showToast(msg); return; }
    var t = ws$("toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(function () { t.classList.remove("show"); }, 1800);
  }

  var WS_CSS = [
    ".ws-overlay{position:fixed;inset:0;background:rgba(4,7,7,.92);z-index:90;display:none;overflow-y:auto;padding:18px 12px;}",
    ".ws-overlay.open{display:block;}",
    ".ws-panel{max-width:1060px;margin:0 auto;background:var(--panel);border:1px solid var(--line);padding:22px;}",
    ".ws-panel h3{font-family:'Chakra Petch',sans-serif;font-size:26px;margin:0 0 4px;text-transform:uppercase;letter-spacing:.02em;color:var(--acid);}",
    ".ws-sub{color:#8a9a96;font-size:12px;line-height:1.7;margin:0 0 16px;max-width:70ch;}",
    ".ws-sub b{color:var(--cyan);font-weight:600;}",
    ".ws-methods{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:0 0 16px;}",
    ".ws-method{border:1px solid var(--line);background:var(--panel-2);padding:10px 12px;font-size:11px;line-height:1.6;color:#9aa9a5;}",
    ".ws-method h6{margin:0 0 4px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--orange);}",
    ".ws-method p{margin:0;}",
    ".ws-bays{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;}",
    "@media(max-width:760px){.ws-bays{grid-template-columns:1fr;}.ws-methods{grid-template-columns:1fr;}}",
    ".ws-bay{border:1px solid var(--line);background:var(--panel-2);padding:14px;position:relative;}",
    ".ws-bay .ws-bayhead{display:flex;justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap;}",
    ".ws-bay h5{margin:0;font-family:'Chakra Petch',sans-serif;font-size:16px;text-transform:uppercase;}",
    ".ws-bay .ws-sn{font-size:10px;color:#72827f;letter-spacing:.08em;}",
    ".ws-bay .ws-meta{font-size:11px;color:#9aa9a5;margin:6px 0 10px;line-height:1.6;}",
    ".ws-bay .ws-note{font-size:11px;color:var(--cyan);margin:0 0 10px;line-height:1.6;min-height:34px;}",
    ".ws-status{font-size:10px;letter-spacing:.14em;text-transform:uppercase;padding:3px 8px;border:1px solid var(--line);}",
    ".ws-status.pending{color:#8a9a96;}",
    ".ws-status.running{color:var(--cyan);border-color:var(--cyan);}",
    ".ws-status.clean{color:var(--acid);border-color:var(--acid);}",
    ".ws-status.destroyed{color:var(--orange);border-color:var(--orange);}",
    ".ws-status.failed{color:#ff5d5d;border-color:#ff5d5d;}",
    ".ws-mrow{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;}",
    ".ws-mrow button{flex:1 1 30%;min-height:44px;background:var(--black);border:1px solid var(--line);color:var(--ink);font:inherit;font-size:11px;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;padding:8px 4px;}",
    ".ws-mrow button.on{border-color:var(--acid);color:var(--acid);}",
    ".ws-mrow button:disabled{opacity:.45;cursor:default;}",
    ".ws-bar{height:10px;background:var(--black);border:1px solid var(--line);margin:8px 0;position:relative;overflow:hidden;}",
    ".ws-bar i{position:absolute;inset:0;width:0%;background:var(--cyan);}",
    ".ws-phase{font-size:11px;color:#8a9a96;min-height:18px;margin:0 0 6px;}",
    ".ws-grid{display:grid;grid-template-columns:repeat(16,minmax(0,1fr));gap:2px;margin:8px 0;}",
    ".ws-cell{aspect-ratio:1;background:#101515;border:1px solid #1c2423;}",
    ".ws-cell.ok{background:var(--acid);}",
    ".ws-cell.bad{background:#ff5d5d;}",
    ".ws-cell.check{background:var(--cyan);}",
    ".ws-result{font-size:12px;line-height:1.6;margin:8px 0 0;min-height:38px;}",
    ".ws-result.good{color:var(--acid);}",
    ".ws-result.bad{color:#ff5d5d;}",
    ".ws-result.warn{color:var(--orange);}",
    ".ws-foot{display:flex;gap:8px;flex-wrap:wrap;margin-top:18px;align-items:center;}",
    ".ws-foot button{min-height:48px;padding:12px 18px;background:var(--black);border:1px solid var(--line);color:var(--ink);font:inherit;font-size:12px;letter-spacing:.08em;text-transform:uppercase;cursor:pointer;}",
    ".ws-foot button.primary{border-color:var(--acid);color:var(--acid);}",
    ".ws-foot button:disabled{opacity:.45;cursor:default;}",
    ".ws-banner{border:1px solid var(--acid);background:rgba(170,255,0,.06);padding:14px 16px;margin-top:16px;display:none;}",
    ".ws-banner h4{margin:0 0 6px;font-family:'Chakra Petch',sans-serif;font-size:18px;color:var(--acid);text-transform:uppercase;}",
    ".ws-banner p{margin:0;font-size:12px;line-height:1.7;color:var(--ink);}",
    ".ws-summary{font-size:12px;line-height:1.8;color:#9aa9a5;margin-top:16px;display:none;}",
    ".ws-summary table{width:100%;border-collapse:collapse;font-size:11px;}",
    ".ws-summary td,.ws-summary th{border:1px solid var(--line);padding:6px 8px;text-align:left;}",
    ".ws-summary th{color:var(--cyan);text-transform:uppercase;letter-spacing:.1em;font-size:10px;}"
  ].join("\n");

  var WS_METHODS = {
    CLEAR:   { label: "Clear",   cost: 8,  blurb: "Single overwrite pass over every addressable block, then sampled read-back. Cheap and slow. On flash media the over-provisioned cells are never touched." },
    PURGE:   { label: "Purge",   cost: 4,  blurb: "Firmware-level command (ATA Secure Erase, NVMe Format). Fast and thorough, but the drive has to tell the truth, and verification has to reach every sector." },
    DESTROY: { label: "Destroy", cost: 12, blurb: "Physical shred to 6mm particles. No data survives, no certificate needed, no drive either. The honest answer for dying media." }
  };

  var WS_DRIVES = [
    { id: 0, name: "WD Blue 2TB", sn: "WX81A49N2K77", cap: "2 TB", iface: "SATA 6Gb/s", media: "HDD", blurb: "Retired office spinner. SMART is clean, no grown defects. A textbook candidate." },
    { id: 1, name: "Samsung 970 EVO 1TB", sn: "S5XANX0T991822B", cap: "1 TB", iface: "NVMe Gen3", media: "SSD", blurb: "NVMe stick from a decommissioned workstation. Firmware is current and behaves." },
    { id: 2, name: "Seagate Barracuda 4TB", sn: "Z1D0Q2PW44H9", cap: "4 TB", iface: "SATA 6Gb/s", media: "HDD", blurb: "Click of death adjacent. Grown defect list is long, some sectors will never read again." },
    { id: 3, name: "SanDisk Ultra 512GB", sn: "203917QABX44", cap: "512 GB", iface: "SATA 6Gb/s", media: "SSD", blurb: "Budget SSD with a known firmware quirk: Secure Erase reports success while stale blocks linger in spare cells." }
  ];

  var wsState = WS_DRIVES.map(function () {
    return { method: "CLEAR", status: "pending", running: false, failNote: "", done: false, cert: null };
  });
  var wsEls = {};
  var wsTotalCost = 0;
  function wsOutcome(drive, method) {
    if (method === "DESTROY") {
      return { pass: true, destroy: true, cells: [], note: "Shredded to 6mm particles. Verification not applicable: the media no longer exists." };
    }
    if (method === "PURGE" && drive.id === 2) {
      return { pass: false, cells: [7, 23, 58, 91, 120, 141], note: "FAIL: grown-defect sectors are unreadable, so verification cannot confirm them. Purge cannot sanitize what it cannot reach. Per NIST 800-88, this media must be destroyed." };
    }
    if (method === "PURGE" && drive.id === 3) {
      return { pass: false, cells: [44, 45, 100, 101], note: "FAIL: verification found stale data in over-provisioned cells after a successful-looking Secure Erase. The firmware lied. Per NIST 800-88, this media must be destroyed." };
    }
    if (method === "CLEAR" && (drive.media === "SSD")) {
      return { pass: true, caveat: true, cells: [], note: "PASS with caveat: one overwrite pass completed and sampled blocks read back clean. Warning: clear does not sanitize over-provisioned flash cells (NIST 800-88). Certificate carries the caveat." };
    }
    return { pass: true, cells: [], note: "PASS: overwrite pass completed, sampled blocks read back clean. Media is sanitized." };
  }

  function wsStopTimer(s) {
    if (s && s.timer) { clearInterval(s.timer); s.timer = null; }
  }
  function wsStopAll() {
    wsState.forEach(wsStopTimer);
  }

  function wsRefreshBay(i) {
    var s = wsState[i], els = wsEls.bays[i];
    var st = els.status;
    st.textContent = s.status.toUpperCase().replace("CLEAN", "SANITIZED");
    st.className = "ws-status " + s.status;
    els.methodBtns.forEach(function (b, bi) {
      var m = ["CLEAR", "PURGE", "DESTROY"][bi];
      b.className = (s.method === m && !s.done) ? "on" : "";
      b.disabled = s.running || s.done;
    });
    els.run.disabled = s.running || s.done;
    els.rerun.style.display = (s.done && s.status === "failed") ? "" : "none";
  }

  function wsRefreshAll() {
    for (var i = 0; i < WS_DRIVES.length; i++) wsRefreshBay(i);
    var done = wsState.filter(function (s) { return s.cert; }).length;
    wsEls.dl.disabled = done === 0;
    var allResolved = wsState.every(function (s) { return s.status === "clean" || s.status === "destroyed"; });
    if (allResolved && !wsEls.bannerDone) {
      wsEls.bannerDone = true;
      var clean = wsState.filter(function (s) { return s.status === "clean"; }).length;
      var dest = wsState.filter(function (s) { return s.status === "destroyed"; }).length;
      var cav = wsState.filter(function (s) { return s.cert && s.cert.caveat; }).length;
      wsEls.banner.style.display = "block";
      wsEls.banner.querySelector("p").innerHTML =
        "All four drives are resolved: <b>" + clean + " sanitized</b>, <b>" + dest + " destroyed</b>. " +
        "Total shop cost <b>$" + wsTotalCost + "</b>" +
        (cav ? " (" + cav + " certificate" + (cav > 1 ? "s carry" : " carries") + " a flash caveat)" : "") +
        ". Every serial below has its paperwork. That is the whole job.";
      wsEls.summary.style.display = "block";
      wsBuildSummary();
      wsToast("Shift complete: all drives resolved");
    }
  }

  function wsBuildSummary() {
    var html = "<table><tr><th>Drive</th><th>Serial</th><th>Method</th><th>Result</th><th>Cost</th></tr>";
    WS_DRIVES.forEach(function (d, i) {
      var s = wsState[i];
      var res = s.status === "clean" ? (s.cert && s.cert.caveat ? "Sanitized (flash caveat)" : "Sanitized") :
                s.status === "destroyed" ? "Destroyed" : "Failed";
      html += "<tr><td>" + wsEsc(d.name) + "</td><td>" + wsEsc(d.sn) + "</td><td>" +
        wsEsc(WS_METHODS[s.cert ? s.cert.method : "CLEAR"].label) + "</td><td>" + wsEsc(res) +
        "</td><td>$" + (s.cert ? s.cert.cost : 0) + "</td></tr>";
    });
    html += "</table>";
    wsEls.summary.innerHTML = "<h4>Shift summary</h4>" + html;
  }

  function wsRun(i) {
    var d = WS_DRIVES[i], s = wsState[i], els = wsEls.bays[i];
    if (s.running || s.done) return;
    s.running = true;
    s.status = "running";
    s.failNote = "";
    var m = WS_METHODS[s.method];
    wsRefreshBay(i);
    els.result.className = "ws-result";
    els.result.textContent = "";

    var outcome = wsOutcome(d, s.method);
    var totalTicks = s.method === "PURGE" ? 26 : s.method === "DESTROY" ? 34 : 60;
    var tick = 0;
    var cells = els.cells;
    for (var ci = 0; ci < cells.length; ci++) {
      cells[ci].className = "ws-cell";
    }

    var phases = s.method === "CLEAR"
      ? ["Seating drive in the write blocker...", "Overwrite pass 1 of 1: writing zeros to every addressable block...", "Read-back verification: sampling 160 blocks..."]
      : s.method === "PURGE"
      ? ["Issuing firmware sanitize command...", "Waiting on the controller (do not power-cycle)...", "Full verification: reading every block..."]
      : ["Feeding drive to the shredder...", "Grinding to 6mm particles...", "Sweeping up the confetti..."];

    wsStopTimer(s);
    s.timer = setInterval(function () {
      tick++;
      var pct = Math.min(100, Math.round((tick / totalTicks) * 100));
      els.barFill.style.width = pct + "%";
      var ph = tick < totalTicks * 0.35 ? 0 : tick < totalTicks * 0.8 ? 1 : 2;
      els.phase.textContent = phases[ph] + " " + pct + "%";

      if (tick >= totalTicks * 0.55 && tick < totalTicks) {
        var lit = Math.floor(((tick - totalTicks * 0.55) / (totalTicks * 0.45)) * cells.length);
        for (var k = 0; k < cells.length; k++) {
          if (k < lit && cells[k].className === "ws-cell") {
            var isBad = outcome.cells.indexOf(k) !== -1;
            cells[k].className = isBad ? "ws-cell bad" : "ws-cell ok";
          }
        }
      }

      if (tick >= totalTicks) {
        wsStopTimer(s);
        wsFinish(i, outcome);
      }
    }, 70);
  }

  function wsFinish(i, outcome) {
    var d = WS_DRIVES[i], s = wsState[i], els = wsEls.bays[i];
    var m = WS_METHODS[s.method];
    s.running = false;
    wsTotalCost += m.cost;
    els.barFill.style.width = "100%";
    els.phase.textContent = "Done.";
    if (outcome.pass) {
      s.done = true;
      s.status = outcome.destroy ? "destroyed" : "clean";
      s.cert = { method: s.method, cost: m.cost, caveat: !!outcome.caveat, note: outcome.note };
      els.result.className = "ws-result " + (outcome.caveat ? "warn" : "good");
      els.result.textContent = outcome.note + " Cost: $" + m.cost + ".";
      wsToast(d.name + (outcome.destroy ? ": destroyed" : ": sanitized"));
    } else {
      s.status = "failed";
      s.done = true;
      s.failNote = outcome.note;
      els.result.className = "ws-result bad";
      els.result.textContent = outcome.note + " This drive is not resolved: pick DESTROY and run again.";
      wsToast(d.name + ": purge failed");
    }
    wsRefreshBay(i);
    wsRefreshAll();
  }

  function wsRerun(i) {
    var s = wsState[i], els = wsEls.bays[i];
    wsStopTimer(s);
    s.done = false;
    s.status = "pending";
    s.running = false;
    s.cert = null;
    s.failNote = "";
    s.method = "DESTROY";
    els.barFill.style.width = "0%";
    els.phase.textContent = "";
    els.result.className = "ws-result";
    els.result.textContent = "";
    els.cells.forEach(function (c) { c.className = "ws-cell"; });
    wsRefreshBay(i);
  }

  function wsDownload() {
    var lines = [];
    lines.push("OLD IRON INTAKE: DRIVE SANITIZATION CERTIFICATES");
    lines.push("Bench: The Wipe Station, Garage Inventions");
    lines.push("Standard: NIST Special Publication 800-88 Rev. 1");
    lines.push("Date: " + new Date().toISOString().slice(0, 10));
    lines.push("Operator: Emi");
    lines.push("");
    WS_DRIVES.forEach(function (d, i) {
      var s = wsState[i];
      if (!s.cert) return;
      var m = WS_METHODS[s.cert.method];
      lines.push("----------------------------------------");
      if (s.cert.method === "DESTROY") {
        lines.push("CERTIFICATE OF DESTRUCTION");
      } else {
        lines.push("CERTIFICATE OF SANITIZATION");
      }
      lines.push("Drive: " + d.name + " (" + d.cap + ", " + d.iface + ", " + d.media + ")");
      lines.push("Serial: " + d.sn);
      lines.push("Method: " + m.label + " (" + s.cert.method + ")");
      lines.push("Verification: " + (s.cert.method === "DESTROY" ? "not applicable, media shredded" : "read-back, blocks verified"));
      if (s.cert.caveat) lines.push("CAVEAT: Clear on flash media does not sanitize over-provisioned cells (NIST 800-88).");
      lines.push("Result: " + (s.cert.method === "DESTROY" ? "destroyed" : "sanitized") + ", $" + s.cert.cost);
      lines.push("");
    });
    lines.push("----------------------------------------");
    lines.push("Total shop cost: $" + wsTotalCost);
    lines.push("End of certificates.");
    var blob = new Blob([lines.join("\n")], { type: "text/plain" });
    var a = document.createElement("a");
    a.href = (window.URL || window.webkitURL).createObjectURL(blob);
    a.download = "wipe-station-certificates.txt";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      (window.URL || window.webkitURL).revokeObjectURL(a.href);
      a.remove();
    }, 500);
    wsToast("Certificates downloaded");
  }

  function wsBuild() {
    var box = document.querySelector(".dossier .actions");
    if (!box || ws$("wsBtn")) return;

    var st = document.createElement("style");
    st.textContent = WS_CSS;
    document.head.appendChild(st);

    var b = wsEl("button", "secondary", "Run the Wipe Station");
    b.id = "wsBtn";
    b.addEventListener("click", function () {
      ws$("wsOverlay").classList.add("open");
    });
    box.appendChild(b);

    var ov = wsEl("div", "ws-overlay");
    ov.id = "wsOverlay";
    var panel = wsEl("div", "ws-panel");
    panel.innerHTML =
      "<h3>The Wipe Station</h3>" +
      '<p class="ws-sub">The intake bench for <b>OLD IRON</b>: every retired drive gets a method decision, ' +
      "verified passes, and a per-serial certificate before it leaves the shop. " +
      "Pick <b>Clear</b>, <b>Purge</b>, or <b>Destroy</b> per drive, run it, and watch verification. " +
      "Bad media cannot be purged, it can only be destroyed. That is the whole puzzle.</p>";
    ov.appendChild(panel);
    document.body.appendChild(ov);

    var mg = wsEl("div", "ws-methods");
    Object.keys(WS_METHODS).forEach(function (k) {
      var m = WS_METHODS[k];
      mg.appendChild(wsEl("div", "ws-method",
        "<h6>" + m.label + " ($" + m.cost + ")</h6><p>" + wsEsc(m.blurb) + "</p>"));
    });
    panel.appendChild(mg);

    var bays = wsEl("div", "ws-bays");
    wsEls.bays = [];
    WS_DRIVES.forEach(function (d, i) {
      var bay = wsEl("div", "ws-bay");
      var head = wsEl("div", "ws-bayhead");
      head.appendChild(wsEl("h5", null, wsEsc(d.name)));
      var status = wsEl("span", "ws-status pending", "PENDING");
      head.appendChild(status);
      bay.appendChild(head);
      bay.appendChild(wsEl("p", "ws-sn", "S/N " + wsEsc(d.sn) + " &middot; " + wsEsc(d.cap) + " &middot; " + wsEsc(d.iface) + " &middot; " + wsEsc(d.media)));
      bay.appendChild(wsEl("p", "ws-note", wsEsc(d.blurb)));

      var mrow = wsEl("div", "ws-mrow");
      var btns = [];
      ["CLEAR", "PURGE", "DESTROY"].forEach(function (mk, bi) {
        var mb = wsEl("button", bi === 0 ? "on" : "", WS_METHODS[mk].label + " $" + WS_METHODS[mk].cost);
        mb.addEventListener("click", function () {
          var s = wsState[i];
          if (s.running || s.done) return;
          s.method = mk;
          wsRefreshBay(i);
        });
        btns.push(mb);
        mrow.appendChild(mb);
      });
      bay.appendChild(mrow);

      var phase = wsEl("p", "ws-phase", "");
      bay.appendChild(phase);
      var bar = wsEl("div", "ws-bar");
      var fill = wsEl("i", null, "");
      bar.appendChild(fill);
      bay.appendChild(bar);

      var grid = wsEl("div", "ws-grid");
      var cells = [];
      for (var c = 0; c < 160; c++) {
        var cell = wsEl("div", "ws-cell", "");
        grid.appendChild(cell);
        cells.push(cell);
      }
      bay.appendChild(grid);

      var result = wsEl("p", "ws-result", "");
      bay.appendChild(result);

      var brow = wsEl("div", "ws-mrow");
      var run = wsEl("button", "", "Run sanitization");
      run.style.flex = "1 1 100%";
      run.addEventListener("click", function () { wsRun(i); });
      brow.appendChild(run);
      var rerun = wsEl("button", "", "Reset bay");
      rerun.style.display = "none";
      rerun.style.flex = "1 1 100%";
      rerun.addEventListener("click", function () { wsRerun(i); });
      brow.appendChild(rerun);
      bay.appendChild(brow);

      bays.appendChild(bay);
      wsEls.bays.push({ status: status, methodBtns: btns, run: run, rerun: rerun, phase: phase, barFill: fill, cells: cells, result: result });
    });
    panel.appendChild(bays);

    wsEls.banner = wsEl("div", "ws-banner",
      "<h4>Shift complete</h4><p></p>");
    panel.appendChild(wsEls.banner);
    wsEls.bannerDone = false;

    wsEls.summary = wsEl("div", "ws-summary", "");
    panel.appendChild(wsEls.summary);

    var foot = wsEl("div", "ws-foot");
    var dl = wsEl("button", "primary", "Download wipe certificates");
    dl.disabled = true;
    dl.addEventListener("click", wsDownload);
    wsEls.dl = dl;
    var close = wsEl("button", null, "Close");
    close.addEventListener("click", function () {
      wsStopAll();
      ws$("wsOverlay").classList.remove("open");
    });
    foot.appendChild(dl);
    foot.appendChild(close);
    panel.appendChild(foot);
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", wsBuild);
    } else {
      wsBuild();
    }
  }

  /* node test hook: harmless in the browser */
  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      WS: {
        outcome: wsOutcome,
        DRIVES: WS_DRIVES,
        METHODS: WS_METHODS
      }
    };
  }

})();
/* ============================================================
   THE PIPELINE HAZARD LAB
   A classic five-stage RV32I pipeline (IF/ID/EX/MEM/WB) with real
   forwarding, real load-use and control stalls, and a swappable
   branch predictor. Edit the program, flip forwarding, swap the
   predictor, and watch cycles, stalls, and forwarding arcs move.
   Three trials with cycle budgets, plus a downloadable profile
   card. Companion bench to the Silicon Anvil, built for the
   portfolio's RISC-V focus.
   Pure sim + assembler between PH-SIM-BEGIN/END are shared
   verbatim with the node test harness.
   ============================================================ */
(function () {
  "use strict";

  /* ---------- local helpers (never touch outer scope) ---------- */
  var ph$ = function (id) { return document.getElementById(id); };
  function phEl(tag, cls, html) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (html != null) d.innerHTML = html;
    return d;
  }
  function phToast(msg) {
    if (typeof window.showToast === "function") { window.showToast(msg); return; }
    var t = ph$("toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(function () { t.classList.remove("show"); }, 1800);
  }
  function phEsc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function phHex(n) {
    return "0x" + ("00000000" + ((n | 0) >>> 0).toString(16)).slice(-8);
  }

  /* ---------- injected styles ---------- */
  var PH_CSS = [
    ".ph-overlay{position:fixed;inset:0;background:rgba(4,7,7,.93);z-index:95;display:none;overflow-y:auto;padding:18px 12px;}",
    ".ph-overlay.open{display:block;}",
    ".ph-panel{max-width:1140px;margin:0 auto;background:var(--panel);border:1px solid var(--line);padding:22px;}",
    ".ph-panel h3{font-family:'Chakra Petch',sans-serif;font-size:26px;margin:0 0 4px;text-transform:uppercase;letter-spacing:.02em;color:var(--acid);}",
    ".ph-sub{font-size:12px;line-height:1.65;color:#9fb3ae;margin:0 0 14px;max-width:76ch;}",
    ".ph-sub a{color:var(--cyan);text-decoration:none;border-bottom:1px dotted var(--cyan);}",
    ".ph-tabs{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;}",
    ".ph-tab{background:var(--panel-2);border:1px solid var(--line);color:var(--ink);font:inherit;font-size:11px;letter-spacing:.08em;text-transform:uppercase;padding:10px 14px;cursor:pointer;min-height:44px;}",
    ".ph-tab.on{border-color:var(--acid);color:var(--acid);}",
    ".ph-brief{border:1px dashed var(--orange);background:rgba(255,107,44,.05);padding:12px 14px;margin-bottom:12px;font-size:12px;line-height:1.6;color:var(--ink);display:none;}",
    ".ph-brief.show{display:block;}",
    ".ph-brief b{color:var(--orange);}",
    ".ph-brief .par{color:var(--acid);}",
    ".ph-toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:12px;}",
    ".ph-toolbar .secondary{min-height:44px;}",
    ".ph-toolbar select{background:var(--black,#0a0f0e);border:1px solid var(--line);color:var(--ink);font:inherit;font-size:11px;padding:10px 8px;min-height:44px;}",
    ".ph-toolbar .lbl{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#7c8d89;}",
    ".ph-main{display:grid;grid-template-columns:minmax(300px,5fr) 7fr;gap:14px;}",
    ".ph-edhead{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;}",
    ".ph-edhead h4,.ph-righth h4{margin:0;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--cyan);font-weight:600;}",
    ".ph-edhead .secondary{min-height:36px;font-size:11px;padding:6px 10px;}",
    ".ph-edwrap{display:grid;grid-template-columns:40px 1fr;border:1px solid var(--line);background:#0a0f0e;}",
    ".ph-gutter{background:var(--panel-2);color:#5f726e;font-family:monospace;font-size:12px;line-height:1.7;padding:10px 0;text-align:center;user-select:none;overflow:hidden;}",
    ".ph-gutter div{height:20.4px;}",
    ".ph-gutter div.hot{color:#ffb199;background:rgba(255,107,44,.18);cursor:pointer;}",
    ".ph-ed{width:100%;min-height:340px;background:transparent;border:0;color:var(--ink);font-family:monospace;font-size:12px;line-height:1.7;padding:10px 12px;resize:vertical;white-space:pre;}",
    ".ph-ed:focus{outline:1px solid var(--cyan);}",
    ".ph-errors{font-size:11px;color:#ff9d7a;margin:6px 0 0;line-height:1.6;display:none;}",
    ".ph-errors.show{display:block;}",
    ".ph-blame{margin-top:10px;font-size:11px;line-height:1.7;color:#9fb3ae;}",
    ".ph-blame .brow{cursor:pointer;padding:4px 6px;border-left:2px solid var(--orange);margin-bottom:4px;background:rgba(255,107,44,.05);}",
    ".ph-blame .brow:hover{background:rgba(255,107,44,.12);}",
    ".ph-blame .brow b{color:var(--orange);}",
    ".ph-strip{display:flex;align-items:stretch;gap:4px;margin-bottom:10px;overflow-x:auto;padding-bottom:4px;}",
    ".ph-stage{flex:1 1 0;min-width:118px;border:1px solid var(--line);background:var(--panel-2);padding:8px;min-height:96px;}",
    ".ph-stage h5{margin:0 0 6px;font-size:10px;letter-spacing:.14em;text-transform:uppercase;}",
    ".ph-stage.s0 h5{color:var(--cyan);}.ph-stage.s1 h5{color:var(--acid);}.ph-stage.s2 h5{color:var(--orange);}.ph-stage.s3 h5{color:#c9a2ff;}.ph-stage.s4 h5{color:#7dffb0;}",
    ".ph-stage .inst{font-family:monospace;font-size:11px;line-height:1.5;color:var(--ink);overflow-wrap:anywhere;}",
    ".ph-stage .empty{color:#4d5f5b;font-size:11px;}",
    ".ph-stage.bubble{border-color:var(--orange);animation:phPulse 0.9s ease-in-out infinite;}",
    ".ph-stage.bubble .inst{color:var(--orange);}",
    ".ph-stage.flushed{border-color:#ff5d5d;}",
    "@keyframes phPulse{0%,100%{box-shadow:0 0 0 0 rgba(255,107,44,0);}50%{box-shadow:0 0 12px 0 rgba(255,107,44,.45);}}",
    ".ph-fwdtag{display:inline-block;font-size:9px;letter-spacing:.06em;color:#0a0f0e;background:var(--acid);padding:1px 5px;margin:2px 2px 0 0;font-family:monospace;}",
    ".ph-arrow{align-self:center;color:#4d5f5b;font-size:16px;flex:none;}",
    ".ph-tracewrap{border:1px solid var(--line);overflow:auto;max-height:300px;background:#0a0f0e;}",
    ".ph-trace{border-collapse:collapse;font-family:monospace;font-size:10px;white-space:nowrap;}",
    ".ph-trace th,.ph-trace td{border:1px solid #1c2725;padding:3px 7px;text-align:center;}",
    ".ph-trace th{position:sticky;top:0;background:var(--panel-2);color:#7c8d89;z-index:2;}",
    ".ph-trace td.pc{position:sticky;left:0;background:var(--panel-2);color:var(--ink);text-align:left;z-index:1;max-width:220px;overflow:hidden;text-overflow:ellipsis;}",
    ".ph-trace td.c-IF{color:var(--cyan);}.ph-trace td.c-ID{color:var(--acid);}.ph-trace td.c-EX{color:var(--orange);font-weight:bold;}.ph-trace td.c-MEM{color:#c9a2ff;}.ph-trace td.c-WB{color:#7dffb0;}",
    ".ph-trace tr.killed td{opacity:.35;text-decoration:line-through;}",
    ".ph-trace td.cur{background:rgba(199,255,56,.10);}",
    ".ph-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(105px,1fr));gap:8px;margin:14px 0;}",
    ".ph-stat{border:1px solid var(--line);background:var(--panel-2);padding:10px 12px;}",
    ".ph-stat h4{margin:0 0 4px;font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:var(--cyan);font-weight:600;}",
    ".ph-stat p{margin:0;font-family:monospace;font-size:17px;color:var(--ink);}",
    ".ph-stat p.warn{color:var(--orange);}",
    ".ph-stat p.good{color:var(--acid);}",
    ".ph-regmem{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:6px;}",
    ".ph-regmem details{border:1px solid var(--line);background:var(--panel-2);padding:10px 12px;}",
    ".ph-regmem summary{cursor:pointer;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--cyan);min-height:44px;display:flex;align-items:center;}",
    ".ph-regtable{font-family:monospace;font-size:10px;line-height:1.7;color:var(--ink);columns:2;}",
    ".ph-regtable .rz{color:#4d5f5b;}",
    ".ph-regtable .rhot{color:var(--acid);}",
    ".ph-banner{border:1px solid var(--acid);background:rgba(199,255,56,.06);padding:14px 16px;margin:14px 0;display:none;}",
    ".ph-banner.show{display:block;}",
    ".ph-banner h4{margin:0 0 6px;font-family:'Chakra Petch',sans-serif;font-size:18px;text-transform:uppercase;color:var(--acid);}",
    ".ph-banner p{margin:0;font-size:12px;line-height:1.6;color:var(--ink);}",
    ".ph-banner.fail{border-color:#ff5d5d;background:rgba(255,93,93,.06);}",
    ".ph-banner.fail h4{color:#ff5d5d;}",
    ".ph-foot{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;}",
    ".ph-foot .secondary,.ph-foot .primary{flex:1;min-height:44px;}",
    ".ph-foot .primary{border-color:var(--acid);color:var(--acid);}",
    ".ph-overlay .primary{width:auto;min-width:0;margin-top:0;background:transparent;border:1px solid var(--acid);color:var(--acid);font-family:inherit;font-size:11px;font-weight:400;letter-spacing:.06em;padding:10px 12px;overflow:visible;}",
    ".ph-overlay .primary::after{display:none;}",
    ".ph-overlay button{white-space:normal;line-height:1.5;overflow-wrap:anywhere;}",
    ".ph-toolbar .primary{min-width:0;}",
    "@media (max-width:900px){",
    ".ph-main{grid-template-columns:1fr;}",
    ".ph-regmem{grid-template-columns:1fr;}",
    ".ph-panel h3{font-size:20px;}",
    ".ph-overlay{padding:10px 8px;}",
    ".ph-panel{padding:14px;}",
    ".ph-righth{order:-1;}",
    ".ph-strip{flex-direction:column;align-items:stretch;overflow:visible;padding-bottom:0;}",
    ".ph-stage{flex:none;min-width:0;min-height:0;}",
    ".ph-arrow{transform:rotate(90deg);}",
    ".ph-ed{font-size:16px;line-height:1.6;min-height:260px;}",
    ".ph-gutter{font-size:16px;line-height:1.6;}",
    ".ph-gutter div{height:25.6px;}",
    ".ph-toolbar select{font-size:16px;}",
    ".ph-regtable{columns:1;}",
    ".ph-foot{flex-direction:column;}",
    ".ph-foot .secondary,.ph-foot .primary{flex:none;width:100%;}",
    "}"
  ].join("\n");

/* PH-SIM-BEGIN */
var PH_MEM_WORDS = 256;

var PH_ABI = { zero: 0, ra: 1, sp: 2, gp: 3, tp: 4, t0: 5, t1: 6, t2: 7, s0: 8, fp: 8, s1: 9, a0: 10, a1: 11, a2: 12, a3: 13, a4: 14, a5: 15, a6: 16, a7: 17, s2: 18, s3: 19, s4: 20, s5: 21, s6: 22, s7: 23, s8: 24, s9: 25, s10: 26, s11: 27, t3: 28, t4: 29, t5: 30, t6: 31 };
var PH_ABI_BY_NUM = ["zero", "ra", "sp", "gp", "tp", "t0", "t1", "t2", "s0", "s1", "a0", "a1", "a2", "a3", "a4", "a5", "a6", "a7", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9", "s10", "s11", "t3", "t4", "t5", "t6"];

function phRegName(n) { return PH_ABI_BY_NUM[n] || ("x" + n); }

function phRegNum(tok, line, errors) {
  tok = String(tok).trim();
  var n, m = /^x(\d+)$/.exec(tok);
  if (m) n = parseInt(m[1], 10);
  else if (Object.prototype.hasOwnProperty.call(PH_ABI, tok)) n = PH_ABI[tok];
  if (n === undefined || n < 0 || n > 31) {
    errors.push({ line: line, msg: "bad register '" + tok + "'" });
    return 0;
  }
  return n;
}

function phImmNum(tok, line, errors, lo, hi, what) {
  tok = String(tok).trim();
  var v;
  if (/^0x[0-9a-fA-F]+$/.test(tok)) v = parseInt(tok, 16);
  else if (/^-?\d+$/.test(tok)) v = parseInt(tok, 10);
  else { errors.push({ line: line, msg: "bad immediate '" + tok + "'" }); return 0; }
  if (v < lo || v > hi) errors.push({ line: line, msg: (what || "immediate") + " " + v + " out of range [" + lo + ", " + hi + "]" });
  return v | 0;
}

/* op -> format. R: rd,rs1,rs2 | I: rd,rs1,imm | Is: rd,rs1,shamt |
   L: rd,off(rs1) | S: rs2,off(rs1) | B: rs1,rs2,target | J: rd,target | N: none */
var PH_FMT = {
  add: "R", sub: "R", and: "R", or: "R", xor: "R", sll: "R", srl: "R",
  addi: "I", andi: "I", ori: "I", xori: "I", slli: "Is", srli: "Is",
  lw: "L", sw: "S",
  beq: "B", bne: "B", blt: "B", bge: "B",
  jal: "J", nop: "N"
};

function phAssemble(src) {
  var errors = [], instrs = [], labels = {};
  var rawLines = String(src).split("\n");
  var cleaned = [];
  var i, ln;
  for (i = 0; i < rawLines.length; i++) {
    var line = rawLines[i];
    var c = line.indexOf("#");
    var c2 = line.indexOf("//");
    if (c2 >= 0 && (c < 0 || c2 < c)) c = c2;
    var c3 = line.indexOf(";");
    if (c3 >= 0 && (c < 0 || c3 < c)) c = c3;
    if (c >= 0) line = line.slice(0, c);
    cleaned.push({ line: i + 1, text: line });
  }
  /* pass 1: labels */
  var pc = 0;
  var items = [];
  for (i = 0; i < cleaned.length; i++) {
    var t = cleaned[i].text, lineNo = cleaned[i].line;
    var lm = /^\s*([A-Za-z_][\w]*)\s*:\s*(.*)$/.exec(t);
    if (lm) {
      if (Object.prototype.hasOwnProperty.call(labels, lm[1])) {
        errors.push({ line: lineNo, msg: "duplicate label '" + lm[1] + "'" });
      } else labels[lm[1]] = pc;
      t = lm[2];
    }
    t = t.trim();
    if (!t) continue;
    items.push({ line: lineNo, pc: pc, text: t });
    pc += 4;
  }
  /* pass 2: encode */
  for (i = 0; i < items.length; i++) {
    (function (it) {
      var parts = it.text.split(/\s+/);
      var op = parts[0].toLowerCase();
      var rest = it.text.slice(parts[0].length).trim();
      /* pseudos */
      if (op === "li" || op === "mv" || op === "j") {
        var a = rest.split(",").map(function (s) { return s.trim(); });
        if (op === "li" && a.length === 2) { op = "addi"; rest = a[0] + ", x0, " + a[1]; }
        else if (op === "mv" && a.length === 2) { op = "addi"; rest = a[0] + ", " + a[1] + ", 0"; }
        else if (op === "j" && a.length === 1) { op = "jal"; rest = "x0, " + a[0]; }
        else { errors.push({ line: it.line, msg: "bad pseudo-instruction '" + it.text + "'" }); return; }
        parts = [op];
      }
      var fmt = PH_FMT[op];
      if (!fmt) { errors.push({ line: it.line, msg: "unknown op '" + parts[0] + "'" }); return; }
      var ins = { pc: it.pc, line: it.line, op: op, rd: 0, rs1: -1, rs2: -1, imm: 0, target: 0, text: "" };
      function ops(n) {
        var p = rest.split(",");
        if (p.length !== n) { errors.push({ line: it.line, msg: op + " wants " + n + " operands" }); return null; }
        return p.map(function (s) { return s.trim(); });
      }
      var o;
      if (fmt === "R") {
        o = ops(3); if (!o) return;
        ins.rd = phRegNum(o[0], it.line, errors);
        ins.rs1 = phRegNum(o[1], it.line, errors);
        ins.rs2 = phRegNum(o[2], it.line, errors);
      } else if (fmt === "I" || fmt === "Is") {
        o = ops(3); if (!o) return;
        ins.rd = phRegNum(o[0], it.line, errors);
        ins.rs1 = phRegNum(o[1], it.line, errors);
        ins.imm = fmt === "Is" ? phImmNum(o[2], it.line, errors, 0, 31, "shift amount")
                               : phImmNum(o[2], it.line, errors, -2048, 2047, "immediate");
      } else if (fmt === "L" || fmt === "S") {
        o = ops(2); if (!o) return;
        var mm = /^(-?0x[0-9a-fA-F]+|-?\d+)\(\s*([A-Za-z0-9_]+)\s*\)$/.exec(o[1]);
        if (!mm) { errors.push({ line: it.line, msg: "bad memory operand '" + o[1] + "', use off(reg)" }); return; }
        ins.imm = phImmNum(mm[1], it.line, errors, -2048, 2047, "offset");
        ins.rs1 = phRegNum(mm[2], it.line, errors);
        if (fmt === "L") ins.rd = phRegNum(o[0], it.line, errors);
        else ins.rs2 = phRegNum(o[0], it.line, errors);
      } else if (fmt === "B") {
        o = ops(3); if (!o) return;
        ins.rs1 = phRegNum(o[0], it.line, errors);
        ins.rs2 = phRegNum(o[1], it.line, errors);
        ins.target = phTarget(o[2], it, labels, errors);
      } else if (fmt === "J") {
        o = ops(2); if (!o) return;
        ins.rd = phRegNum(o[0], it.line, errors);
        ins.target = phTarget(o[1], it, labels, errors);
      }
      if (fmt === "B" || fmt === "J") {
        if (ins.target % 4 !== 0 || ins.target < 0) {
          errors.push({ line: it.line, msg: "branch target must be a non-negative multiple of 4" });
        }
      }
      ins.isLoad = (op === "lw");
      ins.isStore = (op === "sw");
      ins.isBranch = (fmt === "B");
      ins.isJump = (op === "jal");
      ins.writesRd = (fmt === "R" || fmt === "I" || fmt === "Is" || fmt === "L" || op === "jal");
      ins.usesRs2 = (fmt === "R" || fmt === "S" || fmt === "B");
      ins.rs = [];
      if (ins.rs1 >= 0) ins.rs.push(ins.rs1);
      if (ins.usesRs2 && ins.rs2 >= 0) ins.rs.push(ins.rs2);
      ins.text = phNorm(ins);
      instrs.push(ins);
    })(items[i]);
  }
  return { ok: errors.length === 0 && instrs.length > 0, instrs: instrs, errors: errors };
}

function phTarget(tok, it, labels, errors) {
  tok = String(tok).trim();
  if (Object.prototype.hasOwnProperty.call(labels, tok)) return labels[tok];
  if (/^-?0x[0-9a-fA-F]+$/.test(tok) || /^-?\d+$/.test(tok)) {
    var v = /^0x/i.test(tok) ? parseInt(tok, 16) : parseInt(tok, 10);
    return (it.pc + v) | 0; /* pc-relative byte offset, like the machine encoding */
  }
  errors.push({ line: it.line, msg: "unknown label '" + tok + "'" });
  return it.pc + 4;
}

function phNorm(ins) {
  var r = phRegName;
  switch (ins.op) {
    case "lw": return "lw " + r(ins.rd) + ", " + ins.imm + "(" + r(ins.rs1) + ")";
    case "sw": return "sw " + r(ins.rs2) + ", " + ins.imm + "(" + r(ins.rs1) + ")";
    case "beq": case "bne": case "blt": case "bge":
      return ins.op + " " + r(ins.rs1) + ", " + r(ins.rs2) + ", ->" + ins.target;
    case "jal": return "jal " + r(ins.rd) + ", ->" + ins.target;
    case "nop": return "nop";
    default:
      if (PH_FMT[ins.op] === "R") return ins.op + " " + r(ins.rd) + ", " + r(ins.rs1) + ", " + r(ins.rs2);
      return ins.op + " " + r(ins.rd) + ", " + r(ins.rs1) + ", " + ins.imm;
  }
}

/* ---------- pipeline simulator (pure, no DOM) ---------- */
function phNewSim(instrs, opts) {
  opts = opts || {};
  var s = {
    instrs: instrs,
    fwd: opts.fwd !== false,
    predictor: opts.predictor || "2bit",
    regs: [], mem: [],
    pipe: [null, null, null, null, null],
    pcNext: 0, nextId: 1,
    cycle: 0, retired: 0,
    dataStalls: 0, controlStalls: 0, forwards: 0,
    preds: 0, predHit: 0,
    bht: {},
    trace: [],
    blame: {},
    bubbleEX: false,
    lastEvents: [],
    done: false, trap: ""
  };
  var i;
  for (i = 0; i < 32; i++) s.regs.push(0);
  for (i = 0; i < PH_MEM_WORDS; i++) s.mem.push(0);
  if (opts.memInit) {
    for (var a in opts.memInit) {
      if (Object.prototype.hasOwnProperty.call(opts.memInit, a)) {
        var w = parseInt(a, 10);
        if (w >= 0 && w < PH_MEM_WORDS) s.mem[w] = opts.memInit[a] | 0;
      }
    }
  }
  return s;
}

function phBlame(s, pc, kind) {
  var b = s.blame[pc];
  if (!b) { b = { data: 0, control: 0 }; s.blame[pc] = b; }
  b[kind]++;
}

function phPredict(s, pc) {
  if (s.predictor === "t") return true;
  if (s.predictor === "2bit") return (s.bht[pc] === undefined ? 1 : s.bht[pc]) >= 2;
  return false; /* "nt" */
}

function phFetch(s) {
  var ii = s.pcNext / 4;
  var ins = s.instrs[ii];
  var slot = {
    id: s.nextId++, ii: ii, pc: ins.pc, line: ins.line, text: ins.text,
    op: ins.op, rd: ins.rd, rs1: ins.rs1, rs2: ins.rs2, imm: ins.imm,
    target: ins.target, rs: ins.rs.slice(),
    isLoad: ins.isLoad, isStore: ins.isStore, isBranch: ins.isBranch,
    isJump: ins.isJump, writesRd: ins.writesRd, usesRs2: ins.usesRs2,
    predTaken: false, predTarget: ins.pc + 4,
    res: 0, sdata: 0, killed: false, killCycle: -1
  };
  if (ins.isBranch) {
    slot.predTaken = phPredict(s, ins.pc);
    slot.predTarget = slot.predTaken ? ins.target : ins.pc + 4;
  }
  s.pcNext = slot.predTarget;
  slot.row = s.trace.length;
  s.trace.push({ id: slot.id, pc: ins.pc, line: ins.line, text: ins.text, cells: {}, killed: false });
  return slot;
}

/* youngest producer of rs among the stages ahead, or null */
function phProducer(slot, rs, ahead) {
  var k;
  for (k = 0; k < ahead.length; k++) {
    var p = ahead[k].slot;
    if (p && !p.killed && p.writesRd && p.rd === rs && p.rd !== 0) {
      return { slot: p, stage: ahead[k].stage };
    }
  }
  return null;
}

/* ID-stage hazard check. ahead = [{stage:'EX',slot:oEX},{stage:'MEM',slot:oMEM},{stage:'WB',slot:oWB}] */
function phDetect(s, idSlot, ahead) {
  var r;
  for (r = 0; r < idSlot.rs.length; r++) {
    var rs = idSlot.rs[r];
    if (rs === 0) continue;
    var pr = phProducer(idSlot, rs, ahead);
    if (!pr) continue;
    if (s.fwd) {
      if (pr.stage === "EX" && pr.slot.isLoad) {
        return { kind: "load-use", rs: rs, producer: pr.slot };
      }
    } else {
      if (pr.stage === "EX" || pr.stage === "MEM") {
        return { kind: "raw", rs: rs, producer: pr.slot };
      }
    }
  }
  return null;
}

/* resolve one operand inside EX, applying forwarding muxes */
function phOpVal(s, slot, rs, oMEM, oWB, ev) {
  if (rs <= 0) return 0;
  var pr = phProducer(slot, rs, [{ stage: "EX", slot: oMEM }, { stage: "WB", slot: oWB }]);
  if (pr && s.fwd) {
    s.forwards++;
    ev.push({ t: "fwd", from: pr.stage, rs: rs, id: slot.id, pc: slot.pc });
    return pr.slot.res | 0;
  }
  return s.regs[rs] | 0;
}

function phTrap(s, msg) {
  s.done = true;
  s.trap = msg;
  return [];
}

function phStep(s) {
  var ev = [];
  s.lastEvents = ev;
  s.bubbleEX = false;
  if (s.done) return ev;
  var oIF = s.pipe[0], oID = s.pipe[1], oEX = s.pipe[2], oMEM = s.pipe[3], oWB = s.pipe[4];
  var cycle = s.cycle;
  var STAGE = ["IF", "ID", "EX", "MEM", "WB"];

  /* 1. WB: retire */
  if (oWB && !oWB.killed) {
    if (oWB.writesRd && oWB.rd !== 0) s.regs[oWB.rd] = oWB.res | 0;
    s.retired++;
  }
  /* 2. MEM -> WB */
  var newWB = null;
  if (oMEM && !oMEM.killed) {
    if (oMEM.isLoad) {
      var la = oMEM.res | 0;
      if (la % 4 !== 0 || la < 0 || la >= PH_MEM_WORDS * 4) return phTrap(s, "load address fault at 0x" + ((la >>> 0).toString(16)));
      oMEM.res = s.mem[la >> 2] | 0;
    } else if (oMEM.isStore) {
      var sa = oMEM.res | 0;
      if (sa % 4 !== 0 || sa < 0 || sa >= PH_MEM_WORDS * 4) return phTrap(s, "store address fault at 0x" + ((sa >>> 0).toString(16)));
      s.mem[sa >> 2] = oMEM.sdata | 0;
    }
    newWB = oMEM;
  }
  /* 3. EX -> MEM, with branch/jump resolution */
  var newMEM = null, flush = false, flushTarget = 0;
  if (oEX && !oEX.killed) {
    var v1 = phOpVal(s, oEX, oEX.rs1, oMEM, oWB, ev);
    var v2 = oEX.usesRs2 ? phOpVal(s, oEX, oEX.rs2, oMEM, oWB, ev) : 0;
    var op = oEX.op, res = 0;
    if (op === "add") res = (v1 + v2) | 0;
    else if (op === "sub") res = (v1 - v2) | 0;
    else if (op === "and") res = (v1 & v2) | 0;
    else if (op === "or") res = (v1 | v2) | 0;
    else if (op === "xor") res = (v1 ^ v2) | 0;
    else if (op === "sll") res = (v1 << (v2 & 31)) | 0;
    else if (op === "srl") res = (v1 >>> (v2 & 31)) | 0;
    else if (op === "addi") res = (v1 + oEX.imm) | 0;
    else if (op === "andi") res = (v1 & oEX.imm) | 0;
    else if (op === "ori") res = (v1 | oEX.imm) | 0;
    else if (op === "xori") res = (v1 ^ oEX.imm) | 0;
    else if (op === "slli") res = (v1 << (oEX.imm & 31)) | 0;
    else if (op === "srli") res = (v1 >>> (oEX.imm & 31)) | 0;
    else if (op === "lw" || op === "sw") {
      res = (v1 + oEX.imm) | 0;
      if (oEX.isStore) oEX.sdata = v2 | 0;
    } else if (op === "jal") {
      res = (oEX.pc + 4) | 0;
    }
    oEX.res = res;
    if (oEX.isBranch) {
      var taken;
      if (op === "beq") taken = (v1 === v2);
      else if (op === "bne") taken = (v1 !== v2);
      else if (op === "blt") taken = (v1 < v2);
      else taken = (v1 >= v2);
      s.preds++;
      if (s.predictor === "2bit") {
        var ctr = s.bht[oEX.pc] === undefined ? 1 : s.bht[oEX.pc];
        if (taken === oEX.predTaken) s.predHit++;
        s.bht[oEX.pc] = taken ? Math.min(3, ctr + 1) : Math.max(0, ctr - 1);
      } else if (taken === oEX.predTaken) s.predHit++;
      if (taken !== oEX.predTaken) {
        flush = true;
        flushTarget = taken ? oEX.target : oEX.pc + 4;
        s.controlStalls += 2;
        phBlame(s, oEX.pc, "control");
        ev.push({ t: "mispredict", id: oEX.id, pc: oEX.pc, taken: taken });
      }
    } else if (oEX.isJump) {
      flush = true;
      flushTarget = oEX.target;
      s.controlStalls += 2;
      phBlame(s, oEX.pc, "control");
      ev.push({ t: "jump", id: oEX.id, pc: oEX.pc });
    }
    newMEM = oEX;
  }
  /* 4+5. ID and IF */
  var newEX = null, newID = null, newIF = null;
  function kill(slot) {
    if (slot && !slot.killed) {
      slot.killed = true;
      slot.killCycle = cycle;
      s.trace[slot.row].killed = true;
    }
  }
  if (flush) {
    kill(oIF); kill(oID);
    s.pcNext = flushTarget;
  } else if (oID && !oID.killed) {
    var hz = phDetect(s, oID, [
      { stage: "EX", slot: oEX },
      { stage: "MEM", slot: oMEM },
      { stage: "WB", slot: oWB }
    ]);
    if (hz) {
      newEX = null;
      s.bubbleEX = true;
      newID = oID;
      newIF = oIF;
      s.dataStalls++;
      phBlame(s, oID.pc, "data");
      ev.push({ t: "stall", kind: hz.kind, rs: hz.rs, id: oID.id, pc: oID.pc, prodPc: hz.producer.pc });
    } else {
      newEX = oID;
      newID = (oIF && !oIF.killed) ? oIF : null;
      newIF = (s.pcNext < s.instrs.length * 4) ? phFetch(s) : null;
    }
  } else {
    newID = (oIF && !oIF.killed) ? oIF : null;
    newIF = (s.pcNext < s.instrs.length * 4) ? phFetch(s) : null;
  }

  s.pipe = [newIF, newID, newEX, newMEM, newWB];
  var si;
  for (si = 0; si < 5; si++) {
    var sl = s.pipe[si];
    if (sl && !sl.killed) s.trace[sl.row].cells[cycle] = STAGE[si];
  }
  s.cycle++;
  if (s.pcNext >= s.instrs.length * 4 &&
      !s.pipe[0] && !s.pipe[1] && !s.pipe[2] && !s.pipe[3] && !s.pipe[4]) {
    s.done = true;
  }
  return ev;
}

function phRun(s, maxCycles) {
  var n = maxCycles || 20000;
  while (!s.done && s.cycle < n) phStep(s);
  if (!s.done) { s.done = true; s.trap = "runaway: exceeded " + n + " cycles"; }
  return s;
}
/* PH-SIM-END */

/* PH-SIM-END */

/* ---------- trials (pure data) ---------- */
var PH_TRIALS = [
  {
    id: "t1", name: "Trial 1: The Slow Loop",
    brief: "Eight words, one sum, too many stalls. The loop as written burns a load-use stall every lap, and the predictor is stuck on always-not-taken. Reorder the loop to hide the load behind independent work, pick a predictor that learns, and finish at or under <b>56 cycles</b> with a0 = 36. <span class=\"par\">Shop par: 54 cycles.</span>",
    hint: "Two independent instructions fit between the load and its use. The loop branch is taken almost every time.",
    program: "  addi t0, x0, 8\n  addi t1, x0, 0\nloop:\n  lw   t3, 0(t2)\n  add  t1, t1, t3\n  addi t2, t2, 4\n  addi t0, t0, -1\n  bne  t0, x0, loop\n  add  a0, x0, t1",
    memInit: { 0: 1, 1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 7, 7: 8 },
    checks: [{ reg: "a0", val: 36 }],
    minRetired: 35, par: 54, budget: 56,
    startFwd: true, startPred: "nt"
  },
  {
    id: "t2", name: "Trial 2: Two Branches, One Predictor",
    brief: "One branch is taken 15 times out of 20, the other 19 out of 20. No static predictor gets both right, and every wrong guess flushes two fresh instructions down the drain. The two-bit predictor learns each branch on its own. Finish at or under <b>205 cycles</b> with a0 = 20 and a1 = 50. <span class=\"par\">Shop par: 196 cycles.</span>",
    hint: "Static always-taken aces the loop branch but bombs the skip. Static always-not-taken does the reverse. Only the adaptive predictor gets both.",
    program: "  addi t0, x0, 20\n  addi t1, x0, 0\n  addi t2, x0, 0\nloop:\n  addi t1, t1, 1\n  andi t3, t1, 3\n  beq  t3, x0, skip\n  jal  x0, cont\nskip:\n  addi t2, t2, 10\ncont:\n  addi t0, t0, -1\n  bne  t0, x0, loop\n  add  a0, x0, t1\n  add  a1, x0, t2",
    memInit: null,
    checks: [{ reg: "a0", val: 20 }, { reg: "a1", val: 50 }],
    minRetired: 100, par: 196, budget: 205,
    startFwd: true, startPred: "nt"
  },
  {
    id: "t3", name: "Trial 3: Forward Frenzy",
    brief: "Five instructions, every one chained on the last, and the forwarding unit is switched off. The pipe stalls on every link while results crawl to writeback. Flip forwarding on and watch the stalls vanish. Finish at or under <b>12 cycles</b> with a0 = 80. <span class=\"par\">Shop par: 10 cycles.</span>",
    hint: "Forwarding routes each ALU result straight back to the next instruction. No code change needed, this one is pure hardware.",
    program: "  addi t0, x0, 5\n  add  t1, t0, t0\n  add  t2, t1, t1\n  add  t3, t2, t2\n  add  a0, t3, t3",
    memInit: null,
    checks: [{ reg: "a0", val: 80 }],
    minRetired: 5, par: 10, budget: 12,
    startFwd: false, startPred: "2bit"
  }
];

var PH_DEMO = "# Demo: a counting loop fed by forwarded ALU results.\n# Edit me, then press Apply and Reset.\n  li   t0, 5\n  li   t1, 0\nloop:\n  add  t1, t1, t0\n  addi t0, t0, -1\n  bne  t0, x0, loop\n  mv   a0, t1        # a0 = 15";

var PH_PRED_NAMES = { nt: "Always not-taken", t: "Always taken", "2bit": "2-bit adaptive" };

/* ---------- UI state ---------- */
var phUI = null;

function phLoadStamps() {
  try {
    var raw = window.localStorage.getItem("ph-trial-stamps");
    return raw ? JSON.parse(raw) : {};
  } catch (e) { return {}; }
}
function phSaveStamps(st) {
  try { window.localStorage.setItem("ph-trial-stamps", JSON.stringify(st)); } catch (e) {}
}

function phBuild() {
  if (phUI) return phUI;
  var st = document.createElement("style");
  st.textContent = PH_CSS;
  document.head.appendChild(st);

  var box = document.querySelector(".dossier .actions");
  var ui = {
    sim: null, instrs: null, timer: null, running: false,
    mode: "free", trialIdx: -1,
    stamps: phLoadStamps(),
    memInit: null, tick: 0
  };
  phUI = ui;

  if (box && !ph$("phBtn")) {
    var b = phEl("button", "secondary", "Run the Pipeline Hazard Lab");
    b.id = "phBtn";
    b.addEventListener("click", function () { ph$("phOverlay").classList.add("open"); });
    box.appendChild(b);
  }

  var ov = phEl("div", "ph-overlay");
  ov.id = "phOverlay";
  var panel = phEl("div", "ph-panel");
  panel.innerHTML =
    "<h3>The Pipeline Hazard Lab</h3>" +
    '<p class="ph-sub">The Silicon Anvil proved the core computes. This bench proves it computes <b>fast</b>: a classic five-stage RV32I pipeline with real forwarding, real load-use and control stalls, and a branch predictor you can swap mid-shift. Built for the RISC-V bench behind the <a href="https://dillingerstaffing.github.io/portfolio/" target="_blank" rel="noopener">freelance portfolio</a>: every cycle here is the same machinery a client pays for.</p>';
  ov.appendChild(panel);
  document.body.appendChild(ov);

  /* tabs */
  var tabs = phEl("div", "ph-tabs");
  ui.tabBtns = [];
  ["Free Bench", "Trial 1: The Slow Loop", "Trial 2: Two Branches", "Trial 3: Forward Frenzy"].forEach(function (label, i) {
    var tb = phEl("button", "ph-tab" + (i === 0 ? " on" : ""), phEsc(label));
    tb.addEventListener("click", function () { phSelectMode(i === 0 ? -1 : i - 1); });
    tabs.appendChild(tb);
    ui.tabBtns.push(tb);
  });
  panel.appendChild(tabs);

  ui.brief = phEl("div", "ph-brief", "");
  panel.appendChild(ui.brief);

  /* toolbar */
  var bar = phEl("div", "ph-toolbar");
  ui.runBtn = phEl("button", "secondary", "Run");
  ui.runBtn.addEventListener("click", phToggleRun);
  bar.appendChild(ui.runBtn);
  ui.stepBtn = phEl("button", "secondary", "Step 1 cycle");
  ui.stepBtn.addEventListener("click", function () { phStopRun(); phStepOnce(); });
  bar.appendChild(ui.stepBtn);
  ui.resetBtn = phEl("button", "secondary", "Reset");
  ui.resetBtn.addEventListener("click", function () { phStopRun(); phResetSim(); phToast("Pipeline reset"); });
  bar.appendChild(ui.resetBtn);

  bar.appendChild(phEl("span", "lbl", "Speed"));
  ui.speed = phEl("select", null, "");
  [["1", "1x"], ["4", "4x"], ["16", "16x"]].forEach(function (o) {
    var op = phEl("option", null, o[1]);
    op.value = o[0];
    ui.speed.appendChild(op);
  });
  ui.speed.value = "4";
  bar.appendChild(ui.speed);

  bar.appendChild(phEl("span", "lbl", "Forwarding"));
  ui.fwdBtn = phEl("button", "secondary", "ON");
  ui.fwdBtn.addEventListener("click", function () {
    ui.fwdOn = !ui.fwdOn;
    ui.fwdBtn.textContent = ui.fwdOn ? "ON" : "OFF";
    phStopRun(); phResetSim();
    phToast("Forwarding " + (ui.fwdOn ? "enabled" : "disabled") + ", pipeline reset");
  });
  bar.appendChild(ui.fwdBtn);

  bar.appendChild(phEl("span", "lbl", "Predictor"));
  ui.pred = phEl("select", null, "");
  Object.keys(PH_PRED_NAMES).forEach(function (k) {
    var op = phEl("option", null, PH_PRED_NAMES[k]);
    op.value = k;
    ui.pred.appendChild(op);
  });
  ui.pred.value = "2bit";
  ui.pred.addEventListener("change", function () { phStopRun(); phResetSim(); phToast("Predictor: " + PH_PRED_NAMES[ui.pred.value]); });
  bar.appendChild(ui.pred);

  ui.trialBtn = phEl("button", "primary", "Run trial to completion");
  ui.trialBtn.style.display = "none";
  ui.trialBtn.addEventListener("click", phRunTrial);
  bar.appendChild(ui.trialBtn);
  panel.appendChild(bar);

  ui.banner = phEl("div", "ph-banner", "<h4></h4><p></p>");
  panel.appendChild(ui.banner);

  /* main grid */
  var main = phEl("div", "ph-main");
  var left = phEl("div", "ph-left");
  var edhead = phEl("div", "ph-edhead", "<h4>Program</h4>");
  ui.applyBtn = phEl("button", "secondary", "Apply and Reset");
  ui.applyBtn.addEventListener("click", function () { phStopRun(); phApplyEditor(); });
  edhead.appendChild(ui.applyBtn);
  left.appendChild(edhead);
  var edwrap = phEl("div", "ph-edwrap");
  ui.gutter = phEl("div", "ph-gutter", "");
  edwrap.appendChild(ui.gutter);
  ui.ed = phEl("textarea", "ph-ed", "");
  ui.ed.id = "phEd";
  ui.ed.spellcheck = false;
  ui.ed.value = PH_DEMO;
  ui.ed.addEventListener("scroll", function () { ui.gutter.scrollTop = ui.ed.scrollTop; });
  edwrap.appendChild(ui.ed);
  left.appendChild(edwrap);
  ui.errors = phEl("div", "ph-errors", "");
  left.appendChild(ui.errors);
  ui.blame = phEl("div", "ph-blame", "");
  left.appendChild(ui.blame);
  main.appendChild(left);

  var right = phEl("div", "ph-righth");
  right.appendChild(phEl("h4", null, "Pipeline, this cycle"));
  ui.strip = phEl("div", "ph-strip", "");
  right.appendChild(ui.strip);
  right.appendChild(phEl("h4", null, "Cycle trace"));
  var twrap = phEl("div", "ph-tracewrap", "");
  ui.trace = phEl("table", "ph-trace", "");
  twrap.appendChild(ui.trace);
  right.appendChild(twrap);
  main.appendChild(right);
  panel.appendChild(main);

  /* stats */
  ui.stats = phEl("div", "ph-stats", "");
  panel.appendChild(ui.stats);

  /* registers + memory */
  var rm = phEl("div", "ph-regmem");
  var d1 = phEl("details", null, "<summary>Register file</summary>");
  ui.regs = phEl("div", "ph-regtable", "");
  d1.appendChild(ui.regs);
  rm.appendChild(d1);
  var d2 = phEl("details", null, "<summary>Data memory (first 64 words)</summary>");
  ui.mem = phEl("div", "ph-regtable", "");
  d2.appendChild(ui.mem);
  rm.appendChild(d2);
  panel.appendChild(rm);

  /* footer */
  var foot = phEl("div", "ph-foot");
  var dl = phEl("button", "primary", "Download profile card");
  dl.addEventListener("click", phDownload);
  foot.appendChild(dl);
  var close = phEl("button", "secondary", "Close");
  close.addEventListener("click", function () { phStopRun(); ph$("phOverlay").classList.remove("open"); });
  foot.appendChild(close);
  panel.appendChild(foot);

  ui.fwdOn = true;
  ui.stripStages = [];
  var names = [["IF", "Fetch"], ["ID", "Decode"], ["EX", "Execute"], ["MEM", "Memory"], ["WB", "Writeback"]];
  names.forEach(function (nm, si) {
    var card = phEl("div", "ph-stage s" + si, "<h5>" + nm[0] + " &middot; " + nm[1] + "</h5>");
    var body = phEl("div", "ph-inst", "");
    card.appendChild(body);
    ui.strip.appendChild(card);
    ui.stripStages.push({ card: card, body: body });
    if (si < 4) ui.strip.appendChild(phEl("div", "ph-arrow", "&#8594;"));
  });

  phSelectMode(-1);
  return ui;
}

/* ---------- mode / assembly ---------- */
function phSelectMode(trialIdx) {
  var ui = phUI;
  ui.trialIdx = trialIdx;
  ui.tabBtns.forEach(function (b, i) {
    b.classList.toggle("on", (i === 0 && trialIdx === -1) || (i - 1 === trialIdx));
  });
  if (trialIdx === -1) {
    ui.brief.classList.remove("show");
    ui.trialBtn.style.display = "none";
    ui.memInit = null;
    ui.ed.value = PH_DEMO;
    ui.fwdOn = true; ui.fwdBtn.textContent = "ON";
    ui.pred.value = "2bit";
  } else {
    var t = PH_TRIALS[trialIdx];
    ui.brief.innerHTML = "<b>" + phEsc(t.name) + ".</b> " + t.brief +
      "<br><span style=\"color:#7c8d89\">Hint: " + phEsc(t.hint) + "</span>";
    ui.brief.classList.add("show");
    ui.trialBtn.style.display = "";
    ui.memInit = t.memInit;
    ui.ed.value = t.program;
    ui.fwdOn = t.startFwd; ui.fwdBtn.textContent = t.startFwd ? "ON" : "OFF";
    ui.pred.value = t.startPred;
  }
  phStopRun();
  phApplyEditor();
  phRenderBrief();
}

function phRenderBrief() {
  var ui = phUI;
  if (ui.trialIdx === -1) return;
  var t = PH_TRIALS[ui.trialIdx];
  var st = ui.stamps[t.id];
  var extra = st ? ' <span class="par">Best: ' + st.best + ' cycles' + (st.passed ? ", CLEARED" : "") + '.</span>' : "";
  ui.brief.innerHTML = "<b>" + phEsc(t.name) + ".</b> " + t.brief + extra +
    "<br><span style=\"color:#7c8d89\">Hint: " + phEsc(t.hint) + "</span>";
}

function phApplyEditor() {
  var ui = phUI;
  var a = phAssemble(ui.ed.value);
  if (!a.ok) {
    ui.errors.innerHTML = a.errors.map(function (e) { return "line " + e.line + ": " + phEsc(e.msg); }).join("<br>");
    ui.errors.classList.add("show");
    return false;
  }
  if (a.instrs.length === 0) {
    ui.errors.innerHTML = "Empty program: nothing to run.";
    ui.errors.classList.add("show");
    return false;
  }
  ui.errors.classList.remove("show");
  ui.instrs = a.instrs;
  phResetSim();
  return true;
}

function phResetSim() {
  var ui = phUI;
  if (!ui.instrs) return;
  ui.sim = phNewSim(ui.instrs, { fwd: ui.fwdOn, predictor: ui.pred.value, memInit: ui.memInit });
  ui.tick = 0;
  phHideBanner();
  phRenderAll();
}

function phHideBanner() {
  var ui = phUI;
  ui.banner.classList.remove("show", "fail");
}

/* ---------- stepping / running ---------- */
function phStepOnce() {
  var ui = phUI;
  if (!ui.sim || ui.sim.done) return;
  var ev = phStep(ui.sim);
  ui.tick++;
  ev.forEach(function (e) {
    if (e.t === "mispredict") {
      phToast("Branch mispredict at 0x" + e.pc.toString(16) + ": two instructions flushed");
      ui.stripStages.forEach(function (s) { s.card.classList.add("flushed"); });
      setTimeout(function () { ui.stripStages.forEach(function (s) { s.card.classList.remove("flushed"); }); }, 600);
    } else if (e.t === "stall" && e.kind === "load-use") {
      /* quiet: the strip shows it */
    }
  });
  if (ui.sim.done) {
    phStopRun();
    if (ui.sim.trap) phToast("Trap: " + ui.sim.trap);
    else phToast("Halted after " + ui.sim.cycle + " cycles, " + ui.sim.retired + " retired");
  }
  phRenderAll();
}

function phToggleRun() {
  var ui = phUI;
  if (ui.running) { phStopRun(); return; }
  if (!ui.sim || ui.sim.done) { if (!phApplyEditor()) return; }
  ui.running = true;
  ui.runBtn.textContent = "Pause";
  var speed = parseInt(ui.speed.value, 10) || 1;
  ui.timer = setInterval(function () {
    var k;
    for (k = 0; k < speed && ui.sim && !ui.sim.done; k++) phStep(ui.sim);
    ui.tick++;
    if (ui.sim.done) {
      phStopRun();
      if (ui.sim.trap) phToast("Trap: " + ui.sim.trap);
      else phToast("Halted after " + ui.sim.cycle + " cycles, " + ui.sim.retired + " retired");
    }
    phRenderAll();
  }, 120);
}

function phStopRun() {
  var ui = phUI;
  if (ui.timer) { clearInterval(ui.timer); ui.timer = null; }
  if (ui.running) { ui.running = false; ui.runBtn.textContent = "Run"; }
}

/* ---------- rendering ---------- */
function phRenderAll() {
  phRenderStrip();
  phRenderStats();
  phRenderRegs();
  phRenderBlame();
  phRenderGutter();
  if (phUI.tick % 5 === 0 || (phUI.sim && phUI.sim.done)) phRenderTrace();
}

function phRenderStrip() {
  var ui = phUI, s = ui.sim;
  var fwdById = {};
  (s ? s.lastEvents : []).forEach(function (e) {
    if (e.t === "fwd") {
      (fwdById[e.id] = fwdById[e.id] || []).push(e);
    }
  });
  ui.stripStages.forEach(function (st, si) {
    var slot = s ? s.pipe[si] : null;
    st.card.classList.remove("bubble");
    if (!slot) {
      if (si === 2 && s && s.bubbleEX) {
        st.card.classList.add("bubble");
        st.body.innerHTML = '<span class="inst" style="color:var(--orange)">BUBBLE<br><span style="font-size:10px">stall</span></span>';
      } else {
        st.body.innerHTML = '<span class="empty">--</span>';
      }
      return;
    }
    var h = phEsc(slot.text);
    (fwdById[slot.id] || []).forEach(function (f) {
      h += '<br><span class="ph-fwdtag">' + phEsc(phRegName(f.rs)) + " fwd from " + f.from + "</span>";
    });
    if (slot.killed) h = '<span style="opacity:.4;text-decoration:line-through">' + h + "</span>";
    st.body.innerHTML = '<span class="inst">' + h + "</span>";
  });
}

function phRenderTrace() {
  var ui = phUI, s = ui.sim;
  if (!s) { ui.trace.innerHTML = ""; return; }
  var maxC = Math.max(0, s.cycle - 1);
  var fromC = Math.max(0, maxC - 79);
  var html = "<tr><th></th>";
  var c;
  for (c = fromC; c <= maxC; c++) html += "<th class=\"" + (c === maxC ? "cur" : "") + "\">" + c + "</th>";
  html += "</tr>";
  var STAGE_CLS = { IF: "c-IF", ID: "c-ID", EX: "c-EX", MEM: "c-MEM", WB: "c-WB" };
  s.trace.forEach(function (row) {
    html += '<tr class="' + (row.killed ? "killed" : "") + '"><td class="pc">' + phEsc(row.text) + "</td>";
    for (c = fromC; c <= maxC; c++) {
      var cell = row.cells[c];
      if (cell) html += '<td class="' + STAGE_CLS[cell] + (c === maxC ? " cur" : "") + '">' + cell + "</td>";
      else html += "<td" + (c === maxC ? ' class="cur"' : "") + "></td>";
    }
    html += "</tr>";
  });
  ui.trace.innerHTML = html;
}

function phRenderStats() {
  var ui = phUI, s = ui.sim;
  function tile(label, val, cls) {
    return '<div class="ph-stat"><h4>' + label + "</h4><p class=\"" + (cls || "") + "\">" + val + "</p></div>";
  }
  if (!s) { ui.stats.innerHTML = ""; return; }
  var ipc = s.cycle ? (s.retired / s.cycle).toFixed(2) : "0.00";
  var acc = s.preds ? Math.round(100 * s.predHit / s.preds) + "%" : "--";
  var h = "";
  h += tile("Cycle", s.cycle, "");
  h += tile("Retired", s.retired, "good");
  h += tile("IPC", ipc, "");
  h += tile("Data stalls", s.dataStalls, s.dataStalls ? "warn" : "");
  h += tile("Control stalls", s.controlStalls, s.controlStalls ? "warn" : "");
  h += tile("Forwards", s.forwards, s.forwards ? "good" : "");
  h += tile("Predictor", s.predHit + "/" + s.preds + " " + acc, "");
  if (s.trap) h += tile("Trap", "YES", "warn");
  ui.stats.innerHTML = h;
}

function phRenderRegs() {
  var ui = phUI, s = ui.sim;
  if (!s) return;
  var h = "";
  var i;
  for (i = 0; i < 32; i++) {
    var v = s.regs[i] | 0;
    var cls = v === 0 ? "rz" : (i >= 10 && i <= 17 ? "rhot" : "");
    h += '<div class="' + cls + '">' + phRegName(i) + " " + phHex(v) + "</div>";
  }
  ui.regs.innerHTML = h;
  h = "";
  for (i = 0; i < 64; i++) {
    var w = s.mem[i] | 0;
    h += '<div class="' + (w === 0 ? "rz" : "rhot") + '">+' + (i * 4) + " " + phHex(w) + "</div>";
  }
  ui.mem.innerHTML = h;
}

function phPcToLine(pc) {
  var ui = phUI;
  if (!ui.instrs) return 0;
  var i;
  for (i = 0; i < ui.instrs.length; i++) if (ui.instrs[i].pc === pc) return ui.instrs[i].line;
  return 0;
}

function phRenderBlame() {
  var ui = phUI, s = ui.sim;
  if (!s) { ui.blame.innerHTML = ""; return; }
  var pcs = Object.keys(s.blame);
  if (!pcs.length) { ui.blame.innerHTML = '<span style="color:#5f726e">No stalls yet. The pipe is clean.</span>'; return; }
  var h = "";
  pcs.sort(function (a, b) { return a - b; }).forEach(function (pck) {
    var b = s.blame[pck];
    var pc = parseInt(pck, 10);
    var line = phPcToLine(pc);
    var ins = ui.instrs ? ui.instrs.filter(function (x) { return x.pc === pc; })[0] : null;
    var bits = [];
    if (b.data) bits.push(b.data + " data");
    if (b.control) bits.push(b.control + " control");
    h += '<div class="brow" data-line="' + line + '"><b>0x' + pc.toString(16) + "</b> " +
      phEsc(ins ? ins.text : "") + " &middot; " + bits.join(" + ") + " stall" + ((b.data + b.control) > 1 ? "s" : "") + "</div>";
  });
  ui.blame.innerHTML = h;
  Array.prototype.forEach.call(ui.blame.querySelectorAll(".brow"), function (row) {
    row.addEventListener("click", function () {
      var ln = parseInt(row.getAttribute("data-line"), 10);
      phToast("Line " + ln + ": reorder code or flip a setting to kill these stalls");
    });
  });
}

function phRenderGutter() {
  var ui = phUI, s = ui.sim;
  var n = ui.ed.value.split("\n").length;
  var hot = {};
  if (s) {
    Object.keys(s.blame).forEach(function (pck) {
      var ln = phPcToLine(parseInt(pck, 10));
      if (ln) hot[ln] = true;
    });
  }
  var h = "", i;
  for (i = 1; i <= n; i++) h += '<div class="' + (hot[i] ? "hot" : "") + '">' + (hot[i] ? "!" : i) + "</div>";
  ui.gutter.innerHTML = h;
  ui.gutter.scrollTop = ui.ed.scrollTop;
}

/* ---------- trials ---------- */
function phRunTrial() {
  var ui = phUI;
  var t = PH_TRIALS[ui.trialIdx];
  if (!t) return;
  phStopRun();
  if (!phApplyEditor()) return;
  var s = phNewSim(ui.instrs, { fwd: ui.fwdOn, predictor: ui.pred.value, memInit: t.memInit });
  phRun(s, 20000);
  ui.sim = s;
  ui.tick++;
  phRenderAll();
  function fail(title, msg) {
    ui.banner.innerHTML = "<h4>" + phEsc(title) + "</h4><p>" + msg + "</p>";
    ui.banner.classList.add("show", "fail");
  }
  if (s.trap) { fail("Trial failed: trap", "The core trapped: " + phEsc(s.trap) + ". Fix the program and run the trial again."); return; }
  var bad = null;
  t.checks.forEach(function (ck) {
    var got = s.regs[PH_ABI[ck.reg]] | 0;
    if (got !== ck.val) bad = ck.reg + " = " + got + ", needed " + ck.val;
  });
  if (bad) { fail("Trial failed: wrong result", "The program finished but " + phEsc(bad) + ". The answer must be right, not just fast."); return; }
  if (s.retired < t.minRetired) {
    fail("Trial failed: too little work", "Only " + s.retired + " instructions retired. The bench requires the real program to run (at least " + t.minRetired + "). No hard-coding the answer.");
    return;
  }
  if (s.cycle > t.budget) {
    fail("Trial failed: over budget", "Finished in " + s.cycle + " cycles against a budget of " + t.budget + " (par " + t.par + "). " + phEsc(t.hint));
    return;
  }
  var st = ui.stamps[t.id] || {};
  st.passed = true;
  st.best = st.best === undefined ? s.cycle : Math.min(st.best, s.cycle);
  ui.stamps[t.id] = st;
  phSaveStamps(ui.stamps);
  var allClear = PH_TRIALS.every(function (x) { return ui.stamps[x.id] && ui.stamps[x.id].passed; });
  var msg = "Cleared in <b>" + s.cycle + " cycles</b> (par " + t.par + ", budget " + t.budget + "), " +
    s.dataStalls + " data stalls, " + s.controlStalls + " control stalls, " + s.forwards + " forwards. Best so far: " + st.best + ".";
  if (allClear) msg += "<br><b>All three trials cleared. The shop names you Master Pipeline Smith.</b>";
  ui.banner.innerHTML = "<h4>Trial cleared</h4><p>" + msg + "</p>";
  ui.banner.classList.add("show");
  ui.banner.classList.remove("fail");
  phRenderBrief();
  phToast(allClear ? "All three trials cleared. Master Pipeline Smith." : "Trial cleared in " + s.cycle + " cycles");
}

/* ---------- profile card download ---------- */
function phDownload() {
  var ui = phUI;
  if (!ui.sim) { phToast("Nothing to profile yet"); return; }
  var s = ui.sim;
  var t = ui.trialIdx === -1 ? null : PH_TRIALS[ui.trialIdx];
  var lines = [];
  lines.push("PIPELINE HAZARD LAB: PROFILE CARD");
  lines.push("Garage Inventions, " + new Date().toISOString().slice(0, 10));
  lines.push("----------------------------------------");
  lines.push("Mode: " + (t ? t.name : "Free Bench"));
  lines.push("Forwarding: " + (ui.fwdOn ? "on" : "off"));
  lines.push("Predictor: " + PH_PRED_NAMES[ui.pred.value]);
  lines.push("");
  lines.push("RESULT");
  lines.push("Cycles: " + s.cycle);
  lines.push("Retired: " + s.retired);
  lines.push("IPC: " + (s.cycle ? (s.retired / s.cycle).toFixed(3) : "0"));
  lines.push("Data stalls: " + s.dataStalls);
  lines.push("Control stalls: " + s.controlStalls);
  lines.push("Forwarded operands: " + s.forwards);
  lines.push("Branch predictions: " + s.predHit + "/" + s.preds);
  if (s.trap) lines.push("TRAP: " + s.trap);
  lines.push("");
  lines.push("STALL BLAME");
  var pcs = Object.keys(s.blame).sort(function (a, b) { return a - b; });
  if (!pcs.length) lines.push("(none, the pipe ran clean)");
  pcs.forEach(function (pck) {
    var b = s.blame[pck], pc = parseInt(pck, 10);
    var ins = ui.instrs.filter(function (x) { return x.pc === pc; })[0];
    lines.push("0x" + pc.toString(16) + " " + (ins ? ins.text : "") + ": " + b.data + " data, " + b.control + " control");
  });
  lines.push("");
  lines.push("TRIAL STAMPS");
  PH_TRIALS.forEach(function (x) {
    var st = ui.stamps[x.id];
    lines.push(x.name + ": " + (st && st.passed ? "CLEARED, best " + st.best + " cycles (par " + x.par + ")" : "not cleared"));
  });
  lines.push("");
  lines.push("PROGRAM");
  lines.push(ui.ed.value);
  lines.push("----------------------------------------");
  lines.push("End of profile card.");
  var blob = new Blob([lines.join("\n")], { type: "text/plain" });
  var a = document.createElement("a");
  a.href = (window.URL || window.webkitURL).createObjectURL(blob);
  a.download = "pipeline-hazard-lab-profile.txt";
  document.body.appendChild(a);
  a.click();
  setTimeout(function () {
    (window.URL || window.webkitURL).revokeObjectURL(a.href);
    a.remove();
  }, 500);
  phToast("Profile card downloaded");
}

/* ---------- init ---------- */
function phInit() {
  if (typeof document === "undefined") return;
  if (!document.querySelector(".dossier .actions")) return;
  phBuild();
}
if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", phInit);
  } else {
    phInit();
  }
}

/* node test hook: harmless in the browser */
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    PH: {
      assemble: phAssemble, newSim: phNewSim, step: phStep, run: phRun,
      TRIALS: PH_TRIALS, ABI: PH_ABI, regName: phRegName
    }
  };
}

})();
/* ============================================================
   THE BURN-IN CHAMBER
   GPU compute-part qualification bench for the TAPEOUT lab.
   Three cards, one chamber, honest verdicts: design a stress
   profile (workload, power limit, fan curve, soak time), watch
   live telemetry from a real lumped-capacitance thermal model,
   then call SHIP or RMA. Cook a card and it is scrap.
   ============================================================ */
(function () {
  "use strict";

  var bi$ = function (id) { return document.getElementById(id); };
  function biToast(msg) {
    var t = bi$("toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(function () { t.classList.remove("show"); }, 1800);
  }
  function biEl(tag, cls, html) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (html != null) d.innerHTML = html;
    return d;
  }
  function biEsc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  var BI_CSS = [
    ".bi-overlay{position:fixed;inset:0;background:rgba(4,7,7,.93);z-index:95;display:none;overflow-y:auto;padding:18px 12px;}",
    ".bi-overlay.open{display:block;}",
    ".bi-panel{max-width:1140px;margin:0 auto;background:var(--panel);border:1px solid var(--line);padding:22px;}",
    ".bi-panel h3{font-family:'Chakra Petch',sans-serif;font-size:26px;margin:0 0 4px;text-transform:uppercase;letter-spacing:.02em;color:var(--acid);}",
    ".bi-sub{font-size:12px;line-height:1.65;color:#9fb3ae;margin:0 0 14px;max-width:80ch;}",
    ".bi-sub a{color:var(--cyan);text-decoration:none;border-bottom:1px dotted var(--cyan);}",
    ".bi-sub b{color:var(--orange);}",
    ".bi-tabs{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;}",
    ".bi-cardtab{background:var(--panel-2);border:1px solid var(--line);color:var(--ink);font:inherit;font-size:11px;padding:10px 14px;cursor:pointer;min-height:52px;text-align:left;min-width:170px;}",
    ".bi-cardtab .sn{display:block;font-family:monospace;font-size:10px;color:#7c8d89;}",
    ".bi-cardtab .st{display:block;font-size:9px;letter-spacing:.12em;text-transform:uppercase;margin-top:4px;color:#7c8d89;}",
    ".bi-cardtab.on{border-color:var(--acid);}",
    ".bi-cardtab .st.ok{color:var(--acid);}",
    ".bi-cardtab .st.warn{color:var(--orange);}",
    ".bi-cardtab .st.bad{color:#ff5d5d;}",
    ".bi-brief{border:1px dashed var(--orange);background:rgba(255,107,44,.05);padding:12px 14px;margin-bottom:12px;font-size:12px;line-height:1.6;color:var(--ink);}",
    ".bi-brief b{color:var(--orange);}",
    ".bi-brief .par{color:var(--acid);}",
    ".bi-ctl{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:12px;}",
    ".bi-field{border:1px solid var(--line);background:var(--panel-2);padding:10px 12px;}",
    ".bi-field h4{margin:0 0 6px;font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:var(--cyan);font-weight:600;}",
    ".bi-field select{width:100%;background:var(--black,#0a0f0e);border:1px solid var(--line);color:var(--ink);font:inherit;font-size:11px;padding:10px 8px;min-height:44px;}",
    ".bi-field input[type=range]{width:100%;accent-color:var(--acid);min-height:44px;}",
    ".bi-field .val{font-family:monospace;font-size:13px;color:var(--acid);}",
    ".bi-toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:12px;}",
    ".bi-toolbar .secondary{min-height:48px;font-size:12px;padding:10px 18px;}",
    ".bi-run{border-color:var(--acid) !important;color:var(--acid) !important;font-weight:700;}",
    ".bi-run.running{border-color:#ff5d5d !important;color:#ff5d5d !important;}",
    ".bi-prog{height:10px;border:1px solid var(--line);background:#0a0f0e;margin-bottom:12px;position:relative;overflow:hidden;}",
    ".bi-prog i{position:absolute;left:0;top:0;bottom:0;width:0;background:var(--acid);}",
    ".bi-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin-bottom:12px;}",
    ".bi-stat{border:1px solid var(--line);background:var(--panel-2);padding:10px 12px;}",
    ".bi-stat h4{margin:0 0 4px;font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:var(--cyan);font-weight:600;}",
    ".bi-stat p{margin:0;font-family:monospace;font-size:18px;color:var(--ink);}",
    ".bi-stat p.hot{color:var(--orange);}",
    ".bi-stat p.crit{color:#ff5d5d;animation:biBlink 0.7s steps(2) infinite;}",
    ".bi-stat p.good{color:var(--acid);}",
    ".bi-stat .tag{display:inline-block;font-size:8px;letter-spacing:.1em;background:var(--orange);color:#0a0f0e;padding:1px 5px;margin-left:6px;vertical-align:middle;}",
    "@keyframes biBlink{50%{opacity:.35;}}",
    ".bi-charts{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;}",
    ".bi-chartbox{border:1px solid var(--line);background:#0a0f0e;padding:8px;}",
    ".bi-chartbox h5{margin:0 0 4px;font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:#7c8d89;font-weight:600;}",
    ".bi-chartbox canvas{width:100%;height:120px;display:block;}",
    ".bi-log{border:1px solid var(--line);background:var(--panel-2);padding:12px 14px;margin-bottom:12px;}",
    ".bi-log h4{margin:0 0 8px;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--cyan);font-weight:600;}",
    ".bi-log table{width:100%;border-collapse:collapse;font-family:monospace;font-size:10px;}",
    ".bi-log th,.bi-log td{border:1px solid #1c2725;padding:5px 7px;text-align:left;}",
    ".bi-log th{color:#7c8d89;text-transform:uppercase;letter-spacing:.08em;font-size:9px;}",
    ".bi-log td.hot{color:var(--orange);}",
    ".bi-log td.err{color:#ff5d5d;}",
    ".bi-log .empty{font-size:11px;color:#5f726e;}",
    ".bi-verdict{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;}",
    ".bi-verdict button{min-height:52px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;cursor:pointer;font-family:'Chakra Petch',sans-serif;}",
    ".bi-verdict .ship{background:rgba(199,255,56,.08);border:1px solid var(--acid);color:var(--acid);}",
    ".bi-verdict .rma{background:rgba(255,93,93,.08);border:1px solid #ff5d5d;color:#ff5d5d;}",
    ".bi-verdict button:disabled{opacity:.35;cursor:not-allowed;}",
    ".bi-verdict .called{opacity:1;box-shadow:0 0 0 2px currentColor;}",
    ".bi-banner{border:1px solid var(--acid);background:rgba(199,255,56,.06);padding:14px 16px;margin:14px 0;display:none;}",
    ".bi-banner.show{display:block;}",
    ".bi-banner h4{margin:0 0 6px;font-family:'Chakra Petch',sans-serif;font-size:18px;text-transform:uppercase;color:var(--acid);}",
    ".bi-banner p{margin:0 0 10px;font-size:12px;line-height:1.6;color:var(--ink);}",
    ".bi-banner.fail{border-color:#ff5d5d;background:rgba(255,93,93,.06);}",
    ".bi-banner.fail h4{color:#ff5d5d;}",
    ".bi-score{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px;font-size:11px;color:#9fb3ae;}",
    ".bi-score b{font-family:monospace;font-size:15px;color:var(--acid);}",
    ".bi-foot{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;}",
    ".bi-foot .secondary{flex:1;min-height:48px;}",
    "@media (max-width:900px){",
    ".bi-charts{grid-template-columns:1fr;}",
    ".bi-panel{padding:14px;}",
    ".bi-panel h3{font-size:20px;}",
    ".bi-overlay{padding:10px 8px;}",
    ".bi-field select{font-size:16px;}",
    "}"
  ].join("\n");

  /* ---------------- sim core (pure, unit-testable) ---------------- */

  var BI_T_AMB = 24;      /* chamber ambient, C */
  var BI_T_TARGET = 83;   /* boost starts derating above this */
  var BI_T_MAX = 105;     /* thermal shutdown */
  var BI_C = 65;          /* lumped thermal capacitance, J/K */

  var BI_WORKLOADS = {
    compute: { label: "Compute (shaders, full ALU)", power: 1.00, eccMem: 0 },
    mixed:   { label: "Mixed (render loop)",         power: 0.85, eccMem: 1 },
    memory:  { label: "Memory (VRAM hammer)",        power: 0.70, eccMem: 2 }
  };
  var BI_FANS = {
    quiet:     { label: "Quiet (40% max)", h: 3.2 },
    balanced:  { label: "Balanced (65% max)", h: 5.0 },
    aggressive:{ label: "Aggressive (100%)", h: 7.5 },
    auto:      { label: "Auto curve", h: null }
  };

  /* Hidden faults are shuffled among the three serials every shift,
     so the bench cannot be memorized. */
  function biMakeCards() {
    var defs = [
      { model: "VX-90X 24GB", serial: "BI-90117", tdp: 300, boost: 2520 },
      { model: "VX-90X 24GB", serial: "BI-90122", tdp: 300, boost: 2520 },
      { model: "VX-90X 24GB", serial: "BI-90131", tdp: 300, boost: 2520 }
    ];
    var faults = ["none", "paste", "vram"];
    for (var i = faults.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = faults[i]; faults[i] = faults[j]; faults[j] = t;
    }
    defs.forEach(function (d, k) {
      d.fault = faults[k];
      d.cooling = d.fault === "paste" ? 0.78 : 1.0;   /* dried paste: poor heat transfer */
      d.truth = d.fault === "none" ? "ship" : "rma";  /* healthy ships, faulty is RMA */
    });
    return defs;
  }

  function biFanH(curve, T) {
    if (curve === "auto") {
      var f = 3.2 + (T - 40) / 65 * 4.3;
      if (f < 3.2) f = 3.2;
      if (f > 7.5) f = 7.5;
      return f;
    }
    return BI_FANS[curve].h;
  }

  /* One physics tick. s is mutated; returns an event summary. */
  function biStep(s, card, prof, dt) {
    var wl = BI_WORKLOADS[prof.workload];
    var ev = { shutdown: false, ecc: 0 };
    if (s.dead) return ev;

    /* boost: full below target, derates linearly to 70% at (T_MAX - 10) */
    var span = (BI_T_MAX - 10) - BI_T_TARGET;
    var ratio = 1;
    if (s.T > BI_T_TARGET) {
      ratio = 1 - Math.min(1, (s.T - BI_T_TARGET) / span) * 0.30;
    }
    var clockTarget = card.boost * ratio;
    s.clock += (clockTarget - s.clock) * Math.min(1, dt / 4);

    s.power = card.tdp * wl.power * prof.powerLimit * (s.clock / card.boost);

    var h = biFanH(prof.fan, s.T) * card.cooling;
    s.fanPct = prof.fan === "auto"
      ? Math.round(40 + Math.min(1, Math.max(0, (s.T - 40) / 65)) * 60)
      : (prof.fan === "quiet" ? 40 : prof.fan === "balanced" ? 65 : 100);

    s.T += (s.power - h * (s.T - BI_T_AMB)) * dt / BI_C;
    s.t += dt;

    /* ECC: Poisson-ish. Marginal VRAM screams under memory load,
       and heat makes it worse. Healthy silicon is nearly silent. */
    var rate;
    if (card.fault === "vram") {
      var base = wl.eccMem === 2 ? 0.60 : wl.eccMem === 1 ? 0.20 : 0.05;
      var heat = 1 + Math.max(0, s.T - 65) * 0.06;
      rate = base * heat * Math.pow(s.clock / card.boost, 2);
    } else if (card.fault === "paste") {
      rate = 0.005;
    } else {
      rate = 0.002;
    }
    var p = 1 - Math.exp(-rate * dt);
    if (Math.random() < p) {
      ev.ecc = 1 + (Math.random() < 0.15 ? Math.floor(Math.random() * 3) + 1 : 0);
      s.ecc += ev.ecc;
    }
    if (s.maxT === undefined || s.T > s.maxT) s.maxT = s.T;

    if (s.T >= BI_T_MAX) {
      s.dead = true;
      ev.shutdown = true;
    }
    return ev;
  }

  function biNewRun() {
    return { T: BI_T_AMB + 2, clock: 0, power: 0, fanPct: 40, ecc: 0, t: 0, dead: false, maxT: BI_T_AMB + 2, samples: [] };
  }

  /* ---------------- UI ---------------- */

  var biUI = null;

  var BI_SPEEDS = { 1: 2, 4: 8, 16: 32 };   /* sim seconds per 100ms tick */

  function biLoadBest() {
    try {
      var v = window.localStorage.getItem("biBest");
      return v === null ? null : parseInt(v, 10);
    } catch (e) { return null; }
  }
  function biSaveBest(v) {
    try { window.localStorage.setItem("biBest", String(v)); } catch (e) {}
  }

  function biNewShift() {
    return {
      cards: biMakeCards(),
      cardIdx: 0,
      logs: [[], [], []],        /* per-card run summaries */
      verdicts: [null, null, null],
      running: false,
      timer: null,
      sim: biNewRun(),
      prof: { workload: "compute", powerLimit: 1.0, fan: "balanced", dur: 180, speed: 4 },
      score: 0,
      finished: false
    };
  }

  function biStatusOf(sh, i) {
    if (sh.verdicts[i]) return { cls: "ok", txt: "VERDICT: " + sh.verdicts[i].toUpperCase() };
    if (sh.logs[i].length) {
      var secs = sh.logs[i].reduce(function (a, r) { return a + r.dur; }, 0);
      if (sh.logs[i].some(function (r) { return r.shutdown; })) return { cls: "bad", txt: "KILLED IN CHAMBER" };
      return { cls: secs >= 60 ? "ok" : "warn", txt: "LOGGED " + Math.round(secs) + "s" };
    }
    return { cls: "", txt: "UNTESTED" };
  }

  function biBuild() {
    if (biUI) return biUI;
    var st = document.createElement("style");
    st.textContent = BI_CSS;
    document.head.appendChild(st);

    var box = document.querySelector(".dossier .actions");
    if (box && !bi$("biBtn")) {
      var b = biEl("button", "secondary", "Run the Burn-In Chamber");
      b.id = "biBtn";
      b.addEventListener("click", function () { bi$("biOverlay").classList.add("open"); });
      box.appendChild(b);
    }

    var ov = biEl("div", "bi-overlay");
    ov.id = "biOverlay";
    var panel = biEl("div", "bi-panel");
    panel.innerHTML =
      "<h3>The Burn-In Chamber</h3>" +
      '<p class="bi-sub">This is the qualification rig behind the <a href="https://dillingerstaffing.github.io/tapeout/" target="_blank" rel="noopener">TAPEOUT</a> lab: three compute cards came back from the field and every one needs an honest burn-in before it ships or is sent back for RMA. Pick a card, design the stress profile, run the chamber, read the telemetry, then call <b>SHIP</b> or <b>RMA</b>. Two of these cards are carrying faults you cannot see from the outside. Push a sick card too hard and it dies in the chamber, which counts as a miss. Scoring: 100 points per correct call, 300 for a clean sweep.</p>';
    ov.appendChild(panel);
    document.body.appendChild(ov);

    var ui = { sh: biNewShift(), charts: {}, chartCtx: {} };
    biUI = ui;

    /* card tabs */
    ui.tabs = biEl("div", "bi-tabs");
    panel.appendChild(ui.tabs);

    /* brief */
    ui.brief = biEl("div", "bi-brief",
      "<b>How to read a card:</b> a healthy card holds boost near its rated clock, lands in the expected temperature band, and stays nearly silent on ECC. " +
      "A card with dried thermal paste runs hot for the same power and sheds boost (watch the THROTTLING tag). " +
      "A card with marginal VRAM throws correctable ECC bursts, loudest under the memory workload. " +
      "Tip: match the stress to the suspicion. A compute soak will not catch bad VRAM, and a gentle memory pass will not catch bad paste. " +
      "You need at least 60 seconds of logged burn per card before a verdict unlocks. " +
      '<span class="par">House par: 300 points, zero kills.</span>');
    panel.appendChild(ui.brief);

    /* controls */
    ui.ctl = biEl("div", "bi-ctl");
    panel.appendChild(ui.ctl);

    function field(title) {
      var f = biEl("div", "bi-field", "<h4>" + biEsc(title) + "</h4>");
      ui.ctl.appendChild(f);
      return f;
    }
    var fw = field("Workload");
    ui.selW = biEl("select", null, "");
    Object.keys(BI_WORKLOADS).forEach(function (k) {
      var o = document.createElement("option");
      o.value = k; o.textContent = BI_WORKLOADS[k].label;
      ui.selW.appendChild(o);
    });
    ui.selW.value = "compute";
    fw.appendChild(ui.selW);

    var fp = field("Power limit");
    ui.rngP = document.createElement("input");
    ui.rngP.type = "range"; ui.rngP.min = "50"; ui.rngP.max = "120"; ui.rngP.step = "5"; ui.rngP.value = "100";
    ui.valP = biEl("div", "val", "100%");
    ui.rngP.addEventListener("input", function () { ui.valP.textContent = ui.rngP.value + "%"; });
    fp.appendChild(ui.rngP); fp.appendChild(ui.valP);

    var ff = field("Fan curve");
    ui.selF = biEl("select", null, "");
    Object.keys(BI_FANS).forEach(function (k) {
      var o = document.createElement("option");
      o.value = k; o.textContent = BI_FANS[k].label;
      ui.selF.appendChild(o);
    });
    ui.selF.value = "balanced";
    ff.appendChild(ui.selF);

    var fd = field("Soak time");
    ui.selD = biEl("select", null, "");
    [["60", "1 minute (quick screen)"], ["180", "3 minutes (standard)"], ["420", "7 minutes (torture test)"]].forEach(function (o) {
      var el2 = document.createElement("option");
      el2.value = o[0]; el2.textContent = o[1];
      ui.selD.appendChild(el2);
    });
    ui.selD.value = "180";
    fd.appendChild(ui.selD);

    var fs = field("Chamber speed");
    ui.selS = biEl("select", null, "");
    [["1", "1x (real time)"], ["4", "4x (fast)"], ["16", "16x (time lapse)"]].forEach(function (o) {
      var el2 = document.createElement("option");
      el2.value = o[0]; el2.textContent = o[1] + "";
      ui.selS.appendChild(el2);
    });
    ui.selS.value = "4";
    fs.appendChild(ui.selS);

    /* toolbar */
    ui.bar = biEl("div", "bi-toolbar");
    ui.runBtn = biEl("button", "secondary bi-run", "RUN CHAMBER");
    ui.runBtn.addEventListener("click", biToggleRun);
    ui.bar.appendChild(ui.runBtn);
    ui.abortBtn = biEl("button", "secondary", "Abort run");
    ui.abortBtn.addEventListener("click", function () { biEndRun(true); });
    ui.bar.appendChild(ui.abortBtn);
    ui.newBtn = biEl("button", "secondary", "New shift (reshuffle faults)");
    ui.newBtn.addEventListener("click", function () {
      if (ui.sh.running) { biToast("Finish or abort the run first"); return; }
      ui.sh = biNewShift();
      ui.finished = false;
      biBanner(false, "", "");
      biRenderAll();
      biToast("New shift: faults reshuffled");
    });
    ui.bar.appendChild(ui.newBtn);
    ui.closeBtn = biEl("button", "secondary", "Close chamber");
    ui.closeBtn.addEventListener("click", function () {
      if (ui.sh.running) biEndRun(true);
      bi$("biOverlay").classList.remove("open");
    });
    ui.bar.appendChild(ui.closeBtn);
    panel.appendChild(ui.bar);

    ui.prog = biEl("div", "bi-prog", "<i></i>");
    panel.appendChild(ui.prog);

    /* stats */
    ui.stats = biEl("div", "bi-stats");
    var defs = [["TEMP", "stT", "C"], ["CLOCK", "stC", "MHz"], ["POWER", "stP", "W"], ["FAN", "stF", "%"], ["ECC ERRORS", "stE", ""], ["ELAPSED", "stL", "s"]];
    ui.statEls = {};
    defs.forEach(function (d) {
      var s2 = biEl("div", "bi-stat", "<h4>" + d[0] + "</h4><p id=\"bi_" + d[1] + "\">--</p>");
      ui.stats.appendChild(s2);
      ui.statEls[d[1]] = s2.querySelector("p");
    });
    panel.appendChild(ui.stats);

    /* charts */
    ui.chartsWrap = biEl("div", "bi-charts");
    var chartDefs = [
      ["cT", "Temperature (C)", "--acid"],
      ["cC", "Clock (MHz)", "--cyan"],
      ["cP", "Power (W)", "--orange"],
      ["cE", "ECC errors (cumulative)", "#ff5d5d"]
    ];
    chartDefs.forEach(function (cd) {
      var bx = biEl("div", "bi-chartbox", "<h5>" + cd[1] + "</h5>");
      var cv = document.createElement("canvas");
      bx.appendChild(cv);
      ui.chartsWrap.appendChild(bx);
      ui.chartCtx[cd[0]] = { cv: cv, color: cd[2], key: cd[0] };
    });
    panel.appendChild(ui.chartsWrap);

    /* burn log */
    ui.log = biEl("div", "bi-log");
    panel.appendChild(ui.log);

    /* verdict */
    ui.verd = biEl("div", "bi-verdict");
    ui.shipBtn = biEl("button", "ship", "SHIP IT");
    ui.rmaBtn = biEl("button", "rma", "RMA IT");
    ui.shipBtn.addEventListener("click", function () { biVerdict("ship"); });
    ui.rmaBtn.addEventListener("click", function () { biVerdict("rma"); });
    ui.verd.appendChild(ui.shipBtn);
    ui.verd.appendChild(ui.rmaBtn);
    panel.appendChild(ui.verd);

    /* score */
    ui.scoreRow = biEl("div", "bi-score");
    panel.appendChild(ui.scoreRow);

    /* banner */
    ui.banner = biEl("div", "bi-banner");
    panel.appendChild(ui.banner);

    /* foot */
    ui.foot = biEl("div", "bi-foot");
    ui.dlBtn = biEl("button", "secondary", "Download burn-in certificate");
    ui.dlBtn.addEventListener("click", biDownload);
    ui.dlBtn.style.display = "none";
    ui.foot.appendChild(ui.dlBtn);
    panel.appendChild(ui.foot);

    biRenderAll();
    return ui;
  }

  /* ---------------- render ---------------- */

  function biRenderAll() {
    biRenderTabs(); biRenderLog(); biRenderVerdict(); biRenderScore(); biRenderStats(biUI.sim);
    biDrawCharts();
  }

  function biRenderTabs() {
    var ui = biUI, sh = ui.sh;
    ui.tabs.innerHTML = "";
    sh.cards.forEach(function (c, i) {
      var st = biStatusOf(sh, i);
      var tb = biEl("button", "bi-cardtab" + (i === sh.cardIdx ? " on" : ""),
        biEsc(c.model) + '<span class="sn">S/N ' + biEsc(c.serial) + '</span>' +
        '<span class="st ' + st.cls + '">' + biEsc(st.txt) + "</span>");
      tb.addEventListener("click", function () {
        if (sh.running) { biToast("Card is in the chamber"); return; }
        sh.cardIdx = i;
        sh.sim = biNewRun();
        biRenderAll();
      });
      ui.tabs.appendChild(tb);
    });
  }

  function biRenderStats(s) {
    var ui = biUI;
    var E = ui.statEls;
    var set = function (id, txt, cls) {
      E[id].textContent = txt;
      E[id].className = cls || "";
    };
    if (!s || s.t === 0) {
      ["stT", "stC", "stP", "stF", "stE", "stL"].forEach(function (id) { set(id, "--"); });
      return;
    }
    var tCls = s.T >= BI_T_MAX - 10 ? "crit" : s.T >= BI_T_TARGET ? "hot" : "";
    set("stT", Math.round(s.T) + " C" + (s.T >= BI_T_TARGET && s.T < BI_T_MAX ? " THROTTLING" : ""), tCls);
    var card = ui.sh.cards[ui.sh.cardIdx];
    var clkPct = s.clock / card.boost;
    set("stC", Math.round(s.clock) + " MHz", clkPct < 0.95 && s.t > 10 ? "hot" : "");
    set("stP", Math.round(s.power) + " W", "");
    set("stF", s.fanPct + "%", "");
    set("stE", String(s.ecc), s.ecc > 20 ? "crit" : s.ecc > 0 ? "hot" : "good");
    set("stL", Math.round(s.t) + "s", "");
  }

  function biRenderLog() {
    var ui = biUI, sh = ui.sh, i = sh.cardIdx;
    var rows = sh.logs[i];
    var h = "<h4>Burn log, S/N " + biEsc(sh.cards[i].serial) + "</h4>";
    if (!rows.length) {
      ui.log.innerHTML = h + '<p class="empty">No runs yet. Design a profile and run the chamber.</p>';
      return;
    }
    h += '<table><tr><th>Run</th><th>Workload</th><th>Power</th><th>Fan</th><th>Soak</th><th>Peak temp</th><th>Avg clock</th><th>ECC</th><th>Result</th></tr>';
    rows.forEach(function (r, k) {
      var hot = r.maxT >= BI_T_TARGET ? ' class="hot"' : "";
      var ecc = r.ecc > 0 ? ' class="err"' : "";
      h += "<tr><td>" + (k + 1) + "</td><td>" + biEsc(BI_WORKLOADS[r.workload].label.split(" (")[0]) + "</td>" +
        "<td>" + Math.round(r.powerLimit * 100) + "%</td><td>" + biEsc(r.fan) + "</td>" +
        "<td>" + Math.round(r.dur) + "s</td><td" + hot + ">" + Math.round(r.maxT) + " C</td>" +
        "<td>" + Math.round(r.avgClock) + " MHz</td><td" + ecc + ">" + r.ecc + "</td>" +
        "<td>" + (r.shutdown ? '<span style="color:#ff5d5d">SHUTDOWN</span>' : "complete") + "</td></tr>";
    });
    ui.log.innerHTML = h + "</table>";
  }

  function biCanJudge(i) {
    var sh = biUI.sh;
    if (sh.verdicts[i]) return false;
    if (sh.logs[i].some(function (r) { return r.shutdown; })) return false; /* killed cards score 0, no verdict needed */
    var secs = sh.logs[i].reduce(function (a, r) { return a + r.dur; }, 0);
    return secs >= 60;
  }

  function biRenderVerdict() {
    var ui = biUI, sh = ui.sh, i = sh.cardIdx;
    var v = sh.verdicts[i];
    var killed = sh.logs[i].some(function (r) { return r.shutdown; });
    ui.shipBtn.disabled = !biCanJudge(i);
    ui.rmaBtn.disabled = !biCanJudge(i);
    ui.shipBtn.className = "ship" + (v === "ship" ? " called" : "");
    ui.rmaBtn.className = "rma" + (v === "rma" ? " called" : "");
    if (killed && !v) {
      ui.shipBtn.disabled = true; ui.rmaBtn.disabled = true;
      ui.shipBtn.textContent = "CARD DEAD";
      ui.rmaBtn.textContent = "SCRAPPED (0 PTS)";
    } else {
      ui.shipBtn.textContent = "SHIP IT";
      ui.rmaBtn.textContent = "RMA IT";
    }
  }

  function biRenderScore() {
    var ui = biUI, sh = ui.sh;
    var done = sh.verdicts.filter(function (v) { return v; }).length;
    var killed = sh.cards.filter(function (c, i) { return sh.logs[i].some(function (r) { return r.shutdown; }); }).length;
    var best = biLoadBest();
    ui.scoreRow.innerHTML = "Score <b>" + sh.score + " / 300</b> &middot; judged " + done + "/3" +
      (killed ? " &middot; <span style=\"color:#ff5d5d\">" + killed + " killed</span>" : "") +
      (best !== null ? " &middot; best " + best : "");
  }

  function biBanner(show, title, body, fail) {
    var ui = biUI;
    ui.banner.className = "bi-banner" + (show ? " show" : "") + (fail ? " fail" : "");
    ui.banner.innerHTML = show ? ("<h4>" + title + "</h4><p>" + body + "</p>") : "";
  }

  /* ---------------- run loop ---------------- */

  function biReadProfile() {
    var ui = biUI;
    return {
      workload: ui.selW.value,
      powerLimit: parseInt(ui.rngP.value, 10) / 100,
      fan: ui.selF.value,
      dur: parseInt(ui.selD.value, 10),
      speed: parseInt(ui.selS.value, 10)
    };
  }

  function biToggleRun() {
    var ui = biUI, sh = ui.sh;
    if (sh.running) { biEndRun(true); return; }
    var i = sh.cardIdx;
    if (sh.verdicts[i]) { biToast("Already judged, pick another card"); return; }
    if (sh.logs[i].some(function (r) { return r.shutdown; })) { biToast("That card is dead"); return; }
    sh.prof = biReadProfile();
    sh.sim = biNewRun();
    sh.sim.prof = sh.prof;
    sh.running = true;
    sh.clockSum = 0; sh.clockN = 0;
    ui.runBtn.textContent = "STOP";
    ui.runBtn.classList.add("running");
    ui.prog.firstChild.style.width = "0%";
    ui.timer = setInterval(biTick, 100);
    biToast("Chamber sealed, burn started");
  }

  function biTick() {
    var ui = biUI, sh = ui.sh;
    if (!sh.running) return;
    var dt = BI_SPEEDS[sh.prof.speed] || 8;
    var card = sh.cards[sh.cardIdx];
    var ev = biStep(sh.sim, card, sh.prof, dt);
    sh.clockSum += sh.sim.clock; sh.clockN++;
    if (sh.sim.samples.length < 2000) {
      sh.sim.samples.push({ t: sh.sim.t, T: sh.sim.T, clock: sh.sim.clock, power: sh.sim.power, ecc: sh.sim.ecc });
    }
    ui.prog.firstChild.style.width = Math.min(100, sh.sim.t / sh.prof.dur * 100) + "%";
    biRenderStats(sh.sim);
    biDrawCharts();
    if (ev.shutdown) {
      biEndRun(false, true);
      return;
    }
    if (sh.sim.t >= sh.prof.dur) biEndRun(false, false);
  }

  function biEndRun(aborted, shutdown) {
    var ui = biUI, sh = ui.sh;
    if (!sh.running) return;
    clearInterval(ui.timer);
    sh.running = false;
    ui.runBtn.textContent = "RUN CHAMBER";
    ui.runBtn.classList.remove("running");
    var i = sh.cardIdx, s = sh.sim;
    if (!aborted && s.t >= 20) {
      sh.logs[i].push({
        workload: sh.prof.workload,
        powerLimit: sh.prof.powerLimit,
        fan: sh.prof.fan,
        dur: Math.round(s.t),
        maxT: Math.round(s.maxT),
        avgClock: Math.round(sh.clockN ? sh.clockSum / sh.clockN : 0),
        ecc: s.ecc,
        shutdown: !!shutdown
      });
      if (shutdown) biToast("THERMAL SHUTDOWN: card is scrap");
      else biToast("Run logged");
    } else if (aborted) {
      biToast("Run aborted, not logged");
    }
    biRenderAll();
  }

  function biDrawCharts() {
    var ui = biUI;
    if (!ui || !ui.chartCtx) return;
    var s = ui.sh.sim;
    var draw = function (key, get, min, max, color, unit, lines) {
      var c = ui.chartCtx[key];
      if (!c) return;
      var cv = c.cv;
      var W = cv.clientWidth || 300, H = 120;
      if (cv.width !== W * 2) { cv.width = W * 2; cv.height = H * 2; }
      var g = cv.getContext("2d");
      g.setTransform(2, 0, 0, 2, 0, 0);
      g.clearRect(0, 0, W, H);
      g.strokeStyle = "#1c2725";
      g.lineWidth = 1;
      for (var gy = 0; gy <= 4; gy++) {
        var yy = 8 + (H - 16) * gy / 4;
        g.beginPath(); g.moveTo(0, yy); g.lineTo(W, yy); g.stroke();
      }
      if (lines) {
        lines.forEach(function (ln) {
          var ly = 8 + (H - 16) * (1 - (ln.v - min) / (max - min));
          g.strokeStyle = ln.c; g.setLineDash([4, 4]);
          g.beginPath(); g.moveTo(0, ly); g.lineTo(W, ly); g.stroke();
          g.setLineDash([]);
          g.fillStyle = ln.c; g.font = "9px monospace";
          g.fillText(ln.l, 4, Math.max(10, ly - 3));
        });
      }
      var pts = s.samples;
      if (pts.length < 2) return;
      g.strokeStyle = color; g.lineWidth = 1.6;
      g.beginPath();
      var t0 = pts[0].t, t1 = pts[pts.length - 1].t;
      pts.forEach(function (p, k) {
        var x = t1 > t0 ? (p.t - t0) / (t1 - t0) * (W - 8) + 4 : 4;
        var v = get(p);
        var y = 8 + (H - 16) * (1 - Math.min(1, Math.max(0, (v - min) / (max - min))));
        if (k === 0) g.moveTo(x, y); else g.lineTo(x, y);
      });
      g.stroke();
      var last = get(pts[pts.length - 1]);
      g.fillStyle = "#cfe3dd"; g.font = "10px monospace";
      g.fillText(unit ? (Math.round(last) + " " + unit) : String(Math.round(last)), W - 64, 16);
    };
    var card = ui.sh.cards[ui.sh.cardIdx];
    draw("cT", function (p) { return p.T; }, 20, 115, "#c7ff38", "C", [
      { v: BI_T_TARGET, c: "#ff6b2c", l: "TARGET 83C" },
      { v: BI_T_MAX, c: "#ff5d5d", l: "SHUTDOWN 105C" }
    ]);
    draw("cC", function (p) { return p.clock; }, 0, card.boost * 1.05, "#39d0ff", "MHz", [
      { v: card.boost, c: "#39d0ff", l: "RATED " + card.boost }
    ]);
    draw("cP", function (p) { return p.power; }, 0, card.tdp * 1.25, "#ff6b2c", "W", [
      { v: card.tdp, c: "#ff6b2c", l: "TDP " + card.tdp }
    ]);
    draw("cE", function (p) { return p.ecc; }, 0, Math.max(10, s.ecc * 1.2), "#ff5d5d", "errs", null);
  }

  /* ---------------- verdicts, scoring, certificate ---------------- */

  function biVerdict(v) {
    var ui = biUI, sh = ui.sh, i = sh.cardIdx;
    if (!biCanJudge(i)) return;
    sh.verdicts[i] = v;
    var card = sh.cards[i];
    var correct = (v === card.truth);
    if (correct) sh.score += 100;
    biToast(correct ? "Correct call: +100" : "Missed that one");
    biRenderAll();
    biFinishCheck();
  }

  function biFaultName(f) {
    return f === "none" ? "healthy" : f === "paste" ? "dried thermal paste" : "marginal VRAM";
  }

  function biFinishCheck() {
    var ui = biUI, sh = ui.sh;
    var judged = sh.verdicts.filter(function (v) { return v; }).length;
    var killed = sh.cards.filter(function (c, i) { return sh.logs[i].some(function (r) { return r.shutdown; }); }).length;
    if (judged + killed < 3) return;
    sh.finished = true;
    var best = biLoadBest();
    if (best === null || sh.score > best) biSaveBest(sh.score);
    ui.dlBtn.style.display = "";
    var detail = sh.cards.map(function (c, i) {
      var v = sh.verdicts[i];
      var fate = v ? (v === c.truth ? "correct" : "wrong") : "killed in chamber";
      return "S/N " + c.serial + ": " + biFaultName(c.fault) + ", you called " + (v ? v.toUpperCase() : "nothing") + " (" + fate + ")";
    }).join("<br>");
    if (sh.score === 300) {
      biBanner(true, "Clean sweep: 300 / 300",
        "All three cards judged correctly and the chamber stands. " + detail +
        "<br><br>This is the same honesty the TAPEOUT lab promises its buyers: every card ships with its real burn log, faults and all. " +
        "Download the certificate below, it is the artifact this shift produced.",
        false);
    } else {
      var coach = killed
        ? "You cooked " + killed + " card" + (killed > 1 ? "s" : "") + ". Aggressive profiles find faults faster but the shutdown line is real: back the power limit down or open the fan curve before a long soak."
        : "Read the logs again: hot-for-the-power means paste, ECC bursts under the memory workload mean VRAM. Run a fresh shift and hunt each fault with the workload that exposes it.";
      biBanner(true, "Shift complete: " + sh.score + " / 300",
        detail + "<br><br>" + coach + "<br><br>The certificate records exactly what happened, misses included. TAPEOUT publishes burn logs, not marketing.",
        true);
    }
    biRenderScore();
  }

  function biDownload() {
    var ui = biUI, sh = ui.sh;
    var lines = [];
    lines.push("BURN-IN CHAMBER: QUALIFICATION CERTIFICATE");
    lines.push("Garage Inventions, " + new Date().toISOString().slice(0, 10));
    lines.push("Lab: TAPEOUT compute-part qualification");
    lines.push("----------------------------------------");
    sh.cards.forEach(function (c, i) {
      lines.push("");
      lines.push("CARD " + (i + 1) + ": " + c.model + "  S/N " + c.serial);
      lines.push("Hidden condition: " + biFaultName(c.fault));
      sh.logs[i].forEach(function (r, k) {
        lines.push("  Run " + (k + 1) + ": " + r.workload + " @ " + Math.round(r.powerLimit * 100) + "%, fan " + r.fan +
          ", " + r.dur + "s soak, peak " + r.maxT + "C, avg clock " + r.avgClock + " MHz, ECC " + r.ecc +
          (r.shutdown ? " *** THERMAL SHUTDOWN ***" : ""));
      });
      var v = sh.verdicts[i];
      lines.push("  Verdict: " + (v ? v.toUpperCase() : "none (card killed)") +
        (v ? (v === c.truth ? " (correct)" : " (WRONG)") : ""));
    });
    lines.push("");
    lines.push("SHIFT SCORE: " + sh.score + " / 300");
    lines.push("----------------------------------------");
    lines.push("Every card ships with its real burn log. That is the TAPEOUT promise.");
    lines.push("End of certificate.");
    var blob = new Blob([lines.join("\n")], { type: "text/plain" });
    var a = document.createElement("a");
    a.href = (window.URL || window.webkitURL).createObjectURL(blob);
    a.download = "burn-in-chamber-certificate.txt";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      (window.URL || window.webkitURL).revokeObjectURL(a.href);
      a.remove();
    }, 500);
    biToast("Certificate downloaded");
  }

  /* ---------------- init ---------------- */

  function biInit() {
    if (typeof document === "undefined") return;
    if (!document.querySelector(".dossier .actions")) return;
    biBuild();
  }
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", biInit);
    } else {
      biInit();
    }
  }

  /* node test hook: harmless in the browser */
  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      BI: {
        step: biStep, fanH: biFanH, makeCards: biMakeCards, newRun: biNewRun,
        WORKLOADS: BI_WORKLOADS, FANS: BI_FANS,
        T_AMB: BI_T_AMB, T_TARGET: BI_T_TARGET, T_MAX: BI_T_MAX
      }
    };
  }

})();
