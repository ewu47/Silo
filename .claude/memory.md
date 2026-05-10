# memory.md — Silo Decisions & Lessons

> Running log of decisions made and things learned. Append as the project evolves.
> Don't delete entries — mark superseded ones with ~~strikethrough~~ and a note.

---

## The Pivot

We originally planned a "price fairness detector" — identifying when farmers were being underpaid. After talking to domain experts (working farmers), we realized commodity prices are already anchored to public CME/CBOT futures, so the fairness framing was economically naive. Large operators don't have more pricing power — they have better decision infrastructure.

Reframed to: a **sale optimization engine**. Same public data, different question — not "are you being cheated?" but "what's your best move right now?"

---

## Architecture Decisions

**LLM is an interpreter, not a calculator.**
The AI layer (Gemini 2.0 Flash) receives structured JSON from the quantitative engine and explains it. It never generates prices. This is the core architectural principle — judges will probe it.

**Outputs are probabilistic ranges, not predictions.**
Scenario outputs show expected-value ranges derived from historical basis volatility. Always include confidence labels and range bounds.

**Multi-buyer comparison is the core use case.**
The most resonant insight from user research: "should I drive farther for a better bid?" Lead with this in the demo.

**Farm address as origin, buyer addresses as destinations.**
Distance is never a manual input. Google Maps Distance Matrix computes driving distance (needs billing enabled). Active fallback: geopy straight-line × 1.25 road factor.

**Nearby elevator lookup uses a static dataset + Nominatim.**
No free live elevator-bid API exists. Static dataset of ~30 Midwest elevator locations geocoded against the farmer's address via OpenStreetMap/Nominatim (no API key). Returns elevators within 50mi, farmer still enters bids manually. Served at `GET /nearby`.

**Regional routing, not Illinois-only.**
Farm address is geocoded to a state on every `/analyze` call. USDA pulls state-specific cash bid reports (IL, IA, IN, OH, MN have preferred slugs; others use scored dynamic search). Diesel uses PADD regional series from FRED (no separate EIA key). Corn/wheat are commodity config swaps (different ticker).

**No Zustand — local state is enough.**
The app is a single-page form + results display. useState + react-hook-form covers it.

**`/market` endpoint is the homepage.**
Live market dashboard (futures quotes, diesel, weather, ag headlines). No farmer input required.

---

## What's Been Built (as of 2026-05-10)

**Backend**
- Full quantitative engine: features, fair_price, transport, storage, scenarios, MPI
- All fetchers with fallbacks: yfinance, FRED, NOAA, geopy, USDA, RSS news, nearby_elevators, location
- FastAPI endpoints: `/health`, `/market`, `/analyze`, `/history/{commodity}`, `/nearby`
- All Pydantic models, constants centralized in `backend/constants.py`
- **Regional data routing**: farm address geocoded to state via `fetchers/location.py`; state routes FRED PADD diesel series and USDA state-specific report selection
- **Formula audit fixes**: MPI inventory signal inversion fixed; seasonal std widened with `sqrt(n_weeks)`; storage uses compound expected return; fair price weather always bullish; `C_transport_ref` uses actual closest-buyer distance + live diesel rate

**Frontend**
- Market dashboard, analyze form, buyer comparison, scenario cards, price history chart
- Fair price panel, market signals panel, storage analysis panel, LLM explanation panel
- **Scenario EV chart** — zoomed bar + error whiskers (not 3 separate bars), recommended reference line
- **Methodology page (Page 3)** — KaTeX-rendered formulas, animated flow/fan-in graphs via framer-motion, selective green highlights, all 4 models + data sources documented
- **Nearby elevator lookup** — "Find nearby elevators" button geocodes farm address, shows results in sidebar with distance + "+ Add" to prefill buyer rows
- **Chart zoom** — drag-to-zoom (ReferenceArea) + Brush scrubber on price history chart; period buttons reset zoom
- **Layout/UX** — full-width content (no max-w cap), wider sidebar (w-80), larger inputs, better spacing

**Packages added:** `katex`, `react-katex`, `@types/react-katex`, `framer-motion`

---

## API Findings (from data_exploration.ipynb)

- **USDA**: confirmed working. Auth is HTTP Basic (API key as username, blank password). `/reports` returns 1049 real reports. Slug IDs must be read from that list.
- **yfinance**: confirmed working for `ZS=F`, `ZC=F`, `ZW=F`. Prices in cents/bu. Forward contract tickers (e.g. `ZSN26.CBT`) return no data — front-month only.
- **NOAA NWS**: confirmed working, no key needed.
- **FRED**: confirmed working. Diesel at ~$5.64/gal, T-bill at ~3.61%.
- **Google Maps**: `REQUEST_DENIED` — billing not enabled on current key. Fallback is geopy × 1.25.
- **Cash bids by location**: no free programmatic source exists. Farmer inputs bid manually. USDA IL average used as regional benchmark only.

---

## Lessons

- Talk to domain experts before architecting. The original framing was wrong and would have been caught immediately by any farmer or ag economist.
- Probabilistic output framing is stronger than predictive for technical judges — it shows you understand the problem's complexity.
- Don't over-engineer the memory files before the build starts. Keep them flexible until real decisions get made in code.
