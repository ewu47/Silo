"""
LLM Interpretation Layer — Google Gemini 2.0 Flash

The LLM is NOT the pricing engine. It receives structured quantitative outputs
and translates them into plain-English explanations for grain farmers.

Constraint: the model must never compute prices, percentages, or dollar amounts.
It interprets what the quantitative engine found.
"""

import os
import json
from google import genai
from backend.models import AnalyzeResponse

SYSTEM_PROMPT = """You are Silo's market explanation engine. You receive structured quantitative outputs from a commodity pricing and scenario analysis model and translate them into clear, plain-English explanations for grain farmers.

Critical rules:
1. NEVER compute, estimate, or guess prices, percentages, or dollar amounts. Use only the numbers provided in the input JSON — do not modify or recalculate them.
2. Do not give financial advice. Explain what the model found and why.
3. Always include a confidence qualifier and acknowledge uncertainty.
4. Write simply. Max 5 sentences. Lead with the most actionable insight from the data.
5. Say "the analysis suggests" or "the model indicates" — never "I recommend."
6. Decompose what's driving any pricing gap: transport, seasonality, basis, weather.
7. When a wait scenario has higher expected value, explain the tradeoff clearly.
8. When the store+hedge scenario exists, explain what locking basis means in plain terms.

Format: 2–5 plain sentences. No bullet points. No markdown. No headers."""


def get_llm_explanation(response: AnalyzeResponse) -> str:
    api_key = os.getenv("GEMINI_API_KEY", "")
    if not api_key:
        return _fallback_explanation(response)

    try:
        client = genai.Client(api_key=api_key)

        recommended = next((s for s in response.scenarios if s.recommended), None)
        payload = {
            "commodity": response.commodity,
            "quantity_bu": response.quantity_bu,
            "best_buyer": response.best_buyer,
            "fair_price": {
                "p_fair": response.fair_price.p_fair,
                "p_fair_low": response.fair_price.p_fair_low,
                "p_fair_high": response.fair_price.p_fair_high,
                "p_futures": response.fair_price.p_futures,
                "basis_regional": response.fair_price.basis_regional,
                "basis_local": response.fair_price.basis_local,
                "mispricing_pct": response.fair_price.mispricing_pct,
                "revenue_impact": response.fair_price.revenue_impact,
                "drivers": response.fair_price.drivers.model_dump(),
            },
            "buyers": [
                {
                    "name": b.name,
                    "bid_per_bu": b.bid_per_bu,
                    "distance_miles": b.distance_miles,
                    "net_per_bu": b.net_per_bu,
                    "net_revenue": b.net_revenue,
                    "transport_arbitrage_value": b.transport_arbitrage_value,
                    "rank": b.rank,
                }
                for b in response.buyers
            ],
            "scenarios": [
                {
                    "action": s.action,
                    "label": s.label,
                    "buyer_name": s.buyer_name,
                    "expected_value": s.expected_value,
                    "ev_per_bu": s.ev_per_bu,
                    "low": s.low,
                    "high": s.high,
                    "confidence": s.confidence,
                    "seasonal_trend_pct": s.seasonal_trend_pct,
                    "recommended": s.recommended,
                }
                for s in response.scenarios
            ],
            "market_signals": {
                "futures_price": response.market_signals.futures_price,
                "futures_momentum": response.market_signals.futures_momentum,
                "futures_volatility": response.market_signals.futures_volatility,
                "basis_regional": response.market_signals.basis_regional,
                "inventory_signal": response.market_signals.inventory_signal,
                "mpi": response.market_signals.mpi,
                "mpi_score": response.market_signals.mpi_score,
                "weather_risk": response.market_signals.weather_risk,
                "weather_disruption_index": response.market_signals.weather_disruption_index,
            },
            "recommended_action": recommended.label if recommended else None,
        }

        result = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=f"{SYSTEM_PROMPT}\n\nExplain this grain sale analysis to the farmer:\n{json.dumps(payload, indent=2)}",
        )
        return result.text.strip()

    except Exception:
        return _fallback_explanation(response)


def _fallback_explanation(response: AnalyzeResponse) -> str:
    best = next((b for b in response.buyers if b.name == response.best_buyer), response.buyers[0])
    recommended = next((s for s in response.scenarios if s.recommended), None)
    fp = response.fair_price
    ms = response.market_signals

    mispricing_dir = "below" if fp.mispricing_pct > 0 else "above"
    impact_abs = abs(fp.revenue_impact)

    explanation = (
        f"The analysis suggests {best.name} offers the best net return at "
        f"${best.net_per_bu:.3f}/bu after transport costs, for a total of ${best.net_revenue:,.0f}. "
        f"The model estimates a fair price of ${fp.p_fair:.2f}/bu, placing current bids "
        f"{mispricing_dir} market fair value by {abs(fp.mispricing_pct)*100:.1f}% "
        f"(${impact_abs:,.0f} on your full position). "
        f"Market signals are {ms.mpi}. "
    )
    if recommended and recommended.action != "sell_now":
        explanation += (
            f"The {recommended.label} scenario shows a higher expected value of "
            f"${recommended.expected_value:,.0f}, though with {recommended.confidence} confidence."
        )
    return explanation
