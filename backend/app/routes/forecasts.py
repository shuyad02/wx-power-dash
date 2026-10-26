"""
Forecasts router – wind generation forecasts from WINDFOR dataset.

Endpoints
---------
GET /api/forecasts
    Returns all WINDFOR forecasts whose delivery startTime falls within
    [date_from, date_to].

GET /api/forecasts/latest
    Returns the most-recently-published complete forecast profile
    (every delivery slot published at the same, newest publishTime).

GET /api/forecasts/evolution
    For a specific delivery date, returns all forecasts grouped by
    publishTime so the caller can visualise how the forecast evolved
    over the lead-time window.
"""

import logging
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

import pandas as pd
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.services.elexon import elexon_client

logger = logging.getLogger(__name__)

router = APIRouter()

# ---------------------------------------------------------------------------
# Constants – default date window for January 2026
# ---------------------------------------------------------------------------
DEFAULT_PUBLISH_FROM = "2025-12-30T00:00:00Z"
DEFAULT_PUBLISH_TO = "2026-01-31T23:59:59Z"


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------

class ForecastRecord(BaseModel):
    """A single half-hourly wind generation forecast reading."""

    startTime: str
    publishTime: str
    generation: float


class ForecastEvolutionGroup(BaseModel):
    """All forecasts published at the same publishTime for one delivery date."""

    publishTime: str
    forecasts: list[ForecastRecord]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _all_forecasts_for_period(
    records: list[dict[str, Any]],
    date_from: str,
    date_to: str,
) -> list[dict[str, Any]]:
    """
    Filter *records* to those whose delivery ``startTime`` falls within
    [date_from 00:00 UTC, date_to 23:59:59 UTC].
    """
    try:
        dt_from = pd.Timestamp(date_from, tz="UTC")
        dt_to = pd.Timestamp(date_to, tz="UTC") + pd.Timedelta(days=1) - pd.Timedelta(seconds=1)
    except Exception as exc:
        raise ValueError(f"Invalid date format: {exc}") from exc

    filtered = []
    for rec in records:
        try:
            ts = pd.Timestamp(rec["startTime"], tz="UTC")
        except Exception:
            continue
        if dt_from <= ts <= dt_to:
            filtered.append(rec)

    return filtered


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get(
    "/api/forecasts",
    response_model=list[ForecastRecord],
    summary="Wind generation forecasts",
    description=(
        "Returns all WINDFOR forecast records whose delivery startTime falls "
        "within the requested date range.  All publish times that cover the "
        "delivery window are included."
    ),
    tags=["Forecasts"],
)
@router.get(
    "/forecasts",
    response_model=list[ForecastRecord],
    include_in_schema=False,
)
async def get_forecasts(
    date_from: str = Query(
        default="2026-01-01",
        description="Delivery date lower bound (YYYY-MM-DD, inclusive)",
        example="2026-01-01",
    ),
    date_to: str = Query(
        default="2026-01-31",
        description="Delivery date upper bound (YYYY-MM-DD, inclusive)",
        example="2026-01-31",
    ),
) -> list[dict]:
    """Fetch all WINDFOR forecasts for delivery dates in [date_from, date_to]."""
    logger.info("GET /api/forecasts  date_from=%s  date_to=%s", date_from, date_to)

    try:
        all_records = await elexon_client.get_forecasts(
            publish_from=DEFAULT_PUBLISH_FROM,
            publish_to=DEFAULT_PUBLISH_TO,
        )
    except RuntimeError as exc:
        logger.error("Elexon API error in /api/forecasts: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Unexpected error in /api/forecasts")
        raise HTTPException(status_code=500, detail=f"Internal server error: {exc}") from exc

    try:
        records = _all_forecasts_for_period(all_records, date_from, date_to)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    logger.info("/api/forecasts returning %d records", len(records))
    return records


