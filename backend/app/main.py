"""
FastAPI application entry point for the Wind Energy Forecast Dashboard.

Mounts all routers and configures:
  - CORS (allow all origins for development / dashboard frontend)
  - Structured logging
  - Health check endpoint at GET /health

To run locally:
    uvicorn app.main:app --reload --port 8000
"""

import logging
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes.accuracy import router as accuracy_router
from app.routes.actuals import router as actuals_router
from app.routes.forecasts import router as forecasts_router

# ---------------------------------------------------------------------------
# Logging configuration
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
    stream=sys.stdout,
)
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Application lifespan
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Run startup and shutdown logic."""
    logger.info("=== Wind Energy Forecast Dashboard API starting up ===")
    yield
    logger.info("=== Wind Energy Forecast Dashboard API shutting down ===")


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Wind Energy Forecast Dashboard API",
    description=(
        "Backend for a UK energy utility wind generation forecast dashboard.  "
        "Provides half-hourly wind actuals (FUELHH) and forecasts (WINDFOR) "
        "sourced from the Elexon Insights Solution (BMRS) public API, together "
        "with day-ahead forecast accuracy metrics for January 2026."
    ),
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# ---------------------------------------------------------------------------
# CORS – allow all origins so the React / Next.js dashboard can connect from
# any host during development and production.
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
app.include_router(actuals_router)
app.include_router(forecasts_router)
app.include_router(accuracy_router)


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

@app.get(
    "/health",
    summary="Health check",
    description="Returns a simple OK status so load-balancers / Docker HEALTHCHECK can verify the service is alive.",
    tags=["Meta"],
)
async def health_check() -> dict:
    """Lightweight liveness probe – always returns 200 OK."""
    return {"status": "ok", "service": "wind-energy-forecast-api", "version": "1.0.0"}


@app.get(
    "/",
    summary="Root",
    description="Redirect hint – visit /docs for the interactive API explorer.",
    tags=["Meta"],
)
async def root() -> dict:
    """Root endpoint – points developers to the interactive docs."""
    return {
        "message": "Wind Energy Forecast Dashboard API",
        "docs": "/docs",
        "health": "/health",
        "endpoints": {
            "actuals": "/api/actuals",
            "forecasts": "/api/forecasts",
            "forecasts_latest": "/api/forecasts/latest",
            "forecasts_evolution": "/api/forecasts/evolution?delivery_date=2026-01-15",
            "accuracy": "/api/accuracy",
        },
    }
