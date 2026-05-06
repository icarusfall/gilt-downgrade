"""Scrape sovereign credit rating histories from countryeconomy.com.

Output schema (one row per rating action, before notch computation):
  country_iso2, agency, action_date (YYYY-MM-DD), rating, outlook, raw

Pages are static HTML with three <table> blocks per country, one per agency.
Each table has six columns (LT FC date/rating, LT LC date/rating, ST FC, ST LC).
We only use long-term foreign currency, the conventional headline rating.
"""
from __future__ import annotations

import json
import logging
import re
import sys
import time
from html.parser import HTMLParser
from pathlib import Path

import requests

from countries import COUNTRIES, Country

LOG = logging.getLogger("fetch_ratings")
HEADERS = {
    "User-Agent": "Mozilla/5.0 (gilt-downgrade research) Chrome/120",
    "Accept": "text/html,application/xhtml+xml",
    "Connection": "close",
}

# Each agency tab has a known id pattern: tb0_xxx (Moody's), tb1_xxx (S&P), tb2_xxx (Fitch).
# xxx is country-specific so we match by tb0_/tb1_/tb2_ prefix.
TABLE_AGENCY = {"tb0_": "Moody's", "tb1_": "S&P", "tb2_": "Fitch"}


class RatingsTableParser(HTMLParser):
    """Pulls rating-history rows out of countryeconomy.com HTML."""

    def __init__(self):
        super().__init__()
        self.current_agency: str | None = None
        self.in_tbody = False
        self.in_tr = False
        self.in_td = False
        self.cur_row: list[str] = []
        self.cur_cell: list[str] = []
        # rows keyed by agency: list of [date_lt_fc, rating_lt_fc]
        self.rows: dict[str, list[tuple[str, str]]] = {a: [] for a in TABLE_AGENCY.values()}

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "table":
            tid = attrs.get("id", "")
            self.current_agency = None
            for prefix, agency in TABLE_AGENCY.items():
                if tid.startswith(prefix):
                    self.current_agency = agency
                    break
            self.in_tbody = False
        elif tag == "tbody" and self.current_agency:
            self.in_tbody = True
        elif tag == "tr" and self.in_tbody:
            self.in_tr = True
            self.cur_row = []
        elif tag == "td" and self.in_tr:
            self.in_td = True
            self.cur_cell = []

    def handle_endtag(self, tag):
        if tag == "td" and self.in_td:
            self.cur_row.append("".join(self.cur_cell).strip())
            self.in_td = False
        elif tag == "tr" and self.in_tr:
            # Long-term foreign currency = first two cells (date, rating)
            if len(self.cur_row) >= 2 and self.current_agency:
                d, r = self.cur_row[0], self.cur_row[1]
                if d and r:
                    self.rows[self.current_agency].append((d, r))
            self.in_tr = False
        elif tag == "tbody":
            self.in_tbody = False
        elif tag == "table":
            self.current_agency = None

    def handle_data(self, data):
        if self.in_td:
            self.cur_cell.append(data)


_RATING_OUTLOOK_RE = re.compile(r"^([A-Za-z+\-0-9]+)?\s*(?:\(([^)]+)\))?\s*$")


def parse_rating_cell(cell: str) -> tuple[str | None, str | None]:
    """Return (rating, outlook). Either may be None.

    Examples:
      "AA (Stable)"   -> ("AA", "Stable")
      "Aa3"           -> ("Aa3", None)
      "(Negative)"    -> (None, "Negative")     # outlook-only update
    """
    m = _RATING_OUTLOOK_RE.match(cell.strip())
    if not m:
        return None, None
    rating, outlook = m.group(1), m.group(2)
    return (rating or None, outlook or None)


def fetch(country: Country, retries: int = 3) -> list[dict]:
    """Return list of {country_iso2, agency, action_date, rating, outlook, raw}."""
    url = f"https://countryeconomy.com/ratings/{country.slug}"
    last_err: Exception | None = None
    html: str | None = None
    for attempt in range(retries):
        try:
            r = requests.get(url, headers=HEADERS, timeout=30)
            if r.status_code == 404:
                LOG.warning("%s: 404 at %s (slug wrong?)", country.iso2, url)
                return []
            r.raise_for_status()
            html = r.text
            break
        except requests.RequestException as e:
            last_err = e
            time.sleep(1.5 * (attempt + 1))
    if html is None:
        LOG.warning("%s: failed after %d retries: %s", country.iso2, retries, last_err)
        return []

    p = RatingsTableParser()
    p.feed(html)
    out: list[dict] = []
    for agency, rows in p.rows.items():
        for d, raw in rows:
            rating, outlook = parse_rating_cell(raw)
            out.append({
                "country_iso2": country.iso2,
                "agency": agency,
                "action_date": d,
                "rating": rating,
                "outlook": outlook,
                "raw": raw,
            })
    LOG.info("%s: %d actions across %d agencies",
             country.iso2,
             len(out),
             sum(1 for a in p.rows.values() if a))
    return out


def main():
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    out_path = Path(__file__).parent / "_cache" / "ratings_raw.json"
    out_path.parent.mkdir(exist_ok=True)

    all_rows: list[dict] = []
    for c in COUNTRIES:
        rows = fetch(c)
        all_rows.extend(rows)
        time.sleep(0.4)  # be polite

    out_path.write_text(json.dumps(all_rows, indent=2, ensure_ascii=False))
    LOG.info("Wrote %d rows to %s", len(all_rows), out_path)


if __name__ == "__main__":
    sys.exit(main() or 0)
