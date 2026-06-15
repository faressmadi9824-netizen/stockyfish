"""
quant_signals.py
----------------
Quantitative alpha signals layered on top of the shock/deviation model:

  1. vol_regime()           — VIX term structure (VIX9D / VIX / VIX3M),
                              variance risk premium (VIX vs realized SPY vol),
                              contango/backwardation regime classification.
  2. momentum_signals()     — vol-adjusted momentum (1M/3M/6M/12M-1M) as
                              z-scores vs the stock's own history, plus
                              200DMA distance, RSI(14), composite score.
  3. ewma_vol()             — RiskMetrics EWMA (λ=0.94) vol forecast vs
                              21d realized, with vol-target position sizing.
  4. fetch_atm_iv()         — ~30d ATM implied vol from the option chain,
                              compared to realized → IV/RV ratio.
  5. fetch_fundamental_history() — annual + quarterly-TTM revenue, net
                              income, diluted EPS, ROE for the price-vs-
                              fundamentals overlay chart.

All functions return JSON-safe dicts (NaN/inf → None) ready for the
embedded design's window.* globals.
"""

from __future__ import annotations

import math
import re
from datetime import date

import numpy as np
import pandas as pd
import requests
import streamlit as st
import yfinance as yf

TRADING_DAYS = 252

_SEC_HEADERS = {"User-Agent": "Valuation Research tool contact@valuationresearch.com"}


def _safe(v):
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    if math.isnan(f) or math.isinf(f):
        return None
    return f


def _safe_list(s: pd.Series) -> list:
    return [_safe(v) for v in s.values]


# ---------------------------------------------------------------------------
# 1. Volatility regime — term structure + variance risk premium
# ---------------------------------------------------------------------------
def vol_regime(prices: pd.DataFrame) -> dict:
    """Market-level vol regime panel. Needs ^VIX, SPY; ^VIX9D/^VIX3M optional."""
    if "^VIX" not in prices.columns or "SPY" not in prices.columns:
        return {}

    vix = prices["^VIX"].dropna()
    spy_ret = prices["SPY"].dropna().pct_change()
    realized = spy_ret.rolling(21).std() * math.sqrt(TRADING_DAYS) * 100  # vol points

    idx = vix.index.intersection(realized.dropna().index)
    vix = vix.reindex(idx)
    realized = realized.reindex(idx)
    vrp = vix - realized  # variance risk premium proxy (vol points)

    vix9d = prices["^VIX9D"].reindex(idx) if "^VIX9D" in prices.columns else pd.Series(np.nan, index=idx)
    vix3m = prices["^VIX3M"].reindex(idx) if "^VIX3M" in prices.columns else pd.Series(np.nan, index=idx)
    slope = vix3m / vix  # > 1 → contango (calm), < 1 → backwardation (stress)

    cur_vix    = _safe(vix.iloc[-1])
    cur_vix9d  = _safe(vix9d.dropna().iloc[-1]) if not vix9d.dropna().empty else None
    cur_vix3m  = _safe(vix3m.dropna().iloc[-1]) if not vix3m.dropna().empty else None
    cur_slope  = _safe(slope.dropna().iloc[-1]) if not slope.dropna().empty else None
    cur_real   = _safe(realized.iloc[-1])
    cur_vrp    = _safe(vrp.iloc[-1])
    vix_pctile = _safe((vix < vix.iloc[-1]).mean()) if len(vix) else None
    vrp_pctile = _safe((vrp.dropna() < vrp.iloc[-1]).mean()) if vrp.dropna().size else None

    if cur_slope is None:
        regime = "UNKNOWN"
    elif cur_slope < 1.0:
        regime = "BACKWARDATION"
    elif cur_slope < 1.05:
        regime = "FLAT"
    else:
        regime = "CONTANGO"
    stress = bool(cur_vix is not None and cur_vix > 25)

    return {
        "dates":    [d.strftime("%Y-%m-%d") for d in idx],
        "vix":      _safe_list(vix),
        "vix3m":    _safe_list(vix3m),
        "realized": _safe_list(realized),
        "vrp":      _safe_list(vrp),
        "slope":    _safe_list(slope),
        "current": {
            "vix": cur_vix, "vix9d": cur_vix9d, "vix3m": cur_vix3m,
            "slope": cur_slope, "realized": cur_real, "vrp": cur_vrp,
            "vixPctile": vix_pctile, "vrpPctile": vrp_pctile,
            "regime": regime, "stress": stress,
        },
    }


# ---------------------------------------------------------------------------
# 2. Vol-adjusted momentum z-scores + technicals
# ---------------------------------------------------------------------------
_MOM_WINDOWS = {"1M": 21, "3M": 63, "6M": 126}


