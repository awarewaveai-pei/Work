# video-service — render-only 微服務（EU 部署）。
# python + ffmpeg + Noto CJK 字型（字幕）+ requirements。
# 不帶任何金鑰；render 端點靠 RENDER_AUTH_TOKEN（shared secret）保護，產出上傳 R2。
FROM python:3.12-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg fonts-noto-cjk ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
# requirements.txt = ranges (input); requirements.lock = what installs. Regenerate inside this base image:
#   docker run --rm -v "$PWD:/src" -w /src python:3.12-slim sh -c 'pip install uv && uv pip compile --generate-hashes -o requirements.lock requirements.txt'
COPY requirements.lock ./
RUN pip install --no-cache-dir --require-hashes -r requirements.lock
COPY . .

ENV VIDEO_SERVICE_HOST=0.0.0.0 \
    VIDEO_SERVICE_PORT=8732 \
    OUTPUT_DIR=/app/output \
    TEMP_DIR=/app/temp

EXPOSE 8732

# 容器內 healthcheck（GET /health 免認證）
HEALTHCHECK --interval=20s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8732/health',timeout=4).getcode()==200 else 1)"

CMD ["python", "server.py"]
