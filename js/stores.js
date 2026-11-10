/* Grocery Finder — store search over OpenStreetMap (Overpass API).
   Provides: CHAINS, chainOf(), distanceKm(), fetchWithTimeout(), findStores(). */

var CHAINS = [
  { name: "No Frills",      match: /no\s*frills/i },
  { name: "Superstore",     match: /superstore/i },
  { name: "Sobeys",         match: /\bsobeys\b/i },
  { name: "Walmart",        match: /walmart/i },
  { name: "T&T",            match: /t\s*&\s*t/i },
  { name: "IGA",            match: /\biga\b/i },
  { name: "Independent",    match: /independent/i },
  { name: "Save-On-Foods",  match: /save[-\s]?on[-\s]?foods/i },
  { name: "Safeway",        match: /\bsafeway\b/i }
];

function chainOf(name) {
  if (!name) return null;
  for (var i = 0; i < CHAINS.length; i++) {
    if (CHAINS[i].match.test(name)) return CHAINS[i].name;
  }
  return null;
}

function distanceKm(lat1, lon1, lat2, lon2) {
  var R = 6371, toRad = Math.PI / 180;
  var dLat = (lat2 - lat1) * toRad, dLon = (lon2 - lon1) * toRad;
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) *
          Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function fetchWithTimeout(url, options, ms) {
  options = options || {};
  var controller = new AbortController();
  var timer = setTimeout(function () { controller.abort(); }, ms || 10000);
  options.signal = controller.signal;
  return fetch(url, options).finally(function () { clearTimeout(timer); });
}

// Queries the free Overpass service for supermarkets/groceries near a point,
// keeps only the 9 chains we track, dedupes and sorts nearest-first.
// onProgress(stores, checked, total) lets app.js show a moving progress bar.
var OVERPASS_URLS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter"
];

async function findStores(lat, lon, radiusKm, onProgress) {
  var r = Math.min(radiusKm, 25) * 1000; // Overpass gets slow beyond ~25 km
  var query =
    "[out:json][timeout:25];" +
    "(" +
    "node[\"shop\"~\"^(supermarket|grocery)$\"](around:" + r + "," + lat + "," + lon + ");" +
    "way[\"shop\"~\"^(supermarket|grocery)$\"](around:" + r + "," + lat + "," + lon + ");" +
    ");" +
    "out center tags;";

  var data = null, lastErr = null;
  for (var i = 0; i < OVERPASS_URLS.length && !data; i++) {
    try {
      var res = await fetchWithTimeout(OVERPASS_URLS[i], {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "data=" + encodeURIComponent(query)
      }, 30000);
      if (!res.ok) throw new Error("HTTP " + res.status);
      data = await res.json();
    } catch (e) {
      lastErr = e;
      console.warn("Overpass endpoint failed:", OVERPASS_URLS[i], e);
    }
  }
  if (!data) throw lastErr || new Error("All map services failed");

  var seen = {}, stores = [];
  (data.elements || []).forEach(function (el) {
    var t = el.tags || {};
    var chain = chainOf(t.name || "");
    if (!chain) return;
    var sLat = el.lat != null ? el.lat : (el.center && el.center.lat);
    var sLon = el.lon != null ? el.lon : (el.center && el.center.lon);
    if (sLat == null || sLon == null) return;

    var km = distanceKm(lat, lon, sLat, sLon);
    if (km > radiusKm) return;

    var key = chain + "|" + sLat.toFixed(3) + "|" + sLon.toFixed(3);
    if (seen[key]) return;
    seen[key] = true;

    var addrParts = [t["addr:housenumber"], t["addr:street"], t["addr:city"]]
      .filter(Boolean);

    stores.push({
      name: t.name,
      chain: chain,
      address: addrParts.join(" "),
      lat: sLat, lon: sLon,
      km: km
    });
  });

  stores.sort(function (a, b) { return a.km - b.km; });

  if (onProgress) onProgress(stores, 1, 1);
  return stores;
}
