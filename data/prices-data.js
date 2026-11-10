/* data/prices-data.js — bundled copy of the price data.
   Lets the shopping list, store comparison and price alerts work even when
   the site is opened by double-clicking (file://), where fetch() of the
   JSON is blocked. The JSON file is still preferred when running via a server.

   TWO SAMPLE RETAILERS are included so the basket comparison (List tab)
   has something to compare. Replace both with your real scraper output:
   add one block per store under "retailers" and the comparison UI lights
   up automatically. */
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
    },
    "nofrills": {
      "name": "No Frills",
      "currency": "CAD",
      "priceType": "SAMPLE DATA - add real No Frills prices via the scraper",
      "categories": {
        "eggs": [
          { "id": "nf-eggs-1", "name": "No Name Large White Eggs", "brand": "No Name", "packageQuantity": 12, "packageUnit": "count", "priceCad": 3.97, "unitPriceCad": 0.3308, "unitPriceBasis": "per egg", "sourceUrl": "https://www.nofrills.ca" }
        ],
        "rice": [
          { "id": "nf-rice-1", "name": "No Name Long Grain White Rice", "brand": "No Name", "packageQuantity": 2000, "packageUnit": "g", "priceCad": 5.27, "unitPriceCad": 0.2635, "unitPriceBasis": "per 100 g", "sourceUrl": "https://www.nofrills.ca" }
        ],
        "butter": [
          { "id": "nf-butter-1", "name": "No Name Salted Butter", "brand": "No Name", "packageQuantity": 454, "packageUnit": "g", "priceCad": 5.77, "unitPriceCad": 1.2710, "unitPriceBasis": "per 100 g", "sourceUrl": "https://www.nofrills.ca" }
        ],
        "beef": [
          { "id": "nf-beef-1", "name": "Ground Beef Lean", "brand": null, "packageQuantity": 454, "packageUnit": "g", "priceCad": 6.99, "unitPriceCad": 1.5396, "unitPriceBasis": "per 100 g", "sourceUrl": "https://www.nofrills.ca" }
        ]
      }
    }
  }
};
