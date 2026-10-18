"""Simulate the full year with newsvendor strategy vs naive 20% cash strategy."""
import numpy as np
import pandas as pd
from forecaster import train_forecaster, QUANTILES, FEATURES, _models, _conformal_adjustments
import lightgbm as lgb


TOTAL_AUM = 500_000_000  # $500M AUM


def run_backtest(df: pd.DataFrame) -> dict:
    # Ensure models trained
    train_forecaster(df)

    sweep_rows = df[df["hour"] == 17].dropna(subset=["overnight_cum_outflow"]).copy()
    sweep_rows = sweep_rows.reset_index(drop=True)

    results = []

    for _, row in sweep_rows.iterrows():
        actual_outflow = float(row["overnight_cum_outflow"])
        repo_rate = float(row["tier1_repo_rate_apy"]) / 100
        overdraft_rate = float(row["emergency_overdraft_penalty_apr_pct"]) / 100
        repo_haircut = float(row["tier1_early_redemption_haircut_pct"]) / 100

        # --- Newsvendor strategy ---
        c_u = overdraft_rate / 8760
        c_o = repo_rate / 8760
        q_star = c_u / (c_u + c_o) if (c_u + c_o) > 0 else 0.5

        X = row[FEATURES].values.reshape(1, -1)
        qs = np.array(QUANTILES)
        vals = np.array([_models[q].predict(X)[0] + _conformal_adjustments.get(q, 0) for q in QUANTILES])
        b_star = float(np.interp(q_star, qs, vals))
        b_star = max(b_star, 0)
        sweep = max(TOTAL_AUM - b_star, 0)

        # Shortfall: cash left after sweep vs actual outflow
        cash_available = TOTAL_AUM - sweep
        shortfall = max(actual_outflow - cash_available, 0)

        # Cover shortfall by cracking repo first (haircut penalty, no overnight interest)
        crack_repo = min(shortfall, sweep)
        crack_cost = crack_repo * repo_haircut

        # Repo income only on portion that completed the full overnight (not cracked)
        repo_income = (sweep - crack_repo) * repo_rate * (15 / 8760)

        # Overdraft only applies if shortfall exceeds ALL repo capacity
        true_overdraft = max(shortfall - sweep, 0)
        overdraft_cost = true_overdraft * overdraft_rate * (15 / 8760)

        nv_net = repo_income - overdraft_cost - crack_cost

        # --- Naive strategy: always hold 20% cash ---
        # Uses the same tier cascade as newsvendor: crack repo first, overdraft last.
        naive_cash = 0.20 * TOTAL_AUM
        naive_sweep = TOTAL_AUM - naive_cash
        naive_repo_income = naive_sweep * repo_rate * (15 / 8760)
        naive_shortfall = max(actual_outflow - naive_cash, 0)
        naive_crack_repo = min(naive_shortfall, naive_sweep)
        naive_crack = naive_crack_repo * repo_haircut
        naive_true_overdraft = max(naive_shortfall - naive_sweep, 0)
        naive_overdraft_cost = naive_true_overdraft * overdraft_rate * (15 / 8760)
        naive_net = naive_repo_income - naive_overdraft_cost - naive_crack

        results.append({
            "timestamp": str(row["timestamp"]),
            "actual_outflow": actual_outflow,
            "nv_cash_buffer": b_star,
            "nv_sweep": sweep,
            "nv_net_pnl": nv_net,
            "naive_net_pnl": naive_net,
            "nv_overdraft": true_overdraft > 0,
            "naive_overdraft": naive_true_overdraft > 0,
        })

    if not results:
        return {
            "total_days": 0,
            "newsvendor": {"total_pnl_usd": 0, "avg_daily_pnl_usd": 0, "sharpe_ratio": 0.0,
                           "overdraft_events": 0, "overdraft_rate_pct": 0.0,
                           "max_single_loss_usd": 0, "annualized_yield_pct": 0.0},
            "naive": {"total_pnl_usd": 0, "avg_daily_pnl_usd": 0, "sharpe_ratio": 0.0,
                      "overdraft_events": 0, "overdraft_rate_pct": 0.0,
                      "max_single_loss_usd": 0, "annualized_yield_pct": 0.0},
            "advantage_pct": 0.0,
            "daily_pnl": [],
            "penalty_heatmap": [],
        }

    res = pd.DataFrame(results)

    def sharpe(pnl: pd.Series) -> float:
        if pnl.std() == 0:
            return 0.0
        return float((pnl.mean() / pnl.std()) * np.sqrt(365))

    total_days = len(res)

    return {
        "total_days": total_days,
        "newsvendor": {
            "total_pnl_usd": round(float(res["nv_net_pnl"].sum()), 2),
            "avg_daily_pnl_usd": round(float(res["nv_net_pnl"].mean()), 2),
            "sharpe_ratio": round(sharpe(res["nv_net_pnl"]), 4),
            "overdraft_events": int(res["nv_overdraft"].sum()),
            "overdraft_rate_pct": round(res["nv_overdraft"].mean() * 100, 2),
            "max_single_loss_usd": round(float(res["nv_net_pnl"].min()), 2),
            "annualized_yield_pct": round(
                float(res["nv_net_pnl"].sum()) / TOTAL_AUM * (365 / (total_days or 1)) * 100, 4
            ),
        },
        "naive": {
            "total_pnl_usd": round(float(res["naive_net_pnl"].sum()), 2),
            "avg_daily_pnl_usd": round(float(res["naive_net_pnl"].mean()), 2),
            "sharpe_ratio": round(sharpe(res["naive_net_pnl"]), 4),
            "overdraft_events": int(res["naive_overdraft"].sum()),
            "overdraft_rate_pct": round(res["naive_overdraft"].mean() * 100, 2),
            "max_single_loss_usd": round(float(res["naive_net_pnl"].min()), 2),
            "annualized_yield_pct": round(
                float(res["naive_net_pnl"].sum()) / TOTAL_AUM * (365 / (total_days or 1)) * 100, 4
            ),
        },
        "advantage_pct": round(
            (res["nv_net_pnl"].sum() - res["naive_net_pnl"].sum()) / TOTAL_AUM * 100, 4
        ),
        "daily_pnl": [
            {
                "timestamp": r["timestamp"],
                "newsvendor_pnl": round(r["nv_net_pnl"], 2),
                "naive_pnl": round(r["naive_net_pnl"], 2),
            }
            for r in results
        ],
        "penalty_heatmap": _build_heatmap(
            results,
            repo_rate_pct=float(df["tier1_repo_rate_apy"].mean()),
            overdraft_pct=float(df["emergency_overdraft_penalty_apr_pct"].iloc[-1]),
        ),
    }


