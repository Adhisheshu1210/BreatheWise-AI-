# BreatheWise AI — Intelligent Urban Air Quality, Smog Safety & Sustainable Living Assistant

**Challenge 6: Urban Air Quality Assistant**

BreatheWise AI converts urban air quality and weather intelligence into calm, practical, personalized daily actions for families, students, commuters, older adults, and communities navigating smog and air pollution.

---

## Problem Statement

Urban residents regularly encounter numerical AQI dashboards without clear guidance on what those numbers mean for their morning commute, children's outdoor play, home window ventilation, indoor cooking, or sustainable everyday habits. During winter smog episodes and traffic spikes, households need clear, trustworthy, non-alarmist answers to one practical question:

> *"What should I do today to protect myself and my family from the air pollution around me?"*

## Solution

BreatheWise AI pairs live environmental data from Open-Meteo (Copernicus CAMS atmospheric composition and weather feeds) with a centralized server-side Google Gemini AI recommendation engine and an offline-capable, explicitly labeled Demo Mode.

---

## Key Features

1. **Environmental Intelligence Dashboard**: Visual US EPA AQI & European EAQI gauge, Severe Smog Mode checklist, WHO 2021 pollutant breakdown (`PM2.5`, `PM10`, `NO₂`, `O₃`, `SO₂`, `CO`), weather context, data freshness indicators, and interactive `24h / 7d / 30d` trend visualizations.
2. **Location Search & Favorites**: Global city search via Open-Meteo Geocoding, explicit-permission browser geolocation, manual coordinate entry, saved favorites, recent locations, and 4 labeled Demo Mode presets.
3. **Regional Air Quality Map**: 9-point spatial sampling grid (`~26 km × 26 km`) inspecting local variation around your selected city.
4. **Smart Daily Air Quality & Activity Planner**: Schedule-aware daily routine with Gemini AI generation, inline activity editing, single-item swap, task completion tracking, and **Outdoor Activity Intelligence** + **Indoor Alternative Generator**.
5. **Protect My Family**: Optional, non-diagnostic household profiles (children, older adults, outdoor workers, respiratory sensitivity, pets) with morning/evening checklists and school commute guidance.
6. **AI Indoor Air Care Assistant**: Home profile builder generating room-by-room plans (`Bedroom`, `Living Room`, `Kitchen`, `Study Room`, `Children's Room`), daily/weekly/monthly checklists, and budget tiers (`₹0` through `₹5,000+`).
7. **Commute & Sustainable Living Assistants**: Transparent route/mode exposure comparison, habit targets, sustainable action score, and **Impact of My Choices** with explicit factor ranges and uncertainty notes.
8. **Personal Exposure Awareness Tracker**: Daily outdoor session logs, weekly visual summaries, JSON export, and deletion controls with clear non-medical caveats.
9. **BreatheWise AI Assistant & Explain My Air**: Context-aware conversational Gemini chat plus Beginner / Detailed / Family-Friendly structured pollution explanations.
10. **Community Action, Learning Center, Alerts & Settings**: Neighborhood checklists, 12-topic clean-air encyclopedia, in-app alert thresholds, accessibility toggles, and full browser data reset.

---

## Architecture

- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Lucide Icons, lazy-loaded workspace modules, `localStorage` persistence with reset/export.
- **Backend (`server.ts`)**: Express server running on port `3000` (compatible natively with Node 22+ `node server.ts` in production):
  - `server/airQualityProvider.ts`: Provider abstraction (`OpenMeteoProvider`) with bounded in-memory TTL caching (10–15 min), 8s request timeouts, strict finite/non-negative telemetry guards, rate-limit handling, and batched multi-coordinate spatial grid queries.
  - `server/geminiService.ts`: Centralized `@google/genai` client (`gemini-3.1-flash-lite`) with strict context auditing, input sanitization, JSON `responseSchema` + post-normalization validation across all 8 structured tasks, timeouts, retry logic, and structured error codes (`API_KEY_MISSING`, `INVALID_API_KEY`, `QUOTA_EXCEEDED`, `AI_INVALID_RESPONSE`, `TIMEOUT`).
  - **API Hardening**: Sliding-window per-IP rate limiting on `/api/ai/*` and `/api/air-quality*`, 100 KB JSON limit, structured JSON error middleware without stack-trace exposure, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, and `Permissions-Policy`.

## Environmental Data Sources & AQI Methodology

- **Data Source**: Open-Meteo Air Quality API (Copernicus Atmosphere Monitoring Service, CC-BY 4.0) & Open-Meteo Weather / Geocoding APIs.
- **AQI Scales**: Supports **US EPA AQI** (0–500 scale) and **European EAQI** independently without mixing scales. Pollutant bars reference **WHO 2021 Global Air Quality Guidelines** (`PM2.5` 15 µg/m³, `PM10` 45 µg/m³, `NO₂` 25 µg/m³, `O₃` 100 µg/m³, `SO₂` 40 µg/m³, `CO` 4,000 µg/m³).
- **Historical Window Disclosure**: Live Open-Meteo feeds supply up to 7 days of historical hourly observations; the `30 Days` chart toggle explicitly labels its baseline as illustrative sample data when live upstream 30-day archive is unavailable.

---

## Setup & Running Locally

### Prerequisites
- Node.js `>= 22.18` (for native `.ts` execution in `npm start`)
- Optional: a `GEMINI_API_KEY` for live Gemini AI features (Demo Mode works without any API keys)

### Environment Variables
See `.env.example`:
- `GEMINI_API_KEY`: Server-side Gemini API key (configured via Secrets in AI Studio or local `.env`; never exposed to browser code)
- `APP_URL`: Hosting URL (optional)

### Commands
```bash
npm install
npm run dev       # Starts full-stack Express + Vite dev server on port 3000
npm test          # Runs Vitest unit, server/API reliability, and UI workflow tests
npm run lint      # Runs TypeScript type checking (tsc --noEmit)
npm run build     # Builds production frontend bundle into dist/
NODE_ENV=production npm start   # Runs production Express server via Node on port 3000
```

---

## Demo Mode

Competition judges and first-time visitors can toggle **Demo Mode** anytime (or choose from 4 scenarios: *New Delhi Winter Smog AQI 268*, *Bengaluru Elevated AQI 124*, *London Moderate AQI 76*, *Zurich Good AQI 28*). All simulated readings and simulated AI outputs are explicitly labeled **`DEMO DATA — NOT LIVE ENVIRONMENTAL MEASUREMENTS`**.

---

## Limitations, Privacy & Security

- **Non-Medical Tool**: BreatheWise AI does not diagnose health conditions, prescribe treatments, or calculate medically precise personal inhaled doses.
- **No Fabricated Telemetry**: Missing pollutant fields remain `N/A`, unavailable city snapshots display explicit missing-location prompts, and unavailable 30-day archives or street-level routes are explicitly labeled as illustrative assumptions.
- **Security & Privacy**: `GEMINI_API_KEY` stays strictly server-side (`process.env`). User inputs are sanitized and validated on `/api/*` routes, AI outputs are schema-validated before rendering, no `dangerouslySetInnerHTML` or raw HTML injection is used, React `ErrorBoundary` protects views against runtime failures, and browser-persisted preferences can be exported or erased in Settings.

---

## Future Improvements

- Integration with official local ground-station networks (e.g., CPCB / OpenAQ v3 stations) alongside modeled CAMS grids.
- Multi-day hourly pollution forecast windows for planning weekend outdoor events.
- Optional opt-in Web Push alert delivery for severe winter smog advisories.
