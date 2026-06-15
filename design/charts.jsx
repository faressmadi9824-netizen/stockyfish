/* ============================================================
   Custom SVG charts. All hand-rolled, no chart library.
   They share a style: thin lines, IBM Plex Mono labels,
   subtle grids, single-color accent per chart, hover tooltip.
   ============================================================ */

const { useState, useMemo, useRef, useEffect } = React;

// Number formatters
const fmtPct  = (v, d = 2) => (v == null || isNaN(v)) ? '—' : `${(v * 100).toFixed(d)}%`;
const fmtNum  = (v, d = 2) => (v == null || isNaN(v)) ? '—' : v.toFixed(d);
const fmtSgn  = (v, d = 2) => (v == null || isNaN(v)) ? '—' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(d)}%`;
const fmtDate = (d) => `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
const fmtMoney= (v) => '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

window.fmtPct = fmtPct;
window.fmtNum = fmtNum;
window.fmtSgn = fmtSgn;
window.fmtDate = fmtDate;
window.fmtMoney = fmtMoney;

// ─────────────────────────────────────────────────────────────
// Color helpers — read CSS variables for current theme
// ─────────────────────────────────────────────────────────────
function useThemeColors(themeKey) {
  return useMemo(() => {
    const s = getComputedStyle(document.documentElement);
    const c = (n) => s.getPropertyValue(n).trim() || '#000';
    return {
      fg:        c('--fg'),
      fgSoft:    c('--fg-soft'),
      muted:     c('--muted'),
      mutedSoft: c('--muted-soft'),
      grid:      c('--grid'),
      line:      c('--line'),
      primary:   c('--primary'),
      accent:    c('--accent'),
      pos:       c('--pos'),
      neg:       c('--neg'),
      bgCard:    c('--bg-card'),
      bgElev:    c('--bg-elev'),
    };
  }, [themeKey]);
}
window.useThemeColors = useThemeColors;

// Pick evenly-spaced axis ticks
function ticks(min, max, count = 5) {
  const range = max - min;
  const step = range / (count - 1);
  return Array.from({ length: count }, (_, i) => min + i * step);
}

// ─────────────────────────────────────────────────────────────
// SPARKLINE — hero price chart, with marker at last
// ─────────────────────────────────────────────────────────────
function HeroSparkline({ values, dates, themeKey, height = 90 }) {
  const c = useThemeColors(themeKey);
  const ref = useRef(null);
  const [w, setW] = useState(800);
  const [hover, setHover] = useState(null);

  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  const padL = 0, padR = 50, padT = 8, padB = 18;
  const innerW = Math.max(50, w - padL - padR);
  const innerH = height - padT - padB;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const xs = (i) => padL + (i / (values.length - 1)) * innerW;
  const ys = (v) => padT + (1 - (v - min) / (max - min)) * innerH;

  // Path
  let path = '';
  let area = '';
  values.forEach((v, i) => {
    const x = xs(i), y = ys(v);
    path += (i === 0 ? `M${x},${y}` : ` L${x},${y}`);
  });
  area = `${path} L${xs(values.length - 1)},${padT + innerH} L${xs(0)},${padT + innerH} Z`;

  // x-axis ticks: year labels
  const yearTicks = [];
  let lastYear = null;
  dates.forEach((d, i) => {
    const y = d.getFullYear();
    if (y !== lastYear) {
      yearTicks.push({ i, label: y });
      lastYear = y;
    }
  });

  // hover handler
  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const idx = Math.max(0, Math.min(values.length - 1, Math.round(((x - padL) / innerW) * (values.length - 1))));
    setHover({ idx, x: xs(idx), y: ys(values[idx]), value: values[idx], date: dates[idx] });
  };

  const lastX = xs(values.length - 1);
  const lastY = ys(values[values.length - 1]);

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      <svg width="100%" height={height} className="chart-svg"
           onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        <defs>
          <linearGradient id="hero-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={c.primary} stopOpacity="0.18" />
            <stop offset="100%" stopColor={c.primary} stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* baseline */}
        <line x1={padL} x2={padL + innerW} y1={padT + innerH} y2={padT + innerH}
              stroke={c.grid} strokeWidth="1" />

        {/* year ticks */}
        {yearTicks.filter(t => t.i > 5).map(t => (
          <g key={t.i}>
            <line x1={xs(t.i)} x2={xs(t.i)} y1={padT} y2={padT + innerH}
                  stroke={c.grid} strokeDasharray="2,3" strokeWidth="1" opacity="0.6" />
            <text x={xs(t.i)} y={height - 4} fontSize="10" fill={c.mutedSoft} textAnchor="middle">
              {t.label}
            </text>
          </g>
        ))}

        <path d={area} fill="url(#hero-grad)" />
        <path d={path} stroke={c.primary} strokeWidth="1.5" fill="none"
              strokeLinejoin="round" strokeLinecap="round" />

        {/* last marker */}
        <circle cx={lastX} cy={lastY} r="3.5" fill={c.primary} />
        <circle cx={lastX} cy={lastY} r="6" fill="none" stroke={c.primary} strokeOpacity="0.3" strokeWidth="1.2">
          <animate attributeName="r" from="4" to="9" dur="1.8s" repeatCount="indefinite" />
          <animate attributeName="stroke-opacity" from="0.5" to="0" dur="1.8s" repeatCount="indefinite" />
        </circle>
        <text x={lastX + 8} y={lastY + 3} fontSize="10.5" fill={c.fg} fontWeight="600">
          {fmtMoney(values[values.length - 1])}
        </text>

        {/* hover */}
        {hover && (
          <g>
            <line x1={hover.x} x2={hover.x} y1={padT} y2={padT + innerH} stroke={c.muted} strokeDasharray="2,2" />
            <circle cx={hover.x} cy={hover.y} r="3" fill={c.accent} />
          </g>
        )}
      </svg>
      {hover && (
        <div className="tooltip" style={{ left: hover.x, top: hover.y }}>
          <span className="k">{fmtDate(hover.date)}</span>
          {fmtMoney(hover.value)}
        </div>
      )}
    </div>
  );
}
window.HeroSparkline = HeroSparkline;

