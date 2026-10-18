from data_loader import load_data
from regime_detector import fit_regime, current_regime
from forecaster import train_forecaster
from sweep_optimizer import optimal_sweep
from portfolio_optimizer import optimize_portfolio
from backtester import run_backtest
import json

df = load_data()
fit_regime(df)
train_forecaster(df)

print("Testing sweep optimizer...")
sw = optimal_sweep(df, 500_000_000)
print("Optimal buffer:", sw["optimal_cash_buffer_usd"])
print("Sweep to repo:", sw["sweep_to_repo_usd"])

print("Testing portfolio optimizer...")
po = optimize_portfolio(df, 500_000_000)
print("Portfolio weights:", po["weights_pct"])
print("CVaR 95:", po["cvar_95_usd"])

print("Running backtest (may take ~10s)...")
results = run_backtest(df)
print("Total days:", results["total_days"])
print("Newsvendor total PnL:", results["newsvendor"]["total_pnl_usd"])
print("Naive total PnL:", results["naive"]["total_pnl_usd"])
print("Advantage:", results["advantage_pct"], "%")
print("NV overdraft events:", results["newsvendor"]["overdraft_events"])
print("Naive overdraft events:", results["naive"]["overdraft_events"])
print("NV annualized yield:", results["newsvendor"]["annualized_yield_pct"], "%")
