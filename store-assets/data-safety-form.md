# PLOS — Google Play Data Safety Form Answers

Paste these answers into Play Console → App content → Data safety.

## Data collection & security overview

- Does your app collect or share any of the required user data types?  **Yes**
- Is all of the user data collected by your app encrypted in transit?  **Yes** (HTTPS/TLS)
- Do you provide a way for users to request that their data be deleted?  **Yes** (email plos.support@gmail.com — see Privacy Policy §6)

## Data types collected

| Data type | Collected? | Shared with third parties? | Optional? | Purpose |
|---|---|---|---|---|
| Name | Yes | No | Yes | Account management |
| Email address | Yes | No | No | Account management, breach monitoring, support |
| User ID | Yes | No | No | Account management |
| Address | Yes | No | Yes | Personalization (regional info) |
| Phone number | Yes | No | Yes | Account management (optional) |
| Precise location | Yes | Only with contacts the user selects | Yes | App functionality (Safety module, family sharing) |
| Approximate location | Yes | No | Yes | App functionality |
| Financial info — Payment info | No | — | — | (Plaid handles credentials; PLOS never stores payment credentials) |
| Financial info — Other financial info (account balances, transactions) | Yes | No | Yes | App functionality |
| Health & fitness — Other health info | Yes | No | Yes | Health module (self-reported) |
| Files & docs — Photos | Yes | No | Yes | Receipts, medical notes attachment |
| App activity — App interactions | Yes | No | No | Analytics (anonymous) |
| Device / other IDs — Device ID | Yes | No | No | Push notifications |

## Purposes of collection (pick all that apply per data type)

- App functionality: ✅
- Analytics: ✅ (aggregated only)
- Personalization: ✅
- Account management: ✅
- Advertising or marketing: **No**
- Fraud prevention, security, and compliance: ✅ (breach monitoring)

## Data sharing summary

PLOS does **not** sell user data. PLOS shares data with these third-party service
providers strictly for functionality:

- Plaid — user-initiated bank connection
- Firebase / Google Cloud — push notifications, location realtime sync (opt-in)
- Google Maps — location display (no user data sent beyond current coords)
- Anthropic, OpenAI, Google Gemini, Perplexity — AI processing (transient; not
  used for provider model training per each provider's business terms)
- HaveIBeenPwned — breach lookups (email hash sent, no full email)
- SerpApi, OpenWeatherMap, ExchangeRate-API, EIA — read-only lookups; no PII sent