// ─────────────────────────────────────────────────────────────
// DRAWDOWN CHART — area below zero, with annotation
// ─────────────────────────────────────────────────────────────
function DrawdownChart({ values, dates, themeKey, height = 280 }) {
  const c = useThemeColors(themeKey);
  const ref = useRef(null);
  const [w, setW] = useState(800);
  const [hover, setHover] = useState(null);

  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  const padL = 56, padR = 16, padT = 18, padB = 28;
  const innerW = Math.max(50, w - padL - padR);
  const innerH = height - padT - padB;

  const min = Math.min(...values);
  const max = 0;
  const xs = (i) => padL + (i / (values.length - 1)) * innerW;
  const ys = (v) => padT + (1 - (v - min) / (max - min)) * innerH;

  let path = '';
  values.forEach((v, i) => {
    const x = xs(i), y = ys(v);
    path += (i === 0 ? `M${x},${y}` : ` L${x},${y}`);
  });
  const area = `${path} L${xs(values.length - 1)},${ys(0)} L${xs(0)},${ys(0)} Z`;

  // y ticks
  const yt = ticks(min, 0, 5);
  // x year ticks
  const yearTicks = [];
  let lastYear = null;
  dates.forEach((d, i) => {
    const y = d.getFullYear();
    if (y !== lastYear) {
      yearTicks.push({ i, label: y });
      lastYear = y;
    }
  });

  // find max DD index
  let minIdx = 0;
  for (let i = 1; i < values.length; i++) if (values[i] < values[minIdx]) minIdx = i;

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const idx = Math.max(0, Math.min(values.length - 1, Math.round(((x - padL) / innerW) * (values.length - 1))));
    setHover({ idx, x: xs(idx), y: ys(values[idx]), value: values[idx], date: dates[idx] });
  };

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      <svg width="100%" height={height} className="chart-svg"
           onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        <defs>
          <linearGradient id="dd-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={c.neg} stopOpacity="0.05" />
            <stop offset="100%" stopColor={c.neg} stopOpacity="0.22" />
          </linearGradient>
          <pattern id="dd-hatch" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke={c.neg} strokeWidth="0.6" strokeOpacity="0.10" />
          </pattern>
        </defs>

        {/* grid */}
        {yt.map((t, i) => (
          <g key={i}>
            <line x1={padL} x2={padL + innerW} y1={ys(t)} y2={ys(t)}
                  stroke={c.grid} strokeDasharray={t === 0 ? '0' : '2,3'} strokeWidth="1" opacity={t === 0 ? 1 : 0.7} />
            <text x={padL - 8} y={ys(t) + 3} fontSize="10" fill={c.mutedSoft} textAnchor="end">
              {(t * 100).toFixed(0)}%
            </text>
          </g>
        ))}
        {yearTicks.filter(t => t.i > 5).map(t => (
          <g key={t.i}>
            <line x1={xs(t.i)} x2={xs(t.i)} y1={padT} y2={padT + innerH}
                  stroke={c.grid} strokeDasharray="2,3" opacity="0.5" />
            <text x={xs(t.i)} y={height - 8} fontSize="10" fill={c.mutedSoft} textAnchor="middle">{t.label}</text>
          </g>
        ))}

        <path d={area} fill="url(#dd-grad)" />
        <path d={area} fill="url(#dd-hatch)" />
        <path d={path} stroke={c.neg} strokeWidth="1.5" fill="none" />

        {/* max DD marker */}
        <line x1={xs(minIdx)} x2={xs(minIdx)} y1={padT} y2={ys(values[minIdx])}
              stroke={c.neg} strokeDasharray="2,3" strokeWidth="1" />
        <circle cx={xs(minIdx)} cy={ys(values[minIdx])} r="4" fill={c.bgCard} stroke={c.neg} strokeWidth="1.5" />
        <text x={xs(minIdx) + 8} y={ys(values[minIdx]) + 4} fontSize="10.5" fontWeight="600" fill={c.neg}>
          MAX DD {fmtPct(values[minIdx], 1)}
        </text>
        <text x={xs(minIdx) + 8} y={ys(values[minIdx]) + 17} fontSize="9.5" fill={c.muted}>
          {fmtDate(dates[minIdx])}
        </text>

        {hover && (
          <g>
            <line x1={hover.x} x2={hover.x} y1={padT} y2={padT + innerH} stroke={c.muted} strokeDasharray="2,2" />
            <circle cx={hover.x} cy={hover.y} r="3" fill={c.neg} />
          </g>
        )}
      </svg>
      {hover && (
        <div className="tooltip" style={{ left: hover.x, top: hover.y + 18 }}>
          <span className="k">{fmtDate(hover.date)}</span>
          {fmtPct(hover.value, 2)}
        </div>
      )}
    </div>
  );
}
window.DrawdownChart = DrawdownChart;

