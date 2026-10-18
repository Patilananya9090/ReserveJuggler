import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { apiFetch } from '../api'

function fmt(n) {
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(1)}K`
  return `$${n?.toFixed(0) ?? 0}`
}

const Q_LABELS = { q05: 'p5', q10: 'p10', q25: 'p25', q50: 'Median', q75: 'p75', q90: 'p90', q95: 'p95' }
const Q_COLORS = ['#164e63','#047857','#059669','#10b981','#059669','#047857','#6ee7b7']

const TT = { background: 'rgba(9,9,11,0.95)', border: '1px solid rgba(16,185,129,0.09)', borderRadius: 12, fontSize: 12, color: '#fafafa', backdropFilter: 'blur(16px)' }

export default function Forecast() {
  const [forecast, setForecast] = useState(null)
  const [sweep, setSweep] = useState(null)

  useEffect(() => {
    const safe = (url, setter) =>
      apiFetch(url).then(r => r.ok ? r.json() : Promise.reject(r.status)).then(setter).catch(() => {})
    safe('/api/forecast', setForecast)
    safe('/api/sweep', setSweep)
  }, [])

  if (!forecast || !sweep) return (
    <div className="flex flex-col items-center justify-center h-64 gap-4">
      <div className="w-10 h-10 rounded-full animate-spin" style={{ border: '3px solid rgba(16,185,129,0.10)', borderTop: '3px solid var(--purple)' }} />
      <p className="text-sm" style={{ color: 'var(--text2)' }}>Loading forecast…</p>
    </div>
  )

  const chartData = Object.entries(Q_LABELS).map(([key, label], i) => ({
    label,
    value: forecast[key] || 0,
    fill: Q_COLORS[i],
  }))

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold grad-text">Overnight Outflow Forecast</h1>

      <div className="card">
        <p className="stat-label mb-4">Forecast Quantile Distribution</p>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData} margin={{ left: 0, right: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(16,185,129,0.06)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={v => `${(v/1e6).toFixed(1)}M`} tick={{ fill: '#475569', fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip formatter={v => fmt(v)} contentStyle={TT} />
            <Bar dataKey="value" radius={[6,6,0,0]}>
              {chartData.map((d, i) => <Cell key={i} fill={d.fill} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {sweep && (
        <div className="card" style={{ borderLeft: '3px solid rgba(16,185,129,0.45)' }}>
          <div className="flex items-center gap-2 mb-5">
            <span className="text-base">⚡</span>
            <h2 className="text-sm font-bold" style={{ color: 'var(--text1)' }}>Newsvendor Sweep Recommendation</h2>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              ['Optimal Quantile', `${(sweep.optimal_quantile_adjusted * 100).toFixed(1)}%`, 'var(--text1)'],
              ['Cash Buffer', fmt(sweep.optimal_cash_buffer_usd), 'var(--text1)'],
              ['Sweep to Repo', fmt(sweep.sweep_to_repo_usd), 'var(--text1)'],
              ['Overdraft APR', `${sweep.overdraft_penalty_apr_pct}%`, '#f87171'],
            ].map(([label, value, color]) => (
              <div key={label}>
                <p className="stat-label">{label}</p>
                <p className="text-2xl font-bold tabular-nums mt-1" style={{ color }}>{value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}
