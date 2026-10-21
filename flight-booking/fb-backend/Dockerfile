FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Override bind port from gunicorn_conf.py (8000) to 8002 for multi-demo setup
CMD ["gunicorn", "app.main:app", "--config", "gunicorn_conf.py", "--bind", "0.0.0.0:8002"]
