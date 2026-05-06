"""Country metadata for the gilt-downgrade project.

Universe = IMF advanced economies (April 2026 list, 43 countries).
We drop a handful of micro-states with no real sovereign debt market.

For each country we track:
  - iso2:        ISO 3166-1 alpha-2 (used as primary key + currency_at_event)
  - iso3:        ISO 3166-1 alpha-3 (used by DBNomics OECD/MEI series)
  - name:        display name
  - slug:        URL slug for countryeconomy.com (/ratings/<slug>)
  - oecd_mei:    True if covered by OECD MEI 10y harmonised yield (most G20 + EU)
  - currency:    issuing currency today (sovereign's local code)
  - eurozone:    date country adopted the euro (None if never / not yet)
"""
from datetime import date
from dataclasses import dataclass


@dataclass(frozen=True)
class Country:
    iso2: str
    iso3: str
    name: str
    slug: str
    oecd_mei: bool
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
    Country("US", "USA", "United States",   "usa",            True,  "USD"),
    Country("GB", "GBR", "United Kingdom",  "uk",             True,  "GBP"),
    Country("JP", "JPN", "Japan",           "japan",          True,  "JPY"),
    Country("DE", "DEU", "Germany",         "germany",        True,  "DEM", date(1999, 1, 1)),
    Country("FR", "FRA", "France",          "france",         True,  "FRF", date(1999, 1, 1)),
    Country("IT", "ITA", "Italy",           "italy",          True,  "ITL", date(1999, 1, 1)),
    Country("ES", "ESP", "Spain",           "spain",          True,  "ESP", date(1999, 1, 1)),
    Country("CA", "CAN", "Canada",          "canada",         True,  "CAD"),
    Country("AU", "AUS", "Australia",       "australia",      True,  "AUD"),
    Country("KR", "KOR", "South Korea",     "south-korea",    True,  "KRW"),
    Country("CH", "CHE", "Switzerland",     "switzerland",    True,  "CHF"),

    # Nordics
    Country("SE", "SWE", "Sweden",          "sweden",         True,  "SEK"),
    Country("NO", "NOR", "Norway",          "norway",         True,  "NOK"),
    Country("DK", "DNK", "Denmark",         "denmark",        True,  "DKK"),
    Country("FI", "FIN", "Finland",         "finland",        True,  "FIM", date(1999, 1, 1)),
    Country("IS", "ISL", "Iceland",         "iceland",        True,  "ISK"),

    # Other Eurozone
    Country("NL", "NLD", "Netherlands",     "netherlands",    True,  "NLG", date(1999, 1, 1)),
    Country("BE", "BEL", "Belgium",         "belgium",        True,  "BEF", date(1999, 1, 1)),
    Country("AT", "AUT", "Austria",         "austria",        True,  "ATS", date(1999, 1, 1)),
    Country("PT", "PRT", "Portugal",        "portugal",       True,  "PTE", date(1999, 1, 1)),
    Country("IE", "IRL", "Ireland",         "ireland",        True,  "IEP", date(1999, 1, 1)),
    Country("GR", "GRC", "Greece",          "greece",         True,  "GRD", date(2001, 1, 1)),
    Country("LU", "LUX", "Luxembourg",      "luxembourg",     True,  "LUF", date(1999, 1, 1)),
    Country("SI", "SVN", "Slovenia",        "slovenia",       True,  "SIT", date(2007, 1, 1)),
    Country("SK", "SVK", "Slovakia",        "slovakia",       True,  "SKK", date(2009, 1, 1)),
    Country("EE", "EST", "Estonia",         "estonia",        False, "EEK", date(2011, 1, 1)),
    Country("LV", "LVA", "Latvia",          "latvia",         False, "LVL", date(2014, 1, 1)),
    Country("LT", "LTU", "Lithuania",       "lithuania",      False, "LTL", date(2015, 1, 1)),
    Country("CY", "CYP", "Cyprus",          "cyprus",         False, "CYP", date(2008, 1, 1)),
    Country("MT", "MLT", "Malta",           "malta",          False, "MTL", date(2008, 1, 1)),
    Country("HR", "HRV", "Croatia",         "croatia",        False, "HRK", date(2023, 1, 1)),

    # Other advanced
    Country("CZ", "CZE", "Czechia",         "czech-republic", True,  "CZK"),
    Country("IL", "ISR", "Israel",          "israel",         True,  "ILS"),
    Country("NZ", "NZL", "New Zealand",     "new-zealand",    True,  "NZD"),
    Country("BG", "BGR", "Bulgaria",        "bulgaria",       False, "BGN"),
    Country("SG", "SGP", "Singapore",       "singapore",      False, "SGD"),
    Country("HK", "HKG", "Hong Kong",       "hong-kong",      False, "HKD"),
    Country("TW", "TWN", "Taiwan",          "taiwan",         False, "TWD"),

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
