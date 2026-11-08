/* L-account.js — Grocery Finder account kit (L = Louis / new code)
   Sign-in: Auth0 PKCE, no external library. Works on localhost and a
   real host (redirect back to the exact page URL).
   Features: My Stores, shopping list (prices across retailers, pantry),
   price watches with target prices, trip history + budget streak,
   meal plan week, AI chef (Gemini) incl. "cook something cheap",
   "cook from my pantry" and pantry photo recognition (Gemini vision),
   basket price comparison between retailers, saved recipes,
   device sync code, and cloud sync (Firestore REST, paste config once). */
(function () {
  'use strict';

  // ================= YOUR AUTH0 APP (already set) =================
  var AUTH0_DOMAIN    = 'dev-feoavgdll2d4ur2a.us.auth0.com';
  var AUTH0_CLIENT_ID = 'tXaIv6bVltFZaBbc8FWPf8rqx0Iuwan4';
  // ================================================================

  var GEMINI_MODEL = 'gemini-2.0-flash';
  var PRICES_URL = 'data/superstore-prices.json';
  var LS_PREFIX  = 'gf-account-';
  var PROFILE_KEY = 'gf-profile';
  var AI_KEY_STORE = 'gf-gemini-key';
  var CLOUD_STORE = 'gf-firebase-cfg';
  var RETURN_TO = window.location.origin + window.location.pathname;
  var DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  var user   = null;
  var auth0Error = null;
  var prices = null;
  var data   = emptyData();
  var aiRecipe = null;
  var cloud  = null;   // { apiKey, projectId }
  var pushTimer = null;

  function emptyData() {
    return { area: null, stores: [], list: [], alerts: [], lastPrices: {}, feed: [], recipes: [], trips: [], plan: {}, budget: null, updatedAt: 0 };
  }

  // ---------- tiny helpers ----------
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>\"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(n) { return '$' + Number(n).toFixed(2); }
  function key() { return LS_PREFIX + (user ? user.sub : 'guest'); }
  function loadData() {
    try { data = JSON.parse(localStorage.getItem(key())) || emptyData(); }
    catch (e) { data = emptyData(); }
    var base = emptyData();
    Object.keys(base).forEach(function (k) { if (data[k] == null) data[k] = base[k]; });
    if (!data.updatedAt) data.updatedAt = 0;
    data.alerts = (data.alerts || []).map(function (a) {
      return {
        category: a.category || String(a.id || '').split(':')[0],
        target: (typeof a.target === 'number') ? a.target : null,
        targetHit: !!a.targetHit,
        createdAt: a.createdAt || new Date().toISOString()
      };
    }).filter(function (a, i, all) {
      return a.category && !all.slice(0, i).some(function (b) { return b.category === a.category; });
    });
    data.list = (data.list || []).map(function (i) {
      return { name: i.name, checked: !!i.checked, pantry: !!i.pantry, matches: i.matches || matchProducts(i.name).slice(0, 3) };
    });
    data.recipes = (data.recipes || []).map(function (r) {
      return { name: r.name, items: r.items || [], steps: r.steps || [] };
    });
    data.trips = (data.trips || []).filter(function (t) { return t && t.date && typeof t.total === 'number'; });
    if (!data.plan) data.plan = {};
  }
  function saveData(skipCloud) {
    data.updatedAt = Date.now();
    try { localStorage.setItem(key(), JSON.stringify(data)); } catch (e) {}
    if (!skipCloud) scheduleCloudPush();
  }
  function renderAll() {
    renderStores(); renderList(); renderWeek(); renderAlerts(); renderFeed(); renderBadge(); renderRecipes();
    $('budget-input').value = data.budget == null ? '' : data.budget;
    checkAlerts();
  }

  // ---------- sign-in: Auth0 PKCE, no library ----------
  function onFileProtocol() {
    return window.location.protocol === 'file:';
  }
  function b64url(bytes) {
    var s = ''; new Uint8Array(bytes).forEach(function (b) { s += String.fromCharCode(b); });
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  async function pkceChallenge(verifier) {
    var hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    return b64url(hash);
  }

  function savedProfile() {
    try { return JSON.parse(localStorage.getItem(PROFILE_KEY)); } catch (e) { return null; }
  }

  async function signIn(tryWithoutGoogle) {
    if (onFileProtocol()) {
      alert('Sign-in needs the site served over http(s).\n\n' +
        'You opened this file by double-clicking (the address starts with File:///).\n' +
        'Either:\n' +
        ' - open the folder, type cmd in the address bar, run:\n' +
        '     python -m http.server 8000\n' +
        '   then visit http://localhost:8000\n' +
        ' - or open the hosted version of the site.');
      return;
    }
    try {
      var verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
      sessionStorage.setItem('gf-pkce-verifier', verifier);
      var url = 'https://' + AUTH0_DOMAIN + '/authorize' +
        '?response_type=code' +
        '&client_id=' + encodeURIComponent(AUTH0_CLIENT_ID) +
        '&redirect_uri=' + encodeURIComponent(RETURN_TO) +
        '&scope=' + encodeURIComponent('openid profile email') +
        '&code_challenge=' + await pkceChallenge(verifier) +
        '&code_challenge_method=S256' +
        '&screen_hint=signup';
      if (!tryWithoutGoogle) url += '&connection=google-oauth2';
      window.location.assign(url);
    } catch (e) {
      alert('Sign-in could not start: ' + (e && e.message ? e.message : e));
    }
  }

  async function finishSignIn() {
    var params = new URLSearchParams(window.location.search);
    if (!params.has('code')) return false;
    var verifier = sessionStorage.getItem('gf-pkce-verifier');
    try {
      var res = await fetch('https://' + AUTH0_DOMAIN + '/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          client_id: AUTH0_CLIENT_ID,
          code: params.get('code'),
          redirect_uri: RETURN_TO,
          code_verifier: verifier
        })
      });
      var tok = await res.json();
      if (!tok.id_token) throw new Error(tok.error_description || tok.error || 'token exchange failed');
      var payload = JSON.parse(atob(tok.id_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      user = { sub: payload.sub, name: payload.name || payload.nickname || 'friend', email: payload.email };
      try { localStorage.setItem(PROFILE_KEY, JSON.stringify(user)); } catch (e) {}
    } catch (e) {
      auth0Error = (e && e.message) ? e.message : String(e);
      console.warn('finishSignIn failed:', e);
    }
    sessionStorage.removeItem('gf-pkce-verifier');
    window.history.replaceState({}, '', RETURN_TO);
    return true;
  }

  function signOut() {
    try { localStorage.removeItem(PROFILE_KEY); } catch (e) {}
    user = null;
    window.location.assign('https://' + AUTH0_DOMAIN + '/v2/logout' +
      '?client_id=' + encodeURIComponent(AUTH0_CLIENT_ID) +
      '&returnTo=' + encodeURIComponent(RETURN_TO));
  }

  function renderUser() {
    var inBox = $('user-when-in'), outBox = $('user-when-out'), note = $('signin-note');
    if (user) {
      inBox.hidden = false; outBox.hidden = true;
      $('user-chip').innerHTML = '👋 <strong>' + esc(user.name || user.email) + '</strong>' +
        (user.email ? '<br><span class="dim">' + esc(user.email) + '</span>' : '');
      $('account-open-btn').textContent = 'Account';
    } else {
      inBox.hidden = true; outBox.hidden = false;
      $('account-open-btn').textContent = 'Sign in';
      if (note && onFileProtocol()) {
        note.innerHTML = '<strong>Sign-in needs the server or the hosted site.</strong> Locally: open the folder, type <strong>cmd</strong> in the address bar, run <strong>python -m http.server 8000</strong>, and visit http://localhost:8000.';
      } else if (note && auth0Error) {
        note.innerHTML = '<strong>Sign-in had a problem:</strong> ' + esc(auth0Error);
      }
    }
  }

  // ---------- drawer ----------
  var drawer = null;
  function openDrawer() {
    drawer.hidden = false;
    requestAnimationFrame(function () { drawer.classList.add('open'); });
    cloudPull(true);   // grab any newer data from the cloud while it opens
  }
  function closeDrawer() { drawer.classList.remove('open'); setTimeout(function () { drawer.hidden = true; }, 220); }

  function wireDrawer() {
    drawer = $('account-drawer');
    $('account-open-btn').addEventListener('click', openDrawer);
    $('drawer-close-btn').addEventListener('click', closeDrawer);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDrawer(); });

    var tabs = document.querySelectorAll('.drawer-tab');
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        tabs.forEach(function (t) { t.classList.remove('active'); });
        tab.classList.add('active');
        document.querySelectorAll('.drawer-panel').forEach(function (p) { p.classList.remove('active'); });
        $('panel-' + tab.getAttribute('data-tab')).classList.add('active');
      });
    });

    $('auth-signin-btn').addEventListener('click', function () { signIn(false); });
    $('auth-signout-btn').addEventListener('click', signOut);
  }

  function switchTab(name) {
    var tab = document.querySelector('.drawer-tab[data-tab="' + name + '"]');
    if (tab) tab.click();
  }

  // ---------- cloud sync (Firestore REST, no SDK) ----------
  function cloudStatus(msg) {
    var el = $('cloud-status');
    if (el) el.textContent = msg;
  }

  function parseFirebaseConfig(text) {
    if (!text) return null;
    var apiKey = (text.match(/apiKey\"?\s*[:=]\s*\"([^\"]+)\"/) || [])[1];
    var projectId = (text.match(/projectId\"?\s*[:=]\s*\"([^\"]+)\"/) || [])[1];
    if (!apiKey || !projectId) return null;
    return { apiKey: apiKey, projectId: projectId };
  }

  function cloudConfig() {
    if (cloud) return cloud;
    try { cloud = JSON.parse(localStorage.getItem(CLOUD_STORE)); } catch (e) { cloud = null; }
    return (cloud && cloud.apiKey && cloud.projectId) ? cloud : null;
  }

  function docUrl() {
    if (!user || !cloudConfig()) return null;
    return 'https://firestore.googleapis.com/v1/projects/' + cloud.projectId +
      '/databases/(default)/documents/gfUsers/' + encodeURIComponent(user.sub);
  }

  function scheduleCloudPush() {
    if (!user || !cloudConfig()) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(cloudPush, 1500);   // debounce rapid edits
  }

  async function cloudPush() {
    var url = docUrl();
    if (!url) return;
    try {
      var res = await fetch(url + '?key=' + encodeURIComponent(cloud.apiKey) + '&currentDocument.exists=true', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            blob:      { stringValue: JSON.stringify(data) },
            updatedAt: { doubleValue: data.updatedAt },
            email:     { stringValue: user.email || '' }
          }
        })
      });
      if (!res.ok) {
        var err = await res.json().catch(function () { return {}; });
        cloudStatus('Cloud sync: problem saving — ' + ((err.error && err.error.message) || res.status).slice(0, 60));
        console.warn('cloudPush failed', err);
        return;
      }
      cloudStatus('Cloud sync: on ✓ saved ' + new Date().toLocaleTimeString());
    } catch (e) {
      cloudStatus('Cloud sync: offline — will retry on next change');
    }
  }

  async function cloudPull(quiet) {
    var url = docUrl();
    if (!url) return;
    try {
      var res = await fetch(url + '?key=' + encodeURIComponent(cloud.apiKey));
      if (res.status === 404) { if (!quiet) cloudPush(); return; }   // nothing in the cloud yet
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var doc = await res.json();
      var remoteTs = (doc.fields && doc.fields.updatedAt && Number(doc.fields.updatedAt.doubleValue)) || 0;
      var blob = doc.fields && doc.fields.blob && doc.fields.blob.stringValue;
      if (!blob) return;
      if (remoteTs <= (data.updatedAt || 0)) return;   // local is newer or equal
      var remote = JSON.parse(blob);
      var base = emptyData();
      Object.keys(base).forEach(function (k) { if (remote[k] == null) remote[k] = base[k]; });
      remote.updatedAt = remoteTs;
      data = remote;
      try { localStorage.setItem(key(), JSON.stringify(data)); } catch (e) {}
      renderAll();
      cloudStatus('Cloud sync: on ✓ loaded ' + new Date(remoteTs).toLocaleTimeString());
    } catch (e) {
      if (!quiet) cloudStatus('Cloud sync: problem loading — ' + (e && e.message ? e.message : e));
      console.warn('cloudPull failed', e);
    }
  }

  function connectCloud() {
    var cfg = parseFirebaseConfig($('cloud-input').value);
    if (!cfg) {
      cloudStatus('That didn\'t look like a Firebase config — it needs apiKey and projectId');
      return;
    }
    cloud = cfg;
    try { localStorage.setItem(CLOUD_STORE, JSON.stringify(cfg)); } catch (e) {}
    $('cloud-input').hidden = true;
    $('cloud-connect-btn').hidden = true;
    cloudStatus('Cloud sync: connecting…');
    cloudPush();
  }

  function renderCloudUi() {
    var input = $('cloud-input'), btn = $('cloud-connect-btn');
    if (cloudConfig()) {
      input.hidden = true; btn.hidden = true;
      cloudStatus(user ? 'Cloud sync: on ✓' : 'Cloud sync: on — sign in to start syncing');
    } else {
      input.hidden = false; btn.hidden = false;
      cloudStatus('Cloud sync: not set up — your data lives only in this browser. Paste a Firebase config below to sync across devices.');
    }
  }

  // ---------- sample data (for testing) ----------
  function loadDemo() {
    var btn = $('demo-data-btn');
    var added = [];

    var demoStores = [
      { name: 'Real Canadian Superstore', address: '350 SE Marine Dr, Vancouver', lat: 49.2736, lon: -123.0945, km: 1.2 },
      { name: 'No Frills', address: '2545 Quebec St, Vancouver', lat: 49.2632, lon: -123.1004, km: 2.1 },
      { name: 'T&T Supermarket', address: '2800 E 1st Ave, Vancouver', lat: 49.2717, lon: -123.0682, km: 3.0 }
    ];
    demoStores.forEach(function (s) {
      var dup = data.stores.some(function (m) { return m.name === s.name; });
      if (!dup) { data.stores.push(s); added.push(s.name); }
    });
    if (!data.area) {
      data.area = { label: 'V6K 1P2', lat: 49.2639, lon: -123.0670, input: 'V6K 1P2', mode: 'postal' };
    }

    ['butter', 'eggs', 'rice', 'milk', 'flour'].forEach(function (n) {
      if (!data.list.some(function (i) { return i.name === n; })) {
        data.list.push({ name: n, checked: false, pantry: false, matches: matchProducts(n).slice(0, 3) });
        added.push(n);
      }
    });
    // mark a couple as pantry so "Cook from my pantry" demos right away
    data.list.forEach(function (i) {
      if (i.name === 'butter' || i.name === 'flour') i.pantry = true;
    });

    if (!data.recipes.some(function (r) { return r.name === 'Pancakes (sample)'; })) {
      data.recipes.push({
        name: 'Pancakes (sample)',
        items: ['flour', 'milk', 'eggs', 'butter'],
        steps: [
          'Whisk 1 cup flour, 1 tbsp sugar and a pinch of salt.',
          'Add 1 cup milk and 2 eggs; whisk until smooth.',
          'Melt 2 tbsp butter in a pan over medium heat.',
          'Pour batter in circles; flip when bubbles form, about 2 min per side.',
          'Stack, add maple syrup, eat.'
        ]
      });
      added.push('Pancakes (sample)');
    }

    if (!data.alerts.some(function (a) { return a.category === 'eggs'; })) {
      data.alerts.push({ category: 'eggs', target: 0.30, targetHit: false, createdAt: new Date().toISOString() });
      added.push('eggs watch (target $0.30/egg)');
    }

    if (!data.trips.length) {
      data.trips.push({ date: new Date(Date.now() - 3 * 864e5).toISOString(), total: 42.5, items: 9 });
      added.push('sample trip');
    }
    if (!data.plan || !data.plan.Mon) {
      data.plan = data.plan || {};
      data.plan.Mon = 'Pancakes (sample)';
      added.push('meal plan');
    }

    if (!data.budget) data.budget = 60;

    saveData();
    renderAll();
    switchTab('stores');

    btn.textContent = added.length
      ? 'Added ' + added.length + ' things ✓ (check the tabs)'
      : 'Sample data already loaded ✓';
    setTimeout(function () { btn.textContent = 'Load sample data'; }, 2500);
  }

  // ---------- My Stores ----------
  function saveCurrentStores() {
    var pins = (window.storePins || []).filter(function (p) { return p && p.store; });
    if (!pins.length) { $('save-stores-btn').textContent = 'Search for stores first'; return; }

    var added = 0;
    pins.forEach(function (p) {
      var s = p.store;
      var dup = data.stores.some(function (m) {
        return m.name === s.name && m.address === (s.address || '');
      });
      if (!dup) {
        data.stores.push({
          name: s.name, address: s.address || '',
          lat: s.lat, lon: s.lon, km: s.km,
          savedAt: new Date().toISOString()
        });
        added++;
      }
    });

    if (window.lastSearch) {
      data.area = {
        label: window.lastSearch.label,
        lat: window.lastSearch.lat, lon: window.lastSearch.lon,
        input: $('place').value,
        mode: (typeof window.searchMode === 'function') ? window.searchMode() : 'postal'
      };
    }
    saveData();
    renderStores();
    $('save-stores-btn').textContent = added
      ? 'Saved ' + added + ' store' + (added === 1 ? '' : 's') + ' ✓'
      : 'Already saved ✓';
  }

  function removeStore(i) { data.stores.splice(i, 1); saveData(); renderStores(); }

  function renderStores() {
    var ul = $('my-stores-list');
    ul.replaceChildren();

    var areaBtn = $('search-my-area-btn');
    if (data.area && data.area.input) {
      areaBtn.hidden = false;
      areaBtn.textContent = 'Search my area again — ' + data.area.label;
    }

    if (!data.stores.length) {
      var li = document.createElement('li');
      li.className = 'empty';
      li.textContent = 'No saved stores yet. Search, then press "Save these search results".';
      ul.appendChild(li);
      return;
    }

    data.stores.slice().sort(function (a, b) { return a.km - b.km; }).forEach(function (s) {
      var li = document.createElement('li');
      li.className = 'store-row';
      li.innerHTML =
        '<span class="store-main"><strong>' + esc(s.name) + '</strong>' +
        '<span class="dim">' + esc(s.address || '') + ' · ' + Number(s.km).toFixed(1) + ' km</span></span>' +
        '<span class="store-actions">' +
        '<a href="https://www.google.com/maps/search/?api=1&query=' + s.lat + ',' + s.lon + '" target="_blank" rel="noopener noreferrer">Directions</a>' +
        '<button type="button" class="tiny-danger" aria-label="Remove">✕</button></span>';
      li.querySelector('.tiny-danger').addEventListener('click', function () {
        removeStore(data.stores.indexOf(s));
      });
      ul.appendChild(li);
    });
  }

  function searchMyArea() {
    closeDrawer();
    var form = $('search-form'), input = $('place');
    if (!form || !input || !data.area) return;
    var isAddress = data.area.mode === 'address';
    var modeRadios = document.querySelectorAll('input[name="mode"]');
    modeRadios.forEach(function (r) {
      r.checked = isAddress ? (r.value === 'address') : (r.value === 'postal');
    });
    modeRadios[0].dispatchEvent(new Event('change'));
    input.value = data.area.input;
    form.dispatchEvent(new Event('submit', { cancelable: true }));
  }

  // ---------- prices (multi-retailer) ----------
  function loadPrices() {
    return fetch(PRICES_URL)
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; })
      .then(function (p) {
        if (!p && typeof SUPERSTORE_PRICES !== 'undefined') p = SUPERSTORE_PRICES;
        return p;
      });
  }

  function retailers() {
    if (!prices || !prices.retailers) return [];
    return Object.keys(prices.retailers);
  }

  function retailerName(key) {
    var r = (prices && prices.retailers && prices.retailers[key]) || {};
    return r.name || key;
  }

  function productsIn(retailerKey, category) {
    var r = (prices && prices.retailers && prices.retailers[retailerKey]) || {};
    return (r.categories && r.categories[category]) || [];
  }

  // alerts + "cook cheap" are anchored to the primary retailer (superstore)
  function primaryCategories() {
    return Object.keys(productsIn('superstore', null) && (prices.retailers.superstore.categories || {}));
  }

  function cheapestIn(category) {
    var prods = productsIn('superstore', category);
    if (!prods.length) return null;
    return prods.reduce(function (a, b) { return (b.unitPriceCad < a.unitPriceCad) ? b : a; });
  }

  function cheapestCategories(n) {
    return primaryCategories()
      .map(function (c) { var b = cheapestIn(c); return b ? { category: c, best: b } : null; })
      .filter(Boolean)
      .sort(function (a, b) { return a.best.unitPriceCad - b.best.unitPriceCad; })
      .slice(0, n || 3);
  }

  function unitLabel(basis) {
    return basis === 'per 100 g' ? '/100g' : '/egg';
  }

  function currentBasis(category) {
    var best = cheapestIn(category);
    return best ? best.unitPriceBasis : 'per 100 g';
  }

  // match a list item against every retailer; each match is tagged with its retailer
  function matchProducts(itemName) {
    var words = itemName.toLowerCase().split(/[^a-z]+/).filter(function (w) { return w.length >= 4; });
    if (!words.length) return [];
    var out = [];
    retailers().forEach(function (rk) {
      var cats = (prices.retailers[rk].categories) || {};
      Object.keys(cats).forEach(function (cat) {
        cats[cat].forEach(function (p) {
          var name = (p.name || '').toLowerCase();
          var hits = words.filter(function (w) { return name.indexOf(w) > -1; }).length;
          if (hits) out.push({ product: p, category: cat, retailer: rk, hits: hits });
        });
      });
    });
    out.sort(function (a, b) { return b.hits - a.hits || a.product.unitPriceCad - b.product.unitPriceCad; });
    return out;
  }

  // ---------- shopping list ----------
  function addItem(name) {
    var input = $('list-input');
    var n = (name || input.value).trim().toLowerCase();
    if (!n) return;
    if (data.list.some(function (i) { return i.name === n; })) return false;
    data.list.push({ name: n, checked: false, pantry: false, matches: matchProducts(n).slice(0, 3) });
    if (!name) input.value = '';
    saveData();
    renderList();
    return true;
  }

  function addPantryItem(name) {
    var n = (name || '').trim().toLowerCase();
    if (!n) return;
    var existing = data.list.find(function (i) { return i.name === n; });
    if (existing) { existing.pantry = true; }
    else {
      data.list.push({ name: n, checked: false, pantry: true, matches: matchProducts(n).slice(0, 3) });
    }
    saveData();
    renderList();
  }

  function togglePantry(item) {
    item.pantry = !item.pantry;
    saveData(); renderList();
  }

  function pantryItems() {
    return data.list.filter(function (i) { return i.pantry && !i.checked; });
  }

  function renderList() {
    var ul = $('shopping-list');
    ul.replaceChildren();
    var total = 0, priced = 0;
    var byRetailer = {};
    var multiRetailer = retailers().length > 1;

    data.list.forEach(function (item) {
      var li = document.createElement('li');
      li.className = 'store-row' + (item.checked ? ' done' : '') + (item.pantry ? ' pantry' : '');

      var best = item.matches && item.matches.length ? item.matches[0] : null;
      var priceHtml = '';
      if (best) {
        var p = best.product;
        priceHtml = '<span class="price">' + money(p.priceCad) +
          ' <span class="dim">(' + money(p.unitPriceCad) + unitLabel(p.unitPriceBasis) +
          (multiRetailer ? ' · ' + esc(retailerName(best.retailer)) : '') + ')</span></span>';
        if (!item.checked && !item.pantry) {
          total += p.priceCad; priced++;
          if (byRetailer[best.retailer] == null) byRetailer[best.retailer] = 0;
          byRetailer[best.retailer] += p.priceCad;
        }
      } else {
        priceHtml = '<span class="dim">not in price file</span>';
      }

      li.innerHTML =
        '<label class="store-main check"><input type="checkbox"' + (item.checked ? ' checked' : '') + '> ' +
        '<span><strong>' + esc(item.name) + '</strong>' + priceHtml +
        (best ? '<span class="dim">' + esc(best.product.name) + '</span>' : '') + '</span></label>' +
        '<span class="store-actions">' +
        '<button type="button" class="tiny-btn pantry-btn' + (item.pantry ? ' on' : '') + '" title="I have this at home">🧺</button>' +
        '<button type="button" class="tiny-danger" aria-label="Remove">✕</button></span>';

      li.querySelector('input[type=checkbox]').addEventListener('change', function (e) {
        item.checked = e.target.checked; saveData(); renderList();
      });
      li.querySelector('.pantry-btn').addEventListener('click', function () { togglePantry(item); });
      li.querySelector('.tiny-danger').addEventListener('click', function () {
        data.list.splice(data.list.indexOf(item), 1); saveData(); renderList();
      });
      ul.appendChild(li);
    });

    if (!data.list.length) {
      var li = document.createElement('li');
      li.className = 'empty';
      li.textContent = 'Empty list. Type an ingredient — try butter, eggs or rice.';
      ul.appendChild(li);
      $('list-total').textContent = '';
      renderBudgetLine(0);
      renderBasketCompare({});
      return;
    }
    $('list-total').textContent = priced
      ? 'To buy: about ' + money(total) + ' at the cheapest store per item (' + priced + ' item' + (priced === 1 ? '' : 's') + ' priced)'
      : 'Add items to price them';
    renderBudgetLine(total);
    renderBasketCompare(byRetailer, priced);
  }

  // basket totals per retailer: what the whole (to-buy) basket costs if you
  // buy every matched item at that one store
  function renderBasketCompare(byRetailer, pricedCount) {
    var el = $('basket-compare');
    if (!el) return;
    var keys = Object.keys(byRetailer || {}).filter(function (k) { return byRetailer[k] > 0; });
    if (keys.length < 2 || !pricedCount) { el.hidden = true; return; }

    var cheapestKey = keys.reduce(function (a, b) { return byRetailer[b] < byRetailer[a] ? b : a; });
    var mostKey = keys.reduce(function (a, b) { return byRetailer[b] > byRetailer[a] ? b : a; });
    var save = byRetailer[mostKey] - byRetailer[cheapestKey];

    var parts = keys.map(function (k) {
      return retailerName(k) + ' ' + money(byRetailer[k]) + (k === cheapestKey ? ' ←' : '');
    });
    var text = 'Whole basket: ' + parts.join(' · ');
    if (save > 0.005) text += ' — buy it all at ' + retailerName(cheapestKey) + ' and save ' + money(save);
    el.hidden = false;
    el.className = 'drawer-total compare';
    el.textContent = text;
  }

  function finishTrip() {
    var done = data.list.filter(function (i) { return i.checked && !i.pantry; });
    if (!done.length) {
      $('finish-trip-btn').textContent = 'Check items off first';
      setTimeout(function () { $('finish-trip-btn').textContent = '✅ Finish trip — archive the checked items'; }, 2000);
      return;
    }
    var total = done.reduce(function (sum, i) {
      var best = i.matches && i.matches[0];
      return sum + (best ? best.product.priceCad : 0);
    }, 0);
    data.trips.unshift({ date: new Date().toISOString(), total: Math.round(total * 100) / 100, items: done.length });
    data.list = data.list.filter(function (i) { return !(i.checked && !i.pantry); });
    saveData();
    renderList(); renderWeek();
    $('finish-trip-btn').textContent = 'Trip saved: ' + money(total) + ' ✓ (see Week tab)';
    setTimeout(function () { $('finish-trip-btn').textContent = '✅ Finish trip — archive the checked items'; }, 2600);
    switchTab('week');
  }

  // ---------- weekly budget ----------
  function renderBudgetLine(total) {
    var el = $('budget-line');
    if (!data.budget) { el.hidden = true; return; }
    var left = data.budget - total;
    el.hidden = false;
    el.className = 'drawer-total' + (left < 0 ? ' over' : '');
    el.textContent = left >= 0
      ? 'Weekly budget ' + money(data.budget) + ' — ' + money(left) + ' left'
      : 'Weekly budget ' + money(data.budget) + ' — ' + money(-left) + ' OVER';
  }

  function setBudget() {
    var v = $('budget-input').value;
    data.budget = (v === '' || Number(v) <= 0) ? null : Number(v);
    saveData();
    renderList(); renderWeek();
    $('budget-input').value = data.budget == null ? '' : data.budget;
  }

  // ---------- Week tab: stats, streak, meal plan, trip history ----------
  function budgetStreak() {
    if (!data.budget) return null;
    var sorted = data.trips.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    var streak = 0;
    for (var i = 0; i < sorted.length; i++) {
      if (sorted[i].total <= data.budget) streak++;
      else break;
    }
    return streak;
  }

  function renderWeek() {
    var el = $('week-stats');
    var monthAgo = Date.now() - 30 * 864e5;
    var spent30 = data.trips.filter(function (t) { return new Date(t.date).getTime() >= monthAgo; })
      .reduce(function (s, t) { return s + t.total; }, 0);
    var streak = budgetStreak();
    var parts = [];
    parts.push('Trips: ' + data.trips.length);
    parts.push('Spent last 30 days: ' + money(spent30));
    if (data.budget) parts.push('Budget: ' + money(data.budget) + '/wk');
    el.textContent = parts.join(' · ');
    el.className = 'drawer-note' + (streak != null && streak >= 2 ? ' streak' : '');
    if (streak != null) {
      el.textContent += streak >= 2
        ? '  🔥 ' + streak + ' trips under budget in a row!'
        : '  Streak: ' + streak + ' — keep trips under ' + money(data.budget) + ' to build it';
    }

    var box = $('plan-list');
    box.replaceChildren();
    var recipeNames = data.recipes.map(function (r) { return r.name; });
    DAYS.forEach(function (day) {
      var row = document.createElement('div');
      row.className = 'plan-row';
      var sel = document.createElement('select');
      sel.setAttribute('aria-label', 'Recipe for ' + day);
      var none = document.createElement('option');
      none.value = ''; none.textContent = day + ' —';
      sel.appendChild(none);
      recipeNames.forEach(function (n) {
        var o = document.createElement('option');
        o.value = n; o.textContent = day + ' · ' + n;
        sel.appendChild(o);
      });
      sel.value = data.plan[day] || '';
      sel.addEventListener('change', function () {
        if (sel.value) data.plan[day] = sel.value;
        else delete data.plan[day];
        saveData();
      });
      row.appendChild(sel);
      box.appendChild(row);
    });

    var ul = $('trips-list');
    ul.replaceChildren();
    if (!data.trips.length) {
      var li = document.createElement('li');
      li.className = 'empty';
      li.textContent = 'No trips yet. Check items off in the List tab, then Finish trip.';
      ul.appendChild(li);
      return;
    }
    data.trips.slice(0, 5).forEach(function (t) {
      var li = document.createElement('li');
      li.className = 'store-row';
      li.innerHTML =
        '<span class="store-main"><strong>' + money(t.total) + '</strong>' +
        '<span class="dim">' + new Date(t.date).toLocaleDateString('en-CA', { dateStyle: 'medium' }) + ' · ' + t.items + ' items</span></span>';
      ul.appendChild(li);
    });
  }

  function addWeekToList() {
    var planned = DAYS.map(function (d) { return data.plan[d]; }).filter(Boolean);
    if (!planned.length) {
      $('add-week-btn').textContent = 'Pick recipes for at least one day';
      setTimeout(function () { $('add-week-btn').textContent = 'Add whole week to list'; }, 2000);
      return;
    }
    planned.forEach(function (name) {
      var r = data.recipes.find(function (x) { return x.name === name; });
      if (!r) return;
      r.items.forEach(function (raw) {
        var core = raw.replace(/^\s*[\d½¼¾\/\.]+\s*\w*\s*/, '').trim();
        addItem(core || raw);
      });
    });
    saveData(); renderList();
    $('add-week-btn').textContent = 'Week added ✓';
    setTimeout(function () { $('add-week-btn').textContent = 'Add whole week to list'; }, 2000);
    switchTab('list');
  }

  // ---------- AI chef (Gemini) ----------
  function getAiKey() {
    var v = $('ai-key').value.trim();
    if (v) {
      try { localStorage.setItem(AI_KEY_STORE, v); } catch (e) {}
      return v;
    }
    try { return localStorage.getItem(AI_KEY_STORE) || ''; } catch (e) { return ''; }
  }

  function aiFlash(btnId, msg, resetText) {
    var btn = $(btnId);
    btn.textContent = msg;
    setTimeout(function () { btn.textContent = resetText; }, 2600);
  }

  async function geminiCall(parts) {
    var apiKey = getAiKey();
    if (!apiKey) throw new Error('no-key');
    var res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL + ':generateContent?key=' + encodeURIComponent(apiKey), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: parts }] })
    });
    if (!res.ok) {
      var err = await res.json().catch(function () { return {}; });
      throw new Error((err.error && err.error.message) || ('Gemini error ' + res.status));
    }
    var j = await res.json();
    return (j.candidates && j.candidates[0] && j.candidates[0].content.parts || [])
      .map(function (p) { return p.text || ''; }).join('');
  }

  async function aiRun(desc, busyBtnId, resetText) {
    var apiKey = getAiKey();
    if (!apiKey) { aiFlash(busyBtnId, 'Paste your Gemini API key first', resetText); return; }
    if (!desc) { aiFlash(busyBtnId, 'Describe what you want to eat', resetText); return; }

    var btn = $(busyBtnId);
    btn.disabled = true; btn.textContent = 'Cooking…';
    try {
      var prompt =
        'You are a recipe generator for a grocery app. The user will describe what they want to cook. ' +
        'Keep it simple home cooking with common grocery ingredients. ' +
        'Reply with ONLY compact JSON, no markdown, in this exact shape: ' +
        '{"name":"short recipe name","ingredients":["each ingredient with amount, e.g. 2 cups flour"],"steps":["numbered cooking steps"]}. ' +
        'User request: ' + desc;
      var text = await geminiCall([{ text: prompt }]);
      var json = JSON.parse(text.replace(/^```(json)?/i, '').replace(/```$/, '').trim());
      aiRecipe = {
        name: String(json.name || desc).trim(),
        items: (json.ingredients || []).map(function (s) { return String(s).toLowerCase().trim(); }).filter(Boolean),
        steps: (json.steps || []).map(function (s) { return String(s).trim(); }).filter(Boolean)
      };
      renderAiResult();
    } catch (e) {
      aiFlash(busyBtnId, 'Failed — ' + (e && e.message ? e.message.slice(0, 50) : 'try again'), resetText);
      console.warn('AI generate failed:', e);
      return;
    }
    btn.disabled = false; btn.textContent = resetText;
  }

  async function aiGenerate() {
    await aiRun($('ai-desc').value.trim(), 'ai-generate-btn', 'Make the recipe');
  }

  async function aiCheap() {
    if (!prices) { aiFlash('ai-cheap-btn', 'Prices not loaded yet', 'Cook something cheap ✨'); return; }
    var cheap = cheapestCategories(3);
    if (!cheap.length) { aiFlash('ai-cheap-btn', 'No price data to cook with', 'Cook something cheap ✨'); return; }
    var names = cheap.map(function (c) { return c.category; }).join(', ');
    var desc = 'A simple, cheap, filling dinner recipe using mainly: ' + names +
      ' (these are the cheapest groceries this week). Total ingredient cost should stay under $10.';
    $('ai-desc').value = desc;
    await aiRun(desc, 'ai-cheap-btn', 'Cook something cheap ✨');
  }

  async function aiPantry() {
    var items = pantryItems().map(function (i) { return i.name; });
    if (!items.length) {
      aiFlash('pantry-cook-btn', '🧺 items first — tap the basket on list items, or use the photo button', 'Cook from my 🧺 pantry');
      return;
    }
    var desc = 'A simple, tasty recipe using mainly what I already have at home: ' + items.join(', ') +
      '. Minimise any extra ingredients I would need to buy; keep the recipe to 6 extras at most.';
    $('ai-desc').value = desc;
    await aiRun(desc, 'pantry-cook-btn', 'Cook from my 🧺 pantry');
  }

  // Gemini vision: identify ingredients from a fridge / pantry photo
  async function aiFromPhoto() {
    var input = $('pantry-photo-input');
    var file = input.files && input.files[0];
    if (!file) return;
    var btn = $('pantry-photo-btn');
    var resetText = '📸 Photo my fridge or pantry — AI finds the ingredients';

    if (!getAiKey()) { aiFlash('pantry-photo-btn', 'Paste your Gemini API key first', resetText); input.value = ''; return; }

    btn.disabled = true; btn.textContent = 'Looking at your photo…';
    try {
      var dataUrl = await new Promise(function (resolve, reject) {
        var fr = new FileReader();
        fr.onload = function () { resolve(fr.result); };
        fr.onerror = reject;
        fr.readAsDataURL(file);
      });
      var b64 = dataUrl.split(',')[1];
      var mime = file.type || 'image/jpeg';
      var text = await geminiCall([
        { text: 'This is a photo of a fridge, freezer or pantry. Identify the food ingredients you can see. ' +
          'Reply with ONLY a compact JSON array of simple lowercase ingredient names, no markdown, ' +
          'e.g. ["eggs","milk","spinach","cheddar cheese"]. Maximum 15 items. Only real food ingredients.' },
        { inlineData: { mimeType: mime, data: b64 } }
      ]);
      var found = JSON.parse(text.replace(/^```(json)?/i, '').replace(/```$/, '').trim());
      if (!Array.isArray(found) || !found.length) throw new Error('no ingredients found');
      found.slice(0, 15).forEach(addPantryItem);
      btn.textContent = 'Found ' + found.length + ': ' + found.slice(0, 5).join(', ') +
        (found.length > 5 ? '…' : '') + ' — added to 🧺';
      switchTab('list');
    } catch (e) {
      var msg = (e && e.message) ? e.message : 'try again';
      btn.textContent = 'Failed — ' + (msg === 'no-key' ? 'no API key' : msg.slice(0, 50));
      console.warn('pantry photo failed:', e);
    }
    input.value = '';
    setTimeout(function () { btn.textContent = resetText; btn.disabled = false; }, 4000);
  }

  function renderAiResult() {
    var box = $('ai-result');
    if (!aiRecipe) { box.hidden = true; return; }
    box.hidden = false;
    $('ai-name').textContent = aiRecipe.name;

    var ul = $('ai-ingredients');
    ul.replaceChildren();
    aiRecipe.items.forEach(function (ing) {
      var li = document.createElement('li');
      li.className = 'ai-ing';
      li.textContent = ing;
      ul.appendChild(li);
    });

    var ol = $('ai-steps');
    ol.replaceChildren();
    aiRecipe.steps.forEach(function (st) {
      var li = document.createElement('li');
      li.textContent = st;
      ol.appendChild(li);
    });
  }

  function aiAddToList() {
    if (!aiRecipe) return;
    aiRecipe.items.forEach(function (raw) {
      var core = raw.replace(/^\s*[\d½¼¾\/\.]+\s*\w*\s*/, '').trim();
      addItem(core || raw);
    });
    switchTab('list');
  }

  function aiSave() {
    if (!aiRecipe) return;
    if (data.recipes.some(function (r) { return r.name === aiRecipe.name; })) { flashRecipe('Already saved ✓'); return; }
    data.recipes.push({ name: aiRecipe.name, items: aiRecipe.items, steps: aiRecipe.steps });
    saveData(); renderRecipes(); renderWeek();
    flashRecipe('Saved ✓');
  }

  // ---------- saved recipes ----------
  function addRecipe() {
    var name = $('recipe-name').value.trim();
    var raw = $('recipe-ingredients').value.trim();
    if (!name || !raw) { flashRecipe('Name and ingredients, please'); return; }
    var items = raw.split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);
    if (!items.length) { flashRecipe('Add at least one ingredient'); return; }
    if (data.recipes.some(function (r) { return r.name === name; })) { flashRecipe('Recipe already saved'); return; }
    data.recipes.push({ name: name, items: items, steps: [] });
    $('recipe-name').value = ''; $('recipe-ingredients').value = '';
    saveData(); renderRecipes(); renderWeek();
    flashRecipe('Saved "' + name + '" ✓');
  }

  function flashRecipe(msg) {
    var btn = $('add-recipe-btn');
    btn.textContent = msg;
    setTimeout(function () { btn.textContent = 'Save'; }, 1800);
  }

  function addRecipeToList(recipe) {
    recipe.items.forEach(function (raw) {
      var core = raw.replace(/^\s*[\d½¼¾\/\.]+\s*\w*\s*/, '').trim();
      addItem(core || raw);
    });
    saveData(); renderList();
    switchTab('list');
  }

  function removeRecipe(name) {
    data.recipes = data.recipes.filter(function (r) { return r.name !== name; });
    DAYS.forEach(function (d) { if (data.plan[d] === name) delete data.plan[d]; });
    saveData(); renderRecipes(); renderWeek();
  }

  function renderRecipes() {
    var ul = $('recipes-list');
    ul.replaceChildren();
    if (!data.recipes.length) {
      var li = document.createElement('li');
      li.className = 'empty';
      li.textContent = 'No saved recipes yet. Let the AI chef write one, or save one by hand.';
      ul.appendChild(li);
      return;
    }
    data.recipes.forEach(function (r) {
      var li = document.createElement('li');
      li.className = 'recipe-row-wrap';
      li.innerHTML =
        '<div class="recipe-row">' +
        '<span class="store-main"><strong>' + esc(r.name) + '</strong>' +
        '<span class="dim">' + r.items.length + ' ingredients' + (r.steps.length ? ' · ' + r.steps.length + ' steps' : '') + '</span></span>' +
        '<span class="store-actions">' +
        '<button type="button" class="ghost-btn add-all-btn">Add to list</button>' +
        '<button type="button" class="tiny-btn view-btn" title="View recipe">📖</button>' +
        '<button type="button" class="tiny-danger" aria-label="Remove recipe">✕</button></span>' +
        '</div>' +
        '<div class="recipe-details" hidden>' +
        '<p class="dim">Ingredients</p><p>' + r.items.map(esc).join(' · ') + '</p>' +
        (r.steps.length ? '<p class="dim">Steps</p><ol class="ai-steps">' + r.steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>' : '') +
        '</div>';
      li.querySelector('.add-all-btn').addEventListener('click', function () { addRecipeToList(r); });
      li.querySelector('.view-btn').addEventListener('click', function () {
        var d = li.querySelector('.recipe-details');
        d.hidden = !d.hidden;
      });
      li.querySelector('.tiny-danger').addEventListener('click', function () { removeRecipe(r.name); });
      ul.appendChild(li);
    });
  }

  // ---------- device-to-device sync code (works without cloud) ----------
  function encodeData() {
    return btoa(unescape(encodeURIComponent(JSON.stringify(data))));
  }
  function decodeSyncCode(code) {
    var parsed = JSON.parse(decodeURIComponent(escape(atob(code.replace(/\s+/g, '')))));
    if (!parsed || typeof parsed !== 'object' || !parsed.list) throw new Error('bad code');
    return parsed;
  }
  function copySync() {
    var btn = $('copy-sync-btn');
    var code = encodeData();
    var done = function (ok) {
      btn.textContent = ok ? 'Copied ✓ — paste it on the other device' : 'Copy failed — the code is now in the box below';
      setTimeout(function () { btn.textContent = 'Copy sync code from this device'; }, 2500);
      if (!ok) {
        var inp = $('sync-input');
        inp.value = code;
      }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(function () { done(true); }, function () { done(false); });
    } else done(false);
  }
  function pasteSync() {
    var inp = $('sync-input');
    try {
      data = decodeSyncCode(inp.value);
      var base = emptyData();
      Object.keys(base).forEach(function (k) { if (data[k] == null) data[k] = base[k]; });
      saveData();
      inp.value = '';
      renderAll();
      switchTab('stores');
    } catch (e) {
      inp.value = '';
      inp.placeholder = 'That code didn\'t work — try again';
    }
  }

  // ---------- price watches ----------
  function addAlert() {
    var cat = $('alert-category').value;
    if (!cat) return;
    if (data.alerts.some(function (a) { return a.category === cat; })) return;
    var t = parseFloat($('alert-target').value);
    data.alerts.push({
      category: cat,
      target: (isFinite(t) && t > 0) ? t : null,
      targetHit: false,
      createdAt: new Date().toISOString()
    });
    $('alert-target').value = '';
    saveData();
    renderAlerts();
    checkAlerts();
  }

  function removeAlert(cat) {
    data.alerts = data.alerts.filter(function (a) { return a.category !== cat; });
    saveData(); renderAlerts();
  }

  function renderAlerts() {
    var ul = $('alerts-list');
    ul.replaceChildren();
    if (!data.alerts.length) {
      var li = document.createElement('li');
      li.className = 'empty';
      li.textContent = 'Nothing watched yet. Pick a category, optionally set a target price, tap Watch.';
      ul.appendChild(li);
      return;
    }
    data.alerts.forEach(function (a) {
      var li = document.createElement('li');
      li.className = 'store-row';
      var now = data.lastPrices[a.category];
      var sub = 'watching';
      if (a.target != null) {
        sub += ' · target ' + money(a.target) + unitLabel(currentBasis(a.category));
        if (a.targetHit) sub += ' ✓ hit';
      }
      if (now != null) sub += ' · now ' + money(now) + unitLabel(currentBasis(a.category));
      li.innerHTML =
        '<span class="store-main"><strong>' + esc(a.category) + '</strong>' +
        '<span class="dim">' + esc(sub) + '</span></span>' +
        '<button type="button" class="tiny-danger" aria-label="Stop watching">✕</button>';
      li.querySelector('.tiny-danger').addEventListener('click', function () { removeAlert(a.category); });
      ul.appendChild(li);
    });
  }

  function checkAlerts() {
    if (!prices || !data.alerts.length) { renderFeed(); return; }
    data.alerts.forEach(function (a) {
      var best = cheapestIn(a.category);
      if (!best) return;
      var cur = best.unitPriceCad;
      var prev = data.lastPrices[a.category];
      if (prev != null && cur < prev) {
        data.feed.unshift({
          when: new Date().toISOString(), category: a.category,
          price: cur, basis: best.unitPriceBasis,
          item: best.name, kind: 'drop'
        });
      }
      if (a.target != null && !a.targetHit && cur <= a.target) {
        a.targetHit = true;
        data.feed.unshift({
          when: new Date().toISOString(), category: a.category,
          price: cur, basis: best.unitPriceBasis,
          item: best.name, kind: 'target'
        });
      }
      data.lastPrices[a.category] = cur;
    });
    data.feed = data.feed.slice(0, 30);
    saveData(true);
    renderAlerts(); renderFeed();
    renderBadge();
  }

  function renderFeed() {
    var ul = $('alerts-feed');
    ul.replaceChildren();
    if (!data.feed.length) {
      var li = document.createElement('li');
      li.className = 'empty';
      li.textContent = 'No drops yet. Prices are checked every time you open the site.';
      ul.appendChild(li);
      return;
    }
    data.feed.forEach(function (f) {
      var li = document.createElement('li');
      li.className = 'feed-row drop' + (f.kind === 'target' ? ' target' : '');
      var lead = f.kind === 'target'
        ? '<strong>' + esc(f.category) + '</strong> hit your target: ' + money(f.price)
        : '<strong>' + esc(f.category) + '</strong> dropped to ' + money(f.price);
      li.innerHTML = lead +
        ' <span class="dim">(' + (f.basis === 'per 100 g' ? 'per 100 g' : 'per egg') +
        ') · ' + esc(f.item) + ' · ' +
        new Date(f.when).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' }) + '</span>';
      ul.appendChild(li);
    });
  }

  function unreadCount() {
    return data.feed.filter(function (f) { return !f.seen; }).length;
  }
  function renderBadge() {
    var n = unreadCount(), b = $('alert-badge');
    b.hidden = n === 0; b.textContent = n;
  }
  function markFeedSeen() {
    data.feed.forEach(function (f) { f.seen = true; });
    saveData(true);
    renderBadge();
  }

  // ---------- wiring ----------
  function wire() {
    $('save-stores-btn').addEventListener('click', saveCurrentStores);
    $('search-my-area-btn').addEventListener('click', searchMyArea);
    $('add-item-btn').addEventListener('click', function () { addItem(); });
    $('list-input').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addItem(); } });
    $('finish-trip-btn').addEventListener('click', finishTrip);
    $('add-week-btn').addEventListener('click', addWeekToList);
    $('add-alert-btn').addEventListener('click', addAlert);
    $('alert-target').addEventListener('keydown', function (e) { if (e.key === 'Enter') addAlert(); });

    $('demo-data-btn').addEventListener('click', loadDemo);

    $('cloud-connect-btn').addEventListener('click', connectCloud);

    $('ai-generate-btn').addEventListener('click', aiGenerate);
    $('ai-cheap-btn').addEventListener('click', aiCheap);
    $('pantry-cook-btn').addEventListener('click', aiPantry);
    $('pantry-photo-btn').addEventListener('click', function () { $('pantry-photo-input').click(); });
    $('pantry-photo-input').addEventListener('change', aiFromPhoto);
    $('ai-desc').addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); aiGenerate(); } });
    $('ai-add-btn').addEventListener('click', aiAddToList);
    $('ai-save-btn').addEventListener('click', aiSave);
    $('add-recipe-btn').addEventListener('click', addRecipe);
    $('recipe-ingredients').addEventListener('keydown', function (e) { if (e.key === 'Enter') addRecipe(); });
    $('set-budget-btn').addEventListener('click', setBudget);
    $('budget-input').addEventListener('keydown', function (e) { if (e.key === 'Enter') setBudget(); });
    $('copy-sync-btn').addEventListener('click', copySync);
    $('paste-sync-btn').addEventListener('click', pasteSync);
    $('sync-input').addEventListener('keydown', function (e) { if (e.key === 'Enter') pasteSync(); });

    document.querySelectorAll('.drawer-tab').forEach(function (t) {
      t.addEventListener('click', function () { if (t.getAttribute('data-tab') === 'alerts') markFeedSeen(); });
    });

    var dl = $('ingredients-datalist');
    (typeof INGREDIENTS !== 'undefined' ? INGREDIENTS : []).forEach(function (ing) {
      var o = document.createElement('option'); o.value = ing; dl.appendChild(o);
    });

    var sel = $('alert-category');
    primaryCategories().forEach(function (c) {
      var o = document.createElement('option'); o.value = c;
      o.textContent = c.charAt(0).toUpperCase() + c.slice(1); sel.appendChild(o);
    });

    try { var k = localStorage.getItem(AI_KEY_STORE); if (k) $('ai-key').value = k; } catch (e) {}
  }

  // ---------- init ----------
  async function init() {
    wireDrawer();

    var justSignedIn = false;
    if (!onFileProtocol()) {
      try {
        justSignedIn = await finishSignIn();
        if (!user) user = savedProfile();
      } catch (e) {
        auth0Error = (e && e.message) ? e.message : String(e);
      }
    }

    renderUser();
    loadData();
    wire();
    renderCloudUi();
    prices = await loadPrices();
    renderAll();

    if (user && cloudConfig()) await cloudPull(true);
    if (justSignedIn) openDrawer();
  }

  init();
})();
