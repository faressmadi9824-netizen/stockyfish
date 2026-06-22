"""
macro_data.py
-------------
Macro-economics data layer for the dashboard's "Macro Economics" tab.

Builds, for the G7:
  * Government bond yield curves at the standard tenor grid
    (3M, 1Y, 2Y, 3Y, 5Y, 10Y), interpolated from each country's reported
    points and flagged reported-vs-interpolated.
  * A GDP-weighted "global" curve across the G7 (weights from IMF GDP),
    re-normalised per tenor over the countries that have a value.
  * Historical GDP and forward-looking real GDP growth (IMF WEO).

All sources are government / official:
  * U.S. Treasury constant-maturity yields .......... via FRED (U.S. Federal Reserve)
  * G7 3-month & 10-year anchors .................... via FRED (OECD/national, U.S. Fed)
  * Canada benchmark bond curve .................... Bank of Canada (Valet API)
  * GDP level + real growth (history + projections) . IMF World Economic Outlook

FRED needs a free API key (st.secrets["FRED_API_KEY"] or env FRED_API_KEY).
With no key the tab runs on a bundled DEMO snapshot so it still renders.
"""

from __future__ import annotations

import os
from datetime import date

import numpy as np
import requests

try:
    import streamlit as st
except Exception:  # allows offline unit testing without streamlit runtime
    st = None

FRED_BASE = "https://api.stlouisfed.org/fred"
IMF_BASE = "https://www.imf.org/external/datamapper/api/v1"
BOC_BASE = "https://www.bankofcanada.ca/valet"

# Standard tenor grid: (label, years)
TENORS = [("3M", 0.25), ("1Y", 1.0), ("2Y", 2.0), ("3Y", 3.0), ("5Y", 5.0), ("10Y", 10.0)]
TENOR_LABELS = [t[0] for t in TENORS]
TENOR_YEARS = [t[1] for t in TENORS]

# G7: code -> (display name, IMF ISO3, FRED OECD country code)
G7 = {
    "US": ("United States", "USA", "USA"),
    "CA": ("Canada",        "CAN", "CAN"),
    "GB": ("United Kingdom", "GBR", "GBR"),
    "DE": ("Germany",       "DEU", "DEU"),
    "FR": ("France",        "FRA", "FRA"),
    "IT": ("Italy",         "ITA", "ITA"),
    "JP": ("Japan",         "JPN", "JPN"),
}

# FRED series for the full U.S. constant-maturity curve (daily).
US_FRED_SERIES = {0.25: "DGS3MO", 1.0: "DGS1", 2.0: "DGS2",
                  3.0: "DGS3", 5.0: "DGS5", 10.0: "DGS10"}

SOURCES = [
    {"label": "U.S. Department of the Treasury / FRED (Federal Reserve)",
     "url": "https://fred.stlouisfed.org/", "use": "U.S. constant-maturity yields (3M–10Y)"},
    {"label": "European Central Bank (Data Portal)",
     "url": "https://data.ecb.europa.eu/", "use": "Germany/France/Italy 10Y (convergence) + euro 3-month"},
    {"label": "OECD via FRED (U.S. Federal Reserve)",
     "url": "https://fred.stlouisfed.org/", "use": "Japan & United Kingdom 10-year yields"},
    {"label": "Bank of Canada (Valet API)",
     "url": "https://www.bankofcanada.ca/valet/", "use": "Canada benchmark bond curve (2Y–10Y)"},
    {"label": "IMF World Economic Outlook",
     "url": "https://www.imf.org/external/datamapper/", "use": "GDP level, history & projected growth"},
]

ECB_BASE = "https://data-api.ecb.europa.eu/service/data"
# ECB long-term (10Y) interest rate for convergence, per euro-area country.
ECB_10Y = {"DE": "DE", "FR": "FR", "IT": "IT"}
ECB_EURO_3M_KEY = "M.U2.EUR.RT.MM.EURIBOR3MD_.HSTA"
# FRED OECD 10-year series that are still current for these countries.
FRED_10Y = {"JP": "IRLTLT01JPM156N", "GB": "IRLTLT01GBM156N"}


