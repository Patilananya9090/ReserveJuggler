import { useEffect, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { apiFetch } from '../api'

function fmt(n) {
  if (Math.abs(n) >= 1e6) return `$${(n/1e6).toFixed(2)}M`
  if (Math.abs(n) >= 1e3) return `$${(n/1e3).toFixed(1)}K`
  return `$${n?.toFixed(2)}`
}

const TT = { background: 'rgba(9,9,11,0.95)', border: '1px solid rgba(16,185,129,0.09)', borderRadius: 12, fontSize: 12, color: '#fafafa', backdropFilter: 'blur(16px)' }

export default function Metrics() {
  const [metrics, setMetrics] = useState(null)

  useEffect(() => {
    apiFetch('/api/metrics').then(r => r.ok ? r.json() : Promise.reject(r.status)).then(setMetrics).catch(() => {})
  }, [])

  if (!metrics) return (
    <div className="flex flex-col items-center justify-center h-64 gap-4">
      <div className="w-10 h-10 rounded-full animate-spin" style={{ border: '3px solid rgba(16,185,129,0.10)', borderTop: '3px solid var(--purple)' }} />
      <p className="text-sm" style={{ color: 'var(--text2)' }}>Running full-year backtest…</p>
    </div>
  )

  const nv = metrics.newsvendor
  const naive = metrics.naive

  const cumulativeData = (metrics.daily_pnl || []).reduce((acc, d, i) => {
    const prev = acc[i - 1] || { nv_cum: 0, naive_cum: 0 }
    acc.push({ date: d.timestamp.slice(0, 10), nv_cum: prev.nv_cum + d.newsvendor_pnl, naive_cum: prev.naive_cum + d.naive_pnl })
    return acc
  }, [])

  const heatmap = metrics.penalty_heatmap || []
  const uniqueOutflows = [...new Set(heatmap.map(d => d.outflow_bucket))].sort((a,b)=>a-b)
  const uniqueQuantiles = [...new Set(heatmap.map(d => d.quantile))].sort((a,b)=>a-b)
  const maxCost = Math.max(...heatmap.map(h => h.total_cost))

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold grad-text">Backtested Performance</h1>

      {/* Advantage callout */}
      <div className="card" style={{ background: 'linear-gradient(135deg, rgba(5,150,105,0.10), rgba(9,9,11,0.88))', borderColor: 'rgba(16,185,129,0.18)' }}>
        <div className="flex items-center gap-8 flex-wrap">
          <div>
            <p className="stat-label">Newsvendor Advantage</p>
            <p className="font-black tabular-nums mt-1" style={{ fontSize: '3rem', lineHeight: 1, color: 'var(--text1)' }}>
              {metrics.advantage_pct > 0 ? '+' : ''}{metrics.advantage_pct.toFixed(4)}%
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--text2)' }}>of AUM</p>
          </div>
          <div style={{ width: 1, height: 56, background: 'var(--border2)' }} className="hidden lg:block" />
          <div>
            <p className="stat-label">Additional P&L</p>
            <p className="text-3xl font-bold tabular-nums mt-1" style={{ color: '#4ade80' }}>{fmt(nv.total_pnl_usd - naive.total_pnl_usd)}</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text2)' }}>over the full year</p>
          </div>
        </div>
      </div>

      {/* Side-by-side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {[['Newsvendor Strategy', nv, 'var(--orange)', true], ['Naive 20% Cash', naive, 'var(--text2)', false]].map(([label, data, headColor, isNv]) => (
          <div key={label} className="card" style={{ borderColor: isNv ? 'rgba(16,185,129,0.18)' : 'var(--border)' }}>
            <div className="flex items-center gap-2 mb-5">
              <div className="w-1 h-6 rounded-full" style={{ background: isNv ? '#10b981' : 'var(--text3)' }} />
              <h2 className="text-sm font-bold" style={{ color: headColor }}>{label}</h2>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                ['Total P&L', fmt(data.total_pnl_usd), '#4ade80'],
                ['Avg Daily P&L', fmt(data.avg_daily_pnl_usd), 'var(--text1)'],
                ['Sharpe Ratio', data.sharpe_ratio.toFixed(3), 'var(--text1)'],
                ['Annualized Yield', `${data.annualized_yield_pct.toFixed(4)}%`, 'var(--text1)'],
                ['Overdraft Events', data.overdraft_events, data.overdraft_events > 0 ? '#f87171' : '#4ade80'],
                ['Overdraft Rate', `${data.overdraft_rate_pct.toFixed(2)}%`, data.overdraft_rate_pct > 1 ? '#f87171' : '#4ade80'],
                ['Worst Day', fmt(data.max_single_loss_usd), '#f87171'],
              ].map(([l, v, cls]) => (
                <div key={l} className="card2">
                  <p className="stat-label">{l}</p>
                  <p className="font-bold text-lg tabular-nums mt-0.5" style={{ color: cls }}>{v}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Cumulative PnL */}
      <div className="card">
        <p className="stat-label mb-4">Cumulative P&L — Newsvendor vs Naive</p>
        <ResponsiveContainer width="100%" height={230}>
          <LineChart data={cumulativeData} margin={{ left: 0, right: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(16,185,129,0.06)" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: '#475569', fontSize: 9 }} interval={30} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={v => Math.abs(v) >= 1e6 ? `$${(v/1e6).toFixed(1)}M` : `$${(v/1e3).toFixed(0)}K`} tick={{ fill: '#475569', fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip formatter={v => fmt(v)} contentStyle={TT} />
            <Legend wrapperStyle={{ color: '#64748b' }} />
            <Line type="monotone" dataKey="nv_cum" stroke="#10b981" dot={false} strokeWidth={2.5} name="Newsvendor" />
            <Line type="monotone" dataKey="naive_cum" stroke="#3f3f46" dot={false} strokeWidth={1.5} strokeDasharray="5 5" name="Naive 20%" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Penalty heatmap */}
      <div className="card">
        <p className="stat-label mb-1">Penalty Heat Map</p>
        <div className="overflow-x-auto">
          <table className="text-xs w-full border-collapse">
            <thead>
              <tr>
                <th className="text-left p-2 font-semibold" style={{ color: 'var(--text2)' }}>q \ outflow</th>
                {uniqueOutflows.map(o => (
                  <th key={o} className="p-2 font-medium" style={{ color: 'var(--text2)' }}>{(o/1e6).toFixed(1)}M</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {uniqueQuantiles.map(q => (
                <tr key={q}>
                  <td className="p-2 font-semibold" style={{ color: 'var(--text1)' }}>{(q*100).toFixed(0)}%</td>
                  {uniqueOutflows.map(o => {
                    const cell = heatmap.find(h => h.quantile === q && Math.abs(h.outflow_bucket - o) < 1e5)
                    const cost = cell?.total_cost ?? 0
                    const t = maxCost > 0 ? cost / maxCost : 0
                    // Dark blue (cheap) → orange-red (expensive)
                    const r = Math.round(30 + 200 * t)
                    const g = Math.round(60 - 30 * t)
                    const b = Math.round(120 - 100 * t)
                    return (
                      <td key={o} className="p-1.5 text-center font-medium rounded-sm"
                        style={{ background: `rgba(${r},${g},${b},0.75)`, color: t > 0.4 ? '#f1f5f9' : '#64748b' }}>
                        {cost > 1000 ? `${(cost/1e3).toFixed(0)}K` : cost.toFixed(0)}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