def momentum_signals(px: pd.Series) -> dict:
    """Cross-time momentum/technical snapshot, z-scored vs the stock's own history."""
    px = px.dropna()
    if len(px) < 300:
        return {}

    rets = px.pct_change()
    vol63 = (rets.rolling(63).std() * math.sqrt(TRADING_DAYS)).replace(0, np.nan)

    def zscore(series: pd.Series) -> tuple:
        s = series.dropna()
        if len(s) < 60 or s.std() == 0:
            return None, None
        return _safe(s.iloc[-1]), _safe((s.iloc[-1] - s.mean()) / s.std())

    signals = []
    for key, win in _MOM_WINDOWS.items():
        mom = px / px.shift(win) - 1
        va = mom / vol63  # vol-adjusted momentum
        raw, _ = zscore(mom)
        _, z = zscore(va)
        signals.append({"key": key, "raw": raw, "z": z})

    # 12M-1M (skip most recent month — classic momentum construction)
    mom12_1 = px.shift(21) / px.shift(252) - 1
    va12 = mom12_1 / vol63
    raw, _ = zscore(mom12_1)
    _, z = zscore(va12)
    signals.append({"key": "12M-1M", "raw": raw, "z": z})

    # Distance from 200DMA
    dist200 = px / px.rolling(200).mean() - 1
    d200_raw, d200_z = zscore(dist200)
    signals.append({"key": "vs 200DMA", "raw": d200_raw, "z": d200_z})

    # RSI(14), Wilder smoothing
    delta = px.diff()
    gain = delta.clip(lower=0).ewm(alpha=1 / 14, adjust=False).mean()
    loss = (-delta.clip(upper=0)).ewm(alpha=1 / 14, adjust=False).mean()
    rs = gain / loss.replace(0, np.nan)
    rsi = 100 - 100 / (1 + rs)
    cur_rsi = _safe(rsi.dropna().iloc[-1]) if not rsi.dropna().empty else None
    rsi_z = None if cur_rsi is None else _safe((cur_rsi - 50) / 10)  # pseudo-z
    signals.append({"key": "RSI(14)", "raw": None if cur_rsi is None else cur_rsi / 100, "z": rsi_z})

    zs = [s["z"] for s in signals if s["z"] is not None]
    composite = _safe(np.mean(zs)) if zs else None

    return {
        "signals":   signals,
        "rsi":       cur_rsi,
        "dist200":   d200_raw,
        "composite": composite,
    }


# ---------------------------------------------------------------------------
# 3. EWMA vol forecast + vol-target sizing
# ---------------------------------------------------------------------------
def ewma_vol(px: pd.Series, lam: float = 0.94, target_vol: float = 0.15,
             max_weight: float = 2.0) -> dict:
    px = px.dropna()
    rets = px.pct_change().dropna()
    if len(rets) < 100:
        return {}

    # RiskMetrics: σ²_t = λ σ²_{t-1} + (1−λ) r²_{t-1}
    ewma_var = rets.pow(2).ewm(alpha=1 - lam, adjust=False).mean()
    ewma_ann = np.sqrt(ewma_var * TRADING_DAYS)
    realized21 = rets.rolling(21).std() * math.sqrt(TRADING_DAYS)

    forecast = _safe(ewma_ann.iloc[-1])
    realized = _safe(realized21.dropna().iloc[-1]) if not realized21.dropna().empty else None
    ratio = _safe(forecast / realized) if (forecast and realized) else None
    weight = _safe(min(max_weight, target_vol / forecast)) if forecast else None

    idx = ewma_ann.index
    return {
        "dates":    [d.strftime("%Y-%m-%d") for d in idx],
        "ewma":     _safe_list(ewma_ann),
        "realized": _safe_list(realized21.reindex(idx)),
        "current": {
            "forecast": forecast, "realized": realized, "ratio": ratio,
            "lambda": lam, "targetVol": target_vol, "weight": weight,
            "maxWeight": max_weight,
        },
    }


# ---------------------------------------------------------------------------
# 4. ATM implied vol vs realized (option chain)
# ---------------------------------------------------------------------------
@st.cache_data(show_spinner=False, ttl=60 * 60)
def fetch_atm_iv(ticker: str) -> dict:
    """ATM IV from the expiry nearest ~30 DTE. Best-effort; {} on any failure."""
    try:
        tk = yf.Ticker(ticker)
        expiries = tk.options
        if not expiries:
            return {}
        today = date.today()
        scored = []
        for e in expiries:
            dte = (date.fromisoformat(e) - today).days
            if dte >= 7:
                scored.append((abs(dte - 30), dte, e))
        if not scored:
            return {}
        _, dte, expiry = min(scored)

        spot = tk.fast_info.last_price
        if not spot:
            return {}
        chain = tk.option_chain(expiry)

        ivs = []
        for df in (chain.calls, chain.puts):
            if df is None or df.empty or "impliedVolatility" not in df.columns:
                continue
            df = df.dropna(subset=["impliedVolatility"])
            df = df[df["impliedVolatility"] > 0.01]
            if df.empty:
                continue
            # average IV of the 3 strikes nearest spot
            nearest = df.iloc[(df["strike"] - spot).abs().argsort()[:3]]
            ivs.extend(nearest["impliedVolatility"].tolist())
        if not ivs:
            return {}
        iv = float(np.mean(ivs))

        hist = tk.history(period="3mo", auto_adjust=True)["Close"]
        rv = float(hist.pct_change().rolling(21).std().iloc[-1] * math.sqrt(TRADING_DAYS))

        return {
            "iv": _safe(iv), "rv": _safe(rv),
            "ratio": _safe(iv / rv) if rv else None,
            "expiry": expiry, "dte": int(dte), "spot": _safe(spot),
        }
    except Exception:
        return {}


