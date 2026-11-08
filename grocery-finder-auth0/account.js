/* Grocery Finder — Auth0 account features
   1. One-click Google sign-in (Auth0 Universal Login)
   2. My Stores, 3. Shopping list, 4. Simple price-drop watches
   5. Extras (all optional): Recipe box, weekly budget, pantry marks,
      device-to-device sync code.
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
  var auth0Error = null;
  var user   = null;
  var prices = null;
  var data   = emptyData();

  function emptyData() {
    return { area: null, stores: [], list: [], alerts: [], lastPrices: {}, feed: [], recipes: [], budget: null };
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
    var base = emptyData();
    Object.keys(base).forEach(function (k) { if (data[k] == null) data[k] = base[k]; });
    if (!data.feed) data.feed = [];
    if (!data.lastPrices) data.lastPrices = {};
    data.alerts = (data.alerts || []).map(function (a) {
      return { category: a.category || String(a.id || '').split(':')[0], createdAt: a.createdAt || new Date().toISOString() };
    }).filter(function (a, i, all) {
      return a.category && !all.slice(0, i).some(function (b) { return b.category === a.category; });
    });
    data.list = (data.list || []).map(function (i) {
      return { name: i.name, checked: !!i.checked, pantry: !!i.pantry, matches: i.matches || matchProducts(i.name).slice(0, 3) };
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

  function onFileProtocol() {
    return window.location.protocol === 'file:';
  }

  function signIn() {
    if (onFileProtocol()) {
      alert('Sign-in needs the site served at http://localhost:8000\n\n' +
        'You opened this file by double-clicking (the address starts with File:///).\n' +
        'Open the folder, type cmd in the address bar, then run:\n' +
        '  python -m http.server 8000\n' +
        'and visit http://localhost:8000');
      return;
    }
    if (!auth0) {
      alert('Sign-in could not start.\n\nDetails: ' + (auth0Error || 'Auth0 did not load') +
        '\n\nCommon causes:\n' +
        '1) The Auth0 Domain in account.js does not match the Domain shown in your app\'s Settings page.\n' +
        '2) An ad-blocker or security extension is blocking the Auth0 script — try pausing it for localhost.');
      return;
    }
    var google = { connection: 'google-oauth2', screen_hint: 'signup' };
    auth0.loginWithRedirect({ authorizationParams: google })
      .catch(function (err) {
        console.warn('Google login failed, trying normal login:', err);
        return auth0.loginWithRedirect({
          authorizationParams: { screen_hint: 'signup', redirect_uri: window.location.origin }
        });
      })
      .catch(function (err) {
        alert('Sign-in failed to start.\n\nDetails: ' + (err && (err.message || err.error_description || err.error) ? (err.message || err.error_description || err.error) : String(err)) +
          '\n\nCheck the Allowed Callback/Logout/Web Origins in your Auth0 app contain exactly: http://localhost:8000');
      });
  }

  function signOut() {
    if (!auth0) return;
    return auth0.logout({ logoutParams: { returnTo: window.location.origin } });
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
      if (note) {
        if (onFileProtocol()) {
          note.innerHTML = '<strong>Sign-in needs the server.</strong> Open the folder, type <strong>cmd</strong> in the address bar, run <strong>python -m http.server 8000</strong>, and visit http://localhost:8000.';
        } else if (!auth0) {
          note.innerHTML = '<strong>Sign-in couldn\'t connect to Auth0.</strong> ' +
            (auth0Error || 'The sign-in library did not load.') +
            '<br><span class="dim">If an ad-blocker is on, allow scripts on localhost and refresh.</span>';
        }
      }
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
  function addItem(name) {
    var input = $('list-input');
    var n = (name || input.value).trim().toLowerCase();
    if (!n) return;
    if (data.list.some(function (i) { return i.name === n; })) return;
    data.list.push({ name: n, checked: false, pantry: false, matches: matchProducts(n).slice(0, 3) });
    if (!name) input.value = '';
    saveData();
    renderList();
  }

  function togglePantry(item) {
    item.pantry = !item.pantry;
    saveData(); renderList();
  }

  function renderList() {
    var ul = $('shopping-list');
    ul.replaceChildren();
    var total = 0, priced = 0;

    data.list.forEach(function (item) {
      var li = document.createElement('li');
      li.className = 'store-row' + (item.checked ? ' done' : '') + (item.pantry ? ' pantry' : '');

      var best = item.matches && item.matches.length ? item.matches[0] : null;
      var priceHtml = '';
      if (best) {
        var p = best.product;
        priceHtml = '<span class="price">' + money(p.priceCad) +
          ' <span class="dim">(' + money(p.unitPriceCad) + unitLabel(p.unitPriceBasis) + ')</span></span>';
        if (!item.checked && !item.pantry) { total += p.priceCad; priced++; }
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
      return;
    }
    $('list-total').textContent = priced
      ? 'To buy: about ' + money(total) + ' at Superstore (' + priced + ' item' + (priced === 1 ? '' : 's') + ' priced, cheapest package each)'
      : 'Add items to price them';
    renderBudgetLine(total);
  }

  // ---------- weekly budget (optional) ----------
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
    renderList();
    $('budget-input').value = data.budget == null ? '' : data.budget;
  }

  // ---------- recipe box ----------
  function addRecipe() {
    var name = $('recipe-name').value.trim();
    var raw = $('recipe-ingredients').value.trim();
    if (!name || !raw) { flashRecipe('Name and ingredients, please'); return; }
    var items = raw.split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);
    if (!items.length) { flashRecipe('Add at least one ingredient'); return; }
    if (data.recipes.some(function (r) { return r.name === name; })) { flashRecipe('Recipe already saved'); return; }
    data.recipes.push({ name: name, items: items, createdAt: new Date().toISOString() });
    $('recipe-name').value = ''; $('recipe-ingredients').value = '';
    saveData(); renderRecipes();
    flashRecipe('Saved "' + name + '" ✓');
  }

  function flashRecipe(msg) {
    var btn = $('add-recipe-btn');
    btn.textContent = msg;
    setTimeout(function () { btn.textContent = 'Save recipe'; }, 1800);
  }

  function addRecipeToList(recipe) {
    recipe.items.forEach(function (n) {
      if (data.list.some(function (i) { return i.name === n; })) return;
      data.list.push({ name: n, checked: false, pantry: false, matches: matchProducts(n).slice(0, 3) });
    });
    saveData(); renderList();
    var tab = document.querySelector('.drawer-tab[data-tab="list"]');
    if (tab) tab.click();
  }

  function removeRecipe(name) {
    data.recipes = data.recipes.filter(function (r) { return r.name !== name; });
    saveData(); renderRecipes();
  }

  function renderRecipes() {
    var ul = $('recipes-list');
    ul.replaceChildren();
    if (!data.recipes.length) {
      var li = document.createElement('li');
      li.className = 'empty';
      li.textContent = 'No recipes yet. Save one above, then add it to your list with one tap.';
      ul.appendChild(li);
      return;
    }
    data.recipes.forEach(function (r) {
      var li = document.createElement('li');
      li.className = 'recipe-row';
      li.innerHTML =
        '<span class="store-main"><strong>' + esc(r.name) + '</strong>' +
        '<span class="dim">' + r.items.length + ' ingredients</span></span>' +
        '<span class="store-actions">' +
        '<button type="button" class="ghost-btn add-all-btn">Add to list</button>' +
        '<button type="button" class="tiny-danger" aria-label="Remove recipe">✕</button></span>';
      li.querySelector('.add-all-btn').addEventListener('click', function () { addRecipeToList(r); });
      li.querySelector('.tiny-danger').addEventListener('click', function () { removeRecipe(r.name); });
      ul.appendChild(li);
    });
  }

  // ---------- device-to-device sync code ----------
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
      renderStores(); renderList(); renderAlerts(); renderFeed(); renderBadge(); renderRecipes(); checkAlerts();
      var tab = document.querySelector('.drawer-tab[data-tab="stores"]');
      if (tab) tab.click();
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
    $('add-item-btn').addEventListener('click', function () { addItem(); });
    $('list-input').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addItem(); } });
    $('add-alert-btn').addEventListener('click', addAlert);

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
    categories().forEach(function (c) {
      var o = document.createElement('option'); o.value = c;
      o.textContent = c.charAt(0).toUpperCase() + c.slice(1); sel.appendChild(o);
    });
  }

  // ---------- init ----------
  async function init() {
    wireDrawer();

    if (!onFileProtocol()) {
      try {
        // Wait until the Auth0 library has loaded from one of its CDNs.
        if (window.__auth0SdkReady) await window.__auth0SdkReady;
        if (typeof createAuth0Client === 'undefined') {
          auth0Error = 'The Auth0 sign-in library could not be downloaded (all CDNs blocked). Pause any ad-blocker / security extension for localhost and refresh.';
        } else {
          auth0 = await makeClient();
          if (window.location.search.indexOf('code=') > -1) {
            await auth0.handleRedirectCallback();
            window.history.replaceState({}, '', window.location.pathname);
          }
          user = await auth0.getUser();
        }
      } catch (e) {
        auth0Error = (e && (e.message || e.error_description || e.error)) ? (e.message || e.error_description || e.error) : String(e);
        auth0 = null;
        console.warn('Auth0 init failed:', e);
      }
    }

    renderUser();
    loadData();
    wire();
    prices = await loadPrices();
    renderStores(); renderList(); renderAlerts(); renderFeed(); renderBadge(); renderRecipes();
    checkAlerts();
  }

  init();
})();
