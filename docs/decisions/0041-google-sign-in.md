# 0041: Google sign-in with server-verified ID tokens

## Context
The React SPA exchanges credentials for TicketRush JWTs and rotating refresh tokens held in memory. Users also need Google sign-in without changing this session model.

## Options
1. Google Identity Services popup returning an ID token, verified by the API.
2. Server-side authorization-code redirects with an OAuth client secret and temporary session state.

## Decision
Use the Google-rendered Identity Services button and its JavaScript callback. POST the credential as JSON to `/api/v1/auth/google`; return the existing application token response. The API accepts no identity or roles supplied separately by the browser. Existing Spring Security Nimbus support verifies RS256 signatures against Google's fixed HTTPS JWKS endpoint, token lifetime, issuer, client audience, authorized party when present, subject, and verified email. Google tokens are never accepted as TicketRush bearer tokens.

`GET /api/v1/auth/google/config` exposes only the public client ID. An empty `GOOGLE_CLIENT_ID` disables token exchange. The UI always shows the Google option: a disabled placeholder with an explanation while loading, when unconfigured, or on failure; the functional Google-rendered button replaces it once ready. Load failures offer a retry. IP rate limiting and a bounded request body protect the exchange endpoint. Tokens remain in memory, never URLs or browser storage. This JSON callback flow does not authenticate via cookies; it does not use Google's HTML form POST redirect flow.

Persist the stable Google `sub` in a unique nullable column. New Google users get USER only and an undisclosed random BCrypt password to preserve the existing NOT NULL constraint. Repeated sign-in resolves by subject even if Google email changes. Do not automatically link existing local accounts by email; return 409 and instruct the user to use their existing password. Email is contact metadata, not the external identity key.

Database unique constraints protect both email and Google subject under concurrent first sign-ins. One request creates the account; racing inserts may return 409 and can be retried. Account and refresh-token creation are atomic in the existing transaction. This simple approach avoids additional distributed locks or retry transactions.

## Consequences
No new dependency or OAuth client secret is required. Users with existing password accounts cannot use Google until a separately scoped authenticated account-linking feature exists. Google login needs network access to Google and a configured OAuth Web client. Live provider/browser behavior must be checked with real configuration; automated tests use real RSA-signed tokens with a test public key, and Testcontainers for concurrent database behavior.

## Setup and verification
1. Create an OAuth client of type **Web application** in Google Cloud Console and configure the OAuth consent screen/test users as appropriate.
2. Register the exact frontend origin under **Authorized JavaScript origins**, e.g. `http://localhost:3000`. Production must use HTTPS. `localhost` and `127.0.0.1` are different origins. No redirect URI is needed for this popup callback flow.
3. Set `GOOGLE_CLIENT_ID=<your-web-client-id>` in `.env`. Docker Compose passes it to the backend. For Maven/IDE launches, export it into the backend process environment; Spring does not load the root `.env` automatically.
4. Restart/recreate the backend (`docker compose up -d --build backend` if using Compose). Flyway applies V9. Start the frontend with `npm run dev`, then use the Google button on `/login` or `/register`.
5. Test a new Google account, returning login, protected pages, logout, and an email already registered by password. Token exchange must issue USER only for a new account.
6. Automated checks: `npm run lint`, `npm test`, `npm run build`, and `mvn -f backend/pom.xml verify`. Docker is required for integration tests.
7. After building the frontend, run `npx playwright test --config playwright.google.config.ts` for the Google UI flow. These browser tests simulate the Google SDK and API responses; they do not prove real provider authentication.

Reference: https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