# ---------------------------------------------------------------------------
# Key handling
# ---------------------------------------------------------------------------
def fred_key() -> str | None:
    if st is not None:
        try:
            if "FRED_API_KEY" in st.secrets:
                return st.secrets["FRED_API_KEY"]
        except Exception:
            pass
    return os.environ.get("FRED_API_KEY")


def _cache(ttl):
    """Use st.cache_data when available, else a no-op decorator (offline tests)."""
    if st is not None:
        return st.cache_data(show_spinner=False, ttl=ttl)
    def deco(fn):
        return fn
    return deco


# ---------------------------------------------------------------------------
# Source clients
# ---------------------------------------------------------------------------
@_cache(ttl=60 * 60 * 6)
def _fred_latest(series_id: str, api_key: str) -> float | None:
    """Most recent numeric observation for a FRED series."""
    try:
        r = requests.get(f"{FRED_BASE}/series/observations", timeout=20, params={
            "series_id": series_id, "api_key": api_key, "file_type": "json",
            "sort_order": "desc", "limit": 8})
        r.raise_for_status()
        for obs in r.json().get("observations", []):
            v = obs.get("value")
            if v not in (None, "", "."):
                try:
                    return float(v)
                except ValueError:
                    continue
    except Exception:
        pass
    return None


@_cache(ttl=60 * 60 * 6)
def _boc_canada_curve() -> dict:
    """Canada benchmark bond yields by tenor-years (Bank of Canada, no key)."""
    out: dict = {}
    label_to_years = {"2 year": 2.0, "3 year": 3.0, "5 year": 5.0,
                      "7 year": 7.0, "10 year": 10.0}
    try:
        r = requests.get(f"{BOC_BASE}/observations/group/bond_yields_benchmark/json",
                         params={"recent": 1}, timeout=20)
        r.raise_for_status()
        data = r.json()
        detail = data.get("seriesDetail", {})
        obs = (data.get("observations") or [{}])[0]
        for sid, meta in detail.items():
            yrs = label_to_years.get(meta.get("label"))
            if yrs and sid in obs:
                try:
                    out[yrs] = float(obs[sid]["v"])
                except (ValueError, KeyError, TypeError):
                    continue
    except Exception:
        pass
    return out


@_cache(ttl=60 * 60 * 6)
def _ecb_latest(flow: str, key: str) -> float | None:
    """Latest OBS_VALUE for an ECB Data Portal series (CSV), no key needed."""
    try:
        r = requests.get(f"{ECB_BASE}/{flow}/{key}", timeout=20,
                         params={"lastNObservations": 1, "format": "csvdata"})
        r.raise_for_status()
        lines = [ln for ln in r.text.splitlines() if ln.strip()]
        if len(lines) < 2:
            return None
        header = lines[0].split(",")
        idx = header.index("OBS_VALUE")
        return float(lines[-1].split(",")[idx])
    except Exception:
        return None


@_cache(ttl=60 * 60 * 12)
def _imf_indicator(indicator: str) -> dict:
    """{iso3: {year(int): value(float)}} for the G7 from IMF WEO."""
    isos = [v[1] for v in G7.values()]
    out: dict = {}
    try:
        r = requests.get(f"{IMF_BASE}/{indicator}/" + "/".join(isos), timeout=25)
        r.raise_for_status()
        block = (r.json().get("values", {}) or {}).get(indicator, {})
        for iso in isos:
            series = block.get(iso, {})
            out[iso] = {int(y): float(v) for y, v in series.items()
                        if v is not None}
    except Exception:
        pass
    return out


# ---------------------------------------------------------------------------
# Historical rates + recession periods (US, via FRED)
# ---------------------------------------------------------------------------
@_cache(ttl=60 * 60 * 24)
def _fred_series_monthly(series_id: str, api_key: str) -> list:
    """Full monthly history [(date_str, value)] for a FRED series."""
    out = []
    try:
        r = requests.get(f"{FRED_BASE}/series/observations", timeout=30, params={
            "series_id": series_id, "api_key": api_key, "file_type": "json",
            "frequency": "m", "sort_order": "asc"})
        r.raise_for_status()
        for obs in r.json().get("observations", []):
            v = obs.get("value")
            if v not in (None, "", "."):
                try:
                    out.append((obs["date"], float(v)))
                except ValueError:
                    continue
    except Exception:
        pass
    return out


