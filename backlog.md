# backlog.md — Silo Task Backlog

> Loose prioritized checklist. Update freely as things change.
> P0 = must have for demo | P1 = should have | P2 = nice to have

---

## Before the Build Session

- [ ] Confirm USDA Market News API returns real Illinois soybean cash bids — test the endpoint manually
- [ ] Confirm yfinance returns live ZS=F futures data
- [ ] Precompute seasonal tendency lookup (5yr historical avg price change by week-of-year for IL soybeans) — don't leave this for during the hackathon
- [ ] Get API keys ready: Anthropic, Google Maps
- [ ] Scaffold monorepo: Next.js 14 + FastAPI

---

## P0 — Core Demo Path

**Data layer**
- [ ] Async fetchers for: yfinance (futures), USDA (cash bid), NOAA (weather), FRED (diesel + T-bill rate)
- [ ] Static fallbacks for all four — demo cannot crash if an API is down

**Quantitative engine**
- [ ] Transport net revenue: `(Bid × Qty) − (Distance × Qty × $0.042/bu/mile)`
- [ ] Storage value model: `E[P_future] − P_now − holding_cost`
- [ ] Wait scenario expected values + ranges (from seasonal lookup + MPI)
- [ ] Market Pressure Index (MPI)

**API**
- [ ] `POST /analyze` endpoint — takes farmer input, returns structured JSON with buyers, scenarios, market signals

**Frontend**
- [ ] Input form: crop, quantity, farm address, up to 3 buyers (name + bid + address), storage toggle, urgency, window
- [ ] Buyer comparison table: gross revenue, transport cost, net revenue, net $/bu per buyer
- [ ] Scenario cards: Sell Now / Wait 2 Weeks / Wait 1 Month — with expected value, range, confidence
- [ ] LLM explanation panel — streamed, labeled clearly as AI interpretation
- [ ] Futures trend chart (Recharts)
- [ ] Loading states with informative status messages

**Deploy**
- [ ] Backend on Railway, frontend on Vercel, end-to-end working on deployed URLs

---

## P1 — Presentation Quality

- [ ] Basis movement chart (cash vs. futures, 30 days)
- [ ] Weather / drought indicator widget (NOAA)
- [ ] Seasonal tendency indicator ("IL soybeans this time of year: historically +2.8% over 2 weeks")
- [ ] MPI direction label on dashboard (Bullish / Neutral / Bearish)
- [ ] Confidence badge on each scenario card (color-coded)
- [ ] LLM response streams word-by-word (not all at once)
- [ ] Error states handled gracefully — no crashes, just inline notices

---

## P2 — If Time Allows

- [ ] Corn support (swap ticker + USDA region, everything else stays the same)
- [ ] Split strategy suggestion ("sell 50% now, store 50%")
- [ ] Scenario deep-dive: show the full calculation breakdown for a clicked scenario
- [ ] PDF export of the analysis

---

## Post-Hackathon (Don't Touch During Build)

- [ ] User auth + saved analyses
- [ ] Multi-region / multi-crop UI controls
- [ ] Live grain elevator bid integrations
- [ ] Mobile app
- [ ] Model backtesting dashboard
- [ ] Bid alert / notification system
