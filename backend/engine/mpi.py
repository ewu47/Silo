"""
Market Pressure Index (MPI)

MPI = Σ w_i × X_i

Five signals per the spec:
  X1 = futures_momentum  (ΔP_futures weekly slope %)
  X2 = inventory_imbalance (supply pressure, inferred from basis deviation)
  X3 = export_demand_shifts (proxied from futures momentum divergence)
  X4 = basis_widening/contracting (current basis vs historical norm)
  X5 = weather_disruption_index (0–1 weather supply shock)

Each signal is normalized to [-1, +1] before weighting.
Weights: momentum 0.30, inventory 0.25, basis 0.20, weather 0.15, exports 0.10.

Output:
  mpi_score: raw weighted sum (typically -1 to +1)
  mpi_label: "bullish" | "neutral" | "bearish"
"""

from backend.engine.features import FeatureSet
from backend.constants import MPI_WEIGHTS, FALLBACK_BASIS


def _normalize_momentum(momentum_weekly_pct: float) -> float:
    """
    Map weekly momentum % to [-1, +1].
    ±2% weekly move = max signal.
    """
    return max(-1.0, min(1.0, momentum_weekly_pct / 0.02))


def _normalize_inventory(inventory_signal: float) -> float:
    """
    inventory_signal is already on [-1, +1] from features.py.
    Positive = tight supply (bullish); negative = loose supply (bearish).
    """
    return inventory_signal


def _normalize_basis(basis_regional: float, commodity: str) -> float:
    """
    Basis widening (more negative than normal) = bearish supply pressure.
    Basis contracting (less negative / positive) = bullish demand signal.

    Map deviation from historical norm to [-1, +1], ±$0.25/bu = full signal.
    """
    historical = FALLBACK_BASIS.get(commodity, -0.30)
    deviation = basis_regional - historical  # positive = tighter than normal
    return max(-1.0, min(1.0, deviation / 0.25))


def _normalize_weather(disruption_index: float, precip_anomaly: float) -> float:
    """
    Weather disruption bullish = supply shock → price pressure upward.
    Drought (precip_anomaly < 0) with high disruption = strongly bullish.
    Flood with disruption = bullish (crop damage).
    Normal weather = neutral.
    """
    if disruption_index < 0.1:
        return 0.0
    # Both drought and flood reduce supply → bullish
    supply_shock = disruption_index * (1.0 + abs(precip_anomaly) * 0.5)
    return min(1.0, supply_shock)


def _normalize_export(momentum_weekly_pct: float, basis_regional: float, commodity: str) -> float:
    """
    Export demand proxy: strong futures momentum + tightening basis = export pull.
    Weak futures + widening basis = weak export demand.

    Without direct USDA export sales data, we proxy with momentum × basis signal.
    """
    basis_signal = _normalize_basis(basis_regional, commodity)
    momentum_signal = _normalize_momentum(momentum_weekly_pct)
    # Concordant signals amplify; discordant cancel
    return max(-1.0, min(1.0, (momentum_signal + basis_signal) / 2.0))


def calc_mpi(features: FeatureSet, commodity: str) -> tuple[float, str]:
    """
    Compute the Market Pressure Index.
    Returns (mpi_score, mpi_label).
    """
    x1_momentum  = _normalize_momentum(features.futures_momentum)
    x2_inventory = _normalize_inventory(features.inventory_signal)
    x3_exports   = _normalize_export(features.futures_momentum, features.basis_regional, commodity)
    x4_basis     = _normalize_basis(features.basis_regional, commodity)
    x5_weather   = _normalize_weather(features.weather_disruption_index, features.precip_anomaly)

    # Rate environment overlay: high rates increase carrying cost → selling pressure
    rate_penalty = 0.0
    if features.tbill_rate_pct > 5.0:
        rate_penalty = -0.10
    elif features.tbill_rate_pct < 3.0:
        rate_penalty = +0.05

    w = MPI_WEIGHTS
    mpi_score = (
        w["futures_momentum"]    * x1_momentum  +
        w["inventory_imbalance"] * x2_inventory +
        w["export_demand"]       * x3_exports   +
        w["basis_signal"]        * x4_basis     +
        w["weather_disruption"]  * x5_weather   +
        rate_penalty
    )
    mpi_score = round(max(-1.0, min(1.0, mpi_score)), 4)

    if mpi_score >= 0.15:
        label = "bullish"
    elif mpi_score <= -0.15:
        label = "bearish"
    else:
        label = "neutral"

    return mpi_score, label
