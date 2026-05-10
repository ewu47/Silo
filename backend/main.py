from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from backend.models import (
    AnalyzeRequest, AnalyzeResponse, MarketSignals,
    MarketContextResponse, FuturesQuote, NewsHeadline,
)
from backend.engine.features import build_features
from backend.engine.fair_price import calc_fair_price
from backend.engine.transport import calc_buyer_results
from backend.engine.storage import calc_storage_analysis
from backend.engine.scenarios import calc_scenarios
from backend.engine.mpi import calc_mpi
from backend.fetchers.distance import get_distances
from backend.fetchers.futures import get_futures_features
from backend.fetchers.fred import get_diesel_price, get_tbill_rate
from backend.fetchers.weather import get_weather_data
from backend.fetchers.news import get_ag_headlines
from backend.llm import get_llm_explanation

app = FastAPI(title="Silo API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/market", response_model=MarketContextResponse)
def market_context(location: str = "Decatur, IL"):
    """
    Market context dashboard endpoint — no farmer input required.
    Returns live futures quotes, economic indicators, weather, and ag headlines.
    Used as the default homepage when farmers are not in harvest season.
    """
    commodities = ["corn", "soybeans", "wheat"]
    quotes = []
    for commodity in commodities:
        fut = get_futures_features(commodity)
        quotes.append(FuturesQuote(
            commodity=commodity,
            ticker=fut["ticker"],
            price=round(fut["price"], 4),
            momentum_weekly_pct=round(fut["momentum_weekly_pct"], 5),
            volatility_ann=round(fut["volatility_ann"], 4),
        ))

    diesel = get_diesel_price()
    tbill  = get_tbill_rate()
    wx     = get_weather_data(location)
    raw_headlines = get_ag_headlines(max_per_feed=3)
    headlines = [NewsHeadline(**h) for h in raw_headlines]

    return MarketContextResponse(
        quotes=quotes,
        diesel_per_gal=round(diesel, 3),
        tbill_rate_pct=round(tbill, 2),
        weather_summary=wx["summary"],
        weather_risk=wx["risk_level"],
        headlines=headlines,
    )


@app.post("/analyze", response_model=AnalyzeResponse)
def analyze(req: AnalyzeRequest):
    # ── (1) Feature Engineering Layer ─────────────────────────────────────────
    # Fetch all external data and assemble into a model-ready FeatureSet.
    features = build_features(req.commodity, req.farm_address)

    # ── (2) Distances ──────────────────────────────────────────────────────────
    distances = get_distances(req.farm_address, [b.address for b in req.buyers])

    # ── (3) Buyer Comparison ───────────────────────────────────────────────────
    # Transport cost is fuel-scaled: C = d × (fixed + fuel_scale × diesel/ref)
    buyer_results = calc_buyer_results(
        buyers=req.buyers,
        distances_miles=distances,
        quantity_bu=req.quantity_bu,
        diesel_per_gal=features.diesel_per_gal,
    )
    best_buyer = max(buyer_results, key=lambda b: b.net_revenue)

    # ── (4) Fair Price Model ───────────────────────────────────────────────────
    # P_fair = P_futures + B_region + A_season + W_weather - C_transport_ref
    fair_price = calc_fair_price(
        features=features,
        quantity_bu=req.quantity_bu,
        best_local_bid=best_buyer.bid_per_bu,
    )

    # ── (5) Storage Analysis ───────────────────────────────────────────────────
    # V_storage = E[P_future] - P_current - C_storage (if has_storage)
    storage_analysis = None
    if req.has_storage and req.storage_months:
        storage_analysis = calc_storage_analysis(
            features=features,
            best_net_per_bu=best_buyer.net_per_bu,
            quantity_bu=req.quantity_bu,
            storage_months=req.storage_months,
            storage_type=req.storage_type,
        )

    # ── (6) Scenario Simulation ────────────────────────────────────────────────
    # EV(a) = E[R(a)] - C(a) - Risk(a) for each action
    scenarios = calc_scenarios(
        features=features,
        buyer_results=buyer_results,
        quantity_bu=req.quantity_bu,
        has_storage=req.has_storage,
        storage_type=req.storage_type,
        storage_months=req.storage_months,
        urgency=req.urgency,
    )

    # ── (7) Market Pressure Index ──────────────────────────────────────────────
    # MPI = Σ w_i × X_i across 5 signals
    mpi_score, mpi_label = calc_mpi(features, req.commodity)

    # ── (8) Assemble Response ──────────────────────────────────────────────────
    response = AnalyzeResponse(
        commodity=req.commodity,
        quantity_bu=req.quantity_bu,
        best_buyer=best_buyer.name,
        buyers=buyer_results,
        scenarios=scenarios,
        fair_price=fair_price,
        market_signals=MarketSignals(
            futures_price=round(features.futures_price, 4),
            futures_ticker=features.futures_ticker,
            futures_momentum=round(features.futures_momentum, 5),
            futures_volatility=round(features.futures_volatility, 4),
            diesel_per_gal=round(features.diesel_per_gal, 3),
            tbill_rate_pct=round(features.tbill_rate_pct, 2),
            basis_regional=round(features.basis_regional, 3),
            inventory_signal=round(features.inventory_signal, 3),
            mpi_score=mpi_score,
            mpi=mpi_label,
            weather_summary=features.weather_summary,
            weather_risk=features.weather_risk_level,
            weather_disruption_index=round(features.weather_disruption_index, 3),
        ),
        storage_analysis=storage_analysis,
        llm_explanation="",
    )

    # ── (9) LLM Interpretation Layer ──────────────────────────────────────────
    # LLM receives structured JSON outputs; never computes prices itself.
    response.llm_explanation = get_llm_explanation(response)

    return response
