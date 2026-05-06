"""Download monthly 10y government bond yields from FRED.

Series pattern: IRLTLT01{ISO2}M156N (OECD-sourced harmonized long-term yields).
We store one CSV per country in scripts/_cache/yields/{ISO2}.csv.

Output combined dataset: list of {country_iso2, date, yield_pct} sorted by date.
"""
from __future__ import annotations

import csv
import json
import logging
import sys
import time
from pathlib import Path

import requests

from countries import COUNTRIES

LOG = logging.getLogger("fetch_yields")
HEADERS = {
    "User-Agent": "Mozilla/5.0 (gilt-downgrade research)",
    "Accept": "text/csv,*/*",
    "Connection": "close",
}
CACHE = Path(__file__).parent / "_cache" / "yields"


def fetch_csv(series_id: str, retries: int = 4) -> str | None:
    url = f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={series_id}"
    for attempt in range(retries):
        try:
            r = requests.get(url, headers=HEADERS, timeout=60)
            if r.status_code == 404:
                return None
            r.raise_for_status()
            return r.text
        except requests.RequestException as e:
            LOG.debug("%s attempt %d failed: %s", series_id, attempt + 1, e)
        time.sleep(2.0 * (attempt + 1))
    return None


def parse_csv(body: str) -> list[tuple[str, float]]:
    """Return [(YYYY-MM-DD, yield_pct)]; skips '.' (FRED missing-value marker)."""
    rows: list[tuple[str, float]] = []
    reader = csv.reader(body.splitlines())
    header = next(reader, None)
    if not header or header[0].upper() not in ("DATE", "OBSERVATION_DATE"):
        return rows
    for row in reader:
        if len(row) < 2:
            continue
        d, v = row[0], row[1]
        if v in (".", ""):
            continue
        try:
            rows.append((d, float(v)))
        except ValueError:
            continue
    return rows


def main():
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    CACHE.mkdir(parents=True, exist_ok=True)

    combined: list[dict] = []
    missing: list[str] = []
    for c in COUNTRIES:
        if not c.fred_id:
            missing.append(c.iso2)
            continue
        body = fetch_csv(c.fred_id)
        if not body:
            LOG.warning("%s: download failed", c.iso2)
            missing.append(c.iso2)
            continue
        cache_file = CACHE / f"{c.iso2}.csv"
        cache_file.write_text(body)
        rows = parse_csv(body)
        for d, v in rows:
            combined.append({"country_iso2": c.iso2, "date": d, "yield_pct": v})
        LOG.info("%s: %d points (%s -> %s)", c.iso2, len(rows),
                 rows[0][0] if rows else "-", rows[-1][0] if rows else "-")
        time.sleep(0.3)

    out_path = CACHE.parent / "yields_raw.json"
    out_path.write_text(json.dumps(combined, indent=2))
    LOG.info("Wrote %d total points to %s", len(combined), out_path)
    if missing:
        LOG.info("No FRED series for: %s", ", ".join(missing))


if __name__ == "__main__":
    sys.exit(main() or 0)
