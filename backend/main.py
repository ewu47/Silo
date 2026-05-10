from datetime import date
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from backend.models import AnalyzeRequest, AnalyzeResponse, MarketSignals
from backend.fetchers.futures import get_futures_price, get_seasonal_returns
from backend.fetchers.fred import get_diesel_price, get_tbill_rate
from backend.fetchers.distance import get_distances
from backend.fetchers.weather import get_weather_summary
from backend.engine.transport import calc_buyer_results
from backend.engine.scenarios import calc_scenarios
from backend.engine.mpi import calc_mpi
from backend.llm import get_llm_explanation

app = FastAPI(title="Silo API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/analyze", response_model=AnalyzeResponse)
def analyze(req: AnalyzeRequest):
    if not req.buyers:
        raise HTTPException(status_code=400, detail="At least one buyer required")

    # ── Fetch market data ─────────────────────────────────────────────────────
    futures_price, ticker = get_futures_price(req.commodity)
    diesel = get_diesel_price()
    tbill = get_tbill_rate()
    weather = get_weather_summary(req.farm_address)

    # ── Distances ─────────────────────────────────────────────────────────────
    distances = get_distances(req.farm_address, [b.address for b in req.buyers])

    # ── Buyer comparison ──────────────────────────────────────────────────────
    buyer_results = calc_buyer_results(req.buyers, distances, req.quantity_bu)
    best = max(buyer_results, key=lambda b: b.net_revenue)

    # ── Scenarios ─────────────────────────────────────────────────────────────
    scenarios = calc_scenarios(
        commodity=req.commodity,
        best_net_revenue=best.net_revenue,
        best_net_per_bu=best.net_per_bu,
        quantity_bu=req.quantity_bu,
        tbill_rate_pct=tbill,
        has_storage=req.has_storage,
        storage_months=req.storage_months,
    )

    # ── MPI ───────────────────────────────────────────────────────────────────
    current_week = date.today().isocalendar().week
    seasonal_2w, _ = get_seasonal_returns(req.commodity, current_week, 2)
    mpi = calc_mpi(futures_price, tbill, seasonal_2w)

    # ── Assemble response ─────────────────────────────────────────────────────
    response = AnalyzeResponse(
        commodity=req.commodity,
        quantity_bu=req.quantity_bu,
        buyers=buyer_results,
        best_buyer=best.name,
        scenarios=scenarios,
        market_signals=MarketSignals(
            futures_price=round(futures_price, 4),
            futures_ticker=ticker,
            diesel_per_gal=round(diesel, 3),
            tbill_rate_pct=round(tbill, 2),
            mpi=mpi,
            weather_summary=weather,
        ),
        llm_explanation="",
    )

    # ── LLM explanation ───────────────────────────────────────────────────────
    response.llm_explanation = get_llm_explanation(response)

    return response
