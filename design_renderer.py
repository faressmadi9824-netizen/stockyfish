"""
design_renderer.py
------------------
Converts Python-computed data into the window.* globals the React design
expects, then inlines the design's JSX/CSS into a single self-contained HTML
string for st.components.v1.html().
"""

from __future__ import annotations

import json
import math
import os
import re

import numpy as np
import pandas as pd

_HERE = os.path.dirname(os.path.abspath(__file__))
_DESIGN = os.path.join(_HERE, "design")


def _read(filename: str) -> str:
    with open(os.path.join(_DESIGN, filename), encoding="utf-8") as f:
        return f.read()


# ---------------------------------------------------------------------------
# Data serialisers
# ---------------------------------------------------------------------------

def _safe(v):
    """Convert nan/inf to None for JSON serialisation."""
    if v is None:
        return None
    if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
        return None
    return v


def to_js_data(m: dict, prices: pd.DataFrame, ticker: str, bench_sym: str,
               live_quote: dict | None = None, backtest: dict | None = None) -> dict:
    """Map compute_metrics() output → window.data shape expected by the design.

    live_quote: optional dict with 'lastPrice' and 'previousClose' from fast_info.
    When provided, overrides the daily-close values so the hero shows the live price.
    """
    ret_idx = m["returns"].index

    # Price history aligned to return dates (used for sparkline)
    px = prices[ticker].reindex(ret_idx).ffill()

    # Live price overrides daily close for display
    if live_quote and live_quote.get("lastPrice"):
        last_px = float(live_quote["lastPrice"])
        prev_px = float(live_quote.get("previousClose") or px.iloc[-2] if len(px) >= 2 else last_px)
    else:
        last_px = float(px.iloc[-1])
        prev_px = float(px.iloc[-2]) if len(px) >= 2 else last_px

    last_chg  = last_px - prev_px
    last_pct  = (last_px / prev_px - 1) if prev_px else 0.0

    # VIX aligned
    vix_s = prices["^VIX"].reindex(ret_idx).ffill() if "^VIX" in prices.columns else pd.Series(0.0, index=ret_idx)

    # Rolling betas → list of {bench, vix} | null
    rb = m["rolling_betas"]
    rolling = []
    for i in range(len(ret_idx)):
        dt = ret_idx[i]
        if rb.empty or dt not in rb.index or rb.loc[dt].isna().any():
            rolling.append(None)
        else:
            row = rb.loc[dt]
            rolling.append({
                "bench": _safe(float(row.get("bench", float("nan")))),
                "vix":   _safe(float(row.get("dlvix", float("nan")))),
            })

    bm = m["bm"]
    bv = m["bv"]
    bs = m["bs"]

    sector_block = None
    if m["has_sector"]:
        sector_block = {
            "sym":  "sector",
            "beta": _safe(bs["beta"]),
            "t":    _safe(bs["t"]),
            "ci":   [_safe(bs["ci"][0]), _safe(bs["ci"][1])],
        }

    return {
        "ticker": ticker,
        "dates":  [d.isoformat() for d in ret_idx],
        "returns":    [_safe(float(v)) for v in m["returns"].values],
        "prices":     [_safe(float(v)) for v in px.values],
        "cumulative": [_safe(float(v)) for v in (1 + m["returns"]).cumprod().values],
        "drawdown":   [_safe(float(v)) for v in m["drawdown"].values],
        "vix":        [_safe(float(v)) for v in vix_s.values],
        "rolling":    rolling,
        "lastPrice":    _safe(last_px),
        "lastChange":   _safe(last_chg),
        "lastChangePct": _safe(last_pct),
        "stats": {
            "annReturn":     _safe(m["ann_return"]),
            "annVol":        _safe(m["ann_vol"]),
            "meanR":         _safe(float(m["returns"].mean())),
            "stdR":          _safe(float(m["returns"].std())),
            "downsideDevDaily":   _safe(m["downside_dev_d"]),
            "downsideDevMonthly": _safe(m["downside_dev_m"]),
            "downsideDevAnn":     _safe(m["downside_dev_a"]),
            "upsideDevAnn":       _safe(m["upside_dev_a"]),
            "es5":           _safe(m["es5_daily"]),
            "maxDD":         _safe(m["max_dd"]),
            "sortino":       _safe(m["sortino"]),
            "skew":          _safe(m["skew"]),
            "kurt":          _safe(m["kurt"]),
            "annRF":         _safe(m["ann_rf"]),
            "targetDaily":   _safe(m["target_avg"]),
            "nObs":          int(m["n_obs"]),
            "firstDate":     m["first_date"].isoformat(),
            "lastDate":      m["last_date"].isoformat(),
        },
        "worst": [{"date": str(d.date()), "r": _safe(float(r))} for d, r in m["worst"].items()],
        "best":  [{"date": str(d.date()), "r": _safe(float(r))} for d, r in m["best"].items()],
        "backtest": backtest or {},
        "factor": {
            "bench": {
                "sym":  bench_sym,
                "name": bench_sym,
                "beta": _safe(bm["beta"]),
                "t":    _safe(bm["t"]),
                "ci":   [_safe(bm["ci"][0]), _safe(bm["ci"][1])],
            },
            "vix": {
                "sym":  "VIX",
                "name": "Δlog(VIX)",
                "beta": _safe(bv["beta"]),
                "t":    _safe(bv["t"]),
                "ci":   [_safe(bv["ci"][0]), _safe(bv["ci"][1])],
            },
            "sector": sector_block,
            "alpha_ann":    _safe(m["alpha_ann"]),
            "sigma_eps_ann": _safe(m["sigma_eps_a"]),
            "adj_r2":       _safe(m["adj_r2"]),
        },
    }


