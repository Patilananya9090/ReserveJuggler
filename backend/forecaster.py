"""Quantile LightGBM forecaster with conformal calibration for overnight outflow."""
import numpy as np
import pandas as pd
import lightgbm as lgb
from sklearn.model_selection import train_test_split

QUANTILES = [0.05, 0.10, 0.25, 0.50, 0.75, 0.90, 0.95]

FEATURES = [
    "hour", "day_of_week", "day_of_month", "month",
    "is_payday", "is_weekend",
    "rolling_std_24h", "rolling_mean_7d",
    "net_flow_lag1", "net_flow_lag2", "net_flow_lag3",
    "tier1_repo_rate_apy", "tier2_bond_yield_pct",
    "tier3_stock_volatility_pct",
]

_models: dict[float, lgb.Booster] = {}
_conformal_adjustments: dict[float, float] = {}


def _lgb_params(alpha: float) -> dict:
    return {
        "objective": "quantile",
        "alpha": alpha,
        "metric": "quantile",
        "n_estimators": 300,
        "learning_rate": 0.05,
        "num_leaves": 31,
        "min_child_samples": 20,
        "verbosity": -1,
    }


def train_forecaster(df: pd.DataFrame):
    global _models, _conformal_adjustments

    # Only rows at 17:00 with a valid overnight label
    sweep_rows = df[df["hour"] == 17].dropna(subset=["overnight_cum_outflow"]).copy()
    X = sweep_rows[FEATURES].values
    y = sweep_rows["overnight_cum_outflow"].values

    n = len(X)
    train_end = int(n * 0.80)
    cal_end = int(n * 0.90)

    X_train, y_train = X[:train_end], y[:train_end]
    X_cal, y_cal = X[train_end:cal_end], y[train_end:cal_end]

    for q in QUANTILES:
        params = _lgb_params(q)
        model = lgb.LGBMRegressor(**params)
        model.fit(X_train, y_train)
        _models[q] = model

        # Conformal calibration: compute signed residuals on cal set
        preds_cal = model.predict(X_cal)
        residuals = y_cal - preds_cal  # positive = under-prediction
        # Adjustment: widen interval to achieve nominal coverage
        _conformal_adjustments[q] = float(np.percentile(residuals, q * 100))


def predict_at_hour(df: pd.DataFrame, hour_idx: int, regime_adj: float = 0.0) -> dict:
    """Predict overnight outflow distribution from a given row index."""
    if not _models:
        train_forecaster(df)

    row = df.iloc[hour_idx][FEATURES].values.reshape(1, -1)
    result = {}
    for q in QUANTILES:
        raw = float(_models[q].predict(row)[0])
        calibrated = raw + _conformal_adjustments.get(q, 0)
        result[f"q{int(q*100):02d}"] = round(calibrated, 2)

    # In stress regime, shift all quantiles up by regime_adj fraction of IQR
    if regime_adj > 0:
        iqr = result["q75"] - result["q25"]
        shift = regime_adj * iqr
        result = {k: round(v + shift, 2) for k, v in result.items()}

    result["timestamp"] = str(df["timestamp"].iloc[hour_idx])
    return result


def get_latest_forecast(df: pd.DataFrame, regime_adj: float = 0.0) -> dict:
    # Use the most recent 17:00 row
    sweep_rows = df[df["hour"] == 17]
    if sweep_rows.empty:
        return {}
    idx = sweep_rows.index[-1]
    return predict_at_hour(df, idx, regime_adj)


def conformal_coverage(df: pd.DataFrame) -> dict:
    """Empirical coverage of quantile bands on the test set."""
    if not _models:
        train_forecaster(df)
    sweep_rows = df[df["hour"] == 17].dropna(subset=["overnight_cum_outflow"])
    n = len(sweep_rows)
    test_start = int(n * 0.90)
    X_test = sweep_rows[FEATURES].values[test_start:]
    y_test = sweep_rows["overnight_cum_outflow"].values[test_start:]
    coverage = {}
    for q in QUANTILES:
        preds = _models[q].predict(X_test) + _conformal_adjustments.get(q, 0)
        empirical = float(np.mean(y_test <= preds))
        coverage[f"q{int(q*100):02d}"] = {
            "nominal": q,
            "empirical": round(empirical, 4),
            "drift": round(empirical - q, 4),
        }
    return coverage
