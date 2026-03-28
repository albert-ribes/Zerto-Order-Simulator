from database import engine

# Worker
worker_class = "uvicorn.workers.UvicornWorker"
workers      = 2
bind         = "0.0.0.0:8000"

# Logging
accesslog  = "-"
errorlog   = "-"
loglevel   = "info"


def post_fork(server, worker):
    engine.dispose()
