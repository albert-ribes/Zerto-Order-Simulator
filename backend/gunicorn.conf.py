from database import engine

# Worker
worker_class = "uvicorn.workers.UvicornWorker"
workers      = 1   # 1 worker: l'estat del generador és en memòria i no es pot compartir entre processos
bind         = "0.0.0.0:8000"

# Logging
accesslog  = "-"
errorlog   = "-"
loglevel   = "info"


def post_fork(server, worker):
    engine.dispose()
