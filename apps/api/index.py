"""Vercel entrypoint: the FastAPI preset looks for an `app` in a top-level index.py."""

from architectflow.main import app

__all__ = ["app"]
