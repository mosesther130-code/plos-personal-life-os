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
- Cloudflare 60s proxy compatibility: trimmed Claude prompts to keep all LLM endpoints under ceiling.

