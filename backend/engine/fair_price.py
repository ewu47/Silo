"""
Fair Price Model

P_fair = P_futures + B_region + A_season + W_weather - C_transport_ref

Where:
  P_futures       = front-month commodity futures benchmark ($/bu)
  B_region        = regional basis adjustment = P_cash_regional - P_futures
  A_season        = seasonal timing adjustment (based on 4-week forward seasonal return)
  W_weather       = weather-induced supply shock premium/discount
  C_transport_ref = transport cost to the farmer's closest buyer (actual distance)

Mispricing:
  M = (P_fair - P_local) / P_fair
  ΔR = (P_fair - P_local) × Q

Positive M → farmer is being underpaid relative to market fair value.
"""

from backend.engine.features import FeatureSet
from backend.engine.transport import transport_cost_per_bu_mile
from backend.models import FairPriceAnalysis, PriceDrivers


def calc_fair_price(
    features: FeatureSet,
    quantity_bu: float,
    best_local_bid: float,          # farmer's best available cash bid $/bu
    closest_buyer_distance_miles: float,  # distance to nearest buyer ($/bu baseline)
) -> FairPriceAnalysis:
    """
    Compute the fair price range and decompose the gap between fair value and
    the farmer's best available bid into contributing factors.
    """
    pf = features.futures_price

    # ── Components ─────────────────────────────────────────────────────────────

    # Seasonal adjustment: 4-week expected return scaled to $/bu
    a_season = pf * features.seasonal_4w_return

    # Weather supply shock: any disruption (drought or flood) reduces supply → bullish
    # Scale: 0.0 disruption = no effect; 1.0 disruption = +$0.30/bu premium
    w_weather = features.weather_disruption_index * 0.30

    # Reference transport cost: actual rate to farmer's closest buyer
    rate = transport_cost_per_bu_mile(features.diesel_per_gal)
    c_transport_ref = rate * closest_buyer_distance_miles

    # Fair price central estimate
    p_fair = pf + features.basis_regional + a_season + w_weather - c_transport_ref
    p_fair = max(p_fair, pf * 0.70)  # floor at 70% of futures (sanity)

    # Uncertainty range: ±1σ using basis std + seasonal std × futures
    seasonal_std_dollars = pf * features.seasonal_4w_std
    uncertainty = (features.basis_std ** 2 + seasonal_std_dollars ** 2) ** 0.5
    p_fair_low  = round(p_fair - uncertainty, 3)
    p_fair_high = round(p_fair + uncertainty, 3)
    p_fair      = round(p_fair, 3)

    # ── Basis metrics ──────────────────────────────────────────────────────────
    basis_regional = features.basis_regional
    basis_local    = best_local_bid - pf        # farmer's local basis

    # ── Mispricing function ────────────────────────────────────────────────────
    # M = (P_fair - P_local) / P_fair
    mispricing_pct = (p_fair - best_local_bid) / p_fair if p_fair > 0 else 0.0

    # ΔR = (P_fair - P_local) × Q
    revenue_impact = (p_fair - best_local_bid) * quantity_bu

    # ── Driver decomposition ───────────────────────────────────────────────────
    # Transport driver: cost to haul to the closest buyer, deducted from fair value
    transport_impact = round(-c_transport_ref, 3)

    # Seasonality driver: how seasonal timing is shifting fair value
    seasonality_impact = round(a_season, 3)

    # Basis gap: difference between farmer's local basis and regional benchmark
    # Negative = farmer's local bid has a wider (worse) basis than regional
    basis_gap = round(basis_local - basis_regional, 3)

    # Weather: supply shock contribution
    weather_impact = round(w_weather, 3)

    return FairPriceAnalysis(
        p_fair=p_fair,
        p_fair_low=p_fair_low,
        p_fair_high=p_fair_high,
        p_futures=round(pf, 4),
        basis_regional=round(basis_regional, 3),
        basis_local=round(basis_local, 3),
        mispricing_pct=round(mispricing_pct, 4),
        revenue_impact=round(revenue_impact, 2),
        drivers=PriceDrivers(
            transport_impact=transport_impact,
            seasonality_impact=seasonality_impact,
            basis_gap=basis_gap,
            weather_impact=weather_impact,
        ),
    )
