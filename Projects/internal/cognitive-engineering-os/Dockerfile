# Cognitive OS API image -- two stages from one pinned base (plan §12.1 rule 11: tests run in the environment
# that ships).
#   runtime  what docker-compose deploys. compose must name it (`target: runtime`): Docker's default is the LAST
#            stage, and that is `test`.
#   test     runtime + tests + test deps; scripts/test-gate.sh runs in it: deploy.sh passes only the modules affected
#            since the last all-green sha; `--all` (the default CMD) is the full suite, which only
#            .github/workflows/cognitive-os-full-suite.yml runs, on a dependency/runtime change.
# Base pinned by index digest, Python deps by requirements*.lock (scripts/lock-deps.sh regenerates them inside
# this same base): a base or dependency change is a commit, and the workflow's path filter runs the suite on it.
FROM python:3.12-slim@sha256:f77ac9e44ae96ef2c90b8053ea08c31f8be030f824196b0ae4db6d462c84e51f AS runtime

WORKDIR /app

# fonts-noto-cjk: matplotlib's default font has no CJK glyphs, so a chart with a Chinese title rendered as tofu
# boxes (2026-09-18, seen in the PNG). Every Python dependency is pure or ships a manylinux wheel: no compiler.
RUN apt-get update && apt-get install -y --no-install-recommends fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*

# Dependencies first (their own layer, rebuilt only when the lock changes), the package last.
COPY Projects/internal/cognitive-engineering-os/requirements.lock Projects/internal/cognitive-engineering-os/requirements.lock
RUN pip install --no-cache-dir --require-hashes -r Projects/internal/cognitive-engineering-os/requirements.lock
COPY Projects/internal/cognitive-engineering-os/pyproject.toml Projects/internal/cognitive-engineering-os/pyproject.toml
COPY Projects/internal/cognitive-engineering-os/ai_lego Projects/internal/cognitive-engineering-os/ai_lego
COPY agency-os/docs/AI_LEGO_Cognitive_Engineering_OS agency-os/docs/AI_LEGO_Cognitive_Engineering_OS
RUN pip install --no-cache-dir --no-deps /app/Projects/internal/cognitive-engineering-os

# Non-root -- same discipline oracle-web's own Dockerfile applies.
RUN addgroup --system --gid 1001 cognitive && adduser --system --uid 1001 --gid 1001 cognitive
RUN mkdir -p /app/Projects/internal/cognitive-engineering-os/.runtime && chown -R cognitive:cognitive /app
USER cognitive

WORKDIR /app/Projects/internal/cognitive-engineering-os
ENV PYTHONUNBUFFERED=1
# matplotlib's cache dir (~/.config/matplotlib) is not writable for this home-less user: point it at .runtime.
ENV MPLCONFIGDIR=/app/Projects/internal/cognitive-engineering-os/.runtime/matplotlib
EXPOSE 8420

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8420/health', timeout=3).status == 200 else 1)"

CMD ["uvicorn", "ai_lego.apps.api.main:app", "--host", "0.0.0.0", "--port", "8420"]


FROM runtime AS test
USER root
# The PDF export tests extract text with Poppler; keep the apt package pinned like the Python locks.
RUN apt-get update && apt-get install -y --no-install-recommends poppler-utils=25.03.0-5+deb13u4 \
    && rm -rf /var/lib/apt/lists/*
COPY Projects/internal/cognitive-engineering-os/requirements-test.lock /app/Projects/internal/cognitive-engineering-os/requirements-test.lock
RUN pip install --no-cache-dir --require-hashes -r /app/Projects/internal/cognitive-engineering-os/requirements-test.lock
# What the image tests read besides the package and SPEC: tests/, eval/ (harness), scripts/ (selector tests, eval
# gate), the web fixtures two payload tests compare against, docker-compose.yml (egress allowlist parity). The
# explicit checkout-only manifest in scripts/image_test_modules.py covers tests that read other repository files;
# the SPEC golden also runs on the checkout because it cross-checks documents outside SPEC.
COPY --chown=cognitive:cognitive Projects/internal/cognitive-engineering-os/docker-compose.yml /app/Projects/internal/cognitive-engineering-os/docker-compose.yml
COPY --chown=cognitive:cognitive Projects/internal/cognitive-engineering-os/tests /app/Projects/internal/cognitive-engineering-os/tests
COPY --chown=cognitive:cognitive Projects/internal/cognitive-engineering-os/eval /app/Projects/internal/cognitive-engineering-os/eval
COPY --chown=cognitive:cognitive Projects/internal/cognitive-engineering-os/scripts /app/Projects/internal/cognitive-engineering-os/scripts
COPY --chown=cognitive:cognitive Projects/internal/cognitive-engineering-os/apps/cognitive-web/fixtures /app/Projects/internal/cognitive-engineering-os/apps/cognitive-web/fixtures
USER cognitive
HEALTHCHECK NONE
CMD ["bash", "scripts/test-gate.sh", "--all"]
