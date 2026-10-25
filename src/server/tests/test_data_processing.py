import json
from pathlib import Path

import pandas as pd
import pytest

from app.services.data_processing import (
    ADO_HISTORY_EMPTY,
    ADO_HISTORY_INVALID,
    DataValidationError,
    build_sprint_summary,
    parse_sprint_history,
    parse_sprint_history_items,
)

FIXTURE_PATH = Path(__file__).resolve().parents[3] / "notebook" / "Sprint_History.xlsx"


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


class _NonSeekableUpload:
    """Mimics a Python 3.10 SpooledTemporaryFile: read/seek but no seekable()."""

    def __init__(self, data: bytes):
        self._data = data
        self._pos = 0

    def read(self, size: int = -1) -> bytes:
        chunk = self._data[self._pos:] if size < 0 else self._data[self._pos:self._pos + size]
        self._pos += len(chunk)
        return chunk

    def seek(self, offset: int, whence: int = 0) -> int:
        self._pos = offset
        return self._pos


def test_parse_sprint_history_accepts_upload_without_seekable():
    upload = _NonSeekableUpload(FIXTURE_PATH.read_bytes())
    assert not hasattr(upload, "seekable")

    df = parse_sprint_history(upload)

    assert set(["State", "Iteration Path", "Resolved Date", "Story Points"]) <= set(df.columns)
    assert len(build_sprint_summary(df, exclude_latest=1)) == 24


def test_parse_sprint_history_rereads_from_start_of_stream():
    upload = _NonSeekableUpload(FIXTURE_PATH.read_bytes())
    upload.read(10)

    df = parse_sprint_history(upload)

    assert len(df) > 0


def test_parse_sprint_history_unreadable_bytes_raises_data_validation_error():
    upload = _NonSeekableUpload(b"definitely not an excel workbook")

    with pytest.raises(DataValidationError, match="Could not read Excel file"):
        parse_sprint_history(upload)


# --- Azure DevOps sprint history items ------------------------------------------------


def _item(**overrides):
    item = {
        "id": 1,
        "type": "User Story",
        "title": "T",
        "state": "Resolved",
        "iterationPath": "Proj\\Sprint 01",
        "resolvedDate": "2026-04-09T10:47:08Z",
        "storyPoints": 3,
    }
    item.update(overrides)
    return item


def _without(key):
    return {k: v for k, v in _item().items() if k != key}


def test_parse_sprint_history_items_builds_the_excel_columns():
    raw = json.dumps(
        [
            _item(),
            _item(state="Done", resolvedDate="2026-04-10T12:00:00+02:00", storyPoints=2.9),
            _item(state="Active", iterationPath="Proj\\Sprint 02", resolvedDate="2026-04-11", storyPoints=None),
        ]
    )

    df = parse_sprint_history_items(raw)

    assert list(df.columns) == ["State", "Iteration Path", "Resolved Date", "Story Points"]
    assert df["State"].tolist() == ["Resolved", "Done", "Active"]
    assert df["Iteration Path"].tolist() == ["Proj\\Sprint 01", "Proj\\Sprint 01", "Proj\\Sprint 02"]
    assert str(df["Resolved Date"].dtype) == "datetime64[ns]"  # tz-naive UTC, like the Excel extract
    assert df["Resolved Date"].tolist() == [
        pd.Timestamp("2026-04-09 10:47:08"),
        pd.Timestamp("2026-04-10 10:00:00"),
        pd.Timestamp("2026-04-11 00:00:00"),
    ]
    assert df["Story Points"].tolist() == [3, 2, 0]  # fillna(0) then astype(int), like the Excel path
    assert str(df["Story Points"].dtype) == "int64"


def test_parse_sprint_history_items_ignores_extra_keys_and_needs_only_four_fields():
    minimal = {"state": "Done", "iterationPath": "P\\S", "resolvedDate": "2026-01-01T00:00:00Z", "storyPoints": 1}
    df = parse_sprint_history_items(json.dumps([dict(minimal, other=[1, 2])]))
    assert len(df) == 1


def test_parse_sprint_history_items_summary_follows_the_business_rules():
    raw = json.dumps(
        [
            _item(iterationPath="P\\Sprint 01", resolvedDate="2026-01-02T00:00:00Z", storyPoints=2),
            _item(iterationPath="P\\Sprint 01", resolvedDate="2026-01-05T00:00:00Z", storyPoints=3),
            _item(iterationPath="P\\Sprint 02", resolvedDate="2026-01-09T00:00:00Z", storyPoints=5),
            _item(iterationPath="P\\Sprint 02", state="Active", resolvedDate="2026-01-20T00:00:00Z"),
        ]
    )

    summary = build_sprint_summary(parse_sprint_history_items(raw), exclude_latest=1).set_index("Sprint")

    assert summary.loc["Sprint 01", "Items Resolved"] == 2
    assert summary.loc["Sprint 01", "Story Points"] == 5
    assert summary.loc["Sprint 02", "Items Resolved"] == 1
    assert summary.loc["Sprint 02", "Recency Rank"] == 1
    assert summary.loc["Sprint 02", "In Sampling Pool"] == False  # noqa: E712
    assert summary.loc["Sprint 01", "In Sampling Pool"] == True  # noqa: E712


def test_parse_sprint_history_items_empty_list():
    with pytest.raises(DataValidationError) as exc:
        parse_sprint_history_items("[]")
    assert str(exc.value) == ADO_HISTORY_EMPTY == "The Azure DevOps sprint history has no work items."


@pytest.mark.parametrize(
    "raw",
    [
        "not json",
        "{}",
        "null",
        '"[]"',
        "[" * 100000 + "]" * 100000,
        json.dumps([5]),
        json.dumps([{}]),
        json.dumps([_without("state")]),
        json.dumps([_without("iterationPath")]),
        json.dumps([_without("resolvedDate")]),
        json.dumps([_without("storyPoints")]),
        json.dumps([_item(state=None)]),
        json.dumps([_item(iterationPath=3)]),
        json.dumps([_item(resolvedDate=20260409)]),
        json.dumps([_item(resolvedDate="")]),
        json.dumps([_item(resolvedDate="not a date")]),
        json.dumps([_item(resolvedDate="April 9 2026")]),
        json.dumps([_item(resolvedDate="0001-01-01T00:00:00Z")]),
        json.dumps([_item(storyPoints="3")]),
        json.dumps([_item(storyPoints=True)]),
        json.dumps([_item(storyPoints=[3])]),
        json.dumps([_item(), _item(storyPoints=float("nan"))]),
        json.dumps([_item(storyPoints=float("inf"))]),
        json.dumps([_item(storyPoints=10**400)]),
        json.dumps([_item(iterationPath="P\\S")]).replace("P\\\\S", "P\\\\S\\ud800"),
    ],
)
def test_parse_sprint_history_items_invalid(raw):
    with pytest.raises(DataValidationError) as exc:
        parse_sprint_history_items(raw)
    assert str(exc.value) == ADO_HISTORY_INVALID == "The Azure DevOps sprint history is invalid."
