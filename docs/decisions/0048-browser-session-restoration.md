# ADR 0048: Restore browser login with an HttpOnly refresh cookie

## Context

Both tokens were held in JavaScript memory. Reload discarded them, while Router
immediately treated a missing user as logged out. Refresh rotation already exists
in PostgreSQL (ADR 0001). Preserve that transaction and existing explicit-token API.

## Options

1. Persist tokens in localStorage: simple but readable by injected JavaScript.
2. Keep access JWTs in memory and use an HttpOnly refresh cookie for browsers.
3. Replace authentication with server sessions or a BFF.

## Decision

Choose option 2 without changing frameworks. Browser login, Google login, refresh
and logout opt in using `X-Auth-Mode: cookie`. Require an exact trusted Origin from
`AUTH_BROWSER_ORIGINS` on every cookie-mode mutation, including login (login CSRF).
The custom header and Origin check complement SameSite; a cookie alone never
authorizes the legacy body-token endpoint. CORS is not opened by this change.
Use the existing same-origin Node proxy, which forwards Set-Cookie unchanged.

Browser responses expose accessToken only (refreshToken is null); the opaque
refresh token is stored as `tr_refresh`, host-only, HttpOnly, SameSite=Lax,
Path=/api/v1/auth, Max-Age matching the existing seven-day refresh TTL. Each
successful refresh atomically rotates the database token and replaces the cookie.
Reject replay without emitting a deletion cookie that could erase another tab's
successful rotation. Logout revokes the current cookie token and deletes it with
the same path and flags. Legacy explicit-body clients remain supported.

Secure defaults to true; the dev profile defaults to false for local HTTP.
Production refuses `AUTH_COOKIE_SECURE=false`. The local `.env.example` explicitly
uses false; deployments must set true and serve HTTPS. Changing frontend host or
port requires updating AUTH_BROWSER_ORIGINS to the exact origin.

AuthProvider bootstraps with refresh then /auth/me. Router waits before mounting
protected pages or redirecting. React StrictMode shares one in-flight bootstrap.
Only 401 ends the session; network/5xx failures show a retry state, preserving the
URL. Logout failures are visible and do not claim successful logout. Login and
logout omit stale access Authorization headers. Session version checks prevent a
pending restore/refresh from applying after logout.

Web Locks serialize cookie-changing requests across same-origin tabs on supported
secure-context browsers (including localhost). Per-client promises serialize
refresh within a tab. Logout waits for an in-flight rotation before revoking its
successor. No access token or refresh token is written to local/session storage.

## Consequences and limits

- A valid cookie restores USER/STAFF/ADMIN identity from the server after reload.
- Existing RAM-only sessions require one new login to establish the cookie.
- Seven-day expiry slides with rotation; absolute session lifetime, token-family
  replay revocation and immediate revocation of issued access JWTs remain deferred
  as in ADR 0001. Already-open tabs can retain their access JWT until it expires.
- Browsers without Web Locks only have in-tab refresh serialization; simultaneous
  refresh across tabs may require signing in again. A lost successful refresh
  response can also require login under strict one-time rotation.
- HttpOnly limits token extraction, not all XSS actions. Same-origin scripts still
  have the current user's capabilities.
- Frontend browser tests use API fixtures and exercise real cookie behavior,
  reload, simultaneous tabs, logout and bootstrap retry. Backend integration tests
  use PostgreSQL/Redis/RabbitMQ containers and real concurrent refresh requests.

## Verification

From the repository root:

```powershell
npm run lint
npm test
npm run build
npx playwright test --config playwright.session.config.ts
```

From backend with Docker running:

```powershell
.\mvnw.cmd -B '-Dtest=AuthIntegrationTest,GoogleLoginIntegrationTest' package
```

## References

- [OWASP HTML5 storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html)
- [MDN Web Locks API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API)
