"""End-to-end flow of the Monte Carlo Azure DevOps data source through the
full FastAPI app:

    POST /api/ado/sprint-history  (synthetic ADO behind an httpx.MockTransport)
      -> its `workItems` posted verbatim to POST /api/validate as `sprint_history_items`
      -> the validate response posted verbatim to POST /api/simulate

The real dependency chain is kept (`get_settings` -> `get_ado_http_client`, so
the host allowlist is applied); only `httpx.AsyncClient`'s transport is
swapped. The synthetic ADO project mirrors the canonical regression fixture
`notebook/Sprint_History.xlsx` row by row (plus items that must be ignored),
so the ADO path must give exactly the summary the Excel path gives.
No real network call is ever made.
"""

import base64
import json
import logging
import time

import httpx
import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from ado_fakes import CHANGED_DATE, CLOSED_DATE, FAKE_PAT, RESOLVED_DATE, STORY_POINTS, FakeAdo, work_item
from app.api import ado_routes
from app.config import get_settings
from app.main import app
from app.services import forecast
from conftest import FIXTURE_PATH

PROJECT = "DSM-Firmenich"
CLOUD_URL = "https://dev.azure.com/contoso/DSM-Firmenich"
PAT_B64 = base64.b64encode(f":{FAKE_PAT}".encode()).decode()
RealAsyncClient = httpx.AsyncClient
RealDefaultRng = np.random.default_rng


def _iteration_nodes() -> dict:
    """Area root only; Iteration root with Sprint 01..24 (the fixture's sprints) and an empty Backlog."""
    iteration = f"\\{PROJECT}\\Iteration"
    sprints = [
        {"id": 100 + n, "name": f"Sprint {n:02d}", "structureType": "iteration", "path": f"{iteration}\\Sprint {n:02d}"}
        for n in range(1, 25)
    ]
    sprints.append({"id": 200, "name": "Backlog", "structureType": "iteration", "path": f"{iteration}\\Backlog"})
    return {
        "count": 2,
        "value": [
            {"id": 1, "name": PROJECT, "structureType": "area", "path": f"\\{PROJECT}\\Area"},
            {"id": 2, "name": PROJECT, "structureType": "iteration", "path": iteration, "hasChildren": True, "children": sprints},
        ],
    }


def _fixture_rows() -> list[dict]:
    return pd.read_excel(FIXTURE_PATH).to_dict(orient="records")


def _fixture_work_items() -> list[dict]:
    """Every fixture row as an ADO work item. The resolved date is spread over
    the three date fields the server falls back through (ResolvedDate ->
    ClosedDate -> ChangedDate) so all three paths feed the same summary;
    missing story points leave the field unset (as ADO does)."""
    items = []
    for index, row in enumerate(_fixture_rows()):
        when = row["Resolved Date"].strftime("%Y-%m-%dT%H:%M:%S") + ".000Z"
        dates = [
            {RESOLVED_DATE: when, CHANGED_DATE: "2026-01-01T00:00:00Z"},
            {CLOSED_DATE: when, CHANGED_DATE: "2026-01-01T00:00:00Z"},
            {CHANGED_DATE: when},
        ][index % 3]
        extra = dict(dates)
        if not pd.isna(row["Story Points"]):
            extra[STORY_POINTS] = float(row["Story Points"])
        sprint = row["Iteration Path"].split("\\", 1)[1]
        items.append(
            work_item(
                int(row["ID"]), row["Work Item Type"], row["Title"], "", state=row["State"], iteration=sprint, project=PROJECT, extra=extra
            )
        )
    return items


def _noise_items() -> list[dict]:
    """Items that must never count: wrong type, wrong state (incl. a
    case variant, since the rule is case-sensitive) — all in fixture sprints
    and resolved recently, so any leak would change the summary."""
    late = {RESOLVED_DATE: "2025-12-31T23:00:00Z", STORY_POINTS: 13.0}
    return [
        work_item(900001, "Feature", "A feature", "", state="Done", iteration="Sprint 24", project=PROJECT, extra=late),
        work_item(900002, "Task", "A task", "", state="Closed", iteration="Sprint 24", project=PROJECT, extra=late),
        work_item(900003, "Epic", "An epic", "", state="Resolved", iteration="Sprint 01", project=PROJECT, extra=late),
        work_item(900004, "User Story", "Active story", "", state="Active", iteration="Sprint 24", project=PROJECT, extra=late),
        work_item(900005, "Bug", "Removed bug", "", state="Removed", iteration="Sprint 23", project=PROJECT, extra=late),
        work_item(900006, "User Story", "New story", "", state="New", iteration="Sprint 02", project=PROJECT, extra=late),
        work_item(900007, "Bug", "Lower-case state", "", state="done", iteration="Sprint 05", project=PROJECT, extra=late),
        # Resolved, but with no date at all: dropped by the server.
        work_item(900008, "User Story", "Undated", "", state="Resolved", iteration="Sprint 03", project=PROJECT, extra={STORY_POINTS: 5.0}),
    ]


