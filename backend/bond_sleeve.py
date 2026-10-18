"""Duration-aware bond maturity ladder."""
import numpy as np
import pandas as pd


BUCKETS = [
    {"label": "0-6m", "weight": 0.40, "duration_years": 0.25},
    {"label": "6-12m", "weight": 0.35, "duration_years": 0.75},
    {"label": "12-24m", "weight": 0.25, "duration_years": 1.50},
]


def bond_sleeve_recommendation(
    df: pd.DataFrame,
    bond_notional_usd: float,
    rate_shock_bp: float = 100.0,
    vol_sigma_bp: float = 50.0,
) -> dict:
    latest = df.iloc[-1]
    bond_yield = float(latest["tier2_bond_yield_pct"]) / 100
    mod_duration = float(latest["tier2_bond_mod_duration"])
    bond_price_idx = float(latest["tier2_bond_price_index"])

    # dP ≈ -D_mod * dy
    dy_shock = rate_shock_bp / 10000
    price_impact_pct = -mod_duration * dy_shock * 100  # in %

    # Carry vs rate-shock: carry = yield * duration (yield pickup per unit duration)
    carry_annual = bond_yield  # simplified: annual coupon carry
    rate_shock_loss = abs(price_impact_pct / 100)  # as fraction
    carry_beats_shock = carry_annual > rate_shock_loss

    # Per-bucket sizing
    ladders = []
    for b in BUCKETS:
        notional = bond_notional_usd * b["weight"]
        d_mod_bucket = b["duration_years"]  # simplified

        # Cap: ensure 100bp shock < 1% NAV loss per bucket (apply before computing metrics)
        denom = abs(d_mod_bucket * dy_shock)
        max_notional_for_1pct = 0.01 * bond_notional_usd / denom if denom > 0 else float("inf")
        if notional > max_notional_for_1pct:
            notional = max_notional_for_1pct

        # All metrics computed on the (possibly capped) notional
        dv01 = notional * d_mod_bucket / 10000  # DV01 per bp
        price_change_100bp = -d_mod_bucket * (rate_shock_bp / 10000) * notional
        carry_annual_usd = bond_yield * notional

        ladders.append({
            "bucket": b["label"],
            "notional_usd": round(notional, 2),
            "weight_pct": round(b["weight"] * 100, 1),
            "mod_duration_years": d_mod_bucket,
            "dv01_usd": round(dv01, 2),
            "price_change_100bp_usd": round(price_change_100bp, 2),
            "carry_annual_usd": round(carry_annual_usd, 2),
        })

    return {
        "total_bond_notional_usd": round(bond_notional_usd, 2),
        "current_yield_pct": round(bond_yield * 100, 4),
        "mod_duration": mod_duration,
        "bond_price_index": bond_price_idx,
        "dv01_total_usd": round(sum(b["dv01_usd"] for b in ladders), 2),
        "price_impact_100bp_pct": round(price_impact_pct, 4),
        "carry_annual_usd": round(bond_yield * bond_notional_usd, 2),
        "carry_beats_rate_shock": carry_beats_shock,
        "carry_annual_pct": round(carry_annual * 100, 4),
        "rate_shock_loss_pct": round(rate_shock_loss * 100, 4),
        "ladder": ladders,
    }
