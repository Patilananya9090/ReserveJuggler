import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { apiFetch } from '../api'

function fmt(n) {
  const abs = Math.abs(n), sign = n < 0 ? '-' : ''
  if (abs >= 1e6) return `${sign}$${(abs/1e6).toFixed(1)}M`
  if (abs >= 1e3) return `${sign}$${(abs/1e3).toFixed(1)}K`
  return `${sign}$${abs.toFixed(0)}`
}

const TT = { background: 'rgba(9,9,11,0.95)', border: '1px solid rgba(16,185,129,0.09)', borderRadius: 12, fontSize: 12, color: '#fafafa', backdropFilter: 'blur(16px)' }

export default function Sleeves() {
  const [bonds, setBonds] = useState(null)
  const [equity, setEquity] = useState(null)

  useEffect(() => {
    const safe = (url, setter) =>
      apiFetch(url).then(r => r.ok ? r.json() : Promise.reject(r.status)).then(setter).catch(() => {})
    safe('/api/bond-sleeve', setBonds)
    safe('/api/equity-sleeve', setEquity)
  }, [])

  if (!bonds || !equity) return (
    <div className="flex flex-col items-center justify-center h-64 gap-4">
      <div className="w-10 h-10 rounded-full animate-spin" style={{ border: '3px solid rgba(16,185,129,0.10)', borderTop: '3px solid var(--purple)' }} />
      <p className="text-sm" style={{ color: 'var(--text2)' }}>Loading sleeves…</p>
    </div>
  )

  const bucketData = bonds.ladder.map(b => ({
    name: b.bucket, notional: b.notional_usd, carry: b.carry_annual_usd,
  }))

  const drawdownPct = Math.abs(equity.drawdown_from_peak_pct)
  const threshold = Math.abs(equity.de_risk_threshold_pct)

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold grad-text">Bond & Equity Sleeves</h1>

      {/* Bond Sleeve */}
      <div className="card">
        <div className="flex items-start justify-between flex-wrap gap-3 mb-5">
          <h2 className="text-sm font-bold" style={{ color: 'var(--text1)' }}>Bond Sleeve — Maturity Ladder</h2>
          <span className={bonds.carry_beats_rate_shock ? 'badge-green' : 'badge-red'}>
            {bonds.carry_beats_rate_shock ? '✓' : '✗'} Carry {bonds.carry_annual_pct.toFixed(3)}% vs shock {bonds.rate_shock_loss_pct.toFixed(3)}%
          </span>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          {[
            ['Total Notional', fmt(bonds.total_bond_notional_usd), 'var(--text1)'],
            ['Yield', `${bonds.current_yield_pct.toFixed(3)}%`, 'var(--text1)'],
            ['DV01 (Total)', fmt(bonds.dv01_total_usd), 'var(--text1)'],
            ['100bp Price Impact', `${bonds.price_impact_100bp_pct.toFixed(3)}%`, '#f87171'],
          ].map(([label, val, color]) => (
            <div key={label} className="card2">
              <p className="stat-label">{label}</p>
              <p className="text-xl font-bold tabular-nums mt-1" style={{ color }}>{val}</p>
            </div>
          ))}
        </div>

        <ResponsiveContainer width="100%" height={190}>
          <BarChart data={bucketData} margin={{ left: 0, right: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(16,185,129,0.06)" vertical={false} />
            <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={v => `${(v/1e6).toFixed(0)}M`} tick={{ fill: '#475569', fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip formatter={fmt} contentStyle={TT} />
            <Bar dataKey="notional" fill="#10b981" radius={[6,6,0,0]} name="Notional" />
            <Bar dataKey="carry" fill="#6ee7b7" radius={[6,6,0,0]} name="Annual Carry" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Equity Sleeve */}
      <div className="card" style={{ borderColor: equity.de_risk_triggered ? 'rgba(239,68,68,0.3)' : 'rgba(245,158,11,0.2)' }}>
        <div className="flex items-start justify-between flex-wrap gap-3 mb-5">
          <h2 className="text-sm font-bold" style={{ color: 'var(--text1)' }}>Equity Sleeve</h2>
          <span className={equity.de_risk_triggered ? 'badge-red' : 'badge-amber'}>{equity.action}</span>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          {[
            ['Current Price', equity.current_stock_price.toFixed(2), 'var(--text1)'],
            ['Peak Price', equity.peak_stock_price.toFixed(2), 'var(--text1)'],
            ['Annualized Vol', `${equity.annualized_volatility_pct.toFixed(1)}%`, '#fbbf24'],
            ['Sharpe (vs Repo)', equity.estimated_sharpe.toFixed(3), 'var(--text1)'],
          ].map(([label, val, color]) => (
            <div key={label} className="card2">
              <p className="stat-label">{label}</p>
              <p className="text-xl font-bold tabular-nums mt-1" style={{ color }}>{val}</p>
            </div>
          ))}
        </div>

        <div className="mb-5">
          <div className="flex justify-between text-sm mb-2">
            <span style={{ color: 'var(--text2)' }}>
              Drawdown from Peak:{' '}
              <strong style={{ color: equity.de_risk_triggered ? '#f87171' : '#fbbf24' }}>
                {Math.abs(equity.drawdown_from_peak_pct).toFixed(2)}% below 90-day peak
              </strong>
            </span>
            <span style={{ color: 'var(--text3)' }}>Threshold: {threshold}%</span>
          </div>
          <div className="progress-track" style={{ height: 8 }}>
            <div className="progress-bar"
              style={{ width: `${Math.min(drawdownPct / threshold * 100, 100)}%`, background: equity.de_risk_triggered ? '#ef4444' : '#f59e0b' }} />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
          {[
            ['Current Equity', fmt(equity.current_equity_notional_usd), 'var(--text1)'],
            ['Recommended', fmt(equity.recommended_equity_usd), '#fbbf24'],
            ['Perm Capital Cap', fmt(equity.permanent_capital_cap_usd), 'var(--text2)'],
          ].map(([label, val, color]) => (
            <div key={label}>
              <p className="stat-label">{label}</p>
              <p className="text-xl font-bold tabular-nums mt-1" style={{ color }}>{val}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
