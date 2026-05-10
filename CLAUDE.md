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

**Data:** USDA Market News API, yfinance (futures), NOAA Weather, FRED — all public/free. Google Maps Distance Matrix for farm-to-buyer driving distance (farm address as origin, buyer addresses as destinations).

**AI:** Anthropic Claude API (`claude-sonnet-4-20250514`) — interpretation only, never price generation

**Deploy:** Vercel (frontend) + Railway (FastAPI backend)

> Note: API availability is unconfirmed until we actually build. Expect to swap sources.

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

## What to Update Here

Add things as they get decided during the build — folder structure, new libraries, API choices, anything that a fresh session would need to know to not repeat past mistakes.
