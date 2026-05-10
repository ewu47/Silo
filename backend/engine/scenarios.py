from datetime import date
from backend.models import ScenarioResult
from backend.fetchers.futures import get_seasonal_returns


def _confidence(std: float) -> str:
    if std < 0.015:
        return "high"
    if std < 0.03:
        return "medium"
    return "low"


def calc_scenarios(
    commodity: str,
    best_net_revenue: float,
    best_net_per_bu: float,
    quantity_bu: float,
    tbill_rate_pct: float,
    has_storage: bool,
    storage_months: int | None,
) -> list[ScenarioResult]:
    current_week = date.today().isocalendar().week
    scenarios = []

    # Sell Now — baseline, no uncertainty
    scenarios.append(ScenarioResult(
        label="Sell Now",
        expected_value=round(best_net_revenue, 2),
        low=round(best_net_revenue, 2),
        high=round(best_net_revenue, 2),
        confidence="high",
        seasonal_trend_pct=0.0,
    ))

    # Wait 2 weeks / Wait 1 month
    for label, n_weeks in [("Wait 2 Weeks", 2), ("Wait 1 Month", 4)]:
        trend, std = get_seasonal_returns(commodity, current_week, n_weeks)

        # Storage holding cost: interest + commercial storage
        monthly_rate = tbill_rate_pct / 100 / 12
        months = n_weeks / 4
        storage_cost_per_bu = (monthly_rate + 0.04) * months * best_net_per_bu if has_storage else 0.0

        ev_per_bu = best_net_per_bu * (1 + trend) - storage_cost_per_bu
        ev = ev_per_bu * quantity_bu

        # Range: ±1.5 std devs
        spread = best_net_per_bu * std * 1.5 * quantity_bu
        scenarios.append(ScenarioResult(
            label=label,
            expected_value=round(ev, 2),
            low=round(ev - spread, 2),
            high=round(ev + spread, 2),
            confidence=_confidence(std),
            seasonal_trend_pct=round(trend * 100, 2),
        ))

    return scenarios
