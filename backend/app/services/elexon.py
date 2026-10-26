"""
Elexon API client service.

Provides async HTTP access to:
  - FUELHH dataset  → half-hourly wind generation actuals
  - WINDFOR dataset → wind generation forecasts

Results are cached in-memory for 10 minutes using cachetools TTLCache
to avoid hammering the public Elexon API on every request.
"""

import logging
from datetime import datetime
from typing import Any

import httpx
from cachetools import TTLCache

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Cache configuration
# ---------------------------------------------------------------------------
# Store up to 32 distinct cache entries; each lives for 10 minutes (600 s).
_cache: TTLCache = TTLCache(maxsize=32, ttl=600)

# ---------------------------------------------------------------------------
# Base URLs
# ---------------------------------------------------------------------------
ELEXON_BASE = "https://data.elexon.co.uk/bmrs/api/v1/datasets"
FUELHH_STREAM = f"{ELEXON_BASE}/FUELHH/stream"
WINDFOR_STREAM = f"{ELEXON_BASE}/WINDFOR/stream"

# Timeout for outbound HTTP requests (seconds)
REQUEST_TIMEOUT = 60.0


class ElexonClient:
    """Async client for the Elexon Insights (BMRS) public API."""

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _get_json(
        self,
        url: str,
        params: dict[str, str],
        cache_key: str,
    ) -> list[dict[str, Any]]:
        """
        Fetch JSON from *url* with *params*.

        Returns the parsed list of records.  Results are cached under
        *cache_key* for 10 minutes so repeated requests within the same
        window are served instantly without hitting the upstream API.
        """
        if cache_key in _cache:
            logger.debug("Cache hit for key=%s", cache_key)
            return _cache[cache_key]

        logger.info("Fetching %s with params=%s", url, params)

        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
            try:
                response = await client.get(url, params=params)
                response.raise_for_status()
            except httpx.TimeoutException as exc:
                logger.error("Timeout while fetching %s: %s", url, exc)
                raise RuntimeError(f"Elexon API timed out ({url})") from exc
            except httpx.HTTPStatusError as exc:
                logger.error(
                    "HTTP %s from %s: %s",
                    exc.response.status_code,
                    url,
                    exc.response.text[:500],
                )
                raise RuntimeError(
                    f"Elexon API returned HTTP {exc.response.status_code}"
                ) from exc
            except httpx.RequestError as exc:
                logger.error("Request error for %s: %s", url, exc)
                raise RuntimeError(f"Network error reaching Elexon API: {exc}") from exc

        # Elexon stream endpoints return either a bare list or {"data": [...]}
        payload = response.json()
        if isinstance(payload, list):
            records = payload
        elif isinstance(payload, dict):
            # Try common envelope keys
            records = (
                payload.get("data")
                or payload.get("items")
                or payload.get("results")
                or []
            )
        else:
            records = []

        logger.info(
            "Fetched %d records from %s (cache_key=%s)", len(records), url, cache_key
        )
        _cache[cache_key] = records
        return records

    # ------------------------------------------------------------------
    # Public methods
    # ------------------------------------------------------------------

    async def get_actuals(
        self,
        date_from: str = "2026-01-01",
        date_to: str = "2026-01-31",
    ) -> list[dict[str, Any]]:
        """
        Fetch half-hourly wind generation actuals from the FUELHH stream.

        Parameters
        ----------
        date_from : str
            Settlement date start in YYYY-MM-DD format (inclusive).
        date_to : str
            Settlement date end in YYYY-MM-DD format (inclusive).

        Returns
        -------
        list of dicts with keys ``startTime`` (ISO string) and
        ``generation`` (float, MW).
        """
        cache_key = f"fuelhh:{date_from}:{date_to}"
        params = {
            "settlementDateFrom": date_from,
            "settlementDateTo": date_to,
            "fuelType": "WIND",
            "format": "json",
        }
        raw = await self._get_json(FUELHH_STREAM, params, cache_key)

        results: list[dict[str, Any]] = []
        for record in raw:
            fuel = record.get("fuelType", "")
            if fuel.upper() != "WIND":
                # Extra safety filter in case the API returns mixed fuel types
                continue

            start_time = record.get("startTime") or record.get("settlementDate")
            generation = record.get("generation")

            if start_time is None or generation is None:
                logger.debug("Skipping incomplete FUELHH record: %s", record)
                continue

            try:
                generation = float(generation)
            except (TypeError, ValueError):
                logger.warning("Non-numeric generation in FUELHH record: %s", record)
                continue

            results.append({"startTime": str(start_time), "generation": generation})

        logger.info(
            "get_actuals(%s → %s): returning %d wind records",
            date_from,
            date_to,
            len(results),
        )
        return results

    async def get_forecasts(
        self,
        publish_from: str = "2025-12-30T00:00:00Z",
        publish_to: str = "2026-01-31T23:59:59Z",
    ) -> list[dict[str, Any]]:
        """
        Fetch wind generation forecasts from the WINDFOR stream.

        Parameters
        ----------
        publish_from : str
            Lower bound on publish time (ISO 8601 UTC).
        publish_to : str
            Upper bound on publish time (ISO 8601 UTC).

        Returns
        -------
        list of dicts with keys ``startTime``, ``publishTime``, and
        ``generation`` (float, MW).
        """
        cache_key = f"windfor:{publish_from}:{publish_to}"
        params = {
            "publishDateTimeFrom": publish_from,
            "publishDateTimeTo": publish_to,
            "format": "json",
        }
        raw = await self._get_json(WINDFOR_STREAM, params, cache_key)

        results: list[dict[str, Any]] = []
        for record in raw:
            start_time = record.get("startTime")
            publish_time = record.get("publishTime") or record.get("publishDateTime")
            generation = record.get("generation")

            if start_time is None or publish_time is None or generation is None:
                logger.debug("Skipping incomplete WINDFOR record: %s", record)
                continue

            try:
                generation = float(generation)
            except (TypeError, ValueError):
                logger.warning("Non-numeric generation in WINDFOR record: %s", record)
                continue

            results.append(
                {
                    "startTime": str(start_time),
                    "publishTime": str(publish_time),
                    "generation": generation,
                }
            )

        logger.info(
            "get_forecasts(%s → %s): returning %d records",
            publish_from,
            publish_to,
            len(results),
        )
        return results


# ---------------------------------------------------------------------------
# Module-level singleton – import and reuse across routes
# ---------------------------------------------------------------------------
elexon_client = ElexonClient()
