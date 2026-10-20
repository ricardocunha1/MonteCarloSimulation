from pathlib import Path

import pandas as pd
import pytest

from app.services.data_processing import (
    DataValidationError,
    build_sprint_summary,
    parse_sprint_history,
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
