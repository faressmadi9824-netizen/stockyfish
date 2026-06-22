/* ============================================================
   Main app composition + theme + tweaks.
   ============================================================ */

const { useState, useEffect, useMemo } = React;

// Catches render errors inside a tab and shows them instead of blanking the app
class TabErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('Tab render error:', error, info); }
  render() {
    if (this.state.error) {
      return (
        <div className="container" style={{ padding: '28px 0' }}>
          <div style={{
            fontFamily: 'IBM Plex Mono, monospace', fontSize: 12, color: 'var(--neg)',
            background: 'var(--bg-card)', border: '1px solid var(--neg)', padding: '14px 18px',
          }}>
            TAB RENDER ERROR — {String(this.state.error && this.state.error.message)}
            <br /><span style={{ color: 'var(--muted)' }}>Full stack in browser console (F12).</span>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "light",
  "density": "comfortable",
  "showTape": true,
  "accentHue": "burnt"
}/*EDITMODE-END*/;

function App() {
  const [theme, setTheme] = useState(TWEAK_DEFAULTS.theme);
  const [tweakOpen, setTweakOpen] = useState(false);
  const [tweaks, setTweaks] = useState(TWEAK_DEFAULTS);
  const [active, setActive] = useState('summary');
  const [ticker, setTicker] = useState('AAPL');

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Set tape visibility
  useEffect(() => {
    document.documentElement.style.setProperty('--tape-display', tweaks.showTape ? 'flex' : 'none');
  }, [tweaks.showTape]);

  // Tweak panel host integration
  useEffect(() => {
    const onMsg = (e) => {
      if (e.data?.type === '__activate_edit_mode') setTweakOpen(true);
      if (e.data?.type === '__deactivate_edit_mode') setTweakOpen(false);
    };
    window.addEventListener('message', onMsg);
    window.parent.postMessage({ type: '__edit_mode_available' }, '*');
    return () => window.removeEventListener('message', onMsg);
  }, []);

  const setTweak = (k, v) => {
    let next;
    if (typeof k === 'object') next = { ...tweaks, ...k };
    else next = { ...tweaks, [k]: v };
    setTweaks(next);
    if (next.theme !== theme) setTheme(next.theme);
    window.parent.postMessage({ type: '__edit_mode_set_keys', edits: typeof k === 'object' ? k : { [k]: v } }, '*');
  };

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    setTweak('theme', next);
  };

  const tabs = [
    { key: 'summary',      label: 'Summary' },
    { key: 'risk',         label: 'Risk Profile' },
    { key: 'factor',       label: 'Factor Model' },
    { key: 'signals',      label: 'Quant Signals' },
    { key: 'fundamentals', label: 'Fundamentals' },
    { key: 'industry',     label: 'Industry Analysis' },
    { key: 'macro',        label: 'Macro Economics' },
    { key: 'research',     label: 'Qualitative Research' },
  ];

  const d = window.data;
  const f = window.fundamentals;
  const r = window.research;

  const lookbackYrs = Math.round(
    (d.stats.lastDate - d.stats.firstDate) / (365.25 * 24 * 3600 * 1000));
  const asOf = `${d.stats.lastDate.getFullYear()}.${String(d.stats.lastDate.getMonth() + 1).padStart(2, '0')}.${String(d.stats.lastDate.getDate()).padStart(2, '0')}`;
  const tabMeta = [
    { k: 'TICKER', v: d.ticker },
    { k: 'BENCH', v: d.factor.bench.sym },
    { k: 'LOOKBACK', v: `${lookbackYrs}Y` },
    { k: 'AS OF', v: asOf },
  ];

  return (
    <div className="app" data-screen-label="Dashboard">
      {tweaks.showTape && <TickerTape items={window.tape} />}
      <Toolbar ticker={ticker} onTickerChange={setTicker} watchlist={window.watchlist}
               theme={theme} onToggleTheme={toggleTheme} />
      <TabErrorBoundary>
        <Hero data={d} fundamentals={f} themeKey={theme} years={5} />
        <FundamentalsStrip f={f} price={d.lastPrice} />
      </TabErrorBoundary>
      <TabsBar tabs={tabs} active={active} onChange={setActive} meta={tabMeta} />

      <div>
        <TabErrorBoundary key={active}>
          {active === 'summary'      && <SummaryTab      data={d} themeKey={theme} fundamentals={f} />}
          {active === 'risk'         && <RiskTab         data={d} themeKey={theme} />}
          {active === 'factor'       && <FactorTab       data={d} themeKey={theme} />}
          {active === 'signals'      && <SignalsTab      data={d} themeKey={theme} />}
          {active === 'fundamentals' && <FundamentalsTab data={d} themeKey={theme} />}
          {active === 'industry'     && <IndustryTab />}
          {active === 'macro'        && <MacroTab />}
          {active === 'research'     && <ResearchTab     data={d} fundamentals={f} research={r} themeKey={theme} />}
        </TabErrorBoundary>
      </div>

      <Footer />

      {tweakOpen && (
        <TweaksPanel onClose={() => { setTweakOpen(false); window.parent.postMessage({ type: '__edit_mode_dismissed' }, '*'); }}>
          <TweakSection title="Appearance">
            <TweakRadio label="Theme" value={tweaks.theme}
              onChange={v => setTweak('theme', v)}
              options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
            <TweakToggle label="Ticker Tape" value={tweaks.showTape}
              onChange={v => setTweak('showTape', v)} />
          </TweakSection>
        </TweaksPanel>
      )}
    </div>
  );
}

function Footer() {
  return (
    <div className="container">
      <div className="footer">
        <span>DATA · Yahoo Finance · yfinance</span>
        <span className="sep">·</span>
        <span>SE · Newey-West HAC (maxlags = 5)</span>
        <span className="sep">·</span>
        <span>252 TRADING DAYS / YEAR</span>
        <span className="sep">·</span>
        <span>BENCHMARKS · SPY · IJH · IWM</span>
        <span className="sep">·</span>
        <span>VOL · ^VIX · RF · ^IRX</span>
        <span style={{ marginLeft: 'auto' }}>SHOCK·DEV v3.1 · BUILD 2026.05</span>
      </div>
    </div>
  );
}

window.App = App;

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
