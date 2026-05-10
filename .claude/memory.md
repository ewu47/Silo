# memory.md — Silo Decisions & Lessons

> Running log of decisions made and things learned. Append as the project evolves.
> Don't delete entries — mark superseded ones with ~~strikethrough~~ and a note.

---

## The Pivot

We originally planned a "price fairness detector" — identifying when farmers were being underpaid. After talking to domain experts (working farmers), we realized commodity prices are already anchored to public CME/CBOT futures, so the fairness framing was economically naive. Large operators don't have more pricing power — they have better decision infrastructure.

Reframed to: a **sale optimization engine**. Same public data, different question — not "are you being cheated?" but "what's your best move right now?"

---

## Decisions

**LLM is an interpreter, not a calculator.**
The AI layer receives structured JSON from the quantitative engine and explains it. It never generates prices. This is the core architectural principle — judges will probe it, and it's the honest approach.

**Outputs are probabilistic ranges, not predictions.**
We don't predict commodity prices. Scenario outputs show expected-value ranges derived from historical basis volatility. Always include confidence labels and range bounds.

**Multi-buyer comparison is the core use case.**
The most resonant insight from user research: "should I drive farther for a better bid?" It's concrete, computable, and has a specific dollar answer. Lead with this in the demo.

**Farm address as origin, buyer addresses as destinations.**
Distance should never be a manual input. Google Maps Distance Matrix computes driving distance from the farmer's address to each buyer's address in one API call.

**Illinois soybeans as the demo scope.**
Scopes the data calls without hardcoding logic. Corn/wheat are config swaps (ticker string + USDA region code). Other states are a region code change.

---

## Lessons

- Talk to domain experts before architecting. The original framing was wrong and would have been caught immediately by any farmer or ag economist.
- Probabilistic output framing is stronger than predictive for technical judges — it shows you understand the problem's complexity.
- Don't over-engineer the memory files before the build starts. Keep them flexible until real decisions get made in code.

---

## API Findings (from data_exploration.ipynb)

- **USDA**: confirmed working. Auth is HTTP Basic (API key as username, blank password). `/reports` returns 1049 real reports. Slug IDs must be read from that list.
- **yfinance**: confirmed working for `ZS=F`, `ZC=F`, `ZW=F`. Prices in cents/bu. Forward contract tickers (e.g. `ZSN26.CBT`) return no data via yfinance — front-month only.
- **NOAA NWS**: confirmed working, no key needed.
- **FRED**: confirmed working. Diesel at ~$5.64/gal, T-bill at ~3.61%.
- **Google Maps**: `REQUEST_DENIED` — billing likely not enabled on current key. Fallback is geopy.
- **Cash bids by location**: no free programmatic source exists. Farmer inputs bid manually. USDA IL average used as regional benchmark only.

## Resolved Questions

- ~~Which USDA endpoint returns IL cash bids?~~ — real slugs must be pulled from `/reports` list, not guessed.
- ~~If USDA is unreliable, what's the fallback?~~ — USDA works; cash bid is a manual input anyway.
- Should the LLM re-prompt when a farmer clicks a specific scenario card, or explain all scenarios in one pass? (still open)