def _build_heatmap(results: list[dict], repo_rate_pct: float = 4.3, overdraft_pct: float = 12.0) -> list[dict]:
    """Build penalty heat map: cash buffer quantile chosen vs actual outflow bucket.

    b is derived as the q-th percentile of the historical outflow distribution
    (same units as outflow_buckets — dollars of overnight outflow, typically millions).
    Cost = shortfall × c_u  +  excess_cash × c_o  (per overnight period of 15h).
    repo_rate_pct / overdraft_pct are in percent (e.g. 4.3 = 4.3% APY).
    """
    repo_rate = (repo_rate_pct / 100) / 8760 * 15   # 15-hour period
    overdraft_rate = (overdraft_pct / 100) / 8760 * 15
    c_u = overdraft_rate
    c_o = repo_rate

    q_grid = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]
    outflow_vals = np.array([r["actual_outflow"] for r in results])
    if len(outflow_vals) == 0:
        return []
    p10, p90 = np.percentile(outflow_vals, 10), np.percentile(outflow_vals, 90)
    outflow_buckets = np.linspace(p10, p90, 9)

    # b_grid: cash buffer in the SAME dollar units as outflow_buckets
    # Each quantile maps to that percentile of the historical outflow distribution
    b_grid = np.percentile(outflow_vals, [q * 100 for q in q_grid])
    b_grid = np.maximum(b_grid, 0)  # buffer can't be negative

    cells = []
    for q, b in zip(q_grid, b_grid):
        for ob in outflow_buckets:
            shortfall = max(ob - b, 0)   # outflow exceeds buffer
            excess = max(b - ob, 0)      # buffer exceeds outflow (opportunity cost)
            cost = shortfall * c_u + excess * c_o
            cells.append({
                "quantile": round(q, 2),
                "outflow_bucket": round(float(ob), 0),
                "total_cost": round(cost, 2),
            })
    return cells


