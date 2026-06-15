/* ============================================================
   Header components: ticker tape, top toolbar, marquee hero,
   fundamentals strip.
   ============================================================ */

const { useState: useStateH, useEffect: useEffectH, useMemo: useMemoH } = React;

// ─────────────────────────────────────────────────────────────
// Ticker tape (top)
// ─────────────────────────────────────────────────────────────
function TickerTape({ items }) {
  // Duplicate items for seamless loop
  const doubled = [...items, ...items];
  return (
    <div className="tape">
      <div className="tape-track">
        {doubled.map((it, i) => (
          <span className="tape-item" key={i}>
            <span className={`pulse ${it.delta < 0 ? 'neg' : ''}`} />
            <span className="sym">{it.sym}</span>
            <span>{it.last < 100 ? it.last.toFixed(2) : it.last.toFixed(it.last > 10000 ? 0 : 2)}</span>
            <span className={`delta ${it.delta >= 0 ? 'pos' : 'neg'}`}>
              {it.delta >= 0 ? '▲' : '▼'} {(Math.abs(it.delta) * 100).toFixed(2)}%
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
window.TickerTape = TickerTape;

// ─────────────────────────────────────────────────────────────
// Top toolbar
// ─────────────────────────────────────────────────────────────
function Toolbar({ ticker, onTickerChange, watchlist, theme, onToggleTheme }) {
  const [query, setQuery] = useStateH('');
  const [focused, setFocused] = useStateH(false);
  const wrapRef = window.React.useRef(null);

  useEffectH(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        wrapRef.current?.querySelector('input')?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const filtered = useMemoH(() => {
    const q = query.trim().toUpperCase();
    if (!q) return watchlist.slice(0, 6);
    return watchlist.filter(w => w.sym.includes(q) || w.name.toUpperCase().includes(q)).slice(0, 6);
  }, [query, watchlist]);

  const pick = (sym) => {
    onTickerChange(sym);
    setQuery('');
    setFocused(false);
  };

  return (
    <div className="toolbar">
      <div className="container toolbar-row">
        <div className="brand">
          <div className="brand-mark">S</div>
          <span>SHOCK<span style={{ color: 'var(--accent)' }}>·</span>DEV</span>
          <span className="brand-sub">Two-factor risk dashboard</span>
        </div>

        <div className="search" ref={wrapRef}>
          <svg className="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.6" />
            <line x1="20" y1="20" x2="16.5" y2="16.5" stroke="currentColor" strokeWidth="1.6" />
          </svg>
          <input
            type="text"
            placeholder="Search ticker · AAPL"
            value={query}
            onChange={e => setQuery(e.target.value.toUpperCase())}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
          />
          <span className="search-kbd">⌘K</span>
          {focused && filtered.length > 0 && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0,
              background: 'var(--bg-elev)', border: '1px solid var(--line)',
              borderRadius: '6px', zIndex: 50, boxShadow: 'var(--shadow)',
              overflow: 'hidden',
            }}>
              {filtered.map(it => (
                <div key={it.sym}
                  onMouseDown={() => pick(it.sym)}
                  style={{
                    padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 12,
                    cursor: 'pointer', borderBottom: '1px solid var(--line-soft)',
                    background: it.sym === ticker ? 'var(--bg-card)' : 'transparent',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card)'}
                  onMouseLeave={e => e.currentTarget.style.background = it.sym === ticker ? 'var(--bg-card)' : 'transparent'}
                >
                  <span className="mono" style={{ fontWeight: 600, width: 60, color: 'var(--fg)' }}>{it.sym}</span>
                  <span style={{ flex: 1, fontSize: 12, color: 'var(--muted)' }}>{it.name}</span>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--fg-soft)' }}>${it.last.toFixed(2)}</span>
                  <span className={`mono`} style={{ fontSize: 11, color: it.delta >= 0 ? 'var(--pos)' : 'var(--neg)', width: 56, textAlign: 'right' }}>
                    {it.delta >= 0 ? '+' : ''}{(it.delta * 100).toFixed(2)}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="tool-buttons">
          <button className="tool-btn" title="Market is open">
            <span className="dot" />
            <span>NYSE · OPEN</span>
          </button>
          <button className="tool-btn" onClick={onToggleTheme} title="Toggle theme">
            {theme === 'dark' ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <circle cx="12" cy="12" r="4" />
                <line x1="12" y1="2" x2="12" y2="5" />
                <line x1="12" y1="19" x2="12" y2="22" />
                <line x1="2" y1="12" x2="5" y2="12" />
                <line x1="19" y1="12" x2="22" y2="12" />
                <line x1="4.6" y1="4.6" x2="6.7" y2="6.7" />
                <line x1="17.3" y1="17.3" x2="19.4" y2="19.4" />
                <line x1="4.6" y1="19.4" x2="6.7" y2="17.3" />
                <line x1="17.3" y1="6.7" x2="19.4" y2="4.6" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
              </svg>
            )}
            <span>{theme === 'dark' ? 'LIGHT' : 'DARK'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
window.Toolbar = Toolbar;

// ─────────────────────────────────────────────────────────────
// Marquee hero — ticker + price + sparkline
// ─────────────────────────────────────────────────────────────
function Hero({ data, fundamentals, themeKey, years }) {
  const { lastPrice, lastChange, lastChangePct, prices, dates, stats } = data;
  const isPos = lastChangePct >= 0;

  return (
    <div className="hero">
      <div className="container">
        <div className="hero-grid">
          <div>
            <div className="ticker-block">
              <span className="ticker-symbol">{data.ticker}</span>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span className="ticker-name">{fundamentals.longName}</span>
                <div className="ticker-meta">
                  <span className="meta-pill live"><span className="k">NYSE</span><span className="v">{fundamentals.exchange.replace('NASDAQ', 'NASDAQ-GS')}</span></span>
                  <span className="meta-pill"><span className="k">SECTOR</span><span className="v">{fundamentals.sector}</span></span>
                  <span className="meta-pill"><span className="k">CCY</span><span className="v">{fundamentals.currency}</span></span>
                  <span className="meta-pill"><span className="k">N</span><span className="v">{stats.nObs.toLocaleString()} OBS</span></span>
                </div>
              </div>
            </div>
          </div>

          <div className="price-stack">
            <div className="price-now">
              <span className="price-ccy">USD</span>
              <span>{lastPrice.toFixed(2)}</span>
            </div>
            <div className={`price-delta ${isPos ? 'pos' : 'neg'}`}>
              <span><span className="arrow">{isPos ? '▲' : '▼'}</span> {Math.abs(lastChange).toFixed(2)}</span>
              <span>({isPos ? '+' : ''}{(lastChangePct * 100).toFixed(2)}%)</span>
              <span style={{ color: 'var(--muted)', fontSize: 11, marginLeft: 8 }}>
                vs prev close
              </span>
            </div>
          </div>
        </div>

        <div className="hero-spark">
          <HeroSparkline values={prices} dates={dates} themeKey={themeKey} height={90} />
        </div>
      </div>
    </div>
  );
}
window.Hero = Hero;

// ─────────────────────────────────────────────────────────────
// Fundamentals strip (compact, 3 sections)
// ─────────────────────────────────────────────────────────────
function FundamentalsStrip({ f, price }) {
  const fmtX  = (v, d = 1) => v == null ? '—' : `${v.toFixed(d)}×`;
  const fmtP  = (v, d = 1) => v == null ? '—' : `${(v * 100).toFixed(d)}%`;
  const fmtD  = (v, d = 2) => v == null ? '—' : `$${v.toFixed(d)}`;
  const fmtG  = (v, d = 1) => v == null ? '—' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(d)}%`;
  const cls   = (v) => v == null ? '' : (v >= 0 ? 'pos' : 'neg');
  const upside = (f.targetMeanPrice != null && price) ? f.targetMeanPrice / price - 1 : null;
  const fmtM  = (v) => {
    if (v == null) return '—';
    if (v >= 1e12) return `$${(v/1e12).toFixed(2)}T`;
    if (v >= 1e9)  return `$${(v/1e9).toFixed(1)}B`;
    return `$${v.toLocaleString()}`;
  };

  return (
    <div className="container">
      <div className="section">
        <div className="section-head">
          <span className="section-num">§01</span>
          <h2 className="section-title">Valuation</h2>
          <span className="section-sub">YAHOO FINANCE · REFINITIV CONSENSUS</span>
        </div>
        <div className="grid grid-7">
          <Metric label="Market Cap" value={fmtM(f.marketCap)} sub="market value" />
          <Metric label="Enterprise Value" value={fmtM(f.enterpriseValue)} sub="ev = mcap + debt − cash" />
          <Metric label="P/E (TTM)" value={fmtX(f.trailingPE)} sub="trailing 12 months" />
          <Metric label="Fwd P/E" value={fmtX(f.forwardPE)} sub="ntm consensus" />
          <Metric label="PEG" value={fmtX(f.pegRatio, 2)} sub="p/e ÷ growth" />
          <Metric label="EV / EBITDA" value={fmtX(f.evToEbitda)} sub="enterprise multiple" />
          <Metric label="P/S (TTM)" value={fmtX(f.priceToSales)} sub="price / sales" />
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <span className="section-num">§02</span>
          <h2 className="section-title">Growth &amp; Profitability</h2>
          <span className="section-sub">TRAILING TWELVE MONTHS</span>
        </div>
        <div className="grid grid-7">
          <Metric label="Rev Growth" value={fmtG(f.revenueGrowth)} cls={cls(f.revenueGrowth)} sub="yoy" />
          <Metric label="EPS Growth" value={fmtG(f.earningsGrowth)} cls={cls(f.earningsGrowth)} sub="yoy" />
          <Metric label="Gross Margin" value={fmtP(f.grossMargins)} sub="" />
          <Metric label="Oper Margin" value={fmtP(f.operatingMargins)} sub="" />
          <Metric label="Net Margin" value={fmtP(f.profitMargins)} sub="ttm" />
          <Metric label="ROE" value={fmtP(f.returnOnEquity)} sub="return on equity" />
          <Metric label="D/E" value={fmtX(f.debtToEquity != null ? f.debtToEquity / 100 : null, 2)} sub="total / equity" />
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <span className="section-num">§03</span>
          <h2 className="section-title">Analyst &amp; Technical</h2>
          <span className="section-sub">{f.numberOfAnalystOpinions ?? '—'} ANALYSTS · BUY CONSENSUS</span>
        </div>
        <div className="grid grid-7">
          <Metric label="EPS (TTM)" value={fmtD(f.trailingEps)} sub="" />
          <Metric label="Fwd EPS" value={fmtD(f.forwardEps)} sub="ntm" />
          <Metric label="Price Target" value={fmtD(f.targetMeanPrice)} sub="analyst mean" />
          <Metric label="Upside" value={fmtG(upside)}
                  cls={cls(upside)} sub={`${f.numberOfAnalystOpinions ?? '—'} analysts`} />
          <Metric label="Consensus" value="BUY" sub={f.averageAnalystRating || ''} cls="pos" />
          <Metric label="52W High" value={fmtD(f.fiftyTwoWeekHigh)}
                  sub={f.fiftyTwoWeekHigh != null && price ? `${(((price / f.fiftyTwoWeekHigh) - 1) * 100).toFixed(1)}% from high` : ''} />
          <Metric label="52W Low" value={fmtD(f.fiftyTwoWeekLow)}
                  sub={f.fiftyTwoWeekLow != null && price ? `+${(((price / f.fiftyTwoWeekLow) - 1) * 100).toFixed(1)}% off low` : ''} />
        </div>
      </div>
    </div>
  );
}
window.FundamentalsStrip = FundamentalsStrip;

// ─────────────────────────────────────────────────────────────
// Metric primitive
// ─────────────────────────────────────────────────────────────
function Metric({ label, value, sub, cls, badge, large, spark, sparkColor, themeKey }) {
  return (
    <div className={`metric ${large ? 'tall' : ''}`}>
      <div className="metric-label">
        {label}
        {badge}
      </div>
      <div className={`metric-value ${large ? 'lg' : ''} ${cls || ''}`}>{value}</div>
      {sub && <div className="metric-sub">{sub}</div>}
      {spark && (
        <div className="metric-spark">
          <MiniSpark values={spark} color={sparkColor} themeKey={themeKey} />
        </div>
      )}
    </div>
  );
}
window.Metric = Metric;
