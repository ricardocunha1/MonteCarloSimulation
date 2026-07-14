import json
import re
from pathlib import Path

import pytest

from src.app import create_app
from src.app.services.data_processing import (
    build_sprint_summary,
    parse_sprint_history,
    summary_to_records,
)

FIXTURE_PATH = Path(__file__).resolve().parent.parent / "notebook" / "Sprint_History.xlsx"


@pytest.fixture()
def client():
    app = create_app()
    app.testing = True
    return app.test_client()


def _confirm_payload(**param_overrides):
    with FIXTURE_PATH.open("rb") as f:
        df = parse_sprint_history(f)
    summary = build_sprint_summary(df, exclude_latest=1)

    params = {
        "target_type": "Items Resolved",
        "target_value": "5",
        "num_simulations": "1000",
        "sprint_start_date": "2026-07-11",
        "sprint_length": "10",
    }
    params.update(param_overrides)

    return json.dumps(
        {
            "summary": summary_to_records(summary),
            "params": params,
        }
    )


def test_execute_runs_simulation_from_confirm_payload(client):
    response = client.post("/execute", data={"payload": _confirm_payload()})

    assert response.status_code == 200
    assert b"Distribution of Simulated Outcomes" in response.data
    assert b"P50" in response.data
    assert b"P95" in response.data


def test_team_capacity_factor_scales_items_resolved_before_simulating(client):
    # The fixture's sampling pool has a minimum of 2 "Items Resolved" per
    # sprint; scaling by a factor of 10 guarantees every single draw clears
    # a target of 5, so every simulated run hits the target in sprint 1
    # regardless of which sprints get sampled.
    response = client.post(
        "/execute",
        data={"payload": _confirm_payload(team_capacity_factor="10")},
    )
    body = response.data.decode()

    assert response.status_code == 200
    match = re.search(r"const chartData = (\{.*?\});", body, re.DOTALL)
    assert match is not None
    chart_data = json.loads(match.group(1))

    assert chart_data["counts"][0] == 1000  # sprint 1 bucket
    assert sum(chart_data["counts"][1:]) == 0


def test_execute_renders_histogram_chart_data(client):
    response = client.post("/execute", data={"payload": _confirm_payload()})
    body = response.data.decode()

    assert 'id="histogram"' in body
    assert "Plotly.newPlot" in body

    match = re.search(r"const chartData = (\{.*?\});", body, re.DOTALL)
    assert match is not None
    chart_data = json.loads(match.group(1))

    assert len(chart_data["labels"]) == 51  # sprints 1..50 plus a ">50" bucket
    assert len(chart_data["counts"]) == 51
    assert sum(chart_data["counts"]) == 1000  # matches num_simulations
    assert {marker["label"] for marker in chart_data["markers"]} == {
        "P50",
        "P70",
        "P85",
        "P95",
    }