def to_js_fundamentals(info: dict) -> dict:
    """Map get_ticker_info() → window.fundamentals shape."""
    def s(k, default=None):
        v = info.get(k, default)
        return _safe(v) if isinstance(v, float) else v

    return {
        "ticker":        s("ticker", ""),
        "longName":      s("longName", ""),
        "sector":        s("sector", ""),
        "industry":      s("industry", ""),
        "exchange":      s("exchange", ""),
        "currency":      s("currency", "USD"),
        "longBusinessSummary": s("longBusinessSummary", ""),
        "marketCap":     s("marketCap"),
        "enterpriseValue": s("enterpriseValue"),
        "trailingPE":    s("trailingPE"),
        "forwardPE":     s("forwardPE"),
        "pegRatio":      s("pegRatio"),
        "priceToBook":   s("priceToBook"),
        "priceToSales":  s("priceToSales"),
        "evToEbitda":    s("evToEbitda"),
        "evToRevenue":   s("evToRevenue"),
        "revenueGrowth": s("revenueGrowth"),
        "earningsGrowth": s("earningsGrowth"),
        "grossMargins":  s("grossMargins"),
        "operatingMargins": s("operatingMargins"),
        "profitMargins": s("profitMargins"),
        "returnOnEquity": s("returnOnEquity"),
        "debtToEquity":  s("debtToEquity"),
        "trailingEps":   s("trailingEps"),
        "forwardEps":    s("forwardEps"),
        "fiftyTwoWeekHigh": s("fiftyTwoWeekHigh"),
        "fiftyTwoWeekLow":  s("fiftyTwoWeekLow"),
        "targetMeanPrice":  s("targetMeanPrice"),
        "numberOfAnalystOpinions": s("numberOfAnalystOpinions"),
        "recommendationKey": s("recommendationKey", ""),
        "averageAnalystRating": s("averageAnalystRating", ""),
        "beta":          s("beta"),
        "weekChange52":  s("weekChange52"),
        "currentPrice":  s("currentPrice"),
        "dividendYield": s("dividendYield"),
    }


def to_js_tape(prices: pd.DataFrame, live_quotes: dict | None = None) -> list:
    """Build ticker tape items. Uses live_quotes when available, daily close as fallback."""
    tape_syms = ["SPY", "QQQ", "IWM", "^VIX", "XLK", "XLF", "XLV", "XLE", "XLY", "IJH"]
    items = []
    for sym in tape_syms:
        if live_quotes and sym in live_quotes:
            lq    = live_quotes[sym]
            last  = lq["last"]
            prev  = lq["prev"] or last
            delta = (last / prev - 1) if prev else 0.0
        elif sym in prices.columns:
            s = prices[sym].dropna()
            if len(s) < 2:
                continue
            last  = float(s.iloc[-1])
            prev  = float(s.iloc[-2])
            delta = (last / prev - 1) if prev else 0.0
        else:
            continue
        items.append({"sym": sym, "last": _safe(last), "delta": _safe(delta)})
    return items


