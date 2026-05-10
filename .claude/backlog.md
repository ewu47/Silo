# backlog.md — Silo Task Backlog

> Prioritized checklist. P0 = must have for demo | P1 = should have | P2 = nice to have

---

## Done

- [x] Confirm all external APIs work (USDA, yfinance, NOAA, FRED)
- [x] Google Maps fallback — geopy straight-line × 1.25 road factor
- [x] FastAPI backend — `/health`, `/market`, `/analyze`, `/history/{commodity}`, `/nearby`
- [x] Pydantic models for all request/response shapes
- [x] All constants centralized in `backend/constants.py`
- [x] Full quantitative engine: fair_price, transport, storage, scenarios, MPI, features
- [x] All fetchers with fallbacks: yfinance, FRED, NOAA, geopy, USDA, RSS news
- [x] Next.js frontend scaffolded with shadcn/ui, Recharts, react-hook-form + Zod, framer-motion, KaTeX
- [x] Market dashboard — live futures quotes, diesel, T-bill, weather, ag headlines
- [x] Analyze form — crop, quantity, farm address, up to 5 buyers, storage toggle, urgency
- [x] Buyer comparison table — gross revenue, transport cost, net revenue per buyer
- [x] Scenario cards — Sell Now / Wait 1 Week / Wait 1 Month / Store & Hedge with EV, range, confidence
- [x] Scenario EV chart — zoomed bar + error whiskers, recommended reference line
- [x] Fair price analysis panel
- [x] Market signals panel (MPI, basis, volatility, weather risk)
- [x] LLM explanation panel (Gemini 2.0 Flash interprets structured JSON)
- [x] Price history chart — OHLCV + SMA20/SMA50
- [x] **Methodology page (Page 3)** — KaTeX formulas, animated flow/fan-in graphs (framer-motion), green highlights, all 4 models + data sources documented
- [x] **Nearby elevator lookup** — `GET /nearby`, geocodes farm address via Nominatim, returns elevators within 50mi from static Midwest dataset; sidebar shows results with "+ Add" to prefill buyer row
- [x] **Graph zoom** — drag-to-zoom (ReferenceArea selection) + Brush scrubber on price history chart; "Reset zoom" button; period buttons reset zoom
- [x] **Layout fix** — content now extends full width (removed max-w-5xl)
- [x] **Font/spacing bump** — sidebar wider (w-80), inputs taller, section spacing improved

---

## P0 — Before Demo

- [ ] Fix Google Maps key (enable billing) — geopy fallback is live but driving distance is more accurate
- [ ] Deploy backend to Railway, frontend to Vercel — end-to-end on live URLs
- [ ] Verify all API keys set in production env (FRED, USDA, Gemini, Google Maps)

---

## P1 — Remaining Quality

- [ ] Basis movement chart (cash vs. futures, 30 days)
- [ ] Seasonal tendency indicator ("IL soybeans this time of year: historically +2.8% over 2 weeks")
- [ ] LLM response streams word-by-word
- [ ] Split strategy suggestion ("sell 50% now, store 50%")
- [ ] Scenario deep-dive: show full calculation breakdown for a clicked scenario

---

## P2 — Polish

- [ ] Confidence badge color-coding on scenario cards
- [ ] Error states handled gracefully — no crashes, just inline notices
- [ ] PDF export of the analysis

---

## Post-Hackathon

- [ ] User auth + saved analyses
- [ ] Multi-region / multi-crop UI controls
- [ ] Live grain elevator bid integrations
- [ ] Mobile app
- [ ] Model backtesting dashboard
- [ ] Bid alert / notification system
