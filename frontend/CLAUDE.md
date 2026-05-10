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

## Backend contract

The frontend calls three backend endpoints:
- `GET /market?location=...` → `MarketContextResponse`
- `POST /analyze` → `AnalyzeResponse`
- `GET /history/{commodity}?period=...` → `PriceHistoryResponse`

All types in `src/lib/types.ts` must stay in sync with `backend/models.py`.
