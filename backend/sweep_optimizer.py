"""Newsvendor-style optimal repo sweep rule (closed-form)."""
import numpy as np
import pandas as pd
from forecaster import get_latest_forecast, train_forecaster, QUANTILES


def optimal_sweep(
    df: pd.DataFrame,
    total_aum: float,
    regime_adj: float = 0.0,
) -> dict:
    """
    Newsvendor rule:
      q* = c_u / (c_u + c_o)
      B* = F^{-1}(q*)
      Sweep = AUM - B*

    c_u = overdraft cost per dollar per period (emergency overdraft APR / 8760)
    c_o = opportunity cost per dollar per period (repo APR / 8760)
    """
    latest = df.iloc[-1]
    overdraft_apr = float(latest["emergency_overdraft_penalty_apr_pct"]) / 100
    repo_apr = float(latest["tier1_repo_rate_apy"]) / 100

    c_u = overdraft_apr / 8760
    c_o = repo_apr / 8760
    q_star = c_u / (c_u + c_o) if (c_u + c_o) > 0 else 0.5

    # Adjust q* upward in stress regime
    q_star_adj = min(q_star + regime_adj, 0.99)

    # Get forecast quantile distribution
    forecast = get_latest_forecast(df, regime_adj)

    # Interpolate B* from the forecast quantile ladder
    qs = np.array([q for q in QUANTILES])
    if not forecast or not all(f"q{int(q*100):02d}" in forecast for q in QUANTILES):
        b_star = 0.05 * total_aum
        sweep_amount = max(total_aum - b_star, 0)
        return {
            "c_u_per_hour": round(c_u, 8), "c_o_per_hour": round(c_o, 8),
            "optimal_quantile": round(q_star, 4), "optimal_quantile_adjusted": round(q_star_adj, 4),
            "optimal_cash_buffer_usd": round(b_star, 2), "sweep_to_repo_usd": round(sweep_amount, 2),
            "total_aum_usd": round(total_aum, 2),
            "repo_rate_apy_pct": float(latest["tier1_repo_rate_apy"]),
            "overdraft_penalty_apr_pct": float(latest["emergency_overdraft_penalty_apr_pct"]),
            "forecast_quantiles": {},
        }
    vals = np.array([forecast[f"q{int(q*100):02d}"] for q in QUANTILES])
    b_star = float(np.interp(q_star_adj, qs, vals))
    b_star = max(b_star, 0)  # can't have negative cash buffer

    sweep_amount = max(total_aum - b_star, 0)

    return {
        "c_u_per_hour": round(c_u, 8),
        "c_o_per_hour": round(c_o, 8),
        "optimal_quantile": round(q_star, 4),
        "optimal_quantile_adjusted": round(q_star_adj, 4),
        "optimal_cash_buffer_usd": round(b_star, 2),
        "sweep_to_repo_usd": round(sweep_amount, 2),
        "total_aum_usd": round(total_aum, 2),
        "repo_rate_apy_pct": float(latest["tier1_repo_rate_apy"]),
        "overdraft_penalty_apr_pct": float(latest["emergency_overdraft_penalty_apr_pct"]),
        "forecast_quantiles": forecast,
    }
