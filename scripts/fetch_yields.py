"""Download monthly 10y government bond yields via DBNomics.

DBNomics mirrors the OECD Main Economic Indicators (MEI) database and exposes
it as a free no-key JSON API. Series structure for each country (ISO3):

    https://api.db.nomics.world/v22/series/OECD/MEI/{ISO3}.IRLTLT01.ST.M

Caveat: OECD restructured the MEI dataset and the DBNomics mirror currently
ends in early 2024. Events from 2024 onwards will be missing the forward half
of their +/-12mo window. We previously used FRED's CSV endpoint (current data)
but FRED's unauthenticated endpoint became unreliable in mid-2026.

Output: scripts/_cache/yields_raw.json — list of {country_iso2, date, yield_pct}.
"""
from __future__ import annotations

import json
import logging
import sys
import time
from pathlib import Path

import requests

from countries import COUNTRIES

LOG = logging.getLogger("fetch_yields")
HEADERS = {"User-Agent": "gilt-downgrade/0.1 (research)", "Connection": "close"}
CACHE = Path(__file__).parent / "_cache"


def fetch_series(iso3: str, retries: int = 3) -> list[tuple[str, float]] | None:
    """Return [(YYYY-MM-DD, yield_pct)] or None if unavailable."""
    url = f"https://api.db.nomics.world/v22/series/OECD/MEI/{iso3}.IRLTLT01.ST.M?observations=1"
    for attempt in range(retries):
        try:
            r = requests.get(url, headers=HEADERS, timeout=20)
            if r.status_code == 404:
                return None
            r.raise_for_status()
            payload = r.json()
            docs = payload.get("series", {}).get("docs", [])
            if not docs:
                return None
            doc = docs[0]
            periods = doc.get("period", []) or []
            values = doc.get("value", []) or []
            out: list[tuple[str, float]] = []
            for p, v in zip(periods, values):
                # period is "YYYY-MM"; v may be the string "NA" for missing months
                if v is None or v == "NA":
                    continue
                try:
                    out.append((f"{p}-01", float(v)))
                except (TypeError, ValueError):
                    continue
            return out
        except requests.RequestException as e:
            LOG.warning("%s attempt %d/%d failed: %s", iso3, attempt + 1, retries, e)
        time.sleep(1.0 + attempt)
    return None


def main():
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    CACHE.mkdir(parents=True, exist_ok=True)

    combined: list[dict] = []
    missing: list[str] = []
    for c in COUNTRIES:
        if not c.oecd_mei:
            missing.append(c.iso2)
            continue
        rows = fetch_series(c.iso3)
        if rows is None:
            LOG.warning("%s (%s): no data", c.iso2, c.iso3)
            missing.append(c.iso2)
            continue
        for d, v in rows:
            combined.append({"country_iso2": c.iso2, "date": d, "yield_pct": v})
        LOG.info("%s: %d points (%s -> %s)", c.iso2, len(rows),
                 rows[0][0] if rows else "-", rows[-1][0] if rows else "-")
        time.sleep(0.2)

    out_path = CACHE / "yields_raw.json"
    out_path.write_text(json.dumps(combined, indent=2))
    LOG.info("Wrote %d total points to %s", len(combined), out_path)
    if missing:
        LOG.info("No yield series for: %s", ", ".join(missing))


if __name__ == "__main__":
    sys.exit(main() or 0)