def _recession_intervals(flags: list) -> list:
    """Collapse monthly 0/1 recession flags into [{start, end}] intervals."""
    intervals, start, prev = [], None, None
    for d, v in flags:
        if v >= 0.5 and start is None:
            start = d
        elif v < 0.5 and start is not None:
            intervals.append({"start": start, "end": prev})
            start = None
        prev = d
    if start is not None:
        intervals.append({"start": start, "end": prev})
    return intervals


@_cache(ttl=60 * 60 * 24)
def _us_rate_history(api_key: str) -> dict:
    """US monthly yield history across all tenors + NBER recession intervals."""
    by_tenor = {lbl: dict(_fred_series_monthly(US_FRED_SERIES[yrs], api_key))
                for lbl, yrs in TENORS}
    all_dates = sorted(set().union(*[set(s) for s in by_tenor.values()])) \
        if any(by_tenor.values()) else []
    series = []
    for d in all_dates:
        vals = {lbl: round(by_tenor[lbl][d], 3) for lbl, _ in TENORS if d in by_tenor[lbl]}
        if vals:
            series.append({"d": d, "vals": vals})
    recessions = _recession_intervals(_fred_series_monthly("USREC", api_key))
    return {"country": "US", "name": "United States", "tenors": TENOR_LABELS,
            "series": series, "recessions": recessions}


# ---------------------------------------------------------------------------
# Curve assembly + interpolation
# ---------------------------------------------------------------------------
def interpolate_curve(points: dict[float, float]) -> list[dict]:
    """Given {tenor_years: yield} reported points, return the standard grid with
    each tenor flagged reported vs interpolated. No extrapolation beyond the
    reported min/max tenor (those tenors are left out)."""
    pts = {float(k): float(v) for k, v in points.items() if v is not None}
    rows = []
    if len(pts) < 2:
        # Not enough to interpolate; emit only the reported points on-grid.
        for lbl, yrs in TENORS:
            if yrs in pts:
                rows.append({"tenor": lbl, "years": yrs, "y": round(pts[yrs], 3),
                             "interp": False})
        return rows
    xs = sorted(pts)
    ys = [pts[x] for x in xs]
    lo, hi = xs[0], xs[-1]
    for lbl, yrs in TENORS:
        if yrs < lo or yrs > hi:
            continue  # don't fabricate outside the reported range
        if yrs in pts:
            rows.append({"tenor": lbl, "years": yrs, "y": round(pts[yrs], 3),
                         "interp": False})
        else:
            yi = float(np.interp(yrs, xs, ys))
            rows.append({"tenor": lbl, "years": yrs, "y": round(yi, 3),
                         "interp": True})
    return rows


def _country_points(code: str, api_key: str | None) -> tuple[dict, str]:
    """Reported (tenor_years -> yield) points for a country + a source label,
    each from that country's official issuer where available."""
    name, iso, cc = G7[code]
    pts: dict = {}
    src = []

    if code == "US" and api_key:
        for yrs, sid in US_FRED_SERIES.items():
            v = _fred_latest(sid, api_key)
            if v is not None:
                pts[yrs] = v
        if pts:
            src.append("U.S. Treasury/FRED")

    elif code in ECB_10Y:                      # Germany, France, Italy
        v10 = _ecb_latest("IRS", f"M.{ECB_10Y[code]}.L.L40.CI.0000.EUR.N.Z")
        if v10 is not None:
            pts[10.0] = v10
            src.append("ECB convergence 10Y")
        v3 = _ecb_latest("FM", ECB_EURO_3M_KEY)   # euro-area short-end anchor
        if v3 is not None:
            pts[0.25] = v3
            src.append("ECB euro 3M")

    elif code in FRED_10Y and api_key:          # Japan, United Kingdom
        v10 = _fred_latest(FRED_10Y[code], api_key)
        if v10 is not None:
            pts[10.0] = v10
            src.append("OECD/FRED 10Y")
        v3 = _fred_latest(f"IR3TIB01{cc}M156N", api_key)  # best-effort 3M
        if v3 is not None:
            pts[0.25] = v3
            src.append("FRED 3M")

    if code == "CA":
        boc = _boc_canada_curve()              # real 2/3/5/7/10Y curve
        if boc:
            pts.update(boc)
            src.append("Bank of Canada")

    return pts, " · ".join(src) if src else "—"