// ─────────────────────────────────────────────────────────────
// RETURN HISTOGRAM — twin-tone bars (above/below target)
// ─────────────────────────────────────────────────────────────
function ReturnHistogram({ returns, makeHistogram, target, esVal, themeKey, height = 320 }) {
  const c = useThemeColors(themeKey);
  const ref = useRef(null);
  const [w, setW] = useState(800);
  const [hover, setHover] = useState(null);

  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  const bins = useMemo(() => makeHistogram(returns, 60), [returns, makeHistogram]);

  const padL = 56, padR = 16, padT = 28, padB = 36;
  const innerW = Math.max(50, w - padL - padR);
  const innerH = height - padT - padB;

  const xMin = bins[0].lo;
  const xMax = bins[bins.length - 1].hi;
  const yMax = Math.max(...bins.map(b => b.count));
  const xs = (v) => padL + ((v - xMin) / (xMax - xMin)) * innerW;
  const ys = (v) => padT + (1 - v / yMax) * innerH;

  const barW = Math.max(2, innerW / bins.length - 1);
  const meanR = returns.reduce((a, b) => a + b, 0) / returns.length;

  const yt = ticks(0, yMax, 5);
  // x ticks
  const xt = [-0.1, -0.05, 0, 0.05, 0.1].filter(t => t >= xMin && t <= xMax);

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      <svg width="100%" height={height} className="chart-svg"
           onMouseLeave={() => setHover(null)}>
        {/* grid */}
        {yt.map((t, i) => (
          <g key={i}>
            <line x1={padL} x2={padL + innerW} y1={ys(t)} y2={ys(t)}
                  stroke={c.grid} strokeDasharray="2,3" opacity="0.6" />
            <text x={padL - 8} y={ys(t) + 3} fontSize="10" fill={c.mutedSoft} textAnchor="end">
              {Math.round(t)}
            </text>
          </g>
        ))}
        {/* bars */}
        {bins.map((b, i) => {
          const x = xs(b.lo) + 0.5;
          const y = ys(b.count);
          const h = padT + innerH - y;
          const isNeg = b.mid < target;
          const color = isNeg ? c.neg : c.pos;
          return (
            <rect key={i}
              x={x} y={y} width={barW} height={Math.max(0, h)}
              fill={color}
              fillOpacity={hover && hover.idx === i ? 1 : 0.78}
              onMouseEnter={() => setHover({ idx: i, x: x + barW / 2, y, bin: b })}
            />
          );
        })}

        {/* target line */}
        <line x1={xs(target)} x2={xs(target)} y1={padT} y2={padT + innerH}
              stroke={c.muted} strokeDasharray="3,3" />
        <text x={xs(target) + 4} y={padT + 10} fontSize="9.5" fill={c.muted}>target</text>

        {/* mean line */}
        <line x1={xs(meanR)} x2={xs(meanR)} y1={padT} y2={padT + innerH}
              stroke={c.fg} strokeWidth="1.2" />
        <text x={xs(meanR) + 4} y={padT + 22} fontSize="10" fill={c.fg} fontWeight="600">
          μ {fmtPct(meanR, 2)}
        </text>

        {/* ES line */}
        <line x1={xs(esVal)} x2={xs(esVal)} y1={padT} y2={padT + innerH}
              stroke={c.accent} strokeWidth="1.5" strokeDasharray="6,2" />
        <text x={xs(esVal) - 6} y={padT + 22} fontSize="10" fill={c.accent} fontWeight="600" textAnchor="end">
          ES5% {fmtPct(esVal, 2)}
        </text>

        {/* x axis labels */}
        {xt.map(t => (
          <text key={t} x={xs(t)} y={height - 12} fontSize="10" fill={c.mutedSoft} textAnchor="middle">
            {(t * 100).toFixed(0)}%
          </text>
        ))}
        <text x={padL + innerW / 2} y={height - 0} fontSize="9.5" fill={c.muted} textAnchor="middle" letterSpacing="2">
          DAILY RETURN
        </text>
      </svg>
      {hover && (
        <div className="tooltip" style={{ left: hover.x, top: hover.y - 6 }}>
          <span className="k">{(hover.bin.lo * 100).toFixed(2)}% → {(hover.bin.hi * 100).toFixed(2)}%</span>
          {hover.bin.count} days
        </div>
      )}
    </div>
  );
}
window.ReturnHistogram = ReturnHistogram;

// ─────────────────────────────────────────────────────────────
// ROLLING BETAS — multi-line
// ─────────────────────────────────────────────────────────────
function RollingBetas({ rolling, dates, themeKey, height = 240 }) {
  const c = useThemeColors(themeKey);
  const ref = useRef(null);
  const [w, setW] = useState(800);
  const [hover, setHover] = useState(null);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  const valid = rolling.map((r, i) => r ? { ...r, i, d: dates[i] } : null).filter(Boolean);
  const padL = 50, padR = 16, padT = 18, padB = 26;
  const innerW = Math.max(50, w - padL - padR);
  const innerH = height - padT - padB;

  const all = valid.flatMap(v => [v.bench]);
  const minY = Math.min(0.6, Math.min(...all) - 0.05);
  const maxY = Math.max(1.6, Math.max(...all) + 0.05);
  const xs = (i) => padL + (i / (dates.length - 1)) * innerW;
  const ys = (v) => padT + (1 - (v - minY) / (maxY - minY)) * innerH;

  let bench = '', vix = '';
  valid.forEach((v, k) => {
    bench += (k === 0 ? `M${xs(v.i)},${ys(v.bench)}` : ` L${xs(v.i)},${ys(v.bench)}`);
  });

  const yt = ticks(minY, maxY, 5);
  // x year ticks
  const yearTicks = [];
  let lastYear = null;
  dates.forEach((d, i) => {
    const y = d.getFullYear();
    if (y !== lastYear) {
      yearTicks.push({ i, label: y });
      lastYear = y;
    }
  });

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const idx = Math.max(0, Math.min(dates.length - 1, Math.round(((x - padL) / innerW) * (dates.length - 1))));
    if (!rolling[idx]) return setHover(null);
    setHover({ idx, x: xs(idx), date: dates[idx], bench: rolling[idx].bench });
  };

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      <svg width="100%" height={height} className="chart-svg"
           onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        {yt.map((t, i) => (
          <g key={i}>
            <line x1={padL} x2={padL + innerW} y1={ys(t)} y2={ys(t)}
                  stroke={c.grid} strokeDasharray={Math.abs(t - 1) < 0.01 ? '0' : '2,3'} opacity={Math.abs(t - 1) < 0.01 ? 1 : 0.6} />
            <text x={padL - 8} y={ys(t) + 3} fontSize="10" fill={c.mutedSoft} textAnchor="end">
              {t.toFixed(1)}
            </text>
          </g>
        ))}
        {yearTicks.filter(t => t.i > 5).map(t => (
          <g key={t.i}>
            <line x1={xs(t.i)} x2={xs(t.i)} y1={padT} y2={padT + innerH}
                  stroke={c.grid} strokeDasharray="2,3" opacity="0.5" />
            <text x={xs(t.i)} y={height - 8} fontSize="10" fill={c.mutedSoft} textAnchor="middle">{t.label}</text>
          </g>
        ))}

        <path d={bench} stroke={c.primary} strokeWidth="1.6" fill="none" strokeLinejoin="round" />

        {hover && (
          <g>
            <line x1={hover.x} x2={hover.x} y1={padT} y2={padT + innerH} stroke={c.muted} strokeDasharray="2,2" />
            <circle cx={hover.x} cy={ys(hover.bench)} r="3" fill={c.primary} />
          </g>
        )}
      </svg>
      {hover && (
        <div className="tooltip" style={{ left: hover.x, top: ys(hover.bench) - 6 }}>
          <span className="k">{fmtDate(hover.date)}</span>
          β {hover.bench.toFixed(3)}
        </div>
      )}
    </div>
  );
}
window.RollingBetas = RollingBetas;

