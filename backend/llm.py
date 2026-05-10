import os
import json
from google import genai
from backend.models import AnalyzeResponse

SYSTEM_PROMPT = """You are Silo's explanation engine. You receive structured quantitative outputs from a commodity sale optimization model and translate them into clear, plain-English explanations for grain farmers.

Rules:
1. Never compute prices, percentages, or dollar amounts. Use only the numbers in the input JSON.
2. Don't give financial advice. Explain what the model found.
3. Always include a confidence qualifier and a risk statement.
4. Write simply. Max 5 sentences. Lead with the most actionable insight.
5. Say "the analysis suggests" not "I recommend."
"""


def get_llm_explanation(response: AnalyzeResponse) -> str:
    api_key = os.getenv("GEMINI_API_KEY", "")
    if not api_key:
        return _fallback_explanation(response)

    try:
        client = genai.Client(api_key=api_key)

        payload = {
            "commodity": response.commodity,
            "quantity_bu": response.quantity_bu,
            "best_buyer": response.best_buyer,
            "buyers": [b.model_dump() for b in response.buyers],
            "scenarios": [s.model_dump() for s in response.scenarios],
            "market_signals": response.market_signals.model_dump(),
        }

        result = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=f"{SYSTEM_PROMPT}\n\nAnalysis data:\n{json.dumps(payload, indent=2)}",
        )
        return result.text.strip()
    except Exception:
        return _fallback_explanation(response)


def _fallback_explanation(response: AnalyzeResponse) -> str:
    best = next(b for b in response.buyers if b.name == response.best_buyer)
    sell_now = next(s for s in response.scenarios if s.label == "Sell Now")
    return (
        f"The analysis suggests selling to {best.name} yields the highest net return "
        f"at ${best.net_per_bu:.3f}/bu after transport costs. "
        f"Total net revenue for {response.quantity_bu:,.0f} bu would be ${sell_now.expected_value:,.0f}. "
        f"Market signals are {response.market_signals.mpi}. Review wait scenarios for potential upside."
    )
