"""
fundamentals_keyed.py
---------------------
Cloud-safe fundamentals via the Finnhub API (keyed → not subject to Yahoo's
datacenter-IP blocking that empties yfinance's .info on hosted servers).

Returns a dict with the SAME keys as shock_dashboard.get_ticker_info(), so the
valuation strip, hero, and Industry tab consume it unchanged.

Source: Finnhub free tier
  * /stock/metric  → market cap, EV, P/E, fwd P/E, P/S, P/B, margins, ROE,
                     growth, EPS, 52-week, beta, D/E, current/quick ratio
  * /quote         → current price
  * /stock/profile2 → name, industry, exchange, currency

Free tier does NOT include analyst price targets or buy/sell consensus, so
targetMeanPrice / recommendation stay None (those cards show "—").

Key: st.secrets["FINNHUB_API_KEY"] or env FINNHUB_API_KEY.
"""

from __future__ import annotations

import os

import requests

try:
    import streamlit as st
except Exception:
    st = None

FINNHUB_BASE = "https://finnhub.io/api/v1"


def finnhub_key() -> str | None:
    if st is not None:
        try:
            if "FINNHUB_API_KEY" in st.secrets:
                return st.secrets["FINNHUB_API_KEY"]
        except Exception:
            pass
    return os.environ.get("FINNHUB_API_KEY")


def _cache(ttl):
    if st is not None:
        return st.cache_data(show_spinner=False, ttl=ttl)
    def deco(fn):
        return fn
    return deco


@_cache(ttl=60 * 60 * 4)
def _fh(path: str, api_key: str, **params) -> dict:
    params["token"] = api_key
    try:
        r = requests.get(f"{FINNHUB_BASE}/{path}", params=params, timeout=20)
        r.raise_for_status()
        data = r.json()
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _f(v):
    try:
        f = float(v)
        return f if f == f else None   # drop NaN
    except (TypeError, ValueError):
        return None


def _pct(v):
    """Finnhub margins/growth/ROE come in percent → convert to a fraction."""
    f = _f(v)
    return f / 100.0 if f is not None else None


def build_info_keyed(ticker: str) -> dict:
    """Build the get_ticker_info-shaped dict from Finnhub. {} if unavailable."""
    key = finnhub_key()
    if not key:
        return {}
    ticker = ticker.upper().strip()
    metric = (_fh("stock/metric", key, symbol=ticker, metric="all") or {}).get("metric", {})
    quote = _fh("quote", key, symbol=ticker)
    profile = _fh("stock/profile2", key, symbol=ticker)
    if not metric and not quote:
        return {}

    price = _f(quote.get("c"))
    mc = _f(metric.get("marketCapitalization"))
    market_cap = mc * 1e6 if mc is not None else None
    ev_m = _f(metric.get("enterpriseValue"))
    enterprise_value = ev_m * 1e6 if ev_m is not None else None

    ps = _f(metric.get("psTTM"))
    revenue = (market_cap / ps) if (market_cap and ps) else None
    op_margin = _pct(metric.get("operatingMarginTTM"))
    ebit = (op_margin * revenue) if (op_margin is not None and revenue) else None
    ev_to_ebitda = (enterprise_value / ebit) if (enterprise_value and ebit and ebit > 0) else None
    ev_to_rev = (enterprise_value / revenue) if (enterprise_value and revenue) else None

    pe = _f(metric.get("peTTM"))
    fwd_pe = _f(metric.get("forwardPE"))
    eps_growth_pct = _f(metric.get("epsGrowthTTMYoy"))
    peg = (pe / eps_growth_pct) if (pe and eps_growth_pct and eps_growth_pct > 0) else None
    pb = _f(metric.get("pbQuarterly")) or _f(metric.get("pbAnnual"))
    fwd_eps = (price / fwd_pe) if (price and fwd_pe) else None
    de = _f(metric.get("totalDebt/totalEquityQuarterly"))
    if de is None:
        de = _f(metric.get("totalDebt/totalEquityAnnual"))
    debt_to_equity = de * 100 if de is not None else None  # match yfinance scale

    industry = profile.get("finnhubIndustry")

    return {
        # Identity
        "longBusinessSummary": None,
        "marketCap":       market_cap,
        "enterpriseValue": enterprise_value,
        "sector":          industry,        # Finnhub gives one industry field
        "industry":        industry,
        "longName":        profile.get("name") or ticker,
        "exchange":        profile.get("exchange"),
        "currency":        profile.get("currency", "USD"),
        "currentPrice":    price,
        # Valuation
        "trailingPE":   pe,
        "forwardPE":    fwd_pe,
        "pegRatio":     peg,
        "priceToBook":  pb,
        "priceToSales": ps,
        "evToEbitda":   ev_to_ebitda,
        "evToRevenue":  ev_to_rev,
        # EPS
        "trailingEps":   _f(metric.get("epsTTM")),
        "forwardEps":    fwd_eps,
        "epsCurrentYear": None,
        # Growth
        "revenueGrowth":          _pct(metric.get("revenueGrowthTTMYoy")),
        "earningsGrowth":         _pct(metric.get("epsGrowthTTMYoy")),
        "earningsQuarterlyGrowth": _pct(metric.get("epsGrowthQuarterlyYoy")),
        # Profitability
        "grossMargins":     _pct(metric.get("grossMarginTTM")),
        "operatingMargins": op_margin,
        "profitMargins":    _pct(metric.get("netProfitMarginTTM")),
        "ebitdaMargins":    _pct(metric.get("ebitdaMarginTTM")),
        "returnOnEquity":   _pct(metric.get("roeTTM")),
        "returnOnAssets":   _pct(metric.get("roaTTM")),
        # Balance sheet
        "debtToEquity": debt_to_equity,
        "currentRatio": _f(metric.get("currentRatioQuarterly")) or _f(metric.get("currentRatioAnnual")),
        "quickRatio":   _f(metric.get("quickRatioQuarterly")) or _f(metric.get("quickRatioAnnual")),
        # Dividend
        "dividendYield": _pct(metric.get("currentDividendYieldTTM")),
        "payoutRatio":   _pct(metric.get("payoutRatioTTM")),
        # Technical / market
        "fiftyTwoWeekHigh":    _f(metric.get("52WeekHigh")),
        "fiftyTwoWeekLow":     _f(metric.get("52WeekLow")),
        "fiftyDayAverage":     None,
        "twoHundredDayAverage": None,
        "beta":                _f(metric.get("beta")),
        "weekChange52":        _pct(metric.get("52WeekPriceReturnDaily")),
        # Short interest — not on Finnhub free tier (premium endpoint)
        "shortPercentOfFloat": None,
        "shortRatio":          None,
        # Analyst consensus — NOT on Finnhub free tier
        "targetMeanPrice":          None,
        "targetHighPrice":          None,
        "targetLowPrice":           None,
        "numberOfAnalystOpinions":  None,
        "recommendationKey":        None,
        "averageAnalystRating":     None,
        "_source": "finnhub",
    }
