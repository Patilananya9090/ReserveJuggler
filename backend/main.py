"""FastAPI entry point — Reserve Juggler backend."""
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from contextlib import asynccontextmanager
import os
import pandas as pd

from data_loader import load_data
from regime_detector import fit_regime, current_regime, regime_history
from forecaster import train_forecaster, get_latest_forecast, conformal_coverage
from sweep_optimizer import optimal_sweep
from portfolio_optimizer import optimize_portfolio
from bond_sleeve import bond_sleeve_recommendation
from equity_sleeve import equity_sleeve_status
from backtester import run_backtest, simulate_stress

TOTAL_AUM = 500_000_000

_df: pd.DataFrame = None
_metrics_cache: dict = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _df, _metrics_cache
    print("Loading data and training models…")
    _df = load_data()
    fit_regime(_df)
    train_forecaster(_df)
    print("Running backtest (this may take ~30s)…")
    _metrics_cache = run_backtest(_df)
    print("Ready.")
    yield


app = FastAPI(title="Reserve Juggler", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.isdir(_static_dir):
    app.mount("/assets", StaticFiles(directory=os.path.join(_static_dir, "assets")), name="assets")

@app.get("/")
def root():
    return FileResponse(os.path.join(_static_dir, "index.html"))

@app.get("/{full_path:path}")
def spa_fallback(full_path: str):
    if full_path.startswith("api"):
        return {"detail": "Not found"}
    return FileResponse(os.path.join(_static_dir, "index.html"))


@app.get("/api/summary")
def summary():
    reg = current_regime(_df)
    latest = _df.iloc[-1]

    # Live MVO weights — keep same risk_lambda as /api/portfolio default
    opt = optimize_portfolio(_df, TOTAL_AUM, horizon_hours=720, risk_lambda=2.0)
    w = opt["weights_pct"]
    cash_pct  = w["cash"]   / 100
    repo_pct  = w["repo"]   / 100
    bond_pct  = w["bonds"]  / 100
    eq_pct    = w["equities"] / 100

    return {
        "total_aum_usd": TOTAL_AUM,
        "timestamp": str(latest["timestamp"]),
        "regime": reg,
        "tier_allocation": {
            "cash_usd": round(cash_pct * TOTAL_AUM, 2),
            "repo_usd": round(repo_pct * TOTAL_AUM, 2),
            "bonds_usd": round(bond_pct * TOTAL_AUM, 2),
            "equities_usd": round(eq_pct * TOTAL_AUM, 2),
            "cash_pct": round(cash_pct * 100, 2),
            "repo_pct": round(repo_pct * 100, 2),
            "bonds_pct": round(bond_pct * 100, 2),
            "equities_pct": round(eq_pct * 100, 2),
        },
        "market": {
            "repo_rate_apy_pct": float(latest["tier1_repo_rate_apy"]),
            "bond_yield_pct": float(latest["tier2_bond_yield_pct"]),
            "bond_price_index": float(latest["tier2_bond_price_index"]),
            "stock_price": float(latest["tier3_stock_index_price"]),
            "stock_vol_pct": float(latest["tier3_stock_volatility_pct"]),
        },
        "yield_drag": {
            "excess_cash_usd": round(cash_pct * TOTAL_AUM - 0.05 * TOTAL_AUM, 2),
            "hourly_cost_usd": round(
                (cash_pct * TOTAL_AUM - 0.05 * TOTAL_AUM)
                * (float(latest["tier1_repo_rate_apy"]) / 100 / 8760), 2
            ),
            "daily_cost_usd": round(
                (cash_pct * TOTAL_AUM - 0.05 * TOTAL_AUM)
                * (float(latest["tier1_repo_rate_apy"]) / 100 / 365), 2
            ),
        },
    }


@app.get("/api/forecast")
def forecast(hour_idx: int = Query(default=-1)):
    from forecaster import predict_at_hour
    reg = current_regime(_df)
    regime_adj = reg["quantile_adjustment"]
    if hour_idx < 0 or hour_idx >= len(_df):
        return get_latest_forecast(_df, regime_adj)
    return predict_at_hour(_df, hour_idx, regime_adj)


@app.get("/api/sweep")
def sweep():
    reg = current_regime(_df)
    regime_adj = reg["quantile_adjustment"]
    return optimal_sweep(_df, TOTAL_AUM, regime_adj)


@app.get("/api/portfolio")
def portfolio(horizon: int = Query(default=24), risk_lambda: float = Query(default=2.0)):
    return optimize_portfolio(_df, TOTAL_AUM, horizon_hours=horizon, risk_lambda=risk_lambda)


@app.get("/api/bond-sleeve")
def bonds(bond_notional: float = Query(default=None)):
    if bond_notional is None:
        opt = optimize_portfolio(_df, TOTAL_AUM, horizon_hours=720, risk_lambda=2.0)
        bond_notional = opt["weights_pct"]["bonds"] / 100 * TOTAL_AUM
    return bond_sleeve_recommendation(_df, bond_notional)


@app.get("/api/equity-sleeve")
def equities(equity_notional: float = Query(default=None)):
    if equity_notional is None:
        opt = optimize_portfolio(_df, TOTAL_AUM, horizon_hours=720, risk_lambda=2.0)
        equity_notional = opt["weights_pct"]["equities"] / 100 * TOTAL_AUM
    return equity_sleeve_status(_df, equity_notional, total_aum=TOTAL_AUM)


@app.get("/api/regime")
def regime():
    return {
        "current": current_regime(_df),
        "history": regime_history(_df),
    }


@app.get("/api/timeseries")
def timeseries(limit: int = Query(default=720)):
    df_tail = _df.tail(limit)
    return {
        "data": df_tail[[
            "timestamp", "deposits_usd", "withdrawals_usd", "net_flow_usd",
            "tier1_repo_rate_apy", "tier2_bond_yield_pct", "tier2_bond_price_index",
            "tier3_stock_index_price", "tier3_stock_volatility_pct",
        ]].assign(timestamp=df_tail["timestamp"].astype(str)).to_dict(orient="records")
    }


@app.get("/api/coverage")
def coverage():
    return conformal_coverage(_df)


@app.get("/api/metrics")
def metrics():
    return _metrics_cache


@app.get("/api/flow-patterns")
def flow_patterns():
    """24×7 mean net-flow heatmap grouped by (hour, day_of_week)."""
    grp = (
        _df.groupby(["hour", "day_of_week"])["net_flow_usd"]
        .agg(mean="mean", std="std")
        .fillna(0)
        .reset_index()
    )
    all_means = grp["mean"].values
    return {
        "heatmap": [
            {
                "hour": int(r["hour"]),
                "day": int(r["day_of_week"]),
                "mean_flow": round(float(r["mean"]), 0),
                "std_flow": round(float(r["std"]), 0),
            }
            for _, r in grp.iterrows()
        ],
        "min_flow": round(float(all_means.min()), 0),
        "max_flow": round(float(all_means.max()), 0),
    }


@app.post("/api/simulate")
def simulate(
    withdrawal_multiplier: float = Query(default=3.0),
    shock_start_hour: int = Query(default=22),
    shock_duration_hours: int = Query(default=6),
    current_cash_usd: float = Query(default=50_000_000),
    current_repo_usd: float = Query(default=300_000_000),
    current_bonds_usd: float = Query(default=100_000_000),
    current_equities_usd: float = Query(default=50_000_000),
):
    return simulate_stress(
        _df,
        withdrawal_multiplier=withdrawal_multiplier,
        shock_start_hour=shock_start_hour,
        shock_duration_hours=shock_duration_hours,
        current_cash_usd=current_cash_usd,
        current_repo_usd=current_repo_usd,
        current_bonds_usd=current_bonds_usd,
        current_equities_usd=current_equities_usd,
    )
