# Card 01 — CI runs the PostgreSQL tests instead of skipping them

## Decision
The storage switch (`COS/docs/platform/STORAGE_SWITCH.md`) made the engine's tests run on a real PostgreSQL (`COS/tests/pg.py`, `COS/tests/unit/test_pg_foundation.py`). On a machine with neither Docker nor `COGNITIVE_OS_TEST_DATABASE_URL` those tests are SKIPPED with a loud reason. That is right on a laptop and wrong in CI: a skip in CI is a green run that tested nothing. CI must (a) give the suite a PostgreSQL and (b) fail when it does not get one.

## Constraints
- Do not change what a laptop run does: no Docker and no URL still means skip-with-reason.
- New switch: environment variable `COGNITIVE_OS_REQUIRE_POSTGRES=1` makes `tests/pg.py` RAISE (a failing test, not a skip) when it cannot get a server. One place decides this (the function in `tests/pg.py` that today decides to skip); read it first.
- The test image is built from `COS/Dockerfile` `--target test` and run as `docker run ... bash scripts/test-gate.sh --all` (see `.github/workflows/cognitive-os-full-suite.yml` job `python`). The suite runs INSIDE that container, so it needs network access to a PostgreSQL started beside it. Use a user-defined docker network and the digest-pinned image in `tests/pg.py` (`IMAGE`); no GitHub `services:` block with a floating tag.
- The password is generated per run in the workflow (`openssl rand -hex 16`), masked with `::add-mask::`, never written to a file or the artifact log.
- The workflow's `paths:` filter must also fire when `tests/pg.py`, `ai_lego/data/` or `ai_lego/data/migrations/` change.
- `COS/scripts/affected_tests.py` maps changed files to the tests that must run: read it, and make a change under `ai_lego/data/` select the PostgreSQL tests (`test_pg_foundation`) and the repository tests. Add the mapping where the file's own convention puts mappings; do not rewrite the selector.
- Do not touch any other job in the workflow (`golden`, `web`).

## Files
- `.github/workflows/cognitive-os-full-suite.yml`
- `Projects/internal/cognitive-engineering-os/tests/pg.py`
- `Projects/internal/cognitive-engineering-os/scripts/affected_tests.py`
- new: `Projects/internal/cognitive-engineering-os/tests/unit/test_ci_postgres.py`
- `agency-os/reports/review-debt.md` (one row, see the preamble)

## Acceptance (the driver runs these; write the tests so they fail when the guard is removed)
`tests/unit/test_ci_postgres.py` must prove, by reading the workflow with `yaml.safe_load` and by running `tests/pg.py` in a subprocess:
1. the `python` job creates a docker network, starts the pinned PostgreSQL image on it, waits for readiness, passes `COGNITIVE_OS_TEST_DATABASE_URL` and `COGNITIVE_OS_REQUIRE_POSTGRES=1` to the test container, and removes the PostgreSQL container and the network in a step with `if: always()`;
2. the image reference in the workflow is exactly `tests/pg.py`'s `IMAGE` (read both, compare: one fact in two places is held by this test);
3. the password is masked and not echoed;
4. the `paths:` filter contains the three new paths;
5. with `COGNITIVE_OS_REQUIRE_POSTGRES=1` and neither docker on PATH nor a URL, importing/using the fixture raises (non-zero exit, message names the variable); without it, it still skips with the reason;
6. `affected_tests.py` selects `tests.unit.test_pg_foundation` when `ai_lego/data/db.py` changed.
Mutations to run and report: remove the always-cleanup step -> test 1 red; change the image tag in the workflow -> test 2 red; drop the mask line -> test 3 red; remove one path -> test 4 red; make REQUIRE a no-op in pg.py -> test 5 red; delete the selector mapping -> test 6 red.

## Check commands (run by the driver)
See `queue.json` entry `01-ci-postgres`.