# ---------------------------------------------------------------------------
# app.jsx patch — remove Toolbar & TickerTape for embedded context
# ---------------------------------------------------------------------------

def _patch_app_jsx(src: str, ticker: str) -> str:
    """
    Strip TickerTape and Toolbar from the App render so Streamlit's sidebar
    owns ticker input. Keep Hero, FundamentalsStrip, TabsBar, tabs, Footer.
    """
    # Replace the full App function body, keeping theme toggle in TabsBar meta area
    patched = src.replace(
        "{tweaks.showTape && <TickerTape items={window.tape} />}",
        "{/* TickerTape removed — Streamlit sidebar owns ticker input */}",
    ).replace(
        "<Toolbar ticker={ticker} onTickerChange={setTicker} watchlist={window.watchlist}\n"
        "               theme={theme} onToggleTheme={toggleTheme} />",
        "{/* Toolbar removed */}",
    )
    # Also handle the single-line variant Babel might see
    patched = re.sub(
        r"<Toolbar[^/]*/?>",
        "{/* Toolbar removed */}",
        patched,
    )
    return patched


# ---------------------------------------------------------------------------
# HTML builder
# ---------------------------------------------------------------------------

_CDN = """
<script src="https://unpkg.com/react@18.3.1/umd/react.development.js" integrity="sha384-hD6/rw4ppMLGNu3tX5cjIb+uRZ7UkRJ6BPkLpg4hAu/6onKUg4lLsHAs9EBPT82L" crossorigin="anonymous"></script>
<script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js" integrity="sha384-u6aeetuaXnQ38mYT8rp6sbXaQe3NL9t+IBXmnYxwkUI2Hw4bsp2Wvmx4yRQF1uAm" crossorigin="anonymous"></script>
<script src="https://unpkg.com/@babel/standalone@7.29.0/babel.min.js" integrity="sha384-m08KidiNqLdpJqLq95G/LEi8Qvjl/xUYll3QILypMoQ65QorJ9Lvtp2RXYGBFj1y" crossorigin="anonymous"></script>
""".strip()

_MAKE_HISTOGRAM_JS = """
window.makeHistogram = function(arr, nBins) {
  nBins = nBins || 60;
  var lo = Infinity, hi = -Infinity;
  for (var i = 0; i < arr.length; i++) { if (arr[i] < lo) lo = arr[i]; if (arr[i] > hi) hi = arr[i]; }
  var size = (hi - lo) / nBins;
  var bins = [];
  for (var i = 0; i < nBins; i++) {
    bins.push({ lo: lo + i*size, hi: lo + (i+1)*size, mid: lo + (i+0.5)*size, count: 0 });
  }
  for (var j = 0; j < arr.length; j++) {
    var idx = Math.min(nBins - 1, Math.floor((arr[j] - lo) / size));
    bins[idx].count++;
  }
  return bins;
};
"""


# ---------------------------------------------------------------------------
# Industry analysis payload (Seeking Alpha–style peer comparison)
# ---------------------------------------------------------------------------
# Each metric: (key in get_ticker_info, label, direction, fmt)
#   direction "low"  -> cheaper / lower is a better grade (valuation)
#   direction "high" -> higher is a better grade (profitability)
#   fmt "ratio" -> shown as 28.53 ; "pct" -> value is a fraction, shown as %
_IND_VALUATION = [
    ("trailingPE",  "P/E (TTM)",        "low", "ratio"),
    ("forwardPE",   "P/E (FWD)",        "low", "ratio"),
    ("pegRatio",    "PEG",              "low", "ratio"),
    ("priceToSales","Price / Sales",    "low", "ratio"),
    ("priceToBook", "Price / Book",     "low", "ratio"),
    ("evToEbitda",  "EV / EBITDA",      "low", "ratio"),
    ("evToRevenue", "EV / Sales",       "low", "ratio"),
]
_IND_PROFITABILITY = [
    ("grossMargins",     "Gross Margin",            "high", "pct"),
    ("ebitdaMargins",    "EBITDA Margin",           "high", "pct"),
    ("operatingMargins", "Operating Margin",        "high", "pct"),
    ("profitMargins",    "Net Margin",              "high", "pct"),
    ("returnOnEquity",   "Return on Equity",        "high", "pct"),
    ("returnOnAssets",   "Return on Assets",        "high", "pct"),
]

