import pandas as pd

MANDATORY_COLUMNS = ("State", "Iteration Path", "Resolved Date", "Story Points")
COMPLETED_STATES = {"Resolved", "Done", "Closed"}

SUMMARY_COLUMNS = (
    "Sprint",
    "Items Resolved",
    "Story Points",
    "Last Resolved Date",
    "Recency Rank",
    "In Sampling Pool",
)


class DataValidationError(Exception):
    pass


def parse_sprint_history(file_storage) -> pd.DataFrame:
    """Read and lightly clean the uploaded sprint history workbook.

    Raises DataValidationError (never a raw pandas exception) so the caller
    can always turn a bad upload into a user-facing error message.
    """
    try:
        df = pd.read_excel(file_storage, sheet_name=0)
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
