from data_loader import load_data
from regime_detector import fit_regime
from forecaster import train_forecaster
from portfolio_optimizer import optimize_portfolio

df = load_data()
fit_regime(df)
train_forecaster(df)

# Test with longer horizons where yield vs. risk tradeoffs are meaningful
print("Portfolio optimizer - horizon and lambda sensitivity:")
for horizon in [720, 2160, 8760]:
    print(f"\n  Horizon = {horizon}h ({horizon//24} days):")
    for lam in [0.5, 2.0, 5.0, 10.0]:
        r = optimize_portfolio(df, 500_000_000, horizon_hours=horizon, risk_lambda=lam)
        w = r["weights_pct"]
        print(f"    lambda={lam:4.1f}: cash={w['cash']:5.1f}% repo={w['repo']:5.1f}% bonds={w['bonds']:5.1f}% eq={w['equities']:5.1f}% | yield={r['annualized_yield_pct']:.3f}% CVaR={r['cvar_95_usd']/1e6:.1f}M")
