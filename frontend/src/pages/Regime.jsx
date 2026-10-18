import { useEffect, useState } from 'react'
import { ComposedChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceArea } from 'recharts'
import { apiFetch } from '../api'

function fmt(n) {
  if (Math.abs(n) >= 1e6) return `$${(n/1e6).toFixed(1)}M`
  return `$${n?.toFixed(0)}`
}

const TT = { background: 'rgba(9,9,11,0.95)', border: '1px solid rgba(16,185,129,0.09)', borderRadius: 12, fontSize: 12, color: '#fafafa', backdropFilter: 'blur(16px)' }

export default function Regime() {
  const [regime, setRegime] = useState(null)
  const [simResult, setSimResult] = useState(null)
  const [simParams, setSimParams] = useState({ multiplier: 3, start_hour: 22, duration: 6, cash: 50e6, repo: 300e6, bonds: 100e6, equities: 50e6 })
  const [simLoading, setSimLoading] = useState(false)

  useEffect(() => {
    apiFetch('/api/regime').then(r => r.ok ? r.json() : Promise.reject(r.status)).then(setRegime).catch(() => {})
  }, [])

  const runSim = () => {
    setSimLoading(true)
    const p = simParams
    const url = `/api/simulate?withdrawal_multiplier=${p.multiplier}&shock_start_hour=${p.start_hour}&shock_duration_hours=${p.duration}&current_cash_usd=${p.cash}&current_repo_usd=${p.repo}&current_bonds_usd=${p.bonds}&current_equities_usd=${p.equities}`
    apiFetch(url, { method: 'POST' })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => { setSimResult(d); setSimLoading(false) })
      .catch(() => setSimLoading(false))
  }

  if (!regime) return (
    <div className="flex flex-col items-center justify-center h-64 gap-4">
      <div className="w-10 h-10 rounded-full animate-spin" style={{ border: '3px solid rgba(16,185,129,0.10)', borderTop: '3px solid var(--purple)' }} />
      <p className="text-sm" style={{ color: 'var(--text2)' }}>Loading regime data…</p>
    </div>
  )

  const current = regime.current
  const history = regime.history || []
  const isStress = current.label === 'STRESS'

  const step = Math.max(1, Math.floor(history.length / 200))
  const chartData = history.filter((_, i) => i % step === 0)

  const stressRegions = []
  let start = null
  chartData.forEach((d, i) => {
    if (d.regime === 1 && start === null) start = i
    if (d.regime === 0 && start !== null) { stressRegions.push([start, i - 1]); start = null }
  })
  if (start !== null) stressRegions.push([start, chartData.length - 1])

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold grad-text">Regime Detection & Stress Testing</h1>

      {/* Current regime */}
      <div className="card" style={{
        borderColor: isStress ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.25)',
        background: isStress ? 'rgba(239,68,68,0.04)' : 'rgba(34,197,94,0.03)',
      }}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ background: isStress ? '#ef4444' : '#22c55e' }} />
          <h2 className="text-lg font-bold" style={{ color: isStress ? '#f87171' : '#4ade80' }}>
            Current Regime: {current.label}
          </h2>
          <span className="text-xs" style={{ color: 'var(--text2)' }}>{current.hours_in_current_state}h in this state</span>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            ['Stress Probability', `${(current.stress_probability * 100).toFixed(1)}%`, isStress ? '#f87171' : 'var(--text1)'],
            ['CUSUM Alert', current.cusum_alert ? 'YES' : 'NO', current.cusum_alert ? '#f87171' : 'var(--text1)'],
            ['Quantile Adj', `+${(current.quantile_adjustment * 100).toFixed(0)}%`, 'var(--text1)'],
            ['GMM State', current.state, 'var(--text1)'],
          ].map(([label, val, color]) => (
            <div key={label} className="card2">
              <p className="stat-label">{label}</p>
              <p className="text-2xl font-bold tabular-nums mt-1" style={{ color }}>{val}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Timeline */}
      <div className="card">
        <p className="stat-label mb-4">Full Year Regime Timeline</p>
        <ResponsiveContainer width="100%" height={210}>
          <ComposedChart data={chartData} margin={{ left: 0 }}>
            <defs>
              <linearGradient id="flowG2" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#059669" stopOpacity={0.28} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(16,185,129,0.06)" />
            <XAxis dataKey="timestamp" tick={false} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={v => `${(v/1e6).toFixed(0)}M`} tick={{ fill: '#475569', fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={TT} formatter={(v, n) => n === 'net_flow' ? fmt(v) : v} />
            {stressRegions.map(([s, e], i) => (
              <ReferenceArea key={i} x1={chartData[s]?.timestamp} x2={chartData[e]?.timestamp} fill="#ef4444" fillOpacity={0.10} />
            ))}
            <Area type="monotone" dataKey="net_flow" stroke="var(--purple)" fill="url(#flowG2)" dot={false} strokeWidth={1.5} name="net_flow" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* War Room */}
      <div className="card" style={{ borderColor: 'rgba(16,185,129,0.15)' }}>
        <div className="flex items-center gap-2 mb-5">
          <span className="w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold"
            style={{ background: 'rgba(167,139,250,0.15)', color: '#a78bfa' }}>⚔</span>
          <h2 className="text-sm font-bold" style={{ color: 'var(--text1)' }}>War Room — Withdrawal Shock Simulator</h2>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-4">
          {[
            { label: 'Withdrawal Multiplier', key: 'multiplier', min: 1, max: 20, step: 0.5 },
            { label: 'Start Hour (0–23)', key: 'start_hour', min: 0, max: 23, step: 1 },
            { label: 'Duration (hours)', key: 'duration', min: 1, max: 24, step: 1 },
          ].map(({ label, key, min, max, step }) => (
            <div key={key}>
              <label className="stat-label block mb-2">{label}</label>
              <input type="number" value={simParams[key]} min={min} max={max} step={step}
                onChange={e => setSimParams({ ...simParams, [key]: +e.target.value })}
                className="input-field" />
            </div>
          ))}
          <div className="flex items-end">
            <button onClick={runSim} disabled={simLoading} className="w-full btn-primary"
              style={{ background: 'linear-gradient(135deg, #059669, #047857)' }}>
              {simLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 rounded-full animate-spin" style={{ border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid white' }} />
                  Simulating…
                </span>
              ) : 'Run Simulation'}
            </button>
          </div>
        </div>

        {simResult && (
          <div className="pt-4 mt-2" style={{ borderTop: '1px solid var(--border)' }}>
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              <span className={simResult.survived ? 'badge-green' : 'badge-red'}>
                {simResult.survived ? '✓ SURVIVED' : '✗ OVERDRAFT TRIGGERED'}
              </span>
              <span className="text-sm" style={{ color: 'var(--text2)' }}>Total shock: <strong style={{ color: 'var(--text1)' }}>{fmt(simResult.scenario.total_shock_usd)}</strong></span>
              <span className="text-sm" style={{ color: '#f87171' }}>Penalties: <strong>{fmt(simResult.total_penalty_usd)}</strong></span>
            </div>
            <div className="space-y-2">
              {simResult.cascade.map((tier, i) => (
                <div key={i} className="flex items-center gap-3 rounded-xl px-4 py-3" style={{ background: 'var(--bg)' }}>
                  <div className="w-6 h-6 rounded-full text-white text-xs flex items-center justify-center font-bold flex-shrink-0"
                    style={{ background: 'linear-gradient(135deg, #059669, #047857)' }}>{i}</div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold" style={{ color: 'var(--text1)' }}>{tier.tier}</p>
                    <div className="progress-track mt-1">
                      <div className="progress-bar" style={{ width: `${Math.min(tier.used_usd / (simResult.scenario.total_shock_usd || 1) * 100, 100)}%` }} />
                    </div>
                  </div>
                  <div className="text-right text-xs flex-shrink-0">
                    <p className="font-semibold" style={{ color: 'var(--text1)' }}>{fmt(tier.used_usd)}</p>
                    {tier.penalty_usd > 0 && <p style={{ color: '#f87171' }}>−{fmt(tier.penalty_usd)} ({tier.haircut_pct.toFixed(1)}%)</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
