from pydantic import BaseModel, Field
from typing import Optional


# ── Request ───────────────────────────────────────────────────────────────────

class Buyer(BaseModel):
    name: str
    bid_per_bu: float = Field(..., gt=0, description="Cash bid in $/bu")
    address: str

class AnalyzeRequest(BaseModel):
    commodity: str = Field(..., pattern="^(soybeans|corn|wheat)$")
    quantity_bu: float = Field(..., gt=0)
    farm_address: str
    buyers: list[Buyer] = Field(..., min_length=1, max_length=3)
    has_storage: bool = False
    storage_months: Optional[int] = Field(None, ge=1, le=12)
    urgency: str = Field("medium", pattern="^(low|medium|high)$")


# ── Response ──────────────────────────────────────────────────────────────────

class BuyerResult(BaseModel):
    name: str
    bid_per_bu: float
    distance_miles: float
    gross_revenue: float
    transport_cost: float
    net_revenue: float
    net_per_bu: float

class ScenarioResult(BaseModel):
    label: str                      # "Sell Now" | "Wait 2 Weeks" | "Wait 1 Month"
    expected_value: float           # net revenue $
    low: float
    high: float
    confidence: str                 # "high" | "medium" | "low"
    seasonal_trend_pct: float       # avg historical % change over the window

class MarketSignals(BaseModel):
    futures_price: float            # $/bu front-month
    futures_ticker: str
    diesel_per_gal: float
    tbill_rate_pct: float
    mpi: str                        # "bullish" | "neutral" | "bearish"
    weather_summary: Optional[str] = None

class AnalyzeResponse(BaseModel):
    commodity: str
    quantity_bu: float
    buyers: list[BuyerResult]
    best_buyer: str                 # name of winner on net_revenue
    scenarios: list[ScenarioResult]
    market_signals: MarketSignals
    llm_explanation: str
