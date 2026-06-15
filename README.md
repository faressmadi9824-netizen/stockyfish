# Shock & Deviation Dashboard

Two-factor risk dashboard. Type a ticker, get back a properly orthogonalized decomposition of where its daily moves come from.

## Run

```
pip install -r requirements.txt
streamlit run shock_dashboard.py
```

Open at http://localhost:8501. Change ticker / lookback in the sidebar — the page recomputes live.

## What it computes

The core model is a single joint regression:

```
r_stock = α + β_mkt · r_SPY + β_vix · Δlog(VIX) + ε
```

estimated with Newey-West HAC standard errors (lags = 5) so the t-stats survive daily autocorrelation and vol clustering.

From it:

- **β_mkt** — partial market beta. How the stock moves on a +1% SPY day, *holding VIX fixed*.
- **β_vix** — partial shock sensitivity. How the stock moves when VIX rises, *holding SPY fixed*. This is the orthogonalized version of what was a confounded coefficient in the first draft. Reported with t-stat and 95% CI; if |t| < 1.96, the estimate isn't statistically distinguishable from zero.
- **σ_idio** — annualized residual standard deviation. The stock-specific risk neither SPY nor VIX explains.
- **α (annualized), Adj. R²** — completeness.

Plus the standalone risk metrics:

- **Annualized downside / upside deviation** with target defaulting to the daily ^IRX (13-week T-bill) yield, not zero.
- **Expected Shortfall (5%, daily)** — mean return on the worst 5% of days. Kept daily, not annualized: ES is a mean, so √252 (vol-style) scaling is conceptually wrong and ×252 (sum-style) implies "every day is a tail day."
- **Max drawdown** — worst peak-to-trough on cumulative returns.
- **Sortino, skew, excess kurtosis, ann. return/vol.**

Plus charts: return-distribution histogram split into upside/downside, drawdown curve, and a rolling 60-day β_vix from a rolling joint regression — so you can see the shock coefficient drift through regimes.

## What got removed from the first draft and why

- **Univariate VIX β** → replaced by the partial β_vix from the joint regression. The univariate version was confounded with market beta (VIX up days are SPY down days, so the coefficient mostly recovered β_mkt with a flipped sign).
- **Tail-day β** → removed. Once β_mkt and β_vix are properly partialled, tail-day β is mostly redundant and noisy from small-N.
- **Cumulative return chart** → replaced by drawdown chart, which is on-topic.

## What's resisted

Sector ETFs, VIX term structure (VIX9D, VIX3M), Fama-French / Carhart factors, dollar / oil / rates betas, options-implied skew, news-sentiment β, hand-picked event-day dummies. Each sounds defensible, but each is a slot in a regression of ~1,250 observations, and most are heavily correlated with SPY and VIX. Adding them inflates standard errors more than it adds signal.

If you want event-day analysis (DeepSeek, FOMC days, Oct 7), the right way is a separate diagnostic over a pre-registered date list — not a coefficient inside this model. Easy to bolt on.

## Caveats

- √252 annualization assumes IID daily returns. Real returns have autocorrelation and vol clustering. HAC SEs handle this for the regression coefficients; the deviation/vol annualizations are still point estimates under IID.
- ES at 5% with ~1,250 obs gives ~63 tail observations. Standard error on the tail mean is non-trivial.
- VIX history starts in 1990, ^IRX is shorter. Tickers with very short histories will trigger the sample-shortness warning.

Data: Yahoo Finance via yfinance.
