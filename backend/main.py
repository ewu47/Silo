from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import time
import os
import logging

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("silo")

# Log API key status on startup
def _key_status(name: str) -> str:
    val = os.getenv(name, "")
    return "✓" if val.strip() else "✗ MISSING"

log.info("API keys — GEMINI:%s  GOOGLE_MAPS:%s  FRED:%s  USDA:%s  SUPABASE:%s",
    _key_status("GEMINI_API_KEY"),
    _key_status("GOOGLE_MAPS_API_KEY"),
    _key_status("FRED_API_KEY"),
    _key_status("USDA_API_KEY"),
    _key_status("SUPABASE_URL"),
)

from backend.models import (
    AnalyzeRequest, AnalyzeResponse, MarketSignals,
    MarketContextResponse, FuturesQuote, NewsHeadline,
    PriceHistoryResponse, PriceBar,
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
from backend.fetchers.nearby_elevators import get_nearby_elevators
from backend.llm import get_llm_explanation
from backend.routers import profile, analyses, alerts, calendar

app = FastAPI(title="Silo API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(profile.router)
app.include_router(analyses.router)
app.include_router(alerts.router)
app.include_router(calendar.router)

# ── Market cache ──────────────────────────────────────────────────────────────
# Futures/diesel/tbill: 5-min TTL. News: 30-min TTL (changes slowly).
# News is stored separately so a failed refresh never wipes good headlines.
_market_cache: dict = {}
_news_cache: list = []          # last known good headlines
_news_cache_ts: float = 0.0
_MARKET_TTL   = 5 * 60
_NEWS_TTL     = 30 * 60


def _get_headlines() -> list:
    """Return cached headlines if fresh, otherwise fetch and update cache.
    Always returns the last known good list — never an empty list from a failed fetch."""
    global _news_cache, _news_cache_ts
    now = time.time()
    if now - _news_cache_ts < _NEWS_TTL:
        return _news_cache
    fresh = get_ag_headlines()
    if fresh:                           # only replace cache if we actually got something
        _news_cache = fresh
        _news_cache_ts = now
    elif not _news_cache:               # first call with no results — set timestamp so we retry in 2 min
        _news_cache_ts = now - _NEWS_TTL + 120
    return _news_cache


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/validate-address")
def validate_address_endpoint(address: str):
    """
    Geocode an address via Nominatim and return whether it resolves.
    Used by the frontend before saving a farm address to the profile.
    """
    from geopy.geocoders import Nominatim
    address = address.strip()
    if len(address) < 5:
        return {"valid": False, "message": "Address is too short."}
    try:
        geolocator = Nominatim(user_agent="silo-grain-recommender/1.0", timeout=6)
        location = geolocator.geocode(address)
    except Exception:
        # Network error — allow through so a bad connection doesn't block saving
        return {"valid": True, "message": "Could not verify (network error), saved anyway."}
    if not location:
        return {"valid": False, "message": "Address could not be found. Please enter a full street address including city and state."}
    return {"valid": True, "message": "Address verified.", "lat": location.latitude, "lon": location.longitude}


@app.get("/nearby")
def nearby_elevators(address: str, radius: float = 50):
    if radius < 1 or radius > 100:
        raise HTTPException(status_code=400, detail="radius must be 1–100")
    address = address.strip()
    log.info("/nearby address=%r radius=%.0f", address, radius)
    results = get_nearby_elevators(address, radius_miles=radius)
    log.info("/nearby → %d elevators found", len(results))
    return {"address": address, "radius_miles": radius, "count": len(results), "elevators": results}


@app.get("/market", response_model=MarketContextResponse)
def market_context(location: str = "Decatur, IL"):
    """
    Market context dashboard endpoint — no farmer input required.
    Returns live futures quotes, economic indicators, weather, and ag headlines.
    Cached: market data 5 min, news 30 min (keyed by location).
    """
    now = time.time()
    mkey = f"market:{location}"

    # Serve full cached response if market data is still fresh
    if mkey in _market_cache and now - _market_cache[mkey]["ts"] < _MARKET_TTL:
        return _market_cache[mkey]["data"]

    # Fetch market data; headlines come from the separate news cache
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
    headlines = [NewsHeadline(**h) for h in _get_headlines()]

    result = MarketContextResponse(
        quotes=quotes,
        diesel_per_gal=round(diesel, 3),
        tbill_rate_pct=round(tbill, 2),
        weather_summary=wx["summary"],
        weather_risk=wx["risk_level"],
        headlines=headlines,
    )
    _market_cache[mkey] = {"ts": now, "data": result}
    return result


@app.get("/history/{commodity}", response_model=PriceHistoryResponse)
def price_history(commodity: str, period: str = "6mo"):
    """
    Return OHLCV price history + SMAs for a commodity from yfinance.
    commodity: "corn" | "soybeans" | "wheat"
    period: yfinance period string — "1mo" | "3mo" | "6mo" | "1y" | "2y"
    """
    import numpy as np
    import yfinance as yf
    from backend.constants import COMMODITY_TICKERS, FALLBACK_FUTURES_CENTS

    if commodity not in COMMODITY_TICKERS:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail=f"Unknown commodity: {commodity}")

    ticker = COMMODITY_TICKERS[commodity]
    valid_periods = {"1mo", "3mo", "6mo", "1y", "2y"}
    if period not in valid_periods:
        period = "6mo"

    try:
        h = yf.Ticker(ticker).history(period=period, interval="1d").copy()
        if h.empty:
            raise ValueError("empty")
    except Exception:
        return PriceHistoryResponse(
            commodity=commodity, ticker=ticker, period=period,
            bars=[], sma_20=[], sma_50=[],
            current_price=FALLBACK_FUTURES_CENTS[commodity] / 100,
            momentum_weekly_pct=0.0, volatility_ann=0.05,
        )

    closes = h["Close"].values / 100  # cents → dollars

    # SMAs
    def sma(arr, window):
        result = [None] * len(arr)
        for i in range(window - 1, len(arr)):
            result[i] = round(float(np.mean(arr[i - window + 1: i + 1])), 4)
        return result

    sma20 = sma(closes, 20)
    sma50 = sma(closes, 50)

    bars = []
    for i, (idx, row) in enumerate(h.iterrows()):
        bars.append(PriceBar(
            date=str(idx.date()),
            open=round(float(row["Open"]) / 100, 4),
            high=round(float(row["High"]) / 100, 4),
            low=round(float(row["Low"]) / 100, 4),
            close=round(float(row["Close"]) / 100, 4),
            volume=float(row["Volume"]) if row["Volume"] > 0 else None,
        ))

    # Momentum: slope of last 20 closes, normalized to % per week
    recent = closes[-20:] if len(closes) >= 20 else closes
    x = np.arange(len(recent), dtype=float)
    slope, _ = np.polyfit(x, recent, 1)
    price = float(closes[-1])
    momentum = float(slope * 5 / price) if price > 0 else 0.0

    # Volatility: annualized std of daily log returns (last 20 days)
    log_ret = np.diff(np.log(closes[-21:])) if len(closes) >= 2 else np.array([0.0])
    volatility = float(np.std(log_ret) * np.sqrt(252))

    return PriceHistoryResponse(
        commodity=commodity,
        ticker=ticker,
        period=period,
        bars=bars,
        sma_20=sma20,
        sma_50=sma50,
        current_price=round(price, 4),
        momentum_weekly_pct=round(momentum, 5),
        volatility_ann=round(volatility, 4),
    )


@app.post("/analyze", response_model=AnalyzeResponse)
def analyze(req: AnalyzeRequest):
    log.info("/analyze commodity=%s qty=%.0f farm=%r buyers=%s",
        req.commodity, req.quantity_bu, req.farm_address,
        [b.address for b in req.buyers])

    # ── (1) Feature Engineering Layer ─────────────────────────────────────────
    # Fetch all external data and assemble into a model-ready FeatureSet.
    features = build_features(req.commodity, req.farm_address)

    # ── (2) Distances ──────────────────────────────────────────────────────────
    distances = get_distances(req.farm_address, [b.address for b in req.buyers])
    log.info("/analyze distances=%s (Google Maps or geopy fallback)", distances)

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
    closest_distance = min(distances)
    fair_price = calc_fair_price(
        features=features,
        quantity_bu=req.quantity_bu,
        best_local_bid=best_buyer.bid_per_bu,
        closest_buyer_distance_miles=closest_distance,
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
            farm_state=features.farm_state,
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
