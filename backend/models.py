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
    buyers: list[Buyer] = Field(..., min_length=1, max_length=5)
    has_storage: bool = False
    storage_type: str = Field("commercial", pattern="^(on_farm|commercial)$")
    storage_months: Optional[int] = Field(None, ge=1, le=12)
    urgency: str = Field("medium", pattern="^(low|medium|high)$")


# ── Buyer comparison ──────────────────────────────────────────────────────────

class BuyerResult(BaseModel):
    name: str
    bid_per_bu: float
    distance_miles: float
    gross_revenue: float
    transport_cost: float
    transport_cost_per_bu: float
    net_revenue: float
    net_per_bu: float
    rank: int                        # 1 = best net revenue
    vs_best_net: float               # delta vs best buyer in $ (0 for best)
    transport_arbitrage_value: float # V_transport: gain/loss vs nearest buyer


# ── Fair price model ──────────────────────────────────────────────────────────

class PriceDrivers(BaseModel):
    transport_impact: float          # transport disadvantage $/bu (vs 0-mile theoretical)
    seasonality_impact: float        # seasonal timing $/bu
    basis_gap: float                 # local basis vs regional benchmark $/bu
    weather_impact: float            # weather supply shock $/bu

class FairPriceAnalysis(BaseModel):
    p_fair: float                    # $/bu central estimate
    p_fair_low: float                # $/bu lower bound
    p_fair_high: float               # $/bu upper bound
    p_futures: float                 # $/bu front-month futures
    basis_regional: float            # B_region = regional_cash - futures $/bu
    basis_local: float               # farmer's best bid - futures $/bu
    mispricing_pct: float            # M = (P_fair - P_local) / P_fair
    revenue_impact: float            # ΔR = (P_fair - P_local) × Q in $
    drivers: PriceDrivers


# ── Storage analysis ──────────────────────────────────────────────────────────

class StorageAnalysis(BaseModel):
    v_storage_per_bu: float          # V_storage = E[P_future] - P_current - C_storage
    total_storage_value: float       # v_storage × Q
    storage_cost_total: float        # physical storage + capital cost
    opportunity_cost: float          # time value of delayed cash flow
    recommend_delay: bool            # True if V_storage > 0
    storage_type: str                # "on_farm" | "commercial"


# ── Scenarios ─────────────────────────────────────────────────────────────────

class ScenarioResult(BaseModel):
    action: str           # "sell_now" | "wait_1_week" | "wait_1_month" | "store_hedge"
    label: str
    buyer_name: Optional[str] = None  # populated for sell_now scenarios only
    expected_value: float             # EV(a) = E[R(a)] - C(a) - risk_penalty total $
    ev_per_bu: float
    cost_total: float                 # C(a): transport + storage + commission
    risk_exposure: float              # downside risk proxy (1.5σ × Q)
    low: float                        # EV - 1.5σ
    high: float                       # EV + 1.5σ
    confidence: str                   # "high" | "medium" | "low"
    seasonal_trend_pct: float         # expected % price change over window
    recommended: bool                 # True for highest-EV scenario


# ── Market signals ────────────────────────────────────────────────────────────

class MarketSignals(BaseModel):
    futures_price: float
    futures_ticker: str
    futures_momentum: float          # weekly slope % (positive = uptrend)
    futures_volatility: float        # 20-day rolling std dev (annualized)
    diesel_per_gal: float
    tbill_rate_pct: float
    basis_regional: float            # regional benchmark basis $/bu
    inventory_signal: float          # negative = tight supply, positive = loose
    mpi_score: float                 # raw weighted MPI score (-1 to +1)
    mpi: str                         # "bullish" | "neutral" | "bearish"
    weather_summary: Optional[str] = None
    weather_risk: str                # "low" | "medium" | "high"
    weather_disruption_index: float  # 0.0 to 1.0


# ── Price history (charting) ─────────────────────────────────────────────────

class PriceBar(BaseModel):
    date: str                          # ISO date "YYYY-MM-DD"
    open: float
    high: float
    low: float
    close: float
    volume: Optional[float] = None

class PriceHistoryResponse(BaseModel):
    commodity: str
    ticker: str
    period: str                        # e.g. "6mo"
    bars: list[PriceBar]
    sma_20: list[Optional[float]]      # 20-day SMA aligned to bars
    sma_50: list[Optional[float]]      # 50-day SMA aligned to bars
    current_price: float
    momentum_weekly_pct: float
    volatility_ann: float


# ── Market context (homepage dashboard) ──────────────────────────────────────

class FuturesQuote(BaseModel):
    commodity: str
    ticker: str
    price: float                     # $/bu
    momentum_weekly_pct: float       # weekly slope %
    volatility_ann: float            # annualized std

class NewsHeadline(BaseModel):
    source: str
    title: str
    link: str
    published: str

class MarketContextResponse(BaseModel):
    quotes: list[FuturesQuote]       # corn, soybeans, wheat
    diesel_per_gal: float
    tbill_rate_pct: float
    weather_summary: Optional[str] = None
    weather_risk: str
    headlines: list[NewsHeadline]


# ── Top-level response ────────────────────────────────────────────────────────

class AnalyzeResponse(BaseModel):
    commodity: str
    quantity_bu: float
    best_buyer: str

    # Section 1: Buyer comparison
    buyers: list[BuyerResult]

    # Section 2: Scenario analysis (sell_now × buyers + wait + store_hedge)
    scenarios: list[ScenarioResult]

    # Section 3: Market intelligence
    fair_price: FairPriceAnalysis
    market_signals: MarketSignals
    storage_analysis: Optional[StorageAnalysis] = None

    llm_explanation: str
