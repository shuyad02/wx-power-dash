"""
Actuals router – wind generation actuals from FUELHH dataset.

Endpoint
--------
GET /api/actuals
    Query params:
      - date_from  (str, default "2026-01-01")  settlement date lower bound
      - date_to    (str, default "2026-01-31")  settlement date upper bound

Response: list of {startTime: ISO string, generation: float (MW)}
"""

import logging

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.services.elexon import elexon_client

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Response schema
# ---------------------------------------------------------------------------

class ActualRecord(BaseModel):
    """A single half-hourly wind generation actual reading."""

    startTime: str
    generation: float


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get(
    "/api/actuals",
    response_model=list[ActualRecord],
    summary="Wind generation actuals",
    description=(
        "Returns half-hourly wind generation actuals (MW) from the Elexon "
        "FUELHH dataset for the requested date range.  Defaults to January 2026."
    ),
    tags=["Actuals"],
)
@router.get(
    "/actuals",
    response_model=list[ActualRecord],
    include_in_schema=False,
)
async def get_actuals(
    date_from: str = Query(
        default="2026-01-01",
        description="Settlement date lower bound (YYYY-MM-DD, inclusive)",
        example="2026-01-01",
    ),
    date_to: str = Query(
        default="2026-01-31",
        description="Settlement date upper bound (YYYY-MM-DD, inclusive)",
        example="2026-01-31",
    ),
) -> list[dict]:
    """
    Fetch FUELHH wind actuals for the given date window.

    Results are cached for 10 minutes to avoid repeated upstream API calls.
    """
    logger.info("GET /api/actuals  date_from=%s  date_to=%s", date_from, date_to)

    try:
        records = await elexon_client.get_actuals(
            date_from=date_from,
            date_to=date_to,
        )
    except RuntimeError as exc:
        logger.error("Elexon API error in /api/actuals: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Unexpected error in /api/actuals")
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error: {exc}",
        ) from exc

    if not records:
        logger.warning(
            "No actuals returned for date_from=%s date_to=%s", date_from, date_to
        )

    return records
