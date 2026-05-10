"""
Storage Optimization Model

V_storage = E[P_future] - P_current - C_storage

Where:
  E[P_future]  = expected price after holding n months
  P_current    = best available net price per bushel right now
  C_storage    = physical storage cost + capital (opportunity) cost

Decision rule: if V_storage > 0, holding grain is expected to beat selling now.
"""

from backend.engine.features import FeatureSet
from backend.models import StorageAnalysis
from backend.constants import (
    HEDGE_COMMISSION_PER_BU,
    get_storage_rate,
)


def calc_storage_analysis(
    features: FeatureSet,
    best_net_per_bu: float,     # farmer's best executable net price today
    quantity_bu: float,
    storage_months: int,
    storage_type: str,          # "on_farm" | "commercial"
    farm_state: str = "",
) -> StorageAnalysis:
    """
    Compute V_storage and whether holding grain beats selling now.

    Expected future price uses seasonally-adjusted futures projection.
    Storage cost includes physical rate + capital cost of tied-up cash.
    """
    n_months = storage_months
    n_weeks  = n_months * 4

    # Expected future price = current futures × (1 + monthly_return)^n_months
    # seasonal_4w_return is the 1-month compound return from yfinance seasonal history.
    # Extrapolation reliability degrades beyond 3 months, so we cap the base return.
    monthly_return = features.seasonal_4w_return
    if n_months > 3:
        # Dampen the base rate proportionally past 3 months
        monthly_return = monthly_return * (3.0 / n_months)
    seasonal_compound = (1 + monthly_return) ** n_months - 1

    e_price_future = features.futures_price * (1 + seasonal_compound) + features.basis_regional

    # Physical storage rate — regional lookup, falls back to Midwest benchmark
    phys_rate = get_storage_rate(farm_state, storage_type)
    storage_cost_total = phys_rate * n_months

    # Capital / opportunity cost: interest on cash that could have been received
    annual_rate = features.tbill_rate_pct / 100
    monthly_rate = annual_rate / 12
    opportunity_cost = best_net_per_bu * monthly_rate * n_months

    total_cost_per_bu = storage_cost_total + opportunity_cost

    # V_storage = E[P_future] - P_current - C_storage (per bushel)
    v_storage_per_bu = e_price_future - best_net_per_bu - total_cost_per_bu

    return StorageAnalysis(
        v_storage_per_bu=round(v_storage_per_bu, 4),
        total_storage_value=round(v_storage_per_bu * quantity_bu, 2),
        storage_cost_total=round(total_cost_per_bu * quantity_bu, 2),
        opportunity_cost=round(opportunity_cost * quantity_bu, 2),
        recommend_delay=v_storage_per_bu > 0,
        storage_type=storage_type,
        storage_rate_per_bu_mo=round(phys_rate, 4),
    )


def calc_hedge_ev(
    features: FeatureSet,
    best_net_per_bu: float,
    quantity_bu: float,
    storage_months: int,
    storage_type: str,
    farm_state: str = "",
) -> dict:
    """
    Compute expected value and risk for the Store + Hedge scenario.

    Hedging locks in approximately the current futures price minus expected basis
    at delivery. This eliminates futures price risk but retains basis risk.

    Returns dict with ev_per_bu, cost_per_bu, risk_per_bu, low, high.
    """
    phys_rate = get_storage_rate(farm_state, storage_type)
    storage_cost_per_bu = phys_rate * storage_months

    annual_rate = features.tbill_rate_pct / 100
    opportunity_cost_per_bu = best_net_per_bu * (annual_rate / 12) * storage_months

    commission = HEDGE_COMMISSION_PER_BU

    total_cost_per_bu = storage_cost_per_bu + opportunity_cost_per_bu + commission

    # Locked revenue = futures price + expected basis at delivery
    # Basis tends to converge toward 0 at contract expiry (basis convergence)
    # We model expected delivery basis as 50% of current basis (partial convergence)
    expected_delivery_basis = features.basis_regional * 0.5
    locked_price_per_bu = features.futures_price + expected_delivery_basis

    ev_per_bu = locked_price_per_bu - total_cost_per_bu

    # Basis risk only (futures risk is hedged away)
    basis_risk_per_bu = features.basis_std * 1.5
    low  = (ev_per_bu - basis_risk_per_bu) * quantity_bu
    high = (ev_per_bu + basis_risk_per_bu) * quantity_bu

    return {
        "ev_per_bu": round(ev_per_bu, 4),
        "ev_total": round(ev_per_bu * quantity_bu, 2),
        "cost_total": round(total_cost_per_bu * quantity_bu, 2),
        "risk_per_bu": round(basis_risk_per_bu, 4),
        "low": round(low, 2),
        "high": round(high, 2),
    }
