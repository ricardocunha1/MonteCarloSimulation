import html
import io
import json
import re
import time
from pathlib import Path

import pytest

from src.app import create_app
from src.app.services.data_processing import (
    build_sprint_summary,
    parse_sprint_history,
    summary_to_records,
)

FIXTURE_PATH = Path(__file__).resolve().parent.parent / "notebook" / "Sprint_History.xlsx"

ROW_PATTERN = re.compile(
    r'P(\d+) - [^<]*</p>\s*<p[^>]*>\s*(.*?)\s*<span class="text-sm font-normal text-slate-400">sprints</span>\s*</p>\s*<p[^>]*>\s*(.*?)\s*</p>',
    re.DOTALL,
)


@pytest.fixture()
def client():
    app = create_app()
    app.testing = True
    return app.test_client()


def _acceptance_form(**overrides):
    form = {
        "target_type": "Items Resolved",
        "target_value": "5",
        "num_simulations": "1000",
        "exclude_latest_sprints": "1",
        "sprint_start_date": "2026-07-11",
        "sprint_length": "10",
    }
    form.update(overrides)
    form["sprint_history_file"] = (io.BytesIO(FIXTURE_PATH.read_bytes()), "Sprint_History.xlsx")
    return form


def _extract_payload(confirm_body: str) -> str:
    match = re.search(r'name="payload" value="(.*?)">', confirm_body, re.DOTALL)
    assert match is not None, "confirm page did not contain the hidden payload field"
    return html.unescape(match.group(1))


def _parse_result_rows(results_body: str) -> list[dict]:
    rows = []
    for confidence, sprints_text, completion_text in ROW_PATTERN.findall(results_body):
        exceeds_window = sprints_text.startswith("&gt;")
        rows.append(
            {
                "confidence": int(confidence),
                "sprints": 51 if exceeds_window else int(sprints_text),
                "completion_text": completion_text,
            }
        )
    return rows


def test_readme_acceptance_scenario_end_to_end(client):
    confirm_response = client.post(
        "/validate", data=_acceptance_form(), content_type="multipart/form-data"
    )
    assert confirm_response.status_code == 200
    confirm_body = confirm_response.data.decode()

    assert "border-red-700" not in confirm_body

    sprint_24_row = re.search(r"<tr[^>]*>(.*?Sprint 24.*?)</tr>", confirm_body, re.DOTALL)
    assert sprint_24_row is not None, "Sprint 24 row not found on confirm page"
    assert '<td class="px-4 py-2">No</td>' in sprint_24_row.group(1)

    payload = _extract_payload(confirm_body)
    results_response = client.post("/execute", data={"payload": payload})
    assert results_response.status_code == 200
    results_body = results_response.data.decode()

    assert "border-red-700" not in results_body
    assert "Distribution of Simulated Outcomes" in results_body

    rows = _parse_result_rows(results_body)
    assert [row["confidence"] for row in rows] == [50, 70, 85, 95]

    sprint_counts = [row["sprints"] for row in rows]
    assert sprint_counts == sorted(sprint_counts)

    for row in rows:
        if row["sprints"] > 50:
            assert row["completion_text"] == "Not reached within window"
        else:
            assert re.match(r"^\d{4}-\d{2}-\d{2}$", row["completion_text"])


def _confirm_payload(num_simulations: int) -> str:
    with FIXTURE_PATH.open("rb") as f:
        df = parse_sprint_history(f)
    summary = build_sprint_summary(df, exclude_latest=1)

    return json.dumps(
        {
            "summary": summary_to_records(summary),
            "params": {
                "target_type": "Items Resolved",
                "target_value": "5",
                "num_simulations": str(num_simulations),
                "sprint_start_date": "2026-07-11",
                "sprint_length": "10",
            },
        }
    )


def test_execute_performance_1000_simulations(client):
    start = time.perf_counter()
    response = client.post("/execute", data={"payload": _confirm_payload(1000)})
    elapsed = time.perf_counter() - start

    assert response.status_code == 200
    assert elapsed < 2.0, f"/execute took {elapsed:.2f}s for 1000 simulations (limit 2s)"


def test_execute_performance_5000_simulations(client):
    start = time.perf_counter()
    response = client.post("/execute", data={"payload": _confirm_payload(5000)})
    elapsed = time.perf_counter() - start

    assert response.status_code == 200
    assert elapsed < 5.0, f"/execute took {elapsed:.2f}s for 5000 simulations (limit 5s)"
