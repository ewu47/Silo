from backend.constants import TRANSPORT_COST_PER_BU_MILE
from backend.models import Buyer, BuyerResult


def calc_buyer_results(
    buyers: list[Buyer],
    distances_miles: list[float],
    quantity_bu: float,
) -> list[BuyerResult]:
    results = []
    for buyer, dist in zip(buyers, distances_miles):
        gross = buyer.bid_per_bu * quantity_bu
        transport = dist * quantity_bu * TRANSPORT_COST_PER_BU_MILE
        net = gross - transport
        results.append(BuyerResult(
            name=buyer.name,
            bid_per_bu=buyer.bid_per_bu,
            distance_miles=dist,
            gross_revenue=round(gross, 2),
            transport_cost=round(transport, 2),
            net_revenue=round(net, 2),
            net_per_bu=round(net / quantity_bu, 4),
        ))
    return results
