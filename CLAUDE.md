# CLAUDE.md — Silo

> Ground rules for building this project.

---

## What We're Building

**Silo** — a commodity sale optimization engine for small and midsize grain farmers.

A farmer inputs their selling situation. Silo runs quantitative analysis across scenarios (which buyer nets the most after transport, is storage worth it, is waiting worth it) and returns probabilistic, expected-value recommendations. An AI layer interprets the outputs in plain English — it never generates the numbers itself.

---

## Tech Stack (Actual, as built)

**Frontend:** Next.js 14, TailwindCSS, Recharts, react-hook-form + Zod, lucide-react, shadcn/ui components, framer-motion, KaTeX (react-katex)
- No Zustand — local state via useState/useForm is sufficient
- Single-page app (`src/app/page.tsx`). Market dashboard + analyze form on one page, Methodology as a tab.
- `MarketChart.tsx` — Recharts candlestick/SMA chart with drag-to-zoom (ReferenceArea) + Brush scrubber
- `MethodologyTab.tsx` — KaTeX formulas, animated flow/fan-in graphs (framer-motion), green highlights

**Backend:** FastAPI (Python), Pydantic v2, httpx, yfinance, geopy, feedparser
- `backend/main.py` — five endpoints: `GET /health`, `GET /market`, `POST /analyze`, `GET /history/{commodity}`, `GET /nearby`
- `backend/models.py` — all Pydantic models
- `backend/constants.py` — all magic numbers in one place (transport rates, storage costs, fallbacks, MPI weights)
- `backend/engine/` — quantitative models (fair_price, transport, storage, scenarios, mpi, features)
- `backend/fetchers/` — external API wrappers (futures, fred, weather, distance, usda, news)
- `backend/llm.py` — Claude interpretation layer

**Data:**
- **yfinance** — CBOT futures for soybeans (`ZS=F`), corn (`ZC=F`), wheat (`ZW=F`). Prices in cents/bu, divide by 100. ✓ working.
- **USDA Market News API** (`marsapi.ams.usda.gov/services/v1.2`) — cash bid reports. Auth: HTTP Basic (API key as username, blank password). Real slug IDs must be read from `/reports` — do not guess them. ✓ working.
- **NOAA NWS** (`api.weather.gov/points/{lat},{lon}`) — 7-day forecast, no key needed. ✓ working.
- **FRED** (`api.stlouisfed.org/fred/series/observations`) — diesel (`GASDESW`) and T-bill rate (`DTB3`). ✓ working.
- **Google Maps Distance Matrix** — `REQUEST_DENIED` on current key (billing not enabled). Active fallback: geopy straight-line × 1.25 road factor.
- **RSS/news fetcher** — feedparser pulling ag headlines (DTN, USDA, etc.) for market dashboard.
- **Cash bid by location**: no free programmatic source exists. Farmer inputs bid manually. USDA IL average used as regional benchmark only.
- **Nearby elevators**: no live API exists. `GET /nearby` geocodes the farm address via Nominatim (OpenStreetMap, no key) and filters a static dataset of ~30 Midwest elevator locations by radius (default 50mi). Farmer still enters bids manually.

**AI:** Google Gemini API (`gemini-2.0-flash`) — interpretation only, never price generation.

**Deploy:** Vercel (frontend) + Railway (FastAPI backend)

---

## Folder Structure

```
silo/
├── backend/
│   ├── main.py              # FastAPI app + all route handlers
│   ├── models.py            # Pydantic request/response models
│   ├── constants.py         # All numeric constants
│   ├── llm.py               # Claude interpretation layer
│   ├── engine/
│   │   ├── features.py      # FeatureSet dataclass + build_features()
│   │   ├── fair_price.py    # Fair price model
│   │   ├── transport.py     # Transport cost + buyer comparison
│   │   ├── storage.py       # Storage value + hedge EV
│   │   ├── scenarios.py     # Decision simulation (sell/wait/store_hedge)
│   │   └── mpi.py           # Market Pressure Index
│   └── fetchers/
│       ├── futures.py           # yfinance wrapper
│       ├── fred.py              # FRED diesel + T-bill
│       ├── weather.py           # NOAA NWS
│       ├── distance.py          # Google Maps / geopy fallback
│       ├── usda.py              # USDA Market News API
│       ├── news.py              # RSS ag news headlines
│       └── nearby_elevators.py  # Nominatim geocode + static elevator dataset
└── frontend/
    └── src/
        ├── app/
        │   ├── page.tsx         # Main app page (market dashboard + analyze form)
        │   └── MarketChart.tsx  # Recharts price history chart
        ├── components/ui/       # shadcn/ui components
        └── lib/
            ├── api.ts           # API client + mock responses
            └── types.ts         # TypeScript types
```

