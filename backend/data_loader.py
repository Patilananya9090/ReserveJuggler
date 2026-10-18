"""Load and feature-engineer the treasury dataset."""
import os
import pandas as pd
import numpy as np

_DEFAULT_DATA_PATH = os.path.join(
    os.path.dirname(__file__), "data", "treasury_4tier_dataset.csv"
)
DATA_PATH = os.environ.get("TREASURY_CSV", os.path.normpath(_DEFAULT_DATA_PATH))

_df: pd.DataFrame | None = None


def load_data() -> pd.DataFrame:
    global _df
    if _df is not None:
        return _df

    df = pd.read_csv(DATA_PATH, parse_dates=["timestamp"])
    df = df.sort_values("timestamp").reset_index(drop=True)

    df["hour"] = df["timestamp"].dt.hour
    df["day_of_week"] = df["timestamp"].dt.dayofweek  # 0=Mon
    df["day_of_month"] = df["timestamp"].dt.day
    df["month"] = df["timestamp"].dt.month
    df["is_payday"] = df["day_of_month"].isin([1, 15]).astype(int)
    df["is_weekend"] = (df["day_of_week"] >= 5).astype(int)

    df["rolling_std_24h"] = (
        df["net_flow_usd"].rolling(24, min_periods=1).std().fillna(0)
    )
    df["rolling_mean_7d"] = (
        df["net_flow_usd"].rolling(24 * 7, min_periods=1).mean().fillna(0)
    )
    df["net_flow_lag1"] = df["net_flow_usd"].shift(1).fillna(0)
    df["net_flow_lag2"] = df["net_flow_usd"].shift(2).fillna(0)
    df["net_flow_lag3"] = df["net_flow_usd"].shift(3).fillna(0)

    # Cumulative overnight outflow: from 17:00 to 08:00 next day (15 hrs)
    # Label each 17:00 row with the sum of net flows 17→08
    overnights = []
    n_rows = len(df)
    for idx, row in df[df["hour"] == 17].iterrows():
        # Need exactly 15 rows (17:00–07:00 inclusive); skip if near end of dataset
        if idx + 15 > n_rows:
            continue
        window = df.iloc[idx : idx + 15]["net_flow_usd"]
        outflow = -window.sum()  # positive = more withdrawals than deposits
        overnights.append((idx, outflow))

    df["overnight_cum_outflow"] = np.nan
    for idx, val in overnights:
        df.at[idx, "overnight_cum_outflow"] = val

    _df = df
    return df