// ─────────────────────────────────────────────────────────────
// ROLLING β_VIX — area chart (negative is typical)
// ─────────────────────────────────────────────────────────────
function RollingVixBeta({ rolling, dates, themeKey, height = 200 }) {
  const c = useThemeColors(themeKey);
  const ref = useRef(null);
  const [w, setW] = useState(800);
  const [hover, setHover] = useState(null);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  const valid = rolling.map((r, i) => r ? { ...r, i, d: dates[i] } : null).filter(Boolean);
  const padL = 50, padR = 16, padT = 18, padB = 26;
  const innerW = Math.max(50, w - padL - padR);
  const innerH = height - padT - padB;

  const all = valid.map(v => v.vix);
  const minY = Math.min(...all) - 0.05;
  const maxY = Math.max(0.05, Math.max(...all) + 0.05);
  const xs = (i) => padL + (i / (dates.length - 1)) * innerW;
  const ys = (v) => padT + (1 - (v - minY) / (maxY - minY)) * innerH;

  let line = '';
  valid.forEach((v, k) => {
    line += (k === 0 ? `M${xs(v.i)},${ys(v.vix)}` : ` L${xs(v.i)},${ys(v.vix)}`);
  });
  const area = `${line} L${xs(valid[valid.length-1].i)},${ys(0)} L${xs(valid[0].i)},${ys(0)} Z`;

  const yt = ticks(minY, maxY, 5);
  const yearTicks = [];
  let lastYear = null;
  dates.forEach((d, i) => {
    const y = d.getFullYear();
    if (y !== lastYear) {
      yearTicks.push({ i, label: y });
      lastYear = y;
    }
  });

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const idx = Math.max(0, Math.min(dates.length - 1, Math.round(((x - padL) / innerW) * (dates.length - 1))));
    if (!rolling[idx]) return setHover(null);
    setHover({ idx, x: xs(idx), date: dates[idx], v: rolling[idx].vix });
  };

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      <svg width="100%" height={height} className="chart-svg"
           onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        <defs>
          <linearGradient id="vix-grad" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor={c.accent} stopOpacity="0.25" />
            <stop offset="100%" stopColor={c.accent} stopOpacity="0" />
          </linearGradient>
        </defs>
        {yt.map((t, i) => (
          <g key={i}>
            <line x1={padL} x2={padL + innerW} y1={ys(t)} y2={ys(t)}
                  stroke={c.grid} strokeDasharray={Math.abs(t) < 0.01 ? '0' : '2,3'} opacity={Math.abs(t) < 0.01 ? 1 : 0.6} />
            <text x={padL - 8} y={ys(t) + 3} fontSize="10" fill={c.mutedSoft} textAnchor="end">
              {t.toFixed(2)}
            </text>
          </g>
        ))}
        {yearTicks.filter(t => t.i > 5).map(t => (
          <g key={t.i}>
            <line x1={xs(t.i)} x2={xs(t.i)} y1={padT} y2={padT + innerH}
                  stroke={c.grid} strokeDasharray="2,3" opacity="0.5" />
            <text x={xs(t.i)} y={height - 8} fontSize="10" fill={c.mutedSoft} textAnchor="middle">{t.label}</text>
          </g>
        ))}

        <path d={area} fill="url(#vix-grad)" />
        <path d={line} stroke={c.accent} strokeWidth="1.6" fill="none" strokeLinejoin="round" />

        {hover && (
          <g>
            <line x1={hover.x} x2={hover.x} y1={padT} y2={padT + innerH} stroke={c.muted} strokeDasharray="2,2" />
            <circle cx={hover.x} cy={ys(hover.v)} r="3" fill={c.accent} />
          </g>
        )}
      </svg>
      {hover && (
        <div className="tooltip" style={{ left: hover.x, top: ys(hover.v) - 6 }}>
          <span className="k">{fmtDate(hover.date)}</span>
          β_vix {hover.v.toFixed(3)}
        </div>
      )}
    </div>
  );
}
window.RollingVixBeta = RollingVixBeta;

// ─────────────────────────────────────────────────────────────
// MINI SPARKLINE — tiny inline chart for metric cards
// ─────────────────────────────────────────────────────────────
function MiniSpark({ values, color, themeKey, height = 28, fill = true }) {
  const c = useThemeColors(themeKey);
  const stroke = color || c.primary;
  const ref = useRef(null);
  const [w, setW] = useState(120);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const xs = (i) => (i / (values.length - 1)) * w;
  const ys = (v) => height - ((v - min) / range) * (height - 4) - 2;

  let path = '';
  values.forEach((v, i) => {
    path += (i === 0 ? `M${xs(i)},${ys(v)}` : ` L${xs(i)},${ys(v)}`);
  });
  const area = `${path} L${xs(values.length - 1)},${height} L${xs(0)},${height} Z`;

  return (
    <div ref={ref} style={{ width: '100%' }}>
      <svg width="100%" height={height} preserveAspectRatio="none">
        {fill && <path d={area} fill={stroke} fillOpacity="0.10" />}
        <path d={path} stroke={stroke} strokeWidth="1.3" fill="none" />
      </svg>
    </div>
  );
}
window.MiniSpark = MiniSpark;

// ─────────────────────────────────────────────────────────────
// Shared helpers for the quant/fundamental charts
// ─────────────────────────────────────────────────────────────
const fmtCompact = (v) => {
  if (v == null || isNaN(v)) return '—';
  const a = Math.abs(v);
  const sgn = v < 0 ? '-' : '';
  if (a >= 1e12) return `${sgn}$${(a / 1e12).toFixed(2)}T`;
  if (a >= 1e9)  return `${sgn}$${(a / 1e9).toFixed(1)}B`;
  if (a >= 1e6)  return `${sgn}$${(a / 1e6).toFixed(0)}M`;
  return `${sgn}$${a.toFixed(2)}`;
};
window.fmtCompact = fmtCompact;

function yearTickList(dates) {
  const out = [];
  let last = null;
  dates.forEach((d, i) => {
    const y = d.getFullYear();
    if (y !== last) { out.push({ i, label: y }); last = y; }
  });
  return out;
}

