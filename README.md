# gilt-downgrade

Data explorer for the question: **what does a sovereign rating change typically do to government bond yields?**

Original motivating exam question: *what would the likely effect of a two-notch ratings downgrade be on the UK government curve?* Since we don't have decent UK comparator data, we look at every recorded rating action across the IMF advanced economies (~38 countries × 3 agencies) and let you filter to the comparators you find useful.

## What's here

```
gilt-downgrade/
├── scripts/                        # Python data pipeline
│   ├── countries.py                # Universe + currency/eurozone metadata
│   ├── fetch_ratings.py            # Scrape countryeconomy.com (Moody's/S&P/Fitch)
│   ├── fetch_yields.py             # FRED OECD harmonised 10y monthly yields
│   └── build_dataset.py            # Combine into frontend/public/data/dataset.json
├── frontend/                       # Vite + React static SPA
│   ├── src/
│   │   ├── views/Events.jsx        # Filter + table + detail chart
│   │   ├── components/Filters.jsx  # Agency / direction / magnitude / currency
│   │   └── lib/dataset.js          # Loads the precomputed JSON
│   └── public/data/dataset.json    # Generated, committed to repo
├── .github/workflows/
│   └── refresh-data.yml            # Monthly cron: re-runs the pipeline & commits
├── vercel.json                     # Static SPA config
└── README.md
```

There is no backend. The entire dataset is a single static `dataset.json` (a few MB at most) that the frontend fetches on load. GitHub Actions regenerates it monthly and commits it back to the repo, which triggers a Vercel redeploy.

## Data sources

- **Rating actions**: scraped from `countryeconomy.com/ratings/<country>`. Long-term foreign-currency ratings only. All three agencies. Includes outlook-only changes.
- **Yields**: DBNomics mirror of OECD MEI (`OECD/MEI/{ISO3}.IRLTLT01.ST.M`) — harmonised long-term (≈10y) government bond yields, monthly. Free, no API key. 28 of the 38 in-scope countries have a series; the rest (small Eurozone, BG, SG, HK, TW) show "no data" in the detail panel. We previously used FRED's CSV endpoint but it became unreliable in mid-2026 — see commit history.

⚠ **Coverage caveat**: the OECD MEI database was restructured in 2024, and the DBNomics mirror currently ends in early 2024. Events from 2024 onwards (e.g. Moody's downgrade of US in May 2025) will be missing the forward half of their ±12mo window. The "before" half is unaffected. We'll move to a fresher source once one's available without a paid feed.

## Running locally

```bash
# 1. Pipeline (writes _cache/, then frontend/public/data/dataset.json)
cd scripts
pip install requests
python fetch_ratings.py
python fetch_yields.py
python build_dataset.py

# 2. Frontend
cd ../frontend
npm install
npm run dev          # http://localhost:5173
```

## Deployment

- **Vercel** — point a project at this repo. The `vercel.json` builds the frontend and serves the static output. No env vars needed.
- **GitHub Actions** — `refresh-data.yml` runs monthly on the 5th at 06:00 UTC, regenerates `dataset.json`, and commits if changed. Vercel auto-deploys on push.

## Filters

- **Agency** — Moody's / S&P / Fitch (toggle individually)
- **Direction** — All / Downgrades / Upgrades
- **Magnitude** — Any / 1 notch / 2+ notches / Outlook-only
- **Currency at time of event** — All / exclude USD / exclude EUR / exclude both

The currency filter answers the "GBP isn't a reserve currency, exclude USD" and "Eurozone members aren't really sovereign issuers, exclude EUR" framing in the original brief.

## Known limitations

- 10y point only — full curves were considered but aren't free outside a small set (US, UK, DE, JP). 10y is the single most-watched maturity and a defensible proxy.
- ±12 month window — hardcoded in `build_dataset.py` (`WINDOW_MONTHS`).
- Notch counts are vs. the previous *long-term foreign-currency* rating from the same agency, ignoring local-currency and short-term ratings.
- `is_outlook_only` flag is heuristic: an event with no rating value, or where the rating equals the previous rating, is classified as outlook-only.
- Some Fitch streams have many "affirmation" events (same rating, no outlook change). These show as outlook-only with notches=0; filter them out via the magnitude toggle if noisy.
