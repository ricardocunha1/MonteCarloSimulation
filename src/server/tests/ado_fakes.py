"""Synthetic Azure DevOps for tests: an `httpx.MockTransport` handler serving
canned `projects` / `classificationnodes` / `fields` / `wiql` /
`workitemsbatch` responses and error responses, and recording every request.
No real ADO data and no network."""

import json
import re
from collections.abc import Callable
from functools import partial
from urllib.parse import unquote

import httpx

PROJECT_ID = "00000000-0000-4000-8000-000000000001"
PROJECT_NAME = "Fabrikam Plant"
FAKE_PAT = "fake-pat-0123456789abcdef"


def classification_nodes(project: str = PROJECT_NAME) -> dict:
    """Area root with a nested team, Iteration root with dated and undated sprints."""
    area = f"\\{project}\\Area"
    iteration = f"\\{project}\\Iteration"
    return {
        "count": 2,
        "value": [
            {
                "id": 1,
                "name": project,
                "structureType": "area",
                "path": area,
                "hasChildren": True,
                "children": [
                    {
                        "id": 2,
                        "name": "Team A",
                        "structureType": "area",
                        "path": f"{area}\\Team A",
                        "children": [
                            {"id": 3, "name": "Squad 1", "structureType": "area", "path": f"{area}\\Team A\\Squad 1"}
                        ],
                    },
                    {"id": 4, "name": "Team B", "structureType": "area", "path": f"{area}\\Team B"},
                ],
            },
            {
                "id": 10,
                "name": project,
                "structureType": "iteration",
                "path": iteration,
                "hasChildren": True,
                "children": [
                    {
                        "id": 11,
                        "name": "Phase 1",
                        "structureType": "iteration",
                        "path": f"{iteration}\\Phase 1",
                        "attributes": {"startDate": "2026-10-01T00:00:00Z", "finishDate": "2026-11-30T00:00:00Z"},
                        "children": [
                            {
                                "id": 12,
                                "name": "Sprint 02",
                                "structureType": "iteration",
                                "path": f"{iteration}\\Phase 1\\Sprint 02",
                                "attributes": {"finishDate": "2026-11-13T00:00:00Z"},
                            },
                            {
                                "id": 13,
                                "name": "Sprint 01",
                                "structureType": "iteration",
                                "path": f"{iteration}\\Phase 1\\Sprint 01",
                                "attributes": {"startDate": "2026-10-19T00:00:00Z", "finishDate": "2026-10-30T00:00:00Z"},
                            },
                        ],
                    },
                    {"id": 14, "name": "Backlog", "structureType": "iteration", "path": f"{iteration}\\Backlog"},
                ],
            },
        ],
    }


def error_response(kind: str, request: httpx.Request) -> httpx.Response:
    """A canned failure: "401", "403", "203" (HTML sign-in page), "302",
    "404", "500" (JSON message), "502" (plain text), "non_json" (200 HTML),
    "timeout" and "connect" (raise the matching httpx transport error)."""
    if kind == "timeout":
        raise httpx.ReadTimeout("timed out", request=request)
    if kind == "connect":
        raise httpx.ConnectError("connection refused", request=request)
    html = "<html><body>Sign in</body></html>"
    responses = {
        "401": lambda: httpx.Response(401, text=""),
        "403": lambda: httpx.Response(403, json={"message": "Access denied."}),
        "203": lambda: httpx.Response(203, html=html),
        "302": lambda: httpx.Response(302, headers={"Location": "https://login.example.invalid/"}),
        "404": lambda: httpx.Response(404, json={"message": "TF200016: The following project does not exist."}),
        "500": lambda: httpx.Response(500, json={"message": "Something broke on the server."}),
        "502": lambda: httpx.Response(502, text="Bad gateway"),
        "non_json": lambda: httpx.Response(200, html=html),
    }
    return responses[kind]()


def work_item(
    item_id: int,
    item_type: str,
    title: str,
    area: str,
    *,
    parent: int | None = None,
    state: str = "New",
    iteration: str = "",
    description: str | None = None,
    size: str | None = None,
    project: str = PROJECT_NAME,
    extra: dict | None = None,
) -> dict:
    """A synthetic work item as stored by FakeAdo: `area` / `iteration` are
    relative to the project root ("" = the root); `extra` adds raw fields."""
    fields = {
        "System.Id": item_id,
        "System.WorkItemType": item_type,
        "System.Title": title,
        "System.State": state,
        "System.AreaPath": "\\".join(filter(None, [project, area])),
        "System.IterationPath": "\\".join(filter(None, [project, iteration])),
    }
    if parent is not None:
        fields["System.Parent"] = parent
    if description is not None:
        fields["System.Description"] = description
    if size is not None:
        fields["Custom.EstimatedSize"] = size
    fields.update(extra or {})
    return {"id": item_id, "fields": fields}