# ---------------------------------------------------------------------------
# 5. Fundamental history — SEC EDGAR XBRL primary, yfinance fallback
# ---------------------------------------------------------------------------
_EQUITY_ROWS = ["Stockholders Equity", "Common Stock Equity",
                "Total Equity Gross Minority Interest"]

_METRIC_DEFS = {
    "revenue":     {"label": "Revenue",      "fmt": "money"},
    "netIncome":   {"label": "Net Income",   "fmt": "money"},
    "eps":         {"label": "Diluted EPS",  "fmt": "eps"},
    "roe":         {"label": "ROE",          "fmt": "pct"},
    "grossMargin": {"label": "Gross Margin", "fmt": "pct"},
    "netMargin":   {"label": "Net Margin",   "fmt": "pct"},
}

# us-gaap tag fallbacks, in priority order
_SEC_TAGS = {
    "revenue": ["RevenueFromContractWithCustomerExcludingAssessedTax",
                "RevenueFromContractWithCustomerIncludingAssessedTax",
                "Revenues", "SalesRevenueNet", "SalesRevenueGoodsNet"],
    "grossProfit": ["GrossProfit"],
    "costOfRevenue": ["CostOfRevenue", "CostOfGoodsAndServicesSold", "CostOfGoodsSold"],
    "netIncome": ["NetIncomeLoss", "ProfitLoss",
                  "NetIncomeLossAvailableToCommonStockholdersBasic"],
    "eps": ["EarningsPerShareDiluted", "EarningsPerShareBasicAndDiluted"],
    "equity": ["StockholdersEquity",
               "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"],
}


def _empty_metrics() -> dict:
    return {k: {"label": v["label"], "fmt": v["fmt"], "annual": [], "quarterly": []}
            for k, v in _METRIC_DEFS.items()}


@st.cache_data(show_spinner=False, ttl=60 * 60 * 24)
def _sec_cik(ticker: str) -> str | None:
    try:
        data = requests.get("https://www.sec.gov/files/company_tickers.json",
                            headers=_SEC_HEADERS, timeout=10).json()
        for entry in data.values():
            if entry["ticker"].upper() == ticker.upper():
                return str(entry["cik_str"]).zfill(10)
    except Exception:
        pass
    return None


@st.cache_data(show_spinner=False, ttl=60 * 60 * 12)
def _sec_companyfacts(cik10: str) -> dict:
    try:
        return requests.get(
            f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik10}.json",
            headers=_SEC_HEADERS, timeout=20).json()
    except Exception:
        return {}


def _collect_durations(gaap: dict, tags: list) -> dict:
    """Merge duration facts across fallback tags. Key (start, end);
    higher-priority tags win; within a tag, latest filing wins."""
    out: dict = {}
    for tag in reversed(tags):                       # low priority first
        item = gaap.get(tag)
        if not item:
            continue
        for unit, entries in item.get("units", {}).items():
            if unit not in ("USD", "USD/shares"):
                continue
            for e in entries:
                if e.get("val") is None or not e.get("start") or not e.get("end"):
                    continue
                key = (e["start"], e["end"])
                cur = out.get(key)
                if cur is not None and cur["_tag"] == tag and \
                        cur.get("filed", "") >= e.get("filed", ""):
                    continue
                out[key] = {"start": e["start"], "end": e["end"],
                            "val": float(e["val"]), "filed": e.get("filed", ""),
                            "form": e.get("form", ""), "_tag": tag}
    return out


def _collect_instants(gaap: dict, tags: list) -> dict:
    """Instant (point-in-time) facts, keyed by end date, latest filing wins."""
    out: dict = {}
    for tag in reversed(tags):
        item = gaap.get(tag)
        if not item:
            continue
        for unit, entries in item.get("units", {}).items():
            if unit != "USD":
                continue
            for e in entries:
                if e.get("val") is None or not e.get("end") or e.get("start"):
                    continue
                key = e["end"]
                cur = out.get(key)
                if cur is not None and cur["_tag"] == tag and \
                        cur.get("filed", "") >= e.get("filed", ""):
                    continue
                out[key] = {"end": key, "val": float(e["val"]),
                            "filed": e.get("filed", ""), "_tag": tag}
    return out


def _days(a: str, b: str) -> int:
    return (date.fromisoformat(b) - date.fromisoformat(a)).days


