@AGENTS.md

# Frontend — Silo

Next.js 14 app. TypeScript throughout. TailwindCSS + shadcn/ui components.

## Structure

```
src/
├── app/
│   ├── page.tsx         # Main page: market dashboard + analyze form + results
│   ├── layout.tsx
│   └── MarketChart.tsx  # Recharts OHLCV + SMA price history chart
├── components/ui/       # shadcn/ui (Button, Input, Select, Slider, Separator, etc.)
└── lib/
    ├── api.ts           # fetch wrappers + MOCK_RESPONSE / MOCK_MARKET fallbacks
    └── types.ts         # TypeScript types mirroring backend Pydantic models
```

## Pages

- **Page 1:** Market dashboard (`/market` endpoint data) — live futures, diesel, weather, news
- **Page 2:** Analysis form + results — buyer comparison, scenarios, fair price, LLM explanation
- **Page 3:** Methodology — KaTeX-rendered formulas for all 4 models, animated flow/fan-in graphs (framer-motion), data sources table, disclaimer banner

## Key conventions

- Icons: lucide-react only
- Forms: react-hook-form + Zod validation
- Charts: Recharts (`BarChart` for scenarios, `ComposedChart` for price history)
- API base URL: `NEXT_PUBLIC_API_URL` env var, defaults to `http://localhost:8000`
- Mock responses in `api.ts` — used when backend is unreachable, never in prod

## Ag headlines (MarketTab)

- `headlines` is separate `useState` from `ctx` (prices/weather), initialized from `MOCK_MARKET.headlines`
- Only replaced when the API returns items with valid `https://` links — price refreshes never wipe the news panel
- Headlines without a real link render as plain `<div>` (no `<a>`, no ExternalLink icon); headlines with a link get a clickable anchor opening in a new tab
- Links use `https://mymarketnews.ams.usda.gov/viewReport/{slug_id}` — real USDA report viewer URLs
- Mock headlines use real slug IDs (2711 Texas Grain Bids, 2714 Maryland Grain Bids, 2771 Montana Elevator Grain Bids)

## Backend contract

The frontend calls three backend endpoints:
- `GET /market?location=...` → `MarketContextResponse`
- `POST /analyze` → `AnalyzeResponse`
- `GET /history/{commodity}?period=...` → `PriceHistoryResponse`

All types in `src/lib/types.ts` must stay in sync with `backend/models.py`.
