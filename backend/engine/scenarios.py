"""
Decision Simulation Layer — evaluates counterfactual scenarios.

Core formula:
  EV(a) = E[R(a)] - C(a) - Risk(a)

Where:
  E[R(a)] = expected revenue under future market scenarios (probabilistic)
  C(a)    = transportation + storage + opportunity costs
  Risk(a) = downside uncertainty proxy = 1.5σ × Q

Scenarios produced:
  1. sell_now (one per buyer)  — immediate sale, zero uncertainty
  2. wait_1_week              — seasonal + momentum forward projection, 1-week
  3. wait_1_month             — seasonal + momentum forward projection, 4-weeks
  4. store_hedge              — lock futures price, hold physically (if has_storage)
"""

from backend.engine.features import FeatureSet
from backend.engine.storage import calc_hedge_ev
from backend.models import BuyerResult, ScenarioResult


def _confidence(std: float) -> str:
    if std < 0.015:
        return "high"
    if std < 0.030:
        return "medium"
    return "low"


def _wait_scenario(
    action: str,
    label: str,
    features: FeatureSet,
    best_net_per_bu: float,
    quantity_bu: float,
    tbill_rate_pct: float,
    has_storage: bool,
    storage_type: str,
    n_weeks: int,
    seasonal_return: float,
    seasonal_std: float,
) -> ScenarioResult:
    """
    Build a wait scenario.

    E[R(a)] = best_net_per_bu × (1 + seasonal_return + momentum_contribution) × Q
    C(a)    = storage costs for the holding period (if applicable)
    Risk(a) = 1.5σ × quantity (downside uncertainty)
    """
    n_months = n_weeks / 4.0

    # E[R(a)]: price expected to move by seasonal compound + partial momentum carry
    # Momentum contribution: 50% decay applied per week (momentum fades)
    momentum_contribution = features.futures_momentum * n_weeks * 0.5
    expected_price_change = seasonal_return + momentum_contribution
    e_revenue_per_bu = best_net_per_bu * (1 + expected_price_change)

    # C(a): storage cost if farmer has storage
    if has_storage:
        from backend.constants import get_storage_rate
        phys_rate = get_storage_rate(features.farm_state, storage_type)
        storage_cost_per_bu = phys_rate * n_months
        # Opportunity cost: interest on delayed cash
        annual_rate = tbill_rate_pct / 100
        opp_cost_per_bu = best_net_per_bu * (annual_rate / 12) * n_months
        cost_per_bu = storage_cost_per_bu + opp_cost_per_bu
    else:
        # No physical storage = can't wait without selling forward or finding storage
        # Cost = opportunity cost only (time value of money)
        annual_rate = tbill_rate_pct / 100
        cost_per_bu = best_net_per_bu * (annual_rate / 12) * n_months

    # EV = E[R] - C
    ev_per_bu = e_revenue_per_bu - cost_per_bu
    ev_total  = ev_per_bu * quantity_bu
    cost_total = cost_per_bu * quantity_bu

    # Risk: 1.5σ × Q — represents the downside spread
    risk_per_bu = seasonal_std * 1.5
    risk_total  = risk_per_bu * best_net_per_bu * quantity_bu

    low  = round((ev_per_bu - risk_per_bu * best_net_per_bu) * quantity_bu, 2)
    high = round((ev_per_bu + risk_per_bu * best_net_per_bu) * quantity_bu, 2)

    return ScenarioResult(
        action=action,
        label=label,
        buyer_name=None,
        expected_value=round(ev_total, 2),
        ev_per_bu=round(ev_per_bu, 4),
        cost_total=round(cost_total, 2),
        risk_exposure=round(risk_total, 2),
        low=low,
        high=high,
        confidence=_confidence(seasonal_std),
        seasonal_trend_pct=round(seasonal_return * 100, 2),
        recommended=False,  # set by caller
    )