class TransportPatch:
    """Replaces `httpx.AsyncClient` in ado_routes so the real
    `get_ado_http_client` builds a client on a MockTransport serving `handler`."""

    def __init__(self, handler):
        self.handler = handler
        self.clients: list[httpx.AsyncClient] = []

    def __call__(self, **kwargs):
        client = RealAsyncClient(transport=httpx.MockTransport(self.handler), **kwargs)
        self.clients.append(client)
        return client


@pytest.fixture()
def fake():
    return FakeAdo(project_name=PROJECT, nodes=_iteration_nodes(), work_items=_fixture_work_items() + _noise_items())


@pytest.fixture()
def client(monkeypatch, fake):
    for key in ("ADO_ALLOWED_HOSTS", "ADO_TIMEOUT_SECONDS"):
        monkeypatch.delenv(key, raising=False)
    get_settings.cache_clear()
    patch = TransportPatch(fake)
    monkeypatch.setattr(ado_routes.httpx, "AsyncClient", patch)
    app.dependency_overrides.clear()
    yield TestClient(app)
    get_settings.cache_clear()
    assert all(c.is_closed for c in patch.clients)


def _history_body(**overrides) -> dict:
    body = {"source": "cloud", "projectUrl": CLOUD_URL, "pat": FAKE_PAT, "iterationPath": PROJECT.lower()}
    body.update(overrides)
    return body


def _form(**overrides) -> dict:
    form = {
        "target_type": "Items Resolved",
        "target_value": "5",
        "num_simulations": "1000",
        "exclude_latest_sprints": "1",
        "sprint_start_date": "2026-07-11",
        "sprint_length": "10",
        "team_capacity_factor": "",
    }
    form.update(overrides)
    return form


def _validate_items(client: TestClient, work_items, **overrides) -> httpx.Response:
    # Multipart like the browser (FormData, no file part).
    return client.post("/api/validate", data=_form(sprint_history_items=json.dumps(work_items), **overrides), files={"_": (None, "")})


def _validate_excel(client: TestClient, **overrides) -> httpx.Response:
    return client.post(
        "/api/validate",
        data=_form(**overrides),
        files={"sprint_history_file": ("Sprint_History.xlsx", FIXTURE_PATH.read_bytes())},
    )


def _load_history(client: TestClient, **overrides) -> dict:
    response = client.post("/api/ado/sprint-history", json=_history_body(**overrides))
    assert response.status_code == 200, response.text
    return response.json()


# --- the end-to-end flow ------------------------------------------------------------


def test_ado_history_validate_simulate_matches_the_excel_path(client, fake, monkeypatch):
    history = _load_history(client)

    # Fetch: only the fixture's User Stories/Bugs come back, in ascending id, root path in the tree's spelling.
    fixture_ids = sorted(int(row["ID"]) for row in _fixture_rows())
    assert [item["id"] for item in history["workItems"]] == fixture_ids
    assert {item["type"] for item in history["workItems"]} == {"User Story", "Bug"}
    assert {item["state"] for item in history["workItems"]} == {"Resolved"}
    assert history["iterationPath"] == PROJECT
    assert history["warnings"] == []
    assert history["project"]["name"] == PROJECT

    # Validate: the response is identical to the one for the Excel upload.
    ado_validated = _validate_items(client, history["workItems"])
    excel_validated = _validate_excel(client)
    assert ado_validated.status_code == excel_validated.status_code == 200, ado_validated.text
    assert ado_validated.json() == excel_validated.json()
    by_sprint = {record["Sprint"]: record for record in ado_validated.json()["summary"]}
    assert len(by_sprint) == 24
    assert by_sprint["Sprint 24"]["In Sampling Pool"] is False
    assert sum(record["In Sampling Pool"] for record in by_sprint.values()) == 23
    assert sum(record["Items Resolved"] for record in by_sprint.values()) == len(fixture_ids)

    # Simulate: the validate response is posted verbatim; same seed, same result as the Excel path.
    monkeypatch.setattr(forecast.np.random, "default_rng", lambda *a: RealDefaultRng(1234))
    ado_result = client.post("/api/simulate", json=ado_validated.json())
    excel_result = client.post("/api/simulate", json=excel_validated.json())
    assert ado_result.status_code == excel_result.status_code == 200
    assert ado_result.json() == excel_result.json()
    assert [row["confidence"] for row in ado_result.json()["rows"]] == [50, 70, 85, 95]
    assert sum(ado_result.json()["histogram"]["counts"]) == 1000


@pytest.mark.parametrize("target_type", ["Items Resolved", "Story Points"])
def test_story_points_and_item_targets_match_the_excel_path(client, target_type):
    history = _load_history(client)
    ado = _validate_items(client, history["workItems"], target_type=target_type, exclude_latest_sprints="3")
    excel = _validate_excel(client, target_type=target_type, exclude_latest_sprints="3")
    assert ado.status_code == 200, ado.text
    assert ado.json() == excel.json()
    assert sum(not record["In Sampling Pool"] for record in ado.json()["summary"]) == 3