def simulate_stress(
    df: pd.DataFrame,
    withdrawal_multiplier: float = 3.0,
    shock_start_hour: int = 22,
    shock_duration_hours: int = 6,
    current_cash_usd: float = 50_000_000,
    current_repo_usd: float = 300_000_000,
    current_bonds_usd: float = 100_000_000,
    current_equities_usd: float = 50_000_000,
) -> dict:
    """Forward-simulate a withdrawal shock and show tier cascade."""
    latest = df.iloc[-1]
    avg_hourly_withdrawal = float(df["withdrawals_usd"].tail(24 * 7).mean() or 0.0)
    shock_withdrawal = avg_hourly_withdrawal * withdrawal_multiplier
    total_shock = shock_withdrawal * shock_duration_hours

    repo_haircut = float(latest["tier1_early_redemption_haircut_pct"]) / 100
    bond_haircut = float(latest["tier2_bond_liquidation_haircut_pct"]) / 100
    equity_haircut = float(latest["tier3_stock_liquidation_haircut_pct"]) / 100
    overdraft_rate = float(latest["emergency_overdraft_penalty_apr_pct"]) / 100

    remaining = total_shock
    cascade = []
    total_penalty = 0.0

    # Tier 0: Cash
    cash_used = min(remaining, current_cash_usd)
    remaining -= cash_used
    cascade.append({"tier": "Cash (Tier 0)", "used_usd": round(cash_used, 2), "penalty_usd": 0, "haircut_pct": 0})

    # Tier 1: Repo (crack early)
    if remaining > 0:
        repo_available = current_repo_usd
        repo_used = min(remaining, repo_available)
        penalty = repo_used * repo_haircut
        total_penalty += penalty
        remaining -= repo_used
        cascade.append({"tier": "Repo Crack (Tier 1)", "used_usd": round(repo_used, 2), "penalty_usd": round(penalty, 2), "haircut_pct": repo_haircut * 100})

    # Tier 2: Bond liquidation
    if remaining > 0:
        bond_available = current_bonds_usd * (1 - bond_haircut)
        bond_gross = min(remaining / (1 - bond_haircut), current_bonds_usd)
        penalty = bond_gross * bond_haircut
        total_penalty += penalty
        remaining -= min(remaining, bond_available)
        cascade.append({"tier": "Bond Liquidation (Tier 2)", "used_usd": round(bond_gross, 2), "penalty_usd": round(penalty, 2), "haircut_pct": bond_haircut * 100})

    # Tier 3: Equity fire-sale
    if remaining > 0:
        eq_available = current_equities_usd * (1 - equity_haircut)
        eq_gross = min(remaining / (1 - equity_haircut), current_equities_usd)
        penalty = eq_gross * equity_haircut
        total_penalty += penalty
        remaining -= min(remaining, eq_available)
        cascade.append({"tier": "Equity Fire-Sale (Tier 3)", "used_usd": round(eq_gross, 2), "penalty_usd": round(penalty, 2), "haircut_pct": equity_haircut * 100})

    # Overdraft
    if remaining > 0:
        od_hours = shock_duration_hours
        overdraft_penalty = remaining * overdraft_rate * od_hours / 8760
        total_penalty += overdraft_penalty
        cascade.append({"tier": "Overdraft (Central Bank)", "used_usd": round(remaining, 2), "penalty_usd": round(overdraft_penalty, 2), "haircut_pct": overdraft_rate * 100})
        survived = False
    else:
        survived = True

    return {
        "scenario": {
            "withdrawal_multiplier": withdrawal_multiplier,
            "shock_start_hour": shock_start_hour,
            "shock_duration_hours": shock_duration_hours,
            "total_shock_usd": round(total_shock, 2),
            "avg_hourly_withdrawal_usd": round(avg_hourly_withdrawal, 2),
        },
        "cascade": cascade,
        "total_penalty_usd": round(total_penalty, 2),
        "survived": survived,
        "residual_shortfall_usd": round(max(remaining, 0), 2),
    }
