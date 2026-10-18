from data_loader import load_data
from regime_detector import fit_regime
from forecaster import train_forecaster
from portfolio_optimizer import optimize_portfolio

df = load_data()
fit_regime(df)
train_forecaster(df)

print("Testing portfolio optimizer response to lambda...")
for lam in [0.5, 2.0, 5.0, 10.0]:
    r = optimize_portfolio(df, 500_000_000, horizon_hours=24, risk_lambda=lam)
    w = r["weights_pct"]
    print(f"  lambda={lam:.1f}: cash={w['cash']:.1f}% repo={w['repo']:.1f}% bonds={w['bonds']:.1f}% eq={w['equities']:.1f}% | yield={r['annualized_yield_pct']:.3f}% | CVaR={r['cvar_95_usd']/1e3:,.0f}K")
