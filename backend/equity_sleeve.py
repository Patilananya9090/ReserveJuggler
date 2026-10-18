"""Drawdown-triggered equity de-risking sleeve."""
import numpy as np
import pandas as pd


def equity_sleeve_status(
    df: pd.DataFrame,
    equity_notional_usd: float,
    permanent_capital_pct: float = 0.10,
    total_aum: float = 500_000_000,
    drawdown_threshold_pct: float = 10.0,
) -> dict:
    prices = df["tier3_stock_index_price"].values
    current_price = float(prices[-1])
    # Use 90-day rolling peak (2160 hours) — all-time peak causes permanently huge drawdown
    lookback = min(len(prices), 2160)
    peak_price = float(np.max(prices[-lookback:]))
    trough_price = float(np.min(prices[-lookback:]))

    drawdown_from_peak_pct = (current_price - peak_price) / peak_price * 100
    de_risk_triggered = drawdown_from_peak_pct <= -drawdown_threshold_pct

    permanent_capital_usd = permanent_capital_pct * total_aum
    max_equity_usd = permanent_capital_usd
    recommended_equity_usd = equity_notional_usd * 0.50 if de_risk_triggered else equity_notional_usd

    # Ensure within permanent capital cap
    recommended_equity_usd = min(recommended_equity_usd, max_equity_usd)

    vol = float(df["tier3_stock_volatility_pct"].iloc[-1]) / 100
    repo_rate = float(df["tier1_repo_rate_apy"].iloc[-1]) / 100
    expected_return_annual = 0.10
    sharpe = (expected_return_annual - repo_rate) / vol if vol > 0 else 0  # excess over repo

    # Rolling 30-day equity return
    if len(prices) >= 720:
        ret_30d = (current_price / prices[-720] - 1) * 100
    else:
        ret_30d = 0.0

    return {
        "current_stock_price": round(current_price, 2),
        "peak_stock_price": round(peak_price, 2),
        "trough_stock_price": round(trough_price, 2),
        "drawdown_from_peak_pct": round(drawdown_from_peak_pct, 4),
        "de_risk_threshold_pct": -drawdown_threshold_pct,
        "de_risk_triggered": de_risk_triggered,
        "current_equity_notional_usd": round(equity_notional_usd, 2),
        "recommended_equity_usd": round(recommended_equity_usd, 2),
        "permanent_capital_cap_usd": round(max_equity_usd, 2),
        "annualized_volatility_pct": round(vol * 100, 2),
        "estimated_sharpe": round(sharpe, 4),
        "return_30d_pct": round(float(ret_30d), 4),
        "action": "DE-RISK: reduce equity 50%" if de_risk_triggered else "HOLD: within drawdown tolerance",
    }
