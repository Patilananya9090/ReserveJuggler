from data_loader import load_data
from regime_detector import fit_regime
from forecaster import train_forecaster
from portfolio_optimizer import optimize_portfolio

df = load_data()
fit_regime(df)
train_forecaster(df)

print("Portfolio optimizer - lambda sensitivity test:")
for lam in [0.5, 1.0, 2.0, 5.0, 10.0]:
    r = optimize_portfolio(df, 500_000_000, horizon_hours=24, risk_lambda=lam)
    w = r["weights_pct"]
    print(f"  lambda={lam:4.1f}: cash={w['cash']:5.1f}% repo={w['repo']:5.1f}% bonds={w['bonds']:5.1f}% eq={w['equities']:5.1f}% | yield={r['annualized_yield_pct']:.3f}% CVaR95={r['cvar_95_usd']/1e6:.2f}M")
