# Silo

**Silo** is a commodity sale optimization engine for small and midsize grain farmers. A farmer describes their selling situation — crop, quantity, farm location, buyer bids, and storage options — and Silo runs quantitative analysis across scenarios (sell now, wait, store + hedge) to surface expected-value recommendations. An AI layer interprets those outputs in plain English; it never generates the numbers itself.

**Commodities:** corn, soybeans, wheat.

---

## Features

- **Market dashboard** — live CBOT futures, regional diesel, T-bill rate, weather risk, and USDA grain headlines
- **Sale analysis** — fair price model, buyer comparison after transport, storage value, scenario simulation, Market Pressure Index (MPI)
- **Methodology tab** — KaTeX formulas and animated model diagrams for transparency
- **Price history chart** — OHLCV + SMA with drag-to-zoom
- **Nearby elevators** — geocoded search against a Midwest elevator dataset (bids still entered manually)
- **User accounts** (optional) — Supabase auth for saved profiles, analysis history, and basis alerts

---

## Architecture

```
Farmer input (Next.js)
        │
        ▼
   FastAPI backend
        │
        ├── Fetchers ──► yfinance, USDA, FRED, NOAA NWS, Nominatim, Google Maps (optional)
        │
        ├── Quant engine ──► fair price, transport, storage, scenarios, MPI
        │
        └── Gemini ──► plain-English interpretation (numbers come from the engine only)
```

Every external data source has a fallback so the demo path keeps working when an API is down or a key is missing.

---

## Tech stack

| Layer | Stack |
|---|---|
| Frontend | Next.js, TypeScript, Tailwind CSS, shadcn/ui, Recharts, react-hook-form + Zod, framer-motion, KaTeX |
| Backend | FastAPI, Pydantic v2, httpx, yfinance, geopy, pandas, numpy |
| AI | Google Gemini (`gemini-2.0-flash`) — interpretation only |
| Auth & persistence | Supabase (profiles, saved analyses, basis alerts) |
| Deploy | Vercel (frontend) + Railway (backend) |

---

## Local development

### Prerequisites

- Python 3.11+
- Node.js 20+
- API keys (see below) — core analysis works with fallbacks when keys are absent; Supabase is only needed for authenticated features

### Backend

From the repository root:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt

# Create a .env file at the repo root (python-dotenv loads it on startup)
# See "Environment variables" below for required keys

uvicorn backend.main:app --reload --port 8000
```

API docs: [http://localhost:8000/docs](http://localhost:8000/docs)

### Frontend

```bash
cd frontend
npm install

# frontend/.env.local
# NEXT_PUBLIC_API_URL=http://localhost:8000
# NEXT_PUBLIC_SUPABASE_URL=...
# NEXT_PUBLIC_SUPABASE_ANON_KEY=...

npm run dev
```

App: [http://localhost:3000](http://localhost:3000)

---

## Environment variables

### Backend (`backend/.env` or repo-root `.env`)

| Variable | Required | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | No | LLM explanations; falls back to template text |
| `FRED_API_KEY` | No | Regional diesel + T-bill; falls back to static values |
| `USDA_API_KEY` | No | Cash bid reports + ag headlines; falls back to defaults |
| `GOOGLE_MAPS_API_KEY` | No | Driving distances; falls back to geopy straight-line × 1.25 |
| `SUPABASE_URL` | For auth routes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | For auth routes | Server-side Supabase access |

On startup the backend logs which keys are present.

### Frontend (`frontend/.env.local`)

| Variable | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | Backend base URL |
| `NEXT_PUBLIC_SUPABASE_URL` | — | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | — | Supabase anon key for client auth |

---

## API reference

### Public endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `GET` | `/market?location=...` | Futures quotes, diesel, T-bill, weather, headlines |
| `POST` | `/analyze` | Full sale optimization analysis |
| `GET` | `/history/{commodity}?period=6mo` | OHLCV price history + SMAs |
| `GET` | `/nearby?address=...&radius=50` | Nearby elevators from static dataset |
| `GET` | `/validate-address?address=...` | Geocode check via Nominatim |
| `GET` | `/calendar/{commodity}` | Seasonal price pattern calendar |

### Authenticated endpoints (Bearer JWT from Supabase)

| Method | Path | Description |
|---|---|---|
| `GET` / `PUT` | `/profile` | Farm address and preferred commodity |
| `GET` / `POST` / `DELETE` | `/analyses` | Saved analysis history |
| `GET` / `POST` / `DELETE` | `/alerts/basis` | Basis threshold alerts |
| `POST` | `/alerts/basis/check` | Evaluate alerts against current market |

---

## Quantitative models (summary)

**Fair price:** `P_fair = P_futures + B_region + A_season + W_weather − C_transport_ref`

**Transport:** `C = d × (FIXED + FUEL_SCALE × diesel/ref) × Q` — compares net revenue across buyers

**Storage:** `V_storage = E[P_future] − P_current − C_storage` — on-farm vs commercial, optional store+hedge EV

**Scenarios:** expected value for sell now (per buyer), wait 1 week, wait 1 month, store + hedge

**MPI:** weighted blend of futures momentum, inventory/basis, export demand proxy, basis widening, and weather disruption

Full formulas and data-source notes live in the **Methodology** tab in the app and in [`CLAUDE.md`](CLAUDE.md).

---

## Data sources

| Source | Data | Key? |
|---|---|---|
| [yfinance](https://github.com/ranaroussi/yfinance) | CBOT futures (`ZC=F`, `ZS=F`, `ZW=F`) | No |
| [USDA Market News API](https://marsapi.ams.usda.gov) | Regional cash bids, grain headlines | Yes |
| [FRED](https://fred.stlouisfed.org) | PADD regional diesel, 3-month T-bill | Yes |
| [NOAA NWS](https://api.weather.gov) | 7-day forecast, disruption index | No |
| [Nominatim](https://nominatim.org) | Geocoding (farm state, nearby search) | No |
| Google Maps Distance Matrix | Driving distance to buyers | Yes (optional) |

Cash bids at a specific elevator are entered manually — no free programmatic source exists for location-specific bids.

---

## Project structure

```
silo/
├── backend/
│   ├── main.py              # FastAPI app + core routes
│   ├── models.py            # Pydantic request/response models
│   ├── constants.py         # Transport rates, MPI weights, fallbacks
│   ├── llm.py               # Gemini interpretation layer
│   ├── engine/              # Fair price, transport, storage, scenarios, MPI
│   ├── fetchers/            # External API wrappers
│   └── routers/             # Profile, analyses, alerts, calendar
└── frontend/
    └── src/
        ├── app/             # Pages (dashboard, profile, calendar)
        ├── components/      # UI + MethodologyTab, MarketChart
        └── lib/             # API client, types, Supabase
```

---

## Deployment

- **Frontend:** deploy `frontend/` to Vercel; set `NEXT_PUBLIC_API_URL` to the production backend URL and Supabase public keys.
- **Backend:** deploy to Railway (or any Python host); run `uvicorn backend.main:app --host 0.0.0.0 --port $PORT` from the repo root; configure all backend env vars.

---

## Disclaimer

Silo provides probabilistic, model-based analysis — not financial advice. Outputs are ranges and expected values, not point predictions. Farmers should verify bids and contracts with their buyers before making sale decisions.
