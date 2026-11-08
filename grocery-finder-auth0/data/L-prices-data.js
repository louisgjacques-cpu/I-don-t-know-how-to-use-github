/* L-prices-data.js (in data/) — bundled copy of the Superstore price data (L kit).
   Lets the shopping list and price alerts work even when the site is
   opened by double-clicking (file://), where fetch() of the JSON is blocked.
   The JSON file is still preferred when running via a server. */
var SUPERSTORE_PRICES = {
  "importedAt": "2025-11-01T00:00:00.000Z",
  "retailers": {
    "superstore": {
      "name": "Real Canadian Superstore",
      "currency": "CAD",
      "priceType": "SAMPLE DATA - replace with the real output of import_superstore_prices.mjs",
      "categories": {
        "eggs": [
          { "id": "sample-eggs-1", "name": "No Name Large White Eggs", "brand": "No Name", "packageQuantity": 12, "packageUnit": "count", "priceCad": 4.29, "unitPriceCad": 0.3575, "unitPriceBasis": "per egg", "sourceUrl": "https://www.realcanadiansuperstore.ca" },
          { "id": "sample-eggs-2", "name": "Selection Size Large Brown Eggs", "brand": "Selection", "packageQuantity": 18, "packageUnit": "count", "priceCad": 6.97, "unitPriceCad": 0.3872, "unitPriceBasis": "per egg", "sourceUrl": "https://www.realcanadiansuperstore.ca" }
        ],
        "rice": [
          { "id": "sample-rice-1", "name": "No Name Long Grain White Rice", "brand": "No Name", "packageQuantity": 2000, "packageUnit": "g", "priceCad": 4.97, "unitPriceCad": 0.2485, "unitPriceBasis": "per 100 g", "sourceUrl": "https://www.realcanadiansuperstore.ca" },
          { "id": "sample-rice-2", "name": "Club House Jasmine Rice", "brand": null, "packageQuantity": 900, "packageUnit": "g", "priceCad": 3.47, "unitPriceCad": 0.3856, "unitPriceBasis": "per 100 g", "sourceUrl": "https://www.realcanadiansuperstore.ca" }
        ],
        "butter": [
          { "id": "sample-butter-1", "name": "No Name Salted Butter", "brand": "No Name", "packageQuantity": 454, "packageUnit": "g", "priceCad": 5.49, "unitPriceCad": 1.2090, "unitPriceBasis": "per 100 g", "sourceUrl": "https://www.realcanadiansuperstore.ca" }
        ],
        "beef": [
          { "id": "sample-beef-1", "name": "No Name Ground Beef Lean", "brand": "No Name", "packageQuantity": 454, "packageUnit": "g", "priceCad": 7.29, "unitPriceCad": 1.6057, "unitPriceBasis": "per 100 g", "sourceUrl": "https://www.realcanadiansuperstore.ca" }
        ]
      }
    }
  }
};