# Map metric key -> field in fetch_fundamental_history metrics (for focus 5Y avg)
_IND_5Y_FIELD = {
    "grossMargins": "grossMargin",
    "profitMargins": "netMargin",
    "returnOnEquity": "roe",
}

_GRADE_BANDS = [
    (0.97, "A+"), (0.93, "A"), (0.90, "A-"),
    (0.80, "B+"), (0.70, "B"), (0.60, "B-"),
    (0.50, "C+"), (0.40, "C"), (0.30, "C-"),
    (0.20, "D+"), (0.10, "D"), (0.0, "D-"),
]


def _to_float(v):
    try:
        f = float(v)
        if math.isnan(f) or math.isinf(f):
            return None
        return f
    except (TypeError, ValueError):
        return None


def _pct_to_grade(pct: float) -> str:
    for lo, letter in _GRADE_BANDS:
        if pct >= lo:
            return letter
    return "D-"


def _grade_and_median(value, peer_values, direction):
    peers = [p for p in (_to_float(x) for x in peer_values) if p is not None]
    median = float(np.median(peers)) if peers else None
    value = _to_float(value)
    if value is None or len(peers) < 3:
        return None, median
    better = sum(1 for p in peers if (p > value if direction == "low" else p < value))
    return _pct_to_grade(better / len(peers)), median


def _pct_diff(value, baseline):
    value, baseline = _to_float(value), _to_float(baseline)
    if value is None or baseline in (None, 0):
        return None
    return (value - baseline) / abs(baseline) * 100.0


def _five_year_avgs(fund_history: dict | None) -> dict:
    """Average of each available annual metric over the reported history."""
    out: dict = {}
    metrics = (fund_history or {}).get("metrics", {})
    for mkey, field in _IND_5Y_FIELD.items():
        pts = (metrics.get(field) or {}).get("annual") or []
        vals = [_to_float(p.get("v")) for p in pts][:5]
        vals = [v for v in vals if v is not None]
        if vals:
            out[mkey] = sum(vals) / len(vals)
    return out


def to_js_industry(focus_ticker: str, focus_info: dict,
                   peer_infos: dict[str, dict],
                   fund_history: dict | None = None,
                   peer_basis: str = "",
                   extra_five_yr: dict | None = None) -> dict:
    """Build the window.industry payload: graded valuation + profitability
    tables for the focus ticker vs its peer set, plus a comparison matrix.

    `extra_five_yr` lets the caller supply historical averages that aren't
    derivable from the fundamental-history feed (e.g. a price-derived
    historical average P/E), keyed by the same metric keys used above.
    """
    focus_ticker = focus_ticker.upper()
    peers = {t.upper(): i for t, i in (peer_infos or {}).items()
             if t.upper() != focus_ticker and i}
    five_yr = _five_year_avgs(fund_history)
    for k, v in (extra_five_yr or {}).items():
        if v is not None:
            five_yr[k] = v

    def build_rows(metric_defs):
        rows = []
        for key, label, direction, fmt in metric_defs:
            value = focus_info.get(key)
            peer_vals = [info.get(key) for info in peers.values()]
            grade, median = _grade_and_median(value, peer_vals, direction)
            five = five_yr.get(key)
            rows.append({
                "label": label, "fmt": fmt, "direction": direction,
                "value": _safe(_to_float(value)),
                "grade": grade,
                "median": _safe(median),
                "pctSector": _safe(_pct_diff(value, median)),
                "fiveYr": _safe(five),
                "pct5y": _safe(_pct_diff(value, five)),
            })
        return rows

    # Comparison matrix: focus first, then peers
    order = [focus_ticker] + list(peers.keys())
    all_info = {focus_ticker: focus_info, **peers}
    matrix_rows = []
    for key, label, direction, fmt in (_IND_VALUATION + _IND_PROFITABILITY):
        matrix_rows.append({
            "label": label, "fmt": fmt, "direction": direction,
            "values": {t: _safe(_to_float(all_info.get(t, {}).get(key)))
                       for t in order},
        })

    return {
        "focus": focus_ticker,
        "focusName": focus_info.get("longName") or focus_ticker,
        "sector": focus_info.get("sector") or "—",
        "industry": focus_info.get("industry") or "—",
        "peerBasis": peer_basis,
        "peers": list(peers.keys()),
        "tickers": order,
        "valuation": build_rows(_IND_VALUATION),
        "profitability": build_rows(_IND_PROFITABILITY),
        "matrix": matrix_rows,
    }


