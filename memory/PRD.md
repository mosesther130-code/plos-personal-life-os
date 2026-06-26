# PLOS — Personal Life Operating System (PRD)

## Vision
A single-user, AI-powered mobile command center that manages every dimension of one user's life: finance, career, safety, investments, health, and more. Built with React Native Expo, FastAPI, MongoDB, and Claude Sonnet 4.5.

## Architecture
- **Frontend**: Expo SDK 54 (React Native), Expo Router file-based, dark mode UI with #1E40AF blue accent
- **Backend**: FastAPI + Motor (async MongoDB) + JWT auth
- **AI**: Claude Sonnet 4.5 (`claude-sonnet-4-5-20250929`) via Emergent Universal LLM Key
- **Storage**: MongoDB local + JWT in expo-secure-store; biometric unlock via expo-local-authentication

## Tabs (Bottom Nav)
1. **Home** — Daily Dashboard: financial health score, net worth, monthly cashflow, AI advice
2. **Finance** — Income / Expenses / Debts breakdown
3. **Career** — ATS score, job applications, pipeline
4. **Safety** — AI safety audit + emergency quick actions
5. **More** — Hub: Investments, Business, Global Tools, Travel, Legal, Shopping, Health, Chatbot, Settings

## Data Models (MongoDB Collections)
`users`, `user_profile`, `income_sources`, `expenses`, `debts`, `assets`, `investments`, `career_profile`, `job_applications`, `health_profile`, `ai_decisions_log`, `chat_messages`

## Key Endpoints
- `POST /api/auth/register|login`, `GET /api/auth/me`
- `GET /api/dashboard` — aggregate financial health + net worth + recent AI decisions
- CRUD: `/api/income`, `/api/expenses`, `/api/debts`, `/api/assets`, `/api/investments`, `/api/job-applications`
- `GET|PUT /api/career`, `/api/health-profile`
- `POST /api/ai/advice` — generate Claude advice card for any module
- `POST /api/chat` — full conversational chat with Claude using user's complete data context
- `POST /api/seed-demo` — populate sample data

## Auth Flow
Email/password + JWT (30-day expiry). Biometric unlock available on devices with hardware support; token persists in expo-secure-store between sessions.

## AI Integration
Every AI call (advice + chat) gathers the user's complete data context (income, expenses, debts, assets, investments, career, health) and feeds it to Claude. AI decisions are persisted in `ai_decisions_log` for the dashboard feed.

## Status: MVP COMPLETE
- Splash → auth gate → tab navigation
- All 10 DB schemas implemented
- Auth (register/login/me) with bcrypt
- Demo data seeding for instant value
- AI advice generation + chatbot
- Settings with data management + sign out
- Module pages for Investments, Health (full); Business/Global/Travel/Legal/Shopping (scaffolded, AI-enabled)

## Iteration 10 — Business & Shopping (DONE)
- **Business Ideas Advisor**: Hub + Ideas screen with seed/Claude-generated cards (timeline/risk tags, startup/revenue ranges, next steps, full plan modal). Eden Heights Tracker for 4-hectare / $12,000 USD Bulacan eco-resort (5-yr ROI chart, 3 phases, PH compliance checklist, edit municipality/value).
- **Shopping & Deals Engine**: Hub with monthly savings summary. Active Deals (5 curated, dismiss with web-confirm), Utilities Review with Claude 4.5 "Find Better Rate" (Georgia Power, AT&T, DeKalb Water), Registered Products CRUD for recall monitoring.
- Backend endpoints (`/api/business/*`, `/api/shopping/*`) and frontend screens both tested via testing_agent (iteration_10 + iteration_11 reports).
## Iteration 12 — Business CRUD via EditModal (DONE)
- **Business Ideas Advisor** now supports full Add/Edit/Delete via the shared EditModal bottom-sheet pattern. Seed ideas auto-persist to Mongo on first read (each gets a uuid + `source: "seed"`) so they become user-editable. AI-generated ideas tagged `source: "ai"`; user-added `source: "custom"`. Backend endpoints: `POST/PUT/DELETE /api/business/ideas[/{id}]`.
- **Eden Heights Tracker** Edit/Delete via EditModal (name, location, municipality, size_hectares, current_value_usd, breakeven_year, concept). `DELETE /api/business/eden-heights` resets to factory defaults (4 ha / $12k / 3 phases / 8-item checklist).
## Iteration 13 — Travel Advisor (DONE)
- **Travel Home**: Plan a Trip search, Philippines pinned card with live PHP/USD rate (ExchangeRate-API), 3 MOCKED deal alerts (ATL→MNL price drop, ATL→CDG, ATL→NRT) with Google Flights deep-links, upcoming trips list with status pills + days countdown.
- **Trip Planner** (`/travel/[id]`): destination hero, Level 1–4 advisory card (color-coded), Philippines-specific Immigration & Bulacan notes + cross-link to Eden Heights, **consolidated Claude 4.5 destination insights** (best time, cultural notes, visa, vaccinations, packing list by 5 categories, do's/don'ts, emergency contacts with tap-to-call), MOCKED flight cards (Korean Air $687, JAL $894, PAL $742) + MOCKED Manila hotels (Marriott $89, Seda $65, Red Planet $38), Pre-travel checklist (13 items + Eden Heights extra when purpose=eden_heights, auto-passport check), trip cost estimator with monthly-surplus impact line.
- **Passport screen** with renewal warning logic (>12mo green, 6–12mo yellow, <6mo red, expired red) + Renew deep-link + Global Entry/NEXUS/Other Visa storage.
- 30 seeded US State Dept advisory levels (PH=2, RU=4, IL=4, JP=1, …) with fallback deep-link to travel.state.gov.
- Mocks intentional: flights, hotels, deal alerts — UI badges + deep-links to Google Flights / Booking.com.
## Iteration 14 — Philippines Quick Access EditModal (DONE)
- Added pencil edit badge to the Philippines pinned card on Travel home. Opens an EditModal bottom-sheet allowing the user to edit Card Title (destination_name), Primary City, Trip Purpose (7-option dropdown), Departure/Return dates, and Status. country/country_code are locked to "Philippines"/"PH".
- If no PH trip exists, the editor creates one + pre-caches Claude insights via the fast-path; otherwise it updates the existing PH trip.
- `stopPropagation` prevents the pencil tap from triggering the card's "Open Trip Planner" navigation.
- Card title + subtitle now reflect the underlying PH trip (or sensible "Manila & Bulacan · Eden Heights Development" default).
- Tested: 3/3 backend pytest + 6/6 Playwright steps (iteration_14 report).