// Build an SVG path from values that may contain nulls (gaps restart the line)
function gapPath(values, xs, ys) {
  let p = '', pen = false;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null || isNaN(v)) { pen = false; continue; }
    p += (pen ? ` L${xs(i)},${ys(v)}` : ` M${xs(i)},${ys(v)}`);
    pen = true;
  }
  return p;
}

// ─────────────────────────────────────────────────────────────
// DUAL LINE CHART — generic two-series chart, optional right axis
// ─────────────────────────────────────────────────────────────
function DualLineChart({ dates, a, b, rightAxis = false, fmtL, fmtR, themeKey, height = 240 }) {
  const c = useThemeColors(themeKey);
  const ref = useRef(null);
  const [w, setW] = useState(800);
  const [hover, setHover] = useState(null);

  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  const ds = useMemo(() => dates.map(d => (d instanceof Date ? d : new Date(d))), [dates]);
  const fL = fmtL || ((v) => v.toFixed(1));
  const fR = fmtR || fL;

  const padL = 56, padR = rightAxis ? 56 : 16, padT = 18, padB = 26;
  const innerW = Math.max(50, w - padL - padR);
  const innerH = height - padT - padB;

  const clean = (vals) => vals.filter(v => v != null && !isNaN(v));
  const aVals = clean(a.values);
  const bVals = clean(b ? b.values : []);
  if (!aVals.length) return null;

  const lo = (vs) => Math.min(...vs), hi = (vs) => Math.max(...vs);
  const aMin = lo(aVals), aMax = hi(aVals);
  const lMin = rightAxis || !bVals.length ? aMin : Math.min(aMin, lo(bVals));
  const lMax = rightAxis || !bVals.length ? aMax : Math.max(aMax, hi(bVals));
  const lPad = (lMax - lMin) * 0.06 || 1;
  const rMin = bVals.length ? lo(bVals) : 0, rMax = bVals.length ? hi(bVals) : 1;
  const rPad = (rMax - rMin) * 0.06 || 1;

  const xs  = (i) => padL + (i / (ds.length - 1)) * innerW;
  const ysL = (v) => padT + (1 - (v - (lMin - lPad)) / ((lMax + lPad) - (lMin - lPad))) * innerH;
  const ysR = (v) => padT + (1 - (v - (rMin - rPad)) / ((rMax + rPad) - (rMin - rPad))) * innerH;
  const ysB = rightAxis ? ysR : ysL;

  const pathA = gapPath(a.values, xs, ysL);
  const pathB = b ? gapPath(b.values, xs, ysB) : '';

  const yt = ticks(lMin - lPad, lMax + lPad, 5);
  const ytR = rightAxis ? ticks(rMin - rPad, rMax + rPad, 5) : [];
  const yrT = yearTickList(ds);

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const idx = Math.max(0, Math.min(ds.length - 1, Math.round(((x - padL) / innerW) * (ds.length - 1))));
    setHover({ idx, x: xs(idx), date: ds[idx], av: a.values[idx], bv: b ? b.values[idx] : null });
  };

  const colA = a.color || c.primary;
  const colB = (b && b.color) || c.accent;

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      <svg width="100%" height={height} className="chart-svg"
           onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        {yt.map((t, i) => (
          <g key={i}>
            <line x1={padL} x2={padL + innerW} y1={ysL(t)} y2={ysL(t)}
                  stroke={c.grid} strokeDasharray="2,3" opacity="0.6" />
            <text x={padL - 8} y={ysL(t) + 3} fontSize="10" fill={c.mutedSoft} textAnchor="end">{fL(t)}</text>
          </g>
        ))}
        {ytR.map((t, i) => (
          <text key={i} x={padL + innerW + 8} y={ysR(t) + 3} fontSize="10"
                fill={colB} fillOpacity="0.75" textAnchor="start">{fR(t)}</text>
        ))}
        {yrT.filter(t => t.i > 5).map(t => (
          <g key={t.i}>
            <line x1={xs(t.i)} x2={xs(t.i)} y1={padT} y2={padT + innerH}
                  stroke={c.grid} strokeDasharray="2,3" opacity="0.5" />
            <text x={xs(t.i)} y={height - 8} fontSize="10" fill={c.mutedSoft} textAnchor="middle">{t.label}</text>
          </g>
        ))}

        {b && <path d={pathB} stroke={colB} strokeWidth="1.5" fill="none" strokeLinejoin="round" />}
        <path d={pathA} stroke={colA} strokeWidth="1.6" fill="none" strokeLinejoin="round" />

        {hover && (
          <g>
            <line x1={hover.x} x2={hover.x} y1={padT} y2={padT + innerH} stroke={c.muted} strokeDasharray="2,2" />
            {hover.av != null && <circle cx={hover.x} cy={ysL(hover.av)} r="3" fill={colA} />}
            {b && hover.bv != null && <circle cx={hover.x} cy={ysB(hover.bv)} r="3" fill={colB} />}
          </g>
        )}
      </svg>
      {hover && (
        <div className="tooltip" style={{ left: hover.x, top: padT + 4 }}>
          <span className="k">{fmtDate(hover.date)}</span>
          {a.label} {hover.av != null ? fL(hover.av) : '—'}
          {b && <React.Fragment><br />{b.label} {hover.bv != null ? fR(hover.bv) : '—'}</React.Fragment>}
        </div>
      )}
    </div>
  );
}
window.DualLineChart = DualLineChart;

