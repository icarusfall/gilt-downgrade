"""Build the dataset.json the frontend reads.

Reads ratings_raw.json and yields_raw.json from _cache/, computes notch
changes per agency, joins each rating event to a ±12 month window of yield
data, and writes a compact JSON to frontend/public/data/dataset.json.

Schema:
{
  "generated_at": "2026-05-06T...",
  "countries": [
    {"iso2": "GB", "name": "United Kingdom", "currency_today": "GBP", "eurozone_join": null}
  ],
  "events": [
    {
      "id": "GB-Moodys-2016-06-24",
      "country_iso2": "GB",
      "agency": "Moody's",
      "date": "2016-06-24",
      "old_rating": "Aa1",
      "new_rating": "Aa1",       // outlook-only events keep same rating
      "old_outlook": "Stable",
      "new_outlook": "Negative",
      "notches": 0,              // negative=downgrade, positive=upgrade
      "is_outlook_only": true,
      "currency_at_event": "GBP",
      "yields": [{"date":"2015-06-01","y":1.91}, ...]   // ±12 months around event
    }
  ]
}
"""
from __future__ import annotations

import json
import logging
import sys
from collections import defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path

from countries import COUNTRIES_BY_ISO, notch_change

LOG = logging.getLogger("build_dataset")

CACHE = Path(__file__).parent / "_cache"
OUT_PATH = Path(__file__).parent.parent / "frontend" / "public" / "data" / "dataset.json"

WINDOW_MONTHS = 12


def parse_date(s: str) -> date:
    return datetime.strptime(s, "%Y-%m-%d").date()


def build_events(raw_ratings: list[dict]) -> list[dict]:
    """Sort each (country, agency) ratings stream and compute event diffs."""
    by_stream: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for r in raw_ratings:
        by_stream[(r["country_iso2"], r["agency"])].append(r)

    events: list[dict] = []
    for (iso2, agency), rows in by_stream.items():
        country = COUNTRIES_BY_ISO.get(iso2)
        if not country:
            continue
        # Ascending by date (oldest first)
        rows.sort(key=lambda r: r["action_date"])

        prev_rating: str | None = None
        prev_outlook: str | None = None
        for r in rows:
            d = r["action_date"]
            try:
                event_date = parse_date(d)
            except ValueError:
                continue

            new_rating = r["rating"] or prev_rating  # outlook-only inherits last rating
            new_outlook = r["outlook"]

            # Compute notch change vs previous LT rating
            notches: int | None = None
            if prev_rating and new_rating:
                notches = notch_change(prev_rating, new_rating, agency)

            is_outlook_only = (r["rating"] is None) or (
                prev_rating is not None and new_rating == prev_rating
            )

            events.append({
                "id": f"{iso2}-{agency.replace(chr(39),'').replace('&','').replace(' ','')}-{d}",
                "country_iso2": iso2,
                "agency": agency,
                "date": d,
                "old_rating": prev_rating,
                "new_rating": new_rating,
                "old_outlook": prev_outlook,
                "new_outlook": new_outlook,
                "notches": notches,
                "is_outlook_only": is_outlook_only,
                "currency_at_event": country.currency_at(event_date),
            })

            if new_rating:
                prev_rating = new_rating
            prev_outlook = new_outlook

    return events


def attach_yield_windows(events: list[dict], raw_yields: list[dict]) -> None:
    by_country: dict[str, list[tuple[date, float]]] = defaultdict(list)
    for y in raw_yields:
        try:
            by_country[y["country_iso2"]].append((parse_date(y["date"]), y["yield_pct"]))
        except ValueError:
            continue
    for iso2 in by_country:
        by_country[iso2].sort()

    for ev in events:
        series = by_country.get(ev["country_iso2"], [])
        if not series:
            ev["yields"] = []
            continue
        ed = parse_date(ev["date"])
        # ±WINDOW_MONTHS using a 30-day-month approximation; close enough at monthly grain
        lo = ed - timedelta(days=WINDOW_MONTHS * 31)
        hi = ed + timedelta(days=WINDOW_MONTHS * 31)
        ev["yields"] = [
            {"date": d.isoformat(), "y": v}
            for d, v in series
            if lo <= d <= hi
        ]


def main():
    logging.basicConfig(level=logging.INFO, format="%(message)s")

    ratings_path = CACHE / "ratings_raw.json"
    yields_path = CACHE / "yields_raw.json"
    if not ratings_path.exists():
        LOG.error("Missing %s — run fetch_ratings.py first", ratings_path)
        return 1
    if not yields_path.exists():
        LOG.error("Missing %s — run fetch_yields.py first", yields_path)
        return 1

    raw_ratings = json.loads(ratings_path.read_text())
    raw_yields = json.loads(yields_path.read_text())

    events = build_events(raw_ratings)
    LOG.info("Built %d events", len(events))
    attach_yield_windows(events, raw_yields)

    countries_meta = [
        {
            "iso2": c.iso2,
            "name": c.name,
            "currency_today": "EUR" if c.eurozone else c.currency,
            "eurozone_join": c.eurozone.isoformat() if c.eurozone else None,
            "has_yields": c.oecd_mei,
        }
        for c in COUNTRIES_BY_ISO.values()
    ]

    dataset = {
        "generated_at": datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "countries": countries_meta,
        "events": events,
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(dataset, ensure_ascii=False))
    LOG.info("Wrote %s (%d events, %d countries, %.1f kB)",
             OUT_PATH, len(events), len(countries_meta), OUT_PATH.stat().st_size / 1024)
    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)