def calc_scenarios(
    features: FeatureSet,
    buyer_results: list[BuyerResult],
    quantity_bu: float,
    has_storage: bool,
    storage_type: str,
    storage_months: int | None,
    urgency: str,
) -> list[ScenarioResult]:
    """
    Generate all scenarios for the dashboard comparison panel.

    Returns scenarios ordered: sell_now (all buyers) → wait_1_week → wait_1_month
    → store_hedge (if storage available).

    The recommended flag is set on the scenario with the highest expected_value,
    subject to urgency: "high" urgency forces sell_now recommendation regardless
    of EV of wait scenarios.
    """
    scenarios: list[ScenarioResult] = []

    best_buyer = max(buyer_results, key=lambda b: b.net_revenue)
    best_net_per_bu = best_buyer.net_per_bu

    # ── Sell Now (one per buyer) ───────────────────────────────────────────────
    for buyer in sorted(buyer_results, key=lambda b: b.rank):
        scenarios.append(ScenarioResult(
            action="sell_now",
            label=f"Sell Now — {buyer.name}",
            buyer_name=buyer.name,
            expected_value=buyer.net_revenue,
            ev_per_bu=buyer.net_per_bu,
            cost_total=buyer.transport_cost,
            risk_exposure=0.0,
            low=buyer.net_revenue,
            high=buyer.net_revenue,
            confidence="high",
            seasonal_trend_pct=0.0,
            recommended=False,
        ))

    # ── Wait 1 Week ───────────────────────────────────────────────────────────
    scenarios.append(_wait_scenario(
        action="wait_1_week",
        label="Wait 1 Week",
        features=features,
        best_net_per_bu=best_net_per_bu,
        quantity_bu=quantity_bu,
        tbill_rate_pct=features.tbill_rate_pct,
        has_storage=has_storage,
        storage_type=storage_type,
        n_weeks=1,
        seasonal_return=features.seasonal_1w_return,
        seasonal_std=features.seasonal_1w_std,
    ))

    # ── Wait 1 Month ──────────────────────────────────────────────────────────
    scenarios.append(_wait_scenario(
        action="wait_1_month",
        label="Wait 1 Month",
        features=features,
        best_net_per_bu=best_net_per_bu,
        quantity_bu=quantity_bu,
        tbill_rate_pct=features.tbill_rate_pct,
        has_storage=has_storage,
        storage_type=storage_type,
        n_weeks=4,
        seasonal_return=features.seasonal_4w_return,
        seasonal_std=features.seasonal_4w_std,
    ))

    # ── Store + Hedge ─────────────────────────────────────────────────────────
    if has_storage and storage_months:
        hedge = calc_hedge_ev(
            features=features,
            best_net_per_bu=best_net_per_bu,
            quantity_bu=quantity_bu,
            storage_months=storage_months,
            storage_type=storage_type,
            farm_state=features.farm_state,
        )
        # Confidence: hedge eliminates futures risk; only basis risk remains.
        # Normalize basis_std ($/bu) to fractional std to match _confidence thresholds.
        hedge_std = features.basis_std / features.futures_price if features.futures_price > 0 else 0.02
        scenarios.append(ScenarioResult(
            action="store_hedge",
            label=f"Store + Hedge ({storage_months}mo)",
            buyer_name=None,
            expected_value=hedge["ev_total"],
            ev_per_bu=hedge["ev_per_bu"],
            cost_total=hedge["cost_total"],
            risk_exposure=round(hedge["risk_per_bu"] * quantity_bu, 2),
            low=hedge["low"],
            high=hedge["high"],
            confidence=_confidence(hedge_std),
            seasonal_trend_pct=round(features.seasonal_4w_return * 100, 2),
            recommended=False,
        ))

    # ── Set recommended flag ──────────────────────────────────────────────────
    # High urgency (cash-flow pressure) → always recommend best sell_now
    if urgency == "high":
        best_now = max(
            (s for s in scenarios if s.action == "sell_now"),
            key=lambda s: s.expected_value,
        )
        for s in scenarios:
            s.recommended = (s is best_now)
    else:
        best_ev = max(scenarios, key=lambda s: s.expected_value)
        for s in scenarios:
            s.recommended = (s is best_ev)

    return scenarios
