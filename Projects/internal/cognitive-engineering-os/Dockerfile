# Cognitive OS Phase 1 API -- single-stage (pure Python, no build step needed unlike a
# Next.js standalone image). Matches this repo's own requires-python = ">=3.12".
FROM python:3.12-slim

WORKDIR /app

# System deps: none beyond what python:3.12-slim already has -- ai_lego's own dependencies
# (PyYAML/jsonschema/referencing/cryptography/fastapi/uvicorn/matplotlib) are all pure-Python
# or ship manylinux wheels, so no build-essential/gcc layer is needed (verified 2026-09-18 with
# matplotlib added: `docker build` installs matplotlib-*-manylinux2014_x86_64.whl, no compile step).
COPY Projects/internal/cognitive-engineering-os/pyproject.toml Projects/internal/cognitive-engineering-os/pyproject.toml
COPY Projects/internal/cognitive-engineering-os/ai_lego Projects/internal/cognitive-engineering-os/ai_lego
COPY agency-os/docs/AI_LEGO_Cognitive_Engineering_OS agency-os/docs/AI_LEGO_Cognitive_Engineering_OS

RUN pip install --no-cache-dir /app/Projects/internal/cognitive-engineering-os

# Non-root -- same discipline oracle-web's own Dockerfile applies.
RUN addgroup --system --gid 1001 cognitive && adduser --system --uid 1001 --gid 1001 cognitive
RUN mkdir -p /app/Projects/internal/cognitive-engineering-os/.runtime && chown -R cognitive:cognitive /app
USER cognitive

WORKDIR /app/Projects/internal/cognitive-engineering-os
ENV PYTHONUNBUFFERED=1
# matplotlib's default cache dir (~/.config/matplotlib) isn't writable for this non-root user
# (no real home dir) -- point it at the .runtime dir already chowned to `cognitive` above,
# rather than let it silently fall back to /tmp with a permission-denied warning every start.
ENV MPLCONFIGDIR=/app/Projects/internal/cognitive-engineering-os/.runtime/matplotlib
EXPOSE 8420

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8420/health', timeout=3).status == 200 else 1)"

CMD ["uvicorn", "ai_lego.apps.api.main:app", "--host", "0.0.0.0", "--port", "8420"]
