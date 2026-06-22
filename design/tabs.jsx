/* ============================================================
   Tab content: Summary, Risk Profile, Factor Model, Research.
   ============================================================ */

const { useState: useStateT, useMemo: useMemoT } = React;

// ─────────────────────────────────────────────────────────────
// Tabs row + sticky header
// ─────────────────────────────────────────────────────────────
function TabsBar({ tabs, active, onChange, meta }) {
  return (
    <div className="tabs">
      <div className="container tabs-row">
        {tabs.map((t, i) => (
          <button key={t.key} className={`tab ${active === t.key ? 'active' : ''}`}
                  onClick={() => onChange(t.key)}>
            <span className="num">{String(i + 1).padStart(2, '0')}</span>
            {t.label}
          </button>
        ))}
        {meta && (
          <div className="tab-meta">
            {meta.map((m, i) => (
              <span key={i}><span className="k">{m.k}</span> {m.v}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
window.TabsBar = TabsBar;

// ─────────────────────────────────────────────────────────────
// Interpretation block — sentence-form summary
// ─────────────────────────────────────────────────────────────
function Interpretation({ data }) {
  const { factor, ticker } = data;
  const bm = factor.bench, bv = factor.vix;
  const vixOn10 = Math.abs(bv.beta) * 0.10 * 100;
  const vixDir = bv.beta < 0 ? 'falls' : 'rises';
  const sigV = Math.abs(bv.t) >= 1.96 ? 'statistically significant' : 'not statistically significant';

  return (
    <div className="interp">
      On a +1% <strong>{bm.sym}</strong> day with VIX held fixed, {ticker} moves about{' '}
      <span className="num">{bm.beta.toFixed(2)}%</span>. On a 10% VIX rise (e.g. 15 → 16.5) with all else fixed,{' '}
      {ticker} {vixDir} by <span className="num">{vixOn10.toFixed(2)}%</span> — at t = {bv.t.toFixed(2)}, {sigV} from zero.
    </div>
  );
}
window.Interpretation = Interpretation;

// ─────────────────────────────────────────────────────────────
// SUMMARY TAB
// ─────────────────────────────────────────────────────────────
function SummaryTab({ data, themeKey, fundamentals }) {
  const s = data.stats;
  return (
    <div className="container">
      <div className="section" style={{ paddingTop: 28 }}>
        <div className="section-head">
          <span className="section-num">§04</span>
          <h2 className="section-title">Interpretation</h2>
          <span className="section-sub">PLAIN-ENGLISH MODEL OUTPUT</span>
        </div>
        <Interpretation data={data} />
      </div>

      <div className="section">
        <div className="section-head">
          <span className="section-num">§05</span>
          <h2 className="section-title">Key Metrics</h2>
          <span className="section-sub">5Y · {s.nObs} TRADING DAYS · ANNUALIZED</span>
        </div>
        <div className="grid grid-5">
          <Metric label="Ann. Return"
                  value={fmtSgn(s.annReturn, 1)}
                  cls={s.annReturn >= 0 ? 'pos' : 'neg'}
                  sub={`mean × 252, compounded`}
                  large
                  spark={data.cumulative.filter((_, i) => i % 5 === 0)}
                  sparkColor="var(--primary)"
                  themeKey={themeKey} />
          <Metric label="Ann. Volatility"
                  value={fmtPct(s.annVol, 1)}
                  sub={`σ × √252`}
                  large
                  spark={data.returns.filter((_, i) => i % 5 === 0).map(Math.abs)}
                  sparkColor="var(--accent)"
                  themeKey={themeKey} />
          <Metric label="Sortino (vs rf)"
                  value={s.sortino.toFixed(2)}
                  sub={`(ann_ret − rf) ÷ downside`}
                  large />
          <Metric label="Max Drawdown"
                  value={fmtPct(s.maxDD, 1)}
                  cls="neg"
                  sub={`worst peak-to-trough`}
                  large
                  spark={data.drawdown.filter((_, i) => i % 5 === 0)}
                  sparkColor="var(--accent)"
                  themeKey={themeKey} />
          <Metric label="Adj. R²"
                  value={fmtPct(data.factor.adj_r2, 1)}
                  sub={`variance explained by factors`}
                  large />
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <span className="section-num">§06</span>
          <h2 className="section-title">Drawdown</h2>
          <span className="section-sub">{(s.firstDate).toISOString().slice(0,10)} → {(s.lastDate).toISOString().slice(0,10)}</span>
        </div>
        <div className="chart">
          <div className="chart-head">
            <span className="chart-title">Cumulative Drawdown</span>
            <span className="chart-sub">peak-to-trough, cum returns</span>
            <div className="chart-legend">
              <span><span className="swatch" style={{ background: 'var(--neg)' }} />drawdown</span>
            </div>
          </div>
          <DrawdownChart values={data.drawdown} dates={data.dates} themeKey={themeKey} height={260} />
        </div>
      </div>
    </div>
  );
}
window.SummaryTab = SummaryTab;

// ─────────────────────────────────────────────────────────────
// RISK TAB
// ─────────────────────────────────────────────────────────────
function RiskTab({ data, themeKey }) {
  const s = data.stats;
  const targetAvg = s.targetDaily;

  return (
    <div className="container">
      <div className="section" style={{ paddingTop: 28 }}>
        <div className="section-head">
          <span className="section-num">§04</span>
          <h2 className="section-title">Deviation Decomposition</h2>
          <span className="section-sub">SEMI-DEVIATIONS · ES · MAX DD</span>
        </div>
        <div className="grid grid-3">
          <Metric label="Downside Dev (daily)"
                  value={fmtPct(s.downsideDevDaily, 2)}
                  cls="neg"
                  sub={`RMS of below-target days`}
                  large />
          <Metric label="Downside Dev (monthly)"
                  value={fmtPct(s.downsideDevMonthly, 1)}
                  cls="neg"
                  sub={`daily × √21`}
                  large />
          <Metric label="Downside Dev (ann.)"
                  value={fmtPct(s.downsideDevAnn, 1)}
                  cls="neg"
                  sub={`daily × √252`}
                  large />
        </div>
        <div className="grid grid-3" style={{ marginTop: 12 }}>
          <Metric label="Upside Dev (ann.)"
                  value={fmtPct(s.upsideDevAnn, 1)}
                  cls="pos"
                  sub={`σ of returns above target × √252`}
                  large />
          <Metric label="Expected Shortfall 5%"
                  value={fmtPct(s.es5, 2)}
                  cls="neg"
                  sub={`mean of worst 5% of days (daily)`}
                  large />
          <Metric label="Max Drawdown"
                  value={fmtPct(s.maxDD, 1)}
                  cls="neg"
                  sub={`worst peak-to-trough`}
                  large />
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <span className="section-num">§05</span>
          <h2 className="section-title">Volatility Entry Signal</h2>
          <span className="section-sub">BUY PRICE · 52WK HIGH − 1× DOWNSIDE DEV</span>
        </div>
        {(() => {
          const high52  = window.fundamentals && window.fundamentals.fiftyTwoWeekHigh;
          const ddAnn   = s.downsideDevAnn;
          if (!high52 || !ddAnn) return <p style={{ color: 'var(--muted)', fontFamily: 'IBM Plex Mono, monospace', fontSize: 12 }}>52-week high data unavailable.</p>;
          const buyPrice   = high52 * (1 - ddAnn);
          const curPrice   = data.lastPrice;
          const distToBuy  = (curPrice != null) ? (curPrice / buyPrice - 1)  : null;
          const distToHigh = (curPrice != null) ? (curPrice / high52  - 1)  : null;
          const atBuy      = distToBuy !== null && distToBuy <= 0;
          return (
            <div className="grid grid-4">
              <Metric label="Buy Price Target"
                      value={fmtMoney(buyPrice)}
                      cls="pos"
                      sub={`52wk high − 1× downside vol`}
                      large />
              <Metric label="52-Week High"
                      value={fmtMoney(high52)}
                      sub={distToHigh !== null ? `current is ${fmtSgn(distToHigh, 1)} from high` : `reference price`}
                      large />
              <Metric label="Downside Dev Applied"
                      value={fmtPct(ddAnn, 1)}
                      cls="neg"
                      sub={`annualized semi-deviation`}
                      large />
              <Metric label="Current vs. Buy Target"
                      value={distToBuy !== null ? fmtSgn(distToBuy, 1) : '—'}
                      cls={distToBuy !== null ? (atBuy ? 'pos' : 'neg') : ''}
                      sub={distToBuy !== null ? (atBuy ? 'at or below — entry zone' : 'above target — not yet') : ''}
                      large />
            </div>
          );
        })()}
      </div>

      <div className="section">
        <div className="section-head">
          <span className="section-num">§06</span>
          <h2 className="section-title">Return Distribution</h2>
          <span className="section-sub">DAILY · {s.nObs} BINS</span>
        </div>
        <div className="chart">
          <div className="chart-head">
            <span className="chart-title">Histogram of Daily Returns</span>
            <span className="chart-sub">split at target return</span>
            <div className="chart-legend">
              <span><span className="swatch" style={{ background: 'var(--neg)' }} />below target</span>
              <span><span className="swatch" style={{ background: 'var(--pos)' }} />above target</span>
              <span>μ &nbsp; ES5%</span>
            </div>
          </div>
          <ReturnHistogram
            returns={data.returns}
            makeHistogram={window.makeHistogram}
            target={targetAvg}
            esVal={s.es5}
            themeKey={themeKey}
            height={320}
          />
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <span className="section-num">§07</span>
          <h2 className="section-title">Distribution Statistics</h2>
          <span className="section-sub">HIGHER MOMENTS · TAIL EVENTS</span>
        </div>
        <div className="grid grid-2" style={{ marginBottom: 16 }}>
          <Metric label="Skewness"
                  value={s.skew.toFixed(2)}
                  sub={Math.abs(s.skew) < 0.2 ? 'near-symmetric' : (s.skew < 0 ? 'left-skewed (fat downside tail)' : 'right-skewed')}
                  cls={s.skew < -0.3 ? 'neg' : (s.skew > 0.3 ? 'pos' : '')}
                  large />
          <Metric label="Excess Kurtosis"
                  value={s.kurt.toFixed(2)}
                  sub={s.kurt > 1 ? 'fat-tailed vs normal' : (s.kurt < -0.5 ? 'thin-tailed' : 'approximately mesokurtic')}
                  cls={s.kurt > 2 ? 'neg' : ''}
                  large />
        </div>

        <div className="grid grid-2">
          <div className="chart" style={{ padding: 0 }}>
            <div className="chart-head" style={{ padding: '14px 18px 4px', marginBottom: 0 }}>
              <span className="chart-title">Worst 5 Days</span>
              <span className="chart-sub">tail of the distribution</span>
            </div>
            <table className="table">
              <thead>
                <tr><th>Date</th><th className="num-r">Return</th></tr>
              </thead>
              <tbody>
                {data.worst.map((w, i) => (
                  <tr key={i}>
                    <td>{fmtDate(w.date)}</td>
                    <td className="num-r neg">{fmtPct(w.r, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="chart" style={{ padding: 0 }}>
            <div className="chart-head" style={{ padding: '14px 18px 4px', marginBottom: 0 }}>
              <span className="chart-title">Best 5 Days</span>
              <span className="chart-sub">positive tail</span>
            </div>
            <table className="table">
              <thead>
                <tr><th>Date</th><th className="num-r">Return</th></tr>
              </thead>
              <tbody>
                {data.best.map((b, i) => (
                  <tr key={i}>
                    <td>{fmtDate(b.date)}</td>
                    <td className="num-r pos">{fmtPct(b.r, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {data.backtest && (() => {
        const bt = data.backtest;
        const benchSym = data.factor.bench.sym;
        if (bt.nTriggers === undefined) return null;
        return (
          <div className="section">
            <div className="section-head">
              <span className="section-num">§08</span>
              <h2 className="section-title">Buy Signal Backtest</h2>
              <span className="section-sub">NON-EXTREME MARKETS · VIX ≤ {bt.vixThreshold} · 12M FORWARD RETURN</span>
            </div>

            <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, color: 'var(--muted)', marginBottom: 14 }}>
              {bt.nExtremeDays} of {bt.nTotalDays} trading days excluded (VIX &gt; {bt.vixThreshold}).
              {' '}Non-overlapping 252-day windows. Small sample — interpret with caution.
            </div>

            {bt.nTriggers === 0 ? (
              <p style={{ color: 'var(--muted)', fontFamily: 'IBM Plex Mono, monospace', fontSize: 12 }}>
                Signal never triggered in normal market conditions (VIX ≤ {bt.vixThreshold}).
              </p>
            ) : (
              <React.Fragment>
                <div className="grid grid-3" style={{ marginBottom: 12 }}>
                  <Metric label="Triggers"
                          value={String(bt.nTriggers)}
                          sub={`non-overlapping · VIX ≤ ${bt.vixThreshold}`} large />
                  <Metric label="Hit Rate (vs 0%)"
                          value={fmtPct(bt.hitRate, 0)}
                          cls={bt.hitRate >= 0.5 ? 'pos' : 'neg'}
                          sub={`${Math.round(bt.hitRate * bt.nTriggers)} / ${bt.nTriggers} positive`}
                          large />
                  <Metric label={`Hit Rate (vs ${benchSym})`}
                          value={bt.hitRateVsBench != null ? fmtPct(bt.hitRateVsBench, 0) : '—'}
                          cls={bt.hitRateVsBench != null ? (bt.hitRateVsBench >= 0.5 ? 'pos' : 'neg') : ''}
                          sub={bt.hitRateVsBench != null ? `beat ${benchSym} over 12m` : ''}
                          large />
                </div>
                <div className="grid grid-3" style={{ marginBottom: 16 }}>
                  <Metric label="Mean 12M Return"
                          value={fmtSgn(bt.meanFwdReturn, 1)}
                          cls={bt.meanFwdReturn >= 0 ? 'pos' : 'neg'}
                          sub="avg payoff per trigger" large />
                  <Metric label="Std of 12M Returns"
                          value={bt.stdFwdReturn != null ? fmtPct(bt.stdFwdReturn, 1) : '—'}
                          sub="dispersion of outcomes" large />
                  <Metric label="Signal / Noise"
                          value={bt.signalNoise != null ? bt.signalNoise.toFixed(2) : '—'}
                          cls={bt.signalNoise != null ? (bt.signalNoise >= 0.3 ? 'pos' : (bt.signalNoise < 0 ? 'neg' : '')) : ''}
                          sub="mean ÷ std of fwd returns" large />
                </div>

                <div className="chart" style={{ padding: 0 }}>
                  <div className="chart-head" style={{ padding: '14px 18px 4px', marginBottom: 0 }}>
                    <span className="chart-title">Trigger Log</span>
                    <span className="chart-sub">entry · 52w high · buy target · 12m fwd return · vs {benchSym}</span>
                  </div>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th className="num-r">Entry</th>
                        <th className="num-r">52W High Used</th>
                        <th className="num-r">Buy Target</th>
                        <th className="num-r">12M Return</th>
                        <th className="num-r">vs {benchSym}</th>
                        <th className="num-r">Result</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bt.triggers.map((t, i) => (
                        <tr key={i}>
                          <td>{t.date}</td>
                          <td className="num-r">{fmtMoney(t.entryPrice)}</td>
                          <td className="num-r">{fmtMoney(t.highPrice)}</td>
                          <td className="num-r">{fmtMoney(t.buyTarget)}</td>
                          <td className={`num-r ${t.positive ? 'pos' : 'neg'}`}>{fmtSgn(t.fwdReturn, 1)}</td>
                          <td className={`num-r ${t.beat === true ? 'pos' : (t.beat === false ? 'neg' : '')}`}>
                            {t.benchReturn != null ? fmtSgn(t.benchReturn, 1) : '—'}
                          </td>
                          <td className={t.positive ? 'pos' : 'neg'}>{t.positive ? '✓' : '✗'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </React.Fragment>
            )}
          </div>
        );
      })()}
    </div>
  );
}
window.RiskTab = RiskTab;

// ─────────────────────────────────────────────────────────────
// FACTOR MODEL TAB
// ─────────────────────────────────────────────────────────────
function FactorTab({ data, themeKey }) {
  const f = data.factor;

  const sigBadge = (t) => {
    const a = Math.abs(t);
    if (a >= 2) return <span className="badge badge-sig">sig ✓</span>;
    if (a >= 1.5) return <span className="badge badge-borderline">~sig</span>;
    return <span className="badge badge-insig">n.s.</span>;
  };

  return (
    <div className="container">
      <div className="section" style={{ paddingTop: 28 }}>
        <div className="section-head">
          <span className="section-num">§04</span>
          <h2 className="section-title">Joint Regression</h2>
          <span className="section-sub">NEWEY-WEST HAC SE · MAXLAGS=5</span>
        </div>
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--line-soft)',
          padding: '14px 18px',
          fontFamily: 'IBM Plex Mono, monospace',
          fontSize: 13,
          color: 'var(--fg-soft)',
          marginBottom: 18,
          display: 'flex',
          gap: 24,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}>
          <span style={{ color: 'var(--muted)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase' }}>MODEL</span>
          <span>
            <span style={{ color: 'var(--fg)' }}>r<sub>stock</sub></span>
            <span style={{ color: 'var(--muted)' }}> = </span>
            <span>α</span>
            <span style={{ color: 'var(--muted)' }}> + </span>
            <span style={{ color: 'var(--primary)' }}>β<sub>mkt</sub> · r<sub>SPY</sub></span>
            <span style={{ color: 'var(--muted)' }}> + </span>
            <span style={{ color: 'var(--accent)' }}>β<sub>vix</sub> · Δlog(VIX)</span>
            <span style={{ color: 'var(--muted)' }}> + </span>
            <span>ε</span>
          </span>
        </div>

        <div className="grid grid-5">
          <Metric label="β_mkt (SPY)"
                  value={f.bench.beta.toFixed(3)}
                  badge={sigBadge(f.bench.t)}
                  sub={`t = ${f.bench.t.toFixed(2)} · 95% CI [${f.bench.ci[0].toFixed(2)}, ${f.bench.ci[1].toFixed(2)}]`}
                  large />
          <Metric label="β_vix (shock)"
                  value={f.vix.beta.toFixed(3)}
                  cls={f.vix.beta < 0 ? 'neg' : 'pos'}
                  badge={sigBadge(f.vix.t)}
                  sub={`t = ${f.vix.t.toFixed(2)} · 95% CI [${f.vix.ci[0].toFixed(3)}, ${f.vix.ci[1].toFixed(3)}]`}
                  large />
          <Metric label="σ_idio (ann.)"
                  value={fmtPct(f.sigma_eps_ann, 1)}
                  sub={`stock-specific risk unexplained`}
                  large />
          <Metric label="α (annualized)"
                  value={fmtSgn(f.alpha_ann, 1)}
                  cls={f.alpha_ann >= 0 ? 'pos' : 'neg'}
                  sub={`avg return unexplained by factors`}
                  large />
          <Metric label="Adj. R²"
                  value={fmtPct(f.adj_r2, 1)}
                  sub={`variance explained by model`}
                  large />
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <span className="section-num">§05</span>
          <h2 className="section-title">Rolling 60-Day β<sub>mkt</sub></h2>
          <span className="section-sub">JOINT REGRESSION DRIFT THROUGH REGIMES</span>
        </div>
        <div className="chart">
          <div className="chart-head">
            <span className="chart-title">β_mkt (SPY)</span>
            <span className="chart-sub">rolling 60-day window</span>
            <div className="chart-legend">
              <span><span className="swatch" style={{ background: 'var(--primary)' }} />β_mkt</span>
              <span>— β=1 reference</span>
            </div>
          </div>
          <RollingBetas rolling={data.rolling} dates={data.dates} themeKey={themeKey} height={240} />
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <span className="section-num">§06</span>
          <h2 className="section-title">Rolling β<sub>vix</sub></h2>
          <span className="section-sub">SHOCK SENSITIVITY OVER TIME</span>
        </div>
        <div className="chart">
          <div className="chart-head">
            <span className="chart-title">β_vix (Δlog VIX)</span>
            <span className="chart-sub">negative = stock falls when vol rises</span>
            <div className="chart-legend">
              <span><span className="swatch" style={{ background: 'var(--accent)' }} />β_vix</span>
            </div>
          </div>
          <RollingVixBeta rolling={data.rolling} dates={data.dates} themeKey={themeKey} height={220} />
        </div>
      </div>
    </div>
  );
}
window.FactorTab = FactorTab;

// ─────────────────────────────────────────────────────────────
// RESEARCH TAB
// ─────────────────────────────────────────────────────────────
function ResearchTab({ data, fundamentals, research, themeKey }) {
  const [open, setOpen] = useStateT({ 0: true });
  const toggle = (i) => setOpen(o => ({ ...o, [i]: !o[i] }));

  // research is an object: {source, filed10k, filed8k, sections, error}
  const r = (research && !Array.isArray(research)) ? research : { sections: research || [] };
  const sections = r.sections || [];
  const fmtFiled = (d) => d ? d.replace(/-/g, '.') : 'n/a';

  // plain paragraphs; preserve single line breaks
  const renderBody = (text) => {
    const parts = text.split('\n\n');
    return parts.map((p, i) => {
      const html = p
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n- /g, '\n• ');
      return (
        <p key={i} dangerouslySetInnerHTML={{ __html: html.replace(/\n/g, '<br/>') }} />
      );
    });
  };

  // bold the numbers in driver quotes
  const hlNums = (t) => t
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/(\$\s?[\d,.]+\s?(?:billion|million|thousand)?|\b\d[\d,.]*\s?%)/gi, '<strong>$1</strong>');
  const drivers = (r.drivers && r.drivers.buckets) || [];

  return (
    <div className="container">
      {drivers.length > 0 && (
        <div className="section" style={{ paddingTop: 28 }}>
          <div className="section-head">
            <span className="section-num">§04</span>
            <h2 className="section-title">Earnings Drivers</h2>
            <span className="section-sub">EXTRACTIVE DIGEST · VERBATIM FILING SENTENCES · NO TOKENS</span>
          </div>
          <div className="grid grid-2">
            {drivers.map((b, bi) => (
              <div key={bi} className="chart" style={{ padding: '14px 18px' }}>
                <div className="chart-head" style={{ marginBottom: 8 }}>
                  <span className="chart-title">{b.title}</span>
                  <span className="chart-sub">{b.items.length} extracts</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {b.items.map((it, ii) => (
                    <div key={ii} style={{
                      fontSize: 12.5, lineHeight: 1.55, color: 'var(--fg-soft)',
                      borderLeft: '2px solid var(--accent)', paddingLeft: 10,
                    }}>
                      <span dangerouslySetInnerHTML={{ __html: hlNums(it.text) }} />
                      <span style={{
                        fontFamily: 'IBM Plex Mono, monospace', fontSize: 9.5,
                        color: 'var(--muted-soft)', marginLeft: 8, letterSpacing: '0.06em',
                      }}>{it.src}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="section" style={{ paddingTop: drivers.length ? 0 : 28 }}>
        <div className="section-head">
          <span className="section-num">{drivers.length ? '§05' : '§04'}</span>
          <h2 className="section-title">Primary-Source Research</h2>
          <span className="section-sub">SEC EDGAR · 10-K ITEMS 1 / 1A / 7 + LATEST EARNINGS 8-K · NO TOKENS</span>
        </div>

        <div style={{
          display: 'flex',
          gap: 14,
          marginBottom: 16,
          padding: '12px 14px',
          background: 'var(--bg-card)',
          border: '1px solid var(--line-soft)',
          alignItems: 'center',
          fontFamily: 'IBM Plex Mono, monospace',
          fontSize: 11,
          color: 'var(--muted)',
          flexWrap: 'wrap',
        }}>
          <span style={{ color: sections.length ? 'var(--pos)' : 'var(--neg)' }}>
            ● {sections.length ? `${sections.length} SECTIONS EXTRACTED` : 'NO FILINGS RETRIEVED'}
          </span>
          <span><span style={{ color: 'var(--muted-soft)' }}>10-K FILED</span> {fmtFiled(r.filed10k)}</span>
          <span><span style={{ color: 'var(--muted-soft)' }}>8-K FILED</span> {fmtFiled(r.filed8k)}</span>
          <span style={{ marginLeft: 'auto', color: 'var(--muted-soft)' }}>
            EXPORT .DOCX IN SIDEBAR
          </span>
        </div>

        {sections.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontFamily: 'IBM Plex Mono, monospace', fontSize: 12 }}>
            {r.error
              ? `SEC EDGAR error: ${r.error}`
              : 'No filings found for this ticker (foreign issuers and ETFs do not file 10-Ks).'}
          </p>
        ) : (
          <div className="accordion">
            {sections.map((sec, i) => (
              <div key={i} className={`accordion-row ${open[i] ? 'open' : ''}`}>
                <div className="accordion-head" onClick={() => toggle(i)}>
                  <span className="accordion-num">{String(i + 1).padStart(2, '0')}</span>
                  <span className="accordion-title">{sec.title}</span>
                  <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: 'var(--muted-soft)', marginLeft: 'auto', marginRight: 10 }}>
                    FILED {fmtFiled(sec.filed)}
                  </span>
                  <span className="accordion-chev">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </span>
                </div>
                {open[i] && (
                  <div className="accordion-body">
                    {renderBody(sec.body)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
window.ResearchTab = ResearchTab;

// ─────────────────────────────────────────────────────────────
// QUANT SIGNALS TAB — vol regime · momentum · EWMA sizing · IV/RV
// ─────────────────────────────────────────────────────────────
function SignalsTab({ data, themeKey }) {
  const q = window.quant || {};
  const reg = q.regime || {};
  const cur = reg.current || {};
  const mom = q.momentum || {};
  const ew  = q.ewma || {};
  const ewc = ew.current || {};
  const iv  = q.ivrv || {};

  const regimeCls = cur.regime === 'CONTANGO' ? 'pos' : (cur.regime === 'BACKWARDATION' ? 'neg' : '');

  return (
    <div className="container">
      {/* ── Vol regime ── */}
      <div className="section" style={{ paddingTop: 28 }}>
        <div className="section-head">
          <span className="section-num">§04</span>
          <h2 className="section-title">Volatility Regime</h2>
          <span className="section-sub">VIX TERM STRUCTURE · VARIANCE RISK PREMIUM · MARKET-WIDE</span>
        </div>
        {!reg.dates ? (
          <p style={{ color: 'var(--muted)', fontFamily: 'IBM Plex Mono, monospace', fontSize: 12 }}>
            Regime data unavailable.</p>
        ) : (
          <React.Fragment>
            <div className="grid grid-5" style={{ marginBottom: 16 }}>
              <Metric label="Regime"
                      value={cur.regime || '—'}
                      cls={regimeCls}
                      sub={cur.stress ? 'VIX > 25 — stressed tape' : 'vol term structure state'}
                      large />
              <Metric label="VIX"
                      value={cur.vix != null ? cur.vix.toFixed(1) : '—'}
                      cls={cur.stress ? 'neg' : ''}
                      sub={cur.vixPctile != null ? `${(cur.vixPctile * 100).toFixed(0)}th pctile of lookback` : ''}
                      large />
              <Metric label="VIX3M / VIX"
                      value={cur.slope != null ? cur.slope.toFixed(2) : '—'}
                      cls={cur.slope != null ? (cur.slope >= 1 ? 'pos' : 'neg') : ''}
                      sub={cur.slope != null ? (cur.slope >= 1 ? '> 1 contango — calm' : '< 1 backwardation — stress') : 'needs ^VIX3M'}
                      large />
              <Metric label="SPY Realized (21d)"
                      value={cur.realized != null ? `${cur.realized.toFixed(1)}` : '—'}
                      sub="annualized vol points"
                      large />
              <Metric label="Variance Risk Premium"
                      value={cur.vrp != null ? `${cur.vrp >= 0 ? '+' : ''}${cur.vrp.toFixed(1)}` : '—'}
                      cls={cur.vrp != null ? (cur.vrp >= 0 ? 'pos' : 'neg') : ''}
                      sub={cur.vrpPctile != null
                        ? `VIX − realized · ${(cur.vrpPctile * 100).toFixed(0)}th pctile`
                        : 'VIX − realized'}
                      large />
            </div>
            <div className="interp" style={{ marginBottom: 16 }}>
              Implied above realized (positive VRP) is the normal state — option sellers collect the premium.
              A <strong>negative VRP</strong> or an inverted term structure (VIX3M/VIX &lt; 1) flags a stress
              regime where mean-reversion signals weaken and momentum signals decay fast. Extremes in either
              direction tend to mean-revert.
            </div>
            <div className="chart">
              <div className="chart-head">
                <span className="chart-title">Implied vs Realized Volatility</span>
                <span className="chart-sub">VIX vs SPY 21d realized (annualized, vol points)</span>
                <div className="chart-legend">
                  <span><span className="swatch" style={{ background: 'var(--primary)' }} />VIX</span>
                  <span><span className="swatch" style={{ background: 'var(--accent)' }} />realized</span>
                </div>
              </div>
              <DualLineChart
                dates={reg.dates}
                a={{ label: 'VIX', values: reg.vix }}
                b={{ label: 'RV', values: reg.realized }}
                fmtL={(v) => v.toFixed(0)}
                themeKey={themeKey} height={240} />
            </div>
          </React.Fragment>
        )}
      </div>

      {/* ── Momentum ── */}
      <div className="section">
        <div className="section-head">
          <span className="section-num">§05</span>
          <h2 className="section-title">Vol-Adjusted Momentum</h2>
          <span className="section-sub">Z-SCORES VS {data.ticker}'S OWN HISTORY · RETURN ÷ 63D REALIZED VOL</span>
        </div>
        {!mom.signals ? (
          <p style={{ color: 'var(--muted)', fontFamily: 'IBM Plex Mono, monospace', fontSize: 12 }}>
            Needs ≥ 300 trading days of history.</p>
        ) : (
          <React.Fragment>
            <div className="grid grid-3" style={{ marginBottom: 16 }}>
              <Metric label="Composite Score"
                      value={mom.composite != null ? `${mom.composite >= 0 ? '+' : ''}${mom.composite.toFixed(2)}σ` : '—'}
                      cls={mom.composite != null ? (mom.composite >= 0.3 ? 'pos' : (mom.composite <= -0.3 ? 'neg' : '')) : ''}
                      sub="mean of all signal z-scores"
                      large />
              <Metric label="RSI (14)"
                      value={mom.rsi != null ? mom.rsi.toFixed(1) : '—'}
                      cls={mom.rsi != null ? (mom.rsi >= 70 ? 'neg' : (mom.rsi <= 30 ? 'pos' : '')) : ''}
                      sub={mom.rsi != null ? (mom.rsi >= 70 ? 'overbought' : (mom.rsi <= 30 ? 'oversold' : 'neutral band')) : ''}
                      large />
              <Metric label="vs 200DMA"
                      value={mom.dist200 != null ? fmtSgn(mom.dist200, 1) : '—'}
                      cls={mom.dist200 != null ? (mom.dist200 >= 0 ? 'pos' : 'neg') : ''}
                      sub="distance from 200-day average"
                      large />
            </div>
            <div className="chart">
              <div className="chart-head">
                <span className="chart-title">Signal Z-Scores</span>
                <span className="chart-sub">positive = stronger than this stock's historical norm</span>
              </div>
              <ZBars signals={mom.signals} themeKey={themeKey} />
            </div>
          </React.Fragment>
        )}
      </div>

      {/* ── EWMA vol + sizing ── */}
      <div className="section">
        <div className="section-head">
          <span className="section-num">§06</span>
          <h2 className="section-title">EWMA Vol Forecast &amp; Sizing</h2>
          <span className="section-sub">RISKMETRICS λ = {ewc.lambda != null ? ewc.lambda : '0.94'} · VOL TARGET {ewc.targetVol != null ? `${(ewc.targetVol * 100).toFixed(0)}%` : '15%'}</span>
        </div>
        {!ew.dates ? (
          <p style={{ color: 'var(--muted)', fontFamily: 'IBM Plex Mono, monospace', fontSize: 12 }}>
            Insufficient history for EWMA forecast.</p>
        ) : (
          <React.Fragment>
            <div className="grid grid-4" style={{ marginBottom: 16 }}>
              <Metric label="EWMA Vol Forecast"
                      value={fmtPct(ewc.forecast, 1)}
                      sub="annualized, reacts fast to shocks"
                      large />
              <Metric label="Realized Vol (21d)"
                      value={fmtPct(ewc.realized, 1)}
                      sub="trailing window"
                      large />
              <Metric label="Forecast / Realized"
                      value={ewc.ratio != null ? `${ewc.ratio.toFixed(2)}×` : '—'}
                      cls={ewc.ratio != null ? (ewc.ratio > 1.1 ? 'neg' : (ewc.ratio < 0.9 ? 'pos' : '')) : ''}
                      sub={ewc.ratio != null ? (ewc.ratio > 1.1 ? 'vol rising — de-risk' : (ewc.ratio < 0.9 ? 'vol fading — re-risk' : 'stable')) : ''}
                      large />
              <Metric label="Vol-Target Weight"
                      value={ewc.weight != null ? `${(ewc.weight * 100).toFixed(0)}%` : '—'}
                      cls={ewc.weight != null ? (ewc.weight >= 1 ? 'pos' : 'neg') : ''}
                      sub={`target ÷ forecast, capped at ${ewc.maxWeight != null ? (ewc.maxWeight * 100).toFixed(0) : 200}%`}
                      large />
            </div>
            <div className="chart">
              <div className="chart-head">
                <span className="chart-title">EWMA vs Realized Volatility — {data.ticker}</span>
                <span className="chart-sub">EWMA leads realized at vol inflections</span>
                <div className="chart-legend">
                  <span><span className="swatch" style={{ background: 'var(--primary)' }} />EWMA</span>
                  <span><span className="swatch" style={{ background: 'var(--accent)' }} />realized 21d</span>
                </div>
              </div>
              <DualLineChart
                dates={ew.dates}
                a={{ label: 'EWMA', values: ew.ewma }}
                b={{ label: 'RV', values: ew.realized }}
                fmtL={(v) => `${(v * 100).toFixed(0)}%`}
                themeKey={themeKey} height={220} />
            </div>
          </React.Fragment>
        )}
      </div>

      {/* ── IV / RV ── */}
      <div className="section">
        <div className="section-head">
          <span className="section-num">§07</span>
          <h2 className="section-title">Implied vs Realized — {data.ticker}</h2>
          <span className="section-sub">ATM OPTION CHAIN · NEAREST ~30 DTE EXPIRY</span>
        </div>
        {iv.iv == null ? (
          <p style={{ color: 'var(--muted)', fontFamily: 'IBM Plex Mono, monospace', fontSize: 12 }}>
            Option chain unavailable for this ticker (no listed options or data fetch failed).
          </p>
        ) : (
          <React.Fragment>
            <div className="grid grid-4" style={{ marginBottom: 12 }}>
              <Metric label="ATM Implied Vol"
                      value={fmtPct(iv.iv, 1)}
                      sub={`expiry ${iv.expiry} · ${iv.dte} DTE`}
                      large />
              <Metric label="Realized Vol (21d)"
                      value={fmtPct(iv.rv, 1)}
                      sub="trailing, annualized"
                      large />
              <Metric label="IV / RV"
                      value={iv.ratio != null ? `${iv.ratio.toFixed(2)}×` : '—'}
                      cls={iv.ratio != null ? (iv.ratio >= 1.2 ? 'pos' : (iv.ratio <= 0.9 ? 'neg' : '')) : ''}
                      sub={iv.ratio != null ? (iv.ratio >= 1.2 ? 'rich options — premium selling zone' : (iv.ratio <= 0.9 ? 'cheap options — long-vol zone' : 'fair')) : ''}
                      large />
              <Metric label="Spot Used"
                      value={iv.spot != null ? fmtMoney(iv.spot) : '—'}
                      sub="ATM = 3 strikes nearest spot, calls + puts"
                      large />
            </div>
            <div className="interp">
              IV persistently above RV is the single-name variance risk premium. Extreme IV/RV
              (&gt; ~1.4×) often precedes vol mean-reversion; IV <em>below</em> RV ahead of catalysts is rare
              and usually mispriced. Snapshot only — earnings proximity inflates IV mechanically.
            </div>
          </React.Fragment>
        )}
      </div>
    </div>
  );
}
window.SignalsTab = SignalsTab;

// ─────────────────────────────────────────────────────────────
// FUNDAMENTALS TAB — price vs fundamentals overlay + table
// ─────────────────────────────────────────────────────────────
function FundamentalsTab({ data, themeKey }) {
  const fh = window.fundHistory || {};
  const metrics = fh.metrics || {};
  const [basis, setBasis] = useStateT('annual');

  // Merge points into one table keyed by date, for the active basis
  const rows = useMemoT(() => {
    const byDate = {};
    ['revenue', 'netIncome', 'eps', 'roe', 'grossMargin', 'netMargin'].forEach(k => {
      const m = metrics[k];
      if (!m) return;
      (m[basis] || []).forEach(p => {
        if (!byDate[p.d]) byDate[p.d] = { d: p.d };
        byDate[p.d][k] = p.v;
      });
    });
    return Object.values(byDate).sort((x, y) => y.d.localeCompare(x.d));
  }, [metrics, basis]);

  const basisBtn = (active) => ({
    fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, letterSpacing: '0.08em',
    padding: '6px 14px', cursor: 'pointer',
    border: `1px solid ${active ? 'var(--accent)' : 'var(--line)'}`,
    background: active ? 'var(--accent)' : 'var(--bg-card)',
    color: active ? 'var(--bg-card)' : 'var(--muted)',
  });

  return (
    <div className="container">
      <div className="section" style={{ paddingTop: 28 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
          <button style={basisBtn(basis === 'annual')} onClick={() => setBasis('annual')}>ANNUAL</button>
          <button style={basisBtn(basis === 'quarterly')} onClick={() => setBasis('quarterly')}>QUARTERLY</button>
          <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: 'var(--muted)', marginLeft: 12 }}>
            SOURCE · {fh.source || 'n/a'}
          </span>
        </div>
        <div className="section-head">
          <span className="section-num">§04</span>
          <h2 className="section-title">Price vs Fundamentals</h2>
          <span className="section-sub">DAILY PRICE · {basis === 'annual' ? 'FISCAL-YEAR' : 'QUARTERLY'} REPORTED POINTS</span>
        </div>
        <div className="interp" style={{ marginBottom: 16 }}>
          In <strong>indexed</strong> mode both series start at 100 — price running ahead of the
          fundamental line means multiple expansion; lagging means compression or de-rating.
          Fundamental points step on reported fiscal-period dates, so the line is honest about
          how sparse the data is.
        </div>
        <div className="chart">
          <FundamentalOverlay data={data} fundHistory={fh} basis={basis} themeKey={themeKey} height={340} />
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <span className="section-num">§05</span>
          <h2 className="section-title">Revenue &amp; Margins</h2>
          <span className="section-sub">LAST 5 YEARS · {basis === 'annual' ? 'FISCAL YEARS' : 'QUARTERS'} · REVENUE BARS ($) · GROSS / NET MARGIN LINES (%)</span>
        </div>
        <div className="chart">
          <div className="chart-head">
            <span className="chart-title">Revenue, Gross Margin, Net Margin</span>
            <span className="chart-sub">margins diverging from flat revenue = mix/efficiency story</span>
            <div className="chart-legend">
              <span><span className="swatch" style={{ background: 'var(--primary)' }} />revenue</span>
              <span><span className="swatch" style={{ background: 'var(--pos)' }} />gross margin</span>
              <span><span className="swatch" style={{ background: 'var(--accent)' }} />net margin</span>
            </div>
          </div>
          <RevenueMarginsChart fundHistory={fh} basis={basis} themeKey={themeKey} height={300} yearsBack={5} />
        </div>
      </div>

      {rows.length > 0 && (
        <div className="section">
          <div className="section-head">
            <span className="section-num">§06</span>
            <h2 className="section-title">Reported Periods</h2>
            <span className="section-sub">{basis === 'annual' ? 'FISCAL YEARS' : 'QUARTERS'} · SOURCE · {(fh.source || 'n/a').toUpperCase()}</span>
          </div>
          <div className="chart" style={{ padding: 0 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Period End</th><th>Basis</th>
                  {/* basis column reflects the global ANNUAL/QUARTERLY toggle */}
                  <th className="num-r">Revenue</th>
                  <th className="num-r">Gross Mgn</th>
                  <th className="num-r">Net Income</th>
                  <th className="num-r">Net Mgn</th>
                  <th className="num-r">Diluted EPS</th>
                  <th className="num-r">ROE</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td>{r.d}</td>
                    <td>{basis === 'annual' ? 'FY' : 'Q'}</td>
                    <td className="num-r">{r.revenue != null ? fmtCompact(r.revenue) : '—'}</td>
                    <td className="num-r">{r.grossMargin != null ? fmtPct(r.grossMargin, 1) : '—'}</td>
                    <td className={`num-r ${r.netIncome != null ? (r.netIncome >= 0 ? 'pos' : 'neg') : ''}`}>
                      {r.netIncome != null ? fmtCompact(r.netIncome) : '—'}</td>
                    <td className={`num-r ${r.netMargin != null ? (r.netMargin >= 0 ? 'pos' : 'neg') : ''}`}>
                      {r.netMargin != null ? fmtPct(r.netMargin, 1) : '—'}</td>
                    <td className="num-r">{r.eps != null ? `$${r.eps.toFixed(2)}` : '—'}</td>
                    <td className={`num-r ${r.roe != null ? (r.roe >= 0 ? 'pos' : 'neg') : ''}`}>
                      {r.roe != null ? fmtPct(r.roe, 1) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {(() => {
        const cr = window.credit || {};
        const mentions = cr.mentions || [];
        const hasMetrics = cr.zScore != null || cr.totalDebt != null || cr.coverage != null;
        if (!hasMetrics && !mentions.length) return null;
        const zoneCls = cr.zZone === 'SAFE' ? 'pos' : (cr.zZone === 'DISTRESS' ? 'neg' : '');
        const fmtX = (v) => v == null ? '—' : `${v.toFixed(1)}×`;
        const co = cr.components;
        return (
          <div className="section">
            <div className="section-head">
              <span className="section-num">§07</span>
              <h2 className="section-title">Credit Quality</h2>
              <span className="section-sub">
                SEC XBRL · BALANCE SHEET AS OF {cr.asOf || 'n/a'} · FLOWS FY {cr.fyEnd || 'n/a'}
              </span>
            </div>
            {hasMetrics && (
              <div className="grid grid-4" style={{ marginBottom: 12 }}>
                <Metric label="Altman Z-Score"
                        value={cr.zScore != null ? cr.zScore.toFixed(2) : '—'}
                        cls={zoneCls}
                        badge={cr.zZone ? <span className={`badge ${cr.zZone === 'SAFE' ? 'badge-sig' : (cr.zZone === 'DISTRESS' ? 'badge-insig' : 'badge-borderline')}`}>{cr.zZone}</span> : ''}
                        sub="safe > 2.99 · grey 1.81–2.99 · distress < 1.81"
                        large />
                <Metric label="Interest Coverage"
                        value={fmtX(cr.coverage)}
                        cls={cr.coverage != null ? (cr.coverage >= 8 ? 'pos' : (cr.coverage < 3 ? 'neg' : '')) : ''}
                        sub={cr.coverage != null ? 'EBIT ÷ interest expense' : 'no/immaterial interest expense reported'}
                        large />
                <Metric label="Debt / EBITDA"
                        value={fmtX(cr.debtEbitda)}
                        cls={cr.debtEbitda != null ? (cr.debtEbitda <= 1.5 ? 'pos' : (cr.debtEbitda > 3.5 ? 'neg' : '')) : ''}
                        sub={cr.ebitda != null ? `EBITDA ${fmtCompact(cr.ebitda)}` : 'EBITDA unavailable (no D&A tag)'}
                        large />
                <Metric label="Net Debt"
                        value={cr.netDebt != null ? fmtCompact(cr.netDebt) : '—'}
                        cls={cr.netDebt != null ? (cr.netDebt <= 0 ? 'pos' : '') : ''}
                        sub={`debt ${cr.totalDebt != null ? fmtCompact(cr.totalDebt) : '—'} − cash ${cr.cash != null ? fmtCompact(cr.cash) : '—'}`}
                        large />
              </div>
            )}
            {co && (
              <div className="grid grid-5" style={{ marginBottom: 14 }}>
                <Metric label="WC / TA" value={co.wcTa.toFixed(2)} sub="liquidity · ×1.2" />
                <Metric label="RE / TA" value={co.reTa.toFixed(2)} sub="earned capital · ×1.4" />
                <Metric label="EBIT / TA" value={co.ebitTa.toFixed(2)} sub="productivity · ×3.3" />
                <Metric label="MktCap / TL" value={co.mcapTl.toFixed(2)} sub="solvency cushion · ×0.6" />
                <Metric label="Sales / TA" value={co.salesTa.toFixed(2)} sub="asset turnover · ×1.0" />
              </div>
            )}
            {mentions.length > 0 && (
              <div className="chart" style={{ padding: '14px 18px' }}>
                <div className="chart-head" style={{ marginBottom: 8 }}>
                  <span className="chart-title">Disclosed Agency Ratings</span>
                  <span className="chart-sub">verbatim from the filings — issuers are not required to disclose</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {mentions.map((m, i) => (
                    <div key={i} style={{
                      fontSize: 12.5, lineHeight: 1.55, color: 'var(--fg-soft)',
                      borderLeft: '2px solid var(--primary)', paddingLeft: 10,
                    }}>
                      {m.text}
                      <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 9.5, color: 'var(--muted-soft)', marginLeft: 8 }}>{m.src}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="interp" style={{ marginTop: 12 }}>
              Z-score is a bankruptcy-risk model, not a rating — but it tracks rating zones well for
              industrials. It is unreliable for banks and insurers (their balance sheets break the
              ratios). Agency ratings themselves are proprietary; the quotes above are what the
              company chose to disclose in its own filings.
            </div>
          </div>
        );
      })()}
    </div>
  );
}
window.FundamentalsTab = FundamentalsTab;

// ─────────────────────────────────────────────────────────────
// INDUSTRY ANALYSIS TAB — Seeking Alpha–style peer comparison
// Graded valuation + profitability vs the sector peer group,
// plus a side-by-side comparison matrix.
// ─────────────────────────────────────────────────────────────
const GRADE_COLOR = {
  A: '#1a7d3c', B: '#3aa856', C: '#c79100', D: '#c0392b', F: '#922b21',
};

function GradeChip({ grade }) {
  if (!grade) return <span style={{ color: 'var(--muted-soft)' }}>—</span>;
  const bg = GRADE_COLOR[grade[0]] || 'var(--muted)';
  return (
    <span style={{
      background: bg, color: '#fff', padding: '2px 8px', borderRadius: 4,
      fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700, fontSize: 11,
      letterSpacing: '0.02em', display: 'inline-block', minWidth: 30, textAlign: 'center',
    }}>{grade}</span>
  );
}

function indFmt(v, fmt) {
  if (v == null || isNaN(v)) return '—';
  return fmt === 'pct' ? fmtPct(v, 2) : fmtNum(v, 2);
}

function indDiff(v, favorable) {
  if (v == null || isNaN(v)) return <span style={{ color: 'var(--muted-soft)' }}>NM</span>;
  const cls = favorable ? 'pos' : 'neg';
  const sign = v > 0 ? '+' : '';
  return <span className={cls}>{sign}{v.toFixed(2)}%</span>;
}

function GradeTable({ rows, focus }) {
  return (
    <div className="chart" style={{ padding: 0 }}>
      <table className="table">
        <thead>
          <tr>
            <th>Metric</th>
            <th>Grade</th>
            <th className="num-r">{focus}</th>
            <th className="num-r">Sector Median</th>
            <th className="num-r">% Diff. to Sector</th>
            <th className="num-r">{focus} 5Y Avg</th>
            <th className="num-r">% Diff. to 5Y Avg</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const low = r.direction === 'low';
            // favorable vs sector: cheaper (low) or higher (high) than peers
            const favSec = r.pctSector == null ? false
              : (low ? r.pctSector < 0 : r.pctSector > 0);
            const fav5y = r.pct5y == null ? false
              : (low ? r.pct5y < 0 : r.pct5y > 0);
            return (
              <tr key={i}>
                <td>{r.label}</td>
                <td><GradeChip grade={r.grade} /></td>
                <td className="num-r" style={{ fontWeight: 600 }}>{indFmt(r.value, r.fmt)}</td>
                <td className="num-r">{indFmt(r.median, r.fmt)}</td>
                <td className="num-r">{indDiff(r.pctSector, favSec)}</td>
                <td className="num-r">{indFmt(r.fiveYr, r.fmt)}</td>
                <td className="num-r">{indDiff(r.pct5y, fav5y)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function IndustryTab() {
  const ind = window.industry || {};
  const hasData = ind.focus && (ind.valuation || []).length > 0;

  if (!hasData) {
    return (
      <div className="container">
        <div className="interp" style={{ marginTop: 28 }}>
          Industry analysis is unavailable for this ticker — no peer fundamentals
          were returned. Try entering peer tickers in the sidebar.
        </div>
      </div>
    );
  }

  const peerLabel = (ind.peers || []).join(' · ');

  return (
    <div className="container">
      <div className="section" style={{ paddingTop: 28 }}>
        <div className="section-head">
          <span className="section-num">§07</span>
          <h2 className="section-title">Industry Analysis</h2>
          <span className="section-sub">
            {ind.focus} · {ind.industry} · GRADED VS {(ind.peers || []).length} PEERS
          </span>
        </div>
        <div className="interp" style={{ marginBottom: 16 }}>
          Each metric is graded by <strong>percentile rank within the peer group</strong> —
          for valuation, cheaper than peers scores higher; for profitability, more
          profitable scores higher. Peer median and % differences are computed across
          the competitor set below.
          {ind.peerBasis ? <span> <strong>Comparison set:</strong> {ind.peerBasis}.</span> : null}
          <br /><strong>Peers:</strong> {peerLabel || '—'}.
          <span style={{ color: 'var(--muted)' }}> Override the peer list anytime via the
          “Peer tickers” box in the sidebar.</span>
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <span className="section-num">§07.1</span>
          <h2 className="section-title">Valuation Measures</h2>
          <span className="section-sub">LOWER MULTIPLE VS PEERS = MORE ATTRACTIVE GRADE</span>
        </div>
        <GradeTable rows={ind.valuation} focus={ind.focus} />
      </div>

      <div className="section">
        <div className="section-head">
          <span className="section-num">§07.2</span>
          <h2 className="section-title">Profitability</h2>
          <span className="section-sub">HIGHER MARGIN / RETURN VS PEERS = MORE ATTRACTIVE GRADE</span>
        </div>
        <GradeTable rows={ind.profitability} focus={ind.focus} />
      </div>

      <div className="section">
        <div className="section-head">
          <span className="section-num">§07.3</span>
          <h2 className="section-title">Peer Comparison</h2>
          <span className="section-sub">{ind.focus} VS PEER GROUP · SIDE BY SIDE</span>
        </div>
        <div className="chart" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Metric</th>
                {(ind.tickers || []).map((t, i) => (
                  <th key={i} className="num-r"
                      style={t === ind.focus ? { color: 'var(--accent)' } : null}>{t}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(ind.matrix || []).map((row, i) => (
                <tr key={i}>
                  <td>{row.label}</td>
                  {(ind.tickers || []).map((t, j) => (
                    <td key={j} className="num-r"
                        style={t === ind.focus ? { fontWeight: 600, color: 'var(--accent)' } : null}>
                      {indFmt(row.values[t], row.fmt)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="interp" style={{ marginTop: 12 }}>
          Grades approximate Seeking Alpha's relative methodology but are computed
          independently from this peer set — they are not Seeking Alpha's grades.
          The <strong>{ind.focus} 5Y Avg</strong> column shows the company vs its own
          history: the P/E average is computed from daily price × reported annual EPS
          over the last five fiscal years, and the margin/return averages from reported
          fundamentals. Other valuation-multiple histories aren't wired yet and show “—”.
        </div>
      </div>
    </div>
  );
}
window.IndustryTab = IndustryTab;

// ─────────────────────────────────────────────────────────────
// MACRO ECONOMICS TAB — G7 yield curves + GDP / growth
// ─────────────────────────────────────────────────────────────
function MacroCurveChart({ curve, color }) {
  const W = 720, H = 300, padL = 46, padR = 16, padT = 18, padB = 34;
  const pts = (curve || []).filter(p => p.y != null);
  if (pts.length < 2) {
    return <div className="interp">Not enough data to plot this curve.</div>;
  }
  const ys = pts.map(p => p.y);
  let lo = Math.min(...ys), hi = Math.max(...ys);
  const pad = (hi - lo) * 0.2 || 0.5; lo -= pad; hi += pad;
  const n = pts.length;
  const x = i => padL + (i / (n - 1)) * (W - padL - padR);
  const y = v => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.y).toFixed(1)}`).join(' ');
  const gridY = [0, 0.25, 0.5, 0.75, 1].map(f => lo + f * (hi - lo));
  return (
    <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`} role="img">
      {gridY.map((g, i) => (
        <g key={i}>
          <line x1={padL} x2={W - padR} y1={y(g)} y2={y(g)} stroke="var(--line-soft)" strokeWidth="1" />
          <text x={padL - 8} y={y(g) + 3} textAnchor="end" fontSize="10"
                fill="var(--muted)" fontFamily="IBM Plex Mono, monospace">{g.toFixed(1)}</text>
        </g>
      ))}
      <path d={path} fill="none" stroke={color} strokeWidth="2" />
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(p.y)} r="4"
                  fill={p.interp ? 'var(--bg-card)' : color}
                  stroke={color} strokeWidth="2" />
          <text x={x(i)} y={H - 18} textAnchor="middle" fontSize="11"
                fill="var(--muted)" fontFamily="IBM Plex Mono, monospace">{p.tenor}</text>
          <text x={x(i)} y={y(p.y) - 9} textAnchor="middle" fontSize="9.5"
                fill="var(--fg-soft)" fontFamily="IBM Plex Mono, monospace">{p.y.toFixed(2)}</text>
        </g>
      ))}
    </svg>
  );
}

function MacroGrowthChart({ series }) {
  const W = 720, H = 220, padL = 36, padR = 12, padT = 14, padB = 26;
  const pts = (series || []).filter(p => p.growth != null);
  if (!pts.length) return <div className="interp">No growth data.</div>;
  const gs = pts.map(p => p.growth);
  const lo = Math.min(0, ...gs), hi = Math.max(0, ...gs);
  const n = pts.length, bw = (W - padL - padR) / n * 0.62;
  const x = i => padL + (i + 0.5) / n * (W - padL - padR);
  const y = v => padT + (1 - (v - lo) / (hi - lo || 1)) * (H - padT - padB);
  const zeroY = y(0);
  return (
    <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`} role="img">
      <line x1={padL} x2={W - padR} y1={zeroY} y2={zeroY} stroke="var(--line)" strokeWidth="1" />
      {pts.map((p, i) => {
        const yy = y(p.growth);
        const top = Math.min(yy, zeroY), h = Math.abs(yy - zeroY);
        const col = p.growth >= 0 ? 'var(--pos)' : 'var(--neg)';
        return (
          <g key={i}>
            <rect x={x(i) - bw / 2} y={top} width={bw} height={Math.max(h, 0.5)}
                  fill={col} opacity={p.proj ? 0.4 : 0.95} />
            <text x={x(i)} y={H - 8} textAnchor="middle" fontSize="9"
                  fill="var(--muted)" fontFamily="IBM Plex Mono, monospace">{`'${String(p.year).slice(2)}`}</text>
          </g>
        );
      })}
    </svg>
  );
}

const TENOR_COLORS = ['#7fb0a0', '#3a9d86', '#d9a400', '#c1471a', '#7a4dab', '#1f4e3d'];

function MacroHistoryChart({ history }) {
  const W = 960, H = 340, padL = 44, padR = 14, padT = 14, padB = 28;
  const series = (history && history.series) || [];
  const tenors = (history && history.tenors) || [];
  if (series.length < 2) return <div className="interp">No rate history available.</div>;
  const tnum = d => { const p = d.split('-'); return (+p[0]) + (+p[1] - 1) / 12; };
  const xs = series.map(s => tnum(s.d));
  const xmin = xs[0], xmax = xs[xs.length - 1];
  let lo = Infinity, hi = -Infinity;
  series.forEach(s => tenors.forEach(t => {
    const v = s.vals[t]; if (v != null) { if (v < lo) lo = v; if (v > hi) hi = v; }
  }));
  lo = Math.min(lo, 0); hi = hi * 1.05;
  const X = v => padL + ((v - xmin) / (xmax - xmin)) * (W - padL - padR);
  const Y = v => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);
  const recs = history.recessions || [];
  const years = []; for (let y = Math.ceil(xmin / 5) * 5; y <= xmax; y += 5) years.push(y);
  const gridY = [0, 0.25, 0.5, 0.75, 1].map(f => lo + f * (hi - lo));
  const linePath = t => {
    let d = '', started = false;
    series.forEach(s => {
      const v = s.vals[t]; if (v == null) return;
      d += (started ? 'L' : 'M') + X(tnum(s.d)).toFixed(1) + ',' + Y(v).toFixed(1);
      started = true;
    });
    return d;
  };
  return (
    <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`} role="img">
      {recs.map((r, i) => {
        const x1 = X(tnum(r.start)), x2 = X(tnum(r.end));
        return <rect key={i} x={x1} y={padT} width={Math.max(x2 - x1, 1.5)}
                     height={H - padT - padB} fill="var(--muted)" opacity="0.18" />;
      })}
      {gridY.map((g, i) => (
        <g key={i}>
          <line x1={padL} x2={W - padR} y1={Y(g)} y2={Y(g)} stroke="var(--line-soft)" strokeWidth="1" />
          <text x={padL - 6} y={Y(g) + 3} textAnchor="end" fontSize="9.5"
                fill="var(--muted)" fontFamily="IBM Plex Mono, monospace">{g.toFixed(1)}</text>
        </g>
      ))}
      {years.map((y, i) => (
        <text key={i} x={X(y)} y={H - 9} textAnchor="middle" fontSize="9.5"
              fill="var(--muted)" fontFamily="IBM Plex Mono, monospace">{y}</text>
      ))}
      {tenors.map((t, i) => (
        <path key={t} d={linePath(t)} fill="none"
              stroke={TENOR_COLORS[i % TENOR_COLORS.length]} strokeWidth="1.4" opacity="0.92" />
      ))}
    </svg>
  );
}

const G7_COLORS = {
  US: '#1f4e3d', CA: '#c1471a', GB: '#3a5fa8', DE: '#8a6d1f',
  FR: '#5b3a8a', IT: '#2a7d6f', JP: '#a83a5b', GLOBAL: '#444',
};

function MacroTab() {
  const macro = window.macro || {};
  const countries = macro.countries || [];
  const [sel, setSel] = useStateT(countries[0] ? countries[0].code : 'US');

  if (!countries.length) {
    return (
      <div className="container">
        <div className="interp" style={{ marginTop: 28 }}>
          Macro data is unavailable. Add a free FRED API key (FRED_API_KEY in
          Streamlit secrets) to load live G7 yields and GDP.
        </div>
      </div>
    );
  }

  const isGlobal = sel === 'GLOBAL';
  const selCountry = countries.find(c => c.code === sel) || countries[0];
  const curve = isGlobal ? (macro.global && macro.global.curve) : selCountry.curve;
  const color = G7_COLORS[sel] || 'var(--primary)';
  const gdpSel = (macro.gdp || []).find(g => g.code === sel);
  const weights = (macro.global && macro.global.weights) || {};

  const tabBtn = (active, code) => ({
    fontFamily: 'IBM Plex Mono, monospace', fontSize: 10.5, letterSpacing: '0.06em',
    padding: '6px 12px', cursor: 'pointer', borderRadius: 3,
    border: `1px solid ${active ? (G7_COLORS[code] || 'var(--accent)') : 'var(--line)'}`,
    background: active ? (G7_COLORS[code] || 'var(--accent)') : 'var(--bg-card)',
    color: active ? '#fff' : 'var(--muted)',
  });

  return (
    <div className="container">
      <div className="section" style={{ paddingTop: 28 }}>
        <div className="section-head">
          <span className="section-num">§08</span>
          <h2 className="section-title">Macro · G7 Government Yield Curves</h2>
          <span className="section-sub">
            {macro.demo ? 'DEMO DATA · ADD FRED KEY FOR LIVE' : `AS OF ${macro.asOf || ''}`}
          </span>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
          {countries.map(c => (
            <button key={c.code} style={tabBtn(sel === c.code, c.code)}
                    onClick={() => setSel(c.code)}>{c.code}</button>
          ))}
          <button style={tabBtn(isGlobal, 'GLOBAL')} onClick={() => setSel('GLOBAL')}>GDP-WTD GLOBAL</button>
        </div>

        <div className="interp" style={{ marginBottom: 12 }}>
          {isGlobal
            ? <span><strong>GDP-weighted global curve</strong> — each tenor is the G7 average weighted by GDP ({macro.global && macro.global.source}); weights re-normalise over the countries reporting that tenor.</span>
            : <span><strong>{selCountry.name}</strong> — source: {selCountry.source}. Hollow points are <strong>interpolated</strong> between the country's reported tenors; filled points are reported.</span>}
        </div>

        <div className="chart">
          <div className="chart-head">
            <span className="chart-title">{isGlobal ? 'GDP-Weighted G7' : selCountry.name} Yield Curve</span>
            <span className="chart-sub">government bond yield (%) by tenor</span>
          </div>
          <MacroCurveChart curve={curve} color={color} />
        </div>
      </div>

      {macro.history && (macro.history.series || []).length > 1 && (
        <div className="section">
          <div className="section-head">
            <span className="section-num">§08.1</span>
            <h2 className="section-title">United States · Rates Through the Cycle</h2>
            <span className="section-sub">MONTHLY · MAX HISTORY · GREY = NBER RECESSIONS</span>
          </div>
          <div className="interp" style={{ marginBottom: 12 }}>
            Treasury yields by tenor over time, with <strong>NBER recession periods shaded grey</strong>.
            Watch how the short end (3M/1Y) collapses as the Fed cuts into and through
            recessions, while the long end (10Y) moves less — the curve typically
            <strong> inverts before</strong> a recession and <strong>steepens</strong> coming out of one.
          </div>
          <div className="chart">
            <div className="chart-head">
              <span className="chart-title">U.S. Treasury Yields vs Recessions</span>
              <span className="chart-sub">government bond yield (%), monthly</span>
              <div className="chart-legend">
                {(macro.history.tenors || []).map((t, i) => (
                  <span key={t}><span className="swatch"
                        style={{ background: TENOR_COLORS[i % TENOR_COLORS.length] }} />{t}</span>
                ))}
              </div>
            </div>
            <MacroHistoryChart history={macro.history} />
          </div>
        </div>
      )}

      {!isGlobal && gdpSel && (
        <div className="section">
          <div className="section-head">
            <span className="section-num">§08.2</span>
            <h2 className="section-title">{selCountry.name} · GDP & Growth</h2>
            <span className="section-sub">REAL GDP GROWTH % · FADED BARS = IMF PROJECTION</span>
          </div>
          <div className="chart">
            <div className="chart-head">
              <span className="chart-title">Real GDP Growth</span>
              <span className="chart-sub">history (solid) + IMF forward projection (faded)</span>
            </div>
            <MacroGrowthChart series={gdpSel.series} />
          </div>
          <div className="chart" style={{ padding: 0, marginTop: 14, overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr><th>Year</th><th className="num-r">GDP (PPP, int'l $ bn)</th>
                    <th className="num-r">Real Growth</th><th>Basis</th></tr>
              </thead>
              <tbody>
                {gdpSel.series.slice().reverse().map((r, i) => (
                  <tr key={i}>
                    <td>{r.year}</td>
                    <td className="num-r">{r.gdp != null ? fmtCompact(r.gdp * 1e9) : '—'}</td>
                    <td className={`num-r ${r.growth != null ? (r.growth >= 0 ? 'pos' : 'neg') : ''}`}>
                      {r.growth != null ? `${r.growth >= 0 ? '+' : ''}${r.growth.toFixed(1)}%` : '—'}</td>
                    <td style={{ color: 'var(--muted)' }}>{r.proj ? 'IMF projection' : 'actual'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="section">
        <div className="section-head">
          <span className="section-num">§08.3</span>
          <h2 className="section-title">GDP Weights (PPP) & Sources</h2>
          <span className="section-sub">GOVERNMENT / OFFICIAL DATA · WEIGHTS BY PPP GDP</span>
        </div>
        <div className="grid grid-7">
          {countries.map(c => (
            <Metric key={c.code} label={c.code}
                    value={weights[c.code] != null ? `${(weights[c.code] * 100).toFixed(1)}%` : '—'}
                    sub="gdp weight" />
          ))}
        </div>
        <div className="interp" style={{ marginTop: 14 }}>
          <strong>Sources (all government / official):</strong>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
            {(macro.sources || []).map((s, i) => (
              <li key={i} style={{ marginBottom: 3 }}>
                {s.label} — <span style={{ color: 'var(--muted)' }}>{s.use}</span>
              </li>
            ))}
          </ul>
          Yields are par/benchmark government bond yields. Where a country doesn't
          publish a given tenor, the value is linearly interpolated between its
          reported tenors (never extrapolated) and marked accordingly.
        </div>
      </div>
    </div>
  );
}
window.MacroTab = MacroTab;