def _split_periods(durations: dict) -> tuple[dict, dict]:
    """Split duration facts into annual (~1y) and quarterly (~3m), keyed by
    end date (latest filing wins), then derive missing Q4 = FY − (Q1+Q2+Q3)."""
    annual: dict = {}
    quarterly: dict = {}
    for (start, end), e in durations.items():
        try:
            d = _days(start, end)
        except Exception:
            continue
        bucket = annual if 320 <= d <= 400 else (quarterly if 60 <= d <= 120 else None)
        if bucket is None:
            continue
        cur = bucket.get(end)
        if cur is None or e.get("filed", "") > cur.get("filed", ""):
            bucket[end] = e

    # Q4 derivation (most 10-K filers never report Q4 separately)
    for a_end, a in annual.items():
        if any(abs(_days(q_end, a_end)) <= 10 for q_end in quarterly):
            continue
        in_fy = [q for q_end, q in quarterly.items()
                 if a["start"] <= q["start"] and q_end <= a_end]
        if len(in_fy) == 3:
            q4 = a["val"] - sum(q["val"] for q in in_fy)
            quarterly[a_end] = {"start": max(q["end"] for q in in_fy),
                                "end": a_end, "val": q4,
                                "filed": a.get("filed", ""), "_tag": a["_tag"],
                                "derived": True}
    return annual, quarterly


def _points(period_map: dict, keep: int) -> list:
    pts = [{"d": end, "v": _safe(e["val"])} for end, e in sorted(period_map.items())]
    pts = [p for p in pts if p["v"] is not None]
    return pts[-keep:]


def fetch_sec_fundamental_history(ticker: str) -> dict:
    """Revenue / NI / EPS / ROE / margins from SEC XBRL companyfacts,
    as separate annual and quarterly series."""
    cik = _sec_cik(ticker)
    if not cik:
        return {}
    facts = _sec_companyfacts(cik)
    gaap = (facts.get("facts") or {}).get("us-gaap") or {}
    if not gaap:
        return {}

    rev_a, rev_q = _split_periods(_collect_durations(gaap, _SEC_TAGS["revenue"]))
    gp_a,  gp_q  = _split_periods(_collect_durations(gaap, _SEC_TAGS["grossProfit"]))
    cost_a, cost_q = _split_periods(_collect_durations(gaap, _SEC_TAGS["costOfRevenue"]))
    ni_a,  ni_q  = _split_periods(_collect_durations(gaap, _SEC_TAGS["netIncome"]))
    eps_a, eps_q = _split_periods(_collect_durations(gaap, _SEC_TAGS["eps"]))
    equity = _collect_instants(gaap, _SEC_TAGS["equity"])

    # Gross profit fallback: revenue − cost of revenue
    for (gp_map, r_map, c_map) in ((gp_a, rev_a, cost_a), (gp_q, rev_q, cost_q)):
        for end, c in c_map.items():
            if end not in gp_map and end in r_map:
                gp_map[end] = {"start": c["start"], "end": end,
                               "val": r_map[end]["val"] - c["val"],
                               "filed": c.get("filed", ""), "_tag": "derived"}

    out = _empty_metrics()
    N_A, N_Q = 12, 24
    out["revenue"]["annual"]      = _points(rev_a, N_A)
    out["revenue"]["quarterly"]   = _points(rev_q, N_Q)
    out["netIncome"]["annual"]    = _points(ni_a, N_A)
    out["netIncome"]["quarterly"] = _points(ni_q, N_Q)
    out["eps"]["annual"]          = _points(eps_a, N_A)
    out["eps"]["quarterly"]       = _points(eps_q, N_Q)

    def margins(num_map: dict, r_map: dict, keep: int) -> list:
        pts = []
        for end in sorted(num_map):
            r = r_map.get(end)
            if r and r["val"]:
                v = _safe(num_map[end]["val"] / r["val"])
                if v is not None:
                    pts.append({"d": end, "v": v})
        return pts[-keep:]

    out["grossMargin"]["annual"]    = margins(gp_a, rev_a, N_A)
    out["grossMargin"]["quarterly"] = margins(gp_q, rev_q, N_Q)
    out["netMargin"]["annual"]      = margins(ni_a, rev_a, N_A)
    out["netMargin"]["quarterly"]   = margins(ni_q, rev_q, N_Q)

    # ROE — annual: FY NI / FY-end equity; quarterly: TTM NI / quarter-end equity
    def nearest_equity(end: str):
        if end in equity:
            return equity[end]["val"]
        try:
            cands = [(abs(_days(k, end)), v["val"]) for k, v in equity.items()
                     if abs(_days(k, end)) <= 15]
        except Exception:
            return None
        return min(cands)[1] if cands else None

    roe_a = []
    for end in sorted(ni_a):
        eq = nearest_equity(end)
        if eq and eq > 0:
            v = _safe(ni_a[end]["val"] / eq)
            if v is not None:
                roe_a.append({"d": end, "v": v})
    out["roe"]["annual"] = roe_a[-N_A:]

    roe_q = []
    q_ends = sorted(ni_q)
    for i in range(3, len(q_ends)):
        window = q_ends[i - 3:i + 1]
        try:
            span = _days(window[0], window[-1])
        except Exception:
            continue
        if not (240 <= span <= 300):          # require 4 consecutive quarters
            continue
        eq = nearest_equity(window[-1])
        if eq and eq > 0:
            ttm_ni = sum(ni_q[e]["val"] for e in window)
            v = _safe(ttm_ni / eq)
            if v is not None:
                roe_q.append({"d": window[-1], "v": v})
    out["roe"]["quarterly"] = roe_q[-N_Q:]

    if not (out["revenue"]["annual"] or out["revenue"]["quarterly"]):
        return {}
    return {"source": "SEC EDGAR", "metrics": out}