---

## Quantitative Engine — Model Summary

### Fair Price Model
`P_fair = P_futures + B_region + A_season + W_weather - C_transport_ref`
- `B_region`: regional basis (cash − futures), from USDA or fallback
- `A_season`: seasonal timing adjustment = `P_futures × seasonal_4w_return`
- `W_weather`: supply shock premium = `disruption_index × $0.30/bu × direction`
- `C_transport_ref`: reference transport cost at 15-mile standard buyer
- Uncertainty range: ±1σ using `sqrt(basis_std² + seasonal_std_dollars²)`
- Mispricing: `M = (P_fair - P_local) / P_fair`

### Transport Model
`C_transport = d × (FIXED + FUEL_SCALE × (diesel / DIESEL_REFERENCE)) × Q`
- `FIXED = $0.030/bu/mile`, `FUEL_SCALE = $0.012/bu/mile`, `DIESEL_REFERENCE = $3.80/gal`
- At reference diesel ≈ $0.042/bu/mile total (industry benchmark)
- Transport arbitrage: `V_transport = net_this_buyer - net_nearest_buyer`

### Storage / EV Model
`V_storage = E[P_future] - P_current - C_storage`
- On-farm: `$0.015/bu/month`; commercial: `$0.040/bu/month`
- Opportunity cost: T-bill rate on deferred cash
- `EV(store_hedge)`: lock futures price, hold physical grain

### Scenario Simulation
`EV(a) = E[R(a)] - C(a) - Risk(a)` for each action
- `E[R(a)]`: `best_net × (1 + seasonal_return + momentum_contribution)`
- `Risk(a)`: `1.5σ × Q` (downside spread proxy)
- Scenarios: `sell_now` (per buyer), `wait_1_week`, `wait_1_month`, `store_hedge`

### Market Pressure Index (MPI)
`MPI = Σ w_i × X_i` — five signals, each normalized to [−1, +1]
| Signal | Weight | Source |
|---|---|---|
| `X1` futures momentum | 0.30 | yfinance slope |
| `X2` inventory imbalance | 0.25 | basis deviation proxy |
| `X3` export demand | 0.10 | momentum × basis concordance |
| `X4` basis widening | 0.20 | regional basis vs historical norm |
| `X5` weather disruption | 0.15 | NOAA NWS disruption index |
- Thresholds: `≥ 0.15` → bullish, `≤ −0.15` → bearish, else neutral
- Rate overlay: `tbill > 5%` → −0.10 penalty

---

## Core Rules

- The LLM never computes prices. It receives structured JSON from the engine and explains it.
- All outputs are probabilistic ranges, not point predictions. No "the price will be X."
- Every external API needs a fallback. The demo cannot crash because one data source is down.
- Ship the demo path first. Ask every hour: "can a judge see this working right now?"

---

## Preferences

- TypeScript on the frontend, type hints on the backend
- Small functions, single responsibility
- Icons via lucide-react
- Constants in `backend/constants.py` — never scattered inline
- Farmer's address and buyer addresses as inputs — Google Maps computes driving distance (or geopy fallback)

---

## Methodology Page (Page 3) — Built

A third tab accessible from the main nav. Goal: farmer trust — show the math, don't just ask them to trust the output.
- KaTeX-rendered block formulas for all four models
- Animated flow graphs (framer-motion, triggered on scroll) showing computation pipelines
- Fan-in graph for MPI showing all 5 signals aggregating into the score
- Selective green (`emerald-50`) highlights on key phrases — not overused
- Data sources table with fallback values
- Disclaimer banner at the bottom

---

## Commodities in Scope

Corn, soybeans, and wheat. All use the same engine — only the futures ticker and USDA report slug differ per commodity.
