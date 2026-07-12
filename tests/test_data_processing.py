from pathlib import Path

import pandas as pd
import pytest

from src.app.services.data_processing import (
    DataValidationError,
    build_sprint_summary,
    parse_sprint_history,
)

FIXTURE_PATH = Path(__file__).resolve().parent.parent / "notebook" / "Sprint_History.xlsx"


def test_build_sprint_summary_matches_verified_fixture():
    with FIXTURE_PATH.open("rb") as f:
        df = parse_sprint_history(f)

    summary = build_sprint_summary(df, exclude_latest=1)

    assert len(summary) == 24

    by_sprint = summary.set_index("Sprint")
    assert by_sprint.loc["Sprint 24", "In Sampling Pool"] == False  # noqa: E712
    assert (by_sprint.drop(index="Sprint 24")["In Sampling Pool"] == True).all()  # noqa: E712


def test_parse_sprint_history_missing_column_raises(monkeypatch):
    incomplete_df = pd.DataFrame({"Iteration Path": ["Team\\Sprint 01"]})
    monkeypatch.setattr(pd, "read_excel", lambda *args, **kwargs: incomplete_df)

    with pytest.raises(DataValidationError):
        parse_sprint_history(object())
