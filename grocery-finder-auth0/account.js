/* Grocery Finder — Auth0 account features
   1. One-click Google sign-in (Auth0 Universal Login)
   2. My Stores, 3. Shopping list, 4. Simple price-drop watches
   Your Auth0 app values are already filled in below. */
(function () {
  'use strict';

  // ================= YOUR AUTH0 APP (already set) =================
  var AUTH0_DOMAIN    = 'dev-feoavgdll2d4ur2a.us.auth0.com';
  var AUTH0_CLIENT_ID = 'tXaIv6bVltFZaBbc8FWPf8rqx0Iuwan4';
  // ================================================================

  var PRICES_URL = 'data/superstore-prices.json';
  var LS_PREFIX  = 'gf-account-';

  var auth0  = null;
  var user   = null;
  var prices = null;
  var data   = emptyData();

  function emptyData() {
    return { area: null, stores: [], list: [], alerts: [], lastPrices: {}, feed: [] };
  }

  // ---------- tiny helpers ----------
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(n) { return '$' + Number(n).toFixed(2); }
  function key() { return LS_PREFIX + (user ? user.sub : 'guest'); }
  function loadData() {
    try { data = JSON.parse(localStorage.getItem(key())) || emptyData(); }
    catch (e) { data = emptyData(); }
    if (!data.feed) data.feed = [];
    if (!data.lastPrices) data.lastPrices = {};
    // Simplified watches: one per category, no price targets.
    data.alerts = (data.alerts || []).map(function (a) {
      return { category: a.category || String(a.id || '').split(':')[0], createdAt: a.createdAt || new Date().toISOString() };
    }).filter(function (a, i, all) {
      return a.category && !all.slice(0, i).some(function (b) { return b.category === a.category; });
    });
  }
  function saveData() {
    try { localStorage.setItem(key(), JSON.stringify(data)); } catch (e) {}
  }

  // ---------- Auth0 ----------
  function makeClient() {
    return createAuth0Client({
      domain: AUTH0_DOMAIN,
      clientId: AUTH0_CLIENT_ID,
      authorizationParams: { redirect_uri: window.location.origin }
    });
  }

  function signIn() {
    // One-click Google; falls back to the normal hosted login if the
    // Google connection isn't enabled yet in the Auth0 dashboard.
    var google = { connection: 'google-oauth2', screen_hint: 'signup' };
    return auth0.loginWithRedirect({ authorizationParams: google })
      .catch(function () {
        return auth0.loginWithRedirect({
          authorizationParams: { screen_hint: 'signup', redirect_uri: window.location.origin }
        });
      });
  }

  function signOut() {
    return auth0.logout({ logoutParams: { returnTo: window.location.origin } });
  }

  function renderUser() {
    var inBox = $('user-when-in'), outBox = $('user-when-out');
    if (user) {
      inBox.hidden = false; outBox.hidden = true;
      $('user-chip').innerHTML = '👋 <strong>' + esc(user.name || user.email) + '</strong>' +
        (user.email ? '<br><span class="dim">' + esc(user.email) + '</span>' : '');
      $('account-open-btn').textContent = 'Account';
    } else {
      inBox.hidden = true; outBox.hidden = false;
      $('account-open-btn').textContent = 'Sign in';
    }
  }

  // ---------- drawer ----------
  var drawer = null;
  function openDrawer()  { drawer.hidden = false; requestAnimationFrame(function () { drawer.classList.add('open'); }); }
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

    $('auth-signin-btn').addEventListener('click', signIn);
    $('auth-signout-btn').addEventListener('click', signOut);
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

  // ---------- prices ----------
  function loadPrices() {
    return fetch(PRICES_URL)
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; })
      .then(function (p) {
        // Opening the page by double-click (file://) blocks fetch(), so
        // fall back to the bundled copy in data/prices-data.js.
        if (!p && typeof SUPERSTORE_PRICES !== 'undefined') p = SUPERSTORE_PRICES;
        return p;
      });
  }

  function categories() {
    if (!prices) return [];
    return Object.keys(prices.retailers.superstore.categories || {});
  }

  function productsIn(category) {
    return (prices.retailers.superstore.categories[category] || []);
  }

  function cheapestIn(category) {
    var prods = productsIn(category);
    if (!prods.length) return null;
    return prods.reduce(function (a, b) { return (b.unitPriceCad < a.unitPriceCad) ? b : a; });
  }

  function unitLabel(basis) {
    return basis === 'per 100 g' ? '/100g' : '/egg';
  }

  // Match a shopping-list item to products by shared words.
  function matchProducts(itemName) {
    var words = itemName.toLowerCase().split(/[^a-z]+/).filter(function (w) { return w.length >= 4; });
    if (!words.length) return [];
    var out = [];
    categories().forEach(function (cat) {
      productsIn(cat).forEach(function (p) {
        var name = (p.name || '').toLowerCase();
        var hits = words.filter(function (w) { return name.indexOf(w) > -1; }).length;
        if (hits) out.push({ product: p, category: cat, hits: hits });
      });
    });
    out.sort(function (a, b) { return b.hits - a.hits || a.product.unitPriceCad - b.product.unitPriceCad; });
    return out;
  }

  // ---------- shopping list ----------
  function addItem() {
    var input = $('list-input');
    var name = input.value.trim().toLowerCase();
    if (!name) return;
    if (data.list.some(function (i) { return i.name === name; })) { input.value = ''; return; }
    data.list.push({ name: name, checked: false, matches: matchProducts(name).slice(0, 3) });
    input.value = '';
    saveData();
    renderList();
  }

  function renderList() {
    var ul = $('shopping-list');
    ul.replaceChildren();
    var total = 0, priced = 0;

    data.list.forEach(function (item) {
      var li = document.createElement('li');
      li.className = 'store-row' + (item.checked ? ' done' : '');

      var best = item.matches && item.matches.length ? item.matches[0] : null;
      var priceHtml = '';
      if (best) {
        var p = best.product;
        priceHtml = '<span class="price">' + money(p.priceCad) +
          ' <span class="dim">(' + money(p.unitPriceCad) + unitLabel(p.unitPriceBasis) + ')</span></span>';
        if (!item.checked) { total += p.priceCad; priced++; }
      } else {
        priceHtml = '<span class="dim">not in price file</span>';
      }

      li.innerHTML =
        '<label class="store-main check"><input type="checkbox"' + (item.checked ? ' checked' : '') + '> ' +
        '<span><strong>' + esc(item.name) + '</strong>' + priceHtml +
        (best ? '<span class="dim">' + esc(best.product.name) + '</span>' : '') + '</span></label>' +
        '<button type="button" class="tiny-danger" aria-label="Remove">✕</button>';

      li.querySelector('input[type=checkbox]').addEventListener('change', function (e) {
        item.checked = e.target.checked; saveData(); renderList();
      });
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
      return;
    }
    $('list-total').textContent = priced
      ? 'About ' + money(total) + ' at Superstore (' + priced + ' item' + (priced === 1 ? '' : 's') + ' priced, cheapest package each)'
      : 'Add items to price them';
  }

  // ---------- price watches (simple: one tap, feed only) ----------
  function addAlert() {
    var cat = $('alert-category').value;
    if (!cat) return;
    if (data.alerts.some(function (a) { return a.category === cat; })) return;
    data.alerts.push({ category: cat, createdAt: new Date().toISOString() });
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
      li.textContent = 'Nothing watched yet. Pick a category and tap Watch.';
      ul.appendChild(li);
      return;
    }
    data.alerts.forEach(function (a) {
      var li = document.createElement('li');
      li.className = 'store-row';
      var now = data.lastPrices[a.category];
      li.innerHTML =
        '<span class="store-main"><strong>' + esc(a.category) + '</strong>' +
        '<span class="dim">watching · cheapest now ' +
        (now != null ? money(now) + unitLabel(currentBasis(a.category)) : '…') + '</span></span>' +
        '<button type="button" class="tiny-danger" aria-label="Stop watching">✕</button>';
      li.querySelector('.tiny-danger').addEventListener('click', function () { removeAlert(a.category); });
      ul.appendChild(li);
    });
  }

  function currentBasis(category) {
    var best = cheapestIn(category);
    return best ? best.unitPriceBasis : 'per 100 g';
  }

  function checkAlerts() {
    if (!prices || !data.alerts.length) { renderFeed(); return; }
    var newHits = 0;
    data.alerts.forEach(function (a) {
      var best = cheapestIn(a.category);
      if (!best) return;
      var cur = best.unitPriceCad;
      var prev = data.lastPrices[a.category];
      if (prev != null && cur < prev) {
        data.feed.unshift({
          when: new Date().toISOString(), category: a.category,
          price: cur, prev: prev, basis: best.unitPriceBasis,
          item: best.name, kind: 'drop'
        });
        newHits++;
      }
      data.lastPrices[a.category] = cur;
    });
    data.feed = data.feed.slice(0, 30);
    saveData();
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
      li.className = 'feed-row drop';
      li.innerHTML = '<strong>' + esc(f.category) + '</strong> dropped to ' + money(f.price) +
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
    saveData(); renderBadge();
  }

  // ---------- wiring ----------
  function wire() {
    $('save-stores-btn').addEventListener('click', saveCurrentStores);
    $('search-my-area-btn').addEventListener('click', searchMyArea);
    $('add-item-btn').addEventListener('click', addItem);
    $('list-input').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addItem(); } });
    $('add-alert-btn').addEventListener('click', addAlert);

    document.querySelectorAll('.drawer-tab').forEach(function (t) {
      t.addEventListener('click', function () { if (t.getAttribute('data-tab') === 'alerts') markFeedSeen(); });
    });

    // ingredient autocomplete
    var dl = $('ingredients-datalist');
    (typeof INGREDIENTS !== 'undefined' ? INGREDIENTS : []).forEach(function (ing) {
      var o = document.createElement('option'); o.value = ing; dl.appendChild(o);
    });

    // watch categories from the price file
    var sel = $('alert-category');
    categories().forEach(function (c) {
      var o = document.createElement('option'); o.value = c;
      o.textContent = c.charAt(0).toUpperCase() + c.slice(1); sel.appendChild(o);
    });
  }

  // ---------- init ----------
  async function init() {
    wireDrawer();

    try {
      auth0 = await makeClient();
      if (window.location.search.indexOf('code=') > -1) {
        await auth0.handleRedirectCallback();
        window.history.replaceState({}, '', window.location.pathname);
      }
      user = await auth0.getUser();
    } catch (e) {
      console.warn('Auth0 init failed:', e);
    }

    renderUser();
    loadData();
    wire();
    prices = await loadPrices();
    renderStores(); renderList(); renderAlerts(); renderFeed(); renderBadge();
    checkAlerts();  // prices are checked automatically on every visit
  }

  init();
})();