def synthetic_backlog(project: str = PROJECT_NAME) -> list[dict]:
    """Scope "Team A" holds Epic 101 and Features 102-105 (+ Removed 106):
    102 under 101, 103 under the out-of-scope Epic 201 (Team B), 104 without a
    parent, 105 under the User Story 301. 202 is a Team B Feature."""
    w = partial(work_item, project=project)
    return [
        w(101, "Epic", "Platform", "Team A", state="Active", description="<p>Platform epic</p>"),
        w(102, "Feature", "Login", "Team A\\Squad 1", parent=101, iteration="Phase 1\\Sprint 02", size=" m "),
        w(103, "Feature", "Reports", "Team A", parent=201, iteration="Phase 1\\Sprint 01", size="L", state="Active"),
        w(104, "Feature", "Orphan", "Team A"),
        w(105, "Feature", "Story child", "Team A", parent=301, size="xs"),
        w(106, "Feature", "Dropped", "Team A", parent=101, state="Removed"),
        w(201, "Epic", "Analytics", "Team B", state="Closed", description="<b>Out of scope</b>"),
        w(202, "Feature", "Dashboards", "Team B", parent=201),
        w(301, "User Story", "A story", "Team A", parent=101),
    ]


STORY_POINTS = "Microsoft.VSTS.Scheduling.StoryPoints"
RESOLVED_DATE = "Microsoft.VSTS.Common.ResolvedDate"
CLOSED_DATE = "Microsoft.VSTS.Common.ClosedDate"
CHANGED_DATE = "System.ChangedDate"


def history_item(
    item_id: int,
    item_type: str,
    state: str,
    iteration: str,
    *,
    points: object = None,
    resolved: str | None = None,
    closed: str | None = None,
    changed: str | None = "2026-10-20T08:00:00Z",
    project: str = PROJECT_NAME,
) -> dict:
    """A synthetic Monte Carlo sprint history item (see `work_item`); None
    leaves the story points / date field unset."""
    extra = {STORY_POINTS: points, RESOLVED_DATE: resolved, CLOSED_DATE: closed, CHANGED_DATE: changed}
    return work_item(
        item_id,
        item_type,
        f"Item {item_id}",
        "Team A",
        state=state,
        iteration=iteration,
        project=project,
        extra={name: value for name, value in extra.items() if value is not None},
    )


def synthetic_sprint_history(project: str = PROJECT_NAME) -> list[dict]:
    """Under "Phase 1": Sprint 01 holds 501 (Resolved story, 3 points), 502
    (Closed bug, no points, only a closed date) and 503 (Active, not
    resolved); Sprint 02 holds 504 (Done story, 2.5 points, only a changed
    date, offset) and 505 (a Done Feature). 506 is a Resolved story in
    Backlog (outside Phase 1)."""
    h = partial(history_item, project=project)
    return [
        h(501, "User Story", "Resolved", "Phase 1\\Sprint 01", points=3, resolved="2026-10-28T10:47:08.1234567Z"),
        h(502, "Bug", "Closed", "Phase 1\\Sprint 01", closed="2026-10-29T09:00:00Z"),
        h(503, "User Story", "Active", "Phase 1\\Sprint 01", points=5),
        h(504, "User Story", "Done", "Phase 1\\Sprint 02", points=2.5, changed="2026-11-12T01:30:00+02:00"),
        h(505, "Feature", "Done", "Phase 1\\Sprint 02", points=8, resolved="2026-11-12T10:00:00Z"),
        h(506, "User Story", "Resolved", "Backlog", points=1, resolved="2026-10-01T10:00:00Z"),
    ]


_UNDER = re.compile(r"\[(System\.AreaPath|System\.IterationPath)\] UNDER '((?:[^']|'')*)'")
_TYPES = re.compile(r"\[System\.WorkItemType\] IN \(([^)]*)\)")
_STATES = re.compile(r"\[System\.State\] IN \(([^)]*)\)")
_FIELD_REF = re.compile(r"/_apis/wit/fields/([^/]+)$")


