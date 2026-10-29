FROM python:3.12-slim
WORKDIR /app
# requirements.txt = input; requirements.lock = what installs (I7). Regenerate inside this base image:
#   docker run --rm -v "$PWD:/src" -w /src python:3.12-slim sh -c 'pip install uv && uv pip compile --generate-hashes -o requirements.lock requirements.txt'
COPY requirements.lock ./
RUN pip install --no-cache-dir --require-hashes -r requirements.lock
COPY app.py .
ENV HF_HOME=/models
EXPOSE 8421
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD timeout 4 python -c "__import__('sys').exit(0 if __import__('urllib.request').request.urlopen('http://127.0.0.1:8421/health',timeout=3).getcode()==200 else 1)"
CMD ["python", "-m", "uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8421"]
