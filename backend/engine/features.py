"""
Feature Engineering Layer — transforms raw API data into model-ready variables.

This sits between the fetchers and the quantitative engines. All downstream
models (fair_price, scenarios, MPI) consume a FeatureSet rather than raw API
responses, keeping each engine's dependencies explicit and testable.
"""

from dataclasses import dataclass
from datetime import date

from backend.fetchers.futures import get_futures_features, get_seasonal_returns
from backend.fetchers.fred import get_diesel_price, get_tbill_rate
from backend.fetchers.weather import get_weather_data
from backend.fetchers.usda import get_basis_estimate
from backend.fetchers.location import get_state_abbr
from backend.constants import FALLBACK_BASIS, BASIS_STD


@dataclass
class FeatureSet:
    # ── Futures ────────────────────────────────────────────────────────────────
    futures_price: float             # $/bu front-month
    futures_ticker: str
    futures_momentum: float          # weekly slope % (positive = uptrend)
    futures_volatility: float        # annualized std of daily log returns

    # ── Seasonal returns (yfinance 5yr history) ────────────────────────────────
    seasonal_1w_return: float        # expected compound return over 1 week
    seasonal_1w_std: float
    seasonal_4w_return: float        # expected compound return over 4 weeks
    seasonal_4w_std: float

    # ── Economic ───────────────────────────────────────────────────────────────
    diesel_per_gal: float
    tbill_rate_pct: float

    # ── Basis ──────────────────────────────────────────────────────────────────
    basis_regional: float            # B_region = regional_cash - futures ($/bu)
    basis_std: float                 # historical basis variability ($/bu)

    # ── Weather ────────────────────────────────────────────────────────────────
    weather_summary: str | None
    weather_risk_level: str          # "low" | "medium" | "high"
    weather_disruption_index: float  # 0.0–1.0 for MPI
    precip_anomaly: float            # rough z-score: -1 drought … +1 flood

    # ── Supply pressure ────────────────────────────────────────────────────────
    # Estimated from basis behavior: widening basis (more negative) = supply glut
    # Encoded on a -1 (tight) to +1 (loose) scale
    inventory_signal: float

    # ── Calendar ───────────────────────────────────────────────────────────────
    current_week: int


def build_features(commodity: str, farm_address: str) -> FeatureSet:
    """
    Fetch all external data and assemble into a FeatureSet.
    Every external call has a fallback; this function never raises.
    """
    current_week = date.today().isocalendar().week

    # Resolve farm state once — used to route regional diesel and USDA basis calls
    state = get_state_abbr(farm_address)

    # Futures: price + momentum + volatility (single yfinance call)
    fut = get_futures_features(commodity)

    # Seasonal windows
    s1_ret, s1_std = get_seasonal_returns(commodity, current_week, 1)
    s4_ret, s4_std = get_seasonal_returns(commodity, current_week, 4)

    # Economic — diesel uses PADD regional price for the farm's state
    diesel = get_diesel_price(state)
    tbill  = get_tbill_rate()

    # Weather
    wx = get_weather_data(farm_address)

    # Regional basis — uses state-specific USDA report when available
    basis = get_basis_estimate(commodity, fut["price"], state)
    b_std = BASIS_STD.get(commodity, 0.18)

    # Inventory signal: inferred from basis deviation from historical norm
    # If current basis is well below historical average → loose supply (bearish)
    historical_basis = FALLBACK_BASIS.get(commodity, -0.30)
    basis_deviation = basis - historical_basis   # positive = tighter than normal
    # Clamp to [-1, +1] with ±$0.30/bu = full signal
    inventory_signal = max(-1.0, min(1.0, basis_deviation / 0.30))

    return FeatureSet(
        futures_price=fut["price"],
        futures_ticker=fut["ticker"],
        futures_momentum=fut["momentum_weekly_pct"],
        futures_volatility=fut["volatility_ann"],
        seasonal_1w_return=s1_ret,
        seasonal_1w_std=s1_std,
        seasonal_4w_return=s4_ret,
        seasonal_4w_std=s4_std,
        diesel_per_gal=diesel,
        tbill_rate_pct=tbill,
        basis_regional=basis,
        basis_std=b_std,
        weather_summary=wx["summary"],
        weather_risk_level=wx["risk_level"],
        weather_disruption_index=wx["disruption_index"],
        precip_anomaly=wx["precip_anomaly"],
        inventory_signal=round(inventory_signal, 3),
        current_week=current_week,
    )
