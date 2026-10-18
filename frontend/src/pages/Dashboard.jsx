import { useEffect, useState, useRef } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid } from 'recharts'
import { apiFetch } from '../api'

const TIER_COLORS = ['#2d3d2d', '#10b981', '#34d399', '#fbbf24']

function fmt(n) {
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(1)}K`
  return `$${n.toFixed(0)}`
}

const CHART_STYLE = {
  tooltip: { background: 'rgba(9,9,11,0.95)', border: '1px solid rgba(16,185,129,0.10)', borderRadius: 12, fontSize: 12, color: '#fafafa', backdropFilter: 'blur(16px)' },
}

// ─── Animated count-up ───
function useCountUp(target, duration = 2000) {
  const [value, setValue] = useState(0)
  const raf = useRef(null)
  useEffect(() => {
    if (!target) return
    let start = null
    const tick = (ts) => {
      if (!start) start = ts
      const progress = Math.min((ts - start) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)   // ease-out cubic
      setValue(Math.round(eased * target))
      if (progress < 1) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => raf.current && cancelAnimationFrame(raf.current)
  }, [target, duration])
  return value
}

// ─── Daily briefing template ───
function buildBriefing(summary, sweep, equity, metrics) {
  if (!summary || !sweep) return []
  const reg = summary.regime
  const isStress = reg.label === 'STRESS'

  const lines = []

  lines.push(
    isStress
      ? `⚠ Regime: STRESS — probability ${(reg.stress_probability * 100).toFixed(0)}%${reg.cusum_alert ? ', CUSUM signal active' : ''}. Sweep quantile raised to ${(sweep.optimal_quantile_adjusted * 100).toFixed(1)}%.`
      : `Regime: NORMAL — stress probability ${(reg.stress_probability * 100).toFixed(0)}%${reg.cusum_alert ? '. CUSUM signal active — monitor closely' : ''}. Flows within expected bounds.`
  )

  lines.push(
    `Sweep recommendation: move ${fmt(sweep.sweep_to_repo_usd)} to repo, holding ${fmt(sweep.optimal_cash_buffer_usd)} in cash at the ${(sweep.optimal_quantile_adjusted * 100).toFixed(1)}th percentile buffer.`
  )

  if (equity) {
    lines.push(
      equity.de_risk_triggered
        ? `Equity sleeve: de-risk triggered — index down ${Math.abs(equity.drawdown_from_peak_pct).toFixed(1)}% from peak. Equity allocation reduced by 50%.`
        : `Equity sleeve: within tolerance at ${Math.abs(equity.drawdown_from_peak_pct).toFixed(1)}% drawdown from peak.`
    )
  }

  if (metrics) {
    const saved = metrics.newsvendor.total_pnl_usd - metrics.naive.total_pnl_usd
    const avoided = Math.max(metrics.naive.overdraft_events - metrics.newsvendor.overdraft_events, 0)
    const bps = ((saved / 500_000_000) * 10000).toFixed(1)
    lines.push(
      `YTD: +${fmt(saved)} (${bps} bps) over the 20% cash baseline. ${avoided} overdraft event${avoided !== 1 ? 's' : ''} avoided.`
    )
  }

  return lines
}

function KpiCard({ label, value, sub, valueColor = 'var(--text1)', accentColor }) {
  return (
    <div className="card flex flex-col gap-1" style={{ borderLeft: `3px solid ${accentColor || 'var(--border2)'}` }}>
      <p className="stat-label">{label}</p>
      <p className="stat-value" style={{ color: valueColor, fontSize: '1.5rem' }}>{value}</p>
      {sub && <p className="text-xs mt-0.5" style={{ color: 'var(--text2)' }}>{sub}</p>}
    </div>
  )
}

export default function Dashboard() {
  const [summary, setSummary] = useState(null)
  const [ts, setTs] = useState([])
  const [sweep, setSweep] = useState(null)
  const [equity, setEquity] = useState(null)
  const [metrics, setMetrics] = useState(null)

  useEffect(() => {
    const safe = (url, setter) =>
      apiFetch(url).then(r => r.ok ? r.json() : Promise.reject(r.status)).then(setter).catch(() => {})
    safe('/api/summary', setSummary)
    safe('/api/timeseries?limit=168', d => setTs(d.data || []))
    safe('/api/sweep', setSweep)
    safe('/api/equity-sleeve', setEquity)
    safe('/api/metrics', setMetrics)
  }, [])

  const savingsRaw = metrics
    ? Math.max(metrics.newsvendor.total_pnl_usd - metrics.naive.total_pnl_usd, 0)
    : 0
  const animatedSavings = useCountUp(savingsRaw, 2200)
  const bps = metrics ? ((savingsRaw / 500_000_000) * 10000).toFixed(1) : '—'
  const overdraftsAvoided = metrics
    ? Math.max(metrics.naive.overdraft_events - metrics.newsvendor.overdraft_events, 0)
    : 0

  const briefingLines = buildBriefing(summary, sweep, equity, metrics)

  if (!summary) return (
    <div className="flex flex-col items-center justify-center h-64 gap-4">
      <div className="w-10 h-10 rounded-full animate-spin"
        style={{ border: '3px solid rgba(16,185,129,0.10)', borderTop: '3px solid var(--purple)' }} />
      <p className="text-sm" style={{ color: 'var(--text2)' }}>Loading data and training models… (~30s)</p>
    </div>
  )

  const alloc = summary.tier_allocation
  const pieData = [
    { name: 'Cash',     value: alloc.cash_pct },
    { name: 'Repo',     value: alloc.repo_pct },
    { name: 'Bonds',    value: alloc.bonds_pct },
    { name: 'Equities', value: alloc.equities_pct },
  ]
  const reg = summary.regime
  const mkt = summary.market
  const isStress = reg.label === 'STRESS'

  return (
    <div className="space-y-5">

      {/* ─── Header ─── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold grad-text">Treasury Dashboard</h1>
          </div>
        <div className="flex items-center gap-2">
          <span className={isStress ? 'badge-red' : 'badge-green'}>
            <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${isStress ? 'bg-red-400' : 'bg-green-400'}`} />
            {reg.label}
          </span>
          <span className="badge-amber">Stress {(reg.stress_probability * 100).toFixed(1)}%</span>
          {reg.cusum_alert && <span className="badge-red">CUSUM ⚠</span>}
        </div>
      </div>

      {/* ─── Savings counter hero — reference: "My Spendings $10,867.62" card style ─── */}
      <div className="card" style={{
        background: 'linear-gradient(135deg, rgba(5,150,105,0.13), rgba(4,120,87,0.06), rgba(9,9,11,0.88))',
        borderColor: 'rgba(16,185,129,0.22)',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Top-right radial glow (reference app's subtle card glow) */}
        <div style={{
          position: 'absolute', top: -50, right: -50,
          width: 200, height: 200, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(16,185,129,0.16) 0%, transparent 68%)',
          pointerEvents: 'none',
        }} />
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <p className="stat-label" style={{ color: 'var(--text3)' }}>
              Newsvendor Strategy — YTD Outperformance
            </p>
            <p style={{
              fontSize: '2.9rem', fontWeight: 900, lineHeight: 1.05,
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '-0.04em',
              color: '#f0fdf4',
              marginTop: 6,
            }}>
              {metrics ? `$${animatedSavings.toLocaleString()}` : '—'}
            </p>
            <div className="flex items-center gap-2 mt-2">
              <span className="delta-chip">+{bps} bps</span>
              <span style={{ color: 'var(--text3)', fontSize: '0.75rem' }}>vs flat 20% cash buffer</span>
            </div>
          </div>
          {/* Reference-app style mini bar chart for the stat panel */}
          <div className="flex flex-col items-end gap-3">
            <div className="flex items-end gap-3 flex-wrap">
              <div style={{ textAlign: 'right' }}>
                <p className="stat-label">Overdrafts Avoided</p>
                <p style={{ color: '#fbbf24', fontSize: '1.55rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.03em', marginTop: 2 }}>
                  {metrics ? overdraftsAvoided : '—'}
                </p>
                <p style={{ color: 'var(--text3)', fontSize: '0.68rem' }}>emergency events</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p className="stat-label">Newsvendor Sharpe</p>
                <p style={{ color: 'var(--text1)', fontSize: '1.55rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.03em', marginTop: 2 }}>
                  {metrics ? metrics.newsvendor.sharpe_ratio.toFixed(3) : '—'}
                </p>
                <p style={{ color: 'var(--text3)', fontSize: '0.68rem' }}>vs {metrics ? metrics.naive.sharpe_ratio.toFixed(3) : '—'} naive</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Daily briefing ─── */}
      {briefingLines.length > 0 && (
        <div className="card" style={{ borderColor: 'rgba(16,185,129,0.15)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {briefingLines.map((line, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{
                  width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                  background: 'rgba(16,185,129,0.10)',
                  border: '1px solid rgba(16,185,129,0.18)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.6rem', fontWeight: 700, color: 'var(--purple)',
                  marginTop: 2,
                }}>{i + 1}</span>
                <p style={{ color: 'var(--text1)', fontSize: '0.82rem', lineHeight: 1.55 }}>{line}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Top KPIs ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Total AUM"       value={fmt(summary.total_aum_usd)} accentColor="#3f4f3f" />
        <KpiCard label="Repo Rate APY"   value={`${mkt.repo_rate_apy_pct.toFixed(3)}%`}  valueColor="var(--text1)" accentColor="#10b981" />
        <KpiCard label="Bond Yield"      value={`${mkt.bond_yield_pct.toFixed(3)}%`}      valueColor="var(--text1)" accentColor="#34d399" />
        <KpiCard
          label="Yield Drag / Day"
          value={fmt(summary.yield_drag.daily_cost_usd)}
          sub={`${fmt(summary.yield_drag.hourly_cost_usd)}/hr excess cash cost`}
          valueColor="var(--amber)" accentColor="var(--amber)"
        />
      </div>

      {/* ─── Allocation + Flow ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="card">
          <p className="stat-label mb-4">Tier Allocation</p>
          <div className="flex items-center gap-4">
            <PieChart width={160} height={160}>
              <Pie data={pieData} dataKey="value" cx="50%" cy="50%" innerRadius={45} outerRadius={72} paddingAngle={3}>
                {pieData.map((_, i) => <Cell key={i} fill={TIER_COLORS[i]} />)}
              </Pie>
              <Tooltip formatter={v => `${v.toFixed(1)}%`} contentStyle={CHART_STYLE.tooltip} />
            </PieChart>
            <div className="space-y-3 flex-1">
              {pieData.map((d, i) => (
                <div key={d.name}>
                  <div className="flex justify-between items-center mb-1">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ background: TIER_COLORS[i] }} />
                      <span className="text-sm font-medium" style={{ color: 'var(--text1)' }}>{d.name}</span>
                    </div>
                    <span className="text-sm font-bold tabular-nums" style={{ color: TIER_COLORS[i] }}>{d.value.toFixed(1)}%</span>
                  </div>
                  <div className="progress-track">
                    <div className="progress-bar" style={{ width: `${d.value}%`, background: TIER_COLORS[i] }} />
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text3)' }}>{fmt(alloc[`${d.name.toLowerCase()}_usd`])}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <p className="stat-label mb-4">Net Flow — Last 7 Days</p>
          <ResponsiveContainer width="100%" height={190}>
            <AreaChart data={ts.slice(-168)} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="flowG" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#059669" stopOpacity={0.30} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(16,185,129,0.06)" />
              <XAxis dataKey="timestamp" tick={false} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={v => `${(v/1e6).toFixed(0)}M`} tick={{ fill: '#475569', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip formatter={v => fmt(v)} contentStyle={CHART_STYLE.tooltip} />
              <Area type="monotone" dataKey="net_flow_usd" stroke="var(--purple)" fill="url(#flowG)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ─── Market snapshot ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          ['Stock Index',        mkt.stock_price.toFixed(2),                                                '#60a5fa'],
          ['Stock Volatility',   `${mkt.stock_vol_pct.toFixed(1)}%`,                                       '#fb923c'],
          ['Bond Price Index',   mkt.bond_price_index.toFixed(3),                                          'var(--text1)'],
          ['Stress Probability', `${(reg.stress_probability * 100).toFixed(1)}%`, reg.stress_probability > 0.5 ? '#f87171' : 'var(--text1)'],
        ].map(([label, value, color]) => (
          <KpiCard key={label} label={label} value={value} valueColor={color} accentColor={color} />
        ))}
      </div>
    </div>
  )
}
