# Grocery Finder — Auth0 account features (drop-in kit)

Adds to your existing site, without touching `app.js` or `stores.js`:

* **One-click Google sign-in** — Auth0 Universal Login, sidebar/topbar button
* **My Stores** — save any search's stores + a one-tap "search my area again"
* **Shopping list** — autocomplete over your 400 ingredients, priced against
  `data/superstore-prices.json` with a running total
* **Price-drop alerts** — watch a category (eggs, rice, butter, beef…), get a
  badge + feed entry when the cheapest unit price drops or hits your target

## Setup (10 minutes)

1. **Copy the files** into your repo root, next to your existing
   `app.js`, `stores.js`, `style.css`. Replace your `index.html` with this one
   (or just apply the `NEW`-marked chunks to your own file).

2. **Auth0 app**: dashboard → Applications → Create Application →
   type **Single Page Web Application**. From its Settings copy:
   * **Domain** → `AUTH0_DOMAIN` at the top of `account.js`
   * **Client ID** → `AUTH0_CLIENT_ID`

3. **Allowed URLs** (same Settings page) — add, one per line:
   * Allowed Callback URLs: `http://localhost:8000` (plus your real URL later)
   * Allowed Logout URLs: `http://localhost:8000`
   * Allowed Web Origins: `http://localhost:8000`

4. **Google login**: Authentication → Social → Google → enable it
   (Google gives you a free client ID/secret in the Auth0 flow). Until it's
   enabled, the button automatically falls back to the normal email/password
   hosted login — nothing breaks.

5. **Real prices**: run your `import_superstore_prices.mjs` and copy its
   `data/superstore-prices.json` here, replacing the sample.

6. **Run**: `python -m http.server 8000` → open `http://localhost:8000`.

## Known limits (and the upgrade path)

* Saved data is **per browser** (localStorage keyed by Auth0 user). Cross-device
  sync needs a tiny backend — the natural next step is exchanging the Auth0
  token for a **Firebase custom token** and storing the same JSON in your
  existing Firestore, secured per-uid.
* Alerts are **in-app** (badge + feed). Email/push alerts need a small server
  (or a scheduled job) that emails the watched list — the Auth0-verified email
  each user gets at signup is what you'd send to.
* Shopping-list pricing matches items to products by shared words and prices
  the cheapest matching package — good for eggs/rice/butter/beef, rough for
  anything not in the price file yet.