class FakeAdo:
    """Callable MockTransport handler.

    Args:
        project_name: the canonical project name (matched case-insensitively,
            like ADO does).
        nodes: the classificationnodes payload (default `classification_nodes()`).
        failures: endpoint ("projects" | "nodes" | "fields" | "wiql" | "batch"
            | "any") → `error_response` kind.
        work_items: the stored work items (default `synthetic_backlog()`).
        size_field: whether `Custom.EstimatedSize` exists (fields endpoint
            answers 404 and the batch refuses the field when it doesn't).
        missing_fields: other field reference names that don't exist (same
            behavior as a missing size field).
        wiql_ids: ids the WIQL returns regardless of the query; by default the
            query is evaluated over `work_items`: its `UNDER` clause, its
            `[System.WorkItemType] IN (…)` list and its `[System.State] IN
            (…)` list (without one, "not Removed"), ascending id.
    """

    def __init__(
        self,
        project_name: str = PROJECT_NAME,
        nodes: dict | None = None,
        failures: dict[str, str] | None = None,
        work_items: list[dict] | None = None,
        size_field: bool = True,
        wiql_ids: list[int] | None = None,
        missing_fields: set[str] | None = None,
    ):
        self.project_name = project_name
        self.nodes = classification_nodes(project_name) if nodes is None else nodes
        self.failures = failures or {}
        self.work_items = synthetic_backlog(project_name) if work_items is None else work_items
        self.size_field = size_field
        self.missing_fields = set(missing_fields or ())
        self.wiql_ids = wiql_ids
        self.requests: list[httpx.Request] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        endpoint = self._endpoint(request.url.path)
        failure = self.failures.get(endpoint) or self.failures.get("any")
        if failure:
            return error_response(failure, request)
        if endpoint == "projects":
            requested = unquote(request.url.path.rsplit("/", 1)[-1])
            if requested.lower() != self.project_name.lower():
                return error_response("404", request)
            return httpx.Response(200, json={"id": PROJECT_ID, "name": self.project_name, "state": "wellFormed"})
        if endpoint == "nodes":
            return httpx.Response(200, json=self.nodes)
        if endpoint == "fields":
            reference = unquote(_FIELD_REF.search(request.url.path).group(1))
            if reference in self._missing():
                return httpx.Response(404, json={"message": f"TF51535: Cannot find field {reference}."})
            return httpx.Response(200, json={"referenceName": reference, "type": "string"})
        if endpoint == "wiql":
            return httpx.Response(200, json=self._wiql(json.loads(request.content)["query"]))
        if endpoint == "batch":
            return self._batch(json.loads(request.content))
        return httpx.Response(404, json={"message": "Unknown fake endpoint."})

    # --- request inspection helpers ---------------------------------------------

    def requests_to(self, endpoint: str) -> list[httpx.Request]:
        return [r for r in self.requests if self._endpoint(r.url.path) == endpoint]

    def batch_bodies(self) -> list[dict]:
        return [json.loads(r.content) for r in self.requests_to("batch")]

    def wiql_queries(self) -> list[str]:
        return [json.loads(r.content)["query"] for r in self.requests_to("wiql")]

    # --- endpoints -----------------------------------------------------------------

    def _wiql(self, query: str) -> dict:
        if self.wiql_ids is not None:
            ids = self.wiql_ids
        else:
            match = _UNDER.search(query)
            field, path = match.group(1), match.group(2).replace("''", "'").lower()
            types = _quoted_list(_TYPES.search(query).group(1))
            states = _STATES.search(query)
            ids = sorted(
                item["id"]
                for item in self.work_items
                if item["fields"]["System.WorkItemType"] in types
                and (
                    item["fields"]["System.State"] in _quoted_list(states.group(1))
                    if states
                    else item["fields"]["System.State"] != "Removed"
                )
                and _under(item["fields"][field].lower(), path)
            )
        return {"queryType": "flat", "workItems": [{"id": i, "url": f"https://fake/{i}"} for i in ids]}

    def _batch(self, body: dict) -> httpx.Response:
        ids, fields = body["ids"], body["fields"]
        if len(ids) > 200:
            return httpx.Response(400, json={"message": "VS403474: at most 200 ids."})
        refused = sorted(self._missing().intersection(fields))
        if refused:
            return httpx.Response(400, json={"message": f"TF51535: Cannot find field {refused[0]}."})
        stored = {item["id"]: item for item in self.work_items}
        value = []
        for item_id in ids:
            item = stored.get(item_id)
            if item is None:
                value.append(None)  # errorPolicy "omit"
                continue
            selected = {name: item["fields"][name] for name in fields if name in item["fields"]}
            value.append({"id": item_id, "rev": 1, "fields": selected})
        return httpx.Response(200, json={"count": len(value), "value": value})

    def _missing(self) -> set[str]:
        """Read on every request, since tests may flip `size_field` after construction."""
        return self.missing_fields | (set() if self.size_field else {"Custom.EstimatedSize"})

    @staticmethod
    def _endpoint(path: str) -> str:
        if "/_apis/projects/" in path:
            return "projects"
        if path.endswith("/_apis/wit/classificationnodes"):
            return "nodes"
        if "/_apis/wit/fields/" in path:
            return "fields"
        if path.endswith("/_apis/wit/wiql"):
            return "wiql"
        if path.endswith("/_apis/wit/workitemsbatch"):
            return "batch"
        return "other"


def _quoted_list(text: str) -> list[str]:
    """`'A','B'` → ["A", "B"]."""
    return [part.strip().strip("'") for part in text.split(",")]


def _under(path: str, scope: str) -> bool:
    return path == scope or path.startswith(scope + "\\")


def mock_http_client(handler: Callable[[httpx.Request], httpx.Response]) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))
