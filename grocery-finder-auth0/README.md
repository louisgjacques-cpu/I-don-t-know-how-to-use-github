# Grocery Finder — Auth0 account kit (self-contained)

Everything now works **on its own** — you don't need your original site files:

* Search stores by postal code / address (OpenStreetMap, 9 chains, map + receipt)
* Dark/light mode, progress bar
* **Sign up / Log in with Google** (Auth0) + **My Stores**, **Shopping list**, **Price alerts**

## Run it (Windows)

Double-click **1_START_SITE.bat**, or run `python -m http.server 8000`
and open http://localhost:8000

> Opening index.html directly (double-click, file://) shows the site, but
> sign-in and the shopping-list pricing need the local server above.

## Turn on the account features

1. Auth0 dashboard → Applications → Create → **Single Page Web Application**
2. Copy its **Domain** and **Client ID** into the two constants at the top of `account.js`
3. In the same Auth0 app settings, add `http://localhost:8000` to
   **Allowed Callback URLs**, **Allowed Logout URLs** and **Allowed Web Origins**
4. Authentication → Social → Google → enable (free). Until then the sign-in
   button uses Auth0's normal email/password page.

## Price alerts / shopping-list pricing

`data/superstore-prices.json` ships with **sample** prices. Run your
`import_superstore_prices.mjs` and replace it with the real output.

## Files

| File | What it is |
| --- | --- |
| `index.html` | The whole page: search, receipt, map, account drawer |
| `style.css` | Complete styling (dark mode included) |
| `app.js` | Search, map, progress bar, theme |
| `stores.js` | Store lookup via the Overpass API |
| `account.css` / `account.js` | Account drawer + Auth0 login + the three features |
| `ingredients.js` | 400-ingredient autocomplete list |
| `data/superstore-prices.json` | Price snapshot (SAMPLE) |
| `1_START_SITE.bat` | Double-click launcher (Windows) |