@router.get(
    "/api/forecasts/latest",
    response_model=list[ForecastRecord],
    summary="Latest wind forecast",
    description=(
        "Returns the most recently published forecast profile for January 2026.  "
        "All delivery slots share the same (newest) publishTime."
    ),
    tags=["Forecasts"],
)
@router.get(
    "/forecasts/latest",
    response_model=list[ForecastRecord],
    include_in_schema=False,
)
async def get_latest_forecast() -> list[dict]:
    """
    Return the latest available forecast set.

    Strategy: fetch all WINDFOR records for the default publish window,
    find the single most-recent publishTime, and return only those records.
    """
    logger.info("GET /api/forecasts/latest")

    try:
        all_records = await elexon_client.get_forecasts(
            publish_from=DEFAULT_PUBLISH_FROM,
            publish_to=DEFAULT_PUBLISH_TO,
        )
    except RuntimeError as exc:
        logger.error("Elexon API error in /api/forecasts/latest: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Unexpected error in /api/forecasts/latest")
        raise HTTPException(status_code=500, detail=f"Internal server error: {exc}") from exc

    if not all_records:
        return []

    # Identify the latest publishTime across all records
    try:
        latest_pt = max(
            pd.Timestamp(r["publishTime"], tz="UTC") for r in all_records
        )
    except Exception as exc:
        logger.error("Could not parse publishTime values: %s", exc)
        raise HTTPException(
            status_code=500, detail="Could not parse publishTime values."
        ) from exc

    latest_str = latest_pt.isoformat()
    logger.info("Latest publishTime = %s", latest_str)

    latest_records = [
        r
        for r in all_records
        if str(r.get("publishTime", "")).startswith(latest_str[:16])  # match to minute
    ]

    # Fallback: if nothing matched (timezone repr mismatch), use exact object comparison
    if not latest_records:
        latest_records = [
            r
            for r in all_records
            if pd.Timestamp(r["publishTime"], tz="UTC") == latest_pt
        ]

    logger.info("/api/forecasts/latest returning %d records", len(latest_records))
    return latest_records


@router.get(
    "/api/forecasts/evolution",
    response_model=list[ForecastEvolutionGroup],
    summary="Forecast evolution for a delivery date",
    description=(
        "For a specific delivery date, returns all available forecasts "
        "grouped by publishTime – showing how the forecast evolved as "
        "it got closer to delivery."
    ),
    tags=["Forecasts"],
)
@router.get(
    "/forecasts/evolution",
    response_model=list[ForecastEvolutionGroup],
    include_in_schema=False,
)
async def get_forecast_evolution(
    delivery_date: str = Query(
        ...,
        description="Delivery date in YYYY-MM-DD format",
        example="2026-01-15",
    ),
) -> list[dict]:
    """
    Fetch all forecasts that target *delivery_date* and group them by
    publishTime so the caller can plot the forecast trajectory.
    """
    logger.info("GET /api/forecasts/evolution  delivery_date=%s", delivery_date)

    # Validate the date string
    try:
        dt_day = pd.Timestamp(delivery_date, tz="UTC")
        dt_day_end = dt_day + pd.Timedelta(days=1) - pd.Timedelta(seconds=1)
    except Exception as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid delivery_date format '{delivery_date}': {exc}",
        ) from exc

    try:
        all_records = await elexon_client.get_forecasts(
            publish_from=DEFAULT_PUBLISH_FROM,
            publish_to=DEFAULT_PUBLISH_TO,
        )
    except RuntimeError as exc:
        logger.error("Elexon API error in /api/forecasts/evolution: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Unexpected error in /api/forecasts/evolution")
        raise HTTPException(status_code=500, detail=f"Internal server error: {exc}") from exc

    # Filter to records whose startTime falls on the requested delivery day
    day_records = []
    for rec in all_records:
        try:
            ts = pd.Timestamp(rec["startTime"], tz="UTC")
        except Exception:
            continue
        if dt_day <= ts <= dt_day_end:
            day_records.append(rec)

    if not day_records:
        logger.warning("No forecast records found for delivery_date=%s", delivery_date)
        return []

    # Group by publishTime (group key = exact publishTime string)
    grouped: dict[str, list[dict]] = defaultdict(list)
    for rec in day_records:
        grouped[rec["publishTime"]].append(rec)

    # Sort groups chronologically by publishTime
    sorted_groups = sorted(grouped.items(), key=lambda kv: kv[0])

    result = [
        {
            "publishTime": pt,
            "forecasts": sorted(records, key=lambda r: r["startTime"]),
        }
        for pt, records in sorted_groups
    ]

    logger.info(
        "/api/forecasts/evolution returning %d publish groups for %s",
        len(result),
        delivery_date,
    )
    return result