def _row(df: pd.DataFrame, names) -> pd.Series | None:
    if df is None or df.empty:
        return None
    if isinstance(names, str):
        names = [names]
    for n in names:
        if n in df.index:
            s = df.loc[n].dropna()
            if not s.empty:
                s.index = pd.to_datetime(s.index)
                return s.sort_index()
    return None


def fetch_yf_fundamental_history(ticker: str) -> dict:
    """Fallback: yfinance statements (≈4 annual + ≈5 quarterly periods)."""
    try:
        tk = yf.Ticker(ticker)
        ais, qis = tk.income_stmt, tk.quarterly_income_stmt
        abs_, qbs = tk.balance_sheet, tk.quarterly_balance_sheet
    except Exception:
        return {}

    out = _empty_metrics()

    def pts(s: pd.Series | None) -> list:
        if s is None:
            return []
        return [{"d": dt.strftime("%Y-%m-%d"), "v": _safe(v)}
                for dt, v in s.items() if _safe(v) is not None]

    for basis, is_, bs in (("annual", ais, abs_), ("quarterly", qis, qbs)):
        rev = _row(is_, "Total Revenue")
        ni  = _row(is_, "Net Income")
        eps = _row(is_, "Diluted EPS")
        gp  = _row(is_, "Gross Profit")
        eq  = _row(bs, _EQUITY_ROWS)
        out["revenue"][basis]   = pts(rev)
        out["netIncome"][basis] = pts(ni)
        out["eps"][basis]       = pts(eps)
        if rev is not None and gp is not None:
            out["grossMargin"][basis] = pts((gp / rev).dropna())
        if rev is not None and ni is not None:
            out["netMargin"][basis] = pts((ni / rev).dropna())
        if ni is not None and eq is not None:
            if basis == "annual":
                roe = (ni / eq.reindex(ni.index)).dropna()
            else:
                ttm_ni = ni.rolling(4).sum()
                roe = (ttm_ni / eq.reindex(ttm_ni.index)).dropna()
            out["roe"][basis] = pts(roe[roe.abs() < 100])

    if not (out["revenue"]["annual"] or out["revenue"]["quarterly"]):
        return {}
    return {"source": "Yahoo Finance", "metrics": out}


@st.cache_data(show_spinner=False, ttl=60 * 60 * 12)
def fetch_fundamental_history(ticker: str) -> dict:
    """SEC EDGAR XBRL first (long history, true quarterly), yfinance fallback
    (covers non-SEC filers e.g. foreign listings)."""
    try:
        sec = fetch_sec_fundamental_history(ticker)
    except Exception:
        sec = {}
    if sec:
        return sec
    try:
        return fetch_yf_fundamental_history(ticker)
    except Exception:
        return {}


# ---------------------------------------------------------------------------
# 6. SEC filing sections — token-free qualitative research
# ---------------------------------------------------------------------------
_SECTION_CAP = 15000  # chars per section in the UI


def _strip_html(html: str) -> str:
    """HTML → text, preserving paragraph breaks from block-level tags."""
    html = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", " ", html)
    html = re.sub(r"(?i)</(p|div|tr|li|h\d|table)>", "\n", html)
    html = re.sub(r"(?i)<br[^>]*/?>", "\n", html)
    text = re.sub(r"<[^>]+>", " ", html)
    text = (text.replace("&nbsp;", " ").replace("&#160;", " ")
                .replace("&amp;", "&").replace("&#38;", "&")
                .replace("&#8217;", "'").replace("&#8220;", '"').replace("&#8221;", '"')
                .replace("&#8211;", "–").replace("&#8212;", "—").replace("&#8226;", "•"))
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r" ?\n ?", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _extract_item(text: str, start_pat: str, end_pat: str) -> str:
    """Slice an Item section out of a filing (full text, uncapped).

    Item headers appear both in the table of contents and at the section
    itself. A TOC match produces a slice that *contains* the real section
    header — so prefer the longest slice with no interior start-pattern
    match ('clean'); fall back to the longest slice overall."""
    cands = []
    for m in re.finditer(start_pat, text, re.IGNORECASE):
        s = m.end()
        # consume the remainder of the heading line ("…s Discussion and Analysis")
        nl = text.find("\n", s)
        if nl != -1 and (nl - s) < 150:
            s = nl
        m_end = re.search(end_pat, text[s:], re.IGNORECASE)
        seg = (text[s:s + m_end.start()] if m_end else text[s:]).strip()
        if len(seg) > 500:
            clean = re.search(start_pat, seg, re.IGNORECASE) is None
            cands.append((clean, len(seg), seg))
    if not cands:
        return ""
    clean_cands = [c for c in cands if c[0]]
    return max(clean_cands or cands, key=lambda c: c[1])[2]


