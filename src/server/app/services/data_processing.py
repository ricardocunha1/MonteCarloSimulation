import io
import json
import math
from typing import Any

import pandas as pd

MANDATORY_COLUMNS = ("State", "Iteration Path", "Resolved Date", "Story Points")
# Ordered, since the Azure DevOps sprint history WIQL lists them in this order.
COMPLETED_STATES = ("Resolved", "Done", "Closed")

SUMMARY_COLUMNS = (
    "Sprint",
    "Items Resolved",
    "Story Points",
    "Last Resolved Date",
    "Recency Rank",
    "In Sampling Pool",
)


ADO_HISTORY_INVALID = "The Azure DevOps sprint history is invalid."
ADO_HISTORY_EMPTY = "The Azure DevOps sprint history has no work items."


class DataValidationError(Exception):
    pass


def _buffer_upload(file_storage):
    """Copy a file-like upload into an in-memory, seekable BytesIO.

    pandas/openpyxl need a seekable stream; on Python < 3.11 the
    SpooledTemporaryFile behind a Starlette upload lacks `seekable()`.
    Anything without `read()` (e.g. a path) is passed through unchanged.
    """
    read = getattr(file_storage, "read", None)
    if read is None:
        return file_storage
    if hasattr(file_storage, "seek"):
        file_storage.seek(0)
    return io.BytesIO(read())


def parse_sprint_history(file_storage) -> pd.DataFrame:
    """Read and lightly clean the uploaded sprint history workbook.

    Raises DataValidationError (never a raw pandas exception) so the caller
    can always turn a bad upload into a user-facing error message.
    """
    try:
        df = pd.read_excel(_buffer_upload(file_storage), sheet_name=0)
    except Exception as exc:
        raise DataValidationError(f"Could not read Excel file: {exc}") from exc

    missing = [column for column in MANDATORY_COLUMNS if column not in df.columns]
    if missing:
        raise DataValidationError(
            f"Sprint history file is missing required column(s): {', '.join(missing)}"
        )

    df = df.copy()
    try:
        df["Story Points"] = df["Story Points"].fillna(0).astype(int)
    except (TypeError, ValueError) as exc:
        raise DataValidationError(
            f"Story Points column contains non-numeric values: {exc}"
        ) from exc

    return df


def parse_sprint_history_items(raw: str) -> pd.DataFrame:
    """Turn the Azure DevOps sprint history (the `/api/ado/sprint-history`
    `workItems`, as a JSON string) into the same DataFrame
    `parse_sprint_history` returns for an Excel extract.

    Each entry needs `state` and `iterationPath` strings, an ISO 8601
    `resolvedDate` (converted to tz-naive UTC) and a numeric or null
    `storyPoints` (null → 0, then truncated to int like the Excel path);
    other keys are ignored.

    Raises:
        DataValidationError: ADO_HISTORY_EMPTY for an empty list,
            ADO_HISTORY_INVALID for anything else that breaks those rules.
    """
    try:
        items = json.loads(raw)
    except (ValueError, RecursionError) as exc:
        raise DataValidationError(ADO_HISTORY_INVALID) from exc
    if not isinstance(items, list):
        raise DataValidationError(ADO_HISTORY_INVALID)
    if not items:
        raise DataValidationError(ADO_HISTORY_EMPTY)
    if not all(_is_valid_history_item(item) for item in items):
        raise DataValidationError(ADO_HISTORY_INVALID)

    try:
        resolved = pd.to_datetime(
            [item["resolvedDate"].strip() for item in items], utc=True, format="ISO8601"
        )
        story_points = pd.Series(
            [item["storyPoints"] for item in items], dtype="float64"
        ).fillna(0).astype(int)
    except (ValueError, TypeError, OverflowError) as exc:
        raise DataValidationError(ADO_HISTORY_INVALID) from exc
    if resolved.isna().any():
        raise DataValidationError(ADO_HISTORY_INVALID)

    return pd.DataFrame(
        {
            "State": [item["state"] for item in items],
            "Iteration Path": [item["iterationPath"] for item in items],
            "Resolved Date": resolved.tz_convert(None),
            "Story Points": story_points,
        }
    )


def _is_valid_history_item(item: Any) -> bool:
    """Field types of one sprint history entry (the date is parsed later).
    Strings must be UTF-8 encodable so the summary can be serialized."""
    if not isinstance(item, dict):
        return False
    texts = (item.get("state"), item.get("iterationPath"), item.get("resolvedDate"))
    if not all(isinstance(text, str) and _is_utf8(text) for text in texts):
        return False
    points = item.get("storyPoints", ...)
    if points is None:
        return True
    if isinstance(points, bool) or not isinstance(points, (int, float)):
        return False
    return isinstance(points, int) or math.isfinite(points)


def _is_utf8(text: str) -> bool:
    try:
        text.encode("utf-8")
    except UnicodeEncodeError:
        return False
    return True


def build_sprint_summary(df: pd.DataFrame, exclude_latest: int) -> pd.DataFrame:
    completed = df[df["State"].isin(COMPLETED_STATES)].copy()
    completed["Sprint"] = completed["Iteration Path"].apply(
        lambda path: str(path).split("\\")[-1]
    )

    grouped = completed.groupby("Sprint")
    summary = grouped["Story Points"].sum().reset_index()
    summary["Items Resolved"] = grouped.size().values
    summary["Last Resolved Date"] = grouped["Resolved Date"].max().values
    summary["Recency Rank"] = (
        summary["Last Resolved Date"].rank(ascending=False, method="min").astype(int)
    )
    summary["In Sampling Pool"] = summary["Recency Rank"] > exclude_latest

    return summary[list(SUMMARY_COLUMNS)]


def summary_to_records(summary: pd.DataFrame) -> list[dict]:
    """JSON-serializable rows (dates as ISO strings) for the confirm-page hidden field."""
    records = summary.to_dict(orient="records")
    for record in records:
        record["Last Resolved Date"] = pd.Timestamp(record["Last Resolved Date"]).date().isoformat()
    return records


def summary_from_records(records: list[dict]) -> pd.DataFrame:
    """Rebuild a sprint summary DataFrame from the confirm-page hidden JSON payload."""
    if not records:
        return pd.DataFrame(columns=list(SUMMARY_COLUMNS))
    return pd.DataFrame.from_records(records)[list(SUMMARY_COLUMNS)]
