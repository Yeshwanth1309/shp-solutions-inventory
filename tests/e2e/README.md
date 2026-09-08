# End-to-end tests

These drive a real browser against a running instance of the app (section 6
and section 56 of the brief: "Use Playwright for browser workflows where
practical").

## Why they are not part of `npm test`

Two things this test suite needs were unavailable in the sandbox this project
was built in:

1. **A Chromium download.** `npx playwright install` fetches browser binaries
   from `playwright.azureedge.net` / `cdn.playwright.dev`, both outside the
   environment's network allowlist.
2. **A running server on a known URL.** These tests assume the app is already
   built and started (see below), unlike the unit and integration suites,
   which are fully self-contained.

The tests are written and reviewed for correctness against the actual API and
UI contract, and they run in CI (see `.github/workflows/ci.yml`, job
`e2e-tests`), where both a network-fetched Chromium and a live server are
available. They have not been executed in this sandbox, and nothing in this
project claims otherwise.

## Running them yourself

```bash
npm run db:migrate
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=SomeStrongPass123 npm run bootstrap:admin
npm run build
npm run start &
npx playwright install --with-deps chromium
npm run test:e2e
```