def test_server_refilters_when_ado_returns_more_than_the_query_asked_for(fake, client):
    """ADO's WIQL is trusted only so far: even if every stored id comes back,
    the response (and so the summary) holds only Resolved/Done/Closed User Stories/Bugs."""
    fake.wiql_ids = [item["id"] for item in fake.work_items]
    history = _load_history(client)
    returned = {item["id"] for item in history["workItems"]}
    assert returned == {int(row["ID"]) for row in _fixture_rows()}
    assert not returned & {item["id"] for item in _noise_items()}

    ado = _validate_items(client, history["workItems"])
    assert ado.json() == _validate_excel(client).json()


def test_wiql_asks_only_for_user_stories_and_bugs_in_completed_states_under_the_path(client, fake):
    _load_history(client, iterationPath=f"{PROJECT}\\sprint 07")
    (query,) = fake.wiql_queries()
    assert "[System.WorkItemType] IN ('User Story','Bug')" in query
    assert "[System.State] IN ('Resolved','Done','Closed')" in query
    assert f"[System.IterationPath] UNDER '{PROJECT}\\Sprint 07'" in query


def test_sub_path_selection_gives_one_sprint_and_simulates(client):
    history = _load_history(client, iterationPath=f"{PROJECT}\\Sprint 07")
    assert history["iterationPath"] == f"{PROJECT}\\Sprint 07"
    assert {item["iterationPath"] for item in history["workItems"]} == {f"{PROJECT}\\Sprint 07"}

    validated = _validate_items(client, history["workItems"], exclude_latest_sprints="0")
    assert validated.status_code == 200, validated.text
    summary = validated.json()["summary"]
    assert [record["Sprint"] for record in summary] == ["Sprint 07"]
    assert summary[0]["Items Resolved"] == len(history["workItems"])

    simulated = client.post("/api/simulate", json=validated.json())
    assert simulated.status_code == 200


def test_empty_sprint_path_is_a_422_and_never_reaches_validate(client):
    response = client.post("/api/ado/sprint-history", json=_history_body(iterationPath=f"{PROJECT}\\Backlog"))
    assert response.status_code == 422
    assert response.json() == {"errors": [f"No resolved User Stories or Bugs were found under Iteration path: {PROJECT}\\Backlog."]}


def test_excluding_every_sampled_sprint_is_a_simulate_error_not_a_crash(client):
    history = _load_history(client)
    validated = _validate_items(client, history["workItems"], exclude_latest_sprints="24")
    assert validated.status_code == 200
    simulated = client.post("/api/simulate", json=validated.json())
    assert simulated.status_code == 422
    assert list(simulated.json()) == ["errors"]
    assert len(simulated.json()["errors"]) == 1


def test_missing_story_points_field_warns_and_story_point_target_still_validates(client, fake):
    fake.missing_fields = {STORY_POINTS}
    # The batch would refuse a missing field, so the server must not request it.
    history = _load_history(client)
    assert history["warnings"] == [
        "The field Microsoft.VSTS.Scheduling.StoryPoints does not exist in this project; story points are 0."
    ]
    assert {item["storyPoints"] for item in history["workItems"]} == {0}
    validated = _validate_items(client, history["workItems"], target_type="Story Points")
    assert validated.status_code == 200
    assert {record["Story Points"] for record in validated.json()["summary"]} == {0}


def test_disallowed_host_is_refused_before_any_request(client, fake, monkeypatch):
    monkeypatch.setenv("ADO_ALLOWED_HOSTS", "tfs.example.com")
    get_settings.cache_clear()
    response = client.post("/api/ado/sprint-history", json=_history_body())
    assert response.status_code == 422
    assert response.json() == {"errors": ["This Azure DevOps host is not allowed: dev.azure.com."]}
    assert fake.requests == []


def test_pat_is_only_sent_as_basic_auth_and_never_echoed_or_logged(client, fake, caplog):
    caplog.set_level(logging.DEBUG)
    ok = client.post("/api/ado/sprint-history", json=_history_body())
    fake.failures = {"batch": "500"}
    failed = client.post("/api/ado/sprint-history", json=_history_body())
    assert ok.status_code == 200 and failed.status_code == 422
    for response in (ok, failed):
        assert FAKE_PAT not in response.text and PAT_B64 not in response.text
    assert FAKE_PAT not in caplog.text and PAT_B64 not in caplog.text
    assert {r.headers["Authorization"] for r in fake.requests} == {f"Basic {PAT_B64}"}
    for request in fake.requests:
        assert FAKE_PAT not in str(request.url)
        assert FAKE_PAT not in request.content.decode("utf-8", "replace")


def test_validate_and_simulate_stay_within_the_performance_budget(client):
    history = _load_history(client)
    validated = _validate_items(client, history["workItems"], num_simulations="5000")
    assert validated.status_code == 200

    start = time.perf_counter()
    response = client.post("/api/simulate", json=validated.json())
    elapsed = time.perf_counter() - start
    assert response.status_code == 200
    assert elapsed < 5.0, f"/api/simulate took {elapsed:.2f}s for 5000 simulations (limit 5s)"