def _cap_section(text: str) -> str:
    if len(text) > _SECTION_CAP:
        return text[:_SECTION_CAP].rsplit(" ", 1)[0] + \
            "\n\n[… truncated — full text in the filing on sec.gov]"
    return text


_AGENCY_PAT = re.compile(r"(moody'?s|standard\s*&\s*poor|s\s*&\s*p\b|fitch)", re.IGNORECASE)


def _extract_rating_mentions(texts: list) -> list:
    """Sentences mentioning a rating agency + 'rating'/'rated' — companies
    often disclose their credit ratings in the MD&A liquidity discussion."""
    found, seen = [], set()
    for src, text in texts:
        for s in _split_sentences(text):
            if len(s) < 40 or len(s) > 500:
                continue
            ls = s.lower()
            if _AGENCY_PAT.search(s) and ("rating" in ls or "rated" in ls):
                key = s[:80]
                if key in seen:
                    continue
                seen.add(key)
                found.append({"text": s, "src": src})
    return found[:6]


@st.cache_data(show_spinner=False, ttl=60 * 60 * 12)
def fetch_sec_filing_sections(ticker: str) -> dict:
    """Latest 10-K Items 1 / 1A / 7 + latest earnings 8-K from SEC EDGAR.
    Pure extraction — no LLM, no API tokens."""
    out = {"source": "SEC EDGAR", "filed10k": "", "filed8k": "",
           "sections": [], "ratingMentions": [], "error": None}
    _full_texts = []
    cik10 = _sec_cik(ticker)
    if not cik10:
        out["error"] = f"{ticker} not found in SEC EDGAR"
        return out
    cik = str(int(cik10))

    try:
        subs = requests.get(
            f"https://data.sec.gov/submissions/CIK{cik10}.json",
            headers=_SEC_HEADERS, timeout=15).json()
        recent = subs["filings"]["recent"]
        forms      = recent["form"]
        accessions = recent["accessionNumber"]
        dates      = recent["filingDate"]
        pri_docs   = recent.get("primaryDocument", [""] * len(forms))
        items_list = recent.get("items", [""] * len(forms))
    except Exception as exc:
        out["error"] = f"EDGAR index fetch failed: {exc}"
        return out

    def fetch_doc(acc: str, doc: str) -> str:
        url = (f"https://www.sec.gov/Archives/edgar/data/{cik}/"
               f"{acc.replace('-', '')}/{doc}")
        resp = requests.get(url, headers=_SEC_HEADERS, timeout=25)
        return _strip_html(resp.text)

    # --- latest 10-K: Business, Risk Factors, MD&A --------------------------
    try:
        for i, form in enumerate(forms):
            if form == "10-K" and pri_docs[i]:
                text = fetch_doc(accessions[i], pri_docs[i])
                out["filed10k"] = dates[i]
                for title, sp, ep in (
                    ("Business (10-K Item 1)",
                     r"Item\s*1\s*\.?\s*[—\-–:]?\s*Business",
                     r"Item\s*1A"),
                    ("Risk Factors (10-K Item 1A)",
                     r"Item\s*1A\s*\.?\s*[—\-–:]?\s*Risk\s+Factors",
                     r"Item\s*1B"),
                    ("Management's Discussion & Analysis (10-K Item 7)",
                     r"Item\s*7\s*\.?\s*[—\-–:]?\s*Management",
                     r"Item\s*7A|Item\s*8\s*\.?\s*[—\-–:]?\s*Financial\s+Statements"),
                ):
                    body = _extract_item(text, sp, ep)
                    if len(body) > 500:
                        _full_texts.append((title.split(" (")[0], body))
                        out["sections"].append({
                            "title": title,
                            "body": _cap_section(body),
                            "filed": dates[i],
                        })
                break
    except Exception as exc:
        out["error"] = f"10-K fetch failed: {exc}"

    # --- latest earnings 8-K -------------------------------------------------
    try:
        for i, form in enumerate(forms[:60]):
            if form == "8-K" and "2.02" in str(items_list[i]) and pri_docs[i]:
                text = fetch_doc(accessions[i], pri_docs[i])
                out["filed8k"] = dates[i]
                body = text[:_SECTION_CAP].strip()
                if len(body) > 300:
                    _full_texts.append(("8-K", text))
                    out["sections"].append({
                        "title": "Latest Earnings Release — 8-K",
                        "body": body,
                        "filed": dates[i],
                    })
                break
    except Exception:
        pass

    try:
        out["ratingMentions"] = _extract_rating_mentions(_full_texts)
    except Exception:
        pass

    return out


