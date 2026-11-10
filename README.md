# Grocery Finder

A web app that finds nearby grocery stores and shows what a recipe's ingredients cost across chains, so you can shop at the lowest prices.

## Features

- Search stores by postal code, address or your location (OpenStreetMap / Overpass), shown on a map
- Ingredient autocomplete (400+ items) and a priced shopping-list "receipt"
- Sign in with email/password (Firebase Auth) to save stores, shopping lists and price alerts
- Light and dark mode

## Tech

Plain HTML, CSS and JavaScript (no build step). Leaflet for the map, Firebase Auth + Firestore for accounts. Firebase is bundled in `js/vendor/`.

## Run locally

```
python -m http.server 8000
```

Then open http://localhost:8000. On Windows you can double-click `start.bat` instead. Opening `index.html` directly works for search, but sign-in needs the local server.

## Structure

| Path | What it is |
| --- | --- |
| `index.html` | Entry page |
| `css/` | Styles (`style.css`, `account.css`) |
| `js/app.js`, `js/stores.js`, `js/ingredients.js` | Search, map and ingredient list |
| `js/auth.js`, `js/account.js` | Firebase sign-in, saved stores, shopping list, price alerts |
| `js/firebase-config.js` | Firebase web config (public by design; access is enforced by `firestore.rules`) |
| `data/` | Bundled sample price data (Superstore) |

## Notes

Prices in `data/` are sample data, not live prices.
