# Gemini API pricing (snapshot)

Source: https://ai.google.dev/gemini-api/docs/pricing. Retrieved 2026-10-14 via WebFetch (page summarised by the fetch tool). USD per 1M tokens, paid tier.

## Standard

| Model | Input | Output (incl. thinking) | Cached input | Free tier |
|---|---|---|---|---|
| Gemini 4 Argon | $2.00 → $4.00 from Dec 1, 2026 | $10.00 → $20.00 | $0.10 → $0.20 | Not available |
| Gemini 3.8 Flash | $0.75 → $1.50 from Jan 1, 2027 | $3.75 → $7.50 | $0.075 → $0.15 | Free |
| Gemini 3.6 Flash | $0.75 → $1.50 from Jan 1, 2027 | $3.75 → $7.50 | $0.075 → $0.15 | Free |
| Gemini 3.5 Flash-Lite | $0.30 | $2.50 | $0.03 | Free |
| Gemini 3.1 Flash-Lite | $0.25 (text/image/video), $0.50 (audio) | $1.50 | $0.025 / $0.05 | Free |
| Gemini 3.1 Pro Preview | $2.00 (≤200k), $4.00 (>200k) | $12.00 / $18.00 | $0.20 / $0.40 | Not available |
| Gemini 2.5 Pro | $1.25 (≤200k), $2.50 (>200k) | $10.00 / $15.00 | $0.125 / $0.25 | Free |
| Gemma 4 | not on paid tier | — | — | Free |

## Batch and Flex (identical)

| Model | Input | Output | Cached input |
|---|---|---|---|
| Gemini 4 Argon | $1.00 → $2.00 | $5.00 → $10.00 | $0.05 → $0.10 |
| Gemini 3.8 Flash | $0.375 → $0.75 | $1.875 → $3.75 | $0.0375 → $0.075 |
| Gemini 3.5 Flash-Lite | $0.15 | $1.25 | $0.02 |
| Gemini 3.1 Flash-Lite | $0.125 | $0.75 | $0.0125 |

## Notes
- Gemini 4 Argon introductory prices run through Nov 30, 2026; double from Dec 1, 2026.
- Gemini 3.8 Flash and 3.6 Flash introductory prices run through Dec 31, 2026; double from Jan 1, 2027.
- Context cache storage per 1M tokens per hour: Flash-Lite $1.00; 3.1 Pro and 2.5 Pro $4.50; 3.8/3.6 Flash $0.50 → $1.00.

## Secondary reports (search, 2026-10-14, not verified on Google pages)
- Gemini 4 Argon announced 2026-09-30 as Google's frontier model for long-horizon software engineering, enterprise knowledge work and cyber defense.
- Access reports conflict: one says only vetted cyber defenders (Fairwind Program) as of 2026-10-11; others say generally available in the Gemini API as `gemini-4-argon` from 2026-10-13. The pricing page listing paid prices supports API availability.
- "Argon Flash": no product of that name found; the Flash line is Gemini 3.8 Flash.