# ---------------------------------------------------------------------------
# 7. Credit quality — Altman Z + coverage/leverage from SEC XBRL
# ---------------------------------------------------------------------------
_CREDIT_INSTANT_TAGS = {
    "assets":      ["Assets"],
    "liabilities": ["Liabilities"],
    "curAssets":   ["AssetsCurrent"],
    "curLiab":     ["LiabilitiesCurrent"],
    "retained":    ["RetainedEarningsAccumulatedDeficit"],
    "cash":        ["CashAndCashEquivalentsAtCarryingValue"],
    "ltDebtNC":    ["LongTermDebtNoncurrent"],
    "ltDebtCur":   ["LongTermDebtCurrent"],
    "ltDebtTotal": ["LongTermDebt"],
    "stDebt":      ["ShortTermBorrowings", "CommercialPaper"],
}
_CREDIT_FLOW_TAGS = {
    "ebit":     ["OperatingIncomeLoss"],
    "interest": ["InterestExpense", "InterestExpenseNonoperating",
                 "InterestAndDebtExpense", "InterestExpenseDebt"],
    "da":       ["DepreciationDepletionAndAmortization",
                 "DepreciationAmortizationAndAccretionNet",
                 "DepreciationAndAmortization"],
    "sales":    _SEC_TAGS["revenue"],
}


def fetch_credit_metrics(ticker: str, market_cap: float | None) -> dict:
    """Altman Z-score, interest coverage, debt/EBITDA, net debt — computed
    from the same SEC XBRL companyfacts the fundamentals use.
    Balance-sheet items: latest reported instant; flows: latest fiscal year."""
    cik = _sec_cik(ticker)
    if not cik:
        return {}
    gaap = (_sec_companyfacts(cik).get("facts") or {}).get("us-gaap") or {}
    if not gaap:
        return {}

    inst, asof = {}, ""
    for key, tags in _CREDIT_INSTANT_TAGS.items():
        m = _collect_instants(gaap, tags)
        if m:
            end = max(m)
            inst[key] = m[end]["val"]
            if key == "assets":
                asof = end

    flow, fy_end = {}, ""
    for key, tags in _CREDIT_FLOW_TAGS.items():
        annual, _ = _split_periods(_collect_durations(gaap, tags))
        if annual:
            end = max(annual)
            flow[key] = annual[end]["val"]
            if key == "ebit":
                fy_end = end

    g = lambda d, k: d.get(k)

    # Total debt: prefer explicit noncurrent + current; else LongTermDebt total
    lt_nc, lt_cur, lt_tot = g(inst, "ltDebtNC"), g(inst, "ltDebtCur"), g(inst, "ltDebtTotal")
    if lt_nc is not None:
        debt = lt_nc + (lt_cur or 0)
    elif lt_tot is not None:
        debt = lt_tot
    else:
        debt = None
    if debt is not None and g(inst, "stDebt"):
        debt += inst["stDebt"]

    cash = g(inst, "cash")
    net_debt = (debt - cash) if (debt is not None and cash is not None) else debt

    ebit, da, interest, sales = (g(flow, k) for k in ("ebit", "da", "interest", "sales"))
    ebitda = (ebit + da) if (ebit is not None and da is not None) else None
    coverage = (ebit / interest) if (ebit is not None and interest and interest > 0) else None
    debt_ebitda = (debt / ebitda) if (debt is not None and ebitda and ebitda > 0) else None

    # Altman Z (original 1968)
    ta, tl = g(inst, "assets"), g(inst, "liabilities")
    ca, cl, re_ = g(inst, "curAssets"), g(inst, "curLiab"), g(inst, "retained")
    z = comps = zone = None
    if all(v is not None for v in (ta, tl, ca, cl, re_, ebit, sales)) and \
            ta > 0 and tl > 0 and market_cap:
        wc = ca - cl
        comps = {
            "wcTa":    wc / ta,
            "reTa":    re_ / ta,
            "ebitTa":  ebit / ta,
            "mcapTl":  market_cap / tl,
            "salesTa": sales / ta,
        }
        z = (1.2 * comps["wcTa"] + 1.4 * comps["reTa"] + 3.3 * comps["ebitTa"]
             + 0.6 * comps["mcapTl"] + 1.0 * comps["salesTa"])
        zone = "SAFE" if z > 2.99 else ("GREY" if z >= 1.81 else "DISTRESS")

    return {
        "zScore":      _safe(z),
        "zZone":       zone,
        "components":  {k: _safe(v) for k, v in comps.items()} if comps else None,
        "coverage":    _safe(coverage),
        "debtEbitda":  _safe(debt_ebitda),
        "totalDebt":   _safe(debt),
        "netDebt":     _safe(net_debt),
        "cash":        _safe(cash),
        "ebitda":      _safe(ebitda),
        "interest":    _safe(interest),
        "asOf":        asof,
        "fyEnd":       fy_end,
    }


