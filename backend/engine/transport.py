"""
Transport Model

C_transport = d × (FIXED + FUEL_SCALE × (diesel / DIESEL_REFERENCE)) × Q

Transport Arbitrage:
  V_transport = (P_alt - P_nearest) × Q - C_haul_delta

Where C_haul_delta = additional hauling cost to reach the alternative buyer vs nearest.
Positive V_transport → farther buyer is worth accessing.
"""

from backend.models import Buyer, BuyerResult
from backend.constants import (
    TRANSPORT_FIXED_PER_BU_MILE,
    TRANSPORT_FUEL_SCALE,
    DIESEL_REFERENCE,
)


def transport_cost_per_bu_mile(diesel_per_gal: float) -> float:
    """Fuel-scaled transport rate $/bu/mile."""
    return TRANSPORT_FIXED_PER_BU_MILE + TRANSPORT_FUEL_SCALE * (diesel_per_gal / DIESEL_REFERENCE)


def calc_buyer_results(
    buyers: list[Buyer],
    distances_miles: list[float],
    quantity_bu: float,
    diesel_per_gal: float,
) -> list[BuyerResult]:
    """
    Compute per-buyer net revenue with fuel-scaled transport costs and
    transport arbitrage values relative to the nearest buyer.
    """
    rate = transport_cost_per_bu_mile(diesel_per_gal)

    raw: list[dict] = []
    for buyer, dist in zip(buyers, distances_miles):
        gross = buyer.bid_per_bu * quantity_bu
        t_cost_per_bu = dist * rate
        t_cost = t_cost_per_bu * quantity_bu
        net = gross - t_cost
        raw.append({
            "name":               buyer.name,
            "bid_per_bu":         buyer.bid_per_bu,
            "distance_miles":     dist,
            "gross_revenue":      gross,
            "transport_cost":     t_cost,
            "transport_per_bu":   t_cost_per_bu,
            "net_revenue":        net,
            "net_per_bu":         net / quantity_bu,
        })

    # Sort by net revenue descending to assign ranks
    ranked = sorted(raw, key=lambda x: x["net_revenue"], reverse=True)
    best_net = ranked[0]["net_revenue"]

    # Nearest buyer = minimum distance (baseline for arbitrage calc)
    nearest_net = min(raw, key=lambda x: x["distance_miles"])["net_revenue"]

    results: list[BuyerResult] = []
    for item in raw:
        rank = next(i + 1 for i, r in enumerate(ranked) if r["name"] == item["name"])

        # V_transport = net_revenue_this_buyer - net_revenue_nearest_buyer
        # Positive = worth hauling farther; Negative = closer buyer is better net
        v_transport = item["net_revenue"] - nearest_net

        results.append(BuyerResult(
            name=item["name"],
            bid_per_bu=round(item["bid_per_bu"], 4),
            distance_miles=round(item["distance_miles"], 1),
            gross_revenue=round(item["gross_revenue"], 2),
            transport_cost=round(item["transport_cost"], 2),
            transport_cost_per_bu=round(item["transport_per_bu"], 4),
            net_revenue=round(item["net_revenue"], 2),
            net_per_bu=round(item["net_per_bu"], 4),
            rank=rank,
            vs_best_net=round(item["net_revenue"] - best_net, 2),
            transport_arbitrage_value=round(v_transport, 2),
        ))

    return results