// ─────────────────────────────────────────────────────────────
// Z-SCORE BARS — horizontal, centered at 0, range ±3σ
// ─────────────────────────────────────────────────────────────
function ZBars({ signals, themeKey, rowH = 34 }) {
  const c = useThemeColors(themeKey);
  const ref = useRef(null);
  const [w, setW] = useState(700);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  const rows = signals.filter(s => s.z != null);
  const padL = 90, padR = 70, padT = 18, padB = 22;
  const innerW = Math.max(50, w - padL - padR);
  const height = padT + rows.length * rowH + padB;
  const xz = (z) => padL + ((Math.max(-3, Math.min(3, z)) + 3) / 6) * innerW;

  return (
    <div ref={ref} style={{ width: '100%' }}>
      <svg width="100%" height={height} className="chart-svg">
        {[-3, -2, -1, 0, 1, 2, 3].map(t => (
          <g key={t}>
            <line x1={xz(t)} x2={xz(t)} y1={padT} y2={padT + rows.length * rowH}
                  stroke={c.grid} strokeDasharray={t === 0 ? '0' : '2,3'}
                  strokeWidth="1" opacity={t === 0 ? 1 : 0.55} />
            <text x={xz(t)} y={height - 6} fontSize="10" fill={c.mutedSoft} textAnchor="middle">
              {t > 0 ? `+${t}σ` : `${t}σ`}
            </text>
          </g>
        ))}
        {rows.map((s, i) => {
          const y = padT + i * rowH + rowH / 2;
          const x0 = xz(0), x1 = xz(s.z);
          const col = s.z >= 0 ? c.pos : c.neg;
          return (
            <g key={s.key}>
              <text x={padL - 10} y={y + 3.5} fontSize="11" fill={c.fgSoft} textAnchor="end"
                    fontFamily="IBM Plex Mono, monospace">{s.key}</text>
              <rect x={Math.min(x0, x1)} y={y - 6} width={Math.max(1.5, Math.abs(x1 - x0))}
                    height={12} fill={col} fillOpacity="0.78" rx="1" />
              <text x={padL + innerW + 8} y={y + 3.5} fontSize="11" fill={col} fontWeight="600"
                    fontFamily="IBM Plex Mono, monospace">
                {s.z >= 0 ? '+' : ''}{s.z.toFixed(2)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
window.ZBars = ZBars;

// ─────────────────────────────────────────────────────────────
// FUNDAMENTAL OVERLAY — price vs revenue / net income / EPS / ROE
// Sparse annual + TTM points drawn as a step line over daily price.
// ─────────────────────────────────────────────────────────────
function FundamentalOverlay({ data, fundHistory, basis = 'annual', themeKey, height = 340 }) {
  const c = useThemeColors(themeKey);
  const ref = useRef(null);
  const [w, setW] = useState(900);
  const [hover, setHover] = useState(null);
  const [metricKey, setMetricKey] = useState('revenue');
  const [mode, setMode] = useState('indexed');

  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  const metrics = (fundHistory && fundHistory.metrics) || {};
  const keys = ['revenue', 'netIncome', 'eps', 'roe', 'grossMargin', 'netMargin']
    .filter(k => metrics[k] && (metrics[k][basis] || []).length);
  const mk = keys.includes(metricKey) ? metricKey : keys[0];
  const metric = mk ? metrics[mk] : null;
  const basisLabel = basis === 'annual' ? 'FY' : 'Q';

  const fmtMetric = (v) => {
    if (v == null || isNaN(v) || !metric) return '—';
    if (metric.fmt === 'money') return fmtCompact(v);
    if (metric.fmt === 'pct') return fmtPct(v, 1);
    return fmtMoney(v); // eps
  };

  const { dates, prices } = data;
  // Map metric points to price-date indices (clip to visible range)
  const pts = useMemo(() => {
    if (!metric) return [];
    const out = [];
    (metric[basis] || []).forEach(p => {
      const t = new Date(p.d).getTime();
      if (t > dates[dates.length - 1].getTime()) return;
      let idx = 0;
      // dates are sorted — find first index >= point date
      let lo = 0, hi = dates.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (dates[mid].getTime() < t) lo = mid + 1; else hi = mid;
      }
      idx = lo;
      out.push({ idx, v: p.v, d: p.d });
    });
    return out;
  }, [metric, basis, dates]);

  if (!keys.length) {
    return <p style={{ color: 'var(--muted)', fontFamily: 'IBM Plex Mono, monospace', fontSize: 12 }}>
      Fundamental history unavailable for this ticker.
    </p>;
  }
  if (pts.length < 2) {
    return <p style={{ color: 'var(--muted)', fontFamily: 'IBM Plex Mono, monospace', fontSize: 12 }}>
      Not enough {metric.label} data points in the selected lookback.
    </p>;
  }

  // Indexing is meaningless across zero/negative values → force dual axis
  const canIndex = pts.every(p => p.v > 0);
  const effMode = canIndex ? mode : 'dual';

  const padL = 56, padR = effMode === 'dual' ? 64 : 16, padT = 18, padB = 28;
  const innerW = Math.max(50, w - padL - padR);
  const innerH = height - padT - padB;

  const startIdx = pts[0].idx;
  const xs = (i) => padL + ((i - startIdx) / Math.max(1, dates.length - 1 - startIdx)) * innerW;

  // Visible price slice
  const pxSlice = prices.slice(startIdx);
  const basePx = prices[startIdx];

  let priceVals, metricAt, ysL, ysR, fmtL, domL;
  if (effMode === 'indexed') {
    priceVals = pxSlice.map(v => (v / basePx) * 100);
    const baseM = pts[0].v;
    metricAt = (v) => (v / baseM) * 100;
    const mIdxVals = pts.map(p => metricAt(p.v));
    const allV = priceVals.concat(mIdxVals);
    const mn = Math.min(...allV), mx = Math.max(...allV);
    const pad = (mx - mn) * 0.06 || 1;
    domL = { lo: mn - pad, hi: mx + pad };
    ysL = (v) => padT + (1 - (v - domL.lo) / (domL.hi - domL.lo)) * innerH;
    ysR = ysL;
    fmtL = (v) => v.toFixed(0);
  } else {
    priceVals = pxSlice;
    const mn = Math.min(...pxSlice), mx = Math.max(...pxSlice);
    const pad = (mx - mn) * 0.06 || 1;
    domL = { lo: mn - pad, hi: mx + pad };
    ysL = (v) => padT + (1 - (v - domL.lo) / (domL.hi - domL.lo)) * innerH;
    const mv = pts.map(p => p.v);
    const mmn = Math.min(...mv), mmx = Math.max(...mv);
    const mpad = (mmx - mmn) * 0.10 || Math.abs(mmx) * 0.1 || 1;
    ysR = (v) => padT + (1 - (v - (mmn - mpad)) / ((mmx + mpad) - (mmn - mpad))) * innerH;
    metricAt = (v) => v;
    fmtL = (v) => `$${v.toFixed(0)}`;
  }

  // Price path
  let pricePath = '';
  priceVals.forEach((v, k) => {
    const i = startIdx + k;
    pricePath += (k === 0 ? `M${xs(i)},${ysL(v)}` : ` L${xs(i)},${ysL(v)}`);
  });

  // Metric step path (extend last value to chart edge)
  const yM = (v) => (effMode === 'indexed' ? ysL(metricAt(v)) : ysR(v));
  let metricPath = `M${xs(pts[0].idx)},${yM(pts[0].v)}`;
  for (let k = 1; k < pts.length; k++) {
    metricPath += ` L${xs(pts[k].idx)},${yM(pts[k - 1].v)} L${xs(pts[k].idx)},${yM(pts[k].v)}`;
  }
  metricPath += ` L${xs(dates.length - 1)},${yM(pts[pts.length - 1].v)}`;

  const visDates = dates.slice(startIdx);
  const yrT = yearTickList(visDates);

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const k = Math.max(0, Math.min(pxSlice.length - 1,
      Math.round(((x - padL) / innerW) * (pxSlice.length - 1))));
    const i = startIdx + k;
    // last metric point at or before i
    let mp = pts[0];
    for (const p of pts) { if (p.idx <= i) mp = p; else break; }
    setHover({ i, k, x: xs(i), date: dates[i], price: prices[i], mp });
  };

  const btn = (active) => ({
    fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, letterSpacing: '0.06em',
    padding: '5px 10px', cursor: 'pointer',
    border: `1px solid ${active ? 'var(--primary)' : 'var(--line)'}`,
    background: active ? 'var(--primary)' : 'var(--bg-card)',
    color: active ? 'var(--bg-card)' : 'var(--muted)',
  });
  const LABELS = { revenue: 'REVENUE', netIncome: 'NET INCOME', eps: 'EPS', roe: 'ROE',
                   grossMargin: 'GROSS MGN', netMargin: 'NET MGN' };

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        {keys.map(k => (
          <button key={k} style={btn(k === mk)} onClick={() => setMetricKey(k)}>{LABELS[k]}</button>
        ))}
        <span style={{ width: 14 }} />
        <button style={btn(effMode === 'indexed')} disabled={!canIndex}
                onClick={() => setMode('indexed')}
                title={canIndex ? 'Both series rebased to 100' : 'Disabled: metric crosses zero'}>
          INDEXED=100
        </button>
        <button style={btn(effMode === 'dual')} onClick={() => setMode('dual')}>DUAL AXIS</button>
      </div>

      <div ref={ref} style={{ position: 'relative', width: '100%' }}>
        <svg width="100%" height={height} className="chart-svg"
             onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
          {/* horizontal grid: 5 lines, label from left scale by inverting pixel pos */}
          {[0, 0.25, 0.5, 0.75, 1].map((f, gi) => {
            const yPix = padT + f * innerH;
            const val = domL.hi - f * (domL.hi - domL.lo);
            return (
              <g key={gi}>
                <line x1={padL} x2={padL + innerW} y1={yPix} y2={yPix}
                      stroke={c.grid} strokeDasharray="2,3" opacity="0.6" />
                <text x={padL - 8} y={yPix + 3} fontSize="10" fill={c.mutedSoft}
                      textAnchor="end">{fmtL(val)}</text>
              </g>
            );
          })}
          {yrT.filter(t => t.i > 5).map(t => (
            <g key={t.i}>
              <line x1={xs(startIdx + t.i)} x2={xs(startIdx + t.i)} y1={padT} y2={padT + innerH}
                    stroke={c.grid} strokeDasharray="2,3" opacity="0.5" />
              <text x={xs(startIdx + t.i)} y={height - 8} fontSize="10" fill={c.mutedSoft}
                    textAnchor="middle">{t.label}</text>
            </g>
          ))}

          {/* axis labels at metric points (right) or indexed levels (left) */}
          {effMode === 'dual' && pts.map((p, k) => (
            <text key={k} x={padL + innerW + 8} y={yM(p.v) + 3} fontSize="9.5"
                  fill={c.accent} fillOpacity="0.85" textAnchor="start"
                  fontFamily="IBM Plex Mono, monospace">{fmtMetric(p.v)}</text>
          ))}

          <path d={pricePath} stroke={c.primary} strokeWidth="1.5" fill="none"
                strokeLinejoin="round" />
          <path d={metricPath} stroke={c.accent} strokeWidth="1.6" fill="none"
                strokeLinejoin="round" strokeDasharray="0" />

          {pts.map((p, k) => (
            <circle key={k} cx={xs(p.idx)} cy={yM(p.v)} r="3.5"
                    fill={c.bgCard} stroke={c.accent} strokeWidth="1.6" />
          ))}

          {hover && (
            <g>
              <line x1={hover.x} x2={hover.x} y1={padT} y2={padT + innerH}
                    stroke={c.muted} strokeDasharray="2,2" />
              <circle cx={hover.x} cy={ysL(effMode === 'indexed' ? (hover.price / basePx) * 100 : hover.price)}
                      r="3" fill={c.primary} />
            </g>
          )}
        </svg>
        {hover && (
          <div className="tooltip" style={{ left: hover.x, top: padT + 4 }}>
            <span className="k">{fmtDate(hover.date)}</span>
            PX {fmtMoney(hover.price)}<br />
            {metric.label} {fmtMetric(hover.mp.v)} <span style={{ opacity: 0.6 }}>({basisLabel} · {hover.mp.d})</span>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 18, marginTop: 8, fontFamily: 'IBM Plex Mono, monospace', fontSize: 10.5, color: 'var(--muted)' }}>
        <span><span className="swatch" style={{ background: 'var(--primary)', display: 'inline-block', width: 10, height: 3, marginRight: 6, verticalAlign: 'middle' }} />PRICE</span>
        <span><span className="swatch" style={{ background: 'var(--accent)', display: 'inline-block', width: 10, height: 3, marginRight: 6, verticalAlign: 'middle' }} />{metric.label.toUpperCase()} (step, reported dates)</span>
        {effMode === 'indexed' && <span>BOTH REBASED TO 100 AT FIRST POINT</span>}
      </div>
    </div>
  );
}
window.FundamentalOverlay = FundamentalOverlay;

// ─────────────────────────────────────────────────────────────
// REVENUE & MARGINS — revenue bars ($, left) + gross/net margin
// lines (%, right) per reported period, last `yearsBack` years
// ─────────────────────────────────────────────────────────────
function RevenueMarginsChart({ fundHistory, basis = 'annual', themeKey, height = 300, yearsBack = 5 }) {
  const c = useThemeColors(themeKey);
  const ref = useRef(null);
  const [w, setW] = useState(900);
  const [hover, setHover] = useState(null);

  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  const metrics = (fundHistory && fundHistory.metrics) || {};
  const basisLabel = basis === 'annual' ? 'FY' : 'Q';
  const rows = useMemo(() => {
    const byDate = {};
    const put = (key, field) => {
      const m = metrics[key];
      if (!m) return;
      (m[basis] || []).forEach(p => {
        if (!byDate[p.d]) byDate[p.d] = { d: p.d };
        byDate[p.d][field] = p.v;
      });
    };
    put('revenue', 'rev');
    put('grossMargin', 'gm');
    put('netMargin', 'nm');
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - yearsBack);
    return Object.values(byDate)
      .filter(r => r.rev != null && new Date(r.d) >= cutoff)
      .sort((a, b) => a.d.localeCompare(b.d));
  }, [metrics, basis, yearsBack]);

  if (rows.length < 2) {
    return <p style={{ color: 'var(--muted)', fontFamily: 'IBM Plex Mono, monospace', fontSize: 12 }}>
      Not enough revenue/margin periods available from yfinance for this ticker.
    </p>;
  }

  const padL = 62, padR = 56, padT = 20, padB = 34;
  const innerW = Math.max(50, w - padL - padR);
  const innerH = height - padT - padB;

  // Left scale: revenue $, from 0
  const revMax = Math.max(...rows.map(r => r.rev)) * 1.08;
  const ysRev = (v) => padT + (1 - v / revMax) * innerH;

  // Right scale: margins %, padded around observed range (incl. 0)
  const margins = rows.flatMap(r => [r.gm, r.nm]).filter(v => v != null);
  const mMin = Math.min(0, ...margins);
  const mMax = Math.max(...margins, 0.01) * 1.15;
  const ysM = (v) => padT + (1 - (v - mMin) / (mMax - mMin)) * innerH;

  // X: band per period
  const band = innerW / rows.length;
  const barW = Math.min(56, band * 0.55);
  const xMid = (i) => padL + band * (i + 0.5);

  const linePath = (field) => {
    let p = '', pen = false;
    rows.forEach((r, i) => {
      if (r[field] == null) { pen = false; return; }
      p += (pen ? ` L${xMid(i)},${ysM(r[field])}` : ` M${xMid(i)},${ysM(r[field])}`);
      pen = true;
    });
    return p;
  };

  const fmtAxisRev = (v) => {
    if (v >= 1e12) return `$${(v / 1e12).toFixed(1)}T`;
    if (v >= 1e9)  return `$${(v / 1e9).toFixed(0)}B`;
    if (v >= 1e6)  return `$${(v / 1e6).toFixed(0)}M`;
    return `$${v.toFixed(0)}`;
  };
  const revTicks = ticks(0, revMax, 5);
  const mTicks = ticks(mMin, mMax, 5);

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      <svg width="100%" height={height} className="chart-svg"
           onMouseLeave={() => setHover(null)}>
        {/* grid + left axis (revenue) */}
        {revTicks.map((t, i) => (
          <g key={i}>
            <line x1={padL} x2={padL + innerW} y1={ysRev(t)} y2={ysRev(t)}
                  stroke={c.grid} strokeDasharray="2,3" opacity="0.6" />
            <text x={padL - 8} y={ysRev(t) + 3} fontSize="10" fill={c.mutedSoft}
                  textAnchor="end">{fmtAxisRev(t)}</text>
          </g>
        ))}
        {/* right axis (margins) */}
        {mTicks.map((t, i) => (
          <text key={i} x={padL + innerW + 8} y={ysM(t) + 3} fontSize="10"
                fill={c.mutedSoft} textAnchor="start">{(t * 100).toFixed(0)}%</text>
        ))}

        {/* revenue bars */}
        {rows.map((r, i) => (
          <rect key={i}
                x={xMid(i) - barW / 2} y={ysRev(r.rev)}
                width={barW} height={Math.max(0, padT + innerH - ysRev(r.rev))}
                fill={c.primary}
                fillOpacity={hover && hover.i === i ? 0.95 : 0.7}
                onMouseEnter={() => setHover({ i, x: xMid(i), y: ysRev(r.rev), r })} />
        ))}

        {/* margin lines + markers */}
        <path d={linePath('gm')} stroke={c.pos} strokeWidth="1.8" fill="none" strokeLinejoin="round" />
        <path d={linePath('nm')} stroke={c.accent} strokeWidth="1.8" fill="none" strokeLinejoin="round" />
        {rows.map((r, i) => (
          <g key={i}>
            {r.gm != null &&
              <circle cx={xMid(i)} cy={ysM(r.gm)} r="3.5" fill={c.bgCard} stroke={c.pos} strokeWidth="1.6"
                      onMouseEnter={() => setHover({ i, x: xMid(i), y: ysM(r.gm), r })} />}
            {r.nm != null &&
              <circle cx={xMid(i)} cy={ysM(r.nm)} r="3.5" fill={c.bgCard} stroke={c.accent} strokeWidth="1.6"
                      onMouseEnter={() => setHover({ i, x: xMid(i), y: ysM(r.nm), r })} />}
          </g>
        ))}

        {/* x labels: period end + basis */}
        {rows.map((r, i) => (
          <g key={i}>
            <text x={xMid(i)} y={height - 16} fontSize="10" fill={c.mutedSoft} textAnchor="middle">
              {r.d.slice(0, 7)}
            </text>
            <text x={xMid(i)} y={height - 4} fontSize="8.5" fill={c.muted} textAnchor="middle"
                  letterSpacing="1">{basisLabel}</text>
          </g>
        ))}
      </svg>
      {hover && (
        <div className="tooltip" style={{ left: hover.x, top: Math.max(4, hover.y - 8) }}>
          <span className="k">{hover.r.d} · {basisLabel}</span>
          REV {fmtCompact(hover.r.rev)}<br />
          GM {hover.r.gm != null ? fmtPct(hover.r.gm, 1) : '—'} · NM {hover.r.nm != null ? fmtPct(hover.r.nm, 1) : '—'}
        </div>
      )}
    </div>
  );
}
window.RevenueMarginsChart = RevenueMarginsChart;
