# CLAUDE.md — Silo

> Ground rules for building this project. Keep this loose until the build stabilizes.

---

## What We're Building

**Silo** — a commodity sale optimization engine for small and midsize grain farmers.

A farmer inputs their selling situation. Silo runs quantitative analysis across scenarios (which buyer nets the most after transport, is storage worth it, is waiting worth it) and returns probabilistic, expected-value recommendations. An AI layer interprets the outputs in plain English — it never generates the numbers itself.

---

## Tech Stack (Current Plan)

**Frontend:** Next.js 14, TailwindCSS, Recharts, Zustand, Zod

**Backend:** FastAPI (Python), Pandas, NumPy, Pydantic, httpx

**Data:**
- **yfinance** — CBOT futures for soybeans (`ZS=F`), corn (`ZC=F`), wheat (`ZW=F`). Prices in cents/bu, divide by 100. ✓ confirmed working.
- **USDA Market News API** (`marsapi.ams.usda.gov/services/v1.2`) — cash bid reports. Auth: HTTP Basic with API key (username=key, password empty). `/reports` returns 1049 reports. Real slug IDs must be read from that list — do not guess them. ✓ confirmed working.
- **NOAA NWS** (`api.weather.gov/points/{lat},{lon}`) — 7-day forecast, no key needed. ✓ confirmed working.
- **FRED** (`api.stlouisfed.org/fred/series/observations`) — diesel (`GASDESW`) and T-bill rate (`DTB3`). Free with API key. ✓ confirmed working.
- **Google Maps Distance Matrix** — `REQUEST_DENIED` on current key; needs billing enabled or key fix. Fallback: geopy straight-line distance.
- **Cash bid by location**: no free programmatic source exists. Farmer inputs their bid manually. USDA provides IL regional average as a benchmark reference only.

**AI:** Anthropic Claude API (`claude-sonnet-4-6`) — interpretation only, never price generation

**Deploy:** Vercel (frontend) + Railway (FastAPI backend)

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
- Constants in one file, not scattered inline
- Farmer's address and buyer addresses as inputs — Google Maps computes driving distance, farmer doesn't enter it manually

---

## Commodities in Scope

Corn, soybeans, and wheat. All use the same engine — only the futures ticker and USDA report slug differ per commodity.

---

## What to Update Here

Add things as they get decided during the build — folder structure, new libraries, API choices, anything that a fresh session would need to know to not repeat past mistakes.
