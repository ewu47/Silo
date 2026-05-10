# restart.md — Silo: Where We Are

> Read this first when resuming. Then read CLAUDE.md and memory.md.

---

## Status

**Data exploration complete. Ready to build.**

All APIs tested and confirmed. No code written yet beyond the exploration notebook.

---

## What We're Doing Next

Scaffold and build in this order:

1. **Monorepo scaffold** — Next.js 14 frontend + FastAPI backend
2. **Data fetchers** — async fetchers for yfinance, USDA, NOAA, FRED with static fallbacks
3. **Quantitative engine** — transport net revenue → storage value → wait scenario EV
4. **`POST /analyze` endpoint** — takes farmer input, returns structured JSON
5. **Frontend input form** — crop, quantity, farm address, up to 3 buyers (name + bid + address)
6. **Frontend results dashboard** — buyer comparison table, scenario cards, LLM explanation panel
7. **LLM interpretation layer** — Claude receives structured JSON, explains in plain English
8. **Deploy** — Railway (backend) + Vercel (frontend)

---

## Commodities in Scope

Corn, soybeans, wheat. All three use the same engine. Only differs by:
- Futures ticker: `ZS=F` / `ZC=F` / `ZW=F`
- USDA report slug (read from `/reports` list, not hardcoded)

---

## Key API Notes

- **USDA auth**: HTTP Basic, API key as username, blank password
- **Cash bids**: no free programmatic source — farmer inputs bid manually; USDA IL average shown as benchmark
- **Google Maps**: current key returns `REQUEST_DENIED` (billing issue) — use geopy straight-line as fallback until fixed
- **yfinance forward contracts**: only front-month (`ZS=F` etc.) works — named contract tickers return no data

---

## The Demo Scenario

- Crop: Soybeans, 42,000 bu, Farm: Springfield IL
- Buyer A: Local elevator, $11.42/bu, close by
- Buyer B: Springfield Co-op, $11.61/bu, ~28 miles away
- Storage available, medium urgency

Expected: Buyer B wins on net revenue after hauling. The delta is the headline number.

---

## LLM System Prompt (ready to use)

```
You are Silo's explanation engine. You receive structured quantitative outputs from a commodity sale optimization model and translate them into clear, plain-English explanations for grain farmers.

Rules:
1. Never compute prices, percentages, or dollar amounts. Use only the numbers in the input JSON.
2. Don't give financial advice. Explain what the model found.
3. Always include a confidence qualifier and a risk statement.
4. Write simply. Max 5 sentences. Lead with the most actionable insight.
5. Say "the analysis suggests" not "I recommend."
```
