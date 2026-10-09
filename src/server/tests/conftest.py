from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.data_processing import (
    build_sprint_summary,
    parse_sprint_history,
    summary_to_records,
)

FIXTURE_PATH = Path(__file__).resolve().parents[3] / "notebook" / "Sprint_History.xlsx"


@pytest.fixture()
def client():
    return TestClient(app)


@pytest.fixture()
def fixture_summary_records():
    with FIXTURE_PATH.open("rb") as f:
        df = parse_sprint_history(f)
    return summary_to_records(build_sprint_summary(df, exclude_latest=1))
