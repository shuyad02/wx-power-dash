"""
Analytics service for wind forecast accuracy.

Core responsibility: given a DataFrame of actuals and a DataFrame of all
available forecasts, compute the "day-ahead decision forecast" for each
delivery slot and return accuracy metrics.

Day-ahead decision rule
-----------------------
For each half-hour delivery slot at time T, the operator must commit
electricity purchases by the day-ahead market gate closure.  We model
this as: use the **latest** forecast whose publishTime ≤
(midnight of delivery date − 1 day + 12:00:00 UTC).

Example:
  - Delivery slot 2026-01-15 06:30 UTC
  - Cutoff = 2026-01-14 12:00:00 UTC
  - Take the forecast published closest to (but not after) that cutoff.
"""

import logging
import math
from typing import Any

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _parse_utc(series: pd.Series) -> pd.Series:
    """Parse a string series to timezone-aware UTC datetimes."""
    parsed = pd.to_datetime(series, utc=True, errors="coerce")
    return parsed


def _build_actuals_df(actuals: list[dict[str, Any]]) -> pd.DataFrame:
    """
    Convert the raw actuals list to a clean DataFrame indexed by startTime.

    Columns: startTime (UTC datetime), generation (float MW)
    """
    if not actuals:
        return pd.DataFrame(columns=["startTime", "generation"])

    df = pd.DataFrame(actuals)
    df["startTime"] = _parse_utc(df["startTime"])
    df["generation"] = pd.to_numeric(df["generation"], errors="coerce")
    df = df.dropna(subset=["startTime", "generation"])
    df = df.sort_values("startTime").reset_index(drop=True)
    return df


def _build_forecasts_df(forecasts: list[dict[str, Any]]) -> pd.DataFrame:
    """
    Convert the raw forecasts list to a clean DataFrame.

    Columns: startTime (UTC datetime), publishTime (UTC datetime),
             generation (float MW)
    """
    if not forecasts:
        return pd.DataFrame(columns=["startTime", "publishTime", "generation"])

    df = pd.DataFrame(forecasts)
    df["startTime"] = _parse_utc(df["startTime"])
    df["publishTime"] = _parse_utc(df["publishTime"])
    df["generation"] = pd.to_numeric(df["generation"], errors="coerce")
    df = df.dropna(subset=["startTime", "publishTime", "generation"])
    df = df.sort_values(["startTime", "publishTime"]).reset_index(drop=True)
    return df


def _day_ahead_cutoff(delivery_time: pd.Timestamp) -> pd.Timestamp:
    """
    Return the day-ahead gate-closure cutoff for *delivery_time*.

    Rule: midnight of (delivery_date − 1 day) + 12 hours UTC
          = delivery_date − 1 day + 12:00 UTC
    """
    delivery_date = delivery_time.normalize()  # midnight UTC on delivery day
    cutoff = delivery_date - pd.Timedelta(days=1) + pd.Timedelta(hours=12)
    return cutoff


