"""2-state Gaussian Mixture regime detector + CUSUM change-point on net_flow variance.

Note: tier3_stock_volatility_pct is constant (18%) throughout the dataset and carries
zero variance, so it is excluded from GMM features.  Regime is determined solely from
net_flow_usd.  Stress = the GMM component with higher net_flow variance (more volatile
cash-flow behaviour).
"""
import numpy as np
import pandas as pd
from sklearn.mixture import GaussianMixture
from sklearn.preprocessing import StandardScaler


_gmm: GaussianMixture | None = None
_scaler: StandardScaler | None = None
_regime_labels: np.ndarray | None = None


def fit_regime(df: pd.DataFrame):
    global _gmm, _scaler, _regime_labels

    # Use only net_flow_usd; vol is constant so adds no signal.
    X = df[["net_flow_usd"]].values.astype(float)
    scaler = StandardScaler()
    Xs = scaler.fit_transform(X)

    model = GaussianMixture(n_components=2, covariance_type="full", random_state=42, n_init=3)
    model.fit(Xs)
    labels = model.predict(Xs)

    # Stress = component with higher net_flow variance (more volatile cash flows).
    # covariances_ shape: (n_components, 1, 1) for 1-D features.
    var_by_state = [float(model.covariances_[s, 0, 0]) for s in range(2)]
    if var_by_state[0] > var_by_state[1]:
        # Component 0 is already the high-variance (stress) one; relabel so stress = 1.
        labels = 1 - labels

    _gmm = model
    _scaler = scaler
    _regime_labels = labels
    return labels


def get_regime_series(df: pd.DataFrame) -> pd.Series:
    if _regime_labels is None:
        fit_regime(df)
    return pd.Series(_regime_labels, index=df.index, name="regime")


def current_regime(df: pd.DataFrame) -> dict:
    if _regime_labels is None:
        fit_regime(df)

    labels = _regime_labels

    # Posterior probability of stress (component 1 = high variance = stress).
    Xs = _scaler.transform(
        df[["net_flow_usd"]].values[-1:].astype(float)
    )
    probs = _gmm.predict_proba(Xs)[0]

    # Stress component = higher net_flow variance component (always index 1 after fit_regime).
    var_by_state = [float(_gmm.covariances_[s, 0, 0]) for s in range(2)]
    stress_component = int(np.argmax(var_by_state))
    stress_prob = float(probs[stress_component])

    # CUSUM secondary signal: rolling variance spike on net_flow.
    roll_var = df["net_flow_usd"].rolling(24).var().fillna(0)
    cusum_signal = int(roll_var.iloc[-1] > roll_var.quantile(0.85))

    is_stress = stress_prob >= 0.5
    target_state = 1 if is_stress else 0

    # Count consecutive hours in the current state.
    hours_in_state = 0
    for lbl in reversed(labels):
        if int(lbl) == target_state:
            hours_in_state += 1
        else:
            break

    return {
        "state": int(is_stress),
        "label": "STRESS" if is_stress else "NORMAL",
        "stress_probability": round(stress_prob, 4),
        "cusum_alert": bool(cusum_signal),
        "hours_in_current_state": hours_in_state,
        "quantile_adjustment": 0.10 if is_stress else 0.0,
    }


def regime_history(df: pd.DataFrame) -> list[dict]:
    if _regime_labels is None:
        fit_regime(df)
    labels = _regime_labels
    return [
        {
            "timestamp": str(df["timestamp"].iloc[i]),
            "regime": int(labels[i]),
            "net_flow": float(df["net_flow_usd"].iloc[i]),
        }
        for i in range(0, len(df), 6)
    ]
