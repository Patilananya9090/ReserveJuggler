from data_loader import load_data
from regime_detector import fit_regime, current_regime
from forecaster import train_forecaster, get_latest_forecast
from sweep_optimizer import optimal_sweep
from portfolio_optimizer import optimize_portfolio
from bond_sleeve import bond_sleeve_recommendation
from equity_sleeve import equity_sleeve_status
from backtester import run_backtest

print("All imports OK")
df = load_data()
print("Rows:", len(df))
print("NaN in overnight_cum_outflow:", df["overnight_cum_outflow"].isna().sum())
