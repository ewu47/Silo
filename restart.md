# restart.md — Silo: Where We Are

> Read this first when resuming. Then read CLAUDE.md and memory.md.

---

## Status

Planning complete. No code written yet.

Two documents produced so far:
- A full PRD (v1, price fairness framing — superseded but formulas still valid)
- A project scope PDF (v2, current direction — sale optimization engine)

---

## What We're Doing Next

Scaffolding the project and building the quantitative engine. Before any app code, we need to:

1. Confirm the USDA Market News API actually returns usable Illinois soybean cash bid data — this is the biggest unknown and gates everything else
2. Confirm yfinance returns live CBOT futures (ZS=F for soybeans)
3. Scaffold the monorepo: Next.js frontend + FastAPI backend
4. Build the transport net revenue calculation first — it's the simplest and most demo-critical formula
5. Build the storage and wait scenario models
6. Wire up the `/analyze` endpoint
7. Build the frontend input form and results dashboard
8. Add the LLM explanation layer last

---

## The Demo Scenario

Use this for testing everything:

- Crop: Soybeans, 42,000 bu, Farm: Springfield IL
- Buyer A: Local elevator, $11.42/bu, close by
- Buyer B: Springfield Co-op, $11.61/bu, ~28 miles away
- Storage available, medium urgency

Expected: Buyer B wins on net revenue after hauling. The delta should be the headline number.

---

## Biggest Risks Right Now

- USDA API reliability is unknown — may need to find an alternative cash price source
- Seasonal tendency data (historical basis patterns) needs to be precomputed before the build session — don't leave this for during the hackathon
- Google Maps API quota could be an issue — geopy ZIP centroid distance is the fallback

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
