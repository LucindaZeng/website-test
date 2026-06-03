# ─── WFX Python backend container ───────────────────────────────────────────
# Runs server.py. Designed to sit alongside DNMP's nginx + mysql + redis.
# DNMP's nginx reverse-proxies requests to this container on port 8000.

FROM python:3.11-slim

# Only external dependency server.py needs
RUN pip install --no-cache-dir mysql-connector-python

WORKDIR /app

# Copy the whole site (HTML, server.py, images, etc.)
COPY . /app

# server.py binds here; nginx (DNMP) proxies to it
ENV WFX_HOST=0.0.0.0
ENV WFX_PORT=8000

EXPOSE 8000

# --no-browser: never try to open a browser inside the container
CMD ["python", "server.py", "--host", "0.0.0.0", "--port", "8000", "--no-browser"]
