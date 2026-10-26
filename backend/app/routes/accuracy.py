"""
Accuracy router – forecast vs. actual comparison metrics.

Endpoint
--------
GET /api/accuracy
    Runs the day-ahead accuracy analysis for January 2026 and returns:
      - overall: {mae, rmse, mape, bias, correlation, n_matched}
      - by_hour: list of {hour, mae, rmse, count}
      - timeseries: list of {startTime, actual, forecast, error, abs_error}
"""

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.analytics import compute_accuracy_metrics
from app.services.elexon import elexon_client

logger = logging.getLogger(__name__)

router = APIRouter()

# ---------------------------------------------------------------------------
# Date constants for January 2026 analysis
# ---------------------------------------------------------------------------
ACTUALS_DATE_FROM = "2026-01-01"
ACTUALS_DATE_TO = "2026-01-31"
FORECASTS_PUBLISH_FROM = "2025-12-30T00:00:00Z"
FORECASTS_PUBLISH_TO = "2026-01-31T23:59:59Z"


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------

class OverallMetrics(BaseModel):
    """Scalar summary accuracy metrics."""

    mae: float
    rmse: float
    mape: float | None
    bias: float
    correlation: float | None
    n_matched: int


class HourlyMetrics(BaseModel):
    """Per-hour accuracy breakdown."""

    hour: int
    mae: float
    rmse: float
    count: int


class TimeseriesPoint(BaseModel):
    """Slot-level actual vs forecast comparison."""

    startTime: str
    actual: float
    forecast: float
    error: float
    abs_error: float


class AccuracyResponse(BaseModel):
    """Full accuracy analysis response."""

    overall: OverallMetrics | dict
    by_hour: list[HourlyMetrics]
    timeseries: list[TimeseriesPoint]
    message: str | None = None


# ---------------------------------------------------------------------------
# Route
# ---------------------------------------------------------------------------

@router.get(
    "/api/accuracy",
    response_model=AccuracyResponse,
    summary="Forecast accuracy analysis – January 2026",
    description=(
        "Computes day-ahead forecast accuracy metrics by matching each "
        "half-hourly wind actual to the latest WINDFOR forecast published "
        "before the day-ahead gate closure (delivery_date − 1 day + 12:00 UTC). "
        "Returns overall MAE/RMSE/MAPE/bias/correlation, per-hour breakdown, "
        "and full slot-level timeseries."
    ),
    tags=["Accuracy"],
)
@router.get(
    "/accuracy",
    response_model=AccuracyResponse,
    include_in_schema=False,
)
async def get_accuracy() -> dict:
    """
    Fetch actuals + forecasts from the Elexon API in parallel, then run the
    accuracy analytics pipeline and return the results.
    """
    logger.info("GET /api/accuracy – fetching actuals and forecasts in parallel")

    import asyncio

    try:
        actuals_task = elexon_client.get_actuals(
            date_from=ACTUALS_DATE_FROM,
            date_to=ACTUALS_DATE_TO,
        )
        forecasts_task = elexon_client.get_forecasts(
            publish_from=FORECASTS_PUBLISH_FROM,
            publish_to=FORECASTS_PUBLISH_TO,
        )
        actuals, forecasts = await asyncio.gather(actuals_task, forecasts_task)
    except RuntimeError as exc:
        logger.error("Elexon API error in /api/accuracy: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Unexpected error fetching data for /api/accuracy")
        raise HTTPException(
            status_code=500, detail=f"Internal server error: {exc}"
        ) from exc

    logger.info(
        "Fetched %d actuals and %d forecast records – running analytics",
        len(actuals),
        len(forecasts),
    )

    try:
        result = compute_accuracy_metrics(actuals, forecasts)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Error computing accuracy metrics")
        raise HTTPException(
            status_code=500,
            detail=f"Analytics computation failed: {exc}",
        ) from exc

    return result
