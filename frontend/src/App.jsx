import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Forecast from './pages/Forecast'
import Optimizer from './pages/Optimizer'
import Sleeves from './pages/Sleeves'
import Regime from './pages/Regime'
import Metrics from './pages/Metrics'
import Heatmap from './pages/Heatmap'

const navItems = [
  { to: '/', label: 'Dashboard', icon: '⬡' },
  { to: '/forecast', label: 'Forecast', icon: '◈' },
  { to: '/optimizer', label: 'Optimizer', icon: '◎' },
  { to: '/sleeves', label: 'Sleeves', icon: '◧' },
  { to: '/regime', label: 'Regime & Stress', icon: '⬟' },
  { to: '/metrics', label: 'Metrics', icon: '◑' },
  { to: '/insights', label: 'Insights', icon: '◫' },
]

export default function App() {
  return (
    <BrowserRouter>
      {/* ─── Cobalt-style ambient background ─── */}
      <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
        {/* Top radial forest-green glow — reference app signature emerald */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          width: '100%',
          height: '70%',
          background: 'radial-gradient(ellipse 65% 45% at 50% -5%, rgba(16,185,129,0.16) 0%, rgba(5,150,105,0.05) 55%, transparent 75%)',
        }} />
        {/* Subtle forest dot texture */}
        <div style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'radial-gradient(rgba(16,185,129,0.07) 1px, transparent 1px)',
          backgroundSize: '30px 30px',
          maskImage: 'radial-gradient(ellipse 85% 55% at 50% 0%, black 25%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(ellipse 85% 55% at 50% 0%, black 25%, transparent 75%)',
        }} />
        {/* Horizontal luminescent emerald line at top */}
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0,
          height: '1px',
          background: 'linear-gradient(90deg, transparent, rgba(16,185,129,0.55) 50%, transparent)',
        }} />
      </div>

      <div className="min-h-screen flex flex-col" style={{ position: 'relative', zIndex: 1 }}>
        {/* ─── Nav bar — Cobalt top-bar style ─── */}
        <nav style={{
          background: 'rgba(9,9,11,0.80)',
          borderBottom: '1px solid rgba(16,185,129,0.10)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          position: 'sticky',
          top: 0,
          zIndex: 50,
        }} className="px-8 py-0 flex items-center gap-0.5">
          {/* Logo */}
          <div className="flex items-center gap-3 mr-10 py-3.5">
            <div style={{
              width: 32,
              height: 32,
              borderRadius: 9999,
              background: 'linear-gradient(135deg, #059669, #10b981)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 0 1px rgba(16,185,129,0.40), 0 0 16px rgba(16,185,129,0.22)',
              fontSize: 11,
              fontWeight: 900,
              color: 'white',
              letterSpacing: '-0.03em',
            }}>RJ</div>
            <div>
              <p style={{ color: '#fafafa', fontWeight: 700, fontSize: '0.9rem', lineHeight: 1.1, letterSpacing: '-0.025em' }}>
                Reserve Juggler
              </p>
              <p style={{ color: '#52525b', fontSize: '0.60rem', fontWeight: 500, letterSpacing: '0.07em', textTransform: 'uppercase' }}>
                $500M AUM · Treasury
              </p>
            </div>
          </div>

          {navItems.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `px-4 py-3.5 text-sm font-medium transition-all border-b-2 ${
                  isActive ? 'border-emerald-500' : 'border-transparent'
                }`
              }
              style={({ isActive }) => ({
                color: isActive ? '#10b981' : '#71717a',
                letterSpacing: '-0.01em',
              })}
            >
              {label}
            </NavLink>
          ))}

        </nav>

        {/* ─── Page content ─── */}
        <main className="flex-1 p-8 max-w-7xl mx-auto w-full">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/forecast" element={<Forecast />} />
            <Route path="/optimizer" element={<Optimizer />} />
            <Route path="/sleeves" element={<Sleeves />} />
            <Route path="/regime" element={<Regime />} />
            <Route path="/metrics" element={<Metrics />} />
            <Route path="/insights" element={<Heatmap />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
