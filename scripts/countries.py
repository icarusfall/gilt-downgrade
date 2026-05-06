"""Country metadata for the gilt-downgrade project.

Universe = IMF advanced economies (April 2026 list, 43 countries).
We drop a handful of micro-states with no real sovereign debt market.

For each country we track:
  - iso2:        ISO 3166-1 alpha-2 (used as primary key)
  - name:        display name
  - slug:        URL slug for countryeconomy.com (/ratings/<slug>)
  - fred_id:     FRED series ID for 10y govt bond yield (None if unavailable)
  - currency:    issuing currency today
  - eurozone:    date country adopted the euro (None if never / not yet)
"""
from datetime import date
from dataclasses import dataclass


@dataclass(frozen=True)
class Country:
    iso2: str
    name: str
    slug: str
    fred_id: str | None
    currency: str
    eurozone: date | None = None

    def currency_at(self, d: date) -> str:
        """Issuing currency on a given date (handles eurozone joiners)."""
        if self.eurozone and d >= self.eurozone:
            return "EUR"
        return self.currency


# fmt: off
COUNTRIES: list[Country] = [
    # G7 + other large advanced
    Country("US", "United States",   "usa",            "IRLTLT01USM156N", "USD"),
    Country("GB", "United Kingdom",  "uk",             "IRLTLT01GBM156N", "GBP"),
    Country("JP", "Japan",           "japan",          "IRLTLT01JPM156N", "JPY"),
    Country("DE", "Germany",         "germany",        "IRLTLT01DEM156N", "DEM", date(1999, 1, 1)),
    Country("FR", "France",          "france",         "IRLTLT01FRM156N", "FRF", date(1999, 1, 1)),
    Country("IT", "Italy",           "italy",          "IRLTLT01ITM156N", "ITL", date(1999, 1, 1)),
    Country("ES", "Spain",           "spain",          "IRLTLT01ESM156N", "ESP", date(1999, 1, 1)),
    Country("CA", "Canada",          "canada",         "IRLTLT01CAM156N", "CAD"),
    Country("AU", "Australia",       "australia",      "IRLTLT01AUM156N", "AUD"),
    Country("KR", "South Korea",     "south-korea",    "IRLTLT01KRM156N", "KRW"),
    Country("CH", "Switzerland",     "switzerland",    "IRLTLT01CHM156N", "CHF"),

    # Nordics
    Country("SE", "Sweden",          "sweden",         "IRLTLT01SEM156N", "SEK"),
    Country("NO", "Norway",          "norway",         "IRLTLT01NOM156N", "NOK"),
    Country("DK", "Denmark",         "denmark",        "IRLTLT01DKM156N", "DKK"),
    Country("FI", "Finland",         "finland",        "IRLTLT01FIM156N", "FIM", date(1999, 1, 1)),
    Country("IS", "Iceland",         "iceland",        "IRLTLT01ISM156N", "ISK"),

    # Other Eurozone
    Country("NL", "Netherlands",     "netherlands",    "IRLTLT01NLM156N", "NLG", date(1999, 1, 1)),
    Country("BE", "Belgium",         "belgium",        "IRLTLT01BEM156N", "BEF", date(1999, 1, 1)),
    Country("AT", "Austria",         "austria",        "IRLTLT01ATM156N", "ATS", date(1999, 1, 1)),
    Country("PT", "Portugal",        "portugal",       "IRLTLT01PTM156N", "PTE", date(1999, 1, 1)),
    Country("IE", "Ireland",         "ireland",        "IRLTLT01IEM156N", "IEP", date(1999, 1, 1)),
    Country("GR", "Greece",          "greece",         "IRLTLT01GRM156N", "GRD", date(2001, 1, 1)),
    Country("LU", "Luxembourg",      "luxembourg",     "IRLTLT01LUM156N", "LUF", date(1999, 1, 1)),
    Country("SI", "Slovenia",        "slovenia",       "IRLTLT01SIM156N", "SIT", date(2007, 1, 1)),
    Country("SK", "Slovakia",        "slovakia",       "IRLTLT01SKM156N", "SKK", date(2009, 1, 1)),
    Country("EE", "Estonia",         "estonia",        None,              "EEK", date(2011, 1, 1)),
    Country("LV", "Latvia",          "latvia",         None,              "LVL", date(2014, 1, 1)),
    Country("LT", "Lithuania",       "lithuania",      None,              "LTL", date(2015, 1, 1)),
    Country("CY", "Cyprus",          "cyprus",         None,              "CYP", date(2008, 1, 1)),
    Country("MT", "Malta",           "malta",          None,              "MTL", date(2008, 1, 1)),
    Country("HR", "Croatia",         "croatia",        None,              "HRK", date(2023, 1, 1)),

    # Other advanced
    Country("CZ", "Czechia",         "czech-republic", "IRLTLT01CZM156N", "CZK"),
    Country("IL", "Israel",          "israel",         "IRLTLT01ILM156N", "ILS"),
    Country("NZ", "New Zealand",     "new-zealand",    "IRLTLT01NZM156N", "NZD"),
    Country("BG", "Bulgaria",        "bulgaria",       None,              "BGN"),
    Country("SG", "Singapore",       "singapore",      None,              "SGD"),
    Country("HK", "Hong Kong",       "hong-kong",      None,              "HKD"),
    Country("TW", "Taiwan",          "taiwan",         None,              "TWD"),

    # Micro-states intentionally omitted: AD (Andorra), LI (Liechtenstein),
    # SM (San Marino), MO (Macau), PR (Puerto Rico) — no meaningful sovereign
    # debt market or no separate sovereign.
]
# fmt: on


COUNTRIES_BY_ISO: dict[str, Country] = {c.iso2: c for c in COUNTRIES}


# S&P / Fitch share the same letter ladder
SP_FITCH_LADDER = [
    "AAA", "AA+", "AA", "AA-", "A+", "A", "A-",
    "BBB+", "BBB", "BBB-", "BB+", "BB", "BB-",
    "B+", "B", "B-", "CCC+", "CCC", "CCC-", "CC", "C", "D",
]
SP_FITCH_RANK = {r: i for i, r in enumerate(SP_FITCH_LADDER)}

# Moody's
MOODYS_LADDER = [
    "Aaa", "Aa1", "Aa2", "Aa3", "A1", "A2", "A3",
    "Baa1", "Baa2", "Baa3", "Ba1", "Ba2", "Ba3",
    "B1", "B2", "B3", "Caa1", "Caa2", "Caa3", "Ca", "C",
]
MOODYS_RANK = {r: i for i, r in enumerate(MOODYS_LADDER)}


def rank(rating: str, agency: str) -> int | None:
    """Lower number = better credit. Returns None if unrecognised."""
    rating = rating.strip()
    if agency == "Moody's":
        return MOODYS_RANK.get(rating)
    return SP_FITCH_RANK.get(rating)


def notch_change(old: str, new: str, agency: str) -> int | None:
    """Positive = upgrade, negative = downgrade, None if either rating is unparseable."""
    o, n = rank(old, agency), rank(new, agency)
    if o is None or n is None:
        return None
    # Better credit has lower rank, so an upgrade (rank decreases) should be +ve
    return o - n