# ---------------------------------------------------------------------------
# 8. Earnings-driver digest — extractive NLP, zero tokens
# ---------------------------------------------------------------------------
_DRIVER_PHRASES = [
    "driven by", "primarily due to", "due to", "attributable to",
    "offset by", "partially offset", "reflecting", "resulting from",
    "led by", "benefited from", "benefitted from", "impacted by",
    "as a result of", "driven primarily", "contributed to",
]
_SUBJECT_WORDS = [
    "net sales", "revenue", "gross margin", "operating margin", "net income",
    "operating income", "earnings per share", "diluted eps", "gross profit",
    "cost of sales", "cost of revenue", "operating expenses", "demand",
    "pricing", "volume", "product mix", "foreign currency", "exchange rates",
    "average selling price", "unit sales", "services", "subscription",
    "tax rate", "interest expense", "share repurchase", "dividend",
]
_DIRECTION_WORDS = [
    "increase", "increased", "decrease", "decreased", "grew", "growth",
    "decline", "declined", "rose", "fell", "higher", "lower", "improved",
    "expanded", "contracted", "flat",
]
_NEGATIVE_WORDS = ["decreas", "declin", "fell", "headwind", "adverse",
                   "unfavorab", "weak", "pressur", "lower net sales",
                   "lower revenue"]
_OUTLOOK_WORDS = ["expect", "anticipat", "outlook", "guidance",
                  "will continue", "intend to", "future period"]
_MARGIN_WORDS = ["margin", "cost of sales", "cost of revenue",
                 "operating expense", "gross profit", "tax rate",
                 "research and development", "selling, general"]
_BOILERPLATE = [
    "forward-looking", "undue reliance", "safe harbor", "securities act",
    "exchange act", "webcast", "conference call", "investor relations",
    "should be read in conjunction", "risk factors described",
    "sec filings", "speak only as of", "press release",
]


def _split_sentences(text: str) -> list:
    text = re.sub(r"\s+", " ", text)
    parts = re.split(r"(?<=[.!?])\s+(?=[A-Z$\d])", text)
    return [p.strip() for p in parts if p.strip()]


def extract_earnings_drivers(sections: list, max_per_bucket: int = 4) -> dict:
    """Score filing sentences for earnings-driver language and bucket them.
    Purely extractive — every line is a verbatim quote from the filing."""
    cands = []
    for sec in sections or []:
        title = sec.get("title", "")
        if "Business" in title or "Risk Factors" in title:
            continue                       # descriptive sections, not drivers
        src = "8-K" if "8-K" in title else "MD&A"
        for s in _split_sentences(sec.get("body", "")):
            ls = s.lower()
            if len(s) < 60 or len(s) > 420:
                continue
            if any(b in ls for b in _BOILERPLATE):
                continue
            score = 0
            score += 3 * sum(p in ls for p in _DRIVER_PHRASES)
            score += 2 * bool(re.search(r"\d+(\.\d+)?\s?%", s))
            score += 1 * bool(re.search(r"\$\s?\d", s))
            score += sum(w in ls for w in _SUBJECT_WORDS)
            score += 1 * any(d in ls for d in _DIRECTION_WORDS)
            score += 2 * any(w in ls for w in _OUTLOOK_WORDS)
            if score < 4:
                continue
            cands.append({"text": s, "ls": ls, "src": src, "score": score})

    def bucket_of(ls: str) -> str:
        if any(w in ls for w in _OUTLOOK_WORDS):
            return "outlook"
        if any(w in ls for w in _MARGIN_WORDS):
            return "margins"
        if any(w in ls for w in _NEGATIVE_WORDS):
            return "headwinds"
        return "revenue"

    buckets = {"revenue": [], "margins": [], "headwinds": [], "outlook": []}
    seen = set()
    for it in sorted(cands, key=lambda x: -x["score"]):
        key = it["text"][:80]
        if key in seen:
            continue
        seen.add(key)
        b = bucket_of(it["ls"])
        if len(buckets[b]) < max_per_bucket:
            buckets[b].append({"text": it["text"], "src": it["src"]})

    titles = (("revenue", "Revenue & Demand"), ("margins", "Margins & Costs"),
              ("headwinds", "Headwinds & Offsets"), ("outlook", "Outlook & Guidance"))
    out = [{"key": k, "title": t, "items": buckets[k]} for k, t in titles if buckets[k]]
    return {"buckets": out, "nCandidates": len(cands)}


# ---------------------------------------------------------------------------
# Aggregate payload
# ---------------------------------------------------------------------------
def build_quant_payload(prices: pd.DataFrame, ticker: str) -> dict:
    px = prices[ticker] if ticker in prices.columns else pd.Series(dtype=float)
    return {
        "regime":   vol_regime(prices),
        "momentum": momentum_signals(px),
        "ewma":     ewma_vol(px),
        "ivrv":     fetch_atm_iv(ticker),
    }
