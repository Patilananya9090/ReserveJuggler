import { useEffect, useState } from 'react'
import { apiFetch } from '../api'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function hourLabel(h) {
  if (h === 0) return '12 AM'
  if (h === 12) return '12 PM'
  return h < 12 ? `${h} AM` : `${h - 12} PM`
}

function fmtFlow(n) {
  const abs = Math.abs(n)
  const sign = n < 0 ? '−' : '+'
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`
  return `${sign}$${abs.toFixed(0)}`
}

function cellColor(mean, minFlow, maxFlow) {
  if (mean === 0 && minFlow === 0 && maxFlow === 0) return 'rgba(255,255,255,0.04)'
  if (mean < 0) {
    // outflow → red, intensity by fraction of worst
    const t = Math.min(Math.abs(mean) / Math.max(Math.abs(minFlow), 1), 1)
    return `rgba(248,113,113,${0.08 + t * 0.62})`
  }
  // inflow → green
  const t = Math.min(mean / Math.max(maxFlow, 1), 1)
  return `rgba(74,222,128,${0.08 + t * 0.62})`
}

export default function Heatmap() {
  const [data, setData] = useState(null)
  const [hovered, setHovered] = useState(null)   // {hour, day, mean_flow, std_flow}

  useEffect(() => {
    apiFetch('/api/flow-patterns')
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => {
        if (d && Array.isArray(d.heatmap)) setData(d)
        else setData({ heatmap: [], min_flow: 0, max_flow: 0 })
      })
      .catch(() => setData({ heatmap: [], min_flow: 0, max_flow: 0 }))
  }, [])

  if (!data) return (
    <div className="flex flex-col items-center justify-center h-64 gap-4">
      <div className="w-10 h-10 rounded-full animate-spin"
        style={{ border: '3px solid rgba(16,185,129,0.10)', borderTop: '3px solid var(--purple)' }} />
      <p className="text-sm" style={{ color: 'var(--text2)' }}>Building flow pattern map…</p>
    </div>
  )

  if (data.heatmap.length === 0) return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold grad-text">Intraday Flow Pattern Map</h1>
      </div>
      <div className="card flex flex-col items-center justify-center gap-3" style={{ minHeight: 200, borderColor: 'rgba(251,191,36,0.25)' }}>
        <span style={{ fontSize: '2rem' }}>⚠</span>
        <p style={{ color: 'var(--amber)', fontWeight: 600 }}>Backend not reachable</p>
        <p style={{ color: 'var(--text2)', fontSize: '0.82rem', textAlign: 'center', maxWidth: 360 }}>
          Start the FastAPI backend (<code style={{ color: 'var(--purple)' }}>uvicorn main:app --reload</code> in <code style={{ color: 'var(--purple)' }}>backend/</code>), then refresh this page.
        </p>
      </div>
    </div>
  )

  // Build lookup: cell[hour][day] → {mean_flow, std_flow}
  const cell = {}
  for (const d of data.heatmap) {
    if (!cell[d.hour]) cell[d.hour] = {}
    cell[d.hour][d.day] = d
  }

  const { min_flow, max_flow } = data

  // Worst & best single cells
  const worst = data.heatmap.reduce((a, b) => a.mean_flow < b.mean_flow ? a : b)
  const best  = data.heatmap.reduce((a, b) => a.mean_flow > b.mean_flow ? a : b)

  // Per-hour total (sum across 7 days)
  const hourTotals = Array.from({ length: 24 }, (_, h) => {
    const vals = Object.values(cell[h] || {}).map(c => c.mean_flow)
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
  })

  // Per-day total (sum across 24 hours)
  const dayTotals = DAYS.map((_, d) => {
    const vals = data.heatmap.filter(c => c.day === d).map(c => c.mean_flow)
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
  })

  const worstDay = dayTotals.indexOf(Math.min(...dayTotals))
  const bestDay  = dayTotals.indexOf(Math.max(...dayTotals))

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold grad-text">Intraday Flow Pattern Map</h1>
      </div>

      {/* Insight cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Worst Hour', val: `${hourLabel(worst.hour)} ${DAYS[worst.day]}`, sub: fmtFlow(worst.mean_flow), color: '#f87171', border: 'rgba(248,113,113,0.3)' },
          { label: 'Best Hour',  val: `${hourLabel(best.hour)} ${DAYS[best.day]}`,   sub: fmtFlow(best.mean_flow),  color: '#4ade80', border: 'rgba(74,222,128,0.3)' },
          { label: 'Worst Day',  val: DAYS[worstDay], sub: `avg ${fmtFlow(dayTotals[worstDay])}/hr`, color: '#f87171', border: 'rgba(248,113,113,0.3)' },
          { label: 'Best Day',   val: DAYS[bestDay],  sub: `avg ${fmtFlow(dayTotals[bestDay])}/hr`,  color: '#4ade80', border: 'rgba(74,222,128,0.3)' },
        ].map(({ label, val, sub, color, border }) => (
          <div key={label} className="card" style={{ borderLeft: `3px solid ${border}` }}>
            <p className="stat-label">{label}</p>
            <p className="text-xl font-bold mt-1" style={{ color }}>{val}</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text2)' }}>{sub}</p>
          </div>
        ))}
      </div>

      {/* Main heatmap */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '20px 20px 8px' }}>
          <p className="stat-label">Net Flow Heatmap — Red = Outflow · Green = Inflow</p>
        </div>

        {/* Tooltip strip */}
        <div style={{
          minHeight: 36,
          padding: '0 20px 8px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}>
          {hovered ? (
            <>
              <span style={{
                width: 10, height: 10, borderRadius: '50%',
                background: hovered.mean_flow < 0 ? '#f87171' : '#4ade80',
                flexShrink: 0,
              }} />
              <span style={{ color: 'var(--text1)', fontSize: '0.82rem', fontWeight: 600 }}>
                {hourLabel(hovered.hour)} · {DAYS[hovered.day]}
              </span>
              <span style={{ color: hovered.mean_flow < 0 ? '#f87171' : '#4ade80', fontSize: '0.82rem', fontWeight: 700 }}>
                {fmtFlow(hovered.mean_flow)}
              </span>
              <span style={{ color: 'var(--text3)', fontSize: '0.75rem' }}>
                ±{fmtFlow(Math.abs(hovered.std_flow))} σ
              </span>
            </>
          ) : (
            <span style={{ color: 'var(--text3)', fontSize: '0.75rem' }}>Hover a cell for details</span>
          )}
        </div>

        <div style={{ overflowX: 'auto', padding: '0 12px 16px' }}>
          <table style={{ borderCollapse: 'separate', borderSpacing: 3, minWidth: 560 }}>
            <thead>
              <tr>
                <th style={{ width: 52, textAlign: 'right', paddingRight: 10, color: 'var(--text3)', fontSize: '0.65rem', fontWeight: 600 }} />
                {DAYS.map((d, i) => (
                  <th key={d} style={{
                    padding: '4px 0', textAlign: 'center', fontSize: '0.72rem', fontWeight: 700,
                    color: i === worstDay ? '#f87171' : i === bestDay ? '#4ade80' : 'var(--text2)',
                    letterSpacing: '0.04em',
                  }}>
                    {d}
                  </th>
                ))}
                <th style={{ width: 56, textAlign: 'center', color: 'var(--text3)', fontSize: '0.65rem', fontWeight: 600 }}>avg</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 24 }, (_, h) => (
                <tr key={h}>
                  <td style={{
                    textAlign: 'right', paddingRight: 10,
                    color: 'var(--text3)', fontSize: '0.65rem', fontWeight: 600,
                    whiteSpace: 'nowrap', verticalAlign: 'middle',
                  }}>
                    {[0, 6, 12, 18, 23].includes(h) ? hourLabel(h) : ''}
                  </td>
                  {DAYS.map((_, d) => {
                    const c = cell[h]?.[d]
                    const mean = c ? c.mean_flow : 0
                    const bg = cellColor(mean, min_flow, max_flow)
                    const isWorst = worst.hour === h && worst.day === d
                    const isBest  = best.hour  === h && best.day  === d
                    return (
                      <td key={d}
                        onMouseEnter={() => setHovered(c ? { hour: h, day: d, ...c } : null)}
                        onMouseLeave={() => setHovered(null)}
                        style={{
                          width: 72, height: 22, borderRadius: 5,
                          background: bg,
                          cursor: 'default',
                          outline: isWorst ? '2px solid rgba(248,113,113,0.6)' : isBest ? '2px solid rgba(74,222,128,0.6)' : 'none',
                          transition: 'filter 0.15s',
                          filter: hovered && hovered.hour === h && hovered.day === d ? 'brightness(1.4)' : 'none',
                        }}
                      />
                    )
                  })}
                  {/* Row average */}
                  <td style={{
                    textAlign: 'center', fontSize: '0.6rem', fontWeight: 600,
                    color: hourTotals[h] < 0 ? '#f87171' : '#4ade80',
                    verticalAlign: 'middle', paddingLeft: 6,
                  }}>
                    {hourTotals[h] >= 1e6 || Math.abs(hourTotals[h]) >= 1e6
                      ? `${(hourTotals[h] / 1e6).toFixed(1)}M`
                      : `${(hourTotals[h] / 1e3).toFixed(0)}K`}
                  </td>
                </tr>
              ))}
              {/* Column averages row */}
              <tr>
                <td style={{ textAlign: 'right', paddingRight: 10, color: 'var(--text3)', fontSize: '0.65rem', fontWeight: 600 }}>avg</td>
                {DAYS.map((_, d) => (
                  <td key={d} style={{
                    textAlign: 'center', fontSize: '0.6rem', fontWeight: 600, paddingTop: 4,
                    color: dayTotals[d] < 0 ? '#f87171' : '#4ade80',
                  }}>
                    {Math.abs(dayTotals[d]) >= 1e6
                      ? `${(dayTotals[d] / 1e6).toFixed(1)}M`
                      : `${(dayTotals[d] / 1e3).toFixed(0)}K`}
                  </td>
                ))}
                <td />
              </tr>
            </tbody>
          </table>
        </div>

        {/* Legend */}
        <div style={{ padding: '0 20px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: 'var(--text3)', fontSize: '0.65rem' }}>Outflow</span>
          <div style={{
            flex: 1, maxWidth: 200, height: 8, borderRadius: 99,
            background: 'linear-gradient(90deg, rgba(248,113,113,0.75), rgba(255,255,255,0.06), rgba(74,222,128,0.75))',
          }} />
          <span style={{ color: 'var(--text3)', fontSize: '0.65rem' }}>Inflow</span>
        </div>
      </div>

      {/* Day bars */}
      <div className="card">
        <p className="stat-label mb-4">Average Net Flow by Day of Week</p>
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 8, height: 120 }}>
          {DAYS.map((d, i) => {
            const v = dayTotals[i]
            const absMax = Math.max(...dayTotals.map(Math.abs), 1)
            const barPx = Math.max(Math.round((Math.abs(v) / absMax) * 88), 4)
            const isPos = v > 0
            const isWorst = i === worstDay
            const isBest = i === bestDay
            return (
              <div key={d} style={{
                flex: 1, display: 'flex', flexDirection: 'column',
                justifyContent: 'flex-end', alignItems: 'center', gap: 6,
              }}>
                <div style={{
                  width: '100%',
                  height: barPx,
                  borderRadius: isPos ? '6px 6px 2px 2px' : '2px 2px 6px 6px',
                  background: isWorst
                    ? 'rgba(248,113,113,0.65)'
                    : isBest
                    ? 'rgba(74,222,128,0.65)'
                    : isPos ? 'rgba(74,222,128,0.28)' : 'rgba(248,113,113,0.28)',
                  border: `1px solid ${isWorst ? 'rgba(248,113,113,0.45)' : isBest ? 'rgba(74,222,128,0.45)' : 'rgba(255,255,255,0.08)'}`,
                }} />
                <p style={{
                  fontSize: '0.72rem', fontWeight: 700, lineHeight: 1,
                  color: isWorst ? '#f87171' : isBest ? '#4ade80' : 'var(--text3)',
                }}>{d}</p>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
