# Data Pipeline & Persistence State

## Pipeline (sign-in to data)
1. Browser signs in with Google; obtains a Google ID token.
2. Browser calls `GET /api/roster` with the token in a custom `X-Google-Token` header (Azure Easy Auth overwrites the standard `Authorization` header, so a custom header is used).
3. `api/_shared/auth.js` verifies the token with Google (signature, audience, expiry) and returns a lowercased email.
4. `api/roster/index.js` domain-locks the email to `puredental.com`, `foureversmile.com`, or `puredentallab.com`. Failure returns 401 (bad token) or 403 (wrong domain).
5. The function reads Cosmos using `COSMOS_ENDPOINT` + `COSMOS_KEY` env vars via signed REST GET.
6. The caller is matched in the roster by `workEmail === Google email`. No match returns 403.
7. Access is derived (`deriveAccess`) and the employee list is scoped (`scopedEmployees`): admin/HR/exec see all, managers see their reporting tree, everyone else sees only themselves.
8. Response shape: `{ employees, offices, departments, titles, managers, users, offboarding }`.
9. `rbac.jsx` loads the response into `window.HRDATA`; the app renders from it.

## Cosmos structure
1. Database: `portal` (env `COSMOS_DB`, default `portal`).
2. Collection `roster`: one document per employee.
3. Collection `appState`: a single document with `id: "roster-support"` holding `offices`, `departments`, `titles`, `managers`, `users`, `offboarding`.

## Read/write reality
1. The only server data path is `GET /api/roster`. It is read-only.
2. There is no write/POST/upsert to Cosmos anywhere in `/api`.
3. All in-app data is stored in browser `localStorage`, not Azure: photos, uploaded forms, employee relations, time-clock punches, performance reviews, scrub orders, applicants, automations, chat history, tweak/preference settings.
4. In-app edits to offices, departments, titles, managers, users, and offboarding do not persist to Cosmos.

## Simulated / stubbed
1. Scheduler: Publish updates in-memory state only; it does not write to Cosmos. The "notified by Google Chat & text" message on publish is simulated.
2. Scheduler coverage requirements per office (`COVERAGE_REQS`, `WEEKEND_REQS`) are empty objects; coverage gaps and Smart fill have no targets until configured.
3. Credentials verification (NPI / DEA / license lookup) returns constructed results, not real registry calls.
4. Paperwork e-signature delivery and Paychex sync are mocked.
5. Integration feature flags have no live API behind them: Paychex, Google Workspace provisioning, Denticon, NexHealth, DoseSpot, Google Drive, résumé parsing.

## Secrets (Functions env vars, not in code)
1. `COSMOS_ENDPOINT`, `COSMOS_KEY`, `COSMOS_DB`
2. `GOOGLE_CLIENT_ID`
3. `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`
