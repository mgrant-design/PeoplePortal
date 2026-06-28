# Persistence Work Items

## Cosmos write path
1. Add a Cosmos write helper in the Functions app: HMAC-signed POST upsert, mirroring the existing `cosmosGet` signing in `api/roster/index.js`.
2. Add authenticated write endpoints in the Functions app (POST/PUT). Each one calls `verifyGoogleToken`, applies the domain lock, and checks role permissions (`deriveAccess`) before writing.
3. Return the updated record from each write so the client can update state without a full refetch.

## Collections
1. Decide storage per data domain: a field on the employee's `roster` document, the `appState` doc, or a new dedicated collection.
2. New collections likely needed: schedules, time punches, reviews, employee relations, scrub orders, applicants, automations.
3. Per-employee settings: store as a field on the `roster` document or in a `userSettings` collection keyed by email/id.

## Client changes
1. Replace `localStorage` reads/writes in each module with calls to the new endpoints: photos, uploaded forms, relations, time punches, reviews, scrub orders, applicants, automations, settings.
2. Load per-employee settings on sign-in alongside the roster response.
3. Keep `localStorage` only as an optional offline cache if wanted.

## appState editing
1. Add a write endpoint for the `roster-support` document so in-app edits to offices, departments, titles, managers, users, and offboarding persist.

## Scheduler
1. Persist published schedules to Cosmos via a write endpoint.
2. Store per-office coverage requirements (`COVERAGE_REQS`, `WEEKEND_REQS`) as configurable data and persist them.
3. Replace the simulated publish notification with a real Google Chat / SMS send when that integration is wired.

## Integrations (no live API yet)
1. Paychex (payroll sync, export, pay rules)
2. Google Workspace account provisioning
3. Denticon, NexHealth, DoseSpot account provisioning
4. Google Drive document browse/attach
5. Résumé parsing/import
6. Credentials registry lookups (NPI / DEA / license)
