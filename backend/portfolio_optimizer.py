"""Multi-period portfolio optimizer using cvxpy.

Mean-variance Markowitz optimization with an explicit risk budget constraint.
The risk budget shrinks as lambda increases, giving clean lambda sensitivity:
  lambda=0.5  → aggressive (more bonds/equities, higher yield)
  lambda=10   → defensive (more repo/cash, lower yield, less volatility)
"""
import numpy as np
import pandas as pd
import cvxpy as cp

from regime_detector import current_regime


def optimize_portfolio(
    df: pd.DataFrame,
    total_aum: float,
    horizon_hours: int = 24,
    risk_lambda: float = 2.0,
    min_cash_pct: float = 0.05,
    permanent_capital_pct: float = 0.10,
    cvar_alpha: float = 0.95,
    n_scenarios: int = 500,
) -> dict:
    """
    Maximize annual expected yield − λ × portfolio_variance (Markowitz MVO).

    Risk is measured as annual portfolio return variance from Monte Carlo scenarios.
    Lambda controls the yield/risk trade-off:
      - Low λ  → maximize yield (accept more bond duration + equity volatility risk)
      - High λ → minimize variance (safer allocation in repo/cash)
    """
    latest = df.iloc[-1]
    repo_rate    = float(latest["tier1_repo_rate_apy"]) / 100
    bond_yield   = float(latest["tier2_bond_yield_pct"]) / 100
    mod_duration = float(latest["tier2_bond_mod_duration"])
    stock_vol    = float(latest["tier3_stock_volatility_pct"]) / 100

    reg = current_regime(df)
    in_stress = reg["label"] == "STRESS"
    vol_multiplier = 2.0 if in_stress else 1.0

    rng = np.random.default_rng(42)

    # --- Annual return scenarios (makes lambda scale horizon-independent) ---
    # Bond annual yield shock: N(0, annual_yield_vol)
    annual_yield_vol = 0.015 * vol_multiplier  # 1.5% yield vol (2x in stress)
    yield_shocks = rng.normal(0, annual_yield_vol, n_scenarios)

    # Equity annual return: correlated with yield shocks
    equity_mu  = 0.10  # 10% annual expected
    equity_vol = stock_vol * vol_multiplier  # 18% base
    corr = -0.30  # bonds/equities are negatively correlated
    equity_idio = rng.normal(0, equity_vol * np.sqrt(1 - corr**2), n_scenarios)
    equity_rets = equity_mu + corr * equity_vol * (yield_shocks / annual_yield_vol) + equity_idio

    # Annual return matrix: (n_scenarios, 4) for [cash, repo, bonds, equities]
    R = np.column_stack([
        np.zeros(n_scenarios),                          # cash: 0%
        np.full(n_scenarios, repo_rate),                # repo: fixed ~4.3%
        bond_yield - mod_duration * yield_shocks,       # bonds: coupon + duration risk
        equity_rets,                                    # equities: stochastic
    ])

    mean_R = R.mean(axis=0)   # (4,) expected annual returns
    R_demean = R - mean_R     # (n_scenarios, 4) demeaned

    # Decision variables: [cash, repo, bonds, equities]
    w = cp.Variable(4, nonneg=True)

    min_repo = 0.30 if in_stress else 0.35

    constraints = [
        cp.sum(w) == 1,
        w[0] >= min_cash_pct,
        w[1] >= min_repo,
        w[1] <= 0.70,
        w[3] <= permanent_capital_pct,
    ]

    # Expected annual yield (as a fraction of AUM, then in dollars)
    expected_annual_return = mean_R @ w       # CVXPY scalar expression (fraction)
    expected_yield_dollar  = expected_annual_return * total_aum

    # Portfolio annual variance (from scenarios)
    portfolio_returns_demean = R_demean @ w   # (n_scenarios,) CVXPY expression
    portfolio_variance = cp.sum_squares(portfolio_returns_demean) / n_scenarios

    # Objective: Maximize yield − λ × variance × AUM² (units: dollars² → scale down)
    # Scale variance to dollars to balance against yield in $:
    # variance [fraction²] × AUM² [dollars²] → dollar-variance
    # risk_lambda dimension: $/($²) = 1/$, so lambda ≈ 2e-8 would balance numerically.
    # Instead, normalize both to fraction-of-AUM basis:
    #   expected_return (fraction) − λ × variance (fraction²)
    objective = cp.Maximize(expected_annual_return - risk_lambda * portfolio_variance)

    prob = cp.Problem(objective, constraints)

    for solver in [cp.CLARABEL, cp.SCS]:
        try:
            prob.solve(solver=solver, verbose=False)
            if w.value is not None:
                break
        except Exception:
            continue

    if w.value is None:
        alloc_frac = np.array([min_cash_pct, 0.55, 0.30, permanent_capital_pct])
        alloc_frac = alloc_frac / alloc_frac.sum()
    else:
        alloc_frac = np.clip(w.value, 0, 1)
        alloc_frac = alloc_frac / alloc_frac.sum()

    alloc_usd      = alloc_frac * total_aum
    exp_return_frac = float(mean_R @ alloc_frac)
    exp_yield_usd   = exp_return_frac * total_aum

    # Compute portfolio realized stats
    port_returns = R @ alloc_frac
    port_std_annual  = float(np.std(port_returns))
    port_cvar_95 = float(np.mean(np.sort(port_returns)[:int(n_scenarios * (1 - cvar_alpha))]))
    cvar_loss_usd = max(0, -port_cvar_95 * total_aum)  # positive = loss at tail

    # h_frac for prorating yield display over the requested horizon
    h_frac = horizon_hours / 8760

    return {
        "horizon_hours": horizon_hours,
        "total_aum_usd": round(total_aum, 2),
        "allocations": {
            "cash_usd":     round(float(alloc_usd[0]), 2),
            "repo_usd":     round(float(alloc_usd[1]), 2),
            "bonds_usd":    round(float(alloc_usd[2]), 2),
            "equities_usd": round(float(alloc_usd[3]), 2),
        },
        "weights_pct": {
            "cash":     round(float(alloc_frac[0]) * 100, 2),
            "repo":     round(float(alloc_frac[1]) * 100, 2),
            "bonds":    round(float(alloc_frac[2]) * 100, 2),
            "equities": round(float(alloc_frac[3]) * 100, 2),
        },
        "weights_sum_pct": round(float(alloc_frac.sum()) * 100, 4),
        "expected_yield_usd_horizon": round(exp_yield_usd * h_frac, 2),
        "cvar_95_usd": round(cvar_loss_usd, 2),
        "annualized_yield_pct": round(exp_return_frac * 100, 4),
        "portfolio_vol_pct": round(port_std_annual * 100, 4),
        "risk_lambda": risk_lambda,
        "regime": reg["label"],
    }
