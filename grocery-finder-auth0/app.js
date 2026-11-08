/* Grocery Finder — search flow: geocode a postal code or address,
   find the 9 chains nearby via stores.js, draw the receipt list + Leaflet map.
   Exposes window.storePins / window.lastSearch / window.searchMode for account.js. */

(function () {
  "use strict";

  function $(id) { return document.getElementById(id); }

  // ---------- dark / light mode ----------
  var root = document.documentElement;
  var themeBtn = $("theme-btn");
  function setTheme(t) {
    root.setAttribute("data-theme", t);
    themeBtn.textContent = (t === "dark") ? "Light" : "Dark";
    try { localStorage.setItem("gf-theme", t); } catch (e) {}
  }
  setTheme((function () {
    try { return localStorage.getItem("gf-theme") || "light"; } catch (e) { return "light"; }
  })());
  themeBtn.addEventListener("click", function () {
    setTheme(root.getAttribute("data-theme") === "dark" ? "light" : "dark");
  });

  // ---------- search mode ----------
  function searchMode() {
    var checked = document.querySelector('input[name="mode"]:checked');
    return checked ? checked.value : "postal";
  }
  window.searchMode = searchMode;

  function radius() {
    var checked = document.querySelector('input[name="radius"]:checked');
    return checked ? Number(checked.value) : 5;
  }

  // Keep the placeholder/label in sync with the chosen mode.
  document.querySelectorAll('input[name="mode"]').forEach(function (r) {
    r.addEventListener("change", function () {
      $("place").placeholder = (searchMode() === "postal") ? "V6K 1P2" : "121 Main St W, Hamilton";
    });
  });

  // ---------- progress bar ----------
  var fill = $("progress-fill"), pct = $("progress-pct"), label = $("progress-label");
  function showProgress(on, text) {
    $("progress").hidden = !on;
    if (on) { fill.style.width = "10%"; pct.textContent = "10%"; label.textContent = text || "Starting…"; }
  }
  function setProgress(p, text) {
    p = Math.max(0, Math.min(100, Math.round(p)));
    fill.style.width = p + "%";
    pct.textContent = p + "%";
    if (text) label.textContent = text;
  }
  function setError(msg) { $("error").textContent = msg || ""; }

  // ---------- geocoding (Nominatim, free) ----------
  async function geocode(query, isPostal) {
    var q = isPostal ? query + ", Canada" : query + ", Canada";
    var url = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=ca&q=" +
      encodeURIComponent(q);
    var res = await fetch(url, { headers: { "Accept": "application/json" } });
    if (!res.ok) throw new Error("Location lookup failed");
    var hits = await res.json();
    if (!hits.length) return null;
    return { lat: Number(hits[0].lat), lon: Number(hits[0].lon), label: hits[0].display_name.split(",").slice(0, 2).join(", ") };
  }

  async function reverseGeocode(lat, lon) {
    try {
      var res = await fetch("https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=" + lat + "&lon=" + lon);
      var j = await res.json();
      var bits = [j.address && (j.address.town || j.address.city || j.address.village || j.address.suburb), j.address && j.address.state];
      return bits.filter(Boolean).join(", ") || "your location";
    } catch (e) { return "your location"; }
  }

  // ---------- map ----------
  var map = null, youMarker = null, pins = [];
  window.storePins = pins;

  function initMap(lat, lon) {
    if (!map) {
      map = L.map("map", { scrollWheelZoom: false });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19, attribution: "© OpenStreetMap contributors"
      }).addTo(map);
    }
    if (youMarker) map.removeLayer(youMarker);
    youMarker = L.marker([lat, lon], {
      icon: L.divIcon({ className: "", html: '<div class="pin-you"></div>', iconSize: [16, 16], iconAnchor: [8, 8] }),
      zIndexOffset: 1000
    }).addTo(map);
    map.setView([lat, lon], Math.min(14, 13 + Math.round(radius() / 4)), { animate: true });
  }

  function clearStorePins() {
    pins.forEach(function (p) { if (p.marker) map.removeLayer(p.marker); });
    pins.length = 0;
  }

  function highlight(i) {
    var list = document.getElementById("store-list");
    Array.prototype.forEach.call(list.children, function (li, j) {
      li.classList.toggle("active", j === i);
    });
    pins.forEach(function (p, j) {
      if (!p.marker) return;
      p.marker.getElement() && p.marker.getElement().classList.toggle("active", j === i);
    });
    if (pins[i] && pins[i].marker) map.flyTo([pins[i].store.lat, pins[i].store.lon], Math.max(map.getZoom(), 14), { duration: .5 });
  }

  function addStorePin(store, i) {
    var marker = L.marker([store.lat, store.lon], {
      icon: L.divIcon({
        className: "",
        html: '<div class="pin-store"><b>' + (i + 1) + '</b></div>',
        iconSize: [26, 26], iconAnchor: [13, 24]
      })
    }).addTo(map);
    marker.bindPopup("<strong>" + store.name + "</strong><br>" + (store.address || store.chain));
    marker.on("click", function () { highlight(i); });
    pins.push({ store: store, marker: marker });
  }

  // ---------- results ----------
  function showResults() {
    $("results").hidden = false;
    $("results-heading").focus();
  }

  function renderStores(stores, displayText) {
    var list = $("store-list");
    list.replaceChildren();

    $("receipt-date").textContent = new Date().toLocaleDateString("en-CA", { dateStyle: "full" }).toUpperCase();
    $("searched-for").textContent = "Searched: " + displayText;

    if (!stores.length) {
      var li = document.createElement("li");
      li.className = "empty";
      li.textContent = "No tracked stores within " + radius() + " km. Try a bigger radius or a different spot.";
      list.appendChild(li);
      $("total-count").textContent = "0";
      $("total-nearest").textContent = "-";
      return;
    }

    stores.forEach(function (s, i) {
      var li = document.createElement("li");
      li.innerHTML =
        '<span class="store-num">' + (i + 1) + '.</span>' +
        '<span class="store-line"><span class="store-name">' + s.name + '</span>' +
        '<span class="leader"></span><span class="store-km">' + s.km.toFixed(1) + ' km</span></span>' +
        (s.address ? '<span class="store-address">' + s.address + '</span>' : '');
      li.addEventListener("click", function () { highlight(i); });
      list.appendChild(li);
      addStorePin(s, i);
    });

    $("total-count").textContent = String(stores.length);
    $("total-nearest").textContent = stores[0].km.toFixed(1) + " km";
  }

  // ---------- the search ----------
  var busy = false;
  async function runSearch(lat, lon, displayText) {
    if (busy) return;
    busy = true;
    $("search-btn").disabled = true;
    setError("");
    showResults();
    initMap(lat, lon);
    clearStorePins();
    showProgress(true, "Looking for stores…");
    setProgress(30);
    try {
      var stores = await findStores(lat, lon, radius(), function (found, checked, total) {
        setProgress(30 + 60 * (total ? checked / total : 1), "Checking the map…");
      });
      setProgress(100, "Done");
      window.lastSearch = { lat: lat, lon: lon, label: displayText, radius: radius(), mode: searchMode() };
      renderStores(stores, displayText);
      setTimeout(function () { showProgress(false); }, 700);
    } catch (err) {
      showProgress(false);
      setError("Couldn't reach the map service. Check your internet and try again.");
    }
    busy = false;
    $("search-btn").disabled = false;
  }

  async function onSubmit(e) {
    e.preventDefault();
    var input = $("place");
    var value = input.value.trim();
    if (!value) { setError("Type a " + (searchMode() === "postal" ? "postal code" : "address") + " first."); return; }
    if (!/^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/.test(value) && searchMode() === "postal") {
      setError("That doesn't look like a Canadian postal code — try something like V6K 1P2.");
      return;
    }
    setError("");
    showProgress(true, "Finding that location…");
    setProgress(15);
    try {
      var hit = await geocode(value, searchMode() === "postal");
      if (!hit) { showProgress(false); setError("Couldn't find \"" + value + "\". Check the spelling, or switch to Address."); return; }
      await runSearch(hit.lat, hit.lon, hit.label);
    } catch (err) {
      showProgress(false);
      setError("Location lookup failed. Check your internet connection.");
    }
  }

  function onLocate() {
    if (!navigator.geolocation) { setError("Your browser can't share your location."); return; }
    setError("");
    showProgress(true, "Getting your location…");
    navigator.geolocation.getCurrentPosition(async function (pos) {
      var label = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
      await runSearch(pos.coords.latitude, pos.coords.longitude, label);
    }, function () {
      showProgress(false);
      setError("Couldn't get your location. Allow location access, or type a postal code.");
    }, { timeout: 10000 });
  }

  // ---------- wire up ----------
  $("search-form").addEventListener("submit", onSubmit);
  $("locate-btn").addEventListener("click", onLocate);
})();
