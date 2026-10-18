import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { apiFetch } from '../api'

function fmt(n) { return `$${(n / 1e6).toFixed(1)}M` }

const TIER_COLORS = { cash: '#2d3d2d', repo: '#10b981', bonds: '#34d399', equities: '#fbbf24' }
const TT = { background: 'rgba(9,9,11,0.95)', border: '1px solid rgba(16,185,129,0.09)', borderRadius: 12, fontSize: 12, color: '#fafafa', backdropFilter: 'blur(16px)' }

export default function Optimizer() {
  const [result, setResult] = useState(null)
  const [horizon, setHorizon] = useState(720)
  const [lambda, setLambda] = useState(2)
  const [loading, setLoading] = useState(false)

  const run = () => {
    setLoading(true)
    apiFetch(`/api/portfolio?horizon=${horizon}&risk_lambda=${lambda}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => { setResult(d); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => { run() }, [])

  const chartData = result ? [
    { name: 'Cash', value: result.allocations.cash_usd, fill: TIER_COLORS.cash },
    { name: 'Repo', value: result.allocations.repo_usd, fill: TIER_COLORS.repo },
    { name: 'Bonds', value: result.allocations.bonds_usd, fill: TIER_COLORS.bonds },
    { name: 'Equities', value: result.allocations.equities_usd, fill: TIER_COLORS.equities },
  ] : []

  const riskLabel = lambda <= 2 ? ['Aggressive', '#f87171'] : lambda <= 5 ? ['Balanced', '#fbbf24'] : ['Defensive', '#4ade80']

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold grad-text">Mean-Variance Portfolio Optimizer</h1>

      {/* Controls */}
      <div className="card flex flex-wrap gap-8 items-end">
        <div>
          <p className="stat-label mb-3">Planning Horizon</p>
          <div className="flex gap-2">
            {[{h:720,label:'30d'},{h:2160,label:'90d'},{h:8760,label:'1yr'}].map(({h,label}) => (
              <button key={h} onClick={() => setHorizon(h)}
                className="px-4 py-2 rounded-xl text-sm font-semibold transition-colors"
                style={{
                  background: horizon === h ? 'linear-gradient(135deg, #059669, #047857)' : 'var(--surface2)',
                  color: horizon === h ? '#f0fdf4' : 'var(--text2)',
                  border: `1px solid ${horizon === h ? 'rgba(16,185,129,0.55)' : 'var(--border)'}`,
                  borderRadius: 9999,
                  boxShadow: horizon === h ? '0 0 0 1px rgba(16,185,129,0.30)' : 'none',
                }}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 min-w-52">
          <div className="flex justify-between items-center mb-2">
            <p className="stat-label">Risk Aversion λ = {lambda}</p>
            <span className="text-xs font-bold" style={{ color: riskLabel[1] }}>{riskLabel[0]}</span>
          </div>
          <input type="range" min="0.5" max="10" step="0.5" value={lambda} onChange={e => setLambda(+e.target.value)}
            className="w-full cursor-pointer" style={{ accentColor: 'var(--purple)' }} />
          <div className="flex justify-between text-xs mt-1" style={{ color: 'var(--text3)' }}>
            <span>Yield-seeking</span><span>Risk-averse</span>
          </div>
        </div>
        <button onClick={run} disabled={loading} className="btn-primary">
          {loading ? <span className="flex items-center gap-2">
            <span className="w-4 h-4 rounded-full animate-spin" style={{ border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid white' }} />
            Optimizing…
          </span> : 'Run Optimizer'}
        </button>
      </div>

      {result && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              ['Expected Yield', fmt(result.expected_yield_usd_horizon), 'var(--text1)'],
              ['Annualized Yield', `${result.annualized_yield_pct.toFixed(3)}%`, 'var(--text1)'],
              ['CVaR 95% Shortfall', fmt(Math.abs(result.cvar_95_usd)), '#f87171'],
              ['Total AUM', fmt(result.total_aum_usd), 'var(--text1)'],
            ].map(([label, value, color]) => (
              <div key={label} className="card">
                <p className="stat-label">{label}</p>
                <p className="text-2xl font-bold tabular-nums mt-1" style={{ color }}>{value}</p>
              </div>
            ))}
          </div>

          <div className="card">
            <p className="stat-label mb-4">Optimized Tier Allocation</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ left: 0, right: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(16,185,129,0.06)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={v => `${(v/1e6).toFixed(0)}M`} tick={{ fill: '#475569', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip formatter={v => fmt(v)} contentStyle={TT} />
                <Bar dataKey="value" radius={[8,8,0,0]}
                  label={{ position: 'top', fill: '#64748b', fontSize: 11, formatter: v => `${(v/1e6).toFixed(0)}M` }}>
                  {chartData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-4 gap-3 mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
              {Object.entries(result.weights_pct).map(([tier, pct]) => (
                <div key={tier} className="text-center">
                  <div className="w-2.5 h-2.5 rounded-full mx-auto mb-1" style={{ background: TIER_COLORS[tier] }} />
                  <p className="text-xs capitalize mb-0.5" style={{ color: 'var(--text2)' }}>{tier}</p>
                  <p className="font-bold text-lg tabular-nums" style={{ color: TIER_COLORS[tier] }}>{pct.toFixed(1)}%</p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