# ---------------------------------------------------------------------------
# Payload builder
# ---------------------------------------------------------------------------
def to_js_macro(demo: bool | None = None) -> dict:
    """Build the window.macro payload."""
    api_key = fred_key()
    if demo is None:
        demo = not api_key

    if demo:
        return _demo_macro()

    countries = []
    curves_by_code = {}
    for code in G7:
        name, iso, cc = G7[code]
        pts, src = _country_points(code, api_key)
        curve = interpolate_curve(pts)
        curves_by_code[code] = {r["tenor"]: r["y"] for r in curve}
        countries.append({"code": code, "name": name, "source": src, "curve": curve})

    gdp_levels = _imf_indicator("PPPGDP")      # GDP at PPP (weights + display)
    growth = _imf_indicator("NGDP_RPCH")       # real GDP growth %, hist + projections

    # GDP weights from the latest available actual year (PPP basis)
    weights = _gdp_weights(gdp_levels)
    global_curve = _global_curve(curves_by_code, weights)

    gdp = _gdp_block(gdp_levels, growth)
    history = _us_rate_history(api_key)

    return {
        "asOf": date.today().isoformat(),
        "tenors": TENOR_LABELS,
        "gdpBasis": "PPP",
        "countries": countries,
        "global": {"source": "PPP-GDP-weighted across G7 (IMF)",
                   "weights": {k: round(v, 4) for k, v in weights.items()},
                   "curve": global_curve},
        "gdp": gdp,
        "history": history,
        "sources": SOURCES,
        "demo": False,
    }


def _gdp_weights(gdp_levels: dict) -> dict:
    """Normalised GDP weights per G7 country from the latest common actual year."""
    latest = {}
    for code, (_, iso, _) in G7.items():
        series = gdp_levels.get(iso, {})
        if series:
            yr = max(series)
            latest[code] = series[yr]
    total = sum(latest.values())
    if total <= 0:
        return {code: 1 / len(G7) for code in G7}
    return {code: v / total for code, v in latest.items()}


def _global_curve(curves_by_code: dict, weights: dict) -> list[dict]:
    """GDP-weighted yield per tenor, re-normalising weights over the countries
    that actually have a value at that tenor."""
    rows = []
    for lbl in TENOR_LABELS:
        num, wsum, n = 0.0, 0.0, 0
        for code, curve in curves_by_code.items():
            y = curve.get(lbl)
            w = weights.get(code, 0)
            if y is not None and w > 0:
                num += y * w
                wsum += w
                n += 1
        if wsum > 0:
            rows.append({"tenor": lbl, "y": round(num / wsum, 3), "coverage": n})
    return rows


def _gdp_block(gdp_levels: dict, growth: dict) -> list[dict]:
    """Per-country GDP history (USD) + real growth, flagging projection years."""
    cur_year = date.today().year
    out = []
    for code, (name, iso, _) in G7.items():
        lvl = gdp_levels.get(iso, {})
        grw = growth.get(iso, {})
        years = sorted(set(lvl) | set(grw))
        hist_years = [y for y in years if 2000 <= y <= cur_year + 6]
        series = [{"year": y,
                   "gdp": round(lvl[y], 1) if y in lvl else None,
                   "growth": round(grw[y], 2) if y in grw else None,
                   "proj": y >= cur_year}
                  for y in hist_years]
        out.append({"code": code, "name": name, "series": series})
    return out


