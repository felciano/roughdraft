# TASK-001: Two non-smoke e2e layout tests fail on `main`

- **Status:** open
- **Found:** 2026-11-25, during a one-off full `pnpm test:e2e` run in CI for PR #5
- **Severity:** unknown. These are layout checks, and nobody has looked at
  whether real users see the problems they describe.

## Failing tests

1. `packages/app/e2e/homepage-storyboard.spec.ts:368` — "homepage workflow
   storyboard › docks the storyboard visual without mobile overlap"
   - Error: `locator.evaluate: Error: Expected sticky visual, scene copy, and
     document preview`, so at least one of those elements was not found.
2. `packages/app/e2e/stale-write.spec.ts:231` — "stale writes › keeps conflict
   banner and save status stack from overlapping"
   - Error: `expect(locator).toBeVisible()` returned hidden, either for the
     conflict notice or for `document-status-stack`. The test loops over a
     1280×720 and a 390×844 viewport; which iteration failed was not checked.

## What is known

- Both fail on `main` itself (81cb52c, plus the ubuntu-24.04 runner pin and
  the `cli.test.ts` format fix). This was established on throwaway draft PR #6,
  which ran 24 passed and 2 failed. So they predate PRs #4 and #5.
- They also fail on PR #5's branch (30 passed, 2 failed), with no new failures.
- No one noticed because CI (`.github/workflows/ci.yml`) runs only
  `pnpm test:smoke`, and these tests are not tagged `@smoke`.
- Unknown: whether they also fail on upstream `Lex-Inc/roughdraft` main
  (686919e), or whether the fork's remote-mode / Done Reviewing changes
  (`git log 686919e..main`) introduced them.

## Next steps

1. Run the two specs against upstream 686919e to see whether this fork or
   upstream caused them. Browsers do not run inside the nono sandbox, so
   use CI or an unsandboxed shell.
2. Read the Playwright traces and screenshots for the failing step to see
   which element is missing or hidden.
3. Fix in the app or update the tests, and file upstream if the bug is
   upstream's.
4. Consider running the full e2e suite in CI, on a schedule or on `main`
   pushes, so non-smoke specs don't rot unnoticed.
