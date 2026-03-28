from database import engine


def post_fork(server, worker):
    engine.dispose()
