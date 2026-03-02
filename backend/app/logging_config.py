"""Structured logging configuration for TestPilot backend."""
import logging
import sys

from .config import LOG_LEVEL


def setup_logging() -> None:
    """Configure structured logging with timestamp, level, and module name."""
    fmt = "%(asctime)s | %(levelname)-7s | %(name)s | %(message)s"
    logging.basicConfig(
        level=getattr(logging, LOG_LEVEL, logging.INFO),
        format=fmt,
        datefmt="%Y-%m-%d %H:%M:%S",
        stream=sys.stdout,
        force=True,
    )
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)


def get_logger(name: str) -> logging.Logger:
    """Return a namespaced logger: testpilot.<name>."""
    return logging.getLogger(f"testpilot.{name}")