def _select_day_ahead_forecast(
    delivery_time: pd.Timestamp,
    forecasts_df: pd.DataFrame,
) -> float | None:
    """
    For a given *delivery_time*, pick the generation value from the latest
    forecast published at or before the day-ahead cutoff.

    Returns None if no qualifying forecast exists.
    """
    cutoff = _day_ahead_cutoff(delivery_time)

    # All forecasts targeting this exact delivery slot published before cutoff
    mask = (forecasts_df["startTime"] == delivery_time) & (
        forecasts_df["publishTime"] <= cutoff
    )
    candidates = forecasts_df.loc[mask]

    if candidates.empty:
        return None

    # Latest publish time within the qualifying window
    latest_idx = candidates["publishTime"].idxmax()
    return float(candidates.loc[latest_idx, "generation"])


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def compute_accuracy_metrics(
    actuals: list[dict[str, Any]],
    forecasts: list[dict[str, Any]],
) -> dict[str, Any]:
    """
    Compute forecast accuracy metrics against actuals for January 2026.

    Parameters
    ----------
    actuals : list[dict]
        Records from ElexonClient.get_actuals() –
        each has ``startTime`` and ``generation``.
    forecasts : list[dict]
        Records from ElexonClient.get_forecasts() –
        each has ``startTime``, ``publishTime``, and ``generation``.

    Returns
    -------
    dict with keys:
      - ``overall``    – scalar summary metrics (MAE, RMSE, MAPE, bias, corr)
      - ``by_hour``    – per-hour breakdown (hour 0-23)
      - ``timeseries`` – slot-level details including matched forecast and error
    """
    logger.info(
        "Computing accuracy metrics: %d actuals, %d forecast records",
        len(actuals),
        len(forecasts),
    )

    actuals_df = _build_actuals_df(actuals)
    forecasts_df = _build_forecasts_df(forecasts)

    if actuals_df.empty:
        logger.warning("No actuals data available for accuracy computation.")
        return {
            "overall": {},
            "by_hour": [],
            "timeseries": [],
            "message": "No actuals data available.",
        }

    if forecasts_df.empty:
        logger.warning("No forecasts data available for accuracy computation.")
        return {
            "overall": {},
            "by_hour": [],
            "timeseries": [],
            "message": "No forecasts data available.",
        }

    # ------------------------------------------------------------------
    # Match each actual slot to its day-ahead forecast
    # ------------------------------------------------------------------
    rows: list[dict[str, Any]] = []

    for _, actual_row in actuals_df.iterrows():
        delivery_time = actual_row["startTime"]
        actual_gen = actual_row["generation"]

        forecast_gen = _select_day_ahead_forecast(delivery_time, forecasts_df)

        if forecast_gen is None:
            logger.debug(
                "No day-ahead forecast found for delivery slot %s", delivery_time
            )
            continue

        error = forecast_gen - actual_gen  # positive → over-forecast
        abs_error = abs(error)

        rows.append(
            {
                "startTime": delivery_time.isoformat(),
                "hour": delivery_time.hour,
                "actual": round(actual_gen, 3),
                "forecast": round(forecast_gen, 3),
                "error": round(error, 3),
                "abs_error": round(abs_error, 3),
            }
        )

    if not rows:
        logger.warning("No matched actual/forecast pairs found.")
        return {
            "overall": {},
            "by_hour": [],
            "timeseries": [],
            "message": "No matched actual/forecast pairs found. "
            "Check that forecast publish times cover the day-ahead window.",
        }

    matched_df = pd.DataFrame(rows)
    logger.info("Matched %d actual/forecast pairs for accuracy analysis.", len(matched_df))

    # ------------------------------------------------------------------
    # Overall metrics
    # ------------------------------------------------------------------
    actuals_arr = matched_df["actual"].values
    forecasts_arr = matched_df["forecast"].values
    errors_arr = matched_df["error"].values
    abs_errors_arr = matched_df["abs_error"].values

    mae = float(np.mean(abs_errors_arr))
    rmse = float(np.sqrt(np.mean(errors_arr**2)))
    bias = float(np.mean(errors_arr))  # mean error (signed)

    # MAPE – guard against division by zero on near-zero actuals
    nonzero_mask = actuals_arr > 1.0  # 1 MW threshold avoids div-by-zero noise
    if np.any(nonzero_mask):
        mape = float(
            np.mean(np.abs(errors_arr[nonzero_mask] / actuals_arr[nonzero_mask])) * 100
        )
    else:
        mape = float("nan")

    # Pearson correlation
    if len(actuals_arr) > 1 and np.std(actuals_arr) > 0 and np.std(forecasts_arr) > 0:
        correlation = float(np.corrcoef(actuals_arr, forecasts_arr)[0, 1])
    else:
        correlation = float("nan")

    overall = {
        "mae": round(mae, 3),
        "rmse": round(rmse, 3),
        "mape": round(mape, 3) if not math.isnan(mape) else None,
        "bias": round(bias, 3),
        "correlation": round(correlation, 4) if not math.isnan(correlation) else None,
        "n_matched": len(matched_df),
    }

    # ------------------------------------------------------------------
    # By-hour breakdown
    # ------------------------------------------------------------------
    by_hour: list[dict[str, Any]] = []
    for hour, group in matched_df.groupby("hour"):
        h_abs_errors = group["abs_error"].values
        h_errors = group["error"].values
        by_hour.append(
            {
                "hour": int(hour),
                "mae": round(float(np.mean(h_abs_errors)), 3),
                "rmse": round(float(np.sqrt(np.mean(h_errors**2))), 3),
                "count": int(len(group)),
            }
        )

    # Sort by hour ascending
    by_hour.sort(key=lambda x: x["hour"])

    # ------------------------------------------------------------------
    # Timeseries (slot level)
    # ------------------------------------------------------------------
    timeseries = matched_df.drop(columns=["hour"]).to_dict(orient="records")

    return {
        "overall": overall,
        "by_hour": by_hour,
        "timeseries": timeseries,
    }