# ---------------------------------------------------------------------------
# Demo snapshot (used when no FRED key) — representative recent values
# ---------------------------------------------------------------------------
def _demo_macro() -> dict:
    # Reported points per country (tenor_years -> yield %); gaps get interpolated.
    demo_pts = {
        "US": {0.25: 4.32, 1.0: 4.10, 2.0: 3.95, 3.0: 3.92, 5.0: 4.02, 10.0: 4.35},
        "CA": {0.25: 2.85, 2.0: 2.92, 3.0: 3.01, 5.0: 3.20, 10.0: 3.53},
        "GB": {0.25: 4.45, 10.0: 4.55},
        "DE": {0.25: 2.05, 10.0: 2.55},
        "FR": {0.25: 2.20, 10.0: 3.15},
        "IT": {0.25: 2.30, 10.0: 3.75},
        "JP": {0.25: 0.45, 10.0: 1.55},
    }
    demo_src = {"US": "U.S. Treasury/FRED (demo)", "CA": "Bank of Canada (demo)"}
    countries, curves_by_code = [], {}
    for code, (name, iso, cc) in G7.items():
        curve = interpolate_curve(demo_pts[code])
        curves_by_code[code] = {r["tenor"]: r["y"] for r in curve}
        countries.append({"code": code, "name": name,
                          "source": demo_src.get(code, "OECD/FRED (demo)"),
                          "curve": curve})
    # Demo GDP (current USD, $bn) and real growth %, incl. projection flag
    demo_gdp = {
        "US": (29000, [2.9, 2.8, 2.5, 1.9, 2.0, 2.0]),
        "CA": (2240, [1.1, 1.5, 1.7, 1.5, 1.9, 1.7]),
        "GB": (3600, [0.3, 1.1, 1.2, 1.3, 1.4, 1.5]),
        "DE": (4700, [-0.3, -0.2, 0.2, 0.8, 1.2, 1.1]),
        "FR": (3200, [1.1, 1.1, 0.9, 0.9, 1.2, 1.2]),
        "IT": (2400, [0.7, 0.5, 0.5, 0.5, 0.8, 0.7]),
        "JP": (4100, [1.7, 0.1, 1.2, 0.7, 0.6, 0.6]),
    }
    cur_year = date.today().year
    gdp_levels = {G7[c][1]: {cur_year: v[0]} for c, v in demo_gdp.items()}
    weights = _gdp_weights(gdp_levels)
    years = list(range(cur_year - 2, cur_year + 4))
    gdp = []
    for code, (name, iso, _) in G7.items():
        base, growths = demo_gdp[code]
        series = [{"year": y, "gdp": round(base * (1 + 0.02 * i), 1),
                   "growth": growths[i] if i < len(growths) else None,
                   "proj": y >= cur_year}
                  for i, y in enumerate(years)]
        gdp.append({"code": code, "name": name, "series": series})
    return {
        "asOf": date.today().isoformat(),
        "tenors": TENOR_LABELS,
        "gdpBasis": "PPP",
        "countries": countries,
        "global": {"source": "PPP-GDP-weighted across G7 (IMF) — demo",
                   "weights": {k: round(v, 4) for k, v in weights.items()},
                   "curve": _global_curve(curves_by_code, weights)},
        "gdp": gdp,
        "history": _demo_history(),
        "sources": SOURCES,
        "demo": True,
    }


def _demo_history() -> dict:
    """Compact synthetic US rate history (2004→now) with two recession bands."""
    import math as _m
    series = []
    y0 = 2004
    months = (date.today().year - y0) * 12 + date.today().month
    for k in range(0, months, 1):
        yr = y0 + k // 12
        mo = k % 12 + 1
        t = k / 12.0
        base = 3.0 + 1.6 * _m.sin(t / 2.2) - 0.04 * t  # slow cycle
        recdip = -2.6 if (2008 <= yr <= 2009) else (-1.8 if yr == 2020 else 0)
        vals = {}
        for lbl, yrs in TENORS:
            slope = (yrs ** 0.5) * 0.32          # upward slope by tenor
            v = max(0.05, base + slope + recdip * (0.6 if yrs < 2 else 0.3))
            vals[lbl] = round(v, 3)
        series.append({"d": f"{yr}-{mo:02d}-01", "vals": vals})
    recessions = [{"start": "2008-01-01", "end": "2009-06-01"},
                  {"start": "2020-03-01", "end": "2020-04-01"}]
    return {"country": "US", "name": "United States", "tenors": TENOR_LABELS,
            "series": series, "recessions": recessions}