def build_html(
    js_data: dict,
    js_fund: dict,
    js_tape: list,
    js_watchlist: list,
    js_research: list,
    ticker: str = "",
    js_quant: dict | None = None,
    js_fund_history: dict | None = None,
    js_credit: dict | None = None,
    js_industry: dict | None = None,
) -> str:
    css       = _read("styles.css")
    charts    = _read("charts.jsx")
    header    = _read("header.jsx")
    tabs      = _read("tabs.jsx")
    app_raw   = _read("app.jsx")
    app_jsx   = _patch_app_jsx(app_raw, ticker)

    data_json  = json.dumps(js_data,       ensure_ascii=False)
    fund_json  = json.dumps(js_fund,       ensure_ascii=False)
    tape_json  = json.dumps(js_tape,       ensure_ascii=False)
    wl_json    = json.dumps(js_watchlist,  ensure_ascii=False)
    res_json   = json.dumps(js_research,   ensure_ascii=False)
    quant_json  = json.dumps(js_quant or {},        ensure_ascii=False)
    fh_json     = json.dumps(js_fund_history or {}, ensure_ascii=False)
    credit_json = json.dumps(js_credit or {},       ensure_ascii=False)
    industry_json = json.dumps(js_industry or {},   ensure_ascii=False)

    return f"""<!doctype html>
<html lang="en" data-theme="light">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * {{ box-sizing: border-box; }}
    html, body {{ margin: 0; padding: 0; }}
    {css}
    /* Override: prevent .app from expanding to iframe height when content is shorter */
    .app {{ min-height: 0 !important; }}
    body {{ height: auto !important; }}
  </style>
</head>
<body>
  <div id="root"></div>

  <script>
    (function() {{
      var raw = {data_json};
      raw.dates = raw.dates.map(function(s) {{ return new Date(s); }});
      raw.stats.firstDate = new Date(raw.stats.firstDate);
      raw.stats.lastDate  = new Date(raw.stats.lastDate);
      raw.worst = raw.worst.map(function(w) {{ return Object.assign({{}}, w, {{date: new Date(w.date)}}); }});
      raw.best  = raw.best.map( function(b) {{ return Object.assign({{}}, b, {{date: new Date(b.date)}}); }});
      window.data         = raw;
      window.fundamentals = {fund_json};
      window.tape         = {tape_json};
      window.watchlist    = {wl_json};
      window.research     = {res_json};
      window.quant        = {quant_json};
      window.fundHistory  = {fh_json};
      window.credit       = {credit_json};
      window.industry     = {industry_json};
      try {{
        console.log('[shockdev] quant sections:',
          Object.keys(window.quant).filter(function(k) {{ return window.quant[k] && Object.keys(window.quant[k]).length; }}),
          '· fundHistory metrics:',
          window.fundHistory.metrics ? Object.keys(window.fundHistory.metrics).length : 0);
      }} catch (e) {{}}
      {_MAKE_HISTOGRAM_JS}
    }})();
  </script>

  {_CDN}

  <script type="text/babel">{charts}</script>
  <script type="text/babel">{header}</script>
  <script type="text/babel">{tabs}</script>
  <script type="text/babel">{app_jsx}</script>

  <script>
    (function() {{
      var lastH = 0;
      function resize() {{
        try {{
          var h = document.documentElement.scrollHeight;
          if (h !== lastH && window.frameElement) {{
            lastH = h;
            window.frameElement.style.height = h + 'px';
          }}
        }} catch(e) {{}}
      }}
      window.addEventListener('load', function() {{ setTimeout(resize, 400); }});
      new ResizeObserver(resize).observe(document.body);
    }})();
  </script>
</body>
</html>"""
