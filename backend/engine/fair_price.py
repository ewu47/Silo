"""
Fair Price Model

P_fair = P_futures + B_region + A_season + W_weather - C_transport_ref

Where:
  P_futures  = front-month commodity futures benchmark ($/bu)
  B_region   = regional basis adjustment = P_cash_regional - P_futures
  A_season   = seasonal timing adjustment (based on 4-week forward seasonal return)
  W_weather  = weather-induced supply shock premium/discount
  C_transport_ref = transport cost to a reference buyer (20-mile standard)

Mispricing:
  M = (P_fair - P_local) / P_fair
  ΔR = (P_fair - P_local) × Q

Positive M → farmer is being underpaid relative to market fair value.
"""

from backend.engine.features import FeatureSet
from backend.models import FairPriceAnalysis, PriceDrivers

# Reference distance for fair price benchmark (a "nearby" buyer as baseline)
_REFERENCE_DISTANCE_MILES = 15.0
_REFERENCE_TRANSPORT_PER_BU = 0.042 * _REFERENCE_DISTANCE_MILES  # ≈ $0.63/bu


def calc_fair_price(
    features: FeatureSet,
    quantity_bu: float,
    best_local_bid: float,   # farmer's best available cash bid $/bu
) -> FairPriceAnalysis:
    """
    Compute the fair price range and decompose the gap between fair value and
    the farmer's best available bid into contributing factors.
    """
    pf = features.futures_price

    # ── Components ─────────────────────────────────────────────────────────────

    # Seasonal adjustment: 4-week expected return scaled to $/bu
    # Represents what the market is expected to do from current futures price
    a_season = pf * features.seasonal_4w_return

    # Weather supply shock: high disruption → upward price pressure
    # Scale: 0.0 disruption = no effect; 1.0 disruption = +$0.30/bu premium
    w_weather = features.weather_disruption_index * 0.30 * (
        1 if features.precip_anomaly < 0 else -0.3  # drought → bullish; flood varies
    )

    # Reference transport cost (standard 15-mile buyer)
    c_transport_ref = _REFERENCE_TRANSPORT_PER_BU

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
    # Each driver shows its $/bu contribution to the gap (P_fair - P_local)
    gap = p_fair - best_local_bid

    # Transport driver: how much the farmer's best buyer transport cost exceeds reference
    # Positive = farmer is paying more to haul than the 15-mile benchmark
    # (This gets updated by transport engine with actual best buyer distance)
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
